---
track: aibank
title: "AI interview bank: System design (part 1 of 2)"
short: System design 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A churn model with a good AUC that nobody uses

*Level 1 (screening) · concept · about 8 minutes*

A data scientist reports a churn classifier with an AUC of 0.91. Three months after launch, nobody on the retention team uses the scores. The algorithm was fine. Name the design decisions that were missing, and say which metric should have been reported instead.

:::answer Show the answer
:::say Short answer
The failures happened before training: nobody named the action a score starts, the scores arrived weekly while the team called customers daily, a feature leaked the label through the cancellation reason, and nobody compared the model with the rule the team already used. AUC averages over every threshold including ones never used; the decision was to contact the top 5 percent each night, so the right offline number was precision in that top 5 percent, paired with online, business and guardrail metrics.
:::

**Full answer**

**Four layers of metrics**

| Layer | When measured | Churn example |
|---|---|---|
| Offline | Before launch, on held-out past data | Precision in the top 5 percent at the offer threshold |
| Online | During launch, on live traffic | Offer acceptance rate, share of users scored |
| Business | Weeks later, with an experiment | 30-day churn in the treated group versus a holdout |
| Guardrail | All the time | Offer cost per saved user, unsubscribe rate, p99 latency |

The layers disagree often. The offline score comes from a past that did not contain the model. The online metric depends on how people react to the decision. The business metric moves slowly and carries noise from everything else in the company. The guardrails must not get worse.

**Pick the offline metric from the decision**

The job contacts a fixed share of users, so the metric is the precision of that share. AUC ranks every pair of users, most of which never reach the decision. The rules guide quoted in the lesson puts it first: design the metrics before deciding what the system does.

**Baselines**

An F1 of 0.56 is good against a best alternative of 0.30 and poor against a rule that reaches 0.60. Three baselines are needed: the trivial one, a heuristic such as the idle-days rule the support team used, and the current system. The lift is measured against the strongest one, and a minimum lift is set before the results are seen.

**The other three failures**

- Freshness: weekly scores for a daily process means the team acted on stale numbers.
- Leakage: a feature written after the outcome contained the answer, so the offline score was inflated.
- Decision: a score with no action attached cannot change a business metric.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why is a 30-day churn label slow to evaluate? Expected: the label arrives at the end of the horizon, so the business metric lags the launch by at least that long.
- **Level 2:** Which guardrail would catch a model that saves users at any price? Expected: offer cost per saved user.
- **Level 2:** The heuristic baseline beats the model by a small margin. What ships? Expected: the rule, because it is cheaper to run and explain, unless the model clears the minimum lift.

**Wrong answers, and why they fail**

- "A higher AUC would have fixed adoption." Adoption failed on freshness, action and trust, not on ranking quality.
- "Business metrics are enough; skip the offline one." The business metric arrives weeks later and is noisy; the offline metric gates the launch.
- "Guardrails are a product concern, not a model concern." A model that moves a guardrail the wrong way is rolled back no matter its offline score.

:::

## The signals that a demo has become a product

*Level 1 (screening) · concept · about 6 minutes*

You built a small web demo of a model for reviewers. Three months later a colleague asks whether it is "production". How do you tell, and what changes when the answer is yes?

:::answer Show the answer
:::say Short answer
A demo serves known people in short sessions from one process. It has become a product when people outside the team use it every week, when someone asks for an uptime target or reports an outage, when users want to sign in or see history, when the weekly model cost is a budget line, or when the input is covered by a contract or a law. At that point the demo moves onto the production stack with authentication, fallback models, tracing, and cost tracking per user.
:::

**Full answer**

**The five signals**

- People outside your team use it every week.
- Someone asks for an uptime target, or reports an outage.
- Users ask to sign in, save results, or see their history.
- The weekly model cost is a line in a budget.
- The input includes data that a contract or a law covers.

**What changes**

| Property | Demo | Product |
|---|---|---|
| Users | Known people, short sessions | Unknown people, daily use |
| State | None | Accounts, history, saved results |
| Availability | Best effort, one process | A written target, replicas, an on-call owner |
| Cost control | One daily usage cap | Per-user quotas and billing |
| Observability | One log record per request | Traces, metrics, and alerts |

**What the demo already had**

A good demo already had the small versions of these controls: an input limit, a per-client rate limit, a daily cap, and a log that keeps the input length and not the text. The product stack adds real authentication at the gateway, a fallback model chain for provider failures, traces across the components, and cost accounting per request and per user. The input limit and the log privacy carry over unchanged.

**Why the question matters**

The dangerous state is the middle: a demo with product traffic and demo controls. One daily cap does not stop one tenant from using the whole budget, and one process has no replica to take over when it dies.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which single signal is the strongest? Expected: an outage report, because it means someone depends on the demo and expects availability.
- **Level 2:** The weekly model cost appears in a budget. What control replaces the daily cap? Expected: per-user quotas and billing, so the total is attributed and limited per tenant.
- **Level 2:** Regulated data starts arriving in the input. What must the log do? Expected: keep no input text and no client address, with a retention period and access control on the records.

**Wrong answers, and why they fail**

