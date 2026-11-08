---
track: aibank
title: "AI interview bank: Behavioral (part 2 of 2)"
short: Behavioral 2
sub: 4 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Decide whether to split work across parallel workers

*Level 3 (senior) · tradeoff · about 12 minutes*

Your manager wants a feature finished faster and suggests that you run two coding agents, or two engineers, in parallel on it. Tell me about a time you had to make that call. How did you decide, and what did you put in place before anyone started?

:::answer Show the answer
:::say Short answer
I delegate only when the work is really independent: two investigations that answer different unknowns, two implementations with disjoint files and contracts, a reviewer who only reads, or a slow external check that runs while local work continues. When the parts need the same files, the same open decision or the same mutable environment, I keep them serial, because a parallel split then converts one clear task into a coordination problem. Before anyone starts, each unit gets a goal, an owner, exclusive write paths, dependencies, a proof and a handoff.
:::

**Full answer**

**The parallelism test**

More available workers is not a reason. The split is justified when at least one of these holds:

- two investigations can answer different unknowns on their own;
- two implementations own disjoint files and contracts;
- a reviewer can inspect a finished artifact without changing it;
- a slow external check can run while local work continues.

**A work unit is a contract**

"Handle the backend" is not a unit. "Implement the duplicate check in one named file and prove it with the focused account test" is. Each unit records the goal, one accountable owner, exclusive paths, completed units it waits for, the exact evidence it returns, and a handoff with the files changed, the decisions made and the remaining risk.

**Three layers of isolation**

1. Filesystem: separate worktrees or sandboxes stop accidental shared edits.
2. Ownership: the contract stops two workers from editing the same path on purpose.
3. State: separate logs and outputs stop one worker from overwriting another's evidence.

Filesystem isolation does not solve ownership. Two clean worktrees can still produce two conflicting designs. The merge contract has to settle shared interfaces before work begins.

**What the integrator does**

The integrator confirms each handoff matches its scope, reads the proof output rather than the summary, combines changes in dependency order, runs the full cross-unit gate, rejects hidden scope growth, and records conflicts as new decisions instead of silent edits. If integration means rewriting most of a worker's result, the split was wrong.

**The call I made**

The time this mattered most, the two halves looked independent but both needed the same response type to change. I ran one short unit to fix that contract first, then let the two implementations run in parallel against it. The serial step was shorter than the merge conflict it prevented.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** A docs unit asks to own the whole application directory. What happens? Expected: the plan is blocked, because that parent path overlaps the paths of the implementation unit.
- **Level 3:** A worker's dependency becomes invalid half way through. What is the rule? Expected: a written cancellation rule decided before the start, so the worker stops and returns a handoff instead of building on a dead contract.
- **Level 4:** Where does the human stay in the loop when agents do the work? Expected: on choices that change public behavior, risk, authority or irreversible cost; agents own bounded investigation, implementation, verification and review.
- **Level 4:** How do you know the decomposition was right after the fact? Expected: the integrator combined the handoffs without rewriting them, and the final changed-file set matched the union of the unit contracts.

**Wrong answers, and why they fail**

- "Two agents are always faster than one." Parallel work saves wall time only when the pieces are independent; otherwise it raises the failure rate.
- "Separate worktrees solve the conflicts." They prevent accidental shared edits, not two conflicting designs of one interface.
- "The integrator fixes whatever does not fit." If most of a result must be rewritten at integration, the original split was the mistake.

:::

## Write a specification that leaves judgment where it belongs

*Level 3 (senior) · design · about 12 minutes*

You hand a task to a coding agent, or to a new engineer, to add a read-only diagnosis step to an incident tool. Last time the brief was two sentences and the result guessed the system. The time before, the brief was a twelve-page design and the result transcribed a mistake in it. How do you write this one?

:::answer Show the answer
:::say Short answer
I write an executable contract with six surfaces: the outcome, the invariants that must always hold, concrete examples, non-goals, a decision policy, and the proof required before completion. Every decision is marked locked, bounded or delegated by its consequence and reversibility. The production-write boundary is locked, the time budget for the data source is bounded, and local structure and names are delegated with an explanation required.
:::

**Full answer**

**Two bad extremes**

An underspecified task makes the builder guess the system. An overspecified task makes the builder transcribe a design that may already be wrong. The useful middle fixes invariants and evidence and leaves reversible choices open.

**The six surfaces**

