---
track: aibank
title: "AI interview bank: Math and classical ML (part 2 of 2)"
short: Math and classical ML 2
sub: 10 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Why plain gradient descent zigzags and momentum does not

*Level 2 (working) · concept · about 8 minutes*

You minimize the Rosenbrock function from the point (-1, 1). Plain gradient descent creeps along the curved valley and needs thousands of steps. The same run with momentum arrives much sooner. Explain what the valley does to plain descent and what momentum changes.

:::answer Show the answer
:::say Short answer
In a narrow valley the gradient points across the valley, not along it, so each plain step jumps from one wall to the other and makes little progress toward the minimum. Momentum keeps a velocity that sums past gradients. The across components flip sign and cancel, the along component keeps its sign and builds up, so the path is smooth and fast.
:::

**Full answer**

**The function**

The function is (1 - x)^2 + 100 (y - x^2)^2. Its minimum is at (1, 1), at the bottom of a curved valley. The factor 100 makes the valley walls steep and the floor almost flat, so the gradient is large across the valley and small along it.

**Plain descent**

The update is w = w - lr times gradient. The step size is set by the learning rate alone. A learning rate large enough to move along the floor overshoots across the walls, and a learning rate small enough to stay inside the walls crawls along the floor. The lesson runs this with a learning rate of 0.0005 for 5000 steps and still sees slow progress.

**Momentum**

```text
v = beta * v + gradient
w = w - lr * v
```

The velocity is an exponential sum of past gradients. Components that flip sign at each step cancel inside the sum. Components with a stable sign add up and the ball rolls faster along the floor. The lesson uses beta equal to 0.9, which keeps about the last ten gradients in play. A larger beta gives more smoothing and a slower response when the valley turns.

**Where this leads**

Adam goes one step further and also divides each weight's step by the running size of its gradients, so each weight gets its own step size. On the Rosenbrock run in the lesson, Adam with a learning rate of 0.01 converges fastest, momentum follows a smoother path, and plain descent trails.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does beta control? Expected: how much of the past velocity survives each step; 0.9 keeps roughly the last ten gradients.
- **Level 3:** Momentum overshoots the minimum and comes back. Why? Expected: the velocity carries the point past the bottom when the gradient has already changed sign; a smaller beta or a decaying learning rate damps it.
- **Level 3:** How does this zigzag show up in a real training run? Expected: the loss drops fast and then plateaus while the weights oscillate; a smaller learning rate or momentum smooths it.
- **Level 4:** Why does Adam help on the same valley beyond what momentum does? Expected: it scales each weight's step by the inverse of its running gradient size, so the steep direction takes small steps and the flat direction takes large ones.

**Wrong answers, and why they fail**

- "Raise the learning rate until plain descent moves faster." A larger step jumps further across the valley and diverges before it speeds up the along direction.
- "Momentum is a bigger learning rate." The velocity grows only where gradients keep their sign and cancels where they flip, which a scalar learning rate cannot do.
- "The valley is a local minimum, so the optimizer is stuck." The gradient is not zero on the valley floor. The point moves at every step, slowly.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## A forest that ranks a user id as its top feature

*Level 3 (senior) · debug · about 12 minutes*

A random forest's feature importance puts a user id column near the top of the list. The column is an integer with a different value in almost every row. The team wants to build a product rule around it. What do you tell them, and how do you check?

:::answer Show the answer
:::say Short answer
The default importance is the mean decrease in impurity, summed over every split that used the feature. A column that is distinct on nearly every row offers a huge number of candidate thresholds, so trees split on it to carve out small pure groups by chance, and those impurity drops add up on the training data. Run a permutation importance check instead: shuffle the column on held-out data, measure the drop in accuracy, and expect close to zero for an id.
:::

**Full answer**

**What the default number measures**

```text
importance(feature) = sum over nodes that split on it of
                      (samples at node / total samples) * impurity decrease
```

The number is a by-product of training, so it costs nothing, and it is biased in two ways the lesson names: toward features with many distinct values, and toward features with many possible split points. An id column is the extreme case of both. Each tree can find a threshold that isolates a handful of rows with the same label, the gain looks real on the bootstrap sample, and nothing in the formula asks whether it transfers.

