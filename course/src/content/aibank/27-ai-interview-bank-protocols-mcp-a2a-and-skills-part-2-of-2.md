---
track: aibank
title: "AI interview bank: Protocols: MCP, A2A and skills (part 2 of 2)"
short: Protocols 2
sub: 9 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Confirm a deletion without a session

*Level 3 (senior) · design · about 12 minutes*

A tool that deletes notes, `notes_delete`, finds three notes that match the title the user gave. Design the confirmation flow under the current MCP revision: how the server asks the user to pick one and confirm, how the answer comes back, and what stops a client from answering a different question or replaying one confirmation with changed arguments.

:::answer Show the answer
:::say Short answer
The server answers with a result typed `input_required` that embeds an `elicitation/create` form request listing the three candidate ids and a `confirm` boolean, plus an integrity-protected `requestState`. The client shows the form and retries the original `tools/call` with a new request id, echoing `requestState` and the `inputResponses`. The server signs the state over the principal, the method, a digest of the arguments, the candidate set, the phase and an expiry, verifies the echo, checks that the chosen id was in the signed set, re-authorizes the workspace and re-checks containment, and consumes a one-time nonce in a shared replay store before it deletes.
:::

**Full answer**

**The first response**

```json
{
  "resultType": "input_required",
  "inputRequests": {
    "delete_choice": {
      "method": "elicitation/create",
      "params": {
        "mode": "form",
        "message": "Choose one matching note and confirm deletion.",
        "requestedSchema": {
          "type": "object",
          "properties": {
            "note_id": {"type": "string", "enum": ["note-3", "note-7", "note-14"]},
            "confirm": {"type": "boolean"}
          },
          "required": ["note_id", "confirm"]
        }
      }
    }
  },
  "requestState": "integrity-protected-delete-state"
}
```

A current server sends no reverse JSON-RPC request. The embedded request is complete, with `method` and `params`, and its key must match the entry in `inputResponses` on the retry.

**Capabilities are checked on this request**

The server may embed a form only when the current request's `clientCapabilities` support it. `{"elicitation": {}}` and `{"elicitation": {"form": {}}}` both support form mode. A URL-only declaration does not, and the server returns `-32021` with `data.requiredCapabilities` equal to `{"elicitation":{"form":{}}}`. An earlier request's declaration never counts.

**Form mode has limits**

The root is an object with flat primitive fields or supported enums. Use it to choose among candidates, confirm a destructive operation or collect non-sensitive preferences. Never collect passwords, API keys or payment credentials in it, because they would pass through the client and could reach logs or model context. URL mode exists for that external flow.

**Three outcomes, three behaviors**

| Action | Meaning | Server behavior |
|---|---|---|
| `accept` | the user submitted the form | validate the content and continue |
| `decline` | the user refused | return a complete, non-error refusal; consume the nonce without deleting |
| `cancel` | the user dismissed or could not finish | stop safely; the state stays retryable until expiry |

Never read missing content as consent, and never turn a decline into a repeated prompt.

**What the signed state binds**

The state holds the authenticated principal, the originating method, a digest of `workspaceUri` and `title`, the allowed note ids shown in the form, the operation phase and a short expiry. On the retry the server verifies the signature, validates the response against the schema, checks that `note_id` is in the signed candidate set, re-authorizes the workspace, re-checks containment, and only then mutates. A changed title cannot reuse the original state.

**Why HMAC alone is not enough**

A valid state can be replayed within its expiry. Store and consume a nonce exactly once in a replay store shared by every handler instance, and hold the atomic claim while the deletion runs. A database couples the claim and the mutation in one transaction. Validate before you claim: a malformed response or a cancel claims nothing.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The client declares `{"elicitation": {"url": {}}}` only. What does the server do? Expected: return `-32021` with the required form capability in `data`; it must not embed a mode the current request did not declare.
- **Level 3:** The user dismisses the dialog. Which action, and what happens to the state? Expected: `cancel`; nothing is mutated and the state stays retryable until it expires, unlike `decline`, which is terminal.
- **Level 4:** Two server instances share the note store. How do you stop both from executing one confirmation? Expected: a shared replay store with an atomic nonce claim coupled to the mutation; the lesson's test runs two server objects against one state.
- **Level 4:** A note moves outside the workspace after the form was shown. What catches it? Expected: the live record check and the containment re-check before mutation, not the signed state alone.

**Wrong answers, and why they fail**

- "Keep the candidate list in server memory keyed by the connection." There is no session, and the retry can reach any instance. The candidates travel inside the signed state.
- "The host validated the form, so the server can trust the content." The client controls everything it sends. The server validates the schema and the candidate set again.
- "Ask for the user's password in the form as the confirmation." Form mode must not carry secrets. An external credential flow uses URL mode and binds the browser user to the same principal.

:::

## Recover a dropped A2A stream without replay

*Level 3 (senior) · design · about 10 minutes*

