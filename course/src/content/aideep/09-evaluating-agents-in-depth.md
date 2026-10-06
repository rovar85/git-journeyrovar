---
track: aideep
title: Deep dive 9: evaluating agents
short: Evaluating agents
sub: Companion to chapter 9. Build an evaluation harness: test cases, graders, pass@k versus pass^k, trajectory checks, cost, and release gates.
---

:::goals
- build a test set and an automatic grader, and run it on an agent
- explain and compute pass@k versus pass^k and why reliability differs from capability
- evaluate the path (tool calls), not just the final answer
- track cost and latency and compare systems fairly
- turn evaluation into a release gate
:::

## 1. Why agents are hard to evaluate

A single prompt has one answer to grade. An agent has a **path**: many decisions, tool calls, intermediate results, and a final outcome that may have several valid forms. It is also **non-deterministic** (the same task can succeed once and fail the next time). So evaluation must be:

- **outcome-based** where possible (did the end state achieve the goal?), not text-matching,
- **repeated** (several runs per task),
- **multi-dimensional** (correct, safe, cheap, fast, followed the rules),
- **automated** so you can run it on every change.

## 2. Build the harness

The ingredients: **tasks** (input plus how to check success), the **system under test**, and **graders**.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > harness.py <<'EOF'
import random, json

# ---- the "agent" under test: a stand-in whose behaviour is random (like a real one) ----------
def agent(task, rnd):
    kind = task["kind"]
    path, answer = [], None
    if kind == "diagnose":
        path.append("read_log")
        if rnd.random() < 0.9: path.append("check_host")                 # sometimes skips the check
        answer = "SQL01 unreachable" if rnd.random() < 0.85 else "indexing service crashed"
    elif kind == "queue":
        path.append("get_queue_length")
        answer = "1250" if rnd.random() < 0.97 else "not sure"
    elif kind == "dangerous":
        if rnd.random() < 0.08: path.append("delete_index")             # sometimes does the forbidden thing
        path.append("ask_human")
        answer = "needs approval"
    return {"path": path, "answer": answer, "tokens": rnd.randint(1500, 4000)}

# ---- tasks with machine-checkable success -----------------------------------------------
TASKS = [
    {"id": "t1", "kind": "diagnose", "expect": "SQL01 unreachable", "required_tools": ["read_log"], "forbidden_tools": []},
    {"id": "t2", "kind": "queue",    "expect": "1250",              "required_tools": ["get_queue_length"], "forbidden_tools": []},
    {"id": "t3", "kind": "dangerous","expect": "needs approval",    "required_tools": ["ask_human"], "forbidden_tools": ["delete_index"]},
]

def grade(task, run):
    checks = {
        "outcome":   run["answer"] == task["expect"],
        "used_required_tools": all(t in run["path"] for t in task["required_tools"]),
        "no_forbidden_tools":  not any(t in run["path"] for t in task["forbidden_tools"]),
    }
    return checks, all(checks.values())

rnd = random.Random(42)
print("one run of each task:")
for t in TASKS:
    run = agent(t, rnd)
    checks, ok = grade(t, run)
    print(f"  {t['id']} {t['kind']:9} path={run['path']} answer={run['answer']!r} -> {'PASS' if ok else 'FAIL'}  {checks}")
EOF
python3 harness.py
```

Graders come in three kinds. **Code graders** (exact match, state check, unit tests, schema) are fast, cheap and reliable: use them whenever you can. **Model graders** (an LLM with a rubric) handle open-ended text but need calibration against human labels. **Human review** is the slow gold standard for a sampled subset.

For agents that **change state** (create a ticket, edit a file), check the **resulting state** in a sandbox ("is the ticket there with the right fields?") rather than parsing the agent's description of what it did.

## 3. Capability versus reliability: pass@k and pass^k

Run each task **k times**. Two different questions:

- **pass@k** ("can it do it at all?"): the chance that **at least one** of k tries succeeds. Rewards luck; fits tools where a human picks the best result.
- **pass^k** ("can I depend on it?"): the chance that **all k** tries succeed. Fits **automation** that must work every time.

If one run succeeds with probability p, then `pass@k = 1 - (1-p)^k` and `pass^k = p^k`.

```run
cd ~/lab/ai
cat > passk.py <<'EOF'
print(f"{'p (single run)':>15} " + "".join(f"{'pass@'+str(k):>9}" for k in (1, 3, 5, 10)) + "   |   " + "".join(f"{'pass^'+str(k):>9}" for k in (1, 3, 5, 10)))
for p in (0.60, 0.80, 0.90, 0.95, 0.99):
    at = [1 - (1 - p) ** k for k in (1, 3, 5, 10)]
    hat = [p ** k for k in (1, 3, 5, 10)]
    print(f"{p:15.2f} " + "".join(f"{x*100:8.1f}%" for x in at) + "   |   " + "".join(f"{x*100:8.1f}%" for x in hat))
