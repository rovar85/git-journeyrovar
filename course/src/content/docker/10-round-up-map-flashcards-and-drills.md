---
track: docker
title: "Round-up: the map, flashcards and drills for Docker"
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

1. **Gather (fast pass).** Go through lessons 1 to 9 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One container, from Dockerfile to production

Follow an image from instructions to a running, networked, persistent, observable container.

1. **Dockerfile**: Instructions build layers: FROM, COPY, RUN, USER, CMD; order controls cache and size. Lessons: [4](#docker-4).
2. **Image and registry**: Layers are content-addressed and shared; tags name them, digests pin them. Lessons: [2](#docker-2).
3. **Container runtime**: A running image: its own process tree, filesystem, network (namespaces) and limits (cgroups). Lessons: [1](#docker-1), [3](#docker-3).
4. **Ports and config**: Publish ports, pass environment variables, set CPU and memory limits. Lessons: [3](#docker-3).
5. **Volumes**: Data that must outlive the container lives in volumes or bind mounts. Lessons: [5](#docker-5).
6. **Networking**: User-defined networks give DNS between containers; bridge, host, none. Lessons: [6](#docker-6).
7. **Compose**: Several containers as one app described in a file. Lessons: [7](#docker-7).
8. **Production and debugging**: Healthchecks, logs, exec, inspect, restart policies, image scanning and slimming. Lessons: [8](#docker-8), [9](#docker-9).

**Do this now:** [open the sketch pad for this track](#study/maps/docker), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_docker

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- docker logs -f NAME, docker exec -it NAME sh and docker inspect NAME answer 90% of 'why is it not working'.
- Order Dockerfile steps from least to most frequently changing (dependencies before source) to keep the build cache.
- Run as a non-root USER, and pin base images by tag (better: digest).
- docker system df shows what is eating disk; docker system prune cleans up (read the prompt).
- A container exits when its main process exits: a container 'Exited (0)' immediately usually has the wrong CMD.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [docker CLI reference](https://docs.docker.com/reference/cli/docker/)
- [Docker Compose](https://docs.docker.com/compose/)

## 6. Round 2: make these boring

- Shrink an image by half (multi-stage build, slim base) and explain each saving.
- Break a Compose stack (wrong network, missing volume, bad env) and diagnose with logs, exec and inspect.
- Explain why data vanished when a container was removed, and how to prevent it.
- Describe namespaces and cgroups in one sentence each, and show one of each from the host.

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