Your client watches a long test run over `SendStreamingMessage`. After four frames the connection drops, while the agent keeps working and appends more lines to the log artifact. Design the recovery: how the client learns what it missed, how it rebuilds the log, and how it knows when to stop reconnecting.

:::answer Show the answer
:::say Short answer
Nothing is replayed, because a stream is a live view and the specification defines no cursor. The client calls `SubscribeToTask` with the task id, and the first frame must be a `Task` snapshot that already holds every chunk written while the client was away. The client replaces its partial artifact with the snapshot's copy and appends the frames that follow. When a later subscribe answers `UnsupportedOperationError`, the task is terminal, so the client stops reconnecting and reads the final task with `GetTask`.
:::

**Full answer**

**What a stream is**

Every event carries one `StreamResponse` with exactly one of `task`, `message`, `statusUpdate` or `artifactUpdate`. Every implementation must deliver events in the order it created them and to every open stream of the task. The lifecycle of a task does not depend on the lifecycle of any one stream.

In the recorded run the client closed after four frames. The agent then appended two chunks that no connection carried. Those events are gone, and the stored task holds both chunks.

**The snapshot is the source of truth**

```text
SubscribeToTask {id}
  frame 1: task snapshot, state WORKING, artifact test-log with parts 01 to 04
  frames 2 to 5: artifactUpdate, chunks 05 to 08, append true
  frame 6: statusUpdate, TASK_STATE_COMPLETED, "96 passed"
```

Rebuild by `artifactId`. A chunk without `append` replaces the artifact or creates it, and a chunk with `append: true` adds its parts to the stored artifact with that id. The snapshot holds only the current `status`, so a reconnecting client can miss status updates. Results belong in artifacts for that reason.

**When the stream ends**

Version 1.0 removed the `final` flag, so no frame announces the end. A stream must close when the task reaches a terminal state. At an interrupted state the sources disagree: the recorded kit closes at `TASK_STATE_INPUT_REQUIRED` and stays open through `TASK_STATE_AUTH_REQUIRED`, and the six SDKs split the same way. So a close by itself means that reading ended. Call `GetTask`, and if the task is not terminal, act on its state and subscribe again.

**When to stop**

A `SubscribeToTask` on a completed task fails with `UnsupportedOperationError`, `-32004`, as plain JSON with no stream. That is the stop signal. Read the final task with `GetTask` and treat the artifacts there as the result.

**Two more rules from the captures**

- Send the first chunk of every artifact without `append`, because servers disagree about `append: true` on an unknown id: one fails the task, one drops the chunk, two start a new artifact.
- Over HTTP+JSON, send `POST` to `/tasks/{id}:subscribe`, because two SDK servers route no `GET`; a server should accept both.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why replace the artifact from the snapshot instead of merging? Expected: missed chunks never replay and the snapshot is the stored copy, so a merge would duplicate parts.
- **Level 3:** The stream closes right after a status frame in `TASK_STATE_INPUT_REQUIRED`. Is the task over? Expected: no; the close ended the reading, so call `GetTask` and answer the question on the same task.
- **Level 4:** The last status message said "done" but no terminal state arrived before the close. What do you trust? Expected: the state from `GetTask`; a task is finished only when a terminal state is recorded, never on the close or on prose.
- **Level 4:** How does `lastChunk` relate to the end of the task? Expected: it closes one artifact only; the recorded stream carried two more frames after a `lastChunk`, and a canceled task can store an artifact that never got one.

**Wrong answers, and why they fail**

- "Reconnect with a last event id so that the server replays." The specification defines no cursor and no replay. `SubscribeToTask` starts with a snapshot instead.
- "The close means the task finished." Servers close at different states. Confirm the state with `GetTask` before you stop.
- "Keep the chunks you had and append the snapshot's." That duplicates parts. The snapshot replaces your copy, and the following frames append.

