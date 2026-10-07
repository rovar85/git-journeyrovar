---
track: git
title: "Round-up: the map, flashcards and drills for Git"
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

1. **Gather (fast pass).** Go through lessons 1 to 5 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One change, from edit to shared history

A change moves through four places. Every Git command moves it between two of them.

1. **Working tree**: Files you edit. git status and git diff show what changed. Lessons: [1](#git-1).
2. **Staging area**: git add chooses exactly what goes into the next commit (git add -p for hunks). Lessons: [1](#git-1).
3. **Local history**: Commits are snapshots linked in a graph; branches are movable labels. Lessons: [1](#git-1), [2](#git-2).
4. **Merge or rebase**: Combine histories: merge keeps the shape, rebase rewrites it. Conflicts are resolved by hand. Lessons: [2](#git-2).
5. **Remote**: fetch downloads, pull = fetch + merge, push uploads; upstream tracking links branches. Lessons: [3](#git-3).
6. **Review and teamwork**: Pull requests, small commits, good messages, protected branches. Lessons: [3](#git-3), [5](#git-5).
7. **Undo and rescue**: restore, reset, revert, reflog: pick the one that does not destroy shared history. Lessons: [4](#git-4).

**Do this now:** [open the sketch pad for this track](#study/maps/git), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_git

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- reflog is the safety net: git reflog lists where HEAD has been, so almost any lost commit can be found and restored.
- Never rewrite history others have pulled. On shared branches use git revert, not reset or force-push.
- git log --oneline --graph --all --decorate is the map; alias it.
- git add -p and git commit -v make small, reviewable commits (review your own diff first).
- git stash is for interruptions; git switch -c for experiments; both beat 'copy the folder'.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [Git reference manual](https://git-scm.com/docs)
- [Pro Git book](https://git-scm.com/book/en/v2)
- [git-reflog](https://git-scm.com/docs/git-reflog)

## 6. Round 2: make these boring

- Create a conflict deliberately, resolve it, then do it again with rebase. Explain the difference in the resulting graph.
- Recover a deleted branch and a commit lost by git reset --hard, using only reflog.
- Split one big messy change into three clean commits with add -p.
- Explain fetch vs pull vs push by drawing the four places and the arrows.

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
