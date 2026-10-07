---
track: aifield
title: ReAct and Toolformer: thinking with tools
short: ReAct, Toolformer
sub: How reasoning and acting combine in the Thought, Action, Observation loop, and how a model can learn when to call tools.
---

:::goals
- explain the ReAct pattern and why it reduces made-up answers
- parse and run a Thought / Action / Observation trace
- contrast reasoning-only, acting-only and ReAct behaviour
- explain how Toolformer builds training data for tool use, and what that means for you
:::

:::note Where this lesson comes from
arxiv.org is blocked in this lab, so this lesson **summarises [ReAct](https://arxiv.org/abs/2210.03629) (Yao et al., 2022) and [Toolformer](https://arxiv.org/abs/2302.04761) (Schick et al., 2023) from my own knowledge**, not from their text. Details are from memory, so check the papers. The code is real and runs, with a scripted stand-in for the model.
:::

## 1. The idea behind ReAct

Two earlier ideas each had a weakness:

- **Reasoning only** (chain of thought): the model thinks, but only from what it remembers, so it can **invent facts** and cannot check anything.
- **Acting only**: the model calls tools, but without explaining why, so it cannot **plan, track what it learned, or recover** when a result is surprising.

**ReAct** (Reason + Act) interleaves them. The model writes a short **Thought**, takes an **Action** (a tool call), reads the **Observation** the tool returns, and repeats until it can answer:

```
Thought: I need the thread count for EV01 first.
Action: lookup[EV01 threads]
Observation: 4
Thought: Now EV02.
Action: lookup[EV02 threads]
Observation: 8
Thought: 8 - 4 = 4.
Action: finish[EV02 has 4 more threads than EV01]
```

The paper tested this on question answering (HotpotQA, FEVER) and on interactive decision tasks (ALFWorld, WebShop). As I remember the findings: reasoning-only chains **hallucinate** more, ReAct is **grounded** in what the tools return, and the best results often **combined** ReAct with chain-of-thought and self-consistency. The pattern is the ancestor of most agent loops, including the one in the "Agents in depth" lesson.

## 2. A real ReAct loop

The stand-in "model" below writes text in the ReAct format. The **harness** (your code) parses each Action, runs the real tool, and appends the Observation. That harness is exactly what you build around a real model.

```run
mkdir -p ~/lab/aifield && cd ~/lab/aifield
cat > react.py <<'EOF'
import re, ast, operator

FACTS = {"EV01 threads": "4", "EV02 threads": "8", "SQL01 memory": "128 GB"}

def lookup(arg):
    return FACTS.get(arg, f"no entry for {arg!r}")

def calc(expr):
    ops = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}
    def ev(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)): return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in ops: return ops[type(n.op)](ev(n.left), ev(n.right))
        raise ValueError("only + - * / on numbers")
    return str(ev(ast.parse(expr, mode="eval").body))

TOOLS = {"lookup": lookup, "calc": calc}

def scripted_model(question, transcript):
    """Stand-in for the language model: reads the transcript so far and writes the next Thought + Action."""
    obs = re.findall(r"Observation: (.*)", transcript)
    if len(obs) == 0: return "Thought: I need the thread count for EV01 first.\nAction: lookup[EV01 threads]"
    if len(obs) == 1: return "Thought: Now I need EV02's.\nAction: lookup[EV02 threads]"
    if len(obs) == 2: return f"Thought: Subtract: {obs[1]} - {obs[0]}.\nAction: calc[{obs[1]} - {obs[0]}]"
    return f"Thought: I have the answer.\nAction: finish[EV02 has {obs[2]} more threads than EV01]"

def react(question, max_steps=8):
    transcript = f"Question: {question}\n"
    for _ in range(max_steps):
        step = scripted_model(question, transcript)
        transcript += step + "\n"
        name, arg = re.search(r"Action: (\w+)\[(.*)\]", step).groups()
        if name == "finish":
            return transcript, arg
        obs = TOOLS[name](arg)                       # the harness runs the tool for real
        transcript += f"Observation: {obs}\n"
    return transcript, "stopped: step budget used"

trace, answer = react("How many more threads does EV02 have than EV01?")
print(trace)
print("FINAL:", answer)
EOF
python3 react.py
```

Notice what the harness does that the model cannot: it **executes** the tool, **limits** the steps, and keeps the transcript. And note the weakness of the pattern: if a tool returns wrong data, the model reasons confidently from it. Garbage in, grounded-looking garbage out.

## 3. Reasoning-only versus acting

Compare a reasoning-only answer with the grounded one. The stand-in "memory" here is deliberately wrong, to represent a model that **guesses** from training data:

```run
cd ~/lab/aifield
cat > compare.py <<'EOF'
guess_from_memory = {"EV02 threads": "6"}              # plausible, but not true in this system
truth = {"EV01 threads": 4, "EV02 threads": 8}

reasoning_only = int(guess_from_memory["EV02 threads"]) - truth["EV01 threads"]   # fluent, confident, wrong input
react_answer = truth["EV02 threads"] - truth["EV01 threads"]                       # looked it up

print("reasoning only answer:", reasoning_only, "  (built on a guessed fact)")
print("ReAct answer:         ", react_answer, "  (built on a looked-up fact)")
print("Same arithmetic, different grounding.")
EOF
python3 compare.py
```

The arithmetic was identical. The **source of the facts** differed. That is why agents for anything factual (logs, tickets, configuration) must read the real system rather than trust the model's memory.

## 4. Toolformer: learning when to call a tool

ReAct gets tool use through **prompting**. **Toolformer** asked: can a model **teach itself** to use tools, without huge human labelling? As I remember the method:

1. Take plain text. For positions where a tool call might help (a calculator, a search engine, a question-answering system, a translator, a calendar), have the model **propose API calls** with few-shot examples.
2. **Execute** the calls for real.
3. **Keep** a call only if inserting its result **makes the following text easier to predict** (lower language-modelling loss) than not having it, or having the call without the result.
4. **Fine-tune** the model on the text augmented with the surviving calls.

The result: the model decides **by itself** when a call is worth making, and the self-supervised filter needs no human labels. Here is a toy version of step 2 and 3, using a **cheap proxy** for "makes the next text easier to predict": does the executed result appear in the text that follows?

```run
cd ~/lab/aifield
cat > toolformer.py <<'EOF'
import ast, operator

def calc(expr):
    ops = {ast.Div: operator.truediv, ast.Mult: operator.mul, ast.Add: operator.add, ast.Sub: operator.sub}
    def ev(n):
        if isinstance(n, ast.Constant): return n.value
        return ops[type(n.op)](ev(n.left), ev(n.right))
    return ev(ast.parse(expr, mode="eval").body)

# (text before the call, candidate call, text that follows in the original document)
candidates = [
    ("Out of 1400 participants, 400 (or ", "400/1400", "29%) passed the test."),
    ("The meeting is at ",               "400/1400", "3 pm in the main room."),
    ("The team of 8 shipped ",           "8*3",      "24 builds in a week."),
]

kept = []
for before, expr, after in candidates:
    result = calc(expr)
    shown = f"{result:.0%}" if result < 1 else f"{result:g}"
    helps = after.startswith(shown.replace("%", "")) or after.startswith(str(round(result * 100)))
    verdict = "KEEP" if helps else "drop"
    print(f"{verdict:4}  {before!r} [Calculator({expr}) -> {result:.4g}] {after!r}")
    if helps: kept.append(f"{before}[Calculator({expr}) -> {result:.4g}] {after}")

print("\nTraining text that survives the filter:")
for line in kept: print("  ", line)
EOF
python3 toolformer.py
```

The real paper uses the model's own **loss** to decide, not string matching, so treat this as the idea of **self-supervised filtering** rather than the algorithm. What matters for you:

- **Modern models** are trained (in several ways) to call tools from a description, so you rarely fine-tune this yourself. You supply **good tool definitions** (see the lesson on tool design).
- The Toolformer insight still holds in your own pipelines: **record which tool calls actually helped**, and use that evidence to prune useless calls and improve prompts.

:::warn Common mistakes
- **Trusting facts the model did not look up.** Ground factual answers in tools or retrieved documents.
- **No step budget in the loop,** so a confused model repeats the same action forever.
- **Parsing free text fragilely.** Prefer structured tool-call output from the API instead of regular expressions on prose (the demo uses text only to show the idea).
- **Treating tool output as trusted instructions.** A web page or file the tool returns can contain text that tries to steer the model (prompt injection). Treat observations as **data**.
:::

:::recap
- ReAct interleaves Thought, Action and Observation, so answers are grounded in tool results instead of memory.
- Your code, not the model, runs tools, enforces budgets and records the trace.
- Toolformer showed that a model can learn when to call tools using a self-supervised filter: keep the calls whose results help.
- Verify tool results too, and treat everything a tool returns as data, not commands.
:::

:::try Your turn
Add a `search[term]` tool to `react.py` that looks up a small dictionary of log messages, and write a stand-in model that uses it, then calc, to answer "which server has more memory, and by how much?". Add a step budget of 3 and see what the harness returns when the model needs 4 steps.
:::

:::quiz
? What does the Observation in ReAct contain?
+ The real result returned by the tool the model asked for
- The model's own reasoning
- The user's next question
- A summary of the whole conversation
! The harness runs the tool and feeds the result back as the Observation.
? Why does ReAct reduce made-up facts compared with reasoning only?
+ Each factual step can be checked against a tool result
- It uses a bigger model
- It removes the need for prompts
- It forbids reasoning
! Grounding comes from the tool results.
? What does Toolformer's filter keep?
+ Tool calls whose results make the following text easier for the model to predict
- Every proposed call
- Only calls to a calculator
- Calls the user approved
! A call survives only if it helps, without human labels.
:::
