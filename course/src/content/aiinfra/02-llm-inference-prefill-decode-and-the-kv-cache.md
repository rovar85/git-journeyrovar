---
track: aiinfra
title: LLM inference: tokens, prefill, decode and the KV cache
short: Prefill, decode, KV cache
sub: The life of one request, why the first token and later tokens behave so differently, and how the KV cache trades memory for speed.
---

:::goals
- describe the inference lifecycle of a request from prompt to last token
- explain prefill and decode, and why their compute patterns differ
- show with a working program why the KV cache removes repeated work
- calculate KV cache size for a model, a context length and a number of requests
:::

:::note Stand-ins and numbers
The attention program below is **real** (plain Python, tiny sizes, random weights) and shows the **mechanism**, not real model speed. Model shapes in the memory calculator (layers, heads, head size) are **typical published values for 8B-class and 70B-class models, from my own knowledge**: check the model card of the model you use.
:::

## 1. The lifecycle of a request

1. **Tokenize**: the prompt text becomes token IDs (see the "Language models in depth" deep dive).
2. **Prefill**: the model processes **all prompt tokens at once** and produces the first output token.
3. **Decode**: the model generates **one token at a time**; each new token is fed back in to produce the next.
4. **Stop**: an end-of-sequence token, a length limit, or a stop string. The text is detokenized and returned (often streamed token by token).

The model weights are **fixed** (loaded once, read-only). What changes during a request is the **context**: the tokens so far. That fact drives everything in this lesson.

## 2. Prefill versus decode

| | Prefill | Decode |
|---|---|---|
| Input | the whole prompt (hundreds to thousands of tokens) | **one** new token per step |
| Parallelism | all prompt tokens processed **together**: big matrix-matrix multiplies | sequential: one step depends on the previous token |
| Bottleneck | **compute** (the arithmetic units are the limit) | **memory bandwidth** (every step reads all the weights and the KV cache) |
| What the user feels | **time to first token (TTFT)** | the **speed of streaming** (time per output token) |
| Scales with | prompt length | number of output tokens |

Because the two phases stress **different resources**, serving systems treat them differently, and the most advanced designs run them on **separate GPUs** (disaggregated serving, lesson 5).

## 3. Why the KV cache exists

In attention, every token produces a **query** (Q), a **key** (K) and a **value** (V). To generate a token, its query is compared with the **keys of all previous tokens**, and the result mixes their **values**. The keys and values of **past** tokens never change while the sequence grows, so recomputing them each step is waste. The **KV cache** stores them.

Prove it with a working program. It generates a sequence step by step in two ways, with and without a cache, counts the multiply-adds spent on the key and value projections, and checks that the answers are **identical**:

```run
mkdir -p ~/lab/aiinfra && cd ~/lab/aiinfra
cat > kvcache.py <<'EOF'
import random, math
random.seed(3)
D = 16                                            # tiny model dimension

def mat():  return [[random.uniform(-1, 1) for _ in range(D)] for _ in range(D)]
Wq, Wk, Wv = mat(), mat(), mat()
cost = {"mults": 0}

def project(W, x):                                # one matrix-vector product: D*D multiply-adds
    cost["mults"] += D * D
    return [sum(W[i][j] * x[j] for j in range(D)) for i in range(D)]

def attend(q, keys, values):                      # one query attends over all cached keys and values
    scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(D) for k in keys]
    m = max(scores); w = [math.exp(s - m) for s in scores]; z = sum(w)
    return [sum(w[t] / z * values[t][i] for t in range(len(values))) for i in range(D)]

tokens = [[random.uniform(-1, 1) for _ in range(D)] for _ in range(48)]   # stand-in token embeddings

def generate(use_cache):
    cost["mults"] = 0
    K, V, out = [], [], None
    for t in range(len(tokens)):
        if use_cache:
            K.append(project(Wk, tokens[t])); V.append(project(Wv, tokens[t]))      # only the NEW token
        else:
            K = [project(Wk, x) for x in tokens[:t + 1]]                              # recompute everything
            V = [project(Wv, x) for x in tokens[:t + 1]]
        q = project(Wq, tokens[t])
        out = attend(q, K, V)
    return out, cost["mults"]

plain, c_plain = generate(use_cache=False)
cached, c_cached = generate(use_cache=True)
print(f"same final output: {all(abs(a - b) < 1e-9 for a, b in zip(plain, cached))}")
print(f"projection multiply-adds without a KV cache: {c_plain:>9,}")
print(f"projection multiply-adds with a KV cache:    {c_cached:>9,}")
print(f"work saved: {c_plain / c_cached:.1f}x for a 48-token sequence (the gap grows with length)")
EOF
python3 kvcache.py
```

