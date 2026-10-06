---
track: git
title: Tags, hooks and team practices
short: Team practices
sub: Releases with tags, guard rails with hooks, workflows, and keeping secrets out.
---

:::goals
- mark releases with tags
- use `blame`, `bisect` and `grep` to investigate history
- add a pre-commit hook that blocks secrets
- describe common branching workflows and the "everything as code" idea
:::

## Tags: named releases

A **tag** is a permanent label on one commit, used for release versions (`v1.4.0`). Unlike branches, tags do not move. Pipelines often deploy "whatever is tagged".

```setup
git config --global user.name "Rohan Student"
git config --global user.email "student@example.com"
git config --global init.defaultBranch main
rm -rf ~/lab/ev-team
mkdir -p ~/lab/ev-team && cd ~/lab/ev-team
git init -q
echo "v1" > app.txt && git add . && git commit -q -m "First release"
true
```

```run
cd ~/lab/ev-team
git tag -a v1.0.0 -m "First release"
echo "v2" > app.txt && git commit -q -am "Second release prep"
git tag -a v1.1.0 -m "Second release"
git tag
git show v1.0.0:app.txt
```

Tags are shared with `git push --tags`. Version numbers commonly follow **semantic versioning**: `MAJOR.MINOR.PATCH` (breaking change, new feature, bug fix).

## Investigating history

```run
cd ~/lab/ev-team
printf 'line one\nline two\n' > notes.txt
git add . && git commit -q -m "Add notes"
echo "line three" >> notes.txt
git commit -q -am "Extend notes"
git blame -s notes.txt | sed -E 's/^[0-9a-f]+ +/<id> /'
git log --format='%s' -S"line three"
```

- `git blame file` shows who last changed each line and in which commit.
- `git log -S"text"` finds commits that added or removed that text.
- `git bisect` binary-searches history for the commit that broke something: mark one commit good, one bad, and Git checks out midpoints for you to test (it can run a test script automatically).

## Hooks: guard rails on your machine

A **hook** is a script Git runs at certain moments. The `pre-commit` hook runs before a commit is recorded; if it exits non-zero the commit is refused. Here is one that blocks obvious secrets:

```run
cd ~/lab/ev-team
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
if git diff --cached | grep -E '^\+.*(PASSWORD|SECRET|API_KEY)=' > /dev/null; then
  echo "pre-commit: possible secret in staged changes. Commit refused."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
echo "DB_PASSWORD=hunter2" > config.env
git add config.env
git commit -m "Add config" ; echo "exit code: $?"
git restore --staged config.env; rm config.env
```

Local hooks can be skipped (`--no-verify`) and are not shared by `git clone`, so teams enforce the same checks again in CI and with server-side rules. Tools like `pre-commit` and secret scanners (`gitleaks`) package this properly.

## Workflows

| Workflow | Idea | Fits |
|---|---|---|
| **Trunk-based** | tiny branches, merge to `main` many times a day, feature flags | teams with good tests and CI |
| **GitHub flow** | branch, PR, review, merge to `main`, deploy | most web and ops teams |
| **Git flow** | long-lived `develop`, `release/*`, `hotfix/*` branches | scheduled releases, packaged software |

Whatever you choose, agree on: branch naming, PR review rules, who may merge, and how releases are tagged.

## Git is the spine of DevOps

Once configuration and infrastructure are text files in Git you gain review, history and rollback for everything. This is the idea of **GitOps** and **infrastructure as code**:

| What | Lives in Git as |
|---|---|
| Server setup | Ansible playbooks |
| Cloud resources | Terraform files |
| Build/deploy process | `Jenkinsfile` |
| Container images | `Dockerfile` |
| Cluster state | Kubernetes YAML |

A change to production becomes: edit a file, open a PR, get a review, merge, and let automation apply it. The Capstone track connects all of them.

## Cheat sheet

```run
cat <<'EOF'
git status -sb              where am I, what changed
git add -p                  stage selected pieces of a file
git commit -m "msg"         record
git switch -c name          new branch
git pull --rebase           update my branch, keep history linear
git push -u origin name     publish a branch
git log --graph --oneline --all
git restore file            drop uncommitted edit
git revert ID               undo shared commit
git stash / stash pop       park / resume
git reflog                  find lost commits
EOF
```

<!-- deeper -->
## A worked solution and common mistakes

```run
git config --global user.name "Rohan Student"; git config --global user.email "student@example.com"; git config --global init.defaultBranch main
rm -rf ~/lab/hooked && mkdir ~/lab/hooked && cd ~/lab/hooked && git init -q
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
limit=$((1024 * 1024))
for f in $(git diff --cached --name-only --diff-filter=ACM); do
  size=$(wc -c < "$f")
  if [ "$size" -gt "$limit" ]; then
    echo "pre-commit: $f is $size bytes (limit $limit). Commit refused."
    exit 1
  fi
done
EOF
chmod +x .git/hooks/pre-commit
head -c 2000000 /dev/zero > big.bin; echo small > small.txt
git add small.txt && git commit -q -m "small file" && echo "small file: committed"
git add big.bin && git commit -m "big file"; echo "exit code: $?"
```

The hook inspects only the **staged** files (`--cached`), measures each, and exits non-zero to stop the commit. Remember a local hook can be bypassed with `--no-verify`, and is not copied by `git clone`: put the same check in CI (and in server-side rules) as well. For genuinely large files, use **Git LFS** instead of committing them directly.

:::warn Common mistakes
- **Relying on local hooks as the only control** (they can be skipped and are per-clone).
- **Hooks that are slow,** so people bypass them. Keep them to seconds.
- **Forgetting `chmod +x`** on the hook (it silently does nothing).
- **Committing large binaries** and bloating the repository permanently (history keeps them).
- **Tagging without a message or a convention,** then not knowing what a release contained.
:::
<!-- /deeper -->

:::recap
- Tags mark releases; semantic versioning is common.
- `blame`, `log -S` and `bisect` find who/when/why.
- Hooks stop mistakes locally; CI repeats the check for everyone.
- Pick a workflow (GitHub flow is a good default); everything-as-code lives in Git.
:::

:::try Your turn
Add a pre-commit hook that refuses to commit files larger than 1 MB. Test it with a generated file.
:::

:::quiz
? What is a tag?
- A branch that moves
+ A permanent label on one commit, usually a release
- A kind of conflict
- A remote
! Branches move; tags do not.
? Why enforce secret checks in CI as well as hooks?
+ Local hooks can be bypassed or may not be installed
- Hooks do not work
- CI is faster
- Hooks delete secrets
! Defence in depth.
? Which command shows who last changed each line?
- `git log`
- `git diff`
+ `git blame`
- `git stash`
! Blame annotates lines with commit and author.
:::
