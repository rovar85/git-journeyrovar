---
track: aibank
title: "AI interview bank: Inference and serving systems (part 2 of 3)"
short: Inference and serving  2
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Why one ID at the top of a prompt kills the cache

*Level 2 (working) · debug · about 8 minutes*

Every request to your service starts with the same long system prompt, and the prefix cache is on. The server reports almost no cached tokens, and the first token is slow. Last week a teammate added a request ID to the start of the system prompt for tracing. What happened, and what do you change?

:::answer Show the answer
:::say Short answer
The prefix cache matches a prompt from its first token and stops at the first token that differs. A new ID at the start makes every later token a miss, so the server computes the whole prompt again on each request. Move the parts that never change to the front and put the ID after them. Then prove the fix with the cached-token counters.
:::

**Full answer**

**Why the position matters**

The attention values of each token depend on every token before it. So a cache can reuse a token only when the whole prefix before it is the same. The SGLang radix tree compares tokens from the first one and stops at the first difference. vLLM does the same with blocks of 16 tokens. It caches only full blocks and stops at the first block that differs.

**What it costs**

The SGLang manual measured one system prompt of 2,999 tokens in three layouts:

| Layout | Median TTFT | Median cached tokens |
|---|---|---|
| The same prompt every time | 45.1 ms | 2998.0 |
| A random ID at the start | 1255.3 ms | 5 |
| The same ID at the end | 88.2 ms | 2985 |

With the ID at the start, only the 5 tokens before the random digits matched. The first token took 28 times longer. With the ID at the end, the cost was 43 ms.

**The fix**

1. Put the parts that never change first: the system prompt, the tool definitions and the fixed instructions.
2. Put the parts that change rarely next, such as the documents of one session.
3. Put the parts that change on every request last: the user question, the time and the request ID.
4. Send the trace ID in a header or a request field, not in the prompt text.

Check the chat template too. Some templates put the date into the system prompt.

**The proof**

On vLLM, read `vllm:prefix_cache_hits` and `vllm:prefix_cache_queries` from `/metrics`. The hits divided by the queries is the hit rate. On SGLang, start the server with `--enable-cache-report` and read `usage.prompt_tokens_details.cached_tokens` in each response. A good layout shows almost every prompt token as cached after the first request.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The hit rate is still low after the fix. What is the next cause to check? Expected: a full pool, because the cache keeps old blocks only until a running request needs the memory.
- **Level 2:** Where in a chat request does a change cost the least? Expected: in the newest message, because the template puts it last, so only that message is computed again.
- **Level 3:** Two tenants send the same system prompt. What is the risk, and what is the control in vLLM? Expected: one tenant can learn from timing what the other sent. Send a different `cache_salt` for each tenant, so that their requests never share blocks.
- **Level 3:** A team tunes the cache tiers and the eviction policy, and the hit rate does not move. What do you check first? Expected: the prompt text, for a value that changes on each request near the start, such as a random hash or a timestamp.

**Wrong answers, and why they fail**

- "Give the cache more memory." A bigger pool keeps more blocks, but a prompt that differs at the first tokens has no block to reuse.
- "The cache matches the longest shared part anywhere in the prompt." The cache matches only from the first token, so a shared part after a difference never hits.
- "Turn on hierarchical caching." A second tier stores more prefixes. It cannot match a prefix that is different on every request.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Why the KV cache is a pool of 16-token blocks

*Level 2 (working) · concept · about 8 minutes*

Explain how vLLM keeps the KV cache in GPU memory. Why does it not give each request its own buffer, how does it recognize a prompt it has seen before, and what happens when the memory runs out?

:::answer Show the answer
:::say Short answer
The KV cache is one pool of 16-token blocks, and a request takes blocks one at a time as it grows, mapped by a small block table. A buffer per request wastes memory twice: on length that the request never reaches, and on gaps between requests of different sizes. Each full block gets a hash that is chained with the hash of the block before it, so one hash names a whole prefix, and a new request walks its chain and stops at the first miss. When no block is free, the scheduler preempts the newest request and computes it again later.
:::

**Full answer**

**Blocks, not buffers**

At startup vLLM splits the cache into blocks of 16 tokens and keeps all of them in one pool. The blocks of a request do not need to be next to each other. A block table maps the token positions of the request to block numbers. The original paper called this PagedAttention, after the way an operating system pages memory.

The lesson gives the size of the waste that this removes. A classic allocator that reserves the full length for every request loses 60 to 80 percent of the memory to fragmentation. With blocks the waste stays under 4 percent. For a 70B model at 8192 tokens, one reserved sequence is about 1.25 GB in BF16, and a request that uses 1500 tokens wastes about 82 percent of it.

**The hash chain**

When a block fills, vLLM hashes its tokens together with the hash of the block before it. The chain means that one hash names a whole prefix, not only 16 tokens. The hash also covers the other inputs that change the keys and values: the LoRA adapter, the images in the prompt, and an optional salt for each request. A new request computes the same chain over its prompt and looks each hash up in a map. Every block before the first miss is a hit and needs no compute. Only full blocks are cached, so the tail of a prompt below 16 tokens is always computed.

Since version 0.11 the hash is SHA-256 by default. A faster hash exists, and the documentation warns that a collision could return the wrong blocks or leak data between tenants.

**Eviction**

A block that no request uses goes to a free list and keeps its hash. A later request with the same prefix can still use it. When vLLM needs a new block, it takes the head of the free list, the block unused the longest. Only then does the old content go away. So the cache is the pool: no separate cache memory exists, and a busy server keeps fewer old prefixes than an idle one.

**When memory runs out**

A running request needs a new block every 16 tokens. If none is free, the scheduler preempts a request. Under the default first-come policy it picks the newest running request, frees all of its blocks, and puts it back at the head of the waiting queue. When the request runs again, vLLM computes its tokens again from the start. Older versions could also copy blocks to CPU memory and back; the current engine only recomputes, because the documentation judges that cheaper. The cost shows as a longer time for the preempted request and in the `vllm:num_preemptions` counter.

**Hybrid models**

A model with sliding-window or state-space layers does not keep one entry per token in every layer. Each kind of layer gets its own group with its own page size and its own rule for a hit. The groups share one pool.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Every request starts with the same 25 tokens. How many of them come from the cache? Expected: 16, one full block; the last 9 tokens are computed on every request because only full blocks are cached.
- **Level 3:** Two tenants send the same system prompt. What can one learn about the other, and what field stops it? Expected: they share blocks, so the timing of one tenant can reveal what the other sent; a cache_salt per tenant goes into the hash, so the two never share a block.
- **Level 4:** Under the default policy, which request does vLLM preempt when no block is free, and what does it cost? Expected: the newest running request; all of its blocks are freed, it goes to the head of the waiting queue, and its tokens are computed again from the start, which the preemption counter records.

**Wrong answers, and why they fail**

- "vLLM swaps preempted requests to CPU memory." Older versions could; the current engine only recomputes, because the documentation judges the recompute cheaper, and the cost shows in the time of that request and in the preemption counter.
- "The prefix cache has its own memory budget." The cache is the pool; a freed block keeps its hash on the free list until a new block is needed, so a busy server keeps fewer old prefixes than an idle one.
- "A block hash covers only its own 16 tokens." It is chained with the hash of the block before it, so one hash names a whole prefix, and it also covers the adapter, the images and the salt.

