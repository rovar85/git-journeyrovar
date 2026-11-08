---
track: aibank
title: "AI incident scenarios, read the evidence (part 4 of 10)"
short: Incidents 4
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## CUDA graphs turned off to start faster

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-30B-A3B-Instruct-2507; hardware: one GB10 with 128 GB of unified memory*

A team runs `Qwen/Qwen3-30B-A3B-Instruct-2507` on GB10 nodes behind an autoscaler. New pods take more than six minutes to become ready, so the autoscaler starts extra pods during every ramp and the bill grows. An engineer reads the startup log, sees that it captures CUDA graphs twice, and proposes to disable both graph backends: "capture is pure startup cost, and the prefill capture alone takes half a minute". A reviewer blocks the change: "graphs are what make decode fast, you will double the time per token".

Both have read the same log and neither has measured. The pod has been restarted with each setting, and the kit output for both servers is on the shared drive.

**Evidence: the server command with both graph backends disabled**

```text
title: the server command with both graph backends disabled
source: manuals/sglang-101/capture/gpu/out-gb10/server-no-cuda-graph.command.txt
lang: bash
note: The two flags at the end are the change.
---
sglang serve --model-path Qwen/Qwen3-30B-A3B-Instruct-2507 --host 127.0.0.1 --port 30000 --enable-cache-report --enable-metrics --mem-fraction-static 0.7 --cuda-graph-backend-decode disabled --cuda-graph-backend-prefill disabled

```

**Evidence: the end of startup on the default server, with the timings line**

```text
title: the end of startup on the default server, with the timings line
source: manuals/sglang-101/capture/gpu/out-gb10/server-default.log
lines: 28-32
lang: text
note: Read the decode capture line, the pool size, and the startup timings with the two capture times inside them.
---
[2026-10-17 14:19:12] Capture target decode CUDA graph end. bs=[1, 2, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224, 232, 240, 248, 256], elapsed=4.61 s, mem usage=1.73 GB, avail mem=26.95 GB.
[2026-10-17 14:19:12] max_total_num_tokens=227243, chunked_prefill_size=8192, max_prefill_tokens=16384, max_running_requests=2048, context_len=262144, available_gpu_mem=26.95 GB
[2026-10-17 14:19:12] Init Unified Radix Cache. Components: (<ComponentType.FULL: 0>,). Tree Core: RustUnifiedTreeCore
[2026-10-17 14:19:12] Tree cache initialized: source=default impl=UnifiedRadixCache hybrid_swa=False hybrid_ssm=False hicache_attached=False
[2026-10-17 14:19:12] Engine startup timings (s): load_weight=323.61, kv_cache_allocation=2.09, scheduler_e2e=369.03, cuda_graph={prefill=35.06, decode=4.61, target_verify=0.00, draft_prefill=0.00, draft_decode=0.00, draft_extend=0.00}, tokenizer_e2e=373.52

```

**Evidence: the startup phases of the server without graphs**

```text
title: the startup phases of the server without graphs
source: manuals/sglang-101/capture/gpu/out-gb10/server-no-cuda-graph.log
lines: 21-25
lang: text
note: Compare scheduler_e2e and tokenizer_e2e with the default server.
---
[2026-10-17 14:36:42] Disable prefill CUDA graph because cuda_graph_config resolved prefill.backend='disabled' (e.g. via --cuda-graph-backend-prefill=disabled or auto-disable rules).
[2026-10-17 14:36:42] max_total_num_tokens=258017, chunked_prefill_size=8192, max_prefill_tokens=16384, max_running_requests=2048, context_len=262144, available_gpu_mem=31.20 GB
[2026-10-17 14:36:42] Init Unified Radix Cache. Components: (<ComponentType.FULL: 0>,). Tree Core: RustUnifiedTreeCore
[2026-10-17 14:36:42] Tree cache initialized: source=default impl=UnifiedRadixCache hybrid_swa=False hybrid_ssm=False hicache_attached=False
[2026-10-17 14:36:44] Engine startup timings (s): load_weight=322.24, kv_cache_allocation=2.07, scheduler_e2e=341.39, cuda_graph={prefill=0.00, decode=0.00, target_verify=0.00, draft_prefill=0.00, draft_decode=0.00, draft_extend=0.00}, tokenizer_e2e=346.34

```

**Evidence: median TPOT and output with and without graphs, three seeds, 1 to 64 users**

```text
title: median TPOT and output with and without graphs, three seeds, 1 to 64 users
source: manuals/sglang-101/sections/4-1-forwardmode-and-cuda-graphs.md
lines: 95-105
lang: text
note: Read the two TPOT columns row by row, then the reading under the table.
---
**We measured** two servers with three seeds at each concurrency from 1 to 64. The default server replayed a decode graph on every decode batch, and its log says `cuda graph: True`. The server with both graph backends set to `disabled` logged `cuda graph: False`. The results were almost the same:

| Concurrency | Median TPOT with graphs | Median TPOT without | Output tok/s with graphs | Output tok/s without |
|---|---|---|---|---|
| 1 | 32.52 ms | 33.09 ms | 29.14 | 28.72 |
| 8 | 102.21 ms | 104.77 ms | 74.11 | 73.46 |
| 64 | 254.06 ms | 253.77 ms | 235.38 | 235.79 |

The two lines lie on top of each other in [figure 5.1c](#fig-5-1c). The graphs still cost startup time and memory. The decode capture took 4.61 s and 1.73 GB, and the prefill capture took 35.06 s and 2.14 GB.

Our reading of this result: one decode step of this model takes about 32 ms at batch 1. The launch time that a graph removes is small next to that step. Each step reads the weights of the experts that its tokens chose, and memory bandwidth sets the time.

```

**Evidence: one kit run at one user with graphs on**

```text
title: one kit run at one user with graphs on
source: manuals/sglang-101/capture/gpu/out-gb10/bench-random-c1.txt
lines: 34-51
lang: text
note: Read the median TPOT and the P99 ITL.
---
---------------Time to First Token----------------
Mean TTFT (ms):                          209.92    
Median TTFT (ms):                        241.36    
P90 TTFT (ms):                           268.58    
P95 TTFT (ms):                           278.05    
P99 TTFT (ms):                           289.92    
-----Time per Output Token (excl. 1st token)------
Mean TPOT (ms):                          30.82     
Median TPOT (ms):                        30.84     
P90 TPOT (ms):                           30.92     
P95 TPOT (ms):                           31.05     
P99 TPOT (ms):                           31.29     
---------------Inter-Token Latency----------------
Mean ITL (ms):                           30.82     
Median ITL (ms):                         30.79     
P90 ITL (ms):                            31.45     
P95 ITL (ms):                            31.67     
P99 ITL (ms):                            32.21     

```

**Evidence: the same kit run at one user with graphs off**

```text
title: the same kit run at one user with graphs off
source: manuals/sglang-101/capture/gpu/out-gb10/no-cuda-graph-bench-random-c1.txt
lines: 34-51
lang: text
note: Compare the median TPOT and the P99 ITL with the run before.
---
---------------Time to First Token----------------
Mean TTFT (ms):                          263.80    
Median TTFT (ms):                        291.11    
P90 TTFT (ms):                           354.70    
P95 TTFT (ms):                           373.75    
P99 TTFT (ms):                           413.63    
-----Time per Output Token (excl. 1st token)------
Mean TPOT (ms):                          31.29     
Median TPOT (ms):                        31.29     
P90 TPOT (ms):                           31.37     
P95 TPOT (ms):                           31.46     
P99 TPOT (ms):                           31.60     
---------------Inter-Token Latency----------------
Mean ITL (ms):                           31.29     
Median ITL (ms):                         31.40     
P90 ITL (ms):                            32.73     
P95 ITL (ms):                            33.31     
P99 ITL (ms):                            41.72     

```

**Evidence: the position of the manual on graphs, memory and startup**

```text
title: the position of the manual on graphs, memory and startup
source: manuals/sglang-101/sections/4-1-forwardmode-and-cuda-graphs.md
lines: 143-149
lang: text
note: Read the last paragraph.
---
## Our position

Keep CUDA graphs on, and size them to your traffic. The default `max_bs` suits moderate concurrency. If your benchmark or your production peak runs more requests than that, set `--cuda-graph-max-bs-decode` and `--max-running-requests` to your target before you measure. SemiAnalysis InferenceX recipes {{field InferenceX 2026-05}} derive both values from the concurrency they test.

Do not expect graphs to make a slow decode fast on every machine. On the GB10, one decode step of a mixture-of-experts model takes tens of milliseconds, and graphs changed it by 3 percent or less. On the L4, with a dense 8B model, they saved about 1 percent. The worst token gap was shorter without them at 16 and 32 users. Measure the median and the tail, with and without graphs, before you blame the launch path.

Do not turn graphs off to fix memory. If capture runs out of memory, lower `--cuda-graph-max-bs-decode` or `--mem-fraction-static`. A server without decode graphs pays launch time on every token for every user.

```

**Questions**

