---
track: git
title: Remotes and working with others
short: Remotes, teamwork
sub: Clone, push, pull and fetch, and how pull requests fit in.
---

:::goals
- explain local versus remote repositories
- `clone`, `push`, `fetch` and `pull`
- handle a rejected push
- describe the pull request workflow
:::

## Local and remote

Git is **distributed**: every clone is a full repository with the whole history. A **remote** is just another copy that your team agrees to treat as the shared one, usually hosted on **GitHub**, **GitLab**, **Bitbucket** or Azure DevOps. The conventional remote name is `origin`. Moving data between copies:

| Command | Direction | Effect |
|---|---|---|
| `git clone URL` | remote to new local | copy everything, set `origin` |
| `git fetch` | remote to local | download new commits, do not change your files |
| `git pull` | remote to local | fetch + merge into the current branch |
| `git push` | local to remote | upload your commits |

A remote does not need a website. Any folder can be a remote. We make a bare repository (no working files, only history) to act as the shared server, then two people clone it:

```setup
git config --global user.name "Rohan Student"
git config --global user.email "student@example.com"
git config --global init.defaultBranch main
rm -rf ~/lab/git-remote ~/lab/alice ~/lab/bob
true
```

```run
cd ~/lab && mkdir git-remote && cd git-remote
git init -q --bare shared.git
cd ~/lab
git clone -q git-remote/shared.git alice 2>&1 | head -1
cd alice
git config user.name Alice; git config user.email alice@example.com
echo "# EV runbook" > README.md
git add . && git commit -q -m "Start runbook"
git push -q -u origin main
git status -sb | head -1
```

`-u origin main` links the local branch to the remote one, so later a plain `git push` / `git pull` works. `[origin/main]` in the status shows you are in sync.

## Second person joins

```run
cd ~/lab
git clone -q git-remote/shared.git bob 2>&1 | head -1
cd bob
git config user.name Bob; git config user.email bob@example.com
cat README.md
echo "Restart order: SQL, then EV" >> README.md
git commit -q -am "Document restart order"
git push -q
cd ~/lab/alice
git fetch -q
git status -sb | head -1
git log origin/main --format='%an: %s'
```

Alice ran `fetch` and learned she is **behind** by one commit, without her files changing. `git pull` would now merge it in:

```run
cd ~/lab/alice
git pull -q
cat README.md
```

## A rejected push

If you push while someone else pushed first, Git refuses, because your history and the remote's have diverged. This message is not an error in your work; it just means "integrate their changes first".

```run
cd ~/lab/alice
echo "Contact: ops@example.com" >> README.md
git commit -q -am "Add contact"
cd ~/lab/bob
echo "Backup: nightly" >> README.md
git commit -q -am "Add backup note"
git push -q
cd ~/lab/alice
git push 2>&1 | grep -E "rejected|hint" | head -2
```

Fix: pull (merge or rebase), resolve conflicts if any, push again.

```run
cd ~/lab/alice
git pull --no-rebase -q --no-edit 2>&1 | head -3
git status --short
cat README.md
```

Both edits touched the end of the file, so a conflict appears. This is routine teamwork: resolve it exactly like the last lesson. For the demonstration we keep both lines:

```run
cd ~/lab/alice
printf '# EV runbook\nRestart order: SQL, then EV\nContact: ops@example.com\nBackup: nightly\n' > README.md
git add README.md && git commit -q -m "Merge Bob's backup note"
git push -q
git log --format='%an: %s' | head -4
```

## Merge or rebase?

`git pull --rebase` replays your commits on top of the updated branch instead of creating a merge commit. The history stays a straight line, which many teams prefer. **Golden rule: never rebase commits that others have already pulled** (it rewrites history). Plain merging is always safe.

## Pull requests

On GitHub and similar sites, teams do not push directly to `main`. The workflow:

1. Create a branch and push it: `git push -u origin feature/x`
2. Open a **pull request** (PR; GitLab calls it a merge request): a page showing the diff, discussion and automated checks
3. A teammate **reviews**; CI (Jenkins/GitHub Actions) runs tests
4. When approved and green, the PR is merged; the branch is deleted

This gives review, history and a safety net. **Branch protection** rules can require an approval and passing checks before anyone can merge.

:::note Authentication
Real remotes need credentials. Use **SSH keys** (see the Linux track) or tokens. Never put a token in a URL you share or commit it. A credential helper stores it securely.
:::

<!-- deeper -->
## Worked answers and common mistakes

Create the shared "server" and three clones, then play the rejected-push cycle:

```run
git config --global user.name "Rohan Student"; git config --global user.email "student@example.com"; git config --global init.defaultBranch main
cd ~/lab && rm -rf trio && mkdir trio && cd trio && git init -q --bare team.git
for p in alice bob carol; do git clone -q team.git $p 2>/dev/null; (cd $p; git config user.name $p; git config user.email $p@example.com); done
cd alice && echo "line from alice" > notes.txt && git add . && git commit -q -m "alice: start notes" && git push -q -u origin main
cd ../bob && git pull -q && echo "line from bob" >> notes.txt && git commit -qam "bob: add a line" && git push -q
cd ../carol && git pull -q && echo "line from carol" >> notes.txt && git commit -qam "carol: add a line"
echo "--- carol pushes after bob changed the same file; was she up to date?"
cd ../alice && echo "line from alice 2" >> notes.txt && git commit -qam "alice: second line" && git push -q 2>&1 | head -2
cd ../carol && git push 2>&1 | grep -E "rejected" | head -1
echo "--- fix: pull (merge), resolve, push"
git pull --no-rebase --no-edit 2>&1 | grep -E "CONFLICT|Merge made" | head -1
git status --short
```

If the pull reports a conflict, edit `notes.txt` to keep all three lines, `git add` it, `git commit`, and `git push`. The cycle is always **fetch/pull, resolve, push**.

:::warn Common mistakes
- **`git push --force` to "fix" a rejected push.** It overwrites other people's commits. Pull first. If you must force, use `--force-with-lease`.
- **Working on `main` directly** when the team uses pull requests.
- **Not pulling before starting work,** which guarantees conflicts later.
- **Pushing credentials or tokens** into the repository, or putting a token in the remote URL.
- **Confusing `origin/main` (your cached view of the remote) with `main`.** `git fetch` refreshes `origin/main`.
:::
<!-- /deeper -->

:::recap
- Every clone is a full copy. `origin` is the usual shared remote.
- `fetch` downloads, `pull` = fetch + merge, `push` uploads.
- A rejected push means integrate first (pull, resolve, push).
- Teams use branches and pull requests with review and CI.
:::

:::try Your turn
Recreate the lab with a third person, Carol, and make three people push to the same remote. Practise the fetch / pull / rejected push cycle.
:::

:::quiz
? What does `git fetch` do?
+ Downloads remote commits without changing your files
- Uploads your commits
- Deletes the branch
- Merges the branch
! pull = fetch + merge.
? Why is a push rejected?
- The file is too big
+ The remote has commits you do not have yet
- You forgot a message
- The branch is named main
! Pull (and resolve) first.
? What is a pull request?
- A command that downloads code
+ A request to merge a branch, with review and checks
- A backup
- A kind of conflict
! It is the review step in team workflows.
:::
