---
track: aibank
title: "AI incident scenarios, read the evidence (part 9 of 10)"
short: Incidents 9
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## The load knee and the cap that made it worse

*Level 3 · incident · about 25 minutes · version: vLLM 0.31.0 against SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory; the first sweep ran at the full clock, and the reruns locked the SM clock at 900 MHz*

A chat service streams answers from `Qwen/Qwen3-8B` on one L4 with vLLM. Its target is a first token within one second and 100 ms or less between tokens. At busy hours the service has 64 users at once, and the stream stalls: users see a token, then a gap of more than a second, then a burst. Throughput on the dashboard still looks fine, 241.39 tokens per second.

An engineer reads that `--max-num-seqs` limits the requests that run at once, and lowers it from the default of 256 to 16 to make each stream smoother. The next morning the gaps are still there, and the median wait for the first token is now about a minute. A second engineer proposes to switch the engine, because a competing engine kept the gaps near 150 ms on the same card in a published table.

**Evidence: the chat sweep with the share of requests that met the target**

```text
title: the chat sweep with the share of requests that met the target
source: manuals/vllm-101/sections/3-1-tune-chat-for-many-users.md
lines: 19-24
lang: text
note: Read the output column and the share column together, row by row.
---
| Users, L4 full-clock session | Output tok/s | Median TTFT | P99 ITL | Share of requests that met the target | Median SM clock |
|---|---|---|---|---|---|
| 8 | 112.8 | 0.25 s | 67 ms | 75% | 1,485 MHz |
| 16 | 201.3 | 0.29 s | 85 ms | 64% | 1,455 MHz |
| 32 | 275.1 | 1.80 s | 613 ms | 0% | 1,275 MHz |
| 64 | 242.3 | 11.18 s | 1,233 ms | 0% | 1,005 MHz |

```

**Evidence: the share that met the target and the P99 ITL, with and without a cache reset before each run**

```text
title: the share that met the target and the P99 ITL, with and without a cache reset before each run
source: manuals/vllm-101/capture/gpu/out-l4/load-flushed-vs-unflushed.txt
lines: 15-26
lang: text
note: The number before the slash is the run with a reset. Find the user count where the share falls below half.
---
share of requests with TTFT <= 1 s and a mean ITL <= 100 ms, flushed against unflushed
users   vLLM                  SGLang
4       100% / 100%           100% / 100%
8       50% / 75 to 81%       31% / 69 to 75%
16      25% / 64 to 66%       16 to 17% / 61 to 64%
32      0% / 6 to 9%          0% / 0%

P99 ITL, flushed: vLLM 69 to 72 ms at 8 users, 522 to 523 ms at 16, 668 to 964 ms at 32.
SGLang 72 to 73 ms at 8 users, 82 ms at 16, 105 to 106 ms at 32.
P99 ITL, unflushed at 900 MHz in the same session: vLLM 69 ms at 8 users, 82 to 84 ms at 16, 741 to 1,422 ms at 32.
SGLang 71 to 72 ms at 8 users, 81 to 82 ms at 16, 102 to 106 ms at 32.
The time per token and the throughput changed by about 5 to 10 percent between the two sweeps. The cache moved the first token, not the decode.

```

**Evidence: a cap of 16 sequences against the default at 32 users**

```text
title: a cap of 16 sequences against the default at 32 users
source: manuals/vllm-101/sections/3-1-tune-chat-for-many-users.md
lines: 63-66
lang: text
note: Compare the median TTFT, the P99 ITL and the output of the two rows.
---
| Users, L4 full-clock session | Config | Output tok/s | Median TTFT | Median ITL | P99 ITL | Median SM clock |
|---|---|---|---|---|---|---|
| 32 | default | 275.1 | 1.8 s | 80.5 ms | 613 ms | 1,275 MHz |
| 32 | `--max-num-seqs 16` | 171.8 | 12.3 s | 69.8 ms | 595 ms | 1,365 MHz |

```

**Evidence: two engines with the same pool, from 1 to 64 users**

```text
title: two engines with the same pool, from 1 to 64 users
source: manuals/sglang-101/sections/5-3-reading-other-peoples-benchmarks.md
lines: 115-121
lang: text
note: At 64 users, read the median TTFT and the P99 ITL of each engine.
---
| Concurrency | Output tok/s, SGLang / vLLM | Median TTFT, SGLang / vLLM | P99 ITL, SGLang / vLLM | Median SM clock, SGLang / vLLM |
|---|---|---|---|---|
| 1 | 13.84 / 13.51 | 185 / 192 ms | 104 / 105 ms | 1,290 / 1,290 MHz |
| 8 | 112.46 / 112.79 | 170 / 253 ms | 71 / 68 ms | 1,485 / 1,470 MHz |
| 16 | 201.13 / 200.90 | 212 / 289 ms | 81 / 80 ms | 1,470 / 1,425 MHz |
| 32 | 271.28 / 273.93 | 2,871 / 1,813 ms | 102 / 619 ms | 1,320 / 1,275 MHz |
| 64 | 256.62 / 241.39 | 18,356 / 10,953 ms | 114 / 1,363 ms | 1,215 / 1,013 MHz |

```

**Evidence: the SGLang pool and one decode line at a cap of 64**

```text
title: the SGLang pool and one decode line at a cap of 64
source: manuals/sglang-101/capture/gpu/out-l4/server-h2h-sglang.log
lang: text
note: Count the running requests and the queued requests in the second line.
---
[2026-10-17 18:27:40] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 24094, K size: 1.65 GB, V size: 1.65 GB
[2026-10-17 20:12:04] Decode batch, #running-req: 37, #token: 22162, token usage: 0.92, cuda graph: True, gen throughput (token/s): 432.55, #queue-req: 27

```

**Evidence: the vLLM pool and one stats line at a cap of 64**

```text
title: the vLLM pool and one stats line at a cap of 64
source: manuals/sglang-101/capture/gpu/out-l4/server-h2h-vllm.log
lang: text
note: Count the running and waiting requests, and read the KV cache usage and the prompt throughput.
---
INFO 10-17 20:13:17 [kv_cache_utils.py:2464] GPU KV cache size: 24,096 tokens, Maximum concurrency for 8,192 tokens per request: 2.94x
INFO 10-17 22:35:43 [loggers.py:320] Engine 000: Avg prompt throughput: 460.3 tokens/s, Avg generation throughput: 323.6 tokens/s, Running: 40 reqs, Waiting: 11 reqs, GPU KV cache usage: 99.5%, Prefix cache hit rate: 8.7%

```

**Evidence: every admission cap that we tried at 64 users**

```text
title: every admission cap that we tried at 64 users
source: manuals/vllm-101/capture/gpu/out-l4/admission-cap-64-users.txt
lines: 7-19
lang: text
note: Read only the rows whose clock is 900 MHz, and follow the TTFT column as the cap falls.
---
config                        median SM clock (s1/s2)   median TTFT       P99 ITL               output tok/s
SGLang default                900 / 900                 19.4 s            143 to 153 ms         225 to 231
vLLM default                  405 / 405                 13.5 to 14.2 s    1,647 to 1,778 ms     174
vLLM default, earlier run     900                       11.8 s            1,359 ms              220
--max-num-seqs 48             435 / 375                 13.8 to 15.2 s    1,656 to 1,749 ms     171 to 195
--max-num-seqs 32             900 / 795                 17.2 to 20.6 s    1,163 to 1,399 ms     196 to 230
--max-num-seqs 16             255 / 255                 61.7 to 64.7 s    1,548 to 1,692 ms     108 to 110
--max-num-active-seqs 48      900 / 900                 11.8 s            1,329 to 1,373 ms     215 to 218
--max-num-active-seqs 32      435 / 810                 21.8 to 22.7 s    1,380 to 1,658 ms     187 to 202
--max-num-active-seqs 16      795 / 683                 44.8 to 48.8 s    1,133 to 1,139 ms     129 to 136

The earlier vLLM default run at 900 MHz was in the same session without a flush. It ran at a different clock from the flushed default run, so the two default rows are not a flush comparison.
No cap we tried brought the vLLM P99 ITL near the SGLang value. Lower caps moved the wait to the first token.

```

**Questions**

1. Which two numbers does a chat user feel, and why is throughput the wrong number to watch here?
2. Read the first listing. At which user count does the service stop meeting the target, and what rises first, the first token or the gaps between tokens?
3. What does a cap on running sequences change inside one scheduler step, and what does it leave unchanged?
4. Both engines write the same tokens per second at 64 users. Explain from the two log lines why one gives the first token sooner and the other keeps the stream smooth.
5. The last listing tries six caps. State the result in one sentence, then say what does fix the gaps on this card.
6. Suppose you must keep vLLM. Which flag, which replica count, and which metric do you set, and how do you prove the fix?

:::answer Show the answer
:::say Short answer
Two things were wrong. The service ran past its knee, and the cap treated a capacity problem as a scheduling problem. The knee on this card, measured with a cache reset, sits between 8 and 16 users. At 64 users the pool holds about 37 to 40 requests of 640 tokens, so the rest wait, and every new prefill that enters a step pauses the running streams.
:::

**Walkthrough**

A chat user feels the time to the first token and the gap between tokens, the inter-token latency. Throughput is the bill, not the experience. One long pause in a stream feels worse than a slightly slower stream, so the number to watch is the P99 ITL, the worst gap in 100.

The first listing is the sweep from the full-clock session. At 8 users, 75 percent of the requests met the target and the P99 ITL was 67 ms. At 16 users the share was 64 percent at 85 ms. At 32 users the output still rose to 275.1 tokens per second, but the P99 ITL grew to 613 ms and no request met the target. At 64 users the first token took 11.18 s and the P99 ITL was 1,233 ms. So the gaps break before the output stops growing. This sweep did not reset the prefix cache between user counts, so the low rows read the first token too fast. The second listing holds the rerun that reset the cache ahead of every run and the clock locked at 900 MHz. At 8 users, 50 percent met the target against 75 to 81 percent without the reset. At 16 users it was 25 percent against 64 to 66 percent, and the P99 ITL was 522 to 523 ms with the reset against 82 to 84 ms without. So the stream breaks between 8 and 16 users on this card.

