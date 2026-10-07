---
track: lectures
title: "Lecture 6: Reasoning models: chain of thought, pass@k, GRPO and the DeepSeek-R1 recipe"
short: L6 Reasoning and GRPO
sub: What a reasoning model is, how reasoning is scored (verifiable rewards, pass@k), how GRPO replaces PPO's value model with group-relative advantages, the length-bias fix, and the R1-Zero to R1 pipeline, with the formulas checked by simulation.
---

:::goals
- define **reasoning** operationally and say what a **reasoning model** outputs (a chain, then an answer) and what you pay for
- build **verifiable rewards** (format reward, answer-correctness reward) and see why RL suits maths and code
- derive and **verify the unbiased pass@k estimator**, and understand how **temperature** shapes pass@k
- compute **GRPO's group-relative advantages**, run a tiny GRPO loop, and compare it with PPO
- explain the **length bias** of the original loss and the fixes (DAPO, "GRPO done right"), plus the **R1-Zero → R1** recipe and **distillation**
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 6**, explained in my own words with **original, runnable Python** (standard library only). The training loop is a **deliberately simplified bandit** (no neural network, clipping or KL) to show the **group-relative advantage mechanism**, not a real LLM trainer. Timeline details (model releases) are as stated in the lecture.
:::

## 1. What is "reasoning"?

There is no universally agreed definition. The lecture's working one: **reasoning is the ability to solve a problem, usually needing several steps** (maths and coding are the typical cases). "What is the course code of this class?" is a **knowledge** question. "A bear was born in 2020; how old is it in 2025?" needs a (small) **reasoning** step.

A **vanilla LLM** maps prompt → answer. A **reasoning model** maps prompt → **reasoning chain** (thinking tokens, often hidden or summarised in the UI) → **answer**. This builds on **chain of thought (CoT)**. Why it helps:

- A hard problem is unlikely to appear in the training set; **decomposing** it into small steps lets the model rely on patterns it has seen for each step.
- Generating more tokens gives the model **more computation** (each token is a forward pass).
- You can **read** the chain to debug.

**Costs you will see:** thinking tokens are **billed as output tokens** and take **time**, which is why UIs show "thinking" and let you choose how long. Providers often show a **summary** of the chain, not the raw chain (the raw chain may be unreadable, long, and valuable as training data for competitors). Timeline from the lecture: OpenAI's o1-preview (Sept 2024) started the wave; **DeepSeek-R1 (Jan 2025)** matched it with a published method; other labs followed.

## 2. How reasoning is measured: verifiable tasks and pass@k

Maths and code have **checkable answers**:

| Domain | Check | Typical benchmarks |
|---|---|---|
| **Code** | run the tests; correct if they all pass | HumanEval, Codeforces-style, SWE-bench (real GitHub issues) |
| **Maths** | **parse** the final answer (ask for a boxed or tagged answer) and compare with the ground truth | AIME (hard competition problems), GSM8K (grade-school problems) |

Because you can **check** an answer, you can afford to **try several times**. **pass@k** is the probability that **at least one of k attempts** is correct. To estimate it with low variance, generate **n ≥ k** samples, count **c** correct, and compute

`pass@k = 1 − C(n − c, k) / C(n, k)`

(the chance that **all k** randomly chosen samples are wrong is `C(n−c,k)/C(n,k)`, sampling without replacement; subtract from 1). For `k = 1` it reduces to **c / n**. Also seen: **consensus@k** (the most common answer among k), related to self-consistency; accuracy and exact match.

Verify the estimator against brute-force simulation:

