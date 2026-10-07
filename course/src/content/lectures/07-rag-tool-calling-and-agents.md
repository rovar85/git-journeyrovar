---
track: lectures
title: "Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)"
short: L7 RAG, tools, agents
sub: Why the model needs outside knowledge, how a two-stage retriever works and is measured (NDCG, MRR, precision and recall at k), how a model calls tools, how an agent loops with ReAct, and the protocols and safety issues around them, with a working retriever and agent loop.
---

:::goals
- explain **why RAG** beats "just fine-tune it" or "stuff everything in the prompt"
- build the **retrieve, augment, generate** pipeline: chunking with overlap, embeddings, **BM25**, hybrid search, **re-ranking**, **HyDE**, contextual chunks and **prompt caching**
- compute **NDCG, MRR, precision@k and recall@k** on a ranked list
- explain **tool (function) calling** in three steps, how models learn it, **tool selection**, and **MCP**
- run a **ReAct (observe, plan, act) agent loop**, and name the **safety** and **reliability** issues
:::

:::note Provenance
Built from the **transcript of Stanford CME 295, lecture 7** (the file you supplied is labelled "llm-evaluation" by my fetch script, but its content is RAG, tool calling and agents; evaluation is lecture 8). Explained in my own words with **original, runnable Python** (standard library only). The "language model" in the agent loop is a **small rule-based stand-in** so the loop is deterministic; the "semantic embedding" in the retriever is a **hand-made concept map** standing in for a trained embedding model. Both are labelled where used.
:::

## 1. Why RAG?

A trained model knows only what was in its data up to the **knowledge cut-off** (a model card states it). To answer about the news last week:

1. **Further training** to inject knowledge is risky (it can **regress** other abilities), and is work you repeat for **every fine-tuned variant**.
2. **Pasting everything into the prompt** fails because context is **finite** (hundreds of thousands of tokens is a few hundred pages; roughly 4 characters per token), irrelevant text **hurts accuracy** (the needle-in-a-haystack test shows retrieval accuracy falls with prompt length and depends on where the fact sits), and you **pay per token**.

So: **find only the relevant passages and put those in the prompt.** That is **retrieval-augmented generation (RAG)**: **retrieve** relevant documents, **augment** the prompt with them, **generate** the answer. Quality is dominated by the **retrieval** step: a bad retriever means a bad answer.

## 2. Building the knowledge base

1. **Collect** documents.
2. **Chunk** them: pieces of a maximum size (typically **hundreds of tokens**, around 500), with some **overlap** between neighbours (low hundreds of tokens at most) so a sentence cut in half still has its context. Respect file structure (markdown, JSON, code).
3. **Embed** each chunk with an **embedding model** (a BERT-like **encoder**; sizes of the order of **1,000 to 1,500** dimensions). Trade-offs: a bigger embedding is richer but costs more storage and compute; chunks that are too small lose context, too large blur their meaning.

```run
mkdir -p ~/l7 && cd ~/l7
cat > chunk.py <<'PY'
def chunk(words, size=12, overlap=4):
    step = size - overlap
    return [" ".join(words[i:i + size]) for i in range(0, max(len(words) - overlap, 1), step)]

doc = ("Teddy bears were first made in the early 1900s and named after a president. "
       "A plush teddy bear should be washed gently by hand with cold water and mild soap. "
       "Never put a bear with glass eyes in a hot dryer because the eyes can crack.").split()
for i, c in enumerate(chunk(doc)):
    print(f"chunk {i}: {c}")
PY
python3 chunk.py
```

**What you see:** chunks of 12 words that **share 4 words** with the next one, so the sentence about washing is not cut into meaningless halves.

## 3. Two-stage retrieval

| Stage | Goal | How | Cost per query |
|---|---|---|---|
| **1. Candidate retrieval** | filter millions of chunks to **~100 candidates** (maximise **recall**) | **bi-encoder**: embed the query, compare with precomputed chunk embeddings by **cosine similarity**; use **approximate nearest neighbour (ANN)** indexes instead of a linear scan | cheap |
| **2. Re-ranking** (optional) | put the truly relevant at the top (maximise **precision**) | **cross-encoder**: feed **query and chunk together** to a model that outputs a score (so they can attend to each other) | heavier, but only on the ~100 |

The standard embedding model recipe is **Sentence-BERT**: train an encoder so that **relevant pairs have high cosine similarity and irrelevant pairs low**. The same encoder is often used for query and document, although a query ("where is cuddly?") and a document differ in nature. **HyDE** fixes this by asking an LLM to **write a fake answer document first** and embedding **that** instead of the question (it may or may not help; try it). Alternatively use separate query and document encoders (more to maintain).