**The check that does ask**

The permutation method shuffles one feature's values on data the model did not train on and measures how much the score drops. A feature the model needs produces a large drop. A feature that only absorbed training noise produces none. It costs one evaluation per feature per repeat, which is slower than the default, but it answers the question the team is asking. The lesson sets this exact case as an exercise: a high cardinality noise feature that the impurity method ranks high and the permutation method does not.

**What to tell the team**

1. The ranking they saw does not mean the id predicts anything.
2. Run the permutation check on a validation set with several shuffles and average.
3. Retrain without the id and compare validation scores. If the score holds, the id carried nothing.
4. If the permutation check also scores the id high, treat it as leakage: ids that correlate with the target through time or data source will not hold in production, and no product rule should rest on them.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why do many distinct values make it easy for a tree to find a good-looking split? Expected: more thresholds mean more chances that one of them separates a few rows by luck; the gain is real on the training sample and absent on new data.
- **Level 3:** Permutation importance for the id is near zero and the validation score is fine. What does that say? Expected: the id carried no signal the model depends on; it absorbed training noise, and the other features do the work.
- **Level 4:** The permutation importance of the id is large as well. What now? Expected: suspect leakage; the id tracks the target through time or source, and that link breaks in production.
- **Level 4:** How do you compute permutation importance so it is not optimistic? Expected: on held-out data, shuffle only the one column, repeat several times and average, and keep every other column fixed.

**Wrong answers, and why they fail**

- "The forest found the id useful, so it is useful." The impurity sum counts splits that fit training noise; a column with many distinct values collects them.
- "Drop every integer column to be safe." Integers such as counts carry real signal. Test the one column with a permutation.
- "The two importance methods always agree." The lesson's exercise builds a case where the impurity method ranks a noise feature highly and the permutation method does not.

:::

## A gradient check that fails for the wrong reason

*Level 3 (senior) · debug · about 12 minutes*

You add a new layer to a from-scratch network and run a gradient check. The relative error between the analytical and the numerical gradient is about 1e-3 for one weight. A teammate says the backward pass has a bug. Before you agree, how do you decide whether the fault is in the backward pass or in the check itself?

:::answer Show the answer
:::say Short answer
A relative error near 1e-3 is in the warning band, so first make the check trustworthy. Use the two-sided difference, set the step to the range from 1e-5 to 1e-7, run the check in float64, and compute the relative error with the max of both magnitudes in the denominator. If the error stays near 1e-3 or grows under those conditions, the backward pass is wrong; if it drops below 1e-5, the check was at fault.
:::

**Full answer**

**What the check computes**

The numerical gradient for one weight is the centered difference: the loss at the weight plus h, minus the loss at the weight minus h, divided by 2h. Its truncation error shrinks with h squared, while the one-sided difference only shrinks with h. The relative error compares it with the analytical value:

```text
rel_error = |analytical - numerical| / max(|analytical|, |numerical|, 1e-8)
```

The lesson's thresholds: below 1e-7 is a clean match, below 1e-5 is acceptable, above 1e-3 points at a bug, and above 1 means the gradient is wrong.

**Ways the check lies**

1. **Step too large.** The difference measures the slope of a chord, not the tangent. Shrink h.
2. **Step too small.** The two losses are nearly equal, and their subtraction suffers catastrophic cancellation: the true difference is below the rounding noise, and the noise becomes the leading digits. In float32 this happens early, so run the check in float64 and keep h between 1e-5 and 1e-7.
3. **A kink at the test point.** A ReLU or a max has no derivative at zero, and a step that crosses the kink measures two different slopes. Check at points away from the kink, or on inputs where the active side is known.
4. **Stochastic parts.** Dropout or a random data order between the two loss evaluations changes the loss for a reason other than h. Fix the seed and run in evaluation mode.
5. **A wrong denominator.** Dividing by the analytical value alone blows up when it is near zero. Use the max of both magnitudes with a floor.

**Then look at the backward pass**

