---
track: aibank
title: "AI interview bank: Prompting and structured output (part 2 of 2)"
short: Prompting and structur 2
sub: 9 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Design an extraction service for purchase-order emails

*Level 3 (senior) · design · about 20 minutes*

Design the extraction service for purchase-order emails. The input is free text; the output is a typed record with a customer, line items and a total. Cover the schema, the enforcement mode, the retry and refusal handling, and how you prove it works before it touches the accounting system.

:::answer Show the answer
:::say Short answer
Write one JSON Schema 2020-12 with the constraints that matter: required fields, enums for closed sets, a minimum of zero on the total, additional properties forbidden, and any reasoning field ahead of any decision field. Run it in the provider's strict schema mode so that a response that finishes cannot have a parse error or a schema violation, check the stop reason so that a response cut at the token limit goes to the error path, and treat a refusal as a typed outcome that goes to a review queue. Prove it with a labeled set of real emails scored per field, a refusal check on inputs that must not extract, and a run beside the human process before any record is written.
:::

**Full answer**

**The schema**

- `type`, `properties` and `required` for the shape; every property listed as required, with null allowed where the source can lack a value.
- `enum` for closed sets such as currency or status; `minimum` on the total; `pattern`, `minLength` and `maxLength` on identifiers; `items` for the line items.
- `additionalProperties: false` everywhere, which blocks invented fields and which strict mode demands.
- Field order as logic: any `reasoning` field before `total` or `status`, because the model commits to the first field it writes.

In Python, a Pydantic model generates this schema; the service keeps the schema as the contract and the model as its binding.

**The enforcement mode**

| Situation | Pick |
|---|---|
| A hosted frontier model, a flat schema | the provider's strict schema mode |
| Several providers, retries acceptable | a retry library over the Pydantic model, which is portable and does not touch logits |
| A local model, validity required | a grammar engine, finite state for a flat schema and context-free for a recursive one |

Strict mode is the default here: a finished output parses and validates by construction. Two failures remain: the refusal, and a response cut at the token limit, which can still fail to parse. Check the stop reason before you read the output, and send an incomplete response to the error path.

**Retry and refusal**

Outside strict mode: generate, parse, validate, inject the typed errors and retry, at most three times. More than three means the schema or the prompt is wrong for some inputs. In every mode: a refusal is a first-class outcome with a reason attached. Log it, return it typed, send it to the review queue, and never retry it, because forcing a record on an input that does not fit produces an invented record.

**Proof before accounting sees a record**

1. **A labeled set** of real emails with gold records; the structured outputs lesson uses 50 documents. Report exact match, accuracy per field and type compliance.
2. **A refusal check.** Construct inputs that must not extract, such as a lyric, a proof or a blank email, and count refusals against invented outputs.
3. **A confidence per field** from repeated extraction or token probabilities, with low-confidence records routed to a human.
4. **A schema version** on every record, and a schema diff that separates breaking changes from non-breaking ones before any deploy.
5. **A side-by-side run** against the human process on the labeled set, with the service writing nothing until the field-level numbers clear the bar you set with finance.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why forbid additional properties? Expected: it blocks invented fields, and strict mode requires it everywhere.
- **Level 3:** You expect to switch providers next year. Which mode do you pick? Expected: a retry library over the Pydantic model for portability, or keep the schema identical across providers so each strict mode receives the same contract.
- **Level 4:** How do you version the schema once records exist? Expected: a version field on each record and a schema diff that separates breaking changes from non-breaking ones. Strict mode makes every field required, so an added field is breaking too, because the records written before it do not contain it; removed fields and changed types are breaking, and relaxed constraints are not.
- **Level 4:** Which failure can this design not remove, and where does it go? Expected: a wrong value with the right type; it goes to the field-level eval and the confidence flags, and the low-confidence records go to review.

**Wrong answers, and why they fail**

