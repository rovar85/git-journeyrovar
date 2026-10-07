---
track: scenarios
title: "S9: Users report intermittent failures across microservices, but the logs from individual services look normal. How do you identify the root cause?"
short: S9 Intermittent failures
sub: Why every service can look healthy while users fail, a three-service system you run that reproduces it (slow tail, timeouts, retries), per-service logs versus correlated traces, the metrics that expose it, the infrastructure suspects, and the answer an interviewer expects.
---

:::goals
- explain why **each service's own logs can look normal** while the **end-to-end request fails** (the failure lives **between** services and in the **tail**)
- reproduce it with **three small services** on the lab: a slow dependency, **mismatched timeouts**, and **retries**
- use **correlation (trace) IDs** to join logs across services and **attribute** each failure to a hop
- read **latency percentiles, error rates and retry amplification** instead of averages
- list the **infrastructure and platform** suspects (DNS, connection pools, throttling, load balancers, version skew, noisy neighbours)
- answer with a **method**: user impact first, then request path, then hop-by-hop evidence
:::

:::note Provenance
The three services (`edge`, `orders`, `inventory`) are **real HTTP servers** that run on the lab (in one Python process, each on its own port with its own log file), with a **deliberately injected slow tail** (about 15% of inventory calls take 2 seconds). Everything printed below comes from running them. A production system would use **OpenTelemetry tracing** with a backend such as Jaeger or Tempo; that is shown as an **Example, not run here**, and the correlation-ID technique below is the same idea in miniature.
:::

## 1. Why "my logs look fine" is not evidence

A user request crosses **several services**. A failure can be invisible in each service's own logs because:

1. **The failing service never logs the failure.** A service that was **too slow** still returned `200 OK` (late); the **caller gave up**, so the error is in the **caller's** log (as a timeout) and the callee logs a **success**.
2. **The failure is in the tail.** Averages and "mostly 200" hide the **slowest 1 to 5%** that cross a **timeout**.
3. **Failures hide in the gaps:** DNS, connection setup, load-balancer routing, queues, TLS, **retries and timeouts** between services.
4. **Retries multiply load** and turn a small slowness into a larger one (**retry amplification**).
5. **Logs cannot be joined** without a shared **request or trace ID**, so you cannot tell which failure in service A belongs to which call in service B.
6. **Sampling and aggregation** (dashboards of averages, log levels set to errors only) discard exactly the evidence you need.

So the method is not "read more logs", it is **follow one failing request through every hop**, then **measure the pattern**.

## 2. Build the system

The call chain is `edge` → `orders` → `inventory`. Inventory is **usually fast (20 ms) but about 15% of calls take 2 seconds** (think a garbage-collection pause, a cold cache, a noisy neighbour). Orders calls inventory with a **1 s timeout and one retry**. Edge calls orders with a **1.5 s timeout**. Every service writes **one JSON log line per request**, and the **trace ID** from the incoming request header is copied to every log line and every downstream call.

