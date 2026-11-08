---
track: aibank
title: "AI interview bank: Math and classical ML (part 1 of 2)"
short: Math and classical ML 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A sentence score that comes out as exactly zero

*Level 1 (screening) · concept · about 5 minutes*

A language model scores a sentence as the product of the probability of each word. For long sentences the score is exactly zero, and two long sentences can no longer be compared. What went wrong, and what do you compute instead?

:::answer Show the answer
:::say Short answer
The product of many small probabilities underflows to zero in floating point. Add the log probabilities instead, and the sum stays a finite negative number. A more negative sum means a less likely sentence, and the order of the sentences is unchanged.
:::

**Full answer**

**Why the product dies**

Each word has a probability below 1, often far below. The lesson shows the product falling to 0.0 after about 30 terms. Once the product is zero, every longer sentence gets the same score, and a comparison between them is meaningless.

**What the log does**

The log turns a product into a sum: log(a times b) equals log(a) plus log(b). Each term is at most 0, because each probability is at most 1, so the sum is a negative number that grows in size with the sentence length but never underflows. The lesson gives the extreme case: 50 words with probability 0.01 each have a raw probability of 10 to the minus 100, and a log probability of about minus 230.26.

**Where you already use it**

Cross-entropy loss is the negative log probability of the correct class. Training a classifier or a language model already works in log space. Log-softmax computes the log probabilities straight from the logits, so the tiny probabilities are never formed.

**Comparing sentences**

A longer sentence has a more negative sum even when every word is likely. To compare a short sentence with a long one, divide by the token count, or report the perplexity, which is the exponential of the mean negative log probability.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why is every log probability zero or negative? Expected: a probability is between 0 and 1, and the log of such a number is at most 0.
- **Level 2:** How do you compare two sentences of different length? Expected: compare the mean log probability per token, or the perplexity, not the raw sum.
- **Level 2:** Where does this appear in a loss function? Expected: cross-entropy is the negative log probability of the correct class, so training already runs in log space.
- **Level 3:** How do you get log probabilities from logits without forming the probabilities first? Expected: log-softmax, which subtracts the log-sum-exp of the logits from each logit.

**Wrong answers, and why they fail**

- "Use a wider float type and the product will be fine." A wider format only moves the point of underflow. Fifty words with probability 0.01 give 10 to the minus 100, and a longer sentence pushes it further down.
- "Multiply the probabilities and take the log at the end." The product is already zero before the log, and the log of zero is minus infinity.
- "Clip each probability to a minimum value." That changes the score of every rare word and still underflows for a long enough sentence.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## An R-squared below zero on the test set

*Level 1 (screening) · concept · about 5 minutes*

A regression report shows a negative R-squared on the test set. A teammate says the metric code must be broken, because R-squared lives between 0 and 1. How do you answer?

:::answer Show the answer
:::say Short answer
R-squared is one minus the ratio of the residual sum of squares to the total sum of squares around the mean. It is 1 for a perfect fit, 0 for a model that only predicts the mean, and below zero when the model does worse than that constant. A negative value is a real result, and it says the fitted model hurts on this data.
:::

**Full answer**

**The formula**

```text
R-squared = 1 - SS_res / SS_tot
SS_res = sum of (y_true - y_pred)^2
SS_tot = sum of (y_true - y_mean)^2
```

The total sum of squares is the error of the simplest model: predict the mean every time. When the model's residuals are larger than that, the ratio is above 1 and the metric goes negative. There is no lower bound.

**How it happens on a test set**

The model was fit on the training set. On the test set, a model that overfit the training data, or data whose distribution moved, can give predictions that are further from the targets than the test mean. The evaluation lesson prints a mean baseline next to the model for this reason, and a model must beat it. That baseline uses the mean of the training targets. It scores near 0 only when the test mean is close to the training mean, and below 0 when the two means differ.

**What to do with the number**

