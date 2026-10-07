---
track: lectures
title: "Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next"
short: L9 Trends and recap
sub: A one-page map of the whole course, then how the Transformer was reused for images (ViT) and vision-language models, how diffusion works and how masked diffusion LLMs generate text, ideas crossing between fields, data and model collapse, small models, hardware, and how to keep learning.
---

:::goals
- put the **whole course on one page**: how the pieces from tokenisation to agents fit together
- explain **Vision Transformers (ViT)** (patches as tokens, a CLS vector) and the two ways **vision-language models** take images
- explain **diffusion**, why text needs **masking instead of noise**, and how **masked diffusion LLMs** decode in **far fewer passes**
- see **model collapse** when models train on their own output, and understand why **data curation** matters
- name the open problems and a **plan for staying current**
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 9**, explained in my own words with **original, runnable Python** (standard library only). The diffusion demo uses a **simulated denoiser** (no trained network) to show the **decoding schedule**; model-collapse is shown on a **toy categorical distribution**. Statements about specific products or papers (Gemini diffusion, Inception, LLaDA, DeepSeek-OCR, Muon, Kimi K2) are the lecturer's, from late 2025, and may be outdated.
:::

## 1. The whole course on one page

| Lecture | Question | Answer in one line |
|---|---|---|
| 1 | How do we feed text to a model? | **Tokenise (BPE)**, **embed**, then **self-attention** (`softmax(QKᵀ/√d)V`) inside the **Transformer** |
| 2 | What changed since 2017? | **RoPE** relative positions, **RMSNorm** and **pre-norm**, **GQA**, sliding windows; **BERT / T5 / GPT** families |
| 3 | What is an LLM and how does it talk? | **Decoder-only, text-to-text**; **MoE**; **sampling** with temperature; **prompting** (CoT, self-consistency); **KV cache, paging, speculative decoding** |
| 4 | How is it trained? | **Pre-training** (next token, trillions of tokens), **scaling laws**, **parallelism and ZeRO**, **FlashAttention**, **mixed precision/quantisation**, **SFT**, **LoRA** |
| 5 | How is it aligned? | **Preference pairs → reward model (Bradley-Terry) → PPO**, or **DPO**; guard against **reward hacking** with KL |
| 6 | How does it reason? | **Thinking chains** trained with **RL on verifiable rewards (GRPO)**; **pass@k**; **distillation** |
| 7 | How does it use the world? | **RAG** (two-stage retrieval), **tool calling**, **agents (ReAct)**, **MCP** |
| 8 | How do we know it is good? | **Kappa**, **LLM-as-a-judge** (with bias mitigations), **factuality by atomic facts**, **pass^k**, **benchmarks and Pareto frontiers** |
| 9 | What else, and what next? | Vision, diffusion text models, data, small models, hardware, open problems |

One thread to remember: **the training pipeline** is *pre-train → SFT → preference tuning → (RL for reasoning)*, and **the application layer** is *prompt → (retrieve) → (call tools) → (loop as an agent) → evaluate*.

## 2. The Transformer beyond text: Vision Transformers

Self-attention works on **any set of vectors**, not only word vectors. For image classification (**ViT**, 2020):

1. **Split the image into fixed-size patches** (for example 16×16 pixels).
2. **Flatten each patch** (a patch has pixels with three colour values each) and project it with a **learned linear layer** to a vector: a "token".
3. **Prepend a learned `[CLS]` vector** and **add position embeddings** (so the model knows where each patch is).
4. Run the **Transformer encoder** (the BERT-style stack; every patch attends to every other).
5. Take the **encoded `[CLS]` vector** (it has interacted with all patches) and project it through a small network onto the **classes** (here "teddy bear").

The surprising result: trained on **enough data**, this beats **convolutional networks**, even though convolutions have a built-in **inductive bias** (look at neighbouring pixels in a sliding way) and the ViT has **very little**: it learns what matters from data.

