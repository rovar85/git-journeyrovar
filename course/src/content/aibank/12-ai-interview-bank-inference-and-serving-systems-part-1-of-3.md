---
track: aibank
title: "AI interview bank: Inference and serving systems (part 1 of 3)"
short: Inference and serving  1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Why 255 tokens per second is a slogan

*Level 1 (screening) · concept · about 6 minutes*

A teammate posts in the team channel that the server does 255 tokens per second. Is that a result? What would you ask for, and what single number tells you where to stop adding users?

:::answer Show the answer
:::say Short answer
It is a slogan, not a result, because a throughput number without the latency that came with it describes nothing a user feels. Ask for the concurrency, the median and P99 first token and time per token at that concurrency, the client and the temperature, and the clock. Goodput is the number that sets the limit: the requests per second, or the share of requests, that met every latency target at once, and on the manual's GB10 the BF16 server's goodput was highest at a cap of 4 while its throughput kept rising to a cap of 64.
:::

**Full answer**

**The same server, two loads**

The 255 came from the manual's own capture. The same server gave that throughput with a median time to first token of 0.8 s at one load and 3.9 s at another:

| Cap | Output tok/s | Median TTFT | P99 TTFT | Median TPOT |
|---|---|---|---|---|
| 1 | 175.15 | 162.98 ms | 270.18 ms | 4.38 ms |
| 8 | 255.63 | 785.79 ms | 2180.87 ms | 22.52 ms |
| 32 | 252.74 | 3917.54 ms | 8262.86 ms | 93.61 ms |

From a cap of 8 to 32 the throughput fell about 1 percent, the median first token got 5 times slower, and the median time per token got 4.2 times slower. The server had no idle compute left to give; new users only waited for a share of the same steps.

**Goodput**

Goodput is the share of requests, or the rate of requests per second, that met every latency bound at the same time: the first token under a limit, the time per token under a limit, and the end-to-end time under a limit. A request that misses any one of them is not good. The lesson's rule: high throughput at 60 percent goodput is failure, and lower throughput at 99 percent goodput is the target.

The manual's target was a first token under 1 s and a mean time per token under 100 ms. On the GB10 with Qwen3-30B-A3B:

| Cap | BF16 goodput | BF16 median TPOT | FP8 goodput | FP8 median TPOT |
|---|---|---|---|---|
| 4 | 0.44 req/s | 71.01 ms | 0.80 req/s | 38.60 ms |
| 8 | 0, up to 0.04 in one seed | 102.21 ms | 1.07 req/s | 54.96 ms |
| 16 | 0 | 154.24 ms | 1.10 req/s | 81.90 ms |
| 32 | 0 | 201.91 ms | 0 | 104.12 ms |

BF16 goodput was highest at a cap of 4. At a cap of 8 the median request took longer than 100 ms per token, so at least half of the requests missed the target, and goodput was 0, up to 0.04 in one seed, while throughput at that cap was 74.11 tokens per second and still rising. FP8 held the target up to a cap of 16. Choose the cap from goodput at your own target, and use the throughput curve only to explain it.

**Why the mean is the wrong statistic**

The lesson gives the shape: a decode batch with one long prefill neighbour can ship most tokens near 7 ms per token and a few near 60 ms, so the mean reads 9 ms while the P99 reads 65 ms, and users hit the P99 regularly. Report the median, the P90 and the P99 together. The tools also disagree on the definition: for a request with a 500 ms first token and 100 output tokens over 700 ms of decode, one tool that excludes the first token reports 7.07 ms per token and one that includes it reports 12.00 ms. State the tool and the definition with every number.

**Where the knee is, and who enforces it**

A closed loop never falls behind, because each client waits for its answer before it sends the next request. A fixed arrival rate does not wait. Under a fixed rate the GB10 BF16 server already had a median time per token of 177.5 ms at 0.5 requests per second and met the target for only 0.07 requests per second, while FP8 met the target for every request up to 1 per second and fell to 0.17 at 2. Enforce the knee outside the engine, in the client or the gateway, because the engine's own admission limit comes from memory and sat at 4096 running requests on that server, far above the knee.

**The floor behind one number**

The lesson shows where the time per token comes from on an L4: one decode step reads 16.41 GB of weights, which takes at least 54.7 ms at 300 GB/s, and the measured step took 60.16 ms. A target of 100 ms per token leaves little room on that card for an 8B model in BF16, which is why the pool and the precision matter before the scheduler does.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which numbers go next to a throughput figure? Expected: the concurrency or request rate, and the median and P99 of the first token and of the time per token at that point, with the client, temperature and clock as context.
- **Level 2:** Goodput fell to zero at a cap of 8 while throughput still rose. How can both be true? Expected: the server wrote more tokens per second, but the median request took longer than 100 ms per token, so at least half of the requests missed the target and almost none met every bound; throughput counts tokens and goodput counts requests that arrived on time.
- **Level 3:** Why is the mean the wrong statistic for the time per token? Expected: the distribution has a long right tail; a batch with one long prefill neighbour can ship most tokens near 7 ms and a few near 60, so the mean reads 9 ms while the P99 reads 65, and users hit the P99 regularly.
- **Level 4:** Two tools report different time per token for the same run. Why, and what do you do? Expected: one excludes the first token from the inter-token calculation and the other includes it, 7.07 against 12.00 ms in the lesson's example; state the tool and the definition with every number, and keep one tool for every run you compare.

**Wrong answers, and why they fail**

- "255 tokens per second is the capacity of the server." The same server gave that throughput with a median time to first token of 0.8 s at one load and 3.9 s at another; the number without its latency is not a result.
- "Add users until throughput stops rising, then stop." On the GB10 the BF16 throughput kept rising to a cap of 64 while goodput was 0 or close to it from a cap of 8; the latency target, not the throughput curve, sets the limit.
- "Report the mean time per token." The distribution is right-skewed, so a mean of 9 ms can hide a P99 of 65; report the median, P90 and P99.
- "The engine's own admission limit protects the users." The engine's limit comes from memory, which runs out long after latency is unacceptable; enforce the knee in the client or the gateway.

