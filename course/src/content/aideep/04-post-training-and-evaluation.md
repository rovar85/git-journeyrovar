---
track: aideep
title: Deep dive 4: post-training and evaluating models
short: Post-training
sub: Companion to chapter 4. Chat templates, SFT data, reward models and DPO math, and how to judge a model honestly.
---

:::goals
- show how a chat conversation is turned into the flat text a model reads
- compute the reward-model and DPO losses on small examples
- explain what RLHF optimises and where it goes wrong (reward hacking)
- evaluate a model with confidence intervals, and know the weaknesses of LLM judges
:::

## 1. A chat is just text with special markers

The model only continues text. A **chat template** wraps each message in special tokens so the model learns who is speaking and when to stop. During **supervised fine-tuning (SFT)** the model is trained on thousands of (instruction, ideal answer) conversations in exactly this format. Different model families use different markers, which is why using the wrong template silently degrades quality.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > template.py <<'EOF'
def render(messages, add_generation_prompt=True):
    out = ""
    for m in messages:
        out += f"<|{m['role']}|>\n{m['content']}<|end|>\n"
    if add_generation_prompt:
        out += "<|assistant|>\n"            # the model continues from here
    return out

conversation = [
    {"role": "system", "content": "You are a careful Enterprise Vault support assistant. If unsure, say so."},
    {"role": "user", "content": "Why is indexing stopped on EV01?"},
]
print(render(conversation))
print("---- training example (the loss is computed only on the assistant part) ----")
train = conversation + [{"role": "assistant", "content": "I need the indexing log. Please share the last 20 lines."}]
text = render(train, add_generation_prompt=False)
marker = "<|assistant|>\n"
prefix, answer = text.split(marker)
print("prompt tokens (masked, no loss):", repr(prefix[-40:]))
print("answer tokens (loss applied)   :", repr(answer))
EOF
python3 template.py
```

Two details matter. In SFT, **loss is computed only on the assistant's answer**, not on the user's text; otherwise the model would learn to imitate users. And at run time the application must add the template exactly as in training (the "generation prompt" at the end), which is what chat APIs do for you.

**What good SFT data looks like.** A few thousand high-quality, diverse, carefully checked examples beat a million sloppy ones. Quality dimensions: correct, helpful, in the desired tone and format, shows safe refusals where needed, covers edge cases (ambiguous questions, "I do not know").

## 2. Learning from preferences: the reward model

SFT teaches the format. To improve **quality** beyond what humans can write as demonstrations, we use **comparisons**: show two answers to one prompt, and a person (or a stronger model) says which is better. A **reward model** is trained to give a higher score to the preferred answer, using the **Bradley-Terry** loss: `loss = -log(sigmoid(score_preferred - score_rejected))`.

```run
cd ~/lab/ai
cat > reward.py <<'EOF'
import math, random
def sigmoid(x): return 1 / (1 + math.exp(-x))

# Each example: features of an answer = [correct, concise, polite, has_source]; human preference says A beat B
data = [
    ([1, 1, 1, 1], [0, 1, 1, 0]),
    ([1, 0, 1, 1], [1, 1, 0, 0]),
    ([1, 1, 0, 1], [0, 0, 1, 0]),
    ([1, 1, 1, 0], [1, 1, 1, 0]),   # a tie-ish pair: no difference
    ([0, 1, 1, 1], [0, 1, 0, 0]),
    ([1, 0, 0, 1], [0, 1, 1, 0]),
]
w = [0.0] * 4
def score(x): return sum(wi * xi for wi, xi in zip(w, x))
def loss():
    return sum(-math.log(sigmoid(score(a) - score(b))) for a, b in data) / len(data)

print(f"loss before training: {loss():.3f} (log 2 = {math.log(2):.3f} means 'cannot tell')")
lr = 0.5
for epoch in range(300):
    for a, b in data:
        p = sigmoid(score(a) - score(b))            # probability the model assigns to 'A is better'
        for i in range(4):
            w[i] += lr * (1 - p) * (a[i] - b[i])    # gradient step increasing score(a) - score(b)
