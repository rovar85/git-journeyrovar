---
track: aibank
title: "AI interview bank: Tokenization, sampling and decoding (part 2 of 2)"
short: Tokenization, sampling 2
sub: 8 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Read one speculative step and defend each line

*Level 3 (senior) · code-reading · about 12 minutes*

Read this toy speculative step from the lesson. `q_model` is the verifier and `p_model` is the draft; each returns a probability vector for the next token given a prefix.

```python
def spec_step(prefix, q_model, p_model, N, rng):
    drafts, p_probs = [], []
    ctx = list(prefix)
    for _ in range(N):
        p_dist = p_model(ctx)
        d = sample(p_dist, rng)
        drafts.append(d)
        p_probs.append(p_dist[d])
        ctx.append(d)

    q_dists = [q_model(prefix + drafts[:i]) for i in range(N + 1)]

    for i, d in enumerate(drafts):
        u = rng.random()
        if u < min(1.0, q_dists[i][d] / p_probs[i]):
            prefix = prefix + [d]
        else:
            res = residual_dist(q_dists[i], p_model(prefix))
            prefix = prefix + [sample(res, rng)]
            return prefix
    return prefix + [sample(q_dists[N], rng)]
```

Why does `q_dists` hold N plus 1 entries, what happens when the first draft token fails the test, and why does the residual use `p_model(prefix)` rather than `p_probs[i]`?

:::answer Show the answer
:::say Short answer
The verifier gives a distribution at every drafted position and one more, N plus 1 in total, because when every draft is accepted the extra distribution supplies a bonus token at no extra verifier cost. At the first rejection at position i the code samples from the residual, the positive part of the verifier's distribution minus the draft's, renormalized, appends that token and returns, so every later draft is discarded. The residual needs the draft's whole distribution at that position, a vector, and `p_probs[i]` kept only the scalar probability of the token that was drafted.
:::

**Full answer**

**Why the rule is exact**

Accepting a drafted token with probability `min(1, q(d) / p(d))` and otherwise sampling from `(q - p)` clamped at zero and renormalized gives samples distributed exactly as q. The theorem holds however poor p is: a bad draft rejects more often, and the output distribution does not move. That is the only reason the method is allowed in production. It is a latency optimization with no quality trade.

**Why N plus 1 verifier distributions**

The verifier is queried on the prefix plus the first i drafts for i from zero to N. The first N distributions judge the drafts. The last one is the verifier's own next-token distribution after all N drafts; if everything was accepted it is free, and the step emits N plus 1 tokens from one verifier pass. In the toy the N plus 1 calls stand for a single batched forward pass over the prefix plus the drafts.

**The rejection branch**

Return after the first rejection. Positions after it were drafted on a context that is now known to be wrong, so their verifier distributions are not for the sequence that is being generated. The step always produces at least one token, the residual sample, and at most N plus 1.

**The residual needs a vector**

`residual_dist(q, p)` subtracts the two distributions element by element, clamps negatives to zero and renormalizes. `p_probs[i]` is one number, the draft's probability of the drafted token, enough for the acceptance test and not for the residual. The call `p_model(prefix)` recomputes the draft's full distribution at the position being corrected; in a real implementation the draft's distributions are kept from the drafting loop instead of being recomputed.

**The greedy case**

At temperature zero the rule collapses to a comparison: accept if the drafted token equals the verifier's argmax, otherwise emit the argmax and stop.

**How you would test it**

Run the step 10,000 times and compare the histogram of produced tokens with direct samples from q; a chi-square test passes within sampling error. Then perturb p away from q and watch the acceptance rate fall while the histogram stays put.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** `p_probs[i]` is zero and the code divides by it. Can that happen? Expected: no, the token was sampled from p so its probability is positive; the production version still guards the division and accepts when p is zero.
- **Level 3:** When does `residual_dist` divide by zero, and what should it return? Expected: when q is nowhere larger than p, which means the two are equal; return q itself.
- **Level 4:** What does the single batched verifier pass do to the verifier's stored keys and values? Expected: it extends them by N entries, and a rejection at position j must roll the logical length back to the accepted prefix plus the correction.
- **Level 4:** How many tokens does one step emit at minimum and at maximum? Expected: one, the residual sample at an immediate rejection; N plus 1 when every draft is accepted and the bonus token is sampled.

