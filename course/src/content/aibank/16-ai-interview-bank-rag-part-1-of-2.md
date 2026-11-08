---
track: aibank
title: "AI interview bank: RAG (part 1 of 2)"
short: RAG 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Retrieval or fine-tuning for the policy wiki

*Level 1 (screening) · concept · about 6 minutes*

A product team wants an assistant that answers questions about the internal policy wiki. One engineer proposes to tune the model on the wiki pages. Another proposes to search the pages at question time and paste the matches into the prompt. Which do you pick, and in which case would you still tune the model?

:::answer Show the answer
:::say Short answer
Pick retrieval for knowledge. The model never changes, the document store updates in minutes, and you can show the passages behind each answer. Tuning fits when you need a style, a tone or a reasoning pattern that a prompt cannot reach, not when you need facts.
:::

**Full answer**

**Why retrieval wins on facts**

The lesson lines the two up on five concerns:

| Concern | Tuned model | Retrieval |
|---|---|---|
| Cost | a training run costs from $1,000 to more than $100,000 | a query costs $0.01 to $0.10 for the embedding and the model call |
| Freshness | stale until the next training run | re-index the changed page and the next query sees it |
| Audit | no way to trace a fact to a page | the retrieved passages are visible and can be returned |
| Grounding | the model still invents facts freely | the prompt tells the model to answer only from the passages |
| Privacy | the pages are baked into the weights | the pages stay in your own store |

Tuning changes the weights for good. Retrieval changes the context for one request. For facts, a temporary context is what you want.

**The one case for tuning**

When the goal is how the model writes or reasons, and prompting does not get there, tuning is the right tool. A fixed voice, a house format or a reasoning habit lives in the weights better than in a long instruction.

**The shape of the system**

Retrieval runs in two phases. The index phase chunks each page, embeds each chunk and stores the vectors with the text. The query phase embeds the question, finds the top k chunks, builds a prompt from them and calls the model. The lesson budgets k at 5 to 10 chunks and 2,500 to 5,000 tokens of retrieved text per query.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** A policy page changes. What happens in each approach? Expected: with retrieval you re-index that page and the next answer uses the new text; with a tuned model the old fact stays until you train again.
- **Level 2:** A legal reviewer asks which page an answer came from. Which approach can show it? Expected: retrieval, because the passages that went into the prompt are known and can be returned with the answer.
- **Level 2:** Why is the privacy story different? Expected: with retrieval the pages stay in your store and only the matched chunks go to the model for one call; with tuning the content is inside the weights of the model you deploy.
- **Level 3:** The answer is wrong even though the right passage is in the store. Which stage do you check first? Expected: retrieval, with recall at k, because the model cannot use a passage that the search did not return.

**Wrong answers, and why they fail**

- "Tune the model, because then it knows the documents." The weights hold a copy that goes stale, and nothing in the output says which page a fact came from.
- "Retrieval is always better." A fixed style, a tone or a reasoning pattern is learned better by tuning than by a prompt.
- "Skip the search and put the whole wiki in the prompt." The lesson budgets 2,500 to 5,000 tokens of retrieved text per query; a whole wiki does not fit, and unrelated text dilutes the prompt.

**Related lesson in this course:** [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7)

:::

## The first metric to read after a wrong answer

*Level 1 (screening) · concept · about 6 minutes*

A user reports that the document assistant gave a wrong answer. The pipeline has a chunker, a retriever, a reranker and a generator. You get one metric to look at before anything else. Which one, and why that one?

:::answer Show the answer
:::say Short answer
Recall at k on the retrieval stage. If the gold chunk is not in the top k, no reranker can bring it back and the generator usually lacks the evidence for the right answer, unless another chunk happens to hold it, so the later metrics are hard to read. Recall comes first in the order, but it is not a gate: when recall holds, or when another retrieved chunk holds the evidence, move on to the rank position and then to the generated text, because a failure there stays hidden otherwise.
:::

**Full answer**

**The two retrieval metrics**

Precision at k asks what share of the top k is gold. If the gold set has three documents and the top 3 returns two of them plus one wrong one, precision at 3 is 2 / 3. Recall at k asks what share of the gold set is in the top k. If the top 5 holds all three gold documents, recall at 5 is 1.0.

Production teams quote recall. The generator can ignore an extra chunk with ease. It cannot invent an answer from a chunk it never saw.

**The order of the checks**

