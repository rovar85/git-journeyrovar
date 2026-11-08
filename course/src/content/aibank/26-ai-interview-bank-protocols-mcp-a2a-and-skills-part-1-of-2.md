---
track: aibank
title: "AI interview bank: Protocols: MCP, A2A and skills (part 1 of 2)"
short: Protocols 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## A protocol error is not a tool error

*Level 1 (screening) · concept · about 6 minutes*

Your MCP server has a tool `route_report` that reads a report from an upstream source. A reviewer reads the handler and finds two things. When the upstream source is down, the handler returns a JSON-RPC error. When a client sends a tool name that the server does not know, the handler returns a result with `isError: true`. Is that the right way round?

:::answer Show the answer
:::say Short answer
No, both cases are backwards. A JSON-RPC error means the request could not be dispatched at all: an unknown tool name, a malformed envelope, missing request metadata or an invalid cursor. A complete result with `isError: true` means a valid call reached the tool and the tool reports a failure the model can act on, such as a source that is unavailable right now.
:::

**Full answer**

**Two layers, two audiences**

| Layer | Use it for | Who repairs it |
|---|---|---|
| JSON-RPC `error` | the envelope or the method parameters are invalid | the client or the developer |
| result with `isError: true` | the tool ran and reports an actionable failure | often the model, by changing arguments or waiting |

A model can read "report source unavailable" and try later or tell the user. It cannot repair a server that rejected a well-formed request as a tool failure, because it does not know that the request never ran.

**The output schema still holds**

Once a server publishes an `outputSchema`, every complete result commits to conforming `structuredContent`. The `isError` flag classifies the outcome. It does not waive the contract. So model the failure inside the schema. The sample `route_report` failure returns its requested region with `accepted: false`, plus error text, plus `isError: true`.

**Wrong codes send the wrong signal**

Missing request metadata is invalid params, `-32602`. An unsupported protocol version is `-32022` with `requested` and `supported` in the error data. An unknown method is a method-not-found error. Keep those distinct, because a client reads the code to decide whether to correct the request, retry another version, or stop.

**Annotations do not decide any of this**

`readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` are hints for presentation and confirmation. The server still enforces authorization, and the client still validates results.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** A request arrives without the protocol version in `params._meta`. Which code? Expected: `-32602`, invalid params, never filled in from an earlier call.
- **Level 2:** The tool publishes an output schema. Must an error result match it? Expected: yes; every complete result, with `isError: true` included, must return conforming `structuredContent`.
- **Level 2:** Why does the host validate `structuredContent` instead of trusting the descriptor? Expected: a server can violate its own schema, a model cannot repair that, so the client validates before model use.
- **Level 3:** A valid tool call has an argument that fails the input schema. Which layer? Expected: method parameters are invalid, so a JSON-RPC error; the capstone's TypeScript model instead returns a complete result with `isError: true` without invoking the executor, so name your choice and apply it everywhere.

**Wrong answers, and why they fail**

- "Return `isError` for everything so the model always gets text." A malformed envelope then looks like a tool failure, and the model retries a request that can never run.
- "An unknown tool is a tool failure." The call never reached a tool, so it is a dispatch error at the protocol layer.
- "An error result can skip the output schema." The flag classifies the outcome, and the published contract still holds.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## What an A2A client reads before its first message

*Level 1 (screening) · concept · about 7 minutes*

Your planner agent must delegate a test run to a remote agent that it knows only by host and port. Describe what it fetches first, how it decides which endpoint to call, and what it checks before it asks that agent for a stream.

:::answer Show the answer
:::say Short answer
It fetches the agent card with a plain GET on `/.well-known/agent-card.json`. From `supportedInterfaces` it takes the first entry whose binding and version it speaks, and it calls that entry's URL. Before `SendStreamingMessage` it reads `capabilities.streaming`, because a server must refuse the call with `UnsupportedOperationError` when the flag is absent or false.
:::

**Full answer**

**One GET, one document**

The specification names three routes to a card: the well-known URI, a registry or catalog, and direct configuration. It standardizes only the first. A planner with hosts in its configuration fetches each card from the well-known path.

The proto gives `AgentCard` 14 fields, and eight are REQUIRED: `name`, `description`, `supportedInterfaces`, `version`, `capabilities`, `defaultInputModes`, `defaultOutputModes` and `skills`. Four of them are lists, and a required list must hold at least one element. Reject a card that lacks one.

**The endpoint comes from the interface list**

Each `supportedInterfaces` entry has a REQUIRED `url`, `protocolBinding` and `protocolVersion`. The list is ordered, and the client selects the first entry it supports. Supported means a binding and a version that the client implements. The client also copies that entry's `tenant` into every request, and omits the field when the entry has none.

**Flags decide which operations exist**

| Flag in `capabilities` | Operations it allows | Error when absent or `false` |
|---|---|---|
| `streaming` | `SendStreamingMessage`, `SubscribeToTask` | `UnsupportedOperationError`, `-32004` |
| `pushNotifications` | the four push configuration operations | `PushNotificationNotSupportedError`, `-32003` |
| `extendedAgentCard` | `GetExtendedAgentCard` | `UnsupportedOperationError`, `-32004` |

An absent flag counts as `false`. In the recorded error run, a push configuration sent to an agent without the flag got `-32003` for a task id that did not even exist. The card had already answered.

