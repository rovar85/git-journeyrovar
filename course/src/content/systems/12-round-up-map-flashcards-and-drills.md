---
track: systems
title: "Round-up: the map, flashcards and drills for Databases and distributed systems for backend engineers"
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

1. **Gather (fast pass).** Go through lessons 1 to 11 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One request, from the client to the disk and back, and everything that can go wrong

Follow a single write through the system. Each hop has one idea that decides whether it is fast, safe and correct.

1. **Client**: A timeout leaves the outcome unknown; retry with backoff and jitter, inside a budget and a deadline. Lessons: [6](#systems-6).
2. **Safe to repeat**: An idempotency key saved atomically with the work turns at-least-once into effectively-once. Lessons: [7](#systems-7).
3. **Fan-out**: Every extra service multiplies the chance of a slow call; hedge and set deadlines to protect p99. Lessons: [5](#systems-5).
4. **Placement**: Hash ring or logical shards decide which machine owns a key; hot shards and resharding are the costs. Lessons: [8](#systems-8), [9](#systems-9).
5. **Replication**: No shared clock; leader-follower lag; quorums R+W>N; consensus needs a majority. Lessons: [4](#systems-4), [8](#systems-8).
6. **The database**: Pages, B-trees and a buffer pool; indexes only help when the query can use them. Lessons: [2](#systems-2), [3](#systems-3).
7. **Correctness**: Name the consistency model; test for stale reads and write skew under failure. Lessons: [10](#systems-10).
8. **Write it down**: A design doc with testable goals, non-goals, real options and a rollback plan. Lessons: [11](#systems-11).

**Do this now:** [open the sketch pad for this track](#study/maps/systems), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_systems

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- For any slow query: read the plan first, then ask how many rows are read versus returned.
- For any retry: ask what happens if the first attempt actually succeeded.
- For any 'it is eventually consistent': ask what a reader sees in the meantime and who is hurt by it.
- For any fan-out: compute 1 - (1 - p)^n before you build it.
- Write the design doc's non-goals first; they stop most scope arguments.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [CMU 15-445 Database Systems](https://15445.courses.cs.cmu.edu/)
- [Use The Index, Luke](https://use-the-index-luke.com/)
- [Dynamo paper](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
- [Jepsen analyses](https://jepsen.io/analyses)

## 6. Round 2: make these boring

- Re-run the retry simulation with a different capacity and explain why jitter helped or did not.
- Pick a table you know, list its queries, and say which index each one needs.
- Explain R + W > N, vector clocks and Merkle trees in two sentences each.
- Write a one-page design doc for a rate limiter and have someone answer the review questions.

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
