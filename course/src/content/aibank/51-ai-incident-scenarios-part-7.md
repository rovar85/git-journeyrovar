---
track: aibank
title: "AI incident scenarios, read the evidence (part 7 of 10)"
short: Incidents 7
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## A split benchmark that counted failures as wins

*Level 3 · incident · about 20 minutes · version: SGLang 0.5.22 with the mooncake_tcp transfer backend; model: Qwen/Qwen3-8B; hardware: two L4s in one node, the second shared with another team*

A team wants to stop long prompts from pausing other users' streams, so they split `Qwen/Qwen3-8B` into a prefill server on the first L4 and a decode server on the second L4, behind the router. The two cards have no RDMA, so the KV cache moves over TCP. The second card also runs another team's pods.

They run the fixed-rate sweep through the router. At a fixed rate of 8 per second, the summary prints 240 successful requests of 240 and output throughput of 751.85 tokens per second, higher than the 728.61 of their best single server at the same rate. The slide is ready. A reviewer reads the summary once more and stops at one line: the mean time to first token is 0.00 ms.

**Evidence: the transfer backend and the two KV pools at startup**

```text
title: the transfer backend and the two KV pools at startup
source: manuals/sglang-101/capture/gpu/incidents/l4-pd-mooncake-tcp-queue.txt
lines: 1-3
lang: text
note: Compare the token count of the two pools.
---
[2026-10-17 10:50:46] disaggregation transfer backend 'mooncake_tcp' -> mooncake with MC_FORCE_TCP=1 (TCP transport, no RDMA)
[2026-10-17 10:51:06] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 24094, K size: 1.65 GB, V size: 1.65 GB
[2026-10-17 10:51:05] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 2925, K size: 0.20 GB, V size: 0.20 GB

```

**Evidence: the decode server waits, the transfer queue fills, the session dies**

```text
title: the decode server waits, the transfer queue fills, the session dies
source: manuals/sglang-101/capture/gpu/incidents/l4-pd-mooncake-tcp-queue.txt
lines: 4-9
lang: text
note: Read the running and pre-allocated counts in the first line, then the rejection count and the session line.
---
[2026-10-17 10:54:07] Decode batch, #running-req: 2, #token: 1206, token usage: 0.41, pre-allocated usage: 0.00, #prealloc-req: 19, #transfer-req: 0, #retracted-req: 0, cuda graph: True, gen throughput (token/s): 18.98, #queue-req: 0
W1017 10:54:14.179170 883755 tcp_transport_lane_impl.h:1330] TCP lane queue-full rejection count: 4096
[2026-10-17 10:54:14] Session 151.242.195.41:15367 failed.
[2026-10-17 10:54:14] Prefill transfer failed for request rank=0 req.rid='3d27bab753fa45338a40b508fda1077f' req.bootstrap_room=540297584272915152 with exception KVTransferError(bootstrap_room=540297584272915152): Failed to send kv chunk of 540297584272915152 to 151.242.195.41:34809
[2026-10-17 10:54:14] Prefill transfer failed for request rank=0 req.rid='75bbdaa9279948399010049259adb752' req.bootstrap_room=5255199250850718981 with exception KVTransferError(bootstrap_room=5255199250850718981): Decode instance could be dead, remote mooncake session 151.242.195.41:15367 is not alive
[2026-10-17 10:54:14] Decode transfer failed for request rank=0 decode_req.req.rid='df321d30a3ca4921857c744d12207682' decode_req.req.bootstrap_room=540297584272915152 with exception KVTransferError(bootstrap_room=540297584272915152): Failed to get kvcache from prefill instance, it might be dead

```

**Evidence: the count of failed transfers and the benchmark summary at 8 requests per second**

```text
title: the count of failed transfers and the benchmark summary at 8 requests per second
source: manuals/sglang-101/capture/gpu/incidents/l4-pd-mooncake-tcp-queue.txt
lines: 10-14
lang: text
note: Compare the successful requests with the retokenized tokens and the mean TTFT.
---
Prefill transfer failed lines: 2902
Successful requests:                     240       
Total generated tokens:                  30720     
Total generated tokens (retokenized):    0         
Mean TTFT (ms):                          0.00      

```

**Evidence: the summary lines of the sweep with prefill on the full card and decode on the shared card**

```text
title: the summary lines of the sweep with prefill on the full card and decode on the shared card
source: manuals/sglang-101/capture/gpu/incidents/l4-pd-summary-lines.txt
lines: 2-8
lang: text
note: Follow the retokenized tokens and the throughput as the load grows.
---
load/pd/c1-s1: Successful requests: 16 |Total generated tokens: 2048 |Total generated tokens (retokenized): 2048 |Output token throughput (tok/s): 5.60 |
load/pd/c2-s1: Successful requests: 16 |Total generated tokens: 2048 |Total generated tokens (retokenized): 512 |Output token throughput (tok/s): 71.70 |
load/pd/c4-s1: Successful requests: 16 |Total generated tokens: 2048 |Total generated tokens (retokenized): 0 |Output token throughput (tok/s): 2516.97 |
rate/pd/r0.5-s1: Successful requests: 32 |Total generated tokens: 4096 |Total generated tokens (retokenized): 896 |Output token throughput (tok/s): 62.42 |
rate/pd/r0.5-s2: Successful requests: 32 |Total generated tokens: 4096 |Total generated tokens (retokenized): 0 |Output token throughput (tok/s): 113.28 |
rate/pd/r1-s1: Successful requests: 32 |Total generated tokens: 4096 |Total generated tokens (retokenized): 0 |Output token throughput (tok/s): 161.76 |
rate/pd/r8-s1: Successful requests: 240 |Total generated tokens: 30720 |Total generated tokens (retokenized): 0 |Output token throughput (tok/s): 751.85 |

```

**Evidence: the same sweep with the roles swapped**

```text
title: the same sweep with the roles swapped
source: manuals/sglang-101/capture/gpu/incidents/l4-pd-summary-lines.txt
lines: 9-14
lang: text
note: Find the user count where the retokenized tokens stop matching the generated tokens.
---
load/pd-swap/c1-s1: Successful requests: 16 |Total generated tokens: 2048 |Total generated tokens (retokenized): 2048 |Output token throughput (tok/s): 15.09 |
load/pd-swap/c2-s1: Successful requests: 16 |Total generated tokens: 2048 |Total generated tokens (retokenized): 2048 |Output token throughput (tok/s): 28.86 |
load/pd-swap/c4-s1: Successful requests: 16 |Total generated tokens: 2048 |Total generated tokens (retokenized): 2048 |Output token throughput (tok/s): 54.99 |
load/pd-swap/c8-s1: Successful requests: 32 |Total generated tokens: 4096 |Total generated tokens (retokenized): 4096 |Output token throughput (tok/s): 102.03 |
load/pd-swap/c16-s1: Successful requests: 64 |Total generated tokens: 8192 |Total generated tokens (retokenized): 2048 |Output token throughput (tok/s): 338.44 |
load/pd-swap/c32-s1: Successful requests: 128 |Total generated tokens: 16384 |Total generated tokens (retokenized): 0 |Output token throughput (tok/s): 333.41 |

```

**Questions**

1. Read the two pool lines. What asymmetry do they describe, and what does it do to a request that prefills on one card and decodes on the other?
2. The decode line shows 2 running requests and 19 pre-allocated. What is the decode server waiting for, and what piles up on the prefill side while it waits?
3. After the session failed, every later request still counted as a success. How can a router return a 200 with no text, and which two summary numbers expose it?
4. The swapped split worked up to 8 users and lost text from 16. What does that say about where the small pool hurts?
5. Write the rule that your benchmark kit applies before it prints a throughput number.
6. When is a prefill-decode split worth its new failure modes, and what measurement must exist before you keep one?

:::answer Show the answer
:::say Short answer
There is no measured result for the split under load on this pair of cards, and the team must not claim one. The transfer session between the two servers failed under the asymmetric pools and did not recover, and the router then counted empty responses as successes.
:::

**Walkthrough**

Start with the pools. The prefill server allocated a KV cache of 24,094 tokens, and the decode server, on the shared card, allocated 2,925 tokens. A request prefills on the large pool and must then find room on the small one. The decode pool holds about four requests of our size at once, so almost every request that the prefill side finishes has to wait for decode memory.