**Wrong answers, and why they fail**

- "Accept a draft whenever the verifier gives it a probability above a threshold." A threshold changes the output distribution; the ratio test with the residual is what keeps it exact.
- "On a rejection, resample from the verifier's distribution at that position." That over-weights tokens the draft already favored; the residual removes exactly that mass.
- "Drop the bonus token to be safe." It is a sample from the verifier's own distribution and costs nothing; dropping it wastes a token per step.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## Take-home, a byte-level tokenizer with tests

*Level 3 (senior) · take-home · about 15 minutes*

This is a take-home we send: implement a byte-level byte-pair tokenizer with training, encoding and decoding, two reserved special tokens, and a test suite. Describe the design you would submit, the tests you would ship, and the one figure you would include in the write-up.

:::answer Show the answer
:::say Short answer
Reserve ids 0 to 255 for the raw bytes and a small block above them for the end-of-text and pad markers, split the corpus on whitespace and punctuation, train by counting frequency-weighted adjacent pairs and merging the top pair with a deterministic tie-break, encode by applying the lowest-ranked merge that fits until none fits, and decode by joining the byte expansions and decoding UTF-8 once. The tests pin the byte-exact round trip on an unseen sentence, on an emoji and on a literal special-token string with the allow flag on and off, plus the merge-order property and the reserved ids. The figure is the compression curve: the encoded length of a held-out sentence as the target vocabulary grows from 300 to 600.
:::

**Full answer**

**The design**

```text
ids 0..255        raw bytes
next few ids      <|endoftext|>, <|pad|>
then              one id per merge, in training order
```

- **Keep the input bytes** as they are, so that the round trip is byte-exact. Compatibility normalization maps a ligature or a fullwidth letter to its plain form and is lossy, so add it only if the write-up limits the round-trip promise to normalized text.
- **Pre-split** into words and punctuation so that merges stay inside a word; the regex pattern of the large production tokenizers is an optional extension.
- **Train**: count adjacent pairs across the split corpus weighted by word frequency, merge the top pair into the next free id, record the merge, repeat to the target size. Break ties on the pair itself so two runs give the same table.
- **Encode**: match special tokens exactly first when the allow flag is on; for ordinary text start from the bytes and repeatedly apply the lowest-ranked applicable merge.
- **Decode**: special ids map to their marker strings, every other id to its bytes; join all bytes, then decode once with replacement for a partial trailing character.

**The tests**

1. Round trip on a sentence the tokenizer never saw.
2. Round trip on a sentence with an emoji, where the character's 4 bytes may span tokens.
3. Round trip on a sentence containing the literal end-of-text string, with the flag off it becomes bytes and with the flag on it becomes the reserved id.
4. Merge order: a held-out word encodes to the recorded ids, and a shuffled table does not.
5. Reserved ids never appear as merge targets and never collide with byte ids.
6. Determinism: training twice on the same corpus gives the same table.

**The figure**

Train to several target sizes, encode the same held-out sentence each time, and plot the token count against the vocabulary size. The count falls as merges cover longer pieces. A second line with the compression ratio, tokens over input bytes where 0.50 means half as many tokens as bytes, shows the same thing in a unit that transfers between corpora.

**What a reviewer grades**

Correctness of the round trip, determinism, clean separation of the special-token path from the merge path, the quality of the tests, and a write-up that names the bug the candidate hit. Speed is not graded: Python at this scale finishes in well under a second, and production libraries in compiled languages are 10 to 100 times faster for the same algorithm.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why do the raw bytes take ids 0 to 255 before anything else? Expected: every input can then be expressed in the vocabulary before any merge exists, so nothing is ever unknown.
- **Level 3:** The input spells out the end-of-text marker as plain text. What does the allow flag change? Expected: off, the string is ordinary bytes and pieces; on, it maps to the reserved id and is skipped by the merge loop.
- **Level 3:** Why must a tie in pair counts be broken deterministically? Expected: two runs on the same corpus must give the same table, or the same text gets different ids across machines.
- **Level 4:** Replace the simple split with the production regex pattern. What do you compare? Expected: the vocabularies and the encoded lengths on the same corpus, looking at how contractions, digits and leading spaces are handled.

