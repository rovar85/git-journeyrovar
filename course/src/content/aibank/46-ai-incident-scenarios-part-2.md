---
track: aibank
title: "AI incident scenarios, read the evidence (part 2 of 10)"
short: Incidents 2
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## A bigger prefill chunk that did not start

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: one L4, the first GPU of a two-GPU node*

An engineer wants long prompts to get their first token sooner on an L4 server that runs `Qwen/Qwen3-8B`. The idea is simple: a prefill chunk twice as large means half as many scheduler turns for a long prompt. They start the server with `--chunked-prefill-size 8192` and leave every other flag at its default.

The server never becomes ready. The log ends with a `RuntimeError` from PyTorch that reads `INTERNAL ASSERT FAILED` and asks the reader to report a bug to PyTorch. The engineer opens a bug report with the PyTorch project and proposes to pin an older PyTorch for the whole fleet. The same server with no chunk flag has served every benchmark run on this card.

**Evidence: the engine, the model, the card and the one changed flag**

```text
title: the engine, the model, the card and the one changed flag
source: manuals/sglang-101/capture/gpu/incidents/l4-chunk-8192-prefill-graph-oom.txt
lines: 1-1
lang: text
note: The chunk is the only setting that differs from the default start.
---
sglang 0.5.22, Qwen/Qwen3-8B, one NVIDIA L4 (22 GB), --chunked-prefill-size 8192, default --mem-fraction-static for the card

```

**Evidence: the last six lines of the failed start**

```text
title: the last six lines of the failed start
source: manuals/sglang-101/capture/gpu/incidents/l4-chunk-8192-prefill-graph-oom.txt
lines: 3-8
lang: text
note: Read the line that starts with Capturing and the line below it before you read the PyTorch assert.
---
[2026-10-18 07:27:15] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 24094, K size: 1.65 GB, V size: 1.65 GB
[2026-10-18 07:27:15] Memory pool end. avail mem=2.90 GB
Capturing prefill shape (num_tokens=8192 avail_mem=2.33 GB)
torch.AcceleratorError: CUDA error: out of memory
[2026-10-18 07:28:44] RuntimeError: num_active_captures_ > 0 INTERNAL ASSERT FAILED at "/__w/pytorch/pytorch/c10/cuda/CUDACachingAllocator.cpp":3209, please report a bug to PyTorch. markCaptureEnd called with no captures in progress
[2026-10-18 07:28:45] Received sigquit from a child process. It usually means the child failed.

```

**Evidence: the same server with the default chunk**

```text
title: the same server with the default chunk
source: manuals/sglang-101/capture/gpu/incidents/l4-chunk-8192-prefill-graph-oom.txt
lines: 10-10
lang: text
note: One sentence from the incident record.
---
With the default chunk of 4096, the same server on the same card started and served every run.

```

**Evidence: the default start on the same card: the pool, the free memory and the prefill capture**

```text
title: the default start on the same card: the pool, the free memory and the prefill capture
source: manuals/sglang-101/capture/gpu/out-l4/server-default.log
lines: 19-23
lang: text
note: Read the available memory after the pool, the token count of the first captured shape, and the memory the capture used.
---
[2026-10-17 14:42:45] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 22939, K size: 1.58 GB, V size: 1.58 GB
[2026-10-17 14:42:45] Memory pool end. avail mem=2.86 GB
[2026-10-17 14:42:45] Capture target prefill CUDA graph begin. backend=breakable, num_tokens=[4, 8, 12, 16, 20, 24, 28, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 832, 896, 960, 1024, 1280, 1536, 1792, 2048, 2304, 2560, 2816, 3072, 3328, 3584, 3840, 4096], avail mem=2.28 GB

  0%|          | 0/50 [00:00<?, ?it/s]
Capturing prefill shape (num_tokens=4096 avail_mem=2.28 GB):   0%|          | 0/50 [00:00<?, ?it/s]
Capturing prefill shape (num_tokens=4096 avail_mem=2.28 GB):   2%|▏         | 1/50 [00:02<02:13,  2.73s/it]
Capturing prefill shape (num_tokens=3840 avail_mem=1.28 GB):   2%|▏         | 1/50 [00:02<02:13,  2.73s/it]
Capturing prefill shape (num_tokens=3840 avail_mem=1.28 GB):   4%|▍         | 2/50 [00:07<03:16,  4.09s/it]
Capturing prefill shape (num_tokens=3584 avail_mem=1.25 GB):   4%|▍         | 2/50 [00:07<03:16,  4.09s/it]
Capturing prefill shape (num_tokens=3584 avail_mem=1.25 GB):   6%|▌         | 3/50 [00:09<02:20,  2.98s/it]
Capturing prefill shape (num_tokens=3328 avail_mem=1.25 GB):   6%|▌         | 3/50 [00:09<02:20,  2.98s/it]
Capturing prefill shape (num_tokens=3328 avail_mem=1.25 GB):   8%|▊         | 4/50 [00:14<02:50,  3.72s/it]
Capturing prefill shape (num_tokens=3072 avail_mem=1.24 GB):   8%|▊         | 4/50 [00:14<02:50,  3.72s/it]
Capturing prefill shape (num_tokens=3072 avail_mem=1.24 GB):  10%|█         | 5/50 [00:15<02:13,  2.97s/it]
Capturing prefill shape (num_tokens=2816 avail_mem=1.23 GB):  10%|█         | 5/50 [00:15<02:13,  2.97s/it]
Capturing prefill shape (num_tokens=2816 avail_mem=1.23 GB):  12%|█▏        | 6/50 [00:20<02:32,  3.47s/it]
Capturing prefill shape (num_tokens=2560 avail_mem=1.23 GB):  12%|█▏        | 6/50 [00:20<02:32,  3.47s/it]
Capturing prefill shape (num_tokens=2560 avail_mem=1.23 GB):  14%|█▍        | 7/50 [00:23<02:18,  3.23s/it]
Capturing prefill shape (num_tokens=2304 avail_mem=1.22 GB):  14%|█▍        | 7/50 [00:23<02:18,  3.23s/it]
Capturing prefill shape (num_tokens=2304 avail_mem=1.22 GB):  16%|█▌        | 8/50 [00:24<01:48,  2.59s/it]
Capturing prefill shape (num_tokens=2048 avail_mem=1.22 GB):  16%|█▌        | 8/50 [00:24<01:48,  2.59s/it]
Capturing prefill shape (num_tokens=2048 avail_mem=1.22 GB):  18%|█▊        | 9/50 [00:27<01:59,  2.91s/it]
Capturing prefill shape (num_tokens=1792 avail_mem=1.21 GB):  18%|█▊        | 9/50 [00:27<01:59,  2.91s/it]
Capturing prefill shape (num_tokens=1792 avail_mem=1.21 GB):  20%|██        | 10/50 [00:28<01:33,  2.34s/it]
Capturing prefill shape (num_tokens=1536 avail_mem=1.21 GB):  20%|██        | 10/50 [00:28<01:33,  2.34s/it]
Capturing prefill shape (num_tokens=1536 avail_mem=1.21 GB):  22%|██▏       | 11/50 [00:31<01:30,  2.32s/it]
Capturing prefill shape (num_tokens=1280 avail_mem=1.20 GB):  22%|██▏       | 11/50 [00:31<01:30,  2.32s/it]
Capturing prefill shape (num_tokens=1280 avail_mem=1.20 GB):  24%|██▍       | 12/50 [00:32<01:14,  1.97s/it]
Capturing prefill shape
(excerpt: the first 40 of 113 lines)
```

**Evidence: the settings line of the default start**

```text
title: the settings line of the default start
source: manuals/sglang-101/capture/gpu/out-l4/server-default.log
lines: 27-27
lang: text
note: Read chunked_prefill_size and available_gpu_mem.
---
[2026-10-17 14:43:36] max_total_num_tokens=22939, chunked_prefill_size=4096, max_prefill_tokens=16384, max_running_requests=2048, context_len=40960, available_gpu_mem=1.31 GB

```

**Evidence: the default chunk and the largest decode batch, by GPU memory**