- "It is production when it runs on a server instead of a laptop." Where it runs does not decide; who depends on it does.
- "Add a disclaimer that it is a demo." A disclaimer does not stop traffic, cost or outages.
- "Keep the demo and build the product separately later." The signals mean the demo already carries product risk now.

:::

## When to say no to a model

*Level 1 (screening) · concept · about 8 minutes*

A product owner asks your team for "a model" to decide which support tickets get escalated. Before you design anything, what questions decide whether this should be a learned model at all, and what would make you answer with a rule instead?

:::answer Show the answer
:::say Short answer
I ask whether a short rule already reaches the goal, whether labels exist or can be collected, whether anyone will act on the prediction, whether the data at decision time holds the signal, and whether one error is acceptable. A model loses when a few conditions stay correct and explain themselves, when there are no labels, or when the cost of building and running the system exceeds the value of the better decisions. A model wins when the rule has grown long and fragile, because a learned model is easier to update than a complex heuristic.
:::

**Full answer**

**The cases against a model**

| Condition | Why a rule wins |
|---|---|
| The logic fits in a few conditions and stays correct | Cheaper to run, test and explain |
| No labels and no practical way to collect them | Nothing to learn from |
| Nobody acts on the prediction | A better score changes nothing |
| The decision-time data does not contain the signal | The model cannot see what matters |
| One error is unacceptable and no person checks the output | A probabilistic system will be wrong sometimes |
| The system costs more than the better decisions are worth | Negative return |
| The problem changes faster than retraining | The model is always stale |

A lookup table or a threshold that covers 99% of cases is the right system, and adding a model raises maintenance cost for little gain.

**The cases for a model**

The rules guide quoted in the design lesson says not to fear launching without machine learning, and also to prefer a model over a complex heuristic. The crossing point is when the rule has many branches, breaks on new cases, and nobody can say why it decides as it does. A learned model is retrained; a long rule is rewritten.

**How I would run the ticket case**

1. Ask what the escalation decision is, who makes it, and when the features exist.
2. Build the rule the support team already uses, even if it lives in a spreadsheet, and measure it.
3. Set the minimum lift a model must show over that rule before any training.
4. Only then collect labels and train, and compare against the rule with the same metric.

The rule is also the safe default when the model service fails, so it is built first either way.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Where do labels for ticket escalation come from, and what is their delay? Expected: from past escalation decisions or outcomes, which arrive after the ticket closes; the delay sets how fresh the training data can be.
- **Level 2:** The team has no escalation history at all. What do you build first? Expected: the rule, with logging of the decision and its inputs, so labels start to accumulate.
- **Level 2:** A regulator requires that every escalation decision be explainable. What changes? Expected: either keep the rule or restrict the model to interpretable forms such as a small tree or a linear model.

**Wrong answers, and why they fail**

- "A model always beats a rule given enough data." The rule can win when the features carry weak signal, and the lift must be measured, not assumed.
- "Collect data later; ship the model first." Without labels there is nothing to train on and nothing to evaluate against.
- "The heuristic baseline is just a sanity check." It is the real competitor and the safe default for failures.

:::

## A spam classifier from 800 messages and a pretrained body

*Level 2 (working) · tradeoff · about 12 minutes*

You have a small pretrained language model and 800 labeled text messages, half spam and half not. Design the classifier: what you keep, what you replace, which of two training regimes you choose, how you split and evaluate, and when the other regime would win.

:::answer Show the answer
:::say Short answer
Keep the pretrained body and replace the vocabulary head with a linear layer to two classes over a mean-pooled, mask-weighted sequence vector. With 800 examples, train the head only with the body frozen: it is fast, light on memory and rarely overfits, and on this fixture it reaches about 0.9 precision and 0.85 recall after twenty epochs. Full fine-tuning takes about three times longer and lands within a couple of points either way; it starts to pay off at the scale of 80,000 examples or when the domain drifts far from the pretraining text.
:::

**Full answer**

**What to keep and replace**

The body already encodes word identity, position and co-occurrence. Training a fresh classifier from scratch on 800 examples throws that away. The head is the wrong part: it projects to the vocabulary. Replace it with one linear layer from the hidden width to two logits over a pooled vector, and train with cross-entropy against the label.

**Pooling**

A classifier needs one vector per message. Mean pooling weighted by the attention mask is the simplest stable choice across lengths and needs no special token. The alternatives are a leading class token, which the body would have to be pretrained with, and the last non-padding token, which decoder-style classifiers use.

**Two regimes, one loop**

| Regime | Trainable set | Cost | Risk |
|---|---|---|---|
| Head only | The linear head | Fast, almost free in memory | Underfits when the domain is far from pretraining |
| Full fine-tuning | Head and body | About three times longer | Overfits and forgets on small data |

Both run through the same training function; the toggle flips `requires_grad` on the body parameters, so the optimizer sees only the head in the first regime.

**Data and evaluation**

Split 80/20, stratified so the test set keeps the 50/50 balance: 640 train, 160 test. Report precision, recall and F1 for the spam class with the confusion matrix, so the numbers can be read as honest estimates. The fixture is balanced and generated, so real data will be noisier.

