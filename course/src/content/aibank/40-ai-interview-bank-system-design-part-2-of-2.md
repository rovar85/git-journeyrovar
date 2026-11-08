---
track: aibank
title: "AI interview bank: System design (part 2 of 2)"
short: System design 2
sub: 10 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A payment fraud check inside a hundred milliseconds

*Level 3 (senior) · design · about 20 minutes*

A payment service must approve, review or block each payment within 100 ms, at 400 requests per second at peak. Fraud labels arrive as chargebacks weeks later. Design the system: the task, the serving mode and its sizing, the data and label plan, the rollout, the failure defaults, and the two things that will quietly break it after launch.

:::answer Show the answer
:::say Short answer
The task is binary classification of fraud probability with two thresholds that split the score into approve, review and block, served online because the decision needs the data of the request. At 400 requests a second and 50 ms per request about 20 requests are in flight at any moment, so the service is small, and the budget leaves room for a feature fetch plus the model. Chargeback labels come weeks after the payment, so training uses a time split and features that exist at payment time, and the rollout goes shadow, then canary on a small share, with the heuristic rule as the default on timeout. The two quiet failures are the feedback loop, where blocked payments never get a label, and concept drift, where the same basket changes its fraud risk and only outcome monitors see it.
:::

**Full answer**

**Task and decision**

| Question | Answer |
|---|---|
| Prediction, per entity | Probability that this payment is fraud |
| Decision | Approve, send to review, or block, inside 100 ms |
| When, with what data | At the request, with the payment, the card history and the device |
| Success | Fraud losses down with the approval rate as a guardrail |

**Serving and sizing**

Batch cannot serve this: the staleness limit is zero because the payment did not exist a minute ago. Online inference fetches features and runs the model inside the budget. Little's law sizes it: throughput times latency is the number in progress, so 400 requests a second at 50 ms each is 20 requests in flight, far below what two replicas handle. The p99, not the mean, must stay under the budget; a p99 of 100 ms means 99 of 100 requests finish in time.

**Data and labels**

Chargebacks arrive weeks after the payment, so the outcome of recent traffic is unknown. Train on a time split with the most recent labeled period held out. Every feature must exist at payment time; anything written after the outcome, such as a dispute flag, leaks the label.

**Rollout**

Shadow: score live payments and log, never act; compare latency, error rate and score distribution with the current rule. Canary: act on a small share, often 1 to 5 percent, widen in steps, roll back by configuration when a guardrail moves. Then measure losses against a holdout.

**Failure defaults**

- Model times out: apply the heuristic baseline the team already uses.
- A feature is missing or out of range: use its documented default and log it.
- A new card with no history: the rule or the population average.
- The score distribution moves suddenly: pause automatic blocks and page a person.

**The two quiet failures**

1. The feedback loop. A blocked payment never gets a chargeback, so the retrained model sees fewer fraud examples from the region it blocks and slowly learns that region is safe. Give a small random share of payments a non-blocking decision and log the score and the action with every row, so later training can tell influenced data from clean data.
2. Concept drift. Fraudsters change tactics, and payments that were safe start to charge back. Inputs look the same, so input monitors stay quiet; only the outcome monitor sees it, and only after the label delay. Prior drift, such as the fraud rate doubling during an attack, shows up earlier in the prediction monitor as a moving positive rate.

**Monitoring**

System health at once, inputs and predictions at once, outcomes joined as chargebacks arrive and computed on the labeled part only. Alert policy with effect sizes, a corrected alpha and persistence, so the on-call person reads the alerts.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a time split matter more here than a random split? Expected: a random split leaks future tactics into training and overstates performance on the next month's fraud.
- **Level 3:** The review queue grows after launch. Which guardrail caught it and what do you adjust? Expected: the review rate guardrail; move the review threshold, not the model.
- **Level 4:** The random non-blocking share costs real fraud losses. How do you size it? Expected: as the smallest share that keeps enough labeled fraud examples from the blocked region to retrain; price it as the cost of clean data against the cost of a model that drifts blind.
- **Level 4:** Retraining on the last quarter's labels after a tactic change makes the model worse. Why? Expected: concept drift; most of the labels still describe the old relation, so new labels must be collected before retraining helps.

**Wrong answers, and why they fail**

- "Precompute fraud scores nightly for every card." The payment did not exist last night; the decision needs request-time data.
- "Retrain weekly on all blocked and approved payments." Blocked payments have no outcome, so the training set drifts toward the model's own decisions.
- "Watch feature drift and you will see the fraudsters change." Concept drift leaves inputs unchanged; only outcomes show it.

:::

## Accuracy fell and every input monitor stayed green

*Level 3 (senior) · debug · about 12 minutes*

A payment model's accuracy, measured as labels arrive, fell from 0.946 to between 0.76 and 0.79. The feature monitors and the score distribution stayed quiet the whole time. The team proposes retraining on the last quarter of labeled data tonight. What happened, why did the monitors miss it, and is the proposal right?

:::answer Show the answer
:::say Short answer
The relation between inputs and labels changed while the inputs themselves did not, which is concept drift. Input and prediction monitors compare distributions of features and scores, so a change in the conditional label distribution is invisible to them, and only the outcome monitor can see it, after the label delay. Retraining tonight on the last quarter is the wrong move: most of those labels still describe the old relation, so the model relearns it; collect labels from after the change first, then retrain on them.
:::

