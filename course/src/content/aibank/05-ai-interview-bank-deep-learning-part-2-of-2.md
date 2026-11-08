---
track: aibank
title: "AI interview bank: Deep learning (part 2 of 2)"
short: Deep learning 2
sub: 10 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A loss that sits at 2.3 on a ten class problem

*Level 3 (senior) · debug · about 12 minutes*

A ten class classifier trains for many epochs, and the cross-entropy loss sits at about 2.3 the whole time, on training data and on validation data. Nothing crashes. What does that number tell you, and in which order do you debug?

:::answer Show the answer
:::say Short answer
Minus the natural log of one tenth is about 2.3, the loss of a model that gives every class the same probability, and the lesson's table reads a loss stuck there as a uniform prediction with no usable signal. The mean alone does not say why. Run the one batch overfit test first: a failure points at the loss, the backward pass, the optimizer hookup or misaligned labels, and a pass sends you to the data path to check that labels line up with inputs. Only then look at the learning rate, the gradients and the architecture.
:::

**Full answer**

**Reading the number**

Categorical cross-entropy on a one-hot target is minus the log of the probability of the true class. A random guess among 10 classes gives each class probability 0.1 and a loss of minus log 0.1, about 2.3. The debugging lesson's master table has this row: a loss stuck at minus log of 1 over the class count means the model predicts a uniform distribution, and the first thing to check is the data pipeline and whether labels match inputs. A model with no usable signal settles on equal logits, because that is what minimizes the expected loss over a balanced label set.

**The order**

1. **Overfit one batch.** Take 8 to 32 samples and train on them for a few hundred steps. The loss must go to near zero and the training accuracy to 100 percent. If it does not, the model or the loop is broken: a wrong loss, a broken backward pass, an optimizer not connected to the parameters, or inputs and labels out of step. The lesson's threshold for a pass is a final loss below 0.1.
2. **Look at the data.** Print 5 random samples with their labels. Check that the shuffle keeps each input paired with its label, that inputs are normalized to mean 0 and standard deviation 1, and that labels have the integer type the loss expects.
3. **Learning rate.** Try three values 10 times apart, such as 1e-2, 1e-3 and 1e-4. A rate that is far too low looks flat, but it would not sit exactly on the uniform value for many epochs.
4. **Gradients.** All zeros points at dead ReLUs or a detached graph.
5. **Architecture.** Only after the above: a model too small underfits, but it still beats a uniform guess on its own training data.

**How this differs from a slow start**

A loss that starts near 2.3 and falls slowly is a learning rate or capacity question. A loss that holds at 2.3 for many epochs on the training set means no signal reaches the model at all.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why uniform rather than some other wrong answer? Expected: with no usable signal, equal logits minimize the expected cross-entropy over a balanced label set, and that costs the log of the class count.
- **Level 3:** What does the overfit one batch test tell you here? Expected: whether the model and loop can learn at all; a healthy setup drives a small batch to near zero loss in a few hundred steps, and a failure means a broken loss, backward pass, optimizer hookup or misaligned labels.
- **Level 4:** The one batch test passes and full training still sits at 2.3. Where next? Expected: the full data path, such as a shuffle that breaks the pairing of inputs and labels, or unnormalized inputs, since the model can learn when given a consistent batch.
- **Level 4:** What distinguishes this symptom from a loss that starts at 2.3 and falls slowly? Expected: a slow fall is a learning rate or capacity question; a flat 2.3 for many epochs means no signal reaches the model.

**Wrong answers, and why they fail**

- "Train longer, it is a slow start." A flat value at the uniform loss for many epochs means no signal, not a slow one.
- "Make the model bigger." Capacity is not the issue when the model cannot beat a uniform guess on its own training data.
- "Lower the learning rate." The rate changes how fast the loss moves, and here it does not move at all; check the data first.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## A training loop whose loss swings after a few steps

*Level 3 (senior) · code-reading · about 10 minutes*

This loop trains a small network with plain SGD at a small learning rate on a fixed batch.

```python
for step in range(50):
    out = model(x)
    loss = criterion(out, y)
    loss.backward()
    optimizer.step()
```

The loss falls for a few steps and then swings up and down. Read the loop, name the bug, explain the mechanism, and say where the fix goes.

:::answer Show the answer
:::say Short answer
The loop never zeroes the gradients, so each backward call adds the new gradient on top of all the earlier ones. The step applies a growing sum, which acts like a learning rate that rises at every step, and the loss oscillates. Add the optimizer's zero_grad call before backward, which is where the lesson's correct loop puts it.
:::

**Full answer**

**Why the gradient grows**

