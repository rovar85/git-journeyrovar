---
track: aibank
title: "AI interview bank: Multimodal (part 2 of 2)"
short: Multimodal 2
sub: 9 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## An early-fusion run that diverges at scale

*Level 3 (senior) · debug · about 12 minutes*

You pretrain an early-fusion model on interleaved text and image codes. The small runs are fine, but the large run's loss spikes and diverges after a while, and the attention scores climb from layer to layer. What is happening, and what did the published recipe change to make such a run converge?

:::answer Show the answer
:::say Short answer
Early-fusion training at scale is unstable because image codes and text tokens share one softmax and one residual stream, and their gradients and norms differ; the attention logits grow with depth until the softmax saturates and the loss blows up. The published recipe at 34B parameters diverged at several checkpoints without three changes: normalization of the query and key projections before the dot product, dropout after every residual addition rather than only after attention and the MLP, and pre-normalization on the residual branch plus an extra normalization on the skip connection of the last block. The training recipe is as much of the contribution as the architecture.
:::

**Full answer**

**The signature**

Norm growth. The query and key vectors grow in magnitude through the layers, the attention logits grow with them, the softmax turns into a near one-hot, and the gradients become spiky. Small runs do not reach the depth or the step count where this compounds; the large run does.

**Why early fusion makes it worse**

A shared vocabulary of 65,536 entries holds the text tokens and 8192 image codes, and one image is 1024 codes in a row. Long runs of image codes carry gradients on a different scale from text, and they can dominate an update. The two modalities also occupy different regions of the hidden space, which pushes the norms apart.

**The three changes**

1. QK-Norm. Apply layer normalization to the query and key projections inside attention, before the dot product. It bounds the logit magnitude at every depth, and several large models after this adopted it.
2. Dropout placement. Dropout after every residual addition, not only after attention and after the MLP. More regularization where image-code gradients can dominate.
3. Normalization ordering. Pre-normalization on the residual branch, which is standard, plus an extra normalization on the skip connection of the last block, which stabilizes the gradient flow at the final layer.

**How you would confirm it on your run**

- Log the norm of the queries and keys and the maximum attention logit per layer over training; the divergence should follow growth in the deep layers.
- Log the gradient norm split by the modality of the token; a dominance of image-code gradients points at the second change.
- Restart from a checkpoint before the spike with QK-Norm on, and compare the logit curves.

**The alternative family**

A continuous design that trains a diffusion loss on image patches next to the text loss avoids the shared softmax over image codes, but it has a balance problem of its own: the two losses live on different scales, and the weights between them are a search of their own.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does normalizing the queries and keys bound the logits? Expected: the dot product of two normalized vectors is bounded by their scale, so the logits cannot grow without limit as the residual stream grows.
- **Level 3:** Why not lower the learning rate instead? Expected: a lower rate slows the growth but does not remove the mechanism; the norms still drift with depth, and the run pays in steps for a problem that normalization removes.
- **Level 4:** What did the paper report at 34B without the changes? Expected: repeated divergence at several checkpoints, driven by growth of the attention logits, a norm explosion, which the three changes removed.
- **Level 4:** How does the two-loss continuous design trade this problem for another? Expected: it removes the shared softmax over image codes but introduces two losses of different magnitude, where one head can dominate without careful loss weights and schedules.

**Wrong answers, and why they fail**

- "Early fusion is unstable by nature; use smaller models." The published recipe converged at 34B with the three changes; the instability is a recipe problem.
- "Clip the gradients harder." Clipping bounds the update, not the logit growth that causes the saturation; the norms keep drifting under a clip.
- "Use post-normalization everywhere; it is more stable." The recipe kept pre-normalization on the residual branch and added normalization where the norms grew: the queries, the keys, and the skip of the last block.

:::

## Dense human captions or two million distilled ones

*Level 3 (senior) · tradeoff · about 12 minutes*

You can spend your data budget on one of two things: have a strong proprietary model write captions for two million images, or pay people to describe seven hundred thousand images in detail by speaking for a minute or more about each one. Which do you choose for a new vision-language model, and what is the evidence?

:::answer Show the answer
:::say Short answer
Pay the people. The reference result is a model trained on 712K densely captioned images and no distilled captions that beat a much larger model on 11 of 11 benchmarks. Dense human captions carry 5 to 10 times the information of a short web caption and stay grounded in the image, while distilled captions inherit the hallucinations of the model that wrote them; about 12 percent of crawled pairs already describe things that are not in the image. Caption density beats caption quantity, which beats distillation convenience.
:::

