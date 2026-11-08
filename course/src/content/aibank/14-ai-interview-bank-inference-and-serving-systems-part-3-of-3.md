---
track: aibank
title: "AI interview bank: Inference and serving systems (part 3 of 3)"
short: Inference and serving  3
sub: 5 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## When an FP8 checkpoint pays

*Level 3 (senior) · tradeoff · about 10 minutes*

Your Qwen/Qwen3-8B server in BF16 fits on one L4, but only with a small KV pool. The model's publisher also offers an FP8 checkpoint. When does the FP8 checkpoint pay, what does it do to speed, and what does our GSM8K check say about the cost?

:::answer Show the answer
:::say Short answer
FP8 weights store most parameters in 1 byte instead of 2, so they free memory that the engine gives to the KV pool, and on a GPU with FP8 math they also speed up the matrix work. On our clock-locked L4 with the pool held fixed, the FP8 checkpoint gave 284.7 against 208.8 output tokens per second at 32 users, 36 percent more, and cut the time per token by 30 percent. On 500 GSM8K questions it scored 90.6 percent against 91.8 in BF16, 1.2 points lower with overlapping intervals, so the run did not show a loss and cannot rule out a few points.
:::

**Full answer**

**Serve it**

Serve the published checkpoint like any model, `Qwen/Qwen3-8B-FP8`, and set no flag. vLLM reads the quantization method from the checkpoint config. SGLang does the same, and a `--quantization` flag that does not match the checkpoint raises at startup, except for a few known compatible pairs. If no FP8 checkpoint exists, vLLM can quantize a BF16 model when it loads; the manual did not test that path.

**Know what your GPU runs**

The L4 is an Ada GPU, SM 8.9, and it has FP8 math, so the matrix math runs in FP8 and the speed can rise with the free memory. GPUs before Ada, such as the A100, have no FP8 math. There vLLM keeps the weights in FP8 and runs a weight-only kernel: you keep the memory saving and expect less speed gain. The manual did not test such a GPU.

**The L4 result**

The session locked at 900 MHz, two seeds each, the pool held at 24,096 tokens in both runs:

| Users | Median TPOT, BF16 / FP8 | Output tok/s, BF16 / FP8 | Median SM clock, BF16 / FP8 |
|---|---|---|---|
| 32 | 119.9 / 83.8 ms | 208.8 / 284.7 | 881 / 900 MHz |
| 1 | not compared / 35.3 ms | not compared / 25.4 | 210 / 900 MHz |

At 32 users the seed ranges did not overlap for either number, and the BF16 clock was about 2 percent lower, much less than the gap. At one user the BF16 run fell to 210 MHz because the GPU throttled, so the two are not compared.

**What it frees**

The speed test held the pool fixed, so it did not measure the larger pool. The gain in room comes from the bytes. The SGLang runs on the same L4 let the pool grow and changed the weights and the cache together: the pool went from 24,094 tokens in BF16 to 142,369 with FP8 weights and an FP8 cache, 5.91 times as many, and output at 64 users went from 250.85 to 735.91 tokens per second, because the BF16 pool was full and the FP8 pool was not. At one user FP8 was still faster, 39.66 against 60.16 ms per token, because decode reads every weight for every token and FP8 weights are half the bytes.

On the GB10 with Qwen3-30B-A3B the FP8 pair did the same: the weights went from 57.75 to 29.75 GB, the load time from 323.61 to 152.29 s, and the pool from 227,243 to 1,083,008 tokens, 4.77 times as many, because the smaller weights freed memory and each token took half the bytes. Throughput was 1.73 to 1.88 times higher at every concurrency, because decode on that machine reads weights from a memory with modest bandwidth.

**The accuracy check**

The first 500 GSM8K questions, 8-shot and greedy, on the L4 on 2026-10-23:

| Engine | Config | Correct | Accuracy | Wilson 95 percent interval |
|---|---|---|---|---|
| vLLM | BF16 | 459/500 | 91.8% | 89.1 to 93.9 |
| vLLM | FP8 weights | 453/500 | 90.6% | 87.7 to 92.9 |
| vLLM | FP8 weights + FP8 KV | 453/500 | 90.6% | 87.7 to 92.9 |
| SGLang | BF16 | 458/500 | 91.6% | 88.8 to 93.7 |
| SGLang | FP8 weights | 456/500 | 91.2% | 88.4 to 93.4 |
| SGLang | FP8 weights + FP8 KV | 460/500 | 92.0% | 89.3 to 94.1 |

All intervals overlap. The run did not show a difference, and with 500 questions it cannot rule out a loss of a few points. It is one model and one benchmark. Run your own prompts on both checkpoints before production.

**When it does not pay**

- The pool has room and the GPU has no FP8 math: little gain for the risk.
- A task that depends on long chains of reasoning: run your own check first.
- The model still does not fit in FP8: a 4-bit checkpoint stores most weights in about half a byte, and on a 24 GB card that is the common way to serve a 14B model. A 4-bit model can lose more accuracy than FP8, and the loss depends on the model and the method.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The pool was held fixed in the speed test. What did that hide, and what did it show? Expected: it hid the larger pool that FP8 frees, so the test shows only the change in speed; the gain in room comes from the bytes, and the SGLang run that let the pool grow went from 24,094 to 142,369 tokens with an FP8 cache too.
- **Level 3:** Why was the one-user row not compared? Expected: the BF16 run fell to 210 MHz, below the 900 MHz lock, because the GPU throttled; a lock caps the clock and cannot stop a throttle, so the two runs were at different clocks.
- **Level 4:** On the GB10 the FP8 pair nearly doubled the speed at every load, while a field report of an FP8 cache alone was a little slower per token. Reconcile the two. Expected: the GB10 decodes from a memory with modest bandwidth, so half the weight bytes gave almost twice the speed; an FP8 cache alone changes no weight bytes and adds the scale work, so it wins on capacity and not on speed per token.

**Wrong answers, and why they fail**

- "FP8 always speeds up decode." Only on a GPU with FP8 math, such as Ada, Hopper and Blackwell; on an A100 vLLM keeps the weights in FP8 and runs a weight-only kernel, so you keep the memory saving and expect less speed gain.
- "Pass --quantization fp8 to be safe." vLLM reads the method from the checkpoint config, and in SGLang a flag that does not match the checkpoint raises at startup, so pass no flag for a published checkpoint.
- "A 1.2 point drop on GSM8K means FP8 loses accuracy." The two intervals overlap, so this run did not show a difference; it also cannot rule out a loss of a few points, which is why you run your own prompts on both checkpoints.
- "If FP8 is good, 4-bit is twice as good." A 4-bit model can lose more accuracy than an FP8 model, and the loss depends on the model and the method; use it when the model does not fit in FP8, such as a 14B model on a 24 GB card, and test it.

