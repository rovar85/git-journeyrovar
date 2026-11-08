---
track: aibank
title: "AI interview bank: Behavioral (part 1 of 2)"
short: Behavioral 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Leave work so that someone else can resume it

*Level 1 (screening) · concept · about 6 minutes*

Your session ends without warning in the middle of a multi-step change, and a colleague picks it up the next morning. What must they be able to find, and where?

:::answer Show the answer
:::say Short answer
They need to see which items are done, which proof ran for each one, which files changed, which dependencies are now unblocked, and what the next safe item is. That state lives next to the work, in the repository, as small items with explicit proof, not as checked boxes inside a chat.
:::

**Full answer**

**Design for interruption**

Sessions end unexpectedly. A resumable plan has work items small enough that another person, or another agent, can determine the state of each one from the artifacts alone. The five things they must be able to read:

- which item is complete;
- which proof ran and what it returned;
- which artifacts changed;
- which dependencies are now unblocked;
- what the next safe item is.

**Why chat is the wrong place**

A checked box in a conversation says that someone believed an item was done. It does not say which command proved it or which files it touched. The next person either trusts the box or redoes the work. A plan stored next to the code, with one identifier per item and the proof command written down, lets them verify instead of trust.

**The habit**

I stop at item boundaries when I can. When I cannot, the plan still shows the last proof that passed, so the resume point is the first item whose proof has not run.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Where do you keep the plan? Expected: in the repository next to the work, as the source of truth, with any rendering such as a Markdown view generated from it.
- **Level 2:** An item is marked done but has no proof recorded. What does the colleague do? Expected: treat it as not done and run its proof; a box without proof is a belief.
- **Level 2:** Why does item size matter for resumption? Expected: a small item either finished or did not; a large half-done item forces the next person to reconstruct where it stopped.

**Wrong answers, and why they fail**

- "Write a summary message at the end of the session." The session can end before the summary; the state must exist as the work proceeds.
- "The git log is enough." Commits show what changed, not which proof ran or which item is next.
- "Only the person who started can finish it." That is the failure the plan should prevent.

:::

## Reframe a request that names its own solution

*Level 1 (screening) · concept · about 8 minutes*

A product manager asks you to build an incident assistant for the on-call team. You have one week. Before you plan any work, what do you ask, and what do you write down first?

:::answer Show the answer
:::say Short answer
The request names an artifact, not a result. I write an outcome frame first: who has the problem, when it happens, what they do today, which observable state must improve, which limits are fixed, and which nearby work is out of scope. Then I check the frame for a product form, a model or an architecture that no evidence supports yet.
:::

**Full answer**

**The six parts of the frame**

| Part | Question I answer |
|---|---|
| User | Who feels the problem directly? |
| Situation | When and where does it happen? |
| Current behavior | What happens today, including the workarounds? |
| Desired outcome | Which observable state must get better? |
| Constraints | Which safety, policy, cost or compatibility limits are fixed? |
| Non-goals | Which tempting adjacent work is excluded? |

For the on-call team, the desired outcome could read: when an alert arrives, the engineer finds the failing service and one safe next step inside the incident time budget, and the diagnosis stays read-only and auditable. A runbook, a data repair or a smaller interface change can all satisfy that sentence. The team stays attached to the result, not to the first tool someone imagined.

**Leakage**

A frame leaks a solution when it contains an interface, a model choice, a framework or a storage system that evidence has not earned. "Users get a weekly summary from a model" leaks the summary and the cadence. "Users understand account changes before approval" states the result. A constraint can name a technology when compatibility really fixes it. I record why it is fixed.

**Constraints and non-goals do real work**

Constraints are part of the goal. No production writes during diagnosis, a response inside the incident time budget, and no new runtime dependency all remove whole classes of solutions. Non-goals keep the first slice from growing into a platform: no automatic remediation, no new alert routing, no replacement of the incident commander.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** How do you tell an outcome from an output? Expected: an outcome names an observable change for a user; an output names an artifact such as a page, a tool or a model.
- **Level 2:** The manager insists on a chat interface. Where does that go in the frame? Expected: into the constraints only when policy or compatibility fixes it, with the reason written down; otherwise it waits for evidence.
- **Level 2:** Name two non-goals that keep the first slice small. Expected: no automatic fix of the incident and no new alert routing, for example; each one must be concrete enough to reject work.
- **Level 3:** What is the first observation that would show the desired outcome is wrong? Expected: a measured time to find the failing service that is already short, which means the frame targets a problem that does not exist.