Gradient storage is an accumulator by design. A parameter used in several places sums its contributions, and a backward call adds into the stored gradient rather than replacing it. In the mini framework the Linear layer's backward does exactly that, with a plus-equals into the weight gradients, and the optimizer's zero_grad sets every gradient container back to 0.0. A framework does the same. Without the reset, step one applies g1, step two applies g1 plus g2, step three applies the sum of three, and so on. The direction stays roughly right for a while and the magnitude climbs until the updates overshoot.

**The lesson's order**

```text
zero_grad, forward, loss, backward, (clip), step, (schedule)
```

The debugging lesson lists a forgotten zero_grad first among the bugs that waste the most hours, with this symptom: gradients accumulate across batches and the loss oscillates. Its demo reproduces the exact loop above and reports it. The optimizers lesson adds the ordering rule for the two trailing calls: the scheduler steps after the optimizer, and swapping them is a subtle bug.

**How to see it in logs**

On a fixed batch the gradient norm should fall or hold as the loss falls. With this bug it grows step after step while the loss first improves and then swings with increasing amplitude. The overfit one batch test, which this loop resembles, would fail to reach a near zero loss.

**When accumulation is on purpose**

Gradient accumulation across several small batches emulates one large batch: run backward on each micro batch without zeroing, then take one step and one zero_grad for the group, with the loss scaled by the group size. That is an exercise in the framework lesson. The difference from the bug is the single step per group and the division.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why do frameworks accumulate gradients instead of overwriting them? Expected: a parameter used in several places sums its contributions, and accumulation across micro batches emulates a larger batch; the reset is left to the caller.
- **Level 3:** Where do clipping and the schedule go in the order? Expected: zero_grad, forward, loss, backward, clip, step, schedule; the scheduler steps after the optimizer.
- **Level 4:** How would you detect this bug from logs without reading the code? Expected: the gradient norm grows step after step on a fixed batch where it should shrink or hold, and the loss oscillates with growing amplitude.
- **Level 4:** When is skipping zero_grad on some steps correct? Expected: deliberate accumulation over several micro batches, with one step and one zero_grad after the group and the loss scaled by the group size.

**Wrong answers, and why they fail**

- "The learning rate is too high." The rate is small; the accumulated gradient is what grows.
- "Reset the gradients only every few steps to smooth them." That is accumulation without the division; the step size scales with the group size and the loss swings.
- "Detach the loss each step to stop the buildup." Detaching stops the graph, not the stored gradients; the gradient buffers still hold the sum.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## The 30 second check before a multi-day run

*Level 3 (senior) · design · about 10 minutes*

You are about to launch a multi-day training run on a new architecture with a new data pipeline. Design a check that runs in about 30 seconds and must pass before the run starts. List the classes of bugs it catches and the ones it does not.

:::answer Show the answer
:::say Short answer
Take one small batch of 8 to 32 samples and train on it alone for a few hundred steps. The loss must fall to near zero and the training accuracy must reach 100 percent. A pass shows that the loss function, the backward pass and the optimizer hookup work, and that the model can fit this batch, but not that each input has its correct label, because a model can memorize a wrong but consistent pairing as well. It says nothing about generalization, leakage or the full data loader, so it is the first gate and not the last.
:::

**Full answer**

**The test**

The debugging lesson calls this the single most important technique in deep learning. Fix a batch, build a fresh model and optimizer, and loop: zero the gradients, forward, loss, backward, step. Print the loss and accuracy every 50 steps. The lesson's implementation runs 200 steps and treats a final loss above 0.1 as a failure.

**What a failure means**

Any of these, and the lesson lists them:

- a loss function that does not match the output layer;
- a broken backward pass or a detached graph;
- an optimizer built before the model's parameters existed, so it updates nothing;
- inputs and labels out of step;
- an architecture too small to represent even this batch.

Each of these would also break the full run, and there it would show up hours later as a slow or flat loss with twenty possible causes. Here it shows up in seconds with five.

**What a pass does not prove**

The test overfits by design, so it says nothing about generalization. A model can memorize any consistent labels, so a wrong pairing of inputs and labels inside the fixed batch also passes. It uses one batch, so a shuffle that unpairs inputs and labels across the full set, a normalization computed on the full dataset, duplicate rows across splits, or label noise can all survive it. The lesson's checklist continues after it: print the model summary and check the parameter count, run one forward pass on random data and check the output shape, train for 5 epochs and confirm the loss falls, check activation statistics for dead or exploding layers, check the gradient flow across layers, and print 5 random samples with their labels.

**Make it a gate**

