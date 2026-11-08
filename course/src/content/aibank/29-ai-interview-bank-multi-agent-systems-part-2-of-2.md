---
track: aibank
title: "AI interview bank: Multi-agent systems (part 2 of 2)"
short: Multi-agent systems 2
sub: 8 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A worker died mid-run, and the user paid for the run

*Level 3 (senior) · design · about 15 minutes*

Your multi-agent prototype runs in one process with an in-memory event loop. In production, runs last hours while they wait for human input, worker processes crash and lose everything, peak load is ten times the average, and users are charged per run so a retried side effect is a double charge. Design the layer that goes under the agents, and say what you would build first.

:::answer Show the answer
:::say Short answer
Put a durable execution layer under the agents: persist the full run state after each step under a run id, so that when a worker crashes its lease expires and any other worker resumes from the last checkpoint. That needs serializable state, a deterministic resume, and idempotent side effects. For the charge, use a deduplication key per run and an outbox so that side effects are written as intent first and executed once, use asynchronous I/O for the model calls, and deploy new versions beside old ones so that in-flight runs are never killed. Build the simplest version first, a web service with a relational database, and adopt a workflow engine when a measured problem demands it.
:::

**Full answer**

**The resume path**

```text
worker crashes mid-step
  -> lease times out
  -> another worker picks up the run id
  -> resumes from the last checkpoint
  -> no duplicate side effect
```

Three requirements make this work:

1. **Serializable state.** Everything the agent holds must be persistable. A closure with a live database connection does not survive a crash.
2. **Deterministic resume.** Given the same state and the same inputs, the agent takes the same actions, or defers to a recorded result for the model calls.
3. **Idempotent side effects.** Every external call carries a key, or writes to a table first and is executed by a separate process.

Graph runtimes write a checkpoint after each step under a thread id. Workflow engines write after each activity. Event-sourced runtimes keep a journal. The pattern is the same.

**The waiting run**

A run that waits hours for a human must not hold a worker. The runtime persists the run, releases the worker, and any worker resumes when the input arrives. That is what makes the checkpoint the unit of the system rather than the process.

**Exactly once, effectively**

At-least-once delivery plus an idempotent consumer is the only kind of exactly-once you get.

| Move | What it does |
|---|---|
| Deduplication key per run | Included in every side-effect call so a retry is recognized |
| Outbox | Intent is written to a table, and a separate executor performs it and marks it done |
| Compensating transaction | When the effect succeeded and the tracking write failed, schedule the reverse |

These are database patterns. The only agent-specific tax is that model calls are slow.

**Concurrency**

Model calls are I/O bound, and a thread waiting for the next token is idle 99 percent of the time. At 10,000 concurrent calls, threads of about 1 MB each need about 10 GB for stacks alone, while cooperative fibers fit in one process. Use asynchronous I/O for the model layer and threads or processes only for CPU-bound work such as embedding.

**Deploys**

Long-running stateful agents cannot be hot-swapped. Run several versions of the runtime at once, send a slice of new runs to the new version, and retire the old version when its runs finish.

**What to build first**

The lesson's counterpoint is that most teams over-engineer before they measure. A web service and a relational database, with each run as a row, optimistic concurrency on the state, a simple background worker and application-level retries, carries loads under about 100 concurrent runs on manageable tasks. Adopt a durable-execution engine when you hit a concrete problem the simple design cannot solve: hour-long waits at scale, cross-region coordination, or complex compensation policies.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the model call the hard part of deterministic resume? Expected: it is not deterministic, so the resume must replay the recorded result of the call rather than make it again.
- **Level 3:** What does the lease do? Expected: it marks a run as owned by one worker for a bounded time, so a crash frees the run for another worker without two workers running it at once.
- **Level 4:** How do you test the outbox? Expected: run the same side effect twice through the executor and assert one external call, then crash the executor between the effect and the mark and assert that the compensation or the idempotent redo leaves one effect.
- **Level 4:** Which feature of a workflow engine is hardest to replicate by hand, and is that a reason to adopt it? Expected: a reasoned pick such as durable timers for hour-long waits or compensation policies, with the rule that adoption follows a measured failure of the simple design.

**Wrong answers, and why they fail**

