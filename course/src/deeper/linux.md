=== linux/01
## Worked answers

Check yourself against real output. Task 1 and 2 (we make a hidden file ourselves so the result is predictable):

```run
cd ~/lab
echo "my home directory is: $HOME"
touch .hidden-example
echo "--- ls (hidden files not shown):"; ls
echo "--- ls -a (the dot files appear):"; ls -a | grep '^\.' | grep -v '^\.\.\?$'
```

Task 3: `man` is not installed in this lab, but the same information is in `--help`. Find the "sort by size" option:

```run
ls --help | grep -i "sort by" | head -3
```

`-S` sorts by file size, largest first. Try `ls -lS` and add `-r` to reverse it.

:::warn Common mistakes
- **Typing the `$` from the examples.** It is part of the prompt, not the command.
- **Forgetting that Linux is case-sensitive.** `Notes.txt` and `notes.txt` are different files, and `LS` is not a command.
- **Copy-pasting commands you do not understand** into a server. Read each one first; use the command guide boxes and `--help`.
- **Looking for an "Undo".** The shell has no recycle bin. Practise in a throwaway folder.
:::

=== linux/02
## Worked answers and common mistakes

```run
cd ~/lab
rm -rf practice
mkdir practice
touch practice/{a,b,c}.txt
ls practice
echo "--- 2: copy a folder and rename the copy"
cp -r ev/logs practice/
mv practice/logs practice/logs-old
ls practice
echo "--- 3: how many .log files exist under ev?"
find ev -name "*.log" | wc -l
echo "--- 4: look before you delete"
ls -R practice
rm -r practice
ls practice 2>&1 | head -1
```

`cp -r` is needed to copy a folder (recursive). `{a,b,c}` is **brace expansion**: the shell turns it into three names before `touch` runs. `ls -R` before `rm -r` is the habit that prevents disasters.

:::warn Common mistakes
- **`rm -rf` with a typo or an empty variable.** `rm -rf $DIR/` with `DIR` unset becomes `rm -rf /`. Always `ls` first; quote variables.
- **`cp` without `-r` on a folder** ("omitting directory").
- **Unquoted file names with spaces.** `rm my file.txt` tries to delete two files called `my` and `file.txt`. Quote: `rm "my file.txt"`.
- **Using `mv` to "copy".** It removes the original.
- **Wildcard surprises.** `rm *.log` deletes in the current folder only; check what `ls *.log` matches first.
:::

=== linux/03
## Worked answers and common mistakes

```run
cd ~/lab
echo "--- 1: lines 5 to 8 (first 8 lines, then the last 4 of those)"
head -n 8 ev/logs/indexing.log | tail -n 4
echo "--- 2: WARN lines in storage.log"
grep -c WARN ev/logs/storage.log
echo "--- 3: send only the error output to a file"
ls /nonexistent 2> problems.txt
cat problems.txt
```

Redirection summary: `>` writes standard output to a file (overwriting), `>>` appends, `2>` writes **error** output (stream 2), and `2>&1` merges errors into the normal output. In `command1 | command2` only the standard output flows through the pipe; errors still go to the screen unless you add `2>&1`.

:::warn Common mistakes
- **`>` instead of `>>`.** `echo x > log.txt` **erases** the file first. Use `>>` to add.
- **Reading and writing the same file in one command.** `sort file > file` empties it before sort reads it. Write to a new file, then move it.
- **Expecting errors to go through a pipe.** Add `2>&1` if you want them captured.
- **`cat file | grep x`** works, but `grep x file` is simpler and faster (no useless `cat`).
- **Using `tail -f` on a log inside a script** and wondering why it never finishes: it follows forever by design.
:::

=== linux/04
## Worked answers and common mistakes

```run
cd ~/lab
echo "--- 1: lines without INFO"
grep -vc INFO ev/logs/indexing.log
echo "--- 2: the times of the 'started' events"
grep "service started" ev/logs/indexing.log | awk '{print $2}'
echo "--- 3: edit a COPY of the config with sed"
cp ev/config/evault.conf /tmp/evault-copy.conf
sed 's/max_index_threads = 4/max_index_threads = 8/' /tmp/evault-copy.conf | grep max_index
diff ev/config/evault.conf /tmp/evault-copy.conf && echo "(the copy is unchanged because we did not use -i)"
echo "--- 4: the five longest lines"
awk '{print length, $0}' ev/logs/indexing.log | sort -rn | head -5 | cut -c1-70
```

