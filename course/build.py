#!/usr/bin/env python3
"""Assemble the single-page course from src/ pieces into index.html."""
import glob, os
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "src")
rd = lambda p: open(os.path.join(src, p), encoding="utf-8").read()
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400'
         '&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Caveat:wght@600'
         '&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">')
out = ["<title>Agent School</title>", fonts, "<style>\n/* Layout concept: a classroom. Whiteboard in light mode, blackboard in dark mode. */\n" + rd("style.css") + "</style>", rd("shell.html")]
chapters = sorted(glob.glob(os.path.join(src, "ch[0-9][0-9].html")))
import html, re
def expand(text):
    # <!--include:examples/foo.py--> is replaced by the HTML-escaped file contents
    def sub(m):
        return html.escape(open(os.path.join(here, m.group(1)), encoding="utf-8").read().rstrip("\n"), quote=False)
    return re.sub(r"<!--include:(.+?)-->", sub, text)
for c in chapters:
    out.append(expand(open(c, encoding="utf-8").read()))
out.append(rd("tail.html"))
out.append("<script>\n" + rd("common.js") + "\n</script>")
for j in sorted(glob.glob(os.path.join(src, "js", "ch[0-9][0-9].js"))):
    out.append("<script>\n(function(){\n\"use strict\";\nvar $=H.$,$$=H.$$,esc=H.esc;\n" + open(j, encoding="utf-8").read() + "\n})();\n</script>")
out.append("<script>H.init();</script>")
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write("\n".join(out))
print("built", len(chapters), "chapters")
