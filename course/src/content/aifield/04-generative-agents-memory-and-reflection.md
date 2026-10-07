---
track: aifield
title: Generative agents: a memory stream with retrieval and reflection
short: Generative agents
sub: How believable agents remember: the memory stream, the recency, importance and relevance score, and reflections that summarise experience.
---

:::goals
- describe the memory stream, retrieval, reflection and planning loop of generative agents
- compute a retrieval score from recency, importance and relevance and see why each term is needed
- trigger a reflection from accumulated importance
- connect the design to the memory episode of the PhiloAgents course
:::

:::note Where this lesson comes from
arxiv.org is blocked in this lab, so this lesson **summarises [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442) (Park et al., 2023) from my own knowledge**. Constants such as the decay factor are as I remember them; check the paper. The code is real and runs, with simple word-overlap standing in for the embeddings the paper uses.
:::

## 1. The setting

The paper placed **25 language-model agents** in a small simulated town ("Smallville"). Each agent had a short identity description and lived a day: waking, working, talking, planning. People who watched found the behaviour **believable**, and in one experiment news of a party spread through the town by conversation alone, with agents inviting each other and turning up.

The agents did not get this from the model alone. The paper's contribution is the **architecture around the model**:

| Component | What it does |
|---|---|
| **Memory stream** | a long list of natural-language records of everything the agent observes and does, each with a timestamp |
| **Retrieval** | picks the few memories relevant right now, because the whole stream will not fit in the context |
| **Reflection** | periodically summarises recent memories into higher-level insights, stored back in the stream |
| **Planning** | turns the agent's situation into a day plan, then finer actions, revised as events happen |

The paper's ablations (removing observation, planning or reflection) made behaviour worse, which is the argument that **memory design matters as much as the model**. This is the same problem you meet in any long-running agent: the model has no memory, so **your system decides what it remembers**.

## 2. Retrieval: three signals, one score

For a query ("what is the agent thinking about?") each memory gets a score:

```
score = recency + importance + relevance      (each scaled to 0..1, weights all 1 in the paper)
```

- **Recency**: exponential decay since the memory was last accessed (the paper uses a factor around 0.995 per game hour).
- **Importance**: the model rates how significant the memory is, 1 (mundane, like brushing teeth) to 10 (a breakup).
- **Relevance**: similarity between the memory and the query (the paper uses embedding cosine similarity).

Run it. The "embedding" here is word overlap, so it will **miss** a memory that is relevant in meaning but shares no words, which is precisely why the other two signals help:

```run
mkdir -p ~/lab/aifield && cd ~/lab/aifield
cat > memory.py <<'EOF'
import math, re

NOW = 48  # hours into the simulation
MEMORIES = [   # (description, created at hour, importance 1-10 as rated by the "model")
    ("SQL01 ran out of disk space during the nightly backup", 2, 8),
    ("Search index rebuild took 6 hours last Sunday", 10, 6),
    ("Alice said search results feel slow since Monday", 30, 5),
    ("The SQL01 backup job was moved to 02:00", 46, 4),
    ("The coffee machine on floor 2 was refilled", 47, 1),
    ("Team lunch is on Friday", 47, 2),
]
STOP = {"why", "is", "the", "a", "an", "of", "on", "to", "was", "since", "last", "during", "has", "feel", "did"}

def words(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP]

def relevance(query, text):
    q, t = set(words(query)), set(words(text))
    return len(q & t) / math.sqrt(len(q) * len(t)) if q and t else 0.0   # cosine of word sets

def normalise(values):
    lo, hi = min(values), max(values)
    return [0.0 if hi == lo else (v - lo) / (hi - lo) for v in values]

def retrieve(query, k=3, weights=(1, 1, 1)):
    rec = normalise([0.995 ** (NOW - created) for _, created, _ in MEMORIES])
    imp = normalise([i for _, _, i in MEMORIES])
    rel = normalise([relevance(query, d) for d, _, _ in MEMORIES])
    scored = []
    for (desc, created, _), r, i, v in zip(MEMORIES, rec, imp, rel):
        scored.append((weights[0] * r + weights[1] * i + weights[2] * v, r, i, v, desc))
    return sorted(scored, reverse=True)[:k]

query = "Why is search slow?"
print("query:", query)
print("combined score (recency, importance, relevance):")
for s, r, i, v, desc in retrieve(query):
    print(f"  {s:4.2f} ({r:.2f}, {i:.2f}, {v:.2f})  {desc}")

print("\nrelevance alone (like a plain keyword search):")
for s, r, i, v, desc in retrieve(query, weights=(0, 0, 1)):
    print(f"  {s:4.2f}  {desc}")
EOF
python3 memory.py
```

