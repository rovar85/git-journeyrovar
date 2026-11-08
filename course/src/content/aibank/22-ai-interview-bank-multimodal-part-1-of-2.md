---
track: aibank
title: "AI interview bank: Multimodal (part 1 of 2)"
short: Multimodal 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## How much context one image costs

*Level 1 (screening) · estimate · about 8 minutes*

A product manager asks how much of the context window one image uses in a LLaVA-style model with a 336-pixel encoder. Give the number, say where it comes from, and say how it changes with high-resolution tiling or with a query-based bridge.

:::answer Show the answer
:::say Short answer
One image costs 576 tokens: the encoder cuts the 336-pixel image into 14-pixel patches, a 24 by 24 grid, and the projector passes every patch token through. In a 2048-token context that leaves 1472 tokens for text; at 32k or 128k it is a small share. Tiling multiplies it: a 2 by 2 grid of 336-pixel crops plus one global thumbnail gives about 2880 tokens per image, and a 1 by 3 grid plus the thumbnail gives fewer, because it has one crop less. A query-based bridge compresses any image to a fixed 32 tokens, and a resampler to 64.
:::

**Full answer**

**Where the count comes from**

```text
336 / 14 = 24 patches per side
24 x 24 = 576 patch tokens
each token: 1024 wide from the encoder, 4096 wide after the projector
```

The earlier 224-pixel encoder gave 256 tokens. The move to 336 pixels raised the count to 576, and the training sequences stayed at 2048 tokens.

**What it costs in context**

| Context | One image |
|---|---|
| 2048 | 576 tokens, leaving 1472 for text |
| 32k | a small share |
| 128k | a rounding error |

**Tiling for high resolution**

Documents and charts need more pixels. The tiling scheme splits the image into a 2 by 2 or 1 by 3 grid of 336-pixel crops, adds one low-resolution global view, and concatenates the tokens of every crop: about 2880 visual tokens per image for the 2 by 2 grid, and fewer for the 1 by 3 grid, which has one crop less. Reading and chart scores jumped with it.

**The compressing bridges**

A query-based bridge uses a fixed set of 32 learned query vectors that cross-attend to the patch tokens, so any image becomes 32 tokens. A resampler with 64 latents does the same at 64. The price is a bottleneck: the language model never sees the raw patches.

**How many tokens you need**

The ablations in the recipes lesson put the sweet spot for most tasks at 576 to 1024 visual tokens per image, 64 as too few for reading text, and 2048 or more as useful only for documents and charts. The token count explains more of the variance in benchmark scores than the connector architecture does.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does a higher input resolution raise the token count? Expected: the patch size is fixed, so more pixels per side means more patches per side, and the count grows with the square of the side.
- **Level 2:** Which tasks justify the tiling cost? Expected: text in images, charts and documents; general scene questions gain little from it.
- **Level 2:** When does the 32-token bridge win? Expected: when the token budget binds, as with long video or many images per prompt; for one image in a long context the compression buys little.
- **Level 3:** How do you size the budget for video? Expected: tokens per frame times frames, so a compressing bridge or heavy frame sampling is the only way to fit minutes of video; count the tokens before you pick the bridge.

**Wrong answers, and why they fail**

- "An image costs one token, the placeholder." The placeholder is replaced by one embedding per patch token before the forward pass; the encoder grid sets the count.
- "Higher resolution is free because the encoder is fixed." More patches means more visual tokens in the language model's sequence, and the language model's compute grows with them.
- "The connector decides the quality, so pick the bridge first." At a fixed token count the connector barely matters; the token count and the encoder matter more.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Why the first VLM stage trains only the bridge

*Level 1 (screening) · concept · about 8 minutes*

In the first training stage of most open vision-language models, both the vision encoder and the decoder are frozen, and only the small projector learns. A junior engineer asks why anyone would train the smallest part first instead of the parts that matter. Answer them.

:::answer Show the answer
:::say Short answer
The two big parts already work: the encoder represents images, and the language model writes text. What is missing is a translation between their two vector spaces, and that translation is small. Training only the bridge costs a few hundred steps on one GPU, cannot damage either pretrained part, and gives the language model inputs it can read before anyone unfreezes it. Unfreezing the language model comes in the second stage, once the bridge produces tokens that look like language.
:::

**Full answer**

**What the projector is**

A two-layer MLP: linear, GELU, linear. The capstone's head maps 768 to 1024 to 512 and holds about 1.3M parameters next to an encoder of 86M. The reference open recipe's head maps 1024 to 4096 to 4096, about 22M parameters next to a 303M encoder and a 7B language model.

**Why the frozen big parts are the point**

- Stability. Gradients from a few thousand noisy pairs would overwrite features that the encoder learned from hundreds of millions of images.
- Cost. The alignment stage of the reference recipe trains on 558k caption pairs in a few hours at a batch of 128. The capstone's version drives its loss from about 1.07 to about 0.80 in 200 steps.
- A clean signal. With both big parts fixed, the loss moves only through the bridge, so you can read whether the two spaces align.
- Swappability. Change the language model and retrain the bridge; the encoder stays.

**What the loss is**

The reference recipe uses the language-modeling loss on the caption, conditioned on the projected image tokens. The capstone uses a per-pair cosine alignment loss, one minus the cosine between a pooled image vector and a mean-pooled caption embedding, so that the dynamics stay visible; a contrastive batch version is the next lesson.

**What comes after**

Stage two unfreezes the language model, fully or through adapters, keeps the bridge trainable, and trains on instruction data. A bridge that was never aligned first gives the language model noise at the start of that stage.

**The other kind of bridge**

