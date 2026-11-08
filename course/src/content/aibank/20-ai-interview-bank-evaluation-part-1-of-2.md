---
track: aibank
title: "AI interview bank: Evaluation (part 1 of 2)"
short: Evaluation 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Exact match gives zero to a correct answer

*Level 1 (screening) · concept · about 5 minutes*

Your question answering system returns "June 29th, 2007." The reference says "June 29, 2007." A teammate reports that this case gets a zero and asks you to replace the whole eval with token F1. What do you tell them?

:::answer Show the answer
:::say Short answer
Both metrics are right for different answer shapes. Exact match compares the whole string after normalization, so one extra character makes it zero. Token F1 compares the bags of tokens, so this pair scores about 75 percent. First add normalization to exact match, then pick the metric by the shape of the answers you grade.
:::

**Full answer**

**What each metric compares**

Exact match normalizes both sides and then asks for equality. The capstone's exact match eval lowercases, strips the ends, collapses runs of whitespace and drops trailing terminal punctuation when the two sides differ only by it. After that step "Paris", "Paris." and "  paris  " all count as the same answer. The suffix in "29th" is not punctuation, so this pair still fails.

Token F1 splits both sides into tokens, counts the multiset intersection, and takes the harmonic mean of precision and recall. It forgives word order and paraphrase. It is fooled by lexical overlap: a prediction that shares most tokens with the reference but changes one fact still scores high.

**Which one to use**

| Answer shape | Metric |
|---|---|
| A date, a number, a letter, a label | Exact match with normalization |
| A short phrase with several valid wordings | Token F1, best score over all references |
| A sentence or a paragraph | Token F1 as a floor, a calibrated judge for meaning |

**Why not switch everything**

Token F1 pays for shared words, not for correctness. A long answer that repeats the question and then gives the wrong entity can score higher than a short correct answer. Keep exact match where the answer is deterministic. Use token F1 where paraphrase is normal. Use a judge where only meaning counts, and calibrate it first.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does a token F1 of one mean? Expected: the prediction and the reference have the same multiset of tokens after normalization, in any order.
- **Level 2:** The reference is "Paris" and the prediction is "Paris." Which metric fails without normalization? Expected: exact match; with the trailing punctuation rule it passes.
- **Level 2:** When do you take the best score over several references? Expected: when a question has more than one valid answer string; the F1 and ROUGE-L metrics take the highest scoring target.
- **Level 3:** Token F1 is high and the answer is wrong. How did that happen? Expected: lexical overlap with wrong content, such as a wrong entity inside a sentence that shares most tokens with the reference; grade the entity with exact match or use a judge.

**Wrong answers, and why they fail**

- "Exact match is broken, so remove it." Exact match with normalization is the right metric for dates, numbers and multiple choice letters; the missing step is normalization.
- "Token F1 understands meaning." It counts shared tokens; two answers with no shared tokens can both be right, and a wrong answer can share most tokens.
- "A human would give this 100, so always use a judge." A judge costs money and needs a calibration run; for a date, normalized exact match is free and exact.

:::

## Overlap metric, judge model or human review

*Level 1 (screening) · tradeoff · about 6 minutes*

You can score a summarization feature in three ways: n-gram overlap against a reference, a strong model that grades with a rubric, or human experts. The team has one afternoon and a small budget. How do you decide which to use, and for what?

:::answer Show the answer
:::say Short answer
Use all three, each for a different job. Overlap metrics are free and instant but agree with people only 40 to 60 percent of the time, so they serve as a baseline and a smoke test. A judge model costs a few dollars per thousand cases and agrees 82 to 88 percent with people on a well anchored rubric, so it is the default scorer. People are the ground truth, so spend them on calibrating the judge and on edge cases, not on every commit.
:::

**Full answer**

**The trade**

| Method | Speed | Cost per thousand | Agreement with people | Use |
|---|---|---|---|---|
| BLEU or ROUGE | under a second | nothing | 40 to 60 percent | baselines, smoke tests |
| Embedding similarity | about 30 seconds | nothing | 55 to 70 percent | screening |
| Judge model, small tier | about 3 minutes | about 8 dollars | 82 to 86 percent | default CI judge |
| Judge model, large tier | about 5 minutes | about 25 dollars | 85 to 88 percent | high stakes, safety |
| Human expert | about 2 hours | about 500 dollars | ground truth | calibration, policy |

