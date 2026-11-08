---
track: aibank
title: "AI interview bank: Transformers (part 1 of 2)"
short: Transformers 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Count the attention work for 100 generated tokens

*Level 1 (screening) · estimate · about 6 minutes*

A decoder generates 100 tokens one at a time from an empty prompt. Count the token states each loop computes for the prefix: a naive loop, and a loop that caches the key and value vectors of earlier tokens. Then count the query-key comparisons that remain with the store, and name what the store deliberately leaves out.

:::answer Show the answer
:::say Short answer
The naive loop runs every prefix token through the layer again at every step, so it computes 1 plus 2 plus 3 and so on up to 100 token states, which is 5050 and grows with the square of the length. With the stored keys and values, each step computes the state of the new token only, 100 in total. The new query still meets every stored key, so the cached loop still makes 5050 query-key comparisons: the store removes the recomputed key and value vectors, not the comparisons. The store holds no queries, because a past token never asks a question again; only the newest token does.
:::

**Full answer**

**Why the prefix can be reused**

Every hidden state of a prefix token is deterministic once it is computed, and the causal mask means it never depends on a later token. So the key and the value of token t are the same at step t plus one as they were at step t. Recomputing them is pure waste.

**The two loops**

```text
naive:   step t recomputes t token states       -> 1 + 2 + ... + N = N (N + 1) / 2
cached:  step t computes one new token state    -> N
cached:  its one query meets t stored keys      -> N (N + 1) / 2 comparisons
```

For N equal to 100 the naive count is 5050 token states and the cached count is 100. The lesson's code runs a ten-token example and counts query-key comparisons instead: it prints the same count for both loops and confirms that the outputs match. At 100 tokens those comparisons total 5050 in both loops, so the attention step itself still grows with the length at each step. For a response of a few thousand tokens the naive count of token states is in the millions, most of them redundant.

**What is stored**

Per layer and per head, two growing lists: the keys and the values of every token so far.

```python
class KVCache:
    def append(self, layer, head, k, v):
        self.K[layer][head].append(k)
        self.V[layer][head].append(v)
```

The memory grows linearly with the generated length; that is the price for not recomputing the prefix.

**Why queries are not stored**

The query of a token is used once, at the step where that token is the newest one. After that, the token is only ever looked up, never looking. Storing queries would cost memory and buy nothing.

**What does not go away**

Generation is still serial: step t needs the token from step t minus one. The lesson calls this the autoregressive tax. Training avoids it by processing the whole sequence in one masked pass; inference cannot.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What grows in memory as generation proceeds? Expected: the stored keys and values, per layer and per head, one entry per generated token.
- **Level 2:** Why is a prefix token's key still valid after new tokens arrive? Expected: the causal mask means its hidden state only ever depended on earlier tokens, so later tokens cannot change it.
- **Level 2:** You edit one word in the middle of the prompt. What happens to the store? Expected: everything from that position on is invalid and must be recomputed; the part before it stays valid.
- **Level 3:** When does attention become bound by memory traffic instead of arithmetic? Expected: when the N by N score matrix is large enough that moving it through memory dominates; the lesson puts that at about 2K tokens and beyond.

**Wrong answers, and why they fail**

- "The store keeps the attention weights." It keeps keys and values; the weights are recomputed from the new query every step.
- "The store saves memory." It costs memory and saves compute; the trade is memory for the recomputed key and value vectors.
- "Queries must be stored too." A past token's query is never used again.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Shuffle the words and attention does not notice

*Level 1 (screening) · concept · about 6 minutes*

Take a sentence and shuffle its words. Feed both versions through a self-attention layer that has no positional signal. How do the two outputs relate, and what are the three families of fixes you would name?

:::answer Show the answer
:::say Short answer
The output rows come back shuffled in the same way and nothing else changes, because attention only computes pairwise similarities between tokens. Order carries meaning in language and code, so the model needs a second signal. The three fixes are a position vector added to the embedding, a learned table or a fixed sinusoid, a rotation of the queries and keys by an angle that grows with position, and a distance penalty added to the scores.
:::

**Full answer**

**Why the layer is blind**

The score matrix is `softmax(Q K^T / sqrt(d)) V`, built from dot products between pairs of tokens. Permute the rows of X and every dot product keeps its value; only its position in the matrix moves. The layer is permutation-equivariant by construction.

**Fix one: add a position vector to the input**

A learned table has one row per position, so it adds `max_context_length` times D parameters and has no row for a position past the trained length. A fixed sinusoid uses the formula

```text
angle = p / (10000 ** (2 * k / D))
emb[p, 2k]     = sin(angle)
emb[p, 2k + 1] = cos(angle)
```

with no parameters. The wavelength changes geometrically across dimensions. Low dimensions have the largest angle per position and the shortest wavelength, so they encode fine position; high dimensions have the longest wavelength and encode coarse position. The vector at position p plus k is a linear function of the vector at p, which gives attention an easy way to learn relative offsets. The position vector is summed with the token vector, not concatenated, so D stays constant and the model decides per feature how much position matters.

**Fix two: rotate the queries and keys**