```run
mkdir -p ~/l6 && cd ~/l6
cat > passk.py <<'PY'
import random
from math import comb
random.seed(10)

def pass_at_k(n, c, k):
    if n - c < k: return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)

# a problem the model solves with true probability 0.3 per attempt
p, n, k = 0.3, 20, 5
truth = 1 - (1 - p) ** k
print(f"true pass@{k} for p=0.3 per attempt: {truth:.4f}")

estimates, naive = [], []
for _ in range(4000):
    results = [random.random() < p for _ in range(n)]
    c = sum(results)
    estimates.append(pass_at_k(n, c, k))
    first_k = results[:k]
    naive.append(1.0 if any(first_k) else 0.0)           # only generate k samples and see if any passed
mean = lambda xs: sum(xs) / len(xs)
sd = lambda xs: (sum((x - mean(xs)) ** 2 for x in xs) / len(xs)) ** 0.5
print(f"unbiased estimator from n=20 samples : mean {mean(estimates):.4f}, spread (std) {sd(estimates):.3f}")
print(f"naive (just k=5 samples, any pass?)  : mean {mean(naive):.4f}, spread (std) {sd(naive):.3f}")
print(f"\npass@1 estimate = c/n: {pass_at_k(20, 6, 1):.3f} for c=6 of n=20")
PY
python3 passk.py
```

**What you see:** both are **unbiased** (they average to the true value), but the estimator that uses all **n = 20** samples has a **much smaller spread**, which is why it is used.

### Temperature and pass@k

To get **different** attempts you must **sample with temperature above 0**. With temperature 0 every attempt is identical, so pass@k = pass@1. Raise it and attempts diversify, but go too high and **individual accuracy collapses**. So **the best temperature depends on k**, and papers always state the temperature they used.

```run
cd ~/l6
cat > tempk.py <<'PY'
import math, random
random.seed(33)

# 300 synthetic problems. Each has 200 candidate answers (index 0 is the correct one).
# The model is imperfect: the correct answer usually, but not always, has the highest score.
problems = []
for _ in range(300):
    logits = [random.gauss(3.2, 1.2)] + [random.gauss(0, 1.0) for _ in range(199)]
    problems.append(logits)

def p_correct(logits, T):
    m = max(l / T for l in logits)
    e = [math.exp(l / T - m) for l in logits]
    return e[0] / sum(e)

print(f"{'T':>5} {'pass@1':>8} {'pass@4':>8} {'pass@16':>8}")
for T in (0.05, 0.3, 0.6, 1.0, 1.5, 3.0, 10.0):
    ps = [p_correct(l, T) for l in problems]
    row = [sum(1 - (1 - p) ** k for p in ps) / len(ps) for k in (1, 4, 16)]
    print(f"{T:5.2f} {row[0]:8.3f} {row[1]:8.3f} {row[2]:8.3f}")
PY
python3 tempk.py
```

**What you see:** at the lowest temperature `pass@1` is best (0.64) and `pass@16` is barely better than `pass@1` (0.71), because there is **no diversity** to exploit. At `T = 0.3` the single-shot accuracy has dropped (0.56) but `pass@4` and `pass@16` **peak** (0.72 and 0.83), because the attempts now differ. At high `T` everything collapses toward chance. So the best temperature **depends on k**; pick it for the metric you care about. (The toy has 200 candidate answers; real answer spaces are bigger, which is why random guessing does not rescue high temperatures.)

## 3. How to train a reasoning model

Why not SFT? You would need **many high-quality reasoning chains written by humans**, which is very hard, and a human's way of reasoning is **not necessarily the model's best way**. But there is a **natural reward** that needs no reward model: **verifiable correctness**. So use **RL** (Lecture 5 techniques) with two cheap, rule-based rewards:

1. **Format reward:** did the model put its thinking inside the designated tags (`<think> ... </think>`) and the answer in answer tags?
2. **Accuracy reward:** is the parsed answer correct (maths) or do the tests pass (code)?

As RL steps progress, accuracy on benchmarks such as AIME rises substantially **with only these two rewards**.

