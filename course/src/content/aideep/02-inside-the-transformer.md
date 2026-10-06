---
track: aideep
title: Deep dive 2: inside the Transformer
short: Transformer inside
sub: Companion to chapter 2. Build a tokenizer, embeddings, positional signals and a full attention calculation in plain Python.
---

:::goals
- train a tiny byte-pair tokenizer and see why tokenisation shapes cost and errors
- compute similarity between embedding vectors
- compute self-attention by hand: queries, keys, values, softmax, weighted sum
- explain positional encoding, multi-head attention, the context window and why long contexts cost more
:::

## 1. Tokenisation: building a BPE tokenizer

Models cannot read letters; they read **token IDs**. Most modern models use **byte-pair encoding (BPE)**: start with single characters, repeatedly **merge the most frequent adjacent pair** into a new symbol, and stop after N merges. Frequent words become one token; rare words are split into pieces. That is why a tokenizer never meets an "unknown word": it can always fall back to characters (or bytes).

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > bpe.py <<'EOF'
import collections

corpus = "indexing indexing index index indexed archive archive archived archiving vault vault vaults lower lowest newer newest".split()

# Start: every word is a tuple of characters plus an end-of-word marker
words = collections.Counter(tuple(w) + ("</w>",) for w in corpus)

def pair_counts(words):
    pairs = collections.Counter()
    for w, n in words.items():
        for a, b in zip(w, w[1:]):
            pairs[(a, b)] += n
    return pairs

def merge(words, pair):
    out = collections.Counter()
    for w, n in words.items():
        new, i = [], 0
        while i < len(w):
            if i < len(w) - 1 and (w[i], w[i+1]) == pair:
                new.append(w[i] + w[i+1]); i += 2
            else:
                new.append(w[i]); i += 1
        out[tuple(new)] += n
    return out

merges = []
for step in range(14):
    pairs = pair_counts(words)
    best = pairs.most_common(1)[0][0]
    merges.append(best)
    words = merge(words, best)
    print(f"merge {step+1:2}: {best[0]!r:12} + {best[1]!r:10} -> {best[0]+best[1]!r}")

def tokenize(word):
    toks = list(word) + ["</w>"]
    for a, b in merges:
        i = 0
        while i < len(toks) - 1:
            if (toks[i], toks[i+1]) == (a, b):
                toks[i:i+2] = [a + b]
            else:
                i += 1
    return toks

print()
for w in ["indexing", "archived", "vaulted", "newest", "zebra"]:
    print(f"{w:10} -> {tokenize(w)}")
EOF
python3 bpe.py
```

Read the output. The most frequent pairs merge first ("i"+"n", then "in"+"d", ... until "index" is one symbol), so "indexing" becomes just two tokens. With only 14 merges the tokenizer has not learned "vault", so "vaulted" and the never-seen "zebra" fall back to single characters. That is the point: **nothing is ever unknown**, but rare strings cost many tokens. Train more merges (real tokenizers use tens of thousands) and common words and endings become single tokens.

**Why this matters in practice**

| Consequence | Example |
|---|---|
| **Cost and limits are counted in tokens, not words** | English averages roughly 0.75 words per token; code, numbers and non-English text use more tokens per word |
| **Models are bad at letter-level tasks** | "how many r in strawberry" is hard because the model sees pieces, not letters |
| **Odd strings behave oddly** | a long ID like `EV-2024-00917` becomes many tokens and is easy to mis-copy |
| **Different models, different tokenizers** | counts from one model do not apply to another |

## 2. Embeddings: tokens become points in space

An **embedding** is a vector (a list of numbers) for each token. During training the vectors are adjusted so that tokens used in similar ways end up **near each other**. We measure nearness with **cosine similarity** (the angle between vectors; 1 means the same direction, 0 unrelated, -1 opposite).

```run
cd ~/lab/ai
cat > embed.py <<'EOF'
import math

# A hand-made 4-dimensional "embedding". Real models learn hundreds or thousands of dimensions.
# Pretend dimensions: [is_software, is_storage_related, is_person, is_action]
emb = {
    "archive":  [0.9, 0.9, 0.0, 0.3],
    "vault":    [0.8, 0.9, 0.0, 0.1],
    "index":    [0.9, 0.5, 0.0, 0.3],
    "engineer": [0.2, 0.0, 0.9, 0.1],
    "admin":    [0.3, 0.1, 0.9, 0.2],
    "delete":   [0.4, 0.3, 0.0, 0.95],
}

