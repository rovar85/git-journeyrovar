---
track: aibank
title: "AI incident scenarios, read the evidence (part 6 of 10)"
short: Incidents 6
sub: 6 measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Each scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.

## Which side failed, the engine or the input

*Level 2 · incident · about 20 minutes · version: rea 6.7.0 at 27dc42d with the Ghidra provider; model: no model; the fixtures are the ledger binaries built at -O1 and -O2; hardware: one aarch64 Mac*

A team wraps rea in an agent pipeline that analyses binaries overnight. The wrapper has one rule for failures: on any failed call, close the target, stop the Java process, open the target again, and retry. The night log shows the engine restarted eleven times, each restart followed by the same failure, and the import of the target paid for again each time. Two failures appear in the log, and the wrapper treated them the same way.

The first came from the command line on the Mac that runs the pipeline: a layout inspection of an object file exited 1. The second came from the MCP session: `analyze_function` returned an error for a procedure name that the agent had typed. You have the command record, the two error envelopes, the session index and the server log. Say what each failure was, and write the retry rule that the wrapper should have had.

**Evidence: the CLI call that exited 1**

```text
title: the CLI call that exited 1
source: manuals/reverse-engineering-101/capture/out/00-commands.txt
lines: 10-11
lang: console
note: The command, its exit code, its time, and the file it wrote.
---
$ rea inspect-binary-layout fixtures/ledger-x86_64-O1.o --format json
[exit 1] (0.6 s) -> 04-inspect-binary-layout.json

```

**Evidence: the whole envelope of that call**

```text
title: the whole envelope of the failed CLI call
source: manuals/reverse-engineering-101/capture/out/04-inspect-binary-layout.json
lang: json
note: Read code, category and retryable before the message.
---
{
  "code": "capability_unavailable",
  "category": "unsupported_provider",
  "message": "The initial real-verified pwntools artifact profile supports Linux x64 only.",
  "retryable": false,
  "remediation": {
    "action": "The initial real-verified pwntools artifact profile supports Linux x64 only."
  },
  "details": {
    "provider_id": "pwntools-elf",
    "operation": "inspect_binary_layout",
    "reason": "The initial real-verified pwntools artifact profile supports Linux x64 only."
  }
}

```

**Evidence: three consecutive calls of the MCP session**

```text
title: three consecutive calls of the MCP session
source: manuals/reverse-engineering-101/capture/out/10-mcp-session.txt
lines: 12-14
lang: text
note: The call before and the call after the error both succeeded on the same open target.
---
12  tools/call analyze_function         ok     -> 10-mcp-12-analyze-function-grade-label-O1.json  (18 ms)
13  tools/call analyze_function         error  -> 10-mcp-13-analyze-function-missing.json  (4 ms)
14  tools/call export_evidence_bundle   ok     -> 10-mcp-14-export-evidence-bundle-O1.json  (18 ms)

```

**Evidence: the decoded error of the MCP call**

```text
title: the decoded error of the MCP call
source: manuals/reverse-engineering-101/capture/out/10-mcp-13-analyze-function-missing.json
lines: 32-49
lang: json
note: Read code, category and retryable, then the one issue in details.
---
  "decoded_text": {
    "error": {
      "code": "invalid_request",
      "category": "invalid_input",
      "message": "Analysis input is invalid. Check the arguments and try again.",
      "retryable": true,
      "remediation": {
        "action": "Correct the listed arguments and retry."
      },
      "details": {
        "operation": "analyze_function",
        "issues": [
          {
            "path": [],
            "reason": "invalid_value",
            "message": "Unknown Ghidra procedure name or address: _nothing"
          }
        ],

```

**Evidence: the end of the diagnostics object**

```text
title: the end of the diagnostics object
source: manuals/reverse-engineering-101/capture/out/10-mcp-13-analyze-function-missing.json
lines: 92-113
lang: json
note: The engine wrote nothing to stdout or stderr, the capture is complete, and the remote code is not_found.
---
          "failure_output": {
            "stdout": {
              "text": "",
              "bytes": 0,
              "retained_bytes": 0
            },
            "stderr": {
              "text": "",
              "bytes": 0,
              "retained_bytes": 0
            },
            "complete": true
          },
          "failure_cause": {
            "name": "GhidraRemoteError",
            "message": "Unknown Ghidra procedure name or address: _nothing",
            "code": "not_found"
          },
          "failure_kind": "remote",
          "failure_message": "Unknown Ghidra procedure name or address: _nothing",
          "remote_code": "not_found",
          "remote_message": "Unknown Ghidra procedure name or address: _nothing"

```

**Evidence: the server log around the failed call**

```text
title: the server log around the failed call
source: manuals/reverse-engineering-101/capture/out/10-mcp-server.log
lines: 10-12
lang: jsonl
note: Two error lines at level 40, one per layer, then the next call completes with status ok.
---
{"level":40,"time":1792316959970,"application":"rea","mode":"mcp","layer":"ghidra-bridge","method":"analyze_function","status":"error","msg":"Ghidra bridge request completed"}
{"level":40,"time":1792316959971,"application":"rea","mode":"mcp","layer":"server","tool":"analyze_function","durationMs":2.73,"status":"error","msg":"MCP tool execution completed"}
{"level":30,"time":1792316960484,"application":"rea","mode":"mcp","layer":"server","tool":"close_binary","durationMs":491.18,"status":"ok","msg":"MCP tool execution completed"}

```

**Questions**

1. Both envelopes have the same five fields. Which two fields decide what to do next, before you read the message?
2. The first failure says that a profile supports Linux x64 only. What was wrong, the host, the file, or the engine, and what is the right next call?
3. The second failure is `retryable: true`. What would a retry with the same arguments return, and what has to change?
4. How does the diagnostics object tell you that the Ghidra process was healthy when the call failed?
5. Name the codes for which a restart of the engine is the correct response.

:::answer Show the answer
:::say Short answer
Neither failure was the engine's. The first was a provider that does not run on the host, not retryable, fixed by a different tool. The second was a wrong argument, retryable after the argument changes, and the Ghidra process stayed up and served the next call in the same session. The eleven restarts bought nothing and cost an import each.
:::

**Walkthrough**

1. **Read code, category and retryable first.** Every rea error carries `code`, `category`, `message`, `retryable` and `remediation`. The code is the discriminator, one of twenty. The category is one of ten and names the kind of problem. The flag says whether the same call can succeed later. The message is for a person. A wrapper branches on the first two fields and the flag, never on the message text.
2. **Read the CLI failure.** The command record shows `inspect-binary-layout` on the object file, exit 1 after 0.6 s. The envelope has code `capability_unavailable`, category `unsupported_provider`, and `retryable: false`. The details name the provider `pwntools-elf` and the operation. That provider runs on one platform, Linux x64, and the pipeline runs on a Mac. The engine never ran. The right next call is another provider or another host, and the manual uses `inspect-macho` as the layout tool on this machine. No restart can change a provider that does not run here.
3. **Read the MCP failure.** The session index shows the call before and the call after both completed on the same open target, and the failed call took 4 ms. The decoded error has code `invalid_request`, category `invalid_input`, and `retryable: true`. The one issue in the details says that the procedure name is unknown. The flag means that a corrected call can succeed on the same connection. A retry with the same name returns the same error, so the argument has to change, and `list_procedures` gives the names that exist.
4. **Read the diagnostics.** `failure_output` holds the stdout and stderr that Ghidra wrote during the failed request: both empty, with `complete: true`. The remote code is `not_found`. An empty, complete output with a remote code says that the engine answered the question and the answer was no. The server log agrees: two lines at level 40, one for the bridge layer and one for the server layer, with a duration of 2.73 ms, and the next line is `close_binary` with status `ok`. The engine was healthy before, during and after.
5. **Place the restart.** A restart answers a different family of codes: `provider_unavailable`, `provider_timeout`, and an `execution_failure` whose diagnostics show incomplete output. The manual names `provider_timeout` as the code of a first Ghidra-backed call that passes the startup deadline of 330,000 ms, and `target_unavailable` as the code of every provider tool before `open_binary`. Neither appeared in these two failures.

**Resolution**