```run
mkdir -p ~/s9 && cd ~/s9
cat > services.py <<'PY'
import json, random, sys, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
random.seed(4)
LOGS = {n: open(f"{n}.log", "a", buffering=1) for n in ("edge", "orders", "inventory")}
def log(svc, **kw):
    kw.update(svc=svc, t=round(time.time(), 3)); LOGS[svc].write(json.dumps(kw) + "\n")
def serve(port, handler):
    srv = ThreadingHTTPServer(("127.0.0.1", port), handler); srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
def call(url, trace, timeout):
    req = urllib.request.Request(url, headers={"X-Trace-Id": trace})        # propagate the trace ID downstream
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            r.read(); return r.status, (time.time() - t0) * 1000
    except Exception as e:
        return ("timeout" if "timed out" in str(e) else "error"), (time.time() - t0) * 1000
class Quiet(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def reply(self, code, body=b"ok"):
        try:
            self.send_response(code); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        except Exception: pass                                              # the caller already gave up
class Inventory(Quiet):
    def do_GET(self):
        t0 = time.time(); slow = random.random() < 0.15
        time.sleep(2.0 if slow else 0.02)                                   # the injected slow tail
        self.reply(200)
        log("inventory", trace=self.headers.get("X-Trace-Id"), status=200, ms=round((time.time() - t0) * 1000))
class Orders(Quiet):
    def do_GET(self):
        trace, t0 = self.headers.get("X-Trace-Id"), time.time()
        for attempt in (1, 2):                                              # one retry
            status, ms = call("http://127.0.0.1:8103/", trace, 1.0)        # 1 second timeout
            log("orders", trace=trace, event="call_inventory", attempt=attempt, result=status, ms=round(ms))
            if status == 200: break
        final = 200 if status == 200 else 502
        self.reply(final); log("orders", trace=trace, status=final, ms=round((time.time() - t0) * 1000))
class Edge(Quiet):
    def do_GET(self):
        trace, t0 = self.headers.get("X-Trace-Id"), time.time()
        status, ms = call("http://127.0.0.1:8102/", trace, 1.5)            # 1.5 second timeout
        final = 200 if status == 200 else 504
        self.reply(final); log("edge", trace=trace, status=final, ms=round((time.time() - t0) * 1000))
serve(8103, Inventory); serve(8102, Orders); serve(8101, Edge)
time.sleep(float(sys.argv[1]))
PY
cat > load.py <<'PY'
import threading, urllib.request
def one(i):
    req = urllib.request.Request("http://127.0.0.1:8101/", headers={"X-Trace-Id": f"req-{i:04d}"})
    try: urllib.request.urlopen(req, timeout=5).read()
    except Exception: pass
batch = []
for i in range(200):                                    # 200 user requests, 8 at a time
    t = threading.Thread(target=one, args=(i,)); t.start(); batch.append(t)
    if len(batch) == 8:
        for x in batch: x.join()
        batch = []
for x in batch: x.join()
PY
rm -f edge.log orders.log inventory.log
python3 services.py 40 &
SERVICES=$!
sleep 2
python3 load.py
sleep 3
kill $SERVICES 2> /dev/null; wait $SERVICES 2> /dev/null
wc -l edge.log orders.log inventory.log
```

## 3. What each service's log says on its own

```run
cd ~/s9
cat > per_service.py <<'PY'
import json, collections
def load(name): return [json.loads(l) for l in open(f"{name}.log")]
def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(p / 100 * len(xs)))]

inv = load("inventory"); orders = [r for r in load("orders") if "event" not in r]; edge = load("edge")
print("what an engineer sees by reading ONE service's log:\n")
codes = collections.Counter(r["status"] for r in inv)
print(f"inventory: {len(inv)} requests, status codes {dict(codes)}  <- 100% success. 'Looks normal.'")
print(f"           median latency {pct([r['ms'] for r in inv], 50)} ms   (the median hides the slow tail)")
codes = collections.Counter(r["status"] for r in orders)
print(f"orders   : {len(orders)} requests, status codes {dict(codes)}  <- some 502s")
codes = collections.Counter(r["status"] for r in edge)
print(f"edge     : {len(edge)} requests, status codes {dict(codes)}  <- what users actually see")
PY
python3 per_service.py
```

**What you see:** inventory reports **100% success** and a healthy median: its logs are "normal". The errors appear in `orders` and `edge`, and **neither log says why** or **which downstream request** each failure belonged to. This is the situation the user described.

## 4. Join the logs with the trace ID

Because every log line carries the same `trace` value, we can reconstruct **one request's journey**:

```run
cd ~/s9
cat > trace_one.py <<'PY'
import json, glob, sys
def load(name): return [json.loads(l) for l in open(f"{name}.log")]
edge = load("edge")
failed = [r for r in edge if r["status"] != 200]
if not failed:
    print("no failures in this run (random); re-run the load"); sys.exit()
trace = failed[0]["trace"]
rows = []
for svc in ("edge", "orders", "inventory"):
    for r in load(svc):
        if r["trace"] == trace: rows.append(r)
rows.sort(key=lambda r: r["t"])
t0 = rows[0]["t"] - rows[0]["ms"] / 1000
print(f"timeline of one failed request: {trace}\n")
for r in rows:
    what = r.get("event", "handled")
    extra = f" attempt {r['attempt']} -> {r['result']}" if "attempt" in r else f" status {r['status']}"
    print(f"  +{(r['t'] - t0) * 1000:6.0f} ms  {r['svc']:9} {what}{extra}  (took {r['ms']} ms)")
PY
python3 trace_one.py
```

