---
track: lectures
title: "Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)"
short: L2 Variants and families
sub: How the 2017 Transformer changed: relative positions and RoPE, RMSNorm and pre-norm, sliding window and grouped-query attention, and the encoder-only, encoder-decoder and decoder-only families, each with runnable checks.
---

:::goals
- explain why attention needs a **position signal** and why modern models use **rotary embeddings (RoPE)**
- verify with code that sinusoidal and rotary signals depend on **relative** distance
- compare **LayerNorm and RMSNorm**, **post-norm and pre-norm**
- compute the **KV-cache cost** of multi-head, multi-query and grouped-query attention, and see what **sliding-window attention** changes
- tell **encoder-only (BERT), encoder-decoder (T5) and decoder-only (GPT-style)** models apart, and know how BERT and T5 are pre-trained
:::

:::note Provenance
This lesson is built from the **transcript of Stanford CME 295, lecture 2** (the lecture notes you supplied) and explained in my own words with **original, runnable Python** (standard library only, so no extra installs). The numbers are **illustrative** and computed here, not quoted from papers. Paper names are mentioned so you can read the originals.
:::

## 1. Why position information is needed

Self-attention lets **every token look at every other token directly**. That is powerful, but it loses something an RNN had for free: **order**. The attention formula treats the input as a **set**, so "dog bites man" and "man bites dog" would look the same without extra information.

So we must **inject position**. The original Transformer **added a position vector to each token embedding** (`input = token embedding + position embedding`). There are two ways to build the position vector:

| Method | How | Advantage | Problem |
|---|---|---|---|
| **Learned** | one trainable vector per position (1 to 512, say) | simple, the data decides | positions **beyond the training length have no vector**, and it can pick up quirks of the training set |
| **Fixed formula** (sinusoids) | sines and cosines at many frequencies | works for **any length**; no parameters | position is added at the **input**, only indirectly reaches attention |

### The sinusoidal formula, and what it buys you

For position `m` and dimension pair `i`, the vector holds `sin(ω_i · m)` and `cos(ω_i · m)`, with frequencies `ω_i = 10000^(-2i/d)`: **fast-changing for low dimensions, slow-changing for high ones**, like the hands of a clock. The **dot product** of the vectors for positions `m` and `n` becomes a sum of `cos(ω_i · (m − n))`, a function of **only the distance** `m − n`, and it is **largest when `m = n`**. That matches the intuition: **nearby tokens should be more related than distant ones**.

Check it numerically:

```run
mkdir -p ~/l2 && cd ~/l2
cat > sinus.py <<'PY'
import math

def pe(pos, d=16):
    v = []
    for i in range(d // 2):
        w = 10000 ** (-2 * i / d)
        v += [math.sin(w * pos), math.cos(w * pos)]
    return v

def dot(a, b): return sum(x * y for x, y in zip(a, b))

print("same distance, different absolute positions (distance = 3):")
for m in (0, 10, 50, 200):
    print(f"  positions {m:3} and {m + 3:3}: dot = {dot(pe(m), pe(m + 3)):.6f}")

print("\ndot product against position 100, as the distance grows:")
for dist in (0, 1, 2, 5, 10, 30, 100):
    print(f"  distance {dist:3}: dot = {dot(pe(100), pe(100 + dist)):6.3f}")
PY
python3 sinus.py
```

**What you see:** the first block prints **the same value** for every absolute position, which proves the dot product depends **only on the distance**. The second block starts at its maximum (8.0 = 16/2, because `sin² + cos² = 1` for each of 8 pairs) and **falls with distance**, though not perfectly smoothly, because it is a sum of cosines at different frequencies.

## 2. Moving position into attention: relative bias and RoPE

Injecting position at the **input** is indirect. What we really need is **attention scores that depend on relative distance**. Several methods act **inside the attention computation** (on `QKᵀ` before the softmax):