A query-based bridge with a fixed set of learned vectors compresses the image to a fixed token count. It is larger, 188M parameters in the original, and it still trains with the backbones frozen; the principle is the same.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does a frozen parameter mean in code? Expected: `requires_grad=False`, so the optimizer never sees it, and no memory goes to its gradient or optimizer state.
- **Level 2:** Why pool the image tokens before the cosine loss in the capstone? Expected: the caption side is one vector, so the image side needs one vector too; the first token or the mean over all tokens are the usual choices.
- **Level 2:** One linear layer would be smaller still. Why two? Expected: a single linear map can rotate and rescale but cannot bend; the GELU between two layers gives the one non-linear bend that aligns contrastive vision features to language embeddings.
- **Level 3:** What breaks if you skip the alignment stage and start with instruction tuning with everything unfrozen? Expected: the language model receives unaligned inputs, and its gradients on a small set damage its text ability; the two stages exist to give it readable inputs first.

**Wrong answers, and why they fail**

- "Train the encoder; it is the part that sees." It already sees, and a small dataset cannot teach it more than it loses by overwriting features; the missing part is the translation.
- "The projector is too small to carry an image." It does not carry the image; it maps tokens that already encode the image into the space the language model reads.
- "Freezing is only a memory trick." Memory is one gain; the larger ones are stability, a clean training signal, and the ability to swap the language model.

:::

## A caption decoder with its masks swapped

*Level 2 (working) · code-reading · about 12 minutes*

A teammate's vision-language decoder trains well, but at inference the captions are wrong from the second token on, and a test with an image of 197 tokens crashes with a shape error. Read the block and the decode loop and find the problems.

```python
def causal_mask(n):
    return torch.tril(torch.ones(n, n, dtype=torch.bool))


class DecoderBlock(nn.Module):
    def forward(self, text, image, mask):
        text = text + self.self_attn(self.ln1(text), mask=None)
        text = text + self.cross_attn(self.ln2(text), image, mask=mask)
        text = text + self.ffn(self.ln3(text))
        return text


def generate(model, image, prompt_ids, steps):
    ids = prompt_ids
    for _ in range(steps):
        memory = model.encode_image(image)
        mask = causal_mask(ids.shape[1])
        logits = model.decode(ids, memory, mask)
        ids = torch.cat([ids, logits[:, -1].argmax(-1, keepdim=True)], dim=1)
    return ids
```

:::answer Show the answer
:::say Short answer
The masks are swapped. Self-attention over the text runs with no mask, so every position sees the future during training, and the model learns to copy the next token instead of predicting it, which breaks as soon as it must generate. Cross-attention gets the causal text mask, which is square over the text length and cannot apply to scores that span text by image, hence the shape error with 197 image tokens. The decode loop also re-encodes the image on every step; encode once, cache the image keys and values, and reuse them.
:::

**Full answer**

**The mask discipline**

| Attention | Query | Key | Mask |
|---|---|---|---|
| Self-attention over text | text, length Nt | text, length Nt | causal, lower-triangular Nt by Nt |
| Cross-attention into the image | text, length Nt | image, length Nv | none |

Text may not look ahead during autoregression. The image is fully observed before any text exists, and its patches have no order, so every text position may attend to every patch.

**Bug 1: no mask on self-attention**

With `mask=None`, position i attends to the positions after it. Under teacher forcing the target of position i is the token at i plus one, which is now visible, so the loss falls fast and the model learns to look it up. At inference the future does not exist, and from the second token the captions fall apart. That is the symptom in the report.

**Bug 2: the causal mask on cross-attention**

The scores of cross-attention have the shape Nt by Nv. A causal mask of shape Nt by Nt fits only when Nv equals Nt, and then it silently hides part of the image from the early text tokens. With a 197-token image memory and a shorter text, the shapes do not broadcast and the forward pass raises. The capstone adds one shape-validation function, so that this mistake raises a clear error instead of corrupting a loss curve.

**Observation 3: no key and value cache**

The image does not change during decoding. Encoding it on every step and projecting its keys and values again multiplies the cost of the heavy encoder by the number of generated tokens. Encode once, project once, store the keys and values, and pass them to every step. The capstone tests that the cached and the uncached paths give identical logits.

**The fixed block**

```python
def forward(self, text, image_kv, text_mask):
    text = text + self.self_attn(self.ln1(text), mask=text_mask)
    text = text + self.cross_attn(self.ln2(text), image_kv, mask=None)
    text = text + self.ffn(self.ln3(text))
    return text
```

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the training loss look fine with the first bug? Expected: teacher forcing puts the target token in the input one position later, and an unmasked attention can read it; the loss measures a lookup, not a prediction.
- **Level 2:** When does cross-attention need a mask? Expected: with several images and text segments interleaved, where a segment may see only the images before it; for one image and one caption, none.
- **Level 3:** What does the gate from the Flamingo design add to this block, and why? Expected: a learned scalar through a hyperbolic tangent on the cross-attention residual, starting at zero, so that a frozen language model keeps its text behavior at initialization and mixes the image in gradually.
- **Level 3:** How do you test the cache path? Expected: run the same prompt with and without the cache and assert that the logits match to float tolerance; the capstone ships that test.

**Wrong answers, and why they fail**

- "Use the causal mask on both attentions to be safe." Cross-attention scores are text by image, so a square text mask either raises or hides part of the image; the image needs no mask.
- "The captions are wrong because the image encoder is weak." A model that is right on the first token and wrong from the second leaked the future in training; the mask is the cause.
- "Recomputing the image each step is fine, the encoder is small." The encoder is the heaviest part per call, and the image never changes; the cache is what makes captioning fast.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## A general VLM for which shelf the item is on