```text
title: the default chunk and the largest decode batch, by GPU memory
source: manuals/sglang-101/sections/4-1-forwardmode-and-cuda-graphs.md
lines: 50-57
lang: text
note: Find the row for a card of 20 to 35 GB.
---
| GPU memory | Example GPUs | Decode `max_bs` at TP below 4 | At TP 4 or more | `chunked_prefill_size` |
|---|---|---|---|---|
| under 20 GB | T4, RTX 4080 | 8 | 8 | 2048 |
| 20 to 35 GB | A10, RTX 4090, RTX 5090 | 48 | 160 | 4096 |
| 35 to 60 GB | A100 40 GB, L40 | 32 | 160 | 4096 |
| 60 to 90 GB | H100, A100 80 GB | 256 | 512 | 8192 |
| 90 to 160 GB | H200 | 256 | 512 | 8192 |
| 160 GB and more | B200, MI300X | 512 | 512 | 16384 |

```

**Evidence: how the manual reads the failed start**

```text
title: how the manual reads the failed start
source: manuals/sglang-101/sections/2-2-the-scheduler-loop-and-schedule-policy.md
lines: 156-156
lang: text
note: One paragraph. The real error is not the last line of the log.
---
The other direction failed on the L4 at startup. With a chunk of 8,192, the KV pool took the same 24,094 tokens as before. The prefill graph for 8,192 tokens then needed more than the 2.33 GB that remained. The last line of the log is a PyTorch assert that asks for a bug report. The real error is the out-of-memory line above it.

```

**Questions**

1. The last line asks for a PyTorch bug report. Which line holds the real error, and how do you tell a cause from a consequence in this log?
2. The pool is the same size in the failed start and in the sweep. Where did the memory go?
3. Which startup step runs after the pool and needs memory outside it? How does the chunk size change what that step needs?
4. The default start captured the same step on the same card. How much memory did its first captured shape use, and how much was left when it began?
5. If the team still wants a chunk of 8192 here, which flag makes room and which flag should they not touch?

:::answer Show the answer
:::say Short answer
Close the PyTorch report. The assert is a symptom of a capture that an out-of-memory error interrupted, and the cause is the prefill graph for 8192 tokens on a card with 2.33 GB left after the pool. The team kept the default chunk of 4096, and that server, on that card, started and served every run, which is the control that the incident record states.
:::

**Walkthrough**

1. **Read upward from the assert and stop at the first error.** Two lines above the PyTorch assert is `torch.AcceleratorError: CUDA error: out of memory`. The assert, `markCaptureEnd called with no captures in progress`, is what the allocator says after a graph capture was cut short by that error. The scheduler then received a SIGQUIT from its child. The manual reads it the same way: the real error is the out-of-memory line, and the assert is the consequence.
2. **Check what the pool took.** The failed start allocated a pool of 24,094 tokens, with 1.65 GB each for K and V, the same pool that the sweep servers on this card had. After the pool, 2.90 GB was free. So the pool did not grow with the chunk, and the memory that ran out was memory outside the pool.
3. **Find the step that failed.** The line `Capturing prefill shape (num_tokens=8192 avail_mem=2.33 GB)` names it. Since the breakable graph for prefill arrived in the CUDA builds, startup captures a prefill graph for each shape up to the chunk size. The largest shape is the chunk itself. A capture of 8192 tokens holds the activations of an 8192-token prefill, and that needed more than the 2.33 GB that was left.
4. **Compare with a start that worked.** The default start on this card shows the same sequence with a smaller shape. Its pool held 22,939 tokens that day, 2.86 GB was free after the pool, and the first captured shape was `num_tokens=4096` with 2.28 GB available. That capture ended after 48.33 s with 0.83 GB used and 1.45 GB still free. Twice the tokens in the capture asked for more than the whole remainder.
5. **Read where the default comes from.** The table in the CUDA graphs page gives a chunk of 4096 for a card of 20 to 35 GB, and 8192 only from 60 GB upward. The default is sized to the memory that a capture can expect on that card. The scheduler page measured chunk changes on the GB10 and found no gain at 1 and 2 requests each second, and a loss at 0.5 with a smaller chunk. On the L4 the larger chunk never started, so there is no measurement of its gain.

**Resolution**

Close the PyTorch report. The assert is a symptom of a capture that an out-of-memory error interrupted, and the cause is the prefill graph for 8192 tokens on a card with 2.33 GB left after the pool. The team kept the default chunk of 4096, and that server, on that card, started and served every run, which is the control that the incident record states.

If a larger chunk is still wanted on this card, make room for the capture instead of removing it. Lower `--mem-fraction-static` by one step, so the pool shrinks and the capture has more than 2.33 GB, then read the `Capture target prefill CUDA graph end` line for the memory the capture used. The CUDA graphs page gives the order: fix capture memory with a smaller graph batch size or a lower fraction, and keep graphs on. Then measure the first token at the team's prompt lengths with both chunks before the change ships, because the manual found no gain from a chunk change on the machine where it could run both.

**Wrong turns**

- "Pin an older PyTorch, the assert says to report a bug." The assert reports an interrupted capture. The out-of-memory line two lines above it is the cause, and an older PyTorch changes nothing about free memory.
- "Raise the memory fraction so the capture gets more memory." The fraction gives memory to the weights and the pool. Raising it shrinks what is left for the capture. Lower it.
- "Turn CUDA graphs off and keep the big chunk." A server without decode graphs pays launch time on every token for every user. Fix the capture memory and keep the graphs.
- "A bigger chunk always makes prefill faster, so it is worth the memory." The manual measured chunk sizes on the GB10 and found the three settings inside the seed spread of each other at 1 and 2 requests per second. Measure before you pay.

**Generalize**

When a startup log ends in an assert from a library, read upward to the first error, because the library is often the second victim. Then ask which step the error fell in and what that step's memory depends on. A flag that changes a shape, such as a chunk size or a graph batch size, changes the memory of the capture that uses that shape, and the pool that the fraction sized does not move to make room. On a small card, the default chunk is a memory decision, not a speed decision.

:::

## A five-minute cold start on the GB10

*Level 2 · incident · about 15 minutes · version: vLLM 0.31.0 in its release container; model: Qwen/Qwen3-30B-A3B-Instruct-2507; hardware: one GB10 with 128 GB of unified memory*

A team serves `Qwen/Qwen3-30B-A3B-Instruct-2507` from a pool of GB10 machines behind an autoscaler. At a traffic spike the autoscaler starts new replicas. Each new replica takes more than five minutes before it answers its first request, so the autoscaler counts it as unhealthy and starts more. By the time the replicas are up, the spike is over, and the team pays for machines that served nothing.

The first guess is the image pull or the network. The logs rule both out: the container image was already on each machine, and the weights were on the local NVMe drive. The second guess is that the model is simply too large for the machine, but each replica serves well once it is up.

**Evidence: the settings of the server that started**

```text
title: the settings of the server that started
source: manuals/vllm-101/capture/gpu/out-gb10/server-load-vllm.log
lines: 7-7
lang: text
note: Read the memory fraction and the block override.
---
(APIServer pid=1) INFO 10-21 10:53:02 [api_utils.py:286] non-default args: {'model_tag': 'Qwen/Qwen3-30B-A3B-Instruct-2507', 'host': '127.0.0.1', 'port': 30000, 'model': 'Qwen/Qwen3-30B-A3B-Instruct-2507', 'max_model_len': 8192, 'gpu_memory_utilization': 0.75, 'num_gpu_blocks_override': 14685}

```

**Evidence: the end of the weight load**

```text
title: the end of the weight load
source: manuals/vllm-101/capture/gpu/out-gb10/server-load-vllm.log
lines: 41-44
lang: text
note: Read the seconds in the first and the last line, and the memory that the weights took.
---
(EngineCore pid=143) INFO 10-21 10:58:44 [default_loader.py:484] Loading weights took 325.26 seconds
(EngineCore pid=143) INFO 10-21 10:58:44 [unquantized.py:504] Using MoEPrepareAndFinalizeNoDPEPModular
(EngineCore pid=143) INFO 10-21 10:58:44 [unquantized.py:505] Using FlashInferExperts MoE backend
(EngineCore pid=143) INFO 10-21 10:58:45 [model_runner.py:407] Model loading took 56.93 GiB memory and 330.542793 seconds

```

