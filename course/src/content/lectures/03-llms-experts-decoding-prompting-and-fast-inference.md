---
track: lectures
title: "Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference"
short: L3 MoE, decoding, inference
sub: What makes a model an LLM, sparse experts, greedy versus beam versus sampling, temperature and top-p, guided decoding, prompting strategies, and the inference tricks (KV cache, paged memory, speculative decoding) with simulations you can run.
---

:::goals
- define an **LLM** the way the lecture does, and explain **mixture of experts (MoE)** with routing and load balancing
- compare **greedy, beam search and sampling**, and control sampling with **temperature, top-k and top-p**
- explain **guided (constrained) decoding** and why structured output is reliable
- use **in-context learning, chain of thought and self-consistency** well, and know **context rot**
- explain the **KV cache, PagedAttention, multi-latent attention, speculative decoding and multi-token prediction**
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 3**, explained in my own words with **original, runnable Python** (standard library only). All numbers are computed here on **toy data**; the real systems are far larger. Where a lecture detail was uncertain I say so.
:::

## 1. What is an LLM?

A **language model** assigns **probabilities to sequences of tokens**: here, the probability of the **next token**. A **large language model** is one that is large on three axes: **parameters** (billions and up), **training data** (hundreds of billions to tens of trillions of **tokens**), and **compute** (many GPUs). In today's usage an LLM is **text-in, text-out and decoder-only** (the transformer decoder without cross-attention), which is why **BERT is not called an LLM**: it produces embeddings but not text. More than 90% of current LLMs (Llama, Gemma, DeepSeek, Mistral, Qwen, GPT-style models) are decoder-only.

## 2. Mixture of experts (MoE)

**Question:** for one token, do we need all the parameters? **Idea:** ask only the right *experts*, like asking the mathematician rather than the whole room.

- A **router (gate)** `G` looks at the token's vector and produces a **probability for each of N experts**.
- **Dense MoE:** output = **weighted sum over all experts** (`Σ G_i(x)·E_i(x)`), so no compute is saved.
- **Sparse MoE:** keep only the **top-k** experts (k = 1 or 2) and **renormalise** their weights. Only those run, so **active parameters per token ≪ total parameters**.
- **Where:** in the **feed-forward network (FFN)** of each block, because that is where most parameters are (about `2·d_model·d_ff`, versus attention matrices which are smaller). Experts are FFNs; routing is **per token** and **per layer** (each layer has its own router and experts), which also lets experts live on **different GPUs** (expert parallelism).
- **Why:** scale **capacity** (even trillions of parameters, e.g. Switch Transformer) without paying for it on each forward pass, and they are often more **sample-efficient** in training. Trade-off: more **memory** to hold all experts.

**The training problem: routing collapse.** If the router sends almost everything to one or two experts, the rest never learn. The fix is an **auxiliary load-balancing loss**: for each expert `i`, `f_i` = **fraction of tokens routed to it** and `P_i` = **average router probability for it**; add `α · N · Σ f_i · P_i`. It is smallest when both are **uniform**. Other helpers: **noisy gating** (noise lets other experts get tried) and dropout.

```run
mkdir -p ~/l3 && cd ~/l3
cat > moe.py <<'PY'
import math, random
random.seed(2)

N, K, D = 8, 2, 6                                       # 8 experts, top-2 routing, token vectors of size 6
def softmax(v):
    m = max(v); e = [math.exp(x - m) for x in v]; s = sum(e); return [x / s for x in e]

router = [[random.gauss(0, 1) for _ in range(D)] for _ in range(N)]   # one weight vector per expert
tokens = [[random.gauss(0, 1) for _ in range(D)] for _ in range(2000)]

def route(token, W):
    probs = softmax([sum(w * x for w, x in zip(row, token)) for row in W])
    top = sorted(range(N), key=lambda i: -probs[i])[:K]
    z = sum(probs[i] for i in top)
    return probs, {i: probs[i] / z for i in top}        # keep top-k and renormalise

def balance_loss(W):
    f, P = [0] * N, [0.0] * N
    for t in tokens:
        probs, chosen = route(t, W)
        for i in chosen: f[i] += 1 / (len(tokens) * K)
        for i in range(N): P[i] += probs[i] / len(tokens)
    return N * sum(fi * pi for fi, pi in zip(f, P)), f

loss, f = balance_loss(router)
print(f"random router : load per expert {[round(x, 2) for x in f]}  balance term {loss:.3f} (1.0 = perfectly balanced)")

collapsed = [row[:] for row in router]
collapsed[3] = [w * 40 for w in collapsed[3]]            # make expert 3 dominate
collapsed[5] = [w * 25 for w in collapsed[5]]
loss, f = balance_loss(collapsed)
print(f"collapsed     : load per expert {[round(x, 2) for x in f]}  balance term {loss:.3f}")

active = K / N
print(f"\nwith {N} experts and top-{K}, the FFN does {active:.0%} of its dense work per token;")
print("a model with 8 experts of 7B FFN parameters each holds 56B FFN parameters but uses about 14B per token.")
PY
python3 moe.py
```

