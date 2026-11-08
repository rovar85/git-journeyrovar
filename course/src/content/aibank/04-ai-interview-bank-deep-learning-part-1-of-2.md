---
track: aibank
title: "AI interview bank: Deep learning (part 1 of 2)"
short: Deep learning 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Ten layers with no activation are one layer

*Level 1 (screening) · concept · about 5 minutes*

A junior engineer removes every activation function from a 10 layer network to make it faster and reports that training still runs and the loss still falls. What did they build, and why will it fail on XOR or on a spiral dataset?

:::answer Show the answer
:::say Short answer
Two linear layers compose into one: W2 (W1 x + b1) + b2 equals (W2 W1) x + (W2 b1 + b2), which is a single matrix and a single bias. Ten linear layers are one linear layer with extra parameters and the same decision boundary, a hyperplane. XOR and a spiral need a curved boundary, so the network cannot fit them at any width or depth.
:::

**Full answer**

**The substitution**

```text
h = W1 x + b1
y = W2 h + b2 = W2 W1 x + W2 b1 + b2 = A x + c
```

Matrix products compose, so a stack of linear maps is one linear map. Repeat the substitution and ten layers fold into one matrix A and one vector c. Depth without a nonlinearity is an illusion: the model has the capacity of a single linear layer, it only costs more to run.

**What an activation changes**

Insert a nonlinear function g between the layers, so that h = g(W1 x + b1). The substitution fails, because W2 g(W1 x + b1) + b2 does not reduce to A x + c. Each extra layer with an activation adds representational capacity. That is what lets a network bend its boundary around a spiral or separate the XOR points.

**What to add back**

The lesson's defaults: ReLU for a plain MLP or a CNN, GELU for a transformer, tanh inside recurrent cells. The output layer is the one place a missing activation is correct: a regression head emits any real number, a binary head uses a sigmoid, and a multi-class head uses a softmax.

**Why the loss still fell**

A stack of linear layers only finds the best linear fit to the data. On XOR or a spiral that fit is close to chance, but it is better than random weights, so the loss moves. A falling loss is not evidence that the model can represent the target.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which layer is allowed to have no activation? Expected: the output layer of a regression model, which must produce any real number.
- **Level 2:** Does the deep linear network train faster than one layer? Expected: no; it computes the same function with more parameters and more matrix multiplies.
- **Level 2:** Which activation would you add back for a plain MLP and for a transformer? Expected: ReLU for the MLP and GELU for the transformer.
- **Level 3:** Why is the collapse not a proof that depth is useless? Expected: with a nonlinearity between layers the substitution fails and each layer adds capacity; deep networks fit the same functions with fewer parameters than wide shallow ones.

**Wrong answers, and why they fail**

- "Ten layers are deeper, so they represent more." Without a nonlinearity the product of the matrices is one matrix; depth adds nothing.
- "The biases make it nonlinear." A bias shifts the hyperplane; it does not bend it.
- "The loss went down, so it is learning fine." It learns the best linear fit, which for XOR or a spiral is near chance.

:::

## Test accuracy that changes with the same weights

*Level 1 (screening) · concept · about 5 minutes*

A saved model gives a different test accuracy each time you evaluate it on the same test set with the same weights. The data loader does not shuffle. What is the most likely cause, and which two layer types are involved?

:::answer Show the answer
:::say Short answer
The model is still in training mode at test time. Dropout keeps zeroing random units, so each forward pass runs a different subnetwork, and batch normalization keeps using the mean and variance of the current batch instead of its running averages. Switch to evaluation mode before inference and turn gradient tracking off.
:::

**Full answer**

**Two layers that behave differently by mode**

| Layer | Training mode | Evaluation mode |
|---|---|---|
| Dropout | zero each unit with probability p, scale the rest by 1 over (1 - p) | pass everything through unchanged |
| Batch normalization | normalize with the batch mean and variance, update the running averages | normalize with the running averages |

Both layers read one flag, the training flag of the module. In the mini framework, a Sequential container's train and eval methods set the flag on the container and on every module inside it. A framework does the same with model.train() and model.eval().

**Why the accuracy moves**

With dropout active, each forward pass draws a new mask, so the same input gives a different output and some predictions flip across the threshold. With batch statistics active, each prediction depends on which other rows sit in its batch, and a batch of one has a variance of zero, which makes the normalization meaningless. The lesson calls a forgotten eval call one of the most common bugs in deep learning, and this symptom is its signature.

**The fix and its mirror image**

Call eval before inference and wrap the pass in no_grad, which also saves memory. Then call train again before the next epoch. The mirror bug is as common: a model left in evaluation mode after validation trains with dropout off and with batch norm's running averages frozen, so it loses its regularization and its inference statistics go stale.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does dropout do in evaluation mode? Expected: nothing; it passes every value through unchanged, because the scaling was applied during training.
- **Level 2:** Why can batch normalization not use batch statistics for a batch of one at test time? Expected: the variance of one sample is zero, so the statistics are meaningless; the running averages must be used.
- **Level 2:** How does a container pass the mode to its children? Expected: its train and eval methods set the flag on the container and on every module inside it.
- **Level 3:** You forget to switch back to training mode after validation. What happens in the next epoch? Expected: dropout stays off and batch norm stops updating its running statistics, so the model trains without regularization and its inference statistics go stale.

