---
track: sysdesign
title: "Rate limiting and API gateways"
short: Rate limits, gateways
sub: Why limit request rates, how fixed windows, sliding logs and token buckets differ on the same burst, where to enforce limits, and what an API gateway and a backend-for-frontend do.
---

:::goals
- explain why and where to rate-limit
- compare fixed window, sliding window and token bucket
- answer limited clients correctly
- describe the jobs of an API gateway
:::

## Why limit

Rate limits protect a service from overload, from abuse (password guessing, scraping), and from one noisy customer taking capacity from everyone else. They also enforce paid plans ("1,000 calls a day on the free tier").

## Three algorithms on one burst

The limit is 10 requests per second per client. The client sends 20 requests at the end of second 0 and 20 at the start of second 1: a burst that straddles the boundary.

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > ratelimit.py <<'EOF'
# Three rate limiters, the same traffic: 10 requests per second allowed per client.
def token_bucket(times, rate=10, burst=10):
    tokens, last, out = burst, 0.0, []
    for t in times:
        tokens = min(burst, tokens + (t - last) * rate); last = t
        if tokens >= 1: tokens -= 1; out.append(True)
        else: out.append(False)
    return out
def fixed_window(times, limit=10):
    counts, out = {}, []
    for t in times:
        w = int(t); counts[w] = counts.get(w, 0) + 1; out.append(counts[w] <= limit)
    return out
def sliding_log(times, limit=10):
    log, out = [], []
    for t in times:
        log = [x for x in log if x > t - 1]
        if len(log) < limit: log.append(t); out.append(True)
        else: out.append(False)
    return out
# 20 requests in the last 0.2 s of second 0 and 20 in the first 0.2 s of second 1: a burst that straddles a window edge
times = [0.8 + i * 0.01 for i in range(20)] + [1.0 + i * 0.01 for i in range(20)] + [3 + i * 0.1 for i in range(10)]
print(f"{'limiter':16} {'allowed':>8} {'in the 0.4 s around t=1':>26}")
for name, f in (("fixed window", fixed_window), ("sliding log", sliding_log), ("token bucket", token_bucket)):
    ok = f(times); around = sum(1 for t, a in zip(times, ok) if a and 0.8 <= t < 1.2)
    print(f"{name:16} {sum(ok):>5}/{len(times)} {around:>18} allowed")
print("\nThe fixed window lets 20 through in 0.4 s (10 at the end of one window, 10 at the start of the next): twice the limit.")
print("The sliding log is exact but stores every timestamp. The token bucket is cheap (two numbers per client) and allows")
print("controlled bursts up to the bucket size. Answer rejected requests with HTTP 429 and a Retry-After header.")
EOF
python3 ratelimit.py
```

| Algorithm | How | Strength | Weakness |
|---|---|---|---|
| **Fixed window** | count per calendar second or minute | trivial to build | lets **twice the limit** through around a window edge, as the run shows: 20 in 0.4 s |
| **Sliding log** | keep every request time, count the last second | exact | memory grows with traffic |
| **Sliding window counter** | weight the previous window's count by how much of it overlaps | close to exact, two counters | an approximation |
| **Token bucket** | a bucket refills at the allowed rate; each request takes a token | cheap, allows controlled bursts | burst size is a second setting to choose |

The token bucket is the usual choice for APIs: it allowed the 10-token burst plus what refilled during the 0.4 s, then held the rate.

## Where and how

- Enforce limits **at the edge** (API gateway, load balancer, CDN) so rejected traffic costs little, keyed by API key, user or IP address.
- With many gateway instances, keep counters in a **shared store** (Redis with atomic increments) or accept slightly loose per-instance limits.
- Answer **HTTP 429 Too Many Requests** with a `Retry-After` header, and say the limits in headers (`X-RateLimit-Remaining`). Well-behaved clients then back off on their own ([APIs](#dataeng-8)).
- **Load shedding** is the server-side cousin: when overloaded, reject low-priority work early so the important work still completes ([Q16](#seniorqa-11)).

## API gateways

An **API gateway** is the single front door for many services. Its common jobs:

- **Routing:** `/orders` to the orders service, `/users` to the users service.
- **Offloading:** TLS, authentication, rate limiting, request size limits and logging, done once instead of in every service.
- **Aggregation:** one client call fans out to several services and returns a combined answer.

A **backend for frontend** (BFF) is a gateway per client type (mobile app, web, partners), shaped to what that client needs. Keep business logic out of gateways: when it creeps in, the gateway becomes the bottleneck every team has to change.

## How would you design a rate limiter?

:::say
I would enforce it at the API gateway, keyed by API key or user, using a token bucket: the bucket refills at the allowed rate and each request takes a token, which allows small bursts while holding the average rate. With several gateway instances the counters live in Redis with atomic updates. Rejected requests get HTTP 429 with Retry-After, and limits are visible in response headers.
:::

:::recap
- Rate limits protect against **overload, abuse and noisy neighbours**.
- Fixed windows allow **double bursts** at edges; the **token bucket** is cheap and burst-friendly.
- Enforce **at the edge**, share counters across instances, answer **429 with Retry-After**.
- Gateways **route, offload and aggregate**; keep business logic out of them.
:::

```quiz
? A fixed-window limiter of 10 per second can let how many through in a short burst across a window edge?
+ About 20
- Exactly 10
- 5
- Unlimited
! 10 at the end of one window and 10 at the start of the next.

? Which HTTP status tells a client it is being rate-limited?
+ 429 Too Many Requests
- 404 Not Found
- 500 Internal Server Error
- 301 Moved Permanently
! Add Retry-After so it knows when to try again.

? What does a token bucket store per client?
+ The number of tokens and the time of the last refill
- Every request timestamp
- The full request body
- Nothing
! That is why it is so cheap.
```