Neither failure was the engine's. The first was a provider that does not run on the host, not retryable, fixed by a different tool. The second was a wrong argument, retryable after the argument changes, and the Ghidra process stayed up and served the next call in the same session. The eleven restarts bought nothing and cost an import each.

The wrapper now reads `category` and `retryable` before anything else. `unsupported_provider` and `unsupported_target` route to a different provider or host and stop. `invalid_input` corrects the argument from a listing and retries once. `unavailable`, `timeout` and an `execution_failure` with incomplete output restart the engine, with a bound on the count. Everything else is reported to a person with the message and the remediation. After the change, the next night ran with no restart, and the two failures became one line each in the report.

**Wrong turns**

- "Exit 1 means the engine crashed; restart it." The envelope says `unsupported_provider`, not retryable. The provider never started, and a restart starts nothing new.
- "retryable is true, so retry the same call." The flag says that the call can succeed later, after the input changes. The same unknown name gets the same answer.
- "Match the message text to decide the branch." Messages are written for people and can change between releases. The code, the category and the flag are the contract.
- "Any level 40 line in the server log means the bridge is unhealthy." Both lines record one failed request that completed in 2.73 ms, and the next line records a successful call on the same connection.

**Generalize**

An error envelope is a typed answer, and a retry policy that ignores its type turns every failure into the most expensive one. Read the discriminator and the retryable flag, keep a table from category to action, and look at the diagnostics for proof that the engine was alive before you restart it. The cheapest fix for most failures is a changed input, and the most expensive is a cold start, so the policy must tell them apart.

:::

## A card that said production

*Level 3 · incident · about 25 minutes · version: A2A 1.0.1 with the manual's capture kit (the test-runner, code-reviewer and deployer agents); model: no model; the agents are deterministic fixtures; hardware: one machine, localhost, no network*

A planner builds its plan from the agent cards it fetches at startup. The cards pass through a caching proxy that another team runs, and the planner reads each card as a trusted description of what the agent will do. One morning the planner delegated the release step as `Deploy build 2026.10.06-1 to production`, because the copy of the deployer card it held described an agent that ships tagged builds to production. The deployer refused. The release stalled, and the on-call engineer found that the copy on the proxy differed from the card the agent serves in one word.

The deployer card carries a signature. Nobody on the planner team had looked at it. The card loader parsed the JSON, dropped the fields it did not know, and planned. You have the published card, the agent's own answer to an authenticated card request, the refusal, and the kit's record of canonicalizing, signing and verifying the card, with a check on a copy whose description names production.

**Evidence: the skills and the signature of the published deployer card**

```text
title: the skills and the signature of the published deployer card
source: manuals/a2a-101/capture/out/01-agent-cards.http
lines: 181-200
lang: text
note: Read where the skill says the build goes, then the two fields of the signature entry.
---
  "skills": [
    {
      "id": "deploy",
      "name": "Deploy a build",
      "description": "Deploy one tagged build to staging, with operator approval.",
      "tags": [
        "deploy",
        "staging"
      ],
      "examples": [
        "Deploy build 2026.10.06-1 to staging"
      ]
    }
  ],
  "signatures": [
    {
      "protected": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpPU0UiLCJraWQiOiJkZXBsb3llci1rZXktMSJ9",
      "signature": "yPk834ji_dOVmxElhzV3yTYBT9NVp8Bx1j5K0LQmOww"
    }
  ]

```

**Evidence: what the deployer itself says to an authenticated caller**

```text
title: what the deployer itself says to an authenticated caller
source: manuals/a2a-101/capture/out/18-extended-card.http
lines: 40-48
lang: text
note: Compare this description with the one the planner acted on.
---
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "name": "deployer",
    "description": "Deploys a tagged build to staging after an operator approves it.",

```

**Evidence: the canonical payload and the decoded protected header**

```text
title: the canonical payload and the decoded protected header
source: manuals/a2a-101/capture/out/17-signed-card.txt
lines: 1-5
lang: text
note: Line 2 is the whole card without its signatures, keys sorted, no spaces. Read the description inside it and the alg in the header.
---
# 1. canonical payload (RFC 8785): the card without signatures, keys sorted, no spaces
{"capabilities":{"extendedAgentCard":true,"streaming":true},"defaultInputModes":["text/plain"],"defaultOutputModes":["text/plain","application/json"],"description":"Deploys a tagged build to staging after an operator approves it.","name":"deployer","provider":{"organization":"Platform Team","url":"https://deploy.example.com"},"securityRequirements":[{"schemes":{"bearer":{"list":[]}}}],"securitySchemes":{"bearer":{"httpAuthSecurityScheme":{"description":"A token issued by the platform team.","scheme":"Bearer"}}},"skills":[{"description":"Deploy one tagged build to staging, with operator approval.","examples":["Deploy build 2026.10.06-1 to staging"],"id":"deploy","name":"Deploy a build","tags":["deploy","staging"]}],"supportedInterfaces":[{"protocolBinding":"JSONRPC","protocolVersion":"1.0","url":"http://localhost:41243/a2a/jsonrpc"},{"protocolBinding":"HTTP+JSON","protocolVersion":"1.0","url":"http://localhost:41243/a2a/rest"}],"version":"1.4.1"}

# 2. protected header, decoded
{"alg": "HS256", "typ": "JOSE", "kid": "deployer-key-1"}

```

**Evidence: the three rules a verifier follows to rebuild the signed bytes**

```text
title: the three rules a verifier follows to rebuild the signed bytes
source: manuals/a2a-101/sections/2-3-extended-cards-and-signatures.md
lines: 67-71
lang: text
note: Rule 3 says what the signature cannot cover.
---
Each entry holds a base64url `protected` header and `signature` {{proto AgentCardSignature}}, and a verifier rebuilds the signed bytes from the received card under three rules {{spec §8.4.1}}:

1. **Field presence.** A field marked `REQUIRED` must always be present, even when its value is the default {{spec §8.4.1}}. A field with the `optional` keyword stays whenever it was set, and any other field at its default value is dropped.
2. **RFC 8785.** The JSON Canonicalization Scheme sorts object keys, fixes one form for each value, and removes whitespace {{spec §8.4.1}}.
3. **No signatures.** The `signatures` field must be left out of the signed content, because a signature cannot cover itself {{spec §8.4.1}}.

```

**Evidence: the published signature entry and two verification results**

```text
title: the published signature entry and two verification results
source: manuals/a2a-101/capture/out/17-signed-card.txt
lines: 10-17
lang: text
note: The last two lines are the checks: the card as published, and a copy with one word changed.
---
# 4. the signature entry published in the card
{
  "protected": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpPU0UiLCJraWQiOiJkZXBsb3llci1rZXktMSJ9",
  "signature": "yPk834ji_dOVmxElhzV3yTYBT9NVp8Bx1j5K0LQmOww"
}

# 5. verify the published card: True
# 6. verify after changing the description to name production: False

```

**Evidence: when a client verifies, and with which algorithms**

```text
title: when a client verifies, and with which algorithms
source: manuals/a2a-101/sections/2-3-extended-cards-and-signatures.md
lines: 120-120
lang: text
note: One sentence on the order of operations, one on the key, one on the algorithm list.
---
A client should verify at least one signature before it trusts an Agent Card {{spec §8.4.3}}, and never with an expired or revoked key. Give your verifier an explicit list of allowed algorithms, as the reference SDK does, to prevent algorithm confusion attacks {{sdk src/a2a/utils/signing.py}}. [Security requirements](#s-security-requirements) covers card spoofing.

```

**Evidence: what the deployer answers to a production deploy**

