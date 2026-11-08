---
track: aibank
title: "AI interview bank: Transformers (part 2 of 2)"
short: Transformers 2
sub: 7 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Read the running softmax and find the fragile line

*Level 3 (senior) · code-reading · about 12 minutes*

Read this function from the lesson. It computes the attention output for one query against keys and values in blocks of four.

```python
def tiled_softmax_dot(q, K, V, tile=4):
    m = float("-inf")
    s = 0.0
    out = [0.0] * len(V[0])
    for start in range(0, len(K), tile):
        k_block = K[start:start + tile]
        v_block = V[start:start + tile]
        scores = [sum(qi * ki for qi, ki in zip(q, k)) for k in k_block]
        new_m = max(m, *scores)
        exp_old = math.exp(m - new_m) if m != float("-inf") else 0.0
        exp_new = [math.exp(sc - new_m) for sc in scores]
        s = s * exp_old + sum(exp_new)
        for j in range(len(out)):
            out[j] = out[j] * exp_old + sum(e * v[j] for e, v in zip(exp_new, v_block))
        m = new_m
    return [o / s for o in out]
```

Explain the role of `exp_old`, argue that the result equals the one-shot `softmax(qK^T) V`, and point at the input that makes this code produce a NaN.

:::answer Show the answer
:::say Short answer
The loop keeps a running maximum `m` and a running sum `s` over the blocks seen so far. When a block raises the maximum, `exp_old` is the exponential of the old maximum minus the new one, and it rescales the sum and the partial output so that every earlier term is expressed against the new maximum; a block that does not raise the maximum gives `exp_old` of one. At the end each weight is the exponential of its score minus the global maximum, divided by the global sum, which is exactly the stable softmax. The fragile input is a first block whose scores are all minus infinity, as a fully masked block would be: `new_m` stays minus infinity, and `exp_new` evaluates minus infinity minus minus infinity, which is NaN.
:::

**Full answer**

**The invariant**

After each block, `out` holds the sum over all keys seen so far of `exp(score - m) * v`, and `s` holds the sum of `exp(score - m)`, both relative to the current `m`. The identity that makes the rescale correct is

```text
exp(score - m_new) = exp(score - m_old) * exp(m_old - m_new)
```

so multiplying the old accumulators by `exp(m_old - m_new)` moves them to the new reference point without touching any individual score again. The first block has no old reference, which is why `exp_old` is zero when `m` is still minus infinity: the empty accumulators contribute nothing.

**Why the final division is exact**

Division by `s` happens once, at the end, with the global maximum in every exponential. That is the definition of a numerically stable softmax over the whole row, computed without ever holding the whole row. The working set is one block of keys and values and one output vector. The real kernel does this per block of queries, with blocks of keys and values streamed through on-chip memory, and writes each output tile once.

**The NaN**

A causal kernel skips blocks that lie entirely above the diagonal; a kernel that applies the mask by setting scores to minus infinity must guard the case where every score in the block is minus infinity. Here `max(-inf, -inf, ...)` is minus infinity, and `exp(-inf - (-inf))` is NaN, which then poisons `s` and `out`. The guard: skip a block whose maximum is minus infinity, or test `new_m` before computing `exp_new`.

**What a reviewer tests**

1. Equality with the one-shot softmax on random inputs, within floating-point tolerance.
2. A second block whose scores are all lower than the first block's maximum, so that the rescale path with `exp_old` equal to one is exercised.
3. A block whose scores are all higher, so that `exp_old` is less than one and the earlier terms shrink.
4. A fully masked first block, which must not produce NaN.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does a smaller tile cost and buy? Expected: more rescale steps and more loop overhead against a smaller working set on chip; the real kernel picks the tile to fit on-chip memory.
- **Level 3:** Why is `exp_old` set to zero and not one on the first block? Expected: there is no earlier term to carry; the accumulators are empty, and `exp(-inf - new_m)` would be zero anyway for a finite `new_m`.
- **Level 4:** How does the causal mask change the loop in a production kernel? Expected: blocks fully above the diagonal are skipped rather than masked, and partially masked blocks apply minus infinity per entry before the maximum is taken.
- **Level 4:** Where does the backward pass get the softmax values it needs? Expected: it recomputes them from the stored row maximum and row sum instead of storing the N by N matrix.