**Wrong answers, and why they fail**

- "Set a random seed before each evaluation." That hides the symptom; the model still evaluates with dropout and batch statistics active, so the accuracy is wrong, just repeatably wrong.
- "GPU arithmetic is nondeterministic, this is normal." That gives differences far below one changed prediction, not a moving accuracy.
- "Remove dropout from the architecture." Dropout is a training time regularizer; the fix is to switch modes, not to delete the layer.

:::

## Why one perceptron never learns XOR

*Level 1 (screening) · concept · about 5 minutes*

A single perceptron learns the AND and OR gates in a few epochs. On the XOR gate it never converges, even after 1000 epochs. Why not, and what is the smallest change to the model that makes XOR learnable?

:::answer Show the answer
:::say Short answer
A perceptron takes a weighted sum, adds a bias and applies a threshold, so its decision boundary is one straight line. AND and OR put their ones on one side of a line. XOR puts the ones at (0, 1) and (1, 0) and the zeros at (0, 0) and (1, 1), and no single line separates those two pairs. Add a hidden layer: two neurons that compute OR and NAND, and an output neuron that ANDs them, give XOR exactly.
:::

**Full answer**

**What one perceptron can draw**

The output is 1 when w1 x1 + w2 x2 + b is at least 0 and 0 otherwise. The set of points where the sum equals 0 is a line, and training moves that line. The learning rule is small: when a prediction is wrong, add the learning rate times the error times the input to each weight, and the error to the bias. When the prediction is right, the error is 0 and nothing moves. On a linearly separable dataset this finds a separating line. On XOR there is none, so the weights keep changing forever. The lesson's run with 1000 epochs reports that it did not converge.

**The fix**

XOR equals (x1 OR x2) AND NOT (x1 AND x2). Three perceptrons in two layers compute it:

```text
OR neuron:    weights [1.0, 1.0],   bias -0.5
NAND neuron:  weights [-1.0, -1.0], bias 1.5
AND neuron:   weights [1.0, 1.0],   bias -1.5   on the two hidden outputs
```

The first layer turns the four input points into new features. In that feature space the two classes are separable, and the output neuron draws a line there.

**From hand-wired to learned**

The step function has no useful gradient, so the hidden weights cannot be learned by backpropagation. Replace it with a sigmoid, which is smooth, and the same 2-2-1 shape learns XOR from random weights. The multi-layer lesson shows the hand-wired sigmoid version, with weights of 20 and -20 and biases of -10, 30 and -30, where the large weights make the sigmoid act like a step. This is the point where a perceptron becomes a neural network.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does the learning rule do when a prediction is right? Expected: the error is 0, so no weight changes.
- **Level 2:** Why does the step function block learning in the two layer version? Expected: it has no useful gradient, so backpropagation cannot assign blame to the hidden weights; the sigmoid is smooth and has a gradient everywhere.
- **Level 2:** Why do weights of 20 and -20 work in the sigmoid version? Expected: large weights make the sigmoid act like a step, so each hidden neuron is a crisp OR or NAND.
- **Level 3:** Is a three input majority function linearly separable? Expected: yes; output 1 when at least two inputs are 1 is a half space, so one perceptron learns it.

**Wrong answers, and why they fail**

- "Train longer or raise the learning rate." No line separates the XOR points, so no number of epochs finds one.
- "Add more inputs or more neurons in the same layer." A wider single layer still draws one line through the same plane.
- "A hidden layer with no activation fixes it." Two linear layers compose into one linear map, which is one line again. The hidden layer needs a nonlinearity.

:::

## A classifier that predicts 0.5 and has a low loss

*Level 2 (working) · concept · about 8 minutes*

A binary classifier trained with mean squared error on a balanced dataset settles on an output near 0.5 for every input. The loss is low and stable, and the optimizer reports no problem. Explain why the optimizer is content and which loss you switch to.

:::answer Show the answer
:::say Short answer
With two classes split evenly, a constant output of 0.5 gives a squared error of 0.25 on every row, which the lesson calls the minimum MSE a model can reach without learning anything, and the sigmoid's flat regions give MSE almost no gradient near a confident wrong answer. Cross-entropy charges minus the log of the predicted probability of the true class: 0.693 for 0.5, 0.01 for 0.99 and 4.6 for 0.01, so it pushes each prediction toward its label. Switch to binary cross-entropy.
:::

**Full answer**

**Why MSE is content**

MSE averages the squared gap between the prediction and the label. Its gradient with respect to a prediction is linear in the gap. The prediction passes through a sigmoid, whose derivative is p(1 - p) and is near zero when p is near 0 or 1. A confident wrong answer, p near 0 for a positive row, sits exactly where the sigmoid is flat, so the update is tiny. A model can lower the loss a little by moving everything toward the middle and then stop, because the gradient has little left to say.

**Why cross-entropy is not**