**The decision**

On 800 examples and a tiny body, head only is the right call. On 80,000 examples and a bigger body, full fine-tuning starts to win. A middle path unfreezes only the last block, which costs less than full tuning and learns more than the head alone. The contract is the API, not the winner: one training function, one toggle.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the frozen body rarely overfit here? Expected: only the head's few parameters move, so the model cannot memorize 640 examples through the body.
- **Level 2:** Why stratify the split? Expected: so the test set keeps the class balance and precision and recall mean what they say.
- **Level 3:** Precision matters more than recall for this product. What changes in the design? Expected: the decision threshold on the spam logit, chosen on a validation split held out from the 640 training messages to trade recall for precision, so the 160 test messages stay untouched for the final numbers; the training regime stays the same.
- **Level 3:** The messages are in a domain the body never saw. Which regime and why? Expected: full or partial fine-tuning, because the frozen features do not carry the domain and the head alone underfits.

**Wrong answers, and why they fail**

- "Train a small classifier from scratch; the model is tiny anyway." That wastes the pretraining and 800 examples are too few to learn the language from zero.
- "Always fine-tune everything for the best accuracy." On small data full tuning overfits and forgets, for a result within a couple of points of the head alone at three times the cost.
- "Use the last token's hidden state without a mask." Padded sequences then pool a padding position; the mask must select the last real token or weight the mean.

:::

## Batch or online serving for a two-hour freshness limit

*Level 2 (working) · tradeoff · about 12 minutes*

A feed ranking score must be no more than two hours old for 5,000,000 items, and the serving peak is 120 requests per second. Price batch and online serving with the lesson's cost model, pick one, and say what would flip the choice.

:::answer Show the answer
:::say Short answer
With a one-hour batch job and a two-hour staleness limit, the job must run every hour, which the lesson's cost model prices at 24.0 runs per day over 5,000,000 items for $48.50 a day. Two online replicas sized for 120 peak QPS cost $24.00 a day and serve the freshest data. Online wins here; the choice flips when the freshness limit relaxes enough to cut the runs, or when peak traffic grows enough to need many replicas.
:::

**Full answer**

**How each plan is priced**

| Property | Batch | Online |
|---|---|---|
| Freshness | As old as the last run plus the run time | The data of the request |
| Request latency | One key-value read, a few milliseconds | Feature fetch plus model time, 35 ms in the model |
| Cost driver | Entities times runs per day | Replicas sized for peak QPS, minimum of two |
| New entities | No score until the next run | Scored on the first request |
| When it breaks | Old scores stay readable | Requests fail or time out |

Batch must finish inside the staleness limit, so the time between runs is the limit minus the job time. Each run scores every entity whether or not anyone asks. Online pays for idle replicas between peaks, with a floor of two for availability.

**The arithmetic for this workload**

The staleness limit of two hours minus a one-hour job leaves one hour between runs, so 24.0 runs per day. Every run scores all 5,000,000 items. That is why the batch plan costs $48.50 a day while the online plan sits at its two-replica floor of $24.00, since 120 peak QPS fits inside the capacity of two replicas.

**What flips it**

- A longer staleness limit cuts runs and batch cost in proportion; the nightly churn job in the same lesson costs under a dollar.
- A staleness limit shorter than one batch job makes batch infeasible at any price.
- A much higher peak needs more replicas and raises online cost linearly with peak traffic.
- A latency budget below the online path's model time rules online out, and a hybrid serves known items from a store and new items online.

**What the decision is not about**

Freshness and cost decide; model quality does not change between the two plans. The failure modes differ: a broken batch job leaves old but readable scores, while a broken online service fails requests, so the online design needs a default such as the last stored score or the heuristic.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is the online plan at its minimum here? Expected: two replicas is the availability floor, and 120 peak QPS fits inside what two replicas handle, so traffic does not drive the count.
- **Level 2:** The job takes longer than the staleness limit. What does the planner return? Expected: infeasible; no schedule satisfies the limit, so the budgets or the job must change.
- **Level 3:** Design the hybrid. Expected: batch scores known items on the relaxed schedule, online scores new items and requests that need fresh data; price it as the sum of a cheaper batch plan and a small online tier.
- **Level 3:** Which design document check does this feed? Expected: the serving-fit check, which prices the chosen mode against the staleness, latency and cost budgets and fails a mode that misses any of them.

**Wrong answers, and why they fail**

- "Batch is always cheaper." Batch cost scales with runs per day times entities; a tight freshness limit makes it the expensive plan.
- "Online is always fresher, so always better." Fresher costs replicas, and a nightly process cannot use freshness it does not read.
- "Pick by model accuracy." Accuracy is the same in both plans; the choice is about freshness, latency and cost.

:::

## Design a feature store that keeps training honest

*Level 2 (working) · design · about 15 minutes*

Design the feature layer for a churn model. Training needs the value of each feature for millions of user and time pairs. Serving needs the latest value for one user in a few milliseconds. Name the parts, explain how a training row gets its features, and show with the lesson's numbers what goes wrong without the right join.