```run
cd ~/l6
cat > rewards.py <<'PY'
import re

def format_reward(text):
    ok = re.fullmatch(r"\s*<think>.+?</think>\s*<answer>.+?</answer>\s*", text, re.S)
    return 1.0 if ok else 0.0

def accuracy_reward(text, truth):
    m = re.search(r"<answer>(.*?)</answer>", text, re.S)
    return 1.0 if m and m.group(1).strip() == truth else 0.0

def reward(text, truth):
    return format_reward(text) * 0.2 + accuracy_reward(text, truth) * 1.0

samples = [
    "<think>2025 - 2020 = 5</think><answer>5</answer>",
    "<think>Born in 2020, so it is 4 now</think><answer>4</answer>",
    "The bear is 5 years old.",
    "<think>5 years</think> 5",
]
for s in samples:
    print(f"format {format_reward(s):.0f}  accuracy {accuracy_reward(s, '5'):.0f}  reward {reward(s, '5'):.1f}   {s}")
PY
python3 rewards.py
```

Because the RL rollouts become **longer** as the model learns to reason, **thinking budget** is an active topic: a quick **classifier** to decide how much to think, **context-awareness** (the context window is finite), and **budget forcing** (the S1 paper: **append "Wait"** to push the model to keep thinking, or insert a stop message to force an answer). Some work explores **continuous (hidden) thoughts** instead of text tokens.

## 4. GRPO: group relative policy optimisation

PPO needed a **value function** (a second large model trained jointly) to turn rewards into **advantages**. **GRPO** removes it:

1. For one prompt, sample **G completions** (a *group*).
2. Score each one: `r_1 … r_G`.
3. **Advantage of completion i** = `(r_i − mean(r)) / std(r)`. It says how much better this completion is **relative to its siblings**.
4. Update the policy with a **PPO-style clipped objective** using that advantage, plus a **KL term** to the reference model (in GRPO the KL term is written **inside the objective**; in PPO implementations it is usually folded into the reward).

Intuition: a high reward on an **easy** problem (where everyone succeeds) is not special; a correct answer on a **hard** problem (where most fail) gets a big positive advantage, so it is strongly reinforced. With **verifiable rewards** there is **no reward model** either, so only the **policy and the reference** are needed (PPO: policy, reference, reward model, value model).

```run
cd ~/l6
cat > grpo_adv.py <<'PY'
import statistics

def advantages(rewards):
    mu = statistics.fmean(rewards)
    sd = statistics.pstdev(rewards)
    return [0.0 if sd == 0 else (r - mu) / sd for r in rewards]

print("easy problem (7 of 8 correct):", [round(a, 2) for a in advantages([1, 1, 1, 1, 1, 1, 1, 0])])
print("hard problem (1 of 8 correct):", [round(a, 2) for a in advantages([0, 0, 0, 0, 0, 0, 0, 1])])
print("all correct (nothing to learn):", [round(a, 2) for a in advantages([1] * 8)])
print("all wrong   (nothing to learn):", [round(a, 2) for a in advantages([0] * 8)])
PY
python3 grpo_adv.py
```

**What you see:** the single success on the **hard** problem receives a big advantage (+2.6), the single failure on the **easy** one a big negative (−2.6), and groups with **identical** rewards give **zero** advantage: no signal, which is why problem difficulty must be balanced in training.

A **minimal GRPO loop** on a toy "policy" that chooses one of four solving strategies, with a hidden success rate per strategy (this is a bandit, so there is no token-level detail):

```run
cd ~/l6
cat > grpo_loop.py <<'PY'
import math, random, statistics
random.seed(5)

strategies = ["guess", "brute force", "careful steps", "careful steps + check"]
success = [0.10, 0.35, 0.60, 0.85]             # hidden probability each strategy solves the problem
logits = [0.0, 0.0, 0.0, 0.0]                   # the policy: softmax over strategies
G, LR = 8, 0.3

def probs():
    m = max(logits); e = [math.exp(l - m) for l in logits]; s = sum(e); return [x / s for x in e]

def expected_reward(): return sum(p * q for p, q in zip(probs(), success))
print(f"step   0: expected reward {expected_reward():.3f}  policy {[round(p, 2) for p in probs()]}")
for step in range(1, 201):
    p = probs()
    group = random.choices(range(4), weights=p, k=G)                    # sample G completions for the same prompt
    rewards = [1.0 if random.random() < success[a] else 0.0 for a in group]
    mu, sd = statistics.fmean(rewards), statistics.pstdev(rewards)
    if sd == 0: continue                                                 # identical rewards: no learning signal
    adv = [(r - mu) / sd for r in rewards]
    grad = [0.0] * 4
    for a, A in zip(group, adv):                                         # policy gradient: A * d log pi(a)
        for i in range(4):
            grad[i] += A * ((1.0 if i == a else 0.0) - p[i])
    logits = [l + LR * g / G for l, g in zip(logits, grad)]
    if step in (20, 60, 200): print(f"step {step:3}: expected reward {expected_reward():.3f}  policy {[round(q, 2) for q in probs()]}")
PY
python3 grpo_loop.py
```