*Level 2 (working) · tradeoff · about 10 minutes*

A warehouse team wants a general vision-language model to answer "which shelf is the item on" and "is the box on top of or under the pallet" from camera frames. They plan to ship as soon as a demo works on ten images. What do you tell them?

:::answer Show the answer
:::say Short answer
Spatial relations are the weak spot of today's general-purpose vision-language models: on benchmarks of above and below, left and right, counting and distance they score about 50 to 60 percent, below human level. A demo on ten images proves nothing about that distribution. Build a labelled eval of a few hundred frames with the exact questions first, measure the model, and compare it with a specialised detection or depth model whose box geometry you post-process; if the general model stays, fine-tune it on the task and keep a human-review route for low-confidence answers.
:::

**Full answer**

**Why the general model struggles**

The model sees projected patch tokens and reasons in language. It learned what is in an image from caption pairs that rarely say where exactly. The lesson's figure for spatial reasoning benchmarks is 50 to 60 percent, and its recommended alternatives for pure spatial tasks are a keypoint or pose estimator, a depth model, or a detector with the box geometry post-processed.

**What a real eval looks like**

- A few hundred frames from the warehouse cameras, not stock photos, with the two question types written the way the operators will ask them.
- Labels from two people, with the agreement measured.
- A split by lighting and camera position, because the demo images will not cover them.
- A confusion matrix per question type, not one accuracy number.

**The alternatives**

| Approach | Strength | Cost |
|---|---|---|
| Detector plus box geometry | exact image-plane above, under, left and right from coordinates | labels for the object classes; no language interface |
| Depth model plus detector | distance and stacking | calibration per camera |
| General VLM, zero-shot | any question in plain language | weak on spatial relations; hallucination risk |
| General VLM, fine-tuned | a plain-language interface with the domain learned | 5,000 to 50,000 labelled examples and hours of GPU time |

**If the VLM stays**

Fine-tune with low-rank adapters on the attention and projector layers, which the lesson sizes at rank 16 to 64 on one datacenter GPU for 2 to 10 hours. Then monitor hallucination in production: a cross-modal error rate flags answers where the text confidence is high but the image-text similarity is low, and routes them to review.

**What to tell them**

Ship a measured system, not a demo. Ten images is a smoke test. The eval decides between the detector route and the fine-tuned model, and the hallucination monitor stays whichever route wins.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a model that captions well fail at which object is on top? Expected: captions describe content, not geometry; the training pairs rarely contain precise relations, and fine position fades as the language model reasons over projected tokens.
- **Level 2:** What does the detector route lose? Expected: the plain-language interface and the open vocabulary; it answers only the relations you compute from boxes, for the classes you labelled.
- **Level 3:** How many frames does the eval need, and how do you decide? Expected: enough that each question type and each camera condition has tens of examples; a few hundred in total is the floor, and you grow it where the confusion matrix is unstable.
- **Level 3:** How does a stronger encoder change the picture? Expected: self-supervised encoders carry more dense spatial features and lead vision-centric benchmarks; swapping the encoder and retraining the projector is the lesson's hard exercise for these tasks.

**Wrong answers, and why they fail**

- "The demo worked on ten images, so it works." Ten images cannot cover the cameras, the lighting or the relation types; the benchmark figure for this kind of question is near a coin flip for some relations.
- "A bigger VLM will fix spatial reasoning." Size lifts language reasoning more than geometry; the lesson's advice for pure spatial tasks is a specialised model.
- "Fine-tune on the demo images." Tens of examples teach nothing and overfit; the fine-tuning route needs thousands of labelled frames and an eval that is separate from them.

:::

## Adapter tokens or one shared vocabulary for images

*Level 2 (working) · tradeoff · about 12 minutes*

A product needs a model that reads screenshots and answers questions today, and might need to draw diagrams later. Two designs are on the table: an adapter model, where a vision encoder feeds projected tokens into a text-only decoder, and a model that turns images into discrete codes in the same vocabulary as text and trains one next-token loss over interleaved sequences. Compare them and pick for this product.

:::answer Show the answer
:::say Short answer
The adapter design is late fusion: images enter as projected continuous tokens or through cross-attention, the decoder reuses all its text pretraining, and the output is text only. The shared-vocabulary design is early fusion: a quantizer maps an image to discrete codes, the transformer trains one loss over text and image codes, and it can emit image codes, so it generates pictures. For a product that must read screenshots now, pick the adapter: it reuses more pretrained compute, has no quantizer ceiling for understanding, and is cheaper to serve; add the early-fusion model only when drawing becomes a real requirement, because its image quality is capped by the quantizer and each generated image costs a decoder pass over a thousand or more codes.
:::

**Full answer**

**Two paths into the model**

| | Late fusion, adapter | Early fusion, shared vocabulary |
|---|---|---|
| Image input | encoder features projected into the embedding space, or read through cross-attention | discrete codes from a learned quantizer, looked up like text tokens |
| Loss | language-modeling loss on text | a single next-token loss on text and image codes together |
| Output | text only | text and images, interleaved as the model chooses |
| Reuse of the pretrained LLM | full | the model trains on the mixed stream from the start |
| Ceiling for understanding | the encoder | the quantizer's reconstruction |
| Serving cost per answer | one decoder step per generated text token | one decoder step per generated text token, plus 1024 sequential decoding steps per generated image, one per code, then a decoder pass for the pixels |

**What early fusion buys**

One sequence, one loss, and mixed-modality output. The reference model's quantizer maps a 512 by 512 image to 1024 codes from a codebook of 8192, inside a single vocabulary of 65,536 entries that also holds the text tokens and the separators. When the model emits the image-start separator, the next 1024 codes go to the decoder for pixels.