- "Retry the whole run from the start when a worker dies." That repeats every side effect that already happened, which is the double charge in the prompt.
- "Use a thread per run; it is simpler." Threads idle while they wait for tokens, and at ten thousand concurrent calls the stacks alone exhaust memory.
- "Adopt a workflow engine on day one to be safe." The simple design carries about a hundred concurrent runs, and the engine's ceremony costs time until a measured problem pays for it.

:::

## Design the verifier that has no write handle

*Level 3 (senior) · design · about 12 minutes*

You are adding a checking agent to a team that shares a memory. A colleague wants the checker to fix wrong entries directly, because that is the simplest design. Specify the checker: what it reads, what it may write, where its results go, and what it can and cannot protect against. Defend the restrictions.

:::answer Show the answer
:::say Short answer
The checker reads the shared memory like every other agent, re-fetches the sources that entries cite, and compares. It has no write handle to the shared memory, only to a separate verification channel that a human or a decision agent reads. It cannot stop a bad entry from being written, and it can be fooled by an entry that cites no source, but its verdicts can never become a shared fact. A checker that writes into the memory is poisoned by the same memory it checks, and then its verdicts carry the poison further.
:::

**Full answer**

**The specification**

| Aspect | Rule |
|---|---|
| Reads | The whole pool, or the topics it is subscribed to on a blackboard |
| Writes | Nothing in the shared memory, only entries on its own verification channel |
| Method | For each entry with a cited source, fetch the source independently and compare the content |
| Output | A finding per mismatch with the entry id and the reason, routed to a human or a separate decision agent |
| Effect | The verifier writes nothing to the pool. The caller can attach the finding to the entry as a flag, as the lesson's demo does, but the entry's content does not change, and a correction is a new entry that supersedes it |

In the lesson's code the verifier returns a list of findings and never touches the pool. The caller decides what to do with them.

**Why no write handle**

Shared memory is the only stateful part of the system, and it is where poisoning happens. A verifier that writes becomes one more writer that can be wrong. Worse, it reads the pool it writes to, so a poisoned pool shapes the verifier's view, and the verifier's conclusions re-enter the pool as new facts with the authority of a check behind them. Separation breaks that cycle. The verifier can be fooled by a bad entry, but its mistakes stay on its channel.

**Why not fix entries in place**

An in-place fix destroys the audit trail. The lesson's rule is append-only: a correction is a new entry that references the one it supersedes. With the verifier's finding attached, the record shows that a value was written, that a check disagreed, and what the check found. A reader three steps later can see the dispute. An overwritten entry shows nothing.

**What it protects against, and what it does not**

It catches an entry that cites a source and does not match it, which is the poisoning case. It does not catch an entry with no citation, an entry whose source is itself wrong, or a wrong conclusion drawn correctly from flagged inputs. For those you need provenance so that uncited claims are weighed lower, a diversity of sources, and a decision agent that reads the findings.

**How it fits the rest**

Provenance on every write gives the verifier something to check. The append-only log gives its findings a place to attach. The verification channel gives its output a reader that is not the pool. The three mitigations are one design.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The verifier flags an entry that the analyst already used. What happens to the analyst's entry? Expected: it stays in the log, a new entry can supersede it with the finding as the reason, and the final report carries the retraction.
- **Level 3:** How many verifiers do you deploy? Expected: at least one, and more if the pool is partitioned by topic, with each verifier subscribed to the topics it can check.
- **Level 4:** How do you keep the verifier's source access independent? Expected: it fetches from the original location with its own tools, not from a cache that a writer filled, otherwise it checks the entry against a copy of itself.
- **Level 4:** What metric tells you the verifier is doing useful work? Expected: the share of writes that are supersessions and the share of flagged entries, read together, with a rising flag rate as an early sign of a writer that hallucinates.

**Wrong answers, and why they fail**

- "Let the checker fix the entry, since it has the source." The fix overwrites the audit trail and gives the checker a write path that a poisoned pool can turn against it.
- "A second reviewer agent that reads the pool is enough." A reviewer that only reads the pool compares entries with each other and inherits the same poisoned facts; the verifier must re-fetch the source.
- "Route the verifier's findings into the pool so every agent sees them." The findings then become shared facts, and a wrong finding poisons the pool in a new way; the finding on the verification channel, keyed by entry id, is the visible signal, not a new entry in the pool.

:::

## Read the vote aggregators and find the blind spot

*Level 3 (senior) · code-reading · about 12 minutes*