**Wrong answers, and why they fail**

- "`exp_old` is a decay factor like a learning rate." It is an exact change of reference point; the output is identical to the one-shot formula.
- "You could store the scores and normalize at the end." That stores the full row, which is the memory cost the kernel exists to avoid.
- "Each block should be normalized by its own sum." A per-block normalization breaks the global softmax; only the final division is correct.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::

## Review a 2017-style block against today's defaults

*Level 3 (senior) · design · about 12 minutes*

You inherit a decoder block written in the 2017 style: layer normalization after the residual add, a ReLU feed-forward network at four times the width, sinusoidal absolute positions summed into the input, bias terms on every linear layer, and full multi-head attention. Review it against what production decoders ship today and justify each change you ask for.

:::answer Show the answer
:::say Short answer
Move the normalization in front of each sublayer and switch it to RMSNorm; replace the ReLU network with SwiGLU at about 2.6 times the width so that its three matrices match the old parameter count; replace the sinusoid with rotation of the queries and keys; drop the biases; and use grouped-query attention to shrink the decode-time cache. Every change is one function substitution and the tensor shapes do not move. The evidence: pre-norm trains deep without warmup tricks, SwiGLU gains about half a point of perplexity in the published model papers, rotation gives relative position and a knob for long context, and grouped-query cuts cache memory by the ratio of query heads to key-value heads.
:::

**Full answer**

**The review table**

| Component | As written | Ask for | Why |
|---|---|---|---|
| Normalization | LayerNorm after the add | RMSNorm before the sublayer | pre-norm trains deep stacks without warmup; RMSNorm drops the mean subtraction at equal stability |
| FFN activation | ReLU | SwiGLU | about 0.5 point of perplexity in the published comparisons |
| FFN expansion | 4 with two matrices | about 2.6 with three matrices | same parameter budget |
| Position | sinusoid on the embedding | rotation of Q and K | relative position for free and a base to scale for long context |
| Attention | full multi-head | grouped-query, or latent | fewer key-value heads in the cache, nearly full quality |
| Bias terms | yes | no | slight perplexity gain and a smaller model |

**What stays**

The skeleton: embedding, a stack of blocks that each add attention and an FFN to the residual stream, a final norm and a head. The shift-by-one cross-entropy. The causal mask. The capstone architecture in the lesson is exactly this skeleton with the modern pieces plugged in, and its head is tied to the token embedding.

**How to land the changes safely**

1. Make each substitution behind a flag and confirm the output shape after every swap, the way the lesson's build step does.
2. Train the old and the new block on a small copy task for a fixed number of steps and compare the loss; the lesson's exercise uses 100 steps of a toy task.
3. Use the fused attention call from the framework so that a tiled kernel is dispatched when the inputs allow it.
4. Keep a final norm before the head, which pre-norm requires and post-norm did not.

**What needs a retrain**

All of these change the function the block computes, so a checkpoint trained with the old block cannot adopt them by editing code. Grouped-query is the exception the literature treats specially: a trained multi-head checkpoint can be converted and fine-tuned.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the SwiGLU expansion about 2.6 and not 4? Expected: three matrices instead of two, chosen so that the total parameters match the old network.
- **Level 3:** Which of the six changes can be applied to an existing checkpoint without retraining? Expected: none cleanly; grouped-query can be converted with a fine-tune, the rest change the function and need training.
- **Level 4:** What would you refuse to change in the review? Expected: the residual skeleton, the causal mask and the next-token loss; the modern block refined the pieces, not the frame.
- **Level 4:** The team wants to keep the sinusoid because it has no parameters. Your answer? Expected: rotation also has no parameters, applies inside attention, encodes relative distance and extends to longer contexts by scaling its base.