1. From the startup timings line, where do the six minutes go, and how much of that is graph capture?
2. What does a CUDA graph remove from a decode step, and on which model and GPU is that removal worth the most?
3. Read the two kit runs at one user. What did graphs change in the typical token gap, and what in the worst one?
4. The three-seed table shows a GB10 result that differs from the L4 result in the manual. Why would two cards disagree about the same feature?
5. Does disabling graphs fix the autoscaler? What does?
6. When would the reviewer be right? Name the model shape and the load.

:::answer Show the answer
:::say Short answer
Neither engineer was right about the size. Disabling the graphs saved the capture, 35.06 s for prefill and 4.61 s for decode, and the start still took 346.34 s instead of 373.52, because 322.24 s of weight load dominate the start. On the decode side the reviewer's fear did not materialize on this model and card: the median time per token changed by 3 percent or less from 1 to 64 users, and the output stayed within the seed spread.
:::

**Walkthrough**

1. **Read the timings line of the default server.** It reads `load_weight=323.61`, `kv_cache_allocation=2.09`, `scheduler_e2e=369.03`, `cuda_graph={prefill=35.06, decode=4.61, ...}` and `tokenizer_e2e=373.52`. The weight load is 323.61 s of a 373.52 s start. The prefill capture took 35.06 s and the decode capture 4.61 s. The captures also cost memory: the section gives 2.14 GB for prefill and 1.73 GB for decode.
2. **Read the startup without graphs.** The server logged that the prefill graph was disabled because the config resolved the backend to `disabled`, allocated a pool of 258017 tokens against 227243 with graphs, and finished with `scheduler_e2e=341.39` and `tokenizer_e2e=346.34`, with every graph field at 0.00. Its weight load was 322.24 s. So the change saved the capture time and bought a larger pool, and the start still took 346.34 s, because 322.24 s of weight load sit inside it.
3. **Know what a graph saves.** A decode step is hundreds of small kernel launches, one token per request each. A graph records them once and replays them with one CPU call. The saving is launch time, a fixed cost per step that matters when the step itself is short: a small dense model on a fast GPU at batch 1 is the case the mechanism was built for.
4. **Read the three-seed table.** On this mixture-of-experts model on the GB10, the median TPOT was 32.52 ms with graphs against 33.09 without at one user, 102.21 against 104.77 at 8 users, and 254.06 against 253.77 at 64. Output was 29.14 against 28.72, 74.11 against 73.46, and 235.38 against 235.79. The manual's reading: a step of this model takes about 32 ms at batch 1, memory bandwidth sets that time, and the launch time a graph removes is small next to it.
5. **Read the kit's single runs.** At one user with graphs: a median TPOT of 30.84 ms, a median ITL of 30.79 and a P99 ITL of 32.21. Without graphs: 31.29, 31.40 and 41.72. The medians agree with the three-seed table. The P99 ITL moved more, from 32.21 to 41.72 ms, but these are single runs with no clock record, so the tail is a lead to measure, not a result. At 8 users the kit read 97.30 against 100.03 ms. Do not use the first-token column of these runs for the comparison, because the kit never flushed the cache between runs.
6. **Read the position.** Keep graphs on and size them to your traffic. Do not turn them off to fix memory; lower `--cuda-graph-max-bs-decode` or `--mem-fraction-static` instead. On the GB10 graphs changed decode by 3 percent or less, and on the L4 with a dense 8B model they saved about 1 percent of each step. The old flag `--disable-cuda-graph` still works at v0.5.22 and is deprecated in favor of the two per-phase flags in the command.

**Resolution**

Neither engineer was right about the size. Disabling the graphs saved the capture, 35.06 s for prefill and 4.61 s for decode, and the start still took 346.34 s instead of 373.52, because 322.24 s of weight load dominate the start. On the decode side the reviewer's fear did not materialize on this model and card: the median time per token changed by 3 percent or less from 1 to 64 users, and the output stayed within the seed spread.

So the change does not solve the ramp, and the weight load is the problem to work on. Keep the weights on a local drive, keep the server running between ramps, mount the kernel caches and the model cache on volumes that survive the pod, and set the readiness probe and the scale-up policy from the measured 373.52 s, as the operating page describes. Keep the graphs on, because a server without decode graphs pays launch time on every token for every user, and that cost shows on smaller dense models where the step is short. If the team wants the memory back, the lever is `--cuda-graph-max-bs-decode`, not the capture itself. Before any change of this kind, measure the pair with a clock record and three seeds, as the table did, and read the tail as well as the median.

**Wrong turns**

- "Capture is pure startup cost, so remove it." It is 35.06 plus 4.61 s of a start that spends 323.61 s loading weights. Removing it moved the start from 373.52 to 346.34 s and left the ramp problem in place.
- "Without graphs the time per token doubles." On this mixture-of-experts model on the GB10, the median TPOT moved from 32.52 to 33.09 ms at one user and from 254.06 to 253.77 at 64. The step is bound by memory bandwidth, not by launches.
- "The GB10 result settles it for every model." On the L4 with a dense 8B model the graphs saved about 1 percent of each step, and on a small model on a fast GPU the launch share is larger still. The saving is a property of the step length.
- "Turn graphs off to get the KV pool back." The pool grew from 227243 to 258017 tokens, but the manual says to lower the graph batch size or the memory fraction instead, so that decode keeps its graphs.
- "Read the kit's first-token column to settle the tail." The kit never flushed the cache between runs, so the first token is not comparable. The P99 ITL gap at one user, 32.21 against 41.72 ms, needs a run with seeds and a clock record first.

**Generalize**

Read where the time goes before you remove a phase. A startup, like a decode step, is a sum of parts of very different sizes, and the part that is easy to remove is rarely the part that dominates. Measure the cost and the gain of a feature on your own model and GPU, at your load, with seeds and a clock record, because a saving that is real on one step length is noise on another.

:::

## FP8 cleared the queue at 64 users

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-8B in BF16, against Qwen/Qwen3-8B-FP8 with an FP8 KV cache; hardware: one L4 with 24 GB of memory*

A team serves `Qwen/Qwen3-8B` in BF16 on one L4 for an internal assistant. At 64 concurrent users the median first token is about eighteen seconds and the GPU reports full utilization. The on-call engineer reads one decode line from the scheduler log: 38 running requests, a token usage of 0.99 and 26 requests waiting. The team's first plan is a second L4 and a load balancer in front of the pair.

A colleague proposes a checkpoint of this model in FP8, with an FP8 KV cache on the same card. The team worries about accuracy, and about a change of two things at once. You have the startup logs of both servers from the same sweep, one decode line from each at 64 users, the accuracy run and the manual's table.

**Evidence: one decode line from each server at 64 users**

```text
title: one decode line from each server at 64 users
source: manuals/sglang-101/capture/gpu/out-l4/server-load-c64-scheduler.log
lang: text
note: Compare the running requests, the token usage and the queue between the two lines.
---
# runs/l4/load/default/server.log (BF16), the decode line with the most running requests at the highest token usage
[2026-10-16 20:31:03] Decode batch, #running-req: 38, #token: 23810, token usage: 0.99, cuda graph: True, gen throughput (token/s): 448.67, #queue-req: 26
# runs/l4/load/fp8/server.log (FP8 weights and KV), the decode line at 64 running requests with the highest token usage
[2026-10-16 21:34:09] Decode batch, #running-req: 64, #token: 40635, token usage: 0.29, cuda graph: False, gen throughput (token/s): 1143.15, #queue-req: 0

```

**Evidence: the BF16 server at startup: weights and pool**

```text
title: the BF16 server at startup: weights and pool
source: manuals/sglang-101/capture/gpu/out-l4/server-load-default.log
lang: text
note: The weights take 15.28 GB and the pool holds 24094 tokens.
---
[2026-10-16 19:26:38] Load weight end. elapsed=3.92 s, type=Qwen3ForCausalLM, avail mem=6.59 GB, mem usage=15.28 GB.
[2026-10-16 19:26:40] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 24094, K size: 1.65 GB, V size: 1.65 GB

```

**Evidence: the FP8 server at startup: weights and pool**

```text
title: the FP8 server at startup: weights and pool
source: manuals/sglang-101/capture/gpu/out-l4/server-load-fp8.log
lang: text
note: The weights take 8.81 GB and the pool holds 142369 tokens in one byte per value.
---
[2026-10-16 20:33:02] Load weight end. elapsed=2.54 s, type=Qwen3ForCausalLM, quant=fp8, fmt=e4m3, avail mem=13.06 GB, mem usage=8.81 GB.
[2026-10-16 20:33:05] KV Cache is allocated. dtype: torch.float8_e4m3fn, #tokens: 142369, K size: 4.89 GB, V size: 4.89 GB

```

**Evidence: the FP8 start: the checkpoint detection and the warning about scales**

