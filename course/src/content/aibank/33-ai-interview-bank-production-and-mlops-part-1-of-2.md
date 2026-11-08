---
track: aibank
title: "AI interview bank: Production and MLOps (part 1 of 2)"
short: Production and MLOps 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## What a week in shadow mode proves

*Level 1 (screening) · concept · about 5 minutes*

A teammate wants to skip the canary. The new model ran in shadow for a week with no errors and a flat bill, so they call it proven. What does that week show, and what does it leave open?

:::answer Show the answer
:::say Short answer
Shadow mode copies the production requests to the candidate and logs its outputs, and no user sees them. It shows that the candidate does not crash, does not refuse more often, does not cost more and does not write longer answers. It cannot show that users prefer the answers, because no user read one. Shadow is a smoke test, and the canary is the first quality test.
:::

**Full answer**

**What shadow records**

For each request, the candidate output is logged next to the production output:

- the output text, as a diff against production;
- the token counts, which give the cost delta;
- the latency;
- refusals and hard errors.

**What it catches**

Cost blow-ups, length regressions, a change in the refusal rate and hard errors. These are the failures that make a launch expensive or embarrassing, and shadow finds them with zero user impact.

**What it misses**

A quality change that a user would notice. The candidate output never reaches a person, so there is no thumbs-down, no ticket and no retention signal. A model that gives shorter, cheaper and wrong answers passes shadow.

**What comes next**

A canary exposes a growing share of users to the candidate, with a gate at each step. The lesson gates on five metrics: latency percentiles, cost per request, error and refusal rate, the output length distribution, and the user feedback rate. The progression runs from 1 percent to 10, 25, 50, 75 and 100 percent. The first user feedback appears here, not in shadow.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which signal does shadow give that an offline eval does not? Expected: the behavior of the candidate on the real request mix, including cost and output length per request.
- **Level 2:** Shadow shows the cost per request is 40 percent above production. What do you do? Expected: stop before any canary. A cost more than 20 percent above the baseline is a gate breach, and a model that breaks the unit economics is a rollback case.
- **Level 2:** Why can shadow not measure user feedback? Expected: no user sees the candidate output, so there is nothing for a user to rate or report.
- **Level 3:** Shadow doubles the load on your model service. How do you keep it affordable? Expected: send a fixed share of requests to the candidate instead of all of them, and log the same metrics for that share.

**Wrong answers, and why they fail**

- "Shadow passed, so the quality is fine." Shadow has no user, so it measures cost, length, errors and refusals only.
- "Shadow is a canary at zero percent." A canary returns the candidate output to real users and gates on their feedback. Shadow never returns an output to a user.
- "A week in shadow replaces the offline eval." The eval judges correctness on a labeled set. Shadow records behavior on live traffic. They answer different questions.

:::

## What must exist before the first chaos experiment

*Level 1 (screening) · concept · about 6 minutes*

A new team wants to run its first chaos experiment against the model service next week. What do you check for before you agree, and what goes wrong when one piece is missing?

:::answer Show the answer
:::say Short answer
Five things have to be in place: service level indicators with objectives, observability with traces, metrics and logs, an automated rollback, structured runbooks and an on-call owner. Each one lets you measure the experiment, stop it or repair the damage. When one is missing, the experiment is not a test. It is an incident that you scheduled.
:::

**Full answer**

**The five prerequisites**

1. **SLI and SLO.** Without a target you cannot say whether the experiment hurt anything.
2. **Observability.** Traces, metrics and logs on a dashboard. You must see the effect while it happens.
3. **Automated rollback.** The policy-flag rollback from the progressive delivery lesson. A rollback that needs a redeploy is too slow for an experiment.
4. **Runbooks.** Structured sections: symptom, hypothesis, verify, act. The on-call reads them under pressure.
5. **On-call.** Someone who responds when the experiment finds something.

**The first experiments**

Start with one pod kill of a decode replica under steady traffic, and watch the rerouting and the recovery. If that looks safe, graduate to network chaos. The first model-specific experiment is one provider returning rate-limit errors for a few minutes, to see the fallback engage. Most teams learn here that their fallback was never fully tested.

**The cadence**

