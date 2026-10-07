---
track: aifield
title: Agentic coding: verification, context and workflow (Claude Code practices)
short: Agentic coding
sub: The practices from Anthropic's Claude Code best-practices guide, shown with runnable demos: verify, plan first, protect the context window, and review with a fresh mind.
---

:::goals
- explain why the context window is the scarce resource in agentic coding
- give an agent a way to verify its own work and watch the verify loop converge
- use the explore, plan, implement, commit workflow and know when to skip planning
- write a short CLAUDE.md, and recognise skills, hooks, subagents and MCP as different tools
- avoid the five common failure patterns
:::

:::note Where this lesson comes from
This lesson follows Anthropic's [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) guide (the page linked as "Claude Code Best Agentic Coding practices"), which I **read in full** for this course, and the Building Effective Agents article. Settings, commands and file names below are as that guide describes them at the time of reading; tools change, so check the current documentation. The code demos are real and run, but use scripted stand-ins instead of a model.
:::

## 1. The one constraint behind most advice

A coding agent such as Claude Code reads files, runs commands and edits code on its own. Its working memory is the **context window**, which holds the conversation, **every file it read** and **every command output**. The guide's central point: **performance degrades as the context fills**, so context is the resource to manage. Almost every tip below saves context or keeps it clean.

A rough estimate (about four characters per token) shows how fast it fills:

```run
mkdir -p ~/lab/aifield && cd ~/lab/aifield
cat > context.py <<'EOF'
BUDGET = 200_000                      # tokens; use your model's real limit
def tokens(chars): return chars // 4  # rough rule of thumb for English and code

session = [
    ("system prompt, tools, CLAUDE.md",       12_000 * 4),
    ("read 25 source files (avg 6 KB)",       25 * 6_000),
    ("test run output (full, noisy)",         40_000),
    ("big log pasted in",                     120_000),
    ("the actual conversation (30 turns)",    30 * 1_500),
]
used = 0
for what, chars in session:
    used += tokens(chars)
    print(f"{what:40} +{tokens(chars):6} tokens  total {used:7}  ({used / BUDGET:4.0%} of budget)")

print("\nThe same exploration done by a subagent that returns a 1 KB summary:")
sub_used = tokens(12_000 * 4) + tokens(1_000) + tokens(30 * 1_500)
print(f"  main session total {sub_used} tokens ({sub_used / BUDGET:.0%} of budget)")
EOF
python3 context.py
```

Exploration (reading many files, long logs) is what burns the budget, which is why the guide recommends **subagents** for investigation: they explore in their **own** context and report back a summary.

## 2. Give the agent a way to verify its work

> "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop."

A **check** is anything that returns a signal the agent can read: tests, a build exit code, a linter, a script that diffs output with a fixture, a screenshot compared to a design. With a check, the loop closes on its own: **change, run the check, read the result, iterate**.

Watch it converge. The "agent" below is scripted (a list of patches), but the **test run is real**:

```run
cd ~/lab/aifield
mkdir -p verify && cd verify
cat > pricing.py <<'EOF'
def discount(total, customer_years):
    """Return the discounted total. 10% off for 2+ years, 20% off for 5+ years."""
    if customer_years > 2:
        return total * 0.9
    return total
EOF
cat > test_pricing.py <<'EOF'
import unittest
from pricing import discount

class T(unittest.TestCase):
    def test_new(self):      self.assertEqual(discount(100, 1), 100)
    def test_two_years(self): self.assertEqual(discount(100, 2), 90)
    def test_five_years(self): self.assertEqual(discount(100, 5), 80)
if __name__ == "__main__":
    unittest.main(verbosity=0)
EOF
cat > agent_loop.py <<'EOF'
import subprocess, re, sys

PATCHES = [   # what a model would propose one at a time; here they are scripted
    ("fix the 2-year boundary", "customer_years > 2", "customer_years >= 2"),
    ("add the 5-year tier", "    if customer_years >= 2:", "    if customer_years >= 5:\n        return total * 0.8\n    if customer_years >= 2:"),
]

def run_check():
    r = subprocess.run([sys.executable, "test_pricing.py"], capture_output=True, text=True)
    failed = re.findall(r"^(?:FAIL|ERROR): (\w+)", r.stderr, re.M)
    return r.returncode == 0, failed

ok, failed = run_check()
print("initial check:", "PASS" if ok else f"FAIL {failed}")
for what, old, new in PATCHES:
    if ok: break
    src = open("pricing.py").read()
    open("pricing.py", "w").write(src.replace(old, new))
    ok, failed = run_check()
    print(f"after patch '{what}':", "PASS" if ok else f"FAIL {failed}")
print("EVIDENCE: exit code of the real test run =", 0 if ok else 1)
EOF
python3 agent_loop.py
```