**What you see:** a random router spreads load fairly evenly and the balance term sits near 1; the **collapsed** router piles tokens on a few experts and the term **jumps**, which is exactly the signal the auxiliary loss pushes down. The last lines show how **total** and **active** parameters differ.

## 3. Choosing the next token: greedy, beam search, sampling

At each step the model outputs a **probability distribution** over the vocabulary. Three ways to pick:

1. **Greedy:** always the most probable token. **Deterministic** (same input, same output; not creative) and only **locally optimal**: the best next token need not lead to the **most probable sequence**.
2. **Beam search:** keep the **k best partial sequences** (beam width k), extend each, keep the best k again. Scores are sums of **log probabilities**. Because every extra token multiplies by a number below 1, long sequences are penalised, so a **length normalisation** is added. Good for **translation** (we want the single most likely output), costly, and low in diversity.
3. **Sampling:** **draw** the next token from the distribution. This is what chat models use, so answers vary. Controlled by:
   - **temperature `T`:** `p_i ∝ exp(logit_i / T)`. As `T → 0` the distribution becomes a **spike on the top token** (deterministic); as `T → ∞` it becomes **uniform**. Low `T` for factual, extraction, evaluation tasks; higher `T` for creative writing.
   - **top-k:** sample only among the **k** most probable tokens.
   - **top-p (nucleus):** sample only from the smallest set of tokens whose **cumulative probability ≥ p**.

Nothing inside the transformer is random: **randomness enters only at sampling** (and tiny floating-point ordering effects on GPUs can make even `T = 0` slightly non-reproducible).

Show all of this on a tiny hand-made "language model" over four tokens where greedy is a trap:

```run
cd ~/l3
cat > decode.py <<'PY'
import math, random
random.seed(11)

# P(next | prefix) for a toy model. Greedy's best first token (A) leads to poor continuations.
MODEL = {
    ():        {"A": 0.6, "B": 0.4},
    ("A",):    {"x": 0.4, "y": 0.3, "z": 0.3},       # flat: no strong continuation after A
    ("B",):    {"x": 0.9, "y": 0.05, "z": 0.05},     # sharp: B is followed by x very confidently
}
def seq_prob(seq): return MODEL[()][seq[0]] * MODEL[(seq[0],)][seq[1]]

# 1. greedy
g1 = max(MODEL[()], key=MODEL[()].get)
g2 = max(MODEL[(g1,)], key=MODEL[(g1,)].get)
print(f"greedy       : {g1}{g2}  probability {seq_prob((g1, g2)):.3f}")

# 2. beam search with width 2, then pick the best full sequence
beams = sorted(MODEL[()].items(), key=lambda kv: -kv[1])[:2]
cands = []
for tok, p in beams:
    for nxt, q in MODEL[(tok,)].items():
        cands.append((tok + nxt, p * q))
best = max(cands, key=lambda kv: kv[1])
print(f"beam (k=2)   : {best[0]}  probability {best[1]:.3f}")

# 3. exhaustive best, for comparison
allseq = [(a + b, seq_prob((a, b))) for a in MODEL[()] for b in MODEL[(a,)]]
print(f"true best    : {max(allseq, key=lambda kv: kv[1])[0]}  probability {max(allseq, key=lambda kv: kv[1])[1]:.3f}")

# temperature, top-k, top-p on a single distribution
logits = {"fluffy": 3.0, "soft": 2.6, "cute": 2.2, "gentle": 1.5, "airplane": -1.0}
def probs(T):
    e = {k: math.exp(v / T) for k, v in logits.items()}; s = sum(e.values()); return {k: v / s for k, v in e.items()}
print("\ntemperature effect on P(token):")
for T in (0.2, 1.0, 5.0):
    print(f"  T={T:<4}", {k: round(v, 3) for k, v in probs(T).items()})

def top_p(p_map, p):
    out, cum = {}, 0
    for k, v in sorted(p_map.items(), key=lambda kv: -kv[1]):
        out[k] = v; cum += v
        if cum >= p: break
    s = sum(out.values()); return {k: v / s for k, v in out.items()}
print("\ntop-p 0.9 at T=1:", {k: round(v, 3) for k, v in top_p(probs(1.0), 0.9).items()})
draws = [random.choices(list(probs(1.0)), weights=list(probs(1.0).values()))[0] for _ in range(5000)]
print("sampling 5000 draws at T=1:", {k: draws.count(k) for k in logits})
PY
python3 decode.py
```