- **T5's relative bias**: learn a bias that depends on the **bucketed distance** `m − n` and **add it to the score**. (Adding a bias inside the softmax is fine, the softmax renormalises.)
- **ALiBi**: a **fixed**, non-learned linear penalty proportional to the distance. Simple but rigid.
- **RoPE (rotary position embedding)**, used by most modern models: **rotate the query and key vectors by an angle that depends on their positions**. Take the vector in 2D pieces and multiply each piece by a **rotation matrix**. The dot product of a query rotated by `m·θ` and a key rotated by `n·θ` equals the dot product with a **single rotation by `(n − m)·θ`**, so the score depends on the **relative position** by construction, and there are **no learned position parameters**. A known property is that the influence **tends to decay** with distance.

Verify the key property of RoPE: **the attention score is unchanged if both tokens shift by the same amount**.

```run
cd ~/l2
cat > rope.py <<'PY'
import math

def rotate(vec, pos, base=10000):
    """Rotate consecutive pairs of dimensions by an angle that grows with position."""
    out = []
    for i in range(0, len(vec), 2):
        theta = base ** (-i / len(vec))
        a = pos * theta
        x, y = vec[i], vec[i + 1]
        out += [x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)]
    return out

def dot(a, b): return sum(x * y for x, y in zip(a, b))

q = [0.3, -1.2, 0.8, 0.5, -0.7, 0.2, 1.1, -0.4]      # one query vector (8 dims)
k = [1.0,  0.4, -0.6, 0.9,  0.3, -0.8, 0.5, 0.7]      # one key vector

print("score(query at m, key at n) for the SAME vectors, different absolute positions:")
for m, n in [(0, 3), (10, 13), (100, 103), (1000, 1003)]:
    print(f"  m={m:5} n={n:5} (n-m=3): {dot(rotate(q, m), rotate(k, n)):.6f}")

print("\nthe same vectors with growing relative distance n-m:")
for dist in (0, 1, 2, 4, 8, 16, 64, 256):
    print(f"  n-m={dist:4}: {dot(rotate(q, 0), rotate(k, dist)):7.3f}")
PY
python3 rope.py
```

**What you see:** the first block gives an **identical score** at every absolute position when the **relative distance is 3**. That is the whole point of RoPE. The second block shows how the score varies with distance (the exact pattern depends on the vectors).

:::warn Rotation rotates, it does not shrink
A rotation **keeps the length of the vector** (`|Rq| = |q|`). Position therefore changes the **direction** (the angle between query and key), not the magnitude. That is why RoPE can be applied inside every attention layer without disturbing the scale of the activations.
:::

## 3. Normalisation: LayerNorm, RMSNorm, pre-norm and post-norm

Activations can drift to very large or very small values in some layers, which makes training **unstable and slow**. **Normalisation** rescales each token's vector to a controlled range.

- **LayerNorm** (original): subtract the **mean** of the vector's components, divide by the **standard deviation**, then apply **learned** scale `γ` and shift `β`.
- **RMSNorm** (modern): skip the mean; divide by the **root mean square** only and learn just `γ`. Training behaves comparably, with **fewer parameters and a little less compute**.
- **Batch norm** normalises each feature **across the batch**; Transformers prefer per-token normalisation because it does not depend on the batch (and avoids differences between training and inference).

**Where** the norm goes also changed:

| | Layout | Notes |
|---|---|---|
| **Post-norm** (original paper) | `x = Norm(x + Sublayer(x))` | normalises after the residual add |
| **Pre-norm** (common now) | `x = x + Sublayer(Norm(x))` | the residual path stays "clean", **trains more stably in deep stacks** |

```run
cd ~/l2
cat > norm.py <<'PY'
import math

def layernorm(x, eps=1e-5):
    mu = sum(x) / len(x)
    var = sum((v - mu) ** 2 for v in x) / len(x)
    return [(v - mu) / math.sqrt(var + eps) for v in x]

def rmsnorm(x, eps=1e-5):
    rms = math.sqrt(sum(v * v for v in x) / len(x) + eps)
    return [v / rms for v in x]

x = [120.0, -3.0, 0.5, 7.0, -80.0, 2.0]       # components on very different scales
print("input      :", x)
ln, rn = layernorm(x), rmsnorm(x)
print("LayerNorm  :", [round(v, 3) for v in ln], " mean=%.3f" % (sum(ln) / len(ln)))
print("RMSNorm    :", [round(v, 3) for v in rn], " rms =%.3f" % math.sqrt(sum(v * v for v in rn) / len(rn)))
print("\nLayerNorm centres the vector (mean 0); RMSNorm only rescales it (the mean is not forced to 0).")
PY
python3 norm.py
```

