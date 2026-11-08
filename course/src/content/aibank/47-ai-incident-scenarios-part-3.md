---
track: aibank
title: "AI incident scenarios, read the evidence (part 3 of 10)"
short: Incidents 3
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## A rolling update that dropped every running answer

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22 on its MLX path; model: mlx-community/Qwen3-0.6B-4bit; hardware: one laptop with unified memory, which captures no CUDA graphs*

A platform team deploys SGLang pods with a rolling update. The container starts the server through a small wrapper script. When the orchestrator asks the pod to stop, the wrapper forwards the signal it receives to its whole process group. Every deploy produces a burst of failed requests. The users who were in the middle of an answer get a broken stream, and the pod log of each stopped server reports a crash, although nothing was wrong with the model.

The on-call engineer reads the end of one log and finds the crash in it. The team has two proposals: raise the grace period for termination from 30 s to five minutes, and add a retry in the gateway for the broken streams. You review the evidence before either change ships.

**Evidence: the end of a stopped server's log, as the team read it**

```text
title: the end of the default run, after a SIGTERM to the whole process group
source: manuals/sglang-101/capture/out/server-default.log
lines: 565-570
lang: text
note: The scheduler child died with exit code -15 before the parent could drain, so the parent took the crash path and killed the tree.
---
[2026-10-16 14:01:45] SIGTERM received. signum=None frame=None. Draining requests and shutting down...
[2026-10-16 14:01:45] Subprocess scheduler_0 (pid=5909) crashed with exit code -15. Triggering SIGQUIT for cleanup...
[2026-10-16 14:01:45] SIGQUIT received. signum=None, frame=None. It usually means one child failed.
[2026-10-16 14:01:46] Sleeping 5 seconds before crash diagnostics to let GPU activity settle.
[2026-10-16 14:01:51] No live scheduler processes found; skipping py-spy and CUDA coredump.
[2026-10-16 14:01:51] kill_process_tree called: parent_pid=5782, include_parent=True, pid=5782

```

**Evidence: what the server does on a SIGTERM to its main process**

```text
title: what the server does on a SIGTERM to its main process
source: manuals/sglang-101/sections/7-1-operating-sglang.md
lines: 98-98
lang: text
note: Read the flag, the two timers and the order of the steps.
---
On SIGTERM, the HTTP server sets `gracefully_exit`, and `/health` starts to return 503. A watchdog in the tokenizer manager checks the flag every 5 s {{code}}. It then logs the remaining requests every 5 s until none remain. Then it sends `ShutdownReq` to the schedulers and gives them 15 s to exit before it kills them. [Figure 7.1](#fig-7-1) shows this path and the two paths that skip the drain.

```

**Evidence: a SIGTERM to the main process only, with one request running**

```text
title: SIGTERM to the main process only, with one request running
source: manuals/sglang-101/capture/out/shutdown-exploratory.log
lines: 120-127
lang: text
note: The decode batches continue after the signal, and the health check returns 503 during the drain.
---
[2026-10-16 14:13:54] SIGTERM received. signum=None frame=None. Draining requests and shutting down...
[2026-10-16 14:13:54] Decode batch, #running-req: 1, #token: 8, token usage: 0.00, cuda graph: False, gen throughput (token/s): 155.12, #queue-req: 0
[2026-10-16 14:13:54] Decode batch, #running-req: 1, #token: 8, token usage: 0.00, cuda graph: False, gen throughput (token/s): 161.61, #queue-req: 0
[2026-10-16 14:13:54] Decode batch, #running-req: 1, #token: 8, token usage: 0.00, cuda graph: False, gen throughput (token/s): 182.29, #queue-req: 0
[2026-10-16 14:13:54] Decode batch, #running-req: 1, #token: 8, token usage: 0.00, cuda graph: False, gen throughput (token/s): 204.07, #queue-req: 0
[2026-10-16 14:13:55] Decode batch, #running-req: 1, #token: 8, token usage: 0.00, cuda graph: False, gen throughput (token/s): 214.83, #queue-req: 0
[2026-10-16 14:13:55] Health check request received during shutdown. Returning 503.
[2026-10-16 14:13:55] INFO:     127.0.0.1:53237 - "GET /health HTTP/1.1" 503 Service Unavailable

```

**Evidence: the request completes and the server exits**

```text
title: the request completes and the server exits
source: manuals/sglang-101/capture/out/shutdown-exploratory.log
lines: 176-182
lang: text
note: The in-flight request returns 200, the remaining count reaches 0, and the server process finishes.
---
[2026-10-16 14:14:04] INFO:     127.0.0.1:53209 - "POST /generate HTTP/1.1" 200 OK
[2026-10-16 14:14:07] Gracefully exiting... Remaining number of requests 0. Remaining requests remaining_rids=[].
[2026-10-16 14:14:07] kill_process_tree called: parent_pid=53853, include_parent=False, pid=53853
[2026-10-16 14:14:07] INFO:     Shutting down
[2026-10-16 14:14:07] INFO:     Waiting for application shutdown.
[2026-10-16 14:14:07] INFO:     Application shutdown complete.
[2026-10-16 14:14:07] INFO:     Finished server process [53853]

```

**Evidence: what the client saw across the drain**

```text
title: what the client saw across the drain
source: manuals/sglang-101/capture/out/shutdown-exploratory.txt
lang: text
note: The request for 3000 tokens finished, and the exit code was 0.
---
health before SIGTERM: 200
sent SIGTERM to the server process only
health during drain: 503
in-flight request: {"status": 200, "completion_tokens": 3000, "finish_reason": {"type": "length", "length": 3000}, "seconds": 14.2}
server exit code: 0

```

**Evidence: the two exits that skip the drain, and the grace period rule**

```text
title: the forced exit, the variable name trap and the grace period rule
source: manuals/sglang-101/sections/7-1-operating-sglang.md
lines: 157-161
lang: text
note: Read which variable name the watchdog reads at 0.5.22, then the rule for the grace period.
---
The code has two exits that skip the drain. If the server is already `UnHealthy`, the watchdog exits at once. It also exits at once if the environment variable `SGL_FORCE_SHUTDOWN` is true. At v0.5.22 the watchdog reads that old name directly {{code}}.

The environment module declares the new name `SGLANG_FORCE_SHUTDOWN`. Its compatibility code copies `SGL_` variables to `SGLANG_` names, never the other way. **The code shows** that setting only `SGLANG_FORCE_SHUTDOWN` does not reach the watchdog. We read this in the code and did not run it, so we call it a likely bug. If you need a forced stop, set `SGL_FORCE_SHUTDOWN=1`.

**Our position:** set the termination grace period longer than your longest request at your output cap. A 32K-token answer at 30 tokens per second needs more than 18 minutes. Cap `max_tokens` before you set the grace period, or a drain can never finish in time.

```

**Questions**

1. The log says that a subprocess crashed with exit code -15. What is that exit code, and who sent it?
2. Read the drain description. Which process must receive the signal, and what happens to the health endpoint while the drain runs?
3. The second capture sends the signal to one process while a request runs. Trace the request from the signal to the exit code.
4. A longer grace period was proposed. What decides the right value, and why does the output cap come first?
5. Name the two ways a server skips the drain, and the environment variable trap at this version.

:::answer Show the answer
:::say Short answer
The wrapper was the incident. It turned one SIGTERM into a signal for every process, the scheduler died before the parent could drain, and the parent reported a crash it did not cause. The fix is to make `sglang serve` the main process of the container, with `exec` in the script or as the entrypoint, so that the orchestrator's signal reaches the server alone. The capture is the proof: with the signal sent to one process, the request for 3000 tokens finished, `/health` returned 503 during the drain, and the exit code was 0.
:::

**Walkthrough**

