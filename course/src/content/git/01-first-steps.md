---
track: git
title: Git first steps
short: First steps
sub: Track changes to files: init, add, commit, status, diff and log.
---

:::goals
- explain what version control is and why every automation project uses it
- create a repository and make commits
- understand the working folder, the staging area and the history
- read `git status`, `git diff` and `git log`
:::

## The problem Git solves

Without version control you end up with `script_final.sh`, `script_final2.sh`, `script_REALLY_final.sh`. **Git** records every change to a set of files as a **commit**: a labelled snapshot with who made it, when, and why. You can compare snapshots, go back to any of them, and work on changes in parallel with other people. Everything in the rest of this course (Docker files, Terraform, Ansible, Jenkins pipelines) lives in Git, so this is the most reusable skill you will learn.

```setup
git config --global user.name "Rohan Student"
git config --global user.email "student@example.com"
git config --global init.defaultBranch main
rm -rf ~/lab/ev-tools
true
```

## Three places a change can live

| Place | Name | Think of it as |
|---|---|---|
| Your files | **working directory** | the desk where you are editing |
| `git add` puts changes here | **staging area** (index) | the box where you pack what goes in the next snapshot |
| `git commit` writes here | **repository** (history) | the album of finished snapshots |

## Make a repository and a first commit

```run
mkdir -p ~/lab/ev-tools && cd ~/lab/ev-tools
git init
echo "#!/bin/bash" > check.sh
echo 'echo "checking EV01"' >> check.sh
git status --short
```

`??` means "untracked": Git sees the file but is not recording it yet.

```run
cd ~/lab/ev-tools
git add check.sh
git status --short
git commit -m "Add EV check script"
git log --format='%s (%an)'
```

`A ` means "added to staging". After `commit`, the working directory, staging area and history all agree and `git status` is clean.

## The edit, review, commit loop

```run
cd ~/lab/ev-tools
echo 'echo "checking SQL01"' >> check.sh
git status --short
git diff
```

`M` is "modified". `git diff` shows what changed (lines starting with `+` were added, `-` removed). Always read your diff before committing.

```run
cd ~/lab/ev-tools
git add check.sh
git diff --staged --stat
git commit -m "Also check SQL01"
git log --format='%h %s' | sed 's/^[0-9a-f]*/<id>/'
```

Every commit has a unique ID (a long hash like `3f2a9c1...`; the short form is 7 characters). Hashes differ on every machine, so the output above hides them.

| Command | What it does |
|---|---|
| `git init` | start a repository in this folder |
| `git status` | what changed, what is staged |
| `git add file` / `git add .` | stage changes |
| `git commit -m "msg"` | save the staged snapshot |
| `git diff` | unstaged changes; `--staged` for staged ones |
| `git log` | history; `--oneline`, `--graph`, `-p` (with patches) |
| `git show ID` | one commit in detail |

## Good commit messages

A message is a note to your future self at 2am. Say **what and why**, in the imperative: "Fix SQL timeout retry", not "changes" or "stuff". One logical change per commit, so it can be reviewed or undone on its own.

## Ignoring files

Some files must never be committed: logs, build output, local settings and above all **secrets** (passwords, keys, tokens). List patterns in `.gitignore`:

```run
cd ~/lab/ev-tools
printf '*.log\n.env\nbuild/\n' > .gitignore
echo "DB_PASSWORD=hunter2" > .env
echo "noise" > run.log
git status --short
git add .gitignore && git commit -q -m "Ignore logs and env files"
git status --short | wc -l
```

`.env` and `run.log` no longer appear. A password committed once stays in history forever, even if you delete the file later, so ignore it **before** the first commit.

## Looking at the past

```run
cd ~/lab/ev-tools
git log -p --format='--- commit: %s' -- check.sh | head -12
git show HEAD~2:check.sh
```

`HEAD` means "the commit I am on now"; `HEAD~1` is its parent and `HEAD~2` its grandparent. `git show HEAD~2:check.sh` prints the file as it was two commits ago.

<!-- deeper -->
## A worked solution and common mistakes

```run
git config --global user.name "Rohan Student"; git config --global user.email "student@example.com"; git config --global init.defaultBranch main
rm -rf ~/lab/backup-tool && mkdir ~/lab/backup-tool && cd ~/lab/backup-tool && git init -q
printf '#!/bin/bash\necho "backup start"\n' > backup.sh && git add . && git commit -q -m "Add backup script skeleton"
echo 'tar -czf /tmp/ev.tar.gz /opt/ev' >> backup.sh && git commit -q -am "Archive the EV folder"
echo 'echo "backup done"' >> backup.sh && git commit -q -am "Print a completion message"
echo "--- which commit introduced the tar line?"
git log -S"tar -czf" --format='%s'
echo "--- the same, with the change shown"
git log -p -S"tar -czf" --format='commit: %s' | grep -E '^(commit|\+)' | grep -v '^+++'
```

`git log -S"text"` ("pickaxe") finds the commits that **added or removed** that text, the fastest way to answer "when did this line appear?".

:::warn Common mistakes
- **One giant commit** with unrelated changes ("updates"). Small, focused commits are reviewable and revertable.
- **`git add .` without looking.** Check `git status` and `git diff --staged`, so you do not commit logs, keys or build output.
- **Committing secrets**, then deleting them in a later commit. The history keeps them; rotate the secret.
- **Committing as the wrong person or not configuring name/email,** which makes history unattributable.
- **Vague messages** like "fix" and "stuff". Say what and why in the imperative.
:::
<!-- /deeper -->

:::recap
- Git stores snapshots (commits). Working directory, staging area, repository.
- Loop: edit, `git diff`, `git add`, `git commit`.
- Write meaningful messages; one logical change per commit.
- `.gitignore` keeps logs and secrets out. Secrets in history are forever.
:::

:::try Your turn
Create a repository for a tiny backup script, commit three times with sensible messages, then use `git log -p` to find the commit that introduced a particular line.
:::

:::quiz
? Which command moves changes into the staging area?
- `git commit`
+ `git add`
- `git push`
- `git log`
! add stages, commit records.
? You added a password to a file and committed it, then deleted the file in the next commit. Is the password safe?
- Yes, it is deleted
+ No, it is still in history; it must be rotated
- Yes, Git encrypts history
- Only if the repository is private
! Treat any committed secret as leaked and change it.
? What does `HEAD~1` mean?
- The first commit ever
+ The parent of the current commit
- The newest commit
- A branch name
! HEAD is the current position.
:::
