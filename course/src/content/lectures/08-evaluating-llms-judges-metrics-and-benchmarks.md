---
track: lectures
title: "Lecture 8: Evaluating LLMs: raters, metrics, LLM-as-a-judge, factuality, agents and benchmarks"
short: L8 Evaluating LLMs
sub: Why free-form output is hard to score, inter-rater agreement and Cohen's kappa, BLEU/ROUGE-style limits, LLM-as-a-judge and its three biases, factuality by atomic facts, pass^k for agents, benchmark families, contamination and Pareto frontiers, with each idea computed.
---

:::goals
- explain why evaluating **free-form text** is hard and why **human rating** alone does not scale
- compute **agreement rate and Cohen's kappa**, and see why raw agreement is misleading
- show the limits of **reference-based metrics** (BLEU, ROUGE, METEOR) on paraphrases
- design an **LLM-as-a-judge** (rationale then binary score, structured output) and counter **position, verbosity and self-enhancement bias**
- score **factuality** by decomposing text into **weighted atomic facts**
- evaluate **agents** (tool prediction, call, response failures; **pass^k** reliability) and read **benchmark** families, **contamination**, **Goodhart's law** and **Pareto frontiers**
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 8** (your file is labelled "diffusion-llms" by my fetch script, but its content is **evaluation**; diffusion is in lecture 9). Explained in my own words with **original, runnable Python** (standard library only). The **judge in the simulations is a mock** with built-in biases so that the biases and their fixes are measurable; no real model is called.
:::

## 1. What are we evaluating?

"Evaluate the LLM" can mean quality, coherence, factuality, **latency, cost, uptime**. This lecture is about **output quality**. The difficulty: the output is **free-form** (prose, code, maths), so there is no single metric.

**Ideal but impractical:** have a human rate **every** response. It is slow, expensive, and the task itself can be **subjective** (is "a teddy bear is almost always a sweet gift; pick one that feels right" useful? One rater says yes, another says it is vague).

## 2. Inter-rater agreement and Cohen's kappa

Track how consistently raters agree, and run **calibration sessions** when they do not. But the **raw agreement rate** is misleading: two raters who answer **randomly** with probability `p_A` and `p_B` of saying "good" agree with probability `p_A·p_B + (1−p_A)(1−p_B)`: **50% when both flip a fair coin**, and higher when they are biased. So raw agreement needs a **chance baseline**. **Cohen's kappa** is `(p_observed − p_chance) / (1 − p_chance)`: **0 = no better than chance, 1 = perfect, negative = worse than chance**. For more than two raters: **Fleiss' kappa**, **Krippendorff's alpha**.

```run
mkdir -p ~/l8 && cd ~/l8
cat > kappa.py <<'PY'
import random
random.seed(14)

def cohen_kappa(a, b):
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    pa1, pb1 = sum(a) / n, sum(b) / n
    pe = pa1 * pb1 + (1 - pa1) * (1 - pb1)
    return po, pe, (po - pe) / (1 - pe) if pe < 1 else 0.0

def raters(p_a, p_b, n=20000):
    return [int(random.random() < p_a) for _ in range(n)], [int(random.random() < p_b) for _ in range(n)]

for pa, pb, label in [(0.5, 0.5, "two coin-flippers"), (0.9, 0.9, "both say 'good' 90% of the time, independently")]:
    a, b = raters(pa, pb)
    po, pe, k = cohen_kappa(a, b)
    print(f"{label:48} agreement {po:.2f}  chance {pe:.2f}  kappa {k:+.2f}")

# raters who truly look at the same quality signal (90% reliable each)
truth = [int(random.random() < 0.6) for _ in range(20000)]
a = [t if random.random() < 0.9 else 1 - t for t in truth]
b = [t if random.random() < 0.9 else 1 - t for t in truth]
po, pe, k = cohen_kappa(a, b)
print(f"{'two careful raters (each right 90% of the time)':48} agreement {po:.2f}  chance {pe:.2f}  kappa {k:+.2f}")
PY
python3 kappa.py
```

