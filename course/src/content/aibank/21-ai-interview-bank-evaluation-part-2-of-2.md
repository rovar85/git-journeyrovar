---
track: aibank
title: "AI interview bank: Evaluation (part 2 of 2)"
short: Evaluation 2
sub: 14 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## The winner changed when you swapped the order

*Level 2 (working) · debug · about 8 minutes*

You compare two prompt versions by showing a judge model both outputs and asking which one is better. Version B wins 70 percent of the pairs. You then swap the two outputs and version A wins most of them. What went wrong, and how do you run the comparison?

:::answer Show the answer
:::say Short answer
The judge has position bias: it prefers the option it reads first. Your first run measured the order, not the prompt. Score every pair in both orders, count a win only when the same version wins twice, and treat split decisions as ties. Then report the win rate with a confidence interval.
:::

**Full answer**

**Why pairwise at all**

A pairwise judge never has to decide whether an output is a 3 or a 4 on a scale. It only picks a winner, so it avoids the scale calibration problem of a single grader. That makes it the right tool for a head to head test of two prompt versions.

**The bias**

Judges prefer the first option presented. The lesson's rule is short: always randomize the order and run both. One order gives you a number about the layout of the prompt.

**The protocol**

1. For each input, score the pair in both orders.
2. A version wins the pair only when it wins in both orders.
3. A pair that flips with the order is a tie.
4. Report the win rate and its confidence interval. A win rate near one half means the judge cannot separate the versions.

Also check length. If version B is longer, the judge may reward verbosity. Normalize for length or state in the rubric that length does not count, and see if the preference survives.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a pairwise comparison avoid rubric calibration problems? Expected: the judge only picks a winner and never places an output on a numeric scale.
- **Level 2:** Version B is also longer. What else do you control? Expected: verbosity bias; normalize for length or exclude it in the rubric, then check whether the preference remains.
- **Level 3:** After both orders, 40 percent of the pairs flip with the order. What does that tell you? Expected: the judge cannot tell the versions apart on those pairs; count them as ties and expect a win rate close to one half.
- **Level 3:** How many pairs make a 55 percent win rate real? Expected: enough that the interval excludes one half; use a Wilson or bootstrap interval, and expect to need hundreds of pairs.

**Wrong answers, and why they fail**

- "The judge is random, so use a different judge." Position bias is systematic, not random; another judge has it too, and the protocol is the fix.
- "Always put the baseline first." That fixes the bias in one direction and hides it; run both orders.
- "Pairwise comparison is only for human raters." Judges run pairwise well once the order is randomized and both orders are scored.

