---
track: aifield
title: Reasoning: chain of thought, self-consistency and tree of thoughts
short: Reasoning methods
sub: Three papers on getting better answers by letting the model think in steps, vote, or search, with small programs that show why each works.
---

:::goals
- explain chain-of-thought prompting and why it helps on multi-step problems
- show with a simulation when majority voting (self-consistency) helps and when it makes things worse
- describe tree of thoughts as search, and see why pruning saves work
- choose between these methods for a real task
:::

:::note Where this lesson comes from
The lab environment could not open arxiv.org (its network policy blocks the host), so this lesson **summarises the three papers from my own knowledge, not from their text**. Numbers are quoted from memory. Check them against the originals: [Chain-of-Thought Prompting](https://arxiv.org/abs/2201.11903), [Self-Consistency](https://arxiv.org/abs/2203.11171) and [Tree of Thoughts](https://arxiv.org/abs/2305.10601). The programs below are **real and run**, but they use stand-ins for the model, so they show the mechanism and not any model's performance.
:::

## 1. Chain of thought (Wei et al., 2022)

A language model produces one token at a time. If you ask for the answer **immediately**, it must "compute" the whole solution in a single forward pass for the first answer token. If you let it write **intermediate steps first**, each step becomes part of the context and the next step can build on it.

| Prompt style | What the model writes | Good for |
|---|---|---|
| Direct | the answer only | simple facts, classification |
| **Few-shot chain of thought** | worked examples with reasoning, then your question | arithmetic, logic, multi-step problems |
| **Zero-shot chain of thought** (Kojima et al.) | you add "Let's think step by step" | quick improvement with no examples |

The paper's key findings, as I remember them: the gains are large on multi-step arithmetic and symbolic problems, and they **appear mainly in large models** (small models write fluent but wrong steps). Modern models are often trained to reason before answering, so you may get this behaviour built in; the prompting idea still matters when you design **your own** step-by-step workflow.

:::warn Steps are not proof
The written reasoning is **text the model generated**, not a window into its computation. It can contain errors and still land on a right answer, or look convincing and be wrong. Always **verify the final answer** with a tool or a check when it matters.
:::

## 2. Self-consistency: sample many, vote

Sample the model several times (with some randomness), take the **final answers**, and pick the **most common** one. The idea: there are many wrong paths but they tend to disagree, while correct paths tend to **agree** on the answer.

Run a simulation. Each "sample" is right with probability `p`; when wrong, it picks one of several wrong answers at random:

```run
mkdir -p ~/lab/aifield && cd ~/lab/aifield
cat > vote.py <<'EOF'
import random, collections
random.seed(7)

def sample(correct, p, wrong_answers):
    return correct if random.random() < p else random.choice(wrong_answers)

def majority(votes):
    return collections.Counter(votes).most_common(1)[0][0]

def accuracy(p, n, wrong_answers, trials=4000, correct=42):
    hits = 0
    for _ in range(trials):
        votes = [sample(correct, p, wrong_answers) for _ in range(n)]
        hits += majority(votes) == correct
    return hits / trials

print("Scatter case: wrong answers are spread out (4 different wrong values)")
for n in (1, 3, 5, 11, 21):
    print(f"  p=0.50, {n:2d} samples -> majority is right {accuracy(0.50, n, [41, 43, 52, 84]):.0%} of the time")

print("Correlated case: the model usually makes the SAME mistake (one wrong value)")
for n in (1, 5, 21):
    print(f"  p=0.40, {n:2d} samples -> majority is right {accuracy(0.40, n, [41]):.0%} of the time")
EOF
python3 vote.py
```

Read the two cases:

- With **scattered** errors, even a model that is right only half the time becomes reliable with enough votes, because the wrong answers split the vote.
- With a **systematic** mistake (the same wrong answer most of the time), voting **amplifies the error**: the more you sample, the more certain you are of the wrong answer.

So self-consistency helps when mistakes are **random** and hurts when they are **systematic**. It also costs N times as much, so use it for the few decisions that matter.

## 3. Tree of thoughts (Yao et al., 2023)

Chain of thought follows **one** path and cannot go back. Some problems need **exploration**: try a step, judge whether it looks promising, and abandon dead ends. Tree of thoughts (ToT) turns reasoning into a **search** over "thoughts" (partial solutions):

1. **Generate** several candidate next thoughts from a state.
2. **Evaluate** each (the model judges "sure / maybe / impossible", or gives a score).
3. **Search** (breadth-first or depth-first), keeping promising states and **pruning** the rest, with backtracking.

The paper's showcase is the **Game of 24**: combine four numbers with `+ - * /` to make 24. I remember its GPT-4 result as about 4% success for chain of thought against about 74% for ToT with a breadth of 5. Here is the same search with a **stand-in evaluator** (an exact check; a real model's judgement would be approximate):

