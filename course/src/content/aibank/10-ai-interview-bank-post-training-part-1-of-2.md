---
track: aibank
title: "AI interview bank: Post-training (part 1 of 2)"
short: Post-training 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A million scraped pairs or a small curated set

*Level 1 (screening) · tradeoff · about 8 minutes*

Your team has a budget to collect SFT data for a new assistant. One plan buys one million scraped question-answer pairs from the web. The other plan pays skilled writers for a much smaller set. Which plan do you pick, and how do you argue it?

:::answer Show the answer
:::say Short answer
Pick the smaller set from skilled writers. SFT teaches a behavior pattern, not new facts, so a few thousand to a few tens of thousands of clean examples are enough. The lesson's reference points are about 27,000 curated examples for the first SFT stage of a major open chat model, and 52,000 generated pairs that cost about 600 dollars and produced a usable assistant. Noise in scraped pairs is learned as behavior at the same weight as the good examples.
:::

**Full answer**

**Why a small set is enough**

The base model already knows language and facts from pretraining. SFT concentrates a latent ability: when the assistant marker appears, answer. That pattern needs far fewer examples than learning facts. The lesson gives 20,000 to 100,000 crafted pairs as the range that turned a base model into an assistant, and points to a study where 1,000 carefully chosen examples matched much larger sets.

**Why noise hurts more than it helps**

Every example is a target. Vague, wrong or rude answers in a scraped set teach vague, wrong or rude behavior, and the model has no way to know which examples to trust. SFT has no notion of a better answer. That comparison is what preference tuning adds later.

**What quality means in practice**

- Diverse tasks and formats, not many copies of one shape.
- Answers that a careful person would write, in the length and tone you want in production.
- One consistent chat template, with the same role markers in every example.
- A filter that drops tiny answers and low vocabulary diversity before training.

**When volume does help**

Once the format is learned, more clean examples broaden task coverage. The 70,000 shared conversations that trained an early open chatbot show that volume works when the source is already assistant-shaped. Mix 2 to 5 percent of raw pretraining text into the batches, so that the model keeps its general ability.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does SFT not teach the model? Expected: new facts; those come from pretraining, and SFT teaches the response pattern.
- **Level 2:** How do you detect that a dataset teaches bad behavior before you train? Expected: sample and read it, score answer length and vocabulary diversity, check the ratio of instruction to answer, and drop the tail.
- **Level 2:** After SFT the model answers well but lost some coding ability. What in the data plan addresses that? Expected: mix a few percent of raw pretraining text into the SFT batches and keep the run short.
- **Level 3:** The writers produce long, detailed answers for everything. What is the risk? Expected: the model learns that length is the pattern, and later preference tuning can amplify it into verbosity; match the answer length to the product.

**Wrong answers, and why they fail**

- "More data always wins in machine learning." SFT learns a format on a model that already knows the content; a million noisy targets teach noise as behavior.
- "Generated data is worthless, only human writing counts." The 52,000 generated pairs in the lesson produced a usable assistant for about 600 dollars; the issue is quality control, not the source.
- "Train longer on the small set to make up for its size." More than three epochs on a small set leads to memorization, and the model repeats training examples word for word.

:::

## Count the parameters of one LoRA adapter

*Level 1 (screening) · estimate · about 6 minutes*

An attention projection in your model is a square matrix with 4,096 rows and 4,096 columns. You add a LoRA adapter of rank 16 to it. How many values does the adapter train, and what share of the frozen matrix is that? Then say what changes when you double the rank.

:::answer Show the answer
:::say Short answer
The adapter is two thin matrices: A with 16 rows and 4,096 columns, and B with 4,096 rows and 16 columns. Each holds 65,536 values, so the adapter trains 131,072 parameters. The frozen matrix holds 16,777,216, so the adapter is 0.78 percent of it. A doubled rank doubles the adapter, because its size is linear in the rank.
:::

**Full answer**

**The count**

```text
y = W x + (alpha / r) B A x
A: r x d_in  = 16 x 4096 = 65,536
B: d_out x r = 4096 x 16 = 65,536
adapter      = 131,072
W            = 4096 x 4096 = 16,777,216
share        = 0.78 percent
```

**Why so few parameters work**

The update that fine-tuning makes to a weight matrix has a low intrinsic rank. A rank of 16 or 32 captures most of it. The lesson reports LoRA at rank 16 within about one point of full fine-tuning on the benchmarks it lists.

**The rank table**

| Rank | Parameters for one 4096 by 4096 matrix |
|---|---|
| 4 | 32,768 |
| 8 | 65,536 |
| 16 | 131,072 |
| 32 | 262,144 |
| 64 | 524,288 |

**Alpha**

The scale `alpha / r` sets how much the adapter output counts. With alpha equal to the rank, the scale is one; a common convention sets alpha to twice the rank. Alpha changes the effective step size, not the parameter count.

**Which matrices**

