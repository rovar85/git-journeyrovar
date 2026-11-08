---
track: aibank
title: "AI interview bank: Cost and capacity (part 2 of 2)"
short: Cost and capacity 2
sub: 10 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A bigger KV pool that bought nothing, until it did

*Level 3 (senior) · tradeoff · about 12 minutes*

A teammate raised the memory fraction of a self-hosted server and grew the KV pool by 63 percent. The closed-loop benchmark at 64 concurrent users did not move. They want to revert the change, because the extra memory bought nothing. What do you tell them, and which measurement settles it?

:::answer Show the answer
:::say Short answer
The benchmark never filled the pool, so the extra memory had nothing to do. At 64 users the running requests held about 11 percent of the pool, and throughput stayed within 2 percent. Under an open-loop overload the same pool mattered: at the smaller fraction the pool was 96 percent full with requests waiting outside it, and the larger pool completed about a third more requests per second. Size the pool from token usage at peak load, bursts included, and read it from the scheduler's decode lines, not from a closed-loop sweep.
:::

**Full answer**

**What the closed loop showed**

The manual ran the same load sweep at a fraction of 0.7 and at 0.82 on one machine, three seeds per point. The BF16 pool grew from 234,600 to 383,065 tokens. At every concurrency the two medians were within 2 percent of each other. The decode line with the highest token usage in the whole larger-pool sweep shows why: 64 running requests held 40,751 tokens, 11 percent of the pool. On the smaller pool the highest usage in the sweep was 18 percent. A pool that is never full has nothing to give.

**What the open loop showed**

The open-loop sweep offered 16 requests per second, more than the machine serves. At 0.7 the decode line read 374 running requests at a token usage of 0.96, with 101 requests waiting in the queue. At 0.82 all 480 requests of the run fit at once at a usage of 0.75, with none waiting. The run completed 5.19 requests per second against 3.88, which is 34 percent more, and 664 against 497 output tokens per second. The two runs were a day apart, so part of the gap can be the machine. The log lines prove the mechanism, and the size of the gain belongs to that run.

**Why the closed loop could not see it**

In a closed loop each client waits for its answer before it sends the next request. The server never holds more work than it finishes, so the pool never fills. Real users arrive on their own clock. Only an arrival rate above the service rate shows what the pool is worth.

**The cost of memory nobody uses**

On a shared machine, memory in the pool is memory that another program cannot use. The manual's machine ran a memory guard that paused the scheduler when the pool allocation grew by tens of gigabytes in seconds. On a dedicated GPU, trust the automatic value first, and raise the fraction in steps of 0.02 only when the scheduler log shows a full pool and retractions.

**The measurement that settles it**

Read the token usage in the decode lines at peak load, the queue length, and the retraction count. Read `max_total_num_tokens` at startup. If usage never approaches one and nothing waits, the pool is not the limit, and the extra memory belongs to something else.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the closed-loop sweep never fill the pool? Expected: each client waits for its answer before it sends the next request, so the server never holds more work than it finishes.
- **Level 3:** Which log lines tell you the pool is the limit? Expected: token usage near one in the decode lines, a queue above zero, and retractions.
- **Level 4:** On a shared machine, what does an oversized pool cost? Expected: memory that other programs cannot use. The manual's machine had a guard that paused the scheduler when the pool allocation grew by tens of gigabytes in seconds.
- **Level 4:** The two overload runs were a day apart. How much of the gain do you trust? Expected: the mechanism, from the lines that show one pool full with requests waiting and the other with room. The size of the gain needs a same-day repeat.

**Wrong answers, and why they fail**

- "The pool did not matter, revert it." It did not matter under a load that never filled it. The overload filled it and completed a third more requests per second.
- "Give the pool as much memory as possible." On a shared machine that memory is taken from other programs, and past the point where the pool fills it buys nothing.
- "Throughput at 64 users is the capacity number." Capacity shows under an arrival rate above the service rate, which a closed loop cannot produce.

:::

## A few endless answers fill the pool for everyone

*Level 3 (senior) · debug · about 12 minutes*

A self-hosted server shows its KV pool near full for hours while the request rate is normal. A few requests have been generating for many minutes each, and the users behind the other requests wait. What is going on, and what do you change tonight and tomorrow?

:::answer Show the answer
:::say Short answer
A handful of requests are in a generation loop. Every token of a running request stays in the pool until the request ends, so a request that never stops grows until it crowds out the rest. Tonight, cap the output length so that every request ends, and add a presence penalty for the workloads that loop. Tomorrow, set the shutdown grace period from the new cap, because a request that runs to the cap decides how long a graceful restart takes.
:::

**Full answer**

**The mechanism**

The pool holds the keys and values of every token of every running request. A request in a loop keeps generating, so it keeps taking slots until it reaches the output limit or the context length. With no cap, one looping request can hold a large share of the pool for the whole context, and new requests wait or running ones are retracted.

**A production report with the same shape**

