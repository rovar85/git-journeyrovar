"""Import the DevOps Interview Question Bank (Priyanka Gupta, CC BY 4.0) as the 'qbank' track.
Questions the course already answers (SKIP below) are not copied; they are listed with links to the lesson that covers them.
Run:  python3 tools/import_qbank.py   (needs the repo cloned at $QBANK_SRC's parent)
Writes src/content/qbank/NN-*.md and src/study/qbank_lessons.json."""
import os, re, json, sys, glob, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qbank_parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "content", "qbank")
SOURCE_URL = "https://github.com/priyankagupta7679/devops-interview-question-bank"

# Already answered by a lesson in this course: {"<topic><Qn>": (track, lesson number)}.
SKIP = {}
def sk(track, n, *codes):
    for c in codes: SKIP[c] = (track, n)
sk("linux", 5, "01Q4", "01Q1"); sk("linux", 7, "01Q5"); sk("linux", 10, "01Q6"); sk("linux", 6, "01Q8"); sk("linux", 8, "01Q62", "01Q69")
sk("networking", 5, "01Q13"); sk("networking", 6, "01Q12"); sk("networking", 8, "01Q14", "01Q10")
sk("docker", 3, "02Q14"); sk("docker", 5, "02Q17"); sk("docker", 9, "02Q5"); sk("docker", 4, "02Q3", "02Q4", "02Q10"); sk("docker", 1, "02Q1")
sk("git", 3, "04Q15", "04Q36"); sk("git", 1, "04Q35"); sk("git", 4, "04Q16", "04Q37"); sk("git", 5, "04Q14")
sk("jenkins", 3, "04Q6", "04Q27", "04Q5", "04Q48")
sk("ansible", 3, "04Q24"); sk("ansible", 2, "04Q20"); sk("ansible", 4, "04Q23", "04Q26"); sk("ansible", 5, "04Q25")
sk("terraform", 4, "05Q33", "05Q16", "05Q10", "05Q2", "05Q47"); sk("terraform", 6, "05Q23"); sk("terraform", 7, "05Q15"); sk("terraform", 1, "05Q1"); sk("terraform", 2, "05Q3"); sk("terraform", 3, "05Q4", "05Q21")
sk("scenarios", 1, "05Q17")
sk("kubernetes", 7, "03Q16"); sk("kubernetes", 4, "03Q10", "03Q22", "03Q23", "03Q11"); sk("kubernetes", 10, "03Q27"); sk("kubernetes", 3, "03Q6", "03Q14")
sk("kubernetes", 13, "03Q15"); sk("kubernetes", 5, "03Q13"); sk("kubernetes", 6, "03Q7", "03Q18"); sk("kubernetes", 9, "03Q83"); sk("kubernetes", 11, "03Q50"); sk("scenarios", 3, "03Q66")
sk("cloud", 2, "06Q3", "06Q6", "06Q2"); sk("cloud", 1, "07Q10")
sk("cloudsenior", 7, "06Q40"); sk("cloudsenior", 11, "03Q45", "07Q8", "06Q18", "06Q41"); sk("cloudsenior", 10, "04Q57", "04Q58", "04Q12"); sk("cloudsenior", 6, "06Q49")
sk("cloudsenior", 12, "08Q2"); sk("cloudsenior", 9, "08Q32"); sk("monitoring", 4, "08Q5")

ORDER = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]
LEVELS = ["Basic", "Advanced", "Scenario"]
LEVEL_NAME = {"Basic": "Basic", "Advanced": "Advanced", "Scenario": "Scenario-based"}
CHUNK = 12
SHELL_START = re.compile(r"^\s*(\$ )?(docker|kubectl|git|aws|az|gcloud|terraform|ansible|ansible-playbook|helm|sudo|ls|cd|cat|grep|awk|sed|find|chmod|chown|ps|top|kill|systemctl|journalctl|curl|ping|ssh|df|du|free|tar|echo|export|mkdir|touch|cp|mv|rm|tail|head|sort|uniq|wc|crontab|ip|ss|netstat|dig|nslookup|traceroute|tcpdump|iptables|mount|lsblk|useradd|usermod|passwd|nohup|jobs|bg|fg|sleep|for |while |if |#!/bin/(ba)?sh|#!/usr/bin/env bash)")