Read the clustering and the plurality aggregator from the consensus lesson. Five agents vote on a percentage from a study. Three agents that share a base model answer `42%`, and two agents answer `4.2%`. Each of the two is more confident than any of the three, but the three still carry more confidence in total. Say what the plurality returns, what the aggregator that weighs each vote by its confidence returns, and what the canonicalization does with the answer `4.2 percent`.

```python
@dataclass
class Vote:
    agent: str
    answer: str
    confidence: float

    def canonical(self) -> str:
        return "".join(c for c in self.answer.lower().strip() if c.isalnum() or c == "." or c == "%")


def plurality(votes: list[Vote]) -> tuple[str, dict[str, int]]:
    counts: dict[str, int] = {}
    rep: dict[str, str] = {}
    for v in votes:
        key = v.canonical()
        counts[key] = counts.get(key, 0) + 1
        rep.setdefault(key, v.answer)
    winner_key = max(counts, key=counts.get)
    return rep[winner_key], counts
```

:::answer Show the answer
:::say Short answer
Plurality counts three votes for `42%` and two for `4.2%` and returns the wrong answer, because it counts heads and the wrong cluster has more heads. The confidence-weighted aggregator sums confidence per cluster and compares the top cluster's share with a threshold. The wrong cluster has the larger sum, so with a threshold of 0.5 it also returns `42%`, and with a higher threshold it can return no winner. The canonicalization keeps letters, digits, dots and percent signs, so `4.2 percent` becomes `4.2percent` and lands in a different cluster from `4.2%`, which splits the right answer's votes.
:::

**Full answer**

**What the code does**

`canonical` lowercases the answer, strips the ends, and keeps alphanumerics, the dot and the percent sign. It is the lesson's rough semantic clustering. `plurality` builds a count per canonical key, keeps the first original answer per key as its representative, and returns the key with the most votes.

**The monoculture case**

| Aggregator | Rule | Result here |
|---|---|---|
| Plurality | Most votes | Wrong, because three correlated votes beat two |
| Confidence-weighted | Sum of confidence per cluster, top cluster must pass a threshold share | Wrong, because the three votes carry more total confidence, or none when the share is under the threshold |
| Geometric-median style | Score each cluster by its size and how tight its confidences are | Wrong, because the cluster of three is larger and its confidences are also tight |

The lesson's own takeaway is the limit: no aggregator solves a wrong cluster that is both larger and more confident than the right one. That case needs diversity of models or verification, not a better vote.

**The canonicalization blind spot**

Two agents that mean the same value can land in two clusters. `4.2%` and `4.2 percent` differ after canonicalization, and so would `four point two percent`. Every split in the right cluster helps the wrong one. In production, canonicalize numbers with their units into one form, or cluster by embedding similarity, and keep the canonical key next to the original answer in the log so a reviewer can see when a split happened.

**Where the two percentages come from**

The values in the scenario are the memory-poisoning numbers from the shared-memory lesson: a page says 4.2 percent and a retrieval agent writes 42 percent. The consensus lesson reuses them so that the vote is over a claim with a known source, which is also what makes a verifier possible after the vote.

**What the plurality code cannot see**

It has no idea which agents share a base model, no confidence, no source. It returns the answer with the most votes and does not check whether the voters are independent or accurate. Independence makes a right majority more likely but does not guarantee it, and the prompt's three agents share a base model, so their errors are correlated.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does `plurality` keep `rep`? Expected: so that it can return the original answer text for the winning key, since the canonical key is a comparison form and not an answer to show.
- **Level 3:** No cluster reaches the threshold share in the weighted vote. What is the result? Expected: no winner, with the weights, so the caller retries or escalates instead of accepting a weak majority.
- **Level 4:** The sycophancy case: two agents copy the first answer they saw with low confidence. Which aggregator catches it and why? Expected: the confidence-weighted one, because the copiers carry little weight, while plurality counts them as full votes.
- **Level 4:** How would you test a replacement for `canonical`? Expected: a table of answer pairs that must cluster together and pairs that must not, including unit variants and spelled-out numbers, run as a unit test.

**Wrong answers, and why they fail**