**Why each one stays**

Overlap metrics miss meaning. Two answers with no shared words can both be right, and a high ROUGE answer can be wrong in context. They stay because they cost nothing, run in seconds and do not drift when a judge model changes.

The judge captures relevance, correctness, helpfulness and safety. It stays the workhorse because it scales. It needs a rubric with anchored levels and a calibration run against human labels before its number means anything.

Human review is slow and expensive. It stays because it is the only ground truth. Reserve it for calibrating the automated scores and for the cases the judge cannot settle.

**For the afternoon**

Run the overlap metric on everything to catch gross breakage. Run the judge on the golden set with the four criteria. Have two people label a small slice and compare it with the judge before anyone reads the mean.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does ROUGE measure? Expected: recall of reference n-grams, built for summarization.
- **Level 2:** Why keep the overlap metric once you have a judge? Expected: it is free and fast, it catches gross regressions in seconds, and it does not move when the judge model changes.
- **Level 2:** When is a judge not enough? Expected: high stakes or policy decisions, and any time the judge has not been calibrated against human labels on this task.
- **Level 3:** The lesson says the judge must be at least as capable as the model it grades. Why? Expected: a weak judge gives noisy, inconsistent scores and cannot see the errors a stronger model makes.

**Wrong answers, and why they fail**

- "People are the gold standard, so grade everything by hand." Human review takes hours and costs about 500 dollars per thousand cases, so it cannot run on every change.
- "Overlap metrics are useless for generation." They catch gross regressions and cost nothing; they only miss meaning.
- "Pick one metric and optimize it." Optimizing only correctness yields terse answers that nobody can use; score several criteria.

:::

## Two points on a saturated benchmark

*Level 1 (screening) · concept · about 6 minutes*

A vendor shows you that their new model scores 89 percent on a public multiple choice benchmark and the model you run today scores 87. They say the gap proves the new model is smarter. Why are you not convinced, and what do you ask for instead?

:::answer Show the answer
:::say Short answer
Public benchmarks stop telling models apart once every frontier model sits in a narrow band near the top. Three mechanisms cause this: training data that contains the test, training mixes tuned to the test format, and saturation, where the questions that remain are ambiguous or mislabeled. A gap of two points in that band is noise or memorization. Ask for a run on your task with your data.
:::

**Full answer**

**The compression**

The benchmark in the lesson has 15,908 questions across 57 subjects. Within three years the frontier models compressed into a 3-point range at the top. A model that scored 88.7 percent on it could not count the letters in a short word, a task that needs no world knowledge. The score measures the benchmark, not the job.

**Three mechanisms**

1. **Data contamination.** Training corpora scrape the web, and the questions live on the web. Nobody has to cheat for the answers to end up in training.
2. **Teaching to the test.** Labs tune the training mix toward the format. On a 4-way multiple choice test, a model that learns the answer distribution gains points without knowing the answers.
3. **Saturation.** When every model scores 85 to 90 percent, the remaining 10 to 15 percent of questions are often ambiguous, mislabeled or obscure. Moving from 87 to 89 can mean two more memorized questions.

**What to ask for**

- A custom eval on your task: at least 50 cases for a prototype and 200 or more for a production decision, with edge cases and adversarial inputs.
- Per-category results, not one aggregate.
- A contamination check: search the training corpus for the eval questions and close paraphrases.

Benchmarks still help with rough model selection. The final decision needs your eval.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Name the three categories of evaluation. Expected: public benchmarks, custom evals on your own data, and human evals.
- **Level 2:** A model does not know an answer. How does the test format still help it? Expected: the test has four options with a near uniform answer distribution, so format knowledge alone raises the score.
- **Level 2:** What are benchmarks still good for? Expected: rough model selection before you build a custom eval.
- **Level 3:** How would you test whether a benchmark leaked into training? Expected: search the training corpus for the eval questions and close paraphrases, and report the share that appears.