**Full answer**

**The evidence**

- The dense-caption recipe: annotators described each image for one to three minutes in speech, transcribed to text, which gave 712K densely captioned images. The 72B model trained on them beat a 90B competitor on every one of 11 benchmarks. The difference was not architecture.
- Two other datasets followed the same path with mixed human and synthetic captions, and the trend across them is that density wins.
- The first visual instruction set was written by a text-only model from captions and boxes without seeing the image, 158k turns; it worked to unlock dialogue, with noise.

**Why density beats volume**

A dense caption of 80 to 300 tokens names objects, counts, relations, text in the image and context; a web alt text names one thing. For alignment and instruction tuning the model learns from what the caption says about the image, so the information per image is the currency, not the image count.

**Why distillation is risky**

The writing model does not see what it does not see. It hallucinates plausible content, and the student learns to hallucinate with the same confidence. A benchmark built from similar data does not punish it; production users do.

**When distillation still has a place**

- Bootstrapping a new domain fast, before human data arrives.
- Generating questions and answers from a human-written caption, which keeps the grounding in the caption.
- Filtered: score each synthetic caption against the image with a contrastive checker and drop the ungrounded tail.

**What to do with the budget**

Dense human captions for the alignment and instruction stages, task-specific instruction data on top, and synthetic data only where a human caption anchors it. Measure grounding on a held-out human-labelled set, not only benchmark accuracy.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the speech-based collection matter? Expected: people say far more in a minute than they type, so the captions are long and specific at a cost that scales.
- **Level 3:** How do you check that a synthetic caption is grounded? Expected: embed the image and the caption with a contrastive checker and flag low similarity, then read a sample; drop or rewrite the tail.
- **Level 4:** How would you prove to a skeptic that the gain is data and not model size? Expected: the reference comparison beat a larger model; replicate at one size with two data mixes and the same encoder, connector and schedule.
- **Level 4:** Where in the three-stage pipeline do dense captions pay most? Expected: alignment and the first instruction stage, where the projector and the language model learn what an image contains; task-specific data pays in the last stage.

**Wrong answers, and why they fail**

- "Two million captions beat seven hundred thousand; more data wins." The reference result beat a larger model with fewer, denser, grounded captions; volume of thin or hallucinated captions is no substitute.
- "The strong model's captions are better than what annotators write." They are longer than web captions but not grounded; the model describes what it expects, and the student learns the same habit.
- "Caption quality only matters for captioning tasks." The reference model gained on every benchmark, reasoning and reading included, because the alignment stage learned more about each image.

:::

## Monitor a deployed VLM for invented objects

*Level 3 (senior) · design · about 15 minutes*

Your deployed vision-language model answers questions about product photos. Support tickets say that it invents objects and misreads numbers, but the offline benchmark score is fine. Design the production monitoring and the response plan.

:::answer Show the answer
:::say Short answer
Treat hallucination as a production metric, not as a model property. Score every answer with a cross-modal error rate: embed the image and the generated text with an independent contrastive checker, and flag outputs where the text confidence is high but the image-text similarity is low. Track that rate per endpoint, per prompt type and per customer, alert on a rise, and route the flagged answers to human review instead of to the user. The team that introduced the metric cut its hallucination rate by about 35 percent this way, without a model change.
:::

**Full answer**

**Why the benchmark does not see it**

About 12 percent of the image and text pairs in crawled training data describe things that are not fully in the image. A model trained on them learns to say plausible things the image does not support, and benchmarks built from the same kind of data reward plausibility. In production the inputs are your photos, your questions and your numbers, and this failure is the dominant one.

**The metric**

```python
def cross_modal_error_rate(image_emb, text_emb, text_confidence, sim_threshold=0.25, conf_threshold=0.8):
    image_emb = F.normalize(image_emb, dim=-1)
    text_emb = F.normalize(text_emb, dim=-1)
    sim = (image_emb * text_emb).sum(dim=-1)
    high_conf_low_sim = (text_confidence > conf_threshold) & (sim < sim_threshold)
    return high_conf_low_sim.float().mean().item()
```

The text confidence is the mean per-token probability of the answer. The checker is a contrastive image-text model that is independent of the generator. The two thresholds come from your own data: calibrate them on a labelled sample of grounded and hallucinated answers.

**The dashboard**

- The rate per endpoint, per prompt type and per customer, over time.
- The rate split by image source and resolution, because a new camera or a new upload path shifts it.
- A sample of flagged answers for a weekly read, with the label a reviewer gave.
- An alert on a rise above a baseline window.

