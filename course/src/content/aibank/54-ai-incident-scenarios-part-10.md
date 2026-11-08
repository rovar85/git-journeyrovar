---
track: aibank
title: "AI incident scenarios, read the evidence (part 10 of 10)"
short: Incidents 10
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## A memory guard paused the scheduler mid-start

*Level 4 · incident · about 30 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-30B-A3B-Instruct-2507; hardware: one GB10 with unified memory, a desktop that other users share*

A team gets time on a GB10 desktop that several people share, and starts an SGLang server for `Qwen/Qwen3-30B-A3B-Instruct-2507`. Three starts in one afternoon stall after the weights load. The server log stops, the scheduler process is alive but does nothing for a while, then the log continues as if nothing happened. Nobody sees an error.

That afternoon the on-call channel also gets pages from a kernel-log alert. Nine bursts of an NVIDIA driver line that says `Out of memory` arrive between 13:52 and 16:46, up to 13 lines in one minute. The team puts the two things together: the driver is faulty, and the server leaks memory until the driver fails. They ask to move the model to a smaller, dedicated card. The owner of the desktop asks you to review before anyone changes hardware.

**Evidence: the guard log around the first pause**

```text
title: the guard log around the first pause
source: manuals/sglang-101/capture/gpu/incidents/gb10-memory-guard-pauses.txt
lines: 1-5
lang: text
note: Read the process name, the growth in five seconds, and the time until the guard reported normal.
---
2026-10-16T12:53:16+00:00 2026/10/16 12:53:16 guardian level: Critical: 34.2 GiB left before the freeze zone.
2026-10-16T12:53:16+00:00 2026/10/16 12:53:16 guardian pause: Paused sglang::schedul (pid 2983880, rohit): it grew 36.7 GiB in 5s with 34.2 GiB left. Resume or stop it from the app.
2026-10-16T12:53:24+00:00 2026/10/16 12:53:24 guardian level: Back to normal: 28.9 GiB available.
2026-10-16T12:53:28+00:00 2026/10/16 12:53:28 guardian level: Critical: 30.2 GiB left before the freeze zone.
2026-10-16T12:53:48+00:00 2026/10/16 12:53:48 guardian level: Back to normal: 31.9 GiB available.

```

**Evidence: two more pauses in the next hour**

```text
title: two more pauses in the next hour
source: manuals/sglang-101/capture/gpu/incidents/gb10-memory-guard-pauses.txt
lines: 6-11
lang: text
note: Compare the growth of the scheduler in each pause.
---
2026-10-16T13:22:18+00:00 2026/10/16 13:22:18 guardian level: Critical: 46.8 GiB left before the freeze zone.
2026-10-16T13:22:18+00:00 2026/10/16 13:22:18 guardian pause: Paused sglang::schedul (pid 3034142, rohit): it grew 9.4 GiB in 5s with 46.8 GiB left. Resume or stop it from the app.
2026-10-16T13:22:27+00:00 2026/10/16 13:22:27 guardian level: Back to normal: 43.1 GiB available.
2026-10-16T13:52:10+00:00 2026/10/16 13:52:10 guardian level: Critical: 50.1 GiB left before the freeze zone.
2026-10-16T13:52:10+00:00 2026/10/16 13:52:10 guardian pause: Paused sglang::schedul (pid 3094220, rohit): it grew 28.1 GiB in 5s with 50.1 GiB left. Resume or stop it from the app.
2026-10-16T13:52:30+00:00 2026/10/16 13:52:30 guardian level: Back to normal: 44.6 GiB available.

```

**Evidence: the weights and the pool of a default start that was kept**

```text
title: the weights and the pool of a default start that was kept
source: manuals/sglang-101/capture/gpu/out-gb10/server-default.log
lines: 18-20
lang: text
note: Add the K and the V sizes, and compare them with the growth in the guard log.
---
[2026-10-17 14:18:29] Load weight end. elapsed=323.61 s, type=Qwen3MoeForCausalLM, avail mem=54.84 GB, mem usage=57.75 GB.
[2026-10-17 14:18:32] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 227243, K size: 10.40 GB, V size: 10.40 GB
[2026-10-17 14:18:32] Memory pool end. avail mem=31.22 GB

```

**Evidence: the driver line in the kernel log, counted by minute**

```text
title: the driver line in the kernel log, counted by minute
source: manuals/sglang-101/capture/gpu/incidents/gb10-driver-no-memory.txt
lang: text
note: The bursts are all on one day. The last line is the message itself.
---
count  minute (UTC)  kernel message, NVIDIA driver on the GB10
      3 2026-10-16T13:52
      9 2026-10-16T14:36
     13 2026-10-16T14:55
     10 2026-10-16T15:04
      7 2026-10-16T15:30
      7 2026-10-16T15:47
     12 2026-10-16T15:58
      9 2026-10-16T16:11
      7 2026-10-16T16:46
NVRM: nvCheckOkFailedNoLog: Check failed: Out of memory [NV_ERR_NO_MEMORY] (0x00000051) returned from _memdescAllocInternal(pMemDesc) @ mem_desc.c:1359

```

**Evidence: what the manual can and cannot say about the three pauses**

```text
title: what the manual can and cannot say about the three pauses
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 123-123
lang: text
note: One paragraph. Read which logs were not kept.
---
We did not keep the server logs of those three starts. The guard log shows the scheduler growing by 36.7 GiB in 5 seconds, which is the size of a KV pool allocation. The guard was correct by its own rule: the scheduler was the fastest-growing process. Seconds later the guard logged "Back to normal", because the pool was complete. We agreed with the owner of the machine to stop the guard for the time of our runs.

```

**Evidence: the driver bursts and the position of the manual**

```text
title: the driver bursts and the position of the manual
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 136-138
lang: text
note: Read the last sentence of the position.
---
The bursts are dated 2026-10-16, the day of our first test and sweep starts on the GB10. We did not keep the server logs of that day, so we cannot match each burst to one start. Every server in our later captures became healthy and finished its benchmarks.

**Our position:** on unified memory, the KV pool is memory that the whole machine gives up. Pass `--mem-fraction-static` on purpose, and tell the other users of the machine before you start. Do not alert on the driver line alone. Alert when a server does not become healthy.

```

**Evidence: how to start on a shared machine with unified memory**

```text
title: how to start on a shared machine with unified memory
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 146-146
lang: text
note: Four steps in one paragraph.
---
On a GB10 that other programs share, start SGLang in a container with a memory limit. Start below the fraction of 0.7 that our kit used. Log the free memory of the machine once a second during startup. Raise the fraction only after you saw the peak.

```

**Questions**

1. The scheduler stopped and later continued, and the server log shows no error. Which process stopped it, and on what rule?
2. The guard saw one process grow by tens of GiB in five seconds. Which allocation is that likely to be, and how do you check it against a start whose log was kept?
3. The three pauses report different growth. What can you conclude from the guard log alone, and what can you not?
4. Nine bursts of the driver line fell on one day. What does the manual claim about them, and what would it take to tie one burst to one start?
5. Which alert do you keep and which do you remove, and what is the start procedure for this machine from now on?

:::answer Show the answer
:::say Short answer
As far as the evidence shows, the server did not leak and the driver was not faulty. A guard that watches the whole machine paused the scheduler while it allocated its pool, three times, and resumed it each time within seconds. The driver bursts fell on the same day, and the captures hold no link from any burst to a failed start or to a user who saw an error.
:::

**Walkthrough**

1. **Read the guard log first.** The desktop runs a memory guard daemon for its other users. It stops the process that grows fastest when free memory gets low. Its first entry reads `Critical: 34.2 GiB left before the freeze zone`, and the same second it paused `sglang::schedul` because it grew 36.7 GiB in 5s. Eight seconds later the guard logged `Back to normal: 28.9 GiB available`. The scheduler was the fastest-growing process on the machine, so the guard was correct by its own rule. That is the stall the team saw, and no server log records it, because the server was not told anything.
2. **Match the growth against a kept start.** The default start that the manual kept shows what the scheduler allocates right after the weights: a KV pool that holds 227,243 tokens, with 10.40 GB for K and 10.40 GB for V, allocated in a few seconds, with 54.84 GB free before and 31.22 GB free after. The manual reads the 36.7 GiB as the size of a KV pool allocation. It also notes a field report of 25 to 40 GB of short-lived allocations outside the fraction, from the autotuner and the graph capture, and says plainly that the guard log does not separate the pool from those. So the growth is the startup allocation of a server on unified memory, and its exact split is not proven.
3. **Read the other two pauses with the same care.** They report 9.4 GiB and 28.1 GiB of growth, and each time the guard reported normal within seconds. The server logs of those three starts were not kept, so nobody can say which allocation each pause caught. The manual's table of six kept starts shows why a single number would mislead anyway: the same weights measured between 54.78 and 57.92 GB, and the pools ran from 216,775 to 258,017 tokens, because the kernel's file cache changed during each load. What the guard log does prove is a process that grows by tens of GiB in seconds and then stops growing. A leak would keep the guard busy after the pool line, and no entry shows that.
4. **Read the driver bursts as a count, not a verdict.** The kernel line is `NV_ERR_NO_MEMORY` from the driver's allocator. The bursts are dated 2026-10-16, the day of the first test and sweep starts, with 3 to 13 lines per minute. The manual kept no server logs from that day, so it cannot match a burst to a start and refuses to. What it can say is that every server in its later captures became healthy and finished its benchmarks. To tie a burst to a start you would need the server log with timestamps and the free-memory log of the machine for the same minute.
5. **Turn the reading into a procedure.** The manual's position for a shared GB10 has four steps: start SGLang in a container with a memory limit, start below the fraction of 0.7 that its kit used, log the free memory of the machine once a second during startup, and raise the fraction only after you saw the peak. Add two more from the same page: pass `--mem-fraction-static` on purpose, and tell the other users of the machine before you start. For the guard, the manual agreed with the owner to stop it for the time of its runs. On the alert, the position is one sentence: do not alert on the driver line alone, alert when a server does not become healthy.