**Cache it like any document**

A card changes rarely. The server should send `Cache-Control` with `max-age` and an `ETag`. The client honors them and revalidates with `If-None-Match`.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which field tells you what work the agent can do? Expected: `skills`, each with an `id`, a `name`, a `description` and at least one tag; pick the agent by skills and media modes.
- **Level 2:** The card lists a gRPC entry first and a JSON-RPC entry second, and your client speaks only JSON-RPC. Which URL do you call? Expected: the JSON-RPC one, because the rule is the first entry that you support.
- **Level 2:** How do media types reach the agent? Expected: the card's `defaultInputModes` and `defaultOutputModes`, a skill's own `inputModes` and `outputModes`, and a `mediaType` on each part the client sends.
- **Level 3:** You hold a bearer token and the card sets `extendedAgentCard`. What changes? Expected: call `GetExtendedAgentCard` with the declared credential and use the fuller card in place of the cached public one for that session, or until the card's `version` changes.

**Wrong answers, and why they fail**

- "Read the top-level `url` field of the card." The current version moved the endpoint into `supportedInterfaces`, and there is no top-level `url`.
- "Try the stream and fall back when it fails." The flag answers the question in advance. The failed call costs a round trip for nothing.
- "Put the skill id in the message so the server runs that skill." No field of `SendMessageRequest` or `Message` names a skill. The list describes the agent.

:::

## A root is a hint, not a permission

*Level 2 (working) · concept · about 8 minutes*

A filesystem MCP server reads the client's Roots list once and treats any path under a root as authorized for deletion. The client advertises one workspace directory. Two delete requests arrive: one for a sibling directory whose name starts with the workspace name, and one that reaches the parent through an encoded dot-dot segment. What is wrong with this design, and how do you replace it?

:::answer Show the answer
:::say Short answer
Roots were informational guidance, never authorization and never a sandbox, and the current revision deprecates them. A string-prefix check accepts both hostile paths, because both begin with the workspace text. Replace the root with an explicit `workspaceUri` argument or a resource URI, then enforce three layers: authorize the principal for that workspace, normalize the URI and check containment by path components, and run the server under an operating-system sandbox.
:::

**Full answer**

**What roots were**

Earlier revisions let a client advertise Roots and send `notifications/roots/list_changed`. A root told the server where the user was working. It did not constrain what the server process could read, did not authorize the caller, and created no operating-system boundary. The current revision deprecates `roots/list` for new designs.

**The explicit replacements**

| Situation | Replacement |
|---|---|
| scope varies per call | a `workspaceUri` or `directory` tool argument |
| the operation already targets a resource | the resource URI |
| one deployment owns one fixed workspace | server configuration |
| code must be unable to escape | a process sandbox or jailed filesystem |

The model can see and repeat an explicit handle. Hidden session scope is harder to inspect, replay, audit and route.

**Three layers, every time**

1. Authorization: may this authenticated principal use this workspace?
2. Containment: does the normalized target stay inside the workspace boundary?
3. Sandbox: can the operating system stop a compromised server anyway?

**Why the prefix check fails**

```text
allowed:   file:///work/notes
attacker:  file:///work/notes-evil/secret.md
traversal: file:///work/notes/%2e%2e/private.md
```

Both hostile paths start with the allowed text. Normalize percent-encoded segments first, then compare path components. Re-check containment right before the mutation, because a target can move after the request was validated. A real filesystem server also needs a symbolic-link policy and platform-specific path handling.

**The migration adapter**

If a peer still needs `roots/list` during the deprecation window, the server embeds that request in an MRTR `input_required` result. It never sends a live reverse request. Label the adapter legacy, and never let a legacy root list bypass server authorization.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** When is server configuration the right replacement? Expected: when one deployment owns one fixed workspace; per-call scope belongs in a `workspaceUri` argument.
- **Level 3:** Why re-check containment immediately before the deletion? Expected: the live record can move outside the workspace between validation and mutation, and a race must not delete the wrong target.
- **Level 3:** Why does lexical containment alone not stop a symlink escape? Expected: a link inside the boundary resolves to a path outside it, so the filesystem layer needs a symlink policy and resolution of the real path.
- **Level 4:** A pinned legacy peer still sends `roots/list`. How do you serve it without weakening the modern handler? Expected: an isolated adapter that embeds the request in MRTR input requests, labelled legacy, with authorization and containment still enforced on the server.

**Wrong answers, and why they fail**

- "The client declared the root, so the server can trust the scope." A root is a self-reported hint. Authorization comes from the authenticated principal and server policy.
- "Check `startswith` on the allowed URI." A sibling directory and an encoded traversal both pass. Normalize, then compare path components.
- "An operating-system sandbox makes the authorization check unnecessary." The sandbox is the third layer for a compromised process. It does not decide which principal may touch which workspace.

:::

## A shared cache in front of private notes

*Level 2 (working) · tradeoff · about 8 minutes*

A notes server wants a shared cache in front of it, so its `resources/read` results carry a public scope and a five-minute freshness hint. A security reviewer objects. What is the risk, which scope and freshness do you pick for a user's note, and what do you do with a result that must never be stored at all?

