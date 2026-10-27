---
track: aideep
title: "Deep dive 18: LangGraph, agents as state machines"
short: LangGraph
sub: State, nodes and edges; conditional routing; memory across turns; pausing for a human; a supervisor with workers. Real LangGraph code, run offline.
---

:::goals
- explain why agent workflows are modelled as a graph of nodes and edges over shared state
- build a graph with a reducer, a conditional edge and a streamed run
- give a chatbot memory per conversation with a checkpointer and a thread id
- pause for human approval with `interrupt` and resume, and build a supervisor with workers
:::

:::note How the code here runs
These examples use the real `langgraph` library (1.x at the time of writing). The "model" steps are plain Python functions so the runs are deterministic, offline and free; in a real system a node would call a model. The lab in this page cannot run them (they need the library); use Codespaces or `pip install langgraph`.
:::

## 1. Why a graph

[Deep dive 8](#aideep-8) described agent patterns (routing, chains, orchestrator-workers, evaluator loops). Real systems need more than a straight chain: **loops** (try again until good), **branches** (route to the right worker), **memory** (remember this conversation), **pauses** (wait for a human) and **recovery** (resume after a crash). A **graph over shared state** gives you all of these in one model:

- **State**: one shared record (a typed dictionary) that every step reads and updates.
- **Nodes**: functions that take the state and return an update.
- **Edges**: which node runs next. **Conditional edges** choose the next node from the state.
- **Reducers**: rules for merging an update into the state (replace, or append).
- **Checkpointer**: saves the state after each step, so you can resume, remember and time-travel.

## 2. State, nodes, a conditional edge

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
python3 -c "import importlib.metadata as m; print('langgraph', m.version('langgraph'))"
cat > graph1.py <<'EOF'
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    question: str
    notes: Annotated[list, operator.add]      # reducer: each node's list is APPENDED, not replaced
    answer: str

def research(s):  return {"notes": [f"fact about {s['question']}"]}
def verify(s):    return {"notes": ["verified"]}
def write(s):     return {"answer": f"Answer built from {len(s['notes'])} notes"}
def route(s):     return "write" if "verified" in s["notes"] else "verify"   # a conditional edge

g = StateGraph(State)
g.add_node("research", research); g.add_node("verify", verify); g.add_node("write", write)
g.add_edge(START, "research")
g.add_conditional_edges("research", route, {"verify": "verify", "write": "write"})
g.add_edge("verify", "write")
g.add_edge("write", END)
app = g.compile()

print("nodes:", list(app.get_graph().nodes))
print("result:", app.invoke({"question": "disk full", "notes": []}))
print("steps:")
for step in app.stream({"question": "disk full", "notes": []}):
    print("  ", step)
EOF
python3 graph1.py
```

Look at the pieces:

- `Annotated[list, operator.add]` is a **reducer**: each node's `notes` are **appended**. Without it, a node's list would replace the old one.
- `route` is a **conditional edge**: it returns the name of the next node. Here research is followed by `verify` unless verification already happened.
- `stream` shows each node's update as it happens: that is how you build progress bars and live logs, and how you spot which step is slow.

## 3. Memory: a checkpointer and thread ids

A model has no memory between calls; the application has to keep and resend the conversation. With a **checkpointer**, the graph saves the state after each step under a **thread id**. The next call with the same thread id continues from the saved state.

```run
cd ~/lab/ai
cat > memory.py <<'EOF'
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.messages import HumanMessage, AIMessage

class Chat(TypedDict):
    messages: Annotated[list, add_messages]   # the reducer that keeps the conversation

def bot(state):
    last = state["messages"][-1].content.lower()
    known = [m.content for m in state["messages"] if isinstance(m, HumanMessage) and m.content.lower().startswith("my name is")]
    if "what is my name" in last:
        reply = f"You told me: {known[-1][11:]}" if known else "I do not know your name yet."
    else:
        reply = f"Noted ({len(state['messages'])} messages so far)."
    return {"messages": [AIMessage(reply)]}

g = StateGraph(Chat); g.add_node("bot", bot); g.add_edge(START, "bot"); g.add_edge("bot", END)
app = g.compile(checkpointer=InMemorySaver())

def say(thread, text):
    out = app.invoke({"messages": [HumanMessage(text)]}, {"configurable": {"thread_id": thread}})
    print(f"[{thread}] {text!r:28} -> {out['messages'][-1].content}")

say("alice", "my name is Alice")
say("alice", "what is my name?")
say("bob", "what is my name?")           # a different thread has its own memory
say("alice", "thanks")
EOF
python3 memory.py
```

Alice's thread remembers her name; Bob's thread, a separate conversation, does not. The `add_messages` reducer keeps the message list. The in-memory saver loses everything when the process ends; real deployments use a database-backed checkpointer. Longer-term memory (facts across conversations) is a separate store; see [Field guide 4](#aifield-4) and [Field guide 9](#aifield-9).

## 4. Human in the loop: pause, then resume

Risky actions need approval ([Deep dive 12](#aideep-12)). `interrupt` **pauses the graph**, saves its state and hands a question to your application. Hours later a person answers, and `Command(resume=...)` continues exactly where it stopped.

```run
cd ~/lab/ai
cat > approval.py <<'EOF'
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import interrupt, Command

class S(TypedDict):
    command: str
    decision: str
    result: str

def plan(s):    return {"command": "sudo systemctl restart payments"}
def approve(s):
    answer = interrupt({"question": "Run this on production?", "command": s["command"]})   # the graph PAUSES here
    return {"decision": answer}
def act(s):
    return {"result": f"ran: {s['command']}" if s["decision"] == "yes" else "skipped: a human said no"}

g = StateGraph(S)
for name, fn in (("plan", plan), ("approve", approve), ("act", act)): g.add_node(name, fn)
g.add_edge(START, "plan"); g.add_edge("plan", "approve"); g.add_edge("approve", "act"); g.add_edge("act", END)
app = g.compile(checkpointer=InMemorySaver())

for thread, human_says in (("t1", "yes"), ("t2", "no")):
    cfg = {"configurable": {"thread_id": thread}}
    first = app.invoke({"command": "", "decision": "", "result": ""}, cfg)
    print(thread, "paused with:", first["__interrupt__"][0].value)
    print(thread, "waiting at:", app.get_state(cfg).next)
    print(thread, "human answers", repr(human_says), "->", app.invoke(Command(resume=human_says), cfg)["result"])
EOF
python3 approval.py
```

Two threads, two answers: yes ran the command, no skipped it. Because the state was checkpointed, the process could have exited between the question and the answer. This is the feature that makes agents safe to run against real systems.

## 5. Multi-agent: a supervisor and workers

A common pattern: a **supervisor** looks at the state and picks which worker acts next; every worker reports back to the supervisor; the supervisor finishes when the work is complete. In a real system the supervisor and workers are model calls with different instructions and tools; the graph shape is the same.

```run
cd ~/lab/ai
cat > supervisor.py <<'EOF'
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END

class S(TypedDict):
    task: str
    next: str
    log: Annotated[list, operator.add]
    report: str

def supervisor(s):                     # decides who works next (here: simple rules; in real systems an LLM)
    done = {l.split(":")[0] for l in s["log"]}
    for worker in ("researcher", "coder", "reviewer"):
        if worker not in done: return {"next": worker}
    return {"next": "finish"}
def researcher(s): return {"log": ["researcher: found two libraries for " + s["task"]]}
def coder(s):      return {"log": ["coder: wrote a 20-line script"]}
def reviewer(s):   return {"log": ["reviewer: approved after one fix"]}
def finish(s):     return {"report": " | ".join(s["log"])}

g = StateGraph(S)
for n, f in (("supervisor", supervisor), ("researcher", researcher), ("coder", coder), ("reviewer", reviewer), ("finish", finish)): g.add_node(n, f)
g.add_edge(START, "supervisor")
g.add_conditional_edges("supervisor", lambda s: s["next"], {"researcher": "researcher", "coder": "coder", "reviewer": "reviewer", "finish": "finish"})
for w in ("researcher", "coder", "reviewer"): g.add_edge(w, "supervisor")      # every worker reports back
g.add_edge("finish", END)
app = g.compile()
out = app.invoke({"task": "parse logs", "next": "", "log": [], "report": ""})
print(out["report"])
print("the graph ran", sum(1 for _ in app.stream({"task": "parse logs", "next": "", "log": [], "report": ""})), "node steps")
EOF
python3 supervisor.py
```

The report shows the workers ran in order. The graph ran 8 node steps: the supervisor 4 times (before each worker and once more at the end), the 3 workers, and `finish`. Notice what makes this safe and testable: the **routing is explicit** (one function), the state is **inspectable**, and you can put a step limit on the graph. Compare with [Field guide 9](#aifield-9) on crews, and remember the lesson of [Deep dive 8](#aideep-8): start with the simplest pattern that works; more agents mean more cost, more latency and more ways to fail.

## 6. Using a real model inside a node (not run here)

This is **Example, not run here**: it needs a provider and an API key.

```python
from langgraph.graph import MessagesState, StateGraph, START, END
from langchain.chat_models import init_chat_model

model = init_chat_model("openai:<model-name>")            # key from an environment variable

def assistant(state: MessagesState):
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("assistant", assistant)
builder.add_edge(START, "assistant"); builder.add_edge("assistant", END)
app = builder.compile(checkpointer=checkpointer)           # same memory and interrupt features as above
```

To give the model tools you add a tool node and a conditional edge that loops back while the model keeps requesting tools: the loop from [Deep dive 17](#aideep-17), drawn as a graph. Library helpers for this exist and have been renamed between versions, so check the current documentation.

## Common misconceptions

- "A graph means many agents." A graph with one model node and a tool loop is already useful. Multi-agent is one shape, not the point.
- "The model decides everything." In a good graph the **developer** fixes the allowed paths and the model chooses among them.
- "Memory and state are the same." State is the working record of one run; memory across conversations needs a store you design.

## Practice (answers below)

1. In the first graph, what would change if `notes` had no reducer?
2. Why does `interrupt` require a checkpointer?
3. Add a rule so the supervisor stops after 6 steps no matter what. Where do you put it?

:::recap
- A **graph over shared state**: nodes update state, edges choose what runs next, **reducers** merge updates.
- A **checkpointer** with a **thread id** gives per-conversation memory and resumability.
- **`interrupt`** pauses for a human; **`Command(resume=...)`** continues.
- A **supervisor** routes work to workers; keep routing explicit, bounded and testable.
:::

:::note Answers
1. Each node's `notes` would replace the list, so earlier notes would be lost and the router that checks for "verified" could loop. 2. The pause saves the state; without saved state there is nothing to resume from. 3. In the supervisor's routing function: count the entries in `log` (or add a counter to the state) and return `finish` when it reaches the limit; LangGraph also has a recursion limit setting as a second safety net.
:::

```quiz
? What does a reducer such as operator.add on a state field do?
+ Merges a node's update into the existing value, here by appending to the list
- Deletes old state
- Chooses the next node
- Sends the state to the model
! Reducers define how updates combine; without one the new value replaces the old.

? How does a LangGraph chatbot remember a conversation across separate calls?
+ A checkpointer saves state under a thread id, and later calls reuse that thread id
- The model stores it
- The prompt template stores it
- It cannot
! The checkpointer persists state per thread; a new thread id means a new, empty conversation.

? Why use interrupt before running a production command?
+ It pauses the graph for a human decision and resumes from saved state
- It makes the command faster
- It encrypts the command
- It retries the command
! Human approval for risky actions is a core safety control.
```