```run
mkdir -p ~/l9 && cd ~/l9
cat > vit.py <<'PY'
import random
random.seed(2)

H = W = 224; P = 16; C = 3; D_MODEL = 768
patches = (H // P) * (W // P)
tokens = patches + 1                                      # plus the CLS token
patch_values = P * P * C
proj_params = patch_values * D_MODEL
print(f"{H}x{W} image, {P}x{P} patches -> {patches} patch tokens (+1 CLS = {tokens})")
print(f"each patch has {patch_values} numbers, projected to {D_MODEL}: {proj_params:,} parameters in the patch embedding")
print(f"attention score table is {tokens} x {tokens} = {tokens * tokens:,} entries per head (a text prompt of the same length would cost the same)")

# a tiny 6x6 "image" split into 3x3 patches: show exactly how pixels become tokens
img = [[random.randint(0, 9) for _ in range(6)] for _ in range(6)]
print("\n6x6 image:")
for r in img: print("  ", " ".join(map(str, r)))
tokens_demo = []
for pr in range(0, 6, 3):
    for pc in range(0, 6, 3):
        tokens_demo.append([img[r][c] for r in range(pr, pr + 3) for c in range(pc, pc + 3)])
print("\n4 patch tokens (each flattened, row by row):")
for i, t in enumerate(tokens_demo): print(f"  patch {i}: {t}")
PY
python3 vit.py
```

### Vision-language models (VLMs)

To answer questions **about** an image, the model needs both image and text:

- **Common method:** an **image encoder** turns the image into **tokens** that are **concatenated with the text tokens** and fed to a **decoder-only LLM**, which answers **auto-regressively**, with markers telling it which tokens are image tokens (the open **LLaVA** works this way).
- **Less common:** feed the image through **cross-attention** layers (queries from text, keys and values from the image), as in the Llama 3 paper.

The same building blocks serve **image generation** (diffusion transformers), recommendation and speech.

## 3. Diffusion, and why text needs masks

**Auto-regressive (AR) models** generate **one token at a time**, each needing the previous ones, so **generation cannot be parallelised** (training can: teacher forcing with a causal mask). To break the one-token-per-pass limit, researchers looked at **diffusion**, which dominates **image generation**.

**Diffusion for images:** start from **noise** (Gaussian noise is easy to sample, mathematically well-behaved and a source of randomness) and **learn to remove noise step by step** until an image appears. Training builds pairs: take a **clean image, add noise gradually**, and train the model to **predict the noise to remove**. Michelangelo's quote fits: the statue is already in the marble; you chisel away what is superfluous.

**The text problem:** tokens are **discrete**, so "adding a little noise" does not exist. The research answer: **the mask token is to text what noise is to images.**

- **Forward process:** progressively **replace tokens with `[MASK]`** until the whole sequence is masks.
- **Reverse process (generation):** start from a prompt followed by **all masks** and let the model **predict the original tokens at the masked positions**, over a **fixed number of steps** that you choose; each step **unmasks several positions at once** (typically the most confident ones), refining from a rough draft to a final text (like drafting an outline of a speech and then filling in each section).

Models of this kind are called **masked diffusion models (MDM)** or **diffusion LLMs (dLLMs)**; LLaDA is the paper cited for the maths.

Run a **simulated denoiser** to see the decoding schedule. At each step the stand-in "model" proposes a token and a confidence for every still-masked position; we keep the most confident few:

```run
cd ~/l9
cat > mdm.py <<'PY'
import random

target = "a cute teddy bear is reading a long bedtime story to a sleepy child tonight".split()
L = len(target)

def denoiser(seq):
    revealed = sum(1 for x in seq if x != "[MASK]") / L
    out = {}
    for i, t in enumerate(seq):
        if t == "[MASK]":
            conf = min(0.99, 0.35 + 0.5 * revealed + random.random() * 0.15)
            out[i] = (target[i] if random.random() < conf else "<wrong>", conf)
    return out

def decode(steps, verbose=False):
    seq = ["[MASK]"] * L
    per_step = -(-L // steps)
    for s in range(steps):
        masked = [i for i, t in enumerate(seq) if t == "[MASK]"]
        if not masked: break
        preds = denoiser(seq)
        for i in sorted(masked, key=lambda i: -preds[i][1])[:per_step]:
            seq[i] = preds[i][0]
        if verbose: print(f"  pass {s + 1}: {' '.join(seq)}")
    return seq

random.seed(12)
print(f"{L}-token answer; an auto-regressive model needs {L} sequential passes.\n")
print("masked diffusion, 4 passes (each unmasks the most confident positions):")
decode(4, verbose=True)
print(f"\n{'passes':>7} {'tokens correct (avg of 300 runs)':>34}")
for steps in (1, 2, 4, 8, 15):
    random.seed(1)
    runs = [sum(a == b for a, b in zip(decode(steps), target)) / L for _ in range(300)]
    print(f"{steps:7} {sum(runs) / len(runs):34.0%}")
PY
python3 mdm.py
```

