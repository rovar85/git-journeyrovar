---
track: aideep
title: Deep dive 13: production agent systems
short: Production systems
sub: Companion to chapter 13. A workflow graph engine, short- and long-term memory, how WebSockets stream answers, and the LLMOps habits that keep it running.
---

:::goals
- explain graph-based agent workflows (nodes, edges, shared state) and build a tiny engine
- implement short-term memory with summarisation and long-term memory with retrieval
- see the WebSocket handshake and framing that make streaming work
- apply LLMOps practices: prompt versioning, tracing, evaluation datasets, cost and quality monitoring
:::

:::note Context
Chapter 13 studied the open-source **PhiloAgents** project (game characters powered by agents, built with LangGraph, FastAPI, WebSockets, MongoDB and Opik). This deep dive extracts the transferable engineering ideas and builds small working versions of each, without those libraries, so you understand what they do for you.
:::

## 1. Workflows as graphs

A real agent application is rarely a single loop. It is a **graph**: **nodes** are steps (retrieve memory, call the model, call a tool, summarise), **edges** say which step comes next, and some edges are **conditional** ("if the model asked for a tool, go to the tool node; otherwise finish"). All nodes read and write one shared **state** object. This is the model behind **LangGraph**: explicit, testable, easy to visualise, and able to **pause and resume** (checkpointing) because the state is explicit.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > graph.py <<'EOF'
# A minimal state-graph engine, in the spirit of LangGraph
class Graph:
    def __init__(self): self.nodes, self.edges, self.cond = {}, {}, {}
    def node(self, name, fn): self.nodes[name] = fn
    def edge(self, a, b): self.edges[a] = b
    def conditional(self, a, router): self.cond[a] = router        # router(state) -> next node name
    def run(self, state, start, max_steps=20):
        cur, trail = start, []
        for _ in range(max_steps):
            if cur == "END": return state, trail
            trail.append(cur)
            state = {**state, **self.nodes[cur](state)}            # each node returns a partial state update
            cur = self.cond[cur](state) if cur in self.cond else self.edges[cur]
        raise RuntimeError("max steps exceeded (graph did not terminate)")

# ---- nodes: plain functions from state to state updates (stand-ins for model/tool calls) ----
def retrieve(s):  return {"context": ["Plato taught Aristotle.", "The Academy was in Athens."]}
def think(s):
    if s["question"].lower().startswith("calculate"): return {"decision": "tool"}
    return {"decision": "answer"}
def use_tool(s):  return {"tool_result": "42", "tool_calls": s.get("tool_calls", 0) + 1}
def answer(s):
    extra = f" (tool says {s['tool_result']})" if "tool_result" in s else ""
    return {"reply": f"Using {len(s['context'])} facts{extra}: reply to {s['question']!r}"}

g = Graph()
g.node("retrieve", retrieve); g.node("think", think); g.node("tool", use_tool); g.node("answer", answer)
g.edge("retrieve", "think")
g.conditional("think", lambda s: "tool" if s["decision"] == "tool" and s.get("tool_calls", 0) < 1 else "answer")
g.edge("tool", "think")
g.edge("answer", "END")

for q in ["Who taught Aristotle?", "Calculate the answer to everything"]:
    final, trail = g.run({"question": q}, "retrieve")
    print(f"question: {q!r}")
    print("  path :", " -> ".join(trail))
    print("  reply:", final["reply"])
EOF
python3 graph.py
```

The two questions take **different paths** through the same graph, decided by a conditional edge. The call limit on the tool node (`tool_calls < 1`) is a **loop guard**, exactly the budget idea from earlier lessons. Real engines add: parallel branches, **checkpointing** (save the state after each node so a crashed run resumes, or a human approval pauses the run and resumes later), streaming of partial results, and visual debugging.

## 2. Memory: short-term and long-term

| Kind | Purpose | Implementation |
|---|---|---|
| **Short-term (conversation)** | keep the current dialogue coherent | the recent messages, **trimmed** or **summarised** to fit the context window |
| **Long-term** | remember facts across conversations and sessions (user preferences, past events) | store memories in a database; **retrieve** the relevant ones per question (same techniques as RAG) |

```run
cd ~/lab/ai
cat > memory.py <<'EOF'
import re

# ---- short-term: keep the last N messages verbatim, fold older ones into a running summary ----
class ShortTerm:
    def __init__(self, keep=4): self.keep, self.summary, self.msgs = keep, "", []
    def add(self, role, text):
        self.msgs.append((role, text))
        while len(self.msgs) > self.keep:
            role_old, text_old = self.msgs.pop(0)
            # a real system asks a model to summarise; here we keep the first sentence as a stand-in
            self.summary += f" [{role_old}: {text_old.split('.')[0]}]"
    def context(self): return {"summary": self.summary.strip(), "recent": self.msgs}

st = ShortTerm(keep=3)
for i, (r, t) in enumerate([("user", "Hi, I am studying logic. I like Aristotle."), ("bot", "Welcome. Logic is a fine start."),
                            ("user", "What is a syllogism?"), ("bot", "A syllogism is a three-part argument."),
                            ("user", "Give an example.")]):
    st.add(r, t)
