---
track: aideep
title: Deep dive 11: build, test and observe an agent
short: Build and test
sub: Companion to chapter 11. Structure a real project, unit-test the tools, add logging and tracing, handle failures with retries and timeouts, and keep cost in view.
---

:::goals
- organise an agent project so tools, loop and model access are separate and testable
- write unit tests for tools and for the loop using a fake model
- add structured logs and a trace for every run
- handle transient failures with timeouts and retries with backoff
- track tokens and cost per run
:::

## 1. Project structure that stays testable

The most common mistake is one 400-line file where prompts, tool code, the loop and API calls are mixed. Separate them:

```text
ev_agent/
├── tools.py       # plain functions: read_log, check_host (no model code)
├── schemas.py     # tool schemas and validation
├── model.py       # the ONLY place that talks to the model API (easy to replace with a fake)
├── agent.py       # the loop: calls model, validates, runs tools, enforces limits
├── tracing.py     # structured logging
├── prompts/       # prompt text files, versioned in Git
└── tests/         # unit tests (fast, no network) and evals (slower, many runs)
```

The key idea: **the model is a dependency you can inject.** The agent takes any object with a `decide(history)` method. In production it is a real model client; in tests it is a **fake** with scripted answers, so the whole loop is testable offline, fast and deterministically.

## 2. Build it

```run
mkdir -p ~/lab/ai/ev_agent/tests && cd ~/lab/ai/ev_agent
cat > tools.py <<'EOF'
LOGS = {"indexing": ["09:12:18 ERROR SQL connection timeout (SQL01)", "09:12:35 ERROR Indexing task aborted"],
        "storage": ["09:00:00 INFO Storage service started"]}

class ToolError(Exception):
    """Raised for problems the model can fix (bad arguments). The message goes back to the model."""

def read_log(name, lines=10):
    if name not in LOGS:
        raise ToolError(f"unknown log {name!r}; valid logs: {sorted(LOGS)}")
    if not isinstance(lines, int) or not 1 <= lines <= 50:
        raise ToolError("lines must be an integer between 1 and 50")
    return LOGS[name][-lines:]

def check_host(host):
    if not isinstance(host, str) or not host.isalnum():
        raise ToolError("host must be a plain host name such as SQL01")
    return {"host": host, "reachable": host != "SQL01"}

REGISTRY = {"read_log": read_log, "check_host": check_host}
EOF
cat > tracing.py <<'EOF'
import json, time

class Trace:
    """Collects one JSON object per event; write them as JSON lines for later analysis."""
    def __init__(self, run_id):
        self.run_id, self.events, self.t0 = run_id, [], time.time()
    def log(self, kind, **data):
        self.events.append({"run": self.run_id, "t": round(time.time() - self.t0, 3), "kind": kind, **data})
    def dump(self):
        return "\n".join(json.dumps(e) for e in self.events)
EOF
cat > agent.py <<'EOF'
import time
from tools import REGISTRY, ToolError
from tracing import Trace

class Budget:
    def __init__(self, steps=8, tokens=20000):
        self.steps, self.tokens = steps, tokens

def call_with_retry(fn, attempts=3, base_delay=0.0, trace=None):
    """Retry transient failures (timeouts, rate limits) with exponential backoff. Never retry ToolError."""
    for n in range(1, attempts + 1):
        try:
            return fn()
        except (TimeoutError, ConnectionError) as e:
            if trace: trace.log("retry", attempt=n, error=type(e).__name__)
            if n == attempts: raise
            time.sleep(base_delay * (2 ** (n - 1)))

def run_agent(model, goal, budget=None, run_id="run-1"):
    budget = budget or Budget()
    trace = Trace(run_id)
    history, used_tokens = [], 0
    trace.log("start", goal=goal)
    for step in range(1, budget.steps + 1):
        decision = call_with_retry(lambda: model.decide(goal, history), trace=trace)
        used_tokens += decision.get("tokens", 0)
        trace.log("model", step=step, action=decision["action"], tokens=decision.get("tokens", 0))
        if used_tokens > budget.tokens:
            trace.log("stop", reason="token budget exceeded")
            return {"status": "stopped", "reason": "token budget", "trace": trace}
        act = decision["action"]
        if "finish" in act:
            trace.log("finish", answer=act["finish"])
            return {"status": "ok", "answer": act["finish"], "tokens": used_tokens, "trace": trace}
        tool = REGISTRY.get(act.get("tool"))
        if tool is None:
            result = {"error": f"no such tool {act.get('tool')!r}"}
        else:
            try:
                result = {"ok": tool(**act.get("args", {}))}
            except (ToolError, TypeError) as e:
                result = {"error": str(e)}
        trace.log("tool", step=step, tool=act.get("tool"), result=result)
        history.append({"action": act, "result": result})
    trace.log("stop", reason="step budget exceeded")
    return {"status": "stopped", "reason": "step budget", "trace": trace}
EOF
echo "project files:"; ls
```

