# Lesson C5: errors, validation and JSON. Reject bad input; return errors as data.
import json

def test_sql_connectivity(server):
    if not server.startswith("EV"):
        raise ValueError(f"unknown server: {server}")
    reachable = server != "EV03"
    return {"server": server, "reachable": reachable, "error": None if reachable else "timeout after 15s"}

for name in ["EV01", "EV03", "WEB9"]:
    try:
        result = test_sql_connectivity(name)
    except ValueError as problem:
        result = {"server": name, "reachable": None, "error": str(problem)}
    text = json.dumps(result)
    print(text)

back = json.loads(text)
print("Reachable?", back["reachable"], "| error:", back["error"])