c = st.context()
print("summary of older turns:", c["summary"])
print("recent messages kept  :", [f"{r}: {t}" for r, t in c["recent"]])

# ---- long-term: store facts, retrieve by relevance (keyword overlap stands in for embeddings) ----
class LongTerm:
    def __init__(self): self.items = []
    def remember(self, text): self.items.append(text)
    def recall(self, query, k=2):
        q = set(re.findall(r"[a-z]+", query.lower()))
        scored = sorted(self.items, key=lambda t: -len(q & set(re.findall(r"[a-z]+", t.lower()))))
        return [t for t in scored[:k] if q & set(re.findall(r"[a-z]+", t.lower()))]

lt = LongTerm()
lt.remember("The user prefers short answers.")
lt.remember("The user studies logic and likes Aristotle.")
lt.remember("The user lives in Leeds.")
print()
print("recall('explain Aristotle logic') ->", lt.recall("explain Aristotle logic"))
print("recall('weather today')           ->", lt.recall("weather today"))
EOF
python3 memory.py
```

Design questions for memory: **what to store** (not everything; extract durable facts), **when** to write (after each turn or in the background), **how to forget** (retention rules, user deletion rights, privacy law), **how to avoid leaking** one user's memories to another (partition by user ID, always), and **how to avoid poisoning** (a memory written from untrusted content can later steer the agent).

## 3. Streaming over WebSockets

A normal HTTP request returns one response when it is finished. A chat or game wants the answer **word by word** as it is generated, and wants the server to push messages without a new request. A **WebSocket** starts as an HTTP request that asks to **upgrade**, after which both sides keep the connection open and exchange small **frames** in either direction.

The handshake is a small, exact computation: the server takes the client's random `Sec-WebSocket-Key`, appends a fixed GUID, hashes it with SHA-1 and Base64-encodes it as `Sec-WebSocket-Accept`. This proves the server understood the protocol. We can run it, and build a text frame:

```run
cd ~/lab/ai
cat > ws.py <<'EOF'
import base64, hashlib, json

# --- the handshake: the example key from the WebSocket specification (RFC 6455) ---
client_key = "dGhlIHNhbXBsZSBub25jZQ=="
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
accept = base64.b64encode(hashlib.sha1((client_key + GUID).encode()).digest()).decode()
print("client sends : Sec-WebSocket-Key:", client_key)
print("server answers: HTTP/1.1 101 Switching Protocols")
print("                Upgrade: websocket")
print("                Sec-WebSocket-Accept:", accept, "(spec says: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=)")

# --- a server-to-client text frame: 1 byte (FIN + opcode 1 = text), 1 byte length, then the payload ---
def text_frame(text):
    payload = text.encode()
    assert len(payload) < 126
    return bytes([0x81, len(payload)]) + payload
print()
chunks = ["The ", "Academy ", "was ", "in ", "Athens."]
print("streaming a reply as one frame per chunk:")
for c in chunks:
    msg = json.dumps({"streaming": True, "chunk": c})
    f = text_frame(msg)
    print(f"  frame bytes: {f[:2].hex()} + {len(f)-2} payload bytes   {msg}")
print("  final     :", json.dumps({"streaming": False, "response": "".join(chunks)}))
EOF
python3 ws.py
```

That is the whole idea behind the PhiloAgents design: the game client opens **one WebSocket**; for each question the server runs the graph, and sends `{"streaming": true, "chunk": "..."}` messages as tokens arrive, followed by a final `{"streaming": false, ...}`. The client appends chunks to the speech bubble. Compared with repeated HTTP requests you save connection set-up per message, get **low latency**, and can push events from server to client. Production concerns: **authentication** (check a token during the handshake), **timeouts and heartbeats** (ping/pong), **backpressure**, reconnect logic, and scaling out (sticky sessions or a shared message bus such as Redis).

## 4. LLMOps: operating an LLM application

Shipping is the start. The habits that keep an LLM system healthy:

| Practice | What it means | Tool examples |
|---|---|---|
| **Prompt versioning** | prompts are code: stored in Git or a prompt registry, with version IDs recorded on every trace, so you can say which prompt produced which answer and roll back | Opik, LangSmith, Langfuse, plain Git |
| **Tracing** | record every model and tool call with inputs, outputs, timing, tokens, cost, grouped by conversation | OpenTelemetry, Opik, Langfuse |
| **Evaluation datasets** | a growing test set (from real failures) run before each release and sampled in production | the harness from chapter 9 |
| **Online monitoring** | dashboards and alerts on latency, error rate, token cost, tool failures, safety flags, user feedback | Prometheus/Grafana (Monitoring track) |
| **Feedback loops** | thumbs up/down and corrections stored and reviewed, turned into new test cases | in-app feedback, review queues |
| **Cost control** | budgets per user and per feature, caching, routing easy work to small models | provider dashboards, gateways |
| **Release discipline** | canary releases, feature flags, quick rollback of prompt and model changes | CI/CD (Jenkins track) |
| **Privacy and compliance** | redact personal data in logs, retention limits, access control to traces | policies, redaction at the logging layer |

A minimal **prompt registry** with version pinning, in code:

```run
cd ~/lab/ai
cat > registry.py <<'EOF'
import hashlib, json

