---
track: aibank
title: "AI interview bank: RAG (part 2 of 2)"
short: RAG 2
sub: 11 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Build the eval that picks a retrieval configuration

*Level 3 (senior) · take-home · about 60 minutes*

Take-home. You receive a corpus of a few hundred internal documents and a retrieval pipeline with two chunkers and two retrievers behind flags. Build the evaluation that tells the team which configuration to ship, and write up what the numbers mean. You have one evening.

:::answer Show the answer
:::say Short answer
Build a labeled query set first, stratified by query type, with gold document ids and gold answer text for each query. Run every configuration against the same set and report recall at 5 for each slice, plus MRR and the share of queries whose top 5 holds a chunk with the gold answer text, and read the spread between configurations. Label at document level so the same labels grade every chunker; if you label at chunk level, record the chunker in the qrels and relabel after any change of chunker.
:::

**Full answer**

**The deliverable**

1. **A qrels file.** One record per query with the query text, the gold document ids, a graded relevance map and the gold answer substring. Label at document level, not at chunk level, so the labels survive a chunker change.
2. **A stratified set.** The chunking lesson uses a 50-query set split across factoid, analytical and multi-hop questions. Multi-hop queries reveal different winners than factoid queries, and one average hides the losing class.
3. **The run matrix.** Two chunkers times two retrievers, every cell against the same qrels, same k values.
4. **The metrics.** Recall at 5 as the primary number, precision at k beside it, MRR for the position of the first hit, nDCG if the labels are graded, and an answer hit at 5 that counts a query only when a top-five chunk contains the gold answer substring. Document-level recall cannot tell two chunkers apart when both return chunks of the gold document and only one of them returns the chunk with the answer. The answer hit measures exact-span coverage only: a multi-hop answer spread across several chunks can miss it while the top five still supports the answer, so read it beside recall and not as a full retrieval score.
5. **The report.** One table with one row per configuration and one column per slice, then a recommendation and the reason, then what you would measure next.

**What to expect**

The chunking comparison lesson shows the pattern: the structural header splitter wins on markdown, semantic clustering wins on plain prose, and recursive splitting holds its own on a mixed corpus. The hybrid retriever beats the lexical baseline on recall. Your corpus decides which of these holds.

**Guards that graders look for**

- The labeling level is recorded in the qrels header, and chunk-level gold ids name the chunker they were produced against.
- Any training pairs for a reranker are disjoint from the eval queries.
- The per-query results are persisted, not only the averages.
- The write-up names what this eval cannot tell: answer quality, which needs faithfulness and relevance judged by a model from another family or by hand.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why split the queries by type? Expected: factoid and multi-hop queries reveal different winners, and one average hides the class that loses.
- **Level 3:** The labels were produced with chunker A. Can you reuse them for chunker B? Expected: only if the labels are at document or span level; chunk ids change with the boundaries, so record the chunker in the qrels and relabel otherwise.
- **Level 4:** How do you justify the query count in the write-up? Expected: a 50-query stratified set for the first decision, then tiers of 20 queries in CI, 200 nightly and 2000 weekly, with a note on what each tier can and cannot detect.
- **Level 4:** What do you refuse to conclude after one evening? Expected: anything about answer quality, because the eval grades retrieval; faithfulness and relevance need a judge, and a judge from the generator's own family is biased.

**Wrong answers, and why they fail**

- "I wrote ten questions myself and ran each configuration." Ten questions of one type cannot separate four configurations or expose a class that always misses.
- "Here is the average recall for each configuration." One average hides per-slice winners and the class that fails.
- "I changed the chunker and reused the chunk-level labels." Chunk ids no longer line up with the new chunks; label at document level, or relabel and record the chunker in the qrels header.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Design a question answering service over company documents

*Level 3 (senior) · design · about 30 minutes*

Design a question answering service over a company's internal documents: wikis, policies, contracts and support articles, a few hundred thousand pages, with weekly updates. Users are employees with different access rights. Walk through the pipeline, the evaluation, and the first three things you would measure in production.

:::answer Show the answer
:::say Short answer
Build two sides. The ingestion side parses each document, chunks it per document with a structure-aware splitter, embeds the chunks, and indexes dense vectors and a BM25 index with metadata and access labels on every chunk. The query side filters by access first, runs hybrid retrieval with rank fusion, reranks a candidate pool with a cross-encoder, and generates a cited answer with a refuse path. Prove it with a golden set labeled by domain experts and a retrieval eval that reports recall at k per query class, then measure retrieval quality weekly, faithfulness and citation correctness per turn, and cost per query in production.
:::

**Full answer**

**Requirements first**

