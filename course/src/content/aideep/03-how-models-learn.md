---
track: aideep
title: Deep dive 3: how models learn
short: How models learn
sub: Companion to chapter 3. Gradient descent, a tiny model that really learns, scaling arithmetic and data cleaning, in code.
---

:::goals
- explain loss, gradient, learning rate and an update step with working code
- train a small next-word model by gradient descent and watch the loss fall
- do the scaling arithmetic: compute (6ND), tokens per parameter, training memory
- clean a dataset: exact and near-duplicate removal and simple quality filters
:::

## 1. Learning is repeated small corrections

Every neural network is trained with the same loop:

1. **Forward**: run an example through the model, get a prediction.
2. **Loss**: measure how wrong it was (one number).
3. **Gradient**: compute, for every adjustable number (weight), which direction and how strongly changing it would reduce the loss. (This is **backpropagation**; frameworks do it automatically.)
4. **Update**: nudge every weight a small step against the gradient: `w = w - learning_rate x gradient`.
5. Repeat millions of times.

Here is the whole idea with **one weight**, so you can see every number. We fit the line `y = w x` to data where the true answer is `w = 3`.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > gd.py <<'EOF'
xs = [1.0, 2.0, 3.0, 4.0]
ys = [3.0, 6.0, 9.0, 12.0]            # true relationship: y = 3x

def loss_and_grad(w):
    # mean squared error and its derivative with respect to w
    n = len(xs)
    loss = sum((w * x - y) ** 2 for x, y in zip(xs, ys)) / n
    grad = sum(2 * (w * x - y) * x for x, y in zip(xs, ys)) / n
    return loss, grad

for lr in (0.01, 0.05, 0.1):
    w = 0.0
    print(f"learning rate {lr}")
    for step in range(1, 7):
        loss, grad = loss_and_grad(w)
        w = w - lr * grad
        print(f"  step {step}: loss before = {loss:9.4f}   gradient = {grad:8.3f}   w -> {w:7.3f}")
    print()

# Too large a learning rate overshoots and diverges
w = 0.0
print("learning rate 0.3 (too big)")
for step in range(1, 7):
    loss, grad = loss_and_grad(w)
    w = w - 0.3 * grad
    print(f"  step {step}: loss before = {loss:12.2f}   w -> {w:10.3f}")
EOF
python3 gd.py
```

Look at the runs: 0.01 creeps towards `w = 3` slowly; 0.05 converges in about five steps; 0.1 **overshoots and zigzags** (the gradient flips sign each step) before settling; and 0.3 **overshoots by more than it corrects, so the loss explodes**. Choosing the learning rate (and a schedule that shrinks it over time) is one of the most important training decisions. Real models add an **optimiser** such as **Adam**, which keeps running averages of past gradients to take smarter steps per weight.

## 2. A model that really learns: next-word prediction

Now a real (tiny) language model trained exactly this way. Each word has a row of scores for the next word (a table of weights). We train with cross-entropy loss and gradient descent, with no counting shortcut.

```run
cd ~/lab/ai
cat > learn_lm.py <<'EOF'
import math, random

text = ("the vault stores the item . the index finds the item . the vault stores the mail . "
        "the index reads the mail . the service stores the index .").split()
vocab = sorted(set(text))
ix = {w: i for i, w in enumerate(vocab)}
V = len(vocab)
pairs = [(ix[a], ix[b]) for a, b in zip(text, text[1:])]

random.seed(1)
W = [[random.uniform(-0.1, 0.1) for _ in range(V)] for _ in range(V)]   # W[prev][next] = score

def softmax(row):
    m = max(row); e = [math.exp(x - m) for x in row]; s = sum(e); return [v / s for v in e]

def avg_loss():
    return sum(-math.log(softmax(W[a])[b]) for a, b in pairs) / len(pairs)

print(f"vocabulary: {V} words; training pairs: {len(pairs)}")
print(f"loss before training: {avg_loss():.3f}   (uniform guess would be {math.log(V):.3f})")
lr = 0.5
for epoch in range(1, 201):
    for a, b in pairs:
        p = softmax(W[a])
        for j in range(V):                       # gradient of cross-entropy w.r.t. the scores
            W[a][j] -= lr * (p[j] - (1.0 if j == b else 0.0)) / len(pairs)
    if epoch in (1, 5, 20, 50, 100, 200):
        print(f"epoch {epoch:3}: loss = {avg_loss():.3f}")