**What you see:** both bring wildly different components into a similar range. LayerNorm's output has **mean 0**; RMSNorm's has **root mean square 1** but is not centred.

## 4. Attention variants: cost and memory

Full self-attention is `O(n²)` in sequence length `n`. Two families of changes reduce cost, and they are **independent**:

### 4a. Local ("sliding window") attention

Each token attends **only to the previous `w` tokens**. Modern models **interleave** local layers and **global** layers. Even with a window, **information can travel further**: if each layer lets a token see `w` back, then after `L` layers the **receptive field** is about `L · w` (the same idea as receptive fields in convolutional networks).

```run
cd ~/l2
cat > window.py <<'PY'
def mask(n, window=None):
    """1 = may attend (causal; optionally restricted to the last `window` tokens)."""
    rows = []
    for i in range(n):
        rows.append("".join("1" if (j <= i and (window is None or i - j < window)) else "." for j in range(n)))
    return rows

print("full causal attention, 10 tokens:")
print("\n".join(mask(10)))
print("\nsliding window of 3:")
print("\n".join(mask(10, 3)))
full = sum(r.count("1") for r in mask(1000))
win = sum(r.count("1") for r in mask(1000, 128))
print(f"\nscores to compute for 1000 tokens: full={full:,}  window(128)={win:,}  ratio={full / win:.1f}x")
PY
python3 window.py
```

### 4b. Sharing key/value projections: MHA, MQA, GQA

In **multi-head attention (MHA)** every head has its own query, key and value projections. During generation we **cache the keys and values of all past tokens** (the **KV cache**), so their size matters. Sharing the key and value projections across heads shrinks the cache:

| Variant | Query heads | KV heads |
|---|---|---|
| **MHA** (original) | H | H |
| **MQA** (multi-query) | H | **1** |
| **GQA** (grouped-query) | H | **G** (a small number of groups) |

We share K and V (not Q) because **every generated token re-reads all K and V**, so they dominate memory traffic, while queries are used once. Many recent models use **GQA**.

```run
cd ~/l2
cat > kvcache.py <<'PY'
layers, heads, head_dim, seq, bytes_per = 32, 32, 128, 8192, 2      # a 7B-class shape, fp16

def kv_gib(kv_heads):
    per_token = 2 * layers * kv_heads * head_dim * bytes_per       # 2 = keys and values
    return per_token, per_token * seq / 2**30

print(f"model shape: {layers} layers, {heads} heads, head_dim {head_dim}, fp16, context {seq} tokens\n")
print(f"{'variant':10} {'kv heads':>8} {'KB / token':>11} {'GiB / sequence':>15}")
for name, kvh in [("MHA", 32), ("GQA (8)", 8), ("GQA (4)", 4), ("MQA", 1)]:
    pt, gib = kv_gib(kvh)
    print(f"{name:10} {kvh:8} {pt / 1024:11.0f} {gib:15.2f}")
print("\nAt 64 concurrent requests, MHA needs", f"{64 * kv_gib(32)[1]:.0f} GiB", "of cache; GQA(8) needs", f"{64 * kv_gib(8)[1]:.0f} GiB.")
PY
python3 kvcache.py
```

**What you see:** the cache per token falls in proportion to the number of KV heads. Cache size, not compute, often decides **how many requests fit on a GPU**. (The senior-level serving side of this is in the **AI infrastructure** track.)

## 5. Model families: encoder-only, encoder-decoder, decoder-only