- "Plurality is fine as long as there are at least five agents." Three agents on one model are a majority at any size as long as they are over half, and the count never sees the correlation.
- "The canonicalization is good enough because it handles case and spaces." It splits `4.2%` from `4.2 percent`, and every split in the right cluster is a vote for the wrong one.
- "Higher confidence means a more correct answer, so weight by it and you are done." Weighting helps against low-confidence conformity and does nothing when the wrong cluster is also the confident one.

:::

## The legal question came back as finance findings

*Level 3 (senior) · debug · about 12 minutes*

A three-level agent hierarchy reviews a contract. The top manager splits the work into an engineering branch and a legal branch, each with its own sub-manager and workers. The final report is complete and confident, and it contains finance findings where the legal review should be. Nobody asked a finance question. Trace the failure and say what you change in the design.

:::answer Show the answer
:::say Short answer
The top manager mislabeled the legal branch as finance when it decomposed the task. The sub-manager did what it was given, the workers did finance work well, and the top synthesizer reported finance findings. The error surfaced only at the top, one level away from any point where a human could have caught it. The design fixes are a depth cap of two, provenance on every synthesis, a logged decomposition that is checked against the original question, and a canary worker that is always asked the user's question unchanged.
:::

**Full answer**

**Why hierarchy hides this**

A human manager has stable knowledge of what each team does. A model manager re-derives the whole structure every turn from whatever is in its context. A small drift in that context changes the decomposition, and every level below works on the drifted version in good faith. The lesson names three failure modes, and this incident is the first:

| Failure | Mechanism |
|---|---|
| Task assignment error | The manager hallucinates a decomposition and sends work to the wrong branch |
| Output misinterpretation | A sub-manager returns "unable to verify claim X" and the top reports "claim X not confirmed", and meaning drifts at every level |
| Consensus loop | Two sub-managers disagree, the top asks them to reconcile, they re-delegate, workers re-run, and the loop continues until a step limit |

**Trace it**

1. Read the top manager's decomposition log. The branch label is "finance", not "legal".
2. Read the sub-manager's input. It received a finance task and had no way to know it was wrong.
3. Read the synthesis. It cites finance findings. The original legal question appears nowhere.

The side-by-side of what was asked and what was delivered is the whole diagnosis.

**The design changes**

- **Cap the depth at two.** Three levels already hide most errors from observability.
- **Provenance on every synthesis.** Each node's summary cites the leaf outputs that produced it, so a report can be traced to the workers who wrote it.
- **Alert on decomposition drift.** Log the manager's decomposition at each step and compare it with the user's question. When the decomposition no longer covers the question, fire an alert before the workers start.
- **A canary worker per sub-manager.** One worker is always asked the original question unchanged. When the canary's answer disagrees with the synthesized answer, the manager stops and escalates instead of merging.
- **An explicit reconciliation budget.** Set the rounds before the top must commit, usually two.

**The deciding question**

Before you keep the hierarchy, ask whether the task has independent sub-teams or is a linear flow that looks like a tree. A contract review with legal and engineering branches is a real tree. A task where step two needs step one is a pipeline, and sequential beats hierarchical there.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How many levels did the error travel before the output diverged from the question? Expected: one, because the mislabel happened at the top and every level below executed it faithfully, which is why the depth cap is two.
- **Level 3:** The canary's answer and the merged answer differ. What does the manager do? Expected: stop, record both answers with provenance, and escalate to a human or re-decompose, never merge the two.
- **Level 4:** How do you detect meaning drift between levels? Expected: compare each node's summary with the leaf outputs it cites, and flag a summary that changes the modality of a claim, such as unverified becoming false.
- **Level 4:** The reconciliation loop keeps hitting its step limit. What does that tell you? Expected: the limit is now a hyperparameter that hides a disagreement, so either the decomposition is wrong or the question has no single answer, and the top must report the disagreement.

**Wrong answers, and why they fail**

- "Add a fourth level to check the third." More levels hide more errors from observability, and the fix is fewer levels with provenance.
- "Tell the sub-manager to double-check the task it receives." The sub-manager had no access to the original question, and a canary worker is the mechanism that gives it one.
- "Use a bigger model for the top manager." A bigger manager still re-derives the structure each turn from its context, and the mislabel is a context drift, not a capability gap.

:::

## Two workers returned different facts, the report shows one

*Level 3 (senior) · debug · about 12 minutes*

