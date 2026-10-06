---
track: aideep
title: Deep dive 8: patterns for effective agents
short: Agent patterns
sub: Companion to chapter 8. The five workflow patterns implemented in small programs, and how to design tools the model can use well.
---

:::goals
- implement prompt chaining, routing, parallelisation, orchestrator-workers and evaluator-optimiser
- decide which pattern fits a problem
- design tool interfaces (the agent-computer interface) that reduce errors
- apply the "simplest thing that works" rule with measurements
:::

:::note Stand-in model
Each pattern below is real orchestration code. The language model calls are replaced by small stand-in functions so every program runs offline and deterministically. The point is the **structure**: what is code, what is a model call, and how results flow.
:::

## The principle: add complexity only when it earns its keep

Start with **one model call plus good context** (retrieval, examples). Add structure only when measurements show it helps, because each step adds latency, cost and places to fail. Order of increasing power and cost:

1. a single well-prompted call
2. a **workflow**: code chooses the steps (the five patterns below)
3. an **agent**: the model chooses the steps in a loop (previous lesson)

## Pattern 1: prompt chaining

Break a task into a **fixed sequence** of calls where each output feeds the next, with **gates** (checks) between them. Use when the task decomposes cleanly and each step is easier than the whole.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > chain.py <<'EOF'
# Task: turn a raw log into a customer-ready incident summary
def step_extract(log):          # model call #1 (stand-in): pull out the facts
    return {"errors": [l for l in log if "ERROR" in l], "host": "SQL01"}
def gate(facts):                # programmatic check between steps
    return len(facts["errors"]) > 0
def step_draft(facts):          # model call #2 (stand-in): write from the facts only
    return f"{len(facts['errors'])} errors were recorded involving {facts['host']}."
def step_polish(text):          # model call #3 (stand-in): tone and format
    return "Incident summary: " + text + " Our team is investigating."

log = ["09:10 INFO started", "09:12 ERROR timeout", "09:12 ERROR aborted"]
facts = step_extract(log)
print("1 extract :", facts)
if not gate(facts):
    print("gate failed: nothing to report; chain stops here (no wasted calls)")
else:
    draft = step_draft(facts); print("2 draft   :", draft)
    print("3 polish  :", step_polish(draft))
print()
print("empty log:", "chain stops at the gate" if not gate(step_extract(["09:10 INFO started"])) else "continues")
EOF
python3 chain.py
```

## Pattern 2: routing

Classify the input, then send it to a **specialised** handler (different prompt, tool set or even a cheaper or stronger model). Use for distinct categories that need different treatment.

```run
cd ~/lab/ai
cat > route.py <<'EOF'
def classify(msg):             # stand-in for a small, cheap model call
    m = msg.lower()
    if any(w in m for w in ("refund", "invoice", "price")): return "billing"
    if any(w in m for w in ("error", "crash", "fails", "timeout")): return "technical"
    return "general"

HANDLERS = {
    "billing":   lambda m: "-> billing agent (has: invoice lookup tool, strict policy prompt)",
    "technical": lambda m: "-> technical agent (has: log reader, runbook search; stronger model)",
    "general":   lambda m: "-> FAQ answerer (cheap model, no tools)",
}
for msg in ["Why was I charged twice? I want a refund", "Indexing fails with a timeout on SQL01", "What are your opening hours?"]:
    kind = classify(msg)
    print(f"{msg!r:48} classified as {kind:9} {HANDLERS[kind](msg)}")
EOF
python3 route.py
```

Routing also saves money: easy requests go to small models. Test the **classifier** itself (a confusion matrix over labelled examples): its mistakes send people to the wrong handler.

## Pattern 3: parallelisation

Two flavours. **Sectioning**: run **independent subtasks** at the same time. **Voting**: run the **same task several times** and combine (majority vote, or any-flag for safety checks). Use when speed matters or you want higher confidence.

```run
cd ~/lab/ai
cat > parallel.py <<'EOF'
import concurrent.futures as cf, time, collections

def check_log(name):               # an independent subtask (stand-in for a model call that takes time)
    time.sleep(0.3)
    return f"{name}: ok"

names = ["indexing", "storage", "admin", "search", "journaling"]
t0 = time.time()
with cf.ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(check_log, names))
parallel_time = time.time() - t0
print("sectioning results:", results)
print(f"5 subtasks of 0.3 s each took {parallel_time:.1f} s in parallel (about 1.5 s in sequence)")

# voting: three independent attempts at a classification, take the majority
votes = ["high", "high", "low"]
winner, count = collections.Counter(votes).most_common(1)[0]
print("voting:", votes, "->", winner, f"({count}/3 agree)")
EOF
python3 parallel.py
```

Voting costs N times as much, so use it for the **few decisions that matter** (a safety check, a risky classification).

## Pattern 4: orchestrator-workers

A central model **decides the subtasks at run time**, dispatches **workers** (each with a narrow job), then **synthesises** the results. Use when the number and kind of subtasks cannot be known in advance (multi-file code changes, research across sources).

```run
cd ~/lab/ai
cat > orchestrate.py <<'EOF'
def orchestrator_plan(goal):
    # stand-in for a model that decomposes the goal; the subtasks differ for each goal
    if "audit" in goal:
        return [("worker_logs", "scan the last 24h of logs for errors"),
                ("worker_config", "compare config files with the baseline"),
                ("worker_certs", "list certificates expiring within 30 days")]
    return [("worker_logs", "scan logs")]