Rotary position embedding rotates each pair of coordinates in Q and K by `pos * theta_i`, with `theta_i = base ** (-2i / d_head)` and a default base of 10000. The dot product of a rotated query and a rotated key then depends only on their distance. This is the dominant choice in 2026.

**Fix three: bias the scores**

Linear-bias attention adds `-m_h * |i - j|` to the score of query i and key j, with a slope per head. No table, no rotation, and strong extrapolation to longer inputs.

**Where each one lives**

The first family changes the input to the first layer. The other two act inside attention, on the projections or the scores, so they follow the same shape contract as the embedding stage without touching the embedding.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why add the two vectors instead of concatenating them? Expected: the sum keeps D constant through the network and lets the model weigh token and position per feature.
- **Level 2:** What does a learned position table cost that a sinusoid does not? Expected: `max_context_length` times D parameters, and it cannot be indexed past the trained length.
- **Level 2:** Why do the high dimensions of the sinusoid encode coarse position? Expected: their wavelength is longest, so they change slowly across positions.
- **Level 3:** Where in the block does the rotation apply? Expected: to Q and K inside attention, after the projection and before the score matmul, never to V.

**Wrong answers, and why they fail**

- "The softmax makes attention order-aware." The softmax normalizes a row of similarities; it has no idea which column is first.
- "Add the position as one extra number on the embedding." One scalar cannot give the dot products a usable signal; the schemes spread position across many dimensions or into the scores.
- "Position only matters for long sequences." A two-word sentence already changes meaning when its words swap.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Attention runs, and the context has the wrong shape

*Level 2 (working) · debug · about 8 minutes*

An attention module between an encoder and a decoder runs without any exception, but the model's accuracy slowly falls behind the reference implementation. When you print the context tensor, its second dimension is the encoder length instead of the decoder length. Walk me through the diagnosis.

:::answer Show the answer
:::say Short answer
A module that runs and still produces the wrong shape is a broadcast bug, and a silent broadcast is the worst attention bug because it degrades accuracy instead of crashing. Write the expected shapes first: scores and weights are batch by decoder length by encoder length, and the context is batch by decoder length by the encoder state width. Then find the matmul whose operands were swapped or not transposed, fix it with one transpose or reshape, and add asserts on the shapes and on the weights summing to one.
:::

**Full answer**

**The shape table**

| Tensor | Shape |
|---|---|
| Encoder states H | (T_enc, d_h); d_h is twice the hidden size for a bidirectional encoder |
| Decoder state s | (d_s,) |
| Score for one encoder position | scalar |
| Weights after the softmax | (T_enc,) for one decoder step |
| Context vector | (d_h,), the same shape as one encoder state |

Batched over decoder steps, the weights are `(batch, T_dec, T_enc)` and the context is `(batch, T_dec, d_h)`.

**How the wrong shape appears**

The context is `weights @ H`. If the code built the scores as `H @ H.T` because the query tensor was replaced by the encoder states, the shapes still multiply and the result has the encoder length where the decoder length belongs. Nothing raises. Downstream layers broadcast or reshape the tensor and the loss keeps falling, just more slowly.

**The diagnosis steps**

1. Print the shape of every intermediate tensor and compare with the table.
2. Check the score formula. For the additive form the projection vector collapses an attention-dimension vector to a scalar; for the dot form the query and the key must have the same width, and a bidirectional encoder doubles the key width, so the dot form fails unless a matrix W sits between them.
3. Check which decoder state feeds the query. One classic formulation uses the state before the current step and the other uses the state after it. Mixing them gives subtly wrong gradients that are very hard to see.
4. Fix with one transpose, reshape or projection. Refuse any fix that only silences the mismatch by broadcasting.

**The regression test**

```text
assert output.shape == (batch, T_dec, d_h)
assert weights.shape == (batch, T_dec, T_enc)
assert weights.sum(dim=-1) is close to 1
```

The third line catches a softmax taken over the wrong axis, which is the other silent bug in this layer.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which single test catches most attention bugs? Expected: the weights have shape batch by decoder length by encoder length and sum to one along the last axis.
- **Level 2:** The score matrix comes out square in the encoder dimension. What happened? Expected: the keys were scored against themselves; the query tensor was replaced by the encoder states.
- **Level 3:** Why does the plain dot score fail with a bidirectional encoder? Expected: the encoder state is twice the hidden width, so it no longer matches the decoder state; use the general form with a matrix between them.
- **Level 3:** Why is the state convention a gradient problem and not a shape problem? Expected: both states have the same shape, so nothing fails; the gradient flows to the wrong step and the model learns a slightly wrong alignment.

**Wrong answers, and why they fail**

- "Reshape the output to the expected shape and continue." The values inside are wrong; a reshape only hides the mismatch.
- "Lower the learning rate; the model is just unstable." The run is not unstable; it is computing the wrong quantity.
- "Add a mask to fix the shape." A mask changes which positions get weight, not the layout of the tensor.

:::

## Encoder, decoder or both for three products

*Level 2 (working) · tradeoff · about 8 minutes*

Three products land on your desk: a search ranking model over documents, a coding assistant that writes code, and a speech-to-text system. Which transformer shape do you pick for each, and what does the pretraining loss have to do with the choice?