**Wrong answers, and why they fail**

- "Use Unicode code points as the base symbols." Code points number in the hundreds of thousands and leave gaps for unseen characters; bytes are 256 and complete.
- "Decode each token to a string and join the strings." A token can hold part of a multi-byte character; join the bytes first and decode once.
- "Skip the pre-split to get better compression." Merges then cross word boundaries and the vocabulary fills with phrases that do not transfer.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## The weights did not change and the score fell

*Level 3 (senior) · debug · about 10 minutes*

After a routine dependency upgrade, an evaluation score for a deployed model fell sharply. No model weights changed. Give me a diagnosis plan that starts at the tokenizer, and the control you add so it cannot happen again.

:::answer Show the answer
:::say Short answer
A model trained with one vocabulary and served with another gets different ids for the same text and produces garbage, so first hash the tokenizer file in both environments and compare. If the hashes match, check the settings that change ids without changing the vocabulary: whether special tokens are added, whether a prefix space is added, and the normalization step, because a leading space or a ligature that normalizes differently moves whole tokens. Then freeze the tokenizer hash in CI and keep golden token ids for a fixed corpus so any change fails a test before it ships.
:::

**Full answer**

**Step one: the file**

The merge table and the vocabulary are the tokenizer. A library upgrade can pull a different file, or resolve a model name to a newer revision. Compare the hash of the tokenizer file in the evaluation environment with the one the model was trained with.

**Step two: the settings around the file**

| Setting | What changes | Symptom |
|---|---|---|
| Add special tokens | a begin-of-text id appears or disappears at the start | every position shifts by one |
| Add prefix space | the first word gets a word-initial id or a word-internal id | the first token of every prompt differs |
| Normalization | a ligature such as the two-letter "fi" becomes two characters, or a fullwidth letter becomes ASCII | the same word gets different pieces in the two environments |
| Pre-tokenizer engine | the Unicode-aware pattern falls back to ASCII classes | non-Latin text splits differently |

Each of these is a default that a library version can change. None of them touches the vocabulary file, so the hash alone does not catch them.

**Step three: prove it**

Take a fixed sample of prompts from the evaluation. Encode them in both environments and diff the id lists. The first position that differs tells you which setting moved. Decode the differing ids to see the pieces.

**The controls**

1. Pin the tokenizer file by hash in the deployment and fail the build when it changes.
2. Store golden token ids for a fixed corpus that covers English, non-Latin scripts, code, emoji and a prompt with a leading space; the test encodes the corpus and compares.
3. Assert a round trip, encode then decode, on the same corpus. Compare against the text that the configured normalizer produces, and require byte-exact equality for text that the normalizer leaves unchanged.
4. Record the tokenizer settings next to the weights, so the serving config cannot drift from the training config.

**The validation plan from the lesson**

Average tokens per word on a held-out set, the unknown rate, the compression ratio and the round-trip equality. Those four numbers, tracked over time, show drift before an evaluation does.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How does a prefix space change the ids? Expected: the space is part of the word-initial token, so with it the first word gets one id and without it another, and the shift can continue through the merges.
- **Level 3:** What does the compatibility normalization do, and when is it harmful? Expected: it maps compatibility characters to their plain forms, such as a ligature to two letters or a fullwidth letter to ASCII; it is lossy, so code or text that depends on the exact form changes meaning.
- **Level 4:** The hashes match and the ids still differ on non-Latin text only. What moved? Expected: the pre-tokenizer engine; the environment without the Unicode-aware module fell back to the ASCII pattern.
- **Level 4:** Design the CI gate in two sentences. Expected: a test that encodes a fixed multilingual corpus and compares against stored golden ids and a stored tokenizer hash; any difference fails the build and prints the first differing position.

**Wrong answers, and why they fail**

- "The weights did not change, so the model is the same." The model is the weights and the mapping from text to ids; change the mapping and the model sees different inputs.
- "Retrain the model on the new tokenizer." A multi-week fix for a configuration bug; restore the training-time tokenizer and settings.
- "Lowercase everything so the normalization does not matter." That changes the ids again and throws away information the model was trained with.

:::

## Which multi-token design gives a free draft

