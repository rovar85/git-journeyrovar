---
track: aibank
title: "AI interview bank: Tokenization, sampling and decoding (part 1 of 2)"
short: Tokenization, sampling 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## The same prompt costs more tokens in Korean

*Level 1 (screening) · concept · about 6 minutes*

A customer in Korea reports that the same prompt uses up far more of the context window than the English version, and the bill is higher too. Why does this happen, and what does a model builder do about it?

:::answer Show the answer
:::say Short answer
The vocabulary was trained on English-heavy text, so its merges cover English and other scripts fall back to short pieces or raw bytes. Korean averages 2 to 3 tokens per word on an older vocabulary, and non-Latin text can cost 5 to 10 times more tokens than English for the same meaning; a Chinese character is 3 bytes in UTF-8, so without merges each character is several tokens. The builder's fix is a larger vocabulary trained on multilingual data, which is why one model family grew its vocabulary from 32K to 128K.
:::

**Full answer**

**Where the tokens go**

A byte-level tokenizer never fails, but it only compresses what it has merges for. Each Chinese character is 3 bytes, Japanese characters are 3 to 4 bytes, an emoji is 4 bytes and can take 5 tokens. If the training corpus held little of a script, the merge table has few pieces for it, and the text stays close to one token per byte.

**What the customer feels**

- The context window is a token budget, so the same document fits less often.
- Pricing is per token, so the same request costs more.
- Latency is per generated token, so answers in that script are slower.

The lesson's phrase is that a user of such a script effectively has a context window half the size of an English user's.

**What the builder does**

1. Train the vocabulary on a corpus that mirrors the target language mix.
2. Grow the vocabulary so that more merges serve non-Latin scripts; the move from 32K to 128K in one family was made mainly for this.
3. Train with a library that works on raw text without pre-tokenization, so scripts without spaces segment well.
4. Measure fertility per language and report it with the model.

**How to measure it**

Take the same 10 meaning-aligned sentences in English, Spanish, Chinese, Korean and Arabic, from one parallel corpus, tokenize each with the candidate vocabulary, and compare the average tokens per character. The ratios are the tax; with sentences that do not match, report them as a spot check only.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Define fertility in one sentence. Expected: the average number of tokens the tokenizer produces per word, where higher means the model works harder for the same text.
- **Level 2:** How do you measure the tax for a new vocabulary? Expected: tokenize matched sentences in several languages and compare tokens per character or per word.
- **Level 2:** Why does a larger vocabulary help scripts other than English? Expected: more merges can be spent on their byte patterns, so each character or word needs fewer tokens.
- **Level 3:** What does the tax do to a product's cost model? Expected: per-token pricing and per-token latency scale with the token count, so the same feature costs more and runs slower in affected languages, and the context budget shrinks.

**Wrong answers, and why they fail**

- "Korean is harder for the model to understand." The model sees ids; the extra cost comes from the tokenizer's merges, not from the language.
- "Use a character-level tokenizer for Korean." Characters make every sequence longer; the fix is merges that cover the script.
- "The model has a smaller context window for Korean." The window is the same number of tokens; the tokenizer spends more of them per word.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Why models read subwords and start from bytes

*Level 1 (screening) · concept · about 6 minutes*

Why does every current language model read subword tokens instead of whole words or single characters, and why do most of them build the vocabulary on top of raw bytes?

:::answer Show the answer
:::say Short answer
A word vocabulary cannot hold every word, so each new word becomes an unknown token and the model loses the signal. Characters never fail, but they make sequences several times longer and spend attention on spelling. Subwords keep common words whole and split rare words into meaningful pieces, and starting from the 256 byte values means any input in any script encodes with zero unknown tokens.
:::

**Full answer**

**The three options**

| Level | Vocabulary | Failure |
|---|---|---|
| Word | huge, and still incomplete | unknown token for anything unseen; English alone has over a million word forms |
| Character | a few hundred | a 10-word sentence becomes about 50 tokens; the model relearns that t, h, e spell a word |
| Subword | 30K to 128K | none of the above; rare words split into pieces |

A rare word such as "unhappiness" is 11 character tokens or 3 subword pieces: un, happi, ness. The pieces carry meaning the model can reuse.

**Why bytes at the bottom**

A byte-level vocabulary treats each of the 256 byte values as a base token and learns merges on top. Any string in any encoding is a byte sequence, so nothing is ever unknown, and no language needs special handling. A well-known 50,257-token vocabulary is exactly 256 bytes plus 50,000 merges plus one special token.

**Why it is architecture, not preprocessing**

The tokenizer fixes what the model sees for its whole life. A vocabulary that splits a common word into four pieces wastes context and compute on every request, and the choice cannot be undone after training. Pricing is per token and latency is per token, so the tokenizer sits in the cost model too.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does fertility measure? Expected: the average number of tokens per word; 1.0 is one token per word and higher means the model works harder for the same text.
- **Level 2:** Why does the unknown token disappear with byte-level vocabularies? Expected: every byte is itself a token, so any input decomposes into known tokens before any merge applies.
- **Level 2:** What does a tiny vocabulary cost at inference? Expected: longer sequences, so more forward passes per answer and less text per context window.
- **Level 3:** Why can you not fix a bad tokenizer after training? Expected: the embedding rows and every weight were trained against those ids; new ids have no learned meaning and old text would map differently.

