---
track: dataeng
title: "Working with APIs: pagination, authentication, rate limits and retries"
short: APIs
sub: What a REST API is, then a real client against a local API that follows pages, sends a token, obeys a rate limit, retries server errors and loads only what changed.
---

:::goals
- explain a REST API: URL, method, headers, status code, JSON body
- map create, read, update and delete to POST, GET, PUT and DELETE, and say which are safe to repeat
- page through all results and know the three pagination styles
- handle 401, 429 and 5xx responses correctly, with timeouts and back-off
- load incrementally with a cursor instead of fetching everything every time
:::

:::note Before this lesson
HTTP basics are in [Networking](#networking-1). Retries, back-off and jitter in depth: [Systems 6](#systems-6).
:::

## The idea

An **API** (application programming interface) lets one program ask another for data over HTTP. Much of a data engineer's source data comes from APIs: payment providers, CRMs, ad platforms, weather, internal services. A **REST API** uses:

- a **URL** for each resource: `https://api.example.com/orders?page=2`
- a **method**: `GET` read, `POST` create, `PUT`/`PATCH` update, `DELETE` remove
- **headers**: extra information such as `Authorization: Bearer <token>`
- a **status code** in the reply, and usually a **JSON** body

| Status | Meaning | What your code does |
|---|---|---|
| 200, 201 | OK | use the data |
| 400, 404, 422 | your request is wrong | fix the request; **do not retry** |
| 401, 403 | not authenticated / not allowed | fix the token or permission; do not retry |
| 429 | too many requests (rate limit) | wait (read `Retry-After`), then retry |
| 500, 502, 503, 504 | the server has a problem | retry with increasing waits |

## Run it

To practise against something real without depending on the internet, the script **starts a small API on your own machine** (Python standard library), then talks to it. The API needs a token, returns 5 records per page, answers one call with 429 and one with 503.

```run
mkdir -p ~/lab/de/api && cd ~/lab/de/api
cat > api.py <<'EOF'
# Working with an API for real: a small local API (standard library) and a client that handles pagination, auth, rate limits and retries.
import json, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
ORDERS = [{"id": i, "amount": 10 + i, "updated_at": f"2026-03-{1 + i // 4:02d}"} for i in range(1, 24)]
calls = {"n": 0}
class Api(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def reply(self, code, body, headers=None):
        data = json.dumps(body).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        calls["n"] += 1; q = parse_qs(urlparse(self.path).query)
        if self.headers.get("Authorization") != "Bearer demo-token": return self.reply(401, {"error": "missing or wrong token"})
        if calls["n"] == 3: return self.reply(429, {"error": "rate limit"}, {"Retry-After": "0.2"})
        if calls["n"] == 5: return self.reply(503, {"error": "temporarily unavailable"})
        since = q.get("updated_since", [""])[0]; page = int(q.get("page", ["1"])[0]); size = 5
        data = [o for o in ORDERS if o["updated_at"] > since]; chunk = data[(page - 1) * size: page * size]
        self.reply(200, {"data": chunk, "next_page": page + 1 if page * size < len(data) else None})
server = HTTPServer(("127.0.0.1", 0), Api); threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}"

def get(path, token="demo-token", max_tries=4):
    for attempt in range(1, max_tries + 1):
        req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r: return json.load(r)          # ALWAYS set a timeout
        except urllib.error.HTTPError as e:
            if e.code == 429: wait = float(e.headers.get("Retry-After", 1))                 # the server tells us how long to wait
            elif e.code >= 500: wait = 0.1 * 2 ** (attempt - 1)                             # server error: exponential back-off
            else: raise                                                                     # 4xx (bad token, bad request): retrying will not help
            print(f"      HTTP {e.code} on attempt {attempt}; waiting {wait:.1f} s then retrying"); time.sleep(wait)
    raise RuntimeError("gave up after retries")

def fetch_all(updated_since=""):
    page, out = 1, []
    while page:
        body = get(f"/orders?page={page}&updated_since={updated_since}")
        print(f"   page {page}: {len(body['data'])} records"); out += body["data"]; page = body["next_page"]
    return out

print("1) a request without the right token fails fast (no retry):")
try: get("/orders", token="wrong")
except urllib.error.HTTPError as e: print(f"   HTTP {e.code}: {json.load(e)['error']}")
print("\n2) full load: follow next_page until it is null; survive a 429 and a 503")
rows = fetch_all()
print(f"   fetched {len(rows)} records in {calls['n']} HTTP calls; ids {rows[0]['id']}..{rows[-1]['id']}; unique ids: {len({r['id'] for r in rows})}")
cursor = max(r["updated_at"] for r in rows)
ORDERS.append({"id": 24, "amount": 99, "updated_at": "2026-03-09"})
print(f"\n3) incremental load: ask only for records changed since {cursor}")
new = fetch_all(updated_since=cursor)
print(f"   fetched {len(new)} new record(s): {new}")
server.shutdown()
EOF
python3 api.py
```

What happened:

1. **Wrong token:** HTTP 401, and the client stops at once. Retrying a 4xx error only wastes calls.
2. **Full load:** the client follows `next_page` until it is null: 5 + 5 + 5 + 5 + 3 = **23 records**. On the way it met a **429** (it waited the 0.2 s the server asked for in `Retry-After`) and a **503** (it waited, then retried). 8 HTTP calls in total (1 failed auth, 5 pages, 2 retried), and all 23 ids are unique: retries did not duplicate data.
3. **Incremental load:** the client remembered the newest `updated_at` it saw (the **cursor**, also called a watermark or high-water mark) and next time asked only for records changed after it: **1 record** instead of 24.

## Build an API yourself: the four operations

Calling APIs is easier once you have built one. Most APIs offer the same four operations on a collection of things, known as **CRUD**: create, read, update, delete. Each maps to an HTTP method.

| Operation | Method | Example | Success code |
|---|---|---|---|
| Read all | `GET` | `GET /drinks` | 200 OK |
| Read one | `GET` | `GET /drinks/2` (the id is part of the path) | 200, or 404 if it does not exist |
| Create | `POST` | `POST /drinks` with the new item as JSON in the **body** | 201 Created |
| Update | `PUT` (whole item) or `PATCH` (some fields) | `PUT /drinks/3` | 200 |
| Delete | `DELETE` | `DELETE /drinks/1` | 204 No Content |

A URL can carry information in two places: a **path parameter** identifies one thing (`/drinks/2`), and **query parameters** after a `?` filter or page a collection (`/drinks?max_price=25&page=2`).

The script starts a small drinks API on your own machine and then calls every operation.

```run
mkdir -p ~/lab/de/crud && cd ~/lab/de/crud
cat > crud.py <<'EOF'
# Build a small REST API yourself, then call every method on it: GET (read), POST (create), PUT (update), DELETE (remove).
# Standard library only so it runs anywhere; the same API in Flask is shown in the lesson.
import json, threading, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
DRINKS = {1: {"id": 1, "name": "Masala chai", "price": 20}, 2: {"id": 2, "name": "Filter coffee", "price": 25}}
class Api(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body=None):
        data = json.dumps(body).encode() if body is not None else b""
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def body(self): return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
    def drink_id(self):                                  # /drinks/2 -> 2 ; /drinks -> None
        parts = self.path.strip("/").split("/")
        return int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else None
    def do_GET(self):
        if self.path == "/drinks": return self.send(200, {"drinks": list(DRINKS.values())})
        d = DRINKS.get(self.drink_id()); return self.send(200, d) if d else self.send(404, {"error": "no such drink"})
    def do_POST(self):
        b = self.body()
        if "name" not in b or "price" not in b: return self.send(400, {"error": "name and price are required"})
        new_id = max(DRINKS) + 1; DRINKS[new_id] = {"id": new_id, "name": b["name"], "price": b["price"]}
        self.send(201, DRINKS[new_id])                   # 201 Created
    def do_PUT(self):
        i = self.drink_id()
        if i not in DRINKS: return self.send(404, {"error": "no such drink"})
        DRINKS[i].update(self.body()); self.send(200, DRINKS[i])
    def do_DELETE(self):
        i = self.drink_id()
        if i not in DRINKS: return self.send(404, {"error": "no such drink"})
        del DRINKS[i]; self.send(204)                    # 204 No Content: done, nothing to send back
server = HTTPServer(("127.0.0.1", 0), Api); threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}"
def call(method, path, payload=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(payload).encode() if payload else None, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r: text = r.read().decode(); code = r.status
    except urllib.error.HTTPError as e: text = e.read().decode(); code = e.code
    print(f"{method:6} {path:10} -> {code}  {text}")
call("GET", "/drinks")                                           # read the whole collection
call("GET", "/drinks/2")                                         # read one item: the id is part of the path
call("POST", "/drinks", {"name": "Lassi", "price": 30})          # create: the new item is in the request body
call("PUT", "/drinks/3", {"price": 35})                          # update item 3
call("PUT", "/drinks/3", {"price": 35})                          # the same PUT again changes nothing more: PUT is idempotent
call("POST", "/drinks", {"name": "Lassi"})                       # a bad request: price is missing
call("DELETE", "/drinks/1")                                      # remove
call("GET", "/drinks/1")                                         # it is gone
call("GET", "/drinks")
server.shutdown()
EOF
python3 crud.py
```

Read the output line by line:

- Both `GET` calls return **200** with JSON. Asking for one drink returns just that object.
- `POST` returns **201 Created** and the new drink, including the id the server gave it (3). The client did not choose the id.
- The first `PUT` changes the price to 35. Sending the **same `PUT` again** leaves the data exactly as it was. `PUT` and `DELETE` are **idempotent**; `POST` is not, because sending it twice would create two drinks. That is why a client may safely retry a `GET` or `PUT`, but must be careful about retrying a `POST`.
- A `POST` without a price gets **400 Bad Request** with a message saying what is wrong. A good API tells the caller how to fix the request.
- `DELETE` returns **204**: success, with nothing to send back. Reading the deleted drink then gives **404 Not Found**.

The data here lives in a Python dictionary and vanishes when the program stops. A real API stores it in a **database**, and the handler functions run SQL instead.

### The same API in Flask

In practice nobody writes the HTTP plumbing by hand. A small framework such as **Flask** or **FastAPI** maps URLs to functions:

```term
# Example (not run here):  pip install flask   then   flask --app api run
from flask import Flask, request, jsonify
app = Flask(__name__)
drinks = {1: {"id": 1, "name": "Masala chai", "price": 20}}

@app.route("/drinks")                          # GET is the default method
def list_drinks():
    return jsonify({"drinks": list(drinks.values())})

@app.route("/drinks/<int:drink_id>")           # <int:drink_id> is a path parameter
def get_drink(drink_id):
    if drink_id not in drinks:
        return jsonify({"error": "no such drink"}), 404
    return jsonify(drinks[drink_id])

@app.route("/drinks", methods=["POST"])
def add_drink():
    body = request.get_json()
    new_id = max(drinks) + 1
    drinks[new_id] = {"id": new_id, "name": body["name"], "price": body["price"]}
    return jsonify(drinks[new_id]), 201
```

### Tools for trying an API by hand

Before writing any code against a new API, call it by hand and read the documentation for its pagination, authentication and rate limits.

```term
# Example (not run here)
curl -s https://api.example.com/drinks                                   # GET
curl -s -X POST https://api.example.com/drinks \
     -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
     -d '{"name": "Lassi", "price": 30}'                                  # POST with a JSON body
```

Graphical clients such as **Postman**, **Insomnia** or **Bruno** do the same with buttons and keep a history of requests.

## The same thing with the requests library

The script uses `urllib` so it runs with no installation. In real projects most people use **`requests`** (`pip install requests`), which is shorter:

```term
# Example (not run here)
import requests
session = requests.Session()
session.headers["Authorization"] = f"Bearer {token}"       # token read from an environment variable or a secret store
r = session.get("https://api.example.com/orders", params={"page": 2}, timeout=10)
r.raise_for_status()            # turn 4xx/5xx into an exception
data = r.json()
```

## Three kinds of pagination

| Style | Request | Note |
|---|---|---|
| **Page / offset** | `?page=3` or `?offset=200&limit=100` | Simple; can skip or repeat rows if data changes while you page |
| **Cursor / token** | `?cursor=eyJpZCI6...` from the previous reply | Stable; the usual choice of large APIs |
| **Link header / next URL** | follow the `next` URL the server gives | Just follow until there is no next |

## Rules for a production API client

1. **Always set a timeout.** Without one, a hung connection hangs your pipeline forever.
2. **Retry only what can succeed:** 429 and 5xx, and network errors. Use **exponential back-off** (0.1 s, 0.2 s, 0.4 s ...) with a little randomness (**jitter**) and a maximum number of attempts.
3. **Respect rate limits.** Read `Retry-After` and the `X-RateLimit-*` headers (many APIs send `X-RateLimit-Remaining`: when it reaches 0, sleep until the reset time); slow down before you are blocked.
4. **Do not hold everything in memory.** Process and save each page as it arrives (a generator that yields pages), instead of collecting a million records in one list.
5. **Never put secrets in code or in Git.** Read tokens from environment variables or a secret manager ([Kubernetes 5](#kubernetes-5), [Senior cloud 11](#cloudsenior-11)).
6. **Load incrementally** with a cursor, and store the cursor only **after** the data is safely saved.
7. **Keep the raw response** (for example as JSON Lines) before transforming, so you can re-process without calling the API again.
8. **Make the load idempotent:** upsert on the record id ([lesson 6](#dataeng-6)), because retries and overlapping windows will deliver the same record twice.
9. **Log** the URL (without secrets), status, duration and record count of every call.

:::try
Change `max_tries` to 1 and run again: the load now fails at the 429. Then make the server return 503 three times in a row (`if calls["n"] in (5, 6, 7)`) and watch the waits double.
:::

## How do you extract data from a REST API reliably?

:::say
I page through the results with the API's pagination, with a timeout on every call. I retry only rate-limit and server errors, with exponential back-off and the Retry-After header, and fail fast on client errors. I load incrementally using an updated-at cursor that I save only after the data is stored, keep the raw responses, and upsert on the record id so retries cannot create duplicates. Tokens come from a secret store, never from code.
:::

## What is the difference between POST and PUT?

:::say
POST creates a new resource and the server chooses its id, so sending it twice creates two. PUT writes a resource at a known address, so sending it twice leaves the same result: it is idempotent. PATCH changes only some fields. That is why clients can retry GET, PUT and DELETE safely but need an idempotency key or a check before retrying a POST.
:::

## Which HTTP errors should a client retry?

:::say
Retry 429 and 5xx responses and network timeouts, because they can succeed later; do not retry 400, 401, 403 or 404, because the request itself is wrong. Retries need back-off, jitter and a limit, and the operation must be idempotent.
:::

:::recap
- REST = URL + method + headers + status code + JSON.
- Follow **pagination** to the end; prefer cursor pagination.
- **Timeout always; retry 429/5xx with back-off; never retry 4xx.**
- **Incremental loads** use a cursor saved after the data is stored.
- Secrets outside code; raw responses kept; loads idempotent.
:::

```quiz
? The API answers 429. What should the client do?
+ Wait for the time in Retry-After (or back off), then retry
- Retry immediately in a tight loop
- Treat it as success
- Delete the token
! 429 means slow down.

? Why save the cursor only after the data is stored?
+ If the job crashes in between, the next run re-fetches instead of skipping records
- It is faster
- The API requires it
- It encrypts the data
! Saving the cursor first can lose data on a crash.

? Which error should NOT be retried?
+ 401 Unauthorized
- 503 Service Unavailable
- 429 Too Many Requests
- A network timeout
! The request will fail the same way until the token is fixed.
```