**What it costs**

- A quality ceiling. The quantizer is lossy; at that codebook and code count the reconstruction peaks around 26 to 28 dB, below the 32 and more of continuous latent diffusion. A better quantizer lifts the ceiling, but the ceiling is the quantizer.
- Training stability. Early-fusion training at scale diverged without normalization of the attention queries and keys, dropout after every residual, and an extra normalization on the last block.
- Compute. Every generated image is a decoder pass over its codes.

**What late fusion buys**

It bolts onto any pretrained decoder, keeps the text stream clean so that text ability survives, and computes the image once; with cross-attention the image keys and values are cached across decode steps. It cannot emit images.

**The pick**

Reading screenshots is understanding, and the adapter is the simpler and stronger tool for it today. When drawing arrives, measure whether a separate generation model behind a tool call meets the need before you move the whole stack to early fusion.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why can the adapter model not generate an image? Expected: its output head covers the text vocabulary only; images enter as embeddings and never exist as tokens it could predict.
- **Level 2:** What is the shared vocabulary made of? Expected: text tokens, image codes and modality separators in one id space, so one embedding table and one output projection cover all of them.
- **Level 3:** Where does the quality ceiling of the early-fusion model come from, and what moves it? Expected: the quantizer's reconstruction; a larger codebook and more codes per image raise it, as the next generation of tokenizers showed.
- **Level 3:** A hybrid keeps images continuous and trains a diffusion loss on patches next to the text loss. What does it trade? Expected: no quantizer and higher image fidelity, against two losses on different scales to balance and a diffusion sampling loop at generation time.

**Wrong answers, and why they fail**

- "Early fusion is the future, so start there." For understanding alone it reuses less pretrained compute and caps quality at the quantizer; the adapter is the simpler, stronger choice until generation is required.
- "The adapter can draw if you add a decoder head." Its images never exist as predictable tokens; drawing needs either image codes in the vocabulary or a separate generation model.
- "The quantizer is a detail; the transformer does the work." In the early-fusion family the quantizer sets the ceiling on every image the model produces.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Any number of images, a fixed number of tokens each

*Level 2 (working) · concept · about 12 minutes*

A model must take a prompt with any number of images, some small and some large, interleaved with text, and then caption the last image from a few in-context examples. Explain the module that makes the number and the size of the images manageable, and how a text token knows which image to look at.

:::answer Show the answer
:::say Short answer
A resampler with a fixed set of learned latent vectors turns the patch tokens of each image into a fixed number of visual tokens. In the reference design, 64 latents attend over however many patches the encoder produced, 196 for a small image or 900 for a large one, through six blocks of cross-attention and self-attention, and every image exits as 64 tokens of one width. Text tokens then read those tokens through gated cross-attention layers inserted between the frozen language model blocks, and a mask lets each text token attend only to the latents of the most recent image before it in the sequence.
:::

**Full answer**

**The resampler**

Each block does two things. The K latents cross-attend to the N patch tokens, with queries from the latents and keys and values from the patches; then the latents run self-attention and a feed-forward layer among themselves. After six blocks the output is K tokens of width 1024, whatever N was. For video the resampler runs on each frame, with a temporal position encoding, so the frame count times 64 is the token count of the clip.

**Why fixed matters**

Interleaved prompts have zero, one or many images. With a fixed count per image, what any one text token sees in cross-attention has the same shape whatever the prompt. The total grows with the image count, but each text token reads one image's latents.

**The gated bridge**

Between every fourth block of the frozen language model sits a new cross-attention layer with a residual gate: the output equals the block output plus the hyperbolic tangent of a learned scalar times the cross-attention. The scalar starts at zero, so at initialization the new layers do nothing, and the model is exactly the pretrained text model.

**The mask**

In a sequence like image A, caption A, image B, caption B, image C, question, a text token attends only to the resampler tokens of the most recent image before it; the other images are masked. Attending to all preceding images is a valid alternative; the reference design chose the most recent one.

**In-context few-shot**

Three image and caption pairs followed by a new image form a prompt that the frozen language model already knows how to complete. The gated layers feed it image content, and its in-context learning carries over without a gradient step. That is the point of keeping the language model frozen and the gate at zero.

**Against the single-input bridge**

The query-based bridge from the earlier lesson also uses learned queries, but once, at the input layer, with 32 queries. The resampler plus gated cross-attention reads the latents every few layers, which costs more parameters and compute and buys interleaving and few-shot behavior.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the latent side supply the query vectors and the patch side the rest, not the other way around? Expected: the output has one row per query, so queries from the latents give a fixed number of rows; the reverse would give one row per patch again.
- **Level 2:** What does the temporal encoding do for video? Expected: each frame gives the same 64 latents, so without a time signal the model cannot tell the first frame from the last; the encoding marks the frame index.
- **Level 3:** Why mask to the most recent image instead of all preceding images? Expected: it keeps the shape each text token sees constant and matches the interleaved reading order, where a caption describes the image before it; seeing all images is the alternative with a different trade-off.
- **Level 3:** A fine-tune of a model like this lost text-only quality. Where do you look? Expected: the gate; if it opened too wide too fast, visual noise overwrote the text residual stream, so compare the gate values by layer with the base.

**Wrong answers, and why they fail**

- "Pad every image to the same number of patches." Padding wastes compute on large images and loses detail on small ones; the resampler gives a fixed count without either.
- "Let the text tokens attend to all image patches directly." The count then varies per image and per prompt, and a prompt with many images floods the attention; the latents keep it fixed.
- "Initialize the gate open so that the model learns faster." An open gate at step zero destroys the frozen language model's text behavior; a start at zero is what preserves it.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Build and test a projection between two frozen models

