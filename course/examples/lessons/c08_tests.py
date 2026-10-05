# Lesson C8: tests and evaluation. Check the agent against known failure scenarios.
SCENARIOS = [
    {"name": "stopped, SQL down", "service": "Stopped", "sql": False, "dns": True,  "expect": "SQL unreachable"},
    {"name": "running, DNS broken", "service": "Running", "sql": True,  "dns": False, "expect": "DNS failure"},
    {"name": "stopped, all healthy", "service": "Stopped", "sql": True,  "dns": True,  "expect": "needs human"},
]

def diagnose(service, sql, dns):
    if not dns:
        return "DNS failure"
    if service == "Stopped" and not sql:
        return "SQL unreachable"
    return "needs human"

passed = 0
for case in SCENARIOS:
    answer = diagnose(case["service"], case["sql"], case["dns"])
    ok = answer == case["expect"]
    passed = passed + (1 if ok else 0)
    print("PASS" if ok else "FAIL", "-", case["name"], "->", answer)

rate = passed / len(SCENARIOS)
print(f"Task success rate: {rate:.0%} ({passed}/{len(SCENARIOS)})")
assert rate == 1.0, "a regression: something that used to pass now fails"