| Symptom | Likely cause | What to fix |
|---|---|---|
| Low recall and low precision | the chunker cut the answer or the retriever cannot find it | chunk boundaries or the retrieval modality |
| Decent recall, low MRR | the right chunk is in the top k but not at position 1 | the reranker |
| High MRR, low faithfulness | the generator invents content despite the right context | the generation prompt, cite or refuse |
| High faithfulness, low relevance | the answer is grounded but off topic | the query rewriter or the prompt |
| All four high, users still complain | the eval set does not represent real queries | add real user queries to the qrels |

**Keep the eval cheap**

Tier the qrels: a smoke set of 20 queries that runs in CI, a regression set of 200 that runs nightly, and a deep set of 2000 that runs weekly. Treat a recall regression like a failing test.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** What does precision at k add once recall is fine? Expected: it shows how much of the returned list is noise, which matters when a wrong chunk poisons the answer or wastes tokens.
- **Level 2:** Recall at 5 is fine but the gold chunk sits at rank 4 or 5. Which metric shows that, and which stage do you fix? Expected: MRR, and the reranker.
- **Level 3:** Recall averages 90 percent and one team still complains every day. What is hidden? Expected: one query class that always misses; slice the qrels by class, such as literal, paraphrased and multi-topic, and report each slice.
- **Level 3:** How do you keep the eval fast enough to run on every change? Expected: tiers, with a smoke set of 20 queries in CI, 200 nightly and 2000 weekly.

**Wrong answers, and why they fail**

- "Read the answer and judge it." The answer alone cannot tell which of the four stages failed.
- "Precision at k, because the noise caused the wrong answer." Precision matters once the right chunk is present; a missing chunk is the first thing to rule out.
- "Faithfulness, because the model hallucinated." A faithful answer to the wrong chunks is still wrong; faithfulness only grades the generator against what it saw.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Count the work of a reranker over the whole index

*Level 2 (working) · estimate · about 8 minutes*

A proposal replaces the vector retriever with a cross-encoder that scores every chunk in a 10 million chunk index, so that nothing is ever missed. Estimate the work for one question, and say what you propose instead.

:::answer Show the answer
:::say Short answer
One forward pass per chunk means 10 million forward passes for one question, which no request budget allows. Keep a bi-encoder for the first stage, because its document vectors are computed once at index time, and run the cross-encoder on a pool of 50 to 200 candidates. The advanced RAG lesson puts the per-pair cost at 100 to 1000 times a bi-encoder comparison.
:::

**Full answer**

**The count**

| Stage | Work at index time | Work per query |
|---|---|---|
| Bi-encoder | one embedding per chunk, stored | one embedding of the query, then one vector comparison per chunk |
| Cross-encoder | nothing can be stored, the score depends on the query | one forward pass per pair, so one per chunk in the pool |

With the cross-encoder over the whole index, the pool is the index. An index of 10 million chunks means 10 million passes for one question.

**The staged shape**

Retrieve a larger candidate set with the cheap stage, for example the top 50 from hybrid search, and rerank with the cross-encoder to the final top 5. The expensive model runs 50 times instead of 10 million, and its lift lands where it matters, in the final order.

**Two more numbers to plan**

- A production cross-encoder of about 22M parameters takes 88 MB at float32. Load it once and keep it resident.
- Run the N candidates as one batch. Scored one at a time, the latency multiplies by N.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which part of the bi-encoder cost is paid once? Expected: the document embeddings, at index time; a query pays for one embedding and the comparisons.
- **Level 2:** Why does the expensive model pay for itself on the top 50? Expected: 50 passes fit a request budget and the lift is concentrated in the final order of the candidates.
- **Level 3:** The index doubles in size. Which stage grows in cost per query? Expected: the first stage, because it compares against every chunk; the reranker stays at N passes while N is fixed.
- **Level 3:** At this scale the first stage itself is not a brute-force scan. What does it use, and what does that cost? Expected: an approximate nearest neighbor index, which trades a little recall for speed; the advanced RAG lesson notes that at 2 million chunks the error can push a relevant chunk out of the top k.

**Wrong answers, and why they fail**

- "Score everything, GPUs are fast." 10 million passes per question is not a latency a user waits for, and the lesson's model takes 88 MB before any batch.
- "Precompute the cross-encoder score for every chunk." The score depends on the query, so there is nothing to precompute.
- "Use a smaller cross-encoder over the whole corpus." Smaller rerankers lose quality faster than they save latency, and the pass count stays the same.

**Related lesson in this course:** [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7)

:::

## Faithfulness and answer relevance grade different things

*Level 2 (working) · concept · about 7 minutes*

Two answer-grade metrics sit in your RAG eval report: faithfulness and answer relevance. A teammate says they measure the same thing and wants to drop one. Explain what each one grades, and give one answer that scores high on one and low on the other.

