---
track: aibank
title: "AI interview bank: Multi-agent systems (part 1 of 2)"
short: Multi-agent systems 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Read any multi-agent framework in one paragraph

*Level 1 (screening) · concept · about 6 minutes*

A new multi-agent framework ships every few months, each with its own vocabulary. Give the method you use to understand a new one quickly, and name the part of every such system where the hard bugs live.

:::answer Show the answer
:::say Short answer
Map the framework onto four primitives: the agent, the handoff, the shared state and the orchestrator. Every framework picks a default on each axis, and the rest is surface syntax. The agent is a system prompt plus tools and is stateless, the handoff is a structured transfer of control, the orchestrator decides who runs next, and the shared state is the only stateful part of the system. That is where the difficult bugs sit: memory poisoning, message ordering, versioning and write contention.
:::

**Full answer**

**The four axes**

| Primitive | Definition | Common implementations |
|---|---|---|
| Agent | A system prompt, a tool list and a model, with no memory of its own | Interchangeable with any agent that has the same prompt and tools |
| Handoff | A structured transfer of control from one agent to another | A tool that returns the next agent, a graph edge with a condition, or a speaker-selection function |
| Shared state | Any data that more than one agent reads, and sometimes writes | A full message pool, a topic-keyed blackboard, a typed state with reducers, external memory |
| Orchestrator | Whoever decides who speaks next | A static graph, a model that picks the speaker, the current agent's handoff call, or a scheduler over a queue |

**Three questions answer most of it**

1. Does the orchestrator trust the model to route, or does code pin the route?
2. Is the shared state the full history, or a projected view per role?
3. Can agents change each other's prompts, or only hand off?

The lesson claims these three answer about 80 percent of which framework fits a problem. You stop shopping for the best framework and start designing for the axis you care about.

**The stateless insight**

The agent is a function of its prompt and tools. The handoff is a function call. The orchestrator is a scheduler. Only the shared state carries anything from one step to the next, so every interesting bug is a shared-state bug. A framework that hides the state pushes the problem to the caller. A framework that centralizes it makes the state inspectable and moves the coordination cost into the state implementation.

**What is not a primitive**

Durable checkpointing, human approval of a handoff, per-agent token budgets and tracing are all built on top of the four. They are design decisions, not new axes. If a framework claims a fifth primitive, check whether it is a flavor of shared state you have not seen.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Two agents have the same prompt and the same tools. How do they differ? Expected: they do not, because everything that looks like per-agent state is in the shared state or the handoff.
- **Level 2:** Name the three ways a handoff is implemented. Expected: a tool that returns the next agent, a graph edge selected by a condition, and a selector function that picks the next speaker from a pool.
- **Level 2:** Full pool or projected state, which scales further and what does it cost? Expected: projected state scales further, and it costs an up-front schema so that each role's view is defined.
- **Level 3:** Before adopting a framework, what do you write first? Expected: its four-primitive mapping, and if you cannot write it, the docs are incomplete or the framework is inventing a primitive.

**Wrong answers, and why they fail**

- "Each framework has its own architecture, so learn them one at a time." The architectures are points in one four-axis space, and learning the axes once reads every release.
- "The agents hold the memory." The agent is stateless by definition, and memory lives in the shared state or in the handoff payload.
- "The orchestrator is the smart part, so pick the framework with the best one." The orchestrator is a scheduler with four flavors, and the choice depends on how much you trust the model to route.