print()
for w in ("the", "vault", "index"):
    p = softmax(W[ix[w]])
    top = sorted(zip(vocab, p), key=lambda x: -x[1])[:3]
    print(f"after {w!r:8} the model predicts:", ", ".join(f"{t} {q:.2f}" for t, q in top))
EOF
python3 learn_lm.py
```

The loss starts at the uniform guess (`ln V`, "I know nothing") and falls steadily. Afterwards the model has **learned statistics from the text**: after "vault" it predicts "stores" with high probability. Nobody wrote that rule; gradient descent found weights that make it true. A real LLM is the same loop with billions of weights, a transformer instead of a table, and trillions of tokens.

**Watch for overfitting.** This toy model can reach very low loss by memorising its tiny corpus. Real training keeps a **validation set** (text the model never trains on) and watches its loss: if training loss falls while validation loss rises, the model is memorising, not generalising.

## 3. Scaling arithmetic you should be able to do

Rules of thumb used throughout the field:

| Quantity | Rule of thumb |
|---|---|
| Training compute | **C = 6 x N x D** floating-point operations, N = parameters, D = training tokens |
| Compute-optimal data (Chinchilla) | about **20 tokens per parameter** for a given compute budget (many modern models train on far more, to make inference cheaper) |
| Training memory | about **16 bytes per parameter** with Adam in mixed precision (weights, gradients, optimiser state) |
| GPU throughput | a modern accelerator delivers perhaps 30% to 50% of its peak in practice |

```run
cd ~/lab/ai
cat > scaling.py <<'EOF'
def train_cost(n_params, n_tokens, gpu_tflops=400, utilisation=0.4, gpu_hour_price=2.5):
    flops = 6 * n_params * n_tokens
    effective = gpu_tflops * 1e12 * utilisation        # useful FLOPs per second per GPU
    gpu_seconds = flops / effective
    gpu_hours = gpu_seconds / 3600
    return flops, gpu_hours, gpu_hours * gpu_hour_price

print(f"{'model':>8} {'tokens':>9} {'tok/param':>10} {'FLOPs':>11} {'GPU-hours':>11} {'est. $':>12}   (illustrative: 400 TFLOPs GPUs, 40% use, $2.5/h)")
for n, d in [(1e9, 20e9), (7e9, 140e9), (7e9, 2e12), (70e9, 1.4e12), (400e9, 15e12)]:
    f, h, c = train_cost(n, d)
    print(f"{n/1e9:7.0f}B {d/1e9:8.0f}B {d/n:10.0f} {f:11.2e} {h:11,.0f} {c:12,.0f}")

print()
for n in (1e9, 7e9, 70e9):
    print(f"training memory for {n/1e9:>3.0f}B parameters: about {n*16/1e9:7.0f} GB  (so it must be spread over many GPUs)")
EOF
python3 scaling.py
```

Takeaways: cost grows with **both** model size and data; training a frontier model costs millions of dollars, which is why almost everyone **uses or fine-tunes existing models**; and memory needs force **parallelism** (splitting the model, data and optimiser state across hundreds or thousands of GPUs), which is why training is as much a systems problem as a maths one. **Scaling laws** show loss falls predictably as a power law with more compute, data and parameters, which is how labs decide what to build before spending the money.

## 4. The data: "the internet" is dirty

Raw web text is full of duplicates, spam, boilerplate, machine-generated junk, personal data and benchmark leakage. Data teams spend as much effort cleaning as engineers spend on architecture. Typical steps:

| Step | Why |
|---|---|
| Extract text from HTML, drop navigation and ads | models should learn from content |
| **Deduplicate** (exact and near-duplicate) | duplicates cause memorisation and waste compute |
| Language and quality filtering | remove gibberish, thin pages, spam |
| Safety and privacy filtering | remove personal data, illegal content |
| **Decontamination** | remove test-set questions so evaluation is honest |
| Mix and weight sources | code, books, reference, conversations in chosen proportions |

Near-duplicate detection is a good small example: compare **sets of word shingles** (short word sequences) with **Jaccard similarity** (size of the overlap divided by size of the union).

```run
cd ~/lab/ai
cat > dedupe.py <<'EOF'
docs = {
    "a": "The Enterprise Vault indexing service reads archived mail and builds a searchable index of every item.",
    "b": "The Enterprise Vault indexing service reads archived mail and builds a searchable index of every single item!",
    "c": "Click here to subscribe! Click here to subscribe! Click here to subscribe! Buy now buy now buy now.",
    "d": "Storage expiry deletes items whose retention category has passed, after the grace period ends.",
    "e": "The Enterprise Vault indexing service reads archived mail and builds a searchable index of every item.",
}
def shingles(text, k=3):
    w = [x.strip(".,!?").lower() for x in text.split()]
    return {tuple(w[i:i+k]) for i in range(len(w) - k + 1)}