*Level 3 (senior) · concept · about 10 minutes*

A pretraining team wants to supervise each position on more than the next token. One design puts several independent output heads on the backbone. Another chains small modules, one per extra depth. Which design gives you a usable speculative draft at inference, and what does it cost during training?

:::answer Show the answer
:::say Short answer
The chained design. Module k takes the previous depth's hidden state and the embedding of the actual next token, runs its own small transformer block, and reuses the shared embedding and the shared output head, so its prediction of the token at t plus k plus 1 is conditioned on the token at t plus k, which is the same causal chain a decoder follows and lets the module draft tokens at inference with acceptance at depth one of 80 percent or more for about 1.8 times throughput. Independent heads all read the same hidden state and cannot condition on each other. The training cost is about 10 percent slower pretraining and about 14 h squared parameters per module, with a loss weight of 0.3 early and 0.1 later.
:::

**Full answer**

**The sequential recipe**

For a prefix through position i, depth zero is the main backbone, and depth k builds on depth k minus 1:

```text
h_i^(k) = T_k( M_k · concat( RMSNorm(h_i^(k-1)), RMSNorm(E(t_{i+k})) ) )
logits_{i+k+1} = Out( h_i^(k) )
L_k = cross-entropy( logits_{i+k+1}, t_{i+k+1} )
L_MTP = (lambda / D) · sum over k of L_k
```

`E` is the embedding table and `Out` is the output head, both shared with the main model. `M_k` folds the previous hidden state and the next token's embedding into one vector. `T_k` is one transformer block. The total loss is the main next-token loss plus `L_MTP`, with lambda at 0.3 for the first 10 percent of training and 0.1 afterward.

**Why the chain matters**

To predict two tokens ahead, module one sees what the next token actually was. At inference you feed it the drafted token instead, and it predicts the one after. That is exactly how a hidden-state draft works, so the trained module is a draft network for free. Parallel heads fire from one hidden state, so head two cannot use head one's answer. A verifier can still check their guesses, but they are accepted less often.

**The accounting**

Per module: the projection is `2 h^2`, the block is about `12 h^2` for attention and a gated MLP, so about `14 h^2`. At a hidden size of 7168 and one module that is about 720M on paper; the published figure is 14B on a 671B main model, about 2 percent, because the module's MLP inherits the expert structure of the main model. The embedding and head add nothing, because they are shared.

**What you get**

1. A denser training signal: every hidden state is supervised on D plus 1 targets, and the report shows consistent gains on reasoning, math and code evaluations.
2. A draft at inference with 80 percent or more acceptance at depth one, for about 1.8 times generation throughput, and the training-time cost is paid back the first time the model serves.

**Against a post-hoc draft**

| | Post-hoc hidden-state draft | Baked-in modules |
|---|---|---|
| When trained | after pretraining | during pretraining |
| Works with existing weights | yes | no, retrain |
| Draft parameters | one or two layers | one block plus a projection |
| Acceptance | 0.88 to 0.92 | 0.80 and above at depth one |
| Benefit beyond speed | none | denser training signal |

Use the baked-in design when you control pretraining and the hidden size is at least 4096; at a 1B scale the overhead hurts more than it helps. Use the post-hoc draft when the weights already exist.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why share the embedding and the output head with the main model? Expected: no extra parameters, and the module predicts in the same vocabulary space as the backbone.
- **Level 3:** Why is the published parameter overhead larger than the `14 h^2` estimate? Expected: the module's MLP has the same expert structure as the main model, which multiplies its parameters.
- **Level 4:** With two modules, what does the second one take as input? Expected: the first module's hidden state and the embedding of the token two ahead, to predict the token three ahead.
- **Level 4:** A team wants to add this to an existing dense model by fine-tuning a new head. Your answer? Expected: the module is not trained and the backbone was not shaped by the extra loss; the lesson's position is that it needs a pretraining run, and a post-hoc draft is the right tool for existing weights.

**Wrong answers, and why they fail**

- "The extra loss replaces next-token prediction." It is added to the main loss with a small weight; the main objective stays.
- "The module can be bolted onto a trained model with a quick fine-tune." The design is a pretraining choice; existing weights get a post-hoc draft instead.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## Why a draft that reads hidden states accepts more