The third listing shows what the cap did. With `--max-num-seqs 16` at 32 users, the median ITL fell from 80.5 to 69.8 ms and the P99 ITL from 613 to 595 ms. The first token moved from 1.8 s to 12.3 s, and output fell from 275.1 to 171.8 tokens per second, a loss of 38 percent. The cap run had the higher clock, so the clock does not explain the loss. A cap does not make room for more users. It only chooses who waits, and it moves the wait from the stream to the queue.

The fourth listing compares two engines on the same pool of 24,096 tokens. Up to 32 users they tie on output. At 64 users SGLang gave 256.62 tokens per second and vLLM 241.39. The medians for the first token were 18,356 ms against 10,953 ms, and the P99 ITL was 114 ms against 1,363 ms. The two log lines say why. SGLang ran 37 requests and kept 27 in its queue with the pool 92 percent full. vLLM ran 40 requests and kept 11 waiting, filled 99.5 percent of its pool and prefilled new prompts at 460.3 tokens per second while the others decoded. Each new prefill shares the step with the running streams, so the streams stall. vLLM chose the first token, SGLang chose the stream.

The last listing tries to buy the smooth stream back with caps. The clock did not hold at 900 MHz in every run, so read the clock column before the cap. Three rows ran at 900 MHz. The SGLang default gave a P99 ITL of 143 to 153 ms with a first token at 19.4 s. The vLLM default gave 1,359 ms at 11.8 s. `--max-num-active-seqs 48` gave 1,329 to 1,373 ms at the same 11.8 s, so that cap changed nothing. `--max-num-seqs 32` ran at 900 and 795 MHz, gave 1,163 to 1,399 ms and pushed the first token to 17.2 to 20.6 s. `--max-num-active-seqs 16` ran at 795 and 683 MHz, so it is not a matched result, but it gave 1,133 to 1,139 ms with a first token at 44.8 to 48.8 s and the output down to 129 to 136. No cap brought the P99 ITL under 1.1 s, and the caps that changed anything moved the wait to the first token.

**Resolution**

Two things were wrong. The service ran past its knee, and the cap treated a capacity problem as a scheduling problem. The knee on this card, measured with a cache reset, sits between 8 and 16 users. At 64 users the pool holds about 37 to 40 requests of 640 tokens, so the rest wait, and every new prefill that enters a step pauses the running streams.

The fix is fewer users per replica. On this card, 8 users per replica met the target for half the requests and 16 users for a quarter, so the replica count comes from the target, not from the throughput peak. Remove the `--max-num-seqs 16` setting, because at 32 users it cut output by 38 percent and pushed the first token from 1.8 s to 12.3 s at the median while the P99 ITL stayed near 600 ms. Keep the default admission and add replicas until the P99 ITL and the first token both meet the target at the busiest hour.

The engine switch is a real option, not a fix. On the same pool at 64 users SGLang kept the P99 ITL at 114 ms and made users wait 18,356 ms for the first token. vLLM did the reverse. Pick the engine by which of the two numbers your users forgive, and measure the pair on your own card.

**Wrong turns**

- "Lower the batch so each step is faster." A cap on sequences does not add room. It picks who waits, and the first token then waits in the queue. At 32 users the cap cost 38 percent of the output.
- "Throughput is fine, so the server is fine." At 32 users the output still rose while no request met the target. Throughput measures the bill, the P99 ITL measures the user.
- "Shorten the maximum model length to fit more users." The pool stays the same size, so the same number of 640-token requests fit. Only a larger pool or fewer users changes that.
- "The other engine is faster." Both engines wrote about the same tokens per second at every user count. They differed in which wait they chose at a full pool, not in speed.
- "Set a cap at 48 so the pool never fills." The cap at 48 active sequences left the P99 ITL at 1,329 to 1,373 ms, the same as the default. The gaps come from the prefills that share each step, not from the number of running sequences alone.

**Generalize**

When a service runs past its knee, every admission knob trades one latency for another and none of them adds capacity. Measure the two user-facing numbers together with throughput, find the last user count that meets both, and size replicas from that count. When two systems tie on throughput, their difference is the choice they make at saturation, so read the tail of the first token and the tail of the stream side by side before you switch.

:::

## The logprob gap that jumped when the engine changed

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22 and vLLM 0.31.0 as rollout engines, with Miles main 08752a12; model: Qwen/Qwen3-0.6B in BF16; hardware: the shared second L4 of a two-GPU node, with no clock lock*

An RL team samples its rollouts at temperature 1 with top-p 0.9. The trainer scores each sampled token against the whole vocabulary and compares that score with the log probability that the engine returned. The gap between the two, `train/train_rollout_logprob_abs_diff`, has sat between 0.0148 and 0.0157 at step 0 in all healthy runs.

The team moves the rollouts to a second engine. That engine has a flag for which log probability it returns, and the engineer picks the processed value, "because that is the distribution we sampled from". The step-0 gap of the new run lands about 0.053 above the old range. One teammate says the new engine's kernels are worse and wants to switch back. Another wants to switch the engine to its deterministic mode. A third says the gap is a constant and the trainer can subtract it. You have a probe that a colleague ran on the lab L4.

**Evidence: the probe: two engines, one model, one float32 reference**

```text
title: the probe: two engines, one model, one float32 reference
source: manuals/miles-101/capture/gpu/out-l4/logprobs-top-p.txt
lines: 1-6
lang: text
note: Read the sampler settings and what the reference computes.
---
Returned logprobs under top-p (backlog B-10)
Date: 2026-10-23
Machine: NVIDIA L4, the second GPU of the node (GPU1), shared with its owner, no clock lock. Speed does not change these values.
Engines: SGLang 0.5.22 and vLLM 0.31.0. Model: Qwen/Qwen3-0.6B in BF16.
Requests: 16 prompts, 48 sampled tokens each, temperature 1, top-p 0.9.
Reference: a Transformers float32 forward pass over the same tokens, full-vocabulary log_softmax.

```

**Evidence: returned logprob minus the reference, by engine and mode**

```text
title: returned logprob minus the reference, by engine and mode
source: manuals/miles-101/capture/gpu/out-l4/logprobs-top-p.txt
lines: 8-12
lang: text
note: One row differs from the other three in its median.
---
engine and mode                                  returned minus reference, median   median absolute
vLLM --logprobs-mode raw_logprobs                0.0000                             0.005
vLLM --logprobs-mode processed_logprobs          +0.0527
SGLang return_logprob, ORIGINAL_LOGPROB=0        0.0000                             0.0066
SGLang return_logprob, ORIGINAL_LOGPROB=1        0.0000                             0.0066

```

**Evidence: what the shifted value is**

```text
title: what the shifted value is
source: manuals/miles-101/capture/gpu/out-l4/logprobs-top-p.txt
lines: 14-16
lang: text
note: The residual against the formula is near zero, so the shift is the renormalization.
---
vLLM processed_logprobs minus (reference - log of the top-p kept mass): median residual 8e-9.
So processed_logprobs is the logprob after the nucleus is renormalized, and raw_logprobs is the full-vocabulary logprob.
SGLang returns the logprob from before top-p. At temperature 1, SGLANG_RETURN_ORIGINAL_LOGPROB set to 0 or 1 gives the same value.

```

**Evidence: how much mass top-p dropped on these tokens**

```text
title: how much mass top-p dropped on these tokens
source: manuals/miles-101/capture/gpu/out-l4/logprobs-top-p.txt
lines: 18-19
lang: text
note: The median of minus the log of the kept mass is the size of the shift.
---
The kept mass was below 0.99 for 74 to 79 percent of sampled tokens.
The median of minus log of the kept mass was 0.055 to 0.067.

```

**Evidence: the engine settings of five Miles runs**

```text
title: the engine settings of five Miles runs
source: manuals/miles-101/capture/gpu/out-gb10/engine-settings.txt
lines: 4-9
lang: text
note: Compare the first row with the last. Only the two sampler flags differ.
---
run                    attention_backend  enable_deterministic_inference  sampling_backend  --rollout-top-p  --rollout-top-k
e6a-base               flashinfer         False                           flashinfer        not set          not set
e6b-det-triton         triton             True                            pytorch           not set          not set
e6c-det-flashinfer     flashinfer         True                            pytorch           not set          not set
e6d-det-triton-repeat  triton             True                            pytorch           not set          not set
e11-topp-topk          flashinfer         False                           flashinfer        0.95             64

```

**Evidence: the gap with and without sampling replay, 12 steps, one seed**

```text
title: the gap with and without sampling replay, 12 steps, one seed
source: manuals/miles-101/sections/4-4-lower-the-logprob-gap.md
lines: 64-67
lang: text
note: The second run scored each token over the kept set in the trainer too.
---
| Run, 12 steps, seed 1 | Median gap | Lowest and highest step | Median reward |
|---|---|---|---|
| No top-p or top-k | 0.0153 | 0.0150 to 0.0159 | 0.66 |
| Top-p 0.95, top-k 64 | 0.0135 | 0.0128 to 0.0141 | 0.68 |

```

**Questions**

1. Three of the four rows agree with the reference and one does not. Which number is the kernel gap, and which is something else?
2. Derive the shifted value. In which direction does it move from the full-vocabulary value, and by how much for a token whose kept mass is 0.9?
3. The teammate calls the gap a constant to subtract. Is it constant across tokens, and which direction does it push the importance ratio?
4. Which value must the engine return for a trainer that scores the full vocabulary, and which setting pairs with a trainer that scores the kept set?
5. Why did the Miles run with top-p 0.95 and top-k 64 end with a lower gap than the run without them?
6. What does the deterministic mode change about this gap, and what does the temperature change about the value the first engine returns?

:::answer Show the answer
:::say Short answer
The gap jumped because the engine and the trainer no longer meant the same log probability. The trainer scored every token over the whole vocabulary, and the engine returned the value after top-p renormalized the kept set, which is higher by minus the log of the kept mass, 0.0527 at the median on these tokens. Nothing changed in the kernels: the raw mode of the second engine matched the reference with a median absolute difference of 0.005.
:::

**Walkthrough**

