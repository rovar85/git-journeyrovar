---
track: aibank
title: "AI interview bank: Coding (part 1 of 2)"
short: Coding 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## The scale factor in dot-product attention

*Level 1 (screening) · code-reading · about 6 minutes*

Here is an attention function from a take-home submission:

```python
def attention(Q, K, V):
    scores = Q @ K.T / Q.shape[-1]
    return softmax(scores) @ V
```

The tests for shape pass and the tests for the attention weights fail. Find the bug and explain what the correct factor protects against.

:::answer Show the answer
:::say Short answer
The scores are divided by the key dimension instead of its square root. Dot products of random vectors grow with the dimension, so without the square root the softmax input is either too large, which saturates it and kills the gradient, or too small, which flattens every row toward uniform. The correct line divides by the square root of the last dimension of the keys.
:::

**Full answer**

**The fix**

```python
def attention(Q, K, V):
    d_k = Q.shape[-1]
    scores = Q @ K.T / np.sqrt(d_k)
    return softmax(scores) @ V
```

**Why the square root**

When the entries of a query and a key have unit variance, their dot product has a variance equal to the dimension. Its typical size is therefore the square root of the dimension. Dividing by that size brings the scores back to unit scale, where the softmax has useful gradients. Dividing by the dimension itself over-corrects and makes every row close to uniform, so the output is almost the mean of the values regardless of the query.

**Two neighbors of this bug**

- No scale at all: at a head size of 64 the raw scores reach the tens and the softmax saturates to one hot rows.
- `K.T` on a batched tensor: `.T` reverses every axis, so a shape of batch by tokens by features becomes features by tokens by batch. With distinct sizes the matmul raises a shape error, and when the sizes happen to line up it mixes batches without an error. Swap only the last two axes.

**How the practice checks it**

The practice task compares the weights, not only the output shape. A wrong scale changes every weight, so a reference weight matrix catches it at once.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What is the shape of the scores for one sequence? Expected: tokens by tokens, one row per query over all keys.
- **Level 2:** Why do shape tests pass with the wrong factor? Expected: scaling does not change shapes; only the values move.
- **Level 2:** How do you transpose the keys for a batched input? Expected: swap the last two axes only, for example with `swapaxes(-1, -2)`.

**Wrong answers, and why they fail**

- "Any constant works, the model learns around it." The learned projections can compensate in training, but the practice checks a fixed reference, and in a trained model the wrong factor changes every head.
- "Divide by the sequence length." The growth comes from the feature dimension, not from the number of tokens.
- "Scaling is only for numerical overflow." The max shift inside softmax handles overflow; the scale keeps the softmax out of its saturated and flat regions.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## What temperature does to sampling

*Level 1 (screening) · concept · about 6 minutes*

Write the one line that applies a sampling temperature to a vector of logits, then tell me what happens to the distribution as the temperature goes toward zero, equals one, and goes above one.

:::answer Show the answer
:::say Short answer
Divide the logits by the temperature before the softmax. Near zero the division stretches the gaps between logits, so the largest one takes almost all the mass and sampling becomes greedy. At one the model's own distribution is used, and above one the gaps shrink, the distribution flattens, and rare tokens are drawn more often.
:::

**Full answer**

**The line**

```python
probs = softmax(logits / temperature)
```

The order matters in a full sampler: the generation loop reads the final position's logits, divides by the temperature, applies any top-k or top-p filter, takes the softmax, and draws one token.

**Three regimes**

| Temperature | Effect on the gaps between logits | Behavior |
|---|---|---|
| Toward zero | Gaps grow without bound | Argmax; the same token every time |
| Equal to one | Unchanged | The model's natural distribution |
| Above one | Gaps shrink | Flatter distribution, more surprise, more errors |

**Why division and not multiplication**

Multiplying the logits by the temperature does the opposite of what people expect: a higher value sharpens the distribution. The practice lab has a mutant that makes this mistake, and the sign of the effect is the first thing its tests check.

**Reading the effect**

Two measurements show what a temperature did: the probability of the top token, and the entropy of the distribution. As the temperature rises the top probability falls and the entropy rises. A sweep over temperatures on fixed logits makes both curves visible without a model in the loop.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does temperature zero need a special case in code? Expected: division by zero; implement it as argmax rather than dividing.
- **Level 2:** A product wants deterministic output. Is temperature zero enough? Expected: it removes sampling randomness, but ties and numeric differences across batches can still change the argmax.
- **Level 2:** How does temperature interact with a top-p cutoff? Expected: the cutoff must run on the temperature-scaled probabilities, otherwise it cuts the distribution at temperature one and the setting does less than expected.