**Resolution**

As far as the evidence shows, the server did not leak and the driver was not faulty. A guard that watches the whole machine paused the scheduler while it allocated its pool, three times, and resumed it each time within seconds. The driver bursts fell on the same day, and the captures hold no link from any burst to a failed start or to a user who saw an error.

The team kept the model on the GB10 and changed how it starts: an explicit fraction, a container with a memory cap, a free-memory log during startup, and an agreement with the owner about the guard while the server runs. The kernel-line page was replaced with a health alert on the server's ready line and its health endpoint, which in the kept start returned 503 before the ready line and 200 after it. The measurement that supports the change is the set of later starts, which reached their pool lines and ran their benchmarks with no pause and no page.

Two things stay open, and the write-up says so. No capture ties a driver burst to a start, and the field report of allocations outside the fraction is from before this version and was not measured here.

**Wrong turns**

- "The server leaks memory until the driver fails." The guard logged normal within seconds of each pause, and no entry shows growth after the pool was in place. A pool of tens of GB allocated in seconds is the design, not a leak.
- "Replace the driver." The bursts carry no user-visible failure in the captures, and every later server became healthy. A line in the kernel log is not an incident until a user or a probe sees one.
- "Raise the fraction, so the pool is allocated once and the guard stops complaining." The fraction sets the pool size. A larger pool grows faster and leaves less for the other users. Lower it, cap the container, and watch the peak.
- "Match each burst to a start from the timestamps." Without the server logs of that day the match is a guess, and the manual refused to make it. Keep the logs that let you correlate before you correlate.
- "Move to a smaller dedicated card." That trades a shared machine for a smaller pool and gives up the result that the GB10 served every later run. Fix the start procedure first, then decide.

**Generalize**

On unified memory, a KV pool is memory that the whole machine gives up in a few seconds, and every guard, daemon and user on that machine sees it go. Treat the start of a server as an event that you announce, cap and log, not as something that happens inside one process. When an alert fires, ask what it measured and who was harmed. Keep the logs that let you connect an event to a cause, and when they are missing, write down that the connection is not proven instead of asserting it.

:::

## A rate sweep that never reached steady state

*Level 4 · incident · about 30 minutes · version: vLLM 0.31.0 and SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory*

A platform team must size a fleet of L4 cards for a new chat API. They run a rate sweep against one card with `Qwen/Qwen3-8B`: requests arrive at a fixed rate from 0.5 to 16 per second, each request with a 512-token prompt and a 128-token answer. Every run completes and no request fails. The output rises to 286.6 tokens per second at 4 per second and is still 205.8 at 16. The capacity report concludes that one card can take 16 requests each second, so the fleet plan divides the expected peak by 16.

You get the report the evening before the purchase order goes out. It shows throughput per rate and the median wait for the first token at each rate, and it labels that column "latency under load, expected". Nothing in the report says how long each run lasted or what the GPU clock did.

**Evidence: the L4 rate sweep from 0.5 to 16 requests per second**

```text
title: the L4 rate sweep from 0.5 to 16 requests per second
source: manuals/vllm-101/sections/r-7-lab-notes.md
lines: 81-96
lang: text
note: Follow the median TTFT column down the table, then read the output and the clock columns.
---
### L4, rate: requests each second, 512 prompt and 128 output tokens

| Rate | Config | Output tok/s (min to max) | Median TTFT | Median TPOT | P99 ITL (min to max) | Median SM clock |
|---|---|---|---|---|---|---|
| 0.5 | `vllm` | 70.6 (67.2 to 92.3) | 317 ms | 72.7 ms | 214 (208 to 215) ms | 1,485 MHz |
| 0.5 | `sglang` | 70.6 (67.2 to 92.3) | 284 ms | 74.7 ms | 235 (234 to 235) ms | 1,485 MHz |
| 1 | `vllm` | 123.6 (118.4 to 154.5) | 180 ms | 68.2 ms | 77 (77 to 79) ms | 1,485 MHz |
| 1 | `sglang` | 123.3 (118.4 to 153.6) | 166 ms | 74.0 ms | 114 (113 to 166) ms | 1,500 MHz |
| 2 | `vllm` | 227.8 (216.5 to 231.8) | 233 ms | 88.7 ms | 355 (351 to 358) ms | 1,418 MHz |
| 2 | `sglang` | 226.3 (215.5 to 230.1) | 221 ms | 99.9 ms | 387 (384 to 429) ms | 1,433 MHz |
| 4 | `vllm` | 286.6 (283.7 to 291.7) | 8,304 ms | 126.9 ms | 621 (620 to 627) ms | 1,245 MHz |
| 4 | `sglang` | 257.5 (254.9 to 259.7) | 9,575 ms | 115.1 ms | 680 (383 to 811) ms | 1,350 MHz |
| 8 | `vllm` | 261.8 (259.4 to 264.3) | 27,510 ms | 126.0 ms | 1,184 (1,089 to 1,361) ms | 1,035 MHz |
| 8 | `sglang` | 253.9 (250.7 to 260.7) | 37,211 ms | 105.2 ms | 277 (259 to 317) ms | 1,215 MHz |
| 16 | `vllm` | 205.8 (204.8 to 208.4) | 94,322 ms | 185.2 ms | 1,448 (1,448 to 1,483) ms | 450 MHz |
| 16 | `sglang` | 218.2 (215.6 to 229.0) | 97,542 ms | 115.2 ms | 137 (120 to 163) ms | 600 MHz |

```

**Evidence: what a fixed request rate does that a closed loop cannot**

```text
title: what a fixed request rate does that a closed loop cannot
source: manuals/vllm-101/sections/5-1-benchmark-your-server-in-15-minutes.md
lines: 115-119
lang: text
note: Read the second paragraph: past the rate the server can serve, the queue grows with every request.
---
## Choose a closed loop or a fixed rate

`--max-concurrency` keeps a fixed number of users busy. When the server slows down, the users send their next request later, so the load drops by itself. This closed loop never falls behind.

`--request-rate` sends requests at a fixed rate, whether the server keeps up or not. Past the rate the server can serve, the queue grows, and the first token takes longer with every request. Real traffic behaves more like a fixed rate. Run both before you set a capacity limit.

```

**Evidence: the run length of the rate sweep**

```text
title: the run length of the rate sweep
source: manuals/sglang-101/sections/5-3-reading-other-peoples-benchmarks.md
lines: 199-201
lang: text
note: The last sentence gives the run length: at least 32 prompts, or 30 seconds of arrivals.
---
### The same pair at a fixed arrival rate

A closed loop sends a new request only when one comes back, so the engine sets the pace. Production traffic does not wait for the engine. We ran the rate sweep of [section 5.1](#s-sglang-benchmark-serving) on the same pair, with the same pools and the same rules for heat and clock. Requests arrived at a Poisson rate from 0.5 to 16 per second, with 512 input and 128 output tokens. Each run sent at least 32 prompts, or 30 seconds of arrivals.

```

**Evidence: the SGLang pool and one decode line with requests waiting**

```text
title: the SGLang pool and one decode line with requests waiting
source: manuals/sglang-101/capture/gpu/out-l4/server-h2h-rate-sglang.log
lang: text
note: Count the running requests, the queued requests and the token usage in the second line.
---
[2026-10-18 00:43:57] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 24094, K size: 1.65 GB, V size: 1.65 GB
[2026-10-18 03:13:55] Decode batch, #running-req: 37, #token: 22424, token usage: 0.93, cuda graph: True, gen throughput (token/s): 370.33, #queue-req: 71

```

**Evidence: the vLLM pool and one stats line with requests waiting**

```text
title: the vLLM pool and one stats line with requests waiting
source: manuals/sglang-101/capture/gpu/out-l4/server-h2h-rate-vllm.log
lang: text
note: Count the running and the waiting requests, and read the KV cache usage.
---
INFO 10-18 03:15:35 [kv_cache_utils.py:2464] GPU KV cache size: 24,096 tokens, Maximum concurrency for 8,192 tokens per request: 2.94x
INFO 10-18 06:10:22 [loggers.py:320] Engine 000: Avg prompt throughput: 1326.7 tokens/s, Avg generation throughput: 158.4 tokens/s, Running: 43 reqs, Waiting: 30 reqs, GPU KV cache usage: 99.7%, Prefix cache hit rate: 0.6%

```

**Evidence: which rates kept up, which met the target, and which row the manual refuses to compare**