1. **Read the probe.** Both engines ran the same model in BF16 on the same GPU. The client sent 16 prompts and sampled 48 tokens for each, at temperature 1 and top-p 0.9. The reference is a float32 forward pass over the same tokens with a full-vocabulary `log_softmax`. The GPU was shared and had no clock lock, which changes the speed and not these values.
2. **Read the four rows.** The second engine in raw mode returned the reference value, with a median difference of 0.0000 and a median absolute difference of 0.005. The first engine returned the reference value too, with a median absolute difference of 0.0066, with its environment variable at 0 and at 1. The second engine in processed mode returned a value higher than the reference by a median of 0.0527. The 0.005 and the 0.0066 are the kernel gap. The 0.0527 is a definition.
3. **Check the formula.** Top-p keeps the smallest set of tokens whose probabilities add up to at least 0.9, then scales the kept probabilities so that they add up to 1 again. The log probability of a kept token after that scaling is the score over the whole vocabulary minus the log of the kept mass. The probe subtracted that formula from the processed value and got a median residual of 8e-9. So the processed value is the log probability inside the renormalized nucleus, and the raw value is the full-vocabulary one.
4. **Read how often the cut bites.** The kept mass was below 0.99 for 74 to 79 percent of the sampled tokens, and the median of minus the log of the kept mass was 0.055 to 0.067. That is the size of the shift, and it differs from token to token. Because the kept mass is never above 1, the shift is never negative. It pushes the trainer-to-engine ratio the same way on every token, so it is a bias and not noise.
5. **Read the Miles runs.** The engine settings table shows a run that passed `--rollout-top-p 0.95` and `--rollout-top-k 64`, and a base run that passed neither. Miles turns on sampling replay when top-p is below 1 or top-k is above 0: the engine returns the set of tokens that each step could sample from, and the trainer then scores every token over that set only. The replay run had a median gap of 0.0135 against 0.0153 for the base run over 12 steps, with no overlap between their step ranges. Both sides meant the same log probability, so the sampler part of the gap went away and the kernel part stayed.
6. **Place the other two proposals.** Deterministic inference makes the engine repeat itself and changes nothing about which value the sampler reports. The first engine computes its returned value as `log_softmax(logits / temperature)` unless its original-logprob variable is set, so at a temperature other than 1 that engine returns a scaled value, while at temperature 1 the variable makes no difference, as the two rows show.

**Resolution**

The gap jumped because the engine and the trainer no longer meant the same log probability. The trainer scored every token over the whole vocabulary, and the engine returned the value after top-p renormalized the kept set, which is higher by minus the log of the kept mass, 0.0527 at the median on these tokens. Nothing changed in the kernels: the raw mode of the second engine matched the reference with a median absolute difference of 0.005.

Choose one of two consistent pairs. Either set the engine to its raw mode, so that both sides use the full vocabulary, or turn on replay in Miles with both `--rollout-top-p` and `--rollout-top-k`, so that both sides use the kept set. The proof is the step-0 gap: back inside 0.0148 to 0.0157 with the raw mode, or near 0.0136 with replay, which is the step-0 value the manual recorded for the top-p run. Then keep reading the gap at every step, because a gap that grows later means the weights did not reach the engine, which is a different fault.

**Wrong turns**

- "The new engine's kernels are worse, switch back." In raw mode the new engine matched the float32 reference with a median absolute difference of 0.005, about the same as the old engine's 0.0066. The jump came from the value the flag selected.
- "Turn on deterministic inference." It makes the engine repeat its own output and costs rollout time. It does not change the definition of the returned value, so the shift stays.
- "The gap is a constant, subtract it in the trainer." The shift is minus the log of the kept mass of each token, which spread over the tokens and sat below 0.99 for 74 to 79 percent of them. A constant correction leaves a bias on every token, in the same direction.
- "Lower top-p so that sampling gets sharper and the gap settles." A smaller kept mass makes minus its log larger. The shift grows.
- "Set the original-logprob variable on the first engine and the problem is solved everywhere." At temperature 1 that variable changed nothing in the probe. It matters when you sample at another temperature and the trainer scores at 1, which is a different mismatch.

**Generalize**

Two systems that compare a number must agree on its definition before they compare its value. A sampler that truncates and renormalizes changes the definition of a log probability, and the change is a one-sided bias per token, not noise. Before you read a gap between two sides, probe each side against one reference you compute yourself, and keep the two sides on the same side of the sampler, both before the cut or both after it.

:::

## Two clients, two numbers, one server

*Level 3 · incident · about 25 minutes · version: vLLM 0.31.0, measured by the SGLang 0.5.22 client and by vllm bench serve; model: Qwen/Qwen3-0.6B; hardware: the shared second L4 of a two-GPU node, throttled but steady at 420 to 495 MHz*

Two engineers evaluate one vLLM server that serves `Qwen/Qwen3-0.6B` on a shared L4, for a report that decides whether the team keeps the engine. The first uses the SGLang benchmark client at temperature 0.7, the temperature of the product, and files a median wait of 1,212 ms for the first token at 16 users and 331 output tokens each second at 64 users. The second uses `vllm bench serve` at temperature 0 and files 1,027 ms and 379 output tokens each second on that server.

The first engineer concludes that the server regressed between the two sessions and asks for a rollback of the last image. The second says the first client is broken. A third teammate ran all three clients, the SGLang client and the two versions of the vLLM client, against one server in interleaved rounds, and hands you the output.

**Evidence: one server, three clients, and the rules of the run**

```text
title: one server, three clients, and the rules of the run
source: manuals/vllm-101/capture/gpu/out-l4/bench-client-bias.txt
lines: 1-6
lang: text
note: Read the clock line and the last line: the cache was flushed before every run and the clients took turns.
---
Three benchmark clients against one server (backlog B-14)
Date: 2026-10-23
Machine: NVIDIA L4, the second GPU of the node (GPU1), shared with its owner. The clock was throttled but steady at 420 to 495 MHz for every run.
Server: one vLLM 0.31.0 server with Qwen/Qwen3-0.6B.
Clients: the SGLang 0.5.22 client with --backend vllm and the random-ids dataset, vllm bench serve with the random dataset, and vllm bench serve with VLLM_USE_RUST_BENCH=1.
All runs: 512 tokens in and 128 out, ignore EOS, seed 1, prefix cache flushed before every run, 2 rounds interleaved by client.

```

**Evidence: median TTFT in ms from three clients at two temperatures**

```text
title: median TTFT in ms from three clients at two temperatures
source: manuals/vllm-101/capture/gpu/out-l4/bench-client-bias.txt
lines: 8-16
lang: text
note: Compare the SGLang client column with the vllm bench column on each row.
---
Median TTFT in ms, two rounds per cell:

users   temperature   SGLang client    vllm bench       vllm bench, Rust
1       0             154, 164         149, 150         144, 144
1       0.7           165, 165         149, 150         150, 150
16      0             1,077, 1,045     1,033, 1,027     1,088, 1,038
16      0.7           1,212, 1,089     1,027, 1,038     1,066, 1,042
64      0             1,688, 1,838     1,624, 1,667     1,674, 1,789
64      0.7           1,765, 1,726     1,705, 1,675     1,687, 1,879

```

**Evidence: output tokens per second from three clients**

```text
title: output tokens per second from three clients
source: manuals/vllm-101/capture/gpu/out-l4/bench-client-bias.txt
lines: 18-24
lang: text
note: Compare the columns at 16 and 64 users, then look at the first SGLang round at one user.
---
Output throughput in tok/s, two rounds per cell:

users   temperature   SGLang client    vllm bench       vllm bench, Rust
1       0             39.9, 31.0       32.0, 31.9       32.2, 31.8
16      0             218, 216         222, 222         223, 223
64      0             359, 348         379, 377         371, 365
64      0.7           331, 343         360, 363         356, 353

```

**Evidence: the four findings written under the tables**

```text
title: the four findings written under the tables
source: manuals/vllm-101/capture/gpu/out-l4/bench-client-bias.txt
lines: 26-29
lang: text
note: The third line names the confound, and the fourth gives the cost of temperature.
---
The two vllm bench clients agree within noise.
The SGLang client reads 3 to 10 percent higher TTFT than vllm bench. At 16 and 64 users it reads 2 to 8 percent lower throughput. At 1 user, one SGLang round read 39.9 tok/s against about 32 for every other round, so the throughput gap does not hold there. One outlier round reached 18 percent at 16 users and temperature 0.7.
The clients use different prompt token sets (random-ids against random), which is a confound for small gaps.
Temperature 0.7 against 0: TPOT about 10 to 13 percent higher at 1 user (34 ms at 0.7 against 30 ms at 0), and 3 to 6 percent higher at 16 and 64 users. Throughput 3 to 10 percent lower.

```

**Evidence: how the SGLang manual reads the same table**

```text
title: how the SGLang manual reads the same table
source: manuals/sglang-101/sections/5-1-sglang-benchmark-serving.md
lines: 353-358
lang: text
note: Read the last sentence.
---
- Our client read a median TTFT 3 to 10 percent higher than `vllm bench serve`. At 16 and 64 users, it read an output throughput 2 to 8 percent lower. At one user, one of its rounds read a higher throughput than every other round, so we give no throughput gap there.
- The Python and the Rust versions of `vllm bench serve` agreed within the noise.
- The clients send different prompt tokens from their random datasets, so part of a small gap can come from the prompts.
- Temperature 0.7 raised the median TPOT over temperature 0. It was 10 to 13 percent higher at one user, and 3 to 6 percent higher at 16 and 64 users.

So a gap of a few percent between two published numbers can come from the client alone. Report the client and the temperature with every result.

```

**Evidence: the four mistakes that make two runs disagree**

```text
title: the four mistakes that make two runs disagree
source: manuals/vllm-101/sections/5-1-benchmark-your-server-in-15-minutes.md
lines: 79-84
lang: text
note: Each item is one variable to hold fixed.
---
## Avoid the four mistakes

1. **Reusing a warm cache.** With the random dataset and a fixed seed, a second run sends the same prompts. The prefix cache then serves part of them, and the second run looks faster. The next section gives the protocol.
2. **Letting the model stop early.** Without `--ignore-eos`, some answers end before the output length. The run then measures fewer tokens than you asked for.
3. **Skipping the warmup.** The first requests after a start pay for compiled kernels and cold caches. Use `--num-warmups` or send a few requests before you measure.
4. **Ignoring the clock.** A GPU that throttles or that other work shares runs slower. Record `nvidia-smi --query-gpu=clocks.sm,temperature.gpu --format=csv -l 1` during the run. Compare two runs only at similar clocks.

```

**Questions**

1. Before you read any table, list what differed between the two filings besides the server.
2. Which cells of the TTFT table isolate the client, and what is the size of the client effect?
3. Which cells isolate the temperature, and which metric does temperature move most?
4. Why does one round at one user not count against the throughput finding?
5. The two clients send different prompts. Why is that a confound here and not a cause?
6. Write the benchmark rule that would have prevented this dispute, in four lines.