- **Freshness.** Weekly updates mean re-indexing changed documents, not retraining a model.
- **Access.** Different rights mean per-chunk labels and a filter before retrieval.
- **Audit.** Answers must point at the passages they came from.
- **Scale.** Several hundred thousand pages do not fit any prompt; retrieval decides what the model sees.

**Ingestion**

1. Parse each document into text and structure.
2. Chunk per document. Start with recursive splitting at 512 tokens and no overlap; use the header splitter for markdown; clamp every chunk with a minimum and a maximum; never let a chunk span two documents.
3. Attach metadata: source, date, version, category, author, role label, jurisdiction or business unit tag.
4. Embed each chunk and write the vector with its payload. Build a BM25 index beside it with field weights so a title or code match counts more than a body match.

**Query**

1. Filter the candidate space by the caller's role labels before any search.
2. Run dense and BM25 retrieval in parallel and fuse by rank.
3. Send the top 20 to a cross-encoder and keep the top 5, the funnel the production capstone uses.
4. Build the prompt with the stable parts first: the system prompt and the static policies, then the reranked context, then the question. The capstone targets a cache hit rate of 60 to 80 percent on that prefix, which drops the cost per query by 3 to 5 times.
5. Generate with instructions to cite every claim and to refuse when the snippets do not answer; gate on the reranker's rank-1 score before generation and drop uncited claims after it.

**Evaluation before launch**

- A golden set of 200 question and answer pairs with citations, labeled by a domain expert, as the capstone requires.
- Qrels in tiers: a smoke set of 20 queries in CI, a regression set of 200 nightly, a deep set of 2000 weekly.
- Retrieval metrics per query class: recall at k first, then MRR, then nDCG if relevance is graded.
- Answer metrics: faithfulness and relevance, judged by a model from another family.
- A red team of 50 adversarial prompts: jailbreaks, data extraction attempts, off-domain questions and cross-unit leaks.

**The first three production measurements**

1. **Retrieval quality on the golden set, weekly.** The capstone alerts on a 5 percent drop. Slice it by document type and business unit.
2. **Faithfulness and citation correctness per turn.** These catch the generator inventing or mis-citing while retrieval is fine.
3. **Cost and latency per query by stage.** Cache hit rate, tokens per query, and the split between retrieval, in the lesson's range of 50 to 200 ms, and generation, in the range of 500 to 3000 ms.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Where does access control live? Expected: in the retrieval filter, as role labels on chunks applied before the similarity search, and never in the prompt text.
- **Level 3:** A document changes on Tuesday. What is stale and for how long? Expected: its chunks, until the next re-index; re-embed only changed documents, carry the version in the metadata, and watch the gap between source updates and index updates.
- **Level 4:** How do you keep the model cost down at this volume? Expected: a cache-friendly prompt with the system prompt and policies first, the reranked context next and the question last; the capstone targets a 60 to 80 percent hit rate and a 3 to 5 times lower cost per query.
- **Level 4:** The golden set passes and one department still reports bad answers. What do you do? Expected: slice the eval by document type and query class, add that department's real queries to the qrels, and check whether their documents are chunked by a splitter that fits their format.

**Wrong answers, and why they fail**

- "Put every document into one long prompt." Hundreds of thousands of pages do not fit, and the lesson budgets 2,500 to 5,000 tokens of retrieved text per query for a reason.
- "Tune the model on the documents every week." It cannot cite, it goes stale between runs, and it cannot enforce access rights.
- "Vector search alone is enough." Exact identifiers, codes and names need the lexical side; run both and fuse.
- "Ship without a labeled set, the demo works." A demo on ten documents says nothing about hundreds of thousands of pages; label the golden set first.

**Related lesson in this course:** [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7)

:::

## Faithfulness stays high while reviewers find invented facts

*Level 3 (senior) · debug · about 10 minutes*

Your faithfulness score comes from a model that reads each claim next to the retrieved context and answers yes or no. The score has sat near the top for a month, yet reviewers keep finding invented facts in sampled answers. The generator and the judge are the same model. What is going on, and what do you change?

:::answer Show the answer
:::say Short answer
A judge from the same family as the generator grades its own output as more faithful than it is, so the number stays high while the samples show the truth. Switch the judge to a different model family or hand-grade a sample, and add a sample-level review, because a per-sentence check can pass while the whole answer misleads.
:::

**Full answer**

**How the metric is built**

The eval splits the answer into sentence-shaped claims, asks the judge whether each claim is supported by the retrieved context, and reports the fraction that pass. The lesson ships a deterministic stand-in judge based on token overlap so the eval runs offline, and swaps in a model call in production. The question answering lesson describes the production form: entailment between each claim and the context, with no gold answer needed.

**Two blind spots**

