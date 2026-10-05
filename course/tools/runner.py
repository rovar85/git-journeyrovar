"""Run a lesson's ```run blocks for real, as an unprivileged user, and capture the output.

All run blocks of one lesson execute in ONE persistent bash session (so cd, variables and
background servers carry over between blocks). A command "unit" is one line, or several lines
until `bash -n` says the text is complete (loops, heredocs, quotes). Lines starting with # are
shown as comments. Results are cached by content hash so the page can be rebuilt without the tools.
"""
import hashlib, json, os, re, shutil, subprocess, sys, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(HERE, "..", "src", "content", "_cache.json")
USER = "student"
HOME = "/home/student"
ENV_VERSION = "v1"                      # bump to force re-recording of everything

def load_cache():
    try:
        return json.load(open(CACHE_PATH))
    except Exception:
        return {}

def save_cache(c):
    json.dump(c, open(CACHE_PATH, "w"), indent=1, sort_keys=True)

def split_units(text):
    """Split a run block into command units."""
    units, cur = [], []
    for line in text.split("\n"):
        if not cur:
            if not line.strip():
                continue
            if line.lstrip().startswith("#"):
                units.append(("comment", line.strip()))
                continue
        cur.append(line)
        candidate = "\n".join(cur)
        r = subprocess.run(["bash", "-n"], input=candidate, capture_output=True, text=True)
        ok = r.returncode == 0 and "here-document" not in r.stderr and not line.rstrip().endswith("\\")
        if ok:
            units.append(("cmd", candidate))
            cur = []
    if cur:
        raise ValueError("incomplete command in run block:\n" + "\n".join(cur))
    return units

def display_cmd(cmd):
    lines = cmd.split("\n")
    return "$ " + lines[0] + "".join("\n> " + l for l in lines[1:])

NORMALIZE = [
    (re.compile(r"\x1b\[[0-9;]*m"), ""),
    (re.compile(r"/home/[A-Za-z0-9_-]+/\.lesson-tmp/run\.sh: line (\d+):"), r"bash: line \1:"),
    (re.compile(r"\bstudent@[A-Za-z0-9-]+"), "student@lab"),
]

def normalize(s):
    for rx, rep in NORMALIZE:
        s = rx.sub(rep, s)
    return s

def run_lesson(lesson_id, setup, blocks):
    """setup: list of bash texts (hidden). blocks: list of run-block texts. Returns list of rendered blocks."""
    key_src = json.dumps([ENV_VERSION, setup, blocks])
    key = hashlib.sha256(key_src.encode()).hexdigest()[:16]
    cache = load_cache()
    if lesson_id in cache and cache[lesson_id]["key"] == key:
        return cache[lesson_id]["blocks"]
    if not shutil.which("runuser") or os.geteuid() != 0 or not os.path.isdir(HOME):
        raise RuntimeError(f"lesson {lesson_id}: content changed but the lab machine is not available to re-run it")
    print(f"  running lesson {lesson_id} ({sum(len(split_units(b)) for b in blocks)} commands)", file=sys.stderr)

    # build one script
    script = ["exec 2>&1", "export PS4='+ '", "mkdir -p ~/lab && cd ~/lab"]
    for s in setup:
        script.append(s)
    script.append("cd ~/lab")
    index = []                                   # (block, unit index, kind, text)
    for bi, b in enumerate(blocks):
        for ui, (kind, text) in enumerate(split_units(b)):
            index.append((bi, ui, kind, text))
            if kind == "cmd":
                script.append(f"printf '\\n@@S:{len(index)-1}@@\\n'")
                script.append(text)
                script.append(f"printf '\\n@@E:{len(index)-1}:%s@@\\n' \"$?\"")
    script.append("cd ~; for j in $(jobs -p); do kill $j 2>/dev/null; done; wait 2>/dev/null; true")
    full = "\n".join(script) + "\n"

    lab = os.path.join(HOME, "lab")
    subprocess.run(["runuser", "-u", USER, "--", "bash", "-c", "rm -rf ~/lab ~/.lesson-tmp; true"], cwd="/")
    env = {"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOME": HOME, "USER": USER,
           "LOGNAME": USER, "LANG": "C.UTF-8", "TERM": "dumb", "SHELL": "/bin/bash", "ANSIBLE_NOCOLOR": "1",
           "NO_COLOR": "1", "ANSIBLE_FORCE_COLOR": "0", "PYTHONUNBUFFERED": "1", "TF_IN_AUTOMATION": "1", "TF_CLI_ARGS_init": "-no-color", "TF_CLI_ARGS_plan": "-no-color", "TF_CLI_ARGS_apply": "-no-color", "TF_CLI_ARGS_destroy": "-no-color", "TF_CLI_ARGS_validate": "-no-color", "TF_CLI_ARGS_test": "-no-color", "TF_CLI_ARGS_console": "-no-color", "TF_CLI_ARGS_output": "-no-color", "TF_CLI_ARGS_show": "-no-color", "TF_CLI_ARGS_fmt": "-no-color", "TF_CLI_ARGS_state": "-no-color", "TF_CLI_ARGS_workspace": "-no-color", "TF_CLI_ARGS_graph": "-no-color"}
    tmpdir = os.path.join(HOME, ".lesson-tmp")
    os.makedirs(tmpdir, exist_ok=True)
    script_path = os.path.join(tmpdir, "run.sh")
    with open(script_path, "w") as fh:
        fh.write(full)
    subprocess.run(["chown", "-R", f"{USER}:{USER}", tmpdir])
    p = subprocess.run(["runuser", "-u", USER, "--", "env", "-i"] + [f"{k}={v}" for k, v in env.items()] + ["bash", "--noprofile", "--norc", script_path],
                       stdin=subprocess.DEVNULL, capture_output=True, text=True, cwd="/", timeout=1500, start_new_session=True)
    raw = p.stdout
    outputs = {}
    for m in re.finditer(r"@@S:(\d+)@@\n(.*?)\n@@E:\1:(\d+)@@", raw, re.S):
        outputs[int(m.group(1))] = (m.group(2), int(m.group(3)))
    rendered = [[] for _ in blocks]
    for i, (bi, ui, kind, text) in enumerate(index):
        if kind == "comment":
            rendered[bi].append({"c": text, "o": ""})
        else:
            out, code = outputs.get(i, ("", -1))
            rendered[bi].append({"c": display_cmd(text), "o": normalize(out.rstrip("\n")), "x": code})
    cache[lesson_id] = {"key": key, "blocks": rendered}
    save_cache(cache)
    return rendered