**Wrong answers, and why they fail**

- "Two points on a standard benchmark is a real gap." At the top of a saturated benchmark the remaining questions are often ambiguous or obscure, so two points can be two memorized questions.
- "Labs cheat by training on the test." Web scale scraping pulls the questions in without intent; the effect is the same, and the fix is a contamination audit, not an accusation.
- "Use the coding benchmark instead." A function completion benchmark with 164 problems covers isolated function generation and says nothing about debugging or refactoring across files.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## What a perplexity of 10 tells you

*Level 1 (screening) · concept · about 5 minutes*

A colleague reports that the new checkpoint reaches a perplexity of 10 on the held out text, better than last week, and wants to ship it as the stronger model. What does the number mean, and what does it not tell you?

:::answer Show the answer
:::say Short answer
Perplexity is the exponential of the mean negative log likelihood per token. A value of 10 means that at each position the model is as uncertain as a uniform choice among 10 options. Lower is better only while the test set and the tokenizer stay fixed. It says nothing about instruction following, reasoning or factual accuracy, so treat it as a sanity check and run the task evals before you ship.
:::

**Full answer**

**The definition**

```text
PPL = exp( -(1/N) * sum_i log P(token_i | context) )
```

A perplexity of one means the model assigns probability one to every real token. A perplexity equal to the vocabulary size means the model is uniform and learnt nothing. A strong base model on a standard corpus sits around eight to twelve; a bad one on the same text sits at fifty plus.

**What it misses**

A model can reach low perplexity by predicting common patterns well while it is bad at rare but important ones. The number also ignores everything a chat model is for: following instructions, reasoning and being right. Use it to catch a broken checkpoint or a tokenizer mismatch, not to pick a winner.

**Two checks before you trust it**

1. **Same text, same tokenizer.** The number depends on both. Two models measured on different held out sets cannot be compared.
2. **Honest counting.** Sum the loss over real token positions and divide once at the end. Pad positions must not be in the denominator, and the logits at one position predict the next token. A value below one is impossible. It means the summed negative log likelihood came out negative, and the usual cause is an adapter that returned log p instead of negative log p.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which perplexity value means the model is never surprised? Expected: one, because every real token then has probability one.
- **Level 2:** Two models were measured on different test sets. Can you compare their perplexities? Expected: no; the number depends on the text and the tokenizer, so measure both on the same set.
- **Level 2:** The adapter reports a perplexity of 0.8. What happened? Expected: the summed loss is negative, most likely because the adapter returned log p instead of negative log p; a perplexity below one is impossible, so the contract was violated.
- **Level 3:** Why does the eval sum the loss over non pad positions and divide at the end instead of averaging per batch perplexities? Expected: averaging per batch gives each token of a short batch more weight than each token of a long batch, and pad positions shrink the loss; the sum over real tokens matches the definition.

**Wrong answers, and why they fail**

- "Lower perplexity means a better assistant." It measures fit to the text distribution, not instruction following or correctness.
- "Perplexities from two papers are comparable." They depend on the test set and the tokenizer, so only same set comparisons hold.
- "Aim for a perplexity near one." The held out text is not the model's own output; a value near one would suggest the test text was in the training data.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## A four point win on fifty cases

*Level 2 (working) · estimate · about 8 minutes*

A prompt change scores 90 percent on your 50 case golden set, and the baseline scored 86 on the same set. The author wants to ship it as a four point win. How sure can you be, and what sample size would you need to make this call?

:::answer Show the answer
:::say Short answer
At 50 cases and 90 percent observed accuracy, the 95 percent interval runs from 78 to 97 percent, a 19 point spread. A four point gap sits well inside that spread, so the win cannot be told from noise. You need about 200 cases to detect a 5 percent change, and 500 or more when two systems are close.
:::

**Full answer**

**The table**

| Cases | Observed accuracy | 95 percent interval width | Detects a 5 percent regression |
|---|---|---|---|
| 50 | 90 percent | 19 points | no |
| 100 | 90 percent | 12 points | barely |
| 200 | 90 percent | 9 points | yes |
| 500 | 90 percent | 5 points | with confidence |
| 1000 | 90 percent | 3 points | precisely |

