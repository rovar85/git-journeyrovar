---
track: aideep
title: "Deep dive 23: Vectorless RAG: navigate the document like a reader"
short: Vectorless RAG
sub: Instead of chunks and embeddings, keep a document as a tree of sections and let a model read the table of contents, pick a branch and follow cross-references.
---

:::goals
- explain what chunk-and-embed RAG gets wrong on long, structured documents
- describe tree-index ("vectorless", reasoning-based) retrieval and how a model navigates it
- run both on the same handbook and read where each one fails
- decide when to use vectors, a tree, or both
:::

:::note Where this fits
Classic RAG, chunking, BM25, embeddings and re-ranking are in [Deep dive 6](#aideep-6) and [Deep dive 16](#aideep-16); measuring it is in [Deep dive 20](#aideep-20). This lesson is an alternative for documents that have real structure: reports, manuals, contracts, policies. Open-source projects such as PageIndex popularised the name.
:::

## 1. Where chunks hurt

Chunk-and-embed RAG cuts a document into pieces of a fixed size, turns each piece into a vector and returns the pieces closest to the question. It works well for many short, independent facts. On long structured documents it has three habits that hurt:

- **A cut in the middle of a fact.** "The notice period is 60 days. During probation" ends one chunk; "it is 15 days" starts the next. The top chunk now says the opposite of the full rule.
- **Similar is not relevant.** A question about "days of notice" is close in meaning to every paragraph that counts days.
- **Cross-references are lost.** "The rules in 4.2 apply" means nothing if section 4.2 is in a different chunk that the question does not resemble.

## 2. The tree-index idea

A person with a 300-page report does not read random paragraphs. They open the **table of contents**, pick a chapter, then a section, read it whole, and turn to "see section 4.2" when told to. Tree-index retrieval does the same:

1. **Build once:** parse the document into a tree of sections (title, a short summary, page range, children). The tree is small enough to show a model in full.
2. **Navigate per question:** show the model the tree (or one level of it) and ask which branch holds the answer. Descend, repeat, then read the chosen section **whole**.
3. **Follow references** found in what was read, and stop when the model says it has enough.

No embeddings and no vector database. The cost moves to **model calls at question time**: each step is a reasoning call.

## 3. Both methods on one handbook

The navigator below scores section titles and summaries with simple word overlap, standing in for the model that reads the contents in a real system. The point is the shape of the result, not the scorer.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > tree_rag.py <<'EOF'
# Vectorless RAG in miniature: a document kept as a tree of sections, and a navigator that
# reads summaries and walks down, instead of cutting text into chunks and comparing vectors.
import math, re
from collections import Counter

DOC = {"id": "0", "title": "Staff handbook", "summary": "rules for working here", "kids": [
  {"id": "3", "title": "Leave", "summary": "kinds of leave, days allowed, how to request it", "kids": [
    {"id": "3.1", "title": "Annual leave", "text": "Staff get 24 days of annual leave a year. Up to 5 unused days carry over to the next year."},
    {"id": "3.2", "title": "Sick leave", "text": "Sick leave is 12 days a year. More than 2 days in a row needs a doctor's note."},
    {"id": "3.3", "title": "Parental leave", "text": "Parents get 26 weeks of paid parental leave, which can start up to 8 weeks before the due date."}]},
  {"id": "4", "title": "Leaving the company", "summary": "resignation, notice period, final settlement", "kids": [
    {"id": "4.1", "title": "Probation", "text": "The first six months are probation. If you resign during probation, the notice rules in 4.2 apply with the shorter period."},
    {"id": "4.2", "title": "Notice period", "text": "The notice period is 60 days. During probation it is 15 days. It can be bought out by paying basic salary for the days not served."},
    {"id": "4.3", "title": "Final settlement", "text": "Final pay, including leave encashment, is paid within 45 days of the last working day."}]},
]}

def words(t): return re.findall(r"[a-z0-9]+", t.lower())
STOP = set("a an the of to in is are i if my do how many much what for it can be and or by with during".split())
def vec(t): return Counter(w[:5] for w in words(t) if w not in STOP)   # w[:5]: a crude stem, so resign ~ resignation
def cos(a, b):
    dot = sum(a[k] * b[k] for k in a)
    return dot / (math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values())) or 1)

def leaves(n): return [n] if "text" in n else [x for k in n["kids"] for x in leaves(k)]
def find(n, i): return n if n["id"] == i else next((f for k in n.get("kids", []) for f in [find(k, i)] if f), None)

def chunk_rag(q, size=8):
    chunks = []
    for leaf in leaves(DOC):
        w = leaf["text"].split()
        chunks += [" ".join(w[i:i + size]) for i in range(0, len(w), size)]
    best = max(chunks, key=lambda c: cos(vec(q), vec(c)))
    return best