:::answer Show the answer
:::say Short answer
Faithfulness asks whether each claim in the answer is supported by the retrieved context. Answer relevance asks whether the answer addresses the question. A grounded summary of the retrieved chunks that never gets to the question scores high on faithfulness and low on relevance, and a short direct answer from the model's own memory scores high on relevance and low on faithfulness.
:::

**Full answer**

**How each one is computed**

| Metric | Input to the judge | Output |
|---|---|---|
| Faithfulness | one claim from the answer, plus the retrieved context | yes or no, aggregated to the fraction of claims that pass |
| Answer relevance | the question, plus the answer | does the answer address the question |

The eval splits the answer into sentence-shaped claims first. Faithfulness is also called groundedness, support or attribution. In its production form, the question answering lesson describes it as entailment between claim and context, and relevance as generating hypothetical questions from the answer and comparing them with the real one.

**Why both stay**

Each one catches a failure the other cannot see:

- Faithfulness catches an invented fact, because the fact has no support in the context.
- Relevance catches an answer that wandered, because the judge never sees the context and only asks whether the question was answered.

The diagnosis table in the eval lesson uses the pair. High MRR with low faithfulness points at the generation prompt. High faithfulness with low relevance points at the query rewriter or the prompt.

**No gold answer needed**

Both are judged against the context and the question, not against a reference answer. That lets you score live traffic without labels, next to context precision and context recall for the retrieval side.

**The offline stand-in**

The lesson ships a deterministic judge based on token overlap above a threshold, so the eval runs with no network call. It cannot read meaning, so production swaps it for a model judge from a different family than the generator.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Which of the two catches a hallucination? Expected: faithfulness, because an invented fact has no support in the retrieved context.
- **Level 2:** Low relevance with high faithfulness points at which stage? Expected: the query rewriter or the generation prompt; the context was about something else, or the answer drifted from the question.
- **Level 3:** Why does neither metric need a reference answer? Expected: both are judged against the context and the question, which is what makes them usable on live traffic.
- **Level 3:** What is the limit of the lesson's offline judge? Expected: it counts token overlap above a threshold, so it cannot read meaning; production uses a model judge, from a different family than the generator.

**Wrong answers, and why they fail**

- "They are the same, a faithful answer is relevant." A faithful answer can summarize the context and ignore the question.
- "Relevance is enough when retrieval is good." Relevance never sees the context, so an answer from the model's own memory can be relevant and ungrounded.
- "Faithfulness needs a gold answer." It is judged against the retrieved context, which is why it works on live traffic.