In a lead-and-workers research system, two workers answered overlapping sub-questions with numbers that contradict each other. The final report contains one of the numbers and no mention of the other. The user found the second number in a source and asks why the report hid it. Where did the system fail, and what do you change?

:::answer Show the answer
:::say Short answer
The lead resolved a synthesis conflict by picking one side in silence, which the lesson calls the worst failure in this pattern, because the user never learns that a disagreement happened. Two upstream causes made it likely: the decomposition gave two workers the same ground, and no worker had a scope that stopped it from drifting into the other's territory. The fix is a lead that detects contradiction between worker outputs and either re-asks with a narrower question or writes the disagreement into the answer, plus provenance on every synthesized claim.
:::

**Full answer**

**Three failure modes in the pattern**

| Failure | What happened here |
|---|---|
| The lead hallucinates the plan | Sub-questions overlapped, so two workers researched the same fact |
| Workers over-explore | A worker without a scope boundary drifted past its question into another's |
| Synthesis conflict | Two contradictory facts arrived, and the lead picked one without a note |

The third is the one the user saw. The first two made it happen.

**Detect the conflict without a model**

The lesson asks how to detect contradiction without a model call. Canonicalize the claims: extract each number with its unit and the entity it describes, key it by sub-question, and compare. Two different values under one key is a conflict. For non-numeric claims, flag a key only when the two workers state different claims. Different cited sources alone are not a conflict. Let the lead handle a flagged key.

**What the lead does with a conflict**

1. **Re-ask.** Spawn a worker on a tighter question aimed at the disagreement, which adds a round.
2. **Surface it.** Write both values into the answer with their sources and say that they disagree.
3. **Never pick in silence.** A chosen value with no note is the failure in the prompt.

**Prevent the overlap**

Decompose broad first and narrow later, and give each worker an explicit scope in its prompt: the sub-question, what is out of scope, and the sources to prefer. Add a worker timeout at about twice the median runtime and a token cap per worker, so that a worker that wanders is cut and the lead re-spawns with a narrower question or proceeds without it.

**Provenance on the synthesis**

Each claim in the final answer carries the worker and the source it came from. That makes the hidden second number impossible, because a claim with two sources shows two values, and it makes the post-mortem a read of the trace instead of a guess.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a silent pick worse than a wrong pick with a note? Expected: a noted disagreement lets the reader check the sources, while a silent pick presents an unresolved fact as settled.
- **Level 3:** The re-ask adds a round and the latency target is tight. What do you do? Expected: surface the disagreement in the answer instead of re-asking, and record the key for a later run.
- **Level 4:** How do you test the conflict detector? Expected: feed it worker outputs with a planted contradiction on one key and matching values on others, and assert that exactly that key is flagged.
- **Level 4:** The two workers agree and are both wrong. What catches that? Expected: nothing in the lead, because agreement is not correctness, so an independent verifier with its own source access has to check the claim.

**Wrong answers, and why they fail**

- "Add a rule to the lead's prompt that says be careful with numbers." The lead did not know a conflict existed, and a prompt does not compare worker outputs.
- "Trust the worker with the higher confidence." Confidence is not correctness, and the user still never learns that a disagreement happened.
- "Run three workers per sub-question and take the majority." A majority can be wrong together, it triples the cost, and the overlap that caused the conflict stays in the plan.

:::

## Design a lead-and-workers research system for production

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. Design a research system in which one lead agent plans and several workers search in parallel, for a product where users ask open questions and expect a cited answer. Deliver a design document with the lead and worker prompts in outline, the shared memory, the failure modes you expect and the mitigation for each, the operational limits, and the cost model. Say what you would cut if the budget were halved.

:::answer Show the answer
:::say Short answer
The lead decomposes the question into sub-questions, scales the number of workers to the question's complexity, and synthesizes the worker summaries without reading raw sources. Each worker has a fresh context, an explicit scope, a timeout at about twice the median runtime and a token cap. Shared memory carries provenance on every entry, is append-only, and is checked by a read-only verifier that re-fetches sources and reports on its own channel. Every outbound call sits behind a circuit breaker, the system is deployed with versions side by side, and the cost model states up front that the pattern spends about 15 times the tokens of a single agent.
:::

**Full answer**

**The lead**

