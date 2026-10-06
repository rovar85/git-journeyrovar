---
track: aideep
title: Deep dive 6: RAG and tool use in depth
short: RAG and tools
sub: Companion to chapter 6. Chunking, BM25, vector search, hybrid ranking and recall measurement, then tool schemas and the calling loop.
---

:::goals
- compare chunking strategies and see how they change retrieval
- implement keyword search (BM25) and vector-style search, and combine them
- measure retrieval quality with recall@k and mean reciprocal rank
- define a tool schema and run a safe tool-calling loop with validation
:::

## 1. The RAG pipeline in one picture

**Retrieval-Augmented Generation** puts the right facts in front of the model at question time:

1. **Ingest** (offline): split documents into **chunks**, compute an **index** (keywords and/or embeddings).
2. **Retrieve** (online): turn the question into a query, fetch the top-k chunks.
3. **Augment**: build a prompt that contains the chunks (with source labels).
4. **Generate**: the model answers **using only that context**, and cites it.
5. **Check**: verify the answer is supported by the sources.

Most RAG failures are retrieval failures: if the right chunk is not retrieved, no model can answer correctly. So we measure retrieval **separately** from generation.

## 2. Chunking changes everything

A chunk should hold **one idea with enough context to stand alone**. Too small and the answer is split across chunks; too big and the retrieved text is mostly irrelevant (and costly).

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > docs.txt <<'EOF'
# Indexing
The indexing service builds a searchable index of archived items. If the SQL server is unreachable, indexing tasks abort and items wait in the queue.
To check the indexing queue, open the Administration Console and look at the Indexing tab. A queue that keeps growing means indexing is slower than archiving.

# Storage expiry
Storage expiry deletes archived items after their retention category has passed. Expiry runs on a schedule, usually overnight.
Items under legal hold are never expired, even when the retention period has passed.

# Backup
Back up the vault store, the indexes and the SQL databases together so they stay consistent. Test a restore regularly; an untested backup is only a hope.
Put the Enterprise Vault services in backup mode before taking snapshots of the vault store partitions.
EOF
cat > chunking.py <<'EOF'
import re
text = open("docs.txt").read()

def by_fixed(text, size=160):
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(" ".join(cur)) >= size:
            chunks.append(" ".join(cur)); cur = []
    if cur: chunks.append(" ".join(cur))
    return chunks

def by_paragraph(text):
    return [p.strip() for p in re.split(r"\n\s*\n|\n(?=#)", text) if p.strip()]

def by_section(text):
    parts = re.split(r"(?m)^# ", text)
    return ["# " + p.strip() for p in parts if p.strip()]

for name, fn in (("fixed 160 chars", by_fixed), ("paragraph", by_paragraph), ("section", by_section)):
    cs = fn(text)
    sizes = [len(c) for c in cs]
    print(f"{name:16} {len(cs):2} chunks, size min/avg/max = {min(sizes)}/{sum(sizes)//len(sizes)}/{max(sizes)}")

print()
print("First two fixed-size chunks (note how they cut sentences and ideas in half):")
for c in by_fixed(text)[:2]:
    print("  >", c)
EOF
python3 chunking.py
```

Fixed-size chunks cut sentences and ideas in half (see the first two chunks). Paragraph and section chunking give the same three chunks here only because each section of this small file is one block of text; in real documents with many paragraphs they differ.

**Practical guidance.** Prefer **structure-aware** chunking (headings, paragraphs, table rows, one function per code chunk) over blind fixed size. Add a **small overlap** (10 to 20%) if you must cut mid-text. **Prepend the heading path** ("Storage expiry > Legal hold") to each chunk so it carries its context. Keep **metadata** (source, date, version, access level) so you can filter and cite.

## 3. Keyword search: BM25

**BM25** is the classic ranking function behind keyword search engines. It scores a chunk higher when it contains **rare query words** (inverse document frequency), more often (with **diminishing returns**), and is not just long.

```run
cd ~/lab/ai
cat > bm25.py <<'EOF'
import math, re, collections