**Wrong answers, and why they fail**

- "Start with the interface and refine the goal later." The interface is one output. It ties the team to the first artifact before anyone knows what must improve.
- "Constraints are implementation details for later." A build that reaches the outcome and breaks a constraint has not reached the outcome.
- "Non-goals are optional." Without them, a useful slice grows into a platform before the first result is measured.

:::

## Define the first slice so it can change the decision

*Level 2 (working) · design · about 10 minutes*

Your team agrees to ship a minimum viable version of a new assistant. Three proposals are on the table: a polished interface on synthetic data, a working data pipeline with no interface, and a read-only replay over ten real incidents. Which one do you argue for, and how do you justify the choice?

:::answer Show the answer
:::say Short answer
I argue for the replay over real incidents. Small is useful only when the slice proves something that matters, so I first write the required proof set from the highest-risk open assumptions and reject any candidate that does not cover it. The polished page over fake data and the pipeline without users each remove the exact uncertainty the team needs to test.
:::

**Full answer**

**Vertical means evidence end to end**

A useful slice crosses the minimum real workflow needed to observe an outcome. It can be narrow in users, data, duration and capability. It must not be narrow by cutting out the uncertainty under test. The replay across ten real incidents tests service identification and operator trust at once. A polished page over fake data may test comprehension but not data feasibility. A production auto-remediator would test everything at once with unacceptable consequence.

**Required proof comes before scoring**

I take the highest-risk open assumptions and turn them into a proof set. A candidate is eligible only if it covers that set. Among eligible candidates I compare outcome value, uncertainty reduced, effort, consequence and reversibility. The eligibility gate matters more than the arithmetic. A cheaper candidate that proves one required assumption stays ineligible even with a high score.

**False minimums I name in the room**

- The interface-only minimum removes the data and operational uncertainty.
- The infrastructure-only minimum proves possibility without user value.
- The happy-path minimum omits the exception that creates most of the risk.
- The demo minimum produces a persuasive artifact but no repeatable measurement.
- The platform minimum builds reusable machinery before one workflow has earned it.

**The stop rule**

Before anyone builds, I write what happens if the slice fails: abandon the outcome, change the target user, test a different mechanism, collect better evidence, or narrow authority further. If every possible result leads to "keep building", the slice is not an experiment.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The replay fails. Name two valid next moves. Expected: change the target user or situation, or test a different mechanism; both were written in the stop rule before the build.
- **Level 2:** Why does a replay beat a live pilot here? Expected: it produces reversible evidence about trust and identification without exposing real users to a system nobody has measured.
- **Level 3:** A reusable component would speed up all three proposals. When does it get built? Expected: after the slice has produced decisive evidence; building platform machinery first is the platform minimum.
- **Level 3:** How do you keep the replay from becoming a demo? Expected: a repeatable measurement with a threshold decided in advance, not a persuasive walkthrough.

**Wrong answers, and why they fail**

- "The smallest build is the one with the fewest features." Smallness is measured by the evidence gained, not by the feature count.
- "Build the interface first so stakeholders can see progress." A persuasive artifact without a measurement is the demo minimum.
- "If the slice fails we iterate." Without a written stop rule, every result leads to more building and nothing was tested.

:::

## Pick the first experiment from a roadmap of features

*Level 2 (working) · design · about 10 minutes*

You join a team with a quarter-long roadmap for an assistant that recommends a next action to on-call engineers. The roadmap lists features in priority order. Tell me how you decide what to work on in week one, and why it may not be the first roadmap item.

:::answer Show the answer
:::say Short answer
A roadmap hides uncertainty inside features. I rewrite the features as falsifiable assumptions about value, usability, feasibility, viability and safety, then score each one on impact, uncertainty and irreversibility. Week one goes to the cheapest decisive test of the highest open risk, which is often not the top roadmap item.
:::

**Full answer**

**Features are bets**

The assistant only pays off if several conditions hold: alert context contains enough information to name a service, engineers trust a recommendation they did not derive, the response time matters operationally, the data is reachable without unsafe authority, and the workflow happens often enough to justify maintenance. None of these is an implementation task. They are conditions for the build to be worth doing.

