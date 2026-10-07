---
track: lectures
title: "Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)"
short: L1 Words to Transformer
sub: Why tokenisation, why embeddings, why recurrent networks struggled, and how self-attention with a causal mask, residual connections and a few training tricks fixed it, each checked with runnable code.
---

:::goals
- explain the **history** that leads to the Transformer: one model per task, word embeddings, RNNs, attention
- compare **word, character and subword** tokenisation and why BPE won
- show why **one-hot vectors** carry no similarity, and how **Word2vec** learns meaningful vectors from a proxy task
- demonstrate numerically why **RNNs forget** (vanishing gradients) and why **residual connections** help
- compute **self-attention with a causal mask** and track the **matrix shapes** of the original Transformer
- explain **label smoothing**, **dropout** and **layer norm** as training aids
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 1** that you supplied, explained in my own words with **original, runnable Python** (standard library only). Numbers shown are computed here. This lesson complements the existing deep dive "Inside the Transformer" (which builds a BPE tokenizer and a full attention calculation); here the focus is the **story and the reasons**.
:::

## 1. How we got here

| Period | State of the art | Limit |
|---|---|---|
| **2010s** | **one model per task** (sentiment, translation, named entities), mostly **RNNs** | little transfer between tasks, slow to train |
| **2017** | "**Attention Is All You Need**": the **Transformer** | trained in parallel, **scales** with data, compute and parameters |
| **Then** | scale the Transformer up, in model size and tokens trained on | modern LLMs |
| **2022** | ChatGPT makes the interface a chat | mass adoption |
| **Now** | coding agents, new paradigms (diffusion LLMs, on-policy distillation) | the later lectures |

The key word is **scalable**: give the architecture more data, compute and parameters and **quality keeps improving**.

## 2. Tokenisation: three choices and a trade-off

Models understand numbers, not text, so text is first split into indivisible units, **tokens**. The set of allowed tokens is the **vocabulary**; the number of tokens in a text is its **sequence length**. They trade against each other.

| Method | Vocabulary | Sequence length | Problems |
|---|---|---|---|
| **Word-level** (split on spaces) | **very large** (every form: bear, bears) | short | related words share nothing; **out-of-vocabulary** words at inference |
| **Character-level** | tiny | **very long** | slow (cost grows with length), characters carry little meaning |
| **Subword (BPE)** | tunable (**hundreds of thousands** for modern LLMs) | medium | needs a training corpus; efficiency depends on matching your languages |

**BPE (byte-pair encoding)** starts from single characters and **repeatedly merges the most frequent adjacent pair** into a new token, until the vocabulary reaches the wanted size. Frequent words become single tokens, rare words split into pieces, so there is **no real out-of-vocabulary problem**. If you work in several languages, train the tokenizer on **all of them**, otherwise text in an under-represented language gets split into many tokens (more cost, less context).

**Special tokens** carry structure: `<unk>` unknown, `<bos>` / `<eos>` begin and end of sequence (generation starts from `<bos>` and stops when the model emits `<eos>`), `<pad>` fills batches to equal length, and chat markers such as user or assistant roles.

```run
mkdir -p ~/l1 && cd ~/l1
cat > bpe.py <<'PY'
from collections import Counter

corpus = "bear bears bearing teddy teddy bears reading read reader reads".split() * 5

def bpe(corpus, merges):
    words = [list(w) + ["_"] for w in corpus]            # "_" marks the end of a word
    learned = []
    for _ in range(merges):
        pairs = Counter()
        for w in words:
            for a, b in zip(w, w[1:]):
                pairs[(a, b)] += 1
        if not pairs: break
        (a, b), count = pairs.most_common(1)[0]
        learned.append((a + b, count))
        for w in words:
            i = 0
            while i < len(w) - 1:
                if w[i] == a and w[i + 1] == b:
                    w[i:i + 2] = [a + b]
                else:
                    i += 1
    return words, learned

for merges in (0, 4, 12):
    words, learned = bpe(corpus, merges)
    seq_len = sum(len(w) for w in words)
    base = {c for w in corpus for c in w} | {"_"}
    vocab_size = len(base) + merges                          # the characters plus one new token per merge
    print(f"{merges:2} merges: vocabulary size {vocab_size:3}, total tokens {seq_len:3}   e.g. 'bearing' -> {words[2]}")
print("\nmerge order (token, times seen):", [f"{t}({c})" for t, c in bpe(corpus, 8)[1]])
PY
python3 bpe.py
```