:::answer Show the answer
:::say Short answer
No regression and no broken client. The two reports measured two methods. On this server, the SGLang client reads a median TTFT 3 to 10 percent higher and an output 2 to 8 percent lower than `vllm bench serve` at 16 and 64 users, with a prompt confound inside that gap, and temperature 0.7 adds 10 to 13 percent to the time per token at one user against temperature 0. The two vLLM clients agreed within noise, which is the size of a real difference on this card.
:::

**Walkthrough**

1. **List the variables first.** The two filings differ in the client, the dataset the client draws from, the temperature and the session, and so in the clock and the cache state. The server is the one thing they share. A disagreement of this size has four candidate causes before the server is one of them.
2. **Read the setup.** The third teammate's run holds four of those variables fixed. One server. The clock sat between 420 and 495 MHz for every run, throttled but steady, so the clock cannot separate the clients. The prefix cache was flushed before every run. Two rounds, interleaved by client, so drift over the session hits every client alike. Every run sent 512 tokens in and 128 out with seed 1 and ignored the end token.
3. **Isolate the client in the TTFT table.** Compare cells at the same temperature across the columns. At one user and temperature 0, the SGLang client read 154 and 164 ms, `vllm bench` 149 and 150, and its Rust version 144 and 144. At 16 users: 1,077 and 1,045 against 1,033 and 1,027. At 64 users: 1,688 and 1,838 against 1,624 and 1,667. The SGLang client reads a higher first token in every cell. The two vLLM clients agree with each other within the noise, which puts the noise floor at a few milliseconds at one user and tens at 64.
4. **Isolate the temperature.** Compare rows at the same client. For the SGLang client at 16 users, temperature 0.7 read 1,212 and 1,089 ms against 1,077 and 1,045 at 0. The notes under the tables give the metric that temperature moves most: the median TPOT was about 10 to 13 percent higher at one user, 34 ms against 30, and 3 to 6 percent higher at 16 and 64 users. Throughput was 3 to 10 percent lower. Sampling costs the server a kernel per token, and the client pays nothing for it, so the server is slower at 0.7 by that much on this card.
5. **Read the throughput table with its outlier.** At 16 users the SGLang client read 218 and 216 tokens per second against 222 and 222. At 64 users, 359 and 348 against 379 and 377. At one user, one SGLang round read 39.9 against about 32 for every other round. One round out of two cannot stand as a finding, so the notes give no throughput gap at one user. The gap at 16 and 64 users is 2 to 8 percent, and the TTFT gap is 3 to 10 percent.
6. **Name the confound.** The SGLang client drew its prompts from `random-ids`, and `vllm bench` from `random`. The two clients therefore sent different token sets, and part of a gap of a few percent can be the prompts, not the client code. The run cannot split those two, so it reports the combined client effect and names the confound. A cause would need the same prompts through both clients.
7. **Put the two filings together.** The first filing is the SGLang client at 0.7. The second is `vllm bench` at 0. The gap between them is the client effect plus the temperature effect, measured on different days with no shared clock record. Nothing in it points at the image.

**Resolution**

No regression and no broken client. The two reports measured two methods. On this server, the SGLang client reads a median TTFT 3 to 10 percent higher and an output 2 to 8 percent lower than `vllm bench serve` at 16 and 64 users, with a prompt confound inside that gap, and temperature 0.7 adds 10 to 13 percent to the time per token at one user against temperature 0. The two vLLM clients agreed within noise, which is the size of a real difference on this card.

The rollback is cancelled. The team's rule has four lines: one client, one dataset and one temperature, written next to every number; interleaved rounds, at least two; a cache flush before each run; and the SM clock recorded, because the only reason this comparison held is that the clock stayed at 420 to 495 MHz throughout. A future report that uses a different client or temperature is a new baseline, not a comparison.

**Wrong turns**

- "The server regressed, roll back the image." The two filings changed the client and the temperature at the same time, in different sessions. The controlled run shows that those two alone account for a gap of this size.
- "The SGLang client is broken, because it reads a slower server." Both vLLM clients also read a slower server at 0.7 than at 0, and the SGLang client's offset is 3 to 10 percent with a prompt confound inside it. A client that reads a few percent higher is a different ruler, not a wrong one.
- "Average the two filings." They measure different things. A mean of a run at 0.7 and a run at 0 is a number for a temperature nobody serves.
- "Run at one user, where the numbers are tightest." At one user one SGLang round read 39.9 tokens per second against about 32 for every other round. Small loads are not immune to outliers, and a single outlier flips a two-round cell.

**Generalize**

A benchmark number is a property of the whole method, not of the server. Two numbers are comparable only when every part of the method that is not the thing under test stays fixed: the client, the dataset, the sampling settings, the cache state, the clock and the order of the runs. When two reports disagree, list what differed before you blame the system, and measure the size of each difference with a run that changes one thing at a time.

:::

## Two of two evals failed, and none of them ran

*Level 3 · incident · about 25 minutes · version: docker-agent v1.149.0 and sbx v0.47.0; model: ai/qwen3:4b through the local model runner, as the subject and as the judge; hardware: one Mac, no GPU*

A nightly job scores the files agent against two saved eval sessions, with a local model as the judge. Last night the job printed `Errors: 2/2 evaluations failed` and a total cost of zero, and it blocked a pull request. The author of the pull request was told that the agent regressed. The author replied that the change was one word in the instruction and asked for the sessions, and there were none.

The on-call engineer tried again with the models gateway flag on the command, pointed at the address that containers use for the model runner. That attempt exited 1 before it ran anything, with an HTTP 403 in the last line. A third attempt, with the same address set in the environment of the eval containers, ran both evals. You review the three runs and the two scores that came out of the third one.

**Evidence: the eval run that blocked the pull request**

```text
title: the eval run that blocked the pull request
source: manuals/docker-sandboxes-101/capture/out/22-eval.txt
lines: 1-16
lang: console
note: Read the line under each failed eval before you read the summary.
---
$ docker-agent eval fixtures/agents/files.yaml fixtures/evals --judge-model dmr/ai/qwen3:4b -c 1 --output work/eval-results
Evaluation run: <run>
Loading evaluation sessions...
Validating judge model...
Pre-building 1 container image(s)...
Running 2 evaluations with concurrency 1

✗ Count the lines of README.md ($0.000000)
  ✗ running docker agent in container: container failed: exit status 1 (stderr: Error: failed to get models: docker --config=/root/.docker --context=default model status --json: : exec: "docker": executable file not found in $PATH)
✗ List the files in the working directory ($0.000000)
  ✗ running docker agent in container: container failed: exit status 1 (stderr: Error: failed to get models: docker --config=/root/.docker --context=default model status --json: : exec: "docker": executable file not found in $PATH)
[██████████] 100% (2/2) ✓0 ✗2

❌         Errors: 2/2 evaluations failed

Total Cost: $0.000000

```

**Evidence: the summary block of the first run**

```text
title: the summary block of the first run
source: manuals/docker-sandboxes-101/capture/out/22-eval-run.json
lines: 14-27
lang: json
note: Every total is 0, and sessions is null.
---
  "summary": {
    "total_evals": 2,
    "failed_evals": 2,
    "total_cost": 0,
    "sizes_passed": 0,
    "sizes_total": 0,
    "tools_f1_sum": 0,
    "tools_count": 0,
    "relevance_passed": 0,
    "relevance_total": 0,
    "assertions_passed": 0,
    "assertions_total": 0
  },
  "sessions": null

```

**Evidence: the second attempt, with the models gateway on the command**

```text
title: the second attempt, with the models gateway on the command
source: manuals/docker-sandboxes-101/capture/out/22-eval-gateway.txt
lines: 1-14
lang: console
note: The failure comes before any eval runs, and it names the judge.
---
$ docker-agent eval fixtures/agents/files.yaml fixtures/evals --judge-model dmr/ai/qwen3:4b -c 1 --models-gateway http://model-runner.docker.internal/engines --output work/eval-results-gateway
Evaluation run: <run>
Loading evaluation sessions...
Validating judge model...


Total Cost: $0.000000
Total Time: <dur>

Sessions DB: $CAPTURE/work/eval-results-gateway/<run>.db
Sessions JSON: $CAPTURE/work/eval-results-gateway/<run>.json
Log: $CAPTURE/work/eval-results-gateway/<run>.log
Error: running evaluations: judge model validation failed: streaming judge response: HTTP 403: POST "http://model-runner.docker.internal/engines/v1/chat/completions": 403 Forbidden 
[exit 1]

```

**Evidence: the third attempt, with the gateway passed to the containers**

```text
title: the third attempt, with the gateway passed to the containers
source: manuals/docker-sandboxes-101/capture/out/22-eval-container-env.txt
lines: 1-20
lang: console
note: Both evals ran. Read what the one remaining failure is about.
---
$ docker-agent eval fixtures/agents/files.yaml fixtures/evals --judge-model dmr/ai/qwen3:4b -c 1 -e DOCKER_AGENT_MODELS_GATEWAY=http://model-runner.docker.internal/engines --output work/eval-results-container-env
Evaluation run: <run>
Loading evaluation sessions...
Validating judge model...
Pre-building 1 container image(s)...
Running 2 evaluations with concurrency 1

✓ Count the lines of README.md ($0.000000)
  ✓ size S
  ✓ tool calls
  ✓ relevance 1/1
✗ List the files in the working directory ($0.000000)
  ✓ size S
  ✓ relevance 1/1
  ✗ tool calls score 0.67
[██████████] 100% (2/2) ✓1 ✗1 (tools ✗1)

✅          Sizes: 2/2 passed (100.0%)
✅     Tool Calls: 83.3% avg F1 (2 evals)
✅      Relevance: 2/2 passed (100.0%)

```

**Evidence: the expected tool calls of the list-files eval**

```text
title: the expected tool calls of the list-files eval
source: manuals/docker-sandboxes-101/capture/fixtures/evals/list-files.json
lines: 13-30
lang: json
note: One call to list_directory, and nothing else.
---
    {
      "message": {
        "agent_name": "root",
        "message": {
          "role": "assistant",
          "tool_calls": [
            {
              "id": "call_m101_ls",
              "type": "function",
              "function": {
                "name": "list_directory",
                "arguments": "{\"path\":\".\"}"
              }
            }
          ]
        }
      }
    },

```

