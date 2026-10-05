#!/usr/bin/env python3
"""Assemble the single-page course from src/ pieces into index.html.

Chapters 1-14 (AI) and 15-26 (Python) are hand-written HTML. Every other track is written as
markdown lessons in src/content/<track>/NN-slug.md (see tools/mdconv.py) and converted here.
"""
import glob, html, json, os, re, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "tools"))
import mdconv

src = os.path.join(here, "src")
rd = lambda p: open(os.path.join(src, p), encoding="utf-8").read()
tracks = json.loads(rd("tracks.json"))
track_by_id = {t["id"]: t for t in tracks}

fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400'
         '&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Caveat:wght@600'
         '&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">')

def expand(text):
    def sub(m):
        return html.escape(open(os.path.join(here, m.group(1)), encoding="utf-8").read().rstrip("\n"), quote=False)
    return re.sub(r"<!--include:(.+?)-->", sub, text)

# ---- chapters -----------------------------------------------------------
chapter_html = []
counts = {t["id"]: 0 for t in tracks}

legacy = sorted(glob.glob(os.path.join(src, "ch[0-9][0-9].html")))
for path in legacy:
    num = int(re.search(r"ch(\d\d)\.html", path).group(1))
    track = "ai" if num <= 14 else "python"
    counts[track] += 1
    text = expand(open(path, encoding="utf-8").read())
    text = re.sub(r'<section class="chapter" id="(ch\d+)"', rf'<section class="chapter" id="\1" data-track="{track}" data-n="{counts[track]}"', text, count=1)
    chapter_html.append((track, counts[track], text))

for t in tracks:
    files = sorted(glob.glob(os.path.join(src, "content", t["id"], "[0-9][0-9]-*.md")))
    for f in files:
        n = int(os.path.basename(f).split("-")[0])
        counts[t["id"]] = max(counts[t["id"]], n)
        chapter_html.append((t["id"], n, mdconv.convert(f, t["id"], t["name"], n)))

order = {t["id"]: i for i, t in enumerate(tracks)}
# AI chapters keep their original order, python next; other tracks in tracks.json order
chapter_html.sort(key=lambda x: (0 if x[0] == "ai" else 1 if x[0] == "python" else 2 + order[x[0]], x[1]))
for t in tracks:
    t["count"] = sum(1 for c in chapter_html if c[0] == t["id"])

# ---- page ---------------------------------------------------------------
out = ["<title>Agent School</title>", fonts,
       "<style>\n/* Layout concept: a classroom. Whiteboard in light mode, blackboard in dark mode. */\n" + rd("style.css") + "</style>",
       rd("shell.html")]
out += [c[2] for c in chapter_html]
out.append(rd("tail.html"))
subprocess.run([sys.executable, os.path.join(here, "gen_traces.py")], check=True, stdout=subprocess.DEVNULL)
out.append("<script>window.TRACES=" + rd("traces.json") + ";window.TRACKS=" + json.dumps(tracks) + ";</script>")
out.append("<script>\n" + rd("common.js") + "\n</script>")
for j in sorted(glob.glob(os.path.join(src, "js", "ch[0-9][0-9].js"))) + sorted(glob.glob(os.path.join(src, "js", "w_*.js"))):
    out.append("<script>\n(function(){\n\"use strict\";\nvar $=H.$,$$=H.$$,esc=H.esc;\n" + open(j, encoding="utf-8").read() + "\n})();\n</script>")
out.append("<script>H.init();</script>")
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write("\n".join(out))
print("built", len(chapter_html), "lessons;", {t["id"]: t["count"] for t in tracks if t["count"]})
