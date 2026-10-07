---
track: aiinfra
title: Production inference: SLOs, queues, autoscaling, cold starts, cost and AI gateways
short: Production inference
sub: How latency targets become capacity numbers, why queues explode near full load, what autoscaling and cold starts do to the design, how to compute cost per token, and what an AI gateway adds.
---

:::goals
- turn TTFT and ITL targets into inference SLOs and a capacity number per replica
- show with a simulation why latency explodes as utilisation approaches 100%
- choose autoscaling signals and account for cold starts
- compute cost per million tokens and see what moves it
- implement the core of an AI gateway: rate limiting, routing, retries and fallback
:::

:::note Assumptions
Everything here is **real code on assumed numbers** (GPU price, step times, load). The prices and speeds are illustrative, so replace them with your own measurements. The structure of the calculation, not the figures, is the lesson. Named gateway products are described from my own knowledge.
:::

## 1. From user experience to SLOs

An **SLO** (service level objective, see the Monitoring track) is a target for a measurable **SLI** over a period. For an inference service the useful SLIs are the ones from lesson 3:

| SLI | Example SLO | User feeling it protects |
|---|---|---|
| **TTFT** p95 | under 1.0 s | "it starts answering quickly" |
| **ITL** p95 | under 50 ms | "the text streams smoothly" (about 20 tokens per second, faster than reading) |
| **Availability** (successful requests) | 99.9% over 30 days | "it works" |
| **Error and timeout rate** | under 0.5% | "it does not drop my request" |

Different use cases need different targets: a chat assistant needs low TTFT and ITL; a batch summariser for overnight email needs **throughput and cost** and does not care about either. Write the SLO **per workload class**, and run them on separate pools or priority queues so a batch job cannot hurt a chat user.

### SLO to capacity

Decode speed per request falls as more requests share a GPU (more KV cache to read each step). Model it, then find the largest concurrency that still meets the ITL SLO:

```run
mkdir -p ~/lab/aiinfra && cd ~/lab/aiinfra
cat > capacity.py <<'EOF'
# Assumed model of one 8B-class replica on an H100-class GPU (ideal figures from lesson 3, plus a KV-read term)
WEIGHT_READ = 4.8e-3            # s per step to read the weights (memory-bound base cost)
KV_PER_REQ  = 0.10e-3           # s extra per step for each active request (reads its KV cache), assumed
GPU_COST_HR = 3.00              # dollars per GPU-hour, illustrative
SLO_ITL     = 0.030             # p95 inter-token latency target: 30 ms

def step_time(batch):    return WEIGHT_READ + batch * KV_PER_REQ
def tokens_per_sec(batch): return batch / step_time(batch)

best = max(b for b in range(1, 1000) if step_time(b) <= SLO_ITL)
print(f"{'batch':>6} {'ITL (ms)':>9} {'tokens/s':>9} {'$/1M tokens':>12}  meets 30 ms SLO?")
for b in (1, 8, 32, 64, best, 400):
    tps = tokens_per_sec(b)
    cost = GPU_COST_HR / (tps * 3600) * 1e6
    print(f"{b:6d} {step_time(b) * 1000:9.1f} {tps:9,.0f} {cost:12.3f}  {'yes' if step_time(b) <= SLO_ITL else 'NO'}")
print(f"\nLargest batch that still meets the SLO: {best} concurrent requests per replica.")
print("The SLO, not the GPU's raw capability, sets how many users one replica can carry.")
EOF
python3 capacity.py
```

The row for the largest SLO-compliant batch is your **planning number**: users per replica at the target latency, and with it the **cost per token at that quality of service**. Loosen the SLO and cost falls; tighten it and you need more GPUs.

## 2. Queues: why 90% busy is already too busy

Requests arrive randomly, so even a system with spare **average** capacity forms queues. Waiting time does not grow linearly with load: it **explodes** as utilisation approaches 100%. Simulate a server pool and look at p95 waiting time:

```run
cd ~/lab/aiinfra
cat > queue.py <<'EOF'
import random, heapq
random.seed(4)

def simulate(utilisation, servers=4, mean_service=1.0, n=40000):
    """M/M/c queue: Poisson arrivals, exponential service times, `servers` identical servers."""
    rate = utilisation * servers / mean_service
    t, free, busy_until, waits = 0.0, servers, [], []
    for _ in range(n):
        t += random.expovariate(rate)
        while busy_until and busy_until[0] <= t:
            heapq.heappop(busy_until); free += 1
        if free:
            start = t; free -= 1
        else:
            start = heapq.heappop(busy_until)                # wait for the first server to free up
        waits.append(start - t)
        heapq.heappush(busy_until, start + random.expovariate(1 / mean_service))
    waits.sort()
    return sum(waits) / n, waits[int(0.95 * n)]

print(f"{'utilisation':>12} {'mean wait':>10} {'p95 wait':>10}   (in units of the mean service time)")
for u in (0.5, 0.7, 0.8, 0.9, 0.95, 0.98):
    mean, p95 = simulate(u)
    print(f"{u:12.0%} {mean:10.2f} {p95:10.2f}")
EOF
python3 queue.py
```