def guess_lang(code, given, topic):
    if given: return given
    first = next((l for l in code.split("\n") if l.strip() and not l.strip().startswith("#") or l.startswith("#!")), "")
    if re.match(r"^\s*(apiVersion|kind):", first) or first.strip() == "---": return "yaml"
    if re.match(r"^\s*(resource|variable|provider|terraform|module|output|data|locals)\b[^=]*\{", first): return "hcl"
    if first.strip().startswith(("{", "[")): return "json"
    if re.match(r"^\s*(FROM|RUN|COPY|WORKDIR|ENV|CMD|ENTRYPOINT)\b", first): return "dockerfile"
    if re.match(r"^\s*(pipeline|node|stage|agent)\b", first): return "groovy"
    if SHELL_START.match(first): return "bash"
    return ""

def runnable(code):
    """A shell block gets a Run button only if real bash parses it and it has no <placeholders> or output lines."""
    if re.search(r"<[A-Za-z][\w-]*>", code) or re.search(r"^\s*\$ ", code, re.M): return False
    return subprocess.run(["bash", "-n"], input=code.encode(), capture_output=True).returncode == 0

def convert_body(q):
    raw = q["body_raw"]
    raw = re.sub(r"^Also asked as:.*\n?", "", raw, flags=re.M)
    raw = re.sub(r"^> \*\*In simple words:\*\*.*?(?=\n\n|\Z)", "", raw, flags=re.M | re.S, count=1)
    raw = re.sub(r"^> \*\*What to say to the interviewer:\*\*.*?(?=\n\n|\Z)", "", raw, flags=re.M | re.S, count=1)
    # label fenced code and make sure fences stay balanced
    out, infence, buf, given = [], False, [], ""
    for ln in raw.split("\n"):
        if ln.startswith("```"):
            if not infence:
                infence, given, buf = True, ln[3:].strip(), []
            else:
                code = "\n".join(buf)
                lang = guess_lang(code, given, q["topic"])
                if lang in ("bash", "sh") and not runnable(code): lang = "text"
                out.append("```" + lang); out += buf; out.append("```"); infence = False
            continue
        if infence: buf.append(ln)
        else: out.append(ln)
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text

def lesson_id(track, n): return f"{track}-{n}"

def question_md(q):
    parts = [f"## {q['title']}", "", f"<!-- source: {q['topic']} Q{q['n']} -->"]
    meta = f"{LEVEL_NAME[q['level']]} question"
    if q["also"]: parts += ["", f"*Also asked as:* {q['also']}"]
    parts += ["", ":::note In simple words", q["simple"], ":::", ""]
    body = convert_body(q)
    if body: parts += [body, ""]
    parts += [":::say", q["say"], ":::", ""]
    return "\n".join(parts)