**What you see:** with **no merges** the vocabulary is tiny but the sequence is long; with **more merges** the vocabulary grows and the total token count falls. That is the vocabulary-versus-length trade-off in numbers.

## 3. Representing tokens: from one-hot to learned embeddings

The naive representation is **one-hot**: a vector with one `1` and zeros elsewhere. Every pair of different tokens is then **perpendicular**: their dot product is 0, so "teddy" is no closer to "soft" than to "airplane". We want **vectors where similarity means something**.

**Word2vec** learns such vectors through a **proxy task** (a task we do not care about for its own sake): predict a word from its neighbours (**CBOW**) or the neighbours from a word (**skip-gram**). A tiny network turns a one-hot input into a small **hidden vector** (size `d`, much smaller than the vocabulary `V`) and then into probabilities over the vocabulary; the **hidden vector is the embedding**. Words that appear in similar contexts end up with similar vectors.

Train a tiny skip-gram from scratch on a toy corpus:

```run
cd ~/l1
cat > w2v.py <<'PY'
import math, random
random.seed(1)

sentences = [
    "teddy bear is soft", "plush bear is soft", "teddy toy is soft", "plush toy is soft",
    "airplane flies fast", "jet flies fast", "airplane flies high", "jet flies high",
] * 20
vocab = sorted({w for s in sentences for w in s.split()})
ix = {w: i for i, w in enumerate(vocab)}
V, D, LR = len(vocab), 6, 0.05
W1 = [[random.uniform(-.5, .5) for _ in range(D)] for _ in range(V)]     # word -> hidden (the embeddings)
W2 = [[random.uniform(-.5, .5) for _ in range(V)] for _ in range(D)]     # hidden -> scores

def softmax(v):
    m = max(v); e = [math.exp(x - m) for x in v]; s = sum(e)
    return [x / s for x in e]

pairs = []
for s in sentences:
    ws = s.split()
    for i, w in enumerate(ws):
        for j in (i - 1, i + 1):
            if 0 <= j < len(ws): pairs.append((ix[w], ix[ws[j]]))

for epoch in range(40):
    random.shuffle(pairs); loss = 0
    for c, t in pairs:                                  # centre word -> predict neighbour
        h = W1[c]
        scores = [sum(h[d] * W2[d][v] for d in range(D)) for v in range(V)]
        p = softmax(scores)
        loss -= math.log(p[t])
        grad = p[:]; grad[t] -= 1                       # d loss / d scores
        gh = [sum(grad[v] * W2[d][v] for v in range(V)) for d in range(D)]
        for d in range(D):
            for v in range(V):
                W2[d][v] -= LR * grad[v] * h[d]
            W1[c][d] -= LR * gh[d]
    if epoch in (0, 39): print(f"epoch {epoch:2}: average loss {loss / len(pairs):.3f}")

def cos(a, b):
    na = math.sqrt(sum(x * x for x in a)); nb = math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b)) / (na * nb)

print("\nsimilarity of learned embeddings:")
for a, b in [("teddy", "plush"), ("bear", "toy"), ("airplane", "jet"), ("teddy", "airplane"), ("bear", "fast")]:
    print(f"  {a:9} vs {b:9}: {cos(W1[ix[a]], W1[ix[b]]):6.2f}")
PY
python3 w2v.py
```

**What you see:** the loss falls, and words used in the same contexts (**teddy/plush**, **airplane/jet**) become **similar**, while unrelated pairs do not. Meaning has emerged from a proxy task, with no labels.

**Limits of Word2vec:** each word gets **one vector, whatever the sentence** ("bank" of a river and a bank for money are the same), and it **ignores word order** ("the child hugs the bear" versus "the bear hugs the child").

## 4. Recurrent networks, and why they forgot

