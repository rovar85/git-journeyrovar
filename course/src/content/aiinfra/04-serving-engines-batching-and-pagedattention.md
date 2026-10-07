---
track: aiinfra
title: Serving engines: batching, PagedAttention, vLLM, Triton and friends
short: Serving engines
sub: How inference servers keep GPUs busy: continuous batching, paged KV memory, prefix caching, and where vLLM, SGLang, TensorRT-LLM, Triton and Dynamo fit.
---

:::goals
- explain why static batching wastes GPU time and how continuous batching fixes it
- explain how PagedAttention avoids wasted KV memory, with a simulation
- place vLLM, SGLang, TensorRT-LLM, Triton Inference Server and NVIDIA Dynamo in the picture
- read a vLLM launch command and know the settings that matter
:::

:::note What I read and what ran
I **read the READMEs** of vLLM, Triton Inference Server and NVIDIA Dynamo for this lesson; the feature lists below come from them. SGLang and TensorRT-LLM are described from my own knowledge. The two simulations are **real code** with simplified rules. The engines themselves need GPUs and model downloads, so their commands are **Example, not run here**.
:::

## 1. Why you need a serving engine

You could load a model in a Python script and call `generate()` per request. That works for one user and fails for many: requests arrive at random times, have different lengths, and the GPU is wasted waiting. A **serving engine** adds what raw model code lacks:

- **Batching** of requests that arrive at different times,
- **Memory management** for the KV cache,
- **Scheduling** and **queues**, with limits and priorities,
- An **API** (usually OpenAI-compatible) with streaming,
- **Metrics** for observability, and often quantization, parallelism and structured output.

## 2. Static versus continuous batching

**Static batching**: collect N requests, run them **together** until **all** finish, then start the next group. Requests that finish early leave their slot **idle**, while the longest request holds up everyone.

**Continuous batching** (also called in-flight batching) decides **at every decode step**: when a request finishes, a waiting request **takes its slot immediately**. The batch stays full.

Simulate both with the same 48 requests with random output lengths:

```run
mkdir -p ~/lab/aiinfra && cd ~/lab/aiinfra
cat > batching.py <<'EOF'
import random
random.seed(5)
SLOTS = 8                                        # the engine can decode 8 sequences per step
lengths = [random.randint(10, 200) for _ in range(48)]    # output tokens needed per request

def static(lengths):
    t, done_at, i = 0, [], 0
    while i < len(lengths):
        group = lengths[i:i + SLOTS]; i += SLOTS
        t += max(group)                          # everyone waits for the longest one
        done_at += [t] * len(group)
    return t, done_at

def continuous(lengths):
    t, done_at, waiting, running = 0, [], list(lengths), []
    while waiting or running:
        while waiting and len(running) < SLOTS:  # refill free slots every step
            running.append(waiting.pop(0))
        t += 1
        running = [r - 1 for r in running]
        finished = [r for r in running if r == 0]
        done_at += [t] * len(finished)
        running = [r for r in running if r > 0]
    return t, done_at

total = sum(lengths)
for name, fn in (("static batching", static), ("continuous batching", continuous)):
    steps, done = fn(lengths)
    print(f"{name:20} total steps {steps:5d}   tokens/step {total / steps:5.2f} (max {SLOTS})   mean completion {sum(done) / len(done):7.1f} steps")
EOF
python3 batching.py
```

Same work, same hardware: continuous batching finishes in far fewer steps and keeps the batch near its maximum, so **throughput rises and mean latency falls**. (Real engines also decide how to mix new requests' **prefill** with ongoing decode; **chunked prefill** splits a long prompt into pieces so it does not stall everyone's streaming.)

## 3. PagedAttention: memory like an operating system

The KV cache of each request **grows token by token** and its final length is unknown. The naive approach reserves **one contiguous slab per request sized for the maximum length**. Most of that slab is never used, and gaps between slabs cannot be reused: this is **internal and external fragmentation**, the same problem operating systems solved with **paging**.

**PagedAttention** (introduced by vLLM) splits the cache into small fixed-size **blocks** (for example 16 tokens), keeps a **block table** per request mapping logical positions to physical blocks, and allocates blocks **only as the sequence grows**. Freed blocks go back to a shared pool. Benefits: almost no wasted memory, and requests that share a prefix can **share blocks** (prefix caching, parallel sampling, beam search).

Count the difference for a memory budget:

```run
cd ~/lab/aiinfra
cat > paged.py <<'EOF'
import random
random.seed(9)
BUDGET_TOKENS = 32768          # KV memory the GPU has, measured in token slots
MAX_LEN = 4096                 # contiguous allocation must reserve the maximum possible length
BLOCK = 16
lengths = [random.randint(200, 1500) for _ in range(200)]    # real lengths are much shorter than the max

def contiguous():
    n = BUDGET_TOKENS // MAX_LEN
    used = sum(lengths[:n])
    return n, used

def paged():
    free, n, used = BUDGET_TOKENS // BLOCK, 0, 0
    for L in lengths:
        need = -(-L // BLOCK)                   # blocks needed, rounded up
        if need > free: break
        free -= need; n += 1; used += L
    return n, used

for name, fn in (("contiguous (reserve max)", contiguous), ("paged (16-token blocks)", paged)):
    n, used = fn()
    print(f"{name:26} requests held at once: {n:3d}   tokens actually used: {used:6d} of {BUDGET_TOKENS}   ({used / BUDGET_TOKENS:4.0%} utilisation)")
EOF
python3 paged.py
```

