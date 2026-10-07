---
track: aifield
title: Tool design: the agent-computer interface
short: Tool design (ACI)
sub: Why Anthropic spent more time on tools than prompts, with runnable examples of poka-yoke tools, helpful errors and a tool-description checklist.
---

:::goals
- explain the agent-computer interface (ACI) and why tools deserve prompt-engineering effort
- design a tool so common mistakes are hard or impossible to make (poka-yoke)
- return errors that teach the model how to recover
- check tool descriptions against a checklist and measure tool use with a tiny harness
:::

:::note Where this lesson comes from
This lesson expands the appendix **"Prompt engineering your tools"** of Anthropic's article [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), which I **read in full** for this course. The quotations and examples (diff versus whole-file, relative versus absolute paths, poka-yoke) are from that appendix. The code is real and runs; a scripted stand-in plays the model.
:::

## 1. Tools are an interface, so design them like one

The article's rule of thumb: people spend a lot of effort on **human-computer interfaces** (HCI), so plan to spend as much on **agent-computer interfaces** (ACI). Its striking claim from building the SWE-bench coding agent: **"we actually spent more time optimizing our tools than the overall prompt."**

An agent is "just an LLM using tools based on environmental feedback in a loop", so the tools set the ceiling on what it can do and how reliably.

### Choose formats the model can write

There are often several ways to express the same action. For a file edit you could write a **diff** or rewrite the **whole file**; for code in structured output you could use **markdown** or **JSON**. Humans see these as equivalent. For a model they are not. The article's guidance:

- Give the model **enough tokens to think** before it writes itself into a corner.
- Keep the format **close to text it has seen naturally** on the internet.
- Avoid **formatting overhead**: a diff needs the line counts of the hunk **before** the code is written; code inside JSON needs every newline and quote escaped.

## 2. Poka-yoke: make mistakes hard to make

**Poka-yoke** ("mistake-proofing") is a manufacturing idea: design so the wrong action is impossible or obvious. The article's own example: the agent made mistakes with **relative file paths** after it had moved out of the root directory. The fix: **require absolute paths**, after which "the model used this method flawlessly".

Reproduce the problem for real:

```run
mkdir -p ~/lab/aifield/aci/repo/src && cd ~/lab/aifield/aci
echo "port = 8080" > repo/src/settings.conf

cat > tools_v1.py <<'EOF'
import os

def read_file(path):
    """v1: accepts any path, relative or absolute."""
    with open(path) as f:
        return f.read().strip()

def change_dir(path):
    os.chdir(path)
EOF
cat > demo_v1.py <<'EOF'
import os
from tools_v1 import read_file, change_dir

print("agent starts in:", os.path.basename(os.getcwd()))
print("read src/settings.conf ->", end=" ")
try:
    # the agent planned this path while it was at the repo root...
    change_dir("repo")
    print(read_file("src/settings.conf"))
    # ...then it wandered into a subdirectory and used the SAME relative path
    change_dir("src")
    print("later, from inside src/: read src/settings.conf ->", end=" ")
    print(read_file("src/settings.conf"))
except FileNotFoundError as e:
    print("ERROR:", e)
EOF
python3 demo_v1.py
```

The tool is correct, and the agent is reasonable, yet the call fails because **the meaning of a relative path depends on hidden state** (the working directory). Now apply poka-yoke: the tool **only accepts absolute paths**, resolves them, and, when something is wrong, returns an error that **says how to fix it**.

```run
cd ~/lab/aifield/aci
cat > tools_v2.py <<'EOF'
import os

ROOT = os.path.abspath("repo")          # the sandbox: tools may only touch files under here

def read_file(path):
    """Read a text file. `path` MUST be absolute and inside the repository root."""
    if not os.path.isabs(path):
        return f"ERROR: path must be absolute. Example: {os.path.join(ROOT, 'src', 'settings.conf')}"
    real = os.path.realpath(path)
    if not real.startswith(ROOT + os.sep):
        return f"ERROR: {path} is outside the repository root {ROOT}. Choose a path under it."
    if not os.path.exists(real):
        near = sorted(os.listdir(os.path.dirname(real)))[:5] if os.path.isdir(os.path.dirname(real)) else []
        return f"ERROR: no such file {path}. Files in that folder: {near or 'folder does not exist'}"
    with open(real) as f:
        return f.read().strip()
EOF
cat > demo_v2.py <<'EOF'
import os
from tools_v2 import read_file, ROOT

os.chdir(os.path.join(ROOT, "src"))                       # the agent has wandered into src/
print("relative path   ->", read_file("src/settings.conf"))
print("wrong file name ->", read_file(os.path.join(ROOT, "src", "setting.conf")))
print("outside root    ->", read_file("/etc/hostname"))
print("correct call    ->", read_file(os.path.join(ROOT, "src", "settings.conf")))
EOF
python3 demo_v2.py
```

Three things happened:

1. The ambiguous input became **impossible**: there is no relative-path case left to get wrong.
2. Every failure returned a **message the model can act on**: an example of the right form, the folder listing, the allowed root. A bare "Error 2" would teach it nothing.
3. The **sandbox check** (`realpath` under `ROOT`) is a **security control** as well as a usability one: the model can be misled by a prompt injection, so a tool should not be able to read `/etc` or write outside the project no matter what it is asked.

## 3. Write the description for a junior developer

The article's checklist, turned into a script. A tool definition should contain:

- **what** it does and **when to use it** (and when **not** to; "clear boundaries from other tools"),
- an **example call** and **edge cases**,
- **input format requirements** and **clear parameter names** (`customer_email`, not `q`),
- a statement of what it **returns**, including the **error** forms.