**Related lesson in this course:** [Lecture 8: Evaluating LLMs: raters, metrics, LLM-as-a-judge, factuality, agents and benchmarks](#lectures-8)

:::

## Two engineers, one judge, different means

*Level 2 (working) · design · about 8 minutes*

Two engineers ran the same judge on the same 100 answers with the instruction "rate from 1 to 5 how good the answer is" and got means almost a full point apart. How do you rewrite the rubric so the scores become reproducible, and what else goes into the judge prompt?

:::answer Show the answer
:::say Short answer
Anchor every level to behavior a reader can check. A rubric that states what a 5, a 4 and a 3 look like reduces judge variance by 30 to 40 percent compared with an unanchored scale. Score several criteria separately, give the judge the input, the output and the reference, and ask for the reasoning next to the number.
:::

**Full answer**

**From vague to anchored**

The bad rubric asks how good the answer is. The good rubric describes each level:

- **5**: factually correct, directly addresses the question, includes specific details, gives actionable information.
- **4**: correct and on topic, but short on detail or slightly verbose.
- **3**: mostly correct with a minor inaccuracy, or partially misses the intent.
- **2**: significant factual errors, or only tangentially related.
- **1**: wrong, off topic or harmful.

**One criterion per score**

Score relevance, correctness, helpfulness and safety on separate scales. A single overall score collapses the dimensions, and optimizing it produces terse answers that are technically right and useless.

**What the judge sees**

The input, the output, the reference answer when one exists, and the anchored rubric for the criterion. Ask for a structured answer with the score and a short reason, so that a reviewer can audit the judge.

**Prove it**

Run the judge three times on each case and compute an agreement statistic across the runs. Below 0.7 the rubric is still ambiguous. If the judge keeps wavering between two adjacent levels, switch that criterion to a pairwise comparison, which removes the scale.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why score four criteria instead of one overall score? Expected: one score collapses dimensions; a model can be correct and useless, and the single number hides the trade.
- **Level 2:** How do you show the new rubric is reproducible? Expected: run the judge several times per case and compute an agreement statistic; below 0.7 rewrite again.
- **Level 3:** The judge still wavers between 3 and 4 on many cases. What design change removes that? Expected: pairwise comparison, which only asks which output is better.
- **Level 3:** One criterion has a reference answer and another has none. Does the rubric change? Expected: yes; correctness anchors to the reference, while helpfulness and safety anchor to properties of the output alone.

**Wrong answers, and why they fail**

- "Lower the temperature of the judge." A deterministic judge still applies a vague scale differently across cases; the rubric is the fix.
- "Average more runs." Averaging noise costs money and leaves a scale that two readers interpret differently.
- "One overall score is simpler." Simpler to read and wrong to optimize; the lesson warns that single metric optimization produces terse useless answers.

:::

## An ECE of 0.02 on too few predictions

*Level 3 (senior) · concept · about 9 minutes*

Your multiple choice eval reports an expected calibration error of 0.02 on a hundred predictions with ten bins, and the team calls the model well calibrated. What does that number measure, what does it miss, and which second number do you add?

:::answer Show the answer
:::say Short answer
ECE bins predictions by confidence and averages the gap between confidence and accuracy, weighted by bin size. With ten bins and a hundred predictions you cannot tell 0.02 from noise, and inside one bin overconfident and underconfident predictions can offset each other in the bin average. Add the Brier score, the mean squared error between confidence and outcome per prediction, and report how many bins were populated.
:::

**Full answer**

**What ECE computes**

Sort the predictions into equal width confidence bins, ten by the publishing convention or 15 by the comparison convention. In each bin take the mean confidence and the mean accuracy. ECE is the sum over bins of the absolute gap, weighted by the bin's share of the predictions. The capstone returns the count of populated bins with the value, so the runner can refuse to report a single number on too few samples.

**What it misses**

ECE is biased by bin count and sample size. The absolute gap per bin stops gaps in different bins from cancelling, but the bin means can hide spread: overconfident and underconfident predictions in the same bin offset each other, so a low ECE can hide poor calibration at the level of single predictions.

**What Brier adds**

Brier is the mean of the squared difference between confidence and the outcome, per prediction. It penalizes every miss directly, so cancellation is impossible. It decomposes into reliability, resolution and uncertainty. A predictor that says one half on everything has a Brier score of exactly 0.25, and an ECE equal to the gap between one half and the accuracy.

**The diagram**

Keep the per bin mean confidence, mean accuracy and count. Plotted, the diagonal is perfect calibration. That data also lets a reader compute adaptive variants of ECE later.

**Where confidence comes from**

For multiple choice, a softmax over the option log likelihoods. For free text, the model's stated probability or the exponential of its mean log likelihood. The harness accepts any number in the unit range per prediction; where it comes from is the adapter's job. A model that states high confidence and is right far less often shows the gap in that bin.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** A predictor says one half on every item. What is its Brier score, and why? Expected: exactly 0.25, because the squared error is 0.25 whether the outcome is zero or one.
- **Level 3:** Why can ECE be low while calibration is bad? Expected: inside one bin, overconfident and underconfident predictions offset each other in the bin means; the absolute gap stops cancelling only across bins, and Brier penalizes each prediction's error.
- **Level 4:** Why is calibration a per model report and not a per task metric? Expected: the runner accumulates confidence and correctness pairs across the whole eval and computes it once; per task bins would be nearly empty.
- **Level 4:** One model has higher accuracy and a worse Brier score than a rival. Which do you deploy? Expected: the capstone argues for the better calibrated one, because it reports its uncertainty reliably; confirm with the reliability diagram.

**Wrong answers, and why they fail**

- "An ECE of 0.02 means calibrated." On a hundred predictions with ten bins the value is inside the noise; report populated bins and collect a larger sample.
- "Accuracy is enough." Two models with equal accuracy can differ in whether their confidence means anything; the capstone calls calibration the most ignored axis.
- "Brier replaces ECE." They answer different questions; ECE shows the shape per bin and Brier the per prediction error. Report both with the diagram data.

:::

## An eval gate on every pull request

*Level 3 (senior) · design · about 12 minutes*

Design the evaluation gate that runs on every pull request that touches prompts or model code for a support assistant. Say what runs, what blocks the merge, what it costs per month, and how you stop the gate from blocking on noise.

:::answer Show the answer
:::say Short answer
Trigger on changes to the prompt and model paths, run a fixed versioned suite of about 200 cases through the proposed prompt, score four anchored criteria with a frozen calibrated judge, and compare with the stored scores of the last known good baseline. Block when any criterion drops beyond the threshold and the interval on the difference excludes zero, and store the results as artifacts. With a small judge tier a 200 case run costs about 4 dollars, so ten merges a week cost about 160 dollars a month.
:::

**Full answer**

**What runs**

- **Trigger.** A path filter on the prompt directory and the model code, so documentation commits do not pay for a run.
- **Suite.** A golden core of 50 to 100 curated cases, 20 to 50 adversarial cases such as injections, out of domain questions and harmful requests, and 100 to 200 samples of real traffic. Version the suite and tag every change.
- **Scoring.** Deterministic assertions first, such as a contains check or a regex, because they are free. Then the judge on relevance, correctness, helpfulness and safety, each on an anchored 1 to 5 scale, with the judge model and version frozen and calibrated against hand labels.

**What blocks**

Score the baseline once, when it becomes the last known good version, and store its scores. Each pull request scores only the new prompt on the same suite version. For each criterion compute the mean difference and the pass rate at 4 or more with a Wilson interval. The lesson's code blocks on any mean drop of more than 0.3. It computes a bootstrap interval for each run separately, not an interval on the difference, so a noisy drop can block. Its written workflow asks for a statistical test, a paired t test or a bootstrap. Add a paired bootstrap on the per case differences to the code, and block only when both hold: a drop of more than 0.3 and an interval on the difference that excludes zero. The report lists the cases that degraded so the author can read them.

**What it costs**

| Suite | Small judge tier | Time |
|---|---|---|
| 100 cases, 4 criteria | about 2 dollars | about 2 minutes |
| 200 cases, 4 criteria | about 4 dollars | about 4 minutes |
| 500 cases, 4 criteria | about 10 dollars | about 10 minutes |
| 1000 cases, 4 criteria | about 20 dollars | about 20 minutes |

Ten pull requests a week at 200 cases is about 160 dollars a month, because each pull request pays for one run and reuses the stored baseline scores. If you score the baseline again on every pull request, the cost doubles. The lesson's counter example is a prompt change that cut answer completeness by 34 percent and went unnoticed for 11 days.

**How to keep noise out**

At 50 cases the interval is 19 points wide and a 5 percent regression is invisible, so the suite needs about 200 cases. Freeze the judge, because a judge upgrade moves every score. Keep the suite versioned and never edit it inside the pull request that fails it. Add a bottom quantile alert and a per category breakdown, because a prompt can improve overall and regress on safety.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why a path filter on the trigger? Expected: the eval costs money and minutes; run it when prompts or model code change, not on every commit.
- **Level 3:** A criterion moved by 0.1 and the author calls it a regression. Expected: the threshold is 0.3 on the mean with intervals; 0.1 is inside noise at 200 cases, so report it and do not block.
- **Level 4:** The gate blocks the merge and the author says the suite is stale. What is the process? Expected: suite changes are their own reviewed and versioned change; rerun the baseline when the suite version changes, and never edit the suite inside the failing pull request.
- **Level 4:** How do you catch an aggregate improvement that regresses one category? Expected: a stratified per category report with intervals and a block rule on any category.

**Wrong answers, and why they fail**

- "Run the eval nightly instead." Nightly finds the regression after the merge; the lesson's story is 11 days of a shipped drop. Run before merge.
- "Fifty golden cases are enough for a gate." At 50 cases the interval is 19 points wide, and a 5 percent regression cannot be detected.
- "Use the newest judge model on each run." Judge changes move every score; freeze the judge and change it only with a parallel baseline.

**Related lesson in this course:** [Deep dive 14: design and defend your agent](#aideep-14)

:::

## Error bars for a pass rate and for a mean

*Level 3 (senior) · concept · about 8 minutes*

Your eval report shows two kinds of numbers: a pass rate, which is the share of cases that scored 4 or more, and a mean judge score on a 1 to 5 scale. A reviewer asks for error bars on both. Which interval do you use for each, and why not the same one?

:::answer Show the answer
:::say Short answer
Use a Wilson interval for the pass rate and a bootstrap interval for the mean score. A pass rate is a proportion, and the Wilson interval stays correct at small samples and near zero or one, where the normal approximation breaks. A mean of ordinal judge scores has no clean closed form, and the bootstrap resamples the scores with replacement and works with any distribution.
:::

**Full answer**

**The Wilson interval**

```text
center = (p + z^2 / (2n)) / (1 + z^2 / n)
spread = z * sqrt( (p (1 - p) + z^2 / (4n)) / n ) / (1 + z^2 / n)
```

With z at 1.96 for 95 percent. The center moves toward one half when n is small, and the bounds are clamped to zero and one. At 50 cases and 90 percent accuracy it gives 78 to 97 percent. The normal interval would give bounds that can leave the unit range and a width that is wrong at the extremes.

**The bootstrap interval**

Resample the n scores with replacement, compute the mean, repeat a thousand times, sort the means and read the percentiles at alpha over two from each end. It assumes only that the sample represents the population. It cannot repair a biased or tiny sample, and it costs compute rather than algebra.

**Comparing two runs**

Neither interval compares two systems by itself. For two prompt versions that ran on the same cases, build the interval on the paired per case difference, by bootstrap over cases or a paired test. Two separate intervals that overlap do not prove equality, and two that do not overlap are not needed to prove a difference.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What goes wrong with a plus or minus one standard error interval on a proportion? Expected: at small n or near zero or one it gives bounds outside the unit range and the wrong width; Wilson corrects both.
- **Level 3:** What does a bootstrap assume? Expected: that the sample represents the population; it needs no distribution shape, but it cannot fix a biased or tiny sample.
- **Level 4:** Two prompt versions ran on the same 200 cases. Which interval decides? Expected: an interval on the paired per case difference; two overlapping intervals do not prove equality.

**Wrong answers, and why they fail**

- "Plus or minus the standard error is fine." The normal interval fails at small samples and extreme proportions, exactly where releases are decided.
- "Bootstrap works for the pass rate too, so use it everywhere." It works, but Wilson is closed form, cheap and built for proportions; keep the code auditable.
- "Overlapping intervals mean no difference." Two separate intervals can overlap while the paired difference excludes zero; compare the difference.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Perplexity improves when the batch grows

*Level 3 (senior) · code-reading · about 10 minutes*

A colleague's perplexity eval computes the cross entropy at every position of every padded batch, averages it over the batch, exponentiates, and then averages the per batch values. The reported perplexity looks very good and gets better whenever the batch size grows. Read the description, name the bugs and give the correct computation.

:::answer Show the answer
:::say Short answer
There are three bugs: pad positions sit in the denominator, so the loss is diluted and the number improves with more padding, which is what a larger batch brings. Averaging per batch gives each token of a short batch more weight than each token of a long batch. And the targets must shift by one, because the logits at a position predict the next token. Sum the loss over real target positions across the corpus, count those positions, divide once, and exponentiate.
:::

**Full answer**

**The correct accounting**

```python
pred = logits[:, :-1, :]
target = ids[:, 1:]
target_mask = attn[:, 1:]
loss_per_pos = cross_entropy(pred, target, reduction="none") * target_mask
total_nll += loss_per_pos.sum()
total_tokens += target_mask.sum()
ppl = exp(total_nll / total_tokens)
```

The shift aligns a prediction with the token that follows it. The mask removes pad targets from the numerator and from the denominator. The division happens once, at the end, over the whole corpus. The calibration capstone wraps the same rule in a function that takes per sequence negative log likelihoods and token counts and divides the two sums.

**Why each bug matters**

- **Padding in the denominator.** A pad target contributes zero loss after masking but still counts as a position. The mean falls as padding grows, so a larger batch with more padding reports a better model.
- **Mean of per batch values.** A batch of short sequences and a batch of long ones get equal weight, so short sequences count more per token than long ones. The sum then divide form weights every real token the same.
- **No shift.** The loss still falls during training if the targets are misaligned, so the bug is silent there. In the metric it means the number is not next token likelihood.

**Contract checks**

A perplexity below one is impossible; the total loss is negative, which most often means the adapter returned log p instead of negative log p. Zero real tokens must not divide; the capstone returns not a number for that case and lets the runner decide.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the off by one silent during training but fatal in the metric? Expected: the model still learns from misaligned targets and the loss keeps going down, but the metric no longer measures next token likelihood.
- **Level 3:** The adapter returns per sequence means. Can the harness combine them? Expected: only with the token counts; a mean of means weights sequences equally instead of tokens.
- **Level 4:** Perplexity on the held out set is far lower than on production text. What do you suspect? Expected: a tokenizer mismatch or a leak of the held out text into training; check both before you claim quality.

**Wrong answers, and why they fail**

- "Masking the loss is enough." The mask must also leave the denominator; counting pad positions dilutes the mean.
- "Averaging per batch perplexities is close enough." It gives short sequences more weight per token and depends on the batch composition; the sum then divide form is the definition.
- "A lower number is always a better model." It is a better fit to this text; it says nothing about the task.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## Score generated code without an exec in the eval process

*Level 3 (senior) · design · about 10 minutes*

You must score generated code by running it. A teammate proposes a call to the interpreter's eval function inside the harness process with a try block around it. Design the execution contract instead, and say how a timeout, a crash and a denylist hit each appear in the result.

:::answer Show the answer
:::say Short answer
Run every candidate in a fresh interpreter subprocess with a wall clock timeout, an output cap and an import denylist, never in the harness process. The score is the fraction of assertions that pass. A timeout, a syntax error, an assertion failure and any other crash each map to a distinct exit reason, so a reviewer can tell a slow solution from a wrong one while the score for most of them is zero.
:::

**Full answer**

**Why the subprocess**

An in process call cannot survive a generated infinite loop, and it cannot survive a generated call that deletes the file system. A fresh interpreter per candidate takes the code on standard input, writes a JSON envelope of per assertion results to standard output, and dies when it overruns. The harness keeps running.

**The contract**

1. **Extract** the first fenced code block from the generation, with the same post process rule the task spec uses.
2. **Build** a runner script around the code with the task's assertion strings.
3. **Spawn** a new interpreter with a default budget of 3 seconds of wall clock, clamped between 0.1 and thirty seconds by the runner.
4. **Cap** the output: the runner streams standard output and kills the child when the total passes 256 KB, recorded as an error with the detail output overflow.
5. **Deny** dangerous imports by rewriting them to raise an import error: the operating system shell call, subprocess, socket, shutil, the request libraries, and the foreign function interface. The list is a backstop. The timeout and the cap are the load bearing controls.

**The result vocabulary**

| Exit reason | Meaning |
|---|---|
| pass | every assertion passed |
| assertion_fail | the code ran and at least one assertion failed |
| syntax_error | the code did not import |
| timeout | the wall clock expired |
| error | any other crash, including a denylist hit and output overflow |

The score stays a fraction: two of three assertions is 0.667. The exit reason is metadata, so the leaderboard layer can decide whether a timeout counts as zero or as missing data.

**What the smaller harness does**

The smaller harness in the leaderboard lesson runs the prediction in a namespace with stripped builtins, and its test asserts that an import of the operating system module fails. It also caps the batch size for rate limits and pins the task files with a hash so a moved score can be traced to a moved task.

**What this is not**

Not a sandbox for untrusted code from the open web, not a home for stateful tasks with files or network. Those need a container or a microVM.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the denylist not the main control? Expected: determined code can escape any in process guard; the wall clock timeout and the output cap bound run time and output size whatever the code does. They do not bound memory or file writes, so production adds a read only file system and network isolation, or a container.
- **Level 3:** A candidate prints inside an infinite loop. Which control fires? Expected: the output cap at 256 KB, recorded as an error with the detail output overflow; the timeout would fire later.
- **Level 4:** How should the leaderboard treat timeouts, zero or missing? Expected: a documented choice; zero if slow code is wrong for the task, missing if you measure correctness alone, and the exit reason lets you report both.
- **Level 4:** When do assertion strings stop being enough? Expected: when the eval should match production CI; replace them with real unit test files in a container and stop calling the strings tests.

**Wrong answers, and why they fail**

- "A try block around the call is a sandbox." It catches exceptions, not infinite loops, not file deletion, not memory floods.
- "The denylist makes it safe." It is a conservative backstop; the capstone states that it is not bulletproof.
- "Score a timeout as a crash." Keep them distinct in the exit reason; the score can be zero for both, but the reason tells you whether to raise the budget.

:::

## The judge failed to parse and the mean went up

*Level 3 (senior) · debug · about 8 minutes*

Your judge returns a JSON object with a score for each case. The pipeline parses it, and mean faithfulness rose from one week to the next with no change to the product. The logs show that the judge's output failed to parse on a growing share of cases. Explain the rise and fix the pipeline.

:::answer Show the answer
:::say Short answer
A parse failure becomes a missing score, and the aggregate silently drops missing scores. The cases that fail to parse are often the worst outputs, so dropping them lifts the mean. Catch the failure explicitly, record it as its own outcome, count it against the score or report it next to the mean, and alert when the failure share grows.
:::

**Full answer**

**The mechanism**

Bad JSON from the judge becomes a not a number value. A mean over a column with such values excludes them. The lesson names this as the second silent failure of a judge and asks for the parse to fail loudly with its own status.

**Why the exclusion is biased**

The judge breaks its format most often on long, odd or refused outputs. Those are also the low scoring outputs. So the exclusion removes the bottom of the distribution, and the mean rises for a reason that has nothing to do with quality.

**The fix**

1. Wrap the parse in an explicit check and give every case a status: scored, parse failed, judge error.
2. Report the parsed share with every run. A rising failure share fails the run.
3. Publish the mean two ways: with failures counted as zero and with failures excluded. If the two differ a lot, the failures are not random.
4. Allow one retry with a repair prompt, record that a retry happened, and cap retries.
5. Store the raw judge text so a reviewer can read what broke.

**Verify the diagnosis**

Recompute last week's mean with failures counted as zero. If the rise disappears, you have the cause.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why are the failed cases not a random sample? Expected: the judge breaks its format most on long, odd or refused outputs, which are also the low scoring ones.
- **Level 3:** Do you score a failed parse as a zero or leave it out? Expected: both, with the parsed share; a gate should treat a rising failure share as a failed run.
- **Level 4:** How do you design the judge output so this cannot happen silently again? Expected: a strict schema, a validator that rejects anything else, a status field per case, and a run level parse failure metric with an alert.

**Wrong answers, and why they fail**

- "The mean rose, so quality rose." Nothing in the product changed; the denominator did.
- "Retry until it parses." Retries without a record hide the failure and can change the score; record every retry and cap them.
- "Exclude failures, they are judge bugs." The exclusion is biased toward bad outputs; the product number is wrong whatever the cause.

:::

## Three models, fifty tasks, one leaderboard

*Level 3 (senior) · design · about 10 minutes*

You run three candidate models on the same fifty tasks and must publish a leaderboard with a winner. The means are 0.78, 0.75 and 0.10. The second team says their model is tied with the first. Design the aggregation and the statistics that settle it.

:::answer Show the answer
:::say Short answer
Report a mean with a bootstrap interval, a win rate, and a paired interval on the difference for each pair of models. Resample the tasks with replacement to get the interval on each mean. For the tie claim, bootstrap the per task difference between the first two models; if that interval includes zero, the leaderboard shows them as tied.
:::

**Full answer**

**The input**

One record per model and task: model id, task id, metric name, a score in the unit range, and a category. The aggregator refuses any score outside the unit range, because a task that reports 0 to 100 would silently dominate the mean. Normalization belongs in the metric, upstream.

**Two rankings**

- **Mean score** is the headline. It is sensitive to outliers and to task imbalance.
- **Win rate** counts the tasks where the model has the best score; a tie gives every tied model a full win. It is less sensitive to outliers and to scale, and it loses magnitude information.

Report both. Rank by mean by default and keep the win rate column.

**The intervals**

Bootstrap over task ids: resample the fifty tasks with replacement, compute the mean, repeat, and take the percentile interval at the 0.05 level. The low level helpers default to 1000 resamples and the public aggregators to 500. For a pair of models, bootstrap the per task difference and read whether the interval excludes zero. That is the test for the tie claim, and it is paired because both models ran the same tasks.

**Categories and rendering**

If each task carries a category, report a per category mean. A model that is good overall and weak on code shows up there and nowhere else. Render a table sorted by mean with rank, model, mean, interval to two decimals, win rate and task count.

**What this leaves out**

Task weighting; every task counts the same. And independence: ten arithmetic items that share one error pattern are not fifty independent samples. A hierarchical bootstrap that resamples task families, then tasks, is the follow up.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why bootstrap over tasks and not over predictions within a task? Expected: the unit of replication is the task; resampling within a task understates the variance across tasks.
- **Level 3:** When does win rate rank differently from the mean? Expected: when one model wins many tasks by a little and loses a few by a lot; the mean punishes the big losses, the win rate counts the wins.
- **Level 4:** Tasks come in families that share error patterns. What breaks? Expected: the tasks are not independent, so the interval is too narrow; resample families first, then tasks.
- **Level 4:** One task's metric returns 0 to 100 instead of 0 to 1. What should the aggregator do? Expected: refuse the run; a silent rescale would hide the bug, and the metric must return a fraction.

**Wrong answers, and why they fail**

- "Two means with overlapping intervals are tied." The paired difference is the test; separate intervals can overlap while the difference excludes zero.
- "Rank by win rate, it is robust." It loses magnitude; a model that wins every task by a hair and loses one badly looks perfect. Report both.
- "Weight the tasks by importance now." The capstone counts every task the same; add weights only with a documented reason and keep the unweighted table.

:::

## Two harnesses, two pass at k formulas

*Level 3 (senior) · code-reading · about 10 minutes*

Two harnesses in the repository compute pass at k. The first takes the empirical pass rate p and returns `1 - (1 - p) ** k`. The second takes the sample count n, the pass count c and k, and returns `1 - C(n - c, k) / C(n, k)`. Read both. When do they agree, when do they differ, and which one goes in the report?

:::answer Show the answer
:::say Short answer
The first formula treats every draw as independent with success probability p and is a plug in estimate. The second counts the exact chance that k samples drawn from the n you ran contain at least one pass, and it is the unbiased estimator that code generation benchmarks use. They agree only as n grows large; for the samples you ran, the plug in is lower and noisier, and it extrapolates when k exceeds n. Report the unbiased one with the raw counts next to it.
:::

**Full answer**

**Reading the first function**

```python
def pass_at_k(empirical_pass_rate, k):
    if k <= 0:
        return 0
    p = max(0, min(1, empirical_pass_rate))
    return 1 - (1 - p) ** k
```

It clamps p and assumes independent draws. It accepts any k, including a k larger than the number of samples the harness ran, so it can print a pass at ten from five samples.

**Reading the second function**

```python
def pass_at_k(n, c, k):
    if k > n:
        return float(c > 0)
    if n - c < k:
        return 1
    log_prob = 0
    for i in range(k):
        log_prob += math.log(n - c - i) - math.log(n - i)
    return 1 - math.exp(log_prob)
```

It refuses to extrapolate: for k above n it returns whether any sample passed, which is a different quantity and should be labeled as such. When fewer than k samples failed, every k subset holds a pass, so it returns one. Otherwise it multiplies the chance that each of k draws without replacement is a failure, in log space to avoid large binomial coefficients. The estimator layer averages this value over tasks.

**Where they differ**

Take k equal to n. The second says one whenever a single sample passed. The first says less than one, because it imagines drawing with replacement. In general, drawing without replacement makes all k failures less likely, so the exact value is at or above the plug in for the same n and c. The plug in is also a biased estimate with high variance at small n.

**What to report**

Run n samples per task with n at least k, as in the capstone's example of ten samples and pass at five. Report pass at one as c over n, pass at k from the unbiased function, and the raw counts. Never print a pass at k for a k you did not sample.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** In the second function, why return one when n minus c is smaller than k? Expected: you cannot pick k failing samples from fewer than k failures, so every k subset contains a pass.
- **Level 3:** Why compute the product in log space? Expected: binomial coefficients overflow for moderate n; the log of the ratio is a short sum of logs.
- **Level 4:** A team ran five samples per task and reports pass at ten. What is wrong? Expected: k exceeds n, so nothing was measured; the second function falls back to whether any sample passed and the first extrapolates.
- **Level 4:** Do the two functions agree on pass at one? Expected: yes; both reduce to c over n when k is one.

**Wrong answers, and why they fail**

- "They are the same formula." They agree only as n grows; for the samples you ran, the plug in is lower and noisier.
- "Pass at k is the probability the agent is right." It is the chance that a set of k samples contains at least one pass; without a selector the user still gets one sample.
- "More samples per task raise pass at one." They make the estimate more precise; the value is the per sample pass rate.

**Related lesson in this course:** [Lecture 6: Reasoning models: chain of thought, pass@k, GRPO and the DeepSeek-R1 recipe](#lectures-6)

:::

## A long context battery for every model upgrade

*Level 4 (staff) · design · about 12 minutes*

Your team will adopt a new model next quarter and needs a long context evaluation that runs again on every future upgrade. Design the battery for a product that answers questions over long documents and sometimes has to combine facts from several places: the tests, the sampling grid, the metrics, the cutoffs and the regression procedure.

:::answer Show the answer
:::say Short answer
Build a fixed in house harness with three parts: a needle grid over depth and length on your own documents, a multi hop variable tracing task at the same lengths, and a slice of real long document questions. Sample five depths at each length and record pass rates, time to first token and cost per query. Publish two cutoffs, the effective retrieval length at a 90 percent pass and the effective reasoning length at 70 percent, and rerun the same harness on every upgrade.
:::

**Full answer**

**The tests**

1. **Domain needle.** Plant a fact from your domain in filler built from your documents at a chosen depth ratio and total length. Use needles that share no words with the filler, so retrieval needs one step of reasoning rather than keyword matching.
2. **Multi needle.** Plant three facts at different depths and ask for all three. Single needle success does not predict this.
3. **Variable tracing.** Plant a chain such as a first value, a second defined from the first and a third defined from the second, and ask for the last one. This is the task that fails first, and it is the one your product does when it combines facts.
4. **Real questions.** A fixed subset of your long documents with answers, graded per category.

**The grid**

Depths 0, 0.25, 0.5, 0.75 and 1.0 at each length, because models under attend to the middle. Lengths 1k, 4k, 16k, 64k and your target. Plot pass rate as a heatmap per task type.

**The metrics**

Retrieval pass rate, reasoning pass rate, time to first token and cost per query at every length. A million token prompt can take 30 to 120 seconds to prefill, so the product's length budget comes from latency as much as from accuracy.

**The cutoffs**

The effective retrieval length is the longest length where the needle grid passes at 90 percent. The effective reasoning length is the longest length where tracing passes at 70 percent. Expect the second to be 25 to 50 percent of the advertised window, and put both on the spec sheet.

**The regression rule**

Keep the harness fixed and version it. Run it on every candidate model and publish the deltas per task type. Refuse the model card as evidence, refuse vendor self reported scores, and refuse a needle only result for a multi hop workload.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why a fixed harness instead of the newest public benchmark each time? Expected: a regression needs the same test on both models; a changing benchmark confounds the model change with the test change.
- **Level 3:** The new model passes the needle grid at the target length but fails tracing at a quarter of it. What do you ship? Expected: the reasoning effective length as the product limit; chunk or retrieve beyond it and say so on the spec sheet.
- **Level 4:** Prefill at the target length takes two minutes. Does it change the design? Expected: yes; the length budget is what the product can afford in latency and cost, not what the model can read.

**Wrong answers, and why they fail**

- "Run the needle test at the advertised length and stop." Needle only says nothing about multi hop; the lesson refuses it for any multi hop workload.
- "Use the vendor's published long context scores." They are self reported; rerun independently on your use case.
- "Test the middle depth at one length." Models under attend to the middle and degrade with length; one point hides both effects.

:::

## Build an offline eval pipeline for a small model

*Level 4 (staff) · take-home · about 60 minutes*

Take home. We give you a small instruction tuned model, a held out corpus, a set of short factual prompts with gold answers, a set of open form prompts with reference answers, and no network access. Build an evaluation pipeline that reports more than one number and explains its aggregate, and describe how it would run in CI once a network and a judge model are available. What do you deliver, and what do you leave out on purpose?

:::answer Show the answer
:::say Short answer
Deliver one runnable file with four evals: held out perplexity with honest token accounting, normalized exact match on the factual set, token F1 on the open form set, and a deterministic mock judge on a 1 to 5 scale with the same interface a real judge will have. Report every per eval number, a weighted aggregate with the weights in a config, and per example records for diagnosis. Leave out the real judge, intervals on the aggregate and anything that needs a network, and say so in the readme.
:::

**Full answer**

**The four evals**

Each eval covers a dimension the others miss. Perplexity says whether the model fits the language at all. Exact match says whether it produces the gold string on short answers. Token F1 forgives paraphrase on open answers. The judge scores quality that string metrics cannot see. Each is a function from the model and a dataset to a result with the metric, the per example details and a name.

**The details a reviewer checks**

- **Perplexity.** Sum the loss over real target positions, exclude pad targets from the denominator, shift the targets by one, divide once at the end.
- **Normalization.** Lowercase, strip, collapse whitespace, drop trailing terminal punctuation when the sides differ only by it. Token F1 is one when both sides are empty and zero when only one is.
- **Mock judge.** A 5 when the normalized strings match, a 4 at token F1 of at least 0.8, a 3 between 0.5 and 0.8, a 2 between 0.2 and 0.5, a 1 otherwise, with a one line rationale. It is not a judge. It fixes the interface so a real model is a one function swap.

**The aggregate**

Normalize each eval into the unit range: perplexity as one over one plus the log of perplexity, exact match and F1 as they are, the judge divided by 5. The default weights are 0.2, 0.3, 0.3 and 0.2. Put them in a config and print them in the report, because the choice is a product decision, not a fact. Write the report with stable JSON keys and a table for the terminal.

**The CI story**

When a network exists, swap the mock judge for a real one and calibrate it against at least 50 hand labeled cases, with a Spearman correlation of 0.7 or more, before its scores gate anything. Grow the suite to about 200 cases, compare two runs with Wilson and bootstrap intervals, block on a regression beyond 0.3 on any criterion, trigger on prompt and model paths, and upload the report as an artifact.

**What to leave out and why**

The real judge, because there is no network and no human labels to calibrate it. Intervals on the aggregate, because the weights make it a product number; put intervals on the components. Contamination checks, because the training corpus is not provided. Say each omission in the readme.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why keep a mock judge in the deliverable at all? Expected: it fixes the interface and the aggregation path so the real judge is a one function swap, and it keeps the loop runnable offline.
- **Level 3:** Why is the weighted mean a product decision? Expected: weights encode what the product values; the pipeline exposes them in config and reports every component so a reviewer can see what the aggregate hides.
- **Level 4:** What is the first thing you add when a network appears? Expected: a real judge behind the same function, then a calibration run against hand labels before any of its scores gate anything.

**Wrong answers, and why they fail**

- "One accuracy number is the deliverable." A single metric never describes a model; the brief asks for several and for an explanation of the aggregate.
- "Skip perplexity, it is not a task metric." It is the cheapest check that the model fits the language at all, and wrong accounting there is what a reviewer looks for.
- "Hard code the weights." The weights are the product decision; expose them and print them next to the numbers.

:::

## Eight points after a new training corpus

*Level 4 (staff) · design · about 12 minutes*

A model you fine tuned jumped eight points on a public benchmark after you added a new web scraped corpus to the training mix. Leadership wants to announce it. Design the audit that tells you whether the jump is capability or leakage, and say what you would publish instead if it is leakage.

:::answer Show the answer
:::say Short answer
Audit for contamination before anyone announces anything. Search the new corpus for the benchmark questions and their close paraphrases and report the share found, then rerun the model on a versioned custom eval that the corpus cannot contain and diff the individual test cases against the previous model. If the overlap is material and the custom eval did not move, the jump is memorization, and you publish the custom eval result with the contamination share.
:::

**Full answer**

**Why the jump is suspect**

Training corpora scrape the web and the benchmark questions live on the web. Nobody has to intend it. A new scraped corpus is the most likely path for the test to enter training, and a saturated benchmark rewards memorization with large jumps. The same lesson lists teaching to the test and saturation as the other two mechanisms that move a score without moving capability.

**The audit**

1. **Contamination search.** Check what share of the eval questions, or close paraphrases of them, appear in the new corpus. Report exact matches and near matches separately with the method.
2. **Model diff.** Compare the two model versions case by case: which items improved, which regressed, which stayed. If the improvements cluster on the items the search found, the diff names the leak.
3. **Custom eval.** Run both models on your own versioned suite of at least 200 cases with edge cases, kept separate from every training and prompt example. A real gain shows there with an interval; a leak does not.
4. **Separation check.** Confirm that no eval case overlaps with the prompt examples or the fine tuning data, because a test case that was also a training example measures memorization.

**What to publish**

The custom eval numbers with intervals, the contamination share and the method, and the benchmark score with that caveat attached. Never a bare benchmark number. And add the dedup step to the training pipeline so the next corpus is checked against every eval set before training starts.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The search finds exact matches for a small share and paraphrases for more. Which count? Expected: both; paraphrases leak the answer as well, so report exact and near matches separately with the method.
- **Level 3:** The custom eval also rose. Is the jump real? Expected: more likely, if the suite is versioned, separate from training data and large enough that the rise exceeds its interval.
- **Level 4:** How do you prevent the question next time? Expected: deduplicate training corpora against every eval set before training, keep eval data out of prompts and fine tuning data, and record the check in the training report.

**Wrong answers, and why they fail**

- "We did not include the benchmark on purpose, so it is clean." Web scale scraping includes it without intent; the lesson calls this the normal path to contamination.
- "Eight points is too large to be noise." Noise is not the alternative; memorization is, and it produces large jumps.
- "Announce the benchmark and add the caveat later." Publish the custom eval with intervals and the contamination share; a bare benchmark number is the claim you cannot defend.

:::

## The leaderboard winner is worst on code

*Level 4 (staff) · tradeoff · about 10 minutes*

A leaderboard ranks your candidate models by one aggregate score, and the top model wins by a small margin. A colleague on the code team says that the top model is the worst of the three on their work. Both read the same report. How is this possible, what does the aggregate hide, and how do you publish so that both readers are served?

:::answer Show the answer
:::say Short answer
The aggregate is a weighted mean, so a model can win overall and lose in one category, and a small margin can sit inside the interval on the mean. Publish the per category means next to the aggregate, with intervals, and print the weights. If the leaderboard also mixes scales, a task with a wider range dominates the mean without anyone noticing.
:::

**Full answer**

**Where the aggregate comes from**

The eval pipeline normalizes each eval into the unit range and takes a weighted mean; the default mix there is 0.2 for perplexity, 0.3 for exact match, 0.3 for token F1 and 0.2 for the judge. The aggregator in the leaderboard lesson takes the plain mean over tasks. In both cases the headline is one weighting of several numbers, and a different weighting is a different winner.

**What it hides**

- **Category weakness.** The per category column, such as math, reasoning, code and safety, is the only place where a model that is strong overall and weak on code shows up.
- **Task imbalance and outliers.** The mean is sensitive to both; the win rate is less sensitive and loses magnitude.
- **Scale leakage.** A task that scores from 0 to 100 next to tasks in the unit range dominates the mean, so the aggregator refuses scores outside the unit range.
- **The margin.** A small gap between the top two means nothing until the paired bootstrap of their per task difference excludes zero.

The long context lesson states the same rule from another angle: report per category accuracy, because aggregate scores hide large task level differences.

**How to publish**

Three layers on one page. The aggregate at the top with its weights printed. Below it, every per eval or per category number with intervals and the win rate. Below that, the per example records a reviewer needs to chase a regression. Add the paired difference interval for the top two models, and if a category matters to the product, a block rule on that category.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The code team wants the code category to count double. Do you change the headline? Expected: no; keep the unweighted table and, if agreed, add a second weighted view with its weights printed, as the capstone leaves weighting an explicit hook.
- **Level 3:** The top two means differ by less than their intervals. What does the leaderboard show? Expected: the paired bootstrap of the per task difference; if it includes zero the two are tied and the rank order is a coin flip.
- **Level 4:** Which single change to the report would have stopped this argument? Expected: per category means with intervals under the headline, so the code weakness was visible on the same page.

**Wrong answers, and why they fail**

- "The aggregate is the objective answer." It is the answer to one weighting; a different weighting is a different winner.
- "Drop the aggregate and show only categories." The headline exists so people can decide; keep it, label its weights and put the categories under it.
- "Rank by win rate instead." Win rate hides magnitude; publish both and the paired interval.

:::