**Wrong answers, and why they fail**

- "RMSNorm is a cheaper approximation that costs accuracy." The lesson records it as at least as stable with one fewer operation.
- "SwiGLU doubles the feed-forward parameters." At about 2.6 times the width its three matrices match the old two-matrix count.
- "Pre-norm removes the need for any final normalization." It adds the need: the residual stream is unnormalized, so the head needs a final norm.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Take a model from 8K to 128K

*Level 3 (senior) · design · about 12 minutes*

A model was trained with a context of 8K tokens. The product now needs 128K. You have a modest fine-tuning budget and no budget to pretrain again. Lay out the options by the way the model encodes position, and give me the plan you would run.

:::answer Show the answer
:::say Short answer
The answer depends on the positional scheme, so read the config first. A learned absolute table has no row past the trained length and cannot be extended without new parameters. With rotary embeddings you scale the base or interpolate the positions, with NTK-aware scaling, YaRN or LongRoPE, and fine-tune on long sequences; the lesson's reference is a model family that went from 8K to 128K this way. Linear-bias attention extrapolates by construction, but you cannot switch a trained model to it for free.
:::

**Full answer**

**Option by scheme**

| Scheme in the checkpoint | Can it reach 128K? | How |
|---|---|---|
| Learned absolute table | Not without new rows | Add rows and train them, or retrain |
| Fixed sinusoid | The formula extends, the model does not | The model never saw those phases; expect poor quality |
| Rotary | Yes | Scale the base or interpolate positions, then fine-tune |
| Linear bias | Yes by design | Already extrapolates; a training-time choice |

**The rotary toolbox**

- **Position interpolation plus fine-tuning.** Shrink the positions by the extension factor so the angles stay inside the trained range, then fine-tune for 1 to 5B tokens. Simple and effective.
- **NTK-aware scaling.** Rescale the base to `base * scale_factor ** (d / (d - 2))` when going from 4K to 16K and beyond, so the high-frequency pairs are not squeezed.
- **YaRN.** A per-dimension mix of interpolation and extrapolation that preserves the entropy of attention on long contexts; it needs a fine-tuning stage.
- **LongRoPE.** A search over per-dimension scale factors; used for very long contexts.

**The plan**

1. Confirm the scheme from the model config and read the current rope scaling block.
2. Pick YaRN or position interpolation, set the factor for 128K, and build a long-sequence fine-tuning set.
3. Before training, measure perplexity on sequences longer than the trained length with and without the scaling, the way the lesson's exercise does at lengths 256 and 1024.
4. Fine-tune, then measure again at the target length and at the original length, so that a win on long inputs does not hide a regression on short ones.
5. Budget the memory. The cache of keys and values grows linearly with the context, and 128K is sixteen times 8K.

**What to tell the product team**

The positional scheme is the gate. A rotary model gives you a clean knob and a short fine-tuning job. A model with a learned table or a sinusoid needs a retrain or a different model.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a rotary model fail when you just run it at 128K with no change? Expected: the fast-turning coordinate pairs reach angles the model never saw, so the scores at long distance are noise.
- **Level 3:** What two measurements do you insist on before shipping? Expected: perplexity or task quality at the new length, and the same at the original length to catch a regression.
- **Level 4:** The team proposes to switch the model to linear-bias attention because it extrapolates well. Your answer? Expected: that is a training-time choice; a checkpoint trained with rotation cannot be swapped to a score bias without retraining.
- **Level 4:** What breaks on the serving side at 128K even if quality is fine? Expected: memory for each token's keys and values, which grows with the context; the attention stack needs grouped-query or latent attention and a tiled kernel.

**Wrong answers, and why they fail**

- "Set the maximum position in the config higher and ship." A learned table has no row for the new positions, and a rotary model needs its base scaled and a fine-tune.
- "The sinusoid extends to any length, so the model works." The formula extends; the model was never trained to read those phases and its quality drops.
- "Position interpolation needs no training." The lesson's recipe is to shrink the positions and then fine-tune for 1 to 5B tokens.

