---
track: lectures
title: "Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA"
short: L4 Training LLMs
sub: The three training stages, scaling-law arithmetic, why training needs many GPUs and how ZeRO and parallelism share the load, FlashAttention's tiling trick, reduced precision, supervised fine-tuning and LoRA, each with a runnable check.
---

:::goals
- describe the **stages**: pre-training, (mid-training), supervised fine-tuning, then preference tuning
- do **scaling-law and memory arithmetic** (FLOPs, tokens per parameter, bytes per parameter)
- explain **data, tensor, pipeline and expert parallelism** and **ZeRO** sharding, and check why averaged gradients are exact
- verify that **FlashAttention's tiled, online softmax** gives the **exact** same answer as the standard formula
- explain **mixed precision, quantisation (absmax, NF4)** and **recomputation**
- explain **SFT** (loss only on the response) and **LoRA / QLoRA** with a working low-rank fit
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 4**, explained in my own words with **original, runnable Python** (standard library only) on **toy-sized problems**. The memory and compute formulas are standard rules of thumb; the GPU throughput figure used for time estimates is an **assumption** (labelled), not a measurement.
:::

## 1. Transfer learning and the stages of training

Ten years ago each task got its own model. **Transfer learning** reuses what a model already knows: **pre-train** once on general data, then **tune** for your need. For LLMs:

| Stage | Data | Objective | Result |
|---|---|---|---|
| **Pre-training** | the internet-scale corpus: web pages (Common Crawl, billions of pages per month), Wikipedia, forums, code (GitHub, Stack Overflow); **hundreds of billions to tens of trillions of tokens** (GPT-3: 300 billion; Llama 3: 15 trillion) | **predict the next token** | knows language and code, but only **autocompletes** |
| **(Mid-training)** | higher-quality, task-aligned data, same objective | next token | a newer, in-between step |
| **SFT (supervised fine-tuning, instruction tuning)** | small, **high-quality (instruction, answer)** pairs (thousands to ~10 million examples) | next token on the **answer only** | behaves like an **assistant** |
| **Preference tuning** | pairs "this answer is better than that" | RL / DPO (Lecture 5) | tone, safety, helpfulness |

Pre-training is **by far the most expensive** step (millions to hundreds of millions of dollars). Its limits: **cost**, a **knowledge cut-off** (the model knows nothing after its data ended), and **plagiarism/memorisation risk**. Editing knowledge afterwards without damage elsewhere is hard.

## 2. Scaling laws and the arithmetic you should do

Experiments (the 2020 **scaling laws** paper) showed test loss **falls smoothly** as **compute**, **data** and **parameters** grow, and bigger models are more **sample-efficient**. Given a fixed compute budget, what size and how many tokens? The **Chinchilla** result: spend compute roughly evenly, which means about **20 training tokens per parameter**. By that rule GPT-3 (175 B parameters, 300 B tokens) was **under-trained**. Labs reproduce this analysis for their own setup on small models, then extrapolate.

Two unit names to keep straight: **FLOPs** (a count of floating-point operations, how much compute a task needs) and **FLOP/s** (a speed, what hardware delivers). A common estimate is **training FLOPs ≈ 6 × parameters × tokens** (for a dense model).

```run
mkdir -p ~/l4 && cd ~/l4
cat > scaling.py <<'PY'
def train_flops(params, tokens): return 6 * params * tokens

models = [("GPT-3 (as published)", 175e9, 300e9), ("Chinchilla-optimal 175B", 175e9, 20 * 175e9), ("Llama-3-class 70B, 15T tokens", 70e9, 15e12)]
THROUGHPUT = 4e14          # ASSUMPTION: 400 TFLOP/s sustained per GPU (about 40% of a modern accelerator's peak)
print(f"{'model':32} {'tokens/param':>12} {'FLOPs':>10} {'GPU-days (assumed 4e14 FLOP/s)':>32}")
for name, n, d in models:
    f = train_flops(n, d)
    print(f"{name:32} {d / n:12.1f} {f:10.2e} {f / THROUGHPUT / 86400:32,.0f}")
print("\nFor a fixed budget C = 6*N*D with D = 20*N:  N = sqrt(C / 120)")
for C in (1e21, 1e23, 1e25):
    N = (C / 120) ** 0.5
    print(f"  budget {C:.0e} FLOPs -> about {N / 1e9:7.1f} B parameters trained on {20 * N / 1e9:8.0f} B tokens")
PY
python3 scaling.py
```