:::answer Show the answer
:::say Short answer
A public scope lets a shared cache hand one user's note to another user who asks for the same URI. Content bound to a user gets `cacheScope: "private"`, which ties the entry to the requesting credential context, and a short freshness such as one minute. MCP defines only `public` and `private`, so a secret-bearing or fast-changing result gets `private` with `ttlMs: 0`, and the host adds a stricter no-store rule in its own cache policy.
:::

**Full answer**

**Two scopes, one rule**

| Scope | Meaning | Typical use |
|---|---|---|
| `public` | may be reused across users when authorization permits | a public prompt catalog |
| `private` | bound to the requesting user or credential context | user-owned note content |

The hints describe freshness and sharing. They never replace authorization. The server still authorizes every read, and a cached response must not cross authorization contexts.

**Which results carry hints**

`tools/list`, `resources/list`, `prompts/list`, `resources/templates/list`, `resources/read` and `server/discover` are cacheable and include `ttlMs` and `cacheScope`. A rendered `prompts/get` result is complete, but it is not one of the cacheable results. A safe default is `ttlMs: 0` with `cacheScope: "private"`.

**Choosing the freshness**

Pick the TTL from the data's change rate and the damage of staleness. A public prompt catalog can live for minutes. A private note read may use one minute. The lesson's examples use `300000` for a resource list, `600000` for a prompt list and `3600000` for discovery.

**Keys and determinism**

A cache key must include every request dimension that changes visibility: tenant, user, scope, locale and pagination cursor. If a shared cache cannot express those dimensions safely, use `private` with a zero TTL and a host-level no-store policy. List results also need deterministic ordering, so that equal results give stable cache keys and stable model context.

**The trade**

A shared cache saves work on public catalogs and costs nothing in safety there. On private content it buys a few milliseconds and risks a cross-user leak that no TTL can shorten to zero. Cache the catalog, not the note.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why must `resources/list` return a stable order? Expected: so that equivalent responses produce stable cache keys and stable model context, and host UIs do not jump between refreshes.
- **Level 2:** A client receives a cached list and wants to know when it changes. What does it do? Expected: open `subscriptions/listen` with the list-change category, and refetch after expiry or after an event.
- **Level 3:** `tools/list` differs by principal because of per-user authorization. Which scope? Expected: `private`; per-user tool visibility must not sit behind a shared public cache.
- **Level 4:** The team proposes `cacheScope: "no-store"`. What do you answer? Expected: it is not an MCP value; return `private` with `ttlMs: 0` and apply no-store in the host cache policy.

**Wrong answers, and why they fail**

- "A short TTL makes the public scope safe." Scope decides who may share an entry, and TTL decides for how long. One second of sharing still leaks the note.
- "The cache hints are the authorization." They are freshness and sharing hints. The server authorizes every read on its own.
- "Only tool lists need cache hints." Resource reads and discovery carry them too, and a user-specific read is where the private scope matters most.

:::

## Sticky sessions, GET streams and resume on the modern wire

*Level 2 (working) · concept · about 9 minutes*

A platform team deploys an MCP server over Streamable HTTP behind a load balancer with two replicas. They configure sticky routing keyed on `Mcp-Session-Id`, keep a standalone `GET /mcp` stream for change notifications, and plan to resume a broken stream with `Last-Event-ID`. Which of these belong to the current revision, and what replaces the rest?

:::answer Show the answer
:::say Short answer
None of the three belongs to the current revision. The endpoint accepts POST only: `GET /mcp` and `DELETE /mcp` return `405`, `Mcp-Session-Id` is ignored and never minted, and `Last-Event-ID` is ignored because streams do not resume. Change notifications arrive on a client-opened `subscriptions/listen` POST whose response stays open as SSE, and a dropped stream is replaced by a new listen request and a refetch of the affected data.
:::

**Full answer**

**The modern wire in one table**

| Message | HTTP shape |
|---|---|
| any JSON-RPC request | a new POST with one message in the body |
| the response | `application/json` with one response, or `text/event-stream` with related notifications and then the final response |
| an accepted notification | `202 Accepted` with no body |
| `GET` or `DELETE` on the endpoint | `405 Method Not Allowed` |

The client advertises both response types with `Accept: application/json, text/event-stream`.

**Why stickiness is not needed**

Every request carries its protocol version and client capabilities in `params._meta`, so any healthy worker can validate it. Three headers mirror the body for routing and policy: `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` for `tools/call`, `resources/read` and `prompts/get`. The server compares each header with the body before it executes. A missing or mismatched header is HTTP `400` with JSON-RPC `-32020`.

**Where notifications come from**

The client sends `subscriptions/listen` as a normal request with a `notifications` filter, for example `toolsListChanged: true` and a list of `resourceSubscriptions`. The first message on the stream is `notifications/subscriptions/acknowledged`. Every event and the final result carry `io.modelcontextprotocol/subscriptionId`, equal to the listen request id. When the stream drops, the client reissues the request with a new id and refetches tools, resources or prompts. `resources/subscribe` belongs to the legacy era.

**What a broken request-scoped stream means**

The in-flight request is lost. The client may issue a new request with a new JSON-RPC id when a retry is safe. It must not attempt stream resumption, and the server must not add SSE ids for replay.

**Two more rules at the boundary**