```text
title: what the deployer answers to a production deploy
source: manuals/a2a-101/capture/out/08-rejected.http
lines: 27-54
lang: text
note: Read the state and the agent's message inside it.
---

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "task": {
      "id": "23cf3710-c193-457d-93d1-e93e1c860a53",
      "contextId": "cf08459c-e7bd-4736-92d7-2fe3f6e7a1f6",
      "status": {
        "state": "TASK_STATE_REJECTED",
        "message": {
          "messageId": "12b263fc-78eb-4b49-997f-e495cca7813c",
          "contextId": "cf08459c-e7bd-4736-92d7-2fe3f6e7a1f6",
          "taskId": "23cf3710-c193-457d-93d1-e93e1c860a53",
          "role": "ROLE_AGENT",
          "parts": [
            {
              "text": "Production deploys are outside this agent's policy. Use the release train."
            }
          ]
        },
        "timestamp": "2026-10-06T09:00:01.750Z"
      },
      "history": [
        {
          "messageId": "6018366c-f658-47a7-9ed3-4fe53a096533",
          "contextId": "cf08459c-e7bd-4736-92d7-2fe3f6e7a1f6",
          "taskId": "23cf3710-c193-457d-93d1-e93e1c860a53",

```

**Questions**

1. What does the published card say the deployer does, and what did the agent say when asked with a token?
2. What does the signature cover, and what does it leave out?
3. One check returned True and the other False. What changed between the two, and why does one word matter?
4. Why does the kit sign with HS256, and why is that not acceptable for a real deployment?
5. Where in the planner's startup does verification belong, and what happens when it fails?
6. The deployer refused the production deploy. Why is that refusal not the defense?

:::answer Show the answer
:::say Short answer
The planner trusted an unverified copy of a signed document. The loader now verifies at least one signature before it reads any field for planning. It rebuilds the canonical bytes under the three rules, takes the key for the `kid` from a trusted store, and allows only the algorithms the team lists. A card that fails the check is rejected and raises an alert, and the planner does not fall back to its content. For an authenticated session, the planner also replaces the cached public card with the extended card that the agent itself returns. The kit's record is the proof of the mechanism: True on the published bytes, False on the same card with one word changed, and the agent's own description agrees with the published one.
:::

**Walkthrough**

1. **Read the published card.** The skill is `Deploy a build`, and its description says one tagged build to staging with operator approval. Its tags are `deploy` and `staging`, and its example is a staging deploy. Below the skills sits a `signatures` list with one entry: a `protected` header and a `signature`. The extended card, returned only to a caller with a bearer token, describes the same agent: it deploys to staging after an operator approves. The proxy copy alone named production.
2. **Read the canonical payload.** It is the card without its signatures, with keys sorted and no spaces, as RFC 8785 defines. The description inside it says staging. The decoded header gives `alg` HS256, `typ` JOSE and `kid` deployer-key-1. The signing input joins the base64url header and the base64url payload with a period.
3. **Read the three rules.** A verifier rebuilds those bytes from the card it received. A REQUIRED field is always present, even at its default. The JSON Canonicalization Scheme fixes the order and the form of every value. The `signatures` field stays out, because a signature cannot cover itself. So the signature binds every other field, the description among them.
4. **Read the two checks.** On the published card the check returns True. On the altered copy, where the word staging became production, the canonical bytes differ, and the check returns False. One changed word changes the signed bytes, and the signature no longer matches. This is the test that the planner never ran.
5. **Read the algorithm line.** The kit signs with HS256 because its standard library has no ECDSA. HS256 is an HMAC, so a verifier holds the signing key and could sign a card itself. Real cards use ES256 or RS256, with the public key published in a JWKS and fetched by `kid` and `jku` or taken from a trusted store. Verification has six MUST steps, and a client verifies at least one signature before it trusts a card, never with an expired or revoked key, and with an explicit list of allowed algorithms.
6. **Read the refusal.** The deployer answered `TASK_STATE_REJECTED` and said that production deploys are outside its policy. That policy sits in the agent, and it caught this case. The card also names the interface URL the planner sends to. A copy that can change one word can change that field, and then the request goes to a server the attacker runs, where no policy refuses anything.

**Resolution**

The planner trusted an unverified copy of a signed document. The loader now verifies at least one signature before it reads any field for planning. It rebuilds the canonical bytes under the three rules, takes the key for the `kid` from a trusted store, and allows only the algorithms the team lists. A card that fails the check is rejected and raises an alert, and the planner does not fall back to its content. For an authenticated session, the planner also replaces the cached public card with the extended card that the agent itself returns. The kit's record is the proof of the mechanism: True on the published bytes, False on the same card with one word changed, and the agent's own description agrees with the published one.

**Wrong turns**

- "Pin the proxy cache and move on." The card is still unverified. The next edit passes the same way.
- "Compare the description with the version we saw last week." The `version` field is inside the signed payload, and an edited copy keeps it. Only the signature binds the fields together.
- "Verify with whatever algorithm the header names." A header is part of the input. Give the verifier an explicit list, so that a changed `alg` cannot pick a weaker check.
- "The deployer refused, so the system is safe." The refusal came from the honest agent at the published URL. A changed card can also change the URL, and the honest agent never sees the request.
- "Fetch the extended card instead, it needs a token." The extended card is a fuller card for an authenticated caller, and it comes back without signatures. It helps once the planner trusts the agent it talks to, and the public card's signature is what earns that trust.

**Generalize**

Anything an agent reads from the network is input, not truth, and the metadata that describes other agents is the input with the most leverage. Verify the integrity of such a document before you plan on it, with a key that did not travel with the document, and treat a policy check at the far end as a second layer, never the first.

:::

## A dead rollout engine and a watchdog that kills

*Level 3 · incident · about 25 minutes · version: Miles main 08752a12 with its own SGLang 0.5.22 build; model: Qwen/Qwen3-0.6B; hardware: one GB10 with 128 GB of unified memory*

A team runs GRPO on one GB10 and leaves a run alone for an hour. When they come back, the GPU is idle, the container is still running, and the log has grown to 147 MB. No failure appeared in the output of the run. The rollout engine had been started with an attention setting that this GPU cannot run, and it stopped during startup. The trainer did not stop: it went on sending requests to the dead engine.

The team writes a watchdog. Every 30 seconds it counts the `503 Service Unavailable` lines of the last 60 seconds and, when it finds more than 100 such lines in six checks in a row, it stops the container. The next day the watchdog stops a healthy run that generated 16 answers per prompt, in the middle of its steps. The team now distrusts both the run and the watchdog.

**Evidence: the engine failure and the first and last error from the trainer side**

```text
title: the engine failure and the first and last error from the trainer side
source: manuals/miles-101/capture/gpu/out-gb10/engine-died-503.log
lang: text
note: Read the three engine lines first, then compare the timestamps of the last two lines.
---
[2026-10-17 21:03:03] Enable deterministic inference because of legacy rl_on_policy_target.
AssertionError: FlashAttention v3 Backend requires SM>=80 and SM<=90. Please use `--attention-backend flashinfer`.
[2026-10-17 21:03:24] Received sigquit from a child process. It usually means the child failed.
[2026-10-17 21:03:30.637 rollout_executor] http_utils.py:241 - Error: Server error '503 Service Unavailable' for url 'http://172.17.0.3:20035/generate'
[2026-10-17 22:06:46.137 rollout_executor] http_utils.py:241 - Error: Server error '503 Service Unavailable' for url 'http://172.17.0.3:20035/generate'

```

**Evidence: how many error lines the run wrote**

```text
title: how many error lines the run wrote
source: manuals/miles-101/capture/gpu/out-gb10/engine-died-count.txt
lines: 1-2
lang: console
note: One grep over the full log of the failed run.
---
$ grep -c "503 Service Unavailable" true-on-policy-fa3.log
200533

```

**Evidence: the quietest and the busiest minutes of the dead run**

```text
title: the quietest and the busiest minutes of the dead run
source: manuals/miles-101/capture/gpu/out-gb10/503-bursts.txt
lines: 36-40
lang: console
note: The first two rows are the partial first and last minutes, the last two are full minutes.
---
$ grep "503 Service Unavailable" true-on-policy-fa3.log | grep -o "20[0-9][0-9]-[0-9-]* [0-9][0-9]:[0-9][0-9]" | sort | uniq -c | sort -n | sed -n "1,3p;\$p"
   1838 2026-10-17 21:03
   2281 2026-10-17 22:06
   2669 2026-10-17 21:58
   3719 2026-10-17 21:11

```

**Evidence: the first fifteen minutes of errors in a run that finished every step**