The second listing shows the wait. The decode server ran 2 requests, with 19 more pre-allocated and waiting for memory. Prefill kept producing KV caches for them, and the TCP transfer lane to decode filled: the log counts 4,096 queue-full rejections. About three minutes into the sweep the transfer session failed. Every transfer after that failed too, from both sides: prefill could not send its KV chunk, and decode could not get the cache from a prefill instance that it thought was dead. The session never came back.

The third listing is the dangerous part. The prefill log holds 2,902 transfer failures, and the benchmark still counts every one of its 240 requests as a success at that rate, with 30,720 generated tokens. Two numbers give it away. The retokenized token count is 0, so no text came back for the client to count. The mean TTFT is 0.00 ms, because no first token ever arrived. The router returned 200 for a request whose decode never ran, and the client counted the requested output length as generated. That is how a throughput of 751.85 came from a server that wrote nothing.

The sweep summary lines show that the split failed early at every load. At 2 users only 512 of 2,048 generated tokens came back as text, and at 4 users none did, while the printed throughput jumped to 2,516.97. The fixed-rate sweep lost most of its text from 0.5 requests per second. The swapped split, with decode on the full card and prefill on the shared one, worked from 1 to 8 users with every token retokenized. At 16 users 2,048 of 8,192 tokens came back as text, and at 32 users none did, while the printed throughput still read 333.41. So the small pool breaks the split on whichever side it sits, only later when it sits on the prefill side.

**Resolution**

There is no measured result for the split under load on this pair of cards, and the team must not claim one. The transfer session between the two servers failed under the asymmetric pools and did not recover, and the router then counted empty responses as successes.

Three fixes follow. First, the benchmark kit refuses any run in which every request has a time to first token of 0, and reports `Total generated tokens (retokenized)` next to the generated count on every summary. Second, a split needs two pools of a size that matches the traffic, which the shared card could not give, and the metrics `sglang:num_transfer_failed_reqs_total` and `sglang:num_bootstrap_failed_reqs_total` must stay flat during the run. Third, the team goes back to one server, measures the inter-token latency when long prompts arrive, and splits only if that measurement shows prefill interference that data-parallel copies behind the gateway cannot remove.

**Wrong turns**

- "The split gave 751.85 tokens per second, more than the single server." The retokenized token count was 0. The throughput counted tokens that the client asked for, not tokens that arrived.
- "240 successful requests of 240 means the router and both servers are healthy." The router returned 200 for requests whose transfer had failed. Only the retokenized count and the first-token time show that the text was empty.
- "Raise the transfer queue size so the lane does not reject." The lane filled because decode could hold two requests in a 2,925-token pool. A larger queue delays the same failure.
- "Give decode the full card, then the split works." The swapped split lost text from 16 users and everything at 32. The small pool breaks the split on either side, only at a different load.
- "Add a fifth check later, the slide is due." A throughput number from a run with no text is not late, it is wrong. The acceptance rule belongs in the kit before the first slide.

**Generalize**

A pipeline of two services can report success at the boundary while the work never happened, because the component that answers the client is not the component that failed. Every benchmark summary needs a check that the output exists, not only that the request returned, and every split architecture needs a single-server baseline and a transfer-failure counter before its number means anything.

:::

## An RL speedup that was not an effect

*Level 3 · incident · about 25 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory, with a heat guard that pauses the run at 84 C*

A teammate posts a result in the team channel: keeping the rollout engine loaded between phases makes the rollout 12 percent faster. The post shows two runs on the GB10, a baseline with a median rollout of 59.1 s and the new setting at 52.0 s, and proposes to make the new setting the default. The same post reports a reward gain of 0.01 from a second change, on one seed, with a loss curve that "looks better".

A reviewer asks for the run manifest. The two runs were four days apart. The memory fraction for the engine was not the same in the second run either. The medians cover different steps, because the heat guard put the container on hold whenever the GPU reached 84 C, 1,005 times that week. A third teammate, who wants the trainer and engine log probabilities to agree more closely, has switched the engine to FP16 and left the trainer in BF16.

**Evidence: the rollout time per step of every run, over all steps and over clean steps**

```text
title: the rollout time per step of every run, over all steps and over clean steps
source: manuals/miles-101/capture/gpu/out-gb10/unpaused-timing.txt
lang: text
note: Compare the two median columns of each row, and read the count of clean steps.
---
Rollout time per step, all steps against steps whose rollout window overlaps no heat-guard pause.
Pauses in the heat-guard log: 1005. Source: summary/miles-gb10-lab.json, median_unpaused.

run                              steps  all_median_s  unpaused_median_s  unpaused_steps
plain                               12          57.2               57.2              12
plain-48                            48          47.5               47.5              48
plain-48-s2                         48          86.2               52.0               4
plain-48-s3                         48          90.9               36.1               7
e6a-base                            12          83.9               59.1               6
e6b-det-triton                      12          84.5               82.0               8
e6c-det-flashinfer                  12          87.3               77.3               7
e6d-det-triton-repeat               12          94.2               81.9               7
e11-topp-topk                       12          74.5               66.8               7
e3b-offload-kv                      12          97.5               57.8               5
e3c-no-offload-rollout              12          63.2               52.0               7
e3d-no-offload-train                12          81.2               59.8               6
e4-0.6b                              4          12.4               12.3               3
e4-1.7b                              4          30.0               30.0               4
e2-n4                               24          32.5               32.5              14
e2-n16                              24         188.2                  -               0
e3e-base-frac025                    12         102.0               60.7               4
e3f-no-offload-rollout-frac025      12         102.2               56.7               3
e2b-dapo-filter                     12         340.7                  -               0

```

**Evidence: the same-day pair that changed only the engine offload**

```text
title: the same-day pair that changed only the engine offload
source: manuals/miles-101/sections/2-2-choose-what-to-offload.md
lines: 30-33
lang: text
note: The two medians cover different clean steps.
---
| Setting | Clean rollout steps | Clean rollout median | Trainer offload, all steps | Trainer onload, all steps | Weight update, all steps |
|---|---|---|---|---|---|
| default offload | 4 of 12 | 60.7 s | 0.73 s | 0.76 s | 0.62 s |
| engine kept loaded | 3 of 12 | 56.7 s | 0.75 s | 0.82 s | 0.64 s |

```

**Evidence: three seeds of the same 48-step run**

```text
title: three seeds of the same 48-step run
source: manuals/miles-101/sections/5-3-repeat-a-run.md
lines: 15-19
lang: text
note: Read the spread of the reward over the last 8 steps.
---
| Seed | Reward, first 8 steps | Reward, last 8 steps | Length, first 8 | Length, last 8 | Cut share, first 8 | Cut share, last 8 |
|---|---|---|---|---|---|---|
| default (1234) | 0.636 | 0.758 | 724 | 447 | 0.33 | 0.08 |
| 2 | 0.653 | 0.736 | 712 | 480 | 0.30 | 0.12 |
| 3 | 0.614 | 0.766 | 734 | 456 | 0.34 | 0.09 |

```

**Evidence: the engine settings of five runs, read from their logs**

```text
title: the engine settings of five runs, read from their logs
source: manuals/miles-101/capture/gpu/out-gb10/engine-settings.txt
lines: 4-9
lang: text
note: Find the rows that differ in exactly one column.
---
run                    attention_backend  enable_deterministic_inference  sampling_backend  --rollout-top-p  --rollout-top-k
e6a-base               flashinfer         False                           flashinfer        not set          not set
e6b-det-triton         triton             True                            pytorch           not set          not set
e6c-det-flashinfer     flashinfer         True                            pytorch           not set          not set
e6d-det-triton-repeat  triton             True                            pytorch           not set          not set
e11-topp-topk          flashinfer         False                           flashinfer        0.95             64

```

**Evidence: the image digest, the commit and the engine version that every run used**

```text
title: the image digest, the commit and the engine version that every run used
source: manuals/miles-101/capture/gpu/out-gb10/image-identity.txt
lang: console
note: Three commands, run before the first run and kept with the results.
---
$ docker image inspect --format "{{index .RepoDigests 0}} {{.Architecture}}" radixark/miles:latest
radixark/miles@sha256:c64fa344e3a86715f03c0a1b6a422c474e0035355591a2f6da87bf52a74c52da arm64
$ docker run --rm --entrypoint git radixark/miles:latest -C /root/miles log -1 --format="%h %cs %s"
08752a1283 2026-10-15 fix(ci): keep host networks out of the builder disk cleanup (#4130)
$ docker run --rm --entrypoint /opt/sglang/bin/python3 radixark/miles:latest -c "import sglang;print(sglang.__version__)"
0.5.22.dev46+g7b6993a

```