Weekly small experiments in staging or on a small share of production. Monthly game day on one scenario with a postmortem. Quarterly cross-team audit with a dependency map.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which experiment goes first, and why? Expected: kill one decode replica under steady traffic, because it tests rerouting and recovery with a small blast radius.
- **Level 2:** Name one failure a generic network chaos tool cannot reproduce for a model service. Expected: a KV cache eviction storm under burst load, or a prompt that stalls the tokenizer.
- **Level 2:** Why does the rollback matter more than the dashboard during an experiment? Expected: the dashboard shows the harm, and the rollback stops it. Without the rollback the harm continues until someone fixes it by hand.
- **Level 3:** The team wants staging only. When is production the right place? Expected: when staging cannot reproduce the traffic shape, the cache state or the provider behavior, and only with the safety guards in place.

**Wrong answers, and why they fail**

- "Skip the prerequisites and learn by doing." Without an SLO, a rollback and an on-call owner, the experiment is an outage that you caused on purpose.
- "A dashboard is observability." Chaos needs traces, metrics and logs with trace-id correlation, so that you can tell experiment failures from natural ones.
- "Run the biggest experiment first to find the biggest risk." Start with one replica kill, then grow the blast radius.

:::

## Which agent spans are CLIENT and which are INTERNAL

*Level 1 (screening) · concept · about 5 minutes*

You add tracing to an agent. In one run it calls a model API twice, runs two tools inside its own process and sends one request to a tool server on another machine. Which of these operations get a CLIENT span, which get an INTERNAL span, and why does anyone care?

:::answer Show the answer
:::say Short answer
A call that leaves the process gets a CLIENT span: the two model API calls and the request to the remote tool server. The agent loop step and a tool that runs in your own process get INTERNAL spans. The kind tells a backend the direction of each call, so it can show which operations left the process and which did not.
:::

**Full answer**

**The tree for this run**

```text
invoke_agent            INTERNAL
 ├── chat               CLIENT
 ├── execute_tool       INTERNAL
 │    └── remote call   CLIENT
 ├── execute_tool       INTERNAL
 └── chat               CLIENT
```

Every span shares one trace id. Each child carries the id of its parent. That is what makes the run one tree instead of six loose records.

**The rule**

CLIENT marks a call across a process boundary: a model provider, a tool server, a hosted agent service. INTERNAL marks the agent's own loop steps and any tool that runs in the same process. The conventions apply the same rule to the agent span itself: an agent that runs as a remote service is CLIENT from the caller, and an in-process agent framework is INTERNAL.

**The attributes that go with each kind**