**Wrong answers, and why they fail**

- "Characters are the safest choice because nothing is ever unknown." Bytes give the same guarantee, and characters make every sequence several times longer.
- "A bigger word list solves the unknown problem." New words, misspellings, code and other languages keep appearing; no word list is complete.
- "A token is a word." A token can be a byte, a piece of a word, a word, or a short phrase, depending on the merges.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## Count the windows a token stream gives you

*Level 2 (working) · code-reading · about 8 minutes*

Read this dataset code from the lesson. `ids` is the whole corpus as one tensor of token ids.

```python
@staticmethod
def count_windows(num_ids, context_length, stride):
    usable = num_ids - (context_length + 1)
    if usable < 0:
        return 0
    return 1 + usable // stride

def __getitem__(self, index):
    start = index * self.stride
    end = start + self.context_length + 1
    window = self.ids[start:end]
    return window[:-1].clone(), window[1:].clone()
```

Why does each window need one more id than the context length, how does the count change when you halve the stride, and what does the loader do to make two runs see the same order?

:::answer Show the answer
:::say Short answer
The target is the input shifted left by one, so an example of T input ids needs T plus 1 ids, and the count is 1 plus the floor of (N minus T minus 1) over the stride, or zero when the stream is too short. Halving the stride from T to T over 2 gives about twice the examples with half of each window shared with its neighbor, and a stride of 1 multiplies the count by about T. The loader seeds a generator with the base seed plus the epoch index, so the shuffle is the same on every restart and each epoch gets a new shuffle.
:::

**Full answer**

**The shape contract**

A causal language model consumes `(B, T)` input ids and `(B, T)` target ids where the target at position t is the input at t plus 1. One slice of T plus 1 ids gives both tensors from the same memory, which makes the shift mistake impossible: `window[:-1]` and `window[1:]`.

**The count**

```text
examples = max(0, 1 + (N - (T + 1)) // S)
```

The last window is dropped when it cannot fill T plus 1 ids. Padding it is valid too, but it complicates the loss mask, so the lesson drops.

**Stride against redundancy**

| Stride | Overlap | Examples |
|---|---|---|
| T | none | about N over T |
| T over 2 | half of each window | about twice as many |
| 1 | almost all | about T times as many |

More overlap moves the window boundaries around, so the model sees more distinct predict-next-token tasks per epoch, at the price of more compute per epoch. Most pretraining runs use a stride equal to the context length because the corpus is already larger than one epoch can cover.

**Memory**

The dataset stores one copy of the id stream and computes each window's start on the fly, so the memory cost does not grow with the number of examples the stride creates.

**Determinism**

```python
generator = torch.Generator()
generator.manual_seed(base_seed + epoch)
```

The same base seed gives the same order in every epoch of every run, and the epoch index gives each epoch a new shuffle. Without this, two runs that differ in one hyperparameter also differ in data order, and the loss curves diverge for reasons unrelated to the change.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why not pad the last window instead of dropping it? Expected: padding needs a loss mask so the pad positions do not count; dropping keeps the loss simple.
- **Level 3:** Why seed per epoch and not once per run? Expected: a generator seeded once and advanced across epochs is also reproducible, but epoch k's order then depends on replaying every earlier epoch; seeding with the base seed plus the epoch index builds epoch k's order directly, which a resumed run needs.
- **Level 3:** What does a stride of 1 cost and buy? Expected: about T times the compute per epoch and heavy redundancy, against maximum boundary diversity.
- **Level 4:** You split the id stream into train and validation after windowing. What goes wrong? Expected: overlapping windows straddle the split, so validation text appears in training; split the stream first, then window each part.

**Wrong answers, and why they fail**

- "The number of examples is N divided by T." That ignores the extra id per window and the stride; the formula has both.
- "A fixed seed makes every epoch see the same order." The epoch index is added to the seed, so each epoch gets a new shuffle and each run is reproducible.
- "The target is the same window as the input." It is the window shifted left by one; the same ids give both tensors from one slice.

:::

## Put numbers on growing the vocabulary to 128K

*Level 2 (working) · estimate · about 8 minutes*

A team wants to grow the vocabulary of a new model from 32K to 128K tokens. The embeddings have 4,096 dimensions. Put numbers on what the change costs and on what it buys.

:::answer Show the answer
:::say Short answer
The embedding matrix goes from 32,000 by 4,096, about 131 million parameters, to 128,000 by 4,096, about 524 million, so about 400M more parameters from the tokenizer alone, and an untied output head costs the same again. In return the text compresses: an English paragraph of about 100 tokens at 32K takes about 70 tokens at 128K. Generating that same paragraph then needs about 30 percent fewer forward passes, and non-English scripts gain the most. The lesson's rule of thumb is 32k under 1B parameters, 50 to 100k from 1 to 10B, and 200k and above for multilingual or frontier models.
:::