The two prompts below differ only in whether the agent has a check. The guide's examples:

| Weak prompt | Strong prompt |
|---|---|
| "implement a function that validates email addresses" | "write a validateEmail function. Examples: user@example.com is true, invalid is false, user@.com is false. **Run the tests after implementing.**" |
| "make the dashboard look better" | "[screenshot] implement this design. **Take a screenshot of the result and compare it to the original.** List differences and fix them." |
| "the build is failing" | "the build fails with this error: [error]. Fix it and **verify the build succeeds**. Address the root cause, don't suppress the error." |

Ask for **evidence**, not claims: the test output, the command and its result, a screenshot. Reviewing evidence is faster than re-running the check yourself. The guide lists stronger gates too: a **`/goal` condition** that an evaluator re-checks after each turn, a **Stop hook** that blocks finishing until a script passes, and a **verification subagent** in a fresh context.

## 3. Explore, then plan, then code

The guide's four phases, using **plan mode** (read and think, no edits) for the first two:

1. **Explore**: read the relevant code, ask questions.
2. **Plan**: ask for a detailed implementation plan; edit it if needed.
3. **Implement**: switch out of plan mode and code against the plan, running tests.
4. **Commit**: descriptive message and a pull request.

**Skip the plan** when you could describe the change in one sentence (a typo, a log line, a rename). Plan when you are unsure of the approach, the change spans files, or you do not know the code. For a larger feature, the guide suggests having the agent **interview you** first, write a **SPEC.md**, then start a **fresh session** to implement it with clean context. A good spec names the files and interfaces, states what is **out of scope**, and ends with an **end-to-end verification step**.

## 4. Be specific, and give real content

| Instead of | Say |
|---|---|
| "add tests for foo.py" | "write a test for foo.py covering the case where the user is logged out. Avoid mocks." |
| "fix the login bug" | "users report login fails after session timeout. Check the auth flow in src/auth/, especially token refresh. Write a failing test that reproduces it, then fix it." |
| "add a calendar widget" | "look at how existing widgets on the home page are implemented (HotDogWidget.php is a good example) and follow the pattern" |

Reference files with `@path`, paste screenshots, give URLs, and **pipe data in** (`cat error.log | claude -p "explain this error"`). Vague prompts are fine when you are **exploring** and can afford to course-correct.

## 5. Configure the environment

**CLAUDE.md** is a file read at the start of every session. Keep it **short**. For each line ask: "would removing this cause a mistake?" The guide's include and exclude lists:

| Include | Exclude |
|---|---|
| shell commands the agent cannot guess | anything it can learn by reading the code |
| code style that **differs** from defaults | standard language conventions |
| how to run tests, preferred runner | long API documentation (link instead) |
| branch and PR conventions | information that changes often |
| project-specific architecture decisions | file-by-file descriptions |
| environment quirks, gotchas | "write clean code" |

A short example, in the style of the guide (Example, not run here):

```markdown:CLAUDE.md (Example, not run here)
# Code style
- Use ES modules (import/export), not CommonJS (require)
# Workflow
- Typecheck when you finish a series of changes
- Prefer running a single test file over the whole suite
```

An over-long CLAUDE.md is **ignored in part**, because important rules get lost in noise. Treat it like code: prune it when behaviour goes wrong.

Pick the right extension tool:

| Tool | Use it for | Property |
|---|---|---|
| **CLAUDE.md** | broad rules every session needs | advisory, always loaded |
| **Skills** (`.claude/skills/NAME/SKILL.md`) | domain knowledge or a repeatable workflow, loaded **on demand** | saves context |
| **Hooks** | actions that **must** happen every time (run the linter after each edit, block writes to migrations) | **deterministic**, not advisory |
| **Subagents** (`.claude/agents/`) | isolated tasks with their own context and tool list (a security reviewer) | keeps main context clean |
| **MCP servers** | connect external systems (issue tracker, database, design tool) | integration |
| **CLI tools** (`gh`, `aws`, `gcloud`) | talking to services | the most context-efficient way |