The width falls roughly with the square root of the sample size. Four times the cases cut the width by about half.

**The interval**

For a pass rate the lesson uses the Wilson interval, which stays correct at small samples and at proportions near zero or one. The normal interval fails in both places, and those are the places where releases get decided.

**The paired case**

Both versions ran on the same 50 cases, so compare them as pairs. A paired test or a paired bootstrap on the per case differences is tighter than two separate intervals. It still will not rescue a four point gap on 50 cases, but it is the right test once the set is large enough.

**How to build to 200**

The lesson splits the set into a golden core of 50 to 100 curated cases, 20 to 50 adversarial cases and 100 to 200 samples of real traffic. Version the set, and compare two runs only on the same version.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the interval shrink slowly as you add cases? Expected: the width falls with the square root of the sample size, so four times the cases halve the width.
- **Level 2:** The two runs used identical cases. Does that help? Expected: yes; a paired comparison on per case differences is tighter than two independent intervals.
- **Level 3:** Which interval does the lesson use for a pass rate, and why? Expected: the Wilson interval, because it behaves correctly at small samples and extreme proportions where the normal approximation fails.
- **Level 3:** You can afford 200 judge calls per run. How do you split them? Expected: a golden core, an adversarial slice and a sample of production traffic, versioned and fixed between the two runs you compare.

**Wrong answers, and why they fail**

- "Four points is four points." On 50 cases the interval is 19 points wide; a four point gap is noise.
- "Run the same 50 cases three times." Repeating the cases measures the model's variance, not the population; the interval over cases stays wide.
- "Always use a thousand cases." A thousand cases give a 3 point width but cost five times a 200 case run; use 200 for routine decisions and 500 or more for close calls.

:::

## A perfect needle test and a long contract

*Level 2 (working) · concept · about 8 minutes*

A model card advertises a context window of one million tokens and a perfect score on a needle in a haystack test at that length. Your product asks the model to reconcile figures that appear in several places across a long contract. Does the card answer your question, and what do you measure instead?

:::answer Show the answer
:::say Short answer
No. A single needle test measures retrieval of one planted fact, and frontier models saturate it. Your task is multi hop aggregation, which degrades sharply past about 128k tokens on most models. Run a multi hop test at your target length and report two numbers: the effective retrieval length and the effective reasoning length.
:::

**Full answer**

**What the needle test measures**

Place one fact at a controlled depth in filler text and ask for it. Sweep depth and length. It is the baseline, and it is necessary but not sufficient. Single needle success does not predict multi needle success, and neither predicts reasoning over dispersed facts, which is the first task to fail.

**What the harder benchmarks add**

- A multi task suite with 13 task types across retrieval, multi hop tracing, aggregation and question answering. In its first release only half of 17 models that claimed 32k context kept their quality at 32k.
- A multi round coreference test with 8, 24 or 100 needles, which shows how many facts a model can hold at once. On one advertised 10M token model, the 8 needle variant fell to 26.3 percent at 1M tokens.
- Non lexical needles that share no words with the query, so retrieval needs one reasoning step.

**The two numbers for your spec sheet**

1. **Effective retrieval length**: the longest context where the needle test still passes at a threshold such as 90 percent.
2. **Effective reasoning length**: the longest context where a multi hop or aggregation task passes at a threshold such as 70 percent. It is usually 25 to 50 percent of the advertised window.

**Build the test for your contract**

Plant three linked assignments in filler, such as a value, a second value defined from the first and a third defined from the second, and ask for the last one. Test depths 0, 0.25, 0.5, 0.75 and 1.0 at each length. Use needles that do not share keywords with the filler. Record the time to first token with every run; a million token prompt can take 30 to 120 seconds to prefill.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a single needle pass not predict a three needle pass? Expected: several facts need attention at several positions at once; the multi needle test measures juggling, not retrieval.
- **Level 2:** Which depths do you test? Expected: 0, 0.25, 0.5, 0.75 and 1.0, because models under attend to the middle of the input.
- **Level 3:** The planted fact uses the same words as the surrounding text. What goes wrong? Expected: retrieval becomes trivial lexical matching; use a needle with no literal overlap.
- **Level 3:** What do you measure next to accuracy at the target length? Expected: time to first token and cost per query; a million token prompt can take 30 to 120 seconds to prefill.

