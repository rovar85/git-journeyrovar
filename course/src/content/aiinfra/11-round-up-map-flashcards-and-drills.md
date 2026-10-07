---
track: aiinfra
title: "Round-up: the map, flashcards and drills for AI infrastructure: GPUs, inference serving and platform engineering"
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

## 2. The map: One inference request, from GPU to platform

Follow a request through the hardware and the serving stack, then through the platform that ships it.

1. **GPU and memory**: Compute vs memory bandwidth, HBM, what fits where. Lessons: [1](#aiinfra-1).
2. **Prefill and decode**: Two phases with different bottlenecks; the KV cache stores the past. Lessons: [2](#aiinfra-2).
3. **Measure**: TTFT, tokens per second, throughput vs latency, percentiles. Lessons: [3](#aiinfra-3).
4. **Serve**: vLLM-style engines, continuous batching, paged attention. Lessons: [4](#aiinfra-4).
5. **Scale out**: Tensor, pipeline and data parallelism, sharding, routing. Lessons: [5](#aiinfra-5), [6](#aiinfra-6).
6. **Platform**: GitOps, Argo CD, KEDA autoscaling, MLflow and Kubeflow. Lessons: [7](#aiinfra-7), [8](#aiinfra-8).
7. **Observe and plan**: Metrics for GPUs and models, benchmarks, a reference architecture. Lessons: [9](#aiinfra-9), [10](#aiinfra-10).

**Do this now:** [open the sketch pad for this track](#study/maps/aiinfra), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_aiinfra

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Decide the SLO (TTFT and tokens/s) before choosing hardware.
- Measure p95/p99, not averages; load-test with realistic prompt lengths.
- Memory, not compute, usually limits concurrency: do the KV-cache arithmetic.
- Autoscale on queue depth or tokens/s, not CPU.
- Keep model, config and prompts in Git and deploy through GitOps.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [vLLM documentation](https://docs.vllm.ai/)
- [Argo CD](https://argo-cd.readthedocs.io/)
- [KEDA](https://keda.sh/docs/)

## 6. Round 2: make these boring

- Compute KV-cache size for a model and context length and the concurrency that fits on a GPU.
- Explain prefill vs decode and why batching helps decode.
- Sketch the reference architecture and mark each failure mode.
- Design an autoscaling policy and its alerts.

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
