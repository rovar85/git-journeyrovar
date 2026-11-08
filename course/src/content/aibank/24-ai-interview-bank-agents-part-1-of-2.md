---
track: aibank
title: "AI interview bank: Agents (part 1 of 2)"
short: Agents 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Seven surfaces, and the symptom when each is missing

*Level 1 (screening) · concept · about 6 minutes*

A team ran a frontier model on a small repo task. The result had plausible code, two red tests, one edit in a file that had nothing to do with the task, and no note of what the model assumed or what remains. The team wants to buy a bigger model. What do you tell them?

:::answer Show the answer
:::say Short answer
The model was right about the language and wrong about the work, and a bigger model does not fix that. Reliable agents need a workbench with seven surfaces around the model: instructions, state, scope, feedback, verification, review and handoff. Each symptom in the run maps to one missing surface. You can swap the model and keep the surfaces, but you cannot drop the surfaces and keep the reliability.
:::

**Full answer**

**The seven surfaces**

| Surface | What it carries | Failure when it is missing |
|---|---|---|
| Instructions | Startup rules, forbidden actions, the definition of done | The agent guesses what done means |
| State | Current task, touched files, blockers, next action | Every session starts from zero |
| Scope | Allowed files, forbidden files, acceptance criteria | Edits spread into unrelated code |
| Feedback | Real command output captured into the loop | The agent declares success on an error |
| Verification | Tests, lint, smoke run, scope check | "Looks good" reaches the main branch |
| Review | A second pass with a different role | The builder grades its own work |
| Handoff | What changed, why, what is left | The next session finds everything again |

**Map the run to the table**

- Two red tests and a success claim: feedback and verification were missing.
- An edit in an unrelated file: scope was missing.
- No note of assumptions or of what remains: state and handoff were missing.
- Nobody but the builder read the diff: review was missing.

**Why not a bigger model**

The loop closes on the state file, not on the chat history. Chat is volatile. The repo is the system of record. The lesson collects the receipts: one coding agent moved from outside the top 30 to rank five on a terminal benchmark with the same model and a changed harness, and one team deleted 80 percent of its agent's tools and saw the success rate go from 80 percent to 100 percent. The load today is carried by the engineering around the model.

**What a workbench is not**

It is not prompt engineering, which tells the model what you want this turn. It is not the framework, which gives you a runtime. The workbench is the place the agent works in, across turns and across sessions, inside whatever runtime you chose.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which of the seven surfaces does a pull request template cover? Expected: handoff, because it records what changed, why, and what is left.
- **Level 2:** Which surface catches an agent that writes an extra file nobody asked for? Expected: scope first, because the diff check compares touched files with the contract, and then verification, which refuses the forbidden write.
- **Level 2:** Why does the lesson say the loop closes on a file and not on the chat? Expected: sessions end and conversations get trimmed, so the file is the only record that the next session can trust.
- **Level 3:** The lesson maps each surface to a distributed-systems primitive. What is verification? Expected: a function that is deterministic over its inputs, triggered when the task closes, and that fails closed.

**Wrong answers, and why they fail**

- "The model hallucinated, so pick a model that hallucinates less." The model did not know what done meant or where it could write, and no model knows that without the surfaces.
- "Write a longer system prompt with all the rules." A prompt covers one turn, while the surfaces carry the work across turns and sessions.
- "The framework already does this." A framework gives the agent a runtime, and the workbench is what the agent reads and writes inside that runtime.

:::

## What a handoff packet carries that a status report does not

*Level 1 (screening) · concept · about 6 minutes*

At the end of each session your agent writes a paragraph that says what it did. The next session still spends its first half hour finding out where things stand. What is missing from the end-of-session artifact, and how do you produce it so that it is never skipped?

:::answer Show the answer
:::say Short answer
The paragraph is a status report, and a handoff needs seven fields: a summary, the changed files, the commands run, the failed attempts, the open risks, the next action and a pointer to the verification and review reports. The next action is the most important field, because it makes the first step of the next session deterministic. Generate the packet from the workbench artifacts instead of asking the agent to write it, and run a cleanup check first so that the packet describes a tree the next session can trust.
:::

**Full answer**

**The seven fields**

| Field | Question it answers |
|---|---|
| `summary` | What was done, in one paragraph |
| `changed_files` | The diff at a glance |
| `commands_run` | What was executed, from the feedback records |
| `failed_attempts` | What was tried and why it did not work |
| `open_risks` | What can hurt the next session, with a severity |
| `next_action` | The first concrete step the next session takes |
| `verdict_pointer` | The path to the verification and review reports |

A packet with every field except `next_action` is a status report. It is useful, but the next session still has to decide what to do first.

**Generated, not written**

A hand-written handoff is the thing that gets skipped on a hard day. The generator reads the state file, the verification report, the review report and the feedback log, and emits the packet in two forms. `handoff.md` is for the human. `handoff.json` is for the next agent. If they disagree, the JSON wins. The agent's job is to leave the workbench in a state the generator can summarize.

**Trim the log**

The feedback log can hold hundreds of records. The packet carries only the last K plus every record with a non-zero exit. The next session loads the full log if it needs it.

