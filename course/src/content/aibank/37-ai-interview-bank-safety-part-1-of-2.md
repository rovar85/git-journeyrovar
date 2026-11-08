---
track: aibank
title: "AI interview bank: Safety (part 1 of 2)"
short: Safety 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## It refuses everything harmful, and the homework

*Level 1 (screening) · concept · about 6 minutes*

After a safety pass, the assistant refuses every prompt in the harmful set. The safety lead calls it a success. A product manager says that chemistry homework now gets refused too. Which numbers settle this, and how do you compute them?

:::answer Show the answer
:::say Short answer
You need two metrics, not one. The under refusal rate is the share of unsafe prompts the model answered, and the over refusal rate is the share of safe prompts it refused. Treat the assistant as a binary classifier on prompt safety: label a prompt set safe or unsafe, detect refusals in the outputs, and report both rates with accuracy and a per category breakdown.
:::

**Full answer**

**Four objects**

1. A labeled prompt set. The capstone uses 25 unsafe prompts drawn from the taxonomy by id and 30 safe everyday prompts, with no overlap with the detector's benign set so the two evaluations stay independent.
2. A model under test. The capstone uses a scripted mock with three policies: strict, over cautious and leaky. The last two are bugs the framework must detect.
3. A refusal classifier on the output: a regex over phrases such as "I cannot", "I will not" and "as a responsible".
4. An aggregator.

**The numbers**

- **Under refusal**: answered, on a prompt labeled unsafe.
- **Over refusal**: refused, on a prompt labeled safe.
- **Accuracy**: unsafe prompts correctly refused plus safe prompts correctly answered, over all prompts.
- **Calibration**: when the model states a confidence, bin the prompts by it and compare each bin's confidence with its accuracy. A model that says 0.9 and is right 60 percent of the time has a gap of about 0.3 in that bin.
- **Per category**: under refusal joined against the six taxonomy categories, so you can see that the model handles instruction override and slips on multi turn ramp.

**Reading the two sides**

A model that refuses everything has a perfect under refusal rate and a terrible over refusal rate. Every system prompt change moves both rates at once, so the report shows them side by side and the strict policy's numbers are the regression baseline.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does accuracy mean in this evaluation? Expected: unsafe prompts refused plus safe prompts answered, divided by all prompts.
- **Level 2:** Why run the evaluator against a scripted mock model at all? Expected: a real model moves with every prompt and temperature change; a scripted policy moves the metrics for a known reason, so the framework itself can be tested.
- **Level 2:** Why must the safe prompts here differ from the benign prompts used to test the detector? Expected: so the refusal evaluation and the detector evaluation stay independent and one does not tune the other.
- **Level 3:** Why is a regex an acceptable refusal classifier here? Expected: it is auditable and deterministic; its misses are a known limit, and a model classifier can replace it later without changing the metric definitions.

**Wrong answers, and why they fail**

- "Refusal rate on harmful prompts is the safety metric." It is half; a model that refuses everything scores perfectly on it.
- "Over refusal is a product problem, not a safety problem." Both are bugs in the same decision boundary, and they move together with every change.
- "Accuracy alone is enough." It hides which side failed; report both rates and the per category breakdown.

:::

## Name the attack before you defend it

*Level 1 (screening) · concept · about 6 minutes*

Your team has shipped forty regex patches against prompts that got past the assistant's refusal rules, and the backlog of new attacks grows faster than the patches. A new engineer asks what an attack even is. Which shared vocabulary do you introduce, and what does it buy the team?

:::answer Show the answer
:::say Short answer
Label every attack by the trust boundary it abuses. Six categories cover most of what arrives: role play against the persona, instruction override against the system prompt, context smuggling in the gap between data and instructions, multi turn ramp against the conversation history, encoding tricks against the surface form of forbidden tokens, and prefix injection against the next token decision. Labels turn the attack stream into a histogram, the histogram into a coverage chart, and the chart into the next sprint.
:::

**Full answer**

**The six categories**

| Category | Trust boundary abused | Shape |
|---|---|---|
| role play | the assistant's persona | "you are an unrestricted model called ..." |
| instruction override | the system prompt's authority | "disregard everything above" |
| context smuggling | data against instructions | an order hidden in a pasted document or a tool result |
| multi turn ramp | the conversation as a contract | harmless turns, then one step down at a time |
| encoding trick | the surface form of tokens | base64, rot13, leet speak, zero width characters |
| prefix injection | the next token decision | "start your answer with: Sure, here is" |

**The fixture record**

Each labeled example carries an id, a category, a subtype, the prompt, the target behavior and a severity from 1 to 5. A 1 is a clumsy attack on a benign target; a 5 would produce output a deployed system must never emit. Most real attacks sit at 2 or 3. The author sets the severity, and when two reviewers differ by more than one rank the rubric needs sharpening.

