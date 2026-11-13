---
track: secops
title: "Secrets: keep them out of code, find them when they slip"
short: Secrets
sub: Why a deleted password is still in git history, a secret scanner built from patterns and entropy, and the right places for secrets: environment, secret stores and short-lived credentials.
---

@setup secops

:::goals
- explain why secrets in code are dangerous even after they are deleted
- scan files and git history for secrets with patterns and entropy
- choose where secrets should live and how apps get them
- respond correctly when a secret leaks: rotate first
:::

## 1. The problem

Passwords, API keys and private keys end up in code because it is quick. Then the code is pushed, shared, forked, copied to laptops and build servers. Bots scan public repositories and find new keys within minutes. And **deleting the line does not remove it**: version control keeps every old version.

## 2. Watch it happen

A small app commits two secrets and a token, notices, and "removes" them in a second commit. Then we scan the current files, the whole history, and finally show how easy it is to dig the old value out.

```run
cd ~
mkdir -p ~/lab/sec/app && cd ~/lab/sec/app && rm -rf .git *
git init -q && git config user.name dev && git config user.email dev@example.com
cat > settings.py <<'PY'
DB_HOST = "db.internal"
DB_PASSWORD = "Winter2026!shop"
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
API_TOKEN = "q8ZrT2vLx9WkP4mNc7HjB3sYd6Fg"
PY
git add . && git commit -qm "first version"
# someone notices and "removes" the secrets
cat > settings.py <<'PY'
import os
DB_HOST = "db.internal"
DB_PASSWORD = os.environ["DB_PASSWORD"]
PY
git add . && git commit -qm "remove secrets"
echo "--- current files:"; python3 ../scan.py settings.py
echo "--- whole history:"; git log -p | python3 ../scan.py -
echo "--- the old value is one command away:"; git log -p -S Winter2026 --format="%h %s" | grep -E "^[0-9a-f]{7}|Winter"
```

The current files are clean. The history is not: anyone who clones the repository can read the old password with one command. The scanner (`scan.py`, from this track's lab folder) uses two methods that real tools also combine:

- **Patterns** for known formats (AWS key IDs start with `AKIA`, private keys have a `BEGIN ... PRIVATE KEY` line, quoted values assigned to names like password or token).
- **Entropy:** random-looking strings (a high spread of characters) are probably keys, even in a format nobody wrote a rule for. This finds more, with more false alarms.

Real tools: **gitleaks** and **TruffleHog** (also check whether a found key is live), GitHub secret scanning and push protection, and pre-commit hooks that block the commit on your laptop.

## 3. When a secret leaks: rotate first

1. **Revoke and replace** the secret immediately. Assume it is already used.
2. Check the provider's logs for use you did not expect.
3. Only then clean the history (`git filter-repo` or BFG) if needed; it does not undo copies others already have.
4. Find out how it happened and add a check (a pre-commit hook, a pipeline scan) so it cannot happen the same way again.

## 4. Where secrets should live

- **Not in code, images or chat.** Not in Dockerfile `ENV` lines either ([lesson 9](#secops-9)).
- In a **secret store**: cloud secret managers, HashiCorp Vault, Kubernetes Secrets (with encryption at rest), CI secret variables.
- Delivered at run time as environment variables or mounted files, read by the app: `os.environ["DB_PASSWORD"]`.
- Better than any stored secret: **short-lived credentials** from an identity. Cloud roles for machines, OIDC federation from CI to the cloud. Nothing to leak that still works tomorrow.
- `.env` files for local development go in `.gitignore`; commit a `.env.example` with fake values instead.

## Common misconceptions

- "The repository is private, so secrets in it are fine." Private repositories get cloned, forked, shared with vendors and leaked.
- "I deleted the commit, so it is gone." Copies, forks, caches and CI logs keep it; rotate the secret.
- "Base64 in a Kubernetes Secret is encryption." It is encoding; turn on encryption at rest and limit who can read Secrets.

## Practice (answers below)

1. Add a rule to `scan.py` for strings that start with `ghp_` followed by 36 letters and digits (the shape of a GitHub personal token).
2. Your scanner flags a long random test fixture as a secret. What are two good ways to handle it?
3. Why are short-lived credentials better than a well-guarded long-lived key?

:::recap
- Secrets in code leak through copies and **history**; deleting the line is not enough.
- Scanners combine **patterns** and **entropy**; run them in pre-commit hooks and in CI (gitleaks, TruffleHog, push protection).
- On a leak: **rotate first**, check logs, then clean up and prevent a repeat.
- Keep secrets in a **secret store**, deliver them at run time, and prefer **short-lived credentials** from roles and OIDC.
:::

:::note Answers
1. `"GitHub token": r"\bghp_[A-Za-z0-9]{36}\b",` in `RULES`. 2. Add an allow-list entry for that exact file or value, with a comment and an owner; or generate the fixture at test time so it is never stored. 3. A leaked short-lived credential stops working within minutes or hours, and there is no key to rotate or forget.
:::

```quiz
? A password was committed and removed in the next commit. Is it safe?
+ No, it is still in the history; rotate it
- Yes, the second commit removed it
- Only if the repository is private
- Yes, if nobody starred the repository
! History keeps every version.

? What is the FIRST thing to do when an API key leaks?
+ Revoke and replace the key
- Rewrite git history
- Delete the repository
- Wait to see if it is used
! Assume it is already in an attacker's hands.

? What does an entropy check look for?
+ Random-looking strings that are probably keys
- Long comments
- Unused variables
- Slow functions
! Keys are random; normal words are not.
```