An **RNN** processes tokens **one at a time** and carries a **hidden state** summarising the sequence so far, which fixes order. But it has two problems:

1. **Long-range dependency:** everything the past contributes must be squeezed into **one vector that keeps being overwritten**. By the time we read "it" two sentences later, what "it" refers to may be gone. During training, gradients are **multiplied at every step** backwards; if each factor is below 1 they **shrink exponentially** (the **vanishing gradient**). **LSTM** added a separate cell state to carry information further, but did not remove the limit.
2. **Sequential:** to predict the next token you need the state from the previous one, so **training cannot be parallelised** across the sequence, which is slow.

Watch the shrinking happen:

```run
cd ~/l1
cat > vanish.py <<'PY'
import math

# A scalar "RNN": h_t = tanh(w * h_(t-1) + x_t). The gradient of h_T with respect to h_0 is a product of factors w * (1 - tanh^2).
def grad_through(steps, w):
    h, g = 0.5, 1.0
    for t in range(steps):
        h = math.tanh(w * h + 0.1)
        g *= w * (1 - h * h)
    return g

print(f"{'steps back':>10} {'w=0.9':>14} {'w=0.5':>14}")
for steps in (1, 5, 10, 20, 50, 100):
    print(f"{steps:10} {grad_through(steps, 0.9):14.3e} {grad_through(steps, 0.5):14.3e}")
print("\nAfter 50 steps the signal from the first token is vanishingly small: the model cannot learn that it mattered.")
PY
python3 vanish.py
```

## 5. Attention: direct links instead of one overwritten state

The fix is to let each token **look directly at earlier tokens** and learn which matter. Self-attention uses three views of every token, produced by learned projection matrices:

- **Query (Q):** what this token is looking for
- **Key (K):** what this token offers
- **Value (V):** what it hands over if chosen

The output for a token is a **weighted average of values**, with weights from **how well its query matches each key**:

`Attention(Q, K, V) = softmax(Q·Kᵀ / √d_k) · V`

Read it as a matrix product: `Q·Kᵀ` is an **n × n table of similarities** (row = a query token, column = a key token); softmax turns each row into **weights that sum to 1**; multiplying by `V` mixes the values. The division by `√d_k` keeps the dot products from growing with dimension (which would make the softmax too spiky).

Two details matter for the decoder:

- **Causal (masked) attention:** when generating, a token must **not see the future**. Set the scores for future positions to **−∞** before the softmax (so their weight is exactly 0). The mask is a **triangular** pattern.
- **Order is lost**, because attention treats tokens as a set, so **position information** must be added (Lecture 2 covers modern ways).

```run
cd ~/l1
cat > attention.py <<'PY'
import math

def softmax(v):
    m = max(v); e = [math.exp(x - m) for x in v]; s = sum(e)
    return [x / s for x in e]

def matmul(a, b): return [[sum(x * y for x, y in zip(r, c)) for c in zip(*b)] for r in a]
def transpose(a): return [list(r) for r in zip(*a)]

tokens = ["a", "cute", "teddy", "bear"]
# toy 3-dim queries, keys, values (normally these come from learned projections of the embeddings)
Q = [[1, 0, 0], [0, 1, 0], [0, 1, 1], [1, 1, 0]]
K = [[1, 0, 0], [0, 1, 0], [0, 1, 1], [1, 0, 1]]
V = [[1, 0], [0, 1], [1, 1], [2, 0]]
d_k = len(K[0])

def attend(mask):
    scores = matmul(Q, transpose(K))
    out_w = []
    for i, row in enumerate(scores):
        row = [s / math.sqrt(d_k) for s in row]
        if mask:
            row = [s if j <= i else float("-inf") for j, s in enumerate(row)]
        out_w.append(softmax(row))
    return out_w, matmul(out_w, V)

for mask in (False, True):
    w, out = attend(mask)
    print("causal mask" if mask else "no mask (encoder-style)")
    for t, row, o in zip(tokens, w, out):
        print(f"  {t:6} weights {[round(x, 2) for x in row]}  rows sum to {sum(row):.2f}  output {[round(x, 2) for x in o]}")
    print()
PY
python3 attention.py
```