**Evidence: the log probability gap between the engine and a trainer forward pass, by dtype**

```text
title: the log probability gap between the engine and a trainer forward pass, by dtype
source: manuals/miles-101/capture/gpu/out-l4/logprob-gap-by-dtype.txt
lines: 10-20
lang: text
note: Compare the rows that change the dtype on one side with the row that changes it on both.
---
engine   trainer   median    p90      mean     max
BF16     BF16      0.0073    0.087    0.027    0.355
BF16     FP16      0.0079    0.053    0.019    0.279
BF16     FP32      0.0076    0.053    0.019    0.280
FP16     BF16      0.0085    0.061    0.021    0.265
FP16     FP16      0.00094   0.010    0.0032   0.033
FP16     FP32      0.0010    0.0068   0.0024   0.023

FP16 on both sides cuts the median gap about 7.8x against BF16 on both sides, the mean about 8.4x, and the worst token about 10x.
FP16 on one side only does not help: 0.0079 and 0.0085.
The BF16 engine stays at about 0.0076 even against FP32, so the BF16 rounding of the engine sets that floor.

```

**Questions**

1. Two runs, two medians, 12 percent. List everything that differed between the runs before you believe the number.
2. The same-day pair shows 60.7 s against 56.7 s over different clean steps. Why is even that not enough, and what comparison is?
3. Three seeds of the baseline ended at 0.758, 0.736 and 0.766. What does a gain of 0.01 on one seed mean, and what would make it reportable?
4. The heat guard paused the container 1,005 times. How does a pause enter a median, and which steps may you time?
5. Predict from the dtype table what FP16 on the engine alone does to the gap.
6. Write the manifest that every run records before it starts, and the rule for reporting a change.

:::answer Show the answer
:::say Short answer
The 12 percent is withdrawn. The defensible statement is that keeping the engine loaded saved 0.6 to 1.8 s of a rollout of about a minute on the steps that were clean in both runs of a same-day pair, on one seed, which is inside the step-to-step noise of this machine under heat pauses. The default offload stays. The reward gain of 0.01 is not reportable until it appears on two seeds and falls outside the 0.736 to 0.766 spread of the baseline seeds.
:::

**Walkthrough**

Start with the timing table. Every row has two medians, one over all steps and one over the steps whose rollout overlapped no heat pause. For the baseline, `e6a-base`, they are 83.9 s and 59.1 s, from 6 clean steps of 12. For the two runs of the offload pair at a fraction of 0.25 they are 102.0 against 60.7 s and 102.2 against 56.7 s, from 4 and 3 clean steps. The 48-step run from before the heat guard existed, `plain-48`, has 47.5 s in both columns, because no pause could touch it. A 16-answer run has no clean step at all. So a median over all steps is a median over pauses, and the pause count differs between any two runs.

The same-day pair is the honest version of the claim. Only `--no-offload-rollout` differed, the fraction was 0.25 in both runs, and the clean medians were 60.7 s against 56.7 s. Even that is not a fair pair, because the two medians come from different steps. The rollout time follows the answer length, and answers get shorter as the model learns, from about 800 tokens in early steps to about 690 later. On the three steps that were clean in both runs the engine kept loaded saved 69.4 against 68.0 s, 58.5 against 56.7 s and 55.8 against 55.2 s. That is 0.6 to 1.8 s of a rollout of about a minute, 1 to 3 percent, on one seed. The original 12 percent came from a pair that changed the fraction as well and compared different steps.

The three seeds give the noise floor. Seeds 1234, 2 and 3 of the same 48-step recipe reached final rewards of 0.758, 0.736 and 0.766 over the last 8 steps, with answer lengths of 447, 480 and 456 tokens. All three learned, and the final reward still spread by 0.03 with nothing changed. One seed cannot see a gain of 0.01 inside that spread. A change of 0.05 on two seeds is worth a third run.

The engine settings table is what a manifest looks like after the fact. It was read from the server arguments line of each run log, and it shows which runs differ in one column only: the deterministic runs differ from the base in the flag, the sampler and sometimes the backend, and the top-p run differs in the two sampler flags alone. The identity listing is the other half, taken before the runs: the image digest, the commit inside the image and the version of the engine build. Without those three lines, a run from last week cannot be compared with one from today, because the `latest` tag moves.

The dtype table answers the third teammate before the run. With BF16 on both sides the median gap per token was 0.0073. With FP16 on the engine only it was 0.0085, and with FP16 on the trainer only 0.0079. Neither helped. With FP16 on both sides the median fell to 0.00094, about 7.8 times lower. The BF16 engine stayed near 0.0076 even against an FP32 trainer, so the rounding of the engine set that floor. A dtype change pays only when both sides make it.

**Resolution**

The 12 percent is withdrawn. The defensible statement is that keeping the engine loaded saved 0.6 to 1.8 s of a rollout of about a minute on the steps that were clean in both runs of a same-day pair, on one seed, which is inside the step-to-step noise of this machine under heat pauses. The default offload stays. The reward gain of 0.01 is not reportable until it appears on two seeds and falls outside the 0.736 to 0.766 spread of the baseline seeds.

Before it starts, every run now records the image digest, the commit, the engine version, the full command, the seeds and the names of its log files. During the run the trainer, the engine and the heat guard each write their own log, and at the end the run writes one exit code line. A change gets one run against a baseline from the same day with one setting different, two seeds, and a comparison on the same step numbers, from clean steps only. The dtype of the engine and the trainer move together or not at all, and deterministic inference is kept for repeating an experiment, because it made the engine repeat its step 0 exactly and left the gap at 0.01518 against 0.01526 while it cost 40 to 45 percent more rollout time.

**Wrong turns**

- "Both runs had pauses, so the medians over all steps are fair." The pauses are not equal. The two runs of the pair had 4 and 3 clean steps, and their all-step medians of 102.0 and 102.2 s sit forty seconds above their clean medians.
- "The run from before the heat guard is the clean baseline." Its 47.5 s covers 48 steps, with the late short answers inside. On the same 6 step numbers as the later run it took 60.9 s. Compare step numbers, not whole runs.
- "A gain of 0.01 is small but the curve looks better." Three seeds of the same recipe spread by 0.03 at the end. One seed cannot see 0.01.
- "Switch the engine to FP16 to lower the gap." On one side only the gap was 0.0085 and 0.0079, no better than 0.0073 with BF16 on both. Both sides or neither.
- "Turn on deterministic inference so runs are comparable." It makes the engine repeat itself and costs 40 to 45 percent of the rollout time. The gap stayed between 0.01515 and 0.01526, and the trainer still drifted from step 1.

**Generalize**

A measured difference is a claim about everything that differed between two runs, so write down what differed before you write down the number. Hold the machine, the code and the data identity fixed, change one thing, pay for a second seed, and compare like with like down to the step. A result that survives that is small, and it is yours.

:::

## An alert on a driver line that paged nine times

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-30B-A3B-Instruct-2507; hardware: one GB10 with 121.7 GiB of unified memory, shared with other users*

A platform team runs SGLang on desktop machines with unified memory, which several teams share. After a memory incident elsewhere, they add an alert rule to the kernel log: page on-call whenever the GPU driver logs `NV_ERR_NO_MEMORY`. On the first afternoon the rule pages nine times between 13:52 and 16:46. Each page is a burst of 3 to 13 identical lines inside one minute, then silence.

On-call finds no user complaint, no failed request and every server healthy. The team proposes to keep the rule and raise its threshold so that only a long burst pages. You review the alert design before the next on-call week, with the burst table, the server log of one start on that machine and the manual.

**Evidence: the kernel log bursts that the alert rule matched, by minute**

```text
title: the kernel log bursts that the alert rule matched, by minute
source: manuals/sglang-101/capture/gpu/incidents/gb10-driver-no-memory.txt
lang: text
note: Nine bursts in one afternoon. The last line is the message that each burst repeats.
---
count  minute (UTC)  kernel message, NVIDIA driver on the GB10
      3 2026-10-16T13:52
      9 2026-10-16T14:36
     13 2026-10-16T14:55
     10 2026-10-16T15:04
      7 2026-10-16T15:30
      7 2026-10-16T15:47
     12 2026-10-16T15:58
      9 2026-10-16T16:11
      7 2026-10-16T16:46
NVRM: nvCheckOkFailedNoLog: Check failed: Out of memory [NV_ERR_NO_MEMORY] (0x00000051) returned from _memdescAllocInternal(pMemDesc) @ mem_desc.c:1359

```