Run it at startup on a fixed batch, assert the final loss is below the threshold, and refuse to start the long run when it fails. Run it again whenever the architecture or the pipeline changes.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The loss on the one batch stalls well above the threshold. Name three suspects. Expected: a loss that does not match the output layer, an optimizer built before the model's parameters were created, or a model too small to fit the batch.
- **Level 3:** Why 8 to 32 samples? Expected: small enough that a correct model memorizes it in a few hundred steps, so a failure is unambiguous and the test stays fast.
- **Level 4:** The test passes and the full run later shows training accuracy at chance. What does the pass rule out, and what remains? Expected: the model and loop can learn, so what remains is the full data path: a shuffle that unpairs inputs and labels, or normalization computed differently for the full set.
- **Level 4:** How do you turn this into a gate in a training script? Expected: run it on a fixed batch at startup, assert the final loss is below the threshold, refuse to start the long run on a failure, and rerun it whenever the architecture or pipeline changes.

**Wrong answers, and why they fail**

- "A passing test means the model will generalize." It proves the model can memorize one batch; generalization needs the validation curve.
- "Skip it, the full run shows problems soon enough." The run shows a symptom hours later and the symptom fits many causes; the test isolates the loop in seconds.
- "Use the whole training set for a few epochs instead." That is the full run; a small batch is what makes a failure unambiguous and fast.

:::

## Two layers where most ReLU outputs are exactly zero

*Level 3 (senior) · debug · about 12 minutes*

After a few hundred steps at a high learning rate, a ReLU network's loss stops falling. You log the activations after each ReLU, and in two layers more than half of them are exactly zero on every batch. Explain what happened to those units, why they cannot come back on their own, and what you change.

:::answer Show the answer
:::say Short answer
First confirm that the units are dead and not only sparse: over a large sample, a dead unit is zero on every input. A ReLU unit whose pre-activation is negative for every input outputs zero and has a derivative of zero, so it receives no gradient and its weights never move again. A large update, driven by the high learning rate, pushed those units' weights and biases far enough negative that no input brings them back. Lower the learning rate, re-initialize the dead units or the dead layers, and move to an activation with a gradient on the negative side, such as a leaky variant or GELU.
:::

**Full answer**

**What a dead unit is**

ReLU is max(0, x). Its derivative is 1 for positive inputs and 0 otherwise. A unit whose input is negative on every sample outputs 0, passes 0 gradient to its weights, and nothing else in the loss touches those weights. It is dead for the rest of training. The activation lesson reports that 10 to 40 percent of units can die in a ReLU network in practice. The debugging lesson's threshold is more than half zeros after a ReLU layer: at that point switch the activation or reduce the learning rate.

**How the high learning rate did it**

One oversized step moves a unit's bias or weights far negative. After that step every input lands below zero. The debugging lesson's demo builds the state directly by filling weights with -1.0 and biases with -5.0 and shows a flat loss with most activations at zero. A high learning rate reaches the same state by accident.

**Telling dead from sparse**

Some zeros are normal; ReLU is meant to be sparse. Count, over a large sample, the fraction of inputs on which each unit is positive. Dead means zero on all of them. The activation lesson's detector reports dead, barely alive and healthy units from that count.

**What to change**

1. Lower the learning rate, and add gradient clipping so one bad batch cannot produce the step again.
2. Re-initialize the incoming weights of the dead units with a Kaiming draw and continue; the rest of the network keeps its progress. This is the debugging lesson's dead neuron resurrector exercise.
3. Switch the activation. A leaky ReLU keeps a small slope on the negative side, so a unit can recover. GELU is smooth and avoids the failure entirely; the activation lesson prefers it over the leaky variant unless there is a specific reason.
4. Check initialization. A Kaiming draw keeps pre-activations centered at the start, so fewer units begin life negative.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the unit stay dead rather than drift back? Expected: zero output gives zero gradient to its weights, and nothing else in the loss touches them.
- **Level 3:** How do you tell a dead unit from a sparsely active one? Expected: count the fraction of inputs on which it is positive over a large sample; dead is zero on all, sparse is positive on a small fraction.
- **Level 4:** What links the high learning rate to the death? Expected: one large step moves the bias or weights far negative so every input lands below zero; clipping and a smaller rate limit the step.
- **Level 4:** Can you revive the dead units without retraining from scratch? Expected: re-initialize their incoming weights with a Kaiming draw and continue; the rest of the network keeps its progress.

**Wrong answers, and why they fail**

- "Half zeros is normal sparsity for ReLU." Some zeros are normal; a unit that is zero on every input is dead and contributes nothing, and the lesson flags a layer above half zeros.
- "Raise the learning rate so the units jump back." The gradient is zero regardless of the rate; no step reaches them.
- "Switch to sigmoid to avoid zeros." Sigmoid trades dead units for vanishing gradients through depth; a leaky variant or GELU keeps the benefits of ReLU.

:::

## What a learning rate warmup protects

*Level 3 (senior) · concept · about 10 minutes*

