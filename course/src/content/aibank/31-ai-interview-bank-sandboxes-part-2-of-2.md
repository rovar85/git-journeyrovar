---
track: aibank
title: "AI interview bank: Sandboxes (part 2 of 2)"
short: Sandboxes 2
sub: 6 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## One allowlist for every laptop, and who can widen it

*Level 3 (senior) · tradeoff · about 10 minutes*

Security wants one allowlist across every developer laptop, a record of each host an agent reached, and proof that no developer can widen the list. Compare local policy on each laptop with an organization policy from the governance product. What changes on a laptop the moment a policy becomes active, and what does one audit record hold?

:::answer Show the answer
:::say Short answer
Local policy gives each laptop its own preset and rules, a per-host `policy log`, and a developer who can add a global allow at will, so it fails the third requirement. An organization policy is written centrally, reaches the daemon within 5 minutes, and from then on only organization allow rules grant access: local and kit allow rules go inactive, local and kit deny rules still apply, and a local deny even beats an organization approval requirement. The daemon then writes one JSONL audit record per decision, holding metadata such as the decision, the resource, the deny reason, the action type and the agent, and never prompt content, agent output or parameter values; the cost is a paid subscription, and the coverage is local sandboxes only.
:::

**Full answer**

**What the organization can write**

Three policy kinds exist: network access, filesystem access and MCP access. A network rule is HTTP, one destination with methods and path patterns, or all traffic over TCP, UDP or both, with allow or deny, and it can require approval so that each allowed destination waits once for the developer's confirmation. An MCP policy is Cedar in the `MCP` namespace, default deny, where a `forbid` beats every `permit`. An organization holds at most 100 policies of 250 rules and 400 KB each. Network rules apply to the next request, filesystem rules only when a sandbox is created, and MCP registration rules at the next `sbx mcp add`.

**What the laptop loses and keeps**

| Rule | Evaluated under governance |
|---|---|
| organization allow | yes |
| organization deny | yes |
| local allow | no |
| local deny | yes |
| kit allow | no |
| kit deny | yes |

`sbx policy reset` forces the pull at the price of every local rule and recorded approval. The test for an active policy is the `Governance: Managed by <org>` line in `sbx policy ls`, and `check network` reports `"governance": {"active": false}` on an unmanaged machine, which is what the recorded capture showed. Sign-in enforcement lists `allowedOrgs` in a managed profile, and `sbx login` then revokes a credential from any other account.

**The audit record**

The daemon writes records only for a signed-in user with a governance license under an enforced policy; the CLI never writes one. Files are named `audit-<utc-timestamp>-<process-uuid>-<seq>.jsonl`, finalized from `.tmp` every 5 minutes, 1000 events or 50 MiB, and never deleted. `category` is management, evaluation or execution; `decision` has five values from allow to approval-deny; `action_type` names the payload, such as `network_egress`, `http_request` with method, host, port and path, or `tool_invocation`. The sample record's `deny_reason` carries the same string that a local `policy log` prints: `no applicable policies for op(action=net:connect:tcp, resource=net:domain:example.com:443)`. Cloud delivery keeps events searchable for 90 days and forwards to SIEMs.

**Where governance stops**

It covers local sandboxes only; a cloud sandbox uses its own account and policy store. A server registered on the host with `--command` runs as the host user outside the proxy. And a rule that allows a host still allows any request to it unless an HTTP rule narrows it.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** A developer adds a global allow for a new host under governance. Does the agent reach it? Expected: no; local allow rules are inactive while a policy is active, and only the organization's allows grant.
- **Level 3:** The organization tightens a filesystem rule. Which sandboxes see it? Expected: new ones; filesystem rules apply at creation, so remove and recreate the running ones.
- **Level 4:** What must a SIEM pipeline not expect from these records? Expected: prompt text, output or parameter values; map fields by `schema_version` and collect only finalized `.jsonl` files.
- **Level 4:** Where would an attacker who controls a laptop still widen egress? Expected: nowhere through policy; a host-side `--command` MCP server or a cloud sandbox under another account sits outside the governed proxy.

**Wrong answers, and why they fail**

- "An organization policy adds to the local allowlist." It replaces it; local and kit allows stop granting while it is active.
- "Every laptop has the audit log." Only a licensed, signed-in user under an enforced policy produces records; the recorded capture produced none.
- "A local deny under governance prompts for approval." It blocks with no prompt; a deny beats the approval requirement.

