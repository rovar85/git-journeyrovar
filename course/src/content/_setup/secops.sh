mkdir -p ~/lab/sec/iac && cd ~/lab/sec && rm -f requirements.txt
cat > scan.py <<'PYEOF'
# A small secret scanner: known patterns plus "looks random" (high entropy) strings.
import math, re, sys
RULES = {
    "AWS access key id": r"\bAKIA[0-9A-Z]{16}\b",
    "private key block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "secret in code": r"(?i)(password|passwd|pwd|secret|api_?key|token)\w*\s*[:=]\s*['\"][^'\"]{6,}['\"]",   # a quoted literal, not os.environ
    "token in URL": r"https?://[^/\s:]+:[^@\s]+@",
}
def entropy(s):
    return -sum(s.count(c) / len(s) * math.log2(s.count(c) / len(s)) for c in set(s))
def scan_text(name, text):
    hits = []
    for n, line in enumerate(text.splitlines(), 1):
        for rule, rx in RULES.items():
            if re.search(rx, line): hits.append((name, n, rule, line.strip()[:60]))
        for tok in re.findall(r"[A-Za-z0-9+/_\-]{24,}", line):
            if entropy(tok) > 4.2: hits.append((name, n, f"random-looking string (entropy {entropy(tok):.1f})", tok[:12] + "..."))
    return hits
if __name__ == "__main__":
    if sys.argv[1] == "-":            # read a patch (for example the output of a history log) from stdin
        added = "\n".join(l[1:] for l in sys.stdin.read().splitlines() if l.startswith("+") and not l.startswith("+++"))
        hits = scan_text("history", added)
    else:
        hits = [h for f in sys.argv[1:] for h in scan_text(f, open(f).read())]
    for h in hits: print("%s:%s  %s  %s" % h)
    print(f"{len(hits)} finding(s)"); sys.exit(1 if hits else 0)
PYEOF
cat > sast.py <<'PYEOF'
# A tiny static analyser: it reads the code as a syntax tree (it never runs it) and flags risky calls.
import ast, sys
RISKY_CALLS = {"eval": "runs any text as code", "exec": "runs any text as code",
               "pickle.loads": "unpickling untrusted data can run code", "yaml.load": "use yaml.safe_load",
               "hashlib.md5": "MD5 is broken for security uses"}
def name_of(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute): return f"{name_of(node.value)}.{node.attr}"
    return ""
class Finder(ast.NodeVisitor):
    def __init__(self): self.found = []
    def visit_Call(self, node):
        n = name_of(node.func)
        if n in RISKY_CALLS: self.found.append((node.lineno, n, RISKY_CALLS[n]))
        if n.startswith("subprocess.") and any(k.arg == "shell" and getattr(k.value, "value", False) is True for k in node.keywords):
            self.found.append((node.lineno, n, "shell=True with built strings allows command injection"))
        if n.endswith(".execute") and node.args and isinstance(node.args[0], (ast.BinOp, ast.JoinedStr)):
            self.found.append((node.lineno, n, "SQL built from strings; use ? parameters"))
        self.generic_visit(node)
    def visit_Assign(self, node):
        for t in node.targets:
            if isinstance(t, ast.Name) and any(w in t.id.lower() for w in ("key", "secret", "password", "token")) \
               and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                self.found.append((node.lineno, t.id, "hard-coded secret"))
        self.generic_visit(node)
f = Finder(); f.visit(ast.parse(open(sys.argv[1]).read()))
for line, what, why in sorted(f.found): print(f"{sys.argv[1]}:{line:<3} {what:18} {why}")
print(len(f.found), "findings"); sys.exit(1 if f.found else 0)
PYEOF
cat > supply.py <<'PYEOF'
# Three supply-chain checks on a requirements file: known vulnerable versions, look-alike names, and hash pinning.
import hashlib, json, os

requirements = """requests==2.19.0
flask==3.0.3
reqeusts==1.0.0
pyyaml==5.3
numpy>=1.20
"""
if os.path.exists("requirements.txt"): requirements = open("requirements.txt").read()   # use the project's file when there is one
# a tiny advisory database in the shape real ones use (package, affected range, id, fixed version)
ADVISORIES = [("requests", "<2.20.0", "CVE-2018-18074", "2.20.0", "sends the Authorization header to another host after a redirect"),
              ("pyyaml", "<5.4", "CVE-2020-14343", "5.4", "full_load can run arbitrary code"),
              ("flask", "<2.2.5", "CVE-2023-30861", "2.2.5", "a response can be cached with another user's cookie")]
POPULAR = ["requests", "flask", "numpy", "pyyaml", "django", "pandas", "urllib3"]

def ver(v): return tuple(int(x) for x in v.split("."))
def affected(v, rng): return ver(v) < ver(rng[1:])
def distance(a, b):                         # edit distance: how many single-letter changes turn a into b
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return d[-1]

pkgs = []
for line in requirements.split():
    if "==" in line: name, v = line.split("=="); pkgs.append((name, v, True))
    else: name, v = line.split(">="); pkgs.append((name, v, False))

for name, v, pinned in pkgs:
    notes = []
    if not pinned: notes.append("NOT PINNED: any newer release (including a hijacked one) installs")
    for p, rng, cve, fix, why in ADVISORIES:
        if p == name and pinned and affected(v, rng): notes.append(f"{cve}: {why}; upgrade to {fix}")
    near = [p for p in POPULAR if p != name and distance(name, p) <= 2]
    if near and name not in POPULAR: notes.append(f"LOOK-ALIKE of {near[0]}: possible typosquat")
    print(f"{name:9} {v:7} " + (" | ".join(notes) if notes else "ok"))

# hash pinning: the lock file records the hash of the exact file you tested
good = b"wheel bytes for flask 3.0.3"
lock = {"flask==3.0.3": hashlib.sha256(good).hexdigest()}
for label, download in [("the real file", good), ("a swapped file on a hacked mirror", b"wheel bytes for flask 3.0.3 + backdoor")]:
    ok = hashlib.sha256(download).hexdigest() == lock["flask==3.0.3"]
    print(f"install flask from {label}: {'hash matches, install' if ok else 'HASH MISMATCH, refuse'}")

sbom = {"bomFormat": "CycloneDX", "specVersion": "1.5", "components": [{"type": "library", "name": n, "version": v, "purl": f"pkg:pypi/{n}@{v}"} for n, v, _ in pkgs]}
print("\nSBOM (first two components):", json.dumps(sbom["components"][:2]))
PYEOF
cat > policy.py <<'PYEOF'
# Policy as code: the same idea as hadolint, Checkov, Kyverno or OPA, in a few rules you can read.
import json, re, sys
findings = []
def flag(sev, where, msg): findings.append((sev, where, msg))

# --- Dockerfile
lines = open("Dockerfile").read().splitlines()
if re.match(r"FROM \S+:latest|FROM [^:\s]+$", lines[0]): flag("MED", "Dockerfile:1", "base image not pinned (latest); pin a version or digest")
if not any(l.startswith("USER ") for l in lines): flag("HIGH", "Dockerfile", "no USER line: the app runs as root")
for i, l in enumerate(lines, 1):
    if re.match(r"(ENV|ARG) .*(PASSWORD|SECRET|TOKEN|KEY)=", l, re.I): flag("HIGH", f"Dockerfile:{i}", "secret baked into the image; anyone with the image can read it")
    if l.startswith("EXPOSE") and " 22" in l: flag("MED", f"Dockerfile:{i}", "SSH port exposed; containers should not run sshd")

# --- Kubernetes
pod = json.load(open("pod.json"))
if pod["spec"].get("hostNetwork"): flag("HIGH", "pod.json", "hostNetwork: the pod shares the node's network")
for c in pod["spec"]["containers"]:
    sc = c.get("securityContext", {})
    if sc.get("privileged"): flag("CRIT", f"pod.json:{c['name']}", "privileged container: root on the node if it is broken into")
    if sc.get("runAsUser") == 0 or not sc.get("runAsNonRoot"): flag("HIGH", f"pod.json:{c['name']}", "may run as root; set runAsNonRoot: true")
    if "resources" not in c: flag("LOW", f"pod.json:{c['name']}", "no CPU/memory limits")
    if c["image"].endswith(":latest"): flag("MED", f"pod.json:{c['name']}", "image tag latest")

# --- Terraform plan (a plan saved as JSON with "show -json")
for r in json.load(open("plan.json"))["resource_changes"]:
    a, t = r["change"]["after"], r["type"]
    if t == "aws_s3_bucket_public_access_block" and not all(a.values()): flag("CRIT", r["address"], "bucket can be made public")
    if t == "aws_security_group_rule" and "0.0.0.0/0" in a.get("cidr_blocks", []) and a["from_port"] in (22, 3389):
        flag("HIGH", r["address"], f"port {a['from_port']} open to the whole internet")
    if t == "aws_db_instance" and not a.get("storage_encrypted"): flag("MED", r["address"], "database storage not encrypted")

order = {"CRIT": 0, "HIGH": 1, "MED": 2, "LOW": 3}
for sev, where, msg in sorted(findings, key=lambda f: order[f[0]]): print(f"{sev:4} {where:45} {msg}")
bad = [f for f in findings if order[f[0]] <= 1]
print(f"\n{len(findings)} findings, {len(bad)} critical or high -> {'FAIL' if bad else 'PASS'}")
sys.exit(1 if bad else 0)
PYEOF
cat > pipeline.py <<'PYEOF'
# A DevSecOps gate: run every check from this track, apply reviewed exceptions, then pass or fail the build.
import contextlib, io, json, os, runpy, sys
TODAY = "2026-11-13"                      # fixed so the run is repeatable; a real pipeline uses the date
HERE = os.path.dirname(os.path.abspath(__file__))

def run(script, args, cwd=HERE):
    out, old = io.StringIO(), os.getcwd()
    os.chdir(cwd); sys.argv = [script] + args
    try:
        with contextlib.redirect_stdout(out): runpy.run_path(os.path.join(HERE, script), run_name="__main__")
    except SystemExit: pass
    finally: os.chdir(old)
    return out.getvalue().splitlines()

STAGES = [  # name, script, args, folder, which output lines block the build
    ("secrets", "scan.py", ["app.py", "iac/Dockerfile"], HERE, lambda l: "  " in l and ":" in l.split()[0]),
    ("sast", "sast.py", ["app.py"], HERE, lambda l: l.startswith("app.py:")),
    ("dependencies", "supply.py", [], HERE, lambda l: "CVE-" in l or "LOOK-ALIKE" in l),
    ("infrastructure", "policy.py", [], os.path.join(HERE, "iac"), lambda l: l[:4] in ("CRIT", "HIGH")),
]
exceptions = json.load(open(os.path.join(HERE, "exceptions.json")))
failed = False
for name, script, args, cwd, blocks in STAGES:
    lines = run(script, args, cwd)
    blocking = [l for l in lines if blocks(l)]
    kept = []
    for l in blocking:
        ex = next((e for e in exceptions if e["stage"] == name and e["contains"] in l), None)
        if ex and ex["expires"] >= TODAY: print(f"  [{name}] accepted until {ex['expires']} ({ex['reason']}): {l.strip()[:60]}")
        else:
            if ex: print(f"  [{name}] exception EXPIRED on {ex['expires']}: {l.strip()[:60]}")
            kept.append(l)
    status = "FAIL" if kept else "pass"; failed |= bool(kept)
    print(f"{name:15} {status}  ({len(blocking)} blocking, {len(kept)} after exceptions)")
    for l in kept[:3]: print("      ", l.strip()[:90])
print("\nBUILD", "FAILED: fix or get an exception reviewed" if failed else "PASSED")
sys.exit(1 if failed else 0)
PYEOF
cat > exceptions.json <<'PYEOF'
[
 {"stage": "sast", "contains": "hashlib.md5", "reason": "MD5 used only as a cache key, reviewed by security", "expires": "2027-03-31"},
 {"stage": "dependencies", "contains": "pyyaml", "reason": "upgrade planned in sprint 41", "expires": "2026-10-31"}
]
PYEOF
cat > app.py <<'PYEOF'
import hashlib, pickle, subprocess, sqlite3, yaml

API_KEY = "sk-demo-1234567890"

def ping(host):
    return subprocess.run("ping -c 1 " + host, shell=True, capture_output=True)

def find_user(db, name):
    return db.execute("SELECT * FROM users WHERE name = '%s'" % name).fetchall()

def load_profile(data):
    return pickle.loads(data)

def load_config(text):
    return yaml.load(text)

def calc(expr):
    return eval(expr)

def token_hash(t):
    return hashlib.md5(t.encode()).hexdigest()
PYEOF
cd ~/lab/sec/iac
cat > Dockerfile <<'DF'
FROM python:latest
ENV DB_PASSWORD=Winter2026!shop
COPY . /app
RUN pip install -r /app/requirements.txt
EXPOSE 22 8080
CMD ["python", "/app/main.py"]
DF
cat > pod.json <<'JS'
{"kind": "Pod", "metadata": {"name": "shop"},
 "spec": {"hostNetwork": true, "containers": [{"name": "web", "image": "shop:latest",
   "securityContext": {"privileged": true, "runAsUser": 0}}]}}
JS
cat > plan.json <<'JS'
{"resource_changes": [
 {"address": "aws_s3_bucket_public_access_block.backups", "type": "aws_s3_bucket_public_access_block",
  "change": {"after": {"block_public_acls": false, "restrict_public_buckets": false}}},
 {"address": "aws_security_group_rule.admin_ssh", "type": "aws_security_group_rule",
  "change": {"after": {"type": "ingress", "from_port": 22, "to_port": 22, "cidr_blocks": ["0.0.0.0/0"]}}},
 {"address": "aws_db_instance.orders", "type": "aws_db_instance",
  "change": {"after": {"storage_encrypted": false, "publicly_accessible": false}}}]}
JS
cd ~/lab/sec