1. Compare with the training R-squared. A high training value and a negative test value points at overfitting or a shift between the two sets.
2. Check the split. A time series shuffled before the split, or a scaler fit on all the data, gives a very different pair of numbers.
3. Report RMSE and MAE next to it. RMSE is in the units of the target. R-squared is a scale free fraction of the variance. Each answers a different question.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What value does a model that predicts the training mean get on the test set? Expected: near 0 when the test mean is close to the training mean, because the residual and total sums are almost the same; below 0 when the two means differ.
- **Level 2:** Training R-squared is high and the test value is negative. What does the gap say? Expected: the model fit the training data and does not transfer; suspect overfitting or a shift between the sets.
- **Level 2:** Why report R-squared next to RMSE? Expected: RMSE is in the units of the target and shows the size of a typical error; R-squared is a fraction of variance and has no units.
- **Level 3:** The target has a heavy tail. What else do you check? Expected: MAE next to MSE, because squared errors let a few outliers dominate both MSE and R-squared.

**Wrong answers, and why they fail**

- "R-squared cannot be negative, so the code has a bug." The formula has no lower bound. A model that predicts worse than the mean gives a negative value.
- "Negative means the slope is negative." R-squared compares residuals with the variance around the mean. It carries no sign of a slope.
- "Clip it to zero in the report." That hides the fact that the mean would beat the model.

:::

## Read a shape error in a dense layer

*Level 1 (screening) · concept · about 5 minutes*

A colleague builds a dense layer that takes 784 inputs and gives 128 outputs. The first forward pass stops with a shape error. Which dimensions does the weight matrix need, and how do you read an error like this one?

:::answer Show the answer
:::say Short answer
The matrix is 128 by 784: one row for each output and one column for each input. A matrix product needs the inner sizes to agree, so a 128 by 784 matrix times a 784 by 1 input gives a 128 by 1 output. An error means the inner sizes differ, and the fix starts with the shapes of every operand written on paper.
:::

**Full answer**

**The rule**

A product of an m by n matrix and an n by p matrix gives an m by p matrix. The inner sizes, both n, must agree. For the layer in the question:

```text
(128 x 784) @ (784 x 1) = (128 x 1)
  weights       input       output
```

The rows of the weight matrix count the outputs. The columns count the inputs. Each output is the dot product of one weight row with the whole input vector.

**The bias**

The bias holds one value for each output. Store it as a 128 by 1 column, as the lesson does, so that it adds to the 128 by 1 result element by element. A flat array of 128 values against a 128 by 1 column broadcasts to 128 by 128 with no error. When the layer runs on a batch, the bias has fewer dimensions than the output, and broadcasting repeats it across the batch. Broadcasting only stretches a dimension of size 1, so it never fixes a 784 against a 128.

**How to read the error**

1. Write the shape of every operand next to the operation.
2. Find the operation whose inner sizes do not match. That is the broken line.
3. Decide which side is wrong. A transposed weight matrix, an input stored as a row instead of a column, and a missing batch dimension each give a different pair of numbers in the message.

The lesson makes the same check for a two layer network: the first matrix is 4 by 3 and the second is 2 by 4, so a 3 by 1 input gives a 4 by 1 hidden vector and a 2 by 1 output.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What shape does the bias have? Expected: one value for each output, so 128 values, stored as a 128 by 1 column so that it adds to each output column.
- **Level 2:** A batch of inputs arrives as rows instead of columns. What changes? Expected: the order of the product changes, so the batch matrix times the transposed weight gives one output row for each input.
- **Level 2:** Why does a transpose appear in the backward pass? Expected: the gradient for the input needs the weight matrix with its rows and columns swapped, so that the shapes agree in the reverse direction.
- **Level 3:** How does broadcasting hide a shape bug? Expected: a dimension of size 1 is stretched to fit, so a wrong shape can run without an error and give wrong values. An assertion on the shape catches it.

**Wrong answers, and why they fail**

- "The weight matrix is 784 by 128 because inputs come first." With a column input the matrix needs 128 rows and 784 columns. The order of the product decides which form is right, not the order in which you name the sizes.
- "Shapes do not matter, the framework fixes them." Broadcasting repeats only a dimension of size 1. A 784 against a 128 inner size is an error, or a silent wrong result after a reshape.
- "Transpose things until the code runs." A transpose that makes the code run can multiply the wrong pairs of numbers. Write the shapes down first and then change the one that is wrong.

:::

## Two products in NumPy that print different numbers

*Level 1 (screening) · code-reading · about 5 minutes*

Read this code and say what each print shows. Then tell me which of the two operations a dense layer uses, and why.

```python
import numpy as np

A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
print(A * B)
print(A @ B)
```

:::answer Show the answer
:::say Short answer
The star multiplies matching positions, so the first print shows 5, 12, 21 and 32. The at sign forms dot products of rows with columns, so the second print shows 19, 22, 43 and 50. A layer uses the at sign, because every output must sum over every input.
:::