### Keyword versus semantic search

- **Semantic (embedding) search** finds chunks with the **same meaning**, even with **no shared words**.
- **BM25** is a **keyword-overlap score** that guarantees the query's words appear. Use it when exact terms matter (a product name like "Cuddly").
- **Hybrid** combines both; a simple robust way is **reciprocal rank fusion (RRF)**: score = Σ 1/(60 + rank) across rankers.

```run
cd ~/l7
cat > retrieve.py <<'PY'
import math, re
from collections import Counter

docs = {
    "d1": "Cuddly is a brown teddy bear with a red ribbon and one button eye",
    "d2": "Huggy is a soft plush toy that sleeps in the bedroom near the window",
    "d3": "Washing instructions for plush toys: hand wash gently with cold water",
    "d4": "Airplane tickets for the summer are cheaper if you book early",
    "d5": "Where to find stuffed animals in the toy shop on the second floor",
}
tok = lambda s: re.findall(r"[a-z]+", s.lower())

# ---- BM25 (keyword)
N = len(docs); avgdl = sum(len(tok(d)) for d in docs.values()) / N
df = Counter(w for d in docs.values() for w in set(tok(d)))
def bm25(query, doc, k1=1.5, b=0.75):
    tf = Counter(tok(doc)); score = 0
    for w in tok(query):
        if w not in tf: continue
        idf = math.log((N - df[w] + 0.5) / (df[w] + 0.5) + 1)
        score += idf * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * len(tok(doc)) / avgdl))
    return score

# ---- "semantic" stand-in: a hand-made concept map (a real system uses a trained embedding model)
CONCEPTS = {"cuddly": "toy", "huggy": "toy", "teddy": "toy", "bear": "toy", "plush": "toy", "stuffed": "toy", "animals": "toy",
            "toys": "toy", "toy": "toy", "soft": "soft", "where": "location", "lives": "location", "find": "location",
            "shelf": "location", "nursery": "location", "bedroom": "location", "floor": "location", "shop": "location", "sleeps": "location",
            "wash": "clean", "washing": "clean", "water": "clean", "airplane": "travel", "tickets": "travel", "summer": "travel"}
def embed(text):
    return Counter(CONCEPTS[w] for w in tok(text) if w in CONCEPTS)
def cosine(a, b):
    num = sum(a[k] * b[k] for k in a); den = math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values()))
    return num / den if den else 0.0

query = "where is Cuddly"
kw = sorted(docs, key=lambda d: -bm25(query, docs[d]))
sem = sorted(docs, key=lambda d: -cosine(embed(query), embed(docs[d])))
def rrf(*rankings, k=60):
    s = Counter()
    for r in rankings:
        for i, d in enumerate(r): s[d] += 1 / (k + i + 1)
    return [d for d, _ in s.most_common()]
hybrid = rrf(kw, sem)
print("query:", query)
print("BM25 (keyword) ranking      :", kw[:3], "  <- d1 literally contains 'Cuddly'")
print("semantic (concept) ranking  :", sem[:3], "  <- about toys and WHERE they are, no 'Cuddly' needed")
print("hybrid (RRF) ranking        :", hybrid[:3])
PY
python3 retrieve.py
```

**What you see:** BM25 puts the chunk that literally contains "Cuddly" first; the semantic ranking promotes chunks about toys' locations even without the word; **hybrid** keeps the exact match near the top while still surfacing semantic neighbours. Which is best depends on the query and the corpus; many systems use hybrid.

### Chunks that lost their context

A chunk like "It rose 3% in the second quarter" is meaningless alone. **Contextual retrieval** asks an LLM, for each chunk, for a **short context** derived from the **whole document**, and prepends it before embedding. That is **one LLM call per chunk**, made affordable by **prompt caching**: because decoder models process left to right, a **repeated prompt prefix** (the document) gives the **same internal activations**, so providers store them and charge a **cached-input price** (the lecture cites about one tenth of the normal input price). The lesson for prompt design: **put what repeats first**.

```run
cd ~/l7
cat > cache.py <<'PY'
doc_tokens, chunks, chunk_tokens, out_tokens = 20000, 200, 500, 100
price_in, price_cached, price_out = 1.00, 0.10, 8.00          # ASSUMED dollars per million tokens (illustrative)
no_cache = chunks * ((doc_tokens + chunk_tokens) * price_in + out_tokens * price_out) / 1e6
with_cache = (doc_tokens * price_in + (chunks - 1) * doc_tokens * price_cached + chunks * chunk_tokens * price_in + chunks * out_tokens * price_out) / 1e6
print(f"contextualising {chunks} chunks of one {doc_tokens:,}-token document:")
print(f"  without prompt caching: ${no_cache:.2f}")
print(f"  with caching (document prefix cached at 10% price): ${with_cache:.2f}   ({no_cache / with_cache:.1f}x cheaper)")
PY
python3 cache.py
```