**Evidence: a server start on the same machine: the probe before and after the ready line**

```text
title: a server start on the same machine: the probe before and after the ready line
source: manuals/sglang-101/capture/gpu/out-gb10/server-default.log
lines: 38-45
lang: text
note: The first health check returns 503 during startup, and the probe after the ready line returns 200.
---
[2026-10-17 14:19:12] INFO:     127.0.0.1:38426 - "GET /health HTTP/1.1" 503 Service Unavailable
[2026-10-17 14:19:13] INFO:     127.0.0.1:38432 - "GET /model_info HTTP/1.1" 200 OK
[2026-10-17 14:19:13] Prefill batch, #new-seq: 1, #new-token: 6, #cached-token: 0, token usage: 0.00, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 3.82
[2026-10-17 14:19:13] INFO:     127.0.0.1:38444 - "POST /generate HTTP/1.1" 200 OK
[2026-10-17 14:19:14] INFO:     127.0.0.1:38452 - "POST /freeze_gc HTTP/1.1" 200 OK
[2026-10-17 14:19:14] The server is fired up and ready to roll!
[2026-10-17 14:19:14] Prefill batch, #new-seq: 1, #new-token: 1, #cached-token: 0, token usage: 0.00, #running-req: 0, #queue-req: 0, #pending-token: 0, cuda graph: False, input throughput (token/s): 0.88
[2026-10-17 14:19:15] INFO:     127.0.0.1:38462 - "GET /health HTTP/1.1" 200 OK

```

**Evidence: the weights and the pool of one start on unified memory**

```text
title: the weights and the pool of one start on unified memory
source: manuals/sglang-101/capture/gpu/out-gb10/server-default.log
lines: 18-20
lang: text
note: The pool takes tens of GB in about three seconds, and every other program on the machine sees that memory go.
---
[2026-10-17 14:18:29] Load weight end. elapsed=323.61 s, type=Qwen3MoeForCausalLM, avail mem=54.84 GB, mem usage=57.75 GB.
[2026-10-17 14:18:32] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 227243, K size: 10.40 GB, V size: 10.40 GB
[2026-10-17 14:18:32] Memory pool end. avail mem=31.22 GB

```

**Evidence: what the manual says about the driver line and what it could not match**

```text
title: what the manual says about the driver line and what it could not match
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 125-138
lang: text
note: Read the paragraph after the listing, then the position at the end.
---
The NVIDIA driver also reports memory errors at startup. The kernel log of the GB10 holds bursts of this line:

'''listing
title: the driver line at server startup
source: capture/gpu/incidents/gb10-driver-no-memory.txt
lang: text
note: The last line of the file. The lines above it count the bursts per minute.
---
NVRM: nvCheckOkFailedNoLog: Check failed: Out of memory [NV_ERR_NO_MEMORY] (0x00000051) returned from _memdescAllocInternal(pMemDesc) @ mem_desc.c:1359
'''

The bursts are dated 2026-10-16, the day of our first test and sweep starts on the GB10. We did not keep the server logs of that day, so we cannot match each burst to one start. Every server in our later captures became healthy and finished its benchmarks.

**Our position:** on unified memory, the KV pool is memory that the whole machine gives up. Pass `--mem-fraction-static` on purpose, and tell the other users of the machine before you start. Do not alert on the driver line alone. Alert when a server does not become healthy.

```

**Evidence: the row of the incident index for this line**

```text
title: the row of the incident index for this line
source: manuals/sglang-101/sections/r-3-incident-index.md
lines: 15-15
lang: text
note: Symptom, cause, status and section, in that order.
---
| Driver `NV_ERR_NO_MEMORY` on a GB10 ([record](manuals/sglang-101/capture/gpu/incidents/gb10-driver-no-memory.txt)) | Bursts of driver out-of-memory lines in the kernel log | The bursts fall on 2026-10-16, the day of our first starts. We did not keep the server logs of that day, so we cannot match each burst to one start | Every server in our later captures became healthy. Alert on health, not on this line | [3.2](#s-mem-fraction-static-and-startup-sizing) |

```

**Questions**

1. Read the burst table. What pattern do the timestamps and the counts show, and what does a server do at those moments?
2. The server log shows a 503 and then a 200 on the health route. Which signal did on-call need, and did the rule carry it?
3. The manual could not match each burst to one start. Why not, and what does that say about the evidence you keep?
4. Design the alert: which signal pages a person, which signal is a diagnostic, and where does the driver line go?
5. Which runbook turns this page into a five-minute check instead of an investigation?

:::answer Show the answer
:::say Short answer
The rule measured allocations, not failures. It paged on every start of a healthy server, nine times in one afternoon, and gave on-call nothing to act on. The rule is retired as a pager and kept as a diagnostic counter. The pages that replace it are the health transitions: a start that does not reach its ready line in its budget, and a ready server whose probe fails. On the days with server logs, every start on that machine reached its ready line, so the health rule pages zero times where the driver rule paged on every start.
:::

**Walkthrough**

1. **Read the shape of the bursts.** Nine minutes carry lines, over about three hours of 2026-10-16, and every burst sits inside a single minute. The manual dates them: that was the day of the first test and sweep starts on that machine. A server start on unified memory is a burst of allocation. In the startup listing the weights settle at 57.75 GB, and three seconds later the pool takes 10.40 GB for keys and 10.40 GB for values. The manual's position is that every other program on the machine sees that memory go. The driver line is something the machine prints around a start, and the rule paged on starts.
2. **Read the signal that matters.** In the server log the first health probe returns 503 at 14:19:12, because the server is still starting. Two seconds later the ready line prints, and the probe at 14:19:15 returns 200. That transition answers the on-call question: did the server come up and serve? The driver line answers nothing about that. It fires on an allocation whether the start succeeds or fails, so it carries no health information at all.
3. **Read what could not be matched.** The manual says the server logs of that day were not kept, so no burst can be matched to one start, and that every server in the later captures became healthy and finished its benchmarks. The incident index records the same status and the same rule: alert on health, not on this line. The evidence lesson sits inside that sentence. A kernel line without the server log of the same minute is a clue with no suspect. Keep both logs, with timestamps, or you cannot say which process caused which line.
4. **Design the alert.** Page on a server that does not reach its ready line inside its start budget, and on a server that stops answering its readiness probe after it was ready. Page on a queue that grows for longer than the users accept. Turn the driver line into a counter on the dashboard, attached to a page as context and never a page on its own. On a shared machine of this kind the manual adds two more measures: run the server in a container with a memory limit, and log the free memory of the machine once a second during startup, so that the next burst comes with the number that explains it.
5. **Write the runbook.** The SRE lesson gives the shape: symptom, hypothesis, verify, act. Symptom: a burst of the driver line. Hypothesis: a server allocated its pool in that minute. Verify: find a start in the server log within the same minute, and read the health transition after its ready line. Act: nothing if the server became healthy; if a start failed, the startup page of the manual takes over. With the logs kept, this is a five-minute check.

**Resolution**

The rule measured allocations, not failures. It paged on every start of a healthy server, nine times in one afternoon, and gave on-call nothing to act on. The rule is retired as a pager and kept as a diagnostic counter. The pages that replace it are the health transitions: a start that does not reach its ready line in its budget, and a ready server whose probe fails. On the days with server logs, every start on that machine reached its ready line, so the health rule pages zero times where the driver rule paged on every start.

Two changes to the evidence come with it. The kernel log and the server log of each machine are kept together, so that a future burst can be matched to a process. During startup the machine's free memory is logged once a second, which puts the allocation that the driver line reports next to the pool size the server prints. The threshold proposal is dropped, because a higher threshold silences a rule that was never a signal.

**Wrong turns**

