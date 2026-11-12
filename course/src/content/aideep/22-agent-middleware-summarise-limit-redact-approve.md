---
track: aideep
title: "Deep dive 22: Agent middleware: summarise, limit, redact, approve"
short: Agent middleware
sub: Hooks that run before and after every model call and around every tool call: summarising long chats, capping calls, masking personal data and asking a human before risky actions.
---

:::goals
- explain what agent middleware is and name the three places it can hook in
- build summarisation, a call limit, PII redaction and human approval as small middleware classes
- use the built-in LangChain middleware for the same four jobs
- choose the order of middleware and say why the order matters
:::

:::note How the code here runs
The first script is plain Python and also runs in the lab on this page. The second uses the real library (`langchain` 1.x) with a **scripted fake model** or a **mocked reply**, so it needs no API key and no network, and the output shown is real. The lab on this page cannot run that one (it needs the library); use Codespaces or any machine with `pip install langchain`. Library versions at the time of writing: langchain 1.5, langgraph 1.2.
:::

## 1. The problem middleware solves

An agent is a loop: send the messages to the model, run any tool it asks for, add the result, repeat ([Deep dive 7](#aideep-7)). Real products need the same extra rules in every agent: keep the history short enough to fit, stop a run that loops forever, keep personal data away from the model and the logs, and make a person approve anything that cannot be undone.

You could paste those rules into every loop. **Middleware** is the cleaner answer: small objects that the loop calls at fixed points, so each rule is written once and switched on by adding it to a list. Web frameworks have used the same idea for years (a request passes through logging, authentication and compression layers before it reaches your handler).

There are three places to hook in:

| Hook | Runs | Typical use |
| --- | --- | --- |
| **before model** | before each model call, can change the messages or stop the run | summarise old turns, redact data, count calls |
| **after model** | after each reply, can change or reject it | check the output, block a bad answer |
| **around a tool** | wraps each tool call, decides whether and how it runs | ask a human, retry, time out, log |

## 2. Four middlewares in plain Python

Read `mw.py` from the top: a tiny agent loop with the three hooks, and four middlewares. The demo runs two conversations with a scripted model.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > mw.py <<'EOF'
# A tiny agent loop with middleware hooks. The "model" is scripted so the run is offline and repeatable.
import re

class Stop(Exception): pass

def scripted_model(script):
    replies = iter(script)
    def model(messages):
        return next(replies)
    return model

class Middleware:
    def before_model(self, state): pass            # may change state["messages"] or raise Stop
    def after_model(self, state, reply): return reply
    def wrap_tool(self, name, args, call): return call(name, args)

class Summarize(Middleware):
    """When the history is long, replace the oldest turns with one short summary line."""
    def __init__(self, max_msgs=6, keep=3): self.max, self.keep = max_msgs, keep
    def before_model(self, state):
        m = state["messages"]
        if len(m) > self.max:
            old, recent = m[1:-self.keep], m[-self.keep:]
            facts = [x["text"].split("user said: ")[1] for x in old if x["text"].startswith("[summary")]
            facts += [x["text"][:30] for x in old if x["role"] == "user"]
            state["messages"] = [m[0], {"role": "system", "text": "[summary] user said: " + "; ".join(facts)}] + recent
            print(f"  summarize: {len(m)} messages -> {len(state['messages'])}:", state["messages"][1]["text"])

class CallLimit(Middleware):
    def __init__(self, n): self.n, self.used = n, 0
    def before_model(self, state):
        self.used += 1
        if self.used > self.n: raise Stop(f"model call limit {self.n} reached")

class RedactPII(Middleware):
    EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
    CARD = re.compile(r"\b(?:\d[ -]?){13,16}\b")
    def before_model(self, state):
        for msg in state["messages"]:
            if msg["role"] == "user":
                new = self.CARD.sub("[CARD]", self.EMAIL.sub("[EMAIL]", msg["text"]))
                if new != msg["text"]: print("  redact:", new); msg["text"] = new

class Approve(Middleware):
    """Human in the loop: risky tools need a yes before they run."""
    def __init__(self, risky, answers): self.risky, self.answers = risky, iter(answers)
    def wrap_tool(self, name, args, call):
        if name in self.risky:
            ok = next(self.answers); print(f"  approval asked for {name}{args}: {'yes' if ok else 'no'}")
            if not ok: return "refused by a human"
        return call(name, args)

TOOLS = {"lookup_order": lambda a: f"order {a['id']} shipped", "delete_account": lambda a: f"account {a['user']} deleted"}

def run_agent(model, user_texts, middleware):
    state = {"messages": [{"role": "system", "text": "You are a support agent."}]}
    for text in user_texts:
        state["messages"].append({"role": "user", "text": text})
        try:
            while True:
                for mw in middleware: mw.before_model(state)
                reply = model(state["messages"])
                for mw in reversed(middleware): reply = mw.after_model(state, reply)
                if reply.startswith("TOOL "):
                    name, arg = reply[5:].split(" ", 1); args = dict(kv.split("=") for kv in arg.split(","))
                    def call(n, a): return TOOLS[n](a)
                    for mw in middleware: call = (lambda m, inner: (lambda n, a: m.wrap_tool(n, a, inner)))(mw, call)
                    result = call(name, args)
                    print(f"  tool {name} -> {result}")
                    state["messages"].append({"role": "tool", "text": result})
                    continue
                state["messages"].append({"role": "ai", "text": reply}); print("  ai:", reply); break
        except Stop as e:
            print("  stopped:", e); break
    return state
EOF
cat > mw_demo.py <<'EOF'
from mw import *
print("1) redaction and approval")
model = scripted_model(["TOOL lookup_order id=A17", "Your order A17 has shipped.", "TOOL delete_account user=ravi", "I could not delete the account."])
run_agent(model, ["My email is ravi@example.com, where is order A17?", "Delete my account please"],
          [RedactPII(), Approve({"delete_account"}, [False])])
print("2) summarization and a call limit")
model = scripted_model([f"answer {i}" for i in range(1, 10)])
run_agent(model, [f"question {i} about my plan" for i in range(1, 7)], [Summarize(max_msgs=6, keep=3), CallLimit(5)])
EOF
python3 mw_demo.py
```

What happened:

- **Redaction** rewrote the user's message before the model saw it. The order lookup still worked because the order number is not personal data.
- **Approval** wrapped the risky tool. The human said no, so the tool never ran; the model got the text "refused by a human" and answered honestly.
- **Summarisation** fired once the history passed six messages. It kept the last three and folded the rest into one summary line that keeps growing, so early facts are not lost.
- **The call limit** stopped the run on the sixth model call. Without it a confused agent can loop and spend money until something times out.

A real summariser asks a model to write the summary; here we keep only the user's words, which is enough to see the mechanism.

## 3. The same four jobs with LangChain's built-in middleware

LangChain 1.x has an agent builder, `create_agent`, that takes a `middleware=[...]` list, and ships ready-made middleware for these jobs: `SummarizationMiddleware`, `ModelCallLimitMiddleware`, `PIIMiddleware` and `HumanInTheLoopMiddleware`, plus decorators such as `@before_model` for your own. Human approval needs a **checkpointer**, because the run pauses, saves its state and resumes later ([Deep dive 18](#aideep-18)).

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > mw_real.py <<'EOF'
from langchain.agents import create_agent
from langchain.agents.middleware import (PIIMiddleware, ModelCallLimitMiddleware,
    HumanInTheLoopMiddleware, SummarizationMiddleware, before_model)
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

class Fake(GenericFakeChatModel):
    def bind_tools(self, tools, **kw): return self

def delete_account(user: str) -> str:
    """Delete a user's account."""
    return f"deleted {user}"

seen = []
@before_model
def log_input(state, runtime):
    seen.append(state["messages"][-1].content)

model = Fake(messages=iter([
    AIMessage(content="", tool_calls=[{"name": "delete_account", "args": {"user": "ravi"}, "id": "c1"}]),
    AIMessage(content="OK, I did not delete it."),
]))
agent = create_agent(model, tools=[delete_account], checkpointer=InMemorySaver(),
    middleware=[PIIMiddleware("email", strategy="redact"),
                ModelCallLimitMiddleware(run_limit=5),
                HumanInTheLoopMiddleware(interrupt_on={"delete_account": True}),
                log_input])
cfg = {"configurable": {"thread_id": "t1"}}
out = agent.invoke({"messages": [{"role": "user", "content": "I am ravi@example.com, delete my account"}]}, cfg)
print("paused:", "__interrupt__" in out)
print("model saw:", seen)
print(out["__interrupt__"][0].value)
out = agent.invoke(Command(resume={"decisions": [{"type": "reject", "message": "not allowed"}]}), cfg)
print([ (m.type, m.content) for m in out["messages"]])
EOF
python3 mw_real.py
```

Read the output line by line:

- The model saw `[REDACTED_EMAIL]`, never the address. The custom `log_input` hook ran after the PII middleware, so it saw the redacted text too: **order matters**.
- The run stopped with an `__interrupt__` describing the tool call and the decisions a reviewer may take (approve, edit, reject, respond).
- Resuming with `Command(resume=...)` and a **reject** decision put a tool message in the history instead of running the tool, and the model answered from that.

`SummarizationMiddleware` was left out of the run because it calls a second model to write the summary. In a real agent it looks like this (not run here):

```term
from langchain.agents.middleware import SummarizationMiddleware
SummarizationMiddleware(model="openai:gpt-4o-mini",          # a cheap model writes the summary
                        trigger=("tokens", 4000),            # summarise when history passes 4,000 tokens
                        keep=("messages", 20))               # always keep the last 20 messages as they are
```

## 4. Order and placement

Middleware runs in list order before the model and in reverse order after it, like layers of an onion. Good habits:

1. **Redact first**, so nothing later (logs, summaries, other hooks) ever sees raw personal data.
2. **Limit early**, so a runaway loop is stopped before it costs anything else.
3. **Summarise** before the model call, after redaction.
4. Put **approval** on the specific tools that write, send, pay or delete, not on every tool; reviewers who approve everything stop reading.

Other built-ins worth knowing: retries and fallbacks for the model, tool-call limits, a to-do list tool ([Deep dive 24](#aideep-24)), and context editing that clears old tool results.

## Common misconceptions

- "Middleware makes the agent safe." It enforces the rules you wrote. Regex redaction misses data it has no pattern for, and approval only helps if the reviewer reads ([Deep dive 12](#aideep-12)).
- "Summarisation is free." It costs a model call, and a summary can drop the one detail that mattered; keep recent messages verbatim and test with long conversations.
- "A call limit is an error." Often the right behaviour is to stop and say so politely, which is what `exit_behavior="end"` does.

## Practice (answers below)

1. Write a middleware for `mw.py` that blocks any reply containing the word "guarantee".
2. Your summariser runs before redaction. What can go wrong?
3. Which tools in a support agent would you put behind approval: `lookup_order`, `refund_payment`, `send_email`, `search_docs`?

:::recap
- **Middleware** is code the agent loop calls at fixed points: before the model, after the model, around each tool.
- The four everyday jobs: **summarise** long history, **limit** calls, **redact** personal data, **approve** risky tools.
- LangChain's `create_agent(..., middleware=[...])` has built-ins for all four; approval needs a checkpointer and resumes with `Command(resume=...)`.
- **Order matters**: redact first, limit early, approve only what cannot be undone.
:::

:::note Answers
1. `class NoGuarantee(Middleware): def after_model(self, state, reply): return "I can't promise that, but here is what I know." if "guarantee" in reply.lower() else reply`. 2. The summary is written from raw text, so an email or card number can end up in the summary, and the summary is sent to a model (and maybe logged). 3. `refund_payment` and `send_email`: they move money or reach people outside and cannot be undone. Lookups and searches only read.
:::

```quiz
? What can a "before model" middleware do?
+ Change the messages or stop the run before the model is called
- Change the model's weights
- Run only after the tool returns
- Replace the vector database
! It sees the state before each call, so it can rewrite messages (redact, summarise) or stop (limits).

? Why should PII redaction come before summarisation?
+ So the summary, and anything that logs it, never contains raw personal data
- Because summarisation is faster
- Because redaction needs a model
- It does not matter
! Later layers only ever see what earlier layers pass on.

? Why does human-in-the-loop approval need a checkpointer?
+ The run pauses and must save its state so it can resume after the person decides
- To make the model smarter
- To count tokens
- To store embeddings
! Pausing means stopping the loop; the saved state lets it continue later on the same thread.
```
