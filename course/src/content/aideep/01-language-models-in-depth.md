---
track: aideep
title: Deep dive 1: language models in depth
short: LLMs in depth
sub: Companion to chapter 1. Probabilities, sampling, perplexity, memory and cost: the numbers behind "predict the next word".
---

:::goals
- compute a next-token probability distribution with softmax by hand and in code
- explain what training measures (cross-entropy) and what perplexity means
- estimate the memory and cost of running a model
- name the main kinds of model and the real reasons models "hallucinate"
:::

:::note How to use a deep dive
Chapter 1 gave you the picture. Here we do the arithmetic, in small Python programs (no libraries, nothing to install) whose output is real. Read the explanation, look at the output, then change a number and predict what happens before you run it again on your own machine. That is how intuition forms.
:::

## 1. What the model actually outputs

A language model never outputs a word. It outputs a **score for every token in its vocabulary** (the **logits**), and a function called **softmax** turns the scores into probabilities that add up to 1:

`p(token i) = exp(score_i) / sum over all j of exp(score_j)`

Softmax makes every probability positive, keeps the order of the scores, and exaggerates differences (a score gap of 2 means roughly 7 times more likely, because e^2 is about 7.4).

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > softmax.py <<'EOF'
import math

# Pretend the model has read "The capital of France is" and produces these raw scores (logits).
logits = {" Paris": 9.1, " Lyon": 6.0, " the": 5.2, " a": 4.4, " Berlin": 3.9, " banana": -2.0}

def softmax(scores):
    m = max(scores)                       # subtract the max: avoids overflow, result is identical
    exps = [math.exp(s - m) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]

probs = softmax(list(logits.values()))
print(f"{'token':10} {'logit':>6} {'probability':>12}")
for (tok, lg), p in sorted(zip(logits.items(), probs), key=lambda x: -x[1]):
    print(f"{tok!r:10} {lg:6.1f} {p:12.4f}")
print("sum of probabilities:", round(sum(probs), 6))
EOF
python3 softmax.py
```

Notice three things. The model is **not certain**: "Paris" gets about 93%, and every other token still has a small share. The answer "Lyon" is not nonsense to the model, it is simply less likely. And "banana" is almost zero but **never exactly zero**. These leftover probabilities are the reason a model can occasionally say something odd, and sampling (next section) is how we decide whether to ever pick them.

## 2. From probabilities to a word: sampling

After softmax we must **choose** one token. Options:

| Strategy | Rule | Effect |
|---|---|---|
| **Greedy** | always the most probable token | deterministic, repetitive, can loop |
| **Temperature T** | divide the logits by T before softmax | T below 1 sharpens (safer), above 1 flattens (more varied) |
| **Top-k** | keep only the k most probable tokens, renormalise | cuts off the long tail |
| **Top-p (nucleus)** | keep the smallest set of tokens whose probabilities add up to p | adapts to how sure the model is |

```run
cd ~/lab/ai
cat > sampling.py <<'EOF'
import math, random
logits = {" Paris": 9.1, " Lyon": 6.0, " the": 5.2, " a": 4.4, " Berlin": 3.9, " banana": -2.0}
names = list(logits)

def softmax(xs, T=1.0):
    xs = [x / T for x in xs]
    m = max(xs)
    e = [math.exp(x - m) for x in xs]
    s = sum(e)
    return [v / s for v in e]

def show(label, probs):
    print(f"{label:22}", "  ".join(f"{n.strip()}={p:.3f}" for n, p in zip(names, probs)))

base = list(logits.values())
for T in (0.5, 1.0, 2.0, 5.0):
    show(f"temperature {T}", softmax(base, T))

def top_k(probs, k):
    keep = sorted(range(len(probs)), key=lambda i: -probs[i])[:k]
    z = sum(probs[i] for i in keep)
    return [probs[i] / z if i in keep else 0.0 for i in range(len(probs))]

def top_p(probs, p):
    order = sorted(range(len(probs)), key=lambda i: -probs[i])
    keep, acc = set(), 0.0
    for i in order:
        keep.add(i); acc += probs[i]
        if acc >= p: break
    z = sum(probs[i] for i in keep)
    return [probs[i] / z if i in keep else 0.0 for i in range(len(probs))]

print()
show("top-k = 2", top_k(softmax(base), 2))
show("top-p = 0.97", top_p(softmax(base), 0.97))

# Draw 1000 samples at each temperature and count how often each token wins.
random.seed(7)
print()
for T in (0.5, 1.0, 2.0):
    p = softmax(base, T)
    counts = {n.strip(): 0 for n in names}
    for _ in range(1000):
        counts[random.choices(names, weights=p)[0].strip()] += 1
    print(f"T={T}: {counts}")
