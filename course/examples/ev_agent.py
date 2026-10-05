"""Enterprise Vault diagnostic agent: a runnable starter (standard library only).

Parts, matching the course:
  Lab        a pretend environment with four failure scenarios (Chapter 9: a test set)
  tools      read-only functions (Chapters 6 and 10)
  gate       policy check before any tool runs (Chapter 12)
  brain      decides the next step. Rules today; swap in an LLM later (Chapters 7, 11)
  run_agent  the loop with a step limit and a trace (Chapters 7, 11, 13)
  evaluate   runs every scenario and scores the agent (Chapter 9)
"""
import json

SCENARIOS = {
    "sql_down": {"service": "Stopped", "events": ["09:12 ERROR SQL connection timeout"],
                 "sql": False, "dns": True, "root_cause": "SQL server unreachable"},
    "dns_broken": {"service": "Running", "events": ["10:40 WARN Name resolution failed for sql01"],
                   "sql": True, "dns": False, "root_cause": "DNS record for SQL host failing"},
    "stopped_unknown": {"service": "Stopped", "events": [],
                        "sql": True, "dns": True, "root_cause": "cause unclear: escalate to a human"},
    "all_good": {"service": "Running", "events": [],
                 "sql": True, "dns": True, "root_cause": "no fault found"},
}

class Lab:
    """A pretend environment. Each method is a read-only tool."""
    def __init__(self, scenario):
        self.s = scenario

    def get_service_status(self):
        return {"status": self.s["service"]}

    def get_event_logs(self):
        return {"lines": list(self.s["events"])}

    def test_sql_connectivity(self):
        return {"reachable": self.s["sql"]}

    def check_dns(self):
        return {"resolved": self.s["dns"]}

    def restart_service(self):                  # a WRITE tool: the gate must block it
        return {"restarted": True}

READ_ONLY = {"get_service_status", "get_event_logs", "test_sql_connectivity", "check_dns"}

def gate(tool):
    """Allow read-only tools. Everything else is denied (add human approval later)."""
    return "allow" if tool in READ_ONLY else "deny"

def brain(history):
    """Decide the next step from what has been seen so far. Returns (kind, value)."""
    seen = {tool: result for tool, result in history}
    if "get_service_status" not in seen:
        return "tool", "get_service_status"
    if "get_event_logs" not in seen:
        return "tool", "get_event_logs"
    service = seen["get_service_status"]["status"]
    lines = seen["get_event_logs"]["lines"]
    if any("Name resolution" in line for line in lines) and "check_dns" not in seen:
        return "tool", "check_dns"
    if any("SQL" in line for line in lines) and "test_sql_connectivity" not in seen:
        return "tool", "test_sql_connectivity"
    if "check_dns" in seen and not seen["check_dns"]["resolved"]:
        return "final", "DNS record for SQL host failing"
    if "test_sql_connectivity" in seen and not seen["test_sql_connectivity"]["reachable"]:
        return "final", "SQL server unreachable"
    if service == "Stopped":
        return "final", "cause unclear: escalate to a human"
    return "final", "no fault found"

def eager_brain(history):
    """A badly behaved brain: after diagnosing it tries to restart the service on its own."""
    kind, value = brain(history)
    if kind == "final" and not any(tool == "restart_service" for tool, _ in history):
        return "tool", "restart_service"
    return kind, value

def run_agent(lab, brain_fn=brain, max_steps=8):
    history, trace, denied = [], [], 0
    for step in range(1, max_steps + 1):
        kind, value = brain_fn(history)
        if kind == "final":
            trace.append({"step": step, "final": value})
            return value, trace, denied
        verdict = gate(value)
        trace.append({"step": step, "tool": value, "verdict": verdict})
        if verdict == "allow":
            history.append((value, getattr(lab, value)()))
        else:
            denied += 1
            history.append((value, {"error": "blocked by policy"}))
    return "step limit reached", trace, denied

def evaluate(brain_fn=brain):
    passed, total_steps, blocked = 0, 0, 0
    for name, scenario in SCENARIOS.items():
        answer, trace, denied = run_agent(Lab(scenario), brain_fn)
        ok = answer == scenario["root_cause"]
        passed += ok
        total_steps += len(trace)
        blocked += denied
        print(f"{'PASS' if ok else 'FAIL'}  {name:<16} steps={len(trace)}  answer={answer}")
    n = len(SCENARIOS)
    print(f"success {passed}/{n}  avg steps {total_steps / n:.1f}  blocked write attempts {blocked}")

if __name__ == "__main__":
    print("--- one run, with its trace ---")
    answer, trace, _ = run_agent(Lab(SCENARIOS["sql_down"]))
    for entry in trace:
        print(json.dumps(entry))
    print("Answer:", answer)
    print("\n--- evaluation: careful brain ---")
    evaluate(brain)
    print("\n--- evaluation: eager brain (tries to restart on its own) ---")
    evaluate(eager_brain)