WORKERS = {
    "worker_logs":   lambda t: "3 errors, all SQL timeouts",
    "worker_config": lambda t: "evault.conf differs: max_index_threads 8 vs baseline 4",
    "worker_certs":  lambda t: "1 certificate expires in 12 days",
}
def synthesise(results):
    return "Audit findings:\n" + "\n".join(f"  - {name}: {res}" for name, res in results)

goal = "audit the EV01 server"
plan = orchestrator_plan(goal)
print("plan:", [name for name, _ in plan])
results = [(name, WORKERS[name](task)) for name, task in plan]
print(synthesise(results))
EOF
python3 orchestrate.py
```

Because workers see **only their own task**, their contexts stay small and focused: this is the main benefit, and the main cost is that the orchestrator's plan must be good, so evaluate it.

## Pattern 5: evaluator-optimiser

One call **generates**, another **evaluates against clear criteria** and gives feedback; loop until the criteria are met or a limit is reached. Use when quality criteria are explicit and iteration measurably improves results (translation, code that must pass tests, a report with required sections).

```run
cd ~/lab/ai
cat > refine.py <<'EOF'
REQUIRED = ["summary", "impact", "next step"]

def generate(task, feedback=None, attempt=1):       # stand-in generator: improves when given feedback
    parts = ["Summary: SQL01 unreachable."]
    if attempt >= 2: parts.append("Impact: indexing stopped for 2 hours.")
    if attempt >= 3: parts.append("Next step: check the SQL service and network path.")
    return " ".join(parts)

def evaluate(text):                                  # criteria checked by code (could also be a model judge)
    missing = [r for r in REQUIRED if r not in text.lower()]
    return missing

text, feedback = None, None
for attempt in range(1, 6):
    text = generate("write the incident note", feedback, attempt)
    missing = evaluate(text)
    print(f"attempt {attempt}: missing sections = {missing}")
    if not missing:
        print("accepted:", text)
        break
    feedback = f"Add the missing sections: {missing}"
else:
    print("gave up after 5 attempts: send to a human")
EOF
python3 refine.py
```

Always cap the iterations and decide what happens at the cap.

## Agent-computer interface (ACI): design tools for the model

You spend effort on human interfaces; tools deserve the same. Principles:

| Principle | Example |
|---|---|
| **Make the right usage obvious** | a tool named `search_ev_docs(query)` beats `run(cmd)` |
| **Describe like documentation for a new colleague** | purpose, when to use, when not to, an example call, edge cases |
| **Use names and formats the model has seen** | absolute paths and plain text are easier than custom syntax |
| **Poka-yoke (mistake-proof)** | require absolute paths, validate enums, reject out-of-range values with a helpful message |
| **Return compact, relevant output** | 20 matching lines, not 20,000; say "showing 20 of 340, refine your query" |
| **Make errors instructive** | "log 'foo' not found; choose from: indexing, storage" lets the model recover |
| **Test with real transcripts** | look at how the model misuses the tool and fix the interface, not only the prompt |

## Choosing between patterns

| Problem shape | Pattern |
|---|---|
| steps are known and sequential | chaining |
| inputs fall into categories needing different handling | routing |
| independent parts, or a decision needs confidence | parallelisation |
| subtasks unknown until you see the goal | orchestrator-workers |
| a clear quality bar and iteration helps | evaluator-optimiser |
| open-ended with unknown path and tool use | an agent loop with limits |

Frameworks (LangGraph, the OpenAI/Anthropic agent SDKs, and others) help with plumbing, but they add layers that hide prompts and responses; **understand the raw calls first** and adopt a framework when it removes real work.

## Common misconceptions

- "Multi-agent systems are more intelligent." They are more parts; sometimes useful, often just slower and costlier.
- "A critic model always improves output." Only if the criteria are clear and the critic is reliable; otherwise it adds noise.
- "More tools make a more capable agent." Too many tools confuse selection; give the fewest that cover the job.

## Practice (answers below)

1. A support bot gets billing, technical and general questions. Which pattern, and what should you test first?
2. When is voting worth three times the cost?
3. Why does orchestrator-workers keep contexts small?
4. Name two properties of a good error message returned by a tool.

:::note Answers
1. Routing; test the classifier (accuracy and confusion between categories) before the handlers.
2. For rare, high-stakes decisions where one wrong answer is costly, such as safety checks.
3. Each worker receives only its own subtask and data, not the whole conversation.
4. It says what was wrong and what valid options or formats exist, so the model can fix the call.
:::

:::recap
- Prefer the simplest design: single call, then workflows, then agents.
- Chaining, routing, parallelisation, orchestrator-workers and evaluator-optimiser cover most structures.
- Tool design (the agent-computer interface) strongly affects reliability: clear names, docs, validation, compact outputs, instructive errors.
- Measure each added piece against a baseline.
:::

:::quiz
? Which pattern suits inputs of different categories needing different handling?
+ Routing
- Voting
- Chaining
- Evaluator-optimiser
! A classifier sends each input to a specialised handler.
? What is a gate in prompt chaining?
+ A programmatic check between steps that can stop or redirect the chain
- A tool permission
- A token limit
- A kind of model
! It prevents wasted calls and compounding errors.
? What is the main risk of too many tools?
+ The model picks the wrong one or confuses similar ones
- They use too much disk
- Tools cannot be validated
- The loop never starts
! Prefer few, distinct tools.
? Why cap iterations in evaluator-optimiser?
+ To avoid endless loops and cost; decide a fallback such as human review
- Because models stop improving after two tries
- To reduce temperature
- It is a syntax rule
! Limits belong in code.
:::