:::

## Take-home, a character-level decoder on a laptop

*Level 3 (senior) · take-home · about 15 minutes*

This is the take-home we send: train a small decoder-only transformer on a character-level text corpus of about one megabyte, on a laptop, and return the code, the loss curves and a few samples. Tell me how you would approach it, what a reviewer checks in your submission, and which results prove that the model works.

:::answer Show the answer
:::say Short answer
Build the small reference shape: a character tokenizer over the 65 symbols of the corpus, a token embedding plus a learned positional embedding, a stack of pre-norm blocks with RMSNorm, causal multi-head attention and a SwiGLU network, a final norm and a head tied to the embedding, trained with a shift-by-one cross-entropy on random 256-character windows. Use AdamW, a cosine schedule with warmup and gradient clipping at 1.0, and hold out the last 10 percent of the text for validation. The bar from the lesson: a 4-layer, 4-head model of width 128, about 800K parameters, goes from about 4.2 to about 1.5 training loss in 2,000 steps, about 6 minutes on a laptop, with validation loss under 2.0 that tracks the training loss and samples that look like the corpus.
:::

**Full answer**

**What to build**

```text
tokens (B, N) -> embedding + position -> [norm, causal attention, residual, norm, SwiGLU, residual] x L
            -> final norm -> head tied to the embedding -> logits (B, N, V) -> shift-by-one loss
```

A byte-level character tokenizer needs no training. The data split is 90 to 10 by position in the text, so that the validation text is never seen in training.

**The training loop**

```python
for step in range(max_steps):
    x, y = get_batch("train")
    logits = model(x)
    loss = F.cross_entropy(logits.view(-1, vocab_size), y.view(-1))
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    opt.zero_grad()
```

Log the training and validation loss on the same axis. Sample after training with top-p and stop after 500 characters.

**What a reviewer checks**

1. **Correctness of the objective.** The causal mask is applied before the softmax and the targets are the inputs shifted by one. A unit test that perturbs a later token and checks earlier outputs is a strong signal.
2. **The first loss.** About 4.2 at step zero, the uniform baseline, the logarithm of 65. A start well below it is a reason to check for a leak.
3. **Validation discipline.** A held-out split, logged at intervals, that tracks the training loss; the lesson records no overfitting at this size and budget. A validation loss far below training is a reason to check the split and the loss code, because the final 10 percent of text can also be easier.
4. **Training hygiene.** Gradient clipping, a schedule, a fixed seed, and a run that reproduces.
5. **Reading the samples.** Line breaks, archaic words and speaker names in capitals appear; the text is corpus-shaped, not the corpus.

**What proves it works**

The loss curve from about 4.2 to about 1.5, a validation loss under 2.0 that follows it, and samples that a reader recognizes as the style of the corpus. A write-up that names the failure the candidate hit and fixed counts for more than a lower loss.

**Stretch goals that separate candidates**

Replace the learned positions with rotation of the queries and keys and show the validation loss is at least as low. Add a cache of keys and values to the sampling loop and show the 500-character sample runs 5 to 20 times faster. Train to 5,000 steps and report whether validation keeps improving.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What is the training loss at step zero and how do you know it is right? Expected: about the logarithm of the vocabulary size, about 4.2 for 65 symbols, because a random model is uniform.
- **Level 3:** How does a reviewer know your causal mask works without reading the code? Expected: a test that changes a later character and asserts the earlier logits are unchanged, and a loss that starts at the random baseline.
- **Level 3:** Why tie the head to the embedding at this size? Expected: it saves parameters and the lesson records a quality improvement; the head weight is the transpose of the embedding.
- **Level 4:** A candidate swaps the character tokenizer for a subword vocabulary of about 50,000. What else must change? Expected: the embedding and head grow from 65 rows to about 50,000, the model needs more capacity to use them, and the windows now cover more text per token.