**What you see:** two random raters who say "good" 90% of the time **agree 82% of the time** but have **kappa about 0**; careful raters get a high kappa. Agreement is only meaningful **relative to chance**.

## 3. Reference-based metrics, and why they fail on language

A cheaper idea: humans write **reference answers once**; a formula compares the model output to them. Classic metrics:

- **BLEU** (translation): precision of matching n-grams in the **output**, with a **brevity penalty** (otherwise very short outputs score high).
- **ROUGE** (summarisation): recall-oriented n-gram overlap.
- **METEOR**: an F-score (precision and recall) times `(1 − penalty)`, where the penalty **punishes scrambled word order** (few long contiguous matches are good), with hyper-parameters chosen by hand and some credit for synonyms and stems.

Limits: **arbitrary recipes**, **weak correlation with human judgement**, still need human references, and above all **no allowance for paraphrase**.

```run
cd ~/l8
cat > bleu.py <<'PY'
import math
from collections import Counter

def ngrams(toks, n): return Counter(tuple(toks[i:i + n]) for i in range(len(toks) - n + 1))
def clipped_precision(cand, ref, n):
    c, r = ngrams(cand, n), ngrams(ref, n)
    overlap = sum(min(v, r[k]) for k, v in c.items())
    return overlap / max(sum(c.values()), 1)
def bleu(cand, ref, max_n=2):
    ps = [clipped_precision(cand, ref, n) for n in range(1, max_n + 1)]
    if min(ps) == 0: return 0.0
    bp = 1.0 if len(cand) >= len(ref) else math.exp(1 - len(ref) / len(cand))      # brevity penalty
    return bp * math.exp(sum(math.log(p) for p in ps) / max_n)
def rouge1_recall(cand, ref):
    c, r = Counter(cand), Counter(ref)
    return sum(min(v, c[k]) for k, v in r.items()) / sum(r.values())

ref = "a plush teddy bear can comfort a child during bedtime".split()
cands = {
    "near copy": "a plush teddy bear can comfort a child at bedtime".split(),
    "good paraphrase": "soft stuffed bears often help kids feel safe as they fall asleep".split(),
    "scrambled words": "bedtime during child a comfort can bear teddy plush a".split(),
    "too short": "teddy bear".split(),
}
print(f"{'candidate':18} {'BLEU-2':>7} {'ROUGE-1 recall':>15}")
for name, c in cands.items():
    print(f"{name:18} {bleu(c, ref):7.2f} {rouge1_recall(c, ref):15.2f}")
print("\nThe good paraphrase scores about zero; the scrambled nonsense gets ROUGE-1 credit for sharing words.")
PY
python3 bleu.py
```

## 4. LLM-as-a-judge

Use an LLM as the rater. **Input:** the **prompt**, the **response**, and the **criteria**. **Output:** a **rationale** and a **score** (pass or fail). Benefits: **no reference or human labels needed to start** (it already holds knowledge and preference signals) and the **rationale makes the score interpretable**. Two common forms: **pointwise** (grade one response) and **pairwise** (which of two is better; also a way to **generate synthetic preference data** for Lecture 5).

**Best practices:**

1. **Crisp criteria**: say exactly what is wanted and what is not.
2. **Binary scale** (pass/fail): easier for the judge and for humans, with less noise.
3. **Rationale before score** (a chain of thought for the judge; it improves quality).
4. **Guarantee the format** with **structured output** (guided decoding from Lecture 3), because a probabilistic model may not return something parseable otherwise.
5. **Low temperature** (about 0 to 0.2) so evaluations are **reproducible**.
6. **Calibrate against humans**: collect some human ratings, correlate, refine the prompt. The judge is a **proxy**; do not over-optimise against it.
7. Use a **different, preferably stronger** model than the one being judged.

**Known biases:**