:::

## Three failures in one sandboxed agent run

*Level 3 (senior) · debug · about 10 minutes*

`docker-agent run --sandbox agent.yaml` prints a launch summary, creates the VM, and dies with `Error: creating session store: migration failed even after database reset: failed to create migrations table: attempt to write a readonly database (1032)`. An earlier attempt was refused for `--data-dir` pointing at the home directory, and the very first model call of the day returned `403 Blocked by network policy`. Explain all three, and say what the launch summary should have told you before the run.

:::answer Show the answer
:::say Short answer
Three causes, none of them the agent file. With `--sandbox`, a data directory outside the workspace is refused, because only the workspace is writable from the VM. The 403 means the model host was not on the persistent allowlist: `docker-agent sandbox allow localhost:12434` fixes it, and the port is `localhost` because the proxy rewrites `host.docker.internal` to `localhost` before it checks the rule. The readonly database is SQLite failing to write through the `virtiofs` workspace mount on this host, although `mount` lists it `rw`; a plain Python `sqlite3` write on the same mount fails the same way, and the VM stays running after the error, so you remove it yourself.
:::

**Full answer**

**Read the launch summary first**

The summary names everything the run will trust: `Models gateway: none configured`, the catalog host allowlisted for the proxy, the user allowlist with the hosts you added, then the sandbox name, the mounts with their modes, the image, and the resources. In the recorded run the workspace was `rw`, and the agent file's directory, the staged kit under `.m101/cache/sandbox-kits/<hash>` and the config directory were `ro`. The image was `docker/docker-agent-sbx-templates:latest`, with `cpu 10` and `memory 32 GiB`. Every later failure is explained by one of those rows.

**The data directory**

The capture kit keeps the runtime out of `~/.cagent` with `--data-dir`, `--cache-dir` and `--config-dir`. With `--sandbox`, the refusal reads `--data-dir must be inside the sandbox's writable workspace`, so all three went under `.m101/` in the workspace. That put the session database on the mount, which is where the third failure comes from.

**The model host and the proxy**

Inside the VM, `127.0.0.1` is the VM, so the agent file's provider points at `host.docker.internal:12434`. The request leaves through `HTTP_PROXY` at `gateway.docker.internal:3128`, because that host is not in `NO_PROXY`, and the sandbox proxy translates the name to `localhost`. The rule must therefore say `localhost:12434`. The in-VM allowlist reads empty, because allowed hosts arrive as proxy rules on the host, not as a list inside. The provider keys inside read `proxy-managed`.

**The readonly database**

The data directory sits on the workspace mount, listed as `rw`. SQLite could not create its migrations table there, and a Python `sqlite3` probe on the same mount failed identically, so the fault is the write path through `virtiofs` on this host, not the agent. The capture proved the rest of the path by starting the same agent file inside the VM by hand with state under `/tmp/m101`: the model call went out through the proxy and the answer was correct. The runtime exits on the error and does not stop or remove the VM; `sbx ls` still shows it `running`, and `sbx rm --force` ends it. A later run from the same workspace reuses the VM unless the set of mounts changed.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does `127.0.0.1:12434` in the agent file fail inside while it works on the host? Expected: loopback inside the VM is the VM; use `host.docker.internal`, and allow `localhost:12434` because the proxy rewrites the name.
- **Level 3:** You allowed a host and the agent inside prints an empty allowlist. Is the rule missing? Expected: no; the rule lives in the host proxy, and the in-VM list is not where enforcement happens.
- **Level 4:** How do you prove the SQLite error is the mount? Expected: a Python `sqlite3` write on the same mount fails identically, `mount` still shows `rw`, and the same agent runs with state under `/tmp` inside.
- **Level 4:** What does the failed run leave behind, and what cleans it? Expected: a running VM that the runtime neither stops nor removes; `sbx rm` the sandbox, or expect the next run to reuse it.

**Wrong answers, and why they fail**

- "The workspace is read-only, so change its permissions." The mount is `rw`; the failure is SQLite's write path through the mount, which a direct probe reproduces.
- "Point `--data-dir` at the home directory like the help suggests." With `--sandbox` that is refused; only the workspace is writable.
- "Allow `host.docker.internal:12434`." The proxy translates the name to `localhost` before the check, so the rule must name `localhost`.

:::

## Two mixins, one host, and the update that must stop

*Level 3 (senior) · design · about 10 minutes*