**What you see:** the answer is built **in parallel**, in **4 passes instead of 15**; the table shows the trade-off the lecture describes: **more steps, higher quality**, and the number of steps is a **knob you choose**, usually far smaller than the output length. (The accuracy numbers come from my **simulated** denoiser, so they show the **mechanism**, not real model quality.)

**Advantages claimed:** **speed** (benchmarks cite up to about 10× faster, valuable for coding where you wait for output), and a natural fit for **fill-in-the-middle** tasks since the model considers **all positions at once**. **Status:** the lecture says performance was not yet on par with leading AR models but was catching up; open questions include adapting **reasoning chains and other AR-era techniques** to diffusion.

## 4. Ideas travelling between fields

- **Architecture:** diffusion (born in images) now serves text; **Transformers replaced convolutions** in diffusion image models.
- **Inputs:** **DeepSeek-OCR** showed text can be reconstructed from **very few vision tokens**, suggesting image patches carry text meaning compactly (and that tokenisers are not the ideal input for things like emojis).
- **Tricks:** **RoPE** was adapted to **2D grids** so image and text tokens can share a relative-position scheme.
- **Everything is still being tuned:** the **optimiser** (Adam being challenged by **Muon** and a "MuonClip" variant in the Kimi K2 report), **normalisation** (LayerNorm → RMSNorm; pre-norm), **attention variants** (every paper mixes GQA, sliding windows and global layers differently), **activation functions** (ReLU-like but smoother, such as GELU variants), depth, heads, FFN width.

## 5. Data, and model collapse

The first LLMs trained on a mostly **human-written** internet. Now much of the web is **LLM-generated**. If new models **train on the output of earlier models**, the **distribution loses its tails** (rare words, unusual ideas): **model collapse**. LLM text is **less diverse** than human text, so each generation learns a narrower world. Responses: more **data curation**, **mid-training** on higher-quality data, careful filtering of synthetic data.

A minimal demonstration: repeatedly **fit a distribution to a finite sample of the previous generation** and watch rare items disappear:

```run
cd ~/l9
cat > collapse.py <<'PY'
import random
from collections import Counter
random.seed(8)

# generation 0: a "human" distribution with a few common words and a long tail of rare ones
vocab = [f"w{i}" for i in range(50)]
weights = [1 / (i + 1) for i in range(50)]                     # Zipf-like
total = sum(weights); dist = {w: x / total for w, x in zip(vocab, weights)}

def entropy(d):
    import math
    return -sum(p * math.log2(p) for p in d.values() if p > 0)

print(f"{'generation':>10} {'distinct words':>15} {'entropy (bits)':>15} {'prob. of the top 3 words':>26}")
for gen in range(0, 41):
    if gen % 8 == 0:
        top3 = sum(sorted(dist.values(), reverse=True)[:3])
        print(f"{gen:10} {sum(1 for p in dist.values() if p > 0):15} {entropy(dist):15.2f} {top3:26.2f}")
    sample = random.choices(list(dist), weights=list(dist.values()), k=150)     # the next model trains on 150 samples of the last
    counts = Counter(sample); n = len(sample)
    dist = {w: counts.get(w, 0) / n for w in dist}
PY
python3 collapse.py
```

**What you see:** with each generation the model only sees what the previous one **happened to generate**; rare words vanish forever, the **entropy falls** and the mass concentrates on a few common words. Real collapse is more subtle, but the **loss of tails** is the core mechanism.

## 6. Where the field is heading