**Wrong answers, and why they fail**

- "Temperature scales the probabilities after the softmax." Scaling probabilities and renormalizing changes nothing; the division happens on the logits.
- "A higher temperature makes the model smarter." It only flattens the distribution, which trades repetition for more mistakes.
- "Temperature one means no sampling." It means sampling from the unchanged distribution; greedy is temperature zero or argmax.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## Why softmax subtracts the row maximum first

*Level 1 (screening) · code-reading · about 6 minutes*

A candidate writes this softmax for a batch of logits and the tests pass on small inputs but return NaN on a real attention row:

```python
def softmax(x):
    e = np.exp(x)
    return e / e.sum(axis=-1, keepdims=True)
```

What is wrong, how do you fix it, and why does the fix not change the result?

:::answer Show the answer
:::say Short answer
A large logit overflows the exponential to infinity, and infinity divided by infinity is NaN. Subtract the maximum of each row before the exponential. The softmax of a row is unchanged when the same constant is subtracted from every entry, because the constant cancels between the numerator and the denominator.
:::

**Full answer**

**The failure**

Attention scores and language model logits can reach values in the tens or hundreds. The exponential of such a value does not fit in a float, so the row becomes infinite and the division gives NaN. Small test inputs never show it.

**The fix**

```python
def softmax(x):
    shifted = x - np.max(x, axis=-1, keepdims=True)
    e = np.exp(shifted)
    return e / e.sum(axis=-1, keepdims=True)
```

After the shift the largest entry of each row is zero, so the largest exponential is one and nothing overflows. Entries far below the maximum underflow to zero, which is the correct limit.

**Why the result is the same**

Softmax of a row divides each exponential by the sum of all exponentials in that row. Subtracting a constant multiplies every exponential by the same factor, and that factor cancels in the ratio. The shift must be per row, over the last axis. A single maximum taken across the entire batch changes nothing about correctness but lets one hot row push every other row into underflow.

**Two more details that bite**

- Keep the dimension with `keepdims=True` so the subtraction broadcasts along the row and not along the batch.
- Do not subtract in place when the caller still needs the logits.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Where does this same shift appear inside attention? Expected: in the softmax over the scaled scores, which is why the attention lesson writes the shifted version first.
- **Level 2:** Why is a global maximum over the whole batch a bug? Expected: one row with a very large logit shifts every other row far below zero, so those rows underflow to all zeros and divide by zero.
- **Level 2:** The practice task also asks for the gradient of the mean cross-entropy. What is it? Expected: the softmax minus the one-hot target, divided by the batch size.

**Wrong answers, and why they fail**

- "Clip the logits to a safe range." Clipping changes the distribution; the shift does not.
- "Use float64 and the problem goes away." It moves the threshold, and attention scores still overflow in long rows.
- "Subtract the mean instead of the maximum." The mean does not bound the largest entry, so a row can still overflow.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## A causal mask that blocks the token itself

*Level 2 (working) · code-reading · about 8 minutes*

A decoder's attention returns a zero vector in the first row of every sequence. The mask code is:

```python
def causal_mask(T):
    return np.triu(np.ones((T, T), dtype=bool), k=0)

weights = softmax(scores)
weights[mask] = 0
out = weights @ V
```

Two things are wrong. Find both and explain what each one does to the output.

:::answer Show the answer
:::say Short answer
The mask uses a diagonal offset of zero, so every token blocks itself and the first token has no allowed key, which leaves an empty row. The mask is also applied after the softmax, so the rows no longer sum to one. Build the mask with an offset of one, and set the blocked scores to a very negative value before the softmax.
:::

**Full answer**

**Bug one: the diagonal**

A causal mask lets position `i` see positions zero through `i`, itself included. `np.triu` with `k=0` keeps the diagonal in the blocked set. For the first query every key is blocked, so this code sets the whole first row of weights to zero and the first output row is zero. If you only move the mask before the softmax and fill with negative infinity, that row has nothing to normalize and the division produces NaN. Use `k=1` so the diagonal stays visible.

**Bug two: masking after the softmax**

Setting weights to zero after normalization leaves each row summing to less than one, by exactly the mass that the future keys received. The output then shrinks and the model trains against a moving scale. The mask must act on the scores before the softmax, by setting blocked entries to a very negative value, so that their exponentials are zero and the remaining entries renormalize.

