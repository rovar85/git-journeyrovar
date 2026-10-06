---
track: git
title: Branches, merging and conflicts
short: Branches, merge
sub: Work on changes in parallel, combine them, and resolve a conflict calmly.
---

:::goals
- explain a branch as a movable label on a commit
- create, switch and merge branches
- resolve a merge conflict
- tell a fast-forward from a merge commit
:::

## A branch is a label

A **branch** is just a movable name that points at a commit. Creating one is instant and free. The convention: `main` holds working, reviewable code; each piece of work happens on its own short-lived branch and is merged back when ready. That keeps half-finished work away from everyone else.

```setup
git config --global user.name "Rohan Student"
git config --global user.email "student@example.com"
git config --global init.defaultBranch main
rm -rf ~/lab/ev-branches
true
```

```run
mkdir -p ~/lab/ev-branches && cd ~/lab/ev-branches
git init -q
printf 'server=EV01\nretries=3\n' > evault.conf
git add . && git commit -q -m "Initial config"
git branch --show-current
git switch -c feature/more-retries
git branch
```

The `*` marks the branch you are on. `git switch -c name` creates and switches (older: `git checkout -b name`).

```run
cd ~/lab/ev-branches
sed -i 's/retries=3/retries=5/' evault.conf
git commit -q -am "Raise retries to 5"
git switch -q main
echo "on main:" ; cat evault.conf
git switch -q feature/more-retries
echo "on feature:" ; cat evault.conf
```

Files in the folder change as you switch branches. Each branch has its own history.

## Merging

```run
cd ~/lab/ev-branches
git switch -q main
git merge feature/more-retries
git log --graph --format='%s' --all
```

`Fast-forward` means `main` had no new commits of its own, so Git just moved the label forward. Branch is done; delete it:

```run
cd ~/lab/ev-branches
git branch -d feature/more-retries
git branch
```

## When both sides changed: merge commit and conflict

If `main` moved while you worked, Git creates a **merge commit** with two parents. If both branches changed the **same lines**, Git cannot choose and reports a **conflict**. Let us create one on purpose:

```run
cd ~/lab/ev-branches
git switch -q -c feature/timeout
echo "timeout=30" >> evault.conf
git commit -q -am "Add timeout 30"
git switch -q main
echo "timeout=60" >> evault.conf
git commit -q -am "Add timeout 60 on main"
git merge feature/timeout
echo "exit status: $?"
git status --short
```

```run
cd ~/lab/ev-branches
cat evault.conf
```

Git writes both versions into the file between **conflict markers**: `<<<<<<< HEAD` (your current branch's version), `=======`, and `>>>>>>> branch` (the incoming version). Your job: edit the file to what it should be, remove the markers, `git add`, then `git commit`.

```run
cd ~/lab/ev-branches
printf 'server=EV01\nretries=5\ntimeout=45\n' > evault.conf
git add evault.conf
git commit -q -m "Merge feature/timeout: settle on 45s"
git log --graph --format='%s'
cat evault.conf
```

The graph shows both lines of work joining at the merge commit. Conflicts are normal, not a failure. Tips: merge small and often, communicate about who edits which file, and read both sides before choosing. `git merge --abort` cancels a conflicted merge and takes you back.

| Command | Purpose |
|---|---|
| `git branch` | list branches (`-d` delete) |
| `git switch name` / `-c name` | change / create and change |
| `git merge name` | bring `name` into the current branch |
| `git merge --abort` | cancel a conflicted merge |
| `git log --graph --oneline --all` | picture of the history |

<!-- deeper -->
## A worked solution and common mistakes

```run
git config --global user.name "Rohan Student"; git config --global user.email "student@example.com"; git config --global init.defaultBranch main
rm -rf ~/lab/conflict && mkdir ~/lab/conflict && cd ~/lab/conflict && git init -q
echo "timeout=10" > app.conf && git add . && git commit -q -m "Initial"
git switch -q -c fast; echo "timeout=5" > app.conf; git commit -qam "Use 5 second timeout"
git switch -q main; git switch -q -c safe; echo "timeout=30" > app.conf; git commit -qam "Use 30 second timeout"
git switch -q main
git merge fast > /dev/null && echo "merged fast (fast-forward)"
echo "--- now merge the second branch: conflict"
git merge safe 2>&1 | grep -E "CONFLICT|Automatic" 
echo "--- the file now contains markers:"; cat app.conf
echo "--- back out:"
git merge --abort && git status -sb | head -1 && cat app.conf
echo "--- merge again and resolve by choosing a value:"
git merge safe > /dev/null 2>&1; echo "timeout=15" > app.conf; git add app.conf && git commit -q -m "Resolve: 15 seconds" && git log --graph --format='%s' | head -5
```

:::warn Common mistakes
- **Committing the conflict markers** (`<<<<<<<`) because you did not search the file for them. `grep -rn '<<<<<<<' .` before committing.
- **Resolving by taking "mine" blindly,** losing the other person's change. Read both sides; talk to them.
- **Long-lived branches.** The longer a branch lives, the worse the conflicts; merge `main` into it often.
- **Panicking mid-merge.** `git merge --abort` returns you to the state before the merge.
- **Merging into the wrong branch.** Check `git branch --show-current` first.
:::
<!-- /deeper -->

:::recap
- A branch is a label on a commit. Create one per piece of work.
- Merge brings changes together: fast-forward when possible, otherwise a merge commit.
- A conflict means two branches changed the same lines. Edit, `add`, `commit`.
:::

:::try Your turn
Create two branches that both edit the same line of a config file differently, merge both into main, and resolve the conflict. Use `git merge --abort` once to see how to back out.
:::

:::quiz
? What is a Git branch?
- A copy of all files
+ A movable label pointing to a commit
- A remote server
- A backup
! That is why branching is instant.
? What causes a merge conflict?
- Two branches existing
+ Both branches changed the same lines
- A large file
- A missing commit message
! Git needs a human to choose.
? How do you cancel a merge that went wrong?
+ `git merge --abort`
- `git delete`
- `rm -rf .git`
- `git push`
! It restores the state before the merge.
:::
