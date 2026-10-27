---
track: aideep
title: "Deep dive 17: LangChain, the ideas behind the framework"
short: LangChain
sub: Prompts, models, parsers and tools as composable steps; structured output and why it fails; the tool-calling loop written by hand. Real LangChain code, run with a scripted model.
---

:::goals
- explain what LangChain is for and what a "runnable" and a "chain" are
- build a prompt | model | parser chain, run it, batch it and combine steps
- get structured output, and handle the case where the model does not follow the format
- define a tool and write the tool-calling loop yourself, so the framework is no longer magic
:::

:::note How the code here runs
The examples use the real `langchain-core` library (version 1.x at the time of writing) with a **scripted fake model** that returns the replies we give it. So they need no API key, no network and cost nothing, and the output is real. To use a real model you only swap that one line (shown at the end). The lab in this page cannot run these (they need the library); run them in Codespaces or any machine with `pip install langchain-core`.
:::

## 1. What LangChain is, honestly

LangChain is a library of **building blocks for LLM applications**: prompt templates, chat-model wrappers for many providers, output parsers, tools, retrievers and a common way to chain them. Its value is a shared interface, so you can swap one model or vector store for another, and a ready set of integrations. Its cost is another layer to learn and to debug. A small app can be plain Python calling a provider's SDK; reach for the framework when you have many integrations, need tracing, or want to build on [LangGraph](#aideep-18).

The idea to hold on to is the **Runnable**: anything with `invoke`, `batch` and `stream`. Prompt templates, models and parsers are all runnables, so they can be joined with `|`, the **LangChain Expression Language (LCEL)**.

## 2. A chain: prompt | model | parser

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
python3 -c "import importlib.metadata as m; print('langchain-core', m.version('langchain-core'))"
cat > chain1.py <<'EOF'
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.runnables import RunnableLambda, RunnableParallel

prompt = ChatPromptTemplate.from_messages([
    ("system", "You write one-line LinkedIn post openers."),
    ("human", "Topic: {topic}. Tone: {tone}."),
])
print(prompt.invoke({"topic": "vector search", "tone": "friendly"}).to_messages())

model = FakeListChatModel(responses=["Ever wondered how search finds meaning, not just words?"])
chain = prompt | model | StrOutputParser()
print(chain.invoke({"topic": "vector search", "tone": "friendly"}))
print(type(chain).__name__, [type(s).__name__ for s in chain.steps])

# Runnables compose: a plain function becomes a step; parallel runs branches on the same input
shout = RunnableLambda(lambda s: s.upper())
count = RunnableLambda(lambda s: len(s.split()))
both = chain | RunnableParallel(text=shout, words=count)
print(both.invoke({"topic": "vector search", "tone": "friendly"}))
print(chain.batch([{"topic": "RAG", "tone": "formal"}, {"topic": "MCP", "tone": "casual"}]))
EOF
python3 chain1.py
```

What you saw:

- The **prompt template** filled `{topic}` and `{tone}` and produced messages (a system message and a human message).
- The fake model returned its scripted reply. A real model would send those messages to a provider.
- `StrOutputParser` turned the model's message object into a plain string.
- `chain.steps` shows the chain is just a list of runnables. A `RunnableLambda` wraps any Python function as a step, and `RunnableParallel` runs branches on the same input.
- `batch` runs many inputs. (The scripted model repeats its one reply, which is why both answers match.)

## 3. Structured output, and what happens when it fails

Applications need data, not prose: a JSON object with known fields. You describe the shape with a Pydantic model and attach a parser. The honest lesson of the next demo is that **the model sometimes does not comply**, so you must handle failure.

```run
cd ~/lab/ai
cat > structured.py <<'EOF'
import json
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.language_models.fake_chat_models import FakeListChatModel

class Post(BaseModel):
    hook: str = Field(description="first line, under 90 characters")
    body: str
    hashtags: list[str]

parser = PydanticOutputParser(pydantic_object=Post)
print(parser.get_format_instructions()[:260], "...")

good = json.dumps({"hook": "Search that understands meaning", "body": "Vectors turn text into numbers.", "hashtags": ["#AI", "#RAG"]})
bad_json = "Sure! Here is your post: Search that understands meaning"
bad_shape = json.dumps({"hook": "Only a hook"})

for label, reply in (("valid JSON", good), ("chatty text, no JSON", bad_json), ("JSON with missing fields", bad_shape)):
    chain = ChatPromptTemplate.from_template("{x}") | FakeListChatModel(responses=[reply]) | parser
    try:
        print(f"{label:26} -> OK:", chain.invoke({"x": "go"}).hook)
    except Exception as e:
        print(f"{label:26} -> {type(e).__name__}")