**The corrected code**

```python
def causal_mask(T):
    return np.triu(np.ones((T, T), dtype=bool), k=1)

scores = np.where(mask, -1e9, scores)
weights = softmax(scores)
out = weights @ V
```

**Why both bugs can pass a shape test**

Neither bug changes a shape. Only a check of the weights, or a check that the first output row is not zero, exposes them. The practice task checks the causal weights against a reference and includes the first row.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why a very negative number and not negative infinity? Expected: infinity works in most frameworks, but a fully masked row then produces NaN, while a finite value keeps the arithmetic defined.
- **Level 2:** How does the mask interact with the batch dimension? Expected: the mask is tokens by tokens and broadcasts across batches and heads; it is built once per sequence length.
- **Level 3:** The same model is used for prefill and then one token at a time. Does the mask change? Expected: at decode time the single query sees every cached key, so no mask is needed for that step; the causal rule was already applied when those keys were produced.
- **Level 3:** A padding mask and a causal mask must both apply. How do you combine them? Expected: combine the boolean masks with a logical or before the scores are masked, so a padded key is blocked for every query.

**Wrong answers, and why they fail**

- "Set the blocked weights to zero and renormalize the rows." It works numerically but doubles the work; masking the scores before the softmax does the renormalization for free.
- "The first token should attend to nothing." The first token must attend to itself; an empty row has no valid distribution.
- "Use a lower-triangular ones matrix as the mask." A ones matrix marks the allowed entries, so it must be inverted before it is used as a blocked-entry mask.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## A merge that lets two matches share a symbol

*Level 2 (working) · code-reading · about 8 minutes*

This function rewrites one word after a BPE merge was chosen. On the word `(7, 7, 7)` with the pair `(7, 7)` it returns `(300, 300, 7)`. Find the bug and give the correct output.

```python
def apply_merge(symbols, pair, new_id):
    out = []
    i = 0
    while i < len(symbols):
        if i + 1 < len(symbols) and symbols[i] == pair[0] and symbols[i + 1] == pair[1]:
            out.append(new_id)
            i += 1
        else:
            out.append(symbols[i])
            i += 1
    return tuple(out)
```

:::answer Show the answer
:::say Short answer
After a match the scan moves one position instead of two, so the second symbol of the match is read again: it starts the next match or is copied to the output. Matches must not share a symbol. The correct result is `(300, 7)`: the first two sevens become one new id and the third seven stays.
:::

**Full answer**

**What the bug does**

With a step of one after a match, the scan sees the pair at positions zero and one, emits the new id, and then looks at positions one and two, which also match. The word gains a symbol it never had, so the merged corpus is wrong and every later step counts pairs on corrupted words. Encoding at inference reuses the same function, so every text with a repeated symbol decodes to different bytes than it was given.

**The fix**

```python
        if i + 1 < len(symbols) and symbols[i] == pair[0] and symbols[i + 1] == pair[1]:
            out.append(new_id)
            i += 2
```

Scan from left to right and continue after the second symbol of the match. The merge loop in the tokenizers chapter is exactly this, and the practice task has a mutant for the single step that fails on `[a, a, a]`.

**Why the left-to-right rule matters**

Non-overlapping replacement from the left is a convention, and the training loop and the encoder must share it. If training merged from the left and the encoder merged from the right, the same word would get different ids in training and at inference. The merge table only works when both sides apply it the same way.

**A related check**

The function returns a new tuple. It must not write into the caller's sequence, because the training loop still holds the old corpus while it builds the new one.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the same bug do to the pair counts of the next training step? Expected: it counts pairs that do not exist in the real corpus, so later merges are chosen on wrong numbers.
- **Level 2:** Give an input where the bug produces a correct answer. Expected: only a word with no match for the pair, such as `(7, 8, 7)` with `(7, 7)`; every match leaves an extra copy of its second symbol.
- **Level 3:** How does a round-trip test catch this bug? Expected: encode a string with a repeated byte, decode the ids, and compare the bytes; the extra merged symbol expands to more bytes than the input had.

**Wrong answers, and why they fail**

- "Replace the pair with a string method on the joined symbols." Ids are integers, not characters, and joining them hides the boundaries between ids.
- "Match from the right instead." Either direction works alone, but training and inference must use the same one; left-to-right is the convention.
- "Return a list instead of a tuple to make it faster." The words are dictionary keys and must stay hashable.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## A training loss that reaches zero and learns nothing