*Level 2 (working) · take-home · about 30 minutes*

Take-home. You get a frozen vision encoder that emits 197 tokens of width 768 per image and a frozen text embedding table of width 512. Build the smallest module that lets the two talk, train it on paired samples, and ship tests that prove it works. Describe the design, the loss, how you train it, and the tests.

:::answer Show the answer
:::say Short answer
Pool the 197 image tokens to one vector, pass it through a two-layer MLP, 768 to 1024 to 512 with a GELU between, and compare it with the mean-pooled caption embedding through a cosine alignment loss, one minus the cosine. Train only the MLP, about 1.3M parameters, with the encoder and the table frozen, for a few hundred steps over a few dozen pairs. The tests: the output shape equals the text width, the frozen parts have no trainable parameters, the loss is zero on identical vectors and two on opposite vectors, a gradient reaches the projector after one backward pass, and the loss at the last step is lower than at the first.
:::

**Full answer**

**Design**

```text
image tokens (B, 197, 768) -> pool -> (B, 768)
MLP: Linear(768, 1024) -> GELU -> Linear(1024, 512) -> (B, 512)
caption ids -> frozen table -> mean over tokens -> (B, 512)
loss = 1 - cos(image_emb, text_emb)
```

Pooling: the first token is the simplest choice; a mean over the 196 patch tokens is the alternative, and the exercise compares them. Two layers, because one linear map cannot bend the space; the GELU gives the one bend that aligns the two bases.

**Parameters**

| Layer | Shape | Parameters |
|---|---|---|
| first linear | 768 by 1024 | 768 times 1024, plus 1024 |
| GELU | | 0 |
| second linear | 1024 by 512 | 1024 times 512, plus 512 |

About 1.3M in total, next to an encoder of 86M. Both big parts have `requires_grad=False` on every parameter.

**Training loop**

- Build 32 synthetic pairs from a seed when no dataset is allowed, and cycle them.
- One optimizer over the projector parameters only.
- Run 200 steps and print the loss every 25 steps. The capstone's run falls from about 1.07 to about 0.80.
- Print the final cosine per pair.

**Tests**

1. The projector output shape matches the configured output width.
2. The frozen text table and the frozen vision encoder have zero parameters that require a gradient.
3. The cosine loss is 0 on identical vectors and 2 on anti-parallel vectors.
4. A gradient reaches the projector weights after one backward pass.
5. The loss at step 200 is lower than at step 0.

**What you ship**

The projector weights are the only new artifact. At inference the encoder still runs its forward pass, then the projector, and the output lands in the text space. The same shape appears in every open adapter model: pool, project, train alone.

**The next step, for the discussion**

The per-pair cosine aligns direction; a contrastive batch loss would also push each image away from the other captions in the batch. For a decoder that grounds each word, cross-attention from text queries into the 197 image tokens replaces the pooled vector; that is the following capstone.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why cosine and not mean squared error? Expected: alignment means the same direction in the joint space, not equal vectors; cosine is scale-invariant, so the projector is not punished for a norm the text table happens to have.
- **Level 2:** What does a learned temperature on the cosine change? Expected: a sharper or flatter loss surface; too small gives noisy gradients and too large plateaus high, as the exercise shows.
- **Level 3:** The capstone's run stops near 0.80 after 200 steps. Is that a floor? Expected: no; it is the loss of one run at 200 steps. The projector has 1024 hidden units for 32 pairs, so more steps or a different rate can push the loss lower; on natural pairs, the encoder features set how far the alignment can go.
- **Level 3:** How does this module relate to a query-based bridge? Expected: that bridge ends in the same kind of projection to the text width; the difference is that it first compresses the tokens through learned queries instead of pooling.

**Wrong answers, and why they fail**

- "Fine-tune the encoder as well; it is only 86M parameters." The take-home gives frozen parts for a reason: a few dozen pairs cannot teach the encoder anything, and the test that checks the frozen table would fail.
- "Use a single linear layer; it is enough for a rotation." The two bases differ by more than a rotation; the non-linearity is what lets one bend close the gap.
- "Skip the tests; the loss went down." The loss can fall through a shape bug or a leak into the frozen parts; the tests pin the contract that the loss alone cannot.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Predict the next scale instead of the next token

*Level 2 (working) · concept · about 10 minutes*

Token-by-token image generation used to mean predicting one code after another in raster order. A newer method predicts whole grids at increasing resolution instead. Explain what it predicts at each step, why that fixes the old method's main weakness, and how it compares with diffusion in the number of network passes.

:::answer Show the answer
:::say Short answer
Next-scale prediction tokenizes an image into a pyramid of grids, from one code up to the full latent resolution, with a residual quantizer so that the sum of the scales reconstructs the image. The transformer is causal across scales and parallel within a scale: given all coarser grids, it predicts every code of the next grid in one pass. That removes the raster-order problem, where an early corner code had to commit before any context existed. For a 256 by 256 image the reference uses about 10 scales, so generation is about 10 passes against 28 to 50 for a diffusion transformer, and all codes of a scale come out together.
:::

**Full answer**

**The tokenizer**

A multi-scale residual quantizer: encode the image to a latent, quantize it at 1 by 1, then at 2 by 2, then 4 by 4, up to the full latent grid, with one shared codebook. Each scale encodes what the coarser scales missed, and the decoder takes the sum of all upsampled scale embeddings. The codebook is typically 4096 to 16384 entries. Train it once and freeze it.

**The model**