**What you see:** without the mask every row spreads weight over all tokens; with the mask, row *i* has **zero weight on later tokens**, and the first token can only attend to itself. Each row of weights **sums to 1**.

## 6. The original Transformer in numbers

The original paper was about **translation**, so it has two parts:

- **Encoder** (reads the source): self-attention, then a feed-forward network; repeated **N = 6** times. Each token ends up with a **context-aware vector**.
- **Decoder** (writes the target): **masked self-attention** (sees only what it has written), then **cross-attention** (**queries come from the decoder; keys and values come from the encoder output**, so the decoder looks at the source), then a feed-forward network. A final **linear + softmax** over the vocabulary predicts the next token. Generation is **auto-regressive**: feed `<bos>`, take the most likely token, append it, repeat until `<eos>`.

**Shapes** (n tokens, model width `d_model`): the projections map `d_model → d_q`, `d_k`, `d_v` with `d_q = d_k` (so `Q·Kᵀ` is defined). **Multi-head attention** runs **h** attention computations in parallel with different projections (like several filters in a convolution), concatenates the results (`h·d_v` wide) and maps back to `d_model` with `W_O`. The feed-forward network expands `d_model → d_ff` (larger) and back. So **most parameters live in the feed-forward layers**, and the attention layer is the mechanism that mixes tokens.

```run
cd ~/l1
cat > params.py <<'PY'
d_model, heads, d_ff, layers, vocab = 512, 8, 2048, 6, 32000      # sizes of the original "base" model
d_k = d_model // heads

attn = 4 * d_model * d_model                  # Wq, Wk, Wv, Wo (all heads together)
ffn = 2 * d_model * d_ff
print(f"per layer: attention {attn:,} parameters, feed-forward {ffn:,} parameters ({ffn / (attn + ffn):.0%} of the layer)")
embed = vocab * d_model
enc = layers * (attn + ffn)
dec = layers * (2 * attn + ffn)               # masked self-attention + cross-attention + ffn
print(f"embeddings {embed:,}   encoder {enc:,}   decoder {dec:,}   total about {embed + enc + dec:,}")
print(f"head size d_k = {d_model}/{heads} = {d_k}; the attention score table is n x n, so memory for scores grows with n squared")
PY
python3 params.py
```

## 7. Tricks that make deep stacks trainable

- **Residual connections:** each sublayer computes `x + f(x)` instead of `f(x)`. The layer **modifies** its input rather than replacing it, which gives gradients a **direct path** backwards.
- **Layer normalisation:** rescales each token's activations (more in Lecture 2).
- **Dropout:** during training, randomly **zero some units**, so the model cannot rely on a few features.
- **Label smoothing:** the target for "day" in "what a nice day" is not 100% "day" (other words are valid too); use **90% for the true token and spread 10% over the others**, which improves generalisation.

```run
cd ~/l1
cat > tricks.py <<'PY'
import math, random
random.seed(5)

# 1. Residual connections: a 60-layer stack of random layers f(x) = tanh(Wx) with small weights
def layer(x, W): return [math.tanh(sum(w * v for w, v in zip(row, x))) for row in W]
D = 8
Ws = [[[random.gauss(0, 0.2) for _ in range(D)] for _ in range(D)] for _ in range(60)]
norm = lambda v: math.sqrt(sum(a * a for a in v))

def run(x, residual):
    for W in Ws:
        x = [a + b for a, b in zip(x, layer(x, W))] if residual else layer(x, W)
    return x

x0 = [random.gauss(0, 1) for _ in range(D)]
x1 = [v + 0.01 for v in x0]                     # nudge the input a little
print("after 60 layers, how much does a small change at the input still change the output?")
for name, res in (("plain stack", False), ("with residual links", True)):
    a, b = run(x0, res), run(x1, res)
    print(f"  {name:19}: output size {norm(a):9.4f}   output change / input change = {norm([p - q for p, q in zip(a, b)]) / norm([p - q for p, q in zip(x0, x1)]):.4f}")

# 2. Label smoothing
vocab = ["day", "class", "evening", "night", "morning"]
eps = 0.1
smooth = {w: (1 - eps) if w == "day" else eps / (len(vocab) - 1) for w in vocab}
print("\nlabel smoothing target for 'what a nice ___':", {k: round(v, 3) for k, v in smooth.items()}, " sum =", round(sum(smooth.values()), 3))

# 3. Dropout (inverted): scale kept units so the expected value is unchanged
x = [1.0] * 10000
p = 0.2
dropped = [0 if random.random() < p else v / (1 - p) for v in x]
print(f"\ndropout p=0.2: {sum(1 for v in dropped if v == 0) / len(x):.1%} of units zeroed, mean after scaling {sum(dropped) / len(x):.3f} (expected 1.000)")
PY
python3 tricks.py
```