**The response plan**

1. Route. A flagged answer goes to a review queue, or returns a hedged response that shows the image region, not a confident wrong number. An answer whose numbers fail the text-recognition check also goes to the review queue, even when the whole-image rate does not flag it.
2. Read. The weekly sample tells you which prompt types fail: numbers, counts, small text.
3. Fix at the data level. Add grounded examples for the failing prompt types, and tiling or a higher resolution for small text and numbers.
4. Re-measure with the same metric before and after each change.

**Limits of the metric**

A contrastive checker scores whole-image similarity, so it misses a wrong digit in an otherwise matching description. Pair it with task checks: parse the numbers in the answer and compare them with a text-recognition pass, or ask the model for the region it read and check that the region is not empty.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why an independent checker and not the model's own confidence? Expected: the model is confident when it hallucinates, which is the failure; the checker gives a second opinion that does not share the generator's blind spots.
- **Level 3:** How do you set the two thresholds? Expected: label a few hundred answers as grounded or not, sweep the thresholds, and pick the pair that catches most hallucinations at a review load the team can afford.
- **Level 4:** The rate rises for one customer only. What do you check? Expected: their image source: resolution, lighting, a new product line with text the model misreads; the per-customer split exists for that reason.
- **Level 4:** How do you decide between a model change and a routing change? Expected: routing is cheap and immediate and protects users today; a model change needs grounded data and a re-measurement; do both in that order and let the metric arbitrate.

**Wrong answers, and why they fail**

- "Raise the benchmark score and the hallucinations will go away." The benchmark rewards plausible text; the production failure is confident text the image does not support, which the benchmark does not measure.
- "Add a system prompt that says do not hallucinate." The model does not know when it hallucinates; a prompt does not create grounding, and only a measurement and a review route reduce the harm.
- "Block every answer with a low image-text similarity." Low similarity with low confidence is often a right answer about a hard image; the signal is high confidence with low similarity.

:::

## Three runs to close a VLM benchmark gap

*Level 3 (senior) · tradeoff · about 15 minutes*

You lead a small team training an open vision-language model. The first run lands well below the open-weight models of its size on a general benchmark and on a document-reading benchmark. You can afford three more full runs. Which three changes do you make, in what order, and what do you expect each to move?

:::answer Show the answer
:::say Short answer
Order the runs by the variance each axis explains. First, the resolution schedule and the token count: ramp from a low resolution to a high one and add image splitting for the document benchmark, where moving from 448 to 980 pixels added 3 to 5 points in the ablations. Second, the encoder: swap the common contrastive encoder for the stronger one, which added 3 or more points on the general benchmark, and concatenate a self-supervised encoder if grounding matters. Third, the data: replace distilled synthetic captions with dense human-written ones, which beat the distilled set on every benchmark in the reference comparison; leave the connector alone, because at a fixed token count it moves scores by about a point.
:::

**Full answer**

**The evidence behind the order**

| Axis | What the ablations found | Expected move |
|---|---|---|
| Visual tokens and resolution | about 60 percent of the variance; 384 to 448 adds 1 to 2 points; 448 to 980 with splitting adds 3 to 5 on reading tasks | the document benchmark |
| Encoder | about 20 percent; a stronger contrastive encoder adds 3 or more; self-supervised features lead vision-centric tests by 5 to 7 | the general benchmark, counting and grounding |
| Data | dense human captions beat distillation on 11 of 11 benchmarks in the reference comparison | both benchmarks, grounded detail most |
| Connector | about 5 percent; within 1 point at a fixed token count | nothing worth a run |
| Language model | 7B to 13B adds 2 to 4 points | both, if the budget allows a larger model |

**Run 1: resolution and tokens**

Flat low-resolution training plateaus at medium accuracy. Ramp from 224 to 448 or native, then add splitting for reading tasks up to about 1280 pixels on the long side. The token count explains the most variance, and documents need pixels.

**Run 2: encoder**

Swap to the stronger contrastive encoder at native resolution. If the benchmark includes counting or spatial questions, concatenate a self-supervised encoder's features, as the vision-centric recipes do. Retrain the projector; the language model keeps its adapters.

**Run 3: data**

Replace distilled captions with dense human captions where you can get them, and top up with task-specific instruction data for the document questions. The reference result: a model trained on 712K densely captioned images with no distilled data beat a much larger competitor on every benchmark listed. Caption density beats caption quantity, which beats distillation convenience.

**What you do not run**

A connector ablation. Several controlled studies put it within a point at a fixed token count; the token count is the knob, and run 1 already turned it.