**What you see:** with **no value network and no reward model**, only the verifiable 0/1 reward and a **group baseline**, the policy shifts toward the strategies that succeed more often (the last, best one dominates). Real GRPO adds the clipped ratio, KL leash and token-level losses, but the learning signal is exactly this comparison **within a group**.

### GRPO versus PPO at a glance

| | PPO | GRPO |
|---|---|---|
| Advantage from | reward and a learned **value function** (GAE) | reward compared with the **group's mean (and std)** |
| Models trained | policy **and value model** | **policy only** |
| Frozen models | reference, reward model | reference (reward model **not needed** with verifiable rewards) |
| KL term | usually folded into the reward | explicit in the objective |
| Typical use | preference tuning | reasoning with verifiable rewards |

## 5. The length bias, and its fixes

If RL runs long, the response **length keeps growing**, even after accuracy has plateaued. One cause is in the GRPO loss: it averages each completion's token losses with a factor **`1/|o_i|`** (the length). So each token of a **long** completion carries a **smaller weight** than each token of a **short** one. When the advantage is **negative**, a short wrong answer is **punished more per token** than a long wrong answer, so the model learns that **long wrong answers hurt less**, and drifts toward length. Fixes: **DAPO** uses a normalisation that does not depend on which completion the token is in; **Dr. GRPO ("GRPO done right")** removes the length factor altogether, and the lecture reports output length then stops inflating, especially for incorrect answers. Other proposed fixes: the **standard-deviation** term in the advantage biases by problem difficulty, and **asymmetric clipping** (different ε for the upper and lower bound) so low-probability tokens are not stuck with a tiny step.

```run
cd ~/l6
cat > lenbias.py <<'PY'
# Per-token weight of a wrong answer's (negative) advantage under three normalisations
advantage = -1.0
print(f"{'completion length':>18} {'GRPO 1/|o|':>12} {'no length term':>15}")
for L in (20, 100, 1000):
    grpo = advantage / L              # each token carries advantage / length
    fixed = advantage                 # Dr. GRPO style: same weight for every token
    print(f"{L:18} {grpo:12.4f} {fixed:15.4f}")
print("\nTotal penalty for the whole wrong answer = per-token weight x tokens:")
for L in (20, 100, 1000):
    print(f"  length {L:4}: GRPO {advantage / L * L:6.2f}   (constant)   |   per-token weight is {abs(advantage / L):.4f}")
print("\nPer token, a short wrong answer is punished 50x more than a 1000-token wrong answer: a bias toward long wrong answers.")
PY
python3 lenbias.py
```

## 6. The DeepSeek recipe, end to end

| Model | Recipe | Lesson |
|---|---|---|
| **R1-Zero** | pre-trained base (a mixture-of-experts model with multi-latent attention) → **RL only**, with format + accuracy rewards, **no SFT** | reasoning skill **emerges** and benchmarks climb; but outputs mixed **languages** and were hard to read |
| **R1** | (1) **cold-start SFT** on a modest number of reasoning chains, cleaned and rewritten by humans → (2) **RL** with accuracy, format and a **language-consistency reward** → (3) **SFT on a larger mix** (about 3 parts reasoning data, collected by **rejection sampling**: generate, judge, keep only good ones, to 1 part general non-reasoning data) → (4) a final **RL** round with reasoning rewards plus **helpfulness and harmlessness** rewards (harmlessness applied to the **whole output including the thinking**) | competitive with leading closed reasoning models |
| **Distilled small models** | the big model **generates thinking traces**; a **small model is fine-tuned (SFT) on whole sequences** | at small sizes, **distilling from the large reasoner beat running RL directly on the small model** |

