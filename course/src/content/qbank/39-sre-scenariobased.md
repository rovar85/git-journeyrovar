---
track: qbank
title: "Monitoring, observability, SRE and scale design: Scenario-based questions"
short: SRE scenario
sub: 7 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## "Production is down. Users are impacted. What will you do?"

<!-- source: 08 Q25 -->

*Also asked as:* How do you debug a production issue? What is your general troubleshooting approach?

:::note In simple words
When a patient arrives bleeding, the doctor first stops the bleeding, then finds the cause. You restore service first, investigate deeply later.
:::

1. **Acknowledge and declare** - take ownership, open an incident channel/bridge, assign roles: Incident Commander, Tech lead, Comms. Set severity.
2. **Assess impact** - which users, regions, features? Check SLO dashboards, error rate, synthetic checks, status of dependencies (cloud status page).
3. **Ask "what changed?"** - recent deploys, config changes, infra changes, feature flags, certificate expiry, traffic spike. Most incidents follow a change.
4. **Mitigate first** - rollback the last deploy, disable a feature flag, fail over, scale up, restart a stuck component, block abusive traffic. Stop the bleeding before root cause.
5. **Diagnose in layers** - edge (DNS, CDN, LB) -> ingress -> service -> dependencies (DB, cache, queue) using metrics, then traces, then logs.
6. **Communicate** regularly - every 15-30 minutes to stakeholders and status page, even if "still investigating".
7. **Verify recovery** - metrics back to normal, synthetic checks green, users confirm.
8. **Postmortem** - blameless RCA, action items with owners and dates.

**General troubleshooting methodology (the 10 rules I follow for any issue):**
1. **Check logs first** - application, pod events, system logs; the error message often names the cause.
2. **Trace the request flow** - user -> DNS -> CDN/LB -> ingress -> service -> pod -> DB/cache; find the first hop that fails.
3. **Process of elimination** - test one layer at a time (curl the service directly, then the pod, then the DB) and cross off what works.
4. **Infra vs app** - are all services affected (likely infra: node, network, DNS) or only one (likely app: code, config)?
5. **Validate external dependencies** - third-party APIs, cloud provider status, certificates, DNS, managed DB/cache.
6. **Check resource limits** - CPU throttling, OOMKilled, disk full, connection pools, file descriptors, quotas.
7. **Reproduce in a test environment** - confirm the cause and test the fix safely before touching production.
8. **Keep a known-issues doc / runbook** - check it first, and add every new issue and fix to it afterwards.
9. **Use health checks** - readiness/liveness probes, LB target health and synthetic checks show where it breaks.
10. **Know when to escalate** - if impact is growing or the issue is outside your area, pull in the owner early; time-box solo debugging.

**Example:** First 5 commands in a Kubernetes incident:
```bash
kubectl get pods -A | grep -v Running
kubectl get events -A --sort-by=.lastTimestamp | tail -30
kubectl rollout history deploy/checkout -n prod
kubectl logs deploy/checkout -n prod --since=15m | grep -i error | tail
kubectl rollout undo deploy/checkout -n prod     # if the last deploy is the cause
```

:::say
I declare an incident, set up roles and a channel, and quickly assess the blast radius. I check what changed recently and mitigate first - usually a rollback, feature flag or failover - then diagnose layer by layer with metrics, traces and logs, keep stakeholders updated on a fixed cadence, confirm recovery, and follow up with a blameless postmortem.
:::

## Monitoring shows increased response time, but infrastructure (CPU, memory, pods) looks healthy. How would you investigate?

<!-- source: 08 Q26 -->

:::note In simple words
The kitchen staff are not tired and the stoves are working, but food is still late. Maybe the delivery boy is stuck in traffic, or they are waiting for a supplier - the problem is outside the kitchen.
:::

Healthy CPU/memory usually means the service is **waiting**, not working. Look for:
1. **Where is the time spent?** - open a slow trace: which span is slow - DB, cache, external API, another service?
2. **Dependencies** - DB slow queries, lock waits, connection pool exhaustion (threads waiting for a connection), Redis latency, third-party API latency.
3. **Saturation that is not CPU** - thread pools, connection pools, file descriptors, network bandwidth, disk IOPS/EBS burst credits, CPU throttling from low limits (`container_cpu_cfs_throttled_seconds_total`) even when node CPU looks fine.
4. **Scope it** - one endpoint, region, AZ, customer or version? Compare p50 vs p99 (only tail = contention/GC/noisy neighbor).
5. **Network** - DNS lookup delays, TLS handshakes, cross-AZ hops, retries/timeouts, load balancer queueing.
6. **Recent changes** - deploys, config, a new feature causing N+1 queries, bigger payloads.
7. **GC pauses** in JVM/Node apps.
8. **Time pattern and traffic level** - if the slowness is periodic or happens off-peak, suspect scheduled work (cron, backups, snapshots, DB maintenance) or cold starts after scale-down (empty caches, closed connections, cold Lambdas). At low traffic a few slow requests can distort p99, so check the request count before trusting the percentile.