## 3. Unit tests with a fake model

A **fake model** returns scripted decisions, so we can test the loop, error handling and limits **without any API**. We use Python's built-in `unittest`.

```run
cd ~/lab/ai/ev_agent
cat > tests/test_agent.py <<'EOF'
import sys, unittest
sys.path.insert(0, "..")
from agent import run_agent, Budget
from tools import read_log, ToolError

class FakeModel:
    def __init__(self, script): self.script, self.calls = list(script), 0
    def decide(self, goal, history):
        self.calls += 1
        item = self.script.pop(0)
        if isinstance(item, Exception): raise item
        return item

class ToolTests(unittest.TestCase):
    def test_read_log_returns_last_lines(self):
        self.assertEqual(read_log("indexing", 1), ["09:12:35 ERROR Indexing task aborted"])
    def test_unknown_log_gives_helpful_error(self):
        with self.assertRaises(ToolError) as cm: read_log("passwords")
        self.assertIn("valid logs", str(cm.exception))
    def test_lines_out_of_range(self):
        with self.assertRaises(ToolError): read_log("indexing", 5000)

class AgentTests(unittest.TestCase):
    def test_happy_path(self):
        m = FakeModel([{"action": {"tool": "read_log", "args": {"name": "indexing"}}, "tokens": 100},
                       {"action": {"finish": "SQL01 timeouts"}, "tokens": 50}])
        r = run_agent(m, "why?")
        self.assertEqual(r["status"], "ok"); self.assertEqual(r["answer"], "SQL01 timeouts"); self.assertEqual(r["tokens"], 150)
    def test_bad_tool_arguments_are_returned_to_the_model(self):
        m = FakeModel([{"action": {"tool": "read_log", "args": {"name": "nope"}}},
                       {"action": {"finish": "done"}}])
        r = run_agent(m, "why?")
        tool_events = [e for e in r["trace"].events if e["kind"] == "tool"]
        self.assertIn("error", tool_events[0]["result"])
    def test_unknown_tool_does_not_crash(self):
        m = FakeModel([{"action": {"tool": "format_disk"}}, {"action": {"finish": "ok"}}])
        self.assertEqual(run_agent(m, "x")["status"], "ok")
    def test_step_budget_stops_a_loop(self):
        m = FakeModel([{"action": {"tool": "read_log", "args": {"name": "indexing"}}}] * 20)
        r = run_agent(m, "x", Budget(steps=3))
        self.assertEqual((r["status"], r["reason"]), ("stopped", "step budget")); self.assertEqual(m.calls, 3)
    def test_token_budget(self):
        m = FakeModel([{"action": {"tool": "read_log", "args": {"name": "indexing"}}, "tokens": 9000}] * 5)
        self.assertEqual(run_agent(m, "x", Budget(tokens=10000))["reason"], "token budget")
    def test_transient_error_is_retried(self):
        m = FakeModel([TimeoutError("slow"), {"action": {"finish": "recovered"}}])
        r = run_agent(m, "x"); self.assertEqual(r["answer"], "recovered"); self.assertEqual(m.calls, 2)
    def test_persistent_failure_is_raised(self):
        m = FakeModel([TimeoutError("slow")] * 3)
        with self.assertRaises(TimeoutError): run_agent(m, "x")

if __name__ == "__main__":
    unittest.main(verbosity=2)
EOF
cd tests && python3 test_agent.py 2>&1 | tail -16
```

Each test names a behaviour. When you change the loop, these run in a fraction of a second and catch regressions. Note what is tested: **limits, error paths and recovery**, which are the things agents get wrong, not just the happy path. Run them in CI on every commit (the Jenkins track). Real model behaviour is covered separately by the **evaluation suite** (chapter 9), which is slower and statistical.

## 4. Logging and tracing

Every run should leave a **trace**: what the model decided, what each tool returned, how long and how many tokens. Without it you cannot debug a failure you did not see happen.

```run
cd ~/lab/ai/ev_agent
cat > demo_trace.py <<'EOF'
from agent import run_agent
class Scripted:
    def __init__(self): self.n = 0
    def decide(self, goal, history):
        self.n += 1
        return [{"action": {"tool": "read_log", "args": {"name": "indexing", "lines": 2}}, "tokens": 800},
                {"action": {"tool": "check_host", "args": {"host": "SQL01"}}, "tokens": 400},
                {"action": {"finish": "SQL01 is unreachable"}, "tokens": 250}][self.n - 1]
r = run_agent(Scripted(), "Why has indexing stopped?", run_id="demo-42")
for line in r["trace"].dump().splitlines():
    print(line[:170])
print()
print("status:", r["status"], "| tokens:", r["tokens"])
EOF
python3 demo_trace.py | sed -E 's/"t": [0-9.]+/"t": <secs>/'
```

