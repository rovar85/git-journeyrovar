---
track: windows
title: "Round-up: the map, flashcards and drills for Windows and PowerShell"
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

## 2. The map: One PowerShell pipeline, from object to action

PowerShell passes objects, not text. Every topic is a way to find, shape or act on objects.

1. **Cmdlets and help**: Verb-Noun commands; Get-Help, Get-Command and Get-Member discover everything. Lessons: [1](#windows-1).
2. **Pipeline of objects**: Where-Object, Select-Object, Sort-Object, ForEach-Object work on properties. Lessons: [1](#windows-1), [2](#windows-2).
3. **Files and data**: Providers, CSV/JSON/XML in and out, Import/Export. Lessons: [2](#windows-2).
4. **Scripts and functions**: Parameters, error handling (try/catch, -ErrorAction), modules. Lessons: [3](#windows-3).
5. **Windows administration**: Services, processes, event logs, registry, scheduled tasks, remoting. Lessons: [4](#windows-4).

**Do this now:** [open the sketch pad for this track](#study/maps/windows), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_windows

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Get-Command *noun* and Get-Help cmd -Examples are faster than searching the web; | Get-Member shows what an object can do.
- Use -WhatIf and -Confirm on anything that changes or deletes.
- Filter early (-Filter on the cmdlet) before piping to Where-Object for speed.
- $ErrorActionPreference='Stop' with try/catch makes scripts fail loudly.
- ConvertTo-Json -Depth 5 and Format-List * reveal everything inside an object.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [PowerShell overview](https://learn.microsoft.com/powershell/scripting/overview)
- [PowerShell module reference](https://learn.microsoft.com/powershell/module/)
- [about_ topics](https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about)

## 6. Round 2: make these boring

- Rebuild a Linux text pipeline you know as a PowerShell object pipeline.
- Write a script with parameters, validation, -WhatIf support and a log file.
- Query the event log for the last hour of errors and export a summary CSV.
- Explain why Select-String and Where-Object are different tools.

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
