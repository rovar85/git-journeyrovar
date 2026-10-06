"""Convert a lesson written in a small markdown dialect into a course chapter (HTML).

Supported blocks
  ## Heading / ### Sub-heading         paragraphs, - lists, 1. lists, | tables |
  ```run      commands executed for real (output recorded)         -> terminal, "Real output"
  ```term     a transcript written by hand ($ lines are commands)  -> terminal, "Example output"
  ```setup    hidden bash run before the lesson's run blocks
  ```lang:filename   a file or snippet with a copy button
  :::note|warn|ask|tip|goals|recap|try Title ... :::
  :::quiz   (? question / - wrong / + right / ! feedback)
  @widget name          mounts an interactive widget registered in JS
Inline: `code`, **bold**, *italic*, [text](url), {{term|definition}}
"""
import html, json, os, re
import runner
import glossary

def inline(s):
    codes = []
    def keep(m):
        codes.append(m.group(1)); return f"\x00{len(codes)-1}\x00"
    s = re.sub(r"`([^`]+)`", keep, s)
    s = html.escape(s, quote=False)
    s = re.sub(r"\{\{(.+?)\|(.+?)\}\}", lambda m: f'<span class="term" tabindex="0" data-def="{html.escape(m.group(2), quote=True)}">{m.group(1)}</span>', s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    s = re.sub(r"\x00(\d+)\x00", lambda m: "<code>" + html.escape(codes[int(m.group(1))], quote=False) + "</code>", s)
    return s

def parse_front(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    meta = {}
    if m:
        for line in m.group(1).split("\n"):
            if ":" in line:
                k, v = line.split(":", 1); meta[k.strip()] = v.strip()
        text = text[m.end():]
    return meta, text

class Ctx:
    def __init__(self, lesson_id):
        self.lesson_id = lesson_id
        self.setup, self.runs, self.run_slots = [], [], []
        self.quizzes = []
        self.html_parts = []

SEEN = set()
MISSING = {}

def guide_html(first_lines, lesson_id):
    keys = []
    for ln in first_lines:
        for k in glossary.keys_for(ln):
            if k in glossary.GLOSSARY:
                if k not in SEEN and k not in keys:
                    keys.append(k)
            elif re.match(r"^[a-z][a-z0-9_.+-]*$", k) and k not in ("do", "done"):
                MISSING.setdefault(k, set()).add(lesson_id)
    if not keys:
        return ""
    keys = keys[:10]
    SEEN.update(keys)
    items = []
    for k in keys:
        g = glossary.GLOSSARY[k]
        fl = ""
        if g["flags"]:
            fl = '<div class="gflags">' + "".join(f"<span><code>{html.escape(f, quote=False)}</code> {html.escape(d, quote=False)}</span>" for f, d in g["flags"][:6]) + "</div>"
        cv = f'<p class="gcare"><b>Careful:</b> {html.escape(g["careful"], quote=False)}</p>' if g["careful"] else ""
        items.append(f'<dt><code>{html.escape(k, quote=False)}</code></dt><dd><p><b>What it does:</b> {html.escape(g["what"], quote=False)}</p><p><b>When to use it:</b> {html.escape(g["when"], quote=False)}</p>{fl}{cv}</dd>')
    n = len(keys)
    return f'<details class="cmdguide"><summary>What {"does this command" if n == 1 else "do these " + str(n) + " commands"} do, and when would I use {"it" if n == 1 else "them"}?</summary><dl>' + "".join(items) + '</dl><p class="gref"><a href="#reference-1">Open the full command reference</a></p></details>'

def term_html(entries, kind, lesson_id=""):
    badge = ('<span class="badge real">Real output</span>' if kind == "real" else '<span class="badge ex">Example output (not run here)</span>')
    cmds = []
    body = []
    for e in entries:
        c = e["c"]
        first = True
        for ln in c.split("\n"):
            if ln.startswith("$ "):
                body.append(f'<span class="pr">$</span> <span class="cm">{html.escape(ln[2:], quote=False)}</span>')
                cmds.append(ln[2:])
            elif ln.startswith("> "):
                body.append(f'<span class="pr">&gt;</span> <span class="cm">{html.escape(ln[2:], quote=False)}</span>')
                cmds.append(ln[2:])
            else:
                body.append(f'<span class="cmt">{html.escape(ln, quote=False)}</span>')
        if e.get("o"):
            body.append(html.escape(e["o"], quote=False))
    copy = html.escape("\n".join(cmds), quote=True)
    firsts = [e["c"].split("\n")[0][2:] for e in entries if e["c"].startswith("$ ")]
    guide = guide_html(firsts, lesson_id)
    return f'<div class="term" data-copy="{copy}"><div class="term-bar"><span class="dots"><i></i><i></i><i></i></span>{badge}</div><pre class="term-body">' + "\n".join(body) + "</pre></div>" + guide

def parse_term(text):
    entries, cur = [], None
    for line in text.split("\n"):
        if line.startswith("$ ") or (line.startswith("> ") and cur is not None and cur["o"] == ""):
            if line.startswith("$ "):
                cur = {"c": line, "o": ""}; entries.append(cur)
            else:
                cur["c"] += "\n" + line
        elif line.startswith("#") and (cur is None or cur["o"] == "") :
            entries.append({"c": line, "o": ""}); cur = None
        else:
            if cur is None:
                cur = {"c": "", "o": ""}; entries.append(cur)
            cur["o"] += (("\n" if cur["o"] else "") + line)
    for e in entries:
        if e["c"] == "":
            e["c"] = "# "
    return entries

def code_html(code, lang, fname):
    title = f'<div class="code-title">{html.escape(fname)}</div>' if fname else ""
    return f'<div class="codewrap">{title}<pre class="code"><code>{html.escape(code, quote=False)}</code></pre></div>'

def render_quiz(text):
    qs, cur = [], None
    for line in text.split("\n"):
        line = line.rstrip()
        if line.startswith("? "):
            cur = {"q": line[2:], "o": [], "a": None, "f": ""}; qs.append(cur)
        elif line.startswith("+ ") and cur is not None:
            cur["a"] = len(cur["o"]); cur["o"].append(line[2:])
        elif line.startswith("- ") and cur is not None:
            cur["o"].append(line[2:])
        elif line.startswith("! ") and cur is not None:
            cur["f"] = line[2:]
    for q in qs:
        assert q["a"] is not None, "quiz question without a + answer: " + q["q"]
    return qs

CALLOUT_CLASS = {"note": "board note", "tip": "board note", "warn": "board warn", "ask": "board ask"}
CALLOUT_LABEL = {"note": "Note", "tip": "Tip", "warn": "Careful", "ask": "Student asks"}

def blocks(text, ctx):
    out = []
    lines = text.split("\n")
    i = 0
    para = []
    def flush():
        nonlocal para
        if para:
            out.append("<p>" + inline(" ".join(p.strip() for p in para)) + "</p>")
            para = []
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush()
            info = line[3:].strip(); i += 1; buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            body = "\n".join(buf)
            if info == "run":
                idx = len(ctx.runs); ctx.runs.append(body)
                out.append(f"@@RUN{idx}@@")
            elif info == "setup":
                ctx.setup.append(body)
            elif info == "term":
                out.append(term_html(parse_term(body), "example", ctx.lesson_id))
            else:
                lang, _, fname = info.partition(":")
                out.append(code_html(body, lang, fname))
            continue
        m = re.match(r":::(\w+)\s*(.*)$", line)
        if m:
            flush()
            kind, title = m.group(1), m.group(2).strip(); i += 1; buf = []
            depth = 1
            while i < len(lines):
                if re.match(r":::\w+", lines[i]): depth += 1
                if lines[i].strip() == ":::":
                    depth -= 1
                    if depth == 0: break
                buf.append(lines[i]); i += 1
            i += 1
            inner = "\n".join(buf)
            if kind == "quiz":
                ctx.quizzes.extend(render_quiz(inner))
            elif kind == "goals":
                out.append(f'<div class="goals"><b>{inline(title or "By the end of this lesson you can:")}</b>' + "".join(blocks(inner, ctx)) + "</div>")
            elif kind == "recap":
                out.append(f'<div class="recap"><h3>{inline(title or "In plain words")}</h3>' + "".join(blocks(inner, ctx)) + "</div>")
            elif kind == "try":
                out.append(f'<div class="board ask"><span class="tag">{inline(title or "Your turn")}</span>' + "".join(blocks(inner, ctx)) + "</div>")
            else:
                cls = CALLOUT_CLASS.get(kind, "board note")
                out.append(f'<div class="{cls}"><span class="tag">{inline(title or CALLOUT_LABEL.get(kind, "Note"))}</span>' + "".join(blocks(inner, ctx)) + "</div>")
            continue
        if line.startswith("@setup "):
            flush(); name = line.split(None, 1)[1].strip()
            ctx.setup.append(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "content", "_setup", name + ".sh"), encoding="utf-8").read())
            i += 1; continue
        if line.startswith("@widget "):
            flush(); name = line.split(None, 1)[1].strip()
            out.append(f'<div class="lab" data-widget="{html.escape(name)}"></div>'); i += 1; continue
        if line.startswith("## "):
            flush(); out.append("<h3>" + inline(line[3:]) + "</h3>"); i += 1; continue
        if line.startswith("### "):
            flush(); out.append('<h3 style="font-size:1.1rem;margin-top:1.4rem">' + inline(line[4:]) + "</h3>"); i += 1; continue
        if line.startswith("|"):
            flush(); rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            head, body = rows[0], [r for r in rows[1:] if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
            out.append('<div class="tblwrap"><table class="tbl"><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>" +
                       "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table></div>")
            continue
        m_ul = re.match(r"^(\s*)([-*]) (.*)$", line)
        m_ol = re.match(r"^(\s*)(\d+)\. (.*)$", line)
        if m_ul or m_ol:
            flush(); ordered = bool(m_ol); items = []
            while i < len(lines):
                a = re.match(r"^(\s*)([-*]) (.*)$", lines[i]); b = re.match(r"^(\s*)(\d+)\. (.*)$", lines[i])
                mm = b if ordered else a
                if mm and not mm.group(1):
                    items.append(mm.group(3)); i += 1
                elif lines[i].startswith("  ") and items and lines[i].strip():
                    items[-1] += " " + lines[i].strip(); i += 1
                else:
                    break
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        if not line.strip():
            flush(); i += 1; continue
        para.append(line); i += 1
    flush()
    return out

def convert(path, track_id, track_name, number):
    text = open(path, encoding="utf-8").read()
    meta, body = parse_front(text)
    lesson_id = f"{track_id}-{number}"
    SEEN.clear()
    ctx = Ctx(lesson_id)
    parts = blocks(body, ctx)
    rendered = runner.run_lesson(lesson_id, ctx.setup, ctx.runs) if ctx.runs else []
    final = []
    for p in parts:
        m = re.fullmatch(r"@@RUN(\d+)@@", p)
        final.append(term_html(rendered[int(m.group(1))], "real", lesson_id) if m else p)
    title = meta.get("title", f"Lesson {number}")
    sec = (f'<section class="chapter" id="{lesson_id}" data-track="{track_id}" data-n="{number}" data-title="{html.escape(number_label(number) + " · " + meta.get("short", title), quote=True)}" '
           f'data-road="{html.escape(title, quote=True)}" data-sub="{html.escape(meta.get("sub", ""), quote=True)}">'
           f'<header class="chapter-head"><span class="hand">{html.escape(track_name)} · Lesson {number}</span><h2>{inline(title)}</h2></header>'
           + "\n".join(final) +
           f'<div class="quiz" data-quiz="{lesson_id}"><h3>Check yourself</h3><div class="score" hidden></div></div>'
           + (f'<script type="application/json" class="quizdata" data-for="{lesson_id}">{json.dumps(ctx.quizzes)}</script>' if ctx.quizzes else "")
           + "</section>")
    return sec

def number_label(n):
    return str(n)