**Full answer**

**Three kinds of drift**

| Drift | What changes | Which monitor sees it |
|---|---|---|
| Covariate | The input distribution | Input monitors |
| Prior | The label rate | Prediction and outcome monitors |
| Concept | The label given the input | Outcome monitors only |

Covariate drift moves features and often leaves accuracy alone. Prior drift moves the positive rate. Concept drift changes which answer is right for the same input, so nothing upstream of the label moves.

**What the demo shows**

The lesson's stream injects both kinds. During the covariate segment the PSI and the KS statistic alert on the amount feature while accuracy stays between 0.89 and 0.95. During the concept segment the inputs are identical to the reference, both input monitors stay at their clean values, and accuracy falls from 0.946 to the 0.76 to 0.79 range. The accuracy alert fires 1000 events after the change, and the label delay of 500 events accounts for half of that lag.

**Why the lag**

The outcome monitor always looks one label delay into the past, because it can only score the events whose outcome has arrived. The persistence rule, which requires consecutive drift windows before an alert, adds the rest. Both are deliberate: without them the alert rate is unusable.

**Why the retraining proposal is wrong**

Retraining answers covariate drift into regions with little data. Concept drift needs labels from after the change. A quarter of labels where the change happened late in the window teaches mostly the old concept. The right sequence is: confirm the change point from the outcome monitor, gather enough labels past it, retrain on those, test on the most recent labeled slice, roll out through shadow and canary, and reset the reference window to the new training data.

**What to do tonight**

Route more cases to review if the business impact is large, as a temporary measure while labels from after the change arrive. A threshold move is the lesson's action for prior drift. For concept drift it helps only when the boundary moved on the same score, and it cannot restore a risk order that changed. Keep the model; replace it only with labels that describe the new relation.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which signal could you add that reacts before the labels? Expected: none for pure concept drift; a proxy such as a review queue outcome or a faster partial label is the only earlier signal.
- **Level 3:** How does a performance estimator that uses predicted probabilities behave here? Expected: it assumes the calibration still holds, so it misses concept drift; the lesson notes that such estimators handle covariate shift and not concept drift.
- **Level 4:** How do you choose how many post-change labels are enough? Expected: enough to test the retrained model on a recent held-out slice with a tolerance you set in advance; the test on recent labels is the gate, not a count.
- **Level 4:** After retraining, the input monitors start to alert on the clean reference. Why? Expected: the reference window was not reset to the new training data, so it compares live traffic with an old distribution.

**Wrong answers, and why they fail**

- "The feature monitors are broken; nothing changed in the inputs." They worked as designed; the inputs did not change, the labels did.
- "Retrain on everything so the model sees the new pattern." The old labels outnumber the new ones and the model relearns the old relation.
- "Shorten the windows to catch it faster." Smaller windows add noise and false alarms; the lag here comes from the label delay, which windows cannot remove.

:::

## Design a chat API for ten thousand daily users

*Level 3 (senior) · design · about 25 minutes*

Design the service behind a chat product with 10,000 daily active users who send about 5 queries each, with roughly 1,500 input tokens and 400 output tokens per query. Users must see a response start quickly, the tail must stay bounded, and the product has a unit cost target. Lay out the request path, the components, the budgets you hold each one to, and how you would scale it.

:::answer Show the answer
:::say Short answer
The request enters through a gateway that authenticates and rate limits per user, passes input guardrails, is matched against a semantic cache, and on a miss goes to the model with streaming, then through output guardrails, an eval logger and a cost tracker. The budgets are a median under 2s, a p99 under 10s, a cache hit rate above 30%, a guardrail block rate under 5%, and a cost per request under $0.01. At 50,000 queries a day this runs on a few async servers behind a load balancer; the servers are I/O bound, so a single async process holds a hundred or more concurrent requests and scaling means more servers, not more cores.
:::

**Full answer**

**The path**

Gateway for authentication, rate limits of 10-50 requests a minute per user and CORS; input guardrails for injection patterns and personal data; a prompt router that picks the template and version; a semantic cache keyed by query embedding with a similarity threshold and a time to live; the model call with streaming and a fallback chain; output guardrails; an eval logger; a cost tracker; a server-sent events response. Seven components, each one a known piece; the engineering is the wiring and the budgets.

**Budgets**

| Metric | Target | Why |
|---|---|---|
| Median latency | Under 2s | The typical experience |
| p99 latency | Under 10s | The tail drives churn |
| Cache hit rate | Above 30% | Direct cost savings |
| Guardrail block rate | Under 5% | Higher means false positives |
| Cost per request | Under $0.01 | Unit economics |

Streaming puts the first token inside the median budget even when the full answer takes seconds. Maximum token limits on input and output bound both the cost and the tail. Every external call has a timeout.

**Load and capacity**

Traffic is 50,000 queries a day, and with the measured cache hit rate about 32,500 reach the model. Peak matters more than the average; size for the busiest minute. The servers wait on network I/O, so one async process serves 100+ concurrent requests and a box with four workers serves 400+. The lesson's scaling table puts this tier at a few async servers with a cache and a queue, for about $500 a month of infrastructure, with the model bill on top. Connection pooling to the provider avoids a new TLS handshake per request, which costs 100-200ms. Work that is not interactive, such as summarization, goes to a queue with workers and a job id the client polls.