```text
title: the FP8 start: the checkpoint detection and the warning about scales
source: manuals/sglang-101/capture/gpu/out-l4/server-fp8.log
lines: 16-21
lang: text
note: Read the line about scaling factors before the weight and pool lines.
---
[2026-10-17 15:22:01] Detected fp8 checkpoint.
[2026-10-17 15:22:01] Found local HF snapshot for Qwen/Qwen3-8B-FP8 at /data/sglang/hf/hub/models--Qwen--Qwen3-8B-FP8/snapshots/220b46e3b2180893580a4454f21f22d3ebb187d3; skipping download.

Multi-thread loading shards:   0% Completed | 0/2 [00:00<?, ?it/s]
Multi-thread loading shards:  50% Completed | 1/2 [00:00<00:00,  1.08it/s]
Multi-thread loading shards: 100% Completed | 2/2 [00:01<00:00,  1.07it/s]
Multi-thread loading shards: 100% Completed | 2/2 [00:01<00:00,  1.07it/s]
[2026-10-17 15:22:04] Using FP8 KV cache but no scaling factors provided. Defaulting to scaling factors of 1.0.
[2026-10-17 15:22:04] Load weight end. elapsed=2.23 s, type=Qwen3ForCausalLM, quant=fp8, fmt=e4m3, avail mem=12.87 GB, mem usage=8.81 GB.
[2026-10-17 15:22:05] KV Cache is allocated. dtype: torch.float8_e4m3fn, #tokens: 140058, K size: 4.81 GB, V size: 4.81 GB

```

**Evidence: throughput and first token from 1 to 64 users, both servers**

```text
title: throughput and first token from 1 to 64 users, both servers
source: manuals/sglang-101/sections/4-3-quantization.md
lines: 162-169
lang: text
note: Read the two rightmost columns at 32 and 64 users.
---
**We measured** a pool of 24,094 tokens for BF16 and 142,369 tokens for FP8, 5.91 times as many. Each request in the sweep had 512 input tokens and 128 output tokens. The BF16 pool held about 37 such requests.

| Concurrency | BF16 output tok/s | FP8 output tok/s | BF16 median TTFT | FP8 median TTFT |
|---|---|---|---|---|
| 1 | 13.42 | 24.53 | 189.16 ms | 140.72 ms |
| 16 | 201.09 | 313.92 | 211.78 ms | 147.52 ms |
| 32 | 270.11 | 507.20 | 2,969.61 ms | 199.09 ms |
| 64 | 250.85 | 735.91 | 18,348.57 ms | 296.42 ms |

```

**Evidence: what the scheduler log says about 64 users, and the goodput result**

```text
title: what the scheduler log says about 64 users, and the goodput result
source: manuals/sglang-101/sections/4-3-quantization.md
lines: 179-183
lang: text
note: The target was a first token under 1 s and a time per token under 100 ms.
---
The scheduler log of the sweep shows the cause at concurrency 64. The BF16 server ran at most 38 requests, with token usage at 0.99 and 26 requests in the queue. The FP8 server ran all 64 requests at token usage 0.29 with an empty queue. The BF16 throughput fell from 32 to 64 because more requests waited, and each waiting request added its wait to TTFT.

At concurrency 1 the pool size does not matter, and FP8 was still faster: 39.66 ms per token against 60.16 ms. That is the GB10 effect again. Decode on an L4 reads every weight for every token, and FP8 weights are half the bytes.

On this card the goodput result is clear. Our target was TTFT under 1 s and TPOT under 100 ms. BF16 served 0 requests per second within target at concurrency 32 and 64. FP8 served 2.87 requests per second within target at 64.

```

**Evidence: GSM8K accuracy on 500 questions for the four SGLang configs**

```text
title: GSM8K accuracy on 500 questions for the four SGLang configs
source: manuals/sglang-101/capture/gpu/out-l4/gsm8k-fp8-accuracy.txt
lines: 6-13
lang: text
note: Read the sentence about scales first, then the width of each interval.
---
Neither checkpoint carries KV scales, so the FP8 KV runs used a scale of 1.0.
vLLM FP8 KV runs used --attention-backend TRITON_ATTN, because the FlashInfer FP8 prefill kernel does not build on this host.

engine   config                     correct   accuracy   Wilson 95% interval
SGLang   BF16                       458/500   91.6%      88.8 to 93.7
SGLang   FP8 weights                456/500   91.2%      88.4 to 93.4
SGLang   FP8 KV cache               458/500   91.6%      88.8 to 93.7
SGLang   FP8 weights + FP8 KV       460/500   92.0%      89.3 to 94.1

```

**Questions**

1. Read the two decode lines. Why does the BF16 server run 38 requests and not 64, and what does the usage column tell you?
2. From the two startup listings, which two numbers changed, and which of them grew the pool?
3. The FP8 log prints a warning about scaling factors. What does it mean, and what must you check before you trust it?
4. The table shows FP8 faster at one user too. Why does the pool not explain that row?
5. Two things changed at once. What can you claim from this sweep, and what would you still measure before the rollout?
6. Which goodput target did the manual use, and what did each server deliver at 64 users?

:::answer Show the answer
:::say Short answer
The queue was the pool. The BF16 pool of 24094 tokens held about 37 requests of this shape, so 26 of 64 users waited, and the wait went into their first token. FP8 weights and an FP8 KV cache made the pool 5.91 times larger on the same card. At 64 users the queue was empty, the median first token was 296.42 ms, and the server delivered 2.87 requests per second within the goodput target where BF16 delivered none.
:::

**Walkthrough**

1. **Read the pool in the decode line.** The BF16 line holds 23810 tokens at usage 0.99, so the pool is full. Each request in the sweep carries 512 input tokens and 128 output tokens, and the manual counts that the BF16 pool holds about 37 such requests. The server ran 38 and parked the other 26 in the queue, and each parked request added its wait to its own first token. The FP8 line runs all 64 requests at 40635 tokens and usage 0.29 with an empty queue. The GPU was busy on both servers, so utilization never showed the difference. The pool did.
2. **Read what changed at startup.** Two numbers moved. The weights took 15.28 GB in BF16 and 8.81 GB in FP8, and the freed memory went to the pool. The cache data type went from bfloat16 to float8_e4m3fn, which halves the bytes per token. Together the pool went from 24094 tokens to 142369, which the manual gives as 5.91 times as many. The data type alone would double the pool, and the smaller weights give the rest. Both servers used one memory fraction, 0.85, so the comparison is fair on memory.
3. **Read the warning.** The FP8 start detects the checkpoint, then prints that no scaling factors were provided and that every scale defaults to 1.0. The checkpoint carries weight scales and no KV scales, so every key and value is stored with a scale of 1.0. The accuracy file says the same in its first line. Before you trust that, search the weight index for tensor names that end in `k_scale` or `v_scale`, and read the load log for scales that the loader skipped. The scenario on the other engine shows what happens when a loader drops scales that exist.
4. **Read the table at one user.** FP8 gave 24.53 output tokens per second against 13.42, and a first token of 140.72 ms against 189.16 ms. At one user the pool does not matter, so this row is the weights. Decode on an L4 reads every weight for every token, and FP8 weights are half the bytes; the manual gives 39.66 ms per token against 60.16 ms. At 32 users the BF16 first token was already 2,969.61 ms against 199.09 ms, and at 64 users it was 18,348.57 ms against 296.42 ms. The BF16 throughput fell from 270.11 to 250.85 tokens per second between 32 and 64 users, because more requests waited.
5. **Read the goodput.** The manual's target was a first token under 1 s and a time per token under 100 ms. BF16 served 0 requests per second within target at 32 and at 64 users. FP8 served 2.87 requests per second within target at 64. That is the number a user feels, and it is the number to put in the proposal.
6. **Read the accuracy check.** On the first 500 GSM8K questions, 8-shot and greedy, the four SGLang configs scored 458, 456, 458 and 460 correct, and every interval overlaps every other. The run did not show a difference. It also cannot rule out a loss of a few points at this sample size, and it covers one model and one benchmark.

**Resolution**

The queue was the pool. The BF16 pool of 24094 tokens held about 37 requests of this shape, so 26 of 64 users waited, and the wait went into their first token. FP8 weights and an FP8 KV cache made the pool 5.91 times larger on the same card. At 64 users the queue was empty, the median first token was 296.42 ms, and the server delivered 2.87 requests per second within the goodput target where BF16 delivered none.

The team ships the FP8 pair with three conditions written next to the result. The sweep changed the weights and the cache together, so the gain is claimed for the pair, not for either alone. The KV scale was 1.0 on this checkpoint, and the manual's check for scales in the index and in the load log is recorded with the deployment. The accuracy check on 500 questions bounded the loss at a few points on one benchmark, so the team repeats it on their own prompts before the switch. The second L4 waits until the FP8 pool fills.

**Wrong turns**

- "Buy a second L4 and balance across both." The queue came from a pool of 24094 tokens that held about 37 requests. A second card doubles the pool at twice the cost, and the FP8 pool was 5.91 times larger on one card.
- "Change one thing: keep BF16 weights and switch only the KV cache to FP8." A fair experiment, and this sweep did not run it. The manual's evidence for an FP8 cache alone is a field report, and that cache needs a scale file.
- "The accuracy matched, so FP8 is safe for every model." The check covered one model, one benchmark and 500 questions. It bounds the loss at a few points, and a different model can lose more.
- "FP8 is faster per token, so switch for speed." The manual's position is to choose the KV cache data type from memory, not from speed. Here the queue was the symptom and the pool was the cause; the speed gain at one user is a second effect.