**Evidence: the compile and the warmup**

```text
title: the compile and the warmup
source: manuals/vllm-101/capture/gpu/out-gb10/server-load-vllm.log
lines: 54-55
lang: text
note: Compare these seconds with the weight load.
---
(EngineCore pid=143) INFO 10-21 10:59:05 [monitor.py:53] torch.compile took 18.67 s in total
(EngineCore pid=143) INFO 10-21 10:59:05 [monitor.py:81] Initial profiling/warmup run took 0.40 s

```

**Evidence: the graph capture and the KV cache sizing**

```text
title: the graph capture and the KV cache sizing
source: manuals/vllm-101/capture/gpu/out-gb10/server-load-vllm.log
lines: 58-62
lang: text
note: Read the capture time, the free memory for the cache, and the block override in the second to last line.
---
(EngineCore pid=143) INFO 10-21 10:59:45 [model_runner.py:1087] Graph capturing finished in 39 secs, took 1.17 GiB
(EngineCore pid=143) INFO 10-21 10:59:46 [gpu_worker.py:692] Available KV cache memory: 31.32 GiB
(EngineCore pid=143) INFO 10-21 10:59:46 [gpu_worker.py:707] CUDA graph memory profiling is enabled (default since v0.21.0). The current --gpu-memory-utilization=0.7500 is equivalent to --gpu-memory-utilization=0.7399 without CUDA graph memory profiling. To maintain the same effective KV cache size as before, increase --gpu-memory-utilization to 0.7601. To disable, set VLLM_MEMORY_PROFILER_ESTIMATE_CUDAGRAPHS=0.
(EngineCore pid=143) INFO 10-21 10:59:46 [kv_cache_utils.py:2772] Overriding num_gpu_blocks=21381 with num_gpu_blocks_override=14685
(EngineCore pid=143) INFO 10-21 10:59:46 [kv_cache_utils.py:2464] GPU KV cache size: 234,960 tokens, Maximum concurrency for 8,192 tokens per request: 28.68x

```

**Evidence: the memory accounting line at the end of startup**

```text
title: the memory accounting line at the end of startup
source: manuals/vllm-101/capture/gpu/out-gb10/server-load-vllm.log
lines: 94-94
lang: text
note: Add the three actual numbers and compare the sum with the desired share.
---
(EngineCore pid=143) INFO 10-21 11:00:51 [gpu_worker.py:955] Free memory on device (114.94/121.69 GiB) on startup. Desired GPU memory utilization is (0.75, 91.27 GiB). Actual usage is 58.16 GiB for consumed memory (weights + non-torch), 1.78 GiB for peak activation, and 0.31 GiB for CUDAGraph memory. Replace gpu_memory_utilization config with `--kv-cache-memory=33136484864` (30.86 GiB) to fit into requested memory, or `--kv-cache-memory=58555694592` (54.53 GiB) to fully utilize gpu memory. Current kv cache memory in use is 31.32 GiB.

```

**Questions**

1. Read the startup lines in order. Where did the five minutes go, and how much of that was the copy of the weights?
2. On this machine the weights and the GPU allocation live in one memory. Why does the load still take minutes?
3. Which lines prove that the server sized itself as planned, and what do they say about a fraction of 0.75 on this machine?
4. What can a second start of the same image on the same machine skip, and what must it pay again?
5. A field report cut a cold start of another engine from 695 s to 88 s and then to 9.6 s. Which cost did each step remove, and which of those steps apply here?
6. How does this change the autoscaling design?

:::answer Show the answer
:::say Short answer
The cold start is the weight copy, 325.26 s of a 330 s load, and no serving flag shortens it. The team changes the design around that fact. Each replica starts once and stays up, because a restart pays the full load again. The weights stay on the local NVMe drive and never on a network mount. The compile cache directory is on a volume that survives the container, so the second start skips the 18.67 s compile.
:::

**Walkthrough**

Read the log as a timeline. The weight loader finished after 325.26 seconds, and the model loading line reports 56.93 GiB of memory and 330.542793 seconds. The compile took 18.67 s in total and the warmup 0.40 s. The graph capture finished in 39 secs and took 1.17 GiB. So the weights are almost all of the start, and the compile and the graphs together are about one minute of it.

The second question is why a copy inside one memory takes so long. The loader copies each tensor from the memory-mapped safetensors file into the GPU allocation, one tensor at a time. On the GB10, a copy from a file-backed page is slow. An open issue in the engine's tracker measured about 1.7 ms for each tensor copied from the file view, against about 0.2 ms for a copy that started in host memory. The 0.31.0 release made a different part of the load faster, an indexed lookup of expert names that saves about 25 s on this machine, and the cost of each tensor copy stays. The fix is not in a flag.

The sizing lines show that the memory plan held. The settings line asked for a fraction of 0.75 and an override of 14,685 blocks. The server found 31.32 GiB available for the KV cache, overrode its own count of 21,381 blocks with the 14,685 that the sweep wanted, and reported a pool of 234,960 tokens, enough for 28.68 concurrent requests of 8,192 tokens. The accounting line at the end gives the whole split: 114.94 of 121.69 GiB free at startup, a desired share of 91.27 GiB at 0.75, and an actual use of 58.16 GiB for the weights and other memory, 1.78 GiB for the peak activation and 0.31 GiB for the graphs, with 31.32 GiB of cache in use. On unified memory the fraction is a share of the whole machine, and the rest stays free for the OS and its page cache.

A second start on the same machine pays the weights again. The compile is different: the log shows the engine saving its compiled function to a cache directory, so the next start loads it instead of compiling. The graph capture repeats. The field report in the SGLang manual, from an engineer blog of April 2026 about an eight-GPU server, timed the same phases on the other engine: 695 s cold, with 531 s of it the weight load. Kernel caches kept between runs brought a warm start to 88 s, and a process checkpoint with the weights staged in host memory brought it to 9.6 s. The first step is the cache mount that applies here. The last step needs host memory that the weights can wait in, which this machine shares with the GPU.

**Resolution**

The cold start is the weight copy, 325.26 s of a 330 s load, and no serving flag shortens it. The team changes the design around that fact. Each replica starts once and stays up, because a restart pays the full load again. The weights stay on the local NVMe drive and never on a network mount. The compile cache directory is on a volume that survives the container, so the second start skips the 18.67 s compile.

The autoscaler changes in two ways. Its readiness check waits for the application startup line and one short request, and a replica that is still loading counts as starting, not as unhealthy, so the autoscaler stops adding replicas on top of replicas that are about to come up. And the scaling signal moves from the current queue to a forecast with a lead time longer than the six minutes that a start takes, or the pool keeps warm standby replicas that are already loaded. On this machine the fraction of 0.75 left 31.32 GiB for the cache. The block override capped the pool at 234,960 tokens, and without the override the same memory holds about 342,000 tokens at 96 KiB per token, so a standby replica can take a large share of a spike by itself.

**Wrong turns**

- "The image pull is slow, cache the image." The image was local. The log puts 325.26 s in the weight loader after the container had started.
- "Add replicas faster when the queue grows." Every replica pays the same five minutes, and the spike lasts less than that. More replicas that arrive late cost more and serve nothing.
- "Lower the memory fraction so the server starts sooner." The fraction decides the cache size, not the copy speed. The weights take 56.93 GiB and 325.26 s at any fraction.
- "Turn off the compile and the graphs to save a minute." Together they cost about one minute of a five-minute start, the compile is cached after the first start, and both pay back on every decode step for the life of the replica.

**Generalize**

When a start is slow, read the phase timings before you change anything, because the largest phase is usually one that no flag controls. Then move the design to fit it: start rarely, keep what a restart can reuse on storage that survives, and give the autoscaler a signal with more lead time than the start takes. A replica that is loading is not unhealthy, and a probe that cannot tell the difference will scale a fleet into the ground.