| Family | Parts of the original Transformer kept | Natural tasks | Examples |
|---|---|---|---|
| **Encoder-decoder** | both, with cross-attention | text in, text out (translation, summarisation) | original Transformer, **T5** family |
| **Encoder-only** | only the encoder (**bidirectional** attention) | **classification, embeddings**, token labelling, extractive QA | **BERT**, DistilBERT, RoBERTa |
| **Decoder-only** | only the decoder, **masked (causal)** self-attention, no cross-attention | **text generation**, chat | GPT-style models, and over 90% of today's LLMs |

Why did **decoder-only** win for LLMs? A single, simple, **self-supervised objective** (predict the next token) **scales** with data and compute, and it matches the product people want (a helpful chatbot). Encoder-only models **cannot generate text**, so by today's definition BERT is **not an "LLM"**, but it is still widely used for **classification and retrieval embeddings**.

### 5a. BERT in four facts

1. **Bidirectional:** with no causal mask, **every token attends to every other**, so the output vector of each token has seen the **whole** sentence (left and right).
2. **Special tokens:** `[CLS]` at the start (its output vector is used for **classification**), `[SEP]` between sentences, `[PAD]` to fill batches.
3. **Input = token embedding + position embedding + segment embedding** (segment A or B, for the sentence-pair task).
4. **Two-stage training:** **pre-train** on unlabelled text, then **fine-tune** a small head (often a linear layer on the `[CLS]` vector) for your task.

BERT's pre-training objectives:

- **Masked language modelling (MLM):** pick about 15% of tokens as targets; of those, **80% become `[MASK]`, 10% are replaced by a random word, 10% are left unchanged**. The model predicts the original token from both sides.
- **Next-sentence prediction (NSP):** given two sentences, are they consecutive? (50% yes). **RoBERTa later showed NSP was not needed**, and added **dynamic masking** (a new mask each epoch) and more data. **DistilBERT** used **distillation** to be smaller and faster.

```run
cd ~/l2
cat > mlm.py <<'PY'
import random
random.seed(7)
tokens = "my teddy bear is cute and i love reading stories to it every single night".split() * 40
chosen = [i for i in range(len(tokens)) if random.random() < 0.15]
kinds = {"[MASK]": 0, "random word": 0, "unchanged": 0}
vocab = sorted(set(tokens))
for i in chosen:
    r = random.random()
    if r < 0.8:   kinds["[MASK]"] += 1
    elif r < 0.9: kinds["random word"] += 1
    else:         kinds["unchanged"] += 1
n = len(chosen)
print(f"{len(tokens)} tokens, {n} chosen as MLM targets ({n / len(tokens):.0%})")
for k, v in kinds.items():
    print(f"  {k:12} {v:4}  ({v / n:.0%})")
print("\nWhy the 10% random / 10% unchanged? At fine-tuning time the input never contains [MASK],")
print("so the model must not learn 'only masked positions matter'. The mixture keeps every token's representation useful.")
PY
python3 mlm.py
```

### 5b. T5: everything is text-to-text, trained by span corruption

T5 (Text-To-Text Transfer Transformer) keeps **both** halves. Its pre-training task is **span corruption**: remove one or more **spans** of tokens and replace each with a **sentinel token**; the encoder reads the corrupted text, and the decoder **outputs the missing spans**, each introduced by its sentinel. Variants: **mT5** (multilingual), **ByT5** (works on **bytes**, a tiny vocabulary of 256 and no tokenizer).

```run
cd ~/l2
cat > span.py <<'PY'
import random
random.seed(3)
text = "my teddy bear is cute and loves reading bedtime stories every night".split()

def corrupt(words, spans=((1, 3), (7, 9))):
    enc, dec, last, s = [], [], 0, 0
    for a, b in spans:
        enc += words[last:a] + [f"<X{s}>"]
        dec += [f"<X{s}>"] + words[a:b]
        last, s = b, s + 1
    enc += words[last:]
    dec += [f"<X{s}>"]
    return enc, dec

enc, dec = corrupt(text)
print("original       :", " ".join(text))
print("encoder input  :", " ".join(enc))
print("decoder target :", " ".join(dec))
PY
python3 span.py
```

**What you see:** the encoder gets text with **sentinels** where spans are missing, and the decoder target lists **each sentinel followed by the words that belong there**. Compare with decoder-only pre-training, where the task is just *"predict the next token everywhere"*, simpler to build and scale.