**Wrong answers, and why they fail**

- "Use a bigger model to reach a lower loss within the time budget." A larger model trains slower on a laptop and the lesson's bar is reached at 800K parameters in about 6 minutes.
- "Skip the validation split; the corpus is tiny." The split is the only check against a leak and the reviewer looks for it first.
- "Report the sample quality instead of the loss." Samples are evidence, not a metric; the curves and the held-out loss are what a reviewer compares across candidates.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## A benchmark jumps between two model sizes

*Level 4 (staff) · concept · about 12 minutes*

Between two model sizes a benchmark accuracy goes from near zero to high. The team calls it an emergent ability and asks for a larger budget to find the next jump. How do you evaluate the claim before you sign?

:::answer Show the answer
:::say Short answer
Ask what the scorer is. Exact match and thresholded accuracy are discontinuous: a model that gets most digits right scores zero until it gets all of them right, so a smooth gain in the underlying probabilities shows up as a cliff. Re-score the same checkpoints with a continuous metric such as the cross-entropy of the target answers; if that curve is smooth, the jump belongs to the scorer and not to the model. Plan the budget against the continuous curve, which the scaling law predicts reliably.
:::

**Full answer**

**The argument**

The 2023 analysis of emergence showed that the abilities usually cited, arithmetic and multi-step reasoning among them, were measured with discontinuous scoring. Under a continuous metric the same models improve smoothly with scale. By 2026 the working consensus is: predictions from continuous loss are reliable, and benchmark jumps are often artifacts of the scorer.

**What to do with the checkpoints you have**

1. Keep the prompts and the targets fixed.
2. For each checkpoint, log the per-token probability of the correct answer and the cross-entropy over the answer tokens.
3. Plot both against the parameter count and against the training compute.
4. Add a partial-credit scorer, such as the share of correct digits, to see where the cliff disappears.

If the probability curve is smooth, the model was getting closer all along and the benchmark hid it.

**What it means for the budget**

Fit the loss on the checkpoints and read where the next size lands on the continuous curve. Then calibrate the discontinuous benchmark against that curve: at which loss does accuracy cross the product threshold? Sample more sizes near that point instead of betting on a surprise. A product threshold can be real for the user and still be predictable for the planner.

**Where real changes of regime do show up**

In-context learning, following a few examples with no fine-tuning, is usually described as appearing around the 6B to 13B range. The lesson's position is still to measure it with a continuous metric before you call it a discontinuity, because the same scorer problem applies.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Give an example of a discontinuous scorer and its continuous counterpart. Expected: exact match on a multi-digit answer against the log-probability or the digit-level accuracy of the same answer.
- **Level 4:** How does this change the way you plan a training budget? Expected: predict the loss from the law, calibrate the benchmark against the loss, and place runs near the threshold instead of hoping for a jump.
- **Level 4:** The product threshold really is binary for the user. Does the artifact argument still matter? Expected: yes; the threshold is real for the product, but its position is predictable from the smooth curve, which is what you need to budget.
- **Level 4:** What would convince you that a jump is not a scorer artifact? Expected: the continuous metric also shows a kink at the same scale, replicated across seeds and data orderings.

**Wrong answers, and why they fail**

- "Accuracy is the ground truth and loss is a proxy." Accuracy with a hard threshold throws away the information that shows the trend; the loss is what the model optimizes and what the law predicts.
- "Emergence means the scaling law broke." The law describes the continuous loss, which keeps its shape while the thresholded score jumps.
- "Train the bigger model and see." That is the expensive experiment the analysis lets you avoid; re-score what you already have first.

:::

## Design the attention stack for 128K context on one card

*Level 4 (staff) · design · about 15 minutes*

Design the attention stack of a new 70B-class decoder that must serve 128K-token contexts on a single 80 GB accelerator at batch size one. Cover the head layout, the positional scheme, the kernel, and the memory arithmetic that ties them together.