:::

## A kit from a local registry, three refusals

*Level 2 · incident · about 20 minutes · version: sbx v0.47.0; model: none; shell commands inside the sandbox; hardware: one Mac with the microVM runtime*

A platform team writes its first v3 kit, a shell workload with one allowed host, and pushes it to the team's own registry. In the capture a local registry at `localhost:15000` stands in for it. Three commands then fail in a row. `sbx kit inspect` on the pushed reference says the kit cannot be installed because its source is not in the allowlist. `sbx kit inspect` on the source directory tries to build it and stops with an exporter error. `sbx kit validate` on the same directory says the kit is a v3 source kit and the load path has no kit builder. An engineer concludes that v3 kits do not work in this release and proposes to rewrite the kit as a v2 mixin.

You have the three failures, the build logs of two pushes made with two different builders, and the validate output for a v2 mixin from the same tree.

**Evidence: the two settings that the refused inspect suggests, and its exit code**

```text
title: the two settings that the refused inspect suggests, and its exit code
source: manuals/docker-sandboxes-101/capture/out/28-kit-inspect.txt
lines: 3-5
lang: console
note: The error line above these two is cut; it says the kit's source is not in the allowlist and names the current value docker.io/.
---
  try: sbx settings set kit.allowedSources '["docker.io/","localhost:15000/m101/"]'
   or: sbx settings set kit.allowedSources '["*"]'
[exit 1]

```

**Evidence: sbx kit inspect on the v3 source directory**

```text
title: sbx kit inspect on the v3 source directory
source: manuals/docker-sandboxes-101/capture/out/28-kit-inspect-source.txt
lang: console
note: Read which exporter failed and for which driver.
---
$ sbx kit inspect ./fixtures/kits/hello-kit --json
   → build kit ./fixtures/kits/hello-kit (sbx-kit-src:kit-<id>)
error: build kit ./fixtures/kits/hello-kit: exit status 1 ERROR: failed to build: OCI exporter is not supported for the docker driver. Switch to a different driver, or turn on the containerd image store, and try again. Learn more at https://docs.docker.com/go/build-exporters/
[exit 1]

```

**Evidence: the start of the build with a docker-container builder**

```text
title: the start of the build with a docker-container builder
source: manuals/docker-sandboxes-101/capture/out/28-buildx.txt
lines: 1-16
lang: console
note: Read the driver on the second line and the frontend version on the descriptor line.
---
$ docker buildx build --progress=plain -f fixtures/kits/hello-kit/kit.yaml --builder m101-builder -t m101-registry:5000/m101/hello-kit:v1 --push fixtures/kits/hello-kit
#0 building with "m101-builder" instance using docker-container driver
#1 [internal] booting buildkit
#1 pulling image moby/buildkit:buildx-stable-1 done
#1 creating container buildx_buildkit_m101-builder0 done
#1 DONE <dur>
#2 [internal] load build definition from kit.yaml
#2 DONE <dur>
#3 resolve image config for docker-image://docker.io/docker/sandbox-kit:3
#3 DONE <dur>
#4 docker-image://docker.io/docker/sandbox-kit:3@sha256:<digest>
#4 DONE <dur>
#5 [internal] load kit descriptor kit.yaml · sandbox-kit 3.0.0-m.8 (129be2ff)
#5 DONE <dur>
#6 [kit] inline build block
#6 DONE <dur>

```

**Evidence: the export and push steps of the docker-container build**

```text
title: the export and push steps of the docker-container build
source: manuals/docker-sandboxes-101/capture/out/28-buildx.txt
lines: 29-38
lang: console
note: Count the manifests that the exporter wrote.
---
#13 exporting to image
#13 exporting layers done
#13 exporting manifest sha256:<digest> done
#13 exporting config sha256:<digest> done
#13 exporting attestation manifest sha256:<digest> done
#13 exporting manifest list sha256:<digest> done
#13 pushing manifest for m101-registry:5000/m101/hello-kit:v1@sha256:<digest> done
#13 DONE <dur>
View build details: <url>
[exit 0]

```

**Evidence: the same build with the default driver of the host daemon**

```text
title: the same build with the default driver of the host daemon
source: manuals/docker-sandboxes-101/capture/out/28-buildx-docker-driver.txt
lang: console
note: Compare the export steps with the other build.
---
$ docker buildx build --progress=plain -f fixtures/kits/hello-kit/kit.yaml -t localhost:15000/m101/hello-kit:docker-driver --push fixtures/kits/hello-kit
#0 building with "desktop-linux" instance using docker driver
#1 [internal] load build definition from kit.yaml
#1 DONE <dur>
#2 resolve image config for docker-image://docker.io/docker/sandbox-kit:3
#2 DONE <dur>
#3 docker-image://docker.io/docker/sandbox-kit:3@sha256:<digest>
#3 CACHED
#4 [internal] load kit descriptor kit.yaml · sandbox-kit 3.0.0-m.8 (129be2ff)
#4 DONE <dur>
#5 [kit] inline build block
#5 CACHED
#6 [internal] load metadata for docker.io/docker/sandbox-templates:shell
#6 DONE <dur>
#7 [internal] load .dockerignore
#7 DONE <dur>
#8 [1/2] FROM docker.io/docker/sandbox-templates:shell
#8 DONE <dur>
#9 [internal] load build context
#9 DONE <dur>
#10 [2/2] COPY HELLO.md /home/agent/HELLO.md
#10 CACHED
#11 [kit] stage sources /usr/share/sandbox/kit/kit
#11 CACHED
#12 exporting to image
#12 exporting layers done
#12 writing image sha256:<digest> done
#12 naming to localhost:15000/m101/hello-kit:docker-driver done
#12 DONE <dur>
#13 pushing localhost:15000/m101/hello-kit:docker-driver with docker
#13 DONE <dur>
View build details: <url>
[exit 0]

```

**Evidence: sbx kit validate on the v3 source kit**

```text
title: sbx kit validate on the v3 source kit
source: manuals/docker-sandboxes-101/capture/out/13-kit-v3-validate.txt
lang: console
note: The error names the generation and the missing builder.
---
$ sbx kit validate ./fixtures/kits/hello-kit
error: kit ./fixtures/kits/hello-kit is a v3 source kit and this load path has no kit builder configured; artifact validation failed
[exit 1]

```

**Evidence: sbx kit validate on the v2 mixin**

```text
title: sbx kit validate on the v2 mixin
source: manuals/docker-sandboxes-101/capture/out/12-validate.txt
lang: console
note: The same command, a different kit generation.
---
$ sbx kit validate ./fixtures/kits/hello-mixin
VALID: ./fixtures/kits/hello-mixin (directory)
[exit 0]

```

**Questions**

1. Three failures, one conclusion. Group the failures by the component that produced each message before you read the build logs.
2. Which sbx kit commands accept a v3 kit, and which do not?
3. The two builds used different drivers. What did each export, and which result is a kit?
4. What does the allowlist refusal protect, and which of the two suggested settings would you apply?
5. How does the kit reach a sandbox once the three causes are fixed, and what does the manual admit it did not capture?

:::answer Show the answer
:::say Short answer
Three causes, and none of them is a broken release. The `sbx kit` artifact commands are v1 and v2 tooling, so `validate` on a v3 directory is the wrong command. The default `docker` build driver cannot export an OCI image, so the push it made is not a kit, and the source inspect fails for the same reason; a `docker-container` builder exported the manifest list with the descriptor annotations. The daemon admits kits only from the prefixes in `kit.allowedSources`, which is `docker.io/` by default, so the team's registry prefix must be added. With the builder changed and the prefix added, the kit runs by reference. The rewrite to a v2 mixin is withdrawn, and the team records that its own run of the kit is the first measurement, because the manual has none.
:::

**Walkthrough**