- "Prompt for JSON and parse it, the model is good." That works 85 to 95 percent of the time and fails six different ways; accounting needs the contract.
- "Retry refusals until the model gives a record." A refusal says the input does not fit; forcing a record invents one.
- "Validation after generation is as good as strict mode." It is reliable but pays for every retry, and a truncated output costs a turn each time.

:::

## Design the executor behind an agent's tool calls

*Level 3 (senior) · design · about 15 minutes*

Design the execution layer for an agent that can query a database, run small code snippets and read files on behalf of a user. The model decides which tool to call. What rules does the executor enforce, and what does it never do?

:::answer Show the answer
:::say Short answer
The executor never passes model-generated SQL or shell text straight to a system. It exposes an allowlist of named functions with typed parameters, validates every argument against the schema before execution, sanitizes tool results before they return to the model, and caps the number of calls per conversation at 10 to 20. For code, an in-process filter is a teaching aid and not a boundary; untrusted code runs in a separate process or container.
:::

**Full answer**

**The five rules**

1. **Never pass generated SQL to the database.** The model can and will produce destructive statements and injections. The lesson's exercise shapes the tool to accept a table name and filter conditions, with the tables on an allowlist and the operators restricted to a small set; your code builds the query.
2. **Allowlist the functions.** The model calls only what you define. If fifty internal functions exist, expose the five the user needs. Never build a generic call-by-name tool.
3. **Validate the arguments.** Check required fields, unknown fields, types and enum membership against the schema before execution; a city name can carry an injection string.
4. **Sanitize the results.** A tool result goes back into the prompt verbatim, so strip keys, personal data and internal errors, and treat instructions inside a result as tool poisoning.
5. **Cap the calls.** A loop can call a tool hundreds of times; 10 to 20 calls per conversation is the lesson's range, with a bounded retry count per failing call.

**The file tool**

Reject any path with a parent reference or a leading slash, and return a structured error with the list of files that exist. The error shape matters: a message, a code and suggestions let the model correct its arguments; an empty response or a generic failure does not.

**The code tool**

A substring blocklist reads the code as text and misses anything it does not literally spell. Parsing the code into a syntax tree lets the guard reject imports, dunder attribute access and unsafe names by structure. Even then, the guard shares the interpreter with the code it runs, and a determined caller finds reachable objects. Production runs untrusted code in a separate process with dropped privileges, in a sandbox or in a hosted runner, so an escape lands in a throwaway box.

**What the model never does**

It never executes anything. It emits a name and arguments. Everything after that is your code, and every rule above lives there.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a substring blocklist not enough for the code tool? Expected: it matches spelling, not structure; a parsed syntax tree rejects imports, dunder access and unsafe names by shape, and even that shares the interpreter with the code.
- **Level 3:** How do you shape the database tool so the model never writes SQL? Expected: accept a table name and filter conditions, allowlist the tables, restrict the operators, and build the query in your code.
- **Level 4:** What is tool poisoning and where is the control? Expected: results that carry instructions to the model; sanitize every result before it returns, and strip sensitive data such as keys and internal errors.
- **Level 4:** The agent loops on a failing tool. What stops it? Expected: a maximum number of calls per conversation, 10 to 20 in the lesson, structured errors that let the model fix its arguments, and a retry cap of about 3 per call.

**Wrong answers, and why they fail**

- "The model behaves, parameterize later." The model can and will generate destructive queries or injections; the rule is never to pass its SQL through.
- "A generic run-any-function tool is simpler." The allowlist is the rule: expose the five functions the user needs, not all fifty.
- "The code filter blocks imports, so it is safe." It shares the interpreter with the code it runs; production uses a separate process or container.

:::

## Move memory consolidation off the critical path

*Level 3 (senior) · tradeoff · about 10 minutes*

An assistant's tail latency climbs because every turn also prunes, summarizes and reconciles its memory before it replies. A proposal moves that work to a second agent that runs while the user is idle. What does the split buy, what does it cost, and what new failure does it create?