**Evidence: the second tool call the agent made in the list-files eval**

```text
title: the second tool call the agent made in the list-files eval
source: manuals/docker-sandboxes-101/capture/out/22-eval-run-container-env.json
lines: 314-322
lang: json
note: The eval expected no call after list_directory.
---
              "tool_calls": [
                {
                  "id": "<call-id>",
                  "type": "function",
                  "function": {
                    "name": "shell",
                    "arguments": "{\"cmd\": \"wc -l README.md\", \"cwd\": \".\"}"
                  }
                }

```

**Evidence: the base URL of the model runner for each caller**

```text
title: the base URL of the model runner for each caller
source: manuals/docker-sandboxes-101/sections/6-5-dmr-compose-models-and-the-mcp-gateway-service.md
lines: 34-40
lang: text
note: The host and a container do not share a base URL.
---
| Caller | Base URL | Evidence |
|---|---|---|
| a process on the host | `http://localhost:12434` | [capture](manuals/docker-sandboxes-101/capture/out/25-models.json) |
| a container on Docker Desktop | `http://model-runner.docker.internal` | [capture](manuals/docker-sandboxes-101/capture/out/26-compose-up.txt) |
| a container on Docker Engine | `http://172.17.0.1:12434` | {{docs-dmr DMR REST API}}, not captured |
| a process on the host, through the Docker socket | `http://localhost/exp/vDD4.40` | [capture](manuals/docker-sandboxes-101/capture/out/25-model-status.json), `endpointHost` |
| `docker-agent` inside a sandbox, through its proxy | `http://host.docker.internal:12434` | [capture](manuals/docker-sandboxes-101/capture/out/27-inside-run.txt) |

```

**Questions**

1. The first run says that two evaluations failed. What in its output tells you whether any evaluation ran?
2. Why did the second attempt stop before the first eval, and what does the 403 name?
3. The third attempt turned a flag into an environment variable. Who reads the variable, and who does not?
4. Which number in the third run is a finding about the agent, and what did the agent do to earn it?
5. Rewrite the gate so that an eval that did not run cannot block a pull request as a regression.

:::answer Show the answer
:::say Short answer
The blocked pull request was an infrastructure failure. The eval containers had no way to find the model runner, and the first run scored nothing. The fix is the third command: pass the gateway to the containers with `-e`, and leave the judge on the host with its own address. The proof is in that run: two evals ran, sizes 2 of 2, relevance 2 of 2, tool calls at an F1 of 83.3 percent, with cost still zero because a local model has no price. On a local runner the cost cannot tell a run from a non-run, so read the totals and the sessions.
:::

**Walkthrough**

1. **Read the line under each verdict.** Both evals carry the same reason: the agent container failed with exit status 1, and its stderr says that it could not get models because the `docker` executable was not found in the path. The agent inside the eval image looks for the model runner through the docker command line, and the pinned release image has no docker command line. The agent never answered a prompt. Nothing was scored.
2. **Read the summary block.** `failed_evals` is 2, and every other count is 0: `total_cost`, `sizes_total`, `tools_count`, `relevance_total`. `sessions` is null. A failed verdict with zero totals and no sessions is an eval that never started, not an agent that did badly.
3. **Read the gateway attempt.** The flag moved the model address for the whole command. The judge is validated first, and the judge runs on the host, not in a container. The host cannot reach the container-only name, so the judge check failed with HTTP 403, and the command exited 1 before it built a container. The 403 names the judge request, not the agent.
4. **Read the container-variable attempt.** `-e DOCKER_AGENT_MODELS_GATEWAY=...` sets the variable inside the eval containers only. The judge kept its host address. Both evals ran. Sizes passed 2 of 2, relevance passed 2 of 2, and tool calls averaged an F1 of 83.3 percent. One eval still failed, on `tool calls score 0.67`.
5. **Read the expected calls and the extra call.** The list-files eval expects one assistant turn with one `list_directory` call. The agent made that call, and then a second call to `shell` with `wc -l README.md`. One expected call, two actual calls, F1 of 0.67. This is the only number in the three runs that says something about the agent: it did one step more than the saved session.
6. **Read the base URL table.** One model runner, and a different base URL for each caller: a host process uses `localhost:12434`, a container uses `model-runner.docker.internal`, and a sandboxed agent goes through the sandbox proxy. The judge and the subject ran in two places, so they needed two addresses.

**Resolution**

The blocked pull request was an infrastructure failure. The eval containers had no way to find the model runner, and the first run scored nothing. The fix is the third command: pass the gateway to the containers with `-e`, and leave the judge on the host with its own address. The proof is in that run: two evals ran, sizes 2 of 2, relevance 2 of 2, tool calls at an F1 of 83.3 percent, with cost still zero because a local model has no price. On a local runner the cost cannot tell a run from a non-run, so read the totals and the sessions.

The gate changes in two ways. It fails the job as broken when the error count is above 0, and it reports a regression only from evals that ran. And the remaining 0.67 becomes a decision for a person: the agent added a line count with `shell` after the directory listing. If that extra call is wanted, the saved session gains a second expected call. If it is not, the instruction changes. Either way the eval did its job, which is to catch a call that the saved session did not ask for.

**Wrong turns**

- "The agent regressed, revert the pull request." No eval ran. Both failures are container errors, every total in the summary is 0, and `sessions` is null.
- "Put the gateway flag on the command so the containers find the runner." The flag also moves the judge, which runs on the host and cannot reach a container-only name. The run fails with 403 before any eval starts.
- "Rebuild the eval image with the docker command line inside." The release image is pinned, and the containers lacked an address, not a binary. The eval command has `-e` to hand them that address.
- "Add the `shell` call to the expected list and move on." First decide whether the extra call is wanted. The eval exists to catch a call the saved session did not ask for.

**Generalize**

An eval result has two layers: whether the eval ran, and what it scored. Zero totals and no sessions say the first layer failed, so read the error under the verdict before the verdict. Separate errors from failures in the gate. And remember that a judge and a subject can run in different places, with different addresses for the same service.

:::

## Uniform prompt lengths that hid the stall

*Level 3 · incident · about 25 minutes · version: vLLM 0.31.0 against SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory*

A team that serves `Qwen/Qwen3-8B` on L4 cards runs an engine evaluation before a contract renewal. The load test is the benchmark client's default shape: 64 prompts with 16 users at once, every prompt 512 tokens and every answer 128 tokens. Engine A reads a P99 inter-token gap of 502 ms and a median first-token wait of 1,499 ms. Engine B reads 81 ms and 1,775 ms. The output is the same, 181.7 against 182.3 tokens per second. The evaluation calls engine A's stream "unusable" and schedules a migration to engine B.

A support engineer points out that production prompts run from a few tokens to several thousand, and that nobody has seen a 500 ms gap in production on engine A. The team repeats the test with the client's length ratio at 0.5 and at 0, where lengths vary, and the two engines change places on the stream metric. You are asked which result is the one to act on.

**Evidence: the waves workload on the L4 by length ratio, both engines**

```text
title: the waves workload on the L4 by length ratio, both engines
source: manuals/vllm-101/sections/r-7-lab-notes.md
lines: 98-107
lang: text
note: Read the P99 ITL column at ratio 1, then at ratio 0.
---
### L4, waves: 64 prompts at 16 users, by length ratio (1.0 means equal lengths)

| Ratio | Config | Output tok/s (min to max) | Median TTFT | Median TPOT | P99 ITL (min to max) | Median SM clock |
|---|---|---|---|---|---|---|
| 0 | `vllm` | 174.4 (164.1 to 195.0) | 284 ms | 75.0 ms | 202 (180 to 215) ms | 1,493 MHz |
| 0 | `sglang` | 158.2 (146.7 to 176.9) | 283 ms | 86.7 ms | 302 (287 to 305) ms | 1,485 MHz |
| 0.5 | `vllm` | 169.6 (165.2 to 173.4) | 353 ms | 81.4 ms | 191 (189 to 219) ms | 1,455 MHz |
| 0.5 | `sglang` | 159.6 (155.8 to 162.0) | 325 ms | 87.8 ms | 363 (360 to 370) ms | 1,470 MHz |
| 1 | `vllm` | 181.7 (181.7 to 182.8) | 1,499 ms | 76.8 ms | 502 (500 to 503) ms | 1,410 MHz |
| 1 | `sglang` | 182.3 (181.5 to 182.7) | 1,775 ms | 74.7 ms | 81 (79 to 81) ms | 1,440 MHz |

```

**Evidence: how the length ratio sets the prompt and output lengths**

```text
title: how the length ratio sets the prompt and output lengths
source: manuals/vllm-101/sections/r-7-lab-notes.md
lines: 11-11
lang: text
note: At 1.0 every request has the same two lengths.
---
- **Waves.** The waves workload sends 64 prompts at 16 users. The length ratio sets how far the prompt and output lengths can vary. At 1.0 every request has 512 prompt and 128 output tokens. At 0 each length is drawn at random from 1 token up to that size.

```

**Evidence: total input tokens sent at each ratio, seed 1**

```text
title: total input tokens sent at each ratio, seed 1
source: manuals/sglang-101/capture/gpu/out-l4/waves-default-input-tokens.txt
lang: text
note: Mixed lengths send fewer tokens than fixed lengths.
---
ratio 1.0, seed 1: Total input tokens: 32768 
ratio 0.5, seed 1: Total input tokens: 24504 
ratio 0.0, seed 1: Total input tokens: 17870 

```

**Evidence: five consecutive scheduler lines from a run at ratio 1.0**

```text
title: five consecutive scheduler lines from a run at ratio 1.0
source: manuals/sglang-101/capture/gpu/out-l4/server-waves-default.log
lang: text
note: Count the running requests in the first line, then watch the two prefill batches and the decode that follows.
---
[2026-10-17 15:54:33] Prefill batch, #new-seq: 8, #new-token: 4096, #cached-token: 1, token usage: 0.34, #running-req: 1, #queue-req: 0, #pending-token: 513, cuda graph: True, input throughput (token/s): 3509.80
[2026-10-17 15:54:34] Prefill batch, #new-seq: 8, #new-token: 3583, #cached-token: 0, token usage: 0.34, #running-req: 8, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 3503.78
[2026-10-17 15:54:35] Decode batch, #running-req: 16, #token: 8240, token usage: 0.34, cuda graph: True, gen throughput (token/s): 2.62, #queue-req: 0
[2026-10-17 15:54:37] Decode batch, #running-req: 16, #token: 8880, token usage: 0.37, cuda graph: True, gen throughput (token/s): 231.07, #queue-req: 0
[2026-10-17 15:54:40] Decode batch, #running-req: 16, #token: 9520, token usage: 0.40, cuda graph: True, gen throughput (token/s): 229.85, #queue-req: 0

