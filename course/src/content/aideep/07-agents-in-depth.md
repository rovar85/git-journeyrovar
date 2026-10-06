---
track: aideep
title: Deep dive 7: how agents work, in depth
short: Agents in depth
sub: Companion to chapter 7. The loop, state, planning, memory, stopping and failure handling, built and run with a scripted stand-in model.
---

:::goals
- implement the agent loop and trace what happens at each step
- keep state, plan and memory explicitly rather than hoping the model remembers
- add stopping rules, budgets and error handling
- recognise the failure modes of agents and their fixes
:::

:::note The stand-in model
As in the previous lessons, the lab has no model API, so a **scripted stand-in** plays the model: it returns the next action as a structured decision. Everything else (the loop, tools, state, budgets, logging) is the real code you would write around a real model. The "reasoning" is scripted, so do not read the outputs as evidence about model intelligence.
:::

## 1. What makes something an agent

A **workflow** follows steps **you** wrote. An **agent** lets the **model decide the next step** at run time, in a loop, using tools, until the goal is met. The loop:

```
observe  ->  think (model decides)  ->  act (tool call)  ->  observe result  -> ...  -> finish
```

Everything an agent knows must be in the **context** you send each turn: the goal, the instructions, the history of actions and results. The model has **no memory of its own** between calls; the "agent" is mostly **your program** that assembles that context, runs the tools, and enforces the rules.

## 2. The loop, in code

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > agent.py <<'EOF'
import json

# ---- tools (the only things the agent can do) -------------------------------------------
LOGS = {
    "indexing": ["09:12:18 ERROR SQL connection timeout (SQL01)", "09:12:35 ERROR Indexing task aborted"],
    "storage":  ["09:00:00 INFO Storage service started"],
}
def read_log(name, lines=10):
    if name not in LOGS: return {"error": f"unknown log {name!r}; choose from {sorted(LOGS)}"}
    return {"lines": LOGS[name][-lines:]}
def check_host(host):
    return {"host": host, "reachable": host != "SQL01"}          # pretend SQL01 is down
TOOLS = {"read_log": read_log, "check_host": check_host}

# ---- stand-in for the model: decides the next action from the history ------------------
def fake_model(goal, history):
    seen = {h["action"]["tool"] for h in history if "tool" in h["action"]}
    if "read_log" not in seen:
        return {"thought": "Start with the indexing log.", "action": {"tool": "read_log", "args": {"name": "indexing"}}}
    if "check_host" not in seen:
        return {"thought": "The log blames SQL01; test whether it is reachable.", "action": {"tool": "check_host", "args": {"host": "SQL01"}}}
    return {"thought": "I have enough evidence.", "action": {"finish": "Indexing is failing because SQL01 is unreachable. Check the SQL server and the network path."}}

# ---- the agent loop: this is the part you write ----------------------------------------
def run(goal, max_steps=6):
    history = []
    for step in range(1, max_steps + 1):
        decision = fake_model(goal, history)
        act = decision["action"]
        print(f"step {step}: thought = {decision['thought']}")
        if "finish" in act:
            print(f"         FINISH -> {act['finish']}")
            return act["finish"], history
        tool, args = act["tool"], act["args"]
        if tool not in TOOLS:
            result = {"error": f"no such tool {tool!r}"}
        else:
            try:
                result = TOOLS[tool](**args)
            except TypeError as e:
                result = {"error": f"bad arguments: {e}"}
        print(f"         ACT    -> {tool}({json.dumps(args)})")
        print(f"         RESULT -> {json.dumps(result)}")
        history.append({"action": act, "result": result})
    return "STOPPED: step limit reached without an answer", history