Notice that `sed` without `-i` only **prints** the edited text; the file is untouched. That is the safe way to rehearse an edit. When you are happy, add `-i` (and keep a backup with `-i.bak`).

:::warn Common mistakes
- **`grep` pattern treated as a regular expression.** `grep 1.5 file` also matches `105`. Use `grep -F` for literal text or escape the dot.
- **`uniq` without `sort`.** `uniq` only collapses *adjacent* duplicates. Always `sort | uniq -c`.
- **Quoting.** Single quotes `'...'` stop the shell touching `$` and `*`; awk programs and regexes usually need them.
- **`sed -i` on the only copy of a file.** Test without `-i`, or keep a backup.
- **Counting fields wrongly in `awk`.** `$1` is the first field; `$0` is the whole line; the default separator is any run of spaces, so `-F` matters for CSV.
:::

=== linux/05
## Worked answers and common mistakes

```run
cd ~/lab
echo "--- 1: a private file"
echo "top secret" > secret.txt
chmod 600 secret.txt
stat -c '%a %A %n' secret.txt
echo "--- 2: make a script executable and run it"
printf '#!/bin/bash\necho "hello from my script"\n' > hello.sh
./hello.sh 2>&1 | head -1
chmod +x hello.sh
./hello.sh
echo "--- 3: octal values (r=4, w=2, x=1)"
python3 -c "
def octal(s): return ''.join(str(sum(v for c, v in zip(s[i:i+3], (4,2,1)) if c != '-')) for i in (0,3,6))
for s in ('rwxr-x---', 'rw-rw-r--'): print(s, '=', octal(s))"
echo "--- 4: the special character on passwd"
ls -l /usr/bin/passwd | cut -c1-10
```

Answers: `rwxr-x---` is **750**; `rw-rw-r--` is **664**. The first attempt to run `hello.sh` failed ("Permission denied") until `chmod +x`. In task 4 the owner's execute position shows **`s`**: the **setuid** bit. `passwd` must edit `/etc/shadow`, which only root may write, so the program runs **as its owner (root)** whoever starts it; that is a controlled, deliberate exception.

:::warn Common mistakes
- **`chmod 777` to "fix" a permission error.** It lets everyone modify the file. Find who needs what and grant exactly that (a group, or `750`/`640`).
- **Forgetting that folders need `x`.** To enter a folder you need execute permission on it.
- **Running everything with `sudo`.** Files created as root later cannot be edited by your user; use sudo only for the one command.
- **Secrets world-readable.** Private keys and password files should be `600`; SSH refuses keys that are not.
- **Confusing user, group and others** in `chmod g+w` versus `chmod o+w`.
:::

=== linux/06
## Practice with worked answers

```run
cd ~/lab
echo "--- start a long job, find it, stop it politely, confirm"
sleep 300 &
pid=$!
ps -o pid,stat,comm -p $pid | tail -1 | awk '{print "running:", $3, "state", $2}'
kill $pid
sleep 0.3
kill -0 $pid 2>/dev/null && echo "still alive" || echo "stopped by SIGTERM"
echo "--- pgrep finds by name"
sleep 301 &
pgrep -f "sleep 301" > /dev/null && echo "found it by name"
pkill -f "sleep 301"
```

:::warn Common mistakes
- **Jumping straight to `kill -9`.** It gives the program no chance to clean up (lock files, buffers, child processes). Try plain `kill` and wait first.
- **`pkill name` too broadly.** It kills every match. Check with `pgrep -a name` first.
- **Forgetting that closing the terminal can stop background jobs.** Use `nohup`, `tmux`/`screen`, or a systemd service for anything long-running.
- **Treating "zombie" processes as running.** A `Z` state process has already finished; the fix is its parent, not `kill`.
- **Reading `top` memory wrongly.** Linux uses spare memory as cache; look at "available", not "free".
:::

=== linux/07
## Worked answers and common mistakes

The two problems are separate: the service is **stopped now**, and it is **not enabled at boot**. On a real server:

```term
$ sudo systemctl start ev-indexing        # fixes "stopped now"
$ sudo systemctl enable ev-indexing       # fixes "will not come back after a reboot"
$ sudo systemctl enable --now ev-indexing # both in one command
$ systemctl status ev-indexing            # verify: "Active: active (running)" and "enabled"
```

(Example commands: the lab has no systemd. The service name `ev-indexing` is made up.) If it fails to start, read why: `journalctl -u ev-indexing -n 50 --no-pager`.

:::warn Common mistakes
- **Starting a service but never enabling it,** so it dies at the next reboot (or enabling but never starting it).
- **Editing a unit file and forgetting `systemctl daemon-reload`.**
- **`apt install` without `apt update` first,** so the package list is stale and the install fails or installs an old version.
- **Mixing package managers** (installing the same software by `apt` and by a downloaded installer) and then not knowing which copy runs; `which -a` and `dpkg -S` tell you.
- **Not reading the log.** `systemctl status` shows only the last lines; `journalctl -u NAME` shows the story.
:::

=== linux/08
## Worked answers and common mistakes

The order to work in when a file system is full:

```term
$ df -h /var                                  # 1. confirm which file system is full
$ df -i /var                                  # 2. check inodes too (many tiny files can fill it)
$ sudo du -xh /var --max-depth=2 | sort -rh | head -15      # 3. find the biggest folders
$ sudo find /var/log -type f -size +100M -exec ls -lh {} \; # 4. find the large files
$ sudo lsof +L1                               # 5. files that are deleted but still held open
```

**Why deleting a huge log may not free space:** a running program still has the file open. The name is gone, but the data stays on disk until the program closes it. `lsof +L1` shows it. Fix: restart the service (or truncate the file instead of deleting it: `: > /var/log/big.log`). Then add **log rotation** so it does not recur.

Try the truncate-versus-delete idea safely:

```run
cd ~/lab
( exec 3> held.log; dd if=/dev/zero bs=1M count=3 >&3 2>/dev/null; rm held.log
  echo "file deleted, but this shell still holds it open:"; ls -l /proc/$BASHPID/fd/3 | sed 's#.*-> ##'; exec 3>&- )
```

:::warn Common mistakes
- **Deleting random files in `/var` to free space.** Find what is big and why first; some files (databases, journals) are vital.
- **Forgetting inodes.** `df -h` looks fine but "No space left on device" appears: `df -i`.
- **Deleting a log a service is writing** instead of truncating or rotating it.
- **`rm -rf` on a mount point** that is actually another disk.
- **No monitoring.** Alert at 80% so it never reaches 100%.
:::

=== linux/09
## A worked solution

```run
cd ~/lab
cat > disk_check.sh <<'EOF'
#!/bin/bash
set -euo pipefail
dir="${1:?usage: disk_check.sh FOLDER LIMIT_KB}"
limit="${2:?usage: disk_check.sh FOLDER LIMIT_KB}"
used=$(du -sk "$dir" | cut -f1)
if [ "$used" -gt "$limit" ]; then
  echo "WARNING: $dir uses ${used} KB, above the limit of ${limit} KB" >&2
  exit 1
fi
echo "ok: $dir uses ${used} KB (limit ${limit} KB)"
EOF
chmod +x disk_check.sh
./disk_check.sh ev 100000; echo "exit code: $?"
./disk_check.sh ev 1; echo "exit code: $?"
./disk_check.sh 2>&1 | head -1; echo "exit code: ${PIPESTATUS[0]}"
```

The three runs show the three outcomes: under the limit (exit 0), over the limit (exit 1, message on **stderr**), and missing arguments (`${1:?...}` stops the script with a usage message).

:::warn Common mistakes
- **Unquoted variables** (`rm $dir/*` when `dir` has a space or is empty). Always `"$dir"`.
- **No `set -euo pipefail`,** so a failed step is ignored and later steps do damage.
- **Spaces around `=`** in assignments (`x = 5` is an error; write `x=5`).
- **`[ $a = $b ]` with an empty variable.** Quote: `[ "$a" = "$b" ]`.
- **Using `==` in plain `sh`;** `=` is portable, `==` is a bash extension.
- **Printing errors to standard output.** Send diagnostics to stderr (`>&2`) and use meaningful exit codes.
- **Parsing `ls` output.** Use globs (`for f in *.log`) or `find`.
:::