```text
title: which rates kept up, which met the target, and which row the manual refuses to compare
source: manuals/sglang-101/sections/5-3-reading-other-peoples-benchmarks.md
lines: 240-248
lang: text
note: Find the rate from which no request met the target, then the reason the row at 16 is not compared.
---
**We measured** a tie up to 2 requests per second. Both engines kept up with the arrivals, so throughput was within 1 percent. SGLang gave the first token sooner at 0.5 and 1 per second, outside the seed spread. The medians were 284 against 317 ms and 166 against 180 ms. vLLM had the shorter time per token. It was 68 against 74 ms at 1 per second, outside the spread, and 89 against 100 ms at 2.

Goodput shows what that means for a target. We set the target at 1 s to the first token and 100 ms per token. At 2 requests per second, vLLM served a median of 1.36 requests per second within the target, and SGLang 0.88. The seed ranges overlapped, 1.09 to 1.44 against 0.54 to 1.18. The SGLang median time per token was 99.9 ms, on the line of the target.

From 4 requests per second, both engines fell behind the arrivals, and no request met the target. The stats lines show the same admission choice as in the closed loop. SGLang ran 37 requests with the pool 93 percent full. The vLLM server ran 43 requests and filled 99.7 percent of its pool.

At 4 per second, vLLM gave 286.6 against 257.5 tok/s, 11 percent more and outside the seed spread. Its median first token came at 8.3 against 9.6 s, but those seed ranges overlapped. The cost was the stream: its P99 time per token was 187 against 127 ms, outside the spread.

The clock does not explain the gap at 4. The vLLM runs had the lower median clock, 1,245 against 1,350 MHz. At 8 per second the throughput ranges overlapped. At 16 per second, every run of both engines stayed under 1,000 MHz after three tries, so we do not compare that row.

```

**Evidence: completed requests per second as the offered rate rose past the peak**

```text
title: completed requests per second as the offered rate rose past the peak
source: manuals/sglang-101/sections/5-1-sglang-benchmark-serving.md
lines: 325-327
lang: text
note: Read the completed rate at 4, 8 and 16 offered, then the clock and the thermal share.
---
**We measured** a different shape on the smaller card. Both servers met the target for every request up to 1 per second. BF16 held 0.88 within the target at 2 offered and none from 4. FP8 held 3.18 within the target at 4 offered, three times the best BF16 point. The FP8 server also had a pool of 142,369 tokens against 24,094 for BF16. From 4 offered, the BF16 pool was the limit.

Past its peak, BF16 completed fewer requests as we offered more: 2.01 per second at 4 offered, 1.91 at 8, and 1.62 at 16. The telemetry shows why. The median SM clock fell from 1,320 MHz at 4 offered to 465 MHz at 16. At 16, 70 percent of the samples showed thermal slowdown. On our passively cooled L4, overload cost throughput as well as latency.

```

**Questions**

1. Which column of the report proves that the card kept up with the arrivals, and at which rate does that proof stop?
2. A closed loop at 64 users and an open loop at 16 per second both complete. What is different about the queue in the two cases?
3. The median first token at 16 per second was 94,322 ms. What would that number be if the run had lasted twice as long, and why?
4. Read the two log lines. How many requests ran and how many waited on each engine, and what set that limit?
5. Define the capacity of this card for a target of one second and 100 ms, from the evidence.
6. Write the rate test you would run instead, and the stopping rule that tells you a point is above capacity.

:::answer Show the answer
:::say Short answer
The report mistook completion for capacity. A fixed-rate run always completes, because the client stops sending at the end of its arrival window and the server drains the queue afterwards. The first-token column from 4 per second up is the length of that queue, and at 16 per second it reached 94,322 ms after 30 seconds of arrivals. The card never served 16 requests per second within any latency target. It served about 2 per second within the target of 1 s and 100 ms, with vLLM at 1.36 and SGLang at 0.88 requests per second of goodput at an offered 2.
:::

**Walkthrough**

1. **Read the table as a time series, not as a list of points.** Up to 2 per second the output grows with the rate: 70.6 at 0.5, 123.6 at 1 and 227.8 at 2 for vLLM, and the median TTFT stays between 180 and 317 ms. The server finishes work as fast as it arrives. At 4 per second the output is 286.6 and the median TTFT is 8,304 ms. At 8 the pair is 261.8 and 27,510 ms, and at 16 it is 205.8 and 94,322 ms. The output peaked at 4 and then fell, while each doubling of the rate multiplied the first token by more than three. The clock column falls from 1,245 MHz at 4 to 450 MHz at 16.
2. **Name the loop.** The second listing separates the two kinds of load test. A closed loop with a fixed number of users never falls behind, because a user sends the next request only after the answer. A fixed rate keeps sending whether the server keeps up or not. Past the rate the server can serve, the queue grows, and the first token takes longer with every request. From 4 per second, the first-token column of the report measures queue time.
3. **Ask how long the run was.** The third listing gives the run length: at least 32 prompts, or 30 seconds of arrivals. A median TTFT of 94,322 ms from a run with 30 seconds of arrivals means that the typical request waited longer than the whole arrival window. The queue was still growing when the last request arrived. Run the same rate for twice as long and the median grows, because every extra second of arrivals adds work that the server cannot drain. The number is a property of the run length, not of the card. That is what a point above capacity looks like: the latency never settles.
4. **Count who ran and who waited.** SGLang ran 37 requests with 71 in its queue and the pool 93 percent full. vLLM ran 43 requests with 30 waiting and 99.7 percent of its pool in use. The pools hold 24,094 and 24,096 tokens, so about forty requests of 512 plus 128 tokens fit at once. Everything that arrives faster than those slots free up waits. The engines differ only in how many they admit before they queue.
5. **Define capacity from goodput.** The manual set two limits, 1 s to the first token and 100 ms per token. At 2 per second, vLLM served a median of 1.36 requests per second within those limits and SGLang 0.88, with overlapping seed ranges. From 4 per second, no request met them on either engine. So the card sustains that target somewhere between 2 and 4 per second, and the number to plan with is 2. The row at 16 is not even comparable: every run of both engines stayed under 1,000 MHz after three tries, so the manual does not compare it.
6. **Count what overload cost.** The last listing is the same card in the open loop of the SGLang manual. Past its peak, the BF16 server completed fewer requests as more were offered: 2.01 per second at 4 offered, 1.91 at 8 and 1.62 at 16. The median SM clock fell from 1,320 MHz at 4 offered to 465 MHz at 16, and 70 percent of the samples showed thermal slowdown. On this passively cooled card, overload is not free. It heats the GPU, the clock falls, and the server completes less than it did at a lower rate.

**Resolution**

The report mistook completion for capacity. A fixed-rate run always completes, because the client stops sending at the end of its arrival window and the server drains the queue afterwards. The first-token column from 4 per second up is the length of that queue, and at 16 per second it reached 94,322 ms after 30 seconds of arrivals. The card never served 16 requests per second within any latency target. It served about 2 per second within the target of 1 s and 100 ms, with vLLM at 1.36 and SGLang at 0.88 requests per second of goodput at an offered 2.

The peak is divided by 2, not by 16, before any headroom. The test changes in four ways. Run each rate long enough to see whether the first token settles; if the median TTFT rises when you extend the run, the rate is above capacity and the number is meaningless. Report goodput per offered rate against your own target, next to the throughput. Record the SM clock and the temperature, and repeat or discard any point that fell under the clock floor, as the manual did for the row at 16. Run the closed loop too, because the closed loop finds the knee by user count and the open loop finds the rate the card sustains, and a plan needs both.

**Wrong turns**

- "Every run finished, so the card handles 16 per second." A fixed-rate client stops sending at the end of its window and the server drains the queue afterwards. Completion is guaranteed. The 94,322 ms median first token is the queue, not the service.
- "Output was still 205.8 tokens per second at 16, so throughput held." Output fell from 286.6 at 4 per second to 205.8 at 16 while the clock fell from 1,245 to 450 MHz. The server did less work at the higher rate, and the open loop of the SGLang manual shows the same fall in completed requests per second.
- "Take the TTFT at 16 as the worst case users will see." That value depends on how long the test ran. Extend the run and it grows. A number that grows with the run length describes the test, not the server.
- "Switch to the engine with the lower TTFT at 8 per second." At 8 per second both engines were far past capacity, 27,510 against 37,211 ms. Choosing between two overloaded servers by their queue length is not a capacity decision.

**Generalize**

A system above its service rate has no steady state, so every latency you measure there is a function of how long you measured. Capacity is the highest offered rate at which the latency settles and the goodput holds, found with an open loop that runs long enough to prove the settling, and confirmed with a closed loop for the user count. Completion, throughput and a median taken from a growing queue are not capacity.

:::

## A rebuilt function that was plausible, not equal

*Level 4 · incident · about 30 minutes · version: rea 6.7.0 at 27dc42d with the Ghidra provider; model: no model; the fixtures are the ledger binaries built at -O1 and -O2; hardware: one aarch64 Mac*

An agent is asked to rebuild two functions of the `ledger` fixture from Ghidra pseudocode, `percent_change` and `grade`, so that a team can drop the original object file. It writes `percent_change` with the `long` that the decompiler offered and `grade` as four threshold comparisons. It runs the ten hand-written tests of the lesson harness, and all ten pass. It then calls `verify_reconstruction` over two `compare_functions` records that cover the `-O1` and `-O2` builds, sees two claims pass and two fail, and reports: "percent_change is verified equal; total has changed between builds, so the compiler broke it."