:::answer Show the answer
:::say Short answer
Encoder-only for ranking and embeddings, decoder-only for generation, and encoder-decoder when the input is a clear source sequence such as audio to transcribe. An encoder reads both sides of every position and trains on masked prediction, which gives strong representations and no way to generate. A decoder trains on next-token prediction behind a causal mask, so it can generate, and it scales cleanest, which is why it won language. The loss decides whether the model can produce text at all.
:::

**Full answer**

**The three skeletons**

| Need | Shape | Why |
|---|---|---|
| Classification, embeddings, question answering over text | Encoder-only | Bidirectional attention sees the whole input at once |
| Text generation, chat, code, reasoning | Decoder-only | Causal mask plus next-token loss; one pass of attention and FFN per layer |
| Structured input to structured output, translation, speech recognition | Encoder-decoder | The encoder owns the source; the decoder generates and reads it through cross-attention |

**The one line that separates them**

A decoder predicts each token's probability given the tokens before it. An encoder predicts a masked token given the unmasked ones. Same block, same attention, different mask and different target. Only the first loss produces a model that can continue a sequence.

**Cross-attention**

A decoder block in an encoder-decoder model has three sublayers: masked self-attention, cross-attention and the FFN. In cross-attention the queries come from the decoder and the keys and values come from the encoder output. It is the only place where information flows from the source to the output. A pure decoder drops it.

**Why decoder-only won language**

It handles comprehension and generation with one architecture, it scales cleanly, and in-context learning let one model follow examples without a new head per task. Encoder-decoder is still the best fit when the input has a strong source identity: a waveform, a sentence in another language, a table to summarize.

**The three answers**

1. Ranking: an encoder, or an embedding model built on one, because you need a representation of the whole document and no generation.
2. Coding assistant: a decoder, because the product is generation and the causal loss is what makes generation possible.
3. Speech-to-text: an encoder-decoder, because the audio is a source sequence of its own kind and the text is a different sequence.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which sublayer exists only in the encoder-decoder shape? Expected: cross-attention, with queries from the decoder and keys and values from the encoder.
- **Level 3:** Why can a decoder-only model also do comprehension tasks? Expected: the same next-token model answers a question by continuing a prompt, and in-context learning lets it follow examples without a task head.
- **Level 3:** When would you still choose encoder-decoder for a text task? Expected: when the input is a clear source sequence that the output transforms, such as translation or summarization of a fixed document.
- **Level 4:** The ranking team wants to reuse the decoder they already serve. How? Expected: prompt it and read the logits of a label token, or attach a head and fine-tune; weigh the cost against an encoder that scores documents in one pass.

**Wrong answers, and why they fail**

- "A decoder-only model cannot classify." It can, by prompting or by adding a head; the point is that an encoder is often cheaper for that job.
- "An encoder generates text one token at a time." It has no causal loss and predicts masked positions; it is not trained to continue a sequence.
- "Every transformer block has cross-attention." Only the decoder blocks of an encoder-decoder model have it.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## One reshape is right and one scrambles the heads

*Level 2 (working) · code-reading · about 8 minutes*

Two versions of a head split landed in review. `X` has shape `(n, d)` with `n` tokens and `d` features.

```python
def split_a(X, n_heads):
    n, d = X.shape
    d_head = d // n_heads
    return X.reshape(n, n_heads, d_head).transpose(1, 0, 2)

def split_b(X, n_heads):
    n, d = X.shape
    d_head = d // n_heads
    return X.reshape(n_heads, n, d_head)
```

Both return a tensor of shape `(n_heads, n, d_head)` and both run without error. Which one is right, what does the other one do to the data, and what test would have caught it?

:::answer Show the answer
:::say Short answer
The first version is the right one: `split_a` groups the `d` features of each token into `n_heads` slices of width `d_head` and then moves the head axis to the front. `split_b` reads the same memory in the wrong order: it cuts the flat buffer into `n_heads` equal chunks and calls each chunk a head, so one head now holds runs of consecutive tokens, a chunk can end inside a token, and the columns no longer line up with the projection that produced them. The test is the round trip: combining the split must return `X` exactly, and head `h` must equal the column slice `X[:, h * d_head:(h + 1) * d_head]`.
:::

**Full answer**

**What the shapes mean**

After the projection, each token's `d` features are the concatenation of `n_heads` groups of `d_head` features. A head is a column slice across every token. The reshape `(n, n_heads, d_head)` keeps each token's row intact and only regroups its columns; the transpose then puts the head axis first so that the per-head attention becomes a batched operation over heads.

**Why the wrong version still runs**

Both tensors have `n * d` elements, so NumPy and PyTorch are happy to reinterpret the memory. A reshape of a contiguous array does not move data; it only changes how the flat buffer is indexed. `split_b` therefore cuts the buffer into `n_heads` equal chunks. When `n` is divisible by `n_heads`, head zero holds the first `n / n_heads` tokens with all of their features; otherwise a chunk ends inside a token. The scores inside that head compare the wrong vectors, and the model trains to something, which is why this bug can survive for weeks.

**The combine must be the exact inverse**