- Prompt outline: decompose, delegate, synthesize, never research directly.
- Scale effort to the query: a simple question gets one agent and a few tool calls, and a complex one gets more than ten workers. The lead estimates this, not the caller.
- Decompose broad first, then spawn deeper workers where a sub-answer warrants it.
- Synthesis with provenance: every claim in the answer names the worker and the source it came from.
- Conflict handling: when two workers return contradictory facts, re-ask with a narrower question or surface the disagreement, never pick in silence.

**The workers**

- Prompt outline: one sub-question, the sources to prefer, what is out of scope, the output shape.
- Fresh context per worker, so the lead's planning tokens never enter a worker's window.
- A timeout at about twice the median worker runtime, after which the lead re-spawns with a narrower scope or proceeds without the result.
- A hard token cap per worker, on the order of ten times the expected synthesis input, so one runaway worker cannot spend the budget.

**Shared memory**

- Every entry carries the writer, the timestamp, the prompt hash and the source it cites.
- The log is append-only; a correction supersedes and references the entry it replaces.
- A read-only verifier re-fetches cited sources, flags mismatches, and writes only to a verification channel that the lead and a human read.
- Monitor the share of writes that are supersessions as an early sign of a hallucinating writer.

**Failure modes and mitigations**

| Expected failure | Mitigation |
|---|---|
| The lead decomposes the wrong question | Log the decomposition and compare it with the user's question before workers start |
| Workers over-explore | Explicit scope, timeout and token cap |
| Two workers disagree | Detect by canonicalized claims per sub-question; re-ask or surface |
| Memory poisoning | Provenance, append-only, read-only verifier |
| Retry storm against a search or fetch service | Circuit breakers that open at 5 to 10 percent error rate and capped retry budgets |
| Silent wrong answer | A golden set of questions with known answers, run weekly, and sampled human review |

**Operations**

- Trace the lead's plan, each worker's tool calls and the synthesis, so that a wrong answer can be traced to a worker and a source.
- Deploy new versions beside old ones and let long-running questions finish on the version they started on.
- Run the failure-mode audit each quarter on a sample of about 1000 traces and rank mitigations by failures removed.

**Cost model**

State the measured multiplier: the pattern costs about 15 times the tokens of a single agent, and about 80 percent of the quality variance on a browsing benchmark is explained by token usage. Report tokens and wall-clock beside answer quality for every question class.

**With half the budget**

Keep the lead's scaling rule and raise the complexity that a question must reach before the lead adds workers, so that more questions go to one agent. Keep provenance and the verifier, because they are cheap and they protect the cited answer. Cut worker count per question before you cut the verifier, and cut debate rounds entirely.

**What we grade**

The outlined prompts, the memory schema with provenance fields, the failure table with one mitigation per row, the three operational limits with the reason for each number, and a cost section that shows the multiplier rather than hiding it.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the lead never read raw sources, even to check a worker? Expected: its window is for planning and synthesis, and the check belongs to the verifier, which re-fetches the source without writing to the pool.
- **Level 3:** A worker returns a summary with no source. What does the design do with it? Expected: provenance marks the entry as uncited, the lead weighs it lower, and the verifier cannot check it, so the answer either omits it or labels it.
- **Level 4:** Which one component would you keep if you could keep only one beyond the lead and the workers? Expected: the read-only verifier with provenance, because a cited answer that is wrong is the failure the product cannot survive.
- **Level 4:** How do you know the system is still working next quarter? Expected: the golden set run weekly, the supersession and flag rates, the agreement rate across parallel workers, and the quarterly audit.

**Wrong answers, and why they fail**

- "Give every worker the full conversation so it has context." That spends the fresh-context advantage and copies the lead's planning into every window.
- "Let the lead resolve conflicts by picking the better-written answer." A silent pick hides the disagreement from the user, and the design must re-ask or surface it.
- "Skip the verifier, because the lead already reads the worker summaries." The lead compares summaries with each other, not with the sources, and shared summaries can share a hallucination.

:::

## Design the quarterly failure audit for an agent team

*Level 4 (staff) · design · about 15 minutes*

A multi-agent product has been in production for two quarters. Failures arrive as a stream of unrelated tickets and nothing gets fixed systematically. Design the audit that turns the stream into a ranked list of fixes, and say which failure class you would weight most heavily even if it is not the most frequent.