| Surface | Purpose |
|---|---|
| Outcome | The observable result |
| Invariants | Conditions that must always stay true |
| Examples | Concrete cases that show intent |
| Non-goals | Adjacent behavior excluded on purpose |
| Decision policy | Which choices are locked, bounded or delegated |
| Proof | Evidence required before completion |

**Three decision modes**

- Locked: the builder must not choose. Public compatibility, authority, safety, irreversible cost, product commitments.
- Bounded: the builder may choose inside explicit limits. Search budgets, retry counts, allowed dependencies, a known interface family.
- Delegated: the builder owns the choice and explains it. Local structure, names, reversible refactors, implementation detail.

"The implementation may use any read-only source that returns inside the time budget" is not vague. It is a delegated decision with a boundary and a proof.

**Examples compress intent**

"Helpful", "robust" and "production-ready" are not executable. A small set of normal, edge, failure and forbidden cases gives the builder and the verifier the same target. Examples do not replace invariants; one passing case cannot prove a universal safety rule.

**Proof matches the claim**

A unit test proves a local function contract. A wire test proves serialization and transport. A browser journey proves an interface path. A replay set proves behavior over representative cases. An audit log proves that authority boundaries held. I do not accept a lower layer as proof of a higher-layer claim.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Someone moves the production-write decision from locked to delegated. The schema accepts it. Why is it still wrong? Expected: the schema checks shape, not product risk; a write to production is irreversible and changes authority, so it stays locked.
- **Level 3:** A retry count is set to a fixed number in the brief. Is that locked or bounded? Expected: bounded is the better mode; the builder may pick inside a stated range and the range carries the reason.
- **Level 4:** Three implementation instructions describe the same behavior. What do you replace them with? Expected: one invariant and two examples, so the intent survives a change of implementation.
- **Level 4:** Why record the reason behind each locked choice? Expected: so a later team can revise it when the evidence changes, without archaeology through old threads.

**Wrong answers, and why they fail**

- "Specify every step so nothing can go wrong." A step-by-step script transcribes the author's mistakes and removes the judgment that catches them.
- "Give the goal and trust the builder." Without invariants and proof, the builder guesses the system and the result cannot be verified.
- "A passing unit test proves the feature works." A unit test proves a local contract, not an interface path or an authority boundary.

