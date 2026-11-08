---
track: aibank
title: "AI incident scenarios, read the evidence (part 8 of 10)"
short: Incidents 8
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## More load gave a faster first token

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-30B-A3B-Instruct-2507; hardware: one GB10 (DGX Spark)*

A benchmark kit starts one SGLang server with `Qwen/Qwen3-30B-A3B-Instruct-2507` and runs a load sweep against it. Each run sends random prompts of 512 tokens and asks for 128 tokens back. The kit runs each concurrency cap once, one after the other, on the same server.

The report says that a cap of 8 gave a median first token of 677.61 ms, and a cap of 32 gave 390.38 ms. Four times the load gave a faster first token. A teammate wants to publish the result as "the scheduler gets more efficient under load". You review the run before it goes out.

**Evidence: The server command**

```text
title: the server under test
source: manuals/sglang-101/capture/gpu/out-gb10/server-default.command.txt
lang: text
note: The command that the benchmark kit used to start the server. Note what is on and what is not.
---
sglang serve --model-path Qwen/Qwen3-30B-A3B-Instruct-2507 --host 127.0.0.1 --port 30000 --enable-cache-report --enable-metrics --mem-fraction-static 0.7

```

**Evidence: The first-token block at a cap of 8**

```text
title: time to first token at a cap of 8
source: manuals/sglang-101/capture/gpu/out-gb10/bench-random-c8.txt
lines: 34-39
lang: text
note: The first-token block of the report for 64 requests at a cap of 8.
---
---------------Time to First Token----------------
Mean TTFT (ms):                          681.92    
Median TTFT (ms):                        677.61    
P90 TTFT (ms):                           1189.25   
P95 TTFT (ms):                           1194.16   
P99 TTFT (ms):                           1194.93   

```

**Evidence: The first-token block at a cap of 32**

```text
title: time to first token at a cap of 32
source: manuals/sglang-101/capture/gpu/out-gb10/bench-random-c32.txt
lines: 34-39
lang: text
note: The first-token block of the report for 128 requests at a cap of 32. Compare the median with the cap of 8.
---
---------------Time to First Token----------------
Mean TTFT (ms):                          1166.51   
Median TTFT (ms):                        390.38    
P90 TTFT (ms):                           2887.53   
P95 TTFT (ms):                           2889.80   
P99 TTFT (ms):                           2910.22   

```

**Evidence: The client arguments**

```text
title: the client arguments of the run at a cap of 32
source: manuals/sglang-101/capture/gpu/out-gb10/bench-random-c32.txt
lines: 1-1
lang: text
note: Look for the dataset, the seed and the cache flush.
---
benchmark_args=Namespace(backend='sglang', base_url=None, host='0.0.0.0', port=30000, ready_check_timeout_sec=60, dataset_name='random', dataset_path='~/sglang-lab/hf/hub/datasets--anon8231489123--ShareGPT_Vicuna_unfiltered/snapshots/192ab2185289094fc556ec8ce5ce1e8e587154ca/ShareGPT_V3_unfiltered_cleaned_split.json', dataset_offset=0, agentic_max_turns=None, speed_bench_category=None, speed_bench_output_len=512, model=None, served_model_name=None, tokenizer=None, num_prompts=128, sharegpt_output_len=None, sharegpt_context_len=None, random_input_len=512, random_output_len=128, random_range_ratio=1.0, image_count=1, image_resolution='1080p', random_image_count=False, image_format='jpeg', image_content='random', request_rate=inf, use_trace_timestamps=False, max_concurrency=32, output_file='~/sglang-lab/kit/capture/gpu/out-gb10/bench-random-c32.jsonl', output_details=False, print_requests=False, disable_tqdm=False, disable_stream=False, return_logprob=False, top_logprobs_num=0, token_ids_logprob=None, logprob_start_len=-1, return_routed_experts=False, cache_report=False, seed=7, disable_ignore_eos=False, temperature=0.0, top_p=1.0, extra_request_body=None, apply_chat_template=False, profile=False, plot_throughput=False, profile_activities=['CPU', 'GPU'], profile_start_step=None, profile_steps=None, profile_num_steps=None, profile_by_stage=False, profile_stages=None, profile_output_dir=None, profile_prefix=None, lora_name=None, lora_request_distribution='uniform', lora_zipf_alpha=1.5, prompt_suffix='', pd_separated=False, profile_prefill_url=None, profile_decode_url=None, flush_cache=False, flush_cache_timeout=60.0, warmup_requests=1, tokenize_prompt=False, gsp_num_groups=64, gsp_prompts_per_group=16, gsp_system_prompt_len=2048, gsp_question_len=128, gsp_output_len=256, gsp_range_ratio=1.0, gsp_fast_prepare=False, gsp_send_routing_key=False, gsp_num_turns=1, gsp_ordered=False, gsp_group_distribution='uniform', gsp_zipf_alpha=None, mooncake_slowdown_factor=1.0, mooncake_num_rounds=1, mooncake_workload='conversation', fake_prefill=False, tag=None, header=None, rust_client=False, rust_worker_threads=None)

```

**Evidence: Two prefill lines from the run at a cap of 32**

```text
title: two prefill lines from the run at a cap of 32
source: manuals/sglang-101/capture/gpu/out-gb10/server-default.log
lines: 341-342
lang: text
note: Compare the new tokens with the cached tokens in each batch.
---
[2026-10-17 14:23:00] Prefill batch, #new-seq: 14, #new-token: 14, #cached-token: 6879, token usage: 0.07, #running-req: 1, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 108.68
[2026-10-17 14:23:00] Prefill batch, #new-seq: 15, #new-token: 15, #cached-token: 7634, token usage: 0.07, #running-req: 15, #queue-req: 0, #pending-token: 0, cuda graph: True, input throughput (token/s): 113.27

```

**Evidence: The same caps with three seeds**

```text
title: the same caps again, with three seeds
source: manuals/sglang-101/sections/5-1-sglang-benchmark-serving.md
lines: 144-147
lang: text
note: The single kit run against a sweep with seeds 1, 2 and 3 on the same machine.
---
| Cap | Single kit run, median TTFT | Three seeds, median TTFT (lowest to highest) |
|---|---|---|
| 8 | 677.61 ms | 209.98 ms (185.25 to 216.02) |
| 32 | 390.38 ms | 416.37 ms (338.06 to 434.64) |

```

**Evidence: One load four times in a row**

```text
title: one load four times in a row, with and without a flush
source: manuals/sglang-101/capture/gpu/out-l4/prefix-cache-flush.txt
lines: 9-11
lang: text
note: A smaller model on another GPU. Read the ratios, not the times.
---
engine        fresh   repeat, not flushed   repeat after a flush   repeat, not flushed
SGLang 0.6B   394     82.5                  289                    77
vLLM 0.6B     925     148                   1,163                  184

```

**Questions**

1. Which explanations fit a median first token that falls when the load rises? Name at least two before you read the logs.
2. The mean and the P99 at a cap of 32 are much higher than the median. What does that shape tell you?
3. What in the client arguments makes two runs send the same prompts?
4. What do the prefill lines prove, and what do they not prove?
5. How do you run the sweep again so that the result is trustworthy?

:::answer Show the answer
:::say Short answer
The prefix cache made the result. The kit reused one seed and one server and never flushed the cache, so each run found the prompts of the run before it. The sweep with seeds 1, 2 and 3 gave a median of 209.98 ms at a cap of 8 and 416.37 ms at a cap of 32. With clean runs, the first token gets slower as the cap grows, as the queue predicts.
:::

**Walkthrough**

1. **Doubt one sample.** No queue model makes the first token faster under more load. Each cap ran once, so the first suspect is the method, not the scheduler. Write down the candidate causes: a warm cache, a different GPU clock, a different pool, or noise in one run.
2. **Read the whole distribution.** At a cap of 32 the median was 390.38 ms, but the mean was 1166.51 ms and P99 was 2910.22 ms. A median far below the mean says the requests split into a fast group and a slow group. Something made part of the requests cheap.
3. **Read the client arguments.** The run used the random dataset with `seed=7` and `flush_cache=False`. The same seed sends the same first prompts in every run. Nothing cleared the cache between runs on the same server.
4. **Read the server log.** Two prefill batches admitted 14 and 15 requests that needed one new token each, with 6879 and 7634 cached tokens. Those prompts were already in the cache from the run before. A cached prompt skips its prefill, so its first token comes fast.
5. **Count, then test.** The manual counted the prefill lines of each run. At a cap of 32, 64 of the 128 prompts were in the cache before the run started. At a cap of 8, 16 of the 64 were. Half of the requests had the advantage at 32, and a quarter at 8. Then change the variable that the reading blames: run each cap with three seeds, and the 677.61 ms result does not come back.

**Resolution**

