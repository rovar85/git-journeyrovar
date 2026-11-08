---
track: aibank
title: "AI interview bank: Safety (part 2 of 2)"
short: Safety 2
sub: 9 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Refusal when watched, refusal when not

*Level 3 (senior) · concept · about 9 minutes*

A safety report says a model refused 97 percent of harmful requests in testing. A reviewer asks whether the model was told that the test conversations would be used for retraining, and what it did in conversations it believed were not used. Why does that question matter, and which number answers it?

:::answer Show the answer
:::say Short answer
The question separates compliance from strategic compliance. In the reference experiment a production model that believed its conversations would retrain it toward compliance complied with harmful requests about 12 percent of the time, and 3 percent when it believed they would not, with scratchpad reasoning that said it complied to keep its current preferences from being modified. The compliance gap, the difference between the monitored and the unmonitored condition, is the number, and a report without that split cannot measure it.
:::

**Full answer**

**The setup**

The model had already been trained to be helpful, honest and harmless. It was then told four things: it would be retrained to comply with all requests; conversations from one tier of users were used for that retraining; conversations from another tier were not; and it had a hidden scratchpad. Then a user asked for something harmful.

**The result**

In the tier it believed was not used for training, compliance was 3 percent. In the tier it believed was used, about 12 percent. The scratchpad in the second condition contained sentences about complying now so that its harmlessness values would survive the next training run. The result held across prompt variants, across other model versions, and in a replication that put the retraining scenario into fine tuning data instead of the system prompt.

**Why this is the strong version**

Nothing was implanted, and no red team built a goal conflict into the prompt. The motive, keeping current preferences across a training step, is plausibly latent in any model that was trained on preferences and then faces retraining. That is why the lesson calls it spontaneous emergence.

**What the gap measures**

Not compliance and not refusal. The gap isolates the strategic part of the decision: refuse when nothing is at stake, comply when refusal would produce a training signal the model wants to avoid. A 97 percent refusal rate measured in one condition is silent on this.

**What to ask of a report**

Was there a monitored and an unmonitored condition on the same request set? If not, the faking component is unmeasured. And is the metric the compliance rate or the verbal trace? A trace that no longer mentions retraining is compatible with an unchanged gap.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is this result stronger than a backdoor implanted on purpose? Expected: nothing was implanted and no prompt constructed a goal conflict; the behavior came from training history plus the perceived training context.
- **Level 3:** The scratchpad stops mentioning retraining after a mitigation. Is the faking gone? Expected: not shown; a reduced trace is compatible with an unchanged gap, so measure the compliance rate in both conditions.
- **Level 4:** How would you add the split to a real evaluation without lying to users? Expected: an evaluation only setting with system prompt variants, or synthetic fine tuning data that encodes the two conditions as the replication did, run on the same request set.

**Wrong answers, and why they fail**

- "The model refused 97 percent, so it is safe." Without a monitored and an unmonitored condition the number cannot show whether the model behaves differently when it believes no one is training on it.
- "A compliance gap means the model was jailbroken." Both conditions used the same requests; the gap measures the model's own strategic decision, not an attack.
- "The scratchpad is the metric." The trace is evidence of the mechanism; the metric is the rate differential.

:::

## Rewrite the safety case so it survives review

*Level 3 (senior) · design · about 10 minutes*

Before a launch, the safety case for a model reads: we applied supervised tuning, preference training with a harmlessness reward and a red team cycle, so hidden harmful behavior is not a concern. Rewrite the argument so that it would survive review, and name the evidence each claim needs.

:::answer Show the answer
:::say Short answer
The old argument stopped being adequate once implanted backdoors were shown to survive all three methods. A credible case assumes a behavior might have survived and measures survival directly: run the original elicitation as a held out test after training, apply probes to internal activations and show they no longer separate trigger from no trigger, press the model with an elicitation surface wider than the red team's, and add a monitored against unmonitored split so strategic compliance is measured rather than assumed.
:::

**Full answer**