*Level 2 (working) · code-reading · about 8 minutes*

A colleague reports that their language model reaches a loss near zero very early in training, and the generated samples are garbage. The batch code is:

```python
def calc_loss_batch(model, tokens):
    logits = model(tokens)
    return cross_entropy(logits.reshape(-1, logits.shape[-1]), tokens.reshape(-1))
```

What went wrong, and what does the correct version look like?

:::answer Show the answer
:::say Short answer
The targets are the inputs, so the model learns to predict the token it was just given, which is trivial and converges to zero loss while learning nothing. The target at position `t` must be the input at position `t + 1`. Slice the inputs to drop the last token and the targets to drop the first, then flatten both to batch times time by vocabulary and batch times time.
:::

**Full answer**

**The alignment**

For input tokens `t0, t1, t2, t3` the targets are `t1, t2, t3, t4`. Every position predicts the next token, which is why one training example covers the context length plus one raw id. The batch maker produces the two tensors already shifted, or the loss function shifts them:

```python
def calc_loss_batch(model, inputs, targets):
    logits = model(inputs)
    V = logits.shape[-1]
    return cross_entropy(logits.reshape(-1, V), targets.reshape(-1))
```

with `inputs = window[:-1]` and `targets = window[1:]`.

**Why the flatten**

Cross-entropy takes a matrix of rows by classes and a vector of class ids. Flattening batch and time into one axis turns the three-dimensional logits into that matrix and the two-dimensional targets into that vector, and the mean over rows is the mean over every predicted position. Flattening is not the bug; the missing shift is.

**Why the symptom is a near-zero loss**

Predicting the current token from the current token needs only an identity through the embedding and the output head, which a tied head gives for free. The loss collapses, the eval loss collapses too, and only the qualitative sample shows that nothing was learned. That is why the training loop prints a generated continuation at every probe step and not only the two losses.

**The numeric side**

The practice task also checks that the cross-entropy is computed from a shifted softmax, so that large logits do not overflow, and that the loss is the mean over examples rather than the sum.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which signal in the training loop catches this bug first? Expected: the generated sample at the probe step; both losses look excellent.
- **Level 2:** The validation loss is also near zero. Why does held-out data not catch it? Expected: the target leak is in the loss definition, which is the same on both splits.
- **Level 3:** How does the sliding-window dataset avoid this at the source? Expected: it returns a window of context length plus one and splits it into input and target in the dataset itself, so the loop never sees unshifted pairs.
- **Level 3:** Your supervised fine-tuning data masks the instruction tokens. Where does the mask go relative to the shift? Expected: after the shift, so the ignored positions line up with the shifted targets.

**Wrong answers, and why they fail**

- "The learning rate is too high." A high learning rate diverges or oscillates; a collapse to zero loss points at a leak in the objective.
- "Flattening mixes the batch and time axes." The flatten is required; the rows are independent predictions and their order does not matter to the mean.
- "The model overfits the training set." Overfitting shows a gap between training and validation loss; here both collapse.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## Dropout that still acts during evaluation

*Level 2 (working) · code-reading · about 8 minutes*

Two evaluation runs on the same checkpoint and the same fixed validation batches report different losses. The dropout layer is:

```python
def dropout_forward(x, p, rng, training):
    mask = rng.random(x.shape) >= p
    if training:
        return x * mask / (1 - p), mask
    return x * (1 - p), mask
```

Find every problem with the inference path and explain what the evaluation function expects.

:::answer Show the answer
:::say Short answer
Inverted dropout scales the kept units during training so that inference is the identity, but this inference path multiplies the input by one minus p, which belongs to the non-inverted form and shrinks every activation. It also draws from the generator in inference mode, which changes every later random number in the run, such as the next training mask and the next probe sample. Inference must return the input unchanged and must not touch the generator.
:::

**Full answer**

**The two bugs**

1. Scaling at inference. With inverted dropout the division by one minus p happens in training, so the expected activation already matches the no-dropout value. Scaling again at inference halves the signal at a rate of one half and damages every layer that follows.
2. Drawing at inference. The mask is sampled before the branch. Evaluation consumes random numbers, so the generation sample after the probe, and any later training step, sees a different stream than a run without the probe.

**The fix**

```python
def dropout_forward(x, p, rng, training):
    if not training:
        return x.copy(), np.ones(x.shape, dtype=bool)
    mask = rng.random(x.shape) >= p
    return x * mask / (1 - p), mask
```