**What you see:** greedy picks `A` first (0.6) and ends at probability **0.24**; the **true best** sequence starts with the less likely `B` (0.4 × 0.9 = **0.36**); **beam search with width 2 finds it**. The temperature rows show a **spike at 0.2**, the natural shape at 1, and a **near-uniform** distribution at 5. Top-p cuts off the unlikely tail ("airplane") and the sampling counts follow the probabilities.

### Guided (constrained) decoding

To get **valid JSON** you can ask nicely and re-try, or **filter the choices during decoding**: at each step only tokens that keep the output **valid under a grammar** (a finite-state machine) are allowed; the rest get zero probability. Providers expose this as **structured output**. It **guarantees the format**, not the truth of the content.

```run
cd ~/l3
cat > guided.py <<'PY'
import random, json
random.seed(4)

# A tiny grammar for {"rating": <digit>} written as a state machine: state -> allowed next tokens
GRAMMAR = {
    0: ['{"rating":'],
    1: list("0123456789"),
    2: ["}"],
}
def model_probs(allowed):
    # pretend the model prefers junk: it gives probability to illegal tokens too
    vocab = allowed + ["hello", "!!", "}", "{"]
    w = [random.random() for _ in vocab]
    return dict(zip(vocab, w))

def generate(guided):
    out, state = "", 0
    while state <= 2:
        probs = model_probs(GRAMMAR[state])
        if guided:                                          # mask out tokens the grammar forbids
            probs = {t: p for t, p in probs.items() if t in GRAMMAR[state]}
        tok = max(probs, key=probs.get)
        out += tok; state += 1
    return out

def valid(s):
    try: json.loads(s); return True
    except Exception: return False

for guided in (False, True):
    ok = sum(valid(generate(guided)) for _ in range(500))
    print(f"{'with grammar mask' if guided else 'unconstrained     '}: {ok}/500 outputs are valid JSON")
PY
python3 guided.py
```

## 4. Prompting strategies

A prompt usually has **context** (setting, current date, system rules), **instructions**, **inputs**, and **constraints** (format, safety). The model's **context length** (also context size or window) is measured in tokens: tens of thousands to **millions** today.

- **Context rot:** a long context is not a free lunch. In **needle-in-a-haystack** tests the ability to **retrieve a fact degrades as the prompt grows**, and **distractors** make it worse. So put **the right context, not all the context** in the prompt (this is why retrieval, Lecture 7, matters).
- **In-context learning** (no weight changes): **zero-shot** (just ask) and **few-shot** (give input-output examples). Few-shot usually helps but costs tokens and **anchors the model on your examples**; with strong modern models, **clearer instructions** (or asking it to plan first) can match or beat examples.
- **Chain of thought (CoT):** make the model **write its reasoning before the answer**. It improves hard problems, gives **more computation** (each generated token is a forward pass), and is **debuggable** (you can read where it went wrong). Cost: more tokens and time.
- **Self-consistency:** sample **several** CoT answers (in parallel, at temperature above 0) and take the **majority answer**. Needs a way to **extract the final answer** (ask for it last, regex, or another model), and ground truth to measure the gain.

How much can majority voting help? If each sampled answer is right with probability `p` and errors are spread over many wrong answers, voting boosts accuracy. Compute the best case:

```run
cd ~/l3
cat > selfcons.py <<'PY'
import math, random
random.seed(8)

def vote_accuracy(p_correct, k, wrong_options=4, trials=20000):
    wins = 0
    for _ in range(trials):
        answers = []
        for _ in range(k):
            answers.append("right" if random.random() < p_correct else f"wrong{random.randrange(wrong_options)}")
        counts = {a: answers.count(a) for a in set(answers)}
        top = max(counts.values())
        winners = [a for a, c in counts.items() if c == top]
        wins += random.choice(winners) == "right"
    return wins / trials

print(f"single sample accuracy 0.50. Majority vote over k samples (4 possible wrong answers):")
for k in (1, 3, 5, 11, 21):
    print(f"  k={k:2}: {vote_accuracy(0.5, k):.3f}")
print("\nIf wrong answers all agree (one wrong option), voting cannot help:")
for k in (1, 5, 21):
    print(f"  k={k:2}: {vote_accuracy(0.4, k, wrong_options=1):.3f}")
PY
python3 selfcons.py
```