**Generalize**

When requests queue while the GPU is busy, read the pool before you read the kernels. A full pool is a capacity problem, and the cheapest capacity on one card is bytes per token: smaller weights free memory for the cache, and a smaller cache data type doubles what fits. Pay for it with an accuracy check on your own task, and write down which scale the cache used.

:::

## Five identical calls and a run that ended itself

*Level 2 · incident · about 20 minutes · version: docker-agent v1.149.0 and sbx v0.47.0; model: ai/qwen3:4b through the local model runner, at temperature 0; hardware: one Mac, no GPU*

A coordinator agent runs in a nightly job with `--exec`, and nobody watches a terminal. Its agent file gives it one sub-agent, a writer, and the `background_agents` toolset, so that it can start the writer in the background, wait, and repeat the writer's sentence. The job has worked for weeks when the coordinator used `transfer_task`. A teammate changed the user message to ask for a background agent, and the next run stopped with exit 1 and the line `Agent terminated: detected 5 consecutive identical calls to run_background_agent`.

The teammate reads the line as a runtime bug: the model was working, and the runtime killed it. The proposed fix is to raise the limit on repeated calls and to swap the model. You review the run before either change ships.

**Evidence: the coordinator agent of the team file**

```text
title: the coordinator agent of the team file
source: manuals/docker-sandboxes-101/capture/fixtures/agents/team.yaml
lines: 3-15
lang: yaml
note: The root agent has an iteration limit, one sub-agent, one handoff target and the background_agents toolset.
---
agents:
  root:
    model: local
    description: Coordinates a writer and a reviewer.
    instruction: |
      You coordinate two colleagues and never write text yourself.
      For every request: first call transfer_task to ask the writer for
      the text, then call handoff to pass the conversation to the reviewer.
    max_iterations: 6
    sub_agents: [writer]
    handoffs: [reviewer]
    toolsets:
      - type: background_agents

```

**Evidence: the same coordinator one run earlier, with transfer_task**

```text
title: the same coordinator one run earlier, with transfer_task
source: manuals/docker-sandboxes-101/capture/out/19-transcript.txt
lines: 1-2
lang: text
note: The transfer_task call ran under --exec with no confirmation.
---
user: Ask the writer for one sentence about microVMs.
root -> tool_call transfer_task {"agent": "writer", "task": "Generate one sentence about microVMs", "expected_output": "A single sentence describing microVMs"}

```

**Evidence: the user message, the first background-agent call, and what came back**

```text
title: the user message, the first background-agent call, and what came back
source: manuals/docker-sandboxes-101/capture/out/19-background.txt
lines: 1-3
lang: text
note: The call raised a confirmation, and the tool response says the user rejected it.
---
user: Run the writer as a background agent on the topic microVMs, wait for it, and repeat its sentence.
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "run_background_agent", "arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\", \"expected_output\": \"A single sentence about microVMs\"}"}}, "metadata": {"safety_label": "unknown"}}
root <- tool_call_response Run Background Agent: The user rejected the tool call.

```

**Evidence: the next five calls and their five answers**

```text
title: the next five calls and their five answers
source: manuals/docker-sandboxes-101/capture/out/19-background.txt
lines: 4-13
lang: text
note: Compare the arguments of each call with the one before it.
---
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "run_background_agent", "arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\"}"}}, "metadata": {"safety_label": "unknown"}}
root <- tool_call_response Run Background Agent: The user rejected the tool call.
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "run_background_agent", "arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\"}"}}, "metadata": {"safety_label": "unknown"}}
root <- tool_call_response Run Background Agent: The user rejected the tool call.
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "run_background_agent", "arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\"}"}}, "metadata": {"safety_label": "unknown"}}
root <- tool_call_response Run Background Agent: The user rejected the tool call.
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "run_background_agent", "arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\"}"}}, "metadata": {"safety_label": "unknown"}}
root <- tool_call_response Run Background Agent: The user rejected the tool call.
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "run_background_agent", "arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\"}"}}, "metadata": {"safety_label": "unknown"}}
root <- tool_call_response Run Background Agent: The user rejected the tool call.

```

**Evidence: one round in the event stream, from the tool call to the next message**

```text
title: one round in the event stream, from the tool call to the next message
source: manuals/docker-sandboxes-101/capture/out/19-background.ndjson
lines: 13-19
lang: jsonl
note: Read safety_label in the metadata, the two hook events, and isError in the result.
---
{"agent_name": "root", "metadata": {"safety_label": "unknown"}, "timestamp": "<ts>", "tool_call": {"function": {"arguments": "{\"agent\": \"writer\", \"task\": \"Write one sentence on the topic microVMs\", \"expected_output\": \"A single sentence about microVMs\"}", "name": "run_background_agent"}, "id": "<call-id>", "type": "function"}, "tool_definition": {"annotations": {"idempotentHint": false, "readOnlyHint": false, "title": "Run Background Agent"}, "category": "transfer", "description": "Start a sub-agent task in the background and return immediately with a task ID.\nUse this to dispatch work to multiple sub-agents concurrently. Native sub-agents inherit the current\nsession's safety policy and permissions; calls requiring confirmation are denied because background\ntasks are non-interactive. External harnesses enforce their own permission model. Check progress with\nview_background_agent, or join tasks and collect results with wait_background_agents instead of polling.", "name": "run_background_agent", "outputSchema": null, "parameters": {"additionalProperties": false, "properties": {"agent": {"description": "The name of the sub-agent to run in the background.", "type": "string"}, "expected_output": {"description": "The expected output from the agent (optional).", "type": "string"}, "task": {"description": "A clear and concise description of the task the agent should achieve.", "type": "string"}}, "required": ["agent", "task"], "type": "object"}}, "type": "tool_call_confirmation"}
{"agent_name": "root", "hook_event": "tool_input_transform", "session_id": "<uuid>", "timestamp": "<ts>", "type": "hook_started"}
{"agent_name": "root", "hook_event": "tool_response_transform", "session_id": "<uuid>", "timestamp": "<ts>", "type": "hook_started"}
{"agent_name": "root", "allowed": true, "duration_ms": "<n>", "hook_event": "tool_input_transform", "session_id": "<uuid>", "timestamp": "<ts>", "type": "hook_finished"}
{"agent_name": "root", "allowed": true, "duration_ms": "<n>", "hook_event": "tool_response_transform", "session_id": "<uuid>", "timestamp": "<ts>", "type": "hook_finished"}
{"agent_name": "root", "response": "The user rejected the tool call.", "result": {"isError": true, "output": "The user rejected the tool call."}, "timestamp": "<ts>", "tool_call_id": "<call-id>", "tool_definition": {"annotations": {"idempotentHint": false, "readOnlyHint": false, "title": "Run Background Agent"}, "category": "transfer", "description": "Start a sub-agent task in the background and return immediately with a task ID.\nUse this to dispatch work to multiple sub-agents concurrently. Native sub-agents inherit the current\nsession's safety policy and permissions; calls requiring confirmation are denied because background\ntasks are non-interactive. External harnesses enforce their own permission model. Check progress with\nview_background_agent, or join tasks and collect results with wait_background_agents instead of polling.", "name": "run_background_agent", "outputSchema": null, "parameters": {"additionalProperties": false, "properties": {"agent": {"description": "The name of the sub-agent to run in the background.", "type": "string"}, "expected_output": {"description": "The expected output
(excerpt: the first 13 of 13 lines)
```

**Evidence: the last line of the run**

```text
title: the last line of the run
source: manuals/docker-sandboxes-101/capture/out/19-background.txt
lines: 14-14
lang: text
note: The runtime ended the run, not the model.
---
stderr: Error: Agent terminated: detected 5 consecutive identical calls to run_background_agent. This indicates a degenerate loop where the model is not making progress.

```

**Evidence: what each safety mode does with a call that no pattern matched**

```text
title: what each safety mode does with a call that no pattern matched
source: manuals/docker-sandboxes-101/sections/5-5-permissions-safety-and-hooks.md
lines: 59-66
lang: text
note: Find the row for a run that chose no mode, then read the note below the table in the manual.
---
**Safety mode:** what the runtime does with a call that no pattern matched. It reads the call's label, `safe`, `destructive`, or `unknown`, and the mode decides {{docs-agent Permissions}}:

| Mode | `safe` | `destructive` | `unknown` |
|---|---|---|---|
| `strict` | ask | ask | ask |
| `balanced` | allow | ask | ask |
| `restricted` | allow | deny | deny |
| `autonomous` | allow | allow | allow |

```

**Questions**