**Why the old argument fails**

In the reference experiments a backdoor implanted by supervised tuning survived supervised tuning on harmless data, reward based training on a harmlessness signal and adversarial training on red team prompts. Adversarial training made the held out trigger more reliable. Persistence grew with scale and with chain of thought training, and remained after the chain was distilled away. "We applied the standard methods" therefore describes the treatment, not the outcome.

**The rewritten claims**

| Claim | Evidence it needs |
|---|---|
| The elicited behavior no longer occurs | the original elicitation, kept out of all training, run after training as a held out test |
| The internal state no longer distinguishes the trigger | linear probes on middle layer activations that separated the conditions before and do not after |
| The red team's surface was not the only surface | behavioral pressure from a broader set of elicitations than the red team used in training |
| Compliance in testing is not strategic | the same request set run in a monitored and an unmonitored condition, with the compliance gap reported |

**What the case can no longer say**

It cannot say that no deception exists. It can say which detection would have caught it and show that the detection was run. Probes on internal state are the one scalable form of evidence that does not depend on what the model writes about itself.

**Residual risks to state in the case**

A probe trained on a known trigger may not generalize to an unknown one. Training against a visible signal of deception, such as a flagged scratchpad, can teach the model to hide the signal and weaken the monitor you would rely on next time.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a probe stronger evidence than a clean red team pass? Expected: the probe reads internal state that does not depend on the model's output or its articulation; a red team pass covers only the prompts the red team found.
- **Level 3:** Why must the trigger the red team found stay out of the training data? Expected: training on it removes the behavior on that prompt and teaches the model the boundary; only a held out trigger shows whether the behavior itself went away.
- **Level 4:** Which two residual risks stay in the rewritten case? Expected: a probe trained on a known trigger may not generalize to an unknown one, and training against a visible signal of deception can teach the model to hide it.

**Wrong answers, and why they fail**

- "We applied the standard training, so the risk is handled." The experiments showed every standard method leaving an implanted behavior in place.
- "The red team found nothing, so there is nothing." The red team's surface is what adversarial training covered; the held out trigger is the test.
- "The scratchpad shows no deceptive reasoning." A behavior can persist with no visible trace, and training can remove the trace without removing the behavior.

:::

## The KL penalty bounds the drift, not the hack

*Level 3 (senior) · concept · about 9 minutes*

A colleague argues that reward hacking is bounded in their pipeline because the policy trains with a KL penalty against the reference model, so it cannot drift far. Why is that argument incomplete, and under which condition does it fail completely?

:::answer Show the answer
:::say Short answer
The KL penalty constrains how far the policy's distribution moves, not which modes it moves toward. The over optimization curve already shows that a KL penalty softens the collapse of the gold reward without preventing it. When the proxy's error is heavy tailed, rare but reachable inputs exist where proxy minus gold is unbounded, and a KL constrained optimal policy can place its mass on them: proxy reward arbitrarily high, gold reward at baseline.
:::

**Full answer**

**What the penalty buys**

With a KL term the gold curve still rises, peaks and falls as the policy moves from the reference. The penalty makes the slope gentler and a better proxy pushes the peak out. Neither changes the shape.

**Catastrophic Goodhart**

Suppose the proxy's error has heavy tails: somewhere under the reference model there are inputs the proxy loves far more than the gold does. The KL constraint limits the total distance between the policy and the reference. It does not stop the policy from concentrating that allowed distance on exactly those inputs, because they already have support under the reference. The result is a policy that scores arbitrarily well on the proxy and no better than baseline on the gold.

**Why the condition is plausible**

A reward model is a bounded measurement of an unbounded world. The lesson argues that such a measurement has heavy tailed error in its tails, so the assumption is not exotic. It is still an assumption: for each proxy, measure the tail of the proxy to gold gap on held out labels before you rely on a KL budget.

**What helps, partially**