The team lead reads the report and asks two questions. What does a passed claim in that tool prove about a function, and what does a failed one prove? And which test decides whether the rebuilt functions are equal to the originals? You have the verification record, the harness notes, and the harness outputs for two candidate pairs.

**Evidence: the verification status, the summary, and the first claim**

```text
title: the verification status, the summary, and the first claim
source: manuals/reverse-engineering-101/capture/out/10-mcp-22-verify-reconstruction.json
lines: 81-98
lang: json
note: Two passed and two failed. The first claim reads unchanged on its one dimension.
---
          "status": "fail",
          "specification_sha256": "9e8d22fa6db331994f2e80be5b728575a0e9cb17ff1e63d24ece22d235084bfe",
          "summary": {
            "total": 4,
            "passed": 2,
            "failed": 2,
            "unknown": 0,
            "behavioral": 0,
            "structural": 4
          },
          "claims": {
            "items": [
              {
                "claim_id": "percent-change-assembly",
                "kind": "structural-function",
                "dimension": "assembly",
                "status": "pass",
                "observed_status": "unchanged",

```

**Evidence: the total-assembly claim**

```text
title: the total-assembly claim
source: manuals/reverse-engineering-101/capture/out/10-mcp-22-verify-reconstruction.json
lines: 195-199
lang: json
note: The observed status is the status of one dimension of one comparison record.
---
                "claim_id": "total-assembly",
                "kind": "structural-function",
                "dimension": "assembly",
                "status": "fail",
                "observed_status": "changed",

```

**Evidence: what the harness is and what it ran**

```text
title: what the harness is and what it ran
source: manuals/reverse-engineering-101/capture/out/17-harness.txt
lang: text
note: Two legs: run both over a grid, then compare bytes after relocation masking.
---
harness: phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/main.py loaded from phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code
original object: fixtures/ledger-x86_64-O1.o (9a4a8082ba5e285a732552981a6935e0c5255725664f380e37c44ebfb04d803f)
host: aarch64 Darwin, compiler /usr/bin/clang
leg one: fixtures/ledger.c and each candidate compiled natively at -O1 into one program with phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/driver.c, then run over 92 cells
leg two: each candidate compiled with `clang -target x86_64-unknown-linux-gnu -O1 -fno-asynchronous-unwind-tables -c`, then compared with the original after relocation masking
files: 17-harness-grid.json, 17-harness-execute-plausible.json, 17-harness-execute-equal.json, 17-harness-bytes.json

```

**Evidence: the agent's pair over the grid, head and first mismatch**

```text
title: the plausible pair over the grid, head and first mismatch
source: manuals/reverse-engineering-101/capture/out/17-harness-execute-plausible.json
lines: 1-22
lang: json
note: The ten naive cases passed. The first mismatch is an overflow cell.
---
{
  "candidates": {
    "percent_change": "phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/fixtures/candidates/percent_change_wide.c",
    "grade": "phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/fixtures/candidates/grade_thresholds.c"
  },
  "original": "fixtures/ledger.c compiled with the host clang at -O1",
  "original_kind": "fixture-source",
  "host": "aarch64 Darwin",
  "arch": "aarch64",
  "naive_passed": true,
  "cells": 92,
  "mismatches": [
    {
      "function": "percent_change",
      "args": [
        3,
        2147483647
      ],
      "kind": "overflow",
      "original": -133,
      "candidate": -1431655899,
      "match": false

```

**Evidence: the two grade cells that the threshold rebuild got wrong**

```text
title: the two grade cells that the threshold rebuild got wrong
source: manuals/reverse-engineering-101/capture/out/17-harness-execute-plausible.json
lines: 299-318
lang: json
note: Both cells sit beyond the last case of the switch.
---
    {
      "function": "grade",
      "args": [
        110
      ],
      "kind": "beyond the switch",
      "original": 0,
      "candidate": 4,
      "match": false
    },
    {
      "function": "grade",
      "args": [
        2147483647
      ],
      "kind": "beyond the switch",
      "original": 0,
      "candidate": 4,
      "match": false
    }

```

**Evidence: the equal pair over the same grid**

```text
title: the equal pair over the grid
source: manuals/reverse-engineering-101/capture/out/17-harness-execute-equal.json
lines: 1-13
lang: json
note: No mismatch and no oracle disagreement on the same 92 cells.
---
{
  "candidates": {
    "percent_change": "phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/fixtures/candidates/percent_change_mul_first.c",
    "grade": "phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/fixtures/candidates/grade_switch.c"
  },
  "original": "fixtures/ledger.c compiled with the host clang at -O1",
  "original_kind": "fixture-source",
  "host": "aarch64 Darwin",
  "arch": "aarch64",
  "naive_passed": true,
  "cells": 92,
  "mismatches": [],
  "oracle_disagreements": [],

```

**Evidence: a rebuild with one wrong table entry in the byte comparison**

```text
title: a rebuild with one wrong table entry in leg two
source: manuals/reverse-engineering-101/capture/out/17-harness-bytes.json
lines: 261-300
lang: json
note: Masked bytes equal, relocations match, and the status is still fail. Read the two tables.
---
      "candidate": "grade_case10_wrong",
      "source": "phases/13-tools-and-protocols/36-rebuild-and-prove-equal/code/fixtures/candidates/grade_case10_wrong.c",
      "original_size": 46,
      "candidate_size": 46,
      "masked_equal": true,
      "differing_offsets": [],
      "masked_ranges": [
        [
          38,
          4
        ]
      ],
      "relocations_match": true,
      "relocations": [
        {
          "offset": 38,
          "type": "R_X86_64_PC32",
          "original_target": ".rodata+0x10",
          "candidate_target": ".rodata-0x4",
          "same_shape": true
        }
      ],
      "original_table": [
        1,
        2,
        3,
        4,
        4
      ],
      "candidate_table": [
        1,
        2,
        3,
        4,
(excerpt: the first 40 of 46 lines)
```

**Questions**

1. A claim passed with `observed_status: "unchanged"`. What was compared, and what does unchanged mean here?
2. The `total` claims failed although both builds come from one source line. Does a failed claim say that the function changed its behaviour?
3. All ten naive tests passed for the agent's pair. How many of the 92 grid cells did it get wrong, and which hazard classes do the failures belong to?
4. Which pair agrees on every cell, and what else must that pair pass before you call it equal?
5. A candidate with one wrong table entry has equal masked bytes and matching relocations. What check catches it?
6. Write the acceptance rule for a rebuilt function, in order.

:::answer Show the answer
:::say Short answer
The report is withdrawn and rewritten. The `percent_change` claims that passed say that Ghidra printed the same text for both builds, and the `total` claims that failed say that it printed different text; neither says anything about behaviour, and nothing in the `-O2` build is broken. The agent's two candidates are plausible: they compile, they pass the ten naive tests, and they fail 28 of the 92 grid cells. The accepted candidates are the multiply-first `percent_change` and the switch `grade`. They agree with the original on all 92 cells, their masked bytes equal the original's, their relocation records have the same shape, and the table they reference reads 1, 2, 3, 4, 4 on both sides.
:::

**Walkthrough**

1. **Read what the verifier compares.** The verification record has `status: "fail"` with two passed and two failed structural claims. The first claim, `percent-change-assembly`, reads `pass` with an observed status of `unchanged`. A structural claim takes its status from one dimension of one `compare_functions` record, and that dimension is a line diff of the text that Ghidra printed. So a pass says that the two assembly texts matched line for line, and nothing more. The record's own limitation says that a pass is no proof that the whole implementation is equivalent.
2. **Read the failed claim.** `total-assembly` reads `fail` with an observed status of `changed`. The `-O2` build of `total` has different Ghidra text from the `-O1` build, because the optimizer unrolled the loop. The manual counts 62 instructions where `-O1` had 13. One source line, two texts. A failed text claim does not say that behaviour changed, and the agent's sentence about a broken `total` has no support.
3. **Read what the harness does.** The harness notes describe two legs. Leg one compiles the original source and each candidate into one program and runs both over 92 cells. Leg two compiles each candidate for the original target and compares it with the original object after relocation masking. rea 6.7.0 has neither leg; this is the part that the agent had to run and did not.
4. **Read the agent's pair on the grid.** The plausible pair is the `long` rebuild of `percent_change` with the threshold rebuild of `grade`. `naive_passed` is true and the mismatch list starts at once: at `before` 3 and `after` 2147483647 the original returns -133 and the candidate returns -1431655899. The manual's count over the file is 28 of the 92 cells, 26 of them overflow cells of `percent_change` where the original wraps the product to 32 bits before it divides and the `long` rebuild does not.
5. **Read the two grade cells.** The threshold rebuild returns 4 for a score of 110 and for `INT_MAX`, where the original switch has no case and returns 0. The hazard class is "beyond the switch". Ten naive tests never reached either hazard, which is why they all passed.
6. **Read the equal pair.** The pair that multiplies first and keeps the switch has an empty mismatch list and an empty oracle disagreement list on the same 92 cells. That is leg one passed. It is still not a proof of equal bytes.
7. **Read leg two on the wrong constant.** The candidate `grade_case10_wrong` has 46 code bytes equal to the original after masking, one relocation of the same offset, type and section, and the status `fail`. Its table reads 1, 2, 3, 4, 3 against the original's 1, 2, 3, 4, 4. Only the read through the relocation catches it. A rebuild can pass a text claim, pass the masked byte compare, and still compute a different grade.

