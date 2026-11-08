"""Import the AI engineering interview bank (rohitg00/ai-engineering-from-scratch, MIT licence) as the 'aibank' track.
Questions that an existing lesson already answers (data/aibank_skip.json) are listed, not copied.
Run:  python3 tools/import_aibank.py   (needs the repo cloned at /home/user/ai-engineering-from-scratch)"""
import os, re, json, glob
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("AIBANK_SRC", "/home/user/ai-engineering-from-scratch/interviews")
OUT = os.path.join(HERE, "..", "src", "content", "aibank")
SOURCE_URL = "https://github.com/rohitg00/ai-engineering-from-scratch"
SKIP = json.load(open(os.path.join(HERE, "data", "aibank_skip.json")))
REL = json.load(open(os.path.join(HERE, "data", "aibank_rel.json")))
CHUNK = 12
LEVEL = {1: "screening", 2: "working", 3: "senior", 4: "staff"}

def fm(text):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    meta = {}
    for line in m.group(1).split("\n"):
        mm = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if mm and not line.startswith(" "): meta[mm.group(1)] = mm.group(2).strip()
    return meta, m.group(2)

def sections(body):
    parts = re.split(r"^## (.+)$", body, flags=re.M)
    return parts[0].strip(), {parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}

def clean(text):
    """strip relative links, turn ### headings into bold lines (outside code fences)"""
    out, fence = [], False
    for ln in text.split("\n"):
        if ln.startswith("```"): fence = not fence
        if not fence:
            ln = re.sub(r"\[([^\]]+)\]\((?!https?://|#)[^)]*\)", r"\1", ln)
            ln = re.sub(r"^#{3,4} (.+)$", r"**\1**", ln)
            ln = ln.replace(":::", ": : :")
        out.append(ln)
    return "\n".join(out).strip()

def cards():
    t = open(os.path.join(REPO, "topics.yaml"), encoding="utf-8").read()
    gsec, csec = t.split("\ncards:\n")
    groups = [(m.group(1), m.group(2).strip().strip('"')) for m in re.finditer(r"- id: (\S+)\n    title: (.+)", gsec)]
    cs = []
    for blk in re.split(r"\n  - id: ", "\n" + csec)[1:]:
        cid = blk.split("\n")[0].strip()
        title = re.search(r"title: (.+)", blk).group(1).strip().strip('"')
        grp = re.search(r"group: (\S+)", blk).group(1)
        cs.append({"id": cid, "title": title, "group": grp})
    return groups, cs

def lesson_title_lookup():
    d = {}
    for f in glob.glob(os.path.join(HERE, "..", "src", "content", "*", "[0-9][0-9]-*.md")):
        tr = f.split(os.sep)[-2]; n = int(os.path.basename(f)[:2])
        txt = open(f, encoding="utf-8").read(1500)
        m = re.search(r"^title:\s*(.*)$", txt, re.M)
        if m: d[(tr, n)] = m.group(1).strip().strip('"')
    return d
TITLES = lesson_title_lookup()
def lesson_id(tr, n): return f"ch{n}" if tr == "ai" else f"{tr}-{n}"

def qmd(q):
    meta, body = q["meta"], q["body"]
    pre, secs = sections(body)
    s = [f"## {q['title']}", "", f"*Level {meta.get('level', '2')} ({LEVEL.get(int(meta.get('level', 2)), '')}) · {meta.get('kind', '')} · about {meta.get('minutes', '')} minutes*", ""]
    if pre: s += [clean(pre), ""]
    s += [":::answer Show the answer", ":::say Short answer", clean(secs.get("Short answer", "")), ":::", ""]
    if secs.get("Full answer"): s += ["**Full answer**", "", clean(secs["Full answer"]), ""]
    if secs.get("Follow-ups"): s += ["**Follow-ups** (answer before you read the Expected part)", "", clean(secs["Follow-ups"]), ""]
    if secs.get("Wrong answers"): s += ["**Wrong answers, and why they fail**", "", clean(secs["Wrong answers"]), ""]
    r = REL.get(q["id"])
    if r and r[3] >= 0.15 and (r[0], r[1]) in TITLES:
        s += [f"**Related lesson in this course:** [{TITLES[(r[0], r[1])]}](#{lesson_id(r[0], r[1])})", ""]
    s += [":::", ""]
    return "\n".join(s)

def evidence_block(path, label):
    try: txt = open(path, encoding="utf-8", errors="replace").read()
    except Exception: return ""
    lines = txt.rstrip("\n").split("\n")
    note = ""
    if len(lines) > 40 or len(txt) > 3500:
        txt = "\n".join(lines[:40])[:3500]; note = f"\n(excerpt: the first {min(40, len(lines))} of {len(lines)} lines)"
    txt = txt.replace("```", "'''")
    return f"**Evidence: {label}**\n\n```text\n{txt}{note}\n```\n"