| Bias | What happens | Mitigation |
|---|---|---|
| **Position bias** | prefers the response shown **first** (or last) | ask **A vs B and B vs A**, accept only when they agree (or majority) |
| **Verbosity bias** | prefers the **longer** answer | explicit guidelines, in-context examples, a **length penalty** |
| **Self-enhancement bias** | prefers text generated by **itself** | judge with a **different** (and bigger) model |

Simulate a biased judge and measure each mitigation:

```run
cd ~/l8
cat > judge.py <<'PY'
import random
random.seed(31)

def mock_judge(a, b, pos_bias=0.15, len_bias=0.02):
    """Return 'A' or 'B'. True quality matters, but the judge adds a bonus for position A and for length."""
    score_a = a["quality"] + pos_bias + len_bias * a["words"] + random.gauss(0, 0.3)
    score_b = b["quality"] + len_bias * b["words"] + random.gauss(0, 0.3)
    return "A" if score_a > score_b else "B"

def make(quality, words): return {"quality": quality, "words": words}
trials = 6000

# 1. Position bias: two responses of IDENTICAL quality and length
same = [(make(0, 50), make(0, 50)) for _ in range(trials)]
picks_a = sum(mock_judge(a, b) == "A" for a, b in same) / trials
print(f"identical answers: judge picks the one shown first {picks_a:.0%} of the time (fair = 50%)")

# 2. Mitigation: ask twice with the order swapped, keep only consistent verdicts
def swapped_verdict(a, b):
    v1 = mock_judge(a, b)                          # A first
    v2 = mock_judge(b, a)                          # B first
    r1 = "first" if v1 == "A" else "second"
    r2 = "second" if v2 == "A" else "first"        # translate back: 'first' means original a
    return r1 if r1 == r2 else "tie"
res = [swapped_verdict(a, b) for a, b in same]
print(f"with order swapping: first {res.count('first') / trials:.0%}, second {res.count('second') / trials:.0%}, tie {res.count('tie') / trials:.0%} (balanced)")

# 3. Verbosity bias: the long answer is WORSE (quality -0.3) but 50 words longer
def long_wins(len_bias):
    wins = 0
    for _ in range(trials):
        short, long_ = make(0.0, 40), make(-0.3, 90)
        wins += mock_judge(long_, short, pos_bias=0, len_bias=len_bias) == "A"
    return wins / trials
print(f"worse-but-longer answer wins {long_wins(0.02):.0%} of the time with the judge's natural length bias")
print(f"after cancelling the length bonus with a length penalty it wins {long_wins(0.0):.0%}  (the remainder is plain judge noise)")
PY
python3 judge.py
```

**What you see:** with two **identical** answers the mock judge picks the first one far more than 50% of the time; **swapping the order and keeping only consistent verdicts** makes the picks balanced (the remainder become **ties**, which is the honest outcome). The verbosity demo shows a **worse but longer** answer winning about 95% of the time, and only a **quarter** of the time once the length bonus is cancelled (the rest is judge noise).

## 5. Factuality: break text into facts

A single pass/fail is too coarse for a paragraph with some wrong claims. The recipe used today:

1. **Decompose** the text into **atomic facts** (one LLM call).
2. **Check each fact** pass/fail (typically using **retrieval or web search**, Lecture 7).
3. **Aggregate** with optional **importance weights**: `score = Σ α_i·correct_i / Σ α_i`.

The lecture's example sentence (teddy bears created in the 1920s, named after a president who proudly wanted to shoot a captured bear) has two errors (it was about 1902, and he refused to shoot it):

```run
cd ~/l8
cat > facts.py <<'PY'
facts = [
    # (atomic fact, correct?, importance weight)
    ("Teddy bears were first created in the 1920s", False, 1.0),
    ("Teddy bears are named after President Theodore Roosevelt", True, 3.0),
    ("Roosevelt was on a hunting trip", True, 1.0),
    ("Roosevelt proudly wanted to shoot a captured bear", False, 1.0),
]
def score(facts, weighted):
    w = [(f[2] if weighted else 1.0) for f in facts]
    return sum(wi for wi, f in zip(w, facts) if f[1]) / sum(w)
print(f"unweighted factuality: {score(facts, False):.2f}  (2 of 4 facts correct)")
print(f"weighted factuality  : {score(facts, True):.2f}  (the namesake fact counts three times)")
for f in facts:
    print(f"  {'OK ' if f[1] else 'ERR'} weight {f[2]}  {f[0]}")
PY
python3 facts.py
```