**Related lesson in this course:** [GPUs, memory and the systems foundation](#aiinfra-1)

:::

## When prefill-decode disaggregation pays

*Level 3 (senior) · design · about 12 minutes*

Your chat users see a smooth stream until someone pastes a long document, and then every stream pauses while the server prefills it. A colleague proposes prefill-decode disaggregation: separate prefill servers and decode servers. When does that split pay, what does it not do, and how would you decide?

:::answer Show the answer
:::say Short answer
Split prefill from decode when the measured problem is the tail of the inter-token latency and long prompts cause it, because a prefill server then never shares a step with a stream. It does not raise throughput: the documentation says so, it costs a KV transfer for every request plus more servers and a router, and a 2025 study found that even the tail gain depends on the load and on the path that moves the cache. Decide with a measurement: one server first, then copies behind a gateway, and the split last, compared with the same GPUs run as plain servers at your real load.
:::

**Full answer**

**What it solves and what it does not**

On one server a long prompt shares each step with the running streams, and every stream waits a little longer for its next token. Chunked prefill makes the pause shorter but cannot remove it. Two kinds of server remove it: a prefill server computes the prompt and builds its KV cache, and a decode server receives that cache and writes the answer.

The vLLM documentation says that disaggregated prefill does not raise throughput. It gives control over the first token and the stream as two separate numbers, and it controls the tail of the inter-token latency. Even that gain is a condition, not a default: the study that compared split servers with servers that run both stages found that it depends on the request load and on the path that moves the cache.

**How the cache moves**

In SGLang the gateway starts every exchange. It picks one prefill server and one decode server, adds the bootstrap host and port of the prefill server and a random 63-bit room number, and sends the same request to both. The decode server reserves KV slots and publishes their addresses. The prefill server runs a normal prefill and writes the KV pages straight into those slots, a one-sided RDMA write with the default transfer backend, or over TCP on a cluster without RDMA cards. The decode server sees the transfer finish and adds the request to its running batch. Every transfer moves through bootstrapping, waiting, transferring and success, and any stage can fail. The bootstrap port defaults to 8998, both timeouts to 300 seconds, and the transfer queue count to 4.

In vLLM each server gets a KV connector and a role, `kv_producer` or `kv_consumer`, and the common connector needs a library that the wheel does not install, pinned at 1.4.1. A router sends each request to the prefill server first, reads the transfer parameters from its response, and sends the request to the decode server with them. If a transfer fails, the default policy fails the request; `kv_load_failure_policy` set to `recompute` computes the prompt again on the decode server instead.

Never send a request straight to a role server. The scheduler asserts that a bootstrap room exists and tells you to use the router.

**The order to decide**

1. Measure TTFT and inter-token latency on one server with a benchmark that mixes long and short prompts.
2. Add data-parallel copies behind a gateway, and measure again.
3. Split only when the inter-token tail still rises when long prompts arrive, and compare the split with the same GPUs as plain servers at your real load.

**Size the two sides**

Long prompts with short answers need more prefill capacity. Short prompts with long answers need more decode capacity. One test on eight GPUs found that at high concurrency one prefill server for three decode servers won every metric, while at low concurrency three to one and two to two gave a better first token. It shows the direction, not your ratio. Measure the first token and the stream on each side and move one server at a time.

**What went wrong for other teams**

- A pair with one prefill and one decode server had a higher first token than one plain server with the same split of GPUs. An old transfer library was the cause, and an upgrade fixed it. Without the single-server baseline nobody would have known.
- At 64 concurrent requests one setup logged many bootstrap failures and `Aborted by AbortReq` on the prefill side, while 4 to 7 concurrent requests worked. The router's timeout for the prefill client was too short, and a later fix lengthened it. The rule: an abort means the client or the router aborted, so check timeouts before you suspect the transfer.
- With the overlap scheduler on, one deployment saw throughput rise about 10 percent and the first token get much worse, because the KV transfer waited for the next kernel launch; their fix was a flag that the manual could not find in the pinned version.

**What to watch after the split**

The bootstrap-failed and transfer-failed counters must stay flat. The transfer latency and speed gauges show the cost of each move. The decode pre-allocation and transfer queue gauges show requests that wait for memory or for a transfer. In every benchmark, read the retokenized output tokens before the throughput.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** On the same GPUs, the split pair's first token arrives later than the plain server's. What do you suspect first? Expected: the transfer path, an old transfer library or a router timeout; one incident fixed it with an upgrade, and only the single-server baseline showed that the split made it worse.
- **Level 3:** Prefill logs aborts at a load of 64 users and works at 4 to 7. Where is the fault? Expected: in the router or client timeouts, which aborted requests that were still running, not in the transfer; a later fix lengthened the router timeout.
- **Level 4:** How do you pick the ratio of prefill to decode servers? Expected: from your prompt and answer lengths and your concurrency; long prompts with short answers need more prefill and the reverse more decode; one test found one prefill for three decode servers won at high concurrency and three to one or two to two gave a better first token at low concurrency, so measure both sides and move one server at a time.

**Wrong answers, and why they fail**

- "Disaggregation raises throughput." The documentation says it does not; it gives control over the first token and the stream as two numbers and costs a KV transfer per request and more servers.
- "Send requests straight to the decode server to skip the router." The scheduler asserts that a bootstrap room exists and tells you to send requests to the router; the room is how the two servers find each other's half of one request.
- "A failed transfer falls back to a normal prefill." The vLLM default policy fails the request; set the failure policy to recompute if you want the decode server to compute the prompt again.
- "Chunked prefill already solves this." It makes the pause shorter but cannot remove it, because the chunk still shares the step with the running decodes; the split removes the sharing at the cost of a transfer and a second set of failures.

**Related lesson in this course:** [Parallelism and distributed inference](#aiinfra-5)

:::

## A split-server benchmark that counted empty answers

*Level 4 (staff) · code-reading · about 10 minutes*

A team split Qwen/Qwen3-8B into a prefill server and a decode server on two L4s over TCP, ran the open-loop benchmark through the router at 8 requests per second, and posted the result as a win: 751.85 tokens of output per second, against 728.61 for the single FP8 server at the same rate. Here are lines from the prefill log, the decode log and the benchmark summary. Read them and tell me what you see.

```text
… Decode batch, #running-req: 2, #token: 1206, token usage: 0.41, pre-allocated usage: 0.00, #prealloc-req: 19, #transfer-req: 0, #retracted-req: 0
… TCP lane queue-full rejection count: 4096
… Session 151.242.195.41:15367 failed.
Prefill transfer failed lines: 2902
Successful requests:                     240
Total generated tokens (retokenized):    0
Mean TTFT (ms):                          0.00
```

:::answer Show the answer
:::say Short answer
The run produced no text. Every request counted as a success through the router, but zero tokens came back when the client retokenized the output, and a mean first-token time of 0.00 ms is not a measurement. The decode log shows why: the decode copy could run only 2 requests while 19 waited for memory, prefill kept producing KV for them, the TCP transfer queue to decode filled and rejected 4096 times, the session failed, and 2902 later transfers failed with it, so the 751.85 figure is the speed at which the router returned empty answers.
:::

**Full answer**

**Read the lines in order**

1. `#running-req: 2` with `#prealloc-req: 19` at a token usage of 0.41. The decode side runs two requests and 19 more wait for decode memory. That pool is small: the decode server sat on the shared card with 2,925 tokens, against 24,094 on the prefill card.
2. `TCP lane queue-full rejection count: 4096`. Prefill kept producing KV caches for requests that decode could not take, and the transfer queue to decode filled.
3. `Session ... failed.` Three minutes into the sweep the transfer session died, and it did not come back.
4. `Prefill transfer failed lines: 2902`. Every later request failed its transfer.
5. `Successful requests: 240` with `Total generated tokens (retokenized): 0` and `Mean TTFT (ms): 0.00`. Each failed request still returned HTTP 200 through the router, with no text.

**Why the summary lied**

The client counts a success on the status code. The throughput line counts the tokens the client asked for, 128 per request with the end token ignored, not the tokens it received. Only two numbers gave the run away: the retokenized output tokens, which count what came back, and a first-token time of zero, which no real request can have. The manual did not publish the throughput figure, and its kit now refuses a run in which every request has a TTFT of 0.

**The swapped split**

The team then put decode on the card with the full pool of 24,094 tokens and prefill on the shared card with 2,925. From 1 to 8 users every request came back with text. At 16 users only 2,048 of 8,192 generated tokens came back as text. At 32 users every request came back empty, and the kit stopped the sweep. The original direction failed earlier: at 2 users only 512 of 2,048 generated tokens came back, and at 4 users none did. The manual's conclusion is that it has no measured result for the split under load on this pair of cards, and it does not claim one.

**The rule**

Check `Total generated tokens (retokenized)` against `Total generated tokens` in every disaggregated benchmark before you read its throughput, and look at the TTFT distribution for values that cannot be real. In production, watch the bootstrap-failed and transfer-failed counters, the transfer latency and speed, and the decode pre-allocation and transfer queue gauges.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which two numbers in such a summary must you read before the throughput? Expected: the retokenized output tokens against the generated tokens, and the TTFT distribution; a gap between the two token counts or a first token of zero means requests returned without text.
- **Level 4:** Why did the decode pool fill while prefill kept working? Expected: the decode copy sat on the shared card with a pool of 2,925 tokens, so it ran 2 requests and 19 waited for memory; prefill had 24,094 tokens and kept producing KV for them, so the transfer queue to decode filled and the session died.
- **Level 4:** The swapped split served text up to 8 users and lost it at 16 and 32. What does that say about the pair? Expected: the small side limits the pair whichever role it has; with prefill on the small card, 2,048 of 8,192 generated tokens came back at 16 users and none at 32, so there is no measured result for this pair under load, and the honest report says so.

**Wrong answers, and why they fail**

- "240 of 240 requests succeeded, so the system is healthy." The router returned HTTP 200 with no text for every failed request; zero retokenized tokens and a first token of 0.00 ms show that nothing was generated.
- "751.85 beats 728.61, so disaggregation won." The figure counts tokens the client asked for, not tokens it received; the manual did not publish it, and its kit now refuses a run in which every request has a TTFT of 0.
- "The TCP backend is the problem, so use RDMA." The queue filled because decode could not take the KV: it ran 2 requests with 19 waiting for memory on a pool of 2,925 tokens; a faster link does not add memory to the decode side.
- "Retries would have fixed the failed transfers." The session failed three minutes in and did not come back, so every later transfer failed; the fix is a decode pool that can hold the requests and a check that the output exists.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Design a chat service on a fleet of L4 cards

*Level 4 (staff) · design · about 15 minutes*

Design the serving layer for a chat product on a fleet of L4 cards with Qwen/Qwen3-8B. The target is a first token within 1 second and 100 ms or less per token for the P99 user. Every request shares a 2,048-token system prompt, and sessions run for several turns. How many users per card, which precision, which caps, and what do you measure before launch?

:::answer Show the answer
:::say Short answer
Size from the pool and the knee, not from throughput. In BF16 the 24,094-token pool on an L4 holds about 37 requests of 640 tokens, and with a cache reset the P99 gap between tokens at 16 users was already 522 ms, so a BF16 replica meets the target for well under 16 users; the FP8 checkpoint with an FP8 cache grows the pool to 142,369 tokens and served 2.87 requests per second within the same target at 64 users, where BF16 served none. So I would serve FP8 after an accuracy check on our prompts, put the shared system prompt first so that the cache holds it, keep the pool large enough for the sessions that return, cap users per replica at the measured knee in the gateway, and run the sweep with a flush, a clock record and a mixed length distribution before launch.
:::

**Full answer**

**Users per card**

The knee on an L4 in BF16 sits between 8 and 16 users once the prefix cache is reset before each run. With the reset, 50 percent of requests met the target at 8 users against 75 to 81 percent without it, and at 16 users the share fell from about 65 percent to 25 percent, with a P99 ITL of 522 ms against 82 to 84 ms unflushed. The median first token with the reset was about 650 ms at 4 users, 951 to 978 ms at 8, and 1,550 to 1,587 ms at 16. Under a fixed arrival rate, both precisions met the target for every request up to 1 request per second; BF16 held 0.88 requests per second within target at 2 offered and none from 4, while FP8 held 3.18 at 4 offered. So a BF16 replica carries a handful of chat users, and an FP8 replica several times more; the sweep decides the exact count.

**Precision**

On the same L4 the FP8 checkpoint with an FP8 cache changed the shape of the whole curve:

| Concurrency | BF16 output tok/s | FP8 output tok/s | BF16 median TTFT | FP8 median TTFT |
|---|---|---|---|---|
| 1 | 13.42 | 24.53 | 189.16 ms | 140.72 ms |
| 16 | 201.09 | 313.92 | 211.78 ms | 147.52 ms |
| 32 | 270.11 | 507.20 | 2,969.61 ms | 199.09 ms |
| 64 | 250.85 | 735.91 | 18,348.57 ms | 296.42 ms |

The pool explains it: 24,094 tokens against 142,369. At 64 users the BF16 server ran at most 38 requests at a token usage of 0.99 with 26 in the queue; the FP8 server ran all 64 at 0.29 with an empty queue. Goodput at the target was 0 for BF16 at 32 and 64 users and 2.87 requests per second for FP8 at 64. The accuracy check on 500 GSM8K questions gave overlapping intervals for every FP8 configuration, with a KV scale of 1.0 because this model has no scales; run the same check on your own prompts, and read the scale warning in the startup log.

**The shared prompt and the sessions that return**

Put the shared system prompt first and keep it byte-identical, with the tool list in a fixed order and nothing that changes per request before the user turn. The pool must then hold the working set. On the L4 with a 2,048-token prompt per group of users, the 24,094-token BF16 pool held about 11 such prompts: at 4 groups the median first token was 360 ms, at 16 groups the GPU-only server evicted prompts it needed again and the first token rose to 3,259 ms, and at 32 groups to 5,449 ms. A host tier held the evicted prompts and gave 553 ms at 16 groups and 817 at 32; at 64 groups the prompts needed more than the GPU and host pools together and the host tier only cut the wait to 3,610 ms from 6,821. With FP8 the pool holds far more prompts, so the first fix for the working set is the pool, and the host tier comes after.

Multi-turn sessions add the same problem over time. In an 8,192-token pool a trace of 24 sessions made the default eviction thrash: the hit rate fell to about 1.5 percent at turns 5 and 6, and a different policy only lifted it to 25 to 34 percent there. A 16,384-token pool reached 0.69 over the whole trace with every policy. Grow the pool before you change the policy, and route each session to the same replica so that its prefix is where it returns.

**Caps**

Enforce the knee in the gateway, not only in the engine. The engine admits until memory runs out, and a cap on the engine only chooses who waits: at 32 users on the L4 a cap of 16 moved the median first token from 1.8 to 12.3 s and cut output by 38 percent. Set the gateway limit one or two steps below the measured knee, and shed or queue above it. A second guard on the engine at the same count does no harm.

**Before launch**

1. Sweep concurrency with a flush and a new seed before every run, and record the cached tokens. The unflushed sweep put the knee between 16 and 32 users; the flushed one put it between 8 and 16.
2. Record the SM clock and the temperature of every run, cool the card between runs, and set aside runs under a clock floor. Under an open-loop overload the L4 fell from 1,320 to 465 MHz with 70 percent of samples in thermal slowdown, so overload costs throughput as well as latency.
3. Run your real length mix. Fixed lengths form waves and gave a median time to first token of 1,996 ms with a P99 ITL of 82 ms at 16 users; mixed lengths gave 291 ms and 300 ms. The two shapes measure two different servers.
4. Run a fixed arrival rate as well as the closed loop, because real users do not wait for each other.
5. Choose the limit from goodput at the target, and read the P99 ITL next to the first token.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why not take the user count from the throughput peak of the sweep? Expected: throughput peaked at 32 users while no request met the target there, and the knee with a reset was between 8 and 16 users; goodput at the target sets the limit and throughput only explains it.
- **Level 4:** The product adds long sessions that return after minutes. What changes? Expected: the working set grows past the GPU pool, the default eviction drops each session just before it returns, and the hit rate collapses, about 1.5 percent at later turns in an 8,192-token pool; grow the pool first, route each session to the same replica, and add a host tier only when the working set is larger than the GPU pool and smaller than the GPU and host pools together.
- **Level 4:** Traffic doubles for an hour. What protects the users? Expected: a limit at the gateway that sheds or queues above the knee, because the engine admits until memory runs out and a cap on the engine only moves the wait to the first token, and because a passively cooled L4 under overload also loses clock, from 1,320 to 465 MHz, so overload costs throughput as well as latency.

**Wrong answers, and why they fail**

- "Run 32 users per card; the sweep showed 275 tokens per second there." No request met the target at 32 users, where the P99 ITL was 613 ms; the knee with a cache reset was between 8 and 16 users.
- "Keep BF16, FP8 is a quality risk we cannot take." On 500 GSM8K questions every FP8 interval overlapped BF16, and FP8 was the difference between zero and 2.87 requests per second within target at 64 users; run the check on your prompts and decide on evidence.
- "Set the engine cap at the knee and you are done." The engine cap only chooses who waits and moved the first token to 12.3 s at 32 users; enforce the knee in the gateway and shed load above it.
- "Benchmark with fixed 512-token prompts, that is the standard." Fixed lengths form waves and gave a first token of 1,996 ms with a P99 ITL of 82 ms, while mixed lengths gave 291 and 300 ms; test your real length mix before you set the limit.

**Related lesson in this course:** [GPUs, memory and the systems foundation](#aiinfra-1)

:::

## Same throughput, two choices at a full pool

*Level 4 (staff) · tradeoff · about 12 minutes*

On one L4 with Qwen/Qwen3-8B and the same 24,096-token pool, a closed-loop sweep at 64 users gives vLLM 241 tokens of output per second and SGLang 257, so the engines tie on throughput. Yet the chat team says one of them is unusable at that load and the other is fine. What are they seeing, and which engine do you choose for chat?

:::answer Show the answer
:::say Short answer
They are seeing two different choices at a full pool. At 64 users vLLM ran 40 requests and kept 11 waiting with its pool 99.5 percent full, so its first token came 1.7 times sooner, 10,953 against 18,356 ms, but each new prefill shared the step with the running decodes and the P99 gap between tokens was 1,363 ms against 114 on SGLang, which ran 37 requests and kept 27 waiting. For chat, read the P99 ITL next to the first token at your real load and traffic shape, because the two engines pick different sides of that trade by default, and one flag on SGLang moved its side.
:::

**Full answer**

**Matched pools, matched clocks**

The manual made three choices so that only the engine differed. The vLLM server got `--num-gpu-blocks-override 1506`, 1,506 blocks of 16 tokens, which is 24,096 tokens, while SGLang sized 24,094 tokens for itself. Both ran in one session on one GPU, every run started at 72 C or below, and a run with a median SM clock under 1,000 MHz was set aside and repeated, up to three times. The vLLM server got `--max-model-len 8192`, which every request fits, and its sampler build problem was worked around; the benchmark is greedy, so the sampler does not change the output.

**The closed loop**

| Concurrency | Output tok/s, SGLang / vLLM | Median TTFT, SGLang / vLLM | P99 ITL, SGLang / vLLM | Median SM clock, SGLang / vLLM |
|---|---|---|---|---|
| 1 | 13.84 / 13.51 | 185 / 192 ms | 104 / 105 ms | 1,290 / 1,290 MHz |
| 8 | 112.46 / 112.79 | 170 / 253 ms | 71 / 68 ms | 1,485 / 1,470 MHz |
| 16 | 201.13 / 200.90 | 212 / 289 ms | 81 / 80 ms | 1,470 / 1,425 MHz |
| 32 | 271.28 / 273.93 | 2,871 / 1,813 ms | 102 / 619 ms | 1,320 / 1,275 MHz |
| 64 | 256.62 / 241.39 | 18,356 / 10,953 ms | 114 / 1,363 ms | 1,215 / 1,013 MHz |

Up to 32 users the engines were within 3 percent on throughput and within 6 percent on the time per token. Below the point where the pool fills, SGLang gave the first token sooner, 170 against 253 ms at 8 users.

**What the stats lines show**

Above that point the engines made different choices. SGLang ran 37 requests and kept 27 waiting, with the pool 92 percent full. vLLM ran 40 requests and kept 11 waiting, filled 99.5 percent of its pool, and prefilled new prompts at 460 tokens per second while it did. More requests started, so their first token came sooner. Each new prefill then shared the step with the running decodes, so the streams stalled. The clock caveat belongs with the last row: even after three tries the vLLM runs at 64 users had a median clock of 1,013 MHz against 1,215, so part of the throughput gap is the card. The 12-times gap in the inter-token tail is too large for a 17 percent clock difference.

**A fixed arrival rate**

Up to 2 requests per second the engines tied on throughput, SGLang gave the first token sooner, 284 against 317 ms at 0.5 per second, and vLLM had the shorter time per token, 68 against 74 ms at 1 per second. At 2 per second vLLM served a median of 1.36 requests per second within the latency target and SGLang 0.88, with overlapping seed ranges. From 4 per second both fell behind the arrivals, and the same admission choice appeared: vLLM gave 286.6 against 257.5 tokens per second, 11 percent more, and its P99 time per token was 187 against 127 ms.

**Waves and mixed lengths**

With fixed prompt lengths at 16 users, requests arrive in waves, and the engines tied on throughput while vLLM gave the first token sooner, 1,499 against 1,775 ms, and SGLang kept the stream smooth, with a P99 ITL of 81 against 502 ms. With mixed lengths vLLM led by default: 169.6 against 159.6 tokens per second and a P99 ITL of 191 against 363 ms. Then `--enable-mixed-chunk` on SGLang, which puts the running decodes into the prefill batch, closed that gap to 193 against 191 ms, at the cost of a worse P99 ITL with fixed lengths, from 81 to 203 ms.

**Shared prompts**

With a shared system prompt both caches hit, and both engines kept the median first token under 500 ms at every shared length. With the cache off SGLang took 14,706 ms and vLLM 13,353 at 4,096 shared tokens. The cache is the result, not the engine.

**The GB10**

On the GB10 the two engines gave the same output at 32 and 64 users, and the vLLM P99 ITL was about twice as high, 478 against 220 ms at 32 users.

**How to pick**

On this card with unique prompts the choice was mostly a latency decision, and the shape of the traffic picked the winner. When requests arrived together, at a full pool or in waves, SGLang protected the stream and vLLM the first token. With mixed lengths vLLM led by default and one flag removed the lead. Decide on model support, startup time and the hardware you have, then measure your own length mix, and read the P99 ITL next to the first token. Compare engines at matched pools and matched clocks, or not at all.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did vLLM give the sooner first token and the worse stream at the same throughput? Expected: it admitted more requests, 40 against 37, and filled 99.5 percent of its pool while it prefilled new prompts at 460 tokens per second; each new prefill shared the step with the running decodes, so the streams stalled while the first tokens came sooner.
- **Level 4:** With mixed prompt lengths vLLM led on the stream, and then SGLang tied it. What changed? Expected: the mixed-chunk flag put the running decodes into the prefill batch, so a new prompt no longer stopped the stream; the P99 ITL fell from 363 to 193 ms with mixed lengths, and the cost was a worse P99 ITL with fixed lengths, 81 to 203 ms, because whole waves then shared steps with decodes.
- **Level 4:** A published comparison shows one engine 29 percent ahead. What do you ask before you believe it? Expected: the versions and the date, whether the workload matches yours including the share of repeated prefix, whether the memory budgets and context flags were matched, whether the concurrency passed the decode graph limit, whether the flags were mapped correctly, and who paid for the test.

**Wrong answers, and why they fail**

- "They tie on throughput, so pick either." At 64 users the P99 gap between tokens was 1,363 ms on one and 114 on the other at the same output; for chat that is the number the users feel.
- "The engine with the sooner first token is better for chat." It bought the first token with stalls in the stream; the P99 ITL was 12 times higher, and no cap fixed it; read both numbers.
- "The faster engine in the benchmark is faster." Compare only at matched pools and clocks; one published test left one engine at its automatic memory fraction and the other at 0.9 of GPU memory, so the two pools differed.
- "The result transfers to our mixed traffic." The winner changed with the traffic shape: at a full pool and in waves one engine protected the stream, with mixed lengths the other led by default, and one flag removed that lead; measure your own length mix.

**Related lesson in this course:** [Measuring inference: TTFT, ITL, throughput and bottlenecks](#aiinfra-3)

:::