**Permissions** matter too: allowlist the commands you trust, use sandboxing for OS-level isolation, and keep manual approval for risky actions. The guide describes an **auto mode** in which a separate classifier model reviews actions; it is a safety net, not a reason to skip sandboxing.

## 6. Manage the session

- **Correct early.** `Esc` stops the agent mid-action with context kept; double-`Esc` or `/rewind` restores earlier conversation and code state. After **two failed corrections** on the same issue, `/clear` and restart with a better prompt that includes what you learned.
- **`/clear` between unrelated tasks.** `/compact <what to keep>` summarises when you must continue.
- **Subagents for investigation**, so reading 50 files costs you a summary, not 50 files.
- **Name and resume sessions** like branches (`--continue`, `--resume`).
- **Checkpoints** are not a replacement for git (changes made by shell commands are not captured).

## 7. Scale up: automation and parallel work

- **Non-interactive mode**: `claude -p "prompt"` for CI, hooks and scripts, with `--output-format json` or `stream-json` so programs can read the result.
- **Fan out**: loop over a task list, calling the agent per file, test on 2 or 3 files, then run all. Pre-approve only the tools needed (`--allowedTools`).
- **Parallel sessions** in separate git worktrees, so edits do not collide.
- **Writer and reviewer**: one session writes, a **fresh** session reviews (it is not biased towards code it just wrote). A review prompt should ask for **gaps against the plan or correctness**, not style, or you will chase findings and over-engineer.

## 8. The five failure patterns

| Pattern | Fix |
|---|---|
| **Kitchen-sink session**: unrelated tasks mixed in one context | `/clear` between tasks |
| **Correcting over and over**: failed attempts pile up | after two corrections, `/clear` and write a better prompt |
| **Over-specified CLAUDE.md**: rules get lost | prune; convert must-always rules to hooks |
| **Trust-then-verify gap**: plausible code that misses edge cases | always provide tests, scripts or screenshots; if you cannot verify it, do not ship it |
| **Infinite exploration**: "investigate" with no scope | scope narrowly or use subagents |

:::warn Beyond the guide: treat the agent like a powerful new colleague
- **Never give an agent credentials it does not need.** Prefer sandboxes, short-lived tokens and read-only access.
- **Review what it did, not what it said.** Read the diff and the command log.
- **Prompt injection applies to coding agents too:** text in a file, issue or web page can try to steer the agent. Be careful when it processes untrusted content, especially with broad permissions.
:::

:::recap
- **Context is the scarce resource.** Clear it, compact it, and send exploration to subagents.
- **Give the agent a check it can run** (tests, build, screenshot) and ask for evidence. This is the highest-leverage practice.
- **Explore, plan, implement, commit.** Skip planning for one-sentence changes.
- Be specific, point at examples, give real data. Keep CLAUDE.md short; use skills, hooks, subagents and MCP for the rest.
- Review with a **fresh context**, correct early, and avoid the five failure patterns.
:::

:::try Your turn
Break `pricing.py` in a new way (for example make the 5-year tier 25%) without touching the tests, then run `agent_loop.py`. What does the loop report, and what does that tell you about the quality of the tests? Then write a prompt for a real agent that includes a verification step, scope, and an example to follow.
:::

:::quiz
? Why does the guide recommend subagents for investigation?
+ They explore in a separate context and return a summary, keeping the main context clean
- They are faster at typing
- They avoid the need for tests
- They use fewer permissions
! Exploration is what fills the context window.
? What is the single highest-leverage practice in the guide?
+ Give the agent a check it can run to verify its work
- Write a very long CLAUDE.md
- Never use plan mode
- Use vague prompts
! Without a check, "looks done" is the only signal.
? When should a rule move from CLAUDE.md to a hook?
+ When it must happen every time with no exceptions
- When it is too short
- When the model is large
- Never
! Hooks are deterministic; CLAUDE.md is advisory.
? After correcting the agent twice on the same issue, what should you do?
+ Clear the context and restart with a better prompt that includes what you learned
- Correct it a third time
- Switch to a vague prompt
- Ignore the issue
! Failed attempts in the context make results worse.
:::
