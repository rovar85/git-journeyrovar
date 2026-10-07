---
track: capstone
title: "Round-up: the map, flashcards and drills for Capstone: lab as code"
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

1. **Gather (fast pass).** Go through lessons 1 to 2 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One lab as code, end to end

The capstone ties tracks together: one description builds the whole lab.

1. **Infrastructure**: Provision machines and networks as code. Lessons: [1](#capstone-1).
2. **Configuration**: Configure them with automation. Lessons: [1](#capstone-1).
3. **Delivery**: Build, test and deploy through a pipeline. Lessons: [1](#capstone-1).
4. **Run and observe**: Containers or Kubernetes plus monitoring and alerts. Lessons: [1](#capstone-1).
5. **Skills plan**: Map what you can do, what is missing, and a learning plan. Lessons: [2](#capstone-2).

**Do this now:** [open the sketch pad for this track](#study/maps/capstone), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_capstone

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Rebuild the lab from zero twice; the second time should be boring.
- Write down every manual step you took; each one is a missing automation.
- Keep a README that a stranger could follow.
- Break something and recover from backups.
- Show the pipeline green and the dashboards live.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Terraform language](https://developer.hashicorp.com/terraform/language)
- [Ansible playbook guide](https://docs.ansible.com/ansible/latest/playbook_guide/index.html)
- [Kubernetes tasks](https://kubernetes.io/docs/tasks/)

## 6. Round 2: make these boring

- Rebuild everything from a clean machine using only your repository.
- Add a failing test and see the pipeline stop the bad change.
- Add one new service end to end (code, container, pipeline, monitoring).
- Present the lab in five minutes.

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