1. **Separate the generations.** `sbx kit validate` passes the v2 mixin with `VALID` and refuses the v3 directory as a v3 source kit with no builder. The manual's ruling on conflict C13 is that `validate`, `pack`, `push` and `pull` are v1 and v2 tooling. A v3 kit is an OCI image, built and pushed with Docker tooling. So the validate failure is not a defect: the command was never meant for this kit.
2. **Read the two build logs for the driver.** The build that worked ran on a `docker-container` builder. Its export step wrote layers, a manifest, a config, an attestation manifest and a manifest list, then pushed the manifest. The other build ran on the `docker` driver of the host daemon; its export wrote an image, named it, and pushed it with docker, with no manifest list and no attestation. The manual read the registry afterwards: the default driver pushed a Docker schema 2 manifest with no annotations, and an image without the descriptor annotation is not a kit to any consumer. The second push looked successful and produced something no sandbox can use.
3. **Read the source inspect failure in that light.** `sbx kit inspect` on the directory tried to build the kit with the host daemon, and the OCI exporter is not supported for the `docker` driver. The fix is the same as in step 2: a `docker-container` builder, or the containerd image store that the error names.
4. **Read the admission rule.** The refusal of the pushed reference comes from `kit.allowedSources`, which defaults to `docker.io/` since v0.34.0, as conflict C40 records. The error suggests two values. Add the registry prefix `localhost:15000/m101/`, and do not set `*`: the error itself says that allowing any remote source is not recommended. The descriptor line of the good build names the frontend `3.0.0-m.8`, a milestone, so the pinned frontend version belongs in the ticket too.
5. **Run it by reference.** A v3 workload is consumed by `sbx run` or `sbx create` with the reference in place of the agent name, and a sandbox cannot mix v3 kits with v1 or v2 kits. The manual says plainly that no capture shows sbx running a v3 kit, because the capture kit never changes `sbx settings`. Say so when you report.

**Resolution**

Three causes, and none of them is a broken release. The `sbx kit` artifact commands are v1 and v2 tooling, so `validate` on a v3 directory is the wrong command. The default `docker` build driver cannot export an OCI image, so the push it made is not a kit, and the source inspect fails for the same reason; a `docker-container` builder exported the manifest list with the descriptor annotations. The daemon admits kits only from the prefixes in `kit.allowedSources`, which is `docker.io/` by default, so the team's registry prefix must be added. With the builder changed and the prefix added, the kit runs by reference. The rewrite to a v2 mixin is withdrawn, and the team records that its own run of the kit is the first measurement, because the manual has none.

**Wrong turns**

- "Set kit.allowedSources to * so every registry works." The error names that option and advises against it. The allowlist is the only check between a typed reference and a kit that configures a sandbox.
- "The push with the default driver succeeded, so the registry copy is fine." It pushed an image with no descriptor annotation. A consumer sees an ordinary image, not a kit.
- "Rewrite the kit as a v2 mixin because validate passes on that." The v2 tooling passed because that kit was v2. The v3 kit needs Buildx, not a different format.
- "Create the kit builder sandbox and run validate again." In the capture the source build ran in the host daemon, and the builder status read not created after it. The validate path still names only v1 and v2 artifacts.

**Generalize**

When one new thing fails three ways, name the component behind each message before you judge the thing. A format check, a build exporter and an admission list are three systems, and each has its own fix. A push that returns success is not proof that the artifact has the shape its consumer needs. Read the manifest back.

:::

## A request ID that opens the prompt

*Level 2 · incident · about 15 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory, and a GB10 as the second machine*

An agent product sends every request through a relay. For tracing, the relay puts a new first line in the system prompt, in the form `Request id <hex>.`, with a new value on each call. The system prompt itself is 2,999 tokens long and never changes. The team serves `Qwen/Qwen3-8B` with SGLang on an L4, with `--enable-cache-report` on.

Users report that the first token takes about two seconds on every turn, even when they repeat a question. The team doubles the memory fraction, tries a different eviction policy and turns on hierarchical caching. The wait does not move. The metrics endpoint reports a cache hit rate near zero.

**Evidence: five requests whose system prompt starts with a request id**

```text
title: five requests whose system prompt starts with a request id
source: manuals/sglang-101/capture/gpu/out-l4/cache-experiment.txt
lines: 6-10
lang: text
note: Read cached_tokens on every line, then ttft_ms.
---
{"case": "id-at-start", "round": 1, "ttft_ms": 2171.2, "prompt_tokens": 3032, "cached_tokens": 3}
{"case": "id-at-start", "round": 2, "ttft_ms": 2161.4, "prompt_tokens": 3034, "cached_tokens": 6}
{"case": "id-at-start", "round": 3, "ttft_ms": 2159.2, "prompt_tokens": 3031, "cached_tokens": 6}
{"case": "id-at-start", "round": 4, "ttft_ms": 2161.8, "prompt_tokens": 3031, "cached_tokens": 6}
{"case": "id-at-start", "round": 5, "ttft_ms": 2160.6, "prompt_tokens": 3033, "cached_tokens": 6}

```

**Evidence: the same five requests with a stable system prompt**

```text
title: the same five requests with a stable system prompt
source: manuals/sglang-101/capture/gpu/out-l4/cache-experiment.txt
lines: 1-5
lang: text
note: The first round fills the cache, so read the four rounds after it.
---
{"case": "stable-system-prompt", "round": 1, "ttft_ms": 2143.9, "prompt_tokens": 2999, "cached_tokens": 3}
{"case": "stable-system-prompt", "round": 2, "ttft_ms": 82.8, "prompt_tokens": 2999, "cached_tokens": 2998}
{"case": "stable-system-prompt", "round": 3, "ttft_ms": 85.1, "prompt_tokens": 2999, "cached_tokens": 2998}
{"case": "stable-system-prompt", "round": 4, "ttft_ms": 82.2, "prompt_tokens": 2999, "cached_tokens": 2998}
{"case": "stable-system-prompt", "round": 5, "ttft_ms": 80.7, "prompt_tokens": 2999, "cached_tokens": 2998}

```

**Evidence: the same request id moved to the end of the system prompt**

```text
title: the same request id moved to the end of the system prompt
source: manuals/sglang-101/capture/gpu/out-l4/cache-experiment.txt
lines: 11-15
lang: text
note: Compare cached_tokens with prompt_tokens on each line.
---
{"case": "id-at-end", "round": 1, "ttft_ms": 98.2, "prompt_tokens": 3033, "cached_tokens": 2983}
{"case": "id-at-end", "round": 2, "ttft_ms": 98.4, "prompt_tokens": 3032, "cached_tokens": 2987}
{"case": "id-at-end", "round": 3, "ttft_ms": 99.7, "prompt_tokens": 3033, "cached_tokens": 2986}
{"case": "id-at-end", "round": 4, "ttft_ms": 97.2, "prompt_tokens": 3030, "cached_tokens": 2985}
{"case": "id-at-end", "round": 5, "ttft_ms": 93.1, "prompt_tokens": 3032, "cached_tokens": 2987}

```

**Evidence: the scheduler log while the three forms went through**

```text
title: the scheduler log while the three forms went through
source: manuals/sglang-101/capture/gpu/out-l4/server-default.log
lines: 62-79
lang: text
note: Follow the cached-token field through the stable prompt, the id at the start, and the id at the end.
---
[2026-10-17 14:43:50] Prefill batch, #new-seq: 1, #new-token: 1, #cached-token: 2998, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: False, input throughput (token/s): 0.99
[2026-10-17 14:43:50] INFO:     127.0.0.1:59136 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:43:51] Decode batch, #running-req: 1, #token: 3010, token usage: 0.13, cuda graph: True, gen throughput (token/s): 14.48, #queue-req: 0
[2026-10-17 14:43:53] Prefill batch, #new-seq: 1, #new-token: 3029, #cached-token: 3, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 972.29
[2026-10-17 14:43:53] INFO:     127.0.0.1:59142 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:43:57] Prefill batch, #new-seq: 1, #new-token: 3028, #cached-token: 6, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 966.95
[2026-10-17 14:43:57] INFO:     127.0.0.1:51474 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:44:00] Prefill batch, #new-seq: 1, #new-token: 3025, #cached-token: 6, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 966.73
[2026-10-17 14:44:00] INFO:     127.0.0.1:51480 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:44:00] Decode batch, #running-req: 1, #token: 3037, token usage: 0.13, cuda graph: True, gen throughput (token/s): 4.41, #queue-req: 0
[2026-10-17 14:44:03] Prefill batch, #new-seq: 1, #new-token: 3025, #cached-token: 6, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 965.89
[2026-10-17 14:44:03] INFO:     127.0.0.1:51494 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:44:06] Prefill batch, #new-seq: 1, #new-token: 3027, #cached-token: 6, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 966.89
[2026-10-17 14:44:06] INFO:     127.0.0.1:51506 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:44:07] Decode batch, #running-req: 1, #token: 0, token usage: 0.00, cuda graph: True, gen throughput (token/s): 5.79, #queue-req: 0
[2026-10-17 14:44:07] Prefill batch, #new-seq: 1, #new-token: 50, #cached-token: 2983, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 46.77
[2026-10-17 14:44:07] INFO:     127.0.0.1:41460 - "POST /v1/chat/completions HTTP/1.1" 200 OK
[2026-10-17 14:44:08] Prefill batch, #new-seq: 1, #new-token: 45, #cached-token: 2987, token usage: 0.13, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 42.41

```