```text
title: the first fifteen minutes of errors in a run that finished every step
source: manuals/miles-101/capture/gpu/out-gb10/503-bursts.txt
lines: 41-56
lang: console
note: Look for the gaps between the minutes, and for the largest count in one minute.
---
$ grep "503 Service Unavailable" e2-n16.log | grep -o "20[0-9][0-9]-[0-9-]* [0-9][0-9]:[0-9][0-9]" | sort | uniq -c
    286 2026-10-22 07:16
    271 2026-10-22 07:17
    686 2026-10-22 07:28
    882 2026-10-22 07:29
     18 2026-10-22 07:30
     61 2026-10-22 07:38
    192 2026-10-22 07:39
     67 2026-10-22 07:40
   1124 2026-10-22 07:51
     84 2026-10-22 07:52
     90 2026-10-22 07:53
   1044 2026-10-22 08:04
    134 2026-10-22 08:14
    572 2026-10-22 08:15
    842 2026-10-22 08:25

```

**Evidence: the watchdog against two containers that print the error on purpose**

```text
title: the watchdog against two containers that print the error on purpose
source: manuals/miles-101/capture/gpu/out-gb10/watchdog-test.txt
lang: console
note: The first container never stops printing, the second prints in three bursts of one minute.
---
$ docker run -d --rm --name wd-dead busybox:latest sh -c 'while true; do echo "Error: Server error 503 Service Unavailable for url http://x/generate"; sleep 0.1; done'
$ sh capture/gpu/watchdog.sh wd-dead 100
2026-10-22T15:41:09Z wd-dead: more than 100 errors from the rollout engine in each of 6 checks, last 578 in 60 s, stopping the run
wd-dead
$ echo $?
1
time from start to stop: 183 s

$ docker run -d --rm --name wd-burst busybox:latest sh -c 'for r in 1 2 3; do end=$(( $(date +%s) + 60 )); while [ $(date +%s) -lt $end ]; do echo "Error: Server error 503 Service Unavailable for url http://x/generate"; sleep 0.1; done; sleep 120; done'
$ sh capture/gpu/watchdog.sh wd-burst 100
2026-10-22T15:47:10Z wd-burst: the run ended
$ echo $?
0
time from start to end: 541 s

```

**Evidence: the watchdog rule replayed on the real error times of the healthy run**

```text
title: the watchdog rule replayed on the real error times of the healthy run
source: manuals/miles-101/capture/gpu/out-gb10/503-bursts.txt
lines: 96-101
lang: console
note: Read the second column for each number of checks, then the last column.
---
$ python3 watchdog_replay.py out-gb10/e2-n16-503-per-second.txt
healthy run: 22357 errors from 2026-10-22 07:16:29, checks every 30 s over the last 60 s, limit 100
checks  healthy offsets stopped  most checks in a row  dead engine stopped after
     6  17 of 30                    6                     153 to 182 s
     8   0 of 30                    6                     213 to 242 s
    10   0 of 30                    6                     273 to 302 s

```

**Questions**

1. The trainer never failed. Which component returned the 503, and why did the trainer treat it as something to retry?
2. A count of errors alone cannot separate the dead run from the healthy one. Which property can, and how do you write it as a rule?
3. Replay the six-check rule on the healthy run. Why did it fire, and in how many of the 30 start offsets?
4. Pick the number of checks. What does each extra check cost when the engine really is dead?
5. The script exits with 0, 1 or 2. What should a queue of runs do with each code?
6. On a cluster of many GPUs you would not run this script. What replaces it, and what did the fault tolerance of the version we ran not cover?

:::answer Show the answer
:::say Short answer
The engine died because of a backend assertion, and the run did not notice because a 503 looks like a busy engine to the client. The fix for the run is to read the engine lines above the first error and change the attention backend, as the assertion message says.
:::

**Walkthrough**

Read the first listing from the top. The engine enabled deterministic inference for the on-policy target, then an assertion stopped it: the FlashAttention v3 backend needs an SM between 80 and 90, and the GB10 is outside that range. The parent received a SIGQUIT from the child. From that moment the trainer's rollout executor logged `503 Service Unavailable` from the router at `172.17.0.3:20035`. The router is the small service that forwards each rollout request to an engine, and 503 is what it returns when no engine can take the request. The client retries a 503, because a busy engine returns it too. The last two lines are 63 minutes apart, from 21:03 to 22:06, and the second listing counts 200,533 such lines in that log.

The third and fourth listings compare the two runs minute by minute. The dead run never went quiet. Its two partial minutes held 1,838 and 2,281 errors, and every full minute held at least 2,669, up to 3,719. The healthy 16-answer run logged 22,357 errors in total, but in bursts: 286 and 271 in the first two minutes, nothing for ten minutes, then 686 and 882, then 18. One minute reached 2,209. The client retried each request and the run finished all its steps. A count alone cannot tell these two runs apart. The time can. A dead engine produces errors in every window, a busy engine produces them in bursts with gaps.

The watchdog turns that into a rule: every 30 s, count the errors of the last 60 s, and stop only once the count has stayed above 100 for a set number of checks in a row. The fifth listing tests it on two containers with no GPU. A container that prints ten error lines a second was stopped after 183 s with six checks, and the script exited with 1. A container that prints for 60 s and then stays quiet for two minutes, three times over, ran to its end after 541 s, and the script exited with 0.

The last listing shows why six checks was still wrong. Replayed on the real error times of the healthy run, for each of the 30 possible start offsets of the checks, six checks stopped the run in 17 of 30 cases. Two bursts came 45 s apart, so the 60 s window held errors for six consecutive checks. No offset reached more than six checks in a row. With eight checks the rule stopped the healthy run in 0 of 30 cases, and with ten checks also 0 of 30. The cost is time on a dead engine: 153 to 182 s at six checks, 273 to 302 s at ten.

**Resolution**

The engine died because of a backend assertion, and the run did not notice because a 503 looks like a busy engine to the client. The fix for the run is to read the engine lines above the first error and change the attention backend, as the assertion message says.

The fix for the watchdog is the number of checks. Set it to 10, because a healthy run did not reach more than 6 checks in a row and 8 or 10 stopped it in 0 of 30 replays, while a dead engine is still stopped in about five minutes. Keep the limit at 100 errors per 60 s window and the check every 30 s. Test the script on the two fake containers before you trust it, and keep the replay against a real healthy log, because the fake burst container has quiet gaps of two minutes, longer than the real gaps of 45 s.

Give the exit codes meaning. Exit 1 means the watchdog stopped the run, so a queue skips to the next run and keeps the log. Exit 0 means the run ended on its own. Exit 2 means the watchdog lost its view of the containers, so the run has no guard and a person must look.

**Wrong turns**

- "Alert when the count of 503 lines in a minute is high." A healthy run logged 2,209 in one minute and finished every step. The count fires on bursts, the time between bursts is the signal.
- "Six checks in a row is enough, the test passed." The test container paused for two minutes between bursts. The real run had bursts 45 s apart, and the replay on its real times fired in 17 of 30 cases.
- "Raise the limit until the healthy run passes." The largest healthy minute held 2,209 errors and the quietest full minute of the dead run 2,669. A limit between them fits this pair of runs only, and a slower dead engine or a busier healthy run breaks it. The time rule does not depend on the rate.
- "Turn on fault tolerance instead of a script." On one GPU a dead engine means a dead run. In the version we ran, rollout fault tolerance did not work with a dedicated eval fleet or with the fully async colocated layout, and without it the trainer keeps sending requests to a dead engine and never fails.
- "Let the watchdog restart the engine." The script only stops the run. The cause is in the engine lines above the first error, and a restart with the same setting fails the same way.

**Generalize**

A component that retries forever turns a dead dependency into a silent hang, and the only honest signal is time, not count. Build the alarm from the duration of the error condition, replay the rule on the logs of real healthy runs before you trust it, and give the alarm an exit code that a queue can act on. Then read the first error, not the last, because the cause sits above the noise.

:::

## A dropped stream ran the suite twice

*Level 3 · incident · about 25 minutes · version: A2A 1.0.1 with the manual's capture kit (the test-runner, code-reviewer and deployer agents); model: no model; the agents are deterministic fixtures; hardware: one machine, localhost, no network*