class PromptRegistry:
    def __init__(self): self.versions = {}      # name -> list of {version, text, hash}
    def publish(self, name, text):
        vs = self.versions.setdefault(name, [])
        h = hashlib.sha256(text.encode()).hexdigest()[:8]
        if vs and vs[-1]["hash"] == h:
            return vs[-1]["version"]            # unchanged: no new version
        v = len(vs) + 1
        vs.append({"version": v, "text": text, "hash": h})
        return v
    def get(self, name, version=None):
        vs = self.versions[name]
        return vs[-1] if version is None else vs[version - 1]

reg = PromptRegistry()
reg.publish("philosopher", "You are Plato. Speak briefly and ask questions.")
reg.publish("philosopher", "You are Plato. Speak briefly and ask questions.")        # same text: still version 1
v2 = reg.publish("philosopher", "You are Plato. Speak briefly, ask questions, and cite the Republic.")
print("versions:", [(v["version"], v["hash"]) for v in reg.versions["philosopher"]])

# every trace records WHICH prompt version produced the answer
p = reg.get("philosopher")
trace = {"conversation": "c-17", "prompt": "philosopher", "prompt_version": p["version"], "prompt_hash": p["hash"],
         "tokens_in": 640, "tokens_out": 90, "latency_ms": 1180}
print("trace:", json.dumps(trace))
print("rollback target (version 1):", reg.get("philosopher", 1)["text"])
EOF
python3 registry.py
```

Because the trace carries the prompt version and hash, a drop in quality can be tied to a specific prompt change, and rollback is a one-line change.

## 5. Putting it together: a reference architecture

```text
Browser / game client
        │  WebSocket (streaming chunks, auth token)
        ▼
API service (FastAPI): auth, rate limit, validates input, loads session
        │
        ▼
Agent graph (LangGraph-style): retrieve memory → decide → tool/RAG → answer → write memory
   ├── Model gateway: provider client, retries, caching, cost limits, model routing
   ├── Tools: read-only by default; risky ones behind approval
   ├── Short-term memory (conversation) + Long-term memory (database/vector index, per user)
   └── Guardrails: input and output checks, allow-lists, budgets
        │
        ▼
Observability: traces, metrics, logs, eval samples  →  dashboards, alerts, review queue
        ▲
CI/CD: tests, evaluation suite, prompt registry, canary release, rollback
```

Each box is something you built a small version of in these lessons.

## Common misconceptions

- "A framework gives me a production system." It gives plumbing; reliability still comes from tests, limits, tracing and operations.
- "Memory means saving the whole chat." Unbounded history is costly and risky; store distilled facts and retrieve selectively.
- "WebSockets are always better than HTTP." They suit streaming and push; plain HTTP with server-sent events or polling is often simpler.
- "Prompt changes are low-risk." They are production changes; version, evaluate and roll out gradually.

## Practice (answers below)

1. In the graph demo, what stops the tool node from looping forever?
2. Why partition long-term memory by user ID?
3. What does `Sec-WebSocket-Accept` prove?
4. Why record the prompt version in every trace?

:::note Answers
1. The conditional router only returns to the tool node while `tool_calls < 1`; after one call it routes to the answer node.
2. To prevent one user's remembered facts from being shown to or influencing another user (privacy and security).
3. That the server understood the WebSocket protocol and is not a plain HTTP server replying by accident (and ties the answer to the client's key).
4. So a change in quality can be traced to a specific prompt, and you can roll back to a known good version.
:::

:::recap
- Model workflows as graphs of nodes with shared state and conditional edges; add loop guards and checkpointing.
- Short-term memory is a trimmed or summarised window; long-term memory is stored facts retrieved per question, partitioned by user.
- WebSockets upgrade from HTTP and exchange frames both ways, which suits streamed chunks; secure and monitor them.
- LLMOps: version prompts, trace everything, evaluate continuously, watch cost and quality, release with canaries and rollback.
:::

:::quiz
? What is a conditional edge in a workflow graph?
+ A route chosen at run time from the current state
- A faster edge
- A tool permission
- A memory type
! It lets the same graph take different paths.
? Why summarise older conversation turns?
+ To keep the context short and cheap while retaining the important content
- To hide them from the user
- To increase temperature
- To prevent streaming
! Trimming and summarising keep within the context window.
? What is the benefit of streaming chunks over a WebSocket?
+ The user sees the answer as it is generated, with low latency
- The model becomes smarter
- It avoids authentication
- It removes tokens
! Perceived latency drops dramatically.
? What does prompt versioning let you do?
+ Tie behaviour changes to a specific prompt and roll back
- Skip evaluations
- Avoid logging
- Increase context length
! Prompts are code.
:::
