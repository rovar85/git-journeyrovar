---
track: aibank
title: "AI interview bank: Production and MLOps (part 2 of 2)"
short: Production and MLOps 2
sub: 14 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## The token dashboard reads zero after an SDK upgrade

*Level 2 (working) · debug · about 8 minutes*

After a routine upgrade of the tracing SDK, the token usage panels show zero for every model, while request counts and latency panels look normal. Nothing else was deployed. Where do you look first?

:::answer Show the answer
:::say Short answer
Look at the attribute names on the spans the service emits now. The GenAI conventions are still marked as in development, and they have renamed attributes before: the input token count moved from `gen_ai.usage.prompt_tokens` to `gen_ai.usage.input_tokens`. If the SDK emits the new name and the dashboard queries the old one, every token panel reads zero while counts and latency keep working. Pin the conventions version you emit, and set the stability opt-in so that the names do not move under you.
:::

**Full answer**

**Why only the token panels broke**

Request counts come from the number of spans, and latency comes from span start and end times. Neither depends on an attribute name. A token panel sums one attribute by its key. A renamed key makes the sum zero, and nothing errors.

**Confirm it in one minute**

Pull one raw span from after the upgrade and one from before. Compare the attribute keys. The old key is gone, and the new one carries the numbers.

**Two fixes, in order**

1. Change the dashboard queries to the new key. During the transition, sum both keys so that old and new spans show.
2. Stop the names from moving: pin the conventions version in the emitter, set `OTEL_SEMCONV_STABILITY_OPT_IN`, and check the names on every SDK upgrade.

**Prevent the repeat**

The capstone's tests assert that the canonical attributes are present on emitted spans. Run them on every dependency upgrade. Add an alert for the shape of this incident: token sum at zero while the request count is above zero.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why did the count and latency panels keep working? Expected: they use span counts and span timing, which do not depend on an attribute name.
- **Level 3:** How do you catch the next rename before production? Expected: a test on emitted spans that asserts the canonical attribute names, run on every dependency upgrade.
- **Level 3:** Should the dashboard read both the old and the new name? Expected: yes for a transition window, as a sum of both. Then remove the old one, so that a future regression stays visible.
- **Level 4:** The backend maps the attributes into its own schema. Does that protect you? Expected: only when the mapping follows the same conventions version. A mapping built for the old name shows the same zero, so test the end-to-end path.

**Wrong answers, and why they fail**

- "The models stopped reporting usage." The provider responses did not change. The span emitter did.
- "The backend lost data during the upgrade." The latency panels prove the spans arrive. Only one attribute is missing from the query's point of view.
- "Roll the SDK back and stay there." A pinned conventions version and a test let you upgrade on purpose instead of never.

:::

## Trace retention when traces cost more than the model

*Level 2 (working) · design · about 10 minutes*

Your service makes more than a million model calls a day. Keeping every trace now costs more than the model calls themselves. Design a retention policy that keeps the traces you will need during an incident and drops the rest.

:::answer Show the answer
:::say Short answer
Sample by rule, not by a flat rate. Keep every errored trace and every high-cost trace, keep a small share of the successes, and keep the aggregates always. Make the decision at the collector with a tail sampler after the trace completes, so that the rule can see the status and the cost. The capstone keeps all errored traces and 10 percent of the successes.
:::

**Full answer**

**Why a flat rate fails**

A flat 5 percent keeps 5 percent of the errors too. The trace you need in an incident is the one you dropped, and the aggregate error count tells you only that it existed.

**The rules**

| Class | Keep |
|---|---|
| errored traces | all of them |
| high-cost traces, long outputs or expensive models | all of them |
| successes | 5 to 10 percent |
| aggregates | always, from every request |

The observability lesson states the rule as 100 percent of errors, 100 percent of high cost and 5 percent of successes. Aggregates do not need traces: counters and histograms count every request even when the trace is dropped.

**Decide at the tail**

Head sampling decides when the trace starts, before anything knows whether it will fail. Tail sampling at the collector decides after the trace completes, so it can read the status, the cost and the eval score. The price is buffer memory at the collector, because whole traces wait until the decision.

**Stratify, and know the bias**

The capstone's exercise keeps every trace with a toxicity score above 0.5 plus a 10 percent stratified sample of the rest, and asks you to measure the bias that the sampling adds. Any analysis over sampled traces overweights the classes you kept in full. Weight by the inverse of the sampling rate, or run the per-trace evals on the stratified share only.

**Tier the storage**

Spans go to a columnar store for queries, and raw events go to object storage for the long tail. The archive is cheap, and long-term analysis runs there.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does head sampling lose the errors? Expected: it decides before the span ends, so it cannot see the status.
- **Level 2:** What survives from a dropped trace? Expected: the metrics. Counters and histograms count every request, whether or not its trace is kept.
- **Level 3:** Your eval jobs run over the sampled traces. What bias do they inherit? Expected: a sample that keeps all errors overweights failures, so weight by the inverse sampling rate or evaluate the stratified share only.
- **Level 3:** The collector runs out of memory during a burst. Why, and what do you change? Expected: tail sampling buffers whole traces until they complete. Cap the buffer, shorten the decision wait, and shed with a head rule under pressure.

**Wrong answers, and why they fail**

