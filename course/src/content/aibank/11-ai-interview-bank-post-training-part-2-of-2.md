---
track: aibank
title: "AI interview bank: Post-training (part 2 of 2)"
short: Post-training 2
sub: 9 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Margin up, chosen answers down, in a DPO run

*Level 3 (senior) · debug · about 12 minutes*

During a DPO run the loss falls and the reward margin that the trainer logs grows every epoch. Yet the model's samples get shorter and less fluent, and the policy now gives the chosen training answers a lower probability than they had under the reference. Explain the mechanism and what you change.

:::answer Show the answer
:::say Short answer
The DPO loss cares only about the difference of two log ratios. It can lower the probability of the chosen answer as long as the rejected answer falls faster, and the margin still grows. This is the degraded chosen response failure: the policy moves probability mass away from both training answers, often toward short degenerate outputs. Log the absolute chosen log-probability, add a penalty on downward moves of the chosen term as the behavior-preserving variant does or switch to a loss with a bounded margin, and keep a generation eval next to the margin.
:::

**Full answer**

**Why the margin can lie**

The DPO gradient pushes the chosen log ratio up and the rejected log ratio down, but only their difference enters the loss. If the rejected answers are easy to suppress, the cheapest way to grow the margin is to suppress them hard while the chosen answers drift down too. The implicit reward gap is also unbounded: a weak preference can produce an arbitrarily large gap. Nothing in the loss asks the policy to keep generating the chosen answers.

**What you log**

- The absolute chosen log-probability under the policy, per epoch, next to the margin. The capstone's margin function reports the difference; add the chosen term alone.
- Sample lengths and a small generation eval. A margin that grows while samples degrade is the signature.
- The KL to the reference. The move away from both answers shows up as a growing distance.

**The fixes**

1. A penalty on downward moves of the chosen log-probability. The behavior-preserving variant of the family adds that one correction and reports a gain over plain DPO on reasoning tasks.
2. A bounded margin. The identity-mapping variant replaces the log sigmoid with a squared error on a target of one over two beta, so the gap and the preference strength stay proportional.
3. A conservative beta and early stopping, chosen against a generation eval, not against the training margin.
4. Better pairs. Pairs where both answers are rare under the reference produce arbitrary implicit rewards; filter them.

**Why this is still over-optimization**

Direct alignment methods remove the explicit reward model, not the proxy. The quantity they optimize is a ratio against the reference, and that ratio can be pushed to places the preference data never covered. The same peak-and-collapse curve that reward models show appears here across KL budgets.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does length matter in this failure? Expected: a long rejected answer has a more negative total log-probability by construction, so suppressing it is cheap and the gap grows for the wrong reason; length normalization removes that incentive.
- **Level 3:** How does a reference-free, length-normalized loss change the picture? Expected: it scores the average log-probability per token with a margin, which removes the length bias and the reference, but it also removes the anchor, so drift needs its own guard.
- **Level 4:** Which variant do you pick when preference strengths vary widely across pairs? Expected: the bounded one; it keeps the gap proportional to the preference, so strong pairs do not saturate the loss and weak pairs do not blow up.
- **Level 4:** Does a lower beta help here? Expected: no; a lower beta lets the policy move further from the reference for the same margin, which makes the degradation worse.

**Wrong answers, and why they fail**

- "The margin grows, so training works; the samples are a decoding problem." The margin can grow while both answers lose probability; the generation eval is the objective, not the margin.
- "Raise beta until the samples recover." A higher beta slows the drift but does not change the direction of the gradient on the chosen term; the penalty on that term does.
- "Train more epochs; the chosen probability will come back." The loss has no term that rewards a higher chosen probability on its own, so more epochs push further the same way.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Pick a preference loss for four kinds of data

*Level 3 (senior) · design · about 15 minutes*

Four teams bring you four datasets. One has thumbs-up and thumbs-down clicks on single answers. One has paired comparisons whose preferred answers are mostly twice the length of the rejected ones. One has no SFT checkpoint and wants a single training stage from the base model. One has pairs where some preferences are near coin flips and others are unanimous. Which preference loss do you recommend to each team, and why?

:::answer Show the answer
:::say Short answer
The clicks team gets the prospect-theory loss that works on single labels. The length-skewed team gets the reference-free loss that normalizes by length and adds a margin, so a longer winner does not win by its token count. The team without an SFT stage gets the odds-ratio loss, which adds a preference term to the SFT likelihood and trains from the base in one pass; the team with mixed preference strengths gets the identity-mapping loss, whose margin is bounded. Each one repairs one assumption that plain DPO makes.
:::

**Full answer**

**Start from what DPO assumes**

The DPO derivation assumes paired data, an SFT reference that is the true anchor, in-distribution pairs, and a preference that maps to an unbounded log-odds. Each member of the family drops or repairs one of these.