:::answer Show the answer
:::say Short answer
Start from the memory, because it decides the rest. With 8 key-value heads, 80 layers and a head size of 128 in a 16-bit type, the stored keys and values cost 4096 bytes per token per layer, about 10 GiB at 32K and 40 GiB at 128K before a single weight is loaded. So the head layout is grouped-query or latent attention, the stored type is reduced to FP8 to halve those bytes, the positional scheme is rotation with base scaling so that the model reaches 128K without a position table, and the kernel is a tiled one so that the N by N scores never touch main memory. Then count again: at 16 bits the weights of a 70B-class model alone are larger than the 80 GB card, so the weights also need a 4-bit type before the cache and the activations can fit beside them.
:::

**Full answer**

**Head layout**

Plain multi-head attention with 64 key-value heads at this scale would hold about 8 times more, about 80 GiB at 32K, which is the whole card. Grouped-query with 8 key-value heads is the production default and keeps nearly full quality. If the memory still does not close, latent attention compresses the keys and values to a low-rank vector and pays FLOPs at each step to decompress. The query heads stay at 64 with a head size of 128 in either case.

**The memory table**

```text
per token per layer = 2 * n_kv_heads * d_head * bytes
                    = 2 * 8 * 128 * 2 = 4096 bytes (4 KiB)
32K context         = about 10 GiB
128K context        = about 40 GiB
```

Halve the bytes per value with an FP8 cache and the 128K figure halves. Then add the weights. At 16 bits a 70B-class model needs two bytes per parameter, which is more than the whole 80 GB card before any cache is stored. At 8 bits the weights still fill most of the card. Only a 4-bit weight type leaves room for the FP8 cache at 128K and for the activations. Batch size one is the stated requirement; every additional concurrent request adds another cache.

**Positional scheme**

Rotation of the queries and keys, with a base scaled for the target length through NTK-aware scaling or YaRN. It adds no parameters, encodes relative distance, and the lesson's reference family reached 128K from 8K this way. A learned table would need 128K rows and would stop there. Linear-bias attention is a valid training-time alternative with strong extrapolation, but rotation gives a cleaner knob and matches the ecosystem.

**Kernel**

Attention is memory-bound from about 2K tokens, so a tiled kernel is not optional at 128K. Use the current tiled implementation for the hardware, with FP8 where the generation supports it, and keep the training kernel on the version that has a backward pass.

**What to measure before committing**

1. Perplexity at the target length and at the original short length after the long-context fine-tune.
2. Peak memory at 128K with the quantized weights, the cache and the activations on the card, and the quality loss from the 4-bit weights.
3. Time per token at 128K against 8K, to confirm the kernel and the cache behave linearly.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why not pick linear-bias attention for its extrapolation? Expected: it is a fair choice for a new model, but rotation has the long-context tooling and a base to scale, and neither can be swapped after training.
- **Level 4:** The product later asks for batch size 8 at 128K. What changes? Expected: the cache multiplies by 8, so latent attention, a smaller stored type, a shorter maximum length or more cards; the weights do not change.
- **Level 4:** Grouped-query from scratch or convert a multi-head checkpoint? Expected: from scratch for a new model; conversion with a fine-tune is for existing checkpoints and needs a quality check.
- **Level 4:** Where does Flash Attention stop helping? Expected: it removes the N by N traffic; it does not shrink the cache, which still grows linearly with the context, so the cache math dominates at 128K.

**Wrong answers, and why they fail**

- "Use full multi-head attention for quality; memory is cheap." At 128K the full cache alone exceeds the card.
- "The sinusoid handles any length, so the position scheme is solved." The formula extends but the model never saw those phases; rotation with base scaling is what reached 128K in practice.
- "Skip the tiled kernel on a quality model because it changes the output." It is exact up to 16-bit reordering and it is what makes long context affordable.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Split a fixed compute budget between size and tokens

*Level 4 (staff) · tradeoff · about 15 minutes*

