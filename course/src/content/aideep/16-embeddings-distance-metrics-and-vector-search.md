---
track: aideep
title: "Deep dive 16: embeddings, distance metrics and vector search"
short: Embeddings and vector search
sub: What an embedding is, why cosine, dot product and Euclidean distance rank differently, and how vector databases search millions of vectors without scanning them all.
---

:::goals
- explain what an embedding is and what "close" means for vectors
- show that dot product, cosine and Euclidean distance can rank the same items differently, and when they agree
- explain approximate nearest neighbour (ANN) search and the speed versus recall trade-off
- choose between a vector library, a vector database and "add vectors to the database I already have"
:::

@widget viz_rag

:::note Already covered elsewhere
Chunking, BM25, a first vector search and recall@k are in [Deep dive 6](#aideep-6). The transformer that produces embeddings is in [Deep dive 2](#aideep-2). This lesson is about the vector part itself: the distance maths and the index.
:::

## 1. What an embedding is

An **embedding** is a list of numbers (a vector) that a model produces for a piece of text, an image or anything else, so that **similar meaning gives nearby vectors**. A real text embedding has hundreds or thousands of numbers (384, 768, 1536, 3072 are common). The numbers have no human meaning one by one; only the distances between vectors matter.

Everything in vector search comes down to one operation: *given a query vector, find the stored vectors that are closest to it.* "Closest" needs a definition, and there are three common ones.

## 2. Three ways to measure "close"

- **Dot product**: multiply matching numbers and add. Large when vectors point the same way **and** are long.
- **Cosine similarity**: the dot product divided by both lengths. It measures only the **angle**, so length does not matter. Between -1 and 1.
- **Euclidean distance** (L2): the straight-line distance between the two points. Small means close.

Here are all three on a tiny made-up example with four dimensions (animal, royalty, food, size). The vectors are invented so you can see the effect; real embeddings come from a model.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > metrics.py <<'EOF'
import math
# Toy 4-dimensional "embeddings": [animal, royalty, food, size]. Real ones have 384-3072 numbers, learned by a model.
V = {
  "cat":      [0.9, 0.0, 0.1, 0.2],
  "kitten":   [0.8, 0.0, 0.1, 0.1],
  "lion":     [0.9, 0.5, 0.0, 0.8],
  "king":     [0.1, 0.9, 0.0, 0.5],
  "pizza":    [0.0, 0.0, 0.9, 0.3],
  "elephant": [1.0, 0.0, 0.0, 1.0],   # long vector: it will win the dot product
}
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def norm(a): return math.sqrt(dot(a, a))
def cosine(a, b): return dot(a, b) / (norm(a) * norm(b))
def euclid(a, b): return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))
def unit(a): n = norm(a); return [x / n for x in a]

q = V["cat"]
print("raw vectors, query = cat (higher dot/cosine = closer, lower euclid = closer)")
print(f"{'word':9} {'dot':>6} {'cosine':>7} {'euclid':>7}   length")
for w, v in V.items():
    if w == "cat": continue
    print(f"{w:9} {dot(q, v):6.3f} {cosine(q, v):7.3f} {euclid(q, v):7.3f}   {norm(v):.2f}")
by = lambda f, rev: [w for w, _ in sorted(((w, f(q, v)) for w, v in V.items() if w != "cat"), key=lambda t: t[1], reverse=rev)]
print("\nranking by dot     :", by(dot, True))
print("ranking by cosine  :", by(cosine, True))
print("ranking by euclid  :", by(euclid, False))