:::answer Show the answer
:::say Short answer
One registry holds each feature definition with its entity, window, default, TTL and version, and both paths compute from it. An offline store keeps the full history with event timestamps for training and backfills; a materialization job copies the latest value per entity into an online key-value store with a TTL. A training row takes the latest feature row at or before its label time, inside the TTL. Without that point-in-time join the lesson's demo looks better offline, 0.948 against 0.893, and worse on new data, 0.763 against 0.876, because the newest snapshot leaks the answer.
:::

**Full answer**

**The parts**

| Part | Job |
|---|---|
| Registry | One definition per feature: entity, source, transformation, window, default, TTL, owner, version |
| Offline store | Full history with event timestamps, read by training and backfills |
| Point-in-time join | Pairs each label with the latest row at or before the label time, dropped if older than the TTL |
| Materialization | Copies the latest values from offline to online |
| Online store | Latest value per entity, read in milliseconds, refuses rows older than the TTL |
| Skew check | Compares logged serving features with the training path for the same entity and time |

**Two readers, one definition**

Training asks "what was the value for each of millions of entity and time pairs". Serving asks "what is the value for this entity now". Both read the same definition from the registry; no service keeps a private copy of the transformation. A change creates a new version, and old models pin the version they trained on.

**The join**

1. Find the feature rows of the same entity.
2. Keep rows whose event timestamp is at or before the label time.
3. Take the latest of those.
4. Drop it if the label time minus its event time exceeds the TTL.

A naive join on the entity alone returns the newest row for every label. For a churn label, the newest snapshot already counts the quiet days after the label day, so the feature contains the answer. The demo fits a rule on both training sets and tests on later labels: the naive join scores 0.948 offline and 0.763 on new data, the point-in-time join scores 0.893 offline and 0.876 on new data, and the leaked feature moved the threshold from 19 to 53 idle days.

**TTL and defaults**

With a TTL of 10 days, a read five days after the last snapshot returns it, and a read 20 days later returns the defaults because the row is too old. The default lives in the registry so both paths fill a missing value the same way.

**Backfills and created time**

A new feature has no history, so a backfill runs the definition at each past date and reads only events at or before that date. A backfill run today can still read data that arrived late, so a strict join also checks the created timestamp.

**The skew check**

Log a sample of served features and compare each value with the training path for the same entity and time. Report the mismatch rate and the mean absolute difference per feature, and flag a feature above 1 percent mismatch. Three comparisons separate the causes: store read against training join for the whole system, fresh computation against training join for staleness, and a second code path against fresh computation for code differences.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the leaked model look better offline? Expected: the feature contains the outcome, so the offline split rewards it; on new data the information is not there.
- **Level 2:** What does the TTL do in the join, and relative to what time? Expected: it drops a feature row too old for the label; the age is measured from each label time, not from the query time.
- **Level 3:** Two teams compute the same feature in two services. Which skew cause is that, and how does the registry remove it? Expected: two code paths; both services call the registry definition instead of their own copy.
- **Level 3:** Fresher serving features turn out to hurt. Why? Expected: the model trained on weekly snapshots, so values up to six days old are what it learned; staleness skew runs both ways.

**Wrong answers, and why they fail**

- "Join labels to the feature table on the user id." That returns the newest value and copies the outcome into the input.
- "Fresher features are always better at serving time." The model learned the freshness of its training data; a different age is skew.
- "Snapshots every day remove the problem." Daily snapshots reduce staleness but the join still needs the as-of rule and the TTL.

:::

## Design monitoring for a payment risk model

*Level 2 (working) · design · about 15 minutes*

A payment risk model scores every transaction. Labels arrive weeks later as chargebacks. Design the monitoring: what you watch, how you compare windows, which statistics you compute, and how you keep the alert rate low enough that people read the alerts.

:::answer Show the answer
:::say Short answer
Monitor four layers: system health, input distributions, prediction distributions, and outcomes once labels arrive. Compare a fixed reference window with sliding current windows, with the Population Stability Index and the two-sample KS statistic for numeric features and a chi-square test with Cramér's V for categorical ones. Alert only when a corrected p-value and an effect size both pass and the condition persists for consecutive windows, and send warnings to a dashboard rather than to a person.
:::

**Full answer**

**Four layers**

| Layer | Signals | Available | Question |
|---|---|---|---|
| System health | p50 and p99 latency, error rate, throughput | At once | Does the service answer? |
| Inputs | Feature distributions, missing rates, schema, new categories | At once | Does live data look like training data? |
| Predictions | Score distribution, positive rate, share of default answers | At once | Does the model behave as before? |
| Outcomes | Accuracy, precision, calibration, business metric | After the label delay | Is the model still right? |

Only the last layer measures correctness and it arrives late, so the first three are the early warning.

**Windows**

The reference is the training data or a hand-checked production period, fixed until retraining. The current window is the last N events or the last T hours, sliding by a step smaller than its size. A small window reacts quickly and scores noise as drift; a large window is stable but late. Seasonality breaks naive windows, so the reference covers a full cycle or each window is compared with the same period of an earlier cycle. The lesson's demo uses windows of 500 events that move by 250, with labels 500 events late.

**Statistics**