A transformer recipe starts the learning rate at zero and ramps it linearly up to the peak during the first steps, then decays it with a cosine. A teammate wants to start at the peak to save those steps. Explain what the ramp protects, how long it should be, and how to write it down so the recipe scales to a longer run.

:::answer Show the answer
:::say Short answer
The first updates are the fragile ones: the weights sit near their initialization, Adam's running estimates of the gradient mean and variance are built from a handful of samples, and the gradient norm is large and noisy. A full size step on that footing diverges or drops the model into a plateau it never leaves. Warmup keeps the effective step small until the statistics settle, over about 1 to 5 percent of the total steps, and the schedule should express that length as a fraction of the run rather than as a fixed step count.
:::

**Full answer**

**What is wrong at step zero**

Adam's two moment estimates start at zero. Bias correction fixes their scale, but the first steps still use statistics from one or two gradients, which the schedules lesson calls garbage statistics. At the same time the weights are at their random initialization and the gradient norm is at its largest and noisiest. A peak step on that mix is a large, poorly directed move. The capstone lesson gives the two outcomes: the run diverges outright, or it settles into a loss plateau it never escapes.

**What warmup does**

```text
lr(t) = lr_max * t / warmup_steps     for t below warmup_steps
```

The rate climbs from zero to the peak over the warmup steps. By the time the full rate arrives, the moment estimates have seen hundreds of gradients and the weights have moved off their starting point. The schedules lesson's examples of published runs use a warmup of 2000 steps to a peak of 3e-4 followed by a cosine decay to 3e-5, and a warmup over 375 million tokens to a peak of 6e-4.

**How long**

The schedules lesson gives 1 to 5 percent of the total steps and, when in doubt, 3 to 5 percent. The capstone lesson gives 1 to 3 percent and makes the stronger point: write the warmup as a fraction. A run of 200 million steps with 2,000 warmup steps is at the peak almost at once, and a run of 20,000 steps with the same count warms up for 10 percent. The same number describes two different schedules.

**How to see that it worked**

Log the gradient norm next to the learning rate at each step. In a well tuned warmup the norm rises roughly in step with the rate and settles after the peak. A norm that stays high after the ramp ends says the peak is too aggressive. A divergent run shows the norm spike before the loss does.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is Adam sensitive at step zero in particular? Expected: its moment estimates start at zero and the first steps use statistics from one or two gradients; bias correction fixes their scale but not their noise.
- **Level 3:** What does the gradient norm look like during a healthy warmup? Expected: it rises roughly in step with the learning rate and settles after the peak; a norm that stays high after the ramp says the peak is too aggressive.
- **Level 4:** Why does a fixed warmup step count break when the run gets longer? Expected: 2000 steps is 10 percent of a 20,000 step run and a vanishing share of a 200 million step run, so the same count gives two different schedules; a fraction keeps the shape.
- **Level 4:** You change the batch size. What do you revisit? Expected: the warmup length and the peak; the schedules lesson lists the warmup period as the setting that must change when the batch size changes.

**Wrong answers, and why they fail**

- "Warmup wastes steps at a low rate." The lessons spend 1 to 5 percent of training on it, and a run that diverges in its first steps wastes all of them.
- "Bias correction already handles Adam's cold start, so warmup is redundant." The correction rescales the averages; it cannot turn two samples into a good estimate.
- "Set the warmup to 2000 steps, the big runs use that." That count was a fraction of one specific run; on a short run it is most of the training, and on a longer one it is nothing.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Why a deep residual stack needs more than Kaiming

*Level 3 (senior) · concept · about 12 minutes*

A transformer with Kaiming-initialized weights trains without trouble at 20 layers and diverges at 126 layers with the same recipe. Nothing else changed. Explain why depth breaks it even with a variance preserving initialization, and what the GPT-2 style fix does.

:::answer Show the answer
:::say Short answer
Kaiming keeps the variance constant through each sub-layer, but a residual block adds the sub-layer's output back onto its input, and the variance of a sum of independent terms adds. With N residual additions the stream's variance grows in proportion to N, so a deeper stack carries a larger residual signal, and the attention logits and feed-forward activations built from it grow with it. The GPT-2 fix scales the weights of the layers that write into the residual stream by 1 over the square root of 2N, so the accumulated variance stays the same at any depth.
:::

**Full answer**

**Two kinds of variance preservation**

Kaiming answers one question: how to draw weights so that a matrix multiply followed by a ReLU returns a signal with the same variance it received. It knows nothing about what happens next. In a residual block the next thing is an addition:

```text
x = x + sublayer(x)
```

If the sub-layer output has about the same variance as x and is roughly independent of it, the sum has about twice the variance. Each block adds again. After N additions the stream has grown in proportion to N. The lesson states this directly: each addition increases variance, and with N residual layers the variance grows proportionally to N.