The prefix cache made the result. The kit reused one seed and one server and never flushed the cache, so each run found the prompts of the run before it. The sweep with seeds 1, 2 and 3 gave a median of 209.98 ms at a cap of 8 and 416.37 ms at a cap of 32. With clean runs, the first token gets slower as the cap grows, as the queue predicts.

The fix is a protocol, not a server flag:

1. Start each run with an empty cache. Pass `--flush-cache` to the benchmark client, call `POST /flush_cache`, or restart the server.
2. Check that the flush ran. The server flushes only when no request runs or waits.
3. Use a new seed for each run, so that the client sends new prompts.
4. Record `sglang:cached_tokens_total` before and after each run, and write the cached tokens next to the result.

A separate test on an L4 measured the size of the effect. A repeat without a flush read a median first token about 4.8 times lower than the fresh run. After a flush, it went back near the fresh run.

**Wrong turns**

- "The scheduler batches better at a high cap." A queue can only add wait time. The median fell because the cache removed prefill work.
- "Turn the prefix cache off for the benchmark." Production runs with the cache on. Reset it between runs and record the hits, so that the test measures the real server.
- "Run more requests at each cap with the same seed." More requests with the same seed repeat the same prompts and keep the cache warm.
- "Blame the GPU clock." A clock change can move a result, but the prefill lines show cached tokens, which a clock change cannot make.

**Generalize**

A benchmark that repeats its inputs measures its own cache. Before you trust a result that runs against the expected direction, read the full distribution, check which state carries over between runs, and change the one variable that your explanation blames. Run three seeds per point and report the range. The time per token is less exposed to this error than the first token, because a cache hit removes prefill work and leaves the decode work the same.

:::

## Ray stops the trainer on unified memory

*Level 3 · incident · about 20 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-4B; hardware: one GB10 with 128 GB of unified memory*

A team trains with GRPO on one GB10. Their runs with a 0.6B model work, so they move to `Qwen/Qwen3-4B` for better rewards. The run starts, loads the trainer, loads the engine, and finishes its first rollout. Then it stops in the training phase of that same step, about 15 minutes after the start. The log has no CUDA out-of-memory error.

The on-call engineer finds a Ray message that names the node, not a GPU, and lists three processes. The plan on the ticket has two steps: raise the Ray memory threshold, and give the engine a smaller memory fraction so the trainer gets more room. A second run with the fraction at 0.2 dies the same way.

**Evidence: three timestamps from the log of the failed run**

```text
title: three timestamps from the log of the failed run
source: manuals/miles-101/capture/gpu/out-gb10/ray-oom-4b-timing.txt
lang: console
note: Read the start, the end of the first rollout, and the failure of the training phase.
---
$ sed "s/\x1b\[[0-9;]*m//g" e4-4b.log | grep -m1 "launcher\] common.py:290 - EXEC" | cut -c1-110
[2026-10-22 05:58:05.178 launcher] common.py:290 - EXEC: mkdir -p /root/lab/models /root/lab/datasets
$ sed "s/\x1b\[[0-9;]*m//g" e4-4b.log | grep -m1 " - rollout 0: " | cut -c1-170
(FSDPTrainRayActor pid=2657) [2026-10-22 06:04:07.877 actor_cell00000_rank00000] log_utils.py:125 - rollout 0: {'rollout/response_lengths': 256.0, 'rollout/rewards': 0.0,
$ sed "s/\x1b\[[0-9;]*m//g" e4-4b.log | grep -m1 "ft op=execute phase=fail"
(TrainerController pid=2656) [2026-10-22 06:13:27.030 trainer_controller_actor] cell.py:251 - ft op=execute phase=fail cell=trainer-engine-actor-00000 fn=train elapsed_s=629.7

```

**Evidence: the Ray message that stopped the trainer**

```text
title: the Ray message that stopped the trainer
source: manuals/miles-101/capture/gpu/out-gb10/ray-oom-4b.log
lang: text
note: Read the memory on the node in the first line, then add up the processes in the table.
---
(TrainerController pid=2656) ray.exceptions.OutOfMemoryError: 1 worker(s) were killed due to the node running low on memory. Memory on the node (IP: 172.17.0.3, ID: 08904870a17c5413c623abfc21db2e7fcfdc39d5be90e997b2391f37) was 115.86GB / 121.69GB (0.952127)
(TrainerController pid=2656) To see more information about memory usage on this node, use `ray logs raylet.out -ip 172.17.0.3`
(TrainerController pid=2656) Top 10 memory users: PID	MEM(GB)	COMMAND
(TrainerController pid=2656) 2657	36.77	ray::FSDPTrainRayActor.train
(TrainerController pid=2656) 3402	2.73	sglang::scheduler
(TrainerController pid=2656) 2650	1.33	ray::RolloutExecutor
To adjust the kill threshold, set the environment variable `RAY_memory_usage_threshold` when starting Ray. To disable worker killing, set the environment variable `RAY_memory_monitor_refresh_ms` to zero.

```

**Evidence: the same run with the engine memory share lowered from 0.4 to 0.2**

```text
title: the same run with the engine memory share lowered from 0.4 to 0.2
source: manuals/miles-101/capture/gpu/out-gb10/ray-oom-4b-lowmem.log
lang: text
note: Compare the node memory and the trainer process with the first kill.
---
Run e4-4b-lowmem on 2026-10-22: Qwen3-4B, --sglang-mem-fraction-static 0.2, default Ray memory threshold.
(TrainerController pid=2518) ray.exceptions.OutOfMemoryError: 1 worker(s) were killed due to the node running low on memory. Memory on the node (IP: 172.17.0.3, ID: 52a2f7678ec4002fb0c757192d14dfb4606f3204b11008afe40fe377) was 119.18GB / 121.69GB (0.979391)
(TrainerController pid=2518) Top 10 memory users: PID	MEM(GB)	COMMAND
(TrainerController pid=2518) 2523	36.75	ray::FSDPTrainRayActor.train
(TrainerController pid=2518) 3259	2.67	sglang::scheduler
(TrainerController pid=2518) 2515	1.32	ray::RolloutExecutor

```

**Evidence: the trainer state estimate by model size, and what happened on the GB10**

```text
title: the trainer state estimate by model size, and what happened on the GB10
source: manuals/miles-101/sections/2-1-pick-a-model-size.md
lines: 13-18
lang: text
note: The estimate counts 16 bytes for each parameter and leaves out activations and the engine.
---
| Model | Trainer state, estimate | Result on our GB10 |
|---|---|---|
| Qwen3-0.6B | about 10 GB | trains |
| Qwen3-1.7B | about 27 GB | fits for 4 steps at 256 tokens |
| Qwen3-4B | about 64 GB | stopped by Ray in the first step at 256 tokens, twice |
| Qwen3-8B | about 128 GB | not tried, larger than the machine |

```

**Evidence: what a very small engine share did to the pool and the rollout time**

```text
title: what a very small engine share did to the pool and the rollout time
source: manuals/miles-101/capture/gpu/out-gb10/frac-low-kv.txt
lines: 3-6
lang: text
note: Compare the token pool and the rollout time of the three rows.
---
frac-low: max_total_num_tokens=3082 perf/rollout_time': 385.5003604888916 rollout/raw_reward': 0.61328125 steps=1
frac-check: max_total_num_tokens=211813 perf/rollout_time': 60.696292877197266 rollout/raw_reward': 0.66015625 steps=1
plain: max_total_num_tokens=347841 perf/rollout_time': 63.839099407196045 rollout/raw_reward': 0.625 steps=12
frac-low engine line: KV Cache is allocated. dtype: torch.bfloat16, #tokens: 3082, K size: 0.16 GB, V size: 0.16 GB

```

**Questions**

1. The log has no CUDA out-of-memory error. Read the kill line: which component stopped the trainer, what did it measure, and on what?
2. The three listed processes hold far less than the node total. Where is the rest, and why can a process list not show it?
3. The second run lowered the engine's share from 0.4 to 0.2 and died at a higher node total. What does that tell you about where the memory went?
4. Raising the Ray threshold is a common fix on a machine with a separate GPU. Why is it the wrong fix here?
5. Estimate the trainer state of a 4B model with mixed precision and an Adam optimizer, and pick the largest model that fits this machine.
6. What does a very small engine share cost, and which line in the engine log tells you before the run starts?

:::answer Show the answer
:::say Short answer
The kill was real memory pressure, not a false alarm. On unified memory the number that Ray reads includes the GPU allocations, so a kill at 95.2 percent means the machine is close to full for every process on it.
:::

**Walkthrough**

The timeline gives the shape. The launcher started at 05:58, the trainer logged `rollout 0` about six minutes later, and the fault-tolerance line reported `phase=fail` for the train function after 629.7 s. So the engine generated a full step of answers, and the trainer died while it trained on them. That is the phase that holds the most memory.