print(f"loss after training : {loss():.3f}")
print("learned weights (what the reward model values):")
for name, wi in zip(["correct", "concise", "polite", "has_source"], w):
    print(f"  {name:11} {wi:6.2f}")
EOF
python3 reward.py
```

The learned weights show what the (tiny) reward model values: **correctness and sources** dominate here because humans chose those answers. Real reward models are LLMs with a scoring head, trained on tens of thousands of comparisons. They are only a **proxy** for what people truly want.

**RLHF** (reinforcement learning from human feedback) then trains the assistant with reinforcement learning to produce answers that the reward model scores highly, with a **KL penalty** that stops it drifting too far from the SFT model (otherwise it finds weird outputs that fool the reward model: **reward hacking**).

## 3. DPO: skipping the reward model

**Direct Preference Optimisation (DPO)** uses the same preference pairs but trains the assistant directly, no separate reward model and no reinforcement-learning loop. For each pair it compares how much the **new** model has increased the likelihood of the preferred answer relative to the **reference** (SFT) model, against the rejected one:

`loss = -log sigmoid( beta x [ (log pi(chosen) - log ref(chosen)) - (log pi(rejected) - log ref(rejected)) ] )`

```run
cd ~/lab/ai
cat > dpo.py <<'EOF'
import math
def sigmoid(x): return 1 / (1 + math.exp(-x))
def dpo_loss(pi_c, pi_r, ref_c, ref_r, beta=0.1):
    margin = beta * ((pi_c - ref_c) - (pi_r - ref_r))
    return -math.log(sigmoid(margin)), margin

# log-probabilities of the chosen (c) and rejected (r) answers under the policy being trained and the frozen reference
ref_c, ref_r = -42.0, -40.0
print(f"{'situation':44} {'margin':>8} {'loss':>7}")
cases = [
    ("policy equals reference (start of training)", -42.0, -40.0),
    ("policy likes the chosen answer more", -38.0, -40.0),
    ("policy likes chosen more, rejected much less", -38.0, -48.0),
    ("policy got it backwards", -46.0, -36.0),
]
for label, pc, pr in cases:
    loss, margin = dpo_loss(pc, pr, ref_c, ref_r)
    print(f"{label:44} {margin:8.2f} {loss:7.3f}")
print()
print("loss at the start is log 2 =", round(math.log(2), 3), "; training pushes the margin up, so the loss falls toward 0.")
EOF
python3 dpo.py
```

DPO is simpler and more stable, so it is widely used; RL methods with verifiable rewards (for example "did the code pass the tests?", "is the maths answer right?") are used for reasoning models because the reward is **checkable** rather than a human opinion.

## 4. Problems with preference data

| Problem | Effect | Mitigation |
|---|---|---|
| **Length bias** | people and judges prefer longer answers, so models get wordy | length-controlled evaluation, penalise length |
| **Sycophancy** | agreeing with the user wins ratings, even when the user is wrong | include disagree-correctly examples, measure it |
| **Annotator disagreement and noise** | the "right" label is a judgement call | multiple raters, clear guidelines, audit |
| **Reward hacking** | optimising a proxy beyond its validity | KL penalty, fresh reward models, human spot checks |
| **Narrow coverage** | good on common prompts, brittle on rare ones | diverse prompts, red-teaming |

## 5. Evaluating a model honestly

You cannot judge a model on one demo. A sound evaluation has:

1. a **test set** of realistic prompts with known good answers or a scoring rule,
2. a **metric** (exact match, pass rate, rubric score),
3. **enough samples** that the result is not luck, with a **confidence interval**,
4. a **comparison** on the same set against a baseline.

```run
cd ~/lab/ai
cat > eval.py <<'EOF'
import math, random

def wilson(successes, n, z=1.96):
    # 95% confidence interval for a proportion
    p = successes / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return centre - half, centre + half

print("Same observed accuracy (80%), different test-set sizes:")
for n in (10, 50, 200, 1000):
    lo, hi = wilson(int(0.8 * n), n)
    print(f"  n={n:5}: 95% interval {lo*100:5.1f}% to {hi*100:5.1f}%   (width {100*(hi-lo):4.1f} points)")

