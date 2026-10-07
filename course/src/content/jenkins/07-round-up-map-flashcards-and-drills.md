---
track: jenkins
title: "Round-up: the map, flashcards and drills for Jenkins and CI/CD"
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

1. **Gather (fast pass).** Go through lessons 1 to 6 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One commit, from push to deployed

A pipeline is a conveyor belt. Each Jenkins topic is a station on it.

1. **Trigger**: A push, a schedule or a manual run starts a build. Lessons: [1](#jenkins-1).
2. **Agent**: Where the work runs: controller, node, container; labels choose the machine. Lessons: [5](#jenkins-5).
3. **Job and parameters**: Freestyle jobs, parameters and chained jobs: the basics of automation. Lessons: [1](#jenkins-1), [2](#jenkins-2).
4. **Pipeline as code**: Jenkinsfile: stages, steps, post actions, declarative syntax, kept in Git. Lessons: [3](#jenkins-3).
5. **Build, test, package**: Compile, unit tests, build an image, archive artefacts, publish reports. Lessons: [4](#jenkins-4).
6. **Deploy**: Promote the same artefact through environments with approvals and checks. Lessons: [4](#jenkins-4).
7. **Credentials and security**: Credentials store, least privilege, folders and roles, script approval. Lessons: [5](#jenkins-5).
8. **Operations**: Backups, plugins, upgrades, monitoring the CI itself, and when alternatives fit better. Lessons: [6](#jenkins-6).

**Do this now:** [open the sketch pad for this track](#study/maps/jenkins), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_jenkins

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Keep the pipeline in Git (Jenkinsfile) and treat it like code: review it, test it, version it.
- Build once, deploy many: the artefact tested in staging must be the one promoted to production.
- Never echo secrets: use the credentials binding, and know that masking is not a security boundary.
- Use the 'Replay' feature and the Pipeline Syntax snippet generator instead of guessing step syntax.
- A flaky test is a bug in the test or the code: fix or quarantine with a ticket, do not just re-run.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Pipeline syntax reference](https://www.jenkins.io/doc/book/pipeline/syntax/)
- [Using a Jenkinsfile](https://www.jenkins.io/doc/book/pipeline/jenkinsfile/)
- [Securing Jenkins](https://www.jenkins.io/doc/book/security/)

## 6. Round 2: make these boring

- Write a Jenkinsfile from memory: checkout, build, test, publish report, deploy with an approval, post-failure notify.
- Make a build fail in each stage on purpose and read the log to find the cause quickly.
- Explain where each secret lives and who can read it.
- List what you would back up and monitor on the Jenkins server.

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