**What you see:** in the plain stack the output is **tiny and almost insensitive** to the input (the signal, and with it any gradient, has vanished); with residual links the output **still responds** to the input (the change ratio stays well above zero). Label smoothing gives the true token 0.9 and the others 0.025 each. Dropout zeroes about 20% of units and rescales so the **average is preserved**.

:::warn Common mistakes
- **Believing attention "understands order"**: without position information it is order-blind.
- **Mixing up where Q, K and V come from in cross-attention:** queries from the **decoder**, keys and values from the **encoder**.
- **Treating the mask as part of the softmax output:** it is applied **to the scores before** the softmax (−∞), so the weights are exactly 0 and the row still sums to 1.
- **Thinking subword tokenisation is language-neutral:** a tokenizer trained on English splits other languages into many pieces.
- **Reading "Word2vec" as the end of the story:** it is context-free; Transformers produce **contextual** vectors.
:::

## 8. Interview-style questions

- **"Why did Transformers replace RNNs?"** Direct token-to-token links fix long-range dependency, and **training parallelises across the sequence**, so it scales with data and compute.
- **"Why the √d_k?"** Dot products grow with dimension; dividing keeps the variance steady so the softmax does not saturate.
- **"What is the cost of self-attention?"** **O(n²)** in sequence length for time and score memory; that motivates Lecture 2's variants and Lecture 4's FlashAttention.
- **"Where are most of the parameters?"** In the **feed-forward** layers (about two thirds of each layer in the base model).

:::try
1. In `bpe.py` raise the merges to 30 and watch the vocabulary and token count. Where do returns diminish?
2. In `w2v.py` add a sentence that uses "bank" in two senses. Why can't the model separate them?
3. In `vanish.py` try `w = 1.1`. What happens to the gradient, and what is that phenomenon called?
4. In `attention.py` change `Q` so the last token strongly prefers the first key. Check the masked output.
:::

:::recap
- The Transformer replaced task-specific **RNNs** because it **scales**: attention gives direct links and parallel training.
- **Subword (BPE) tokenisation** balances vocabulary size and sequence length; special tokens carry structure.
- **Embeddings** are learned through proxy tasks; Word2vec is **context-free**, RNNs forget over long ranges, attention is **contextual and direct**.
- Attention is `softmax(QKᵀ/√d_k)V`; the decoder adds a **causal mask** and **cross-attention** to the encoder.
- **Residual connections, layer norm, dropout and label smoothing** make deep stacks trainable and general.
:::

:::quiz
? Why does BPE avoid the out-of-vocabulary problem?
- It stores every word ever written
+ Rare words are split into smaller known pieces down to single characters
- It ignores unknown words
! Subword units can always spell a new word.

? What does the causal mask do?
- Hides the keys of the encoder
+ Sets scores for future positions to minus infinity before the softmax so they get zero weight
- Removes the softmax
! A token may only attend to itself and earlier tokens.

? In cross-attention, where do the keys and values come from?
- The decoder's own previous tokens
+ The encoder's output
- A lookup table
! Queries come from the decoder, and it looks at the source through keys and values.

? What problem do residual connections mainly address?
- Vocabulary size
+ Training deep stacks: gradients and the signal keep a direct path
- Overfitting to the test set
! x + f(x) lets layers refine rather than replace.

? What does label smoothing do?
- Makes labels one-hot
+ Moves a little probability mass from the true token to the others, improving generalisation
- Removes the softmax
! Language has several valid continuations.
:::