A planner watches a long test suite through a stream from the `test-runner` agent. A load balancer sits between them and closes connections that stay open for long. The planner's stream handler came from a REST client, and it has one rule for a connection that drops before the final frame: send the request again. Yesterday the suite of `payments-api` ran twice for every drop. The CI bill doubled, and a flaky test that passed in the first run failed in the second and blocked a release.

A teammate patched the handler to call `SubscribeToTask` after a drop and to retry that call on any error. The next time the task had already finished when the handler reconnected, the call returned an error, and the handler logged "this server does not support subscriptions" and turned streaming off for the agent. You have the capture of the same sequence: a stream that the client closes after four frames, the call that picks it up, and a third call after the end.

**Evidence: the first stream, four frames, then the client closes the connection**

```text
title: the first stream, four frames, then the client closes the connection
source: manuals/a2a-101/capture/out/14-resubscribe.http
lines: 25-36
lang: text
note: Each data line is one complete frame. Read the state in frame 1 and 2, the artifact in frames 3 and 4, and the last line.
---
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"jsonrpc": "2.0", "id": 1, "result": {"task": {"id": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "status": {"state": "TASK_STATE_SUBMITTED", "timestamp": "2026-10-06T09:00:04.000Z"}, "history": [{"messageId": "c15521b1-b3dc-450a-9daa-37e51b591d75", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "role": "ROLE_USER", "parts": [{"text": "Run the full suite for payments-api at commit 9f3c2e1"}]}]}}}

data: {"jsonrpc": "2.0", "id": 1, "result": {"statusUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "status": {"state": "TASK_STATE_WORKING", "message": {"messageId": "47206245-9085-4c5c-9899-3f2b41a7a980", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "role": "ROLE_AGENT", "parts": [{"text": "Checking out 9f3c2e1 and starting the suite"}]}, "timestamp": "2026-10-06T09:00:04.250Z"}}}}

data: {"jsonrpc": "2.0", "id": 1, "result": {"artifactUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "artifact": {"artifactId": "test-log", "name": "test-log.txt", "parts": [{"text": "tests/test_suite_01.py ........\n"}]}}}}

data: {"jsonrpc": "2.0", "id": 1, "result": {"artifactUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "artifact": {"artifactId": "test-log", "parts": [{"text": "tests/test_suite_02.py ........\n"}]}, "append": true}}}

# the client closes the connection after 4 events

```

**Evidence: the request that picks the stream back up**

```text
title: the request that picks the stream back up
source: manuals/a2a-101/capture/out/14-resubscribe.http
lines: 38-52
lang: text
note: Compare the method and the params with the first request. There is no message here.
---
### 2 · SubscribeToTask: pick the stream back up
POST /a2a/jsonrpc HTTP/1.1
Host: localhost:41241
Content-Type: application/json
A2A-Version: 1.0
Accept: text/event-stream

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "SubscribeToTask",
  "params": {
    "id": "25239d4c-798b-4754-be06-d1f94d0645b1"
  }
}

```

**Evidence: the second stream, six frames to the end**

```text
title: the second stream, six frames to the end
source: manuals/a2a-101/capture/out/14-resubscribe.http
lines: 54-67
lang: text
note: Read the member of frame 1, the test file names in frames 2 to 5, and the state in frame 6.
---
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"jsonrpc": "2.0", "id": 2, "result": {"task": {"id": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "status": {"state": "TASK_STATE_WORKING", "message": {"messageId": "47206245-9085-4c5c-9899-3f2b41a7a980", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "role": "ROLE_AGENT", "parts": [{"text": "Checking out 9f3c2e1 and starting the suite"}]}, "timestamp": "2026-10-06T09:00:04.250Z"}, "history": [{"messageId": "c15521b1-b3dc-450a-9daa-37e51b591d75", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "role": "ROLE_USER", "parts": [{"text": "Run the full suite for payments-api at commit 9f3c2e1"}]}], "artifacts": [{"artifactId": "test-log", "name": "test-log.txt", "parts": [{"text": "tests/test_suite_01.py ........\n"}, {"text": "tests/test_suite_02.py ........\n"}, {"text": "tests/test_suite_03.py ........\n"}, {"text": "tests/test_suite_04.py ........\n"}]}]}}}

data: {"jsonrpc": "2.0", "id": 2, "result": {"artifactUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "artifact": {"artifactId": "test-log", "parts": [{"text": "tests/test_suite_05.py ........\n"}]}, "append": true}}}

data: {"jsonrpc": "2.0", "id": 2, "result": {"artifactUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "artifact": {"artifactId": "test-log", "parts": [{"text": "tests/test_suite_06.py ........\n"}]}, "append": true}}}

data: {"jsonrpc": "2.0", "id": 2, "result": {"artifactUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "artifact": {"artifactId": "test-log", "parts": [{"text": "tests/test_suite_07.py ........\n"}]}, "append": true}}}

data: {"jsonrpc": "2.0", "id": 2, "result": {"artifactUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "artifact": {"artifactId": "test-log", "parts": [{"text": "tests/test_suite_08.py ........\n"}]}, "append": true, "lastChunk": true}}}

data: {"jsonrpc": "2.0", "id": 2, "result": {"statusUpdate": {"taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "status": {"state": "TASK_STATE_COMPLETED", "message": {"messageId": "b9264586-875b-4914-992a-7a26235a16ba", "contextId": "ed92749e-5686-4e20-a1cf-d3b2aee3b1da", "taskId": "25239d4c-798b-4754-be06-d1f94d0645b1", "role": "ROLE_AGENT", "parts": [{"text": "96 passed"}]}, "timestamp": "2026-10-06T09:00:04.500Z"}}}}

```

**Evidence: the artifact inside the first frame of the second stream**

```text
title: the artifact inside the first frame of the second stream
source: manuals/a2a-101/capture/out/14-resubscribe.events.json
lines: 137-157
lang: text
note: Count the parts and compare them with the two the first stream carried.
---
            "artifacts": [
              {
                "artifactId": "test-log",
                "name": "test-log.txt",
                "parts": [
                  {
                    "text": "tests/test_suite_01.py ........\n"
                  },
                  {
                    "text": "tests/test_suite_02.py ........\n"
                  },
                  {
                    "text": "tests/test_suite_03.py ........\n"
                  },
                  {
                    "text": "tests/test_suite_04.py ........\n"
                  }
                ]
              }
            ]
          }

```

**Evidence: a third SubscribeToTask after the task completed, status and code**

```text
title: a third SubscribeToTask after the task completed, status and code
source: manuals/a2a-101/capture/out/14-resubscribe.http
lines: 85-95
lang: text
note: Read the content type and the code.
---
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32004,
    "message": "This operation is not supported",
    "data": [
      {

```

**Evidence: the detail inside that error**

```text
title: the detail inside that error
source: manuals/a2a-101/capture/out/14-resubscribe.http
lines: 97-105
lang: text
note: The reason and the state in the metadata.
---
        "reason": "UNSUPPORTED_OPERATION",
        "domain": "a2a-protocol.org",
        "metadata": {
          "taskId": "25239d4c-798b-4754-be06-d1f94d0645b1",
          "state": "TASK_STATE_COMPLETED"
        }
      }
    ]
  }

```

**Evidence: what a repeated messageId does on every implementation**

```text
title: what a repeated messageId does on every implementation
source: manuals/a2a-101/sections/3-1-message.md
lines: 84-84
lang: text
note: Read the last sentence.
---
Send Message operations are allowed to be idempotent, and an agent can use the `messageId` to find duplicate messages {{spec §3.3.1}}. So a retry of a send that timed out can reuse the same `messageId`. No SDK rejects a repeated id, and without a `taskId` each one creates another task for it.

```

**Questions**

1. After the first stream closes at frame four, what has happened to the task, and what happens to the events the agent emits next?
2. What differs between the two requests, and why does one of them create work while the other does not?
3. What does the first frame of the second stream hold, and how does a client merge it with what it already has?
4. The third call returns an error. What does it mean, and what is the next call?
5. Does a repeated messageId protect the planner here? Why or why not?