With a trustworthy check, a stable 1e-3 is a bug. Check one parameter group at a time to find the layer, and compare the local derivative of each operation with its formula. The autodiff lesson's engine compares each new operation against a finite difference as part of adding it, which is the habit that prevents this situation.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why prefer the two-sided formula over the one-sided one? Expected: its error falls with h squared instead of h, so a moderate h gives a close estimate without cancellation.
- **Level 3:** Why not run the check on every step of production training? Expected: it needs two forward passes for each parameter, so it is far too slow; it belongs in unit tests and in debugging.
- **Level 4:** The error is tiny for most weights and large for a few in one layer. What does that pattern say? Expected: the layer's backward pass is right in general and wrong on one path, such as a shared input whose contributions were overwritten rather than added, or a kink at those weights.
- **Level 4:** How do you check a layer that contains a random mask? Expected: fix the seed so both loss evaluations use the same mask, or run the check in evaluation mode where the mask is off.

**Wrong answers, and why they fail**

- "Make h as small as possible for the most accurate derivative." Below the rounding scale the subtraction cancels and the result is noise. There is a floor on h, around 1e-7 in float64.
- "A relative error of 1e-3 is close enough, ship it." The lesson puts 1e-3 at the bug boundary. A stable error there means a wrong gradient that will slow or break training.
- "Use the absolute difference instead of a relative one." A large gradient and a tiny one need different tolerances. The relative error with a floored denominator handles both.

:::

## A logistic regression whose weights never stop growing

*Level 3 (senior) · concept · about 12 minutes*

You fit a logistic regression with gradient descent on a small dataset where one line separates the two classes with no errors. The loss falls at every epoch, the weights grow at every epoch, and the run never settles. A colleague proposes a squared error loss instead, because it has a clear bottom. What is happening, and what do you do?

:::answer Show the answer
:::say Short answer
On separable data the log loss has no finite minimum: scaling the weights up pushes every probability closer to its label and the loss closer to zero, so descent walks forever. Squared error through a sigmoid is a worse trade, because that cost surface is not convex and has flat regions where the gradient dies. Keep the log loss and add an L2 penalty, which gives one finite, unique minimum.
:::

**Full answer**

**Why the log loss is the right loss**

The model is a linear score z = w x + b passed through a sigmoid, and the binary cross-entropy is minus the mean of y log p plus (1 - y) log (1 - p). For this model the loss is convex, so every local minimum is the global one and gradient descent cannot stop in a bad valley. The gradient has the same clean form as in linear regression, the mean of (p - y) times x, with p the sigmoid output instead of the raw score.

**What separable data does to it**

When a line classifies every point correctly, multiplying w and b by a constant above 1 leaves the line in place and moves every probability toward 0 or 1. Each such step lowers the loss, so no finite w is the minimizer. In the run you see the loss fall, the weights grow, the probabilities saturate, and the sigmoid clamp in the code start to matter. The decision boundary itself has stopped changing.

**Why squared error does not help**

Squared error on a sigmoid output is not convex. It has local minima, and where the sigmoid saturates its gradient is near zero, so a confident wrong prediction gets almost no correction. The lesson's reason to avoid it for classification is exactly this shape.

**The fix**

Add an L2 penalty, lambda times the sum of squared weights, to the loss. Its gradient, two lambda times w, pulls every weight back toward zero at each step. The pull grows with the weights and the pull of the data loss shrinks as the probabilities saturate, so they balance at a finite point, and the minimum is unique. The library implementation in the lesson applies regularization by default for this reason.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the cross-entropy convex for this model while squared error is not? Expected: the log of the sigmoid combines with the linear score into a convex function; squaring the gap between a sigmoid and a label creates flat regions and several local minima.
- **Level 3:** What does the decision boundary do while the weights grow? Expected: the line w x + b = 0 barely moves; only the steepness of the sigmoid across it grows, so predictions become overconfident.
- **Level 4:** How does the L2 penalty change each gradient step? Expected: it adds a term proportional to w to the gradient, so each step also shrinks the weights, and the shrinking balances the pull toward larger weights at a finite point.
- **Level 4:** The data is nearly separable instead. Does the problem go away? Expected: a finite minimum exists, but the weights are large and the probabilities overconfident; the penalty still helps calibration, and a validation loss shows it.