At inference the layer returns a copy of the input and a mask that is true everywhere, and it does not draw. Keep an entry when the random number is at or above p, so the complement rule is right, and divide the kept entries by one minus p. The backward pass multiplies the incoming gradient by the same mask and divides by the same factor.

**What evaluation expects**

The training loop's evaluation function runs a fixed number of validation batches with no gradient and no dropout, and the number must be reproducible across runs given the same seed and split. Any randomness inside the model during that pass breaks the comparison between two runs, because the difference measures the random stream rather than the model. The assembly lesson's model has an embedding dropout of 0.1, so this layer sits in the path of every evaluation.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why divide by one minus p during training at all? Expected: so the expected value of each activation is the same with and without the mask, which makes inference the identity.
- **Level 2:** Why must the backward pass use the same mask? Expected: the gradient must flow only through the units that were kept, with the same scale, otherwise the gradient does not match the forward computation.
- **Level 3:** The evaluation is reproducible but still differs from a run that skipped the probe. What else draws? Expected: the sampled generation at the probe step consumes draws from the shared generator; give the probe its own generator.

**Wrong answers, and why they fail**

- "Scale down at inference as the original dropout paper did." That form skips the scaling in training; mixing the two forms shrinks the activations.
- "Re-seed the generator before every evaluation." It hides the extra draws but still changes the training stream afterwards; the inference path should not draw at all.
- "Keep an entry when the random number is below p." That keeps a fraction p and drops the rest, the complement of the intended mask.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## Split heads with the right shape and the wrong numbers

*Level 2 (working) · code-reading · about 8 minutes*

A submission splits a tensor of shape batch, tokens, features into heads with one call:

```python
def split_heads(x, n_heads):
    B, T, D = x.shape
    return x.reshape(B, n_heads, T, D // n_heads)
```

The shape test passes and every attention test fails. Explain what the function actually did to the data and write the correct version.

:::answer Show the answer
:::say Short answer
The reshape alone reinterprets memory. It keeps the bytes in order and relabels them, so the head axis cuts across tokens and features instead of slicing the feature axis. The correct split reshapes to batch, tokens, heads, head size and then transposes the token and head axes, so that head `h` holds a contiguous block of `d_head` neighbor columns for every token.
:::

**Full answer**

**What the bug does**

Row-major memory lists features of token zero, then features of token one, and so on. Reshaping straight to batch, heads, tokens, head size slices that flat list into equal pieces. The first "head" then holds the first `T` times `d_head` numbers, which are the complete feature vectors of the first few tokens, not a slice of every token. Shapes agree. Numbers are scrambled.

**The fix**

```python
def split_heads(x, n_heads):
    B, T, D = x.shape
    if D % n_heads:
        raise ValueError("features must divide into heads")
    d_head = D // n_heads
    return x.reshape(B, T, n_heads, d_head).transpose(0, 2, 1, 3)


def merge_heads(x):
    B, H, T, d_head = x.shape
    return x.transpose(0, 2, 1, 3).reshape(B, T, H * d_head)
```

Reshape to batch, tokens, heads, head size first, which only splits the last axis. Then transpose so the head axis comes before the token axis. The merge is the same two operations in reverse. One reshape and one transpose, no loop; that is also what the framework version does under the hood.

**The strided variant of the bug**

A second wrong version gives head `h` the columns `h`, `h + H`, `h + 2H` and so on. That slices the feature axis, so the per-head attention runs, but it does not match the convention that a head owns one contiguous block of columns, and a checkpoint trained with the standard layout no longer loads into it.

**How to test it**

`merge_heads(split_heads(x, H))` must return `x` exactly, and `split_heads(x, H)[b, h, t, j]` must equal `x[b, t, h * d_head + j]`. The second check is the one that fails for both wrong versions.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the round-trip test catch the plain reshape bug? Expected: `merge_heads` transposes the head and token axes before it reshapes, so it does not undo a plain reshape and the features come back in a different order; only a merge written as a plain reshape would hide the bug.
- **Level 2:** What does the scale factor become after the split? Expected: the square root of the head size, not of the full feature dimension.
- **Level 3:** After the split, how does attention run for all heads at once? Expected: as one batched matmul over the leading batch and head axes, so adding heads costs no extra kernel launches.

**Wrong answers, and why they fail**

