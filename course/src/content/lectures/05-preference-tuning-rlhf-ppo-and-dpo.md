---
track: lectures
title: "Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO"
short: L5 Preference tuning
sub: Why SFT is not enough, how a reward model is trained from pairs (Bradley-Terry), how PPO optimises against it without drifting, why reward hacking happens, and how DPO skips the reward model, with each idea reproduced in small simulations.
---

:::goals
- explain **why a third stage** (preference tuning) follows pre-training and SFT
- build **preference pairs** and train a **reward model** with the **Bradley-Terry** loss (and see it work)
- map an LLM onto **reinforcement learning** (agent, state, action, policy, reward) and read the **PPO-clip** objective
- see **reward hacking** happen, and why we add a **KL penalty** to stay near the SFT model
- compare **PPO, best-of-N and DPO** by cost and behaviour, and run a DPO update
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 5**, explained in my own words with **original, runnable Python** (standard library only). The data are **synthetic** and tiny, so the numbers illustrate the **mechanisms**, not the scale of real systems.
:::

## 1. Why a third stage?

After SFT the model **imitates good answers** but a "good" answer can still be unfriendly or unsafe in tone. The lecture's example: asked about washing a teddy bear, the SFT answer was *"No, try hand washing it instead"* (correct, a bit curt), while the preferred answer is gentler: *"It's better not to... a gentle hand wash is safer."* **Preference tuning aligns style and values on top of what the model already knows.** It does not teach new facts.

Why not just add more SFT data?

1. **It is easier to compare than to write.** Writing a perfect poem is hard; choosing the better of two is easy.
2. **Prompt distribution matters in SFT.** Adding examples risks biasing the model; preference data gives a **relative signal** instead.
3. **SFT only gives positive signal**: it shows what to say, never **what not to say**. Preference pairs inject **negative signal**.
4. If a model misbehaves a lot, first check your **SFT data**; preference tuning is not a cure-all.

Together, **SFT + preference tuning = alignment**.

## 2. Preference data

Ways to collect ratings for a prompt's responses:

| Style | What you collect | Verdict |
|---|---|---|
| **Pointwise** | a score per response | hard and inconsistent for humans |
| **Pairwise** | **which of two** is better | the common choice: easy and reliable |
| **Listwise** | rank a list | richer but more work |

To make a pair: sample **two completions** of the same prompt (temperature above 0, so they differ), then **rate** them with humans, an **LLM as a judge** (Lecture 7), or rules; or take a bad response from your logs and **rewrite** it. Humans are sensitive to the **guidelines**, so keep guidelines clear to reduce noise. If the preferences come from **humans** the method is **RLHF**; from an **AI**, it is **RLAIF**.

## 3. The reward model: Bradley-Terry

We want a function `r(prompt, response)` giving a **score** (higher = better). The **Bradley-Terry** model says the probability that response `w` beats response `l` is

`P(w ≻ l) = exp(r_w) / (exp(r_w) + exp(r_l)) = σ(r_w − r_l)`

where σ is the **sigmoid**. To fit `r` we **maximise the probability of the observed preferences**. Taking the log and negating gives the **loss**: `L = −E[ log σ( r(x, y_w) − r(x, y_l) ) ]`. It is trained **pairwise**, but at inference the model scores **one response at a time** (the reward is "pointwise"). In practice the reward model is usually a decoder LLM with a **scalar head** on its last token (BERT-style encoders also work), and rewards are **normalised**. Specific **dimensions** (helpful, friendly, safe) can have separate reward models.

Train a tiny reward model on synthetic preferences:

```run
mkdir -p ~/l5 && cd ~/l5
cat > reward.py <<'PY'
import math, random
random.seed(7)

# Each response has 3 hidden features: [helpfulness, friendliness, length_in_hundreds_of_words]
# Raters (noisy) prefer helpful and friendly answers; length itself is NOT valued.
def rater_score(f): return 1.5 * f[0] + 1.0 * f[1] + random.gauss(0, 0.8)     # noise = inconsistent humans
def make_response(): return [random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1)]

pairs = []
for _ in range(2000):
    a, b = make_response(), make_response()
    pairs.append((a, b) if rater_score(a) > rater_score(b) else (b, a))      # (winner, loser)

w = [0.0, 0.0, 0.0]                                       # reward model: r = w . features
sigmoid = lambda z: 1 / (1 + math.exp(-z))
print(f"before training: Bradley-Terry loss {math.log(2):.3f} (= ln 2, a coin flip)")
for epoch in range(60):
    random.shuffle(pairs); total = 0
    for win, lose in pairs:
        diff = sum(wi * (a - b) for wi, a, b in zip(w, win, lose))
        total -= math.log(sigmoid(diff))
        g = sigmoid(diff) - 1                              # d loss / d diff
        for i in range(3): w[i] -= 0.01 * g * (win[i] - lose[i])
    if epoch in (0, 59): print(f"epoch {epoch:2}: average Bradley-Terry loss during the epoch {total / len(pairs):.3f}")

print("learned reward weights [helpful, friendly, length]:", [round(x, 2) for x in w])
test = [(make_response(), make_response()) for _ in range(2000)]
acc = sum((sum(wi * a for wi, a in zip(w, x)) > sum(wi * b for wi, b in zip(w, y))) == (rater_score(x) > rater_score(y)) for x, y in test) / len(test)
print(f"agreement with fresh (noisy) rater judgements: {acc:.1%}  (noise caps what is achievable)")
PY
python3 reward.py
```