def tree_rag(q):
    node, path = DOC, []
    while "kids" in node:                         # read the table of contents, pick a branch
        node = max(node["kids"], key=lambda k: cos(vec(q), vec(k["title"] + " " + k.get("summary", k.get("text", "")))))
        path.append(node["id"] + " " + node["title"])
    read = [node]
    for ref in re.findall(r"\b(\d\.\d)\b", node["text"]):   # follow cross-references, like a person would
        read.append(find(DOC, ref)); path.append("follow ref -> " + ref)
    return path, " ".join(n["text"] for n in read)

for q in ["How many days of notice if I resign during probation?", "How long is parental leave?", "What rules apply if I resign in the first six months?"]:
    print("Q:", q)
    print("  chunks top-1:", chunk_rag(q))
    path, ctx = tree_rag(q)
    print("  tree path   :", " > ".join(path))
    print("  tree context:", ctx)
EOF
python3 tree_rag.py
```

- **Question 1:** the top chunk is cut after "During probation", so an answer built on it would say 60 days. The tree returned the whole notice section, which contains the 15-day rule.
- **Question 2:** a simple fact in one place. Both methods work; vectors are cheaper here.
- **Question 3:** the probation section says "the notice rules in 4.2 apply". The navigator followed that reference and returned both sections. Chunk retrieval found the first sentence and stopped.

## 4. What it looks like with a real model (not run here)

The navigation step is one prompt per level. A sketch, with any chat model:

```term
toc = render(tree, depth=1)          # "3 Leave: kinds of leave...\n4 Leaving the company: resignation..."
prompt = f"""Here is the table of contents of a document.
Question: {question}
Reply with JSON: {{"node_id": "...", "reason": "..."}} for the section most likely to hold the answer,
or {{"done": true}} if the text you have already read answers it."""
step = json.loads(model.invoke(prompt + toc).content)
```

## 5. Choosing

| | Chunks and vectors | Tree navigation |
| --- | --- | --- |
| Best for | many short, independent facts; FAQs; chat logs; search over thousands of files | long structured documents: annual reports, manuals, contracts, regulations |
| Cost at question time | one embedding and one search (cheap, fast) | several model calls (slower, costs more) |
| Build cost | embed every chunk | parse structure and write a summary per node |
| Explains itself | similarity scores | a readable path: "4 > 4.1 > follow 4.2" |
| Weak at | split facts, cross-references | huge collections without structure; many documents at once |

A common middle path: use vectors or BM25 to pick the **document**, then navigate its tree to pick the **section**.

## Common misconceptions

- "Vectorless means no model." It means no embeddings; it uses **more** model calls, each a reasoning step.
- "It replaces vector RAG." It is a better fit for one kind of document. For thousands of short notes, vectors win on cost and speed.
- "Bigger chunks fix splitting." They reduce cuts but add noise and cost, and still miss references in other chunks.

## Practice (answers below)

1. Add a question to `tree_rag.py` that needs section 4.3, and check the path it takes.
2. A 500-page contract and 20,000 support tickets: which method for each, and why?
3. How would you evaluate the navigator? Name one metric from [Deep dive 20](#aideep-20) that still applies.

:::recap
- Chunk RAG can **cut a fact in half**, rank by **similarity instead of relevance**, and **lose cross-references**.
- **Tree-index (vectorless) RAG** keeps the document's structure, lets a model read the contents, descend, read whole sections and follow references.
- It trades **cheap search** for **several reasoning calls**; use it for long structured documents, vectors for many short ones, or both together.
:::

:::note Answers
1. For example "When is my final pay paid?" should go 4 Leaving the company > 4.3 Final settlement. 2. Contract: tree navigation, because it is long, structured and full of cross-references. Tickets: vectors or BM25, because they are many short independent texts with no shared structure. 3. Context recall (did the sections read contain the evidence?) and faithfulness of the answer still apply; you can also check the path against the section a person would pick.
:::

```quiz
? What does "vectorless" RAG avoid?
+ Embeddings and a vector database
- Using a language model
- Reading the document
- Answering questions
! It still uses a model, to navigate the table of contents.

? Why can a fixed-size chunk give a wrong answer?
+ It can end in the middle of a rule, leaving out the part that changes the meaning
- Chunks are always too short to read
- Embeddings cannot store numbers
- Vectors forget the question
! The 60-day chunk lost the "during probation it is 15 days" part.

? When is chunk-and-embed the better choice?
+ Searching thousands of short, independent texts quickly and cheaply
- A single long contract with cross-references
- An annual report with chapters
- A manual with numbered sections
! Many short items have no useful tree, and one vector search is far cheaper than several reasoning calls.
```
