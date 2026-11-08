---
track: aibank
title: "AI interview bank: Cost and capacity (part 1 of 2)"
short: Cost and capacity 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Sort a workload into interactive, async or batch

*Level 1 (screening) · concept · about 5 minutes*

A team runs its nightly report pipeline through the same synchronous endpoint as the chat product, because the pipeline is production. How do you classify model workloads, and where does this one belong?

:::answer Show the answer
:::say Short answer
Sort every workload by the latency its user accepts, not by where it runs. Interactive work has a user waiting for the first token and stays synchronous with prompt caching, and semi-interactive work returns in minutes through an async queue. Anything whose user can wait for the full promise belongs on the batch API, which gives a 50 percent discount with a return promised within 24 hours and typical in a few hours. The nightly report is batch when a return at the 24-hour limit still meets its deadline, or when a synchronous fallback covers a late batch.
:::

**Full answer**

**The three lanes**

| Lane | The user | The path |
|---|---|---|
| interactive | waits for the first token | synchronous, with prompt caching |
| semi-interactive | submits and checks back in minutes | async queue, with a synchronous fallback |
| batch | expects the result by morning or end of day | batch API, with cached input stacked on top |

**The misclassification**

The lesson's rule is blunt: production is not a latency spec, the SLA is. The common mistake is to call everything interactive because it runs in production. Its cousin is the partial-interactivity trap: a report with a refresh button that users happily wait ten minutes for, shipped as a synchronous call. The lesson puts 50 concurrent refreshes at 10x the cost of the same report batched and delivered by mail.

**What batch promises**

A return within 24 hours, with a typical return of a few hours, because the provider runs the batch when its capacity is idle. The lesson calls this asynchronous, not slow.

**Stack it with caching**

A nightly pipeline shares one system prompt across every call. Cache that prefix, run the pipeline on batch, and the lesson's arithmetic lands near 10 percent of the synchronous uncached cost. Its opening example takes a nightly pipeline from a four-hour synchronous run to a batch run at about 9 percent of the bill with three configuration changes.

**The other trap**

Batch file formats differ per provider, so one batch client needs an adapter per provider, and a gateway that advertises multi-provider batch still wraps the raw formats.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which question sorts a workload into a lane? Expected: what a wait of a day means to this user. If they would not notice, it is batch.
- **Level 2:** A user clicks refresh on a health report and waits ten minutes without complaint. Which lane? Expected: semi-interactive at most, and batch if the report can arrive by mail. Shipping it synchronous is the partial-interactivity trap.
- **Level 2:** Why does the lesson call batch asynchronous rather than slow? Expected: the promise is a return within a day, and the typical return is a few hours, because the provider runs it when capacity is idle.
- **Level 3:** What breaks when you write one batch client for two providers? Expected: the file formats differ, so you need an adapter per provider.

**Wrong answers, and why they fail**

- "It runs in production, so it is interactive." Production is where it runs. The lane comes from the latency the user accepts.
- "Batch means the answer takes a day." The promise is within a day. The typical return is a few hours.
- "A 50 percent discount is not worth the complexity." On a shared prefix it stacks with caching to about a tenth of the synchronous cost, which the lesson calls the cheapest lever that nobody pulls.

:::

## The metric to give finance instead of a token price

*Level 1 (screening) · concept · about 5 minutes*

Finance asks for the cost per million tokens as the key metric for the model service. You push back. What metric do you propose instead, and what must every call record so that you can compute it?

:::answer Show the answer
:::say Short answer
Propose a cost per product outcome: per resolved ticket, per generated article, per successful agent task or per session minute. A price per million tokens is the vendor's unit, and it says nothing about whether the spend produced anything. To compute the outcome metric, stamp every call at creation with the user id, the task id with its route, and the tenant id, split the tokens into prompt, tool, memory and response, and join the cost to the outcome event.
:::

**Full answer**

**Why the token price misleads**

A cheaper model that needs twice the tokens per task costs more per task. A prompt change that cuts tokens and lowers the resolution rate raises the cost per resolved ticket while the token dashboard goes green. The lesson's rule is to tie cost to a product outcome, because an optimization without that anchor has no direction.

**Three attribution dimensions**

| Dimension | Key | What it answers |
|---|---|---|
| per user | `user_id` | who costs what, for seat pricing and abuse |
| per task | `task_id` and `route` | which product surface costs what |
| per tenant | `tenant_id` | which customer is profitable |

Instrument all three at the call site on day one. A provider line item carries none of them, and retroactive tagging always misses cases.

**Four token layers**

| Layer | Typical share |
|---|---|
| prompt, the system text and the user input | 40 to 60 percent |
| tool, the results fed back into the context | 20 to 40 percent on agent workloads |
| memory, the prior turns and retrieved documents | 10 to 30 percent |
| response, the model output | 10 to 30 percent |

One bucket hides which layer drives the spend, so you cannot pick the lever.

**The record on every call**