**What you see:** the loss starts at 0.693 (= ln 2, a coin flip) and falls, and the model learns **large weights on helpfulness and friendliness and about zero on length**, so it recovered what the raters cared about from comparisons alone. The accuracy cannot reach 100% because the **raters themselves are noisy**.

## 4. Reinforcement learning, mapped onto an LLM

| RL term | In an LLM |
|---|---|
| **Agent** | the LLM |
| **State** `s_t` | the prompt plus the tokens generated so far |
| **Action** `a_t` | the next token (from the vocabulary) |
| **Policy** `π_θ(a|s)` | the model's next-token probability distribution |
| **Reward** | the reward model's score for the **whole completion** (also called a **rollout**) |

So the reward is **sparse**: one number per completion, much less signal than SFT's token-by-token supervision. RLHF is **on-policy**: each iteration the **current model generates**, is scored, and is updated from its **own** outputs. (SFT is off-policy: the data was not generated by the model.) The RL stage uses **more prompts** (often 100,000 or more) but the **reward model is frozen**; only the LLM trains.

## 5. Why stay close to the SFT model? Reward hacking

We could just maximise reward, but we do not want to move far from the **SFT (reference) model** because: (1) it already knows a lot (avoid forgetting); (2) the **reward model is imperfect**, so over-optimising it exploits its flaws (**reward hacking**); (3) large updates are **unstable**. The lecture's analogy: a lecturer who optimises for **loud applause** starts telling jokes, so the reward goes up while the real goal (informative lecture) is not met.

See hacking happen with **best-of-N sampling** (generate N answers and keep the one with the highest reward). Suppose true quality prefers moderate length, but the proxy reward model **slightly likes long answers**:

```run
cd ~/l5
cat > hacking.py <<'PY'
import random, statistics
random.seed(21)

def candidate():
    quality = random.gauss(0, 1)           # what we truly care about
    length = random.gauss(0, 1)            # verbosity (standardised)
    proxy = quality + 0.8 * length         # imperfect reward model: it likes long answers
    true = quality - 0.5 * max(length, 0) ** 2     # reality: very long answers are worse
    return proxy, true

print(f"{'N':>5} {'proxy reward':>13} {'true quality':>13}")
for N in (1, 2, 4, 16, 64, 256, 1024):
    res = [max((candidate() for _ in range(N)), key=lambda c: c[0]) for _ in range(1500)]
    print(f"{N:5} {statistics.fmean(p for p, _ in res):13.2f} {statistics.fmean(t for _, t in res):13.2f}")
print("\nThe proxy keeps rising as we search harder; the true quality stops improving and then falls. That is reward hacking (Goodhart's law).")
PY
python3 hacking.py
```

**What you see:** the **proxy** reward climbs with every increase in N, but the **true** quality rises at first, then **declines** once the search finds answers that exploit the reward model's bias. This is why we regularise.

## 6. RLHF with PPO

**PPO (proximal policy optimisation)** maximises reward **without large policy changes**. Terms:

- **Advantage `A`:** how much better this output was **than expected** (reward minus a baseline), which **reduces variance** and speeds up training. PPO estimates the baseline with a **value function** (a per-token estimate of the final reward if we keep following the policy), trained jointly, and combines them with **generalised advantage estimation**.
- **Ratio `r(θ) = π_θ(token) / π_θ_old(token)`:** how much more or less likely the **current** policy makes a token compared with the **previous iteration's** policy. (Careful: this `r` is **not** the reward.)
- **PPO-clip objective** (maximised): `min( r·A , clip(r, 1−ε, 1+ε)·A )`.
  - If `A > 0` (the output was good): increase the token's probability (`r` up), but **stop rewarding once `r > 1+ε`**.
  - If `A < 0` (bad): decrease its probability (`r` down), but **stop once `r < 1−ε`**.
  So each update is **bounded** ("proximal").