**Evidence: the summary of the same experiment on a GB10 with a larger model**

```text
title: the summary of the same experiment on a GB10 with a larger model
source: manuals/sglang-101/capture/gpu/out-gb10/cache-experiment.txt
lines: 16-18
lang: text
note: The times differ from the L4, the cached-token counts do not.
---
{"summary": "stable-system-prompt", "median_ttft_ms": 44.75, "min_ttft_ms": 44.2, "max_ttft_ms": 48.4, "median_cached_tokens": 2998.0, "prompt_tokens": 2999}
{"summary": "id-at-start", "median_ttft_ms": 632.2, "min_ttft_ms": 631.0, "max_ttft_ms": 645.2, "median_cached_tokens": 6, "prompt_tokens": 3030}
{"summary": "id-at-end", "median_ttft_ms": 143.9, "min_ttft_ms": 139.5, "max_ttft_ms": 148.8, "median_cached_tokens": 2985, "prompt_tokens": 3032}

```

**Questions**

1. The first listing shows five requests. What does the cached token count tell you about where the match stopped?
2. How does the radix tree match a prompt, and why can nothing after the first difference match?
3. In the third listing the id comes last in the prompt. Predict the cached token count before you read it, then explain the difference.
4. Which three places can confirm a hit or a miss on a running server, from the closest to the request to the most general?
5. The team tuned the cache tiers and the eviction policy first. Why did none of those settings help, and in which order do you change prompts and server flags?

:::answer Show the answer
:::say Short answer
The relay put a changing value at the start of the only part of the prompt that every request shares. One edit fixed it. Move the trace id out of the system prompt and send it as request metadata, or put it at the end. In our measurement on the L4 the median first token fell from 2,161.4 ms with the id at the start to 98.2 ms with the id at the end, and the median cached token count rose from 6 to 2,986 of about 3,030.
:::

**Walkthrough**

Read the first listing one field at a time. Each request sends about 3,030 prompt tokens and the server reports `cached_tokens` of 3 or 6. The first token takes 2,159.2 to 2,171.2 ms on every round. So each request pays the full prefill of the system prompt, and the only tokens that the cache found are the few that come before the random hex digits.

The second listing is the control. The same question after a stable system prompt reports 2,998 cached tokens of 2,999 from the second round on, and the first token arrives in 80.7 to 85.1 ms. The first round shows 3 cached tokens and 2,143.9 ms, because it filled the cache. So the server and the model can serve this prompt about twenty-five times faster when the prompt matches.

The third listing moves the same random id to the end of the system prompt. The count rises to 2,983 to 2,987 cached tokens. The first token takes 93.1 to 99.7 ms. The tokens are almost the same in all three forms. Only their order differs. The radix tree compares tokens from the first one and stops at the first difference. Nothing after a difference can match, because the attention values of every later token depend on every earlier token. A cache that reused the later tokens would return wrong answers.

The scheduler log shows the same story from the server side. The stable rounds log `#cached-token: 2998` with one new token. Then five prefill batches log about 3,025 to 3,029 new tokens with 3 or 6 cached. Then the id-at-end rounds log 45 to 50 new tokens with 2,983 to 2,987 cached. The last listing repeats the experiment on a GB10 with a mixture-of-experts model. The times are different, 632.2 ms against 44.75 ms, and the cached token counts are the same: 6 against 2,998.

**Resolution**

The relay put a changing value at the start of the only part of the prompt that every request shares. One edit fixed it. Move the trace id out of the system prompt and send it as request metadata, or put it at the end. In our measurement on the L4 the median first token fell from 2,161.4 ms with the id at the start to 98.2 ms with the id at the end, and the median cached token count rose from 6 to 2,986 of about 3,030.

Prove the fix from three places. Start the server with `--enable-cache-report` and read `cached_tokens` in the usage block of each response. Read `#cached-token` on each `Prefill batch` line of the scheduler log. Read `sglang:cache_hit_rate` from `/metrics`. On vLLM, read `vllm:prefix_cache_hits_total` and `vllm:prefix_cache_queries_total`. The cache settings that the team changed first were not the problem, because no eviction policy or host tier can match tokens that differ from the start.

**Wrong turns**

- "Raise the memory fraction so the cache holds more." The pool was not full. The misses came from the prompt order, so a larger pool holds more blocks that nothing matches.
- "Turn on hierarchical caching." A host tier keeps evicted prefixes, and nothing was evicted. The prefix never matched in the first place.
- "The hit rate is low because the questions differ." The question is about 30 tokens at the end of a prompt of 2,999 tokens. A changing question costs about 30 tokens of prefill, not 2,999.
- "Hash the system prompt and route by it." Routing matters when several servers split the traffic, but this was one server, and the prompt differed on every request before routing could help.

**Generalize**

Treat the prompt layout as part of the serving system. Put the content that never changes first, the content that changes per session next, and the content that changes per request last. Keep ids, timestamps, hashes and random seeds out of the system prompt, and keep tool definitions and JSON keys in a fixed order. Before you change any cache flag, read the cached token count on your real requests. A prompt fix can recover a hit rate that no server flag can.

:::

## A resumed run that started from step 0 in silence

*Level 2 · incident · about 20 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

A long GRPO run saves a checkpoint every 20 steps into a host folder that is mounted into the container. One night the run dies. The on-call engineer starts the same command again at once. To be safe, she points `--load` at the newest `iter_` folder inside the checkpoint folder, and she keeps the same `> runs/plain.log` redirect, because the dashboard reads that file.

In the morning the reward curve of the new run begins where the first run began days ago. The first step line in the new log reads `step 0`. The team splits: one side says the checkpoints are corrupt, the other says the resume feature does not work on this trainer. Nobody can say why the first run died, because the old log is gone.

**Evidence: the two runs of the restart check**

```text
title: the two runs of the restart check
source: manuals/miles-101/capture/gpu/out-gb10/resume-check.txt
lines: 1-1
lang: text
note: The first run saves at step 2 on an empty folder. The second run starts with the same flags and runs 4 steps.
---
# Live check 2026-10-23, Qwen3-0.6B. ckpt-a: 2 steps with --save /ckpt/run-a --save-interval 20 --load /ckpt/run-a on an empty folder. ckpt-a-resume: same flags, 4 steps.

```

**Evidence: the first run: its save line, and its silence about the empty folder**

```text
title: the first run: its save line, and its silence about the empty folder
source: manuals/miles-101/capture/gpu/out-gb10/resume-check.txt
lines: 2-4
lang: text
note: Read the count of lines that mention a missing tracker or folder.
---
## ckpt-a
[FSDP] Saved checkpoint to /ckpt/run-a/iter_0000002
lines mentioning a missing tracker or folder: 0

```

**Evidence: the second run: what a real resume prints**