The input for scale 1 is a start token. The input for each later scale k is a grid built from the coarser scales only, upsampled to the size of scale k. The codes of scale k are the targets at those positions, and they enter the input only for the scales after k. Position embeddings carry the scale index and the position within the scale. The attention mask is block-causal: a code at scale k attends to every code of scales 1 to k, including all positions of its own scale, and to nothing finer. Training is cross-entropy on the codes at each scale given the coarser scales.

**Why it beats raster order**

1. Coarse to fine matches image statistics: low-frequency structure is stable and predictable, and detail is conditional on it.
2. Parallel within a scale: the generation length is logarithmic in the pixel count instead of linear.
3. No order bias: nothing is left of or above anything inside a scale, so no early code commits before the late context exists.

**The scaling result**

The paper reports a power law of image quality against compute, the way language models scale in perplexity, and a better quality than a diffusion transformer at matched compute on a class-conditional benchmark.

**Relation to diffusion**

Both break generation into easier conditional steps. Diffusion adds noise and learns to remove one step of it; next-scale prediction adds resolution and learns to predict one more scale. The scale method needs fewer passes and parallelizes inside each pass; text-conditioned variants were an open research direction at the time of the lesson.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the residual structure matter for the tokenizer? Expected: each scale encodes only what the coarser scales missed, so the sum reconstructs the latent and the scales are not redundant.
- **Level 2:** What does a code at scale k see, and what may it not see? Expected: all codes at scales 1 to k, its own scale's positions included; nothing at finer scales.
- **Level 3:** What happens to quality and cost as you add scales? Expected: finer residuals and better reconstruction, at the cost of one more pass per scale; the lesson's exercise sweeps 4 to 10 scales to find the knee.
- **Level 3:** How would you add text conditioning? Expected: feed a pooled text embedding through adaptive normalization, as the hybrid variant in the lesson does, and measure the gain on text-aligned samples.

**Wrong answers, and why they fail**

- "It is diffusion with a different name." Diffusion iterates over noise levels on continuous latents; this iterates over resolution on discrete codes and predicts a whole grid per pass.
- "Within a scale the codes still go one by one." The mask is bidirectional inside a scale, so one forward pass produces the whole grid.
- "Raster order only costs speed." It also biases generation: an early code commits before the context that should condition it exists, which capped quality below diffusion at matched compute.

:::

## Query bridge or MLP for the connector

*Level 2 (working) · tradeoff · about 12 minutes*

You are choosing the bridge between a frozen vision encoder and a language model that stays frozen, for a new product. One architect wants a query-based transformer that compresses each image to a fixed set of tokens. Another wants a plain MLP that passes every patch through. How do you decide?

:::answer Show the answer
:::say Short answer
Decide on the token budget, not on quality in the abstract. At a fixed number of visual tokens, the ablation studies find the connector architecture a wash, within about a point between an MLP on mean-pooled patches, a query bridge and a resampler; a full-patch MLP spends more tokens, so it sits at a different budget. The query bridge caps an image at 32 tokens whatever its resolution and costs 188M parameters plus a two-stage pretraining of its own; the MLP emits every patch, 576 for a 336-pixel image, with about 22M parameters and one language-modeling loss. Pick the compressing bridge when context binds, as with long video or many images; pick the MLP when quality per token and simplicity matter and the context is long enough.
:::

**Full answer**

**The two bridges**

| | Query bridge | MLP |
|---|---|---|
| Visual tokens per image | 32, fixed | 576 at 336 pixels, about 2880 with tiling |
| Trainable parameters, language model frozen | 188M | about 22M |
| Pretraining | a representation stage with contrastive, matching and generation losses, then a generative stage | the language-modeling loss throughout |
| Swap the language model | retrain the bridge | retrain a small head |
| Many images and video | awkward, but cheap in tokens | natural concatenation, expensive in tokens |

**What the ablations say**

Several controlled studies reached one result. At a fixed visual-token count, the connector explains about 5 percent of the variance in benchmark scores, the per-image token count about 60 percent, and the encoder about 20. An MLP on pooled patches lands within 1 point of a 32-query bridge at the same budget. So the question is how many tokens you can afford, and which encoder you use.

**Why the field split**

The compressing bridge wins where the token budget binds: long video, many images in one prompt, small contexts. The MLP won the single-image case once contexts grew to 32k and beyond, because every patch stays visible to the language model and the recipe has no stage-one losses to tune. Token budgets from the ablations: 64 per image is too few for reading text, 576 to 1024 is the sweet spot for most tasks, and 2048 and above pays only for documents and charts.

**Hidden costs of the query bridge**

Its queries learn an intermediate representation that the language model must then decode, so information is lost in the bottleneck. Change the language model or the encoder, and you retrain it. An instruction-aware variant feeds the instruction into the queries so that they can specialize per question, which recovers some of the loss.

**A decision rule**

1. Count the tokens per image at your resolution and multiply by the images per prompt.
2. If it fits the context with room for text, use the MLP and spend the effort on the encoder and the data.
3. If it does not, use a compressing bridge, and accept the retraining cost when parts change.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the query bridge need a pretraining stage of its own? Expected: its queries start random and must learn to pull text-relevant content from the patches before the language model can use them; the MLP starts from patches that already carry the image.
- **Level 2:** What do the three stage-one losses do? Expected: contrastive alignment of pooled queries with text, a matching classifier with hard negatives, and image-grounded text generation that forces the queries to encode what text needs.
- **Level 3:** A team picked the MLP and now serves ten-minute videos. What do they hit first? Expected: the context; tokens per frame times frames exceeds any window, so they need heavy frame sampling or a compressing bridge after all.
- **Level 3:** If the connector barely matters, where does the quality come from? Expected: the encoder, the token count, the data mix and the resolution schedule; the recipes lesson's decomposition puts the connector last.