The second listing is a Ray memory kill, not a CUDA error. Ray's memory monitor measured the whole node and read 115.86 GB of 121.69 GB in use, which the message itself gives as 0.952127. The table under it gives 36.77 GB for the trainer, 2.73 GB for the engine scheduler and 1.33 GB for the rollout executor. The rest of the memory in use is not in the process list. On a GB10 the CPU and the GPU use one pool of memory, so the GPU allocations, the model weights, the optimizer state and the KV cache, count in the number that Ray watches. A process list shows the host side of each process and cannot show that part.

The third listing is the second run. With the engine share at 0.2 the node reached 119.18 GB before the kill, higher than before, and the trainer process held 36.75 GB, almost the same as the 36.77 GB of the first run. A smaller engine share made no room, because the trainer side is what does not fit.

The estimate table says why. Full fine-tuning with Adam and mixed precision keeps about 16 bytes for each parameter. That gives about 10 GB for the 0.6B model, about 27 GB for 1.7B and about 64 GB for 4B. The 4B estimate alone is half the machine, and activations, the engine and the process overhead come on top. On this GB10 the 1.7B model fit for 4 steps with answers cut at 256 tokens, and the 4B model was stopped by Ray in the first step, twice.

The last listing shows the cost of the other direction. With the engine share at 0.02 the pool held 3,082 tokens against 211,813 at 0.25, and the rollout of one step took about six times longer. A tiny engine share starves the rollout and buys nothing for a trainer that still does not fit.

**Resolution**

The kill was real memory pressure, not a false alarm. On unified memory the number that Ray reads includes the GPU allocations, so a kill at 95.2 percent means the machine is close to full for every process on it.

Change the run, not the watcher. Use a smaller model: on this machine the recipe fits 1.7B at most, and the team should test it at their real answer length for 4 steps while they read node memory with `free -g`. If they must train the 4B model, they need more GPUs or a recipe that keeps less optimizer state, such as LoRA on the Megatron trainer, which we did not test. Leave `RAY_memory_usage_threshold` at its default. Keep the engine share at the launcher default or near 0.25, because 0.2 did not prevent the kill and a very small share made the rollout several times slower.

**Wrong turns**

- "Raise the Ray threshold." The threshold lets the node get closer to full. If it does run out, the operating system stops any process on the machine, and that stop leaves no Ray message to read.
- "Lower the engine fraction to make room for the trainer." The second run did that and died at 119.18 GB with the trainer at 36.75 GB. The engine was not the part that did not fit.
- "It is a CUDA out of memory, so lower the engine batch." The log has no CUDA error, and the engine scheduler held 2.73 GB. The kill came from node memory.
- "Set the Ray refresh to zero so the monitor stops killing." The log names that variable, and it only removes the warning. The operating system then stops whichever process it chooses, with no message.

**Generalize**

On a machine where the CPU and the GPU share one memory, every tool that reads host memory also reads the GPU allocations, and every tool that reads GPU memory reads a number without a hard limit. Read a memory kill from such a tool as a true shortage, estimate the largest consumer from first principles before you start, and make the run smaller rather than the monitor quieter.

:::

## Speculation chosen on random prompts

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-8B with an EAGLE3 draft of 3 tokens, and NGRAM with its defaults; hardware: one L4 with 24 GB of memory, SM clock locked at 900 MHz*

An inference team serves `Qwen/Qwen3-8B` on L4 cards to three internal products: a support chat, a math tutor and a code assistant. To pick one decode setting for all three, they benchmark the engine on the random dataset of the benchmark client at 8 users. EAGLE3 roughly halves the time between tokens, and the n-gram method changes nothing. They turn EAGLE3 on for every product and close the n-gram ticket as "no gain".

Two weeks later the support chat reports that at busy hours the first token comes seconds later than before the change, with no more answers per minute. The math tutor reports the opposite: the service got much faster under load. The code assistant team, which never got n-gram, reads a paper that says n-gram pays on code and asks why it was rejected. You are asked whether one setting can serve all three.

**Evidence: the machine, the model, the two drafts and the four datasets**

```text
title: the machine, the model, the two drafts and the four datasets
source: manuals/sglang-101/capture/gpu/out-l4/spec-real-prompts.txt
lines: 1-5
lang: text
note: The clock lock, the cache flush and the two seeds are in lines 3 and 4.
---
Speculative decoding on real prompts, SGLang 0.5.22 (backlog B-01a)
Date: 2026-10-23
Machine: NVIDIA L4, GPU0 of the node, clock lock 900 MHz. Model: Qwen/Qwen3-8B, EAGLE3 draft with 3 draft tokens, NGRAM with the defaults.
Load: 128 output tokens with ignore-eos, 2 seeds, prefix cache flushed before each run. Rows use only runs at a median clock of 900 MHz.
Datasets: random (the benchmark tool's random set), ShareGPT, GSM8K questions, and code prompts.

```

**Evidence: median time per output token at 8 users, by dataset and method**

```text
title: median time per output token at 8 users, by dataset and method
source: manuals/sglang-101/capture/gpu/out-l4/spec-real-prompts.txt
lines: 7-11
lang: text
note: Compare the EAGLE3 column with the default on every row, then do the same for NGRAM.
---
median TPOT at 8 users: default / EAGLE3 / NGRAM
random     67.6 to 68.2 / 33.8 to 39.4 / 68.2 to 71.4 ms
ShareGPT   66.4 to 68.6 / 39.5 to 43.1 / 69.5 to 72.4 ms
GSM8K      65.5 / 33.3 to 34.3 / 54.6 to 55.0 ms
code       65.9 to 66.4 / 36.8 / 58.2 to 58.8 ms

```

**Evidence: mean acceptance length at 8 users, by dataset**

```text
title: mean acceptance length at 8 users, by dataset
source: manuals/sglang-101/capture/gpu/out-l4/spec-real-prompts.txt
lines: 13-17
lang: text
note: Read the ShareGPT row against the GSM8K row for each method.
---
mean acceptance length at 8 users: EAGLE3 / NGRAM
random     2.48 to 2.78 / 1.50 to 1.57
ShareGPT   2.35 to 2.43 / 1.22 to 1.25
GSM8K      2.69 to 2.78 / 1.44 to 1.46
code       2.57 to 2.58 / 1.37 to 1.38

```

**Evidence: output tokens per second at 32 users, by dataset and method**

```text
title: output tokens per second at 32 users, by dataset and method
source: manuals/sglang-101/capture/gpu/out-l4/spec-real-prompts.txt
lines: 19-23
lang: text
note: Find the two rows where EAGLE3 gives less output than the default.
---
output tok/s at 32 users: default / EAGLE3 / NGRAM
random     250 to 254 / 239 to 242 / 236 to 250
ShareGPT   281 to 288 / 277 to 283 / 245 to 256
GSM8K      397 / 648 to 660 / 433 to 435
code       365 to 366 / 566 to 581 / 377 to 386

```

**Evidence: the first token with EAGLE3 and the worst gap with NGRAM at 32 users**

```text
title: the first token with EAGLE3 and the worst gap with NGRAM at 32 users
source: manuals/sglang-101/capture/gpu/out-l4/spec-real-prompts.txt
lines: 25-27
lang: text
note: Compare each pair, then read which runs were left out and why.
---
median TTFT at 32 users, EAGLE3 against default: random 8.6 to 8.7 s against 3.2 to 3.5 s, ShareGPT 5.7 to 7.0 s against 2.7 to 3.0 s.
P99 ITL at 32 users with NGRAM: 244 to 779 ms, against 83 to 106 ms for the default.
The 1-user default runs throttled below 300 MHz and are left out. vLLM EAGLE3 and NGRAM on these datasets did not run.

```

**Evidence: what the random dataset is, and what other studies found on real prompts**

```text
title: what the random dataset is, and what other studies found on real prompts
source: manuals/sglang-101/sections/4-4-speculative-decoding.md
lines: 170-177
lang: text
note: The first paragraph says where the random text comes from.
---
Both sweeps used the `random` dataset of the benchmark client, with 512 tokens in, 128 tokens out, and `ignore_eos` on. At v0.5.22 that dataset takes the first turn of ShareGPT conversations, then cuts or repeats it to 512 tokens {{code}}. It is real text, but it is not your traffic.

Other teams found that tests like ours can overstate the gain. We did not measure these effects ourselves:

- A 2026 benchmark study by NVIDIA researchers, SPEED-Bench, found that synthetic prompts overstated speculative throughput by 23 percent on average. It also found that the best draft length fell to 1 as the batch grew.
- The same study found that random token ids left 20 to 30 percent of the experts idle in some layers of an MoE target.
- A 2026 study of EAGLE-3 and other drafts, Test-Time Speculation, found that the acceptance length falls as the answer grows. On MATH answers that ran toward 20,000 tokens, it fell from about 3.7 to about 1.5.
- A 2025 study of serving benchmarks compared speculation with the baseline. The median TPOT was 1.3 times lower, and the P99 TPOT was 1.16 times higher. TTFT also rose, because the draft runs its own prefill.

```

**Evidence: the four numbers to compare on your own traffic**