**Example:**
```
# Is the pod CPU-throttled even though node CPU is fine?
rate(container_cpu_cfs_throttled_periods_total{pod=~"orders.*"}[5m])
/ rate(container_cpu_cfs_periods_total{pod=~"orders.*"}[5m])

# p99 by endpoint to scope the problem
histogram_quantile(0.99, sum by (le, route)
  (rate(http_request_duration_seconds_bucket{app="orders"}[5m])))
```

:::say
If CPU and memory are fine, the service is usually waiting on something, so I open slow traces to see which dependency or hop the time is spent in. I check database slow queries and connection pools, cache and third-party latency, CPU throttling from limits, thread pools, DNS and network, scope it by endpoint or region, and correlate it with recent changes.
:::

## It is 2 AM. Users report the app is slow. There are no errors and no logs. What is your first move?

<!-- source: 08 Q27 -->

*Also asked as:* After a deploy, latency spikes for 30% of users - no errors, no logs. What now? You get paged at 2 AM for high latency across services - what is your move? (tests calm under pressure)

:::note In simple words
A customer calls at night saying the shop is slow, but the cashier's notebook is empty. Either the customers never reached the counter, or the notebook itself stopped working - so first check the door and the notebook, then the kitchen.
:::

1. **Confirm and scope** - synthetic checks and real-user monitoring (RUM): is it real, all users or some, one region/endpoint? Compare latency **p50 vs p95/p99** against the error rate (slow with zero errors = something is waiting, not crashing).
2. **Golden signals / RED per service** - rate, errors, duration, saturation. Which service's latency moved first?
3. **Traces** - open a slow trace (or a latency exemplar) and find the slow span.
4. **Dependencies** - DB slow queries, locks, connection pool saturation, cache hit ratio drop, third-party API latency.
5. **What runs at 2 AM?** - backups, cron jobs, batch ETL, DB autovacuum, log rotation, EBS/RDS snapshots. Night-time slowness is very often scheduled work.
6. **Noisy neighbours and GC** - another workload on the same node or DB, burst credits exhausted, long GC pauses.
7. **"No logs" is itself a clue:**
- the **log pipeline may be down** (agent crashed, Loki/ELK ingestion stuck, disk full), so check whether any service is logging right now; or
- **requests are not reaching the app at all**, so look before the app: load balancer/CDN metrics and queueing, DNS resolution, TLS handshake or certificate problems.
8. **Mitigate first** - scale out, fail over, pause or reschedule the batch job, then confirm latency recovers.
9. **Communicate** - short update to stakeholders or the status page, then a proper RCA the next day.

**The "paged at 2 AM, latency high across many services" variant (calm under pressure):**
- **Acknowledge the page** right away so nobody else is left wondering, then **set severity** based on user impact.
- **Open an incident channel** and write down what you see and when; a calm, written process beats panicked clicking.
- **Many services slow at once = look for one shared dependency** - a database, DNS/CoreDNS, the network or a NAT/cross-AZ path, a shared cache (Redis), the ingress/load balancer, or a noisy node pool where all these pods run together.
- **Mitigate before root-causing** - fail over, scale out, cordon the bad nodes, pause the batch job.
- **Post updates on a fixed cadence** (for example every 15-30 minutes), even if it is only "still investigating".
- **Escalate early** to the owner of the shared dependency; escalating early is a strength, not a weakness.

**The post-deploy variant (30% of users slow after a release):**
- **Correlate with the deploy timestamp** - Grafana deploy annotations make this obvious on the latency graph.
- **30% is a strong clue** - it usually means a subset: canary pods on the new version, one AZ, one node group, or one ingress path/route.
- **Compare latency by label** - `version`, `pod`, `zone`, `route`; open trace exemplars from the slow series to find the slow span in the new code (new query, missing index, bigger payload, lower resource limits causing CPU throttling).
- **Roll back first if the SLO is burning** - `kubectl rollout undo` / `helm rollback`, or shift canary weight to 0, then debug the new version off the critical path.

**Example:**
```
# Tail-only or everyone? Compare percentiles
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
# Post-deploy: p99 split by version (old vs new pods)
histogram_quantile(0.99, sum by (le, version)
  (rate(http_request_duration_seconds_bucket{app="checkout"}[5m])))
# Are logs flowing at all? (LogQL)
sum by (namespace) (count_over_time({namespace=~".+"}[5m]))
kubectl get cronjobs -A          # anything scheduled at 2 AM?
```