```

**Evidence: how the SGLang manual reads the two traffic shapes**

```text
title: how the SGLang manual reads the two traffic shapes
source: manuals/sglang-101/sections/5-3-reading-other-peoples-benchmarks.md
lines: 270-274
lang: text
note: The last paragraph gives the mechanism.
---
**We measured** a different winner for each traffic shape. With fixed lengths, the two engines tied on throughput. They made the same trade as at a full pool. The vLLM server gave the first token sooner, 1,499 against 1,775 ms, outside the seed spread. SGLang kept the stream smooth, with a P99 ITL of 81 against 502 ms.

With mixed lengths, vLLM led. At a ratio of 0.5 it gave 169.6 against 159.6 tok/s, 6 percent more and outside the seed spread. Its median time per token was 81.4 against 87.8 ms, and its P99 ITL was 191 against 363 ms. At 0.0 the throughput ranges overlapped, and vLLM still had the lower time per token and the lower P99 ITL. Every median clock was 1,410 MHz or higher.

Our reading: when new prompts arrive one by one, each prefill shares a step with the running decodes. The vLLM server split that work so that the stream stalled less.

```

**Evidence: SGLang with the mixed chunk against vLLM, by ratio**

```text
title: SGLang with the mixed chunk against vLLM, by ratio
source: manuals/sglang-101/sections/5-3-reading-other-peoples-benchmarks.md
lines: 289-297
lang: text
note: Read the three P99 ITL values on each row, then the cost at fixed lengths.
---
| Length ratio | Output tok/s, SGLang mixed chunk / vLLM | Median TPOT, SGLang mixed chunk / vLLM | P99 ITL, SGLang default / mixed chunk / vLLM |
|---|---|---|---|
| 1.0, fixed lengths | 182.3 / 181.7 | 73.1 / 76.8 ms | 81 / 203 / 502 ms |
| 0.5, mixed | 171.8 / 169.6 | 80.8 / 81.4 ms | 363 / 193 / 191 ms |
| 0.0, mixed | 171.9 / 174.4 | 76.8 / 75.0 ms | 302 / 196 / 202 ms |

**We measured** that the mixed chunk closed the gap. With mixed lengths, SGLang now tied vLLM on throughput, time per token, and P99 ITL, and every seed range overlapped. Against SGLang without the flag, the P99 ITL fell from 363 to 193 ms at 0.5 and from 302 to 196 ms at 0.0. The output rose by about 8 percent.

The flag had a cost with fixed lengths. The median P99 ITL rose from 81 to 203 ms, and the three seeds spread from 83 to 349 ms. When a whole wave arrives together, the prefills now share steps with the decodes, so the stream loses the clean gaps that it had before. The vLLM server stayed worse there, at 502 ms.

```

**Evidence: the caveats of the ratio test and the rule for using it**

```text
title: the caveats of the ratio test and the rule for using it
source: manuals/sglang-101/sections/5-1-sglang-benchmark-serving.md
lines: 247-255
lang: text
note: The last paragraph says which ratio to use for what.
---
**We measured** a first token 6.9 times slower with fixed lengths on BF16, and 11.8 times slower on FP8. The FP8 runs at the two ratios had median clocks of 1,185 and 2,040 MHz. So part of the FP8 factor is the clock. Mixed lengths sent fewer tokens. In seed 1 they sent 17,870 input tokens at a ratio of 0.0, against 32,768 at 1.0. So part of the gap is less work.

The cache can explain another part. In each seed, the run at 1.0 came first and started with an empty cache. The runs at 0.5 and 0.0 came after it. Each of their prompts is the first part of a prompt from the run at 1.0. The BF16 pool of 24,094 tokens held only part of the 32,768 tokens of that run. The FP8 pool of 142,369 tokens could hold all of them.

Less work and the cache do not explain the other half of the result. With mixed lengths, P99 ITL rose from 82 to 300 ms. New prompts arrived one by one, and each prefill stopped the running decodes. With fixed lengths, prefill happened only between waves.

The GB10 gave the same shape with Qwen3-30B-A3B, three seeds per point. With fixed lengths, the BF16 median TTFT was 1,650 ms and P99 ITL 169 ms. With mixed lengths, they were 320 ms and 230 ms. FP8 went from 1,050 ms and 92 ms to 188 ms and 127 ms. Two GPUs and two models show the same trade, so on both of our machines it came from the workload, not from the hardware.

The two settings measure two different servers. Fixed lengths measure bursts: a slow first token and smooth tokens after it. Mixed lengths measure steady traffic: a fast first token and stalls in the stream. Keep `--random-range-ratio 1.0` when you compare two builds, because it repeats exactly. Before you set a latency target from it, run your real length distribution too.

```

**Questions**

1. Explain, from the length ratio definition, what identical lengths at 16 users do to the arrival pattern.
2. Read the five log lines. What happened in the second before the first line, and what did the scheduler do in the next two?
3. Why does the engine that keeps the stream smooth in waves lose that advantage when lengths vary?
4. The mixed-length runs sent fewer input tokens. What else differs between the two shapes, and what can you still compare?
5. One SGLang flag cut its mixed-length tail almost in half. What did it cost, and when would you turn it on?
6. Decide the renewal: which result, which flag, and which test you put into the contract.

:::answer Show the answer
:::say Short answer
The migration decision rested on a traffic shape that production never produces. Identical lengths at a fixed user count synchronize the requests into waves, and in waves engine A's choice to admit new prompts into running steps costs a 502 ms tail that engine B avoids by prefilling between waves. With the lengths production has, engine A had the lower tail, 191 against 363 ms at 0.5 and 202 against 302 at 0, the same or better first token, and more output. On the support engineer's evidence, the 500 ms gap belongs to the test.
:::

**Walkthrough**

1. **Read what the ratio does.** At a ratio of 1.0 every request has 512 prompt tokens and 128 output tokens. At 0, each length is drawn at random from 1 token up to that size. With identical lengths at a fixed user count, all 16 requests start together, finish together, and their replacements arrive together. The traffic comes in waves. With mixed lengths, requests end at different times and new prompts arrive one by one.
2. **See the wave in the log.** In the first line only one request is running, so fifteen had just finished at once. The scheduler prefilled their replacements in two batches, 4096 and then 3583 new tokens, with no decode in between. Then all 16 decoded together: the generation throughput reads 2.62 tokens per second on the step that carried the prefill, then 231.07 and 229.85 on the steps after it. Prefill happened only between waves, so the decode steps had clean gaps and the first token of a whole wave waited for two full prefill batches.
3. **Read the table at ratio 1.** The engines tie on output, 181.7 against 182.3. vLLM gives the first token sooner, 1,499 against 1,775 ms, and SGLang keeps the stream smooth, with a P99 ITL of 81 against 502 ms. That is the same choice the two engines make at a full pool: one admits the new prompts into the running steps, the other finishes the wave's prefill first.
4. **Read the table at ratios 0.5 and 0.** With mixed lengths vLLM led. At 0.5 it gave 169.6 against 159.6 tokens per second, a median TPOT of 81.4 against 87.8 ms and a P99 ITL of 191 against 363 ms. At 0 the P99 ITL was 202 against 302 ms and the first token 284 against 283 ms. The SGLang manual's reading: when new prompts arrive one by one, each prefill shares a step with the running decodes, and vLLM split that work so the stream stalled less. The vLLM manual describes the mechanism as the batch token budget: in each step the running streams get their next token first, and a waiting prompt fills the rest.
5. **Account for the confounds.** Mixed lengths sent fewer tokens: 32768 input tokens at 1.0 in seed 1, 24504 at 0.5 and 17870 at 0. The runs at 0.5 and 0 also came after the run at 1.0 on the same server, so part of their first-token gain can be the cache. The SGLang manual says that less work and the cache do not explain the stream: with mixed lengths its P99 ITL rose from 82 to 300 ms because each prefill stopped the running decodes. So compare the shape of each row and the ranking inside a row, not the absolute throughput across rows.
6. **Read the mixed-chunk test.** With `--enable-mixed-chunk`, SGLang puts the running decodes into the prefill batch. On mixed lengths it then tied vLLM: the P99 ITL fell from 363 to 193 ms at 0.5 and from 302 to 196 ms at 0, with every seed range overlapping, and the output rose by about 8 percent. On fixed lengths the flag cost: the P99 ITL rose from 81 to 203 ms, with seeds from 83 to 349 ms, while vLLM stayed at 502. The log shows one prefill of 514 tokens with 15 requests decoding in the same batch.
7. **Decide what each setting measures.** The SGLang manual states it: fixed lengths measure bursts, a slow first token and smooth tokens after it; mixed lengths measure steady traffic, a fast first token and stalls in the stream. Keep the ratio at 1.0 to compare two builds, because it repeats exactly. Run your real length distribution before you set a latency target.

**Resolution**

The migration decision rested on a traffic shape that production never produces. Identical lengths at a fixed user count synchronize the requests into waves, and in waves engine A's choice to admit new prompts into running steps costs a 502 ms tail that engine B avoids by prefilling between waves. With the lengths production has, engine A had the lower tail, 191 against 363 ms at 0.5 and 202 against 302 at 0, the same or better first token, and more output. On the support engineer's evidence, the 500 ms gap belongs to the test.

The renewal keeps engine A. If the team prefers engine B for other reasons, `--enable-mixed-chunk` removes its mixed-length disadvantage at a cost in bursts, 81 to 203 ms, so the choice depends on whether production arrives in bursts or steadily. The contract test changes: sample the real length distribution from production logs, run it as the acceptance test, and keep the fixed-length run only as the repeatable build-to-build check. Record the clock on both; every median clock in the mixed-length pairs was 1,410 MHz or higher, which is why those rows are comparable.

**Wrong turns**

- "A 502 ms tail is a scheduler bug in engine A." The same engine read 202 ms at a ratio of 0 and 191 at 0.5. The tail came from 16 prefills landing in the same steps, which the test created and production does not.
- "Identical lengths are the fairest test, because nothing varies." They are the most repeatable, not the most realistic. They measure bursts, and the SGLang manual says to use them for build comparisons, not for latency targets.
- "Raise the token budget so prefills finish sooner." On the DGX Spark, a budget of 16,384 tokens raised the P99 ITL from 574 to 798 ms at a low rate, and the gain in the first token did not clear the seed spread. The budget trades the two latencies; it does not remove the stall.
- "Compare throughput, the engines tie, so it does not matter." The tie on output hid a 502 against 81 ms tail in one shape and a 363 against 191 ms tail in the other. Users feel the tail.
- "Turn on the mixed chunk everywhere on engine B." On fixed-length bursts it raised the P99 ITL from 81 to 203 ms with seeds up to 349. It fixes steady traffic and hurts bursts, so measure your traffic shape first.

**Generalize**

A load test with one prompt length tests one point of the length distribution, and at a fixed user count it also synchronizes the requests, so it measures a burst that steady traffic never produces. The ranking of two schedulers can flip between those shapes. Sample the real distribution of lengths for every latency target, keep the fixed-length run for repeatability, and read the tail next to the median in both.

:::

## A conformance score of 32.3 percent

*Level 4 · incident · about 30 minutes · version: A2A 1.0.1 with the manual's capture kit (the test-runner, code-reviewer and deployer agents); model: no model; the agents are deterministic fixtures; hardware: one machine, localhost, no network*

A team's A2A server is ready for its first release. The release gate runs the official conformance kit, `a2a-tck` at the tag `1.0.0.alpha2`, against the server and requires a passing score. The dashboard shows an overall compatibility of 32.3 percent, and the gate is red. The engineering lead opens a ticket with the title "fix the 63 failing JSON-RPC checks" and asks you for an estimate.

The server under test is the kit's `test-runner` agent. Its card declares a JSON-RPC and an HTTP+JSON interface, streaming and push notifications, and no gRPC. You have the record of two runs against it on the same day: the first with the TCK as published, and the second after a two-line change to the TCK's own JSON-RPC client, repeated against the server after one fix. Your job is to say which failures belong to the server, which belong to the test kit, and what the gate should read.

**Evidence: the numbers of the two runs, from compatibility.json and pytest**

```text
title: the numbers of the two runs, from compatibility.json and pytest
source: manuals/a2a-101/research/tck-run.md
lines: 76-90
lang: text
note: Compare the two columns row by row. The transport rows count records, and the top rows count requirements.
---
| | Run 1, tag as published | Run 2, exact JSON-RPC URL, fixed kit |
|---|---|---|
| overall_compatibility | 32.3% | 66.7% |
| must_compatibility | 35.4% | 72.0% |
| should_compatibility | 14.3% | 14.3% |
| may_compatibility | 0.0% | 50.0% |
| requirements PASS / FAIL / SKIPPED / NOT TESTED (of 129) | 30 / 63 / 11 / 25 | 62 / 31 / 11 / 25 |
| MUST passed / failed / skipped (of 114) | 29 / 74 / 11 | 59 / 44 / 11 |
| SHOULD passed / failed / skipped (of 11) | 1 / 10 / 0 | 1 / 10 / 0 |
| MAY passed / failed / skipped (of 4) | 0 / 4 / 0 | 2 / 2 / 0 |
| pytest: passed / failed / skipped / xfailed (265 collected) | 70 / 44 / 149 / 2 | 119 / 21 / 125 / 0 |
| transport jsonrpc: passed / failed / skipped records | 12 / 63 / 10 (85) | 66 / 29 / 7 (102) |
| transport http_json | 59 / 30 / 6 (95) | 65 / 24 / 6 (95) |
| transport agent_card | 6 / 4 / 0 (10) | 6 / 4 / 0 (10) |
| transport grpc | 0 / 0 / 72 (72) | 0 / 0 / 72 (72) |