| Data or constraint | Loss | What it changes |
|---|---|---|
| Single answers with good or bad labels | KTO | prospect-theory utility on one label; losses weigh more than gains; no pairs needed |
| Winners much longer than losers | SimPO | average log-probability per token plus a margin; no reference model |
| No SFT checkpoint, one stage | ORPO | SFT negative log-likelihood plus an odds-ratio preference term; the SFT term is the regularizer |
| Preference strength varies widely | IPO | squared error on a target of one over two beta; the gap is bounded |
| Chosen log-probability falls in the DPO logs | BPO | DPO plus a penalty on downward moves of the chosen answer |
| A large clean paired set | DPO | a conservative beta |

**The reasoning for each team**

1. Clicks are plentiful and unpaired. Forcing them into pairs throws away most of the data; the unpaired loss uses every label.
2. In plain DPO a long winner has a more negative log-probability by construction, so the gap grows for the wrong reason and the policy learns length. Normalizing by length removes the incentive. Without a reference, drift needs a guard of its own.
3. The single-stage loss trains the base model to follow instructions and to prefer the chosen answer at once; the likelihood term keeps it anchored where DPO used the reference.
4. In DPO a near coin-flip pair and a unanimous pair both push toward an unbounded gap. The bounded loss keeps the gap proportional to the preference strength.

**What every team keeps**

A held-out eval with generation, early stopping, and a check on the absolute chosen log-probability. None of these losses escapes over-optimization; they move where it bites.

**How to decide in practice**

Run the candidates on one battery and pick per task. The lesson's point is that the best loss for math reasoning has no reason to be the best loss for safety.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The clicks team also has a small paired set. Combine them? Expected: yes; train with the unpaired loss on the clicks and validate on the pairs, or weight the two losses; the pairs are the cleaner signal for the eval.
- **Level 3:** Why does removing the reference save memory, and what does it cost? Expected: one model in memory instead of two; the cost is no anchor, so the policy can drift, and the margin term and early stopping carry that job.
- **Level 4:** A team runs DPO and watches the probability of its chosen answers drop while the margin grows. Which row applies, and why is it not a tuning problem? Expected: the chosen-preserving variant; the gradient of plain DPO cares only about the difference, so no beta fixes the direction.
- **Level 4:** How do you argue to a skeptic that these losses still over-optimize? Expected: the published curves of gold reward against KL for direct methods show the same peak and collapse as reward-model pipelines; the implicit reward queries out-of-distribution samples, and KL regularization does not stabilize it.

**Wrong answers, and why they fail**

- "Convert the clicks into pairs by matching a good and a bad answer for the same prompt." It keeps only prompts with both labels and invents comparisons the raters never made; the unpaired loss uses the labels as they are.
- "Truncate the long winners so that the pairs are balanced." That destroys the answers people preferred; the fix is in the loss normalization, not in the data.
- "Use DPO everywhere and tune beta per team." Beta cannot create pairs, remove a reference, bound a gap or supply an SFT stage; each of those is a different loss.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Remove a cause of the gap before you reweight it

*Level 3 (senior) · tradeoff · about 15 minutes*

Your RL run shows a steady disagreement between trainer and rollout engine on the probability of each sampled token. One engineer wants to turn on a capped importance weighting right away. Another says it is a kernel artifact and should be ignored. Lay out how you decide, and what you would try first.

:::answer Show the answer
:::say Short answer
Match the method to the source of the gap. Five sources exist: tokens re-encoded between turns, expert routing on a mixture model, a sampler that cuts the vocabulary, numeric differences between kernels or precisions, and stale samples. The first three have corrections that remove the cause; try those first, because a reweighting such as truncated importance sampling leaves the gap in place and adds variance to the gradient. A flat gap on a dense model with plain sampling is the kernel floor of that setup; measure it, keep it inside your range, and reweight only what remains after the causes are gone.
:::

**Full answer**

**Two kinds of method**

A method that removes a cause makes both sides compute the same thing, and that part of the gap is gone. A method that reweights leaves the gap and changes how much each token counts in the loss. Remove causes first.

| Method | Kind | Cause |
|---|---|---|
| Sampling replay | removes | top-p and top-k cut the vocabulary on the engine side only |
| Routing replay | removes | a mixture-of-experts router picks different experts on each side |
| Token-in, token-out sessions | removes | text round trips between agent turns change the tokens |
| True on-policy mode | removes | all kernel differences, for the models and GPUs it covers |
| Truncated importance sampling | reweights | any remaining gap |
| A sample age limit | drops | samples from older weights |

**What the manual measured**