**Wrong answers, and why they fail**

- "The vendor's score is independent evidence." Vendors publish their own scores; rerun on your task at your length.
- "Pass at one million means pass at every shorter length and every task." Report the curve per task type; an aggregate hides large task level differences.
- "Test the middle depth only." Many implementations do; the middle is where models under attend, so test five depths.

:::

## BLEU 28.3 in one paper and 0.283 in another

*Level 2 (working) · debug · about 8 minutes*

Two papers report BLEU on the same test set. One says 28.3 and the other says 0.283. A third team reports a ROUGE-L score ten points below yours on the same outputs. Your manager asks which number is right. How do you answer?

:::answer Show the answer
:::say Short answer
All of them can be right for different metric setups. BLEU is a fraction, and one paper multiplies it by a hundred. ROUGE-L moves by ten points when one library lowercases and the other does not, or when the two tokenize differently. Read the metric setup before you compare, and in your own harness fix one tokenizer and one smoothing rule and pin them with tests.
:::

**Full answer**

**The scale**

The two BLEU numbers are the same score on two scales. Nothing to debug; write the scale next to every number you publish.

**The tokenizer**

The capstone uses one tokenizer for every metric: lowercase the text and keep runs of word characters. Every metric reads the same tokens. Swap the tokenizer and you run a different benchmark. The ten point ROUGE-L gap is what that swap looks like when one side keeps case and the other drops it.

**What else is inside the number**

- **BLEU-4** counts modified n-gram precision for n from 1 to 4. The count of each candidate n-gram is clipped at its maximum count in any reference, so a candidate cannot win by repeating one phrase. The brevity penalty lowers the score of a candidate shorter than the reference. Add one smoothing on the counts avoids a log of zero when no 4-gram matches, and stays close to the unsmoothed value on long candidates.
- **ROUGE-L** finds the longest common subsequence. Recall is the subsequence length over the reference length, precision is the same over the candidate length, and the score is their F1.

**What to do in your harness**

Write the metrics yourself so a colleague can audit them. Pin them with reference vectors from worked examples, not from a third party library. Test the edge cases: empty prediction, empty reference, no shared tokens, an exact match and a repeated phrase.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does clipping matter in BLEU? Expected: a candidate that repeats one matching phrase would inflate n-gram precision; clipping caps the count at the reference count.
- **Level 2:** What does the brevity penalty do? Expected: it lowers the score of a candidate shorter than the reference, so a short output cannot win on precision alone.
- **Level 3:** Why add one to the n-gram counts? Expected: a pair with no matching 4-gram would give a log of zero and a score of zero; smoothing keeps the geometric mean finite and barely moves long candidates.
- **Level 3:** How do you keep your metric numbers comparable across a year of runs? Expected: pin the tokenizer and the smoothing in code, keep reference vectors in tests, and record the metric version with every leaderboard.

**Wrong answers, and why they fail**

- "Use the library everyone uses." Two libraries differ by ten points on the same outputs; you still need to know which tokenizer and casing each applied.
- "BLEU is old, drop it." It still backs most published numbers; learn to read it, then layer model based metrics on top.
- "Lowercasing cannot move a score by ten points." The capstone reports that it does for ROUGE-L across two libraries; casing changes which tokens match.

:::

## Before a judge score can gate a release

*Level 2 (working) · concept · about 8 minutes*

You wrote a rubric, and a judge model now scores faithfulness for your retrieval system. The dashboard shows a high mean, and the team wants to use it as the release gate from Monday. What has to happen before this number can block or approve a release?

:::answer Show the answer
:::say Short answer
Calibrate the judge against people first. Hand label about 100 cases, score them with the judge, and compute the Spearman correlation between the two rankings. Below 0.7 the rubric needs work and the number is noise. Then freeze the judge model and version, and read the bottom scores as well as the mean.
:::