def smd(sc):
    meta, body, d = sc["meta"], sc["body"], sc["dir"]
    pre, secs = sections(body)
    sysinfo = re.search(r"^system:\n((?:  .*\n)+)", sc["raw"], re.M)
    sysline = ""
    if sysinfo:
        kv = dict(re.findall(r"^  (\w+): (.*)$", sysinfo.group(1), re.M))
        sysline = "; ".join(f"{k}: {v}" for k, v in kv.items())
    s = [f"## {sc['title']}", "", f"*Level {meta.get('level', '')} · {meta.get('kind', '')} · about {meta.get('minutes', '')} minutes" + (f" · {sysline}" if sysline else "") + "*", ""]
    s += [clean(secs.get("Situation", "")), ""]
    ev = secs.get("Evidence", "")
    for label, rel in re.findall(r"- \[([^\]]+)\]\((evidence/[^)]+)\)", ev):
        s += [evidence_block(os.path.join(d, rel), label)]
    if secs.get("Questions"): s += ["**Questions**", "", clean(secs["Questions"]), ""]
    s += [":::answer Show the answer", ":::say Short answer", clean(secs.get("Resolution", "").split("\n\n")[0]), ":::", ""]
    if secs.get("Walkthrough"): s += ["**Walkthrough**", "", clean(secs["Walkthrough"]), ""]
    if secs.get("Resolution"): s += ["**Resolution**", "", clean(secs["Resolution"]), ""]
    if secs.get("Wrong turns"): s += ["**Wrong turns**", "", clean(secs["Wrong turns"]), ""]
    if secs.get("Generalize"): s += ["**Generalize**", "", clean(secs["Generalize"]), ""]
    s += [":::", ""]
    return "\n".join(s)

NOTE = ("These questions come from the open-source [AI Engineering from Scratch interview bank]({u}) by Rohit Ghumare (MIT licence), reformatted for this course: "
        "answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says \"the lesson\" or \"the manual\", it means the source project's own material). "
        "Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.")