:::answer Show the answer
:::say Short answer
The reconnect rule caused the double run. A `SendStreamingMessage` is a command plus a view, and resending the command repeats the work. The fix has four parts. A closed connection ends the reading and nothing else. If the last frame was not a terminal state, the handler calls `SubscribeToTask` with the task id. It rebuilds its copy from the `task` snapshot in the first frame and appends what follows. On -32004 it stops reconnecting and calls `GetTask`. The capture is the proof: one task id runs through both streams, the resumed stream delivers the four missing files and the final `96 passed`, and the agent ran the suite once.
:::

**Walkthrough**

1. **Read the first stream.** Four frames arrive: a `task` in `TASK_STATE_SUBMITTED`, a `statusUpdate` to `TASK_STATE_WORKING`, an `artifactUpdate` that opens `test-log.txt` with the first test file, and an `artifactUpdate` that appends the second file. Then the kit's note says that the client closed the connection. No frame carried a terminal state, so the task is alive. The lifecycle of a task does not depend on any one stream. The agent goes on and appends two more files to its stored artifact, and those events have no open connection to travel on.
2. **Read the second request.** The method is `SubscribeToTask`, and the params hold only the task id. There is no message and no `messageId`. This call opens a view on work that exists and creates nothing. The planner's old handler sent a new `SendStreamingMessage` instead, and a message without a `taskId` starts a new task every time.
3. **Read the second stream.** Frame 1 is a complete `task` object, still in `TASK_STATE_WORKING`. Its `test-log` artifact already holds four parts, `test_suite_01` to `test_suite_04`, which includes the two files the first stream never carried. Frames 2 to 5 append `test_suite_05` to `test_suite_08`, and the last one sets `lastChunk`. Frame 6 is a `statusUpdate` to `TASK_STATE_COMPLETED` with `96 passed`. Nothing is replayed, and the protocol has no cursor. The client replaces its partial log with the snapshot's artifact and then appends the frames that follow.
4. **Read the third call.** The reply has `Content-Type: application/json`, not an event stream. It is an `error` with code -32004 and the reason `UNSUPPORTED_OPERATION`, and the metadata names the state `TASK_STATE_COMPLETED`. This is the terminal-task case of that code, not a missing feature. The client stops reconnecting and reads the final task with `GetTask`.
5. **Check the id rule.** A retry of a send whose reply never came may reuse the same `messageId`. No implementation rejects a repeated id, and without a `taskId` each copy creates another task. So the id protects the planner only against a send that may not have arrived. Here the task exists, the client holds its id, and the right call is a subscribe, not a send.

**Resolution**

The reconnect rule caused the double run. A `SendStreamingMessage` is a command plus a view, and resending the command repeats the work. The fix has four parts. A closed connection ends the reading and nothing else. If the last frame was not a terminal state, the handler calls `SubscribeToTask` with the task id. It rebuilds its copy from the `task` snapshot in the first frame and appends what follows. On -32004 it stops reconnecting and calls `GetTask`. The capture is the proof: one task id runs through both streams, the resumed stream delivers the four missing files and the final `96 passed`, and the agent ran the suite once.

**Wrong turns**

- "On a drop, send the request again." The request carries a message, and a message without a task id starts a new task. The suite runs again.
- "Resend with the same messageId, and the server will drop the duplicate." Duplicate detection is optional, no implementation rejects a repeated id, and each copy without a task id makes a new task.
- "The connection closed, so the task is finished." Only a terminal state in a frame ends a task. The kit also closes at an input request, and servers differ on when they close. Call `GetTask` after any close.
- "-32004 means this server has no SubscribeToTask." The metadata names the completed state. The result is one `GetTask` away.
- "Append the new frames to the old partial log." Two files were written while no connection was open. The snapshot holds them, so replace the copy first and append after.

**Generalize**

Keep the work and the view of the work apart. A command that creates work must go out once, and a reconnect must open a view by the id of the work, never repeat the command. Resume from a snapshot that the server owns, and let a terminal state in the data, not the end of a connection, tell you that the work is done.

:::

## A flaky agent check that compared the wrong sessions

*Level 3 · incident · about 25 minutes · version: docker-agent v1.149.0 and sbx v0.47.0; model: a recorded cassette of ai/qwen3:4b, replayed with no model; hardware: one Mac, no GPU*

A team keeps a small agent that lists the files of a repository and counts lines. Every change to its agent file goes through a check: run the agent, then compare the newest session with the one before it with `sessions diff`, and fail the job when the two differ. In one week the check gave three different results. Once it printed `Error: unknown shorthand flag: '1' in -1`. Once it passed. Once it failed with `sessions diverged` and a first divergence at turn 0, where one side called `list_directory` and the other side called `shell`.

The team reads the three results as proof that the agent is nondeterministic, and a pull request proposes to delete the check. You have the command lines, the outputs of the three comparisons, and the session store of the machine that ran them.

**Evidence: two runs of the files agent from the same cassette**

```text
title: two runs of the files agent from the same cassette
source: manuals/docker-sandboxes-101/capture/out/21-two-runs.txt
lines: 1-7
lang: console
note: Same flags, same cassette, same answer.
---
$ docker-agent run --exec --last --working-dir fixtures/repo --fake work/cassettes/18-files fixtures/agents/files.yaml 'List the files in the working directory.' 'How many lines does README.md have? Count them with a shell command.'
README.md has 1 line.
[exit 0]

$ docker-agent run --exec --last --working-dir fixtures/repo --fake work/cassettes/18-files fixtures/agents/files.yaml 'List the files in the working directory.' 'How many lines does README.md have? Count them with a shell command.'
README.md has 1 line.
[exit 0]

```

**Evidence: the transcript that the cassette replays**

```text
title: the transcript that the cassette replays
source: manuals/docker-sandboxes-101/capture/out/18-transcript.txt
lines: 1-12
lang: text
note: Count the model replies: each one is a turn for the comparison.
---
user: List the files in the working directory.
root -> tool_call list_directory {"path": "."}
root <- tool_call_response List Directory: FILE README.md
root: The working directory contains 1 file: README.md (1 line).
stream_stopped (stop, normal)
user: How many lines does README.md have? Count them with a shell command.
tool_call_confirmation: {"agent_name": "root", "tool_call": {"id": "<call-id>", "type": "function", "function": {"name": "shell", "arguments": "{\"cmd\": \"wc -l README.md\"}"}}, "metadata": {"blast_radius": "safe", "category": "fs-read", "reason": "Command matches safe read-only pattern: wc -l <file>", "safety_label": "safe"}}
root <- tool_call_response Shell: The user rejected the tool call.
root -> tool_call read_file {"path": "README.md"}
root <- tool_call_response Read: hello
root: README.md has 1 line.
stream_stopped (stop, normal)

```

**Evidence: the first attempt, in the form the help text gives**

```text
title: the first attempt, in the form the help text gives
source: manuals/docker-sandboxes-101/capture/out/21-sessions-diff.txt
lines: 1-3
lang: console
note: The parser read the first reference as a flag.
---
$ docker-agent sessions diff -1 -2
Error: unknown shorthand flag: '1' in -1
[exit 1]

```

**Evidence: the two replays compared**

```text
title: the two replays compared
source: manuals/docker-sandboxes-101/capture/out/21-sessions-diff.txt
lines: 5-9
lang: console
note: Five turns and no difference.
---
$ docker-agent sessions diff -- -1 -2
Comparing -1 (5 turns) against -2 (5 turns)

✅ Identical behaviour across all 5 turns.
[exit 0]

```

**Evidence: the newest session against the third newest, with the CI flag**

```text
title: the newest session against the third newest, with the CI flag
source: manuals/docker-sandboxes-101/capture/out/21-sessions-diff.txt
lines: 11-22
lang: console
note: Read which tool each side called first, and the sentence before the error.
---
$ docker-agent sessions diff --fail-on-divergence -- -1 -3
Comparing -1 (5 turns) against -3 (6 turns)

❌ First divergence at turn 0 (after 0 matching turn(s)).
   -1 called:
     list_directory({"path": "."})
   -3 called:
     shell({"cmd": "echo m101-ok"})

Everything after this point is downstream of the divergence and is not compared.
Error: sessions diverged
[exit 1]

```

