---
track: sqlprac
title: "Round-up: the map, flashcards and drills for SQL practice: 70 problems with an answer checker"
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

## 2. The map: One SQL answer, from the question to a checked result

Every SQL problem is solved the same way: name the grain, look at the data, build the query in steps, check the edges, check the result.

1. **Practise**: The shop database, the query runner and the checker; a method for any problem. Lessons: [1](#sqlprac-1).
2. **Rows and columns**: SELECT, WHERE, ORDER BY, LIMIT; IN, BETWEEN, LIKE, IS NULL. Lessons: [2](#sqlprac-2).
3. **Summaries**: GROUP BY, HAVING, CASE and conditional aggregation. Lessons: [3](#sqlprac-3).
4. **Combining**: Inner, left, anti and self joins; avoid fan-out by aggregating first. Lessons: [4](#sqlprac-4).
5. **Steps**: Subqueries, EXISTS, CTEs and recursive CTEs. Lessons: [5](#sqlprac-5).
6. **Across rows**: ROW_NUMBER, RANK, running totals, LAG, moving averages, top N per group. Lessons: [6](#sqlprac-6).
7. **Messy values**: Dates, text, COALESCE, pivots and NULL traps. Lessons: [7](#sqlprac-7).
8. **Interview patterns**: Nth highest, duplicates, gaps and islands, retention, median, year to date. Lessons: [8](#sqlprac-8).
9. **Changing data**: INSERT, UPDATE, DELETE, upserts, summary tables and query plans. Lessons: [9](#sqlprac-9).
10. **Under pressure**: Six mixed problems against the clock. Lessons: [10](#sqlprac-10).

**Do this now:** [open the sketch pad for this track](#study/maps/sqlprac), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_sqlprac

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Say what one row of the answer represents before writing anything.
- Check the row count after every join.
- Ties, NULLs and groups with zero are where most wrong answers come from.
- Write long queries as CTE steps and run each step on its own.
- Try for ten minutes before opening a hint, and write your own answer before reading a solution.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [SQLite: SELECT](https://www.sqlite.org/lang_select.html)
- [SQLite: window functions](https://www.sqlite.org/windowfunctions.html)
- [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial.html)
- [SQLite: date and time functions](https://www.sqlite.org/lang_datefunc.html)

## 6. Round 2: make these boring

- Redo every problem you needed the solution for, a day later, without looking.
- Solve 8.4 (three days in a row) and 6.3 (top earner per department) from a blank file in under ten minutes each.
- Rewrite 5.4 with a window function instead of a correlated subquery.
- Pick any three problems and explain your solution out loud as if to an interviewer.

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