## 6. Distillation, in one paragraph

**Distillation** trains a **small student** to match a **large teacher's output distribution** (not just the hard label). The loss is the **KL divergence** between teacher and student, and "soft targets carry most of the knowledge" (a wrong-but-plausible class gets nonzero probability, which tells the student about **similarity between classes**). When the teacher's distribution is a one-hot label, this reduces to ordinary cross-entropy. DistilBERT halved the layers and kept most of the quality using this idea.

:::warn Common mistakes
- **Confusing the notations**: the original paper's "N" (layers) and "h" (heads) are BERT's "L" and "A", and `d_model` is BERT's "H".
- **Saying "BERT generates text"**: it does not; no decoder and no causal mask.
- **Assuming positions are free**: without a position signal, attention is permutation-blind.
- **Saying GQA reduces compute**: it mainly reduces **KV-cache memory and bandwidth**.
- **Thinking local attention loses all long-range information**: stacked layers widen the receptive field.
:::

## 7. Interview-style questions

- **"Why did Transformers need positional encodings, and what do modern models use?"** Attention is order-agnostic; originally added sinusoidal or learned vectors; now **RoPE** rotates queries and keys so scores depend on **relative** distance, with no learned position table and better length behaviour.
- **"Why do many LLMs use GQA?"** It **shrinks the KV cache** (and the memory traffic per generated token) with little quality loss, so **more requests fit** on a GPU.
- **"Pre-norm vs post-norm?"** Pre-norm keeps a clean residual path and **trains deeper stacks more stably**; most modern LLMs use pre-norm with **RMSNorm**.
- **"When would you pick BERT over a decoder-only LLM?"** For **classification, entity tagging, or embeddings** where you want a **small, fast, deterministic** encoder, not generation.

:::try
1. In `rope.py`, change the vectors and re-run: does the **relative-position property** still hold? (It must, for any vectors.)
2. Change `kvcache.py` to a **70B-class** shape (80 layers, 8 KV heads, head_dim 128) and compute the cache for a 32k context.
3. Extend `window.py` to **interleave** one global layer for every three local layers and compute the **receptive field** after 24 layers.
4. In `span.py` corrupt **three** spans and check that the decoder target ends with the **final sentinel**.
:::

:::recap
- Attention needs **position information**; sinusoids and **RoPE** make scores depend on **relative** distance, and RoPE does so inside attention.
- **RMSNorm** (no mean, one parameter set) and **pre-norm** are standard in modern LLMs.
- **Sliding-window** attention cuts quadratic cost; **MQA/GQA** shrink the **KV cache**; the two are independent ideas.
- **Encoder-only (BERT)** for understanding, **encoder-decoder (T5)** for text-to-text, **decoder-only** for generation and almost all LLMs.
- BERT trains with **MLM (80/10/10 masking)** and NSP (dropped by RoBERTa); T5 trains with **span corruption**.
- **Distillation** matches a teacher's soft distribution with a KL loss.
:::

:::quiz
? Why does RoPE give relative-position behaviour?
- It adds a learned vector to every token
+ Rotating query and key by position-dependent angles makes their dot product depend on the difference of positions
- It removes the softmax
! The rotation of q by m and k by n equals one rotation by n - m.

? What does GQA mainly reduce?
- The number of layers
+ The size of the KV cache and the memory traffic per generated token
- The vocabulary
! Keys and values are re-read for every generated token.

? Which family cannot generate text on its own?
- Decoder-only
+ Encoder-only
- Encoder-decoder
! BERT-style models have no decoder and no causal mask.

? In BERT masking, why are 10% of chosen tokens left unchanged?
- To save compute
+ So the model learns useful representations for every token, since [MASK] never appears at fine-tuning time
- To reduce the vocabulary
! It prevents a train/test mismatch.

? What distinguishes T5's pre-training from next-token prediction?
- It uses images
+ Span corruption: the decoder reconstructs spans replaced by sentinel tokens
- It has no loss
! Encoder reads corrupted text, decoder emits the missing spans.
:::