Your composition is one workload and two mixins. Mixin A allows `api.example.com` outright. Mixin B allows `api.example.com` with `methods: [GET]` only and denies `DELETE` on it. Next week mixin A ships a version that removes one of its deny entries and adds a `credential@1`. Predict the merged grant set, say which updates apply silently, and design the review step.

:::answer Show the answer
:::say Short answer
Allow entries union per phase, deny entries union per phase, and deny wins on the result. A's unbounded host allow swallows B's bounded `GET` entry, because the union of an unbounded grant and a bounded one is the unbounded grant, while B's `DELETE` deny survives and wins. Every grant maps onto one normalized set that the consumer stores in its lock file, and a candidate version whose set stays inside the stored set applies silently; any widening stops for approval, and a removed deny and a new credential are both on that list, so A's new version stops twice.
:::

**Full answer**

**What a capability is**

A kit grants itself nothing. Each entry in `capabilities` is a typed, versioned request, `<namespace>/<name>@<version>`, that the host answers with granted, refused or prompted. The `config` is decoded strictly for the types the specification defines, so an unknown key is an error, and the reason is policy: a misspelled key that the parser ignored would be a policy that is missing without a warning. Unknown types are allowed by design; a required unknown type fails resolution and an optional one is skipped and recorded.

**network-policy@2 and credential@1**

A `network-policy@2` entry is a plain host string, which grants the connection for any protocol, or an object with `hosts`, `methods` and `paths`, which grants those HTTP requests and nothing else on that host. Deny entries list what to refuse, and the runtime answers a refused request with HTTP status `403`. A `credential@1` entry names a `service` and a `phase` and never the place where the secret is kept, and every `inject` domain must appear in the allow list of the same phase.

**Resolution**

A composition has exactly one `workload`, and two kits that provide the same normalized name fail resolution. Inside `sbx`, the grant arrives as a policy rule with `created_via: provisioned` and `editable: false`, which `--source kit` lists, and `check network` answers `allowed: true` for it.

**Updates and the lock**

The widening list is explicit: a new allow entry, a removed deny entry, a new credential, path or port, and write access over a read-only skills path. A removed deny counts because the deny was part of what made the grant acceptable. `optional` does not change the set. Six types contribute nothing to it: `resources@1`, `lifecycle@1`, `agent-context@1`, `agent-sessions@1`, `sbx@1` and `long-running@1`.

**The review step**

1. Build with a `docker-container` builder, because the default driver drops the descriptor annotation and an image without it is not a kit to any consumer.
2. Pin each kit by digest and store its normalized set; diff the set on every candidate.
3. Require signatures: set `kit.trustedSigners` before `kit.requireSignature`, or only the vendor's own identities pass.
4. Let the diff decide: a subset applies, a widening opens a ticket that names the entry, and a removed deny is a widening.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the strict decoder treat an unknown key as an error instead of a warning? Expected: a silently ignored key is a policy that is absent without anyone knowing.
- **Level 3:** You want B's `GET`-only grant to hold. What do you change? Expected: remove A's unbounded allow, or add deny entries for the other methods in B, since a deny wins while a bounded allow is swallowed by an unbounded one.
- **Level 4:** Which capability types never trigger approval on update, and why is that safe? Expected: the six constraint and launch types, because they ask for nothing from the host.
- **Level 4:** A published kit shows no descriptor annotation on its index. What happened and what does a consumer do? Expected: the default builder dropped it; a consumer that finds no annotation on the index reads the platform manifest, and an image with none anywhere is not a kit.

**Wrong answers, and why they fail**

- "The narrowest grant wins when kits overlap." Allows union; the unbounded entry swallows the bounded one, and only a deny narrows.
- "`optional: true` makes a capability safe to add." It changes whether resolution fails, not the grant set.
- "Every version bump needs approval." A candidate whose set stays inside the stored set applies silently; the lock is what makes that cheap and safe.

:::

## Five identical calls, five rejections, exit 1

*Level 4 (staff) · debug · about 12 minutes*

A coordinator agent runs in CI with `--exec --json`. The event stream shows the same `run_background_agent` call five times, each answered with `The user rejected the tool call.`, then `Error: Agent terminated: detected 5 consecutive identical calls to run_background_agent`. The same agent file worked on a laptop that morning. Explain the chain, fix it for unattended runs, and add the check that would have caught the change before CI did.

