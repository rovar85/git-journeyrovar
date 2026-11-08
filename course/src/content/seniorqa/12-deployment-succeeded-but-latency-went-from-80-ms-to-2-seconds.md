---
track: seniorqa
title: "Q19: The deployment succeeded but latency went from 80 ms to 2 s"
short: Q19 Latency regression
sub: A triage order for a post-deploy latency jump: confirm the timing, narrow by endpoint and hop, check saturation and dependencies, then roll back and root-cause, with a model that finds a slow query.
---

:::goals
- follow a triage order from "did it start at the deploy?" to the slow hop
- compare before and after by endpoint, pod and hop rather than looking only at the average
- list the usual causes: a new query, missing index, N+1, cache miss, pool exhaustion, GC, config, dependency
- decide between rollback and fix-forward, and write the follow-up
:::

:::note How this connects
Percentiles and fan-out are in [Systems 5](#systems-5); indexes and query plans are in [Systems 3](#systems-3); logs, metrics and traces are in [Monitoring 4](#monitoring-4) and [Scenarios 9](#scenarios-9); rollbacks are in [Q7](#seniorqa-7).
:::

## The deployment succeeded but latency went from 80 ms to 2 s

**What the interviewer tests:** a calm, ordered method that narrows the problem quickly, and the judgement to **protect users first** (rollback) while keeping the evidence.

### Clarifying questions

- Is it **everything** or specific endpoints, users, regions or pods?
- Which percentile: p50 or only p99? (Only p99 suggests a subset; p50 too means everything.)
- Exactly **when** did it start? Does it line up with the deploy, a config change, a traffic change or a dependency change?
- What changed in the deploy: code, dependencies, config, database migration, feature flags, infrastructure?
- Is there error-rate movement too, or only slowness? Is traffic higher than normal?

### Triage order

1. **Confirm and time-stamp.** Overlay deploy markers on the latency graph. If the jump is at the deploy, suspect the change; if it started 20 minutes later, suspect a cache expiry, a cron job, a data volume threshold, or a dependency.
2. **Protect users.** If impact is high and the rollback is safe ([Q7](#seniorqa-7)), roll back or turn off the feature flag *first*, keep a canary or a copy for investigation, and root-cause after.
3. **Narrow by cohort:** endpoint, method, customer, region, pod/version (during a canary you can compare the new and old versions directly).
4. **Narrow by hop:** use traces (or per-stage timers) to see where the time goes: the application, the database, a cache, an external API, the network.
5. **Check saturation (USE/RED):** CPU, memory, garbage collection pauses, thread and connection pool use, queue depth, file descriptors, disk I/O, network. A saturated resource gives latency before it gives errors.
6. **Check the dependencies** and what the new code does to them: a new or changed query, a missing index, an **N+1** pattern (one query per item), a lock, a cache that is no longer hit (key changed), a larger payload, a new synchronous call, a changed timeout or retry setting.
7. **Check the platform:** resource requests and limits (CPU throttling), the number of pods, the HPA, node pressure, noisy neighbours, DNS, TLS handshakes, a service mesh sidecar.
8. **Reproduce** with the same request in staging with production-like data; capture a profile (flame graph) or `EXPLAIN ANALYZE` for the slow query.
9. **Fix and verify** against the SLO; add the test that would have caught it.

### The narrowing, shown by a model

The model generates 4,000 requests with a deliberate fault: version 2 added a database query without an index on one endpoint (`/search`), and one pod is slightly slow for an unrelated reason (a red herring). Follow the same drill-down you would do on a dashboard.

```run
mkdir -p ~/lab/seniorqa/q19 && cd ~/lab/seniorqa/q19
cat > latency.py <<'EOF'
# Latency went 80 ms -> 2 s after a deploy. Triage by comparing before/after per hop and per cohort.
import random
random.seed(11)
def pct(xs, p): xs = sorted(xs); return xs[int(len(xs) * p / 100) - 1]
def req(version, pod, endpoint):
    base = {"auth": 10, "cart": 25, "db": 30, "render": 15}
    hops = dict(base)
    if version == "v2" and endpoint == "/search": hops["db"] += 1900        # the regression: a new query without an index
    if pod == "pod-3": hops["render"] += 40                                  # an unrelated noisy pod
    return {k: v * random.uniform(0.8, 1.25) for k, v in hops.items()}
rows = []
for i in range(4000):
    v = "v2" if i >= 2000 else "v1"; pod = f"pod-{i % 4}"; ep = random.choice(["/search", "/cart", "/home"])
    h = req(v, pod, ep); rows.append((v, pod, ep, sum(h.values()), h))
def show(title, key):
    print(title)
    groups = {}
    for r in rows: groups.setdefault(key(r), []).append(r[3])
    for k in sorted(groups): print(f"   {str(k):18} n={len(groups[k]):5d}  p50={pct(groups[k], 50):7.0f} ms  p99={pct(groups[k], 99):7.0f} ms")
show("1) before vs after the deploy", lambda r: r[0])
print("2) v2 only, by endpoint (is it everything, or one path?)")
g = {}
for r in rows:
    if r[0] == "v2": g.setdefault(r[2], []).append(r[3])
for k in sorted(g): print(f"   {k:18} p50={pct(g[k], 50):7.0f} ms  p99={pct(g[k], 99):7.0f} ms")
print("3) v2 /search only, mean time per hop (where does the time go?)")
hop = {}
for r in rows:
    if r[0] == "v2" and r[2] == "/search":
        for k, v in r[4].items(): hop.setdefault(k, []).append(v)
for k, v in sorted(hop.items(), key=lambda kv: -sum(kv[1])): print(f"   {k:8} {sum(v)/len(v):7.0f} ms")
print("4) v2 by pod (a red herring: pod-3 is a bit slower for a different reason)")
g = {}
for r in rows:
    if r[0] == "v2" and r[2] != "/search": g.setdefault(r[1], []).append(r[3])
for k in sorted(g): print(f"   {k:8} p50={pct(g[k], 50):6.0f} ms")
print("\nTriage order: 1) did it start at the deploy? (overlay deploy markers on the graph)  2) one endpoint or all?  3) which hop (traces)?  4) CPU/memory/GC/connection pool/saturation?")
print("             5) dependency changes: new query, missing index, N+1, cache miss, timeout/retry change, config/feature flag, bigger payload?  6) roll back first if user impact is high, then root-cause.")
EOF
python3 latency.py
```

What the output shows:

1. **Before vs after:** v1 p50 85 ms and p99 138 ms; v2 p50 107 ms but **p99 2,455 ms**. The jump begins with v2. Note the p50 barely moved: the problem is a subset, not everything.
2. **By endpoint (v2 only):** `/cart` and `/home` are unchanged at p50 84 ms; **`/search` has p50 2,055 ms**. One path is the culprit.
3. **By hop (v2, `/search`):** the **db hop averages 1,990 ms**; auth, cart and render are tiny. The time is in the database call.
4. **By pod:** `pod-3` is about 40 ms slower than the others at p50 (122 ms against about 82 ms). That is real but unrelated and small; chasing it would waste the incident. Always ask **how much of the regression does this explain?**

The likely story: v2 added or changed a query on `/search` that lacks an index (a full scan) or runs per item (N+1). The check is `EXPLAIN ANALYZE`, the fix is an index or a rewritten query, and the interim action is to roll back or disable the feature.

```term
# Example (not run here): find the slow query and confirm
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM products WHERE category_id = 42 AND name ILIKE '%shoe%';
#  Seq Scan on products  (cost=... ) (actual time=1890..1920 rows=...)   <- full scan, the smoking gun
CREATE INDEX CONCURRENTLY idx_products_category ON products (category_id);   # CONCURRENTLY: do not block writes
# also check: slow query log, pg_stat_statements top by total time, connection pool wait time, lock waits
```

### Common causes, with the signal that identifies each

| Cause | Signal |
|---|---|
| Missing index / bad plan | One query dominates time; sequential scan in the plan |
| N+1 queries | Query count per request jumps; many tiny queries in the trace |
| Cache no longer hit | Hit ratio drops at the deploy (changed key or TTL); database load rises |
| Connection or thread pool exhausted | Pool wait time rises; CPU low; latency grows with traffic |
| CPU throttling | Container CPU limit hit; `throttled_time` rises |
| GC or memory pressure | Long pauses in the GC log; latency spikes at regular intervals |
| New synchronous external call | A new span in the trace; its latency adds directly |
| Changed timeout/retry | Retries multiply load; see [Q16](#seniorqa-11) |
| Larger payloads or logging at debug | Network and CPU rise; response size grew |
| Cold start / not warmed up | Latency high right after the rollout, then improves |
| Dependency change | The slow hop is outside your code; coordinate with that team |

### Rollback or fix forward?

- **Roll back** when users are hurting, the previous version is known good and the rollback is safe (no incompatible migration). Preserve evidence first: a trace, a profile, the query text.
- **Fix forward** when the cause is clear and the fix is small and testable (a missing index, created concurrently), or the rollback is blocked by a schema change.
- Either way, **freeze deploys**, communicate status, and write a short review: why did the pre-production tests not catch it (data volume, missing load test, no canary)?

### Prevention

Canary releases with automatic comparison of latency against the baseline; performance tests with production-like data in the pipeline; query-plan review for new queries; an SLO-based alert tied to deploys; and a dashboard that splits latency by version.

:::say
First I confirm the timing: does the latency jump line up with the deploy marker? If users are hurting and the rollback is safe, I roll back or turn the feature flag off straight away and keep the evidence. Then I narrow: by percentile, because if only p99 moved it is a subset; by endpoint, pod and version; and by hop using traces. In my model the p50 barely moved but the p99 went to about 2.4 seconds, only the search endpoint was slow, and the database hop alone took about 2 seconds, which points to a new query without an index or an N+1 pattern; a slightly slow pod was a red herring that explained little. I would confirm with EXPLAIN ANALYZE, create the index concurrently or fix the query, verify against the SLO, and then add a canary comparison and a production-sized performance test so it does not recur.
:::

## Follow-up questions

:::answer Latency is high but CPU and errors are normal. What next?
Something is waiting rather than working: connection pool or thread pool wait, locks, a slow dependency, DNS, or network. Check pool metrics, trace spans and wait time. High latency with low CPU is the signature of waiting.
:::

:::answer Only p99 is bad. What does that suggest?
A subset: one endpoint, one customer or tenant, one pod, one zone, a particular data shape, GC pauses, or a retry pattern. Slice p99 by each dimension until the subset appears.
:::

:::answer How do you compare old and new versions safely?
Run a canary: send a small share of traffic to v2 and compare the same metrics by version label in real time; have an automatic abort threshold. Without a canary you are comparing different time periods, which are confounded by traffic.
:::

:::answer It only happens at peak traffic. Why might that be?
A resource saturates under load: a connection pool, a database lock, CPU limits, or autoscaling lag. Test with a load test; look at saturation metrics against request rate.
:::

## Practice (answers below)

1. The p50 stayed at 85 ms but the p99 went to 2.4 s. What does that tell you?
2. A trace shows 40 database spans per request after the deploy, 3 before. What is the likely cause?
3. Why roll back before finding the root cause?

:::note Answers
1. Only a subset of requests is slow (an endpoint, tenant, pod or data shape), not everything. 2. An N+1 query pattern introduced by the new code (one query per item instead of one batched query). 3. Users are being harmed now; rolling back stops the harm, and you keep the evidence (traces, profile, query text) to root-cause calmly.
:::

:::recap
- **Confirm timing → protect users → narrow by cohort → narrow by hop → check saturation and dependencies → reproduce → fix.**
- Compare percentiles **before/after**, by **endpoint, version, pod and hop**.
- High latency with low CPU = **waiting** (pools, locks, dependencies).
- Roll back first when it is safe; keep the evidence.
- Prevent with **canaries**, production-sized performance tests and query-plan review.
:::

```quiz
? The p50 is unchanged but the p99 jumped. What is the most likely situation?
+ A subset of requests is slow, such as one endpoint or tenant
- Every request is equally slow
- The network cable is broken
- The dashboard is wrong
! Slice the p99 by endpoint, pod, version and hop.

? Which signal identifies an N+1 problem?
+ A sharp rise in the number of queries per request in the trace
- Higher CPU on the load balancer
- A bigger image
- More DNS records
! One query per item instead of one batched query.

? What should you do first when users are being harmed and the rollback is safe?
+ Roll back or disable the flag, keeping the evidence for later analysis
- Start reading the whole codebase
- Wait for more data
- Blame the network team
! Stop the harm, then root-cause.
```
