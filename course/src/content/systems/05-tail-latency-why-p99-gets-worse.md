---
track: systems
title: "Systems 5: tail latency, why your p99 gets worse every time you add a service"
short: Tail latency
sub: Percentiles, the fan-out arithmetic that makes rare slow calls common, and hedged requests that cut p99 for a small extra cost. Seeded simulation.
---


:::goals
- explain why averages hide the experience of your slowest users
- compute the chance that a fan-out request hits at least one slow call
- explain hedged and tied requests and what they cost
- list practical ways to reduce tail latency
:::

:::note Companion to "The Tail at Scale"
This is the classic paper by Jeff Dean and Luiz Barroso ([resource list](#systems-1)). The lesson reproduces its central arithmetic with a simulation you can run. The measurements are from invented latency numbers (a 10 ms typical call with a 0.5% chance of a 100 to 400 ms outlier), not from a real system.
:::

## 1. Averages lie, percentiles tell the truth

Latency is not one number but a **distribution** with a long tail: most calls are fast, a few are very slow because of garbage collection, a busy neighbour, a cold cache, a retransmitted packet. **p50** is the median, **p99** is the value that 99% of calls beat, **p99.9** is stricter. Averages hide the tail; users feel it. See [Monitoring 4](#monitoring-4) for SLOs written as percentiles, and [AI infrastructure 3](#aiinfra-3) for the same idea applied to model serving.

## 2. The fan-out arithmetic

Suppose one backend has a 0.5% chance of being slow on any call. If a user request calls **one** backend, 0.5% of requests are slow. But a page that calls **n** backends and must wait for all of them is slow if **any** call is slow:

> P(at least one slow call) = 1 - 0.995^n

For n = 100 that is about 39%. A "one in two hundred" problem has become "four requests in ten". Run the simulation:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > tail.py <<'EOF'
import random, math
random.seed(11)
def latency():                       # one backend call: usually ~10 ms, occasionally (0.5% of calls) a slow outlier (GC pause, queue, noisy neighbour)
    base = random.lognormvariate(math.log(10), 0.25)
    return base + (random.uniform(100, 400) if random.random() < 0.005 else 0)
def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(p / 100 * len(xs)))]
R = 40000
single = [latency() for _ in range(R)]
print(f"one backend:        p50 {pct(single, 50):6.1f} ms   p99 {pct(single, 99):6.1f} ms   p99.9 {pct(single, 99.9):6.1f} ms\n")
print("a request that must wait for ALL of n backends (fan-out):")
print(f"{'n':>4} {'p50':>8} {'p99':>8} {'P(at least one slow call)':>27} {'theory 1-0.995^n':>16}")
for n in (1, 10, 50, 100):
    xs = [max(latency() for _ in range(n)) for _ in range(R // 4)]
    slow = sum(x > 100 for x in xs) / len(xs)
    print(f"{n:4d} {pct(xs, 50):8.1f} {pct(xs, 99):8.1f} {slow:27.1%} {1 - 0.995 ** n:16.1%}")
print("\nhedged request: if the first call has not answered after 'delay' ms, send a second copy and take the first answer")
def hedged(delay):
    a = latency()
    if a <= delay: return a, 1
    return min(a, delay + latency()), 2
print(f"{'hedge after':>12} {'p50':>7} {'p99':>7} {'p99.9':>7} {'extra requests':>15}")
print(f"{'never':>12} {pct(single, 50):7.1f} {pct(single, 99):7.1f} {pct(single, 99.9):7.1f} {'0.0%':>15}")
for delay in (30, 20, 14):
    res = [hedged(delay) for _ in range(R)]
    xs = [r[0] for r in res]; extra = sum(r[1] - 1 for r in res) / R
    print(f"{delay:9d} ms {pct(xs, 50):7.1f} {pct(xs, 99):7.1f} {pct(xs, 99.9):7.1f} {extra:15.1%}")
EOF
python3 tail.py
```


The first table is the key. With one backend the p99 is a calm 19 ms: the slow 0.5% lies beyond it. With 10 backends the p99 jumps to over 300 ms, because 4.8% of requests now hit a slow call, which is more than the 1% that p99 allows. With 100 backends 39% of requests are slow. The measured probabilities match the formula. This is why microservice architectures, search shards and scatter-gather queries ([Lesson 9](#systems-9)) all need tail-latency discipline: **the more components a request touches, the more the slowest component decides.**

## 3. Hedged requests: spend a little to cut the tail

If the first request has not answered after a short delay, send a **second copy** to another replica and use whichever answers first. Most calls finish before the delay, so few extra requests are sent. The second table shows the effect on the far tail (p99.9): hedging after 30 ms cuts it from about 340 ms to about 43 ms for only 0.5% extra requests; hedging after 20 ms reaches about 32 ms for 0.8%; hedging after 14 ms reaches about 26 ms but costs 9.5% extra load, which is rarely worth it.

Rules for doing it safely:

- Hedge only **idempotent** operations ([Lesson 7](#systems-7)): the request may run twice.
- Pick the delay near the **p95** of the normal latency, so only the slow few are duplicated.
- Cap the extra load (a **hedging budget**) so that, when the whole system is slow, hedging does not make it worse. That is the retry-storm problem of [Lesson 6](#systems-6).
- **Tied requests** go further: send to two replicas at once and let each cancel the other as soon as one starts work.

## 4. Other ways to shrink the tail

- **Timeouts and deadlines:** give up on a slow call and use a default or a partial result.
- **Smaller work units:** a 1 ms task queues behind a 500 ms task less often. Split big jobs.
- **Isolate and prioritise:** keep a slow batch workload off the replicas that serve interactive traffic.
- **Cache and pre-warm:** cold caches and cold JVMs create outliers.
- **Good enough results:** return what you have after a deadline (a search that skips the slowest shard).
- **Remove sources of jitter:** garbage-collection pauses, background compactions, noisy neighbours, retransmits.
- **Measure per hop:** distributed tracing tells you which service owns the tail ([Monitoring 4](#monitoring-4)).

## Common misconceptions

- "If each service meets a 99% target, the whole request meets 99%." The product of the probabilities is lower: 0.99^10 is about 90%.
- "Average latency improved, so users are happier." The slowest 1% may have got worse.
- "Hedging doubles the load." With a sensible delay it adds about a percent.

## Practice (answers below)

1. A page calls 20 services, each slow 0.5% of the time. About how many page loads hit at least one slow call?
2. Why must hedged operations be idempotent?
3. Your p50 is 12 ms and p99 is 900 ms. Name three things you would check.

:::recap
- Latency has a **tail**; report **percentiles**, not averages.
- Fan-out makes rare slow calls common: **1 - (1-p)^n**.
- **Hedged requests** (after about p95) cut p99 for a small extra load, only for idempotent calls and with a budget.
- Reduce the tail with deadlines, smaller tasks, isolation, warm caches and per-hop tracing.
:::

:::note Answers
1. 1 - 0.995^20 is about 9.5%. 2. The same operation may be executed twice, and a duplicate must not change the result (for example, charge twice). 3. Garbage-collection or compaction pauses and noisy neighbours, queueing or saturation on one replica, cold caches or slow outlier dependencies; then use tracing to find which hop owns the slow requests.
:::

```quiz
? A request calls 50 backends, each slow 1% of the time, and waits for all of them. About what share of requests see a slow call?
+ About 40%
- About 1%
- About 5%
- About 90%
! 1 - 0.99^50 is about 0.39.

? What does a hedged request do?
+ Sends a second copy after a short delay and uses whichever answer arrives first
- Retries after an error
- Compresses the response
- Caches the answer
! It trades a small amount of extra load for a much shorter tail.

? Why is p99 a better target than the average for user experience?
+ The average hides the slowest requests that real users still experience
- Averages are harder to compute
- p99 is always smaller
- It is not better
! Percentiles describe the experience of the slow minority; averages hide it.
```