U = {w: unit(v) for w, v in V.items()}
qu = U["cat"]
rd = [w for w, _ in sorted(((w, dot(qu, v)) for w, v in U.items() if w != "cat"), key=lambda t: -t[1])]
re_ = [w for w, _ in sorted(((w, euclid(qu, v)) for w, v in U.items() if w != "cat"), key=lambda t: t[1])]
print("\nafter normalising every vector to length 1:")
print("ranking by dot     :", rd)
print("ranking by euclid  :", re_)
a, b = U["cat"], U["lion"]
print(f"identity for unit vectors: euclid^2 = {euclid(a, b) ** 2:.4f}  and  2 - 2*cosine = {2 - 2 * cosine(a, b):.4f}")
EOF
python3 metrics.py
```

Read the three rankings for the query "cat":

- **Dot product puts "elephant" first.** Its vector is long, so its dot product with anything is big. Length is not meaning.
- **Cosine puts "kitten" first**, then "elephant". It ignores length.
- **Euclidean distance disagrees with cosine** about "lion" versus "elephant", because it also compares length.

After you **normalise** every vector to length 1, the three agree: for unit vectors, `euclid^2 = 2 - 2 * cosine`, and dot product equals cosine. That is why many embedding models output unit-length vectors and why the usual advice is: *use the metric the model was trained for; if vectors are normalised it makes no difference.*

:::warn A frequent bug
Mixing metrics: building the index with one (say L2) and querying with another (say cosine) returns confident but wrong neighbours. Check what your embedding model and your database each assume.
:::

## 3. Why you cannot scan everything

Exact search compares the query with **every** stored vector: cost grows with the number of vectors times the dimensions. For 10 million vectors of 1536 numbers that is far too slow for an interactive request. Vector databases therefore use **approximate nearest neighbour (ANN)** indexes: they accept a small chance of missing a true neighbour in return for scanning a tiny fraction of the data.

Two families you should be able to describe:

- **IVF (inverted file)**: cluster the vectors into lists around centroids. At query time, find the few closest centroids and scan only those lists. The knob is `nprobe`, how many lists to scan.
- **HNSW (hierarchical navigable small world)**: build a layered graph where each vector links to near neighbours. A query starts at the top layer and hops greedily towards the query, then refines in the dense bottom layer. Very fast and accurate, but it uses more memory. The knobs are the graph degree and the search width (`ef`).

Below is a working IVF with k-means, on invented clustered data. It measures how much of the data is scanned and how much of the true top 10 is still found (**recall@10**).

```run
cd ~/lab/ai
cat > ivf.py <<'EOF'
import random, math
random.seed(7)
D, N, C = 16, 3000, 30
centers = [[random.gauss(0, 2) for _ in range(D)] for _ in range(C)]
data = []
for i in range(N):
    c = random.choice(centers)
    data.append([x + random.gauss(0, 2.2) for x in c])
def d2(a, b): return sum((x - y) ** 2 for x, y in zip(a, b))
def exact(q, k): return sorted(range(N), key=lambda i: d2(q, data[i]))[:k]

# IVF: k-means with 30 lists; a query only scans the closest few lists ("nprobe")
cent = random.sample(data, C)
for _ in range(6):
    buckets = [[] for _ in range(C)]
    for i, v in enumerate(data):
        buckets[min(range(C), key=lambda c: d2(v, cent[c]))].append(i)
    for c in range(C):
        if buckets[c]:
            cent[c] = [sum(data[i][j] for i in buckets[c]) / len(buckets[c]) for j in range(D)]
def ivf(q, k, nprobe):
    order = sorted(range(C), key=lambda c: d2(q, cent[c]))[:nprobe]
    cand = [i for c in order for i in buckets[c]]
    return sorted(cand, key=lambda i: d2(q, data[i]))[:k], len(cand)

queries = [[x + random.gauss(0, 2.2) for x in random.choice(centers)] for _ in range(40)]
k = 10
print(f"{N} vectors, {D} dimensions, {C} lists, top-{k}. Exact search scans all {N}.")
print(f"{'nprobe':>6} {'scanned':>8} {'of all':>7} {'recall@10':>10}")
for nprobe in (1, 2, 4, 8, 16, 30):
    rec, scanned = 0, 0
    for q in queries:
        truth = set(exact(q, k)); got, n = ivf(q, k, nprobe)
        rec += len(truth & set(got)) / k; scanned += n
    print(f"{nprobe:6d} {scanned // len(queries):8d} {scanned / len(queries) / N:7.0%} {rec / len(queries):10.2f}")