**Full answer**

**Why a raw judge score lies**

A judge fails in three silent ways. It carries biases: it prefers longer answers, answers from its own model family and answers that match the prompt style. It can return bad JSON, which becomes a missing score that drops out of the aggregate and raises the mean. It drifts: a new judge version changes every metric at once.

**The calibration run**

1. Label at least 50 cases by hand; the lesson uses 100. Cover the bottom of the distribution, not only easy cases.
2. Score the same cases with the judge.
3. Plot judge against human and compute the Spearman rank correlation.
4. A correlation below 0.7 means the rubric needs work. A judge at 0.3 is noise.

Use a judge from a different model family than the generator. A model that grades its own family inflates the score by about 10 to 20 percent.

**After the run**

- Freeze the judge model and version. When you upgrade, run the old and the new judge on the same baseline before you compare anything.
- Inspect the bottom quantile. A mean of 0.85 can hide a 5 percent slice of catastrophic failures.
- Version the eval set and tag it with every change, so that a score this month means the same as a score last month.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why Spearman and not the mean difference between judge and human scores? Expected: Spearman compares rankings, so a judge that is harsh but orders the cases the same way still passes.
- **Level 2:** What is the smallest hand labeled set the lesson accepts? Expected: it refuses a judge tested on fewer than 50 human labeled examples.
- **Level 3:** The judge is the same model that writes the answers. What will the calibration run probably show? Expected: inflated scores by about 10 to 20 percent; switch the judge to another model family.
- **Level 3:** The correlation passes, but the bottom decile holds confident wrong scores. Do you ship? Expected: no; the mean correlation can hide catastrophic failures, so inspect the lowest 10 percent before the number gates anything.

**Wrong answers, and why they fail**

- "The rubric is clear, so the judge is right." Length and family biases survive a clear rubric; only a correlation against human labels shows their size.
- "It agrees with our old metric, so it is calibrated." The old metric may share the bias; calibrate against people.
- "Calibrate once and keep upgrading the judge." Each judge version changes every score; freeze the version or rerun the baseline in parallel.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Every metric moved and the product did not

*Level 2 (working) · debug · about 7 minutes*

Overnight every metric on the eval dashboard moved by several points, up for some criteria and down for others, with no prompt change and no model change in the product. The last merged change switched the judge to the newest version of its model. What happened, and how should such a change be made?

:::answer Show the answer
:::say Short answer
The judge is part of the measurement, so a new judge version changes every metric at once while the product stands still. Freeze the judge model and version in the pipeline. When you upgrade, run the old and the new judge on the same baseline in parallel, calibrate the new judge against the human labeled set, and reset the baseline before you compare anything new.
:::

**Full answer**

**Why everything moved**

A judge score is a function of the output and of the judge. Change the judge and every stored score is in a different unit. The lesson lists judge version drift as one of the three silent failures and asks you to flag any pipeline where a judge upgrade lands without a parallel baseline eval.

**The upgrade protocol**

1. Pin the judge model and version, and record both with every run.
2. Before a switch, score a frozen baseline set with the old and the new judge.
3. Calibrate the new judge: Spearman correlation with the hand labeled set of 0.7 or more.
4. If the new judge calibrates better, adopt it and rescore the stored baselines so that history and new runs share one judge.
5. Mark the switch on every chart.

**Other things that move every score**

An edit to the eval set without a version tag. A change in how missing scores are counted. A run that dropped some tasks. Tag the dataset with every change and record the task count.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What else can move every score without a product change? Expected: an eval set edit without a version tag, or a change in how missing scores are counted.
- **Level 2:** How do you tell a judge change from a product regression next time? Expected: the run metadata records the judge model and version, so a diff of the metadata answers it.
- **Level 3:** The new judge correlates better with the human labels. Do you adopt it? Expected: yes, but rescore the stored baseline with it first so that old and new numbers share one judge.
- **Level 3:** You must keep a trendline across the switch. How? Expected: score a fixed frozen set with both judges, publish the offset per criterion, and mark the switch on the chart.

**Wrong answers, and why they fail**