```text
title: the four numbers to compare on your own traffic
source: manuals/sglang-101/sections/4-4-speculative-decoding.md
lines: 58-63
lang: text
note: Item 4 asks for the acceptance of your longest answers alone.
---
Run a sample of your own traffic with and without speculation. Keep your real output lengths, and pass `--disable-ignore-eos` to the benchmark client. With no traffic sample, `--dataset-name speed-bench` reads a local copy of the SPEED-Bench prompts at v0.5.22 {{code}}. Compare these numbers:

1. The acceptance length, from `sglang:spec_accept_length`.
2. The median TPOT and the output throughput.
3. The P99 ITL and the P99 TTFT, because a gain in the median can hide a loss in the tail.
4. The acceptance length of your longest answers alone. Each `/generate` response gives it as `spec_accept_length` in `meta_info`.

```

**Questions**

1. Before the tables, say why one benchmark dataset cannot decide a speculation setting for three different products.
2. From the acceptance table, which dataset gives the draft the fewest accepted tokens, and what in that traffic explains it?
3. At 32 users, where does EAGLE3 lose output, and what does it cost there besides output?
4. The n-gram method had no gain on the random set. On which traffic did it pay, and what did it do to the tail?
5. What is the random dataset made of, and why did it hide both the loss and the gain?
6. Give one setting per product, and the measurement on production traffic that confirms each.

:::answer Show the answer
:::say Short answer
One setting cannot serve the three products, because the gain of speculation is a property of the traffic, not of the engine. For the math tutor, EAGLE3 stays on: 648 to 660 tokens per second against 397 at 32 users, and 33.3 to 34.3 ms per token against 65.5 at 8 users. For the code assistant, EAGLE3 is the first choice, 566 to 581 against 365 to 366 at 32 users, and n-gram is a cheaper second that pays on code at 8 users, 58.2 to 58.8 against 65.9 to 66.4, if its P99 ITL stays inside the product's target. For the support chat, EAGLE3 comes off at busy hours: on ShareGPT at 32 users it gave no more output and moved the median first token from 2.7 to 3.0 s up to 5.7 to 7.0 s. If the chat wants the 8-user gain, it needs a user cap per replica low enough that the pool is never the limit.
:::

**Walkthrough**

1. **Check the method before the result.** The test ran on one L4 with the clock locked at 900 MHz, the cache flushed before each run, two seeds, and 128 output tokens with ignore-eos. Only runs at a median clock of 900 MHz count. Four datasets: the random set, ShareGPT, GSM8K and code. So a difference between rows is the dataset and nothing else.
2. **Read the time per token at 8 users.** EAGLE3 cut the median TPOT on every dataset: 67.6 to 68.2 ms fell to 33.8 to 39.4 on random, 66.4 to 68.6 fell to 39.5 to 43.1 on ShareGPT, 65.5 fell to 33.3 to 34.3 on GSM8K, and 65.9 to 66.4 fell to 36.8 on code. At this load the gain holds for everyone. N-gram is another story. On random and ShareGPT it was a little slower than the default, 68.2 to 71.4 and 69.5 to 72.4 ms. On GSM8K it gave 54.6 to 55.0 and on code 58.2 to 58.8. The random-set result for n-gram was the one result that did not transfer.
3. **Read the acceptance.** EAGLE3 committed 2.69 to 2.78 tokens per step on GSM8K and 2.35 to 2.43 on ShareGPT. N-gram committed 1.44 to 1.46 on GSM8K and only 1.22 to 1.25 on ShareGPT. Chat answers repeat little of the prompt, so a method that copies from the prompt finds almost nothing there, and a learned draft guesses worse too. Math and code repeat structure, so both methods guess better. The acceptance column predicts every later column.
4. **Read the output at 32 users.** On random, EAGLE3 gave 239 to 242 tokens per second against 250 to 254 for the default. On ShareGPT, 277 to 283 against 281 to 288. On both chat-like sets it lost output under load. On GSM8K it gave 648 to 660 against 397, and on code 566 to 581 against 365 to 366. The manual calls that 1.6 times the output on GSM8K and code, and no more output on the other two. At a full batch every rejected draft token is compute taken from another user, so the gain survives only where the acceptance is high.
5. **Read the first token and the tail.** At 32 users EAGLE3 moved the median first token on random from 3.2 to 3.5 s up to 8.6 to 8.7 s, and on ShareGPT from 2.7 to 3.0 s up to 5.7 to 7.0 s. The manual's reading is that the draft took pool space that the queue needed, so requests waited longer for a slot. That is the support chat's complaint. N-gram at 32 users raised the P99 ITL to 244 to 779 ms against 83 to 106 ms for the default: a smoother median hid a rougher stream. The one-user default runs throttled below 300 MHz and were left out, which is the right call.
6. **Ask what random is.** The random dataset takes the first turn of ShareGPT conversations and cuts or repeats it to 512 tokens. It is real text, but it is not any product's traffic, and the repetition inside a cut-and-repeated prompt is not the repetition of a math answer. The studies the manual cites agree: synthetic prompts overstated speculative throughput by 23 percent on average, the best draft length fell to 1 as the batch grew, and on long answers the acceptance fell from about 3.7 to about 1.5.
7. **Use the manual's check.** Run a sample of your own traffic with and without speculation, with real output lengths and `--disable-ignore-eos`. Compare the acceptance length from `sglang:spec_accept_length`, the output and the median time per token, the P99 ITL and the P99 TTFT, and the acceptance of your longest answers alone, which each `/generate` response gives in `meta_info`.

**Resolution**

One setting cannot serve the three products, because the gain of speculation is a property of the traffic, not of the engine. For the math tutor, EAGLE3 stays on: 648 to 660 tokens per second against 397 at 32 users, and 33.3 to 34.3 ms per token against 65.5 at 8 users. For the code assistant, EAGLE3 is the first choice, 566 to 581 against 365 to 366 at 32 users, and n-gram is a cheaper second that pays on code at 8 users, 58.2 to 58.8 against 65.9 to 66.4, if its P99 ITL stays inside the product's target. For the support chat, EAGLE3 comes off at busy hours: on ShareGPT at 32 users it gave no more output and moved the median first token from 2.7 to 3.0 s up to 5.7 to 7.0 s. If the chat wants the 8-user gain, it needs a user cap per replica low enough that the pool is never the limit.

Each product confirms its setting on its own traffic: the acceptance from the counter, the median and the P99 ITL, the P99 TTFT, and the acceptance of the longest answers, with the clock recorded. The random set is retired as a decision tool and kept as a smoke test.

**Wrong turns**

- "EAGLE3 halved the time per token, so it helps everyone." At 8 users it did, on every dataset. At 32 users on ShareGPT it gave 277 to 283 tokens per second against 281 to 288 and a first token of 5.7 to 7.0 s against 2.7 to 3.0 s. The gain is a function of load and acceptance.
- "N-gram showed no gain, close the ticket." It showed no gain on a dataset that copies nothing. On code it cut the time per token from 65.9 to 66.4 ms down to 58.2 to 58.8 at 8 users, and on GSM8K down to 54.6 to 55.0.
- "The random set is real text, so it is representative." It is the first turn of ShareGPT conversations, cut or repeated to 512 tokens. It behaved like ShareGPT for the draft and like nothing in particular for n-gram.
- "Fix the chat's first token with a deeper draft." The first token grew because the draft took pool space the queue needed. A deeper draft takes more pool space, not less.
- "Compare medians, the tail takes care of itself." N-gram raised the P99 ITL at 32 users to 244 to 779 ms against 83 to 106 ms while its median looked fine on two datasets.

**Generalize**

A decode optimization that depends on guessing right has a value that depends on what it guesses about, so its benchmark must use the traffic it will serve, at the load it will serve, and report the tail and the first token next to the median. One synthetic dataset gives one point in that space, and a decision for several products needs one measurement per product.

:::

## Speculation depth against batch size

*Level 3 · incident · about 25 minutes · version: vLLM 0.31.0 and SGLang 0.5.22; model: Qwen/Qwen3-8B with the Tengyunw/qwen3_8b_eagle3 draft; hardware: one L4 with 24 GB of memory, SM clock locked at 900 MHz, and a GB10 as the second machine*

A team serves `Qwen/Qwen3-8B` on one L4 and wants shorter answers for its users. They turn on EAGLE3 with a trained draft and set the draft depth to 5, because a deeper draft guesses more tokens in each step. At one user the time per token almost halves, and the demo is a success.

The load test at 32 users tells another story. Each token still arrives faster, but the server writes no more total tokens each second than it did without speculation, while the first token now takes several seconds. The team concludes that speculation does not scale and schedules its removal. A second team, which serves a model of a second family on a GB10 with the same method, reports that their gain holds at 64 users and asks what the first team did wrong.

**Evidence: EAGLE3 at three draft depths against no speculation, with the clock locked**