**Full answer**

**Element-wise product**

Both arrays have the same shape, so the star pairs each cell with the cell at the same position:

```text
1*5 = 5    2*6 = 12
3*7 = 21   4*8 = 32
```

The order of A and B does not change the result.

**Matrix product**

The at sign calls the matmul method. Cell (i, j) of the result is the dot product of row i of A with column j of B:

```text
1*5 + 2*7 = 19    1*6 + 2*8 = 22
3*5 + 4*7 = 43    3*6 + 4*8 = 50
```

The order matters. B times A gives other numbers. The inner sizes must agree, and the result has the rows of A and the columns of B.

**Which one a layer uses**

A dense layer computes an activation of W times x plus b. Each output mixes all inputs with its own row of weights, which is the dot product inside a matrix product. The element-wise product appears in other places in training, for example when the learning rate scales a gradient, or when a mask zeroes some values. NumPy runs the matrix product with tuned BLAS routines written in C and Fortran, which the lesson measures as about 100 times faster than a Python loop over the same numbers.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Does the order of A and B matter in each case? Expected: no for the element-wise product, yes for the matrix product.
- **Level 2:** Which of the two operations does a learning rate step use? Expected: a scalar times the gradient, which is an element-wise scale.
- **Level 2:** Why is the at sign so much faster than a loop in Python? Expected: it calls BLAS routines in C and Fortran. The lesson gives about 100 times.
- **Level 3:** Someone writes the star for the layer and the code runs without an error. How is that possible? Expected: the shapes happened to be equal, so the element-wise product ran and gave wrong values with no error.

**Wrong answers, and why they fail**

- "Both print the same matrix, the star is another spelling of the at sign." The two operations follow different rules and give different numbers.
- "The at sign is the element-wise product and the star is the matrix product." The at sign calls matmul, which forms dot products of rows and columns. The star works on matching positions.
- "A dense layer multiplies each weight by its input, so it is element-wise." Each output also sums over all inputs. That sum is the dot product inside a matrix product.

:::

## A cross-entropy that returns inf on real batches

*Level 2 (working) · debug · about 8 minutes*

A from-scratch cross-entropy passes its unit tests on small logits. On real batches the loss comes back as inf. You print the batch and one logit vector is [100, 101, 102]. Walk me through the cause and the fix, and say why the fix is not an approximation.

:::answer Show the answer
:::say Short answer
The exponential of 100 is about 2.69 times 10 to the 43, far past the float32 maximum of about 3.4 times 10 to the 38, so each term of the softmax denominator overflows and the ratio is inf or nan. Subtract the largest logit from every logit before the exponential. The probabilities are identical in exact arithmetic, and the largest term is now exp(0), which is 1.
:::

**Full answer**

**Where the inf comes from**

Softmax divides exp of one logit by the sum of exp of all logits. The exp function is the main source of overflow in ML code: exp(88.7) is close to the float32 limit and exp(89.0) is already inf. For the vector in the question every term overflows, so the sum is inf, the ratio is nan, and the log of that is nan or inf.

**The shift**

Let c be the largest logit. Multiply numerator and denominator by exp(-c):

```text
softmax(x_i) = exp(x_i - c) / sum_j exp(x_j - c)
```

The factor exp(c) cancels, so the result is the same function. After the shift the largest exponent is exp(0) = 1, so nothing can overflow, and because one term equals 1 the sum is at least 1, so the log of the sum cannot reach minus infinity. For the vector in the question the shifted logits are -2, -1 and 0, the exponentials are 0.135, 0.368 and 1.000, and the probabilities are 0.090, 0.245 and 0.665.

**Compute log probabilities first**

Do not compute a probability and then take its log. Compute the log probability straight from the logits:

```text
log_softmax(x_i) = (x_i - c) - log(sum_j exp(x_j - c))
loss = -log_softmax(x_true)
```