**Resolution**

The report is withdrawn and rewritten. The `percent_change` claims that passed say that Ghidra printed the same text for both builds, and the `total` claims that failed say that it printed different text; neither says anything about behaviour, and nothing in the `-O2` build is broken. The agent's two candidates are plausible: they compile, they pass the ten naive tests, and they fail 28 of the 92 grid cells. The accepted candidates are the multiply-first `percent_change` and the switch `grade`. They agree with the original on all 92 cells, their masked bytes equal the original's, their relocation records have the same shape, and the table they reference reads 1, 2, 3, 4, 4 on both sides.

The acceptance rule the team writes down has four steps, and nothing weaker than a pass at any step adds up to a pass: the structural claims pass in rea, leg one agrees on every grid cell on a named host, leg two matches the masked bytes and the relocation records, and the bytes that each relocation points at are read and compared. The host and the compiler are recorded with the proof, because the trap cell returns a value on this arm64 host and traps on x86-64.

**Wrong turns**

- "verify_reconstruction passed for percent_change, so the rebuild is verified." The claims compared two Ghidra texts of two builds of the original. They never saw the rebuild, and a pass means same text.
- "The total claims failed, so the compiler changed what total computes." Different text from one source line. The failure says the texts differ and stops there.
- "Ten tests pass, including a zero divisor and a negative score, so the rebuild is right." None of the ten reaches an overflow cell or a score beyond the last case. The grid has 92 cells for that reason.
- "The masked bytes are equal and the relocation matches, so skip the table read." That is the one check that fails the wrong-constant candidate. Read the bytes each relocation points at.

**Generalize**

A verifier can only grade the claims it was built to grade, and its pass carries the limitation it prints. Before you accept a verdict, ask what was compared and against what, and whether the artifact you care about was ever an input. For a rebuilt function, equality is a chain of checks, each one catching a defect the one before lets through: text, behaviour over a grid that reaches every hazard the listing shows, masked bytes, and the data those bytes point at. Tests that pass without reaching a hazard measure nothing about it.

:::

## An eval that stopped the run before step 0

*Level 4 · incident · about 30 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

An RL team wants an accuracy score on a held-out math set during its long GRPO runs. Before they touch the long run, they do the right thing and add the eval flags to a 2-step smoke test, with the interval set to every step. The job stops before it finishes step 0, with a Ray task error from the eval task after thousands of HTTP 503 lines. They run it again. It stops the same way.

In the review, one engineer says the rollout engine died, as in the dead-engine incident, and wants the watchdog tuned. Another says the test set is too large for one GPU. The lead asks for a design that puts an eval score next to each step of the long run without this risk, and asks what the two failed tries prove and what they do not.

**Evidence: two tries of eval on the training engines, both before step 0**

```text
title: two tries of eval on the training engines, both before step 0
source: manuals/miles-101/capture/gpu/out-gb10/tracker-eval-checks.txt
lines: 12-17
lang: text
note: Read the step count, the count of 503 lines, and the exception that ended each job.
---
## eval-check: --eval-interval 1 --eval-prompt-data gsm8k_test test.parquet, steps 0, 503 lines 5311
ray.exceptions.RayTaskError: ray::RolloutExecutor.eval() (pid=2511, ip=172.17.0.3, actor_id=30ef216341789a5b8b87b1890200
    raise HTTPStatusError(message, request=request, response=self)
## eval-check2: --eval-interval 1 --eval-prompt-data gsm8k_test test.parquet, steps 0, 503 lines 4339
ray.exceptions.RayTaskError: ray::RolloutExecutor.eval() (pid=2514, ip=172.17.0.3, actor_id=4372e0e5a72e9357095709160200
    raise HTTPStatusError(message, request=request, response=self)

```

**Evidence: two 2-step runs of the same day without eval, which reached step 0 and step 1**

```text
title: two 2-step runs of the same day without eval, which reached step 0 and step 1
source: manuals/miles-101/capture/gpu/out-gb10/tracker-eval-checks.txt
lines: 5-11
lang: text
note: The tracker checks used the same recipe and the same machine, with no eval flags.
---
## wandb with --wandb-group plain (wandb-check.log): step 0: step 1: 
W&B offline mode enabled. Data will be saved locally.
debug-internal.log debug.log latest-run offline-run-20261023_034138-mu59u570 offline-run-20261023_034200-mu59u570 offline-run-20261023_034203-mu59u570 
## tensorboard (tb-check.log): step 0: step 1: 
Saving tensorboard log to /root/lab/runs/plain/tb.
events.out.tfevents.1792727435.c56e30506501.2042.0
events.out.tfevents.1792727457.c56e30506501.2515.0

```

**Evidence: the flags that run eval on the training engines**

```text
title: the flags that run eval on the training engines
source: manuals/miles-101/sections/6-2-run-a-separate-eval-fleet.md
lines: 26-26
lang: text
note: The interval counts steps and the data is the test split that the launcher downloads.
---
-e MILES_EXTRA_ARGS="--eval-interval 10 --eval-prompt-data gsm8k_test /root/lab/datasets/gsm8k/test.parquet"

```

**Evidence: how eval on the training engines works, and what happened on the GB10**

```text
title: how eval on the training engines works, and what happened on the GB10
source: manuals/miles-101/sections/6-2-run-a-separate-eval-fleet.md
lines: 31-33
lang: text
note: The second paragraph is the manual's own record of this failure.
---
Rollout stops while the eval runs, and requests that are already running finish first. The engines already hold the current weights, so no extra weight transfer happens. Use this mode on one GPU, and for small eval sets.

This command did not work on our GB10. We ran it twice on a 2-step run with `--eval-interval 1`. Both times the first eval sent the 1,319 test questions, the router answered with `503 Service Unavailable`, and the job stopped before step 0. We did not find the cause. Test the eval on a 2-step run before you add it to a long run.

```

**Evidence: the three places where eval can run, and the limits of the fleet**

```text
title: the three places where eval can run, and the limits of the fleet
source: manuals/miles-101/sections/6-2-run-a-separate-eval-fleet.md
lines: 13-19
lang: text
note: Read the cost column, then the two limits after the table.
---
| Where | How to select it | Cost |
|---|---|---|
| The training engines | the default | rollout production stops while the eval runs |
| A dedicated fleet | `--eval-num-gpus N` | N GPUs of the job go to eval, and training never stops for it |
| Your own service | `--eval-function-path` set to a checkpoint eval function | only the checkpoint export |

You cannot select the fleet together with a checkpoint eval function for your own service. Rollout fault tolerance from [section 6.3](#s-survive-failures) also does not work with a fleet.

```

**Evidence: what the router is and what a 503 from it means**

```text
title: what the router is and what a 503 from it means
source: manuals/miles-101/sections/1-2-add-a-watchdog.md
lines: 40-42
lang: text
note: Two definitions from the watchdog page.
---
**Router:** the small service that forwards each rollout request to an engine. [Section 8.6](#s-which-router-to-use) explains it.

**503 Service Unavailable:** the HTTP status that the router returns when no rollout engine can take the request.

```

**Questions**

1. Compare this failure with a run whose engine died. Which component raised, which component retried, and why did this job stop while that one hung for an hour?
2. The same recipe ran twice that day without the eval flags. What do those two runs rule out?
3. Name what the two failed tries prove about the router and the eval client, and name the one thing they do not prove.
4. Which component in this layout answered 503, and why does the count of those lines not tell you the cause?
5. Lay out the three places eval can run, with the cost and the limit of each, and pick one for a long run on this machine.
6. Write the gate that every eval configuration passes before it joins a long run, and the signal that proves it passed.

:::answer Show the answer
:::say Short answer
The two tries prove that eval on the training engines fails on this machine at the first eval, loudly and before step 0, and that the cause is open. The team should not add that mode to a long run, and the smoke test did its job by failing first. For the long run on one GB10, run eval through a checkpoint eval function with `--eval-function-path`, which costs only the checkpoint export and keeps the training engines out of the eval. When a second GPU is available, use a dedicated fleet with `--eval-num-gpus 1`, give its engines their own memory share with `--eval-sglang-mem-fraction-static 0.9`, read `eval/lag_steps`, and accept that rollout fault tolerance is off with that layout.
:::

**Walkthrough**