**What you see:** one request's story across **three logs**: orders' first call to inventory **timed out at about 1 second**, the **retry also timed out** (the same slow pattern or a fresh slow call), edge gave up at **1.5 seconds** with a 504, and **inventory eventually logged a late "success"** (2 seconds) for a caller that had already left. The cause is **a slow inventory call plus a timeout budget that does not add up**, visible only when the logs are **joined**.

## 5. Attribute every failure, and measure the pattern

```run
cd ~/s9
cat > attribute.py <<'PY'
import json, collections
def load(name): return [json.loads(l) for l in open(f"{name}.log")]
def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(p / 100 * len(xs)))]

edge, orders_all, inv = load("edge"), load("orders"), load("inventory")
orders_calls = [r for r in orders_all if "event" in r]
fails = {r["trace"] for r in edge if r["status"] != 200}
slow_inv = {r["trace"] for r in inv if r["ms"] > 1000}
timeouts_by_trace = collections.defaultdict(int)
for r in orders_calls:
    if r["result"] == "timeout": timeouts_by_trace[r["trace"]] += 1

print(f"user requests: {len(edge)}   failed at the edge: {len(fails)} ({100 * len(fails) / len(edge):.1f}%)")
print(f"failed requests whose trace contains a slow (>1s) inventory response: {len(fails & slow_inv)} of {len(fails)}")
print(f"requests that hit an inventory timeout but were SAVED by the retry: {sum(1 for t, n in timeouts_by_trace.items() if t not in fails)}")

print("\nlatency percentiles per hop (ms):")
print(f"{'hop':22} {'p50':>6} {'p95':>6} {'p99':>6} {'max':>7}")
for name, rows in (("edge (user view)", edge), ("orders handler", [r for r in orders_all if 'event' not in r]), ("inventory handler", inv)):
    xs = [r["ms"] for r in rows]
    print(f"{name:22} {pct(xs, 50):6} {pct(xs, 95):6} {pct(xs, 99):6} {max(xs):7}")

print(f"\nretry amplification: {len(edge)} user requests produced {len(inv)} inventory requests ({len(inv) / len(edge):.2f}x)")
print("timeout budget: edge waits 1.5 s, but orders may spend up to 1.0 s x 2 attempts = 2.0 s -> orders keeps working after edge gave up")
PY
python3 attribute.py
```

**What you see:** almost every user-visible failure traces to a **slow inventory response**; some requests were **rescued by the retry**; the percentile table shows an **innocent median but a 2-second tail** at the inventory hop; and the **retry amplification** (more inventory requests than user requests) shows how retries add load exactly when a dependency is struggling. The last line is the **timeout budget bug**: the caller's deadline (1.5 s) is **shorter** than the callee's worst case (2.0 s), so work continues for nobody.

## 6. The fixes this evidence points to

| Finding | Fix |
|---|---|
| a slow dependency tail | find **why** (GC, cold cache, noisy neighbour, a dependency of its own); **hedged requests** or caching for read paths; **CPU requests/limits** so it is not throttled |
| edge timeout (1.5 s) < orders' worst case (2.0 s) | **propagate deadlines**: each hop gets the **remaining budget**; downstream timeouts must be **smaller** than upstream ones |
| retries amplify load | **bounded retries with exponential backoff and jitter**, a **retry budget** (for example at most 10% extra traffic), retry only **idempotent** calls, and **circuit breakers** so a struggling dependency is given room to recover |
| failures invisible in logs | **structured logs with trace IDs everywhere**, **distributed tracing**, **per-hop metrics** |

```yaml:otel
# Example, not run here: the same idea with OpenTelemetry, auto-instrumenting a service via environment variables
env:
- {name: OTEL_SERVICE_NAME, value: orders}
- {name: OTEL_EXPORTER_OTLP_ENDPOINT, value: http://otel-collector:4317}
- {name: OTEL_TRACES_SAMPLER, value: parentbased_traceidratio}
- {name: OTEL_TRACES_SAMPLER_ARG, value: "0.1"}      # sample 10% of traces; keep all errors and slow ones with tail sampling in the collector
# W3C 'traceparent' headers carry the trace ID across HTTP and gRPC calls automatically.
```