**Five classes**

| Class | Question |
|---|---|
| Value | Will the outcome matter enough? |
| Usability | Can the user understand and act on it? |
| Feasibility | Can the system produce it with the available data and limits? |
| Viability | Can the organization sustain the cost, the ownership and the operation? |
| Safety | Can it fail without an unacceptable consequence? |

An assumption has to be written so that it can be false. "The feature is useful" cannot be tested. "Eight of ten on-call engineers name the correct service faster with the read-only result" can.

**Risk is three numbers, not one**

The lesson scores impact, uncertainty and irreversibility separately, each from one to five, multiplies impact by uncertainty and adds irreversibility. The formula is not sacred. Its job is to force the team to say why one unknown must be resolved before another. Irreversible, high-consequence choices need earlier evidence: a read-only replay can precede a production integration, and a human-approved recommendation can precede automatic action.

**An experiment, not a confirmation ritual**

A useful test has a claim that could be false, a realistic sample, an observable result, a threshold decided before the result, and a next decision for pass, fail and ambiguous evidence. A demo that only shows the team can build the idea is not a test.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The highest-risk assumption is tested and holds. What changes? Expected: it moves from open to tested with its evidence attached, and the next experiment targets the next highest open risk.
- **Level 2:** Which assumption class do feature lists most often omit? Expected: safety, the question of whether the feature can fail without unacceptable consequence.
- **Level 3:** The roadmap owner says the ranking already reflects risk. How do you check? Expected: compare the risk ranking with the roadmap order and explain each mismatch; where they differ, one of them is wrong about the evidence.
- **Level 3:** Write a threshold that would stop the build. Expected: for example, fewer than a stated share of engineers in the replay trust the read-only recommendation enough to act on it.

**Wrong answers, and why they fail**

- "Build the first roadmap item; the order was agreed." Agreement on order is not evidence that the riskiest assumption holds.
- "Ship something small and see what happens." A small build without a claim, a threshold and a next decision learns nothing.
- "Risk is just how likely it is to fail." Impact and irreversibility change the order even when the probability is the same.