**Why it shows up as depth**

At 20 layers the growth is a modest factor and the optimizer copes. At 126 layers, the depth the lesson cites for a 405B parameter model, the stream is large enough at initialization that the softmax inside attention and the activations in the feed-forward blocks run far from their intended range, and the first updates are oversized. Without a correction, the lesson says, the residual stream would grow without bound through the stack.

**The fix**

GPT-2 scales the weights of the residual projections, the layers that write into the stream, by 1 over the square root of 2N, where N is the number of layers. The 2 counts the two writes per layer, one from attention and one from the feed-forward block. The sum of 2N contributions each scaled by that factor has the same variance as one, so the stream stays in range at any depth. The lesson notes that the 405B model uses a similar scheme and that a transformer built from scratch must add this scaling itself.

**How to confirm before you change anything**

Push random tokens through the untrained model and log the residual stream magnitude at each layer. Growth with depth confirms the diagnosis. Run it again with the scaling and the curve should be flat. The lesson's exercise does exactly this over 50 layers.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does Kaiming not account for this? Expected: it preserves variance through a matrix multiply followed by ReLU; it knows nothing about the addition that follows.
- **Level 3:** Why 2N and not N? Expected: each transformer layer writes into the stream twice, once from attention and once from the feed-forward block, so N layers make 2N additions.
- **Level 4:** How would you confirm the diagnosis before changing the initialization? Expected: push random input through the untrained model and log the residual stream magnitude per layer; growth with depth confirms it, and the scaled version should be flat.
- **Level 4:** Does a Pre-LN layout remove the need for the scaling? Expected: it normalizes what enters each sub-layer and helps stability, but the additions into the stream sit outside the norm, so the lesson still applies the scaling to the writers.

**Wrong answers, and why they fail**

- "Deeper models just need a smaller learning rate." A smaller rate slows the growth of the weights; it does nothing about the variance that accumulates in the forward pass at initialization.
- "Kaiming is variance preserving, so depth cannot be the issue." It preserves variance through each sub-layer, not through the sum of a sub-layer and its input.
- "Divide the residual stream by N at the output." The fix has to act where the variance accumulates; scaling the writers keeps every intermediate layer in range, not only the last one.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Why transformers normalize across features, not the batch

*Level 3 (senior) · tradeoff · about 12 minutes*

A team ports a vision training recipe to a transformer and keeps batch normalization. Training is unstable, and text generation with one sequence at a time produces garbage. Explain why transformers use layer normalization instead, and when you would go a step further to RMSNorm.

:::answer Show the answer
:::say Short answer
Batch normalization normalizes each feature across the batch, so its statistics depend on the batch size and on which sequences share the batch; with small batches they are noisy, with a batch of one they are meaningless, and training and inference run different code paths. Layer normalization normalizes across the features of one sample, so it does not depend on the batch and is identical in both modes, which is what variable length sequences and single sequence generation need. RMSNorm drops the mean subtraction and the shift parameter, keeps the accuracy, and saves about 10 percent of the normalization cost, which is why most recent large language models use it.
:::

**Full answer**

**Batch normalization and its two dependencies**

For each feature, batch normalization subtracts the batch mean, divides by the batch standard deviation with an epsilon, and applies a learned scale gamma and shift beta. Two things follow. First, the result for one sample depends on the other samples in its batch. The lesson puts the floor at a batch of about 32; below it the statistics are noisy, and at a batch of one the variance is zero. Second, inference cannot see a batch, so it uses running averages collected in training with a momentum of 0.1, which is a second code path and a second source of bugs. Sequence models hit both problems: lengths vary, memory limits the batch, and generation runs one sequence at a time.

**Layer normalization**

Layer normalization computes the mean and variance over the D features of one sample and normalizes that sample alone. No batch dependence, no running averages, the same computation in training and at inference. Transformers apply it around each attention block and each feed-forward block, after them in the Post-LN layout or before them in the Pre-LN layout, which the lesson notes trains more stably.

**RMSNorm**

RMSNorm divides by the root mean square of the features and multiplies by gamma. There is no mean subtraction and no beta. The observation behind it is that re-centering adds little to accuracy and costs compute, so removing it gives the same accuracy with about 10 percent less normalization overhead. At the scale of billions of parameters that saving is real, and most modern large language models use it.

**Why batch normalization helps at all**