The count above is one matrix. Adapters on the query and value projections of every layer are the usual start. Adding the key and output projections and the MLP layers raises quality a little and, on the lesson's 7B table, raises the count from 9.4M to 37.7M.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does B start at zero? Expected: the product B A is then zero, so the model starts from its original behavior and learns the change step by step.
- **Level 2:** How does the count change for a matrix that is not square? Expected: A is r by the input width and B is the output height by r, so the count is r times the sum of the two sides; still linear in the rank.
- **Level 2:** At what rank does the memory advantage start to fade? Expected: the lesson puts the point of diminishing returns past 64, where quality stops improving and the adapters stop being small.
- **Level 3:** After training, how do you remove the cost of the second matrix product at inference? Expected: merge, compute W plus alpha over r times B A once, and save a full matrix of the original size.

**Wrong answers, and why they fail**

- "The adapter trains r squared parameters." It trains r times the sum of the two matrix sides; r squared would be a tiny block, not the two thin matrices.
- "Doubling the rank doubles the quality." The gain flattens fast; the lesson finds rank 16 within about one point of full fine-tuning and little gain past 64.
- "Alpha adds parameters." Alpha is a fixed scalar on the adapter output; it changes the effective step size, not the count.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## Train the head only, or fine-tune the whole model

*Level 1 (screening) · tradeoff · about 8 minutes*

You have a small pretrained transformer and 800 labelled text messages, half of them spam. You need a binary classifier by tomorrow. Do you train only a new classification head, or do you update every weight? Defend the choice.

:::answer Show the answer
:::say Short answer
Swap the language-model head for a two-class linear layer and start with the body frozen. Head-only training is fast, costs almost no memory, and rarely overfits on this little data. Unfreeze the body only when the frozen run leaves accuracy on the table and the domain is far from the pretraining text.
:::

**Full answer**

**Two regimes, one loop**

The body maps tokens to hidden states and stays as it is. The head maps a pooled hidden state to two logits and is new. Head-only training sets `requires_grad=False` on the body, so the optimizer sees only the head. Full fine-tuning lets the gradient flow through the whole stack, and the body drifts toward the classification objective.

**What each one buys**

On the fixture in the capstone lesson, head-only training reached a precision near 0.9 and a recall near 0.85 after twenty epochs. Full fine-tuning took about three times longer and landed within a couple of points either way, depending on the seed. With 800 examples the body has little to learn from the labels, and a lot to forget.

**Pooling**

A classifier needs one vector per sequence. Mean pooling weighted by the attention mask is the simplest choice and gives a stable signal across lengths. A CLS token needs pretraining of that token. Last-token pooling is what decoder-style classifiers use.

**Read the numbers, not one accuracy**

Report precision, recall, F1 and the confusion matrix on a held-out split with a known balance. The lesson splits 80/20 into 640 training and 160 test messages, stratified so that the test set keeps its balance.

**When the full update starts to pay**

On 80,000 examples and a larger body, the body has enough signal to move without overfitting, and a domain shift can justify the cost. A middle path unfreezes only the last block.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does `requires_grad=False` on the body do to the optimizer? Expected: the optimizer receives only the head parameters, so the body weights never change.
- **Level 2:** Why mean pooling and not the last hidden state? Expected: mean pooling with the mask is stable across lengths and needs no special token; last-token pooling suits decoder models that saw that pattern.
- **Level 2:** Why keep the test split stratified? Expected: a known class balance lets you read precision and recall as honest numbers.
- **Level 3:** The full update scores lower than the frozen run on this data. What happened? Expected: the body overfit the small set and lost pretrained structure; lower the body learning rate, unfreeze fewer blocks, or stay with the head.

**Wrong answers, and why they fail**

- "Train a fresh classifier from scratch, the model is small anyway." The pretrained body already encodes word identity, position and co-occurrence; a new model from 800 examples throws that away.
- "Updating every weight is always more accurate, so do it." On 800 examples it lands within a couple of points of the frozen run and costs about three times the training time, with a real risk of overfitting.
- "Report accuracy, the classes are balanced." Precision and recall tell you which error you make, and the confusion matrix shows the counts behind the score.

:::

## Why the SFT loss skips the instruction tokens

*Level 1 (screening) · concept · about 6 minutes*

You fine-tune a base model so that it follows instructions. A teammate's training loop computes cross-entropy on every token of each sequence, the instruction tokens included. Is that a problem? What do you change, and why?

:::answer Show the answer
:::say Short answer
Yes. Count the loss only on the answer tokens. The user always provides the instruction at inference time, so a gradient on it teaches the model to write questions, not to answer them. Set the label of every instruction position, every padding position and the answer boundary token to the ignore index, so they add no loss and no gradient.
:::

**Full answer**

**What the mask does**

Each SFT example is one sequence: the instruction, a boundary token, and the answer. The model still sees the whole sequence in the forward pass, so attention can read the instruction. The loss counts only the positions after the boundary. In PyTorch you copy `input_ids` into `labels` and overwrite the instruction, the boundary and the padding positions with `-100`, the default `ignore_index` of `cross_entropy`. Apply the shift by one position first, then the mask, so the mask lands on the right targets.

**Why it is not a polish**

Two things go wrong without the mask. First, the model spends capacity on text that the user always provides. Second, the instruction positions usually outnumber the answer positions, so the answer loss is a small part of the gradient sum. The effective learning rate on the part you care about is lower than the one you set.

**Divide by the right count**

Average the masked loss over the number of answer tokens, not over the sequence length. A long instruction would otherwise dilute the signal from a short answer.