- PSI over ten reference-decile bins, with shares clipped to a small value so no bin is empty; conventional bands read below 0.1 as stable and above 0.25 as a significant shift, with the caveat that PSI grows with bins and shrinks with sample size.
- KS statistic D as the effect size for numeric features, with its p-value from the effective sample size; with large samples the p-value alone flags gaps nobody cares about.
- Chi-square with Cramér's V for categorical features, which also reacts to a category that appears only in the current window. With few events in a cell the p-value is not reliable, so pool rare categories into one bin before the test.

**Alert policy**

With 50 features checked every hour at an alpha of 0.05, about 60 false alarms a day arrive when nothing changed. Four rules keep the rate useful: correct for multiple tests, so a family alpha of 0.01 over two tests gives 0.005 each; require an effect size; require persistence over consecutive drift windows, two in the demo; and separate dashboard warnings from alerts to a person.

**What retraining does**

Covariate drift with stable accuracy often needs no action. Covariate drift into regions with little data calls for retraining on recent data. Prior drift calls for recalibration or a new threshold. Concept drift needs new labels first, because retraining on old labels teaches the old concept again.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why fix the reference window instead of sliding it too? Expected: a sliding reference follows the drift and hides it; the reference changes only at retraining.
- **Level 2:** A clean window shows a tiny chi-square p-value. Why is it a warning and not an alert? Expected: the effect size is below threshold, so the policy logs a warning; the p-value alone is not enough.
- **Level 3:** Labels arrive 500 events late. How does the outcome monitor handle that? Expected: it joins labels as they arrive and computes metrics on the labeled part, always looking that far into the past.
- **Level 3:** Which drift stays invisible to this whole design except the last layer? Expected: concept drift, where the inputs do not change and only outcomes reveal the new relation.

**Wrong answers, and why they fail**

- "Alert on any p-value below 0.05." With many features and hourly checks that is dozens of false alarms a day and people stop reading.
- "Watch accuracy; it is the only metric that matters." Accuracy arrives after the label delay; input and prediction monitors give the early warning.
- "Retrain on a schedule and skip monitoring." A schedule retrains when nothing changed and waits when something did.