| Span | Attributes |
|---|---|
| model call | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.id` |
| tool call | `gen_ai.tool.name`, `gen_ai.tool.call.id` |
| agent run | `gen_ai.agent.name`, `gen_ai.agent.id` |

**Why it matters**

Backends draw a waterfall from the kinds and the parent links. A CLIENT span with no response id cannot be matched to the provider log. A tool span with no parent is an orphan, and you can no longer see which agent step caused the call.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What joins the spans into one tree? Expected: one shared trace id, and a parent span id on every child.
- **Level 2:** The agent calls a hosted agent service instead of a local one. What kind is that span? Expected: CLIENT, because the agent runs in another process.
- **Level 2:** Which attribute lets a dashboard split cost by provider? Expected: `gen_ai.provider.name`, and multi-provider dashboards break when it is missing.
- **Level 3:** A sub-agent runs inside the same process. Does it start a new trace? Expected: no. It is a child span under the parent agent span, so the whole run stays in one trace.

**Wrong answers, and why they fail**

- "Every tool call is a CLIENT span." A tool that runs in your process is INTERNAL. Only the call that leaves the process is CLIENT.
- "The kind is decoration." Backends read the kind to show direction, and the conventions set it per span category.
- "Start a new trace for each tool call, for isolation." Separate traces lose the parent link, so you cannot see which step caused the call.

**Related lesson in this course:** [MLOps platforms: MLflow and Kubeflow](#aiinfra-8)

:::

## Why a higher eval score still needs an experiment

*Level 1 (screening) · concept · about 5 minutes*

Your new prompt scores higher than the old one on your labeled set. A product manager asks why you still want a randomized online test before the full launch. Give the two-minute version.

:::answer Show the answer
:::say Short answer
An eval tells you whether the model can do the task on a fixed, labeled distribution. A randomized test with live users tells you whether users notice and care. A prompt can win on the labeled set and move no product metric, or move it the wrong way. You need both: the eval blocks a regression before any user sees it, and the experiment confirms the product effect after.
:::

**Full answer**

**Two different questions**

An eval runs offline on a labeled set with a judge, which can be a rubric, a model or a person. It answers: is the output correct, helpful and safe on this distribution?

An A/B test runs online with live users assigned at random. It answers: does the variant move the user-level metric that matters, such as retention or task completion?

**Why one is not enough**

Every senior engineer can name a feature that shipped because it felt better, with no experiment. Many of them regressed a product metric that nobody watched for months. The eval cannot see user preference. The experiment cannot catch a regression before exposure. Each one covers the blind spot of the other.

**What to test online**

The lesson names three testable axes:

1. Prompt wording and structure. Metrics: task success, retention, cost per request.
2. Model choice. Metrics: task accuracy, cost per request and latency P99 together.
3. Generation parameters such as temperature and top-p. Metric: task-specific.

**The order**

Eval first. Then shadow and a canary to prove the variant is stable. Then an A/B test at a 50 percent split when the variant is a distinct alternative. When it is only an improved version of the same behavior, the canary can go to 100 percent without the A/B step. Improved means that the eval showed the gain. The canary gates do not measure task completion, so the skip trusts the eval for it.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Name one metric an experiment produces that an eval cannot. Expected: a user-level metric such as retention, conversion or the thumbs-down rate.
- **Level 2:** The canary passed, and the experiment shows a small drop in conversion. Ship? Expected: not by default. Write the escalation criterion before the test starts, and treat a negative primary metric as a stop.
- **Level 2:** When do you skip the experiment after a canary? Expected: when the new version is an improvement of the same behavior, not an alternative with a different cost curve or tone.
- **Level 3:** Why does model non-determinism change the sample size? Expected: identical inputs give different outputs, so the effective sample is smaller than the nominal one. The lesson multiplies the required sample by about 1.3 to 1.5.

**Wrong answers, and why they fail**

- "The eval set is larger, so it is more reliable." The eval set is fixed and labeled, and it measures correctness, not what users prefer.
- "Run the experiment and skip the eval to save a week." Without the eval, a regression reaches users before anyone can see it.
- "If the eval and the experiment disagree, the experiment is wrong." They measure different things. A correct answer that users dislike is a real result.

:::

## An even split that lands at 47 to 53

*Level 2 (working) · debug · about 8 minutes*

An experiment assigns users evenly to control and variant. After a week the dashboard shows 47 percent of users in control and 53 percent in the variant, and the variant is ahead on the primary metric. What do you conclude, and what do you do next?

:::answer Show the answer
:::say Short answer
Do not read the result. A configured even split that delivers 47 to 53 over a week of traffic is a sample ratio mismatch, which means the assignment or the logging is broken and the two groups are no longer comparable. Find the cause in the assignment path, fix it, and start the experiment again.
:::

**Full answer**

**What the check says**

An assignment hash puts each user into an arm. Over a week, the delivered split should sit very close to the configured one. When it does not, the lesson's answer is blunt: something is broken. Both experiment platform types in the lesson run this check for you, and it belongs in front of every readout.

**Why the win is void**

Whatever lost users from one arm can be correlated with the outcome. If slow clients fail before they log an exposure in one arm, that arm looks faster and happier. The measured lift is then the dropout, not the variant. No correction after the fact restores the randomization.

**Where to look**

1. **The assignment function.** The production application capstone assigns with a deterministic hash of the user id, so that one user stays in one arm. A random draw per request, or a hash on a field that changes, breaks the split.
2. **Exposure logging.** One arm may drop events, for example when the variant path logs after a call that can fail.
3. **Client errors.** A variant that crashes before it logs removes its users from the count.
4. **Bots and retries.** A bot or a retry loop that lands in one arm inflates it.
5. **Caches.** A cache in front of the assignment can serve one arm's decision to many users.

**Then**

Fix the cause, discard the data, and restart. Pre-register the mismatch check so that it blocks the readout automatically, and nobody has to argue about a winning variant.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why hash the user id instead of drawing an arm at random on each request? Expected: the same user lands in the same arm on every request, so the experience is consistent and the exposure count is per user.
- **Level 3:** Name two causes that put more users in the variant than in control. Expected: a logging failure that drops control exposures, or a variant path that treats bots or retries differently.
- **Level 3:** Can you correct the mismatch statistically and keep the result? Expected: no. The mismatch shows that the groups are not comparable, and no correction restores the randomization.

**Wrong answers, and why they fail**

- "Three percent is within noise." Over a week of traffic, that gap under a fair split is very unlikely, and the mismatch check exists to flag exactly this case.
- "The variant wins by more than the gap, so ship it." The gap can be correlated with the outcome, so the lift can be the dropout itself.
- "Drop variant users until the groups match." Removing users after the fact adds a second bias on top of the first.

:::

## Detect that the questions changed when the evals did not

*Level 2 (working) · concept · about 8 minutes*

Your eval scores have been flat all year. A product owner tells you that what users ask has changed a lot since spring. How do you detect that change from telemetry, and what do you do with the result?

:::answer Show the answer
:::say Short answer
Embed the prompts, pool them per week, and compare the week with a trailing baseline using a population stability index or a KL divergence. A rising score means the input distribution moved, even when the scores on your fixed eval set did not. Alert above a threshold, then sample and label prompts from the new distribution, refresh the eval set, and recheck routing and prompts against it.
:::

**Full answer**

**Why the evals cannot see it**

An eval runs the model on a fixed, labeled set. It measures the model on last spring's questions. When the questions change, the eval set does not, so the score stays flat while the product quietly serves a different population.

**The detector**

The capstone runs a weekly job. It pools the prompt embeddings of the week and computes the PSI against the trailing 4-week baseline. The key terms table gives the usual reading: a PSI above 0.2 signals a meaningful shift. The sample output shows a quiet week at 0.08, below that threshold. The same job can use a KL divergence on the same embeddings. Track the eval score trend next to it, so that both views sit on one page.

**Per application, not only global**

A global score averages the drift away. The capstone's exercise computes the PSI per application id, which shows which surface moved. A support bot and a code assistant rarely drift together.

**What to do with a real shift**

1. Sample prompts from the new distribution, label them, and refresh the eval set.
2. Rerun the evals on the refreshed set. A flat score on the old set says nothing about the new one.
3. Recheck anything trained or tuned on the old distribution: a routing classifier, the prompt templates, the cache thresholds.

**Where it lives**

In the observability plane: spans land in the span store, the weekly job reads them, writes a metric, and the alert chain picks it up.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What is the difference between a PSI on prompts and a falling eval score? Expected: the PSI measures the inputs, the eval measures the model on fixed inputs, and the first can move while the second stays flat.
- **Level 2:** Why run the detector per application id? Expected: a global score averages the drift away, and the per-application view shows which surface moved.
- **Level 3:** What goes wrong with a one-week baseline? Expected: weekly seasonality looks like drift, and the baseline moves along with the inputs it should measure.
- **Level 3:** The PSI crossed the threshold after a marketing campaign. Is that a problem? Expected: it is a real shift in the inputs. The question is whether quality held on them, so sample, label and evaluate.

**Wrong answers, and why they fail**

- "Flat eval scores mean no drift." The eval set is fixed, so it cannot see the inputs change.
- "Compare the raw prompt strings." Wording varies on every request. Embeddings capture the topic distribution.
- "Alert on any score above zero." Small values are noise. The capstone's threshold is 0.2.

:::

## Half an answer and then silence

*Level 2 (working) · debug · about 8 minutes*

Your demo streams tokens to the page over server-sent events. Users report that the page sometimes shows half an answer and then stops, with no message. The server log shows a model exception on exactly those requests. Why does the user see nothing, and how do you fix the protocol?

:::answer Show the answer
:::say Short answer
The server sends the status line with status 200 before the first token. When the model fails after that, the status cannot change, so the client sees a stream that ends early and nothing else. Send an `error` event inside the stream, and make the page show that event as an error. Also stop the generator when the client disconnects, so that a closed tab stops the model.
:::

**Full answer**

**The protocol problem**

A streamed response has one status line, and it goes out first. Every token after it is a body chunk. An exception in the generator after the first token cannot turn a 200 into a 500. The connection closes, and the page has no way to tell a short answer from a failure.

**The fix in the lesson**

The stream generator catches the exception and yields one more event:

```text
event: error
data: {"code":"model_error","message":"...","hint":"...","request_id":"..."}
```

Then it returns. The page reads each frame and handles three event names: `token` appends text, `done` ends the request and shows the totals, and `error` shows the message and the hint. The error carries a request id, so a user report maps to one log record without storing any input.

**Two details that make it hold**

- The page buffers the incoming bytes and cuts frames at the blank line, because a network chunk can end in the middle of an event. A parser that treats each chunk as one event breaks on long answers.
- `json.dumps` escapes a newline inside a string, so each event has one data line. A raw newline inside the data would end the event early.

**Stop the model when the user leaves**

When the user closes the tab, the next write fails with a broken pipe. The handler catches it and closes the generator, so the model stops and the request costs nothing more. The lesson also sets a socket timeout on the handler class, so a client that stops sending does not hold a server thread.

**Log the failure**

The request handler records one log line for every request in its `finally` block, with the route, the status, the error code, the latency and the input length. A stream that failed with an error event appears there with its code, so the failures are countable.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why can the server not send a 500 when the model fails halfway? Expected: the status line went out before the first token, and a response has one status.
- **Level 2:** A user closes the tab halfway through. What should the server do? Expected: the write fails with a broken pipe, the handler closes the generator, and the model stops.
- **Level 3:** Why does the page buffer the bytes instead of parsing each chunk as an event? Expected: a chunk can end in the middle of an event, so the reader keeps the partial text until the blank line arrives.
- **Level 3:** What goes into the error event besides the message? Expected: a stable code that tests can compare, a hint with one action, and the request id that joins the report to a log record.

**Wrong answers, and why they fail**

- "Buffer the whole answer and return JSON instead." That removes streaming, and the user waits for the last token on every request.
- "Send the error text as another token." The page cannot tell an error from model output, and the done event never arrives.
- "Retry the request on the server when the model fails." The user already has half an answer. A retry duplicates output and doubles the cost.

:::

## How many samples a one percent canary gives a gate

*Level 2 (working) · estimate · about 8 minutes*

Your service handles 1,000 requests per minute. The canary opens at one percent, and the gate runs every five minutes. About how many data points does one gate check see, and which gates can you trust at this step?

:::answer Show the answer
:::say Short answer
One percent of the 1,000 per minute is 10 requests per minute to the canary, so a five-minute window holds about 50 points and a fifteen-minute window about 150. That is enough to read latency and error rates, and far too few to read user feedback. Gate the first step on latency, cost, errors and output length, and apply the feedback gate at a later step.
:::

**Full answer**

**The arithmetic**

The lesson's cadence is a gate check every 5 to 15 minutes, depending on volume. At 1 percent of a 1,000 per minute load, the canary receives 10 requests per minute, which gives 50 to 150 data points per window.

**What each gate needs from those points**

| Gate | At about 50 points |
|---|---|
| Latency P50 and P95 | readable, with a wide band |
| Latency P99 | one or two samples decide it, so hold more than one window |
| Cost per request | every request reports its tokens, so a large shift shows |
| Error and refusal rate | a baseline of a few percent gives a handful of events, so it is noisy |
| Output length distribution | rough, but a large shift shows |
| User feedback | only some users rate an answer, so a window holds a few ratings at most |

**The next step changes the picture**

At 10 percent the canary sees about ten times more points per window. The feedback gate becomes usable there. This is why the progression pauses at each step: the pause is not a formality, it is the time the gate needs to collect its samples.

**Write the dwell rule down**

For each step, state the number of windows that must pass with every gate green before the share rises. A gate that needs two windows to confirm a breach doubles the exposure of a real regression, so write that trade-off next to the rule.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** At which step does the user feedback gate become usable? Expected: at 10 percent, where the canary sees about ten times more points per window.
- **Level 2:** Why does a longer window not fix the first step? Expected: a longer window adds points slowly, and a regression runs for the whole window before the gate can fire.
- **Level 3:** Traffic falls to a tenth at night. How does the plan change? Expected: the same share gives about one request per minute, so lengthen the dwell, start at a higher share, or run the ramp during the day.
- **Level 3:** A breach must hold for two windows before the gate fires. What does that cost? Expected: a real regression keeps running through both windows until the halt, so the rule trades fewer false alarms for a longer exposure.

**Wrong answers, and why they fail**

- "One percent is safe, so the gates work at one percent." The share is safe for users, and most gates are blind at that sample size.
- "Check every minute for faster detection." A one-minute window at this step holds about ten points, which cannot give a percentile.
- "Start at 25 percent for better statistics." A quarter of the users see the new model before any gate has fired once.

:::

## Make the next rollback take seconds

*Level 2 (working) · design · about 10 minutes*

Last quarter a bad model launch took three hours to undo, because the only way back was a new deployment. You own the release path now. Design it so that the next time, the way back takes seconds. Name the pieces and say what each one holds.

:::answer Show the answer
:::say Short answer
Separate the policy from the model. Keep the traffic split in a feature flag that a configuration change flips, and keep the model in a registry under a pinned digest that never upgrades on its own. A rollback is then two actions: revert the flag, and point the pin at the previous digest, which also restores the prompt and template version pinned with that model. Nothing is rebuilt and nothing is redeployed.
:::

**Full answer**

**Two things change in a launch**

1. **The policy.** Which share of traffic goes to which model. It lives in a feature-flag system, and a flip takes seconds.
2. **The model.** The artifact itself. It lives in a registry with a content digest. A pinned digest does not move when a new build appears.

A deployment couples the two: to change the policy you ship a new build. The lesson's rule is blunt: if your stack needs a redeploy to roll back, fix that before you roll anything out.

**The rollback**

Revert the flag, set the pinned digest to the previous one, and restore the gate thresholds that went with it. The lesson puts the whole sequence at seconds, against hours for a redeploy. In its opening story, the redeploy took three hours and the flag flip would have taken 30 seconds.

**The same flag runs the canary**

The canary share lives in the same flag: 1, 10, 25, 50, 75 and then 100 percent. A gate breach sets the share back to zero. That makes the halt and the rollback the same mechanism, so the path you rehearse on every rollout is the path you use in an incident.

**The tooling shape**

A progressive delivery controller on the cluster shifts weights at the service mesh or the ingress. A model-serving platform can carry the canary split itself. A feature-flag service holds the policy. Pick one of each, and keep the old model deployed until the new one has held at 100 percent through the gates.

**Rehearse it**

The lesson's exercise asks for a rollback under 60 seconds end to end. Time it in staging on every release, and treat a slower result as a release blocker.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why pin the model by digest and not by tag? Expected: a tag can move to a new build. A digest is immutable, so the rollback target is exactly the model that ran before.
- **Level 2:** What else must revert together with the model? Expected: the gate thresholds, and any prompt or template version that shipped with the model.
- **Level 3:** How do you know the path works before you need it? Expected: rehearse it in staging on every release and time it end to end, against a target such as the lesson's 60 seconds.
- **Level 3:** The new model needs a new engine image. Does the flag still work? Expected: yes, when both images run side by side and the flag chooses between them. The old deployment stays alive until the new one has held at 100 percent.

**Wrong answers, and why they fail**

- "Roll back by redeploying the previous image." A redeploy takes hours, and the lesson's point is to separate the rollback from the deployment.
- "Delete the old model a day after the launch." The old model must stay available until the canary has held at full traffic through every gate.
- "A fast rollback makes the gates unnecessary." The gates decide when to roll back. The fast path only limits the damage once they fire.

:::

## Order the checks before a paid model call

*Level 2 (working) · design · about 10 minutes*

You are about to share a public link to a model demo. Every request that reaches the model costs money. Design the sequence of checks a request passes before the model runs, and give the HTTP status for each refusal.

:::answer Show the answer
:::say Short answer
Run the cheap checks first and the paid step last. Refuse an oversized body from its `Content-Length` header before you read it, check the access token, take one token from the client's rate bucket, parse and validate the JSON, charge the daily usage cap, and only then call the model. Each refusal returns a JSON error with a stable code, a message and a hint, and the statuses in that order are 413, 401, 429, 422 and 503.
:::

**Full answer**

**Why the order matters**

A bad request stops at the first check that it fails, and that check should cost the server almost nothing. The model call is the only step that costs money, so it comes last. The browser can repeat some checks with `maxlength` and `required`, but those help honest users only. Any client can send a request without the page, so the server repeats every check.

**The sequence**

| Step | Refusal | Status |
|---|---|---|
| route exists | unknown endpoint | 404 |
| `Content-Length` present and numeric | missing, or not a number | 411, 400 |
| body size under the limit | over 4,096 bytes, refused before the read | 413 |
| body arrives in time | client stops sending | 408 |
| access token, when configured | missing or wrong | 401 |
| token bucket per client | bucket empty, with `Retry-After` | 429 |
| content type and JSON object | wrong type, or not an object | 415, 400 |
| fields | missing, empty, too long, control characters | 422 |
| daily usage cap | the day's budget is spent, with `Retry-After` | 503 |
| model call | | 200 |

The cap is charged after validation, so that only valid requests count against the day.

**The error shape**

Every refusal has the same JSON body: a `code` that client code and tests compare, a `message` that states the fact with its numbers, a `hint` with one action, and a `request_id` that joins a user report to one log record.

**Two limits, not one**

The token bucket bounds each client: a capacity for the burst and a refill rate for the long run. It does not bound the total. A hundred clients that each stay under the limit can still spend the whole budget, so the usage cap counts all model calls in a day and refuses after a fixed number.

**Behind a proxy**

The bucket key is the client address. Behind a reverse proxy every request arrives from the proxy, so all clients share one bucket. Read the client address from the header that your own proxy sets, and trust that header from the proxy only.

**Log every request**

One record per request, in the `finally` block, including the refused ones: the route, the status, the error code, the latency and the input length. The client address becomes a keyed hash. The text is never stored, and the page says so.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the usage cap come after the field checks? Expected: so that only valid requests count against the day's total.
- **Level 2:** Why refuse on the header before reading the body? Expected: it stops a large upload before the server spends memory and time on it.
- **Level 3:** Behind a reverse proxy one heavy user gets everyone rate limited. Why? Expected: every request arrives from the proxy address, so all clients share one bucket. Read the client address from the proxy's header, and trust it from the proxy only.
- **Level 3:** What does the server do with a refused body before it answers 413? Expected: it reads and discards up to 64 KiB, because a close with unread data can trigger a TCP reset and the client loses the reply.

**Wrong answers, and why they fail**

- "Validate the text first, then check the size." Reading the body before the size check spends the cost that the check exists to avoid.
- "A rate limit is enough, skip the cap." A per-client limit bounds each client. A hundred clients under the limit still spend the whole budget.
- "Return 500 with the stack trace, developers can read it." A stranger cannot act on a stack trace. An error needs a code, a fact and one next action.

:::

## Read the prompt router's experiment assignment

*Level 2 (working) · code-reading · about 8 minutes*

This function from the production app picks the prompt version for a request. Explain what it does, why it hashes the user id together with the experiment name, and what the number 10 in the experiment config means for one user over a week.

```python
AB_EXPERIMENTS = {
    "general_chat_v2_test": {
        "template": "general_chat",
        "control": "v1",
        "variant": "v2",
        "traffic_pct": 10,
    },
}


