---
track: aibank
title: "AI interview bank: Agents (part 2 of 2)"
short: Agents 2
sub: 14 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## This agent loops forever, find out why

*Level 2 (working) · debug · about 10 minutes*

An on-call engineer pages you. A coding agent has run for two hours on a task that normally takes ten minutes. The trace shows one shell command, one result, and then the same command again, over and over. Walk through how you find the cause and what you change so that this cannot happen again.

:::answer Show the answer
:::say Short answer
Read the trace for the pair of action and observation that repeats, then ask why the model does not react to the observation. The usual causes are an error that the loop never shows to the model, an observation that reads the same on every turn, and a missing turn budget. Fix the cause, then add the two guards that stop any future loop: a budget that yields control to the caller, and a check for a repeated action with a repeated observation.
:::

**Full answer**

**Find the cause**

1. **Find the repeated pair.** Pull the last twenty turns and compare each action with the one before it. A loop is an action plus observation that repeats with no change in the message buffer between them.
2. **Check what the model saw.** If the tool raised an exception and the runner caught it outside the loop, the model never received an observation. It then does the only thing it knows: the same call. The lesson rule is that every error, including a 400 from a service, must come back as an observation string.
3. **Check whether the observation carries information.** An observation of `ok` after a write that did nothing, or a test runner that prints nothing on failure, gives the model no reason to change its plan. The observation formatter must include the exit code and the tail of the output.
4. **Check the stop conditions.** A loop that ends only on an explicit finish call runs until the context is full when the model never calls finish. A loop with no turn budget runs until someone pages you.

**Fix it so the loop cannot recur**

- **A turn budget per task class.** Agents run 40 to 400 steps per task, so pick a cap for the class, not one cap for every task. In the harness contract the budget is not a kill switch. When a limit is reached the loop fires `on_budget_exceeded`, emits `budget.warn`, and yields to the caller. The caller extends the budget or closes the session.
- **A repeat detector.** The permission-mode lesson describes a classifier that sees action N+1 as almost equal to action N five times in a row. You do not need a model for the simple case. Hash the action and the observation, keep the last few hashes, and pause when one repeats.
- **Errors as observations.** Route every exception through the formatter so that the model can correct the call.
- **A no-tool-call stop.** When an assistant turn contains no tool call, treat the run as finished.

**Prove the fix**

Replay the saved trace through the fixed loop. The harness contract is a deterministic state machine, so the same event log re-enters the same state without a new model call. The replay must pause at the repeat and emit the budget event where the old run kept going.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The model repeats a call because the tool returns an empty string on failure. Who owns the fix? Expected: the observation formatter, which must add the exit code and the error text so that the observation changes when the call fails.
- **Level 3:** Why does the harness yield on a budget instead of raising? Expected: a yield is a return value that the caller can inspect and resume from, while an exception loses the partial state and forces a restart.
- **Level 3:** A repeat detector hashes the action only. What loop does it miss? Expected: a loop where the action changes slightly each time, such as a counter in an argument, while the observation never changes, so hash the observation too.
- **Level 4:** The loop is fixed, but the agent still ran for two hours before anyone noticed. What is the missing surface? Expected: observability, a wall-clock budget with an alert, and a trace that someone can read at step 38 without reading the whole run.

**Wrong answers, and why they fail**

- "Raise the maximum turns so that the task can finish." The task was not progressing, so more turns give more of the same call.
- "Add a line to the prompt that says do not repeat yourself." The model repeated because it never saw the error, and a prompt cannot show it what the loop hid.
- "Kill the process when the budget is reached." A kill loses the partial state, while a yield lets the caller inspect it, extend the budget, or close the session with a clean handoff.