**Related lesson in this course:** [Deep dive 14: design and defend your agent](#aideep-14)

:::

## Decide which choices an agent may make alone

*Level 4 (staff) · tradeoff · about 12 minutes*

Your organization wants to let coding agents merge changes without a human in the loop for a class of tasks. You are asked to write the policy that says which decisions an agent may make on its own. How do you draw that line, and how does it move over time?

:::answer Show the answer
:::say Short answer
The line follows consequence and reversibility, not task difficulty. A human keeps the choices that change public behavior, risk, authority or irreversible cost; an agent owns bounded investigation, implementation, verification and review. I express that as locked, bounded and delegated decisions in each task contract, and I widen the delegated set only where evidence and rollback are strong, which is calibrated autonomy rather than a fixed switch.
:::

**Full answer**

**Calibrated autonomy**

The system grants freedom where evidence and rollback are strong and requires a checkpoint where consequence is high. That is a property of each decision, so the policy is written per decision class, not per task or per model.

**Human-owned and agent-owned**

| Human keeps | Agent may own |
|---|---|
| Changes to public behavior or compatibility | Local structure, names, reversible refactors |
| Changes to risk or safety posture | Bounded investigation that returns a fact table |
| Grants of authority or access | Implementation inside exclusive paths with proof |
| Irreversible cost: migrations, deletions, spend | Verification and read-only review of finished artifacts |

**The three modes make it executable**

Each decision in a task contract is locked, bounded or delegated. Locked decisions carry a human checkpoint. Bounded decisions state the limits, such as a dependency allowlist or a retry range, and the agent proposes inside them. Delegated decisions require the agent to explain the choice and prove the result. The mode is chosen from consequence and reversibility, and the reason is recorded so a later team can revise it.

**How the line moves**

Autonomy expands on evidence. When a class of delegated decisions has a strong proof layer, a clean rollback and a window without incidents, a bounded decision can become delegated. When an incident shows a missing control, the move goes the other way until the control exists. The policy itself is a control with an owner and a review date.

**What never moves**

Proof must match the claim. A unit test does not prove a public interface path, and an agent's summary does not replace reading the proof output. The integrator reads the proof, not the story.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** An agent proposes a dependency outside the allowlist with a good argument. What happens? Expected: the bounded decision escalates to a human; the argument is input to the decision, not a permission.
- **Level 4:** How do you widen autonomy for a decision class safely? Expected: show the proof layer, the rollback and an incident-free window for that class, then change the mode and record the evidence and the reviewer.
- **Level 4:** What evidence would make you narrow autonomy again? Expected: an incident that a lower-level control did not catch, which shows the proof layer was weaker than the policy assumed.

**Wrong answers, and why they fail**

- "Let the agent decide easy tasks and keep the hard ones." Difficulty is not the axis; a trivial deletion can be irreversible and a hard refactor can be reversible.
- "Autonomy is a single setting per team." Each decision class has its own consequence and reversibility, so one switch is wrong in both directions.
- "A passing test suite is enough to merge anything." The suite proves local contracts; public behavior, authority and irreversible cost need their own proof and a human checkpoint.

:::

## Turn telemetry nobody owns into a learning loop

*Level 4 (staff) · design · about 15 minutes*

You inherit a team that collects traces, evaluation scores, support tickets and incident logs for an assistant. Nobody can name a change that any of it caused. Design the mechanism that turns those signals into improvements, and tell me how you keep it from becoming another backlog.

:::answer Show the answer
:::say Short answer
The missing piece is promotion: a defined path from an observation to a durable change with an owner and proof. Each signal is connected to an outcome, a constraint or an assumption, traced to a root cause, and routed to the earliest layer that owns that cause, which is evaluation, context, policy, runtime or a shaped backlog item. Every resulting action carries one owner, a priority from consequence and recurrence, the artifact to change, the verification, a review window and a retirement condition, so the loop produces controls that are later re-examined rather than rules that only accumulate.
:::

**Full answer**

**The loop**

1. Observe a concrete signal.
2. Connect it to an outcome, a constraint or an assumption.
3. Identify the earliest system layer that owns the cause.
4. Create a bounded change.
5. Verify that recurrence became less likely.
6. Review whether the control should remain.

**Route to the owning layer**

| Signal | Destination |
|---|---|
| False positive, regression, wrong result | Evaluation or test |
| Missing context, duplicate work, stale fact | Context source or retrieval route |
| Unsafe action or authority gap | Policy or permission boundary |
| Timeout, retry storm, unavailable dependency | Runtime control |
| New product need or unresolved tradeoff | Shaped backlog item |

A timeout belongs to the runtime, not to the general backlog, and a wrong answer belongs to a test, not to another prompt paragraph. The cause is fixed at the earliest effective layer.

**Ownership is part of the control**

An unowned improvement is an observation with better formatting. Every action gets one owner, a priority based on consequence and recurrence, the artifact to change, the verification that proves the change, a review or expiry window, and a retirement condition.

**Why it is not a backlog**

A backlog stores wishes. The ratchet stores controls with proof and expiry. Controls are reviewed when the architecture changes, when a lower-level invariant replaces a higher-level instruction, when the protected failure has stayed away across the window, or when the control blocks legitimate work more than it prevents harm. Retirement needs evidence too.

**Metrics close the loop**

The signals only mean something against metrics defined before the result: outcome, guardrail and counter-metric, each with a threshold, a window and a source. The ratchet then changes the outcome frame, the assumptions, the slice or the measurement plan for product evidence, and the tests, context, scope or handoff for coding-agent corrections. Incidents can change both.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Two teams share the assistant and disagree on a tradeoff a signal exposes. Where does it go? Expected: to a shaped backlog item with a human decision owner; the ratchet does not resolve product disagreements by itself.
- **Level 4:** How do you prioritize across many signals? Expected: by consequence and recurrence together, so a severe single event and a frequent minor one both rise above a rare minor one.
- **Level 4:** What proves the loop works after a quarter? Expected: named controls that trace back to signals, verification results that show recurrence fell, and retirements with their evidence; not the volume of telemetry collected.

**Wrong answers, and why they fail**

- "Build a dashboard so everyone can see the signals." Visibility without promotion and ownership changes nothing.
- "Add each lesson learned to the system prompt." Prose is the weakest layer; a permission boundary can make the unsafe action impossible, and a test can block a release that repeats the failure.
- "Keep every control forever since it was earned." Controls decay and conflict; each one needs a retirement condition and periodic review.

:::