**Full answer**

**The cost side**

```text
32,000  x 4,096 = about 131M parameters
128,000 x 4,096 = about 524M parameters
difference      = about 400M
```

Each row is an embedding the model has to learn, and rare rows receive few gradient updates. A small model with a huge vocabulary spends a large share of its parameters in a lookup table.

**The benefit side**

| Vocabulary | Tokens per English word |
|---|---|
| 30,522 | about 1.4 |
| 50,257 | about 1.3 |
| 100,256 | about 1.2 |
| 128,256 | about 1.1 |
| 200,019 | about 1.0 |

Fewer tokens per word means shorter sequences, so each answer needs fewer forward passes and each context window holds more text. For a model that serves millions of requests, output of that kind needs about 30 percent fewer forward passes.

**Who gains the most**

English already compresses well at 32K. Scripts that an English-heavy vocabulary splits into bytes gain far more, which is why one model family quadrupled its vocabulary from 32K to 128K.

**The decision**

Vocabulary size scales with the model and the language mix. Under 1B parameters, the embedding would dominate the model, so stay near 32k. Between 1 and 10B, 50 to 100k. Multilingual at any scale pushes toward 200k and beyond. Validate the choice with tokens per word on a held-out set, the unknown rate, the compression ratio and a byte-exact round trip.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why do fewer tokens per word make inference faster? Expected: generation is one forward pass per token, so fewer tokens for the same text means fewer passes.
- **Level 3:** What does a 128K vocabulary do to the output side of the model? Expected: the head has one row per token, so it grows with the embedding, and an untied head doubles the extra parameters.
- **Level 3:** Why did the model family in the lesson move from 32K to 128K? Expected: fairer compression across languages; the English-heavy vocabulary gave other scripts a context window that was effectively half the size.
- **Level 4:** How do you validate a vocabulary size before training? Expected: tokens per word per language on held-out text, the unknown rate, the compression ratio against a reference encoder, and a byte-exact round trip.

**Wrong answers, and why they fail**

- "A bigger vocabulary is always better." Under 1B parameters the extra rows dominate the model and rare rows are undertrained.
- "The embedding is a rounding error next to the model." At 128K by 4,096 it is about 524M parameters.
- "Vocabulary size does not affect the cost of a request." Tokens per word set the sequence length, and the sequence length sets the forward passes and the context budget.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Speculation flies on code and stalls on creative writing

*Level 2 (working) · tradeoff · about 8 minutes*

Your creative-writing product samples at a high temperature and speculative decoding gives it no speedup at all, while the same setup flies on code completion. Explain the difference, and describe what the acceptance test becomes at temperature zero.

:::answer Show the answer
:::say Short answer
Acceptance depends on how often the verifier agrees with what the draft sampled. At a high temperature the target distribution is flat, the draft's samples spread across many tokens, and the acceptance ratio of verifier to draft probability falls toward one over the vocabulary size, so almost every draft is rejected and the draft's cost is paid for nothing. Code and structured output are predictable, so acceptance climbs above 0.9. At temperature zero the rule becomes a comparison: accept if the drafted token equals the verifier's most likely token, otherwise emit that token and stop.
:::

**Full answer**

**Why temperature is the lever**

The acceptance test is `u < min(1, q(d) / p(d))`. When both distributions are peaked on the same token the ratio is near one and the draft is accepted. Raise the temperature and both distributions flatten: the draft now samples tokens that the verifier gives little probability, the ratios shrink, and the rejections pile up. The lesson's exercise runs the loop at a temperature of 1.5 to show the collapse, where the algorithm becomes slower than plain decoding because the draft overhead stays and the accepted tokens vanish.

**Why the task matters**

| Workload | Measured speedup in the lesson |
|---|---|
| chat | 2 to 3 times |
| code generation | 3 to 5 times |
| creative writing | near zero |

Code and structured output have a highly predictable next token, so even an imperfect draft agrees with the verifier most of the time; the EAGLE-3 lesson puts acceptance above 0.9 on such output. Open-ended prose at a high temperature has many acceptable continuations, and the draft rarely picks the one the verifier would.

**The greedy case**

With temperature zero both models are deterministic. The test reduces to `argmax(q) == d`: accept on a match, otherwise output `argmax(q)` and stop. The residual distribution is not needed, because the verifier's choice is a single token.

**What to do about it**

