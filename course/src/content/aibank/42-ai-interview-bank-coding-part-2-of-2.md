---
track: aibank
title: "AI interview bank: Coding (part 2 of 2)"
short: Coding 2
sub: 10 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A KV cache that loses its last slot

*Level 3 (senior) · code-reading · about 10 minutes*

A decode loop keeps keys and values in a preallocated cache and attends one query over the stored prefix. Generation always stops one token short of the configured context length, and the first tokens of a long prompt attend to extra zero rows. The cache code is:

```python
class KVCache:
    def __init__(self, max_len, d_k, d_v):
        self.k = np.zeros((max_len, d_k))
        self.v = np.zeros((max_len, d_v))
        self.n = 0

    def append(self, k, v):
        k = np.atleast_2d(k)
        v = np.atleast_2d(v)
        self.n += k.shape[0]
        if self.n >= self.k.shape[0]:
            raise ValueError("cache full")
        self.k[self.n - k.shape[0]:self.n] = k
        self.v[self.n - k.shape[0]:self.n] = v

    def keys(self):
        return self.k
```

Explain the two symptoms from the code and fix them.

:::answer Show the answer
:::say Short answer
The capacity test rejects an append that ends exactly at the capacity, so the last slot is never used and generation stops one token early. The counter is also updated before the test, so a refused append leaves the length wrong. The accessor returns the whole buffer rather than the filled prefix, so attention sees the empty zero rows. Check that the length plus the new steps does not exceed the capacity before touching the counter, and return views of the first `n` rows.
:::

**Full answer**

**Defect one: the boundary**

An append that fills the cache to its capacity is valid. The test must refuse only when the new length would exceed the capacity. With the strict comparison the last row is dead, and a generation loop that sizes the cache from the context length stops one token short.

**Defect two: the counter**

Adding to the length before the check means a failed append leaves the cache claiming steps it never stored. The next call then writes past the real data or refuses a valid append. The rule from the practice is that a refused append changes nothing.

**Defect three: the view**

`keys()` returns every row of the buffer, filled or not. The query then attends over zero rows that carry weight after the softmax, which dilutes the output for short prefixes. Return the first `n` rows only.

**The corrected class**

```python
    def append(self, k, v):
        k = np.atleast_2d(k)
        v = np.atleast_2d(v)
        if k.shape[0] != v.shape[0]:
            raise ValueError("keys and values differ in steps")
        if self.n + k.shape[0] > self.k.shape[0]:
            raise ValueError("cache full")
        self.k[self.n:self.n + k.shape[0]] = k
        self.v[self.n:self.n + k.shape[0]] = v
        self.n += k.shape[0]

    def keys(self):
        return self.k[:self.n]

    def values(self):
        return self.v[:self.n]
```

The copy into the buffer also protects the cache from later changes to the caller's arrays.

**How this meets the generation loop**

The assembly lesson's generator keeps the active window inside the context length by dropping the oldest tokens when the prompt plus the generated tokens would exceed it. A cache with a fixed capacity needs the same rule one level down: either refuse the append and let the loop slide the window, or evict the oldest rows. The practice pins the refusing version so the boundary is explicit.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does the decode step do with the stored keys? Expected: it scores one query against every stored key, divides by the square root of the key size, takes a softmax and weights the stored values.
- **Level 3:** A second bug writes every append at row zero. What is the symptom? Expected: new steps overwrite old ones, so attention only ever sees the latest append and the model loses its context.
- **Level 4:** Where does a paged cache change this design? Expected: the capacity becomes a pool of fixed-size blocks shared by requests, so an append that needs a new block can wait or preempt instead of failing the request.

**Wrong answers, and why they fail**

- "Use greater-or-equal so the cache never overflows." It also rejects the exact fill and wastes the last slot.
- "Return the full buffer; the zero rows have no effect." Zero keys still get softmax weight and pull the output toward the zero values.
- "Update the count first so the slice indices are simpler." A refused append then corrupts the length.

