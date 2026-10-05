# Lesson C2: lists and dictionaries. A tool result is just a dictionary.
servers = ["EV01", "EV02", "SQL01"]
servers.append("EV03")
print(len(servers), "servers; first is", servers[0])

record = {"server": "EV01", "service": "Indexing", "status": "Stopped", "error": None}
print("Status:", record["status"])
record["checked_at"] = "09:14"

fleet = [
    {"server": "EV01", "status": "Stopped"},
    {"server": "EV02", "status": "Running"},
    {"server": "EV03", "status": "Stopped"},
]
stopped = []
for item in fleet:
    if item["status"] == "Stopped":
        stopped.append(item["server"])
print("Stopped servers:", stopped)
print(record)
