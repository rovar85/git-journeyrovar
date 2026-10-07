---
track: terraform
title: "Round-up: the map, flashcards and drills for Terraform"
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

1. **Gather (fast pass).** Go through lessons 1 to 7 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One plan, from code to real infrastructure

Terraform compares code, state and reality. Everything you learn hangs from that triangle.

1. **Configuration**: HCL blocks: providers, resources, variables, outputs, locals. Lessons: [1](#terraform-1), [2](#terraform-2).
2. **Init**: Downloads providers and modules and sets the backend; lock file pins versions. Lessons: [1](#terraform-1).
3. **Graph**: References create dependencies; count/for_each create many; depends_on for hidden ones. Lessons: [3](#terraform-3).
4. **Plan**: Refresh, compare code with state, show create/update/replace/destroy. Lessons: [1](#terraform-1), [6](#terraform-6).
5. **Apply**: Executes the plan, records results; locking prevents two writers. Lessons: [1](#terraform-1), [4](#terraform-4).
6. **State**: The map from code to real objects: remote backend, locking, import, moved, drift. Lessons: [4](#terraform-4).
7. **Modules**: Reusable units with inputs and outputs; version and test them. Lessons: [5](#terraform-5).
8. **Workflow and cloud patterns**: fmt/validate/test, CI plan on PR, apply the saved plan, multi-environment layouts. Lessons: [6](#terraform-6), [7](#terraform-7).

**Do this now:** [open the sketch pad for this track](#study/maps/terraform), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_terraform

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- terraform plan -out=tfplan then terraform apply tfplan: apply exactly what was reviewed.
- terraform console evaluates expressions; terraform state list/show tells you what Terraform believes exists.
- Read replacement warnings ('must be replaced', 'forces replacement') before typing yes, every time.
- Never edit state by hand; use terraform state mv/rm, moved blocks and import blocks.
- Commit .terraform.lock.hcl; pin module and provider versions; keep secrets out of variables files in Git.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Terraform language](https://developer.hashicorp.com/terraform/language)
- [CLI commands](https://developer.hashicorp.com/terraform/cli/commands)
- [State](https://developer.hashicorp.com/terraform/language/state)

## 6. Round 2: make these boring

- Draw code, state and reality on paper and mark what each command reads and writes.
- Cause drift, a replacement, a dependency error and a state lock, and fix each (see the scenarios track).
- Turn a copy-pasted configuration into a module with validated inputs and a test.
- Explain what happens if two people run apply at once, and how to prevent it.

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