The SGLang manual summarizes an academic service that served a hundred billion tokens and ran into model loops that held KV cache. Their traffic came from agentic coding tools, with a median prompt of 2,179 tokens and a 95th percentile of 99,746 tokens. Their fix was operational, not a kernel: an output cap of 32K tokens and a presence penalty for the workloads that loop. The manual's advice is to read such a report for its order of fixes, and that service capped output before it tuned anything else.

**Read the metrics**

The vLLM manual's alert table has the pattern: cache usage above 0.95 for more than a minute, waiting requests above zero, and a preemption rate above zero. Its pairing rule names the cause: preemptions with long answers mean that running requests grow until the pool runs out. The fixes it lists are lower concurrency or an FP8 KV cache, and the output cap is what turns the long answers into bounded ones.

**Why the cap comes before the grace period**

A graceful shutdown drains the running requests before it stops. The grace period has to outlast the longest request, and the longest request is one that runs to the cap. The SGLang manual's arithmetic: an answer of 32K tokens at 30 tokens per second needs more than 18 minutes. Cap the output first, then set the termination grace period from the cap, or a drain can never finish in time and a rolling update kills requests mid-answer.

**Tomorrow**

- Find the loops: requests that finished with the length reason at the cap, grouped by tenant and prompt template.
- Set per-tenant output caps that the product agreed to.
- If the long answers turn out to be real agent sessions, grow the pool with an FP8 KV cache or more memory, and lower the concurrency cap.
- Alert on the pair: cache usage near one with a normal request rate.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a looping request hurt other users and not only itself? Expected: the pool is shared. A request that never ends keeps its slots, so new requests wait or running ones are retracted.
- **Level 3:** How do you find the looping requests after the fact? Expected: requests that finished with the length reason at the cap, grouped by tenant and prompt template.
- **Level 4:** Why does the cap on output length come first, before you pick how long a drain may take? Expected: the grace period must outlast the longest request, and the longest request runs to the cap. The manual's arithmetic gives more than 18 minutes for 32K tokens at 30 tokens per second.
- **Level 4:** The long answers are legitimate agent sessions. What then? Expected: grow the pool with an FP8 KV cache or more memory, lower the concurrency cap, and keep an output cap that the product agreed to.

**Wrong answers, and why they fail**

- "Restart the server to clear the pool." Every running request fails, and the loops come back on the next prompt.
- "Raise the memory fraction." A larger pool delays the symptom. A request with no cap fills any pool.
- "Lower the temperature to stop the loops." Sampling settings change the odds of a loop. Only a cap guarantees that a request ends.

:::

## A second replica that undoes the prefix cache

*Level 3 (senior) · design · about 15 minutes*

You add a second serving replica to double capacity. Throughput rises, but the first-token time of long chat sessions gets worse, and the cache hit rate on both servers falls. Explain the cause, and design the routing so that the second replica stops undoing the cache.

:::answer Show the answer
:::say Short answer
Each replica has its own KV cache, and a router that spreads requests at random or in turn sends turn five of a chat to the replica that never saw turns one to four. That replica prefills the whole history again, which is the prefix miss the cache exists to avoid. Route each conversation back to the replica that holds its prefix with a cache-aware policy that remembers which server saw which text, with a load-balance check in front of it. Then read the hit rate on the servers themselves, because the router's record is a guess.
:::

**Full answer**

**The mechanism**

A plain Kubernetes Service spreads requests at random. The in-server data parallel controller of SGLang defaults to round robin, which ignores prefixes. Either way, a conversation's turns land on different replicas, and each replica computes the history that the other one already holds. A field report in the SGLang manual measured the damage: with turn-by-turn routing, 23 percent of input tokens were computed again. One request header that pinned each conversation to one GPU raised the cache hit rate from 64.7 to 92.1 percent and halved the median time to first token.

**How a cache-aware router picks a server**

The SGLang gateway keeps one approximate radix tree per model, over the characters of the request text, so it never tokenizes to route. For each request it does three things in order:

1. It checks balance. When the busiest server's load is more than 64 above the lightest and more than 1.5 times the lightest, the request goes to the least-loaded server.
2. Otherwise it computes the match rate, the share of the request text that matches the tree. Above 0.3, the request goes to the server with the longest match.
3. Below 0.3, it goes to the least-loaded server.

Every 120 seconds a background task trims each tree to at most 67,108,864 nodes. The balance check comes first on purpose: a prefix-first policy would pile every long conversation onto one hot server.

**The tree is a guess**

The gateway records where it sent text. It never asks a server what it still holds, and a server can evict the prefix later. So a request can arrive at the server the tree names and still prefill. Check the hit rate on the servers themselves, from their counters over a window, and not only the routing decisions.

**Pick the policy by traffic**

Cache-aware routing for chat and agent traffic, where turns share long prefixes. A power-of-two or round-robin policy for batch traffic with unique prompts, because a match rate under the threshold gives no affinity anyway. Do not put multi-turn traffic behind in-server data parallelism with its round-robin default.

**The same idea in the vLLM layers**