**How to keep the runs comparable**

One axis per run, the same eval, the same seed where the framework allows it, and a record of the data mix and the resolution schedule for each. A run that changed two things cannot be credited to either.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the document benchmark respond to resolution and the general one less? Expected: reading needs pixels per character; general questions need semantics that the encoder already carries at a low resolution.
- **Level 3:** What does a resolution ramp buy over a flat high resolution? Expected: faster alignment early and a higher end point; the ablations show that flat schedules plateau at medium accuracy.
- **Level 4:** You cannot get human captions in time. What is the next best data move? Expected: filter the distilled captions for grounding against the image with a contrastive checker and drop the ungrounded tail; density matters, but ungrounded density teaches hallucination.
- **Level 4:** If a fourth run appears, is it the connector or the language model? Expected: the language model, if memory allows a larger one; it lifts reasoning by points, where the connector moves a fraction of one.

**Wrong answers, and why they fail**

- "Start with the connector; it is the cheapest to retrain." Cheap and useless: at a fixed token count it moves scores by about a point in every controlled study.
- "Generate more captions with a stronger proprietary model." Distilled captions inherit hallucinations; the reference comparison shows dense human captions beating distillation across the board.
- "Train longer at the same settings." The ablations put the gap in resolution, encoder and data, not in steps; more steps at a flat low resolution plateau.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Three ways to generate an image from one transformer

*Level 3 (senior) · tradeoff · about 12 minutes*

Your team needs one open model for answering questions about images, text-to-image generation and inpainting, with a usable generation latency. One candidate generates images one code at a time; another denoises continuous patches; a third stays with discrete codes and fills them in parallel over a few passes. Compare the three on passes, training complexity and what comes for free.

:::answer Show the answer
:::say Short answer
Next-token generation over codes needs one pass per code, 1024 to 4096 passes per image, with one simple loss. Continuous diffusion in a shared transformer needs about 20 passes, but it trains two losses on different scales. Masked discrete decoding keeps codes and one cross-entropy loss, predicts all masked positions at once and commits the most confident ones each pass, so an image takes about 16 passes; inpainting is free, because the training objective is to fill masked codes from the rest. For a product that wants all three tasks in one open model at a usable latency, the masked discrete design is the fit, and the continuous design is the pick when fidelity is paramount.
:::

**Full answer**

**How masked discrete decoding works**

Training samples a masking ratio uniformly, masks that share of an image's codes, and trains the transformer to recover them. That generalizes next-token prediction: for text only the last position is masked, for an image a random subset is. At inference, start from a fully masked grid, predict every masked position in parallel, keep the most confident predictions, re-mask the rest, and repeat on a schedule. A cosine schedule, the mask ratio as the cosine of pi times the step over twice the total steps, concentrates the work at mid-range ratios where predictions are most informative.

**The attention mask**

Text tokens are causal. Image codes attend to every other code of the same image, so a masked position can see all of its neighbors. Text attends to prior images, and image codes attend to prior text.

**The comparison**

| Design | Passes per image | Losses | Free extras |
|---|---|---|---|
| Next-token over codes | one per code, 1024 to 4096 | one cross-entropy | video with a 3D tokenizer; one stack for everything |
| Continuous diffusion in the transformer | about 20 | cross-entropy plus a diffusion loss on patches | the highest fidelity, no quantizer |
| Masked discrete decoding | about 16 | one cross-entropy on masked positions | inpainting; one checkpoint for answering, writing and generating |

Per pass, the masked design is cheaper than continuous diffusion, because it emits discrete logits rather than a continuous regression at every patch.

**What the masked design pays**

It keeps the tokenizer ceiling of every discrete design: the image can be no better than the quantizer's reconstruction. Unmasking everything in one pass fails, because the codes are predicted independently and the result is incoherent; the schedule exists so that committed codes condition the rest.

**Inpainting for free**

Mask the codes of a region, feed the rest plus a text prompt, and predict the masked ones. No new objective and no new head: the training task was exactly this.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why can the model not unmask everything in one pass? Expected: each masked position is predicted from a marginal that ignores the others, so the sampled codes do not agree; committing the confident ones first gives the rest conditioning.
- **Level 3:** Why does a cosine schedule beat a linear one? Expected: it spends more steps at the mid-range ratios where each prediction is most informative, while a linear schedule plateaus earlier.
- **Level 4:** Where does the per-step cost differ between masked discrete and continuous diffusion? Expected: both are full transformer passes, but the discrete head emits logits over the codebook while the continuous head regresses a velocity for every patch; the discrete pass is cheaper per step.
- **Level 4:** What would make you give up the one-model simplicity for a specialist? Expected: a fidelity requirement above the tokenizer ceiling, or a latency budget that even sixteen full passes cannot meet, where a dedicated continuous generator wins.