**Wrong answers, and why they fail**

- "The query bridge is more advanced, so it gives better answers." At the same token count the two are within about a point; its advantage is compression, not quality.
- "The MLP is always better because it keeps every patch." Keeping every patch costs tokens; with many images or video the context runs out before quality matters.
- "Pick the bridge first and the encoder later." The encoder and the token count explain most of the variance; the bridge is the last knob to turn.

:::

## What one generated image costs in codes and seconds

*Level 2 (working) · estimate · about 10 minutes*

A unified next-token model generates a 512 by 512 image as a sequence of discrete codes. Estimate how long one image takes at a typical decode speed, compare it with a diffusion model, and say what a four-second video clip at low resolution costs in codes. Then name the levers that change the answer.

:::answer Show the answer
:::say Short answer
The reference model's tokenizer reduces 8 by 8 pixels to one code, so a 512 by 512 image is 4096 codes; at about 30 codes per second that is about 2 minutes per image, against 2 to 5 seconds for a diffusion model of the same quality tier. A 4-second clip at 8 frames per second is 32 frames; with the same 8 times spatial reduction and a 4-frame temporal reduction, a 256 by 256 clip is 32 times 32 times 8, which is 8,192 codes. The levers are the codes per image, the decode speed through speculative decoding or the KV cache, and a different decoding scheme such as masked parallel decoding, which needs about 16 passes instead of one pass per code.
:::

**Full answer**

**The image**

```text
512 / 8 = 64 codes per side
64 x 64 = 4096 codes per image
4096 codes at about 30 per second = about 2 minutes
```

A diffusion model samples a continuous latent in a few dozen steps and finishes in 2 to 5 seconds. Autoregressive image generation is compute-heavy by construction: one pass per code.

**The video**

The video tokenizer is three-dimensional: one code covers 4 frames by 8 by 8 pixels.

```text
frames: 4 s x 8 per second = 32
codes: (256 / 8) x (256 / 8) x (32 / 4) = 32 x 32 x 8 = 8,192
```

**Why the model pays this price**

The same weights do image generation, image understanding and video with one next-token loss, no diffusion schedule and no separate text encoder. The tokenizer's quality is the ceiling: the reference reports a reconstruction of 30.5 dB against about 32 for a continuous latent space, with four times the codes and four times the codebook of the earlier early-fusion model.

**The inference knobs**

- Classifier-free guidance: generate with and without the caption and mix the logits with a weight, typically 3.0 to 7.0; it doubles the forward passes per code.
- Temperature: 0.8 for image generation and 1.0 for understanding in the reference recipe.
- Speculative decoding narrows the gap to diffusion, and so does the KV cache, but neither closes it.

**A different decoding scheme**

Masked parallel decoding keeps discrete codes but predicts all masked positions at once and commits the most confident ones, in about 16 passes for an image, against about 20 for continuous diffusion and one pass per code for plain next-token generation.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does guidance double the cost? Expected: each step needs a conditional and an unconditional forward pass to mix.
- **Level 2:** What happens to the per-image time at 1024 by 1024? Expected: four times the codes at the same reduction, so about four times the decode time; the lesson's exercise asks for that count.
- **Level 3:** Where does the quality ceiling of this model sit, and what moved it up from the first shared-vocabulary model? Expected: in the tokenizer's reconstruction; four times the codes per image and a four times larger codebook lifted it to 30.5 dB.
- **Level 3:** When do you still pick this over a diffusion model? Expected: when one model must understand and generate across image, video and text with one loss, and the latency budget allows minutes per image or a batch pipeline.

**Wrong answers, and why they fail**

- "An image is a few hundred tokens, like a VLM input." Those are projected encoder tokens for understanding; generation needs discrete codes at the tokenizer's density, 4096 for this image size.
- "Diffusion is slower because it iterates." Diffusion takes a few dozen passes over all pixels at once; next-token generation takes one pass per code, thousands per image.
- "A larger codebook makes generation faster." It raises the reconstruction quality; the pass count is set by the number of codes, not by the codebook size.

:::

## Which knob moves a multimodal reasoning score

*Level 2 (working) · concept · about 10 minutes*

Your 7B vision-language model trails a competitor on a multimodal reasoning benchmark by several points. The team's plan is a new connector design. Argue for or against, using what the ablation literature says about where the score comes from.

:::answer Show the answer
:::say Short answer
Against. Across the controlled studies, swapping the connector moved a reasoning benchmark by less than a point at a fixed token count, while swapping the encoder moved it by three or more, and doubling the language model from 7B to 13B added two to four points. The reasoning ceiling of such a model is the text reasoning ceiling of its language model; the visual side can only feed it. Spend the effort on the language model size, the encoder, the token count and the data before the connector.
:::

**Full answer**

**The decomposition**

The one study that held every axis fixed but one found that the per-image visual-token count explained about 60 percent of the variance in scores, the encoder about 20 percent, the connector about 5 percent, and everything else about 15 percent.

**The language model sets the ceiling**

Going from a 7B to a 13B language model reliably added 2 to 4 points on the flagship reasoning benchmark across the papers in the lesson, and at 70B most benchmarks saturate. The reason is structural: the encoder produces features and the connector translates them, but the reasoning happens in the language model. A 7B model cannot stand in for a 70B model through a cleverer connector.

**The encoder is the second lever**

Swapping the common contrastive encoder for a stronger one added 3 or more points on the reasoning benchmark in one study, and self-supervised encoders led a vision-centric benchmark by about 5 to 7 points over the common contrastive one. The 2026 default pairs a strong contrastive encoder with a self-supervised one for dense features when grounding matters.

**The connector is a wash**