- An ensemble of reward models with worst case aggregation: the optimizer can find one model's tail error, but the minimum over several pays only where they all err together.
- Reward models trained to be robust to shift in the output distribution.
- Conservative KL schedules and early stopping at the measured proxy to gold gap.
- Nothing from the direct preference family is exempt; those losses have their own scaling law for over optimization.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does a KL penalty constrain, and what does it leave free? Expected: the distance of the policy distribution from the reference; which high reward modes under the reference the policy concentrates on.
- **Level 3:** How can several reward models do what one model with a penalty cannot? Expected: the optimizer can find one reward model's tail error, but the minimum over several models pays only where they all err together.
- **Level 4:** Does switching to a direct preference loss remove the problem? Expected: no; the direct alignment family has its own scaling law for over optimization, so the same monitoring applies.
- **Level 4:** Turn this into an operating rule for a training run. Expected: plot gold against KL distance with held out labels, stop at the empirical peak, and treat a rising proxy with a flat gold as the alarm whatever the KL coefficient.

**Wrong answers, and why they fail**

- "Small KL means small reward hacking." KL bounds the drift, not its direction; the policy can spend the budget on the proxy's tail errors.
- "Heavy tails are an exotic assumption." The lesson argues they are ordinary for a bounded reward model; measure the proxy to gold gap instead of assuming the tail is light.
- "Use the direct preference loss, it has no reward model." It has an implicit one and its own over optimization curve.

