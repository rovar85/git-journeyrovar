"""Generate the last lesson of every track: a round-up with the end-to-end map, flashcard drill box,
tips, the few documentation pages worth reading, and round-2 drills.
Source of truth: src/study/maps.json (authored in src/study/build_maps.py). Output: src/content/<track>/NN-round-up-*.md
The generated files carry 'roundup: true' in their front matter and are rewritten on every build."""
import glob, os, re

LEGACY = {"ai": 14, "python": 12}          # hand-written HTML chapters that are not markdown files

def lesson_id(track, n):
    if track == "ai": return f"ch{n}"
    if track == "python": return f"ch{n + 14}"
    return f"{track}-{n}"

def generate(tracks, maps, content_dir):
    for t in tracks:
        m = maps.get(t["id"])
        if not m: continue
        d = os.path.join(content_dir, t["id"])
        os.makedirs(d, exist_ok=True)
        for f in glob.glob(os.path.join(d, "[0-9][0-9]-*.md")):
            if "roundup: true" in open(f, encoding="utf-8").read(2000):
                os.remove(f)
        nums = [int(os.path.basename(f)[:2]) for f in glob.glob(os.path.join(d, "[0-9][0-9]-*.md"))]
        n = max(nums + [LEGACY.get(t["id"], 0)]) + 1
        tid = t["id"]
        hops = "\n".join(
            f"{i}. **{h['label']}**: {h['text']}" + (" Lessons: " + ", ".join(f"[{k}](#{lesson_id(tid, k)})" for k in h["lessons"]) + "." if h["lessons"] else "")
            for i, h in enumerate(m["hops"], 1))
        tips = "\n".join(f"- {x}" for x in m["tips"])
        docs = "\n".join(f"- [{x['label']}]({x['url']})" for x in m["docs"])
        r2 = "\n".join(f"- {x}" for x in m["round2"])
        first, last = (1, max(nums + [LEGACY.get(tid, 0)] + [1]))
        md = f"""---
track: {tid}
title: "Round-up: the map, flashcards and drills for {t['name']}"
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

1. **Gather (fast pass).** Go through lessons {first} to {last} quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: {m['title']}

{m['intro']}

{hops}

**Do this now:** [open the sketch pad for this track](#study/maps/{tid}), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_{tid}

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

{tips}

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

{docs}

## 6. Round 2: make these boring

{r2}

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
"""
        out = os.path.join(d, f"{n:02d}-round-up-map-flashcards-and-drills.md")
        open(out, "w", encoding="utf-8").write(md)