**What you see:** GPT-3 used about **1.7 tokens per parameter**; the compute-optimal recipe would use **20**. A budget of 10²⁵ FLOPs (the order of magnitude the lecture quotes for frontier training) buys roughly a **290 B-parameter model on about 5.8 T tokens**. GPU-day figures depend entirely on the assumed throughput; treat them as orders of magnitude.

## 3. Why training needs many GPUs: the memory bill

One training step does a **forward pass** (compute **activations**, which must be kept for the backward pass), a **loss**, a **backward pass** (compute and store a **gradient** for every parameter) and an **optimiser update**. **Adam** also keeps two extra values per parameter (moving averages of the gradient and squared gradient). Activation memory grows with **model size, batch size and context length** (attention scores are `n × n`).

In the usual **mixed-precision** setup, per parameter you store: weights in 16-bit (2 bytes), gradients 16-bit (2), a **32-bit master copy** of weights (4), Adam's two moments in 32-bit (4 + 4) = **16 bytes per parameter**, before counting activations. An 80 GB GPU (H100 class) cannot hold a large model's training state:

```run
cd ~/l4
cat > memory.py <<'PY'
GB = 1e9
def state_gb(params): return params * 16 / GB

print("training state per model (16 bytes/parameter, before activations):")
for name, p in [("1B", 1e9), ("7B", 7e9), ("70B", 70e9)]:
    print(f"  {name:4}: {state_gb(p):8.0f} GB   (one 80 GB GPU: {'fits' if state_gb(p) < 80 else 'does NOT fit'})")

print("\nZeRO sharding of a 7B model across N GPUs (GB per GPU for model state):")
p = 7e9
weights, grads, opt = p * 2 / GB, p * 2 / GB, p * 12 / GB          # 12 = fp32 master + 2 moments
print(f"{'GPUs':>5} {'plain DP':>9} {'ZeRO-1':>8} {'ZeRO-2':>8} {'ZeRO-3':>8}")
for n in (1, 4, 8, 64):
    print(f"{n:5} {weights + grads + opt:9.1f} {weights + grads + opt / n:8.1f} {weights + (grads + opt) / n:8.1f} {(weights + grads + opt) / n:8.1f}")
PY
python3 memory.py
```

**What you see:** a 7B model needs about **112 GB** of training state, more than one GPU. **ZeRO** (zero redundancy optimiser) removes the duplicated copies: **stage 1** shards the optimiser state, **stage 2** also the gradients, **stage 3** also the parameters, at the price of more **communication**.

## 4. Parallelism

| Family | Idea | Notes |
|---|---|---|
| **Data parallelism (DP)** | every GPU has a **full model copy** and a **slice of the batch**; **gradients are averaged** across GPUs | reduces activation memory per GPU; costs communication; the model must fit on one GPU (or use ZeRO) |
| **Tensor parallelism** | split a big **matrix multiplication** across GPUs | needs fast links |
| **Pipeline parallelism** | GPU 1 holds layers 1 to 3, GPU 2 layers 4 to 6, etc. | micro-batches keep GPUs busy |
| **Expert parallelism** | one **MoE expert per device** | tokens are routed across devices |

Data parallelism works because **the gradient of an averaged loss is the average of the gradients**. Verify:

```run
cd ~/l4
cat > dp.py <<'PY'
import random
random.seed(9)
# linear model y = w*x + b, squared-error loss, one gradient step
data = [(x, 3 * x + 1 + random.gauss(0, 0.1)) for x in [random.uniform(-2, 2) for _ in range(64)]]
w, b = 0.5, 0.0

def grad(batch):
    gw = sum(2 * (w * x + b - y) * x for x, y in batch) / len(batch)
    gb = sum(2 * (w * x + b - y) for x, y in batch) / len(batch)
    return gw, gb

full = grad(data)
shards = [data[i::4] for i in range(4)]                       # 4 GPUs, 16 examples each
parts = [grad(s) for s in shards]
avg = (sum(p[0] for p in parts) / 4, sum(p[1] for p in parts) / 4)
print("gradient on the full batch      :", tuple(round(v, 6) for v in full))
print("average of 4 per-GPU gradients  :", tuple(round(v, 6) for v in avg))
print("identical:", all(abs(a - b) < 1e-9 for a, b in zip(full, avg)), "(the communication step is the all-reduce that does this average)")
PY
python3 dp.py
```

## 5. FlashAttention: same answer, far less memory traffic

A GPU has a **large but slower memory (HBM, tens of GB)** and a **tiny but much faster on-chip memory (SRAM, tens of MB)**. Standard attention writes the huge `n × n` score matrix to HBM, reads it back for the softmax, writes it again, reads it again to multiply by V: **memory traffic, not arithmetic, is the bottleneck**.

**FlashAttention** is **exact** (no approximation). It splits Q, K and V into **tiles** that fit in SRAM and computes the softmax **incrementally** (an **online softmax**), keeping for each row a running maximum `m` and running sum `s`, and **rescaling earlier partial results** whenever a new tile raises the maximum. A softmax over a long row equals a combination of softmaxes over pieces with the right scale factors, so the full matrix never has to exist. It also uses **recomputation**: in the backward pass it **recomputes** attention from tiles instead of storing the matrix, doing **more FLOPs but less memory traffic, so it is also faster**.

Check the "exact" claim with the online softmax on one query:

```run
cd ~/l4
cat > flash.py <<'PY'
import math, random
random.seed(5)
n, d, TILE = 40, 8, 8
q = [random.gauss(0, 1) for _ in range(d)]
K = [[random.gauss(0, 1) for _ in range(d)] for _ in range(n)]
V = [[random.gauss(0, 1) for _ in range(d)] for _ in range(n)]
scale = 1 / math.sqrt(d)
scores = [sum(a * b for a, b in zip(q, k)) * scale for k in K]

# standard: full softmax over all n scores, then weighted sum of V
m = max(scores); e = [math.exp(s - m) for s in scores]; z = sum(e)
standard = [sum(e[j] * V[j][c] for j in range(n)) / z for c in range(d)]

# tiled online softmax: process TILE keys at a time, keep running max, sum and output
run_m, run_s, acc = float("-inf"), 0.0, [0.0] * d
for start in range(0, n, TILE):
    tile = range(start, min(start + TILE, n))
    new_m = max(run_m, max(scores[j] for j in tile))
    rescale = math.exp(run_m - new_m) if run_m != float("-inf") else 0.0       # shrink what we had accumulated
    run_s *= rescale
    acc = [a * rescale for a in acc]
    for j in tile:
        w = math.exp(scores[j] - new_m)
        run_s += w
        acc = [a + w * v for a, v in zip(acc, V[j])]
    run_m = new_m
tiled = [a / run_s for a in acc]

print("standard :", [round(x, 6) for x in standard])
print("tiled    :", [round(x, 6) for x in tiled])
print("max difference:", max(abs(a - b) for a, b in zip(standard, tiled)))

# traffic estimate for n tokens (counting number reads/writes of the n x n score matrix)
for N in (1024, 8192):
    naive = 4 * N * N                      # write S, read S, write P, read P (floats)
    tiled_traffic = 4 * N * 64             # Q, K, V, O only (head size 64)
    print(f"N={N:5}: score-matrix traffic {naive:,} values vs tiled about {tiled_traffic:,} ({naive / tiled_traffic:.0f}x less)")
PY
python3 flash.py
```

**What you see:** the two outputs are **identical to floating-point rounding**, while the traffic estimate shows why avoiding the `n × n` matrix matters more as the sequence grows. Later versions (FlashAttention 2 and 3) re-tune the same idea to newer GPUs.