- "Raise the threshold so that only a long burst pages." The bursts were 3 to 13 lines. A threshold above them silences the rule on a day like this one, and on a worse day it still says nothing about whether a server serves.
- "Lower the memory fraction until the driver stops complaining." Nobody matched a burst to a start, so nobody knows that a smaller pool removes the line, and a smaller pool costs users at every load. Set the fraction on purpose for the shared machine, for its own reason.
- "Keep the page, a driver error is always serious." Every server in the later captures became healthy. A page with no action teaches on-call to ignore pages.
- "Drop the line from the log pipeline." Keep it as a diagnostic next to the health signal. It dates an allocation, and with the server logs kept it names the process.

**Generalize**

Alert on the symptom a user would feel, and keep the mechanism lines as diagnostics. A line that fires on normal work pages you on every success. Before a rule pages a person, replay it against a known-good day, and keep the logs that let you match each firing to a cause.

:::

## An empty list that an agent read as none

*Level 3 · incident · about 25 minutes · version: rea 6.7.0 at 27dc42d with the Ghidra provider; model: no model; the fixtures are the ledger binaries built at -O1 and -O2; hardware: one aarch64 Mac*

A coding agent investigates the arm64 executable `ledger-arm64-O1` through the rea MCP server, with the Ghidra provider behind it. Its task is a security review of the division in `_percent_change`. The agent calls `analyze_function` once and writes in its report: "The function is a leaf. It calls nothing, so the division cannot reach a callback or a handler." A reviewer asks where that sentence comes from. The agent points at one line of the dossier, the `callees` array, which is empty.

The reviewer does not accept the line as proof and asks you to say what the dossier does and does not establish. You have the dossier, the row of the same record in the bundle summary, and the manual pages that describe both. The report is due in an hour, and the sentence about the leaf is the one that the rest of the review rests on.

**Evidence: the callees array of the dossier**

```text
title: the callees facet of the _percent_change dossier
source: manuals/reverse-engineering-101/capture/out/10-mcp-09-analyze-function-percent-change-O1.json
lines: 1052-1053
lang: json
note: The array that the agent read as proof. The incoming references start on the next line.
---
          "callees": [],
          "incoming_references": [

```

**Evidence: the unresolved_calls array of the same dossier**

```text
title: the unresolved_calls facet of the same dossier
source: manuals/reverse-engineering-101/capture/out/10-mcp-09-analyze-function-percent-change-O1.json
lines: 1244-1245
lang: json
note: Also empty. Read it together with the coverage block before you decide what empty means.
---
          "unresolved_calls": [],
          "referenced_strings": [],

```

**Evidence: the relationship_coverage block of the record**

```text
title: the relationship_coverage block at the end of the record
source: manuals/reverse-engineering-101/capture/out/10-mcp-09-analyze-function-percent-change-O1.json
lines: 1899-1905
lang: json
note: Read the status, then the diagnostic sentence that says what complete covers.
---
        "relationship_coverage": {
          "status": "complete",
          "diagnostics": [
            "Only resolved Ghidra call references are returned; unresolved computed or indirect calls remain unknown, while function classifications distinguish thunks and externals."
          ]
        },
        "locations": [],

```

**Evidence: the ten limitations of the record**

```text
title: the ten limitations of the record
source: manuals/reverse-engineering-101/capture/out/10-mcp-09-analyze-function-percent-change-O1.json
lines: 1887-1897
lang: json
note: The seventh string names the flows that the callees facet cannot hold.
---
        "limitations": [
          "The session serves operations only after Ghidra reports default auto-analysis complete; incomplete analysis does not expose partial results.",
          "The imported Program and temporary project are ephemeral and deleted on close. Annotation operations edit session database metadata; original executable bytes are never written.",
          "Cancelling an active Ghidra request terminates its ephemeral database and discards session annotations. The selected target remains open; the next provider query imports the original artifact again.",
          "Default-space addresses use lowercase 0x-prefixed hexadecimal; other address spaces use <percent-encoded-space>:0x<hex>.",
          "References cover the complete Ghidra function-body AddressSet and exact entry. Dossier incoming edges omit sources owned by that function; procedure_references also retains those internal edges.",
          "The dossier combines Ghidra FunctionManager, Listing, ReferenceManager, BasicBlockModel, and decompiler observations; provider-specific pseudocode and assembly are not cross-provider text invariants.",
          "Resolved reference metadata identifies computed, indirect, external, call, jump, and data edges; unresolved targetless flows remain unknown, and function classifications distinguish thunks and externals.",
          "Synthetic Ghidra entry-point references without actionable memory sources are omitted.",
          "The Java bridge serializes one function request per Program and lets each decompilation run until it completes or the caller cancels.",
          "macOS sessions require a matching executable Ghidra native decompiler; REA checks for it but does not build native components or change Gatekeeper quarantine state."

```

**Evidence: the value_flow counts of the same record in the bundle summary**

```text
title: the _percent_change row of the bundle summary
source: manuals/reverse-engineering-101/capture/out/11-inspect-evidence-bundle-O1.json
lines: 237-255
lang: json
note: The value_flow object gives counts with a truncated flag, which the callees array does not.
---
      "operation": "analyze_function",
      "confidence": "observed",
      "authority": "shipped-artifact",
      "analysis_profile_digest": "3fc72c9b4b78498fb992b938f8f3389dc670244a293c1d40abf5e1d10162ed3b",
      "retention": "complete-record",
      "limitation_count": 10,
      "native_dossier": {
        "available": true,
        "procedure_address": "0x100000500",
        "procedure_name": "_percent_change",
        "value_flow": {
          "status": "observed",
          "truncated": false,
          "omitted_operations_lower_bound": 0,
          "known_omitted_inputs": 0,
          "known_omitted_edges": 0
        }
      }
    }

```

**Evidence: the head of the bundle summary**

```text
title: the head of the bundle summary
source: manuals/reverse-engineering-101/capture/out/11-inspect-evidence-bundle-O1.json
lines: 1-6
lang: json
note: Eight records and zero unknown revisions, because no unknown was recorded before the export.
---
{
  "kind": "evidence-bundle-summary",
  "filters": {},
  "total_retained_records": 8,
  "matching_records": 8,
  "unknown_revisions": 0,

```

**Evidence: the assembly facet of the same dossier**

```text
title: the assembly facet of the same dossier
source: manuals/reverse-engineering-101/capture/out/10-mcp-09-analyze-function-percent-change-O1.json
lines: 1017-1024
lang: json
note: Six instructions. Count the ones that transfer control to another function.
---
          "assembly": [
            "0x100000500: cbz w0, 0x100000514",
            "0x100000504: sub w8, w1, w0",
            "0x100000508: mov w9, #0x64",
            "0x10000050c: mul w8, w8, w9",
            "0x100000510: sdiv w0, w8, w0",
            "0x100000514: ret"
          ],

```

**Questions**

1. The callees array is empty. Name two different states of the world that produce that same line.
2. Which field of the record says how complete the callees set is, and what does its value cover?
3. The limitations list is long. Which one qualifies the callees array, and how does it change the sentence in the report?
4. The bundle summary reports counts for the value flow. Why does rea stand behind a zero there and not behind an empty array in the dossier?
5. What evidence in the same record settles whether the function makes a call? Write the sentence that the report should carry instead.
6. If no facet settled the question, what would you record, and what would close it?

:::answer Show the answer
:::say Short answer
The claim in the report was right, and the evidence under it was wrong. The corrected sentence reads: "The assembly of `_percent_change` has six instructions and no call instruction; the dossier reports no resolved callee with complete coverage over resolved references, and the record states that unresolved targetless flows remain unknown." The report cites the assembly facet, the coverage block and the limitation, and it quotes the `callees` array as a secondary observation only.
:::

**Walkthrough**

1. **Separate the array from the claim.** An empty `callees` array says that the provider returned no resolved call reference. It does not say that no call exists. The two states that give the same line are a function with no calls and a function whose calls Ghidra could not resolve to a target. The agent picked one state without looking further.
2. **Read the second empty list.** `unresolved_calls` is also empty. That removes one case: Ghidra saw no call site with an unknown destination. It does not remove computed or indirect flows that never became a reference at all.
3. **Read the coverage block.** `relationship_coverage.status` is `complete`, and its diagnostic says that only resolved Ghidra call references are returned, and that unresolved computed or indirect calls remain unknown. Complete means that rea returned the whole resolved set without a read limit. It is a statement about the provider's read, not about the program at run time.
4. **Find the limitation that applies.** The seventh of the ten strings says that resolved reference metadata identifies the edges that Ghidra found, and that unresolved targetless flows remain unknown. The record itself tells you how to read its empty arrays. The manual's rule is the same: missing coverage means unknown, not absent.
5. **Compare with a count that carries a statement.** The bundle summary shows the `value_flow` object of the same record: `truncated` is false, and the omitted operations, inputs and edges are all 0. Those zeros come with a flag that says nothing was cut. The `callees` array carries no such flag. A zero with a truncation statement is a count. An empty list without one is an observation that nothing was seen.
6. **Read the unknown counters.** The summary head says `unknown_revisions` is 0. That number means that no unknown had been recorded when the bundle was exported. It does not mean that the investigation has no open questions.
7. **Use the observed facet.** The assembly facet holds six instructions: a compare and branch on zero, a subtract, a move of the constant, a multiply, a signed divide, and a return. None of them transfers control to another function. The assembly is the Listing text that Ghidra observed, and it is the evidence that the leaf claim needs. The callees array was the wrong line to cite for a true sentence.