**Wrong answers, and why they fail**

- "The falling loss means the model is still improving, let it run." The boundary stopped improving; only the confidence grows, until the weights overflow or every probability saturates.
- "Switch to squared error for a well-defined minimum." That surface is not convex with a sigmoid output, so descent can stop in a poor local minimum, and the gradient vanishes where the sigmoid saturates.
- "Add early stopping and call it solved." Stopping fixes the run time but leaves the weights wherever the clock ran out; a penalty gives a defined answer that does not depend on the epoch count.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## A variance that comes out wrong on large values

*Level 3 (senior) · debug · about 10 minutes*

A feature pipeline computes the variance of a column with the formula mean of x squared minus the square of the mean, in float32. On a column with values near one million the result is far from the true value and sometimes negative. Explain the cause and propose a formula that holds.

:::answer Show the answer
:::say Short answer
The two terms are each about 10 to the 12 and almost equal, and their difference is the small true variance. In float32 the spacing between neighboring numbers at that size is far larger than the variance, so the subtraction returns rounding noise, which can be negative. Compute the variance from centered values instead: subtract the mean first, or use the running update that the lesson calls the Welford algorithm.
:::

**Full answer**

**Catastrophic cancellation**

When two nearly equal floating point numbers are subtracted, their leading digits cancel and the rounding error of each operand becomes the leading digits of the result. The lesson's small example subtracts 1.0000001 and 1.0 in float32 and gets a relative error of 19.2 percent from a single operation. The variance formula does this at a much larger scale.

**The numbers in the question**

float32 keeps about 7 decimal digits. For values near one million, x squared is near 10 to the 12, and the gap between representable numbers there is far above 1. The true variance of the lesson's exercise values, 1000000.0, 1000001.0 and 1000002.0, is 0.6667. Both terms of the formula round to the nearest representable value, and the difference carries the rounding, not the variance. A negative result is possible because nothing in the formula stops the rounding from flipping the sign.

**A formula that holds**

Center first, then square:

```text
mean = sum(x) / n
variance = sum((x - mean)^2) / n
```

The deviations are small numbers, their squares are small, and no large nearly equal terms are subtracted. For a stream of values where two passes over the data cost too much, the Welford update keeps a running mean and a running sum of squared deviations, and updates both with each new value. Both approaches give a result close to 0.6667 for the exercise values where the naive formula fails.

**The same shape elsewhere**

The lesson lists the other places this pattern appears: subtracting nearly equal log probabilities, and a finite difference with a step that is too small. The cure is the same each time: rearrange the arithmetic so that the large nearly equal terms are never subtracted.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why can the naive result be negative when a variance cannot? Expected: the result is rounding noise, and nothing in the formula bounds the sign of noise.
- **Level 3:** Would float64 fix the pipeline? Expected: it moves the problem to larger values, around 10 to the 15 digits of precision, but the same inputs scaled up break it again; the centered formula fixes it at any scale.
- **Level 4:** The column arrives as a stream and you cannot hold it in memory for two passes. What do you do? Expected: use the Welford update, which keeps a running mean and a running sum of squared deviations in one pass.
- **Level 4:** Where does this same cancellation hide inside a normalization layer? Expected: a layer norm or batch norm that computes variance as mean of squares minus squared mean on activations with a large mean; implementations center first for this reason.

**Wrong answers, and why they fail**

- "The formula is correct algebra, so the code must have a typo." The algebra is exact and the arithmetic is not. The two terms are correct to about 7 digits each, and the variance lives below that.
- "Clamp the result at zero." That hides the sign and keeps the wrong magnitude.
- "Divide the column by one million first and multiply the variance back." Scaling helps here, but it moves the mean, not the problem; a column with a large mean and a tiny spread still cancels. Center first.

:::

## Bag the deep trees or boost the stumps

*Level 3 (senior) · tradeoff · about 12 minutes*

You have a tabular dataset and two candidate base learners: deep decision trees that fit the training rows almost perfectly, and decision stumps that barely beat a constant. You can afford one ensemble method for each. Which one gets bagging and which one gets boosting, and why?

