---
track: sysdesign
title: "Reliability patterns and anti-patterns"
short: Reliability
sub: How availability adds up across a chain of services, redundancy and its limits, the protective patterns (timeouts, retries, circuit breakers, bulkheads, health checks, graceful degradation) and the anti-patterns that cause outages.
---

:::goals
- compute the availability of a chain and of redundant copies
- name the protective patterns and what each prevents
- recognise the common anti-patterns
- design for graceful degradation
:::

## Availability adds up, and down

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > rel.py <<'EOF'
# Availability arithmetic: parts in a chain multiply their downtime; redundant copies multiply their chances of all failing.
def down_minutes(a): return (1 - a) * 365 * 24 * 60
def chain(*parts):
    a = 1.0
    for p in parts: a *= p
    return a
def parallel(p, copies):
    return 1 - (1 - p) ** copies
print(f"{'design':64} {'availability':>12} {'down per year':>14}")
rows = [("one server, 99.5%", 0.995),
        ("load balancer 99.99% -> app 99.5% -> database 99.9% (a chain)", chain(0.9999, 0.995, 0.999)),
        ("the same chain, with 3 app servers behind the balancer", chain(0.9999, parallel(0.995, 3), 0.999)),
        ("... and a database standby with automatic failover (2 copies)", chain(0.9999, parallel(0.995, 3), parallel(0.999, 2))),
        ("... plus 2 more services called in sequence, each 99.9%", chain(0.9999, parallel(0.995, 3), parallel(0.999, 2), 0.999, 0.999))]
for name, a in rows: print(f"{name:64} {a:>11.3%} {down_minutes(a):>10,.0f} min")
print("\nEvery service you call synchronously multiplies in; redundancy only helps if failures are independent.")
for target in (0.99, 0.999, 0.9999, 0.99999): print(f"   {target:.3%} allows {down_minutes(target):,.0f} minutes of downtime a year ({down_minutes(target) / 12:,.1f} a month)")
EOF
python3 rel.py
```

- A chain is only as available as the **product** of its parts: balancer, app and database together give 99.39%, worse than the app alone. Each synchronous dependency you add multiplies in another factor below 1.
- **Redundancy** works by multiplying the chances that *all* copies fail: three app servers turn 99.5% into about 99.9999% for that layer, and the whole chain rises to 99.89%. A standby database lifts it to 99.99%: **53 minutes a year**.
- Two more services called in sequence pull it back down to 99.79%. This is why architects reduce synchronous calls on the critical path, and why redundancy only helps when copies fail **independently** (different zones, not the same rack, not the same bad deployment).

## The protective patterns

| Pattern | Prevents | Where it is explained |
|---|---|---|
| **Timeouts** on every remote call | threads waiting forever on a slow dependency | [Q16](#seniorqa-11) |
| **Retries with back-off, jitter and a budget** | giving up on brief failures, without a retry storm | [Systems 6](#systems-6) |
| **Idempotency keys** | double charges when a retry repeats work | [Systems 7](#systems-7) |
| **Circuit breaker** | hammering a failing dependency; fail fast instead | [Q16](#seniorqa-11) |
| **Bulkhead** | one slow dependency taking all the threads | [Q16](#seniorqa-11) |
| **Health endpoints** (liveness, readiness) | traffic sent to instances that cannot serve | [Q15](#seniorqa-10) |
| **Graceful degradation** | the whole page failing because one widget's service is down | below |
| **Load shedding** | collapse under overload; drop low-priority work first | [Lesson 6](#sysdesign-6) |

**Graceful degradation** means deciding in advance what the product does without each dependency: show the product page without recommendations, serve the cached price, accept the order and send the email later. Write the list down; it is the most useful hour of a design review.

## Anti-patterns that cause outages

| Anti-pattern | Symptom | Fix |
|---|---|---|
| **Chatty I/O** | hundreds of small calls per request | batch, or fetch together |
| **N+1 queries** | one query per item in a list | one query with a join or `IN` ([Q19](#seniorqa-12)) |
| **No timeouts** | stuck threads, then a cascade | a timeout on every call |
| **Retry storms** | a recovering service knocked down again | back-off, jitter, a retry budget |
| **Busy database** | business logic in huge queries or triggers on the hot path | move work to the application or a queue |
| **Synchronous chains** | availability and latency multiply down | queues, caches, fewer hops |
| **Single point of failure** | one box whose loss stops everything | redundancy in independent zones |
| **Unbounded queues or caches** | memory runs out | limits and eviction |

## How do you make a system more reliable?

:::say
I remove single points of failure with redundant copies in independent zones, and I shorten the synchronous critical path, because availability multiplies across a chain. Every remote call gets a timeout, retries with back-off and a budget, and an idempotency key where it changes data; circuit breakers and bulkheads stop one failure spreading. I decide in advance how the product degrades without each dependency, and I test it with failure drills.
:::

:::recap
- Availability **multiplies** along a chain; redundancy multiplies the chance that **all** copies fail.
- Timeouts, retries with budgets, idempotency, circuit breakers and bulkheads stop failures spreading.
- Plan **graceful degradation** for each dependency.
- Watch for chatty I/O, N+1 queries, missing timeouts, retry storms and single points of failure.
:::

```quiz
? Three services in a chain are each 99.9% available. Roughly what is the chain's availability?
+ 99.7%
- 99.9%
- 99.99%
- 97%
! 0.999 cubed is about 0.997.

? Why do redundant copies in the same rack help less than in different zones?
+ They tend to fail together, so failures are not independent
- Racks are slower
- Zones are cheaper
- They help equally
! Redundancy assumes independent failures.

? What is graceful degradation?
+ Keeping the core function working when a non-critical dependency fails
- Slowly turning servers off
- Lowering prices
- Removing features permanently
! Decide in advance what each page does without each dependency.
```
