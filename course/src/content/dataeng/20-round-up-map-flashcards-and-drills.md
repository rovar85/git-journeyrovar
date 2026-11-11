---
track: dataeng
title: "Round-up: the map, flashcards and drills for Data engineering: from beginner to professional"
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

1. **Gather (fast pass).** Go through lessons 1 to 19 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One order, from the source system to the dashboard

Follow one record through a data platform. Each hop has one idea that decides whether the number on the dashboard is right and on time.

1. **Path**: The five stages and how to study. Lessons: [1](#dataeng-1).
2. **Languages**: Python from variables to classes, then reading messy files safely; SQL to ask and transform: joins, windows, de-duplication, upserts. Lessons: [2](#dataeng-2), [3](#dataeng-3), [4](#dataeng-4), [5](#dataeng-5), [6](#dataeng-6).
3. **Get and store**: pandas for tables in memory, APIs with pagination and retries, Parquet for analytics. Lessons: [7](#dataeng-7), [8](#dataeng-8), [9](#dataeng-9).
4. **Pipeline**: Incremental, idempotent, observable loads; write dispositions, schema contracts and backfills. Lessons: [10](#dataeng-10), [11](#dataeng-11).
5. **Model and trust**: Facts, dimensions and history; checks on every load; write, audit, publish. Lessons: [12](#dataeng-12), [13](#dataeng-13).
6. **Run**: A DAG with retries, re-runs and backfills, parameterised by date. Lessons: [14](#dataeng-14).
7. **Scale**: Partitions, shuffles and skew; logs, offsets and windows; the warehouse, ELT and dbt. Lessons: [15](#dataeng-15), [16](#dataeng-16), [17](#dataeng-17).
8. **Professional**: Tests, containers, CI, monitoring, cost and privacy; the capstone and the interview. Lessons: [18](#dataeng-18), [19](#dataeng-19).

**Do this now:** [open the sketch pad for this track](#study/maps/dataeng), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_dataeng

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- For any pipeline: what happens if it runs twice, and what happens if it crashes halfway?
- For any join: which side is unique on the key? Compare row counts before and after.
- For any number that looks wrong: trace the lineage backwards and compare counts at each step.
- For any slow job: read less, shuffle less, then look for skew.
- For any new tool: which of the ideas in this track does it automate?

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [PostgreSQL tutorial: window functions](https://www.postgresql.org/docs/current/tutorial-window.html)
- [pandas: 10 minutes to pandas](https://pandas.pydata.org/docs/user_guide/10min.html)
- [Apache Parquet documentation](https://parquet.apache.org/docs/)
- [Apache Airflow: core concepts](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/index.html)
- [dbt documentation](https://docs.getdbt.com/)
- [Apache Spark: SQL performance tuning](https://spark.apache.org/docs/latest/sql-performance-tuning.html)
- [Data Engineering Zoomcamp (DataTalks.Club)](https://github.com/DataTalksClub/data-engineering-zoomcamp)

## 6. Round 2: make these boring

- Rewrite the keep-the-latest-row query and the upsert from memory, then run them.
- Run the ETL pipeline twice and explain, line by line, why the second run changes nothing.
- Explain a shuffle, skew and salting to someone in two minutes.
- Take the stream model and say what at-most-once would lose.
- Do milestone 1 of the capstone today.

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