**Several turns**

With several assistant turns in one conversation, the mask is one for every assistant turn and zero for every user turn. Print the token column next to the label column for one example before you train.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which positions get the ignore index? Expected: the instruction, the padding, and the boundary token itself; the model predicts what follows the boundary, not the boundary.
- **Level 2:** Why does the model still need the instruction in the forward pass? Expected: the answer is conditioned on it through attention; the mask removes its loss, not its context.
- **Level 2:** How do you check the mask before a long run? Expected: print the tokens next to the labels for one example and confirm that only answer positions carry real labels, after the shift.
- **Level 3:** A base model given a question keeps writing more questions. What does SFT change, and what does it not change? Expected: it teaches the conversation pattern, so the model answers after the response marker; it adds no facts, those come from pretraining.

**Wrong answers, and why they fail**

- "The loss on the instruction is extra signal, so keep it." It trains the model to generate instructions, and it shrinks the share of the gradient that comes from the answer.
- "Divide the masked loss by the sequence length." A long instruction then dilutes the answer signal; divide by the number of answer tokens.
- "Keep the loss on the response marker, so the model learns to emit it." The marker is part of the prompt template; the prompt provides it, and the model predicts what follows it.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## A DPO trainer whose loss never moves

*Level 2 (working) · code-reading · about 12 minutes*

A teammate wrote the core of a DPO trainer. The loss stays at its starting value for the whole run, and the logged margin never moves. Read the code and find what is wrong.

```python
policy = TinyGPT(config)
reference = policy


def sequence_log_prob(model, prompt_ids, completion_ids):
    ids = torch.cat([prompt_ids, completion_ids])
    logits = model(ids[:-1].unsqueeze(0))[0]
    log_probs = logits.log_softmax(-1)
    targets = ids[1:]
    return log_probs[torch.arange(len(targets)), targets].sum()


def dpo_loss(prompt, chosen, rejected, beta=0.1):
    pi_w = sequence_log_prob(policy, prompt, chosen)
    pi_l = sequence_log_prob(policy, prompt, rejected)
    ref_w = sequence_log_prob(reference, prompt, chosen)
    ref_l = sequence_log_prob(reference, prompt, rejected)
    z = beta * ((pi_l - ref_l) - (pi_w - ref_w))
    return -torch.nn.functional.logsigmoid(z)
```

:::answer Show the answer
:::say Short answer
Three things. The reference is the same object as the policy, so both log ratios are zero by construction and the loss is a constant with no gradient; build the reference as a separate copy, freeze it, and run it under no gradient. The margin has the wrong sign, so once the aliasing is fixed the trainer promotes the rejected answer. The log-probability also sums over the prompt positions, which the capstone masks out.
:::

**Full answer**

**Bug 1: the reference is the policy**

`reference = policy` binds a second name to one module. Every forward pass through `reference` uses the current policy weights, so `pi_w - ref_w` and `pi_l - ref_l` are exactly zero, and the loss is a constant. The optimizer sees a zero gradient. A deep copy alone is not enough either: the reference needs `requires_grad=False` on every parameter, its forward passes belong under `torch.no_grad()`, and the policy must start from the same weights, for example with `policy.load_state_dict(reference.state_dict())`.

**Bug 2: the margin has the wrong sign**

The loss is minus the log sigmoid of beta times the chosen log ratio minus the rejected log ratio. The code subtracts in the other order. The gradient with respect to the chosen log-probability must be negative, so that raising it lowers the loss. With the reversed sign, the trainer lowers the chosen answer and raises the rejected one. A unit test that checks the gradient sign on one pair catches this.

**Observation 3: the prompt is in the sum**

`sequence_log_prob` sums over every position, the prompt included. With one shared prompt, the prompt terms cancel in the margin, so the value is right. But the trainer computes and backpropagates through positions that carry no preference signal, and the cancellation breaks when a long sequence is cut at a maximum length. Start the sum at the first answer position, as the capstone does.

**How to test the fix**

- The loss on one pair falls when you raise the chosen log-probability by hand.
- The reference log-probabilities are identical between epochs.
- The mean chosen minus rejected margin under the policy grows over training.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** After the fix, how do you confirm that the reference never moves? Expected: assert that no reference parameter requires a gradient, and compare its log-probabilities on a fixed pair before and after an epoch.
- **Level 3:** Why does every pair start at the same loss before training? Expected: the policy equals the reference, so both log ratios are zero and the sigmoid sits at one half; the margin grows from there.
- **Level 3:** The margin grows, but the generated answers get worse. What do you log next? Expected: the absolute chosen log-probability; DPO can push it down as long as the rejected falls faster.
- **Level 4:** Would you keep the prompt positions if the two answers had different prompts? Expected: no, and the loss would be wrong anyway; the derivation needs one prompt per pair, because the partition term cancels only then.

**Wrong answers, and why they fail**

- "Lower the learning rate; the loss is flat because the steps are too small." The gradient is exactly zero while the reference aliases the policy; no step size fixes that.
- "The sign does not matter, the optimizer finds the direction." The sign decides which answer the trainer promotes; reversed, it trains the model to prefer the rejected answers.
- "Replace the sum with a mean to stabilize the loss." That turns the objective into a length-normalized variant; it is a design choice, not the fix for a constant loss.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## A flat GRPO reward and the groups that teach nothing