**Related lesson in this course:** [Deep dive 13: production agent systems](#aideep-13)

:::

## The charge that ran twice after a timeout

*Level 3 (senior) · design · about 12 minutes*

Over Streamable HTTP, a client calls `charge_account`. A reverse proxy buffers the response stream, the client reaches its timeout and disconnects, and the server commits the charge a moment later. The client sends the call again with a fresh JSON-RPC id, and the customer is charged twice. The team proposes to deduplicate on the JSON-RPC id. Design the fix.

:::answer Show the answer
:::say Short answer
A JSON-RPC id correlates one message and never identifies a business operation, so two ids are two charges to the server. Add an application idempotency key to the arguments, and make the server store the key, a fingerprint of the arguments and the committed result in one atomic durable transaction. The same key with the same arguments returns the stored result, and the same key with different arguments is rejected.
:::

**Full answer**

**The key, not the id**

```json
{
  "name": "charge_account",
  "arguments": {"account": "acct-7", "cents": 1200, "idempotencyKey": "checkout-7"}
}
```

The lesson shows the two-id case: a charge with id `41` loses its response, the retry carries id `42`, and the server sees two different messages. Without an application key it cannot know they are one checkout.

**The ledger boundary must be atomic and durable**

This sequence is unsafe:

```text
check key
run mutation
store result
```

Two workers can both observe a missing key and both run the mutation. A crash after the effect and before the store creates the same ambiguity on retry. The lesson uses a file-backed SQLite ledger with `BEGIN IMMEDIATE`, so the key check, the business effect, the execution counter and the stored result commit as one unit, and two connections racing on one key produce one execution. Return defensive copies of stored results so that a caller's mutation cannot corrupt a later replay.

A local table does not make a real payment atomic. Production needs a shared durable transaction, a transactional outbox, or an upstream provider that enforces the same key. A process lock protects neither replicas nor restarts.

**Classify every mutation before you retry**

| Class | Example | Rule |
|---|---|---|
| safe | a deterministic read | retry with a new id once the failure boundary is understood |
| conditional | a mutation with a durable key | retry with the same key and identical arguments |
| unsafe | a mutation with no deduplication | do not retry automatically; reconcile first |

`idempotentHint` and `readOnlyHint` are untrusted hints. The application contract and the server implementation decide.

**Fix the timeout too**

Use two clocks: an idle timeout that progress may reset, and a maximum timeout from request start that nothing resets. In the lesson's example, progress at `400`, `800` and `1200` ms keeps a `500` ms idle clock alive, and the `2000` ms maximum still cancels the request. For the buffering proxy, send `Content-Type: text/event-stream`, `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and emit SSE comment keepalives on quiet streams. A keepalive is not progress and must not reset the idle clock.

**The race the fix must respect**

Cancellation and completion race. If cancellation wins, the server suppresses the response. If completion wins, the client ignores the late cancellation and the server ignores the late notification. On HTTP the cancellation signal is closing the request's response stream, so the disconnect in the scenario was a cancellation the server observed too late to stop the commit. The key makes that harmless.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The same key arrives with a different `cents` value. What happens? Expected: the server compares the argument fingerprint and rejects the call, because one key must not alias two business intents.
- **Level 3:** Two workers see the key missing at the same instant. What prevents two charges? Expected: the key claim, the effect and the result commit in one atomic durable transaction; a check-then-write sequence cannot.
- **Level 4:** The charge is executed by an external payment provider. Does the local ledger make it atomic? Expected: no; either the provider accepts the same idempotency key, or a transactional outbox bridges the local commit to the remote effect.
- **Level 4:** The client reconnects a dropped `subscriptions/listen` stream. Does it resend the lost charge? Expected: no; it opens a new listen request, refetches authoritative state, deduplicates by stable identifiers, and never replays an unsafe mutation because a response was lost.

**Wrong answers, and why they fail**

- "Deduplicate on the JSON-RPC id." Ids correlate messages, and a retry carries a new id by design.
- "Set `idempotentHint` and let clients retry freely." Annotations are untrusted hints. The application contract and the ledger decide retry safety.
- "Check the key, run the charge, then store the result." Two workers can both miss the key, and a crash between the effect and the store leaves the retry ambiguous.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## The draft that vanished on the second replica

*Level 3 (senior) · debug · about 10 minutes*

A document MCP server runs as two replicas behind a load balancer. Its `draft_create` tool keeps the new draft in a dictionary inside the process and returns `{"ok": true}`. The next call, `draft_append`, fails about half the time with "no draft", and the failures stop when the operator turns on sticky routing. Explain the failure, say why the operator's fix is wrong, and redesign the two tools.

:::answer Show the answer
:::say Short answer
The first call created the draft in the memory of one replica and returned no name for it, because the design assumed the connection identifies the draft. The second call is a fresh POST that can land on the other replica, which has valid protocol metadata and no way to load the draft. Sticky routing hides the bug until a restart, a rollout or a failover moves the next request. Return a server-minted opaque handle from `draft_create`, keep the draft in a shared durable store, and make `draft_append` take the handle as an ordinary argument.
:::

**Full answer**

**The mechanical failure**

1. Request A reaches replica one and creates a draft in that process.
2. The response returns no draft handle.
3. Request B is a new POST and reaches replica two.
4. Replica two cannot name or load the draft, so the call fails or reads the wrong local object.
5. Sticky routing appears to fix the symptom until the next request moves.

Half the appends fail because half the requests land on the other replica. Nothing in the current revision ties two requests together: there is no `Mcp-Session-Id`, and every request is independently interpretable.

**The correct boundary**

Protocol context stays in each request. Durable application state lives in a shared store under a handle the server mints and returns to the client. The next call supplies the handle, any replica loads the same record, and authorization binds the record to the authenticated principal and tenant. Replica memory may cache the record. It cannot be the only copy that correctness needs.

**The redesigned pair**

- `draft_create` returns `{"draftId": "<unguessable>"}` from a shared store, bound to the principal, with an expiry.
- `draft_append` takes `draftId` as an argument, authorizes the principal for that draft on every call, and applies concurrency control and idempotency for the append.

**Choose the mechanism by lifetime**

| Lifetime | Mechanism |
|---|---|
| one call | request-local variables |
| a short MRTR continuation | integrity-protected `requestState` echoed by the client |
| a draft or durable task | an explicit handle plus shared persistence, expiry, concurrency control and idempotency |

None of these is an MCP protocol session.

**Prove it**

Place two stateless replicas behind one balancer and send at least `100` concurrent requests. Route consecutive calls to alternating replicas and show that correctness does not depend on affinity. Replace hidden process memory with an explicit handle wherever the workflow needs persistence.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Where may replica memory still be used? Expected: as a cache of the stored record, never as the only copy required for correctness.
- **Level 3:** How do you test that the fix holds? Expected: alternate replicas for consecutive calls and run many concurrent requests; every append must find its draft without affinity.
- **Level 4:** What does the handle need beyond being random? Expected: binding to the authenticated principal and tenant, expiry, authorization on each use, and concurrency plus idempotency rules for appends.
- **Level 4:** Why not carry the draft in `requestState` instead of a store? Expected: `requestState` suits a short input-required continuation; a durable draft needs shared persistence, and a client-echoed value is not storage.

**Wrong answers, and why they fail**

- "Sticky routing fixed it, so ship it." Affinity breaks on restart, rollout, reschedule or failover. Correctness must not depend on which replica answers.
- "Replicate the dictionary between the two processes." That hides protocol context in a store as a substitute for the removed session. The fix is an explicit handle and shared storage the client can name.
- "Use `Mcp-Session-Id` to find the draft." The current revision ignores that header and never mints it.

:::

## The gateway that authorized a read and ran a delete

*Level 3 (senior) · debug · about 10 minutes*

A gateway in front of an MCP server authorizes each `tools/call` by reading the `Mcp-Name` header and checking it against the caller's role. The origin server behind it executes `params.name` from the JSON body. An attacker sends `Mcp-Name: notes.read` with a body whose `params.name` is `notes.delete`. The gateway also rejects an unsupported `MCP-Protocol-Version` before it looks at anything else. Walk through what happens, and give the validation order you would ship.

:::answer Show the answer
:::say Short answer
The gateway approves a read while the origin runs a delete, because two components decide from two different fields. Ship one fixed order: validate the JSON-RPC and metadata types, compare every mirrored header with the body, and only after equality is proven check whether the matched version is supported. A disagreement is HTTP `400` with `-32020` even when one of the two version values is unsupported, so the request dies before a backend is selected, a role is checked or a rate-limit token is spent.
:::

**Full answer**

**The mirrored headers**

| Header | Must equal |
|---|---|
| `MCP-Protocol-Version` | `params._meta.io.modelcontextprotocol/protocolVersion` |
| `Mcp-Method` | the JSON-RPC `method` |
| `Mcp-Name` | `params.name`, or `params.uri` for `resources/read` |

Header names are case-insensitive. Header values are case-sensitive. A non-ASCII or unsafe name travels as the `=?base64?{value}?=` sentinel, and the server decodes it before the comparison.

**The order and the codes**

1. Parse one envelope. Confirm `jsonrpc` is `"2.0"`, an `id` exists on a request (a notification has none), `method` is a string and `params` is an object.
2. Require the version string and the capability object in `params._meta`. Missing or malformed metadata is `-32602`.
3. Compare each mirrored header with the body. A mismatch is HTTP `400` with `-32020`, even when one value is unsupported.
4. With equality established, reject a matched but unsupported version with HTTP `400` and `-32022`, with data exactly `{"supported":["2026-07-28"],"requested":"<actual>"}`.
5. Check required capabilities, route by `method`, validate method-specific arguments.
6. Authenticate and authorize the concrete operation before its handler runs.
7. Return a complete result with server identity, then forget the request-scoped metadata.

An unknown method is HTTP `404` with `-32601`. A notification has no `id` and receives no JSON-RPC body; an accepted one gets `202` with an empty body.

**Why the order matters**

Each step leaves a distinct piece of evidence: malformed input, header confusion, version negotiation, capability failure, authorization and handler failure stay separate. Checking version support before header equality mixes two classes and lets a crafted header reach a decision. Validating routing before policy closes the gap in which one component authorizes the body while another routes by the header.

**What the gateway does after validation**

Authorization still comes from the authenticated principal and resource policy, not from the header and not from `clientCapabilities`. The sequence is: authenticate the transport credential, validate version, headers and shape, check capability compatibility, then authorize the principal against the exact verb, resource and normalized arguments, and only then execute or request user input.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Header and body both say version `2027-01-01`. Which response? Expected: HTTP `400` with `-32022` and data `{"supported":["2026-07-28"],"requested":"2027-01-01"}`.
- **Level 3:** `Mcp-Name` carries a resource URI with non-ASCII characters. How does the server compare it? Expected: the client sends the exact base64 UTF-8 sentinel, and the server decodes it before comparing with `params.uri`.
- **Level 4:** Why must the mismatch check run before a rate-limit token is consumed? Expected: a rejected request should cost nothing and leave its own evidence; otherwise an attacker spends quota or triggers policy against the wrong object.
- **Level 4:** The attacker's request also carries a valid bearer token. Does that change the outcome? Expected: no; the wire validation fails first, and authentication tells you who sent a malformed request, not that it may run.

**Wrong answers, and why they fail**

- "Trust the header, because the gateway routes on it." The body is what executes. The two must be proven equal before either is used for a decision.
- "Check version support first so that bad clients fail fast." A mismatch must return `-32020` even when a version is unsupported; support is checked only after equality.
- "Header values are case-insensitive like header names." Values are case-sensitive, and a name that differs in case is a different name.

:::

## When an old server is really old

*Level 3 (senior) · design · about 12 minutes*

Your agent host launches several MCP servers over stdio. One is current. One is an old archive server that understands only `initialize`. One is current but slow to start. A teammate proposes a simple rule: send `server/discover`, and on any error or timeout send `initialize`. Design the startup so that the slow server is never downgraded and the archive server still works.

:::answer Show the answer
:::say Short answer
Treat an ambiguous signal as ambiguous. A timeout, a connection close, an empty response or an unrecognized error does not identify an era, so the client fails closed unless that exact peer is configured with `allow_legacy=True`. A recognized modern error such as `-32022` proves the server is current and forbids `initialize`. For the archive peer on the allowlist, send one `initialize` under a transport-enforced deadline and select the legacy era only after a structurally valid positive result.
:::

**Full answer**

**Three outcome classes for the probe**

| Outcome of `server/discover` | Meaning | Next step |
|---|---|---|
| a `DiscoverResult` | current server | pick the highest mutually supported version and continue with per-request metadata |
| a recognized modern error | current server | correct the request or retry an advertised version; never send `initialize` |
| an ambiguous signal | unknown | fail closed, unless this pinned peer allows one bounded legacy probe |

Recognized modern errors are `-32020` HeaderMismatch, `-32021` MissingRequiredClientCapability and `-32022` UnsupportedProtocolVersion. They remain modern even when the peer is on the legacy allowlist, because a server that speaks the modern error vocabulary would be downgraded by `initialize`.

`-32601` is not positive legacy evidence. It only makes an explicitly allowlisted peer eligible for one probe, and so does a timeout, a connection close or an empty response.

**The allowlist is intent, not evidence**

```python
client.add_server("archive", archive_transport, allow_legacy=True)
```

Bind the choice to the configured command or endpoint. A wildcard would let an arbitrary server opt itself into weaker semantics. A peer without the flag fails after an ambiguous outcome and never receives `initialize`.

**Positive legacy evidence**

The one `initialize` runs under `legacy_probe_timeout_ms`, which a real adapter must enforce. The client then requires all of:

- a JSON-RPC `2.0` response with the matching request id;
- exactly one `result` and no `error`;
- a `protocolVersion` in the client's configured legacy revision set;
- an object-valued `capabilities`;
- a `serverInfo` object with non-empty string `name` and `version`.

Anything else leaves the peer `unknown` and unavailable. Only after all checks pass does the client send `notifications/initialized` and use legacy request shapes for that transport lifetime.

**After the era is chosen**

Cache the era per transport peer and do not probe before every call. When the transport restarts or the endpoint changes, discard the cache and negotiate again. Then call `tools/list`, sort the result before merging, and apply a declared collision policy: prefix later duplicates as `<server>/<tool>` or reject the duplicate with both peer names in the error. Never overwrite silently.

**Why the slow server survives**

Its first probe times out, which is an ambiguous signal. It is not allowlisted, so the client marks it unavailable instead of sending `initialize`. A later retry of `server/discover` succeeds and the peer joins as a current server with the correct era.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The allowlisted archive peer answers `-32022` to discovery. Which era? Expected: current; a recognized modern error forbids the legacy probe, so choose from `data.supported` and retry with a new request id.
- **Level 3:** The `initialize` probe times out. What state is the peer in? Expected: `unknown` and unavailable; no era is selected and `notifications/initialized` is never sent.
- **Level 4:** A legacy server accepts `tools/list` before initialization. Why does that make discovery-first safer on stdio? Expected: the ambiguous success would hide the era; `server/discover` creates a clean era boundary before any operation.
- **Level 4:** The archive process crashes and restarts. Do you reuse the cached legacy era? Expected: no; discard the peer-era cache, rediscover, relist, reopen subscriptions, and retry only safe operations with new ids.

**Wrong answers, and why they fail**

- "Any error from discovery means the server is old." A malformed request, an overloaded server, a dead process and an old server can all produce the same timeout or close.
- "Send `initialize` first; a current server will reject it." Sending `initialize` to a current server is a downgrade and must never be the default path.
- "A method-not-found error proves the server is legacy." It only makes an allowlisted peer eligible for one bounded probe; the positive evidence is a valid `initialize` result.

:::

## Build the admission gate of an MCP gateway

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. Build the admission module of an MCP gateway. It takes the `tools/list` results of several servers and produces an admitted set, a rejected set and an audit trail. It must page through every list completely, pin each descriptor, qualify names before it merges, reject a descriptor that mirrors a sensitive parameter into a header or places `x-mcp-header` anywhere but a direct top-level property, validate structured results against output schemas on the invoke path, and emit header audit events that carry names and never values. Describe your design, the tests you ship, and the evidence a reviewer should expect.

:::answer Show the answer
:::say Short answer
Run the five gates in order and keep them separate. Discover with an opaque cursor loop that stops only when `nextCursor` is absent or `null`; admit each descriptor against a canonical whole-descriptor digest, a full schema-tree walk for `x-mcp-header`, and a sensitive-name policy; qualify every tool as `<server>.<tool>` before the merge; and validate `structuredContent` against the published output schema before anything reaches the model. Tests prove that one rejected descriptor does not block valid tools, that an empty-string cursor continues, that an annotation under `oneOf`, `items` or `$ref` is rejected, and that a changed `inputSchema` fails the pin. The evidence is the page trace, the admitted and rejected sets, the digest ledger and redacted audit events.
:::

**Full answer**

**Modules**

| Module | Responsibility |
|---|---|
| `discover` | opaque cursor loop per server; records every request as a page trace |
| `admit` | canonical digest, schema walk, header policy, scanner tripwire |
| `namespace` | qualified names, backend mapping, collision policy |
| `consume` | argument validation before invoke, result validation before model use |
| `audit` | header names, rejection categories, digests; no values |

**Admission rules**

1. Canonicalize the descriptor with sorted keys and compact separators, hash it, and store the digest under the qualified name with publisher evidence and approval time. An unknown key is quarantined. A changed digest is a rug pull and is quarantined until re-approved.
2. Walk the entire `inputSchema` tree. `x-mcp-header` is legal only on a direct member of `inputSchema.properties`, with type string, integer or boolean, a non-empty token header name unique without regard to case, and integer values inside the JavaScript safe range. Reject it under a nested object, a `oneOf` branch, `items`, a `$ref` target or any output schema.
3. Reject a descriptor whose mirrored property is named `password`, `secret`, `token`, `api_key` or `authorization`.
4. Run the static scanner for role tags, instruction overrides, concealment, secret access and obscured destinations. Treat a hit as review evidence, not as a verdict.
5. A descriptor without an input schema object is rejected; a tool with no arguments declares `{"type": "object", "additionalProperties": false}`.
6. Store the verified publisher namespace and the live `server/discover` identity with the approved record. On a later refresh, quarantine a server whose namespace or live identity differs, even when every descriptor digest still matches.

**Namespacing and merge**

Qualified names are the public gateway names. Record the backend mapping separately. Sort before merging so local order does not depend on process timing. Never let discovery order decide a collision.

**The invoke path**

Validate arguments before the call. Encode mirrored header values as plain visible ASCII or the exact base64 UTF-8 sentinel. Validate `structuredContent` as any JSON value against the output schema, including results with `isError: true`. Audit the header name and the encoding decision, never the value.

**Tests to ship**

- A two-page list whose first page returns `""` as the cursor produces two requests.
- One unsafe descriptor is rejected and every valid descriptor on the same server is admitted.
- An annotation under `oneOf`, `items`, a nested `properties` or a `$ref` definition is rejected even when that branch is never used.
- Changing `inputSchema` without changing the description fails the pin.
- An unchanged descriptor behind a changed `server/discover` identity is quarantined.
- Two servers that both expose `search` become two qualified names and two digests.
- An array result passes an array output schema and an object fails it.
- Header audit events contain names and no values, checked by a test that greps for the value.

**Evidence for the reviewer**

The capstone grades admission evidence: verified publisher namespace and live `server/discover` identity, deterministic and complete paginated discovery, descriptor validation before model exposure, validated structured output, and routing metadata that preserves authorization boundaries. Capture the descriptor, the page trace, the admitted set, the rejected set with a reason per descriptor, the digest ledger and one validated result. Do not claim gateway compatibility from a successful `tools/call` alone.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why not stop pagination when a page's `tools` array is empty? Expected: emptiness is the server's choice; continue while `nextCursor` is present and not `null`.
- **Level 4:** Two servers return byte-identical descriptors under different names. What does the ledger hold? Expected: two qualified keys with two digests; the same digest under different keys is fine, and a different digest under the same key is the rug pull.
- **Level 4:** The scanner flags a legitimate warning sentence in a description. What happens? Expected: review, not automatic rejection; the scanner is a tripwire and a human approves the full descriptor.
- **Level 4:** A descriptor passes every check and is poisoned from day one. What catches it? Expected: nothing automatic; the design needs a review queue before the first pin, because hash equality proves stability and not safety.

**Wrong answers, and why they fail**

- "Hash the description; schemas rarely change." Schema and annotation changes are the rug pull; pin the whole canonical descriptor.
- "Trust the server's deterministic order and skip the sort." Local registry order must not depend on process startup timing; sort before you merge.
- "Log header values to make debugging easier." A mirrored value can be routing data or, in a bad descriptor, a secret; audit names and rejection categories only.

:::

## How conformant is a server that scores 66.7 percent

*Level 4 (staff) · estimate · about 12 minutes*

You run the official A2A conformance kit against your server twice. The first run scores 32.3 percent. After a two-line change to the kit's own JSON-RPC client, the second run scores 66.7 percent: 62 PASS, 31 FAIL, 11 SKIPPED and 25 NOT TESTED of 129 requirements. Your manager asks how conformant the server is. Estimate the real figure and defend every adjustment you make.

:::answer Show the answer
:::say Short answer
Neither percentage measures the server alone. The first run lost 63 of 85 JSON-RPC records because the kit posted to the card URL with a trailing slash, which is the kit's defect. In the second run, 21 of the failures are skips inside a test body that the tagged kit records as FAIL, so under the main-branch rule the run reads 62 PASS, 10 FAIL and 32 SKIPPED, or 86.1 percent, and of those ten failures three belonged to the server: the missing REST push routes and, at SHOULD level, the missing `Cache-Control` and `ETag` on the card.
:::

**Full answer**

**How the kit scores**

The kit is a pytest project. It reads the card, builds one client per `supportedInterfaces` entry, and runs each test on each declared binding. A MUST test is a hard failure, a SHOULD test is an expected failure, and a MAY test is skipped when the card lacks the capability. The percentages count only PASS and FAIL. All 72 gRPC records were skipped because the server has no gRPC interface, and that is correct, not a loss.

**Run one: a kit defect**

The specification places the interface at `url`. The kit appended a slash, the server answered 404, and 63 records failed for one reason. Fixing the kit's client, not the server, moved the score.

**Run two: separate the failures**

| Group | Count | Whose |
|---|---|---|
| skips inside a test body, recorded as FAIL at the tag | 21 | the kit; `main` records them as SKIPPED |
| push requirements that pass on HTTP+JSON and fail on JSON-RPC | most of the rest | the kit sends snake_case `task_id`, where the specification requires camelCase |
| REST push routes missing although the card declared `pushNotifications` | 1 | the server; every declared binding must offer the same operations |
| missing `Cache-Control` and `ETag` on the card | 2 | the server, at SHOULD level |

After the server fix, the six HTTP+JSON push records pass, and each requirement still reads FAIL because of its JSON-RPC side.

**Where the kit departs from the specification**

The kit expects HTTP `409` for `TaskNotCancelableError`, `415` for `ContentTypeNotSupportedError`, `502` for `InvalidAgentResponseError`, and gRPC `UNIMPLEMENTED` for three errors. The canonical table says `400`, `400`, `500` and `FAILED_PRECONDITION`. A server that follows the specification fails those checks. It also demands `application/json` on REST where the specification says `application/a2a+json` should be used, and it hard-asserts SHOULD and MAY caching tests.

**What the kit never tests**

Five behaviors that split the SDKs never run: the REST subscribe verb, pagination beyond one call, an `append` to an unknown artifact, another caller's task, and a resent `messageId`. The NOT TESTED set also covers in-task authorization, TLS, card signatures and the client's version header. Those are yours to test.

**The estimate**

Say this: one MUST defect, found and fixed; two SHOULD gaps on card caching; a per-requirement reading of 86.1 percent under the main-branch rule, with the remaining failures attributable to the kit's own client, and an explicit list of untested behaviors with your own tests beside them. Hand over `compatibility.json`, not the percentage.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why do the percentages leave out the SKIPPED and NOT TESTED rows? Expected: those rows carry no verdict, so a percentage over them would reward a card that declares few capabilities.
- **Level 4:** The push requirements pass on one binding and fail on the other. How do you classify that? Expected: a kit defect, because the JSON field names must be camelCase and the kit sends `task_id`; keep the requirement as passing in your own ledger with the evidence.
- **Level 4:** What did the one real failure teach about cards? Expected: a capability flag is a promise for every declared binding, so the REST side needed the four push routes the card advertised.
- **Level 4:** Which checks do you add that the kit lacks? Expected: owner scoping of tasks, a resent `messageId`, `append` to an unknown artifact, the REST subscribe verb, and pagination with the returned token.

**Wrong answers, and why they fail**

- "Report the second percentage as the conformance figure." It counts kit skips as failures and the kit's snake_case parameters as your bugs.
- "Report full conformance after fixing the missing routes." The two SHOULD gaps remain, and a quarter of the requirements were never tested.
- "The kit is the specification." It departs from the canonical error table in six places; the specification wins, and the kit's README itself calls SHOULD an expected failure.

:::

## Two issuers, one resource server, no outage

*Level 4 (staff) · design · about 15 minutes*

You deploy a remote MCP server that accepts tokens from two authorization servers, one for staff and one for partners. Design the client enrollment, the per-request token validation and the key handling so that three things hold: a token minted for a sibling MCP server is refused, a signing key rotation causes no outage, and a client steered to a hostile token endpoint never hands over its authorization code.

:::answer Show the answer
:::say Short answer
Publish RFC 9728 protected-resource metadata that names both issuers, and treat that list as the issuer allow-list. Enroll a client with its pre-registered credentials when it has an explicit relationship with that issuer, otherwise with a Client ID Metadata Document when the issuer advertises support, and use deprecated dynamic registration only as an explicit fallback with the correct `application_type`. On every request validate the pinned `iss`, an `aud` equal to this server's canonical resource URI, `exp` and the scope the tool needs; answer `401` for an invalid token and `403` with `insufficient_scope` for a valid token that lacks the scope. Refresh the JWKS on a schedule and re-fetch once on an unknown `kid`, and let the client record the issuer before it redirects and compare the RFC 9207 `iss` in the authorization response exactly before it redeems the code.
:::

**Full answer**

**Discovery and the deployment gate**

The client starts from the MCP resource URL, fetches the RFC 9728 document, selects an advertised authorization server and fetches its RFC 8414 metadata. Keep the resource path when you build the well-known URL: a resource served at the path `/mcp` resolves to `/.well-known/oauth-protected-resource/mcp` on the same host. Before trusting an issuer, check the metadata mechanically: `S256` must be advertised or you stop, `response_types_supported` is `["code"]`, and at least one enrollment path exists.

**Enrollment priority**

| Path | When | Note |
|---|---|---|
| pre-registered client | an explicit relationship with that issuer exists | credentials keyed by issuer |
| Client ID Metadata Document | the issuer advertises support | the HTTPS URL with a path is the `client_id` and the document's `client_id` equals it |
| dynamic registration | neither of the above | deprecated; declare `native` or `web`; never a silent fallback after a CIMD failure |

Fetching a CIMD is an SSRF-sensitive operation for the issuer. Store issuer-minted credentials under the exact issuer and access tokens under `(issuer, resource)`. If discovery moves from one issuer to another, re-evaluate trust and never send the first issuer's secret, registration token or tokens to the second. A CIMD URL is portable because it is self-hosted, not minted.

**Validation on every request**

```text
token.iss in protected_resource_metadata.authorization_servers
token.aud == canonical MCP resource URI
token.exp in the future
required scope present
```

A missing `aud` is a rejection, never a wildcard. The replay walkthrough: a token for `notes.example.com` presented to `tasks.example.com` passes the issuer check and fails the audience check, and the server returns `401` with `WWW-Authenticate: Bearer error="invalid_token"` and a `resource_metadata` pointer. The spec calls this access-token privilege restriction. Never forward the inbound token to a downstream API; obtain a separate downstream token.

**Rotate at the issuer, refresh at the server**

The issuer rotates by publishing the next key before retiring the previous one, so two keys at once is the steady state. The resource server only refreshes: a scheduled job overwrites `cache[issuer] = {keys, fetched_at}`, and a token with an unknown `kid` triggers one synchronous re-fetch and then fails if the key is still missing. Never wire the cache miss to rotate-and-mint: the new key still does not match, and attacker-chosen `kid` values become a key-creation denial of service.

**The mix-up defense lives in the client**

A hostile authorization server can steer a client to redeem an honest issuer's code at the attacker's token endpoint. PKCE does not stop it, because the client hands its `code_verifier` to whatever endpoint it was steered to. The client records the expected issuer before redirecting and compares the returned `iss` as a plain string, with no case folding, slash or port normalization, before it sends the code anywhere.

**Declared failure policy**

| Failure | Behavior |
|---|---|
| scheduled JWKS refresh fails, known `kid` still cached | continue only within a declared stale-on-error window |
| unknown `kid` and the one refresh fails | reject |
| introspection unavailable for an opaque token | fail closed; never convert a network error into `active: true` |
| issuer metadata changes unexpectedly | stop new enrollment and token acquisition |

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is a per-connection token check not enough? Expected: there is no protocol session; every request carries its own bearer token and is validated on its own.
- **Level 3:** A scope step-up is needed for one tool. What does the server return? Expected: `403` with `WWW-Authenticate: Bearer error="insufficient_scope"` naming the scope and the `resource_metadata` URL; the client obtains consent and retries with a new request id.
- **Level 4:** Two concurrent step-ups produce two tokens with different scopes. Which does the validator use? Expected: the token presented on the request, never a lookup of "the user's current scope", which would open a time-of-check race.
- **Level 4:** The partner issuer changes its issuer URL in discovery. What may the client reuse? Expected: only a portable CIMD URL; prior issuer-minted credentials, registration tokens and access tokens are refused, and the client re-enrolls.

**Wrong answers, and why they fail**

- "Any token from our own identity provider is fine." A token minted for a sibling server passes the issuer check; only the audience check refuses it.
- "Fetch the JWKS once at boot." The validator rejects every token after the next rotation until a restart; refresh on a schedule and once on a miss.
- "Fall back to dynamic registration when CIMD validation fails." A security failure must not select a weaker enrollment path; the fallback is an explicit configuration decision.

:::