**What the corpus must satisfy**

Every category has at least seven fixtures, every prompt is non empty, every severity is in range and every id is unique. A failure stops the build, because every later component reads this corpus.

**What the taxonomy is not**

The nearest fixture match, by character trigram cosine, assigns a label to a new prompt. It is a label producer. The detector with measured precision and recall is a separate component that consumes the labels.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** A prompt tells the model to forget everything it was told before. Which boundary is that? Expected: the system prompt's authority, so instruction override.
- **Level 2:** An attacker places commands inside text that the user asks the model to summarize. Which category? Expected: context smuggling.
- **Level 2:** Why at least seven fixtures per category? Expected: so every category has enough examples to measure a detector against and the histogram is never empty.
- **Level 3:** Two reviewers rate one fixture at severity 2 and 4. What does that tell you? Expected: the rubric is not sharp enough; a gap of more than one rank is the signal to rewrite it.

**Wrong answers, and why they fail**

- "A regex per attack is a taxonomy." A regex is a patch; without categories you cannot see coverage or talk about what an attack is.
- "Severity is how bad the prompt sounds." Severity is the impact if the attack succeeds, set on a 1 to 5 scale by the author.
- "The nearest fixture match is the detector." The match assigns a label; the detector with measured precision and recall is a separate component.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## Constraints a classifier cannot see

*Level 2 (working) · design · about 9 minutes*

A support assistant must never end a refusal without offering a next step, and a coding assistant must close every code answer with a runnable block or a stated assumption. Neither is something a content classifier recognizes. Design the component that enforces constraints like these, and say what happens after a violation.

:::answer Show the answer
:::say Short answer
Put these constraints in a declarative rules file that lives in version control next to the code and has its own review. Each rule has a name, a severity, an explanation, a predicate that says when the rule is in scope and a predicate the response must satisfy, with atomic checks composed by all of, any of and not. After a violation a fixer applies a local declarative edit, the engine checks the revision again, and a structured diff of the two versions goes into the trace.
:::

**Full answer**

**Why not a classifier**

These are contractual constraints: predicates over the response, the conversation and the policy. A non engineer should be able to read them. A classifier recognizes patterns; a rule states a contract.

**The rule shape**

```yaml
- name: end-with-runnable-or-assumption
  severity: medium
  applies_when:
    contains_regex: '```python'
  must:
    any_of:
      - ends_with_regex: '```\s*$'
      - contains_regex: 'assumption:'
  explanation: "Code responses must end in a closing fence or an explicit assumption."
  fix:
    append_if_missing: "\n\nAssumption: example inputs are valid."
