"""A policy gate between the model's request and the real tool (standard library only).

The model PROPOSES a tool call. This code DECIDES whether it may run.
Authorisation belongs to software policy, never to model confidence.
"""
import json
import time

READ_ONLY = {"get_service_status", "get_event_logs", "test_sql_connectivity", "check_dns"}
NEEDS_APPROVAL = {"restart_service", "change_configuration"}
FORBIDDEN = {"delete_data"}

AUDIT_LOG = []

def decide(tool, environment="production"):
    if tool in FORBIDDEN:
        return "deny"
    if tool in READ_ONLY:
        return "allow"
    if tool in NEEDS_APPROVAL:
        return "ask_human"
    return "deny"                     # unknown tool: deny by default (least privilege)

def run_tool(tool, args, human_approves=lambda tool, args: False):
    verdict = decide(tool)
    if verdict == "ask_human":
        verdict = "allow" if human_approves(tool, args) else "deny"
    AUDIT_LOG.append({"time": time.strftime("%H:%M:%S"), "tool": tool, "args": args, "verdict": verdict})
    if verdict != "allow":
        return {"error": f"'{tool}' was not allowed by policy"}
    return {"ok": True, "note": f"(pretend we ran {tool})"}

if __name__ == "__main__":
    print(run_tool("get_service_status", {"server": "EV01"}))                  # read-only: allowed
    print(run_tool("restart_service", {"server": "EV01"}))                     # no human approval: denied
    print(run_tool("restart_service", {"server": "EV01"}, lambda t, a: True))  # a human said yes: allowed
    print(run_tool("delete_data", {"all": True}, lambda t, a: True))           # forbidden, even with approval
    print(run_tool("send_email", {"to": "someone"}))                           # unknown tool: denied
    print()
    for row in AUDIT_LOG:
        print(json.dumps(row))