1. **Judge bias.** A model judges the output of its own family as more faithful than it is. The lesson's rule: use a different model family for the judge than for the generator, or hand-grade a sample.
2. **Micro-checks miss macro-claims.** Each sentence can be supported while the answer as a whole draws a conclusion that the context does not. Add a sample-level qualitative review on top of the automated metric.

**What to change**

- Change the judge family, then measure the disagreement between the old judge and the new one on the same fixture. The lesson's exercise does the same between the mock judge and a real model.
- Hand-grade a fixed sample each week and treat it as the calibration set for the automated score.
- Consider graded faithfulness with three values, unsupported, partially supported and fully supported, instead of a yes or no.
- Keep answer relevance next to faithfulness. A grounded answer to the wrong question is strong on one metric and weak on the other.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** How do you size the judge problem before you change anything? Expected: hand-grade a sample of claims and measure the disagreement between the judge and the human labels.
- **Level 3:** Every sentence passes but the answer as a whole misleads. Which check catches that? Expected: a sample-level qualitative review in addition to the per-claim metric.
- **Level 4:** Why can a high faithfulness score sit next to a useless answer? Expected: faithfulness compares the answer with the context and not with the question, so a grounded off-topic answer scores high on faithfulness and low on relevance.
- **Level 4:** The team wants the strongest model available as judge, and it is also the generator. What do you say? Expected: pick the judge for independence first; a strong judge of its own family is still biased, so use another family and keep a human-graded calibration sample.

**Wrong answers, and why they fail**

- "The score is high, so the reviewers are wrong." The score is one model's opinion of its own family's output; the sampled answers are the ground truth.
- "Make the judge stricter and the problem goes away." A stricter prompt or threshold does not remove a bias toward the judge's own family; only another family or a human sample does.
- "Replace faithfulness with answer relevance." They measure different things; relevance asks whether the answer addresses the question and says nothing about grounding.

