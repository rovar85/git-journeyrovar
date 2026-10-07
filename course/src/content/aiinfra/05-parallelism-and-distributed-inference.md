---
track: aiinfra
title: Parallelism and distributed inference
short: Parallelism, distributed
sub: When one GPU is not enough: tensor, pipeline, data and expert parallelism, what communication costs, disaggregated prefill and decode, and KV-aware routing.
---

:::goals
- explain when a single GPU stops being enough and what the options are
- describe tensor, pipeline, data and expert parallelism and their communication patterns
- estimate communication cost and see why tensor parallelism stays inside a node
- explain disaggregated prefill and decode and calculate the KV transfer cost
- show with a simulation why KV-aware routing beats round robin
:::

:::note Illustrative numbers
The programs are **real** but use a simple cost model (`time = latency + bytes / bandwidth`) and **assumed** link figures that I chose to be in a plausible range: NVLink-class links at several hundred GB/s, a 400 Gb/s network port at 50 GB/s, and small fixed latencies. They are **illustrations, not measurements**: real collective libraries (NCCL) behave differently, and numbers differ by hardware. Features of vLLM and NVIDIA Dynamo come from their READMEs, which I read.
:::

## 1. Why one GPU is not enough

Three reasons, from lesson 1 and 2:

1. **The weights do not fit** (a 70B model in BF16 is 140 GB).
2. **The KV cache does not fit** for your concurrency and context length.
3. **One GPU is too slow** for your traffic or latency target.

Each has different remedies, so say which one you have before choosing a design. Reason 3 is often solved by **more replicas** (copies of the model on more GPUs), which is **data parallelism** for inference and needs no special communication. The harder cases are 1 and 2.

## 2. The four parallelism styles

| Style | What is split | Communication | Good for |
|---|---|---|---|
| **Data parallelism** | nothing in the model: **whole copies** each serve different requests | none per request (a router spreads load) | throughput, availability |
| **Tensor parallelism (TP)** | each **layer's matrices** are sliced across GPUs; every GPU computes part of every layer | **all-reduce** twice per layer, on **every** token step: heavy and latency-sensitive | models too big for one GPU; **lower latency**; keep inside a node |
| **Pipeline parallelism (PP)** | **groups of layers** (stages) on different GPUs; activations flow stage to stage | one activation hand-off per stage boundary: light | very large models across **nodes**; throughput, not latency |
| **Expert parallelism (EP)** | in **mixture-of-experts** models, different **experts** live on different GPUs | **all-to-all**: each token is sent to the GPUs holding its chosen experts, then back | MoE models, where only a few experts run per token |

vLLM's README lists tensor, pipeline, data, expert and **context** parallelism (splitting a very long sequence) among its supported modes, which is the practical menu: you choose a combination such as TP=8 inside a node and PP across two nodes.

## 3. What communication costs

With tensor parallelism, each layer ends with an **all-reduce** that adds up partial results from every GPU. During decode the messages are **small** (a batch of activations) and sent **many times** (two per layer, per token step), so **latency** dominates, not bandwidth. Estimate it:

```run
mkdir -p ~/lab/aiinfra && cd ~/lab/aiinfra
cat > tp.py <<'EOF'
# Illustrative cost model: time = fixed latency + bytes / bandwidth. Assumed figures, not measurements.
LINKS = {
    "NVLink inside a node":   dict(latency=10e-6, bw=400e9),
    "network between nodes":  dict(latency=40e-6, bw=50e9),
}
LAYERS, HIDDEN, BYTES = 80, 8192, 2            # 70B-class model, BF16 activations
TOKENS_IN_STEP = 64                             # decode batch of 64 sequences, one token each
TP = 8

def allreduce_time(size, link, n=TP):
    traffic = 2 * (n - 1) / n * size            # ring all-reduce: each GPU sends about 2(n-1)/n of the data
    return link["latency"] + traffic / link["bw"]

size = TOKENS_IN_STEP * HIDDEN * BYTES
print(f"one all-reduce moves {size / 1e6:.2f} MB of activations; a token step needs {2 * LAYERS} of them\n")
for name, link in LINKS.items():
    per_step = 2 * LAYERS * allreduce_time(size, link)
    print(f"TP={TP} over {name:24}: communication per decode step = {per_step * 1000:6.2f} ms")
print("\nCompare with the idealised weight-read time of about 4-9 ms per step from lesson 3:")
print("communication over the slow link can cost more than the computation it is meant to speed up.")

print("\nPipeline bubbles: with p stages and m micro-batches in flight, idle fraction = (p-1)/(m+p-1)")
for p in (4, 8):
    for m in (1, 4, 16, 64):
        print(f"  p={p} m={m:3d}: {((p - 1) / (m + p - 1)):5.1%} of stage-time idle")
EOF
python3 tp.py
```