## 6. Evaluating agents

An agent turns a request into a loop of (predict a tool call, execute it, interpret the result). Evaluate **each step**, because a bad final answer can come from any of them (the failure table in Lecture 7). Practical advice from the lecture: **categorise errors** and fix them **in groups** (model reasoning and grounding, **relevance of what is in the context**, tool and router **modelling**, or the **tool code** itself), otherwise fixing one case at a time becomes an endless chase.

**Reliability metric:** `pass@k` (Lecture 6) asks whether **at least one** of k attempts succeeds, which is right for coding with tests, where you can pick the winner. For **customer-facing agents** you need the opposite: **pass^k** = the probability that **all k** attempts succeed. From n trials with c successes: `C(c,k) / C(n,k)`; if each attempt succeeds with probability p, it is `p^k`. It punishes inconsistency.

```run
cd ~/l8
cat > passhat.py <<'PY'
from math import comb
p = 0.8
print(f"single-attempt success p = {p}")
print(f"{'k':>3} {'pass@k (at least one)':>22} {'pass^k (all succeed)':>22}")
for k in (1, 2, 4, 8):
    print(f"{k:3} {1 - (1 - p) ** k:22.3f} {p ** k:22.3f}")
n, c = 20, 16
print(f"\nfrom {c} successes in {n} trials: pass^4 estimate = C({c},4)/C({n},4) = {comb(c, 4) / comb(n, 4):.3f}  (true 0.8^4 = {0.8 ** 4:.3f})")
PY
python3 passhat.py
```

**What you see:** an agent that is right 80% of the time looks excellent on `pass@8` (about 100%) but only **17%** of the time would it succeed 8 times in a row. **tau-bench** (airline and retail simulations: tools, policies, a **simulated user played by another LLM**, success judged by the **resulting database state**) reports exactly this kind of consistency.

## 7. Benchmarks

Families (pick benchmarks that match your use):

| Family | What it tests | Examples | Notes |
|---|---|---|---|
| **Knowledge** | recall of facts across domains (mostly pre-training quality) | **MMLU** (about 57 subjects, four-option multiple choice) | answers are letters, so extraction is **hard-coded** |
| **Reasoning** | multi-step maths, common sense | **AIME** (answer is a 3-digit number), **PIQA** (physical common sense, two options) | verifiable |
| **Coding** | real software tasks | **SWE-bench** (GitHub issues; judged by tests that fail before the patch and pass after) | also predicts agent usefulness |
| **Safety** | harmful behaviour, copyright, multimodal | **HarmBench** (judged by a **trained classifier**, which can itself err) | policies differ by provider, so scores are **hard to compare**; read the contents |
| **Agentic** | tools plus policies plus conversation | **tau-bench** (pass^k) | simulated user |
| **Preference** | what people like | **Chatbot Arena** (pairwise votes, ranked) | noisy, can be **gamed**; users favour answers over refusals and emojis; population differs from yours |

**Traps:**

- **Training on the test task** (not only the test set): a model trained on data in the style of a benchmark scores higher without being generally better; compare models only with similar training exposure.
- **Contamination:** answers leaking into training data. Defences: **hash values** (canaries), **block lists** of websites for tool-use benchmarks, **new exams** the model cannot have seen.
- **Goodhart's law:** *when a measure becomes a target, it ceases to be a good measure.*
- A benchmark table is a **profile**, not a rank. Plot **score against cost** (or latency, safety, context length): the **Pareto frontier** is the set of models no other model beats on both axes. Ultimately, **try the models on your own tasks.**