Note the **distillation flavour** here differs from classic distillation (matching the teacher's next-token distribution): this is **sequence-level**, training on the teacher's generated text.

:::warn Common mistakes
- **Treating a reasoning model as a plain model with a longer prompt**: it is trained (RL) to produce thinking.
- **Comparing pass@1 numbers from different temperatures** or different n.
- **Computing pass@k by generating exactly k samples** (high variance); use the unbiased estimator with n > k.
- **Thinking GRPO needs no reward at all**: it needs a reward signal; "no reward model" holds when the reward is **verifiable**.
- **Assuming longer chains are always better**: length can grow for the wrong reasons (the length bias).
- **Ignoring cost**: reasoning tokens are billed.
:::

## 7. Interview-style questions

- **"Why use RL rather than SFT for reasoning?"** Chains are costly to write, the model's best reasoning may differ from humans', and there is a free, verifiable reward.
- **"How does GRPO differ from PPO?"** No value model: advantage = reward relative to the group mean (and std); only the policy is trained, and no reward model is needed with verifiable rewards.
- **"What is pass@k and how do you estimate it?"** The probability at least one of k samples passes; unbiased estimator `1 − C(n−c,k)/C(n,k)` from n samples with c correct.
- **"Why does response length grow in GRPO, and how do you fix it?"** The `1/|o|` normalisation makes long wrong answers cheap per token; remove or equalise it (Dr. GRPO, DAPO).

:::try
1. In `grpo_loop.py` set `G = 2` and `G = 32`. How does the group size change learning speed and noise?
2. In `grpo_adv.py` add a group with rewards `[1, 1, 0, 0, 0, 0, 0, 0]`. Who gets the largest advantage?
3. In `tempk.py` add `pass@64`. Where is its best temperature compared with pass@1?
4. Extend `rewards.py` with a **length penalty** that subtracts 0.001 per word, and check when it flips a decision.
:::

:::recap
- A **reasoning model** emits a **thinking chain then an answer**; you pay for the thinking tokens.
- Maths and code give **verifiable rewards**, so **RL with format + accuracy rewards** can teach reasoning without human-written chains.
- **pass@k** uses the **unbiased estimator** from n samples; temperature trades per-sample accuracy for diversity.
- **GRPO** replaces PPO's value model with **group-relative advantages**; fix the **length bias** with DAPO or Dr. GRPO.
- The **R1 recipe**: R1-Zero (RL only) → cold-start SFT → RL → SFT with rejection sampling → RL with safety rewards; **distil** into small models by SFT on the big model's traces.
:::

:::quiz
? What does pass@k measure?
- The average score of k samples
+ The probability that at least one of k attempts is correct
- The probability that all k are correct
! The all-correct version is pass^k, used for reliability.

? What replaces the value function in GRPO?
- A larger reward model
+ The mean (and standard deviation) of rewards across a group of completions for the same prompt
- The reference model
! Advantage is relative to the group.

? Why can GRPO's 1/|o| normalisation inflate length?
- It rewards long answers directly
+ Each token of a long wrong answer is penalised less than each token of a short wrong one
- It removes the KL term
! Fixes: DAPO, Dr. GRPO.

? Why did R1 add a cold-start SFT stage after R1-Zero?
- To save compute
+ To fix readability and language mixing before and during RL
- To remove thinking
! R1-Zero's chains were hard to read.

? What happens to advantages when all completions in a group get the same reward?
- They are all large
+ They are zero, so that prompt gives no learning signal
- They become negative
! Difficulty balance in the training set matters.
:::