The vLLM manual lists routers that read the engine's metrics to pick a replica, and one that also reads the KV cache events the engine publishes with `--kv-events-config`, so that a request goes to the replica that holds its prefix. The production stack's router keeps a session on one replica. In the gateway lesson's vocabulary, this is provider routing one level down: the AI gateway routes across providers, and the engine router routes across replicas.

**Pin the router with the engine**

The SGLang manual records an incident where the same engine build gave 132,140 tokens per second with one router version and 69,767 with the next. Benchmark the router and the engine as one system, and pin both versions.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the router check load balance before the prefix match? Expected: a prefix-first policy would send every long conversation to one hot server. The imbalance test sends the request to the least-loaded server when the gap is large.
- **Level 3:** Which traffic should not use the cache-aware policy? Expected: batch traffic with unique prompts. A match rate under the threshold gives no affinity, so a load-based policy does the same work with less state.
- **Level 4:** One server's hit rate stays low although the gateway routes its conversations there. Why? Expected: the gateway's tree records where it sent text, not what the server still holds. The server evicted the prefix, so the request prefills. Read the server's own counters.
- **Level 4:** You upgrade the router without touching the engine. What do you measure? Expected: throughput and hit rate of the router and the engine as one system, because a router change alone halved throughput in a reported incident.

**Wrong answers, and why they fail**

- "Add a replica and each server's hit rate stays the same." Each replica has its own cache, and random routing splits every conversation across both.
- "Hash the user id to a server and be done." It keeps a user on one server and ignores load. The manual's gateway balances first, so a hot user cannot saturate one replica with no relief.
- "Turn on in-server data parallelism instead of a gateway." Its default method is round robin, which ignores prefixes, which is the problem you are solving.

