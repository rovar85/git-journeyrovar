---
track: aiinfra
title: Measuring inference: TTFT, ITL, throughput and bottlenecks
short: Measuring inference
sub: The latency and throughput vocabulary, how to compute percentiles from request timelines, and the roofline view that tells compute-bound from memory-bound work.
---

:::goals
- define TTFT, TPOT, inter-token latency, end-to-end latency, throughput and goodput
- compute latency percentiles from per-token timestamps
- explain arithmetic intensity and the compute-bound versus memory-bound distinction
- predict how batch size changes decode throughput and per-user speed
- name the profiling tools used on GPUs
:::

:::note Numbers in this lesson
The percentile code is **real**. The hardware figures (about 989 TFLOPS dense BF16 and about 3.35 TB/s of memory bandwidth for an H100 SXM-class GPU) are **approximate values from my own knowledge of public specifications**; check the datasheet for your card. The roofline program computes **ideal upper bounds**: real systems reach a fraction of them.
:::

## 1. The vocabulary

| Term | Meaning | Who cares |
|---|---|---|
| **TTFT** (time to first token) | request sent until the first output token arrives: queueing + prefill + network | interactive users: it is "how long until it starts answering" |
| **TPOT** (time per output token) | average time per generated token after the first | streaming speed |
| **ITL** (inter-token latency) | the **gap between consecutive tokens**, looked at per token: its spread shows stalls | users who notice stutter |
| **End-to-end latency** | `TTFT + (output tokens - 1) x TPOT` roughly | batch jobs, agents waiting for a full answer |
| **Throughput** | tokens per second **across all requests** (per GPU or per system) | cost: more tokens per GPU-hour is cheaper |
| **Goodput** | throughput of requests that **met their SLO** | what you actually deliver |

Two people can talk about the same server and mean opposite things: an operator wants **high throughput** (full batches), a user wants **low latency** (a small, quiet batch). Every inference system lives on that trade-off, so measure both.

Always report **percentiles**, never only the average: the p50 says what is typical, the **p95 and p99** say what your unluckiest users see, and an SLO is written against the tail.

## 2. Percentiles from a real timeline

Simulate token timestamps for 200 requests with realistic structure (queueing and prefill before the first token, steady decode afterwards, occasional stalls) and compute the metrics:

```run
mkdir -p ~/lab/aiinfra && cd ~/lab/aiinfra
cat > latency.py <<'EOF'
import random, statistics
random.seed(11)

def request():
    """Return (ttft, [inter-token gaps]) for one simulated request."""
    queue   = random.expovariate(1 / 0.05)               # waiting for a slot, mean 50 ms
    prefill = random.gauss(0.18, 0.03)                    # prompt processing, ~180 ms
    gaps = []
    for _ in range(random.randint(80, 300)):              # 80-300 output tokens
        gap = random.gauss(0.022, 0.004)                  # ~22 ms per token
        if random.random() < 0.03:                        # 3% of tokens hit a stall (batch change, GC, preemption)
            gap += random.uniform(0.2, 0.6)
        gaps.append(max(gap, 0.005))
    return queue + prefill, gaps

def pct(values, p):
    s = sorted(values)
    return s[min(len(s) - 1, int(p / 100 * len(s)))]

ttfts, all_gaps, tpots, e2e = [], [], [], []
for _ in range(200):
    ttft, gaps = request()
    ttfts.append(ttft); all_gaps += gaps
    tpots.append(statistics.mean(gaps)); e2e.append(ttft + sum(gaps))

def row(name, v, unit=1000):
    print(f"{name:22} p50 {pct(v, 50) * unit:7.0f} ms   p95 {pct(v, 95) * unit:7.0f} ms   p99 {pct(v, 99) * unit:7.0f} ms   mean {statistics.mean(v) * unit:7.0f} ms")

row("TTFT", ttfts)
row("TPOT (per request)", tpots)
row("ITL (every token gap)", all_gaps)
row("end-to-end latency", e2e)
print("\nNote how the ITL p99 is many times the p50: a few stalls dominate the tail even though the average looks healthy.")
EOF
python3 latency.py
```

Look at the **ITL** row: the median gap is about 22 ms but the p99 is far larger, because about 1 token in 33 stalled. The **average** hides this. An SLO such as "p95 ITL under 50 ms" would catch what a mean-latency alert would miss.

## 3. Compute-bound or memory-bound?

A GPU has two ceilings: how many arithmetic operations per second it can do (**peak FLOPS**) and how many bytes per second it can read from memory (**bandwidth**). The **arithmetic intensity** of a workload is the number of operations it does **per byte it reads**:

- High intensity (many operations per byte): the arithmetic units are the limit: **compute-bound**.
- Low intensity (few operations per byte): the memory system is the limit: **memory-bound**.

The dividing line, the **ridge point**, is `peak FLOPS / bandwidth` (about 989e12 / 3.35e12, roughly 295 operations per byte for the example GPU).

**Decode at batch size 1** reads **every weight once** to produce **one** token. Each weight (2 bytes in BF16) takes part in 2 operations (multiply and add): about **1 operation per byte**, far below the ridge. So decode is **memory-bound**: its speed is set by how fast the weights can be read, `time per step ≈ weight bytes / bandwidth`.

Batching helps because all requests in the batch **share the same weight reads**: doubling the batch roughly doubles the operations per byte. Throughput climbs almost for free until the batch is big enough to hit the **compute** ceiling. Compute it:

```run
cd ~/lab/aiinfra
cat > roofline.py <<'EOF'
PARAMS   = 8e9                 # 8B-parameter model
W_BYTES  = PARAMS * 2          # BF16 weights
PEAK     = 989e12              # FLOPS, approximate H100-class dense BF16
BW       = 3.35e12             # bytes/s HBM bandwidth, approximate

ridge = PEAK / BW
print(f"ridge point: {ridge:.0f} operations per byte; decode at batch 1 is {2 * PARAMS / W_BYTES:.0f} operation per byte -> memory-bound\n")
print(f"{'batch':>6} {'step time':>10} {'bound by':>10} {'tokens/s total':>15} {'tokens/s per user':>18}")
for b in (1, 2, 8, 32, 128, 256, 512, 1024):
    t_mem  = W_BYTES / BW                      # read all weights once per step
    t_comp = 2 * PARAMS * b / PEAK             # 2 FLOPs per parameter per token in the batch
    t = max(t_mem, t_comp)
    print(f"{b:6d} {t * 1000:8.2f}ms {'memory' if t_mem >= t_comp else 'compute':>10} {b / t:15,.0f} {1 / t:18.0f}")

print("\nPrefill of a 2,000-token prompt (all tokens in one pass):")
t_prefill = 2 * PARAMS * 2000 / PEAK
print(f"  ideal compute time: {t_prefill * 1000:.0f} ms  (compute-bound: intensity is about 2000 operations per weight byte)")
EOF
python3 roofline.py
```

What the table teaches:

1. At batch 1 an 8B model on this GPU is capped near **200 tokens/s** by memory bandwidth alone, however fast the arithmetic units are. This is the **ideal ceiling**: real engines reach part of it.
2. Throughput grows almost **linearly with batch size** while the step time stays flat, until the batch passes the ridge (a few hundred in this idealised model). That is why serving engines work so hard to keep batches full (lesson 4).
3. **Per-user speed** (the last column) stays flat and then **drops** once the GPU is compute-bound. More users per GPU is cheaper, up to the point where each user slows down: the **latency/throughput trade-off** in numbers.
4. **Prefill** is compute-bound, so a long prompt costs time proportional to its length, regardless of memory bandwidth.

In practice the **KV cache reads** add to the memory traffic at long contexts, and attention has its own patterns, so real decode is **more** memory-heavy than this model says. The qualitative picture holds.

## 4. Profiling a GPU

You find the real bottleneck by **measuring**, in layers, from cheap to deep:

| Tool | Level | Use |
|---|---|---|
| `nvidia-smi`, `nvidia-smi dmon` | whole GPU | memory, utilisation, power, clocks: "is it busy, is it throttling" |
| **DCGM** exporter | whole GPU, continuous | GPU metrics into Prometheus (lesson 9) |
| **Nsight Systems** (`nsys profile ...`) | timeline | when kernels run, gaps, CPU-GPU overlap, communication |
| **Nsight Compute** (`ncu ...`) | one kernel | whether a kernel is compute- or memory-bound, achieved bandwidth |
| **PyTorch profiler** | framework | which operations take the time |
| **Engine metrics** (vLLM, Triton) | the serving layer | queue length, batch size, KV cache usage, TTFT and ITL histograms |

```term
$ nsys profile -o report --trace=cuda,nvtx python serve_benchmark.py     # Example, not run here
$ nsys stats report.nsys-rep                                             # summary tables of kernels and memory copies
```

:::warn Common mistakes
- **Reporting averages.** Tail latency is what users and SLOs care about.
- **Benchmarking with unrealistic traffic.** One request at a time shows best-case latency and worst-case cost; a flood shows the reverse. Test the **arrival pattern, prompt lengths and output lengths** you will really see.
- **Mixing up TTFT and TPOT.** They have different causes (queue and prefill versus decode and batching) and different fixes.
- **Optimising compute when memory is the limit.** A faster GPU with the same bandwidth will not speed up batch-1 decode much.
- **Trusting peak numbers.** Achieved FLOPS and bandwidth are lower; measure.
:::

:::recap
- Know the terms: TTFT, TPOT, ITL, end-to-end latency, throughput, goodput. Report **p50, p95, p99**.
- Prefill is **compute-bound**, decode is **memory-bound**. Batching raises throughput nearly for free until the compute ceiling, then per-user speed falls.
- The ridge point is peak FLOPS divided by bandwidth; compare a workload's operations per byte with it.
- Profile in layers: `nvidia-smi`, DCGM, Nsight Systems, Nsight Compute, engine metrics.
:::

:::try Your turn
In `roofline.py` change `PARAMS` to 70e9 and `BW` to 2.0e12 (an A100-class card) and `PEAK` to 312e12. What is the single-request decode ceiling now, and at what batch size does the model flip from memory-bound to compute-bound? Then change the stall probability in `latency.py` from 3% to 0.3% and compare the ITL p99.
:::

:::quiz
? Which metric describes how long a user waits before the answer starts?
+ TTFT
- TPOT
- Throughput
- Goodput
! Time to first token includes queueing and prefill.
? Why does batching increase decode throughput so cheaply?
+ All requests in the batch share the same weight reads from memory
- It makes the model smaller
- It removes the KV cache
- It lowers the clock speed
! More operations per byte moved.
? Why report p99 instead of the mean?
+ The tail shows what unlucky users experience and what SLOs are written against
- The mean is always wrong
- Percentiles are cheaper to compute
- GPUs only produce percentiles
! A few stalls can wreck the experience while the mean looks fine.
:::
