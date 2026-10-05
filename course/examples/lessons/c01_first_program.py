# Lesson C1: your first program. Facts about one Enterprise Vault server.
server = "EV01"
service = "Indexing"
status = "Stopped"
minutes_down = 42

print("Checking", server)

message = f"{service} on {server} is {status}"
print(message)

hours_down = minutes_down / 60
print("That is", round(hours_down, 2), "hours")

is_urgent = minutes_down > 30
print("Urgent?", is_urgent)