def select_prompt(template_name, user_id, variables):
    versions = PROMPT_TEMPLATES.get(template_name)
    if not versions:
        raise ValueError(f"Unknown template: {template_name}")
    version = "v1"
    for exp_name, exp in AB_EXPERIMENTS.items():
        if exp["template"] == template_name:
            bucket = int(hashlib.md5(f"{user_id}:{exp_name}".encode()).hexdigest(), 16) % 100
            if bucket < exp["traffic_pct"]:
                version = exp["variant"]
            else:
                version = exp["control"]
            break
    template = versions.get(version, versions["v1"])
    return template, template.template.format(**variables)
```

:::answer Show the answer
:::say Short answer
The code hashes the user id plus the experiment name, takes the result modulo 100, and sends the users whose bucket falls below the traffic percentage to the variant. The hash is deterministic, so one user lands in the same arm on every request for the life of the experiment. The experiment name in the hash keeps the buckets of two experiments independent, so the users who saw the variant in one test are not the same users in the next. With a traffic percentage of 10, about a tenth of the users see the variant on every request all week, and the others never do.
:::

**Full answer**

**Line by line**

1. The default version is `v1`, so a template with no experiment always resolves.
2. The loop finds the experiment for this template and stops at the first match. One experiment per template at a time.
3. The bucket is a hash of `user_id:exp_name`, read as an integer and reduced modulo 100. That gives a value from 0 to 99.
4. A bucket below `traffic_pct` gets the variant, and every other bucket gets the control.
5. The template renders with the request variables.

**Why the hash is deterministic**

The lesson is explicit: hash the user id, do not draw at random. A random draw per request would flip one user between the two prompts, so the user would see two behaviors and the per-user metrics would mix both arms. A stable arm per user also makes the exposure count a count of users, which the experiment analysis needs.

**Why the experiment name is in the key**

Without it, the bucket of a user is the same in every experiment, so the same tenth of the users would be the variant group every time. Experiments would be correlated, and the effects of one would carry into the next. The experiment name acts as a salt that gives each experiment its own split.

**What to watch**

- The modulo 100 gives steps of one percent. A smaller share needs a larger modulus.
- The demo runs 1000 synthetic user ids through the selector and prints the control and variant shares. That is a cheap sample ratio check, and it belongs in a test.
- The `break` means that a second experiment on the same template never runs. The config shape makes that visible, but nothing warns you.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a user stay in the same arm across requests? Expected: the hash of the same user id and experiment name gives the same bucket every time.
- **Level 2:** Two experiments are configured for the same template. What happens? Expected: the loop takes the first match and breaks, so the second experiment never assigns anyone.
- **Level 3:** Why not hash the user id alone? Expected: the same users would land in the variant of every experiment, so the experiments would be correlated and carry-over effects would mix the results.
- **Level 3:** How does the demo check the split, and what would you add? Expected: it runs 1000 synthetic ids through the selector and prints both shares. Add the same check on real exposure logs as a sample ratio check.

**Wrong answers, and why they fail**

- "A random draw below the percentage would be simpler and the same." It assigns per request, so one user flips between arms and sees both prompts.
- "The hash function is weak, so the assignment is broken." The hash is not a security control here. It only has to be deterministic and well spread.
- "The percentage is the share of requests." It is the share of users, because the bucket is per user and stays fixed.

:::

## Should the full prompt live on the span

*Level 2 (working) · tradeoff · about 8 minutes*

Your trace backend can store the full prompt and completion on every model span. The support team wants it on, because they debug tickets from traces. The security team wants it off. What do you decide, and how do you still give support what they need?

:::answer Show the answer
:::say Short answer
Keep content capture off, which is the default the conventions recommend. Store prompts and completions in your own store, with access control and a retention period, and record a reference id on the span. Support follows the id from the trace to the content, and the trace backend never holds customer data.
:::

**Full answer**

**What the default is**

By default a span carries timing and metrics, not prompts or completions. Content capture is opt-in through the stability opt-in variable and separate content variables. When it is on, the content lands in `gen_ai.input.messages`, `gen_ai.output.messages` and `gen_ai.system_instructions`, or in the content events on the span.

**What goes wrong when it is on**

Prompts carry personal data, secrets and customer documents. Operators read traces, and the trace backend sets its own retention. The conventions lesson lists "capturing full prompts in spans" as the first way the pattern fails. A trace backend is also an attractive target, because it holds everything in one place.

**The pattern that works**

Store the content outside the trace: in your log store or object store, under your own access control, audit log and retention. Put a reference id on the span. The lesson calls this the external-reference pattern, and it is also the defense against content poisoning, because the poisoned text never enters the telemetry store.

**What support gets**

The same debugging path with one extra step: trace, span, reference id, content store. The store can redact known patterns on write and log every read. Most tickets do not need the content at all, because the span already shows the model, the tokens, the latency, the tool calls and the status.

**What you give up**

A one-click view of the prompt inside the trace UI. That is the price, and it is small next to a trace backend full of customer data.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which spans may carry raw content when capture is on? Expected: none in production. Keep one rule, references only, so nobody has to decide per span.
- **Level 3:** A developer turns capture on in staging for a day. What is the risk? Expected: staging often replays production prompts, and the backend keeps them for its retention period. Use synthetic prompts or scrub before export.
- **Level 3:** How do you keep the content store from becoming the same leak? Expected: access by role, an audit log of reads, a retention period, and redaction of known patterns before the write.

**Wrong answers, and why they fail**

- "Turn it on, the trace backend is internal." Internal operators read traces, and the backend's retention is not your policy.
- "Store a hash of the prompt on the span." A hash shows a repeat but gives support nothing to read. A reference id into a controlled store does both.
- "Keep the content on the span and strip personal data with a regex." Patterns miss, and the span is still the wrong store with the wrong retention.

:::
