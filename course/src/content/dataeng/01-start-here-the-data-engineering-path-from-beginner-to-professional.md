---
track: dataeng
title: "Start here: the data engineering path, from beginner to professional"
short: Start here
sub: What a data engineer does, the five stages from first Python script to production pipelines, every lesson at a glance, and how to study.
---

:::goals
- say what a data engineer does and how the job differs from data analyst, data scientist and DevOps
- see the five stages of the path and which lesson covers each skill
- have a study routine: watch, run, break, rebuild, explain
:::

## What a data engineer does

A company's data starts in many places: an application database, payment provider, web clicks, spreadsheets, sensors. A **data engineer** builds and runs the systems that **move that data to one place, clean it, shape it and keep it correct and on time**, so analysts, data scientists, dashboards and AI models can use it.

In one sentence: **a data engineer makes data reliable and available.**

| Role | Main question | Main tools |
|---|---|---|
| Data engineer | "Is the right data in the right place, correct and on time?" | Python, SQL, pipelines, warehouses, orchestration |
| Data analyst | "What happened, and why?" | SQL, dashboards, spreadsheets |
| Data scientist / ML engineer | "What will happen? Can a model decide?" | Statistics, ML, notebooks |
| DevOps / platform engineer | "Does the software run reliably?" | Linux, containers, CI/CD, cloud |

Data engineering sits between software engineering and analytics: you write code like a developer, think in tables like an analyst, and run systems like an operator. That is why the rest of this course (Linux, Git, Docker, cloud) is useful to you too.

## The five stages

**Stage 1. Foundations (lessons 2 to 6).** Python from the first variable to classes, Python for messy files, then SQL. SQL is the language of the job; most interviews are won or lost on it.

**Stage 2. Getting and storing data (lessons 7 to 9).** pandas for tables in memory, APIs for getting data from other systems (and building a small one yourself), and file formats (CSV, JSON, Parquet).

**Stage 3. Building pipelines (lessons 10 to 14).** A real extract-transform-load pipeline that is incremental and safe to re-run, loading strategies for nested and changing data, data modelling (star schema), data quality checks, and orchestration (scheduling, retries, backfills).

**Stage 4. Scale (lessons 15 to 17).** How big-data engines work (partitions, shuffles, Spark, the lakehouse), streaming (Kafka ideas), and the warehouse with ELT and dbt.

**Stage 5. Professional practice (lessons 18 and 19).** Running pipelines in production (tests, containers, CI, monitoring, cost, privacy), then a capstone project, a portfolio and the interview.

A realistic pace for someone with a job or studies: **one lesson every two or three evenings**, about three to four months for the whole path, plus the capstone.

## Every lesson at a glance

| Lesson | Topic |
|---|---|
| [2](#dataeng-2) | Python essentials 1: values, text, collections, decisions and loops |
| [3](#dataeng-3) | Python essentials 2: functions, errors, files, modules and classes |
| [4](#dataeng-4) | Python for data work: files, CSV, JSON, dates and errors |
| [5](#dataeng-5) | SQL from zero: select, filter, group and join |
| [6](#dataeng-6) | SQL for data engineers: CTEs, window functions, de-duplication and upserts |
| [7](#dataeng-7) | pandas: tables in Python |
| [8](#dataeng-8) | Working with APIs: pagination, authentication, rate limits and retries |
| [9](#dataeng-9) | File formats: CSV, JSON and Parquet |
| [10](#dataeng-10) | Build an ETL pipeline: incremental, idempotent and observable |
| [11](#dataeng-11) | Loading nested data: flattening, schema inference, schema evolution and incremental loads |
| [12](#dataeng-12) | Data modelling: star schemas, facts, dimensions and history |
| [13](#dataeng-13) | Data quality: checks, tests and contracts |
| [14](#dataeng-14) | Orchestration: DAGs, schedules, retries and backfills |
| [15](#dataeng-15) | Big data: partitions, shuffles, Spark and the lakehouse |
| [16](#dataeng-16) | Streaming: logs, offsets, windows and late data |
| [17](#dataeng-17) | The warehouse, ELT and dbt: the modern data stack |
| [18](#dataeng-18) | Production practice: tests, containers, CI, monitoring, cost and privacy |
| [19](#dataeng-19) | Capstone, portfolio and the data engineering interview |

## What you already have in this course

- **New to all of this?** Do [Start here](#start-1) first. Lessons 2 and 3 of this track teach Python from the first variable; the [Python track](#ch15) covers the same ground more slowly, with a step-by-step code player.
- **The terminal and files:** [Linux](#linux-1). **Version control:** [Git](#git-1). Every data team uses both daily.
- **Containers and cloud:** [Docker](#docker-1) and [Cloud](#cloud-1); pipelines are shipped as containers and run on cloud services.
- **How databases work inside, indexes, replication:** [Databases and distributed systems](#systems-1).
- **Infrastructure as code and CI/CD:** [Terraform](#terraform-1) and [Jenkins](#jenkins-1).

## How to study

1. **Run it.** Every code block marked as runnable works in the practice lab and on any computer with Python 3. The outputs printed in the lessons were produced by running the code.
2. **Break it.** Change the input: add a bad row, a duplicate, a missing column. Predict the result first.
3. **Rebuild it** from an empty file a day later, without looking.
4. **Explain it** out loud in two sentences. The "what to say" boxes become flashcards in the round-up.

:::note What runs where
Lessons use Python's standard library (including SQLite) wherever possible, so they run in the browser lab. Lesson 7 needs `pandas` (the lab loads it on first use, which needs internet). Lesson 8 starts small local web servers and lesson 9 needs `pyarrow`; the browser lab cannot do those two, so run them on your own computer after `pip install pyarrow`. Tools such as Spark, Kafka, Airflow, dbt and cloud warehouses are explained with small runnable models, and their real commands are shown as "Example (not run here)".
:::

:::recap
- A data engineer makes data **reliable and available**: move, clean, shape, check, on time.
- Five stages: **foundations, getting and storing data, pipelines, scale, professional practice**.
- **SQL and Python** are the two languages; everything else is built on them.
- Study by **running, breaking, rebuilding and explaining**.
:::

```quiz
? Which sentence best describes a data engineer's job?
+ Building and running the systems that make data reliable and available to others
- Making dashboards for managers
- Training machine-learning models
- Managing the company's laptops
! Analysts and scientists use the data; the data engineer makes sure it is there, correct and on time.

? Which two languages does almost every data engineering job require?
+ SQL and Python
- HTML and CSS
- Java and Swift
- C and assembly
! SQL to query and transform tables, Python to glue systems together.
```