:::answer Show the answer
:::say Short answer
Headless means nobody is there to answer a `tool_call_confirmation`, so the runtime turned the prompt into a rejection; `run_background_agent` prompted because its label is `unknown`, the file set no safety mode, and no `allow` pattern named it, and the model repeated the call until `max_consecutive_tool_calls`, whose default is 5, ended the run with exit 1. Fix it with `--safety restricted` plus `allow` rules for `run_background_agent` and for the tools the background sub-agent itself calls, because inside a running task a call that would ask is denied automatically; `transfer_task` needs nothing, since it is the one tool always approved without a prompt. Guard it with two recorded sessions and `docker-agent sessions diff --fail-on-divergence -- -1 -2`, which compares tool calls, ignores prose and stops at the first divergence.
:::

**Full answer**

**Three ways to involve another agent**

| Mechanism | Added by | What happens |
|---|---|---|
| `transfer_task` | `sub_agents` | the child runs in a clean sub-session with a system message holding the task, returns its answer as the tool response, and never sees the user's history |
| `handoff` | `handoffs` | the named agent becomes the active agent for the rest of the conversation and sees the whole history |
| `run_background_agent` | the `background_agents` toolset | starts a task and returns an id at once; `list`, `view` and `stop` follow it |

`transfer_task` is always approved without a prompt. A delegation to an agent already in the chain fails, and nesting is capped at 10. A `sub_agents` entry that is a registry reference resolves its tag again on every run unless pinned to a digest, which is a second way a laptop run and a CI run differ.

**Why the laptop passed**

The laptop had a terminal. The same confirmation appeared and a person approved it, or the session had been given a mode. A session that never chooses a mode keeps the old default: read-only tools run and every other tool asks. In CI the ask has no answerer, the rejection goes back to the model as a tool result, the model does not change its plan, and the loop detector stops the run. `session.db` stores `safety_policy` per session, so you can read afterwards which mode each failed run had.

**The fix, in order**

1. `--safety restricted`, so unmatched `safe` calls run and `destructive` and `unknown` calls fail closed instead of prompting.
2. `allow` patterns for `run_background_agent` and for the tools the background sub-agent uses, because inside a running task a call that would normally ask is denied automatically.
3. Keep `deny` for anything destructive; no mode and no hook allow overrides a deny.
4. Pin external sub-agent references to a digest.
5. Run the agent in a sandbox for isolation, because permissions are enforced by the client.

**The regression check**

Record a run with `--record=PATH` and `--models-gateway`, replay with `--fake`, and compare two sessions with `sessions diff`. The help's own example fails because the parser reads `-1` as a flag; put `--` before the references. A recorded pair of identical replays reports identical behaviour across all turns, and a run that called a different tool first diverges at turn 0 and exits 1 with `--fail-on-divergence`. Ask for one tool call per message when you record, because a turn with two parallel calls appends results in completion order and the replay answers with `requested interaction not found`.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does `transfer_task` not need an `allow` while `run_background_agent` does? Expected: delegation is always approved by design, and a background start is a normal tool call that the mode and the patterns decide.
- **Level 3:** `sessions diff -1 -2` fails with an unknown shorthand flag. Why, and what do you type? Expected: the parser reads `-1` as a flag; `sessions diff -- -1 -2`.
- **Level 4:** The writer sub-agent is pulled from a registry by tag rather than read from a file. What can change between the laptop and CI? Expected: the tag resolves again on every run, so pin a digest.
- **Level 4:** Why compare tool calls and not the assistant text? Expected: a live model words every answer differently, while the sequence of tool calls is the behaviour you shipped.

**Wrong answers, and why they fail**

- "Use `--yolo` in CI so nothing prompts." That is `autonomous`; destructive calls run too. `restricted` fails closed on them.
- "Raise `max_consecutive_tool_calls`." It hides the loop; the rejection is the fault, and the detector did its job.
- "Diff the transcripts." Prose varies between runs; `sessions diff` compares the tool-call sequence and stops at the first divergence.

:::

## Six engineers, one repository, one reviewable sandbox setup

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. Six engineers run coding agents against one repository. Requirements: agents reach the package registry and one internal API, and on that API only `GET` and `POST`, never `DELETE`; an agent can never change hooks or scripts in the host repository; one shared provider key exists and never enters a VM; a new contributor gets the same setup from a checked-in file and sees a plan before anything runs; and every host an agent reached must be explainable afterwards. Deliver the policy choice, the kit, the environment file, the secret handling, the tests you ship and the evidence a reviewer should expect.