Binary cross-entropy is minus y log p minus (1 - y) log (1 - p). Its derivative with respect to p is minus y over p plus (1 - y) over (1 - p). For a positive row with p near 0 that is about minus 1 over p, which grows without bound as p falls. The log undoes the sigmoid: the derivative of the loss with respect to the logit is the prediction minus the target, linear in the error and never flat. The lesson's scale: a right answer at 0.99 costs 0.01, a wrong answer at 0.01 costs 4.6, a ratio of about 460.

**The multi-class version**

Categorical cross-entropy on a one-hot target reduces to minus the log of the probability of the true class. A random guess among 10 classes puts probability 0.1 there and costs 2.3; a probability of 0.9 costs 0.105. A loss stuck near 2.3 on a 10 class problem is the multi-class twin of the 0.5 symptom.

**When the switch does not help**

The switch helps only when the inputs carry signal about the label. On balanced data with no predictive features, both losses are lowest at a constant 0.5, so cross-entropy settles there too. Check that a simple model beats the constant before you blame the loss.

**Where MSE belongs**

Regression on real valued targets, where a linear gradient in the error is what you want. For targets with heavy outliers, MAE or a Huber loss are the lesson's alternatives.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Write the derivative of binary cross-entropy with respect to p. Expected: minus y over p plus (1 - y) over (1 - p), which grows without bound when p is near 0 for a positive row.
- **Level 2:** Why does a prediction of 0.5 cost 0.693 under cross-entropy? Expected: it is minus the natural log of 0.5.
- **Level 3:** After the sigmoid, differentiate cross-entropy by the logit. What do you get? Expected: the prediction minus the target; the log cancels the sigmoid's derivative.
- **Level 3:** When is MSE the right loss? Expected: regression on real valued targets; for heavy outliers, MAE or a Huber loss.

**Wrong answers, and why they fail**

- "Lower the learning rate so MSE converges properly." The 0.5 output is where MSE is content; a smaller step arrives there more slowly.
- "MSE and cross-entropy have the same minimizer, so it does not matter." They agree only at a perfect fit. Away from it, MSE's gradient flattens where cross-entropy's grows.
- "Use accuracy as the loss instead." Accuracy has no useful gradient; the optimizer needs a smooth loss.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## A wide layer that behaves like one neuron

*Level 2 (working) · concept · about 6 minutes*

A network with a hidden layer of 512 units is initialized with every weight and every bias at zero. Training runs for thousands of epochs and the loss barely moves. Learning rate and data both check out. What is wrong, and why does a small random perturbation of each weight fix it?

:::answer Show the answer
:::say Short answer
Every neuron in the layer starts identical, so each computes the same output, receives the same gradient and takes the same update. They stay identical for the whole run: the layer holds the parameters of 512 neurons and the function of one. Random initialization gives each neuron its own starting point, so the gradients differ and the neurons learn different features. The scale of that randomness then decides whether the signal survives the depth.
:::

**Full answer**

**The symmetry**

All neurons in a layer have the same structure: a weighted sum of the same inputs, a bias, an activation. Whatever makes them different must come from the weights. If the weights are equal, the outputs are equal. Backpropagation then hands each neuron the same gradient, because each contributed the same amount to the loss. The update is the same, and the weights are equal again. Nothing in gradient descent can split them. The lesson's demo builds four zero-initialized neurons, feeds one input, prints four identical outputs, and counts one effective parameter instead of the eight that were allocated.

**Why zero is only the extreme case**

Any constant initialization has the same flaw. Setting every weight to 0.5 produces 512 copies of one neuron just as zero does. Random values are the brute force way to break the tie, and they are also why two runs with different seeds learn different features.

**Biases can stay at zero**

The lesson's layers draw random weights and set the biases to 0.0. That is fine: the weights already differ across neurons, so the biases do not need to.

**After the symmetry is gone**

Random is not enough on its own. The variance of the draw must match the activation: Xavier for sigmoid and tanh, Kaiming for ReLU and GELU. Too small a scale and the signal vanishes through the layers; too large and it explodes. A quick check is to push random inputs through the untrained network and log the activation magnitude at each layer.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Is it fine to set the biases to zero? Expected: yes, when the weights are random; the lesson's layers do so.
- **Level 2:** Would a nonzero constant for every weight fix it? Expected: no; the neurons are still identical and move in lockstep.
- **Level 3:** After the fix, the loss moves but a deeper version trains badly. What do you check next? Expected: the scale of the random draw against the activation; Xavier for sigmoid and tanh, Kaiming for ReLU, verified by activation magnitudes per layer.
- **Level 3:** How does the lesson show the symmetry in a few lines? Expected: four zero-initialized neurons on one input give four identical outputs, and it counts one effective parameter instead of eight.

**Wrong answers, and why they fail**

- "The learning rate is too low." Each neuron moves, but all move together; no learning rate separates identical gradients.
- "Add more neurons." They are all the same neuron; width adds nothing without symmetry breaking.
- "Zero init is fine for the first layer because the inputs differ." The neurons in one layer share the same inputs; what differs across neurons has to be the weights.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## How much gradient survives ten sigmoid layers

*Level 2 (working) · estimate · about 8 minutes*