1. **Read the exit code.** A negative exit code is a signal number, and 15 is SIGTERM. In the first listing the parent logs that it received SIGTERM and starts to drain, and in the same second its scheduler child dies of the same signal. Two processes do not receive one signal at the same instant unless the sender addressed the group. The wrapper did that. The scheduler died first, the parent found a dead child, took the crash path, slept 5 seconds for diagnostics and killed the tree. Every running request died with the scheduler. The crash in the log is the symptom of the wrapper, not a fault in the server.
2. **Read who owns the drain.** The manual describes the path. On SIGTERM the HTTP server sets `gracefully_exit`, and `/health` begins to answer 503. A watchdog in the tokenizer manager checks the flag every 5 s and logs the remaining requests every 5 s until none remain. Then it sends `ShutdownReq` to the schedulers and gives them 15 s to exit before it kills them. The drain lives in the main process. A scheduler that gets the signal itself never gets the shutdown request, so the drain cannot begin.
3. **Read the clean stop.** In the second capture, the probe sent SIGTERM to the server process alone while one request for 3000 tokens ran. The decode batches continue after the signal line, and one second later the log says that a health check arrived during shutdown and returned 503. That 503 is what the orchestrator needs: stop sending traffic here, the pod is on its way out. Ten seconds later the request returns 200, the watchdog logs zero remaining requests, and the server process finishes.
4. **Read what the client saw.** Health 200 before the signal, 503 during the drain, the request complete with all 3000 tokens and the finish reason `length` after 14.2 s, and an exit code of 0. Nothing was lost, and the server was gone about thirteen seconds after the signal.
5. **Read the two exits that skip the drain.** A server that is already `UnHealthy` exits at once, and so does a server with `SGL_FORCE_SHUTDOWN` set. The environment module declares the new name `SGLANG_FORCE_SHUTDOWN`, and its compatibility code copies old names to new names only, so the watchdog at this version still reads the old name. Setting only the new name does nothing. The manual read this in the code, did not run it, and calls it a likely bug. The same listing gives the rule for the grace period: longer than one request at the output cap, and a 32K-token answer at 30 tokens per second needs more than 18 minutes.

**Resolution**

The wrapper was the incident. It turned one SIGTERM into a signal for every process, the scheduler died before the parent could drain, and the parent reported a crash it did not cause. The fix is to make `sglang serve` the main process of the container, with `exec` in the script or as the entrypoint, so that the orchestrator's signal reaches the server alone. The capture is the proof: with the signal sent to one process, the request for 3000 tokens finished, `/health` returned 503 during the drain, and the exit code was 0.

Then size the stop. Cap `max_tokens` first, and set the grace period longer than one request at that cap. A five-minute grace period with no output cap still cuts every answer that runs longer than five minutes. For a forced stop in a test environment, set `SGL_FORCE_SHUTDOWN=1`, never only the new name. The gateway retry stays out: a drain finishes the answer on the pod that holds its cache, and a retry starts the answer again from its first token on another pod.

**Wrong turns**

- "Raise the grace period to five minutes." The signal reached the scheduler child directly, so the drain never began. No grace period helps a drain that does not start, and a grace period shorter than one answer at the output cap still cuts answers.
- "Retry the broken streams at the gateway." A retry pays for the prompt and the generated tokens a second time on another pod. The drain finishes the answer where it runs.
- "Set SGLANG_FORCE_SHUTDOWN=1 for a fast stop in staging." At this version the watchdog reads SGL_FORCE_SHUTDOWN, so the new name does nothing, and a forced stop skips the drain, which is the incident.
- "The scheduler crashed, so file a bug against the engine." Exit code -15 is a signal, not a fault. The log says who died first and who sent the signal.

**Generalize**

A graceful stop is a protocol between one sender and one receiver. Know which process holds the drain, make sure only that process gets the signal, and size the time you give it from the longest work you allow. Then test the stop with a request in flight and read the exit code, because a stop that works on an idle server proves nothing.

:::

## A shutdown that retried a cancel forever

*Level 2 · incident · about 20 minutes · version: A2A 1.0.1 with the manual's capture kit (the test-runner, code-reviewer and deployer agents); model: no model; the agents are deterministic fixtures; hardware: one machine, localhost, no network*

A supervisor service drives a fleet of remote agents. At the end of a run it lists every task it started and sends `CancelTask` to each one. Its rule for every call is simple: an error means "not yet", so the call goes out again until it returns a task. Last night the shutdown never finished. Two tasks on the `test-runner` agent answered an error on every attempt, for the whole night.

The on-call engineer reads the supervisor log. One of the two tasks had been stopped by an operator earlier in the run, by hand, through the same agent. After the shutdown routine failed to cancel it, the engineer sent it the message "Try again" to wake it up, and got a second kind of error. The ticket says that the agent is stuck and asks for a restart of the agent. You have the four exchanges that the capture kit recorded for the same sequence of calls.

**Evidence: the send that started the suite, and the state it came back in**

```text
title: the send that started the suite, and the state it came back in
source: manuals/a2a-101/capture/out/10-cancel.http
lines: 21-40
lang: text
note: The configuration asks the server to return at once. Read the state and the timestamp of the task that came back.
---
    "configuration": {
      "returnImmediately": true
    }
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "task": {
      "id": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
      "contextId": "9b584e1f-b948-453f-9250-18314071afc7",
      "status": {
        "state": "TASK_STATE_SUBMITTED",
        "timestamp": "2026-10-06T09:00:03.250Z"
      },

```

**Evidence: the reply to the first CancelTask**

```text
title: the reply to the first CancelTask
source: manuals/a2a-101/capture/out/10-cancel.http
lines: 73-136
lang: text
note: Read the state, the status message, and what the task still carries in history and artifacts.
---
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "id": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
    "contextId": "9b584e1f-b948-453f-9250-18314071afc7",
    "status": {
      "state": "TASK_STATE_CANCELED",
      "message": {
        "messageId": "9f730657-74a7-43df-b405-5a8270fe73a9",
        "contextId": "9b584e1f-b948-453f-9250-18314071afc7",
        "taskId": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
        "role": "ROLE_AGENT",
        "parts": [
          {
            "text": "Canceled at the client's request."
          }
        ]
      },
      "timestamp": "2026-10-06T09:00:03.750Z"
    },
    "history": [
      {
        "messageId": "7b89296c-6dcb-4c50-8857-7eb1924770d3",
        "contextId": "9b584e1f-b948-453f-9250-18314071afc7",
        "taskId": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
        "role": "ROLE_USER",
        "parts": [
          {
            "text": "Run the full suite for payments-api at commit 9f3c2e1"
          }
(excerpt: the first 40 of 70 lines)
```

**Evidence: the second CancelTask on the same id, status and code**

```text
title: the second CancelTask on the same id, status and code
source: manuals/a2a-101/capture/out/10-cancel.http
lines: 138-163
lang: text
note: The HTTP status and the code that replaced result.
---
### 3 · CancelTask: again
POST /a2a/jsonrpc HTTP/1.1
Host: localhost:41241
Content-Type: application/json
A2A-Version: 1.0

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "CancelTask",
  "params": {
    "id": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf"
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32002,
    "message": "Task cannot be canceled",
    "data": [
      {

```

**Evidence: the detail inside the second cancel error**

```text
title: the detail inside the second cancel error
source: manuals/a2a-101/capture/out/10-cancel.http
lines: 165-174
lang: text
note: The reason names the error, and the metadata names the state the task is in.
---
        "reason": "TASK_NOT_CANCELABLE",
        "domain": "a2a-protocol.org",
        "metadata": {
          "taskId": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
          "state": "TASK_STATE_CANCELED"
        }
      }
    ]
  }
}

```

**Evidence: a message sent to the canceled task, and the code it got**

```text
title: a message sent to the canceled task, and the code it got
source: manuals/a2a-101/capture/out/10-cancel.http
lines: 176-211
lang: text
note: The message carries the task id and the context id of the canceled task.
---
### 4 · SendMessage: to the canceled task
POST /a2a/jsonrpc HTTP/1.1
Host: localhost:41241
Content-Type: application/json
A2A-Version: 1.0

{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "766bad07-34c2-4a80-83cc-0f2793fdcab8",
      "contextId": "9b584e1f-b948-453f-9250-18314071afc7",
      "taskId": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
      "role": "ROLE_USER",
      "parts": [
        {
          "text": "Try again"
        }
      ]
    }
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 4,
  "error": {
    "code": -32004,
    "message": "This operation is not supported",
(excerpt: the first 40 of 42 lines)
```

**Evidence: the detail inside the error for the message**