**Related lesson in this course:** [Serving engines: batching, PagedAttention, vLLM, Triton and friends](#aiinfra-4)

:::

## Why the shared part of the prompt goes first

*Level 2 (working) · concept · about 8 minutes*

Every request to your chat service repeats the same long system prompt, and the engine has prefix caching on by default. What decides whether the next request reuses the work of the last one? How would you lay out the prompt, and how do you show a hit with a number instead of a guess?

:::answer Show the answer
:::say Short answer
The cache matches tokens from the first one onward and stops at the first difference, so a hit needs the same tokens in the same order at the start of the prompt. Put the parts that never change first, the parts that change per session next, and the question, the time and any request ID last. Prove the hit from the server: the `cached_tokens` field in the usage block, the `#cached-token` count in the prefill log line, or the prefix cache counters in `/metrics`.
:::

**Full answer**

**What a hit saves**

On our L4 with Qwen/Qwen3-8B, vLLM 0.31.0 ran 4 groups of 16 prompts at 8 users. The prompts in a group shared a system prompt of the length in the table, then added a 128-token question and asked for 64 tokens back.

| Shared prompt tokens | Median TTFT, cache on | Median TTFT, cache off |
|---|---|---|
| none | 408 ms | 392 ms |
| 256 | 488 ms | 753 ms |
| 1,024 | 396 ms | 1,213 ms |
| 2,048 | 410 ms | 2,550 ms |
| 4,096 | 375 ms | 13,353 ms |

With the cache on, the first token took about 400 ms at every length. Without it, the first token grew with the shared part, because every request computed the whole prompt again. The 1,024 row is the cleanest comparison, because both runs held 1,410 MHz or more; there the cache cut the first token about 3 times and gave 50 percent more output. SGLang on the same card gave the same shape: 479 ms against 14,706 ms at 4,096 shared tokens, with the cache-off run throttled to 930 MHz.

**Why the order decides**

The attention values of every token depend on every earlier token. A cache that reused tokens after a change would return wrong answers, so prefix caching is exact by design and unforgiving by the same design. In vLLM the match runs one 16-token block at a time and only full blocks are cached: a shared part of 20 tokens gives one cached block, and the last 4 tokens are computed every time. In SGLang the radix tree matches token by token, and the last prompt token always goes through prefill, because the model needs its logits to sample the first output token. A 2,999-token prompt reported 2,998 cached tokens.

**The order**

1. The parts that never change: the system prompt, the tool definitions in a fixed order, the fixed instructions.
2. The parts that change rarely: the documents of one session, the earlier turns, sent unchanged.
3. The parts that change on every request: the user question, the time, the request ID.

Check the chat template too. Some templates put the date into the system prompt. A JSON object whose keys change order is a different token sequence.

**Prove the hit**

- vLLM: `vllm:prefix_cache_hits_total` divided by `vllm:prefix_cache_queries_total` from `/metrics`, and the log line that prints `Prefix cache hit rate`, which read 87.2 percent in the middle of the shared-prefix run.
- SGLang: start with `--enable-cache-report` and read `cached_tokens` in the usage block, read `#cached-token` and `#new-token` in every `Prefill batch` line, or read the `sglang:cache_hit_rate` gauge, which read 0.94 after the shared-prefix benchmark and 0.0 with the cache off.

If the hit rate is low, the prompt order is almost always the cause. A full pool is the next cause, because the cache keeps old blocks only until a running request needs the memory. Routing is the third: with several servers, a request that lands on a server without its prefix misses whatever the prompt looks like, and one report moved its hit rate from 64.7 to 92.1 percent by routing each conversation to the same server.

**Keep tenants apart**

Two users with the same prefix share blocks, and the timing of one can reveal what the other sent. A `cache_salt` field per tenant goes into the block key, so different salts never share. The LoRA adapter is part of the key too.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** On vLLM every request starts with the same 20 tokens. How many come from the cache? Expected: 16, one full block; the last 4 are computed each time because only full blocks are cached.
- **Level 3:** The prompt is stable, one server hits well, and the fleet still misses. Name two causes outside the prompt. Expected: a full pool that drops blocks before the next request arrives, and a router that sends a session to a server which never saw its prefix; sticky routing moved one report from 64.7 to 92.1 percent.
- **Level 3:** Why does SGLang report 2,998 cached tokens for a 2,999-token prompt and never 2,999? Expected: the last prompt token always goes through prefill, because the model needs its logits to sample the first output token.
- **Level 4:** A client writes a task-list snapshot at the end of the system prompt and updates it on every turn. What does the tree do? Expected: every update changes the system prompt, so every token after it misses, including the whole history behind it; in the manual's incident that invalidated more than 100,000 tokens per turn, and the fix is to move the snapshot behind the history or into request metadata.

**Wrong answers, and why they fail**

- "The cache is on, so repeated prompts hit it." The match is exact from the first token; a timestamp, a request ID or a reordered tool list near the start makes every later block miss, and one random ID at the start matched only 5 tokens of a 3,034-token prompt.
- "Put the user question first so the model reads it first." The question changes on every request, so the shared system prompt behind it never matches; put the fixed part first and the question last.
- "Turn the cache off for a fair benchmark." The cache is on in production, so the test must reset it between runs, not remove it; with it off the first token at 4,096 shared tokens took 13,353 ms on vLLM and 14,706 ms on SGLang.
- "Measure the hit rate from the response time of the client." Read it from the server, in the usage block, the prefill line or the counters; a faster second response can also come from a warmer GPU.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## A larger token budget at low load

*Level 3 (senior) · tradeoff · about 10 minutes*

A teammate proposes `--max-num-batched-tokens 16384` so that long prompts get their first token sooner. The server runs a model with mixture-of-experts layers on one card. Requests arrive at about half a request per second, with prompts between 1,024 and 4,096 tokens. What do you expect to change, and what would you measure before you accept the change?

:::answer Show the answer
:::say Short answer
A larger budget lets a long prompt finish its prefill in fewer steps, but each of those steps takes longer, and every running stream waits for it. At low load I expect a faster first token and a worse P99 ITL, and I would measure both with several seeds at the real request rate. On our GB10 at 0.5 requests per second, 16,384 raised the P99 ITL from 574 to 798 ms, while the first-token gain did not clear the seed spread.
:::

**Full answer**

**What the manual measured**

Budgets of 2,048 and 16,384 tokens on the GB10 with Qwen3-30B-A3B, requests at a fixed rate, three seeds per point, each request asking for 64 to 256 tokens:

| Requests per second | Budget | Median TTFT | Median TPOT | P99 ITL |
|---|---|---|---|---|
| 0.5 | 2,048 | 1,145 ms | 149.3 ms | 574 ms |
| 0.5 | 16,384 | 906 ms | 139.4 ms | 798 ms |
| 1 | 2,048 | 454 ms | 156.5 ms | 405 ms |
| 1 | 16,384 | 477 ms | 156.9 ms | 395 ms |
| 2 | 2,048 | 560 ms | 205.5 ms | 587 ms |
| 2 | 16,384 | 595 ms | 205.1 ms | 586 ms |

At 0.5 requests per second the larger budget raised the P99 ITL by 39 percent, and the seed ranges did not overlap. The first token came sooner, but the seed ranges of the first token overlapped. So the cost is clear and the gain is not confirmed. At 1 and 2 requests per second the two budgets gave the same numbers within the seed ranges. All runs held a median clock of 2,398 to 2,411 MHz, so the clock does not explain any row.

**Why the effect fades with the rate**

At a higher rate more requests share each step. One long prompt then fills a smaller share of the budget, and how it is chunked matters less. The result is narrow: two budgets, three low rates, one model, one machine. The P-PAS paper found that no single fixed budget was best at every load: a large budget won at low prefill pressure, a small one when several prefills competed with running streams.

**An open result**

The median first token at 0.5 requests per second was slower than at 1 request per second for both budgets. All three seeds at 0.5 were above 900 ms with the 2,048 budget, and all three at 1 were below 600 ms. One slow seed does not explain it. The manual did not find the cause and says so.

**How to decide**

1. Read the budget that your server uses. The run with no flag matched 2,048 on this machine.
2. If the P99 ITL is too high and long prompts arrive, lower the budget.
3. If the first token of long prompts is too slow and the P99 ITL has room, raise it.
4. Measure at your real request rate, and again when your load changes.

`--long-prefill-token-threshold` caps the tokens that one long prompt gets in a step when other requests wait. It is off by default and the manual did not test it.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** At the two higher rates the budgets tied. Why does the difference vanish as the rate rises? Expected: more requests share each step, so one long prompt fills a smaller share of the budget and its chunking matters less.
- **Level 3:** Both budgets gave a later first token at the lowest rate than at the next rate up. How do you report that? Expected: all three seeds agreed, so it is not one slow seed; the cause was not found, so it stays an open result and no rule is built on it.
- **Level 4:** Is there one budget that wins at every load? Expected: no; a large budget wins when prefill pressure is low and a small one when several prefills compete with streams, so the value must move with the load.

**Wrong answers, and why they fail**

- "A larger budget is free because the GPU has spare compute at low load." Each step with a bigger chunk takes longer and every running stream waits for it; the P99 ITL rose 39 percent at 0.5 requests per second.
- "Set the budget once from the GPU size and leave it." The best value moved with the request rate in these runs, so measure at your real rate and again when the load changes.
- "The drop from 1,145 to 906 ms proves the first-token gain." The seed ranges of the first token overlapped, so the cost is confirmed and the gain is not.

**Related lesson in this course:** [Measuring inference: TTFT, ITL, throughput and bottlenecks](#aiinfra-3)

:::

## Acceptance by draft position, tokens per pass

*Level 3 (senior) · estimate · about 8 minutes*

A vLLM server runs Qwen/Qwen3-8B with an EAGLE3 draft of depth 3. Over a run of answers near 2,000 tokens at 8 users, the counters show that the draft at position one was accepted with probability 0.77, position two with 0.54, and position three with 0.38. Estimate the mean number of tokens that one verify pass commits, and say what you would check before you rely on that gain for long answers.

:::answer Show the answer
:::say Short answer
Each verify pass commits the accepted drafts plus one bonus token from the target, so the mean acceptance length is one plus the sum of the per-position acceptance rates. With 0.77, 0.54 and 0.38 that is about 2.69 tokens per pass, which is the value vLLM reported on GSM8K in that run. Before I trust it on long answers I would read the acceptance of the longest answers alone, with real output lengths and without ignore-eos, because another study saw the acceptance fall from about 3.7 to about 1.5 on answers that ran toward 20,000 tokens.
:::

**Full answer**

**The arithmetic**

The per-position rates already include the order of the chain: position two can only be accepted when position one was, and 0.54 is the share of all passes in which position two was accepted. The expected number of accepted drafts is the sum of the rates, and the target always adds one token of its own, so:

```text
mean acceptance length = 1 + 0.77 + 0.54 + 0.38 = 2.69
```

On ShareGPT the same run gave 0.67, 0.42 and 0.26, which is 2.35. Both match the mean acceptance length that vLLM reported from its counters.

**What the manual measured on long answers**

Qwen/Qwen3-8B in BF16 at 8 users, answers up to 2,048 tokens, no ignore-eos, median answer 1,800 to 2,000 tokens:

| Engine | Dataset | Mean acceptance length | Accepted per draft position 1 / 2 / 3 |
|---|---|---|---|
| SGLang EAGLE3 | GSM8K | 2.68 | |
| SGLang EAGLE3 | ShareGPT | 2.32 | |
| vLLM EAGLE3 | GSM8K | 2.69 | 0.77 / 0.54 / 0.38 |
| vLLM EAGLE3 | ShareGPT | 2.35 | 0.67 / 0.42 / 0.26 |

On short 128-token answers in the same session, SGLang gave 2.69 to 2.78 on GSM8K and 2.33 to 2.43 on ShareGPT. Its long answers stayed within 0.01 of those ranges.

**By position inside the answer**

A second test ran 8 prompts with thinking on, greedy, at one user, up to 4,096 tokens, and read the acceptance in segments:

| Segment of the output | SGLang | vLLM |
|---|---|---|
| 0 to 256 | 2.05 to 2.64 (8) | 2.14 to 2.51 (8) |
| 256 to 512 | 1.95 to 2.64 (8) | 2.09 to 2.55 (8) |
| 512 to 1,024 | 2.11 to 2.77 (8) | 2.12 to 2.79 (8) |
| 1,024 to 2,048 | 2.09 to 2.47 (5) | 1.72 to 2.66 (5) |
| 2,048 to 4,096 | 2.33 and 2.48 (2) | 2.35 and 2.60 (2) |

Up to 4,096 tokens the acceptance did not fall steadily. Only 2 of the 8 prompts ran past 2,048 tokens, so the last segment rests on two answers, and the limit of 4,096 came from the memory on that GPU. So the test did not reach the range of the study that saw the fall.

**When acceptance does fall**

One incident shows a different cause. A draft config with 2,048 positions and no rope scaling accepted 3.2 tokens at 1k input tokens, 1.6 at 3k and 1.2 at 10k. At 10k the server produced 63.9 tokens per second against 102.7 without speculation. The draft could not read past its position limit. Adding the rope scaling and 131,072 positions to the draft config fixed it. The override variable that skips the context check removes the check and does not teach the draft to read long prompts.

**What to read**

- vLLM: `spec_decode_num_draft_tokens` and `spec_decode_num_accepted_tokens` from `/metrics`, and the `SpecDecoding metrics` line in the log.
- SGLang: `accept len` and `accept rate` on each decode log line, `sglang:spec_accept_length` from `/metrics`, and `spec_accept_length` in the `meta_info` of each `/generate` response, which gives you the value per answer.
- Compare the P99 ITL and the P99 TTFT with and without the draft, and compare `max_position_embeddings` of the draft with your longest prompts.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the bonus token always there? Expected: the target computes a distribution one position past the last accepted draft, so even when every draft is rejected the pass still writes one token of its own, as plain decoding would.
- **Level 3:** The ShareGPT rates were 0.67, 0.42 and 0.26. What length do you get, and why is it below GSM8K? Expected: 2.35; open chat is harder for the draft to predict than math steps and code, so fewer drafts match the target.
- **Level 4:** Acceptance was 3.2 at 1k input tokens and 1.2 at 10k on a draft with 2,048 positions. Cause and fix? Expected: the draft could not read past its position limit, so its guesses degrade with the prompt length; the rope scaling and the longer position count in the draft config fixed it, and the override variable only removes the check.

**Wrong answers, and why they fail**

- "The mean acceptance length is the mean of the three rates." It is the expected count of accepted drafts, the sum of the rates, plus the bonus token; 0.77 plus 0.54 plus 0.38 plus one is 2.69, not a value below one.
- "An acceptance length of 2.69 means 2.69 times the speed." Each pass also pays the draft steps and the check; on the L4 the dense model gave each token 1.6 to 2.3 times faster and no more output from 32 users, because the draft took pool space.
- "A long answer keeps the acceptance of a short one." In the manual's own test to 4,096 tokens it did, but another study saw it fall from about 3.7 to about 1.5 toward 20,000 tokens, and a draft with too few positions fell from 3.2 to 1.2 with the prompt length; read your own long answers.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## An admission cap decides who waits

*Level 3 (senior) · tradeoff · about 10 minutes*

At 32 concurrent users your L4 chat service streams badly: the P99 inter-token gap is 613 ms, and your target is 100 ms or less per token with a first token within 1 second. A teammate proposes `--max-num-seqs 16` so that each step holds fewer requests. What do you expect, and what does the measurement say?

:::answer Show the answer
:::say Short answer
A cap does not make room for more users; it only chooses who waits. With the cap at 16 and 32 users, each stream got a little smoother, a median ITL of 69.8 against 80.5 ms and a P99 ITL of 595 against 613, but half the users waited in the queue, the median first token went from 1.8 to 12.3 s, and output fell 38 percent to 171.8 tokens per second. At 64 users no cap that the manual tried brought the P99 ITL under 1.1 s, so the fix on this card is fewer users per replica, not a cap.
:::

**Full answer**

**Where the stream broke**

Qwen/Qwen3-8B on the L4 in the full-clock session, 512 prompt tokens and 128 output tokens, three seeds:

| Users | Output tok/s | Median TTFT | P99 ITL | Met the target | Median SM clock |
|---|---|---|---|---|---|
| 8 | 112.8 | 0.25 s | 67 ms | 75% | 1,485 MHz |
| 16 | 201.3 | 0.29 s | 85 ms | 64% | 1,455 MHz |
| 32 | 275.1 | 1.80 s | 613 ms | 0% | 1,275 MHz |
| 64 | 242.3 | 11.18 s | 1,233 ms | 0% | 1,005 MHz |

This sweep did not reset the prefix cache, so the rows below 32 users read too well; with a reset the share that met the target at 16 users fell to 25 percent and the P99 ITL there was 522 ms. Each step on this GPU has a budget of 2,048 tokens, and new prompt chunks share the step with the running streams, so the streams pause.

**The cap at 32 users**

| Config | Output tok/s | Median TTFT | Median ITL | P99 ITL | Median SM clock |
|---|---|---|---|---|---|
| default, 256 | 275.1 | 1.8 s | 80.5 ms | 613 ms | 1,275 MHz |
| `--max-num-seqs 16` | 171.8 | 12.3 s | 69.8 ms | 595 ms | 1,365 MHz |

The cap run had the higher clock, so the clock does not explain the loss. The stream got a little smoother, half the users waited for their first token, and output fell by 38 percent.

**Caps at 64 users**

With the clock locked at 900 MHz, two seeds and a reset per run, against SGLang on the same card:

| Config | Median TTFT | P99 ITL | Output tok/s |
|---|---|---|---|
| SGLang default | 19.4 s | 143 to 153 ms | 225 to 231 |
| vLLM default | 11.8 s | 1,359 ms | 220 |
| `--max-num-seqs 32` | 17.2 to 20.6 s | 1,163 to 1,399 ms | 196 to 230 |
| `--max-num-active-seqs 48` | 11.8 s | 1,329 to 1,373 ms | 215 to 218 |
| `--max-num-active-seqs 16` | 44.8 to 48.8 s | 1,133 to 1,139 ms | 129 to 136 |

No cap brought the vLLM P99 ITL near the SGLang value. At 16 or 32 running requests the P99 ITL stayed above 1.1 s and the first token waited 17 to 65 s. On this card a cap does not fix the long gaps at 64 users. Fewer users per replica does.

**The small pool is the other queue**

A pool of 6,560 tokens against 24,096 at 32 users gave a median time to first token of 31.6 s against 3.1 s and a P99 first token of 48.0 against 7.1 s. A request of 640 tokens needs 640 tokens of pool by its end, so about 10 requests fit in the small pool and the other 22 waited for a running request to finish. The small-pool run also fell to 248 MHz, but a clock 3.6 times lower cannot explain a first token 10 times later; the queue did.

**How SGLang admits, and why a queue is the honest failure**

SGLang admits a request only when a forecast fits the pool. A new request must fit its uncached prompt tokens plus its remaining `max_new_tokens`, clipped to 4,096. Each running request holds back its remaining `max_new_tokens` times a ratio that starts at 0.7 and falls to 0.098 over 600 decode steps, because most requests stop early. When the forecast is too bold, the scheduler retracts running requests to the queue and they prefill again. In a small pool of 4,096 tokens with 16 users asking for 512 tokens each, exactly five requests ran at a time: each token took 24 ms once a request started, and the median user waited 27.9 s for the first token. Every request succeeded. A long queue with fast tokens is admission control doing its job; a retraction is the alarm, and more than about one per minute is a configuration bug. Set realistic `max_new_tokens` in clients: a client that asks for 4,096 tokens and uses 200 makes the reservation of every new request about 20 times too big.

**What to do**

1. Set the targets for the first token and the time per token.
2. Sweep users with a reset per run, and find the last count that meets both.
3. If the cache usage is near full and requests wait, the pool is too small: add room with an FP8 cache or FP8 weights.
4. If the pool has room and the P99 ITL is too high, the GPU is full: add a GPU or a replica, and enforce the knee in the client or the gateway.
5. Read the P99 ITL when you pick an engine for chat. On the GB10 the two engines gave the same output at 32 and 64 users, and the vLLM P99 ITL was 478 against 220 ms at 32 users.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The cap run had a higher clock than the default run. Why does that matter for the conclusion? Expected: a higher clock should help the cap run, so the clock does not explain its 38 percent lower output; the loss belongs to the cap.
- **Level 3:** How does SGLang decide to admit a request, and what happens when its forecast is wrong? Expected: a new request must fit its uncached prompt plus its remaining max_new_tokens, and running requests hold back their remaining output times a ratio that starts at 0.7 and falls to 0.098 over 600 decode steps; when the forecast is too bold the scheduler retracts running requests to the queue and they prefill again.
- **Level 4:** The pool has room, the tail gap is still over target, and a cap only moves the wait. What is left? Expected: the GPU is full; add a GPU or a replica and put fewer users on each, enforce the knee in the client or the gateway, and read the P99 ITL when you pick an engine, because at the same output the two engines differed about twofold on the GB10.

**Wrong answers, and why they fail**

- "A cap on running requests makes room for more users." It only chooses who waits; at 32 users the cap of 16 moved the wait into the queue, with the first token at 12.3 s, and cost 38 percent of the output.
- "Lower the maximum model length to help the queue." The pool stays the same size, so it does not help when the cache usage is near full; add room with an FP8 cache or FP8 weights.
- "Clients should ask for a large max_new_tokens to be safe." The admission forecast reserves it; a client that asks for 4,096 tokens and uses 200 makes the reservation of every new request about 20 times too big, so fewer requests are admitted.
- "A queue means the server is broken." A long queue with fast tokens is admission control doing its job; the five admitted requests in the small-pool run got 24 ms per token while the median user waited 27.9 s, and a retraction, not a queue, is the alarm.

**Related lesson in this course:** [Measuring inference: TTFT, ITL, throughput and bottlenecks](#aiinfra-3)

:::

## Pick a concurrency cap when throughput keeps rising

*Level 3 (senior) · tradeoff · about 12 minutes*

You serve a chat model on one GPU. A load sweep shows output throughput that still rises at a cap of 64 concurrent requests, so the team wants to set the cap to 64. The product needs the first token in under one second and a steady stream of text after it. Which cap do you pick, and how do you defend it?

:::answer Show the answer
:::say Short answer
Pick the cap from goodput, not from throughput. Goodput counts only the requests that meet every latency target, so it falls to zero long before throughput stops rising. On the sweep in the SGLang manual, BF16 goodput was highest at a cap of 4 and was 0 from a cap of 8. Use the throughput curve only to explain the choice.
:::

**Full answer**

**Why throughput hides the knee**

A large KV pool lets the server admit more requests. On the GB10 in the manual, the pool held 234,600 tokens, so BF16 throughput still rose at a cap of 64. More admitted requests share each decode step, so each request gets fewer tokens per second. Throughput measures the server. Latency measures the user.

**Define the target first**

The manual counts a request as good when its first token comes in under 1 s and its mean time per token is under 100 ms. Write the target down before the sweep. A goodput number without its target means nothing.

**Read the sweep**

| Cap | BF16 goodput | BF16 median TPOT | FP8 goodput | FP8 median TPOT |
|---|---|---|---|---|
| 4 | 0.44 req/s | 71.01 ms | 0.80 req/s | 38.60 ms |
| 8 | 0 | 102.21 ms | 1.07 req/s | 54.96 ms |
| 16 | 0 | 154.24 ms | 1.10 req/s | 81.90 ms |
| 32 | 0 | 201.91 ms | 0 | 104.12 ms |

At a cap of 8, the median BF16 request already takes more than 100 ms per token. Throughput at that cap is 74.11 tok/s and still rising. FP8 holds the target up to a cap of 16. So the answer depends on the build: about 4 for BF16 and about 16 for FP8 on this machine.

**Defend it**

- Run three seeds per point and show the band, so that a reviewer can see the gaps are real.
- Reset the prefix cache before each run. A warm cache makes the first token look fast.
- A cap is a closed loop. Real users arrive on their own clock, so also run an open-loop sweep with a request rate and check goodput there.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What is the difference between throughput and goodput? Expected: throughput counts all tokens or requests per second; goodput counts only the requests that met every latency target.
- **Level 3:** Why can a closed-loop cap never show a growing queue? Expected: each client waits for its answer before it sends the next request, so the server never receives more work than it finishes.
- **Level 3:** FP8 holds the target at a cap of 16 and BF16 does not. What do you check before you switch the build? Expected: output quality on your own eval, and the KV pool size, because FP8 frees memory for a larger pool.
- **Level 4:** The GPU gets hot at high load. How does that change your sweep? Expected: record the GPU clock and the thermal state with every run, and let the GPU cool to a fixed temperature before each run.

**Wrong answers, and why they fail**

- "Set the cap where throughput peaks." The throughput curve had no peak inside the sweep, and every BF16 request missed the target from a cap of 8.
- "Use the median TTFT alone." A median can hide a slow half of the requests, and the time per token can fail while the first token is fast.
- "Report goodput from one run." One run can be wrong for reasons you never see, so use three seeds and report the range.

**Related lesson in this course:** [Roadmap, a benchmarking harness and a reference architecture](#aiinfra-10)

:::

## Pick the EAGLE3 draft depth for your concurrency

*Level 3 (senior) · tradeoff · about 10 minutes*

You turn on an EAGLE3 draft for Qwen/Qwen3-8B on one L4 and must set `num_speculative_tokens`. The draft config suggests a value, but you want to set it yourself. How do you choose, and how does the right value move with the number of users?

:::answer Show the answer
:::say Short answer
Set the depth yourself and sweep it at your real concurrency, because the depth that pays falls as more users share each step. On our clock-locked L4 at 32 users, depth 3 gave 333.6 output tokens per second against 208.8 with no speculation, and depth 5 fell back to 289.5, so the extra guesses cost more than they returned. At one user depths 3 and 5 tied, so start at 3 and move only on a measurement.
:::

**Full answer**

**Why the depth matters**

A deeper draft can give more tokens for each pass of the target, but each guess also costs work in the check. With one user the GPU has spare compute in each step, so extra guesses are almost free. With many users each step is already full, and wrong guesses take compute from real tokens.

**The sweep**

Depths 1, 3 and 5 against no speculation, with the clock locked at 900 MHz, 512 tokens in and 128 out, two seeds each:

| Users | Config | Median TPOT | Output tok/s | Median SM clock |
|---|---|---|---|---|
| 32 | no speculation | 119.9 ms | 208.8 | 881 MHz |
| 32 | depth 1 | 100.4 ms | 271.1 | 900 MHz |
| 32 | depth 3 | 77.8 ms | 333.6 | 900 MHz |
| 32 | depth 5 | 83.7 ms | 289.5 | 885 MHz |
| 1 | depth 1 | 39.4 ms | 22.4 | 900 MHz |
| 1 | depth 3 | 27.8 ms | 31.3 | 900 MHz |
| 1 | depth 5 | 26.2 ms | 31.7 | 900 MHz |

At 32 users depth 3 gave 1.6 times the output of no speculation, and its seed range did not overlap with any other config. At one user depth 3 cut the time per token from 39.4 to 27.8 ms against depth 1, and depth 5 was the same within the seeds. The run with no speculation at one user fell to 210 MHz, below the lock, so the manual does not compare it.

**The stream gets lumpier**

The median TPOT fell, but the gaps between token groups grew. At 32 users the median ITL rose from 84 ms with no speculation to 133 ms at depth 3. Each step now sends several tokens at once, so the stream arrives in larger and less frequent groups.

**The limits of the result**

The gain holds for random prompts and outputs of 128 tokens. Other teams found that synthetic prompts overstate the gain on real prompts and that the best depth changes with the batch size. One study saw the acceptance length fall from about 3.7 to about 1.5 on answers that ran toward 20,000 tokens. The manual's own test up to 4,096 tokens did not see a steady fall; the acceptance stayed near 2.1 to 2.8 tokens per step. So test on your own long answers before you trust the gain.

**Lock the clock before you compare**

The first EAGLE3 runs had no lock. At one user the run with no speculation ran at 210 MHz and the EAGLE3 run at about 1,400 MHz. A gap that large hides the effect of speculation, so those runs were set aside. Lock the SM clock with the driver tool before a comparison and release it after, and compare two runs only at the same clock.

**Choose**

- Start at 3 for Qwen3-8B with this draft. It gave the best output at 32 users and tied at one.
- For a busy server, sweep the depth on your own model; depth 5 lost output at 32 users here.
- If the load changes a lot through the day, vLLM can set the depth by batch size with `num_speculative_tokens_per_batch_size`. The manual did not test it.
- Read the two counters, `spec_decode_num_draft_tokens` and `spec_decode_num_accepted_tokens`, and divide; read the P99 ITL and the P99 TTFT, not only the median.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did depth 5 lose to depth 3 at 32 users but tie at one user? Expected: at one user the step has spare compute, so two more guesses are nearly free; at 32 users the step is full, and each rejected guess takes compute from real tokens.
- **Level 3:** The median time per token fell and users still said the stream felt uneven. Why? Expected: each step now sends several tokens at once, so tokens arrive in larger and less frequent groups; the median ITL rose from 84 to 133 ms at depth 3 with 32 users.
- **Level 4:** Your load swings from 2 users at night to 32 by day. What do you set? Expected: sweep the depth at both loads, because the depth that pays falls with the batch; vLLM can set the depth per batch size, which the manual did not test, so measure before you trust it.

**Wrong answers, and why they fail**

- "Deeper is better, because more guesses mean more tokens per step." At 32 users depth 5 gave 289.5 tokens per second against 333.6 at depth 3; the extra guesses cost more compute than they returned.
- "Leave the depth out and let the draft config decide." Then you do not know what runs; set it yourself so that the number in the command is the number you measured.
- "Compare speculation with the baseline at one user and ship the ratio." The one-user baseline ran at 210 MHz while the EAGLE3 run ran near 1,400 MHz, so the ratio measured the clock; compare at the same clock and at the concurrency you serve.
- "The gain on the random dataset transfers to chat." Synthetic prompts overstate the gain and the acceptance can fall on long answers; measure the acceptance on your own traffic with real output lengths and without ignore-eos.

:::

## Should the prefill chunk be smaller

*Level 3 (senior) · tradeoff · about 10 minutes*

Long prompts make the stream pause for the other users of your SGLang server. A tuning page says to lower `--chunked-prefill-size`, so that decode steps run more often between the pieces of a long prompt. Would you follow it? What did the manual find when it tried, and what would you try instead?

:::answer Show the answer
:::say Short answer
Not without a measurement, because the small chunk did not help on either card in the manual's runs. On the GB10 at a low arrival rate a chunk of 1,024 made the P99 ITL worse, 1,977 against 929 ms with the default of 8,192, and at higher rates all chunk sizes tied. I would first try `--enable-mixed-chunk`, which puts the decode tokens into the prefill batch, and measure its trade: on the GB10 it cut the P99 ITL by 15 to 19 percent and at 1 and 2 requests per second it raised the median first token by 49 to 74 percent.
:::

**Full answer**

**The rule behind the advice**

The scheduler runs a prefill batch whenever it can admit something, and otherwise one decode step. Chunked prefill splits a long prompt into pieces of at most the chunk size, one piece per prefill batch. The default depends on GPU memory: 4,096 on a 22 GB L4 and 8,192 on the GB10. The advice assumes that more pieces give the decode steps more turns.

**What the manual measured**

Each run sent 48 prompts of 1,024 to 4,096 tokens with 256 tokens of output, at a Poisson rate of 0.5, 1 or 2 per second, three seeds:

| GPU, model | Chunk | Rate per second | Output tok/s | Median TTFT | P99 ITL |
|---|---|---|---|---|---|
| GB10, Qwen3-30B-A3B | 8,192 | 0.5 | 70.1 | 892 ms | 929 ms |
| GB10, Qwen3-30B-A3B | 1,024 | 0.5 | 68.1 | 1,253 ms | 1,977 ms |
| GB10, Qwen3-30B-A3B | 8,192 | 2 | 129.3 | 269 ms | 312 ms |
| GB10, Qwen3-30B-A3B | 1,024 | 2 | 130.1 | 256 ms | 260 ms |
| L4, Qwen3-8B | 4,096 | 0.5 | 44.1 | 36.0 s | 2,579 ms |
| L4, Qwen3-8B | 1,024 | 0.5 | 43.3 | 37.4 s | 2,922 ms |

At 1 and 2 per second on the GB10 the sizes were inside the seed spread of each other. At 0.5 per second the small chunk lost, and the seed ranges did not overlap. On the L4 the workload was more than the card could serve at any rate: output stayed near 44 tokens per second, the first token took 36 to 62 seconds, and the worst gap stayed between 2.5 and 2.9 s with either chunk.

**Why the small chunk lost on a mixture-of-experts model**

Each chunk of a prompt loads the chosen expert weights again. A 2025 study of chunked prefill on such models measured up to 39 percent more memory traffic from the extra loads. With a chunk of 1,024 a 4,096-token prompt runs as up to four chunks, and each reads the experts again. The manual did not measure the expert traffic, so this is a reading and not a result.

**Why nothing helped on the L4**

Prefill wins whenever the scheduler can admit something. With a full queue, a smaller chunk only adds more prefill turns ahead of the decode steps, and the stream still waits. The manual expects the fix to be more prefill capacity or fewer long prompts per second, and did not test it.

**The mixed chunk**

`--enable-mixed-chunk` puts the decode tokens into the prefill batch, so a decode step does not wait for a prefill turn. On the GB10, against a default run of the same day:

| Rate per second | P99 ITL, default / mixed | Median TTFT, default / mixed | Output tok/s, default / mixed |
|---|---|---|---|
| 0.5 | 922 / 781 ms | 841 / 910 ms | 70.9 / 72.1 |
| 1 | 219 / 177 ms | 244 / 362 ms | 108.8 / 112.6 |
| 2 | 261 / 221 ms | 238 / 416 ms | 133.2 / 138.1 |

A smoother stream and a slower first token. The P99 ITL fell by 15 to 19 percent, outside the seed spread at 0.5 and 2 per second. The median TTFT rose by 49 to 74 percent at 1 and 2 per second, outside the spread. On the L4 the flag changed the P99 ITL by 5 to 8 percent, inside the spread, because the queue set the pace. The card decided whether you get the trade.

**The other direction fails at startup**

With a chunk of 8,192 on the L4 the server exited during graph capture. The pool took the same 24,094 tokens as before, and the prefill graph for 8,192 tokens needed more than the 2.33 GB that remained. The last log line is a PyTorch internal assert that asks for a bug report. The real error is the out-of-memory line two lines above it.

**The same trade in vLLM**

vLLM has no separate chunk size. Its token budget plays the same role, and at low load a budget of 16,384 raised the P99 ITL by 39 percent against 2,048 on the GB10. Both engines trade the first token of long prompts against the gaps in the stream, and the best value moves with the load.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why would a small chunk cost more when the model routes each token to a few experts than on a dense model? Expected: each chunk reads the chosen expert weights again, so four chunks can read the experts four times; a dense model reads the same weights once per step either way.
- **Level 3:** On the L4 neither flag moved the stream. Why not? Expected: the card could not keep up with the prompts, so prefill won every turn it could; a smaller chunk only added prefill turns ahead of the decode steps, and the fix is more prefill capacity or fewer long prompts per second.
- **Level 4:** You raise the chunk to 8,192 on the L4 and the server dies at startup with an assert that asks you to report a bug. What happened? Expected: the prefill graph for 8,192 tokens needed more memory than the 2.33 GB that the pool left; the assert is the last line, and the out-of-memory line above it is the cause.

**Wrong answers, and why they fail**

- "Smaller chunks always smooth the stream." On the GB10 at 0.5 requests per second the 1,024 chunk raised the P99 ITL from 929 to 1,977 ms, and at higher rates the sizes tied.
- "The mixed chunk is free." It traded a smoother stream for a slower first token: the median TTFT rose 49 to 74 percent at 1 and 2 requests per second on the GB10.
- "The PyTorch assert at startup is a PyTorch bug." The real error is the out-of-memory line two lines above it; the prefill graph for the larger chunk did not fit in the memory that the pool left.
- "A bigger chunk needs no more memory because the pool is the same." The pool stayed at 24,094 tokens, but the captured prefill graph for 8,192 tokens needed more than the 2.33 GB that remained.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Speculation won the benchmark and lost in production

*Level 3 (senior) · debug · about 10 minutes*

A teammate benchmarked EAGLE-3 on Qwen/Qwen3-8B on one L4 with the random dataset and saw the time per token fall by half at 8 users. In production, with 32 concurrent chat users, the output throughput did not rise and the first token came later. The acceptance length in the log looks fine. What happened?

:::answer Show the answer
:::say Short answer
Two things, and the acceptance length hides both. On a 24 GB card the draft weights took pool space: the KV pool fell from 24,094 to 9,951 tokens, about 15 of the 640-token requests, so at 32 users most requests waited for a slot and the median first token went from 2,970 to 8,040 ms. The dataset also matters: at 32 users EAGLE-3 gave 1.6 times the output on GSM8K and code prompts and no more output on the random set or on ShareGPT, because the draft only pays when the GPU has idle time to spend on guesses.
:::

**Full answer**

**The L4 sweep**

The default server against the EAGLE-3 server with the `Tengyunw/qwen3_8b_eagle3` draft, three seeds per point, 512 tokens in and 128 out:

| Concurrency | Default median TPOT | EAGLE-3 median TPOT | Default output tok/s | EAGLE-3 output tok/s |
|---|---|---|---|---|
| 1 | 60.16 ms | 25.61 ms | 13.42 | 31.81 |
| 8 | 66.01 ms | 35.58 ms | 112.62 | 181.55 |
| 32 | 96.18 ms | 43.82 ms | 270.11 | 269.42 |
| 64 | 107.42 ms | 51.50 ms | 250.85 | 245.34 |

The acceptance length was 2.73 to 2.74 tokens per step at every concurrency. Each token came out 1.6 to 2.3 times faster at every load. From concurrency 32 the server delivered no more tokens per second than the default.

**The pool explains the first half**

The startup log of the EAGLE-3 server shows the price of a draft on a small card. The target alone had a pool of 24,094 tokens. With the draft loaded, the pool held 9,951 tokens, about 15 requests of 640 tokens, and the draft took nearly 60 percent of the pool. With 15 requests in the pool, the rest waited for a slot. At concurrency 32 the median first token was 8,040 ms with EAGLE-3 and 2,970 ms without it.

The same log line shows `max_running_requests=48`. The speculative handlers set that cap when you do not set it, with one warning that scrolls away before the first request. On the GB10, where the pool had room, the cap was the limit instead: at 64 users throughput was still higher with speculation, 276.32 against 235.38 tokens per second, but the median first token was 7,772 ms against 557 ms, because 16 requests waited behind the 48.

**The dataset explains the second half**

The random dataset at this version takes the first turn of ShareGPT conversations and cuts or repeats it to 512 tokens, with the end token ignored. The manual then ran the same L4 sweep on four datasets with the clock locked at 900 MHz and a flush before each run:

| Dataset | Median TPOT at 8 users, default / EAGLE-3 / NGRAM | Output tok/s at 32 users, default / EAGLE-3 / NGRAM |
|---|---|---|
| random | 67.6 to 68.2 / 33.8 to 39.4 / 68.2 to 71.4 ms | 250 to 254 / 239 to 242 / 236 to 250 |
| ShareGPT | 66.4 to 68.6 / 39.5 to 43.1 / 69.5 to 72.4 ms | 281 to 288 / 277 to 283 / 245 to 256 |
| GSM8K | 65.5 / 33.3 to 34.3 / 54.6 to 55.0 ms | 397 / 648 to 660 / 433 to 435 |
| code | 65.9 to 66.4 / 36.8 / 58.2 to 58.8 ms | 365 to 366 / 566 to 581 / 377 to 386 |

EAGLE-3 cut the time per token about in half at 8 users on every dataset, with an acceptance length of 2.35 to 2.78. At 32 users it gave 1.6 times the output on GSM8K and code. On the random set and ShareGPT it gave no more output, and its first token came 2 to 3 times later, because the draft took pool space that the queue needed. NGRAM helped only on GSM8K and code, by about 1.1 to 1.2 times at 8 users, and on the other two sets it was slower, with a P99 ITL of 244 to 779 ms.

**The card and the model decide**

The same feature on the GB10 with the mixture-of-experts Qwen3-30B-A3B held its gain at every load, 1.56 to 1.89 times shorter time per token, and still gave 1.17 times the throughput at 64 users. The manual's reading: a dense model reads all its weights per step, so a larger batch already uses the spare compute, while the expert model reads only the experts that the step's tokens chose and the verify pass scores four positions with weights it already read. That is one model and one GPU.

Other teams found the same limits. A benchmark study found that synthetic prompts overstated speculative throughput by 23 percent on average, that the best draft length fell to 1 as the batch grew, and that random token ids left 20 to 30 percent of the experts idle in some layers. A 2025 study of serving benchmarks saw the median TPOT 1.3 times lower and the P99 TPOT 1.16 times higher with speculation, and a later first token because the draft runs its own prefill.

**What to do**

1. Read the `KV Cache is allocated` line of the speculative server and compare it with the plain server.
2. Set `--max-running-requests` yourself, from the concurrency where your sweep shows speculation still wins.
3. Benchmark with your own prompts and real output lengths, with `--disable-ignore-eos`, and read `accept len` on them.
4. Compare the P99 ITL and the P99 TTFT, not only the median.
5. Turn speculation on for interactive traffic with a few users per replica; leave it off for batch jobs and for high concurrency on a card where the pool is the limit.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The log showed 2.73 accepted tokens per step whatever the load. Why did that not predict the throughput? Expected: acceptance measures how well the draft guesses, not whether the GPU has idle time for the guesses or whether the pool has room; the draft took pool space, the queue grew, so each token was faster and the server was not.
- **Level 3:** Which startup lines should the teammate have read? Expected: the allocated KV cache line, 9,951 tokens against 24,094 without the draft, and the running-request cap of 48 that speculation sets when you do not.
- **Level 4:** On the GB10 with Qwen3-30B-A3B the gain held at 64 users. Why would an expert model behave differently? Expected: a dense model reads all its weights per step and a larger batch already uses the spare compute; the expert model reads only the experts that the step's tokens chose, and the verify pass scores four positions with weights it already read, so the gain held at 1.56 times or more; the manual calls this a reading from one model and one GPU.

**Wrong answers, and why they fail**

- "The acceptance length is fine, so speculation is working." It measures the draft's guesses, not the server; on the L4 each token came 1.6 to 2.3 times faster at every load and the server delivered no more tokens per second from 32 users.
- "Random prompts are real text, so the benchmark is realistic." The random set cuts or repeats the first turn of ShareGPT conversations to 512 tokens with the end token ignored; on GSM8K and code prompts speculation gave 1.6 times the output at 32 users, and on ShareGPT it gave none.
- "Raise --max-running-requests to let more users in." On the L4 the pool held about 15 requests, so a higher cap changes nothing; the pool was the limit, and the draft took nearly 60 percent of it.
- "Use NGRAM instead, it needs no draft weights." It helped only on GSM8K and code, by about 1.1 to 1.2 times at 8 users, and on the other two sets it was slower with a P99 ITL of 244 to 779 ms.

:::

## Two data-parallel copies, less output than one card

*Level 3 (senior) · debug · about 10 minutes*

You add a second L4 to an SGLang server with `--dp-size 2` and expect about twice the throughput. The sweep shows less than one card gave: at 64 users the pair peaks at 64 tokens per second and falls to 42, and the P99 first token is 391 seconds against 33.4 on one card. Both copies loaded the weights without an error. What do you check, and what went wrong?

:::answer Show the answer
:::say Short answer
Read the `KV Cache is allocated` line of every DP rank before you trust the sum. On that pair the second card ran two pods of another team, so its copy had 3.17 GB free after the weights against 6.59 GB and a pool of 2,925 tokens against 24,094, an eighth of the first. The round-robin controller does not look at pools, so it sent every second request to the small copy, where 4 ran and 59 waited, while the large copy held one to three requests and used 2 to 7 percent of its pool.
:::

**Full answer**

**The two pools**

The startup lines of the two ranks tell the story before the first request:

- `DP0` loaded the weights in 3.61 s and had 6.59 GB left; its pool was 24,094 tokens.
- `DP1` loaded the same 15.28 GB of weights in 3.73 s and had 3.17 GB left, because two pods of 1,746 MiB each held the rest; its pool was 2,925 tokens. Four requests of 640 tokens fill it.

The decode lines at 64 running requests show the result. `DP1` ran 4 requests at a token usage of 0.82 to 0.87 with 59 in its queue. `DP0` ran one to three requests at a usage of 0.02 to 0.07 with an empty queue.

**Why the client could not help**

The benchmark keeps 64 requests open at a time. Round robin alternates requests between the copies without a look at pools or queues. At 64 users, 63 requests sat on the small copy, 4 running and 59 waiting. The client could not send the large copy more work until the small copy gave a slot back.

**What it cost**

One L4 reached 270 tokens per second. The pair peaked at 64 and fell to 42 as its clock fell: it ran at 765 and 675 MHz at 32 and 64 users, under the manual's clock floor, while the single card ran at 1,320 and 1,080 MHz, so part of the loss is the clock. At 64 users the median P99 first token of three seeds was 33.4 seconds on one card and 391 seconds on the pair. Up to 4 users the pair was already 16 to 41 percent slower for a reason the manual did not isolate, and at one user it took 79.6 ms per token against 60.2 at a higher clock. With a fixed arrival rate the pair completed at most 0.21 requests per second inside the latency target, against 0.96 for one card.

**Route by tokens**

`--load-balance-method total_tokens` sends each request to the copy that holds the fewest tokens. On the same uneven pair it gave 114.7 tokens per second at 64 users, against 41.7 with round robin and 250.9 on one L4. At 8 users it gave 92.1 against 64.2 and 112.6. The median first token at 64 users fell from 4,763 to 3,977 ms. That run had a median clock of 1,020 MHz against 675 in the round-robin run, so part of the gain is the card. A large gain over round robin, and still a loss against one card.

**Tensor parallelism would have refused**

`--tp-size 2` on the same pair stopped two seconds after the collective library started. Before it loads weights, each rank measures its free memory and the group keeps the smallest value. If that value is under 90 percent of the local free memory, the server stops. The shared card had 18.28 GB free against the 19.53 GB that the check required. Each rank of a tensor group holds the same share of weights and the same pool, so the smallest card sets the size for all. `--dp-size 2` has no such check, because each copy sizes its own pool, so it started and lost.

**The rule**

Add capacity with copies only when every copy has about the same pool. Give a group whole GPUs on a shared machine. Check the `#tokens` line of each DP rank before you count on the sum. The other fix, two separate servers behind a gateway with weights, the manual did not measure.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the large copy sit almost idle while 59 requests waited? Expected: the benchmark is a closed loop with 64 open requests, round robin put half of them on the small copy, and the client could not send new work to the large copy until the small copy returned a slot.
- **Level 3:** Why did a tensor split refuse the same pair while the data-parallel pair started? Expected: tensor parallelism checks that every rank has at least 90 percent of the local free memory, because every rank holds the same share and pool, and the shared card had 18.28 GB against the 19.53 GB required; data parallelism sizes each copy's pool on its own and has no such check.
- **Level 4:** Routing by total tokens lifted the pair to 114.7 at 64 users. Is the problem solved? Expected: no; one card alone gave 250.9, the token-routed run also had a higher clock than the round-robin run so part of the gain is the card, and the fix is equal pools, with whole GPUs for each copy or separate servers behind a gateway with weights.

**Wrong answers, and why they fail**

- "Both copies loaded, so the second card is fine." The weights need 15.28 GB on each card; the pool is sized from what is left, and the shared card had 3.17 GB left against 6.59, an eighth of the pool.
- "The controller balances load, so a slow copy gets fewer requests." The default round robin does not look at pools or queues; it alternated requests, so 63 of 64 open requests ended on the small copy.
- "The pair is slower because of the clock, so run it again when the card is cool." The pair did run under the clock floor at 32 and 64 users, but it was already 16 to 41 percent slower up to 4 users, and the log shows 59 requests waiting on one copy; the pool explains the shape and the clock explains part of the size.

:::

## What determinism costs a live server

*Level 3 (senior) · tradeoff · about 10 minutes*

Your evaluation team wants bit-identical outputs from the live server and asks you to enable batch invariance for all traffic. What does it change, what does it cost, and what would you say?

:::answer Show the answer
:::say Short answer
The mode replaces the kernels that split their sums by the batch size with kernels that keep one reduction order, so one request gives the same logits alone and in a batch. It costs speed, most at low concurrency: on our L4 the small model paid 2.4 times the time per token at one user and 1.4 times at 32, and Qwen3-8B paid 1.4 times at 8 users with 27 percent less output. I would turn it on for evaluation and rollout servers and leave it off for production traffic, after I measured the cost at the concurrency we serve, because on SGLang with the default backend it also turns prefix caching off.
:::

**Full answer**

**What the mode switches**

On vLLM, `VLLM_BATCH_INVARIANT=1` needs a GPU of compute capability 8.0 or higher, which includes the L4 and the GB10, and it turns off speed features that change the order of the sums, such as custom all-reduce with tensor parallelism. At 0.31.0 it is in beta.

On SGLang, `--enable-deterministic-inference` replaces the matrix multiply, the log-softmax, the mean, the RMS norm and the batched multiply with batch-invariant kernels, forces the plain sampling backend, sets the all-reduce to a tree so that tensor-parallel sums add in a fixed order, accepts only some attention backends, turns the radix cache off unless the backend is one that supports it, and gives every request without a `sampling_seed` the seed 42. The cache rule matters most: with the default backend on the GB10 the log said that the radix cache is not compatible, so every repeated prefix paid its full prefill again. On the L4 the mode picked a different backend that keeps the cache on.

**What the manual measured**

vLLM on the L4 with the clock locked at 900 MHz, Qwen3-0.6B, runs in the order default, batch-invariant, default again, two seeds each with a cache reset before each run:

| Users | Median TPOT, default / batch-invariant | Output tok/s, default / batch-invariant |
|---|---|---|
| 1 | 6.9 / 16.9 ms (2.4x) | 140.6 / 58.7 (58% lower) |
| 8 | 9.9 / 18.2 ms (1.8x) | 755 / 420 (44% lower) |
| 32 | 18.8 / 25.9 ms (1.4x) | 1,565 / 1,154 (26% lower) |

On Qwen3-8B at 8 users the time per token was 1.4 times longer and the output 27 percent lower; at 32 users 1.3 times and 23 percent. The relative cost fell as more users shared each step, and it was larger on the small model.

SGLang on the GB10 with Qwen3-30B-A3B, one run per server at concurrency 8: output fell from 78.92 to 64.83 tokens per second, 18 percent, and the median time per token rose from 97.30 to 117.43 ms. The radix cache was off in that run, so a workload with shared prefixes pays more than this number shows.

**What other teams measured**

A post on nondeterminism ran 1,000 Qwen3-8B requests on vLLM in 26 s by default, 55 s with batch-invariant kernels, and 42 s with a better attention kernel. A 2026 study measured batch-invariant kernels at more than twice the latency and up to 74 percent less throughput. A verification study found that the modes of both engines gave different logits under some changes in execution, such as prompt chunking and KV cache reuse. The manual did not measure these itself.

**What the mode does not cover**

At 0.31.0 a vLLM model that picks its own attention backend skips the check, so its output can still depend on the batch; the next release checks every attention layer, and a fix for expert models with data, tensor and expert parallelism under compile is not in it. On SGLang a hybrid state-space model was reported as not batch-invariant, some newer architectures are not yet supported, a sliding-window kernel gave several greedy outputs in prefix mode with the issue still open, and one speculative algorithm gave different text after a restart because kernel autotuning picked different tactics on each start.

**What I would say**

Use the mode where identical bits are the product: reinforcement learning rollouts and evaluations that must reproduce. Keep production traffic on the default kernels, where prefix caching and faster kernels are worth more than identical bits. Measure the cost at the concurrency you serve, not at one point, and test the exact setup: model, attention backend, parallel layout, chunk size and cache setting. Flush the cache between two runs you compare, and keep the dtype the same.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the relative cost shrink at higher concurrency? Expected: the invariant kernels give up the fast splits that an idle GPU would use, and that loss is a larger share of a small step; with more rows per step the fixed order costs a smaller share, 1.4 times at 32 users against 2.4 at one.
- **Level 3:** On SGLang the 18 percent understates the cost for a chat workload. Why? Expected: with the default attention backend deterministic mode turns the radix cache off, so every repeated prefix pays its full prefill again; pick a backend that keeps the cache where the GPU supports it.
- **Level 4:** Two servers both run the mode and still give different greedy text for one prompt. Name three causes. Expected: different hardware or engine version; a model path the mode does not cover, such as an attention layer that picks its own backend or a hybrid state-space layer; and kernel autotuning that picked different tactics on each start.

**Wrong answers, and why they fail**

- "The mode has no cost when the GPU is idle." The cost is largest at low concurrency, 2.4 times the time per token at one user on the small model, because the invariant kernels give up the fast splits that an idle GPU would use.
- "Turn it on for production, because correctness comes first." Production traffic gains more from prefix caching and fast kernels than from identical bits; the manual's position is to use the mode for rollouts and evaluations and to measure the cost at the concurrency you serve.
- "The flag covers every model." At 0.31.0 a model that picks its own attention backend skips the check, hybrid state-space layers are not covered, and a fix for expert models under compile is not in the next release; test the exact setup.
- "The seed 42 makes sampled requests reproducible." It makes every request without a sampling_seed draw the same random numbers, which is reproducible and also identical across users; set a sampling_seed per request that must reproduce.

**Related lesson in this course:** [Measuring inference: TTFT, ITL, throughput and bottlenecks](#aiinfra-3)

:::