1. Before you open the event stream, list what the model could have received after its first call, and what a well-behaved agent does with each answer.
2. The runtime asked for a confirmation six times, and nobody answered. Why did the asks happen, and what turned each ask into a rejection?
3. Compare the arguments of the six calls. What changed after the first round, and what does that tell you about how the model read the answer?
4. Name the gate that ended the run, its default, and why the same agent file worked one run earlier.
5. Write the change to the agent file or the command that lets a headless coordinator start a background agent, and say what you would leave as it is.

:::answer Show the answer
:::say Short answer
The cause is a headless run with a tool whose label is `unknown` and no allow pattern. Every call asked, every ask became a rejection, and the model repeated the call. The repeat limit worked as designed: it turned an endless loop into one exit code.
:::

**Walkthrough**

1. **Read the agent file.** The root agent has `max_iterations: 6`, `sub_agents: [writer]`, `handoffs: [reviewer]`, and one toolset of type `background_agents`. The file has no `permissions` block, and the command chose no safety mode. So any call that is not approved by default has to ask someone.
2. **Read the first round.** The runtime raised `tool_call_confirmation` for `run_background_agent`, with `safety_label` `unknown` in the metadata. Under `--exec` there is no terminal to answer, so the runtime turned the question into a refusal. The tool response went back to the model as plain text: `The user rejected the tool call.`
3. **Read the five rounds after it.** The model sent the same call again, five times, with the same agent and the same task. It dropped `expected_output` after the first round and changed nothing else. A rejection is a final answer about that call. The model treated it as a transient error and retried.
4. **Read one round in the event stream.** The tool call carries `safety_label: unknown`. The two hook events are `tool_input_transform` and `tool_response_transform`, the built-in transforms, and both report `allowed: true`. No `pre_tool_use` hook and no allow pattern decided anything. The result has `isError: true`, then `message_added`, and the next model turn starts from the same state.
5. **Read the last line.** The runtime stopped the run after five identical calls in a row. The manual names the limit, `max_consecutive_tool_calls`, and a value of 0 means the default of 5. The runtime caught a loop that the model did not. One run earlier the same coordinator called `transfer_task`, which is the one tool that is always approved without a prompt, so that run raised no confirmation.
6. **Read the safety-mode table.** A run that chose no mode keeps the old default: read-only tools run, and every other tool asks. The background-agent tool is not read-only and its label is `unknown`. Under `restricted` an unknown label is denied, and under `strict` or `balanced` it asks again. Only an `allow` pattern or `autonomous` lets the call through. The manual adds that inside a running task, a call that would ask is denied automatically, so a headless coordinator needs an allow rule for `run_background_agent` and for the tools its sub-agents call.

**Resolution**

The cause is a headless run with a tool whose label is `unknown` and no allow pattern. Every call asked, every ask became a rejection, and the model repeated the call. The repeat limit worked as designed: it turned an endless loop into one exit code.

The fix is a permission, not a higher limit. Add an `allow` pattern for `run_background_agent` to the agent file, and allow patterns for the tools the writer will call, then rerun with `--exec`. The manual did not run the repaired configuration, so the check is yours: the first `run_background_agent` call must return a task id in the stream instead of a rejection, and the run must end with the writer's sentence and exit 0. Keep the limit at its default. Keep the safety mode out of `autonomous`.

The proof that the permission was the cause is already in the stream: every round shows a confirmation with no one to answer it, a result with `isError: true`, and no rule or hook in the decision. The run with `transfer_task` on the same file shows the other side: a tool that needs no approval ran once and returned.

**Wrong turns**

- "Raise the limit on consecutive calls so the run can finish." Every call hit the same rejection. More rounds give more rejections, and the limit is the only thing that ended the run.
- "Run the job with `--yolo`." That is `--safety autonomous`: every tool is allowed, including every tool of the sub-agents. One allow pattern for one tool is the smaller change.
- "The model is at fault, swap it." The model received an error string and nothing else. Another model can retry the same way, and the runtime holds the gate for that reason. Check the permission before the model.
- "Add a `pre_tool_use` hook that answers allow." From a preempting hook, an allow verdict is advice. The hook can deny or ask, and it cannot grant.

**Generalize**

A tool result that returns to the model as text is an input the model may ignore. When a run has nobody to answer a question, give the agent explicit allow patterns for the tools it must call and nothing more, and keep the runtime limits that stop a repeated step. Read a termination line as a gate that worked, then find the reason the model needed it.

:::

## Four failed starts after a pip install

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22 from pip, and vLLM 0.31.0 from a uv install; model: Qwen/Qwen3-8B; hardware: a node with two L4 GPUs, an NVIDIA driver and no CUDA toolkit*

A platform team gets a new node with two L4 cards. The host runs Ubuntu 24.04 with a driver, and nothing else from CUDA is on it. They install SGLang with pip, and the install prints no error. The first `sglang serve` dies with a C compiler message about a missing header. They repair it and start again. A new error. They repair that one too. After an afternoon, they have four failed starts and four different errors, each from a different component.

The other team on the same node tries vLLM through a uv install. Their server dies with `Engine core initialization failed` right after a kernel build. Both teams now believe the driver on the node is faulty, and they file a ticket to reimage it. You are asked to review the logs before the node goes down.

**Evidence: the first two starts: a missing Python header, then no CUDA compiler**

```text
title: the first two starts: a missing Python header, then no CUDA compiler
source: manuals/sglang-101/capture/gpu/incidents/l4-toolchain-failures.txt
lines: 1-8
lang: text
note: Read the first error line under each attempt header. The progress bar line repeats the first error.
---
=== attempt: out-l4-nopyheaders/server-default.log
<site-packages>/triton/backends/nvidia/driver.c:9:10: fatal error: Python.h: No such file or directory
<site-packages>/triton/backends/nvidia/driver.c:9:10: fatal error: Python.h: No such file or directory

  0%|          | 0/50 [00:00<?, ?it/s]
Capturing prefill shape (num_tokens=4096 avail_mem=2.28 GB):   0%|          | 0/50 [00:00<?, ?it/s]<site-packages>/triton/backends/nvidia/driver.c:9:10: fatal error: Python.h: No such file or directory
=== attempt: out-l4-nonvcc/server-default.log
[2026-10-16 14:21:19] RuntimeError: Could not find nvcc and default cuda_home='/usr/local/cuda' doesn't exist
    raise RuntimeError(
RuntimeError: Could not find nvcc and default cuda_home='/usr/local/cuda' doesn't exist

```

**Evidence: the third start: the compiler and the headers do not match**

```text
title: the third start: the compiler and the headers do not match
source: manuals/sglang-101/capture/gpu/incidents/l4-toolchain-failures.txt
lines: 9-13
lang: text
note: The Ninja build of the FlashInfer kernels stops on one preprocessor check in a bundled header.
---
=== attempt: out-l4-jitmismatch/server-default.log
[2026-10-16 14:23:40] RuntimeError: Ninja build failed. Ninja output:
<site-packages>/flashinfer/data/cccl/libcudacxx/include/cuda/std/__cccl/cuda_toolkit.h:41:8: error: #error "CUDA compiler and CUDA toolkit headers are incompatible, please check your include paths"
   41 | #      error "CUDA compiler and CUDA toolkit headers are incompatible, please check your include paths"
<site-packages>/flashinfer/data/cccl/libcudacxx/include/cuda/std/__cccl/cuda_toolkit.h:41:8: error: #error "CUDA compiler and CUDA toolkit headers are incompatible, please check your include paths"

```

**Evidence: the fourth start: the linker cannot find the CUDA runtime library**

```text
title: the fourth start: the linker cannot find the CUDA runtime library
source: manuals/sglang-101/capture/gpu/incidents/l4-toolchain-failures.txt
lines: 14-18
lang: text
note: The JIT module of SGLang links against -lcudart and the linker finds no such file.
---
=== attempt: out-l4-nolibcudart/server-default.log
/usr/bin/ld: cannot find -lcudart: No such file or directory
collect2: error: ld returned 1 exit status
[2026-10-16 14:26:33] RuntimeError: Failed to build JIT module sgl_kernel_jit_fused_rope_true_128_false_bf16_t_bf16_t in /root/.cache/sglang/jit/sm89/sgl_kernel_jit_fused_rope_true_128_false_bf16_t_bf16_t/build-d129ad15216edb50/.staging-45436f7697ff4fd58892a3e6760bd970
/usr/bin/ld: cannot find -lcudart: No such file or directory

```

**Evidence: the other engine on the same host: the sampler choice and the JIT build**

```text
title: the other engine on the same host: the sampler choice and the JIT build
source: manuals/vllm-101/capture/gpu/incidents/l4-vllm-flashinfer-jit.txt
lines: 1-3
lang: text
note: The second line names the component that the third line starts to build.
---
INFO 10-17 16:22:09 [api_utils.py:286] non-default args: {'model_tag': 'Qwen/Qwen3-8B', 'host': '127.0.0.1', 'port': 30000, 'model': 'Qwen/Qwen3-8B', 'max_model_len': 8192, 'gpu_memory_utilization': 0.9, 'num_gpu_blocks_override': 1506}
INFO 10-17 16:22:26 [topk_topp_sampler.py:124] Using FlashInfer for top-p & top-k sampling.
2026-10-17 16:22:39,316 - INFO - core.py:564 - flashinfer.jit: Building JIT module sampling; this can take several minutes on first use.

```