```text
title: the detail inside the error for the message
source: manuals/a2a-101/capture/out/10-cancel.http
lines: 213-222
lang: text
note: Compare the reason and the state with the ones in the cancel error.
---
        "reason": "UNSUPPORTED_OPERATION",
        "domain": "a2a-protocol.org",
        "metadata": {
          "taskId": "f22ed7af-848d-4f4d-8cd1-3204d1e1bbaf",
          "state": "TASK_STATE_CANCELED"
        }
      }
    ]
  }
}

```

**Evidence: what the specification and the implementations say about a repeated cancel**

```text
title: what the specification and the implementations say about a repeated cancel
source: manuals/a2a-101/sections/4-4-cancel-task-and-terminal-states.md
lines: 61-63
lang: text
note: Two sections of the specification disagree, and the last line gives the call that settles it.
---
A second `CancelTask` gets `TaskNotCancelableError`, `-32002`, from the kit and the reference SDK {{sdk src/a2a/server/request_handlers/default_request_handler_v2.py}}, as §3.1.5 lists for a finished task {{spec §3.1.5}}. Section 3.3.1 disagrees: it calls Cancel Task idempotent, so several cancel requests have the same effect {{spec §3.3.1}}. A repeat on a deleted task is allowed to return `TaskNotFoundError` {{spec §3.3.1}}.

So after a cancel that errors, call `GetTask`. Canceled means an earlier cancel worked, another terminal state means the task ended first, and running means the server cannot stop it {{spec §3.1.5}}.

```

**Questions**

1. What did the first cancel return, and what did the task still carry?
2. The second cancel and the later message got two different codes. What do their details have in common?
3. Is a repeated cancel an error or a no-op? What does the specification say, and what do the kit and the reference implementation do?
4. Which call tells the supervisor whether to keep going, and what are its three possible outcomes?
5. How does the supervisor continue the work that the canceled task was doing?

:::answer Show the answer
:::say Short answer
Nothing was stuck. The supervisor's retry rule treated a permanent state as a transient error, and the engineer's "Try again" repeated the same mistake with a message. The fix is in the client. When `CancelTask` returns an error, the supervisor calls `GetTask` once and reads the state. A terminal state closes the entry. The code -32004 is read with its metadata, because the same code also covers a card without streaming and a card without an extended card. To continue the work, the supervisor starts a new task in the same context and names the finished task in `referenceTaskIds`. It never sends a message to a terminal task. In the capture, every call after the cancel is one request and one definitive answer, which is what the shutdown now takes: one pass over the list.
:::

**Walkthrough**

1. **Read the send.** The planner asked for the full suite with `returnImmediately` set, and the task came back in `TASK_STATE_SUBMITTED`. The task exists and runs while the client is away.
2. **Read the first cancel.** The reply is the task itself, now in `TASK_STATE_CANCELED`, with the status message "Canceled at the client's request." The history holds the request and the agent's progress message, and the artifacts hold the two log chunks the suite had written. A cancel is a request that the server may refuse, and this one succeeded.
3. **Read the second cancel.** The HTTP status is 200, because JSON-RPC errors travel in a 200. The body has an `error` with code -32002 and the message "Task cannot be canceled". The detail gives the reason `TASK_NOT_CANCELABLE` and, in `metadata`, the state `TASK_STATE_CANCELED`. The error does not say "try later". It says that the task already ended, and how.
4. **Read the message.** The "Try again" message carries the task id and the context id of the canceled task. The code is -32004 and the reason is `UNSUPPORTED_OPERATION`. The metadata names the same state. A terminal task refuses a message, a cancel and a subscription. Only `GetTask` still answers.
5. **Read the rule.** One section of the specification lists `TaskNotCancelableError` for a finished task, and another calls cancel idempotent. Both this server and the reference SDK return -32002, and a cancel on a deleted task may return not found. A client cannot know which server it meets, so after a cancel that errors it calls `GetTask`. Canceled means an earlier cancel worked. Another terminal state means the task ended first. Running means the server could not stop it.
6. **Check the stop set.** Four states are terminal: completed, failed, canceled and rejected. A loop that waits for "a task" as its success condition never ends on a task that is already in one of them.

**Resolution**

Nothing was stuck. The supervisor's retry rule treated a permanent state as a transient error, and the engineer's "Try again" repeated the same mistake with a message. The fix is in the client. When `CancelTask` returns an error, the supervisor calls `GetTask` once and reads the state. A terminal state closes the entry. The code -32004 is read with its metadata, because the same code also covers a card without streaming and a card without an extended card. To continue the work, the supervisor starts a new task in the same context and names the finished task in `referenceTaskIds`. It never sends a message to a terminal task. In the capture, every call after the cancel is one request and one definitive answer, which is what the shutdown now takes: one pass over the list.

**Wrong turns**

- "Retry the cancel until it returns the task." The second cancel answers -32002 every time, and its metadata already names the final state. The retry can only stop when the client stops it.
- "Message the task to restart it." A terminal task never changes again. The message gets -32004. New work is a new task, with the old id in `referenceTaskIds`.
- "Read -32004 as 'this server does not support cancel'." The code covers three cases: no streaming, no extended card, and a terminal task. The message and the metadata, or a `GetTask`, tell them apart.
- "Stop the loop on completed, failed and canceled." Rejected is terminal too. A loop that forgets it polls a refused task forever.
- "Restart the agent." The agent answered every call at once with a correct error. A restart would throw away the task store and turn the next lookup into a not found.

**Generalize**

An error from a mutation is not a reason to repeat the mutation. Read the state that the error names, or fetch it, and decide from the state. Separate the errors that time will change from the ones that no later call can change, and let the terminal set of your state machine end every loop, including the states you did not expect.

:::

## A thermal throttle that voided an A/B test

*Level 2 · incident · about 20 minutes · version: SGLang 0.5.22; model: Qwen/Qwen3-8B; hardware: one L4 with 24 GB of memory, in a node whose second L4 ran other tenants*

A team wants to know whether CUDA graphs help their `Qwen/Qwen3-8B` server on an L4. They run the concurrency sweep with graphs on, then the same sweep with graphs off, one after the other on the same afternoon, three seeds each. The two tables agree within a few percent, and at several points the run with graphs off reads a little faster. They conclude that graphs do nothing on this card and plan to turn them off in production to start faster and save memory.

One teammate mentions that the fans of the node were loud all afternoon, and that the other L4 in the node was running another team's test pods and an FP8 sweep at the same time.

**Evidence: the first comparison of CUDA graphs on and off, as the team read it**

```text
title: the first comparison of CUDA graphs on and off, as the team read it
source: manuals/sglang-101/capture/gpu/incidents/l4-thermal-throttle.txt
lines: 6-23
lang: text
note: Compare the two configs row by row, then read the seed ranges in the last column.
---
GPU 0 ran the sweep. GPU 1 ran two other tenants' test pods and an FP8 sweep at the same time.
Qwen/Qwen3-8B, BF16, 512 tokens in, 128 out, median over three seeds; the sweep had no GPU telemetry yet.

config          concurrency  median TPOT ms  output tok/s (min-max over seeds)
default                   1           103.4  10.1 (10.0-14.9)
default                   2            81.2  25.1 (24.6-26.8)
default                   4            67.2  57.4 (55.8-59.3)
default                   8            72.1  93.6 (92.4-94.5)
default                  16            79.0  159.1 (157.4-162.8)
default                  32           113.2  194.2 (193.3-195.7)
default                  64           123.9  199.5 (198.9-200.4)
no-cuda-graph             1           103.4  10.2 (10.2-12.3)
no-cuda-graph             2            73.9  26.6 (25.6-27.3)
no-cuda-graph             4            68.0  55.5 (55.4-58.7)
no-cuda-graph             8            75.4  92.0 (91.2-92.8)
no-cuda-graph            16            75.7  160.8 (157.7-160.8)
no-cuda-graph            32           117.9  193.2 (189.2-194.5)
no-cuda-graph            64           120.8  201.0 (193.3-201.8)

```

**Evidence: the state of both GPUs in the node during that sweep**