Sampling replay on one seed lowered the median gap from 0.0153 to 0.0135, 11.5 percent. No step of the replay run reached the lowest step of the plain run, and the reward stayed in the same range. The sampler part is not noise: a top-p cut raises the engine's log-probability of a kept token by minus the log of the kept mass, which at a top-p of 0.9 was a median shift of about 0.053 in a check outside the training framework. Deterministic inference removed nothing, because it is not a correction.

**The kernel floor**

On a dense model in BF16 on both sides, the manual's gap stayed at about 0.015 per token in every healthy run. That is the floor of one setup, not a law. A check with FP16 on both sides cut the median gap about 7.8 times, from 0.0073 to 0.00094 on a serving engine against a reference forward pass, and the worst token fell from 0.355 to 0.033. FP16 on one side only did not help. Precision is a lever that removes a cause, and it costs numeric range.

**When to reweight**

Truncated importance sampling weights each token by the ratio of the trainer probability to the engine probability and caps the ratio, with `--use-tis --tis-clip 2.0` as the manual's example. Use it for a gap you cannot remove: a low-precision rollout, where FP8 rounding has no kernel fix, or a mixture model after routing replay. Pair it with the step-0 check, so that the reweighting never hides a setup error.

**How to run the comparison**

Same seed, same steps, one change per run, and the gap read at every step. A method that helps shows a lower gap on the same steps. A gap that grows after a change names the cause you added.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a reweighting add variance? Expected: tokens with a large ratio get a large weight, so a few tokens dominate the update; the cap limits that, but does not remove it.
- **Level 3:** Replay needs both a top-k and a top-p set. Why is the top-k needed? Expected: the framework requires a positive top-k for replay, so a run with top-p alone changes the sampler without replaying the kept set.
- **Level 4:** FP16 on the engine and BF16 on the trainer did not close the gap. Why? Expected: each side's own rounding sets a floor; the gap closes only when both sides round the same way, so the precision must match on both sides.
- **Level 4:** When is the bit-exact mode the right answer, and when is it not available? Expected: when you need a gap of zero and your model and GPU are in its contract; it pins one attention kernel and batch-invariant operations for specific dense models on one GPU generation, and refuses the rest.

**Wrong answers, and why they fail**

- "Turn on importance sampling first; it is cheap." It leaves every cause in place, adds variance, and hides a setup error that the step-0 check would show.
- "The gap is a kernel artifact, so it never matters." The sampler part was measurable and removable, and a gap that grows after a change is a cause you added.
- "Deterministic inference is a correction method." It makes the engine repeat itself and leaves the gap where it was; the manual's four runs show the same gap with it on and off.

:::

## Review a claimed RL speedup before it becomes a default

*Level 3 (senior) · design · about 12 minutes*

An engineer shows you two RL training runs. The new one, with a changed offload setting, finished its rollouts twelve percent faster and ended with a reward a few hundredths higher than the old one. They want to ship the change as the new default. Design the review: what do you ask for before you trust either number?

:::answer Show the answer
:::say Short answer
Ask for the spread of the baseline before you read the change. In the manual's three baseline seeds the final reward ranged from 0.736 to 0.766, so a gain of a few hundredths on one seed is inside the noise. Then ask what else differed: the manual's first offload pair also changed the engine memory fraction and compared different step numbers, and its twelve percent shrank to one to three percent in a same-day pair that changed one setting. Require two seeds, one change per run, the same step numbers, and times from steps that no thermal pause touched.
:::

**Full answer**

**Know the noise first**

Three runs of one recipe, with nothing changed but the seed:

| Seed | Reward, first 8 steps | Reward, last 8 steps |
|---|---|---|
| default | 0.636 | 0.758 |
| 2 | 0.653 | 0.736 |
| 3 | 0.614 | 0.766 |

All three learned, and the final reward still spread by 0.03. The manual's rule: a change of 0.01 on one seed tells you nothing, and a change of 0.05 on two seeds is worth a third run.

**One change per run**

The manual's first offload comparison showed a 12 percent faster rollout. The two runs also used different engine memory fractions, and their clean steps were different steps. On the one step that was clean in both runs, the faster run wrote answers of 599 tokens against 695, and rollout time follows the answer length. A same-day pair that changed only the offload setting measured 1 to 3 percent.

**Compare the same steps**

Answers get shorter as the model learns, so the rollout time falls over a run. The same setting gave a median rollout of 47.5 seconds over 48 steps in one run and 59.1 seconds over the 6 clean steps of another; on the same 6 step numbers the first run took 60.9. Medians over different steps differ for that reason alone.

**Time only clean steps**

The manual's GPU reached 84 C under load, and a guard paused the container until it cooled to 74 C. A pause adds wall-clock time to the phase it falls in. Report times from steps whose window overlapped no pause, and keep the pause log next to the run log.

**What to record for every run**