**What you see:** with errors **scattered** over several wrong answers, voting lifts a 50% model toward the high 90s; if the model is **consistently wrong in the same way**, voting makes things **worse**. Voting amplifies the **most likely answer**, right or wrong.

## 5. Making inference fast

Training can be parallelised over all positions; **generation cannot**: token `t+1` needs token `t`. These techniques attack the cost.

### 5a. The KV cache

For each new token, attention needs the **keys and values of all previous tokens**. They never change, so **compute them once and store them** (the KV cache). Only the **new token's** query, key and value are computed (the **queries of past tokens are never needed again**, so queries are not cached). During training with full sequences (teacher forcing) there is no caching.

```run
cd ~/l3
cat > kvtime.py <<'PY'
import time, random
random.seed(1)
D = 64
def vec(): return [random.random() for _ in range(D)]
def proj(x): return [sum(a * b for a, b in zip(x, row)) for row in WK]
WK = [vec() for _ in range(D)]                     # stand-in for the K (and V) projection

def decode(n, cache):
    xs, keys, ops = [], [], 0
    for t in range(n):
        xs.append(vec())
        if cache:
            keys.append(proj(xs[-1])); ops += 1       # project only the new token
        else:
            keys = [proj(x) for x in xs]; ops += len(xs)   # re-project every token every step
    return ops

for n in (50, 100, 200):
    t0 = time.time(); a = decode(n, False); t1 = time.time(); b = decode(n, True); t2 = time.time()
    print(f"{n:4} tokens: projections without cache {a:6}, with cache {b:4}   time {t1 - t0:.2f}s vs {t2 - t1:.3f}s")
PY
python3 kvtime.py
```

