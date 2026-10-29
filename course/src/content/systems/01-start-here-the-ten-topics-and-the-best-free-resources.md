---
track: systems
title: "Start here: backend and distributed systems, ten topics and the best free resources"
short: Start here
sub: A ten-topic path from how a database stores data to writing a design doc, with a free resource for each topic and the lesson in this track that makes it runnable.
---


:::goals
- see the ten topics that separate "I can build an API" from "I can run one at scale"
- know which lesson in this track covers each topic and which free resource goes with it
- know how to study them: read the source, run the demo, break it, explain it
:::

## Why this track exists

Most of this course teaches tools: Linux, Git, Docker, Kubernetes, Terraform. Senior interviews and real outages keep asking about something underneath the tools: **how data is stored and found, what happens when machines and networks misbehave, and how to write down a design so others can challenge it.** This track covers those ideas with code you can run in the browser lab or on any machine. Every demo uses only Python's standard library (including its built-in SQLite), and every number shown was produced by running the code.

## The ten topics, with free resources

Each resource below is a well-known free lecture, article or paper that you suggested. The links go to the places the short links lead to. **I could not open all of these pages from my environment, so I describe each by its title and author only; judge the quality yourself.** Use them as the original source next to the lesson here, not instead of it.

| # | Topic | Resource (free) | Lesson in this track |
| --- | --- | --- | --- |
| 1 | How databases actually work | [CMU 15-445 Database Systems, Andy Pavlo](https://15445.courses.cs.cmu.edu/): watch the lectures on B-trees, buffer pools and concurrency control | [Lesson 2](#systems-2) |
| 2 | Indexing | [Use The Index, Luke, Markus Winand](https://use-the-index-luke.com/): a free web book on why a query is slow | [Lesson 3](#systems-3) |
| 3 | Distributed systems theory | [Distributed Systems lectures, Martin Kleppmann](https://martin.kleppmann.com/2020/11/18/distributed-systems-and-elliptic-curves.html): clocks, replication and consensus in short lectures (the page links to the videos) | [Lesson 4](#systems-4) |
| 4 | Tail latency | [The Tail at Scale, Jeff Dean and Luiz Barroso](https://dl.acm.org/doi/10.1145/2408776.2408794): why p99 gets worse as you add services | [Lesson 5](#systems-5) |
| 5 | Retries done right | [Timeouts, retries and backoff with jitter, Amazon Builders' Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) | [Lesson 6](#systems-6) |
| 6 | Idempotency | [Designing robust and predictable APIs with idempotency, Stripe](https://stripe.com/blog/idempotency) | [Lesson 7](#systems-7) |
| 7 | The paper behind half of NoSQL | [Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) | [Lesson 8](#systems-8) |
| 8 | Sharding in the real world | [How Figma's databases team lived to tell the scale, Figma](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/) | [Lesson 9](#systems-9) |
| 9 | Consistency, tested brutally | [Jepsen analyses, Kyle Kingsbury](https://jepsen.io/analyses): read what each database promises, then what it actually does | [Lesson 10](#systems-10) |
| 10 | Design docs | [Design Docs at Google, Malte Ubl](https://www.industrialempathy.com/posts/design-docs-at-google/) | [Lesson 11](#systems-11) |

## What this overlaps in the rest of the course

Nothing here repeats an earlier lesson, but it connects to several. Retry and timeout symptoms appear as a scenario in [Interview scenarios 9](#scenarios-9); SLOs and percentiles in [Monitoring 4](#monitoring-4) and [AI infrastructure 3](#aiinfra-3); high availability and RTO/RPO in [Senior cloud 1](#cloudsenior-1); etcd and quorum in [Kubernetes 11](#kubernetes-11); architecture decision records in [Deep dive 14](#aideep-14). Databases and distributed systems also supply a large share of the questions in the [interview question bank](#qbank-1).

## How to study these ten topics

1. **Read the original once**, fast, and write three questions you cannot answer.
2. **Run the demo** in the matching lesson. Change one number (the fan-out, the retry count, the shard count) and predict the result before you rerun.
3. **Break it on purpose.** Each lesson ends with a practice task that makes the problem appear.
4. **Explain it out loud** in the way an interview asks: what it is, why it exists, what goes wrong, how you would measure it.
5. **Write one page** for each topic using the template in [Lesson 11](#systems-11).

:::note A note on honesty
The demos are small models, not production systems. A simulation can show you *why* a phenomenon happens and how big the effect can be; it cannot prove how your system will behave. Always measure the real thing.
:::

:::recap
- Ten topics: **database internals, indexing, distributed-systems theory, tail latency, retries, idempotency, Dynamo, sharding, consistency testing, design docs**.
- Each topic has a free primary source and a runnable lesson here.
- Study loop: **read, run, break, explain, write**.
:::

```quiz
? Why does this track use only the standard library in its demos?
+ So every demo runs anywhere, including the browser lab, with no installs
- Because other libraries are unsafe
- Because the topics are about Python
- Because it is faster
! The goal is to understand the mechanism; the code stays small and runnable everywhere.

? What is the best way to use the linked papers and lectures?
+ Read the original, run the matching demo, then explain the idea out loud
- Memorise the papers
- Skip them and only run the code
- Only read the summaries
! Primary sources plus hands-on practice plus explaining is what makes the ideas stick.
```