```text
title: the state of both GPUs in the node during that sweep
source: manuals/sglang-101/capture/gpu/incidents/l4-thermal-throttle.txt
lines: 1-4
lang: text
note: Read the temperature, the current clock against the maximum, and the slowdown flags of the first GPU.
---
nvidia-smi on the L4 host during the first load sweep, 2026-10-16 18:10 UTC
index, temperature.gpu, power.draw [W], power.limit [W], clocks.current.sm [MHz], clocks.max.sm [MHz], clocks_event_reasons.active, clocks_event_reasons.sw_thermal_slowdown, clocks_event_reasons.hw_thermal_slowdown, clocks_event_reasons.sw_power_cap, utilization.gpu [%]
0, 87, 58.36 W, 72.00 W, 360 MHz, 2040 MHz, 0x0000000000000020, Active, Not Active, Not Active, 100 %
1, 81, 52.77 W, 72.00 W, 2025 MHz, 2040 MHz, 0x0000000000000004, Not Active, Not Active, Active, 0 %

```

**Evidence: the start of each run in the repeated sweep, with the wait before it**

```text
title: the start of each run in the repeated sweep, with the wait before it
source: manuals/sglang-101/capture/gpu/out-l4/graphs-sameday-starts.log
lines: 1-42
lang: text
note: All 42 starts were at 72 C, after a wait that differs each time.
---
[graphs-on-b] c1-s1 start 72 C after 161 s
[graphs-on-b] c2-s1 start 72 C after 262 s
[graphs-on-b] c4-s1 start 72 C after 232 s
[graphs-on-b] c8-s1 start 72 C after 156 s
[graphs-on-b] c16-s1 start 72 C after 166 s
[graphs-on-b] c32-s1 start 72 C after 187 s
[graphs-on-b] c64-s1 start 72 C after 227 s
[graphs-on-b] c1-s2 start 72 C after 267 s
[graphs-on-b] c2-s2 start 72 C after 287 s
[graphs-on-b] c4-s2 start 72 C after 237 s
[graphs-on-b] c8-s2 start 72 C after 161 s
[graphs-on-b] c16-s2 start 72 C after 161 s
[graphs-on-b] c32-s2 start 72 C after 187 s
[graphs-on-b] c64-s2 start 72 C after 182 s
[graphs-on-b] c1-s3 start 72 C after 207 s
[graphs-on-b] c2-s3 start 72 C after 222 s
[graphs-on-b] c4-s3 start 72 C after 182 s
[graphs-on-b] c8-s3 start 72 C after 116 s
[graphs-on-b] c16-s3 start 72 C after 126 s
[graphs-on-b] c32-s3 start 72 C after 136 s
[graphs-on-b] c64-s3 start 72 C after 171 s
[graphs-off-b] c1-s1 start 72 C after 171 s
[graphs-off-b] c2-s1 start 72 C after 237 s
[graphs-off-b] c4-s1 start 72 C after 192 s
[graphs-off-b] c8-s1 start 72 C after 126 s
[graphs-off-b] c16-s1 start 72 C after 136 s
[graphs-off-b] c32-s1 start 72 C after 141 s
[graphs-off-b] c64-s1 start 72 C after 176 s
[graphs-off-b] c1-s2 start 72 C after 217 s
[graphs-off-b] c2-s2 start 72 C after 227 s
[graphs-off-b] c4-s2 start 72 C after 182 s
[graphs-off-b] c8-s2 start 72 C after 116 s
[graphs-off-b] c16-s2 start 72 C after 136 s
[graphs-off-b] c32-s2 start 72 C after 136 s
(excerpt: the first 40 of 48 lines)
```

**Evidence: the same comparison on a cooled card, both servers on one day**

```text
title: the same comparison on a cooled card, both servers on one day
source: manuals/sglang-101/sections/4-1-forwardmode-and-cuda-graphs.md
lines: 123-131
lang: text
note: Read the time per token and the P99 ITL columns, and the note on the last row.
---
| Concurrency | Median TPOT with graphs / without | Output tok/s with / without | P99 ITL with / without |
|---|---|---|---|
| 1 | 60.15 / 60.64 ms | 13.93 / 14.67 | 104 / 104 ms |
| 8 | 66.01 / 66.60 ms | 112.60 / 111.67 | 70 / 68 ms |
| 16 | 70.08 / 70.59 ms | 201.21 / 200.16 | 80 / 73 ms |
| 32 | 95.65 / 94.12 ms | 270.61 / 270.81 | 103 / 87 ms |
| 64, see the note below | 103.39 / 103.12 ms | 264.10 / 265.30 | 109 / 90 ms |

The L4 servers captured decode graphs only up to 48 running requests. At 64 users, batches above 48 ran eager on both servers, so the last row does not measure graphs.

```

**Evidence: the same mistake in a speculative decoding test on the other engine**

```text
title: the same mistake in a speculative decoding test on the other engine
source: manuals/vllm-101/sections/4-1-speed-up-decode-with-eagle3.md
lines: 110-110
lang: text
note: Read the two clocks and what the team did with those runs.
---
Our first EAGLE3 runs had no clock lock. At one user, the run with no speculation ran at 210 MHz, and the EAGLE3 run at about 1,400 MHz. A gap that large hides the effect of speculation, so we set those runs aside.

```

**Questions**

1. The two sweeps agree within a few percent. Why is that agreement not evidence that graphs do nothing?
2. Read the GPU state line. Which slowdown flag is set, what clock does the card run at, and what share of its maximum is that?
3. What does a slow clock do to a launch-bound step and to a memory-bound step, and why does that hide a graph effect in particular?
4. Design the protocol that makes an A/B pair comparable on this card. Give the start condition, the repeat rule and what you record.
5. With that protocol, what did graphs change on this card, and where did the result surprise us?
6. The same mistake appeared in a speculative decoding test on another engine. What was the clock gap there, and what did the team do with those runs?

:::answer Show the answer
:::say Short answer
The first A/B was void. The card ran at 360 MHz with the thermal slowdown active, the clock was not recorded, and the two sweeps did not share a clock. Any conclusion about graphs from those tables is a conclusion about heat.
:::

**Walkthrough**

Start with the first table. The default server and the server without graphs sit within a few percent at every concurrency, and the seed ranges overlap. At one user the ranges are 10.0 to 14.9 and 10.2 to 12.3 tokens per second, which is wide for a point that should be stable. The sweep had no GPU telemetry, so nothing in the table says what the card was doing.

The GPU state line says it. The first GPU, the one that ran the sweep, was at 87 C, its SM clock was 360 MHz against a maximum of 2,040, and the software thermal slowdown flag was active while the card reported 100 percent utilization. The second GPU, at 81 C, held 2,025 MHz while it ran the other tenants' pods. The card under test was running at about a sixth of its clock for a reason that has nothing to do with the server flags.

A CUDA graph removes the launch time of the kernels in one decode step. On this card and model that saving is about half a millisecond of a step of 60 to 70 ms, and a throttled GPU is slow on every step, so the saving disappears in the noise. At the same time the throttle moves with temperature and with the neighbour's load, so two sweeps that ran one after the other did not run at the same speed. Agreement within a few percent on a card whose clock wandered is no evidence at all. The team removed those numbers.

The third listing shows the repaired method. Every run of the repeated sweep started at 72 C or below, and the kit waited for that temperature before each start, from 116 to 287 s. A run whose median SM clock fell under 1,000 MHz was set aside and repeated, up to three times. Both servers ran on one day, one after the other, with the same pool of 24,094 tokens, and a sampler recorded the clock and the temperature every second.

The same-day pair is the result. Up to 16 users the graphs saved 0.5 to 0.7 ms of a step, about 1 percent, 60.15 against 60.64 ms at one user. Throughput was within 1.2 percent from 2 users up. At 16 and 32 users the server without graphs had the lower P99 ITL, 73 against 80 ms and 87 against 103 ms, with no seed overlap, and the manual reports that gap without a mechanism for it. At 64 users batches above 48 ran eager on both servers, so that row does not measure graphs at all.

The last listing is the other engine. Its first speculative decoding runs had no clock lock. At one user the run with no speculation ran at 210 MHz and the run with speculation at about 1,400 MHz. A gap that large hides any effect of the feature, so the team set those runs aside and locked the clock at 900 MHz before it compared again.