*Level 2 (working) · debug · about 12 minutes*

A GRPO run trains a small model on grade-school math with a binary reward. The reward per step jumps around, and the trend over many steps looks flat. The team wants to raise the learning rate. What do you read first, and what do you suspect?

:::answer Show the answer
:::say Short answer
Read the group statistics before you touch the learning rate. GRPO scores each answer against the mean of its group, so a group where every answer is right or every answer is wrong has a zero advantage for every member and teaches nothing. In the manual's runs, 10 of the 32 groups in the first step had one reward for all 8 answers, and about half of the groups did over 12 steps. If most groups are like that, the signal is thin, and the fix is the prompt mix or the dynamic sampling filter, not a bigger step.
:::

**Full answer**

**Read five numbers, not the reward**

The reward of one step moved by up to 0.14 between steps in the first ten steps of the manual's runs, and by up to 0.21 over a long run, so read a mean over five or more steps. Next to it read the answer length, the share of answers cut at the length limit, the log-probability gap between the trainer and the engine, and the KL between them. A flat reward with a flat gap and a normal length points at the signal, not at the kernels.

**Count the groups that carry no advantage**

The rollout `perf` line counts groups with a zero standard deviation: `rollout/zero_std/count_1` for all right and `rollout/zero_std/count_0` for all wrong. In the first step of the manual's baseline, 7 groups were all right and 3 were all wrong, 10 of 32. Over 12 steps with one seed, 191 of 384 groups had one reward for every answer, and 142 of those were all right: easy prompts the model already solved.

**The filter and its cost**

The dynamic sampling filter drops those groups and asks the engine for more prompts until the step holds enough groups with a spread. With batches of 48 prompts for 32 kept groups, the manual's steps dropped 16 to 48 groups each, median 36, and most dropped groups were all right. The rollout took 1.5 times as long when one extra batch was enough and 2.8 times as long when a second batch was needed. The sum of the twelve step times went from 60 minutes to 113.

**Read the reward with the filter on**

`rollout/raw_reward` no longer includes the dropped groups, so compare `rollout/raw_reward_unfiltered` instead. Even that number leaned high in the manual's run, 0.686 against 0.657, because the slowest and longest answers were stopped before they counted, and a cut answer usually scores 0. Treat a gain inside the spread of your baseline seeds as noise.

**What a higher learning rate would do**

A larger step on a thin signal raises the gradient norm and the variance of the update without adding information. The manual's rule for a gradient norm that grows step after step is the opposite: lower the rate.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a group with one reward give a zero advantage? Expected: GRPO subtracts the group mean and divides by the group standard deviation; equal rewards give a zero numerator for every answer.
- **Level 2:** What else makes a math reward score 0 besides a wrong answer? Expected: an answer cut at the length limit before its final line; read the cut share next to the reward.
- **Level 3:** The filter run shows a higher mean reward than the baseline. How do you decide if it learned more? Expected: compare the unfiltered reward, account for the bias from stopped long answers, and run a second seed against the spread of the baseline seeds.
- **Level 3:** Your reward returns fractions, and a group with identical rewards still shows small nonzero advantages. Why? Expected: float32 rounding of the group mean leaves a remainder that the division by a near-zero standard deviation blows up; round rewards to values a float32 holds exactly.

**Wrong answers, and why they fail**

- "Raise the learning rate; the reward is flat because the steps are small." The signal is thin because many groups carry no advantage; a larger step amplifies noise and raises the gradient norm.
- "Sample more answers per prompt to get a spread." In the manual's runs, 4, 8 and 16 answers per prompt gave reward gains inside one seed range, and more answers made each rollout longer.
- "Read the reward of the last step." One step moves by up to a fifth of the scale; read the mean over five or more steps.