print()
print("Is model B (84%) really better than model A (80%) on 100 questions each? Simulate many re-runs:")
random.seed(3)
wins = 0
trials = 2000
for _ in range(trials):
    a = sum(random.random() < 0.80 for _ in range(100))
    b = sum(random.random() < 0.84 for _ in range(100))
    wins += b > a
print(f"  B beat A in {wins/trials*100:.0f}% of repeated experiments (even though B is truly better).")
EOF
python3 eval.py
```

With 10 questions, "80%" could really be anywhere from about 49% to 94%. And a 4-point improvement measured on 100 questions will **fail to show up** in a good fraction of experiments. Practical rule: for small gains you need hundreds or thousands of test cases, or **paired comparisons** on the same questions.

### LLM-as-judge: useful, but calibrate it

Using a strong model to grade open-ended answers is cheap and scalable, but judges have **biases**: they prefer longer answers, prefer their own style, are sensitive to answer order (position bias) and can be fooled by confident wording. Good practice: give a written **rubric**, randomise the order of A and B, test the judge against a small set of human labels (**agreement rate**), and keep a human-checked sample.

### Benchmarks and their limits

Public benchmarks (MMLU for knowledge, HumanEval/SWE-bench for code, GSM8K/MATH for maths, TruthfulQA, tool-use and agent benchmarks) are useful for rough comparison but get **saturated** and **contaminated**. Your decision should rest on **your own task-specific test set** (chapter 9 builds one).

## Common misconceptions

- "RLHF teaches the model facts." It shapes style, helpfulness and safety behaviour; knowledge comes from pre-training.
- "A higher benchmark score means better for my application." Only if the benchmark resembles your task and was not in training data.
- "Humans are the gold standard judges." They are slow, inconsistent and biased too; measure agreement.
- "DPO and RLHF are totally different goals." Both optimise toward human preferences; they differ in method.

## Practice (answers below)

1. In the reward loss, what happens if the model scores the rejected answer higher than the preferred one by 3 points?
2. Why compute loss only on the assistant tokens in SFT?
3. A test set of 20 questions gives 90% accuracy. Is that proof the model is better than one with 80% on the same set?
4. Name two ways to reduce the length bias of an LLM judge.

:::note Answers
1. The sigmoid of -3 is small (about 0.047), so the loss -log(0.047) is large (about 3.05): a big correction signal.
2. We want the model to learn to write answers, not to imitate what users type.
3. No: with 20 questions the interval is very wide (roughly 70% to 97%), so the difference is within noise.
4. Give the judge a rubric that scores correctness independently of length, and compare answers after length normalisation, or randomise and cap length.
:::

:::recap
- Chat models read templated text; SFT trains on (instruction, ideal answer) with loss on the answer only.
- Reward models learn from preference pairs (Bradley-Terry); RLHF optimises against them with a KL leash; DPO optimises preferences directly.
- Preference data has biases (length, sycophancy, noise); reward hacking is the failure mode.
- Honest evaluation needs enough samples, confidence intervals, baselines, calibrated judges and task-specific tests.
:::

:::quiz
? What does a reward model do?
+ Scores an answer so preferred answers get higher scores than rejected ones
- Generates the answer
- Tokenizes the prompt
- Stores facts
! It is trained from human (or AI) preference comparisons.
? Why does RLHF include a KL penalty?
+ To stop the model drifting far from its starting behaviour while chasing reward
- To speed up training
- To lower the temperature
- To remove duplicates
! Without it the model can exploit weaknesses in the reward model.
? You compare two models on 50 questions and one scores 4 points higher. What should you do before concluding it is better?
+ Check the confidence interval or use more or paired questions
- Ship it
- Lower the temperature
- Ignore the result
! Small samples give noisy differences.
? Which is a known bias of LLM judges?
+ Preferring longer answers
- Refusing to grade
- Always picking the shortest answer
- Ignoring the rubric entirely
! Control it with rubrics and order randomisation.
:::