(Tail sampling, metric cardinality and burn-rate alerts are covered in **Q12** of the senior track.)

## 7. The method: from symptom to root cause

1. **Quantify the user impact:** which users, which endpoints, which **error codes and latencies**, since when, what changed (deploys, config, traffic, dependencies, infrastructure events). **Intermittent** often means **percentage-based** (a fraction of calls, a fraction of instances), **time-based** (a periodic job, GC, certificate or token expiry), or **load-based**.
2. **Look at the service-level indicators first:** error rate and latency **percentiles** (RED: **R**ate, **E**rrors, **D**uration) for the user-facing service; saturation (USE: **U**tilisation, **S**aturation, **E**rrors) for resources.
3. **Pick failing requests and follow them:** by **trace ID** across every hop (logs, traces). If there is no ID, add one (propagate `X-Request-Id` / `traceparent`) **now**; it is the highest-value fix.
4. **Find the first hop that deviates** from the normal timing, and check what it was doing (its dependencies, its own metrics, its host).
5. **Segment the failures:** by **instance/pod, node, zone, version, customer, request type, time**. If failures cluster on **one pod or node**, suspect the host or a bad deploy; if on **one version**, the release; if **evenly spread**, a shared dependency or capacity.
6. **Check the gaps and the platform** (next section).
7. **Reproduce** (load test, replay a failing request) and **confirm the fix** with the same metrics.

## 8. The suspects between and under the services

| Area | What to check |
|---|---|
| **Timeouts, retries, deadlines** | mismatched budgets; retries without backoff; no circuit breakers; default client timeouts that are infinite or very long |
| **Connection pools** | exhausted pools (waiting for a connection looks like slowness), keep-alive mismatch (a server closes idle connections the client still reuses, giving random resets), too many connections to a database |
| **DNS** | CoreDNS overloaded or throttled, `ndots` causing many lookups, caching with short TTLs, a failing resolver (spikes of 5 s = a lookup timeout) |
| **Load balancing and discovery** | uneven balancing (gRPC with long-lived connections pinned to one pod), stale endpoints, **a bad instance staying in rotation** (health checks too lenient), readiness flapping |
| **Resource throttling** | **CPU limits** causing throttling (tail latency with low average CPU), memory pressure, **OOMKilled** restarts, noisy neighbours, burstable instance credits exhausted |
| **Kubernetes/network** | conntrack table full, kube-proxy and node issues, MTU problems, security groups or **NetworkPolicy** drops, cross-zone latency |
| **Deployment** | **version skew** (a canary or partial rollout with an incompatible change), config differences, feature flags on for some users |
| **Dependencies** | the database (slow queries, locks, failover), cache evictions or cold starts, third-party APIs and rate limits, message queue lag |
| **Time** | expiring tokens or certificates, clock skew, scheduled jobs, daily traffic peaks, garbage collection |
| **Observability gaps** | sampling dropped the failures; log level hides warnings; dashboards use averages |

## 9. The answer an interviewer expects