def tokens(s):
    stop = {"the", "a", "of", "is", "to", "and", "in", "it", "if", "an", "are", "be", "on", "for", "even", "when"}
    out = []
    for w in re.findall(r"[a-z0-9]+", s.lower()):
        if w in stop: continue
        for suf in ("ing", "ed", "es", "s"):          # crude stemming: indexing -> index
            if w.endswith(suf) and len(w) - len(suf) >= 4:
                w = w[:-len(suf)]; break
        out.append(w)
    return out

text = open("docs.txt").read()
chunks = [("# " + p.strip()) for p in re.split(r"(?m)^# ", text) if p.strip()]
docs = [tokens(c) for c in chunks]
N = len(docs); avg = sum(len(d) for d in docs) / N
df = collections.Counter(w for d in docs for w in set(d))

def bm25(query, k1=1.5, b=0.75):
    q = tokens(query)
    scores = []
    for d in docs:
        tf = collections.Counter(d); s = 0.0
        for w in q:
            if w not in tf: continue
            idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
            s += idf * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * len(d) / avg))
        scores.append(s)
    return scores

for q in ["why are indexing tasks aborting", "legal hold expiry", "test restore snapshot", "retention category deleted items"]:
    sc = bm25(q)
    best = max(range(N), key=lambda i: sc[i])
    print(f"{q!r:38} -> {chunks[best].splitlines()[0]:22} score {sc[best]:.2f}   all: {[round(x,2) for x in sc]}")
EOF
python3 bm25.py
```

Each query finds the section it is about. BM25's strengths: exact terms (product names, error codes, IDs) and no model needed. Its weakness: **vocabulary mismatch**; a query for "how do I make sure copies are safe" will not match a chunk that says "backup" and "restore".

## 4. Meaning search: embeddings

An **embedding model** maps text to a vector so that similar **meaning** gives nearby vectors (chapter 2). Real models are neural networks; to show the **mechanics** (index, query vector, cosine similarity, top-k) without one, here is a bag-of-concepts "embedding" where related words map to the same concept slot (a stand-in for what a trained model learns):

```run
cd ~/lab/ai
cat > vector.py <<'EOF'
import math, re

CONCEPTS = {            # word -> concept (a learned model would discover these relationships)
    "backup": "protect", "restore": "protect", "copy": "protect", "copies": "protect", "snapshot": "protect", "safe": "protect",
    "delete": "remove", "expire": "remove", "expiry": "remove", "removed": "remove", "retention": "remove",
    "search": "find", "index": "find", "indexing": "find", "queue": "find", "find": "find",
    "sql": "db", "database": "db", "server": "db",
}
DIMS = ["protect", "remove", "find", "db"]
def embed(text):
    v = [0.0] * len(DIMS)
    for w in re.findall(r"[a-z]+", text.lower()):
        c = CONCEPTS.get(w)
        if c: v[DIMS.index(c)] += 1
    n = math.sqrt(sum(x*x for x in v)) or 1
    return [x / n for x in v]
def cos(a, b): return sum(x*y for x, y in zip(a, b))

text = open("docs.txt").read()
chunks = [("# " + p.strip()) for p in re.split(r"(?m)^# ", text) if p.strip()]
vecs = [embed(c) for c in chunks]

for q in ["how do I make sure my copies are safe", "when are old items removed", "how do I check the search backlog"]:
    qv = embed(q)
    sims = [cos(qv, v) for v in vecs]
    best = max(range(len(chunks)), key=lambda i: sims[i])
    print(f"{q!r:42} -> {chunks[best].splitlines()[0]:22} similarities {[round(s,2) for s in sims]}")
