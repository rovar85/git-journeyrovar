---
track: monitoring
title: "Round-up: the map, flashcards and drills for Monitoring and observability"
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

1. **Gather (fast pass).** Go through lessons 1 to 4 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One signal, from the code to a page at 3 a.m.

Follow a measurement from instrumentation to an alert someone acts on.

1. **Instrument**: The code exposes counters, gauges and histograms with a few well-chosen labels. Lessons: [3](#monitoring-3).
2. **Scrape and store**: Prometheus pulls /metrics on an interval and stores time series. Lessons: [1](#monitoring-1), [2](#monitoring-2).
3. **Query**: PromQL: selectors, rate(), sum by, histogram_quantile for percentiles. Lessons: [2](#monitoring-2).
4. **Visualise**: Dashboards answer 'is it healthy' with the golden signals: latency, traffic, errors, saturation. Lessons: [1](#monitoring-1), [4](#monitoring-4).
5. **Alert**: Rules fire on symptoms users feel; routing, grouping and silences decide who is paged. Lessons: [3](#monitoring-3).
6. **Logs and traces**: Logs explain why; traces show where in the request path. Lessons: [4](#monitoring-4).
7. **SLOs**: Targets, error budgets and burn-rate alerts turn monitoring into decisions. Lessons: [4](#monitoring-4).

**Do this now:** [open the sketch pad for this track](#study/maps/monitoring), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_monitoring

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Use rate() on counters, never raw counters; histogram_quantile(0.99, sum by (le) (rate(x_bucket[5m]))) for p99.
- Alert on symptoms (error rate, latency) not causes (CPU high); keep causes for dashboards.
- Labels multiply series: never put user IDs, URLs or timestamps in labels (cardinality).
- up == 0 is the first query when a target seems missing; the Targets page tells you why.
- Every alert needs an owner, a runbook link and a clear action; delete alerts nobody acts on.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Prometheus querying basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Metric and label naming](https://prometheus.io/docs/practices/naming/)
- [Google SRE book](https://sre.google/sre-book/table-of-contents/)

## 6. Round 2: make these boring

- Write the four golden-signal queries for a service you know, from memory.
- Compute an error budget and a burn-rate alert for a 99.9% SLO.
- Find and fix a high-cardinality label in a metric.
- Take an alert that fires too often and decide: tune, delete or turn into a ticket.

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