:::answer Show the answer
:::say Short answer
Bag the deep trees and boost the stumps. Deep trees have low bias and high variance, and averaging many of them trained on bootstrap samples cancels the variance without adding bias. Stumps have high bias and low variance, and boosting builds them in sequence so each new one corrects the errors of the ensemble so far, which drives the bias down.
:::

**Full answer**

**Match the method to the error term**

Expected error splits into squared bias, variance and irreducible noise. The two methods attack different terms.

| Method | Reduces | Bias | Variance | Watch out for |
|---|---|---|---|---|
| Bagging, random forest | variance | no change | decreases | does nothing for bias |
| Boosting | bias | decreases | can increase | overfits with too many rounds |

**Why bagging fits the deep trees**

Each tree is trained on a bootstrap sample, a draw with replacement of the same size as the data, which holds about 63.2 percent of the unique rows. The rest, about 36.8 percent, are out-of-bag and give a free validation set. The average of N independent predictions with variance sigma squared has variance sigma squared over N. The trees are not independent, because they see similar data, so the gain is smaller than that, and a random forest adds a random feature subset at each split, square root of the feature count for classification, to make the trees disagree more. Adding trees lowers variance and never adds bias, so test accuracy plateaus and does not fall.

**Why boosting fits the stumps**

Boosting trains learners in sequence. AdaBoost raises the weight of rows the ensemble gets wrong, so the next stump works on them. Gradient boosting fits each new tree to the negative gradient of the loss, which for squared error is the residual. Each round removes some of the systematic error, which is the bias. The learning rate scales each tree's contribution; the lesson gives 0.01 to 0.3, and a smaller value needs more trees and generalizes better. Because later rounds chase the hardest rows, boosting can fit noise, so it needs early stopping on a validation loss.

**Why not the other way round**

Boosting the deep trees has little bias left to remove and stacks high variance learners, so it overfits fast. Bagging the stumps averages many models that all miss the same pattern, so the average misses it too. Diversity is the requirement in both cases: the lesson's majority vote of 21 independent classifiers at 60 percent accuracy reaches about 74 percent, and 101 of them reach about 84 percent, only because their errors differ.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does bagging the deep trees not fix bias? Expected: the average of many models that miss the same pattern misses it too; averaging only removes their disagreement.
- **Level 3:** What does the learning rate do in gradient boosting? Expected: it scales each tree's contribution; a smaller rate needs more trees and generalizes better.
- **Level 4:** Boosting's training error keeps falling while validation error rises. What happened and what do you do? Expected: later rounds fit noisy or mislabeled rows; stop early on the validation loss, or lower the learning rate and the tree depth.
- **Level 4:** Why does a forest's test accuracy plateau but not fall as trees are added? Expected: each tree lowers variance and none adds bias, so more trees cannot overfit the way more boosting rounds can.

**Wrong answers, and why they fail**

- "Boost the deep trees, since boosting is the stronger method." A low bias, high variance learner has little bias to remove, and boosting amplifies its variance.
- "Bag the stumps to make them strong." Averaging stumps that all underfit still underfits; bagging leaves bias where it is.
- "Any ensemble of enough models beats a single one." Gains need diverse errors; models that make the same mistakes do not cancel them.

:::

## Pick a 16-bit format for training and one for inference

*Level 3 (senior) · tradeoff · about 12 minutes*

Your training stack can run in float16 or in bfloat16. A teammate picks float16 because it keeps more digits. Which format do you pick for training, which for inference, and what extra mechanism does one of them need?

:::answer Show the answer
:::say Short answer
Pick bfloat16 for training. It has the same 8-bit exponent as float32, so it covers the same range up to about 3.4e38, and activations, logits and gradients that spike past 65,504 do not overflow. float16 has 10 mantissa bits and more precision, but its 5-bit exponent caps at 65,504 and underflows gradients below about 6e-8, so it needs loss scaling to train. For inference, where values are bounded and precision matters more, float16 is the usual choice.
:::

**Full answer**

**The two layouts**

```text
float16:   [1 sign] [5 exponent]  [10 mantissa]   max about 65,504
bfloat16:  [1 sign] [8 exponent]  [7 mantissa]    max about 3.4e38
```