:::answer Show the answer
:::say Short answer
The split takes the memory work off the critical path, so a reply never waits on consolidation, and the background agent can be a slower and stronger model because nobody is waiting on it. It costs a second agent, a shared block store and the coordination around them. The new failure is silent drift: the background agent rewrites a block and the primary agent never notices, so version the blocks, surface diffs in the trace, and treat the background writer as untrusted when it touches the persona or the safety block.
:::

**Full answer**

**What the primary agent keeps**

Three tiers. Core memory is always in the prompt and is made of typed blocks, each with an id, a label, a value, a character limit and a description that tells the model when to edit it: a human block, a persona block, and user-defined blocks such as a task or a safety block. Recall is the conversation history. Archival is the external store. The primary agent serves turns and makes raw writes through `block_append`, `block_replace`, `block_read` and `block_summarize`.

**What the background agent does**

It reads transcripts and context while the user is idle, writes learned context into shared blocks, deduplicates and summarizes, and invalidates contradicted facts. Three properties follow: no latency cost on the reply, a stronger model becomes affordable, and consolidation gets a natural window when nobody is waiting.

**The three failures and their guards**

| Failure | Guard |
|---|---|
| Block bloat: appends hit the character limit | run the summarizer before the write that would pass the cap |
| Silent drift: a block changes and the primary agent never notices | version blocks, record old value and diff on every write, expose a history per block |
| Poisoned consolidation: content an attacker can reach lands in core | treat the background agent as an untrusted writer; a change to the persona or the safety block needs a second-agent review before it commits |

**Keep the heavy work in the sleep pass**

Deduplication of records whose text overlaps by more than 90 percent belongs in the background pass and never on the critical path; the lesson's exercise is explicit about that.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why can the background agent use a more expensive model? Expected: it is not latency constrained, so a slower and stronger model is affordable.
- **Level 3:** A block keeps growing toward its limit. What runs, and when? Expected: the block summarizer, before the write that would push the block over the cap; the trigger threshold trades summarization calls against overflow.
- **Level 4:** How do you make a background rewrite visible? Expected: version every block, record the old value and a diff on each write, and expose a per-block history so an operator can see why the agent forgot something.
- **Level 4:** The background agent reads attacker-reachable content. What is the control? Expected: treat it as an untrusted writer; a change to the persona or the safety block needs a second-agent review before it commits.

**Wrong answers, and why they fail**

- "Run the consolidation at the end of every turn, it is quick." It sits on the critical path and tail latency is the complaint; the point of the split is that the reply never waits.
- "Use the cheapest model for the background agent to save money." It is the one place a stronger model is affordable, and its rewrites shape every later turn.
- "Deduplicate on the critical path too, it is the same code." The lesson runs deduplication only in the sleep pass, never while the user waits.

:::

## Pick the cache lifetime for a batch of code reviews

*Level 3 (senior) · estimate · about 10 minutes*

Your batch job sends the same 15,000-token rubric with each of twenty code reviews, spread over 40 minutes in uneven clusters, and some of the quiet stretches between clusters outlast the short cache. The provider bills a write at 1.25 times the input rate for a five-minute cache and at 2 times the input rate for a one-hour cache, and bills reads at one tenth of the input rate. Which cache do you pick, and show the break-even.

:::answer Show the answer
:::say Short answer
The five-minute cache pays for itself on the first read: a write costs 1.25 times and a read 0.1 times the normal input rate, so one write plus one read averages 0.675 times, a saving of 32 percent, and one write plus ten reads averages 0.205 times, a saving of 80 percent. Each read refreshes the five-minute lifetime, so the five-minute cache expires only in a gap longer than five minutes. This batch has such gaps, so the one-hour cache fits; its write costs 2 times the input rate and it needs only two reads to come out ahead, and twenty reviews give far more. The rule of thumb is to cache anything reused at least three times within the lifetime.
:::

**Full answer**

**The arithmetic**

| Case | Cost per request against uncached |
|---|---|
| One write, five-minute cache | 1.25 |
| One read | 0.1 |
| One write plus one read, averaged | 0.675, a saving of 32 percent |
| One write plus ten reads, averaged | 0.205, a saving of 80 percent |
| One write, one-hour cache | 2, so two reads to break even |