**Resolution**

The first A/B was void. The card ran at 360 MHz with the thermal slowdown active, the clock was not recorded, and the two sweeps did not share a clock. Any conclusion about graphs from those tables is a conclusion about heat.

The repaired comparison kept graphs on. They saved about 1 percent of each decode step on this dense model, the throughput tie held within 1.2 percent, and the unexplained lower tail without graphs at 16 and 32 users is a reason to measure the tail on your model, not a reason to turn graphs off for memory. Size the graphs to your traffic instead. The method is the real fix: record `clocks.sm` and the temperature every second during every benchmark, start each run at a temperature that the card can hold, repeat any run whose median clock falls under your floor, and compare two runs only at similar clocks. The lab notes of the vLLM manual name four L4 sessions for the same reason, and compare numbers only inside one session.

**Wrong turns**

- "Both configs ran on the same hot card, so the heat cancels out." The throttle moved with the temperature and with the neighbour's load. Two runs an hour apart did not share a clock, and a card at a sixth of its clock hides a half-millisecond effect in any case.
- "Lock the clock at the maximum and the problem is gone." A lock sets the highest clock, and a GPU at a high temperature still slows below it. We locked at 900 MHz, a value that the card could hold, and still set aside runs that fell under it.
- "Run the two configs in the other order." The second run still inherits the heat of the first. Alternate the configs, cool the card to the same temperature before each run, and record the clock.
- "Wait one minute between runs." The repeated sweep needed 116 to 287 s to reach 72 C before a start. Wait for a temperature, not for a time.

**Generalize**

Every A/B on hardware needs a control for the hardware. A clock that changes with heat or with a neighbour is a hidden variable that moves every number by the same factor, and that factor swallows small effects and invents large ones. Record the clock with every measurement, hold the start condition fixed, and treat two numbers from different clocks as two numbers from different machines.

:::

## An engine share of 0.02 and a rollout six times slower

*Level 2 · incident · about 20 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

A team trains with GRPO on one GB10. The week before, a larger model was stopped by a memory kill, and the team learned to fear the node total. Someone sets the engine memory share, `--sglang-mem-fraction-static`, to 0.02 for the next runs, to leave the trainer as much room as possible. The launcher default is 0.4.

The next morning a one-step check run has finished, with a reward in the usual range. The step took far longer than the day before. Nobody saw an error. One engineer blames the heat guard, another blames a slow disk, and a third says the engine must have fallen back to a slow kernel. You get the log of the check run, the log of the same check at 0.25, and the log of a normal run at 0.4.

**Evidence: the pool size, the rollout time and the reward of three runs**

```text
title: the pool size, the rollout time and the reward of three runs
source: manuals/miles-101/capture/gpu/out-gb10/frac-low-kv.txt
lines: 3-5
lang: text
note: Read the rollout time of the first row against the other two, then the pool size in tokens.
---
frac-low: max_total_num_tokens=3082 perf/rollout_time': 385.5003604888916 rollout/raw_reward': 0.61328125 steps=1
frac-check: max_total_num_tokens=211813 perf/rollout_time': 60.696292877197266 rollout/raw_reward': 0.66015625 steps=1
plain: max_total_num_tokens=347841 perf/rollout_time': 63.839099407196045 rollout/raw_reward': 0.625 steps=12

```

**Evidence: the KV cache line of the slow run at startup**

```text
title: the KV cache line of the slow run at startup
source: manuals/miles-101/capture/gpu/out-gb10/frac-low-kv.txt
lines: 6-6
lang: text
note: The pool line that the engine prints before the first step.
---
frac-low engine line: KV Cache is allocated. dtype: torch.bfloat16, #tokens: 3082, K size: 0.16 GB, V size: 0.16 GB

```

**Evidence: the one flag that differed between the runs**

```text
title: the one flag that differed between the runs
source: manuals/miles-101/capture/gpu/out-gb10/frac-low-kv.txt
lines: 1-2
lang: text
note: The second line gives the fraction of each run.
---
# Live check 2026-10-23, Qwen3-0.6B, 1 step, launcher defaults plus one flag.
# frac-low: --sglang-mem-fraction-static 0.02. frac-check: 0.25. plain: launcher default 0.4.

```

**Evidence: the default run settings of the manual**

```text
title: the default run settings of the manual
source: manuals/miles-101/sections/r-3-lab-notes.md
lines: 23-33
lang: text
note: Read the prompts per step, the answers per prompt and the answer limit, then the engine memory fraction.
---
| Setting | Value |
|---|---|
| Prompts per step | 32 (`--rollout-batch-size`) |
| Answers per prompt | 8 (`--n-samples-per-prompt`) |
| Samples per optimizer step | 256 (`--global-batch-size`) |
| Answer limit | 1,024 tokens |
| Temperature | 1 |
| Learning rate | 1e-6, constant |
| Trainer | FSDP on one GPU, colocated with the engine |
| Engine memory fraction | 0.4 |
| Weight update bucket | 536870912 bytes, 512 MiB |

```

**Evidence: how the engine turns the fraction into a pool**

```text
title: how the engine turns the fraction into a pool
source: manuals/sglang-101/sections/3-2-mem-fraction-static-and-startup-sizing.md
lines: 55-59
lang: text
note: The fraction covers the weights and the KV pool together, and the pool gets what is left after the weights load.
---
**--mem-fraction-static:** the share of memory that SGLang gives to the model weights plus the KV pool. Everything outside that share is for activations, CUDA graphs, and other programs. The flag defaults to `None`, and SGLang computes a value at startup {{code}}.

On a GPU, the automatic value comes from a reserve. SGLang starts with 512 MB and adds 1.5 MB for each token of the prefill chunk {{code}}. Then it adds more for tensor and pipeline parallelism and for CUDA graphs. On a GPU with more than 60 GB, the reserve is at least 10 GiB. The fraction is then the GPU memory minus the reserve, divided by the GPU memory. When SGLang cannot read the device capacity, it uses 0.95.

After the weights load, SGLang measures free memory again. The KV budget is the free memory minus the `1 - fraction` share of the memory that was free before loading {{code}}. The pool holds that budget divided by the bytes per token from [section 3.1](#s-kv-bytes-per-token-and-the-kv-pool). If the budget is not positive, startup stops and prints the smallest fraction that would work.

```

**Evidence: the troubleshooting entry for the engine memory fraction**