The mantissa sets precision, the exponent sets range. Training needs range: a loss spike, a large logit or a tiny gradient all live far from 1. Inference values are bounded by the trained weights, so the extra three mantissa bits of float16 are worth more there.

**What goes wrong in float16**

- Overflow: an activation above 65,504 becomes inf, and inf poisons every value downstream.
- Underflow: gradients are often around 1e-8 or smaller, and float16 rounds anything below about 6e-8 to zero. The weights stop moving, with no error.

**Loss scaling**

Mixed precision keeps a float32 master copy of the weights, runs the forward and backward passes in the 16-bit format, and computes the loss in float32. To keep float16 gradients above the underflow floor, multiply the loss by a large constant such as 1024 before backward, so every gradient is 1024 times larger, then divide the gradients by the same constant before the update. The update is unchanged. Dynamic loss scaling starts high, at 65536 in the lesson, halves the scale on the first inf gradient, and doubles it again after a run of clean steps.

**Why bfloat16 skips most of this**

bfloat16 is the top 16 bits of a float32: drop the low mantissa bits and the exponent is unchanged. Its range covers the gradient spectrum, so loss scaling is usually unnecessary, and conversion is a truncation. The cost is precision: about 2 to 3 decimal digits, against 3 to 4 for float16.

**Symptoms that point here**

The lesson's bug list has three entries with this cause: validation accuracy 1 to 3 percent below the paper after a switch to float16, gradient norms of 0.0 in some layers, and a run that diverges after moving from float32 to float16. The fixes are loss scaling or bfloat16.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why do small gradients vanish in float16 and not in bfloat16? Expected: float16's smallest normal values sit near 6e-8 and smaller gradients round to 0; bfloat16's exponent reaches float32's range.
- **Level 3:** What does dynamic loss scaling do when a gradient turns inf? Expected: skip the step, halve the scale, and double it again after a run of clean steps.
- **Level 4:** You moved from float32 to float16 and validation accuracy fell by a few percent with no error. What happened? Expected: gradient underflow zeroed small updates; enable loss scaling or move to bfloat16.
- **Level 4:** Why is bfloat16 cheap to convert from float32? Expected: it is the top 16 bits of a float32, so conversion drops the low mantissa bits and the exponent is unchanged.

**Wrong answers, and why they fail**

- "More mantissa bits means better training, so float16 wins." Training is limited by range; a logit spike past 65,504 becomes inf in float16 and is fine in bfloat16.
- "Loss scaling changes the training result." Dividing the gradients by the same factor before the update gives the same update; the scale only lifts small values above the underflow floor.
- "Use bfloat16 everywhere, inference included." Inference values are bounded and the extra float16 precision helps there; the lesson makes float16 the inference default.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## Build a stacking ensemble whose meta-learner never cheats

*Level 4 (staff) · take-home · about 25 minutes*

Take-home. Build a stacking ensemble on a tabular classification dataset with three base models from different families and a logistic regression meta-learner. Deliver the training code, a comparison with each base model alone, and a written argument that the meta-learner was never trained on a prediction made for a row the base model had already seen. Describe how you structure the work and what you check before you submit.

:::answer Show the answer
:::say Short answer
Generate the meta-features with k-fold cross-validation: for each fold, fit the base models on the other folds and predict the held-out fold, so every training row gets base predictions from models that did not train on it. Fit the meta-learner on those out-of-fold predictions, then refit the base models on all training rows for test time. Compare on a test set that neither level touched, and report the base models and the stack side by side with fold spreads.
:::

**Full answer**

**Structure**

1. **Split first.** Hold out a test set before anything else. Do all preprocessing inside the folds, fit on the training part of each fold only.
2. **Out-of-fold predictions.** With K folds, train each base model K times. Each row in the training set receives a prediction from the one run that did not see it. Store the predicted probabilities, not hard labels, because soft outputs carry confidence and the lesson's soft voting beats hard voting for the same reason.
3. **Meta-learner.** Fit the logistic regression on the out-of-fold probabilities, three columns per class, with the true labels as targets. It learns which base model to trust and where.
4. **Refit for test time.** Fit each base model on all training rows, predict the test set, and pass those predictions through the meta-learner.
5. **Compare.** Score every base model on its own, a plain average of the three, and the stack. Report cross-validated means and spreads on the training folds, and one test number for each at the end.