- Switch speculation off per request when the temperature is high, or route such requests to a plain decode pool; the EAGLE-3 lesson lists temperature-aware switching as a tuning knob.
- Do not spend the draft on very short outputs of 1 to 5 tokens either; the overhead dominates.
- Measure the acceptance rate per product surface and keep speculation where it pays; the production lesson's floor is about 0.55 at high concurrency.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the acceptance ratio become when the draft and the verifier agree exactly? Expected: one, so every draft is accepted and each pass yields the full draft plus the bonus token.
- **Level 3:** May the draft sample at a different temperature from the verifier? Expected: yes, as long as p is the distribution the draft actually sampled from; the output still follows the verifier's distribution, but a mismatch lowers acceptance.
- **Level 3:** How would you implement the switch in a serving layer? Expected: read the request's temperature and output length, and disable speculation above a temperature threshold or below a length threshold, with the thresholds set from measured acceptance.
- **Level 4:** Why is the loss worse at high concurrency than the formula suggests? Expected: a rejected draft costs a verify and a re-roll that serialize under a full batch, and the batch already fills the memory bandwidth that speculation was exploiting, so the tail latency suffers.

**Wrong answers, and why they fail**

- "Lower the temperature so speculation works." The product chose the temperature for a reason; change the decoding path for those requests, not the product.
- "The draft is too small; use a bigger draft." Size is not the issue when the target distribution is flat; a larger draft still cannot guess which of many acceptable tokens the verifier samples.
- "At high temperature speculation changes the output." The rejection rule keeps the output distribution exact at any temperature; what changes is the speed.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## The notebook works and the service never stops talking

*Level 2 (working) · debug · about 8 minutes*

A fine-tuned chat model answers well in the training notebook. The deployed service, with identical weights, returns rambling text that runs until the token limit. Where do you look first, and what do you expect to find?

:::answer Show the answer
:::say Short answer
At the flat token sequence the model actually receives, not at the list of messages. A chat model was trained on one exact layout of role markers, special tokens and newlines; a missing newline, a swapped marker or an extra space puts the input outside the training distribution, and the end-of-turn token stops being predicted. Print the token ids of the same request from both paths and diff them, and check that the special tokens arrived as their reserved ids and not as the bytes that spell them.
:::

**Full answer**

**The model never sees the JSON**

The service holds a list of role and content pairs. The model sees one flat sequence built by the chat template, which inserts markers such as a begin-of-text token, a header for each role and an end-of-turn token after each message, with specific newlines between them. Every model family lays this out differently. The template is part of the model, in the same way the vocabulary is.

**The three ways it breaks**

1. **A different template.** The service used a generic layout or an older version. Each message now sits in a frame the model never saw, and the end-of-turn marker it learned is absent or misplaced, so it never predicts the stop token.
2. **Special tokens spelled out.** Special tokens must be matched exactly before the merge loop and mapped to fixed ids. If the service built the prompt as plain text and encoded it with the allow flag off, the marker string became ordinary bytes and pieces. The model sees text that looks like a marker and is not one.
3. **Stop token mismatch.** The service stops on the generic end-of-sequence id while the model emits its end-of-turn id. Generation continues past the real end.

**The check that settles it**

```text
ids_notebook = tokenizer(chat_template(messages))
ids_service  = ids the service sent to the engine
diff the two lists; the first difference is the bug
```

Then decode each id back to its string and look for a marker that decoded as several pieces instead of one reserved id. If the two lists match, the input is fine and the stop token is next: compare the stop ids in the service config with the end-of-turn id that the template puts after each message.

**The fix**

Use the model's own template function, pass special tokens through the reserved-id path, and configure the stop token to the id the template ends a turn with. Freeze the tokenizer file and the template together with the weights.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does the end-of-turn token do at inference? Expected: it is the model's signal that the answer is complete; the server must stop on that id, or generation runs to the limit.
- **Level 3:** A user types the literal string of a special token into the chat box. What should happen? Expected: with the allow flag off it becomes ordinary bytes, which is the safe default for user text; with it on, the user could inject a control marker.
- **Level 3:** How do you test a template implementation? Expected: build the sequence for a fixed message list and compare it id by id with the output of the model's own template code.
- **Level 4:** The template is correct and the ids still differ between notebook and service. What else? Expected: a different tokenizer file version, a different normalization step, or a different setting for adding special tokens at the start; hash the tokenizer file and compare the flags.

**Wrong answers, and why they fail**

- "The sampling temperature is too high in the service." Temperature changes which token is picked, not whether the stop token is ever predicted; the ids differ before sampling.
- "The fine-tune overfit." The same weights behave in the notebook; the difference is in the input layout.
- "Trim the output on the client." That hides the symptom and the model still wastes compute on text it should not generate.