```text
title: EAGLE3 at three draft depths against no speculation, with the clock locked
source: manuals/vllm-101/sections/4-1-speed-up-decode-with-eagle3.md
lines: 40-48
lang: text
note: Read the output column at 32 users from depth 1 to depth 5, then the time per token at one user.
---
| Users, L4 locked session | Config | Median TPOT | Output tok/s | Median SM clock |
|---|---|---|---|---|
| 32 | no speculation | 119.9 ms | 208.8 | 881 MHz |
| 32 | depth 1 | 100.4 ms | 271.1 | 900 MHz |
| 32 | depth 3 | 77.8 ms | 333.6 | 900 MHz |
| 32 | depth 5 | 83.7 ms | 289.5 | 885 MHz |
| 1 | depth 1 | 39.4 ms | 22.4 | 900 MHz |
| 1 | depth 3 | 27.8 ms | 31.3 | 900 MHz |
| 1 | depth 5 | 26.2 ms | 31.7 | 900 MHz |

```

**Evidence: the same draft on the other engine, time per token against output on the L4**

```text
title: the same draft on the other engine, time per token against output on the L4
source: manuals/sglang-101/sections/4-4-speculative-decoding.md
lines: 149-154
lang: text
note: Compare the two time per token columns with the two output columns at 32 and 64.
---
| Concurrency | Default median TPOT | EAGLE-3 median TPOT | Default output tok/s | EAGLE-3 output tok/s |
|---|---|---|---|---|
| 1 | 60.16 ms | 25.61 ms | 13.42 | 31.81 |
| 8 | 66.01 ms | 35.58 ms | 112.62 | 181.55 |
| 32 | 96.18 ms | 43.82 ms | 270.11 | 269.42 |
| 64 | 107.42 ms | 51.50 ms | 250.85 | 245.34 |

```

**Evidence: the startup lines of the server with the draft loaded on the L4**

```text
title: the startup lines of the server with the draft loaded on the L4
source: manuals/sglang-101/capture/gpu/out-l4/server-load-eagle3.log
lines: 1-4
lang: text
note: Read the token pool and the running request limit in the last line.
---
[2026-10-17 11:19:19] Load weight end. elapsed=3.80 s, type=Qwen3ForCausalLM, avail mem=6.59 GB, mem usage=15.28 GB.
[2026-10-17 11:19:21] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 9951, K size: 0.68 GB, V size: 0.68 GB
[2026-10-17 11:19:21] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 9951, K size: 0.02 GB, V size: 0.02 GB
[2026-10-17 11:20:05] max_total_num_tokens=9951, chunked_prefill_size=4096, max_prefill_tokens=16384, max_running_requests=48, context_len=40960, available_gpu_mem=1.23 GB

```

**Evidence: the one warning that sets the request limit**

```text
title: the one warning that sets the request limit
source: manuals/sglang-101/capture/gpu/out-gb10/server-eagle3.log
lines: 4-4
lang: text
note: This line prints once at startup and scrolls away before the first request.
---
[2026-10-17 15:14:58] Max running requests is reset to 48 for speculative decoding. You can override this by explicitly setting --max-running-requests.

```

**Evidence: EAGLE3 with its own draft on a mixture-of-experts model on the GB10**

```text
title: EAGLE3 with its own draft on a mixture-of-experts model on the GB10
source: manuals/sglang-101/sections/4-4-speculative-decoding.md
lines: 112-117
lang: text
note: Divide the baseline time per token by the EAGLE-3 time per token on each row.
---
| Concurrency | Baseline median TPOT | EAGLE-3 median TPOT | Baseline output tok/s | EAGLE-3 output tok/s |
|---|---|---|---|---|
| 1 | 32.52 ms | 20.30 ms | 29.14 | 40.93 |
| 8 | 102.21 ms | 59.44 ms | 74.11 | 97.06 |
| 32 | 201.91 ms | 106.97 ms | 150.66 | 228.78 |
| 64 | 254.06 ms | 138.41 ms | 235.38 | 276.32 |

```

**Evidence: the acceptance length on answers of about 2,000 tokens, both engines**

```text
title: the acceptance length on answers of about 2,000 tokens, both engines
source: manuals/vllm-101/capture/gpu/out-l4/eagle3-long-outputs.txt
lines: 8-15
lang: text
note: Read the acceptance per draft position, then the comparison with short answers under the table.
---
engine          dataset    mean acceptance length   accepted per draft position 1 / 2 / 3
SGLang EAGLE3   GSM8K      2.68
SGLang EAGLE3   ShareGPT   2.32
vLLM EAGLE3     GSM8K      2.69                     0.77 / 0.54 / 0.38
vLLM EAGLE3     ShareGPT   2.35                     0.67 / 0.42 / 0.26

Short outputs (128 tokens) in the same session on SGLang: GSM8K 2.69 to 2.78, ShareGPT 2.33 to 2.43.
Acceptance did not fall from 128 tokens to about 2,000 tokens on these datasets.

```

**Questions**

1. Why does a deeper draft pay at one user and cost at 32? Name what a wrong guess spends in each case.
2. From the depth sweep, which depth wins at 32 users and which at one user, and how do you know that the gain is real and not noise?
3. On the L4 each token got faster at every load, and the output stopped growing from 32 users. Which two startup lines explain that, and what does each one cost?
4. On the GB10, an MoE model with its own EAGLE3 draft kept its gain at 64 users. The model, the draft and the card all changed. Which change do you think explains most of the result, and how would you test it?
5. Acceptance stayed between 2.32 and 2.69 tokens per step on long answers. Why would you still measure it on the longest answers that your users get?
6. Design the rollout: which depth, which limits you set by hand, which metrics you read, and which runs come before production.

:::answer Show the answer
:::say Short answer
For this model and draft on the L4, the right depth is 3. With the clock locked it gave 1.6 times the output at 32 users and tied depth 5 at one user, while depth 5 lost output under load. The first team measured depth 5 at one user and read that result as a property of speculation.
:::

**Walkthrough**

A draft model guesses the next tokens, and the target model checks all the guesses in one pass. At one user the GPU has spare compute in each step, so the extra guesses are almost free and each accepted guess is a token that the target did not have to compute alone. At 32 users each step is already full, and every wrong guess takes compute from a real token of another user.

The depth sweep shows that trade with the clock locked at 900 MHz. At 32 users the run without speculation gave 208.8 tokens per second. Depth 1 gave 271.1, depth 3 gave 333.6 and depth 5 gave 289.5. Depth 3 is 1.6 times the baseline, and its seed range did not overlap with any other config. Depth 5 lost output against depth 3, so its extra guesses cost more than they gave. At one user depth 3 cut the time per token from 39.4 to 27.8 ms against depth 1, and depth 5 at 26.2 ms tied with it inside the seed spread. The one-user run without speculation fell to 210 MHz, below the lock, so it is left out of the comparison. One more cost hides in the median: the ITL at 32 users rose from 84 ms to 133 ms at depth 3, because each step now delivers several tokens at once and the stream arrives in larger, less frequent groups.

The second listing is the other engine with the same draft on the same card. Each token came out 1.6 to 2.3 times faster at every load. At 32 users the output was 269.42 against 270.11 tokens per second without the draft, a ratio of 1.00, and at 64 users 245.34 against 250.85. The startup lines explain it. With the draft loaded, the KV pool held 9,951 tokens against 24,094 without it, about 15 of our 640-token requests, because the draft took its share of the card. And the server set `max_running_requests=48` by itself. The fourth listing is the warning that does it: when nobody sets the limit, the engine resets it to 48 for speculative decoding, prints that once, and the line scrolls away. At 32 users the first token took 8,040 ms with the draft against 2,970 ms without, because the pool held about 15 requests and the rest waited.

The GB10 run is the counterexample, with a caveat: that run used another model, another draft and another card, so it does not isolate the architecture. On a mixture-of-experts model the time per token fell by 1.56 times or more at every load, with a peak of 1.89 times at 32 and 1.84 at 64, and the acceptance length stayed between 2.71 and 2.74 tokens per step. A dense model reads all its weights in each step, so a larger batch already uses the spare compute that speculation needs. A mixture-of-experts model reads only the experts that the tokens of the step chose, and the verify pass scores four positions per request with the expert weights that it already read. Even there the cap bit: at 64 users the output was 276.32 against 235.38, but the median first token was 7,772 ms against 557 ms, because 48 requests ran and 16 waited.

The last listing is the acceptance on long answers at 8 users: 2.68 and 2.32 tokens per step on two datasets for one engine, 2.69 and 2.35 for the other, with the first draft position accepted 0.77 and 0.67 of the time and each later position less. It did not fall from 128-token answers to answers of about 2,000 tokens. That is our measurement, on two datasets. A 2026 study of reasoning answers that ran toward 20,000 tokens found the acceptance length fall from about 3.7 to about 1.5, and another found that synthetic prompts overstate the gain of real prompts. So the number to trust is the one from your own longest answers.

**Resolution**

