---
track: cloud
title: "Round-up: the map, flashcards and drills for Cloud fundamentals"
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

1. **Gather (fast pass).** Go through lessons 1 to 3 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One workload, from account to production

The shared responsibility stack: you move up or down it when you choose IaaS, PaaS or serverless.

1. **Account and organisation**: Accounts, subscriptions, regions, billing and guardrails. Lessons: [1](#cloud-1).
2. **Identity**: Users, roles, policies, least privilege, short-lived credentials. Lessons: [2](#cloud-2).
3. **Network**: Virtual networks, subnets, security groups, gateways, private connectivity. Lessons: [2](#cloud-2).
4. **Compute**: VMs, containers, serverless: who patches what. Lessons: [1](#cloud-1), [3](#cloud-3).
5. **Storage and data**: Object, block, file, databases; durability vs availability. Lessons: [1](#cloud-1), [3](#cloud-3).
6. **Operate**: Monitoring, backup, cost control, automation, resilience across zones and regions. Lessons: [3](#cloud-3).

**Do this now:** [open the sketch pad for this track](#study/maps/cloud), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_cloud

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Draw the shared-responsibility line for every service you use: what is the provider's job, what is yours?
- Never use the root account day to day; use roles, MFA and short-lived credentials.
- Tag every resource with owner, environment and cost centre on day one.
- Prefer managed services unless you have a reason; operations is the expensive part.
- Set budgets and alerts before you create anything.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [AWS Well-Architected](https://aws.amazon.com/architecture/well-architected/)
- [Azure Well-Architected](https://learn.microsoft.com/azure/well-architected/)
- [Google Cloud Architecture Framework](https://cloud.google.com/architecture/framework)

## 6. Round 2: make these boring

- Compare the same three services across two providers in a table.
- Design a two-tier app on paper: network, identity, compute, data, monitoring, cost.
- List five ways an account can be compromised and the control that stops each.
- Then continue with the senior cloud and scenarios tracks.

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