```

**Evidence: why there is a second run: where the TCK posted its JSON-RPC requests**

```text
title: why there is a second run: where the TCK posted its JSON-RPC requests
source: manuals/a2a-101/research/tck-run.md
lines: 44-44
lang: text
note: One paragraph. Find the URL the client built, what the server answered, and how many records that cost.
---
Why there is a run 2. The TCK's JSON-RPC client is an `httpx.Client(base_url=<interface url>)` that posts to `"/"` (`tck/transport/jsonrpc_client.py:81-85, 104-105, 138-141`). httpx appends a slash to every base URL and strips the leading slash of the request path (`httpx/_client.py:234` `_enforce_trailing_slash`, `:391-409` `_merge_url`), so every JSON-RPC request went to `http://localhost:41251/a2a/jsonrpc/`, which is not the URL in the card. The kit routes JSON-RPC only at the exact path (`a2a_ref.py:549`) and answers `404 {"error": {"code": 404, "status": "NOT_FOUND", "message": "No such path"}}`; the TCK's own reference SUT declares its JSON-RPC interface at the host root (`sut/a2a-python/sut_agent.py:199`), where `/` and `` are the same URL, so the TCK never meets this itself. 63 of the 85 JSON-RPC records in run 1 fail or skip for this one reason, which says nothing about the kit. Run 2 replaces `"/"` with `self.base_url` in the two `post`/`build_request` calls (`tck-run/tck-jsonrpc-url.patch`), nothing else. On `main` the client still posts to `"/"` but sets `follow_redirects=True` (`main jsonrpc_client.py:85`, commit `c478be0`), which rescues servers that redirect `/path/` to `/path`; the kit answers 404 rather than redirecting, so `main` would see the same 63 failures.

```

**Evidence: two accounting rules of the TCK that change how the numbers read**

```text
title: two accounting rules of the TCK that change how the numbers read
source: manuals/a2a-101/research/tck-run.md
lines: 96-99
lang: text
note: The first fact turns skips into failures. Read the counts after the rule on the main branch is applied.
---
Two accounting facts change how the numbers read.

1. The tag records a `pytest.skip()` raised inside a test body as a failure. The safety-net hook in `tests/compatibility/conftest.py:251-297` records any call-phase report that did not pass and did not call `record()` as FAIL with the skip tuple as the error text (`:271` tests only `report.passed`; `:292-297` records). `main` adds `if report.skipped: return` with the comment "Auto-recording it as a FAIL would misrepresent it" (`main conftest.py:310-318`). In run 2, 21 of the 31 FAIL requirements are of this kind (section 3.3). With `main`'s rule they are SKIPPED: PASS 62, FAIL 10, SKIPPED 32, NOT TESTED 25, which is overall 86.1% (62/72), MUST 89.4% (59/66), SHOULD 33.3% (1/3), MAY 66.7% (2/3).
2. The per-transport entry in `per_requirement[...].transports` is the last record written for that transport (`aggregator.py:105-111`), so a requirement with several tests on one transport can show `jsonrpc: PASS` next to a FAIL verdict (`JSONRPC-SSE-002`, `HTTP_JSON-ERR-001`, `HTTP_JSON-SVC-001`, `DM-ART-001`, `DM-MSG-001`). The summary files therefore carry the verdict as the status field and fold the per-transport records into the transport field.

```

**Evidence: the ten requirements that fail on a real assertion, by class**

```text
title: the ten requirements that fail on a real assertion, by class
source: manuals/a2a-101/research/tck-run.md
lines: 101-101
lang: text
note: Count how many are the server's own.
---
Of the 10 requirements that fail in run 2 on a real assertion, none fails on the kit's account at MUST level: seven are the TCK's (class b: CORE-SEND-003, HTTP_JSON-ERR-001, HTTP_JSON-SVC-001, JSONRPC-SSE-002, PUSH-CREATE-001, CARD-CACHE-003), two are the agent story (class c: DM-ART-001, DM-MSG-001) and two are SHOULD-level omissions the kit documents (class e: CARD-CACHE-001, CARD-CACHE-002). Section 4 has the kit-defect record.

```

**Evidence: the push requirements after the fix, verdict per binding**

```text
title: the push requirements after the fix, verdict per binding
source: manuals/a2a-101/research/tck-summary.txt
lines: 107-116
lang: text
note: Each line: id, level, verdict per transport, then the verdict the TCK records for the requirement.
---
PUSH-CREATE-001 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=FAIL FAIL
PUSH-CREATE-002 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=FAIL FAIL
PUSH-DEL-001 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=FAIL FAIL
PUSH-DEL-002 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=FAIL FAIL
PUSH-DELIVER-001 MUST grpc=SKIPPED,http_json=FAIL,jsonrpc=FAIL FAIL
PUSH-DELIVER-002 MUST grpc=SKIPPED,http_json=FAIL,jsonrpc=FAIL FAIL
PUSH-DELIVER-003 MUST grpc=SKIPPED,http_json=FAIL,jsonrpc=FAIL FAIL
PUSH-GET-001 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=FAIL FAIL
PUSH-GET-002 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=PASS PASS
PUSH-LIST-001 MUST grpc=SKIPPED,http_json=PASS,jsonrpc=FAIL FAIL

```

**Evidence: the one defect the run found in the server, and its fix**

```text
title: the one defect the run found in the server, and its fix
source: manuals/a2a-101/research/tck-run.md
lines: 183-187
lang: text
note: Read which binding lacked which routes, which rule of the specification that breaks, and how the repeat run verified the fix.
---
None remaining at MUST level.

One was found in the pre-fix run 2 and is recorded here because run 1 still shows it. **The HTTP+JSON binding did not serve the four push-notification-config operations.** The pre-fix `Handler.rest()` routed `message:send`, `message:stream`, `tasks`, `tasks/{id}`, `tasks/{id}:subscribe`, `tasks/{id}:cancel` and `extendedAgentCard`, and nothing under `tasks/{id}/pushNotificationConfigs`; the README said so. The card declares both `JSONRPC` and `HTTP+JSON` with `capabilities.pushNotifications: true`, and 5.1 says "When an agent supports multiple protocols, all supported protocols MUST: Identical Functionality: Provide the same set of operations and capabilities" (`spec:1145-1149`); 5.3 and 11.3.3 give the REST forms (`spec:1163-1166`, `spec:2797-2800`). Observed as `PUSH-CREATE-001` http_json FAIL (`[404] Method not found`) and five dependent skips.