A network has ten hidden layers, each with a sigmoid activation. Estimate the largest factor that the sigmoid derivatives alone let a gradient keep on the way from the loss to the first layer, and say what that number means for training.

:::answer Show the answer
:::say Short answer
The sigmoid derivative is s times (1 - s), which peaks at 0.25 when the output is 0.5. Backpropagation multiplies by that derivative once per layer, so after ten layers the activation factors multiply to at most 0.25 to the tenth power, about one millionth. Each layer also multiplies by its transposed weight matrix, and weights with a norm above 1 can enlarge the gradient, so the figure bounds only the activation part. With the small initial weights of the lesson, the first layers receive almost no signal and stay near their initialization while the last layers learn, which is the vanishing gradient problem.
:::

**Full answer**

**The chain through the layers**

At each layer the backward pass computes the gradient of the loss with respect to the pre-activation as the incoming gradient times the activation's derivative at that point. With a sigmoid that derivative is a(1 - a) for an output a. Its maximum is 0.25, at a equal to 0.5. Three layers deep the product is at most 0.25 cubed, which is 0.0156. Ten layers deep it is 0.25 to the tenth, which the lessons write as 0.000001 and as 0.000000953674.

**Why the bound is optimistic**

The 0.25 holds only for a unit whose output is exactly 0.5. A unit near 0 or near 1 is saturated and has a derivative near 0. Real networks have many saturated units, so the activation part shrinks more than one millionth. The bound also leaves out the weight matrices. Backpropagation multiplies by each layer's transposed weights, and weights with a norm above 1 can enlarge the gradient, while small weights shrink it more. A second cost: sigmoid outputs are always positive, so the gradients on a layer's weights share a sign and descent zigzags.

**What changes the arithmetic**

- Tanh has a derivative that peaks at 1.0, four times the sigmoid's, but it still falls toward 0 for large inputs, so deep tanh stacks vanish too, only more slowly.
- ReLU has a derivative of exactly 1 for positive inputs. The gradient passes through unchanged and the product does not shrink. This is the change that made deep networks trainable.
- GELU keeps a smooth gradient and avoids the dead unit failure of ReLU, which is why transformers use it.
- The lesson's own network scales its initial weights by the square root of 2 over the input count, to keep early sigmoid units out of saturation.

**How to see it in a run**

Log the mean absolute gradient per layer. In a healthy network the layers sit within a small factor of each other. In a vanishing network the first layer is orders of magnitude below the last.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is 0.25 an upper bound and not the typical value? Expected: the derivative is 0.25 only at an output of 0.5; saturated units near 0 or 1 have derivatives near 0, so the real shrink is worse.
- **Level 2:** How does tanh compare? Expected: its derivative peaks at 1.0, four times better, but it still falls toward 0 for large inputs, so deep tanh stacks vanish as well.
- **Level 3:** What does ReLU change in the calculation? Expected: the derivative is exactly 1 for positive inputs, so the gradient passes through unchanged and the product does not shrink.
- **Level 3:** How do you observe the problem without the formula? Expected: log the mean absolute gradient per layer; the first layers show values orders of magnitude below the last.

**Wrong answers, and why they fail**

- "The gradient vanishes because the learning rate is too small." A larger learning rate scales every layer; the ratio between the first and the last layers stays near one millionth.
- "Sigmoid outputs are between 0 and 1, so the gradient is between 0 and 1 and that is fine." The derivative, not the output, multiplies through the layers, and its maximum is 0.25.
- "Backpropagation is broken for deep networks." Backpropagation computes the exact gradient; the gradient itself is tiny because of what it passes through.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Read the shapes of a 2-3-1 network from its Layer class

*Level 2 (working) · code-reading · about 8 minutes*

This Layer class comes from a pure Python forward pass.

```python
class Layer:
    def __init__(self, n_inputs, n_neurons, weights=None, biases=None):
        if weights is not None:
            self.weights = weights
        else:
            self.weights = [
                [random.uniform(-1, 1) for _ in range(n_inputs)]
                for _ in range(n_neurons)
            ]
        self.biases = biases if biases is not None else [0.0] * n_neurons

    def forward(self, inputs):
        self.last_output = []
        for neuron_idx in range(len(self.weights)):
            z = sum(w * x for w, x in zip(self.weights[neuron_idx], inputs))
            z += self.biases[neuron_idx]
            self.last_output.append(sigmoid(z))
        return self.last_output
```

For a 2-3-1 network, give the shape of each weight matrix and bias. Then say what happens when someone builds the hidden layer as `Layer(n_inputs=3, n_neurons=2)` by mistake.

:::answer Show the answer
:::say Short answer
The hidden weights form a 3 by 2 matrix, one row per neuron and one column per input, with a bias of length 3; the output weights form a 1 by 3 matrix with a bias of length 1. The swapped call builds a 2 by 3 matrix: zip pairs each row's three weights with the two inputs and stops at the shorter one, the layer returns two values instead of three, and the output layer's zip truncates again. Nothing raises, and the network computes the wrong function.
:::

**Full answer**

**The rule and the table**

The weight matrix of a layer has shape (neurons in this layer, neurons in the previous layer). Rows match the current layer, columns match the previous one.