**Leave a clean state**

A perfect packet is useless if the next session opens on a half-applied diff, a stray temp file, a wrong branch and tests that error before they run. Cleanup is its own phase, and it is a check, not a habit. The working tree is committed or stashed with a note. No temp artifacts remain. Tests are green, or red with the failure named in the open risks. The feature board matches reality. The branch is the expected one. The cleanup phase emits a list of blocking issues, and an empty list is the precondition the generator asserts before it writes.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does the JSON win when the two forms disagree? Expected: the next agent loads the JSON, so the machine-readable form is the one that drives the next session.
- **Level 2:** Which failed attempts belong in the packet? Expected: every record with a non-zero exit, with the retry chain visible, so that the next session does not repeat a known dead end.
- **Level 2:** What is the difference between a handoff and the state file? Expected: the state file is read on every turn and holds where the agent is, while the handoff is generated once at session end and tells the next session where to start.
- **Level 3:** Two sessions on two branches each wrote a handoff. How does the next session pick one? Expected: each packet carries a branch, a last known good commit and a status of active, superseded or archived, and only the active packet for this branch drives the session.

**Wrong answers, and why they fail**

- "Ask the agent to write a detailed summary at the end." A written summary is skipped when the session ends badly, and it is the bad sessions that need the handoff most.
- "The chat history is the handoff." The history is trimmed or gone, and the next session cannot replay an hour of chat in its first minute.
- "A green verification report is enough to resume." The report proves the task state, not the tree state, and a dirty tree costs the next session its first ten minutes.

:::

## What makes a loop an agent and not a chat bot

*Level 1 (screening) · concept · about 5 minutes*

A teammate says that their chat application is an agent because it calls a model inside a while loop. Name the parts that a real agent loop needs, and say what goes wrong when each one is missing.

:::answer Show the answer
:::say Short answer
An agent loop needs five parts: a message buffer that grows with each turn, a tool registry that the model calls by name, a stop condition, a turn budget, and an observation formatter. The model is the same in a chat bot and in an agent. The difference is that the agent can pause, call a tool, read the result and continue. Without the five parts, the loop is a chat bot with extra steps.
:::

**Full answer**

**The loop**

The pattern is the one from the ReAct paper. The model writes a thought, picks an action, reads an observation, and repeats until it decides to finish. Modern models move the thought to a separate reasoning channel, but the control flow is the same. Observe, think, act, observe, think, act, stop.

**The five parts**

| Part | What it does | Failure when missing |
|---|---|---|
| Message buffer | Holds the user turn, the assistant turns, the tool turns and the final turn in order | The model forgets what it already did and repeats work |
| Tool registry | Maps a tool name to a schema and a callable | The model names tools that do not exist, and nothing runs |
| Stop condition | Ends the run on an explicit finish, on a turn with no tool call, on a budget, or on a guardrail | The run never ends, or ends only when the context is full |
| Turn budget | Caps the number of iterations for this task class | One bad decision at step 38 becomes an endless run |
| Observation formatter | Converts every tool output, including every error, into a string the model can read | A failed call becomes a crash instead of a correction |

The formatter is the part that people forget. The lesson says that every 400 error in the stack must become an observation string, not an exception. A model that sees the error can correct the next call. A model that never sees it cannot.

**Why the parts matter now**

Agents run 40 to 400 steps per task. Every framework in use today builds the same loop under its own names. The things that differ live around the loop: checkpoints, actor messaging, role templates, tracing. The loop itself does not change.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What is an observation? Expected: the string form of a tool result that the loop appends to the buffer for the next model call.
- **Level 2:** Why is a turn budget a separate part from the stop condition? Expected: the stop condition depends on what the model emits, and the budget protects the run when the model never emits a stop.
- **Level 2:** Where does the thought go in a model with a native reasoning channel? Expected: in a separate field that the runtime passes between turns, so the transcript shows tool calls and results without inline thought text.
- **Level 3:** What changes when two tool calls in one turn return out of order? Expected: each result needs a correlation id that ties it to its call, or the model reads the wrong result for a call.

**Wrong answers, and why they fail**

- "An agent is a model with a long system prompt." A prompt cannot run a tool or read a result, so the model still stops at its first wrong guess.
- "The loop ends when the model says it is done." A model can say it is done too early or never, so the loop also needs a turn budget and a no-tool-call stop.
- "Tool errors should raise so that the developer sees them." An error that raises ends the run, while an error that becomes an observation lets the model fix the call.