(Prices are **assumptions** for illustration, not any provider's actual rates.)

## 4. Measuring retrieval

Given the top-K list and the **ground-truth relevant** set:

- **Precision@K:** of the K returned, the fraction that are relevant.
- **Recall@K:** of all relevant documents, the fraction returned in the top K.
- **MRR (mean reciprocal rank):** `1 / rank of the first relevant result`, averaged over queries. Ignores everything after the first hit.
- **NDCG@K:** rewards putting relevant items **high**. **DCG** = Σ rel_i / log₂(i + 1) over the top K (a discount for lower positions); **NDCG** divides by the **ideal DCG** (the best possible ordering), so **1 = perfect**.

The standard collection for comparing embedding models is the **Massive Text Embedding Benchmark (MTEB)**.

```run
cd ~/l7
cat > metrics.py <<'PY'
import math

def precision_at_k(rels, k): return sum(rels[:k]) / k
def recall_at_k(rels, k, total_relevant): return sum(rels[:k]) / total_relevant
def mrr(rels):
    for i, r in enumerate(rels, 1):
        if r: return 1 / i
    return 0.0
def dcg(rels, k): return sum(r / math.log2(i + 1) for i, r in enumerate(rels[:k], 1))
def ndcg(rels, k):
    ideal = sorted(rels, reverse=True)
    return dcg(rels, k) / dcg(ideal, k) if dcg(ideal, k) else 0.0

# 1 = relevant, 0 = not, in the order the system returned them; 3 relevant documents exist in total
good = [1, 1, 0, 1, 0]
bad  = [0, 0, 1, 1, 1]
for name, rels in [("relevant ranked high", good), ("relevant ranked low", bad)]:
    print(f"{name:22} P@5 {precision_at_k(rels, 5):.2f}  R@5 {recall_at_k(rels, 5, 3):.2f}  MRR {mrr(rels):.2f}  NDCG@5 {ndcg(rels, 5):.2f}")
print("\nSame precision and recall at 5, very different MRR and NDCG: only the rank-aware metrics see the ordering.")
PY
python3 metrics.py
```

## 5. Tool (function) calling

RAG feeds **unstructured text**. For **structured** data or **actions** (search, weather, stocks, calculation, sending an email, setting a thermostat) the model uses **tools**. Definition used in the lecture: *tool calling lets autonomous systems complete complex tasks by dynamically accessing, and possibly acting on, external resources.* It addresses the knowledge cut-off differently (and complements RAG), and can also extend **computation** (turn a calculation into code, run it, read the result).

**Three steps:**

1. **Predict the call.** The prompt's preamble contains each tool's **API (name, arguments, documentation) but not its implementation**. From the user's request the model outputs a call, for example `find_teddy_bear(lat=37.43, lon=-122.17)`. It also fills **arguments from context** (the user's location).
2. **Execute** the call in your code (nothing to do with the model) and get a **structured result**.
3. **Respond:** feed the call and the result back; the model writes a **natural-language** answer.

**How models learn to do this:** (a) **SFT pairs** for step 1 (conversation so far → the tool call) and for step 3 (conversation + call + result → the final answer, in your preferred format), covering varied phrasings, multi-turn use and explicit locations; (b) increasingly, **no tool-specific training**: today's models are trained on lots of code, so a **prompt that explains the tool** is enough. Few-shot examples help but generalise poorly; a better route is to write an **evaluation set** of (request, expected call) pairs, run your current explanation against it, and **ask a strong reasoning model to improve the explanation** from the failures (done offline; the final explanation is a fixed prompt).

**Too many tools** hurt: they clog the context and the model gets confused, and you cannot fit everyone's tools. **Tool selection (a router):** first show the model only each tool's **name and a short description** and ask which are relevant; then put **only those tools' full APIs** in the prompt. (It is similar to RAG over tool descriptions, and can be implemented that way.)

**Standardising: MCP (Model Context Protocol)**, from Anthropic. An **MCP server** exposes **tools** (functions), **prompts** (templates showing how to use them) and **resources** (data the tools can use); an **MCP client** inside the **host** application (the LLM app) connects to it one-to-one. A book provider might run a server with book-finding tools, so every LLM host can use them without re-implementing.