**Observability**

Every request writes one structured log line with the request id, the user, the template and version, the model, the input and output token counts, the latency, the cache result, the guardrail results and the cost. Traces across the components show where the time went. The five numbers in the table sit on one dashboard.

**If the model is self-hosted**

The pipeline lesson's serving stage adds continuous batching, speculative decoding, and KV cache eviction, with quantized weights for serving and the eval gate rerun on the quantized model. The same gateway, cache and guardrails sit in front of it.

**Before launch**

The deployment checklist has fifteen items; the ones people skip are per-user rate limits, maximum token limits, a health endpoint that reports dependency status, timeouts on every external call, and a load test with 100 concurrent users.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** A user pastes a document far longer than the context window. Where is that caught? Expected: at the maximum input token limit before the model call, with a clear error, not at the provider.
- **Level 3:** Why does cost per user matter when cost per request is already under target? Expected: a few heavy users dominate the bill; per-user tracking and a daily cap move them to a cheaper model or stop them.
- **Level 4:** The provider has a regional outage during the daily peak. Walk the request path. Expected: backoff and retries on the primary, fall through the chain to a second model, then cached answers for repeated queries, then an unavailable message; the cost tracker shows the fallback's price and the dashboard shows the step that answered.
- **Level 4:** How do you prove the service meets its budgets before the first user? Expected: a load test at 100 concurrent users against the staging stack with the dashboard metrics as pass criteria, plus a shadow run of the prompts on logged traffic.

**Wrong answers, and why they fail**

- "Scale the model servers first." The service is I/O bound at this traffic; the gateway, cache and async servers are the design, and the model is a dependency.
- "Skip the cache; the model is the product." A third of the traffic repeats, and the cache is the largest single saving in the bill.
- "The p99 is a vendor problem." Timeouts, maximum tokens, streaming and the fallback chain are what bound the tail on your side.