EOF
python3 vector.py
```

"make sure my copies are safe" shares **no words** with the backup section yet finds it, because both map to the same concept. That is the power of embeddings. Their weaknesses: they can miss exact identifiers and rare terms, and quality depends on the model and domain.

## 5. Hybrid search and re-ranking

Production systems usually combine both: run keyword and vector search, then merge the ranked lists with **reciprocal rank fusion (RRF)**: each result earns `1 / (60 + rank)` from every list it appears in. Often a **re-ranker** (a model that reads the query and each candidate together) reorders the top 20 to 50 for precision.

```run
cd ~/lab/ai
cat > hybrid.py <<'EOF'
def rrf(rankings, k=60):
    score = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            score[doc] = score.get(doc, 0) + 1 / (k + rank)
    return sorted(score.items(), key=lambda x: -x[1])

keyword = ["ev-error-4417", "indexing-guide", "backup-guide", "expiry-guide"]     # exact term match wins
vector  = ["indexing-guide", "expiry-guide", "ev-error-4417", "backup-guide"]     # meaning match
fused = rrf([keyword, vector])
print("keyword ranking:", keyword)
print("vector  ranking:", vector)
print("fused (RRF)    :", [(d, round(s, 4)) for d, s in fused])
EOF
python3 hybrid.py
```

Documents that both methods like rise to the top; one that only one method likes still survives.

## 6. Measuring retrieval

Build a small set of **questions with known correct chunks**, then compute:

- **recall@k**: fraction of questions whose correct chunk appears in the top k results.
- **MRR** (mean reciprocal rank): average of `1 / rank` of the first correct chunk (1.0 if always first).

```run
cd ~/lab/ai
cat > recall.py <<'EOF'
# For each question: the ranked list returned by two retrievers, and the id of the chunk that really answers it
results = [
    ("retriever A", [(["c2", "c1", "c3"], "c1"), (["c1", "c3", "c2"], "c1"), (["c3", "c2", "c1"], "c2"), (["c2", "c3", "c1"], "c1")]),
    ("retriever B", [(["c1", "c2", "c3"], "c1"), (["c1", "c2", "c3"], "c1"), (["c2", "c3", "c1"], "c2"), (["c3", "c1", "c2"], "c1")]),
]
for name, qs in results:
    for k in (1, 2):
        hit = sum(correct in ranked[:k] for ranked, correct in qs) / len(qs)
        print(f"{name} recall@{k} = {hit:.2f}")
    mrr = sum(1 / (ranked.index(correct) + 1) for ranked, correct in qs) / len(qs)
    print(f"{name} MRR      = {mrr:.2f}")
EOF
python3 recall.py
```

With a few dozen real questions you can tune chunk size, k, and the retriever **before** worrying about prompts. Also evaluate the **answer**: is every claim **supported by the retrieved text** (faithfulness), and does it **answer the question** (relevance)? And track **"no answer" cases**: the system should say "not found in the documents" rather than guess.

## 7. Tools: letting the model act

A **tool** is a function your program exposes to the model. You describe each tool with a **name, description and JSON schema** for its inputs. The model replies either with text or with a **tool call** (a structured request). **Your code** validates the arguments, runs the function, and returns the result to the model, which continues. The model never executes anything itself.

```run
cd ~/lab/ai
cat > tools.py <<'EOF'
import json

TOOLS = {
    "get_queue_length": {
        "description": "Return the number of items waiting in an Enterprise Vault indexing queue.",
        "schema": {"server": {"type": "string", "required": True}},
    },
    "read_log": {
        "description": "Return the last N lines of a log. N must be between 1 and 50.",
        "schema": {"name": {"type": "string", "required": True, "allowed": ["indexing", "storage"]},
                   "lines": {"type": "integer", "required": False, "min": 1, "max": 50}},
    },
}

def validate(tool, args):
    if tool not in TOOLS: return f"unknown tool {tool!r}"
    schema = TOOLS[tool]["schema"]
    for k, spec in schema.items():
        if spec.get("required") and k not in args: return f"missing argument {k!r}"
    for k, v in args.items():
        if k not in schema: return f"unexpected argument {k!r}"
        spec = schema[k]
        if spec["type"] == "string" and not isinstance(v, str): return f"{k} must be a string"
        if spec["type"] == "integer" and (not isinstance(v, int) or isinstance(v, bool)): return f"{k} must be an integer"
        if "allowed" in spec and v not in spec["allowed"]: return f"{k} must be one of {spec['allowed']}"
        if "min" in spec and not spec["min"] <= v <= spec["max"]: return f"{k} must be between {spec['min']} and {spec['max']}"
    return None