Fixed in the kit on 2026-10-06: `a2a_ref.py` gained `rest_push()` (`:626-648`) with `POST /tasks/{id}/pushNotificationConfigs` (body is the config; `find` then `add_push`), `GET /tasks/{id}/pushNotificationConfigs/{configId}`, `GET /tasks/{id}/pushNotificationConfigs` (`prune({"configs": ...})`) and `DELETE /tasks/{id}/pushNotificationConfigs/{configId}`, behind the `pushNotifications` capability guard (`:630-631`) and answering `application/a2a+json`; `rest()` dispatches to it at `:681-682`; the README sentence was removed. Verified by the repeat of run 2 (PUSH-CREATE-001, PUSH-CREATE-002, PUSH-GET-001, PUSH-LIST-001, PUSH-DEL-001 and PUSH-DEL-002 PASS on http_json; pytest 119 passed, up from 113) and by hand check 7 (create, get, list, missing id 404, delete, get-after-delete 404, delete-again 200, unknown task 404).

```

**Evidence: where the TCK departs from the specification, in order of effect**

```text
title: where the TCK departs from the specification, in order of effect
source: manuals/a2a-101/research/tck-run.md
lines: 193-200
lang: text
note: Eight numbered items. The first two explain most of the failures in this run.
---
1. JSON-RPC requests go to `<url>/`, not the card's `url` (`jsonrpc_client.py:104-105, 138-141`; httpx `_merge_url`). Costs 63 of 85 JSON-RPC records in run 1; `main` only follows redirects.
2. The JSON-RPC client sends snake_case parameters (`task_id`, `history_length`, `context_id`, `page_size`, `include_artifacts`) against 5.5's MUST camelCase (`spec:1204`); the REST client sends camelCase. With the fixed kit this is the only reason PUSH-CREATE-001 and the five push requirements behind it fail, and it would have neutralised CORE-HIST-002 and the CORE-LIST filters. Unchanged on `main`.
3. Success and error Content-Type must contain `application/json` (`binding_http_json.py:58-70, 98-110`; checks at `test_transport_behavior.py:260`, `test_error_handling.py:621`, `test_problem_details.py:101`) against 11.1's `application/a2a+json` SHOULD (`spec:2750`). Fails HTTP_JSON-SVC-001 and HTTP_JSON-ERR-001 for a server that follows the specification. Unchanged on `main`.
4. CORE-SEND-003 carries no `expected_error`, so the required `ContentTypeNotSupportedError` is counted as a failure (`core_operations.py:95-122`).
5. The wrong-Content-Type test sends a Python `repr` and expects `-32005` where 9.5 says `-32700` (`test_error_codes.py:219-223`); fixed on `main` (`37d4944`), after which the kit's accepting answer makes the test skip.
6. SHOULD and MAY card-caching tests hard-fail instead of `xfail`/skip (`test_agent_card_caching.py:98, 121, 154, 187`), against the TCK's own `README.md:66-74`.
7. A `pytest.skip()` in a test body is recorded as FAIL (`conftest.py:251-297`); fixed on `main` (`conftest.py:310-318`). Turns 21 skipped requirements into failures in run 2.
8. Latent here, from `tck/requirements/base.py:269-331`: `TaskNotCancelableError` 409 (spec 400, `spec:1183`), `ContentTypeNotSupportedError` 415 (spec 400, `spec:1186`), `InvalidAgentResponseError` 502 (spec 500), and `UNIMPLEMENTED` for three errors the spec maps to `FAILED_PRECONDITION`. The kit uses the spec's codes (`a2a_ref.py:20-33`); the only test that touches these accepted 404 for a nonexistent task (`test_http_status.py:78-104`), and the 415 test skipped.

```

**Questions**

1. Which single cause explains most of the first run, and whose defect is it?
2. After the second run, why do most of the remaining failed requirements still say nothing about the server?
3. Of the requirements that fail on a real assertion, how many are the server's, and at which level?
4. The push requirements pass on one binding and fail on the other. What does the TCK record for each one, and why?
5. What was the one real defect, which rule does it break, and how was the fix verified?
6. Write the release rule: what does the gate read, and what does it do with a failure that the test kit owns?

:::answer Show the answer
:::say Short answer
The 32.3 percent measured how the TCK built a URL, and the 66.7 percent measured how it counted a skip. By requirement, the server breaks no MUST. Its one real defect, found by the second run, was the missing push routes on HTTP+JSON, and the fix is verified by six records and eight hand checks. Two SHOULD omissions remain and are documented. The release rule reads `compatibility.json` per requirement, never the percentage. It classifies every non-pass as the server's, the TCK's, the sample agent's, unsupported by design, or untested. It blocks only on a MUST failure that is the server's own, tracks the SHOULD omissions, and files each TCK defect upstream with the wire check that proves it. It also keeps a list of what the TCK does not test at this tag, among them binding equivalence, card signatures and owner scoping, and the team tests those itself.
:::

**Walkthrough**

1. **Read the two runs.** Run 1 scored 32.3 percent: 30 requirements passed, 63 failed, 11 were skipped and 25 were not tested, of 129. On the JSON-RPC transport 12 records passed, 63 failed and 10 were skipped, of 85. Run 2 scored 66.7 percent: 62 passed, 31 failed, 11 skipped, 25 not tested, and the JSON-RPC transport read 66, 29 and 7 of 102 records. All 72 gRPC records were skipped in both runs, because the card declares no gRPC interface. The server did not change between the two scores, apart from the push fix, and that fix moved no verdict.
2. **Read why run 2 exists.** The TCK's JSON-RPC client posts to `/` on an HTTP client whose base is the interface URL. The library appends a slash to the base, so every request went to the card's URL plus a trailing slash. The server routes JSON-RPC at the exact URL and answers 404 with "No such path". 63 of the 85 JSON-RPC records in run 1 fail or skip for this one reason. The TCK's own reference server declares its interface at the host root, where the two URLs are the same, so the kit never meets its own defect. The specification requires an interface to declare its URL, and nothing requires a server to also answer at the URL with a slash. The two-line change replaces `/` with the base URL, and every one of those records passes.
3. **Read the accounting.** The tag records a skip raised inside a test body as a failure. The main branch of the TCK fixed that and wrote why: recording it as a failure would misrepresent it. In run 2, 21 of the 31 failed requirements are such skips, most of them from a prerequisite that expects an agent that parks a task in an input-required state, which `test-runner` never does. With the main rule the run reads 62 passed, 10 failed, 32 skipped, 25 not tested: 86.1 percent overall and 89.4 percent on MUST requirements. The second rule: the per-transport entry is the last record written, so a requirement can show a pass on a transport beside a failed verdict.
4. **Read the ten.** None fails on the server's account at MUST level. Seven are the TCK's: a required content-type error counted as a failure, two content-type substring checks that want `application/json` where the specification prefers `application/a2a+json`, a test that sends a non-JSON body and expects -32005 where the specification gives -32700, the snake_case `task_id` on push creation, and a MAY that the test asserts. Two come from the TCK's sample agent story, which expects fixed outputs that this agent does not produce. Two are SHOULD omissions the server documents: no `Cache-Control` and no `ETag` on the card.
5. **Read the push rows.** Six push requirements show `http_json=PASS`, `jsonrpc=FAIL`, and the verdict FAIL, because a requirement fails when any transport fails. The JSON-RPC side fails because the TCK sends `task_id` where the specification's camelCase rule gives `taskId`. The server reads `taskId`, finds no task, and answers -32001. The HTTP+JSON client sends camelCase and passes. `PUSH-GET-002` passed on JSON-RPC for the same wrong reason: the server answered not found for every config id, so the test never checked a real one.
6. **Read the defect.** Before the fix, the HTTP+JSON binding served no route under `tasks/{id}/pushNotificationConfigs`, while the card declared both bindings with push notifications on. Section 5.1 of the specification says that all supported protocols must provide the same set of operations. The run recorded it as `PUSH-CREATE-001` failing on HTTP+JSON with "404 Method not found" and five dependent skips. The fix added the four REST routes behind the same capability guard. The repeat of run 2 flipped six HTTP+JSON records to pass and raised the pytest count from 113 to 119, and eight hand checks covered create, get, list, a missing id, delete, get after delete, delete again, and an unknown task.
7. **Read the departures.** Eight, in order of effect: the trailing slash, the snake_case parameters, the content-type substring, the missing expected error on one requirement, the non-JSON body, hard asserts on SHOULD and MAY tests, the skip recorded as a failure, and latent status codes of 409, 415 and 502 where the specification says 400, 400 and 500. Two of the eight are fixed on the main branch of the TCK.

**Resolution**

The 32.3 percent measured how the TCK built a URL, and the 66.7 percent measured how it counted a skip. By requirement, the server breaks no MUST. Its one real defect, found by the second run, was the missing push routes on HTTP+JSON, and the fix is verified by six records and eight hand checks. Two SHOULD omissions remain and are documented. The release rule reads `compatibility.json` per requirement, never the percentage. It classifies every non-pass as the server's, the TCK's, the sample agent's, unsupported by design, or untested. It blocks only on a MUST failure that is the server's own, tracks the SHOULD omissions, and files each TCK defect upstream with the wire check that proves it. It also keeps a list of what the TCK does not test at this tag, among them binding equivalence, card signatures and owner scoping, and the team tests those itself.

**Wrong turns**

- "Fix the 63 failures." 63 records fail for one reason that lives in the test client, and no rule requires a server to answer at the URL plus a slash. A two-line change in the TCK removes all of them.
- "Rename the JSON-RPC parameters to snake_case so the push checks pass." The specification requires camelCase, and the TCK's own HTTP+JSON client sends camelCase and passes. The server would break the specification to satisfy the kit.
- "Send application/json so the content-type checks pass." The specification prefers `application/a2a+json`, and the implementations split. Accept both when you read, and keep sending what the specification prefers.
- "Ship when the percentage reaches a threshold." The percentage counts PASS and FAIL only. The skip rule alone moves it from 66.7 to 86.1 with no change to the server, so a threshold measures the TCK version.
- "The push checks pass on HTTP+JSON, so binding equivalence is covered." The four equivalence requirements are not tested at this tag. The defect was caught by accident through a push test, and the next gap will not be.

**Generalize**

A conformance score is a measurement, and the instrument has its own defects. Before you act on the number, read per requirement, separate the instrument's failures from the subject's, run again after the instrument is fixed, and ask what the instrument does not measure at all. The one real defect here sat in the gap between two bindings, a place the kit did not test.

:::