**The lifetime decides it**

Each read refreshes the five-minute lifetime. If the reviews arrive steadily over 40 minutes, every gap stays inside five minutes, the entry never expires, and the five-minute cache wins with its cheaper write. If some gaps exceed five minutes, as in this batch, each of those gaps costs a new write at the premium, and the one-hour cache holds the whole batch for one write. If instead the reviews come as a burst of a few inside one minute followed by an idle hour, each burst fits the five-minute cache and the cheaper write wins. Pick from the gaps between requests, not from the total count.

**Prove it on the response**

Read the usage fields: the lesson's first request reports 15,023 tokens written at 1.25 times, and the second reports the same count read at 0.1 times with zero written. In production, gate the deploy on a read fraction above 80 percent after warmup, and split the cost dashboard into cached and uncached tokens.

**Other provider shapes**

The automatic provider gives 50 percent off reads with no premium, up to an hour on a best-effort basis, so the only job is a stable prefix. The explicit cache object on the third provider is storage-billed and reads at about 25 percent of the input rate; it fits reuse of one giant prompt across days.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the five-minute cache break even on the first read? Expected: the write costs 1.25 times and the read 0.1 times, so two requests average 0.675 times the uncached cost.
- **Level 3:** What does the one-hour cache need to come out ahead? Expected: two reads, because its write costs 2 times the input rate.
- **Level 4:** The reviews arrive in bursts of several within a minute, then nothing for an hour. Does the answer change? Expected: yes; each burst lives inside a five-minute cache, so the cheaper write wins, and the one-hour cache would pay the 2 times write for reuse that never comes.
- **Level 4:** How do you verify the saving in production rather than on paper? Expected: read the cache creation and cache read token fields on each response, gate the deploy on a read fraction above 80 percent after warmup, and split the dashboard into cached and uncached tokens.

**Wrong answers, and why they fail**

- "Always pick the longer cache to be safe." Its write costs 2 times the input rate against 1.25; with reuse inside five minutes the shorter cache is cheaper.
- "The write premium makes caching a loss for short jobs." One write plus one read already saves 32 percent on the five-minute cache.
- "Cache the user message too." It differs on every request, so it never hits; the layout leaves it below the breakpoint.

:::

## What fifty tool definitions cost on every call

*Level 3 (senior) · estimate · about 9 minutes*

A coding assistant exposes 50 tools, each defined with a name, a description and a parameter schema. Estimate what the tool definitions cost on every call, and say how you would cut that cost without removing a single tool from the product.

:::answer Show the answer
:::say Short answer
Each definition costs 50 to 200 tokens, so 50 tools at 150 tokens each is 7,500 tokens before the conversation begins, repeated on every call. Classify the intent of the query and include only the tools that match it; the lesson puts the reduction at 60 to 80 percent, from about 8,000 tokens down to about 1,000. The product keeps every tool; only the per-call definition list changes.
:::

**Full answer**

**The count in context**

The lesson's breakdown for a coding assistant: system prompt 500 tokens, tool definitions for 50 tools 8,000, retrieved documentation 4,000, history for ten turns 6,000, the query 200, and a generation budget of 4,000, for a total of 22,700 tokens. The tool block is the largest item, and unlike the history it does not depend on how long the conversation has been.

**Why it repeats**

Definitions live in the context, so a 50-turn conversation pays the full block 50 times. Every token of it also displaces a token that could carry signal, which is the context engineering point: the window is a scarce resource, not a dump.

**Pruning without removing**

1. Classify the intent of the query. The lesson does it with keyword lists per intent: code, calendar, email, research, data.
2. Tag each tool with the categories it serves.
3. Include tools whose categories match the intents, in order, until a token budget is reached; the lesson's selector stops at 2,000 tokens.
4. A code question never sees the calendar tools, and a scheduling question never sees the file system tools.

**Check the cost of being wrong**

