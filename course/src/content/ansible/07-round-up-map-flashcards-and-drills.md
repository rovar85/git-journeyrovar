---
track: ansible
title: "Round-up: the map, flashcards and drills for Ansible"
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

1. **Gather (fast pass).** Go through lessons 1 to 6 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One playbook run, from inventory to changed hosts

Ansible describes the desired state; each topic is a part of how it reaches it.

1. **Inventory**: Which hosts, in which groups, with which variables. Lessons: [1](#ansible-1).
2. **Connection**: SSH, users, become (sudo); ansible -m ping proves the path. Lessons: [1](#ansible-1).
3. **Modules and tasks**: Idempotent modules (package, service, copy, template) describe state, not commands. Lessons: [1](#ansible-1), [2](#ansible-2).
4. **Playbooks**: Plays map groups to tasks; handlers react to changes; check mode previews. Lessons: [2](#ansible-2).
5. **Variables and templates**: Precedence, facts, Jinja2 templates, conditionals and loops. Lessons: [3](#ansible-3).
6. **Roles**: Reusable, structured bundles of tasks, defaults, templates. Lessons: [4](#ansible-4).
7. **Vault and secrets**: Encrypt sensitive vars; keep keys out of Git. Lessons: [5](#ansible-5).
8. **Real-world use**: Tags, limits, serial rollouts, testing, running from CI. Lessons: [6](#ansible-6).

**Do this now:** [open the sketch pad for this track](#study/maps/ansible), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_ansible

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Use --check --diff before changing anything real; idempotent playbooks report changed=0 on the second run.
- ansible-doc MODULE shows module options and examples offline; you rarely need a browser.
- Prefer modules over shell/command; if you must, add creates/changed_when so it stays idempotent.
- -vvv shows the SSH command and the module arguments: the answer to 'why did it do that'.
- Limit blast radius with --limit host and serial: 1 for rolling changes.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Playbook guide](https://docs.ansible.com/ansible/latest/playbook_guide/index.html)
- [Builtin modules](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/index.html)
- [Vault guide](https://docs.ansible.com/ansible/latest/vault_guide/index.html)

## 6. Round 2: make these boring

- Take a manual server setup you know and turn it into a role with defaults, a template and a handler.
- Run it twice and prove idempotency; then change one variable and read the diff.
- Encrypt a secret with vault and use it in a template without printing it.
- Break the connection (wrong user, key, become) and diagnose from the error.

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