**Related lesson in this course:** [Systems 11: design docs, writing a design so it can be challenged](#systems-11)

:::

## Design the churn system, not the churn model

*Level 2 (working) · design · about 20 minutes*

A subscription company with 2,000,000 users wants to reduce churn. The retention team can send a save offer to a small share of users each night. Design the system end to end: the prediction, the decision, the serving mode, the baselines, the rollout, and the failure defaults. State the load and the budgets you assume.

:::answer Show the answer
:::say Short answer
The task is binary classification: the probability that a user cancels in the next 30 days, so that the nightly job can pick the top 5 percent for an offer. Nightly scores for every user fit batch inference; the lesson's cost model prices one run a day over the user base at under one dollar, while an online service sized for 40 peak QPS costs $24.00 a day for a freshness nobody needs. The model must beat the idle-days rule by a set lift, ship through shadow and canary stages, and fall back to that rule when anything fails.
:::

**Full answer**

**From the goal to a task**

| Question | Answer |
|---|---|
| What is predicted, for which entity | Cancellation in the next 30 days, per user |
| Which decision uses it | The nightly job sends an offer to the top 5 percent |
| When is it needed, with which data | Each night, from data up to that night |
| How do we know the decision got better | 30-day churn in the treated group versus a random holdout |

**Load and budgets**

Entities: 2,000,000 users. Requests: one score read per user visit. Freshness: a day is fine, because the job runs once a night. Latency budget: one key-value read at request time, a few milliseconds. Cost: the batch plan prices at $0.91 per day for one run over the user base, against $24.00 per day for the minimum two replicas of an online service. A hybrid can score new users online on their first visit, since batch has no score for them until the next run.

**Metrics and baselines**

Offline: precision in the top 5 percent. Online: offer acceptance rate and share of users scored. Business: churn in treated versus holdout. Guardrails: offer cost per saved user, unsubscribe rate. Three baselines: majority class, which scores zero on F1 because it never predicts churn; a one-feature idle-days rule fitted on training data; and the current process. In the lesson's demo the model reaches an F1 of 0.564 against the fitted rule at 0.500, a lift of 0.064 above the minimum of 0.02, so the model earns its place. With weaker features the rule would ship instead.

**Data**

Labels come from the cancellations table, with a 30-day delay. Every feature must exist at the moment of scoring; a cancellation reason written after the fact leaks the label. Hold out the most recent period for the test split.

**Rollout**

Shadow first: score live users, log, never act. Then canary: act for a small share, often 1 to 5 percent, and widen in steps with a rollback switch. Then an A/B test against the holdout for the business metric. Keep the old model deployed and switch traffic by configuration.

**Feedback loop and failures**

Offers keep some users, so next month high-risk users look loyal and the retrained model learns that their features do not predict churn. Keep a random holdout that never gets the offer and log the score and the decision with each row. Failure defaults: a failed nightly job serves the last good scores for a fixed time, then the rule; a missing feature takes its documented default and logs; a sudden move in the score distribution pauses automatic offers and alerts a person.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the majority baseline score zero? Expected: F1 counts positive predictions, and the majority class is "stays", so there are none.
- **Level 2:** The retention team wants hourly freshness. What changes? Expected: more runs per day raise batch cost in proportion, and the online path becomes cheaper at some point; price both with the cost model.
- **Level 3:** How do you keep the model from learning its own interventions? Expected: a random holdout that never receives offers, plus logging of score and decision so training can separate influenced from clean rows.
- **Level 3:** What is the safe default when the model service is down during the nightly run? Expected: serve the last good scores for a fixed window, then fall back to the idle-days rule.

**Wrong answers, and why they fail**

- "Serve it online so scores are always fresh." The decision runs once a night; online replicas cost more for freshness the process cannot use.
- "Use AUC as the offline metric." The decision uses one threshold; precision in the contacted share is the metric that matches it.
- "Retrain monthly on all users." Treated users carry the intervention in their labels; without a holdout the model degrades with each retrain.

:::

## Keep a chat service answering when the provider does not

*Level 2 (working) · design · about 15 minutes*

Design the request path of a chat service that calls a hosted model. Users leave when nothing appears for a few seconds, the provider returns rate limits and server errors at night, and the vector store behind retrieval sometimes times out. Cover what the user sees, how you retry, and what happens when each part fails.

:::answer Show the answer
:::say Short answer
Stream tokens over server-sent events so the first token appears in a few hundred milliseconds even though the full answer takes seconds. Retry provider failures with exponential backoff and jitter, capped at three retries, then fall through an ordered chain of models to a cached answer and finally a short unavailable message. Secondary systems degrade instead of failing the request: no retrieval context when the vector store is down, a direct model call when the cache is down, and a clear message when a guardrail blocks.
:::

**Full answer**

**Streaming**

A response of a few hundred output tokens takes 3-8 seconds to finish. Without streaming the user watches a spinner for all of it. With streaming the first token arrives in 200-500ms, the total time is the same, and the perceived latency drops. Server-sent events are the default: one direction, over plain HTTP, consumed by the browser's event source or any HTTP client. Websockets are for two-way needs such as voice, and long polling is for clients that cannot do either.

**Three layers of failure**

| Layer | Example | Recovery |
|---|---|---|
| Provider | 429 rate limit, 500 server error, timeout | Backoff with jitter, then the fallback chain |
| Model | Malformed JSON, invented function name | Retry once with the error in the prompt |
| Application | Vector store slow, cache down, guardrail exception | Degrade: skip the secondary system |

Backoff starts at one second, doubles on each attempt and adds random jitter so that many clients do not retry in step. Three retries is the cap; after that the request moves to the next model. Every external call has a timeout, with a default around 30s.

**The fallback chain**

Primary model, then a cheaper or more available model, then a smaller one, then a cached response, then the unavailable message. Each step trades quality for availability. The user always gets something, and the log records which step answered so the cost tracker and the quality dashboard can attribute it.

**Degradation table**

- 429: retry with backoff; queue the request and tell the user it is processing.
- 500: retry up to three times, then switch model; transparent to the user.
- Timeout: one retry with a shorter prompt or a smaller model.
- Malformed output: retry with the error attached, else return the raw text.
- Guardrail block: no retry; explain why the request was blocked.
- Vector store down: no retry on the store; answer without retrieval context.
- Cache down: no retry on the cache; call the model directly.

**The user-visible contract**

The dashboard targets are a median under 2s and a p99 under 10s. Streaming moves the first-token time inside the median target even when the full response does not. A streamed response has one trap: the status line is sent before the first token, so a failure after that must be sent as an error event inside the stream.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why add jitter to the backoff? Expected: many clients that fail at once would otherwise retry at the same instants and reproduce the overload.
- **Level 2:** Why is a guardrail block not retried? Expected: the input is the problem; retrying the same input gives the same block and spends a call.
- **Level 3:** The fallback model has a different price. Where does that show up? Expected: in the cost tracker per request and per model, so the dashboard shows the cost of the outage, not only its rate.
- **Level 3:** The stream has started and the model fails. What can the server still do? Expected: send an error event inside the stream, because the HTTP status is already committed.

**Wrong answers, and why they fail**

- "Retry until the provider answers." Unbounded retries pile up during an outage; cap them and fall through the chain.
- "If retrieval is down, fail the request so the answer stays grounded." A secondary system must not take down the primary flow; answer with reduced context and log it.
- "Buffer the whole response and send it at once for simplicity." The user sees nothing for seconds and leaves; the total time is the same either way.

**Related lesson in this course:** [Systems 6: timeouts, retries, backoff and jitter](#systems-6)

:::

## Project the monthly bill of a chat feature

*Level 2 (working) · estimate · about 10 minutes*

A chat feature expects 10,000 daily active users with 5 queries each, about 1,500 input tokens and 400 output tokens per query, at $2.50 per million input tokens and $10.00 per million output tokens. Measured cache metrics give a 35% hit rate. Walk me through the monthly estimate, and say which number you would attack first.

:::answer Show the answer
:::say Short answer
The traffic is 50,000 queries a day, and a 35% cache hit rate leaves 32,500 that reach the model. Over 30 days that is $3,656 of input and $3,900 of output, about $7,556 a month, against $11,625 without the cache, so the cache saves about $4,070. Output tokens cost four times more per token, so after the hit rate the output length is the number to attack, with a maximum output tokens limit and tighter prompts.
:::

**Full answer**

**The sheet**

| Variable | Value |
|---|---|
| Daily active users | 10,000 |
| Queries per user per day | 5 |
| Input tokens per query | 1,500 |
| Output tokens per query | 400 |
| Input price per million | $2.50 |
| Output price per million | $10.00 |
| Cache hit rate | 35% |
| Effective daily queries | 32,500 |

Input: 32,500 queries a day times 1,500 tokens times 30 days, divided by a million, times $2.50 gives $3,656. Output: the same with 400 tokens and $10.00 gives $3,900. The total is $7,556 a month.

**Why the cache matters this much**

The same traffic without caching costs $11,625. A 35% hit rate removes 35% of the model calls, so it removes 35% of the token cost. The cache is an embedding lookup with a similarity threshold and a time to live, so two differently phrased versions of one question return one answer. The hit rate is measured from the cache metrics, not assumed.

**Which number to attack**

- Hit rate first: every point of hit rate is a point off the whole bill.
- Output length second: output tokens are priced four times higher than input, and a maximum output tokens limit per template bounds the worst case.
- Input length third: the system prompt and retrieved context sit in every call; a provider-side cache of the fixed prefix and tighter retrieval cut it.
- Model routing last: a smaller model for simple templates cuts the per-token price, with an eval to prove quality holds.

**Where the estimate goes wrong**

The averages hide a tail. A few users who paste long documents or run scripts can dominate the bill, which is why the production checklist tracks cost per user and per request, and why the cost alerting exercise moves a heavy user to a cheaper model past a daily threshold. The target in the lesson's dashboard is a cost per request under $0.01.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which single metric on the dashboard tells you the estimate holds? Expected: cost per request, which combines token counts and prices and has a target under $0.01.
- **Level 2:** The cache hit rate drops to zero after a prompt template change. Why? Expected: the cache key is the query embedding and the response was generated with the old template; stale entries are invalid or the time to live cleared them.
- **Level 3:** How does prompt caching on the stable prefix change the input line? Expected: the system prompt and fixed instructions are billed at a discount when they repeat, so the effective input price per query falls without changing the token count.
- **Level 3:** What does a per-user daily cap protect that a per-request cost target does not? Expected: the total from one heavy user; many cheap requests still sum to a large bill.

**Wrong answers, and why they fail**

- "Multiply users by a cost per user from a vendor page." The bill comes from tokens per query, queries per user and the hit rate; each is measured.
- "Caching saves money only on exact repeats." A semantic cache matches similar queries by embedding, which is why the hit rate reaches a third of traffic.
- "Input tokens dominate because there are more of them." At these prices and lengths the output line is larger even though there are fewer output tokens.

:::

## Put a model demo behind a public link safely

*Level 2 (working) · design · about 15 minutes*

A reviewer and a customer want to try your model from a link, on a phone, without your notebook. Each model call costs money. Design the demo: the input contract, the order of the checks, the controls for a public link, and what the log is allowed to keep.

:::answer Show the answer
:::say Short answer
Write the contract first: a string of 1 to 500 characters with no control characters, a model call with a known cost, and an output that includes a JSON error with a hint. Run the checks in order of cost, body size, access token, per-client token bucket, input validation, daily cap, and only then the model call. Return a stable error code with a message, a hint and a request id, and log the route, the status, the latency and the input length with a keyed hash of the client, never the text or the address.
:::

**Full answer**

**The contract**

| Part | Question | Answer in the lesson |
|---|---|---|
| Input | What type, size and characters | A string of 1 to 500 characters, no control characters |
| Model call | How long and how much | Known latency and cost per call |
| Output | What the user sees on success and failure | A label and a reply, or a JSON error with a hint |

A notebook has no limit on any part. The demo sets one on each, and the server applies it to every client, because any client can skip the page.

**Checks in order of cost**

1. Read the content length and refuse a body over 4,096 bytes before reading it.
2. Check the access token when one is required.
3. Take one token from the client's bucket; refuse with 429 and a `Retry-After` header when empty.
4. Parse and validate the body: JSON object, text present, inside the limit, no control characters, with 422 for a bad field.
5. Charge the daily cap; refuse with 503 and `Retry-After` when the day's budget is spent.
6. Call the model.

A bad request stops at the first failed check and costs almost nothing. The paid step is last, so only valid requests count against the cap.

**Controls once the link is public**

| Risk | Control |
|---|---|
| One client floods | A token bucket per client: a capacity for bursts, a refill rate for the long run |
| Strangers find the link | An optional access token in the authorization header |
| Total cost grows | A daily usage cap over all clients, counted in windows of 86,400 seconds |
| Large or odd input | Body limit, text limit, control character check |
| Logs keep private input | Records with the input length and a keyed hash of the client |

A rate limit controls each client and not the total; a hundred polite clients can still spend the budget, which is what the cap is for.

**Errors a user can act on**

Every error has the same shape: a stable `code` for clients and tests, a `message` with the numbers the user needs, a `hint` with one action, and a `request_id` that joins a user report to one log record. A stack trace does none of these jobs for a stranger.

**Feedback and streaming**

The page disables the button while a request runs, shows the elapsed time, and shows the time to first token when it arrives, so the user can tell a slow model from a broken page and does not click again. Tokens stream as server-sent events over a POST body, not a GET URL, so the input never lands in an access log.

**What the log keeps**

Route, status, error code, latency and input length, plus a keyed hash of the client address for per-client counts. Never the input text, never the raw path, never the address. The page tells users what is kept.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the daily cap run after validation and not before? Expected: so only valid requests count against the budget; a rejected request should not spend it.
- **Level 2:** Behind a reverse proxy every request has the proxy's address. What breaks? Expected: all users share one bucket; read the client address from a header that only your proxy sets and trust it from nowhere else.
- **Level 3:** Why send the input in a POST body instead of the URL for the event stream? Expected: servers and proxies write URLs into access logs, so a GET would store user text.
- **Level 3:** A framework builds the page for you. Which controls are still your job? Expected: the rate limit, the cost cap and log privacy; the frameworks save work on the form and the streaming, not on the risks of a public link.

**Wrong answers, and why they fail**

- "Validate in the browser with a maximum length attribute." The browser helps honest users only; the server repeats every check.
- "A rate limit per client is enough to control cost." It bounds each client, not the sum; the daily cap bounds the total.
- "Log the full request so you can debug reports." The log then holds user text and addresses; a request id joins a report to a record without either.

**Related lesson in this course:** [Deep dive 21: three projects to build and put on your portfolio](#aideep-21)

:::

## Roll out a new prompt without betting the product on it

*Level 2 (working) · design · about 12 minutes*

A new version of a chat prompt looks better in a notebook. Design how it reaches users: the stages, how users are assigned, what you measure at each stage, and when it rolls back automatically.

:::answer Show the answer
:::say Short answer
Run it in shadow first, on all traffic, logging its answers without showing them, and compare quality metrics with the current prompt. Then route a small share of users to it, 10% in the lesson, and widen in steps to 25%, 50% and 100% while the metrics hold. Assign by a deterministic hash of the user id so each user sees one version, and roll back automatically when the new version's error rate reaches twice the old one over a window of requests.
:::

**Full answer**

**Shadow mode**

The new prompt runs on 100% of traffic but only its logs are kept. Nobody sees its output. This gives a full comparison of latency, cost per request, guardrail block rate and quality scores against the current version, and users never see a shadow answer. Shadow calls can share the provider quota with live calls, so give them a separate quota or key; otherwise a quota limit can slow or fail live requests. It is the same first stage that the ML design lesson calls shadow deployment for a model.

**Percentage rollout**

Route 10% of traffic to the new version. If quality holds, raise it to 25%, then 50%, then 100%. If quality drops, switch back at once. Both versions stay deployed and the switch is configuration, so a rollback takes minutes, which is the lesson's rule for every stage.

**Deterministic assignment**

Hash the user id combined with the name of the experiment and take it modulo 100. Buckets below the traffic share get the variant, the rest get the control. A user then sees the same version across requests inside one experiment, and the assignment can be recomputed later from the log. Random assignment per request mixes versions inside one conversation and makes the comparison noisy.

**What to measure**

Per prompt version: latency percentiles, user ratings where they exist, error rate, guardrail block rate and cost per request. The eval logger records the template name and version with every request, so the metrics split by version without extra plumbing.

**Automatic rollback**

The lesson's exercise sets the rule: when a new version shows 2x the error rate of the previous version over 100 requests, revert automatically. The window matters; a handful of requests is noise, and waiting for thousands lets a bad prompt run too long.

**A note on the business metric**

Shadow and canary protect the user. Whether the new prompt improves the outcome that matters, such as task completion, needs a randomized split with enough traffic and time, which is the A/B stage from the ML design lesson.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why hash the user id and not pick randomly per request? Expected: a user then gets one consistent version across a session and the assignment is reproducible from the log.
- **Level 2:** What does shadow mode not tell you? Expected: how users react to the new answers; it only compares logged outputs and system metrics.
- **Level 3:** The new prompt costs more per request but scores higher. Who decides? Expected: a guardrail on cost per request decides whether it can ship at all; the quality gain against the cost is then a product decision with both numbers on the table.
- **Level 3:** How do you keep the control and the variant from sharing a cache entry? Expected: include the prompt version in the cache key, otherwise a hit returns the other version's answer and the comparison is corrupted.

**Wrong answers, and why they fail**

- "Ship to everyone and watch the dashboard." A regression then hits every user before the dashboard moves.
- "Assign per request at random for a cleaner statistic." Users see both versions in one conversation and the logged metrics mix them.
- "Shadow mode is enough; skip the canary." Shadow mode never shows the output to a user, so it cannot measure user reaction.

**Related lesson in this course:** [Deep dive 13: production agent systems](#aideep-13)

:::