**Wrong answers, and why they fail**

- "Masked decoding is diffusion, so it needs a noise schedule." It is discrete: positions are masked, not noised, and the schedule sets how many codes to commit per pass.
- "Next-token generation is the fastest because each pass is small." Each pass is a full transformer pass over the sequence, and there are thousands of them per image.
- "Inpainting needs a separate model." The masked objective is inpainting; masking a region at inference is the task the model trained on.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Why the tokenizer caps a generated image

*Level 3 (senior) · concept · about 12 minutes*

In the unified-generation family, the quality of a generated image is said to be capped by the tokenizer, not by the transformer. Explain why, show what moved the cap between two generations of models, and say which design avoids the cap entirely and at what cost.

:::answer Show the answer
:::say Short answer
A discrete image tokenizer is lossy: the decoder can only render what the codes carry, so the best image the model can ever produce is the tokenizer's own reconstruction of a real image. The first shared-vocabulary model used 1024 codes per 512 by 512 image from a codebook of 8192 and reconstructed at about 26 to 28 dB; the next generation used four times the codes, 4096, and a codebook four times larger, 32768, and reached 30.5 dB, close to the 32 dB of continuous latent diffusion. The design that avoids the cap keeps image patches continuous and trains a diffusion loss on them next to the text loss in one transformer; it drops the quantizer and gains fidelity, and pays with two losses on different scales to balance and a sampling loop at generation time.
:::

**Full answer**

**Why the cap exists**

The transformer predicts codes. The decoder turns codes into pixels with no other input. Whatever detail the quantizer threw away at encoding time cannot come back: a perfect transformer that predicts the exact codes of a real image renders the tokenizer's reconstruction of that image, nothing better. The reconstruction quality is therefore an upper bound on fidelity to a real image, which is what the dB figures below measure. Distribution metrics measure a different property and do not share this bound.

**What moved the cap**

| Model generation | Codes per 512 by 512 image | Codebook | Reconstruction |
|---|---|---|---|
| the first shared-vocabulary model | 1024 | 8192 | about 26 to 28 dB |
| the next-token generation model | 4096 | 32768 | 30.5 dB |
| continuous latent diffusion, for reference | continuous | none | about 32 dB |

Four times the codes carry four times the spatial detail, and a codebook four times larger carries finer values per code. The newer model's main contribution is a better tokenizer, and with it next-token prediction matched a diffusion model on an image generation benchmark.

**The cost of more codes**

Each code is one decode pass in plain next-token generation, so four times the codes is four times the generation time. Masked parallel decoding keeps discrete codes and predicts all masked positions at once in about 16 passes, which pays back the cost of the larger grid.

**The design without a cap**

Keep the image continuous. Project patches with a linear layer, as a vision transformer does at its input, and train one transformer with two losses: cross-entropy on text tokens and a flow-matching loss on noisy image patches. There is no quantizer to bound the detail. The paper reports a better image score than a same-size discrete model by 3 to 5 points. The price: two losses of different magnitude whose weights need tuning, a block-triangular attention mask, and a denoising loop of a few dozen steps per image at generation time.

**Which to pick**

Discrete codes when one next-token stack must handle understanding and the generation of images and video with one loss, and you accept the tokenizer's ceiling. Continuous patches when image fidelity is the priority and the two-loss plumbing is acceptable.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the reconstruction score of the tokenizer the right number to read before you train the transformer? Expected: it is the ceiling; no amount of transformer scale lifts a generated image above what the decoder can render from the codes.
- **Level 3:** What else besides the codebook and the code count lifts a tokenizer? Expected: the quantizer design; the newer models use an inverse-bottleneck quantizer family that uses the larger codebook well, where a naive larger codebook leaves codes unused.
- **Level 4:** How does the attention mask differ in the continuous design? Expected: causal over text tokens, bidirectional among the patches of one image, text attends to images that closed before it, and image patches attend to the preceding text; a block-triangular mask.
- **Level 4:** Which side of this trade-off does the masked discrete design sit on? Expected: discrete, with the tokenizer ceiling, but with parallel decoding in a few passes; it trades the fidelity of continuous diffusion for simpler training and fast sampling.

**Wrong answers, and why they fail**