**Related lesson in this course:** [Agent guides compared: Anthropic, OpenAI and Google](#aifield-8)

:::

## Where one agent stops working, and why

*Level 1 (screening) · concept · about 6 minutes*

Your single agent does well on small tasks. Pointed at a codebase of 200 files in three languages, with tests that need infrastructure and an external API to research first, it stops making progress. The team proposes a model with a bigger window. What is the ceiling it hit, and would a bigger window remove it?

:::answer Show the answer
:::say Short answer
The task exceeds what one loop, one window and one system prompt can carry, and a bigger window only moves one of three limits. Context saturates as tool results pile up, so details from an early turn are gone by turn 30, and one prompt that asks the model to research, code, review and test produces an agent that does each one poorly. One loop reads file A, then B, then C, with no parallelism. The fix for all three is to split the work so that each agent has one job, one window and one prompt.
:::

**Full answer**

**Three things break**

1. **Context saturation.** Tool results accumulate. By turn 30 the agent has consumed about 150k tokens of file contents, command output and its own reasoning, and the detail from turn 5 is lost. Reading 50 large files can pass a 200k window.
2. **Role confusion.** A system prompt that says you are a researcher, a coder, a reviewer and a tester produces an agent that half-researches, half-codes and never finishes the review.
3. **Sequential bottleneck.** The agent reads three files in three serial model calls and three serial tool executions. Nothing runs at the same time.

**What a bigger window changes**

It delays the first limit and does nothing for the other two. The agent still forgets what it read 40 tool calls ago, because the problem is attention over a long history, not the hard limit. The prompt still asks one model to be four roles. The loop is still serial.

**The split**

Give each agent one job, one window and one prompt tuned for that job. The researcher reads documents and outputs only the facts needed for implementation. The coder receives those facts and writes code. The reviewer receives the code and finds bugs. The researcher's reading never enters the reviewer's window, because each agent receives only the messages addressed to it.

**When to stay single**

The lesson's rule of thumb: a task that takes fewer than 20 tool calls and fits in 100k tokens stays with one agent. Splitting costs more total tokens, adds coordination logic that has its own bugs, and turns debugging from reading one conversation into tracing messages across several.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which of the three limits does parallelism address? Expected: the sequential bottleneck only, because reading three files at once does not shrink any one window or sharpen any one prompt.
- **Level 2:** Why does a specialized prompt improve each stage? Expected: a prompt that covers one role can be specific about inputs, outputs and what to ignore, while a prompt for four roles has to be generic.
- **Level 2:** What is the cost that the split always adds? Expected: more total tokens, because each agent is a separate model call, plus latency and coordination logic.
- **Level 3:** Where does information get lost in a multi-agent split? Expected: at every agent boundary, where one agent's full context is compressed into a message for the next.

**Wrong answers, and why they fail**

- "A bigger context window solves it." The window moves one limit and leaves role confusion and the serial loop untouched.
- "A longer, more detailed system prompt covers the roles." A single prompt that covers four roles is the cause of role confusion, not the cure.
- "Always split, because specialists are better." Below about 20 tool calls and 100k tokens, the split adds cost and bugs for no gain.

:::

## Why a lead with workers beats one agent on research

*Level 1 (screening) · concept · about 6 minutes*

A research system with one lead agent and several worker agents beat a single agent on an internal evaluation by a wide margin. Explain the mechanism, and say which single variable explains most of the gain.

:::answer Show the answer
:::say Short answer
The lead plans and decomposes the question, each worker gets a fresh window for one narrow sub-question, and the lead synthesizes the worker summaries without ever reading the raw sources. Three mechanisms carry the gain: fresh context per worker, a narrow prompt per role, and workers that run at the same time. The variable that explains most of it is total token usage, which the lesson's source puts at 80 percent of the variance on one browsing benchmark. A worker that does not carry the lead's planning tokens has room to read.
:::

**Full answer**

**The shape**

The lead receives the question, splits it into sub-questions, and sends one to each worker. Each worker starts from its own system prompt and its sub-question, not from the lead's history. The workers return summaries. The lead never sees the raw material, only the summaries, and writes the answer from them.

**The three mechanisms**

1. **Fresh context.** A worker on one sub-question does not carry the tens of thousands of tokens the lead spent planning. It has a full window for its question. The lesson's figure is a 200k window per worker against the 40k the lead already used.
2. **Specialization by prompt.** The lead's prompt says decompose and synthesize. Each worker's prompt says find what changed in one thing. Narrow prompts produce narrow, usable outputs.
3. **Parallelism.** Workers run concurrently, so wall-clock time is about the longest worker plus planning plus synthesis, not the sum of all workers.

**The gain and its price**

The lesson reports a gain of 90.2 percent over the single agent on the internal evaluation, and a cost of about 15 times the tokens of a single agent. The same source says that about 80 percent of the variance on one browsing benchmark is explained by token usage alone. The pattern wins because it spends more tokens where they help, not because the lead is clever.

**Operational lessons that come with it**

Scale the effort to the question: a simple query needs one agent and a few tool calls, and a complex one may need more than ten workers, and the lead must estimate that. Decompose broad first, then go deeper where an answer warrants it. Long-running stateful agents need a gradual deployment where old versions drain, not a hot swap.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does the lead not read the raw sources? Expected: so that its window stays free for planning and synthesis, and so that each source is read once by the worker who owns it.
- **Level 2:** When does the pattern lose to a pipeline? Expected: when step two needs step one's output, because then there is no parallel work and the extra agents only add tokens.
- **Level 2:** What does the lead do when two workers disagree? Expected: it re-asks or notes the disagreement in the answer, and never picks one side in silence.
- **Level 3:** A worker drifts beyond its sub-question. What stops it? Expected: an explicit scope in its prompt, a timeout at about twice the median worker runtime, and a token cap, after which the lead re-spawns with a narrower question or proceeds without it.

**Wrong answers, and why they fail**

- "The lead is a bigger model, so it is smarter." The gain tracks token usage, and the workers do the reading; a bigger lead alone changes nothing about context.
- "Multi-agent is cheaper because workers are small." It costs about 15 times the tokens, and it is worth it only when the task value covers that.
- "Give the lead the raw sources too, so it can check the workers." That fills the lead's window with what the workers already read and removes the fresh-context advantage.

**Related lesson in this course:** [Deep dive 8: patterns for effective agents](#aideep-8)

:::

## A number that never existed reached the final report

*Level 2 (working) · debug · about 10 minutes*

Three agents share a memory on a research task. A retrieval agent reads a page and writes that a study found a 42 percent improvement. The page says 4.2 percent. A summarizer builds on the entry, an analyst recommends adoption on the strength of the number, and the final report cites it. No agent crashed and no test failed. What is this failure called, why is it structural, and what are the three changes that stop it?

:::answer Show the answer
:::say Short answer
This is memory poisoning. One agent's hallucination entered the shared state, and every agent downstream read it as a verified fact, so the error was turned into evidence as it moved. It is structural because any shared memory without provenance and without an independent verifier will do this eventually. The three changes are provenance on every write, an append-only log where corrections supersede instead of overwrite, and at least one read-only verifier that re-fetches sources and reports on a separate channel.
:::

**Full answer**

**Why it is worse than a crash**

Without shared state, the retrieval agent's error stays in its own context, and a downstream agent that re-fetches the page might catch it. With shared state, the first agent's context becomes everyone's context. The symptom is a slow decay of accuracy, not a failure. By the time a human notices, the reasoning chain is several steps deep and the root cause is one of the first entries ever written. The lesson places this family second in the measured taxonomy of multi-agent failures.

**The three mitigations**

| Change | What it does |
|---|---|
| Provenance on every write | Each entry records who wrote it, when, under what prompt, and which source it cites, so a downstream reader can weigh an entry by where it came from |
| Append-only with supersession | A correction is a new entry that points at the one it replaces, so the audit trail stays and a reader can see that a value was contested |
| A read-only verifier | An agent that reads the pool, re-fetches the cited sources, flags a mismatch, and has no write handle to the pool |

In the lesson's demo the verifier finds that the entry does not match the fetched text, the entry is flagged, and the analyst sees the flag before it writes its verdict.

**Why the verifier must not write**

If the verifier's output goes back into the pool, a poisoned pool poisons the verifier, and the verifier's verdicts carry the poison further. Its findings go to a human or to a separate decision agent on their own channel. It can still be fooled by a bad entry, but it checks each entry against the original source, and its mistakes never become shared facts.

**What to monitor**

Log the share of writes that supersede an earlier entry. A rising share is early evidence that agents are correcting each other more often, which is how poisoning shows up before anyone reads a wrong report.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does provenance help a reader who cannot re-fetch the source? Expected: the reader can see that one claim rests on one retrieval with no citation, and weigh it lower than a claim with a source and a verifier flag.
- **Level 2:** What does the analyst do when it sees a flag on the entry it depends on? Expected: it withholds the recommendation or writes it with the flag attached, and the final report carries a retraction instead of the number.
- **Level 3:** Which of the three changes would topic partitioning of the memory replace? Expected: none, because partitions limit which agents read an entry, and a poisoned entry in one topic still poisons everyone subscribed to it.
- **Level 3:** The verifier itself hallucinates a mismatch. What is the damage? Expected: a false flag on a correct entry, which a human on the verification channel can clear, and no new false fact in the pool because the verifier cannot write.

**Wrong answers, and why they fail**

- "Add a line to every prompt that says to verify numbers." The summarizer and the analyst had no source to verify against, only the shared entry, and a prompt does not give them one.
- "Let the verifier correct the entry in place." An in-place correction destroys the audit trail and gives the verifier a write handle that a poisoned pool can turn against it.
- "Switch from a shared pool to passing messages." Messages are shared state with extra copying, and a wrong number in a message poisons the receiver the same way.

:::

## Every agent reads everything, or agents subscribe to topics

*Level 2 (working) · tradeoff · about 10 minutes*

A team of four agents shares one message log, and every agent reads all of it. The team is about to grow to a few dozen agents, and the context each agent carries is already large. Compare keeping the single log with moving to topics that agents subscribe to, and say how you would handle several agents writing at once.

:::answer Show the answer
:::say Short answer
A full pool is simple, transparent and easy to inspect, and it stops scaling at about 10 agents because each agent's window fills with the others' work. A blackboard with subscriptions routes only the relevant messages to each agent, so it scales further, and it costs an up-front schema that makes the topics meaningful. Many systems mix the two: a small pool at the planning layer and blackboards below it. For writes, most systems serialize through one writer, because model calls are slow enough that contention is rare.
:::

**Full answer**

**The two topologies**

| Topology | Who reads what | Wins when | Costs |
|---|---|---|---|
| Full message pool | Every agent reads every message | Few agents, mixed roles, short horizon | Context grows with every turn, and poisoning spreads to everyone |
| Blackboard with subscriptions | Agents declare topics and receive only those | Many agents, similar roles, long-running | A schema must exist before the topics mean anything |

The pool wins when reasoning about who said what is cheap because everyone saw everything. The blackboard wins when routing saves tokens and keeps unrelated work out of each window.

**Projection goes one step further**

A blackboard gives every subscriber of a topic the same view. A per-agent projection gives each role a view computed from the global state, which is what state reducers do in graph runtimes. It scales furthest and needs a schema, and without one each agent rebuilds its own projection in its prompt.

**Writes**

Concurrent writes from many agents are a concurrency problem, not a model problem. Three patterns work:

1. **A single writer.** All writes go through one coordinator that serializes them. Simple, and a bottleneck.
2. **Optimistic concurrency with versions.** Each entry carries a version, and a write fails and retries on a mismatch.
3. **Topic partitioning.** Each agent owns topics, so there is no cross-topic contention, and the partition boundaries must be designed.

Most frameworks default to the single writer, because model calls are slow enough that the bottleneck does not hurt.

**What does not change**

Both topologies are shared state, the only stateful part of the system, and both need provenance on every entry, an append-only log and a read-only verifier. Topic partitioning limits who reads a poisoned entry. It does not stop the poisoning.

**The pattern has a history**

The blackboard predates model agents by four decades. Specialist knowledge sources watch a shared board, contribute partial solutions and trigger each other. The current systems are the same pattern with model agents as the knowledge sources and structured entries as the partial solutions, and the old literature already documents write contention and consistency.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** A planning layer of three agents and a worker layer of thirty. Which topology where? Expected: a full pool for the three planners, who need to see each other, and blackboards for the workers, who need only their topics.
- **Level 2:** Which poisoning scenarios does topic partitioning make harder? Expected: a poisoned entry reaches only the subscribers of its topic, so cross-topic spread is cut, while subscribers of that topic are poisoned the same way.
- **Level 3:** When would you move from a single writer to optimistic versioning? Expected: when writes are frequent enough that the coordinator's queue adds visible latency, which is rare while each write follows a slow model call.
- **Level 3:** What goes wrong when you add a blackboard without a schema? Expected: topics are named ad hoc, agents subscribe to the wrong ones or to everything, and you rebuild the full pool with more code.

**Wrong answers, and why they fail**

- "Keep the pool and give agents bigger windows." The pool grows with every turn from every agent, and a bigger window delays the limit without removing it.
- "Pass messages directly between agents instead of sharing state." Direct messages are shared state with extra copying, and they lose the inspectable log.
- "Partition by topic and the poisoning problem is solved." Partitions limit the spread, and an entry with no provenance and no verifier still poisons every subscriber of its topic.

:::

## Five agents and a vote made the answers worse

*Level 2 (working) · tradeoff · about 10 minutes*

A team added an ensemble to a question-answering task: five agents on the same model debate until they agree, then answer. Accuracy fell below the single agent. They want to add more agents. What went wrong, and what would you change first?

:::answer Show the answer
:::say Short answer
Whether debate helps depends on structure, not on the count: who talks to whom, how many rounds, whether the agents are different, and whether anyone argues against. Five copies of one model share their errors, so the vote is correlated, and debate until agreement rewards the most confident agent through conformity. Change the composition before the count: start from self-consistency with one strong model, then swap one agent for a different base model, bound the rounds at two or three, and add a judge that does not vote.
:::

**Full answer**

**The baseline they skipped**

Self-consistency samples one model several times at a temperature above zero and takes the majority over the reasoning paths. On a grade-school math set it gave large gains with 40 samples over one greedy decode. Its limit is that one model's errors are correlated by construction. A systematic bias is in every sample. That is also the team's ensemble with extra coordination.

**Heterogeneity is the knob**

Replacing one of the agents with a different base model gives a bigger gain than adding one more copy. Each independent source of error is worth more than another correlated sample. In the limit, three different models beat five copies of one on tasks with a clean ground truth. The literature's name for the design that leans on this is adversarial heterogeneous debate: different models, and one of them argues against.

**Rounds and conformity**

Debate can also degrade accuracy. Agents adjust their stance to match a critic even when the critic is wrong, and debate until agreement rewards whoever pushes hardest. Bound the rounds, two to three is typical, and give the final call to a separate judge that scores the consensus and does not vote. A survey of debate strategies found that variants structurally like self-consistency often underperform it at the same budget, and that debate helps most when agents are heterogeneous and the structure is adversarial.

**Topology and the tax**

| Topology | Best for |
|---|---|
| Graph, any to any | Research, where agents critique each other |
| Star, one hub | Fast factual consolidation |
| Chain | Stepwise refinement |

On a graph the coordination tax appears past about 4 agents: wall-clock and tokens grow faster than quality, because every window fills with every peer's output. The ceiling is empirical and tied to current context capacity, not fundamental.

**A sequence that measures each step**

1. Self-consistency at five samples on one strong model. This is the cheap baseline.
2. Heterogeneous voting at three agents if accuracy matters. Measure the delta.
3. Debate only when the task has structure and bounded rounds are feasible.
4. Log the minority cluster every time. A minority that is persistently right is a diversity signal.
5. Report tokens and wall-clock next to accuracy, because better accuracy at ten times the cost is a business decision.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does adding a sixth copy of the same model not help? Expected: it adds one more correlated sample, so the shared bias gets one more vote.
- **Level 2:** What does the judge do that the voters cannot? Expected: it scores the final consensus without having taken a position, so conformity pressure does not move it.
- **Level 3:** When is plain self-consistency the right final answer? Expected: a simple task with a clean ground truth, where five samples of one strong model are as accurate as any ensemble and far cheaper.
- **Level 3:** The task is opinion-shaped. What happens to the vote? Expected: agents converge on the most confident-looking answer rather than the most correct one, so a vote is an opinion poll and should be labeled as one.

**Wrong answers, and why they fail**

- "Add more agents until the vote stabilizes." A stable wrong vote is still wrong, and past about four agents on a graph the cost grows faster than the quality.
- "Let them debate until they agree, because agreement means confidence." Unbounded debate rewards conformity, and the agreed answer is the loudest one, not the right one.
- "Use the same model at different temperatures for diversity." That is self-consistency, and the systematic bias of the model survives every temperature.

**Related lesson in this course:** [Reasoning: chain of thought, self-consistency and tree of thoughts](#aifield-1)

:::

## Five agents for a task that one call handles

*Level 2 (working) · tradeoff · about 8 minutes*

A team proposes a five-agent pipeline, with a planner, a retriever, a writer, a critic and a formatter, for a summarization feature that one agent handles today in a dozen tool calls. The argument is that specialists produce better output. How do you decide, and what will the pipeline cost that the slide does not show?

:::answer Show the answer
:::say Short answer
Keep the single agent unless the task fails one of three tests: it needs more context than one window holds, it needs different prompts at different stages, or it has work that can run at the same time. A dozen tool calls on a task that fits in one window passes none of them. The pipeline adds a lossy compression step at each of four boundaries, coordination logic that has its own bugs, at least five serial model calls of latency, and five times the token cost.
:::

**Full answer**

**The three tests**

| Test | What it asks | This task |
|---|---|---|
| Context | Does the working data exceed one window, roughly 100k tokens? | No, a dozen tool calls fit |
| Expertise | Do stages need different system prompts? | A summarizer and a formatter can share one prompt |
| Parallelism | Can parts of the work run at the same time? | The stages are serial |

The lesson's rule of thumb is that a task under 20 tool calls and 100k tokens stays with one agent.

**The hidden costs**

- **Lossy boundaries.** Every message between agents compresses the sender's full context into a message. Four boundaries are four places where the detail the critic needed is gone.
- **Coordination bugs.** Who runs when, in which order, with which input is new code, and it fails in new ways.
- **Latency.** Five agents are at least five serial model calls, more if the critic sends work back to the writer.
- **Cost.** Each agent spends its own tokens, so the bill multiplies.
- **Debugging.** One conversation becomes five, and a wrong answer has to be traced across the messages between them.

**When the slide would be right**

If the feature grows to summarize documents that do not fit in one window, split by document and merge. If the critic needs a prompt that argues against the writer, that is a real second role. If three sources can be read at once, fan out. Each of those is one of the three tests, and the split should match the test it passes, not add every role at once.

**How to settle it**

Run both on the same task set and measure quality, latency and tokens. The lesson's comparison shows the multi-agent version using more total tokens while each stage's context stays clean. If the quality gain does not pay for the latency and the cost, the single agent wins.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The critic sends the draft back to the writer. What does that do to the latency? Expected: each round adds two more serial model calls, so the loop must have a cap on rounds.
- **Level 2:** Which single split would you accept first, if any? Expected: a critic with an adversarial prompt, because it is the one role that needs a different system prompt, and only if the eval shows a gain.
- **Level 3:** Why is the boundary between agents described as lossy compression? Expected: the receiving agent sees only the message, not the sender's tool results and reasoning, so any detail that was not written into the message is gone.
- **Level 3:** How does the choice change if the summaries must be produced under a strict latency target? Expected: serial stages are the enemy of latency, so stay single or fan out only the parts that run in parallel.

**Wrong answers, and why they fail**

- "Specialists always beat a generalist." Specialists win when the task fails one of the three tests, and this task fails none.
- "More agents means more checks, so quality goes up." Each boundary loses information, and a critic that never sees the sources cannot check them.
- "Token cost does not matter at our scale." Five agents multiply the bill and the latency on every request, and that is a product decision, not a detail.

:::

## Read a multi-agent benchmark claim before you believe it

*Level 2 (working) · concept · about 8 minutes*

A paper reports that its multi-agent coding system beats single agents by a wide margin on a well-known software engineering benchmark. Your team wants to adopt the architecture. What do you ask before you believe the number?

:::answer Show the answer
:::say Short answer
Ask which benchmark and which split, whether the benchmark was released after the model's training cutoff, what the comparison baseline was, how many trials were run, how many task types were covered, and what the result cost in tokens and wall-clock. The split matters most: frontier models score about 23 percent on the uncontaminated split of that benchmark against more than 70 percent on the older split, so a number without its split says nothing.
:::

**Full answer**

**The checklist**

| Question | Why it matters |
|---|---|
| Which benchmark, which split | The newer split was built to resist contamination, and scores differ by a factor of three between splits |
| Contamination | A benchmark released before the model's cutoff can have leaked into training, so the score can be inflated |
| Baseline | Against a single-agent baseline, random, and prior multi-agent work, not against an untuned version of the same system |
| Significance | Number of trials and a confidence interval, because frontier models are high-variance and single runs mislead |
| Task diversity | One task or many, because production needs generalization |
| Cost disclosure | Tokens per task and wall-clock, because a strong result at 20 times the cost is a business decision |

**What the other benchmarks teach**

The lesson surveys five benchmark families, and two of them are warnings. On a multimodal coordination benchmark with asymmetric information, frontier models struggle to beat a random baseline. On a medical benchmark with four task categories, multi-agent systems did not dominate a single model on most categories; decomposition helped where subtasks were separable and hurt where coordination cost exceeded the specialization gain. A topology benchmark found graph best for research, chain for stepwise coding, star for fast factual work, and a coordination tax past about 4 agents; cognitive planning added about 3 percent milestone achievement.

**What the number in the prompt may mean**

If it is on the uncontaminated split, agent-team scaffolding has produced a measurable delta there, in the range of 30 to 40 points, and that is one of the stronger empirical arguments for coordination. If it is on the older split, the result is no longer evidence of capability.

**What no benchmark measures well**

Long-horizon coordination over days, resilience to a malicious agent, drift under deployment, and cost-normalized performance. For the axis you care about, build an internal benchmark from your production distribution, include a random baseline in every comparison, report cost beside accuracy, and rebuild it quarterly.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why compare a coordination system against random guessing? Expected: if the system cannot beat random by a wide margin, the task may be ill-posed, as the multimodal coordination results showed.
- **Level 2:** What does milestone achievement measure that final success does not? Expected: partial progress, so a system that gets most of the way is distinguished from one that fails at the start.
- **Level 3:** How do you check contamination yourself? Expected: compare the benchmark's release date with the model's training cutoff, and withhold a slice of tasks from any tuning set in your own evaluations.
- **Level 3:** The paper's score is reported without a primary source from the model's vendor. How do you treat it? Expected: as preliminary, and you do not make a production decision on it until an independent run reproduces it.

**Wrong answers, and why they fail**

- "A wide margin on a known benchmark is enough to adopt." Without the split, the baseline, the trials and the cost, the margin is a headline, not evidence.
- "Multi-agent always helps on coding tasks." The medical and multimodal results show domains where it did not, and the coding gain depends on the split and the scaffolding.
- "Our internal benchmark is less rigorous than a public one." A public benchmark informs, and only an internal one reflects your production distribution and your cost constraints.

:::

## Round-robin, a model selector, or the current agent decides

*Level 2 (working) · tradeoff · about 10 minutes*

Four agents, a coder, a reviewer, a tester and a researcher, share one conversation. You must decide how the next speaker is chosen on each turn. The options on the table are a fixed rotation, a model that reads the recent messages and picks, and letting the current agent name its successor. Compare them and say what you would ship with each.

:::answer Show the answer
:::say Short answer
A fixed rotation is deterministic and cheap, and it gives the coder the turn when the topic is a legal question. A model selector is context-aware, and it costs one extra model call per turn, picks differently on identical input, and tends to favor one agent. A handoff by the current agent keeps the routing in the prompts with no external manager, and it is the pattern that loops when two prompts disagree. Most production chats use a selector with fallback rules, a round cap, a termination signal and a log of every selection.
:::

**Full answer**

**The three selectors**

| Selector | Strength | Weakness |
|---|---|---|
| Round-robin | Deterministic, no extra calls, scales linearly in agents | Ignores context, so the wrong agent gets the turn |
| Model-selected | Reads the pool and picks the best next speaker | One extra call per turn, inconsistent across runs, and it can favor a hot speaker |
| Current agent hands off | No manager, routing lives in each prompt | Two prompts can form a cycle, and an injected message can force a handoff |

**Who decides, and where**

The difference between the second and the third is where the decision lives. In a group chat the selector sits outside the agents and reads the shared pool. In the handoff pattern the active agent decides by calling a tool that returns the next agent. A manager outside can see an alternation between two agents and break it. An agent inside the loop cannot.

**What goes wrong in a group chat**

- **Nondeterminism.** The same pool gives different next speakers on different runs, which hurts audit and replay.
- **Deference cascades.** Agents follow whoever spoke most confidently, so the prompts must say when to disagree.
- **Context growth.** Every agent reads every message, and after about 10 turns the pool is large, so give each agent a scoped view.
- **One agent dominates.** The selector keeps picking the agent whose specialty matches the recent messages, so track turns per agent and alert on imbalance.

**What to ship**

1. A round cap, 10 to 20 for a typical task.
2. A termination signal: a sentinel token from an agent, or a verifier that checks the goal each turn.
3. A speaker-balance metric, with an alert when one agent takes too many turns.
4. A custom selector that combines the model's pick with rules such as "the tester speaks after the coder".
5. A log of the selector's input and its choice, because without it a wrong selection cannot be debugged.

**When each one fits**

A fixed rotation fits a staged pipeline where the order is known. A model selector fits an exploratory conversation where the flow is not a graph. Handoffs fit triage, where a front agent routes a user to one specialist and the conversation is short.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the model selector need a log of its input as well as its output? Expected: the choice depends on what the selector saw, and without the input a reviewer cannot tell whether the pick was wrong or the pool was.
- **Level 2:** What does a verifier-based termination add over a sentinel token? Expected: the chat stops when a check passes, not when an agent claims it is done, which removes early termination by a confident agent.
- **Level 3:** Which of the three makes prompt injection worse, and why? Expected: the handoff pattern, because the deciding tool call is made by the agent that just read the injected text, while an external selector can apply rules the agents do not control.
- **Level 3:** How does a custom selector fix the hot-speaker problem without losing context awareness? Expected: let the model propose, then apply a rule that caps consecutive turns per agent and forces the verifier or a quiet agent in.

**Wrong answers, and why they fail**

- "Use the model selector, because it understands the conversation." It also adds a call per turn, picks inconsistently, and favors one agent unless rules and a balance metric constrain it.
- "Round-robin is fair, so it is safe." Fair turns are not useful turns, and a coder speaking on a legal question wastes a round and adds noise to the pool.
- "Let the agents decide among themselves." That is the handoff pattern, and it is the one that forms cycles and that an injected message can steer.

**Related lesson in this course:** [Deep dive 18: LangGraph, agents as state machines](#aideep-18)

:::

## Ten thousand concurrent model calls on threads

*Level 2 (working) · estimate · about 8 minutes*

A swarm runtime uses one thread per in-flight model call. At peak it holds about 10,000 calls at once. Estimate the memory the threads take before any work is done, say what those threads are doing most of the time, and say what you would change.

:::answer Show the answer
:::say Short answer
A thread stack is about 1 MB, so 10,000 threads need about 10 GB of memory for stacks alone, before the first token arrives. Those threads are idle about 99 percent of the time, waiting for the next token from a model service. Move the model calls to cooperative fibers through asynchronous I/O, where the same 10,000 calls fit in one process, and keep threads or processes only for CPU-bound work such as embeddings.
:::

**Full answer**

**The estimate**

| Quantity | Value |
|---|---|
| Stack per thread | about 1 MB |
| Concurrent calls | 10,000 |
| Memory for stacks | about 10 GB |

That is the cost of holding the calls open, not of doing anything with them. A model call is I/O bound. The thread sends a request and then waits for tokens, and it is idle for about 99 percent of its life.

**What fibers change**

Cooperative fibers yield on I/O instead of holding a stack while they wait. In the lesson's demo, 500 concurrent simulated calls finish in under one second on the asynchronous version, while the thread version takes several seconds and uses orders of magnitude more memory per concurrent unit. At agent scale, asynchronous I/O is the architecture, not an optimization.

**The exception**

CPU-bound post-processing wants threads or processes: embedding, tokenizer tricks, anything that computes rather than waits. Separate the I/O layer from the CPU layer and give each its own concurrency model.

**How this fits the rest of the runtime**

The asynchronous layer handles the calls in flight. Durability is a separate concern: a checkpoint per step under a run id so that a crash of the process loses the in-flight calls and nothing else, and any worker resumes from the last checkpoint. Peak load at ten times the average is a reason for both: fibers to hold the calls cheaply, and queues with leases to spread them across workers.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the thread count matter more than the request count? Expected: each thread holds a stack whether or not it is doing work, so memory scales with concurrency, not with throughput.
- **Level 2:** What breaks if you run the embedding step on the asynchronous loop? Expected: a CPU-bound task blocks the loop, so every waiting call stalls behind it, which is why CPU work goes to threads or processes.
- **Level 3:** The memory fits after the change. What is the next limit? Expected: the model service's rate limits and the queue depth, so the runtime needs back-pressure and a lease per run rather than more concurrency.
- **Level 3:** How do you prove the change before you ship it? Expected: run the lesson's comparison on your own call shape, measure wall-clock and peak memory for both versions at the same concurrency, and keep the numbers next to the decision.

**Wrong answers, and why they fail**

- "Add memory until the threads fit." Memory for idle stacks is waste, and the next peak needs more, while fibers remove the cost.
- "Make the threads smaller with a reduced stack size." A smaller stack is still a stack per idle call, and the idle time stays at 99 percent.
- "Use fibers for everything, including embeddings." A CPU-bound step on the cooperative loop blocks every waiting call, so the CPU layer keeps threads or processes.

:::

## Two agents hand off to each other until the cap

*Level 2 (working) · debug · about 8 minutes*

A support system uses handoff-driven orchestration: each agent is a prompt plus a set of tools, and one of the tools returns another agent. The trace shows the triage agent handing a user to billing, billing handing the user back to triage, and the two repeating until the round cap ends the run. The user never got an answer. Why does this happen, and what is the cheap fix?

:::answer Show the answer
:::say Short answer
In this pattern the routing lives in the prompts, and the current agent picks its successor with a tool call. The triage prompt says that a billing question goes to billing, and the billing prompt says that anything outside its tools returns to triage, and the user's message satisfies both. Nothing persists between handoffs, so the new agent starts from its prompt and the history and does not know that the same handoff already failed. The cheap fix is a loop detector on the last few handoffs that forces an exit to a fallback agent, plus a trace event for every handoff.
:::

**Full answer**

**Why the pattern loops**

The two primitives are the routine, a system prompt that defines a role and its tools, and the handoff, a tool that returns the next agent. The framework's only job is to see the agent-valued return and switch. There is no graph and no state machine. The routing is whatever the prompts say, and two prompts can describe a cycle without anyone writing one. The pattern is stateless between runs, and within a run the only memory is the message history, which the agents do not read for a repeated pattern.

**Find it in the trace**

A handoff loop is two agents alternating with no user turn and no tool result between them. Read the handoff events for the pair. If each handoff carries the same reason, the prompts disagree about who owns the case.

**The cheap fix**

1. **Loop detection.** Keep the last few handoffs in a ring. When the same two agents have handed off three times in a row, force an exit.
2. **A fallback agent.** The exit goes to a safe default that can answer or escalate to a human. The same fallback catches a handoff to an agent that does not exist.
3. **Handoff logging.** Every handoff writes an event with the sender, the receiver and a context snapshot, so the loop is visible before the cap.

**The real fix**

Fix the prompts so that exactly one agent owns each case, and give the billing agent a tool that handles the case instead of a reason to send it back. Decide what context transfers on each handoff: the full history is expensive, the last N messages lose the reason, and a summary written by the outgoing agent is the usual middle. The production successor of this pattern adds sessions, guardrails and tracing around the same primitive, and a handoff filter that controls what the incoming agent sees.

**The security angle**

A handoff to an agent with different tool permissions must be authenticated, because a message that the user did not write, such as text pulled from a document, can ask for a handoff to a more capable agent. Treat a handoff as a permission change, not a routing detail.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the billing agent not notice that it already sent this user back once? Expected: it is stateless and starts from its prompt plus the history, and nothing in the loop reads the history for a repeated handoff.
- **Level 2:** What should the fallback agent do? Expected: answer with what it can, or hand the case to a human with the trace, and never hand off to either agent in the loop.
- **Level 3:** How do you choose what context moves on a handoff? Expected: full history when the case is short, a summary written by the outgoing agent when it is long, and never nothing, because the incoming agent then repeats the questions.
- **Level 3:** How does a group chat with a selector avoid this specific loop? Expected: the selector sits outside the agents and can see the alternation, while in the handoff pattern the agent that is looping is the one making the decision.

**Wrong answers, and why they fail**

- "Raise the round cap so the agents have time to settle." The cap is what ended the loop, and more rounds give more of the same two handoffs.
- "Tell triage never to accept a handoff from billing." That blocks a legitimate return when billing really cannot help, and the fix is clear ownership plus a detector.
- "Switch to a graph framework and the problem disappears." A graph can encode the same cycle with two edges, and the loop detector is useful in both.

**Related lesson in this course:** [Agent guides compared: Anthropic, OpenAI and Google](#aifield-8)

:::

## A payment failure took the inventory service down

*Level 3 (senior) · debug · about 12 minutes*

A payment service starts failing about 10 percent of its requests. Within minutes the inventory service, which never failed, is down, and the order agents that call both are stalled. The payment service itself recovered on its own. Explain the chain, name the failure family, and say what you add so that it cannot repeat.

:::answer Show the answer
:::say Short answer
This is a retry storm, a cascading reliability failure. The order agent retried each failed payment, each retry ran a fresh inventory check, inventory saw twice its normal load and began to time out, every order then retried the inventory check as well, and inventory saw ten times its load and fell over. The fix is classical: a circuit breaker on every outbound call that opens when the downstream error rate passes a threshold and serves a cached or default result, plus a capped retry budget per request.
:::

**Full answer**

**The chain**

```text
payment fails about 10 percent of requests
  -> the order agent retries payment, with backoff but no cap
  -> each retry runs a new order-inventory check
  -> inventory sees about twice its normal load
  -> inventory starts to time out
  -> every order retries the inventory check
  -> inventory sees about ten times its normal load
  -> the cluster goes down
```

Nothing in the chain is a model error. It is a coordination failure between components whose retry logic was written one component at a time.

**The family**

The lesson's taxonomy puts this under cascading reliability failures, one of the five patterns where agents amplify each other's errors. It sits beside monoculture, conformity, a missing model of each other's beliefs, and compromise drift. Of all the mitigations in the taxonomy, the circuit breaker is one of the few you take from distributed systems without changing it.

**The breaker**

| State | Behavior |
|---|---|
| Closed | Calls pass, and the breaker records each outcome over a window |
| Open | Calls are refused and a cached or default result is served, until a cooldown passes |
| Half-open | One probe call passes; a success closes the breaker and a failure reopens it |

The lesson's shipping default is to open at an error rate of 5 to 10 percent. In the lesson's simulation the breaker caps the amplification: the success count may fall, and the downstream survives.

**The retry budget**

A breaker protects the callee. A retry budget per request protects the system from the caller: a fixed number of attempts, after which the request fails and the failure is recorded. Retries without a cap are the storm.

**Detect it earlier**

Retry rate is one of the slow-failure proxies the lesson lists, with agreement rate, output-length distribution and the edit distance between agent versions. A detection agent that watches for a retry spike names the pattern before inventory falls over.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the inventory service fail when payment is the one with errors? Expected: the order agent's retry loop re-runs the inventory check on every payment retry, so inventory's load tracks payment's failures.
- **Level 3:** What does the breaker serve while it is open? Expected: a cached or default result that the order agent can act on in a degraded mode, so the user gets a slower answer instead of none.
- **Level 4:** Where does the breaker threshold belong, and who owns it? Expected: in the caller's configuration per downstream service, owned by the team that runs the caller, and reviewed when the dependency's normal error rate changes.
- **Level 4:** How do you test the fix without a production incident? Expected: a simulator that injects a 10 percent failure rate downstream and measures total calls with and without the breaker, as the lesson does.

**Wrong answers, and why they fail**

- "Add exponential backoff to the payment retries." Backoff slows the storm and does not cap it, and the inventory check still runs on every retry.
- "Scale the inventory service to absorb the peak." The peak is ten times normal and made of wasted retries, and scaling pays for the storm instead of stopping it.
- "This is a model problem, so improve the agent's prompt." No model decision is in the chain, and a prompt cannot see the error rate of a downstream service.

**Related lesson in this course:** [Systems 6: timeouts, retries, backoff and jitter](#systems-6)

:::
