---
track: aideep
title: "Deep dive 21: three projects to build and put on your portfolio"
short: Three projects
sub: A post generator, a support chatbot with memory and a human hand-off, and a multi-agent trip planner. Each starts as working code with tests; you extend it with a real model.
---

:::goals
- build three small, complete GenAI projects: a post generator, a chatbot with memory, and a multi-agent planner
- keep each one testable offline with a scripted model, then swap in a real model
- turn each into a portfolio piece with an evaluation, a safety story and a short write-up
:::

:::note How to use this lesson
Each project here is a **working starter** that runs offline with the real `langchain-core` and `langgraph` libraries (the model is a scripted stand-in, so the output is real but the "AI" is fixed). Your job is the **extension list** under each one. Run them in Codespaces or any machine with `pip install langchain-core langgraph`. The ideas come from [Deep dive 17](#aideep-17) and [Deep dive 18](#aideep-18); the evaluation habits from [Deep dive 11](#aideep-11) and [Deep dive 20](#aideep-20).
:::

## Project 1: LinkedIn-style post generator

**Idea:** turn a topic into a short post, and **never publish a draft that breaks your rules.** The interesting engineering is not the model call; it is the **rules and the retry loop** around it.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > post_generator.py <<'EOF'
import re
from pydantic import BaseModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.language_models.fake_chat_models import FakeListChatModel
import json

class Post(BaseModel):
    hook: str
    body: str
    hashtags: list[str]

# The scripted model replies with 3 candidate posts; the 2nd is too long, the 3rd has too many hashtags.
replies = [
  {"hook": "Search that understands meaning", "body": "Vectors turn text into numbers so similar ideas land close together.", "hashtags": ["#AI", "#RAG"]},
  {"hook": "A long one", "body": "word " * 80, "hashtags": ["#AI"]},
  {"hook": "Too many tags", "body": "Short body.", "hashtags": ["#a", "#b", "#c", "#d", "#e", "#f", "#g"]},
]
model = FakeListChatModel(responses=[json.dumps(r) for r in replies])
parser = PydanticOutputParser(pydantic_object=Post)
prompt = ChatPromptTemplate.from_template("Write a LinkedIn post about {topic}.\n{format}").partial(format=parser.get_format_instructions())
chain = prompt | model | parser

RULES = {
  "hook under 60 characters": lambda p: len(p.hook) <= 60,
  "body under 300 characters": lambda p: len(p.body) <= 300,
  "2 to 5 hashtags": lambda p: 2 <= len(p.hashtags) <= 5,
  "no 'revolutionary' or 'game-changer'": lambda p: not re.search(r"revolutionary|game-changer", p.body, re.I),
}
def check(post): return [name for name, ok in RULES.items() if not ok(post)]

accepted = []
for i in range(3):
    post = chain.invoke({"topic": "vector search"})
    failed = check(post)
    print(f"candidate {i + 1}: {'ACCEPT' if not failed else 'REJECT'}  {failed or ''}")
    if not failed: accepted.append(post)
assert len(accepted) == 1, "exactly one candidate should pass"
print("\nPublished text:\n" + accepted[0].hook + "\n\n" + accepted[0].body + "\n\n" + " ".join(accepted[0].hashtags))
EOF
python3 post_generator.py
```

Three scripted candidates: one passes; one is too long and has too few hashtags; one has too many hashtags. The `assert` is a tiny **acceptance test**: exactly one candidate must pass.

**Extend it:**
1. Swap the scripted model for a real one ([Deep dive 17](#aideep-17), section 5), keeping the key in an environment variable.
2. Retry up to three times, feeding the **failed rules back into the prompt** ("the last draft broke: body under 300 characters").
3. Add a tone parameter and a banned-phrase list; add a rule for hashtags starting with `#`.
4. Add a human approval step before anything is posted (the pattern from [Deep dive 18](#aideep-18), section 4).
5. Evaluate: 20 topics, score each output with your rules and by reading, and record the pass rate before and after each change.

## Project 2: support chatbot with memory and a human hand-off

**Idea:** answer known questions from an FAQ, admit when unsure, **pause for a human** on angry customers, and remember the conversation per customer.

```run
cd ~/lab/ai
cat > support_bot.py <<'EOF'
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import interrupt, Command
from langchain_core.messages import HumanMessage, AIMessage

FAQ = {"opening hours": "We are open 9am to 6pm, Monday to Friday.", "refund": "Refunds are processed within 5 working days."}

class Bot(TypedDict):
    messages: Annotated[list, add_messages]
    route: str

def classify(s):
    text = s["messages"][-1].content.lower()
    if any(k in text for k in FAQ): return {"route": "faq"}
    if any(w in text for w in ("angry", "complaint", "lawyer")): return {"route": "human"}
    return {"route": "fallback"}
def faq(s):
    text = s["messages"][-1].content.lower()
    return {"messages": [AIMessage(next(a for k, a in FAQ.items() if k in text))]}
def fallback(s): return {"messages": [AIMessage("I am not sure. Could you rephrase, or ask about opening hours or refunds?")]}
def human(s):
    reply = interrupt({"needs_human": s["messages"][-1].content})        # pause until an agent answers
    return {"messages": [AIMessage(f"[agent] {reply}")]}

g = StateGraph(Bot)
for n, f in (("classify", classify), ("faq", faq), ("fallback", fallback), ("human", human)): g.add_node(n, f)
g.add_edge(START, "classify")
g.add_conditional_edges("classify", lambda s: s["route"], {"faq": "faq", "fallback": "fallback", "human": "human"})
for n in ("faq", "fallback", "human"): g.add_edge(n, END)
app = g.compile(checkpointer=InMemorySaver())

cfg = {"configurable": {"thread_id": "customer-42"}}
def turn(text):
    out = app.invoke({"messages": [HumanMessage(text)]}, cfg)
    if "__interrupt__" in out: return "PAUSED for a human: " + out["__interrupt__"][0].value["needs_human"]
    return out["messages"][-1].content
tests = [("What are your opening hours?", "9am to 6pm"), ("blah blah", "not sure"), ("I want to file a complaint", "PAUSED")]
for q, expect in tests:
    answer = turn(q)
    print(f"{q!r:34} -> {answer}")
    assert expect in answer, f"expected {expect!r}"
print("agent resumes:", app.invoke(Command(resume="I am sorry, calling you now."), cfg)["messages"][-1].content)
print("messages kept in memory:", len(app.get_state(cfg).values["messages"]))
EOF
python3 support_bot.py
```

The classifier here is keyword-based so the project is deterministic. Look at the structure: **one node per behaviour**, a routing function, memory by thread id, and a pause that survives until a human answers.

**Extend it:**
1. Replace `classify` with a model call that returns one of three labels; add a **test set** of 30 messages with the expected route and report the accuracy.
2. Replace the FAQ dictionary with retrieval over real documents ([Deep dive 6](#aideep-6), [Deep dive 16](#aideep-16)) and measure faithfulness ([Deep dive 20](#aideep-20)).
3. Add the guard pipeline from [Deep dive 20](#aideep-20) in front of `classify`, and redact personal data before storing messages.
4. Use a database checkpointer so memory survives a restart, and add a rule that deletes a customer's memory on request.
5. Write down what the bot must **never** do, and add one test for each rule.

## Project 3: multi-agent trip planner

**Idea:** several specialists work on shared state: flights, hotels and weather narrow the options; a planner chooses. The starter uses **fake APIs** with fixed data so you can test the logic.

```run
cd ~/lab/ai
cat > trip_planner.py <<'EOF'
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END

# Fake "APIs" (a real project would call a flights API, a hotels API, a weather API)
FLIGHTS = {"Goa": 5200, "Jaipur": 3900, "Kochi": 4700}
HOTEL_PER_NIGHT = {"Goa": 3500, "Jaipur": 2800, "Kochi": 3100}
WEATHER = {"Goa": "rain", "Jaipur": "sunny", "Kochi": "sunny"}

class Trip(TypedDict):
    nights: int
    budget: int
    candidates: list
    log: Annotated[list, operator.add]
    plan: dict

def flights_agent(s):
    ok = [c for c in FLIGHTS if FLIGHTS[c] < s["budget"]]
    return {"candidates": ok, "log": [f"flights: {len(ok)} destinations under budget"]}
def hotels_agent(s):
    ok = [c for c in s["candidates"] if FLIGHTS[c] + HOTEL_PER_NIGHT[c] * s["nights"] <= s["budget"]]
    return {"candidates": ok, "log": [f"hotels: {len(ok)} still affordable for {s['nights']} nights"]}
def weather_agent(s):
    ok = [c for c in s["candidates"] if WEATHER[c] != "rain"]
    return {"candidates": ok, "log": [f"weather: dropped rainy options, {len(ok)} left"]}
def planner(s):
    if not s["candidates"]: return {"plan": {"error": "nothing fits: raise the budget or cut nights"}, "log": ["planner: no plan"]}
    best = min(s["candidates"], key=lambda c: FLIGHTS[c] + HOTEL_PER_NIGHT[c] * s["nights"])
    cost = FLIGHTS[best] + HOTEL_PER_NIGHT[best] * s["nights"]
    return {"plan": {"destination": best, "total_cost": cost}, "log": [f"planner: chose {best}"]}

g = StateGraph(Trip)
for n, f in (("flights", flights_agent), ("hotels", hotels_agent), ("weather", weather_agent), ("planner", planner)): g.add_node(n, f)
g.add_edge(START, "flights"); g.add_edge("flights", "hotels"); g.add_edge("hotels", "weather"); g.add_edge("weather", "planner"); g.add_edge("planner", END)
app = g.compile()

for budget, nights in ((12000, 2), (7000, 2), (30000, 4)):
    out = app.invoke({"nights": nights, "budget": budget, "candidates": [], "log": [], "plan": {}})
    print(f"budget {budget:5} nights {nights}: {out['plan']}")
    print("   trace:", " | ".join(out["log"]))
assert app.invoke({"nights": 2, "budget": 1000, "candidates": [], "log": [], "plan": {}})["plan"].get("error")
EOF
python3 trip_planner.py
```

The three budgets show the three behaviours you must test: a normal plan, **"nothing fits"** handled as a clear message instead of a crash, and a bigger trip. The trace line is your debugging tool: you can see which agent removed which option.

**Extend it:**
1. Replace each fake function with a real API call behind a **tool with a good description** ([Field guide 7](#aifield-7)); keep the fakes for tests.
2. Let a model, not a fixed order, pick the next agent (the supervisor pattern in [Deep dive 18](#aideep-18)), with a step limit.
3. Add **memory of preferences** ("I hate early flights") in a separate store, and show it changing the plan ([Field guide 9](#aifield-9)).
4. Record cost and latency per run ([AI infrastructure 9](#aiinfra-9)) and set a budget per request.
5. Ask whether multiple agents are really needed: build the single-agent version and compare quality, cost and speed ([Deep dive 8](#aideep-8)).

## Make it a portfolio piece

For each project, a reviewer should find in your repository, in order:

1. **What it does** in two sentences, and a 30-second demo (a GIF or a terminal recording).
2. **The architecture** as a small diagram and a list of the decisions you made ([Deep dive 14](#aideep-14), section 3).
3. **How you tested it**: the test set, the metrics, the before and after numbers.
4. **The risks and what you did about them**: injection, personal data, cost, failure modes.
5. **How to run it** in three commands, with no secrets in the repository.

## Common mistakes

- Building the demo and skipping the test set: you cannot say if version 2 is better.
- Putting the API key in the code or in git history.
- Letting the model decide everything: fix the allowed paths in code, let the model choose among them.
- No limit on steps, tokens or money.

## Practice

Pick the project closest to a job you want. Write its **evaluation plan first** (10 test cases and what a pass means), then build the smallest version that passes it.

:::recap
- A good GenAI project is **rules, tests and a safe loop around a model call**, not just the call.
- Keep a **scripted-model test** for the logic and add real-model runs on top.
- Show the **evaluation, the risks and the trade-offs**: that is what separates a portfolio piece from a demo.
:::

```quiz
? Why keep a scripted fake model in the tests of a GenAI project?
+ It makes the logic around the model deterministic, free and testable without an API key
- It makes the real model faster
- It replaces evaluation
- It is required by LangChain
! The fake lets you test routing, validation, retries and state exactly; real-model quality is measured separately.

? In the support bot, what lets the conversation pause until a human replies and then continue?
+ interrupt with a checkpointer, resumed with Command(resume=...)
- A longer prompt
- A bigger model
- A retry loop
! The checkpointer saves the state so the graph can wait and resume.

? What is the most valuable thing to add to a finished demo before putting it on a portfolio?
+ A test set with before-and-after results and a short risks section
- More hashtags
- A larger model
- A logo
! Evidence of evaluation and safety thinking is what reviewers look for.
```