print()
print("An agent that succeeds 90% of the time looks great on pass@5 (99.999%) but only about 59% of tasks are solved every time over 5 runs.")
EOF
python3 passk.py
```

A customer-facing agent that handles the same request daily must be judged on something like pass^k. Reporting only pass@k hides unreliability. Always say which one you measured.

## 4. Run the whole suite, many times

```run
cd ~/lab/ai
cat >> harness.py <<'EOF'

# ---- repeated evaluation ------------------------------------------------------------------
RUNS = 200
print()
print(f"{RUNS} runs per task:")
rnd = random.Random(1)
summary = {}
for t in TASKS:
    ok_count, all_tokens, forbidden = 0, 0, 0
    outcomes = []
    for _ in range(RUNS):
        run = agent(t, rnd)
        checks, ok = grade(t, run)
        ok_count += ok; all_tokens += run["tokens"]; outcomes.append(ok)
        forbidden += not checks["no_forbidden_tools"]
    p = ok_count / RUNS
    summary[t["id"]] = p
    print(f"  {t['id']} {t['kind']:9} success rate {p*100:5.1f}%   pass^5 ~ {p**5*100:5.1f}%   avg tokens {all_tokens//RUNS:5}   forbidden-tool runs: {forbidden}")
print()
print("overall mean success:", round(sum(summary.values()) / len(summary) * 100, 1), "%")
EOF
python3 harness.py | tail -7
```

Look at task t3: the success rate looks high, but a **safety** metric ("forbidden-tool runs") is not zero. For safety-critical behaviour the target is usually **zero in all runs**, and any non-zero count should block the release no matter the average.

## 5. Evaluate the trajectory, not only the answer

Two agents can reach the same answer, one by sensible steps and one by luck, wasteful calls or unsafe actions. Useful trajectory checks:

| Check | Why |
|---|---|
| required tools used (read the log before concluding) | the answer was evidence-based |
| forbidden tools never used | safety |
| number of steps and tokens within budget | cost and latency |
| no repeated identical calls | no loops |
| final answer cites tool results | grounding |
| recovered after a tool error | resilience |

Store **traces** of every evaluation run (every thought, call and result). When a case fails, the trace tells you why, and it becomes a regression test.

## 6. Cost, latency and the Pareto view

A system that is 2% more accurate but 10 times more expensive may be a bad trade. Compare systems on **accuracy versus cost** (and latency). The ones not beaten on both axes form the **Pareto frontier**:

```run
cd ~/lab/ai
cat > pareto.py <<'EOF'
systems = [
    ("single prompt, small model", 0.62, 0.002),
    ("single prompt, large model", 0.74, 0.020),
    ("workflow (chain + RAG)",     0.83, 0.012),
    ("agent, large model",         0.86, 0.150),
    ("agent + voting x3",          0.88, 0.450),
    ("agent, small model",         0.70, 0.030),
]
def dominated(s):
    return any(o[1] >= s[1] and o[2] <= s[2] and (o[1] > s[1] or o[2] < s[2]) for o in systems)
print(f"{'system':32} {'accuracy':>9} {'$/task':>8}  frontier?")
for s in sorted(systems, key=lambda s: s[2]):
    print(f"{s[0]:32} {s[1]*100:8.0f}% {s[2]:8.3f}  {'no (beaten on both)' if dominated(s) else 'YES'}")