Takeaways:

- **Tensor parallelism across the network is very costly.** Keep TP inside a node (NVLink) and use **pipeline** or **data** parallelism between nodes.
- **Pipeline parallelism needs many requests in flight** to hide its bubbles, so it helps throughput more than single-request latency.
- More GPUs for one model means **less memory per GPU for weights**, so **more room for KV cache**: that can be the real benefit of TP, even when the step gets no faster.

Sizing arithmetic for a 70B BF16 model on 80 GB GPUs:

```run
cd ~/lab/aiinfra
python3 - <<'EOF'
weights = 70e9 * 2 / 1e9
for tp in (2, 4, 8):
    per_gpu_w = weights / tp
    free = 80 * 0.90 - per_gpu_w               # 90% of VRAM usable, minus this GPU's slice of the weights
    cache_total = free * tp
    per_request = 10.7                          # GB of KV cache for a 32k-token request on a 70B-class GQA model (lesson 2)
    print(f"TP={tp}: weights {per_gpu_w:5.1f} GB/GPU, free for KV {free:5.1f} GB/GPU, {cache_total:6.0f} GB total -> about {int(cache_total / per_request):3d} concurrent 32k-token requests")
EOF
```

Read the TP=2 line: the weights alone nearly fill each GPU, so almost **no memory is left for KV cache** and the deployment is useless for long contexts even though the model "fits". Adding GPUs raised the capacity for concurrent requests far faster than it raised raw speed.

## 4. Disaggregated prefill and decode

Prefill and decode want **different things** (lesson 2): prefill is compute-heavy and bursty; decode is memory-bound and steady. On one GPU they **interfere**: a long prompt's prefill occupies the GPU for hundreds of milliseconds, and every user streaming from that GPU **stalls**, hurting inter-token latency. And the best settings for one phase are wrong for the other.

**Disaggregated serving** runs them on **separate GPU pools**:

```
request -> [prefill GPUs]  --KV cache transferred-->  [decode GPUs] -> tokens streamed to the user
```

Benefits: each pool is sized and tuned for its own bottleneck, you can **scale them independently** (more prefill for long prompts, more decode for long answers), and decode streams stay smooth. The price: the **KV cache must travel** from the prefill GPU to the decode GPU, so the network becomes part of the critical path. Is it worth it? Compute the transfer:

```run
cd ~/lab/aiinfra
python3 - <<'EOF'
kv_per_token = 2 * 80 * 8 * 128 * 2            # 70B-class GQA, FP16 (lesson 2): 327,680 bytes
for prompt in (1000, 4000, 32000):
    size = prompt * kv_per_token
    nv  = size / 400e9 * 1000                  # ms over an NVLink-class link
    net = size / 50e9 * 1000                   # ms over a 400 Gb/s network port
    prefill = 2 * 70e9 * prompt / 989e12 * 1000 / 8     # ideal prefill ms on 8 GPUs in parallel (compute-bound)
    print(f"prompt {prompt:6,} tokens: KV {size / 1e9:5.2f} GB, transfer {nv:6.1f} ms (NVLink) / {net:7.1f} ms (network), ideal prefill about {prefill:6.0f} ms")
EOF
```

For long prompts the transfer is a small slice of the prefill time and well worth paying; for very short prompts it may not be. This is why disaggregation is a **design for large deployments with long contexts**, not a default.

## 5. NVIDIA Dynamo and KV-aware routing

From the Dynamo README: it is the **orchestration layer** above SGLang, TensorRT-LLM and vLLM, to be used when you serve across **multiple GPUs or nodes** and need to coordinate them. Its listed capabilities:

| Capability | What it does |
|---|---|
| **Disaggregated serving** | separate prefill and decode workers, scaled independently |
| **KV-aware routing** | send a request to the worker that **already holds the cached prefix**, avoiding redundant prefill |
| **SLA-based planner** | scale workers to meet **latency SLAs** at the lowest total cost |
| **KV block manager (KVBM)** | manage KV cache blocks across memory tiers |
| **Fast cold starts** | bring up new replicas quickly |

Why **KV-aware routing** matters: if replicas keep prefix caches, a **round-robin** router scatters requests that share a system prompt across all replicas, so each replica computes (and stores) the same prefix again. Routing by prefix sends repeat prefixes to the same replica. Simulate it:

```run
cd ~/lab/aiinfra
cat > routing.py <<'EOF'
import random, zlib
random.seed(2)
REPLICAS = 4
PREFIXES = [f"system-prompt-{i}" for i in range(8)]      # 8 different long shared prefixes (agents, tenants...)
requests = [random.choice(PREFIXES) for _ in range(400)]

def run(route):
    caches = [set() for _ in range(REPLICAS)]
    hits = 0
    for i, prefix in enumerate(requests):
        r = route(i, prefix)
        hits += prefix in caches[r]                      # prefill saved if this replica already cached the prefix
        caches[r].add(prefix)
    return hits / len(requests), sum(len(c) for c in caches)

round_robin = lambda i, p: i % REPLICAS
prefix_aware = lambda i, p: zlib.crc32(p.encode()) % REPLICAS           # same prefix, same replica

for name, route in (("round robin", round_robin), ("prefix-aware (KV-aware idea)", prefix_aware)):
    rate, stored = run(route)
    print(f"{name:30} prefix cache hit rate {rate:5.1%}   copies of prefixes stored: {stored}")
EOF
python3 routing.py
```

Prefix-aware routing gets a higher hit rate **and** stores 8 copies of the prefixes instead of 32. The caches in this toy are unbounded; with **limited** cache memory (the real situation) the four-fold duplication under round robin forces evictions, so the real gap is wider. Real KV-aware routers also **balance load** (a popular prefix must not overload one replica), which is the hard part.

:::warn Common mistakes
- **Splitting a model across more GPUs "for speed"** without measuring communication. Past a point it is slower.
- **Tensor parallelism across nodes.** The network is an order of magnitude slower than NVLink; use pipeline or data parallelism there.
- **Disaggregating a small deployment.** The complexity and KV transfer cost pay off only at scale with long prompts.
- **Round-robin routing in front of prefix caches.** You pay for the same prefill on every replica.
- **Forgetting the failure domain.** A model spread over 16 GPUs fails if any one does: plan restarts and health checks.
:::

:::recap
- Say **why** one GPU is not enough (weights, KV cache, or speed) before picking a remedy.
- **Data parallelism** = more replicas; **tensor** = slice layers (chatty, keep in a node); **pipeline** = split layers into stages (light, good across nodes, needs many requests in flight); **expert** = spread MoE experts (all-to-all).
- **Disaggregated prefill/decode** separates two different workloads, at the cost of moving the KV cache.
- **KV-aware routing** and a **SLA-based planner** (Dynamo) are what you add when you operate many GPUs.
:::

:::try Your turn
In `tp.py` change `TP` to 2 and then 16. How does the communication per step change over each link? Then, in `routing.py`, make one prefix receive 60% of all requests and check how the load per replica looks under prefix-aware routing (count requests per replica) to see the load-balancing problem.
:::

:::quiz
? Why should tensor parallelism stay inside a node?
+ It needs frequent small all-reduces, and the network between nodes is far slower than NVLink
- It cannot use GPUs
- Nodes have no memory
- Pipeline parallelism forbids it
! Latency and bandwidth of the link decide the cost.
? What is the main extra cost of disaggregated prefill and decode?
+ The KV cache must be transferred from the prefill GPU to the decode GPU
- The model must be retrained
- Tokens are no longer streamed
- It needs more CPUs
! The network joins the critical path.
? What does KV-aware routing improve?
+ It sends requests to the replica that already holds the cached prefix, saving prefill work
- It reduces the model size
- It increases the context window
- It removes the need for a load balancer
! Cache hits avoid recomputing the shared prefix.
:::