def main():
    groups, cs = cards()
    qs = []
    for f in sorted(glob.glob(os.path.join(REPO, "questions", "*", "*.md"))):
        if f.endswith("README.md"): continue
        meta, body = fm(open(f, encoding="utf-8").read())
        qs.append({"id": meta["id"], "card": meta["card"], "title": meta["title"], "meta": meta, "body": body})
    byc = {}
    for q in qs: byc.setdefault(q["card"], []).append(q)
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "[0-9][0-9]-*.md")): os.remove(f)
    plan = []                      # (title, short, card id, [md blocks])
    gtitle = dict(groups)
    skipped = []
    for gid, _ in groups:
        for c in [x for x in cs if x["group"] == gid and x["id"] in byc]:
            items = sorted(byc[c["id"]], key=lambda q: (int(q["meta"].get("level", 2)), q["title"]))
            keep = [q for q in items if q["id"] not in SKIP]; skipped += [q for q in items if q["id"] in SKIP]
            parts = [keep[i:i + CHUNK] for i in range(0, len(keep), CHUNK)]
            if len(parts) > 1 and len(parts[-1]) < 4: last = parts.pop(); parts[-1] = parts[-1] + last
            for pi, chunk in enumerate(parts, 1):
                t = f"AI interview bank: {c['title']}" + (f" (part {pi} of {len(parts)})" if len(parts) > 1 else "")
                short = (c["title"].split(":")[0][:22]) + (f" {pi}" if len(parts) > 1 else "")
                plan.append((t, short, c["id"], chunk))
    # scenarios
    scs = []
    for d in sorted(glob.glob(os.path.join(REPO, "scenarios", "*", ""))):
        rp = os.path.join(d, "README.md")
        if not os.path.exists(rp): continue
        raw = open(rp, encoding="utf-8").read(); meta, body = fm(raw)
        scs.append({"id": meta["id"], "title": meta["title"], "meta": meta, "body": body, "dir": d, "raw": raw})
    scs.sort(key=lambda s: (int(s["meta"].get("level", 2)), s["title"]))
    sparts = [scs[i:i + 6] for i in range(0, len(scs), 6)]
    n = 2
    meta_out = []
    for t, short, cid, chunk in plan:
        fn = f"{n:02d}-{re.sub('[^a-z0-9]+', '-', (t.lower()))[:60].strip('-')}.md"
        head = f"---\ntrack: aibank\ntitle: \"{t}\"\nshort: {short}\nsub: {len(chunk)} AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.\n---\n\n:::note Source and licence\n{NOTE.format(u=SOURCE_URL)}\n:::\n\nTry each question first, then open the answer. The flashcards in the Study view use the short answers.\n\n"
        open(os.path.join(OUT, fn), "w", encoding="utf-8").write(head + "\n".join(qmd(q) for q in chunk))
        meta_out.append({"n": n, "card": cid, "title": t, "count": len(chunk)}); n += 1
    for si, chunk in enumerate(sparts, 1):
        t = f"AI incident scenarios, read the evidence (part {si} of {len(sparts)})"
        fn = f"{n:02d}-ai-incident-scenarios-part-{si}.md"
        head = f"---\ntrack: aibank\ntitle: \"{t}\"\nshort: Incidents {si}\nsub: {len(chunk)} measured incidents from AI serving and agent systems: read the logs and numbers, find the root cause, then compare with the walkthrough.\n---\n\n:::note Source and licence\n{NOTE.format(u=SOURCE_URL)}\n:::\n\nEach scenario gives a situation and the evidence (logs, tables, command output, shortened to an excerpt here). Decide the cause **before** you open the answer. The systems named are the ones the original authors measured; the reasoning transfers to others.\n\n"
        open(os.path.join(OUT, fn), "w", encoding="utf-8").write(head + "\n".join(smd(s) for s in chunk))
        meta_out.append({"n": n, "card": "scenarios", "title": t, "count": len(chunk)}); n += 1
    # lesson 1
    rows = ["| Topic | Questions in this track | Already in this course |", "| --- | --: | --: |"]
    for gid, gt in groups:
        for c in [x for x in cs if x["group"] == gid and x["id"] in byc]:
            a = sum(1 for q in byc[c["id"]] if q["id"] not in SKIP); s_ = sum(1 for q in byc[c["id"]] if q["id"] in SKIP)
            rows.append(f"| {c['title']} | {a} | {s_} |")
    rows.append(f"| Incident scenarios | {len(scs)} | 0 |")
    cov = ["| Question | Covered in the course |", "| --- | --- |"]
    for q in skipped:
        tr, nn = SKIP[q["id"]]
        cov.append(f"| {q['title'].replace('|', '/')} | [{TITLES.get((tr, nn), tr)}](#{lesson_id(tr, nn)}) |")
    mit = open(os.path.join(REPO, "..", "LICENSE"), encoding="utf-8").read().strip()
    intro = f"""---
track: aibank
title: "Start here: the AI engineering interview bank and what the course already covers"
short: Start here
sub: {len(qs)} questions and {len(scs)} incident scenarios, checked against this course. {len(qs) - len(skipped)} questions are added; {len(skipped)} were skipped because a lesson already answers them.
---

:::goals
- know how to practise a question so it sticks (try, open the answer, check the follow-ups, note the wrong answers)
- see which questions this course already answers, and which are new
- choose a route for the round you have: concepts, debugging, system design, coding, incidents or behavioural
:::

## What this track is

{NOTE.format(u=SOURCE_URL)}

It covers the AI engineering interview in its usual rounds: **concepts** (transformers, tokenisation, post-training, inference, RAG, prompting, evaluation, agents and protocols), **debugging and estimation** (read a log or a number and find the cause), **system design**, **coding**, **behavioural** and **incident scenarios**. Questions that one of the earlier AI lessons already answers well (basic concept questions such as "what is the KV cache" or "why cosine similarity") are **not repeated**: they are listed below with a link.

## How each question is built

1. **The question**, with the evidence (a log, a table, a code snippet) when it is a debugging or code-reading question.
2. **Show the answer** (folded): a **short answer** (this is what the flashcards use), the **full answer**, **follow-ups** at increasing levels with the expected answers, and the **wrong answers** interviewers hear and why they fail.
3. A **related lesson** in this course for the background.

Levels: 1 screening, 2 working engineer, 3 senior, 4 staff. Start with levels 1 and 2 of your target topics, then 3.

## What is in the track

{chr(10).join(rows)}

:::warn About the measurements
Hardware, software versions and numbers in the scenarios come from the original authors' own captures (specific GPUs, serving engines and agent runtimes). They are examples of how to read evidence. Check current versions and documentation before relying on any number in a real decision.
:::

## Questions the course already answers

{chr(10).join(cov)}

## Licence

The questions are reproduced under the MIT licence of the source project:

```text
{mit}
```
"""
    open(os.path.join(OUT, "01-start-here.md"), "w", encoding="utf-8").write(intro)
    meta_out.insert(0, {"n": 1, "card": "", "title": "Start here", "count": 0})
    json.dump({"lessons": meta_out, "added": len(qs) - len(skipped), "skipped": len(skipped), "scenarios": len(scs)}, open(os.path.join(HERE, "..", "src", "study", "aibank_lessons.json"), "w"), indent=1)
    print(len(qs), "questions;", len(qs) - len(skipped), "added;", len(skipped), "skipped;", len(scs), "scenarios;", len(meta_out), "lessons")
if __name__ == "__main__": main()