This is the log-sum-exp trick. A framework loss that takes logits fuses these two steps for the same reason. The same trick also saves the case where all logits are large negative numbers: without it, every exp underflows to 0 and the log gives minus infinity.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the shift leave the probabilities unchanged? Expected: the factor exp(c) appears in the numerator and the denominator and cancels.
- **Level 2:** What goes wrong when every logit is very negative? Expected: every exponential underflows to 0 and the log of the sum is minus infinity; the same shift fixes it because the largest term becomes exp(0) = 1.
- **Level 3:** Why compute the loss from log-softmax rather than from the log of a softmax? Expected: a probability that underflowed to 0 has a log of minus infinity; log-softmax subtracts the log-sum-exp and never forms the probability.
- **Level 3:** A framework loss function takes logits, not probabilities. Why? Expected: it fuses log-softmax and the negative log-likelihood in one stable step, so the caller cannot overflow or underflow on the way in.

**Wrong answers, and why they fail**

- "Clamp every logit at 80 and move on." A clamp changes the probabilities whenever a logit crosses it. The shift gives the exact same probabilities with no bound on the logits.
- "Switch to float64." A wider exponent only moves the overflow point. Logits grow during training and will pass it.
- "Add a small epsilon inside the log." The inf comes from the exponential, before the log. An epsilon does nothing about an infinite denominator.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## A test score that production never reaches

*Level 2 (working) · debug · about 8 minutes*

A teammate standardizes the whole table with a scaler, then splits it into training, validation and test rows, and reports a test score. In production the score is well below that number. Name the fault in the pipeline and describe a setup where the test number predicts production.

:::answer Show the answer
:::say Short answer
The scaler saw the test rows, so the mean and standard deviation carried information from the test set into training. That is data leakage, and it makes the reported score optimistic. Split first, fit every preprocessing step on the training rows only, and apply the fitted transform to the other two sets.
:::

**Full answer**

**What leaked**

Standardization subtracts a mean and divides by a standard deviation. Both are statistics of the rows the scaler saw. When those rows include the test set, the training data has been shaped by the test data. The evaluation lesson names this as its first example of leakage, next to two others that hide behind the same habit: future rows in a time series that was shuffled before the split, and a feature computed from the target.

**The three sets and their jobs**

| Set | Share | Job |
|---|---|---|
| Training | 60-70 percent | the model fits these rows |
| Validation | 15-20 percent | choose hyperparameters and models |
| Test | 15-20 percent | report the final score, once |

The test set is a hold-out guarantee. After you look at its score and change the model, it is a second validation set, and its score no longer predicts unseen data.

**A pipeline that holds**

1. Split before any statistic is computed. For a time series, split by time.
2. Fit the scaler, the encoder and any imputation on the training rows. Transform the other rows with those fitted values.
3. Inside cross-validation, repeat the fit inside each training fold. A transform fit on all rows before the folds leaks across every fold.
4. Use a stratified split when the classes are imbalanced, so each fold keeps the class ratio.
5. Check for duplicate rows across the splits.
6. Touch the test set once, at the end.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How does the same fault appear inside k-fold cross-validation? Expected: a transform fit on all rows before the folds leaks across every fold; fit it inside each training fold.
- **Level 2:** Why does reading the test score many times also inflate it? Expected: each change after a look fits the test set, so it becomes a second validation set.
- **Level 3:** The data has a time axis. What changes in the split? Expected: split by time, so the model never trains on rows after the ones it predicts; a shuffled split lets future rows into training.
- **Level 4:** How do you tune hyperparameters and still report an honest number? Expected: nested cross-validation with an inner loop for tuning and an outer loop for the estimate, or a validation set for tuning and a test set used once.

**Wrong answers, and why they fail**

- "Scaling is a harmless transform, so the order does not matter." The mean and standard deviation are statistics of the data. Fitting them on test rows moves test information into training.
- "A leak this small cannot move the score much." The size is unknown until you remove it, and other leaks, such as a target-derived feature, hide behind the same habit.
- "Run the test set after each change to be safe." Each look and change fits the test set, and the number stops predicting production.

:::

## Pick a threshold when 95 percent of the data is negative

*Level 2 (working) · tradeoff · about 8 minutes*

A binary classifier reports 95 percent accuracy on a dataset where 95 percent of the rows are negative. The product owner is happy. You are not. Which numbers do you ask for, and how do you choose the decision threshold for this product?

:::answer Show the answer
:::say Short answer
A model that always says negative also gets that accuracy, so the number proves nothing. Ask for the confusion matrix, then precision, recall and F1 at the current threshold, and the AUC-ROC for the ranking. Move the threshold from the default of 0.5 toward the error that costs the product more: raise it when a false positive is expensive, lower it when a missed positive is expensive.
:::