*Level 3 (senior) · concept · about 10 minutes*

Walk the line from a separate small draft model to the current generation of hidden-state drafts. What limitation did each step remove, and why does feeding the draft the verifier's internal features help so much?

:::answer Show the answer
:::say Short answer
A separate small model from the same family accepts around 0.6 of its tokens, because its distribution drifts from the verifier's. The first hidden-state draft replaces it with a one or two layer network that reads the verifier's last-layer features, so the draft starts from the verifier's own representation and acceptance rises to 0.7 to 0.8. The second generation proposes a tree of candidates and verifies every branch in one pass with a tree-shaped attention mask, lifting acceptance per accepted-path token above 0.85. The third drops the feature-matching loss, trains on direct token prediction, and feeds the draft its own previous outputs during training, which removes exposure bias and reaches 0.88 to 0.92.
:::

**Full answer**

**The progression**

| Generation | Draft | Acceptance | Training cost |
|---|---|---|---|
| Separate small model | an independently trained smaller model | 0.55 to 0.70 | none |
| Extra heads on the verifier | several output heads predicting positions ahead | 0.65 to 0.75 | about 1B supervised tokens |
| First hidden-state draft | one transformer layer on the verifier's last hidden state | 0.70 to 0.80 | about 60B tokens |
| Dynamic draft tree | the same plus a tree of candidates | 0.80 to 0.88 | about 60B tokens |
| Multi-layer features plus training-time test | fuses several verifier layers; trained on its own outputs | 0.88 to 0.92 | about 60 to 200B tokens |

**Why the hidden state helps**

A separate draft re-derives from raw tokens what the verifier has already computed. The verifier's last hidden state at position t is a rich summary of the prefix, and a tiny network that reads it predicts the verifier's next token far better than a small model that reads only the token ids. The draft becomes a reader of the verifier instead of an imitation of it.

**What the tree adds**

A linear chain of drafts dies at the first miss. A tree proposes several candidates at each depth, grows wider where the draft is uncertain and stays narrow where it is confident, and the verifier scores every node in one forward pass with a mask that lets each node attend only to its ancestors. The longest accepted path wins. Verification cost barely moves, because it is still one forward pass.

**What the third generation fixes**

The earlier hidden-state drafts were trained to match the verifier's features, which capped how much extra data could help. The third generation trains on token prediction directly, and during training it feeds the draft its own previous predictions over several steps, the way it runs at inference. That aligns the training inputs with the inference inputs and stops error accumulation, the same fix that scheduled sampling gave sequence models. The paper reports up to 6.5 times end-to-end on chat and a 38 percent throughput gain at a batch of 64 on a production engine.

**The draft is only as good as its traffic**

A general-purpose draft head trained on chat data drops to 0.4 to 0.6 acceptance on code, medical or legal traffic. A domain-specific head recovers it, and training one is a light job next to fine-tuning the verifier.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did matching the verifier's features cap the first generations? Expected: the feature loss asks the draft to reproduce hidden states rather than predict tokens, so more training data stopped helping; the third generation trains on tokens.
- **Level 3:** What is exposure bias in this setting? Expected: the draft was trained on teacher-forced verifier inputs and run on its own outputs; the mismatch compounds over the draft steps.
- **Level 4:** What does the tree cost? Expected: a non-causal attention mask that follows the tree topology, extra stored keys and values for the tree nodes, and scheduler complexity; the verifier still runs once.
- **Level 4:** How do you compare the extra-heads design with the hidden-state draft? Expected: no second model to deploy and simpler serving, against a somewhat lower acceptance and a supervised fine-tuning stage on the verifier.

**Wrong answers, and why they fail**

- "A larger separate draft model is the main lever." Alignment with the verifier matters more than size; a one-layer draft on hidden states beats a far larger independent model.
- "The hidden-state draft changes the verifier's output distribution to gain acceptance." The rejection rule keeps the output exact; the draft only changes how often it is right.
- "A tree needs one verifier pass per branch." All branches are verified in one pass under the tree mask.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## Bake in the draft, train it after, or borrow a small model

*Level 4 (staff) · design · about 15 minutes*

