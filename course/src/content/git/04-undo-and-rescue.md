---
track: git
title: Undoing things and rescuing work
short: Undo and rescue
sub: Restore, amend, revert, reset, stash and the reflog: how to fix mistakes safely.
---

:::goals
- undo an edit, a staged file and a commit
- choose between `revert` and `reset`
- use `stash` to park work
- recover "lost" commits with `reflog`
:::

## Know where the mistake lives

| Mistake | State | Fix |
|---|---|---|
| Bad edit not yet staged | working directory | `git restore file` |
| Staged by accident | staging area | `git restore --staged file` |
| Typo in the last commit message or a forgotten file | last local commit | `git commit --amend` |
| Bad commit **already shared** | history | `git revert ID` (adds a new undoing commit) |
| Bad commit **only local** | history | `git reset` (moves the branch back) |

```setup
git config --global user.name "Rohan Student"
git config --global user.email "student@example.com"
git config --global init.defaultBranch main
rm -rf ~/lab/ev-undo
mkdir -p ~/lab/ev-undo && cd ~/lab/ev-undo
git init -q
echo "retries=3" > evault.conf
git add . && git commit -q -m "Initial config"
true
```

## Restore an edit

```run
cd ~/lab/ev-undo
echo "retries=999" > evault.conf
git diff --stat | tail -1
git restore evault.conf
cat evault.conf
```

:::warn restore is permanent
`git restore` discards uncommitted changes with no recovery. Check `git diff` first.
:::

## Unstage and amend

```run
cd ~/lab/ev-undo
echo "secret=abc" > notes.txt
git add notes.txt
git restore --staged notes.txt
git status --short
rm notes.txt
echo "timeout=30" >> evault.conf
git commit -q -am "Add timeot"
git commit -q --amend -m "Add timeout"
git log --format='%s'
```

`--amend` rewrites the last commit. Do it only before you push.

## Revert: the safe undo for shared history

`revert` creates a **new** commit that applies the opposite of an old one. History is kept, so it is safe even after others pulled.

```run
cd ~/lab/ev-undo
echo "debug=true" >> evault.conf
git commit -q -am "Enable debug"
git revert --no-edit HEAD > /dev/null
git log --format='%s'
cat evault.conf
```

## Reset: moving the branch back (local only)

`reset` moves the branch label to an earlier commit. `--soft` keeps changes staged, `--mixed` (default) keeps them unstaged, `--hard` throws them away.

```run
cd ~/lab/ev-undo
echo "oops=1" >> evault.conf
git commit -q -am "Bad idea"
git reset --hard HEAD~1
git log --format='%s' | head -3
cat evault.conf
```

:::warn Never reset commits you have pushed
Others will have them; rewriting shared history causes pain. Use `revert` there.
:::

## Stash: park unfinished work

You are mid-edit and must switch tasks. `stash` shelves your changes.

```run
cd ~/lab/ev-undo
echo "retries=10" > evault.conf
git stash -q
git status --short | wc -l
git stash list | sed 's/:.*WIP/: WIP/'
git stash pop -q
cat evault.conf
git restore evault.conf
```

## reflog: the safety net

Even after `reset --hard`, Git remembers where `HEAD` has been for about 90 days. `git reflog` lists those moves, so a "lost" commit can be brought back.

```run
cd ~/lab/ev-undo
echo "important=yes" >> evault.conf
git commit -q -am "Important work"
git reset -q --hard HEAD~1
git reflog --format='%gs' | head -3
lost=$(git reflog --format='%h %gs' | grep "commit: Important work" | cut -d' ' -f1)
git reset -q --hard $lost
git log --format='%s' | head -2
```

The commit was never deleted, only unreachable. This is why Git feels forgiving: committed work is very hard to lose. (Uncommitted work is another matter, so commit often.)

:::recap
- `restore` for edits, `restore --staged` to unstage, `amend` for the last local commit.
- `revert` for shared history, `reset` for local-only history.
- `stash` parks work. `reflog` finds "lost" commits.
:::

:::try Your turn
Make three commits. Reset hard to the first, then recover the third using `reflog`. Then revert the middle commit instead and compare the log.
:::

:::quiz
? Which is safe for a commit already pushed to a shared branch?
- `git reset --hard`
+ `git revert`
- `git commit --amend`
- `rm -rf .git`
! Revert adds a new commit and does not rewrite history.
? What does `git stash` do?
+ Saves uncommitted changes aside and cleans the working directory
- Deletes the repository
- Pushes to the remote
- Creates a tag
! `stash pop` brings them back.
? Which command can find a commit after `reset --hard`?
- `git status`
- `git blame`
+ `git reflog`
- `git diff`
! The reflog records where HEAD has been.
:::