Pruning risks leaving out a tool that the classifier did not predict. The lesson's exercise measures task success with 5, 10, 20 and 50 tools included and compares the curves; a priority score per tool, filled in descending order until the budget is spent, is the refinement over a binary include or exclude.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the cost repeat? Expected: definitions sit in the context on every call, so a 50-turn conversation pays the full block 50 times.
- **Level 3:** How does the lesson choose which tools to send? Expected: keyword intent classification over the query, then the tools whose categories match, added until a 2,000 token budget is reached.
- **Level 4:** What does pruning risk, and how do you check it? Expected: a needed tool left out for a misread query; measure task success with 5, 10, 20 and 50 tools included and watch the misses per intent.
- **Level 4:** How do the 7,500 tokens compare with the rest of the lesson's breakdown? Expected: the breakdown totals 22,700 tokens, and the tool block at about 8,000 is the largest item, ahead of history at 6,000 and retrieved text at 4,000.

**Wrong answers, and why they fail**

- "Tokens are cheap, send all 50." It is the largest block in the lesson's breakdown and it repeats on every call; it also displaces context that carries signal.
- "Shorten every description to one word." Then the model cannot tell the tools apart; prune by relevance and keep each description precise.
- "Remove the rarely used tools from the product." The product need not change; the per-call definition list does.

:::

## Zero validation errors and wrong invoice totals

*Level 3 (senior) · debug · about 10 minutes*

An extraction pipeline with strict schema enforcement has reported zero validation errors for a month. A finance review finds that a share of the extracted invoice totals do not match the source documents, and that a status field often holds a value that is allowed by the enum and wrong for the document. The engineers say the schema guarantees correctness. What do you tell them, and what do you build?

:::answer Show the answer
:::say Short answer
Schema enforcement guarantees shape, not truth. A total with the right type and the wrong number passes every format check, and an enum member can be allowed and still be the wrong one. Build a semantic eval: a labeled set of documents with gold records, exact match and field-level accuracy per field, plus a confidence signal from repeated extraction or token probabilities that sends low-confidence fields to human review.
:::

**Full answer**

**The failures a schema cannot see**

The structured outputs lesson lists them even with enforcement on:

| Failure | Example | Why the schema passes it |
|---|---|---|
| Invented value | the text says one amount and the record holds another | right type, wrong content |
| Enum confusion | the model picks an allowed member that does not fit the document | the member is in the set |
| Array length | too many or too few line items | not every provider enforces the item bounds at decode time |
| Optional omission | a field left out when it was inconvenient | optional means allowed to be absent |

The constrained decoding lesson adds two causes that make the values worse: a grammar too strict for missing data, which pushes the model to invent, and a decision field placed before the reasoning.

**What to build**

1. **A labeled set.** The lesson's exercise uses 50 documents with hand-labeled records. Label real invoices, including the hard cases.
2. **Field-level metrics.** Exact match on the record, accuracy per field, and type compliance as a sanity row that should sit near 100 percent.
3. **A confidence per field.** Run the extraction three times and measure agreement, or read the token probabilities, and flag the fields that disagree.
4. **A review queue.** Low-confidence records go to a human before they reach accounting.
5. **Schema repairs.** Put a reasoning field ahead of the status, give enum members descriptions that make their meaning explicit, and add a null or an "other" member if the source has cases that none of the members fit.

**Why size does not fix it**

The structured output lesson notes that grammar enforcement lets a small model beat a much larger one on structured tasks, because the format is decoupled from the model size. The values are not. Only a labeled eval tells you how often they are right.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which failure can a schema never see? Expected: a value with the right type and the wrong content, such as a total copied from the wrong line.
- **Level 3:** How do you get a confidence per field without a new model? Expected: run the extraction three times and measure agreement, or read token probabilities, and flag fields that disagree for review.
- **Level 4:** The status enum has a member the model keeps picking wrongly. What are the candidate fixes? Expected: describe the members so their meaning is explicit, put a reasoning field before the status, and check whether the source has cases no member fits, which calls for a null or an "other" member.
- **Level 4:** What does the finished eval report look like? Expected: schema compliance near 100 percent as a sanity row, then exact match and field-level accuracy per field on the labeled set, with the hardest fields named.