- "Newer judge, higher scores, ship it." The product did not change; the number did. A judge change needs a parallel baseline.
- "Follow the newest judge version automatically." Automatic upgrades make every trendline meaningless; pin the version.
- "A minor version does not need recalibration." Any version change can change the scores; rerun the correlation.

:::

## Pass at one of 0.6 and pass at five of 0.95

*Level 2 (working) · tradeoff · about 8 minutes*

Your coding agent scores a pass at one of 0.6 on the fixture suite and a pass at five of 0.95. One manager reads this as a failing agent; another reads it as a passing agent. What does each number tell you, and what do you put in the report?

:::answer Show the answer
:::say Short answer
Pass at one says the first sample fixes the task on about six tasks in ten. Pass at five says that at least one of five samples passes on almost every task, so the right answer is usually within reach and the gap is selection. Report both, with the raw pass counts per task, because pass at k alone hides an agent that succeeds once in twenty tries.
:::

**Full answer**

**What the harness computes**

The harness runs each fixture task k times. Each sample goes through a deterministic verifier: a file equals an expected file, a regex matches, or a shell command exits zero. The per task pass rate p is passes over samples. Pass at k is the chance that k samples contain at least one pass. The harness also stores the raw counts, so a reviewer can see the variance behind the rate.

**Reading the gap**

A low pass at one with a high pass at five says the agent is stochastic, not incapable. The fix is sampling plus ranking: generate several candidates and let a verifier choose. It is not always more training. Without a selector in production, the user receives the first sample, so pass at one is the number they feel.

**Why both numbers stay**

Pass at k papers over a real failure. An agent that passes once in twenty tries has a respectable pass at twenty and is useless. The harness prints both so that neither manager can read the result alone.

**The rest of the report**

The harness exists to stop three failures: an unverified pass, where the agent claims success and nobody checks; an undetected regression, where a prompt change makes the loud task 4 percent better and the quiet task 14 percent worse; and per task drift, where Monday ran 100 tasks and Friday ran 95 because five were renamed. So the report carries pass at one, pass at k, per task counts, mean and 95th percentile latency, and mean cost, over the same fixed task list every run.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What do you need in production to turn a high pass at five into a high pass at one? Expected: a verifier that selects the passing sample, such as tests that run; without it the user gets the first sample.
- **Level 2:** Why does the harness print raw pass counts next to the rate? Expected: to show variance per task and expose a task that passes once in many tries.
- **Level 3:** The pass rate rose from Monday to Friday while five fixtures were renamed. Is it real? Expected: no; the task set changed, so the runs are not comparable, and the harness must run every fixture every time in a fixed order.
- **Level 3:** Which three failure modes does the harness exist to prevent? Expected: unverified pass, undetected regression across tasks, and drift in the task set.

**Wrong answers, and why they fail**

- "Pass at five is the real score." It measures the ceiling with selection; users get one sample unless you build the selector.
- "A pass at one of 0.6 means the agent is broken." It means the first sample fails on four tasks in ten; the high pass at five says the capability is there and selection is the gap.
- "Trust the agent's own success report." Self reported success is the first failure mode the harness exists to remove; a deterministic verifier decides.