**Resolution**

The claim in the report was right, and the evidence under it was wrong. The corrected sentence reads: "The assembly of `_percent_change` has six instructions and no call instruction; the dossier reports no resolved callee with complete coverage over resolved references, and the record states that unresolved targetless flows remain unknown." The report cites the assembly facet, the coverage block and the limitation, and it quotes the `callees` array as a secondary observation only.

The team also changes how the agent writes. A rule in its instructions now says that an empty list is reported as "none observed" with the coverage status beside it, never as "none". When no observed facet settles a question, the agent calls `record_unknown` with the question, the authority that would close it, and a recommended probe. For a call question that would be `shipped-artifact` authority and `observed` confidence, from the assembly or a process capture, as the unknowns that `compare_functions` opens already ask for.

**Wrong turns**

- "The callees array is empty and the coverage is complete, so the function provably calls nothing." Complete covers the resolved references that Ghidra returned. The record's own limitation says that unresolved targetless flows stay unknown.
- "Record a residual unknown and ship the report with the question open." The same record holds an observed facet that answers the question. Read every facet before you open an unknown.
- "The bundle summary says zero unknowns, so nothing is open." That counter reports the unknowns that were recorded. It cannot count the questions that nobody wrote down.
- "Trust the pseudocode; it shows no function call either." The pseudocode is a decompiler reading with low-confidence types, as the same manual shows for this function. Cite the instructions, not the reading of them.

**Generalize**

A list in a tool result is a claim about what the tool saw, not about what exists. Before you turn an empty list into "none", find the field that states the coverage of that list and the limitation that qualifies it, and prefer a count that comes with a truncation flag over an array that comes with nothing. When one facet is an interpretation, look for the facet that is an observation of the same thing, and cite that one. When no observation settles the question, write the question down with the evidence that would close it.

:::

## FP8 KV scales silently at 1.0

*Level 3 · incident · about 20 minutes · version: vLLM 0.31.0; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory*

A team serves `Qwen/Qwen3-8B` on one L4. Requests queue because the KV pool is full, so they add `--kv-cache-dtype fp8` to store each cached value in one byte instead of two. The first start fails with a compiler error from a kernel library. A colleague adds a backend flag, the server starts, and a quick benchmark shows the time per token a little lower than before.

Before the rollout, the team runs GSM8K on its first 500 questions in BF16 and in FP8 and sees the same accuracy within the error bars. They ship. In the review, a staff engineer asks one question: "Which scale did the cache use?" Nobody knows. The production model is not this one, it is a newer family whose checkpoint ships calibrated scales.

**Evidence: the first start with an FP8 KV cache on the L4**

```text
title: the first start with an FP8 KV cache on the L4
source: manuals/vllm-101/capture/gpu/incidents/l4-vllm-kv-fp8-flashinfer-attention-jit.txt
lines: 1-5
lang: text
note: Read the backend that the second line picks, then the error in the fourth line.
---
(APIServer pid=813100) INFO 10-22 09:10:51 [api_utils.py:286] non-default args: {'model_tag': 'Qwen/Qwen3-8B', 'host': '127.0.0.1', 'port': 30000, 'model': 'Qwen/Qwen3-8B', 'max_model_len': 8192, 'gpu_memory_utilization': 0.9, 'kv_cache_dtype': 'fp8', 'num_gpu_blocks_override': 1506}
(EngineCore pid=814129) INFO 10-22 09:11:03 [cuda.py:526] Using FLASHINFER attention backend out of potential backends: ['FLASHINFER', 'TRITON_ATTN'].
(EngineCore pid=814129) ERROR 10-22 09:11:53 [core.py:1433] subprocess.CalledProcessError: Command '['ninja', '-v', '-C', '/root/.cache/flashinfer/0.7.0.post1/89/cached_ops/batch_prefill_with_kv_cache_dtype_q_bf16_dtype_kv_e4m3_dtype_o_bf16_dtype_idx_i32_head_dim_qk_128_head_dim_vo_128_posenc_0_use_swa_False_use_logits_cap_False_f16qk_False_kv_stride_equal', '-f', '/root/.cache/flashinfer/0.7.0.post1/89/cached_ops/ba
(EngineCore pid=814129) ERROR 10-22 09:11:53 [core.py:1433] /data/vllm/.venv/lib/python3.12/site-packages/flashinfer/data/cccl/libcudacxx/include/cuda/std/__cccl/cuda_toolkit.h:41:8: error: #error "CUDA compiler and CUDA toolkit headers are incompatible, please check your include paths"
RuntimeError: Engine core initialization failed. See root cause above. Failed core proc(s): {}

```

**Evidence: the FP8 KV cache with the Triton backend against the BF16 default, pool held fixed**

```text
title: the FP8 KV cache with the Triton backend against the BF16 default, pool held fixed
source: manuals/vllm-101/sections/2-4-fit-more-users-with-an-fp8-kv-cache.md
lines: 69-72
lang: text
note: Compare the clock and the seed count of each row before you read the time per token.
---
| Users, L4 throttled session | Median TPOT, BF16 / FP8 | Output tok/s, BF16 / FP8 | Median SM clock, BF16 / FP8 | Seeds, BF16 / FP8 |
|---|---|---|---|---|
| 1 | 104.1 / 101.8 ms | 10.59 / 10.75 | 210 / 210 MHz | 3 / 2 |
| 32 | 142.7 / 138.0 ms | 186.68 / 192.00 | 450 / 480 MHz | 3 / 2 |

```

**Evidence: GSM8K accuracy of the four configs on both engines**

```text
title: GSM8K accuracy of the four configs on both engines
source: manuals/vllm-101/capture/gpu/out-l4/gsm8k-fp8-accuracy.txt
lines: 5-19
lang: text
note: Read the sentence about the scales before the table, then the width of each interval.
---
Eval: the first 500 GSM8K test questions, 8-shot, greedy, one run per config. The prefix cache was flushed before each run.
Neither checkpoint carries KV scales, so the FP8 KV runs used a scale of 1.0.
vLLM FP8 KV runs used --attention-backend TRITON_ATTN, because the FlashInfer FP8 prefill kernel does not build on this host.

engine   config                     correct   accuracy   Wilson 95% interval
SGLang   BF16                       458/500   91.6%      88.8 to 93.7
SGLang   FP8 weights                456/500   91.2%      88.4 to 93.4
SGLang   FP8 KV cache               458/500   91.6%      88.8 to 93.7
SGLang   FP8 weights + FP8 KV       460/500   92.0%      89.3 to 94.1
vLLM     BF16                       459/500   91.8%      89.1 to 93.9
vLLM     FP8 weights                453/500   90.6%      87.7 to 92.9
vLLM     FP8 KV cache               454/500   90.8%      87.9 to 93.0
vLLM     FP8 weights + FP8 KV       453/500   90.6%      87.7 to 92.9

Every interval overlaps every other interval, so this run did not show a difference between the configs. With 500 questions, it cannot rule out a loss of a few points.

```

**Evidence: three rows of the incident index at 0.31.0**

```text
title: three rows of the incident index at 0.31.0
source: manuals/vllm-101/sections/r-3-incident-index.md
lines: 16-18
lang: text
note: The first and the third row name a loader that drops scales, and both issues are open.
---
| 54623 | the Qwen3.5 family never loads checkpoint KV scales, so an FP8 KV cache runs at scale 1.0 | open | [FP8 KV cache](#s-fit-more-users-with-an-fp8-kv-cache) |
| 57853 | a weight update sent while the engine sleeps segfaults the engine core | open | [RL rollouts](#s-use-vllm-as-an-rl-rollout-engine) |
| 60333 | one MTP draft loader drops FP8 KV scales, and the draft layers use scale 1.0 | open | [FP8 KV cache](#s-fit-more-users-with-an-fp8-kv-cache) |

```