The trace carries the trace id, the three dimension keys, the four layer counts, the cost, and two flags, one for a cached input and one for a batch call. The most accurate attribution pattern joins these traces to the billing export by trace id, which the lesson calls the telemetry joiner.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does the token price alone mislead? Expected: it says nothing about tokens per outcome. A cheaper model that needs twice the tokens per task costs more per task.
- **Level 2:** Why split the tokens into four layers? Expected: one bucket hides whether prompt bloat, tool results, memory or output drives the spend, so you cannot choose the right fix.
- **Level 2:** Why stamp the call at creation instead of tagging the bill later? Expected: the provider line item has no user, task or tenant on it, and retroactive attribution always misses cases.
- **Level 3:** Which attribution pattern is the most accurate, and what does it need? Expected: the telemetry joiner, which joins trace ids to billing. It needs the trace id on every call and a billing export with the same key.

**Wrong answers, and why they fail**

- "Tokens are what we pay for, so tokens are the metric." They are the vendor's unit. The business pays for outcomes, and a cheaper token can mean a more expensive task.
- "Tag the cloud bill by team like any other resource." A model call is a transaction, not an asset. The line item has no team on it unless the call stamped one.
- "Per-tenant cost is enough." Per-task shows which feature to fix and per-user shows abuse. The lesson instruments all three.

:::

## Two caches, and why one did not move the bill

*Level 1 (screening) · concept · about 5 minutes*

A teammate says the service already has caching, because the provider's prompt cache is on. The bill barely moved. Which two kinds of cache exist in a model service, what does each one skip, and why does one of them do nothing for a question that users keep asking?

:::answer Show the answer
:::say Short answer
There are two layers. The provider's prefix cache reuses the attention state of a prompt prefix that an earlier request computed, so the repeated opening tokens get cheaper, but the model still runs. An application-level semantic cache embeds the request and returns a stored answer when a similar question was answered before, so the model call is skipped. The prefix cache cannot serve a repeated question, because the user's part of the prompt still differs token by token and the model still generates the answer.
:::

**Full answer**

**The provider prefix cache**

The provider stores the keys and values of a cacheable prefix. The next request with the same prefix pays a read price instead of a full prefill. The match is prefix only: the first token that differs ends it, so the stable parts of the prompt go first and the user message goes last. The cache lowers the input cost and the time to first token. Output tokens cost the same as before.

**The semantic cache**

Before the call, the application embeds the request and searches for a stored request above a similarity threshold, typically 0.95 or higher. On a hit, it returns the stored answer and no model runs. The hit rate depends on the traffic. The lesson's community numbers put open-ended chat near 10 to 15 percent and structured support near 40 to 70 percent. A simpler exact cache hashes the model, the messages and the temperature, and it serves only deterministic calls.

**Why the bill did not move**

The prefix cache discounts input tokens on a repeated prefix. If the prefix is short, if something in it changes on every request, or if output tokens dominate the bill, there is little for it to save. Repeated questions are a different kind of reuse, and only the semantic cache addresses them.

**Stack them**

Provider caching handles token-identical reuse. Semantic caching handles meaning-identical reuse. The earlier caching lesson combines both, and puts the combined reduction at 50 to 95 percent on a typical application.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which cache returns an answer without running the model? Expected: the semantic cache. The prefix cache still runs the model on the uncached tokens and generates the output.
- **Level 2:** Every user asks a different question under the same system prompt. Which cache helps? Expected: the prefix cache, because the shared prefix is identical and the questions are not.
- **Level 2:** What decides whether a semantic cache is worth adding? Expected: the hit rate on your own traffic, which ranges from about 10 percent on open chat to about 70 percent on structured support, and the cost of a wrong hit.
- **Level 3:** Why does the exact cache refuse to serve a call above temperature zero? Expected: the stored answer was one sample. A call that asks for variation would get a replay instead, which changes the behavior the caller asked for.

**Wrong answers, and why they fail**

- "The prefix cache returns the same answer for the same question." It reuses the attention state of the prefix. The model still generates every token.
- "A semantic cache is a prefix cache with fuzzy matching." It sits in your application, keys on embeddings and skips the model. The prefix cache sits at the provider and keys on exact tokens.
- "One cache is enough." They cover different reuse, identical tokens against identical meaning, and the lesson combines them.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## A lower cache threshold hits more and answers wrong

*Level 2 (working) · tradeoff · about 8 minutes*

Your semantic cache serves 20 percent of requests at a similarity threshold of 0.95. A teammate lowered it to 0.85 in staging. The hit rate rose to 50 percent, and a few cached answers did not fit the question asked. Which threshold do you ship, and how do you decide?

:::answer Show the answer
:::say Short answer
Ship the threshold whose wrong hits you can afford, and measure that instead of guessing. A wrong cached answer is a correctness failure that a user sees, while a miss costs one model call. Keep the strict threshold on the general path, and lower it only where the answers are interchangeable or where a disclaimer is acceptable. A vendor's accuracy figure describes how often a hit was appropriate, not how often your traffic hits, so label pairs from your own traffic at both thresholds.
:::

**Full answer**

**Two numbers that get confused**

The hit rate is the share of requests served from the cache. The accuracy of a hit is whether the stored answer fits the new question. The lesson warns that a vendor's accuracy claim describes match correctness, and that production hit rates are community telemetry that runs from about 10 percent on open chat to about 70 percent on structured support.