def jaccard(x, y):
    return len(x & y) / len(x | y)

names = list(docs)
S = {n: shingles(docs[n]) for n in names}
print("pairs with Jaccard similarity above 0.5 (near-duplicates):")
for i, a in enumerate(names):
    for b in names[i+1:]:
        j = jaccard(S[a], S[b])
        if j > 0.5:
            print(f"  {a} ~ {b}: {j:.2f}")

def quality(text):
    words = [w.lower().strip(".,!?") for w in text.split()]
    uniq = len(set(words)) / len(words)
    return uniq
print()
print("fraction of unique words (low = repetitive spam):")
for n in names:
    print(f"  {n}: {quality(docs[n]):.2f}")
kept = [n for n in names if quality(docs[n]) > 0.6 and not any(jaccard(S[n], S[m]) > 0.5 for m in names[:names.index(n)])]
print()
print("kept after removing duplicates and repetitive junk:", kept)
EOF
python3 dedupe.py
```

Document "e" is an exact copy of "a"; "b" is a near copy; "c" is repetitive spam. A simple pipeline keeps one of each real document. The same logic at web scale (using hashing tricks like MinHash) is a standard first step in every training pipeline.

## Common misconceptions

- "Training stores the documents." It adjusts weights; some text can be memorised, especially if duplicated, which is a privacy risk, but the model is not a compressed archive you can query.
- "More data always helps." Cleaner, more diverse data usually beats more raw data.
- "The loss going down means the model is getting smarter at everything." It means better next-token prediction on that data; capabilities and safety need separate measurement.
- "Fine-tuning and pre-training are the same cost." Fine-tuning touches little data and often only a few extra weights (LoRA), costing a tiny fraction.

## Practice (answers below)

1. In `gd.py` the gradient at `w = 0` was large and negative. Why does `w = w - lr x gradient` move `w` upwards?
2. A 7B model is trained on 140B tokens. How many tokens per parameter, and how does that compare with the Chinchilla rule?
3. Roughly how much GPU memory does training a 7B model need before any parallelism tricks?
4. Why remove benchmark questions from the training data?

:::note Answers
1. Subtracting a negative number adds to `w`, moving it toward the lower loss.
2. 140B / 7B = 20 tokens per parameter, exactly the Chinchilla rule of thumb.
3. About 7B x 16 bytes = about 112 GB, more than one GPU, so it must be sharded.
4. If the model saw the test answers, measured scores would overstate real ability (contamination).
:::

:::recap
- Training = forward, loss, gradient, small update, repeated: `w = w - lr x gradient`. Learning rate matters: too low is slow, too high diverges.
- A real (tiny) model learned statistics by gradient descent; validation loss detects overfitting.
- Compute is about 6ND; about 20 tokens per parameter is compute-optimal; training memory is about 16 bytes per parameter.
- Data quality work (dedupe, filter, decontaminate) is a core part of building a model.
:::

:::quiz
? What does a gradient tell you?
+ How the loss changes if each weight is changed, so you can step downhill
- The size of the dataset
- The next token
- The context length
! Gradient descent follows it in the opposite direction.
? Training loss keeps falling but validation loss starts rising. What is happening?
+ Overfitting: the model is memorising the training data
- The learning rate is perfect
- The model is getting smarter
- The data is clean
! Stop earlier, add data or regularise.
? What is the point of removing near-duplicate documents?
+ Less memorisation and wasted compute on repeated text
- Smaller vocabulary
- Longer context
- Better tokenisation
! Duplicates are over-weighted in learning.
? Roughly how much compute does training cost?
+ 6 x parameters x training tokens
- parameters + tokens
- 100 x parameters
- tokens squared
! It scales with both model size and data.
:::