**Related lesson in this course:** [Measuring inference: TTFT, ITL, throughput and bottlenecks](#aiinfra-3)

:::

## Cached tokens at zero with a stable template

*Level 2 (working) · debug · about 8 minutes*

A team runs long agent sessions on SGLang with hierarchical caching on. Their dashboards show `#cached-token: 0` on requests that resend a long history. They have tuned the cache tiers and the write policy, and the hit rate barely moves. The prompt template looks stable to them. Where do you look first, and what do you expect to find?

:::answer Show the answer
:::say Short answer
Look at the first tokens of the request as the server sees them, not at the template. A relay or a chat template often adds something that changes on every request near the start, such as a request ID, a session hash or the date, and the tree matches from the first token and stops at the first difference. In the manual's incident a random hash in the system prompt cost 27.6 points of hit rate, and removing it moved the engine hit rate from 66.8 to 94.4 percent.
:::

**Full answer**

**Reproduce it with one identifier in three places**

The manual's capture kit sends one 2,999-token system prompt and a short question, five times in each of three forms, with `--enable-cache-report` on so that each response reports its cached tokens:

| Form | Cached tokens | Prompt tokens | Median TTFT |
|---|---|---|---|
| stable system prompt | 2,998 | 2,999 | 45.1 ms |
| random ID at the start | 5 | 3,034 | 1,255.3 ms |
| the same ID at the end | 2,985 | 3,028 | 88.2 ms |

The ID at the start made the first token 28 times slower. The ID at the end cost 43 ms. The tokens are almost the same in the three forms; only their order differs. The ID at the start matched the 5 tokens before the random hex digits and nothing after them.

**Why nothing after a change can match**

The attention values of every later token depend on every earlier token. A cache that reused the later tokens would return wrong answers. So the tree is exact, and a change in the system prompt invalidates everything behind it, while a change in the newest message invalidates only that message.

**The incident behind the question**

The reporter found three causes stacked on each other:

1. The relay put a per-session random hash and a rotating system message into every request. Removing them moved the engine hit rate from 66.8 to 94.4 percent.
2. The client wrote its task-list snapshot at the end of the system prompt. Every task update changed the system prompt and invalidated more than 100,000 tokens of history behind it.
3. Hierarchical cache load-back, when it found no room, evicted the prefixes of other sessions. The reporter counted 250,000 evict calls against 376 completed load-backs.

The first fix was a prompt edit. No cache flag could have recovered the 27.6 points that the hash cost. The lesson tells the same story from another deployment, where moving dynamic content out of the cacheable prefix took the hit rate from 7 to 74 percent.

**The order of checks**

1. Dump the exact token sequence of two consecutive requests and compare them from the first token. Include what the relay and the chat template add.
2. Read `cached_tokens` in the usage block with `--enable-cache-report`, or in `meta_info` of the native `/generate` route.
3. Read `#new-token` and `#cached-token` in the `Prefill batch` lines.
4. Read `sglang:cache_hit_rate` from `/metrics`.
5. With several servers, check routing. A request that lands on a server without its prefix misses whatever the prompt looks like. One report moved from 64.7 to 92.1 percent by routing each conversation to the same server.

Two server settings look like prompt problems. A request for prompt log probabilities from position k can reuse only the first k tokens. Different LoRA adapters never share tree nodes, because the adapter is part of the tree key.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The same random ID moves behind the fixed text instead. What does it cost now? Expected: about 45 tokens of prefill instead of about 3,027; in the experiment that was 43 ms more than the stable prompt instead of 28 times longer.
- **Level 3:** After the prompt fix, one server hits well and the fleet still misses. What next? Expected: routing; a request that lands on a server without its prefix misses, and routing each conversation to the same server moved one report from 64.7 to 92.1 percent.
- **Level 4:** The host tier still hurts other sessions after the prompt fix. What did the incident count, and what does it mean? Expected: 250,000 evict calls against 376 completed load-backs; a load-back that finds no room evicts other sessions from the GPU pool, so the pool size and the write policy need a look only after the prompt is fixed.

**Wrong answers, and why they fail**

- "Raise the hierarchical cache ratio until the hit rate recovers." No cache flag can recover a miss that starts at token 5; the first fix was a prompt edit, worth 27.6 points of hit rate.
- "The template is stable, so the prompt is stable." The template is not what the server sees; a relay, a gateway or the chat template can insert a hash, a date or a snapshot, so compare the token sequences of two consecutive requests from the start.
- "A changed field in the middle only costs the tokens of that field." Every token after the change is a different branch of the tree, because the attention values of later tokens depend on every earlier token.

:::

## Choose tensor, pipeline or data parallelism

*Level 2 (working) · design · about 10 minutes*

You have a model that does not fit on one GPU, or you need more throughput than one GPU gives. Walk me through how you choose between tensor, pipeline and data parallelism, and what each one costs in communication.

:::answer Show the answer
:::say Short answer
Ask three questions. If the model fits on one GPU with room for the KV cache you need, use data parallelism, one full copy per GPU, and the output grows with the copies. If it does not fit, split it: tensor parallelism inside one machine when the GPUs have a fast link and the GPU count divides the attention heads, and pipeline parallelism when they do not or when the model needs more than one machine. Tensor parallelism talks after every layer, pipeline parallelism once per stage boundary, and data parallelism not at all between copies.
:::

**Full answer**

**Three questions**

| Question | If yes | If no |
|---|---|---|
| Does the model fit on one GPU, with room for the KV cache you need? | Data parallelism: one copy per GPU, `--data-parallel-size N`. | Split the model; the next question decides where. |
| Does the split model fit inside one machine? | Keep the split inside the machine; the next question picks the layout. | Add pipeline parallelism across machines. |
| Do the GPUs have NVLink, and does the GPU count divide the model evenly? | Tensor parallelism, `--tensor-parallel-size N`. | Pipeline parallelism inside the machine, `--pipeline-parallel-size N`. |

Across machines: set the pipeline size to the number of machines and the tensor size to the GPUs in each machine. The tensor size must divide the attention-head count. If the GPUs in a machine do not divide it, use a tensor size of 1 and put the whole GPU count into the pipeline size.

**What each layout costs**

| Layout | What it splits | Communication | Best for |
|---|---|---|---|
| Tensor | each layer across GPUs | after every layer, so it needs a fast link | a model too big for one GPU, inside one machine |
| Pipeline | the layers into stages | once per stage boundary | a model too big for one machine, or GPUs without a fast link |
| Data | nothing, each GPU holds a copy | none between copies | more output from a model that fits |
| Expert | the experts of a mixture-of-experts model | before and after the expert layers | large expert models |

Tensor parallelism also splits the KV cache, so each GPU has more room for it. When the weights fill most of one GPU, two GPUs can hold several times the pool of one. The exception is a model with multi-head latent attention: it stores one compressed latent per token that cannot be split across heads, so every tensor-parallel rank keeps the full cache and more ranks add no tokens. Attention data parallelism answers that case.

**Check the link**

Tensor parallelism sends data after every layer. On GPUs joined only by PCIe, such as two L4s in one host, that traffic can cost more than the split saves. The vLLM documentation suggests pipeline parallelism on such a machine, because it sends data only at stage boundaries, and it also accepts a GPU count that does not divide the model evenly. The manual did not run either layout on its two L4s, so measure them against each other before you pick.

**Start a second machine**

Run the collective test script on both machines first. When the network and the drivers work, each process prints its success lines. Then start the server with a launcher that spans the machines, and start the API on one machine only. The traffic between the machines is not encrypted and can run code on the other side, so keep it on a private network.

**Count the processes**

With data parallelism vLLM starts one engine core per copy and one coordinator that keeps them in step. With tensor parallelism it starts one worker per GPU under one engine core. In SGLang the world size is `--tp-size` times `--pp-size`, and `--dp-size` copies get a controller that sends each request to one copy, round robin by default. That controller does not look at pools or queues. On the manual's two L4s, where one card was shared and its copy had a pool of 2,925 tokens against 24,094, the pair served less than one card at every load.

**Give a tensor group whole GPUs**

Before SGLang loads weights for a tensor group, each rank measures its free memory and the group keeps the smallest value. If that value is under 90 percent of the local free memory, the server stops. On the shared pair the second card had 18.28 GB free against the 19.53 GB that the check required, so `--tp-size 2` refused to start, and no flag turns the check off. Every rank holds the same share of weights and the same pool, so the smallest card sets the size for all of them.

**Very long prompts**

For prompts of hundreds of thousands of tokens, vLLM can split one sequence across GPUs with context parallelism. Use it when one long request is the problem, not when many short ones are.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Two GPUs in one host joined by PCIe only, and the model fits on one. What do you run? Expected: data parallelism, two full copies, because nothing moves between copies; tensor parallelism would pay after every layer over the slow link.
- **Level 3:** The model needs two machines of 8 GPUs. How do you set the sizes, and what do you check first? Expected: pipeline size 2 for the machines and tensor size 8 inside each, with 8 dividing the attention heads; run the collective test on both machines first and keep the traffic on a private network, because it is not encrypted.
- **Level 3:** Tensor parallelism on two GPUs where one is shared with another job. What does SGLang do at startup? Expected: it measures free memory on each rank, keeps the smallest, and stops if that is under 90 percent of the local free memory, because every rank holds the same share and pool; give the group whole GPUs.
- **Level 4:** Why does tensor parallelism add no KV capacity when the attention keeps one latent per token? Expected: that attention stores one compressed latent per token that cannot be split across heads, so every rank keeps the full cache; attention data parallelism gives each group its own requests and cache, so capacity grows with the groups.

**Wrong answers, and why they fail**

- "Tensor parallelism is the default way to use more GPUs." It is the way to make a model fit; when the model fits, data parallelism adds output with no traffic between copies, and tensor parallelism over PCIe can cost more than it saves.
- "More copies always mean more throughput." Only when every copy has about the same pool; a pair where one copy had an eighth of the pool served less than one card, because the round-robin controller fed it half the requests.
- "Pipeline parallelism is only for several machines." Inside one machine it is the choice when the GPUs lack a fast link or when the GPU count does not divide the model evenly.
- "Any GPU count works with tensor parallelism." The size must divide the attention-head count of the model; otherwise use a tensor size of 1 and put the whole count into the pipeline size.

**Related lesson in this course:** [Parallelism and distributed inference](#aiinfra-5)

:::

## How many users fit in the KV pool

*Level 2 (working) · estimate · about 10 minutes*

You serve `Qwen/Qwen3-8B` on one GPU with a maximum model length of 8,192 tokens. At startup the server prints a maximum concurrency of 2.94, and a manager asks if the GPU can serve only three users at a time. Your users send about 512 prompt tokens and get about 128 tokens back. How do you answer?

:::answer Show the answer
:::say Short answer
The startup number assumes that every user fills the full maximum model length, and real users hold much less. Count the KV bytes for one token, divide the KV pool by that number, and then divide the pool by the context that one user really holds. On the L4 in the vLLM manual, the pool of 24,096 tokens fits 37 users with 640 tokens each.
:::

**Full answer**

**Bytes for one token**

Every token in a running request keeps its keys and values in GPU memory until the request ends:

```text
KV bytes per token = layers x KV heads x head size x 2 x bytes per value
```

The factor 2 counts the key and the value. `Qwen/Qwen3-8B` has 36 layers, 8 KV heads and a head size of 128. In BF16 a value takes 2 bytes, so one token takes 144 KiB. The KV heads decide this number, not the parameter count: `Qwen/Qwen3-30B-A3B-Instruct-2507` has more weights but takes 96 KiB for each token.

**From bytes to users**

The server gives the KV cache the memory that is left after the weights and the startup profile. The pool line in the log gives the result in tokens:

```text
GPU KV cache size: 24,096 tokens, Maximum concurrency for 8,192 tokens per request: 2.94x
```

The 2.94 divides the pool by the full 8,192 tokens. A user with 512 prompt tokens and 128 output tokens holds 640 tokens at the end of the answer. The same pool holds 37 such users. During the load sweep the log showed 40 running requests with the cache 99.5 percent full, because users early in their answer hold fewer tokens.

**What to change if it is still too small**

1. Lower the maximum model length to the longest context that users send. This keeps one long request from taking a large share of the pool. It does not add users here, because the pool stays the same.
2. Use an FP8 KV cache. It halves the bytes per token.
3. Use FP8 weights to free memory for the cache.
4. Use a GPU with more memory, or split the model across GPUs.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What happens to a request that needs more blocks than are free? Expected: it waits in the queue. A running request that needs a block when none is free is stopped and computed again later.
- **Level 2:** Why does the mixture-of-experts model use less KV memory per token than the dense model? Expected: it has fewer KV heads, and the KV heads, not the weights, set the bytes per token.
- **Level 3:** How do you check your count after a start? Expected: read the memory line and the pool line in the startup log, and compare them with the count from the model config.
- **Level 3:** What is the cost of the FP8 KV cache? Expected: a possible loss of quality, so measure it on your own eval before you ship it.

**Wrong answers, and why they fail**

- "Divide the GPU memory by the model size." The weights are only one part. The users that fit depend on the KV pool and on the context per user.
- "The maximum concurrency in the log is the user limit." It assumes that each user fills the maximum model length, which real users do not.
- "More parameters always mean more KV memory per token." The bytes per token depend on the layers, the KV heads and the head size.

**Related lesson in this course:** [Parallelism and distributed inference](#aiinfra-5)

:::

## Read the GPU clock before the throughput

*Level 2 (working) · debug · about 8 minutes*

Your first sweep on an L4 says that CUDA graphs do nothing: at one user the median per-token time is 103.4 ms with graphs and 103.4 ms without, and the three seeds at that cap spread from 10.0 to 14.9 tokens per second, half the median. What do you check before you report that graphs do nothing?

:::answer Show the answer
:::say Short answer
Check the GPU clock and the temperature during the run before you believe either number. The manual's L4 sat at 87 C with software thermal slowdown active and an SM clock of 360 MHz out of 2040 during that sweep, so the server under test was not the cause. A sweep with a cool-down to 72 C and the clock recorded gave 60.16 ms per token at one user against 103.38 hot, and 270.11 against 194.16 tokens per second at a cap of 32: the hot sweep reported up to 28 percent less throughput, with the same command on the same card.
:::

**Full answer**

**What the telemetry showed**

One driver query during the sweep gave the row: 87 C, 58.36 W of a 72.00 W limit, an SM clock of 360 MHz against a maximum of 2040, the software thermal slowdown bit active, and 100 percent utilization. The L4 is a 72 W card with passive cooling, and the second card in the same chassis ran other work at the same time. The sweep had measured a hot GPU.

**The fix in the method**

The sweep script now samples the driver once a second into a file beside each run. Before each run it waits up to 900 s for the GPU to cool below a limit, 65 C by default and 72 C for this chassis. The summary adds the median SM clock, the highest temperature and the share of samples with a thermal slowdown bit to each point. A run under a clock floor is set aside and repeated, up to three times.

The cooled runs are not at full speed either. Their median SM clock was 1,080 to 1,515 MHz of 2,040, and at caps of 1 and 64 the worst seed still had the thermal bit in 41 to 49 percent of its samples. The cool-down removes the worst error, and the recorded clock tells you how much is left.

**Overload heats the card**

Under a fixed arrival rate the L4 completed fewer requests the more were offered: 2.01 per second at 4 offered, 1.91 at 8 and 1.62 at 16. The median SM clock fell from 1,320 MHz at 4 offered to 465 MHz at 16, and at 16 the thermal bit was set in 70 percent of the samples. On a passively cooled card overload costs throughput as well as latency. The GB10 showed the same at 16 offered per second: 89 C and 7.3 percent of the samples in thermal slowdown, while its clock stayed at 2,496 MHz up to 4 per second.

**Lock or record**

For a comparison of two configs, lock the SM clock with the driver tool, at 900 MHz in the manual's runs, and release the lock after. A lock sets the highest clock and cannot stop the GPU from throttling below it: one run with no speculation fell to 210 MHz under a 900 MHz lock and was set aside. Compare two runs only at the same clock. When the clocks differ by a little, read the ratio between the runs rather than the absolute times, and say the clock in the report.

The manual's position: a benchmark without the clock and the temperature of each run is not evidence.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which two columns do you add to every result row? Expected: the median SM clock and the highest temperature or the share of samples with the thermal flag, so that a reader can set aside hot runs.
- **Level 3:** You locked the clock at 900 MHz and one run still reports 210 MHz. How? Expected: a lock sets the highest clock and cannot stop the GPU from throttling below it; set that run aside, repeat it after a cool-down, and compare only runs at the same clock.
- **Level 3:** Under an open-loop overload the card finished fewer requests as you offered more. Why? Expected: the queue grew and the card heated, so the clock fell from 1,320 to 465 MHz and 70 percent of the samples showed thermal slowdown at 16 per second; on a passively cooled card overload costs throughput as well as latency.
- **Level 4:** Your chassis cannot cool the card below 72 C. How do you still compare two configs? Expected: run both in one session and alternate them, record the clock for every run, set aside runs under a floor and repeat them, read ratios between runs at similar clocks rather than absolute times, and print the clock next to every number.

**Wrong answers, and why they fail**

- "The GPU shows 100 percent utilization, so it runs at full speed." Utilization says the GPU was busy, not how fast; the same card read 100 percent at 360 MHz of 2040 with the thermal flag active.
- "A spread of half the median between seeds is normal noise." On a cool card the bands were inside about 10 percent of their medians; a spread of half the median is a sign of a changing clock, so read the telemetry.
- "A clock lock makes every run comparable." It caps the clock and cannot stop a throttle; a run under the lock fell to 210 MHz and had to be set aside.
- "Record the clock once at the start of the sweep." The clock fell from 1,320 to 465 MHz across one open-loop sweep as the queue grew; sample it once a second during every run and report the median per run.

:::

## Read three scheduler log lines

*Level 2 (working) · code-reading · about 8 minutes*

Here are three lines from two serving engines under load. Read each field and tell me what the server was doing, what the users felt, and which number you would act on.

```text
[2026-10-16 14:01:00] Prefill batch, #new-seq: 7, #new-token: 955, #cached-token: 15102, token usage: 0.05, #running-req: 1, #queue-req: 0, #pending-token: 0, cuda graph: False, input throughput (token/s): 1472.94
[2026-10-16 13:59:09] Decode batch, #running-req: 8, #token: 4075, token usage: 0.02, cuda graph: False, gen throughput (token/s): 98.37, #queue-req: 0
INFO 10-17 22:35:43 [loggers.py:320] Engine 000: Avg prompt throughput: 460.3 tokens/s, Avg generation throughput: 323.6 tokens/s, Running: 40 reqs, Waiting: 11 reqs, GPU KV cache usage: 99.5%, Prefix cache hit rate: 8.7%
```

:::answer Show the answer
:::say Short answer
The first line is a prefill batch on SGLang that admitted 7 requests and computed 955 new prompt tokens while 15,102 came from the radix cache, with the pool 5 percent full and nothing waiting: a shared-prefix workload with the cache working. The second is one decode step for 8 running requests at 98.37 tokens per second with an empty queue: a healthy, lightly loaded server. The third is vLLM at a full pool: 40 running, 11 waiting, the cache 99.5 percent used and a hit rate of 8.7 percent, so new requests wait for memory, and the number to act on is the pool.
:::

**Full answer**

**The SGLang prefill line, field by field**

- `#new-seq` is how many requests this prefill batch admits: 7.
- `#new-token` is how many prompt tokens it computes: 955. `#cached-token` is how many it reused from the radix tree: 15,102. Seven requests shared one long system prompt that an earlier request had computed, so only their questions were new.
- `token usage` is the share of the KV pool held by running requests and cached prefixes together: 0.05, so the pool is nearly empty.
- `#running-req` counts requests that are decoding: 1. `#queue-req` counts requests that wait: 0. `#pending-token` counts tokens of admitted requests that are not yet prefilled: 0.
- `cuda graph` says whether the step replayed a captured graph. False is expected on a platform without graphs, which is where this line came from.
- `input throughput` is the prefill speed of this batch: 1,472.94 tokens per second.

The same benchmark without the radix cache filled three prefill batches of up to 4,096 tokens for eight requests, every one with `#cached-token: 0`. The 4,096 is the chunked prefill size.

**The decode line**

SGLang prints one line per prefill batch and one decode line every 40 decode steps by default. This one shows 8 requests decoding together, 4,075 tokens held, 2 percent of the pool used, 98.37 output tokens per second, and no queue. The lines before it in the same run show how the batch formed: one request admitted while 7 waited, then the other 7 admitted together with 3,553 new tokens at 1,914 tokens per second, then all 8 decoding as one batch. Batching the prefill is where the throughput comes from, and the log shows it happen.

**The vLLM stats line**

`Running` and `Waiting` are the running and queued requests: 40 and 11. `GPU KV cache usage` is the share of the pool in use: 99.5 percent. `Prefix cache hit rate` is the share of prompt tokens that came from the cache: 8.7 percent. The prompt and generation throughputs say what the engine did in the interval: it prefilled new prompts at 460.3 tokens per second while 40 requests decoded, so each new prefill shared the step with the running streams. In that run, at 64 users on an L4, the median first token was 10,953 ms and the P99 gap between tokens 1,363 ms. The low hit rate is not a fault: the benchmark sent unique prompts, so there was little to share.

**What to act on**

- Line 1: nothing. Confirm that the hits persist as the working set grows, because cached prefixes live in the same pool as running requests.
- Line 2: nothing. The server has room; a sweep would tell you how much.
- Line 3: the pool. Grow it with an FP8 cache or FP8 weights, or run fewer users per replica. A cap on the running count would only choose who waits.

Read the pool line at startup as well. On the same card it said `GPU KV cache size: 24,096 tokens, Maximum concurrency for 8,192 tokens per request: 2.94x`, and the 2.94 assumes that every request fills the maximum length.

**What the lines do not show**

None of them show the GPU clock, the client that sent the load, or whether the cache was flushed before the run. Those belong in the result next to the lines.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** In the first line, why is the cached count so much larger than the new count? Expected: the 7 requests shared a long system prompt that an earlier request had already computed, so the tree served it and only the questions were new; the no-cache run of the same benchmark showed batches of 4,096 new tokens and zero cached.
- **Level 3:** The hit rate in the third line reads 8.7 percent. Is the cache broken? Expected: no; the random benchmark sends unique prompts, so there is little to share; the hit rate is a property of the prompts, and the number that matters in that line is the pool at 99.5 percent with 11 waiting.
- **Level 3:** What does the token usage field include, and when should it worry you? Expected: the share of the pool held by running requests and by cached prefixes together; near 1.0 the pool is full, new requests queue, and cached prefixes get evicted.
- **Level 4:** Would a cap on running requests help the server in the third line? Expected: no; the pool is full, so a cap only chooses who waits and moves the wait to the first token; grow the pool with an FP8 cache or FP8 weights, or run fewer users per replica.

**Wrong answers, and why they fail**

- "A hit rate of 8.7 percent means the prefix cache is misconfigured." Unique prompts have little to share; the hit rate reflects the prompts, and the same engine read far higher on a shared-prefix run.
- "Token usage at 0.05 means the server is almost idle." It means the pool is nearly empty; the GPU can still be busy, as the 1,472.94 prompt tokens per second show; read the running and queue counts for load.
- "cuda graph: False means something is wrong." It says the step did not replay a captured graph, which is expected on a platform without graphs and during a prefill batch; on CUDA, read it on the decode lines.
- "Waiting: 11 is a small queue, so ignore it." With the pool at 99.5 percent every waiting request waits for a running request to finish, and at 64 users on that card the median first token was 10,953 ms; the pool is the limit.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Sleep, wake and weight updates for an RL loop

*Level 2 (working) · concept · about 8 minutes*

Your RL trainer shares its GPUs with the vLLM server that generates the rollouts. Between rollout steps the trainer needs the GPU memory back, and after each step the server needs the new weights. What does vLLM give you for this loop, and what can go wrong at the pinned version?

:::answer Show the answer
:::say Short answer
vLLM has development-mode routes for the loop: sleep mode frees GPU memory on `/sleep` and takes it back on `/wake_up`, `/pause` and `/resume` stop and restart generation, and a weight transfer runs through `/init_weight_transfer_engine`, `/start_weight_update` and `/finish_weight_update`, over NCCL between GPUs or through CUDA memory handles on one machine. At level 1 the sleep keeps the weights, and at level 2 it drops them too, which suits a step where the trainer sends new weights anyway. Three problems are known at 0.31.0: a level 2 wake does not reload a speculative draft, a level 2 sleep clears calibrated KV scales, and a weight update during sleep stops the engine, so wake first, reload, reset the prefix cache and read the acceptance counters.
:::

**Full answer**

**The loop**

An RL step has two halves. The rollout half generates answers with the current weights. The training half computes a loss and updates the weights, and the generator needs the new weights before the next rollout. On one set of GPUs the two halves take turns on the same memory, so the generator must give its memory back during training and take it again after.

**The pieces**

All of these routes exist only when the server starts with `VLLM_SERVER_DEV_MODE=1`. They free memory, replace weights and run methods on every worker, so never expose a server in this mode outside the network of the trainer; bind it to the local host when you try it by hand.

- **Sleep mode.** Start with `--enable-sleep-mode`. `/sleep?level=1` frees the KV cache and other memory and keeps the weights; level 2 drops the weights too. `--sleep-preserve-parameter-names` keeps frozen weights on the GPU so that they do not move each step. `/is_sleeping` reports the state.
- **Pause and resume.** `/pause` stops new generation and can abort the running requests, wait for them or keep them; `/resume` starts again.
- **Weight updates.** The trainer starts a transfer, calls start, sends the weights, calls finish, and records the version with `/update_weight_version` so that the next rollouts are labelled.
- **Collective calls.** `/collective_rpc` runs a method on every worker, for setup that vLLM does not cover.
- **External launch.** With the external launcher backend, a launcher such as torchrun starts the vLLM workers inside the trainer's processes.

**What the manual saw**

A level 1 sleep with Qwen3-0.6B on an L4: each POST returned 200 with an empty body, the sleep took 1.9 s, the GPU memory fell from 14,861 to 4,245 MiB and came back after the wake, and the log line read `Sleep mode freed 10.37 GiB memory`. That is the only timing the manual has; a level 2 sleep and a weight update were not timed.

**What can go wrong at 0.31.0**

- A level 2 wake does not reload a speculative draft. The reload covers only the target model, so the target rejects every draft token and decode falls to about the speed with no speculation. The output stays correct and no error appears. The issue is open.
- A level 2 sleep clears calibrated KV scales on some checkpoints with an FP8 cache. The first request after a reload returned NaN logprobs and a wrong first token. The next release fixes this.
- A weight update during sleep segfaults the engine. The API server stays up and every later request fails. The issue is open.

So after each level 2 wake, reload the weights, reset the prefix cache and read the speculative acceptance counters. A reload does not bring back cleared KV scales at 0.31.0; release 0.32.0 fixes that case. Always wake the server before the trainer sends weights.

**The logprob gap**

The trainer compares the logprobs that the server returned with the ones it computes itself. They never match exactly, because the kernels differ; a small steady gap is normal, and a growing gap means the weights did not reach the generator. Check which value the server returns first. `--logprobs-mode raw_logprobs`, the default, gives the logprob over the full vocabulary; `processed_logprobs` gives it after the sampling settings change the distribution. With top-p 0.9 the raw mode matched a full-vocabulary reference with a median absolute gap of 0.005, and the processed mode was higher by minus the log of the kept mass, a median shift of about 0.053. Match the mode to the way the trainer scores tokens.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What is the difference between the two sleep levels? Expected: level 1 frees the KV cache and other memory and keeps the weights; level 2 drops the weights too, which suits a step where new weights arrive anyway and costs a reload.
- **Level 3:** After a level 2 wake the output is correct but decode runs as slowly as with no speculation. Why? Expected: the weight reload covers only the target model, so the draft is not reloaded and the target rejects every draft token; no error appears, and the acceptance counters show it.
- **Level 3:** The trainer's logprobs differ from the server's on every token. Bug or not? Expected: a small steady gap is normal because the kernels differ, 0.005 median absolute with raw logprobs; a growing gap means the weights did not arrive, and a constant offset near the log of the kept mass means the server returned processed logprobs under top-p while the trainer scored the full vocabulary.
- **Level 4:** Order the steps of one RL iteration around these routes. Expected: pause or drain generation, sleep, train, wake, then start and finish the weight update and record the version, reset the prefix cache, reload the draft if speculation is on, read the acceptance counters, resume; never send weights while the server sleeps, because that stops the engine.

**Wrong answers, and why they fail**

- "Expose the sleep and weight routes on the public port." They exist only in development mode, and they free memory, replace weights and run methods on every worker; keep them on the trainer's network, bound to the local host when you test by hand.
- "Send the new weights while the server sleeps to save time." At 0.31.0 that segfaults the engine; the API server stays up and every later request fails, so always wake before the trainer sends weights.
- "Logprobs from the server and the trainer should match exactly." The kernels differ, so a small steady gap is normal; track it every step and treat a growing gap as a sign that the weights did not reach the generator.
- "A level 2 wake restores the server to its state before the sleep." It reloads the target weights only; the speculative draft is not reloaded and calibrated KV scales were cleared on some checkpoints, so reload, reset the cache and read the acceptance after each level 2 wake, and on 0.31.0 a reload does not bring back the scales.

:::

## Temperature zero gave two different answers

*Level 2 (working) · concept · about 8 minutes*

You run the same evaluation twice at temperature 0 on a serving engine and the scores differ. You send one failing prompt alone and get one answer, then send it inside a busy batch and get another. Nothing in the request changed. Explain what did change, and what a seed can and cannot fix.

:::answer Show the answer
:::say Short answer
The batch changed the arithmetic. Floating-point addition is not associative, and the kernels split their sums by the batch size, so the same request adds its numbers in a different order in a batch of 3 than in a batch of 30; a change in the last bit can flip the top logit, and every later token then follows a different text. The prefix cache does the same, because a request that reuses cached blocks runs a different prefill path, and so does the dtype. A seed fixes only the random draws of sampling, so it is not enough: offline, run the engine in one process with the same order; online, use the batch-invariant mode and pay its speed cost.
:::

**Full answer**

**Four things that change one request**

- **The batch.** Matrix multiplies, softmax and norms split their sums into tiles, and many kernels pick the split from the batch size.
- **The schedule.** In a multiprocess server, the timing of requests decides which batch each one joins.
- **The prefix cache.** A request that reuses cached blocks computes its prompt in a different way than a request with no hit.
- **The dtype.** BF16 and FP16 round each number differently, so the same model writes different text in the two.

The vLLM seed defaults to 0 and cannot be unset, because speculative decoding needs every worker to sample the same tokens. So a seed is always there, and it is not enough by itself.

**What the manual counted**

Greedy outputs of Qwen3-0.6B, 32 ShareGPT questions after one shared system prompt of about 170 tokens, 128 output tokens, compared token by token between two runs. The number in brackets is the median position of the first token that differs:

| Comparison | SGLang | vLLM |
|---|---|---|
| flushed repeat against fresh | 0 of 32 | 0 of 32 |
| cache off against cache off | 0 of 32 | 0 of 32 |
| fresh against warm cache | 21 of 32 (45) | 11 of 32 (57) |
| cache on against cache off | 25 of 32 (26) | 21 of 32 (48) |

At one user and the same cache state, the text repeated exactly. A warm cache changed 21 of 32 outputs on SGLang and 11 of 32 on vLLM. At 64 users sent at once, two runs with the cache off still differed, in 27 of 64 outputs on SGLang and 50 of 64 on vLLM: the batch alone changed most outputs. BF16 against FP16 at one user changed 48 of 64 outputs on vLLM and 51 of 64 on SGLang for the 0.6B model, and 56 and 57 of 64 for Qwen3-1.7B.

The SGLang probe on the GB10 makes the point in one prompt. Sent five times alone and five times inside a batch of 16 at temperature 0, the default server wrote two texts, which parted after 238 characters. The first request alone had computed its prompt from nothing; the four later ones found it in the radix cache. With deterministic mode on, all ten requests wrote the same text.

**What fixes it**

| Case | Fix | Cost |
|---|---|---|
| Offline evals with the `LLM` class | `VLLM_ENABLE_V1_MULTIPROCESSING=0`, the same seed, the same prompts in the same order | the engine runs in your process, so the schedule repeats |
| A live server | `VLLM_BATCH_INVARIANT=1`, or `--enable-deterministic-inference` on SGLang | slower kernels for every request |
| Greedy evals that must match exactly | greedy sampling plus one of the two above | as above |

Every fix also needs the same hardware, the same engine version and the same settings. On SGLang the flag replaces the matrix, softmax, norm and batched-multiply operators with batch-invariant kernels, forces the plain sampler, fixes the all-reduce order under tensor parallelism, accepts only some attention backends, turns the radix cache off unless the backend supports it, and gives every request without a `sampling_seed` the seed 42.

**How to test it**

Run the same eval twice and compare the outputs token by token, not only the score. Flush the prefix cache or restart the server before each probe. If the outputs differ, take one prompt that differs and run it alone twice. If the two answers match when alone, and the batched probe started from the same cache state, the batch causes the difference. SGLang ships a test that sends one prompt in random batch sizes and counts distinct outputs, with modes for a single prompt, shared prefixes and cached against uncached prefill.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which comparisons in the manual's table gave the same text every time? Expected: a repeat after a cache flush against a fresh run, and a repeat with the cache off against the cache off, both 0 of 32 changed on both engines.
- **Level 3:** Why can a warm prefix cache change a greedy answer when the model and the prompt are the same? Expected: a request that reuses cached blocks computes its prompt in a different path than a full prefill, so the logits differ in their last bits, and one changed token changes the rest; it changed 21 of 32 outputs on SGLang and 11 of 32 on vLLM.
- **Level 4:** Under load two cache-off runs still differed. What does that say about the fix? Expected: the batch alone changed most outputs, 50 of 64 on vLLM, so a cache reset is enough only at one user; a live server needs batch-invariant kernels, and the manual did not test that mode at that load.

**Wrong answers, and why they fail**

- "Temperature 0 makes the output deterministic." Greedy picks the top logit, and the batch changes the logits in their last bits; the GB10 server gave two texts for one prompt at temperature 0 with nothing in the request changed.
- "Set a seed and the outputs match." The seed only fixes the random draws; the vLLM seed defaults to 0 and cannot be unset, and the outputs still changed with the batch and the cache.
- "Flush the cache before each run and you are done." At one user that was enough, 0 of 32 changed; at 64 users two runs with the cache off still differed in 50 of 64 outputs, because the batch changed the sums.
- "Switch to FP16 for exact results." BF16 and FP16 round differently, so the same model writes different text in the two dtypes, 48 of 64 outputs for the 0.6B model; keep one dtype between runs you compare.

**Related lesson in this course:** [Serving engines: batching, PagedAttention, vLLM, Triton and friends](#aiinfra-4)

:::

## The knee that the prefix cache hid

*Level 2 (working) · debug · about 8 minutes*

Your first concurrency sweep on an L4 shows a first-token median of 0.3 s up to 16 users and 1.8 s at 32, so you set the production limit at 20 users per replica. A second sweep with a reset before each run puts the first token at 1.6 s already at 16 users. Which sweep do you trust, and why do the two disagree?

:::answer Show the answer
:::say Short answer
Trust the sweep with the reset. The first sweep kept one server for all the user counts and sent the same first prompts at every count with a fixed seed, so below 32 users many requests found their prompt in the prefix cache and skipped the prefill. With the reset the median first token rose at every step, about 0.65 s at 4 users, 1.0 s at 8 and 1.6 s at 16, and the P99 ITL jumped from about 70 ms at 8 users to 522 ms at 16, so the knee on this card sits between 8 and 16 users, not between 16 and 32.
:::

**Full answer**

**How the cache inflated the first sweep**

The random dataset with a fixed seed sends the same prompts in every run. The first sweep ran all the user counts against one server, so each run found the prompts of the earlier runs in the cache. This was the table it produced, Qwen/Qwen3-8B on vLLM 0.31.0, three seeds per point:

| Users | Output tok/s | Median TTFT | Median TPOT | P99 ITL |
|---|---|---|---|---|
| 1 | 13.5 | 191 ms | 60.4 ms | 105 ms |
| 8 | 112.8 | 253 ms | 65.8 ms | 67 ms |
| 16 | 201.3 | 288 ms | 69.5 ms | 85 ms |
| 32 | 275.1 | 1,800 ms | 101.8 ms | 613 ms |
| 64 | 242.3 | 11,181 ms | 129.2 ms | 1,233 ms |

The jump between 16 and 32 users looked like the knee. It was the throughput peak. A cached prompt skips its prefill, so its first token comes fast, and most requests below 32 users had that advantage.

**The flushed comparison**

The same sweep at 900 MHz, the cache reset ahead of every run, against an unflushed run of the same session:

| Users | vLLM, flushed against unflushed | SGLang, flushed against unflushed |
|---|---|---|
| 4 | 650 / 145 ms | 532 to 645 / 141 ms |
| 8 | 951 to 978 / 264 to 274 ms | 1,174 to 1,273 / 173 to 178 ms |
| 16 | 1,550 to 1,587 / 294 to 295 ms | 1,804 to 1,944 / 218 ms |
| 32 | 1,982 to 2,084 / 2,012 to 3,091 ms | 3,216 to 3,228 / 2,710 to 2,917 ms |

From 32 users the queue dominated and the reset changed little. Below it, the cache made most of the fast first tokens.

**The size of the effect on one load**

The same 64 prompts at 16 users, four times in a row, median TTFT in ms: vLLM read 925 fresh, 148 on a repeat without a flush, 1,163 on a repeat after a flush, and 184 on another repeat without one. SGLang read 394, 82.5, 289 and 77. The repeat without a flush read a first token about 6 times lower on vLLM and 4.8 times lower on SGLang. The time per token changed by less than 15 percent, because a hit removes prefill work and leaves the decode work the same.

On the GB10 the effect reversed a sweep. A single kit run read 677.61 ms as the median time to first token with a cap of 8 and 390.38 ms with a cap of 32: more load, a faster first token. The prefill lines showed why. At a cap of 8, 16 of the 64 prompts were in the cache before the run started; at 32, 64 of 128; at 64, 128 of 256. Three seeds with fresh servers put the first token back in order, 209.98 ms at 8 and 416.37 at 32.

**The protocol**

1. Start each run with an empty cache. Restart the server, or call the reset route: `POST /reset_prefix_cache` on vLLM, which exists only with `VLLM_SERVER_DEV_MODE=1` and must never be exposed, or `--flush-cache` on the SGLang client, which calls `/flush_cache` after the warm-up. SGLang flushes only when no request runs or waits; otherwise the route answers HTTP 400 and the log says so.
2. Use a new seed for each run, so that the random dataset sends new prompts.
3. Record the cached tokens. Read the prefix cache counters before and after the run, or turn on the per-response count, `--enable-prompt-tokens-details` on vLLM and `--enable-cache-report` on SGLang.
4. Write the cache setting and the cached tokens next to the result.

The vLLM sweep tool resets the server caches between its runs for you.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why did the time per token barely move between the flushed and the unflushed runs? Expected: a cache hit removes prefill work and leaves the decode work the same, so TTFT falls and TPOT moves by less than 15 percent.
- **Level 3:** On the GB10 a single run read a faster first token at a cap of 32 than at a cap of 8. How is that possible? Expected: the runs shared one server and one seed, so the run at 32 found 64 of its 128 prompts in the cache from the earlier runs and half of its requests skipped prefill; three seeds on fresh servers put the first token back in order.
- **Level 3:** The flush route on SGLang answered HTTP 400. What happened? Expected: the server flushes only when no request runs or waits; a request was still pending, so the flush did not run and the log says so, and the run must wait or restart the server.
- **Level 4:** How would you make the warm-cache effect part of a benchmark on purpose? Expected: measure it as its own axis; record the cached tokens per run from the counters or the per-response field, and report a warm-cache row next to a cold row, each with its hit rate, instead of letting an unknown mix of the two set the knee.

**Wrong answers, and why they fail**

- "The jump from 0.3 to 1.8 s between 16 and 32 users is the knee." That sweep ran without a reset, so most requests below 32 users skipped their prefill; with a reset the P99 ITL jumped from about 70 to 522 ms between 8 and 16 users, and that is the knee.
- "Turn the prefix cache off for benchmarks." Production runs with it on; reset it between runs, use a new seed per run and record the cached tokens instead.
- "The time per token is inflated too, so throw the whole sweep away." A hit removes prefill work only; the time per token changed by less than 15 percent between flushed and unflushed runs, so the TPOT column stands and the TTFT column does not.
- "The random dataset gives new prompts every run." With the same seed the client sends the same prompts; the dataset is random only across seeds, so use a new seed per run.

**Related lesson in this course:** [Roadmap, a benchmarking harness and a reference architecture](#aiinfra-10)

:::

## Two clients, two numbers, one server

*Level 2 (working) · concept · about 8 minutes*

Two engineers benchmark the same server on the same day and report numbers that differ by a few percent. Both used standard benchmark clients. Before you look at the server, what about the clients could explain the gap, and what rules would you set for the team?

:::answer Show the answer
:::say Short answer
The client is part of the measurement. On one vLLM server the SGLang client read a median first token 3 to 10 percent higher and an output throughput 2 to 8 percent lower than the vLLM client, the two clients sent different random prompts, and temperature 0.7 raised the time per token by 10 to 13 percent at one user against temperature 0. The rules: one client, one temperature, one prompt length distribution with the range ratio stated, a flush and a new seed per run, the clock recorded, and all of that written next to every number.
:::

**Full answer**

**Three clients on one server**

The manual ran the SGLang client, `vllm bench serve` and its Rust version against one vLLM server with Qwen/Qwen3-0.6B, with a cache reset before every run and the clients alternated over two rounds. Output tokens per second at 64 users:

| Temperature | SGLang client | vllm bench | vllm bench, Rust |
|---|---|---|---|
| 0 | 359, 348 | 379, 377 | 371, 365 |
| 0.7 | 331, 343 | 360, 363 | 356, 353 |

The two vLLM clients agreed within the noise at 1, 16 and 64 users. The SGLang client read a slower server: a median first token 3 to 10 percent higher, and at 16 and 64 users an output throughput 2 to 8 percent lower. The two clients send different prompt tokens from their random datasets, so part of a small gap can come from the prompts. Temperature 0.7 raised the median time per token over temperature 0 by 10 to 13 percent at one user and 3 to 6 percent at 16 and 64 users.

**Four defaults that change the result**

The SGLang client makes choices before it measures anything:

| Setting | Default | What it does to the result |
|---|---|---|
| `--random-range-ratio` | 0.0 | each length is drawn from 1 to the length you asked for, so the average prompt is about half of it |
| `ignore_eos` | on | every request generates exactly the output length you asked for |
| `--request-rate` | inf | all requests are sent at time 0, and only the concurrency cap holds them back |
| `--warmup-requests` | 1 | one request runs before the clock starts |

The first row is the trap. With the default ratio, an input length of 512 gives an average prompt near 256 tokens, and the report says 512. Pass 1.0 or write the length distribution next to the result. With 1.0, 32 prompts of 512 tokens give an input total of 16384 in the report.

**Fixed lengths form waves**

With the ratio at 1.0 every request has the same length, so requests that start together finish together and their replacements arrive together. At 16 users on the L4, fixed lengths gave a median time to first token of 1,996 ms and a P99 ITL of 82 ms; mixed lengths gave 291 ms and 300 ms. The two settings measure two different servers. Fixed lengths measure bursts, with a slow first token and smooth tokens. Mixed lengths measure steady traffic, with a fast first token and stalls in the stream. Keep 1.0 to compare two builds, and run your real length mix before you set a latency target.

**The client's own queue**

The SGLang client sends every request from one Python process. A 2026 study found that such a client adds its own queue at high request rates and then reports a first token and a time per token higher than the server gave. Before you trust a number at a high rate, compare one client process with two processes that each send half the rate. The lesson names the same trap for a general load tester: tokenization under the interpreter lock in the client inflates the reported inter-token latency, and one prompt sent in a loop hits the prefix cache on almost every request and inflates the throughput.

**Hand-written scripts**

One report measured 13 tokens per second for a large model on eight GPUs against 60 from a hosted API. The script counted words split on spaces and included the first-token time in the rate. A word is not a token, and TTFT is not decode time. Use the benchmark client, which counts tokens and keeps TTFT and TPOT apart.

**The rules**

1. One client, one version, named in every result.
2. One temperature, named in every result.
3. `--random-range-ratio 1.0`, or the length distribution written down.
4. A flush and a new seed before every run, and the cached tokens recorded.
5. The GPU clock recorded and the hot runs set aside.
6. Throughput reported only together with the median and P99 TTFT and TPOT at the same cap.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the default range ratio describe half the work? Expected: each length is drawn from 1 to the length asked, so the average prompt is about half of it; with 1.0 every prompt has the full length and the input token total in the report confirms it.
- **Level 3:** Fixed lengths gave a late first token and a steady stream, mixed lengths the opposite. Which do you use? Expected: fixed lengths to compare two builds, because they repeat exactly; your real length mix before you set a latency target, because the two shapes measure two different servers.
- **Level 3:** A teammate's hand-written timing loop reads 13 tokens per second where a hosted API reads 60. What is wrong with the loop? Expected: it counted words split on spaces and included the first-token time in the rate; a word is not a token and TTFT is not decode time, so use the benchmark client.
- **Level 4:** At 16 requests per second the client reports a first token you do not believe. How do you check the client itself? Expected: a single-process client adds its own queue at high rates; run two client processes that each send half the rate and compare, and record the CPU use of the client.

**Wrong answers, and why they fail**

- "Both are standard clients, so the numbers are comparable." On one server the SGLang client read 3 to 10 percent higher first-token times and 2 to 8 percent lower throughput than the vLLM client; a gap of a few percent can come from the client alone.
- "Temperature does not change speed." Temperature 0.7 raised the median time per token 10 to 13 percent at one user and 3 to 6 percent at 16 and 64 users over temperature 0.
- "Set the input length to 512 and the prompts are 512 tokens." With the default range ratio of 0.0 the average prompt is about 256 tokens; pass 1.0 or state the distribution.
- "A load tester that handles HTTP handles model traffic." A generic tool sends one prompt in a loop, which hits the prefix cache almost every time, and it does not read the token gaps of a stream; use a client that samples prompt lengths and counts tokens.

**Related lesson in this course:** [Roadmap, a benchmarking harness and a reference architecture](#aiinfra-10)

:::

## What an FP8 KV cache buys and costs

*Level 2 (working) · tradeoff · about 10 minutes*

Your server queues requests because the KV cache is full. Someone suggests `--kv-cache-dtype fp8`. What does it buy, what can it cost, and how do you check both before production?

:::answer Show the answer
:::say Short answer
An FP8 KV cache stores each key and value in 1 byte instead of 2, so the same memory holds twice the tokens: for Qwen/Qwen3-8B a token falls from 144 KiB to 72 KiB, and one GiB holds about 14,600 tokens instead of about 7,300. It can cost accuracy, because FP8 needs a scale per tensor and a checkpoint without scales runs with a scale of 1.0, and it can change the attention backend, which on our L4 broke the first start. Check it with an accuracy run on your own task and with the startup log: on 500 GSM8K questions our FP8 KV run scored 90.8 percent against 91.8 in BF16, with overlapping intervals.
:::

**Full answer**

**What it buys**

Only the cache changes; the weights stay in BF16. Use the KV formula with 1 byte per value. Twice the tokens fit, so twice the users fit at the same length, or each user can have a context twice as long.

The speed change is small. With the pool held fixed at 24,096 tokens on our L4, one user got a median TPOT of 101.8 ms against 104.1 ms in BF16, 2.3 percent faster at the same 210 MHz clock, and the seed ranges did not overlap. At 32 users the seed ranges overlapped and the FP8 run had a higher clock, so the manual claims no gain there. Two things changed together in that run, the cache dtype and the attention backend.

A field report shows the capacity effect at scale. With a BF16 cache a service produced 1,558 tokens per second at 32 concurrent requests and ran out of memory at 64. With an FP8 cache it reached 2,192 tokens per second at 64, about 41 percent above the best BF16 result, while it was a few percent slower per token at every concurrency both could run. It won because twice as many requests fit: the context held in memory went from about 686,000 to about 1.37 million tokens.

**What it costs**

FP8 needs a scale for each tensor. Without a scale file, every scale is 1.0. vLLM logs `Using KV cache scaling factor 1.0` and SGLang logs `Using FP8 KV cache but no scaling factors provided`. The vLLM team treats a scale of 1.0 as the worst case for accuracy; in their tests most models stayed close to BF16, and one model family on a latent-attention backend did not.

Our own check, on 2026-10-23, ran the first 500 GSM8K questions, 8-shot and greedy, on the L4. Qwen3-8B has no KV scales, so the FP8 KV runs used a scale of 1.0:

| Engine | Config | Correct | Accuracy | Wilson 95 percent interval |
|---|---|---|---|---|
| vLLM | BF16 | 459/500 | 91.8% | 89.1 to 93.9 |
| vLLM | FP8 KV cache | 454/500 | 90.8% | 87.9 to 93.0 |
| SGLang | BF16 | 458/500 | 91.6% | 88.8 to 93.7 |
| SGLang | FP8 KV cache | 458/500 | 91.6% | 88.8 to 93.7 |

Every interval overlaps the BF16 interval, so this run did not show a difference. With 500 questions it cannot rule out a loss of a few points. It is one model and one benchmark. A model with a different attention layout can lose more.

**The backend trap on an L4**

The first FP8 start on our L4 failed. FlashAttention in vLLM 0.31.0 reads an FP8 cache only on Hopper and Blackwell data center GPUs, and the L4 is an Ada GPU, SM 8.9. So vLLM moved to FlashInfer, which builds its kernels on the first start, and that build failed on our node. The fix was `--attention-backend TRITON_ATTN`, which reads FP8 and needs no build, with `VLLM_USE_FLASHINFER_SAMPLER=0` for the same reason. Read the attention backend line after every change to the cache dtype.

**Check that your scales load**

1. Search the weight index of the checkpoint for tensor names that end in `k_scale` or `v_scale`. For a checkpoint with an index, no output means no scales. A checkpoint with one weight file has no index; for it, list the tensor names with the `safetensors` Python package.
2. Read the startup log for the scale warning. If the checkpoint has scales and the warning still prints, the loader dropped them. At 0.31.0 one model family never loads its KV scales, and the issue is open.
3. Run your own prompts with and without FP8 and compare the answers before you go to production.

The FP8 checkpoint of Qwen3-30B-A3B lists weight scales and no KV scales, so weight scales do not imply KV scales.

**The order of checks**

1. Is the pool the limit? Read the cache usage and the queue. If the pool has room, keep the model dtype.
2. Search the checkpoint for KV scales.
3. Start the server and read the backend line and the scale warning.
4. Run an accuracy check on your own task.
5. Measure speed at the same clock, and expect little change per token.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The pool has room and requests do not queue. Do you still switch? Expected: no; the cache dtype is a capacity decision, and with room in the pool it buys nothing and still carries the accuracy and backend risks.
- **Level 3:** The scale warning prints although the checkpoint has k_scale tensors. What does it mean? Expected: the loader dropped the scales; at 0.31.0 one model family never loads its KV scales and the issue is open, so the server runs with a scale of 1.0 until you change the checkpoint or the version.
- **Level 3:** Why did the first FP8 start fail on the L4 and not on a data center GPU? Expected: the default attention backend reads an FP8 cache only on Hopper and Blackwell data center GPUs, so vLLM fell back to a backend that compiles its kernels on the first start, and that build failed; the Triton backend reads FP8 and skips the build.
- **Level 4:** The GSM8K check gave 91.8 against 90.8 percent, and the two intervals overlap. What can you conclude? Expected: this run did not show a difference and cannot rule out a loss of a few points; it is one model and one benchmark, so run the same check on your model and task, and expect a model with another attention layout to lose more.

**Wrong answers, and why they fail**

- "FP8 KV halves memory, so it doubles throughput." It doubles the tokens that fit; in the field report it was a few percent slower per token at every load both caches could run, and won only because the BF16 cache ran out at 64 requests.
- "The checkpoint is FP8, so the KV scales are there." Weight scales and KV scales are different tensors; the FP8 checkpoint of Qwen3-30B-A3B lists weight scales and no k_scale or v_scale, so its cache ran with a scale of 1.0.
- "Accuracy is a property of the model, so test it once." The loss depends on the model, the attention layout and the task; one family that needs calibrated scales lost accuracy with a scale of 1.0 while most models stayed close to BF16 in the same tests.
- "The attention backend does not matter for a cache dtype." On the L4 the dtype change moved vLLM to another backend and the start failed; read the backend line after every change to the cache dtype.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## What many LoRA adapters cost one server

*Level 2 (working) · design · about 8 minutes*

You have twenty fine-tunes of one base model, each a LoRA adapter, and you want to serve them from one vLLM server. What do you set, what decides the cost, and what else in the server changes when LoRA is on?

:::answer Show the answer
:::say Short answer
Turn LoRA on at startup with `--enable-lora`, name the adapters with `--lora-modules`, and let each request pick one in its `model` field. Three limits set the cost: `--max-loras`, which defaults to 1 and caps the adapters that run in one batch, `--max-lora-rank`, which defaults to 16 and reserves memory for the largest rank, and `--max-cpu-loras` for adapters kept in CPU memory ready to load. LoRA also changes the prefix cache, because the adapter is part of every block key, so two adapters never share cached blocks, and it adds CUDA graphs per adapter, so startup takes longer and uses more memory.
:::

**Full answer**

**Start it**

```bash
vllm serve Qwen/Qwen3-8B \
  --enable-lora \
  --lora-modules support=/adapters/support legal=/adapters/legal \
  --max-loras 4 --max-lora-rank 64
```

Each path is a folder in the PEFT format that most training libraries write: `adapter_config.json` and the weights in `adapter_model.safetensors`, or `adapter_model.bin`. A request picks an adapter by its name in the `model` field, and `/v1/models` lists the base model and each adapter. Requests for different adapters can run in the same batch. The manual ran this with Qwen3-0.6B and two public adapters of rank 8 and rank 64, and a chat request to each adapter returned HTTP 200.

**Size the three limits**

| Flag | Default | What it limits |
|---|---|---|
| `--max-loras` | 1 | adapters that can run in one batch on the GPU |
| `--max-lora-rank` | 16 | the largest adapter rank the server accepts |
| `--max-cpu-loras` | not set | adapters kept in CPU memory, ready to load |

The default of one adapter per batch is low for a server with many adapters. Requests for a second adapter wait until the batch of the first adapter is done. Raise `--max-loras` to the number of adapters that are busy at the same time. Set `--max-lora-rank` to the largest rank of your adapters and not higher: the server reserves memory for the largest rank it accepts, and the documentation advises against a large default such as 256. Adapters in CPU memory load fast when a request names them, so size `--max-cpu-loras` for the adapters that are warm.

**Load adapters while the server runs**

With `VLLM_ALLOW_RUNTIME_LORA_UPDATING=True` you can post to `/v1/load_lora_adapter` with a name and a path, and to `/v1/unload_lora_adapter` to remove it. Turn this on only when you trust every caller of the server, because the route loads files from a path that the caller gives.

**What changes elsewhere**

- **The prefix cache.** The adapter is part of each block key in vLLM and of the tree key in SGLang. Two adapters never share cached blocks, even for the same prompt. A shared system prompt is cached once per adapter, not once.
- **CUDA graphs.** vLLM captures separate graphs for batches with an adapter. More adapters and more graph sizes add startup time and memory.
- **Names.** Since 0.31 an adapter cannot have the name of a served model.

The manual did not measure the cost of the adapter count or the rank on its hardware.

**Pick the base format with LoRA in mind**

The lesson's picking guide says that a 4-bit GPTQ base supports LoRA adapters in vLLM, with the fast Marlin kernels, while the microscaling 4-bit formats did not support LoRA at the start of 2026. For a base model plus many fine-tuned variants, GPTQ is the 4-bit path; AWQ is the pick when there is no LoRA, and FP8 when quality must not move.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Two tenants send the same long system prompt through two different adapters. Does the second request hit the cache? Expected: no; the adapter is part of the block key in vLLM and of the tree key in SGLang, so two adapters never share blocks even for identical tokens.
- **Level 3:** Requests for the second adapter wait although the GPU is idle. Why? Expected: the adapter cap defaults to 1, so only one adapter runs in a batch and requests for another adapter wait until that batch is done; raise it to the number of adapters that are busy at the same time.
- **Level 3:** Why not set the rank limit to 256 to be safe? Expected: the server reserves memory for the largest rank it accepts, so a high limit takes memory from the KV pool for adapters you do not have; set it to your largest rank.
- **Level 4:** You also want 4-bit weights for the base model. Which format, and what does it rule out? Expected: a GPTQ 4-bit base, because it supports LoRA adapters in vLLM with the Marlin kernels; the microscaling 4-bit formats did not support LoRA at the start of 2026, so they are out until they do.

**Wrong answers, and why they fail**

- "One server per adapter is simpler." Each server would hold its own copy of the base model and its own pool; one base with adapters per request shares both, and requests for different adapters can run in the same batch.
- "The default limits are fine." One adapter per batch makes requests for a second adapter wait, and a rank limit of 16 rejects a rank-64 adapter; set both from the adapters you serve.
- "Enable runtime adapter loading so that operators can add adapters without a restart." The load route reads files from a path that the caller gives, so turn it on only when you trust every caller of the server.
- "LoRA is free for the prefix cache because the base model is the same." The adapter changes the keys and values, so it is part of the block key, and two adapters never share cached blocks.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::
