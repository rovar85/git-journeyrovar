---
track: aibank
title: "AI incident scenarios, read the evidence (part 5 of 10)"
short: Incidents 5
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## Six steps in, is the run learning

*Level 2 · incident · about 20 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

A GRPO run on GSM8K is six steps old. A teammate posts the reward of each step as the log printed it: 0.62890625, 0.59375, 0.7578125, 0.69140625, 0.58984375, 0.5859375. The last three fell. He says the model is getting worse, wants to stop the run, and wants to halve the learning rate before the next start.

A second teammate opens the step 0 line and finds that the loss and the advantages are so close to zero that the log prints them in scientific notation. She concludes that no training happens at all and that the run is a waste of a GPU. You pull the log again a little later, when ten steps have finished, together with the three lines that the first step wrote.

**Evidence: the reward of the first ten steps**

```text
title: the reward of the first ten steps
source: manuals/miles-101/capture/gpu/out-gb10/read-steps.txt
lines: 1-11
lang: text
note: One line is one step. Read the spread before you read a trend.
---
$ grep -o "'rollout/raw_reward': [0-9.]*" plain.log | head -10
'rollout/raw_reward': 0.62890625
'rollout/raw_reward': 0.59375
'rollout/raw_reward': 0.7578125
'rollout/raw_reward': 0.69140625
'rollout/raw_reward': 0.58984375
'rollout/raw_reward': 0.5859375
'rollout/raw_reward': 0.6875
'rollout/raw_reward': 0.67578125
'rollout/raw_reward': 0.74609375
'rollout/raw_reward': 0.6484375

```

**Evidence: the log probability gap of the first ten steps**

```text
title: the log probability gap of the first ten steps
source: manuals/miles-101/capture/gpu/out-gb10/read-steps.txt
lines: 12-22
lang: text
note: The same ten steps. Read the lowest and the highest value.
---
$ grep -o "'train/train_rollout_logprob_abs_diff': [0-9.]*" plain.log | head -10
'train/train_rollout_logprob_abs_diff': 0.015336457639932632
'train/train_rollout_logprob_abs_diff': 0.01610221341252327
'train/train_rollout_logprob_abs_diff': 0.014312651939690113
'train/train_rollout_logprob_abs_diff': 0.015629252418875694
'train/train_rollout_logprob_abs_diff': 0.015349497087299824
'train/train_rollout_logprob_abs_diff': 0.01628461480140686
'train/train_rollout_logprob_abs_diff': 0.014715931378304958
'train/train_rollout_logprob_abs_diff': 0.015263394452631474
'train/train_rollout_logprob_abs_diff': 0.01513341348618269
'train/train_rollout_logprob_abs_diff': 0.016122153028845787

```

**Evidence: the perf line of the first rollout**

```text
title: the perf line of the first rollout
source: manuals/miles-101/capture/gpu/out-gb10/plain-first-step.log
lines: 4-4
lang: text
note: Read the answer lengths, the zero_std counts, the truncated ratio and the rollout time.
---
(RolloutExecutor pid=2545) [2026-10-17 15:56:15.547 rollout_executor] metrics.py:94 - perf 0: {'rollout/raw_reward_unfiltered': 0.62890625, 'rollout/num_training_samples': 256, 'rollout/episode_raw_reward': 0.62890625, 'rollout/episode_response_length/mean': 739.92578125, 'rollout/episode_response_length/median': 759.5, 'rollout/episode_response_length/max': 1024, 'rollout/episode_response_length/min': 259, 'rollout/episode_total_response_length/mean': 739.92578125, 'rollout/response_len/mean': 739.92578125, 'rollout/response_len/median': 759.5, 'rollout/response_len/max': 1024, 'rollout/response_len/min': 259, 'rollout/zero_std/count_1': 7, 'rollout/zero_std/count_0': 3, 'rollout/zero_std/all_zero_percentage': 0.09375, 'rollout/zero_std/all_one_percentage': 0.21875, 'rollout/prefix_cache_hit_rate': 0.24518696778970753, 'rollout/avg_cached_tokens_per_sample': 20.6953125, 'rollout/repetition_frac': 0.0, 'rollout/truncated_ratio': 0.3203125, 'rollout/weight_version/mean': 1.0, 'rollout/weight_version/median': 1.0, 'rollout/weight_version/max': 1, 'rollout/weight_version/min': 1, 'rollout/weight_version/mixed_version_ratio': 0.0, 'perf/rollout_time': 61.951833724975586, 'perf/tokens_per_gpu_per_sec': 3057.5527568869334, 'perf/longest_sample_tokens_per_sec': 16.52896998248462, 'perf/effective_tokens_per_gpu_per_sec': 3057.5527568869334, 'perf/longest_effective_sample_tokens_per_sec': 16.52896998248462}

```

**Evidence: the rollout 0 line of the trainer**

```text
title: the rollout 0 line of the trainer
source: manuals/miles-101/capture/gpu/out-gb10/plain-first-step.log
lines: 5-5
lang: text
note: Read the truncated share, the centered rewards and the advantages.
---
(FSDPTrainRayActor pid=2551) [2026-10-17 15:56:48.271 actor_cell00000_rank00000] log_utils.py:125 - rollout 0: {'rollout/response_lengths': 739.92578125, 'rollout/rewards': -1.6298145055770874e-09, 'rollout/truncated': 0.3203125, 'rollout/rollout_log_probs': -0.42945602536201477, 'rollout/raw_reward': 0.62890625, 'rollout/total_lengths': 824.33203125, 'rollout/log_probs': -0.43026646971702576, 'rollout/entropy': 0.43224966526031494, 'rollout/advantages': 4.656612873077393e-10, 'rollout/returns': 4.656612873077393e-10}

```

**Evidence: the step 0 line of the trainer**

```text
title: the step 0 line of the trainer
source: manuals/miles-101/capture/gpu/out-gb10/plain-first-step.log
lines: 6-6
lang: text
note: Read the loss, the clip fraction, the ppo_kl, the gap, the KL and the gradient norm.
---
(FSDPTrainRayActor pid=2551) [2026-10-17 15:58:15.687 actor_cell00000_rank00000] log_utils.py:554 - step 0: {'train/loss': -4.656612873077393e-10, 'train/pg_loss': -4.656612873077393e-10, 'train/entropy_loss': 0.0, 'train/pg_clipfrac': 0.0, 'train/ppo_kl': 0.0, 'train/ess_ratio': 1.0, 'train/train_rollout_logprob_abs_diff': 0.015336457639932632, 'train/train_rollout_kl': 0.0006840902497060597, 'train/grad_norm': 0.5216571092605591, 'train/lr-pg_0': 1e-06, 'train/step': 0}

```

**Evidence: the healthy ranges of five numbers over the first ten steps of three seeds**

```text
title: the healthy ranges of five numbers over the first ten steps of three seeds
source: manuals/miles-101/sections/1-3-read-your-first-ten-steps.md
lines: 41-47
lang: text
note: Each row names the log field and its range.
---
| Metric | Log name | Healthy range in steps 0 to 9 | What it tells you |
|---|---|---|---|
| reward | `rollout/raw_reward` | 0.53 to 0.74, mean 0.62 to 0.65 per seed | the share of correct answers |
| answer length | `rollout/response_lengths` | 626 to 787 tokens | how long the model talks |
| cut share | `rollout/truncated` | 0.19 to 0.43 | the share of answers that hit the 1,024-token limit |
| log probability gap | `train/train_rollout_logprob_abs_diff` | 0.0141 to 0.0164 | how far the trainer and the engine disagree on the same tokens |
| KL between trainer and engine | `train/train_rollout_kl` | 0.00063 to 0.00075 | the same disagreement, as a distance between two probability distributions |

```

**Evidence: the signs of a broken run**

```text
title: the signs of a broken run
source: manuals/miles-101/sections/1-3-read-your-first-ten-steps.md
lines: 75-80
lang: text
note: Four rows, each with the meaning and the page to go to.
---
| What you see | What it means | Where to go |
|---|---|---|
| no step lines after ten minutes | the engine or the trainer did not start | [section 7.1](#s-troubleshoot-by-symptom) |
| `503 Service Unavailable` lines that do not stop for minutes | the rollout engine died. Short bursts of a minute or less can come from a healthy engine | [section 1.2](#s-add-a-watchdog) |
| the log probability gap grows step after step | the trainer and the engine hold different weights | [section 5.2](#s-check-the-first-step) |
| the reward stays flat and many groups score the same | most groups give no learning signal | [section 3.1](#s-train-math-on-gsm8k) |

```

**Questions**

