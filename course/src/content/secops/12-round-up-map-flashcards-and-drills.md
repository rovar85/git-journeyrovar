---
track: secops
title: "Round-up: the map, flashcards and drills for Security and DevSecOps"
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

1. **Gather (fast pass).** Go through lessons 1 to 11 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One web shop, attacked and defended layer by layer

Follow a single shop from design to an incident: model the threats, protect the logins and data, keep code and dependencies clean, lock down the infrastructure, gate every change, then detect and respond.

1. **Think like an attacker**: CIA, threat vs vulnerability vs risk, STRIDE, least privilege, defence in depth. Lessons: [1](#secops-1).
2. **Protect identities**: Salted slow hashes, MFA, tokens, authorisation on every request. Lessons: [2](#secops-2), [5](#secops-5).
3. **Protect data**: Hashes, symmetric and public-key encryption, signatures, certificates, TLS. Lessons: [3](#secops-3).
4. **Protect the code**: Injection fixes, SAST with Bandit, human review of what scanners miss. Lessons: [4](#secops-4), [8](#secops-8).
5. **Protect the inputs**: Secrets out of code and history; dependencies, typosquats, hashes, SBOMs, signing. Lessons: [6](#secops-6), [7](#secops-7).
6. **Protect the platform**: Policy as code for Dockerfiles, Pods and cloud plans. Lessons: [9](#secops-9).
7. **Gate every change**: One CI gate with reviewed, expiring exceptions. Lessons: [10](#secops-10).
8. **Detect and respond**: Log detections, timelines, the incident lifecycle, interview answers. Lessons: [11](#secops-11).

**Do this now:** [open the sketch pad for this track](#study/maps/secops), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_secops

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Run the attack first, then the fix, and say in one sentence why the fix works.
- Keep a list of every control with the threat it stops.
- Re-run the pipeline lesson after changing any earlier script.
- Only ever test systems you own or have written permission to test.
- For interviews, practise the four answers in the last lesson out loud.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [OWASP Top 10](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [NIST SP 800-63B (passwords)](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [SLSA](https://slsa.dev/)
- [NIST SP 800-61 (incident handling)](https://csrc.nist.gov/pubs/sp/800/61/r3/final)

## 6. Round 2: make these boring

- Threat model an app you use with STRIDE and rank five risks.
- Explain salting and slow hashing to a non-technical friend.
- Find and fix an IDOR in a small API you write.
- Add a new rule to each scanner in this track and a test case that triggers it.
- Write the incident timeline for a leaked cloud key.

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