## 6. Smaller numbers: mixed precision and quantisation

A float is stored as **sign, exponent, mantissa**. **FP32** uses 32 bits; **FP16** and **BF16** use 16 (half the memory, and roughly **double the compute speed** on GPUs; BF16 keeps FP32's range with less precision). **Mixed-precision training:** do forward and backward in 16-bit but keep the **master weights and updates in 32-bit**, because an update is **tiny** relative to a weight and **rounds away** in 16-bit.

```run
cd ~/l4
cat > precision.py <<'PY'
import struct

def to_fp16(x): return struct.unpack("e", struct.pack("e", x))[0]

w = 1.0
print("a weight of 1.0 plus a tiny update of 0.0001, repeated 10,000 times (true result 2.0):")
w32 = 1.0
w16 = 1.0
for _ in range(10000):
    w32 += 0.0001                      # 32-bit-style accumulation (Python float is 64-bit; plays the master copy)
    w16 = to_fp16(w16 + 0.0001)        # accumulate in fp16: each step rounds
print(f"  accumulate in high precision: {w32:.4f}")
print(f"  accumulate in fp16          : {w16:.4f}   (updates smaller than half the spacing of fp16 numbers near 1.0 are lost)")
print(f"\nfp16 spacing near 1.0 is about {to_fp16(1.0 + 2 ** -10) - 1.0:.6f}; largest fp16 number is {to_fp16(65504.0)}")
print("fp16 of 70000 ->", end=" ")
try: print(to_fp16(70000.0))
except OverflowError as e: print("overflow (BF16 avoids this by keeping fp32's exponent range)")
PY
python3 precision.py
```

**Quantisation** goes further, storing weights as **8-bit or 4-bit integers** plus a **scale** (and sometimes a zero-point). Simplest is **absmax**: scale by the largest absolute value. **NF4** (used in **QLoRA**) assumes weights are roughly **normally distributed** and places its 16 levels at **quantiles** of the normal distribution so each level is used about equally often, which suits weights better than evenly spaced levels. **Double quantisation** also quantises the scale constants.

```run
cd ~/l4
cat > quant.py <<'PY'
import random, statistics
random.seed(4)
weights = [random.gauss(0, 0.02) for _ in range(20000)]            # weights look roughly normal

def absmax_uniform(ws, bits):
    levels = 2 ** (bits - 1) - 1
    scale = max(abs(w) for w in ws) / levels
    return [round(w / scale) * scale for w in ws]

def quantile_levels(ws, bits):
    s = sorted(ws); n = 2 ** bits
    return [s[int((i + 0.5) * len(s) / n)] for i in range(n)]       # levels at data quantiles (NF4-like idea)
def snap(ws, levels): return [min(levels, key=lambda l: abs(l - w)) for w in ws]

def mse(a, b): return statistics.fmean((x - y) ** 2 for x, y in zip(a, b))
print("mean squared error when storing 20,000 normal-ish weights:")
for bits in (8, 4):
    print(f"  {bits}-bit absmax uniform levels: {mse(weights, absmax_uniform(weights, bits)):.3e}")
sample = weights[:3000]
lv = quantile_levels(weights, 4)
print(f"  4-bit quantile levels (NF4 idea) on 3000 weights: {mse(sample, snap(sample, lv)):.3e}")
print("\n4-bit weights take 8x less memory than fp32, 4x less than fp16.")
PY
python3 quant.py
```

**What you see:** more bits mean less error; at 4 bits, **quantile-placed levels** typically beat evenly spaced absmax levels on bell-shaped weights, because they spend resolution where the weights actually are.

## 7. Supervised fine-tuning (SFT)

After pre-training the model completes text; it does not answer. **SFT** continues training on (instruction, answer) pairs. Details that matter:

- The **loss is computed only on the answer tokens**: the instruction is given, not predicted (you do not want a model that parrots the question).
- The data is **small and high quality**: pre-training uses trillions of tokens, SFT thousands to millions of examples. It covers the use cases you want (writing, lists, explanations, maths, code) and **safety** (refusing harmful requests, hedging).
- Data can be **human-written** or **generated by a strong model and filtered** by humans or another model.
- **Distribution matters:** if your prompts differ from the training distribution the model generalises less well, and an ambiguous prompt gets a different answer each sample (temperature above 0).

```run
cd ~/l4
cat > sft.py <<'PY'
import math
# probabilities a model assigned to each target token (toy numbers)
prompt   = ["Can", "I", "wash", "my", "teddy", "bear", "?"]
response = ["No", ",", "hand", "wash", "it", "."]
p_prompt   = [0.02, 0.10, 0.05, 0.30, 0.04, 0.20, 0.35]
p_response = [0.20, 0.60, 0.15, 0.50, 0.40, 0.70]

def nll(ps): return -sum(math.log(p) for p in ps) / len(ps)
print(f"pre-training style loss (every token)      : {nll(p_prompt + p_response):.3f}  over {len(prompt + response)} tokens")
print(f"SFT loss (response tokens only)            : {nll(p_response):.3f}  over {len(response)} tokens")
print("\nThe prompt tokens are context: gradients flow only from the answer, so the model learns what to say GIVEN the question.")
PY
python3 sft.py
```

## 8. LoRA and QLoRA: cheap fine-tuning

Fine-tuning every weight is expensive (and you need a full copy per task). **LoRA** freezes the pre-trained matrix `W₀` (d × k) and learns a **low-rank update**: `W = W₀ + B·A` with `B` (d × r) and `A` (r × k), where the **rank `r` is tiny** (for example 4 to 16). The trainable parameters drop from `d·k` to `r·(d + k)`, and you can keep **one small A,B pair per task** on top of a shared base model. Practical notes from the lecture: LoRA is applied to attention **and** (more beneficially) **feed-forward** weights; it prefers a **higher learning rate** (about 10×) and tends to work **less well with very large batches** (empirical, no settled theory). **QLoRA** also **quantises the frozen `W₀`** (NF4, with double quantisation) and trains `A`,`B` in higher precision, cutting memory dramatically. **Prefix tuning** and **adapters** are alternatives.

A working rank-1 fit:

```run
cd ~/l4
cat > lora.py <<'PY'
import random
random.seed(12)
d, k, r = 12, 10, 1

W0 = [[random.gauss(0, 1) for _ in range(k)] for _ in range(d)]                  # frozen pre-trained matrix
u = [random.gauss(0, 1) for _ in range(d)]; v = [random.gauss(0, 1) for _ in range(k)]
W_target = [[W0[i][j] + 0.5 * u[i] * v[j] for j in range(k)] for i in range(d)]   # the task needs a RANK-1 change

B = [[random.gauss(0, 0.01) for _ in range(r)] for _ in range(d)]               # trainable
A = [[random.gauss(0, 0.01) for _ in range(k)] for _ in range(r)]               # trainable
inputs = [[random.gauss(0, 1) for _ in range(k)] for _ in range(200)]

def forward(W, x): return [sum(w * xi for w, xi in zip(row, x)) for row in W]
def effective():
    return [[W0[i][j] + sum(B[i][c] * A[c][j] for c in range(r)) for j in range(k)] for i in range(d)]
def loss():
    We = effective(); t = 0
    for x in inputs[:50]:
        for a, b in zip(forward(We, x), forward(W_target, x)): t += (a - b) ** 2
    return t / (50 * d)

print(f"trainable parameters: LoRA {r * (d + k)}  vs full fine-tuning {d * k}")
print(f"step    0: loss {loss():.4f}")
LR = 0.005
for step in range(1, 1501):
    x = random.choice(inputs)
    We = effective()
    err = [a - b for a, b in zip(forward(We, x), forward(W_target, x))]         # d outputs
    Ax = [sum(A[c][j] * x[j] for j in range(k)) for c in range(r)]               # r values
    gB = [[err[i] * Ax[c] for c in range(r)] for i in range(d)]
    BtErr = [sum(B[i][c] * err[i] for i in range(d)) for c in range(r)]
    gA = [[BtErr[c] * x[j] for j in range(k)] for c in range(r)]
    for i in range(d):
        for c in range(r): B[i][c] -= LR * gB[i][c]
    for c in range(r):
        for j in range(k): A[c][j] -= LR * gA[c][j]
    if step in (100, 500, 1500): print(f"step {step:4}: loss {loss():.4f}")
PY
python3 lora.py
```

**What you see:** training only **22 parameters** (instead of 120) drives the loss toward zero, because the change we needed **really was rank 1**. Real fine-tuning updates are not exactly low-rank, but a small rank captures most of what is needed, which is the empirical bet LoRA makes.

:::warn Common mistakes
- **Quoting FLOPs and FLOP/s interchangeably.**
- **Believing bigger is always better at a fixed budget**: an under-trained huge model loses to a smaller model trained on more tokens.
- **Treating data parallelism as free**: there is a communication cost; and without ZeRO the model must fit on one GPU.
- **Saying FlashAttention approximates attention**: it is exact.
- **Training and accumulating in pure FP16**: small updates vanish and large values overflow.
- **Computing SFT loss on the prompt too.**
- **Thinking LoRA changes `W₀`**: it adds a small separate update; swap it per task.
:::

## 9. Interview-style questions

- **"Why does training need more memory than inference?"** Activations, gradients and optimiser states (about 16 bytes per parameter with Adam in mixed precision), versus just the weights (and the KV cache) at inference.
- **"Explain ZeRO."** Shard optimiser state, then gradients, then parameters across data-parallel GPUs so no copy is duplicated, trading communication for memory.
- **"Why is FlashAttention faster?"** It cuts HBM reads and writes by tiling into SRAM and recomputing, even though it does more arithmetic.
- **"How does QLoRA fit a large model on one GPU?"** 4-bit NF4 frozen weights plus small trainable LoRA matrices in higher precision.

:::try
1. In `scaling.py` add a 7B model trained on 2 trillion tokens. How many tokens per parameter is that?
2. In `memory.py` find the smallest number of GPUs where ZeRO-3 fits a 70B model in 80 GB per GPU for state alone.
3. In `lora.py` set `r = 2` for a target that needs rank 2 (add a second outer product). Does rank 1 fail?
4. In `flash.py` change `TILE` to 1, 5 and 40. Does the result change?
:::

:::recap
- Pre-training (next token on trillions of tokens) → SFT (answer-only loss) → preference tuning; pre-training dominates cost.
- **Scaling laws**: loss falls with compute, data and parameters; roughly **20 tokens per parameter** is compute-optimal; FLOPs ≈ 6·N·D.
- Training memory ≈ **16 bytes per parameter** plus activations; **ZeRO** and **data/tensor/pipeline/expert parallelism** spread the load, at a communication cost.
- **FlashAttention** is exact and fast by tiling in SRAM with an online softmax and recomputation.
- **Mixed precision** keeps master weights in 32-bit; **quantisation** (absmax, NF4) shrinks memory.
- **LoRA/QLoRA** learn a tiny low-rank update on frozen (possibly 4-bit) weights.
:::

:::quiz
? About how many training tokens per parameter is compute-optimal according to Chinchilla?
- 1
+ About 20
- About 2000
! GPT-3 used under 2, so it was under-trained.

? Why is FlashAttention not an approximation?
- It drops small scores
+ The online softmax with running max and sum reproduces the exact result tile by tile
- It uses lower precision only
! The lesson's check shows identical outputs.

? What does ZeRO stage 3 shard?
- Only the optimiser state
+ Optimiser state, gradients and parameters
- Only activations
! Each GPU keeps a slice; parameters are gathered when needed.

? Why keep master weights in 32-bit in mixed precision?
- Memory is cheap
+ Tiny updates would round away in 16-bit
- FP16 cannot represent zero
! The accumulation demo lost most of the updates in fp16.

? In SFT, which tokens contribute to the loss?
- Prompt and response
+ The response only
- Only the first token
! The instruction is context, not a target.
:::