```text
title: the troubleshooting entry for the engine memory fraction
source: manuals/miles-101/sections/7-1-troubleshoot-by-symptom.md
lines: 59-63
lang: text
note: Read the Check line for the case of a fraction that is too low.
---
## The engine runs out of memory at start

- **Cause:** `--sglang-mem-fraction-static` does not fit the GPU. With `--colocate`, the trainer can already hold GPU memory when the engine starts. A fraction that is too high leaves no room for activations and CUDA graphs. A fraction that is too low leaves no room for the KV cache.
- **Check:** a CUDA out-of-memory error in the engine lines during startup or on the first batch, and no `Ray OutOfMemoryError`. A fraction that is too low does not always stop the engine. Read `#tokens` in the `KV Cache is allocated` line. In our check at 0.02, the engine started with 3,082 tokens, and the first rollout took 386 s against 61 s at 0.25.
- **Fix:** lower the fraction for the first case, or raise it for the second, by 0.05 or 0.1 at a time. The Miles documentation asks for 0.8 or lower with `--colocate`. Our runs used 0.4. [SGLang 101, section 3.2](https://aiengineeringfromscratch.com/manual-sglang-101.html#s-mem-fraction-static-and-startup-sizing) explains how the engine divides its memory.

```

**Questions**

1. Three rollout times, three pool sizes. Which number moved with the time, and which did not?
2. The reward of the slow run is normal. Why does that not clear the run?
3. The KV cache line prints before the first step. What in it tells you the step will be slow, and how slow is the GPU?
4. Count the sequences that one step must generate and the longest answer. What can a pool of this size hold at once?
5. Which direction do you change the share, by how much per try, and what do you read after each try?
6. The engine did not run out of memory and did not crash. Why is the low direction of this flag harder to notice than the high direction?

:::answer Show the answer
:::say Short answer
The engine share of 0.02 left a pool of 3082 tokens, and the rollout of one step took 386 s against 61 s at 0.25 and about a minute at the default of 0.4. The reward stayed in range because the answers were the same work, only in many more rounds. The fix is to put the share back to 0.4, or to 0.25 when the trainer needs more room, and never below the point where the pool stops holding a full step.
:::

**Walkthrough**

1. **Line up the three runs.** Read `perf/rollout_time` on each line. The run with the low share took 386 s for one rollout. The run at 0.25 took 61 s, and the normal run at 0.4 took about a minute as well. The rewards were 0.61328125, 0.66015625 and 0.625. The reward did not follow the setting. The time did, by about six times.
2. **Read the pool sizes on the same lines.** The slow run had `max_total_num_tokens=3082`. The other two had 211,813 and 347,841. The pool is the number of tokens that the engine can hold in its KV cache at one time. The rollout time moved with the pool, and nothing else in the three lines differed.
3. **Read the engine line that came first.** At startup the slow engine printed `KV Cache is allocated` with 3082 tokens, and a K size and a V size of 0.16 GB each. This line appears before any step runs. A reader who knows the normal value for the machine sees the problem here, minutes before the first slow step ends.
4. **Count the work of one step.** The manual's defaults are 32 prompts per step, 8 answers per prompt and an answer limit of 1,024 tokens. One step generates 256 answers. A pool of 3082 tokens holds three answers at the length limit at once, and fewer with their prompts. The engine must run the step as a long series of small batches. Nothing is broken. The GPU is almost idle while it waits for room.
5. **Follow the flag to the pool.** The share names the memory for the model weights plus the KV pool together. After the weights load, the engine measures free memory again and gives the pool what is left of the share. At 0.02 of the memory, the weights of even a small model take most of the share, and the pool gets the remainder.
6. **Use the manual's entry.** The troubleshooting page lists both failures of this flag. A share that is too high leaves no room for activations and CUDA graphs, so CUDA reports that it is out of memory. A share that is too low does not always stop the engine, so the check is to read `#tokens` in the KV cache line. The fix for the low case is to raise the share by 0.05 or 0.1 at a time.

**Resolution**

The engine share of 0.02 left a pool of 3082 tokens, and the rollout of one step took 386 s against 61 s at 0.25 and about a minute at the default of 0.4. The reward stayed in range because the answers were the same work, only in many more rounds. The fix is to put the share back to 0.4, or to 0.25 when the trainer needs more room, and never below the point where the pool stops holding a full step.

The proving measurement is the pair of numbers at startup and after the first step: the `#tokens` in the KV cache line and `perf/rollout_time`. At 0.25 the pool held 211,813 tokens and the rollout took 61 s. Record both for every new setting of the flag, and change the share by 0.05 or 0.1 at a time. The memory kill of the week before was a trainer problem, and a smaller engine share did not prevent it, as the Ray incident shows.

**Wrong turns**

- "The reward is fine, so the run is fine." The reward measures what the model learned, not what the step cost. At six times the rollout time, the same training takes six times the GPU hours.
- "The heat guard paused the run." A pause adds wall-clock time to a step, but the pool line of 3082 tokens explains the time without any pause, and the run at 0.25 on the same day took 61 s.
- "Raise the number of running requests." The engine admits requests only while the pool has room for their tokens. With 3082 tokens the pool, not the request cap, sets the batch.
- "Lower the share further, the trainer is what matters." The trainer kill of the week before happened at 0.4 and again at 0.2, so the share was not the cause there. Below 0.25 the trainer gains little and the rollout loses a lot.

**Generalize**

A setting can be wrong in both directions, and the two failures look different. Too much memory for one component crashes it, which everyone sees. Too little makes it slow, which nobody sees until the bill arrives. Know the normal value of the sizing line that each component prints at startup, read it before the first step, and when you change a share, move it in small steps and record the size and the time together.

:::

## An hour of polling a task that waited for us

*Level 2 · incident · about 20 minutes · version: A2A 1.0.1 with the manual's capture kit (the test-runner, code-reviewer and deployer agents); model: no model; the agents are deterministic fixtures; hardware: one machine, localhost, no network*

A planner sends a diff of `payments-api` to the `code-reviewer` agent and waits for the findings. Its wait loop is the one it uses for every remote agent: send the message, then call `GetTask` every few seconds until the state is completed, failed or canceled. Last night a review never came back. The planner polled the same task for an hour, then its own run timed out, and the release waited for a human reviewer in the morning.

The on-call engineer pulls the first reply that the reviewer sent. It was not a failure, and the agent never went quiet. The planner knew the branch the diff was cut from, because it had checked the code out itself. You have the two exchanges of the review from the capture kit, a polling exchange on another agent for comparison, and the log of the kit's own planner, which handled the same question in its run.

**Evidence: the reply to the review request**

```text
title: the reply to the review request
source: manuals/a2a-101/capture/out/06-input-required.http
lines: 32-53
lang: text
note: Read the state, the role of the status message, and what it asks.
---
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "task": {
      "id": "e5c95b09-6d4b-4b3b-8693-91e81472d12f",
      "contextId": "49c5a238-4158-455d-8d63-b2cb39c0ecac",
      "status": {
        "state": "TASK_STATE_INPUT_REQUIRED",
        "message": {
          "messageId": "46494a30-e224-4d71-8d6f-50c110597e3b",
          "contextId": "49c5a238-4158-455d-8d63-b2cb39c0ecac",
          "taskId": "e5c95b09-6d4b-4b3b-8693-91e81472d12f",
          "role": "ROLE_AGENT",
          "parts": [
            {
              "text": "Which base branch should I compare this diff against?"
            }
          ]
        },
        "timestamp": "2026-10-06T09:00:00.500Z"
      },

```

**Evidence: a GetTask on a task that is still running, from another capture**

```text
title: a GetTask on a task that is still running, from another capture
source: manuals/a2a-101/capture/out/04-polling.http
lines: 77-110
lang: text
note: Compare this state and status message with the ones in the review reply.
---
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "id": "d0c28826-28b8-4b15-8b53-4e01ae7a5a3c",
    "contextId": "3afa8576-7a83-4167-bb58-01c3b0942c8f",
    "status": {
      "state": "TASK_STATE_WORKING",
      "message": {
        "messageId": "fb999be8-dce9-416b-b397-d74b090f121a",
        "contextId": "3afa8576-7a83-4167-bb58-01c3b0942c8f",
        "taskId": "d0c28826-28b8-4b15-8b53-4e01ae7a5a3c",
        "role": "ROLE_AGENT",
        "parts": [
          {
            "text": "Checking out 9f3c2e1 and starting the suite"
          }
        ]
      },
      "timestamp": "2026-10-06T09:00:01.250Z"
    },
    "artifacts": [
      {
        "artifactId": "test-log",
        "name": "test-log.txt",
        "parts": [
          {
            "text": "collected 12 items\n"
          }
        ]
      }
    ]
  }
}

```

**Evidence: the message that answers the question**

```text
title: the message that answers the question
source: manuals/a2a-101/capture/out/06-input-required.http
lines: 82-99
lang: text
note: Read which ids the message carries and where they came from.
---
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "096d3737-42f9-4039-8320-a4737c2b3abe",
      "contextId": "49c5a238-4158-455d-8d63-b2cb39c0ecac",
      "taskId": "e5c95b09-6d4b-4b3b-8693-91e81472d12f",
      "role": "ROLE_USER",
      "parts": [
        {
          "text": "main"
        }
      ]
    }
  }
}

```

**Evidence: the reply to the answer**

```text
title: the reply to the answer
source: manuals/a2a-101/capture/out/06-input-required.http
lines: 104-125
lang: text
note: Same task id, new state, new status message.
---
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "task": {
      "id": "e5c95b09-6d4b-4b3b-8693-91e81472d12f",
      "contextId": "49c5a238-4158-455d-8d63-b2cb39c0ecac",
      "status": {
        "state": "TASK_STATE_COMPLETED",
        "message": {
          "messageId": "cdf017cb-27ab-4cd1-9b83-6d0995c9da8b",
          "contextId": "49c5a238-4158-455d-8d63-b2cb39c0ecac",
          "taskId": "e5c95b09-6d4b-4b3b-8693-91e81472d12f",
          "role": "ROLE_AGENT",
          "parts": [
            {
              "text": "2 findings"
            }
          ]
        },
        "timestamp": "2026-10-06T09:00:01.250Z"
      },

```

**Evidence: how the kit's planner handled the same question**

```text
title: how the kit's planner handled the same question
source: manuals/a2a-101/capture/out/19-planner.log
lines: 7-11
lang: text
note: Five lines, from the delegation to the review result.
---
delegate review-diff to code-reviewer
  task 80bc7784 is TASK_STATE_INPUT_REQUIRED
  it asks: Which base branch should I compare this diff against? The planner answers from its own context: main
  task 80bc7784 is TASK_STATE_COMPLETED
review: 1 finding, 0 blocking

```

**Evidence: the nine states, their class, and the client's next step**

```text
title: the nine states, their class, and the client's next step
source: manuals/a2a-101/sections/r-3-task-states.md
lines: 7-17
lang: text
note: Find the two interrupted rows and read their last column.
---
| State | Class | Set by | The client does next |
|---|---|---|---|
| TASK_STATE_UNSPECIFIED | none | Nobody: the zero value | Treat it, and any unknown name, as an error. |
| TASK_STATE_SUBMITTED | active | The server, on creation | Wait, poll, or subscribe. |
| TASK_STATE_WORKING | active | The agent, while it works | As for a submitted task |
| TASK_STATE_INPUT_REQUIRED | interrupted | The agent, with a question | Answer with a new message that carries the same `taskId` and `contextId`. |
| TASK_STATE_AUTH_REQUIRED | interrupted | The agent, for an authorization | Pass the request to whoever approves it, outside A2A, and subscribe, register a webhook, or poll. |
| TASK_STATE_COMPLETED | terminal | The agent, when the work is done | Read the artifacts for the result. Follow up in a new task with `referenceTaskIds`. |
| TASK_STATE_FAILED | terminal | The agent, unable to do the work | Read the status message, fix the input, and start a new task. |
| TASK_STATE_CANCELED | terminal | The agent, after `CancelTask` | Start a new task in the same context. |
| TASK_STATE_REJECTED | terminal | The agent, refusing the task | Stop the loop, and follow the status message. |

```

**Evidence: why the answer carries both ids**

```text
title: why the answer carries both ids
source: manuals/a2a-101/sections/3-1-message.md
lines: 95-95
lang: text
note: One sentence on what the implementations do with a message that names only the task.
---
Five SDKs infer the context for the agent and store the message as sent, and the reference SDK generates a new one. Send both ids, and the difference never reaches you.

```

**Questions**

1. What state did the first reply carry, and who wrote the message inside it?
2. How does a task that waits for input differ from one that is working, when you look at two polls?
3. Where does the planner's answer go, and which fields must it carry?
4. Which states must a wait loop stop on, and what is the next step for each of them?
5. The planner had the branch name in its own context. Why did the loop never use it?

:::answer Show the answer
:::say Short answer
The loop had the wrong stop set. It waited for three terminal states and treated everything else as "still running", so an interrupted task looked like a slow one. The fix adds the two interrupted states to the stop set and gives each a branch. For `TASK_STATE_INPUT_REQUIRED`, the planner reads the status message and answers with a new message that carries the task id and the context id of the parked task. For `TASK_STATE_AUTH_REQUIRED`, it hands the request to whoever approves and subscribes or polls. For `TASK_STATE_REJECTED`, it stops and follows the message. The capture proves the path: the reviewer finished one call after the answer and returned the review artifact, and the kit's planner log shows the same handling end to end.
:::

**Walkthrough**

1. **Read the first reply.** The state is `TASK_STATE_INPUT_REQUIRED`. The status message has the role `ROLE_AGENT` and asks which base branch the diff should be compared against. A blocking send returns at a terminal or an interrupted state, so the question was in the planner's hands from the first reply, before the first poll.
2. **Compare with a working task.** In the polling capture the state is `TASK_STATE_WORKING`, the status message reports progress, and the artifact grows between polls. A parked task does none of that. Its state is the agent saying "your turn", and no number of polls changes it.
3. **Read the answer.** It is an ordinary `SendMessage`. The message has a fresh `messageId`, the role `ROLE_USER`, the text `main`, and both the `contextId` and the `taskId` copied from the task. The reference SDK does not infer the context from the task and stamps a fresh one, so a client sends both ids.
4. **Read the second reply.** The same task id comes back in `TASK_STATE_COMPLETED` with the status message `2 findings`. The history now holds the question and the answer, and the `review.json` artifact names `main` as the base and lists the two findings with their lines. The task never left its id or its context.
5. **Read the planner log.** The kit's planner sees the interrupted state, reads the question, answers from its own context with `main`, and reports the review one call later. The interrupted state is a branch in its loop, not a reason to wait.
6. **Read the state table.** Nine states fall in three classes. Two are interrupted, and each has a different next step: answer on the same task for input, or pass the request to an approver and keep watching for authorization. Four are terminal, and the fourth, rejected, is the one most loops forget.

**Resolution**

The loop had the wrong stop set. It waited for three terminal states and treated everything else as "still running", so an interrupted task looked like a slow one. The fix adds the two interrupted states to the stop set and gives each a branch. For `TASK_STATE_INPUT_REQUIRED`, the planner reads the status message and answers with a new message that carries the task id and the context id of the parked task. For `TASK_STATE_AUTH_REQUIRED`, it hands the request to whoever approves and subscribes or polls. For `TASK_STATE_REJECTED`, it stops and follows the message. The capture proves the path: the reviewer finished one call after the answer and returned the review artifact, and the kit's planner log shows the same handling end to end.

**Wrong turns**

- "Poll faster, the reviewer is slow." The state says that the agent waits for the client. The poll rate does not move it.
- "Abandon the task and send a new request with the branch in it." It works, and it leaves a parked task behind on the agent, resends the diff, and loses the history. The protocol's path is a new message on the same task.
- "Answer with the taskId only; the server knows the context." The reference SDK stamps a fresh context on such a message. Copy both ids.
- "Treat an interrupted state as a failure and report it." The task kept its id, its history and its artifacts. Nothing failed, and the answer finishes it.
- "Send the answer as ROLE_AGENT, because the planner is an agent." The role is the direction of the message, not the kind of party. The client side is `ROLE_USER`, and the kit refuses the other role with -32602.

**Generalize**

A wait loop must know every state the other side can enter, and it must stop on each state that asks something of the caller, not only on the states that end the work. When a remote system pauses with a question, the answer is often already in the caller's context, and the loop is the only thing that stands between the two.

:::

## An implicit deny that looked like an outage

*Level 2 · incident · about 20 minutes · version: sbx v0.47.0; model: none; shell commands inside the sandbox; hardware: one Mac with the microVM runtime*

A shell agent in a sandbox is asked to fetch a page from `example.com` as the first step of a larger task. It reports back that the network is down inside the sandbox and asks the operator to repair the connection. The operator pastes the agent's command into `sbx exec` and gets a reply within a second, so nothing timed out. The sandbox was created with the balanced preset and no rule of its own.

The team's first guess is a broken proxy, because the reply holds two status lines that disagree. The second guess is a DNS failure. You have the two requests the operator ran, the policy check for that host, the policy log, and the commands that changed the rules afterwards.

**Evidence: a HEAD request and a GET request to example.com from inside m101-policy**

```text
title: a HEAD request and a GET request to example.com from inside m101-policy
source: manuals/docker-sandboxes-101/capture/out/09-blocked.txt
lang: console
note: Read the two status lines of the first request, the body of the second, and the exit codes.
---
$ sbx exec m101-policy sh -c 'curl -sS --max-time 10 -I https://example.com; echo exit=$?'
HTTP/1.1 200 OK

HTTP/1.1 403 Forbidden
Content-Length: 90
Content-Type: text/plain

exit=0
[exit 0]

$ sbx exec m101-policy sh -c 'curl -sS --max-time 10 https://example.com; echo; echo exit=$?'
Approval required for example.com:443.

Review and respond with:
  sbx policy approval ls

exit=0
[exit 0]

```

**Evidence: the decision for example.com from sbx policy check network**

```text
title: the decision for example.com from sbx policy check network
source: manuals/docker-sandboxes-101/capture/out/09-check-verbose.json
lang: json
note: Read deny_kind and reason.
---
{
  "action": "net:connect:tcp",
  "allowed": false,
  "context": "sandbox:m101-policy",
  "deny_kind": "implicit",
  "governance": {
    "active": false
  },
  "reason": "No matching allow rule (default deny)",
  "resource_type": "net:domain",
  "resource_value": "example.com:443",
  "target": "example.com:443",
  "type": "network"
}

```

**Evidence: the policy log of m101-policy**

```text
title: the policy log of m101-policy
source: manuals/docker-sandboxes-101/capture/out/09-policy-log.txt
lang: console
note: One blocked row with its rule text, and two allowed rows with their proxy path.
---
$ sbx policy log m101-policy
Blocked requests:
SANDBOX              TYPE      HOST              PROXY     RULE                                                                                         REASON                                  LAST SEEN        COUNT
m101-policy   network   example.com:443   forward   no applicable policies for op(action=net:connect:tcp, resource=net:domain:example.com:443)   No matching allow rule (default deny)   <ts>   <n>

Allowed requests:
SANDBOX              TYPE      HOST                      PROXY            RULE   REASON   LAST SEEN        COUNT
m101-policy   network   download.docker.com:443   forward-bypass                   <ts>   <n>
m101-policy   network   ports.ubuntu.com:80       forward                          <ts>   <n>
[exit 0]

```

**Evidence: a sandbox-scoped allow rule and the policy list after it**

```text
title: a sandbox-scoped allow rule and the policy list after it
source: manuals/docker-sandboxes-101/capture/out/09-allow.txt
lang: console
note: Read the scope in the first reply and the host count in the list.
---
$ sbx policy allow network --sandbox m101-policy example.com
Rule added to policy local (scope: sandbox:m101-policy): <uuid> (example.com [tcp])
[exit 0]

$ sbx policy ls m101-policy
Policy for sandbox: m101-policy
NETWORK
  allow 195 hosts from <uuid>, local-policy

FILESYSTEM
  read allow all paths from local-policy
  write allow all paths from local-policy

Details: sbx policy ls m101-policy --wide
[exit 0]

```

**Evidence: the HEAD request after the allow rule**

```text
title: the HEAD request after the allow rule
source: manuals/docker-sandboxes-101/capture/out/09-allowed.txt
lines: 1-7
lang: console
note: Compare the first status line with the one in the first listing.
---
$ sbx exec m101-policy sh -c 'curl -sS --max-time 10 -I https://example.com; echo exit=$?'
HTTP/1.0 200 Connection established

HTTP/2 200 
date: <value>
content-type: text/html; charset=utf-8
server: cloudflare

```

**Evidence: the GET request after a deny rule replaced the allow**

```text
title: the GET request after a deny rule replaced the allow
source: manuals/docker-sandboxes-101/capture/out/09-blocked-by-rule.txt
lang: console
note: Compare the body with the approval body of the first listing.
---
$ sbx exec m101-policy sh -c 'curl -sS --max-time 10 https://example.com; echo; echo exit=$?'
Blocked by local rule for example.com:443

exit=0
[exit 0]

```

**Evidence: a deny rule added while the allow rule still exists**

```text
title: a deny rule added while the allow rule still exists
source: manuals/docker-sandboxes-101/capture/out/09-deny-conflict.txt
lang: console
note: The CLI refuses it and names the rule it conflicts with.
---
$ sbx policy deny network --sandbox m101-policy example.com
error: deny network rule: deny:   "example.com" conflicts with existing allow rule "<uuid>" (name "<uuid>") for tcp
[exit 1]

```

**Questions**

1. The HEAD request printed two status lines and exited 0. Which component sent each line, and why is the exit code 0?
2. The check says implicit and names no rule. What decided the request?
3. The log shows two allowed hosts with different proxy paths. What does forward-bypass tell you?
4. After the allow rule, what changed in the first status line of the same request?
5. An explicit deny gives a different body. How do you tell the two denials apart from inside the sandbox and from the host?
6. Why was the deny rule refused the first time, and what is the right order of operations?

:::answer Show the answer
:::say Short answer
There was no outage. `example.com` is not on the allow list of the balanced preset, which has 194 hosts. The proxy denied the connection as an implicit default and answered inside TLS with a 403 and an approval message. A sandbox-scoped allow rule turned the same request into a tunnelled 200 from the origin. The agent's report was wrong in the way the lesson on failure modes predicts: it read one status code and reported a cause it had not checked.
:::

**Walkthrough**

1. **Read the HEAD request line by line.** `HTTP/1.1 200 OK` is the forward proxy accepting the `CONNECT`. The `HTTP/1.1 403 Forbidden` below it arrived inside the TLS session, with a 90 byte plain text body, under a certificate the sandbox trusts. curl printed both and exited 0 because it received a complete reply. The GET shows the body: an approval is required for `example.com:443`. Nothing was slow and nothing was unreachable. A proxy answered with a decision.
2. **Ask the authorizer.** `sbx policy check network` runs the same authorizer as the proxy, without sending anything. For this host in the sandbox context it returns `allowed: false`, `deny_kind: implicit`, the reason `No matching allow rule (default deny)`, and no rule. The balanced preset lists 194 hosts, and `example.com` is not one of them. The request matched nothing and was denied by default.
3. **Read the log.** The blocked row names the host, the proxy path `forward`, the rule text `no applicable policies for op(...)` and the same reason. Two allowed rows show what the preset admits: a package host over `forward`, and a download host over `forward-bypass`, a tunnel that the proxy does not inspect. The log says what passed, and the check says why.
4. **Add the narrow rule.** `sbx policy allow network --sandbox m101-policy example.com` adds a rule in the local scope for that one sandbox, and `policy ls` then counts 195 hosts. The same HEAD request now begins with `HTTP/1.0 200 Connection established`, and the origin's `HTTP/2 200` follows. The proxy tunnels the connection and no longer speaks.
5. **Compare the two denials.** With a deny rule in place of the allow, the GET body reads `Blocked by local rule for example.com:443`. The implicit one asks for an approval. On the host, the check reports `deny_kind: explicit` with the rule id for the second case, and `implicit` for the first.
6. **Mind the order.** The deny for `example.com` was refused while the allow for the same host existed in the same scope, and the error named the allow rule. Remove the allow first, then add the deny. Deny wins at evaluation time, but the CLI does not store the pair.

**Resolution**

There was no outage. `example.com` is not on the allow list of the balanced preset, which has 194 hosts. The proxy denied the connection as an implicit default and answered inside TLS with a 403 and an approval message. A sandbox-scoped allow rule turned the same request into a tunnelled 200 from the origin. The agent's report was wrong in the way the lesson on failure modes predicts: it read one status code and reported a cause it had not checked.

Fixes:

1. Change the agent's instructions so that a 403 with an approval body is reported as a policy decision, with the host and the port, so the operator can add a rule.
2. Run `sbx policy check network --sandbox NAME host:port --json` before you touch the network, and read `deny_kind` and `rule`.
3. Add rules with `--sandbox` for one agent, and keep the global policy for hosts every agent needs. Before you add a deny in a scope, remove any allow for that host in that scope.

**Wrong turns**

- "Restart the daemon, the proxy returns two different codes." Both lines are the proxy doing its job: the first accepts the tunnel, the second refuses the host. A restart changes no rule.
- "It is DNS, because example.com does not resolve." The request reached the proxy with the host name, and the proxy denied the host by policy. The body, the check and the log all name the host and the port.
- "Allow example.com globally so this stops." A global rule admits the host for every sandbox. The local scope exists for one agent's need.
- "Add a deny rule now so the agent cannot try again." The deny conflicts with the allow in the same scope and is refused, and the agent's task needed the host. Fix the report, not the host.

**Generalize**

An agent that reports a failure gives you a claim, not a diagnosis. Reproduce the call outside the agent, read the whole reply and not only the first status line, and ask the policy layer for its decision before you look for a fault in the network. A deny with a body is an answer. A timeout is a fault.

:::