**Evidence: the first turn of the restricted run of the guarded agent**

```text
title: the first turn of the restricted run of the guarded agent
source: manuals/docker-sandboxes-101/capture/out/20-restricted.txt
lines: 1-3
lang: text
note: This run came from another agent file, and its first tool call matches one side of the divergence.
---
user: Run the shell command: echo m101-ok
root -> tool_call shell {"cmd": "echo m101-ok"}
root <- tool_call_response Shell: m101-ok

```

**Evidence: the sessions table and the five newest titles**

```text
title: the sessions table and the five newest titles
source: manuals/docker-sandboxes-101/capture/out/21-session-db.txt
lines: 19-27
lang: console
note: Every exec run has the same title, so a title cannot tell runs apart.
---
$ sqlite3 work/data/session.db 'pragma table_info(sessions)'  (12 rows)
id created_at tools_approved input_tokens output_tokens title cost send_user_message max_iterations working_dir starred permissions agent_model_overrides custom_models_used thinking parent_id instruction_context safety_policy attributes origin

$ sqlite3 work/data/session.db 'select id, title from sessions order by created_at desc limit 5'
<uuid> | Running agent
<uuid> | Running agent
<uuid> | Running agent
<uuid> | Running agent
<uuid> | Running agent

```

**Questions**

1. Which of the three results says anything about the agent, and which say something about the command?
2. Two runs from the same recording agreed with each other. What does a cassette fix, and what does it leave free?
3. The divergence names `list_directory` against `shell` at turn 0. What are the two sessions, and how do you know?
4. What does the comparison compare, and why does it stop at the first difference?
5. Rewrite the check so that a divergence can only come from a change to the agent.

:::answer Show the answer
:::say Short answer
The agent did not change. The flaky result came from the operands: a relative reference into a shared session store that held runs of other agents, and a command form from the help text that the parser rejects. The one honest comparison, two replays of one cassette, matched on all five turns.
:::

**Walkthrough**

1. **Read the two runs.** Same flags, same working directory, same cassette, same two messages, and the same final answer both times. A cassette holds the recorded model replies, and `--fake` replays them with no model. The model is out of the loop, so the only free parts are the operands and the measure.
2. **Count the turns.** The transcript the cassette replays has five model replies: a `list_directory` call, an answer, a `shell` call that the user rejected, a `read_file` call, and an answer. Those five replies are the five turns the comparison reports.
3. **Read the failed command.** The help text gives the form with bare negative references, and the parser reads the first one as a flag. The error names the flag parser and nothing else. Put `--` before the references, as the second command does. This result says nothing about the agent.
4. **Read the pass.** The two replays compared identical over all five turns, and the JSON form counts `turns_a` 5, `turns_b` 5, `turns_matched` 5. This is the result the check exists for.
5. **Read the failure.** The comparison is between the newest session, with 5 turns, and the third newest, with 6 turns. The newest called `list_directory` first. The third newest called `shell` with `echo m101-ok` first. That first call matches the restricted run of a different agent file, the guarded agent, which answers a different user message. The reference `-3` did not point at a run of the files agent at all.
6. **Read the session store.** Relative references count every session in one `session.db` by creation time, and the table holds runs of every agent file plus the sub-sessions of the team runs. The five newest rows are all titled `Running agent`, so a title cannot tell runs apart. Whatever ran last on this machine is `-1`.
7. **Read what the comparison measures.** It compares the sequence of tool calls and ignores the prose of the assistant. After the first difference every later turn is downstream, so it reports one divergence and stops.

**Resolution**

The agent did not change. The flaky result came from the operands: a relative reference into a shared session store that held runs of other agents, and a command form from the help text that the parser rejects. The one honest comparison, two replays of one cassette, matched on all five turns.

The repaired check fixes three things. It fixes the model, by recording one cassette with `--record=PATH` and `--models-gateway` and replaying both sides with `--fake`, one tool call per message, because a turn with two parallel calls answers 500 on replay. It fixes the operands, by giving the check its own data directory with `--data-dir`, so that its `session.db` holds only its own runs, and by writing `--` before the references. It fixes the measure, by running `sessions diff --fail-on-divergence` and reading only the first divergence. The proof is the pass that already exists: with one cassette on both sides, the report counted 5 matched turns of 5, and the exit code was 0.

**Wrong turns**

- "The agent is nondeterministic, so delete the check." Two replays from one cassette matched on all five turns. The comparison that failed compared two different agents.
- "Quote the reference as `'-1'` to fix the flag error." The parser still sees a leading hyphen. `--` ends flag parsing.
- "Compare the assistant text instead of the tool calls." Prose varies between live runs, and the comparison ignores it on purpose. The tool calls are the behaviour.
- "Read the turns after turn 0 to find more bugs." Everything after the first divergence is downstream of it and is not compared.

**Generalize**

A regression check on an agent needs three fixed things: the model replies, the operands, and the measure. A cassette fixes the first. A private session store and explicit references fix the second. A comparison of tool calls that stops at the first difference fixes the third. When a check flips between pass and fail, find out what it compared before you blame what it measured.

:::

## A read-only database on a read-write mount

*Level 3 · incident · about 25 minutes · version: sbx v0.47.0 and docker-agent v1.149.0 on the host, with the main build of docker-agent inside the template; model: none; the run stopped before its first model call; hardware: one Mac with the microVM runtime*

A team runs its coding agent with `--sandbox`, so that its `shell` and `filesystem` tools act inside a microVM while the model stays on the host. The first sandboxed run on a developer's Mac prints a launch summary, pulls the template image, creates the sandbox, and exits with code 1 before the agent answers. The error names the session store: its migration could not create a table, because the database was read-only. The sandbox is still listed as running.

The team splits three ways in the channel. One engineer says the template image is broken and wants to pin an older tag. One says the workspace must have been mounted read-only by mistake. One says SQLite is missing from the guest. Before the second attempt, the developer gives you the launch output, a second run with the state directories at their defaults, and a shell inside the running VM.

**Evidence: the sandboxed run, its state flags and the launch summary**

```text
title: the sandboxed run, its state flags and the launch summary
source: manuals/docker-sandboxes-101/capture/out/27-sandbox-run.txt
lines: 1-15
lang: console
note: Read the note after the command for where the three state directories sit, then the four workspace lines and their modes.
---
$ docker-agent run --sandbox --exec --working-dir fixtures/repo-sandbox fixtures/agents/files-sandbox.yaml 'List the files in the working directory and count the lines of README.md.'  (--config-dir, --data-dir, --cache-dir under fixtures/repo-sandbox/.m101, inside the workspace)
Models gateway: none configured
Models catalog: allowlisting models.dev in the sandbox proxy
User sandbox allowlist: allowlisting 1 host(s) from `docker agent sandbox allow`:
  - localhost:12434

sandbox    docker-agent-<hash>
agent      docker-agent
workspace  $CAPTURE/fixtures/repo-sandbox (rw)
           $CAPTURE/fixtures/agents (ro)
           $CAPTURE/fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash> (ro)
           $CAPTURE/fixtures/repo-sandbox/.m101/cfg (ro)
image      docker/docker-agent-sbx-templates:latest
cpu        10
memory     32 GiB

```

**Evidence: the last five lines of the sandboxed run**

```text
title: the last five lines of the sandboxed run
source: manuals/docker-sandboxes-101/capture/out/27-sandbox-run.txt
lines: 24-28
lang: console
note: The run ends at the session store, before any model call.
---
<ts> WARN Self-update skipped; continuing with current binary error="current version \"main\" is not a release version: invalid semantic version"
docker-agent: self-update failed (current version "main" is not a release version: invalid semantic version); continuing with current version
Error: creating session store: migration failed even after database reset: failed to create migrations table: attempt to write a readonly database (1032)
Error: 
[exit 1]

```

**Evidence: the same run with the state directories at their defaults**