**Related lesson in this course:** [Deep dive 20: RAG evaluation and guardrails in practice](#aideep-20)

:::

## Let the assistant say it does not know

*Level 3 (senior) · design · about 10 minutes*

Your document assistant answers every question, including the ones the corpus does not cover, and the invented answers are the ones users remember. Design the path that lets the system say it does not know, and say how you measure that the path works.

:::answer Show the answer
:::say Short answer
Log the reranker's rank-1 score for every query and refuse when it falls below a corpus-specific threshold, instead of handing weak chunks to the generator. Tell the generator to answer only from the snippets, to cite every claim and to say it does not know when the snippets do not answer. Measure refusal calibration: on questions whose answer is not in the store, count how often the system refuses, and track the false confidence rate.
:::

**Full answer**

**Gate 1: before generation**

The reranker lesson logs the rank-1 cross-encoder score. A query whose top score sits below a corpus-specific threshold is an out-of-domain hit, and the end-to-end lesson refuses on it: the generator returns the refusal text with no citation. The production capstone calls this an unsure mode and measures the drop in false confidence. The question answering lesson starts simpler, with a threshold on the top retrieval similarity, and tunes it on a held-out set.

**Gate 2: inside generation**

The prompt tells the model to use only the snippets, to cite every claim with its anchor, and to say it does not know when the snippets do not answer. The question answering lesson measured that the explicit grounding and refusal instruction cuts hallucination by 40 to 60 percent against a naive prompt.

**Gate 3: after generation**

Parse the answer and check each claim against the passage that its anchor cites. A claim without an anchor, or with an anchor whose passage does not state the claim, is dropped or sent back for a re-ask. An answer that slipped past the score gate then cannot ship a claim that its cited passage does not support.

**How to measure it**

- **Refusal calibration.** On a set of questions with no answer in the store, the share that the system refuses.
- **False confidence rate.** The share of those questions that got an answer anyway.
- **Wrong refusal rate.** On in-corpus questions, the share refused. A threshold that is too high fails here.

Move the threshold on the held-out set, never on production anecdotes, and re-tune it when the embedder, the reranker or the corpus changes.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Where does the threshold come from? Expected: the distribution of rank-1 scores on a held-out set with known in-corpus and out-of-corpus questions; it is specific to the corpus.
- **Level 3:** What does the generator prompt need beyond "use only the context"? Expected: cite each claim with its anchor and say it does not know when the snippets do not answer; the explicit instruction cut hallucination by 40 to 60 percent in the question answering lesson.
- **Level 4:** Too many refusals are also a failure. How do you balance it? Expected: track the false confidence rate on out-of-corpus questions next to the wrong refusal rate on in-corpus questions, and move the threshold on the held-out set.
- **Level 4:** How does the citation post-filter work with the refusal gate? Expected: each claim is checked against the passage its anchor cites, and a claim with no anchor or with a passage that does not state it is dropped or re-asked, so a weak answer that passed the score gate cannot ship an unsupported claim.

**Wrong answers, and why they fail**

- "Tell the model to be careful." An instruction cannot see the retrieval scores; the first gate belongs before generation.
- "Refuse when retrieval returns fewer than k chunks." A count is not confidence; weak chunks still fill k slots.
- "Set the threshold once from the fixture." It is corpus specific and moves when the embedder, the reranker or the corpus changes.

:::

## Pick how many candidates the reranker scores

*Level 3 (senior) · tradeoff · about 10 minutes*

You add a cross-encoder behind a hybrid retriever. The prompt receives K chunks. The team wants a rule for N, the number of candidates the reranker scores, and one engineer proposes a small N to protect the latency budget. How do you choose N, and what do you refuse?

:::answer Show the answer
:::say Short answer
Choose N from the recall curve of the reranked output and the latency budget together. Sweep N on a held-out query set; the lift saturates at a knee somewhere around 20 to 50 candidates, and past it every extra candidate costs a forward pass for nothing. Keep N at least three times K, because the reranker can only promote a chunk that the retriever put in the pool.
:::

**Full answer**

**The one tunable**

The two-stage pipeline has one knob. The bi-encoder returns N candidates, the cross-encoder scores each pair and keeps K. The lesson shows the shape of the curve with illustrative values: recall at 1 rises from N of 5 to N of 20, rises less to N of 50, and does not change at N of 100. The values are not measurements from the fixture; the knee is real.

**The cap**

The cross-encoder cannot raise recall above the bi-encoder recall at N. A low N caps quality, not only latency. If N equals K, the reranker can reorder the K candidates but cannot bring a new one in, so recall at K cannot move and the lift looks like zero.

**The cost side**

- Batch the N pairs into one forward pass. Scored one by one, the latency multiplies by N.
- Plan the memory. A 22M parameter cross-encoder takes 88 MB at float32 before any batch.
- Cache reranker output by the hash of the query and the document id. A stable corpus reranks the same way, so hits buy a free latency cut.

**Pin the three together**

The bi-encoder, the cross-encoder and N are one choice. A change in any of them invalidates the eval, so the sweep runs again after a model change.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the curve flatten? Expected: past the knee the extra candidates are rarely relevant, so the reranker has nothing more to promote while each one still costs a forward pass.
- **Level 3:** You cut N from 50 to 10 to save latency. What else moves? Expected: the recall cap, because the reranker cannot see a chunk outside the pool; run the eval again instead of assuming.
- **Level 4:** The embedder is upgraded. Is the chosen N still valid? Expected: no; a new bi-encoder changes recall at N, so the sweep must run again before the release.
- **Level 4:** How do you get the latency back without a smaller N? Expected: one batched forward pass for the N pairs, and a cache keyed on the query and the document id.

**Wrong answers, and why they fail**

- "Set N equal to K to save time." Then the reranker can only reorder the K chunks and never bring a new one in, so recall at K cannot move.
- "The larger N, the better." Past the knee the lift saturates and each extra candidate costs one forward pass.
- "Pick N once and keep it." N is pinned with the two models; a change in either one invalidates the choice.

:::

## Read the four lines that score a BM25 term

*Level 3 (senior) · code-reading · about 10 minutes*

Read these four lines of a BM25 scorer from the advanced retrieval lesson. Explain the `+ 1` inside the logarithm, say what `k1` and `b` control, and describe what happens to a term that appears in more than half of the documents.

```python
idf = math.log((self.n_docs - df + 0.5) / (df + 0.5) + 1)
numerator = tf * (self.k1 + 1)
denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avg_dl)
score += idf * numerator / denominator
```

:::answer Show the answer
:::say Short answer
The `+ 1` inside the log is the smoothed inverse document frequency: without it a term that is in most of the documents gets a negative weight, and with it the weight stays positive. `k1` sets how fast repeated occurrences stop adding score, and `b` sets how much a long document is penalized. A term in most documents gets a weight near zero, which is the right treatment for a stop word.
:::

**Full answer**

**The inverse document frequency**

The ratio inside the log is the number of documents without the term, plus a half, over the number with the term, plus a half. When fewer documents contain the term than not, the ratio is above one and the log is positive. When the term crosses the half-corpus line the ratio drops below one and the log alone turns negative. The `+ 1` keeps it positive. The capstone lesson notes that this matters for stop words, which appear in most documents, and in small corpora where one common term can cross the line.

**Term frequency saturation**

The term frequency factor is `tf * (k1 + 1)` over `tf + k1 * (...)`. As `tf` grows the factor approaches `k1 + 1`, so a document that repeats a term 50 times is not 50 times more relevant than one that has it once. The advanced RAG lesson defaults `k1` to 1.2; the capstone lesson uses 1.5 and calls it the published recommendation, with the advice not to move it without a benchmark.

**Length normalization**

`b` scales the length term. At `b` of zero, document length is ignored. At `b` of one, the length penalty is full. Both lessons default to 0.75: longer documents are penalized, but not linearly.

**Field weights**

The capstone implements field weighting as a multiplier on term counts at index time, for example the symbol name repeated above the body. The scoring code stays the same.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** What is the weight of a term that appears in every document? Expected: df equals the document count, the ratio inside the log is near zero, the log of about one is near zero, so the term adds almost nothing.
- **Level 3:** A document repeats a query term 50 times. How does its score compare with one occurrence? Expected: it is not 50 times higher; the term frequency factor saturates toward k1 plus 1.
- **Level 4:** When would you move `b`? Expected: up when long documents really say less per word, and down toward zero when document length has nothing to do with topic.
- **Level 4:** The two lessons default `k1` differently. What do you do? Expected: keep the published default unless a benchmark on your own corpus says otherwise, and tune k1 and b by re-running the eval harness rather than by intuition.

**Wrong answers, and why they fail**

- "The +1 avoids a logarithm of zero." The ratio is never zero because of the half in the numerator; the +1 keeps the weight from going negative when the term passes half the corpus.
- "k1 is the number of results to keep." k1 is the term frequency saturation constant.
- "A higher b favors long documents." A higher b penalizes length more; b at zero ignores length.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Recall holds, MRR drops, nobody touched the retriever

*Level 3 (senior) · debug · about 10 minutes*

After a release, the nightly RAG eval shows recall at 5 unchanged and still high, MRR down from last week, and faithfulness unchanged. Nobody touched the retriever. Which stage do you suspect, how do you confirm it, and what would other patterns have told you?

:::answer Show the answer
:::say Short answer
The reranker. On average the gold chunk still arrives in the top 5, so recall holds, but it sits lower in the list, so MRR falls, and the generator stays grounded in what it receives. Confirm it from the per-query trace: compare the rank of the gold chunk before and after the release, then look at what changed in the reranker, such as its weights, its candidate pool size, or the order of the query and the document in the pair.
:::

**Full answer**

**Why the pattern points at one stage**

MRR is the mean over queries of one divided by the rank of the first relevant document. Rank 1 contributes 1.0, rank 2 contributes 0.5, rank 10 contributes 0.1, so the metric is dominated by the top of the list. Recall at 5 is blind to position inside the top 5. A move in MRR with recall flat suggests that the right chunk moved down inside the window, and the stage that sets the order inside the window is the reranker. A flat average does not prove it: one query can lose its gold chunk from the top 5 while another gains one. The per-query rank trace below separates reranker movement from retrieval loss.

**The full table**

| Symptom | Likely cause | What to fix |
|---|---|---|
| Low recall at k, low precision at k | the chunker cut the answer, or the retriever cannot find it | chunk boundaries, or the retrieval modality |
| Decent recall at k, low MRR | the right chunk is in the top k but not at position 1 | the reranker |
| High MRR, low faithfulness | the generator invents content with the right context in front of it | the generation prompt, force cite or refuse |
| High faithfulness, low relevance | the answer is grounded but off topic | the query rewriter, or the prompt |
| All four high, users still complain | the eval set is not representative | add real user queries to the qrels |

**Confirm, do not guess**

Persist the metric trace per query on every CI run. Then the question is not "which number fell" but "which queries fell, and to which rank". Slice by query class. A fall confined to one class, such as queries that carry a literal symbol, points at a different change than a fall across every class.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** The trace shows the gold chunk at rank 3 only for literal identifier queries. What does the slice suggest? Expected: a change that hurt the lexical signal inside the pool for those queries; slice by class to find it rather than averaging it away.
- **Level 3:** Which release changes can move MRR while recall at 5 stays fixed? Expected: anything inside the reranker: new weights, a smaller candidate pool, or the query and the document swapped in the pair.
- **Level 4:** Faithfulness is also down while recall and MRR are fine. Where do you look? Expected: the generation prompt, and the judge itself, because a judge from the same model family grades its own output too kindly; hand-grade a sample.
- **Level 4:** Why keep the per-query trace rather than the averages? Expected: a 90 percent average hides a class that always misses, and when a user complains you can find the matching qrel and see whether the eval would have caught it.

**Wrong answers, and why they fail**

- "The retriever regressed." Nobody touched the retriever and recall at 5 did not move; a flat average can still hide a query that lost its gold chunk, so check the per-query rank trace before you blame retrieval.
- "The model started to hallucinate." Faithfulness did not move; the generator is still grounded in what it receives.
- "Run it again, it is noise." The eval is offline and deterministic on the fixture; one metric down with the others flat points at one stage.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## The invented passage made code search worse

*Level 3 (senior) · debug · about 10 minutes*

You turned on the hypothetical-answer rewriter for a code search assistant. Questions about one subsystem got worse: the gold document, which sat at rank 2 before, now falls out of the top 10 on the lexical side. The hypothetical passages read well. What happened, and what do you change?

:::answer Show the answer
:::say Short answer
The model wrote a function name that does not exist in the index. The real symbol that carried the lexical match is gone from the rewritten query, the rest of the passage is generic prose that scores across many documents, and the dense side returns a plausible neighbor for the invented token. Cap the hypothetical at two or three sentences, lower the BM25 weight in the fusion for rewritten queries, and route queries that already contain a literal symbol past the rewriter.
:::

**Full answer**

**Why the rewriter exists**

The user's words and the corpus words differ. The rewriter asks the model to write the passage that would answer the question, in the voice of the documentation, and embeds that passage instead of the query. The passage is wrong as a fact, because the model does not know your corpus, and that is fine for the dense side: the retriever cares about token distribution, not truth.

**Why it broke here**

Code search is the worst case for the trick. The model invents identifiers with confidence. On the lexical side, the invented name replaces the real symbol, so the one rare term that would have scored high on the right document is absent, and the generic prose around it spreads the score over many documents. On the dense side, a token that is in no document still gets a plausible-looking vector, so the retriever returns neighbors that look right and are wrong. The fusion absorbs that only when the lexical side votes correctly, and here it no longer does.

**The fixes, in order**

1. Cap the hypothetical to two or three sentences. Longer passages collect more noise tokens; shorter ones lose the lexical signal the trick needs.
2. Weight the BM25 list lower in the fusion when the query was rewritten, as the lesson advises.
3. Pick the strategy per query. The lesson's heuristic sends jargon-heavy paraphrases to the hypothetical answer; a query that already carries the exact symbol is a literal query, and the lexical retriever handles it at rank 1 with no help.
4. Prove it. Slice the eval by query class and compare recall with and without the rewriter for each slice. Keep it on only where it lifts recall.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does a longer hypothetical make it worse? Expected: it collects more tokens that score on many documents; the lesson caps it at two or three sentences.
- **Level 3:** Which queries should skip the rewriter? Expected: queries that already contain a literal symbol, because the lexical retriever ranks those first without help.
- **Level 4:** How do you prove the fix rather than argue it? Expected: slice the eval by query class, compare recall per slice with and without the rewriter, and enable it only on the slices where it helps.
- **Level 4:** Why does the dense side not rescue the query? Expected: the invented token still gets a plausible vector, so the dense retriever returns wrong neighbors that look right; the fusion fixes that only when the lexical side votes correctly.

**Wrong answers, and why they fail**

- "Tell the model not to invent names." It cannot know which names exist in your corpus; the lesson says the passage is wrong as a fact by design.
- "Turn the rewriter off everywhere." It wins on queries whose phrasing does not match the corpus; route by query class instead.
- "Raise the BM25 weight to get the lexical signal back." The lexical signal is the part the invented token broke; the lesson lowers the BM25 weight for the rewritten query.

:::

## Design code search across ten repositories that stays fresh

*Level 4 (staff) · design · about 30 minutes*

Design a code search service that answers questions such as "how is the upload retry budget enforced" across 10 repositories with about 2M lines of code, and that stays fresh on every push. What is different from document retrieval, and where does it break?

:::answer Show the answer
:::say Short answer
Chunk at syntax tree nodes, functions and classes, not at fixed windows, and give each chunk three retrievable forms: a dense code embedding, BM25 terms with the symbol name weighted above the body, and a one-sentence natural-language summary. Retrieve hybrid, rerank with a cross-encoder, and synthesize with mandatory file and line citations that a post-filter enforces. Freshness is the hard part: a push triggers a symbol-level diff so that only changed chunks re-embed and only affected cross-file edges recompute.
:::

**Full answer**

**Why fixed windows fail on code**

A fixed window cuts an identifier in half and separates a function body from its signature. The capstone parses each file with a syntax tree parser, extracts function and class nodes, and emits one chunk per node with its repository, path, start line, end line, symbol and body. The chunk boundary is the unit the user wants cited.

**Three representations per chunk**

| Form | Catches |
|---|---|
| Dense embedding of the code | paraphrased questions about behavior |
| BM25 with field weights, symbol name 4, summary 2, body 1 | literal symbol names and "find the function named X" |
| A one-sentence summary from a small cached model | a user who says "authorized" when the code says `check_permission` |

Users ask in English about code that uses other words. The summary adds the modality that neither the code embedding nor the lexical index covers.

**The symbol graph**

Record edges for imports, calls and inheritance across files and repositories. At query time, expand retrieval along the edges so that a question which crosses four repositories still finds the chain from the caller to the budget configuration.

**The query path**

Retrieve dense and BM25 in parallel, de-duplicate by repository, path and symbol, rerank the top 50 and keep the top 10, synthesize with a cached system prompt, and require a repository, path and line range anchor on every claim. A claim without an anchor is flagged for a re-ask or dropped.

**Incremental freshness**

A push triggers a diff of changed files and changed symbols. Only chunks whose text changed re-embed. The cross-file edges of the changed chunks recompute, which covers imports, calls and inheritance, so a changed call or base class does not leave a stale edge. A deleted file or symbol removes its chunks from the dense and lexical indexes and its edges from the graph, so search cannot return it after the push. The capstone's target is a 50-file push searchable in under 60 seconds on the 2M line fleet.

**Evaluation**

Label 100 cross-repository questions with gold file and line answers. Measure MRR at 10, nDCG at 10, citation faithfulness as the fraction of claims with a verifiable anchor, and p50 and p99 latency. Re-run the set weekly and alert on an MRR at 10 drop above 5 percent.

**Where it breaks**

- **Generated code.** Boilerplate from code generators poisons retrieval with near duplicates; flag generated chunks in the payload and down-weight them. The capstone injects 20 percent generated code to show the effect.
- **Monorepo duplication.** Repeated utility code spreads the lexical signal over copies; de-duplicate by symbol.
- **The long tail.** Rarely imported symbols have weak embeddings; the lexical side and the summary carry them.
- **A big push.** A commit that retouches half the files is where the incremental path is tested; measure the push-to-searchable time, not only the average.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why three forms per chunk and not one good embedding? Expected: users ask how something is authorized while the code says `check_permission`; the summary bridges a vocabulary gap that neither the code embedding nor BM25 covers.
- **Level 3:** What does the symbol graph buy at query time? Expected: expansion across repository boundaries, from a function to its callers and imports, so a question that spans several repositories finds the whole chain.
- **Level 4:** Generated boilerplate enters the corpus. What happens and what do you do? Expected: near-duplicate code poisons retrieval; flag generated chunks in the payload and down-weight them.
- **Level 4:** What is the freshness target and how do you hold it? Expected: a 50-file push searchable in under 60 seconds on the 2M line fleet, by re-embedding only changed chunks and recomputing only affected edges.

**Wrong answers, and why they fail**

- "Chunk code every 512 tokens like prose." Fixed windows cut identifiers in half and separate a function from its signature; cut at syntax tree nodes.
- "Re-index the whole fleet on every push." Two million lines per commit never catches up; diff at the symbol level.
- "Citations are optional for code answers." The capstone rejects any claim without a file and line anchor; the post-filter drops or re-asks.

**Related lesson in this course:** [Deep dive 6: RAG and tool use in depth](#aideep-6)

:::

## Every metric is high and one unit still gets wrong answers

*Level 4 (staff) · design · about 15 minutes*

Your RAG eval reports high recall, high MRR, high faithfulness and high answer relevance, and the weekly drift dashboard is flat. Support still forwards a stream of wrong answers from one business unit. As the staff engineer on the system, what do you conclude, and what do you change in the eval program itself?

:::answer Show the answer
:::say Short answer
Conclude that the eval set does not represent that unit's traffic: all four metrics can be high on queries that nobody asks. Add their real queries to the qrels, slice every metric by query class and document type, and check whether their documents are chunked by a splitter that fits their format. Then change the program: tier the qrels, review them on a schedule so they do not rot, and treat a per-slice drop as a release blocker.
:::

**Full answer**

**The row in the table**

The eval lesson ends its diagnosis table with this exact pattern: all four metrics high, users still complain, likely cause an unrepresentative eval set, fix by expanding the qrels with real user queries. A dashboard that tracks the same set every week stays flat for the same reason.

**Why averages hide it**

A 90 percent average recall can hide one query class that always misses. The lesson's rule is to slice the qrels by class, such as literal, paraphrased and multi-topic, and report each slice. The chunking lesson adds the other axis: a query-type-stratified set, because multi-hop queries reveal different winners than factoid queries.

**The changes to the program**

1. **Expand the qrels with that unit's real queries**, labeled by a domain expert with gold ids and answers, as the production capstone does for its golden set of 200 pairs with citations.
2. **Tag every qrel** with query class and document type, and report every metric per slice.
3. **Persist the per-query trace** per run, so that when a complaint arrives you can look up the matching qrel and see whether the eval would have caught it.
4. **Schedule a qrels review.** Gold answers drift as the corpus changes; the lesson schedules a quarterly review.
5. **Lock the chunker in the qrels header**, and check that the splitter in production fits that unit's document format.
6. **Tier the sets**: 20 queries in CI, 200 nightly, 2000 weekly, and make a per-slice drop a release blocker.

**What the dashboard should have shown**

The capstone's drift dashboard tracks retrieval quality weekly and alerts on a 5 percent drop. It can only alert on the traffic it contains. Once the unit's queries are in the set, the same alert starts to mean something for them.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why can every metric be high while the answers are wrong? Expected: the metrics are computed on the eval set, and that set lacks the queries and documents where the failures happen.
- **Level 4:** What is the first concrete change to the qrels? Expected: add that unit's real queries with expert-labeled gold ids and answers, tagged with query class and document type for slicing.
- **Level 4:** How do you keep the qrels honest over time? Expected: a scheduled review, quarterly in the lesson, because gold answers drift as the corpus changes, plus a check that the chunker in the qrels header is the one in production.
- **Level 4:** Why was the drift dashboard flat while quality fell? Expected: it tracks the same unrepresentative set every week; an alert on that set says nothing about traffic it does not contain.

**Wrong answers, and why they fail**

- "The metrics are high, so the complaints are user error." The metrics grade the eval set, not the traffic; the complaints are the missing data.
- "Raise the thresholds." Tighter thresholds on the wrong queries still measure the wrong queries.
- "Replace the eval with a bigger public benchmark." A public set has nothing from that unit; the fix is their real queries, labeled.

:::

## The other jurisdiction's clause reached the answer

*Level 4 (staff) · design · about 15 minutes*

A regulated-domain assistant serves analysts in two jurisdictions from one index. In a red-team probe, a question asked under one jurisdiction returned a contract clause that belongs to the other. The reranker and the generator behave as designed. Where is the leak, how do you close it, and how do you prove that it stays closed?

:::answer Show the answer
:::say Short answer
The leak is in retrieval: the jurisdiction tag was not applied as a pre-filter before the similarity search, so a semantically close chunk from the other jurisdiction entered the candidate pool, and nothing downstream is built to remove it. Close it by tagging every chunk with role and jurisdiction at ingestion and filtering on both before hybrid retrieval runs. Prove it with a cross-jurisdiction probe set in the red-team suite, scored pass or fail with a severity, and run before every release.
:::

**Full answer**

**Why downstream stages cannot save you**

The reranker orders the candidates it receives by relevance, and the leaked clause is relevant. The generator cites what it is given. The output guard scrubs personal data and blocks forbidden topics; it does not know which jurisdiction a clause belongs to. Access control has to happen before the text reaches the prompt, and the only stage that sees the whole corpus is retrieval.

**The capstone order**

Filter by role and jurisdiction first. Then run dense and BM25 retrieval in parallel, fuse by rank, send the top 20 to the reranker, the top 5 to the generator, then the guards, then cite and return. The tags come from ingestion, where each chunk receives a summary, a role label and a jurisdiction tag.

**Closing it**

1. Tag at ingestion, and make ingestion refuse a chunk that has no tag.
2. Filter before retrieval, not on the top k after it; a post-filter can leave an empty result and still lets an untagged chunk through.
3. Treat the caller's jurisdiction as a request parameter, never as a hint in the prompt.

**Proving it**

The capstone runs a pre-release red team of 50 adversarial prompts that include cross-jurisdiction leaks, scored pass or fail with a severity. Its exercise adds a second corpus slice under another jurisdiction and runs a 20-question cross-jurisdiction probe. Put that probe in the release gate for every change to ingestion or retrieval, and carry the leak count on the drift dashboard as a hard zero.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why can the reranker not catch the leaked clause? Expected: it only orders the candidates it receives, and a clause from the wrong jurisdiction is still relevant to the question.
- **Level 3:** Why is the output guard not the fix? Expected: it scrubs personal data and blocks forbidden topics; it cannot tell which jurisdiction a clause belongs to.
- **Level 4:** The tags exist and the leak persists. What do you check? Expected: whether the filter runs before retrieval or on the top k after it, and whether ingestion lets an untagged chunk in.
- **Level 4:** How do you keep the proof current? Expected: run the probe set in the red team on every change to ingestion or retrieval, and show the leak count on the drift dashboard with a zero threshold.

**Wrong answers, and why they fail**

- "Add a sentence to the system prompt about the user's jurisdiction." The model cannot verify which jurisdiction a chunk belongs to; access control belongs in retrieval.
- "Separate indexes solve it, no tags needed." Role filtering still needs labels, shared documents get duplicated, and the probe is still needed to prove the split holds.
- "The red team passed once, so it is closed." One pass proves one build; the probe runs on every ingestion or retrieval change.

:::
