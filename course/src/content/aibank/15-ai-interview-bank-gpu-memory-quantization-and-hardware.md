---
track: aibank
title: "AI interview bank: GPU memory, quantization and hardware"
short: GPU memory, quantizati
sub: 9 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Count the KV bytes per token from the config

*Level 2 (working) · estimate · about 8 minutes*

You are given two model configs. Model A: 36 layers, 8 KV heads, head size 128. Model B: 48 layers, 4 KV heads, head size 128, and almost four times the parameters. Estimate the KV cache bytes per token of each in BF16, say which one fits more users in a KV pool of the same size, and explain why the parameter count misled you if it did.

:::answer Show the answer
:::say Short answer
KV bytes per token are 2 times layers times KV heads times head size times bytes per value, where the 2 counts the key and the value. Model A, which is Qwen/Qwen3-8B, holds 2 x 36 x 8 x 128 x 2 bytes, which is 144 KiB per token; model B, which is Qwen/Qwen3-30B-A3B, holds 2 x 48 x 4 x 128 x 2 bytes, which is 98,304 bytes or 96 KiB. The bigger model keeps fewer bytes per token and fits more users in the same pool, because the KV heads and the layers decide the cost and the parameter count does not. On one card the bigger model also needs room for weights almost four times larger, so its pool is smaller, and it can fit fewer users in total.
:::

**Full answer**

**The formula, checked against a log**

```text
KV bytes per token = 2 x layers x KV heads x head size x bytes per value
```

Read the first three numbers from the model config as `num_hidden_layers`, `num_key_value_heads` and `head_dim`. In BF16 a value takes 2 bytes; with an FP8 cache it takes 1 byte. SGLang prints the result at startup. For Qwen3-0.6B the log said `bytes_per_slot=114688`, and the pool line gave every term: 28 layers, 8 KV heads, a head dimension of 128 and bfloat16. The product is 2 x 28 x 8 x 128 x 2, which is 114,688 bytes or 112 KiB. The formula and the log agree to the byte.

**The same arithmetic on public configs**

| Model | Attention | Bytes per token in BF16 | Per GPU |
|---|---|---|---|
| Qwen3-0.6B | GQA, 28 layers, 8 KV heads | 112 KiB | 112 KiB on one GPU |
| Qwen3-8B | GQA, 36 layers, 8 KV heads | 144 KiB | 144 KiB on one GPU |
| Qwen3-30B-A3B | GQA, 48 layers, 4 KV heads | 96 KiB | 96 KiB on one GPU |
| Llama-3.1-8B | GQA, 32 layers, 8 KV heads | 128 KiB | 128 KiB on one GPU |
| Llama-3.1-70B | GQA, 80 layers, 8 KV heads | 320 KiB | 40 KiB with 8-way tensor parallelism |
| DeepSeek-V3 | MLA, 61 layers, latent 512 plus 64 | 68.6 KiB | 68.6 KiB on every GPU |

Two results surprise most people. A 0.6B model costs almost as much per token as an 8B model. A 100,000-token conversation on Llama-3.1-8B holds 12.2 GiB of KV, which is close to the size of the weights.

**Why parameters mislead**

With grouped-query attention several query heads share one key and value head, so modern models have far fewer KV heads than attention heads, and the KV head count is a design choice that does not follow the parameter count. The mixture-of-experts model has almost four times the weights of the dense 8B model and keeps two thirds of its bytes per token.

Multi-head latent attention stores one compressed latent per token instead of separate keys and values per head. It is small per token, but every tensor-parallel rank stores the full latent, so adding GPUs with tensor parallelism does not add tokens.

**Turn bytes into a pool**

The engine gives the cache what is left after the weights and the startup profile. On the GB10 with the 30B model, 31.32 GiB of KV memory at 96 KiB per token holds about 342,000 tokens. On the L4 with Qwen3-8B, a pool of 24,096 tokens at 144 KiB is 3.31 GiB. Divide the pool by the context that one user holds, prompt plus output, for the users that fit. An FP8 cache halves the bytes: for the 30B model each token took 49,152 bytes instead of 98,304, and together with FP8 weights the GB10 pool grew from 227,243 to 1,083,008 tokens.

**Where to read it**

vLLM prints `Available KV cache memory` and `GPU KV cache size` with the maximum concurrency at the full length. SGLang prints `bytes_per_slot` or the `KV Cache is allocated` line with the token count, and `max_total_num_tokens` is the result of the whole calculation. Check that the computed number and the log agree before you plan.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Qwen3-0.6B has 28 layers and 8 KV heads with a head size of 128. What does one token cost, and what did the log say? Expected: 2 x 28 x 8 x 128 x 2 bytes, 114,688 bytes or 112 KiB; the startup log printed bytes_per_slot=114688, so the formula and the log agree to the byte.
- **Level 3:** A dense 70B model with 80 layers and 8 KV heads is split across 8 GPUs by tensor parallelism. What does each GPU hold per token? Expected: 320 KiB in total and 40 KiB on each GPU, because tensor parallelism splits the KV heads across the ranks.
- **Level 4:** Why does the same split not help a latent-attention model? Expected: that attention stores one compressed latent per token, about 68.6 KiB for the 61-layer model, which cannot be split across heads; every rank stores the full latent, so eight GPUs hold eight copies and add no tokens.

**Wrong answers, and why they fail**

- "A bigger model always needs more KV cache per token." The layer count and the KV heads decide the cost; the 30B expert model keeps 96 KiB per token against 144 KiB for the 8B dense model.
- "A small model needs a small cache." Qwen3-0.6B keeps 112 KiB per token, almost as much as an 8B model, because it has 28 layers and 8 KV heads.
- "Tensor parallelism always adds KV capacity." It splits the KV heads of a grouped-query model, but a latent-attention model stores the full latent on every rank, so more ranks add no tokens.
- "Count the weights and subtract from the card to get the cache." The engine also keeps a startup profile and graph memory; read the available KV memory and the pool size in the startup log, then divide by the bytes per token.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Pick a 4-bit format for a 14B model on 24 GB

*Level 2 (working) · tradeoff · about 10 minutes*