**Evidence: the manual's check for scales in the checkpoint and in the startup log**

```text
title: the manual's check for scales in the checkpoint and in the startup log
source: manuals/vllm-101/sections/2-4-fit-more-users-with-an-fp8-kv-cache.md
lines: 110-114
lang: text
note: The last line names the warning to search for in the log.
---
No output means that the checkpoint has no scales.

A checkpoint with one weight file has no index. For it, list the tensor names with the `safetensors` Python package.

Then read the startup log. The warning `Using KV cache scaling factor 1.0` means that vLLM uses a scale of 1.0. If the checkpoint has scales and the log still shows the warning, the loader dropped them.

```

**Questions**

1. The server picked a different attention backend when the KV data type changed. Why does the data type decide the backend, and why did that backend fail on this host?
2. Two things changed between the BF16 and FP8 runs in the speed table. What can you claim from it, at which user count, and what can you not claim?
3. What is a KV scale, what does a scale of 1.0 do to an FP8 value, and for which checkpoints is 1.0 the only option?
4. Every interval in the accuracy table overlaps. What does that prove, and what can 500 questions not rule out?
5. The production checkpoint carries calibrated scales. Give the three checks, in order, that prove the running server uses them.

:::answer Show the answer
:::say Short answer
The incident is a missing question, not a crash. For `Qwen/Qwen3-8B` a scale of 1.0 was the only option, and the accuracy check on 500 questions could not tell the two configs apart. For the production model the team had to prove three things before the rollout: that the checkpoint holds `k_scale` and `v_scale` tensors, that the startup log does not print the scale 1.0 warning, and that a sample of their own prompts gives the same answers with and without FP8.
:::

**Walkthrough**

Start with the failed start. The second line shows the backend choice: `FLASHINFER` out of the two candidates `FLASHINFER` and `TRITON_ATTN`. FlashAttention is missing from that list. On an L4, vLLM tries FlashAttention first, but at 0.31.0 FlashAttention reads an FP8 KV cache only on Hopper and Blackwell data center GPUs, and the L4 is an Ada GPU with SM 8.9. So vLLM moved to the next backend in its list. FlashInfer builds its kernels on the first start, and the fourth line shows that build failing because the CUDA compiler and the CUDA headers came from different releases. The fix is `--attention-backend TRITON_ATTN`, which reads an FP8 KV cache without that build, plus `VLLM_USE_FLASHINFER_SAMPLER=0` because the sampler fails to build in the same way.

The speed table holds the pool at 24,096 tokens in both runs, so it does not show the larger pool at all. It shows the change in speed. At one user, FP8 was 2.3 percent faster per token, 101.8 against 104.1 ms, at the same clock of 210 MHz, and the seed ranges did not overlap. At 32 users the seed ranges overlapped and the FP8 run had the higher clock, 480 against 450 MHz, so no claim holds there. Two things changed together, the KV data type and the backend, so even the gain at one user cannot be attributed to the data type alone.

The accuracy table starts with the sentence that answers the staff engineer. Neither checkpoint carries KV scales, so the FP8 KV runs used a scale of 1.0. An FP8 value has few bits, and a scale maps the range of the real keys and values onto that range. With no calibrated scale the server stores the values as they are. For this model the result was 454 of 500 correct against 459 in BF16, 90.8 percent against 91.8, with intervals of 87.9 to 93.0 and 89.1 to 93.9. Every interval overlaps every other one. That means the run did not show a difference. It does not mean there is none. With 500 questions the test cannot rule out a loss of a few points, and it covers one model and one benchmark.

The incident index adds the part that makes the question dangerous. Issue 54623 reports that the Qwen3.5 model family never loads its checkpoint KV scales, so an FP8 KV cache runs at scale 1.0 even when the checkpoint has calibrated scales. Issue 60333 reports the same for one MTP draft loader. Both are open at 0.31.0. So a checkpoint with scales does not prove that the server uses them.

The last listing gives the check. Search the weight index for tensor names that end in `k_scale` or `v_scale`. No output means the checkpoint has no scales. Then read the startup log for the warning `Using KV cache scaling factor 1.0`. If the checkpoint has scales and the warning is still there, the loader dropped them. Last, run your own prompts with and without FP8 and compare the answers.

**Resolution**

The incident is a missing question, not a crash. For `Qwen/Qwen3-8B` a scale of 1.0 was the only option, and the accuracy check on 500 questions could not tell the two configs apart. For the production model the team had to prove three things before the rollout: that the checkpoint holds `k_scale` and `v_scale` tensors, that the startup log does not print the scale 1.0 warning, and that a sample of their own prompts gives the same answers with and without FP8.

They also had to read the backend line after every change to the KV data type. On this L4 the change moved the server from FlashAttention to Triton, and the speed table measured that move as much as the data type. Write the backend, the scale and the accuracy interval next to the result, and keep the accuracy test on your own task, because a model with a different attention layout can lose more.

**Wrong turns**

- "The accuracy matched, so FP8 is safe for every model." The check covered one model with no scales, one benchmark and 500 questions. It could not rule out a loss of a few points, and a different model can lose more.
- "The checkpoint has scales, so the server uses them." At 0.31.0 two open issues report loaders that drop the scales and run at 1.0. Only the startup log proves what the server used.
- "FP8 made each token 2.3 percent faster, so the data type paid off." The backend changed in the same run, and the gain held only at one user. The table cannot say which change gave it.
- "Fix the compiler error so FlashInfer builds." That is a host repair, not a serving decision. The Triton backend reads the FP8 cache without the build, and the backend line in the log says which one runs.

**Generalize**

A quantized store needs a scale, and a default scale of 1.0 is a silent choice that the server makes for you. Whenever you change a data type, read the three lines that follow from it: which kernel now runs, which scale it uses and what the quality check can and cannot detect at its sample size. A test that shows no difference bounds the loss, it does not remove it.

:::

## LRU thrash in a small pool, then a crash

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-0.6B; hardware: the shared second L4 of a two-GPU node, with no clock lock*

A coding assistant keeps a session for each user and resends the whole history on every turn. The team serves a small model with SGLang on a GPU that another team also uses, so they set `--max-total-tokens 8192` to leave the neighbour room. In a load test with 24 sessions of 6 turns at 8 users at once, the first turns are fast. From the fourth turn the first token takes up to 716 ms, and the metrics endpoint shows the cache hit rate falling toward zero.

Then two kinds of failure appear. In some runs the server stops with `CUDA error: an illegal memory access was encountered`. In other runs the log stops with no error while the GPU stays at 100 percent and every client waits. The team suspects the eviction policy and asks whether to switch from `lru` to `lfu`.

**Evidence: the engine, the model and the multi-turn trace**

```text
title: the engine, the model and the multi-turn trace
source: manuals/sglang-101/capture/gpu/out-l4/eviction-multiturn.txt
lines: 4-7
lang: text
note: Count the sessions and the turns, and note that each turn resends the whole history.
---
Engine: SGLang 0.5.22. Model: Qwen/Qwen3-0.6B.
Trace: 24 sessions, each with its own system prompt, 6 turns of ShareGPT questions, 64-token answers, thinking off. Sessions run round robin at concurrency 8. Each turn resends the whole history.
Hit rate = cached prompt tokens / prompt tokens, from the cache report.
The 8,192-token lru row holds two clean runs of the same config: run 1 and run 2 gave 0.19 each over the whole trace. The summary keeps one set of per-turn rates and one clock for the pair.

```

**Evidence: the hit rate over the whole trace and per turn, by pool size and policy**