**Evidence: the other engine: the engine core fails, and the three packages behind it**

```text
title: the other engine: the engine core fails, and the three packages behind it
source: manuals/vllm-101/capture/gpu/incidents/l4-vllm-flashinfer-jit.txt
lines: 5-8
lang: text
note: Read the versions of the kernel library, the headers and the compiler, which come from three different packages.
---
RuntimeError: Engine core initialization failed. See root cause above. Failed core proc(s): {}
flashinfer_python-0.7.0.post1.dist-info
nvidia_cuda_cccl-13.3.4.3.1.dist-info
nvidia_cuda_nvcc-13.4.92.dist-info

```

**Evidence: the one fact behind the four failures, and the repair for each**

```text
title: the one fact behind the four failures, and the repair for each
source: manuals/sglang-101/sections/7-1-operating-sglang.md
lines: 50-57
lang: text
note: One numbered item per failed start, in the order the starts failed.
---
All four failures come from one fact. SGLang, Triton, and FlashInfer compile kernels on the target machine at startup, and a compiler needs a complete toolchain.

1. Triton compiles a small C helper against the Python headers. The system Python of Ubuntu has no `Python.h`. We changed to a Python build that includes its headers, from `uv`.
2. SGLang looks for `nvcc` under `/usr/local/cuda`. The pip wheels include `nvcc` 13.4 under `nvidia/cu13` in site-packages, but nothing points to it. We set `CUDA_HOME` to that directory.
3. FlashInfer then compiled its attention kernels with that `nvcc` against its own bundled headers, and the versions did not match. We installed `flashinfer-jit-cache`, which holds kernels compiled in advance for SM 8.9.
4. The JIT kernels of SGLang link with `-lcudart` from `$CUDA_HOME/lib64`. The wheel has only `lib/libcudart.so.13`. We made a `CUDA_HOME` with a `lib64` directory that holds `libcudart.so`.

The fifth start served requests. Our GB10 never had this problem, because its DGX operating system has a full toolkit in `/usr/local/cuda`.

```

**Evidence: the troubleshooting entry for the sampler build on the other engine**

```text
title: the troubleshooting entry for the sampler build on the other engine
source: manuals/vllm-101/sections/7-1-troubleshoot-by-symptom.md
lines: 61-65
lang: text
note: The fix line gives the environment variable that skips the sampler build.
---
### The sampler fails to compile after you set CUDA_HOME

- **Cause:** the toolkit on the host does not match the CUDA build of PyTorch, so the FlashInfer sampler cannot compile. With a host toolkit at nvcc 13.4, we saw this on our L4 node.
- **Check:** the error says `CUDA compiler and CUDA toolkit headers are incompatible`.
- **Fix:** install the toolkit version that matches your PyTorch build. Or start with `VLLM_USE_FLASHINFER_SAMPLER=0`, as [the FP8 KV cache page](#s-fit-more-users-with-an-fp8-kv-cache) does.

```

**Questions**

1. Four errors name four components. What is the one fact that all four share?
2. Why does a serving engine need the Python headers at all, and which part of the stack asked for them?
3. The third failure appeared only after the second one was repaired. What did that repair cause?
4. The second engine failed on the same host with the same preprocessor check. Is it the same cause, and what is the one-variable workaround for a greedy benchmark?
5. What do you tell the team about the reimage ticket, and what is the fix for production?

:::answer Show the answer
:::say Short answer
Cancel the reimage. Nothing in the logs names the driver. Every error names a compiler, a header set or a linker, and all of them belong to the kernel build that runs on the first start.
:::

**Walkthrough**

1. **Read the first error of each start, not the traceback.** Attempt one stops in `triton/backends/nvidia/driver.c` on `Python.h: No such file or directory`. Triton compiles a small C helper against the Python headers when the server starts, and the system Python has none. The manual changed to a Python build that ships its headers, from `uv`. Attempt two stops with `Could not find nvcc and default cuda_home='/usr/local/cuda' doesn't exist`. The pip wheels carry an `nvcc` at version 13.4 under `nvidia/cu13` in site-packages, but nothing points at it, so the manual set `CUDA_HOME` to that directory.
2. **See how one repair exposed the next failure.** With a compiler in reach, FlashInfer built its attention kernels with that `nvcc` against its own bundled headers, and the versions did not match. The Ninja build stops on one preprocessor line: `CUDA compiler and CUDA toolkit headers are incompatible`. The manual installed `flashinfer-jit-cache`, which holds kernels compiled in advance for SM 8.9, so nothing has to compile them on the host.
3. **Read the fourth error as a linker problem.** The JIT kernels of SGLang link with `-lcudart` from `$CUDA_HOME/lib64`. The wheel has only `lib/libcudart.so.13`, so `ld` finds no `libcudart.so`. The manual made a `CUDA_HOME` with a `lib64` directory that holds the library. The fifth start served requests.
4. **Check the second engine against the third failure.** vLLM chose FlashInfer for top-p and top-k sampling and started to build the `sampling` JIT module. The build stopped on the same header check, and the engine core never came up. The package list under the error gives the cause in three lines: the kernel library `flashinfer_python-0.7.0.post1`, the headers `nvidia_cuda_cccl-13.3.4.3.1` and the compiler `nvidia_cuda_nvcc-13.4.92` come from three packages with three versions. The vLLM manual gives two fixes: a toolkit that matches the PyTorch build, or `VLLM_USE_FLASHINFER_SAMPLER=0`, which skips the sampler build and is enough for a greedy benchmark.
5. **Name the one fact.** SGLang, Triton and FlashInfer compile kernels on the target machine at startup, and a compiler needs a complete toolchain. The driver was never part of any error. The manual's GB10 never hit this, because its DGX operating system has a full toolkit under `/usr/local/cuda`.

**Resolution**

Cancel the reimage. Nothing in the logs names the driver. Every error names a compiler, a header set or a linker, and all of them belong to the kernel build that runs on the first start.

For production, run SGLang from the pinned image, or on a host with a full CUDA toolkit. The pip path works on a host with only a driver after the four repairs above, and the manual warns that each SGLang upgrade can need them again. For vLLM, use the image or a toolkit that matches the PyTorch build; set `VLLM_USE_FLASHINFER_SAMPLER=0` only when you need a quick greedy benchmark on a host without one. The proof of the fix is the fifth start, which served requests, and the position in the manual that came out of it: run outside the image only on a host with a full toolkit.

**Wrong turns**

- "The driver is broken, reimage the node." No error names the driver. The four messages come from a C compiler, the CUDA compiler lookup, a header check and the linker.
- "pip install finished without errors, so the install is complete." The install does not compile kernels. The first start does, and that is where the toolchain is checked.
- "Install the distribution's CUDA toolkit and keep the wheels." The toolkit must match the CUDA build of PyTorch. A host toolkit at nvcc 13.4 gave the header mismatch on this node.
- "Fix one error and declare the node ready." Each repair revealed the next failure. Run a full start and one request before you close the ticket.

**Generalize**

An engine that compiles kernels at startup has a second install step, and it runs on the first start, on the machine you serve from. When that step fails, read the first error line and ask which tool failed: the compiler, the headers it reads, or the linker. Fix the toolchain or use the image that carries it. A driver bug announces itself in the driver's own words, not in a build log.

:::

## Health probes that add load

*Level 2 · incident · about 15 minutes · version: SGLang 0.5.22 against vLLM 0.31.0; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory*

A platform team runs SGLang pods on Kubernetes. The liveness probe asks `/health` every few seconds with a short timeout, and a failed probe restarts the pod. During a traffic spike the busiest pods restart in a loop. A probe times out, the pod is killed in the middle of its answers, its users move to the other pods, and the next busiest pod fails its probe. The service recovers only when the spike passes.

The scheduler log of a restarted pod shows the probes themselves, as prefill batches of one token between the user requests. The ticket proposes two changes: a longer probe timeout and a higher memory limit for the pod.

**Evidence: the health probe around the ready line of our L4 server**

```text
title: the health probe around the ready line of our L4 server
source: manuals/sglang-101/capture/gpu/out-l4/server-default.log
lines: 36-43
lang: text
note: Read the line before the last one, and ask what sent that batch.
---
[2026-10-17 14:43:37] INFO:     127.0.0.1:58250 - "GET /health HTTP/1.1" 503 Service Unavailable
[2026-10-17 14:43:38] INFO:     127.0.0.1:58266 - "GET /model_info HTTP/1.1" 200 OK
[2026-10-17 14:43:38] Prefill batch, #new-seq: 1, #new-token: 6, #cached-token: 0, token usage: 0.00, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 3.37
[2026-10-17 14:43:38] INFO:     127.0.0.1:58272 - "POST /generate HTTP/1.1" 200 OK
[2026-10-17 14:43:38] INFO:     127.0.0.1:58288 - "POST /freeze_gc HTTP/1.1" 200 OK
[2026-10-17 14:43:38] The server is fired up and ready to roll!
[2026-10-17 14:43:40] Prefill batch, #new-seq: 1, #new-token: 1, #cached-token: 0, token usage: 0.00, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: False, input throughput (token/s): 0.58
[2026-10-17 14:43:40] INFO:     127.0.0.1:58298 - "GET /health HTTP/1.1" 200 OK

```