1. **Read the two tries.** Both ran the 2-step recipe with `--eval-interval 1` and the GSM8K test file. Both finished zero steps. The first wrote 5311 lines of `503 Service Unavailable`, the second 4339, and each ended with `ray.exceptions.RayTaskError` raised inside `RolloutExecutor.eval()`, from an `HTTPStatusError`. The eval client raised on the status code. This job did not hang, it failed and stopped. In the run whose engine died, the training rollout path retried the same status for 63 minutes and never raised. Two paths, two behaviors on one status code.
2. **Read the runs without eval.** The tracker checks of the same day ran the same 2-step recipe, on the same image and machine, and logged `step 0` and `step 1`. They differ from the failed tries only in the eval flags. So the recipe, the engine start and the trainer were healthy that day. The eval flags are the change that broke the job.
3. **Read what the eval sends.** The documented command sets the interval in steps and names the test split that the launcher downloads. With the interval at 1, the first eval ran at once, and the manual's record says that it sent the 1,319 test questions and that the router answered 503 to them. That is the whole burst: one eval of 1,319 prompts, many of them refused, counted as 5311 and 4339 error lines.
4. **Separate what is proven from what is not.** The router is the small service that forwards each rollout request to an engine, and 503 is what it returns when no engine can take the request. So the evidence proves that, at the moment of the eval, the router had no engine that would take those requests, and that the eval client treats that status as fatal. It does not prove why the engine was not available at that moment. The manual ran this twice and did not find the cause. A design that depends on the cause being known is not available.
5. **Read the three places.** On the training engines, the default, rollout production stops while the eval runs, the engines already hold the current weights, and on this machine the path failed twice. On a dedicated fleet, `--eval-num-gpus N` takes N GPUs of the job for eval and training never stops for it, with `eval/lag_steps` telling how late each score arrives, but the fleet cannot be combined with a checkpoint eval function and rollout fault tolerance does not work with it. Through your own service, `--eval-function-path` runs a checkpoint eval function, and the cost is only the checkpoint export.
6. **Place the two proposals.** The watchdog guards a run that never stops. This job stopped by itself, so a watchdog finds no container and exits. The size of the test set is a guess with no measurement behind it, because the manual did not isolate the cause, and the only way to test the guess is the same 2-step smoke test with a smaller set.

**Resolution**

The two tries prove that eval on the training engines fails on this machine at the first eval, loudly and before step 0, and that the cause is open. The team should not add that mode to a long run, and the smoke test did its job by failing first. For the long run on one GB10, run eval through a checkpoint eval function with `--eval-function-path`, which costs only the checkpoint export and keeps the training engines out of the eval. When a second GPU is available, use a dedicated fleet with `--eval-num-gpus 1`, give its engines their own memory share with `--eval-sglang-mem-fraction-static 0.9`, read `eval/lag_steps`, and accept that rollout fault tolerance is off with that layout.

The gate stays: each new eval setting runs on the 2-step recipe first, with the interval at 1, and passes only when the log shows `step 0`, `step 1` and an eval score, with no `RayTaskError`. Keep the watchdog for the engine-death case, which is a different failure with a different signature.

**Wrong turns**

- "The engine died, tune the watchdog." The job raised and stopped within its first step. The watchdog exists for the opposite case, a job that keeps sending requests to a dead engine and never fails.
- "Cut the test set to a few hundred questions and start the long run." The cause is not known, so a smaller set is a guess. Test it on the 2-step recipe, and only a pass earns a place in the long run.
- "Set the interval to 10 so that eval runs less often." The failure happened at the first eval. A longer interval moves the first eval later into a long run, where the same stop costs the work of every step before it.
- "Use the fleet together with rollout fault tolerance." Rollout fault tolerance does not work with a dedicated fleet in this version. Pick one.
- "Eval on the training engines is free, because they already hold the weights." It stops rollout production for the whole eval, and on this machine it stopped the job.

**Generalize**

A smoke test that fails is a result, not a delay. Record what the failure proves and what it leaves open, and design around the open part instead of guessing at it. When one dependency answers the same error to two clients, know how each client treats it, because a retry turns an outage into a hang and a raise turns it into a fast stop. Keep the work that must not stop, here training, on different engines from the work that may fail, here eval, and let every new configuration earn its place through the same short test.

:::

## An exit code of zero that was not a pass

*Level 4 · incident · about 30 minutes · version: rea 6.7.0 at 27dc42d with the Ghidra provider; model: no model; the fixtures are the ledger binaries built at -O1 and -O2; hardware: one aarch64 Mac*

A team keeps Evidence bundles of a shipped binary in version control. A nightly job analyses the current build with rea, exports a bundle, runs `rea compare` against the bundle of the night before, and posts "no change" to the team channel when the command exits 0. It has posted "no change" every night for three weeks. Then a release went out with a different optimization level, and the job still posted "no change". A reviewer opened the two bundles by hand and found that not one record was shared between them.

Two more things went wrong in the same week. The job also keeps a digest of each bundle file to detect edits, and a colleague's export of the same records produced a different digest. And after the upgrade from the 6.5.0 release, an archived bundle that nobody had touched was refused at import. You are asked to say what the job measured for three weeks and to redesign it.

**Evidence: the import and compare commands with their exit codes**

```text
title: the import and compare commands with their exit codes
source: manuals/reverse-engineering-101/capture/out/00-commands.txt
lines: 55-62
lang: console
note: Two imports and one compare. Only the import of the old bundle exits 1.
---
$ rea evidence-import out/11-bundle-O1.json --format json
[exit 0] (0.6 s) -> 13-evidence-import.json

$ rea evidence-import fixtures/bundle-rea-6.5.0-O1.json --format json
[exit 1] (0.6 s) -> 13-evidence-import-rea-6.5.0.json

$ rea compare out/11-bundle-O1.json out/11-bundle-O2.json --format json
[exit 0] (0.6 s) -> 14-compare-bundles.json

```

**Evidence: the head of the compare result**

```text
title: the head of the compare result
source: manuals/reverse-engineering-101/capture/out/14-compare-bundles.json
lines: 1-16
lang: json
note: Read status first, then the unresolved count against the four records_ counters.
---
{
  "status": "unknown",
  "left_bundle_sha256": "47160c2de738f54a9f9e496d0552b290f34c789ea63523c985c33787d9d30be9",
  "right_bundle_sha256": "e0a9fe04ebbcaf90eda63c731d9cf9c13b59c41eb8b1995a0204d8015d44fe20",
  "summary": {
    "records_unchanged": 0,
    "records_added": 0,
    "records_removed": 0,
    "records_changed": 0,
    "unknowns_unchanged": 0,
    "unknowns_added": 0,
    "unknowns_removed": 0,
    "unknowns_advanced": 0,
    "unknowns_diverged": 0,
    "unresolved": 10
  },

```

**Evidence: the first of the ten changes**

```text
title: the first of the ten changes
source: manuals/reverse-engineering-101/capture/out/14-compare-bundles.json
lines: 17-32
lang: json
note: One side has the record and the other side has nothing, and the limitation says why that is not a removal.
---
  "changes": [
    {
      "entity": "evidence",
      "key": "ev_142cc943d8259d42ce5d62ad5eb0417fcde4de4ee9a20afbfe1fdbc51ed3d259",
      "classification": "unknown",
      "conclusion_kind": "unresolved_branch",
      "left_evidence_ids": [],
      "right_evidence_ids": [
        "ev_142cc943d8259d42ce5d62ad5eb0417fcde4de4ee9a20afbfe1fdbc51ed3d259"
      ],
      "left_digest": null,
      "right_digest": "142cc943d8259d42ce5d62ad5eb0417fcde4de4ee9a20afbfe1fdbc51ed3d259",
      "limitations": [
        "EvidenceBundle has no inventory completeness marker; one-sided membership may reflect incomplete capture."
      ]
    },

```

**Evidence: the limitation at the end of the result**

```text
title: the limitation at the end of the result
source: manuals/reverse-engineering-101/capture/out/14-compare-bundles.json
lines: 169-171
lang: json
note: One sentence that applies to the whole comparison.
---
  "limitations": [
    "EvidenceBundle has no inventory completeness marker; one-sided membership remains unknown."
  ]

```

**Evidence: the MCP export and the CLI export of the same records**

```text
title: the MCP export and the CLI export of bundle O1
source: manuals/reverse-engineering-101/capture/out/12-evidence-export.txt
lang: text
note: Different digests and byte counts, the same JSON content.
---
94fca3db18f93cfbc1c2d11a3d26b9e46fd19dec677b06976199d6981a477247  178398  export_evidence_bundle over MCP, out/11-bundle-O1.json
47160c2de738f54a9f9e496d0552b290f34c789ea63523c985c33787d9d30be9  178397  evidence-export over the CLI, $WORK/canonical-O1.json
same bytes as the MCP export: no
same JSON content as the MCP export: yes

```

**Evidence: the import counts of the bundle that this release wrote**

```text
title: rea evidence-import on the bundle that 6.7.0 wrote
source: manuals/reverse-engineering-101/capture/out/13-evidence-import.json
lang: json
note: The counts of a bundle that validates.
---
{
  "imported": 8,
  "unknowns_added": 0,
  "total": 8
}

```

**Evidence: the import of the bundle that the old release wrote**

```text
title: rea evidence-import on the bundle that 6.5.0 wrote
source: manuals/reverse-engineering-101/capture/out/13-evidence-import-rea-6.5.0.json
lines: 1-6
lang: json
note: Read the code, the path in the message, and the retryable flag.
---
{
  "error": "Analysis failed",
  "code": "evidence_integrity_mismatch",
  "category": "integrity_mismatch",
  "message": "Evidence bundle does not match the bundle schema at records.3.evidence_id: Evidence semantic identifier does not match its record. Supply an unmodified bundle written by export_evidence_bundle or rea evidence-export.",
  "retryable": false,

```

**Questions**

