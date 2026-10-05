# Lesson C7: a pretend Enterprise Vault lab and a rule-based diagnosis loop (no AI yet).
LAB = {
    "service_status": "Stopped",
    "event_log": ["09:12 ERROR SQL connection timeout"],
    "sql_reachable": False,
    "dns_ok": True,
}

def get_service_status():
    return {"status": LAB["service_status"]}

def get_event_logs():
    return {"lines": LAB["event_log"]}

def test_sql_connectivity():
    return {"reachable": LAB["sql_reachable"]}

def check_dns():
    return {"resolved": LAB["dns_ok"]}

TOOLS = {"get_service_status": get_service_status, "get_event_logs": get_event_logs,
         "test_sql_connectivity": test_sql_connectivity, "check_dns": check_dns}

def decide_next(history):
    """The 'brain'. Today it is rules. Later an LLM replaces this one function."""
    if not history:
        return "get_service_status"
    last_tool, last_result = history[-1]
    if last_tool == "get_service_status" and last_result["status"] == "Stopped":
        return "get_event_logs"
    if last_tool == "get_event_logs" and any("SQL" in line for line in last_result["lines"]):
        return "test_sql_connectivity"
    if last_tool == "test_sql_connectivity" and not last_result["reachable"]:
        return "check_dns"
    return None

history = []
while True:
    tool = decide_next(history)
    if tool is None:
        break
    result = TOOLS[tool]()
    history.append((tool, result))
    print("ran", tool, "->", result)

print("Diagnosis: SQL server unreachable; DNS is fine.")
