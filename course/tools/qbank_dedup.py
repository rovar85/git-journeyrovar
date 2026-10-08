"""Find which question-bank questions the course already answers (TF-IDF over lesson sections)."""
import re, glob, os, math, json, sys
sys.path.insert(0, os.path.dirname(__file__))
import qbank_parse
HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "..", "src", "content")
STOP = set("a an the of to in on for and or is are was were be been it its this that these those with as at by from how what why when which who do does did you your we our i can could should would will not no yes if then else than so into out up down over under about between versus vs use used using one two more most any all each also same like just have has had".split())
def stem(w):
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 3: return w[:-len(suf)]
    return w
def toks(t):
    t = re.sub(r"`", " ", t.lower())
    return [stem(w) for w in re.findall(r"[a-z][a-z0-9_\-\.]{1,}", t) if w not in STOP]

def segments():
    segs = []
    for f in sorted(glob.glob(os.path.join(CONTENT, "*", "[0-9][0-9]-*.md"))):
        track = f.split(os.sep)[-2]
        if track in ("qbank", "reference"): continue
        txt = open(f, encoding="utf-8").read()
        if "roundup: true" in txt[:600]: continue
        num = int(os.path.basename(f)[:2])
        title = re.search(r"^title:\s*(.*)$", txt, re.M).group(1).strip().strip('"')
        parts = re.split(r"^(?=#{2,3} )", txt, flags=re.M)
        for p in parts:
            h = re.match(r"#{2,3} (.*)", p)
            segs.append({"track": track, "n": num, "lesson": title, "head": h.group(1) if h else title, "text": p})
    return segs

def build():
    segs = segments()
    docs = [toks(s["head"] * 2 + " " + s["text"]) for s in segs]
    df = {}
    for d in docs:
        for w in set(d): df[w] = df.get(w, 0) + 1
    N = len(docs)
    idf = {w: math.log((N + 1) / (c + 0.5)) for w, c in df.items()}
    vecs = []
    for d in docs:
        tf = {}
        for w in d: tf[w] = tf.get(w, 0) + 1
        v = {w: (1 + math.log(c)) * idf[w] for w, c in tf.items()}
        n = math.sqrt(sum(x * x for x in v.values())) or 1
        vecs.append({w: x / n for w, x in v.items()})
    return segs, vecs, idf

def match(q, segs, vecs, idf):
    qt = toks(q["title"] + " " + q["title"] + " " + q["also"] + " " + q["simple"])
    tf = {}
    for w in qt: tf[w] = tf.get(w, 0) + 1
    v = {w: (1 + math.log(c)) * idf.get(w, 0.5) for w, c in tf.items()}
    n = math.sqrt(sum(x * x for x in v.values())) or 1
    v = {w: x / n for w, x in v.items()}
    best = []
    for i, sv in enumerate(vecs):
        s = sum(x * sv.get(w, 0) for w, x in v.items())
        best.append((s, i))
    best.sort(reverse=True)
    return [(round(s, 3), segs[i]) for s, i in best[:3]]

if __name__ == "__main__":
    segs, vecs, idf = build()
    qs = qbank_parse.parse_all()
    res = []
    for q in qs:
        m = match(q, segs, vecs, idf)
        res.append((m[0][0], q, m))
    res.sort(key=lambda x: -x[0])
    json.dump([{"topic": q["topic"], "n": q["n"], "score": s, "track": m[0][1]["track"], "lesson": m[0][1]["n"], "head": m[0][1]["head"]} for s, q, m in res], open(os.path.join(HERE, "..", "src", "study", "qbank_match.json"), "w"), indent=0)
    for lo in (0.5, 0.4, 0.35, 0.3, 0.25, 0.2): print(lo, sum(1 for s, _, _ in res if s >= lo))
    for s, q, m in res[:60]:
        print(f"{s:.2f} {q['topic']}Q{q['n']:<3} {q['title'][:62]:62} -> {m[0][1]['track']}-{m[0][1]['n']}: {m[0][1]['head'][:50]}")