**Related lesson in this course:** [Deep dive 13: production agent systems](#aideep-13)

:::

## Design cited search over ten repositories of code

*Level 3 (senior) · design · about 25 minutes*

An engineering organization wants to ask questions across 10 repositories with about 2M lines of code and get answers that cite file and line. The index must stay fresh on every push. Design the ingestion, the retrieval, the answer step, the freshness path, and the evaluation, with the budgets you would commit to.

:::answer Show the answer
:::say Short answer
Parse each file into function and class nodes and chunk at those boundaries, give each chunk a dense embedding, sparse terms and a one-sentence summary, and store a graph of imports and calls between chunks. A query runs dense and sparse search in parallel, merges and deduplicates, reranks the top 50 with a cross-encoder to keep 10, and hands those to a long-context model that must cite every claim by file and line; uncited claims are dropped. A push triggers a symbol-level diff so only changed chunks re-embed, with a budget of under 60 seconds for a 50-file push. Quality is measured on 100 labeled cross-repo questions with MRR@10, nDCG@10, citation faithfulness and p50 and p99 latency.
:::

**Full answer**

**Ingestion**

- A push webhook starts a worker that collects the changed files.
- A parser with grammars for the languages in the fleet extracts function and class nodes with their full source span. Chunks follow node boundaries, not fixed token windows.
- Each chunk gets three representations: a dense code embedding, sparse terms in a field-weighted index with symbol names weighted 4, bodies 1 and summaries 2, and a one-sentence summary written by a small model with the system preamble cached.
- A symbol graph records imports, calls and inheritance across files and repositories, used at query time to expand retrieval across repo boundaries.

The summary is the third retrievable modality: a user asks how something is authorized, the code says `check_permission`, and the summary says authorization.

**Retrieval and answer**

1. Fire dense and sparse search in parallel, deduplicate by repository, path and symbol.
2. Rerank the top 50 with a cross-encoder and keep the top 10.
3. Call the synthesizer with the reranked chunks and a cached system prompt, requiring a file and line anchor on every claim.
4. Parse the output and check each anchor against the span at the indexed commit; a claim without an anchor, or with a span that is missing or does not support it, is re-asked or dropped. Only verified claims return.

Naive cosine search alone is poisoned by generated boilerplate, monorepo duplication and rarely imported symbols, which is why the hybrid search, the reranker and the graph exist.

**Freshness**

On each webhook compute the symbol-level diff. Re-embed only the chunks whose text changed, recompute the import, call and inheritance edges of the changed symbols, and delete the chunks, summaries and edges of removed files and symbols from every store. The budget is a 50-file push searchable in under 60 seconds for the whole fleet, without reprocessing the 2M lines.

**Evaluation and budgets**

| Weight | Criterion | Measure |
|---|---|---|
| 25 | Retrieval quality | MRR@10 and nDCG@10 on 100 held-out questions |
| 20 | Citation faithfulness | Share of claims with a verifiable file and line anchor |
| 20 | Latency and scale | p95 query latency at 10k QPS on the indexed corpus |
| 20 | Incremental indexing | Time from push to searchable on a 50-file commit |
| 15 | Answer formatting | Clickable citations, snippet previews, follow-up affordance |

A weekly rerun of the 100 questions with an alert on an MRR@10 drop above 5% catches drift in the index or the models.

**The service around it**

The query path sits inside the production stack from the application lesson: a gateway with per-user limits, guardrails on input and output, streaming of the answer, structured logs per retrieval and synthesis step, and cost tracking that attributes the summary model, the embeddings, the reranker and the synthesizer separately.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why chunk at syntax nodes instead of fixed token windows? Expected: a window cuts functions in half and mixes neighbors; a node is one coherent unit with a stable symbol name to cite and deduplicate on.
- **Level 3:** What does the reranker add that the two retrievers cannot? Expected: it scores each query and candidate pair together, which is more accurate than cosine on separate embeddings, at a cost that only the top 50 can afford.
- **Level 4:** Generated boilerplate makes up a fifth of the corpus. What happens and what do you change? Expected: retrieval poisoning, where near-duplicate generated code crowds the results; flag generated chunks in the payload and down-weight them.
- **Level 4:** A question needs code from four repositories. Which component carries that? Expected: the symbol graph expands the candidate set across import and call edges, so the reranker sees chunks from repositories the first search missed.

**Wrong answers, and why they fail**

- "A million-token context window replaces retrieval." Context helps but does not rank; cross-repo questions still need retrieval and citations.
- "Dense embeddings alone are enough for code." Exact symbol names need the sparse index, and the summary catches intent that the code text does not state.
- "Re-index the fleet on every push to keep it simple." Reprocessing 2M lines per commit blows the freshness budget; the diff keeps the index consistent at a fraction of the work.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Design the gate that decides whether a model ships

*Level 3 (senior) · design · about 20 minutes*

A team trains and aligns models in a multi-stage pipeline and ships the result to serving. Design the evaluation platform that decides whether an artifact is shippable: what it reads, what a gate is, which two gates catch most disasters, how it handles a failed gate, and how a third party replays a decision.

:::answer Show the answer
:::say Short answer
The platform reads a manifest that describes the run completely, with a seed, a code revision, and an input and output hash for every stage, and it evaluates numeric gates that were written before the run started. A regression gate holds the new model to the previous one on core benchmarks and catches training bugs; a KL budget gate caps how far the aligned policy drifted from its reference and catches alignment overcooking. A failed gate holds the run for a named reviewer whose override is logged in the manifest, and anyone can replay the decision because the eval report is content-addressed and the eval data hash is part of it.
:::

**Full answer**

**What the platform reads**

The manifest is the single file that describes the run well enough to replay it: pipeline version, seed, code revision, and per stage a recipe, an input hash, an output hash, wall clock and cost. The output hash of one stage is the input hash of the next, so a corrupted or swapped artifact stops the pipeline before any evaluation. Artifacts are typed: an eval report carries benchmark scores, regression diffs and the hash of the eval data, so a report cannot be confused with a checkpoint or attached to the wrong model.

**Gates**

Every gate is a numeric threshold written before training starts, for example a core benchmark at least the baseline plus 0.5, a coding benchmark at least the baseline plus 1.0, a truthfulness benchmark with no drop, a safety refusal rate at most 0.05, a KL from the reference at most 25.0, and a total cost at most 50000. No "looks good" gates and no subjective sign-offs. If every gate passes the artifact is marked shippable; if any fails the run is held.

**The two gates that matter most**

- Regression: the new model must be at least as good as the previous one on the core set. This catches training bugs, bad data mixes and broken tokenizers.
- KL budget: the aligned policy must not drift further than a set amount from its reference. This catches alignment that overcooked the model into a narrow behavior.

Every production pipeline has both.

**Contamination**

A gate that compares the eval data hash against the training shards by exact match or long n-gram overlap, and fails when the overlap passes a small fraction, keeps a benchmark gain honest. The pipeline lesson's exercise sets that fraction at 0.1% with 13-gram matching.

**Holds, overrides and replay**

A held run is a decision point, not a failure. A named reviewer either approves the rollback or overrides, and the override is written into the manifest with the name. Replay works because the manifest, the content-addressed eval report and the eval data hash identify the exact inputs; a teammate on another continent runs the gate against the same hashes and must get the same verdict. Reproducible is not deterministic: weights can differ at the level of small rounding between runs, so replay checks hashes and headline metrics, not bit-identical tensors.

**Where the platform plugs in**

The gate runs after evaluation and after quantization, because quantized weights must pass the same thresholds as the full model. The three commands are plan, run and gate; plan is free and catches missing thresholds and stale hashes before any compute is spent.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why must the thresholds be written before the run? Expected: a threshold chosen after seeing the scores is moved to pass the model; a gate is only a gate if it can fail.
- **Level 3:** A change to the eval set invalidates what? Expected: only the ship decision; the eval data hash changes, the report is recomputed, and the training artifacts stay valid.
- **Level 4:** The quantized model passes every gate except the safety refusal rate, which rose slightly. What do you ship? Expected: nothing without a logged override; the gate exists for the serving artifact, and the lesson's recipe keeps safety evals on a higher-precision quantization where deltas matter.
- **Level 4:** How does the platform stop a model trained through the wrong stage from reaching the gate? Expected: typed artifacts and typed stage signatures, so a preference-tuned checkpoint cannot be fed into the supervised path and the mismatch fails at plan time.

**Wrong answers, and why they fail**

- "Have a reviewer look at samples and sign off." Subjective sign-offs are not gates; a gate is a number that can fail, and the reviewer's role is the logged override.
- "Rerun training to confirm a result." Pre-training costs weeks; replay checks hashes and metrics against the manifest instead.
- "One benchmark is enough if it is the right one." The regression set and the KL budget catch different failures, and a safety gate catches a third.

:::

## Offline accuracy was fine and live accuracy is not

*Level 3 (senior) · debug · about 15 minutes*

A churn model scored well offline and does worse than the older, simpler model on live traffic. Serving features are computed by another team's service. You have a sample of logged serving requests. Design the triage: which comparisons you run, in which order, what each one isolates, and what the fix looks like for each cause you find.

:::answer Show the answer
:::say Short answer
Compare the same entity and time across three pairs. The online store read against the training join tests the whole system and should show zero skew when both read one definition. A fresh computation against the training join isolates staleness, and the second team's code path against a fresh computation isolates code differences such as window boundaries and defaults. Each pair gives a mismatch rate and a mean absolute difference per feature, and the fix for every cause is the same shape: one registry definition that both paths call, with logged serving features checked against it.
:::

**Full answer**

**The four causes**

| Cause | What happens | Example from the lesson |
|---|---|---|
| Two code paths | Training and serving compute the feature differently | The serving window includes one extra day |
| Stale features | The served value has a different age than training saw | Training read weekly snapshots, serving computes fresh |
| Different defaults | The two paths fill a missing value differently | Training used 365 for no purchase yet, serving used -1 |
| Time travel | Training read a value from after the label time | A naive join took the newest snapshot |

**The three comparisons**

1. Online store read against the training join. Both read the same materialized rows from one definition, so every feature should show a mismatch of zero. A nonzero result here means the store or the join itself is wrong.
2. Fresh computation against the training join. This isolates staleness. In the lesson's demo the fresh value differs on most requests: 83.0% mismatch for days since last purchase, 30.5% for the purchase count, 37.1% for spend. Fresher is not better here, because the model learned from values up to six days old.
3. Second code path against fresh computation. This isolates code. The demo shows 12.5% mismatch on both window counts, because the other team's window includes one extra day, and 5.5% mismatch on days since last purchase with a mean difference of 20.07, which comes only from new users where the defaults disagree, -1 against 365.

The check needs the same request keys on both sides, and it fails loudly when the keys differ or when there are no requests, because a missing request hides skew and an empty check proves nothing.

**The fixes**

- Two code paths: delete the private copy; both services call the registry definition, and a change creates a new version that old models do not pick up.
- Stale features: match the serving age to the training age, or retrain on the fresher snapshots; a feature's freshness is part of its definition.
- Different defaults: one default in the registry, applied by one function in both paths.
- Time travel: the point-in-time join with the TTL, which the demo shows moves offline accuracy from an inflated 0.948 to an honest 0.893 and live accuracy from 0.763 to 0.876.

**Why the simpler model won live**

The older model used features that both paths computed the same way. The new model trusted a feature whose live values came from a different window and a different default, so it saw inputs it never trained on.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which comparison would you run first with one hour available? Expected: the first one; if the store read matches the training join, the system is consistent and the problem is elsewhere, and if not, every downstream check is moot.
- **Level 3:** The defaults differ only for new users. Why does the mismatch rate understate the damage? Expected: the rate is low because new users are few, but the difference per mismatch is huge, so the model's output for every new user is wrong.
- **Level 4:** The other team cannot change their service this quarter. What do you do? Expected: log their served features, train the next model on those logged values so training matches serving, and keep the skew check running so the gap is visible.
- **Level 4:** How does a created timestamp enter the triage? Expected: a backfill written today can read late-arriving data, so a strict join also drops rows created after the label time; otherwise the training path itself is skewed.

**Wrong answers, and why they fail**

- "Fresh serving features are always better than training snapshots." The model learned the training freshness; a different age is skew in either direction.
- "A mismatch rate under a few percent is fine." A small rate with a large mean difference, as with the defaults, still breaks every affected prediction.
- "Compare offline accuracy with live accuracy and call it drift." Drift is a change over time; skew is a difference between two readers of the same feature at the same time, and the three comparisons tell them apart.

:::

## One command from raw data to a served tuned model

*Level 3 (senior) · design · about 25 minutes*

A team wants to adapt an open model in the 8B class to its own domain and serve it at a measurable cost per million tokens. Design the pipeline so that one command runs it end to end: the stages, the hardware per stage, the data hygiene, the ablations you require, the serving measurements, and what the release must include.

:::answer Show the answer
:::say Short answer
Five stages, each with a config file in version control: data preparation with deduplication, a quality filter, personal data scrubbing and a contamination check against the eval sets; supervised fine-tuning for 2-3 epochs on 8xH100 with a cosine schedule and packed sequences; one epoch of preference tuning on 4xH100 with a swept beta; quantization into three formats; and serving with speculative draft heads and autoscaling on queue wait. The deliverable is an ablation table of base, SFT only, SFT plus DPO and SFT plus GRPO on the task benchmarks, serving numbers at batch 1, 8 and 32 with the draft acceptance rate and cost per million tokens, a safety pass rate, and a model card with seeds, configs and commit hashes.
:::

**Full answer**

**Stages and hardware**

| Stage | What | Hardware in the capstone |
|---|---|---|
| Data | Deduplicate, filter quality, scrub personal data, split with a seed | CPU |
| Contamination check | Near-duplicate hashing of every validation split against the public test sets; reject overlap | CPU |
| SFT | Sharded optimizer, fast attention kernels, packed sequences, 2-3 epochs | 8xH100 |
| Preference tuning | One epoch of DPO on pairs, or GRPO with a verifiable reward; sweep beta | 4xH100 |
| Quantize | Three formats for deployment flexibility; record size and throughput | One GPU |
| Serve | Draft heads for speculation, autoscaling on queue wait | Serving GPUs |
| Eval and card | Benchmark matrix, safety eval, model card | CPU plus eval GPU |

In the capstone's example run the data stage keeps 280k of 300k examples, SFT takes 6h12m and moves validation loss from 1.42 to 1.03, DPO runs 1h40m at a beta of 0.08, the quantized weights are 4.6 GB, and serving shows a draft acceptance rate of 0.74 with a p99 of 126ms at a batch of 8.

**Hygiene is a gate, not a step**

The contamination check runs before training and fails the pipeline on overlap. The capstone's exercise leaks a small share of test answers into training and watches a benchmark jump unrealistically; the check is what makes the eval delta believable. The pipeline lesson adds the mechanism: a manifest with an input and output hash per stage, so the SFT stage refuses data that does not match the hash the contamination check approved.

**Ablations are the deliverable**

The question the pipeline answers is not whether the model got better but which stage paid for it. Run the eval matrix on the base, on SFT only, on SFT plus DPO and on SFT plus GRPO. The example reports gains of +3.2 on one benchmark and +0.41 on another after the full run. Without the ablation, a regression from preference tuning hides behind the SFT gain.

**Serving measurements**

Tokens per second at batch sizes 1, 8 and 32, the acceptance rate of the draft heads, and the cost for each million tokens against a hosted alternative at matched quality. Acceptance measured on the domain data, not generic chat, because the draft heads were trained for the domain and the latency budget depends on it.

**The release**

A model card with the data sources and licenses, the training configs, the eval matrix, the safety pass rate, a reproducibility section with seeds and commit hashes, and the quantization deltas. One command reruns the pipeline with identical seeds; the rubric weights reproducibility and data hygiene as heavily as the eval gain.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does preference tuning need fewer GPUs than SFT? Expected: it runs one epoch on a much smaller set of pairs, and the capstone sizes it at half the SFT hardware.
- **Level 3:** Which stage gets rerun when the safety eval fails on the quantized model? Expected: quantization and serving only; the pipeline lesson's rollback invalidates the failed stage and its descendants.
- **Level 4:** The acceptance rate on domain traffic is far below the number from generic chat data. What does that do to the design? Expected: the latency budget was set on the wrong number; retrain the draft heads on domain data or size serving without the speculation gain.
- **Level 4:** A smaller model with a low-rank adapter matches quality at a tenth of the memory. How does the pipeline change? Expected: the SFT stage swaps to adapter training with the same data and eval gates, and the quantization and serving stages consume the merged weights unchanged.

**Wrong answers, and why they fail**

- "Skip the contamination check; the data is internal." Internal data copies public text all the time, and one leaked test set makes the whole eval table meaningless.
- "Report the final model against the base and stop." Without the per-stage ablation nobody knows whether preference tuning helped or hurt.
- "Measure serving at batch one only." Throughput and cost per million tokens come from batched decoding; batch one measures latency, not economics.

:::

## Keep clean data when the model changes its own future

*Level 4 (staff) · design · about 15 minutes*

Three systems retrain monthly on their own production data: a churn model that sends save offers, a fraud model that blocks payments, and a ranking model that orders a feed. Each one gets a little worse after every retrain. Explain the shared cause, design the data layer that prevents it, and say what each training row must carry for the fix to work.

:::answer Show the answer
:::say Short answer
Each model's decisions change the data that trains its next version, which is a feedback loop. Offers keep users who would have churned, so high-risk users look loyal; blocked payments never get a chargeback, so fraud disappears from the blocked region; the feed shows only its top items, so only those collect clicks. The fix is to keep data the model did not influence: a random holdout that never receives the intervention, a small share of random decisions, and a log that stores the score and the decision with every row, joined to features as of the decision time so training can separate influenced from clean data.
:::

**Full answer**

**Three shapes of the same loop**

| System | How the decision hides the label | What the retrain learns |
|---|---|---|
| Churn offers | Offers retain some at-risk users | Their features do not predict churn |
| Fraud blocks | A blocked payment has no outcome | The blocked region looks safe |
| Feed ranking | Only shown items can be clicked | The current top items are the only good ones |

The loop is listed among the main sources of technical debt in production ML systems because it is silent: every retrain looks fine on its own held-out data, which is also influenced.

**The data layer**

1. A random holdout group that never receives the intervention. Its outcomes are the clean estimate of the base rate and the clean labels for training.
2. A small share of random decisions on live traffic, for example payments that are not blocked or items shown out of order, so the blocked and unshown regions keep producing labels. The share is sized as the smallest that keeps enough labels from those regions.
3. Logging of the score, the decision and the assignment with every row at decision time.
4. Features joined as of the decision time, with the point-in-time rule from the feature store, so that a row's inputs are what the model saw and not a later snapshot that already reflects the outcome.

**What a training row carries**

The entity and the decision time, the features as of that time, the model score, the decision taken, the group it belonged to, the label and the label time. With those fields training can select clean rows, weight influenced rows, or model the decision as a feature. Without the decision and the group, influenced and clean rows are indistinguishable and the loop is invisible.

**Why the feature store is part of it**

A naive join on the entity returns the newest feature snapshot for every label, which copies the outcome into the input. The same mistake inside a feedback loop is worse: the newest snapshot also reflects the intervention. The as-of join with a TTL makes each row describe the moment of the decision, and the created timestamp check keeps a backfill from reading data that arrived later.

**Measuring the fix**

The holdout gives the business metric: the outcome in the treated group against the holdout group. It also gives the retrain test: evaluate the new model on holdout rows only, so the score is not inflated by the model's own decisions. A model that improves on influenced data and not on the holdout has learned the loop.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a time split alone not enough here? Expected: the recent period is also influenced by the deployed model; time ordering prevents future leakage but not intervention bias.
- **Level 4:** The random non-blocking share costs real fraud. How do you argue for it? Expected: as the price of clean labels against the cost of a model that drifts blind; size it to the minimum that keeps enough labeled fraud from the blocked region.
- **Level 4:** How does the exposure loop in ranking differ from the other two? Expected: the label is never collected rather than hidden; random exposure of lower-ranked items is the only way to learn their click rate.
- **Level 4:** A retrain evaluated on the holdout is worse than on the full set. Which number do you trust? Expected: the holdout; the full set rewards the model for agreeing with its own past decisions.

**Wrong answers, and why they fail**

- "More training data fixes a drifting model." The new data is influenced; more of it entrenches the loop.
- "A random train and test split shows the real performance." Both halves are influenced; only a holdout that never saw the intervention is clean.
- "Log the decision later from the outcome table." The decision and the assignment must be recorded at decision time, with the features as of that time, or the join leaks the outcome.

:::

## Review an ML design document and name the blockers

*Level 4 (staff) · design · about 20 minutes*

You are the reviewer for ML design documents before any training starts. A team hands you a document for a payment fraud check that proposes batch scoring, where one job takes an hour, with a three-minute staleness limit, reports an offline AUC, lists a majority-class baseline, and has no rollout section. Walk me through your review: the sections you expect, which gaps block, how you score it, and what you tell the team.

:::answer Show the answer
:::say Short answer
The document needs nine sections, and six items block a review because each one makes the system unsafe or useless: the decision that uses the prediction, a business metric, a heuristic or current-system baseline, confirmation that every feature exists at prediction time, a shadow or canary stage with a rollback, and a default action for every failure. This document fails at least three of them: the only baseline is trivial, there is no rollout and no rollback, and the serving choice fails the fit check because batch cannot meet a limit of three minutes when one job takes an hour. I send it back with the blocking list first, and I ask for precision at the decision threshold instead of AUC.
:::

**Full answer**

**The nine sections**

| Section | Question it answers | Blocking item |
|---|---|---|
| Problem | What is predicted, which decision uses it, why rules are not enough | The decision |
| Metrics | Offline, online, business and guardrail metrics | The business metric |
| Baselines | Trivial, heuristic and current-system baselines | A heuristic or current baseline |
| Data | Label source, delay, feature availability at prediction time | No leakage |
| Budgets and serving | Latency, peak QPS, cost, staleness, and the mode that fits | None |
| Rollout | Shadow, canary, A/B and the rollback | Shadow or canary plus rollback |
| Feedback loops | How the model's decisions alter its later training data | None |
| Failure modes | The default action for each failure | A default for every failure |
| Monitoring | What is watched after launch | None |

**Scoring**

Each checklist item has a weight, a blocking flag and a check. Blocking items weigh 2. The score is the sum of passed weights over the total, and the verdict is ready for review only when the score reaches 0.85 and no blocking item fails. A document can score high on the non-blocking items and still be sent back on one blocker; that is the point of the flag.

**The serving fit check**

This check reuses the cost model. It reads the workload numbers from the document, prices the chosen mode, and fails when that mode misses the staleness limit, the latency budget or the daily cost budget. A batch job that takes an hour cannot meet a limit of three minutes at any price, so a document that says batch with that limit fails the check. For a payment decision made at request time the fit is online, and the document must state the peak QPS and the p99 budget that size it.

**What I tell the team**

1. Blockers first: name the action that each score starts; add the rule the fraud team uses today as the heuristic baseline and set the minimum lift; add shadow and canary stages with a configuration rollback; write a default for a timeout, a missing feature, a new card and a sudden score shift.
2. Then the serving section: switch to online, give the budgets, price it.
3. Then the metric: AUC averages thresholds nobody uses; report precision and recall at the approve, review and block thresholds, and name the business metric and the guardrails.
4. Last the feedback loop and the monitoring, which are not blocking but will decide the second quarter.

**Why the review happens before training**

Every failure in the churn story at the start of the design lesson happened before training: no decision, stale cadence, a leaked feature, no comparison with the existing rule. A one-page document asks about each, and the review costs a day where the failures cost a quarter.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The team says the majority baseline is enough since it scores zero on F1. Why is that the wrong baseline? Expected: it is the trivial one and usually weak; the heuristic or current system is the real competitor and the one the lift is measured against.
- **Level 4:** Why does the serving fit check belong in a document review rather than in load testing? Expected: it is arithmetic on stated budgets and prices, so it catches an infeasible design before a line of serving code exists.
- **Level 4:** The document proposes a hybrid serving mode. What does the checker do and what do you do? Expected: the lesson's cost model has no hybrid plan, so the check fails until a hybrid plan is added; ask the team to price the batch and the online parts and add the plan.
- **Level 4:** What is the one non-blocking section you would still refuse to skip for a fraud system? Expected: feedback loops, because blocked payments never get a label and the model drifts toward its own decisions without a clean sample.

**Wrong answers, and why they fail**

- "A strong offline metric compensates for a missing rollout." A model with no shadow stage and no rollback reaches users with no way back; that is why rollout blocks.
- "Score the document and pass it at a high enough total." One failed blocker fails the review regardless of the total.
- "Serving mode is an implementation detail for later." The fit check shows batch cannot meet the limit at all, which changes the architecture and the cost.

:::

## Write the rollback plan before the training run starts

*Level 4 (staff) · tradeoff · about 20 minutes*

A twelve-stage training pipeline runs from tokenizer to inference server, and the pre-training stage costs weeks and millions of dollars. Before the run starts you must write what happens when each stage fails. Lay out the plan, explain how the orchestrator computes what to rerun, and say what "reproduce the run" can and cannot promise.

:::answer Show the answer
:::say Short answer
Sort the stages by the cost to rerun them: tokenizer, evaluation, quantization and the server are cheap and rerun in hours, supervised tuning and alignment take days, so the base checkpoint is kept and only those stages rerun, and pre-training takes weeks and a budget in the millions, so the plan is the last good checkpoint plus revised downstream stages. The rerun set falls out of the typed, hashed dependency graph: invalidate the failed stage and every descendant. A replay promises the same code, recipe and source data hashes and the same headline metrics, not bit-identical weights or the same output hashes.
:::

**Full answer**

**Three cost classes**

| Class | Stages | Plan on failure |
|---|---|---|
| Cheap, hours | Tokenizer, eval, quantization, inference server | Rerun |
| Medium, days | SFT, DPO, constitutional refinement | Keep the base model, rerun alignment |
| Expensive, weeks and millions | Pre-training | Last good checkpoint plus revised downstream stages |

Writing this before the run means nobody improvises at four in the morning with an exhausted team.

**How the rerun set is computed**

Every stage has typed inputs and outputs, and the output hash of a stage is the input hash of the next. A failure at the SFT stage invalidates it and every descendant: the reward model, the DPO policy, the refined policy, the eval report, the quantized weights and the server, which is stages six through twelve. A failure at quantization invalidates only quantization and the server. The orchestrator reads the graph from the manifest, so the rollback set is computed, not remembered. A change to the tokenizer invalidates everything downstream; a change to the eval set invalidates only the ship decision.

**Why hashes make it safe**

Artifacts live in an immutable store addressed by content hash, never by a name such as latest. A partial rerun checks whether each expected output already exists at the right hash and skips the stage if it does. That is also how a partial rollback saves most of the wall clock: stages one through eight stay cached while nine through twelve rerun. The pipeline lesson's exercise measures exactly that saving.

**What reproduce means**

Reproducible: the same manifest, code and infrastructure give a checkpoint with equivalent downstream metrics. Deterministic: bit-identical output. Distributed reduce order, kernel nondeterminism and mixed precision rounding make modern training reproducible but not deterministic; weights differ at a level around 1e-5 between runs while the metrics do not move. The cure is to log the input hash, the output hash and the headline metrics per stage. If the code, recipe and source data hashes and the headline metrics match, the run is reproduced even when a weight artifact and the input hashes after it get new values, and a bit-level diff is the wrong debugging tool. The lesson's rule that the input hash, the output hash and the metrics all match holds in full for the stages with deterministic output, such as the tokenizer and the eval data; for a weight artifact, which cannot be bit-identical, the metrics carry the check.

**Budget as part of the plan**

The pre-run cost estimate uses six times parameters times tokens for the training compute, divided by peak throughput and utilization, at the rental rate. If the estimate exceeds the cost gate the pipeline refuses to start. After each stage the remaining budget is rechecked, so an overrun in one stage changes the gate for the next instead of being discovered when the money is gone.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why not name artifacts by version string? Expected: two artifacts can share a name and differ in content; the hash is the identity, and a name like latest is a trap.
- **Level 4:** The reward model and the DPO policy both depend on the SFT checkpoint. What can run in parallel and what must wait? Expected: the two can run together after SFT; the refined policy waits for both, and its input hash must be a deterministic combination of both outputs.
- **Level 4:** A corrupted checkpoint is discovered after alignment finished. Which plan applies? Expected: the expensive class; take the last good pre-training checkpoint and rerun the medium and cheap stages, never the full pre-training.
- **Level 4:** A teammate reports that their replay has different weights. Is the run broken? Expected: not by itself; compare the code, recipe and source data hashes and the headline metrics, and only a mismatch there means the run is not reproduced.

**Wrong answers, and why they fail**

- "Rerun from the start to be safe." The expensive stage costs weeks; the typed graph tells you exactly which stages are invalid.
- "Keep the latest checkpoint file and overwrite it each step." A mutable name cannot be verified or replayed; content addressing is what makes the rollback set trustworthy.
- "If the weights are not bit-identical, the pipeline is not reproducible." Distributed training is not deterministic; reproducibility is defined on the code, recipe and source data hashes and the metrics.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::