Paging holds **several times as many concurrent requests** in the same memory, and more concurrent requests means fuller batches and higher throughput. This single idea is why vLLM changed how LLMs are served.

## 4. The engines and where they fit

| Project | What it is (from its README, unless noted) |
|---|---|
| **vLLM** | a fast LLM inference and serving library. README highlights: PagedAttention, **continuous batching**, **chunked prefill**, **prefix caching**, CUDA graphs, quantization (FP8, INT8, INT4, GPTQ/AWQ, GGUF and more), optimised attention kernels, **speculative decoding**, **disaggregated prefill, decode and encode**, **tensor, pipeline, data, expert and context parallelism**, structured outputs, tool calling, an **OpenAI-compatible API server** (plus an Anthropic Messages API), multi-LoRA, and support for NVIDIA, AMD and Intel GPUs, CPUs and other accelerators |
| **SGLang** (from my knowledge) | a serving engine with a strong **prefix cache** (RadixAttention) and a programming layer for structured, multi-call LLM programs; popular for agent-style workloads |
| **TensorRT-LLM** (from my knowledge) | NVIDIA's library that **compiles** optimised engines for NVIDIA GPUs, aimed at the best performance on that hardware |
| **Triton Inference Server** | a general **model serving** platform: deploys models from many frameworks (TensorRT, PyTorch, ONNX, OpenVINO, Python, RAPIDS FIL and more) across cloud, data centre, edge, on GPUs and CPUs, with **dynamic batching**, concurrent model execution and ensembles. For LLMs it can host engines such as TensorRT-LLM or vLLM as backends. Not to be confused with OpenAI's **Triton language** for writing GPU kernels |
| **NVIDIA Dynamo** | per its README, **"the orchestration layer above inference engines"**: it does not replace SGLang, TensorRT-LLM or vLLM, it **turns them into a coordinated multi-node system** with disaggregated serving, **KV-aware routing**, an **SLA-based planner** for autoscaling, a KV block manager (KVBM), and fast cold starts. Its own rule: if you run **one model on one GPU**, the engine alone is probably enough (lesson 5) |
| **llama.cpp / Ollama** (from my knowledge) | local, laptop-friendly inference on CPUs and consumer GPUs with quantized GGUF models: great for learning and offline use, not for large multi-user serving |

Rule of thumb: pick **one engine** per model (vLLM is the most common starting point), add **Triton** if you serve many kinds of model (not only LLMs) behind one platform, and consider **Dynamo** when you operate **many GPUs or nodes** and need smart routing and scaling.

### What a launch looks like

```term
$ vllm serve meta-llama/Llama-3.1-8B-Instruct \
    --max-model-len 8192 --gpu-memory-utilization 0.90 \
    --max-num-seqs 128 --enable-prefix-caching
# Example, not run here: needs a GPU and the model weights.
$ curl http://localhost:8000/v1/chat/completions -H "Content-Type: application/json" \
    -d '{"model":"meta-llama/Llama-3.1-8B-Instruct","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

The settings that matter:

| Setting | Controls | Trade-off |
|---|---|---|
| `--gpu-memory-utilization` | fraction of VRAM the engine claims (weights + KV cache) | higher = more cache, less headroom for spikes |
| `--max-model-len` | longest context accepted | longer = more cache reserved per request in the worst case |
| `--max-num-seqs` | most sequences decoded together | higher = more throughput, higher per-user latency |
| `--tensor-parallel-size` | GPUs a model is split across | needed for big models; adds communication |
| `--enable-prefix-caching` | reuse cache for shared prompt prefixes | big win for shared system prompts |
| quantization options | smaller weights and cache | speed and capacity versus some accuracy |

Because the API is **OpenAI-compatible**, the same client code and agent frameworks work against a self-hosted engine: change the base URL.

:::warn Common mistakes
- **Benchmarking with one request at a time.** You measure latency but learn nothing about throughput under batching.
- **Setting `max-model-len` far above real need.** It limits how many requests fit.
- **Raising the batch limit without watching latency.** Throughput climbs and p99 ITL can follow.
- **Choosing an engine by headline benchmarks.** Test with **your** model, prompt lengths and concurrency.
- **Treating Triton (inference server) and Triton (GPU kernel language) as the same thing.**
:::

:::recap
- A serving engine adds batching, KV memory management, scheduling, an API and metrics around the model.
- **Continuous batching** refills the batch every step: higher throughput, lower latency than static batching.
- **PagedAttention** allocates KV memory in blocks, wasting almost none and enabling prefix sharing.
- vLLM, SGLang and TensorRT-LLM are engines; Triton is a general serving platform; Dynamo orchestrates engines across nodes.
:::

:::try Your turn
Change `SLOTS` in `batching.py` to 16 and 4. How do the total steps and the gap between the two strategies change? In `paged.py`, shrink `MAX_LEN` to 2048: does the contiguous strategy catch up, and what does that tell you about setting the maximum context length?
:::

:::quiz
? What does continuous batching do that static batching does not?
+ Refills a finished request's slot immediately, at every step
- Uses a larger model
- Stops requests early
- Removes the KV cache
! The batch stays full instead of waiting for the longest request.
? What problem does PagedAttention solve?
+ Wasted KV cache memory from reserving contiguous slabs
- Slow network links
- Tokenization errors
- Model accuracy
! Blocks are allocated only as sequences grow.
? According to its README, what is NVIDIA Dynamo's relationship to vLLM?
+ It is an orchestration layer above engines such as vLLM, not a replacement
- It replaces vLLM
- It is a tokenizer
- It only runs on CPUs
! Dynamo coordinates engines across many GPUs and nodes.
:::