**Related lesson in this course:** [Parallelism and distributed inference](#aiinfra-5)

:::

## Autoscale a model service on queue and cache signals

*Level 3 (senior) · design · about 15 minutes*

Your model service runs as a plain Deployment with an autoscaler on CPU use. During a traffic spike the autoscaler added replicas late, kept adding them while the new pods were still loading weights, and a liveness probe restarted the busiest pod in the middle of the spike. Redesign the scaling and the probes.

:::answer Show the answer
:::say Short answer
Scale on the engine's own signals, not on CPU: the count of waiting requests and the KV cache usage say that a server is saturated long before CPU does. Give the startup probe a window longer than your measured cold start, so that a loading pod is neither sent traffic nor restarted, and make the liveness probe cheap, so that a busy server does not lose its busiest pod to a probe that waited in the queue. Keep the weights and the compile cache on persistent storage, so that a new replica is ready in a fraction of the time.
:::

**Full answer**

**Why CPU is the wrong signal**

GPU load is not CPU load. A saturated engine shows waiting requests above zero and cache usage near one while the CPU looks calm. The vLLM manual says this directly about the plain Deployment: it routes at random and scales on the wrong signal. The routing layers that the manual lists read `vllm:num_requests_waiting`, `vllm:num_requests_running` and `vllm:kv_cache_usage_perc` to pick a replica, and an autoscaler should read the same series.

**Read the signals in pairs**

| Reading | Meaning |
|---|---|
| waiting above 0, cache usage below 0.9 | the batch size or the token budget limits admission, not memory |
| waiting above 0, cache usage near 1 | the pool limits admission, so add memory or replicas |
| slow first token with nothing waiting | long prompts or a slow tokenizer, not a capacity problem |
| preemptions with long answers | running requests grow until the pool runs out |

The second row is a reason to add a replica, because the pool is full. On the first row, raise the batch limit or the token budget first, while the pool has room. If the queue stays after that, or the limit is already where the latency target needs it, add a replica, because each replica brings its own batch limit and token budget.

**Probes that match a slow start**

The manual's example gives the startup probe 90 checks at 10 second intervals, which is 15 minutes, and notes that its own machine took about 8 minutes for a first start. Set the window from your measured cold start. For readiness, send one short real request, which proves the engine can generate, or use the ready endpoint on an engine that has one. For liveness, use a cheap health path. The SGLang manual turns generation off in the health endpoint, because a probe that generates waits in the queue under load, times out after 20 seconds, and marks a busy server unhealthy. In one incident each failed probe also left an orphan request in the scheduler, so the probes added to the load they were meant to detect.

**Stop the overshoot**

New pods take minutes to load. The autoscaler sees the signal still high and adds more. Give it a stabilization window at least as long as the cold start, cap the replicas added per step, and shorten the cold start itself: weights on local disk, the compile cache on a persistent volume, and a preload before the server takes traffic. The cold start lesson adds the warm pool for the interactive path, so that the first replica is never a cold one.

**Scale down without losing work**

Remove the pod from the load balancer, send SIGTERM to the main process only, and set a grace period at least as long as the longest request at the output cap. A forced kill, or a signal to the whole process group, drops every running request.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which pair of readings says the pool is the bottleneck, not the batch limit? Expected: waiting requests above zero with cache usage near one. With cache usage below 0.9, the batch size or the token budget limits admission instead.
- **Level 3:** Why does a generating health probe hurt under load? Expected: its request waits in the queue like any other, times out, and marks a busy server unhealthy. In one incident each failed probe also left an orphan request behind.
- **Level 4:** How do you keep the autoscaler from overshooting during a cold start? Expected: a stabilization window at least as long as the measured cold start, a cap on replicas added per step, and a shorter cold start from persistent weights and compile caches.
- **Level 4:** What does a scale-down need so that no request is lost? Expected: remove the pod from the load balancer, send SIGTERM to the main process only, and a grace period at least as long as the longest request at the output cap.

**Wrong answers, and why they fail**

- "Scale on GPU utilization instead of CPU." Utilization can read high while requests wait and low while the pool is full. The queue and the cache usage are the signals the engine exposes for this.
- "Make the liveness probe stricter so that bad pods restart faster." Under load a strict probe restarts healthy, busy pods. The fix is a cheap probe and a long startup window.
- "Add replicas faster to beat the spike." Replicas that take minutes to load add nothing during the spike and cost money after it. Shorten the cold start and keep a warm margin.

**Related lesson in this course:** [Production inference: SLOs, queues, autoscaling, cold starts, cost and AI gateways](#aiinfra-6)

:::

## Break an eight-minute start into its parts

*Level 3 (senior) · estimate · about 12 minutes*

A pod serving an MoE model on a unified-memory machine took about eight minutes from start to ready. Break that time into its parts, say which parts a restart can skip, and estimate what a warm restart looks like on the same machine.

:::answer Show the answer
:::say Short answer
Most of the time was the weight load. The manual's log shows about 330 seconds to copy 57 GiB of weights into memory on that machine, one tensor at a time from a file-backed page. The engine init took 127.54 seconds, and it holds the two CUDA graph captures of 39 and 38 seconds and a compile share of 18.67 seconds. A restart reuses the compile cache and nothing else, so a warm restart on that machine is only a little shorter than the cold one, unless the weights are staged in host memory or a process snapshot exists, which a field report took from a cold start of 695 seconds to 9.6 seconds.
:::

**Full answer**

**The parts, from the startup log**

| Phase | Measured | Where it is logged |
|---|---|---|
| weight load | 56.93 GiB in about 330 seconds | the model loading line |
| engine init, profile, KV cache, warmup, with both graph captures | 127.54 seconds, of which compilation 18.67 | the init engine line |
| first graph capture, inside engine init | 39 seconds, 1.17 GiB | the first graph capturing line |
| second graph capture, inside engine init | 38 seconds, 0.31 GiB | the second graph capturing line |

The two captures finish before the init line, so they are part of its 127.54 seconds. Do not add them to it.

The server reported ready about eight minutes after it read its arguments. The load alone is more than two thirds of it.

**Why the load is slow on this machine**

Each tensor is copied from the memory-mapped weights file into the GPU allocation. On this platform an open issue measured about 1.7 ms per tensor copied from the file view, against about 0.2 ms for a copy that starts in host memory. The release that the manual pins saved about 25 seconds with an indexed lookup of expert names, and the per-tensor copy cost stays. The manual's advice: keep the weights on local NVMe, not on a network mount, and start the server once and keep it running.

**What a restart skips**

The compile cache lives under the engine's cache directory. Keep it on a persistent volume, and a later start reads it, so the compile share shrinks. SGLang points all of its kernel caches into one directory for the same reason, and the manual mounts it on a volume that survives the pod. The graph captures and the weight load repeat on every start. So the honest estimate for a warm restart on this machine is the cold start minus the compile share, which is still several minutes.

**Getting under a minute**

The lesson on cold starts maps each phase to a layer: a pre-seeded image removes the image pull, model streaming roughly halves the weight load, and a GPU memory snapshot restores the loaded state about ten times faster than a reload. The SGLang manual quotes a field report with the same shape on a different engine and eight GPUs: a cold start of 695 seconds with 531 of them in weight loading, 88 seconds with kernel caches kept, and 9.6 seconds with a process checkpoint and the weights staged in host memory. Below a minute means a snapshot or staged weights, not a faster disk.

**What the number sets**

The Kubernetes example in the vLLM manual gives the startup probe checks at 10 second intervals across a 15 minute window, and tells you to set the window from your own measured cold start. An autoscaler needs a stabilization window at least as long, and the interactive path needs a warm replica, because no scale-out helps inside an eight-minute window.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which phase dominates on this machine, and why? Expected: the weight load at about 330 seconds, because each tensor is copied from a file-backed page, which is slow on this platform.
- **Level 3:** What does a persistent compile cache save on a restart? Expected: the compile share of the engine init, 18.67 seconds here. The weight load and the graph captures remain.
- **Level 4:** How do you get the restart under a minute? Expected: a process checkpoint or GPU memory snapshot with the weights staged in host memory, which the field report took to 9.6 seconds. A faster disk alone does not get there.
- **Level 4:** What does an eight-minute start imply for the probes and the autoscaler? Expected: a startup probe window longer than eight minutes, a stabilization window at least as long, and a warm replica for the interactive path.

**Wrong answers, and why they fail**

- "The compile is the slow part, use eager mode." The compile share was 18.67 seconds of an eight-minute start, and eager mode costs decode speed on every request afterwards.
- "A faster GPU loads faster." The load was bound by the copy path from the file view, not by the GPU.
- "Restart often to pick up configuration changes." Each restart pays the full load. The manual's advice is to start once and keep the server running.

:::

## Price a nightly pipeline on batch with a cached prompt

*Level 3 (senior) · estimate · about 12 minutes*

A nightly pipeline summarizes 50,000 documents, and every call opens with the same system prompt. It runs synchronously against a provider for four hours and costs about 2,000 dollars a night. Estimate what the same job costs on the batch API with the system prompt cached, and say when you would move it onto your own GPU instead.

:::answer Show the answer
:::say Short answer
Batch gives a flat 50 percent discount on input and output tokens, and the cached system prompt makes the repeated input about ten times cheaper after the first write. Stacked, the lesson's worked example lands at about 180 dollars a night, near 9 percent of the synchronous bill, from three configuration changes. Move the job to your own GPU when it runs every night at high utilization and the shared prefix is short, so that neither discount has much to work on, and size that run by raising concurrency until the output stops growing.
:::

**Full answer**

**The three bills**

The lesson writes the synchronous uncached bill as the document count times the input and output tokens of each call at full rates, with a shared prompt of about 4000 tokens and an output of about 200 tokens per document.

1. **Synchronous, uncached.** Every call pays for the full prompt and the full output.
2. **Synchronous, cached.** The system prompt is written once, and the remaining 49999 calls read it at about a tenth of the input price.
3. **Batch, cached.** Everything above, plus the 50 percent discount on the reads, the write and the output.

The lesson's conclusion: batch plus cache comes to about 10 percent of the synchronous uncached bill, and its worked pipeline goes from 2,000 dollars a night to about 180.

**What the estimate hides**

- Output tokens take the batch discount only. Caching reuses the prompt's attention state and does nothing for generated tokens, so a job with long outputs and a short prompt saves much less.
- The first call of a batch pays the cache write premium. Against tens of thousands of reads, it is noise. If the batch runs longer than the cache lifetime, the one-hour variant with its 2x write is worth it once the reads pass five.
- Check the usage fields on a sample of the results. A batch whose requests all missed the cache shows writes and no reads, and then the second discount never happened.
- The return is promised within 24 hours and typical within a few hours. A night is shorter than the promise, so the morning deadline holds only on the typical return. Submit the batch a day ahead, or keep a synchronous fallback for a late batch.

**When your own GPU wins**

The lesson's exercise asks for the shared-prefix length at which batch plus cache beats a reserved GPU running overnight. Your own GPU wins when three things hold: the job keeps a reserved GPU busy every night, the shared prefix is short, so there is little to cache, and the outputs are long, so the batch discount is the only lever on the provider side. Data residency can decide it on its own.

**How to size the self-hosted run**

The vLLM manual's recipe for an offline job: pass the whole prompt list to the offline engine class in one call, or run the batch command on a file of requests, and raise the concurrency until the output stops growing. On its card, the output grew to 273.9 tokens per second at 32 concurrent requests and fell to 241.4 at 64, because the pool filled and the GPU throttled. Raise the token budget above 8,192 for throughput, because a slow first token costs nothing when nobody waits, and watch the running count against the cache usage to see which limit binds.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which of the two discounts applies to output tokens? Expected: only the batch discount. Caching lowers the price of repeated input and does nothing for generated tokens.
- **Level 3:** The first call in each batch pays a cache write premium. Does that change the estimate? Expected: not at this volume. One write at a quarter more, against tens of thousands of reads at a tenth of the price.
- **Level 4:** When does a reserved GPU beat batch plus cache? Expected: when the job keeps the GPU busy every night, the shared prefix is short and the outputs are long, so the two discounts have little to work on. The lesson's exercise computes the break-even prefix length.
- **Level 4:** How do you find the right concurrency for the job on your own GPU? Expected: pass the whole list to the offline engine or the batch command, raise concurrency until the output tokens per second stop growing, and raise the token budget. The manual's card peaked near 32 concurrent requests.

**Wrong answers, and why they fail**

- "Batch alone gets you to a tenth of the cost." Batch alone halves the bill. The other factor is the cached shared prompt.
- "Caching saves the same on output as on input." The cache reuses the prompt's attention state. Every output token is generated and billed in full, less the batch discount.
- "Batch is too slow for a nightly job." The promise is a day and the typical return is hours. Submit a day ahead, or keep a synchronous fallback for the rare late batch.

:::

## The router saved half the bill, then the escalations climbed

*Level 3 (senior) · debug · about 12 minutes*

Six months ago a cascading router cut the bill by more than half with no measurable quality loss. Since then the escalation rate has crept from 8 percent to 22 percent, and a sales engineer reports that a competitor's demo now answers better than your product. Diagnose it.

:::answer Show the answer
:::say Short answer
The traffic drifted and the router did not. Its classifier learned the question mix of six months ago, users now ask longer and harder questions, and the cheap model's first pass fails its own confidence check more often, which is what the rising escalation rate records. Quality fell silently on the requests that were not escalated. Gate every route with online quality metrics, retrain the classifier on current traffic, and treat an escalation rate above about 30 percent as proof that the cheap model is over-routed.
:::

**Full answer**

**The failure mode the lesson warns about**

A route sends a large share of traffic to a weaker model. Over months the task distribution shifts: users get more sophisticated and ask longer questions. The router does not notice, because its classifier was trained on the earlier quarter. Quality drops by a few percent on reasoning tasks, nobody complains loudly enough, and the team finds out from a competitor benchmark. The lesson's numbers for the pattern: 40 percent routed cheap, a 3 to 5 percent quality drop, unnoticed for a quarter.

**Three causes of a rising escalation rate**

1. **Distribution shift.** More long prompts and more multi-step questions. The lesson's length signal says prompts above 4K tokens often need the frontier model, and prompts under 500 tokens usually do not. If the mix moved up, more first passes fail.
2. **The cheap model changed.** A provider update behind the same alias, or a routine version bump, moves the confidence signal and the refusal behavior.
3. **Stale thresholds.** The confidence cutoff and the embedding set of known-hard questions were tuned on old traffic.

Each cause has its own fix: retrain the classifier on recent labeled traffic, pin the model version and log the served model on every call, and refresh the hard set and the cutoff on a new eval.

**Gates on live traffic**

The lesson gates routes with live signals, not with the offline set:

- thumbs up and down per route;
- an automated judge on a 5 percent held-out sample per route;
- the escalation rate, where a cascade that kicks up more than 30 percent of requests is over-routing;
- the refusal rate per route.

**What the cascade now costs**

The cascade pattern was designed for about 1.2 times the median latency and about 2 times on the escalated share, with roughly 10 percent escalated. At 22 percent escalated, a fifth of the requests pay for two model calls and the slow path, so the saving shrank while the quality fell.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the offline eval not catch the loss? Expected: the eval set was built from the old distribution. It scores the model on questions that users no longer ask.
- **Level 3:** Which online metric gives the earliest warning? Expected: the escalation rate per route. It rises as the cheap model fails its own confidence check more often, before the thumbs or a judge sample show the loss.
- **Level 4:** The provider updated the cheap model behind the same alias. How do you know? Expected: a step change in escalations or judge scores on a date with no deploy on your side. Pin the model version and log the served model on every call.
- **Level 4:** Where do you set the alarm on the escalation rate? Expected: near the design target, about 10 percent escalated for the cascade pattern, with the lesson's 30 percent as the hard line for over-routing.

**Wrong answers, and why they fail**

- "The cheap model got worse, swap it." Possible, and the first suspect is the router's stale classifier against drifted traffic.
- "Quality is fine, the eval score did not move." The eval set comes from the old distribution and cannot see the new questions.
- "Raise the confidence cutoff so that more goes to the frontier model." That buys quality back at a cost without finding the cause. Retrain the router and gate it online.

:::

## Build a cost attribution and enforcement simulator

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. You receive one day of request logs from a multi-tenant assistant. Each record follows the lesson's attribution trace: a trace id, a timestamp, the tenant, the user, the task id and its route, the model, the token counts for each of the four layers in the lesson's trace, whether the input was cached, and whether the task was resolved. You also receive the daily spend of each tenant over the previous weeks, as the baseline for the kill switch. Build a simulator that attributes spend by tenant, task and user, splits the tokens into layers, computes a cost per resolved task per tenant, and enforces a rate limit, a daily spend cap and a kill switch. Inject one abusive tenant and show when each control fires.

:::answer Show the answer
:::say Short answer
Price every call from a pricing table, roll the cost up by tenant, by task with its route and by user, and split the tokens into prompt, tool, memory and response so that the report names the layer that drives each tenant's spend. Compute the cost per resolved task from the outcome field, not from the token totals. Implement the ladder from the lesson: a rate limit at 2 to 3 times the expected peak, a daily cap at 1.5 to 3 times the contracted ceiling, and a kill switch on a spend z-score above 4 against the tenant's own baseline. Show the abusive tenant hit the rate limit first, then the cap, then the kill switch when its spend jumps far above its history.
:::

**Full answer**

**What a complete submission contains**

1. **A cost on every call.** A pricing table with the cached input price, as the earlier caching lesson builds it, and a function that turns tokens into dollars per call.
2. **Attribution in three dimensions.** Spend by tenant, by task and route, and by user, joined by the trace id as the telemetry joiner pattern does. Nothing is inferred after the fact.
3. **Four token layers.** Prompt, tool, memory and response per task, as shares. The lesson's typical bands are the sanity check: prompt 40 to 60 percent, tool 20 to 40 percent on agent work, memory and response 10 to 30 percent each.
4. **The unit metric.** For every tenant and every feature, the spend divided by the resolved tasks, from the resolution field. A task that was not resolved still cost money, and that is the point of the metric.
5. **The enforcement ladder.** The rate limit answers with a 429 and a retry header. The cap tightens the rate limit and raises an alert. The kill switch pauses the tenant and pages.
6. **The injected tenant.** A timeline of its spend and of the control that fired at each point, with the z-score plotted against the threshold.
7. **The first five dashboard views.** The lesson's exercise asks for them. A strong answer: spend per tenant over time, the per-tenant spend divided by resolved tasks, the layer split per task, the top users by spend, and the enforcement events.

**What the reviewer looks for**

- The attribution is stamped at request creation and joined by trace id, never guessed from the bill.
- The layers are separate, and the report says which one to fix for each heavy tenant.
- The unit metric is tied to an outcome.
- The kill switch is relative to the tenant's own baseline, and the threshold is justified, which is the lesson's first exercise.
- The order of the controls is explained: friction first, pause last.

**What to argue in the write-up**

The lesson's third exercise: the largest tenant has a negative margin. Propose three interventions ordered by customer impact, such as caching and routing on their heaviest task first, a quota change second, and a price change at renewal last. Then argue whether retroactive tagging can ever work, which the lesson asks in its last exercise. The honest answer is that it fills a gap for legacy data and always misses cases.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the kill switch relative to each tenant's history instead of a fixed amount? Expected: tenants differ by orders of magnitude. A fixed amount pauses a large tenant on a normal day and never fires for a small one.
- **Level 4:** Your largest tenant is unprofitable in the report. What do you propose? Expected: three interventions ordered by customer impact, such as caching and routing on their heaviest task, then a quota change, then a price change at renewal.
- **Level 4:** Which five views would you put on the dashboard first? Expected: spend per tenant over time, the per-tenant spend divided by resolved tasks, the layer split per task, the top users by spend, and the enforcement events timeline.

**Wrong answers, and why they fail**

- "Attribute the bill by dividing it by seats." That hides the heavy tenants and the heavy features, which is what the exercise is for.
- "One token bucket for everything." A single bucket cannot say which layer or tenant to fix, and it cannot carry a per-tenant cap.
- "Fire the kill switch at a fixed dollar amount." Tenants differ by orders of magnitude. A fixed amount is wrong for all but one of them.

:::

## Survive a provider outage without a redeploy

*Level 4 (staff) · design · about 18 minutes*

The CTO wants every product-critical model call to survive a full outage of one provider, with no redeploy and without doubling the bill. Design the setup: where the second provider sits, how a request moves between the two, what has to be identical on both sides, and what the design costs.

:::answer Show the answer
:::say Short answer
Put a gateway in front of the application with one model alias per use case, a priority list of two providers behind each alias, and a fallback rule on server errors and rate limits with a bounded retry budget. Keep the cacheable prefix layout, the tool order and the output schema identical on both providers, so that a failed-over request can hit the second provider's cache once that prefix is cached there, and still parses. The steady-state uplift is small, because the gateway sends traffic to the preferred provider most of the time, and the real price is paid in evals and prompt tests that run twice.
:::

**Full answer**

**Why two**

The lesson on managed platforms argues that locking into one platform locks you out of most of the frontier, because the strongest model moves between vendors every few months, and that a single platform's regional outage is a product outage. Its policy is a two-provider minimum for any product-critical call. The cost uplift is negligible because the gateway routes to the better option in normal operation, and the availability gain during an outage is decisive.

**The gateway in front**

The lesson on the routing layer gives the shape. Everyone speaks one API schema, so the gateway exposes one endpoint and translates behind it. Your code names an alias such as `our_smart_model`, and the gateway maps the alias to a concrete model on a concrete provider. Behind each alias sits a priority list: the primary, then the second provider on a server error or a rate limit, then refuse. Retries count against a budget, so that a failing primary cannot multiply the cost. The gateways lesson adds the rest of what the layer owns: rate limits per tenant, credentials pulled from a vault at runtime, observability and guardrails.

**What the two sides share**

1. **The cacheable prefix layout.** The rule for cross-provider fallback in the lesson on prompt caching is to keep the layout identical, so that any hit works on either side. Stable parts first, the user message last.
2. **The tool serialization order.** A reshuffled tool list breaks the cache on every request.
3. **The output schema and the parser.** A failover that returns a shape the application cannot parse is still an outage.
4. **The eval set.** Both providers run the same regression suite on every prompt change, or the fallback path drifts without anyone noticing.

**What it costs**

- Two sets of evals and prompt regressions per release.
- Cold caches on the second provider when the outage begins. The first requests pay the write premium, and the minimum cacheable block has to be met on both sides.
- The gateway's own latency, from a few milliseconds to tens, depending on its class.
- A log line per call that names the provider that served it, so that the bill splits and the failover rate is visible.

**Prove it before the outage**

Inject rate-limit errors from the primary in staging and watch the traffic move. Measure the time to the first successful response on the second provider, and compare the first-token time and the cache reads during the failover with the steady state.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the second provider cost little in steady state? Expected: the gateway sends most traffic to the preferred provider. The second one carries traffic only during failures and drills.
- **Level 4:** What breaks first on a failover without the identical prefix layout? Expected: the cache on the second provider misses on every request, so the outage hour costs full price and the first-token time jumps.
- **Level 4:** Which failures trigger the failover, and which do not? Expected: server errors, rate limits and timeouts on the primary. Not a guardrail block or a malformed response, which would fail the same way on the second provider.

**Wrong answers, and why they fail**

- "Two providers double the bill." The second provider carries traffic only during failures. The gateway routes to the preferred one the rest of the time.
- "Tune a separate prompt per provider." Then every change ships twice and the fallback path drifts. Keep one layout and one eval set for both.
- "Fail over on any error." A guardrail block or a schema error repeats on the second provider and doubles the cost of a request that should fail fast.

:::

## Warm replicas per tier, with the arithmetic

*Level 4 (staff) · design · about 18 minutes*

You run three tiers on a serverless GPU platform: paid users on a live chat, trial users on the same chat, and a nightly batch pipeline. Design the warm-pool policy per tier, show the arithmetic behind it, and say what you would measure after a month to revisit it.

:::answer Show the answer
:::say Short answer
Give the paid chat one or two warm replicas, because its first-token target cannot absorb a cold start of minutes on a large model. Give trial users a smaller margin, or let them ride on the paid pool's spare capacity, and let the batch pipeline scale to zero, because it tolerates a cold start of several minutes. The arithmetic is the hourly GPU price times the idle hours against the requests that would miss the target during a cold start, and after a month you compare the measured utilization, the cold-start count and the missed-target count per tier.
:::

**Full answer**

**The arithmetic the lesson gives**

A warm replica costs one GPU hour every hour. One replica per product is a full month of GPU hours whether anyone calls, and the lesson's example of five products with one warm replica each comes to 3,600 GPU-hours a month idle. The lesson calls the trade brutal on small models, where you pay 0.85 to 1.50 dollars an hour to avoid a 30 second start, and kind on large ones, where about 4 dollars an hour avoids a 5 minute start. Its threshold for a mandatory warm pool: a first-token target at P99 under 60 seconds on a model of 70B or more.

**The policy per tier**

| Tier | Policy | Why |
|---|---|---|
| paid live chat | one to two warm replicas | the lesson's high-value interactive path, where a cold start is an outage |
| trial chat | zero warm, or overflow into the paid pool at lower priority | the loss is a conversion, which you can measure, against a month of GPU hours |
| nightly batch | scale to zero | the lesson accepts a cold start of 5 to 10 minutes on background paths |

The lesson's exercise asks exactly this split and asks for the math. The paid tier is decided by the SLA. The batch tier is decided by its tolerance. The trial tier is the real decision, and it is an experiment: the conversion loss from a cold start on the first session against the price of an idle GPU.

**Make the policy cheaper by shrinking the start**

Every mitigation layer moves a tier toward zero. A pre-seeded node image removes the image pull, model streaming halves the weight load, a GPU memory snapshot restores the loaded state in a fraction of the time, and tiered loading keeps weights in host memory. The lesson's table takes a cold start of 328 seconds to about 15 seconds. With a 15 second start, the trial tier can scale to zero with a small loss, and the paid pool can hold one replica instead of two.

**Match the billing to the tier**

The warm replicas run at high utilization, which is where per-minute billing beats per-token, above about 30 percent sustained utilization in the economics lesson. Trial bursts and the overnight batch sit below that line, so per-token or a batch tier at about half the serverless rate fits them.

**What to measure after a month**

- Utilization per tier, hour by hour.
- Cold starts per day and their duration.
- Requests that missed the first-token target, and whether they fell inside a cold start.
- Trial conversions for sessions that hit a cold start against sessions that did not.
- The break-even request rate per tier from the lesson's simulator, against the measured rate.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why not give trial users the same warm pool as paid users? Expected: a warm replica costs a month of GPU hours whether trial traffic arrives or not. The decision is the conversion loss from a cold start against that cost, and the month of measurement answers it.
- **Level 4:** How does a 15 second cold start change the policy? Expected: tiers that tolerate seconds scale to zero, so the warm pool shrinks to the paths with targets of a second or two.
- **Level 4:** Which signal says a warm replica count is too low? Expected: the share of requests that miss the first-token target during scale-outs, together with the cold-start count per day.

**Wrong answers, and why they fail**

- "Warm replicas for every tier, the cost is small." One replica per product is a month of GPU hours each. Five products idle come to thousands of hours.
- "Scale trial to zero, those users are free." A cold start of minutes on the first trial session is a lost conversion. Measure it before you decide.
- "Keep the batch pipeline warm so that it finishes earlier." Batch tolerates minutes. A warm GPU for it is paid idle time for the rest of the day.

:::