def cosine(a, b):
    dot = sum(x*y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x*x for x in a)) * math.sqrt(sum(y*y for y in b)))

words = list(emb)
print(" " * 10 + "".join(f"{w:>10}" for w in words))
for a in words:
    print(f"{a:10}" + "".join(f"{cosine(emb[a], emb[b]):10.2f}" for b in words))

q = "archive"
ranked = sorted((w for w in words if w != q), key=lambda w: -cosine(emb[q], emb[w]))
print()
print(f"closest to {q!r}:", ranked[:3])

EOF
python3 embed.py
```

This is the engine of **semantic search** (chapter 6): embed the question and every document chunk, and return the chunks whose vectors point in the most similar direction. Real embedding models produce vectors of 384 to 3072 numbers, trained on huge text collections, so closeness reflects meaning rather than hand-picked features.

## 3. Position: telling the model about order

Attention treats its input as a set of tokens, so on its own it would not know that "dog bites man" differs from "man bites dog". We **add a position signal** to each token embedding. The original Transformer used sine and cosine waves of different frequencies, so each position gets a unique pattern (modern models often use **rotary embeddings (RoPE)**, which rotate query and key vectors by an amount that depends on position, but the purpose is identical).

```run
cd ~/lab/ai
cat > position.py <<'EOF'
import math
def pos_encoding(pos, dims=8):
    out = []
    for i in range(0, dims, 2):
        freq = 1 / (10000 ** (i / dims))
        out += [math.sin(pos * freq), math.cos(pos * freq)]
    return out
for pos in range(5):
    print(f"position {pos}:", " ".join(f"{x:6.2f}" for x in pos_encoding(pos)))
print()
a, b = pos_encoding(1), pos_encoding(2)
print("each position has a different pattern; distance between positions 1 and 2:", round(sum((x-y)**2 for x, y in zip(a, b)) ** 0.5, 3))
EOF
python3 position.py
```

## 4. Self-attention, calculated by hand

Attention lets every token **look at every other token and pull in the information it needs**. Each token's vector is turned into three vectors by three learned matrices:

- **Query (Q)**: "what am I looking for?"
- **Key (K)**: "what do I contain, as a label others can match?"
- **Value (V)**: "what information do I hand over if you attend to me?"

For each token: score against every key (**dot product** of Q and K), divide by the square root of the vector size (keeps numbers tame), **softmax** to get weights that sum to 1, and output the **weighted sum of the values**. In a **causal** (decoder) model, a token may only attend to itself and earlier tokens.

```run
cd ~/lab/ai
cat > attention.py <<'EOF'
import math

tokens = ["the", "vault", "was", "full"]
# Tiny 2-dimensional vectors for Q, K, V (normally produced by learned matrices from the embeddings).
Q = [[1.0, 0.0], [0.2, 1.0], [0.5, 0.5], [0.1, 1.2]]
K = [[0.9, 0.1], [0.3, 1.1], [0.6, 0.4], [0.0, 1.0]]
V = [[1.0, 0.0], [0.0, 2.0], [0.5, 0.5], [0.2, 1.8]]

def softmax(xs):
    m = max(xs); e = [math.exp(x - m) for x in xs]; s = sum(e); return [v / s for v in e]

d = len(Q[0])
print("causal self-attention (each token sees only itself and earlier tokens)\n")
for i, tok in enumerate(tokens):
    scores = [sum(q * k for q, k in zip(Q[i], K[j])) / math.sqrt(d) for j in range(i + 1)]   # j <= i only
    w = softmax(scores)
    out = [sum(w[j] * V[j][c] for j in range(i + 1)) for c in range(d)]
    att = ", ".join(f"{tokens[j]}={w[j]:.2f}" for j in range(i + 1))
    print(f"{tok:6} attends to: {att:42} -> output {[round(x, 2) for x in out]}")