Read the two lists. Relevance alone returns the memories that **share words** with the question, and the cause (the full SQL01 disk) has **no word in common** with it, so it is missed. The combined score lifts it because it is **important** and its other signals add up. With real embeddings the cause would also score higher on relevance; the point stands that **no single signal is enough**.

## 3. Reflection: turning events into insight

A pile of observations does not give the agent understanding. The paper triggers a **reflection** when the **sum of importance** of recent memories passes a threshold (about 150 in the paper). The model is asked first "what are the most salient questions I can answer about these memories?", then to write **insights** that cite the evidence. The insights are stored back in the stream, where they can be retrieved like any other memory (and can be reflected on again, building a tree of abstraction).

```run
cd ~/lab/aifield
cat >> memory.py <<'EOF'

# ---- reflection trigger ----------------------------------------------------------------
THRESHOLD = 20          # the paper uses a much larger number; ours is small because the stream is small
since_last_reflection = sum(imp for _, _, imp in MEMORIES)
print(f"\nimportance accumulated since the last reflection: {since_last_reflection} (threshold {THRESHOLD})")
if since_last_reflection > THRESHOLD:
    insight = "Search slowness started after the SQL01 disk filled, and the backup was then moved to 02:00."
    MEMORIES.append((insight, NOW, 9))
    print("REFLECTION stored (importance 9):", insight)
    print("evidence cited: memories 1, 3 and 4")
EOF
python3 memory.py | tail -6
```

Why this matters in practice: an incident assistant that stores only raw log lines will drown. One that stores **raw events and periodic summaries** ("search slowed after SQL01 filled") can answer "what happened this week?" cheaply. The cost: **summaries can be wrong**, so store the **evidence references** with each insight and allow it to be corrected.

## 4. Connect it to the PhiloAgents course

The PhiloAgents videos in your transcript folder (episode 3, agent memory) build the same idea on a smaller scale: **short-term memory** (the conversation in the graph state) and **long-term memory** (a vector store the agent searches for facts about its philosopher). The generative-agents paper adds the three-part scoring, reflection and planning on top. When you design memory, ask:

1. What do I **write** to memory, and when?
2. How do I **select** from it (recency, importance, similarity)?
3. How do I **compress** it (reflection, summaries, forgetting)?
4. How do I **audit** it (evidence links, timestamps, deletion)?

:::warn Common mistakes
- **Retrieving by similarity only.** You get old, unimportant but wordy matches. Combine signals, and consider recency and importance.
- **Storing everything verbatim forever.** Costs grow and retrieval quality falls; summarise and forget deliberately.
- **Letting the model rate importance without checking.** Spot-check the ratings; they drift.
- **Untraceable insights.** A reflection with no evidence links cannot be corrected.
- **Personal data in memory with no deletion path.** Plan retention and deletion from the start.
:::

:::recap
- Believable long-running agents need an architecture around the model: **memory stream, retrieval, reflection, planning**.
- Retrieval score = **recency + importance + relevance**, each normalised; no single signal is enough.
- **Reflection** summarises accumulated experience when enough important events have happened, and stores the insight back as a memory.
- Memory design is your job: what to write, select, compress and audit.
:::

:::try Your turn
Add three more memories about a different problem (for example "certificate on EV01 expires in 12 days"). Query "what should I renew soon?" and print the top 3. Then change the weights to `(0, 0, 1)` and `(1, 0, 0)` and explain how the result changes.
:::

:::quiz
? Why does the retrieval score use more than similarity?
+ Similarity alone misses important or recent memories that share few words with the query
- Similarity is too slow
- Embeddings do not exist
- Because the paper forbade it
! Each signal covers a weakness of the others.
? What triggers a reflection in the generative agents design?
+ The accumulated importance of recent memories passing a threshold
- A fixed number of tokens
- A user request only
- The end of the day
! Important events accumulate until the agent steps back and summarises.
? Why store evidence links with a reflection?
+ So a wrong insight can be traced and corrected
- To make it longer
- To avoid timestamps
- Because the model requires it
! Reflections are model-written summaries and can be wrong.
:::