:::say
First I confirm and scope it with synthetic checks, RUM and p50 versus p99, then follow RED metrics and traces to the slow span, and check dependencies and anything scheduled at that hour like backups, ETL or vacuum. No logs is itself a clue - either the log pipeline is broken or requests are not reaching the app, so I check the LB, CDN, DNS and TLS. If it started after a deploy and hits about 30% of users, I compare latency by version, pod and AZ and roll back first if the SLO is burning.
:::

## Application metrics are not being scraped by Prometheus. What could cause it, and how do you validate scraping?

<!-- source: 08 Q28 -->

:::note In simple words
The meter reader is not recording your house. Either he does not have your address, he is going to the wrong door, the gate is locked, or there is no meter on the wall. Check each one in order.
:::

Common causes:
- **Target not discovered** - ServiceMonitor labels do not match the Prometheus `serviceMonitorSelector` (for example a missing `release: kps` label), or its `namespaceSelector` does not include the app's namespace.
- **Selector mismatch** - the ServiceMonitor `selector.matchLabels` does not match the Service's labels.
- **Port name mismatch** - the ServiceMonitor `port:` must be the named port in the Service (for example `http-metrics`), not the number.
- **Wrong path or scheme** - the app serves `/actuator/prometheus` or HTTPS, but the scrape uses `/metrics` over HTTP -> `server returned HTTP status 404`.
- **Auth** - `401/403` because the endpoint needs a token or basic auth.
- **Network** - a NetworkPolicy blocks the monitoring namespace, or the app binds to `127.0.0.1` so it is unreachable from outside the pod.
- **App does not expose metrics** at all (no client library or exporter).
- **Prometheus RBAC** - no permission to list/watch endpoints or pods in that namespace.
- **relabel_configs** dropping the target, or `scrape_timeout` too low -> `context deadline exceeded`.

How to validate, in order:
1. Prometheus UI -> **Status -> Service Discovery**: is the target discovered or dropped?
2. **Status -> Targets**: is it up or down, and what is the error text?
3. Query `up{job="orders"}` - 1 = scraped OK, 0 = scrape failing, no result = not discovered.
4. Test the endpoint directly from outside the pod.

**Example:**
```bash
kubectl -n prod port-forward svc/orders 8080:8080
curl -s localhost:8080/metrics | head          # does the app expose metrics?
kubectl -n prod get svc orders -o yaml | grep -A5 ports    # check the port NAME
kubectl -n monitoring get prometheus -o yaml | grep -A3 serviceMonitorSelector
kubectl -n prod get servicemonitor orders -o yaml
# PromQL
up{job="orders"}
```

:::say
I check the Prometheus Service Discovery and Targets pages and the up metric to see whether the target is undiscovered or failing, and read the exact error. The usual causes are ServiceMonitor labels or namespace not matching the Prometheus selector, a port-name mismatch, a wrong path or scheme, auth errors, a NetworkPolicy, the app binding to localhost, RBAC or relabeling. I confirm the fix with a port-forward and curl on /metrics, then check that up returns 1.
:::

## Playback failures spike for only 3% of users in the APAC region. CPU, memory and pods look fine. Walk through your triage plan.

<!-- source: 08 Q29 -->

:::note In simple words
If only some customers in one city complain about a shop, the shop itself is probably fine - the problem is one road, one delivery van, or one type of customer.
:::

A small, regional slice means **something shared by that 3%**, not a general capacity issue.
1. **Confirm and size it** - error rate and play-start failures by region, ISP, CDN edge/PoP, device, OS, app version, content ID, DRM type. Real-user monitoring (RUM) / client telemetry is key because servers may look fine.
2. **Find the common factor** - one CDN PoP, one ISP, one AZ, one app version, one codec, one content package?
3. **Edge and network** - CDN edge health and cache hit ratio in APAC, origin errors from that PoP, TLS certificate chain issues on older devices, DNS resolution for that ISP, BGP/routing issues.
4. **Application paths** - DRM/license server errors, entitlement/geo-blocking rules, token expiry or clock skew, a canary or feature flag rolled out only to APAC or to 3% of users (a 3% canary is a big clue).
5. **Recent changes** - CDN config, new app release on one platform, certificate rotation.
6. **Mitigate** - route that region/ISP to another CDN or PoP, roll back the canary/flag, purge bad cache objects.
7. **Follow up** - add alerts sliced by region/ISP/version so a 3% issue is not hidden inside a global average.

:::say
When only 3% of one region fails while servers look healthy, I look for what those users share, slicing client telemetry by CDN PoP, ISP, device, app version, content and DRM type. Typical culprits are one CDN edge, an ISP routing or DNS problem, a certificate issue on old devices, or a canary rolled out to a small percentage, and I mitigate by shifting CDN or rolling back, then add region and version-sliced alerts.
:::