**The cost of each error**

A miss costs one model call, which you know to the cent. A wrong hit costs a wrong answer in front of a user, a support ticket and some trust, and only the product can price it. The two thresholds trade one for the other.

**Decide with labeled pairs**

Sample pairs of a new question and the cached answer it would receive at each threshold. Label each pair as fitting or not. At 0.85 and at 0.95 you then have a hit rate and a precision of hits. Expected saving is the hit rate times the cost of a call. Expected damage is the wrong-hit rate times the cost of a wrong answer. Ship the threshold where the second number is acceptable to the product owner.

**A two-tier scheme**

The earlier caching lesson's exercise uses two thresholds: hits at 0.98 return at once, and hits at 0.90 return with a disclaimer that the answer comes from a similar earlier question. Log the tier that served each hit, and compare satisfaction per tier. This keeps the strict path strict and still takes the cheap wins.

**Why some workloads cannot go low**

Code questions hit about 20 to 30 percent at best, because a small change in a code question changes the correct answer. Near-duplicate text is not near-duplicate intent there. Voice agents on a fixed prompt set reach 50 to 80 percent, because the questions really repeat.

**The checks around the threshold**

Run the exact-match cache first, because a byte-identical repeat needs no embedding. Set a lifetime so that stale answers expire. The embedding cost is small, the lesson quotes a per-million-token price of 0.02 dollars for a small embedding model, so the threshold is the lever, not the embedding bill.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is the accuracy number in a vendor's brochure not your hit rate? Expected: accuracy says how often a returned hit was appropriate. The hit rate says how often there was a hit at all, and it depends on your traffic.
- **Level 2:** What does a miss cost, and what does a wrong hit cost? Expected: a miss costs one model call. A wrong hit costs a wrong answer in front of a user, which the product has to price.
- **Level 3:** How do you lower the threshold without lowering the correctness of the strict path? Expected: a two-tier scheme, with strict matches served as they are and medium matches served with a disclaimer, and the tier logged so that satisfaction can be compared.
- **Level 3:** Why do code questions hit so rarely? Expected: a small variant in a code question changes the correct answer, so similar text is not similar intent.

**Wrong answers, and why they fail**

- "Lower the threshold, the savings are bigger." A wrong hit is a correctness failure that a user sees. Its cost is not one model call.
- "Raise the threshold until no hit is ever wrong." The hit rate then approaches the exact-match rate, and the cache stops paying for itself.
- "Use the vendor's accuracy number as the hit rate." The figure describes match correctness, not how often your traffic hits.

:::

## A warm replica all night, or a cold start at eight

*Level 2 (working) · tradeoff · about 10 minutes*

Your serverless endpoint scales to zero overnight. The first request in the morning waits minutes while a 70B model loads, and the product wants the first token within two seconds. One engineer wants a replica that never sleeps. Another calls that a GPU burning money all night. Settle it.

:::answer Show the answer
:::say Short answer
Both are right, and the decision is arithmetic per path. A warm replica costs one GPU hour every hour whether anyone calls or not, and it removes a cold start of several minutes for a large model. An interactive path with a tight first-token target on a large model needs the warm replica, while a small model with a cold start of seconds, or a background path that tolerates minutes, scales to zero. Then shrink the cold start itself, so that fewer paths need a warm replica at all.
:::

**Full answer**

**What a cold start is made of**

The lesson's anatomy for a 70B model on a fresh node: node provision 45 to 60 seconds, image pull 120 to 300 seconds, weights into GPU memory 45 to 120 seconds, engine init 10 to 30 seconds. The sum is 220 to 510 seconds, which is 3 to 8 minutes before one token. The vLLM manual measured one part of that on its own machine: 330 seconds to load 57 GiB of weights.

**The warm-pool arithmetic**

The lesson calls the arithmetic brutal on small models and kind on large ones. You pay 0.85 to 1.50 dollars an hour to avoid a 30 second start on a small model, and about 4 dollars an hour to avoid a 5 minute start on a large one. Five products with one warm replica each are 3,600 GPU-hours a month, called or not. The lesson's threshold: a warm pool becomes mandatory when the first-token target at P99 is under 60 seconds on a model of 70B or more.

**Tier the paths**

| Path | Policy |
|---|---|
| live chat, voice agent | one or two warm replicas |
| nightly classification, batch | scale to zero, a cold start of minutes is fine |
| premium tenant | dedicated warm capacity |

**Shrink the cold start**

Five layers, each removing a phase: a pre-seeded node image removes the image pull, model streaming halves the weight load, a GPU memory snapshot restores the loaded state in a fraction of the time, warm pools hide the rest, and tiered loading keeps weights in host memory. The lesson's table takes a 328 second cold start to about 15 seconds with the layers stacked, a reduction of 22 times. The vLLM manual adds the operational half: keep the weights on local disk, keep the compile cache on a persistent volume, and measure a cold and a warm start for every new image.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which paths get a warm replica first? Expected: the interactive ones with a tight first-token target on a large model, such as live chat or a voice agent.
- **Level 2:** Whose cold start is cheaper to hide, a small model's or a large one's? Expected: in proportion, the large one's. For a small model you pay a full GPU hour to avoid seconds, and for a large one the same hour avoids minutes.
- **Level 3:** Name two mitigations that remove whole phases of the cold start. Expected: a pre-seeded node image removes the image pull, and a GPU memory snapshot removes most of the weight load and the init.
- **Level 3:** What is the break-even request rate for a warm replica? Expected: the rate above which the cost of cold starts, in requests that miss the target, exceeds the hourly price of the idle GPU. The lesson's simulator computes it.

