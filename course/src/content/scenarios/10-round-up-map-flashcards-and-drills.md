---
track: scenarios
title: "Round-up: the map, flashcards and drills for Interview scenarios: troubleshoot and design (9 questions)"
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

## 2. The map: One troubleshooting method for scenario questions

Scenario questions reward a method, not a guess. The same loop solves all nine.

1. **Define the symptom**: What exactly fails, for whom, since when, what changed? Lessons: [9](#scenarios-9).
2. **Draw the path**: List the components the request crosses (DNS, Service, Endpoints, pod, policy; or code, state, reality). Lessons: [2](#scenarios-2), [5](#scenarios-5).
3. **Split the path**: Test at the middle: bypass a layer to find which half is broken. Lessons: [2](#scenarios-2), [3](#scenarios-3).
4. **Read the evidence**: Events, conditions, plans, traces: let the system say why (describe, plan, logs). Lessons: [4](#scenarios-4), [6](#scenarios-6).
5. **Fix the cause**: Change the smallest thing that explains the evidence; avoid fixing symptoms. Lessons: [1](#scenarios-1), [7](#scenarios-7).
6. **Verify and prevent**: Measure the fix, add a guardrail, test, alert or runbook. Lessons: [7](#scenarios-7), [8](#scenarios-8).

**Do this now:** [open the sketch pad for this track](#study/maps/scenarios), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_scenarios

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- State the model before the commands: how it should work, then where it deviates.
- Bypass one layer at a time (pod IP instead of Service, plan instead of apply, curl instead of the browser).
- Read 'Events' and 'Conditions' first; Kubernetes and Terraform usually tell you why.
- Never apply or restart to 'see what happens' in production.
- Close with prevention: a test, an alert or a policy so it cannot recur.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Kubernetes: debug applications](https://kubernetes.io/docs/tasks/debug/debug-application/)
- [Kubernetes: debug clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
- [Terraform: refresh-only and drift](https://developer.hashicorp.com/terraform/cli/commands/plan)

## 6. Round 2: make these boring

- Recreate each scenario from scratch on the lab without looking, then explain the fix.
- Mix them: break two things at once and separate them with the method.
- Teach one scenario to someone else in five minutes.
- Time yourself on the triage ladder for S2 and S6.

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