| Step | Operation | Shapes | Result |
|---|---|---|---|
| Input | x | | (2,) |
| Hidden linear | W1 x + b1 | W1 (3, 2), b1 (3,) | (3,) |
| Hidden activation | sigmoid | | (3,) |
| Output linear | W2 h + b2 | W2 (1, 3), b2 (1,) | (1,) |
| Output activation | sigmoid | | (1,) |

In the class, `len(self.weights)` is the neuron count and each row has `n_inputs` entries. The forward loop computes one dot product per row, adds that row's bias, and applies the sigmoid. The output of one layer is the input list of the next.

**What the swapped call does**

`Layer(n_inputs=3, n_neurons=2)` allocates two rows of three weights. The forward pass receives a two element input. Python's zip stops at the shorter sequence, so each row uses only its first two weights and the third is ignored. The layer returns two values. The output layer was built for three inputs, so its zip drops a weight too. No exception, no warning, and a model whose parameters are partly dead. A matrix library would raise on the inner size mismatch; this loop does not, which is why the lesson calls shape tracking the most important debugging skill in deep learning.

**Make it fail loudly**

Add an assertion in forward that the input length equals the number of columns, or let the Network class check that each layer's input count equals the previous layer's neuron count when it is built.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How many parameters does the 2-3-1 network have? Expected: nine in the hidden layer, six weights and three biases, and four in the output layer, three weights and one bias.
- **Level 2:** Why does the loop not raise on the swapped shapes? Expected: zip stops at the shorter sequence, so extra weights are ignored and no error occurs; a matrix library would raise on the mismatch.
- **Level 3:** Where do you put a check so the bug fails at once? Expected: an assertion in forward that the input length equals the column count, or a shape check between layers when the Network is built.
- **Level 3:** A text model has a hidden state 768 wide and its input is one token id. Does the rule still hold? Expected: yes; the embedding maps the token to a 768 vector, and each later matrix has rows equal to its own width and columns equal to the previous width.

**Wrong answers, and why they fail**

- "The weight matrix is inputs by neurons, so 2 by 3 for the hidden layer." In this class each row holds one neuron's weights across all inputs, so the matrix is neurons by inputs.
- "A wrong shape always raises an error." A library matmul raises; this loop with zip does not, and a framework can broadcast a wrong shape silently.
- "There is one bias per input." A bias belongs to a neuron, so there is one per output of the layer.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## Three lines that differentiate the cross-entropy loss

*Level 2 (working) · code-reading · about 8 minutes*

This function claims to return, for each logit, the derivative of the cross-entropy loss.

```python
def cce_gradient(logits, target_index):
    probs = softmax(logits)
    grads = list(probs)
    grads[target_index] -= 1.0
    return grads
```

Explain why three lines are enough. Then describe the gradient vector when the model is sure and right, and when it is sure and wrong.

:::answer Show the answer
:::say Short answer
For softmax followed by cross-entropy on a one-hot target, the derivative of the loss with respect to logit i is the predicted probability of class i minus the target for class i. The function copies the probabilities and subtracts 1 at the true class, which is that vector. When the model is confident and right, every entry is near zero. When it is confident and wrong, the entry at the true class is near minus 1 and the entry at the class it chose is near plus 1.
:::

**Full answer**

**Why the form is so simple**

The loss is minus the log of the probability of the true class, and that probability is exp of the true logit over the sum of exp of all logits. Differentiate with respect to logit i: the log of the denominator contributes plus p_i for every i, and the log of the numerator contributes minus 1 only for the true class. The softmax derivative on its own is a full matrix; combined with the log it collapses to p minus the one-hot target. The lesson's phrase is that softmax and cross-entropy are paired on purpose.

**Reading the vector**

- Confident right: p at the true class is near 1, so that entry is near 0, and every other p is near 0. Almost no update.
- Confident wrong: p at the true class is near 0, so that entry is near minus 1; the chosen class has p near 1 and an entry near plus 1. A large update that lowers the chosen logit and raises the true one.
- The entries sum to zero, because the probabilities sum to 1 and so does the one-hot target. That is a quick check for a hand-written version.

**What the three lines rely on**

The softmax call must be the stable one, with the largest logit subtracted before the exponential, or large logits give inf. A framework fuses log-softmax and the negative log-likelihood into one loss that takes logits, for the same reason; the lesson's rule is to call that fused loss rather than a softmax followed by a separate log.

**With label smoothing**

Replace the one-hot target by the smoothed vector: with alpha of 0.1 on ten classes the true class gets 0.91 and the others 0.01. The gradient is p minus that vector, so it reaches zero at 0.91, not at 1.0, which keeps the logits from running to infinity.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the gradient vector sum to? Expected: zero; the probabilities sum to 1 and the one-hot target sums to 1.
- **Level 2:** Why pair softmax with cross-entropy rather than with squared error? Expected: the log undoes the exponential, so the gradient is linear in the error and never flattens.
- **Level 3:** How does the gradient change with label smoothing of 0.1 on ten classes? Expected: the target becomes 0.91 at the true class and 0.01 elsewhere, so the gradient is p minus that vector and reaches zero at 0.91, not at 1.0.
- **Level 3:** A framework offers a loss on logits and a loss on log probabilities. Which do you call? Expected: the one on logits, which fuses log-softmax and the negative log-likelihood in one numerically stable step.