Each line is one JSON event, with the **run ID** shared by all events. Ship these to a log system (see the Monitoring track), then query: "all runs that hit the step limit", "average tokens per run this week", "every call to a write tool". **Redact secrets and personal data** before logging.

Useful metrics to emit per run: success/failure, steps, tool calls by name, tokens in/out, latency, estimated cost, and whether a human approval was requested. Alert on rises in step-limit stops, tool errors and cost per task.

## 5. Failure handling checklist

| Failure | Handling |
|---|---|
| Model API timeout, rate limit, 5xx | **retry with exponential backoff and jitter**, cap attempts, then fail clearly |
| Invalid model output | validate, feed the error back once or twice, then fall back |
| Tool raises an exception | catch it, return a **short, safe** message to the model (never a stack trace with secrets) |
| Tool is slow | per-call **timeout** |
| Loop or runaway cost | step, token and time **budgets** |
| Partial progress lost on crash | checkpoint state so long tasks can resume |
| Duplicate side effects on retry | make write tools **idempotent** (a request ID the server de-duplicates) |
| Model API outage | graceful degradation: queue the task, return a "try later", or switch to a backup provider |

## 6. Cost awareness

Cost per run is `input tokens x input price + output tokens x output price`, **and every step re-sends the growing history**, so cost grows faster than the number of steps.

```run
cd ~/lab/ai
python3 - <<'EOF'
system, tool_defs, goal = 900, 600, 100          # tokens always sent
per_step_added = 700                               # each step adds an action plus a tool result
price_in, price_out, out_per_step = 3.0, 15.0, 120  # illustrative $ per million tokens
total_in = total_out = 0
for step in range(1, 11):
    context = system + tool_defs + goal + per_step_added * (step - 1)
    total_in += context; total_out += out_per_step
    if step in (1, 3, 5, 10):
        cost = (total_in * price_in + total_out * price_out) / 1e6
        print(f"after {step:2} steps: context now {context:6} tokens, total input sent {total_in:7} tokens, cost so far ${cost:.4f}")
print()
print("Mitigations: prompt caching of the stable prefix (system and tool definitions), summarising old history, smaller models for easy steps, fewer steps.")
EOF
```

## Common misconceptions

- "I can only test an agent by running the real model." Most of the program is deterministic code; test it with a fake model, and use evaluations for the model's behaviour.
- "Retrying always helps." Retrying a failed validation without changing anything repeats the failure; retry transient errors only, and feed back validation errors.
- "Logs are for later." Add tracing on day one; the failures you most need to understand are the ones you cannot reproduce.
- "A stack trace is a good error for the model." It leaks internals; return a short instructive message.

## Practice (answers below)

1. Which test would catch a loop that never stops?
2. Why inject the model into the agent instead of importing a client inside it?
3. Why should write tools be idempotent?
4. Why does cost rise faster than linearly with steps?

:::note Answers
1. The step-budget test: a fake model that always asks for a tool, with `steps=3`, must stop and report the budget.
2. So tests can substitute a fake, and you can change providers without touching the loop.
3. Retries and agent loops may repeat a call; an idempotent write has the same effect once or many times.
4. Each step re-sends the whole history, so every step is larger than the last.
:::

:::recap
- Separate tools, loop, model client, tracing and prompts; inject the model.
- Unit-test tools and the loop with a fake model, including limits and error paths; evaluate real model behaviour separately.
- Log a JSON trace per run; retry only transient failures with backoff; make writes idempotent.
- Watch tokens and cost per run; cache stable prefixes and summarise history.
:::

:::quiz
? What is the benefit of a fake model in tests?
+ Deterministic, fast, offline tests of the loop and its limits
- It improves answer quality
- It replaces evaluations
- It removes the need for tools
! You still need statistical evaluation of the real model.
? Which failure should be retried with backoff?
+ A timeout or rate limit from the model API
- A tool saying the log name is invalid
- A schema validation error that never changes
- A forbidden-tool attempt
! Retry transient failures; correct invalid requests instead.
? Why record a run ID in every trace event?
+ To group all events of one run for debugging and analysis
- To reduce tokens
- To rotate keys
- To train the model
! Search by run ID to reconstruct what happened.
? What should an agent return to the model when a tool crashes?
+ A short, safe, instructive message
- The full stack trace
- Nothing at all
- The credentials used
! Avoid leaking internals.
:::