- "Scale the transformer and the images get sharper." The transformer predicts codes; sharpness beyond the tokenizer's reconstruction does not exist in the codes to predict.
- "A bigger codebook is enough." The code count sets the spatial detail and the codebook sets the value detail; the newer tokenizer raised both, and the quantizer design decides whether a large codebook is used.
- "Continuous patches are strictly better, so discrete codes are obsolete." Continuous patches cost two losses to balance and a denoising loop per image; the discrete family keeps one loss and one decoder for every modality, which is why both survive.

:::

## Design a VLM for an on-device UI agent

*Level 4 (staff) · design · about 20 minutes*

Design a vision-language model for an on-device mobile assistant that reads the phone screen and taps, types and scrolls. Keep the language model at about 2B parameters. Choose the encoder, the bridge, the resolution plan and the data mix, justify each choice with the ablation evidence, and name the capability you would guard against over-promising.

:::answer Show the answer
:::say Short answer
Encoder: the stronger contrastive encoder at native resolution, with a self-supervised encoder's features concatenated for a dense spatial signal, because the encoder explains about 20 percent of the variance and self-supervised features lead vision-centric tests. Bridge: a two-layer MLP, since the connector explains about 5 percent, with features from several encoder depths stacked so that fine position reaches the language model. Resolution: a ramp from low to high, with dynamic resolution up to about 1280 pixels on the long side, because screens are text-dense and reading gains most from pixels. Data: dense human descriptions of screens plus grounded action traces, not distilled captions; and guard the promise on spatial relations, where general models score 50 to 60 percent and the agent must hit the right element every time.
:::

**Full answer**

**Constraints first**

A 2B language model sets a low reasoning ceiling: a larger language model adds points on reasoning benchmarks, and this design cannot grow it. So every other axis must carry more, and the task must be framed as perception plus short actions, not long reasoning.

**Encoder**

| Choice | Why |
|---|---|
| The strong contrastive encoder at native resolution | adds 3 or more points over the common one in the ablations; native resolution keeps screen text legible |
| Concatenated self-supervised features | lead vision-centric benchmarks by 5 to 7 points over the contrastive one; UI grounding is vision-centric |
| Features from several encoder depths | deep layers carry semantics and shallow layers carry fine position; stacking both tightens grounding, which an agent that taps needs |

**Bridge**

A two-layer MLP. The connector explains about 5 percent of the variance at a fixed token count, and the MLP is the simplest to retrain when the encoder or the language model changes. The token count is the knob that matters: screens are documents, so budget toward the upper end of the 576 to 1024 sweet spot, and above it for dense screens.

**Resolution schedule**

Start low and ramp. Flat low-resolution training plateaus; a ramp trains faster and ends higher. Dynamic resolution with a minimum of 256 and a maximum near 1280 pixels on the long side handles the range of screen densities, and the document-reading gains of 3 to 5 points from splitting apply to screens.

**Data mix**

- Dense human descriptions of screens: what is on the screen, where, and what is interactive. Dense human captions beat distillation across the board in the reference comparison.
- Grounded action traces: screenshot, instruction, the element and the action, with coordinates. The visual-agent benchmark that frontier models lead has this shape.
- Task-specific instruction data for the app families you ship to.
- Synthetic data only where a human description anchors it, filtered for grounding.

**The capability to guard**

Spatial relations. General models score 50 to 60 percent on above, below, left, right and counting, and an agent that taps the wrong element fails the task. Build the eval from real screens with the exact element-selection questions, measure it before any promise, and keep a verification step in the agent loop: read the screen back after the action and check the state.

**Serving on the device**

A 2B language model and a strong encoder at a high resolution still need the visual token budget counted per screen; measure the latency per step at your resolution before you set the schedule.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why stack shallow and deep encoder layers for an agent and not for a captioner? Expected: a captioner needs semantics; an agent needs where exactly, which the shallow layers carry and the last layer blurs.
- **Level 4:** The language model is fixed at 2B. Which axis do you lean on hardest, and what is its limit? Expected: resolution and token count, because screens are text-dense; the limit is the latency per step on the device, which the token count sets.
- **Level 4:** How do you make the agent robust to being wrong about an element? Expected: a read-back after each action that compares the new screen with the expected state, and a stop when they do not match; the model's own confidence is not a safe signal.
- **Level 4:** What does the ablation evidence not tell you about this design? Expected: it comes from general benchmarks on datacenter GPUs; the device latency, the UI domain and the action format need your own ablation, one axis per run.

**Wrong answers, and why they fail**