**Wrong answers, and why they fail**

- "The gradient is minus 1 over p at the true class, like binary cross-entropy." That is the derivative with respect to the probability; through the softmax, the derivative with respect to the logit is p minus the target.
- "Only the true class has a gradient, because only it appears in the loss." Every logit appears in the softmax denominator, so every logit receives its p as gradient.
- "Divide by the number of classes." The gradient per sample is p minus the target; averaging over a batch divides by the batch size, not the class count.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Weight decay in the loss or in the optimizer

*Level 2 (working) · tradeoff · about 8 minutes*

You want weight decay on a transformer trained with Adam. One engineer adds an L2 penalty on the weights to the loss. Another uses an AdamW optimizer with a weight decay argument. They say the two are the same thing. Are they, and which do you choose?

:::answer Show the answer
:::say Short answer
They are the same only under plain SGD. In Adam, a penalty inside the loss becomes part of the gradient and is divided by the running gradient size like every other term, so weights with large gradient variance get less decay and weights with small variance get more. AdamW subtracts lr times lambda times w after the adaptive update, so every weight shrinks by the same fraction. Choose AdamW; the lesson makes it the default for transformers for this reason.
:::

**Full answer**

**Where they agree**

The L2 term lambda over 2 times the sum of w squared has gradient lambda w. Under SGD the update subtracts lr times lambda w from each weight, which is weight decay by definition. Both names describe one operation.

**Where Adam breaks the equivalence**

Adam does not apply the gradient. It averages it into the first moment, squares it into the second, and divides by the root of the second moment. A penalty that rides along in the gradient is rescaled per parameter by that division. A weight with noisy, large gradients has a large second moment and receives a small share of the decay. A weight with quiet gradients receives a large share. The regularization is uneven, and the lesson reports that it converges to worse solutions than the decoupled form on almost every task.

**What AdamW does instead**

```text
w = w - lr * m_hat / (sqrt(v_hat) + eps) - lr * lambda * w
```

The decay term sits outside the adaptive factor. Every weight loses the same fraction lr times lambda at each step. In the lesson's from-scratch class this is one extra line after the Adam update: subtract lr times weight decay times the parameter.

**Values the lessons give**

- 0.01 for AdamW on transformers; the fine-tuning default is also 0.01.
- 1e-4 for SGD on CNNs, where the two forms coincide.
- Up to 0.1 for a model that overfits heavily.

**A test that shows the difference**

The lesson's exercise: initialize weights with large magnitudes, train Adam with L2 and AdamW with the same decay, and plot the weight norm over training. AdamW shrinks it faster and more evenly.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is the decay uniform in AdamW? Expected: it is applied to the weights directly, outside the adaptive division, so the fraction removed per step is lr times lambda for every weight.
- **Level 3:** Where exactly does the penalty go wrong inside Adam? Expected: it enters the gradient, so it is averaged into the first moment and squared into the second, and the division by the root of the second moment rescales it per parameter.
- **Level 3:** What decay values does the lesson give? Expected: 0.01 for AdamW on transformers, 1e-4 for SGD on CNNs, up to 0.1 for a heavily overfit model.
- **Level 4:** What experiment shows the difference in a few lines? Expected: start from weights of large magnitude, train both with the same decay, and plot the weight norm; AdamW shrinks it faster and more evenly.

**Wrong answers, and why they fail**

- "Weight decay and L2 are the same by definition." They coincide under SGD; under an adaptive optimizer the penalty is rescaled per parameter.
- "Use Adam with L2 and a bigger lambda to compensate." A bigger lambda does not fix the unevenness; some weights still receive almost no decay.
- "Adam adapts, so it does not need weight decay." Adaptation sets step sizes; it does not shrink weights. Overfit transformers still need decay.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## What Adam's bias correction does in the first steps

*Level 2 (working) · concept · about 8 minutes*

Adam keeps a running average of the gradient and a running average of its square, and divides each by one minus beta to the power t before the update. A teammate deletes those two divisions to simplify the code. What changes in the first steps of training, and when does the change stop mattering?

:::answer Show the answer
:::say Short answer
Both averages start at zero, so at step one the first moment is only (1 - beta1) times the gradient, a tenth of it with beta1 at 0.9, and the second moment is a thousandth of the squared gradient with beta2 at 0.999. The divisions rescale both to unbiased estimates. Without them the square root of the second moment is shrunk more than the first moment, so the ratio and the step come out too large while the averages warm up. The first moment's factor is close to 1 after about 50 steps, but the second moment's factor, 1 - 0.999 to the t, stays well below 1 for thousands of steps, so without the division the step stays too large for that long.
:::

**Full answer**

**The two averages**

```text
m = beta1 * m + (1 - beta1) * g        first moment, the mean gradient
v = beta2 * v + (1 - beta2) * g^2      second moment, the mean squared gradient
m_hat = m / (1 - beta1^t)
v_hat = v / (1 - beta2^t)
w = w - lr * m_hat / (sqrt(v_hat) + eps)
```