:::answer Show the answer
:::say Short answer
Initialize one global preset and record `sbx policy ls --wide --json` before trusting it. Put the shared hosts in a kit's `network-policy@2` as bounded entries with `hosts` and `methods` plus a `DELETE` deny, so the grant travels with the kit reference and arrives as `created_via: provisioned`, not as six laptops' local allows. Use clone mode through the environment file's workspace object so the host repository enters read-only, store the key with `sbx secret set` and let `credential@1` bind it so the VM sees `proxy-managed`, and check in `sbxenv.yaml` with `sbx env plan` as the gate. Test with `check network --json` for an allowed, a denied and an unmatched host, with a real request from inside for the method rule, and hand over the plan, the policy listing, the check results and the `policy log` rows.
:::

**Full answer**

**Policy preset**

`policy init` sets the first global policy once. `deny-all` makes every unmatched host an approval request; `balanced` ships a long default allowlist that changes between releases without a changelog. Either way, the recorded listing with the version and the date is part of the deliverable. Team rules go in the kit, not in global rules, because a kit rule travels with the reference and is not editable by the sandbox owner. Under organization governance, local and kit allow rules are both inactive, so the registry and API hosts then also need organization allow rules.

**Kit**

One `network-policy@2` capability with a host string for the registry and a bounded object for the API: `hosts`, `methods: [GET, POST]`, and a deny entry for `DELETE`. A bounded entry grants those requests and nothing else on that host, a deny wins on the union, and the runtime answers a refused request with `403`. Add `credential@1` for the provider with `apiKey.proxyManaged`, and remember that every inject domain must appear in the allow list of the same phase. Build with a `docker-container` builder and pin the digest.

**Environment file**

`sbxenv.yaml` declares `name`, `agent`, the kit as a `source` or reference, the workspace in its object form for clone mode, `secrets` and `bindings`, and optional `ports`. The file is bound read-only inside the sandbox, because an agent that can edit it decides what the next plan asks about. Avoid `lifecycle` host commands unless you accept the cost: they run on the host with the user's privileges, and an environment that declares any of them asks on every invocation.

**Secrets**

The key goes in with `sbx secret set`, scoped globally or per sandbox, and the agent sees a sentinel. Never `-e`, never `env:` in the file. A plan shows a literal secret value as its SHA-256 digest, which is the hint that it went in the wrong place.

**Tests to ship**

1. `sbx policy check network --sandbox NAME <registry>:443 --json` returns `allowed: true`; the API host the same; an unrelated host returns `deny_kind: implicit`, and a host you denied returns `explicit` with its rule id.
2. A real `DELETE` from inside the sandbox gets `403` with the proxy's body, because neither `check network` nor `policy log` evaluates a method or a path.
3. `sbx env plan` on a fresh clone prints only `+` rows and the host-command warning only if you kept a `lifecycle` block; a second plan after one argument change prints one `~` row.
4. `git push` to `origin` from inside fails and `git fetch sandbox-<name>` on the host brings the commit.
5. `env | grep -c proxy-managed` inside is non-zero and the receiver you control logs the real value only on the bound host.

**Evidence**

The plan output, the policy listing with version and date, the kit descriptor and its digest, the three `check network` JSON results, the `403` transcript, and the `policy log --json` rows with `proxy_type` and `rule` for each host reached.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why not let each engineer add the two hosts with `sbx policy allow network`? Expected: six copies drift and they are editable; a kit rule travels with the reference and is provisioned. Under governance both stop granting, and only organization allow rules apply.
- **Level 4:** How do you prove the method rule holds when the check command cannot see methods? Expected: send a real request from inside and expect the proxy's `403`; the log records hosts and counts only.
- **Level 4:** A contributor's plan shows a `!` row. What does it mean? Expected: a resource the environment applied earlier and no longer declares; review before applying.
- **Level 4:** The file keeps a `lifecycle` block. What do you tell the team? Expected: it runs on the host with their privileges, it prompts on every invocation, approving it trusts the script, and `--skip-host-commands` exists for a dry pass.

**Wrong answers, and why they fail**

- "Allow `**` and rely on the clone mount." `**` grants every host; the allowlist stops meaning anything.
- "Put the key under `env:` so everyone gets it." It is a plain variable inside the VM and in every template saved from it; use `secrets` and the proxy.
- "Mount the repository `:ro` to protect the hooks." The agent cannot commit either; clone mode gives it a writable clone and keeps the host read-only.