```run
cd ~/lab/aifield/aci
cat > lint_tools.py <<'EOF'
def lint(tool):
    problems = []
    d = tool["description"].lower()
    if len(d.split()) < 12:                       problems.append("description is too short to explain when to use it")
    if "example" not in d:                         problems.append("no example call")
    if "do not use" not in d and "not for" not in d: problems.append("no boundary with similar tools")
    for p, desc in tool["params"].items():
        if len(p) < 3:                             problems.append(f"parameter {p!r} has a cryptic name")
        if not desc:                               problems.append(f"parameter {p!r} has no description")
    return problems

weak = {"name": "q", "description": "Searches stuff.", "params": {"q": "", "n": ""}}
good = {
    "name": "search_runbooks",
    "description": ("Search the internal runbooks for troubleshooting steps. Use it when the user reports a failing service. "
                    "Example: search_runbooks(query='indexing timeout SQL01', max_results=3). "
                    "Not for HR policies or tickets; use search_tickets for those."),
    "params": {"query": "keywords describing the symptom", "max_results": "1 to 10, default 3"},
}
for t in (weak, good):
    probs = lint(t)
    print(f"{t['name']}: {'OK' if not probs else ''}")
    for p in probs: print("   -", p)
EOF
python3 lint_tools.py
```

## 4. Test how the model really uses your tools

The article says: run **many example inputs** and **see what mistakes the model makes**, then iterate. A tiny harness records the tool calls from a scripted model and counts mistakes **before and after** a tool change:

```run
cd ~/lab/aifield/aci
cat > harness.py <<'EOF'
import os, re
import tools_v1, tools_v2
from tools_v2 import ROOT

# scripted "model" calls: some use relative paths from different working directories
CALLS = [("src/settings.conf", "repo"), ("src/settings.conf", "repo/src"), ("settings.conf", "repo/src"),
         (os.path.join(ROOT, "src", "settings.conf"), "repo/src"), ("../src/settings.conf", "repo/src")]

def call(tool, path, cwd):
    os.chdir(os.path.join(os.path.dirname(ROOT), cwd))
    try:
        return tool(path)
    except FileNotFoundError as e:
        return f"ERROR: {e}"

def attempt(tool, path, cwd):
    """First try; if it fails, a model can retry ONLY if the error message names a path to use."""
    out = call(tool, path, cwd)
    if not out.startswith("ERROR"):
        return "first try"
    hint = re.search(r"Example: (\S+)", out)
    if hint and not call(tool, hint.group(1), cwd).startswith("ERROR"):
        return "after retry"
    return "failed"

for name, tool in (("v1 (any path, bare error)", tools_v1.read_file), ("v2 (absolute only, helpful error)", tools_v2.read_file)):
    results = [attempt(tool, p, cwd) for p, cwd in CALLS]
    print(f"{name:34} first try {results.count('first try')}, after one retry {results.count('after retry')}, failed {results.count('failed')}")
EOF
python3 harness.py
```

The strict v2 tool fails **more often on the first try** (it refuses anything but an absolute path), yet it ends with **no permanent failures**, because each error tells the model the exact form to use. v1 accepts sloppy calls, but when one breaks, its error message gives the model **nothing to retry with**. Counting first-try success alone would have told you the opposite story, so measure the **end result**.

In a real project the "calls" come from running your agent on a set of tasks and logging every tool call. Look for **repeated** mistakes: they point to a confusing name, a missing example or an input format that is hard to write.

:::warn Common mistakes
- **Tools that mirror your internal API** (20 parameters, cryptic names). Design for the model's task, not for your database.
- **Hidden state** (current directory, selected record, logged-in context) that the model must remember. Make state explicit in arguments.
- **Unhelpful errors** (`failed`, a stack trace). Say what went wrong and what to try.
- **Overlapping tools** with vague boundaries; the model picks the wrong one. State when **not** to use each.
- **No sandbox.** Assume the model can be tricked, and enforce limits in the tool.
- **Never testing with real model calls.** Your idea of "obvious" is not the model's.
:::

:::recap
- Treat tools as an **agent-computer interface** and give them the same care as a human interface; Anthropic reports spending more time on tools than on the prompt.
- **Poka-yoke:** change arguments so mistakes are hard (absolute paths, enums, required fields).
- Return **errors that teach**, and enforce **sandbox limits** inside the tool.
- Describe each tool like a docstring for a junior developer: purpose, when and when not, example, formats, returns.
- **Test with real usage** and iterate on the mistakes you see.
:::

:::try Your turn
Add a `write_file(path, text)` tool to `tools_v2.py` with the same safety rules, plus a rule that it refuses to overwrite an existing file unless called with `overwrite=True`. Write three calls that exercise each error message, and lint its description with `lint_tools.py`.
:::

:::quiz
? What was the fix for the relative-path mistakes in the article's coding agent?
+ Changing the tool to always require absolute file paths
- Writing a longer system prompt
- Using a bigger model
- Removing the file tool
! Making the wrong input impossible solved the problem completely.
? What makes an error message useful to an agent?
+ It states what went wrong and how to fix it
- It contains a stack trace
- It is as short as possible
- It is hidden from the model
! The model can act on specific guidance.
? Why enforce a root directory inside the tool?
+ The model may be misled, so the tool must limit what it can do whatever it is asked
- To make paths shorter
- Because absolute paths need it
- It is only for speed
! Limits belong in code, not only in the prompt.
:::
