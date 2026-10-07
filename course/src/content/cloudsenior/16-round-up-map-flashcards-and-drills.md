---
track: cloudsenior
title: "Round-up: the map, flashcards and drills for Senior cloud engineer: the 15 interview questions"
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

1. **Gather (fast pass).** Go through lessons 1 to 15 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One answer structure for senior cloud questions

Every senior question wants the same shape: clarify, frame, design, trade off, prove, prevent.

1. **Clarify**: Requirements, constraints, RTO/RPO, budget, compliance, who owns it. Lessons: [1](#cloudsenior-1), [2](#cloudsenior-2).
2. **Frame**: Name the principle (resilience, least privilege, build once deploy many, governance as platform). Lessons: [3](#cloudsenior-3), [4](#cloudsenior-4), [13](#cloudsenior-13).
3. **Design**: Accounts and networks, data, compute choice, pipelines, security, observability. Lessons: [3](#cloudsenior-3), [6](#cloudsenior-6), [8](#cloudsenior-8), [10](#cloudsenior-10).
4. **Trade off**: Cost vs availability, speed vs control, build vs buy; say what you give up. Lessons: [2](#cloudsenior-2), [5](#cloudsenior-5), [7](#cloudsenior-7).
5. **Prove**: Tests, drills, metrics, SLOs, a worked example or a real incident. Lessons: [9](#cloudsenior-9), [12](#cloudsenior-12).
6. **Prevent and improve**: Automation, guardrails, post-incident learning, standards and ADRs. Lessons: [9](#cloudsenior-9), [14](#cloudsenior-14), [15](#cloudsenior-15).

**Do this now:** [open the sketch pad for this track](#study/maps/cloudsenior), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_cloudsenior

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Open with the requirements you assume and ask one clarifying question; seniors scope first.
- Always give trade-offs: 'I chose X because Y; the cost is Z; I would revisit if W'.
- Use your own real story for Q9 and Q15; these lessons give the structure, not your experience.
- Quantify: RTO/RPO, error budgets, cost per month, burn rate: numbers signal seniority.
- End each answer with how you would detect failure and how you would improve next time.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [AWS Well-Architected](https://aws.amazon.com/architecture/well-architected/)
- [Google SRE workbook](https://sre.google/workbook/table-of-contents/)
- [FinOps Framework](https://www.finops.org/framework/)

## 6. Round 2: make these boring

- Answer each question out loud in under two minutes, then under five, recording yourself.
- For each answer write the follow-up you fear most and answer it.
- Pair a design question with a scenario from the scenarios track and tell them as one story.
- Keep a one-page 'my real examples' sheet: incident, migration, cost saving, standard.

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