answer, hist = run("Why has indexing stopped?")
print()
print("steps used:", len(hist) + 1, "| answer:", answer)
EOF
python3 agent.py
```

Everything important is visible: the model **proposes** an action; the program **checks and executes** it; the result is **appended to the history**; the loop ends when the model says finish **or the step limit stops it**. Notice the unknown tool and bad-argument branches: errors are returned to the model as text, not raised, so it can correct itself.

## 3. Explicit state, plan and memory

Relying on a long chat history alone makes agents drift. Good agents keep **explicit state** that your code owns:

| Kind | What it holds | Where it lives |
|---|---|---|
| **Working memory** | the current plan, the facts found so far, what is left to do | a small structured object re-sent every turn |
| **Episodic history** | the sequence of actions and results | the message list, **trimmed or summarised** when long |
| **Long-term memory** | knowledge from earlier sessions (user preferences, past incidents) | a database or vector store, **retrieved** when relevant |
| **Scratchpad / notes** | intermediate findings the agent writes for itself | a file or field, so important facts survive trimming |

```run
cd ~/lab/ai
cat > state.py <<'EOF'
import json

class AgentState:
    def __init__(self, goal):
        self.goal = goal
        self.plan = []            # list of {"step": str, "done": bool}
        self.facts = []           # confirmed findings
        self.budget = {"steps": 8, "tool_calls": 6}
    def set_plan(self, steps):
        self.plan = [{"step": s, "done": False} for s in steps]
    def complete(self, i, fact=None):
        self.plan[i]["done"] = True
        if fact: self.facts.append(fact)
    def summary(self):
        # this compact summary (not the whole history) is what gets re-sent to the model each turn
        todo = [p["step"] for p in self.plan if not p["done"]]
        return json.dumps({"goal": self.goal, "facts": self.facts, "todo": todo, "budget": self.budget})

s = AgentState("Why has indexing stopped?")
s.set_plan(["read the indexing log", "check SQL01 reachability", "recommend a fix"])
s.complete(0, "log shows SQL connection timeouts at 09:12")
print(s.summary())
s.complete(1, "SQL01 does not answer ping or port 1433")
print(s.summary())
print()
print("context size of the compact summary:", len(s.summary()), "characters")
EOF
python3 state.py
```

Keeping a compact state object means the model always sees the **goal, what is known and what remains**, even after the long history is dropped to save tokens. This is the most reliable way to make long tasks coherent.

## 4. Planning and reflection

- **Plan first** for complex tasks: ask for a short numbered plan, then execute step by step, **re-planning** when a result changes things.
- **Reflect** after actions: "did that result answer the question, or do I need something else?" This catches wrong turns early.
- **Verify before finishing**: a final check (does the answer cite evidence from the results? Do numbers add up?) is cheap and catches many errors.
- **Reasoning models** do part of this internally, but the same structure helps, and you still need external limits.

## 5. Stopping, budgets and safety rails

An agent without limits is a bug waiting to bill you. Always enforce, **in code**:

| Rail | Why |
|---|---|
| **Maximum steps** | stops infinite loops |
| **Maximum tool calls and tokens/cost** | caps spending |
| **Timeout per tool and per task** | prevents hangs |
| **Repetition detector** | the same call with the same arguments three times is a loop |
| **Allow-list of tools and arguments** | limits what a confused model can do |
| **Approval for risky actions** | humans decide irreversible steps (chapter 12) |
| **Full logging** | every thought, call and result, for debugging and audit |

```run
cd ~/lab/ai
cat > rails.py <<'EOF'
import collections

def run_with_rails(decisions, max_steps=6, max_repeats=2):
    seen = collections.Counter()
    log = []
    for step, act in enumerate(decisions, start=1):
        if step > max_steps:
            return "STOPPED: step budget exhausted", log
        key = (act["tool"], tuple(sorted(act["args"].items())))
        seen[key] += 1
        log.append(f"step {step}: {act['tool']}{act['args']}")
        if seen[key] > max_repeats:
            return f"STOPPED: loop detected ({act['tool']} repeated {seen[key]} times)", log
    return "finished", log