- "Reshape is the same as transpose for equal sizes." Reshape relabels memory in place; transpose reorders it.
- "Any split works as long as merge undoes it." The attention tests and any loaded checkpoint depend on each head owning one block of neighbor columns.
- "Loop over heads and slice columns." It is correct but slow; the reshape and transpose give the same result in two operations.

:::

## Swap the learned position table for a fixed one

*Level 2 (working) · take-home · about 20 minutes*

The reference small GPT configuration uses a learned position embedding of shape 1024 by 768. Replace it with a sinusoidal table computed at construction time, add it to a batch of token embeddings, and tell me by how much the parameter count changes and why the model still forwards.

:::answer Show the answer
:::say Short answer
Build a table with one row per position and one column per feature, where column `2i` holds the sine and column `2i + 1` holds the cosine of the position divided by the base raised to `2i` over the model width. Register it as a buffer, slice the first `T` rows at each forward and add them to the token embeddings without changing the caller's array. The table has the same shape as the learned one, so the forward pass is unchanged, and the count drops by 786,432 parameters because the table is no longer learned.
:::

**Full answer**

**The table**

```python
def sinusoidal_pe(max_len, d_model, base):
    pos = np.arange(max_len)[:, None]
    end = 2 * (d_model // 2)
    i = np.arange(0, end, 2)
    angle = pos / base ** (i / d_model)
    pe = np.zeros((max_len, d_model))
    pe[:, 0:end:2] = np.sin(angle)
    pe[:, 1:end:2] = np.cos(angle)
    return pe


class SinusoidalPositions(nn.Module):
    def __init__(self, max_len, d_model, base):
        super().__init__()
        table = torch.as_tensor(sinusoidal_pe(max_len, d_model, base)).float()
        self.register_buffer("pe", table)

    def forward(self, x):
        return x + self.pe[: x.shape[1]]
```

The exponent is `2i` over the width, so the frequencies fall from one down to one over the base across the columns. The columns alternate between sine and cosine; putting all sines in the first half and all cosines in the second is a different layout and does not match the reference. Positions start at zero. An odd width has no pair for its last column, so that column stays zero. The table is built once with numpy and stored as a torch buffer, so it moves to the device of the model and the add sees two tensors on the same device.

**Why the forward pass is unchanged**

The assembly adds a position vector to each token vector before the first block. Nothing downstream knows whether that vector came from a learned table or a fixed one. The shape contract is the same, so the blocks, the final LayerNorm and the tied head run unchanged.

**The parameter count**

The learned table holds 1024 rows of 768 values each. Removing it from the parameter list drops the unique parameter count by 786,432. The parameter counter must count unique tensors, so that the tied language model head is not counted twice, and it must not count buffers.

**Two mistakes to avoid**

- Adding the table in place with `+=` changes the caller's embeddings, which the training loop still holds.
- Dividing the exponent by the width of the even part instead of the full width gives an odd width the frequencies of a narrower model.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why interleave sine and cosine rather than put them in two halves? Expected: a checkpoint trained with the interleaved layout expects each pair of neighbor columns to form one rotation, and the two layouts are not interchangeable.
- **Level 2:** What does the base control? Expected: the lowest frequency, and so the longest position range before the slowest columns repeat.
- **Level 3:** Which position scheme does the assembly lesson say turns this model into the next model family? Expected: a rotary scheme applied inside attention replaces the additive table and leaves the block and the head unchanged.
- **Level 3:** A fixed table has no parameters; what does the model lose? Expected: the ability to learn position features from data, in exchange for a table that extends to any length at construction.

**Wrong answers, and why they fail**

- "Register the table as a parameter so the optimizer can refine it." Then it is a learned table again and the count does not drop.
- "Start positions at one so the first row is not all zeros and ones." The reference starts at zero; row zero is the code of position zero.
- "Use the same exponent for sine and cosine columns but a different base." Both columns of a pair share one angle; only the function differs.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Train a BPE merge list from word counts

*Level 2 (working) · take-home · about 30 minutes*

You get a corpus as a dictionary from words, each a tuple of byte ids, to the number of times the word occurs. Write the training loop that produces an ordered list of merges, and state the three rules that make the loop deterministic. Then tell me what the loop must not do to the caller's data.

:::answer Show the answer
:::say Short answer
Each step counts every adjacent pair inside each word, weighted by the word frequency, picks the pair with the highest count, rewrites every occurrence of that pair into one new id, and records the merge. The three rules are: pairs never cross a word boundary, ties go to the smallest pair in tuple order, and the loop stops when no pair repeats. The input dictionary and its tuples are never changed; the loop builds a new corpus each step.
:::

