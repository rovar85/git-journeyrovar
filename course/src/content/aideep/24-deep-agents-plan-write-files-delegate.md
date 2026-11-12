---
track: aideep
title: "Deep dive 24: Deep agents: plan, write files, delegate"
short: Deep agents
sub: Why simple tool loops fail on long tasks, and the three habits that fix them: a written to-do list, a file system for big results, and sub-agents with their own small context.
---

:::goals
- explain why a simple tool-calling loop struggles with long, many-step tasks
- describe the three habits of a deep agent: planning, a file system and sub-agents
- measure how much context each habit saves, with a runnable model
- build a deep agent with the `deepagents` library and read what it did
:::

:::note How the code here runs
The first script is plain Python and also runs in the lab on this page. The second uses the real library (`deepagents`) with a **scripted fake model** or a **mocked reply**, so it needs no API key and no network, and the output shown is real. The lab on this page cannot run that one (it needs the library); use Codespaces or any machine with `pip install deepagents`. Library versions at the time of writing: deepagents 0.7, langchain 1.5.
:::

## 1. Shallow agents run out of room

A simple agent ([Deep dive 7](#aideep-7)) keeps every message, tool call and tool result in one growing context. That is fine for "look up the weather". For "research three databases and write a report" it breaks down: each search adds hundreds of words, the context fills, cost per call rises, and the model loses track of the goal it was given forty messages ago.

Research and coding agents that handle long tasks share three habits. The open-source `deepagents` library (built on LangGraph) packages them; you can also write them yourself.

| Habit | What it is | What it fixes |
| --- | --- | --- |
| **Plan** | a `write_todos` tool; the agent writes a to-do list and updates each item's status | forgetting the goal; skipping steps |
| **File system** | `write_file`, `read_file`, `ls`, `edit_file` on a virtual or real disk | big results no longer sit in the context; they are saved and read back when needed |
| **Sub-agents** | a `task` tool that starts a fresh agent for one job and returns only its answer | the main context stays small; each job gets a clean, focused context |

A detailed **system prompt** that explains how to use these tools is the fourth ingredient; most of the behaviour comes from it.

## 2. Measure it

The same research task, done flat and done the deep way. Words stand in for tokens.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > deep.py <<'EOF'
# The three habits of a "deep agent", in plain Python: a written plan (to-do list),
# a file system for big intermediate results, and sub-agents that each get a fresh, small context.
def search(topic):                                  # stands in for a web search: long, noisy output
    return f"Results for {topic}: " + " ".join(f"[{topic} fact {i}]" for i in range(1, 61))

def tokens(msgs): return sum(len(m.split()) for m in msgs)

TASK = "Compare Postgres, MongoDB and DynamoDB for a small startup and write a report"
TOPICS = ["Postgres", "MongoDB", "DynamoDB"]

print("Flat agent: everything goes into one context")
ctx = [TASK]
for t in TOPICS:
    ctx.append(search(t + " pricing")); ctx.append(search(t + " scaling"))
    print(f"  after {t:9} context = {tokens(ctx):4} words")

print("\nDeep agent")
files, todos = {}, [{"task": f"research {t}", "status": "pending"} for t in TOPICS] + [{"task": "write report", "status": "pending"}]
main = [TASK, "plan: " + "; ".join(x["task"] for x in todos)]
def show(): print("  todos:", " | ".join(f"{x['task']}={x['status']}" for x in todos))

def sub_agent(topic):                               # its own context; only a short answer goes back
    own = [f"Research {topic} for a startup. Save notes to a file, reply with one line."]
    own += [search(topic + " pricing"), search(topic + " scaling")]
    path = f"/notes/{topic.lower()}.md"
    files[path] = "\n".join(own[1:])                  # big text goes to the file system
    return f"{topic}: notes in {path} ({len(files[path].split())} words)", tokens(own)

show()
for item, t in zip(todos, TOPICS):
    item["status"] = "in_progress"
    reply, used = sub_agent(t)
    main.append(reply); item["status"] = "done"
    print(f"  sub-agent {t:9} used {used} words in its own context; main context now {tokens(main)} words")
todos[-1]["status"] = "in_progress"
report = "# Report\n" + "\n".join(f"- {p}: {len(txt.split())} words of notes read" for p, txt in files.items())
files["/report.md"] = report; todos[-1]["status"] = "done"; main.append("report written to /report.md")
show()
print("  files:", sorted(files))
print(f"  main context at the end: {tokens(main)} words (flat agent: {tokens(ctx)})")
EOF
python3 deep.py
```

The flat agent's context grows with every search (about 1,500 words here, and real searches are longer). In the deep agent each sub-agent used about 500 words **in its own context**, saved them to a file and sent back one line, so the main context stayed under 50 words. The final step reads the files it needs, when it needs them.

## 3. With the `deepagents` library

`create_deep_agent` builds an agent that already has the file tools and the `task` tool for sub-agents; here the to-do tool is added as middleware ([Deep dive 22](#aideep-22)). The scripted model plays both the main agent and the sub-agent, in a fixed order.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > deep_real.py <<'EOF'
from deepagents import create_deep_agent
from langchain.agents.middleware import TodoListMiddleware
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

offered = []
class Fake(GenericFakeChatModel):                  # a scripted model that "calls" tools in a fixed order
    def bind_tools(self, tools, **kw):
        offered.append(sorted(t.name for t in tools)); return self

def call(name, args, i): return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"c{i}"}])
model = Fake(messages=iter([
    call("write_todos", {"todos": [{"content": "research Postgres", "status": "in_progress"}, {"content": "write report", "status": "pending"}]}, 1),
    call("task", {"description": "Research Postgres for a startup; save notes to /notes/pg.md", "subagent_type": "general-purpose"}, 2),
    call("write_file", {"file_path": "/notes/pg.md", "content": "Postgres: relational, strong SQL, cheap managed options."}, 3),   # sub-agent
    AIMessage(content="Notes saved in /notes/pg.md"),                                                                             # sub-agent's answer
    call("write_file", {"file_path": "/report.md", "content": "# Report\nPostgres is a safe default."}, 4),
    AIMessage(content="Done: see /report.md"),
]))
agent = create_deep_agent(model=model, system_prompt="You research and write reports.",
                          middleware=[TodoListMiddleware()])
out = agent.invoke({"messages": [{"role": "user", "content": "Compare databases and write a report"}]})
print("tools the agent gets:", offered[0])
print("todos:", out["todos"])
print("files:", sorted(out["files"]))
print("main agent history (the sub-agent's own write_file call is not in it):")
for m in out["messages"]:
    print("  %-5s %s" % (m.type, m.content[:60] or [c["name"] for c in m.tool_calls]))
EOF
python3 deep_real.py
```

Notice that the sub-agent's own `write_file` call for `/notes/pg.md` is **not** in the main history; only its one-line answer came back as the result of `task`. The file is still there in `files`, shared through the file system. That is context isolation working.

In a real project you pass a real model and describe your sub-agents (not run here):

```term
agent = create_deep_agent(
    model="openai:gpt-4o",
    tools=[web_search],
    system_prompt="You are a careful researcher. Plan first, save notes to files, delegate each topic.",
    subagents=[{"name": "researcher", "description": "Researches one topic in depth",
                "system_prompt": "Search, save notes to /notes/<topic>.md, reply in one line.",
                "tools": [web_search]}],
    middleware=[TodoListMiddleware()],
)
```

## 4. When not to use one

- **Short tasks.** Planning and delegation add model calls. For a two-step job a plain loop is faster and cheaper.
- **Tight latency.** Each sub-agent is several round trips.
- **Unclear sub-tasks.** Sub-agents work when the pieces are independent (one per topic, one per file). If every piece needs the others' results, keep it in one context.
- **Untrusted file access.** A real file system backend can read and write your disk; restrict paths and put writes behind approval ([Deep dive 12](#aideep-12)).

## Common misconceptions

- "Deep agents use a deeper model." The model is the same; "deep" is about the long task, the plan, the files and the delegation.
- "Sub-agents share memory." Each starts with a fresh context; they share only what is written to files or returned as text.
- "A to-do list is just decoration." Re-reading and updating the plan each step keeps a long run on track, and makes it easy to see where it stopped.

## Practice (answers below)

1. In `deep.py`, make each sub-agent return a 3-line summary instead of 1 line. How does the main context change?
2. A coding agent must change 40 files the same way. How would you use sub-agents?
3. Why is the file system better than returning the full notes from each sub-agent?

:::recap
- Simple loops fail on long tasks because the **context fills** and the goal gets lost.
- Deep agents add a **plan** (to-do list), a **file system** for big results and **sub-agents** with isolated contexts, steered by a detailed system prompt.
- `create_deep_agent` gives the file and `task` tools; add `TodoListMiddleware` for the plan. Use them for long, splittable work, not for short tasks.
:::

:::note Answers
1. The main context grows by a few more words per topic; still far smaller than the flat agent, because the raw search results stay in the sub-agents and the files. 2. One sub-agent per file (or per small batch), each with the same instructions; the main agent keeps the list of files as its to-do list and checks each result. 3. Returned text goes straight into the main context; a file is read only when needed, and only the parts needed.
:::

```quiz
? What does a sub-agent send back to the main agent?
+ Only its final answer, not its whole history
- Its whole message history
- Its model weights
- Nothing at all
! Context isolation: the work stays in the sub-agent; a short result comes back.

? Why does a deep agent write intermediate results to files?
+ To keep large text out of the main context and read it back only when needed
- Because models cannot read text
- To make the agent slower
- Files are required by the API
! Files act as memory outside the context window.

? When is a plain tool loop the better choice?
+ For short tasks where planning and delegation would only add calls and delay
- For a long research report
- For changing 40 files
- Never
! The deep habits pay off on long, splittable work.
```