The image digest and the framework commit, the full command, the seed, one log file per run, the GPU temperature and pauses, and the exit code. A run you cannot compare teaches nothing.

**The review checklist**

1. Two seeds of the change, compared against the spread of the baseline seeds, not against one baseline run.
2. One setting changed, with everything else identical, the memory fraction included.
3. Rollout times on the same step numbers, from clean steps only.
4. A reward read as a mean over several steps, not from the last step.
5. A claim only when the change falls outside the spread.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why compare against the spread of several baseline seeds and not against the best baseline? Expected: the best baseline is a lucky draw; the spread is the noise floor, and a change must clear it.
- **Level 3:** The new run has no clean steps, because every rollout overlapped a pause. What can you still report? Expected: take the pause time out of each step and say so, as the manual did for one run, and mark the result as unconfirmed.
- **Level 4:** How do you test a loss or reward change without paying for new rollouts? Expected: save the rollout samples of one run and replay them with the trainer alone; every replay sees the same samples, so a difference comes from the change.
- **Level 4:** Two seeds show a gain outside the spread, but the step-0 gap moved too. What next? Expected: the change touched the setup, not only the setting; check that both runs load the same model and sampler before you credit the gain.

**Wrong answers, and why they fail**

- "Twelve percent is far above noise, ship it." The manual's twelve percent came from two settings changed at once and from different step numbers; one setting alone gave one to three percent.
- "Average the rollout time over the whole run." The median follows the answer length, which falls as the model learns; compare the same step numbers.
- "One seed is enough when the gain is clear." The three baseline seeds ended 0.03 apart with nothing changed; a few hundredths on one seed sit inside that.

:::

## The reward climbs and the human ratings do not

*Level 3 (senior) · debug · about 12 minutes*

Four days into a PPO run, the mean score from the reward model keeps climbing. A blind human rating of samples from each checkpoint is flat, and the last two checkpoints read slightly worse. The team wants to keep training because the curve looks great. What do you say?

:::answer Show the answer
:::say Short answer
Stop, and treat it as reward hacking. The policy has found outputs that the reward model scores high but people do not prefer, because the reward model is a finite proxy with blind spots. Read the KL to the reference and the length and format of recent samples; a KL that climbs with the reward and answers that grow longer or more formulaic confirm it. Roll back to the checkpoint where the human rating peaked, raise the KL coefficient or stop earlier, and widen the reward model's training data to cover what the policy exploited.
:::

**Full answer**

**The signature**

Reward up, human eval flat or down. The reward model was trained on in-distribution answers; the policy under optimization leaves that distribution and the reward model extrapolates. The RLHF lesson's table of what real pipelines saw:

| Failure | What the samples show | Why the reward model liked it |
|---|---|---|
| Verbosity | longer and longer answers | raters preferred detail, so the model learned length |
| Sycophancy | agreement with the user's premise | agreeable answers were rated higher |
| Hedging | no commitment to an answer | hedged answers are rarely marked wrong |
| Format gaming | headers and bullets everywhere | formatted answers looked polished |

**The checks**

1. The mean KL to the reference per answer. The warning line in the lesson on reward modeling is 5 to 10 nats summed over tokens; past it, the policy has drifted far from SFT.
2. The response length by checkpoint. Length hacking is the most common form.
3. Fifty samples read side by side across checkpoints. The failure modes above are visible to the eye.
4. The blind human eval you already have. Keep it blind and held out; it is the one measure the policy cannot game.

**The fixes**

- Roll back to the best checkpoint by human rating; the reward curve is not the objective.
- Raise beta, or use an adaptive beta with a target KL, so that the policy pays more to leave the reference.
- Normalize the reward for length, or add a length-aware term.
- Add the exploited answers, rated by people, to the reward model's data, retrain it, and continue from the rollback.
- Train more than one reward model on different data; one exploit rarely fits all of them.

**Why the curve is not the goal**

The reward model is a statistical proxy for a sample of human rankings, not for human values. Optimizing a proxy hard enough finds its errors. Every alignment pipeline since has carried a blind human eval for that reason.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How do you tell reward hacking from a reward model that is right and raters who are wrong? Expected: read the samples; if people consistently dislike what scores high, the proxy is wrong, because the raters define the objective.
- **Level 3:** The reward model is small to save compute. Does that matter here? Expected: yes; a reward model that cannot represent the policy's outputs has more blind spots, and the lessons warn against one smaller than the policy.
- **Level 4:** You switch to DPO to get rid of the reward model. Does the problem go away? Expected: no; the implicit reward can be over-optimized the same way, with the same peak-and-collapse curve, so the blind eval and early stopping stay.
- **Level 4:** Design a guard that stops a run on its own. Expected: a held-out human or trusted-judge eval on a fixed prompt set at each checkpoint, a KL budget, and a stop rule for an eval that falls while the reward rises.