```text
title: the second run: what a real resume prints
source: manuals/miles-101/capture/gpu/out-gb10/resume-check.txt
lines: 5-11
lang: text
note: Three Loaded lines, then the first step line of the run.
---
## ckpt-a-resume
[FSDP] Loaded model from /ckpt/run-a/iter_0000002/model
[FSDP] Loaded optimizer from /ckpt/run-a/iter_0000002/optimizer
[FSDP] Loaded LR scheduler from /ckpt/run-a/iter_0000002/lr_scheduler
[FSDP] Saved checkpoint to /ckpt/run-a/iter_0000004
step 2:
step 3:

```

**Evidence: what the checkpoint folder holds after both runs**

```text
title: what the checkpoint folder holds after both runs
source: manuals/miles-101/capture/gpu/out-gb10/resume-check.txt
lines: 12-16
lang: text
note: One tracker file sits next to the iter folders.
---
## folder
iter_0000002
iter_0000004
latest_checkpointed_iteration.txt
rollout

```

**Evidence: the manual's rule for the load flag and the log file**

```text
title: the manual's rule for the load flag and the log file
source: manuals/miles-101/sections/6-3-survive-failures.md
lines: 25-25
lang: text
note: Read what --load must name and what the redirect does to the old log.
---
Start the same command again after a failure, with a new log file, such as `> runs/plain-resume.log`. The redirect of [section 1.1](#s-run-grpo-on-one-gpu) empties the old log, and you need it to find the cause of the failure. `--load` names the parent folder, never one `iter_` folder inside it. Miles reads its tracker file to find the last saved step. On the first run, the folder is empty, and Miles starts fresh.

```

**Evidence: the lines a resumed run must show, and the test before a long run**

```text
title: the lines a resumed run must show, and the test before a long run
source: manuals/miles-101/sections/6-3-survive-failures.md
lines: 34-36
lang: text
note: The second paragraph gives the two-step test.
---
The log of a resumed run should show `[FSDP] Loaded model from` and `[FSDP] Loaded optimizer from`, each with the folder of the step. If these lines are missing, the run started fresh. Our first run with an empty folder printed no message about the missing checkpoint. In our resume check, the first trainer line after the load was `step 2`.

Test a restart on a short run before the long run starts. Miles always saves after the last step, so run the command above with `MILES_NUM_ROLLOUT=2`. Then run it again with `MILES_NUM_ROLLOUT=4`. The first step line of the second run should be `step 2`, not `step 0`. We ran this test on our GB10 with Qwen3-0.6B, and it passed. We also ran the converter below on the step 2 checkpoint, and it wrote a model folder with the weights and the tokenizer files.

```

**Evidence: the files that the checkpoint converter wrote**

```text
title: the files that the checkpoint converter wrote
source: manuals/miles-101/capture/gpu/out-gb10/live-check-summary.txt
lines: 5-6
lang: text
note: The converter turned the step 2 checkpoint into a model folder that a serving engine can load.
---
## FSDP to Hugging Face (tools/convert_fsdp_to_hf.py, iter_0000002)
config.json generation_config.json LICENSE merges.txt model.safetensors README.md tokenizer_config.json tokenizer.json vocab.json 

```

**Questions**

1. The new log starts at `step 0`. Which lines must appear above it when a resume works, and what does their absence prove?
2. How loudly does Miles complain when the folder it loads from holds no checkpoint? What does that mean for the runbook?
3. The flag named the newest `iter_` folder. Why is that the wrong path, and which file does Miles read to find the last step?
4. The restart also destroyed something that the team now misses. What, and how do you restart so that it survives?
5. Write the test that every long run passes before it starts, with the step numbers you expect to see.
6. The team wants to serve the model from a saved step. Which tool does that, and what does it need besides the checkpoint?

:::answer Show the answer
:::say Short answer
The checkpoints were fine. The resume did not happen because `--load` named an `iter_` folder, which holds no tracker file, and Miles starts fresh without a message when it finds no step to load. Point `--load` at the parent folder, `/ckpt/run-a`, start again with a new log file, and read the three `Loaded` lines and the first step number before you walk away. The run then continues from the last saved step, as the check run did from `step 2`.
:::

**Walkthrough**

1. **Read the shape of the check.** The manual ran two short runs with the same flags: `--save /ckpt/run-a --save-interval 20 --load /ckpt/run-a`. The first ran 2 steps on an empty folder. The second ran 4 steps on the folder the first one left. This is the smallest test of a resume, and it is what the team should have run before the long run.
2. **Read the first run.** It wrote `[FSDP] Saved checkpoint to /ckpt/run-a/iter_0000002`, because Miles always saves after the last step. The count of lines that mention a missing tracker or a missing folder is 0. The load folder was empty and Miles said nothing about it. That silence is the whole incident: a run that finds nothing to load looks exactly like a run that was never asked to load.
3. **Read the second run.** It printed three `Loaded` lines, for the model, the optimizer and the LR scheduler, each with the folder of the step. Its first step line is `step 2`, not `step 0`, and it saved `iter_0000004` at its end. These three lines and that first step number are the proof of a resume. The team's log has none of them, so the new run started fresh.
4. **Read the folder.** It holds `iter_0000002`, `iter_0000004`, a `rollout` folder and one file, `latest_checkpointed_iteration.txt`. That file is the tracker. It sits in the parent folder, not inside an `iter_` folder.
5. **Apply the rule for the flag.** `--load` names the parent folder, never one `iter_` folder inside it, because Miles reads the tracker file there to find the last saved step. The engineer pointed the flag at a folder with no tracker, so Miles had no step to resume, which is the same case as an empty folder, and the manual's test shows that this case prints nothing.
6. **Apply the rule for the log.** The manual asks for a new log file on a restart, such as `> runs/plain-resume.log`, because the redirect empties the old log and the old log is where the cause of the failure is. The team lost the cause of the night's crash with the same keystroke that lost the resume.
7. **Read the converter output.** The FSDP trainer writes distributed checkpoints that other tools cannot load. The converter turned the step 2 checkpoint into a model folder with the weights, the configuration and the tokenizer files, given the base model folder for the configuration and the tokenizer.

**Resolution**

The checkpoints were fine. The resume did not happen because `--load` named an `iter_` folder, which holds no tracker file, and Miles starts fresh without a message when it finds no step to load. Point `--load` at the parent folder, `/ckpt/run-a`, start again with a new log file, and read the three `Loaded` lines and the first step number before you walk away. The run then continues from the last saved step, as the check run did from `step 2`.

Make the check part of the runbook. Before a long run, run the command with `MILES_NUM_ROLLOUT=2`, then again with `MILES_NUM_ROLLOUT=4`, and require `step 2` as the first step line of the second run. Choose `--save-interval` from the step time, so that a crash costs less than you accept: with a step of five minutes, an interval of 12 loses at most one hour. To serve a saved step, run the converter inside the container with the step folder, an output folder and the base model folder.

**Wrong turns**

- "The checkpoints are corrupt." The folder holds the step folders and the tracker file, and the manual's second run loaded the model, the optimizer and the LR scheduler from the same kind of folder. Nothing in the new log says that a load failed, because no load was attempted.
- "The resume feature does not work on the FSDP trainer." The check run resumed at `step 2` on the FSDP trainer and saved `iter_0000004`. The feature needs the parent folder, and it got a step folder.
- "Point the flag at the step folder to be sure it loads the right step." The tracker file in the parent folder names the last step. A step folder has no tracker, so the flag loads nothing.
- "Keep the same log file so the dashboard does not break." The redirect empties the old log and destroys the only record of the crash. Use a new file for each restart and point the dashboard at a folder.

**Generalize**

A feature that fails silently must be verified by its positive signal, never by the absence of an error. For every resume, every cache load and every state restore, know the log lines that prove it happened and the first value that must differ from a cold start, and test the whole restart path on a short run before you rely on it. Never let a restart overwrite the evidence of the failure that caused it.

:::

## A reward import error and a run that never stopped

*Level 2 · incident · about 20 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

A team adds its own reward function to a GRPO run. The function lives in a file in the lab folder on the host, and the run names it with `--custom-rm-path my_rewards.custom_rm`. A run queue starts the job at night. In the morning the queue shows that the job reached its time limit and came back with code 124, and that it completed zero steps. The container had been up for about two hours.

