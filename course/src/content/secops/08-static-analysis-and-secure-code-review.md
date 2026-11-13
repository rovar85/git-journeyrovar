---
track: secops
title: "Static analysis and secure code review"
short: Code scanning
sub: Read code without running it to find risky patterns: a small analyser built on Python's syntax tree, the real Bandit scanner on the same file, what each misses, and a review checklist.
---

@setup secops

:::goals
- explain how static analysis (SAST) finds problems without running code
- build a small analyser on the Python syntax tree
- run Bandit and read severity and rule IDs
- know the limits of scanners and what a human reviewer checks
:::

## 1. Reading code, not running it

**Static application security testing (SAST)** parses source code and looks for risky patterns: string-built SQL, `eval`, unsafe deserialisation, weak hashes, hard-coded keys. It runs in seconds on every pull request, long before the code reaches a server. Its partner **DAST** (dynamic testing, for example OWASP ZAP) attacks the running app from outside; each finds things the other misses.

The lab folder has a deliberately bad `app.py`:

```run
cd ~/lab/sec
cat -n app.py
```

## 2. A small analyser on the syntax tree

Python's `ast` module turns code into a tree of calls, names and assignments. Walking that tree is far more reliable than searching text, because it sees structure (a call to `subprocess.run` with `shell=True`, a `.execute` whose argument is built with `%`).

```run
cd ~/lab/sec
cat sast.py
python3 sast.py app.py
```

## 3. The real tool: Bandit

**Bandit** is the standard open-source SAST tool for Python (Semgrep and CodeQL cover many languages; SonarQube adds code quality). Same file:

```run
cd ~/lab/sec
bandit -q app.py -f custom --msg-template "{line:<3} {severity:6} {test_id} {msg}"
```

Compare the two:

- Bandit adds a **severity** and a **rule ID** (B602, B608...) you can look up, allow-list or report on.
- Bandit also warned about **importing** pickle (B403), a low-severity heads-up.
- Bandit did **not** flag `API_KEY = "sk-..."`: its hard-coded password rules look for names like password. Our analyser and the secret scanner from [lesson 6](#secops-6) caught it. **No single tool finds everything**; teams run a few that complement each other.

Bandit cannot run in the in-page lab; use Codespaces or `pip install bandit`.

## 4. What scanners miss: the human review

Scanners find **patterns**. They do not understand intent, so a reviewer checks what no rule can:

- **Authorisation:** does every new endpoint check who may call it and what they may touch ([lesson 5](#secops-5))?
- **Business logic:** can a coupon be applied twice? Can a price come from the client?
- **Trust boundaries:** where does outside data enter, and is it validated there?
- **Secrets and logging:** no keys in code, no passwords or tokens in logs.
- **Error handling:** fail closed (deny) on errors, and do not leak stack traces to users.

Tune scanners so the pipeline only blocks on findings people agree with; a tool that cries wolf gets switched off.

## Common misconceptions

- "The scanner is green, so the code is secure." Scanners cannot see missing authorisation checks or broken business logic.
- "Every finding must be fixed before merge." Triage: fix real ones, mark false positives with a reason, and block only on agreed severities.
- "Text search is good enough." Parsing the code avoids matches in comments and strings and sees arguments like shell=True.

## Practice (answers below)

1. Add a rule to `sast.py` that flags `requests.get(..., verify=False)`.
2. Which finding in `app.py` would you fix first, and why?
3. Name two problems a SAST tool is unlikely to find.

:::recap
- **SAST** reads code without running it; **DAST** attacks the running app; use both.
- Analysers built on the **syntax tree** see structure that text search misses.
- **Bandit** gives severities and rule IDs; different tools catch different things.
- Humans review **authorisation, business logic, trust boundaries, secrets in logs and error handling**.
:::

:::note Answers
1. In `visit_Call`: `if n.startswith("requests.") and any(k.arg == "verify" and getattr(k.value, "value", True) is False for k in node.keywords): self.found.append((node.lineno, n, "TLS verification turned off"))`. 2. `shell=True` with user input in `ping` (command injection, remote code execution) or the SQL injection; both let an attacker run code or read data. 3. A missing ownership check on an endpoint (IDOR) and a business-logic flaw such as applying a discount twice.
:::

```quiz
? What does SAST analyse?
+ Source code, without running it
- Network traffic
- A running website from outside
- Server memory
! Static means the program is not executed.

? Why was `API_KEY = "sk-..."` missed by Bandit but found by our analyser?
+ Bandit's hard-coded secret rules key on names like password; our rule also checks key and token
- Bandit cannot read strings
- The key was encrypted
- It was in a comment
! Tools have different rules; combine them.

? Which is a human reviewer's job more than a scanner's?
+ Checking that every endpoint enforces who may access what
- Finding eval calls
- Finding MD5 use
- Finding shell=True
! Missing checks are absences, which pattern rules struggle to see.
```