The first moment is momentum: with beta1 at 0.9 it averages about the last ten gradients, from 1 over (1 - 0.9). The second moment sets a per-parameter step size: a weight with large gradients is divided by a large number and moves less, a weight with small gradients moves more.

**Why the averages start wrong**

At step one, m is 0.1 times the gradient. The average has not warmed up, and the lesson calls that ten times too small. The same holds for v with a factor of 0.001. Dividing m by (1 - 0.9) at step one gives back the gradient. At step 100 the factor (1 - 0.9 to the 100) is about 1.0, so the correction is gone. The lesson's rule for the first moment: it matters for the first 10 steps or so and is irrelevant after 50. The second moment is slower. With beta2 at 0.999 its factor approaches 1 only after thousands of steps, so its correction lasts much longer.

**What the deletion does**

The two moments are shrunk by different factors, and the update takes their ratio after a square root. The first moment is shrunk by 0.1. The second moment is shrunk by 0.001, and its square root by less than 0.1, so the denominator is too small and the step is too large. The early updates take oversized steps on statistics built from one or two gradients. The symptom is a loss that jumps in the first steps and a run that sometimes diverges before it settles.

**What else guards the first steps**

Warmup, a small learning rate that ramps up over the first steps, protects the same period for a different reason: the correction fixes the scale of the averages, not their noise. The lesson's advice on tuning: change the learning rate first, then beta2, almost never beta1 or epsilon.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the first moment estimate and what does the second? Expected: the running mean of the gradient, which is momentum, and the running mean of the squared gradient, which sets a per-parameter step size.
- **Level 2:** With beta1 at 0.9, how many past gradients does the first moment roughly average? Expected: about ten, from 1 over (1 - 0.9).
- **Level 3:** Why does Adam still want a warmup if bias correction exists? Expected: the correction fixes the scale of the averages, not their noise; a few steps of statistics are a poor estimate, so a small early learning rate limits the damage.
- **Level 3:** Which Adam hyperparameter do you change first when training is unstable? Expected: the learning rate, then beta2; almost never beta1 or epsilon.

**Wrong answers, and why they fail**

- "The division is a numerical safety term like epsilon." Epsilon guards a zero denominator; the division by one minus beta to the t corrects the zero initialization of the averages.
- "Without it the first steps are too small, so training is only slower." The second moment's square root is shrunk more than the first moment, so the ratio and the step come out too large.
- "Both corrections stop mattering after about 50 steps." That holds for the first moment only. With beta2 at 0.999 the second moment's factor stays well below 1 for thousands of steps.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## Where the 2 in Kaiming initialization comes from

*Level 2 (working) · concept · about 8 minutes*

Xavier initialization sets the weight variance to 2 over the sum of fan in and fan out. Kaiming initialization sets it to 2 over fan in. Both are called variance preserving. Explain what each one preserves, where the 2 in Kaiming comes from, and what happens to a 50 layer ReLU network that starts from a plain standard normal.

:::answer Show the answer
:::say Short answer
A layer's pre-activation variance is fan in times the weight variance times the input variance, so a weight variance of 1 over fan in keeps the signal size constant through a linear layer. Xavier balances that condition between the forward and the backward pass, which gives 2 divided by the total of the two fan counts, and it suits sigmoid and tanh, which are near linear around zero. ReLU zeroes half of its inputs and halves the variance at each layer, so Kaiming doubles the variance of each weight to 2 over fan in to compensate. A standard normal with a fan in of 512 multiplies the variance by 512 at every layer, and the signal explodes within a few layers.
:::

**Full answer**

**Variance through one layer**

For z equal to the sum of w_i x_i over fan in terms with independent weights and inputs:

```text
Var(z) = fan_in * Var(w) * Var(x)
```

The lesson's two failures follow at once. With Var(w) equal to 1 and a fan in of 512, each layer multiplies the variance by 512, and after 10 layers the factor is 512 to the tenth, about 1.2 times 10 to the 27. With Var(w) equal to 0.001 the factor per layer is 0.512, and after 10 layers the signal is at 0.00013 of its size. The goal is Var(z) equal to Var(x).

**Xavier**

Glorot and Bengio asked for constant variance in both directions: forward through fan in, backward through fan out. The compromise is Var(w) equal to 2 over (fan in plus fan out), drawn as a normal with that variance or as a uniform with limit the square root of 6 over the same sum. It holds for sigmoid and tanh because, at a well scaled initialization, their inputs sit in the near linear region around zero.

**Kaiming**

ReLU sets every negative pre-activation to zero. On average half the units are off, so the variance that reaches the next layer is half of what the linear analysis predicts. He and colleagues doubled the weight variance to cancel that: Var(w) equal to 2 over fan in. Without the 2 the signal shrinks by about 0.5 per layer, and over 50 layers that is 0.5 to the 50, about 8.8 times 10 to the minus 16. GELU and Swish use the same rule. A framework's linear layer defaults to a Kaiming uniform draw, which is why shallow networks train with no thought given to it.

**The check**