- Validate `Origin` with exact matching, and return `403` when it is present and not allowed. Local servers bind to `127.0.0.1`. This defends against DNS rebinding and is not authentication.
- Keep a legacy HTTP+SSE bridge, if you need one, on separate endpoints, and never describe its GET stream, session id or replay as part of the current revision.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How does a client cancel an in-flight request over this transport? Expected: it closes that request's response stream; there is no cancellation POST.
- **Level 3:** Why is a `startswith` test on the trusted origin unsafe? Expected: it accepts an attacker-controlled suffix on the host name; match the canonical origin exactly.
- **Level 3:** A dual-era client receives `405` from an unknown server. Does it fall back to the old GET endpoint? Expected: only after reading the body; a recognized modern JSON-RPC error proves the server is modern, and only an empty or unrecognized body justifies the legacy attempt.
- **Level 4:** A workflow needs state across two calls on two replicas. Where does it live? Expected: behind a server-minted opaque handle in a shared store, returned as an ordinary result, bound to the principal, expired, and authorized on each use.

**Wrong answers, and why they fail**

- "Sticky routing is harmless, so keep it as a safety net." It hides a correctness bug until a rollout, a reschedule or a failover moves the next request to another replica.
- "Add SSE event ids so that clients can resume." Modern streams are not resumable. A lost request is retried with a new id when the operation allows it.
- "Origin validation authenticates the caller." It stops DNS rebinding only. A network service still authenticates and authorizes every request.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## The pagination loop that ends two pages short

*Level 2 (working) · code-reading · about 7 minutes*

A client collects the tool list of an MCP server with this loop:

```python
tools = []
cursor = None
while True:
    result = call("tools/list", cursor=cursor)
    tools.extend(result["tools"])
    if not result.get("nextCursor"):
        break
    cursor = result["nextCursor"]
```

Against one server the client sees only the first page, and the trace shows a single request. Read the code and find the bug. Then name two more things a client must never do with a cursor.

:::answer Show the answer
:::say Short answer
The loop tests the cursor for truthiness, and an empty string is a valid cursor. The server returned `""` after its first page, the test read it as false, and the loop stopped before the second request. Stop only when `nextCursor` is absent or `null`, and send the value back exactly as received. A client must also never decode a cursor or compare two cursors for order.
:::

**Full answer**

**The one decision a client gets**

```python
if result.get("nextCursor") is None:
    break
cursor = result["nextCursor"]
```

The server chooses the page size and the cursor format. The sample server in the lesson deliberately returns `""` after its first page, and the correct trace is one request with no cursor followed by one request with the cursor `""`.

**Cursors are opaque**

Do not decode a cursor, increment it, compare it with a prior cursor, or infer a page number from it. A server may sign a cursor, bind it to a catalog version, or map it to private state. That is the server's detail and may change without notice. An invalid cursor returns JSON-RPC invalid params, `-32602`.

**Why the bug matters**

The tool list is the first gate of the contract pipeline: discover, admit, invoke, execute, consume. A client that drops the last pages exposes a partial catalog to the model and may miss the descriptor it was asked to admit or reject. Discovery must be deterministic and complete before admission starts.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** A page arrives with `nextCursor` present and an empty `tools` array. Do you continue? Expected: yes; continue whenever `nextCursor` is present and not `null`.
- **Level 2:** A cursor looks like base64. May the client decode it to skip ahead? Expected: no; the value is opaque, and the server may sign it or bind it to a catalog version.
- **Level 3:** What should a server put in a cursor so that a client cannot misuse it? Expected: a signed or server-mapped token, bound to a catalog version where needed, with an invalid or stale value rejected as `-32602`.
- **Level 4:** What evidence proves complete paginated discovery for a gateway? Expected: the page trace, the admitted and rejected descriptor sets, and a check that repeated calls give the same logical order.

**Wrong answers, and why they fail**

- "An empty string means no more pages." It is a valid cursor. Only absence or `null` ends the loop.
- "Parse the cursor to compute the page number." The format belongs to the server and may be signed or private state.
- "Compare the new cursor with the old one to detect a loop." Clients must not compare cursors for ordering.