**Wrong answers, and why they fail**

- "Keep one warm replica everywhere, it is the simple answer." It is one GPU hour every hour per product. Five products idle all night cost thousands of GPU hours a month.
- "Scale to zero everywhere and let the first user wait." A first-token wait of minutes on an interactive path is an outage, not a wait.
- "A bigger GPU loads faster." The load is bound by the storage and the copy path. The fix is where the weights live and whether a snapshot exists.

**Related lesson in this course:** [Production inference: SLOs, queues, autoscaling, cold starts, cost and AI gateways](#aiinfra-6)

:::

## Controls that stop a bug from spending the month

*Level 2 (working) · design · about 10 minutes*

Last month a bug in a retry loop spent the whole monthly model budget in two days, and nobody saw it until the invoice. Design the controls that stop the next one, with the thresholds and what each threshold does.

:::answer Show the answer
:::say Short answer
Put a cost tracker on every call and a ladder of thresholds on top of it. At 70 percent of the budget alert, at 85 percent throttle so that every request goes to the cheapest model, and at 95 percent stop so that only cached answers are served and new calls are refused. In front of the ladder, add a rate limit and a daily spend cap per tenant, and a kill switch that pauses a tenant whose spend jumps far above its own history.
:::

**Full answer**

**The tracker**

Every call logs the timestamp, the model, the input and output tokens, the latency, the computed cost, the user, the cache status and the request category. The running total against the monthly budget is the input of every control below. A check that runs nightly is too slow, because a retry loop spends a day's budget in minutes.

**The budget ladder**

| Share spent | Action |
|---|---|
| 70 percent | send an alert |
| 85 percent | throttle: route every request to the cheapest model |
| 95 percent | stop: serve cached responses only, refuse new requests |

Each step buys time for the next. The alert gives people a chance to act, the throttle keeps the service up at lower quality while the spend slows, and the stop protects the budget when nobody acted.

**The per-tenant ladder**

The FinOps lesson gives three controls per tenant for a multi-tenant product:

1. A rate limit at 2 to 3 times the expected peak, with a rate-limit status and a retry header. The tenant feels friction and gets no surprise bill.
2. A daily spend cap at 1.5 to 3 times the contracted ceiling. Crossing it tightens the rate limit and alerts customer success.
3. A kill switch when the spend z-score against the tenant's own baseline passes 4. It pauses the tenant and pages on-call.

The z-score matters because tenants differ by orders of magnitude. A fixed amount is noise for a large tenant and a month of budget for a small one.

**Test the ladder**

The caching lesson's exercise simulates 1,000 requests against a budget of 1.00 dollars and checks that each threshold fires. Its projection exercise forecasts the month from the trailing 7-day average and alerts when the forecast exceeds the budget by more than 20 percent. Both belong in the test suite, because a circuit breaker that was never tripped on purpose is a hope.

**Where it runs**

At the gateway, where every call passes. A control that lives in one application misses the application that has the bug.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why three thresholds and not one hard stop? Expected: the alert gives people time, the throttle buys more time at lower quality, and the stop protects the budget. One hard stop surprises users with no warning.
- **Level 3:** What changes for users during the throttle step? Expected: quality, because every request goes to the cheapest model. The service stays up while the spend slows.
- **Level 3:** Why is the kill switch relative to the tenant's history? Expected: tenants differ by orders of magnitude. A z-score catches a jump for a small tenant and ignores a normal day for a large one.
- **Level 4:** The retry bug spent the budget in two days. Which control fires first? Expected: the daily spend cap or the z-score kill switch fires on the first day. The monthly ladder would only have warned at 70 percent.

**Wrong answers, and why they fail**

- "Set a hard limit at the provider and stop there." The provider limit stops every tenant at once with no warning. The ladder degrades first and isolates the tenant.
- "An alert to the team channel is enough." The incident is a bug at night. The throttle and the stop act without a person.
- "Check the budget nightly." A retry loop spends a day's budget in minutes. The tracker has to run on every call.

:::

## How many reads a cached prefix needs to pay off

*Level 2 (working) · estimate · about 8 minutes*

Your provider charges a 25 percent premium to write a prefix into its cache, and it bills a cache read at a tenth of the normal input price. The cache lives for five minutes. A one-hour variant costs twice the normal input price to write. How many reads does each variant need to pay off, and what rule do you give the team?

:::answer Show the answer
:::say Short answer
With the five-minute cache, one write and one read average 0.675 of the normal cost per request, a saving of about 32 percent, so the cache pays off on the first read. One write and ten reads average 0.205, about 80 percent saved. The one-hour cache charges 2x for the write, so that block needs two reads before it comes out ahead. The rule: cache anything you expect to reuse at least three times inside its lifetime.
:::

**Full answer**

**The arithmetic**

A write costs 1.25 times the normal input price, and a read costs 0.1 times it.

- One write and one read: the two requests average 0.675 of the normal price. That is 32 percent saved on the first read already.
- One write and ten reads: the requests average 0.205 of the normal price, about 80 percent saved.
- The one-hour cache writes at 2 times the normal price. With one read the average sits above the normal price, and with two reads it falls below. The lesson says the one-hour block pays back fast on any batch that reuses the prefix more than five times.

Three reuses inside the lifetime clear the break-even on either variant, which is the rule the lesson gives.

**What breaks the arithmetic**

- A prefix that differs by one token on every request, because of a timestamp, a request id or a reshuffled tool list. Every request writes and none reads.
- A block below the minimum cacheable size, which is 1,024 tokens on the provider in the lesson. A smaller block silently does not cache.
- Requests that arrive in parallel before the first write has landed. Each one pays the write premium, and none reads.

**Verify it**

Read the usage fields on every response: the tokens written to the cache and the tokens read from it. In CI, assert that the second identical request reads more than zero. On the dashboard, split input tokens into cached and uncached, or a traffic drop will look like a cache win.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the five-minute cache pay off on the first read? Expected: the write premium is a quarter and the read saves nine tenths, so the two together already average below the normal price.
- **Level 2:** When does the one-hour cache make sense? Expected: a batch job that reuses the prefix across runs more than five minutes apart, more than five times.
- **Level 3:** Input tokens are down and the bill is flat. What is wrong with the dashboard? Expected: it does not split cached from uncached input, so a drop in traffic looks like a cache win.
- **Level 3:** Ten parallel requests share a prefix that nobody has cached yet. What happens to the arithmetic? Expected: all ten pay the write premium and none reads, so the cache costs more than no cache. Send one request first, then the rest.

**Wrong answers, and why they fail**

- "Caching always saves money." A prefix written once and never read costs 25 percent more than no cache.
- "Pick the one-hour cache, it lasts longer." It writes at twice the normal input price, so a block read once costs more than without the cache.
- "Mark the whole prompt as cacheable." The user message changes every time, so the match ends at the first differing token, and a block below the minimum size does not cache at all.

:::

## Per-token or per-minute billing for a daytime load

*Level 2 (working) · tradeoff · about 8 minutes*

Two inference platforms quote you for the same open model. One bills per million tokens. The other rents a dedicated GPU by the minute. Your traffic is steady through the working day and near zero at night. Which pricing wins, and what number decides it?

:::answer Show the answer
:::say Short answer
Sustained utilization decides it. Per-token billing charges only for what you use, so it wins when traffic is bursty or low and a dedicated GPU would sit idle. Per-minute billing charges for wall-clock time, so it wins once you keep the GPU busy, and the lesson's rule of thumb puts the crossover near 30 percent sustained utilization. A load that runs only in the daytime sits near that line, so measure your utilization over a full week before you sign.
:::

**Full answer**

**Two cost functions for one output**

Per-token pricing reflects the platform's own utilization curve across all of its customers, and you pay for no idle time. Per-minute or per-second pricing reflects exclusivity: the GPU is yours, and the bill runs whether or not a request arrives. The output, a model response, is the same.

**The crossover**

The economics lesson states the rule: above about 30 percent sustained utilization of a dedicated GPU, per-minute starts to beat per-token. Below it, per-token wins because you are not paying for idle. The lesson on managed platforms shows the same shape for reserved capacity on a hyperscaler: the break-even sits around 40 to 60 percent sustained utilization, savings reach up to 70 percent at high utilization, and the reservation is billed when idle.

**Compute it for your own traffic**

1. Take the request count per hour of the day for a week, and the tokens per request.
2. The per-token bill is the token total times the rate.
3. The per-minute bill is the rented hours times the rate. That is every hour unless you scale to zero at night, which brings a cold start every morning.
4. Utilization is the busy time divided by the rented time. Compare it with the crossover.

**What the price does not show**

- Dedicated capacity avoids queueing behind other tenants. The lesson on managed platforms measures a lower first-token median on reserved capacity than on shared on-demand for the same model class.
- A fine-tuned model can change the per-token price. One platform in the lesson serves a fine-tune at the base model's rate, which is a differentiator. A dedicated GPU serves it at the same hourly price either way.
- Non-interactive work has a third option: a batch tier at about half the serverless rate.

**A mixed answer**

Rent dedicated capacity for the daytime floor, and send the overflow and the overnight batch to per-token or batch pricing. The utilization of the dedicated part then stays high, and the bursts never pay for an idle GPU.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does per-token pricing cost more per token than your own GPU time at high utilization? Expected: the platform's margin and its idle time are built into the per-token rate. At high utilization you pay for idle that you do not have.
- **Level 2:** What changes when you scale the dedicated GPU to zero at night? Expected: you stop paying for the night and buy a cold start every morning, so the first requests of the day pay in latency.
- **Level 3:** Why is the dedicated option faster at the tail? Expected: shared on-demand capacity competes with every other customer's traffic, and dedicated capacity does not. That is the gap the lesson on managed platforms measures between reserved and on-demand first-token latency.
- **Level 3:** How does a fine-tuned model change the comparison? Expected: a per-token platform may serve the fine-tune at the base rate or charge a premium for it. A dedicated GPU serves it at the same hourly price either way.

**Wrong answers, and why they fail**

- "Per-token is always cheaper because you never pay for idle." Above the utilization crossover, the per-token rate carries the platform's idle and margin, and your own GPU is cheaper.
- "Dedicated is always cheaper at scale." Only when you keep it busy. A daytime-only load leaves it idle half the time.
- "Compare the headline prices." The two prices have different units. Only your traffic profile turns them into a bill.

:::

## Read the exact-match cache before it ships

*Level 2 (working) · code-reading · about 10 minutes*

Read this exact-match cache from the caching lesson. Why does it refuse every request with a positive temperature, what goes into the key and why, and what would you change before it runs in production?

```python
class ExactCache:
    def __init__(self, max_size=1000, ttl_seconds=3600):
        self.cache = {}
        self.max_size = max_size
        self.ttl = ttl_seconds
        self.hits = 0
        self.misses = 0

    def _hash(self, model, messages, temperature):
        key_data = json.dumps({"model": model, "messages": messages, "temperature": temperature}, sort_keys=True)
        return hashlib.sha256(key_data.encode()).hexdigest()

    def get(self, model, messages, temperature=0.0):
        if temperature > 0:
            self.misses += 1
            return None
        key = self._hash(model, messages, temperature)
        if key in self.cache:
            entry = self.cache[key]
            if time.time() - entry["timestamp"] < self.ttl:
                self.hits += 1
                entry["access_count"] += 1
                return entry["response"]
            del self.cache[key]
        self.misses += 1
        return None

    def put(self, model, messages, temperature, response):
        if temperature > 0:
            return
        if len(self.cache) >= self.max_size:
            oldest_key = min(self.cache, key=lambda k: self.cache[k]["timestamp"])
            del self.cache[oldest_key]
        key = self._hash(model, messages, temperature)
        self.cache[key] = {"response": response, "timestamp": time.time(), "access_count": 1}
```

:::answer Show the answer
:::say Short answer
The cache serves deterministic calls only. A positive temperature asks for sampled variation, and a replayed answer would remove that variation without telling the caller, so the cache treats those calls as misses and never stores them. The key is a hash of the model, the full message list and the temperature, serialized with sorted keys so that the same request always produces the same bytes. Before production, the key needs every other field that changes the answer, the eviction needs a least-recently-used policy instead of a full scan for the oldest entry, and the expiry needs a sweep, because an expired entry is only removed when someone reads it.
:::

**Full answer**

**The temperature guard**

Both `get` and `put` return early above zero. The lesson's rule is that exact caching works for deterministic calls: the same model, the same prompt, temperature zero. Serving a stored sample to a caller who asked for variation changes the behavior silently, which is worse than a miss.

**What the key holds, and what it misses**

The key covers the model, because the same prompt on another model is another answer, the whole message list, because the system prompt and the context are part of the request, and the temperature. `sort_keys=True` makes the serialization stable, so two callers who build the same dictionary in a different order still hash alike. The key does not cover other fields that change the answer: the sampling parameters beyond temperature, the output limit, the tool definitions and the response format. Add them, or the cache returns an answer produced under different settings.

**Expiry is lazy**

The lifetime is checked on read. An entry past its lifetime stays in memory until a read finds it or an eviction drops it. A periodic sweep, or an expiry check during `put`, keeps the memory honest.

**Eviction is a full scan, oldest first**

At capacity, `put` scans every entry to find the oldest timestamp. That is linear work on every insert once the cache is full, and it evicts by insertion time, so a popular entry that was inserted early goes first. The lesson's first exercise asks for least-recently-used eviction on the last access time, which the `access_count` field hints at but does not implement.

**Prove that it pays**

The cache counts hits and misses. The lesson's cost tracker logs a cache status on every call and computes the saved cost from the hits with the pricing table. Wire that in before you argue about the hit rate.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why serialize with sorted keys? Expected: the order of a dictionary can differ between callers, and a different byte order gives a different hash for the same request.
- **Level 3:** Which request fields are missing from the key? Expected: anything else that changes the answer, such as the other sampling parameters, the output limit, the tool definitions and the response format.
- **Level 3:** What does the eviction do at capacity, and what does the exercise ask for instead? Expected: it scans all entries for the oldest timestamp and drops it. The exercise asks for least-recently-used eviction on the last access time.
- **Level 4:** How would you show that this cache pays for itself? Expected: log the cache status on every call and compute the saved cost from the hits with the pricing table, as the lesson's cost tracker does.

**Wrong answers, and why they fail**

- "The temperature check is pointless, a cached answer is a good answer." A positive temperature means the caller wants variation. A replay removes it without telling anyone.
- "Hash only the user message." The same question under a different system prompt, model or tool set has a different correct answer.
- "The lifetime removes expired entries." It only hides them on read. The entry stays in memory until a read or an eviction removes it.

:::

## Ten parallel tool calls, ten cache writes, no reads

*Level 2 (working) · debug · about 8 minutes*

An agent fans out ten tool calls at once for every user question. All ten share the same long system prompt, and prompt caching is on. The bill is several times what the cache should allow, and the usage fields show cache writes on nearly all calls and almost no cache reads. What is happening?

:::answer Show the answer
:::say Short answer
All ten requests reach the provider before the first one has finished writing the prefix into the cache. Each one sees a miss, each one pays the write premium, and none of them reads. The fix is sequential-first: send one request alone, let its cache write land, then fan out the other nine. It adds about one write latency to the first tool call and removes the inflation.
:::

**Full answer**

**The mechanism**

Cache writes happen per request. The lesson puts the first write at about 300 ms after the provider sees the prompt. Requests that arrive inside that window find nothing to read, so each of them writes. Ten writes and zero reads, on every user question that finds the prefix cold. A question that arrives while an earlier write is still inside the cache lifetime reads it, so the trap shows when the questions are further apart than that lifetime. The lesson reports a bill of 5 to 10 times the expected cached cost from this pattern alone.

**Read the usage fields**

Each response reports the tokens written to the cache and the tokens read from it. In this incident the written count is high on every request and the read count is near zero. That is the signature. A later sequential request with the same prefix does read, which separates this case from a prefix that never matches.

**The fix**

Send the first request alone and wait for it to return. Its write has landed by then. Fan out the remaining nine, and each of them reads. The cost is about 300 ms on the first tool call. The lesson's exercise asks for the same fix without adding end-to-end latency: warm the prefix with one call at the start of the session, before the first fan-out, so the first tool call already reads.

**Rule out the other cause**

A prefix that carries dynamic text looks the same in the usage fields: writes on every request, no reads ever. The lesson's example has the time to the minute, a user id and a reshuffled example order inside the system prompt. One field report moved the hit rate from 7 to 74 percent by moving that text below the cache boundary. Check the prompt template before you blame the fan-out.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How do you tell the fan-out trap from dynamic text in the prefix? Expected: both show writes and no reads. After the fan-out trap, a later sequential request with the same prefix reads. With dynamic text, nothing ever reads.
- **Level 3:** How do you fix the fan-out without adding latency for the user? Expected: warm the prefix with one call when the session starts, so the first fan-out already reads.
- **Level 3:** Does a self-hosted prefix cache have the same trap? Expected: the lesson says the self-hosted caches follow the same prefix pattern at your own compute, so measure the cached tokens on a fan-out before you assume they are shared.

**Wrong answers, and why they fail**

- "Caching is on, so the provider should deduplicate them." Writes are per request, and the cache can be read only after the first write has landed.
- "Shorten the system prompt." That lowers every bill a little and leaves ten writes and zero reads in place.
- "Turn caching off, it costs more." It costs more only because of the arrival pattern. Sequential-first turns ten writes into one write and nine reads.

**Related lesson in this course:** [Start here: backend and distributed systems, ten topics and the best free resources](#systems-1)

:::

## Two cache hit rates from one scrape

*Level 2 (working) · debug · about 8 minutes*

A dashboard panel shows the prefix cache hit rate of a self-hosted server at 94 percent. Over the same run, the server's counters say that it computed 104,057 prompt tokens and took 182,079 from the cache. Both readings come from one scrape of the same endpoint. Which one do you trust for a cost decision, and why do they differ?

:::answer Show the answer
:::say Short answer
Trust the counters. The gauge holds the hit rate of the last prefill interval that the scheduler logged, and at idle it keeps the value from the last batch, which was a shared-prefix benchmark. The counters add up every prefill token since the server started, and their ratio over the whole run is 0.636, not 0.942. For a cost decision, compute the rate from the counters over a time window.
:::

**Full answer**

**Three kinds of series**

A gauge is a value the scheduler overwrites on each log interval. A scrape sees the latest value only. A counter is a total that only grows, and you read it as a rate over a window. A histogram is a set of counters, one per bucket, and you read percentiles from it over a window.

**The two hit rates**

The gauge divides the hit tokens of one log interval by the hit tokens plus the computed tokens of that interval. When nothing runs, it keeps its last value. The counters carry the same two quantities since startup, split by mode: input for computed tokens, and device, host and storage hits for cached tokens. Over the whole run, 182,079 cached tokens against 286,136 prefill tokens in total give 0.636. The gauge at 0.942 describes the shared-prefix benchmark that ran last. Both are correct, and they answer different questions.

**The windowed rate**

The HELP text of the counter gives the formula, and in PromQL it reads:

```promql
sum(rate(sglang:prefill_effective_tokens_total{mode=~".*_hit"}[5m]))
  / sum(rate(sglang:prefill_effective_tokens_total[5m]))
```

One caveat from the code: the hit modes add raw hit counts, so after a retraction the same tokens can count twice. The input mode excludes the re-count. The manual's run had no retractions, so its numbers are exact.

**Why this is a cost question**

A hit rate decides whether you restructure prompts, add a cache-aware router or buy memory. A gauge from the last benchmark says the prompts are fine. The counters say that more than a third of the prompt tokens over the run were computed. The lesson on caching economics says the same for provider caches: measure your own hit rate from the usage fields on every response, and do not take a published figure as yours.

**What to alert on**

Alert on counters and histograms over a window. Alert on a gauge only when the condition lasts for several minutes, such as queued requests above zero or token usage near one. Read the HELP text and the code before you build a panel on a metric. The manual found one utilization gauge that stays at zero at the version it pinned.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does a gauge answer, and what does a counter answer? Expected: a gauge answers what happened in the last interval. A counter answers how much happened since the start, and a rate over a window turns it into a trend.
- **Level 3:** Why can the counter-based rate overstate the hits after retractions? Expected: the hit modes add raw hit counts, so a retracted request that runs again counts its cached tokens twice, while the input mode excludes the re-count.
- **Level 3:** Which gauges may page you, and under what rule? Expected: queued requests above zero and token usage near one, only when the condition holds for several minutes, never on one scrape.
- **Level 4:** A panel on this server shows utilization at zero during an outage. Why? Expected: that gauge stays at zero at the pinned version because of a known regression, so the panel shows an idle fleet. Read the HELP text and the code before building on a metric.

**Wrong answers, and why they fail**

- "The gauge is the newest value, so it is the most accurate." It is a snapshot of one interval, and it keeps its last value at idle.
- "Average the two numbers." They answer different questions, and the counters already contain the whole run.
- "The real rate is lower, so turn the cache off." A rate of 0.636 means a third of the prompt tokens were computed. The fix is the prompt layout or the routing, not the cache.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Which gateways fit in a 20 ms tail budget

*Level 2 (working) · estimate · about 8 minutes*

Your SLA is a P99 time to first token under 320 ms. The model alone measures 300 ms at P99. You are choosing a gateway to put in front of it. Which classes of gateway fit in the budget, and what do you do when the one you want does not?

:::answer Show the answer
:::say Short answer
The gateway has at most 20 ms at the tail. An edge-managed gateway at 1 to 3 ms and a high-performance gateway at 3 to 8 ms fit, a lightweight proxy at 5 to 15 ms fits with little margin, and a control-plane gateway at 20 to 40 ms does not. If you need the features of the slow one, split the roles: keep the fast gateway on the request path, run the heavy features out of band, or buy the budget back from the model with a faster first token.
:::

**Full answer**

**The budget**

The target is 320 ms and the model takes 300 ms, so the gateway may add 20 ms, and that is at the tail. A P99 target means the gateway's own P99, not its median, and a gateway that is quick when idle can be slow under load. The sum of the two tails is a screening estimate only. Before you commit to the SLA, measure the end-to-end first-token P99 through the gateway under load.

**The classes**

| Class | Overhead in the lesson | Fits |
|---|---|---|
| edge-managed, zero-ops | 1 to 3 ms | yes |
| high-performance, built on a mature API gateway | 3 to 8 ms | yes |
| lightweight open-source proxy | 5 to 15 ms | with little margin |
| control plane with guardrails and audit | 20 to 40 ms | no |

The lesson's rule of thumb matches: for a P99 under 100 ms, pick the edge or the high-performance class. For a P99 under 500 ms, any class works.

**When you want the slow one**

The control-plane class brings PII redaction, jailbreak detection and audit trails. Three ways to keep them inside the budget:

1. Split the roles. Put the fast gateway on the request path and run observability and audit off the path. The lesson notes that production deployments combine an observability tool with a scale gateway in exactly this split.
2. Keep only what must be inline. Redaction has to run before the provider sees the prompt, so it stays on the path. Audit and tracing do not.
3. Buy back budget from the model. Prefix caching lowers the first-token time, and a faster model tier does too.

**Scale decides as well**

The lightweight proxy breaks down around 2000 requests per second with an 8 GB footprint in the published benchmark, and the lesson places it below 500 requests per second. If the traffic will grow past that, the high-performance class is the only one that fits both the latency and the scale.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why measure the gateway at P99 and not at its median? Expected: the SLA is a P99, and the gateway's tail adds to the model's tail.
- **Level 3:** The slow gateway's value is PII redaction. How do you keep it inside the budget? Expected: keep the redaction inline because it must run before the provider sees the prompt, move observability and audit off the path, and then measure whether the remaining overhead fits.
- **Level 3:** Traffic will triple next year. Which class survives? Expected: the lightweight proxy breaks down around 2000 requests per second, so plan the move to the high-performance class before that.

**Wrong answers, and why they fail**

- "Every gateway adds a few milliseconds, pick on features." The lesson's overheads run from 1 to 40 ms, and 40 ms is twice this budget.
- "Put the gateway behind the model, not in front." The gateway routes and falls back before the model. Behind the model it protects nothing.
- "Add the gateway's median to the model's P99." Two tails do not add that way. Measure the gateway's own tail under load.

**Related lesson in this course:** [Systems 11: design docs, writing a design so it can be challenged](#systems-11)

:::