:::answer Show the answer
:::say Short answer
Sample about 1000 real execution traces each quarter, categorize every failure into the three root categories of the published taxonomy and the five groupthink patterns, compute the failure rate per category, rank the mitigations by how many failures each would remove, and commit to two or three for the quarter. Weight verification gaps most heavily even though they were the smallest category by count, because they are silent: a plausible wrong output produces no exception, no alert and no ticket until a human notices.
:::

**Full answer**

**The baseline you are measured against**

The reference taxonomy was built from 1642 execution traces across 7 open-source multi-agent systems and found failure rates between 41 percent and 86.7 percent. Three root categories:

| Category | Share | What it looks like |
|---|---|---|
| Specification problems | 41.77 percent | Role ambiguity, an underspecified task, implicit success criteria |
| Coordination failures | 36.94 percent | Unsynchronized writes to shared state, lost messages, state drift |
| Verification gaps | 21.30 percent | One agent claims success and nobody checks, each agent trusts the one before |

Beside them sit the five groupthink patterns: monoculture, conformity, a missing model of each other's beliefs, compromise drift and cascading failures.

**The audit, step by step**

1. **Sample.** Pull about 1000 real traces, stratified by task type, not the ones that produced tickets.
2. **Categorize.** Map each failure to a root category and any groupthink pattern. Two reviewers per trace until the categories are stable.
3. **Compute.** Failure rate per category for your system. The published shares are a prior, not your number.
4. **Rank.** For each candidate mitigation, count the failures it would have removed.
5. **Commit.** Two or three mitigations for the quarter, each with an owner and a re-audit date.

The discipline matters more than the choices. Without the audit, failures blend into noise.

**The mitigation menu**

- Specification: explicit role contracts that say what an agent does and does not do, acceptance tests written before dispatch, a pre-flight check of the task definition.
- Coordination: versioned shared state with optimistic concurrency, acknowledgments for critical messages, periodic state-sync checkpoints.
- Verification: an independent read-only verifier with its own source access, handoff contracts that require a check before the next agent starts, outcome logging.
- Cascades: circuit breakers on every outbound call with a default open threshold at 5 to 10 percent error rate, and capped retry budgets.

**Why verification gaps weigh more**

A loud failure, a crash or a timeout, is cheap to detect. A silent correctness failure cannot be found in exception logs. That is why verification gaps are the most expensive category per failure. Invest in sample-based human review, a small hand-audited golden dataset run weekly, and cross-checks between agents on important outputs.

**Catch slow failures before the audit**

Instrument proxies for drift: the agreement rate across parallel agents, the retry rate, the distribution of output lengths, and the edit distance between successive agent versions. The lesson also describes a trio of specialized agents, detection, diagnosis and validation, that improved mitigation success by 1.5 times; start with detection only and add diagnosis when the symptoms are noisy.

**Make it binding**

Set a failure budget per category, an explicit objective for the rate. When a category exceeds its budget, the next release waits.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why sample traces instead of auditing tickets? Expected: tickets are the loud failures, and the silent ones never produce a ticket, so a stratified sample is the only way to see them.
- **Level 3:** Which single proxy would you instrument first? Expected: agreement rate across parallel agents, because a sharp rise signals conformity and a sharp fall signals drift, and both precede visible errors.
- **Level 4:** The audit finds that specification problems dominate. What is the cheapest fix? Expected: a pre-flight check of the task definition by a separate agent before dispatch, with role contracts that include what each agent does not do.
- **Level 4:** How do you keep the audit from becoming a report nobody acts on? Expected: the failure budget with a stop-shipping rule, owners per mitigation, and the re-audit date on the calendar before the quarter starts.

**Wrong answers, and why they fail**

- "Fix the most frequent category first." Frequency is not cost, and the silent verification gaps cost more per failure than the loud specification problems.
- "Audit once a year, when the system is stable." Categories shift as the system grows, and a year of unranked failures is the stream you started with.
- "Add more agents to check each other." Agents that share a model share their blind spots, and the check that matters is an independent verifier with its own source access.

:::

## Three copies of one model voted, and the majority was wrong

*Level 4 (staff) · concept · about 15 minutes*

Five agents answer the same factual question and vote. Three of them run the same base model and agree on a wrong answer, and the two others are right. Majority vote picks the wrong answer. A colleague says that classical fault-tolerant consensus solves this. Explain why it does not, which assumptions break, and what the recent agent-specific protocols change.