# a confused model keeps asking for the same log
stuck = [{"tool": "read_log", "args": {"name": "indexing"}}] * 10
status, log = run_with_rails(stuck)
print("\n".join(log))
print("result:", status)
EOF
python3 rails.py
```

## 6. How agents fail (and what to do)

| Failure | Looks like | Fix |
|---|---|---|
| **Wrong tool or arguments** | calls with invalid or invented parameters | clearer tool descriptions, schema validation, error messages that explain |
| **Looping** | repeats the same action | repetition detector, step budget, reflection prompt |
| **Premature finish** | declares success without evidence | require citations of tool results, verification step |
| **Drift** | forgets the goal in long histories | explicit state summary, trimming |
| **Over-reach** | takes actions beyond the task | narrow tools, permissions, approvals |
| **Compounding errors** | one early mistake poisons later steps | verify intermediate results, checkpoints, allow backtracking |
| **Cost blow-up** | many steps, large contexts | budgets, smaller models for easy steps, caching |
| **Prompt injection** | obeys instructions found in data | treat tool results as data, least privilege (chapter 12) |

A rough reliability picture: if each of 10 steps succeeds 95% of the time, the whole task succeeds only about **60%** of the time (0.95^10). Long chains are fragile, which is why simpler designs (chapter 8) and strong evaluation (chapter 9) matter.

```run
cd ~/lab/ai
python3 -c "
for p in (0.99, 0.95, 0.90):
    print(f'per-step success {p:.2f}:', ', '.join(f'{n} steps -> {p**n*100:4.0f}%' for n in (3, 5, 10, 20)))
"
```

## 7. Chatbot, workflow or agent: choosing

| If the task... | Use |
|---|---|
| is one question and answer | a plain prompt (maybe with RAG) |
| has fixed, known steps | a **workflow** (code orchestrates, model fills in steps) |
| needs the model to choose steps and tools, with unpredictable paths | an **agent**, with budgets and approvals |
| is high-stakes and irreversible | an agent that **recommends** and a human who **acts** |

Start with the simplest design that could work and add autonomy only when it measurably helps.

## Common misconceptions

- "The agent remembers what it did." Only what your code puts back into the context.
- "The model runs the tools." Your code does; the model requests.
- "A smarter model removes the need for rails." Better models still loop, misread and get manipulated; budgets and approvals are cheap insurance.
- "Agents are always better than workflows." They add cost, latency and unpredictability; use them when flexibility is worth it.

## Practice (answers below)

1. Name the four things the loop does on each turn.
2. Why keep a compact state summary instead of the whole history?
3. A task needs 12 steps, each 97% reliable. Roughly what overall success rate?
4. Where do you put a rule like "never delete without approval": in the prompt or in code?

:::note Answers
1. Model decides, program validates and runs the tool, result is added to the history, check stop conditions.
2. It keeps goal, findings and remaining work visible in fewer tokens, so long tasks stay coherent and cheaper.
3. 0.97^12 is about 0.69, around 69%.
4. In code: a prompt rule can be argued away; code enforcement cannot.
:::

:::recap
- An agent is a loop your program runs: model decides, code validates and acts, results go back into context.
- Keep explicit state (plan, facts, budget); trim or summarise history; store long-term memory outside the context.
- Always enforce limits in code: steps, calls, cost, time, repetition, allow-lists, approvals, logs.
- Reliability compounds across steps; prefer the simplest design that works and measure it.
:::

:::quiz
? Who actually runs a tool in an agent?
+ The surrounding program, after validating the model's request
- The model itself
- The user
- The tokenizer
! This is where safety checks live.
? What is the purpose of a repetition detector?
+ Stop loops where the model repeats the same call
- Speed up tool calls
- Reduce the vocabulary
- Select the tools
! Combine with a step budget.
? 10 steps at 95% each give about:
+ 60% overall success
- 95%
- 100%
- 10%
! Errors compound multiplicatively.
? Where should irreversible actions be approved?
+ By a human, enforced in code outside the model
- Only in the prompt
- By the model asking itself
- They need no approval
! The approval gate is part of the program.
:::