**The leakage argument**

Write it as a table: for each training row, which fold it belonged to, and which base model run produced its meta-feature. Every meta-feature must come from a run whose training folds exclude that row. If any base model is fit on all training rows and then predicts those rows, the predictions are in-sample and too good, and the meta-learner learns to trust the base model that overfits most. The lesson states the rule in one line: never train base models and generate meta-features on the same data.

**Checks before you submit**

- Diversity: compare the base models' errors on the validation folds. Three variants of one family fail on the same rows and give the stack nothing. The lesson's example uses a forest, a support vector machine and a linear classifier.
- Honest gain: the stack must beat the best base model by more than the fold spread. The lesson places stacking in the last 1 to 2 percent of accuracy, so a small or noisy gain is the expected outcome, and the write-up should say whether the extra models are worth it.
- Preprocessing inside the folds, no transform fit on the full table.
- The test set appears once, in the final table.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why soft predictions rather than hard labels as meta-features? Expected: probabilities carry confidence, so the meta-learner can weight a sure base model above an unsure one.
- **Level 4:** The stack beats every base model on the training folds but not on the test set. What is the first check? Expected: whether any meta-feature came from a base model that had seen that row; an in-sample prediction teaches the meta-learner to trust an overfit model.
- **Level 4:** How do you show the base models are diverse enough to help? Expected: compare their errors on the validation folds; models that fail on the same rows add nothing.
- **Level 4:** When would you not ship the stack? Expected: when the gain over the best base model is inside the fold spread, or below the cost of running three models.

**Wrong answers, and why they fail**

- "Fit the base models on all training rows, predict those rows, and train the meta-learner on that." Those predictions are in-sample and too good; the meta-learner learns to trust the base model that overfits most.
- "Use three random forests with different seeds." Same family, similar errors; the stack needs models that fail on different rows.
- "Set the meta-learner's weights by hand." The point of stacking is to learn which base model to trust where; fixed weights are a voting ensemble.

:::

## Decide whether a small win on one split is real

*Level 4 (staff) · design · about 15 minutes*

Two variants of a classifier differ by one hyperparameter. On one held-out split, variant B beats variant A by a small margin, and the team wants to ship B. Design the evaluation that decides whether B is better, and say what you would report.

:::answer Show the answer
:::say Short answer
One split gives one noisy number, so the gap could be chance. Run k-fold cross-validation with the same folds for both variants, keep the per-fold differences, and test whether their mean is far from zero with a paired t-statistic. Report the mean and spread of each variant's fold scores, the mean difference and the statistic, and keep the test set out of the comparison.
:::

**Full answer**

**Why one split is not enough**

A single split depends on which rows landed in each part. A different seed gives a different gap, and nothing in one number says how large that swing is. Folds show the spread.

**The design**

1. Hold the test set out before anything else. It is for the final report, once.
2. Build K folds on the training data. The lesson uses K equal to 5 and names 5 or 10 as the standard choices. Stratify when the classes are imbalanced, so every fold keeps the class ratio.
3. Train and score both variants on the same folds, so the two scores in each fold are a pair. Pairing removes the fold-to-fold variation from the difference.
4. Compute the per-fold differences, their mean and their standard deviation, and the paired t-statistic: mean difference divided by the standard deviation over the square root of K. The lesson's threshold for 5 folds is a t-statistic whose magnitude exceeds 2.78, for significance at p below 0.05 with 4 degrees of freedom.
5. If the hyperparameter was chosen on these folds, wrap the whole thing in nested cross-validation: an inner loop picks the value, an outer loop measures it.
6. Repeat with a few fold seeds and check the conclusion holds.

**What to report**

- Each variant's mean fold score with its spread.
- The mean difference, the statistic and the fold count.
- The effect size in product terms, so the team can weigh it against the cost of the change.
- One test set number for the variant you ship, measured once at the end.

**Caveats to say out loud**