```python
def combine_heads(H):
    h, n, d_head = H.shape
    return H.transpose(1, 0, 2).reshape(n, h * d_head)
```

Transpose back first, then reshape. Reshaping directly from `(h, n, d_head)` to `(n, h * d_head)` makes the same mistake in reverse, and the output projection sees scrambled features.

**The production shape contract**

With a batch dimension the intermediate tensors are `(B, H, T, d_head)`. The head dimension sits next to the batch so that the accelerator treats the per-head attention as `B * H` independent problems, and `d_head` stays last so that `Q @ K.transpose(-2, -1)` contracts it. The constraint is `D % H == 0`.

**Tests that catch it**

1. `combine_heads(split_heads(X)) == X`.
2. `split_heads(X)[h] == X[:, h * d_head:(h + 1) * d_head]` for every head.
3. Single-head attention on the slice equals the head's output from the batched path.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a reshape never raise here? Expected: it only reinterprets a buffer with the same number of elements; the data is not checked for meaning.
- **Level 2:** Why must `d_head` stay the last axis? Expected: the score matmul contracts the last axis of Q with the second-to-last of the transposed K.
- **Level 3:** How does grouped-query attention reuse this code? Expected: split K and V into `n_kv_heads` heads and repeat each along the head axis `n_heads // n_kv_heads` times to match Q.
- **Level 3:** A model trained with the wrong split reaches a decent loss. Why does that not clear the bug? Expected: the projections learned to work with the scrambled layout, but the heads no longer correspond to subspaces of the input and any pretrained weights or exported checkpoints will be wrong.

**Wrong answers, and why they fail**

- "Reshape and transpose are interchangeable when the shapes match." A reshape reinterprets memory and a transpose moves axes; the order decides which elements land together.
- "If it runs and the loss falls, it is correct." The loss falls for the wrong layout too; only the round-trip and slice tests prove the layout.
- "Each head needs its own weight matrix, so the split is irrelevant." The heads are slices of one projection; the split is what defines them.

:::

## Pick the attention variant for a 70B decoder

*Level 2 (working) · tradeoff · about 10 minutes*

You are choosing the attention variant for a new 70B-class decoder: full multi-head, multi-query, grouped-query, or MLA with its compressed latent. What does each one do to the memory that decoding holds per token, and what do you give up with each?

:::answer Show the answer
:::say Short answer
All four keep the same number of query heads; they differ in how many key and value heads exist, and only the keys and values are stored during decoding. Multi-query shares one key-value head across every query head, the smallest cache and some quality loss. Grouped-query uses a group of key-value heads, cuts the cache by `n_heads / n_kv_heads` and keeps nearly full quality, which is why it is the default. Latent attention compresses keys and values to a low-rank vector and decompresses at attention time, so it saves even more memory and pays extra FLOPs.
:::

**Full answer**

**The lineage**

| Variant | Query heads | Key-value heads | Cache cost |
|---|---|---|---|
| Multi-head | N | N | full |
| Multi-query | N | 1 | smallest, quality loss |
| Grouped-query | N | G, for example N / 8 | shrinks by N / G |
| Multi-head latent | N | compressed to a low-rank latent | smaller still, more compute |

**What the cache holds**

Per layer and per token, the stored bytes are `2 * n_kv_heads * d_head * dtype_size`, where the 2 counts the key and the value. The query of a past token is never needed again, so it is not stored. A 70B-class model with 80 layers, a head size of 128 and 8 key-value heads in a 16-bit type holds 4096 bytes per token per layer, about 10 GiB for a 32K context and 40 GiB at 128K. The same model with 64 key-value heads would hold 8 times more, about 80 GiB at 32K. That is the whole memory of a large accelerator spent on one request.

**The quality side**

Grouped-query keeps the query heads, so each head still asks its own question; it only shares the answers it can look up. The published work converts trained multi-head checkpoints to grouped-query with a fine-tune and reports nearly full quality. Multi-query shares a single answer set across all heads and loses more. Latent attention trades compute for memory: the latent must be projected back to keys and values on every step.

**Grouped-query in code**

Only the key and value projections change. They produce `n_kv_heads` heads, and each is repeated to match the query heads:

```python
def gqa_project(X, W, n_kv_heads, n_heads):
    kv = split_heads(X @ W, n_kv_heads)
    repeat = n_heads // n_kv_heads
    return np.repeat(kv, repeat, axis=0)
```

At inference only the `n_kv_heads` copies live in the cache, not the repeated ones.

**The pick**

For a 70B decoder with long contexts to serve, grouped-query with a small group is the safe default. Latent attention is the choice when memory is the binding constraint and you accept the compute cost and the engineering.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which numbers set the stored bytes per token? Expected: layers, key-value heads, head size and bytes per value, times 2 for the key and the value; the parameter count does not enter.
- **Level 3:** Why does latent attention cost more compute per step? Expected: the stored latent has to be projected back to full keys and values at every decode step before the scores are computed.
- **Level 3:** Can you move an existing multi-head checkpoint to grouped-query? Expected: yes, the grouped-query paper converts trained checkpoints and fine-tunes; measure quality on your own eval before you ship.
- **Level 4:** The product wants 128K contexts at batch size one on a 40 GB card. Which variant and what else? Expected: grouped-query alone already fills the card at 128K, so latent attention or a smaller key-value type, and the weights still need their own memory.