- **Cost-effectiveness** rather than only higher benchmark scores: **small language models (SLMs)** at good quality, since providers say they lose money on heavy plans; serving smartly matters (everything in Lectures 3 and 4).
- **Hardware:** GPUs are built for **matrix multiplication**, but attention has its own needs (`QKᵀ` is costly, memory movement dominates, hence FlashAttention). Research explores hardware that does these operations as a **side effect of analogue signals** (a proof of concept reporting lower latency and energy).
- **Wider use:** coding assistants, text-to-visualisation, creative drafting, **learning** (asking an assistant to explain what you just heard is a fast feedback loop), then **democratised agents** that need no coding, AI browsers (with unresolved **security** questions such as prompt injection), OS-level assistants.
- **Open problems:** **reliability over many steps**, **continual learning** (weights are frozen after training; RAG and tools are workarounds), **hallucination** (a consequence of training to predict plausible next tokens rather than map statements to facts), **personalisation, interpretability, safety**, and whether the Transformer is the best architecture.
- **Human value:** customer-service bots show how hard it is to match human empathy and grounding. And a line to keep: **your taste matters most; generating output is cheap, judging it is hard.**

## 7. How to keep up

- **arXiv** and conference papers (NeurIPS and others); read the **code** that accompanies them; Hugging Face's trending papers page.
- **Social media researchers' threads**; YouTube explainers (a classic walk-through of the original Transformer paper, and long lecture series from well-known educators such as Andrej Karpathy); **company engineering blogs**; the study guide that accompanies the course.
- Build a habit: one paper a week, one reproduction a month (use this course's runnable scripts as templates).

:::warn Common mistakes
- **Assuming vision models need convolutions**: with enough data, plain Transformers do as well or better.
- **Assuming diffusion for text adds noise**: it **masks** tokens.
- **Assuming fewer passes means worse quality for free**: the step count is a **quality/speed knob**.
- **Training on your own model's output without fresh human data**: model collapse.
- **Treating the field's "best practice" as fixed**: optimisers, norms, attention and activations keep changing.
:::

## 8. Interview-style questions

- **"How does a Vision Transformer work?"** Patches become tokens via a learned linear projection, add position embeddings and a CLS token, run a Transformer encoder, classify from the CLS output.
- **"Why is autoregressive generation slow and how do diffusion LLMs help?"** One token per sequential pass; masked diffusion refines all positions over a fixed number of steps, so it needs fewer passes.
- **"What is model collapse?"** Repeatedly training on model-generated data narrows the distribution and loses rare, diverse content.
- **"What would you want to know before choosing a model for production?"** Quality on **your tasks**, cost, latency, safety profile, context length, and where it sits on the Pareto frontier (Lecture 8).

:::try
1. In `vit.py` change the patch size to 32 and 8. How do the token count and the attention table size change?
2. In `mdm.py` set the "wrong" probability higher (lower confidence) and see how many steps are needed for good quality.
3. In `collapse.py` increase the sample size from 150 to 5000. How does collapse slow down? What does that say about needing **more fresh data**?
4. Write your own one-page map of the course in your own words, then compare with section 1.
:::

:::recap
- The course in one line each: **tokens and attention → variants → LLM and decoding → training → alignment → reasoning → RAG, tools and agents → evaluation → trends**.
- **ViT** treats image **patches as tokens**; **VLMs** feed image tokens into a decoder LLM (or via cross-attention).
- **Diffusion for text** replaces noise with **masks**, decoding all positions over a small, tunable number of steps for speed.
- **Model collapse** is the loss of diversity when models train on their own output; **data curation** is increasingly central.
- The open problems are reliability, continual learning, hallucination, safety, cost and hardware; keep learning from papers, code and building.
:::

:::quiz
? In a ViT, what does the CLS output represent?
- The first patch only
+ A summary vector that has attended to all patches, used for classification
- The image caption
! Same idea as BERT's CLS.

? What replaces noise in diffusion for text?
- Dropout
+ Mask tokens
- Random words only
! Noise has no discrete analogue, so tokens are masked and then recovered.

? Why can a masked diffusion LLM be faster than auto-regressive decoding?
- It uses a smaller vocabulary
+ It needs only a fixed number of denoising passes, fewer than the output length
- It skips attention
! Each pass fills many positions in parallel.

? What happens to a distribution when each generation trains on the previous generation's finite samples?
- It becomes more diverse
+ Rare items disappear and diversity (entropy) falls: model collapse
- Nothing
! The tails are lost.

? Which approach do most VLMs use for images?
- Cross-attention only
+ Encode the image into tokens and concatenate them with text tokens into a decoder-only LLM
- Convert the image to text first
! The cross-attention route exists but is less common.
:::