## Your Kafka ingestion pipeline lags by 2 minutes during a traffic surge. Producers are fine, consumers are idle. What is your debug path?

<!-- source: 08 Q30 -->

:::note In simple words
Parcels are piling up at the warehouse, and the delivery boys are sitting idle. So they are either not assigned any parcels, cannot reach the parcels, or are waiting for permission - the problem is in the assignment, not the workload.
:::

"Lag high + consumers idle" means consumers are not actually fetching or processing. Check in order:
1. **Consumer group state** - is it stuck **rebalancing**? Frequent rebalances (members joining/leaving, `max.poll.interval.ms` exceeded, pod restarts, HPA scaling consumers up and down) stop all consumption.
2. **Partition assignment** - more consumers than partitions leaves extras idle; all lag may be on a few **hot partitions** (bad key choice) assigned to one consumer while others sit idle.
3. **Consumer blocked downstream** - waiting on DB/Redis/API calls, so the thread is blocked (looks idle on CPU) - check traces and connection pools.
4. **Fetch configuration** - `fetch.min.bytes`, `fetch.max.wait.ms`, `max.poll.records` too small; consumer paused due to backpressure.
5. **Broker side** - broker CPU/disk/network, under-replicated partitions, leader imbalance, throttling quotas, broker disk full.
6. **Connectivity/auth** - consumers cannot reach new partition leaders, ACL/cert errors in consumer logs.
7. **Autoscaling** - scale consumers on lag with KEDA, but only up to the partition count; add partitions carefully (changes key ordering).

**Example:**
```
kafka-consumer-groups.sh --bootstrap-server $BROKER --describe --group ingest-svc
# Shows per-partition CURRENT-OFFSET, LOG-END-OFFSET, LAG, CONSUMER-ID
# Empty CONSUMER-ID with high LAG  -> partition not assigned
# All lag on 2 partitions          -> hot key / skew
kafka-consumer-groups.sh --bootstrap-server $BROKER --describe --group ingest-svc --state
# State: PreparingRebalance / CompletingRebalance -> rebalance storm
```

:::say
Idle consumers with growing lag tells me they are not fetching, so I describe the consumer group to check for rebalance storms, unassigned partitions, hot partitions from key skew, and more consumers than partitions. Then I check whether consumers are blocked on a downstream dependency, their fetch and poll settings, and broker health, and I scale consumers on lag with KEDA only up to the partition count.
:::

## Sudden tail latency on the Redis-based stream session store during a Champions League match. How do you find and fix the bottleneck?

<!-- source: 08 Q31 -->

:::note In simple words
Redis is one very fast cashier who serves one customer at a time. If one customer asks to count every coin in the shop, everyone behind them waits - that is tail latency.
:::

Redis executes commands on a **single thread**, so one slow command or hot key hurts everyone's p99.
1. **Confirm it is Redis** - traces show slow Redis spans; compare client-side vs server-side latency (network vs Redis itself).
2. **Slow commands** - `SLOWLOG GET`; look for `KEYS *`, large `HGETALL`, `SMEMBERS`, `LRANGE 0 -1`, big `DEL` on huge keys, Lua scripts.
3. **Hot keys / big keys** - `redis-cli --hotkeys` (with LFU policy) and `--bigkeys`; one session key or counter hammered by millions.
4. **Resources** - CPU of the main thread near 100%, memory near `maxmemory` causing evictions, network bandwidth limit of the node, connection count spikes (new connections are expensive - use pooling).
5. **Persistence and replication** - RDB fork / AOF rewrite pauses, replica full resync.
6. **Client side** - connection pool too small, timeouts and retries causing retry storms.

Fixes: replace `KEYS` with `SCAN`, split big keys, cache hot keys locally in the app for a second, use pipelining, spread keys with Redis Cluster/more shards, read replicas for read-heavy data, bigger node or more network bandwidth, schedule persistence off the replicas, use `UNLINK` instead of `DEL`.

**Example:**
```
redis-cli -h $HOST --latency-history
redis-cli -h $HOST SLOWLOG GET 20
redis-cli -h $HOST --bigkeys
redis-cli -h $HOST INFO stats | grep -E "evicted_keys|instantaneous_ops"
redis-cli -h $HOST INFO clients | grep connected_clients
```

:::say
Because Redis is single-threaded, I look for anything blocking that thread: slow commands in SLOWLOG, big keys, hot keys, fork pauses from persistence, evictions near maxmemory, and network or connection limits. Fixes are replacing KEYS with SCAN, splitting big keys, local caching of hot keys, pipelining and connection pooling, and sharding with Redis Cluster or read replicas.
:::