You lead a pretraining run with a fixed compute budget. One plan trains a 175B-parameter model on 300B tokens. Another trains a much smaller model on far more tokens. Which do you pick, how do you defend it to leadership, and when would you deliberately train past the point that the scaling law calls optimal?

:::answer Show the answer
:::say Short answer
Compute is about 6 times the parameter count times the training tokens, so the budget fixes the product and leaves the split open. The compute-optimal split is about 20 tokens per parameter; the first plan has about 1.7 tokens per parameter, which the lesson calls ten times undertrained, and a 70B model trained on 1.4T tokens beat that 175B model on every benchmark at 2.5 times less inference cost. If the model will serve a large volume, go past the optimum on purpose: train smaller and longer, because training is paid once and inference is paid forever.
:::

**Full answer**

**The law**

```text
L(N, D) = A / N^alpha + B / D^beta + E
alpha about 0.34, beta about 0.28, E about 1.69, A about 406, B about 411
```

N is the non-embedding parameter count, D the training tokens, E the irreducible loss of the data itself. Minimize L under `C = 6 N D` and the two optimal quantities grow with about the square root of the budget:

```text
N_opt about 0.22 * (C / 6)^0.5
D_opt about 4.5  * (C / 6)^0.5
D_opt / N_opt about 20
```

The fitted exponents drift slowly, about 0.45 for N and 0.55 for D with the constants above, so the ratio moves with the budget; the lesson's code finds the optimum by grid search.

**What the two plans look like**

| Plan | N | D | Tokens per parameter |
|---|---|---|---|
| Large and short | 175B | 300B | about 1.7 |
| Compute-optimal | 70B | 1.4T | 20 |
| Inference-optimized | 8B | 15T | 1,875 |

The rows do not share one budget: the second and third rows use about twice the compute of the first, so they compare ratios, not alternatives at the same cost. The last row is a production model family that trained a small model ninety-four times past the compute-optimal ratio. For a service that answers a trillion tokens a month, inference dominates total cost, and a model that fits consumer hardware with a fraction of the latency wins even though its training loss per training FLOP was worse. The lesson's range for inference-dominated workloads is 100 to 500 tokens per parameter depending on serving volume.

**How to defend it**

1. Show the budget as `6 N D` and the loss contours over N and D; the first plan sits far from the valley.
2. Show the inference bill at the expected volume for each N; the small model's saving repeats every month.
3. Show the loss gap you accept by over-training, read from the law at the chosen N and D.

**What changes the constants but not the shape**

Data curation can shift the curves by more than 2 times effective compute. A mixture-of-experts model decouples total parameters from active FLOPs, so the law applies per active parameter. A better optimizer shifted the constant by about 2 times in one 2024 result. None of these change the power-law shape.

**The fine-tuning corollary**

The lesson's rule of thumb: if your task data holds fewer than 20 tokens per parameter of the base model, expect saturation at some loss floor. Treat it as a warning to measure, not as a rule for the base size.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What is the E term and why can no budget remove it? Expected: the irreducible loss, the entropy of the data itself; the law approaches it but never crosses it.
- **Level 4:** How does a sparse expert architecture change the plan? Expected: FLOPs follow the active parameters, so the optimal D is set against active N while total N sets memory.
- **Level 4:** The web runs out of high-quality tokens for your budget. What are the levers? Expected: the lesson puts filtered English at about 5 to 10 trillion tokens; the levers are synthetic data, multilingual and multimodal data, and better curation.
- **Level 4:** How would you check the law on your own stack before betting the budget? Expected: fit it on five small models from 100K to 10M parameters on the same data and compare the exponents with the published ones.

**Wrong answers, and why they fail**

- "The bigger model always wins at fixed compute." The 70B model trained on 1.4T tokens beat the 175B model trained on 300B.
- "Compute-optimal is also the cheapest model to serve." It minimizes training loss per training FLOP; serving cost scales with N, which is why production models over-train.
- "A loss prediction is useless because abilities appear suddenly." The continuous loss is smooth and predictable; sudden benchmark jumps are mostly scorer artifacts.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::