**Full answer**

**The loop**

```python
def train(units, num_merges, first_id=256):
    merges = []
    units = dict(units)
    for i in range(num_merges):
        pairs = count_pairs(units)
        best = best_pair(pairs)
        if best is None or pairs[best] < 2:
            break
        new_id = first_id + i
        units = {apply_merge(word, best, new_id): freq for word, freq in units.items()}
        merges.append((best, new_id))
    return merges, units
```

The first ids are reserved for the raw bytes, so the first merge gets the next free id and each later merge gets the next one. The merge list in training order is the tokenizer. Encoding fresh text applies the same merges in the same order, so a change of order at inference decodes a different stream of ids.

**Weighted counts**

A pair inside a word that occurs five times adds five to the count, not one. Counting each occurrence once makes rare long words outvote common short ones, and the merge order changes. Pairs do not cross from the end of one word to the start of the next; the word split is what keeps merges inside words and lets them generalize.

**Ties and the stop rule**

Two pairs with the same count must resolve the same way on every run, so the smallest pair in tuple order wins. Without a fixed rule, dictionary order decides and two training runs on the same corpus produce different tokenizers. The loop stops early when the best count is below two, because a pair that occurs once does not compress anything and only spends vocabulary slots.

**Do not change the input**

The caller's dictionary and tuples stay as they were. Clearing and refilling the dictionary in place, or rewriting tuples through a list, changes data the caller may still use. Each step builds a new dictionary from the merged words.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the symbol count fall as training proceeds, and what does that do to the cost of a step? Expected: each merge shortens words, so the pair count over the corpus shrinks and later steps are cheaper.
- **Level 2:** What does the tie rule protect? Expected: reproducibility; the same corpus must give the same merge list on every machine.
- **Level 3:** Two words merge into the same tuple after a step. What must the new dictionary do? Expected: add their frequencies together instead of keeping only the last one.
- **Level 3:** How does the vocabulary size relate to the number of merges? Expected: the base byte block plus one id per merge, plus any reserved special ids.

**Wrong answers, and why they fail**

- "Count each pair once per word." Frequency weighting is what makes common pairs win early.
- "Take the first pair with the maximum count." Dictionary order is not stable across inputs, so the tokenizer becomes irreproducible.
- "Keep merging until the budget is spent." A pair that appears once gains nothing and wastes vocabulary.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Weight decay that went into the gradient

*Level 2 (working) · code-reading · about 10 minutes*

A hand-written optimizer step is labeled AdamW. Review it:

```python
def adam_step(params, grad, m, v, t, lr, beta1, beta2, eps, weight_decay):
    grad = grad + weight_decay * params
    m = beta1 * m + (1 - beta1) * grad
    v = beta2 * v + (1 - beta2) * grad * grad
    m_hat = m / (1 - beta1 ** t)
    v_hat = v / (1 - beta2 ** t)
    return params - lr * m_hat / (np.sqrt(v_hat) + eps), m, v
```

Is this AdamW? What changes, and why does it matter for a language model?

:::answer Show the answer
:::say Short answer
No, this is Adam with an L2 penalty folded into the gradient. AdamW applies the decay directly to the parameters, scaled by the learning rate, outside the adaptive step. When the penalty goes through the gradient it is divided by the second-moment estimate, so parameters with large gradients get almost no decay and the regularization becomes uneven across the model.
:::

**Full answer**

**The corrected step**

```python
def adam_step(params, grad, m, v, t, lr, beta1, beta2, eps, weight_decay):
    m = beta1 * m + (1 - beta1) * grad
    v = beta2 * v + (1 - beta2) * grad * grad
    m_hat = m / (1 - beta1 ** t)
    v_hat = v / (1 - beta2 ** t)
    new = params - lr * (m_hat / (np.sqrt(v_hat) + eps) + weight_decay * params)
    return new, m, v
```

The decay term is added to the update, not to the gradient. It never passes through the moment estimates.

**What the difference changes**

Adam normalizes every coordinate by its running gradient magnitude. A penalty that enters as part of the gradient is normalized too, so a weight with a large, noisy gradient is barely decayed while a weight with a tiny gradient is decayed hard. Decoupled decay shrinks every weight by the same fraction per step, which is what the regularizer was meant to do. Language model recipes use the decoupled form, and the loop in the training lesson builds its parameter groups around it.