A 14B model must run on a 24 GB card and does not fit in FP8 with a usable pool. You can choose AWQ, GPTQ, a checkpoint in the compressed-tensors format, bitsandbytes at load time, or a GGUF file. How do you pick, and what did the manual measure for each?

:::answer Show the answer
:::say Short answer
Pick a published 4-bit checkpoint over quantization at load time, and pick the format from the engine and the workload. For a GPU server AWQ with the Marlin kernels is the default, GPTQ when you also serve LoRA adapters on the base, and GGUF only for CPU or edge serving, because its kernels are not built for GPUs. The manual started an AWQ Qwen3-14B on an L4 with 9.44 GiB of weights and a pool of 36,272 tokens, loaded Qwen3-1.7B with bitsandbytes in 1.33 GiB against 3.22 GiB in BF16, which is 41 percent, and loaded a GGUF file of 0.55 GiB through a plugin that the documentation calls experimental.
:::

**Full answer**

**The formats vLLM reads**

| Format | What it stores | Notes at 0.31.0 |
|---|---|---|
| AWQ and GPTQ | 4-bit weights, 16-bit math | runs from the Turing GPUs on, with the fast Marlin kernels on Ampere, Ada and Hopper |
| compressed-tensors W4A16 or W8A8 | 4-bit or 8-bit weights, made with the LLM Compressor library | the vLLM project suggests this library to make your own checkpoint |
| bitsandbytes | 4-bit weights, made when the server loads the model | needs the separate `vllm-bnb-plugin` package, then `--quantization bitsandbytes` for a model that is not quantized |
| GGUF | the llama.cpp file format | needs the separate `vllm-gguf-plugin` package, and the documentation calls it experimental |

For a published checkpoint you set no flag; vLLM reads the method from the checkpoint config.

**What the manual started**

- **AWQ.** `vllm serve Qwen/Qwen3-14B-AWQ --max-model-len 8192` on an L4 with no quantization flag. The log showed `quantization=auto_awq` and the Marlin kernel. The weights took 9.44 GiB and the pool held 36,272 tokens. Speed and accuracy were not measured.
- **bitsandbytes.** Without the plugin, the server stopped with `Unknown quantization method: bitsandbytes`. With it, Qwen3-1.7B loaded in 1.33 GiB against 3.22 GiB in BF16, which is 41 percent, and the pool grew from 92,960 to 108,512 tokens. The 41 percent includes the embeddings and the output layer, which stay in 16-bit, so the share differs on a larger model.
- **GGUF.** With the plugin, a 4-bit file of Qwen3-0.6B loaded 0.55 GiB of weights and a chat request returned HTTP 200.

The second GPU of the node was throttled during these starts, so the manual gives no speeds, and it measured no accuracy for either small format.

**The lesson's picking guide**

- CPU or edge serving: GGUF, with the medium 4-bit variant as the production default. GGUF is a file format that bundles several quantization variants, keeps the first and last layers at higher precision, and runs best in llama.cpp, the fastest CPU engine. In vLLM it is slow, about 93 tokens per second on a 7B model in the lesson's numbers, because the format is not built for GPU kernels.
- GPU serving with routine chat and no adapters: AWQ. It protects the most salient weights during quantization; with the Marlin kernels it gave about 741 tokens per second on a 7B model, the best code accuracy among the 4-bit formats, and a 10.9 times speedup over a naive kernel.
- GPU serving with many LoRA adapters on one base: GPTQ with Marlin, about 712 tokens per second on a 7B model and 2.6 times faster than without Marlin, because it supports LoRA in vLLM and the microscaling 4-bit formats did not at the start of 2026.
- Reasoning-heavy work: FP8, and accept the memory cost; the lesson puts the AWQ loss on math at several points.

**Two traps**

The calibration set must match the domain: AWQ and GPTQ pick the weights to protect from a calibration pass, and generic web text makes them protect the wrong weights for code, medical or legal traffic. Calibrate on hundreds of in-domain samples and test on the eval set. And the KV cache is separate from the weights: a 70B model at 4-bit is about 35 GB of weights, and at 128 concurrent requests with a 2k context its cache is near 20 GB on top.

**The accuracy caveat**

A 4-bit model can lose more accuracy than an FP8 model, and the loss depends on the model and the method. The manual ran its GSM8K check on FP8 and not on the 4-bit formats. Test the candidate formats on your own prompts, and when it is ambiguous run a 1,000-sample eval on each.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why pick a published checkpoint over bitsandbytes at load time? Expected: load-time quantization adds load time and gives a checkpoint that nobody evaluated; a published checkpoint has a known method and often a published accuracy, and vLLM reads the method from its config with no flag.
- **Level 3:** The bitsandbytes load saved 41 percent on a 1.7B model. Will a 14B model save the same share? Expected: not the same; the 41 percent includes the embeddings and the output layer, which stay in 16-bit, and they are a smaller share of a larger model, so the saving changes.
- **Level 3:** You need LoRA adapters on the 4-bit base. Which format? Expected: GPTQ with the Marlin kernels, because it supports LoRA adapters in vLLM; the microscaling 4-bit formats did not support LoRA at the start of 2026.
- **Level 4:** A domain model quantized with AWQ on generic web text loses several points on its own eval. Why, and what do you do? Expected: AWQ picks the weights to protect from a calibration set, and generic text makes it protect the wrong ones for the domain; calibrate on hundreds of in-domain samples and test on the eval set before you ship.

**Wrong answers, and why they fail**

- "GGUF is the most popular format, so use it on the GPU server." It is the CPU and edge default; in vLLM it needs an experimental plugin, and its kernels are not built for GPUs, about 93 tokens per second on a 7B model in the lesson's numbers.
- "Quantize at load time with bitsandbytes, it is one flag." Without the plugin the server stops with an unknown method error, and the result is a checkpoint that nobody evaluated; use a published AWQ or GPTQ checkpoint and test it.
- "4-bit loses as little as FP8." A 4-bit model can lose more, and the loss depends on the model and the method; AWQ loses several points on math in the lesson, so run your own check.
- "The memory saving is 41 percent for any model." The measured 41 percent is one small model with its embeddings and output layer in 16-bit; the share differs on a larger model, and the KV cache is separate from the weights.