```text
title: the same run with the state directories at their defaults
source: manuals/docker-sandboxes-101/capture/out/27-data-dir-outside.txt
lang: console
note: One line names the rule for the data directory.
---
$ docker-agent run --sandbox --exec --working-dir fixtures/repo-sandbox fixtures/agents/files-sandbox.yaml 'List the files in the working directory and count the lines of README.md.'
Error: --data-dir must be inside the sandbox's writable workspace $CAPTURE/fixtures/repo-sandbox
[exit 1]

```

**Evidence: a plain SQLite write inside the VM, then the mounts of the workspace**

```text
title: a plain SQLite write inside the VM, then the mounts of the workspace
source: manuals/docker-sandboxes-101/capture/out/27-sqlite-probe.txt
lang: console
note: Compare the error with the mode letters of the first mount.
---
$ sbx exec docker-agent-<hash> sh -c 'cd "$PWD" && mkdir -p .m101/probe && python3 -c '"'"'import sqlite3; c = sqlite3.connect(".m101/probe/x.db"); c.execute("create table t(a)"); c.execute("insert into t values (1)"); c.commit(); print("sqlite write ok")'"'"' 2>&1 | tail -1; mount | grep repo-sandbox'
sqlite3.OperationalError: attempt to write a readonly database
host on $CAPTURE/fixtures/repo-sandbox type virtiofs (rw,nosuid,nodev,relatime)
host on $CAPTURE/fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash> type virtiofs (ro,nosuid,nodev,relatime)
host on $CAPTURE/fixtures/repo-sandbox/.m101/cfg type virtiofs (ro,nosuid,nodev,relatime)
[exit 0]

```

**Evidence: the auto-kit that docker-agent staged under the workspace**

```text
title: the auto-kit that docker-agent staged under the workspace
source: manuals/docker-sandboxes-101/capture/out/27-kit-cache.txt
lang: console
note: The manifest has two fields and nothing about a database.
---
$ find fixtures/repo-sandbox/.m101/cache/sandbox-kits -maxdepth 3 | sort
fixtures/repo-sandbox/.m101/cache/sandbox-kits
fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash>
fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash>/manifest.json
fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash>/prompt_files
fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash>/skills

$ cat fixtures/repo-sandbox/.m101/cache/sandbox-kits/<hash>/manifest.json
{
  "agent_ref": "$CAPTURE/fixtures/agents/files-sandbox.yaml",
  "built_at": "<ts>"
}

```

**Evidence: the version of the agent binary inside the VM**

```text
title: the version of the agent binary inside the VM
source: manuals/docker-sandboxes-101/capture/out/27-inside.txt
lines: 1-3
lang: console
note: The template does not run the release that the host runs.
---
$ sbx exec docker-agent-<hash> sh -c 'docker-agent version; echo; env | grep -iE '"'"'proxy|gateway|models|safety|yolo'"'"' | sort; echo; docker-agent sandbox list'
docker-agent version main
Commit: 154b78f2d517dae1397866dfb7586c4a302a3151

```

**Evidence: the same agent file started by hand inside the VM**

```text
title: the same agent file started by hand inside the VM
source: manuals/docker-sandboxes-101/capture/out/27-inside-run.txt
lang: console
note: Read the three state flags in the command, then the answer.
---
$ sbx exec docker-agent-<hash> sh -c 'docker-agent --config-dir /tmp/m101 --data-dir /tmp/m101 --cache-dir /tmp/m101 run --exec --last --working-dir $CAPTURE/fixtures/repo-sandbox $CAPTURE/fixtures/agents/files-sandbox.yaml '"'"'List the files in the working directory and count the lines of README.md.'"'"''
<ts> WARN Self-update skipped; continuing with current binary error="current version \"main\" is not a release version: invalid semantic version"
docker-agent: self-update failed (current version "main" is not a release version: invalid semantic version); continuing with current version
The working directory contains README.md with 1 line.
[exit 0]

```

**Questions**

1. Where did the data directory sit, and which mount held it?
2. Three mounts are read-only in the summary. Does any of them explain the error?
3. What does the SQLite probe add that the error message does not?
4. Why did the second run fail before it created anything?
5. The last listing is a run that completed. What does it prove, and what does it not prove?
6. How would you run this agent in a sandbox on this host today, and what would you file?

:::answer Show the answer
:::say Short answer
The session store could not write because SQLite cannot write a database through the `virtiofs` workspace mount on this host, although `mount` lists it as `rw`. The launcher requires the data directory inside that workspace, so a `--sandbox` launch has no supported place for the store on this machine. The sandbox itself worked: a run started by hand inside the VM, with its state under `/tmp/m101`, completed with the correct answer, and the same agent file reached the model through the proxy.
:::

**Walkthrough**

1. **Read the state flags first.** The note after the command says that the config, data and cache directories sit under `.m101/` in the workspace. The error comes from the session store, which lives in the data directory, so the database file is on the workspace mount.
2. **Read the four workspace lines.** The workspace is `(rw)`. The agent file directory, the staged kit under `.m101/cache/sandbox-kits/<hash>` and `.m101/cfg` are `(ro)`. The data directory is none of those three paths, so the mount modes do not explain the failure.
3. **Rule out the mount flags with the probe.** Inside the VM, a plain Python `sqlite3` write under `.m101/probe/` fails with the same `attempt to write a readonly database` message. The mount table on the lines below lists the workspace as a `virtiofs` mount with `rw`. The kernel reports the mount as writable, and SQLite still cannot write a database through it. The fault sits between SQLite and this mount, not in the sandbox settings and not in a missing package: the probe imported `sqlite3` and connected without error.
4. **Read why the defaults are no escape.** The run with the default state directories was refused before it made a sandbox: `--data-dir` must be inside the writable workspace. So the launcher forces the database onto the one mount where, on this host, SQLite cannot write it.
5. **Separate the kit from the store.** The staged auto-kit holds a `manifest.json` with `agent_ref` and `built_at`, plus `prompt_files` and `skills`. Nothing in it configures a database. The template runs `docker-agent version main`, not the release the host runs, so the image tag is a second finding to record. The probe fails for any program, though, so a different agent build would not change the result.
6. **Prove the model path with the run by hand.** Started inside the VM with its three state directories under `/tmp/m101`, the guest's own filesystem and not a mount, the same agent file answered with exit 0: the README has 1 line. The provider at `host.docker.internal:12434` was reached through the proxy. So the model path, the allowlist and the agent file are sound. Only the location of the session store fails.

**Resolution**

The session store could not write because SQLite cannot write a database through the `virtiofs` workspace mount on this host, although `mount` lists it as `rw`. The launcher requires the data directory inside that workspace, so a `--sandbox` launch has no supported place for the store on this machine. The sandbox itself worked: a run started by hand inside the VM, with its state under `/tmp/m101`, completed with the correct answer, and the same agent file reached the model through the proxy.

What to do:

1. On every new host, before the launcher is used with `--sandbox`, test a SQLite write inside the workspace from a shell in the VM, as the manual's checklist says.
2. Until the data directory rule changes, start the agent inside the VM by hand with `sbx exec`, with `--data-dir` on the guest filesystem, and keep the host launcher for machines where the probe passes.
3. Remove the sandbox with `sbx rm` when you are done, because the launcher leaves it running after the error.
4. File two open items: the template runs the `main` build and not the pinned release, and the run printed no safety mode, so the mode a sandboxed run uses stays unknown, which is conflict C62 in the manual.

**Wrong turns**

- "The workspace was mounted read-only." The summary lists it as rw, and the mount table inside the VM agrees. The three read-only mounts are the agent file directory, the staged kit and the config directory, and the database is under none of them.
- "Pin an older template tag." The probe fails for a plain Python script with no agent involved, so the agent build is not the cause. The main build is worth a ticket, not a fix.
- "Move the data directory to the host default." The launcher refuses a data directory outside the writable workspace, before it creates anything.
- "SQLite is missing from the guest." The probe imported the module and opened the database. It failed on the first write.

**Generalize**

When a program reports a permission error on a path that the system lists as writable, repeat the operation with the smallest program that performs it, on the same path, outside the product. A failure there moves the fault from the product's settings to the layer under it, and a pass narrows it to the product. Then check whether the product gives you a way around that layer, and if it does not, write down the exact rule that blocks you.

:::
