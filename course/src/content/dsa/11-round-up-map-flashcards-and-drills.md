---
track: dsa
title: "Round-up: the map, flashcards and drills for Coding interviews in Python: data structures and algorithms"
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

1. **Gather (fast pass).** Go through lessons 1 to 10 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One coding question, from the brute force to a checked fast answer

Every coding question follows the same route: understand it, work an example, state the brute force, remove the repeated work with the right structure, code it, then test and state the complexity.

1. **Method**: The checker, Big-O, the cost of Python operations, and six steps for any problem. Lessons: [1](#dsa-1).
2. **Lists**: Hash map of what you have seen, two pointers, running best, prefix sums. Lessons: [2](#dsa-2).
3. **Lookups**: Counter, defaultdict, canonical keys, sets for runs, prefix sums with a map. Lessons: [3](#dsa-3).
4. **Windows**: Fixed and variable sliding windows; two pointers on sorted data. Lessons: [4](#dsa-4).
5. **Order of work**: Stacks, monotonic stacks and queues. Lessons: [5](#dsa-5).
6. **Order of data**: Sorting, binary search on values and on answers, heaps. Lessons: [6](#dsa-6).
7. **Nodes**: Linked lists, trees, recursion, depth-first and breadth-first traversal. Lessons: [7](#dsa-7).
8. **Connections**: BFS, shortest paths, topological sort, Dijkstra. Lessons: [8](#dsa-8).
9. **Smaller problems**: Dynamic programming tables and backtracking. Lessons: [9](#dsa-9).
10. **Practice round**: Sessions, top per group, validation, k-way merge, an LRU cache. Lessons: [10](#dsa-10).

**Do this now:** [open the sketch pad for this track](#study/maps/dsa), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_dsa

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Say the brute force and its Big-O before optimising.
- Ask about input size: it tells you which complexity is needed.
- Test the empty input, one item, duplicates and negatives before saying you are done.
- Most speed-ups come from a dictionary, sorting, two pointers, a window, a stack, a heap or a table.
- State the time and memory complexity at the end, unprompted.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Python: time complexity of built-in operations](https://wiki.python.org/moin/TimeComplexity)
- [Python: collections](https://docs.python.org/3/library/collections.html)
- [Python: heapq](https://docs.python.org/3/library/heapq.html)
- [Python: bisect](https://docs.python.org/3/library/bisect.html)

## 6. Round 2: make these boring

- Redo every problem you needed the solution for, a day later, from a blank file.
- Solve 4.2, 5.2 and 8.3 in under 15 minutes each while talking out loud.
- Write 9.3 top-down with functools.lru_cache, then compare with the table version.
- Implement the LRU cache of 10.5 without OrderedDict, using a dict and a doubly linked list.

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
