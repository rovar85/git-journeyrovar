---
track: aiinfra
title: Roadmap, a benchmarking harness and a reference architecture
short: Roadmap and benchmark
sub: Your eight-stage inference roadmap mapped to lessons, a working load-test client that measures TTFT and inter-token latency over HTTP streaming, and a design exercise.
---

:::goals
- map each stage of the inference engineering roadmap to the lessons and tracks that cover it
- run a benchmark client that measures TTFT, ITL and throughput against a streaming OpenAI-style endpoint
- see the latency and throughput trade-off as concurrency rises
- sketch a reference architecture for serving a model in production
:::

:::note About the roadmap
This lesson follows the roadmap you shared as screenshots. The screenshots show **Stages 1 to 5, 7 and 8**. **Stage 6 is not in them** (the text jumps from stage 5 to stage 7), so I have not invented it. If you have the missing text, send it and I will add it. The benchmark client is **real code** and the mock server it talks to is a **simulation**; point the same client at a real vLLM or Triton endpoint to measure real hardware.
:::

## 1. The roadmap, mapped

| Stage | What it asks you to learn | Where it is in the course |
|---|---|---|
| **1. GPU and systems foundation** | CPU vs GPU and why inference favours GPUs; VRAM, memory bandwidth, CUDA cores, Tensor Cores; Linux and `nvidia-smi`; networking (inter-node and intra-node) and storage in GPU systems | AI infrastructure lesson 1; **Linux** and **Networking** tracks |
| **2. Dive into LLM inference** | tokens, weights and the inference lifecycle; prefill versus decode; KV cache growth | AI infrastructure lesson 2; AI deep dives 1 to 3 |
| **3. Analyze inference performance** | sources of latency, throughput and memory bottlenecks; TTFT, TPOT, inter-token latency; compute- versus memory-bound; profiling with `nvidia-smi` and Nsight | lesson 3 |
| **4. Hands-on model serving** | deploy with vLLM, SGLang or TensorRT-LLM; batching, PagedAttention, scheduling and queues; benchmark serving strategies | lesson 4 and **this lesson's benchmark** |
| **5. GPU networking and parallelism** | when one GPU is not enough; tensor, pipeline, data and expert parallelism; communication overhead | lesson 5 |
| **6.** | *not in your screenshots* | |
| **7. Architect distributed inference** | how data moves across GPUs and nodes; disaggregated prefill and decode; network and communication bottlenecks | lesson 5 (Dynamo, KV-aware routing) |
| **8. Production-ready inference systems** | autoscaling, queueing, cold starts, cost per token; TTFT and ITL as SLOs; observability for latency, throughput, GPU use and errors; AI gateways for routing, rate limits, fallbacks and traffic management | lessons 6, 7 and 9; **Monitoring** and **Kubernetes** tracks |

And the "future DevOps stack" from the post you shared, as a chain with the lessons that build each link:

```
AI workloads -> model serving -> GPU scheduling -> AI observability -> AI autoscaling
 (lesson 8)     (lessons 4,5)    (Kubernetes track,   (lesson 9)        (lessons 6, 7: HPA, KEDA)
                                  lesson 1: device plugin)
```

**GPU scheduling** in Kubernetes deserves a sentence here, because it is the one link not run in this lab (no GPUs): nodes with GPUs run the **NVIDIA device plugin**, which advertises `nvidia.com/gpu` as a resource; a Pod asks for it like CPU or memory (`resources.limits: {nvidia.com/gpu: 1}`), and the scheduler places it on a node with a free GPU. GPUs are **whole units** by default and cannot be oversubscribed like CPU; sharing needs features such as time-slicing, MIG (partitioning supported cards) or a dedicated scheduler. Taints and tolerations keep ordinary Pods off expensive GPU nodes. Everything else you learned about Pods, Deployments, probes, requests and limits applies unchanged (Kubernetes track).

## 2. A benchmark harness you can point at a real server

Lesson 3 defined the metrics; here is a tool that **measures** them over the same HTTP interface real serving engines use: a **streaming** (server-sent events) chat completion endpoint. The server below is a mock with a simple load model: **time to first token** depends on prompt length, and **each token's delay grows with the number of requests in flight** (a crude version of a batch getting heavier).

