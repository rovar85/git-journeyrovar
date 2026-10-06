"""Command glossary: parse src/content/_glossary/*.txt and find which entries a command line uses.

Entry format (one block per command; the key may be one or two words):
  ## git commit | Git
  what: one or two sentences saying what it does
  when: when you would reach for it
  flags: -m "msg": message; --amend: rewrite the last commit
  careful: optional warning
"""
import glob, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
GLOSS_DIR = os.path.join(HERE, "..", "src", "content", "_glossary")

def load():
    entries = {}
    for path in sorted(glob.glob(os.path.join(GLOSS_DIR, "*.txt"))):
        cur = None
        for raw in open(path, encoding="utf-8").read().split("\n"):
            line = raw.rstrip()
            if line.startswith("## "):
                key, _, tool = line[3:].partition("|")
                cur = {"key": key.strip(), "tool": tool.strip() or "Other", "what": "", "when": "", "flags": [], "careful": ""}
                entries[cur["key"]] = cur
            elif cur is not None and ":" in line and line.split(":", 1)[0] in ("what", "when", "flags", "careful"):
                k, v = line.split(":", 1)
                v = v.strip()
                if k == "flags":
                    for part in v.split(";"):
                        part = part.strip()
                        if part:
                            f, _, d = part.partition(": ")
                            cur["flags"].append([f.strip(), d.strip()])
                else:
                    cur[k] = v
    return entries

GLOSSARY = load()

SKIP = {"sudo", "time", "timeout", "env", "then", "do", "else", "elif", "if", "while", "until", "!", "{", "}", "(", ")", "done", "fi", "esac", "in", "exec", "nohup", "command", "builtin", "setsid", "xargs"}
TWO = {w.split()[0] for w in GLOSSARY if " " in w}

def segments(line):
    segs = []
    for m in re.finditer(r"\$\(([^()]*)\)", line):
        segs.append(m.group(1))
    segs += re.split(r"\||&&|;|\|\||`|\(|\)|\{|\}", line)
    return segs

def keys_for(line):
    out = []
    for seg in segments(line):
        w = seg.strip().split()
        while w and (w[0] in SKIP or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", w[0]) or w[0].isdigit() or w[0] in ("-n", "-u", "-E")):
            if w[0] in ("timeout",) and len(w) > 1:
                w = w[2:]
                continue
            w = w[1:]
        if not w:
            continue
        w[0] = w[0].lstrip("!")
        key = None
        # subcommand: first non-flag argument
        if len(w) > 1:
            sub = next((x for x in w[1:] if not x.startswith("-")), None)
            if sub and f"{w[0]} {sub}" in GLOSSARY:
                key = f"{w[0]} {sub}"
            elif len(w) > 2 and f"{w[0]} {w[1]}" in GLOSSARY:
                key = f"{w[0]} {w[1]}"
        if key is None:
            key = w[0].split("/")[-1] if w[0].startswith("./") is False and w[0].startswith("/") else w[0]
        if key not in out:
            out.append(key)
    return out