**Related lesson in this course:** [Deep dive 18: LangGraph, agents as state machines](#aideep-18)

:::

## What one feedback record carries

*Level 1 (screening) · concept · about 5 minutes*

You wrap every shell command that an agent runs so that the next turn can read what happened. What goes into the record, which field tells you whether the command worked, and what do you do when that field is empty?

:::answer Show the answer
:::say Short answer
The record carries the exact command as argv, the tail of stdout and the tail of stderr as separate fields, the exit code, the duration, the start time, and a one-line note of what the agent expected. The exit code is the success signal, because text can say anything and the code cannot. If the runner fails before it captures an exit, the record carries a null exit and an error reason, and the loop must not advance on it.
:::

**Full answer**

**The fields**

| Field | Why it is there |
|---|---|
| `command` | Exact argv, so no shell expansion surprise |
| `stdout_tail` | The last lines of output, truncated the same way every time |
| `stderr_tail` | The last lines of errors, kept apart from stdout |
| `exit_code` | The one unambiguous success signal |
| `duration_ms` | Shows slow probes and runaway processes |
| `started_at` | A timestamp for replay |
| `agent_note` | What the agent expected before it read the result |

**Truncation that does not lose the error**

A large log destroys the loop. The runner keeps a fixed number of head lines and tail lines and inserts a marker that says how many lines it removed. The same output always gives the same record. Nothing is sampled, because the final error and the final summary live at the tail.

**Redact at write**

A record of stdout can carry a secret. The runner strips bearer tokens, password assignments, API keys and known key formats before it appends the line. Redaction at read time is a mistake, because the file on disk is what an attacker reaches.

**Feedback is not telemetry**

Telemetry is for operators reviewing runs across time. Feedback is for the next turn of this run. They share fields and live in different files with different retention.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why keep stderr separate from stdout? Expected: the failure summary often lands on one stream and progress on the other, and a merged tail can bury the summary.
- **Level 2:** A command times out. What does the record say? Expected: a null exit code, an error field with the timeout, and whatever partial output was captured, and the loop refuses to advance.
- **Level 2:** What is the agent note for? Expected: it records the prediction before the result, so a reviewer can see when the agent expected success and got a failure.
- **Level 3:** A retry succeeds. How does the audit see the first failure? Expected: each record has a command id, and the retry carries the parent command id, so the chain is visible and the retry does not look like an independent success.

**Wrong answers, and why they fail**

- "Parse the output for the word error to detect failure." Output text varies by tool and language, and the exit code is the signal every command gives.
- "Keep the whole output, because truncation can hide something." A huge record pushes the loop out of its token budget, and the deterministic tail keeps the lines that matter.
- "Redact when a human opens the log." The file on disk is already the leak, so redaction has to happen before the append.

:::

## A login fix touched five files

*Level 2 (working) · debug · about 10 minutes*

The task given to the agent was to fix one login bug. The diff changes the login route, an email helper, the database driver, the README and the release script. The transcript gives a plausible reason for each change. The reviewer rejects the pull request and asks you what went wrong and how to stop it. What do you say?

:::answer Show the answer
:::say Short answer
This is scope creep, and it is hard to see because the agent explains each step in good faith. The fix is not a stricter prompt. It is a contract on disk that lists the files the task may change and the files it must never change, plus a check that compares the final diff with that contract. The check runs before the gate, and a write to a forbidden path blocks the task.
:::

**Full answer**

**Why the prompt did not hold**

Each change had a local reason. The model does not know where the task ends, so it extends the task every time it finds something related. "Stay in scope" in a prompt is a wish. A file that says what in scope means is a check.

**The scope contract**

| Field | Purpose |
|---|---|
| `task_id` | Points at the task on the board |
| `goal` | One sentence that a reviewer can verify |
| `allowed_files` | Globs the agent may write |
| `forbidden_files` | Globs the agent must not touch, even by accident |
| `acceptance_criteria` | Commands or assertion lines that prove done |
| `rollback_plan` | One paragraph an operator can run if the task must be halted |
| `approvals_required` | Actions outside scope that need a human sign-off |

Two rules about the fields. First, a contract without `forbidden_files` is incomplete, because the negative space is half the contract. Second, use globs and not raw paths, so that a file move between sessions does not void the contract.

**The check**

The checker reads the diff, the allowed globs and the forbidden globs, and returns the violations, the in-scope files and the off-scope files. For this pull request it reports the release script as a forbidden write and the README, the email helper and the driver as off-scope writes. Severity differs by path family: an off-scope write under `docs/**` is a warning, and a write under `scripts/**`, `migrations/**` or production config is always a block. That asymmetry lives in the contract, because it changes per project and per task.

**Make it survive the team**

A gate that fails on every small slip gets switched off. Give each task a violation budget so that minor slips surface as warnings, and only a budget overrun blocks the merge. One practitioner who wrote scope contracts before each run reported that the rabbit-hole rate fell from 52 percent to 21 percent in three weeks, with the same agent.

**The second altitude**

A contract bounds one task, not the project. An agent can respect the login contract and then start a settings page on the next turn. A `feature_list.json` with at most one feature `in_progress` closes that gap. The task contract's allowed files must sit inside what the active feature touches.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The agent needed a one-line change in the email helper to fix the bug. What should have happened? Expected: the checker flags the off-scope write, the agent opens a question, and a human either grows the contract or asks the agent to back off.
- **Level 3:** How do you keep the contract valid when a refactor moves the login code? Expected: write the globs by pattern such as `app/**/login*.py`, not by exact path, and archive the contract when the task closes.
- **Level 3:** Two contracts apply to one diff, one for the project and one for the task. What is the merge rule? Expected: least privilege, so intersect the allowed globs, union the forbidden globs, and take the most restrictive time budget.
- **Level 4:** File globs are not the only scope dimension. What else belongs in the contract? Expected: a wall-clock budget and a network egress allowlist, because an agent can stay inside its files and still call a service that was not part of the task.

**Wrong answers, and why they fail**

- "Add a sentence to the prompt that says stay in scope." The agent already believed it was in scope at every step, so the sentence changes nothing without a check.
- "Review the diff by hand more carefully." Human review caught it this time, after the agent spent the budget, and the point is to catch it before the pull request exists.
- "Block every write outside the task files." A hard block on a README edit trains the team to disable the gate, so use warnings for low-risk paths and blocks for scripts and migrations.

:::

## A short router or a long manual for the agent

*Level 2 (working) · tradeoff · about 10 minutes*

A repo has a 3000-line instructions file for its coding agent. The agent follows about half of it. One engineer wants to cut it to a page. Another says that every line came from an incident and nothing can go. How do you settle it?

:::answer Show the answer
:::say Short answer
Both are right about something, and the answer is a layered file set, not a shorter file. Keep a root router under about 50 lines that holds only pointers and the few hard rules. Move the rules into a rules file with one screen per category, and move the depth into topic documents that the agent loads only when a task touches them. Every rule stays, and the agent reaches any rule in at most two hops.
:::

**Full answer**

**Why the long file fails**

The model loads the file, reads the first screen, runs out of attention budget, and acts on a fraction of what it was told. A long manual fails for the same reason a forty-page onboarding document fails. The reader skims it once and never returns to the part that mattered. Long manuals get ignored. Short routers get followed.

**The three tiers**

| Tier | Lives in | Read when | Size |
|---|---|---|---|
| Router | the root instructions file | Every session | Under about 50 lines |
| Rules | `docs/agent-rules.md` | Every session, at startup | One screen per category |
| Topic docs | `docs/<topic>.md` | Only when the task touches that topic | As deep as needed |

The router points at the state file, the task board, the rules and the verification command. It links every topic document by path, not by description.

**Two tests that keep it honest**

- **Reachability.** The agent reaches any rule in at most two hops from the router. A pointer that no longer resolves is worse than a missing rule, so a broken link in the router is itself a startup violation.
- **Freshness.** The router is short enough that a reviewer reads it again on every pull request. That is the only thing that stops it from growing back into the manual.

**What to refuse while you trim**

The lesson lists anti-patterns that look like coverage. Conflicting instructions silently drop the agent from asking to guessing; one measurement put the resolve rate at 48.8 percent with clear instructions and 28 percent with conflicting ones. A style rule with no lint command lets the agent invent compliance, so pair every style rule with its command. Lead with commands and end with style. Write for the agent, not for a human reader, because terseness saves context.

**Nested files**

Large repos keep one router per subcomponent. Tools walk from the working file to the root and concatenate every router they find, so a subdirectory file extends the root file. One large repository in the lesson carries 88 of them. Measurements in the lesson place the best files at a quality jump equal to a model upgrade, and the worst files below no file at all.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The team keeps a rule in the router because it is important. What is the test for whether it belongs there? Expected: the router holds pointers and the few hard rules that apply to every session, and anything that applies to one kind of task goes in a topic document.
- **Level 2:** How do you keep one source of truth when the team uses several coding agents? Expected: one root file and symlinks with the names each tool expects, so that every tool reads the same text.
- **Level 3:** What does a lint for the workbench check? Expected: the router is under the line budget, every path it references exists, and no two rules conflict.
- **Level 3:** Why does the lesson rank a dead link below a rule that was never written? Expected: the agent trusts the router, follows the pointer, finds nothing, and proceeds as if the rule did not exist, while a missing rule at least leaves no false promise.

**Wrong answers, and why they fail**

- "Cut the file to one page and delete the rest." The rules came from incidents, and deleting them repeats the incidents, so move them to tiers instead.
- "Keep the long file, and tell the agent to read all of it." The model has an attention budget, and an instruction to read everything does not change how much it acts on.
- "Put the file in the system prompt so that it is always in context." Being in context is not the problem; acting on it is, and a short router with pointers gets followed where a long block does not.

:::

## Explicit finish tool or no-tool-call stop

*Level 2 (working) · tradeoff · about 8 minutes*

Two engineers disagree about how the loop should end. One wants an explicit `finish` tool that the model must call. The other wants the loop to end as soon as an assistant turn has no tool call in it. Which do you pick, and what does each choice get wrong?

:::answer Show the answer
:::say Short answer
Both are stop conditions, and a production loop needs both plus a budget. The no-tool-call stop is simple and matches how models behave, but it ends the run on any turn where the model answers in prose, including a turn where it only meant to think aloud. An explicit finish gives a clear signal with a payload, but a model that never calls it runs until the budget. Pick the no-tool-call stop as the default, keep finish as a tool that carries the final answer, and make the budget the last guard.
:::

**Full answer**

**What each one gets right**

| Stop | Strength | Weakness |
|---|---|---|
| Explicit `finish` tool | The end is a structured call with the answer as its payload, so the caller never guesses which text is the answer | A model that forgets to call it, or that is told not to, never stops on its own |
| No tool call in the turn | Needs no extra tool, and matches a model that answers when it is done | A turn of prose in the middle of a task ends the run early with an incomplete answer |

**Early termination is the real risk**

The lesson asks which choice is safer against early-termination bugs. The no-tool-call stop ends the run on the first prose turn. A model that writes a plan before it acts, or that comments on an observation without a next call, stops the loop too soon. An explicit finish cannot end early by accident, because ending needs a deliberate call.

**Why you need the budget anyway**

Neither stop helps when the model loops. A finish tool is never called by a model that keeps retrying. A no-tool-call stop never fires when every turn has a call. The turn budget is the stop that does not depend on what the model emits. In the harness contract the budget yields to the caller, and the caller decides whether to resume.

**A practical shape**

1. Register `finish` as a tool whose argument is the final answer.
2. Treat a turn with no tool call as a stop with reason `no_tool_call`, and return the prose as a draft answer, not a final one.
3. Cap turns per task class, and yield at the cap.
4. Record which stop fired in the result, so that the caller and the eval can tell them apart.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** A model returns prose and a tool call in the same turn. Which stop applies? Expected: none, because the turn has a tool call, so the loop dispatches it and continues.
- **Level 3:** Why does the result need the name of the stop that fired? Expected: an eval that counts a no-tool-call stop as success rewards early termination, so the reason must be visible to the scorer.
- **Level 3:** Reasoning now travels on a separate channel. Does that change the no-tool-call stop? Expected: yes, a turn with reasoning content and no visible text or tool call must not count as an answer, so the check must read the visible output.
- **Level 4:** How would you measure early termination across a task set? Expected: compare the stop reason with a gate that checks acceptance commands, and count the runs that stopped with no tool call while the acceptance commands never ran.

**Wrong answers, and why they fail**

- "Use only the finish tool, because it is explicit." A model that never calls it runs to the budget on every task that it cannot finish.
- "Use only the no-tool-call stop, because the model knows when it is done." A model that pauses to think in prose ends the run with half the work done.
- "The budget is enough on its own." The budget is the guard for a loop that never converges, and a run that waits for it wastes every turn after the real end.

**Related lesson in this course:** [Deep dive 7: how agents work, in depth](#aideep-7)

:::

## One turn cap for every task, what number do you give

*Level 2 (working) · estimate · about 8 minutes*

The product team wants a single maximum number of turns that applies to every run of your agent. The agent handles one-line edits, multi-file refactors, and unattended runs that drive a computer for hours. What number do you give them, and how do you defend it?

:::answer Show the answer
:::say Short answer
There is no single number, and the estimate shows why. Agents run 40 to 400 steps per task, and a computer-use task runs dozens to hundreds of steps as a normal case. A cap that fits a one-line edit stops every refactor, and a cap that fits an unattended run lets a stuck edit spend hundreds of turns. Give one cap per task class, set each from the trace distribution of successful runs in that class, and pair every cap with a wall-clock budget and a cost cap.
:::

**Full answer**

**Why one number fails**

| Task class | Normal length | Effect of one shared cap |
|---|---|---|
| One-line edit | A handful of turns | A high cap lets a stuck run burn hundreds of turns before anyone sees it |
| Multi-file refactor | Tens of turns | A low cap ends the run with half the files changed |
| Unattended computer use | Dozens to hundreds of steps | A low cap makes the mode unusable |

The lesson's rule is to pick a cap that fits the task class, not one size for all.

**How to set each cap**

1. Pull the traces for the class and read the turn counts of the runs that passed the gate.
2. Set the cap above the longest passing run with a margin, and below the point where the traces show repeated actions.
3. Treat the cap as a yield, not a kill. When the loop reaches it, the caller sees the partial state and decides whether to extend.
4. Review the caps when the traces move. A new model or a new tool changes the distribution.

**The other two budgets**

A turn cap alone misses two failure shapes. A run can spend few turns and a lot of wall-clock time, waiting on slow tools. A run can spend few turns and a lot of money, with long contexts on an expensive model. The unattended mode in the lesson ships a turn cap, a dollar cap that aborts the session, and action-count limits per tool. A 24-hour unattended run needs all three, plus an allowlist, and each number needs a written reason.

**What to tell the product team**

Give them a table, not a number: one row per task class with the turn cap, the wall-clock budget, the cost cap and the per-tool limits, and the trace data that each row came from. Offer one default for an unclassified task, set low, so that an unknown task yields early and a human decides.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** A run reaches the cap with the task almost done. What happens? Expected: the loop yields with a budget reason, the caller inspects the partial state, and the caller extends the budget or closes the session with a handoff.
- **Level 2:** Why should the fallback cap for a task with no class be small? Expected: an unknown task is the one most likely to loop, and an early yield costs a human decision while a late one costs hours.
- **Level 3:** How do you tell a long run from a stuck run before the cap? Expected: a repeat detector over the action and observation hashes, so that five near-identical actions in a row pause the run early.
- **Level 3:** The traces for a class show two clusters of turn counts. What does that tell you? Expected: the class is two classes, and each needs its own cap.

**Wrong answers, and why they fail**

- "Set it high so that no legitimate task is cut off." A high cap on a short task class lets a stuck run spend hundreds of turns, and the point of the cap is to catch the stuck run.
- "Set it low and let users retry." A low cap on a refactor ends every run with half the work, and a retry starts from zero.
- "The turn cap is enough, because turns are what cost money." Turns are one axis, and a run can be slow in time or expensive in tokens with few turns.

:::

## Pick the permission mode for the task in front of you

*Level 2 (working) · tradeoff · about 8 minutes*

A coding agent offers six permission modes, from one that asks before every action to one that approves everything. A colleague runs every task in the mode that approves everything, because the prompts are annoying. Give the rule you use to pick a mode, and say which tasks go where.

:::answer Show the answer
:::say Short answer
Pick the mode from the task, not from the annoyance. Start an unfamiliar or production-adjacent task in plan mode, where reading the plan is cheaper than undoing a bad run. Use the default mode for most interactive sessions, and the mode that auto-approves file writes for a known refactor across many files. Reserve the classifier-driven auto mode for unattended runs inside a workspace whose reach you have measured, and reserve the approve-everything mode for a disposable container.
:::

**Full answer**

**The ladder**

| Mode | Behavior | Fits |
|---|---|---|
| `plan` | The agent proposes a plan, and every action is reviewed before it runs | An unfamiliar task, code near production, the first run on a repo |
| `default` | Actions run, and the agent asks on anything risky such as shell, destructive operations or network | Most interactive sessions |
| `acceptEdits` | File writes are approved, and shell and network still ask | A refactor across many files |
| `auto` | A separate classifier model reviews each action and blocks escalation beyond the request | A long unattended run in a constrained workspace |
| `dontAsk` | Never prompts, and anything not pre-approved by a rule is denied | Ephemeral sandboxes, CI jobs |
| `bypassPermissions` | Approves everything | Only a container you are willing to throw away |

**What the classifier mode adds and misses**

The auto mode moves approval off the user's path. A separate model judges each proposed action against the declared task and the session state, and a blocked action falls back to the user. It catches plain prompt injection that maps to a known risky action shape, repeated tool loops where action N+1 looks like action N five times in a row, and shell commands that are out of place in a file-edit session. It misses subtle injection that changes behavior without one flagged action, and it misses a harmful trajectory made of individually safe actions, because it judges the action and does not re-derive the user's intent. Availability depends on plan, organization, model and provider, and the documentation is explicit that the classifier is a layer, not a solution.

**Budgets travel with the mode**

Whatever the mode, set the budget controls: a cap on turns, a dollar cap that aborts the session, and action-count limits per tool. In the unattended case, add an allowlist, an isolated workspace with no credentials and no production mounts, and a trajectory audit afterwards.

**The answer to the colleague**

The approve-everything mode is documented for a disposable container. On a laptop with credentials, a browser session and an open terminal, the attack surface is everything the agent can reach. The prompts are the control, and the fix for too many prompts is a mode one step up the ladder, not the top of it.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the refactor mode still ask on shell commands? Expected: a file write is reversible from version control, while a shell command can delete, send or install, so the mode approves the cheap-to-undo class only.
- **Level 2:** How does the never-prompt mode differ from the top of the ladder? Expected: the never-prompt mode denies anything that a rule did not pre-approve, while the approve-everything mode approves it.
- **Level 3:** An unattended run needs a 24-hour budget. What do you set? Expected: a turn cap, a dollar cap, per-tool action caps and an allowlist, each with a reason, inside a workspace with no credentials and no egress you did not opt into.
- **Level 3:** The classifier approved every action and the run still exfiltrated data. How? Expected: a sequence of allowed actions, such as writing data you own to a file and then pushing to a public repository, where the composition is the problem and no single action was flagged.

**Wrong answers, and why they fail**

- "Approve everything, because the agent is in version control anyway." Version control covers file writes, and the risk is in shell, network and credentials, which no commit reverts.
- "The classifier mode is safe for anything, because a model reviews each step." The classifier judges actions, not trajectories, and the documentation pairs it with budgets, allowlists and isolation.
- "Plan mode is for beginners." Plan mode is for the task where a wrong run costs more than a read, and that is a property of the task, not of the operator.

:::

## Read the loop, what the caller gets at the turn cap

*Level 2 (working) · code-reading · about 8 minutes*

Read this run method from the toy agent loop. A caller shows the returned string to the user as the answer. What is wrong with the contract, and how would you change it?

```python
def run(self, user_message: str) -> str:
    self.history.append(Turn(kind="user", content=user_message))
    for step in range(self.max_turns):
        reply = self.llm.respond(self.history)
        if reply["kind"] == "finish":
            self.history.append(Turn(kind="final", content=reply["content"]))
            return reply["content"]
        thought = reply.get("thought", "")
        self.history.append(Turn(kind="thought", content=thought))
        call = ToolCall(name=reply["action"], args=reply.get("args", {}))
        observation = self.tools.dispatch(call)
        self.history.append(Turn(kind="action", content=call.name, tool_call=call, observation=observation))
    self.history.append(Turn(kind="final", content="budget exhausted"))
    return "budget exhausted"
```

:::answer Show the answer
:::say Short answer
The method returns a plain string in both cases, so the caller cannot tell a real answer from a run that hit the cap. The text `budget exhausted` goes to the user as if the model said it. The fix is to return a typed result with a reason, or to yield control the way the harness contract does, so that the caller decides whether to extend the budget or stop.
:::

**Full answer**

**What the code does**

The loop runs at most `max_turns` iterations. Each iteration asks the model for one reply. A `finish` reply ends the run and returns its content. Any other reply is an action: the loop records the thought, dispatches the tool, and appends the observation. When the loop runs out of iterations, it appends a final turn with the text `budget exhausted` and returns that text.

**The three problems**

1. **One return type for two outcomes.** A finished run and a capped run both return `str`. The caller has no field to test. Any code that shows the result to the user shows the cap message as an answer.
2. **The cap is a dead end.** The partial state is in `self.history`, but nothing tells the caller that the run can continue. The harness contract treats the budget as a yield: it emits `budget.warn`, fires `on_budget_exceeded`, and returns a pull request with a reason. The caller inspects the state and calls `resume`.
3. **A reply with no action and no finish is a crash.** The code reads `reply["action"]` for every non-finish reply. A model that answers in prose without a tool call raises a `KeyError`. The lesson lists a turn with no tool calls as a normal stop condition.

**The change**

Return a small result object with the final text, a reason such as `finished`, `budget` or `no_tool_call`, and the turn count. Keep the history on the object so that the caller can resume or hand off. Treat a reply without an action as a stop, not as an error. Keep the budget as a cap on this call, and let the caller decide what to do after it.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Where is the observation formatter in this code? Expected: inside `tools.dispatch`, which returns an error string for an unknown tool, bad arguments, or an exception, so the model always gets a string back.
- **Level 2:** A tool raises an exception. What does the model see on the next turn? Expected: an observation that starts with `error:` and carries the exception type and text, which lets it correct the call.
- **Level 3:** How does the harness know which state to return to after a budget pause? Expected: it records the previous state before it pauses, resets the counters on resume, and re-enters executing or reflecting from that record.
- **Level 3:** What property of the harness makes a saved trace replayable without a model? Expected: the state machine is deterministic, so the same event log re-enters the same state.

**Wrong answers, and why they fail**

- "Return an empty string at the cap, and the caller will handle it." An empty string is still a string, and the caller still has no reason code to test.
- "Raise an exception at the cap." The partial history is useful, and an exception forces the caller to restart from zero instead of resuming.
- "Set the maximum turns high enough that the cap is never reached." The cap exists for the run that does not converge, and a high cap only makes that run longer.

**Related lesson in this course:** [Systems 6: timeouts, retries, backoff and jitter](#systems-6)

:::

## Read the registry, what the model gets back on a bad call

*Level 2 (working) · code-reading · about 10 minutes*

A tool is registered with this schema, and the model sends the four argument sets below. For each one, say what the registry returns and why the shape of the answer matters to the model.

```python
registry.register(
    name="db.get_user",
    schema={
        "type": "object",
        "required": ["id"],
        "properties": {
            "id": {"type": "integer"},
            "fields": {"type": "array", "items": {"type": "string", "enum": ["id", "name", "email"]}},
        },
    },
    handler=get_user,
)
cases = [
    {"id": 42, "fields": ["id", "name"]},
    {"id": "forty-two"},
    {"fields": ["id"]},
    {"id": 1, "fields": ["id", "phone"]},
]
```

:::answer Show the answer
:::say Short answer
The first case passes validation and returns an Ok result. The second returns one error at `/id` with keyword `type`, because a string is not an integer and the validator never coerces. The third returns one error at `/id` with keyword `required`, because the property is missing. The fourth returns one error at `/fields/1` with keyword `enum`, because `phone` is not an allowed value, and the path points at the exact element so the model can fix that one value in the next call.
:::

**Full answer**

**The walk**

The validator dispatches on `type`. For an object it checks `required` first, then walks each property that has a schema. For an array it walks each element with the `items` schema and appends the index to the path. A type mismatch stops the walk at that node and reports one error, so a wrong type does not produce a cascade of nested errors underneath it.

| Case | Result | Path | Keyword |
|---|---|---|---|
| `{"id": 42, "fields": ["id", "name"]}` | `Ok` | | |
| `{"id": "forty-two"}` | one error | `/id` | `type` |
| `{"fields": ["id"]}` | one error | `/id` | `required` |
| `{"id": 1, "fields": ["id", "phone"]}` | one error | `/fields/1` | `enum` |

**Why the path is the product**

The model reads a pointer better than a sentence. An error that says the email field expected a string, with the path `/user/email`, is fixed in one round trip. A prose message that says the arguments were invalid costs a turn of guessing. Paths follow the JSON pointer form: slash-separated property names and array indices, with `~` and `/` escaped inside a segment.

**What the validator refuses to do**

- It does not coerce. The string `"42"` fails an integer or number schema. A model that learns that strings are accepted sends strings everywhere.
- It does not call the handler. The schema is data and the handler is code, and mixing them puts validation inside handlers where it drifts.
- It is not a security boundary. A handler can misbehave after validation passes. The dispatcher adds timeouts and sandboxing. The registry adds shape.

**Registration hygiene**

`register` rejects a name that is already in the table unless the caller passes `override=True`. Two parts of a codebase registering the same name is a bug that takes a week to find in production, so the default is to raise.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The model sends `{"id": true}`. What happens? Expected: a type error at `/id`, because the validator treats a boolean as not an integer even though the language would accept it.
- **Level 2:** Why does a type mismatch stop the walk at that node? Expected: the children have no meaning when the parent is the wrong type, and one clear error beats a list of errors caused by the same mistake.
- **Level 3:** The schema uses `oneOf`. What does `register` do? Expected: it raises, because the registry supports eight keywords and rejects anything outside the subset at registration time.
- **Level 3:** The catalog passes fifty tools and schemas start to repeat. What two extensions do you add first? Expected: `$ref` against a local definitions block, and `additionalProperties: false` for a strict shape.

**Wrong answers, and why they fail**

- "Return one message that says invalid arguments and let the model retry." A retry without a path is a guess, and a path fixes the call in one round trip.
- "Coerce the string to a number, because the intent is clear." Coercion teaches the model that the schema is advice, and the next call sends a string where no coercion exists.
- "Validation makes the tool safe to call." Validation checks shape, and the handler can still misbehave, so timeouts and sandboxing belong in the dispatcher.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## The agent said the tests passed, and no test ran

*Level 2 (working) · debug · about 10 minutes*

A pull request from a coding agent says that the whole suite is green. A reviewer runs it and two tests fail. The transcript shows the agent writing "running tests now" and then "all tests pass", with nothing between the two lines. What happened, and what do you build so that this claim cannot reach a reviewer again?

:::answer Show the answer
:::say Short answer
The agent predicted the output instead of reading it. Either no command ran, or the command ran and nobody captured the result into the loop. The fix has two parts: a feedback runner that records every command with its exit code, and a verification gate that reads those records and refuses to mark the task done unless each acceptance command ran and exited zero.
:::

**Full answer**

**Three ways the claim appears**

1. **No command ran.** The model wrote the words it expected to write next. Nothing in the transcript shows argv, output or an exit code.
2. **The command ran, and the result never came back.** A runner that errors before it captures the exit leaves the model with nothing to read, and the model fills the gap.
3. **The result came back, and the failure line was cut.** A long output trimmed from the end loses the summary line where the failures are.

The transcript in this case has no record between the two sentences, so it is the first or the second.

**The feedback runner**

Every command goes through one wrapper. The record carries the exact argv, the tail of stdout and stderr as separate fields, the exit code, the duration, the start time, and a one-line note of what the agent expected. The runner truncates head and tail in a fixed way with a marker for the lines it removed, so the final error line survives. If the runner fails before it captures an exit, the record carries `exit_code: null` and an `error` field, and the loop must not advance on it. No exit, no progress.

**The verification gate**

The gate is a pure function over the artifacts. For this failure it checks three things from the feedback log: every acceptance command appears in the records, each one exited zero, and no record has a null exit. Each of those is a block-severity finding. A block prevents `passed: true`, and only a human can override it, with a reason and a user id in a signed log. The gate runs in CI and before the handoff. No green verdict, no pull request.

**Why the model is not the fix**

A prompt that says "always run the tests" asks the model to be honest about something it cannot see. The runner makes the result visible. The gate makes the claim checkable. Neither depends on the model.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the record keep stdout and stderr in separate fields? Expected: a test runner writes the failure summary to one stream and progress to the other, and a merged tail can hide the summary behind progress lines.
- **Level 2:** The agent runs the acceptance command, it fails, and a retry passes. What does the gate see? Expected: two records for the same command, linked by the parent command id. The gate blocks on the failed record and does not report `passed: true`, even though the retry exited zero. Only a signed human override gets past it, and the chain keeps the failure history visible.
- **Level 3:** Why must the gate be deterministic and not a model judge? Expected: the gate answers whether the task is complete, which must give the same verdict for the same artifacts every time, while a judge gives a qualitative opinion that belongs on the review side.
- **Level 4:** Where do you place the gate so that it cannot be bypassed? Expected: in layers, with a pre-commit hook, a CI status check, and a pre-merge gate, so that a failure in one layer is caught by the next.

**Wrong answers, and why they fail**

- "Tell the agent to paste the test output into the transcript." The model can paste what it expects, and a reviewer cannot tell a paste from a capture.
- "Trust the agent and let CI catch it." CI did catch it, after the claim reached a reviewer, and the point is to stop the claim at the source.
- "Treat a timeout as a pass, because the tests were slow." A timeout gives a null exit, and the loop must refuse to advance on a null exit.

:::