```run
mkdir -p ~/lab/bench && cd ~/lab/bench
cat > mock_server.py <<'EOF'
import json, threading, time, http.server

active = 0
lock = threading.Lock()

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        global active
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prompt_tokens = len(body["messages"][-1]["content"].split()) * 2
        n_out = body.get("max_tokens", 40)
        with lock: active += 1
        try:
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            time.sleep(0.05 + prompt_tokens * 0.0005)                       # prefill: grows with prompt length
            for i in range(n_out):
                with lock: n = active
                time.sleep(0.008 + 0.0015 * n)                             # decode step: slower when busier
                chunk = {"choices": [{"delta": {"content": f"tok{i} "}}]}
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode()); self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        finally:
            with lock: active -= 1
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", 8123), H).serve_forever()
EOF
python3 mock_server.py > /dev/null 2>&1 &
echo $! > server.pid
sleep 1
curl -s -N -X POST http://127.0.0.1:8123/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"mock","stream":true,"max_tokens":3,"messages":[{"role":"user","content":"hello there"}]}'
```

That is the wire format of OpenAI-compatible streaming: one `data:` line per token chunk, then `[DONE]`. Now the client. It sends many requests with a chosen **concurrency**, timestamps every chunk, and reports the lesson 3 metrics:

```run
cd ~/lab/bench
cat > bench.py <<'EOF'
import json, sys, time, urllib.request, concurrent.futures as cf

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/v1/chat/completions"
PROMPT = "summarise the indexing incident for the EV search team " * 8        # about 80 words

def one_request(_):
    body = json.dumps({"model": "mock", "stream": True, "max_tokens": 40, "messages": [{"role": "user", "content": PROMPT}]}).encode()
    req = urllib.request.Request(URL, body, {"Content-Type": "application/json"})
    t0, stamps = time.perf_counter(), []
    with urllib.request.urlopen(req) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if line.startswith("data:") and "[DONE]" not in line:
                stamps.append(time.perf_counter())             # one timestamp per token chunk
    ttft = stamps[0] - t0
    gaps = [b - a for a, b in zip(stamps, stamps[1:])]
    return ttft, gaps, len(stamps), stamps[-1] - t0

def pct(v, p):
    s = sorted(v); return s[min(len(s) - 1, int(p / 100 * len(s)))]

def run(concurrency, requests=24):
    t0 = time.perf_counter()
    with cf.ThreadPoolExecutor(concurrency) as pool:
        results = list(pool.map(one_request, range(requests)))
    wall = time.perf_counter() - t0
    ttfts = [r[0] for r in results]; gaps = [g for r in results for g in r[1]]
    tokens = sum(r[2] for r in results)
    print(f"concurrency {concurrency:2d} | TTFT p50 {pct(ttfts, 50) * 1000:5.0f} ms p95 {pct(ttfts, 95) * 1000:5.0f} ms "
          f"| ITL p50 {pct(gaps, 50) * 1000:5.1f} ms p95 {pct(gaps, 95) * 1000:5.1f} ms | throughput {tokens / wall:6.0f} tokens/s")

for c in (1, 4, 16):
    run(c)
EOF
python3 bench.py
kill $(cat server.pid)
```

Read the three rows as the **trade-off curve** from lesson 3:

- **Concurrency 1**: lowest latency, lowest throughput: the server is mostly idle between tokens.
- **Concurrency 16**: throughput rises several times over, **but each user's inter-token latency is worse**, because they now share the server.
- The right operating point is **the highest concurrency that still meets your ITL and TTFT SLOs** (lesson 6), found by running exactly this kind of sweep **with your real model, real prompt lengths and real arrival pattern**.

To use it on a real engine, change nothing but the URL (and add an `Authorization` header and the real model name if needed). The same stream format comes from vLLM's OpenAI-compatible server, so this harness measures the real thing. Real benchmarks also vary **prompt and output lengths**, use **open-loop arrivals** (requests arrive at a fixed rate whether or not earlier ones finished, which is how real users behave) and warm the server first. vLLM ships its own benchmarking scripts for this; this harness is the small version so you understand what they measure.