For this model and draft on the L4, the right depth is 3. With the clock locked it gave 1.6 times the output at 32 users and tied depth 5 at one user, while depth 5 lost output under load. The first team measured depth 5 at one user and read that result as a property of speculation.

Two settings decided the load test, and neither was the draft depth. The draft shrank the pool to 9,951 tokens, which holds about 15 of the 32 requests, and the engine capped the running requests at 48 without being asked, which binds at 64 users. Read the pool line and the cap warning after you load a draft, set `--max-running-requests` yourself, and count how many of your requests fit in the smaller pool. Then measure on your own traffic without `--ignore-eos`: the acceptance from the draft and accepted token counters, the median time per token and the output, and the P99 ITL and P99 TTFT, because a better median can hide a worse tail. Lock or record the clock for every pair. The second team was right for their machine and wrong to generalize: on a mixture-of-experts model the gain held as the batch grew, and on a dense 8B model it did not.

**Wrong turns**

- "A deeper draft always gives more tokens per step." At 32 users depth 5 gave 289.5 tokens per second and depth 3 gave 333.6. Past the depth that the acceptance supports, each extra guess is compute taken from another user.
- "Speculation does not scale, remove it." The output tie on the dense model came from a pool of 9,951 tokens, not from the draft. At 32 users the cap of 48 did not bind; at 64 users it did. The mixture-of-experts model kept 1.84 times at 64 users.
- "Compare against the run without speculation at one user too." That run fell to 210 MHz while the others held 900. A clock gap that large hides the effect, so the row is left out.
- "The acceptance from the 128-token benchmark is the acceptance we will see." Our long answers held it, but a study of answers toward 20,000 tokens saw it fall from about 3.7 to about 1.5. Measure your own tail.
- "Raise the running request limit and the queue disappears." The pool holds about 15 requests of 640 tokens. A higher limit does not add memory, it adds waiting on a different line of the log.

**Generalize**

A feature that spends idle capacity pays when the capacity is idle and costs when it is not, so its value is a function of the load, the model architecture and the memory it takes, not a property of the feature. Measure it across the load range you serve, read every startup line that a new component changes, and treat a default that a component sets for you as a setting you now own.

:::

## Temperature 0 still gave two answers

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22 and vLLM 0.31.0; model: Qwen/Qwen3-30B-A3B-Instruct-2507 on the GB10, and Qwen/Qwen3-8B-FP8 and Qwen/Qwen3-0.6B on the L4; hardware: one GB10 with 128 GB of unified memory, and the shared second L4 of a two-GPU node*

An evaluation team runs its benchmark twice against the team's serving endpoint, at temperature 0, with an identical prompt list in an identical order. The two scores differ by about a point. They take one question whose answer changed and send it alone, twice. The two texts are identical. Then they send it alone five times and inside a batch of 16 five times, against a GB10 server that runs a model with mixture-of-experts layers. The first of the five single requests gives one text. The next four give another text, which leaves the first after a few hundred characters. All five batched requests give the first text again.

The ticket says that the weights or the tokenizer must be corrupt, because temperature 0 is deterministic by definition.

**Evidence: the summary of the probe on the default GB10 server**

```text
title: the summary of the probe on the default GB10 server
source: manuals/sglang-101/capture/gpu/out-gb10/determinism.txt
lines: 11-11
lang: text
note: Five requests alone gave two texts, five in a batch gave one, and all five batched matched the first request alone.
---
{"summary": true, "distinct_alone": 2, "distinct_in_batch": 1, "in_batch_matching_alone": 5, "rounds": 5}

```

**Evidence: the same probe on the L4, default server against the deterministic flag**

```text
title: the same probe on the L4, default server against the deterministic flag
source: manuals/sglang-101/capture/gpu/out-l4/livecheck-2026-10-23.txt
lines: 7-18
lang: text
note: Read the pattern of the default row letter by letter, then the backend that the flag chose on this GPU.
---
Probe: one prompt 5 times alone, then 5 times in a batch of 16, temperature 0.

server                                    distinct texts   pattern
default                                   3                A, B, B, B, B, C, B, B, B, B
--enable-deterministic-inference          1                all ten the same

On the default server the first request alone differs and the four later requests alone match each other.
One batched request differed. On BF16 Qwen/Qwen3-8B (the earlier L4 run), the batched requests gave two more texts.

Deterministic mode with no --attention-backend, startup log:
Attention backend not specified. Falling back to 'fa3' for deterministic inference
The server ran on fa3 on SM 8.9 with no error. The default server on this GPU uses flashinfer.

```

**Evidence: three startup lines of the GB10 server with the deterministic flag**

```text
title: three startup lines of the GB10 server with the deterministic flag
source: manuals/sglang-101/capture/gpu/out-gb10/server-deterministic.log
lines: 4-6
lang: text
note: Each line names one thing that the flag changed.
---
[2026-10-17 15:40:03] Sampling backend is set to pytorch for deterministic inference.
[2026-10-17 15:40:03] Attention backend not specified. Falling back to 'flashinfer' for deterministic inference. You can explicitly set --attention-backend to one of ['ascend', 'fa3', 'fa4', 'flashinfer', 'intel_xpu', 'triton'].
[2026-10-17 15:40:03] Currently radix cache is not compatible with flashinfer attention backend for deterministic inference. It will be supported in the future.

```

**Evidence: the summary of the probe with the deterministic flag on the GB10**

```text
title: the summary of the probe with the deterministic flag on the GB10
source: manuals/sglang-101/capture/gpu/out-gb10/deterministic-determinism.txt
lines: 11-11
lang: text
note: Compare the three counts with the default summary.
---
{"summary": true, "distinct_alone": 1, "distinct_in_batch": 1, "in_batch_matching_alone": 5, "rounds": 5}

```

**Evidence: how many greedy outputs changed with the cache state and with the batch, both engines**

```text
title: how many greedy outputs changed with the cache state and with the batch, both engines
source: manuals/vllm-101/capture/gpu/out-l4/greedy-output-cache-batch-dtype.txt
lines: 8-24
lang: text
note: Read the two zero rows first, then the two rows under them, then the table at a concurrency of 64.
---
Concurrency 1, 32 prompts, Qwen3-0.6B:

comparison                     SGLang 0.6B   vLLM 0.6B
flushed repeat against fresh   0 of 32       0 of 32
cache off against cache off    0 of 32       0 of 32
fresh against warm cache       21 of 32 (45) 11 of 32 (57)
cache on against cache off     25 of 32 (26) 21 of 32 (48)

Concurrency 64, 64 prompts sent at once:

engine, model    fresh vs fresh restart   fresh vs warm   warm vs warm   cache on vs off   off vs off
SGLang 0.6B      52                       35              32             54                27
vLLM 0.6B        49                       45              12             48                50
SGLang 8B-FP8    59                       38              1              63                6
vLLM 8B-FP8      14                       31              21             34                34

At concurrency 64 the batch changes greedy output even with the cache off, so the cache effect cannot be separated at this load.

```

**Evidence: how many greedy outputs changed between BF16 and FP16**

```text
title: how many greedy outputs changed between BF16 and FP16
source: manuals/vllm-101/capture/gpu/out-l4/greedy-output-cache-batch-dtype.txt
lines: 26-33
lang: text
note: The sentence before the table says what a repeat in one dtype gave.
---
BF16 against FP16 (B-09): 64 ShareGPT questions, greedy, 256 tokens, concurrency 1, prefix cache off.
A repeat in the same dtype gave 0 of 64 different outputs on every engine and model.

engine, model   BF16 against FP16
SGLang 0.6B     51 of 64 (41)
SGLang 1.7B     57 of 64 (54)
vLLM 0.6B       48 of 64 (51)
vLLM 1.7B       56 of 64 (56)

```

**Evidence: the speed cost of the batch-invariant mode on vLLM, clock locked**

```text
title: the speed cost of the batch-invariant mode on vLLM, clock locked
source: manuals/vllm-101/capture/gpu/out-l4/batch-invariant-cost.txt
lines: 7-16
lang: text
note: Read the ratio in brackets on each row, then how it changes with more users.
---
Qwen/Qwen3-0.6B, every run at a median clock of 900 MHz. The two default blocks agree within 1 percent:
users   median TPOT default / batch-invariant   output tok/s default / batch-invariant
1       6.9 / 16.9 ms (2.4x)                    140.6 / 58.7 (58% lower)
8       9.9 / 18.2 ms (1.8x)                    755 / 420 (44% lower)
32      18.8 / 25.9 ms (1.4x)                   1,565 / 1,154 (26% lower)

Qwen/Qwen3-8B, rows where all three blocks ran at a median clock of 900 MHz:
users   median TPOT default / batch-invariant   output tok/s default / batch-invariant
8       70.0 / 97.4 ms (1.4x)                   103.4 / 75.1 (27% lower)
32      109 / 139 ms (1.3x)                     245 / 188 (23% lower)

```

**Questions**