**Related lesson in this course:** [Serving engines: batching, PagedAttention, vLLM, Triton and friends](#aiinfra-4)

:::

## Why an 8B model fails to start on a 24 GB card

*Level 2 (working) · estimate · about 8 minutes*

Your teammate starts Qwen/Qwen3-8B in BF16 on an L4 with no flags, and the start fails with an error about the KV cache and --max-model-len. The same command works on a larger card. Explain the failure with numbers, and say what you set.

:::answer Show the answer
:::say Short answer
The model config gives a context of 40,960 tokens, and vLLM takes that as the maximum length when you set none. At 144 KiB per token one request at that length needs 5.6 GiB of KV cache, and on a 24 GB card the 16.4 GB of weights can leave less than that, so the start check fails before the pool line prints. Set `--max-model-len` to the longest prompt plus answer that your users send; the pool stays the same size, and the limit only stops one request from claiming all of it.
:::

**Full answer**

**The arithmetic**

The weights of Qwen3-8B in BF16 take 16.4 GB. SGLang measured the load on the same card at 15.28 GB and had 6.59 GB left, from which it sized a pool of 24,094 tokens, 1.65 GB for the keys and 1.65 GB for the values, at a memory fraction of 0.85. A pool of that size holds about 3.31 GiB. One request at the default length of 40,960 tokens needs 40,960 times 144 KiB, which is 5.6 GiB, more than the whole pool. vLLM checks that at least one request at the maximum length fits, so the start stops.

**Set the length on purpose**

Set `--max-model-len` to the longest prompt plus answer that your users send. The pool size stays the same. A shorter limit only stops one request from claiming the whole pool, and it lets the start check pass. The pool line then prints the maximum concurrency at that length: on the L4 it read `GPU KV cache size: 24,096 tokens, Maximum concurrency for 8,192 tokens per request: 2.94x`. Real requests hold less than the limit, so more of them fit: about 37 users with 512 prompt tokens and 128 output tokens each.

**Check the length after an upgrade**

Some models extend their context with a scaling method. In release 0.30.0 vLLM changed how it reads that method, and for some models the length that vLLM derived from the config became shorter; the release notes give one model that went from 131,072 to 32,768 tokens. After an upgrade, read the derived length in the startup log, and set the length yourself if it changed.

**Other ways to make room**

The FP8 checkpoint of the same model loaded 8.81 GB of weights on the L4 and left 13.06 GB. With an FP8 cache too, the pool was 142,369 tokens against 24,094. A memory fraction set too low has the opposite effect: at 0.74 the BF16 pool was 6,559 tokens, and four shared prompts of 2,048 tokens no longer fit together.

**Check the setup**

The pool line prints only when the start succeeds. If the start stops with the error about the cache and the maximum length, lower `--max-model-len` until the pool line prints, read its concurrency, and compare it with the users you plan to serve at full length.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Does lowering the maximum model length give you more users? Expected: no; the pool stays the same size, and the limit only stops one request from taking all of it and lets the start check pass; more users need a bigger pool, from an FP8 cache, FP8 weights or a bigger card.
- **Level 3:** The same model started last month and fails after an upgrade with the same flags. What do you check? Expected: the derived context length in the startup log; a release changed how the scaling method is read and shortened one model's length from 131,072 to 32,768, and a change the other way can make the check fail, so set the length yourself.
- **Level 4:** Estimate the pool when the FP8 checkpoint replaces BF16 on the same card and the cache is FP8 too. Expected: the weights fall to 8.81 GB and leave 13.06 GB, and each token takes half the bytes, so the pool rose from 24,094 to 142,369 tokens in the manual's run.

**Wrong answers, and why they fail**

- "The card is too small for an 8B model." The weights fit with about 6.59 GB to spare; the check fails because one request at the default length of 40,960 tokens needs 5.6 GiB of cache, so set the length to what your users send.
- "Raise the memory fraction to make it start." The gap between 5.6 GiB and the room left is larger than a fraction step can close on this card; the length is the lever, and a fraction set too high leaves nothing for the activations.
- "Lower the maximum length to fit more users." It fits the start, not more users; the pool size does not change with the limit.
- "The KV pool is sized from the weights." It is sized from what is left after the weights and the startup profile, so read the available KV memory line, not the parameter count.

**Related lesson in this course:** [GPUs, memory and the systems foundation](#aiinfra-1)

:::

## Pick the memory fraction on unified memory

*Level 3 (senior) · estimate · about 10 minutes*

You run a 30B model with mixture-of-experts layers in BF16 on a GB10, a machine where CPU and GPU draw on one 128 GB memory and the operating system and other programs live in the same pool. How do you pick the memory fraction, what does the fraction not guarantee on this machine, and why does the pool size differ between two starts with the same command?

:::answer Show the answer
:::say Short answer
Add the weights, the KV cache you want and a few GiB for the startup profile and the graphs, divide by the total, and leave room for the kernel's page cache and the other programs, which use the same memory. With a fraction of 0.75 the manual's vLLM run took 91.3 of 121.69 GiB: 56.93 GiB of weights, 31.32 GiB of cache, about 342,000 tokens at 96 KiB each, and about 3 GiB for the rest, which left about 30 GiB for everything else. The fraction is a plan and not a hard limit on unified memory, and the pool moves between starts because the engine sizes it from a snapshot of free memory that the kernel's file cache changes.
:::

**Full answer**

**What GPU memory means here**

The GB10 has no separate GPU memory. The CPU and the GPU use one pool of LPDDR5x memory, sold as 128 GB; the startup log reported 121.69 GiB in total. On an integrated GPU vLLM reads free memory from the operating system, because the driver reports too little, and it releases its cached GPU memory when the whole system is more than 80 percent full. So the fraction is a share of the whole machine, not of a separate card.

**The budget at 0.75**

| Part | Size |
|---|---|
| The share for vLLM, 0.75 of 121.69 GiB | 91.3 GiB |
| The weights | 56.93 GiB |
| Free for the KV cache | 31.32 GiB |
| The rest, for the profile and the graphs | about 3 GiB |

At 96 KiB per token the cache holds about 342,000 tokens, enough for more than 500 users with 640 tokens each. About 30 GiB stayed for the system and every other program. The manual ran one fraction only and says so.

**The fraction is not a hard limit**

Two reports show the engine taking more than its share during the startup profile on this machine. One ran a fraction of 0.70, used about 112 GiB against a share of about 83 GiB, and the machine stopped responding. Another hit a negative estimate of the graph memory with a speculative method, so the cache grew too large and the start ran out of memory. The manual's own run matched the share of 0.75, with no speculation. To give the cache a fixed size instead, set it in bytes with `--kv-cache-memory-bytes`, and check that the weights, the cache and a few GiB for the profile leave room for the operating system.

SGLang's manual adds a field report of 25 to 40 GB of short-lived allocations outside the memory accounting, from the kernel autotuner and the graph capture, which froze a host until the server ran in a container with a memory cap and a fraction of 0.50. On a shared GB10, run the server in a container with a memory limit and log free memory once a second during startup.

**Why the pool moves between starts**

SGLang sizes the pool from a snapshot of free memory after the weights load, and it measures the weights as the drop in available memory. Six BF16 starts of one command with the same weights on the GB10 read the weights at 54.78 to 57.92 GB and gave pools from 227,243 to 258,017 tokens, 14 percent apart. The kernel's file cache changed during each load. On unified memory a pool size from one start is an estimate for the next, so read the pool line at every start.

**Other programs see the pool**

The pool is tens of GB and the engine allocates it in a few seconds, so every other program sees that memory go. A memory guard daemon on the manual's GB10 paused the scheduler three times during startup because it grew 36.7 GiB in 5 seconds with 34.2 GiB left. Tell the other users of the machine before you start, and do not alert on the driver's out-of-memory lines alone; alert when a server does not become healthy.

**When a bigger pool pays**

Raising the SGLang fraction from 0.7 to 0.82 on the GB10 grew the BF16 pool from 234,600 to 383,065 tokens, 63 percent, and changed closed-loop throughput by less than 2 percent at 64 users, 238.72 against 235.38 tokens per second, because token usage peaked at 11 percent. Under a fixed arrival rate above what the machine serves, the smaller pool was 96 percent full with 101 requests waiting, the larger pool held all 480 requests, and the machine completed 5.19 against 3.88 requests per second, 34 percent more. Size the pool from token usage at peak load, bursts included, and not from free memory.

**Expect a slow first start**

Loading 56.93 GiB took 330 s on this machine, because each tensor is copied from a memory-mapped file one at a time, about 1.7 ms per tensor from the file view against 0.2 ms from host memory. Keep the weights on the local drive, and keep the server running.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** `free -g` shows almost no available memory while the server idles. What do you do? Expected: lower the fraction by 0.05 and start again; the system and its page cache share the pool, and if the cache line is larger than the share allows, set the cache size in bytes instead.
- **Level 3:** The same command gave pools of 227,243 and 258,017 tokens on two days. Is something broken? Expected: no; the engine sizes the pool from a snapshot of free memory after the weights load, and the kernel's file cache changed during each load, so the measured weights moved by about 3 GB and the pool with them; read the pool line at every start.
- **Level 4:** Going from 0.7 to 0.82 did nothing at 64 users and gave a third more throughput in an overload. Reconcile the two. Expected: in the closed loop the pool was never full, token usage peaked at 11 percent, so a larger pool had nothing to do; under a fixed arrival rate above what the machine serves, the small pool was 96 percent full with 101 requests waiting and the larger pool held all 480, so size the pool from token usage at peak load with its bursts.

**Wrong answers, and why they fail**

- "The fraction caps what the server can take." On unified memory it sets the share that the engine plans for; one report used about 112 GiB at a fraction of 0.70 during the startup profile against a share of about 83 GiB, and the machine stopped responding.
- "Set the fraction as high as it goes to get the biggest pool." The system and its page cache use the same memory, and memory you do not need is memory another program cannot use; on the GB10 a 63 percent larger pool changed closed-loop throughput by less than 2 percent.
- "Yesterday's pool size is the pool size." Six starts with the same command gave pools 14 percent apart, because the snapshot of free memory changed; read the line each time.
- "A slow first start means something is wrong." Loading 56.93 GiB from a file-backed mapping took 330 s on this machine, about 1.7 ms per tensor against 0.2 ms from host memory; keep the weights on local storage and keep the server running.

**Related lesson in this course:** [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2)

:::

## Split the model or copy it across two cards

*Level 3 (senior) · design · about 10 minutes*

You have two L4 cards in one host, joined by PCIe only, and an 8B model that fits on one card with a KV pool that is too small for your users. Do you split the model across both cards or run two copies? Think about memory first, then about communication.

:::answer Show the answer
:::say Short answer
Tensor parallelism splits the weights and the KV cache across the two cards, so each card holds half the weights and gains several times the room for cache, and that is the layout that grows the pool per request; data parallelism holds a full copy of the weights on each card and doubles the users only if each copy's pool already fits them. Over PCIe, tensor parallelism pays a collective after every layer and can cost more than the split saves, so the documentation suggests pipeline parallelism on such a machine, which sends data only at the stage boundaries. Neither manual measured either layout on its two L4s, so I would measure tensor against pipeline against two copies on the real workload, and give any split whole GPUs, because a tensor group sizes every rank from the smallest card.
:::

**Full answer**

**What each layout does to memory**

| Layout | Weights per GPU | KV cache per GPU | What grows |
|---|---|---|---|
| Tensor | a slice of every layer | a slice of every layer's cache | the pool per request, several times when the weights fill most of one GPU |
| Pipeline | the layers of its stage | the cache of those layers | the pool per request, and it accepts an uneven GPU count |
| Data | a full copy | its own full pool | the number of users, only if one copy's pool already fits them |

One exception: a model with multi-head latent attention stores the full latent on every tensor-parallel rank, so the tensor split does not grow its cache. For a grouped-query model such as Qwen3-8B it does.

**The decision tree**

| Question | If yes | If no |
|---|---|---|
| Does the model fit on one GPU, with room for the KV cache you need? | Data parallelism, one copy per GPU. | Split the model. |
| Does the split model fit inside one machine? | Keep the split inside the machine. | Pipeline parallelism across machines. |
| Do the GPUs have NVLink, and does the GPU count divide the model evenly? | Tensor parallelism. | Pipeline parallelism inside the machine. |

Your case answers the first question with no, because the room for the cache is the problem. The third question answers with no too, because PCIe is not a fast link. The tree lands on pipeline parallelism inside the machine, and the manual asks you to measure it against tensor parallelism before you pick, because it ran neither on its pair.

**What the link costs**

Tensor parallelism sends data after every layer, so it needs a fast link. On GPUs joined only by PCIe, such as two L4s in one host, that traffic can cost more than the split saves. Pipeline parallelism sends data once per stage boundary. Data parallelism sends nothing between copies.

**The balance check**

Before SGLang loads weights for a tensor group, each rank measures its free memory and the group keeps the smallest value. If that value is under 90 percent of the local free memory, the server stops, and no flag turns the check off. On the manual's pair the second card ran two pods of another team and had 18.28 GB free against the 19.53 GB that the check required, so the tensor split refused to start. Each rank holds the same share of weights and the same pool, so the smallest card sets the size for all. The data-parallel pair had no such check, started with pools of 24,094 and 2,925 tokens, and served less than one card at every load. Give any split whole GPUs.

**The processes**

With data parallelism vLLM starts one engine core per copy and a coordinator; with tensor parallelism one worker per GPU under one engine core. In SGLang the world size is the tensor size times the pipeline size, and data-parallel copies get a controller that sends requests round robin by default.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The model fits on one card. Why might the decision tree still say split? Expected: the first question asks whether it fits with room for the KV cache you need; with a pool that cannot hold your users the answer is no, so the tree moves to a split, and tensor or pipeline parallelism is what grows the pool per request.
- **Level 3:** Why does the tensor split need whole GPUs on a shared machine? Expected: every rank holds the same share of weights and the same pool, so the smallest card sets the size for all; SGLang measures free memory on each rank and stops when one has less than 90 percent of the local free memory, 18.28 against 19.53 GB in the manual's case.
- **Level 4:** Over PCIe, how would you decide between tensor and pipeline parallelism without a measurement from the manuals? Expected: run both on the real workload and read throughput with the P99 ITL and the first token at matched clocks; tensor pays a collective after every layer on the slow link and pipeline pays once per stage boundary, so the pipeline layout can win on a PCIe pair, and the documentation suggests it there.

**Wrong answers, and why they fail**

- "Two copies double everything." Each copy holds the full weights, so the pool per copy is the same small pool; two copies double the users only if that pool already fits them, and a pair with unequal pools served less than one card.
- "Tensor parallelism is the way to pool memory across cards." It pools the weights and the cache, but it sends data after every layer; over PCIe that traffic can cost more than the split saves, so the documentation suggests pipeline parallelism on such a machine.
- "The split starts as long as the model fits across the two cards." The tensor group refuses when one rank has less than 90 percent of the local free memory, because the smallest card sets the pool for all ranks; give the split whole GPUs.
- "Pipeline parallelism wastes a card because the stages wait for each other." It sends data only at stage boundaries and accepts an uneven GPU count, which is why the documentation suggests it for GPUs without a fast link; measure it before you rule it out.

**Related lesson in this course:** [GPUs, memory and the systems foundation](#aiinfra-1)

:::

## The FP8 KV scales that never loaded

*Level 3 (senior) · debug · about 8 minutes*

You enabled an FP8 KV cache on a checkpoint that ships calibrated scales, and accuracy on your eval dropped. The startup log contains a line about the scaling factor. What happened, how do you confirm it, and what are your options?

:::answer Show the answer
:::say Short answer
The server is running the cache with a scale of 1.0, because the loader did not use the scales in the checkpoint: vLLM prints `Using KV cache scaling factor 1.0` when that is the case. SGLang prints `Using FP8 KV cache but no scaling factors provided` whenever no `--quantization-param-path` is passed, so its warning alone does not show which scales the server uses. Confirm the vLLM case by searching the weight index of the checkpoint for tensors that end in `k_scale` or `v_scale`; if they exist and vLLM still prints the warning, the loader dropped them, which at 0.31.0 happens for one whole model family and for one draft loader in open issues. The options are another checkpoint or version whose scales load, a scale file passed through the quantization parameter path on SGLang, or a BF16 cache until they do, with an accuracy run on your own task after each change.
:::

**Full answer**

**What a scale does**

FP8 needs a scale for each tensor to map the range of the keys and values into the format. Without one, every scale is 1.0. The vLLM team treats that as the worst case for accuracy. In their tests of uncalibrated caches most models stayed close to BF16, and one model family on a latent-attention backend did not work well without calibrated scales. A fix in SGLang for dropped scales on compressed-tensors checkpoints measured GSM8K at 0.960 with the scales dropped and 0.965 with them loaded, on a checkpoint whose scales were close to 1.0; a checkpoint with scales far from 1.0 loses more.

**Confirm it in three steps**

1. Look for the scales in the checkpoint. Search the weight index for tensor names that end in `k_scale` or `v_scale`:

```bash
grep -oE '"[^"]*(k|v)_scale"' model.safetensors.index.json | sort -u
```

No output means that the checkpoint has no scales. A checkpoint with one weight file has no index; list its tensor names with the safetensors package instead.

2. Read the startup log. In vLLM the scaling factor warning with scales present in the checkpoint means that the loader dropped them. In SGLang the provided-scales warning prints whenever you pass no scale file, so it alone does not say which scales the server uses; a warning about a missing `k_scale` or `v_scale` parameter does say that the loader skipped them.

3. Run your own prompts with and without the FP8 cache and compare the answers before you go to production.

**The loaders at the pinned versions**

At vLLM 0.31.0 one model family never loads its KV scales, and one speculative draft loader drops them too; both issues are open. SGLang dropped the KV scales of compressed-tensors checkpoints before a fix merged on 2026-08-20, and the log reported each `k_scale` parameter as not found; the fix is in v0.5.22. A later release of vLLM also fixed a case where a level 2 sleep cleared calibrated scales and the first request after a reload returned wrong values.

**Weight scales are not KV scales**

The FP8 checkpoint of Qwen3-30B-A3B lists weight scales and no KV scales in its index, so its cache ran with a scale of 1.0 on the manual's GB10. An FP8 checkpoint says nothing about its cache until you look.

**What the manual measured without scales**

Qwen3-8B has no KV scales, so the manual's FP8 KV runs used a scale of 1.0. On 500 GSM8K questions, 8-shot and greedy, vLLM scored 90.8 percent with the FP8 cache against 91.8 in BF16, and SGLang 91.6 against 91.6. Every interval overlapped. That is not a licence: 500 questions cannot rule out a loss of a few points, it is one model and one benchmark, and a model with another attention layout can lose more.

**The options**

- Another checkpoint, or another engine version, whose scales load; read the log after the change.
- On SGLang, a scale file through `--quantization-param-path`.
- A BF16 cache until the scales load, and the capacity from FP8 weights instead.
- In every case, the accuracy run on your own task, with the cached warning read as a defect to track.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The checkpoint has one weight file and no index. How do you look for the scales? Expected: list the tensor names with the safetensors package instead of searching the index, and look for names that end in k_scale or v_scale.
- **Level 3:** The warning prints, but your GSM8K run shows no loss. Are you done? Expected: no; 500 questions cannot rule out a loss of a few points, the loss depends on the model and its attention layout, and one family needed calibrated scales while most did not; run your own task and track the warning as a defect.
- **Level 4:** Why do calibrated scales matter more for some attention layouts than for others? Expected: the scale maps the range of the keys and values into the FP8 range, and a layout whose values spread wider than the format clips or loses precision at a scale of 1.0; the vLLM team named one latent-attention family that did not work well uncalibrated while most models stayed close to BF16, so the layout and the calibration decide together.

**Wrong answers, and why they fail**

- "The checkpoint is FP8, so the KV scales are loaded." Weight scales and KV scales are different tensors, and a checkpoint with KV scales can still have them dropped by the loader; the warning tells you what the server uses.
- "The warning is informational." On vLLM it means that every KV scale is 1.0, which the vLLM team treats as the worst case for accuracy; with scales in the checkpoint it means that the loader dropped them.
- "A scale of 1.0 worked for Qwen3-8B, so it works." It gave overlapping intervals on 500 GSM8K questions for one model, which cannot rule out a loss of a few points, and another family lost accuracy at 1.0.
- "Pass --quantization fp8 to load the scales." The weight method and the cache scales are separate; on SGLang the scales come from the checkpoint or from the quantization parameter path file, and a weight flag that does not match the checkpoint raises at startup.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## The pool was 95 percent empty and the server died

*Level 3 (senior) · debug · about 10 minutes*

An SGLang server on a shared workstation ran for four minutes, and then a benchmark with 32 requests in flight crashed it with an out-of-memory error. The scheduler log just before the crash shows `token usage: 0.05`. Explain how the pool was 95 percent empty and the server still ran out of memory, and what you set.

:::answer Show the answer
:::say Short answer
The KV pool is sized once at startup from a snapshot of free memory, and the automatic fraction gave 87.2 percent of what was free to the weights and the pool. Thirty-two requests held 16,095 tokens, 5 percent of a 312,581-token pool, so the pool had reserved 33 GB and used under 2 GB, and the activations of the next forward pass needed memory outside the pool that the operating system no longer had. On a machine that runs anything else, pass `--mem-fraction-static` yourself; with 0.4 the same benchmark finished all 128 requests at concurrency 32.
:::

**Full answer**

**Two startups, two pool sizes**

The manual started the server twice with the same command and no fraction. The first start saw 27.81 GB of system memory available, took a KV budget of 24.25 GB and sized a pool of 227,022 tokens. The second start saw 38.29 GB available, took 33.39 GB and sized 312,581 tokens. Nothing changed in SGLang between the runs; other programs used less memory at the second start. Both budgets were 87.2 percent of the free memory, because the automatic fraction resolved to 0.872.

**The crash**

The last decode line before the crash showed 32 running requests with 16,095 tokens at a token usage of 0.05. The pool had reserved 33 GB and used under 2 GB of it. The next forward pass needed memory for its activations outside the pool, the operating system had none left, one command buffer failed, the scheduler died, and the server killed its whole process tree. An empty pool and an out-of-memory crash were the same event.

**How SGLang decides the split**

The fraction is the share of memory for the weights plus the KV pool. Everything else, activations, graphs and other programs, lives outside it. On a GPU the automatic value comes from a reserve: 512 MB plus 1.5 MB for each token of the prefill chunk, more for tensor and pipeline parallelism and for graphs, and at least 10 GiB on a GPU with more than 60 GB. The fraction is the memory minus the reserve, divided by the memory. When the device capacity cannot be read, it becomes 0.95. After the weights load, SGLang measures free memory again, and the KV budget is that free memory minus the share outside the fraction of what was free before loading. On the laptop backend the rule is simpler: the smaller of the fraction of the device working set and the fraction of system memory available right now, and that second term is the snapshot that moved.

**Where the default fails**

- A shared machine: the snapshot at startup does not hold for the life of the server.
- Unknown capacity: the fraction becomes 0.95 and leaves 5 percent for activations, which one report hit as an out-of-memory error on the first prefill.
- Memory the estimate does not know about: draft model copies that stay in memory while the target pool is sized, and a 64K-token prompt that ran out of memory in attention although the log reported room for 274,934 tokens.

**The fix, and the other direction**

With `--mem-fraction-static 0.4` the budget became 19.39 GB, 0.4 of the 48.49 GB snapshot, and the pool held 181,574 tokens, far more than 32 requests of 640 tokens need. A smaller pool cost nothing in this workload, because the workload never filled it. On a dedicated GPU trust the automatic value first. Raise it in steps of 0.02 only when the scheduler log shows a full pool and retractions. Find the upper limit in staging with your longest prompts, run production one or two steps below it, and lower it when long prompts fail with out-of-memory errors in attention.

**What to measure**

Read the `max_total_num_tokens` line at startup, which is the result of the whole calculation. Watch `token usage` in the decode lines; near 1.0 the pool is full. Read the free memory of the machine during the heaviest prefill from the operating system. On the laptop backend the cache memory metric read 0.0 because that backend allocates its pool outside the metric's accounting; the pool log line, about 19,860 MB, is the number to use.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the second start get a bigger pool than the first when nothing in SGLang changed? Expected: other programs used less memory at the second start, so the snapshot of free memory grew from 27.81 to 38.29 GB and the pool grew with it, from 24.25 to 33.39 GB at the same automatic fraction.
- **Level 3:** What memory does the fraction cover, and what lives outside it? Expected: the weights plus the KV pool; activations, graphs, autotuning scratch and every other program live outside it, which is why a pool at 87 percent of free memory left nothing for the next forward pass.
- **Level 4:** On a dedicated GPU, when do you raise the fraction and by how much? Expected: only when the scheduler log shows a full pool and retractions, in steps of 0.02; find the upper limit in staging with your longest prompts, run production one or two steps below it, and lower it when long prompts fail with out-of-memory errors in attention.

**Wrong answers, and why they fail**

- "A token usage of 0.05 means the server was nowhere near full." It means the pool was nearly empty; the pool had taken the memory and the activations outside it ran out, so an empty pool and an out-of-memory crash were the same event.
- "Raise the fraction so that the pool is bigger and the crash goes away." The crash came from memory outside the pool; a bigger fraction takes more from the activations and the other programs, and 0.4 is what fixed it.
- "The automatic fraction is tuned, so leave it." It assumes the machine belongs to the engine; on a shared machine the snapshot at startup does not hold for the life of the server, and when the capacity cannot be read it becomes 0.95 and fails on the first prefill.
- "The pool line tells you the memory the server uses." The pool is the largest part and not the whole; one report measured 25 to 40 GB of short-lived allocations outside the accounting from the autotuner and the graph capture.

:::

## Why FP8 grew the pool 4.77 times and not 2

*Level 3 (senior) · estimate · about 8 minutes*

On a GB10 a BF16 server of Qwen/Qwen3-30B-A3B-Instruct-2507 loads 57.75 GB of weights and sizes a KV pool of 227,243 tokens. You move to the FP8 checkpoint and add `--kv-cache-dtype fp8_e4m3` at the same memory fraction. Estimate the new pool, and explain why it is not simply twice the old one.

:::answer Show the answer
:::say Short answer
Two effects multiply. The FP8 weights fell to 29.75 GB and freed 28.00 GB, which the fraction handed to the pool, so the pool grew from 20.80 GB to 49.58 GB in the units of the log; and each token took half the bytes, 49,152 instead of 98,304 for 48 layers with 4 KV heads of size 128. The pool went from 227,243 to 1,083,008 tokens, 4.77 times as many, and the load time fell from 323.61 s to 152.29 s.
:::

**Full answer**

**The two startup logs**

The BF16 server loaded the weights in 323.61 s with a memory usage of 57.75 GB and allocated a cache of 227,243 tokens, 20.80 GB in the units of the log. The FP8 server logged `Detected fp8 checkpoint`, then `Using FP8 KV cache but no scaling factors provided. Defaulting to scaling factors of 1.0`, loaded in 152.29 s with 29.75 GB, and allocated 1,083,008 tokens, 24.79 GB for the keys and 24.79 GB for the values. Both used `--mem-fraction-static 0.7`, and neither got a `--quantization` flag, because SGLang reads the method from the checkpoint.

**The arithmetic**

The fraction fixes the share for the weights and the pool together. Smaller weights leave more of that share to the pool: the weights freed 28.00 GB and the pool grew by 28.78 GB. At the same time each token needs half the bytes with an FP8 cache. The two factors multiply, which is how 227,243 tokens became 1,083,008. The GB10 has 121.7 GiB of memory, so the BF16 pool was never short in the closed-loop sweep; on the L4, where the weights took most of the card, the same pair grew the pool from 24,094 to 142,369 tokens, 5.91 times.

**Speed moved too**

| Concurrency | BF16 output tok/s | FP8 output tok/s | BF16 median TPOT | FP8 median TPOT |
|---|---|---|---|---|
| 1 | 29.14 | 51.50 | 32.52 ms | 18.41 ms |
| 8 | 74.11 | 137.00 | 102.21 ms | 54.96 ms |
| 32 | 150.66 | 283.19 | 201.91 ms | 104.12 ms |
| 64 | 235.38 | 440.86 | 254.06 ms | 131.78 ms |

FP8 gave 1.73 to 1.88 times the throughput at every concurrency. Decode on this machine reads the weights from a memory with modest bandwidth, so half the weight bytes gave almost twice the speed. That is a different result from a field report of an FP8 cache alone, which was a few percent slower per token and won on capacity.

**The scales**

The second log line is the warning. No scale file was given, so every KV scale is 1.0. The weight index of this FP8 checkpoint lists weight scales and no KV scales, so weight scales do not imply cache scales. Both servers wrote the same 12 tokens for one greedy prompt, which is not an accuracy check. The GSM8K check on 500 questions, run on the L4 with the 8B model, gave overlapping intervals for every FP8 configuration, and that is the shape of check to run on your own model.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why did the pool grow 4.77 times and not 2 times? Expected: halving the bytes per token doubles the tokens in the same memory, and the smaller weights also gave the pool 28.78 GB more memory; the two factors multiply.
- **Level 3:** Why was the ratio 5.91 on the L4 and 4.77 on the GB10 for the same change? Expected: on the 24 GB card the weights took most of the memory, so halving them more than doubled the pool bytes; on the GB10 the weights were a smaller share, so the freed memory mattered less.
- **Level 4:** Both servers returned an identical 12-token answer to the first request at temperature 0. Is that an accuracy check? Expected: no, one prompt proves nothing; run a benchmark such as the 500-question GSM8K set and compare the intervals, and read the scale warning, because this checkpoint has weight scales and no KV scales, so the cache ran with a scale of 1.0.

**Wrong answers, and why they fail**

- "FP8 halves the bytes, so the pool doubles." The weights also shrank from 57.75 to 29.75 GB and that memory went to the pool, so the pool grew 4.77 times on the GB10 and 5.91 times on the L4.
- "The FP8 checkpoint has scales, so the KV cache is calibrated." Its weight index lists weight scales and no KV scales; the server logged that it used a scale of 1.0 for the cache.
- "Pass --quantization fp8 so that the server knows." SGLang detected the checkpoint by itself, and a flag that does not match the checkpoint raises at startup; pass no flag for a published checkpoint.
- "The speedup comes from the bigger pool." The BF16 pool on the GB10 was never short; the speed came from half the weight bytes per decode step on a memory with modest bandwidth, 1.73 to 1.88 times at every concurrency.

**Related lesson in this course:** [GPUs, memory and the systems foundation](#aiinfra-1)

:::

## Eight copies of the same KV cache

*Level 4 (staff) · concept · about 10 minutes*

A teammate serves a model that uses latent attention (MLA) on eight GPUs with `--tp-size 8` and asks why the server holds so few KV tokens on 640 GB of memory. Explain how a tensor-parallel split treats that cache, what the attention-group mode changes, and what it changes without a flag of its own.

:::answer Show the answer
:::say Short answer
Latent attention stores one compressed latent per token and layer, about 68.6 KiB for the 61-layer model, and tensor parallelism cannot split one head across GPUs, so every one of the 8 ranks stores the full cache for every token: eight copies and no more tokens. Attention data parallelism runs the attention layers data parallel inside the tensor group, each group with its own scheduler, requests and KV cache, while the expert layers stay split across all GPUs, so the KV capacity grows with the number of groups; `--attn-dp-size 8` with `--tp-size 8` is the layout for these models. It also divides the chunked prefill size by the group count and multiplies the schedule conservativeness by 0.3, so a chunk tuned on one GPU becomes smaller and admission grows bolder.
:::

**Full answer**

**One world, many ways to split it**

The model world is the set of GPUs that hold one copy of the model, and SGLang builds it from two numbers only: the world size must equal `--tp-size` times `--pp-size`. Attention data parallelism, expert parallelism and context parallelism do not add GPUs. They regroup the GPUs of the tensor group differently for different layers. Every one of these flags defaults to 1.

**Two meanings of data parallel**

Data parallelism with `--dp-size` means several complete copies of the model, each with its own requests and KV cache, behind a controller that sends each request to one copy, round robin by default. Attention data parallelism with `--attn-dp-size` means that inside one tensor group the attention layers run data parallel while the feed-forward or expert layers stay split across all GPUs; `--attn-dp-size 4` with `--tp-size 8` gives four attention groups of two GPUs each.

Before v0.5.22 one flag carried both meanings: `--dp-size` counted copies unless `--enable-dp-attention` was set, when it counted attention groups. The change merged on 2026-09-30 gave the reason in one sentence: the flag meant two different things and every reader had to look at both flags to know which. At the pinned version `--dp-size 8 --enable-dp-attention` is rewritten to `--attn-dp-size 8 --dp-size 1` with a deprecation warning, `--dp-size 2 --attn-dp-size 4` raises an error because copies combined with attention groups are not supported, and a code comment says to remove the old flag after 2026-12-31. Many recipes on the web still use the old spelling.

**Why attention gets its own mode**

Latent attention stores one compressed latent per token and layer, one KV head in effect. Tensor parallelism cannot split one head across GPUs, so with `--tp-size 8` every GPU stores the full latent cache for every token, and eight GPUs hold eight copies. With attention data parallelism each group keeps only its own requests, so the KV capacity grows with the groups. The team that added the mode reported up to 1.9 times more decode throughput for these models, which is their claim. For a dense model with grouped-query attention the reason does not hold: it has several KV heads, and tensor parallelism splits its cache without copies while the tensor size is at most the number of KV heads. Above that count, each KV head is copied to more than one rank.

**Two side effects**

Turning on attention data parallelism changes two other settings. The chunked prefill size is divided by the group count, so a chunk of 8192 tuned on one GPU becomes 1024 with eight groups, and the log prints the old and the new value; long prompts then take more scheduler steps. The schedule conservativeness is multiplied by 0.3, so the scheduler admits new requests with a smaller reservation for their future tokens.

**Field data points**

A student team tuning a latent-attention model for a competition got about 5.9k tokens per second offline with plain 16-way tensor parallelism, and 17,417 tokens per second with a layout of tensor 4, data 4, pipeline 2 and attention data parallelism on one node; read it as one data point, because their write-up explains the memory fraction incorrectly. A production deployment of the same model family runs decode on two nodes with 16 attention groups and 16-way expert parallelism. Watch `sglang:dp_attention_token_imbalance_ratio`, the busiest group's tokens over the average, where 1.0 means balanced.

**The position**

Use tensor parallelism to make the model fit and nothing more. Add capacity with copies, inside one server or behind a gateway, with equal pools. Set the attention group count equal to the tensor size for latent-attention expert models, and leave it at 1 for dense grouped-query models.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the same server with a grouped-query dense model not need the attention groups? Expected: that model has several KV heads, so tensor parallelism splits the cache across ranks without copies, as long as there are at least as many KV heads as ranks; the copy problem exists only when the attention keeps one latent that cannot be split.
- **Level 4:** A recipe from last year passes the old copy flag together with the attention flag. What happens at the pinned version, and what do you write instead? Expected: the server rewrites it to --attn-dp-size with --dp-size 1 and prints a deprecation warning, with the old flag due for removal after the end of 2026; write --attn-dp-size, and know that copies combined with attention groups raise an error.
- **Level 4:** A team tuned the first token with a chunk of 8192 and then turned on eight attention groups. Why did long prompts get slower? Expected: the chunk size is divided by the group count, so each group now prefills in chunks of 1024 and a long prompt takes more scheduler steps; the log prints the old and new values, and the admission ratio was also multiplied by 0.3.

**Wrong answers, and why they fail**

- "Eight GPUs give eight times the KV capacity." Under tensor parallelism with latent attention every rank stores the full cache, so eight GPUs hold eight copies and the capacity of one; attention data parallelism is what grows it with the groups.
- "--dp-size 8 means eight attention groups." At the pinned version --dp-size counts model copies; attention groups are --attn-dp-size, and the old spelling with the extra flag is rewritten with a warning until it is removed.
- "Attention data parallelism only changes the attention layers." It also divides the chunked prefill size by the group count and multiplies the schedule conservativeness by 0.3, so the first token and admission both change.
- "Use it on every model for more capacity." For a dense grouped-query model tensor parallelism already splits the cache without copies; the manual's position is attention groups equal to the tensor size for latent-attention expert models only.

**Related lesson in this course:** [Parallelism and distributed inference](#aiinfra-5)

:::