**Related lesson in this course:** [Roadmap, a benchmarking harness and a reference architecture](#aiinfra-10)

:::

## Set the success metric before the first result exists

*Level 2 (working) · design · about 10 minutes*

Tell me about a time you defined how a project would be judged before you had any results. What did you write down, and what did you refuse to leave open until later?

:::answer Show the answer
:::say Short answer
I start from the goal, derive the questions it raises, and only then pick the smallest metrics that answer them. Each metric gets a direction, a threshold, a window, a source and a population before any value is observed, and each outcome metric is paired with a guardrail and a counter-metric. I also write the pass, fail and ambiguous decisions in advance, because a team that sees the result first moves the threshold to protect the build.
:::

**Full answer**

**Goal, question, metric**

For an incident tool the goal was to cut the time to identify the affected service without raising unsafe actions. The questions followed: how fast is the correct service found, how often is it correct, does diagnosis stay read-only, and does the workflow raise alert dismissal or operator load. The metrics made each question operational.

**A metric needs a contract**

| Field | Example |
|---|---|
| Name | median identification seconds |
| Direction | at most |
| Threshold | 120 |
| Window | ten incident replays |
| Source | the replay event log |
| Population | the on-call engineers in the pilot |
| Kind | outcome or guardrail |

Without a source and a window a number cannot be reproduced. Without a threshold it cannot drive a decision.

**Three kinds of metric**

- Outcome: did the desired state improve?
- Guardrail: did a fixed constraint stay true?
- Counter-metric: did the local gain shift cost or harm somewhere else?

Speed alone is not enough. Correctness, production writes, operator workload and missed alerts protect against a fast but unsafe result. A plan without a guardrail is invalid even when the outcome metrics look complete.

**Decide before you measure**

The lesson's example: pass when the correct-service rate is at least 0.9 and the median time is at most 120 seconds; fail on any production write or a correct rate below 0.75; ambiguous when the gain is small with wide variance, which calls for a larger replay set. A stable correct rate between 0.75 and 0.9 matches none of the three rules, so I also write a rule for it before the replay: it does not pass, and it names the next test. Offline replay gives repeatability and edge coverage. A bounded pilot gives real behavior and trust. I use the cheapest evidence that answers the current decision and do not expose real users only because the code is ready.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** A metric is easy to collect but cannot change the decision. What do you do with it? Expected: remove it; measurement answers a decision, it does not decorate a dashboard.
- **Level 2:** Give a counter-metric for the incident tool. Expected: review time added for the incident commander, or escalations that moved to another team.
- **Level 3:** The outcome metric passes and the guardrail fails. What is the verdict? Expected: fail; a fixed constraint that broke means the outcome was not reached.
- **Level 3:** Results come back ambiguous. What was already written for that case? Expected: the next step, such as a larger replay set, decided before the result so nobody argues the threshold afterwards.

**Wrong answers, and why they fail**

- "Pick the metric after you see what the system can do." The threshold then moves to protect the build and the measurement decides nothing.
- "One good outcome metric is enough." Without a guardrail, a fast but unsafe result passes.
- "Run a live pilot since the implementation is ready." Readiness is not a reason to expose users; the cheapest evidence that answers the decision comes first.

:::

## The same correction for the third time

*Level 2 (working) · concept · about 10 minutes*

For the third time this month you have told a coding agent not to edit the project README during a feature change. Each time it apologized and fixed the run. Tell me what you do now, and why the fix is not a better prompt.

:::answer Show the answer
:::say Short answer
A correction that lives in chat fixes one run. I treat the repeat as evidence about the work system: the scope boundary was not executable. I find the cause behind the symptom, then put a control at the earliest layer that can stop the recurrence, which here is a scope or permission policy rather than another paragraph in the instructions. The control gets an owner, a verification and a date to review or retire it.
:::

**Full answer**

**Separate the cause from the symptom**

"The agent edited the README" is a symptom. The cause can be any of these:

- the task allowed writes to the repository root;
- documentation was treated as safe by default;
- the plan bundled implementation and documentation in one item;
- two workers had overlapping ownership.

Each cause belongs to a different control. A rule that only repeats the symptom fails in the next slightly different case.

**Promote to the earliest effective layer**

| Recurring failure | Durable destination |
|---|---|
| Wrong result or regression | Test or evaluation |
| Off-scope or unsafe action | Scope or permission policy |
| Repeated setup or command mistake | Automation or tool |
| Repeated output-format mistake | Canonical example plus validator |
| Ambiguous local convention | Instruction with a scenario check |
| Product disagreement | Human decision record |

Earlier controls are cheaper. A permission that makes the write impossible is stronger than a review comment that catches it later, and a focused test is stronger than a paragraph that asks the agent to remember.

**The record**

For each promoted correction I capture the symptom, the root cause, the consequence, the recurrence count, the chosen control, how the control is verified, the owner, and a date to review or retire it. Not every one-off preference gets promoted. Recurrence or consequence has to justify permanent complexity.

**Why not a better prompt**

The prompt was already clear three times. The failure is that the boundary depended on the agent reading and remembering. A policy that refuses the write does not depend on memory.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Two corrections use different words for the same cause. How do you keep them from becoming two rules? Expected: normalize them to a stable fingerprint of the cause, so they collapse into one control without merging unrelated failures.
- **Level 2:** A first-time failure deleted customer data. Does it wait for recurrence? Expected: no; consequence weighting lets a severe first occurrence be promoted at once.
- **Level 3:** When would you remove the control you added? Expected: when the architecture changed, a stronger executable control replaced it, the failure has not recurred across a meaningful window, or the control blocks more legitimate work than the risk it prevents.
- **Level 3:** What is the smallest system you aim for? Expected: the smallest set of controls that preserves the hard-won judgment, not the longest instruction file.

**Wrong answers, and why they fail**

- "Add the rule in capital letters at the top of the instructions." The instruction already existed; a louder copy still depends on the agent reading it.
- "Promote every correction so nothing is lost." Controls accumulate, conflict and bloat context; promotion needs recurrence or consequence.
- "The agent is the problem, switch models." The boundary was not executable; a different model meets the same missing control.

:::

## Two users describe two different workflows

*Level 2 (working) · tradeoff · about 8 minutes*

Two senior analysts on the same team show you how they triage a flagged transaction. Their steps differ in order, in the tools they open, and in who they ask before they act. Your deadline allows one workflow in the first version. What do you do with the disagreement?

:::answer Show the answer
:::say Short answer
I keep both variants separate until I know why they differ. The difference can come from different roles, different risk levels, a legacy process next to a current one, a difference in expertise, or a real policy disagreement, and each of those leads to a different product. An averaged workflow can describe nobody, so the first version targets one variant on purpose and names the other as a known gap.
:::

**Full answer**

**Why not average**

Two people can perform different workflows for good reasons. Merging their steps into one path produces a sequence that neither of them follows. The assistant then fails at the first handoff or exception, which is where these features fail most.

**What the difference can mean**

| Cause | What it tells the build |
|---|---|
| Different roles | Two user types, maybe two outcome frames |
| Different risk levels | The branch is a feature, not noise |
| Legacy and current process | One variant may be retiring; confirm with the owner |
| Expertise difference | The expert path may be the target and the other the training gap |
| Policy disagreement | A human decision is needed before any build |

**How I resolve it**

1. Record both variants as ordered steps with evidence and the rung of that evidence.
2. Find where the branch begins and which authority boundary each variant crosses.
3. Ask the owner of the process which cause applies; if it is a policy disagreement, that decision goes to a human and the build waits for it.
4. Pick one variant for the first slice by risk and frequency, and write the other as a non-goal with the reason.

**Where the exception hides**

Often one analyst's "extra" step is the exception path the other analyst has stopped noticing. I ask for a real case where the normal path failed before I call a step optional.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** One analyst asks a supervisor before acting and the other does not. What is that step? Expected: an authority boundary; the build must respect it, and the two variants may differ in risk level or role.
- **Level 2:** You can only ship one path. How do you choose? Expected: by the risk and the frequency of each variant, with the other recorded as a named gap, not by averaging.
- **Level 3:** The owner says both are fine. What do you record? Expected: that the policy allows both, with the evidence, so the assistant does not force one on everybody.
- **Level 3:** How do you keep the second variant from disappearing from the plan? Expected: write it as a non-goal with its reason and a review point, so it stays visible as a decision instead of an omission.

**Wrong answers, and why they fail**

- "Merge the two into one standard process." The averaged workflow may describe nobody and breaks at the handoff.
- "Follow the more senior person." Seniority is not evidence; the cause of the difference decides.
- "Treat the extra steps as optional and skip them." The extra step is often the exception path that carries most of the risk.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Weigh what a stakeholder tells you about their workflow

*Level 2 (working) · concept · about 10 minutes*

A customer lead spends an hour describing how their support team handles a refund request. You now have to decide what the first version of an assistant does. Tell me how you treat that hour of description, and what you do next.

:::answer Show the answer
:::say Short answer
An interview is reported behavior, which is the third rung of a four-rung ladder. I label every claim from the hour by its rung, then look for direct evidence for the claims that matter most: a trace, a recording, a ticket or a completed form. The steps that stay unproven remain visible as open claims instead of turning into requirements.
:::

**Full answer**

**The ladder**

1. Direct behavior: an observation, a trace, a recording or a system event.
2. An artifact: a ticket, a runbook, a log, a form or a finished output.
3. Reported behavior: a person describes what they do.
4. Inference: the team concludes what probably happens.

All four help. Only the first two prove current behavior. When I write the workflow down, each step carries its rung, so confidence does not grow on its own.

**What I reconstruct**

I do not begin with feature wishes. I rebuild what happens now, step by step, with the actor, the trigger, the action, the input, the output, the friction, who holds authority for a consequential change, and the evidence. The workflow is larger than the screen. It includes waiting, copy and paste, side channels, approvals, error recovery and steps people have stopped noticing.

**Four things I search for**

- Friction: repeated effort, delay, re-entry or recovery.
- Hidden state: facts carried in memory, chat or personal notes.
- Authority: the person or system allowed to make the consequential change.
- Exceptions: the case where the normal path stops being normal.

Assistants fail most often at handoffs and exceptions, because only the happy path was shaped. So the first thing I ask for after the interview is one real trace of an exception.

**How this changes the first version**

A step with direct evidence can become a requirement. A step with only reported evidence becomes an assumption to test. The description from the hour tells me where to look, not what to build.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The lead says "we always check the order history first." How do you confirm that? Expected: ask for a recording or a log of three real cases and mark the claim as reported until one of them shows it.
- **Level 2:** What is the direct-evidence ratio and why track it? Expected: the share of workflow steps backed by observation or an artifact; a low ratio means the model of the workflow is mostly belief.
- **Level 3:** You can only observe the happy path. What is the risk? Expected: the exception path, where most failures live, stays unshaped, so the assistant breaks at the handoff that matters.
- **Level 3:** A proposed feature removes a visible step. What do you check before you accept it? Expected: whether hidden work behind that step still exists, so the feature only moves the effort somewhere invisible.

**Wrong answers, and why they fail**

- "The customer knows their process, so the interview is the requirement." A description is reported behavior; it is useful but it does not prove what happens.
- "Average the descriptions from several people into one workflow." An averaged workflow can describe nobody; the variants must stay separate until their cause is known.
- "Infer the missing steps from similar teams." Inference is the weakest rung and must stay labeled as a guess.

:::

## What you check before you approve an execution plan

*Level 2 (working) · debug · about 10 minutes*

A teammate, or a coding agent, hands you this plan for a change to a public API: update the endpoint, add tests, update the documentation. They want approval to start. What do you ask for before you say yes, and what would make you reject the plan outright?

:::answer Show the answer
:::say Short answer
That list repeats the request in future tense. I ask for five things on each item: a stable identifier, the smallest change, the repository facts that justify it, the items it depends on, and the exact check that closes it. I reject a plan with a duplicate identifier, an item without evidence or proof, a dependency on an unknown item, a cycle, or an irreversible step scheduled before the uncertainty it depends on is resolved.
:::

**Full answer**

**Why the three-line plan fails**

Nothing in it says what was found in the repository, why those files are the right ones, which contract changes first, or what can run at the same time. Someone can complete every line and still create rework.

**The five commitments**

| Commitment | Purpose |
|---|---|
| Identifier | A stable reference for dependencies and handoff |
| Change | The smallest behavior or contract change |
| Evidence | Repository facts that justify the change |
| Dependencies | Work that must be true first |
| Proof | The exact check that closes the item |

**Order by dependency, not by prose**

When several surfaces depend on one behavior, the contract comes first. Tests, implementation and documentation then share one definition instead of inventing four. A dependency graph also shows safe concurrency: implementation and documentation can proceed together after the contract is fixed, and the integration gate waits for both.

**Evidence must be able to change the plan**

An existing helper removes a planned abstraction. A compatibility test forces a migration step. A deployment constraint moves a schema change into another task. If a piece of evidence cannot change the plan, it is decoration, not evidence.

**The rejection list**

The first five checks are mechanical: duplicate identifiers, items without evidence, items without proof, unknown dependencies, cycles. The last check needs judgment: does the first irreversible action, such as a migration or a public release, happen before the relevant uncertainty is resolved? I call that one out explicitly in the review.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** One item lists two proof commands. What do you do? Expected: split it into two items, because one item needs one clear completion proof.
- **Level 2:** Two items depend on each other. What does that usually hide? Expected: an unresolved product or design disagreement; the cycle is the symptom, the missing decision is the cause.
- **Level 3:** The plan sits in a chat thread as checked boxes. Why is that a problem? Expected: a session can end at any moment, and another person cannot see which proof ran or which item is now unblocked; the plan belongs next to the work.
- **Level 3:** A migration item needs a human approval. How do you express that in the graph? Expected: as an explicit item with the approval as its proof, which every dependent item waits for.

**Wrong answers, and why they fail**

- "Trust the author and review the result instead." Rework found at review time costs more than a plan rejected before editing.
- "A longer plan is a better plan." Length adds nothing; evidence and proof on each item do.
- "Dependencies are obvious from the order of the list." Prose order hides which steps can run together and which must wait.

:::

## A prototype that quietly acquired real users

*Level 3 (senior) · debug · about 12 minutes*

You discover that a weekend prototype you shared internally is now used every day by another team, with production data, and someone just reported an outage to you. Walk me through what went wrong before this moment and what you do in the first week.

:::answer Show the answer
:::say Short answer
The system drifted across stages. It gained users, data and authority without gaining ownership, and nothing in the system itself marked it as a prototype. In the first week I make the stage observable in configuration, access control, telemetry and documentation, cut the production data path until a named owner accepts it, and decide with that team whether the right next stage is a bounded pilot or a stop.
:::

**Full answer**

**Three stages ask three questions**

| Stage | Primary question |
|---|---|
| Prototype | Can this mechanism produce the evidence at all? |
| Pilot | Does it work safely with a bounded real audience and real conditions? |
| Production | Can we own it continuously at the promised reliability and risk level? |

These are learning environments, not levels of polish. A prototype can be technically complete and still be disposable. Production begins when the organization accepts ongoing responsibility.

**What went wrong**

The prototype was built for one question and had no false operational guarantees, which was right. The failure was stage drift: it acquired an audience, real data and the authority to affect another team's work, and nobody acquired ownership. A warning banner would not have prevented this. The stage has to be enforced by the system: a configuration flag that blocks production data, access control that limits the audience, telemetry that shows who uses it, and documentation that says what it is.

**The first week**

1. Stop the bleeding: block the production data path with a technical control, not a message.
2. Name the stage in the system so anyone can see it.
3. Meet the other team with the pilot requirements: a named audience, a human owner, bounded duration and authority, audit and rollback, outcome and guardrail thresholds, and exit criteria for expand, revise or stop.
4. Decide. If no one will own it, the honest outcome is a stop, and the evidence it produced still counts.

**What production would require**

A service level objective, on-call and incident ownership, security and privacy review, cost and capacity controls, rollback and recovery, continuous monitoring, and a retirement path. Deployment is not production. Ownership is.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The other team says the outage shows the tool is valuable. How do you answer? Expected: value is a reason to run a bounded pilot with an owner, not a reason to keep an unowned system on production data.
- **Level 3:** Which technical control would have prevented the drift? Expected: a configuration or access control that refuses production data unless the stage is set to pilot or production by an owner.
- **Level 4:** What is the first operational responsibility that makes a build production? Expected: someone accepts an on-call or incident ownership commitment; before that, the system has users but no owner.
- **Level 4:** The team wants to skip the pilot and go straight to production. What evidence would justify that? Expected: low consequence, operational readiness, and measured outcome and guardrail results from a bounded real audience.

**Wrong answers, and why they fail**

- "Add a banner that says prototype." A banner does not stop data, users or authority from flowing in.
- "Harden the prototype into the product since people already use it." Prototype code earned another stage only if the evidence says so; usage is not that evidence.
- "Shut it down with no discussion." The evidence it produced is real; the decision owner needs options, not a surprise.

:::

## Brief the decision owner after a setback

*Level 3 (senior) · design · about 12 minutes*

Tell me about a project where the evidence turned against your plan. What did you do inside your own authority, and how did you present the situation to the person who had to decide?

:::answer Show the answer
:::say Short answer
I separate what I observed from what was reported and what I inferred, name the setback and the evidence that changed my understanding, and move the reversible work I am allowed to do while the blocked decision waits. Then I write a short brief for the decision owner: the user problem and the new evidence, at least two options including a cheaper manual or no-build option where it is credible, the tradeoffs in quality, effort, cost and risk, my recommendation with its remaining uncertainty, and the decision needed with its owner and date.
:::

**Full answer**

**Establish what happened**

A setback is a failed assumption, an unusable result, an unexpected cost or a delayed handoff. I record the user, the task, the current workflow and the outcome I wanted, and link a consented observation, a redacted record or a reproducible trace. Simulated observations stay labeled as simulated. I do not invent interviews, approvals or adoption.

**Progress inside my authority**

I list the unknowns and pick the cheapest reversible action that resolves the most consequential one. I state what I can decide, what an existing agreement bounds, and what needs authorization. Preparing a redacted offline replay while waiting for permission to use customer data is initiative. Expanding my own access is not.

**The brief**

The brief is for someone who does not need the implementation detail:

- the user problem and the evidence that changed the plan;
- at least two options, with a cheaper manual or no-build option where it is credible;
- the tradeoffs in quality, interaction design, effort, operating cost and risk;
- my recommendation, the remaining uncertainty and the decision needed;
- the decision owner, the affected stakeholders and the date the decision is needed.

I ask a peer to represent an affected stakeholder and challenge one tradeoff, and I record whether the objection changes the recommendation. Role-play stays labeled; it cannot stand in for the real stakeholder's agreement.

**Close the loop**

I recommend continue, change or stop against criteria declared in advance. If the evidence is inconclusive, I name the missing observation and the next bounded test. The decision owner's response goes in the record, or stays pending if none was made. Human review and correction time count as part of the workflow: a faster model response can still make the whole task slower or harder to trust.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why include a no-build option whenever it is credible? Expected: narrowing the workflow or keeping a manual step can be the better decision; without that option the brief only asks for permission to continue.
- **Level 3:** What goes next to each number in the outcome comparison? Expected: the sample counts, the exclusions and the evidence links, with the same metric definition and comparable windows for baseline and follow-up.
- **Level 4:** A simulated walkthrough passed every step. What claim can you make? Expected: a bounded learning claim only; unobserved real-user behavior stays a named gap with the next observation needed to close it.
- **Level 4:** How do you turn the setback into a change in how the team delivers? Expected: pick one process improvement with an owner and a review date, then keep, revise or retire it on evidence.

**Wrong answers, and why they fail**

- "Wait for the decision before doing anything." Reversible, authorized work can move forward; only the blocked decision waits.
- "Present the recommendation alone to keep it simple." The owner needs the options and the tradeoffs to make a decision rather than approve a conclusion.
- "Report the measured gain and leave out the review time." The complete task includes human review and correction; a faster model can still make the task slower.

:::

## Decide what to delete from a bloated instruction file

*Level 3 (senior) · tradeoff · about 10 minutes*

A team's agent instruction file has grown for a year. Rules contradict each other, the context is heavy, and nobody remembers why half of them exist. You are asked to clean it up. How do you decide what stays, what goes, and what you will not touch yet?

:::answer Show the answer
:::say Short answer
Every control needs a retirement condition, and retirement needs evidence like any other change. I review each rule against four questions: did the architecture or workflow it protected change, did a stronger executable control replace it, has the failure stayed away across a meaningful window, and does the rule block legitimate work more often than it prevents harm. A rule that passes none of those stays, and a rule I cannot trace to a cause gets an owner and a review date before it gets deleted.
:::

**Full answer**

**Why the file grew**

Each rule was a correction promoted into prose. Prose is the weakest durable layer. Over a year the rules encoded a system that no longer exists, started to conflict, and now consume context on every run. The goal is not the longest instruction file. It is the smallest system that preserves hard-won judgment.

**The review**

| Question | If yes |
|---|---|
| Did the architecture or workflow change? | The rule protects a system that is gone; retire it |
| Did a type, a test or a permission replace it? | Delete the prose and keep the executable control |
| Has the failure not recurred across the window? | Retire it, and note the window as the evidence |
| Does it block legitimate work more than it prevents harm? | Rewrite it narrower or retire it |

**Replace before delete**

For a rule that still protects a real risk, the better move is often promotion rather than retirement: a prose rule about output shape becomes an example plus a validator, a prose rule about files becomes a scope policy. I delete the sentence only after proving the stronger control exists and fires.

**What I do not touch yet**

A rule with no recorded cause and no owner is a gap in the record, not a candidate for deletion. I give it an owner and a review date, and I look for the correction that created it. Deleting it because it feels old is the mistake the lesson warns against.

**Guard against regrowth**

Every new control gets an owner, a verification, a review or expiry window and a retirement condition when it is created. Without that, the file fills again in a year.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Two rules contradict each other. What do you do first? Expected: find the cause behind each; a contradiction usually means one of them protects a system or decision that changed.
- **Level 3:** A rule has not fired in months. Is that enough to delete it? Expected: only if the window is meaningful for that failure and the risk it protected is still visible elsewhere; low frequency with high consequence can keep a rule alive.
- **Level 4:** How do you show that a deletion was safe? Expected: the stronger control that replaced it fires on the original failure case, and the recurrence stays absent across the review window.
- **Level 4:** What stops the file from growing back? Expected: a creation rule that every control carries an owner, a verification and a retirement condition, with periodic review.

**Wrong answers, and why they fail**

- "Delete everything older than a year and see what breaks." Retirement needs evidence; a silent failure can take months to appear.
- "Keep all of it, context is cheap." Stale rules conflict, encode a dead system and bloat every run.
- "Rewrite the whole file from scratch." The file holds judgment that was paid for; the job is to move it to stronger layers, not to lose it.

:::