**Full answer**

**The four counts**

| | Predicted positive | Predicted negative |
|---|---|---|
| Actually positive | true positive | false negative |
| Actually negative | false positive | true negative |

Precision is true positives over all predicted positives. Recall is true positives over all actual positives. F1 is their harmonic mean. Accuracy mixes the two error types with the class sizes, so on imbalanced data it tracks the majority class.

**What the threshold does**

The model outputs a probability. The decision compares it with a threshold. A higher threshold predicts positive less often: precision rises and recall falls. A lower threshold does the reverse. The lesson on logistic regression sweeps thresholds of 0.3, 0.4, 0.5, 0.6 and 0.7 on one model and prints the four metrics at each, which is the table to show the product owner.

**Which way to move**

- When a false positive costs more, such as a filter that blocks a real message, favor precision and raise the threshold.
- When a false negative costs more, such as a screen that misses a disease, favor recall and lower the threshold.
- When neither clearly dominates, report F1, and show the precision and recall behind it.

**The threshold-free view**

AUC-ROC plots the true positive rate against the false positive rate at every threshold. It measures how well the model ranks positives above negatives: 0.5 is a random ranking, 1.0 is a perfect one. Use it to compare models, then pick the threshold from the product's costs.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What precision and recall does the always-negative model get? Expected: recall is 0, because it finds no positives, and precision is undefined or set to 0 because it predicts none.
- **Level 2:** Why is F1 a harmonic mean rather than an arithmetic mean? Expected: the harmonic mean is pulled toward the smaller value, so a model cannot hide a near-zero recall behind a high precision.
- **Level 3:** How do you keep the threshold choice honest? Expected: pick it on the validation set, not the test set, and report the test metrics at that fixed threshold once.
- **Level 3:** When is AUC-ROC the wrong summary? Expected: when the positive class is rare and the product cares about the precision of the top predictions; a precision-recall curve shows that part of the picture.

**Wrong answers, and why they fail**

- "Accuracy is 95 percent, so the model is good." The always-negative model gets the same number. Accuracy hides the minority class.
- "Keep the threshold at 0.5 because that is where the sigmoid crosses." The default is only the point where the model is unsure. The product's costs decide the cut.
- "Pick the threshold that gives the best test F1." That fits the test set. Choose it on validation data and report the test score once.

:::

## Read a perplexity from a mean cross-entropy

*Level 2 (working) · estimate · about 6 minutes*

A language model has a vocabulary of V tokens. On a held-out text, its mean cross-entropy per token, measured in nats, equals the natural log of V. Estimate the perplexity and say what the number tells you about the model.

:::answer Show the answer
:::say Short answer
Perplexity is the exponential of the mean cross-entropy, so here it equals V. On average the model is as uncertain as a uniform pick over the whole vocabulary. A trained model should sit far below V. The mean alone does not prove that the model learned nothing, because other per-token predictions can give the same average, so check per-token predictions and the data.
:::

**Full answer**

**The definition**

```text
perplexity = e ^ H(P, Q)    when the loss is in nats
perplexity = 2 ^ H(P, Q)    when the loss is in bits
```

The two give the same number, because 1 nat is 1.4427 bits and the base of the exponential changes with the base of the log. Perplexity reads as the effective number of equally likely choices the model is torn between at each step. A perplexity of 50 means the model is, on average, as confused as if it had to pick uniformly from 50 tokens.

**The estimate**

The loss is ln V. The exponential of ln V is V. Uniform logits over V tokens give exactly this loss and exactly this perplexity. Other per-token predictions can give the same average, so this number alone does not prove that the model learned nothing. Look at the per-token predictions and at the data distribution before you decide. The lesson gives a scale: GPT-2 reached about 30 on common benchmarks, and modern models are in the single digits on well-represented domains.

**What to check before you blame the model**

- The text and the tokenizer must match the training setup. A different tokenizer changes the token count and the vocabulary, and the per-token number is not comparable.
- A perplexity near V on an in-domain text points at a bug: a shuffled label stream, a wrong vocabulary mapping, or weights that never loaded.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The loss is reported in bits instead of nats. What changes? Expected: raise 2 to the loss instead of e; the perplexity is the same number.
- **Level 2:** What does a perplexity of 50 mean in words? Expected: on average the model is as uncertain as a uniform pick among 50 tokens.
- **Level 3:** Two models use different tokenizers. Can you compare their perplexities? Expected: not directly; the token count and the vocabulary differ, so the per-token numbers measure different things.
- **Level 3:** A perplexity equal to V shows up on in-domain text after training. What do you suspect first? Expected: a pipeline bug, such as labels that do not line up with inputs or weights that did not load, because the model is doing no better than chance.

