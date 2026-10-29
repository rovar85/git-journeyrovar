---
track: systems
title: "Systems 6: timeouts, retries, backoff and jitter"
short: Retries done right
sub: Why naive retries turn an outage into a bigger one, and how backoff, jitter, a retry budget and deadlines keep failure contained. A runnable thundering-herd simulation.
---


:::goals
- explain the danger of retrying without limits (a retry storm)
- write the rules for a safe retry: what to retry, how long to wait, when to stop
- show why exponential backoff without jitter still produces synchronised waves
- use retry budgets, deadlines and circuit breakers
:::

:::note Companion to the Amazon Builders' Library article
The article on [timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) is the standard reference ([resource list](#systems-1)). The simulation below is a toy, written for this lesson, to make its lessons visible. For a troubleshooting story on the same theme see [Interview scenarios 9](#scenarios-9).
:::

## 1. Why retry at all, and why it is dangerous

Networks and servers fail briefly all the time, so retrying a failed call is usually right. The danger is **amplification**: if a service is slow because it is overloaded and every client retries immediately, the load goes **up** exactly when the service can least afford it. Overload causes timeouts, timeouts cause retries, retries cause more overload: a **retry storm**, and the service may not recover even after the original problem ends (a *metastable* failure).

## 2. The rules of a safe retry

1. **Set a timeout on every call.** Without one a slow server holds your threads forever. Choose it from the downstream's real latency (a bit above its p99.9), not from a guess.
2. **Retry only what is safe and transient:** timeouts, connection resets, `503`, throttling errors. Never retry a `400` (the request is wrong) or a `404`. Retry **writes only if they are idempotent** ([Lesson 7](#systems-7)).
3. **Limit the attempts:** two or three is common.
4. **Back off:** wait longer after each failure, typically **exponentially** (1, 2, 4, 8 seconds), with a cap.
5. **Add jitter:** randomise the wait so clients do not retry in step.
6. **Retry at one layer only.** If the browser, the gateway and three services each retry 3 times, one failure becomes 3^5 = 243 attempts at the bottom.
7. **Use a retry budget:** allow retries only as a small fraction (say 10%) of successful traffic.
8. **Respect deadlines:** pass the caller's remaining time budget down; do not retry when the caller has already given up.
9. **Stop when the dependency is clearly down:** a **circuit breaker** opens after repeated failures and fails fast for a while, then lets a trial request through.

## 3. A simulation you can run

The model: a server handles 130 requests per tick and wastes effort when overloaded (it serves only 85% of capacity if more arrive than it can take). Clients that fail retry according to a policy, up to 7 attempts. Two experiments:

**A. a thundering herd:** 2,000 clients start at the same moment.
**B. an outage:** normal load of 100 per tick, the server is down for 6 ticks, then returns.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > retry.py <<'EOF'
import random
CAP = 130                                   # the server can serve 130 requests per tick
MAXTRY = 7
def run(policy, clients, arrivals_per_tick, ticks, outage=(), penalty=0.85, seed=2):
    """Each tick the server serves up to CAP requests (fewer if overloaded). Unserved requests time out and may retry."""
    random.seed(seed)
    pending, sent, done, gave_up, nid, tokens = {}, [], 0, 0, 0, 0.0
    first = clients                          # a herd: this many clients start at tick 0
    for t in range(ticks):
        batch = pending.pop(t, [])
        n_new = first if t == 0 else arrivals_per_tick
        batch += [(nid + i, 1) for i in range(n_new)]; nid += n_new
        sent.append(len(batch))
        cap = 0 if t in outage else (CAP if len(batch) <= CAP else int(CAP * penalty))
        random.shuffle(batch)
        served, failed = batch[:cap], batch[cap:]
        done += len(served)
        tokens = min(20, tokens + 0.1 * len(served))
        for rid, attempt in failed:
            if attempt >= MAXTRY: gave_up += 1; continue
            if policy == "budget":
                if tokens < 1: gave_up += 1; continue
                tokens -= 1
            wait = {"immediate": 1, "budget": 1, "exp": 2 ** (attempt - 1), "jitter": random.randint(1, 2 ** (attempt - 1))}[policy]
            if policy in ("exp", "jitter"): wait = min(wait, 32)         # a cap on the backoff
            pending.setdefault(t + wait, []).append((rid, attempt + 1))
    finish = max([t for t, s in enumerate(sent) if s], default=0)
    return sum(sent), max(sent), sum(1 for s in sent if s > CAP), done, nid, gave_up

print("A. Thundering herd: 2000 clients start at the same moment against a server that handles 130 per tick")
print(f"{'policy':>10} {'requests sent':>14} {'peak per tick':>14} {'ticks above capacity':>21} {'succeeded':>10} {'gave up':>8}")
for pol in ("immediate", "exp", "jitter"):
    total, peak, over, ok, n, gu = run(pol, 2000, 0, 200)
    print(f"{pol:>10} {total:14d} {peak:14d} {over:21d} {ok:10d} {gu:8d}")
print("\nB. Normal load of 100 per tick, the server is down for ticks 10 to 15, then comes back")
print(f"{'policy':>10} {'requests sent':>14} {'peak per tick':>14} {'overloaded ticks':>17} {'succeeded':>10} {'gave up':>8}")
for pol in ("immediate", "exp", "jitter", "budget"):
    total, peak, over, ok, n, gu = run(pol, 0, 100, 80, outage=range(10, 16))
    print(f"{pol:>10} {total:14d} {peak:14d} {over:17d} {ok:10d} {gu:8d}   (of {n} requests)")
EOF
python3 retry.py
```


How to read it:

- **A:** `immediate` and `exp` (exponential backoff **without** jitter) behave **identically**: every client waits the same 1, 2, 4, 8 ticks, so the whole herd comes back as one synchronised wave each time, finds the server overloaded again, and fails. After 7 attempts 1,230 of 2,000 clients gave up. With **jitter**, the same clients spread over many ticks, the server is never swamped, and 1,999 of 2,000 succeed. **Backoff alone only delays the stampede; jitter breaks it up.**
- **B:** immediate retries produce a peak of 700 requests per tick against a server that handles 130. Backoff lowers the peak. In this toy, `exp` and `jitter` look similar (the toy's arrivals are already spread out), which is a reminder that **the value of jitter appears when clients are synchronised**, as in A, after a deploy, a restart or a failover.
- **budget:** retries are allowed only from earned tokens (0.1 per success). The peak never exceeds 120 requests per tick and the server never overloads, at the price of 600 requests that gave up. **A budget bounds the damage; backoff and jitter decide how nicely retries are spaced.**

This is a model, not a measurement of a real system: the point is the **shape** of the behaviour.

## 4. Choosing the numbers

- **Timeout** a little above the downstream's p99.9, and **shorter than the caller's own timeout** (otherwise the caller gives up first and your retry is wasted).
- **Backoff** `min(cap, base * 2^attempt)`; **full jitter** picks a random value between 0 and that.
- **Attempts**: 2 to 3 inside a request path; more for background jobs, with a longer cap.
- Queue consumers should use a **dead-letter queue** after N failures rather than retrying forever.

## 5. Related patterns

- **Load shedding:** a server under overload should reject cheap and early (return `503` quickly) so it keeps serving some requests. Clients must treat that as a signal to back off.
- **Bulkheads:** separate thread pools or connection pools per dependency, so one slow dependency cannot use all your threads.
- **Rate limiting** and **token buckets** protect a service from a single noisy client.

## Common misconceptions

- "Exponential backoff solves retry storms." Not without jitter and not without a limit on total retries.
- "More retries mean more reliability." Past a point they reduce it.
- "Retry on every error." Retrying a bad request just repeats the failure.

## Practice (answers below)

1. A request path has a browser, an API gateway and a service. Each retries 3 times. Worst case, how many calls reach the service for one click?
2. Write a function `backoff(attempt, base=0.1, cap=10)` that returns a full-jitter delay.
3. Why should a client's timeout be longer than the server's own downstream timeout?

:::recap
- **Retries amplify load**; unlimited retries turn an overload into a storm.
- Safe retry = **timeout, transient errors only, few attempts, exponential backoff, jitter, one layer, a budget, deadlines**.
- **Jitter** breaks synchronised waves; a **budget** bounds the total; a **circuit breaker** stops hammering a dead dependency.
- Retrying writes needs **idempotency** ([next lesson](#systems-7)).
:::

:::note Answers
1. Each layer multiplies: 4 attempts per layer (1 + 3 retries), three layers, so up to 4^3 = 64 calls reach the service. 2. `import random; def backoff(attempt, base=0.1, cap=10): return random.uniform(0, min(cap, base * 2 ** attempt))`. 3. If the caller's timeout is shorter, it gives up and retries while the server is still working on the first attempt, doubling the load for nothing; the callee's budget must fit inside the caller's.
:::

```quiz
? Why does exponential backoff without jitter still cause trouble after a mass failure?
+ All clients wait the same times, so their retries arrive together in waves
- It makes waits too short
- It retries too rarely
- It cannot be capped
! Synchronised retries recreate the same overload at each step; jitter spreads them out.

? Which errors should a client normally retry?
+ Timeouts, connection resets and temporary server errors such as 503
- 400 Bad Request
- 404 Not Found
- Validation failures
! Retry transient failures only; a wrong request will fail every time.

? What does a retry budget do?
+ Limits retries to a small fraction of normal traffic so they cannot swamp a struggling service
- Increases the number of attempts
- Removes the need for timeouts
- Makes retries immediate
! A budget bounds the extra load that retries can add.
```