**Related lesson in this course:** [Lecture 6: Reasoning models: chain of thought, pass@k, GRPO and the DeepSeek-R1 recipe](#lectures-6)

:::

## Fit a 7B fine-tune on a 24 GB GPU

*Level 2 (working) · estimate · about 10 minutes*

You have one GPU with 24 GB of memory and want to fine-tune a 7B model on your own instruction data. Walk me through the memory for a full update, for LoRA and for QLoRA, and say what makes the last one fit.

:::answer Show the answer
:::say Short answer
A full update of a 7B model needs about 56 GB: the weights in half precision, the gradients, and two optimizer states per parameter, all in half precision. LoRA keeps the half-precision weights but trains only small adapters, so the gradients and optimizer states shrink and the run takes about 18 GB. QLoRA stores the frozen base in 4-bit, about 3.5 GB of weights, and trains the adapters in half precision, so the run takes about 6 GB and leaves room for activations on a 24 GB card.
:::

**Full answer**

**The memory table**

| Method | Weights | Training total | Fits on |
|---|---|---|---|
| Full update, FP16 | 14 GB | about 56 GB before activations, which depend on the workload | one 80 GB datacenter GPU |
| LoRA on an FP16 base | 14 GB | about 18 GB | one 40 GB GPU |
| QLoRA, 4-bit base | 3.5 GB | about 6 GB | one 24 GB consumer GPU |

The 56 GB comes from two bytes per weight, two bytes per gradient, and two optimizer states per parameter; activations come on top of that. This estimate keeps the optimizer states in half precision too. Standard Adam keeps its states in FP32, so a typical full update needs more memory than this, not less. The adapters remove the gradients and the states for every frozen weight, which is the large part.

**What QLoRA adds**

1. NF4. A 4-bit type whose 16 levels sit at the quantiles of a normal distribution, which matches how weights are distributed and loses less than uniform 4-bit integers.
2. Double quantization. Each block of 64 weights needs a scale in FP32, about 0.4 GB for a 7B model; quantizing the scales to 8 bits brings that down to about 0.1 GB.
3. Paged optimizers. Optimizer states page to CPU memory when the GPU runs out, which trades some throughput for no out-of-memory crash from optimizer states. Activations stay on the GPU, so a long sequence can still run out of memory.

**What it costs in quality**

The lesson's table puts LoRA at rank 16 within about one point of a full update, QLoRA at rank 16 a fraction behind that, and QLoRA at rank 64 level with the full update on the listed benchmarks.

**What it costs in time and money**

On the lesson's cost table, QLoRA at rank 16 on a 24 GB consumer card took about 6 hours and about 5 dollars for 50,000 examples over three epochs. The full update took about 8 hours on two 80 GB datacenter GPUs and about 32 dollars. Fused kernels cut the QLoRA run to about 2.5 hours.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does LoRA cut training memory so much more than it cuts weight memory? Expected: the gradients and the two optimizer states exist only for the adapter parameters, which are a fraction of a percent of the model.
- **Level 2:** The adapters train in half precision while the base is 4-bit. Where does the forward pass compute? Expected: the base weights are dequantized block by block to the compute dtype for each matrix product, and the adapter path runs in half precision.
- **Level 3:** When would you still pay for the full update? Expected: when the task needs changes that a low-rank update cannot express, when you have the data and the GPUs, or when the eval shows a gap that a higher rank does not close.
- **Level 3:** How do you serve several QLoRA fine-tunes from one base? Expected: keep the adapters separate and load them on top of one base copy; merge only when you ship a single specialized model.

**Wrong answers, and why they fail**

- "Quantize the whole model to 4-bit and fine-tune it directly." Gradients and optimizer states still need higher precision; the base stays frozen in 4-bit, and only the adapters train.
- "QLoRA halves the quality." The lesson's table shows a loss of a fraction of a point at rank 16 and parity at rank 64.
- "Load the base in 8-bit with LoRA; it is the same thing." Eight-bit weights take twice the memory of NF4, and the double quantization and paged optimizers are what make the 6 GB figure.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## Replacing the human labeler with a principled model

*Level 2 (working) · concept · about 10 minutes*

Your rater budget is gone. A colleague proposes to replace the human labelers with a model that reads a short list of principles and ranks the pairs, and to run the same RLHF pipeline on those labels. Is this just a cheaper RLHF? What changes?

:::answer Show the answer
:::say Short answer
It is the constitutional recipe, and it changes the failure modes rather than removing them. Phase one has the model critique and revise its own answers against sampled principles and trains on the revisions; phase two trains a reward model on pairs ranked by a feedback model and runs the usual RL stage. Rater psychology stops being the bias, and the reading of the principle set becomes the bias, applied uniformly over the whole dataset. Sycophancy toward a rater drops, and the proxy problem stays.
:::

**Full answer**

**The two phases**

1. Self-critique and revision. Start from a helpful but not yet harmless SFT model. For a red-team prompt, the model writes an answer, a second pass reads one sampled principle and critiques the answer, and a third pass revises it. The revision is the SFT target. The original work used 16 principles and kept the set small so that critiques stay focused.
2. RL from AI feedback. Generate pairs, let a feedback model rank them against sampled principles, train a reward model on those rankings, and run PPO against it. Everything after the label is the standard pipeline.

**Why it is not only cheaper**

- The bias moves. A human rater is inconsistent and pleased by agreement; a feedback model applies one reading of a principle to every pair, strict or loose, but uniform.
- The signal is legible. You can read the principle, the critique and the revision for any example; human labels are opaque.
- Goodhart stays. The proxy is now a model's reading of the principle set, still an imperfect measure, so over-optimization against it is still possible.
- The labeler is the same class of model you train, so a bias in it can be amplified rather than averaged out.

**What the original work claimed**

The trained model was more harmless and about as helpful as an RLHF model with comparable data. That result has held across labs.

**A gate next to the training**

A parallel defense trains light classifiers that read the same principles and gate the outputs. The first version cost 23.7 percent extra compute; the later version about 1 percent. Training shapes behavior and classifiers enforce invariants; neither one is enough alone.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the recipe sample one principle per critique instead of giving the model the whole list? Expected: a focused critique is more specific and more useful as a training target; the list as a whole is covered over many samples.
- **Level 2:** Which parts of the pipeline change and which stay? Expected: the label source and the SFT targets change; the reward model, the RL stage and the KL penalty stay.
- **Level 3:** Name a sycophancy-like failure that still occurs with an AI labeler, and a check for it. Expected: the feedback model can prefer answers that quote the principles without following them; rate a held-out set with people and compare the two rankings.
- **Level 4:** How do you argue for a priority order among principles? Expected: conflicts between principles need a resolution rule; a tiered order resolves them top-down, from catastrophic harm to platform rules to general ethics to helpfulness.

**Wrong answers, and why they fail**

- "The labels are free now, so collect ten times more pairs." More pairs with the same uniform bias make the bias stronger, not weaker; the volume gain does not fix the proxy.
- "An AI labeler removes human bias from alignment." It replaces rater bias with principle-interpretation bias; the principles and the labeler's reading of them are now the proxy.
- "This is only a safety trick; it does not touch helpfulness." The original work reports about the same helpfulness as RLHF with comparable data, and the same critique loop can target any principle you write.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Reusing the pretraining learning rate for SFT

*Level 2 (working) · concept · about 8 minutes*

A colleague copies the pretraining configuration into an SFT run: the same peak learning rate, the same warmup, three epochs over 27,000 examples. The loss on the SFT set drops fast and everyone is happy. What do you expect to see when you test the model, and what do you change?

:::answer Show the answer
:::say Short answer
Expect catastrophic forgetting: the model answers in the training format, but its loss on raw text rises and it gets worse at code, math and anything outside the set. Pretraining used a peak rate about fifteen times higher than the SFT value in the lesson, 3e-4 against 2e-5. Cut the rate into the 1e-5 to 5e-5 range, keep one to three epochs, and track raw-text loss next to the SFT loss.
:::

**Full answer**

**Two very different regimes**

| Setting | Pretraining | SFT |
|---|---|---|
| Peak learning rate | 3e-4 | 2e-5 |
| Epochs | 1 | 2 |
| Warmup steps | 2,000 | 0 to 100 |
| Data | 2T tokens | 27,000 examples |

The SFT run adjusts a model that already works. A large step overwrites pretrained features with the patterns of a small set.

**How to see the damage**

Hold out a slice of raw text and measure its next-token loss before and after SFT. The lesson's rule: a rise of more than 10 to 15 percent means the run is too aggressive. Lower the rate or the epochs. Run a small eval on tasks outside the SFT set as well.

**Three mitigations**

1. A low learning rate, 1e-5 to 5e-5.
2. Short training, 1 to 3 epochs. More than 3 epochs on a small set leads to memorization, and the model repeats training examples word for word.
3. A mix of 2 to 5 percent raw pretraining text in the SFT batches, with no mask, so that the model keeps its general ability.

**Why the loss curve misleads**

A fast drop in SFT loss at a high rate is overfitting to the set, not learning. The lesson's exercise compares 1e-4, 2e-5 and 1e-6: the high rate falls fast and ends higher, the low rate barely moves, and the middle value is the sweet spot.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a rate that works for pretraining destroy an SFT run? Expected: pretraining starts from noise and averages over trillions of tokens; SFT starts from a working model and a small set, so each large step overwrites features that the set does not cover.
- **Level 2:** How many epochs, and how do you decide? Expected: one to three; stop when the held-out instruction loss stops improving and the raw-text loss has not risen past the budget.
- **Level 3:** The raw-text loss rose by a quarter, but the product team likes the answers. Ship it? Expected: not as it is; the model lost general ability that users will hit; rerun with a lower rate or a pretraining mix and compare on an eval outside the set.
- **Level 3:** How does LoRA change this picture? Expected: the base weights stay frozen, so the damage is bounded to the adapter and a merge is reversible; the adapter also tolerates a higher rate than a full update.

**Wrong answers, and why they fail**

- "The SFT loss dropped, so the run worked." The loss on the set says nothing about what the model forgot; measure the raw-text loss and an eval outside the set.
- "Warm up for 2,000 steps, like pretraining." The SFT set gives few steps in total; the lesson uses 0 to 100 warmup steps.
- "Use a higher rate to finish faster, the data is small." A high rate on a small set overfits and overwrites pretrained knowledge; small data needs smaller steps, not larger ones.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## The GPU is idle and the RL log keeps growing

*Level 2 (working) · debug · about 10 minutes*

You left a one-GPU RL training run alone for an hour. When you come back, the GPU is idle, the process is still alive, and the log file has grown to more than a hundred megabytes. Nothing reports a failure. What happened, how do you confirm it, and what do you put in place so that it cannot happen again?

:::answer Show the answer
:::say Short answer
The rollout engine died and the trainer never noticed. The engine failed during startup, and the rollout client kept sending requests to it, got a 503 from the router on each one, and retried. The failed run in the manual wrote 200,533 such error lines in 63 minutes and never reported a failure. Confirm it by counting the error lines per minute and by reading the engine lines above the first error, then run every unattended job with a watchdog that stops the container when the errors do not stop.
:::

**Full answer**

**What a dead engine looks like**

The run that the manual lost asked for an attention backend that its GPU could not run. The engine raised an assertion during startup and exited. The trainer process stayed up and sent generate requests to the router for an hour, and the router returned `503 Service Unavailable` for each one. The first and the last error were 63 minutes apart.

**Confirm the cause, in this order**

1. Count `503 Service Unavailable` over the whole log. The manual's healthy runs held none at all, with one exception below.
2. Count the errors per minute. The dead engine wrote at least 2,669 in every full minute. A healthy but busy engine wrote bursts of up to about a minute and then nothing: the run with 16 answers per prompt logged 22,357 errors in bursts of up to 2,209 in one minute, the client retried, and the run finished every step.
3. Read the engine lines above the first error. The cause lives there, not in the trainer lines.

**Why a count alone is not enough**

A count cannot separate a burst from a death, but time can. The watchdog in the manual reads the last 60 seconds of the container log every 30 seconds and counts the errors. It stops the run only when the count passes 100 in ten checks in a row. Replayed on the real error times of the busy run, a rule with six checks would have stopped that healthy run in 17 of 30 cases, because two bursts came 45 seconds apart. With ten checks it stopped no healthy case and still stops a dead engine in about five minutes.

**What the watchdog cannot see**

A run that hangs after a reward module import error writes almost no error lines. The manual's test stayed up for two hours with 44 of them, and the watchdog did not fire. For that symptom, look for `ModuleNotFoundError` with no `rollout 0` line after it.

**Practice**

- Start the watchdog in a second terminal for every run you leave alone, and test it first on a container that prints the error on purpose; the manual's test stopped a fake dead engine in 183 seconds.
- Give each run its own container name and its own log file.
- Read the exit code: 1 means the watchdog stopped the run, 2 means it lost contact with the container runtime and the run had no guard.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the trainer not fail when the engine is gone? Expected: the rollout client treats the 503 as a transient error and retries each request; nothing in the loop limits the retries or the idle time.
- **Level 2:** Where do you look for the reason the engine died? Expected: the engine lines above the first 503 in the same log; in the manual's case an attention backend assertion for a GPU outside its supported range.
- **Level 3:** Why did the manual raise the watchdog from six checks to ten? Expected: a replay on a healthy run showed bursts 45 seconds apart that six checks mistook for a death; ten checks never fired on a healthy run and still caught a dead engine in about five minutes.
- **Level 3:** What does the watchdog miss, and what do you add for it? Expected: a run that hangs with few errors, such as a reward import failure; add a check that the first step line appears within a time limit.

**Wrong answers, and why they fail**

- "Kill the run as soon as a 503 appears." A busy engine with hundreds of open requests writes bursts of these errors and recovers; the manual's busy run finished all its steps.
- "Raise the client retry limit so the run survives." Retries are why the dead run lived for an hour; the engine will not come back by itself, and the GPU sits idle.
- "The trainer crashed; look at the trainer lines." The trainer was alive and logging errors; the cause is in the engine startup lines above the first error.

:::

## A step-0 gap several times the healthy range

*Level 3 (senior) · debug · about 12 minutes*

You start a GRPO run with a new model checkpoint. At step 0, the metric that compares the trainer's log-probabilities with the rollout engine's reads several times higher than on your earlier runs with the same model family. A colleague suggests turning on the engine's deterministic mode to close it. What do you do?

:::answer Show the answer
:::say Short answer
Stop the run before it trains on wrong numbers. At step 0 both sides hold the same weights, so a value far above your healthy range means the two sides do not compute the same model: a wrong checkpoint path on one side, or a format that one side reads differently. Deterministic inference does not help; in the manual's runs it left the gap unchanged at about 0.015 and made the engine repeat itself, which is a different property. Fix the setup, then compare the step-0 value with the range of your healthy runs.
:::

**Full answer**

**What step 0 proves**

No training has happened yet. The trainer scores the sampled tokens with the weights the engine used, so every difference comes from the setup. Two values must be exactly 0 at step 0: `train/ppo_kl`, the KL between the trainer's old and new probabilities, and `train/pg_clipfrac`, the share of clipped tokens. The gap itself, `train/train_rollout_logprob_abs_diff`, is never 0 outside the bit-exact mode, because the two sides run different kernels. It must still sit inside your range.

**The ranges in the manual**

| Setup | Gap at step 0 |
|---|---|
| Qwen3-0.6B, plain sampling, 17 runs | 0.0148 to 0.0157 |
| Qwen3-0.6B, top-p 0.95 and top-k 64 | 0.0136 |
| Qwen3-1.7B | 0.0109 |

The gap depends on the model and the sampler, so build the range from your own seeds. A value several times the range points at the model, not at the kernels.

**Why deterministic mode is the wrong tool**

Deterministic inference makes the engine give the same result for a request, whatever the batch around it. In four 12-step runs with one seed, the median gap was 0.01526 with the default engine and 0.01518, 0.01520 and 0.01515 with deterministic kernels on two attention backends. Two deterministic runs repeated the step-0 gap to six decimal places, 0.015404. So the mode buys repeatability, not agreement, and it cost 40 to 45 percent more rollout time on clean steps.

**The checks, in order**

1. The checkpoint paths of both sides. With the trainer the manual uses, both sides load from one argument; a split layout or a low-precision engine loads two files, and they must hold the same model.
2. The model format: a conversion step that one side applies and the other does not.
3. The weight equality check on a two-step run after the first update, with the quantization tolerance on when the engine runs in low precision.
4. The sampler. A top-p or top-k setting on one run and not on the other moves the gap, as the table shows.

**What a healthy gap does over a run**

It stays flat. In the manual's three baseline seeds, every step over 48 steps stayed between 0.0136 and 0.0164, and the KL between the two sides stayed between 0.00063 and 0.00076. A gap that jumps and stays high after a weight update means the two sides no longer hold the same weights.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the gap never zero in a normal run? Expected: the two sides add the same numbers in a different order, with different kernels; across many layers and a large vocabulary the rounding adds up.
- **Level 3:** What does the deterministic mode buy, then? Expected: the same rollout for the same seed, which is what you need to test a reward function on identical samples.
- **Level 4:** Which levers move the floor of the gap itself? Expected: the precision on both sides, the tensor-parallel size of the engine, and kernels that add in one fixed order; each costs speed or work.
- **Level 4:** The gap is fine at step 0 and grows step after step. What is different from the step-0 failure? Expected: the weights diverge after updates, so the weight update path is the suspect, not the checkpoint; read the update logs and run the weight equality check.

**Wrong answers, and why they fail**

- "Turn on deterministic inference to close the gap." The manual's four runs show the same gap with and without it; it makes the engine repeat itself and costs rollout time.
- "A gap is normal; keep training and watch the reward." A step-0 value several times the healthy range means the trainer scores a different model than the one that sampled, so the run trains on wrong numbers from the first update.
- "Add an importance-sampling correction." A reweighting hides a gap that comes from a setup error; remove the cause first.

:::

## DPO or the full RLHF stack for a small team

*Level 3 (senior) · tradeoff · about 12 minutes*

A team of four engineers with eight GPUs has about 20,000 preference pairs for a customer support assistant and wants it aligned in three weeks. One engineer wants the full RLHF stack with a reward model and PPO. Another wants DPO. Which do you pick, and under what conditions would you reverse the choice?

:::answer Show the answer
:::say Short answer
Pick DPO. With tens of thousands of pairs it matches or beats the full stack, it trains one model against a frozen reference in a supervised loop, it needs about a third of the compute, and each experiment takes hours instead of days. Reverse the choice when the signal has several dimensions and needs a learned reward you can inspect and reuse, when you want an online loop that rates fresh samples, or when DPO plateaus on your eval.
:::

**Full answer**

**What DPO buys**

| Aspect | RLHF with PPO | DPO |
|---|---|---|
| Models trained | three: SFT, reward, policy | one: the policy |
| Models in memory | three or four during PPO | two: policy and reference |
| Hyperparameters | learning rate, KL coefficient, clip ratio, reward model rate, epochs for each stage | learning rate, beta, epochs |
| Stability | sensitive to the settings | close to SFT |

For a 70B model each copy takes 140GB in FP16, so one model fewer in memory is a different hardware tier.

**When DPO wins**

- Small datasets, 5,000 to 20,000 pairs. A reward model needs enough data to generalize and overfits below that; DPO never fits one.
- Limited compute. One training loop instead of three, roughly one third of the full stack.
- Fast iteration. Trying 10 preference sets takes ten runs of hours each, with no reward model to retrain for each one.

The lesson's reference result: a 7B model aligned with DPO on 60K pairs scored 6.47 on a chat benchmark against 6.86 for a 70B chat model trained with the full stack, within six percent of a model ten times its size.

**When the full stack wins**

- Several quality dimensions at once, such as helpfulness, harmlessness and honesty. A reward model learns the trade-off; DPO sees each pair as one binary signal.
- An online loop: sample from the current policy, rate, retrain the reward model, continue. DPO works on a fixed set.
- A reward model you can reuse for best-of-N sampling or as a judge at decode time.
- The largest scales, where a separate reward model has captured more nuance in published pipelines.

**The practical path**

Start with DPO. Switch to the full stack when the eval plateaus. Several production pipelines run both: the full stack first for broad alignment, DPO after it for targeted refinement.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does the DPO run still need from the RLHF recipe? Expected: an SFT checkpoint as the frozen reference, a held-out eval, and a beta choice that plays the role of the KL coefficient.
- **Level 3:** The pairs come from an older model's outputs. Does that matter for DPO? Expected: yes; pairs that are rare under the reference produce arbitrary implicit rewards, so sample the pairs from the SFT model or filter them by reference likelihood.
- **Level 4:** How would you turn the three weeks into an iterative loop without PPO? Expected: run DPO, generate from the new policy, collect preferences on those samples, run DPO again; the lesson's exercise calls this iterative DPO.
- **Level 4:** Which failure mode do both methods share? Expected: over-optimization of a proxy, the reward model in one case and the ratio to the reference in the other; both need a blind eval and early stopping.

**Wrong answers, and why they fail**

- "RLHF is the proven path, so start there." The full stack is fragile to tune and needs three training loops; the lesson's practical guidance starts with DPO and switches only on a plateau.
- "DPO needs no SFT stage." It needs a reference policy, and that reference is the SFT checkpoint; the single-stage methods are different losses.
- "DPO has no hyperparameters to worry about." Beta decides how far the policy moves from the reference, and the lesson's sweep shows degenerate answers at a small value and no learning at a large one.

**Related lesson in this course:** [Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO](#lectures-5)

:::