Going from 50% to 90% load multiplies waiting by roughly an order of magnitude, and 95% to 98% is worse again. That is why production inference runs at a **target utilisation well below 100%** (often 60% to 70% of the SLO-compliant capacity), keeps **headroom for bursts**, and **limits the queue** (reject or shed load rather than letting wait times grow without bound). A related rule, **Little's law**: the average number of requests in the system equals arrival rate times average time in system (`L = λW`), so you can estimate concurrency from traffic and latency.

## 3. Autoscaling

Autoscaling adds and removes replicas as load changes. For GPUs it is harder than for web servers because **replicas are expensive and slow to start**.

**Choosing the signal** (what the scaler watches):

| Signal | Verdict |
|---|---|
| CPU usage | **useless**: the CPU is not the bottleneck |
| GPU utilisation | weak: it saturates early and does not say whether users are happy |
| **Queue depth / waiting requests** | **good**: direct evidence of insufficient capacity |
| **Requests running per replica** or **KV cache usage** | good: engines expose them; scale before the cache fills |
| **TTFT or ITL percentiles** | closest to the SLO but lag behind (the damage is already done) |
| **Request rate or tokens per second** | simple and predictive when paired with a measured capacity per replica |

The Kubernetes **Horizontal Pod Autoscaler** formula is `desired = ceil(current replicas x current metric / target metric)`. KEDA (next lesson) lets you drive it from queue length or Prometheus metrics, and scale **to zero**.

### Cold starts

A new replica is not useful until it has:

1. been **scheduled** on a node with a free GPU (or a new GPU node was provisioned: minutes),
2. **pulled the container image** (often 10 to 30 GB),
3. **loaded the weights** into GPU memory (tens to hundreds of GB),
4. **initialised the engine** (CUDA graphs, warm-up) before it serves the first request.

Estimate it:

```run
cd ~/lab/aiinfra
python3 - <<'EOF'
def cold_start(weights_gb, image_gb, net_gbps, disk_gbps, node_ready_s=0, init_s=45):
    pull  = image_gb / net_gbps                 # image comes over the network (skipped if cached on the node)
    load  = weights_gb / disk_gbps              # weights from storage into GPU
    return node_ready_s + pull + load + init_s, pull, load

cases = {
    "cold node, weights from network storage": dict(weights_gb=140, image_gb=20, net_gbps=1.2, disk_gbps=1.0, node_ready_s=240),
    "warm node, image cached, weights on NVMe": dict(weights_gb=140, image_gb=0,  net_gbps=1.2, disk_gbps=5.0),
}
for name, kw in cases.items():
    total, pull, load = cold_start(**kw)
    print(f"{name:42} image {pull:5.0f}s + weights {load:5.0f}s + startup => {total / 60:4.1f} minutes")
EOF
```

Minutes of cold start means **autoscaling reacts too late for sudden spikes**, so: keep a **minimum number of warm replicas**, scale **earlier** on a leading signal, cache images and weights on local NVMe, use faster weight loading and snapshotting, and accept that **scale-to-zero** suits batch or internal tools, not interactive chat. Dynamo's README lists **fast cold starts** and an **SLA-based planner** as features for exactly this reason.

## 4. Cost per token

```
cost per 1M tokens = GPU cost per hour / (tokens per second x 3600) x 1,000,000
```

Everything that raises **tokens per second per GPU** lowers cost: bigger SLO-compliant batches, continuous batching, quantization, prefix caching, speculative decoding. The big lever is **utilisation**: an idle GPU costs the same as a busy one.

```run
cd ~/lab/aiinfra
python3 - <<'EOF'
gpu_hr, peak_tps = 3.00, 4200          # assumed price and sustained tokens/s per GPU at the SLO batch size
print(f"{'average GPU utilisation':>24} {'$ per 1M tokens':>16}")
for util in (1.0, 0.6, 0.3, 0.1):
    cost = gpu_hr / (peak_tps * util * 3600) * 1e6
    print(f"{util:24.0%} {cost:16.3f}")
print("\nA self-hosted GPU at 10% utilisation costs ten times more per token than at 100%.")
print("This is the break-even question: steady high load favours owning GPUs; spiky or low load favours paying per token to a hosted API.")
EOF
```

Do the maths for **your** traffic before choosing self-hosting over a hosted API; include engineering time, on-call, and idle headroom in the comparison.

## 5. AI gateways

An **AI gateway** is a proxy between applications and model backends (your own engines and hosted providers). It centralises what every team would otherwise rebuild:

| Function | Why |
|---|---|
| **Routing** | send each request to the right model (cheap model for easy tasks, strong model for hard ones) and the right pool |
| **Rate limits and quotas** | per tenant, per key, in **tokens** as well as requests; protects capacity and budgets |
| **Fallbacks and retries** | if a backend errors or times out, retry with backoff or switch to another model or provider |
| **Auth and key management** | applications never hold provider keys |
| **Observability and cost tracking** | per-team token usage, latency, errors |
| **Guardrails and caching** | input and output checks, response caching |
| **Traffic management** | load balancing, canary and A/B routing to a new model version |

Products in this space (from my knowledge, check their documentation): **LiteLLM**, **Envoy AI Gateway**, **Kong AI Gateway**, **Cloudflare AI Gateway**, **Portkey**, plus the API-management features of the big clouds. Implement the core ideas:

```run
cd ~/lab/aiinfra
cat > gateway.py <<'EOF'
import random, time
random.seed(8)

class TokenBucket:
    """Rate limit in tokens per minute per tenant."""
    def __init__(self, per_minute):
        self.capacity, self.tokens, self.last = per_minute, per_minute, 0.0
    def allow(self, cost, now):
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.capacity / 60)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost; return True
        return False

BACKENDS = {            # name: (failure probability, kind) - stand-ins for a self-hosted engine and a hosted provider
    "self-hosted-8b": 0.30,
    "hosted-provider": 0.02,
}
def call(backend):
    if random.random() < BACKENDS[backend]: raise TimeoutError(f"{backend} timed out")
    return f"answer from {backend}"

def route(task):  return "self-hosted-8b" if task == "easy" else "hosted-provider"

def handle(tenant, task, tokens, now, buckets):
    if not buckets[tenant].allow(tokens, now):
        return "429 rate limit exceeded for " + tenant
    primary = route(task)
    for backend in (primary, "hosted-provider"):                # fallback chain
        for attempt in range(2):                                # one retry per backend
            try:
                return f"200 {call(backend)} (attempt {attempt + 1})"
            except TimeoutError as e:
                last = str(e)
    return "503 all backends failed: " + last

buckets = {"search-team": TokenBucket(2000), "hr-bot": TokenBucket(500)}
tests = [("search-team", "easy", 300, 1), ("search-team", "hard", 800, 2), ("hr-bot", "easy", 400, 3),
         ("hr-bot", "easy", 400, 4), ("search-team", "easy", 300, 5), ("search-team", "easy", 300, 6)]
for tenant, task, tokens, now in tests:
    print(f"t={now}s {tenant:12} {task:5} {tokens:4} tokens -> {handle(tenant, task, tokens, now, buckets)}")
EOF
python3 gateway.py
```

Watch four behaviours: a tenant that exceeds its **token budget** gets `429`; **easy** tasks go to the cheap self-hosted model; a **timeout** triggers a retry and then a **fallback** to the other backend; and callers see one stable interface. A real gateway adds **circuit breakers** (stop sending to a backend that keeps failing), **timeouts** tuned to TTFT and total length, **streaming** support, and **metrics** per tenant.

:::warn Common mistakes
- **Planning to 100% utilisation.** Queues explode; keep headroom and limit the queue.
- **Scaling on CPU or GPU utilisation.** Use queue depth, running requests, KV usage or request rate.
- **Ignoring cold starts.** A scale-up that takes ten minutes cannot absorb a spike; keep warm capacity.
- **One SLO for everything.** Batch and interactive traffic need separate targets and pools.
- **Retrying without limits.** Retry storms turn a brownout into an outage; use backoff, budgets and circuit breakers.
- **Comparing cost per GPU-hour instead of per token at your real utilisation.**
:::

:::recap
- Write **SLOs for TTFT, ITL and availability per workload class**; the SLO sets the safe concurrency per replica, and that sets the cost.
- Queues blow up near full load: run well below 100%, limit queues, shed load deliberately.
- Autoscale on **queue depth, running requests or KV usage**, and plan for **cold starts** with warm minimum capacity.
- Cost per token = GPU cost / tokens per second; utilisation is the biggest lever.
- An **AI gateway** centralises routing, token-based rate limits, retries, fallbacks, auth and usage tracking.
:::

:::try Your turn
In `capacity.py` change `SLO_ITL` to 0.020 and then 0.050 and record the SLO-compliant batch size and cost per million tokens each time. Then, in `gateway.py`, add a simple circuit breaker: after 3 consecutive failures of a backend, skip it for the next 5 requests.
:::

:::quiz
? Why is queue depth a better autoscaling signal than CPU usage for an LLM service?
+ It directly shows that demand exceeds GPU capacity, while CPU is not the bottleneck
- It is easier to graph
- CPU is always at 100%
- GPUs have no CPU
! Scale on the resource that actually limits you.
? What happens to waiting time as utilisation approaches 100%?
+ It grows explosively, not linearly
- It stays constant
- It falls
- It becomes zero
! Queueing theory and the simulation both show this.
? What does an AI gateway do when a backend times out?
+ Retries with backoff and falls back to another backend or model
- Deletes the request
- Retrains the model
- Raises the rate limit
! Fallbacks keep the caller's interface stable.
:::