def run_tool(tool, args):
    if tool == "get_queue_length": return {"server": args["server"], "queue": 1250}
    if tool == "read_log": return {"lines": ["12:15:41 ERROR Name resolution failed for SQL01"] * args.get("lines", 5)}

# Pretend these are tool calls the model produced (some are wrong, as real ones sometimes are)
calls = [
    ("get_queue_length", {"server": "EV01"}),
    ("read_log", {"name": "indexing", "lines": 2}),
    ("read_log", {"name": "../../etc/passwd", "lines": 2}),     # a path-traversal attempt
    ("read_log", {"name": "storage", "lines": 5000}),           # out of range
    ("delete_everything", {}),                                   # not a tool
]
for tool, args in calls:
    err = validate(tool, args)
    if err:
        print(f"REJECTED {tool}({json.dumps(args)}): {err}   -> the error text goes back to the model so it can correct itself")
    else:
        print(f"OK       {tool}({json.dumps(args)}) -> {json.dumps(run_tool(tool, args))[:80]}")
EOF
python3 tools.py
```

**Design rules for tools** (chapter 10 expands them): few, clearly named, well described; **narrow** (a `read_log(name from a fixed list)` tool, not a "run any shell command" tool); every argument **validated by your code** (the model's output is untrusted input); **read-only by default** with separate, approval-gated tools for actions; errors returned in clear text so the model can recover; and a **limit on how many calls** one task may make.

## Common misconceptions

- "RAG stops hallucination." It reduces it when retrieval is good and the model is told to use only the context; it does not eliminate it.
- "A vector database is required." For a small corpus, BM25 or even plain files with good chunking is a fine start.
- "More retrieved chunks are better." Irrelevant context distracts the model and costs money; tune k with recall measurements.
- "The model calls the tool." It only requests; your code decides whether and how to run it.

## Practice (answers below)

1. Your RAG system fails on "error 4417". Which retrieval type is probably weak, and what is the fix?
2. What does recall@3 = 0.9 mean?
3. Why must tool arguments be validated by your code even when the schema was in the prompt?
4. Why prepend the heading path to chunks?

:::note Answers
1. Vector search often misses exact identifiers; add keyword (BM25) search and fuse (hybrid).
2. For 90% of test questions the correct chunk appeared in the top 3 results.
3. The model's output is untrusted; it can ignore or misread the schema, and a manipulated model could send harmful arguments.
4. It gives the chunk its context, improving both matching and the model's understanding of what the text refers to.
:::

:::recap
- RAG = ingest, retrieve, augment, generate, check; most failures are retrieval failures, so measure recall@k and MRR.
- Chunk by structure with heading context; use BM25 for exact terms, embeddings for meaning, fuse with RRF, optionally re-rank.
- Tools: described by schema, requested by the model, validated and executed by your code, with narrow permissions and call limits.
:::

:::quiz
? Which search type best finds an exact error code?
+ Keyword search such as BM25
- Embedding search alone
- Random sampling
- Re-ranking only
! Hybrid search gets both exact and semantic matches.
? What does MRR measure?
+ How high the first correct result typically ranks
- The model's memory
- Chunk length
- Token cost
! 1.0 means the correct chunk is always ranked first.
? Why keep tools narrow?
+ A narrow tool limits what a confused or manipulated model can do
- It makes the schema shorter only
- Broad tools are not allowed
- It speeds up retrieval
! Least privilege applies to agents too.
? In the tool loop, who executes the function?
+ Your application code
- The model
- The tokenizer
- The vector database
! The model only emits a structured request.
:::