## 6. Agents: loops of reason and act

An **agent** pursues a goal **autonomously** and may do **several loops** of reasoning and tool calls (it can contain reasoning chains, RAG and tool calls). **ReAct** (reason plus act; the paper's wording is *think, act, observe*) decomposes a task into a loop of:

1. **Observe:** restate the situation from the request and from the last tool result ("the bear is cold; the room temperature is unknown").
2. **Plan:** decide the next step ("find the room temperature").
3. **Act:** call a tool.
Repeat until the goal is met, then answer. For several cooperating agents there is also an **agent-to-agent (A2A) protocol** (agents expose **skills**, report **status**, can be **cancelled**).

Here is a runnable loop with a **rule-based stand-in for the LLM** so you can see the control flow, the **tool results fed back**, and the **stop condition**:

```run
cd ~/l7
cat > react.py <<'PY'
import json

# ---- the world and the tools (these are YOUR code, not the model)
room = {"temp_f": 65}
def get_room_temperature(): return {"temp_f": room["temp_f"]}
def set_thermostat(delta_f):
    room["temp_f"] += delta_f
    return {"status": "ok", "new_target_f": room["temp_f"]}
TOOLS = {"get_room_temperature": get_room_temperature, "set_thermostat": set_thermostat}

# ---- a rule-based stand-in for the LLM: sees the history, returns observe / plan / action
def fake_llm(history):
    last = history[-1]
    if last["role"] == "user":
        return {"observe": "The teddy bear is cold; room temperature unknown.", "plan": "Find the room temperature.",
                "action": {"tool": "get_room_temperature", "args": {}}}
    result = last["content"]
    if "temp_f" in result and result["temp_f"] < 68:
        return {"observe": f"Room is {result['temp_f']}F, colder than comfortable.", "plan": "Raise the temperature by 5 degrees.",
                "action": {"tool": "set_thermostat", "args": {"delta_f": 5}}}
    return {"observe": f"Done: {json.dumps(result)}", "plan": "Goal reached.", "final": "I raised the room to a comfortable temperature for your teddy bear."}

history = [{"role": "user", "content": "My teddy bear is cold. Please do something."}]
for step in range(1, 6):                                     # budget: at most 5 loops
    out = fake_llm(history)
    print(f"step {step}: observe -> {out['observe']}")
    print(f"        plan    -> {out['plan']}")
    if "final" in out:
        print(f"        answer  -> {out['final']}"); break
    act = out["action"]
    result = TOOLS[act["tool"]](**act["args"])                # step 2 of tool calling: execute
    print(f"        act     -> {act['tool']}({act['args']})  returned {result}")
    history.append({"role": "tool", "content": result})
else:
    print("stopped: loop budget exhausted")
PY
python3 react.py
```

**What you see:** the loop observes, plans, acts, **reads the tool result**, and stops when the goal is met, with a **step budget** as a safety net. A real agent replaces `fake_llm` with a model call; everything else is plumbing like this.

### Tool results: what a good tool returns

```run
cd ~/l7
cat > toolresults.py <<'PY'
import json

def find_teddy_bear_bad(found):
    if found: return {"name": "Teddy", "distance_miles": 1.0}
    return None                                    # model cannot tell "nothing found" from "tool broke"

def find_teddy_bear_good(found):
    if found: return {"status": "ok", "bears": [{"name": "Teddy", "distance_miles": 1.0}]}
    return {"status": "ok", "bears": []}           # an EMPTY, structured result means "searched, found none"

def set_thermostat_bad(target): pass               # no output: the model may claim success it cannot verify
def set_thermostat_good(target): return {"status": "ok", "new_target_f": target}

print("no bears, bad tool :", json.dumps(find_teddy_bear_bad(False)))
print("no bears, good tool:", json.dumps(find_teddy_bear_good(False)))
print("action tool, bad   :", json.dumps(set_thermostat_bad(72)))
print("action tool, good  :", json.dumps(set_thermostat_good(72)))
PY
python3 toolresults.py
```

## 7. Where agents fail (a checklist), and safety

Failure modes across the three steps (the next lecture's evaluation material goes deeper):

| Step | Failure | Likely fix |
|---|---|---|
| Predict | **tool not used** (the model answers or "punts") | the **tool router** missed it (it should be **recall-oriented**), or the model needs better SFT/prompting |
| Predict | **tool hallucination** (calls `find_bear`, which does not exist) | clearer **top-level instructions** ("use only the listed functions"), better names and descriptions, a stronger model |
| Predict | **wrong tool** | resolve **overlapping scopes** in the descriptions; router recall |
| Predict | **wrong arguments** (coordinates 0,0) | make context carry the location, add a location tool that fails with an **actionable error**, rewrite the API |
| Execute | tool **bug**, or an **error** that the model misreads as its own fault | fix the code; return **structured** errors |
| Execute | **no output** | always return something meaningful (an empty JSON list, not `None`) |
| Respond | the model **ignores or misreads** a long result | **trim** the output; return clean objects with named fields |

**Safety:** an agent can **act**, so threats are real: **data exfiltration** (an injected instruction makes a tool email out a secret), prompt injection, harmful actions. Defences: **training** (harmlessness data in SFT and RL), **inference-time safeguards** (a classifier that checks the conversation and outputs), least-privilege tools, human approval, and benchmarks such as Agent-SafetyBench. The lecture also notes a real incident where attackers used an agentic coding tool, to stress that **attackers and defenders both improve**.

**Reliability:** each step can go wrong, so the chance of a whole task succeeding **falls as steps grow**. **Start small and simple** (a single tool, a single clear task), **start smart** (use the most capable model first to learn the ceiling, then optimise for cost and latency), and **read the reasoning** when debugging. The lecture's advice on AI-assisted coding: it is excellent for plumbing, but **learn the fundamentals**, because **generating code is cheap; judging whether it is correct is the hard part**.

:::warn Common mistakes
- **Assuming RAG fixes bad retrieval**: if the right chunk is not retrieved, the model cannot use it.
- **Chunking blindly** (no overlap, no structure) or **embedding questions and documents the same way without checking**.
- **Using only semantic search** when exact identifiers matter (or only keywords when phrasing varies).
- **Returning `None` or errors from tools** where a structured result would let the model respond well.
- **Giving the agent every tool** at once.
- **Evaluating only the final answer**, not the tool-selection and argument steps.
- **No step budget or approval gates** on an agent that can act.
:::

## 8. Interview-style questions

- **"Why RAG instead of fine-tuning for fresh facts?"** Cheaper, updatable, auditable (you can show sources), and avoids regressions; fine-tuning is for behaviour and style.
- **"Explain two-stage retrieval."** A cheap bi-encoder with ANN for recall over millions of chunks, then a cross-encoder re-ranker on the top ~100 for precision.
- **"NDCG vs MRR?"** NDCG scores the whole ranking with a position discount normalised by the ideal; MRR only looks at the first relevant hit.
- **"How would you debug an agent that never calls the tool?"** Check the router recall, whether the tool is in the prompt, the description quality, and the model's training or prompt for tool use.

:::try
1. In `retrieve.py` add a query "stuffed animals" and compare BM25 with the concept ranking.
2. In `chunk.py` change `size` and `overlap` and view how a sentence gets split.
3. In `metrics.py` build a list where P@5 is the same but NDCG is lower than `good`.
4. In `react.py` make the room already warm (70) and check the loop ends without acting. Add a **second tool** and a router that picks tools by description.
:::

:::recap
- **RAG** = retrieve relevant chunks, **augment** the prompt, generate; retrieval quality dominates.
- Retrieval is **two-stage**: bi-encoder + ANN for recall, **cross-encoder re-ranker** for precision; combine **semantic and keyword** search; use **contextual chunks** and **prompt caching**.
- Measure with **precision/recall@K, MRR, NDCG**.
- **Tool calling**: predict the call, execute it, respond; learn by SFT or a well-written explanation; use a **tool router** when there are many tools; **MCP** standardises tool serving.
- **Agents** loop observe, plan, act (ReAct); verify with step budgets, structured tool results, safeguards, and start simple.
:::

:::quiz
? Why not paste a whole knowledge base into the prompt?
- It is illegal
+ Context is finite, irrelevant text hurts accuracy, and you pay per token
- Models cannot read long text
! RAG selects only the relevant parts.

? What does a cross-encoder do that a bi-encoder does not?
- Embeds documents offline
+ Reads the query and chunk together so they can interact, giving a more precise score on a small candidate set
- Searches faster
! It is the re-ranking stage.

? Which metric only cares about the first relevant result?
- NDCG
+ MRR
- Recall@K
! MRR = 1 / rank of the first hit.

? What should a search tool return when it finds nothing?
- None
+ A structured empty result, such as an empty list
- An exception message
! The model must be able to tell "found none" from "broke".

? What is the point of a tool router?
- To train the model
+ To show only the relevant tools in the prompt when there are too many
- To execute tools faster
! Fewer, more relevant tools reduce confusion and context use.
:::
