---
track: aifield
title: Retrieval-augmented generation: naive, advanced and modular RAG
short: RAG survey
sub: The map from the RAG survey paper, a runnable pipeline with query rewriting and reranking, and a three-part evaluation that catches hallucinations.
---

:::goals
- name the three RAG paradigms (naive, advanced, modular) and what each adds
- run a small retrieve, rerank and answer pipeline and see where naive retrieval fails
- apply a query rewrite and a rerank step and measure the difference
- evaluate a RAG answer on context relevance, groundedness and answer relevance
:::

:::note Where this lesson comes from
arxiv.org is blocked in this lab, so this lesson **summarises the survey [Retrieval-Augmented Generation for Large Language Models: A Survey](https://arxiv.org/abs/2312.10997) (Gao et al., 2023) from my own knowledge**, along with the evaluation ideas in the DeepLearning.AI "Building and Evaluating Advanced RAG" short course (also not fetchable here). Check the originals for exact terms. The code is real and runs; keyword scoring stands in for embeddings so there is no model or API key.
:::

## 1. What RAG is for

A model knows only what was in its training data and what you put in its **context**. For private, recent or changing information (your EV configuration, today's tickets), you **retrieve** the relevant text first and put it in the prompt. That reduces invented answers and lets you cite sources. The survey organises the field into three stages of sophistication:

| Paradigm | Pipeline | Typical weakness |
|---|---|---|
| **Naive RAG** | index documents, retrieve top-k chunks for the question, generate | poor retrieval (wrong or missing chunks), noisy context, answers that ignore the context |
| **Advanced RAG** | adds **pre-retrieval** work (query rewriting, better chunking, metadata) and **post-retrieval** work (reranking, compressing, ordering) | more steps to tune and evaluate |
| **Modular RAG** | breaks the system into swappable modules (search, memory, routing, fusion, prediction) and flows, including loops where the model decides to retrieve again | complexity; needs strong evaluation to be worth it |

The survey also discusses **what** you retrieve (chunk, sentence, document, knowledge-graph triples), **when** you augment (pre-training, fine-tuning, or only at inference, which is by far the most common), and how to **evaluate** (below). The agentic version, where an agent decides when and what to retrieve, is **agentic RAG** and is covered in the Microsoft AI Agents course and the "RAG and tools in depth" lesson.

## 2. A tiny corpus and a naive pipeline

```run
mkdir -p ~/lab/aifield && cd ~/lab/aifield
cat > rag.py <<'EOF'
import math, re, collections

DOCS = {
    "runbook-search": "If EV search is slow, first check the SQL01 disk space and the index rebuild schedule. A full disk on SQL01 slows every query.",
    "runbook-backup": "The nightly backup runs at 02:00 and needs 40 GB free on SQL01. Backups that fail leave the transaction log growing.",
    "hr-policy":      "Staff may work from home two days a week. Request leave through the HR portal at least a week ahead.",
    "faq-certs":      "Certificates expire after a year. Renew them 30 days before expiry and restart the EV services afterwards.",
    "faq-indexing":   "Indexing stops when the SQL connection times out. Restart the indexing service after the SQL connection is restored.",
}
STOP = set("the a an of to is if at on in and for or after before first then every any all it be are".split())

def words(t):
    return [w for w in re.findall(r"[a-z0-9]+", t.lower()) if w not in STOP]

def tfidf_rank(query, docs):
    n = len(docs)
    df = collections.Counter(w for t in docs.values() for w in set(words(t)))
    scores = {}
    for name, text in docs.items():
        tf = collections.Counter(words(text))
        scores[name] = sum(tf[w] * math.log(1 + n / df[w]) for w in set(words(query)) if w in tf)
    return sorted(scores.items(), key=lambda kv: -kv[1])

if __name__ == "__main__":
    for q in ["why is EV search slow", "database cannot be reached overnight"]:
        print(f"\nQUESTION: {q}")
        for name, s in tfidf_rank(q, DOCS)[:3]:
            print(f"  {s:5.2f}  {name}")
EOF
python3 rag.py
```

The first question works: the search runbook ranks first because the words match. The second question is about a **database that cannot be reached**, and the helpful document ("Indexing stops when the SQL connection times out") uses **different words** (SQL, connection, times out). Every score is **0.00**: keyword retrieval cannot see that the two mean the same thing. Embeddings help with synonyms, but you can also **fix the query**.

## 3. Pre-retrieval: rewrite the query

Advanced RAG improves the question before searching. A model can rewrite "database unreachable" into the terms your documents use, or produce several variants and merge the results. Here a small stand-in maps user phrasing to document vocabulary:

```run
cd ~/lab/aifield
cat > rewrite.py <<'EOF'
from rag import DOCS, tfidf_rank

SYNONYMS = {"database": ["sql", "connection"], "cannot": ["times", "out"], "reached": ["connection"], "db": ["sql"]}

def rewrite(q):
    """Stand-in for a model that expands the question with the vocabulary of the documents."""
    extra = [s for w in q.lower().split() for s in SYNONYMS.get(w, [])]
    return q + " " + " ".join(extra)

if __name__ == "__main__":
    q = "database cannot be reached overnight"
    print("naive    :", [(n, round(s, 2)) for n, s in tfidf_rank(q, DOCS)[:2]])
    print("rewritten:", [(n, round(s, 2)) for n, s in tfidf_rank(rewrite(q), DOCS)[:2]])
    print("rewritten query:", rewrite(q))
EOF
python3 rewrite.py
```

The rewrite moves the right document to the top. Other pre-retrieval tools: **better chunking** (split on headings, keep overlap), **metadata filters** (product, date, language) and **hypothetical document** tricks, where the model writes a fake answer and you search with it.

## 4. Post-retrieval: rerank and trim

Retrieve **more** than you need (say 20), then **rerank** with a stronger but slower method (a cross-encoder or a model) and keep the best few. Also **compress**: drop sentences that do not help, and order chunks sensibly (models often use the start and end of a long context better than the middle). Rerank here by how many of the question's key terms appear **in the same sentence**:

```run
cd ~/lab/aifield
cat > rerank.py <<'EOF'
import re
from rag import DOCS, tfidf_rank, words
from rewrite import rewrite

def best_sentence(query, text):
    sents = re.split(r"(?<=[.!?])\s+", text)
    q = set(words(query))
    return max(sents, key=lambda s: len(q & set(words(s))))

def rerank(query, ranked, docs):
    scored = []
    for name, base in ranked:
        sent = best_sentence(query, docs[name])
        scored.append((len(set(words(query)) & set(words(sent))) + 0.01 * base, name, sent))
    return sorted(scored, reverse=True)

q = rewrite("database cannot be reached overnight")
first_pass = tfidf_rank(q, DOCS)[:4]
for score, name, sent in rerank(q, first_pass, DOCS)[:2]:
    print(f"{score:5.2f} {name}: {sent}")
EOF
python3 rerank.py
```

Only the sentence that actually answers the question goes into the prompt. Less noise, fewer tokens, better answers.

## 5. Evaluating RAG: three questions

A RAG answer can fail in three separate ways, so evaluate **each**:

| Check | Question | Catches |
|---|---|---|
| **Context relevance** | Is the retrieved text relevant to the question? | bad retrieval |
| **Groundedness** (faithfulness) | Is every claim in the answer supported by the retrieved text? | **hallucination** |
| **Answer relevance** | Does the answer address the question? | evasive or off-topic answers |

In production these are scored by a model acting as a judge, plus a human-labelled test set. A crude lexical version shows how the checks separate failures:

```run
cd ~/lab/aifield
cat > evaluate.py <<'EOF'
import re
from rag import words

def overlap(a, b):
    a, b = set(words(a)), set(words(b))
    return len(a & b) / len(a) if a else 0.0

def triad(question, context, answer):
    return {
        "context relevance": overlap(question, context),
        "groundedness":      overlap(answer, context),     # share of answer terms found in the context
        "answer relevance":  overlap(question, answer),
    }

question = "How much free space does the nightly backup need on SQL01?"
context = "The nightly backup runs at 02:00 and needs 40 GB free on SQL01."
good = "The nightly backup needs 40 GB free on SQL01."
hallucinated = "The nightly backup needs 200 GB and a dedicated tape robot on SQL01."

for label, answer in [("grounded answer", good), ("hallucinated answer", hallucinated)]:
    print(label)
    for k, v in triad(question, context, answer).items():
        print(f"   {k:18} {v:.2f}")
EOF
python3 evaluate.py
```

The hallucinated answer **still looks on-topic** (answer relevance only slips from 0.44 to 0.33) but its groundedness falls from 1.00 to 0.56, because "200 GB", "tape" and "robot" appear nowhere in the context. That is the failure you most need to catch, and the one a single "does it look right?" review misses.

:::warn Common mistakes
- **Judging RAG by the final answer only.** You cannot tell whether retrieval or generation failed. Score each stage.
- **Chunking blindly.** Chunks that cut a procedure in half retrieve fine and answer badly. Split on meaning (headings, paragraphs) with a little overlap.
- **Retrieving too much.** Ten loosely relevant chunks distract the model. Retrieve wide, then rerank and trim.
- **Ignoring freshness and permissions.** Old documents answer confidently; users must only see what they are **allowed** to see, so filter by access rights **before** the model sees text.
- **No "I don't know" path.** If nothing relevant was retrieved, say so rather than letting the model guess.
:::

:::recap
- RAG feeds retrieved text to the model so answers use your data. The survey's three stages: **naive, advanced, modular**.
- Advanced RAG improves **before** retrieval (rewrite, chunk, filter) and **after** (rerank, compress, order).
- Evaluate **context relevance, groundedness and answer relevance** separately.
- Enforce permissions during retrieval, and always give the model a way to say "not found".
:::

:::try Your turn
Add a sixth document to `rag.py` about restarting the EV services, then ask "how do I bring EV back after a reboot?". Does the naive ranking find it? If not, add the missing words to `SYNONYMS` and show the improvement, then run the groundedness check on an answer you write yourself.
:::

:::quiz
? Which RAG stage does query rewriting belong to?
+ Pre-retrieval in advanced RAG
- Post-retrieval only
- Pre-training
- Generation
! It improves the search before it is run.
? What does a low groundedness score indicate?
+ The answer contains claims not supported by the retrieved context
- The retrieval returned too many chunks
- The question was unclear
- The index is too small
! It is the signal for hallucination.
? Why retrieve more chunks than you finally use?
+ So a reranker can pick the best few and discard noise
- To fill the context window
- Because retrieval is free
- To avoid evaluation
! Wide retrieval plus precise reranking beats a narrow first pass.
:::