The host also runs the watchdog from an earlier incident, the script that stops a run whose rollout engine died. It did not fire. A teammate reads that as proof that the engine was healthy, blames a slow GPU, and proposes to double the time limit and start the job again.

**Evidence: what the run queue recorded for this run**

```text
title: what the run queue recorded for this run
source: manuals/miles-101/capture/gpu/out-gb10/custom-rm-noenv-hang.txt
lines: 17-19
lang: text
note: RC is the exit code that the queue saw when its time limit came, and steps counts the finished steps.
---
queue log:
2026-10-23T00:19:01Z LC684 RUN custom-rm-noenv
2026-10-23T02:17:10Z LC684 RC 124 custom-rm-noenv steps=0

```

**Evidence: the first and the last timestamped line, and the size of the log**

```text
title: the first and the last timestamped line, and the size of the log
source: manuals/miles-101/capture/gpu/out-gb10/custom-rm-noenv-hang.txt
lines: 11-13
lang: text
note: Compare the two timestamps with the queue record, then read the line count.
---
first timestamped line: 2026-10-23 00:19:02
last timestamped line: 2026-10-23 02:17:06
total log lines: 183248

```

**Evidence: every minute of the log that held a 503 line**

```text
title: every minute of the log that held a 503 line
source: manuals/miles-101/capture/gpu/out-gb10/custom-rm-noenv-hang.txt
lines: 14-16
lang: text
note: Two minutes hold errors. No other minute of the two hours holds one.
---
503 lines by minute (all from the RolloutExecutor):
     40 2026-10-23 00:24
      4 2026-10-23 00:25

```

**Evidence: the exception from the rollout executor**

```text
title: the exception from the rollout executor
source: manuals/miles-101/capture/gpu/out-gb10/custom-rm-noenv-hang.txt
lines: 6-7
lang: text
note: Read the module name in the error and the time of the line.
---
(RolloutExecutor pid=2515) [2026-10-23 00:21:09.569 rollout_executor] inference_rollout_train.py:143 - [rollout] Task raised exception: ModuleNotFoundError("No module named 'my_rewards'")
(RolloutExecutor pid=2515) ModuleNotFoundError: No module named 'my_rewards'

```

**Evidence: the summary that the capture kit wrote for this run**

```text
title: the summary that the capture kit wrote for this run
source: manuals/miles-101/capture/gpu/out-gb10/custom-rm-noenv-hang.txt
lines: 1-5
lang: text
note: The first line names the setting that this run did not pass.
---
# custom-rm-noenv: --custom-rm-path my_rewards.custom_rm without -e PYTHONPATH=/root/lab
# run started 2026-10-23T00:19:01Z, container stopped by hand 2026-10-23T02:17Z
# lines with 503 Service Unavailable: 44
# lines with rollout N metrics: 0
# step lines: 0

```

**Evidence: the counting rule of the watchdog**

```text
title: the counting rule of the watchdog
source: manuals/miles-101/capture/gpu/watchdog.sh
lines: 21-27
lang: bash
note: The script counts the 503 lines of the last 60 s and adds a strike when the count is above the limit, which defaults to 100.
---
  if logs=$(docker logs --since 60s "$name" 2>&1); then
    errors=$(printf '%s\n' "$logs" | grep -c "503 Service Unavailable")
    if [ "$errors" -gt "$limit" ]; then
      strikes=$((strikes + 1))
    else
      strikes=0
    fi

```

**Questions**

1. The exit code is 124 and the step count is zero. What does that pair tell you before you open the log?
2. The log holds 183,248 lines. Is this a hang, a crash, or something else? Where in the log do you read first?
3. Count the 503 lines per minute and apply the watchdog rule by hand. Was the watchdog wrong not to stop this run?
4. Read the exception. Which process raised it, and why does one missing environment variable reach that process?
5. Miles kept running after the error. Which second guard would have caught this run, and what does it watch?
6. What do you run before the next attempt, and which log line proves that the fix worked?

:::answer Show the answer
:::say Short answer
The run failed at its first rollout because the reward module was not on the Python path of the Ray workers. Stop the container, add `-e PYTHONPATH=/root/lab` next to `MILES_EXTRA_ARGS`, and start again. Before that, test the import in the container with the one-line command from the manual, which scores one answer and should print `1.0`, and run the function on ten answers that you scored by hand, including an empty answer and an answer cut at the length limit.
:::

**Walkthrough**

1. **Read the queue record.** The queue started the job at 00:19:01 and recorded RC 124 at 02:17:10 with `steps=0`. Code 124 is what the queue writes when its own time limit stops a job. So the run did not end by itself, and it did not finish a step in two hours. More time would not have changed the count.
2. **Read the span and the size.** The first timestamped line is at 00:19:02 and the last at 02:17:06, and the file holds 183,248 lines. A run that writes a log of that size for two hours is not asleep. It is busy with something that is not training. The reason is near the start, not at the end.
3. **Run the watchdog arithmetic yourself.** The log holds 44 lines of `503 Service Unavailable`, 40 of them in the minute of 00:24 and 4 in the minute of 00:25. The watchdog reads the last 60 s every 30 s and adds a strike only if the count is above 100. It needs 10 strikes in a row. This run never gave it one strike. The watchdog was correct. The rollout engine did not die, and a short burst like this can come from a healthy engine.
4. **Read the exception.** At 00:21:09 the rollout executor logged that a rollout task raised `ModuleNotFoundError: No module named 'my_rewards'`. The scoring of answers runs in the Ray workers, and that is where the import failed. After this line no `rollout 0` line ever appears, because no answer can be scored. The 503 burst three minutes later is noise next to this line.
5. **Find what the run did not pass.** The kit summary says it: the run passed `--custom-rm-path my_rewards.custom_rm` and not `-e PYTHONPATH=/root/lab`. The container sees the lab folder as `/root/lab`, but Python does not search that folder unless the variable names it. The launcher passes the variable on to the Ray workers, so the one setting fixes the import in the process that needs it.
6. **See why nothing stopped the run.** The manual records the same test: after this error the job stayed up for two hours with no rollout step, and the watchdog did not stop it because the engine wrote only 44 error lines. The watchdog watches for one failure shape, a dead engine. A run that cannot score its answers has a different shape, almost no errors and no progress.

**Resolution**

The run failed at its first rollout because the reward module was not on the Python path of the Ray workers. Stop the container, add `-e PYTHONPATH=/root/lab` next to `MILES_EXTRA_ARGS`, and start again. Before that, test the import in the container with the one-line command from the manual, which scores one answer and should print `1.0`, and run the function on ten answers that you scored by hand, including an empty answer and an answer cut at the length limit.

The line that proves the fix is the first `rollout 0` line, which shows a `rollout/raw_reward` that your function computed. Then give the queue two rules. Treat a time-limit exit with `steps=0` as a failure, not as a slow run. Stop a run that shows no `rollout 0` line within ten minutes of its start, which is the manual's sign that the engine or the trainer did not start.

**Wrong turns**

- "The watchdog missed a dead engine, so lower its limit." The run wrote 44 error lines in two hours, all inside two minutes. A healthy run with 16 answers per prompt wrote 2,209 in one minute. A limit low enough to catch 44 fires on every healthy burst, and still misses this run, which went quiet for the rest of the two hours.
- "Double the time limit and start it again." The log grew to 183,248 lines with no finished step. More time buys more lines and the same count.
- "Rebuild the image with the reward file inside." That works until the next change to the reward. The launcher already passes `PYTHONPATH` to the Ray workers, so one variable on the run command is the fix.
- "Write the reward as a plain function so the import gets simpler." The import failed on the module name, before any function ran. A plain function fails later and in a different way, because Miles awaits the result.

**Generalize**

A job that cannot start its work and does not stop is the most expensive failure, because it spends its whole time limit and gives no signal. Every guard watches for one failure shape. The dead-engine guard counts errors, and an import error produces almost none. Add a guard for progress, such as a first step by a deadline, read the exit code of the queue as data, and read a log from its start, where the first exception sits.

:::