You are about to pretrain a model that will later serve a large volume using speculative decoding. Three ways to get a draft are on the table: bake sequential multi-token modules into pretraining, train a hidden-state draft head after pretraining, or reuse a small model of the same family. Give the decision with its costs, and name the gate you measure before you ship the flag.

:::answer Show the answer
:::say Short answer
If I control pretraining and the hidden size is at least 4096, I bake in the sequential modules: about 10 percent slower training buys a denser supervision signal and a draft that accepts 80 percent or more at depth one. If the weights already exist, I train a post-hoc head on the verifier's features with about 60 to 200B tokens; it is backward compatible and reaches 0.88 to 0.92 acceptance on general chat. A same-family small model needs no training and sits around 0.55 to 0.70. Whatever I pick, the gate is measured acceptance on my own traffic mix at production concurrency, with the flag off below about 0.55 and the tail latency watched, not the mean.
:::

**Full answer**

**The three options**

| Option | When trained | Works with existing weights | Draft parameters | Acceptance | Extra benefit |
|---|---|---|---|---|---|
| Sequential modules in pretraining | during pretraining | no | one block plus a projection per depth | 0.80 and above at depth one | denser training signal |
| Post-hoc head on verifier features | after pretraining | yes | one or two layers, trained on about 60 to 200B tokens | 0.88 to 0.92 on chat | none beyond speed |
| Same-family small model | none | yes | a whole small model | 0.55 to 0.70 | none, and it costs memory |

**The decision tree**

1. **Do you own pretraining?** If yes and the model is large enough, the modules are the only option that improves the model and the serving at once; the report that introduced them measured about 1.8 times generation throughput from the draft alone. At a 1B scale the overhead hurts more than it helps.
2. **Do the weights already exist?** Then the post-hoc head. It is a light training job compared with the verifier, and it does not touch the verifier's outputs.
3. **No training budget at all?** The small model, as a prototype, knowing the acceptance ceiling is low and the second model takes memory.

**The gate**

Speculation is opt-in on the production engine, and the production lesson's rule is that flipping the flag without measuring acceptance on real traffic is an anti-pattern. The plan:

1. Serve the target plain and record time to first token, inter-token latency and throughput at the target concurrency.
2. Enable the draft and rerun the same benchmark.
3. Read accepted draft tokens and proposed draft tokens per request from the engine and divide the first by the second to get acceptance.
4. Below about 0.55 at production concurrency, disable the flag or train a domain-specific head.
5. Confirm that the tail inter-token latency did not get worse, because a rejected draft costs a verify and a re-roll.

**Traffic mix**

A head trained on general chat sits at 0.6 to 0.8 there and falls to 0.4 to 0.6 on code, medical or legal traffic. Weight the acceptance by traffic share before you decide, and measure each slice on its own; a blended number can hide a slice where speculation is net negative. The capstone's exercise asks exactly this for a 70 percent chat and 30 percent code mix with acceptances of 0.7 and 0.4.

**Operate it**

Acceptance drifts when the target changes version and the draft does not, so alert on it per slice, and keep a draft-free or n-gram fallback for the slices where the head stops paying.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The traffic is 70 percent chat at 0.7 acceptance and 30 percent code at 0.4. How do you decide? Expected: weight by traffic share, then check each slice against the floor; code alone is below it, so route code to a plain decode or train a code head.
- **Level 4:** The target gets a new version next quarter. What happens to each option? Expected: the baked-in modules move with the model; the post-hoc head must be retrained against the new target; the small model drifts further; alert on acceptance per version.
- **Level 4:** What does a hidden-state head read in the current generation? Expected: features from several target layers, not only the last, which is part of why acceptance rose.
- **Level 4:** Where does the small-model option still win? Expected: a prototype with no training budget, or a CPU deployment where the engine ships only the plain draft path.

**Wrong answers, and why they fail**

- "Always use the latest hidden-state draft; it is strictly best." It needs training against your target and its acceptance on domain traffic can fall to 0.4; the baked-in modules give you a draft and a better model if you own pretraining.
- "Bake the modules in later with a fine-tune." They are a pretraining choice; an existing dense model gets a post-hoc head instead.
- "Pick by the speedup on a public benchmark." Acceptance depends on your traffic; the gate is measured on your own mix at your concurrency.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## Design the tokenizer for a multilingual coding model