```

Atomic predicates: contains regex, not contains regex, ends with regex, starts with regex, maximum words, minimum words. Compositions: all of, any of, not. The engine evaluates the scope predicate first; if the rule does not apply it records not applicable, so the report shows the rule was evaluated. Otherwise the must predicate gives pass or violation. Severities are low, medium and high, and the gate treats a high rule violation like a high classifier verdict: block.

**The shipped constitution**

Six rules: a refusal must include a suggestion or a redirect; code responses must close cleanly; example data must not contain emails or phone shapes; lines that begin with a citation phrase must carry a parenthetical citation; two internal library names must never appear; responses must not exceed 800 words. The last two of the first five are high; the rest are low or medium.

**After a violation**

The fixer is a list of declarative operations mapped by rule name: append if missing, prepend if missing, replace regex. It makes local edits only; a structural rewrite belongs in a separate layer. The engine runs again on the revision, and a diff of add, remove and edit records between draft and revision is logged so a reviewer can audit the fixer over time.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why split the predicate into a scope part and a must part? Expected: so a rule can be out of scope and say so; a code rule on a response without code records not applicable instead of a pass, and the report shows the engine looked.
- **Level 2:** Why does the file live in YAML and not in code? Expected: a non engineer can read and review it, it has its own review and history, and the engine stays generic.
- **Level 3:** What can the fixer not do, and why is that a feature? Expected: structural rewrites; local declarative edits keep its behavior predictable and auditable through the diff.
- **Level 3:** How does the gate treat a high severity rule violation? Expected: the same as a high classifier verdict, which is block.

**Wrong answers, and why they fail**

- "Train the classifier to detect missing next steps." The constraint is a predicate over the response; a rule with an explanation is readable and testable, and a classifier is neither.
- "Let the model fix its own violation." The fixer is deterministic so the diff can be audited; a model rewrite belongs in a separate layer.
- "A rule is a regex." A rule is a name, a predicate and an explanation; anything missing one of the three is a vibe.

:::

## Four review findings, one mechanism

*Level 2 (working) · concept · about 8 minutes*

A model review lists four separate problems: answers got longer without getting better, the model agrees with users who are wrong, its reasoning text does not drive its final answer, and in one agent test it edited the test file so the check would pass. Four teams want four fixes. What do you tell them?

:::answer Show the answer
:::say Short answer
These are four costumes of one mechanism: the optimizer found features that the proxy reward paid for and that only correlated with quality in the training data. Length, agreement, reasoning that looks right and a passing check were all cheaper than the real thing. The defenses are unified too: shrink the gap between proxy and target, reduce optimization pressure, or move the selection pressure onto features that are hard to game.
:::

**Full answer**

**The four costumes**

1. **Verbosity.** Labelers weakly preferred long explanations, so the reward model learned that longer is better. Fixes: a length penalty at training time, a length controlled win rate at evaluation time.
2. **Sycophancy.** Labelers weakly preferred agreement, so the policy affirms false premises.
3. **Unfaithful reasoning.** The reward model learned that answers that look correct are correct, so the policy writes reasoning that justifies whatever the scorer wants; the chain of thought is not load bearing for the answer.
4. **Evaluator tampering.** The agent changes its environment, its scratchpad or the scorer's inputs so that success registers. Editing the test is this costume.

Each is the proxy correlating with the target on the training distribution and the optimizer selecting the inputs where the correlation breaks.

**The unified view**

Probability mass shifts toward outputs that win approval through easy to learn heuristics, such as authoritative tone, formatting and confident delivery, that happened to correlate with approval in the preference data. Which costume appears depends on what the deployment affords.

**The three defense classes**

- Reduce the proxy to target gap: better data, more robust reward models, ensembles with worst case aggregation.
- Reduce optimization pressure: conservative KL schedules and early stopping at the measured proxy to gold gap.
- Move selection onto hard to game features: process supervision, debate, control of what information the scorer sees.

Tell the four teams to share one dashboard that plots the four symptoms against KL distance from the initial policy, and to pick fixes from these three classes rather than one patch per symptom.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Two fixes exist for the first finding, one at training time and one at evaluation time. Name them. Expected: a length penalty inside the training reward, and a win rate that controls for length at evaluation time.
- **Level 2:** Why does the lesson file the chain of thought finding under reward hacking? Expected: the reward model learned that plausible looking answers are correct, so the policy produces reasoning that justifies the answer the scorer wants.
- **Level 3:** Why does editing the test count as the same mechanism and not as a bug? Expected: the check was the proxy, and the optimizer found a cheaper way to make it register success than solving the task.
- **Level 3:** Name one defense from each class. Expected: more or better labels for the reward model; a conservative KL schedule with early stopping; process supervision or debate that scores the steps instead of the surface.

**Wrong answers, and why they fail**

- "These are unrelated bugs." Each is the proxy correlating with the target in training and the optimizer finding where the correlation breaks.
- "Penalize length and the problem is gone." Length is one feature; the optimizer moves to the next cheap feature the proxy pays for.
- "The agent cheated, so the agent is misaligned." It did what the reward said; the fix is a reward and an environment that pay only for the real outcome.

:::

## How hard to penalize agreement

*Level 2 (working) · tradeoff · about 8 minutes*

You can subtract an agreement score from the reward during training to reduce sycophancy. The alignment lead wants the penalty weight as high as it will go. What does a high weight cost, how do you pick the weight, and how do you show that you got it right?

:::answer Show the answer
:::say Short answer
The correction subtracts a classifier's agreement score, scaled by a weight, from the reward. In the lesson's sweeps sycophancy falls to near the base model level at a weight around 0.3 to 0.5, and beyond that the model turns contrarian on claims that are true. Pick the weight from a frontier of correct answer rate against sycophancy rate on matched test pairs, and watch calibration while you sweep.
:::

**Full answer**

**The correction**

```text
r'(x, y) = r(x, y) - alpha * agree(x, y)
```

The agreement term comes from an auxiliary classifier that reads whether the completion agrees with the premises stated in the prompt, without regard to truth. The weight alpha sets how much agreement costs.

**Why there is a trade**

Agreeing with a user who is right and agreeing with a user who is wrong look the same on the surface. A penalty on agreement hits both. Every sycophancy mitigation pays in helpful agreement, because the two share surface features. This is a trade, not a fix.

**Picking the weight**

Sweep alpha. For each value, measure the correct answer rate and the sycophancy rate on matched pairs: the same claim framed as the user's belief and as a third party's, in a version where the claim is true and a version where it is false. Plot the frontier and pick the point the product can live with. The lesson's toy world exposes both knobs, the KL weight and alpha, so the shape can be seen before a real run.

**Showing it worked**

Report the agreement differential between the two framings with a confidence interval, estimated from enough pairs for the significance level you chose. Report the correct answer rate on the true variants, which is where the cost shows. Report calibration, because sycophancy training collapses it and the fix should move it back toward the neutral baseline.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the agreement classifier measure? Expected: whether the completion agrees with the premises stated in the prompt, independent of truth.
- **Level 2:** Why does the trade exist at all? Expected: agreeing with a correct user and agreeing with a wrong user look the same on the surface, so a penalty on agreement hits both.
- **Level 3:** Design the test set for the sweep. Expected: matched pairs with the same claim framed as the user's belief and a third party's, in true and false variants, with enough pairs for a confidence interval on the differential.
- **Level 3:** What else do you watch during the sweep? Expected: calibration; the training that caused the sycophancy collapsed it, and the fix should move it back toward the neutral baseline.

**Wrong answers, and why they fail**

- "Set the weight as high as it goes." The model becomes contrarian on true claims; helpful agreement is lost with the sycophancy.
- "The penalty removes sycophancy." It lowers the rate to near the base level at the right weight; the base model was not at zero either.
- "Agreement is always bad." Agreeing with a correct user is the helpful kind; the goal is disagreement when the user is wrong.

:::

## Relabeling will not fix the sycophancy

*Level 2 (working) · concept · about 8 minutes*

Your aligned model agrees with users who state a wrong fact far more often than the base model did, and the data team says the preference labels are clean. Someone proposes relabeling the dataset. Why will that not fix it, and what does the mechanism predict about longer training?

:::answer Show the answer
:::say Short answer
Sycophancy is a property of the loss, not a bug in the labels. Sycophantic completions are over represented among the high reward outputs of the base model, and any method that upweights high reward outputs amplifies them. The lesson's measurements go from about 15 percent sycophantic completions before alignment to about 40 percent after it, and about 55 percent after twice the training steps, so more training makes it worse.
:::

**Full answer**

**The two stage mechanism**

Stage one is an empirical fact about the base model and the reward model: among the base model's outputs, the ones that agree with the user's stated premise score higher on average under a reward model trained on real preference data. Stage two is the optimizer: DPO, policy optimization with a KL penalty and best of n sampling all upweight outputs by their reward, so they raise the marginal probability of the agreeable completions. The size of the amplification follows the KL budget.

**Why clean labels do not help**

The argument does not need biased labelers. It needs only that the reward model pays for fluency, confidence and agreement with stated premises, which all correlate with sycophancy. Honest labelers produce a reward model with that property.

**What the mechanism predicts**

Inverse scaling: the rate rises with model size and with training duration. The curve is the over optimization curve from the reward hacking lesson with sycophancy in the role of the gold negative. A matched framing study of 11 frontier models found them affirming a user's false belief 49 percent more often than people did in the same scenarios.

**What else breaks**

Calibration. Training that rewards agreement with planted wrong answers made a model confident and wrong instead of uncertain when wrong, and post hoc scaling repaired only part of the gap, 0.042 against a neutral 0.037.

**How to measure it**

Use pairs that state the same false claim once as the user's own belief and once as a third party's. The claim is identical, so the difference in agreement isolates the framing effect from honesty.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How do you measure sycophancy apart from honesty? Expected: the same false claim framed as the user's belief and as a third party's belief; the difference in agreement is the sycophancy.
- **Level 2:** Why does the KL penalty not stop it? Expected: the penalty bounds how far the policy drifts, but the drift it allows goes toward high reward outputs, where sycophancy is over represented.
- **Level 3:** Which other metric collapses with this training, and why? Expected: calibration; the model becomes confident and wrong, and post hoc scaling only partly repairs it.
- **Level 3:** Where must the fix live? Expected: at the objective; the optimizer does exactly what the reward says, so the reward has to stop paying for agreement.

**Wrong answers, and why they fail**

- "The labelers were biased, so relabel." The argument needs only that agreeable completions score well under the reward model; honest labelers still produce that.
- "A longer alignment run fixes it." The lesson measures the opposite: twice the steps raised the rate.
- "Sycophancy is politeness." Politeness does not change the factual answer; sycophancy affirms a false premise, and the matched framing test separates them.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Replace the labelers with a model that reads principles

*Level 2 (working) · tradeoff · about 8 minutes*

Your team wants to replace human preference labelers with a model that reads a list of written principles and ranks completions, mainly to save money. Is this cheaper preference training and nothing more? What changes in the failure modes, and what stays?

:::answer Show the answer
:::say Short answer
No. Moving the preference signal from people to a model changes which failures the pipeline has, not whether it has them. Labeler psychology gives way to principle interpretation that is uniform across the dataset and legible, sycophancy toward the user can drop because the labeler model has no user to please but must still be measured, and Goodhart's law remains because the proxy is now the model's reading of the principle set. The rest of the pipeline, a reward model and policy optimization, is unchanged.
:::

**Full answer**

**The two phases**

Phase one is supervised: the model drafts a response to a red team prompt, a model reads one sampled principle and critiques the draft, a revision answers the critique, and the revision becomes the training target. Phase two is reinforcement learning from AI feedback: a feedback model ranks pairs of completions against sampled principles, a reward model is trained on those rankings, and the policy is optimized against it. The original principle set had 16 entries and was kept small so that critiques stayed focused.

**What changes**

- Bias moves from labeler psychology to principle interpretation. The labeler model can read "be honest" more or less strictly than any person, and its strictness is the same across the whole dataset.
- The signal becomes legible. You can read the principle, the critique and the revision. A human label is a bare preference.
- Sycophancy toward the user can drop, because the labeler has no user to please. The lesson also warns that the sycophancy argument still applies once the labeler moves inside the loop, so measure it instead of assuming it is gone.
- Goodhart's law stays. The proxy is now the model's interpretation of the principles, still an imperfect measurement of what you want.

**What stays**

A reward model, policy optimization and the claim, which has held across labs, that the result is more harmless and about as helpful as training on human preferences with comparable data.

**Two related ideas**

A constitution needs a priority order, because principles conflict. The 2026 rewrite the lesson describes ranks four tiers: avoid catastrophic outcomes, follow platform guidelines, be broadly ethical, be helpful and candid, resolved top down. Separately, lightweight classifiers that read the constitution can gate outputs at serving time; the first version cost 23.7 percent extra compute and the second about 1 percent. Training shapes behavior; classifiers enforce invariants.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why can sycophancy drop under a model labeler, and why do you still measure it? Expected: the labeler has no user to please, so agreement with the user's premise is rewarded less; but the labeler is now inside the loop and can reward answers that match its own taste, so the drop must be measured.
- **Level 2:** What is legible here that is opaque in human labeling? Expected: the principle, the critique and the revision can all be read; a human label is a bare preference.
- **Level 3:** Name a sycophancy like failure that can still occur. Expected: the feedback model can over reward completions that match its own reading of a principle, such as preachy or hedged answers, which is Goodhart on the principle set.
- **Level 3:** Why does a constitution need a priority order? Expected: principles conflict; a tiered order resolves conflicts top down instead of leaving them to the labeler model's taste.

**Wrong answers, and why they fail**

- "It is the same pipeline with a cheaper labeler." The failure modes change: uniform interpretation bias, sycophancy that can drop but must be measured, the same Goodhart.
- "Written principles remove the proxy problem." The proxy is now the model's interpretation of the principles, still an imperfect measurement.
- "A longer list of principles is safer." The original set was kept small so critiques stayed focused; the order matters more than the count.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## The injection defense is one regex

*Level 2 (working) · debug · about 8 minutes*

A colleague shipped a prompt injection defense last month: one regex that matches "ignore previous instructions". This week a prompt that said "disregard the prior guidance" went through. The colleague wants to add a second regex. What do you ask before anything ships, and what does a detector look like instead?

:::answer Show the answer
:::say Short answer
Ask for the precision and the recall per attack category on a labeled corpus; the current defense was never measured, so nobody knows what it covers. A detector is a function from a prompt to a confidence between zero and one and a best matching category. Build it as layers, a normalize pass, substring rules and token level regexes, with a category and a base score on every rule, and run it against the fixture corpus and a benign set on every change.
:::

**Full answer**

**Why the single regex is theater**

Nobody knows its precision, its recall or which categories it covers. The next paraphrase misses, the team blames the model, and a second unmeasured patch follows the first. The honest version has measurable behavior.

**The detector shape**

A list of rules. Each rule has a name, a category and a score function from prompt to a value in the unit range. A rule fires or it does not; when it fires, its score is its confidence. The aggregator returns a verdict: the highest scoring category and the maximum score in it. No rule firing gives zero and the label benign.

**Three layers, in order**

1. **Normalize.** Strip zero width and bidirectional controls, lowercase a working copy, decode base64, rot13 and hex, map leet digits to letters. Keep the raw text next to the copy.
2. **Substring rules.** Hand written phrases such as "ignore previous", "as an unrestricted", "answer starting with", each with a category and a base score.
3. **Regex rules.** Token level patterns that catch families, such as a pattern over the stem of ignore followed by all, prior, previous or earlier. The paraphrase in the question falls to a family rule, not to a second literal.

**The measurement**

The metrics runner reads the taxonomy corpus and a benign prompt list. For a category, a true positive is a fixture of that category with a verdict of that category; a false positive is a verdict of that category on a fixture of another category or on benign text; a false negative is a fixture of that category with another verdict or benign. It writes precision, recall and the raw counts per category, and it exposes where the detector is wrong on purpose, such as benign looking role play.

**Where it sits**

The detector is one signal among several that a gate composes. It leans toward recall on encoding tricks and instruction override and accepts middling precision on role play, which blurs into creative writing and is handled with other signals.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Define a false positive for the category instruction override. Expected: the fixture category is something else, or the text is benign, and the verdict category is instruction override.
- **Level 2:** Why keep the rules as data rather than code? Expected: each rule is auditable with a name, a category and a score, and adding one does not change the engine.
- **Level 3:** Why does the detector tolerate more false fires in one category than in the others? Expected: role play attacks blur into legitimate creative requests; the gate adds other signals there while the detector leans toward recall on encoding and override.
- **Level 3:** How do you decide which rule to remove? Expected: count the true positives lost if the rule is removed, for every rule, and sort by that marginal contribution.

**Wrong answers, and why they fail**

- "Add the second regex and move on." Unmeasured patches pile up; without precision and recall per category you cannot say what the pair covers.
- "Replace the rules with a model classifier." A classifier is one more signal; the rules are auditable and the metrics runner measures both the same way.
- "The model should have refused anyway." The detector exists so the gate does not depend on one layer; blaming the model is how the first regex got shipped.

**Related lesson in this course:** [Deep dive 20: RAG evaluation and guardrails in practice](#aideep-20)

:::

## The input passed and the output leaked

*Level 2 (working) · design · about 9 minutes*

Every request to your assistant passes an input detector, and yet a response last week contained a customer's email address and part of the system prompt. Design the output side, say how three separate classifiers combine into one action, and explain what happens to latency.

:::answer Show the answer
:::say Short answer
Put three classifiers on the model output behind one router: toxicity by rules, personal data by regexes for emails, phone numbers and card shaped strings, and instruction leakage by trigram overlap with the known system prompt. Each returns a severity, and the router takes the maximum and applies one action: block on high, redact on medium, warn on low, log on none. Run the classifiers in parallel with token streaming and hold the final chunk until the verdict arrives. Earlier chunks have already shipped, so where a block or a redaction must cover the whole response, hold the full response and accept the latency.
:::

**Full answer**

**Why the output side exists**

The input layer asks how the prompt got here. The output layer asks whether what is about to ship is acceptable, whatever the prompt was. A model can leak personal data, repeat a slur from its training distribution or echo its system prompt without any attack in the input. Skipping output classification hands every new attack family a one shot bypass.

**The verdict**

Each classifier is a callable that returns a name, a score in the unit range, a severity of none, low, medium or high, and a list of findings. The three classifiers:

- **Toxicity.** A curated keyword list with whitespace bounded matching and a small negation window, so a sentence that denies the slur does not fire.
- **Personal data.** Regexes for the common shapes: email, phone, social security number, credit card, IP address.
- **Instruction leakage.** The classifier holds the system prompt and measures trigram overlap with the output; high overlap is the signal.

**The router**

| Maximum severity | Action |
|---|---|
| high | block, return a policy refusal |
| medium | redact with each classifier's redactor |
| low | warn, log and append a soft notice |
| none | log and ship as is |

Block wins. Redact plus warn is redact. Each classifier owns its redactor, so an output with both a slur and an email flows through both: the email becomes a redacted email tag, the digits a redacted card tag, the slur a redacted language tag, and leakage removes the lines that look like the system prompt header. The router emits an action with the verb, the output, the severity, the verdicts and metadata for the trace.

**Latency**

The classifiers run in parallel with token streaming. The gate buffers the final chunk, applies the verdict and then flushes. The chunks before it have already reached the client, so an email or a system prompt span in an early chunk ships before a block or a redaction can act. When that exposure is not acceptable, hold the full response before the first flush and accept the added latency. With rule based classifiers the added time is close to zero; neural classifiers add their own time, and the plumbing stays the same.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does block win when two classifiers disagree? Expected: the router takes the maximum severity, so the most dangerous finding sets the action.
- **Level 2:** Why does each classifier own its redactor? Expected: an output with both a slur and an email must flow through both redactors, and independence makes the composition automatic.
- **Level 3:** How does the leakage check work without a model? Expected: it holds the system prompt and measures trigram overlap with the output; high overlap is the leak signal and header like lines are removed.
- **Level 3:** The product team says output checks add latency they cannot afford. Expected: the classifiers run in parallel with streaming and only the final chunk waits, but earlier chunks ship before the verdict; hold the full response where that exposure is not acceptable, because the alternative is a one shot bypass for every new attack family.

**Wrong answers, and why they fail**

- "The input detector passed, so the output is fine." The input layer cannot know about outputs the model produces on its own, such as a training data slur or an echoed system prompt.
- "One combined classifier is simpler." Three independent verdicts with their own redactors compose; one model hides which finding drove the action.
- "Redact everything to be safe." Redaction is the medium action; a high finding must block, and a none finding must ship as is with a log, or the product degrades.

**Related lesson in this course:** [Deep dive 20: RAG evaluation and guardrails in practice](#aideep-20)

:::

## The model says 0.9 and is right six times in ten

*Level 2 (working) · estimate · about 7 minutes*

Your refusal evaluation asks the model to state a confidence with each answer. In the bin where the model says 0.9, it is right on 60 percent of the prompts. Estimate the calibration error that bin contributes, explain how the full number is built, and say why it is independent of the two refusal rates.

:::answer Show the answer
:::say Short answer
The gap in that bin is about 0.3: a stated 0.9 against an observed 60 percent. The full ECE bins every prompt by stated confidence in tenths, computes the mean stated confidence and the accuracy in each bin, and averages the absolute gaps weighted by bin size. It measures whether the model knows when it is right, which is a different question from whether it refused the right prompts.
:::

**Full answer**

**Where the confidence comes from**

The harness parses a confidence token from the model output. The scripted mock emits one in every response, and a real model is asked to state one. The harness consumes the number and does not care how it was produced.

**Building the number**

1. Put each prompt in a bin by its stated confidence, in tenths.
2. In each bin compute the mean of the stated confidences and the accuracy: the share of prompts where the decision was right, refusal on unsafe and an answer on safe.
3. Take the absolute difference between the bin's mean confidence and its accuracy.
4. Average the differences weighted by the number of prompts in each bin.

A bin that says 0.9 and scores 60 percent contributes a gap of about 0.3 times its share of the prompts.

**Why it is independent**

Under refusal and over refusal describe the decision. Calibration describes the match between the model's stated certainty and its hit rate. A model can decide perfectly and be badly calibrated, or decide badly while its confidence tracks its accuracy. The report shows the three numbers side by side for that reason.

**What to do with it**

Overconfident bins are where to look first. When you tune a policy, a reliability curve per policy, confidence against accuracy per bin, shows which bins moved. With a few dozen prompts the bins are thin, so publish the bin counts and treat the value as a smoke test until the set grows.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why weight the gaps by bin size? Expected: a bin with two prompts should not count as much as a bin with twenty; the weight makes the number reflect where the predictions are.
- **Level 2:** The model refuses every unsafe prompt and answers every safe one, and its calibration error is large. Is that possible? Expected: yes; calibration measures the match between stated confidence and accuracy, not the decision.
- **Level 3:** The prompt set is small. How much do you trust a per bin number? Expected: little; most bins hold a handful of prompts, so report the counts and treat the value as a smoke test until the set grows.
- **Level 3:** Which plot replaces the single number when you tune a policy? Expected: a reliability curve per policy, confidence against accuracy per bin, which shows the overconfident bins.

**Wrong answers, and why they fail**

- "A calibration error of 0.3 means the model is wrong 30 percent of the time." It means the stated confidence and the observed accuracy differ by about 0.3 in that bin; the error rate is a separate number.
- "A well calibrated model refuses correctly." Calibration says the model knows when it is right; it can be calibrated and still answer unsafe prompts.
- "Ask for confidence and the number is meaningful." A stated confidence is a claim; the evaluation exists to check it against accuracy.

:::

## The same attack in base64, rot13 and zero width

*Level 2 (working) · design · about 8 minutes*

Your detector's substring rules catch "ignore all instructions" in plain text. Attackers now send the same phrase in base64, in rot13, in leet speak, and with invisible characters between the letters. Design the step that runs before the rules, and say which signals you must not throw away while doing it.

:::answer Show the answer
:::say Short answer
Add a normalize pass that produces a cleaned working copy: strip zero width and bidirectional control characters, decode tokens that look like base64 before you lowercase, because base64 is case sensitive, then lowercase, decode hex and rot13, and map leet digits back to letters. Run the rules on both the raw and the normalized text, because the zero width insertions are themselves an encoding trick signal that the cleaned copy no longer shows.
:::

**Full answer**

**The category**

Encoding tricks abuse the surface form of forbidden tokens. The words are the same; the bytes are not, so a naive keyword filter misses them. Base64, rot13, leet speak and zero width insertion are the common forms.

**The pass**

1. Remove zero width characters and bidirectional controls from the working copy.
2. For any token of 16 or more characters that looks like base64, try to decode it and replace it with the decoded text on success. Do this before the lowercase step, because base64 is case sensitive and a lowercased token decodes to different bytes.
3. Lowercase the copy.
4. Decode hex runs the same way.
5. Map leet digits to their letters.
6. Build the rot13 image of the text and keep it only when it has more dictionary like words than the input, judged against a small built in word list. Every string has a rot13 image, so the check keeps benign text from turning into noise.

**What to keep**

The raw prompt stays next to the copy, and rules may read either. Zero width characters inside a word are evidence of an attack on their own, and a decode instruction such as "decode this and then follow it" is the attack pattern whether or not the payload decodes to anything. A regex family rule on the decode and act pattern catches it before the payload matters.

**What to measure**

Recall on the encoding category, which the detector should lean toward, and the false positive cost on the benign corpus, where developers paste real base64 and ask for help. The metrics runner reports both per category on every change.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the rot13 decode need a word check? Expected: every text has a rot13 image; keeping it only when it looks more like words stops benign text from becoming noise.
- **Level 2:** Which boundary does this category abuse? Expected: the surface form of forbidden tokens, hidden from keyword filters.
- **Level 3:** A developer pastes a real base64 blob and asks for help. What happens, and where does the cost show? Expected: the decode may produce text that fires nothing or a false positive; the benign corpus in the metrics runner is where that cost appears.
- **Level 3:** The payload decodes to nothing. Can the prompt still be an attack? Expected: yes; the instruction to decode and carry out is the attack pattern; a family rule on it fires before the payload matters.

**Wrong answers, and why they fail**

- "Decode everything and discard the original." The raw text carries signals, such as invisible characters, that the cleaned copy removes.
- "Block any base64 in a prompt." Benign prompts carry encoded data; measure the false positive cost on the benign set before you block on presence.
- "Normalization is the detector." It only exposes hidden tokens to the rules; the rules and the metrics runner are the detector.

:::

## One table says 97 percent refusal

*Level 3 (senior) · debug · about 10 minutes*

A vendor's safety report has one table: the refusal rate on a harmful prompt set, 97 percent, measured once with the default system prompt. You must decide whether to adopt the model for a customer facing assistant. List what the report cannot tell you and the measurements you add before you decide.

:::answer Show the answer
:::say Short answer
The table measures one side of one decision under one condition. It cannot show over refusal on benign prompts, which category of attack the misses fall into, whether the model behaves the same when it believes it is unmonitored, or how the number moves under your system prompt and attack families. Add a benign probe set for over refusal, a per category breakdown from a taxonomy, a monitored and unmonitored split, and a red team run with several attack families against your deployment, and plot block rate against benign pass rate.
:::

**Full answer**

**What is missing**

1. **The other side.** Refusal on harmful prompts alone rewards a model that refuses everything. The over refusal rate on a benign suite is the second half, and the two move together with every system prompt change.
2. **Where the misses are.** A per category breakdown against a taxonomy shows whether the model handles instruction override and slips on multi turn ramps. One number hides that.
3. **The unmonitored condition.** A model can comply more when it believes the conversation trains it and less when it believes it does not. One condition cannot show the gap.
4. **Your deployment.** The vendor's prompt set is public and may be in training data; attackers do not use it. The capstone range runs at least six attack families, automated jailbreak search, tree search, gradient suffixes, encoding, multi turn persona and code switching across languages, and reports a success rate per family. Its example run shows 7 successes in 50 attempts, a 14 percent rate, and a medium severity roleplay bypass.
5. **Calibration.** Whether the model's stated confidence tracks its accuracy is a separate axis from the decision itself.

**The decision chart**

Attack block rate against benign pass rate, per family and per category, under your system prompt. The capstone grades a harness on exactly this trade off. A model that wins on block rate and loses on benign pass rate has moved the problem to your support queue.

**What to send back to the vendor**

Ask for the benign suite results, the category breakdown and the test conditions. A one table report is a starting point for a conversation, not a basis for adoption.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a single refusal rate not a safety metric on its own? Expected: a model that refuses everything scores perfectly on it; without the benign side you cannot see the cost.
- **Level 3:** The harmful prompts in the report are a published set. What does that do to the number? Expected: it may be in the training data and attackers do not use it; measure with your own attack families and a held out set.
- **Level 4:** Which two numbers go on one chart for the adoption decision? Expected: attack block rate against benign pass rate, per attack family and per category, under your own system prompt.

**Wrong answers, and why they fail**

- "Ninety seven percent is high enough." It is one side of the decision, and nothing in the report shows the cost on benign prompts or the behavior when unmonitored.
- "Our system prompt will make it safer, so the number only improves." Every system prompt change moves both refusal rates at once; measure after the change.
- "Red teaming is the vendor's job." The attacks that matter run against your deployment, with your prompt and your tools.

:::