```run
cd ~/lab/aifield
cat > tot.py <<'EOF'
from fractions import Fraction
from itertools import combinations

def moves(nums):
    """Generate step: pick two numbers, combine them, return the new list and a description."""
    out = []
    for i, j in combinations(range(len(nums)), 2):
        a, b = nums[i], nums[j]
        rest = [nums[k] for k in range(len(nums)) if k not in (i, j)]
        cands = [(a + b, f"{a}+{b}"), (a * b, f"{a}*{b}"), (a - b, f"{a}-{b}"), (b - a, f"{b}-{a}")]
        if b != 0: cands.append((a / b, f"{a}/{b}"))
        if a != 0: cands.append((b / a, f"{b}/{a}"))
        out += [(rest + [v], d) for v, d in cands]
    return out

def can_reach_24(nums):
    """Stand-in for the model's 'sure / impossible' judgement (here exact; a real model is only approximate)."""
    if len(nums) == 1: return nums[0] == 24
    return any(can_reach_24(n) for n, _ in moves(nums))

def search(nums, prune, stats, path=()):
    stats["states visited"] += 1
    if len(nums) == 1:
        return path if nums[0] == 24 else None
    for n, d in moves(nums):
        if prune and not can_reach_24(n):      # evaluate, then prune dead branches
            continue
        found = search(n, prune, stats, path + (d,))
        if found: return found

start = [Fraction(x) for x in (4, 9, 10, 13)]
for prune in (False, True):
    stats = {"states visited": 0}
    answer = search(start, prune, stats)
    print(f"{'with pruning   ' if prune else 'no pruning      '} visited {stats['states visited']:5d} states; steps found: {answer}")
EOF
python3 tot.py
```

Both searches find the same valid sequence of steps for 4, 9, 10, 13: `4-10 = -6`, `9-13 = -4`, then `-6 * -4 = 24`. The difference is the **work**: pruning dead branches visits only a handful of states instead of about a thousand. In a real ToT system each "visited state" is a model call, so pruning is what keeps the cost sane. The price: a **bad evaluator** prunes good branches, and ToT uses many more model calls than a single chain of thought.

## 4. Choosing a method

| Situation | Use |
|---|---|
| The model can answer in one step | direct prompt |
| Multi-step reasoning, one path is enough | chain of thought |
| The final answer is checkable and errors are random | self-consistency (vote) |
| Needs exploration and backtracking (puzzles, planning, code search) | tree of thoughts or similar search, with a **real checker** as evaluator when you have one |
| Answers can be verified by running code or tests | skip heavy prompting: **generate, run the check, retry** (lesson 3) |

:::warn Common mistakes
- **Voting on a systematic error.** Measure first: if the model repeats the same wrong answer, more samples will not help.
- **Believing the reasoning text.** Verify the answer, not the story.
- **Adding search to a task a single call solves.** Every extra call costs money and latency; add complexity only when it demonstrably improves results.
- **Using the model as the only judge of its own branches** when an exact check exists. Prefer the exact check.
:::

:::recap
- Chain of thought: write the steps first. Helps multi-step problems, mostly in larger models, but the steps are not proof.
- Self-consistency: sample many, vote. Great against random errors, harmful against systematic ones.
- Tree of thoughts: generate, evaluate and prune thoughts as a search. Better on problems that need exploration, at a higher number of calls.
- Prefer real verifiers (tests, calculators) over model judgement wherever you have them.
:::

:::try Your turn
Change `p` in the second part of `vote.py` to `0.55` while keeping the single wrong answer. Does 21-sample voting still help? Then find the value of `p` at which voting stops helping in the correlated case, and explain why that threshold is where it is.
:::

:::quiz
? When does self-consistency voting make results worse?
+ When the model makes the same wrong answer most of the time
- When you use too few examples
- When the temperature is zero and answers differ
- When the answer is a number
! Voting amplifies whichever answer is most likely, right or wrong.
? What does tree of thoughts add to chain of thought?
+ Exploring several partial solutions, judging them, and pruning or backtracking
- A larger context window
- Automatic fine-tuning
- A guarantee of a correct answer
! It is a search over thoughts, which costs more model calls.
? Why is pruning important in tree-of-thoughts systems?
+ Each visited state is a model call, so cutting dead branches saves cost and time
- It makes the model smarter
- It removes the need for an evaluator
- It hides wrong answers
! The pruning demo visited far fewer states for the same result.
:::