At a fixed token count, an MLP, a query bridge and a resampler landed within about 1 point of each other in several independent studies. The connector is a cost question about tokens, not a quality question.

**What to do instead**

1. Check the token count per image; more visual tokens up to the sweet spot helps more than any connector.
2. Check the encoder and the resolution schedule.
3. Check the data: detailed human captions beat distilled synthetic captions at the same token count.
4. If the gap is in reasoning, the honest fix is a larger language model, and the budget question follows.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does a bigger language model help a visual task? Expected: the benchmark asks for reasoning over what the encoder saw, and the reasoning happens in the language model; the visual side sets what it knows, not how well it thinks.
- **Level 2:** When would a connector change still be the right move? Expected: when the token budget binds, because then the connector decides how many tokens you can afford, which is the axis that matters most.
- **Level 3:** Which benchmarks move with the encoder and which do not? Expected: vision-centric benchmarks, counting and grounding, move with a self-supervised encoder, by about 5 to 7 points in one study; the reasoning benchmark also moves, by 3 or more points for a stronger contrastive encoder, so the encoder matters for both kinds.
- **Level 3:** Design the smallest ablation that settles this for your model. Expected: hold the data, the encoder, the token count, the resolution schedule and the training schedule fixed, swap the language model size in one run and the connector in another, and compare both with the baseline on the same eval.

**Wrong answers, and why they fail**

- "The connector is where the modalities meet, so it must matter most." Its measured share is about 5 percent of the variance; the token count and the encoder dominate.
- "A better connector lets a small language model reason like a large one." The reasoning ceiling is the language model's; no bridge adds reasoning the language model does not have.
- "More visual tokens always help." They help up to the sweet spot and then give diminishing returns at a growing compute cost; the gain is in the token count, not in the architecture that emits them.

:::

## A gated VLM fine-tune that forgot how to write

*Level 3 (senior) · debug · about 12 minutes*

You fine-tune a model built like Flamingo, with a gated cross-attention block after every few layers of a frozen language model, on a small captioning dataset. Captions improve, but text-only quality degrades: the model rambles on plain prompts and loses facts it knew. What is the likely cause, how do you confirm it, and how do you fix it?

:::answer Show the answer
:::say Short answer
The gates opened too wide too fast. Each gated layer adds the hyperbolic tangent of a learned scalar times the cross-attention output to the residual stream; at zero the layer is a no-op and the model is the pretrained text model. A high learning rate on the gates, or no regularization, lets visual noise flood the residual stream even when the prompt has no image. Confirm it by reading the gate values per layer against the base and by running a text-only eval with the gates forced to zero; fix it with a lower rate or a schedule on the gates, a text-only data mix, and a check that the layers add nothing when no image is present.
:::

**Full answer**

**The mechanism**

```text
x_after = llm_block(x_before)
cross   = cross_attn(x_after, visual_latents)
x_next  = tanh(alpha) * cross + x_after
```

At initialization alpha is zero, so the model is exactly the frozen language model. As alpha grows, visual information is added on top of the text representation. The residual means that even a fully open gate does not erase the text path, but a large gate adds a large term at every fourth block. If the cross-attention output is noise, that noise reaches the output.

**Why a fine-tune breaks it**

- The gates are the cheapest parameters to move, so a learning rate chosen for the cross-attention weights pushes them fast.
- A caption-only dataset never shows a text-only prompt, so nothing penalizes gates that add visual terms when there is no image to attend to.
- With few images per prompt, the masked cross-attention has little to read, and an open gate still adds its output.

**Confirm**

1. Log the gate value per layer. Compare it with the base checkpoint and with the step at which text quality fell.
2. Run the text-only eval with the gates forced to zero. If the quality returns, the gates are the cause.
3. Send a text-only prompt through the model and measure the norm of the gated term per layer. It should be near zero when no image is present.

**Fix**

- A lower learning rate or a warm-up schedule for the gate scalars, so that they open over the run rather than in the first steps.
- A text-only mix in the fine-tuning data, so that the loss covers the case the product sees.
- A regularizer on the gates, or a cap on their magnitude.
- A mask check: text tokens with no preceding image must attend to nothing, and the gated term must add nothing.
- Fewer gated layers, if the task does not need one every fourth block.

**Why the design is still right**

The gate is what let the original work keep a frozen 70B language model intact while it learned to read images. The failure here is in the schedule, not in the architecture.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What does the residual connection buy once the gate is open? Expected: the text representation is never overwritten, only added to; even a fully open gate leaves the text path intact, which is why the fix is the schedule and not a redesign.
- **Level 3:** How would you spot the same damage in a model that concatenates image tokens instead? Expected: there is no gate to read; the damage shows as a shift in the language model weights, so compare the text-only eval before and after, and freeze the language model or limit it to adapters.
- **Level 4:** Design a unit test that catches this before training. Expected: build the block with alpha at zero and assert that the output equals the block output exactly for a text-only input, then set a large alpha and assert that a text-only input with an empty mask still equals the block output.
- **Level 4:** How do you decide how many gated layers to keep? Expected: ablate the insertion frequency against caption quality and text-only quality on one eval; every fourth block is the reference, and fewer layers mean fewer places for noise to enter.

**Wrong answers, and why they fail**

- "The captioning data is too small; add more images." More caption data with no text-only prompts pushes the gates further the same way; the fix is the gate schedule and the data mix.
- "Unfreeze the language model so that it can adapt to the visual input." That trades a schedule problem for catastrophic forgetting of the text model, which the frozen design exists to prevent.
- "Replace gated cross-attention with the simpler concatenation design." The symptom is a schedule problem; the gate is the mechanism that protects the text model, and the simpler design has no such protection.

:::