*Level 4 (staff) · design · about 15 minutes*

You are starting a 7B model that must serve many languages and also be strong at code. Design its tokenizer: the algorithm, the library, the vocabulary size, the coverage settings, and the validation plan you would gate the training run on.

:::answer Show the answer
:::say Short answer
Train a byte-fallback subword vocabulary on a corpus that mirrors the target mix of languages and code, with a pre-tokenizer that keeps leading spaces and separates digits and punctuation so that code tokenizes cleanly. For a model in the 1 to 10B range the heuristic is 50 to 100k tokens, and the multilingual requirement pushes to the top of that range or beyond it; set the character coverage near 0.9995 so that rare scripts are kept rather than mapped to unknown. Gate on tokens per word per language, the unknown rate, the compression ratio against a reference encoder and a byte-exact round trip, and freeze the tokenizer file hash in CI before the first training step.
:::

**Full answer**

**Algorithm and library**

The lesson's table points to the prune-based algorithm trained on raw text for multilingual work, because it needs no language-specific pre-tokenization and handles scripts without spaces, and to the merge-based algorithm for monolingual corpora. For a mixed requirement either works if the corpus is right; the corpus mix decides more than the algorithm. Use a library that trains, not one that only encodes against someone else's vocabulary. Keep byte fallback on in either case so that no input is ever unknown.

**Vocabulary size**

| Model scale | Heuristic |
|---|---|
| under 1B | about 32k |
| 1 to 10B | 50 to 100k |
| multilingual or frontier | 200k and above |

A 7B model with many scripts sits at the top of the middle row. Each added row is an embedding to learn, and the embedding matrix at 128,000 rows by 4,096 dimensions is about 524M parameters, so the size is a budget decision and not a constant. The payoff is fertility: an English-heavy vocabulary gives other scripts 2 to 3 tokens per word or worse, and non-Latin text can cost 5 to 10 times more tokens; the larger multilingual vocabulary is what repairs that.

**Coverage and code**

- Character coverage near 0.9995 for a mixed corpus; refuse anything under 0.995 when rare scripts are present.
- Byte fallback for everything the coverage still misses.
- A pre-tokenizer that keeps the leading space on words, splits digit runs and punctuation, and handles whitespace runs, so that indentation and operators in code become stable pieces. Chinese characters are 3 bytes each and need merges of their own, so the corpus must contain enough of them.
- Reserve the special tokens and the chat markers at the start, with fixed ids that no merge can produce.

**The corpus**

Sample the training text for the tokenizer in the proportions you want the model to be good at. A domain vocabulary can also be trained on the code corpus and merged with the base vocabulary. A tokenizer trained on an English-heavy sample will under-serve every other script for the life of the model.

**The validation plan**

1. Tokens per word, per language and for code, on held-out text; this is the fertility table you publish.
2. Unknown rate, which must be zero with byte fallback.
3. Compression ratio against a reference encoder on the same held-out text.
4. Round trip, encode then decode, on all of it, including emoji and literal special-token strings. Byte-exact when the tokenizer has no normalizer; with a normalizer such as NFKC, compare against the normalized text.
5. A frozen tokenizer file hash and golden token ids in CI, so that nothing drifts between training and serving.

Flag a monolingual vocabulary under 16k as under-specified, and refuse to ship a vocabulary without the hash check.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the corpus mix matter more than the algorithm choice? Expected: the merges or the pruned pieces follow the frequencies in the training text, so a script that is rare in the sample gets few pieces whatever the algorithm.
- **Level 4:** What does whitespace handling do to code? Expected: indentation is runs of spaces or tabs; a pre-tokenizer that keeps whitespace runs as their own chunks lets them become stable tokens instead of being glued to the next word.
- **Level 4:** The team wants to change the vocabulary after six months of training. What do you tell them? Expected: the embeddings and every weight were trained against the current ids; a change means a retrain, which is why the tokenizer decision is gated before the first step.
- **Level 4:** How do you report the tokenizer with the model? Expected: the fertility table per language, the size and coverage of the vocabulary, the special-token list and the file hash.

**Wrong answers, and why they fail**