- "Use a query-based bridge to save tokens on the device." It caps the tokens at a count too low for dense screen text, and the ablations put 64 tokens as too few for reading; spend tokens here and save elsewhere.
- "Generate the screen descriptions with a strong proprietary model." Distilled descriptions inherit hallucinations, and an agent that taps a hallucinated element fails; dense human descriptions won the reference comparison.
- "A 2B model with a great encoder matches a 70B agent." The language model sets the reasoning ceiling; frame the task as perception plus short actions and verify each step, instead of promising long reasoning.

:::

## One open model to answer, edit and generate

*Level 4 (staff) · design · about 15 minutes*

A design tool wants to ship, with open weights it can host, one model that answers questions about a user's image, edits a region of it on request, and generates a new image from text. The latency per image must stay in seconds, not minutes. Lay out the families you would consider, pick one, and state the test that would make you change the pick.

:::answer Show the answer
:::say Short answer
Three open families cover understanding and generation in one model: next-token prediction over discrete codes, which does everything with one loss but spends one pass per code and minutes per image; continuous patches with a diffusion loss next to the text loss, which gives the best fidelity in about 20 passes but trains two losses; and masked discrete decoding, which keeps one loss, fills an image in about 16 passes, and gets region editing free from its masking objective. For a tool that needs editing and a seconds-level latency with open weights, start with the masked discrete family. Change the pick if a fidelity eval on your own prompts shows the quantizer ceiling hurting, or if the latency budget cannot afford sixteen full passes; the continuous two-loss family then takes over, with editing done through conditioned denoising of the region.
:::

**Full answer**

**The requirements, mapped**

| Requirement | Next-token over codes | Continuous two-loss | Masked discrete |
|---|---|---|---|
| Visual question answering | yes | yes | yes |
| Region edit | possible, slow: regenerate codes | possible through conditioned denoising | native: mask the region's codes |
| Text to image | yes, minutes per image | yes, about 20 passes | yes, about 16 passes |
| Training | one loss | two losses to balance | one cross-entropy on masked positions |
| Fidelity ceiling | the quantizer, at 30.5 dB in the best reference | no quantizer, about 32 dB and above | the quantizer |
| Open weights to host | yes | yes | yes |

**Why masked discrete first**

Editing is the feature that distinguishes the product, and the masked objective is editing: mask a region, keep the rest, add the prompt, predict. A latency in the low tens of passes fits a seconds budget. One loss means one training recipe to operate. The reference open model ships text generation, question answering, text-to-image and inpainting from one checkpoint.

**Why not the other two first**

Next-token over codes spends thousands of passes per image; the reference puts a 512 by 512 image at about 2 minutes at a typical decode rate, and a region edit means regenerating codes in sequence. The continuous design has the best fidelity and no quantizer ceiling, but two losses on different scales need a weight search, and editing needs a conditioned denoising sampler that you build yourself.

**The eval that decides**

1. Fidelity: your own prompt set, judged against the continuous reference at matched passes; if the quantizer ceiling shows, as lost fine texture or unreadable text in images, the pick changes.
2. Edit quality: masked region edits judged for seam quality and prompt adherence.
3. Latency at your resolution and pass count on your hardware; sixteen full passes of a large transformer can still exceed a budget.
4. Understanding: the question-answering eval you already run, because the unified model must not fall behind the adapter model it replaces.

**Operational notes**

Keep the tokenizer fixed and version it with the model; a tokenizer change invalidates every stored code. Log the mask schedule and the pass count as deployment parameters, because they trade latency for quality at serve time without retraining.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Which of the three tasks does the masked objective give for free, and why? Expected: region editing; training predicts masked codes from the rest, which is what an edit asks for.
- **Level 4:** How do you do a region edit in the continuous design? Expected: keep the patches outside the region fixed across the denoising steps and denoise only the region, conditioned on the text and the context; it works, but it is a sampler you write, not a training objective.
- **Level 4:** Why does the pass count become a serving parameter in the masked design? Expected: more passes commit fewer codes each and raise quality, fewer passes cut latency; the schedule is set at inference, so the product can trade them per request.
- **Level 4:** What single measurement tells you that the quantizer is the bottleneck? Expected: the tokenizer's reconstruction of your real images; if the reconstruction already loses the detail your users care about, no generator on those codes can recover it.

**Wrong answers, and why they fail**

- "Ship the next-token model; one loss, one stack, no compromise." Minutes per image at the reference decode rate breaks the latency requirement, and a region edit regenerates codes in sequence.
- "Fidelity decides, so take the continuous design." Fidelity is one requirement; editing and operational simplicity favor the masked design until an eval shows the ceiling hurting.
- "Pick the model with the best benchmark score." The product needs three tasks, an edit path and a latency budget; a benchmark covers one of those at best.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::