The first published explanation, internal covariate shift, has been shown to be wrong. The gain comes from a smoother loss landscape with more predictive gradients, which lets the optimizer take larger steps. Layer normalization and RMSNorm deliver that effect without the batch dependence.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does batch normalization need at inference that layer normalization does not? Expected: running averages of the mean and variance collected in training; layer normalization computes its statistics from the sample itself.
- **Level 3:** Where does a transformer block place the normalization? Expected: after each attention and feed-forward block in Post-LN, or before them in Pre-LN, which trains more stably.
- **Level 4:** What does RMSNorm remove and what does it cost? Expected: the mean subtraction and the shift parameter; the lesson reports the same accuracy with about 10 percent less normalization overhead.
- **Level 4:** Why did the original explanation for batch normalization fall out of favor? Expected: later work showed the gain comes from a smoother loss landscape with smaller Lipschitz constants, which lets the optimizer take larger steps.

**Wrong answers, and why they fail**

- "Batch normalization only needs a bigger batch." Generation runs one sequence at a time and sequence lengths vary; the fix is a norm that does not look across the batch.
- "Layer normalization is a weaker regularizer, so it is a compromise." It normalizes across features, which is the right axis for sequences, and it removes the mismatch between training and inference.
- "RMSNorm is an approximation that loses accuracy." The lesson reports the same accuracy; the re-centering adds little and costs compute.

:::

## A smooth loss that turns inf and then NaN hours in

*Level 4 (staff) · debug · about 15 minutes*

A run trains for hours with a smooth loss. Then, within three logging intervals, the loss jumps, becomes inf, and every value after that is NaN. The same recipe worked on a smaller model. Give your ranked list of causes, the evidence that separates them, and the changes that keep it from happening again.

:::answer Show the answer
:::say Short answer
A clean run that dies late is almost always an oversized update: the peak learning rate is too high for the larger model, a rare batch produced a huge gradient, or the schedule reached its peak at a point where the model was already sensitive. The logs separate the cases: for an explosion the gradient norm spikes before the loss does, while a forward pass overflow, such as a softmax without the max shift or a normalization over a zero variance, shows a normal norm and a loss that goes to inf in one step. Fix with gradient clipping by norm at 1.0, a lower peak with warmup, and a loss computed from logits, then resume from the last good checkpoint.
:::

**Full answer**

**Rank the causes**

1. **Update too large for this model.** The debugging lesson's table: a loss that goes NaN after some steps means the learning rate is too high, and the first move is to reduce it by 10 times. The peak that was safe on the smaller model is close to the edge on the larger one. The capstone lesson advises sweeping the peak on a small model as a prior, and says the optimum shifts with size, so confirm rather than copy.
2. **One bad batch.** A single outlier batch produces a gradient large enough to corrupt every weight in one step. Without clipping, nothing stops it.
3. **Schedule position.** Check where the schedule was when the loss jumped. A short warmup or a peak reached at the wrong time puts the largest steps on a model that cannot take them.
4. **Forward pass overflow.** An exp in a hand written softmax without the max shift, a log of zero, or a division by a zero variance in a normalization. These produce inf at once, usually at the first step, so they rank low for a run that was clean for hours, but a rare batch can trigger them late.

**What the logs show**

- The gradient L2 norm logged beside the learning rate every step. The capstone lesson's rule: a divergent run shows the norm spike before the loss does. An overflow shows a normal norm and a loss that is inf in a single step.
- Per-layer gradient statistics. The debugging lesson flags a layer whose mean absolute gradient exceeds 100 as exploding and shows which layer went first.
- Replay. Load the last good checkpoint, feed the batch from the failing step, and watch the norm. If that batch alone reproduces the spike, it is the trigger; if it does not, the schedule or the rate is.
- Anomaly detection in the autograd engine, to name the operation that produced the first NaN.

**Changes that prevent a repeat**

- Clip the gradient by its global norm at 1.0 before the step. Clipping by norm keeps the direction; clipping each element does not.
- Lower the peak and keep a warmup of 1 to 5 percent of the steps, so the largest steps arrive after the optimizer statistics settle.
- Compute the loss from logits with a fused, stable function, and keep epsilons in logs and divisions.
- Checkpoint often enough that a resume costs minutes, and alert on a NaN loss so the run stops at the first bad step rather than hours later.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What in the logs separates an oversized update from a forward pass overflow? Expected: the gradient norm rises over several steps before the loss for an explosion; an overflow shows a normal norm and a loss that goes to inf in a single step.
- **Level 4:** Why clip by norm rather than by value? Expected: clipping by norm scales the whole gradient and keeps its direction; clipping each element changes the direction.
- **Level 4:** Why did the recipe work on the smaller model? Expected: the peak that was safe there sits near the edge for the larger one; a sweep on the small model is a prior, and the optimum shifts with size, so verify rather than copy.
- **Level 4:** What do you add so the run never dies silently again? Expected: log the gradient norm beside the learning rate each step, alert on a NaN loss, checkpoint often enough to resume, and restart with clipping and a warmup.

**Wrong answers, and why they fail**