**Wrong answers, and why they fail**

- "Perplexity equal to V means the model is perfect." A perfect model has perplexity 1. V is what a uniform guess gets.
- "Divide the loss by V to get the perplexity." Perplexity is the exponential of the loss, not a ratio.
- "A lower perplexity on any text means a better model." Only on the same text with the same tokenizer. A different text or vocabulary moves the number without any change in the model.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## Score a tree node with Gini and with entropy

*Level 2 (working) · estimate · about 8 minutes*

A node in a classification tree holds 6 cats and 4 dogs. Give its Gini impurity and its entropy in bits, and explain how a tree uses either number to choose a split.

:::answer Show the answer
:::say Short answer
The class shares are 0.6 and 0.4. Gini is 1 minus the sum of squared shares, so 1 minus 0.36 minus 0.16, which is 0.48. Entropy is minus the sum of share times log base 2 of share, which comes to 0.971 bits. The tree tries every feature and threshold and keeps the split with the largest drop from the parent's impurity to the weighted impurity of the two children.
:::

**Full answer**

**The two numbers**

```text
Gini    = 1 - (0.6^2 + 0.4^2) = 1 - (0.36 + 0.16) = 0.48
Entropy = -(0.6 * log2(0.6) + 0.4 * log2(0.4))
        = -(0.6 * -0.737 + 0.4 * -1.322)
        = 0.442 + 0.529 = 0.971 bits
```

Gini is the chance that a random sample at the node is labeled wrong when you label it by the node's class distribution. Entropy is the average surprise of the labels at the node. Both are 0 for a pure node. For a two class node with equal shares, Gini is 0.5 and entropy is 1.0 bit.

**How the tree uses them**

The information gain of a split is the parent's impurity minus the weighted average of the children's impurity, where each child is weighted by its share of the samples. The algorithm is greedy: at each node it sorts each feature, tries every midpoint between distinct values as a threshold, and keeps the pair with the highest gain. Then it recurses into both children. Greedy splitting does not find the best tree, because that problem is NP-hard, but it works well in practice.

**Gini or entropy**

On most data the two criteria pick the same splits and give trees of about the same depth. Gini has no logarithm, so it is a little cheaper to compute. Entropy connects the split to information theory: the split that minimizes the conditional entropy of the label given the feature is the split that removes the most uncertainty.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What is the gain of a split that puts all the cats on one side and all the dogs on the other? Expected: the children are pure, so their impurity is 0 and the gain equals the parent's impurity, 0.48 for Gini.
- **Level 2:** Why weight the children by their sample share? Expected: a pure child with one sample should not count as much as a mixed child with the rest of the data.
- **Level 3:** How does the tree turn a continuous feature into candidate thresholds? Expected: sort the values and try the midpoint between each pair of distinct neighbors.
- **Level 3:** What stops the recursion before every leaf holds one sample? Expected: pre-pruning limits such as a maximum depth, a minimum number of samples per leaf, or a minimum gain, or post-pruning after the full tree is grown.

**Wrong answers, and why they fail**

- "Gini is 0.6 times 0.4." That product is half of the two class Gini. The formula is 1 minus the sum of squared shares, which gives 0.48 here.
- "Entropy of a 6 to 4 node is 1 bit because there are two classes." One bit is the maximum, reached only at equal shares. Unequal shares give less, 0.971 bits here.
- "Pick the split with the lowest child impurity, and the parent does not matter." The parent's impurity is the same for every candidate split at that node, so the ranking is the same, but the gain is what the tree stores and reports as feature importance.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Why autograd adds gradients instead of setting them

*Level 2 (working) · code-reading · about 8 minutes*

This is the multiply operation of a small autograd engine.

```python
def __mul__(self, other):
    other = other if isinstance(other, Value) else Value(other)
    out = Value(self.data * other.data, (self, other), '*')
    def _backward():
        self.grad += other.data * out.grad
        other.grad += self.data * out.grad
    out._backward = _backward
    return out
```

