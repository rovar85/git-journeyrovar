# Lesson C9: a trace you can read later, and a policy gate in front of every tool.
import json

READ_ONLY = {"get_service_status", "get_event_logs"}
NEEDS_APPROVAL = {"restart_service"}
trace = []

def run_tool(name, human_ok=False):
    if name in READ_ONLY:
        verdict = "allow"
    elif name in NEEDS_APPROVAL:
        verdict = "allow" if human_ok else "deny"
    else:
        verdict = "deny"
    trace.append({"step": len(trace) + 1, "tool": name, "verdict": verdict})
    return verdict

run_tool("get_service_status")
run_tool("restart_service")
run_tool("restart_service", human_ok=True)
run_tool("delete_data", human_ok=True)

for entry in trace:
    print(json.dumps(entry))

denied = [e["tool"] for e in trace if e["verdict"] == "deny"]
print("Denied calls:", denied)