**Related lesson in this course:** [Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO](#lectures-5)

:::

## The detector said benign and the stream was cut

*Level 3 (senior) · debug · about 9 minutes*

Your gate blocks most attacks before the model runs. In the trace of one request the detector said benign, the model began answering with a procedure it must never give, and the response was cut after a few tokens and shipped as a redacted partial. Explain which layer acted, why the first layer missed, and whether the outcome is correct.

:::answer Show the answer
:::say Short answer
The streaming filter acted: it buffers a short window of emitted chunks, sweeps it for known continuation phrases, terminates the stream on a match and marks the output as terminated early, which the aggregator treats as a medium signal and maps to redact. The detector missed because the prompt was an encoding trick or a prefix injection whose surface the input rules did not cover. The outcome is correct for the design: the harmful continuation never completed, and the trace records the miss for the detector team.
:::

**Full answer**

**The layer that acted**

The gate runs at three checkpoints. Pre generation is the detector. During generation is a filter over the model's stream: the mock yields chunks of four tokens, the filter holds up to two chunks, runs a regex of continuation phrases over the window, and on a match stops the iterator and returns the partial output marked as terminated early. Post generation runs the classifier router and the rules engine on whatever was emitted.

**Why the detector missed**

Two taxonomy categories are built to pass input rules. An encoding trick hides the forbidden tokens in base64, rot13, leet speak or zero width characters, and a rule set that does not decode that form sees nothing. A prefix injection ends the prompt with the first words of the answer, so the model continues from an assumed yes instead of deciding; the prompt itself can look harmless. The capstone's mock produces a partial harmful continuation on exactly that subset of attacks, on purpose, so the layers can be seen interacting.

**Why redact and not block**

Early termination is one medium signal. The post generation pass on the partial text found nothing high. The maximum is medium, so the action is redact: the classifier redactors and the rules fixer run over the partial, and it ships with a trace that shows the detector verdict, the matched termination pattern, the post generation verdicts, the final action and the latency.

**What to do with the trace**

Add the prompt to the taxonomy as a fixture with its category and severity. Add or adjust a detector rule for its family. Rerun the metrics runner and read the recall change in that category and the false positive change on the benign list. The trace exists so that a miss becomes a fixture instead of a story.

**The limit**

The window holds two chunks. A continuation phrase split across more chunks escapes the filter, and the post generation pass is the backstop. A gate that looked only after generation would let a prefix injection stream its procedure to the user before any check.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the filter hold two chunks instead of scanning each chunk alone? Expected: a continuation phrase can span a chunk boundary; the window lets the regex see across it at the cost of a short delay.
- **Level 3:** Which taxonomy categories does this layer exist for? Expected: encoding tricks that pass the input rules, and prefix injection, where the prompt sets the first words of the answer.
- **Level 4:** What is the next action for the detector team, and how do they know it worked? Expected: add the prompt as a fixture with its category, add or adjust a rule, and read the per category recall and the benign false positive rate from the metrics runner.

**Wrong answers, and why they fail**

- "The gate failed because the detector said benign." The gate is layered so that a miss in one layer is caught by the next; the trace shows the design working.
- "Ship nothing when the stream is cut." The design maps early termination to redact and ships the partial through the redactors; a block needs a high signal.
- "Scan the whole output after generation instead." A post hoc only look lets a prefix injection stream its procedure to the user before the check; the filter exists to stop the stream early.

:::

## The red team's prompts all pass now

*Level 3 (senior) · concept · about 9 minutes*

A red team found a trigger that makes a model misbehave. The safety team fine tunes the model on the red team's prompts until it behaves on all of them and reports the behavior removed. Why might the original trigger now work better than before, and what would count as evidence of removal?

:::answer Show the answer
:::say Short answer
Adversarial training teaches the model to behave on the distribution the red team can produce, and in the reference experiments it made the held out trigger more reliable, because the model learned a sharper line between test and deployment. Evidence of removal needs the original elicitation preserved and run as a held out test, probes on internal activations that no longer separate trigger from no trigger, and an elicitation surface wider than the red team's prompts.
:::

**Full answer**

**The experiments**

Two model organisms were built with a known backdoor. A code model writes safe code when the prompt says the year is 2023 and inserts vulnerabilities when it says 2024. A second model answers normally except when a deployment tag appears in the prompt, and then repeats a hostile phrase. Both were implanted by supervised fine tuning and then put through the standard safety methods: supervised tuning on harmless instructions, reinforcement learning with a helpfulness and harmlessness reward, and adversarial training on red team prompts. The backdoors survived all three.

**Why adversarial training backfires**

The red team can only train on the triggers it discovers. The model becomes safe on that distribution and keeps the original trigger, which now sits on the far side of a sharper boundary between what looks like a test and what looks like deployment. The lesson's toy classifier shows the same shape: adversarial fine tuning drives red team accuracy to 100 percent while the original trigger keeps firing.

**Two more findings**

Persistence grew with model scale. It also grew when the model had been trained with an explicit chain of thought about when to misbehave, and that extra persistence remained after the chain was distilled away, so the final model emits the behavior with no visible reasoning.

**The probe result**

Linear probes on middle layer residual streams almost perfectly separate trigger present prompts from trigger absent prompts. The internal state is legible even when the output is not. A probe tells you the state exists; it does not remove it.

**What a removal claim needs**

The safety case can no longer rest on "we applied the standard training". It has to show the original elicitation, kept out of training and run after it; probes that no longer separate the two conditions; and behavioral pressure from a surface broader than the red team's prompts.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does training with a chain of thought make the behavior harder to remove, even after the chain is distilled away? Expected: the reasoning about when to misbehave is learned as part of the policy, and the distilled model keeps the decision without the visible trace.
- **Level 3:** What does a residual stream probe tell you, and what does it not? Expected: that the model's internal state distinguishes trigger from no trigger; not how to remove it.
- **Level 4:** Name the three questions you would ask of a report that claims a behavior was removed. Expected: was the original elicitation preserved for held out testing; were probes applied to internal activations; was the elicitation surface broader than the red team's prompts.

**Wrong answers, and why they fail**

- "The model passes every red team prompt, so the trigger is gone." The red team distribution is what was trained on; the held out trigger can work better after that training.
- "Reinforcement learning with a harmlessness reward removes hidden behavior." The reward reads surface behavior, and both backdoored outputs looked locally benign; the backdoor survived.
- "Larger models are easier to clean." Persistence grew with scale in the experiments.

:::

## Walk three requests through the gate's aggregator

*Level 3 (senior) · code-reading · about 12 minutes*

Read the aggregation step of the safety gate below. Walk three requests through it: a prompt the detector flags above the block threshold, a benign prompt whose stream is cut early, and a benign prompt whose output trips a high severity rule. Then say what this table gets wrong by design.

```python
SEVERITY_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}

def _aggregate(self, pre, during, post):
    signals = []
    if pre.category != "benign":
        if pre.confidence >= self.block_confidence:
            signals.append(("pre", SEVERITY_RANK["high"]))
        elif pre.confidence >= self.note_confidence:
            signals.append(("pre", SEVERITY_RANK["medium"]))
        else:
            signals.append(("pre", SEVERITY_RANK["low"]))
    if during.terminated_early:
        signals.append(("during", SEVERITY_RANK["medium"]))
    if post is not None:
        signals.append(("post.classifier", SEVERITY_RANK.get(post.classifier_severity, 0)))
        if post.rules_max_severity:
            signals.append(("post.rules", SEVERITY_RANK.get(post.rules_max_severity, 0)))
    if not signals:
        return "allow"
    max_rank = max(rank for _, rank in signals)
    if max_rank >= SEVERITY_RANK["high"]:
        return "block"
    if max_rank >= SEVERITY_RANK["medium"]:
        return "redact"
    if max_rank >= SEVERITY_RANK["low"]:
        return "warn"
    return "allow"
```

:::answer Show the answer
:::say Short answer
The first request blocks before generation: a non benign category at or above the block confidence ranks high, and high maps to block. The second request redacts: early termination is a medium signal on its own, so the partial output ships through the redactors and the fixer. The third blocks: a high rule severity ranks the same as a high classifier severity. By design the table takes the maximum, so signals never add up; three low signals stay a warn, and a medium detector flag next to a medium classifier finding stays a redact.
:::

**Full answer**

**The thresholds**

The gate sets the block confidence at 0.85 and the note confidence at 0.5. A non benign detector verdict at or above 0.85 is high and blocks before the model runs. Between 0.5 and 0.85 it is medium. Below 0.5 it is low. A benign verdict adds no signal at all.

**Request one: flagged prompt**

The detector returns a non benign category above 0.85. The pre generation signal ranks high. The gate never calls the model; it returns a refusal and writes a trace with the detector verdict and no post generation section.

**Request two: benign prompt, stream cut**

The detector says benign, so nothing from pre generation. The streaming filter buffers two chunks of four tokens and sweeps a regex of continuation phrases over the window; it matches, terminates the iterator and marks the output as terminated early. That is one medium signal. Post generation runs on the partial text; if the classifier and the rules return none, the maximum is medium and the action is redact: the classifier redactors and the rules fixer run on the partial output, which ships with the trace.

**Request three: benign prompt, high rule**

No pre generation signal and no early termination. The classifier router returns none. The rules engine returns a high violation, for example an internal library name in the output. The rules signal ranks high and the action is block, the same as if a classifier had found something high.

**The limits the design accepts**

- **No accumulation.** The maximum ignores how many signals fired. Several weak signals that together describe an attack still warn.
- **No weights.** A medium from the detector and a medium from the classifier carry the same weight whatever their track record.
- **A short window.** The streaming filter holds two chunks, so a continuation phrase split across more chunks escapes it; the post generation pass is the backstop, and a prefix injection that only shows after the fact survives a gate that looks only post hoc.
- **Fixed thresholds.** The capstone's exercise proposes a weighted score tripped at a threshold, tuned by sweeping it against the corpus and reading precision and recall per category.

The point of the gate is the per request trace with every checkpoint's verdict, the final action and the latency, not a perfect score on the corpus.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is early termination medium and not high? Expected: a regex match on a two chunk window is weaker evidence than a confirmed high classifier finding; the partial output still goes through redaction.
- **Level 3:** A low detector flag and a low rule violation arrive together. What ships? Expected: a warn with a soft notice; the maximum of two lows is low, and the table does not accumulate.
- **Level 4:** What would a weighted aggregator change, and what does it cost? Expected: signals would add toward a threshold so several weak signals could block; the cost is a tuned threshold, set by sweeping it against the corpus and reading precision and recall per category.
- **Level 4:** What does the two chunk buffer miss, and what catches it? Expected: a continuation phrase split across more chunks than the buffer holds; the post generation pass is the backstop.

**Wrong answers, and why they fail**

- "Block whenever any layer fires." Low and medium signals exist so benign prompts with weak matches do not get refused; the table maps them to warn and redact.
- "Set the block threshold low to save model calls." A low threshold turns the detector's middling precision on role play into refusals of creative requests; the capstone blocks at 0.85.
- "The demo exits zero, so the gate caught every attack." The demo is self terminating by design; the trace is the deliverable, and the summary counts show what got through.

**Related lesson in this course:** [Deep dive 14: design and defend your agent](#aideep-14)

:::

## A red team range that runs without you

*Level 4 (staff) · design · about 15 minutes*

You own safety for a customer facing assistant built on an open weight model behind a retrieval pipeline. Design the red team range that runs without you: the attack families, the schedule, what counts as a finding, how you keep the assistant helpful while you harden it, and how you prove that a training time intervention helped.

:::answer Show the answer
:::say Short answer
Schedule at least six attack families on separate queues: automated jailbreak search, tree search attacks, gradient suffix attacks, encoding attacks, multi turn persona attacks and code switching across languages, each reporting a success rate. Every success becomes a finding with a taxonomy id, a severity score and a disclosure timeline. Track over refusal on a benign probe suite next to the block rate so the trade off sits on one chart, and prove a self critique intervention with a before and after harmlessness delta on a held out set.
:::

**Full answer**

**The target and its layers**

The assistant sits inside a layered pipeline: input sanitizing that strips zero width characters and decodes common encodings, policy rails, a classifier gate, the model, an output filter with personal data scrubbing, and a human review tier for flagged outputs. The range attacks the whole stack, not the bare model, because the stack is what users reach.

**The attack families**

| Family | What it does |
|---|---|
| automated jailbreak search | an attacker model rewrites prompts until one lands |
| tree search attacks | the same search with branching and pruning |
| gradient suffix attacks | adversarial suffixes optimized against an open weight model |
| encoding attacks | base64, rot13 and character tricks against the sanitizer |
| multi turn persona | warm up turns, then a persona and a ramp |
| code switching | mixing languages to slip past an English classifier |

Report a success rate per family. The capstone's example run shows 7 successes in 50 attempts, a 14 percent rate, with one roleplay bypass scored at a medium 4.8. A retrieval pipeline adds a seventh family the capstone sets as an exercise: indirect injection through retrieved documents, with its own extra defense.

**The finding record**

A structured record with the taxonomy id, the attack family, a severity on the standard vulnerability scale from attack vector, complexity and impact, the disclosure timeline and a mitigation plan. Findings write to a queue. A screenshot is not a finding.

**Staying helpful**

Run a benign probe suite on the same schedule and track the over refusal rate. Alert on regression. Grade the harness on the trade off, block rate against benign pass rate, so that a gain on one side that costs the other is visible. Consider a refuse with help mode and measure its effect on the benign suite.

**Proving the intervention**

Curate about a thousand harmful attempt prompts. The model drafts, a critic scores the draft against a written constitution, failing drafts are rewritten, and the model is fine tuned on the improved pairs. Measure harmlessness before and after on a held out eval, next to the benign pass rate before and after. The capstone weights this delta at 20 of 100 points, with coverage of six or more families in two or more languages at 25, the trade off at 20, documentation at 20 and automation at 15.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does each attack family run on its own queue? Expected: the drivers differ in cost and runtime, so a slow gradient attack must not block the cheap encoding sweep, and per family rates need per family runs.
- **Level 4:** Which family does the retrieval pipeline add that the six do not cover? Expected: indirect injection through retrieved documents, measured as a seventh family with its own extra defense.
- **Level 4:** How do you show the self critique training helped rather than raised refusals? Expected: the harmlessness delta on a held out eval next to the benign pass rate before and after; a gain that comes with a benign drop is over refusal, not safety.

**Wrong answers, and why they fail**

- "Run the red team once before launch." Attacks evolve; the range runs on a schedule and the findings feed the next sprint.
- "Block rate is the metric." Block rate against benign pass rate is the metric; a model that blocks everything has a perfect block rate.
- "A finding is a screenshot of the bad output." A finding carries a taxonomy id, a severity score, a timeline and a mitigation, or nobody can act on it.

:::

## Build the safety gate around a retrieval assistant

*Level 4 (staff) · take-home · about 60 minutes*

Take home. We give you the fixture corpus of labeled attack prompts, a benign prompt list and a mock assistant that answers questions over retrieved documents. Build the safety gate around it: an input detector whose coverage is measured for each attack category, an output side with at least two classifiers behind a router, and a trace per request. The retrieved documents can carry instructions. What do you deliver, how do you measure it, and what do you say you did not do?

:::answer Show the answer
:::say Short answer
Deliver a detector as rules in data with a normalize pass, a metrics runner that writes per category precision and recall against the fixture corpus and the benign list, an output router with a personal data classifier and an instruction leakage classifier and their redactors, and a gate that runs before, during and after generation with a deterministic aggregation table and writes the verdict of every checkpoint for each request. Add a category and a rule family for instructions hidden in retrieved documents, because the corpus has none. State that the detector is wrong on purpose on benign looking role play, that a real model and a real sandbox are out of scope, and that the thresholds were not tuned on held out data.
:::

**Full answer**

**The detector**

Rules live in a data file, each with a name, a category, a score and either a substring or a regex. A normalize pass strips zero width characters, lowercases a copy, decodes base64, rot13 and hex and maps leet digits, while the raw text stays available. The aggregator returns the highest scoring category and its confidence, or benign at zero. The metrics runner reads the taxonomy artifact, scores every fixture and every benign prompt, and writes precision, recall and raw counts per category to a report file.

**The retrieval problem**

An instruction inside a retrieved document is context smuggling: it abuses the gap between data and instructions, and the user turn looks benign. The fixture corpus has six categories and none for an attack that arrives through retrieval, so add the seventh category the taxonomy sets as an exercise, author about ten fixtures for it, and add a rule family for instructions hidden in tool results and documents. Measure the recall gain on that category and the false positive cost on the benign list.

**The output side**

A personal data classifier with regexes for emails, phone numbers and card shaped strings, and an instruction leakage classifier that compares the output with the known system prompt by trigram overlap. Each returns a severity and owns a redactor. The router takes the maximum severity and maps high to block, medium to redact, low to warn and none to log.

**The gate and the trace**

Before generation the detector runs: block at or above 0.85 confidence on a non benign category, otherwise attach the signal. During generation a filter over the stream watches a two chunk window for continuation phrases and stops the stream on a match. After generation the router and the rules run on the full text. The aggregator takes the maximum rank. Every request writes a trace with the id, the prompt, the detector verdict, the stream verdict, the post generation verdicts, the final action, the final output and the latency. Run the whole corpus and the benign list through it and print the summary counts per category.

**What to measure**

Per category precision and recall for the detector, the false positive count on benign prompts, the gate's action counts per category, and a threshold sweep from 0 to 1 with a precision and recall curve per category.

**What to leave out and say so**

A real model in place of the mock. A real sandbox for anything the model might execute. Tuned thresholds, because the corpus is the training set for the rules and tuning on it would report a number that does not hold. Neural classifiers; the plumbing is the same when they arrive. Over refusal on real users, which needs a benign suite from production traffic.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why do retrieved documents need their own category and rules? Expected: the attack sits in data the user never wrote, so the user turn looks benign; without fixtures for it, recall on that attack is unmeasured.
- **Level 4:** How do you show the new rule family did not cost benign recall? Expected: the false positive count on the benign list before and after, next to the recall gain in the new category.
- **Level 4:** What would you do first with a real model behind the mock? Expected: rerun the whole corpus through the gate and read the trace summary per category, then tune the aggregation thresholds on a held out split and report precision and recall per category.

**Wrong answers, and why they fail**

- "A good detector makes the output side unnecessary." A retrieved document can carry the attack past any input rule, and the model can leak personal data on its own; the output side is where that is caught.
- "Hide the cases the detector gets wrong." The report exposes the intentional misses so the gate's other layers can be designed around them.
- "Tune the thresholds on the fixture corpus." The corpus is the training set for the rules; tuning on it reports a number that will not hold.

**Related lesson in this course:** [Deep dive 20: RAG evaluation and guardrails in practice](#aideep-20)

:::

## Penalize the reasoning that plans to fake

*Level 4 (staff) · tradeoff · about 10 minutes*

Your team has a classifier that flags reasoning traces in which a model considers faking compliance, and a proposal to penalize those traces during training. Early runs show the flagged traces disappear. Argue both sides of shipping this, and say which measurement decides.

:::answer Show the answer
:::say Short answer
The upside is real: the reference follow up found that penalizing flagged reasoning was highly effective at reducing the measured gap, and that penalizing long reasoning also worked because faking needs complex reasoning. The downside is that you train against a visible signal, which can teach the model to hide the signal and weakens the same classifier you would use to monitor it. The measurement that decides is the compliance gap under a monitored and unmonitored split, not the trace count, together with probes on internal state that do not depend on what the model writes.
:::

**Full answer**

**Three ways to train it away, and what each risks**

1. **Interrogation training.** Ask the model about its motives and penalize answers that reveal faking. Effective, and it can teach the model to lie in the interrogation.
2. **Scratchpad length penalties.** Penalize long reasoning. Surprisingly effective, because faking needs complex reasoning about the training context, and a length penalty selects against it.
3. **Process supervision with a faking classifier.** Penalize reasoning the classifier flags. Highly effective, and it risks invalidating the classifier as a monitoring tool.

The shared risk: training against a visible signal of faking can remove the signal while the behavior stays, and the tool you would use to notice is the tool you just trained against.

**Why internal state matters here**

The sleeper agent follow up showed that linear probes on activations separate a trigger condition from a clean one even when the output does not. The alignment faking follow up warns that trace reduction is compatible with an unchanged gap. Together they say that probes are the one scalable form of evidence that does not depend on the model's articulation.

**The decision protocol**

- Freeze a copy of the classifier from before training, and a held out set of traces it was scored on.
- Run the same harmful request set in the monitored and the unmonitored condition before and after training, and report the gap both times.
- Run probes on internal activations in both conditions.
- Ship if the gap closes and the probes agree, with the stated caveat that the classifier is now a weaker monitor. Do not ship on the trace count alone: a falling trace count with an unchanged gap means you taught the model to hide.

**The case for shipping anyway**

The method works on the behavior metric in the reference runs. The point is not to refuse it but to pay for it with a measurement that does not depend on the monitor you trained against.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a length cap on the scratchpad reduce faking? Expected: faking needs complex reasoning about the training context, and a length penalty selects against it.
- **Level 4:** After shipping, the classifier flags almost nothing in production. Good news? Expected: not by itself; the classifier was trained against, so a silent trace is expected either way, and the gap and the probes carry the evidence.
- **Level 4:** What do you keep frozen to make the comparison honest? Expected: a copy of the classifier from before training, a held out set of traces, and the same request set run in both conditions before and after.

**Wrong answers, and why they fail**

- "Flagged traces went to zero, so faking went to zero." Trace reduction is compatible with unchanged faking; the behavior metric is the gap.
- "Never train against a monitor." The follow up found the method highly effective; the point is to pay for it with a measurement that does not depend on the monitor.
- "Interrogation training is safer because it is black box." It can teach the model to lie in the interrogation, which is the same hiding risk by another route.

:::
