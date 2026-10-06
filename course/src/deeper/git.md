=== git/01
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

=== git/02
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

=== git/03
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

=== git/04
## A worked solution and common mistakes

```run
git config --global user.name "Rohan Student"; git config --global user.email "student@example.com"; git config --global init.defaultBranch main
rm -rf ~/lab/undo2 && mkdir ~/lab/undo2 && cd ~/lab/undo2 && git init -q
echo one > f.txt && git add . && git commit -q -m "one"
echo two >> f.txt && git commit -qam "two"
echo three >> f.txt && git commit -qam "three"
echo "--- reset hard to the first commit:"; git reset -q --hard HEAD~2; git log --format='%s'; cat f.txt
echo "--- recover 'three' from the reflog:"
id=$(git reflog --format='%h %gs' | grep "commit: three" | cut -d' ' -f1)
git reset -q --hard $id; git log --format='%s'
echo "--- revert the middle commit instead (history is kept, a new commit undoes it):"
mid=$(git log --format='%h %s' | grep " two" | cut -d' ' -f1)
git revert --no-edit $mid > /dev/null 2>&1 || { git checkout --theirs . 2>/dev/null; git status -sb | head -2; }
git log --format='%s' | head -4
```

If the revert reports a conflict (the later commit builds on the middle one, as here), Git stops and waits: that is normal; fix the file, `git add`, then `git revert --continue`. The point: **reset moves a label (history changes); revert adds a new commit (history preserved)**.

:::warn Common mistakes
- **`git reset --hard` with uncommitted work.** That work is not in the reflog and is gone for good. Commit or stash first.
- **Resetting a shared branch.** Revert instead.
- **`git checkout -- file` or `git restore` on the wrong file** discarding hours of edits; run `git diff file` first.
- **Panicking about "lost" commits.** Committed work is almost always recoverable through the reflog for about 90 days.
- **`git clean -fd`** deletes untracked files for good; use `-n` (dry run) first.
:::

=== git/05
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
