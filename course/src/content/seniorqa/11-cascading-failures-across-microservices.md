---
track: seniorqa
title: "Q16: How do you handle cascading failures across microservices?"
short: Q16 Cascading failures
sub: How one slow dependency takes down callers through thread exhaustion and retries, and the defences: timeouts, bulkheads, circuit breakers, retry budgets, load shedding and graceful degradation.
---

:::goals
- explain how a slow dependency becomes a system-wide outage
- apply the defences: timeouts, bulkheads, circuit breakers, retry budgets, load shedding, degradation
- read a simulation showing which defence protects what
- describe how to find and stop a cascade during an incident
:::

:::note How this connects
Fan-out and tail latency are in [Systems 5](#systems-5); retries, back-off and jitter are in [Systems 6](#systems-6); idempotency is in [Systems 7](#systems-7). Self-healing is [Q15](#seniorqa-10).
:::

## How do you handle cascading failures across microservices?

**What the interviewer tests:** do you understand that the **slow** dependency is more dangerous than the **dead** one (a dead one fails fast), that **retries add load**, and that the fix is a set of small defences at every call site, not one big one.

### Clarifying questions

- Are calls synchronous (HTTP/gRPC chains) or asynchronous (queues)? Chains cascade; queues absorb.
- Is there a service mesh or client library where defaults can be set once?
- What are the dependencies and which are critical to the user's main action versus optional?
- Do you already have timeouts everywhere? (Often the answer is no, and defaults are infinite or 30 seconds.)

### How a cascade starts

1. A dependency (a database, a payment service) slows down: not down, just slow.
2. Callers keep their request thread, connection and memory **waiting** for it.
3. The caller's thread pool fills. Now the caller cannot serve **any** request, including ones that never touch the slow dependency.
4. Its callers see timeouts and **retry**, multiplying the load on an already struggling system.
5. Health checks start failing, load balancers remove instances, so the remaining ones get more load. The failure spreads upstream until the whole system is down, long after the original slowness ended (because the retry load keeps it down: a **metastable** failure).

### What each defence does, shown by a model

The model has a service with 100 threads, 50 requests per second that need a dependency, and 20 per second of `/health` that do not. The dependency becomes slow (4 seconds instead of 20 ms) between t=20 and t=60.

```run
mkdir -p ~/lab/seniorqa/q16 && cd ~/lab/seniorqa/q16
cat > cascade.py <<'EOF'
# Cascading failure: a slow dependency holds callers' threads; the service then fails even on endpoints that never touch it.
# Model: 100 threads. 50 req/s need the dependency, 20 req/s (/health) do not. Dependency takes 4 s between t=20 and t=60 (normally 20 ms).
def simulate(timeout_s, retries, bulkhead, breaker):
    busy = []                       # release times of threads in use
    dep_ok = dep_err = fast = 0; health_ok = health_bad = 0; dep_calls = 0; streak = 0; open_until = -1
    for tick in range(1000):                      # 100 s in 0.1 s ticks
        t = tick / 10; slow = 20 <= t < 60
        busy = [r for r in busy if r > t]
        for _ in range(5):                        # 5 dependency requests per tick = 50/s
            if breaker and t < open_until: fast += 1; continue
            used = len(busy); cap = 40 if bulkhead else 100
            if used >= cap: dep_err += 1; streak += 1; continue
            hold = 0.0; ok = False
            for _a in range(1 + retries):
                dep_calls += 1
                lat = 4.0 if slow else 0.02
                if lat <= timeout_s: hold += lat; ok = True; break
                hold += timeout_s
            busy.append(t + hold)
            if ok: dep_ok += 1; streak = 0
            else: dep_err += 1; streak += 1
            if breaker and streak >= 20: open_until = t + 5; streak = 0
        for _ in range(2):                        # 2 health requests per tick = 20/s, need a free thread for 10 ms
            if len(busy) < 100: health_ok += 1
            else: health_bad += 1
    return dep_ok, dep_err, fast, health_bad, dep_calls
print(f"{'configuration':58} {'dep ok':>7} {'dep err':>8} {'fast-fail':>9} {'/health failed':>15} {'calls to dep':>13}")
for label, a in [("no protection: 5 s timeout, 2 retries", (5, 2, False, False)),
                 ("5 s timeout + bulkhead (40 threads for the dependency)", (5, 0, True, False)),
                 ("short timeout 300 ms, 2 retries", (0.3, 2, False, False)),
                 ("short timeout 300 ms, no retries", (0.3, 0, False, False)),
                                  ("+ circuit breaker (5 s fail-fast after 20 errors)", (0.3, 0, True, True))]:
    r = simulate(*a); print(f"{label:58} {r[0]:7d} {r[1]:8d} {r[2]:9d} {r[3]:15d} {r[4]:13d}")
print("\nRead the '/health failed' column: with no protection the slow dependency takes every thread and even endpoints that never call it fail. That is the cascade.")
print("A short timeout frees threads sooner; a bulkhead caps what one dependency can take; a circuit breaker stops sending doomed calls (see 'calls to dep') so the dependency can recover.")
print("Retries multiply load on an already-slow dependency: only with backoff + jitter + a retry budget (Systems 6). Also: shed load at the edge, degrade (cached or partial result), prefer queues to synchronous chains.")
EOF
python3 cascade.py
```

What the output shows (the column to watch is **/health failed**, the requests that never use the slow dependency):

- **No protection (5 s timeout, 2 retries):** 764 health requests fail. The slow dependency took every thread, so even unrelated endpoints failed. That is the cascade.
- **5 s timeout with a bulkhead (40 threads for that dependency):** 0 health failures. The dependency calls still fail or wait, but the damage is contained.
- **Short timeout (300 ms), 2 retries:** health is safe because threads free quickly, but the **dependency receives 9,000 calls** instead of 5,000 for the same traffic. Retries are amplification.
- **Short timeout, no retries:** 5,000 calls; same errors, no amplification.
- **Add a circuit breaker:** after 20 consecutive errors it fails fast for 5 seconds. Calls to the struggling dependency drop to **3,040**, and 1,960 requests fail immediately instead of waiting, which gives the dependency room to recover and the caller its threads back.

### The defences, in the order I apply them

1. **Timeouts on every remote call**, shorter than the caller's own deadline. Propagate a **deadline** down the chain so a downstream service stops working on a request the user has already abandoned.
2. **Retry with exponential back-off, jitter and a retry budget** (for example, at most 10% extra requests), only for idempotent operations ([Systems 6](#systems-6), [Systems 7](#systems-7)). Retry at **one layer**, not at every layer (3 layers x 3 tries = 27 calls).
3. **Bulkheads:** a separate thread pool, connection pool or concurrency limit per dependency, so one slow dependency cannot take all capacity.
4. **Circuit breakers:** closed (normal), open (fail fast) after an error or latency threshold, half-open (probe) to recover. Pair with a fallback.
5. **Load shedding and rate limiting:** when overloaded, reject excess work early and cheaply (HTTP 429/503 with `Retry-After`), prioritising critical traffic. Admission control at the edge.
6. **Graceful degradation:** return cached or partial data, hide the recommendations widget, disable a non-critical feature with a flag. Decide in advance which dependencies are **critical** and which are **optional**.
7. **Asynchronous decoupling:** queue work that does not need an immediate answer; the queue absorbs spikes, and consumers scale independently.
8. **Autoscaling and capacity headroom:** scale on saturation, but remember that scaling cannot fix a slow dependency and takes minutes.
9. **Independent failure domains:** cells or shards so a bad request or tenant affects a slice.
10. **Observability:** latency percentiles, saturation (queue depth, thread pool use), error rates **per dependency**, and distributed traces to find the first slow hop ([Monitoring 4](#monitoring-4)).

### During the incident

1. **Find the origin:** the earliest-degrading service in the traces or the dependency graph, not the loudest alert.
2. **Stop the amplification:** reduce or disable retries, open the breaker manually, shed load at the edge, scale the **origin** if capacity-bound.
3. **Degrade** non-critical features by flag.
4. **Restart only if it helps** (restarting under load can worsen a thundering herd; bring instances back gradually).
5. **Recover gradually**, watching for the retry storm on the way up.
6. Afterwards: review which defence was missing and add the test (a **chaos or latency-injection** experiment) that would have caught it.

```term
# Example (not run here): a circuit breaker and outlier ejection in a mesh (Istio DestinationRule)
trafficPolicy:
  connectionPool: {http: {http1MaxPendingRequests: 50, maxRequestsPerConnection: 10}}   # bulkhead-style limits
  outlierDetection: {consecutive5xxErrors: 5, interval: 10s, baseEjectionTime: 30s}      # eject bad hosts
# plus per-route timeout and retry policy:  timeout: 2s   retries: {attempts: 2, perTryTimeout: 500ms}
```

:::say
A cascade usually starts with a dependency that is slow, not dead. Callers hold threads waiting for it, their pools fill, and then even endpoints that never use that dependency fail; retries then multiply the load. I defend at every call site: a timeout on every remote call with a propagated deadline, retries only for idempotent calls with back-off, jitter and a budget, at one layer only; bulkheads so one dependency cannot take all the threads; circuit breakers that fail fast and let the dependency recover; and load shedding with graceful degradation for optional features. In my simulation the unprotected service failed 764 health requests that did not even use the slow dependency, a bulkhead brought that to zero, retries nearly doubled the load on the dependency, and the breaker cut those calls by about 40 percent. During an incident I find the first slow hop in the traces, stop the retries, shed load, degrade non-critical features and recover gradually.
:::

## Follow-up questions

:::answer Why is a slow dependency worse than a dead one?
A dead dependency fails fast (connection refused), so callers free their threads immediately. A slow one holds resources for the whole timeout, so capacity drains. This is why timeouts and breakers matter more than "is it up".
:::

:::answer How do you size a timeout?
Base it on the dependency's observed latency (a little above its p99), and below the caller's own deadline, so the total chain fits the user's patience. Review it as latency changes; too long drains resources, too short causes false failures.
:::

:::answer What is a retry storm and how do you prevent it?
When many clients retry together after a failure, the retries themselves overload the recovering service. Use exponential back-off with jitter, a retry budget, and a circuit breaker; retry at one layer; honour `Retry-After`.
:::

:::answer How do you test that your defences work?
Inject latency and failures in staging and, carefully, in production (chaos engineering, tools such as Chaos Mesh, Litmus, Gremlin or a mesh's fault injection) and verify that unrelated endpoints stay healthy and recovery is clean.
:::

## Practice (answers below)

1. Three services each retry 3 times. How many calls can one user request cause at the bottom?
2. What does a bulkhead protect?
3. Why can a recovering service fail again right after it comes back?

:::note Answers
1. Up to 3 x 3 x 3 = 27 attempts at the bottom service (each layer multiplies). 2. The rest of the service: it limits the threads or connections one dependency can use, so a slow dependency cannot starve unrelated work. 3. Queued and retried requests all arrive at once (a thundering herd) and overload it; recover gradually with back-off and load shedding.
:::

:::recap
- A cascade = **slow dependency + waiting threads + retries + health-check removals**.
- Defences: **timeouts with deadlines, budgeted retries, bulkheads, circuit breakers, load shedding, degradation, queues.**
- Retry at **one layer** only and only idempotent calls.
- In an incident: find the **first slow hop**, stop amplification, degrade, recover gradually.
- Prove it with **fault injection**.
:::

```quiz
? What is the first sign a bulkhead is missing?
+ Endpoints that do not use the slow dependency also fail
- The logs are large
- CPU is low
- The build is slow
! A shared thread pool lets one slow dependency starve everything.

? Why is retrying at every layer dangerous?
+ The attempts multiply across layers and overload the dependency
- Retries are always free
- It breaks DNS
- It disables timeouts
! Retry at one layer, with a budget.

? What does an open circuit breaker do?
+ Fails calls immediately so the dependency can recover and threads are freed
- Sends more traffic
- Restarts the pods
- Increases timeouts
! Fail fast, then probe in half-open state.
```