**Wrong answers, and why they fail**

- "Grouped-query reduces the compute of attention." The scores are still computed for every query head; the saving is in the stored keys and values.
- "Multi-query is free." It shares one answer set across all heads and the lesson records a quality loss.
- "The cache size follows the parameter count." It follows the key-value heads, the layers, the head size and the data type.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## The loss collapses and the samples are nonsense

*Level 2 (working) · debug · about 8 minutes*

A new decoder-only language model on a vocabulary of 64 tokens reaches a training loss near zero after only some hundreds of steps, and the sampled text is nonsense. Name the two most likely causes and the check that tells them apart.

:::answer Show the answer
:::say Short answer
On real text, a loss far below the logarithm of the vocabulary size this early, with nonsense samples, most likely means the model can see its own target. Either the causal mask is missing, so position i reads the token at i plus one through attention, or the targets were never shifted, so the input and the target are the same sequence. Check the attention weights: if any mass sits above the diagonal the mask is gone; if the weights are triangular, print one batch and compare the input and target columns.
:::

**Full answer**

**What a healthy run looks like**

At the first step the loss should sit near the logarithm of the vocabulary size, about 4.16 for 64 tokens. On the lesson's repeat task it falls to well under 1.0 over three epochs because the next token equals the previous one. A loss that reaches zero on real text is not learning; it is copying.

**Cause one: the mask**

The mask replaces every entry above the diagonal of the score matrix with minus infinity before the softmax. Forget it and every position attends to the whole sequence, including the answer. The lesson's phrase: forget the mask and you train a model that cheats. Common ways to lose it: the mask buffer is built for the maximum context and never sliced to the current length, the mask is applied after the softmax, or the attention call takes a flag that defaults to non-causal.

**Cause two: the shift**

Given tokens `[t1, t2, t3, t4]`, the input is `[t1, t2, t3]` and the target is `[t2, t3, t4]`. If the data loader returns the same window twice, the model learns the identity. The loss collapses even with a perfect mask.

**The checks**

1. **Causality test.** Perturb a token at position j and assert that the outputs at positions before j do not change. The lesson's test suite pins this property.
2. **Triangle test.** Return the attention weights for one head and confirm the upper triangle is exactly zero after the softmax.
3. **Batch inspection.** Print one input and target pair and confirm the target is the input shifted left by one.
4. **Held-out check.** Compute the loss on held-out text with the same pipeline. A model that memorized a small corpus has a high held-out loss and samples that copy the training text; a leak gives nonsense samples.

**Why sampling exposes it**

During training the answer leaks through the input, so the loss is low. At sampling time the model has nothing to copy from, so it emits noise. A model that learned the real task is good at both.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What loss do you expect at step zero, and why? Expected: about the logarithm of the vocabulary size, about 4.16 for 64, because a random model spreads probability evenly.
- **Level 2:** How do you make the shift mistake impossible in the loader? Expected: slice one window of length T plus 1 and return `window[:-1]` and `window[1:]` from the same slice, with a test on one example.
- **Level 3:** Write the causality unit test in one sentence. Expected: change the token at position j, run the block again, and assert that every output before j is unchanged.
- **Level 3:** The mask and the shift are right, and the loss is still suspiciously low. What else leaks? Expected: a validation window that overlaps the training stream, or padding tokens counted as easy targets; check the split and the loss mask.

**Wrong answers, and why they fail**

- "The model is just learning fast." A loss near zero on natural text is not possible without seeing the target.
- "Add dropout to regularize it." Dropout does not stop a leak; it only makes the copy slightly noisier.
- "Lower the learning rate." The optimization is fine; the objective is broken.

