# Lesson C3: decisions and loops. Reading an event log, then a retry loop.
events = [
    "09:10 INFO service started",
    "09:12 ERROR SQL connection timeout",
    "09:12 ERROR indexing task aborted",
    "09:13 INFO service stopped",
]

errors = 0
for line in events:
    if "ERROR" in line:
        errors = errors + 1
        print("Found:", line)

if errors >= 2:
    print("Several errors: likely a real problem")
elif errors == 1:
    print("One error: keep watching")
else:
    print("No errors")

# A while loop repeats until a condition is false: the shape of every agent loop.
attempts = 0
connected = False
while attempts < 3 and not connected:
    attempts = attempts + 1
    print("Connection attempt", attempts)
    if attempts == 3:
        connected = True
print("Connected after", attempts, "attempts")