:::

## The allowlist that still lets the repository leave

*Level 4 (staff) · design · about 12 minutes*

The balanced preset allows `github.com:443` and `**.github.com:443`. A reviewer argues that an agent which reads a private repository can post its contents into an issue or a gist on that same allowed host, so the allowlist is theatre. Evaluate the claim, state what the product can and cannot see on that connection, and design the narrowing.

:::answer Show the answer
:::say Short answer
The claim holds for host rules: a host allow permits every request to that host with any method, path and body, the vendor's own staff said in 2026 that an issue body or a gist on an allowed host is not blocked, and the manual records the claim as disputed with no capture that tests it. On an allowed connection the proxy runs `forward-bypass`, a tunnel with no inspection and no credential injection; it terminates TLS only to speak on a blocked host or to inject on a host with a bound credential. The narrowing is an HTTP rule, a kit's `network-policy@2` entry with `methods` and `paths` or an organization HTTP rule, plus less to read in the first place: clone mode with secrets outside the repository, and deny-all with approvals so an unexpected host waits for a person.
:::

**Full answer**

**What the proxy sees, and when**

Agents send HTTP and HTTPS through a forward proxy, and other TCP is forwarded transparently; both paths enforce policy. The guest trusts the proxy's certificate authority, which is why a blocked host gets a `403` inside TLS with an approval body. After an allow, the recorded request got `HTTP/1.0 200 Connection established` and then the origin's own `HTTP/2 200`, and the log classed it `forward-bypass`. So on the path the reviewer worries about, the proxy is a pipe. `policy log` keeps one row per host with a request count, not a body.

**What a host rule cannot say**

A deny covers TCP, UDP and the name lookup, and ICMP cannot be allowed. An allow says nothing about method or path. The product's answer is the HTTP rule: a `network-policy@2` entry with `hosts`, `methods` and `paths` grants those requests and nothing else, a deny entry can refuse one method on one host, and the proxy answers a refused request with `403`. A network allow is a ceiling that HTTP rules carve into. Two limits follow. Neither `check network` nor `policy log` evaluates a method or a path, so the only test is a real request. And the local `--method` and `--path` flags are absent from the v0.47.0 help, so HTTP rules come from kits or from an organization policy.

**What governance adds**

An organization network rule can be HTTP, one destination with methods and path patterns, and it can require approval. Under governance only organization allows grant, so a developer cannot re-widen the host. The audit record for `http_request` carries method, host, port and path, which is the first place the request shape becomes visible after the fact, and still never the body.

**The design**

1. Reduce the readable set: clone mode, no secrets in the repository, mountless where the task allows.
2. Replace the host allow for the code host with bounded entries: read paths with `GET`, the one write path the workflow needs with `POST`, a deny for the rest.
3. Keep deny-all or balanced with approvals, so a new destination is a human decision that leaves a `created_via: approval` rule.
4. Put the bounded rules in a kit or an organization policy, pin the kit, and treat any new allow as a widening that stops.
5. Test with a real `DELETE` and a real post to a path outside the grant, expecting `403`, and keep the `policy log` rows as the record of hosts reached.

What remains open is stated plainly: a bounded `POST` to the one write path is still a channel. The design shrinks the channel to the request the workflow needs and makes every other destination a decision.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the proxy not read the body of an allowed request even though it holds a CA the guest trusts? Expected: it terminates TLS only when it has to speak or inject; an allowed host without a bound credential is a `forward-bypass` tunnel.
- **Level 4:** Where is a method rule enforced, and where can you see that it fired? Expected: enforced by the proxy from a kit or organization rule, visible as a `403` to the request and in an organization audit record, not in `check network` or `policy log`.
- **Level 4:** The workflow must open pull requests. Write the minimum grant. Expected: bounded `GET` entries for the read paths, one bounded `POST` for the pull-request path, a deny for `DELETE`, and clone mode so the readable set is the repository alone.

**Wrong answers, and why they fail**

- "Deny the main host and allow only the API host." It is still a host allow; any body to that host passes.
- "The proxy has a CA, so it inspects everything." It intercepts only to block or to inject; the allowed path is a tunnel.
- "`policy log` will show the leak." It shows the host and a count; the body never appears anywhere.

:::