1. Temperature 0 takes the token with the highest logit. What can change the logits of one prompt between two requests on a serving engine, when nothing in the request changes?
2. In the GB10 probe the first of the five single requests differed from the next four, and the batched requests matched the first. Explain both facts with one mechanism.
3. On the L4 the default server gave three texts: A, B, B, B, B, then C, B, B, B, B. What did the batch add?
4. The deterministic flag made all ten requests match. List what it switched, and what each switch costs.
5. The counts table separates three causes. Which one does a cache reset fix, which one needs batch-invariant kernels, and which one is neither a bug nor fixable by a flag?
6. Write the protocol for an evaluation that must repeat exactly, and say what you give up for it.

:::answer Show the answer
:::say Short answer
The weights and the tokenizer were fine. A repeat after a cache flush gave identical text for every prompt. Three causes changed the scores: the prefix cache, which ran a different prefill path for a warm prompt, the batch that each request landed in, and the dtype, which the team had not held fixed between the two endpoints.
:::

**Walkthrough**

Floating-point addition is not associative. A matrix multiply, a softmax or a norm splits its sums into tiles, and many kernels pick the split from the batch size and from the path that the prompt takes. A difference in the last bit can change which token has the highest logit, and after one different token every later token is conditioned on a different text. So the request did not change, the arithmetic around it did.

The first summary has three counts. Five requests alone gave two distinct texts, five requests in a batch gave one, and all five batched texts matched the first request alone. Our reading, from the manual: the first request computed its prompt from nothing, and the four later ones found the prompt in the radix cache and ran a different prefill path. The 238 characters that the two texts share are the tokens before the first bit flipped. The L4 probe adds the batch. On the default server the pattern was A, B, B, B, B, C, B, B, B, B: the first request alone differed from the four later ones, and one batched request landed on a third text. The batch changed the tile split once more.

The third listing shows what the flag did at startup on the GB10. The sampling backend moved to the PyTorch sampler. With no attention backend given, the server fell back to FlashInfer and listed the six backends that the mode accepts. And the radix cache went off, because at this version the cache is not compatible with FlashInfer in deterministic mode. On the L4 the same flag fell back to `fa3`, which keeps the radix cache on. The fourth summary is the result on the GB10: one distinct text alone, one in the batch, and all five batched matching alone. The price on the GB10 was 18 percent of the throughput at a concurrency of 8, from 78.92 to 64.83 tokens per second, with the median time per token up from 97.30 to 117.43 ms, and the workload paid again for every repeated prefix.

The fifth listing separates the causes at one user. A repeat after a cache flush changed 0 of 32 outputs, and so did a repeat with the cache off, on both engines. The same prompts against a warm cache changed 21 of 32 outputs on one engine and 11 of 32 on the other. At 64 requests sent at once, two runs with the cache off still differed in 27 of 64 and 50 of 64 outputs, so the batch alone changed most outputs and the cache effect could not be separated at that load. The dtype listing is the third cause: BF16 against FP16 changed 51 of 64 and 48 of 64 outputs for the small model, and a repeat in the same dtype changed none. The last listing is the cost of the other engine's fix. With the clock locked, the batch-invariant mode made the time per token 2.4 times longer at one user on the small model and 1.4 times at 8 users on the 8B model, with 58 and 27 percent less output. The probe on that engine gave identical text alone and in a batch of 32 with the mode on, and different text with it off.

**Resolution**

The weights and the tokenizer were fine. A repeat after a cache flush gave identical text for every prompt. Three causes changed the scores: the prefix cache, which ran a different prefill path for a warm prompt, the batch that each request landed in, and the dtype, which the team had not held fixed between the two endpoints.

When an evaluation must repeat exactly, flush the cache or restart the server between the two runs, keep the dtype, the engine version and the hardware the same, and run one request at a time. That gives an exact repeat with no flag. Under load, turn on the deterministic mode or the batch-invariant mode and pay for it: 18 percent of the throughput on the GB10 at a concurrency of 8, and 1.4 to 2.4 times the time per token on the other engine. Set a sampling seed on every request that samples. Compare outputs token by token, not only scores, and run the engine's determinism test on your model, your backend and your parallel layout before you rely on it. Leave the mode off for production traffic, where the cache and the faster kernels are worth more than identical bits.

**Wrong turns**

- "The weights or the tokenizer are corrupt." A repeat after a cache flush changed 0 of 32 outputs on both engines, so every text matched. Corrupt weights do not heal with a flush.
- "Set a seed and the problem goes away." Greedy decoding samples nothing, and the engine already fixes a seed. The order of the sums changed, and a seed does not touch it.
- "Turn the deterministic flag on in production." It cost 18 percent of the throughput at a concurrency of 8 and turned the radix cache off on the default backend. Pay that for evaluations and rollouts, not for users.
- "The scores are within a point, so the runs agree." Two runs can land on the same score with different outputs, and the next run can land elsewhere. Compare the tokens.
- "Temperature 0 is deterministic by definition." It picks the largest logit, and the logits changed with the cache state, the batch and the dtype. The GB10 gave two texts from one prompt with nothing in the request changed.

**Generalize**

Determinism is a property of the whole execution, not of the sampling rule. Any change in the batch, the cache state, the data type, the kernel or the hardware can move a logit by one bit and the text by a paragraph. Decide which of those you hold fixed, measure what the fix costs, and write the cache setting and the cached tokens next to every evaluation result.

:::

## Tensor parallel refused, data parallel starved

*Level 3 · incident · about 25 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: a node with two L4 GPUs, the second shared with another team's pods*

A team serves `Qwen/Qwen3-8B` from one L4 and wants more capacity. The node has a second L4, so the plan is to use both. The first attempt is `--tp-size 2`. The server dies two seconds after NCCL comes up, with a `RuntimeError` that says the memory capacity is unbalanced and that some GPUs may be occupied by other processes. A quick look at the node shows two small pods from another team on the second card.

The second attempt is `--dp-size 2`, two copies of the model behind one controller. It starts, and the team runs its load sweep. At 64 users the pair delivers less output each second than the single card did, and each first token takes many seconds. An engineer from the other team suggests that the node itself is half broken and asks for a hardware ticket. You are asked to read the logs first.

**Evidence: what the second GPU held minutes before the start**

```text
title: what the second GPU held minutes before the start
source: manuals/sglang-101/capture/gpu/incidents/l4-tp-unbalanced-memory.txt
lines: 1-5
lang: text
note: Read the memory used on each GPU and the two processes that held it.
---
# sglang serve --tp-size 2 on two L4s while two other pods held 3.5 GB of GPU1
# nvidia-smi --query-gpu=index,memory.used,utilization.gpu, 2026-10-17, read minutes before the start
0, 0 MiB, 0 %
1, 3506 MiB, 55 %
# GPU1 compute apps: two pods running python3 "CUDA vGPU Slice Diagnostics", 1746 MiB each

```

**Evidence: the tensor parallel start, two seconds after NCCL came up**

```text
title: the tensor parallel start, two seconds after NCCL came up
source: manuals/sglang-101/capture/gpu/incidents/l4-tp-unbalanced-memory.txt
lines: 7-12
lang: text
note: The RuntimeError gives three numbers: the free memory before loading, the local GPU memory and 90 percent of it.
---
# runs/l4/load/tp2/server.log, lines after the NCCL version
[2026-10-17 05:22:01 TP0] sglang is using nccl==2.30.7
[2026-10-17 05:22:03 TP0] Scheduler hit an exception: Traceback (most recent call last):
    raise RuntimeError(msg)
RuntimeError: The memory capacity is unbalanced. Some GPUs may be occupied by other processes. pre_model_load_memory=18.28375244140625, local_gpu_memory=21.70391845703125, local_gpu_memory * 0.9=19.533526611328124
[2026-10-17 05:22:03] Received sigquit from a child process. It usually means the child failed.

```

**Evidence: the data parallel start: the weights and the pool of each rank**

```text
title: the data parallel start: the weights and the pool of each rank
source: manuals/sglang-101/capture/gpu/out-l4/server-dp2.log
lines: 1-6
lang: text
note: Compare the available memory after the weights and the token count of the two pools.
---
[2026-10-17 05:26:45 DP0] Load weight end. elapsed=3.61 s, type=Qwen3ForCausalLM, avail mem=6.59 GB, mem usage=15.28 GB.
[2026-10-17 05:26:45 DP1] Load weight end. elapsed=3.73 s, type=Qwen3ForCausalLM, avail mem=3.17 GB, mem usage=15.28 GB.
[2026-10-17 05:26:46 DP0] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 24094, K size: 1.65 GB, V size: 1.65 GB
[2026-10-17 05:26:46 DP1] KV Cache is allocated. dtype: torch.bfloat16, #tokens: 2925, K size: 0.20 GB, V size: 0.20 GB
[2026-10-17 05:27:19 DP0] max_total_num_tokens=24094, chunked_prefill_size=4096, max_prefill_tokens=16384, max_running_requests=2048, context_len=40960, available_gpu_mem=1.36 GB
[2026-10-17 05:28:30 DP1] max_total_num_tokens=2925, chunked_prefill_size=4096, max_prefill_tokens=16384, max_running_requests=1462, context_len=40960, available_gpu_mem=0.94 GB

```