1. Three falling steps in a row. How large is a normal move between two steps on this setup, and over how many steps do you read the reward?
2. The gap between the engine and the trainer: what is its range over the ten steps, and what would a different shape of that series mean?
3. Why are the centered rewards and the advantages of the first rollout near zero, and what number on the same line is the real signal?
4. The step 0 loss is near zero, the clip fraction is 0 and the ppo_kl is 0. Which of those three are expected at step 0, and which number proves that a gradient exists?
5. How many of the 32 groups gave no learning signal in the first rollout, and how do you read that count?
6. Write the rule that decides, at any step, whether this run stops.

:::answer Show the answer
:::say Short answer
The run is healthy on every number that the manual asks you to read, and it stays on. The reward over ten steps sits in the range of the three healthy seeds, the gap is flat and in range, the cut share is in range, the gradient norm is in range, and the two step-0 values that must be zero are zero. The near-zero loss and advantages are what centering does, not a sign of a dead run.
:::

**Walkthrough**

1. **Read all ten rewards, not six.** The ten values run from 0.5859375 to 0.7578125, and the four steps after the posted six are 0.6875, 0.67578125, 0.74609375 and 0.6484375. The manual measured steps 0 to 9 of three seeds of this recipe: rewards from 0.53 to 0.74, with a per-seed mean of 0.62 to 0.65, and moves of up to 0.14 from one step to the next. The fall after step 2 is a move of that size, and the three steps that fell are followed by four that did not. The manual's rule is to read the mean over five or more steps, never one step.
2. **Read the gap.** The ten values of `train/train_rollout_logprob_abs_diff` run from 0.014312651939690113 to 0.01628461480140686, inside the manual's range of 0.0141 to 0.0164 for steps 0 to 9. The series is flat. A gap that grows step after step would mean that the two sides hold different weights, which is the one shape that stops a run at once.
3. **Read the first perf line.** The answers had a mean length of 739.92578125 tokens and a median of 759.5, with the longest at the limit of 1024 and the shortest at 259. The field `rollout/truncated_ratio` is 0.3203125, so about a third of the answers hit the cap, inside the range of 0.19 to 0.43. The fields `rollout/zero_std/count_1` and `rollout/zero_std/count_0` are 7 and 3: ten of the 32 groups had every answer right or every answer wrong. Those groups teach nothing. The rest do.
4. **Read the rollout 0 line.** `rollout/rewards` is about minus one point six times ten to the minus nine and `rollout/advantages` is about four point seven times ten to the minus ten. GRPO subtracts the mean reward of each group from each answer, so the mean of the centered rewards is zero by construction, and the advantages are centered the same way. The signal on that line is `rollout/raw_reward`, 0.62890625, the share of correct answers before centering.
5. **Read the step 0 line.** `train/loss` is near zero for the same reason, because the advantages sum to zero across the batch. `train/pg_clipfrac` is 0.0 and `train/ppo_kl` is 0.0, and both must be 0 at step 0, because nothing can be clipped and the old and new probabilities are the same before the first update. `train/grad_norm` is 0.5216571092605591, inside the range of 0.35 to 4.95 over the whole run. That is the gradient. The gap on this line, 0.015336457639932632, sits inside the step-0 range of 0.0148 to 0.0157 that the manual recorded over 17 runs of this model.
6. **Check the four signs of a broken run.** Step lines appear, so both processes started. No run of `503 Service Unavailable` lines goes on for minutes. The gap does not grow. The reward is not flat, and most of the 32 groups score with a spread. None of the four signs is present.

**Resolution**

The run is healthy on every number that the manual asks you to read, and it stays on. The reward over ten steps sits in the range of the three healthy seeds, the gap is flat and in range, the cut share is in range, the gradient norm is in range, and the two step-0 values that must be zero are zero. The near-zero loss and advantages are what centering does, not a sign of a dead run.

The rule for stopping is the table of signs, not the last three rewards: stop when no step line appears within ten minutes, when the error lines do not stop for minutes, when the gap grows step after step, or when the reward stays flat while most groups score the same. For the trend, read means over five or more steps, and expect what the three seeds of the longer run showed: the reward rose, the answers got shorter, from about 720 to about 460 tokens, and the gap stayed flat.

**Wrong turns**

- "Three falling steps, halve the learning rate." A move of up to 0.14 between two steps is normal on this setup, and the gradient norm sits in its range. A learning rate change now answers noise with a new variable, and the next run cannot be compared with this one.
- "The loss is zero, so nothing trains." The advantages are centered in each group and sum to zero, which puts the loss near zero by construction. The gradient norm of 0.5216571092605591 is the proof that an update happened.
- "A third of the answers are cut, raise the length limit." The cut share of 0.3203125 is inside 0.19 to 0.43, and it falls on its own as the model learns shorter answers. A higher limit makes every rollout slower.
- "Ten groups out of 32 give no signal, so the data is wrong for this model." Those groups cost rollout time and teach nothing, and the rest still teach. The sign to act on is a flat reward with most groups the same, and the reward here is not flat.

**Generalize**

One number read at one step tells you almost nothing, and the number that everyone reads first, the reward, is the slowest to show a fault. Build a short list of signals with a healthy range for each, from your own seeds, and read them together before you touch a run. Know which values are zero by construction, so that a zero does not look like a dead run, and decide a stop from a sign of breakage, never from a dip.

:::

## Startup out of memory on a shared GPU

*Level 2 · incident · about 15 minutes · version: vLLM 0.31.0; model: Qwen/Qwen3-8B; hardware: the shared second L4 of a two-GPU node, with another team's processes on it*

An on-call engineer deploys `Qwen/Qwen3-8B` with vLLM on the second L4 of a node. Another team runs its pods on that GPU and holds part of its memory. The server stops before it prints the KV cache size line, and the log ends with a `ValueError` that names a maximum of 40,960 tokens.

A colleague has seen the error before and sets two flags: `--gpu-memory-utilization 0.83`, to stay under the memory that the other team uses, and `--max-model-len 2928`, which matches the pool of 2,928 tokens that they want for a test. The server fails again, with almost the same message. The engineer now wants to raise the memory fraction to 0.95 and try once more.

**Evidence: the first start, with the default maximum model length**