EOF
python3 sampling.py
```

Read the table: at T=0.5 almost all mass sits on "Paris"; at T=5 the distribution is nearly flat and "banana" climbs from almost nothing to about 4%. **Practical rules**: for factual answers and tool calls, use a low temperature (0 to 0.3). For brainstorming and creative text use 0.7 to 1.0. Do not combine very high temperature with weak top-p/top-k filtering for anything that must be correct. (Temperature 0 means "always pick the top token"; results can still vary slightly between runs on some systems because of floating-point effects.)

## 3. How training measures "wrong": cross-entropy and perplexity

During training the model sees real text. For each position we know the **true next token**. The model's **loss** at that position is `-log(probability it gave to the true token)`. If it gave the true token probability 0.95, the loss is small (0.05); if it gave 0.001, the loss is large (6.9). Averaged over many tokens this is the **cross-entropy loss**, and training adjusts the weights to push it down.

**Perplexity** is `exp(loss)`: the "effective number of choices" the model is torn between. A perplexity of 10 means it is as uncertain as if it were choosing uniformly among 10 tokens.

```run
cd ~/lab/ai
cat > perplexity.py <<'EOF'
import math

# Probability the model gave to the TRUE next token at each of 8 positions
confident_model = [0.9, 0.8, 0.95, 0.7, 0.85, 0.9, 0.6, 0.75]
clueless_model  = [0.1, 0.05, 0.2, 0.1, 0.02, 0.1, 0.3, 0.08]
uniform_over_50 = [1 / 50] * 8                     # a model that has learned nothing

for name, ps in [("confident", confident_model), ("clueless", clueless_model), ("uniform over 50 tokens", uniform_over_50)]:
    loss = sum(-math.log(p) for p in ps) / len(ps)
    print(f"{name:24} loss = {loss:5.3f}   perplexity = {math.exp(loss):6.2f}")
print()
print("Check the intuition: perplexity of the uniform model is exactly its number of choices (50).")
EOF
python3 perplexity.py
```

Two lessons. **Loss/perplexity only measures how well the model predicts held-out text**, not whether it is helpful, truthful or safe: that is why the next chapters (post-training, evaluation) exist. And the uniform baseline gives you a reference: a model with perplexity near the vocabulary size has learned nothing.

## 4. A tiny language model you can read

A **bigram model** predicts the next word from only the previous word, by counting. It is the simplest possible language model and contains the whole idea: learn statistics from text, then sample from them.

```run
cd ~/lab/ai
cat > bigram.py <<'EOF'
import random, math, collections
text = """the indexing service reads the mail and the storage service writes the item
the search service reads the index and the admin service reads the log
the indexing service writes the index and the storage service reads the item""".split()

counts = collections.defaultdict(collections.Counter)
for a, b in zip(text, text[1:]):
    counts[a][b] += 1

print("after 'the' the model has seen:", dict(counts["the"]))
print("after 'service' it has seen    :", dict(counts["service"]))

def generate(start, n, seed):
    rnd = random.Random(seed)
    out = [start]
    for _ in range(n):
        options = counts.get(out[-1])
        if not options: break
        words, weights = zip(*options.items())
        out.append(rnd.choices(words, weights)[0])
    return " ".join(out)

print()
for s in (1, 2, 3):
    print("sample", s, ":", generate("the", 9, s))

# Perplexity of the model on its own training text (it has memorised it, so it is low)
loss = 0
for a, b in zip(text, text[1:]):
    loss += -math.log(counts[a][b] / sum(counts[a].values()))
print()
print("training perplexity:", round(math.exp(loss / (len(text) - 1)), 2))
EOF
python3 bigram.py
```

The samples start like plausible fragments but drift into nonsense ("the log the indexing service"), because the model only ever looks one word back. A transformer replaces "the previous word" with "everything so far" and counting with learned numbers, but sampling from a predicted distribution is identical.

## 5. How big, how expensive: the arithmetic you should know

A model is a pile of **parameters** (numbers). The memory to hold it is `parameters x bytes per number`. Common precisions: 32-bit float (4 bytes), 16-bit (2 bytes), 8-bit integer (1 byte), 4-bit (0.5 byte).

```run
cd ~/lab/ai
cat > sizes.py <<'EOF'
def gb(params_billion, bytes_per_param):
    return params_billion * 1e9 * bytes_per_param / 1e9

print(f"{'model size':>12} {'16-bit':>9} {'8-bit':>9} {'4-bit':>9}   (GB just for the weights)")
for b in (1, 7, 13, 70, 400):
    print(f"{b:>10}B {gb(b,2):9.1f} {gb(b,1):9.1f} {gb(b,0.5):9.1f}")