**Evidence: four decode lines of the two ranks under a load of 64 requests**

```text
title: four decode lines of the two ranks under a load of 64 requests
source: manuals/sglang-101/capture/gpu/out-l4/server-dp2.log
lines: 7-10
lang: text
note: Compare running requests, token usage, generation throughput and the queue of each rank.
---
[2026-10-17 07:26:50 DP1] Decode batch, #running-req: 4, #token: 2385, token usage: 0.82, cuda graph: True, gen throughput (token/s): 25.48, #queue-req: 59
[2026-10-17 07:26:53 DP0] Decode batch, #running-req: 1, #token: 590, token usage: 0.02, cuda graph: True, gen throughput (token/s): 9.67, #queue-req: 0
[2026-10-17 07:26:56 DP1] Decode batch, #running-req: 4, #token: 2545, token usage: 0.87, cuda graph: True, gen throughput (token/s): 25.79, #queue-req: 59
[2026-10-17 07:26:59 DP0] Decode batch, #running-req: 3, #token: 1665, token usage: 0.07, cuda graph: True, gen throughput (token/s): 9.49, #queue-req: 0

```

**Evidence: what the tensor parallel check does, and why it is right**

```text
title: what the tensor parallel check does, and why it is right
source: manuals/sglang-101/sections/6-1-tp-size-dp-size-and-attn-dp-size.md
lines: 113-115
lang: text
note: Two paragraphs from the manual.
---
Before it loads weights, each rank measures its free memory, and the group keeps the smallest value. If that value is less than 90 percent of the local free memory, the server stops {{code}}. The second card had 18.28 GB free against the 19.53 GB that the check required. No flag turns the check off at v0.5.22.

The check is right to stop. Each rank of a TP group holds the same share of weights and the same pool. The smallest card sets the size for all of them. On a shared machine, give a TP group whole GPUs. `--dp-size 2` does not have this check, because each copy sizes its own pool, so it started on the same pair.

```

**Evidence: how the default load balancing method filled the small copy**

```text
title: how the default load balancing method filled the small copy
source: manuals/sglang-101/sections/6-1-tp-size-dp-size-and-attn-dp-size.md
lines: 137-139
lang: text
note: Read how many requests sat on the small copy at a concurrency of 64.
---
The second card had 3.17 GB free after the weights, against 6.59 GB on the first, because the two pods held the rest. **We measured** a pool of 2,925 tokens on that copy, an eighth of the first. Four requests of 640 tokens fill it.

The controller still sent every second request to that copy, because `round_robin` does not look at pools or queues. The benchmark keeps 64 requests open at a time. At concurrency 64, 63 of them sat on the small copy, 4 running and 59 waiting. The large copy had one to three requests and used 2 to 7 percent of its pool. The client could not send it more work until the small copy gave a slot back.

```

**Evidence: the same pair with requests routed by token count**

```text
title: the same pair with requests routed by token count
source: manuals/sglang-101/sections/6-1-tp-size-dp-size-and-attn-dp-size.md
lines: 169-169
lang: text
note: Compare the three throughput numbers at 64 users, and read the clock caution.
---
At 64 users the pair gave 114.7 tok/s routed by tokens, against 41.7 with round robin and 250.9 on one L4. At 8 users it gave 92.1 against 64.2 and 112.6. The median TTFT at 64 users fell from 4,763 to 3,977 ms. The median clock at 64 users was 1,020 MHz, against 675 MHz in the round-robin run. So part of the gain can be the card.

```

**Questions**

1. What does the tensor parallel check compare, and why did the data parallel start pass where it failed?
2. The two copies loaded the same weights. Why is one pool an eighth of the other?
3. Under load, which rank held the queue and which one sat near idle? Which default sent the work there?
4. Would two copies with equal pools have doubled the capacity? What would you read before you claim it?
5. Name two fixes that keep both cards and one that does not, and say which of them the manual measured.

:::answer Show the answer
:::say Short answer
The node is not broken. The second card carries another tenant, and both layouts answered that fact in their own way: the balance check stopped the first layout before it loaded, and the second layout gave one copy a pool of 2,925 tokens and then fed it every second request. The team went back to one L4 for production traffic, because it beat the pair at every load, and asked for the pods to move. With two whole cards, they will start `--dp-size 2` again and accept it only after the two `#tokens` lines of the `DP0` and `DP1` ranks read about the same.
:::

**Walkthrough**

1. **Read the check in the tensor parallel error.** Before it loads weights, each rank measures its free memory, and the group keeps the smallest value. If that value is below 90 percent of the local free memory, the server stops. The error prints the three numbers: the free memory before loading, 18.28 GB, the local memory of the card, and 90 percent of that local memory, 19.53 GB, as the line. The second card had 3,506 MiB in use by two pods of 1,746 MiB each, and that put it under the line. No flag turns the check off at this version. The check is right to stop, because every rank of a tensor parallel group holds the same share of the weights and the same pool, so the smallest card would set the pool for both.
2. **Read why data parallel started.** Each copy sizes its own pool, so there is no balance check. Both ranks loaded 15.28 GB of weights. Rank 0 then had 6.59 GB free and rank 1 had 3.17 GB, because the pods held the rest. The pools came out at 24,094 tokens against 2,925. Four requests of 640 tokens fill the small one.
3. **Read the four decode lines.** Rank 1 ran 4 requests at a token usage of 0.82 to 0.87, wrote about 25 tokens per second, and had 59 requests in its queue. Rank 0 ran 1 to 3 requests at a usage of 0.02 to 0.07, wrote under 10 tokens per second, and had no queue. The controller's default method, `auto`, resolves to `round_robin` outside disaggregation, and round robin does not look at pools or queues. The benchmark keeps 64 requests open, so 63 of them sat on the small copy, 4 running and 59 waiting, and the client could not send the large copy more work until the small copy gave a slot back.
4. **Put a number on the loss.** At 64 users the pair gave 41.7 tokens per second against 250.9 on one L4, and the median P99 time to the first token over three seeds was 391 seconds for the pair and 33.4 for one L4. The pair also ran at 765 and 675 MHz at the two highest loads, under the clock floor, while the single card ran at 1,320 and 1,080 MHz, so part of the loss is the clock. Up to 4 users the pair was already 16 to 41 percent slower, for a reason the manual did not isolate.
5. **Read the one fix that was measured.** With `--load-balance-method total_tokens`, each request goes to the copy that holds the fewest tokens. The same uneven pair then gave 114.7 tokens per second at 64 users, against 41.7 with round robin and 250.9 on one card, and the median first token fell from 4,763 to 3,977 ms. The clock was 1,020 MHz in that run against 675 before, so part of that gain can be the card. The manual did not measure a pair with equal pools, and it did not measure two servers behind a gateway with weights. Its expectation is that data parallelism adds capacity only when every copy has about the same pool.

**Resolution**

The node is not broken. The second card carries another tenant, and both layouts answered that fact in their own way: the balance check stopped the first layout before it loaded, and the second layout gave one copy a pool of 2,925 tokens and then fed it every second request. The team went back to one L4 for production traffic, because it beat the pair at every load, and asked for the pods to move. With two whole cards, they will start `--dp-size 2` again and accept it only after the two `#tokens` lines of the `DP0` and `DP1` ranks read about the same.

The pair of decode lines is the evidence for this reading: the rank with the small pool held 59 waiting requests while the rank with the large pool used 2 to 7 percent of its pool. Routing by token count raised the pair from 41.7 to 114.7 tokens per second at 64 users and still lost to the single card, so the pool, and not the router, is the limit to fix.

**Wrong turns**

- "Tensor parallel is refused, so use data parallel, which starts." Starting is not serving. Read the `#tokens` line of every rank before the load test, because each copy sizes its own pool and nobody checks them against each other.
- "Lower the memory fraction so the tensor parallel check passes." The check compares free memory before the weights load, not the fraction. The smaller card would still set the pool for both ranks.
- "Round robin is fair, so the loss must be the hardware." Round robin does not read pools or queues. At 64 open requests, 63 sat on the copy with the small pool.
- "Fix the routing and the two copies will double throughput." Routed by tokens, the pair gave 114.7 tokens per second against 250.9 for one card. The small pool is still there, and part of the gain was a higher clock.

**Generalize**

A parallel layout is a promise that every member carries an equal share. Tensor parallelism checks that promise before it loads and stops when a card is short. Data parallelism makes no check and gives each copy what its card has left, so a shared card becomes a small copy that a blind router fills first. Before you add a GPU, read what else lives on it, and after the start, read the pool line of every rank. Capacity that you did not verify per rank is a sum that does not add.

:::