- "Sample 5 percent of everything." Most of the errors you need in an incident are gone, and the aggregate tells you only that they happened.
- "Keep everything for a week, then delete it." A week of full traces at this volume is the cost you are trying to remove.
- "Traces are enough, drop the metrics." A percentile over an hour needs every request, which only a histogram gives.

:::

## When the triage agent should say it is unsure

*Level 2 (working) · concept · about 8 minutes*

An incident triage agent proposes a root cause for every alert. The on-call team stopped trusting it after several confident wrong answers. Which pattern from the SRE lesson raises the trust in its output, and what does the team do when the pattern says the agent is unsure?

:::answer Show the answer
:::say Short answer
Run two models independently on the same incident. When they agree on the root cause, confidence is high. When they disagree, the system escalates to a person with both hypotheses and their evidence visible, instead of picking one. The pattern filters invented root causes at a low cost, and the disagreement itself tells the responder that the incident is uncertain.
:::

**Full answer**

**Adversarial evaluation**

The lesson names the pattern after a product that ships it: two models analyze the same incident on their own. Agreement is confidence. Disagreement is an escalation with both hypotheses shown. It is simple, and it is an effective filter against a confident wrong answer, because two independent analyses rarely invent the same cause.

**Where it sits in the architecture**

A supervisor splits the incident into sub-queries. Specialized agents with tool access search the logs, run the metric queries and retrieve the runbooks. The supervisor assembles a hypothesis with evidence and shows it to a person, who approves or redirects. Only then does an action run, and only from a narrow approved set. The two-model check sits at the hypothesis step, before the person sees it.

**What the person does on a disagreement**

Reads both hypotheses and the evidence that each one cites. Picks one, redirects the agents, or starts the manual investigation with two leads instead of none. The lesson's division of labor holds: the agent proposes hypotheses and queries, and the person makes the judgment call.

**What the agents remember**

Runbooks and postmortems live in a vector store, and both models retrieve from it on every incident. Operational memory survives team turnover, and a new engineer's first incident has the full history behind it.

**The limit of agreement**

Two models that share training data can agree and be wrong together. Agreement raises confidence, it is not proof. Require every hypothesis to cite the log lines and the metric queries behind it, so that the responder can check the evidence and not the eloquence.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is a split verdict useful to the responder? Expected: it marks the incident as uncertain and gives the responder two candidate causes with their evidence.
- **Level 3:** Both models agree and both are wrong. How do you catch it? Expected: require each hypothesis to cite evidence that the responder can check, and keep the human approval before any action.
- **Level 3:** What does the pattern cost? Expected: two model runs per incident plus the latency of the slower one, which is small next to the first twenty minutes of a manual investigation that the lesson says are automatable.

**Wrong answers, and why they fail**

- "Ask one model twice at temperature zero." A repeat of the same model shares its blind spots. The pattern needs independent analyses.
- "Let an agreed hypothesis trigger the fix on its own." Agreement raises confidence. The person still approves the action, and only narrow actions are automated at all.
- "Disagreement proves the agent is useless." It means the incident is uncertain, which is exactly when a person should look.

:::

## Catch a leaking prompt within five minutes

*Level 3 (senior) · design · about 15 minutes*

A regression ships. One of your prompts starts to leak fake customer identifiers in about one answer in a hundred. Design the observability pipeline so that an alert reaches a person within five minutes of the first bad answer, and say what each stage adds to that clock.

:::answer Show the answer
:::say Short answer
Instrument every model call with GenAI-convention spans and ship them over OTLP to a collector. Run a cheap pattern check on every output at the collector, run a judge over the sampled traces on a short schedule, write the scores back as eval spans, export the aggregates as metrics, and alert when the leak score crosses a threshold. The five minutes are the sum of the scrape interval, the judge batch window and the alert routing, so each stage has to be short, and the sampler must keep enough traffic to see a one-in-a-hundred event. The five-minute target covers only the leaks that the pattern flags or the sampler keeps.
:::

**Full answer**

**The stages and their share of the clock**

| Stage | What it adds | Time it costs |
|---|---|---|
| instrumentation and OTLP export | the span with the output | seconds |
| collector with tail sampling | the decision to keep the trace | seconds, plus the buffer wait |
| pattern check on the output | an instant flag for identifier shapes | none worth counting |
| judge over sampled traces | a score for leaks the pattern misses | the batch window |
| eval spans and metrics export | the aggregate the alert reads | the scrape interval |
| alert rule and routing | the page | the evaluation interval plus routing |

The capstone's eval job reads the last fifteen minutes of sampled traces. For a five-minute target, the judge has to run every minute on the newest traces, or the batch window alone eats the budget.

**Make the rare event visible**

At one leak in a hundred, a sampler that keeps a tenth of the successes sees one leak in a thousand answers. At high volume that is fine, and at low volume it is blind. Run a pattern check for identifier shapes on every output at the collector, as the production application capstone does in its output guardrail, and keep every trace that the check flags. The judge then scores the paraphrased leaks on the sampled share only. A paraphrased leak in an unsampled trace gets no score and fires no alert.

**The alert chain**

Eval scores land as eval spans linked to the parent trace. A metrics exporter aggregates them, an alert rule fires when the leak score in a window crosses the threshold, and the alert manager routes warnings to chat and critical breaches to the pager.

**Prove it**