EOF
python3 attention.py
```

Read each line: "the" can only attend to itself (weight 1.00). "vault" splits its attention between "the" and itself. "full" puts most of its weight on "vault" (0.34) and on itself (0.31), and its output is the blend of those tokens' value vectors. The numbers are tiny and made up, but the steps are exactly those of a real model: scale by sqrt(d), softmax, weighted sum.

### Multi-head attention and the block

A real layer runs **many attention heads in parallel** (for example 32), each with its own Q, K, V matrices, so different heads can track different relationships (grammar, who "it" refers to, nearby words, long-range links). The head outputs are concatenated and mixed. One **Transformer block** is: attention, then a **feed-forward network** (a small two-layer neural net applied to every token separately; much of a model's stored knowledge lives here), each wrapped with **residual connections** (add the input back) and **normalisation** (keeps numbers stable). A model is dozens of these blocks stacked, followed by a final layer that turns the last vector into logits over the vocabulary, which chapter 1's softmax converts to probabilities.

## 5. The context window and why long inputs are expensive

The **context window** is the maximum number of tokens (your prompt plus the answer so far) the model can attend to. Attention compares **every token with every other**, so the work grows with the **square** of the length:

```run
cd ~/lab/ai
cat > context.py <<'EOF'
print(f"{'tokens':>8} {'attention pairs (n^2/2)':>26}   relative to 1,000 tokens")
base = 1000 * 1000 / 2
for n in (1_000, 4_000, 16_000, 64_000, 200_000):
    pairs = n * n / 2
    print(f"{n:>8,} {pairs:>26,.0f}   {pairs/base:>8.0f}x")
print()
# KV cache: memory to remember keys and values of every earlier token for every layer
layers, heads, head_dim, bytes_per = 32, 8, 128, 2        # an illustrative 7B-class model with grouped-query attention
per_token = 2 * layers * heads * head_dim * bytes_per      # 2 = keys and values
for n in (4_000, 32_000, 128_000):
    print(f"KV cache at {n:>7,} tokens: {n * per_token / 1e9:6.2f} GB per conversation")
EOF
python3 context.py
```

Two practical facts follow. **Long contexts cost real compute and memory** (engineers use a **KV cache** so earlier tokens' keys and values are not recomputed, but the cache itself uses gigabytes). And models do not use all context equally well: information buried in the middle of a very long prompt is more often missed. So send **less, better-chosen** context (retrieval, summarisation), not everything.

## Common misconceptions

- "Attention means the model reads like a person." It is a weighted average of vectors, learned to be useful; weights are not explanations.
- "Embeddings contain definitions." They are positions learned from usage; similar use means close together, which is not the same as similar truth.
- "A bigger context window means the model remembers more." It means more text fits; it does not add memory between conversations.
- "Tokens are syllables or words." They are whatever merges happened to be frequent in the tokenizer's training data.

## Practice (answers below)

1. Why does BPE need an end-of-word marker like `</w>` in our toy version?
2. Two embedding vectors have cosine similarity 0.98. What does this suggest, and what does it not prove?
3. In the attention output for a token, what happens to the weights if one key matches the query much more strongly than the others?
4. Context grows from 8,000 to 32,000 tokens. Roughly how much more attention work per layer?

:::note Answers
1. It lets the tokenizer tell "ing" at the end of a word from "ing" inside a word, so suffixes become their own tokens.
2. The tokens are used in very similar ways (close in meaning or role). It does not prove they are interchangeable or that statements about them are true.
3. Softmax gives that token most of the weight, so the output is close to its value vector (the other values are almost ignored).
4. About 16 times more (4 squared), which is why long contexts get expensive.
:::

:::recap
- BPE builds a vocabulary by merging frequent pairs; tokens (not words) are what you pay for and what limits context.
- Embeddings are learned vectors; cosine similarity measures closeness and powers semantic search.
- Position signals (sine waves or rotary embeddings) add order to attention.
- Attention: Q·K scores, scale, softmax, weighted sum of V; many heads in parallel; stacked blocks with feed-forward layers.
- Attention cost grows with the square of the context length; send less, better context.
:::

:::quiz
? What does the softmax step in attention do?
+ Turns similarity scores into weights that add up to 1
- Chooses the next token
- Adds position information
- Compresses the context
! The weights are then used to average the value vectors.
? Why are Query, Key and Value separate vectors?
+ They let a token express what it looks for, what it offers as a label, and what information it gives
- To save memory
- To prevent hallucinations
- They are the same vector copied three times
! Each comes from its own learned matrix.
? A BPE tokenizer meets a word it never saw. What does it do?
+ It breaks the word into smaller known pieces, down to single characters if needed, so nothing is unknown
- It looks the word up online
- It guesses the meaning
- It ignores rare words
! This avoids an "unknown word" problem.
? Context length goes up 10 times. Attention compute per layer goes up roughly:
+ 100 times
- 10 times
- 2 times
- It does not change
! Every token is compared with every other token.
:::
