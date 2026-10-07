---
track: aideep
title: "Round-up: the map, flashcards and drills for AI and agents: deep dive"
short: Round-up
sub: One end-to-end map, flashcards made from every lesson, the tips nobody tells you, the few pages worth reading, and what to drill in round 2.
roundup: true
---

:::goals
- hold the whole track on **one map** and place every topic on it
- run the **gather, refine, drill, round 2** loop on this track
- drill the track's **flashcards** and the long procedures until they are boring
- know **which one to three documentation pages** to open, instead of reading everything
:::

## 1. The loop, for this track

1. **Gather (fast pass).** Go through lessons 1 to 14 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One model, with the maths and code behind each hop

The deep-dive companions: each lesson opens one hop of the AI map with runnable code.

1. **Probabilities**: Logits, softmax, sampling, cross-entropy, perplexity. Lessons: [1](#aideep-1).
2. **Transformer**: BPE, embeddings, positions, attention by hand, context cost. Lessons: [2](#aideep-2).
3. **Learning**: Gradient descent, scaling arithmetic, data quality. Lessons: [3](#aideep-3).
4. **Post-training**: Chat format, reward models, DPO, honest evaluation. Lessons: [4](#aideep-4).
5. **Prompting and RAG**: Prompt anatomy, validation, retrieval metrics, tools. Lessons: [5](#aideep-5), [6](#aideep-6).
6. **Agents**: Loop, state, patterns, evaluation harness, MCP. Lessons: [7](#aideep-7), [8](#aideep-8), [9](#aideep-9), [10](#aideep-10).
7. **Engineering**: Build, test, trace, secure and operate an agent; design and defend. Lessons: [11](#aideep-11), [12](#aideep-12), [13](#aideep-13), [14](#aideep-14).

**Do this now:** [open the sketch pad for this track](#study/maps/aideep), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_aideep

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Run each script, then change one number and predict the result before you rerun.
- Do the 'Practice' answers last, after writing yours.
- Keep a glossary of every symbol (d_model, d_k, temperature).
- When a formula is confusing, compute it with tiny numbers by hand.
- Link each deep dive back to its overview chapter and write one sentence of what it added.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [LoRA](https://arxiv.org/abs/2106.09685)
- [Chinchilla scaling laws](https://arxiv.org/abs/2203.15556)

## 6. Round 2: make these boring

- Re-derive softmax with temperature and cross-entropy by hand.
- Implement attention from scratch without looking.
- Explain DPO in four sentences.
- Build and run a small evaluation harness for any prompt.

:::try Your turn
1. Without opening the lessons, write the map for this track on one page. Then compare it with section 2 and mark the hops you forgot.
2. Drill this track's flashcards until nothing is "Again", then switch the mode to **Round 2: missed cards**.
3. Pick the longest procedure in the track and do it from a blank terminal against the clock. Repeat until it is dull.
:::

:::recap
- One **map** holds the whole track; every topic is a hop on it.
- The loop is **gather, refine, drill, round 2**: fast pass, compact map and cards, repetition, then only the hard parts again.
- **Flashcards** come from the lessons; the schedule brings back what you miss.
- Learn **one to three pages** of a new tool's documentation, and drill the **long procedures** until they are boring.
:::