```run
cd ~/l8
cat > pareto.py <<'PY'
# (name, score on my task, cost in dollars per million tokens): MADE-UP numbers for illustration
models = [("big-reasoner", 92, 15.0), ("big-chat", 88, 10.0), ("mid-chat", 84, 2.0), ("mid-old", 80, 2.5),
          ("small-fast", 76, 0.3), ("tiny", 60, 0.1), ("overpriced-ok", 78, 12.0)]
def dominated(m): return any(o[1] >= m[1] and o[2] <= m[2] and (o[1] > m[1] or o[2] < m[2]) for o in models)
print(f"{'model':16} {'score':>6} {'cost':>7}  on the Pareto frontier?")
for m in sorted(models, key=lambda x: x[2]):
    print(f"{m[0]:16} {m[1]:6} {m[2]:7.2f}  {'YES' if not dominated(m) else 'no (beaten on both axes)'}")
PY
python3 pareto.py
```

:::warn Common mistakes
- **Reading raw agreement as quality** (use kappa or similar).
- **Using BLEU or ROUGE for open-ended generation**.
- **Judging with the same model that produced the answer**, or ignoring position and length.
- **Not checking the judge against humans.**
- **Scoring a paragraph as one pass/fail** when it contains many facts.
- **Reporting pass@k for a consumer agent**: you need pass^k.
- **Treating a leaderboard rank as your answer**: contamination, Goodhart and mismatch of tasks.
:::

## 8. Interview-style questions

- **"Why not use BLEU for a chatbot?"** It compares to fixed references; many valid answers share no n-grams; it correlates weakly with human judgement.
- **"How would you build and trust an LLM judge?"** Crisp binary criteria, rationale then score with structured output, low temperature, a different strong model, swap positions, control length, and calibrate against a human-labelled sample.
- **"How would you measure the reliability of a support agent?"** Run each task many times, report pass^k and category-wise failures (tool choice, arguments, tool result handling), with a simulated user and state-based success.
- **"What is a Pareto frontier of models?"** The set not dominated on both quality and cost.

:::try
1. In `kappa.py` make one rater **always** say "good". What is kappa, and why?
2. In `judge.py` set `pos_bias = 0` and check the swapped result.
3. In `facts.py` add a fifth fact and recompute both scores.
4. In `passhat.py` compute how good a single attempt must be (p) for pass^8 to reach 0.9.
:::

:::recap
- Free-form output makes evaluation hard; **human ratings** are slow and subjective, so track **kappa**, not raw agreement.
- **BLEU/ROUGE/METEOR** compare to references and **fail on paraphrase**.
- **LLM-as-a-judge**: crisp binary criteria, rationale first, structured output, low temperature, a different strong model, **swap positions**, control **length**, **calibrate with humans**.
- **Factuality**: decompose into atomic facts, check each, aggregate with weights.
- **Agents**: evaluate every step; use **pass^k** for reliability; categorise errors.
- **Benchmarks** have families, contamination and Goodhart problems; look at profiles and **Pareto frontiers**, and test on your own tasks.
:::

:::quiz
? Two raters pick "good" 90% of the time at random. Their raw agreement is high; what is kappa?
- Close to 1
+ Close to 0, since agreement is at chance level
- Negative 1
! Kappa subtracts chance agreement.

? How do you reduce position bias in a pairwise judge?
- Use a bigger prompt
+ Run the comparison in both orders and accept only consistent verdicts
- Raise the temperature
! Disagreement between orders signals a tie.

? Why is pass^k used for customer-facing agents?
- It is easier to compute
+ It measures the probability that all k attempts succeed, which rewards consistency
- It measures speed
! pass@k only needs one success.

? Why break a paragraph into atomic facts?
- To make it shorter
+ To score factuality at the granularity of individual claims rather than one coarse pass/fail
- To avoid retrieval
! Aggregate with weights for importance.

? What does Goodhart's law warn about?
- Hardware limits
+ A metric used as a target stops being a reliable measure
- Tokenisation
! Optimising a benchmark does not equal improving the model.
:::