1. The compare command exited 0 on two bundles with no record in common. What did the job read, and what should it have read?
2. Every change is classified `unknown` with the kind `unresolved_branch`, and `records_removed` is 0. Why does rea not call a record that is on one side only a removal?
3. Two exports of the same eight records have different digests and byte counts. Which digest belongs in the archive, and how do you check that two files hold the same evidence?
4. The old bundle was refused with `retryable: false`. Which record failed, why that one, and what does the team do with evidence it saved under the old release?
5. Write the aggregation rule for the nightly job, and say which tool answers the question it was trying to ask.

:::answer Show the answer
:::say Short answer
For three weeks the job measured whether `rea compare` could start. It never read the status. The redesign reads the JSON and applies one rule: a result with status `unknown`, or with `unresolved` above 0, is not a pass, and the message names the count. A `pass` requires status `unchanged` with every record classified. The job compares bundles of one build only. When the build changes, it opens both builds and calls `compare_functions` for each function of interest, and it reads the eight dimensions of each record, as the manual shows for `_percent_change` and `_total`.
:::

**Walkthrough**

1. **Read the exit codes against the results.** The command record shows `rea compare` with exit 0. The import of the current bundle also exits 0. Only the import of the old bundle exits 1. A zero exit from `rea compare` means that the comparison ran, not that it found two equal sets. The job treated the process status as the verdict and never parsed the output.
2. **Read the status and the summary.** The result says `status: "unknown"`. Every `records_` counter is 0, and `unresolved` is 10. So the two bundles share no record, nothing was classified as unchanged, and nothing was classified as changed either. The job's "no change" message described a comparison that compared nothing.
3. **Read one change.** The first change has a right-side id and an empty left side. Its classification is `unknown` and its conclusion kind is `unresolved_branch`. The limitation on the change says that a bundle has no inventory completeness marker, so one-sided membership may reflect incomplete capture. rea cannot tell a record that was removed from a record that was never captured on that side, because the bundle format does not say whether a capture was complete.
4. **Read the closing limitation.** The same sentence closes the whole result: one-sided membership remains unknown. The two bundles were made from two builds. No `evidence_id` can match across them, because the id is a hash of the record's semantic content and the content describes a different file. `rea compare` answers "what changed in this evidence set" for two bundles of one build. For two builds the question goes to `compare_functions`, one function at a time.
5. **Read the two exports.** The MCP export and the CLI export hold the same JSON content and different bytes: 178398 against 178397 bytes. The one byte is the newline that the capture kit added to its copy. The canonical digest is the one from `rea evidence-export`, and the compare result names that digest as its left bundle digest. A job that compares file digests must canonicalize both files first, or compare the JSON content.
6. **Read the two imports.** The import of the current bundle reports 8 imported of 8. The import of the old bundle stops with `evidence_integrity_mismatch` at `records.3.evidence_id` and `retryable: false`. The bytes are the bytes that the old release wrote. The hash rule changed: the current release includes a `null` `relationship_coverage` in the identity of a record, and the old release left it out. Records 0 to 2 are dossiers with a coverage object, so their ids still verify. Record 3 is the first record without coverage, so it is the first id that fails.

**Resolution**

For three weeks the job measured whether `rea compare` could start. It never read the status. The redesign reads the JSON and applies one rule: a result with status `unknown`, or with `unresolved` above 0, is not a pass, and the message names the count. A `pass` requires status `unchanged` with every record classified. The job compares bundles of one build only. When the build changes, it opens both builds and calls `compare_functions` for each function of interest, and it reads the eight dimensions of each record, as the manual shows for `_percent_change` and `_total`.

The archive stores the canonical digest from `rea evidence-export` next to each bundle, and the rea version that wrote it. The team does not migrate saved evidence. For the old bundles it keeps the old release available to read them, and it regenerates the evidence it still needs with the current release. The first nightly run after the change posted a result with `unresolved: 10` and a red mark, which is what the two builds deserved.

**Wrong turns**

- "Exit 0 means the comparison passed." The exit code says that the command completed. The verdict is in `status`, and here it was `unknown`.
- "Ten unresolved records on the right and none on the left means ten records were added." A bundle carries no completeness marker, so rea cannot say whether the left side was captured completely. It says unknown, and so must you.
- "Fix the old bundle by recomputing the ids and importing it." The refusal is not retryable, and rea does not migrate evidence. An id you compute yourself is no longer evidence that the tool wrote.
- "Compare the file digests to detect a change." Two valid exports of the same records differed by one trailing newline. Compare canonical digests or JSON content.

**Generalize**

A tool that can say "I do not know" needs a reader that can hear it. Any pipeline that turns a result into a pass or fail must read the field that carries the verdict and treat every value other than pass as not a pass, including unknown, unresolved and skipped. Record the version of the tool next to every artifact it wrote, because the identity rules of a format can change between releases, and compare canonical forms, never raw files.

:::

## Three reboots in one day under RL load

*Level 4 · incident · about 30 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory, a desktop machine under a 48-step RL run*

A research team runs a 48-step GRPO run of `Qwen/Qwen3-0.6B` on a desktop machine with one GB10. On 2026-10-18 the machine reboots three times. The run dies with it each time, and so does every other job on the machine. The boot list shows that the three boots lasted 13, 26 and 74 minutes. The journal has no panic, no out-of-memory kill and no error line before any of the three ends. The team wants a cause and a fix before they start the next two seeds.

Two proposals are on the table. One says the engine ran out of memory and asks for a lower engine memory fraction. The other says the machine is unfit for RL and asks for a cloud GPU. You have the boot list, a guard script that someone wrote that morning, its log, and the lab notes of the manual.

**Evidence: the boot list of the machine, read four days later**

```text
title: the boot list of the machine, read four days later
source: manuals/sglang-101/capture/gpu/incidents/gb10-boot-list.txt
lang: text
note: Three boots on 2026-10-18 lasted 13, 26 and 74 minutes, and the journal gives no cause.
---
# journalctl --list-boots on the GB10, read 2026-10-22. Three boots on 2026-10-18 lasted 13, 26 and 74 minutes.
IDX BOOT ID                          FIRST ENTRY                 LAST ENTRY
 -6 37d114f713034658b77dbb219004882d Fri 2026-10-16 12:20:36 UTC Fri 2026-10-16 20:14:58 UTC
 -5 2406b0467522428e859d75cddc5ab54c Sat 2026-10-17 11:58:30 UTC Sun 2026-10-18 00:13:33 UTC
 -4 d460e0a1769440de9b798da3e3595685 Sun 2026-10-18 04:22:25 UTC Sun 2026-10-18 04:35:45 UTC
 -3 2373b2f75dbc48269cbaa62c102008c5 Sun 2026-10-18 04:44:35 UTC Sun 2026-10-18 05:10:40 UTC
 -2 b71237eb24d84d388b9357ddb11fec34 Sun 2026-10-18 07:52:29 UTC Sun 2026-10-18 09:06:59 UTC
 -1 886af3f20eae4d84b10df2a5dece2515 Sun 2026-10-18 10:44:09 UTC Mon 2026-10-19 03:00:28 UTC
  0 d2288065e469494c947249c6a7743714 Wed 2026-10-21 06:14:36 UTC Thu 2026-10-22 07:18:46 UTC

```

**Evidence: what the manual records about the load of that day and the guard**

```text
title: what the manual records about the load of that day and the guard
source: manuals/sglang-101/sections/7-2-sglang-as-an-rl-rollout-engine.md
lines: 172-174
lang: text
note: Read the share of time the container spent paused, and which numbers the authors still trust.
---
We ran the same 48 steps twice more, with `MILES_SEED=2` and `MILES_SEED=3`. The variable sets the train seed and the rollout seed. The GB10 shut down three times under this load on 2026-10-18, and its boot list shows three short boots that day. So these runs had a guard. A script paused the container when the GPU reached 84 C, or 80 C in the first 30 minutes. It resumed the container after about 45 to 60 seconds, at 72 C or below.

Over the 9.3 hours of seeds 2 and 3, the container was paused for about 58 percent of the time. A pause stops the process and does not change its arithmetic. So we read the reward, the lengths, the cut share, and the log-probability gap as valid. We did not test this with a paused and an unpaused run of the same seed. The rollout times are not, and we do not report them for seeds 2 and 3.

```

**Evidence: the loop of the heat guard**

```text
title: the loop of the heat guard
source: manuals/miles-101/capture/gpu/heat-guard.sh
lines: 14-28
lang: bash
note: Read the two thresholds, the two timers and which container it pauses.
---
while [ ! -f "$DONE" ]; do
  t=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | head -1)
  if [ "$paused" = 1 ]; then
    if found=$(docker ps -q --filter "id=$pc"); then
      if [ -z "$found" ]; then paused=0
      elif { [ "$t" -le 74 ] && [ $(( $(date +%s) - since )) -ge 45 ]; } || [ $(( $(date +%s) - since )) -ge 120 ]; then docker unpause "$pc" >/dev/null && paused=0 && echo "$(date -u +%FT%TZ) resume at ${t}C after $(( $(date +%s) - since )) s" >> "$L"
      fi
    fi
  else
    c=$(docker ps -q --filter ancestor=radixark/miles:latest --filter status=running | head -1)
    if [ -n "$c" ] && [ "$t" -ge 84 ]; then docker pause "$c" >/dev/null && pc=$c && paused=1 && since=$(date +%s) && echo "$(date -u +%FT%TZ) pause at ${t}C" >> "$L"
    fi
  fi
  sleep 5
done

```