**Three more details the practice pins**

- The step counter starts at one. With `t = 0` the bias correction divides by zero, and with `t + 1` the first step acts as the second.
- Epsilon sits outside the square root. Inside it, tiny gradients give a much smaller step than intended.
- The function returns new state arrays. Updating `m` and `v` in place changes the caller's state and breaks checkpoint resume.

**Where the decay should not go**

Even with the correct form, the decay belongs on matrix-shaped weights only. Normalization scales and biases get no decay, which is the subject of the parameter group split.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the bias correction fix in the first steps? Expected: the moment estimates start at zero and are biased low early; dividing by `1 - beta**t` rescales them.
- **Level 2:** Why return new arrays instead of updating in place? Expected: a pure function keeps the caller's state intact, so a step can be retried or compared and a checkpoint stays consistent.
- **Level 3:** How does the learning rate schedule interact with decoupled decay? Expected: the decay is multiplied by the current learning rate, so warmup and cosine decay also scale the regularization over training.

**Wrong answers, and why they fail**

- "L2 and weight decay are the same thing." They coincide for plain gradient descent, not for an adaptive optimizer that normalizes the gradient.
- "Put epsilon inside the square root for stability." It changes the step size for small gradients; the reference form adds it after the root.
- "Start the step counter at zero like an index." The bias correction then divides by zero on the first step.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Write the sampling step of a generation loop

*Level 2 (working) · take-home · about 20 minutes*

Given the logits of the last position, a temperature, a value of k and a seeded random generator, write the function that draws the next token. State the order of the operations, how ties are broken, and how the draw uses exactly one random number.

:::answer Show the answer
:::say Short answer
Divide the logits by the temperature, keep the k largest and set the rest to negative infinity, take the softmax, and draw one index from the result. Ties keep the lower index. The draw calls the generator once, takes the cumulative sum of the probabilities in vocabulary order, and returns the first index whose cumulative value exceeds the random number.
:::

**Full answer**

**The code**

```python
def top_k_filter(logits, k):
    if k >= logits.shape[0]:
        return logits.copy()
    order = np.argsort(-logits, kind="stable")
    keep = order[:k]
    out = np.full_like(logits, -np.inf)
    out[keep] = logits[keep]
    return out


def sample(logits, rng, temperature=1, top_k=None):
    z = logits / temperature
    if top_k is not None:
        z = top_k_filter(z, top_k)
    probs = softmax(z)
    u = rng.random()
    c = np.cumsum(probs)
    hits = np.nonzero(u < c)[0]
    if hits.size:
        return int(hits[0])
    return int(np.nonzero(probs > 0)[0][-1])
```

**The order**

Temperature first, then the filter, then the softmax. The filter has to see the scaled logits, because the scale changes which tokens hold the mass when a top-p cutoff is added later. The softmax runs last so that a removed token has probability exactly zero and the kept ones renormalize.

**Ties**

Sorting the negated logits with a stable sort keeps the lower index first among equal values. Sorting ascending and reversing the result flips that, so the higher index wins and the output differs from the reference on every tie.

**One random number**

A seeded generator gives reproducible samples only if every call consumes the same number of draws. The function reads one uniform number, compares it with the cumulative sum, and returns the first crossing. Rounding can leave the last cumulative value a hair below one, so the fallback returns the last token with positive probability instead of failing.

**Do not change the input**

The filter writes into a new array. Writing negative infinity into the caller's logits destroys the values that the next step, or a log, still needs.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does top-k one produce? Expected: greedy decoding, the argmax every time.
- **Level 2:** Why must the filter run before the softmax and not after? Expected: zeroing probabilities after the softmax leaves a distribution that does not sum to one unless it is renormalized; masking the logits does that for free.
- **Level 3:** The assembly lesson keeps the context inside a fixed length during generation. How? Expected: when the prompt plus generated tokens exceed the context length, the oldest tokens are dropped so the active window fits.
- **Level 3:** How do you make two runs with one seed produce the same text? Expected: the same generator, one draw per step, the same tie rule and the same temperature; any extra draw shifts every later token.

**Wrong answers, and why they fail**

- "Call the generator's choice function with the probabilities." It works, but it consumes draws differently across versions and breaks the one-draw contract that the tests pin.
- "Apply the temperature after the filter." The filter then selects tokens at temperature one and the setting changes less than intended.
- "Sort descending by reversing an ascending sort." Equal logits then keep the higher index, which contradicts the tie rule.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::
