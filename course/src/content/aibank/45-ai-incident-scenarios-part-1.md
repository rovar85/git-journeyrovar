---
track: aibank
title: "AI incident scenarios, read the evidence (part 1 of 10)"
short: Incidents 1
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## A 400 for long answers

*Level 1 · incident · about 15 minutes · version: vLLM 0.31.0; model: Qwen/Qwen3-0.6B; hardware: the shared second L4 of a two-GPU node, with another user's processes on it*

A product team runs `Qwen/Qwen3-0.6B` on one vLLM server for an internal writing tool. A support ticket arrives: "the API rejects long answers". The client sets `max_tokens` to 50000 so that the model never cuts an answer short, and every such request comes back as HTTP 400 at once, before any token streams. Shorter requests work.

The ticket asks the platform team to "turn off the limit". You pick it up with the error body, the startup log of the server and the manual.

**Evidence: the answer the client got**

```text
title: the 400 answer to a request with max_tokens of 50000
source: manuals/vllm-101/capture/gpu/out-l4/livecheck-2026-10-22.txt
lines: 46-48
lang: text
note: Read the two numbers in the message and the parameter that it names.
---
== c44 max_tokens above max model len
HTTP/1.1 400 Bad Request
{"error":{"message":"max_tokens=50000 cannot be greater than max_model_len=40960. Please request fewer output tokens. (parameter=max_tokens, value=50000)","type":"BadRequestError","param":"max_tokens","code":400}}

```

**Evidence: the pool and the maximum length of that server at startup**

```text
title: the pool and the maximum length of that server at startup
source: manuals/vllm-101/capture/gpu/out-l4/livecheck-2026-10-22.txt
lines: 11-12
lang: text
note: The second line gives the longest request the server accepts and how many such requests fit in the pool.
---
(EngineCore pid=2813854) INFO 10-22 21:25:26 [gpu_worker.py:692] Available KV cache memory: 9.02 GiB
(EngineCore pid=2813854) INFO 10-22 21:25:26 [kv_cache_utils.py:2464] GPU KV cache size: 84,480 tokens, Maximum concurrency for 40,960 tokens per request: 2.06x

```

**Evidence: a request that the server cut at its own cap**

```text
title: a request that the server cut at its own cap
source: manuals/vllm-101/capture/gpu/out-l4/livecheck-2026-10-22.txt
lines: 19-22
lang: text
note: With max_tokens of 64 the finish reason is length, and the reasoning field holds the start of the answer.
---
== c03 thinking on, 64 tokens
finish length
content None
reasoning "\nOkay, the user asked me to name three prime numbers. Let me think. First, what's a prime number? A prime number is a nu"

```

**Evidence: the troubleshooting entry for this status code**

```text
title: the troubleshooting entry for this status code
source: manuals/vllm-101/sections/7-1-troubleshoot-by-symptom.md
lines: 99-103
lang: text
note: Two shapes of the same error, and the fix for each side.
---
### A request returns HTTP 400 about the maximum context length

- **Cause:** the prompt tokens plus `max_tokens` are more than `--max-model-len`.
- **Check:** the error says `This model's maximum context length is` and gives the counts. When `max_tokens` alone is above the limit, the error says that `max_tokens` cannot be greater than `max_model_len`, as it did on our L4.
- **Fix:** send a shorter prompt or a smaller `max_tokens`, or start the server with a larger maximum length if the pool allows it.

```

**Evidence: the four choices when the pool holds too few users**

```text
title: the four choices when the pool holds too few users, in order of cost
source: manuals/vllm-101/sections/2-1-count-the-memory-before-you-pick-a-gpu.md
lines: 83-90
lang: text
note: The first choice is the one that this ticket is about.
---
## Decide what to change

If the count is too small for your traffic, you have four choices. They are in order of cost:

1. Lower `--max-model-len` to the longest context that your users send. The pool stays the same size, and one long request can no longer take all of it.
2. Use an FP8 KV cache. It halves the bytes per token. [The FP8 KV page](#s-fit-more-users-with-an-fp8-kv-cache) shows the cost.
3. Use FP8 weights. They free memory for the cache. [The FP8 weights page](#s-fit-a-bigger-model-with-fp8-weights) shows when this pays.
4. Use a GPU with more memory, or split the model across GPUs. [The parallelism page](#s-choose-tensor-pipeline-or-data-parallelism) covers this.

```

**Questions**

1. Read the error body. Which two numbers does it compare, and which parameter does it name?
2. Where does the server get the second number, and what does it have to do with the KV pool?
3. The ticket asks to turn off the limit. What are the two honest fixes, and who makes each change?
4. A second ticket reports the same status code, but the message names the prompt length. What is different, and what is the fix?

:::answer Show the answer
:::say Short answer
The limit is a budget, not a bug. The client asked for 50,000 output tokens on a server whose longest request is 40,960 tokens, and the server refused before any work. The client fix is a `max_tokens` that the product needs, far below the limit, and a check of the finish reason so that a cut answer is visible to the user. That is what the 64-token check shows: the server reports `length` when it cuts.
:::

**Walkthrough**

1. **Read the body.** The message says that `max_tokens=50000` cannot be greater than `max_model_len=40960`, and the `param` field names `max_tokens`. The server checks the numbers of a request before it schedules anything, so the 400 arrives at once and no token is generated. The client asked for more output than one request may hold.
2. **Read the startup lines.** The server derived a longest request of 40,960 tokens from the model config, and it sized its pool at 84,480 tokens from 9.02 GiB of KV cache memory. The second line says that 2.06 requests at the full length fit at once. The maximum length is a budget for one request, and the pool is the budget for everyone. A request for 50,000 output tokens would exceed the first budget on an empty server.
3. **Read what a cut answer looks like.** In the same check session a request with `max_tokens` of 64 ran, and the server stopped it with the finish reason `length`. That is how a client learns that an answer was cut: the stream ends with `length` instead of `stop`. A huge `max_tokens` is not the way to avoid a cut; the finish reason is the way to see one.
4. **Read the two shapes of the error.** The troubleshooting entry gives both. When the prompt tokens plus `max_tokens` exceed the limit, the message names the model's maximum context length and gives the counts. When `max_tokens` alone is above the limit, the message is the one in this ticket. The fix is the same pair in both cases: a shorter prompt or a smaller `max_tokens` on the client, or a larger maximum length on the server if the pool allows it.
5. **Read the order of server-side choices.** The manual lists four moves when the pool holds too few users, in order of cost, and the first is to lower the maximum length to the longest context that users send. The direction of this ticket is the opposite: raising the limit lets one request take a larger share of the pool. The startup line already said that about two full-length requests fit. A larger limit means fewer users at full length, so it is a measured decision, not a ticket closure.

**Resolution**

The limit is a budget, not a bug. The client asked for 50,000 output tokens on a server whose longest request is 40,960 tokens, and the server refused before any work. The client fix is a `max_tokens` that the product needs, far below the limit, and a check of the finish reason so that a cut answer is visible to the user. That is what the 64-token check shows: the server reports `length` when it cuts.

The server fix exists, and it is conditional. Raise `--max-model-len` only after you measured the longest prompt plus answer that users send, and only if one request at that length still fits the pool next to the other users. On a pool of 84,480 tokens, each step up in the limit lowers the count of full-length requests that fit, from the 2.06 of the startup line. The startup check enforces the same rule from the other side: a server whose one full-length request does not fit refuses to start, as the shared-GPU start in the manual did at 2,928 tokens when only 2,912 fit.

**Wrong turns**

- "Turn off the limit on the server." The maximum length is the KV cache that one request may take, and the pool sizes it. Without it one request can claim most of the pool and starve every other user.
- "Set max_tokens to exactly the limit." Then the prompt plus the answer exceeds the context, and the server returns the other shape of the same 400, the one that names the prompt tokens.
- "Raise the maximum length until the ticket stops." A longer limit means fewer requests fit at once. Measure the longest real request first, and check that it fits the pool.
- "Retry the request." A 400 is a check on the numbers in the request, and the same request gets the same answer.

**Generalize**

A 400 from a model server is usually a budget that the operator set on purpose. Read the two numbers in the message, find which side owns each one, and change the side that is wrong: the client's request, or the server's measured limit. Never remove a limit to close a ticket, and teach clients to read the finish reason instead of asking for an unbounded answer.

:::

## A pool at 5 percent, and the server still died

*Level 1 · incident · about 15 minutes · version: SGLang 0.5.22 with the MLX backend; model: mlx-community/Qwen3-0.6B-4bit; hardware: a laptop with unified memory, shared with the other programs of a desktop session*

A developer advocate prepares a workshop demo on a laptop. The server runs a small quantized model on the MLX backend, started with the model path and nothing about memory. Single requests work, and a few people at once work. To show what the laptop can do, the advocate runs the benchmark client with 32 requests in flight at once.

The whole server dies. The log ends with a Metal error, `Insufficient Memory`, and the process tree is gone. The decode lines right before the crash show 32 running requests, with token usage at 0.05. The advocate concludes that the laptop cannot serve 32 users and plans to show the demo at four.

**Evidence: the pool line of the first start**

```text
title: the pool line of the first start
source: manuals/sglang-101/capture/out/oom-exploratory.log
lines: 3-4
lang: text
note: Read sys_available, kv_budget and pool_size.
---
# run 1 startup
[2026-10-16 13:30:31] Auto-sized attention KV pool: sys_available=27.81 GB, mlx_limit=51.8 GB, mlx_used=0.31 GB, kv_budget=24.25 GB, bytes_per_slot=114688, pool_size=227022

```

**Evidence: the pool lines of the second start, minutes later**

```text
title: the pool lines of the second start, minutes later
source: manuals/sglang-101/capture/out/oom-exploratory.log
lines: 5-10
lang: text
note: Compare sys_available and kv_budget with the first start, and read the resolved fraction.
---
# run 2 startup
'mem_fraction_static': 0.872
[2026-10-16 13:38:58] Auto-sized attention KV pool: sys_available=38.29 GB, mlx_limit=51.8 GB, mlx_used=0.31 GB, kv_budget=33.39 GB, bytes_per_slot=114688, pool_size=312581
[2026-10-16 13:38:58] MLX stub: initialized minimal pools (max_total_num_tokens=312581, max_running_requests=4096, zero GPU KV cache allocation)
[2026-10-16 13:39:00] max_total_num_tokens=312581, chunked_prefill_size=4096, max_prefill_tokens=16384, max_running_requests=4096, context_len=40960, available_gpu_mem=37.92 GB
[2026-10-16 13:39:02] MlxAttentionKVPool: 312582 slots x 28 layers x 8 heads x 128 dim, dtype=mlx.core.bfloat16, ~34188.7 MB

```

**Evidence: the benchmark at a concurrency of 32, and the crash**

```text
title: the benchmark at a concurrency of 32, and the crash
source: manuals/sglang-101/capture/out/oom-exploratory.log
lines: 11-20
lang: text
note: Read token usage in the decode lines before you read the RuntimeError.
---
# run 2, benchmark at --max-concurrency 32
[2026-10-16 13:42:51] Decode batch, #running-req: 32, #token: 16095, token usage: 0.05, cuda graph: False, gen throughput (token/s): 579.49, #queue-req: 0
[2026-10-16 13:42:53] Decode batch, #running-req: 32, #token: 16095, token usage: 0.05, cuda graph: False, gen throughput (token/s): 564.55, #queue-req: 0
[2026-10-16 13:42:55] Prefill batch, #new-seq: 1, #new-token: 511, #cached-token: 0, token usage: 0.00, #running-req: 0, #queue-req: 9, #pending-token: 0, cuda graph: False, input throughput (token/s): 66.85
RuntimeError: [METAL] Command buffer execution failed: Insufficient Memory (00000008:kIOGPUCommandBufferCallbackErrorOutOfMemory).

[2026-10-16 13:42:57] SIGQUIT received. signum=None, frame=None. It usually means one child failed.
[2026-10-16 13:42:57] Sleeping 5 seconds before crash diagnostics to let GPU activity settle.
[2026-10-16 13:43:02] No live scheduler processes found; skipping py-spy and CUDA coredump.
[2026-10-16 13:43:02] kill_process_tree called: parent_pid=81559, include_parent=True, pid=81559

```

**Evidence: why the two starts sized the pool differently**

```text
title: why the two starts sized the pool differently
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 26-26
lang: text
note: One paragraph from the manual.
---
Nothing changed in SGLang between the runs. Other programs on the Mac used less memory at the second start, so `sys_available` grew from 27.81 GB to 38.29 GB. The pool grew with it, from 24.25 GB to 33.39 GB. Both budgets are 87.2 percent of the free memory, because the automatic `mem_fraction_static` resolved to 0.872.

```

**Evidence: how the manual reads the crash**

```text
title: how the manual reads the crash
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 43-43
lang: text
note: Start with token usage.
---
Read `token usage: 0.05` first. Thirty-two requests held 16,095 tokens, which is 5 percent of a 312,581-token pool. The pool reserved 33 GB and used under 2 GB of it. The activations of the next forward pass needed memory outside the pool, and the operating system had none left. One failed command buffer took down the scheduler, and the server killed its whole process tree.

```

**Evidence: the pool line of the kit's server, with an explicit fraction**

```text
title: the pool line of the kit's server, with an explicit fraction
source: manuals/sglang-101/capture/out/server-default.log
lines: 61-61
lang: text
note: Divide kv_budget by sys_available.
---
[2026-10-16 13:58:03] Auto-sized attention KV pool: sys_available=48.49 GB, mlx_limit=51.8 GB, mlx_used=0.31 GB, kv_budget=19.39 GB, bytes_per_slot=114688, pool_size=181574

```

**Evidence: the same benchmark against the kit's server**

```text
title: the same benchmark against the kit's server
source: manuals/sglang-101/capture/out/bench-random-c32.txt
lines: 14-16
lang: text
note: Read the concurrency and the count of successful requests.
---
Max request concurrency:                 32        
Successful requests:                     128       
Benchmark duration (s):                  64.83     

```

**Questions**

1. The pool was almost empty when the server died. Where was the memory, if not in the pool?
2. Two starts of the same command gave two pool sizes. What changed between them?
3. What rule produced the fraction, and what does that rule assume about the machine?
4. Which flag fixes this, what value did the capture kit use, and what did the pool look like after?
5. What proves the fix: a startup line or a benchmark result?

:::answer Show the answer
:::say Short answer
The laptop was never the limit. The automatic fraction took 87 percent of the free memory for a pool that the workload used at 5 percent, and left the activations of the next prefill with nothing. With `--mem-fraction-static 0.4` the pool shrank to 181,574 tokens and the same benchmark completed 128 of 128 requests at a concurrency of 32.
:::

**Walkthrough**

1. **Read the decode lines before the error.** Thirty-two requests held 16,095 tokens, which is 5 percent of a pool of 312,581 tokens. The pool had reserved 33 GB and used under 2 GB of it. The next prefill needed activation memory outside the pool, but the operating system had none left to give. One failed command buffer took down the scheduler, the parent received a SIGQUIT, and it killed the process tree. The server did not run out of KV cache. It ran out of everything else.
2. **Compare the two startup lines.** The first start saw 27.81 GB of available system memory and gave the pool a budget of 24.25 GB, for 227,022 tokens. The second start, minutes later, saw 38.29 GB and gave 33.39 GB, for 312,581 tokens. Nothing changed in SGLang. Other programs on the laptop used less memory at the second start, so the snapshot of free memory was larger and the pool grew with it.
3. **Read the rule.** Both budgets are 87.2 percent of the free memory, because the automatic fraction resolved to 0.872. On this backend the rule takes the smaller of two numbers, a fraction of the Metal working set and a fraction of the system memory available right now, and the second one is the snapshot that moved. The rule assumes that the machine belongs to SGLang for the life of the server. A laptop with a browser and an editor open is not that machine.
4. **Read the fix in the kit's start.** The capture kit passes `--mem-fraction-static 0.4`. Its startup line shows a snapshot of 48.49 GB and a budget of 19.39 GB, which is 0.4 of the snapshot, for a pool of 181,574 tokens. That pool still holds far more than 32 requests of 640 tokens need, so the smaller pool cost nothing in this workload.
5. **Prove it with the same load.** Against the kit's server, the benchmark at a concurrency of 32 finished all 128 requests in 64.83 seconds. The startup line shows the split. The benchmark result shows that the server survived the load that killed it before.

**Resolution**

The laptop was never the limit. The automatic fraction took 87 percent of the free memory for a pool that the workload used at 5 percent, and left the activations of the next prefill with nothing. With `--mem-fraction-static 0.4` the pool shrank to 181,574 tokens and the same benchmark completed 128 of 128 requests at a concurrency of 32.

The demo now starts with the fraction set, and the advocate reads two lines after every change: the `kv_budget` on the pool line and `max_total_num_tokens` on the settings line. On this backend the cache memory metric reads 0.0, because the MLX pool is allocated outside the accounting that the metric reads, so the pool log line is the number to trust.

**Wrong turns**

- "The laptop cannot serve 32 users." The pool held 312,581 tokens and 32 requests used 5 percent of it. The memory ran out outside the pool, where the fraction left too little.
- "Raise the fraction so the pool is bigger." The pool was the cause. It took 87 percent of the free memory and starved the activations. Lower it.
- "Restart the server, the second start had more memory." The snapshot changes with the other programs on the machine, and the next start can find less. Set the fraction so the pool does not depend on the snapshot.
- "Set the fraction to 0.95 to be safe." A fraction of 0.95 leaves 5 percent for activations, and issue #39675 in the manual reports exactly that failure on the first prefill.

**Generalize**

A pool that is almost empty when the process dies tells you the memory went somewhere the pool does not count. On a machine that runs anything else, a fraction computed from a snapshot of free memory is a bet on how the rest of the machine behaves for the life of the server. Set the share yourself, read the two startup lines that show the result, and prove a memory fix with the load that broke it, not with a start that succeeded.

:::

## A published port that answered on one loopback

*Level 1 · incident · about 15 minutes · version: sbx v0.47.0; model: none; shell commands inside the sandbox; hardware: one Mac with the microVM runtime*

A developer serves a static site from inside a sandbox on port 8080 and publishes it to the host with `sbx ports m101-demo --publish 18081:8080`. A browser on the host opens the page. A test harness on the same host reports that it could not connect, and its log shows that it tried `::1`. The developer suspects that the server inside the sandbox listens on one interface only and starts editing its configuration.

You have the publish command and its listing, the same URL fetched on both loopback addresses, the listing in `sbx ls`, a second publish with a protocol named, and the unpublish calls.

**Evidence: a port published without a protocol, and the listing**

```text
title: a port published without a protocol, and the listing
source: manuals/docker-sandboxes-101/capture/out/05-ports.txt
lang: console
note: Read the protocol column.
---
$ sbx ports m101-demo --publish 18081:8080
Published 127.0.0.1:18081 -> 8080/tcp4
[exit 0]

$ sbx ports m101-demo
HOST IP     HOST PORT   SANDBOX PORT   PROTOCOL
127.0.0.1   18081       8080           tcp4
[exit 0]

```

**Evidence: the same URL on the two loopback addresses**

```text
title: the same URL on the two loopback addresses
source: manuals/docker-sandboxes-101/capture/out/05-ports-curl.txt
lang: console
note: Read the status code and the exit code of each request.
---
$ curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18081/README.md
200
[exit 0]

$ curl -sS -o /dev/null -w '%{http_code}\n' 'http://[::1]:18081/README.md'
curl: (7) Failed to connect to ::1 port 18081 after <n> ms: Couldn't connect to server
000
[exit 7]

```

**Evidence: the binding in the PORTS column of sbx ls**

```text
title: the binding in the PORTS column of sbx ls
source: manuals/docker-sandboxes-101/capture/out/05-ports-ls.txt
lang: console
note: The column names the host address and the protocol.
---
$ sbx ls
SANDBOX     AGENT   STATUS    PORTS                        WORKSPACE
m101-demo   shell   running   127.0.0.1:18081->8080/tcp4   $CAPTURE/fixtures/repo
[exit 0]

```

**Evidence: a publish with the protocol named, and the JSON listing**

```text
title: a publish with the protocol named, and the JSON listing
source: manuals/docker-sandboxes-101/capture/out/05-ports-tcp.txt
lang: console
note: Read the host_ip of each record.
---
$ sbx ports m101-demo --publish 8080/tcp
Published 127.0.0.1:<port> -> 8080/tcp
Published [::1]:<port> -> 8080/tcp
[exit 0]

$ sbx ports m101-demo --json
[
  {
    "host_ip": "127.0.0.1",
    "host_port": 18081,
    "sandbox_port": 8080,
    "protocol": "tcp4"
  },
  {
    "host_ip": "127.0.0.1",
    "host_port": "<port>",
    "sandbox_port": 8080,
    "protocol": "tcp"
  },
  {
    "host_ip": "::1",
    "host_port": "<port>",
    "sandbox_port": 8080,
    "protocol": "tcp"
  }
]
[exit 0]

```

**Evidence: two unpublish calls and the empty listing**

```text
title: two unpublish calls and the empty listing
source: manuals/docker-sandboxes-101/capture/out/05-ports-unpublish.txt
lang: console
note: The spec of each unpublish matches the spec that published it.
---
$ sbx ports m101-demo --unpublish 18081:8080
Unpublish requested for port 18081 -> 8080
[exit 0]

$ sbx ports m101-demo --unpublish <port>:8080/tcp
Unpublish requested for port <port> -> 8080/tcp
[exit 0]

$ sbx ports m101-demo --json
[]
[exit 0]

```

**Questions**

1. Which side refused the connection, the server in the sandbox or the host binding? What in the listing says so?
2. What does a publish without a protocol bind, and since which release?
3. How do you publish so that both loopbacks answer?
4. The -p flag on sbx run did not help on a re-attach. Why?
5. How do you remove a binding, and how do you check that it is gone?

:::answer Show the answer
:::say Short answer
The server was fine. The host binding was `tcp4`, so only `127.0.0.1` listened, and the harness's connection to `::1` found no listener. Publishing `8080/tcp` with a fixed host port gives both loopbacks a binding, and the harness connects. The edits inside the sandbox are reverted.
:::

**Walkthrough**

1. **Read the protocol column.** The publish answered `Published 127.0.0.1:18081 -> 8080/tcp4`, and the listing shows one row with the host address `127.0.0.1` and the protocol `tcp4`. The host binding is IPv4 only. The server inside was never asked.
2. **Confirm with the two fetches.** `127.0.0.1:18081` returns 200. `[::1]:18081` fails to connect and curl exits 7. The failing side is the host loopback where nothing listens.
3. **Name the rule.** Without a protocol, publishing uses `tcp4`, so the host side is `127.0.0.1` alone. The manual dates the change to v0.42.0: a published port no longer listens on `::1` unless you name the protocol. The 2025 plugin bound both loopbacks, which conflict C39 records. `sbx ls` shows the same binding in its `PORTS` column.
4. **Publish for both families.** `--publish 8080/tcp` binds `127.0.0.1` and `[::1]` on ephemeral host ports, and `sbx ports --json` lists three records: the first `tcp4` binding and two `tcp` ones, one per address. Name a host port in the spec when the harness needs a fixed one.
5. **Remove what you no longer need.** `--unpublish 18081:8080` and `--unpublish <port>:8080/tcp` each remove their mapping, and the JSON listing ends empty. `-p` on `sbx run` applies at creation only, so later changes go through `sbx ports`.

**Resolution**

The server was fine. The host binding was `tcp4`, so only `127.0.0.1` listened, and the harness's connection to `::1` found no listener. Publishing `8080/tcp` with a fixed host port gives both loopbacks a binding, and the harness connects. The edits inside the sandbox are reverted.

**Wrong turns**

- "Bind the server inside the sandbox to all interfaces." The guest side already answered through the IPv4 mapping. The missing listener was on the host loopback.
- "Pass -p 18081:8080/tcp on the next sbx run." On an existing sandbox the flag is ignored. Use sbx ports.
- "Turn off IPv6 in the test harness." It works, and it hides a binding rule that the next harness will hit again.

**Generalize**

When one client reaches a service and another does not, compare the addresses each one used before you touch the service. A port mapping has its own address family, and a listing that prints it saves an hour of edits in the wrong place.

:::

## A tracker flag that stopped the run at start

*Level 1 · incident · about 15 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

A team has read its first runs from the log with `grep`. For the first long run they want a dashboard, so they add `--use-wandb --wandb-mode offline --wandb-project miles-lab` to the run's extra arguments. The run stops at start with a `TypeError` about `NoneType` and `str`. No step line was written.

One teammate blames the image and wants the tracker removed for good. Another wants to paste the team's API key into the extra arguments to force an online run, because "offline mode is what broke it".

**Evidence: the run with the tracker on and no group name**

```text
title: the run with the tracker on and no group name
source: manuals/miles-101/capture/gpu/out-gb10/tracker-eval-checks.txt
lines: 2-4
lang: text
note: The error type and the two operand types.
---
## wandb without --wandb-group (wandb-tb.log)
            ~~~~~~~~~~~~~~~~~^~~~~
TypeError: unsupported operand type(s) for +: 'NoneType' and 'str'

```

**Evidence: the same run with a group name**

```text
title: the same run with a group name
source: manuals/miles-101/capture/gpu/out-gb10/tracker-eval-checks.txt
lines: 5-7
lang: text
note: The run reached step 0 and step 1, and the tracker wrote offline runs.
---
## wandb with --wandb-group plain (wandb-check.log): step 0: step 1: 
W&B offline mode enabled. Data will be saved locally.
debug-internal.log debug.log latest-run offline-run-20261023_034138-mu59u570 offline-run-20261023_034200-mu59u570 offline-run-20261023_034203-mu59u570 

```

**Evidence: the same run with the other tracker**

```text
title: the same run with the other tracker
source: manuals/miles-101/capture/gpu/out-gb10/tracker-eval-checks.txt
lines: 8-11
lang: text
note: The log line and the two event files.
---
## tensorboard (tb-check.log): step 0: step 1: 
Saving tensorboard log to /root/lab/runs/plain/tb.
events.out.tfevents.1792727435.c56e30506501.2042.0
events.out.tfevents.1792727457.c56e30506501.2515.0

```

**Evidence: the tracker flags the manual uses, and the rule about the group**

```text
title: the tracker flags the manual uses, and the rule about the group
source: manuals/miles-101/sections/5-1-read-the-run.md
lines: 41-44
lang: text
note: The last line names the error you see without the group.
---
-e MILES_EXTRA_ARGS="--use-wandb --wandb-mode offline --wandb-project miles-lab --wandb-group plain --wandb-dir /root/lab/runs/plain/wandb"
'''

Keep `--wandb-group`. Without it, the run stops at start with `TypeError: unsupported operand type(s) for +: 'NoneType' and 'str'`. The log should show `W&B offline mode enabled. Data will be saved locally.`, and an `offline-run-` folder appears under `~/miles-lab/runs/plain/wandb/wandb/`.

```

**Evidence: where the key for an online run goes**

```text
title: where the key for an online run goes
source: manuals/miles-101/sections/5-1-read-the-run.md
lines: 46-46
lang: text
note: The launcher prints the full command in the log, so the key must not be in it.
---
For an online run, leave out `--wandb-mode offline`. Keep the key out of the command line, because commands go to the shell history and the process list. Put `WANDB_API_KEY=<your key>` in a file that only you can read, such as `~/miles-lab/wandb.env` with mode 600, and add `--env-file ~/miles-lab/wandb.env` to the `docker run` line. Do not put the key in `MILES_EXTRA_ARGS`, because the launcher prints the full command in the log.

```

**Evidence: the flags for the other tracker**

```text
title: the flags for the other tracker
source: manuals/miles-101/sections/5-1-read-the-run.md
lines: 51-51
lang: text
note: A folder and one flag.
---
-e TENSORBOARD_DIR=/root/lab/runs/plain/tb -e MILES_EXTRA_ARGS="--use-tensorboard"

```

**Questions**

1. What kind of bug produces this `TypeError`, and what does it tell you about the GPU, the engine and the image?
2. Which flag was missing, and which two log signs show that the tracker then worked?
3. The teammate wants to paste the API key into the run arguments. Name two places where that key would then appear.
4. Which tracker needs no account and no network, and what does it need instead?
5. The team now has a dashboard. What do they keep as well, and why?

:::answer Show the answer
:::say Short answer
The crash came from one missing flag, `--wandb-group`. Add it, keep offline mode until an account and a network are wanted, and check the two signs: the `W&B offline mode enabled` line and the `offline-run-` folder. The run then reaches `step 0` and `step 1` as the check did. For a team with no tracker account, use TensorBoard with a folder and one flag, and open the folder on the host.
:::

**Walkthrough**

1. **Read the error.** `TypeError: unsupported operand type(s) for +: 'NoneType' and 'str'` is Python adding a string to a value that is `None`. A setting that nobody gave is being joined into a name. Nothing in that line concerns the GPU, the engine or the weights. The run never reached its first step, so the tracker setup is the only code that ran.
2. **Read the run that worked.** The same recipe with `--wandb-group plain` logged `step 0` and `step 1`. The log printed `W&B offline mode enabled. Data will be saved locally.`, and the tracker folder holds `offline-run-` folders next to its debug logs. The manual names the rule: keep `--wandb-group`, because without it a run ends at startup with exactly this error.
3. **Read the other tracker.** The same recipe with `-e TENSORBOARD_DIR=/root/lab/runs/plain/tb` and `--use-tensorboard` logged `Saving tensorboard log to /root/lab/runs/plain/tb.` and wrote two event files. This tracker needs a folder and one flag, and neither an account nor a network, and you read it on the host with `tensorboard --logdir`.
4. **Read the key rule.** For an online run, leave out `--wandb-mode offline`. Keep the key out of the command line, because commands go to the shell history and the process list, and the launcher prints the full command in the log. Put `WANDB_API_KEY=<your key>` in a file with mode 600 and pass it with `--env-file`. The extra arguments are the one place the key must never go.

**Resolution**

The crash came from one missing flag, `--wandb-group`. Add it, keep offline mode until an account and a network are wanted, and check the two signs: the `W&B offline mode enabled` line and the `offline-run-` folder. The run then reaches `step 0` and `step 1` as the check did. For a team with no tracker account, use TensorBoard with a folder and one flag, and open the folder on the host.

Keep the log in any case. The manual read every number in it from the log, and the log is where the first exception of a broken run sits.

**Wrong turns**

- "The image is broken, drop the tracker." The same image ran the same recipe to `step 1` with one more flag. The error names a missing value, not a missing library.
- "Paste the API key into the extra arguments to force online mode." Offline mode was not the cause, and the launcher prints the full command into the log, so the key would sit in the log, the shell history and the process list.
- "A dashboard replaces the log." The dashboard shows the metrics. The log holds the startup lines, the engine lines and the first exception when a run breaks.

**Generalize**

A type error on a `None` at startup is a missing setting, and the fastest check is the documented command next to yours. Secrets go in a file that only you can read and reach the process through the environment, never through arguments that a launcher echoes. A dashboard adds a view, and the log stays the record.

:::

## The sandbox stopped itself

*Level 1 · incident · about 15 minutes · version: sbx v0.47.0; model: none; shell commands inside the sandbox; hardware: one Mac with the microVM runtime*

A developer opens a shell sandbox on a repository, starts a long dependency install, and closes the terminal to go to a meeting. An hour later `sbx ls` shows the sandbox with the status `stopped`. The install did not finish, and no error was printed anywhere the developer looked. They conclude that the daemon crashed or that someone removed the sandbox, and they want to recreate it from scratch.

You have the two listings, the daemon log lines for that sandbox, and the output of an explicit stop and a prune from another day.

**Evidence: sbx ls before and after the last session closed**

```text
title: sbx ls before and after the last session closed
source: manuals/docker-sandboxes-101/capture/out/04-auto-stop.txt
lines: 1-9
lang: console
note: The sandbox is still listed, with a new status.
---
$ sbx ls
SANDBOX     AGENT   STATUS    PORTS   WORKSPACE
m101-demo   shell   running           $CAPTURE/fixtures/repo
[exit 0]

$ sbx ls
SANDBOX     AGENT   STATUS    PORTS   WORKSPACE
m101-demo   shell   stopped           $CAPTURE/fixtures/repo
[exit 0]

```

**Evidence: the two auto-stop lines of the daemon log for m101-demo**

```text
title: the two auto-stop lines of the daemon log for m101-demo
source: manuals/docker-sandboxes-101/capture/out/04-auto-stop.txt
lines: 11-13
lang: console
note: Read the level and the msg field of each line.
---
$ grep auto-stop daemon.log | grep m101-demo | tail -2
{"time":"<ts>","level":"INFO","msg":"auto-stop grace period expired, stopping runtime","version":"v0.47.0 0411f50ee4700fe7bd37e6e7e3aced563e850ca9","runtime":"m101-demo"}
{"time":"<ts>","level":"INFO","msg":"auto-stopped runtime after last session disconnected","version":"v0.47.0 0411f50ee4700fe7bd37e6e7e3aced563e850ca9","runtime":"m101-demo"}

```

**Evidence: an explicit stop, a prune, and the list after it**

```text
title: an explicit stop, a prune, and the list after it
source: manuals/docker-sandboxes-101/capture/out/04-prune.txt
lang: console
note: The stop message says what is kept and how to come back; the prune removes both stopped sandboxes.
---
$ sbx stop m101-demo
Sandbox 'm101-demo' stopped; state preserved. Restart with: sbx run --name m101-demo
[exit 0]

$ sbx prune --force
Deleting sandbox m101-demo...
Sandbox 'm101-demo' removed
Deleting sandbox m101-demo-2...
Sandbox 'm101-demo-2' removed
[exit 0]

$ sbx ls --json
{
  "sandboxes": []
}
[exit 0]

```

**Questions**

1. Did the sandbox crash, get removed, or stop? Which listing settles it?
2. What do the two daemon log lines say happened, and at what level?
3. What survives a stop, and what does not?
4. How do you get back into this sandbox, and what would prune have done?
5. How do you keep a job running after you disconnect?

:::answer Show the answer
:::say Short answer
The daemon stopped the sandbox on purpose after the last session closed and a grace period passed, and its log says so at the INFO level. Nothing crashed and nothing was removed. The developer reattaches with `sbx run --name`, finds the packages that had finished installing still there, and starts the install again. For the next long job they start the sandbox detached, so no session is the last one. Prune stays out of the runbook until a sandbox is wanted gone.
:::

**Walkthrough**

1. **Read the status.** The first listing shows `running` and the second `stopped`. A removed sandbox is not listed. A crashed daemon could not answer `sbx ls`. The sandbox stopped.
2. **Read the daemon log.** Both lines are `INFO`, not errors. The first says that the auto-stop grace period expired and the runtime is stopping. The second says that the runtime was auto-stopped after the last session disconnected. The trigger was the closed terminal: it was the last session. Each line carries the daemon version, so you know which release did it.
3. **Know what a stop keeps.** The explicit stop prints `state preserved` and the restart command. The manual lists what persists across a stop and a restart: installed packages, Docker images, configuration changes, command history, and workspace files not on a mount. A running process is not on that list, so the install died with the microVM.
4. **Come back the right way.** `sbx run --name m101-demo` reattaches and starts the stopped sandbox. `sbx prune` would have deleted it: in the capture it removed both stopped sandboxes and left an empty list, and `rm` and `prune` also delete the secrets scoped to the sandbox.
5. **Keep it running on purpose.** `sbx run -d` against an existing sandbox keeps it running after the sessions disconnect, until you stop or remove it. A kit can declare the `long-running@1` capability for the same effect. The manual's ledger marks the auto-stop as observed and not documented, so expect no page to warn you.

**Resolution**

The daemon stopped the sandbox on purpose after the last session closed and a grace period passed, and its log says so at the INFO level. Nothing crashed and nothing was removed. The developer reattaches with `sbx run --name`, finds the packages that had finished installing still there, and starts the install again. For the next long job they start the sandbox detached, so no session is the last one. Prune stays out of the runbook until a sandbox is wanted gone.

**Wrong turns**

- "Run sbx prune to clean up, then create the sandbox again." Prune removes every stopped sandbox, with its state and its secrets. The sandbox you want back is exactly a stopped one.
- "The daemon crashed." It wrote two INFO lines and answered the listing. A crash would have left no second listing.
- "Create a new sandbox with the same name." The name belongs to the stopped one, and a new sandbox would lose the installed state. Reattach instead.

**Generalize**

When a thing you started is gone, ask whether it stopped, failed, or was deleted, and read the log of the component that owns its lifecycle before you rebuild anything. A platform that stops idle work on its own will do so again. Find the flag or the capability that marks work as long-running and use it on purpose.

:::

## The trainer rejects the attention name

*Level 1 · incident · about 15 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

An engineer wants to shrink the log probability gap between the rollout engine and the trainer. The engine runs its Triton attention backend, so she sets the trainer's attention implementation to `triton` as well, with a name she copied from an example. The idea is that two sides with one kernel name agree on more numbers.

The run ends about a minute after the launcher's first line. The trainer prints a `ValueError`, and a line from the fault-tolerance layer says that the trainer's init failed. She asks whether the image is broken and whether to pull another tag.

**Evidence: the launcher line, the trainer error and the failed init**

```text
title: the launcher line, the trainer error and the failed init
source: manuals/sglang-101/capture/gpu/out-miles/true-on-policy-error.log
lines: 1-3
lang: text
note: Read the list of accepted names in the error, then the time between the first and the last line.
---
[2026-10-17 16:28:41.340 launcher] common.py:290 - EXEC: mkdir -p /root/lab/mode
ValueError: Specified `attn_implementation="triton"` is not supported. The only possible arguments are `attn_implementation="eager"`, `"paged|eager"`, `"attn_implementation=flash_attention_2"`, `"attn_implementation=paged|flash_attention_2"`, `"attn_implementation=flash_attention_3"`, `"attn_implementation=paged|flash_attention_3"`, `"attn_implementation=flash_attention_4"`, `"attn_implementation=paged|flash_attention_4"`, `"attn_implementation=sdpa"`, `"attn_implementation=paged|sdpa"`, `"attn_implementation=flex_attention"`.
[2026-10-17 16:29:42.606 trainer_controller_actor] cell.py:251 - ft op=execute phase=fail cell=trainer-engine-actor-00000 fn=init elapsed_s=0.7

```

**Evidence: the troubleshooting entry for this error**

```text
title: the troubleshooting entry for this error
source: manuals/miles-101/sections/7-1-troubleshoot-by-symptom.md
lines: 41-45
lang: text
note: Cause, check and fix in three lines.
---
## The trainer rejects the attention implementation

- **Cause:** a trainer attention name that the installed transformers library does not accept, such as `triton`.
- **Check:** a `ValueError` that lists the attention implementations transformers accepts.
- **Fix:** pick one from that list. On our GB10 we left the trainer setting at its default.

```

**Evidence: where the flag value came from, and the one pair that both sides accept**

```text
title: where the flag value came from, and the one pair that both sides accept
source: manuals/sglang-101/sections/7-2-sglang-as-an-rl-rollout-engine.md
lines: 211-213
lang: text
note: The first paragraph explains why the name reached the trainer unchanged.
---
The flag value came from the wrong example. In the FSDP actor, the SGLang Triton attention bridge turns on only when `torch.version.hip` is set, which means AMD GPUs {{code}}. On an NVIDIA GPU the value goes straight to transformers, which has no attention named `triton`.

The only true on-policy contract in Miles pairs the SGLang `fa3` backend with `flash_attention_3` in FSDP {{code}}. We ran the job again with the contract flags to see where it stops.

```

**Evidence: the true on-policy contract: the models, the kernel and the two checks**

```text
title: the true on-policy contract: the models, the kernel and the two checks
source: manuals/miles-101/sections/4-6-know-the-true-on-policy-limits.md
lines: 11-16
lang: text
note: Both sides must run the same attention kernel, and that kernel has a GPU range.
---
The Miles versions we checked have one true on-policy contract. It covers dense Qwen3 models: Qwen3-0.6B and three Qwen3-4B variants. Both sides must run FlashAttention 3: the engine as its attention backend, and the trainer as its attention implementation.

FlashAttention 3 is built for Hopper GPUs. The engine check accepts compute capability 8.0 to 9.0 and refuses newer GPUs. So check two things before you plan the run:

1. Your GPU is a Hopper GPU, such as an H100 or an H200.
2. Your model is in the contract.

```

**Questions**

1. Which process raised the error, and which list does the error print?
2. How does this failure differ from a rollout engine that dies at start?
3. Why does a name that the engine accepts not reach the trainer as a valid name?
4. Is there a pair of settings that gives both sides one kernel on this machine?
5. What do you change, and which line in the next log shows that the run is healthy?

:::answer Show the answer
:::say Short answer
Remove the attention flag on the trainer side, or set it to a name from the error's own list. Leave the engine on its backend. The two lists are different, and the only pairing that makes both sides bit-exact needs a Hopper GPU, which this machine is not. The healthy run then shows a `rollout 0` line within minutes, and a step-0 gap inside the range of the healthy runs on this machine, 0.0136 to 0.0164 for this model without top-p or top-k.
:::

**Walkthrough**

1. **Read the error.** The trainer raised `ValueError: Specified attn_implementation="triton" is not supported`, and it printed the names it accepts: `eager`, `flash_attention_2`, `flash_attention_3`, `flash_attention_4`, `sdpa`, `flex_attention`, and their paged forms. The next line, from the trainer controller, reads `phase=fail` for `fn=init` after 0.7 s. The trainer never came up, and the job said so and stopped. The launcher line and the fail line are one minute apart. A dead rollout engine, by contrast, leaves the job running for an hour with HTTP 503 errors.
2. **Match the manual entry.** The troubleshooting page has this symptom: a trainer attention name that the installed transformers library does not accept, such as `triton`. The check is a `ValueError` that lists the accepted implementations, and the fix is to pick one from that list. The manual's runs left the trainer setting at its default.
3. **See where the name came from.** The engine and the trainer keep two different lists. In the FSDP actor, a bridge to the engine's Triton attention turns on only when the build reports an AMD GPU. On an NVIDIA GPU the value goes straight to the transformers library, which has no attention named `triton`. The example that the engineer copied was for the other kind of GPU.
4. **Read the contract.** Miles has one pairing where both sides run one kernel: the engine on its `fa3` backend and the trainer on `flash_attention_3`, for the dense Qwen3 models in the contract, and that kernel accepts GPUs with compute capability 8.0 to 9.0. The GB10 is outside that range, so on this machine no setting puts one kernel on the two sides. The manual's advice outside the contract is to watch the gap and lower its sampler part.

**Resolution**

Remove the attention flag on the trainer side, or set it to a name from the error's own list. Leave the engine on its backend. The two lists are different, and the only pairing that makes both sides bit-exact needs a Hopper GPU, which this machine is not. The healthy run then shows a `rollout 0` line within minutes, and a step-0 gap inside the range of the healthy runs on this machine, 0.0136 to 0.0164 for this model without top-p or top-k.

**Wrong turns**

- "The image is broken, pull another tag." The error is a value check in the trainer library against its own list of names. The manual's runs used this image with the default name and completed.
- "Give the engine the same name as the trainer, so the names match." The engine accepts `triton` and the trainer does not. Matching names does not give matching kernels, and the trainer still refuses to start.
- "Use the contract pair, FlashAttention 3 on both sides." The engine's FA3 backend refuses the GB10 at start, because of its compute capability range, and the job then runs for an hour against a dead engine.

**Generalize**

Two components that read the same word do not read the same thing. Each one checks a setting against its own list, and an error that prints the list is the fastest fix you will get. Read the list, pick from it, and do not expect a shared name to buy shared numerics. Bit-exact agreement between a server and a trainer is a contract with a model list and a hardware range, not a flag.

:::
