---
track: seniorqa
title: "Round-up: the map, flashcards and drills for Senior DevOps and SRE questions: 20 design and incident answers"
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

1. **Gather (fast pass).** Go through lessons 1 to 12 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One senior question, from the clarifying question to the follow-up

Every senior design or incident answer follows the same route: clarify, fix the numbers, design, walk the failures, name the trade-offs and say how you will measure.

1. **Map**: Which of the 20 questions are answered where; the six moves of a senior answer. Lessons: [1](#seniorqa-1).
2. **Platform design**: Multi-region availability, zero-downtime upgrades and stateful migration: targets, order of steps, failure modes. Lessons: [2](#seniorqa-2), [3](#seniorqa-3), [4](#seniorqa-4).
3. **Delivery**: GitOps for many teams, a fast pipeline, rollbacks that do not depend on the pipeline, and no config drift. Lessons: [5](#seniorqa-5), [6](#seniorqa-6), [7](#seniorqa-7), [8](#seniorqa-8).
4. **Infrastructure as code**: A half-failed Terraform apply: state, import, taint, locks and restores. Lessons: [9](#seniorqa-9).
5. **Reliability**: Self-healing with bounds, and cascading failures with timeouts, bulkheads and breakers. Lessons: [10](#seniorqa-10), [11](#seniorqa-11).
6. **Incident**: A latency regression after a deploy: confirm, protect users, narrow by endpoint and hop, root-cause. Lessons: [12](#seniorqa-12).

**Do this now:** [open the sketch pad for this track](#study/maps/seniorqa), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_seniorqa

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Say your assumptions and the numbers (availability, RTO, RPO, latency) in the first 30 seconds.
- For any 'rollback' or 'recovery' question, ask what path still works when the normal path is the thing that broke.
- For any 'at scale' question, name who owns what and what limits the blast radius.
- For any incident, stop the harm first, then find the cause.
- Finish with how you would know it works: the metric, the alert, the drill.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Google SRE Book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Argo CD ApplicationSet](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/)
- [Kubernetes: Safely drain a node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)
- [Terraform: import existing resources](https://developer.hashicorp.com/terraform/cli/import)
- [AWS Well-Architected: Reliability pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html)

## 6. Round 2: make these boring

- Pick a question, set a two-minute timer and answer out loud; then check which of the six moves you skipped.
- Change one number in a model (for example the failover time or the retry count) and predict the result before you run it.
- Pair Q16 (cascading failure) with Q19 (latency) and tell them as one incident story.
- Write your own answer to question 20 using the skeleton in lesson 1.

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