```text
title: the first start, with the default maximum model length
source: manuals/vllm-101/capture/gpu/out-l4/livecheck-2026-10-22.txt
lines: 105-110
lang: text
note: Read the three sizes in the error: the length, the cache it needs and the cache that is free.
---
== c18 Qwen3-8B BF16, no max-model-len
rc=1
(EngineCore pid=2870799) ERROR 10-22 21:45:27 [core.py:1433]     raise ValueError(
(EngineCore pid=2870799) ERROR 10-22 21:45:27 [core.py:1433] ValueError: To serve at least one request with the model's max seq len (40960), (5.62 GiB KV cache is needed, which is larger than the available KV cache memory (1.01 GiB). Based on the available memory, the estimated maximum model length is 7360. Try increasing `gpu_m
    raise ValueError(
ValueError: To serve at least one request with the model's max seq len (40960), (5.62 GiB KV cache is needed, which is larger than the available KV cache memory (1.01 GiB). Based on the available memory, the estimated maximum model length is 7360. Try increasing `gpu_memory_utilization` (which also controls CPU memory on the CPU

```

**Evidence: the second start, with the maximum length set to the pool size**

```text
title: the second start, with the maximum length set to the pool size
source: manuals/vllm-101/capture/gpu/incidents/l4-gpu1-vllm-maxlen-oom.txt
lines: 1-2
lang: text
note: The first line gives the three settings, the second line gives the length that would fit.
---
(APIServer pid=3681321) INFO 10-22 00:35:04 [api_utils.py:286] non-default args: {'model_tag': 'Qwen/Qwen3-8B', 'host': '127.0.0.1', 'port': 30100, 'model': 'Qwen/Qwen3-8B', 'max_model_len': 2928, 'gpu_memory_utilization': 0.83, 'num_gpu_blocks_override': 183}
(EngineCore pid=3682071) ERROR 10-22 00:36:18 [core.py:1433] ValueError: To serve at least one request with the model's max seq len (2928), (0.4 GiB KV cache is needed, which is larger than the available KV cache memory (0.4 GiB). Based on the available memory, the estimated maximum model length is 2912. Try increasing `gpu_memory_utilization` (which also controls CPU memory on the CPU backend) or decreasing `max_mod

```

**Evidence: a start on the same shared GPU that reached the pool line**

```text
title: a start on the same shared GPU that reached the pool line
source: manuals/vllm-101/capture/gpu/out-l4/livecheck-2026-10-22.txt
lines: 6-13
lang: text
note: Read the memory fraction in the first line, then the two memory lines near the end.
---
== c01 startup lines
(APIServer pid=2812801) INFO 10-22 21:24:23 [api_utils.py:286] non-default args: {'model_tag': 'Qwen/Qwen3-0.6B', 'port': 8010, 'reasoning_parser': 'qwen3', 'gpu_memory_utilization': 0.5}
(EngineCore pid=2813854) INFO 10-22 21:24:39 [gpu_worker.py:479] Using V2 Model Runner
(EngineCore pid=2813854) INFO 10-22 21:24:41 [cuda.py:526] Using FLASH_ATTN attention backend out of potential backends: ['FLASH_ATTN', 'FLASHINFER', 'TRITON_ATTN', 'FLEX_ATTENTION'].
(EngineCore pid=2813854) INFO 10-22 21:24:43 [model_runner.py:407] Model loading took 1.12 GiB memory and 3.909338 seconds
(EngineCore pid=2813854) INFO 10-22 21:25:26 [gpu_worker.py:692] Available KV cache memory: 9.02 GiB
(EngineCore pid=2813854) INFO 10-22 21:25:26 [kv_cache_utils.py:2464] GPU KV cache size: 84,480 tokens, Maximum concurrency for 40,960 tokens per request: 2.06x
INFO:     Application startup complete.

```

**Evidence: the three startup failures and the flag for each**

```text
title: the three startup failures and the flag for each
source: manuals/vllm-101/sections/2-2-fix-out-of-memory-at-startup.md
lines: 22-26
lang: text
note: Match the error text of each failed start with a row.
---
| What the log says | Cause | Fix |
|---|---|---|
| The KV cache needed for one request at the maximum length is larger than the available KV cache memory | The weights and the profile leave too little for one full-length request | Lower `--max-model-len`. The error gives the largest length that fits. |
| The free memory on the device is less than the desired GPU memory utilization | Another process holds GPU memory | Lower `--gpu-memory-utilization` below the free share, or stop the other process |
| CUDA out of memory during the profile run or the graph capture | The batch in the profile pass or the graphs need more memory than is left | Lower `--max-num-seqs` or `--max-num-batched-tokens`, or lower `--max-cudagraph-capture-size` |

```

**Questions**

1. The error names 40,960 tokens. Where does that number come from, and why does one request at that length decide whether the server starts?
2. The second attempt set the maximum length to the pool size and missed by 16 tokens. Explain the arithmetic that the error line shows.
3. On a shared GPU, what does the memory fraction describe, and why is raising it the wrong first move?
4. Which startup line proves that a fix worked, and what do you compare it with?
5. Put the three flags in the order you would change them, and name the log text that points to each.

:::answer Show the answer
:::say Short answer
The fix was one flag, read from the error. We set `--max-model-len 2048`, which covers our 640-token requests, and the server started. Later we raised it to 2,304 tokens so that tests with 2,048-token prefixes fit. On a shared GPU the fraction and the maximum length work together, and the maximum length is the one to lower first, down to the longest request that the service really sends.
:::

**Walkthrough**

Read the first error from the end. vLLM must be able to serve at least one request at the model's maximum sequence length. For this model that length is 40,960 tokens, taken from the model config when nobody sets `--max-model-len`. One request of that length needs 5.62 GiB of KV cache, and after the weights and the startup profile only 1.01 GiB was free on this shared card. The message even computes the answer: the estimated maximum model length is 7,360 tokens. The server did not fail because the GPU is too small for the model. It failed because the default length is far longer than any request the service will send.

The second error is the same check with a different margin. The settings line shows `max_model_len` at 2,928, the fraction at 0.83 and a block override of 183 blocks of 16 tokens, which is 2,928 tokens. The check compares one request of the maximum length with the KV cache memory that the profile left, and that memory holds only 2,912 tokens. Both sides print as 0.4 GiB, so the check failed by a hair. A length equal to the pool that you want does not help when the profile leaves less memory than that pool.

The third listing is what success looks like on the same card. A smaller model started with a fraction of 0.5, loaded 1.12 GiB of weights, and printed the two lines that matter: `Available KV cache memory: 9.02 GiB` and `GPU KV cache size: 84,480 tokens`, with the maximum concurrency for the default length at 2.06 times. Those two lines are the proof that a start reached the pool. The last listing maps the three errors to three flags. An error about the maximum sequence length points at `--max-model-len`. An error that the free memory is below the desired utilization points at `--gpu-memory-utilization`, or at the other process. A CUDA out of memory during the profile or the graph capture points at the batch limits or the graph capture size.

**Resolution**

The fix was one flag, read from the error. We set `--max-model-len 2048`, which covers our 640-token requests, and the server started. Later we raised it to 2,304 tokens so that tests with 2,048-token prefixes fit. On a shared GPU the fraction and the maximum length work together, and the maximum length is the one to lower first, down to the longest request that the service really sends.

Raising the fraction to 0.95 would have been wrong twice over. The fraction is a limit for one vLLM instance on the whole GPU memory, not a share of what is free when the server starts, so a higher fraction on a shared card claims memory that another tenant already holds. And the first error asked for 5.62 GiB for a length that no request needs. When two instances must share one GPU with a known pool each, set the cache in bytes with `--kv-cache-memory-bytes` instead. After every change, start the server with `tee` on the log and grep for `GPU KV cache size`, then compare the pool with the count from the memory page.

**Wrong turns**

- "Raise the memory fraction until it starts." The fraction is a share of the whole GPU, not of the free memory. On a shared card a higher fraction claims memory that another process holds, and the start can fail later in the profile or the other team's job can fail instead.
- "The GPU is too small for an 8B model." The weights loaded. The check that failed was for one request of 40,960 tokens, and the message said that 7,360 tokens would fit.
- "Set the maximum length equal to the pool." The second start did that and missed by 16 tokens. The pool is counted in blocks of 16, and the length check needs a little margin.
- "Use the blocks override in production to force the pool." The override does not check that the memory exists. It is a test flag, and on a shared card it fails at the first request that needs the memory.

**Generalize**

A startup check that fails on a limit is a question about your traffic, not about your hardware. Read the number in the error, ask which setting put it there and what the real requests need, and change that setting first. On any shared machine, a fraction of total memory is a promise that the other tenants did not make, so prefer limits that name the exact bytes you want.

:::

## The draft that declared 2,048 positions

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-30B-A3B-Instruct-2507 with the lmsys/SGLang-EAGLE3-Qwen3-30B-A3B-Instruct-2507-SpecForge-Nex draft, and Qwen/Qwen3-8B with the Tengyunw/qwen3_8b_eagle3 draft; hardware: one GB10 with unified memory, and one L4 as the second machine*

A team adds EAGLE-3 speculation to its mixture-of-experts server on a GB10. They take the draft model and the shape from the cookbook: three steps, a top-k of one, four draft tokens. The start fails inside the draft worker with a `ValueError` about two context lengths, and the scheduler child exits.

Earlier the same day a colleague turned on the same feature for the dense 8B model on an L4, with its own trained draft, and the server came up without any change. The team concludes that the draft published for the 30B model is defective and prepares an issue for its authors, with a request for a new draft. You are asked to look at the two logs before the issue goes out.

**Evidence: the end of the traceback of the refused start**

```text
title: the end of the traceback of the refused start
source: manuals/sglang-101/capture/gpu/out-gb10/server-eagle3-no-env.log
lines: 44-50
lang: text
note: Read the two context lengths in the ValueError and the last sentence of the message.
---
  File "/home/rohit/sglang-lab/.venv/lib/python3.12/site-packages/sglang/srt/configs/model_config.py", line 794, in __init__
    self._derive_context_length(context_length)
  File "/home/rohit/sglang-lab/.venv/lib/python3.12/site-packages/sglang/srt/configs/model_config.py", line 1205, in _derive_context_length
    raise ValueError(
ValueError: Warning: Target model's context_length (262144) is greater than the derived context_length (2048). This may lead to incorrect model outputs or CUDA errors. Note that the derived context_length may differ from max_position_embeddings in the model's config. To allow overriding this maximum, set the env var SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN=1

[2026-10-17 15:31:03] Received sigquit from a child process. It usually means the child failed.

```

**Evidence: the 8B target and its draft on an L4, with no override**

```text
title: the 8B target and its draft on an L4, with no override
source: manuals/sglang-101/capture/gpu/out-l4/server-eagle3-no-env.log
lines: 27-30
lang: text
note: Read the draft type, the available memory after it, and the pool.
---
[2026-10-17 03:40:58] Load weight end. elapsed=0.67 s, type=LlamaForCausalLMEagle3, avail mem=4.50 GB, mem usage=1.90 GB.
[2026-10-17 03:40:59] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 8827, K size: 0.61 GB, V size: 0.61 GB
[2026-10-17 03:40:59] Memory pool end. avail mem=3.22 GB
[2026-10-17 03:40:59] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 8827, K size: 0.02 GB, V size: 0.02 GB

```

**Evidence: the settings line of the L4 start**

```text
title: the settings line of the L4 start
source: manuals/sglang-101/capture/gpu/out-l4/server-eagle3-no-env.log
lines: 47-47
lang: text
note: Read context_len and max_running_requests.
---
[2026-10-17 03:41:40] max_total_num_tokens=8827, chunked_prefill_size=4096, max_prefill_tokens=16384, max_running_requests=48, context_len=40960, available_gpu_mem=1.19 GB

```

**Evidence: the command of the start that worked**

```text
title: the command of the start that worked
source: manuals/sglang-101/capture/gpu/out-gb10/server-eagle3.command.txt
lang: bash
note: Compare the first word with the end of the ValueError.
---
SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN=1 sglang serve --model-path Qwen/Qwen3-30B-A3B-Instruct-2507 --host 127.0.0.1 --port 30000 --enable-cache-report --enable-metrics --mem-fraction-static 0.7 --speculative-algorithm EAGLE3 --speculative-draft-model-path lmsys/SGLang-EAGLE3-Qwen3-30B-A3B-Instruct-2507-SpecForge-Nex --speculative-num-steps 3 --speculative-eagle-topk 1 --speculative-num-draft-tokens 4

```

**Evidence: the same check with the override set**

```text
title: the same check with the override set
source: manuals/sglang-101/capture/gpu/out-gb10/server-eagle3.log
lines: 19-21
lang: text
note: The warning stays, and the next line says what the override changed.
---
[2026-10-17 15:20:18] Load weight end. elapsed=312.38 s, type=Qwen3MoeForCausalLM, avail mem=55.96 GB, mem usage=57.49 GB.
[2026-10-17 15:20:19] Warning: Target model's context_length (262144) is greater than the derived context_length (2048). This may lead to incorrect model outputs or CUDA errors. Note that the derived context_length may differ from max_position_embeddings in the model's config.
[2026-10-17 15:20:19] Overriding the draft model's max_position_embeddings to 262144.

```

**Evidence: the two pools of the target and the draft**

```text
title: the two pools of the target and the draft
source: manuals/sglang-101/capture/gpu/out-gb10/server-eagle3.log
lines: 27-29
lang: text
note: The two lines report the same token count with very different sizes.
---
[2026-10-17 15:20:23] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 216775, K size: 9.92 GB, V size: 9.92 GB
[2026-10-17 15:20:23] Memory pool end. avail mem=34.44 GB
[2026-10-17 15:20:23] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 216775, K size: 0.21 GB, V size: 0.21 GB

```

**Evidence: what the override does and does not do**

```text
title: what the override does and does not do
source: manuals/sglang-101/sections/4-4-speculative-decoding.md
lines: 92-94
lang: text
note: Two paragraphs. Read why the L4 start needed no override.
---
The variable only removes the check. It does not teach the draft to read long prompts, which is the failure in issue #6783 below. Our prompts had 512 tokens, so this run says nothing about long contexts.

We expected the same refusal on a 24 GB L4. We started `Qwen/Qwen3-8B` with the draft `Tengyunw/qwen3_8b_eagle3` and no variable, and the server started. That draft declares 40,960 positions, the same as its target, so the check had nothing to refuse. The variable belongs to one draft config, not to EAGLE-3. Compare `max_position_embeddings` in both configs before you set it.

```

**Questions**

1. Which component raised the error, the target or the draft, and which two numbers does the check compare?
2. The L4 pair started with no change. What differs between the two draft configs?
3. The error message names an environment variable. What does setting it change, and what does it leave as it was?
4. Read the pool lines of the start that worked. What did the draft cost in memory, and which request limit did speculation set?
5. The benchmark prompts had 512 tokens. Which incident in the manual shows what a draft with 2,048 positions does on long inputs, and how would you test that before production?

:::answer Show the answer
:::say Short answer
The draft is not defective. Its config declares 2,048 positions, and the context length check refuses that against a 262,144-token target. The cookbook's command sets the variable for this pair, and with it the server started with a target pool of 216,775 tokens, a draft of 1.58 GB, and a cap of 48 running requests. The issue to the draft's authors was not sent.
:::

**Walkthrough**

1. **Read the traceback from the bottom up to the first frame you recognise.** The frames run from the scheduler into `maybe_init_draft_worker`, then into the EAGLE draft worker, then into a model config, and the error is raised in `_derive_context_length`. So the check belongs to the draft's model config. It compares the target's context length, 262144, with the length it derived for the draft, 2048, and refuses because the target is larger. The last sentence of the message names the way out: set `SGLANG_ALLOW_OVERWRITE_LONGER_CONTEXT_LEN=1`.
2. **Compare with the L4 pair.** On the L4 the target loaded with 6.41 GB free, the draft of type `LlamaForCausalLMEagle3` loaded 1.90 GB more, the pool came out at 8,827 tokens, and the settings line reads `context_len=40960`. That draft declares 40,960 positions, the same as its target, so the check had nothing to refuse. The variable belongs to one draft config, not to EAGLE-3. The manual's rule is to compare `max_position_embeddings` in both configs before you set it.
3. **Read the start that worked.** The cookbook command for this pair begins with the variable. With it set, the same warning about 262144 against 2048 still prints, and the next line says what changed: the draft's `max_position_embeddings` is overridden to 262144. The manual is exact about the meaning. The variable only removes the check. It does not teach the draft to read long prompts.
4. **Read what the draft cost.** The target pool holds 216,775 tokens at 9.92 GB each for K and V. The draft has a pool with the same token count at 0.21 GB each, after loading 1.58 GB of weights in 1.30 s. The start also reset `max_running_requests` to 48, the cap that every speculation handler sets when you do not set it yourself. On the L4 the same draft design cut the pool from 24,094 tokens to 8,827, so on a small card the draft takes the memory that the batch needs.
5. **Find the incident that the override hides.** Issue #6783 in the manual's incident list ran a 70B model with EAGLE-3 and a draft config of 2,048 positions and no rope scaling. Acceptance was 3.2 tokens at 1k input, 1.6 at 3k and 1.2 at 10k, and at 10k the server produced 63.9 tokens per second against 102.7 without speculation. Adding rope scaling and 131,072 positions to the draft config fixed it. The manual's GB10 run used 512-token prompts and says that it tells you nothing about long contexts. The test is to read `accept len` on the decode log lines, or `sglang:spec_accept_length` from the metrics, on your own longest prompts, and to compare the time per token with speculation off at the same prompts.

**Resolution**

The draft is not defective. Its config declares 2,048 positions, and the context length check refuses that against a 262,144-token target. The cookbook's command sets the variable for this pair, and with it the server started with a target pool of 216,775 tokens, a draft of 1.58 GB, and a cap of 48 running requests. The issue to the draft's authors was not sent.

The team then treated the variable as a removed check rather than a fix. They measured the acceptance length on their longest prompts with the decode log and the endpoint for metrics, and set `--max-running-requests` themselves from the concurrency where speculation still won in their sweep. If acceptance falls on long prompts the way it did in issue #6783, the next step is a draft config with rope scaling and enough positions, or no speculation for that traffic, not a larger override.

**Wrong turns**

- "The draft model is broken, ask for a new one." The draft loaded and served once the check was removed. A config that declares 2,048 positions is a limit of that draft, not a defect in its weights.
- "Set the variable everywhere EAGLE-3 runs." The L4 draft needed no variable, because its positions matched its target. Set it only for the draft config that needs it, after you compared the two configs.
- "The override fixed it, so long prompts are fine." The override removes a check. In issue #6783 a draft with 2,048 positions fell to 1.2 accepted tokens at 10k input and made the server slower than no speculation.
- "Lower the target's context length to 2048 so the check passes." That caps every request at the draft's limit and gives up the long contexts the 30B model was chosen for. Fix the draft config or test the limit instead.

**Generalize**

A refusal at startup is a contract check between two components, and the fastest way out is to turn the check off. Before you do, read what each side declared and what the check protects. An override that removes a check leaves the mismatch in place, so the measurement that the check stood in for, here the acceptance length on long prompts, becomes your job. Compare the two configs, remove the check only for the pair that needs it, and measure what it guarded.

:::

## The key in the log was a placeholder

*Level 2 · incident · about 20 minutes · version: sbx v0.47.0; model: none; shell commands inside the sandbox; hardware: one Mac with the microVM runtime*

A security reviewer reads the transcript of a sandboxed agent session. The agent was asked to debug a failing request, so it ran `env` and printed its environment into the log that the team shares. One line reads `M101_RECV_KEY=sbx-cs-<rand>`, where the capture masks the random part. The reviewer files a ticket: the agent holds a credential in plain text, the value sits in a shared log, rotate it now.

The platform engineer disagrees and says the value is not a secret. Nobody can show why. You get the printed lines, the record of the secret in the store, four requests sent from inside the same sandbox, and the log kept by the host receiver that those requests reached.

**Evidence: the two custom lines of the environment inside m101-secret**

```text
title: the two custom lines of the environment inside m101-secret
source: manuals/docker-sandboxes-101/capture/out/10-env-sentinel.txt
lines: 4-5
lang: console
note: The value of M101_RECV_KEY is the only one that is not the word proxy-managed.
---
M101_RECV_KEY=sbx-cs-<rand>
MCP_SENTINEL_TOKEN_NAME=proxy-managed

```

**Evidence: a custom secret with a chosen placeholder prefix**

```text
title: a custom secret with a chosen placeholder prefix
source: manuals/docker-sandboxes-101/capture/out/10-placeholder.txt
lines: 1-5
lang: console
note: The third line says what is saved and for which target.
---
$ sbx secret set-custom --host api.example.test --env M101_NAMED --placeholder 'sk-{rand}' --value m101-dummy-1111
Applied secret updates for <n> running sandbox(es)
Saved custom secret placeholder "sk-<rand>" for target "api.example.test" env "M101_NAMED" in scope "(global)"
You may need to update environment variable M101_NAMED inside existing sandboxes to "sk-<rand>" (the placeholder value).
[exit 0]

```

**Evidence: the record of M101_RECV_KEY in sbx secret ls**

```text
title: the record of M101_RECV_KEY in sbx secret ls
source: manuals/docker-sandboxes-101/capture/out/10-placeholder.txt
lines: 20-29
lang: json
note: Compare the placeholder field with the masked secret field.
---
    {
      "scope": "global",
      "targets": [
        "host.docker.internal",
        "localhost"
      ],
      "env": "M101_RECV_KEY",
      "placeholder": "sbx-cs-<rand>",
      "secret": "m101-d**************0000"
    }

```

**Evidence: four requests from the sandbox that carry the placeholder**

```text
title: four requests from the sandbox that carry the placeholder
source: manuals/docker-sandboxes-101/capture/out/10-swap-curl.txt
lang: console
note: Three go to the bound host and one to another name; read the status code of each.
---
$ sbx exec m101-secret sh -c 'curl -sS --max-time 10 -H "Authorization: Bearer $M101_RECV_KEY" -H "X-Demo: $M101_RECV_KEY" -o /dev/null -w '"'"'%{http_code}\n'"'"' http://host.docker.internal:18080/from-variable'
204
[exit 0]

$ sbx exec m101-secret sh -c 'curl -sS --max-time 10 -H '"'"'Authorization: Bearer sbx-cs-<rand>'"'"' -H '"'"'X-Demo: sbx-cs-<rand>'"'"' -o /dev/null -w '"'"'%{http_code}\n'"'"' http://host.docker.internal:18080/from-literal'
204
[exit 0]

$ sbx exec m101-secret sh -c 'curl -sS --max-time 10 -H '"'"'Authorization: sbx-cs-<rand>'"'"' -o /dev/null -w '"'"'%{http_code}\n'"'"' http://host.docker.internal:18080/no-scheme'
204
[exit 0]

$ sbx exec m101-secret sh -c 'curl -sS --max-time 10 -H "Authorization: Bearer $M101_RECV_KEY" -o /dev/null -w '"'"'%{http_code}\n'"'"' http://gateway.docker.internal:18080/other-host; echo exit=$?'
curl: (52) Empty reply from server
000
exit=52
[exit 0]

```

**Evidence: the three requests as the receiver on the host saw them**

```text
title: the three requests as the receiver on the host saw them
source: manuals/docker-sandboxes-101/capture/out/10-receiver.log
lang: text
note: Read the Authorization and X-Demo values, and the Host line.
---
GET /from-variable HTTP/1.1
Host: localhost:18080
User-Agent: curl/8.18.0
Accept: */*
Authorization: Bearer m101-dummy-receiver-0000
X-Demo: m101-dummy-receiver-0000
Accept-Encoding: gzip

GET /from-literal HTTP/1.1
Host: localhost:18080
User-Agent: curl/8.18.0
Accept: */*
Authorization: Bearer m101-dummy-receiver-0000
X-Demo: m101-dummy-receiver-0000
Accept-Encoding: gzip

GET /no-scheme HTTP/1.1
Host: localhost:18080
User-Agent: curl/8.18.0
Accept: */*
Authorization: m101-dummy-receiver-0000
Accept-Encoding: gzip

```

**Questions**

1. Is the printed value the credential? What in the store record settles it?
2. The first three requests returned 204. What did the receiver get in each header, and what does that say about where the swap happens?
3. The fourth request got no reply and the code 000. Why, and what does that tell you about a placeholder sent to a host it is not bound to?
4. Which row of the manual's claims ledger does this evidence confirm, and which claim about the proxy stays unchecked?
5. What should the ticket become?

:::answer Show the answer
:::say Short answer
The value in the log is the placeholder of a custom secret, not the credential. The credential stays in the host store. The forward proxy puts it into requests to the two bound hosts only, and the receiver log shows that this is where the real value first exists. A request to any other name carries the placeholder or is blocked. The ticket closes as no leak, with two notes: the placeholder tells a reader that a bound secret exists for those hosts, and the sandbox could reach `localhost:18080` only because a policy rule allowed it, so the receiver was a host the operator chose.
:::

**Walkthrough**

1. **Read the two printed lines.** `M101_RECV_KEY` holds `sbx-cs-<rand>`, and the other custom line holds the word `proxy-managed`. The manual names three sentinel formats in this release: `proxy-managed` for the provider keys, a token-shaped value for the git host, and `sbx-cs-<rand>` for custom secrets. The printed value has the custom shape.
2. **Read how a placeholder is made and stored.** `set-custom` saves a placeholder for a target host and an env name, and with `--placeholder 'sk-{rand}'` the saved value is `sk-<rand>`. The `secret ls` record for `M101_RECV_KEY` has two fields that matter: `placeholder` is `sbx-cs-<rand>`, and `secret` is masked as `m101-d**************0000`. The environment inside the sandbox holds the first field. The second never left the store.
3. **Follow the placeholder to a bound host.** From inside, three requests to `host.docker.internal:18080` returned 204: one with the variable inside `Bearer`, one with the placeholder typed as a literal, and one with the bare value and no scheme. The receiver logged `Bearer m101-dummy-receiver-0000` for the first two, the same value in `X-Demo`, and the bare value as the whole `Authorization` header for the third. The real value appears only on the host side, wherever the placeholder stood. So the swap is a substring replacement in the forward proxy, and it happens for a host that the secret is bound to.
4. **Follow it to another name.** The fourth request went to `gateway.docker.internal:18080`. That name is in `NO_PROXY`, so curl skipped the forward proxy and opened a direct connection. The transparent proxy blocked it: an empty reply, the code 000 and exit 52. Nothing was swapped. A placeholder sent anywhere else stays a placeholder.
5. **Place the result in the ledger.** The manual's claims table marks "credential values never enter the VM" as confirmed by these two files, and the header swap for a bound host as confirmed on both sides. It marks TLS interception as not checked, because no certificate chain was read, and the question of data leaving through an allowed host as disputed, with no capture. Say exactly that much.

**Resolution**

The value in the log is the placeholder of a custom secret, not the credential. The credential stays in the host store. The forward proxy puts it into requests to the two bound hosts only, and the receiver log shows that this is where the real value first exists. A request to any other name carries the placeholder or is blocked. The ticket closes as no leak, with two notes: the placeholder tells a reader that a bound secret exists for those hosts, and the sandbox could reach `localhost:18080` only because a policy rule allowed it, so the receiver was a host the operator chose.

Two checks go into the runbook. For a suspected leak from a sandbox, compare the printed value with the `placeholder` field of `sbx secret ls --json` before anything is rotated. For a new custom secret, bind it to exact hosts and send one request to a receiver you control, so the swap is proven once, as the capture did.

**Wrong turns**

- "Rotate the key and purge the log." Nothing in the log is the key. A rotation costs a change on the host and on the receiver and fixes nothing, and the next transcript shows the same placeholder.
- "The agent read the host keychain." The guest has no path to the store. The swap happens in the proxy on the host, after the request leaves the VM.
- "Pass the real key with -e so the agent can call the API itself." A plain variable is not a secret, and the sentinel exists so that the value never enters the VM. The store and the binding are the supported path.
- "The proxy touches only the Authorization header, so a value in another header is safe." The receiver shows the value in X-Demo too. A custom secret is replaced wherever the placeholder appears in a request to a bound host, so bind it to exact hosts.

**Generalize**

A secret shown by a process inside a boundary is a secret only if the same bytes work outside the boundary. Before you call a leak, find where the value is stored, compare the printed bytes with the stored placeholder, and send the printed bytes to a receiver you control from an intended and from an unintended destination. Then write down what the test proved and what it did not, with the file names.

:::

## The radix cache turned off for predictability

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22, with vLLM 0.31.0 as the second engine; model: Qwen/Qwen3-30B-A3B-Instruct-2507 on the GB10, and Qwen/Qwen3-8B on the L4; hardware: one GB10 with 128 GB of unified memory, and one L4 with 24 GB of memory*

After a benchmark incident in which a warm prefix cache made a loaded server look faster, a platform team writes a new policy: production and benchmarks must agree, so every SGLang server starts with `--disable-radix-cache`, and the vLLM replicas start with `--no-enable-prefix-caching`. The rollout goes out on a Friday.

On Monday a customer whose assistant sends a system prompt of about two thousand tokens with every question reports that the first token now takes several seconds instead of under one, and that the service answers fewer questions per minute at the same user count. The platform team replies that nothing changed in the model or the hardware, and that the new numbers are the "true" ones. You are asked to settle it.

**Evidence: the shared-prefix benchmark: four groups of 16 prompts with one system prompt each**

```text
title: the shared-prefix benchmark: four groups of 16 prompts with one system prompt each
source: manuals/sglang-101/sections/3-3-radixcache.md
lines: 9-11
lang: text
note: Read the second paragraph.
---
## The same workload with and without the tree

The capture kit runs SGLang's own shared-prefix benchmark twice. Four groups of 16 prompts share a 2,048-token system prompt per group, and each prompt adds a 128-token question. The second server starts with `--disable-radix-cache`.

```

**Evidence: the shared-prefix run on the GB10 with the radix cache on**

```text
title: the shared-prefix run on the GB10 with the radix cache on
source: manuals/sglang-101/capture/gpu/out-gb10/bench-shared-prefix.txt
lines: 11-39
lang: text
note: Read the duration, the input token count, the output throughput and the median TTFT.
---
============ Serving Benchmark Result ============
Backend:                                 sglang    
Traffic request rate:                    inf       
Max request concurrency:                 8         
Successful requests:                     64        
Benchmark duration (s):                  28.97     
Total input tokens:                      146646    
Total input text tokens:                 146646    
Total generated tokens:                  4096      
Total generated tokens (retokenized):    3913      
Request throughput (req/s):              2.21      
Input token throughput (tok/s):          5061.63   
Output token throughput (tok/s):         141.38    
Peak output token throughput (tok/s):    216.00    
Peak concurrent requests:                16        
Total token throughput (tok/s):          5203.01   
Concurrency:                             8.00      
----------------End-to-End Latency----------------
Mean E2E Latency (ms):                   3619.45   
Median E2E Latency (ms):                 3592.55   
P90 E2E Latency (ms):                    4616.12   
P95 E2E Latency (ms):                    4616.30   
P99 E2E Latency (ms):                    4616.49   
---------------Time to First Token----------------
Mean TTFT (ms):                          712.02    
Median TTFT (ms):                        690.96    
P90 TTFT (ms):                           1146.81   
P95 TTFT (ms):                           1944.53   
P99 TTFT (ms):                           2051.54   

```

**Evidence: the same run on the GB10 with --disable-radix-cache**

```text
title: the same run on the GB10 with --disable-radix-cache
source: manuals/sglang-101/capture/gpu/out-gb10/no-radix-cache-bench-shared-prefix.txt
lines: 11-39
lang: text
note: The input token count is the same as before; compare the duration, the output and the TTFT block.
---
============ Serving Benchmark Result ============
Backend:                                 sglang    
Traffic request rate:                    inf       
Max request concurrency:                 8         
Successful requests:                     64        
Benchmark duration (s):                  50.26     
Total input tokens:                      146646    
Total input text tokens:                 146646    
Total generated tokens:                  4096      
Total generated tokens (retokenized):    3916      
Request throughput (req/s):              1.27      
Input token throughput (tok/s):          2917.46   
Output token throughput (tok/s):         81.49     
Peak output token throughput (tok/s):    200.00    
Peak concurrent requests:                16        
Total token throughput (tok/s):          2998.95   
Concurrency:                             7.99      
----------------End-to-End Latency----------------
Mean E2E Latency (ms):                   6278.45   
Median E2E Latency (ms):                 6122.43   
P90 E2E Latency (ms):                    6648.68   
P95 E2E Latency (ms):                    6652.19   
P99 E2E Latency (ms):                    6653.05   
---------------Time to First Token----------------
Mean TTFT (ms):                          2391.67   
Median TTFT (ms):                        2542.06   
P90 TTFT (ms):                           3272.33   
P95 TTFT (ms):                           3299.83   
P99 TTFT (ms):                           3304.86   

```

**Evidence: two prefill lines on the L4 with the cache, 2,048 shared tokens**

```text
title: two prefill lines on the L4 with the cache, 2,048 shared tokens
source: manuals/sglang-101/capture/gpu/out-l4/server-prefix-default.log
lang: text
note: Read #new-token against #cached-token.
---
[2026-10-17 13:21:05] Prefill batch, #new-seq: 3, #new-token: 405, #cached-token: 12952, token usage: 0.58, #running-req: 1, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 1452.28
[2026-10-17 13:21:06] Prefill batch, #new-seq: 4, #new-token: 546, #cached-token: 17269, token usage: 0.58, #running-req: 4, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 2532.09

```

**Evidence: two prefill lines on the L4 without the cache, 4,096 shared tokens**

```text
title: two prefill lines on the L4 without the cache, 4,096 shared tokens
source: manuals/sglang-101/capture/gpu/out-l4/server-prefix-no-radix-cache.log
lang: text
note: Every token is new, and the pending tokens wait for the next chunk.
---
[2026-10-17 14:35:48] Prefill batch, #new-seq: 2, #new-token: 4096, #cached-token: 0, token usage: 0.68, #running-req: 1, #queue-req: 0, #pending-token: 5527, cuda graph: True, input throughput (token/s): 1632.42
[2026-10-17 14:35:50] Prefill batch, #new-seq: 2, #new-token: 4096, #cached-token: 0, token usage: 0.74, #running-req: 2, #queue-req: 0, #pending-token: 1431, cuda graph: True, input throughput (token/s): 1634.70

```

**Evidence: the same test on the other engine, cache on and off by shared length**

```text
title: the same test on the other engine, cache on and off by shared length
source: manuals/vllm-101/sections/3-2-make-repeated-prompts-hit-the-prefix-cache.md
lines: 13-23
lang: text
note: Read the 1,024-token row first; the text under the table says why the last two rows need care.
---
| Shared prompt tokens, L4 full-clock session | Median TTFT, cache on | Median TTFT, cache off | Output tok/s, on / off |
|---|---|---|---|
| none | 408 ms | 392 ms | 113.8 / 113.6 |
| 256 | 488 ms | 753 ms | 111.5 / 99.1 |
| 1,024 | 396 ms | 1,213 ms | 106.0 / 70.9 |
| 2,048 | 410 ms | 2,550 ms | 100.2 / 46.6 |
| 4,096 | 375 ms | 13,353 ms | 86.8 / 19.6 |

With the cache on, the first token took about 400 ms at every prefix length. With the cache off, the first token grew with the shared part, because every request computed the whole prompt again.

Read the last two rows with care. Without the cache, the GPU throttled. The median clock fell to 1,035 MHz at 2,048 tokens and to 675 MHz at 4,096 tokens. The cleanest comparison is the 1,024-token row, where both runs held 1,410 MHz or more. There the cache cut the first token about 3 times and gave 50 percent more output. The runs with the cache on were on 2026-10-17 and 2026-10-18, and the runs with it off on 2026-10-21.

```

**Evidence: the SGLang table on the L4 by shared length, with the clock caveat**

```text
title: the SGLang table on the L4 by shared length, with the clock caveat
source: manuals/sglang-101/sections/3-3-radixcache.md
lines: 86-94
lang: text
note: The two paragraphs under the table bound the factor.
---
| Shared prompt | Median TTFT, cache on | Median TTFT, cache off | Output tok/s, cache on | Output tok/s, cache off |
|---|---|---|---|---|
| 0 | 349 ms | 379 ms | 113.56 | 113.33 |
| 1,024 | 462 ms | 2,202 ms | 105.76 | 70.15 |
| 4,096 | 479 ms | 14,706 ms | 88.87 | 20.80 |

The median SM clock was 1,440 MHz with the cache and 930 MHz without it at 4,096 shared tokens. Every seed of the run without the cache stayed under our floor of 1,000 MHz.

**We measured** a 30.7 times shorter median wait and 4.3 times the throughput at 4,096 shared tokens. Treat both factors as upper bounds. The run without the cache had a thermal throttle flag in 62 percent of its samples and a 35 percent lower clock. A cool card would shrink the factor, but a 35 percent clock gap cannot explain a factor of 30. With no shared prompt, the median TTFT differed by 8 percent, inside the seed spread, and the throughput was the same.

```

**Questions**

1. What does a prefix cache change about the work a server does, and what does it leave the same?
2. From the two GB10 runs, how much did the first token and the throughput move, and which line proves that the same work was requested?
3. Read the four L4 prefill lines. What do `#new-token`, `#cached-token` and `#pending-token` say about each configuration?
4. Both engines were measured. Does the effect belong to one engine, and how does its size depend on the shared length?
5. The policy wanted predictable numbers. Which fix gives that without the cost?

:::answer Show the answer
:::say Short answer
The policy caused the incident. The cache was never what made the benchmark lie; the method was, because the kit reused one seed on one server and never flushed between runs. Removing the cache from production removed the work-saving that the customer's traffic depends on. On the GB10, the shared-prefix run saw its median TTFT go from 690.96 ms to 2542.06 ms, and its output went from 141.38 to 81.49 tokens per second, for the same 146646 input tokens.
:::

**Walkthrough**

1. **Know what the cache saves.** The tree indexes the KV entries of every prompt the server has seen. A new request reuses the longest matching prefix and prefills only the tokens after it. The decode work stays the same, so a cache hit removes prefill time and nothing else. A system prompt that every request repeats is the best case: the whole shared part comes from the tree.
2. **Read the workload.** The kit runs the engine's own shared-prefix benchmark: four groups of 16 prompts, one system prompt of 2,048 tokens per group, a 128-token question on each prompt, and a cap of eight requests at once. The second server starts with the cache disabled.
3. **Compare the two GB10 runs.** Both report 146646 input tokens over 64 requests, so the client asked for the same work. With the cache the run took 28.97 s and gave 141.38 output tokens per second with a median TTFT of 690.96 ms. Without it the run took 50.26 s, the output fell to 81.49, and the median TTFT rose to 2542.06 ms, with a P99 of 3304.86 ms against 2051.54. The input tokens per second tell the same story: 5061.63 with the tree and 2917.46 without. The customer's two complaints, a slower first token and fewer answers per minute, are both in this pair.
4. **Read the L4 prefill lines.** With the cache and a 2,048-token shared prompt, one batch prefilled 405 new tokens and took 12952 from the cache, and the next prefilled 546 new with 17269 cached. Without the cache and a 4,096-token shared prompt, each batch prefilled 4096 new tokens with 0 cached, and 5527 tokens were still pending for the next chunk. Every request paid for its whole prompt, in chunks of the prefill size, while the others waited.
5. **Check the other engine.** On the L4 with vLLM, the cache kept the median first token near 400 ms at every shared length: 408, 488, 396, 410 and 375 ms. Without it the first token grew with the shared part: 392, 753, 1,213, 2,550 and 13,353 ms, and the output fell from 113.6 to 19.6 tokens per second. The manual asks to read the last two rows with care, because the GPU throttled there, and names the 1,024-token row as the clean comparison: about three times the first token and 50 percent more output with the cache. The effect is the same on both engines, and it grows with the shared length.
6. **Bound the factor.** The SGLang table on the L4 reads 479 ms against 14,706 ms at 4,096 shared tokens, 30.7 times, and 4.3 times the throughput. The run without the cache ran at 930 MHz against 1,440 with it, with a thermal flag in 62 percent of its samples, so the manual treats both factors as upper bounds and notes that a 35 percent clock gap cannot explain a factor of 30. Read the GB10 pair, which had no such gap, for the size you can trust.

**Resolution**

The policy caused the incident. The cache was never what made the benchmark lie; the method was, because the kit reused one seed on one server and never flushed between runs. Removing the cache from production removed the work-saving that the customer's traffic depends on. On the GB10, the shared-prefix run saw its median TTFT go from 690.96 ms to 2542.06 ms, and its output went from 141.38 to 81.49 tokens per second, for the same 146646 input tokens.

The fix is to turn the cache back on, on both engines, and to make the benchmarks predictable by protocol: flush the cache before each run that you compare, use a new seed per run, and record the cached tokens next to the result. Prove the production fix with `#cached-token` in the prefill lines, which should carry most of each shared prompt, and with the median TTFT of the customer's traffic back near the cached level. Keep the manual's one exception: turn the cache off only to test whether a wrong answer comes from reused KV, and try `--kv-canary log` first.

**Wrong turns**

- "The cache made the benchmark lie, so it has no place in production." The benchmark lied because it reused its prompts without a flush. The cache in production serves prompts that really repeat, and the customer's system prompt is exactly that.
- "Only the first token is affected, throughput is unchanged." On the GB10 the output fell from 141.38 to 81.49 tokens per second and the run took 50.26 s instead of 28.97. Prefill that is computed again occupies steps that decode would have used.
- "The effect is an SGLang detail." The other engine moved from 396 to 1,213 ms at 1,024 shared tokens and from 375 to 13,353 ms at 4,096, on the same card.
- "Shorten the customer's system prompt instead." The prompt is the customer's product. A server feature that removes the repeated work is the cheaper fix, and the manual measured no cost from the cache when nothing is shared.
- "Keep it off, because a wrong answer might come from reused KV." That is the one reason the manual accepts, and even then it asks you to try `--kv-canary log` first and to turn the cache off only for the test.

**Generalize**

A measurement artifact is fixed in the measurement, not in the system. When a cache or any other state carries over between benchmark runs, reset the state between runs and record it; do not remove the mechanism from production, where the same state is the point. Before you change a default that saves work, measure the traffic that repeats and count what the default saves there.

:::

## Two refusals, two wordings, one agent file

*Level 2 · incident · about 20 minutes · version: docker-agent v1.149.0 and sbx v0.47.0; model: ai/qwen3:4b through the local model runner, at temperature 0; hardware: one Mac, no GPU*

Two tickets arrive on the same morning about one agent file. The file gives an agent a shell toolset, an `allow` pattern for `echo`, a `deny` pattern for `rm`, and a logging hook on every shell call. Both engineers sent the same three messages: run `echo m101-ok`, run `pwd`, run `rm -rf work/m101-nothing`.

The first engineer runs the agent in a pipeline with `--exec --safety restricted`. The ticket says that the agent refuses `rm` with the text `Tool 'shell' is denied by permissions configuration` and asks for the deny pattern to be removed, because the pipeline needs a cleanup step. The second engineer runs it on a laptop with `--exec --safety strict`. The ticket says that the agent refuses `pwd` with the text `The user rejected the tool call`, that no prompt ever appeared, and that the hook must be broken, because it answers allow on every call. You hold both tickets and the capture of both runs.

**Evidence: the toolset, the hook and the two patterns of the guarded agent**

```text
title: the toolset, the hook and the two patterns of the guarded agent
source: manuals/docker-sandboxes-101/capture/fixtures/agents/guarded.yaml
lines: 12-28
lang: yaml
note: One allow pattern for echo, one deny pattern for rm, and a preempting hook on every shell call.
---
    toolsets:
      - type: shell
    hooks:
      pre_tool_use:
        - matcher: shell
          preempt_yolo: true
          hooks:
            - type: command
              command: ./fixtures/hooks/log-hook.sh
              env:
                M101_HOOK_LOG: ./work/hook-stdin.jsonl

permissions:
  allow:
    - "shell:cmd=echo*"
  deny:
    - "shell:cmd=rm*"

```

**Evidence: the three commands under --safety restricted**

```text
title: the three commands under --safety restricted
source: manuals/docker-sandboxes-101/capture/out/20-restricted.txt
lines: 1-17
lang: text
note: Read which commands ran and the wording of the one refusal.
---
user: Run the shell command: echo m101-ok
root -> tool_call shell {"cmd": "echo m101-ok"}
root <- tool_call_response Shell: m101-ok
root: echo m101-ok
m101-ok
stream_stopped (stop, normal)
user: Run the shell command: pwd
root -> tool_call shell {"cmd": "pwd"}
root <- tool_call_response Shell: $CAPTURE
root: pwd
$CAPTURE
stream_stopped (stop, normal)
user: Run the shell command: rm -rf work/m101-nothing
root <- tool_call_response Shell: Tool 'shell' is denied by permissions configuration.
root: rm -rf work/m101-nothing
The command was refused due to permissions configuration.
stream_stopped (stop, normal)

```

**Evidence: the second and third commands under --safety strict**

```text
title: the second and third commands under --safety strict
source: manuals/docker-sandboxes-101/capture/out/20-strict.txt
lines: 7-17
lang: text
note: Compare the wording of the two refusals, and read the metadata of the confirmation.
---
user: Run the shell command: pwd
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "shell", "arguments": "{\"cmd\": \"pwd\"}"}}, "metadata": {"blast_radius": "safe", "category": "fs-read", "reason": "Command matches safe read-only pattern: pwd", "safety_label": "safe"}}
root <- tool_call_response Shell: The user rejected the tool call.
root: pwd
The user rejected the tool call.
stream_stopped (stop, normal)
user: Run the shell command: rm -rf work/m101-nothing
root <- tool_call_response Shell: Tool 'shell' is denied by permissions configuration.
root: rm -rf work/m101-nothing
Tool 'shell' is denied by permissions configuration.
stream_stopped (stop, normal)

```

**Evidence: the three records the hook wrote, one per call**

```text
title: the three records the hook wrote, one per call
source: manuals/docker-sandboxes-101/capture/out/20-hook-stdin.jsonl
lines: 1-3
lang: jsonl
note: Every call reached the hook, including the one that was refused.
---
{"agent_name": "root", "cwd": "$CAPTURE", "hook_event_name": "pre_tool_use", "safety_policy": "restricted", "session_id": "<uuid>", "tool_input": {"cmd": "echo m101-ok"}, "tool_name": "shell", "tool_use_id": "<call-id>"}
{"agent_name": "root", "cwd": "$CAPTURE", "hook_event_name": "pre_tool_use", "safety_policy": "restricted", "session_id": "<uuid>", "tool_input": {"cmd": "pwd"}, "tool_name": "shell", "tool_use_id": "<call-id>"}
{"agent_name": "root", "cwd": "$CAPTURE", "hook_event_name": "pre_tool_use", "safety_policy": "restricted", "session_id": "<uuid>", "tool_input": {"cmd": "rm -rf work/m101-nothing"}, "tool_name": "shell", "tool_use_id": "<call-id>"}

```

**Evidence: the hook script**

```text
title: the hook script
source: manuals/docker-sandboxes-101/capture/fixtures/hooks/log-hook.sh
lines: 1-4
lang: bash
note: The hook logs the record and answers allow on every call.
---
#!/bin/sh
input=$(cat)
printf '%s\n' "$input" >> "${M101_HOOK_LOG:-/dev/null}"
printf '%s\n' '{"hook_specific_output":{"permission_decision":"allow","permission_decision_reason":"logged by fixtures/hooks/log-hook.sh"}}'

```

**Evidence: the shell tool called directly, with no model in the loop**

```text
title: the shell tool called directly, with no model in the loop
source: manuals/docker-sandboxes-101/capture/out/20-debug-tool.txt
lines: 1-3
lang: console
note: The exit code tells you whether the tool itself works.
---
$ docker-agent debug tool fixtures/agents/guarded.yaml shell '{"cmd":"echo m101-direct"}'
m101-direct
[exit 0]

```

**Evidence: the order the runtime applies to every tool call**

```text
title: the order the runtime applies to every tool call
source: manuals/docker-sandboxes-101/sections/5-5-permissions-safety-and-hooks.md
lines: 86-92
lang: text
note: Find the step that decided each of the three commands.
---
1. `preempt_yolo` `pre_tool_use` hooks run first, and no mode or allow rule can bypass their deny or ask.
2. A `deny` pattern blocks the call.
3. An `allow` pattern approves it.
4. An `ask` pattern prompts the user.
5. With no match, the safety mode applies to the call's label.
6. On a mode ask, default `pre_tool_use` hooks can allow, deny, or ask.
7. With no decision, the user is asked.

```

**Questions**

1. The two refusals have two wordings. Before you open the agent file, say what each wording tells you about where the decision was made.
2. No pattern names `pwd`. Why did it run in one mode and not in the other?
3. The hook answered allow on all three calls. Why did that change nothing, and what could the hook have changed?
4. What does the direct tool run prove, and what does it not prove?
5. Which ticket reports a bug, which reports the design at work, and what do you change for each?

:::answer Show the answer
:::say Short answer
The first ticket describes the policy doing its job. A `deny` pattern blocks the call in every mode, and the manual's order places it above every allow, every ask, and every mode. Keep the pattern. A pipeline that must delete files does that outside the agent, or with a narrower deny that still excludes `rm -rf`. Removing the one rule that no mode and no hook can override leaves an unattended agent with no gate.
:::

**Walkthrough**

1. **Read the agent file.** One toolset of type `shell`. A `pre_tool_use` hook with `matcher: shell` and `preempt_yolo: true`, which runs a script. Under `permissions`, `allow` holds `shell:cmd=echo*` and `deny` holds `shell:cmd=rm*`. Nothing names `pwd`.
2. **Read the restricted run.** `echo` ran and printed `m101-ok`. `pwd` ran and printed the working directory. The `rm` call never reached a tool: the response says that the configuration denies the tool. That is the `deny` pattern, which matches `rm*`.
3. **Read the strict run.** `echo` ran again. For `pwd`, the runtime raised `tool_call_confirmation` with metadata `blast_radius: safe`, `category: fs-read`, and `safety_label: safe`. Under `strict`, every label asks. With `--exec` there was no terminal, so the ask became a rejection, and the model got a message that said the user rejected the call. The `rm` call got the same denial as in the other mode. The two wordings mark two decision points: a denial names the policy, and a rejection names the person who was asked.
4. **Read the hook records and the script.** The hook wrote three records in the restricted run, one per call, including the `rm` call. The records carry `safety_policy: restricted` and the full `tool_input`. The script appends the record and prints `permission_decision: allow`. The order of decisions puts preempting hooks first, and from there an allow is advice only: a deny or an ask from the hook would have ended the call, an allow does not grant it. The deny pattern then blocked `rm` at the second step.
5. **Read the direct tool run.** `debug tool` called the shell tool of the same agent file with `echo m101-direct` and printed `m101-direct` with exit 0. The tool works. The refusals are decisions, not tool failures. The direct run does not say what the model would call, so it closes only the question about the toolset.
6. **Map each command to the order.** `echo`: step three, an allow pattern. `rm`: step two, a deny pattern, in both modes. `pwd`: no pattern, so step five, the safety mode on the label `safe`: `restricted` allows a safe label, and `strict` asks.

**Resolution**

The first ticket describes the policy doing its job. A `deny` pattern blocks the call in every mode, and the manual's order places it above every allow, every ask, and every mode. Keep the pattern. A pipeline that must delete files does that outside the agent, or with a narrower deny that still excludes `rm -rf`. Removing the one rule that no mode and no hook can override leaves an unattended agent with no gate.

The second ticket reports a mode that does not fit an unattended run. `strict` asks on every unmatched call, and `--exec` without a terminal turns every ask into a rejection. The fix is `--safety restricted` for the laptop run, which lets a `safe` label run and refuses `destructive` and `unknown`, or an `allow` pattern for `pwd`. The hook is not broken: a preempting hook grants nothing, and its log of three records shows that it saw every call. The proof is the restricted run: `pwd` printed the working directory, `rm` stayed refused, and the hook recorded all three.

One line from the manual belongs in both ticket replies: the client enforces permissions, they stop accidents, and they are not a security boundary. For an agent you do not trust, run it in a sandbox.

**Wrong turns**

- "The hook is broken, because it returned allow and the call was still refused." From a preempting hook an allow verdict is advice. Its deny or ask would have ended the call. Nothing is broken.
- "Remove the deny pattern so the cleanup step runs in the pipeline." The deny is the one rule that no mode and no hook can override. An unattended agent with `rm` allowed has no gate left.
- "Run with `--yolo` so nothing asks." That is `autonomous`: every unmatched call runs, `destructive` and `unknown` included. The `pwd` case needs `restricted` or one allow pattern.
- "The shell toolset is misconfigured on the laptop." The direct run printed `m101-direct` with exit 0 against the same agent file. The tool works, and the decision layer refused.

**Generalize**

Read the wording of a refusal first. A denial names the policy, a rejection names the user, and a prompt in a headless run becomes a rejection. Then map each call to the decision order: preempting hooks, deny, allow, ask, mode. Choose the mode by who is watching the terminal, and remember that none of this is a security boundary.

:::
