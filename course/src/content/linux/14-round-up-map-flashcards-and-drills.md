---
track: linux
title: "Round-up: the map, flashcards and drills for Linux"
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

1. **Gather (fast pass).** Go through lessons 1 to 13 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One command, from keyboard to running service

Trace what happens when you type a command and when a service misbehaves. Every Linux topic sits on one of these hops.

1. **Shell**: You type; the shell parses quotes, expands variables and globs, finds the program through PATH, runs it, returns an exit code. Lessons: [1](#linux-1).
2. **Files and paths**: One tree from /. Absolute vs relative paths, links, inodes, what lives in /etc /var /home /proc. Lessons: [2](#linux-2).
3. **Streams and pipes**: stdin, stdout, stderr, redirection and pipes connect small tools; grep sed awk sort cut shape the text. Lessons: [3](#linux-3), [4](#linux-4).
4. **Permissions**: User, group, other; rwx as 4-2-1; umask; sudo; setuid. Who may touch this file or run this program? Lessons: [5](#linux-5).
5. **Processes**: Every program is a PID with a parent; signals, jobs, priorities, /proc show and control them. Lessons: [6](#linux-6).
6. **Packages and services**: Install with apt/dnf; run with systemd units; read logs with journalctl. Lessons: [7](#linux-7).
7. **Disks**: Block devices, filesystems, mounts, df/du, archives and compression. Lessons: [8](#linux-8).
8. **Automation**: Scripts, cron, ssh keys, environment variables: make it repeatable. Lessons: [9](#linux-9), [10](#linux-10).
9. **Troubleshooting and containers**: Triage CPU, memory, disk, network in a fixed order; containers are namespaces plus cgroups. Lessons: [11](#linux-11), [12](#linux-12).

**Do this now:** [open the sketch pad for this track](#study/maps/linux), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_linux

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Look up before you google: man -k keyword (or apropos), then COMMAND --help | less. Searching inside man pages with /pattern is a skill worth ten minutes.
- Ctrl-R searches your shell history; sudo !! re-runs the last command with sudo; Alt-. pastes the last argument.
- Start every script with set -euo pipefail and run it through shellcheck. Most script bugs are unquoted variables.
- When a service fails: systemctl status NAME shows the last log lines, journalctl -u NAME -e jumps to the end, and -f follows.
- Turn the mouse on in Vim with :set mouse=a (and :set number). Know how to leave: :q! quits without saving, ZZ saves and quits.
- Read permissions as three numbers: 7=rwx, 6=rw-, 5=r-x, 4=r--. Check with stat -c '%a %U:%G' file.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [man pages online (man7.org)](https://man7.org/linux/man-pages/)
- [GNU Bash manual](https://www.gnu.org/software/bash/manual/bash.html)
- [systemd.service manual](https://man7.org/linux/man-pages/man5/systemd.service.5.html)

## 6. Round 2: make these boring

- Break a service on purpose (wrong path in the unit file, wrong permissions on a config) and fix it using only systemctl and journalctl.
- Explain out loud what happens for: cat access.log | grep ' 500 ' | sort | uniq -c > out.txt (which process writes where).
- Write a script that checks disk, memory and a service, exits non-zero on trouble, and runs from cron.
- Re-do the Troubleshooting lesson from a blank page, in the same order, without notes.

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