1. **Start with the user, not the logs:** quantify the impact and the pattern (which requests, what fraction, when).
2. **Explain why logs look normal** (the failure is between services, in the tail, in the caller's timeout, or unlinked).
3. **Follow a request:** correlate with trace/request IDs, or introduce them; use distributed tracing; find the **hop where time or errors appear**.
4. **Measure properly:** percentiles, error rates per hop, retry volume, saturation (RED and USE), segmented by instance/version/zone.
5. **Hypothesise from the evidence** (slow dependency, timeout budgets, connection pools, DNS, throttling, bad instance, version skew) and **test** each.
6. **Fix and prevent:** deadline propagation, bounded retries with backoff and circuit breakers, health checks and outlier ejection, resource sizing, tracing everywhere, SLO-based alerts (Q12), load and chaos tests.

A spoken version: *"I'd first pin down the symptom: which endpoints, what percentage, since when, and what changed. If each service looks healthy, the failure is probably in the tail or between services, so I'd follow individual failing requests with a trace or correlation ID across the hops and find where the time or the error first appears. I'd look at p95 and p99 per hop, error rates, retries and saturation, and segment by pod, node, zone and version. Common culprits are a slow dependency with mismatched timeouts and retries, connection pool or DNS problems, CPU throttling, or one bad instance. Then I'd fix it with deadline propagation, bounded retries, circuit breakers and tracing, and add an SLO alert so it's noticed earlier."*

:::warn Common mistakes
- **Trusting averages and "mostly 200"**.
- **Reading logs service by service** with no shared request ID.
- **Assuming a callee's 200 means the caller succeeded.**
- **Retrying without backoff or budgets**, which turns a slowdown into an outage.
- **Timeouts that grow down the chain** (the callee's budget larger than the caller's).
- **Setting log levels or sampling so low that the evidence is gone.**
- **Chasing the loudest error** (the symptom in the edge) instead of the first deviating hop.
- **Not segmenting** by instance, version or zone.
:::

## 10. Follow-up questions to expect

- **"What is distributed tracing?"** A trace is the tree of **spans** (one per operation per service) for a request, linked by a propagated context (the W3C `traceparent` header); it shows **where time went** and **which call failed**.
- **"Logs, metrics, traces: what is each for?"** Metrics tell you **that** something is wrong and how widespread (cheap, aggregated); traces tell you **where** in the request path; logs tell you **why** in detail. Link them with IDs (exemplars connect a latency spike to a trace).
- **"The failures only happen at night."** Look for scheduled jobs, backups, batch processing, certificate or token rotation, autoscaling down, a maintenance window, or low traffic exposing cold caches.
- **"Failures only from one pod?"** Compare that pod's node, version, resources and logs; cordon it and watch; fix readiness or health checks so it is ejected.
- **"How would you prevent this class of incident?"** Standard client libraries with sane timeouts, retries, circuit breakers and tracing; SLOs per service; chaos and load tests that inject latency.

:::try
1. In `services.py` change the retry count to 1 attempt and re-run. What happens to the failure rate and to the retry amplification?
2. Change edge's timeout to 3 s (greater than orders' worst case). How do the failures change, and what is the new user-visible latency?
3. Make the slow fraction 1% instead of 15% and compare p99 and the failure rate. Why is a rare slow tail still painful at scale?
4. Add a `pod` field to the logs (pretend inventory has two instances and only one is slow) and write a query that finds it.
:::

:::recap
- Each service can look **healthy** while users fail: failures sit in the **tail**, in **callers' timeouts**, in the **gaps**, and are **not linked** without a shared ID.
- **Propagate a trace/correlation ID** everywhere; **join logs** (or use distributed tracing) to follow a failing request and find the **first deviating hop**.
- Use **percentiles, per-hop error rates, retry amplification and saturation**, segmented by instance, version and zone.
- Mismatched **timeout budgets** and unbounded **retries** are classic causes; fix with **deadline propagation, bounded retries with backoff, circuit breakers**.
- Check DNS, connection pools, throttling, load balancing, version skew and dependencies; add **SLO-based alerting**.
:::

:::quiz
? Inventory's logs show 100% success but users see errors. How is that possible?
- The logs are wrong
+ Inventory answered late with a success after the caller had already timed out
- The users are mistaken
! The error lives in the caller's log as a timeout.

? What is the single most valuable thing to add when logs cannot be correlated?
- More log lines
+ A propagated trace or request ID in every log line and downstream call
- A bigger server
! It lets you follow one request across services.

? Why do retries without backoff make an incident worse?
- They slow the client
+ They add load on an already struggling dependency (retry amplification)
- They hide errors
! Use backoff with jitter, retry budgets and circuit breakers.

? Edge times out at 1.5 s but orders may work for up to 2 s. What is the bug?
- DNS
+ The downstream budget exceeds the upstream deadline, so work continues for nobody (propagate remaining deadlines)
- Too many pods
! Downstream timeouts must be shorter.

? Why look at p99 rather than the average?
- Averages are faster to compute
+ The failures sit in the slow tail, which the average and median hide
- p99 is always larger than the timeout
! Tail latency crosses timeouts.
:::
