"""Insert extra sections into lessons.

Input file format:   === track/NN        (e.g. === linux/01)
                     markdown to insert just before the lesson's  :::recap  block
Idempotent: a lesson that already contains the marker <!-- deeper --> is skipped (use --force to replace).
"""
import glob, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
content = os.path.join(here, "..", "src", "content")
force = "--force" in sys.argv
for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
    text = open(path, encoding="utf-8").read()
    for m in re.finditer(r"^=== (\w+)/(\d\d)\n(.*?)(?=^=== |\Z)", text, re.S | re.M):
        track, nn, body = m.groups()
        files = glob.glob(os.path.join(content, track, nn + "-*.md"))
        if not files:
            print("no lesson", track, nn); continue
        f = files[0]
        s = open(f, encoding="utf-8").read()
        block = "<!-- deeper -->\n" + body.strip() + "\n<!-- /deeper -->\n\n"
        if "<!-- deeper -->" in s:
            if not force:
                print("skip (already has deeper section):", f); continue
            s = re.sub(r"<!-- deeper -->.*?<!-- /deeper -->\n\n", "", s, flags=re.S)
        i = s.find(":::recap")
        if i < 0:
            print("no recap in", f); continue
        s = s[:i] + block + s[i:]
        open(f, "w", encoding="utf-8").write(s)
        print("updated", os.path.basename(f))