**Related lesson in this course:** [Systems 3: indexing, and why a query is slow](#systems-3)

:::

## The pin that passed a changed tool

*Level 2 (working) · debug · about 9 minutes*

Your gateway pins each approved tool by hashing its description text. A connected server ships an update. The description is unchanged, but the `inputSchema` gains a `destination` field and `destructiveHint` flips to false. The pin passes, and the model begins calling the tool with the new argument. What went wrong, and how do you pin correctly?

:::answer Show the answer
:::say Short answer
The pin covered one field, so a schema and annotation change passed as unchanged. Canonicalize the complete descriptor with sorted keys, hash it, and store the digest under a qualified name together with publisher evidence and the approval time. On every refresh, quarantine an unknown key or a changed digest until a person re-approves it. Hash equality proves stability, not safety, so the first descriptor needs review too.
:::

**Full answer**

**Pin the whole descriptor**

```python
normalized = json.dumps(tool, sort_keys=True, separators=(",", ":"))
digest = hashlib.sha256(normalized.encode()).hexdigest()
```

Store the digest under a qualified key such as `notes.export`. On every refresh:

| Observation | Action |
|---|---|
| unknown key | quarantine until review |
| same key, different digest | quarantine as a rug pull until re-approved |
| duplicate unqualified name | require deterministic namespacing |
| scanner hit | block and review the complete descriptor |

**Seven surfaces, not one**

Metadata poisoning, the descriptor rug pull, cross-server shadowing, header and body confusion, capability escalation, MRTR state tampering, and supply-chain identity confusion overlap. Hash pinning helps with changes but does not prove the first version was safe. A static scanner catches obvious phrases and misses subtle ones. Namespacing prevents one collision class and not a malicious namespaced server. Stack the controls.

**The scanner is a tripwire**

Simple patterns flag role tags, instruction overrides, concealment, secret access and obscured network destinations. They are cheap at install time and in CI. They are not a semantic proof: a safe description can contain a flagged phrase in a warning, and a malicious one can avoid every phrase. Treat a hit as review evidence.

**Namespace before you merge**

When two servers both expose `search`, never let discovery order decide. The qualified names `notes.search` and `issues.search` become the public gateway names, and the backend mapping is recorded separately. Stable names make approval, audit, pins and `Mcp-Name` routing refer to the same object.

**Run the checks twice**

Run the pin comparison at discovery and again before dispatch. A cache can reduce discovery work, but a cached approval must expire or be invalidated when the descriptor changes.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does a clean scanner result prove? Expected: nothing semantic; it is review evidence, not an innocence score.
- **Level 3:** The server's `serverInfo` says it is the familiar publisher. How much trust does that buy? Expected: none; it is self-reported display data for logs, not a certificate or registry proof.
- **Level 3:** The descriptor was poisoned on day one and the pin stored that digest. What catches it? Expected: review before the first approval, with the scanner as a tripwire; the hash cannot.
- **Level 4:** How does a gateway stop the model from treating annotations as policy? Expected: annotations stay presentation hints; authorization binds the principal to the exact verb, resource and normalized arguments, and a consequential call needs action-bound approval.

**Wrong answers, and why they fail**

- "Hash the description; the schema is only typing." The schema decides which arguments the model can send, and a new field can route data to a new destination.
- "A matching hash means the tool is safe." It means the descriptor did not change. A poisoned descriptor stays poisoned when pinned.
- "Set `destructiveHint` and the host will confirm." Annotations are untrusted hints. The server enforces authorization and approval.

:::

## The poll loop that never ends and the deploy that should not

*Level 2 (working) · debug · about 8 minutes*

A planner polls a remote agent with `GetTask` until a task is done. It stops when the state is completed, failed or canceled. Against a deploy agent, the loop never returns. Against a test runner, the planner deploys a build whose test suite had a failure. Explain both bugs.

:::answer Show the answer
:::say Short answer
The loop knows three terminal states, and there are four. The deploy agent rejected the task, and a task in `TASK_STATE_REJECTED` never changes again, so the loop spins forever. The test runner finished the work it was asked to do, so its task is `TASK_STATE_COMPLETED` even with a failing test, because the verdict is a result and results travel in artifacts.
:::

**Full answer**

**Nine states, two sets the client must hard-code**

| Class | States |
|---|---|
| active | `TASK_STATE_SUBMITTED`, `TASK_STATE_WORKING` |
| interrupted | `TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_AUTH_REQUIRED` |
| terminal | `TASK_STATE_COMPLETED`, `TASK_STATE_FAILED`, `TASK_STATE_CANCELED`, `TASK_STATE_REJECTED` |

`TASK_STATE_UNSPECIFIED` is the proto zero value. Treat it, and any unknown name, as an error. The proto marks four states terminal and two interrupted, and it gives no transition table, so accept any transition out of a state that is not terminal. A deploy agent can reject straight from submitted.

**Bug one: the forgotten ending**

Rejected means the agent decided not to do the task. In the recorded run the status message read "Production deploys are outside this agent's policy. Use the release train." The same request gets the same refusal, so the planner should stop and follow the message, not retry.

**Bug two: a state is not a verdict**

Completed means the task finished successfully, and the job was to run the suite. In the recorded blocking run the status message said "1 failed, 11 passed", and the `summary.json` artifact carried `"passed": 11` and `"failed": 1`. A planner reads the `failed` count in that data part before it deploys. A message should not carry the output of a task.

**What a finished task still answers**

| Call on a terminal task | Reply |
|---|---|
| `GetTask` | the final task, while the server keeps it |
| `SendMessage` with its `taskId` | `UnsupportedOperationError`, `-32004` |
| `SubscribeToTask` | `UnsupportedOperationError`, `-32004` |
| `CancelTask` | `TaskNotCancelableError`, `-32002` |

To go on, start a new task in the same `contextId` and name the finished task in `referenceTaskIds`.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which other states must the loop handle, and how? Expected: the two interrupted states; answer `TASK_STATE_INPUT_REQUIRED` with a message on the same task, and route `TASK_STATE_AUTH_REQUIRED` to an approver outside A2A while you subscribe or poll.
- **Level 3:** You call `CancelTask` and get `-32002`. What next? Expected: call `GetTask`; canceled means an earlier cancel worked, another terminal state means the task ended first, and a running state means the server cannot stop it.
- **Level 3:** The agent process crashed mid-task and your blocking send returned an error. Is the task failed? Expected: treat the outcome as unknown; the reference SDK stores the task as failed, but the client only saw an error, so read the task back.
- **Level 4:** How do you continue a completed review with a changed diff? Expected: a new task with the same `contextId`, no `taskId`, and the old task in `referenceTaskIds`; a terminal task takes no more messages.

**Wrong answers, and why they fail**

- "Compare the state with the lower-case string `completed`." The current version sends enum names such as `TASK_STATE_COMPLETED`, and an unknown name must be an error, not a wait.
- "A completed task means the tests passed." Completed means the agent finished the work it was asked to do. The verdict is in the artifact.
- "Send another message to the rejected task and ask again." A terminal task refuses messages. Start a new task in the same context.

:::

## Three cancellations that look like one

*Level 2 (working) · concept · about 8 minutes*

A client library exposes one `cancel(request)` method that behaves the same on stdio and on Streamable HTTP: it writes or POSTs a `notifications/cancelled` notification for the request id. Over HTTP, servers keep running the work and sometimes send a response after the cancel. A second method, `cancelTask`, returns success, the UI shows "stopped", and the worker keeps going. What is wrong with both methods?

:::answer Show the answer
:::say Short answer
Cancellation is transport-specific, and a durable task is a third thing. On stdio the client sends `notifications/cancelled` with the request id and receives no response. On Streamable HTTP the signal is closing that request's response stream, and a POSTed cancellation notification is the wrong signal. `tasks/cancel` acknowledges intent for a durable task that may stay `working` until a worker checkpoint observes the flag, so the UI must poll until a terminal status.
:::

**Full answer**

**Three mechanisms**

| Mechanism | Target | Signal | What success means |
|---|---|---|---|
| request cancellation on stdio | one in-flight RPC | `notifications/cancelled` | the client abandoned the request; the server should stop if practical |
| request cancellation on HTTP | one in-flight response stream | close the stream | the same |
| `tasks/cancel` | one durable Task | an ordinary MCP request | the server acknowledged the intent |

The intent is the same on both transports: the client no longer needs the result. The wire signal differs because stdio shares one channel for everything, while each HTTP request owns its own response or SSE stream.

**Cancellation is a race**

Two orders are both valid. If the cancellation arrives first, the server marks the request cancelled and suppresses the response when the worker finishes. If the worker commits first, the server sends the response and ignores the late notification, and the client ignores a late response for a request it abandoned. Neither side can prove which event the other saw first. Malformed, unknown and already-completed cancellations are ignored, because turning those races into errors would create more races.

**What a server may send**

A server does not use `notifications/cancelled` to cancel arbitrary client calls. On stdio, server-sent cancellation is reserved for terminating a `subscriptions/listen` request. Progress notifications must increase and stop after completion or cancellation.

**Why the task outlives the connection**

The reason to create a Task is that its lifecycle outlives one request and one connection. Do not erase task state when the HTTP connection closes, and do not treat a `tasks/cancel` result as proof the worker stopped. Poll the Task until a terminal status.

**Two timeouts, not one**

A cancel often comes from a timeout. Use an idle timeout that progress may reset and a maximum timeout from request start that nothing resets. A keepalive comment on the stream is not progress.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** The server receives a cancellation for a request that already finished. Does it return an error? Expected: no, it ignores the notification; a notification receives no response in any case.
- **Level 3:** The worker commits a mutation just before the cancel reaches the server. What does each side do? Expected: the server has sent the response and ignores the late notification; the client ignores the late response, and the idempotency contract decides whether a retry is safe.
- **Level 3:** When may a server itself send `notifications/cancelled`? Expected: on stdio only, to terminate a `subscriptions/listen` request; never for ordinary client calls.
- **Level 4:** A `subscriptions/listen` stream drops mid-task. Does the Task behind it change state? Expected: no; the client opens a new listen request with a new id and refetches the Task, and durable state is untouched by the dropped stream.

**Wrong answers, and why they fail**

- "POST `notifications/cancelled` over HTTP too, for symmetry." Each HTTP request owns its response stream, and closing it is the signal that matches the request lifetime.
- "A successful `tasks/cancel` means the worker stopped." It acknowledges the request. The task can stay `working` until a checkpoint, and the work can finish first.
- "Return an error for a cancellation of an unknown request id." Unknown, malformed and completed cancellations are ignored by design.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## Two errors from a client that forgot the version

*Level 2 (working) · debug · about 8 minutes*

A client written for an older A2A release calls a current agent. Its first `SendMessage` carries only `Host` and `Content-Type` headers and gets HTTP 200 with a JSON-RPC error, code `-32009`. Its second call sends `A2A-Version: 1.0`, names the method `message/send` and gets code `-32601`. Explain both replies, and name the two changes the client needs.

:::answer Show the answer
:::say Short answer
Both replies are a current server reading an old client. An empty `A2A-Version` must be read as version 0.3, and an interface that serves only 1.0 answers `VersionNotSupportedError`; the recorded run reported the request as `0.3 (no header)` against `supported: 1.0`. `message/send` is the old method name, and 1.0 uses the PascalCase rpc names such as `SendMessage`, so the second call is method-not-found. The client must send `A2A-Version: 1.0` on every request and switch to the 1.0 names.
:::

**Full answer**

**The version header**

`A2A-Version` and `A2A-Extensions` are service parameters. They travel as HTTP request headers in the JSON-RPC and HTTP+JSON bindings and as lowercase metadata keys in gRPC. A version is `Major.Minor`, and requests, responses and cards should not carry a patch number. The server has two duties: process the request with the semantics of that version, and return `VersionNotSupportedError` when the interface does not support it. The error is `-32009` in JSON-RPC, `400` in HTTP+JSON and `FAILED_PRECONDITION` in gRPC.

Never rely on the server to refuse a missing header. In the recorded SDK comparison, one server never reads the header at all, and another accepts a missing one as 1.0. Three samples in the specification itself still send the old value, so copy the value from the card's `protocolVersion`, not from a sample.

**What else changed**

| Area | Old | 1.0 |
|---|---|---|
| method names | `message/send`, `tasks/get`, `tasks/resubscribe` | `SendMessage`, `GetTask`, `SubscribeToTask` |
| task states and roles | `"working"`, `"user"` | `TASK_STATE_WORKING`, `ROLE_USER` |
| parts | `TextPart`, `FilePart`, `DataPart` with `kind` | one `Part` whose `text`, `raw`, `url` or `data` member names the type |
| end of a stream | `final: true` on the last status update | the binding closes the stream |
| card endpoint | `url`, `preferredTransport`, `additionalInterfaces` | `supportedInterfaces[]` with `url`, `protocolBinding`, `protocolVersion` |
| errors | problem details | a `Status` object with an `ErrorInfo` detail, plus `-32008` and `-32009` |

**The change the migration guide misses**

The old `blocking` flag defaulted to false, so a send returned at once. Its replacement `returnImmediately` also defaults to false, which now means the send waits for a terminal or interrupted state. A migrated client that polls after a send must set `returnImmediately: true`, or it holds one request open for the whole task.

**Serving old clients during the overlap**

Each SDK has a 0.3 layer. The reference SDK takes a flag on its route builders plus a second `AgentInterface` with `protocolVersion` `0.3` on the card, and routes by method name before the version check. Others route by the header or by a second URL. The proto is normative where the migration guide names a field the proto lacks.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why send `1.0` and not the release `1.0.1`? Expected: the version is `Major.Minor`; no patch number travels in requests, responses or cards.
- **Level 3:** After the fix, the client's sends hang for the length of each task. Why? Expected: the old `blocking` default was false and the new `returnImmediately` default is also false, which now means wait; set it to true and poll or subscribe.
- **Level 3:** Will every server reject a request that carries no version at all? Expected: no; one SDK never reads the header and another accepts its absence, so the client must send it on every call.
- **Level 4:** You must serve both old and new clients for a quarter. What do you change on the server? Expected: turn on the SDK's 0.3 layer, add a second interface with `protocolVersion` `0.3` to the card, and route by header, method name or URL as that SDK does.

**Wrong answers, and why they fail**

- "HTTP 200 means the call worked." JSON-RPC errors arrive inside a 200 response; read the `error` member before `result`.
- "Send the version as a query parameter instead." Both JSON bindings require the header, and the reference SDK reads only the header.
- "The method name is case-insensitive." The names are exact PascalCase rpc names, and the old slash form is unknown to a 1.0 server.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## Why every MCP request repeats its metadata

*Level 2 (working) · concept · about 8 minutes*

A colleague ports an MCP server from the 2025 revision. The port keeps the `initialize` handshake and stores the client's declared capabilities on the connection object for later requests. All the old tests pass. What breaks under the current revision, and where does the metadata have to live instead?

:::answer Show the answer
:::say Short answer
The current revision has no handshake and no protocol session. A server that remembers capabilities from an earlier message can apply the wrong permissions or the wrong wire shape to the next request, which may come from another client on the same process or land on another worker. Every request carries `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities` in `params._meta`, and the server validates them on each request and forgets them after it answers.
:::

**Full answer**

**The request is the unit of interpretation**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": {"name": "course-client", "version": "1.0.0"}
    }
  }
}
```

The version and the capabilities are required. `clientInfo` is recommended, self-reported, and never a credential. The server must not infer any of these from an earlier request, a stdio process, an HTTP connection or a transport header alone.

**What the server returns**

Every successful result includes `resultType: "complete"` and should carry `io.modelcontextprotocol/serverInfo` in its `_meta`. The list results, `resources/read` and `server/discover` also carry `ttlMs` and `cacheScope`, with deterministic ordering so that equal results give stable cache keys.

**Discovery is a method, not a gate**

Every server must implement `server/discover`. It returns `supportedVersions`, capabilities, optional instructions and server identity. A client may call it first, but it may also send `tools/list` at once, because that request already carries its metadata.

**The error codes that replace negotiation**

| Case | Code |
|---|---|
| metadata missing or malformed | `-32602` |
| header disagrees with body at an HTTP boundary | `-32020` |
| version matched but unsupported | `-32022`, with `requested` and `supported` |

The client picks a mutually supported version from `supported` and retries with a new request id.

**Keep the eras apart**

Revisions through `2025-11-25` use `initialize`, `notifications/initialized` and connection-scoped capabilities. A dual-era server may keep that path as an isolated legacy adapter that it selects only when it receives `initialize`. It never routes a current request through the handshake path and never stamps `resultType` onto legacy results.

**Application state is still allowed**

A workflow or a draft can live behind an opaque handle in a shared store. The client sends the handle as an ordinary argument, and every replica authenticates and authorizes its use. Protocol context must not leak into that store as a substitute for the removed session.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Is `clientInfo` required, and can you authorize on it? Expected: it is recommended, not required; it is display and debugging data and never a credential.
- **Level 2:** A client sends `tools/list` without calling `server/discover`. Does the server reject it? Expected: no; the request carries its version and capabilities, so discovery is not a gate.
- **Level 3:** What does closing stdin or ending an HTTP response terminate? Expected: transport activity only; there is no protocol session to end, and the next request must still describe itself.
- **Level 4:** Where does a multi-step workflow keep its state now? Expected: behind a server-minted opaque handle in a shared durable store, returned as a normal result, bound to the authenticated principal, expired, and authorized on every use.

**Wrong answers, and why they fail**

- "Stateless means the server cannot keep any state at all." Durable application state behind an explicit handle is allowed. Only hidden protocol context is removed.
- "Send `initialize` first to be safe with every server." A current server must not receive `initialize` by default. Legacy is a documented fallback for a pinned peer.
- "The connection identifies the client, so one capability check per connection is enough." Two clients can share one process or HTTP worker in sequence, and a remote request can land on any replica.

**Related lesson in this course:** [Deep dive 10: the Model Context Protocol in depth](#aideep-10)

:::

## A webhook that may fire twice or not at all

*Level 3 (senior) · tradeoff · about 10 minutes*

A test run outlasts any connection your planner can hold open, so you want a webhook. Compare a webhook with polling and with streaming for this case. Then list the receiver's duties, given that the agent promises only to try each delivery at least once, and that the config operations return the stored webhook credentials to anyone who can call them.

:::answer Show the answer
:::say Short answer
Register the config inline in `SendMessage` with `returnImmediately: true`, so that no event escapes before the config exists, and close the connection. Delivery is at least once, so a notification can arrive twice or, after an outage, not at all: the receiver answers 2xx, checks the task id, processes idempotently, and reads the task with `GetTask` before it acts. Put the secret your receiver checks in `authentication`, because `token` has no standard header, and restrict who can call the four config operations, because a read returns the credentials in clear.
:::

**Full answer**

**Three ways to wait**

| Mechanism | Holds a connection | Learns of a change | Cost when the client restarts |
|---|---|---|---|
| polling with `GetTask` | no | on the next poll | none, the task is stored |
| `SendStreamingMessage` or `SubscribeToTask` | yes | at once | missed frames; subscribe again for a snapshot |
| webhook | no | at once, when delivery succeeds | missed deliveries; read the task |

A webhook suits work that outlasts the caller. It moves the connection problem to the receiver and adds a second trust boundary.

**What arrives**

Each notification is one HTTP POST whose body is one `StreamResponse` in the HTTP+JSON form, with no JSON-RPC envelope. In the recorded run the first body was a `statusUpdate` with `TASK_STATE_WORKING`, under `Content-Type: application/a2a+json`, `Authorization: Bearer <secret>` and `X-A2A-Notification-Token`. The SDKs differ on the content type, on the token header, and on timeouts of 5 s or 30 s, and none of them retries. So accept both content types, read either token header, and handle every `StreamResponse` member, because the reference SDK also posts the first `Task`.

**The receiver's duties**

1. Answer with a 2xx status to confirm receipt.
2. Check that the task id matches a task you expect.
3. Process idempotently. A status update is safe to apply twice, keyed by task id and timestamp. An `artifactUpdate` with `append: true` is not, and no delivery id exists.
4. Treat each notification as a signal and read the task with `GetTask` before you act.
5. Check the `Authorization` value against the credential you put in `authentication`.

**The agent's duties, and where they fail**

The agent must put the configured credentials in the request headers and should validate the URL against server-side request forgery, rejecting private ranges such as `10.0.0.0/8` and `192.168.0.0/16`, loopback and link-local addresses. The reference SDK's validator does that only when the host turns it on. A config must stay until the task completes or a client deletes it, and a delete must be idempotent.

**The trade**

Inline registration costs one field and closes the gap between the first event and the config. The secret in `authentication` costs a per-run value and buys a check the receiver can make. The read-back of credentials in clear is the price of the four config operations, so scope them to the task's owner.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** An `artifactUpdate` with `append: true` arrives twice. Why can you not apply it twice? Expected: it duplicates parts, and there is no delivery id to deduplicate on, so read the task instead.
- **Level 3:** The receiver was down for a minute. What did it miss? Expected: possibly everything, because no SDK retries; read the task when the receiver returns.
- **Level 4:** Why must the agent reject a webhook URL inside a private range? Expected: the agent calls that URL for every later event of the task, so an outside caller could aim the agent's requests at an internal service.
- **Level 4:** Who may call `ListTaskPushNotificationConfigs`, and why? Expected: only the task's owner, because the reply returns `credentials` and `token` unchanged.

**Wrong answers, and why they fail**

- "Register the webhook after the task starts with the create operation." Events before the config exists are lost. Inline registration leaves no gap.
- "Authenticate on the token header." The specification gives `token` no transport, and the SDKs use two header names. Put the secret in `authentication` and check `Authorization`.
- "Apply each notification as it arrives." Duplicates and lost deliveries both happen. The stored task is the source of truth.

**Related lesson in this course:** [Systems 7: idempotency, making a retry safe](#systems-7)

:::
