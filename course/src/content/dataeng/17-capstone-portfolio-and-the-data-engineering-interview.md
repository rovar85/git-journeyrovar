---
track: dataeng
title: "Capstone, portfolio and the data engineering interview"
short: Capstone and interview
sub: One end-to-end project built in six milestones from the lessons of this track, how to present it, what each career level is expected to do, and the interview rounds with answers to say.
---

:::goals
- build one end-to-end pipeline that uses every stage of this track
- present it as a portfolio project that an interviewer can run in five minutes
- know what junior, mid-level and senior data engineers are expected to do
- prepare for the SQL, Python, modelling, system-design and behavioural rounds
:::

## The capstone: a small analytics platform for a shop

Build it in a Git repository, one milestone at a time. Each milestone reuses a lesson's code; the work is joining them into one system.

**Milestone 1. Ingest (lessons 2, 6, 9).** Write an extractor that pulls orders from an API with pagination, retries and an `updated_at` cursor, and stores the **raw** responses as JSON Lines in `data/raw/orders/day=YYYY-MM-DD/`. Use the local API from [lesson 6](#dataeng-6), or a free public API of your choice. Add a second source: a customers CSV.

**Milestone 2. Store (lesson 7).** Convert raw files to **Parquet**, partitioned by day, in `data/clean/`. Record the row counts.

**Milestone 3. Load and model (lessons 4, 8, 10).** Load into a database (SQLite or DuckDB locally; PostgreSQL in Docker if you want more realism). Build `dim_customer` (type 2), `dim_date`, `dim_product` and `fact_sales`. Loads are **incremental and idempotent**: running the pipeline twice changes nothing.

**Milestone 4. Transform and test (lessons 11, 15).** Write the transformations as SQL models with staging, intermediate and mart layers (real dbt with the DuckDB adapter, or the mini runner from [lesson 15](#dataeng-15)). Add tests: unique and not-null keys, accepted values, relationships, a reconciliation of the mart total against the raw total, and a freshness check.

**Milestone 5. Orchestrate (lesson 12).** One command runs everything for a given date: `python -m pipeline.run --date 2026-03-05`. Tasks run in dependency order with retries; a failed quality check stops publishing. Add a backfill command for a date range. (Optional: the same DAG in Airflow or Dagster.)

**Milestone 6. Make it production-shaped (lesson 16).** Unit tests, a `Dockerfile`, a CI workflow that runs linters and tests on every push, structured logs with row counts, masked personal data, and a README.

**Stretch goals:** a dashboard on the mart (Metabase, Streamlit or a notebook); a streaming path where events go through a queue and a consumer upserts them ([lesson 14](#dataeng-14)); deployment to a cloud free tier with Terraform ([Terraform](#terraform-1)); a document-loading pipeline for an LLM application ([lesson 9](#dataeng-9)).

### The README an interviewer wants

1. **One paragraph:** what it does and for whom.
2. **An architecture diagram:** sources, raw, clean, warehouse, marts, orchestrator.
3. **How to run it** in three commands, with sample data included.
4. **Design decisions and trade-offs:** why incremental by cursor, why type 2 for customers, why these tests, what you would change at 100 times the data.
5. **What breaks and how you know:** the checks, the alerts, how to backfill.

A small project that runs, is tested and explains its decisions beats a large one that needs an hour of setup. Be ready to walk through one failure you hit and how you fixed it.

## What each level is expected to do

| Level | Expected | How to show it |
|---|---|---|
| **Junior** | Solid SQL and Python; builds a task of a pipeline from a clear description; writes tests; asks good questions | the capstone; clean code; correct SQL under time pressure |
| **Mid-level** | Owns a pipeline end to end: design, build, monitor, fix; models data; handles incidents; estimates work | stories of pipelines you ran and incidents you resolved |
| **Senior** | Designs systems for several teams; chooses tools with trade-offs and cost in mind; sets standards (testing, contracts, quality); mentors; says no to complexity | design discussions, decisions with numbers, the outcomes for the business |

The move from each level to the next is less about new tools and more about **scope and judgement**: from a task, to a pipeline, to a platform.

## The interview rounds

### 1. SQL (always)

Expect joins, aggregation, window functions, de-duplication, top N per group, running totals, gaps and sessions, and "find what is wrong with this query". Practise by writing the query, then checking row counts. Lessons [3](#dataeng-3) and [4](#dataeng-4) cover the patterns.

:::answer Find the second highest amount per customer.
`WITH r AS (SELECT *, DENSE_RANK() OVER (PARTITION BY customer ORDER BY amount DESC) AS rk FROM orders) SELECT customer, amount FROM r WHERE rk = 2;` Use `DENSE_RANK` so ties for first place do not hide the second value; say what you return when a customer has only one amount (no row).
:::

:::answer Find customers who ordered on three consecutive days.
De-duplicate to one row per customer and day. Then number the days per customer with `ROW_NUMBER()` and subtract that number of days from the date: consecutive days give the same result ("gaps and islands"). Group by customer and that value and keep groups with `COUNT(*) >= 3`.
:::

:::answer A report's revenue doubled after you added a join. Why?
The joined table is not unique on the join key, so each order row matched several rows and was counted several times. Check uniqueness of the key on the "one" side, de-duplicate or aggregate before joining, and compare row counts before and after.
:::

### 2. Python

Parsing and cleaning files, dictionaries and grouping, generators, error handling, simple algorithms, and calling an API. Lessons [2](#dataeng-2) and [6](#dataeng-6). Say your assumptions, write small functions, and test with an edge case before you say you are done.

### 3. Data modelling

"Design the tables for a ride-sharing app's analytics." State the grain first, then facts, dimensions, keys, history and the top three queries the model must answer. [Lesson 10](#dataeng-10).

### 4. System design

"Design a pipeline that ingests 500 million events a day and powers a dashboard within five minutes." Use the six moves from the [senior questions track](#seniorqa-1): clarify (volume, latency, consumers, correctness needs), state numbers, give the simplest design (ingest, store, process, serve), walk the failures (duplicates, late data, schema change, a failed run, backfill), name the trade-offs (batch or streaming, cost or latency), and say how you would monitor it. Do the arithmetic: 500 million a day is about 5,800 events per second on average; ask about the peak.

### 5. Behavioural

Prepare three true stories, each two minutes: a pipeline you built or improved, a data incident (wrong or late data) and what you changed afterwards, and a disagreement about a design. Structure: situation, your action, result with a number, what you learned.

## Answers to say

## What is the difference between a data lake, a data warehouse and a lakehouse?

:::say
A data lake stores any files cheaply in object storage, with no transactions. A warehouse stores structured tables with a managed engine, transactions and fast SQL. A lakehouse keeps open file formats such as Parquet in object storage and adds a table format like Delta or Iceberg for transactions, updates and time travel, so one copy of the data serves both SQL analytics and data science.
:::

## How do you design a pipeline that is safe to re-run?

:::say
Every task is idempotent and parameterised by the run date. Loads are upserts on a business key or replace a whole partition, inside a transaction together with the marker that says the batch is done. I keep raw data so I can rebuild, and I can re-run from the failed task or backfill a date range without creating duplicates.
:::

## How do you handle late-arriving data?

:::say
I process by event time, not arrival time. In batch I re-process a sliding window of recent days, or re-run the affected partitions when late data lands. In streaming I use watermarks with an allowed lateness and send very late events to a side output that a batch job reconciles. I tell consumers which recent periods can still change.
:::

## A daily pipeline that took one hour now takes five. What do you check?

:::say
First what changed: data volume, the code, the schedule or the cluster. Then where the time goes, stage by stage: a full scan where partition pruning stopped working, a join that now multiplies rows or shuffles a skewed key, many small files, a missing incremental filter so it reprocesses history, or waiting for resources. I compare the query plans and row counts of a fast and a slow run, fix the cause, and add a duration alert.
:::

## Batch or streaming for a new use case: how do you decide?

:::say
I ask how fresh the data must be for the decision it supports and what a delay costs. If minutes to hours is fine I use batch or micro-batch because it is simpler to build, test and backfill. I choose streaming when the value is in seconds, and then plan for ordering, duplicates, late data and continuous operation.
:::

## Where to go next

- **Books:** *Fundamentals of Data Engineering* (Joe Reis and Matt Housley) for the whole field; *The Data Warehouse Toolkit* (Ralph Kimball and Margy Ross) for modelling; *Designing Data-Intensive Applications* (Martin Kleppmann) for the systems underneath, which pairs with the [systems track](#systems-1).
- **A free, project-based course:** the [Data Engineering Zoomcamp by DataTalks.Club](https://github.com/DataTalksClub/data-engineering-zoomcamp), which covers Docker, Terraform, a warehouse, dbt, Spark and Kafka with real tools.
- **This course:** [Docker](#docker-1), [Kubernetes](#kubernetes-1), [Terraform](#terraform-1), [Cloud](#cloud-1) and [Monitoring](#monitoring-1) for the platform side; the [AI tracks](#aideep-1) if you move towards data for machine learning.
- **A cloud certification** can help a first application get noticed, but a working project and strong SQL count for more in the interview.

:::recap
- Build **one end-to-end project**: ingest, store, model, transform and test, orchestrate, productionise.
- The README shows **architecture, how to run, decisions and trade-offs, failure handling**.
- Levels grow by **scope and judgement**: task, pipeline, platform.
- Interviews: **SQL always**, then Python, modelling, system design and behavioural stories.
:::

```quiz
? What makes a portfolio project convincing?
+ It runs in a few commands, is tested, and the README explains the design decisions and trade-offs
- It uses as many tools as possible
- It has the largest dataset
- It has no documentation so the code speaks for itself
! Interviewers look for judgement and working software.

? In a system-design interview, what should you do first?
+ Ask clarifying questions about volume, latency and consumers, and state your assumptions
- Draw Kafka and Spark immediately
- Name the most expensive tools
- Start writing SQL
! The requirements decide the design.

? 500 million events a day is roughly how many per second on average?
+ About 5,800
- About 58
- About 580,000
- About 5 million
! 500,000,000 / 86,400 is about 5,787.
```