## 3. A reference architecture

Combining the lessons, a production design for serving an in-house model (for example, summarising archived mail for the Enterprise Vault search team):

```
Users / agents
     |
 AI gateway  (auth, per-team token budgets, routing, retries, fallback to a hosted model)   <- lesson 6
     |
 Kubernetes Service / Ingress
     |
 +-- Inference deployment (vLLM or Dynamo workers, GPU nodes, tainted, device plugin) -------+   <- lessons 4, 5
 |       Pods request nvidia.com/gpu; model weights on fast local NVMe or a cached volume    |
 |       KEDA / HPA scales on queue depth; minimum warm replicas for cold starts             |   <- lessons 6, 7
 +-------------------------------------------------------------------------------------------+
     |
 Prometheus + DCGM exporter + OpenTelemetry Collector -> Grafana, alerts (SLO page, leading tickets)   <- lesson 9
     |
 Git (manifests, dashboards, rules, model alias) -> Argo CD reconciles the cluster                      <- lesson 7
 MLflow registry (model versions, aliases) and CI builds images                                          <- lesson 8
```

Questions this design forces you to answer, which make a good review checklist:

| Question | Where you decided it |
|---|---|
| Which SLOs (TTFT, ITL, availability) per workload class? | lesson 6 |
| How many replicas fit the traffic at the SLO-compliant concurrency? | lessons 3 and 6, benchmark sweep |
| What happens when a replica is cold, or the GPU node is gone? | lesson 6 (warm minimum, health checks) |
| How does a new model version roll out and roll back? | lessons 7 and 8 (GitOps, aliases, canary) |
| What does a token cost, and when is a hosted API cheaper? | lesson 6 |
| What do you log, and what must never be stored? | lesson 9 |
| What can the model call, and who approved those tools? | the AI deep dive on security |

:::warn Common mistakes
- **Benchmarking the happy path.** A single warm request tells you nothing about p99 under load.
- **Closed-loop load only.** If every simulated user waits for a reply before sending the next request, the server is never overloaded; real traffic is open-loop.
- **Comparing engines on different prompts and output lengths.** Use identical workloads.
- **Skipping the warm-up** (first requests include compilation and cache effects).
- **Treating the mock results as hardware numbers.** The mock only shows the shape of the trade-off.
:::

:::recap
- The eight-stage roadmap maps onto this track (stages 1 to 5, 7, 8; stage 6 was not in the screenshots), plus the Linux, Networking, Docker, Kubernetes, Monitoring and GitOps lessons.
- `bench.py` measures TTFT, ITL and throughput over a streaming OpenAI-style API; sweeping concurrency reveals the latency and throughput trade-off and the operating point your SLOs allow.
- A production design combines a gateway, GPU-scheduled inference deployments, autoscaling on queue depth, GitOps, a model registry and full observability.
:::

:::try Your turn
Change the mock server so that prompts over 150 words cost twice as much prefill time, add a long-prompt request to the benchmark mix, and see how the TTFT p95 changes. Then write the one-page design for your own use case using the review-checklist table: pick numbers for each row.
:::

:::quiz
? Why should the benchmark sweep concurrency instead of using a single number?
+ Throughput rises with concurrency while per-user latency worsens; the sweep finds where your SLOs break
- Higher concurrency is always better
- Concurrency does not affect latency
- It is quicker to run
! The trade-off curve is the result.
? What does an open-loop load generator do differently?
+ It sends requests at a fixed arrival rate regardless of whether earlier ones finished, like real users
- It waits for each reply before sending the next
- It disables streaming
- It uses fewer tokens
! Closed-loop tests understate overload behaviour.
? How does a Pod get a GPU in Kubernetes?
+ It requests the nvidia.com/gpu resource advertised by the device plugin
- By mounting /dev/gpu manually
- Automatically, with no request
- Through the Ingress
! GPUs are an extended resource requested in the Pod spec.
:::