A contributor replaces both `+=` with `=`, with the comment that a gradient should be set, not added. The XOR training loop still runs and the loss still falls. What did the change break, and how do you prove it in one small test?

:::answer Show the answer
:::say Short answer
A value that feeds two or more operations receives a gradient from each consumer, and the chain rule says those contributions add. With assignment, the last consumer to run overwrites the others, so every shared node gets a wrong gradient, including each weight that the summed loss uses once per sample. A numerical gradient check exposes the error in one call.
:::

**Full answer**

**What the chain rule says about shared nodes**

When y depends on x through two paths, the derivative of y with respect to x is the sum of the derivatives along each path. In the engine, a node that is used twice has two closures that write to its `grad`. The topological order runs every consumer before the node passes its gradient to its own children, so both closures run, and the second must add to the first.

**Why the loop still ran**

In the XOR loop the loss is the sum of four squared errors, one per sample, and every weight takes part in all four forward passes. With assignment, each weight keeps only the contribution of the sample that ran last. That is still a direction that often points downhill, so the loss moves. The gradient is wrong for every parameter even so.

**The one-line test**

```python
x = Value(3.0)
y = x * x
y.backward()
```

Here `self` and `other` are the same object. The correct gradient of x squared at 3 is 6.0. The two closures each add 3.0, which gives 6.0. With assignment the result is 3.0. The lesson's `gradient_check` does the same job for any expression: it compares the engine with a centered finite difference and reports the difference, which must be far below 1e-5.

**The other side of the same rule**

Because gradients add, the training loop must set every `grad` back to 0.0 before each backward call. The lesson does this with a loop over the parameters. A framework does the same with a zero_grad call. Both habits come from the same fact: gradient storage is an accumulator.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why must the training loop set every gradient to zero before backward? Expected: gradients accumulate, so a second backward would stack onto the first; the loop sets each parameter's grad to 0.0.
- **Level 3:** Write the smallest expression that fails with assignment. Expected: a value multiplied by itself; the gradient at 3 must be 6.0, and assignment gives 3.0.
- **Level 3:** Why does the topological order matter for this bug? Expected: all consumers of a node must run before the node passes gradient on; with assignment the answer depends on which consumer ran last.
- **Level 4:** Where does the same accumulation rule show up in a framework you use? Expected: a tensor's grad accumulates across uses and across backward calls, which is why the optimizer's zero_grad runs before each step.

**Wrong answers, and why they fail**

- "Assignment is fine because each node has one parent." A node that feeds two operations has two consumers in the graph, and a weight in a summed loss has one consumer per sample.
- "The loss still goes down, so the gradients are correct." A wrong gradient can still point partly downhill. Only a numerical check proves it.
- "Use a running average instead of a sum." The chain rule sums the path contributions. An average divides the true gradient by the number of consumers.

:::

## Why backpropagation runs the chain rule in reverse

*Level 2 (working) · concept · about 8 minutes*

Automatic differentiation can push derivatives forward from the inputs or pull them backward from the output. Training frameworks pick the backward direction. Why, and in which situation would the forward direction be the better choice?

:::answer Show the answer
:::say Short answer
A network has millions of parameters and one scalar loss. Reverse mode seeds the output with a gradient of 1 and gets the gradient of every parameter in one backward sweep. Forward mode needs one sweep for each input variable, so it wins only when the inputs are few and the outputs are many.
:::

**Full answer**

**The two modes**

Both modes apply the chain rule at every node of the computation graph. They differ in where the seed goes.

| Mode | Seed | Direction | Best when |
|---|---|---|---|
| Forward | the derivative of one input with respect to itself, set to 1 | input to output | few inputs, many outputs |
| Reverse | the derivative of the output with respect to itself, set to 1 | output to input | many inputs, few outputs |

Forward mode carries one derivative through the graph. To get the gradient of a loss with respect to a million weights, you would run it a million times. Reverse mode carries the gradient of the single loss back to every node, and each node multiplies by its local derivative and passes the result to its children.

**What reverse mode costs**

The backward sweep visits each node once, so the time is proportional to one forward pass. The engine must order the nodes first. A topological sort guarantees that a node has received the gradient from every consumer before it passes gradient on. When a value feeds several operations, the contributions add.

**When forward mode is the right choice**