**Wrong answers, and why they fail**

- "Zero validation errors means zero extraction errors." Validation checks shape; the review found value errors that no shape check can see.
- "Switch to a bigger model and the values will be right." Size changes the error rate, not the blind spot; without a labeled eval you cannot tell by how much.
- "Add a tighter pattern to the total field." A tighter grammar does not make the number true; a grammar too strict even pushes the model to invent one.

:::

## Make each reasoning stage earn its cost

*Level 4 (staff) · tradeoff · about 15 minutes*

A team runs every question through the full escalation pipeline from the lesson: one deterministic chain, then five sampled chains with a vote, then a tree search when the vote is weak. Latency and cost are now the top complaint. As the staff engineer, how do you restructure the pipeline, and what do you measure to defend the new shape?

:::answer Show the answer
:::say Short answer
Make the pipeline earn each stage. Most questions should end at the cheap stage, so start the vote at the minimum of three samples and widen it only on disagreement, and reserve the tree search, which costs up to 39 calls at a branching factor of 3 and a depth of 3, for the questions where the vote fails. Measure accuracy against cost per question for each stage on a held-out set, and report the share of questions that each stage resolves.
:::

**Full answer**

**What the lesson's pipeline does**

The deterministic chain runs once. The vote runs five samples at temperature 0.7 and accepts when 4 of 5 agree, a confidence of 0.8, and the majority matches the deterministic answer. Anything else goes to the tree search, where every node is a model call.

**Where the money goes**

| Stage | Calls | Token overhead |
|---|---|---|
| One few-shot chain | 1 | 300 to 600 tokens |
| Vote over five chains | 5 | five times the tokens |
| Tree search | 10 to 40 or more | 10 to 40 times the tokens |
| A reasoning model | 1 | hidden, 2 to 10 times internal |

Run on every question, the vote alone multiplies the bill by five, and the tree search is unbounded in the tail.

**The restructure**

1. **Route by task first.** Simple recall and single-step classification get a single zero-shot call; the chain and the vote are for multi-step problems.
2. **Vote small, widen on doubt.** Three samples is the minimum for a meaningful vote and five captures most of the benefit; start at three and add samples only when the three disagree.
3. **Cap the tree.** Keep it for problems with a large but evaluatable search space, set a call budget per question, and report how often the budget is hit.
4. **Test a reasoning model as a drop-in.** It runs the chain internally and subsumes the vote on many tasks; its hidden cost belongs on the same curve as the other stages.

**What defends it**

- The accuracy against total tokens curve from a sweep of N over 1, 3, 5, 7 and 10 on a held-out set, with the knee marked.
- The share of questions resolved at each stage, and the accuracy of each stage on the questions it resolved.
- The share of questions that only the tree search gets right, against its share of the bill.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does the tree search cost at the lesson's defaults? Expected: each node is a model call, so a branching factor of 3 and a depth of 3 means up to 39 calls.
- **Level 4:** Where does a reasoning model fit in the new shape? Expected: as a drop-in for the chain and the vote on many tasks, one call with hidden internal reasoning at 2 to 10 times the tokens, compared on the same accuracy against cost curve.
- **Level 4:** How do you pick the vote size? Expected: sweep N over 1, 3, 5, 7 and 10 on a held-out set and plot accuracy against total tokens; the lesson puts the knee near 5 and the minimum meaningful vote at 3.
- **Level 4:** Which one number justifies keeping the tree search at all? Expected: the share of questions that only the tree search gets right, against its share of the bill; if that share is near zero, cut the stage.

**Wrong answers, and why they fail**

- "Run the tree search on everything for the best accuracy." It costs 10 to 40 or more calls per question, and the lesson keeps it for large, evaluatable search spaces.
- "Drop the vote and keep one chain at temperature zero." One chain is cheap but carries no confidence signal; the vote share is what tells you when to stop or escalate.
- "Set the confidence gate to 1.0 to be safe." Then any single disagreement triggers the tree search; the lesson accepts 4 of 5.