# a fallback chain: try the model again with a stricter reply
flaky = ChatPromptTemplate.from_template("{x}") | FakeListChatModel(responses=[bad_json]) | parser
steady = ChatPromptTemplate.from_template("{x}") | FakeListChatModel(responses=[good]) | parser
print("with_fallbacks ->", flaky.with_fallbacks([steady]).invoke({"x": "go"}).hashtags)
EOF
python3 structured.py
```

Three replies, three outcomes: valid JSON works; a friendly sentence with no JSON fails; JSON with missing fields fails validation. In production you combine three tools: clear **format instructions** in the prompt, **validation** with a clear error, and a **retry or fallback** (`with_fallbacks` above). Many providers also offer native structured output or "JSON mode", which LangChain exposes as `model.with_structured_output(Post)` (see the real-model example below). Native support lowers the failure rate; it does not remove the need to validate.

## 4. Tools and the loop the framework hides

A **tool** is a function plus a description and a JSON schema, so the model can ask for it by name. The `@tool` decorator builds the schema from the type hints and the docstring. **Write good docstrings: the model reads them** (see [Deep dive 6](#aideep-6) and [Field guide 7](#aifield-7)).

Here is the whole tool-calling loop in plain code, with a scripted model that first asks for the tool, then answers using the result. This is what an "agent executor" does for you.

```run
cd ~/lab/ai
cat > toolloop.py <<'EOF'
from langchain_core.tools import tool
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.utils.function_calling import convert_to_openai_tool
import json

@tool
def get_disk_usage(path: str) -> str:
    """Return the disk usage of a folder, as a short text."""
    return {"/var/log": "4.1G", "/home": "11G"}.get(path, "unknown path")

print("tool name:", get_disk_usage.name)
print("schema   :", json.dumps(convert_to_openai_tool(get_disk_usage)["function"]["parameters"]))
print("direct   :", get_disk_usage.invoke({"path": "/var/log"}))

# A scripted model: first it asks for the tool, then it answers using the tool result.
script = iter([
    AIMessage(content="", tool_calls=[{"name": "get_disk_usage", "args": {"path": "/var/log"}, "id": "call_1"}]),
    AIMessage(content="/var/log is using 4.1G."),
])
model = GenericFakeChatModel(messages=script)

messages = [HumanMessage("How big is /var/log?")]
for turn in range(4):                                   # the agent loop, in plain code
    reply = model.invoke(messages)
    messages.append(reply)
    if not reply.tool_calls:
        print("final    :", reply.content); break
    for call in reply.tool_calls:
        result = get_disk_usage.invoke(call["args"])
        print(f"turn {turn}: model asked for {call['name']}({call['args']}) -> {result}")
        messages.append(ToolMessage(content=result, tool_call_id=call["id"]))
print([type(m).__name__ for m in messages])
EOF
python3 toolloop.py
```

The message list at the end is the loop's whole story: the human asks, the model replies with a **tool call**, you run the tool and add a **ToolMessage**, then the model answers. Add a turn limit, validate the arguments, and ask a human before a risky tool: those safety rules are in [Deep dive 12](#aideep-12).

## 5. Swapping in a real model (not run here)

This is **Example, not run here**: it needs a provider account and an API key, which must never be put in code (read them from an environment variable).

```python
# pip install langchain langchain-openai     (or another provider package)
from langchain.chat_models import init_chat_model

model = init_chat_model("openai:<model-name>")          # key comes from the OPENAI_API_KEY environment variable
chain = prompt | model | StrOutputParser()                # the rest of the chain is unchanged
structured = model.with_structured_output(Post)           # native structured output where supported

# The framework also ships an agent helper that runs the loop from section 4 for you:
# from langchain.agents import create_agent
# agent = create_agent(model, tools=[get_disk_usage], system_prompt="You are an ops assistant.")
```

LangChain changes quickly, and package names and helper functions have moved between versions. Treat the names above as a starting point and check the current documentation.

## Common misconceptions

- "LangChain is required to build an LLM app." It is optional: it is convenience and integrations.
- "A chain is an agent." A chain runs a **fixed** sequence. An agent lets the model **choose** the next step in a loop (see [Deep dive 7](#aideep-7)). For loops with state, branching and pauses, use [LangGraph](#aideep-18).
- "Structured output always works." Validate, and plan for retries.

## Practice (answers below)

1. Add a second parser step that turns the model's JSON into a Python list of hashtags using only the Pydantic model above.
2. In the tool loop, what stops an endless loop if the model keeps asking for tools?
3. Why is the tool's docstring part of your prompt?

:::recap
- A **runnable** has `invoke`, `batch` and `stream`; `|` joins runnables into a **chain**.
- **Structured output** needs a schema, validation and a fallback: models sometimes break the format.
- The **tool-calling loop** is: model asks, you run the tool, you return a `ToolMessage`, repeat with a turn limit.
- Swapping the model is one line; the rest of the chain stays.
:::

:::note Answers
1. `chain | RunnableLambda(lambda post: post.hashtags)`. 2. A maximum number of turns in your loop (the demo uses `range(4)`), plus a budget on cost and time. 3. The model reads the tool's name, description and schema to decide when and how to call it; a vague docstring leads to wrong calls.
:::

```quiz
? What does the | operator do between two LangChain runnables?
+ Feeds the output of the left one into the right one as a sequence
- Runs both in parallel and returns the faster result
- Compares their outputs
- Merges two prompts into one string
! LCEL uses | to compose a sequence; RunnableParallel is for parallel branches.

? A model returns a friendly sentence instead of the JSON you asked for. What is the best response in production?
+ Validate the output, then retry or fall back, and log the failure
- Assume it will not happen
- Parse it with a regular expression and hope
- Increase the temperature
! Models do not always follow the format, so validation plus a retry or fallback path is required.

? In the tool-calling loop, who actually runs the tool?
+ Your code; the model only asks for the call by name with arguments
- The model, on the provider's servers
- The prompt template
- The output parser
! The model never executes anything: it returns a tool call, and your code runs it and reports the result.
```