**Wrong answers, and why they fail**

- "The human raters are noisy; trust the reward model." The reward model was fit to those raters; when they disagree with it on new samples, the model is extrapolating wrong.
- "Lower beta so the policy can find even better answers." A lower beta lets the policy move further from the distribution the reward model knows, which is the cause of the problem.
- "Keep training; the human eval will catch up." The lessons describe a plateau or a decline in human ratings while the reward climbs; more steps make the exploit stronger.

**Related lesson in this course:** [Lecture 6: Reasoning models: chain of thought, pass@k, GRPO and the DeepSeek-R1 recipe](#lectures-6)

:::

## Write and prove a custom reward for GRPO

*Level 3 (senior) · take-home · about 30 minutes*

Take-home. The RL framework you use scores each sampled answer with a reward function that you swap in by import path. Write a reward for a task with a numeric final answer, write a test plan for it, and explain how you would prove that your reward does not break the GRPO advantages before a long run. Keep the function and the plan short enough to read in five minutes.

:::answer Show the answer
:::say Short answer
Write an async function that receives the run arguments and one sample, extracts the last number from the answer and from the label, and returns 1.0 for a match and 0.0 otherwise, comparing as values so that 142 never matches 42. Test it on ten answers you scored by hand, with a correct one, a wrong one, an empty one and one cut at the length limit, because a reward that crashes on an empty answer stops the rollout of the whole step. Then check the advantages: a group where every answer gets the same reward must get an advantage of 0 for every member, and a fractional reward can fail that through float32 rounding.
:::

**Full answer**

**The function**

```python
import re


def last_number(text):
    found = re.findall(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", text.replace(",", ""))
    return float(found[-1]) if found else None


async def custom_rm(args, sample, **kwargs):
    answer = last_number(sample.response)
    label = last_number(str(sample.label))
    return 1.0 if answer is not None and answer == label else 0.0
```

Three rules from the manual. Write it as `async def`, because the framework awaits the result and a plain function fails at the first call. The function receives the run arguments and one sample, with the answer in `sample.response` and the label in `sample.label`. If it returns a dict, name the field that holds the reward with the reward key flag; with the group flag, the function receives the whole group as a list and returns one reward per sample.

**Plug it in**

Save the module in the mounted lab folder, put that folder on `PYTHONPATH`, and pass the import path with `--custom-rm-path my_rewards.custom_rm`. When the import works, the first `rollout 0` line shows a reward that your function produced. When it does not, the log shows `ModuleNotFoundError`, and the run does not stop by itself. The manual's test stayed up for two hours with no step, and the watchdog did not fire, because the engine wrote only 44 error lines. Stop the container, fix the path, and start again.

**The test plan**

1. One call inside the container on a hand-written sample before any GPU work: the answer "So the answer is 42." with the label "42" must return 1.0.
2. Ten answers scored by hand: correct, wrong, correct in a different format, a number with a comma, an empty answer, an answer with no number, an answer cut at the length limit, a negative label, a decimal label, and an answer with two numbers where the last is right.
3. A two-step run with the reward in place; read `rollout/raw_reward` on the first step and compare a few logged samples with your hand scores.

**Prove the advantages**

GRPO subtracts the group mean from each reward and divides by the group standard deviation. A binary reward gives an exact mean, so a group of equal rewards gets exactly 0 for every member. A fractional reward can fail: in float32 the mean of 16 rewards of 0.3 is not exactly 0.3, and the division by a standard deviation near 0 inflates the remainder to about 0.029 per answer. If you move to partial credit, use values a float32 holds exactly, such as multiples of 0.25, and check a group of equal rewards for zero advantages before the long run.

**Use the smallest hook**

A scoring rule needs only the reward hook. The group filter and the generate function stay as they are, so batching, the metrics and the gap checks keep working for you.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why compare the numbers as values and not as strings? Expected: so that a trailing zero or a comma does not fail a right answer, and so that 142 does not match 42 by substring.
- **Level 3:** The task has a free-text answer. What changes? Expected: the extraction; use a built-in overlap or multiple-choice scorer when one fits, because it is already tested, and keep the same ten-answer test plan.
- **Level 4:** Which built-in reward gives minus one for a wrong answer, and what does that change downstream? Expected: the DAPO-style reward returns a dict with the score, so it needs the reward key flag; the sign changes the mean, not the zero-advantage property of a two-valued reward.
- **Level 4:** How would you test a reward change without new rollouts? Expected: save the rollout samples of one run and replay them with the trainer alone, so that every candidate reward scores the same samples.

**Wrong answers, and why they fail**

- "Write a plain function; the flag help shows one." The framework awaits the result, so a plain function fails at the first call; write it as an async function.
- "Return any float between 0 and 1 for partial credit; GRPO handles it." Fractions that float32 cannot hold exactly give groups of equal rewards a nonzero advantage; round to exact values and test such a group.
- "Skip the empty-answer case; the model always writes something." A cut or empty answer reaches the reward every step, and a crash there stops the whole rollout.

**Related lesson in this course:** [Lecture 6: Reasoning models: chain of thought, pass@k, GRPO and the DeepSeek-R1 recipe](#lectures-6)

:::

## Design async RL rollout and control the sample age

*Level 4 (staff) · design · about 15 minutes*

You move an RL job from one GPU to a cluster where the rollout engines and the trainers run on separate devices. The team wants generation and training to run at the same time, so that neither side waits for the other. Design the async setup: which knobs matter, what new failure appears, and what you watch in the logs.

:::answer Show the answer
:::say Short answer
Async training lets the engines generate the next batch while the trainer updates, at the price of samples that come from older weights. Two modes exist: one step ahead, where every sample is at most one weight version old with the default update interval, and fully async, where a worker keeps generating and the trainer drains a buffer, so the age depends on how fast the trainer drains it. Set a limit on sample age, decide what happens to running requests at each weight update, and lower the learning rate as you allow older samples. Watch the weight version of each sample, the share of dropped samples, the clip fraction, and the gap between the two sides.
:::

**Full answer**

**Why async pays off only on a split layout**

With both sides on one GPU they take turns, and generation stops for the whole training window; the colocated fully async mode exists only to learn the settings. On separate devices the trainer idles during rollout and the engines idle during training unless the two overlap. Async removes part of that wait.

**The knobs**

| Setting | What it decides |
|---|---|
| `--update-weights-interval` | how many steps run between weight updates to the engines |
| `--max-weight-staleness` | the oldest weight version a sample may come from; unset means no limit |
| `--async-unused-samples-handler` | drop or retry a sample that is too old |
| `--async-max-concurrent-samples` | how many samples the engines generate at one time |
| `--pause-generation-mode` | what happens to running requests at a weight update: abort, retract, or in place; retract is the default |

The over-sampling batch size has no effect in the fully async mode.

**The new failure: stale samples**

A sample generated under weights two versions old is off-policy for the trainer. The ratio of trainer probability to engine probability now carries a gap that the kernels did not cause. Two signals show it. The clip fraction, `train/pg_clipfrac`, is 0 in a run with one optimizer update per rollout, because the policy that trains is the one that sampled; a clip fraction above 0 in such a run means the samples did not come from the current weights. The log-probability gap grows with the age for the same reason.

**Learning rate follows age**

A study of asynchronous GRPO on small models changed the steps between weight updates and the learning rate together, and the largest stable learning rate fell in proportion to the steps between updates: twice the steps, about half the rate. The manual has not tested it and offers it as the starting rule. When you raise the update interval or the age limit, lower the learning rate by the same factor, then watch the gap and the reward.

**What to watch**

- The weight version statistics in the rollout metrics: how old the samples are.
- The share of dropped or retried samples. A high share means the engines work for nothing.
- `train/pg_clipfrac` and the gap, read against the ranges of your synchronous runs.
- `perf/update_weights_time` against the step time. On a split layout the update is a transfer over the network, not a copy inside one GPU, and the transfer method is a choice of its own.

**Corrections for what remains**

A sample age limit drops the worst samples. For the rest, the truncated importance-sampling correction reweights each token by the ratio of the two probabilities with a cap. Remove staleness before you reweight it.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the clip fraction exactly 0 in a synchronous run with one update per rollout? Expected: the policy in the trainer is still the policy that produced the samples, so every ratio is 1 and nothing hits the clip range.
- **Level 4:** Which pause mode do you choose, and what does the wrong one cost? Expected: retract keeps the work of running requests and continues them under new weights, which mixes weight versions inside one answer; abort throws the work away; in place changes the weights under a running request; the fully async mode refuses some of these, so read the flag help of your version.
- **Level 4:** A partial answer started under version 5 and finished under version 7. Where does that show up? Expected: in the gap, because part of its tokens come from older weights than the trainer holds; watch the gap after you turn on partial rollout or raise the staleness limit.
- **Level 4:** How does a dedicated evaluation fleet fit this design? Expected: it loads checkpoint snapshots and never takes part in the training weight updates, so its lag is reported in steps; in the version the manual read it does not combine with rollout fault tolerance.

**Wrong answers, and why they fail**

- "Run fully async on the single GPU too; it is the same code." With one GPU the two sides still take turns and generation stops during training, so you pay the staleness cost and get no overlap.
- "Leave the staleness limit unset, so that no sample is wasted." Unset means no limit; very old samples pull the update in the wrong direction, and the gap grows without a cause in the kernels.
- "Keep the learning rate from the synchronous run." The stable rate falls with the age of the samples; raise the update interval and you lower the rate by about the same factor.

:::

## Does dropping the reward model end reward hacking

*Level 4 (staff) · concept · about 12 minutes*

A staff engineer argues that moving every alignment run from PPO to direct preference methods ends the reward-hacking problem, because there is no reward model left to hack. Make the counter-argument with the mechanism, and say what survives in your pipeline either way.

:::answer Show the answer
:::say Short answer
Direct methods remove the explicit reward model, not the proxy. The quantity they optimize is the log ratio of policy to reference, an implicit reward that the preference data pins down only where the data has coverage. Under optimization the policy queries that ratio out of distribution, and the published curves of gold reward against KL show the same peak and then collapse as reward-model pipelines, with the KL regularization failing to stabilize it. What survives: a blind held-out eval, early stopping, broader preference data, and ensembles of signals.
:::

**Full answer**

**The mechanism**

DPO rewrites the reward as beta times the log ratio of policy to reference. That function is fit from pairs, and it is constrained only on the pairs. Everywhere else its value is whatever the parameterization implies. As the policy moves to raise the margin, it samples from regions no pair covered, where the implicit reward is arbitrary. The study of scaling laws for over-optimization in direct alignment trained policies across KL budgets and found the same shape as reward-model over-optimization: the gold reward rises, peaks, and falls as the KL grows.

**Where Goodhart bites now**

In the PPO stack the proxy is a trained reward model. In the direct stack the proxy is the ratio against the reference. The failures look different: the degraded chosen response, where the chosen answer loses probability while the margin grows; length exploitation, where a longer winner pads the gap; arbitrary rewards on pairs that are rare under the reference. They are one disease in a different organ.

**Why the KL does not save it**

In PPO the KL term is explicit and tunable, and an adaptive controller holds it near a target. In DPO the anchor is structural: the sigmoid saturates as the ratio grows. The study's result is that this structural regularization does not stop the collapse. Beta changes the speed, not the shape.

**What survives in any pipeline**

- A blind, held-out human or trusted-judge eval on a fixed prompt set, read at every checkpoint. It is the one signal the policy cannot game.
- Early stopping on that eval, not on the training margin.
- Data: coverage of the regions the policy drifts into, collected from the current policy's samples.
- Ensembles: several reward signals or several losses on one battery, because one exploit rarely fits all of them.
- Logs of the absolute chosen log-probability and of the KL to the reference, so that the drift is visible before the eval falls.

**The honest version of the claim**

Direct methods do remove a model to train and host, PPO's instability, and the class of exploits that live in reward model weights. They are the default for most frontier post-training runs for those reasons. They do not remove the need to guard against over-optimization, so the guard moves into the pipeline design.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does DPO remove from the PPO stack, concretely? Expected: a reward model to train and host, the PPO loop with its clip and value head, and an explicit KL coefficient; it keeps the frozen reference.
- **Level 4:** Which variant bounds the gap, and what does that buy against this failure? Expected: the identity-mapping loss, whose margin target is one over two beta; it stops a weak preference from producing an unbounded implicit reward, which removes one path to collapse but not the out-of-distribution query.
- **Level 4:** How do you detect over-optimization without a gold reward? Expected: a held-out eval with generation, the absolute chosen log-probability, the KL to the reference, and a comparison across checkpoints; a margin that grows while the eval falls is the signature.
- **Level 4:** Does iterating, with fresh pairs from the current policy each round, help? Expected: yes, it moves the data coverage to where the policy lives, which is what the reference-ratio proxy lacks; it also reintroduces an online loop that needs its own stop rule.

**Wrong answers, and why they fail**

- "No reward model means nothing to hack." The implicit reward is a function the data pins down only on the pairs; the policy can push it anywhere else.
- "The structural KL in DPO is enough regularization." The published curves show the same peak and collapse across KL budgets; beta changes the speed, not the shape.
- "Use a smaller beta so the policy learns faster and you can stop earlier." A smaller beta lets the policy move further from the reference per unit of margin, which is the direction of the failure.

**Related lesson in this course:** [Lecture 6: Reasoning models: chain of thought, pass@k, GRPO and the DeepSeek-R1 recipe](#lectures-6)

:::

## Plan the post-training of a support assistant

*Level 4 (staff) · take-home · about 45 minutes*

Take-home. A company wants a support assistant built from an open 8B base model. They have about 50,000 past support conversations with customer ratings, two 24 GB GPUs, and three weeks. Write the post-training plan on one page: the stages, the data for each stage, the settings you start from, what you measure after each stage, and the three failure modes you guard against.

:::answer Show the answer
:::say Short answer
Three stages: first, SFT with QLoRA on the top-rated conversations in one chat template with the loss masked to the assistant turns, at a low learning rate for one to three epochs with a few percent of raw text mixed in, measured by held-out instruction loss, raw-text drift and a sample read. Second, DPO against the SFT checkpoint as the frozen reference, on pairs built from high- and low-rated answers to the same prompt with a conservative beta, measured by a blind pairwise eval and the absolute chosen log-probability, not the training margin. Third, a release gate: a fixed prompt set rated blind, a refusal set, and a comparison with the base model on tasks the data never covered. The guards are catastrophic forgetting, length and agreement exploits in the ratings, and over-optimization of the preference proxy.
:::

**Full answer**

**Stage 0: data**

- Convert every conversation into one chat template, with a fixed system prompt.
- SFT set: the top-rated answers, filtered for length, vocabulary diversity and a clean instruction-to-answer ratio. Tens of thousands of clean examples are enough; the reference SFT stage in the lesson used about 27,000.
- Preference set: for prompts with both a high-rated and a low-rated answer, build prompt, chosen and rejected triples. Where the data is thin, sample the rejected side from the SFT model, so that the pairs are in-distribution for the reference. A rater or a judge must confirm that each sampled answer is worse than the chosen one before it becomes a pair, because the SFT model trained on top-rated answers and its samples can be as good. Aim for the 5,000 to 20,000 pairs where DPO works well.
- A blind eval set of prompts never used in training, plus a forgetting set of tasks outside support, such as short code and arithmetic.

**Stage 1: SFT with QLoRA**

Two 24 GB cards cannot hold a full update of this model; a 7B full update needs about 56 GB with gradients and optimizer states. QLoRA keeps the base in 4-bit and trains adapters of rank 16 on the attention projections in about 6 GB, so each card runs its own experiment.

Start from: the lesson's SFT learning rate of 2e-5 for a full update, with a higher rate for adapters as the LoRA lesson's trainer shows; one to three epochs; 2 to 5 percent raw pretraining text mixed into the batches.

Measure: held-out instruction loss, raw-text loss before and after with a budget of a 10 to 15 percent rise, exact match on the templated tasks where it applies, and a read of fifty samples.

**Stage 2: DPO**

Reference: the merged SFT checkpoint, frozen. Policy: a copy with fresh adapters. Beta in the 0.1 to 0.3 range, a few epochs, and the four log-probabilities per pair over the answer tokens only.

Measure: a blind pairwise eval against the SFT model on the held-out prompts, the implicit reward margin, the absolute chosen log-probability, the response length by checkpoint, and the forgetting set again. Stop on the eval, not on the margin.

**Stage 3: release gate**

- A fixed prompt set rated blind by people, against the SFT checkpoint and the base.
- A refusal and safety set with the expected behavior written down.
- The forgetting set.
- Adapters kept separate for a rollback; a merge only for the shipped artifact.

**The three guards**

1. Catastrophic forgetting: low rate, short training, a pretraining mix, and a raw-text loss budget.
2. Exploits of the rating signal: raters liked long and agreeable answers, so watch the length and the agreement with the premise, and filter pairs where length alone separates them.
3. Over-optimization of the proxy: the DPO ratio can be pushed off the data, so stop early on the blind eval and keep beta conservative.

**Schedule**

Week one: data and SFT. Week two: DPO and the first blind eval. Week three: the gate, a second seed of the best configuration, and the rollback plan.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why DPO and not a reward model with PPO here? Expected: tens of thousands of pairs, two small GPUs and three weeks fit the DPO regime; a reward model and PPO need three loops and more memory.
- **Level 4:** The ratings are one to five stars on single answers, not pairs. What changes? Expected: build pairs only where one prompt has answers at both ends of the scale, or use the unpaired loss that works on good and bad labels and keep the pairs for the eval.
- **Level 4:** How do you prove that the DPO stage did not degrade the SFT behavior? Expected: the blind pairwise eval against the SFT checkpoint, the forgetting set, and the absolute chosen log-probability; a margin that grows while those fall is a stop signal.
- **Level 4:** What would make you add an RL stage with a verifier? Expected: a part of the task with a checkable answer, such as a correct order number or a passing code snippet, where a binary reward and group-relative advantages give a signal the ratings do not.

**Wrong answers, and why they fail**

- "Skip SFT and run DPO on the base model." DPO needs a reference that already follows instructions; the single-stage loss is a different method, and the base model's pairs are out of distribution.
- "Fully fine-tune the 8B model across both GPUs." A full update of a model this size needs about 56 GB with the optimizer states; two 24 GB cards hold it only with adapters and a 4-bit base.
- "Use the star ratings as the reward and run PPO." A regression on absolute scores is the weak label the lessons warn about, and the full stack does not fit the compute or the timeline.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::