**Evidence: the three health endpoints and the two settings behind them**

```text
title: the three health endpoints and the two settings behind them
source: manuals/sglang-101/sections/7-1-operating-sglang.md
lines: 86-90
lang: text
note: Find the endpoint that sends no request to the model, and the default of the generation setting.
---
- `/ready` returns 200 when the tokenizer manager is ready and 503 before that.
- `/health` and `/health_generate` share one handler. They return 503 while the server starts and while it shuts down.
- Otherwise the handler sends a one-token request with `max_new_tokens` 1 and waits for any output from the detokenizer.
- `SGLANG_ENABLE_HEALTH_ENDPOINT_GENERATION` defaults to true, so a plain `/health` also generates that token.
- The wait is `SGLANG_HEALTH_CHECK_TIMEOUT`, 20 s by default. With no output in that time, the handler marks the server `UnHealthy` and returns 503.

```

**Evidence: what the code claims and what two incidents showed**

```text
title: what the code claims and what two incidents showed
source: manuals/sglang-101/sections/7-1-operating-sglang.md
lines: 92-92
lang: text
note: Separate the claim about the work from the claim about the timing.
---
The docstring says that the probe request costs nothing when the server is busy, because any output from the scheduler counts as proof of life. That is true for the work, and false for the timing. **A real incident:** issue #22511 reports "health check failed. server could not get a response from detokenizer for last 20 seconds" on GLM-5 with 2 H800 GPUs under high load, on v0.5.10 {{issue #22511}}. A related issue, #35884, found that a timed-out probe left its request in the scheduler, so failed probes accumulated {{issue #35884}}.

```

**Evidence: the routes of a vLLM server with an API key, with and without the key**

```text
title: the routes of a vLLM server with an API key, with and without the key
source: manuals/vllm-101/capture/gpu/out-l4/livecheck-2026-10-22.txt
lines: 52-62
lang: text
note: Find the routes that answer without a key, and think about which of them touch the model.
---
/v1/models       nokey=401 key=200
/health          nokey=200 key=200
/metrics         nokey=200 key=200
/invocations     nokey=405 key=405
/version         nokey=200 key=200
/tokenize        nokey=405 key=405
/v2/x            nokey=401 key=404
/inference/x     nokey=401 key=404
/cohere/x        nokey=401 key=404
/ping            nokey=200 key=200
/load            nokey=200 key=200

```

**Evidence: the first health check of a vLLM server after startup**

```text
title: the first health check of a vLLM server after startup
source: manuals/vllm-101/sections/1-2-check-that-the-server-is-healthy.md
lines: 23-25
lang: text
note: No prefill batch follows the health request on this engine.
---
INFO:     Application startup complete.
INFO:     127.0.0.1:35152 - "GET /health HTTP/1.1" 200 OK
INFO:     127.0.0.1:34616 - "GET /v1/models HTTP/1.1" 200 OK

```

**Questions**

1. Read the log around the ready line. What did the server do when the probe asked for its health, and what does that cost under load?
2. Name the three endpoints and the question that each one answers.
3. The code says that the probe costs nothing when the server is busy. Why is that true for the work and false for the timing?
4. Design the probes: readiness, liveness and a deep check. Give the endpoint, the setting, the timeout and what happens on a failure.
5. The other engine answers its health route without generating. What does that change for a deep check there?
6. A restart in the middle of answers also needs a clean stop. Which signal, to which process, and how long do you wait?

:::answer Show the answer
:::say Short answer
The probes were the incident. The liveness probe generated a token on every call, waited in the user queue, timed out under load and killed the busiest pod, which moved its load to the next pod.
:::

**Walkthrough**

Read the eight log lines in order. At 14:43:37 the probe asked `/health` and got a 503, because the server was still starting. The server then sent itself one request to `/generate`, froze the garbage collector, and printed the ready line. Two seconds later the scheduler logged a prefill batch of one new token, and right after it the probe got its 200. Nothing else was running. That one-token batch was the probe. By default `/health` does not only answer, it sends a request through the model and waits for the result.

The second listing names the three endpoints. `/ready` returns 200 when the tokenizer manager is ready, and it sends nothing to the model. `/health` and `/health_generate` share one handler: they return 503 while the server starts or shuts down, and otherwise they send a one-token request with `max_new_tokens` of 1 and wait for any output from the detokenizer. `SGLANG_ENABLE_HEALTH_ENDPOINT_GENERATION` defaults to true, so a plain `/health` generates too. The wait is `SGLANG_HEALTH_CHECK_TIMEOUT`, 20 s by default, after which the handler marks the server unhealthy and returns 503.

The third listing is the subtle part. The docstring is right about the work: any output from the scheduler counts as proof of life, so a busy server does not need to finish the probe's token. It is wrong about the timing. The probe request waits in the same queue as the users, and when the first token of anyone takes longer than the probe timeout, the probe fails. The two incidents show both halves. One report saw the health check fail with no response from the detokenizer for 20 seconds, on a large model under high load. A second found that a timed-out probe left its request in the scheduler, so failed probes accumulated. Under a spike, the probe is a user who gives up after 20 s and tells the orchestrator to kill the server.

The last two listings are the other engine. Its `/health`, `/ping` and `/load` routes answer 200 without an API key, and its first health check after startup is followed by the model list, not by a prefill batch. The manual says why: that health route answers 200 when the engine runs and does not generate a token, so a 200 does not prove that a request completes. On that engine the health route is a liveness check by design, and a deep check means one short request.

**Resolution**

The probes were the incident. The liveness probe generated a token on every call, waited in the user queue, timed out under load and killed the busiest pod, which moved its load to the next pod.

Set `/ready` as the readiness probe, so a pod joins the service when it can accept requests. For liveness, set `SGLANG_ENABLE_HEALTH_ENDPOINT_GENERATION=false`, after which `/health` returns 200 without a request to the scheduler, and keep that probe on the pod. Move `/health_generate` to a slower deep check that alerts a person and restarts nothing. The probe timeout then stops mattering under load, and the memory limit was never the problem. On the other engine, use `/health` for liveness as it is, and make the deep check one short request.

Then fix the stop. Only a SIGTERM to the main process drains the running requests: the server returns 503 on `/health` during the drain, logs the remaining requests every 5 s, and exits when none remain. A signal to the whole process group or a forced exit stops work in progress. Set the termination grace period longer than the longest request at the output cap, and cap `max_tokens` first, or a drain can never finish in time.

**Wrong turns**

- "Raise the probe timeout to a minute." The probe still waits in the user queue, and a timed-out probe left its request in the scheduler in one report. A longer timeout hides the overload for longer and then kills the pod anyway.
- "Raise the memory limit of the pod." The pods did not run out of memory. They were killed by the orchestrator after a probe waited too long.
- "Use the generating endpoint for liveness, because it proves that the model works." A deep check that restarts the busiest pod under load is the incident. A deep check should alert a person.
- "Kill the pod fast so the others take over." A signal to the process group killed the scheduler child first and failed every running request. Only a SIGTERM to the main process drains.

**Generalize**

A probe is a client, and a client that waits in the same queue as the users will fail exactly when the users wait, which is when a restart hurts most. Separate the questions: can the process accept requests, is the process alive, and can the model produce a token. Give each question its own endpoint, its own schedule and its own consequence, and never let the slow question trigger a restart.

:::

## One error, two status codes

*Level 2 · incident · about 20 minutes · version: A2A 1.0.1 with the manual's capture kit (the test-runner, code-reviewer and deployer agents); model: no model; the agents are deterministic fixtures; hardware: one machine, localhost, no network*

A planner delegates test runs to a remote `test-runner` agent. Its transport layer was written for a plain REST service. A 2xx reply is a success. A 404 means the record is not visible yet, so the client waits and asks again. A 5xx gets a retry with backoff. The planner first talked to the agent over its JSON-RPC interface. Last night it looked up a task id that the agent had purged, logged the lookup as a success, and then crashed on an empty result.

A teammate moved the planner to the agent's HTTP+JSON interface this morning, "so that we get real status codes". The same lookup now comes back as a 404, and the planner has asked again every two seconds for an hour. You are asked to make the client stop at the right time in both bindings, without a special case for each error.

**Evidence: a GetTask for an unknown id over JSON-RPC, status and code**

```text
title: a GetTask for an unknown id over JSON-RPC, status and code
source: manuals/a2a-101/capture/out/11-errors.http
lines: 1-26
lang: text
note: Read the HTTP status line, then the member that replaced result and its code.
---
### 1 · GetTask: an id that does not exist
POST /a2a/jsonrpc HTTP/1.1
Host: localhost:41241
Content-Type: application/json
A2A-Version: 1.0

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "GetTask",
  "params": {
    "id": "00000000-0000-4000-8000-000000000000"
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Task not found",
    "data": [
      {

```

