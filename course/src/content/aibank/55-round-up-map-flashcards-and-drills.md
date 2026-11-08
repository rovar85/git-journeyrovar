---
track: aibank
title: "Round-up: the map, flashcards and drills for AI engineering interview bank (460+ questions, 60 incident scenarios)"
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

1. **Gather (fast pass).** Go through lessons 1 to 54 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One AI interview answer, from the concept to the evidence

Interview questions in this bank test four things: you know the concept, you can estimate with numbers, you can read evidence, and you can design and explain trade-offs.

1. **Foundations**: Math, deep learning, the transformer, tokenisation and decoding: be able to derive and estimate, not only define. Lessons: [2](#aibank-2), [3](#aibank-3), [4](#aibank-4), [5](#aibank-5), [6](#aibank-6), [7](#aibank-7), [8](#aibank-8), [9](#aibank-9).
2. **Models**: Post-training, inference and serving, GPU memory and quantisation: prefill and decode, KV cache, batching, memory arithmetic. Lessons: [10](#aibank-10), [11](#aibank-11), [12](#aibank-12), [13](#aibank-13), [14](#aibank-14), [15](#aibank-15).
3. **Applications**: RAG, prompting and structured output, evaluation, multimodal: measure before you tune. Lessons: [16](#aibank-16), [17](#aibank-17), [18](#aibank-18), [19](#aibank-19), [20](#aibank-20), [21](#aibank-21), [22](#aibank-22), [23](#aibank-23).
4. **Agents**: Agent loops, MCP, A2A and skills, multi-agent systems, sandboxes: tools, state, trust boundaries. Lessons: [24](#aibank-24), [25](#aibank-25), [26](#aibank-26), [27](#aibank-27), [28](#aibank-28), [29](#aibank-29), [30](#aibank-30), [31](#aibank-31), [32](#aibank-32).
5. **Production**: Releases, observability, cost and capacity, safety: how a model service is operated. Lessons: [33](#aibank-33), [34](#aibank-34), [35](#aibank-35), [36](#aibank-36), [37](#aibank-37), [38](#aibank-38).
6. **Rounds**: System design, coding and behavioural rounds: structure your answer, state assumptions and trade-offs. Lessons: [39](#aibank-39), [40](#aibank-40), [41](#aibank-41), [42](#aibank-42), [43](#aibank-43), [44](#aibank-44).
7. **Incidents**: Read the evidence first, form a hypothesis, find the root cause, then say what you would change. Lessons: [45](#aibank-45), [46](#aibank-46), [47](#aibank-47), [48](#aibank-48), [49](#aibank-49), [50](#aibank-50), [51](#aibank-51), [52](#aibank-52), [53](#aibank-53), [54](#aibank-54).

**Do this now:** [open the sketch pad for this track](#study/maps/aibank), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_aibank

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Cover the answer, say yours, then open it. Note the wrong answers: interviewers hear them often.
- Do levels 1 and 2 for your target topics first, then 3; level 4 is for staff-level interviews.
- For estimation questions, write the formula and units before the numbers.
- For incident scenarios, read every listing before forming a hypothesis, and say what evidence would change your mind.
- Re-derive the key formulas (attention cost, KV cache size, memory per parameter) until you can do them on a whiteboard.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Source repository (MIT licence)](https://github.com/rohitg00/ai-engineering-from-scratch)
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [vLLM documentation](https://docs.vllm.ai/)

## 6. Round 2: make these boring

- Redo the questions you missed, then answer the follow-ups out loud.
- Pick five estimation questions and solve them on paper without the answer.
- Take two incident scenarios and write the root cause in three sentences each before opening the walkthrough.
- Pair a system-design question with an incident scenario from the same system and tell them as one story.

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