The capstone's regression probe injects a bug that leaks fake identifiers in one percent of answers and measures the time from deployment to the alert. Detection is the part of the recovery that the dashboard owns. The fix is the rollback, and that belongs to the release path.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which stage usually dominates the five minutes? Expected: the judge batch window. A job that runs every fifteen minutes cannot meet a five-minute target.
- **Level 3:** The sampler drops nine of every ten successes. What happens to detection when the leak rate is one percent? Expected: it sees one leak in a thousand answers, so at low traffic the detection takes longer. Keep every trace that a cheap pattern check flags.
- **Level 4:** How do you prove the pipeline meets the target? Expected: inject the regression on purpose, as the capstone does, and measure the time from the deployment to the alert.

**Wrong answers, and why they fail**

- "Run the judge on every trace." At volume that costs more than the model calls. Sample, and filter with a cheap check first.
- "A daily eval report is enough." A day of leaked identifiers is the incident. The target is minutes.
- "The pattern check catches everything." Patterns miss paraphrases. The judge catches what the pattern misses, and the pattern keeps the judge affordable.

**Related lesson in this course:** [Observability for AI systems: Prometheus, Grafana and OpenTelemetry](#aiinfra-9)

:::

## One trace across HTTP and stdio tool servers

*Level 3 (senior) · design · about 12 minutes*

Your agent uses three tool servers over the MCP protocol. Two of them speak streamable HTTP, and one runs as a local subprocess over stdio. Design how a single trace id reaches all three, and say what each server has to do when it arrives.

:::answer Show the answer
:::say Short answer
For the HTTP servers, inject the W3C `traceparent` header into every request, as any traced HTTP client does. The stdio transport has no headers, so put the same value into the `_meta` field of each JSON-RPC request until the protocol adds a standard field for it. Each server reads the value, opens its own span as a child of that context, writes the trace id into its logs, and passes the context on if it calls anything else.
:::

**Full answer**

**Why this is worth the work**

The lesson opens with a report from production: the agent sometimes answers in 3 seconds and sometimes in 30. The logs show the model calls and nothing else. The cause was one tool server that hung during its cold start, and nothing short of an end-to-end trace could show it.

**The HTTP servers**

Streamable HTTP carries standard headers. The client injects `traceparent`, and the server starts a span under that parent. On the client side the call is a CLIENT span under the `execute_tool` span. On the server side the work is a child of the same trace. The gap between the two is the transport time.

**The stdio server**

Stdio carries no HTTP headers. The protocol roadmap discusses a `_meta.traceparent` field on JSON-RPC calls. Until it ships, include the `traceparent` value in `_meta` on every request yourself, and have the server read it from there. The server logs the trace id so that a log line and a span can be joined later.

**What every server does with the context**

1. Parse the context from the header or from `_meta`.
2. Start a span as a child of that context, not a new trace.
3. Write the trace id into every log line of the request.
4. Propagate the context to anything it calls in turn.

**What you can see afterwards**

One waterfall: the agent step, the tool call, the server's work. A hang appears as one long server span under a long client span. Beside the spans, emit the tool execution duration histogram per tool, which answers the dashboard questions without a trace.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** A server ignores the `_meta` field. What do you see in the trace? Expected: the server's work shows up as a separate trace or not at all, and the client span shows the duration but not where the time went.
- **Level 3:** Which span records the hang, the client span or the server span? Expected: both. The client span shows the wait from the agent's side, the server span shows what the server did, and the gap between them is the transport.
- **Level 4:** Another team operates one tool server. What do you ask them to commit to? Expected: accept the context from headers or `_meta`, continue the trace instead of starting one, log the trace id, and export spans to a backend that both teams can read.

**Wrong answers, and why they fail**

- "Log a request id and join the logs later." A request id has no parent-child structure and no timing. A trace has both.
- "The stdio server is local, so it does not need tracing." The hang in the lesson was in a local server's cold start. Local does not mean fast.
- "Put the trace id into the prompt so the model carries it." The model is not a transport, and a changing value in the prompt also breaks the prefix cache.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## Pick an observability stack without locking in

*Level 3 (senior) · tradeoff · about 12 minutes*

Your team must choose an observability stack for a new model service. Half the team wants an all-in-one platform with evals, prompt versions and session replays. The other half wants a thin gateway that records every call and nothing more. How do you decide, and which pattern lets you avoid the choice?

:::answer Show the answer
:::say Short answer
Decide on four axes: the framework you run on, the license you can accept, the budget, and whether you must self-host. A bundled development platform fits a team that iterates on prompts and needs evals tied to traces. A gateway or telemetry tool fits a team that needs portable instrumentation that does not depend on a framework. The pattern that avoids the choice is to emit OpenTelemetry spans with the GenAI conventions from every call and ship them to more than one place: a gateway for day-to-day, an eval platform for regressions, and an archive for long-term analysis.
:::

**Full answer**

**Two categories of tool**

Development platforms bundle observability with evals, prompt management, dataset versioning and session replay. You run experiments, compare prompts and regression-test a new prompt against old winners. Gateway and telemetry tools record the prompt, the response, the tokens, the latency, the model and the cost, and they stop there.

**The four axes**

| Axis | Question |
|---|---|
| stack | one framework, a raw SDK, or several vendors |
| license | open source only, a source-available license, or commercial |
| budget | a free tier, a team plan, or an enterprise contract |
| self-host | required, welcome, or never |

**The trap**

Instrumenting inside the agent framework ties the traces to that framework. Instrumenting at the HTTP or SDK layer is portable, so a change of framework or a second framework does not lose the history.

**The glue pattern**

1. Emit OpenTelemetry spans with the GenAI conventions from every model call.
2. Route them to a gateway or telemetry tool for the daily view.
3. Ship a copy to an eval platform for regressions.
4. Archive them in a data lake for long-term analysis.

Every tool that reads the conventions can read the same spans, so the stack is a routing decision, not a rewrite.

**What to insist on in either case**

- Prompt versions tied to traces. When production regresses, you must be able to bisect to the prompt change that caused it.
- An eval strategy. Tracing without evaluation is expensive logging.
- A sampling policy at scale, because full retention at volume is more expensive than the calls it records.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why instrument at the SDK layer rather than inside the framework? Expected: framework hooks tie you to the framework. The SDK layer keeps working when you change frameworks or add a second one.
- **Level 3:** What breaks when prompt versions are not tied to traces? Expected: when production regresses you cannot bisect to the prompt change that caused it.
- **Level 4:** You ship the same spans to two backends. What do you check so that they agree? Expected: the same conventions version, the same sampling rules on both exporters, and one source of truth for cost attribution, so that two dashboards do not show two bills.

**Wrong answers, and why they fail**

- "Pick the tool with the most features." Features you do not use cost money and couple you. Pick on stack, license, budget and hosting.
- "Tracing is enough, evals can come later." Traces without evals are logs with a price. A regression hides in them until a user reports it.
- "The gateway records every call, so skip the platform." A proxy sees calls, not agent steps or sessions. It misses the multi-step traces that an agent regression needs.

:::

## Review one span from a new instrumentation branch

*Level 3 (senior) · code-reading · about 12 minutes*

A colleague opens a review that adds tracing to the agent. The branch emits this span for every model call. List every problem you find before you approve it.

```json
{
  "traceId": "abcdefabcdefabcdefabcdefabcdefab",
  "spanId": "abcdefabcdefabcd",
  "parentSpanId": "",
  "name": "chat",
  "kind": "INTERNAL",
  "attributes": {
    "gen_ai.operation.name": "chat",
    "gen_ai.request.model": "our_smart_model",
    "gen_ai.usage.prompt_tokens": 500,
    "gen_ai.content.prompt": "You are a support agent. The customer's card number is ..."
  }
}
```

:::answer Show the answer
:::say Short answer
The span marks a model call as INTERNAL, has no parent, and uses an old attribute name for the input tokens. It omits the provider, the output tokens, the response model and the response id, and it writes the prompt text, with a card number in it, into the trace. Fix the kind and the parent link, use the current attribute names, add the missing attributes, and move the content out of the span.
:::

**Full answer**

**The problems, in order of damage**

| Line | Problem | Fix |
|---|---|---|
| `parentSpanId: ""` | an orphan span; no backend can show which agent step made the call | pass the parent context from the `invoke_agent` span |
| `kind: INTERNAL` | a model call crosses a process boundary | `CLIENT` |
| `gen_ai.content.prompt` | prompt text with customer data in a store that operators read | capture off by default; store content outside and put a reference id on the span |
| `gen_ai.usage.prompt_tokens` | the attribute was renamed; backends read `gen_ai.usage.input_tokens` | use the current name and add `gen_ai.usage.output_tokens` |
| no `gen_ai.provider.name` | cost and error dashboards cannot split by provider | set it on every model span |
| no `gen_ai.response.model` | with routing, the served model can differ from the requested alias | record what the provider returned |
| no `gen_ai.response.id` | no way to match the span to the provider's own log | record the response id |

**Why the content line is the one to fight over**

The conventions say instrumentations should not capture inputs and outputs by default. Capture is opt-in through an environment variable, and the production pattern stores content in your own log store and records a pointer on the span. A prompt with a card number in a trace backend is a data leak with a retention policy you did not choose.

**Why the renamed attribute will come back**

The GenAI conventions are still marked as in development, and they have renamed attributes before. Pin the conventions version you emit, set the stability opt-in, and test the attribute names of emitted spans, or the next SDK upgrade reopens this review.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the empty parent matter more than the wrong kind? Expected: with no parent the span is an orphan, the trace is no longer a tree, and you cannot see which step made the call.
- **Level 3:** The team needs the prompt text to debug failures. What do you offer? Expected: store prompts in a separate store with access control and put a reference id on the span, which is the pattern the conventions recommend for production.
- **Level 4:** How do you keep the old attribute name from returning after an upgrade? Expected: pin the conventions version, set the stability opt-in variable, and add a test that asserts the attribute names on emitted spans.

**Wrong answers, and why they fail**

- "It has a trace id and a model name, so it is fine." A trace id alone does not link the span to its parent, and a model name without a provider cannot be attributed.
- "Keep the prompt in the span, it is useful." Prompts carry personal data and secrets into a store that operators read. The default is off, and production stores content outside the span.
- "The two token names are synonyms." Backends read the current name. The old one lands in an unknown attribute, and the token dashboard shows nothing.

:::

## Set canary gates that do not halt on noise

*Level 3 (senior) · design · about 12 minutes*

You run a canary for a new model. The team wants a rule that stops the rollout when the canary and the baseline differ on any metric. Design the gates so that they catch a real regression and let a healthy rollout through.

:::answer Show the answer
:::say Short answer
Write each gate as a multiplier above the baseline, never as equality. Gate on five metrics: latency percentiles, cost per request, error and refusal rate, output length distribution and user feedback rate. Put every threshold above the run-to-run variance, which the lesson measured at up to 15 percent on identical inputs, and hold each step long enough to collect the samples the gate needs.
:::

**Full answer**

**Why equality fails**

Identical inputs produce different outputs. Floating-point reductions on the GPU run in a different order for each batch shape, the batch size changes between runs, and sampling above temperature zero adds its own randomness. The lesson reports up to 15 percent accuracy variation between runs on the same eval set. "Stable" therefore means inside the expected variance, not identical to the baseline.

**The five gates**

| Metric | Breach |
|---|---|
| Latency P50, P95, P99 | canary P99 above 1.5x the baseline |
| Cost per request | more than 20 percent above the baseline |
| Error and refusal rate | 2x the baseline |
| Output length, mean and P99 | a shift in the distribution |
| User feedback, thumbs-down and tickets | 1.5x the baseline |

**Measure the noise floor first**

Before the canary, run two arms of the same baseline model and record the spread of each metric between them. That spread is the floor. A gate below it halts every rollout, including a good one. The lesson's exercise asks for the multipliers when the eval noise is plus or minus 7 percent, and the answer is a gate above that band.

**Hold each step long enough**

The progression runs 1, 10, 25, 50, 75 and 100 percent. Gates check every 5 to 15 minutes. At 1 percent of a load of 1,000 per minute, the canary sees 10 requests per minute, which is 50 to 150 data points per window. That is enough to read latency and errors, but one or two samples decide the P99, so the P99 gate must hold for more than one window. It is too few for user feedback. Each step must pause until the gate has its samples.

**Keep the exit cheap**

A halt is only useful when the rollback is fast. Keep the traffic share in a policy flag and the model in a registry with a pinned digest, so that a breach reverts in seconds.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How do you learn the size of the noise before the canary starts? Expected: run two canary arms of the same baseline and record the spread of each metric between them.
- **Level 3:** User feedback at the first step is too thin to gate on. What do you do? Expected: gate the early steps on latency, cost, errors and length, and apply the feedback gate from the step that has enough samples.
- **Level 4:** A gate fires at one step, and the metric is normal again on the next check. Continue or halt? Expected: halt and look. A gate that flaps sits inside the noise or sees an intermittent regression, and both need a decision before more users see the model.

**Wrong answers, and why they fail**

- "Stop on any difference from the baseline." Two runs of the same model differ, so that rule stops every rollout.
- "Gate on the mean latency." A mean hides the tail. Gate on the percentiles.
- "Allow zero cost increase." A better model can cost more. The lesson sets the breach at 20 percent, and the product decides whether the gain pays for it.

:::

## Stopping an experiment on the first good morning

*Level 3 (senior) · tradeoff · about 12 minutes*

A product manager reads the experiment dashboard every morning and wants to end the test on the first day the variant looks significant. Twenty other experiments run this quarter under the same plan. What is wrong with it, and what do you offer instead?

:::answer Show the answer
:::say Short answer
A fixed-sample test assumes one look at a sample size chosen in advance. Looking every day and stopping at the first significant result gives noise many chances to cross the line, so the false positive rate climbs. Offer a sequential test, which stays valid under repeated looks and still allows an early stop on a clear winner. Across many experiments, correct for multiple comparisons, and reduce variance with pre-experiment data so each test needs fewer samples.
:::

**Full answer**

**The peeking problem**

Classical A/B analysis assumes the sample size is fixed before the test. Each extra look is another test, and a stop at the first significant look selects the noise. The manager's plan is not wrong because it looks often. It is wrong because it decides on a procedure that was not built for repeated decisions.

**Sequential testing**

Always-valid sequential procedures, such as the mixture sequential probability ratio test and confidence sequences, control the false positive rate under repeated looks. You can check daily and stop early on a clear winner, and the error rate stays what you set. The lesson's simulator shows the fixed and the sequential boundaries side by side.

**Twenty experiments**

At 95 percent confidence, 20 experiments produce about one false positive by chance. Two corrections exist. Bonferroni divides the error rate by the number of tests, which is strict. Benjamini-Hochberg controls the false discovery rate and is less conservative. Choose by the cost of one false launch against the cost of missing a real win.

**Variance reduction**

CUPED regresses out the variance that pre-experiment data explains. The lesson gives a typical reduction of 30 to 70 percent, which raises the effective sample size at no cost in traffic. That is the honest way to shorten a test.

**Two more checks**

A sample ratio mismatch check catches a broken assignment before you read any result. Non-determinism in model output lowers the effective sample size, so the lesson multiplies the required sample by about 1.3 to 1.5.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Bonferroni or Benjamini-Hochberg for the quarter? Expected: Bonferroni when any false launch is costly, Benjamini-Hochberg when you accept a controlled share of false discoveries in exchange for power.
- **Level 3:** What does CUPED need, and what does it give? Expected: it needs a pre-period metric for each unit, and it gives a tighter estimate from the same traffic.
- **Level 4:** A new model needs a larger sample than the quarter allows. What do you change? Expected: pick a primary metric with lower variance, apply CUPED, or extend the test. Do not shorten it by stopping early under a fixed-sample procedure.

**Wrong answers, and why they fail**

- "Stopping early is fine when the p-value is small." Under a fixed-sample test, a small p-value on the first day is partly selected noise. Only a sequential procedure keeps that stop valid.
- "Run all the tests at 95 percent and ship the winners." About one winner is a false positive by chance. Correct for multiple comparisons.
- "A longer test is always more reliable." Longer helps only if the assignment is sound. Check the sample ratio first.

:::

## The provider slowed down and your service fell over

*Level 3 (senior) · debug · about 12 minutes*

During a provider slowdown, the provider began to return rate-limit errors. Within minutes your own service ran out of memory and crashed, although your incoming traffic had not changed. Reconstruct what happened, and fix the retry policy.

:::answer Show the answer
:::say Short answer
The gateway retried every rate-limited call, and each waiting retry kept its connection, its buffers and its request state in memory. The retries multiplied the in-flight concurrency several times over the real traffic, and the memory went with it. Fix the policy with exponential backoff and jitter, a small fixed number of attempts, a cap on in-flight requests, and a fallback chain that fails over instead of waiting.
:::

**Full answer**

**The chain of events**

1. The provider returns 429 for a share of the calls.
2. The gateway retries each one. Each retry holds a connection, a buffer and the request state while it waits.
3. In-flight requests become the traffic multiplied by the attempts. The chaos lesson names this retry-amplified concurrency.
4. Memory follows the in-flight count, and the service that was healthy a minute ago runs out.

**The retry policy in the production application capstone**

Exponential backoff with jitter: wait about 1 second, then 2, then 4, with a random spread added to each wait, and give up after 3 retries with a fallback response. The lesson's table separates the cases:

| Failure | Retry | Fallback |
|---|---|---|
| 429, rate limit | yes, with backoff | queue the request and tell the user it is in progress |
| 500, server error | yes, 3 attempts | switch to the fallback model |
| timeout over 30 seconds | yes, 1 attempt | a shorter prompt or a smaller model |

The jitter matters as much as the backoff. Without it, every client retries at the same instant and the provider sees a wave on each cycle.

**Bound the concurrency, not only the attempts**

Attempts bound the retries of one request. Nothing bounds how many requests wait at once. Add a cap on in-flight requests at the gateway and a retry budget as a share of traffic. When the cap is reached, fail fast into the queue or the fallback instead of holding memory.

**The fallback chain**

Primary model, then a secondary model, then a cached response, then a short unavailable message. Each step trades quality for availability, and the user always gets something.

**Test it before the next slowdown**

The chaos lesson's first model-specific experiment injects a provider rate-limit for a few minutes and watches the fallback. Most teams learn there that the fallback was never fully exercised.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does backoff alone not stop the memory growth? Expected: backoff spreads the retries in time, and each waiting retry still holds its state. The fix needs a bound on in-flight requests.
- **Level 3:** What does a queue do that a retry does not? Expected: it stores the request without a connection or a worker, and it gives the user a progress message instead of a timeout.
- **Level 4:** The fallback model is cheaper and weaker. Who decides that it is acceptable, and how do you watch it? Expected: the product owner names the paths that may degrade. Log the fallback rate per path, and alert when it stays high.

**Wrong answers, and why they fail**

- "Retry faster so the queue drains before memory runs out." Faster retries raise the request rate against a provider that is already limiting you.
- "Raise the maximum retries so users never see an error." Each attempt holds memory. More attempts multiply the in-flight state.
- "The provider caused the outage, there is nothing to fix here." The provider caused the errors. The retry policy turned them into an outage.

**Related lesson in this course:** [Systems 6: timeouts, retries, backoff and jitter](#systems-6)

:::

## Which fixes an operations agent may run alone

*Level 3 (senior) · tradeoff · about 12 minutes*

A vendor demo shows an operations agent that repairs incidents on its own. Your director asks which actions you would let such an agent take on the model service without a person in the loop. Draw the line and defend it.

:::answer Show the answer
:::say Short answer
Allow a narrow set that was approved in advance: restart a pod, revert one named deployment, scale a pool inside approved bounds, and flip an approved feature flag. Keep everything that changes the shape of the system behind a person: topology, resource limits, new code, access rights and databases. The agent proposes, a person approves the judgment calls, and the safe set grows only as the agent builds a record.
:::

**Full answer**

**The two sets**

| Safe, automated | Not safe, human only |
|---|---|
| restart a pod | change the service topology |
| revert one specific deployment | modify resource limits |
| scale a pool within pre-approved bounds | deploy new code |
| enable a pre-approved feature flag | change access rights |
| | alter a database |

**What makes an action safe**

It is reversible, its blast radius is bounded in advance, and it matches a step in a runbook that a person wrote. The lesson's example incident is a KV cache spike that pushed a serving engine out of memory. A pod restart clears it, and a restart is on the safe list. Raising the memory limit might also clear it, and that change alters how every pod runs from then on, so it stays with a person.

**How an action earns automation**

1. Write the runbook in structured form: symptom, hypothesis, verify, act.
2. Give the action a success criterion and a verify step that runs after it.
3. Record every proposal and every human decision.
4. Promote the action from proposed to automatic after a run of incidents where the proposal matched what the person chose.

**The approval gate stays**

The architecture is a supervisor over log, metric and runbook agents, a hypothesis with evidence, a human approval, and then an action from the narrow set. Even when two independent models agree on the cause, the approval stays for anything outside the safe set. The lesson is direct about vendors who sell a system that needs no supervision: they are overselling.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a scale-up inside bounds safe while a resource limit change is not? Expected: the bounds were approved in advance and the action reverses cleanly. A limit change alters how every pod runs and can trigger the next incident.
- **Level 3:** What has to be true before the agent may run an action unsupervised? Expected: a structured runbook, a verify step with a success criterion, an audit record, and a record of proposals that matched the human decision.
- **Level 4:** The agent restarted the busiest pod during a load spike because a probe failed. Was that inside the rules? Expected: the action was allowed and the trigger was wrong. A restart under load drops the running requests, so the rule needs a condition on load and on the probe type, not only on the action.

**Wrong answers, and why they fail**

- "If the agent is accurate enough, let it do everything." Accuracy on past incidents does not bound the damage of one wrong broad action.
- "No automation until the agent is perfect." A restart and a revert are safe today, and they remove the first part of most investigations.
- "An approval step makes the agent useless at night." The agent still does the investigation. The person approves one proposed action instead of starting from the dashboards.

:::

## Keep a production chaos experiment from becoming an incident

*Level 4 (staff) · design · about 18 minutes*

You run a chaos experiment in production. One model provider returns rate-limit errors for part of the fleet, so that you can watch the fallback. Alerts start to fire while it runs. Design the safety plane that keeps this from turning into an incident, and explain how on-call tells an experiment failure from a natural one.

:::answer Show the answer
:::say Short answer
Three guards sit in the safety plane: a burn-rate alert that pauses the experiment when the daily error-budget burn passes twice the expected rate, suppression windows that silence the non-experiment alerts inside the blast radius, and a tag on the trace id of every error that the experiment causes. On-call reads the tag. An untagged error inside the window is natural and gets the normal response.
:::

**Full answer**

**The planes**

The lesson splits the system into a control plane that schedules the experiment, a target plane of services, pods and data stores, a safety plane with the kill switch, suppression windows, blast-radius limits and error-budget gates, and an observability plane that correlates every error with a trace id. The findings feed back into the SLO, the runbooks and the code.

**The three guards**

1. **Burn-rate pause.** The experiment is allowed to spend error budget, because that is what a controlled failure does. The gate fires when the daily burn exceeds 2x the expected rate, and it pauses the experiment on its own.
2. **Suppression windows.** Alerts that the experiment is designed to trigger are silenced for the blast radius and the duration. Nothing outside the radius is silenced.
3. **Trace-id correlation.** Every experiment-induced error carries a tag, so that on-call can separate it from natural failures without a conversation.

The kill switch is a fourth, manual control. It stops the experiment at once and belongs to on-call, not to the scheduler.

**How on-call reads an alert during the window**

- A tagged error inside the blast radius is the experiment working. It is logged, not paged.
- An untagged error inside the window is natural. It takes the normal response.
- An error outside the blast radius is natural, because the experiment did not touch it.
- If the burn continues after the pause, the cause is natural, or the experiment broke something that does not recover alone. Run the incident response and roll back the last change.

**What this experiment should teach**

The lesson notes that most teams discover their fallback was never fully tested. Record the time from the first rate-limit error to the first successful fallback, and compare it with the SLA. Record whether the gateway's retries amplified the load before the fallback engaged.

**Size the blast radius**

Choose a share of the fleet small enough that the fallback capacity on the other providers covers it, and write that share into the experiment definition. A larger share tests more and risks a real outage when the fallback is slower than you believed.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why gate at twice the expected burn and not at any burn? Expected: an experiment is meant to spend some budget. The gate catches the case where it spends far more than planned.
- **Level 4:** The burn keeps rising after the pause. What does that tell you? Expected: the cause is natural, or the experiment broke something that does not recover on its own. Run the incident response and roll back the last change.
- **Level 4:** How do you pick the blast radius for a provider outage experiment? Expected: a share small enough that the fallback capacity covers it, written into the experiment definition and reviewed with on-call.

**Wrong answers, and why they fail**

- "Silence all alerts during the experiment." A natural incident in the same window goes unseen. Silence only the blast radius, and keep tagged errors visible.
- "Run it in staging, so no safety plane is needed." Staging cannot show the fallback under real traffic. The safety plane is what makes production acceptable.
- "The burn-rate alert is the kill switch." The alert pauses the experiment. The kill switch stops it at once, and it should be a separate manual control.

:::

## Simulate a shadow, canary and rollback plan

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. You receive a candidate model, a baseline model, and one week of production request logs with the latency, the token counts and the user feedback of each request. Deliver a rollout plan and a simulator that executes it: a shadow phase, a canary ramp with gates, and a rollback. Inject at least two regressions and show where the plan halts for each one. The logs hold user feedback only for the responses that users saw, so state how the simulator produces feedback for the candidate.

:::answer Show the answer
:::say Short answer
Build a simulator that replays the logs through both models, computes the five gate metrics per step, and advances the ramp only when every gate holds for the required number of windows. Set each threshold above the baseline's own run-to-run variance, which you measure by replaying the baseline against itself. Inject a cost regression and a quality regression, and show the step at which each one halts and the rollback that follows.
:::

**Full answer**

**What a complete submission contains**

1. **The noise floor.** Replay the baseline against itself and report the spread of each metric. This is the floor under every gate.
2. **The gates.** Latency percentiles, cost per request, error and refusal rate, output length distribution, and user feedback rate. Write each as a multiplier above the floor. The lesson's defaults are a P99 above 1.5x, a cost more than 20 percent above the baseline, errors at 2x, a shift in the length distribution, and feedback at 1.5x.
3. **The shadow phase.** The candidate sees every request and returns nothing to a user. Report the cost delta, the length distribution, the refusals and the hard errors against the baseline.
4. **The ramp.** Steps at 1, 10, 25, 50, 75 and 100 percent. Compute the dwell at each step from the samples per window, so that a gate never decides on a handful of points.
5. **The rollback.** Model it as the lesson describes: a flag back to zero and a pin on the previous digest. The simulator shows the step and the time it takes.
6. **Two regressions.** The lesson's exercise injects a 25 percent cost regression, and a strong submission shows it halting at the first step. The second regression lives only in the feedback metric, and the submission shows that it stays invisible at the first step and halts only where the sample is large enough.
7. **A written decision.** The lesson's second exercise: a candidate with a 3 percent accuracy gain and a cost 18 percent above the baseline. Write both policy paths, ship and do not ship, and name who decides.

**What the reviewer looks for**

- The floor is measured, not assumed.
- The gates are multipliers, and the thresholds sit above the floor.
- The dwell is computed from samples, not from the clock.
- The regression that the first step cannot see is shown, not hidden.
- The rollback is rehearsed inside the simulation.

**What to keep for production**

The gate evaluation code and the noise-floor measurement become the checks of the real canary controller. The replay harness becomes the pre-release test for every future candidate.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The feedback regression was caught late. Is the plan wrong? Expected: no. It shows the limit of the feedback gate, and the fix is a longer dwell at the step where feedback first has samples, or a proxy metric with more volume.
- **Level 4:** The candidate has the same cost and tone as the baseline. What changes in the plan? Expected: skip the A/B step after the canary, which the lesson makes optional for an improved version of the same behavior.
- **Level 4:** What from the simulator survives into production? Expected: the gate evaluation code and the noise-floor measurement, which become the canary controller's checks.

**Wrong answers, and why they fail**

- "Use the lesson's thresholds as they are." The lesson's numbers are defaults. The floor comes from your own baseline.
- "Advance the ramp on a fixed schedule." A ramp that moves on the clock ignores whether a gate had enough samples.
- "Model the rollback as a redeploy." The simulator should model the mechanism you will use, and a redeploy is the mechanism the lesson tells you to remove.

:::

## What the system does with a predicted outage

*Level 4 (staff) · design · about 15 minutes*

A model trained on your logs, GPU temperatures and error patterns predicts most outages ten to fifteen minutes before they happen. The team wants to ship it as a dashboard panel. Design what the system does with a prediction, and defend the design.

:::answer Show the answer
:::say Short answer
A prediction with no action is a dashboard, and nobody watches a dashboard at three in the morning. Write a policy per prediction class: page the on-call, drain the suspect node or pool before it fails, or scale within approved bounds, and record every prediction with its outcome. Start with the page, measure the precision on live incidents, and promote a class to an automatic drain only when its false alarm rate is acceptable and a person has approved that drain as a pre-approved action in the runbook.
:::

**Full answer**

**The result and its limit**

The lesson cites a research result: a model trained on past log lines, GPU temperature readings and API error patterns predicted 89 percent of outages 10 to 15 minutes early on its test set. The lesson's reality check follows at once. Predictions without actuation are dashboards. The operational question is what you do when the prediction fires.

**The design**

1. **Classify the prediction.** Which failure is coming: a memory exhaustion, a thermal slowdown, a provider error burst. Attach the confidence.
2. **Map each class to an action.** The lesson's safe set is narrow: restart a pod, revert a deploy, scale within pre-approved bounds. A drain is not on that list, so it needs approval before it runs on its own. Drain the pod from the load balancer and restart it before it falls over. Scale the pool within approved bounds. Page a person with the prediction and the evidence.
3. **Fit the action into the lead time.** A drain plus a replacement must complete inside the ten to fifteen minutes, so the replacement has to be warm already. A cold start of a large model takes minutes and can eat the whole window.
4. **Record outcomes.** Every prediction, its class, the action taken and whether the outage happened. Precision and recall per class come from this log, not from the paper.
5. **Guard the blast radius.** Never run two automatic drains in the same pool at once, and never drain under a load spike without a warm spare.

**Why page first**

A page costs sleep. A false drain costs capacity for the drain time. A false scale-up costs money. Until the precision per class is measured in production, the cheapest wrong action is the page. Promote a class to automatic action when its record justifies it, the same ladder the lesson uses for remediation.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does a false alarm cost under each policy? Expected: a page costs sleep, a drain costs capacity for the drain time, and a scale-up costs money. Pick the policy per class from that cost against the cost of the outage.
- **Level 4:** The lead time is ten minutes and a replacement replica takes longer to warm. What changes? Expected: keep a warm spare or act earlier on a weaker signal. A drain with no warm replacement moves the outage instead of preventing it.
- **Level 4:** How do you know the predictor still works after the service changes? Expected: track precision and recall per class on live incidents, and retrain when the input distribution shifts.

**Wrong answers, and why they fail**

- "Ship the panel and let on-call decide." At night nobody watches a panel. The lesson's point is that a prediction without an action is a dashboard.
- "Automate the drain for every prediction from day one." A false alarm then costs capacity, and nothing has measured the false alarm rate on your traffic.
- "The research number means we will prevent most outages." The number was on a test set. Your precision in production is unknown until you measure it.

:::