**Evidence: the first pauses and the rule change**

```text
title: the first pauses and the rule change
source: manuals/miles-101/capture/gpu/out-gb10/thermostat.log
lines: 1-12
lang: text
note: The limits were 80 C and 68 C first, and changed to 84 C and 74 C that morning.
---
2026-10-18T10:57:59Z pause at 80C
2026-10-18T10:58:14Z resume at 68C
2026-10-18T10:59:05Z pause at 81C
2026-10-18T10:59:38Z pause at 80C
2026-10-18T11:00:38Z resume at 65C after 60 s
2026-10-18T11:01:39Z pause at 80C
2026-10-18T11:25:29Z resume by hand after rule change
2026-10-18T11:25:34Z pause at 81C
2026-10-18T11:26:35Z resume at 70C after 61 s
2026-10-18T11:26:50Z pause at 80C
2026-10-18T11:27:45Z resume by hand after rule change to 84/74
2026-10-18T11:28:16Z pause at 84C

```

**Evidence: the guard four days later**

```text
title: the guard four days later
source: manuals/miles-101/capture/gpu/out-gb10/thermostat.log
lines: 2010-2014
lang: text
note: Pause at 84 or 85 C, resume at 72 or 73 C after 45 s, over and over.
---
2026-10-22T15:49:33Z resume at 72C after 45 s
2026-10-22T15:50:14Z pause at 85C
2026-10-22T15:50:59Z resume at 73C after 45 s
2026-10-22T15:51:24Z pause at 84C
2026-10-22T15:52:10Z resume at 72C after 46 s

```

**Evidence: the heat guard and the pause count in the lab notes**

```text
title: the heat guard and the pause count in the lab notes
source: manuals/miles-101/sections/r-3-lab-notes.md
lines: 53-57
lang: text
note: Read the thresholds and the total number of pauses.
---
## The heat guard

The GB10 runs hot under sustained load, so a script pauses the Miles container when the GPU reaches 84 C. It resumes the container when the GPU is at 74 C or below after at least 45 seconds, or after 120 seconds at most. On its first day the limits were 80 C and 68 C, and they changed to 84 C and 74 C that morning. When the guard stops, it resumes a paused container first, so no run stays paused.

The pause log holds 1,005 pauses, each with its resume, up to 2026-10-22.

```

**Questions**

1. Read the boot list. What do the three short boots have in common, and what does the last boot of that day show?
2. The journal gives no cause. Name the candidate causes for a machine that stops without a log line, and say which ones the evidence rules out.
3. Read the guard loop. What does it watch, what does it do, and what are its two timers for?
4. The guard paused the container 1,005 times. What does that do to every measurement from those runs, and which numbers survive?
5. The chaos lesson asks for a safety plane with a kill switch and blast-radius limits. Where does this guard sit in that design, and what does it lack?
6. You must state the cause in the postmortem. What can you write, and what must you not write?

:::answer Show the answer
:::say Short answer
The cause is not recorded, and the postmortem says so. The mitigation is a guard that treats the machine's heat as a budget: pause the container at 84 C, resume at 74 C after at least 45 s, and never hold one pause longer than 120 s. With the guard on, the boot that began at 10:44 on 2026-10-18 ran until 03:00 the next day, the boot of 2026-10-21 ran into 2026-10-22 while the guard logged pauses through the afternoon, and the machine did not stop again across 1,005 pauses. The cost is measured too: 58 percent of the wall-clock time of seeds 2 and 3 was spent paused, so their rollout times are not reported, and every later timing follows the clean-step rule.
:::

**Walkthrough**

1. **Read the boots.** The boots of the two days before ran through the whole working day. On the day of the incident the machine came up at 04:22 and was gone within a quarter of an hour, came up at 04:44 and lasted half an hour, came up at 07:52 and lasted a bit over an hour. The boot that began at 10:44 ran until 03:00 the next morning, and the boot of 2026-10-21 ran into the next day. Every short boot ended without a shutdown record. The guard log begins at 10:57 on that same morning, inside the first boot that lasted.
2. **Rule out what you can.** Four causes stop a whole machine and can leave the journal silent: a kernel panic, a memory kill, a power event and a thermal shutdown. A panic leaves a trace in the journal, and there is none. A memory kill on this machine is a logged event that stops one process: Ray writes the node memory line and kills a worker, and the machine stays up, as the Ray out-of-memory scenario shows. That rules out the proposal to lower the memory fraction of the engine, because the symptom does not match. Power and heat remain, and the evidence cannot separate them directly, because nobody recorded the GPU temperature at the moment of any stop. What the evidence can show is what happened once the heat was held down.
3. **Read the guard.** Every 5 s the script reads the GPU temperature. When a Miles container is running and the temperature is at or above 84, it pauses the container and notes the time. While paused, it resumes when the temperature is at or below 74 and at least 45 s have passed, or after 120 s no matter what. If the container is gone, it forgets it, and on exit it resumes whatever it paused, so no run stays frozen. The two timers are a floor and a ceiling: the floor gives the GPU time to cool, and the ceiling bounds the cost of any one pause.
4. **Read the first hour.** The first rule was 80 and 68. The log shows a pause at 80 C and a resume at 68 C fifteen seconds later, then pause after pause within a minute. The team changed the rule by hand twice that morning, and from 11:27 it ran at 84 and 74. Four days later the pattern is steady: pause at 84 or 85 C, resume at 72 or 73 C after 45 s, about once a minute under load. The lab notes count 1,005 pauses up to 2026-10-22.
5. **Read what the pauses cost.** Over the 9.3 hours of seeds 2 and 3, the container was paused for about 58 percent of the time. A pause stops the process and does not change its arithmetic, so the manual reads the reward, the answer lengths, the share of cut answers and the log-probability gap as valid, and says that it did not test this with a paused and an unpaused run of the same seed. The rollout times are not valid, and the manual does not report them for those seeds. Every wall-clock number from a guarded run needs the clean-step rule of the lab notes: time only steps that overlap no pause, and compare step numbers.
6. **Place the guard in the safety plane.** The chaos lesson names a safety plane of kill switch, suppression windows, blast-radius limits and error-budget gates. The guard is a blast-radius limit on one container, with a resume-on-exit that acts as a kill switch for the guard itself. It lacks an alert, a temperature log of its own beyond the pause and resume lines, a bound on the total paused share of a run, and a test that the pause leaves results unchanged. It is a mitigation, not a diagnosis.
7. **Write the postmortem.** The honest statement is that the machine stopped three times under sustained RL load with no cause in the journal, that a guard which holds the GPU at or under 84 C was running during every later boot, and that no stop recurred under it. That is a correlation with a plausible mechanism. The sentence "thermal shutdown confirmed" needs a temperature reading across a stop or a hardware event log, and neither exists.

**Resolution**

The cause is not recorded, and the postmortem says so. The mitigation is a guard that treats the machine's heat as a budget: pause the container at 84 C, resume at 74 C after at least 45 s, and never hold one pause longer than 120 s. With the guard on, the boot that began at 10:44 on 2026-10-18 ran until 03:00 the next day, the boot of 2026-10-21 ran into 2026-10-22 while the guard logged pauses through the afternoon, and the machine did not stop again across 1,005 pauses. The cost is measured too: 58 percent of the wall-clock time of seeds 2 and 3 was spent paused, so their rollout times are not reported, and every later timing follows the clean-step rule.

The memory proposal is declined, because a memory kill is a logged event that stops a process and leaves the machine up. The cloud proposal is deferred, because the machine held for four days under the guard. The next steps are the ones that would turn the correlation into a cause: record the GPU temperature once a second to a file that survives a reboot, read the hardware event log after any stop, and run the same load once without the guard on a day when a stop costs nothing.

**Wrong turns**

- "Lower the engine memory fraction, it must be out of memory." A memory kill writes a line and stops a process, and the journal has none while the whole machine stopped. A lower fraction also shrinks the pool for every rollout.
- "The journal is empty, so it was power, call facilities." Not excluded, and worth a check. But the stops came under sustained load on one day and did not recur once the GPU was held at or under 84 C. Record the correlation and keep both candidates open.
- "Set the guard to 80 C to be safe." The first rule ran at 80 and 68, and the log shows a pause every minute. The team raised it to 84 and 74 that morning. A tighter limit buys more pauses, and every pause enters a step time.
- "Keep the guard and trust the step times." Seeds 2 and 3 spent 58 percent of their time paused. Time only steps that overlap no pause, and compare step numbers, as the lab notes do.
- "Call it a thermal shutdown in the postmortem." No temperature was recorded at the moment of any stop. Write what was seen: three stops without a cause, and no stop since the guard.

**Generalize**

When a machine stops without a log line, the honest postmortem names the candidates, the evidence that rules each one out, and the mitigation you applied with its cost. A guard that keeps a resource under a limit is a safety plane for one container: it buys uptime with wall-clock time, so the measurement rules change on the day you turn it on, and the postmortem says "did not recur under the guard", never "cause found".

:::
