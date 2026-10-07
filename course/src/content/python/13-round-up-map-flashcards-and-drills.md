---
track: python
title: "Round-up: the map, flashcards and drills for Python for automation"
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

## 2. The map: One program, from idea to tested tool

The coding track builds a tool in layers. Each layer adds one habit that real automation needs.

1. **Run and read**: Variables, types, print, the REPL; read error messages from the last line up. Lessons: [2](#ch16).
2. **Data**: Lists and dictionaries hold the state of a problem; loops and conditions process it. Lessons: [3](#ch17), [4](#ch18).
3. **Functions**: Name a step, pass inputs, return outputs; small functions are testable. Lessons: [5](#ch19).
4. **Errors and data formats**: try/except, validation, JSON in and out; never trust input. Lessons: [6](#ch20).
5. **Classes**: Group state and behaviour (an investigation, a lab) into objects. Lessons: [7](#ch21).
6. **Simulation and diagnosis**: A fake lab plus a loop that observes and decides. Lessons: [8](#ch22).
7. **Tests and measurement**: pytest-style checks, metrics, traces: prove it works and keep proving it. Lessons: [9](#ch23), [10](#ch24).
8. **Real models and tools**: Secrets, APIs, an MCP server, AI-assisted coding: the same habits, bigger scale. Lessons: [11](#ch25), [12](#ch26).

**Do this now:** [open the sketch pad for this track](#study/maps/python), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_python

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Read the traceback from the bottom: the last line is the error, the lines above show the path.
- Use python3 -m venv .venv and pip install -r requirements.txt; never install project packages globally.
- print() is fine; better is a failing test that reproduces the bug, then fix until it passes.
- json.dumps(obj, indent=2) and pprint make unknown data readable; type() and dir() tell you what you hold.
- f-strings with = (f'{x=}') print the name and value together while debugging.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Python tutorial](https://docs.python.org/3/tutorial/)
- [Standard library reference](https://docs.python.org/3/library/)
- [pytest documentation](https://docs.pytest.org/)

## 6. Round 2: make these boring

- Rewrite one lesson's program from memory with a function per step, then add three tests.
- Feed your tool bad input (empty file, wrong types, huge numbers) and make it fail clearly, not mysteriously.
- Add logging and a --dry-run flag to a script that changes things.
- Explain a class you wrote in two sentences: what state, what behaviour.

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