**Related lesson in this course:** [Deep dive 4: post-training and evaluating models](#aideep-4)

:::

## Three ways to build a subword vocabulary

*Level 2 (working) · tradeoff · about 8 minutes*

Three subword algorithms dominate: byte-pair encoding, WordPiece and Unigram. Contrast how each builds its vocabulary, tell me which one can give two different segmentations of the same word on purpose, and name the libraries you would reach for.

:::answer Show the answer
:::say Short answer
Byte-pair encoding merges the most frequent adjacent pair, bottom up. WordPiece also merges bottom up but scores a pair by the count of the merged piece over the product of the counts of its parts, so it prefers pairs that co-occur more than chance, and it marks continuation pieces with a double-hash prefix. Unigram works top down: it starts from a large candidate set, assigns each piece a probability, and prunes the pieces whose removal hurts the corpus likelihood least, which is why it can also sample alternative segmentations for regularization.
:::

**Full answer**

**The criteria side by side**

```text
BPE merge criterion:        count(A, B)
WordPiece merge criterion:  count(AB) / (count(A) * count(B))
Unigram:                    prune the piece whose removal least lowers the corpus log-likelihood
```

The first asks which pair appears most. The second asks which pair appears together more often than you would expect from its parts. The third asks which pieces the corpus can best do without.

**Who uses what**

| Algorithm | Direction | Marker | Used by |
|---|---|---|---|
| Byte-pair encoding | merge up | leading space kept on word-initial pieces | most decoder families, with vocabularies of 50,257, 128,256 and more |
| WordPiece | merge up by likelihood ratio | `##` for continuation pieces | the classic encoder with 30,522 tokens |
| Unigram | prune down | `▁` for a space when trained without pre-tokenization | an encoder-decoder family with 32,000 tokens |

**Sampling segmentations**

A Unigram model is probabilistic at inference. It can return the most likely segmentation or sample another one, which gives subword regularization during training: the same word arrives in several forms and the model learns pieces more robustly. The merge-based algorithms are deterministic.

**Libraries**

One library trains vocabularies for either the merge or the prune algorithm directly on raw text, encoding the space as a visible symbol and needing no pre-tokenization, which is why it is the default for multilingual work. A second, Rust-backed encoder is fast and matches the vocabularies of a widely used API family, but it only encodes. A third library trains and serves both algorithms in one place.

**Picking**

Training a monolingual model: byte-pair encoding. Training multilingual: Unigram with a character coverage near 0.9995. Serving against an existing API vocabulary: the encoder-only library. Edge inference with a small model: Unigram with a smaller vocabulary.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What is subword regularization? Expected: training on sampled segmentations from a Unigram model so the same word appears in several forms.
- **Level 2:** What does the visible-space symbol buy? Expected: the space becomes an ordinary symbol, so the tokenizer needs no pre-tokenization and works for scripts without spaces.
- **Level 3:** Which algorithm and setting for a multilingual vocabulary? Expected: Unigram trained on raw text with character coverage near 0.9995, so rare scripts are kept rather than mapped to unknown.
- **Level 3:** Why can an encode-only library not train your tokenizer? Expected: it ships pre-built vocabularies and a fast encoder; the training step lives in the other two libraries.

**Wrong answers, and why they fail**

- "WordPiece and byte-pair encoding give the same vocabulary on the same corpus." The criteria differ, so the merges differ; the likelihood ratio favors surprising pairs over merely frequent ones.
- "Unigram is deterministic like the merge algorithms." It is probabilistic and can sample segmentations on purpose.
- "The library that encodes the space as a symbol is itself an algorithm." It is a library that trains either the merge or the prune algorithm on raw text.

**Related lesson in this course:** [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1)

:::

## Two decoders, one breaks on an emoji

*Level 2 (working) · code-reading · about 8 minutes*

Two versions of a byte-level tokenizer's decode function came in for review. `vocab` maps each id to a `bytes` object.

```python
def decode_a(self, ids):
    byte_sequence = b"".join(self.vocab[t] for t in ids)
    return byte_sequence.decode("utf-8", errors="replace")

def decode_b(self, ids):
    return "".join(self.vocab[t].decode("utf-8") for t in ids)
```

Both pass the English tests. Which one is correct for an emoji whose bytes were split across two tokens, why does the correct one always terminate, and what is `errors="replace"` for?

:::answer Show the answer
:::say Short answer
Join all the bytes first and decode once, which is what `decode_a` does. A multi-byte character such as an emoji, 4 bytes in UTF-8, can be split across two or more tokens, so decoding each token's bytes alone hits an incomplete sequence and raises or emits replacement characters. The join works because every id is either one of the 256 raw bytes or the concatenation of two earlier ids, so expanding ids to bytes always ends in raw bytes, and the full byte string is valid UTF-8 whenever the input was. The `replace` option keeps the decoder from raising when a model emits a partial character at the end of a stream.
:::

**Full answer**

**Why the split happens**

A byte-level vocabulary starts from single bytes and learns merges from the corpus. An emoji that was rare in training may have no merge covering all 4 of its bytes, so the encoder leaves it as two tokens, perhaps 3 bytes and 1 byte. Each token on its own is not valid UTF-8. The characters of a script with 3-byte characters have the same problem whenever a merge covers part of a character.

**Why the join terminates and round-trips**

The capstone states the guarantee: encode then decode returns the input bytes exactly. The decoder concatenates the byte expansion of every id in order. Because every id is a raw byte or the concatenation of two known ids, the recursive expansion bottoms out in raw bytes, and the concatenation of all tokens is the original byte string. UTF-8 decoding then recovers the text. The test suite pins the property on an unseen sentence, on a sentence with an emoji, and on a sentence that contains a literal special-token string.

**Special tokens on the way out**

The capstone's decoder checks a special-token table first and appends the marker's UTF-8 bytes, then falls through to the vocabulary, and raises on an id that is in neither. That keeps a reserved id from being looked up as a merge.

**What `errors="replace"` is for**

A model can stop in the middle of a character, or a stream can be cut between two tokens that share a character. Strict decoding raises; `replace` emits a replacement character and continues. In a streaming decoder the better pattern is to buffer the trailing bytes until they form a complete character, and to use `replace` only at the final flush.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does `decode_b` pass the English tests? Expected: ASCII characters are single bytes, so no token ever holds a partial character and every piece decodes on its own.
- **Level 3:** Design the streaming decoder in two sentences. Expected: accumulate bytes and emit only the longest prefix that is complete UTF-8, keeping the remainder; flush with replacement at the end of the stream.
- **Level 3:** Why can a word-level tokenizer not give the round-trip guarantee? Expected: unseen words map to an unknown id, and the unknown id cannot be mapped back to the original text.
- **Level 3:** What three inputs does the capstone's test suite use for the round trip? Expected: an unseen sentence, a sentence with an emoji, and a sentence containing the literal special-token string.

**Wrong answers, and why they fail**

- "Decode each token to a string and join the strings." A token can hold part of a character, and partial UTF-8 is not a string.
- "Tell the decoder to ignore errors so nothing ever raises." Ignoring drops bytes silently and the round trip is no longer exact; the replacement character at least marks the loss.
- "The round trip only matters for the training data." Every generated answer goes through decode, and a server that raises on an emoji drops the request.

:::

## What the split before the merges is for

*Level 2 (working) · concept · about 8 minutes*

Before any merge runs, a production tokenizer cuts the text into chunks with a regular expression. Show me what the classic pattern does to `Hello, world! Don't stop.` and explain why the cut exists at all, given that the merges could run on the raw stream.

:::answer Show the answer
:::say Short answer
The pattern cuts the sentence into eight chunks, `Hello`, `,`, ` world`, `!`, ` Don`, `'t`, ` stop` and `.`: each word after the first keeps the space in front of it, contractions split at the apostrophe, and punctuation stands alone. The merges then run inside each chunk and can never join symbols across a chunk boundary. Without the cut, training learns merges that span words, the vocabulary fills with whole phrases, and the pieces generalize worse to new text.
:::

**Full answer**

**The pattern**

```text
'(?:[sdmt]|ll|ve|re)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+
```

In order: common contraction endings, a word with an optional leading space, a run of digits with an optional leading space, a run of punctuation, and whitespace. The `\p{L}` and `\p{N}` classes need the third-party `regex` module; the standard library falls back to ASCII classes, which is wrong for multilingual text.

**Why the leading space travels with the word**

` hello` and `hello` are different tokens. Keeping the space on the word means a word-initial piece and a word-internal piece stay distinct, and the decoder can rebuild the spacing from the tokens alone. The same reason forces every caller to be explicit about whether a prefix space is added at the start of a prompt.

**Why cut at all**

The merge loop is greedy on frequency. In a raw stream the pair "e" followed by a space followed by "t" is frequent, so the loop would happily learn a piece that ends one word and starts the next. Such pieces do not transfer: the next text has different word pairs. Cutting first keeps every merge inside a word, which is where the regularities that generalize live.

**The other design**

A tokenizer that works on raw text treats the space as an ordinary symbol and lets the merge or prune algorithm find the boundaries. It needs no language rules and handles scripts without spaces, and it allows cross-word pieces, which can compress a little better and read a little worse.

**The capstone's version**

A small split on whitespace and punctuation. It is enough to keep merges inside words for a small training set, and the rest of the pipeline stays the same.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a prompt that starts without a space tokenize differently from one that starts with a space? Expected: the space is part of the word-initial token, so the first word maps to a different id; set the prefix-space behavior explicitly.
- **Level 3:** Why does the `regex` module matter for this pattern? Expected: the Unicode letter and number classes cover scripts beyond ASCII, which the standard library's engine lacks.
- **Level 3:** What is the trade in skipping the cut and running on raw text? Expected: no language rules and good behavior for scripts without spaces, against cross-word pieces that compress slightly better and are less interpretable.
- **Level 3:** A tokenizer file is unchanged but ids differ between two machines. What in this stage can cause it? Expected: one machine fell back to the ASCII pattern because the `regex` module was missing, so the chunks differ.

**Wrong answers, and why they fail**

- "Pre-tokenization is just splitting on spaces." The pattern also handles contractions, digits, punctuation and runs of whitespace, and it keeps the space attached to the word.
- "The cut is cosmetic; the merges would find the same pieces." Without the cut the merges cross word boundaries and the vocabulary fills with phrases.
- "Attach punctuation to the word it follows." Then `world!` and `world` are different pieces, and the vocabulary pays for every punctuation variant.

:::

## Why the encoder replays the merge list in order

*Level 2 (working) · concept · about 8 minutes*

At encode time a BPE tokenizer holds the complete merge table. Why does it have to replay the merges in the order they were learned, and what goes wrong when two merges could fire at the same spot?

:::answer Show the answer
:::say Short answer
Encoding must reproduce what training did to the same text, and training saw the merges one at a time in that order. If merge one created "th" and merge five created "the" from "th" plus "e", then "the" can only form after "th" exists. When two merges could apply at one position, the one with the lower rank, learned earlier, wins; change that rule and the same text yields different ids, so the model sees a distribution of ids it was never trained on.
:::

**Full answer**

**The naive encoder**

```python
def encode_bpe(word, merges):
    symbols = list(word) + ["</w>"]
    for a, b in merges:
        i = 0
        while i < len(symbols) - 1:
            if symbols[i] == a and symbols[i + 1] == b:
                symbols = symbols[:i] + [a + b] + symbols[i + 2:]
            else:
                i += 1
    return symbols
```

It walks the whole table for every word, so the cost is the word length times the number of merges. Correct for a merge table trained on characters, and slow.

**The rank-based encoder**

The capstone version starts from the byte split and repeats: find the applicable merge with the lowest rank anywhere in the current sequence, apply it, and scan again, until no merge in the table applies. Production encoders keep the same semantics with a rank lookup and a priority queue of candidate pairs, which runs in close to linear time.

**Why the rule is the contract**

The training loop and the encoder share the merge table, and that sharing is the whole contract. Training merged the most frequent pair first, so an input that contains both halves of an early merge was always merged that way in the training data. An encoder that prefers a later merge, or the longest piece, produces a segmentation the model never saw. Nothing crashes; the ids are simply different.

**What special tokens do here**

Reserved strings such as the end-of-text marker are matched exactly before the merge loop runs and mapped to fixed ids. They never take part in a merge, so no table order can split or join them.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why is the naive loop slow? Expected: it scans the full merge table for every word, so the cost grows with the table size times the word length.
- **Level 3:** How do production encoders get close to linear time? Expected: a rank lookup for each adjacent pair and a priority queue that always surfaces the lowest-ranked applicable merge.
- **Level 3:** Two tokenizers were trained on different corpora to the same vocabulary size. Do they give the same ids? Expected: no; different corpora give different merge tables and different ranks.
- **Level 3:** What test pins the order? Expected: encode a held-out word and compare with recorded ids; the capstone's tests also pin the round trip and the special-token reservation.

**Wrong answers, and why they fail**

- "Greedily take the longest token in the vocabulary that matches." That is a different algorithm and gives a different segmentation from the training run.
- "Order does not matter because merges commute." A later merge depends on the symbols that earlier merges created, so they do not commute.
- "Sort the merges by token length." Length is not rank; a long piece may have been learned early and a short one late.

**Related lesson in this course:** [Deep dive 2: inside the Transformer](#aideep-2)

:::

## Every output validates and the answers are wrong

*Level 3 (senior) · design · about 10 minutes*

You review the schema of an extraction service. It is `{"answer": ..., "reasoning": ..., "date": <a strict year-month-day regex>}`, enforced by constrained decoding. Compliance is perfect, yet accuracy is poor and some dates are invented. What is wrong with the design, and how do you change it?

:::answer Show the answer
:::say Short answer
Two faults that no validator can catch. The answer field comes before the reasoning field, so the model commits to an answer before it has reasoned, and the strict date pattern leaves no legal way to say unknown, so the model complies by inventing a date. Put reasoning first and the answer last, and allow a null or a sentinel for a missing date; field order is logic, not formatting, and a grammar that is too strict forces a confident wrong value.
:::

**Full answer**

**Fault one: premature commitment**

Generation is left to right. With `answer` first, the model must emit the label before it has written a single word of analysis; the reasoning that follows is a justification of a choice already made. Swap the order and the model writes its analysis into the context that the answer is then conditioned on. The JSON is equally valid either way. Only the second way is correct.

```json
{"reasoning": "... therefore ...", "answer": "yes"}
```

**Fault two: a grammar with no exit**

The date regex admits only well-formed dates. When the source has no date, the model cannot output "unknown", and a mask that forbids every honest token leaves only dishonest ones. Allow `null` or a sentinel string in the schema and instruct the model to use it.

**The other pitfalls to check in the same review**

- **Recursive schemas behind a state-machine library.** The machine flattens recursion to a fixed depth; nested structures need a context-free grammar engine.
- **Huge enums.** An enum of 10,000 options compiles slowly or times out; narrow the candidates with a retriever first, then constrain to those.
- **Plain JSON mode without a schema.** It guarantees syntax, not your fields.

**The validation plan that would have caught it**

Compliance rate is one number of four. Add semantic validity, measured with a judge or a labeled set, the field coverage rate, and latency at p50 and p99. A system with perfect compliance and poor semantic validity is exactly this case.

**The rule for the team**

Refuse any schema that puts `answer` or `decision` before its reasoning fields. Refuse bare JSON mode without a schema. Flag any recursive schema that sits behind a state-machine-only library.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How do you measure semantic validity when compliance is already perfect? Expected: a labeled sample scored by a judge or by rules on the content, tracked separately from schema compliance.
- **Level 3:** The output needs a tree, such as nested comments. What changes? Expected: a state-machine library flattens recursion; move to a context-free grammar engine.
- **Level 4:** The product streams the answer to the user and wants it first for latency. How do you resolve the conflict? Expected: name the trade; options are two calls, reasoning in a hidden field before a visible answer, or accepting the latency; never answer-first with the same accuracy expectation.
- **Level 4:** How would the invented dates have shown up in monitoring? Expected: a field coverage rate near 100 percent on a corpus where the date is often missing is itself the alarm; compare the rate with the base rate of the field in the source.

**Wrong answers, and why they fail**

- "Tighten the regex so only plausible dates pass." The grammar is already the problem; a tighter one forces more invention.
- "Add a line to the prompt asking the model to be honest." The mask forbids the honest tokens; no instruction can make the model emit a token with minus infinity logit.
- "Validation passes, so the system works." Validation checks shape; it cannot see that the answer was committed before the reasoning or that a date was made up.

:::

## From acceptance rate to tokens per pass

*Level 3 (senior) · estimate · about 10 minutes*

A draft is accepted 80 percent of the time per token and proposes four tokens per step. How many tokens does one pass of the big model produce on average, how does the draft's own cost enter, and when does a longer draft stop paying?

:::answer Show the answer
:::say Short answer
The expected tokens per verifier pass are `(1 - alpha^(K + 1)) / (1 - alpha)`; at an acceptance of 0.8 and K of 4 that is 3.36, so about 3.36 times fewer big-model calls. The wall time per token is `(K c + 1)` over that expectation, where c is the draft's cost relative to the verifier, so a longer draft adds cost linearly while the geometric series saturates; at 0.8 acceptance and c of 0.05 the optimum sits around 5 to 7 drafts for about 3.2 times. The lever that matters is the acceptance rate: at a fixed K, a rise from 0.6 to 0.9 about doubles the expected tokens per pass.
:::

**Full answer**

**The formula**

Each drafted token is accepted independently with probability alpha, and the step ends on the first rejected token, so the number of accepted drafts is a truncated geometric variable. Add the bonus token on full acceptance and the expectation is

```text
E[tokens per verifier pass] = (1 - alpha^(K + 1)) / (1 - alpha)
```

| alpha | K | tokens per pass |
|---|---|---|
| 0.8 | 4 | 3.36 |

At a fixed K, a higher alpha raises every term of the series, so the expectation climbs steeply as alpha nears one.

**Where the draft's cost enters**

One step costs K draft forwards plus one verifier forward, `K c + 1` in verifier units. Divide by the expected tokens and you have the time per token. For a verifier at about 30 ms and a draft at about 3 ms, five drafts plus one verify is about 45 ms per step. The step emits between one and six tokens, so divide the 45 ms by the expected tokens per pass and compare the result with 30 ms for one plain token. As K grows the numerator grows linearly and the expectation flattens toward `1 / (1 - alpha)`, so there is an optimum.

| alpha | c | best K | speedup |
|---|---|---|---|
| 0.8 | 0.05 | about 5 to 7 | about 3.2 times |
| 0.95 | 0.02 | about 8 to 10 | toward 5 times |

**What moves alpha**

How close the draft's distribution is to the verifier's, which is a function of how the draft was built; the sampling temperature, where greedy against greedy accepts most; and the task, where code and structured output accept more than free-form prose.

**Where the formula stops being the whole story**

At high concurrency the verify pass is no longer free: the decode batch already fills the memory bandwidth, and a rejected draft costs a verify and a re-roll. The production lesson's rule is that below an acceptance of about 0.55 speculation is net negative at high concurrency, so measure alpha on real traffic before you set K.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** At an acceptance of 0.95 and a draft cost of 0.02, where is the optimum? Expected: around 8 to 10 drafts, with the speedup pushing toward 5 times.
- **Level 3:** Why does the expectation saturate as K grows? Expected: it is a geometric series; the probability that all drafts up to position K are accepted falls as alpha to the K, so late positions add almost nothing.
- **Level 4:** How does batch size change the arithmetic? Expected: the verifier's extra work per draft is no longer hidden behind idle bandwidth, so the effective cost of verification and of a rejection rises, and the break-even acceptance climbs toward 0.45 to 0.55.
- **Level 4:** What single measurement do you add to the dashboard? Expected: accepted draft tokens divided by proposed draft tokens, per traffic slice, so alpha is visible where the formula needs it.

**Wrong answers, and why they fail**

- "The speedup equals the draft length." Only if every draft is accepted; the geometric series and the draft cost cut it well below K.
- "Doubling K doubles throughput." Beyond the optimum the extra drafts are mostly rejected and their cost is paid anyway.
- "A draft ten times cheaper gives ten times the speedup." The draft cost sets c; the acceptance rate sets the expectation, and a cheap draft that is often wrong gains little.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::