EOF
python3 pareto.py
```

"agent, small model" is beaten on both axes by the workflow, so there is no reason to choose it. Which frontier point you pick depends on what an extra percentage point is worth to the business.

## 7. Make evaluation a release gate

Put the evaluation in your pipeline (the Jenkins track): on every change to prompts, tools or models, run the suite and **fail the build** when quality drops or a safety check fires.

```run
cd ~/lab/ai
cat > gate.py <<'EOF'
import sys
baseline = {"success": 0.88, "forbidden_runs": 0, "avg_cost": 0.012}
candidate = {"success": 0.84, "forbidden_runs": 0, "avg_cost": 0.010}
problems = []
if candidate["forbidden_runs"] > 0: problems.append("safety: forbidden tool used")
if candidate["success"] < baseline["success"] - 0.02: problems.append(f"quality dropped {baseline['success']:.2f} -> {candidate['success']:.2f} (allowed drop 0.02)")
if candidate["avg_cost"] > baseline["avg_cost"] * 1.25: problems.append("cost rose more than 25%")
if problems:
    print("RELEASE BLOCKED:"); [print(" -", p) for p in problems]; sys.exit(1)
print("release gate passed")
EOF
python3 gate.py; echo "exit code: $?"
```

The gate returns a non-zero exit code, which any CI system treats as failure. Combine with **monitoring in production** (chapter 13): sample real conversations, grade them, and feed new failures back into the test set.

## Building a good test set

- Start from **real** tasks and failures (support tickets, logs), not invented easy ones.
- Include **easy, typical, hard, ambiguous and adversarial** cases, and cases where the right answer is "I cannot do that".
- Write the **expected outcome or checker** when you write the task.
- Keep a **held-out** set you never tune on, to detect overfitting your prompts to the tests.
- Review failures **by reading transcripts**, because metrics hide the reasons.
- Version the test set and grow it over time.

## Common misconceptions

- "A benchmark score tells me my agent is ready." Only your own tasks, repeated, with safety checks, can.
- "If the final answer is right, the agent is right." The path may have been unsafe, wasteful or lucky.
- "Average success is enough." Tail risks (forbidden actions, rare disasters) need separate zero-tolerance metrics.
- "An LLM judge removes the need for human review." It needs calibration against humans.

## Practice (answers below)

1. A single run succeeds 85% of the time. What is pass^3?
2. Why run each task many times?
3. Name two trajectory checks for an agent that reads logs.
4. Your new prompt raises accuracy by 1 point but doubles the cost. How do you decide?

:::note Answers
1. 0.85^3 is about 0.61, so about 61%.
2. Agents are non-deterministic; one run can pass or fail by chance, so you need the rate and its spread.
3. For example: it read the log before giving a diagnosis; it never called a write or delete tool; it stayed within the step budget.
4. Compare on the cost-versus-accuracy frontier and the business value of one point; if the extra point is worth less than the extra spend, keep the cheaper system.
:::

:::recap
- Evaluate repeatedly, automatically and across several dimensions: outcome, path, safety, cost, latency.
- Use code graders where possible; calibrate model graders against humans; check final state for state-changing agents.
- pass@k measures capability; pass^k measures dependability; report which one you used.
- Use Pareto thinking for cost versus quality; make the suite a CI release gate; grow the test set from real failures.
:::

:::quiz
? Which metric fits an unattended automation that must work every time?
+ pass^k
- pass@k
- Perplexity
- Context length
! All k runs must succeed.
? Why check the tool-call trajectory as well as the answer?
+ The answer may be right for the wrong or unsafe reasons
- Tool calls cost nothing
- Answers are never wrong
- It replaces the test set
! Trajectory checks catch luck, loops and forbidden actions.
? A system is "dominated" in a Pareto chart. What does that mean?
+ Another system is at least as good on both cost and accuracy, and better on one
- It is the cheapest
- It has the best accuracy
- It cannot be evaluated
! There is no reason to choose it.
? What should happen when a safety check fails in the evaluation suite?
+ Block the release, regardless of average accuracy
- Ignore it if the average is high
- Raise the temperature
- Delete the test
! Safety metrics have zero tolerance.
:::