Without the cache, the work grows with the **square** of the sequence length; with it, **linearly**. The price is **memory**: the cache holds K and V for every token, every layer, every concurrent request.

## 4. How big is the KV cache?

```
bytes per token = 2 (K and V) x layers x KV heads x head size x bytes per value
cache for a request = bytes per token x context length
```

Modern models use **grouped-query attention (GQA)**: many query heads share fewer **KV heads**, shrinking the cache a lot. Compare with the older multi-head layout:

```run
cd ~/lab/aiinfra
cat > kvsize.py <<'EOF'
def per_token(layers, kv_heads, head_dim, bytes_per=2):
    return 2 * layers * kv_heads * head_dim * bytes_per

models = {
    "8B-class, GQA (32 layers, 8 KV heads)":      per_token(32, 8, 128),
    "8B-class, old multi-head (32 KV heads)":     per_token(32, 32, 128),
    "70B-class, GQA (80 layers, 8 KV heads)":     per_token(80, 8, 128),
}
for name, b in models.items():
    print(f"{name:45} {b / 1024:6.0f} KiB per token")

print("\nMemory for the KV cache (FP16 values):")
print(f"{'model':45} {'context':>8} {'1 request':>10} {'32 requests':>12}")
for name, b in list(models.items())[::2]:
    for ctx in (4096, 32768, 131072):
        one = b * ctx / 1e9
        print(f"{name:45} {ctx:8,} {one:9.1f}G {one * 32:11.0f}G")
EOF
python3 kvsize.py
```

Read it as a capacity-planning table:

- A **32k-token** request on an 8B-class model holds about **4 GB** of cache. **32 of them** need 137 GB: more than a whole 80 GB GPU **after** the 16 GB of weights. The cache, not the weights, often limits **how many users you can serve at once**.
- GQA (8 KV heads instead of 32) cut the cache by **4x**. This is why you see it in modern model cards.
- A 70B-class model at 128k tokens needs tens of GB **per request**.

### Ways to shrink or manage the cache

| Technique | Idea |
|---|---|
| **GQA / MQA** | fewer KV heads (a model-design choice) |
| **Quantized KV cache** | store K and V in FP8 or INT8 (half the memory, small quality cost) |
| **PagedAttention** | allocate the cache in small **blocks** instead of one big contiguous slab, so no memory is wasted (lesson 4) |
| **Prefix caching** | requests that share a prompt prefix (a system prompt, a long document) **reuse** the same cached blocks and skip that part of prefill |
| **Sliding window or eviction** | keep only recent or important tokens (changes model behaviour; use with care) |
| **Offloading** | spill cold cache to CPU memory or SSD and fetch it back (Dynamo's KV block manager does tiered storage, lesson 5) |

:::warn Common mistakes
- **Sizing a GPU from weights alone.** The cache for your real concurrency and context length may need more memory than the weights.
- **Assuming a bigger context window is free.** A long window costs memory per request and slower prefill whether or not the user fills it.
- **Treating prefill and decode as one number.** Slow first token and slow streaming have different causes and different fixes.
- **Ignoring prefix reuse.** If every request starts with the same 3,000-token system prompt, prefix caching can remove most of the prefill work.
:::

:::recap
- A request has two phases: **prefill** (all prompt tokens at once, compute-bound, sets time to first token) and **decode** (one token at a time, memory-bandwidth-bound, sets streaming speed).
- The **KV cache** stores past keys and values so each step computes only the new token: linear instead of quadratic work, paid for in memory.
- KV bytes per token = 2 x layers x KV heads x head size x bytes. GQA, FP8 caches, paging, prefix caching and offloading manage it.
- Capacity planning uses weights **plus** cache for your concurrency and context length.
:::

:::try Your turn
Change `tokens` in `kvcache.py` to 96 tokens. How does the saving factor change, and why? Then add a "70B-class, GQA, FP8 cache" line (1 byte per value) to `kvsize.py` and report its cache for 32 requests at 32,768 tokens.
:::

:::quiz
? Which phase determines time to first token?
+ Prefill, which processes the whole prompt
- Decode
- Detokenization
- Model loading only
! The first token cannot appear until the prompt has been processed.
? Why does decode tend to be memory-bandwidth bound?
+ Each step reads all the weights and the KV cache to produce a single token
- It uses no arithmetic
- It runs on the CPU
- The prompt is longer
! Little arithmetic per byte moved.
? What does grouped-query attention change?
+ It reduces the number of KV heads, shrinking the KV cache
- It increases the vocabulary
- It removes the need for prefill
- It speeds up the network
! Fewer KV heads means fewer bytes per token.
:::