## Two losses, one transformer, one gradient step

*Level 4 (staff) · concept · about 15 minutes*

Explain how a single transformer can train the text objective of next-token prediction together with a denoising loss on images in one gradient step. Cover the input representation, the attention mask, how the loss is routed per position, and the balance problem that follows. Then say what a sibling architecture changed.

:::answer Show the answer
:::say Short answer
Text enters as discrete tokens through the embedding table; images enter as continuous 16 by 16 pixel patches through a linear projection, bracketed by image start and end tags. One forward pass runs over the mixed sequence, and the loss is picked per position: cross-entropy on the vocabulary head for text positions, and a flow-matching regression for image patches, which predicts the velocity from a noised patch toward the clean one at a sampled time. The mask is block-triangular, causal over text and bidirectional among the patches of one image, with text attending to images that closed before it and patches attending to the preceding text. Both losses backpropagate through the same weights, so their relative magnitude must be balanced by hand; the sibling architecture keeps the joint attention but gives text and image their own weights in every block.
:::

**Full answer**

**The input**

Two kinds of positions in one sequence. A text position holds a token id and goes through the embedding table. An image position holds a real-valued patch vector, projected into the hidden size by a linear layer, the way a vision transformer embeds its input. Tags mark where an image starts and ends.

**The mask**

```text
M[i, j] = 1 if
  i and j are text and j <= i                        causal text
  or i and j are patches of the same image           bidirectional inside an image
  or i is text, j is a patch, and that image closed before i
  or i is a patch, j is text, and j precedes the image start
```

Teacher forcing on text requires the causal part. An image is one snapshot, so its patches may all see each other.

**The loss per position**

- Text: the cross-entropy of the vocabulary head against the next token.
- Image: sample a time t, interpolate between the clean patch and noise with weight t, feed the noisy patch, and regress the velocity, the noise minus the clean patch, with a mean squared error.

Both terms add into one loss and one backward pass; the shared body receives both gradients.

**Generation**

Text decodes token by token. When the model emits the image start tag, generation switches to a denoising loop over the image patches, conditioned on the text so far, for a few dozen steps, then returns to text.

**The balancing problem**

The two losses live on different scales. The lesson's exercise poses a mix of 70 percent text and 30 percent image positions where the image loss is about ten times the text loss in magnitude; without weights, one head dominates the shared gradient. The weights, and any mismatch in schedules between the two objectives, are a search of their own, which is the price of avoiding a quantizer. The reward is image quality above a discrete model of the same size, by 3 to 5 points on the standard image score in the paper.

**The sibling**

The multimodal diffusion transformer behind a well-known image generator keeps the joint attention across modalities but gives text and image their own query, key, value and MLP weights in every block, trains with rectified flow, and ships in 2B and 8B parameter variants. Separate weights remove some of the balancing pressure at the cost of more parameters.

**Where it sits**

Discrete-code designs trade this plumbing for one loss and a tokenizer ceiling; the masked discrete design keeps one loss and parallel decoding. This design is the pick when fidelity is paramount and the two-loss recipe is acceptable.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why may image patches attend bidirectionally when text may not? Expected: text is generated left to right under teacher forcing, so a token must not see its target; an image is produced as one snapshot, and its patches have no order.
- **Level 4:** How would you set the loss weights? Expected: measure the magnitude and the gradient norm of each loss on a held-out batch, scale them to comparable contributions, and tune from there against a text eval and an image eval together, because one can improve while the other regresses.
- **Level 4:** What does the sampled time t do in the training loss? Expected: it picks how much noise the patch carries, so the model learns the whole path from noise to clean; at generation each step moves along that path.
- **Level 4:** What does the sibling's per-modality weight set cost and buy? Expected: more parameters per block; it buys separate capacity for two very different input statistics and eases the balance, while the joint attention still lets the modalities condition each other.

**Wrong answers, and why they fail**

- "One transformer can only have one loss." The loss is a function of the outputs per position; routing a different loss to different positions is one summed objective with one backward pass.
- "Use a causal mask everywhere for simplicity." Causal attention inside an image hides part of each image from its own patches and hurts generation; the mask must be bidirectional inside an image block.
- "The two losses balance themselves because they share the weights." Shared weights are the problem: the larger loss dominates the shared gradient until you weight them.

**Related lesson in this course:** [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9)

:::