The folds share training rows, so the t-test is an approximation, not a clean independent sample. A significant difference can still be too small to matter. And a comparison made on the test set turns it into a validation set, which is the mistake the design is built to prevent.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why must both variants use the same folds? Expected: pairing removes the fold-to-fold variation from the difference, so the test asks only about the variants.
- **Level 4:** What does an absolute t above 2.78 mean with five folds? Expected: with 4 degrees of freedom the mean difference is unlikely to be zero at the 5 percent level, so the gap is probably real.
- **Level 4:** How do you avoid tuning on the folds you report? Expected: nested cross-validation; the inner loop picks the hyperparameter and the outer loop measures it, so the reported folds never saw the choice.
- **Level 4:** The difference is significant and tiny. Do you ship B? Expected: weigh the effect size against the cost of the change; significance says the sign is reliable, not that it matters.

**Wrong answers, and why they fail**

- "One held-out split is enough if it is large." A single split still depends on which rows landed where; folds show the spread.
- "Compare the two mean scores and pick the higher one." Without the per-fold pairing and the spread, a gap smaller than the fold noise looks like a win.
- "Use the test set to break the tie." The test set is single use; a choice made on it turns it into a validation set.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Test error that falls, spikes and falls again

*Level 4 (staff) · concept · about 15 minutes*

A team keeps growing a model. Test error falls, then spikes as the parameter count approaches the number of training rows, then falls again as they keep going. The classical U-shaped curve predicts the spike but not the second fall. Explain what the curve shows, and give the team a rule about model size.

:::answer Show the answer
:::say Short answer
The spike sits at the interpolation threshold, where the model has just enough capacity to fit every training row and is forced into one specific, noise-sensitive solution, so variance peaks. Past it, many solutions fit the training data and gradient descent's implicit regularization picks a simple one, so error falls again. That is double descent. The rule: stay well below the threshold with explicit regularization, or go well past it; the worst place to sit is on it.
:::

**Full answer**

**The classical picture**

Expected error is squared bias plus variance plus irreducible noise. As capacity grows, bias falls and variance rises, and the sum has one minimum. The classical rule was that more capacity past that point always hurts.

**The three regimes**

| Regime | Parameters against rows | Behavior |
|---|---|---|
| Underparameterized | far fewer | the classical trade-off applies |
| Interpolation threshold | about equal | variance peaks, test error spikes |
| Overparameterized | far more | implicit regularization, test error falls |

At the threshold the model can just barely thread every training point, and a small change in the data moves the fit a lot. Past it, the training data no longer pins down one solution, and the learning algorithm chooses among the many that fit. Gradient descent tends to pick a simple one, and that bias toward simplicity is why heavily overparameterized networks generalize.

**What the lesson adds**

- The pattern appears in linear models, decision trees and neural networks.
- More data can hurt near the threshold, because adding rows moves the threshold under a fixed model. That is the sample-wise form. Training longer can produce the same curve over epochs.
- Regularization smooths and lowers the peak but does not remove it.

**The rule for the team**

Measure where the threshold is: training error reaches zero and test error peaks at about the same size. Then size the model far from it on one side or the other. Below it, use explicit regularization and the classical diagnostics. Above it, keep going and verify with learning curves rather than with the classical intuition.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How do you recognize the threshold in a training log? Expected: training error reaches zero and test error is at its worst at about the same model size or epoch.
- **Level 4:** Why can adding data hurt in this regime? Expected: more rows move the threshold; a fixed model that was past it can land on it, which is the sample-wise form.
- **Level 4:** What does regularization do to the peak? Expected: it smooths and lowers the peak but does not remove it.
- **Level 4:** Does this make the bias-variance trade-off wrong? Expected: no; it holds below the threshold and is incomplete above it, where the implicit bias of the optimizer takes over.

**Wrong answers, and why they fail**

- "The second fall is a measurement error." It appears in linear models, trees and networks, and in both the sample-wise and epoch-wise forms.
- "Make the model as big as the budget allows and stop thinking about it." Bigger past the threshold works, but sitting on the threshold is the worst outcome; size the model deliberately away from it.
- "Regularization removes the problem." It smooths and lowers the peak; it does not remove it.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::