**Related lesson in this course:** [Deep dive 1: language models in depth](#aideep-1)

:::

## What the skip path does and where dropout may go

*Level 2 (working) · concept · about 8 minutes*

A transformer block has two skip paths, one around attention and one around the feed-forward network. What do they do for training, which of the two sublayers moves information between tokens, and why does a dropout layer placed on the skip path itself break something?

:::answer Show the answer
:::say Short answer
The skip path makes the gradient additive across depth, so its norm stays in scale through a twelve-layer stack instead of shrinking at every layer, and it lets each block learn a small update to a running representation instead of a full replacement. Only attention mixes tokens; the MLP applies the same two layers to every position on its own. Dropout belongs after the attention softmax, on the attention output before the residual add, and after the second linear of the MLP; on the skip path it breaks the identity that carries the gradient, and early stacks that did this trained brittly.
:::

**Full answer**

**The block as a function**

A decoder block takes a tensor of shape `(batch, sequence, embedding)` and returns the same shape. Inside, two sublayers do the work:

```text
x = x + attention(norm(x))
x = x + mlp(norm(x))
```

Each line is an additive update to the stream that flows top to bottom through every block. The lesson calls that tensor the residual stream.

**Why the additive path matters**

Without the skip path, gradients vanish past about six layers. With it, the gradient of the loss with respect to an early layer has a direct term that does not pass through the sublayers, so depth adds terms instead of multiplying attenuations. The second effect is representational: a block does not have to reproduce its input; it adds what it learned.

**Who talks to whom**

Attention is the only place tokens exchange information. The MLP is position-wise: the same weights apply to every token independently, with a hidden width of four times the embedding width and a GELU in the classic block. The modern block uses SwiGLU, three matrices at about 2.6 times the width so that the parameter count matches the old four-times MLP, and it drops the bias terms.

**Dropout on the branches, never on the identity**

Attention dropout after the softmax, residual dropout on the attention output, and residual dropout after the second linear of the MLP. Dropout applied to the identity term randomly removes part of it, and the gradient path that made depth tractable is no longer reliable.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which sublayer would you remove if the model only needed per-token transformations? Expected: attention; the MLP never looks across positions.
- **Level 3:** Why does the modern FFN use an expansion of about 2.6 instead of 4? Expected: SwiGLU has three weight matrices, so 2.6 times the width matches the parameter count of the two-matrix MLP at 4 times.
- **Level 3:** Why do modern stacks drop the bias terms in the linear layers? Expected: the lesson reports a slight perplexity improvement and a smaller model.
- **Level 4:** A reviewer wants to regularize a small model by dropping out the identity term. Your answer? Expected: no; keep dropout on the branch outputs, because the additive identity is what lets the gradient reach early layers.

**Wrong answers, and why they fail**

- "The skip path exists to keep the output shape equal to the input shape." The shape would match anyway; the skip path is about gradient flow and additive updates.
- "Dropout anywhere inside the block is equivalent." Dropout on the identity term damages the gradient path; dropout on the branch outputs does not.
- "The feed-forward network mixes information between tokens." It applies the same MLP to each position alone; mixing happens only in attention.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## Why the norm moved in front of the sublayer

*Level 2 (working) · tradeoff · about 8 minutes*

The 2017 paper placed the layer normalization after the residual add. Almost every model since about 2019 places it before the sublayer. What changed, how would you demonstrate the difference in one afternoon, and what does RMSNorm change on top of that?

:::answer Show the answer
:::say Short answer
Post-norm sends the gradient of the skip path through a normalization at every layer, so at depth the gradient shrinks and the run needs a warmup schedule to survive. Pre-norm keeps the skip path unnormalized, so the gradient reaches the embeddings cleanly and a deep stack trains without warmup tricks. Demonstrate it by stacking twelve layers of each variant with the same initialization and printing the gradient norm at the embedding after one backward pass. RMSNorm then drops the mean subtraction, one fewer operation, with the same stability in practice.
:::

**Full answer**

**The two placements**

```text
pre-norm:   x + sublayer(LN(x))
post-norm:  LN(x + sublayer(x))
```

Same shapes, different training behavior. In the post-norm block the residual add is followed by the norm, so the signal that flows down the stack is normalized at each layer and the gradient that flows back must pass through every norm. At a depth of twelve and a learning rate of `3e-4` that gradient shrinks fast enough to need warmup. In the pre-norm block the norm sits inside the branch, before attention and before the MLP, and the skip path carries the raw signal.

**The afternoon experiment**

1. Build a six-layer or twelve-layer stack with a `pre_ln` flag.
2. Feed the same random input to both variants with identical weights.
3. Run one backward pass and print the gradient norm at the embedding.

The pre-norm stack shows an embedding gradient about an order of magnitude larger than the post-norm stack at the same learning rate.

**What pre-norm needs that post-norm did not**

A final norm before the output head. The residual stream is unnormalized in a pre-norm model, so the head needs one normalization at the end.

**RMSNorm**

LayerNorm subtracts the mean and divides by the standard deviation. RMSNorm divides by the root mean square and skips the mean subtraction. It is one operation cheaper and is empirically at least as stable, which is why the modern block uses it.

**Where dropout goes**

After the attention softmax, on the attention output before the residual add, and after the second linear of the MLP. Never on the skip path itself, because that breaks the additive identity that lets the gradient flow at depth.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Where exactly does the norm sit in a pre-norm block? Expected: inside each residual branch, before attention and before the MLP, plus one final norm before the head.
- **Level 3:** Why does a pre-norm model need a final norm when a post-norm model does not? Expected: the pre-norm skip path is unnormalized, so the head would see an unbounded stream without it.
- **Level 3:** Your six-layer post-norm model trains fine and the twenty-four-layer version diverges. Why? Expected: the skip-path gradient attenuates at every norm, and the effect compounds with depth; add warmup or switch to pre-norm.
- **Level 4:** What would convince you to keep LayerNorm instead of RMSNorm? Expected: a measured quality or stability difference on your own run; the lesson's evidence is that RMSNorm matches it while being cheaper.

**Wrong answers, and why they fail**

- "The two placements compute the same function in a different order." The composition differs: one normalizes the stream, the other normalizes only the branch input.
- "Warmup is a learning-rate detail unrelated to the norm." The lesson ties the need for warmup directly to the post-norm gradient path.
- "RMSNorm needs the mean to be stable." It omits the mean on purpose and matches LayerNorm in practice.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## A heatmap is not an explanation

*Level 3 (senior) · concept · about 10 minutes*

A paper draft shows attention heatmaps as proof that the model "reasons over the right tokens". You are the reviewer. What do you say about the heatmaps, and what would convince you that a given head does something specific?

:::answer Show the answer
:::say Short answer
Attention weights are a distribution over positions, and on their own they are not an explanation: for some tasks they can be permuted or replaced by arbitrary alternatives without changing the prediction, so a heatmap shows where mass went, not that it mattered. Ask for an ablation or a counterfactual, zero or shuffle the head and show that the prediction moves. The head roles that have survived probing are specific and testable: heads that attend to the previous token, copy heads, and induction heads that find an earlier occurrence of the current token and copy what followed it.
:::

**Full answer**

**The caveat from the literature**

A 2019 study showed that on some tasks the attention distribution can be permuted, or swapped for an adversarial alternative, while the output stays the same. The lesson's rule follows: never report attention weights as evidence of reasoning without an ablation or a counterfactual check. Reviewers like heatmaps because they are easy to read; that is a reason to be careful, not a reason to accept them.

**What a head can show you**

The inspection hook in the lesson's block returns the per-head weights of shape `(B, H, T, T)`. In a trained model the patterns differ by head: some attend to the token just before, some to the start of the sequence, some spread almost uniformly. Those are descriptions. Turning a description into a claim takes an intervention.

**The evidence that convinces**

1. **Ablation.** Zero the head's output or replace its weights with a uniform row and measure the change in loss or in the specific prediction. A head that matters moves the number.
2. **Counterfactual input.** Change the token the heatmap points at and show that the output changes in the direction the story predicts.
3. **A behavioral test for the claimed role.** For an induction head, feed a random token sequence repeated twice and show that the head attends from each token to the token that followed its first occurrence, and that ablating the head removes the copying.
4. **Replication across seeds and prompts.** One heatmap on one example is an anecdote.

**What to write in the review**

Ask the authors to keep the heatmaps as illustration and to add the intervention results as the evidence. If the ablation does not move the prediction, the heatmap was decoration.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** A head attends almost uniformly across positions. What does that tell you? Expected: little on its own; it may carry an average or nothing, and only an ablation says which.
- **Level 3:** Describe a test for an induction head in one sentence. Expected: repeat a random token sequence and check that the head attends from each token to the token after its earlier occurrence, with ablation removing the copy behavior.
- **Level 4:** Why can the weights be permuted without changing the output? Expected: the values at the attended positions may carry near-identical information, other heads may be redundant, and later layers can compensate.
- **Level 4:** What replaces the heatmap as the headline figure? Expected: the change in loss or in the target probability under ablation and counterfactual edits, with a band across seeds.

**Wrong answers, and why they fail**

- "A high weight means the token caused the output." Weight shows where the lookup went; causation needs an intervention.
- "Average the heads to get the model's attention." Heads do different things; the average hides the roles and still is not evidence.
- "If the heatmap matches human intuition, the model reasons like a human." Agreement with intuition is not a test; the permutation result shows intuitive maps can be irrelevant to the output.

:::

## Count the parameters of a decoder stack by hand

*Level 3 (senior) · estimate · about 10 minutes*

Count the parameters of a decoder stack with a model width of 4096, 32 layers and a SwiGLU feed-forward network at an expansion of 2.6. Then add an untied embedding and output head for a vocabulary of 128K. Where does the total land, and why is the published model of that size a little different?

:::answer Show the answer
:::say Short answer
Per block, attention takes `4 d^2` for the four projections and SwiGLU takes `3 d (r d)`, about `3 r d^2`. At the given width and expansion that is about 67M plus 131M, about 198M per block, and 32 blocks give about 6.3B. The untied embedding and head add about 1B, so the stack lands near the published 8B. The real model uses grouped-query attention, which shrinks the key and value projections, and a wider FFN at an expansion of 3.5, which moves parameters from attention to the FFN while the total stays close.
:::

**Full answer**

**The per-block arithmetic**

```text
attention:  Q, K, V, O projections, each d x d        -> 4 d^2
FFN:        three matrices of d x (r d)               -> 3 r d^2
norms:      two vectors of length d                   -> negligible
```

With `d = 4096` and `r = 2.6`:

```text
4 * 4096^2        = about 67M
3 * 2.6 * 4096^2  = about 131M
per block         = about 198M
32 blocks         = about 6.3B
```

**The embeddings**

An untied model has a token embedding of shape `(vocab, d)` and a separate head of the same size. At 128K by 4096 the pair adds about 1B. A tied model shares the matrix and saves half of that.

**Why the published number differs**

Two architectural choices move the count without changing the total much:

1. **Grouped-query attention.** The key and value projections map `d` to `n_kv_heads * d_head` instead of `d` to `d`, so attention holds fewer than `4 d^2` parameters.
2. **A wider FFN.** The published model uses an expansion of about 3.5, so the FFN holds more than the `3 * 2.6 * d^2` counted above.

The total still lands near 8B. The FFN holds about two thirds of the block parameters in either version.

**What the count is for**

Memory for the weights at a given data type, the bound on the cache budget that remains on the card, and a sanity check when a config file or a model card looks wrong.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why are the norms negligible? Expected: each norm is one or two vectors of length d, thousands of parameters against millions per matrix.
- **Level 3:** How does grouped-query attention change the per-block count? Expected: the K and V projections shrink to `d` by `n_kv_heads * d_head`, so attention holds less than `4 d^2`.
- **Level 3:** Why does an expansion of 4 with two matrices equal an expansion of about 2.6 with three? Expected: `2 * 4 d^2 = 8 d^2` and `3 * 2.6 d^2` is about `8 d^2`; the modern block kept the parameter budget and changed the activation.
- **Level 4:** The team ties the embedding and the head. What changes in the count and what do you check? Expected: about half of the 1B disappears; check that the output logits still use the transpose of the embedding and that quality holds.

**Wrong answers, and why they fail**

- "The parameter count grows with the sequence length." No weight depends on the sequence; the length changes activation memory and compute, not parameters.
- "The embedding is a rounding error." At 128K by 4096 it is about 1B, more than a tenth of the model.
- "Attention is where most of the parameters are." The FFN holds about two thirds of each block.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## Is a tiled attention kernel an approximation

*Level 3 (senior) · concept · about 10 minutes*

A colleague refuses to enable Flash Attention on a quality-sensitive model because "approximate attention changes the outputs". Is it an approximation? Explain what the kernel changes and what it keeps, with the memory argument that motivated it.

:::answer Show the answer
:::say Short answer
It is exact. The kernel tiles the computation so the full N by N score matrix never lands in the GPU's main memory; each tile is scored, exponentiated and accumulated in on-chip memory with a running maximum and a running sum, and the final normalization matches the single-pass softmax up to floating-point reordering. What changes is the memory traffic: three round trips to main memory become one write per output tile, and the footprint drops from N squared to N. The numbers that leave the kernel are the same as standard attention.
:::

**Full answer**

**Why standard attention is slow**

```text
S = Q @ K^T       read Q and K, write an N x N matrix
P = softmax(S)    read N x N, write N x N
O = P @ V         read N x N and V, write N x d
```

Three round trips through high-bandwidth memory. On the reference accelerator that memory moves about 3 TB/s while the on-chip memory moves about 30 TB/s, so every round trip is a factor-of-ten slowdown against keeping the data on chip. From about 2K tokens, attention becomes memory-bound before it becomes compute-bound, and classic kernels underuse the hardware by 4 to 10 times.

**The tiling**

```text
for each block of Q (about 128 x 128):
    load the Q tile on chip
    for each block of K, V:
        load the K and V tiles on chip
        scores for the tile
        running softmax aggregation
        accumulate into the output tile
    write the output tile once
```

The score matrix exists only one tile at a time. The backward pass recomputes some values instead of storing them, which is a second memory win.

**Why the result is exact**

The softmax needs the global maximum and the global sum over a row, and the kernel only sees one tile at a time. It keeps a running pair, maximum and sum, and whenever a new tile raises the maximum it rescales the earlier sum and the earlier partial output by the exponential of the old maximum minus the new one. At the end every term is expressed against the same global maximum and divided by the same global sum. The lesson's description is "bit-identical output to standard attention", with the caveat that 16-bit arithmetic is not associative, so reordering can move the last bits.

**Versions**

| Version | Year | Change | Speedup on the reference hardware |
|---|---|---|---|
| Flash 1 | 2022 | tiled on-chip kernel | 2 times on the earlier accelerator |
| Flash 2 | 2023 | better parallelism, causal-first ordering | 3 times on the same |
| Flash 3 | 2024 | asynchrony and FP8 on the newer accelerator | 1.5 to 2 times |
| Flash 4 | 2026 | five-stage pipeline for the latest generation | inference-first, forward pass only at launch |

**What to tell the colleague**

Run the two kernels on the same inputs and compare the outputs. The difference is at the level of 16-bit rounding, the same noise you get from a different batch size, not a change to the model.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the kernel keep a running maximum and not just a running sum? Expected: numerical stability; exponentials of raw scores overflow, so every exponential is taken relative to the maximum seen so far and rescaled when it changes.
- **Level 3:** Why recompute values during training instead of storing the softmax output? Expected: storing it would mean materializing the N by N matrix, which is the thing the kernel avoids.
- **Level 4:** The newest version is forward-only at launch. What does that mean for your stack? Expected: serving can use it, training keeps the previous version until the backward kernel ships.
- **Level 4:** Is the output identical across batch sizes? Expected: not bit for bit, because the reduction order changes in 16-bit arithmetic; that is a determinism question, not an approximation.

**Wrong answers, and why they fail**

- "It drops small attention weights to save work." Nothing is dropped; every key contributes through the running sum.
- "It only helps at very long context." It helps whenever attention is memory-bound, and the lesson reports 2 to 4 times on the earlier accelerator for ordinary lengths.
- "It reduces the FLOPs of attention." The arithmetic is the same; the saving is in memory traffic.

**Related lesson in this course:** [Lecture 4: Training LLMs: pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT and LoRA](#lectures-4)

:::