- **KL penalty:** a term subtracting `β · KL(π_θ || π_ref)` keeps the model near the **reference (SFT) model** (the original paper used the previous iteration; modern RLHF uses the reference and often combines both).

```run
cd ~/l5
cat > ppo.py <<'PY'
EPS = 0.2
def clip(x, lo, hi): return max(lo, min(hi, x))
def ppo_clip(ratio, adv): return min(ratio * adv, clip(ratio, 1 - EPS, 1 + EPS) * adv)

print("PPO-clip objective (we MAXIMISE it). epsilon = 0.2")
print(f"{'ratio':>6} {'A=+1':>7} {'A=-1':>7}")
for r in (0.5, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.6, 2.0):
    print(f"{r:6.1f} {ppo_clip(r, 1.0):7.2f} {ppo_clip(r, -1.0):7.2f}")
print("\nA > 0: the gain grows with the ratio up to 1.2, then is flat -> no reason to push the probability up further.")
print("A < 0: the objective stops improving once the ratio drops below 0.8 -> no reason to push it down further.")
PY
python3 ppo.py
```

**What you see:** for `A = +1` the objective rises linearly until `r = 1.2` and is then **flat**; for `A = −1` it rises as `r` falls, but **flattens below 0.8**. Flat regions mean zero gradient, which is the "do not move too far" mechanism.