**Related lesson in this course:** [Deep dive 9: evaluating agents](#aideep-9)

:::

## The mean is green and users see failures

*Level 2 (working) · debug · about 8 minutes*

A faithfulness dashboard reports a mean of 0.85 over a thousand cases, above the 0.8 release threshold. Support tickets say the assistant invents policy details in some answers. The eval owner says the metric is green. Where do you look, and what do you change in the report?

:::answer Show the answer
:::say Short answer
A mean hides the tail. A mean of 0.85 is consistent with a 5 percent slice of catastrophic failures, and that slice is what becomes tickets. Sort the cases by score and read the lowest 10 percent. Then add a pass rate at a threshold and a bottom quantile alert to the report, next to the mean.
:::

**Full answer**

**Why the dashboard is green**

Most cases score high while a small slice scores near zero. The average barely moves, because the slice is small. The users in that slice get an invented policy, and no average tells them it was rare.

**What to report**

- **Pass rate.** The fraction of cases above a threshold. It measures reliability, which is what users feel, so it is more actionable than the mean.
- **Bottom quantile.** The lesson refuses aggregate only reporting without the lowest 10 percent surfaced. Read those cases by hand every run.
- **Per-category scores.** If the tail comes from one category, the fix is local and the gate should watch that category.

**How to debug it**

1. Pull the lowest scoring cases and read them. Confirm they match the tickets.
2. Check how missing scores were counted. A judge that returned bad JSON produces a missing score, and dropping missing scores raises the mean.
3. Check that the judge was calibrated at the low end. A hand labeled set made of easy cases says nothing about the tail.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the lesson prefer the share of cases above a cutoff to the mean? Expected: it counts how many cases are good enough, so it measures reliability.
- **Level 2:** The lowest cases all come from one category. What changes? Expected: the fix is local; report per-category scores and gate on the weakest category, not the aggregate.
- **Level 3:** Missing scores from parse failures were dropped before averaging. What did that do? Expected: it raised the mean, because the worst outputs often fail to parse; count them as failures or report them separately.
- **Level 3:** Which alert do you add to the release gate? Expected: a floor on the lowest 10 percent and a pass rate threshold, both next to the mean.

**Wrong answers, and why they fail**

- "The mean passed, so the release passed." A mean of 0.85 often hides a 5 percent catastrophic slice; the gate needs the tail.
- "Raise the mean threshold to 0.9." A higher mean threshold still hides a small slice of zeros; add a distribution measure.
- "The judge is noisy at the bottom, so ignore those cases." That is where the failures live; calibrate the judge on low scoring cases too.

:::

## The model that writes the answer grades it too

*Level 2 (working) · tradeoff · about 8 minutes*

Your product generates answers with one model, and your eval pipeline grades them using that same model plus a rubric. Scores rose after the last release and the team is pleased. A reviewer asks why the gain might not be real. What is the risk, and what do you change?

:::answer Show the answer
:::say Short answer
A model that grades its own family prefers its own style, so self evaluation inflates scores by about 10 to 20 percent. The rise can mean the judge likes the new outputs more, not that users do. Move the judge to a different model family, calibrate it against human labels, and score the baseline and the new version again under that judge.
:::

**Full answer**

**Where the bias comes from**

A judge is a model with preferences. It favors longer answers, answers from its own model family and answers that match the prompt style. When the judge comes from the generator's own family, every release that moves the output toward the judge's taste looks like an improvement. The lesson calls this self preference and measures the inflation at about 10 to 20 percent.

**Why the release looked better**

A release changes tone, length and structure as well as content. The judge rewards the first three. Without a separate signal you cannot tell which part of the gain is content.

**What to change**

1. Pick a judge from a different model family. Use the cheapest model that still meets the calibration threshold.
2. Calibrate it: hand label at least 50 cases, the lesson uses 100, and require a Spearman correlation of 0.7 or more with the human ranking.
3. Score the old and the new release under the same judge and report the difference, not the absolute score.
4. Normalize for length, or state in the rubric that length does not count.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which two other judge biases does the lesson name next to self preference? Expected: position bias in pairwise comparison and verbosity bias toward longer answers.
- **Level 2:** The judge from another family is cheaper but correlates less with people. Which one do you take? Expected: the cheapest judge that still meets the calibration threshold; below the threshold the number is noise whatever the family.
- **Level 3:** You cannot change the judge family this quarter. What limits the damage? Expected: calibrate against human labels and publish the correlation, normalize for length, and read only relative changes under the frozen judge.
- **Level 3:** After the switch, how do you tell a real gain from a judge preference? Expected: both versions scored by the new judge, the difference with a confidence interval, and a human labeled slice of the cases that moved most.

**Wrong answers, and why they fail**

- "The judge has a rubric, so its family does not matter." The rubric does not remove the preference for its own style; the lesson measures a 10 to 20 percent inflation.
- "Use the strongest model we have as the judge, which is the one we ship." Strength does not remove self preference; a different family at similar strength is the fix.
- "Scores went up, so quality went up." The score is a proxy; the output may have moved toward what the judge rewards, such as length and tone.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::