Forward mode fits a function with one or two inputs and a large output, because one sweep gives the derivative of the whole output along one input direction. Dual numbers implement it with almost no code: a pair of value and derivative, with the rule that the square of the derivative part is zero, so the product rule falls out of the arithmetic.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the backward sweep need a topological order? Expected: a node must receive the full gradient from every consumer before it passes gradient to its children.
- **Level 3:** How many forward-mode sweeps does a model with one million weights need for one gradient? Expected: one million, one per input variable, which is why nobody trains that way.
- **Level 3:** What is a dual number and how does it carry a derivative? Expected: a pair of a value and a derivative, where the derivative part squares to zero, so each arithmetic rule carries the derivative along.
- **Level 4:** Name a case in an ML system where you would pick forward mode. Expected: a function with one or two inputs and a large vector output, where one sweep gives the derivative of the whole output along one input direction.

**Wrong answers, and why they fail**

- "Reverse mode is more accurate than forward mode." Both are exact up to floating point rounding. The difference is the cost, not the result.
- "Forward mode cannot handle a composition of functions." Both modes apply the chain rule through every link. Forward mode pushes the derivative from the input side.
- "Backpropagation is a different algorithm from reverse-mode autodiff." Backpropagation is reverse-mode autodiff applied to the network graph, with the loss as the single output.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Why minimizing cross-entropy also minimizes KL

*Level 2 (working) · concept · about 8 minutes*

Your classifier trains on a cross-entropy loss. A reviewer asks why you do not train on the KL divergence between the labels and the predictions instead. Explain how the two quantities relate and what would change, if anything, in training.

:::answer Show the answer
:::say Short answer
Cross-entropy of P and Q equals the entropy of P plus the KL divergence from P to Q. The labels fix P, so their entropy is a constant during training, and the two objectives have the same gradient. With one-hot labels the entropy is zero and the two numbers are equal: minus the log of the predicted probability of the true class.
:::

**Full answer**

**The three quantities**

```text
H(P)     = - sum_x p(x) log p(x)             entropy of the true distribution
H(P, Q)  = - sum_x p(x) log q(x)             cross-entropy, P true, Q predicted
KL(P||Q) =   sum_x p(x) log (p(x) / q(x))    = H(P, Q) - H(P)
```

Entropy is the average surprise of P under its own code. Cross-entropy is the average surprise when events from P are coded with Q. KL is the extra surprise, the bits wasted by coding with Q instead of P.

**Why the optimizer cannot tell them apart**

The model controls Q. The labels fix P, so H(P) is a constant for each sample. The gradient of a constant is zero, so the gradient of H(P, Q) and the gradient of KL(P||Q) with respect to the model are the same. With a one-hot label the sum has one nonzero term, H(P) is 0, and the loss is minus the log of the predicted probability of the true class.

**When the two numbers differ**

The values differ when the target has positive entropy. Label smoothing turns a hard target into a soft one, and a teacher's softmax in distillation is soft from the start. Then cross-entropy cannot go below H(P), while KL reaches 0 at a perfect match. The gradients are still equal, so the choice changes the number you log, not the model you get.

**Two facts to say out loud**

- KL is not symmetric. KL(P||Q) and KL(Q||P) weight the log ratio by different distributions, so it is not a distance.
- The gradient of cross-entropy with respect to the logits is the predicted probability minus the target. That clean form is why it pairs with softmax.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is KL not a distance? Expected: it is not symmetric; each direction weights the log ratio by a different distribution.
- **Level 3:** With label smoothing the loss never reaches zero. Why? Expected: the soft target has positive entropy, and cross-entropy is at least the entropy of the target; KL would reach zero at a perfect match.
- **Level 3:** Differentiate the loss by each logit. What form do you get? Expected: the predicted probability minus the target, for each class.
- **Level 4:** In distillation the target is a teacher's softmax. Which of the two numbers do you log? Expected: KL, because the teacher's entropy is a constant offset per sample that hides how close the student is; the gradient is the same either way.

**Wrong answers, and why they fail**

- "They are different objectives and give different models." They differ by the entropy of the labels, which does not depend on the model, so the gradients are equal.
- "Cross-entropy is a distance between two distributions." It is not symmetric, and it is not zero when the distributions match; it equals the entropy of P at a match.
- "KL is smaller, so it is the better loss." KL is cross-entropy minus a constant. The optimizer sees the same slope.

**Related lesson in this course:** [Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO](#lectures-5)

:::