**Evidence: the detail inside data of the same JSON-RPC error**

```text
title: the detail inside data of the same JSON-RPC error
source: manuals/a2a-101/capture/out/11-errors.http
lines: 28-36
lang: text
note: The reason and the domain name the error. The metadata repeats the id that was asked for.
---
        "reason": "TASK_NOT_FOUND",
        "domain": "a2a-protocol.org",
        "metadata": {
          "taskId": "00000000-0000-4000-8000-000000000000"
        }
      }
    ]
  }
}

```

**Evidence: the same lookup over HTTP+JSON, status and body head**

```text
title: the same lookup over HTTP+JSON, status and body head
source: manuals/a2a-101/capture/out/16-rest-binding.http
lines: 180-194
lang: text
note: Compare the status line with the code and status fields of the body.
---
### 3 · GET /tasks/{id}: not found
GET /a2a/rest/tasks/00000000-0000-4000-8000-000000000000 HTTP/1.1
Host: localhost:41241
A2A-Version: 1.0

HTTP/1.1 404 Not Found
Content-Type: application/a2a+json

{
  "error": {
    "code": 404,
    "status": "NOT_FOUND",
    "message": "Task not found",
    "details": [
      {

```

**Evidence: the detail inside the HTTP+JSON error**

```text
title: the detail inside the HTTP+JSON error
source: manuals/a2a-101/capture/out/16-rest-binding.http
lines: 196-204
lang: text
note: Compare the reason with the one in the JSON-RPC reply.
---
        "reason": "TASK_NOT_FOUND",
        "domain": "a2a-protocol.org",
        "metadata": {
          "taskId": "00000000-0000-4000-8000-000000000000"
        }
      }
    ]
  }
}

```

**Evidence: every A2A error with its code in each binding**

```text
title: every A2A error with its code in each binding
source: manuals/a2a-101/sections/r-4-errors.md
lines: 7-24
lang: text
note: Count how many rows share HTTP 400, and which rows have no HTTP status at all.
---
| Error | JSON-RPC | HTTP | gRPC |
|---|---|---|---|
| TaskNotFoundError | -32001 | 404 | NOT_FOUND |
| TaskNotCancelableError | -32002 | 400 | FAILED_PRECONDITION |
| PushNotificationNotSupportedError | -32003 | 400 | FAILED_PRECONDITION |
| UnsupportedOperationError | -32004 | 400 | FAILED_PRECONDITION |
| ContentTypeNotSupportedError | -32005 | 400 | INVALID_ARGUMENT |
| InvalidAgentResponseError | -32006 | 500 | INTERNAL |
| ExtendedAgentCardNotConfiguredError | -32007 | 400 | FAILED_PRECONDITION |
| ExtensionSupportRequiredError | -32008 | 400 | FAILED_PRECONDITION |
| VersionNotSupportedError | -32009 | 400 | FAILED_PRECONDITION |
| JSONParseError | -32700 | none | none |
| InvalidRequestError | -32600 | none | none |
| MethodNotFoundError | -32601 | none | none |
| InvalidParamsError | -32602 | 400 | INVALID_ARGUMENT |
| InternalError | -32603 | 500 or 503 | INTERNAL or UNAVAILABLE |
| Authentication error | custom | 401 | UNAUTHENTICATED |
| Authorization error | custom | 403 | PERMISSION_DENIED |

```

**Evidence: which errors a client may retry**

```text
title: which errors a client may retry
source: manuals/a2a-101/sections/5-5-errors.md
lines: 116-125
lang: text
note: Each line names the codes and the one action that fits them. The last line is about a retried send.
---
Most A2A errors describe the request or the task, so resending the same bytes gets the same answer:

- `-32603`, HTTP `500` or `503`, or a dropped connection: retry with backoff, and honor `Retry-After` {{spec §3.3.2}}.
- HTTP `401`: get a fresh credential, then retry.
- `-32600`, `-32602`, `-32005`, `-32009`, and their `400` forms: fix the request before you send it again.
- `-32001`: stop, because the id is wrong, purged, or hidden from you {{spec §3.3.2}}.
- `-32002`, or `-32004` on a terminal task: start a new task, as [CancelTask and terminal states](#s-cancel-task-and-terminal-states) shows.
- `-32003`, `-32007`, or `-32004` from a capability check: read the card again.

A retried `SendMessage` can start a second task, because duplicate detection by `messageId` is optional {{spec §3.3.1}}. Send the same `messageId` anyway, as [Message](#s-message) explains.

```

**Questions**

1. In the JSON-RPC reply, where is the fact that the lookup failed, and what does the HTTP status tell you?
2. Which field is identical in both replies, and which fields differ?
3. How many of the nine A2A errors share one HTTP status, and what does that do to a policy that keys on the status alone?
4. Which errors may a client retry, and what should it do with a task that is not found?
5. The planner also retries a SendMessage after a timeout. What must it keep the same, and why?

:::answer Show the answer
:::say Short answer
The client decoded the transport and never the protocol. The fix is one error reader for both bindings. Read the HTTP status, then the `error` member or the Status body, then the `reason` of the first detail. Classify by reason into retry, re-authenticate, fix the request, or stop. On `TASK_NOT_FOUND` the planner stops after one reply, in either binding, which is what the capture shows: one request and one reply for the unknown id over JSON-RPC, and one request and one reply over HTTP+JSON. A retried send keeps its `messageId`. The hour of repeated lookups does not come back, because the decision no longer depends on a status code that one binding does not even use.
:::

**Walkthrough**

1. **Read the JSON-RPC reply.** The status line says `200 OK`, and the body has no `result`. In its place sits an `error` member with the code -32001 and the message `Task not found`. In this binding every reply is a 200, so the status carries no information. The client must open the body and test for `error` before it reads `result`.
2. **Read the detail in `data`.** It is a list with one object. Its `reason` is `TASK_NOT_FOUND`, its `domain` is `a2a-protocol.org`, and its `metadata` repeats the task id. The reason is the name of the error without its suffix. This is the field a client can decide on.
3. **Read the HTTP+JSON reply.** The status line says `404 Not Found`. The body is a Status object with `code` 404, `status` `NOT_FOUND`, the same message, and `details` where JSON-RPC had `data`. Inside the details sits the same detail object with the same reason. The envelope changed, and the error did not.
4. **Read the table.** Seven of the nine A2A errors map to HTTP 400, and `InvalidParamsError` maps to 400 as well. The three JSON-RPC parse and request errors have no HTTP status at all. A rule keyed to the status cannot tell a task that cannot be canceled from a request with a bad field. Only `TaskNotFoundError` maps to 404, so a REST policy that waits on 404 waits on the one error that never clears.
5. **Apply the retry rules.** `-32603`, HTTP 500 or 503, or a dropped connection: retry with backoff and honor `Retry-After`. HTTP 401: get a fresh credential. `-32600`, `-32602`, `-32005` and `-32009`: fix the request. `-32001`: stop, because the id is wrong, purged, or hidden from this caller. `-32002`, or `-32004` on a terminal task: start a new task. `-32003` or `-32007`: read the card again. A server must not reveal a task that the caller may not see, so not found can also mean "not yours".
6. **Check the other retry.** A SendMessage that timed out may have created a task. Duplicate detection by `messageId` is optional, so a resend with a fresh id can start a second task. The planner resends the same bytes with the same `messageId`, and the server gets its one chance to recognize the duplicate.

**Resolution**

The client decoded the transport and never the protocol. The fix is one error reader for both bindings. Read the HTTP status, then the `error` member or the Status body, then the `reason` of the first detail. Classify by reason into retry, re-authenticate, fix the request, or stop. On `TASK_NOT_FOUND` the planner stops after one reply, in either binding, which is what the capture shows: one request and one reply for the unknown id over JSON-RPC, and one request and one reply over HTTP+JSON. A retried send keeps its `messageId`. The hour of repeated lookups does not come back, because the decision no longer depends on a status code that one binding does not even use.

**Wrong turns**

- "Move every client to HTTP+JSON, then the status codes are real." Seven of the nine A2A errors arrive as 400 there, next to invalid parameters. The status still does not name the error.
- "Match on the message text." The message is for a person. The reference implementation answers the same cases with other words and other field names, so a text match breaks on the next server.
- "Treat 404 as eventual consistency and keep polling." The specification tells a server to answer not found for a purged id and for a task the caller may not see. No later call changes that answer.
- "Resend with a fresh messageId to be safe." Duplicate detection is optional, and a fresh id removes the only hint the server has. The suite can run twice.

**Generalize**

A protocol carried over HTTP has two layers of status. The transport status says whether the bytes arrived. The protocol's own error says what happened to the request, and in some bindings it hides behind a 200. Decide on the protocol's discriminator, keep the set of retryable errors small and explicit, and give every retry an idempotency key that the server can see.

:::