**Related lesson in this course:** [Deep dive 11: build, test and observe an agent](#aideep-11)

:::

## Attention heads that never mix

*Level 3 (senior) · debug · about 10 minutes*

A multi-head attention forward passes the split and merge tests but fails the end-to-end test against a reference, and a trained checkpoint loaded into it generates nonsense:

```python
def multi_head_attention(x, w_q, w_k, w_v, w_o, n_heads):
    Q, K, V = split_heads(x @ w_q, n_heads), split_heads(x @ w_k, n_heads), split_heads(x @ w_v, n_heads)
    d_head = Q.shape[-1]
    scores = Q @ K.swapaxes(-1, -2) / np.sqrt(d_head)
    weights = softmax(scores, axis=-2)
    return merge_heads(weights @ V), weights
```

Find both defects and explain what each one does to the model.

:::answer Show the answer
:::say Short answer
The softmax normalizes over the query axis instead of the key axis, so each column sums to one and a query's weights no longer form a distribution over the keys. The output projection is also missing: the merged heads are returned without the multiplication by `w_o`, which is the only place where heads exchange information. Normalize over the last axis and multiply the merged result by the output matrix.
:::

**Full answer**

**Defect one: the softmax axis**

Scores have shape batch, heads, queries, keys. Each query row must become a distribution over the keys, so the softmax runs over the last axis. Over the second-to-last axis each key column sums to one across queries instead, and the weighted sum of values no longer means "what this token attends to".

**Defect two: the output projection**

Each head computes attention in its own subspace and the heads never interact during the attention computation itself. The concatenation followed by the output matrix is where the heads mix. Without it, the model's output is a stack of independent per-head results, the next layer sees a different function than the one the weights were trained for, and a loaded checkpoint produces noise.

**The corrected function**

```python
def multi_head_attention(x, w_q, w_k, w_v, w_o, n_heads):
    Q = split_heads(x @ w_q, n_heads)
    K = split_heads(x @ w_k, n_heads)
    V = split_heads(x @ w_v, n_heads)
    d_head = Q.shape[-1]
    scores = Q @ K.swapaxes(-1, -2) / np.sqrt(d_head)
    weights = softmax(scores, axis=-1)
    return merge_heads(weights @ V) @ w_o, weights
```

**Why the reshape tests passed**

Both defects live after the split and before the merge, or after the merge. The reshape helpers are correct, and the shapes of the final output match the reference because `w_o` is square. Only a value comparison against a reference, or a real checkpoint, exposes them.

**Why the scale is still right**

The division uses the head size, not the full width. That part of the submission is correct; dividing by the square root of the full width is a third common error that the practice also tests.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the output projection have shape full width by full width? Expected: it maps the concatenation of all heads, which has the full width, back to the model width, and it is the one matrix that reads from every head.
- **Level 3:** Which test would you add to catch the missing projection early? Expected: a case where `w_o` is not the identity, so the projected and unprojected outputs differ.
- **Level 4:** A probing study finds one head attends to the previous token. Where in this code does that head's result reach the residual stream? Expected: only through its block of columns in the concatenation and the rows of `w_o` that read it; `w_o` decides how much of that head the next layer sees.

**Wrong answers, and why they fail**

- "The softmax axis does not matter because the scores are symmetric." Scores are query by key and not symmetric; the two normalizations differ for every real input.
- "Skip the output projection to save parameters; the merge already recombines the heads." The merge only concatenates; without the projection the heads never interact.
- "Use the identity for the output projection when a checkpoint lacks one." A trained checkpoint always has one; a missing tensor means the name map is wrong.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## GQA that pairs query heads with the wrong group

*Level 3 (senior) · code-reading · about 10 minutes*

A GQA implementation repeats the key and value heads up to the query head count with this line, where `kv` has shape batch, groups, tokens, head size:

```python
kv_full = np.tile(kv, (1, n_heads // n_kv_heads, 1, 1))
```

The shapes match and the outputs are wrong for every configuration with more than one group. Explain which query head ends up with which group, and write the correct expansion.

:::answer Show the answer
:::say Short answer
Tiling repeats the whole block of groups, so query head `h` reads group `h` modulo the number of groups. The convention is that consecutive query heads share a group: head `h` reads group `h` floor-divided by the repeat factor. Repeat each group in place along the head axis instead of tiling the block.
:::

**Full answer**

**The two layouts**

With four query heads and two groups the repeat factor is two. The correct expansion gives the sequence of groups `0, 0, 1, 1`: the first two query heads share group zero and the next two share group one. Tiling gives `0, 1, 0, 1`, so heads one and two swap partners. Every head still has a key and value tensor of the right shape, which is why no shape check fails, but half the heads attend with the wrong keys.

**The fix**

```python
def repeat_kv(kv, n_heads):
    B, G, T, d_head = kv.shape
    if n_heads % G:
        raise ValueError("query heads must be a multiple of kv heads")
    r = n_heads // G
    return np.repeat(kv, r, axis=1)
```

`np.repeat` along the group axis copies each group `r` times next to itself, which produces the floor-division mapping. The divisibility check belongs here, because a non-integer repeat factor silently truncates and drops heads.

**Why the mapping is a convention and not a choice**

The projection weights of a trained checkpoint were learned under one mapping. The multi-head lesson describes the lineage: multi-head attention with one group per head, multi-query attention with a single shared group, and the grouped form in between with the first `r` heads on group zero. A model converted from multi-head weights by pooling consecutive heads only works if attention reads the groups in the same consecutive order.

**Why it exists**

Only `G` key and value heads live in the cache instead of `H`, so the cache shrinks by the factor `H / G` while quality stays close to standard multi-head attention. The lesson's example is a large open model that pairs 64 query heads against only 8 shared groups.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** With one group, what does the function compute? Expected: multi-query attention; every query head shares the single key and value head.
- **Level 3:** Where does the scale factor come from after the repeat? Expected: the square root of the head size, the same as in multi-head attention; dividing by the square root of the full width is a separate common bug.
- **Level 4:** How does a framework avoid materializing the repeated copies? Expected: it broadcasts the group axis inside the attention kernel, or the attention call accepts fewer key and value heads directly, so memory holds only the groups.

**Wrong answers, and why they fail**

- "Tile and repeat give the same result when the shapes match." They give different head-to-group assignments; only one matches the trained weights.
- "Average the groups and use one key tensor for all heads." That turns the model into multi-query attention with weights it was not trained for.
- "The mapping does not matter because attention is permutation invariant." Attention is invariant over keys within a head, not over which key head a query head reads.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Nucleus sampling that drops the token which reaches p

*Level 3 (senior) · debug · about 10 minutes*

A nucleus filter is reviewed because a product team says small values of p give an empty distribution on some prompts:

```python
def top_p_filter(logits, p):
    probs = softmax(logits)
    c = np.cumsum(probs)
    out = np.where(c <= p, logits, -np.inf)
    return out
```

Find the two bugs and explain how the filter must interact with the temperature in the full sampler.

:::answer Show the answer
:::say Short answer
The cumulative sum runs in vocabulary order instead of in order of decreasing probability, so the kept set is not the most probable prefix at all. The comparison also drops the token that makes the sum reach p, which for a small p leaves nothing and yields an empty distribution. Sort by probability first, keep the shortest prefix whose sum reaches p including the crossing token, and run the filter on the temperature-scaled logits.
:::

**Full answer**

**Bug one: the order**

Nucleus sampling keeps the smallest set of most probable tokens whose mass reaches p. That requires sorting by probability, highest first, before the cumulative sum. In vocabulary order the sum crosses p at an arbitrary place and the kept set is a prefix of the vocabulary, not of the ranking.

**Bug two: the crossing token**

The token whose addition makes the cumulative sum reach p is part of the nucleus. A strict comparison excludes it. When the top token alone carries more mass than p, nothing passes and the softmax of all negative infinities is NaN. Keep the prefix up to and including the first index where the sum is at least p, and if rounding keeps the sum from ever reaching p, keep every token.

**The fix**

```python
def top_p_filter(logits, p):
    probs = softmax(logits)
    order = np.argsort(-probs, kind="stable")
    c = np.cumsum(probs[order])
    cut = np.searchsorted(c, p, side="left")
    keep = order[: min(cut + 1, logits.shape[0])]
    out = np.full_like(logits, -np.inf)
    out[keep] = logits[keep]
    return out
```

The stable sort on the negated probabilities keeps the lower index first on ties.

**Temperature comes first**

The full sampler divides by the temperature, applies top-k, applies top-p to that result, and takes the softmax last. If the temperature is applied after the filters, the nucleus is chosen at temperature one and a hot or cold setting changes less than the user asked for. The assembly lesson lists nucleus sampling as the extension of its top-k generation loop, with the check that the kept probabilities sum to at least p.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the filter return logits with negative infinity rather than probabilities? Expected: so the final softmax renormalizes the kept tokens and gives removed tokens exactly zero, and so top-k and top-p compose.
- **Level 3:** What does p equal to one keep? Expected: every token, unless rounding leaves the sum short, in which case the rule to keep all tokens applies.
- **Level 4:** Top-k and top-p are both set. Which one acts first and why does it matter? Expected: top-k first, then top-p on the survivors; the reverse order can keep a different set because the nucleus mass is computed over different candidates.

**Wrong answers, and why they fail**

- "Use a strict comparison so you never exceed p." The definition is the smallest prefix that reaches p; excluding the crossing token breaks it and can leave an empty set.
- "Take the cumulative sum in index order; the vocabulary is already sorted by frequency." Token ids are not sorted by probability for a given context.
- "Apply the temperature after the filter so the nucleus is stable." The nucleus is then chosen at the wrong temperature and the knob loses most of its effect.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## Swap the final LayerNorm for RMSNorm without breaking it

*Level 3 (senior) · code-reading · about 10 minutes*

The assembly lesson says that swapping the activation and replacing LayerNorm with RMSNorm turns its model into the next open model family. A candidate submits this RMSNorm:

```python
def rms_norm(x, weight, eps):
    mean = x.mean(axis=-1, keepdims=True)
    var = ((x - mean) ** 2).mean(axis=-1, keepdims=True)
    return weight * (x - mean) / np.sqrt(var) + eps
```

What is wrong, and what does the correct function compute?

:::answer Show the answer
:::say Short answer
This is a LayerNorm without a shift, not an RMSNorm, and it adds epsilon after the square root instead of inside it. RMSNorm does not subtract the mean. It divides the input by the root of the mean of the squares over the last axis, with epsilon inside the root, and multiplies by a learned weight.
:::

**Full answer**

**The two normalizations**

```python
def layer_norm(x, gamma, beta, eps):
    mean = x.mean(axis=-1, keepdims=True)
    var = ((x - mean) ** 2).mean(axis=-1, keepdims=True)
    return gamma * (x - mean) / np.sqrt(var + eps) + beta


def rms_norm(x, weight, eps):
    ms = (x ** 2).mean(axis=-1, keepdims=True)
    return weight * x / np.sqrt(ms + eps)
```

LayerNorm centers and scales each token vector, then applies a learned scale and shift. RMSNorm keeps the direction of the vector and only fixes its magnitude. It has no mean subtraction and no shift, which saves one reduction per token and one parameter vector per layer.

**The epsilon**

Epsilon exists to keep the division defined when the variance or the mean square is near zero. Inside the root it bounds the denominator from below. Outside the root it does nothing for a zero variance and shifts every output by a constant, which is wrong in both cases. The practice task has one mutant for each of these placements.

**Over which axis**

Both normalizations reduce over the last axis, the feature axis, independently for every token in every batch element. Reducing over the batch axis turns the layer into a batch statistic, which changes with batch composition and breaks single-example inference.

**Biased variance**

LayerNorm uses the biased variance, the mean of the squared deviations over the feature count. The unbiased estimate with one fewer in the denominator is a statistics convention that does not belong here and makes the output disagree with every standard library version by a factor that depends on the width.

**Why the swap is safe in the assembly**

The final normalization sits between the last block and the tied head, and both functions take and return the same shape. Swap the class, drop the shift parameter, and the head, the embedding and the generation loop are untouched.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does the caller's epsilon argument control, and what happens if the function ignores it? Expected: the floor on the denominator; ignoring it and using a fixed constant makes a reference comparison fail when the caller passes a different value.
- **Level 3:** Why does RMSNorm have no shift parameter? Expected: it does not center the input, so there is no mean to restore; the next linear layer's bias can absorb a shift if one is needed.
- **Level 4:** A pretrained checkpoint has LayerNorm scales and shifts and you swap in RMSNorm. What breaks? Expected: the shift has nowhere to load and the scale was learned on centered inputs, so the loaded model no longer matches the trained function.

**Wrong answers, and why they fail**

- "RMSNorm is LayerNorm with the shift removed." It also removes the mean subtraction; without that difference it would not be a different layer.
- "Epsilon placement does not matter for normal inputs." It matters exactly for the inputs it exists for, the ones with near-zero variance.
- "Use the unbiased variance, it is more correct." Standard library versions use the biased form; the choice is a contract, not a statistics question.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Sweep the peak learning rate and mark divergence

*Level 3 (senior) · take-home · about 25 minutes*

Before a long training run you are asked to pick the peak learning rate for a warmup and cosine schedule. Write the sweep that trains a small seeded model at each candidate rate, decides which runs diverged, picks the best stable rate and reports the smallest rate that diverged. State what "diverged" means in code.

:::answer Show the answer
:::say Short answer
Run the same seeded training loop once per candidate rate and record the final loss and the loss history. A run diverged when its final loss is not finite or when the loss grew over the run, not only when it became NaN. The best rate is the lowest final loss among the stable runs, with the smaller rate on a tie, and the smallest diverging rate is reported as the ceiling, because it bounds how high the peak can go.
:::

**Full answer**

**Why the peak first**

The schedule lesson's advice is to sweep the peak before anything else, because the peak is the most sensitive knob and its optimum scales weakly with model size. A sweep on a small model is a strong prior for the large run. The warmup fraction and the floor matter less and come after.

**The sweep**

```python
def is_diverged(losses):
    final = losses[-1]
    return not np.isfinite(final) or final > losses[0]


def run_sweep(rates, train_fn, seed):
    results = {}
    for lr in rates:
        losses = train_fn(lr, seed)
        results[lr] = (losses[-1], is_diverged(losses))
    return results


def best_lr(results):
    stable = [(loss, lr) for lr, (loss, div) in results.items() if not div]
    return min(stable)[1] if stable else None


def smallest_diverging_lr(results):
    div = [lr for lr, (_, d) in results.items() if d]
    return min(div) if div else None
```

Every run uses the same seed so that the only difference between runs is the rate. The results are keyed by rate, and the divergence filter runs before any argmin, because a NaN final loss compares as neither larger nor smaller and would otherwise be selected. When every run diverged, `best_lr` returns `None` and the grid must move lower.

**What diverged means**

A loss that ends finite but above where it started is a divergence too. A run can climb for the whole sweep and still return a number. Testing only for non-finite values marks that run stable and the sweep then recommends a rate that will blow up the long run after warmup ends.

**Reading the result**

The schedule reaches the peak at the end of warmup and decays toward the floor. A peak just below the smallest diverging rate is aggressive; a peak with a margin below it survives the noisy gradient norms of the first steps. Log the gradient norm next to the rate on the chosen run: a well-tuned warmup shows the norm rising with the rate and settling, and a too-high peak shows a norm that stays high after warmup.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Two rates give the same final loss. Which one do you pick? Expected: the smaller one; it has more margin to the divergence ceiling.
- **Level 3:** Why does the practice compare the first diverging rate with two over the top curvature of the loss? Expected: for a quadratic loss, gradient descent is stable only below that bound, so the measured ceiling should land near it and a mismatch points at a bug in the sweep.
- **Level 4:** Warmup is set as an absolute count of steps. Why does the sweep on a short run then mislead the long one? Expected: the same count is a much smaller fraction of a long run, so the long run sits at the peak almost at once; set warmup as a fraction of total steps.

**Wrong answers, and why they fail**

- "Pick the rate with the lowest loss across all runs." A NaN or a climbing run must be filtered first, otherwise the argmin can return a diverged rate.
- "A run diverged only if the loss is NaN or infinite." A finite loss that grew over the run is a divergence the long run will also show.
- "Sweep the warmup length first since it protects the start." The peak is the most sensitive knob; the warmup fraction is tuned after it.

:::

## Train the smallest language model past its baseline

*Level 3 (senior) · take-home · about 30 minutes*

Write a training loop for a table of next-character logits: one row per context character, one column per next character. Train it with gradient descent on a text, under a fixed step budget and a seeded generator, until its held-out NLL is lower than a model that ignores the context. Tell me what the held-out check must look like for the comparison to mean anything.

:::answer Show the answer
:::say Short answer
Build the pairs so that the current character is the context and the following character is the target, compute the log-softmax over each row, and descend the mean of the negative target log-probabilities over the training pairs within the step budget. The held-out check scores a fixed split that training never saw, with the same loss definition for the bigram and the unigram baseline, and the model only passes when its held-out value is lower than the baseline's. Reproducibility comes from drawing the initial table from the generator that the caller passes, not from a global one.
:::

**Full answer**

**The model and the loop**

```python
def train(text, rng, steps, lr):
    pairs = [(ord(a), ord(b)) for a, b in zip(text, text[1:])]
    W = rng.normal(0, 1, (V, V))
    for _ in range(steps):
        logits = W[[a for a, _ in pairs]]
        logp = log_softmax(logits)
        grad = softmax(logits)
        grad[np.arange(len(pairs)), [b for _, b in pairs]] -= 1
        gW = np.zeros_like(W)
        np.add.at(gW, [a for a, _ in pairs], grad / len(pairs))
        W = W - lr * gW
    return W


def next_log_probs(W, context):
    return log_softmax(W[context])
```

The pair direction is the whole model: context first, target second. Reversing them trains a model that predicts the previous character, and counting each next character as its own context trains nothing about what follows what.

**The gradient sign**

The update subtracts the gradient. Adding it climbs the loss, which is visible on the first evaluation, and is the first mutant the practice checks.

**The held-out check**

The loop lesson's rule is that evaluation runs on a fixed held-out slice with no gradient, and the number must be comparable across runs. For this task that means three things. The split is fixed before training and never touched by the loop. The unigram baseline, which assigns each character its frequency in the training text regardless of context, is scored on the same held-out characters with the same loss definition. The bigram passes only when its held-out value is strictly lower. A model that wins on the training text and not on the held-out text has memorized the training text.

**The budget**

A step budget is part of the contract. A loop that runs more steps than the budget may reach the target but fails the task, and in a real run it is the difference between a planned job and an overrun.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why return log-probabilities and not raw logits from the scoring function? Expected: the loss needs a normalized distribution per row; raw logits are not comparable across contexts.
- **Level 3:** The model beats the baseline on training text and loses on held-out text. What happened? Expected: it memorized the training pairs; a held-out split exists to catch exactly that.
- **Level 4:** How does this toy loop map onto the full training loop in the lesson? Expected: the pair construction is the shift-by-one, the row lookup is the forward, the held-out check is the fixed evaluation, and the budget is the step count of the schedule.

**Wrong answers, and why they fail**

- "Evaluate on the training text to save time." The comparison then measures memorization and the baseline comparison means nothing.
- "Draw the initial table from the global random state." Two runs with one seed then differ, and the test for reproducibility fails.
- "Train until the loss stops improving." The budget is part of the contract and an open-ended loop hides a slow or stuck run.

**Related lesson in this course:** [Deep dive 3: how models learn](#aideep-3)

:::

## Which parameters get weight decay

*Level 3 (senior) · code-reading · about 10 minutes*

A training run looks healthy for the first few thousand steps, then the loss starts to climb and samples degrade. The optimizer is built with one parameter group:

```python
optimizer = AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
```

Write the function that builds the parameter groups correctly and explain which tensors must be excluded from decay and why.

:::answer Show the answer
:::say Short answer
Decay belongs on matrix-shaped tensors, which are the linear weights and the embedding tables, and not on normalization scales or biases. A decayed LayerNorm scale drifts toward zero over thousands of steps until normalization stops working, which matches the late failure. Split the parameters by shape into a decay group and a no-decay group and pass both to the optimizer.
:::

**Full answer**

**The split**

```python
def build_param_groups(model, weight_decay):
    decay, no_decay = [], []
    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        (decay if p.dim() >= 2 else no_decay).append(p)
    return [
        {"params": decay, "weight_decay": weight_decay},
        {"params": no_decay, "weight_decay": 0},
    ]
```

A two-dimensional or larger tensor is a weight matrix or an embedding table. A one-dimensional tensor is a scale or a shift, which includes LayerNorm parameters and every bias. The rule by dimension is simple and matches the standard recipe.

**Why decay on a scale is harmful**

Weight decay pulls every decayed parameter toward zero on every step. A linear weight has gradient pressure in many directions and the pull acts as regularization. A LayerNorm scale has one job, to set the magnitude of the normalized activations, and a steady pull toward zero shrinks the residual stream of every block until the signal is too small for the layers that follow. The effect accumulates slowly, which is why the run looks fine at first.

**Why decay on a bias is waste**

Decaying a bias is mathematically harmless but spends update cycles on a parameter that regularization does not need to control. The split excludes it along with the scales.

**How to test the split**

A unit test can walk the named parameters and assert that each scale and bias landed in the no-decay group and each linear and embedding weight landed in the decay group. The loop lesson lists exactly this test as its first exercise.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The language model head is tied to the token embedding. Which group is it in, and how many times? Expected: once, in the decay group, because it is the same tensor as the embedding table.
- **Level 3:** A model uses RMSNorm instead of LayerNorm. Does the rule change? Expected: no; the RMSNorm weight is one-dimensional and stays out of the decay group.
- **Level 4:** Why does the problem appear late rather than at the start of training? Expected: the decay shrinks the scale by a small fraction per step, so the damage compounds over thousands of steps before the activations become too small.

**Wrong answers, and why they fail**

- "Weight decay applies to all weights by definition." The standard recipe excludes normalization and bias tensors; applying it everywhere breaks normalization over time.
- "Decide by parameter name, excluding anything called bias." Names vary across implementations; the dimension rule is robust.
- "Lower the weight decay until the run is stable." A smaller value slows the drift but keeps the pull on the scales.

:::

## A byte-level tokenizer with protected special tokens

*Level 4 (staff) · take-home · about 45 minutes*

Design and implement a tokenizer for a small language model: train it on a corpus, encode fresh text, decode ids back, and reserve two special tokens for document boundaries and padding. State the guarantees the test suite must pin, and explain how the special tokens survive both training and inference without ever being merged.

:::answer Show the answer
:::say Short answer
The base symbols are the 256 raw bytes, so every input has an encoding before any merge and decoding always terminates in bytes. Training runs on pre-tokenized chunks that never contain the special strings, so no merge can produce or consume a special id. At inference a matcher splits the text on the special strings first, maps each one to its reserved id, and runs the merge table on the text between them in training order. The suite pins the round trip on unseen text, on text with multi-byte characters, and on text that contains a literal special string with the flag off.
:::

**Full answer**

**The pipeline**

1. Normalize the text to one Unicode form so that the same visible word gets the same bytes.
2. Split on the special strings when the caller allows them, and map each match to its reserved id.
3. Pre-tokenize the remaining text into chunks at whitespace and punctuation boundaries.
4. Apply the merge table to each chunk's bytes in training order, with non-overlapping left-to-right replacement.
5. Concatenate the ids.

Decoding reverses steps two to five: expand each id to its bytes, where a merged id expands to the bytes of its two parents and a reserved special id expands to the UTF-8 bytes of its string, and decode the byte string. Normalization is not reversible. A decomposed accent comes back as the composed character, so the round trip is exact only for text that is already in the normalized form.

**Why pre-tokenization**

Without the split, merges cross word boundaries and the vocabulary fills with common phrases that do not generalize. The split keeps merges inside a word. The chunk boundaries also stop a merge from spanning the end of one word and the start of the next at inference, which is how training and inference stay consistent.

**Special tokens**

The ids after the byte block are reserved by hand. The training loop never sees the special strings, because the corpus is split and the strings are removed before pair counting, so no merge target can be a special id and no merge can include one. At inference the encoder takes a flag. With the flag off, the characters of a special string are ordinary bytes and tokenize as such. With the flag on, the exact string maps to its reserved id and is not subject to any merge. The matcher tries longer special strings first so that one string that contains another is matched whole.

**The guarantees to pin**

| Guarantee | Test |
|---|---|
| Round trip on unseen text | encode then decode returns the exact bytes of the normalized input |
| Multi-byte characters | a sentence with a four-byte emoji round-trips |
| Literal special string, flag off | the string decodes back as text, not as a boundary |
| Special string, flag on | exactly one id, the reserved one, appears |
| Merge order | the same merge list gives the same ids on repeated encodes |
| Reserved range | no merge in the table has a special id as a parent or a child |

**The compression curve**

The number of ids for a held-out sentence falls as the merge budget grows. Training with a target vocabulary of 300 and then of 600 ids on the lesson corpus shows the drop directly; that curve is the measurement that justifies the vocabulary size.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why are the first 256 ids reserved for bytes rather than for the characters of the corpus? Expected: any input, including text in scripts the corpus never had, can then be encoded without an unknown token.
- **Level 4:** Where do chat template markers fit in this design? Expected: they are special tokens like the boundary token, matched exactly before the merges, with fixed ids that the model was trained on; a wrong template puts the input outside the training distribution.
- **Level 4:** How do you protect a deployed model from a tokenizer that drifts? Expected: hash the merge table and the special-token map, and check the hash in the pipeline before training and before serving; a different table decodes different ids.

**Wrong answers, and why they fail**

- "Add the special tokens to the corpus so the model learns them." Then they can be merged with neighbors and stop being single ids.
- "Match special strings after the merges." The merges have already split the string into byte pieces, so the matcher never sees it.
- "Decode by looking up a string per id in a dictionary." Ids are bytes, and a multi-byte character can be split across ids; concatenate bytes first, then decode.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Convert a multi-head checkpoint to grouped-query heads

*Level 4 (staff) · estimate · about 15 minutes*

You have a trained model with 64 query heads and 64 key and value heads, and you want to serve it with 8 key and value heads to shrink the cache. Write the function that pools the key projection of the checkpoint into groups, say by what factor the cache memory for keys and values falls, and explain why the pooled model needs more training before it is usable.

:::answer Show the answer
:::say Short answer
Group `g` of the new projection is the mean of the consecutive heads `g r` to `g r + r - 1`, where `r` is the number of query heads per group, taken over the columns of the projection matrix. The cache holds keys and values for 8 heads instead of 64, so that memory falls by a factor of eight. The mean of several heads is not a head the model was trained with, so quality drops until a short continued training run adapts the query heads to their shared group.
:::

**Full answer**

**The pooling**

```python
def mean_pool_kv_heads(w, n_heads, n_kv_heads):
    if n_heads % n_kv_heads:
        raise ValueError("query heads must be a multiple of kv heads")
    D, cols = w.shape
    d_head = cols // n_heads
    r = n_heads // n_kv_heads
    grouped = w.reshape(D, n_kv_heads, r, d_head)
    return grouped.mean(axis=2).reshape(D, n_kv_heads * d_head)
```

The reshape puts the groups first and the heads inside a group next, because the heads of one group are consecutive blocks of columns. Reshaping as `(D, r, G, d_head)` pools heads that are `G` apart, which gives a correct shape with the wrong groups. The mean, not the sum, keeps the scale of the projected keys close to the original, so the attention scores stay in range.

**The memory factor**

The cache stores one key and one value vector per layer, per head, per token. The number of query heads does not enter. Going from 64 to 8 key and value heads divides the stored bytes per token by eight, which is the example the multi-head lesson gives for a large open model. Weights fall much less, because the query and output projections are unchanged and only the key and value projections shrink.

**Why it needs training**

The query heads were trained against their own key heads. After pooling, eight query heads read one averaged key head that none of them saw in training. The lesson's lineage describes converting multi-head checkpoints to grouped-query checkpoints as a recipe with a continued training step; the pooling gives a starting point close to the original, and the uptraining recovers most of the quality. Serving the pooled weights directly works, but the eval must be rerun before shipping.

**What does not change**

The head size, the query projection, the output projection and the attention function itself are the same. Only the key and value projections and the repeat inside attention change, so the rest of the loader and the block are untouched.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why pool consecutive heads and not every eighth head? Expected: the attention reads group `h` floor-divided by `r` for query head `h`, so the pooled heads must be the ones that will share a group.
- **Level 4:** How does the cache saving change when the model is served with a longer context? Expected: it does not change as a factor; the saving is per token, so the absolute bytes saved grow with the number of tokens held.
- **Level 4:** The multi-head latent variant compresses keys and values into a low-rank latent. What does it trade for the extra saving? Expected: compute, because the latent must be projected back to full keys and values at attention time.

**Wrong answers, and why they fail**

- "Pooling is lossless since the mean preserves the average key." The individual heads are lost; the queries were trained against them, so quality drops until the model is adapted.
- "The cache shrinks by the ratio of query heads to total heads." Only key and value heads live in the cache; the factor is the old count of key and value heads over the new count.
- "Sum the heads so no information is lost." The sum scales the keys by the group size and pushes the scores out of the range the softmax was trained for.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::