**Related lesson in this course:** [Deep dive 20: RAG evaluation and guardrails in practice](#aideep-20)

:::

## Filter on metadata ahead of the vector search

*Level 2 (working) · design · about 8 minutes*

A question asks what changed in the security policy last month. Your vector search returns a two-year-old security document because it is semantically close. Design the retrieval step so that this cannot happen, and say what else the same mechanism buys you in a regulated deployment.

:::answer Show the answer
:::say Short answer
Store metadata with each chunk, such as the source, the creation date, the category, the author and the version, and filter on it before the similarity search runs. For this question the filter is the security category and the last 30 days, so the old document is never a candidate. Under regulation the same pre-filter carries role labels and jurisdiction tags, so a user only retrieves chunks they are allowed to see.
:::

**Full answer**

**Pre-filter, not post-filter**

A filter after the top k comes back can leave nothing: if every slot in the top k went to old documents, the right one never had a chance. A filter applied ahead of the search shrinks the space the similarity search runs over, which the advanced RAG lesson calls critical for performance at scale, and an excluded document cannot fill a slot. Vector stores support this as metadata pre-filtering.

**What to store**

| Field | Used for |
|---|---|
| Source document | citations and per-document de-duplication |
| Creation date and version | time windows and stale-document control |
| Category | scope, such as security or billing |
| Author | provenance |
| Role label | who may see the chunk |
| Jurisdiction tag | which regulatory scope the chunk belongs to |

**The regulated pipeline**

The production capstone orders the query side as: filter by role and jurisdiction first, then parallel dense and BM25 retrieval, then rank fusion, then the top 20 to the reranker, then the top 5 to the generator. The labels are produced at ingestion, next to the chunk summaries, so nothing downstream has to guess them.

**Prove it**

Access control that is not tested is a hope. The capstone runs a pre-release red team with cross-jurisdiction leak probes, and its exercise builds a second corpus slice under another jurisdiction and runs a 20-question cross-jurisdiction probe, scored pass or fail.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why filter before the search and not after? Expected: the search space shrinks, which helps at scale, and an excluded document can never take a slot in the top k.
- **Level 2:** Which fields do you store with each chunk? Expected: source, date, category, author and version, plus role and jurisdiction labels in a regulated setting.
- **Level 3:** How do you test that the role filter holds? Expected: a probe set of cross-jurisdiction questions, which the capstone runs as a 20-question check scored pass or fail.
- **Level 3:** Where does the filter sit relative to the reranker and the generator? Expected: before retrieval; the capstone filters, then runs hybrid retrieval, then the reranker gets the top 20 and the generator gets the top 5.

**Wrong answers, and why they fail**

- "Put the date into the query text so the embedding reflects it." An embedding does not enforce a date; a semantically close old document still scores high.
- "Filter the results after the top k comes back." If the top k is all old documents the filter leaves nothing, and the right one never had a chance.
- "Tell the model not to use documents from another jurisdiction." Access control belongs in retrieval, before the text reaches the prompt.

**Related lesson in this course:** [Deep dive 16: embeddings, distance metrics and vector search](#aideep-16)

:::

## Read the parent-document retrieval function

*Level 2 (working) · code-reading · about 8 minutes*

Read this retrieval function from the chunking lesson. What problem does the two-level layout solve, what does the `seen` set do, and how many parents can the function return?

```python
def retrieve_parent(child_query, mapping, encoder, top_k=3):
    child_embs = encoder.encode([m["child"] for m in mapping], normalize_embeddings=True)
    q_emb = encoder.encode([child_query], normalize_embeddings=True)[0]
    scores = child_embs @ q_emb
    top = np.argsort(-scores)[:top_k]
    seen, parents = set(), []
    for i in top:
        if mapping[i]["parent_idx"] not in seen:
            parents.append(mapping[i]["parent"])
            seen.add(mapping[i]["parent_idx"])
    return parents
```

:::answer Show the answer
:::say Short answer
Small child chunks are indexed for a precise match and the larger parent is returned for context, which removes the trade-off between a precise hit and enough surrounding text. The `seen` set drops a parent that several top children map to, so the prompt does not receive the same text twice. For a mapping that is not empty and a positive `top_k`, the function returns between one and `top_k` parents, fewer when children share a parent; an empty mapping or a `top_k` of zero returns none.
:::

**Full answer**

**The layout**

Standard chunking forces a choice: small chunks match precisely but lack context, large chunks carry context but cover many topics. The two-level layout indexes small children and stores the parent each child came from. The chunking lesson splits parents at 2048 and children at 256 by default, and the advanced RAG lesson draws a 512-token parent with four 128-token children. A query about one detail matches one child precisely, and the prompt receives the whole parent, including the lines around the detail.

**Walk the function**

1. Encode every child and the query with normalization on, so the matrix product equals the cosine.
2. Sort children by score and keep the top k indices.
3. For each top child, look up its parent index; if that parent was not seen, append the parent text and mark it.
4. Return the parents in the order of their best child.

**Why de-duplicate**

Several children of one parent often match the same query, because they sit in the same section. Without the set, the prompt would receive the same parent twice or three times and waste its context budget. The lesson calls this the key insight of the pattern.

**What production changes**

The function re-encodes every child on each call. A real index stores the child vectors once and only embeds the query. The two-level layout also degrades gracefully: a poor child match still returns a reasonable parent.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why index the child and not the parent? Expected: a small chunk matches a specific question precisely, while a large chunk covers many topics and its embedding points nowhere in particular.
- **Level 2:** Why a plain matrix product and no cosine? Expected: the vectors are normalized at encode time, so the dot product equals the cosine.
- **Level 3:** What does this function do on every call that production code must not? Expected: it re-encodes all the children; store the child vectors once at index time and embed only the query.
- **Level 3:** Two parents each have one matching child, and a third parent has three matching children below the cut. What does the function miss? Expected: it ranks by the best child only; a parent with several good children gets no extra credit unless you aggregate child scores per parent.

**Wrong answers, and why they fail**

- "Return the parent of every top child, duplicates included." Several children map to one parent, and the repeated text wastes the context budget.
- "Make the child as large as the parent." Then there is no precision gain; the point is a small match unit and a large context unit.
- "The function always returns exactly top_k parents." It returns fewer when children share a parent.

:::

## Read the rank fusion function

*Level 2 (working) · code-reading · about 8 minutes*

Read this fusion function from the advanced RAG lesson. Explain the `+ 1` in the denominator, say what the function ignores on purpose, and describe what happens to a document that appears in only one of the lists.

```python
def reciprocal_rank_fusion(ranked_lists, k=60):
    scores = {}
    for ranked_list in ranked_lists:
        for rank, (doc_id, _) in enumerate(ranked_list):
            if doc_id not in scores:
                scores[doc_id] = 0.0
            scores[doc_id] += 1.0 / (k + rank + 1)
    fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return fused
```

:::answer Show the answer
:::say Short answer
`enumerate` starts at zero, so the `+ 1` turns the index into a rank that starts at one, and the top document gets 1/61 as the published formula defines. The function drops the score that came with each document, because ranks are the comparable unit across retrievers. A document present in one list gets one contribution and no penalty for the other, so it can still place well if it ranked high where it appeared.
:::

**Full answer**

**Walk the loop**

1. The outer loop visits each ranked list, for example the vector list and the BM25 list.
2. The inner loop reads each entry as a pair and discards the second element, the retriever's own score.
3. The contribution for a document at zero-based index `rank` is `1.0 / (k + rank + 1)`, which is one over k plus the one-based rank.
4. Contributions sum per document id across the lists.
5. The result is sorted by the summed contribution, highest first.

**What the caller does**

The hybrid search in the same lesson asks each retriever for three times the final top k, fuses the two lists and returns the first top k of the fused result. The deeper candidate lists let a document that is good in both retrievers reach the final list even when it is first in neither.

**The capstone version**

The hybrid retrieval lesson adds a `weights` list with one multiplier per ranked list, applied to each rank contribution, and raises an error when the number of weights does not match the number of lists. It also keeps a map from document id to document so it can return documents instead of ids.

**The key**

Fusion runs on the document id. Two chunks of the same document are two keys. The capstone lesson recommends de-duplication by document, because a term that is out of vocabulary for BM25 gives a zero and the dense retriever still returns noise; per-document fusion absorbs that.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What changes if you delete the `+ 1`? Expected: the top document gets 1/60 instead of 1/61, the curve shifts a little, and the constant no longer matches the published definition.
- **Level 2:** Why does the caller fetch three times the final k from each retriever? Expected: a deeper list lets a document that ranks well in both retrievers reach the fused top k even when it is first in neither.
- **Level 3:** How does the capstone version let you favor one retriever? Expected: a weights list with one multiplier per ranked list, applied to the rank contribution, with an error when the lengths differ.
- **Level 3:** What is the fusion key, and why does that matter for chunks? Expected: the document id; chunks of one document are separate keys unless you de-duplicate by document, which the lesson recommends.

**Wrong answers, and why they fail**

- "The function averages the two scores." It never reads the scores; it sums a function of the ranks.
- "A document missing from one list is penalized." It gets no contribution from that list, which is not a penalty; it can still rank first if it was first in the other.
- "k is the number of results to keep." k is the decay constant in the denominator; the caller slices the fused list to the final top k.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Review a chunking choice before the first index build

*Level 2 (working) · tradeoff · about 10 minutes*

A team is about to index a new document corpus and asks you to review the chunker. They picked semantic splitting, 1000 tokens per chunk and 20 percent overlap, because a blog post recommended it. What do you tell them?

:::answer Show the answer
:::say Short answer
Start from the query type, not from a post. Factoid questions want 256 to 512 tokens, analytical or multi-hop questions 512 to 1024, and whole-section questions 1024 to 2048. Begin with recursive splitting at 512 tokens and no overlap, then measure recall at 5 on a 50-query set before you move any knob.
:::

**Full answer**

**Why size follows the question**

A chunk must be large enough to hold the answer plus its local context, and small enough that the top k returns the answer and not noise. Too small, at 64 to 128 tokens, and a chunk says "it increased 15% last quarter" with no subject. Too large, at 2048 tokens and more, and one chunk is 10% about revenue and 90% about headcount, so its embedding points nowhere.

| Query type | Chunk size |
|---|---|
| Factoid | 256 to 512 tokens |
| Analytical or multi-hop | 512 to 1024 tokens |
| Whole-section comprehension | 1024 to 2048 tokens |

**What the measurements say**

- Recursive splitting at 512 tokens beat semantic splitting 69% to 54% in the chunking study.
- Overlap gave zero measurable benefit in the sparse retrieval study, and every overlapped token is embedded and stored again, so the index cost grows with the overlap.
- Response quality drops sharply around 2,500 tokens of context, so bigger chunks hit a cliff.
- Semantic splitting without a minimum size produces 40-token fragments that hurt retrieval.

**Pick a default without a benchmark**

Three properties decide the first chunker: the document type, the paragraph length, and whether the format carries structure. Prose with no structure gets recursive splitting. Markdown and API docs get the header splitter. Code gets a syntax-aware splitter. When in doubt, recursive splitting is the strongest single baseline.

**Then measure**

Build a 50-query eval set, stratified by query type, and read recall at 5 for each candidate. Clamp every chunker with a minimum and a maximum size. Never let a chunk span two documents.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the chunk size depend on the kind of question? Expected: the chunk has to contain the answer with its context, and still be small enough that the top k is about the answer and not about the surrounding noise.
- **Level 2:** The corpus is markdown API documentation. What do you try first? Expected: the structural header splitter, because the format carries explicit structure; drop or merge header-only chunks.
- **Level 3:** Which two guards does every chunker need, whatever the strategy? Expected: a minimum and a maximum size, because chunks of 5 tokens or 5000 tokens both break retrieval.
- **Level 3:** You switch the embedding model later. What do you run again? Expected: the chunking eval, because the winner depends on the corpus and the model, and semantic splitting moves its boundaries when the model changes.

**Wrong answers, and why they fail**

- "Semantic splitting is best because it follows meaning." It lost to recursive splitting at 512 tokens in the measured study, and it makes tiny fragments unless you set a floor.
- "Overlap is a safety margin, keep it." The studies found that overlap often adds nothing, and it adds index cost in proportion to its size; justify any overlap with an ablation.
- "Bigger chunks give the model more context." Quality drops around 2,500 tokens of context, and a chunk that covers many topics dilutes its own embedding.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Settle a chunk overlap argument with one ablation

*Level 2 (working) · tradeoff · about 8 minutes*

Your chunker keeps a 100-token overlap between neighbor chunks. After the last corpus refresh the index size and the embedding bill both went up, and a teammate says the overlap must stay because it protects sentences that a boundary would cut in half. How do you settle it?

:::answer Show the answer
:::say Short answer
Settle it with an ablation, not an opinion. Run the same recall at 5 eval with the overlap at zero and at the current value on a stratified query set, and keep the overlap only if the number moves. The recent studies found that overlap often adds no measurable benefit, while it adds index cost in proportion to its size.
:::

**Full answer**

**Where overlap came from**

The fixed-window baseline cuts every N tokens with no regard for sentences. The RAG lesson shows the classic layout: 512-token chunks with a 50-token overlap, so chunk 1 holds tokens 0 to 511 and chunk 2 holds tokens 462 to 973. The repeated tail makes sure a sentence cut at an unlucky point appears whole somewhere.

**Why it matters less now**

A recursive splitter tries the paragraph break first, then the line break, then the sentence end, then the space. Its boundaries fall at natural breaks, so the problem that overlap solved mostly disappears. The chunking lesson lists overlap under cargo cult: the 2026 studies found zero measurable benefit in the measured case, and every overlapped token is embedded and stored twice.

**The test**

1. Keep the chunker, the embedder and the query set fixed.
2. Run recursive splitting at 512 tokens with overlap zero and with the current overlap.
3. Compare recall at 5 per query slice, and compare chunk counts.
4. Keep the overlap only where a slice shows a real gain, and record the ablation next to the setting.

The chunker skill in the lesson sets overlap to zero by default and refuses an overlap above 20 percent without an ablation that shows it helps.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why did the fixed-window splitter need overlap? Expected: it cuts at a fixed count whatever the text, so a boundary can split a sentence; the repeated tail puts that sentence whole into the next chunk.
- **Level 2:** What does a recursive splitter do instead? Expected: it splits on the paragraph, the line and the sentence separators in turn, so boundaries land on natural breaks.
- **Level 3:** What rule does the chunker skill apply to overlap? Expected: default zero, and refuse any overlap above 20 percent without an ablation.
- **Level 3:** The ablation shows a gain on one document type only. What do you ship? Expected: overlap for that type alone, with the ablation recorded, and a re-run when the corpus or the embedder changes.

**Wrong answers, and why they fail**

- "Overlap is free, embeddings are cheap." Every overlapped token is embedded and stored twice, so the index cost grows in proportion to the overlap.
- "A blog post says 20 percent overlap." The studies found no measurable benefit in the measured case; the answer depends on your corpus, so measure it there.
- "Remove it everywhere, no test needed." The ablation is cheap and the result is corpus dependent; a slice with real boundary losses would show up in it.

:::

## The reranker is perfect offline and worse in production

*Level 2 (working) · debug · about 8 minutes*

A new cross-encoder reranker lifts MRR on the offline fixture to a near-perfect value. In production the same reranker makes the top result worse than the retriever alone. List the causes you check, in order, and say how each one shows up.

:::answer Show the answer
:::say Short answer
Check the training data first: if the hand-labeled training pairs include the eval queries, the eval is a memory test and the lift is fake. Then check the pair order in production, because a cross-encoder is not symmetric and a swapped query and document collapses recall. Then check the candidate pool, because production candidates come from the real bi-encoder, and its recall at N caps what the reranker can see.
:::

**Full answer**

**Cause 1: the eval leaked into training**

The reranker lesson warns that if the hand-labeled training pairs include the eval queries, the rerank looks magical. The end-to-end lesson makes the point concrete: its 14 training triples resemble the eval queries, so the demo keeps the eval queries disjoint on purpose. A leak shows as a near-perfect fixture and a production result that looks like a different model.

**Cause 2: the pair is swapped**

The score for the query followed by the document is not the score for the document followed by the query. Always feed the query first. A swap shows as a collapse, not a drift, because every score is computed in the wrong direction.

**Cause 3: the pool is not the production pool**

An offline fixture can hand the reranker a made-up pool that always contains the gold chunk. In production the pool comes from the bi-encoder, and the reranker cannot raise recall above the bi-encoder recall at N. The lesson's fix is to pin the bi-encoder, the cross-encoder and N together; a change in any of them invalidates the eval.

**What to log so the next one is cheaper**

Log the rank-1 cross-encoder score per query. A top score below a corpus threshold marks an out-of-domain query, and a shift in the score distribution after a release marks a regression before users do.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How do you make the leak impossible? Expected: hold the eval queries out of the training triples strictly, even on a fixture, as the end-to-end lesson does.
- **Level 2:** What does a swapped pair look like in the numbers? Expected: a collapse rather than a drift, because every score is computed for the wrong direction.
- **Level 3:** Why does a synthetic candidate pool inflate the offline result? Expected: it can contain the gold chunk every time, while the real bi-encoder's recall at N caps what the reranker sees in production.
- **Level 3:** Which one number do you log per query to catch the next regression? Expected: the rank-1 cross-encoder score; a top score below a corpus threshold marks an out-of-domain query.

**Wrong answers, and why they fail**

- "The production model is a different build." Check the data and the inputs before the weights; a leak and a swapped pair both reproduce with the same weights.
- "The fixture is too small to mean anything." Size does not create a leak; overlap between training and eval queries does.
- "Lower N in production to match the fixture." A smaller N lowers the recall cap and makes the pipeline worse.

**Related lesson in this course:** [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7)

:::

## Vector search misses the article with the exact error code

*Level 2 (working) · debug · about 8 minutes*

Support agents search the knowledge base with the exact error code from a ticket, such as E-4021. The vector search returns articles about error handling in general and misses the one article that contains that code. What is happening, and what do you add?

:::answer Show the answer
:::say Short answer
The embedding model treats a rare code as noise, so the query vector lands near articles about errors in general and not near the one exact match. Add a lexical index with BM25 next to the vector index, run both for every query, and merge the two ranked lists with reciprocal rank fusion. The exact token wins on BM25, and the fused list puts that article first.
:::

**Full answer**

**Two retrievers, two strengths**

Semantic search understands meaning. "How do I cancel my subscription" matches "steps to terminate your plan" with no shared word. It misses exact matches, because a code such as E-4021 carries no meaning for the model to embed.

Lexical search does the opposite. BM25 scores a document by summing, over the query terms, an inverse document frequency factor times a saturating term frequency factor with a length correction. A term that appears in few documents weighs most, so a rare code is exactly what BM25 is best at. It fails when the query and the document share no words.

**Hybrid search**

Run both retrievers in parallel and fuse by rank: each document gets the sum of one over k plus its rank in each list, with k at 60. The capstone demo shows the three cases. The literal symbol query sits at BM25 rank 1 and dense rank 4, and fuses to rank 1. The paraphrased query sits at BM25 rank 6 and dense rank 1, and fuses to rank 1. The fusion wins on both query classes, so the fix for the error code does not cost the paraphrased queries.

**Two details that matter**

- **Field weighting.** If the codes live in a title or symbol field, repeat those tokens at index time so a title match counts more than a body match. The math stays the same.
- **Out-of-vocabulary codes.** A code present in the ticket and absent from every article gets zero from BM25, because its document frequency is zero, while the dense side still returns plausible-looking neighbors. De-duplicate by document so the empty lexical side adds no stray rank contributions. Rank fusion still scores the documents that only the dense side returns, so they stay in the fused list and can rank first. Check that a retrieved article contains the code, and when none does, say that no retrieved article contains it instead of answering from the neighbors.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does BM25 give a rare code so much weight? Expected: the inverse document frequency factor; a term in few documents scores high and a term in most documents scores low.
- **Level 2:** The code is in the ticket but in no article at all. What does each retriever return? Expected: BM25 contributes nothing for that term, and the dense retriever still returns neighbors that look plausible and are wrong, and the fusion keeps them; check that a retrieved article contains the code, and when none does, say that no retrieved article contains it.
- **Level 3:** How do the paraphrased queries fare after you add the lexical index? Expected: they still win, because the fusion is rank based; in the demo the paraphrased query sat at BM25 rank 6 and dense rank 1 and fused to rank 1.
- **Level 3:** The codes live in a short title field and the body is long prose. What do you tune? Expected: field weighting, which repeats the title tokens at index time so a title match counts more.

**Wrong answers, and why they fail**

- "Switch to a better embedding model." A rare code has no meaning to learn; the fix is a lexical signal next to the semantic one.
- "Lower the similarity threshold so more articles come back." More neighbors on the wrong topic do not include the one exact match.
- "Replace the vector search with BM25." Then the queries that share no words with the article fail; run both and fuse.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Which query rewriter fits a two-topic question

*Level 2 (working) · tradeoff · about 9 minutes*

Your pipeline offers three query rewriters: write a hypothetical answer and search with it, write several paraphrases and merge, or decompose it into sub-questions and merge. A user asks "what does our team do when uploads fail and the budget is gone?" Which rewriter fits, and when would each of the other two be the right pick?

:::answer Show the answer
:::say Short answer
Split it, because the question joins two topics with a conjunction, an upload failure and an exhausted budget, and no single chunk holds both. The hypothetical answer fits a jargon-heavy question whose words do not match the corpus vocabulary. Paraphrases fit a short question that could be asked in many equally good ways.
:::

**Full answer**

**The three, side by side**

| Rewriter | What it does | Wins when | Loses when |
|---|---|---|---|
| Hypothetical answer | the model writes a passage in the corpus voice; its embedding replaces the query vector | the query and the corpus use different words | the model invents an identifier that is not in the index |
| Paraphrases | the model writes N rewrites; retrieve each; merge the lists by rank fusion | any of several phrasings would have asked it better | the rewrites all converge, so the merge equals one retrieval |
| Sub-questions | the model splits the question; retrieve each part; merge | the question has conjunctions or two unrelated topics | the question is atomic and gets split anyway |

**Costs**

Each rewriter adds one model call before retrieval, and the advanced RAG lesson puts the hypothetical answer at 500 to 2000 ms extra. The retrievals after the call run in parallel, so the model call is the floor. Cache the rewriter output by a hash of the query, because many queries repeat.

**Guards**

- Cap the hypothetical to two or three sentences; longer ones collect noise, shorter ones lose the lexical signal.
- Add an explicit diversity instruction to the paraphrase prompt, and drop near duplicates by Jaccard overlap.
- Check that the sub-questions are distinct before the fan-out, so an atomic question returns unchanged.

**Choosing per query**

The end-to-end lesson picks a strategy from heuristics on query length, conjunctions and jargon ratio. The other option is to run all three in parallel and fuse the three result sets; the cost is three model calls and one fusion.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What does a rewriter cost in latency? Expected: one model call before retrieval, 500 to 2000 ms for a hypothetical answer in the advanced RAG lesson, with the retrievals after it in parallel.
- **Level 2:** The paraphrases come back nearly identical. What happens and what do you change? Expected: the merged list equals one retrieval; add a diversity instruction and drop near duplicates by Jaccard overlap.
- **Level 3:** The splitter turns an atomic question into three parts. What is the damage and the guard? Expected: the same document comes back three times at a lower rank and the merge is worse; test that the parts are distinct before the fan-out.
- **Level 3:** How does the end-to-end system choose without a human? Expected: heuristics on length, conjunctions and jargon ratio, or run all three and fuse.

**Wrong answers, and why they fail**

- "Always write the hypothetical answer, it is the strongest." It bridges a vocabulary gap and does nothing for a two-topic question; an invented identifier can also hurt the lexical side.
- "A rewriter fixes a weak retriever." It only moves the query closer to the corpus voice; a chunker that cut the answer still loses.
- "Split every query into sub-questions." Atomic questions get over-split and come back worse than the original.

:::
