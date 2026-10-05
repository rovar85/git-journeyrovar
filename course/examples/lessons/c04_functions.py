# Lesson C4: functions. A tool for an agent is just a function with a clear job.
def get_service_status(server, service):
    """Return the state of one service on one server (a pretend lookup)."""
    known = {"Indexing": "Stopped", "Storage": "Running"}
    status = known.get(service, "Unknown")
    return {"server": server, "service": service, "status": status, "error": None}

def summarise(result):
    return f"{result['service']} on {result['server']}: {result['status']}"

first = get_service_status("EV01", "Indexing")
print(first)
print(summarise(first))
print(summarise(get_service_status("EV01", "Storage")))
print(summarise(get_service_status("EV01", "Search")))
