---
track: ai
title: "Round-up: the map, flashcards and drills for AI and agents"
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

## 2. The map: One question, from prompt to agent

Follow a request through a language model, then through the loop that makes it an agent.

1. **Tokens and embeddings**: Text becomes tokens, then vectors that carry meaning. Lessons: [1](#ch1), [2](#ch2).
2. **Model**: A Transformer predicts the next token from the whole context using attention. Lessons: [2](#ch2).
3. **Training**: Pre-training learns language; fine-tuning and preference tuning shape behaviour. Lessons: [3](#ch3), [4](#ch4).
4. **Prompting**: Instructions, examples and context steer the model without changing weights. Lessons: [5](#ch5).
5. **Knowledge and tools**: Retrieval adds facts; tools let it act; both fix a model's weaknesses. Lessons: [6](#ch6).
6. **Agent loop**: Observe, decide, act, repeat, with memory, budgets and stop conditions. Lessons: [7](#ch7), [8](#ch8).
7. **Evaluate**: Test cases, trajectories, pass@k, cost; do not trust demos. Lessons: [9](#ch9).
8. **Connect, secure, ship**: MCP, safety against injection, production architecture, design and defend. Lessons: [10](#ch10), [11](#ch11), [12](#ch12), [13](#ch13), [14](#ch14).

**Do this now:** [open the sketch pad for this track](#study/maps/ai), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_ai

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Write the evaluation before the agent; a test set of 20 real cases beats opinions.
- Treat all model output as untrusted input: validate before acting.
- Start with the simplest thing that could work (a prompt, then a workflow, then an agent).
- Log every model call with inputs, outputs, tokens and cost; you cannot debug what you cannot see.
- Keep a budget (steps, tokens, money) and a human approval step for risky actions.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## 6. Round 2: make these boring

- Explain next-token prediction, attention and temperature to a friend without jargon.
- Build a tiny agent with a step budget and three tools, and write ten tests for it.
- Attack your own agent with a prompt injection and fix it.
- Defend your design in five minutes against the review-board questions.

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