=== linux/10
## Worked answers and common mistakes

The crontab line for 02:30 every Sunday (fields: minute, hour, day-of-month, month, day-of-week; Sunday is 0 or 7):

```term
30 2 * * 0  /opt/ev/backup.sh >> /var/log/ev-backup.log 2>&1
```

Check how it will be read with the cron explainer from this lesson, or test the idea locally:

```run
cd ~/lab
echo "30 2 * * 0" | awk '{printf "minute=%s hour=%s day-of-month=%s month=%s day-of-week=%s (0 = Sunday)\n", $1,$2,$3,$4,$5}'
```

`>> file 2>&1` appends normal output **and** error output to one log. Without it cron tries to email the output (or drops it), and you will not know a job failed.

:::warn Common mistakes
- **Relative paths and commands** that work in your terminal but not in cron's minimal environment. Use absolute paths, and set `PATH` at the top of the crontab if needed.
- **`%` characters** in a crontab command: cron treats an unescaped `%` as a newline. Escape as `\%`.
- **Day-of-month and day-of-week both set** is an OR, not an AND (`0 2 1 * 1` runs on the 1st **and** every Monday).
- **No log, no alert.** A silent backup that fails for weeks is worse than no backup.
- **Overlapping runs.** If a job can take longer than its interval, guard it with `flock`.
- **Passwords in cron lines** (visible in `ps` and backups). Use key files with `600` permissions.
- **SSH key permissions.** Private keys must be `600` and `~/.ssh` `700`, or SSH refuses them.
:::

=== linux/11
## Worked answers

A sensible first five commands for "the server is slow", and what each tells you:

| # | Command | What it tells you |
|---|---|---|
| 1 | `uptime` | load averages; compare with `nproc` (cores) |
| 2 | `top` (then `P`/`M`) or `ps aux --sort=-%cpu \| head` | which process is using CPU or memory |
| 3 | `free -m` | is memory available, or is the system swapping? |
| 4 | `df -h` and `df -i` | any full file system or exhausted inodes? |
| 5 | `journalctl -p err -b` or `tail /var/log/syslog` | recent errors and clues about what changed |

Then, by what you found: `iostat -x 1` (disk waits), `ss -tn` (connections), `lsof -p PID` (what a process has open), `strace -p PID` (what it is doing).

```run
cd ~/lab
echo "cores: $(nproc)"; awk '{print "load averages 1/5/15 min: " $1 " " $2 " " $3}' /proc/loadavg | sed -E 's/[0-9.]+/<n>/g'
free -m | head -1
df -h / | tail -1 | awk '{print "root file system use:", $5}' | sed -E 's/[0-9]+%/<n>%/'
```

(Numbers are masked here because they differ on every machine; on your server read the real values.)

:::warn Common mistakes
- **Changing things before looking.** Observe first; one change at a time; write down what you did.
- **Judging memory by the "free" column.** Check "available".
- **Reading load without core count.** A load of 8 is fine on 16 cores, terrible on 2.
- **Fixing the symptom** (restarting) and never finding the cause; capture logs and metrics *before* restarting.
- **Assuming it is the application** when it is DNS, disk or a full queue downstream.
:::

=== linux/12
## Practice with worked answers

1. *Which kernel feature gives a process its own process list?* A **PID namespace**. Prove it:

```run
cd ~/lab
sudo unshare --pid --fork --mount-proc bash -c 'echo "inside the namespace my PID is $$ (a fresh numbering starts at 1)"'
echo "outside, the same kind of command has a normal large PID: $$ is typically > 1"
```

2. *How would you limit a container's memory?* With a **cgroup** memory limit (`docker run --memory 256m`), which the kernel enforces by killing the process (OOM kill) if it exceeds it. You saw the exit code 137 in the Docker track.

3. *Why does deleting a file inside a container not change the image?* The image layers are read-only; the change lives in the container's writable layer (the "upper" directory in the overlay demo), which is discarded with the container.

:::warn Common mistakes
- **Thinking a container is a small VM.** It shares the host kernel; a kernel bug or privileged container can affect the host.
- **Running containers as root and with `--privileged`,** which removes most of the isolation.
- **Expecting data to survive.** The writable layer is deleted with the container; use volumes.
- **Forgetting cgroup limits,** so one container can use all the host's memory.
:::