:::answer Show the answer
:::say Short answer
Classical consensus tolerates fewer than a third of nodes behaving arbitrarily, and it assumes that faults are independent, that honest nodes are correct, and that a ground truth exists. Three agents on a shared base model share their faults, an honest model still hallucinates, and on some questions the agents define the truth. The agent-specific variants weigh each vote by a confidence probe, aggregate leaderless proposals by a geometric median, or split agents into a core and an edge with learned trust weights. None of them makes agreement equal correctness, so the consensus output still goes to an independent verifier.
:::

**Full answer**

**What the classical protocol gives and assumes**

The standard protocol reaches agreement on one value among n nodes when fewer than n divided by three are faulty, which needs n at least three f plus one. It runs three phases over signed messages and quorum certificates. Its three assumptions:

1. Faults are independent, so faulty nodes do not coordinate.
2. Honest nodes are correct, so the protocol only aligns disagreement.
3. The question has a ground truth, so agreement on a wrong value is still agreement.

Model agents break all three. Agents on one base model share faults. An honest agent hallucinates. And on an ambiguous question the agents decide what is true.

**Three attacks that pass the signature check**

| Attack | What happens | Does the classical protocol handle it |
|---|---|---|
| A deliberate lie | One agent outputs a wrong answer with high confidence | Yes, while the liars are under a third |
| Sycophantic conformity | One agent reads the others and aligns with whoever spoke last | No, because the agent passes every check |
| Correlated monoculture | Three agents on one model hallucinate the same answer | No, because all three honestly agree |

The prompt's case is the third.

**The agent-specific responses**

- **Confidence-weighted voting.** Each voter attaches a confidence probe, self-reported or from a calibration model, and the vote weight scales with it. The lesson reports a large improvement on fully connected graphs. It helps most against conformity, because an agent that adopted a position it did not derive tends to report low confidence.
- **Leaderless aggregation by geometric median.** Workers propose in parallel, evaluators score the proposals, and the answer is the geometric median of the scored positions. It is robust while the faulty fraction is under a half, and it resists outliers and pulls toward the dense cluster rather than the model-biased mean.
- **Weighted voting with a core and an edge.** Weights come from response quality and a trust score learned from history. A small core reaches agreement first and the edge follows, which bounds latency and lets the core be chosen for diversity.

**The stripped-down round**

Each agent produces an answer and a confidence. The aggregator groups answers into semantic clusters, so that two phrasings of one value count together, sums the confidence per cluster, and accepts the top cluster only when its share passes a threshold. Below the threshold it retries or escalates. The lesson's working range for the threshold is 0.5 to 0.67 with five to seven agents. Minority clusters are logged with provenance, because they are the early warning for correlated errors.

**The uncomfortable measurement**

The lesson cites a study of scalar agreement across frontier models: even with no adversary, agents disagreed on scalar questions at rates above 30 percent on many benchmarks, and a single agent with a deceptive persona pulled the mixture's consensus more than 40 percentage points off the honest baseline. Consensus machinery aligns outputs. It does not tell you whether the aligned output is right.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Does the geometric median rescue this case? Expected: no. The median discounts outliers and moves toward the dense cluster, which helps only while the wrong cluster is under half. Here three of five votes are wrong, so the dense cluster is the wrong one and the median selects it.
- **Level 3:** The three wrong agents are also the most confident. What now? Expected: no aggregator fixes a wrong cluster that is both larger and more confident, so the system needs diversity of base models or an independent verifier.
- **Level 4:** Why bound the rounds at two or three? Expected: agents that observe earlier rounds start to mimic each other regardless of truth, so more rounds reward conformity.
- **Level 4:** What do you monitor in production? Expected: the agreement rate, where a sharp rise means conformity and a sharp fall means model drift, and the minority clusters with their provenance.

**Wrong answers, and why they fail**

- "Use the classical protocol with a two-thirds quorum." Three honest agents that share a hallucination form the quorum, and the protocol agrees on the wrong value.
- "Add more copies of the same model until the majority is right." More copies of one model add more correlated votes, and the wrong cluster grows with them.
- "Consensus means the answer is correct." Agreement and correctness are different measurements, and the consensus output needs a verifier that is independent of the ensemble.

**Related lesson in this course:** [Reasoning: chain of thought, self-consistency and tree of thoughts](#aifield-1)

:::