def main():
    qs = qbank_parse.parse_all()
    kept = [q for q in qs if f"{q['topic']}Q{q['n']}" not in SKIP]
    skipped = [q for q in qs if f"{q['topic']}Q{q['n']}" in SKIP]
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "[0-9][0-9]-*.md")): os.remove(f)
    lessons, num = [], 1
    index = {}
    plan = []                                        # (topic, level, part, questions)
    for t in ORDER:
        slug, tname = qbank_parse.TOPICS[t]
        for lv in LEVELS:
            group = [q for q in kept if q["topic"] == t and q["level"] == lv]
            if not group: continue
            parts = [group[i:i + CHUNK] for i in range(0, len(group), CHUNK)]
            # avoid a tiny last chunk
            if len(parts) > 1 and len(parts[-1]) < 4:
                last = parts.pop(); parts[-1] = parts[-1] + last
            for pi, chunk in enumerate(parts, 1):
                plan.append((t, lv, pi, len(parts), chunk))
    # lesson 1: start here + coverage index
    first_lessons = {}
    num = 2
    for t, lv, pi, np_, chunk in plan:
        slug, tname = qbank_parse.TOPICS[t]
        title = f"{tname}: {LEVEL_NAME[lv]} questions" + (f" (part {pi} of {np_})" if np_ > 1 else "")
        short = f"{slug.capitalize() if slug not in ('gcpazure','cicd','sre') else {'gcpazure':'GCP/Azure','cicd':'CI/CD','sre':'SRE'}[slug]} {LEVEL_NAME[lv].lower().split('-')[0]}" + (f" {pi}" if np_ > 1 else "")
        sub = f"{len(chunk)} interview questions with plain-words answers, details, examples and the sentence to say out loud."
        fn = f"{num:02d}-{slug}-{LEVEL_NAME[lv].lower().replace('-', '')}" + (f"-{pi}" if np_ > 1 else "") + ".md"
        body = [f"---\ntrack: qbank\ntitle: \"{title}\"\nshort: {short}\nsub: {sub}\n---\n"]
        body.append(f":::note Source and licence\nThese questions and answers come from the [DevOps Interview Question Bank]({SOURCE_URL}) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.\n:::\n")
        body.append("For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.\n")
        for q in chunk: body.append(question_md(q))
        open(os.path.join(OUT, fn), "w", encoding="utf-8").write("\n".join(body))
        lessons.append({"n": num, "topic": t, "slug": slug, "level": lv, "title": title, "count": len(chunk)})
        num += 1
    # lesson 1
    rows = []
    byt = {}
    for q in skipped: byt.setdefault(q["topic"], []).append(q)
    cov = []
    for t in ORDER:
        if t not in byt: continue
        cov.append(f"### {qbank_parse.TOPICS[t][1]}\n")
        cov.append("| Question | Covered in the course |\n| --- | --- |")
        for q in byt[t]:
            tr, n = SKIP[f"{q['topic']}Q{q['n']}"]
            cov.append(f"| {q['title'].replace('|', '/')} | [{tr} lesson {n}](#{lesson_id(tr, n)}) |")
        cov.append("")
    topics_tbl = ["| Topic | Questions added | Already in the course |", "| --- | --: | --: |"]
    tot_a = tot_s = 0
    for t in ORDER:
        a = sum(1 for q in kept if q["topic"] == t); s = len(byt.get(t, []))
        tot_a += a; tot_s += s
        topics_tbl.append(f"| {qbank_parse.TOPICS[t][1]} | {a} | {s} |")
    topics_tbl.append(f"| **Total** | **{tot_a}** | **{tot_s}** |")
    intro = f"""---
track: qbank
title: Start here: how to use the question bank, and what the course already covers
short: Start here
sub: {len(qs)} real interview questions checked against this course. {tot_a} are added here; {tot_s} were skipped because a lesson already answers them.
---

:::goals
- know how to practise an interview question so it sticks
- find the questions this course already answers, and the lesson that answers each
- pick the right lesson for the interview you have coming
:::

## What this track is

An interview question bank of **{len(qs)} real DevOps, SRE and cloud questions** gathered from interview experiences, by Priyanka Gupta ([source repository]({SOURCE_URL}), licence CC BY 4.0). I read every question against the {sum(1 for _ in glob.glob(os.path.join(HERE, '..', 'src', 'content', '*', '[0-9][0-9]-*.md')))} lessons in this course. If a lesson already teaches the same thing, the question is **not repeated**; it is listed at the bottom of this page with a link. Everything else is added, so this track fills the gaps instead of copying.

Every question has the same four parts:

1. **In simple words**: an everyday picture, so the idea makes sense first.
2. **The details**: the real technical answer, with a triage order for scenario questions.
3. **An example**: commands, YAML or scripts. They are shown as written in the source and were not run here. Shell examples have a **Run in lab** button when the lab can run them.
4. **What to say to the interviewer**: two or three sentences to practise out loud. Flashcards are made from these.

{chr(10).join(topics_tbl)}

:::note The method that works
Cover the answer, say yours out loud, then compare. Do the **Basic** lessons for your stack first, then **Scenario-based** (most interviews are troubleshooting), then **Advanced**. Use the Study view to drill the flashcards, and run the examples in the Lab or on a free real machine (see the Linux practice-lab lesson).
:::

:::warn Check before you repeat an answer
These are good answers written by someone else. I did not verify every command in a real environment, and cloud products change names and limits. If something looks off, check the official documentation before you say it in an interview.
:::

## Questions the course already answers

These questions were in the bank. A lesson here already answers them, so they were left out of the track.

{chr(10).join(cov)}
"""
    open(os.path.join(OUT, "01-start-here.md"), "w", encoding="utf-8").write(intro)
    lessons.insert(0, {"n": 1, "topic": "", "slug": "start", "level": "", "title": "Start here", "count": 0})
    json.dump({"lessons": lessons, "added": len(kept), "skipped": len(skipped)}, open(os.path.join(HERE, "..", "src", "study", "qbank_lessons.json"), "w"), indent=1)
    print(len(qs), "questions;", len(kept), "added;", len(skipped), "skipped;", len(lessons), "lessons")

if __name__ == "__main__": main()