- "Add an epsilon to the loss and restart." An epsilon fixes a log of zero at step one; a late explosion comes from the update size, and the run will die again.
- "Halve the learning rate and hope." Halving is a guess; the lesson's move is a 10 times reduction, together with clipping and a check of the schedule position.
- "NaN means the data has a bad row." A bad row shows in the first epoch, not after hours of clean training; replay the failing batch on the checkpoint before you blame it.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Choose a peak learning rate and a schedule in a few hours

*Level 4 (staff) · design · about 15 minutes*

You inherit a model with no known good learning rate and a compute budget of a few hours. Design the procedure that picks the peak learning rate and the schedule for the run, and say what you log to defend the choice.

:::answer Show the answer
:::say Short answer
Run a learning rate range test first: train for about a hundred steps while the rate grows exponentially from 1e-7 toward 10 and record the loss at each rate. Take the rate where the loss falls fastest and set the peak about 10 times lower. Then run a linear warmup over 1 to 5 percent of the steps into a cosine decay with a floor near a tenth of the peak, or the 1cycle policy when the budget is short and the total step count is fixed. Log the range test curve, the schedule curve and the gradient norm beside the learning rate at every step.
:::

**Full answer**

**Step one: measure, do not guess**

The debugging lesson's range test: save the weights, start at 1e-7, multiply the rate by a constant factor each step so it reaches about 10 after a hundred steps, record the loss, and stop when the loss turns NaN or exceeds ten times the best value seen. Restore the weights. The loss is flat at the low end, falls fastest around some rate, reaches its minimum, and diverges. The suggested peak is about 10 times below the steepest fall, which in the lesson's example puts the best rate near 1e-3 when the steepest point sits near 1e-2. The lesson's second rule covers the case where the curve is unclear: try three rates 10 times apart, such as 1e-2, 1e-3 and 1e-4, and read the loss after a few epochs.

**Step two: pick the shape from the budget**

| Situation | Schedule | Why |
|---|---|---|
| Total steps unknown | constant, with manual drops | nothing else can be computed |
| Hours, step count fixed | 1cycle | fastest convergence for a fixed budget |
| Moderate budget | cosine, floor at a tenth of the peak | safe default with no extra knobs |
| Days or weeks | warmup plus cosine | the default for large transformer runs |

For a few hours with a known step count the schedules lesson points at 1cycle, which ramps from the peak over 25 up to the peak over the first half and down to the peak over 10000 in the second half. For anything longer, warmup plus cosine with a warmup of 1 to 5 percent. With an adaptive optimizer the warmup is not optional: its moment estimates are poor for the first steps.

**Step three: sanity check the peak**

The schedules lesson's sensitivity run trains a few epochs at a constant rate and labels each run diverged, barely moved, learning or converged. Run it at the chosen peak and at the rates one step above and below. The peak should land in learning or converged, and the rate above it should show the first signs of trouble.

**What to log**

- The range test curve, loss against rate on a log axis, with the chosen peak marked.
- The schedule rendered over the step axis, saved in the run directory so a reviewer can read it without running anything.
- Per step: step, learning rate, gradient L2 norm and loss, in that order. The capstone lesson's rule is that a healthy warmup shows the norm rising with the rate and settling after the peak, and that a peak set too high shows a norm that stays high.
- The four schedule numbers in a versioned config, with the warmup as a fraction of the total so the choice survives a longer run.

**Defaults for when there is no time**

The optimizers lesson's fallback: AdamW at 3e-4 with weight decay 0.01 for an unknown model, 2e-5 for fine-tuning a pretrained one. Treat these as the starting point of the range test, not as its result.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why set the peak below the steepest point rather than at it? Expected: the steepest point is close to where the loss starts to diverge, and a long run needs a margin; one order of magnitude lower keeps it.
- **Level 4:** When do you choose 1cycle over warmup plus cosine? Expected: a short, fixed budget where the total step count is known; it converges faster for a fixed compute and needs the step count in advance.
- **Level 4:** The peak is right and the loss still oscillates near the end. What do you adjust? Expected: the decay, not the peak; a schedule that ends too high leaves steps too large for the final minimum, so lower the floor or lengthen the decay.
- **Level 4:** How does the model's size change the plan? Expected: sweep the peak on a smaller version first as a prior, then confirm with the range test on the full model, because the optimum shifts with size.

**Wrong answers, and why they fail**

- "Use 3e-4 for Adam, it always works." It is the lesson's starting default when nothing is known, not a result; the range test takes minutes and replaces a guess with a measurement.
- "Pick the rate with the lowest loss in the range test." The lowest point sits next to divergence; the lesson picks about 10 times lower than the steepest fall.
- "A constant rate is fine if it is the right one." The right rate changes during training; a constant that fits the start is too large at the end, and the lesson keeps constant rates for small models and debugging.