**Related lesson in this course:** [Deep dive 8: patterns for effective agents](#aideep-8)

:::

## Review a state write that can corrupt the next session

*Level 4 (staff) · code-reading · about 12 minutes*

An agent workbench persists its state between sessions with this code. Review it. What can go wrong, what does the lesson's writer do instead, and what else belongs around the write?

```python
def save_state(path, state):
    try:
        path.write_text(json.dumps(state))
    except Exception:
        return
```

:::answer Show the answer
:::say Short answer
Two faults. A crash in the middle of the write leaves a truncated file that the next session loads as corrupt state, and the silent except hides it, so the agent resumes against garbage with no signal. The lesson's writer creates a temp file in the same directory, writes, syncs to disk and renames over the target, so the file on disk is either the old version or the new one. Around it belong a schema check that refuses a bad state before it is written, a version field with a migration path, and idempotency keys for tool calls that are not safe to repeat.
:::

**Full answer**

**The two bugs**

The lesson points at a bug report from an open-source project in March 2026 with this exact shape: the state file was written with a plain text write and exceptions were caught and silenced. Partial writes left sessions resuming against corrupt state with no signal. The first bug is the non-atomic write. The second is the except clause that turns a loud failure into a quiet one.

**The atomic writer**

1. Create a temp file with `tempfile.mkstemp` beside the target, inside its directory.
2. Write the content.
3. `fsync` so the bytes reach the disk.
4. `os.replace` the temp file over the target, which is an atomic rename on POSIX and on Windows.

A reader sees the old file or the new file, never a mix.

**Schema first**

The state file carries a contract: required keys, an enum of allowed status values, forbidden values such as null for an array, a pattern for task ids, and a `schema_version` integer. The manager validates before it writes, so a bad write is a refused write, and it refuses to load a file at a version it cannot migrate. A migration script ships with every schema bump and runs idempotently on startup.

**Around the write**

- **Idempotency keys.** If a crash lands between a tool call and its checkpoint, recovery retries the call. Fine for a read; dangerous for an email or a database insert. Log a started record with the call id before execution and a completed record with the result after it. On retry, a call with a completed record is skipped and its stored result is used. A call with only a started record may or may not have run, so reconcile it first, for example by asking the target system whether that idempotency key was applied, before you repeat or skip it.
- **Small state, separate artifacts.** Transcripts, generated files and data sets live in their own files or in object storage; the state holds only the paths.
- **Event log plus snapshot.** Append every mutation to an event log and snapshot the state on a schedule; resume reads the snapshot and replays later events, which also lets you replay agent decisions when debugging.

**What belongs in the file**

The active task id, the files touched this session, the assumptions made, open blockers and the next action. Not raw transcripts, reasoning traces, sampled completions or vendor model ids. The test is whether the entry would be useful three months from now in a CI rerun.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the temp file live in the same directory as the target? Expected: so the final step is a rename on the same filesystem and stays atomic; the lesson's recipe is a temp file beside the target, write, sync, replace.
- **Level 4:** An agent crashes after a tool call and before the checkpoint. What goes wrong on recovery, and what fixes it? Expected: the call is retried, which is dangerous for an email or an insert; log a started record with the call id before execution and a completed record with the result after it; reuse the result of a completed call, and reconcile a call that has only a started record before you repeat it.
- **Level 4:** Two agents write the same state file within 50 ms. What does the atomic rename save, and what does it not? Expected: it prevents a torn file, so each reader sees one complete version; it does not stop the second write from replacing the first, which needs coordination between the writers.
- **Level 4:** What belongs in the state file and what does not? Expected: the active task, touched files, assumptions, blockers and the next action; not transcripts, reasoning traces, completions or vendor model ids, and large artifacts only by path.

**Wrong answers, and why they fail**

- "Catch the exception and keep going, the next write will fix it." The silent except is the second bug; it hides a truncated file that the next session loads.
- "Write to a temp file, then copy it over the target." A copy can be interrupted too; the atomic step is the rename.
- "Store the full transcript in the state so nothing is lost." Transcripts are telemetry, not durable state; keep the file small and keep artifacts in separate files with only their paths in state.

**Related lesson in this course:** [Agentic coding: verification, context and workflow (Claude Code practices)](#aifield-6)

:::

## Tune a three-store memory for three products

*Level 4 (staff) · design · about 15 minutes*

You own the memory layer for three products on one platform: a consumer chat assistant, a compliance review agent and a research retrieval agent. The memory system runs a vector store, a key-value store and a graph store in parallel and fuses their results. How do you configure the fusion for each product, and which one scoping mistake would get you paged?

:::answer Show the answer
:::say Short answer
The fused score is a weighted sum of relevance, importance and recency, and the weights are tuned per product: recency up for the chat assistant, importance up for the compliance agent, relevance up for the retrieval agent. Each store wins a query class the others miss, so the weights steer which class dominates without dropping a store. The paging mistake is a scope leak: every write picks the user, the session or the agent scope, and a retrieval that mixes scopes without per-scope weights tells one user about another user's project.
:::

**Full answer**

**Why three stores**

| Query class | Example | Winner |
|---|---|---|
| Semantic similarity | what did we discuss about drift last week | vector |
| Fact lookup | the user's phone number | key-value, keyed on user, fact type and entity |
| Relationship reasoning | which customers share a billing entity | graph, as typed edges |

A single store is wrong for two of the three classes. A write extracts facts from the text and writes each one to all three stores; a search runs all three and fuses.

**The fusion**

The score is `w_relevance * relevance + w_importance * importance + w_recency * recency`. Relevance is the cosine, the exact key match or the graph path weight. Importance is tagged at write time or learned. Recency decays with time since the last write or read. It is a weighted sum and not a hierarchy, because a hierarchy would make two of the three classes wait on the wrong store.

| Product | Weight to raise | Why |
|---|---|---|
| Chat assistant | recency | the last few turns matter most |
| Compliance agent | importance | names, ids and policies outrank chatter |
| Retrieval agent | relevance | the question decides, not the clock |

**Temporal truth for compliance**

When a new fact contradicts a graph edge, the old edge is marked invalid and never deleted. A question about what was true in March traverses the edges valid at that time. The compliance agent depends on this.

**The scope rule**

Each write picks one scope: user memory persists across sessions, session memory lives in one thread, agent memory is per instance. Retrieval can read across scopes with per-scope weights, but a search that mixes them without thought is how an assistant tells one user about another user's project.

**Maintenance that scales with the corpus**

- Vector results drift as the corpus grows; re-embed the most used records on a schedule.
- The key-value type set creeps as teams add types; audit it quarterly.
- A noisy extractor adds dozens of edges per message; cap graph writes per add and drop low-confidence edges.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which query class does each store win? Expected: vector for semantic similarity, key-value for a fact lookup, graph for relationship reasoning.
- **Level 4:** Why a weighted sum and not vector first with fallbacks? Expected: each store wins a different class; a hierarchy makes two of three classes wait on the wrong store.
- **Level 4:** The compliance agent asks what was true in March. Which store answers, and how? Expected: the graph, by traversing the edges valid at that time; contradicted edges are marked invalid and kept.
- **Level 4:** Which failure grows with the corpus, and what is the maintenance? Expected: embedding drift in the vector store; re-embed the most used records periodically, audit the key-value type set quarterly, and cap graph writes per add.

**Wrong answers, and why they fail**

- "One vector store is enough, embeddings capture everything." A fact lookup is wasteful on a vector store and a relationship query is impossible on one.
- "Set the weights once for the platform." Chat wants recency, compliance wants importance, retrieval wants relevance; one setting is wrong for two of the three.
- "Delete the old fact when a new one contradicts it." Mark it invalid and keep it, or the temporal query loses its history.

**Related lesson in this course:** [Generative agents: a memory stream with retrieval and reflection](#aifield-4)

:::