Push random inputs through the untrained network and log the mean activation magnitude at each layer. The lesson's experiment prints it at layers 1, 5, 10, 25 and 50: a standard normal explodes, a normal with standard deviation 0.01 vanishes, and both Xavier with sigmoid and Kaiming with ReLU hold near 1.0 through layer 50.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does zero initialization fail even though its variance stays constant? Expected: every neuron computes the same function and receives the same gradient, so the layer has one effective neuron; random weights break the symmetry.
- **Level 3:** Which initialization goes with GELU? Expected: Kaiming, as for ReLU.
- **Level 3:** How do you verify an initialization without training? Expected: push random data through the network and log the mean activation magnitude per layer; it should stay in a band such as 0.5 to 2.0 at every depth.
- **Level 4:** Why do residual networks need a further scale beyond Kaiming? Expected: each residual addition adds variance, so the stream grows with the layer count; the GPT-2 scheme scales residual weights by 1 over the square root of 2N.

**Wrong answers, and why they fail**

- "Random is random, the scale does not matter if it is small." Too small vanishes and too large explodes; the lesson shows both, and the margin is thin at 50 layers.
- "Xavier works for ReLU too, the difference is minor." Xavier under-estimates the variance ReLU needs by a factor of 2, and over 50 layers the signal falls to about 8.8 times 10 to the minus 16.
- "Kaiming's 2 stands for the forward and backward passes." That 2 compensates for ReLU zeroing half the activations; Xavier's 2 is the one that balances the two passes.

:::

## Why the dropout mask holds 1 over (1 minus p)

*Level 2 (working) · code-reading · about 8 minutes*

This dropout module comes from a mini framework.

```python
class Dropout(Module):
    def __init__(self, p=0.5):
        super().__init__()
        self.p = p
        self.mask = None

    def forward(self, x):
        if not self.training:
            return x
        self.mask = [0.0 if random.random() < self.p else 1.0 / (1 - self.p) for _ in x]
        return [v * m for v, m in zip(x, self.mask)]

    def backward(self, grad):
        if self.mask is None:
            return grad
        return [g * m for g, m in zip(grad, self.mask)]
```

Why do the kept entries of the mask hold 1 over (1 minus p) rather than 1, and why does backward reuse the same mask? What would change if the forward kept 1 and the scaling moved to evaluation time?

:::answer Show the answer
:::say Short answer
Each unit is zeroed with probability p, so the expected value of a unit falls to (1 - p) times its original. Dividing the kept units by (1 - p) restores that expectation during training, so evaluation runs the plain network with no change. Backward multiplies by the same mask because the forward pass was a per-unit scale, and the derivative of a scale is the scale. Moving the factor to evaluation time also works, but then every inference path must know the dropout rate.
:::

**Full answer**

**The expectation argument**

A mask entry is 0 with probability p and 1 over (1 - p) otherwise. Its expected value is (1 - p) times 1 over (1 - p), which is 1. So the expected output of each unit in training equals its output with dropout off. The network sees the same scale in both modes, and the evaluation path has no dropout code at all. The lesson calls this inverted dropout. The original form kept the mask at 1 and multiplied by (1 - p) at test time, which forces inference code to know p.

**The backward pass**

Dropout is an element-wise scale by the mask. The gradient of the input is the gradient of the output times the same mask: dropped units get 0, kept units get the gradient scaled by 1 over (1 - p). The mask must be the one from the matching forward pass, because the backward pass differentiates the function that ran forward. A fresh mask would pass gradient to units that were off and scale units that were on. The guard on a missing mask covers only a backward call before any training forward. The evaluation branch returns before it changes the mask, so a backward call after an evaluation forward reuses the mask of the last training forward.

**What dropout buys**

Zeroing random units stops neurons from relying on specific other neurons being present, which the lesson calls co-adaptation. Each mask selects a subnetwork, so training samples from about 2 to the N subnetworks of N units, and evaluation averages them in one pass by running the full network at the scaled expectation. Default rates: 0.1 for transformers, 0.5 for MLPs, 0.2 to 0.3 for CNNs. Higher p is stronger regularization and more risk of underfitting.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What gradient does a dropped unit receive? Expected: zero, because its mask entry is 0.
- **Level 2:** Why must backward use the mask from the same forward pass? Expected: the backward pass differentiates the function that ran forward; a new mask would scale active units wrongly and pass gradient to inactive ones.
- **Level 3:** What is the ensemble reading of dropout? Expected: each mask defines a subnetwork, so training samples from about 2 to the N subnetworks, and evaluation averages them by running the full network at the scaled expectation.
- **Level 3:** Which rate does the lesson give for a transformer, and why is it lower than for an MLP? Expected: 0.1 against 0.5; a higher rate is stronger regularization with more underfitting risk, and the transformer default is the lighter one.

**Wrong answers, and why they fail**

- "The scale makes the outputs sum to one." It restores the expected value of each unit, not a sum.
- "Backward should draw a fresh mask for exploration." The backward pass differentiates the function that ran forward; a different mask gives the gradient of a different function.
- "In evaluation mode multiply by (1 - p) as well." With inverted dropout the scaling already happened in training; scaling again at evaluation shrinks every activation.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::