```text
title: the hit rate over the whole trace and per turn, by pool size and policy
source: manuals/sglang-101/capture/gpu/out-l4/eviction-multiturn.txt
lines: 9-16
lang: text
note: Follow the per-turn column of the first row from turn 4 to turn 6, then compare the rows below it.
---
pool, policy                 whole trace   hit rate per turn 1 to 6                        median SM clock
8,192 tokens, lru            0.19, 0.19    0.11, 0.31, 0.58, 0.39, 0.016, 0.013            615 MHz
8,192 tokens, lru, no graph  0.19          the same shape                                  1,905 MHz
8,192 tokens, lfu            0.375         0.11, 0.31, 0.58, 0.53, 0.34, 0.25              1,140 MHz
8,192 tokens, slru           0.367         0.11, 0.31, 0.58, 0.53, 0.31, 0.26              960 MHz
16,384 tokens, lru           0.685         rises to 0.83 at turn 6                         810 MHz
16,384 tokens, lfu           0.687         rises to 0.84 at turn 6                         945 MHz
default pool, lru            0.687         rises to 0.835 at turn 6                        960 MHz

```

**Evidence: the median time to first token at turns 5 and 6**

```text
title: the median time to first token at turns 5 and 6
source: manuals/sglang-101/capture/gpu/out-l4/eviction-multiturn.txt
lines: 18-21
lang: text
note: Compare the three lines, which come from one GPU with no clock lock.
---
Median TTFT at turns 5 and 6:
8,192 lru: run 1 gave 699 and 449 ms, run 2 gave 716 and 355 ms
8,192 lfu or slru: 143 to 214 ms
16,384 or default pool: 56 to 160 ms

```

**Evidence: the server command, the trace, and the tally of aborts and hangs by variant**

```text
title: the server command, the trace, and the tally of aborts and hangs by variant
source: manuals/sglang-101/capture/gpu/out-l4/small-pool-crash.txt
lines: 5-14
lang: text
note: Read the clean column against the runs column for each variant.
---
Server: sglang serve --model-path Qwen/Qwen3-0.6B --mem-fraction-static 0.55 --context-length 4096 --enable-cache-report --max-total-tokens 8192 --radix-eviction-policy lru
Trace: 24 sessions x 6 turns, round robin at concurrency 8, greedy, 64-token answers. The context grows each turn, so the 8,192-token pool evicts heavily from turn 4 on.
Hang rule: no new log line for 5 minutes, or 15 minutes in total. The scheduler stack was saved with py-spy before the server was stopped.

variant                                          runs   aborts   hangs   clean
lru, CUDA graph and overlap on (default)         6      1        3       2
lru, CUDA_LAUNCH_BLOCKING=1                      3      0        0       3
lru, --disable-cuda-graph                        4      0        0       4
lru, --enable-hierarchical-cache                 3      1        0       2
lru, HiCache, CUDA_LAUNCH_BLOCKING=1             2      0        0       2

```

**Evidence: the abort, the hang, and what hid the fault**

```text
title: the abort, the hang, and what hid the fault
source: manuals/sglang-101/capture/gpu/out-l4/small-pool-crash.txt
lines: 18-26
lang: text
note: Both failures stop in the same call, and the last three lines say what made the fault disappear.
---
The abort:
torch.AcceleratorError: CUDA error: an illegal memory access was encountered
Last Python frames: scheduler.py process_batch_result, then batch_result_processor.py process_batch_result_decode, then torch/cuda/streams.py synchronize (copy_done.synchronize() on the decode result).

The hang: the py-spy stack sits in the same synchronize call, under process_batch_result_decode, under event_loop_overlap. The GPU stays at 100 percent and the log stops.

The fault did not appear with kernel launches serialized (0 of 5) or with CUDA graphs off (0 of 4).
With launch blocking on, the fault did not occur, so no traceback names the faulting kernel.
Nothing was filed upstream.

```

**Questions**

1. What does eviction remove, what does it never remove, and how does `lru` pick the victim?
2. Read the per-turn hit rates of the first row. Describe the pattern in words and name the mechanism behind it.
3. At the same pool size, `lfu` and `slru` kept the late turns alive. What does that tell you about the working set, and what else fixes it?
4. Both failures stop in one call of the scheduler. Which two changes made the fault disappear, and what does each one cost?
5. Order the fixes: a larger pool, a different policy, graphs off, launch blocking. Which do you ship, which do you test, and which never goes to production?

:::answer Show the answer
:::say Short answer
Two problems sat on top of each other. The pool was smaller than the working set of the sessions that return, so `lru` thrashed from turn 4 on. Under that heavy eviction, the default path with CUDA graphs and the overlap scheduler hit the memory fault or hung in 4 of 6 runs.
:::

**Walkthrough**

Eviction removes cached tokens that no running request holds, from the leaves of the radix tree. It never removes the KV of a running request. With the default policy the leaf with the oldest last access goes first. That rule assumes that the next request looks like the recent ones.

The trace in the first listing breaks that assumption. Twenty-four sessions take turns at a concurrency of 8, and every turn resends a history that grows. The second listing shows what the pool did with it. With 8,192 tokens and `lru`, the hit rate per turn was 0.11, 0.31 and 0.58 for the first three turns, then 0.39, 0.016 and 0.013. By turn 5 the cycle of 24 growing histories was larger than the pool. The policy evicted each session's prefix just before that session came back, so almost every late turn paid a full prefill. Over the whole trace the hit rate was 0.19 in both clean runs.

The same pool with `lfu` reached 0.375 over the trace and kept 0.34 and 0.25 at turns 5 and 6. With `slru` it was 0.367, with 0.31 and 0.26. So the frequency policies helped exactly where the pool was too small for the sessions that return. The rows below show the real fix. At 16,384 tokens, `lru` reached 0.685 and the hit rate rose to 0.83 at turn 6. The default pool gave 0.687. Every policy we ran at the larger pools landed near 0.69. The third listing turns this into time. At turns 5 and 6 the median first token was 699 and 449 ms in one `lru` run and 716 and 355 ms in the other, 143 to 214 ms with `lfu` or `slru`, and 56 to 160 ms with the larger pools. The card had no clock lock, so compare these numbers only with each other.

The fourth listing is the failure tally. With the defaults, CUDA graphs and the overlap scheduler on, 6 runs gave 1 abort, 3 hangs and 2 clean runs. With `CUDA_LAUNCH_BLOCKING=1`, 3 of 3 were clean. With `--disable-cuda-graph`, 4 of 4 were clean. When hierarchical caching was on, 1 of 3 still aborted. The fifth listing shows that the abort and every hang stopped in the same place, the synchronize call that waits for the copy of a decode result, under the overlap event loop. The fault did not appear with launches serialized or with graphs off, so no traceback names the kernel. Nothing was filed upstream.

**Resolution**

Two problems sat on top of each other. The pool was smaller than the working set of the sessions that return, so `lru` thrashed from turn 4 on. Under that heavy eviction, the default path with CUDA graphs and the overlap scheduler hit the memory fault or hung in 4 of 6 runs.

Grow the pool first. At 16,384 tokens the same trace reached a hit rate of 0.685 with the default policy, and the late turns kept 56 to 160 ms to the first token. If a cap such as `--max-total-tokens` sets the pool, raise the cap. If memory sets it, on a shared card that means a larger `--mem-fraction-static` or an FP8 KV cache, not a new policy. Then read `max_total_num_tokens` in the startup log to confirm the new size. Then measure the policy again. On this trace a different policy paid only at the pool size that was too small.

For the crash, ship `--disable-cuda-graph` as the workaround while the pool is small. On our L4 with an 8B model, graphs saved about 1 percent of each decode step, so measure the cost on your model. A larger pool stopped the thrash, but we did not count crashes at the larger pools, so treat it as untested for the fault. Keep `CUDA_LAUNCH_BLOCKING=1` for debugging only.

**Wrong turns**

- "Switch to lfu and ship it." A frequency policy keeps yesterday's popular prompt in memory and makes today's prompt pay for it. It helped here only because the pool was too small, and the larger pool made every policy equal.
- "Set CUDA_LAUNCH_BLOCKING=1 in production." It hid the fault in 5 of 5 runs, and it makes every kernel launch wait for the one before it. Use it to debug, never to serve.
- "Turn on hierarchical caching to stop the crash." With the host tier on, 1 of 3 runs still aborted. The host tier keeps evicted prefixes, it does not change the path that faulted.
- "Raise the running-request cap so the sessions do not wait." More running requests hold more of the pool, so eviction gets heavier, and the hit rate falls further.

**Generalize**

When a hit rate falls on later turns while early turns are fine, the working set has outgrown the cache. Size the cache before you tune its policy, because a policy only chooses which part of a too-small set to lose. And when a fault appears only under one load shape, change the execution path one switch at a time, and keep the switch that serializes work for the debugger, not for the users.

:::