:::

## Warmup plus cosine schedule with pinned boundaries

*Level 4 (staff) · take-home · about 25 minutes*

Take-home. Implement a learning rate schedule as one function of the step: a linear ramp from zero to a peak, a cosine decay from the peak to a floor, and a fixed floor after the last step. Deliver tests that pin the value at every boundary, prove the curve has no jumps, and show that a resumed run lands on the right value. Describe your design and your tests.

:::answer Show the answer
:::say Short answer
Write one function with three branches: up to the warmup step, the peak times the step over the warmup length; between the warmup step and the total, the floor plus half the gap times one plus the cosine of pi times the progress since warmup ended; past the total, the floor. Test the fixed points: zero at step zero, the peak at the end of warmup from both branches, the floor at the last step and the floor one step later. Add a continuity test that bounds each one step change, and a resume test that computes the schedule from a saved global step.
:::

**Full answer**

**The function**

```text
if warmup_steps > 0 and step <= warmup_steps:
    lr = lr_max * step / warmup_steps
elif step <= total_steps:
    progress = (step - warmup_steps) / (total_steps - warmup_steps)
    lr = lr_min + 0.5 * (lr_max - lr_min) * (1 + cos(pi * progress))
else:
    lr = lr_min
```

The cosine evaluates to 1 at the end of warmup, which gives the peak and matches the ramp's endpoint, and to -1 at the total, which gives the floor. The capstone lesson makes the point that this continuity is the reason to write one function over the step rather than three pieces glued together: a glued schedule loses a boundary the first time the peak or a step count changes. Two guards: the ramp branch runs only when the warmup is above zero, so a warmup of zero steps starts at the peak and decays at once, with no division by zero. The constructor rejects a warmup that is not less than the total, as the lesson's code does with an error, because the rate would hold the peak at the last step and drop to the floor one step later.

**Why the floor is pinned, not an error**

A trainer that overshoots the configured total keeps a usable rate and logs a warning. Extending a run means changing the total in the config, not editing the loop. The floor is non-zero on purpose: the lesson keeps it near 10 percent of the peak so the optimizer keeps learning in the long tail, and warns that a floor of zero looks good on a plot and leaves the model under-trained.

**The tests**

1. **Fixed points.** With a non-zero warmup, lr(0) is 0, lr(warmup) equals the peak from the ramp branch and from the cosine branch, lr(total) equals the floor, lr(total + 1) equals the floor.
2. **Continuity.** For every step from 0 to total, the change between consecutive steps is at most the larger of the warmup slope, peak over warmup steps, and the steepest cosine slope, pi times the gap over twice the decay length. The lesson's exercise notes that a short cosine segment can be steeper than the ramp, so the ramp slope alone is not a safe bound.
3. **Resume.** Save a checkpoint with a global step, reload, and assert that the next value equals lr(global step + 1). The schedule reads a monotonic global step from the checkpoint, not an epoch counter or a loop variable, because sharded datasets and restarted loaders break the epoch to step mapping.
4. **Shape.** Render the schedule to a text plot and a CSV, with one row per step, and check the plot into the run directory so a reviewer can see the curve without running anything.

**Production notes from the lesson**

The schedule's four numbers live in a versioned config, not in code. The warmup is a fraction of the total, around 1 to 3 percent, so the shape survives a longer run. The log row is step, learning rate, gradient L2 norm and loss, in that order, so dashboards can read it.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why implement the three regions in one function? Expected: so the ramp endpoint and the cosine start share one formula for the peak, and a change to the peak or the step counts cannot open a gap at a boundary.
- **Level 4:** What is the right bound for the continuity test? Expected: the larger of the ramp slope, peak over warmup steps, and the steepest cosine slope, pi times the gap over twice the decay length; a short cosine segment can be steeper than the ramp.
- **Level 4:** Why pin at the floor after the last step instead of raising? Expected: a trainer that overshoots keeps a usable rate and logs a warning; extending training means changing the total in the config, not the loop.
- **Level 4:** What makes a resumed run land on the right value? Expected: the schedule reads a monotonic global step saved in the checkpoint, not an epoch counter or a local loop variable.

**Wrong answers, and why they fail**

- "Set the floor to zero so the schedule finishes cleanly." The lesson keeps a non-zero floor near 10 percent of the peak so the optimizer keeps learning in the tail; a zero floor looks clean and leaves the model under-trained.
- "Test a few steps in the middle, the boundaries follow from the formula." An off by one at a boundary is the bug the lesson warns about; it shows up hours into a run as a rate that is 1 percent off at the moment it matters.
- "Compute the rate from the epoch and the batch index." Sharded datasets and restarted loaders break that mapping; the global step is the durable axis.

:::