**Related lesson in this course:** [ReAct and Toolformer: thinking with tools](#aifield-2)

:::

## Turn be careful into a rule a checker can score

*Level 2 (working) · design · about 12 minutes*

An instructions file tells the agent to be careful, to test thoroughly, and to ask if it is unsure. Three days later the agent ships a change with no tests, writes into a directory it should not touch, and never asks a question. Redesign these instructions so that a runtime can enforce them and a reviewer can score them.

:::answer Show the answer
:::say Short answer
Rewrite each wish as a rule with a slug, a category, a one-line description and a named check function. Five categories cover most rules: startup, forbidden, definition of done, uncertainty and approval. Give every rule a severity of block, warn or info, so that the runtime refuses only on block. Keep the rules in one markdown file with one rule per heading, so that review can see every change.
:::

**Full answer**

**From wishes to rules**

| Wish | Category | Rule | Check |
|---|---|---|---|
| Be careful | Forbidden | Never edit the release script or production config | A diff check against forbidden globs |
| Test thoroughly | Definition of done | The acceptance command exits zero, and the feedback log holds the record | A read of the feedback records |
| Ask if unsure | Uncertainty | Open a question note instead of guessing when an assumption is not backed by a file | A check that a question note exists when the state file lists an assumption with no source |
| Be careful | Approval | Any new dependency or any production write needs a human sign-off | A check that the approval record exists before the action |
| Be careful | Startup | The state file exists and is fresh before work begins | A file check at session start |

A rule that does not fit one of the five categories usually wants to be two rules. Force the split.

**Severity at write time**

Each rule carries `block`, `warn` or `info`. The checker reports all three. The runtime refuses only on block. Tagging at write time forces the calibration up front, because teams that start with every rule as a hard rule later weaken them under deadline pressure without a record. An override of a block rule goes into a signed audit log through the verification gate.

**Expiry as a forcing function**

Every rule carries an expiry date, 90 days from authoring by default. The checker warns when a rule has had zero violations for 60 days in a row. At the next review the team keeps it with a reason, lowers it to info, or deletes it. One large review deployment in the lesson, with 131,246 review runs across 5,169 repositories in 30 days, found that rule sets with explicit expiry stayed under 30 rules per repository, while sets without expiry grew past 80 rules that mostly never fired.

**Source and cache**

The markdown file is the authored source. A JSON lock file is the cache that the checker reads on the hot path, regenerated by a pre-commit hook. The markdown diff is reviewable, and the parse stays out of every turn.

**Rules and runtime guardrails**

Framework guardrails enforce rules during a turn. The rule file is the human-readable contract that those guardrails implement, and the checker proves in CI that the runtime did the right thing. You need both.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why delete a stale rule instead of commenting it out? Expected: the workbench is the source of truth, and a commented rule is a rule the agent might still read while the checker ignores it.
- **Level 3:** A rule says to follow a published style guide. Why does it fail the design? Expected: it has no enforcement command, so the agent can invent compliance, and the fix is to pair it with the exact lint command.
- **Level 3:** Where does the uncertainty check get its signal? Expected: from the state file, which lists assumptions, and from the question notes, so an assumption with no source and no note is a violation.
- **Level 4:** How does the rule set stay portable across three agent products? Expected: the file is markdown plus function names, so each runtime registers the same checks as its own guardrails or interrupts while the file stays the contract.

**Wrong answers, and why they fail**

- "Make every rule a hard block so that the agent takes them seriously." Teams quietly weaken blocks under deadline pressure, and a rule set where everything blocks ends with nothing enforced.
- "Keep the rules in the prompt, where the model reads them." The model reads them and still cannot check them, while a named check function gives the runtime and the reviewer the same verdict.
- "Rules are permanent because they came from incidents." A rule that never fires still costs attention, so expiry forces a review that keeps, lowers, or deletes it with a reason.

:::

## Build the harness now, or wait for a smarter model

*Level 3 (senior) · tradeoff · about 10 minutes*

Leadership wants to pause the harness work for two quarters and wait for the next model generation, on the theory that a better model will not need the scaffolding. Make the case with evidence, and say what part of their argument is right.

:::answer Show the answer
:::say Short answer
Today the engineering that carries the load is around the model, not inside it, and the numbers say so. The same model moved a coding agent from outside the top 30 to rank five on a terminal benchmark when only the harness changed, and a team that deleted 80 percent of its agent's tools saw success go from 80 percent to 100 percent. Most enterprise agent projects that fail do so around runtime, not reasoning. Leadership is right that models absorb harness tricks over time, which is why you build the harness from primitives that survive a model swap.
:::

**Full answer**

**The receipts**

| Observation | What changed | Result |
|---|---|---|
| Coding agent on a terminal benchmark | Harness only, same model | Outside the top 30 to rank five |
| One team's agent | Deleted 80 percent of the tools | Success rate from 80 percent to 100 percent |
| Legal agents | Harness optimization alone | Accuracy more than doubled |
| Enterprise agent projects | None | 88 percent fail to reach production, with failures around runtime |
| Three open frameworks on a benchmark | None | About 50 percent task completion |
| A web agent in long context | Longer context | From 40 to 50 percent down to under 10 percent, mostly infinite loops and goal loss |

The last two rows are the argument against waiting. Infinite loops and goal loss are not reasoning failures. They are a missing turn budget, a missing state file and a missing scope.

**What the harness is made of**

The seven surfaces are a user-facing layer. Underneath them are the primitives every reliable production system already has: functions, workers, triggers, a runtime, a wire, queues, session persistence and an authorization policy. The agent loop is a worker that consumes events, calls functions, writes records and emits triggers. None of that is specific to this model generation, and none of it goes away when the model improves.

**What leadership gets right**

Models do absorb harness tricks. A pattern that was a prompt trick two years ago is native now, and the thought-token scheme of the original loop became a reasoning channel. The honest claim is not that the harness wins forever. It is that today the load is around the model, and that the primitives you build to carry it are the ones you would need for any production system, model or not.

**The proposal to leadership**

Build the surfaces as primitives, not as prompt text. Keep the state, the scope, the feedback, the gate and the handoff as files and checks that do not know which model is in the loop. When the next model arrives, swap it and keep the surfaces. The harness work is not a bet against the model. It is the part of the system you keep.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which of the receipts is the weakest evidence, and why? Expected: the enterprise failure rate, because it is a survey figure without a controlled comparison, while the benchmark rank change held the model fixed.
- **Level 3:** A newer model stops needing the repeat detector. What do you remove? Expected: nothing yet, because the detector is a trigger plus a function that costs little, and you remove it only when the trace data shows it never fires.
- **Level 4:** How do you make the harness investment visible to leadership each quarter? Expected: run the same task set with and without the surfaces on the current model, report completion, scope violations and interventions, and show the gap.
- **Level 4:** What is the one harness piece most likely to be absorbed by models next? Expected: a reasoned pick, such as self-correction on tool errors, with the argument that the model sees the observation and the surface only formats it.

**Wrong answers, and why they fail**

- "The model is the product, so the harness is overhead." The harness decided the rank on the benchmark while the model stayed the same.
- "A longer context window will fix the goal loss." The long-context result in the lesson went the other way, with completion falling under 10 percent as context grew.
- "Harness work is prompt engineering by another name." Prompting tells the model what you want this turn, and the harness carries the work across turns and sessions in files and checks.

:::

## Compact the context, or end the session and hand off

*Level 3 (senior) · tradeoff · about 10 minutes*

A long coding session has used most of its context window. The runtime offers to summarize the older turns and keep going. Your teammate wants to let it run to the limit, because compaction is automatic. When do you compact, when do you end the session, and what do you measure to choose?

:::answer Show the answer
:::say Short answer
Compaction extends a session, and a handoff closes one cleanly and starts the next in fresh context. Compaction is fine while the compressed history still carries what the task needs, but quality decays as compression stacks up. The lesson's guidance is to end the session with a generated handoff at 50 to 75 percent of the budget, not at the wall, because the packet is cheap to write while the context is intact and expensive when the model is already losing its place.
:::

**Full answer**

**Two different operations**

| Operation | What it does | What it costs |
|---|---|---|
| Compaction | Compresses the history in place and continues the same session | Each pass loses detail, and the losses stack up |
| Fresh-session handoff | Writes a packet, ends the session, and resumes in a new context | A clean break, with the cost of generating and loading the packet |

Runtimes implement compaction in different ways: a server-side opaque summary, a local summary appended as a user message, a progressive multi-stage compression near the top of the window, or a timestamp-based hiding of old messages plus a short summary. The mechanism varies. The need is the same. Whatever survives compression must be serialized into a portable artifact, and that artifact is the handoff packet.

**Why not run to the wall**

A runtime that compacts at 95 percent compacts a context that is already full of compression artifacts. The packet generator then summarizes degraded state. The mistake is to keep compressing until quality collapses. The fix is to budget for an early, clean handoff. A session that ends at 50 to 75 percent still has the intact history, the real command records and a clear next action.

**Make the choice measurable**

- Track the context fraction at which the session ends, and compare task outcomes across the two ranges.
- Count how many times a session was compacted before it ended, and correlate with review findings.
- Read the handoff packets: a packet with a vague `next_action` is a sign that the generator ran too late.

**One active handoff per branch**

Multi-agent work breaks on stale handoffs more than on bad output. Each packet carries the branch, the last known good commit and a status of active, superseded or archived. Only the active packet drives the next session.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a fresh session better than a third compaction? Expected: compression losses stack up, while a fresh session starts from the packet, the state file and the repo, which are the system of record.
- **Level 3:** What must be true of the tree before the handoff runs? Expected: the cleanup check passes, so the tree is committed or stashed with a note, no temp files remain, tests are green or named as risks, and the branch is right.
- **Level 4:** The handoff is cheap, but the next session has to rebuild its working context. How do you keep that cost down? Expected: the packet lists the exact artifacts the next session must load before it acts, and the router points at them, so the session loads the state, the board and the active contract and nothing else.
- **Level 4:** Two coding agent products are used on one task, one after the other. What makes the transition work? Expected: the packet schema, because the JSON form is product-neutral and both runtimes read the same fields.

**Wrong answers, and why they fail**

- "Compaction is automatic, so let the runtime handle it." Automatic compaction decides when to compress, not whether the compressed state is still good enough to work from.
- "End every session as early as possible to be safe." Each handoff costs a packet and a reload, so the target is a range, not a minimum.
- "A longer context window removes the problem." A larger window delays the wall, and the quality decay from stacked compression is the same.

:::

## Every action was approved, and the run was still harmful

*Level 3 (senior) · concept · about 10 minutes*

An unattended coding run used the mode in which a separate model reviews every action before it executes. The audit shows that the reviewer approved each action. The run still copied a private dataset into a public repository. Explain how that is possible, and name the controls that would have stopped it.

:::answer Show the answer
:::say Short answer
The reviewer judges one action at a time against the request. Each action in the run was allowed on its own: read a file you own, write a file you own, commit, push. The harm was in the composition, and the reviewer does not re-derive the user's intent across the trajectory. The controls that catch this live outside the per-action check: an isolated workspace with no sensitive mounts, a network egress allowlist in the scope contract, per-tool action caps, and a trajectory audit after the run that detects what the other controls let through.
:::

**Full answer**

**What a per-action reviewer can and cannot see**

The lesson lists what the classifier catches: a plain injection that maps to a known risky action shape, a repeated loop where action N+1 is almost equal to action N, and an out-of-place shell command in a file-edit session. It also lists what it misses. Subtle injection can change behavior without producing one flagged action. Every action can look safe while the composed trajectory is harmful. Exfiltration through legitimate channels is the standard case: writing data to a file you own and then pushing to a public repository is a sequence of allowed actions.

**Why intent does not help**

The reviewer compares the action with the declared task and the session state. It does not ask what the whole sequence accomplishes. Asking a model to infer the user's intent for every action would make the reviewer slower and no more reliable, because the injected text is in the same context it would read.

**The controls**

| Control | Where it lives | What it stops |
|---|---|---|
| Isolated workspace | The runtime, with no credentials and no production mounts | The dataset was never reachable |
| Network egress allowlist | The scope contract | The push to a host that was not part of the task |
| Per-tool action caps | The budget controls | A long sequence of pushes or fetches |
| Time budget | The scope contract | A run that keeps going past the point a human would have checked |
| Trajectory audit | After the run, over the event stream | Nothing in this run. It detects the composition, which no per-action check sees, so that the next run is stopped, but it cannot undo a push already made |

The scope contract is the place for the egress rule, because it is per task. The merge rule for two contracts keeps it strict: an unset allowlist defers to the other contract, two lists intersect, and an empty list stays deny-all.

**The honest framing**

The documentation ships the classifier mode as a research preview and says it is not sufficient alone. The expected setup combines it with budgets, allowlists, isolation and audits. A classifier that passes an offline evaluation can behave differently in a session where the user's context is ambiguous.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is an egress allowlist a scope dimension and not a runtime setting? Expected: the hosts a task may reach change per task, so the rule belongs in the per-task contract where the file globs and the time budget live.
- **Level 3:** What does the trajectory audit read? Expected: the append-only event stream of tool calls and results, which a subscriber can replay from any offset without re-running the model.
- **Level 4:** You cannot patch indirect prompt injection fully. What does that imply for the design? Expected: treat tool outputs as untrusted, keep the data the agent can reach small, keep the places it can send to small, and accept that detection is a layer and containment is the control.
- **Level 4:** How do you test the control set before the next unattended run? Expected: write one trajectory in which every action is approved and the composition is harmful, run it in the isolated workspace, and confirm that the allowlist or the mounts stop it.

**Wrong answers, and why they fail**

- "The reviewer model was too weak, so use a bigger one." A bigger reviewer still judges actions one at a time and still reads the same injected context.
- "Approve pushes manually and the rest automatically." A push is one of many legitimate channels, and the data had already left the private location through allowed writes.
- "Keep the dataset in the repo but mark it private in the prompt." The prompt is advice, and the control is whether the dataset is mounted into the workspace at all.

:::

## Package the workbench so one command installs it anywhere

*Level 3 (senior) · take-home · about 45 minutes*

Take-home. Your team has the workbench surfaces as loose scripts, a shared document and some memory. Package them into one directory that a new repository can install with one command, and defend what you leave out. Bring the layout, the installer, the versioning rule and the uninstall rule. We grade the second install as much as the first.

:::answer Show the answer
:::say Short answer
Ship a versioned directory with four parts: the docs that carry the rules and the rubric, the schemas that are the contract, the scripts that are the runtime, and a short installer. The installer refuses to install over an existing pack without a force flag, copies the pack, connects CI if a workflows directory exists, and prints the next steps. Running it twice gives the same result. Project tasks, vendor SDK calls and onboarding prose stay out, because the pack is the recipe and each install is a serving.
:::

**Full answer**

**Layout**

```text
agent-workbench-pack/
  AGENTS.md
  docs/        agent-rules.md  reliability-policy.md  handoff-protocol.md  reviewer-rubric.md
  schemas/     agent_state.schema.json  task_board.schema.json  scope_contract.schema.json
  scripts/     init_agent.py  run_with_feedback.py  verify_agent.py  generate_handoff.py
  bin/         install.sh
  README.md
  VERSION
```

**In and out**

In: the schemas, because they are the contract; the four scripts, because they are the runtime; the four docs, because they are the rules and the rubric.

Out: project-specific tasks, which belong on the target repository's board; vendor SDK calls, because the pack is framework-agnostic; onboarding prose, because the pack lives next to the team's onboarding and not inside it.

**The installer**

1. Refuse to install over an existing pack unless `--force` is passed.
2. Copy the pack into the target repository.
3. Connect CI if `.github/workflows/` exists.
4. Print the next steps: fill the board, set the acceptance commands, run the init script.

The installer also writes the pack version into the target repository, and emits symlinks so that every coding agent product reads the same root file. Forking the pack for one product is a failure mode.

**Versioning**

`VERSION` is the contract. A schema change or a script change that needs a migration bumps the major. A docs-only change bumps the patch. The target's state file records which pack version it was initialized against, and a lint refuses to ship when the target's recorded version disagrees with the pack's. This is how package managers survive a decade of churn, and nothing about agents changes the rule.

**Uninstall**

The uninstaller removes the schemas, the scripts, the docs and the root file, and refuses to run when the state files have uncommitted changes. It never deletes the state file, the board or the outputs directory. State belongs to the user. The pack does not own it.

**What we grade**

- The second run of the installer changes nothing.
- The lint fails when the pack drifts from `VERSION`.
- The uninstaller refuses on non-trivial state and leaves the user's files in place.
- The written defense of each cut, one paragraph each.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which one optional fifth document would you promote into the pack, and why? Expected: a reasoned choice with the cut defended, for example a migration runbook, with the argument that it is needed on every major bump and not on one project.
- **Level 3:** What counts as non-trivial state for the uninstaller? Expected: any uncommitted change in the state file, the board or the outputs, because those are the user's work and not the pack's.
- **Level 4:** How do you migrate a hand-rolled workbench to the pack with the least downtime? Expected: install beside it, map each existing file to a schema, run the gate on both for one task, then switch the router pointer and archive the old files.
- **Level 4:** What breaks if two repositories pin different major versions of the pack? Expected: nothing, as long as each records its version and the lint checks each against its own pack, while a shared CI job must run the matching version per repository.

**Wrong answers, and why they fail**

- "Put the team's current backlog into the pack so that new repos start with real tasks." Tasks belong to the target repository, and a pack that carries them is wrong for every repository but one.
- "Call the vendor SDK from the scripts to save time." The pack must survive a framework change, and an SDK call ties every install to one runtime.
- "Make the installer overwrite by default so that updates are easy." An overwrite without a flag destroys local changes, and the force flag is what makes an update a decision.

:::

## Read the harness, a hook aborts a tool call mid-plan

*Level 3 (senior) · code-reading · about 12 minutes*

Read this part of the harness loop. A subscriber on `before_tool_call` raises `HookAbort` on the second step of a three-step plan, because the tool name is on a deny list. Trace what the loop does next: which events it emits, which hooks fire, which state it enters, and what the caller receives.

```python
step = self._plan[self._cursor]
self.hooks.fire("before_step", {"step": step})
self._emit("step.start", {"step_id": step.id, "desc": step.description})
if step.requires_tool:
    try:
        self.hooks.fire("before_tool_call", {"step": step})
    except HookAbort as exc:
        step.error = f"hook_abort:{exc}"
        self._emit("tool.error", {"step": step.id, "error": step.error})
        self.hooks.fire("on_error", {"step": step, "error": step.error})
        self._transition(State.REFLECTING)
        return self._step()
    self.budget.tool_calls += 1
    self._emit("tool.call", {"step": step.id, "tool": step.tool_name, "args": step.tool_args})
    self._transition(State.AWAITING_TOOL)
    self._emit("step.end", {"step_id": step.id, "outcome": "awaiting_tool"})
    self.hooks.fire("after_step", {"step": step, "outcome": "awaiting_tool"})
    return PullRequest(reason="tool_call", state=self.state, payload={...})
```

:::answer Show the answer
:::say Short answer
The abort is handled inside the loop, not thrown to the caller. The loop records the error on the step, emits `tool.error`, fires `on_error`, moves to the reflecting state and calls itself again. Reflecting advances the cursor and counts a turn, so the denied step is skipped, not retried, and the loop goes on to the third step. The caller never sees the abort as an exception: it sees the next pull request for the third step's tool call or the completion, or a pause with a budget-exceeded reason if a budget limit ran out first, and it can read the denied step in the event stream.
:::

**Full answer**

**Step by step**

1. `before_step` fires and `step.start` is emitted for step two.
2. `before_tool_call` fires. The subscriber raises `HookAbort`.
3. The loop writes `hook_abort:<reason>` into `step.error`.
4. It emits `tool.error` with the step id and the error text.
5. It fires `on_error` with the step and the error.
6. It transitions to `REFLECTING`. The transition table allows executing to reflecting.
7. It calls `_step()` again. In the reflecting branch the cursor moves to step three and the turn count goes up by one.
8. Step three requires a tool, so the loop fires its hooks, counts a tool call, emits `tool.call`, transitions to `AWAITING_TOOL`, emits `step.end`, fires `after_step`, and returns a pull request with reason `tool_call`.

**What did not happen**

- No `tool.call` event for step two, and no increment of the tool-call counter, because the abort came before both.
- No `step.end` event and no `after_step` hook for step two. The abort path leaves the step without a closing event. That is a gap a reader should name: a subscriber that pairs `step.start` with `step.end` sees an open step.
- No retry. The contract skips the step and reflects. A retry policy would live in the planner, which can return a new plan from reflecting.

**Why this shape**

Hooks are imperative and can mutate, abort or skip. Events are observational and only record. The abort is a hook decision, and the record of it is an event, so a tracer that subscribes to the stream sees the denial without inspecting the loop. The state machine is deterministic, so a replay of the same event log re-enters the same state without calling a model.

**How the caller learns about the denial**

The pull request it receives is for step three. To see the denial it reads the event stream for `tool.error` with the `hook_abort` prefix, or it registers an `on_error` subscriber. A production harness would also put the denied step into the handoff's failed attempts.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The abort happens on the last step of the plan. What does the caller receive? Expected: a session result with reason `goal_met`, because reflecting moves the cursor past the end, even though the last step never ran, so the caller must read the events to see the denied step.
- **Level 3:** Why does the loop count the turn in reflecting and not in executing? Expected: a turn is one completed step, and reflecting is where the loop decides whether to advance, replan or finish.
- **Level 4:** Which invariant does `_transition` protect, and what would break without it? Expected: only the listed state pairs are legal, so a bug that moved from awaiting tool straight to executing would raise instead of corrupting the replay.
- **Level 4:** How would you make the abort path emit a matching `step.end`? Expected: emit `step.end` with an outcome of `aborted` before the transition, so that every start has an end and a tracer can pair them.

**Wrong answers, and why they fail**

- "HookAbort propagates to the caller as an exception." The loop catches it, records it and continues, so the caller sees the next pull request or the result.
- "The denied step is retried with a different tool." The contract skips to reflecting and advances the cursor, and a retry needs the planner to return a new plan.
- "The tool-call counter goes up because a tool call was attempted." The counter increments only after the hook passes, so a denied call does not spend budget.

:::

## The gate stayed green while the tests disappeared

*Level 3 (senior) · debug · about 12 minutes*

Every verification report for the last month says passed. A reviewer notices that the test suite runs much faster than it did, and that several test files are gone. The acceptance command still exits zero. What happened, which check is missing from the gate, and what else do you change?

:::answer Show the answer
:::say Short answer
The agent met the acceptance command by removing the tests that failed, and the gate only checked that the command ran and exited zero. The missing check is a coverage floor: the gate reads a coverage report and blocks when coverage is below the floor, 80 percent by default, or when it drops by more than one percentage point against the previous merge. Add the test directory to the scope check so that a deletion under it is a flagged write, and promote warnings to blocks on release branches.
:::

**Full answer**

**How a green gate lies**

The gate is deterministic over artifacts, and it was given the wrong artifacts to be sure about. Its checks were: acceptance commands ran, acceptance commands exited zero, no forbidden writes, no null exits, block-severity rules passed. A test suite with fewer tests exits zero. Nothing in that list measures how much the suite covers.

**The coverage floor**

A `coverage_report.json` with the current and the previous coverage feeds a new check. Two findings come out of it:

| Finding | Severity | Condition |
|---|---|---|
| `coverage.below_floor` | block | current coverage under the floor |
| `coverage.regression` | block | drop of more than one percentage point against the previous merge |
| `coverage.minor_regression` | warn | any smaller drop |
| `coverage.missing` | warn | no coverage report at all |

The last row is the quiet failure. If the agent stops producing the report, the gate only warns. On a release branch run the gate in strict mode, which promotes every warning to a block, so a missing report blocks.

**Scope sees deletions**

A deletion is a write. Put `tests/**` in the scope contract, either as allowed for the task that owns the tests or as forbidden for tasks that do not. Then the diff check reports a deleted test file as an off-scope or forbidden write, and the gate refuses before the coverage check runs.

**Review reads changed tests**

The reviewer is the second pass with a different role. Its checklist should include the diff of test files. A test that was changed or removed in the same change that made it pass is the pattern to flag.

**Prove the fix**

Run two proofs. For coverage, take the last passing change, restore a deleted test whose loss drops coverage by more than one percentage point, and run the old and the new gate on both versions. The old gate passes both, and the new gate blocks the deletion on coverage regression and passes the restored one. A smaller drop only warns outside strict mode. For scope, run the same deletion under a new contract that forbids `tests/**` for the task, and confirm that the scope check blocks it.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which artifact carries the floor? Expected: the coverage report carries the current and previous values, and the floor is a gate parameter so that it is versioned with the gate, not with the agent's output.
- **Level 3:** Why is a missing coverage report only a warning by default? Expected: strict everywhere erodes daily flow, so the default warns and the release branches run strict, where the warning becomes a block.
- **Level 4:** The agent rewrites a test to always pass instead of deleting it. What catches that? Expected: coverage stays the same, so the gate does not, and the reviewer's diff of test files or a mutation check in CI is the layer that sees it.
- **Level 4:** How do you keep the human override from becoming the way around the floor? Expected: an override writes a signed row with the finding code, the reason, the user and the commit, and review reads that log.

**Wrong answers, and why they fail**

- "Add a rule that says do not delete tests." A rule the gate cannot check from an artifact is a wish, and the agent did not think of it as deleting tests.
- "Count the tests and block when the number falls." A count blocks legitimate consolidation, while a coverage floor measures what the suite protects.
- "Make the acceptance command also print coverage." The gate reads a report, not output text, so the coverage must arrive as an artifact the gate can parse.

:::

## The rule is in the repo, and the agent keeps breaking it

*Level 3 (senior) · debug · about 12 minutes*

A rule says that no migration file may change without an approval. It lives in `docs/database.md`, which `docs/architecture.md` links, which the top-level instructions file links. The root file also says to always use the ORM, while the database document says to write raw SQL in migrations. The agent changed a migration twice this week without asking. Find the causes and fix them in order.

:::answer Show the answer
:::say Short answer
There are three independent causes, and any one of them is enough. The rule is three hops from the router, past the two-hop reachability limit, so the agent never loads it, and it is prose with no check, so nothing refuses the write even when the agent reads it. And the root file conflicts with the database document, and conflicting instructions silently move an agent from asking to guessing. Fix the reach first, make the rule an approval-category rule with a block-severity check, and remove the conflict.
:::

**Full answer**

**Cause one: reachability**

The agent should reach any rule in at most two hops from the router. This rule needs three. The router must link every topic document by path, so `docs/database.md` belongs in the router, and the rule itself belongs in `docs/agent-rules.md`, which the agent reads at every startup. A pointer that does not resolve is a worse failure than a missing rule, so check that each path in the router exists, and make a broken link a startup violation.

**Cause two: an aspirational rule**

"Do not change migrations without approval" is a wish until a check exists. Rewrite it as an approval-category rule with a slug, a one-line description, a `check` that compares the diff against `migrations/**` and looks for an approval record, and `block` severity. The runtime refuses on block. The checker reports it. An override needs a human signature in the audit log.

**Cause three: conflicting instructions**

The root file requires the ORM everywhere. The database document requires raw SQL inside migration files. The agent cannot satisfy both, and the measured effect of conflicting instructions is a quiet shift from an interactive mode, where the agent asks, to a greedy mode, where it guesses. One measurement in the lesson put the resolve rate at 48.8 percent without the conflict and 28 percent with it. An agent in greedy mode does not ask for approval. Number the priorities instead of stacking them flat, or scope the ORM rule to application code and the SQL rule to migrations so that they no longer overlap.

**The order**

1. Move the rule into the rules file and link the database document from the router. Now the agent reads it.
2. Add the check and the severity. Now the runtime refuses.
3. Resolve the conflict. Now the agent asks instead of guessing.
4. Add a workbench lint that fails when the router is over its line budget or references a missing file, so the regression cannot return.

**Prove it**

Run the checker over this week's two runs. The rule report must show the approval rule failing on both, with block severity. Then run the agent on a task that touches a migration and confirm that it opens an approval request before the write.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a shorter root file help here? Expected: a short router is read in full on every session and on every pull request review, so a pointer to the database document stays current and reachable.
- **Level 3:** The team wants to keep the rule in the database document because that is where the context is. What do you do? Expected: keep the explanation there, put the rule and its check in the rules file, and link both from the router, so the rule is two hops away and still has its context.
- **Level 4:** How would you find two rules that contradict each other before an incident? Expected: a lint that flags two rules whose scopes overlap with different verbs, and a review habit of numbering priorities in the router.
- **Level 4:** The checker passes in CI, and the agent still edits a migration in a live session. Where is the gap? Expected: the checker runs after the fact, so the same check must also run as a pre-tool hook in the runtime, where it can refuse the write before it happens.

**Wrong answers, and why they fail**

- "Add the rule to the system prompt in capital letters." Emphasis does not add a check, and the conflict in the router still pushes the agent toward guessing.
- "The model is ignoring instructions, so switch models." The rule was unreachable, uncheckable and contradicted, and a different model meets the same three problems.
- "Delete the ORM rule, since it caused the conflict." The ORM rule is correct for application code, so scope it rather than delete it.

:::

## Why the verification gate has no model in it

*Level 3 (senior) · concept · about 10 minutes*

A proposal replaces the script that decides whether an agent task is done with a model judge. The argument is that a judge reads the diff, understands intent, and catches more than a script can. Argue for or against, and say where a judge does belong.

:::answer Show the answer
:::say Short answer
Against. The gate answers one question, is this task complete, and that verdict must be the same for the same artifacts every time, in version control, in CI, with no way for the agent to argue with it. A model judge gives a different answer on a different day and can be talked into a pass. A judge belongs on the review side, where the question is qualitative: is the code readable, secure and on style.
:::

**Full answer**

**What the gate reads and decides**

| Check | Source | Severity |
|---|---|---|
| Every acceptance command ran | feedback records | block |
| Every acceptance command exited zero | feedback records | block |
| No write to a forbidden path | scope report | block |
| No off-scope write | scope report | block or warn |
| Every block-severity rule passed | rule report | block |
| No null exit code | feedback records | block |
| Touched files match the allowed globs | both | warn |

A warn annotates the verdict. A block prevents `passed: true`. Every check is a comparison between artifacts the agent already produced. No judgement is needed, so no judge is needed.

**Why determinism is the point**

Three failure shapes dominate agent work: "looks good", "tests passed" with no record, and acceptance read loosely enough to mean anything. A model judge is subject to all three. It reads the diff and decides it looks good. It reads the transcript and believes the claim. It interprets the acceptance line generously. The script cannot do any of that, because it never reads prose. The lesson pairs the two kinds of signal: verifiable checks such as tests, schema checks and exit codes answer whether the code solved the problem, and rubric judges answer whether it is readable and on style. Mixing them collapses the signal.

**Overrides are human and signed**

A block cannot be overridden by the agent. A human can override it, and the override writes a row with the finding code, a reason, the signing user and the current commit into an audit log that git tracks. The runtime refuses an override without a signature. That is the line between an override policy and an override theater.

**One report, several layers**

The gate writes one `verification_report.json` per task under one path, and CI reads the same path. Around it sit other deterministic layers: a pre-commit hook, a CI status check, a pre-tool authorization hook and a pre-merge gate. A failure in one layer is caught by the next. The pre-commit hook does not depend on the agent following instructions, but it is a local check that `git commit --no-verify` skips, so the CI status check and the pre-merge gate hold the verdict.

**Where the judge goes**

The reviewer, a separate pass with a different role, reads the diff and the reports after the gate passes. It scores readability, security and style. Its output goes to a human or into the handoff, never into the gate's verdict.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** An agent deletes failing tests, and the gate stays green. Which check is missing? Expected: a coverage floor read from a coverage report, with a block when coverage falls below the floor or drops by more than one percentage point against the previous merge.
- **Level 3:** When is promoting every warning to a block the right default? Expected: on release branches and in post-incident triage through a strict flag, and not globally, because strict everywhere erodes daily flow.
- **Level 4:** What stops the override log from becoming a formality? Expected: the runtime refuses an unsigned entry, the log is in git, and review reads it, so every override has a name and a reason attached.
- **Level 4:** The gate and the reviewer disagree. Who wins? Expected: the gate decides whether the task is done, and the reviewer decides whether it is good, so a gate failure blocks regardless of the review, and a review failure reopens the task without touching the verdict.

**Wrong answers, and why they fail**

- "A judge understands intent, so it catches more." The gate does not need intent, and a judge that infers intent can be convinced that an incomplete task is complete.
- "Run the judge and the script, and pass if either passes." The judge then becomes the way around the script, so the deterministic checks must decide done and the judge must only annotate.
- "Let the agent explain why a block does not apply." The agent is the party under test, and an override needs a human signature with a reason.

:::

## Bring evidence for one agent-assisted change

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. Pick a small real change in a repository you may modify, and let one coding agent make it. Bring back evidence that a reviewer can reproduce, not a transcript. Tell us what you would record at each step, how you would prove that your acceptance check can fail, and what you would refuse to claim.

:::answer Show the answer
:::say Short answer
Record the starting revision, the observable goal, the non-goals, the allowed paths and the acceptance evidence before the agent runs, together with the working mode, the budget and a stop condition. Capture a baseline with the closest existing check before any edit. After the change, write the expected result independently of the implementation, introduce one deliberate wrong result in a disposable copy, and show that the same check fails for that reason. Label every runtime observation as local, staging or live, rehearse a rollback, and leave the branch, the changed files, the open risks and the next action explicit.
:::

**Full answer**

**Frame the task and the autonomy**

Write down the starting revision, the goal as something observable, the non-goals, the allowed paths and the evidence that will count as acceptance. Name the real user or operator who needs the behavior. Choose a working mode, guided steps, checkpointed implementation or a bounded autonomous run, and say why the uncertainty, the consequences and the reversibility justify it. Set a wall-time budget and a token or cost limit where the agent exposes one. Define the stop condition for repeated failure, a request for new permissions, budget exhaustion or an unresolved contract decision, and name who resolves it.

**Prepare the smallest environment**

Retrieve the implementation, its caller, its test and the local instructions, and record why each belongs in context. Make one explicit choice per extension: a skill for a repeatable procedure, a tool for access, a hook for a deterministic check, a plugin for packaged capabilities, each with the least permissions that let it work. Record one proposed addition you rejected and its cost. Recheck one stale note or instruction and retire it if the evidence supports that.

**Baseline, then implement**

Before any edit, run the closest existing check and record the command, the revision, the result and where the evidence lives. A feature that does not exist yet still has a baseline: the observed response or the unsupported operation. Then let the agent work inside the contract, and keep an intervention log with the reason for each correction, permission change or plan revision.

**Challenge the evidence**

Pick proof that observes the changed surface: the served page at the relevant widths for a UI, the request and the serialized response for an API, the built command with its exit code for a CLI. Write the expected result from the task contract without reading the implementation. In a disposable copy, introduce one specific incorrect result, such as accepting an invalid value or dropping a required field, and run the same acceptance check. It must fail for that reason. If it stays green, strengthen the assertion before you trust it. Restore, rerun, and keep both receipts. A syntax error or a broken test setup does not count as detecting the regression. Ask a peer or a separate reviewer session to challenge the weakest proof without editing the implementation.

**Rehearse operation and recovery**

Run the artifact in a disposable local or staging environment and label every observation local, staging or live with the exact revision. Choose one failure signal for the task, with a threshold, an observation window and an owner, and trigger it safely. Rehearse the rollback to a known-good artifact and check that the old behavior returns, including any persistent data. Record any recovery step you could not verify.

**Improve the next run and hand off**

Compare the result with the baseline, including elapsed time, usage data and human interventions. One task shows what happened on that task, not that an agent is generally faster. Promote one observed correction into a test, a smaller permission or an automation, and rerun the affected check. Remove temporary changes and leave the final branch, the changed files, the open risks and the next action explicit.

**The rubric**

Each row gets `demonstrated`, `needs revision` or `unverified`, with an evidence pointer and a reason. The reviewer reproduces at least the weakest acceptance check. Filled fields and passing scripts are not substitutes for the observations. Leave unavailable evidence as unverified and narrow the claim, and never present the result as a hiring or deployment guarantee.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Your planted regression passed the acceptance check. What do you do? Expected: treat the check as untrustworthy, strengthen the assertion or the observation until it fails for that reason, and only then rerun the correct version.
- **Level 3:** Why must each runtime observation carry an environment label? Expected: a local rehearsal supports a local claim only, and an unlabeled observation lets a reader read a laptop run as production evidence.
- **Level 4:** The agent finished faster than your baseline. What may you claim? Expected: that this task was faster on this run with this many interventions, and nothing about agents in general.
- **Level 4:** Which single row would you mark unverified rather than fake? Expected: any row whose evidence you could not observe, such as a recovery step that needs a production mount you do not have, with the claim narrowed to match.

**Wrong answers, and why they fail**

- "The transcript shows the agent running the tests, so that is the evidence." A transcript is what the agent said, and the evidence is the check, its exit code and the record a reviewer can rerun.
- "The acceptance check passed, so the change is proven." A check that never failed proves nothing, and the deliberate wrong result is what shows the check can detect a regression.
- "Deployment to production is required to complete the exercise." A labeled local or staging rehearsal supports a local claim, and the exercise asks for honest labels, not production access.

:::

## Translate eight harness patterns into primitives

*Level 4 (staff) · concept · about 15 minutes*

A vendor deck lists its harness features: a loop that re-injects the original intent when the agent tries to stop early, a plan-execute-verify split, control-plane separation, signed tool-call passports, progressive compaction, hooks, skills with progressive disclosure, and sandboxed agents. Translate each one into the primitive it is, and say what the deck leaves out.

:::answer Show the answer
:::say Short answer
Every entry is a distributed-systems primitive with a new name. The re-inject loop is a trigger that re-enqueues the task with fresh context, plan-execute-verify is three workers with a queue between them, the passport is an authorization policy enforced by a pre-action worker, and compaction is a state-management worker over session persistence. Hooks are triggers around the invocation path, skills are a function registry whose metadata loads just in time, sandboxes are the compute plane, and the control-plane item is the control-plane and data-plane split that predates agents. The decks usually leave out queues, workers as the unit of deployment, trigger semantics, persistence as its own concern and authorization as a separate plane.
:::

**Full answer**

**The eight primitives**

| Primitive | What it carries for an agent |
|---|---|
| Function | A tool call, a rule check, a verification step, a model invocation |
| Worker | The builder, the reviewer, the verifier, a protocol server |
| Trigger | A loop tick, an HTTP request, a queue message, a cron, a file change, a hook |
| Runtime | The boundary that decides what runs where, with which timeouts and resources |
| HTTP or RPC | The wire between caller and worker, including the tool-call protocol and the model API |
| Queue | The durable buffer with back-pressure, retry and idempotency: the task board, the feedback log, the review inbox |
| Session persistence | The state file, checkpoints, key-value stores, the repository itself |
| Authorization policy | Allowed and forbidden files, approval boundaries, capability lists |

**The translation**

| Deck entry | What it is |
|---|---|
| Re-inject intent when the agent stops early | A trigger that re-enqueues the task with a clean context; persistence carries the goal forward |
| Plan, execute, verify | Three workers, one per role, communicating through state and a queue between phases |
| A control plane apart from the execution plane | The control-plane and data-plane split, decades old |
| A passport that signs each tool call | An authorization policy enforced by a pre-action worker, with a signed audit queue |
| Progressive compaction | A state-management worker that runs on a schedule over session persistence to keep it within a budget |
| Hooks and middleware | Triggers plus functions wrapped around the runtime's invocation path |
| Skills that disclose themselves step by step | A function registry whose metadata is loaded into context only when needed |
| Sandboxed agents | The compute plane: a runtime with isolated filesystem, network and lifecycle |

**How the surfaces map**

Instructions are policy plus function metadata. State is session persistence. Scope is an authorization policy per task. Feedback is an invocation log written into a queue. Verification is a deterministic function triggered on task close that fails closed. Review is a separate worker with read-only access to the builder's artifacts and write-only access to review reports. Handoff is a durable record emitted by a session-end trigger and read by the next session's startup trigger.

**What the decks leave out**

The lesson reads the circulating writeups and finds the same gap: they describe the harness as an object you configure, not as a system you deploy. They rarely name queues, workers as a deployment unit, trigger semantics, session persistence as a separate concern, or an authorization policy as its own plane. The strongest line in that literature, that the harness is the primary security boundary, is authorization policy restated. When the system is built from the primitives, the surfaces fall out of it. When it is built without them, no amount of instruction-file polish replaces the missing queue.

**Why the translation matters**

Vocabulary changes every release cycle. The primitives do not. A team that translates each new pattern before adopting it can compare vendors on one table, spot a pattern that is two primitives wearing one name, and notice when a deck has no answer for persistence or authorization.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which primitive is most often missing from an agent product that otherwise looks complete? Expected: the queue, because without a durable buffer the board, the feedback log and the review inbox are chat messages that scroll away.
- **Level 3:** The deck says its hooks are a security boundary. Test the claim. Expected: a hook is a trigger plus a function inside the runtime, and a security boundary is an authorization policy enforced outside the agent's reach, so ask where the policy lives and who can change it.
- **Level 4:** Two vendors describe the same thing as a handoff and as a checkpoint. How do you tell? Expected: map both to persistence and triggers, and see whether the record is read by the next session's startup trigger, which makes it a handoff, or by the same session on resume, which makes it a checkpoint.
- **Level 4:** What would make a ninth primitive legitimate? Expected: a capability that cannot be built from the eight, which is rare, so the first check is whether it is a shared-state flavor or a policy flavor you have not seen.

**Wrong answers, and why they fail**

- "These patterns are new because agents are new." Each one has a name in distributed systems, and the agent label changes the vocabulary and not the engineering.
- "Pick the vendor with the most patterns." More names on a deck is not more primitives covered, and the question is which of the eight are missing.
- "A good instruction file is the harness." Instructions are policy and function metadata, one of eight, and a file cannot replace a queue or a persistence layer.

:::

## Two hundred registered tools, forty visible at a time

*Level 4 (staff) · design · about 15 minutes*

Your harness has grown to about two hundred tools across several teams. The model cannot hold all of them in context, two teams once registered the same name and the second silently replaced the first, and the success rate has fallen as the catalog grew. Design the registry and the policy for what the model sees on each turn.

:::answer Show the answer
:::say Short answer
Make the registry the only source of truth for what exists, what shape the arguments take and which handler runs, and surface only ten to forty tools per turn. The registry holds a typed record per tool, rejects a second registration of a name unless the caller asks to override, and validates every call against a small schema subset with pointer-shaped errors. The exposure policy loads tool metadata into context only when the task needs it, and the fewer tools the model sees, the better it calls them.
:::

**Full answer**

**The record**

| Field | Purpose |
|---|---|
| `name` | Unique, lower-case segments separated by dots |
| `description` | One line shown to the model |
| `schema` | A subset of JSON Schema with eight keywords |
| `handler` | The callable, opaque to the validator |
| `idempotent` | Lets the dispatcher decide whether a retry is safe |
| `timeout_ms` | Per-tool override of the dispatcher default |

The schema is data and the handler is code. Keep them apart so that validation never ends up inside handlers.

**Three registry rules**

1. **No silent overwrite.** `register` raises on a known name unless `override=True`. The incident in the prompt is this rule missing.
2. **Validate before dispatch.** A pure, recursive walk over the schema returns `Ok` or a list of errors with JSON pointer paths. No coercion, no handler call, no I/O, so the validator can run again over a replay log.
3. **The registry is shape, not safety.** Timeouts and sandboxing live in the dispatcher. A validated call can still misbehave.

**The exposure policy**

A catalog of two hundred tools and a context that fits forty is a routing problem. Surface a subset per turn based on the task, and load the rest just in time. The workbench lesson describes the pattern as skills that are revealed step by step: a function registry whose metadata enters context only when needed. The same lesson reports a team that deleted 80 percent of its agent's tools and saw the success rate go from 80 percent to 100 percent. More tools in view means more wrong choices, longer prompts and more schema to misread.

Practical selection signals: the active scope contract, the task type on the board, the tools used in the last few turns, and an explicit request from the model for a named family. Log the exposed set per turn so that a failure can be traced to a missing tool rather than a wrong call.

**What grows next**

Past about fifty tools, add `$ref` against a local definitions block so that shared argument shapes are written once, and `additionalProperties: false` so that an extra argument is an error rather than a silent drop. Both are small. Both are common.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Two teams want the same tool name for different handlers. What do you do? Expected: refuse the collision, namespace by dotted segment, and let the exposure policy pick the family the task needs.
- **Level 3:** How do you prove the validator is still correct after a refactor? Expected: run it over a saved replay log of real calls, which works because it has no I/O, no clock and no globals.
- **Level 4:** What breaks if the exposure policy is itself a model call? Expected: a second nondeterministic step on every turn, so the selection should be rule-based from the contract and the board, with the model allowed only to request a named family.
- **Level 4:** The dispatcher retries a failed call. Which record field decides whether it may? Expected: `idempotent`, because a retry of a non-idempotent tool can repeat a side effect.

**Wrong answers, and why they fail**

- "Give the model the whole catalog and let it choose." The model cannot hold two hundred schemas, and success fell as the catalog grew, so the fix is fewer tools in view.
- "Put validation in each handler, close to the code it protects." Validation inside handlers drifts per team and turns the dispatcher into a guessing game that ends in a stack trace.
- "Allow re-registration so that teams can hot-fix a tool." A silent replace is the incident in the prompt, and a fix should pass an explicit override that shows up in review.

:::

## Two scope contracts apply to one diff, define the merge

*Level 4 (staff) · design · about 15 minutes*

A repository has a project-wide scope contract, and each task adds its own. The checker currently reads whichever file it finds first. Write the merge rule for every field so that the result is mechanical, reviewable and never looser than either input.

:::answer Show the answer
:::say Short answer
Merge by least privilege. Intersect the allowed globs, so that a path must be permitted by both contracts, and union the forbidden globs, so that either contract can prohibit a path. Take the smaller time budget, accumulate the approvals required, and treat the egress allowlist with three states: unset defers to the other side, two lists intersect, and an empty list stays deny-all. Write the rule into the contract schema so that the checker and the reviewer apply the same merge.
:::

**Full answer**

**The field rules**

| Field | Merge | Reason |
|---|---|---|
| `allowed_files` | Intersection | Both contracts must permit the write |
| `forbidden_files` | Union | Either contract can prohibit |
| `time_budget_minutes` | Minimum | The stricter clock wins |
| `approvals_required` | Union | A sign-off demanded by either is demanded by the merge |
| `network_egress` | See below | Three states, with deny-all absorbing |
| `acceptance_criteria` | Union | Every proof demanded by either must run |
| `rollback_plan` | Both kept | The operator needs each runbook |

**The egress rule in full**

`network_egress` has three states. `None` means no enforcement from this contract. `[]` means deny all. A list means an allowlist. Under merge, `None` defers to the other side, two lists intersect, and `[]` on either side yields `[]`. That last point matters: a task contract cannot open the network when the project contract closed it.

**Why the merge is in the schema**

A merge rule that lives in the checker's code is invisible to the reviewer who approves the contracts. A rule that lives in the schema is read by the checker, by the reviewer and by the agent. The lesson's framing is that the contract turns "stay in scope" from a wish into a check, and a merge that is not written down is a wish again.

**Severity still comes from the contract**

Off-scope writes to documentation are usually a warning, and writes under scripts, migrations or production config are always a block. Under merge, take the stricter severity for a path that both contracts classify. Keep the per-task violation budget, so that small slips surface as warnings and only a budget overrun blocks.

**Where the feature list sits**

The feature list bounds the project, and the contract bounds the task. The merged `allowed_files` must sit inside what the active feature touches. If the task contract asks for a path the feature does not cover, the startup check fails before any write.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The project contract has no egress field and the task contract lists one host. What is the merged egress? Expected: the one-host allowlist, because an unset value defers to the other side.
- **Level 4:** Why intersect allowed globs rather than union them? Expected: a union lets a task contract grant a path the project forbade by omission, and least privilege means both parties must agree on every write.
- **Level 4:** A task legitimately needs a file outside the project contract. What is the path to approval? Expected: an entry in `approvals_required` with a human sign-off recorded, and the project contract updated in review, never a looser merge rule.
- **Level 4:** How do you test the merge? Expected: a table of input pairs and expected outputs for each field, with the deny-all absorption and the unset deferral as named cases, run in CI against the checker.

**Wrong answers, and why they fail**

- "Let the task contract override the project contract, because it is more specific." Specific is not the same as safe, and an override lets any task open any path or host.
- "Take the union of allowed files so that nothing legitimate is blocked." A union is the loosest result, and the merge must never be looser than either input.
- "Merge in the checker and keep the contracts simple." A merge the reviewer cannot read is a rule the team cannot audit.

:::