EOF
python3 ivf.py
```

Reading the table: scanning about 7% of the vectors already finds about three quarters of the true neighbours, and about a quarter of the data finds almost all. That is the trade-off. Real systems pick the cheapest setting that meets a recall target measured on their own data, the same way [Deep dive 6](#aideep-6) measures retrieval.

:::note Vector search beyond the basics
Quantisation (storing each number in fewer bits, as in product quantisation), **hybrid search** (keyword plus vector, then merge) and **reranking** (a slower, more accurate model re-scores the top results) are the usual next steps. Hybrid and reranking are in [Deep dive 6](#aideep-6) and [Field guide 5](#aifield-5).
:::

## 4. Metadata filters

Real queries say "find similar documents **for this customer** or **after this date**". Two strategies:

- **Post-filter**: search first, then drop results that fail the filter. Simple, but you may end up with fewer than k results, even zero.
- **Pre-filter** (or filtered ANN): restrict the search to allowed items. You always get k results if enough match, but the index must support it well.

If your top-k comes back short only for some users, suspect post-filtering.

## 5. Choosing where the vectors live

| Option | Good for | Watch out for |
| --- | --- | --- |
| A library in your process (FAISS, hnswlib) | prototypes, up to millions of vectors, batch jobs | you build persistence, updates and scaling yourself |
| A vector extension in your existing database (such as pgvector) | you already run that database; vectors next to your rows and permissions | very large collections need tuning |
| A dedicated vector database (Pinecone, Weaviate, Qdrant, Milvus, Chroma and others) | large scale, filtering, managed service | another system to run, secure and pay for |
| A cloud search service with vector support | you already use that cloud's search and want managed RAG | lock-in; check the limits and pricing |

Product features and limits change, so check current documentation before you decide. A good default for a first project: **start with the simplest thing that fits in memory, measure recall and latency, and only then move to a bigger system.**

## Common misconceptions

- "Higher dimension is always better." More dimensions cost memory and time, and a smaller model that fits your language and domain often wins. Measure on your data.
- "ANN returns the exact answer." It returns a **probably right** answer; that is why recall is something you measure.
- "Cosine and dot product are different things, always." They are identical for unit-length vectors.
- "Embeddings from two different models can be compared." They cannot: each model has its own space. If you change the model you must re-embed everything.

## Practice (answers below)

1. A search for "cat" returns "elephant" first. Which metric are you probably using, and what is the quickest fix?
2. You scan 7% of the vectors and recall@10 is 0.74. Name two ways to raise recall and what each costs.
3. After switching embedding model, old documents return nonsense matches. Why?

:::recap
- An embedding turns meaning into numbers; **close vectors mean similar meaning**.
- **Dot product** includes length, **cosine** only the angle, **Euclidean** the distance. They agree when vectors are normalised.
- **ANN** indexes (**IVF**, **HNSW**) trade a little **recall** for a large speed-up; you measure the trade-off.
- Filters, hybrid search and reranking turn "similar" into "useful".
- Never compare vectors from different embedding models.
:::

:::note Answers
1. Dot product on un-normalised vectors. Normalise the vectors (or use cosine). 2. Scan more lists (`nprobe`) which costs time, or use more lists and better clustering / a different index such as HNSW, which costs build time or memory. 3. The old vectors live in the old model's space; you must re-embed the whole collection with the new model.
:::

```quiz
? Two embedding vectors differ only in length (same direction). Which measure treats them as identical?
+ Cosine similarity
- Dot product
- Euclidean distance
- None of them
! Cosine looks only at the angle between vectors, so scaling a vector does not change it.

? What does the nprobe setting of an IVF index control?
+ How many clusters (lists) are scanned per query
- How many dimensions each vector has
- How many results are returned
- How many times the index is rebuilt
! More lists scanned means higher recall and higher latency.

? You change your embedding model but keep the old stored vectors. What happens?
+ Searches return poor matches, because the two models use different vector spaces
- Nothing; vectors are universal
- Only the query is affected
- The database re-embeds automatically
! Vectors from different models cannot be compared. Re-embed the collection.
```