print()
# Cost of using a hosted model: tokens in and out. Prices below are made-up round numbers for illustration.
price_in, price_out = 3.00, 15.00          # dollars per million tokens
calls_per_day = 20000
tokens_in, tokens_out = 1800, 300           # typical RAG question: long context, short answer
daily = calls_per_day * (tokens_in * price_in + tokens_out * price_out) / 1e6
print(f"Illustrative cost: {calls_per_day} calls/day -> ${daily:,.2f} per day, ${daily*30:,.0f} per month")
print("Sending 3x fewer context tokens would save:", f"${calls_per_day*(tokens_in*2/3)*price_in/1e6*30:,.0f} per month")
EOF
python3 sizes.py
```

Takeaways: a 70B model at 16-bit needs about 140 GB for the weights alone, so it does not fit on one consumer GPU: people **quantise** (use fewer bits) and shard across GPUs. Also, the **context you send is usually the biggest part of the bill**, so retrieval that sends only the relevant paragraphs saves real money. (Prices here are illustrative; check your provider's current price list.)

## 6. Kinds of model you will hear about

| Kind | What it is | Typical use |
|---|---|---|
| **Base (pre-trained) model** | trained only to continue text | starting point for fine-tuning; research |
| **Instruction/chat model** | base model plus post-training (chapter 4) | assistants, agents |
| **Reasoning model** | trained to think through steps before answering | hard maths, coding, planning |
| **Embedding model** | outputs a vector for a piece of text | search and RAG (chapter 6) |
| **Multimodal model** | handles images, audio or video too | reading screenshots, documents, diagrams |
| **Small / on-device model** | a few billion parameters or fewer | privacy, low latency, low cost |

## 7. Why models make things up (it is not lying)

| Cause | Explanation | What helps |
|---|---|---|
| **No fact store** | the model stores statistics about text, not a database of facts | give it the facts in the prompt (RAG) |
| **Training objective** | it is rewarded for plausible continuations, so a fluent wrong answer scores well | instruct it to say "I do not know"; evaluate for it |
| **Knowledge cutoff** | it knows nothing after training | tools and retrieval for current data |
| **Rare facts** | few examples in training, so low confidence yet a fluent guess | verify with sources |
| **Long or confusing context** | relevant text gets lost in the middle | shorter, cleaner context |
| **Sampling** | a lower-probability token occasionally gets picked and the text then builds on it | lower temperature for facts |

The engineering response is never "hope it behaves": **ground** answers in retrieved sources, **verify** outputs (schemas, rules, a second check), and **measure** error rates on your own test set.

## Common misconceptions

- "The model looks things up." No: unless you give it a tool or retrieval step, it generates from learned statistics.
- "Higher temperature makes it smarter or more creative." It only makes it more random; creativity comes from the training.
- "The model remembers our previous chats." It only sees the text in the current context window, unless the application stores and re-sends it.
- "Perplexity tells me which model is better for my job." Only for similar text and tokenisers; use task-specific tests.
- "A bigger model is always better." Often yes in capability, but cost, speed and privacy may favour a smaller one that is tested for your task.

## Practice (answers below)

1. A model gives the true next token probability 0.25 on average (use loss = -log 0.25). What is the perplexity? 
2. At temperature 0.1 versus 2.0, which setting would you use for a tool call that must be valid JSON?
3. A 13B model in 8-bit: roughly how many GB for the weights?
4. Why does retrieving 3 relevant paragraphs usually cost less than pasting the whole manual?

:::note Answers
1. Perplexity = 1/0.25 = 4 (exp of -log 0.25 is 4): as uncertain as choosing among 4 equally likely tokens.
2. Temperature 0.1: lower randomness gives more consistent, valid structure.
3. About 13 GB (13 billion x 1 byte), plus memory for the context cache.
4. Token cost scales with the amount of text sent; fewer context tokens means a smaller bill and often better answers because less irrelevant text distracts the model.
:::

:::recap
- A model outputs scores; softmax turns them into probabilities; sampling (temperature, top-k, top-p) picks one token.
- Training minimises cross-entropy (-log of the probability of the true token); perplexity = exp(loss) is "effective number of choices".
- Memory is parameters times bytes; context tokens are usually the biggest cost.
- Hallucination comes from the objective, missing facts and sampling; fix it with grounding, verification and measurement.
:::

:::quiz
? What does softmax produce?
+ A probability for each token, all positive and adding to 1
- A single chosen word
- The loss value
- The embedding of a token
! Sampling then picks from this distribution.
? You lower the temperature from 1.0 to 0.2. What happens?
+ The distribution gets sharper, so the most likely tokens are chosen far more often
- The model becomes less accurate
- The model learns new facts
- The context window grows
! Temperature rescales the logits before softmax.
? A model has perplexity 4 on some text. What does that mean?
+ It is as unsure as if choosing among about 4 equally likely tokens at each step
- It is wrong 4% of the time
- It has 4 layers
- It was trained for 4 epochs
! Perplexity is exp of the average cross-entropy.
? Roughly how much memory do the weights of a 7B-parameter model need at 16-bit?
+ About 14 GB
- About 7 MB
- About 70 GB
- About 1 GB
! Parameters times 2 bytes.
:::
