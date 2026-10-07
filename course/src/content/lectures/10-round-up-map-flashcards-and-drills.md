---
track: lectures
title: "Round-up: the map, flashcards and drills for LLM lectures notebook (CME 295, lectures 1 to 9)"
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

1. **Gather (fast pass).** Go through lessons 1 to 9 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One LLM, from tokens to evaluation and trends

The nine lectures follow the life of a model: input, architecture, generation, training, alignment, reasoning, tools, evaluation, what is next.

1. **Tokens and attention**: BPE, embeddings, self-attention, the Transformer. Lessons: [1](#lectures-1).
2. **Variants**: RoPE, RMSNorm, pre-norm, GQA, sliding window; BERT, T5, GPT. Lessons: [2](#lectures-2).
3. **Generation**: Decoder-only LLMs, MoE, decoding, prompting, KV cache, speculative decoding. Lessons: [3](#lectures-3).
4. **Training**: Pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT, LoRA. Lessons: [4](#lectures-4).
5. **Alignment**: Reward models, PPO, DPO, reward hacking. Lessons: [5](#lectures-5).
6. **Reasoning**: Thinking chains, verifiable rewards, pass@k, GRPO. Lessons: [6](#lectures-6).
7. **Tools and agents**: RAG, tool calling, ReAct, MCP. Lessons: [7](#lectures-7).
8. **Evaluation**: Kappa, LLM-as-a-judge, factuality, pass^k, benchmarks. Lessons: [8](#lectures-8).
9. **Trends**: Vision transformers, diffusion LLMs, model collapse, small models. Lessons: [9](#lectures-9).

**Do this now:** [open the sketch pad for this track](#study/maps/lectures), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_lectures

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- After each lecture lesson, write the one-page map in your own words, then compare with the lesson.
- Run every script and change a constant; predict the effect first.
- Make flashcards from the 'Interview-style questions' sections.
- Read the cited paper's abstract and one figure, not the whole paper.
- Re-do the lectures a second time with only the quizzes and the practice.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [DPO paper](https://arxiv.org/abs/2305.18290)
- [DeepSeek-R1](https://arxiv.org/abs/2501.12948)

## 6. Round 2: make these boring

- Explain RoPE, GQA and FlashAttention each in two sentences.
- Draw the training pipeline and mark where PPO, DPO and GRPO fit.
- Derive the pass@k estimator.
- Design an LLM-judge evaluation with its biases and mitigations.

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