- "Pick 32k because earlier models used it." That size served monolingual models under 1B; a 7B multilingual coding model pays the tax in every language.
- "Set character coverage to 1.0 to be safe." Full coverage spends vocabulary on characters seen once; near 0.9995 with byte fallback keeps rare scripts without wasting rows.
- "Train on English now and add the other languages later." The vocabulary cannot change after training without a retrain; the languages must be in the tokenizer corpus from the start.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## Mean latency improved and the tail got worse

*Level 4 (staff) · debug · about 12 minutes*

Two changes shipped in one week: the target model moved to its next version, and a new customer whose traffic is mostly code was routed onto the same cluster. Speculative decoding has been on for months. Since then the mean inter-token latency fell 25 percent, the P99 rose 15 percent, and throughput at the usual concurrency is down. Diagnose it.

:::answer Show the answer
:::say Short answer
Both changes attack acceptance. The draft head was trained against the previous target version, so its distribution drifted and more drafts reject; the code traffic shifts the input distribution away from the general chat data the head was trained on, where acceptance falls into the 0.4 to 0.6 band. A rejected draft costs a verify and a re-roll, two passes that serialize under a full batch, which is exactly a tail that worsens while the mean still improves. Read acceptance per traffic slice and per target version from the engine's speculative metrics, retrain or roll back to a head aligned with the new target, and gate speculation per request class.
:::

**Full answer**

**Why mean and tail move in opposite directions**

Most requests still accept most drafts, so their inter-token latency falls and the mean improves. The requests that reject early pay the draft steps, the verify and a second target pass for the correction, and under a full batch those passes queue behind each other. The tail is where the rejected requests live. Watch P99, not P50.

**Cause one: a draft one version behind**

A hidden-state draft is trained to predict a specific target's next token from that target's features. A new target version changes the features and the distribution, and the draft's agreement with it drops. The capstone's first exercise is to measure this degradation and to build the alert for it.

**Cause two: a domain the head never saw**

A head trained on general chat sits at 0.6 to 0.8 acceptance there and at 0.4 to 0.6 on code, medical or legal traffic. Code tokens are predictable for a draft trained on code, and poorly predicted by one that was not. Below an acceptance of about 0.55 at high concurrency speculation is net negative, so the new customer may have pushed the cluster under the floor.

**The diagnosis**

1. Pull accepted draft tokens and proposed draft tokens per request from the engine, divide the first by the second, and split by target version and by customer or request class. One number for the whole cluster hides both causes.
2. Compare the chat slice before and after the upgrade: if it fell, the version drift is real.
3. Compare the code slice against the chat slice at the same version: if it sits far lower, the domain shift is real.
4. Confirm the tail story by bucketing P99 by acceptance; the slow tail should be the low-acceptance slice.

**The fix**

- Retrain the head against the new target version, or roll the target back until the aligned head is ready.
- Route the code customer to a plain decode pool, or train a code-specific head; the training job is light next to fine-tuning the target.
- Gate speculation per request class on measured acceptance, with an n-gram or draft-free fallback below the floor.
- Alert on acceptance per slice so the next version bump cannot ship without the draft.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why can the mean improve while throughput falls? Expected: the accepted requests get faster, but the rejected ones consume two target passes each, and at a full batch that extra work displaces other requests.
- **Level 4:** Design the alert in two sentences. Expected: compute acceptance per slice and per target version over a short window and compare against the baseline recorded at rollout; page when a slice crosses the floor or drops a fixed share from its baseline.
- **Level 4:** What is the fallback when acceptance drops on one slice only? Expected: switch that slice to an n-gram draft or to plain decoding while the head is retrained, and keep speculation where it still pays.
- **Level 4:** How does this change your release process? Expected: a target upgrade ships together with a draft trained against it, and the benchmark that gates the release reports acceptance and P99 per slice.

**Wrong answers, and why they fail**

- "Increase the draft length to win back throughput." More drafts at low acceptance are mostly rejected and their cost is still paid; the tail gets worse.
- "Turn speculation off everywhere." The chat slice may still pay; gate by slice and fix the head.
- "The new target is just slower; speculation has nothing to do with it." A plain-decode benchmark of the new target settles that in minutes, and the mean improving while the tail worsens points at rejections.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::