**What you see:** without the cache the work grows **quadratically** (re-projecting everything every step); with it, **linearly**. The price is **memory** (see Lecture 2's GQA table), which brings the next ideas.

### 5b. Smaller caches and smarter memory

- **GQA/MQA:** share K/V across heads (Lecture 2).
- **Multi-head latent attention (MLA, DeepSeek):** **compress** the token vector into a small **latent** vector, cache **that**, and **expand** it to keys and values when needed; the compression can be **shared across keys, values and heads**, so **one small vector per token per layer** is stored. The lecture notes the DeepSeek-V2 paper also reported a quality benefit, so it is not purely a memory trade.
- **PagedAttention (vLLM):** reserving a **maximum-length block** for every request wastes memory (reserved but unused, plus gaps). Instead split the cache into **small fixed blocks (for example 16 tokens)** allocated **on demand**, with a table mapping positions to blocks, like virtual memory in an operating system.

```run
cd ~/l3
cat > paged.py <<'PY'
import random
random.seed(6)
MAX_LEN, BLOCK = 2048, 16
lengths = [random.randint(50, 900) for _ in range(40)]          # actual tokens produced by 40 requests

naive = len(lengths) * MAX_LEN                                  # reserve the maximum for everyone
paged = sum(-(-n // BLOCK) * BLOCK for n in lengths)            # round each request up to whole blocks
used = sum(lengths)
print(f"tokens actually stored      : {used:7,}")
print(f"naive reservation (max len) : {naive:7,}  -> {used / naive:.0%} of the memory is useful")
print(f"paged blocks of {BLOCK:2}          : {paged:7,}  -> {used / paged:.0%} of the memory is useful")
print(f"same GPU memory serves about {naive / paged:.1f}x more concurrent requests with paging")
PY
python3 paged.py
```

### 5c. Speculative decoding

Generation is **memory-bound**, not compute-bound: a forward pass over **several tokens at once** costs about the same as over one. So let a **small draft model** guess the next `k` tokens (cheap), then run the **big model once** over all `k` guesses to get its true distribution at each position. Accept each guess with probability **`min(1, p_target / p_draft)`**; at the first rejection, **resample** from the corrected distribution `max(0, p − q)` (normalised) and continue. The big model's pass also yields one extra token for free. The result is **exactly distributed like the big model**, but with **fewer big-model passes**. Check the "exactly" claim by simulation:

```run
cd ~/l3
cat > spec.py <<'PY'
import random
random.seed(3)
tokens = ["a", "b", "c", "d"]
p = [0.50, 0.30, 0.15, 0.05]        # target (large) model
q = [0.25, 0.25, 0.25, 0.25]        # draft (small) model: a rough guess

def sample(dist): return random.choices(range(4), weights=dist)[0]

def speculative_step():
    x = sample(q)                                          # draft proposes
    if random.random() < min(1.0, p[x] / q[x]):            # accept with prob min(1, p/q)
        return x, True
    resid = [max(0.0, pi - qi) for pi, qi in zip(p, q)]    # otherwise resample from the leftover mass
    return sample(resid), False

N = 200000
counts, accepted = [0] * 4, 0
for _ in range(N):
    x, ok = speculative_step(); counts[x] += 1; accepted += ok
print("target distribution      :", p)
print("speculative decoding out :", [round(c / N, 3) for c in counts])
alpha = accepted / N
print(f"\nacceptance rate alpha = {alpha:.2f}")
for k in (1, 3, 5):
    expected = (1 - alpha ** (k + 1)) / (1 - alpha)
    print(f"  drafting k={k} tokens -> about {expected:.2f} tokens per big-model pass")
PY
python3 spec.py
```

**What you see:** the output frequencies **match the target model** (0.50, 0.30, 0.15, 0.05 up to sampling noise), so quality is unchanged, and with this acceptance rate each big-model pass yields **more than one token**.

**Multi-token prediction** puts the draft inside the model: several **extra heads** on the last decoder layer are trained to predict **several future tokens**, and at inference they act as the draft (the lecture notes the verification is done greedily and does not give the exact-distribution guarantee, because the objective and architecture changed).

:::warn Common mistakes
- **Thinking temperature 0 is always reproducible**: batching and floating-point ordering can still change results slightly.
- **Using high temperature for extraction or grading**: you want determinism.
- **Using beam search for chat**: it is repetitive and expensive; sampling is standard.
- **Believing a longer context is always better**: relevance beats volume.
- **Assuming structured output guarantees correct content**: only the format.
- **Forgetting MoE still needs memory for all experts** even though few are active.
:::

## 6. Interview-style questions

- **"What is MoE and why is it used?"** Sparse FFN experts chosen per token by a router, so you can grow total parameters while keeping active compute per token low; needs load balancing to avoid collapse.
- **"What does temperature do?"** Divides the logits before softmax: low spikes, high flattens; it is the knob for determinism versus variety.
- **"How would you speed up serving?"** KV cache, GQA/MLA, paged memory, batching, speculative decoding, quantisation (Lecture 4).
- **"Why is self-consistency not always helpful?"** It amplifies the dominant answer; if errors are systematic, it amplifies the error.

:::try
1. In `decode.py` change the probabilities so greedy **is** optimal. How must the second-step distribution after `A` change?
2. In `moe.py` try `K = 1` and `K = 4`: how does the active fraction change?
3. In `spec.py` use a draft that is **very close** to the target and a draft that is **very far**; compare the acceptance rate.
4. In `selfcons.py` find the smallest `k` that lifts 0.5 to 0.95.
:::

:::recap
- An **LLM** is a large, decoder-only, text-to-text language model; **MoE** keeps capacity high and per-token compute low with a router and top-k experts (balance them!).
- **Greedy** is local, **beam** is closer to optimal but costly and bland, **sampling** with **temperature, top-k, top-p** gives variety; **guided decoding** guarantees format.
- **CoT, few-shot and self-consistency** improve reasoning; beware **context rot** and systematic errors.
- Speed: **KV cache**, **GQA/MLA**, **paged memory**, **speculative decoding**, **multi-token prediction**.
:::

:::quiz
? Where is the MoE layer placed in a decoder block?
- In place of attention
+ In place of the feed-forward network, which holds most parameters
- Before the embedding
! Experts are FFNs, routed per token per layer.

? What happens as temperature approaches zero?
- The distribution becomes uniform
+ The distribution becomes a spike on the most likely token
- Nothing
! Logits are divided by a small T before softmax.

? Why can greedy decoding miss the best sequence?
- It is random
+ A locally best token can lead to poor continuations
- It ignores probabilities
! Beam search keeps several candidates to reduce this.

? Why does speculative decoding preserve the target model's distribution?
- It never uses the draft
+ Draft tokens are accepted with probability min(1, p/q) and rejections are resampled from the leftover mass
- It uses temperature zero
! The correction makes the output exactly target-distributed.

? What does PagedAttention improve?
- Accuracy
+ KV-cache memory efficiency, so more requests fit
- Tokenisation
! Small on-demand blocks replace worst-case reservations.
:::