**KL divergence in one line:** `KL(P||Q) = Σ p_i log(p_i / q_i)`. It is **never negative** and is **zero exactly when the distributions are equal** (proof by Jensen's inequality):

```run
cd ~/l5
cat > kl.py <<'PY'
import math
def kl(p, q): return sum(a * math.log(a / b) for a, b in zip(p, q) if a > 0)
ref = [0.5, 0.3, 0.2]
for name, pol in [("same as reference", [0.5, 0.3, 0.2]), ("slightly shifted", [0.55, 0.28, 0.17]), ("much more confident", [0.9, 0.07, 0.03])]:
    print(f"{name:20} KL(policy || reference) = {kl(pol, ref):.4f}")
print("KL is not symmetric: KL(ref || confident) =", round(kl(ref, [0.9, 0.07, 0.03]), 4))
PY
python3 kl.py
```

**The cost of PPO:** you juggle **four models** (policy, frozen reference, reward model, value model), a **two-stage pipeline** (a flaw in the reward model forces a redo), **many hyperparameters** (β, ε, GAE settings), **instability**, and a weak monitoring signal (average reward, unlike a cross-entropy loss). It also needs **exploration**: completions must differ, or there is nothing to compare.

## 7. Best-of-N, and its catch

**Best-of-N (BoN):** do no RL; at serving time **generate N candidates, score them with the reward model, return the top one**. Simple and effective, but you **pay N times the inference cost** (and latency is the slowest of the N). Scale of the reward does not matter for picking the maximum. It still needs a decent model (if all N are bad, the best is bad) and, as shown above, a **reward model that can be gamed** as N grows.

## 8. DPO: preference tuning as supervised learning

**DPO (direct preference optimisation)** starts from the same RLHF objective (maximise reward while staying near the reference, with strength `β`) and **solves for the optimal policy in closed form**. That solution lets you **write the reward in terms of the policy**, so substituting it into the Bradley-Terry loss makes the reward model **disappear**:

`L_DPO = −E[ log σ( β·( log π_θ(y_w|x)/π_ref(y_w|x) − log π_θ(y_l|x)/π_ref(y_l|x) ) ) ]`

The paper's title says it: *"your language model is secretly a reward model."* You need only **two models** (the one training and a **frozen reference**), a plain **supervised** loss on preference pairs, and a typical `β ≈ 0.1`. Trade-offs: PPO usually reaches **higher quality** but is hard to tune; DPO is **simpler and cheaper** but can suffer **distribution shift** (the preference data were not generated by your current model); you can reduce that with SFT on the preferred answers or by generating and rating on-policy data.

Run a DPO update on a toy "model" that chooses among three responses, and see how `β` controls drift:

```run
cd ~/l5
cat > dpo.py <<'PY'
import math

responses = ["curt but correct", "gentle and correct", "wrong"]
ref_logits = [1.2, 0.4, -0.8]                     # the SFT (reference) policy: prefers the curt answer
pairs = [(1, 0), (1, 2), (0, 2)]                  # (winner, loser): gentle > curt > wrong

def softmax(v):
    m = max(v); e = [math.exp(x - m) for x in v]; s = sum(e); return [x / s for x in e]
def logp(logits): 
    p = softmax(logits); return [math.log(x) for x in p]
def kl(p, q): return sum(a * math.log(a / b) for a, b in zip(p, q))

ref_lp = logp(ref_logits)
def dpo_loss(theta, beta):
    lp = logp(theta); total = 0
    for w, l in pairs:
        margin = beta * ((lp[w] - ref_lp[w]) - (lp[l] - ref_lp[l]))
        total += math.log(1 + math.exp(-margin))          # -log sigmoid(margin)
    return total / len(pairs)

def train(beta, steps=3000, lr=0.5):
    theta = ref_logits[:]
    for _ in range(steps):
        grad = []
        for i in range(3):                                  # finite-difference gradient (clear and short)
            up = theta[:]; up[i] += 1e-5; dn = theta[:]; dn[i] -= 1e-5
            grad.append((dpo_loss(up, beta) - dpo_loss(dn, beta)) / 2e-5)
        theta = [t - lr * g for t, g in zip(theta, grad)]
    return theta

print("reference policy:", {r: round(p, 3) for r, p in zip(responses, softmax(ref_logits))})
for beta in (0.1, 1.0, 5.0):
    th = train(beta)
    pol = softmax(th)
    print(f"beta={beta:<4} policy: " + ", ".join(f"{r}={p:.3f}" for r, p in zip(responses, pol)) + f"   KL from reference {kl(pol, softmax(ref_logits)):.3f}")
PY
python3 dpo.py
```

**What you see:** training moves probability mass **toward the gentle answer** (preferred in two of the three pairs) and away from the wrong one. With a **small β** (0.1) the policy goes almost all the way (KL from the reference about 1.26); with a **large β** (5) it stays much closer to the reference (KL about 0.47, and the curt answer keeps 25%). **β is the leash**: larger β penalises moving away from the SFT model more.

:::warn Common mistakes
- **Confusing the PPO ratio `r` with the reward.**
- **Believing preference tuning adds knowledge**: it reshapes behaviour the model already has.
- **Optimising the reward model as if it were the goal**: it is a proxy; watch for hacking and keep the KL term.
- **Skipping the reference model in DPO**: it is the anchor in the loss.
- **Assuming BoN is free**: you pay N times at inference.
- **Treating human ratings as clean**: noisy or contradictory guidelines cap the reward model.
:::

## 9. Interview-style questions

- **"What problem does RLHF solve that SFT doesn't?"** It encodes **relative preferences**, including **what not to do**, and tunes tone and safety with comparisons that are easier to collect than ideal answers.
- **"Explain the Bradley-Terry loss."** Negative log of sigmoid of the reward difference between winner and loser; trains a scalar scorer from pairs.
- **"Why a KL term?"** Prevent forgetting, limit reward hacking against an imperfect reward model, and stabilise training.
- **"PPO vs DPO?"** PPO: online RL, four models, highest ceiling, hard to tune; DPO: offline supervised loss with two models, simpler, risk of distribution shift.

:::try
1. In `reward.py` raise the rater noise from 0.8 to 3.0. What happens to the achievable agreement?
2. In `hacking.py` change the proxy's length weight from 0.8 to 0 and re-run. Does the true quality still fall?
3. In `ppo.py` change `EPS` to 0.1 and 0.4. How does the flat region move?
4. In `dpo.py` add the pair `(2, 1)` (a mistaken label). What happens to the policy?
:::

:::recap
- **Preference tuning** (after SFT) aligns tone, safety and helpfulness using **pairwise comparisons**, injecting negative signal.
- A **reward model** is trained with the **Bradley-Terry** loss `−log σ(r_w − r_l)` and scores one response at a time.
- **RLHF/PPO** treats the LLM as a policy, maximises **advantage** with **clipped** updates and a **KL** leash to the reference model; it is powerful but heavy.
- **Reward hacking** (Goodhart's law) appears when a proxy is over-optimised; **best-of-N** shifts the cost to inference.
- **DPO** removes the reward model: a supervised loss on pairs with a frozen reference, controlled by **β**.
:::

:::quiz
? What does the Bradley-Terry loss train?
- The tokenizer
+ A reward model that scores the winner above the loser
- The value function only
! Loss is −log σ(r_w − r_l).

? In PPO-clip, what happens when the advantage is positive and the ratio exceeds 1+ε?
- The objective keeps growing
+ The objective is flat, so there is no incentive to raise the probability further
- The model is reset
! Clipping bounds each update.

? Why is a KL penalty used in RLHF?
- To speed up inference
+ To keep the policy near the reference model and limit reward hacking and instability
- To lower the temperature
! The reward model is imperfect.

? What is the main cost of best-of-N?
- Training time
+ N times the inference cost
- A larger vocabulary
! You skip RL but generate and score N answers per request.

? How many models does DPO need during training?
- Four
+ Two: the policy being trained and a frozen reference
- One reward model only
! It removes the reward and value models.
:::
