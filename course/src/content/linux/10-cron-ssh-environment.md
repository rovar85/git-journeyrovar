---
track: linux
title: Scheduling, SSH and environment
short: Cron, SSH, env
sub: Run jobs on a schedule, log in to other machines securely, and control the environment.
---

:::goals
- read and write `cron` schedules
- explain SSH keys and use `ssh`, `scp` and `~/.ssh/config`
- understand environment variables and `PATH`
:::

## Environment variables and PATH

An **environment variable** is a named value that programs inherit from the shell that started them.

```run
export EV_SERVER=EV01
echo "server is $EV_SERVER"
env | grep '^EV_'
bash -c 'echo "child sees: $EV_SERVER"'
unset EV_SERVER
bash -c 'echo "after unset: [$EV_SERVER]"'
```

Without `export`, a variable is private to the current shell. The most important variable is **PATH**, the list of folders searched when you type a command name:

```run
echo "$PATH" | tr ':' '\n' | head -3
which ls
type cd
```

"command not found" usually means the program is not in any PATH folder. You can run it with its full path, or add its folder:

```run
mkdir -p ~/bin
printf '#!/bin/bash\necho "my own tool"\n' > ~/bin/mytool && chmod +x ~/bin/mytool
mytool 2>&1 | head -1
export PATH="$HOME/bin:$PATH"
mytool
```

To make a variable permanent, put the `export` line in `~/.bashrc` (for you) or `/etc/environment` (for everyone).

## Scheduling with cron

**cron** runs commands on a schedule. Each line of a **crontab** has five time fields and a command:

```
┌ minute (0-59)
│ ┌ hour (0-23)
│ │ ┌ day of month (1-31)
│ │ │ ┌ month (1-12)
│ │ │ │ ┌ day of week (0-7, Sun = 0 or 7)
* * * * *  command
```

@widget cron

Common patterns: `*/5 * * * *` every five minutes, `0 2 * * *` daily at 2am, `30 6 * * 1-5` weekdays at 06:30, `0 0 1 * *` first of each month.

```term
$ crontab -e                    # edit your schedule
$ crontab -l                    # list it
0 2 * * * /opt/ev/backup.sh >> /var/log/ev-backup.log 2>&1
```

:::warn Cron's environment is tiny
Cron runs with a minimal PATH and no profile. Use **full paths** to commands and scripts, and redirect output to a log (`>> file 2>&1`) so you can see failures. "Works in my terminal but not in cron" is nearly always this. `systemd timers` are a modern alternative with better logging.
:::

## SSH: logging in to other machines

**SSH** (Secure Shell) gives you a terminal on a remote machine over an encrypted connection (port 22). It replaces Telnet and, for Linux servers, RDP.

```term
$ ssh evadmin@ev01.example.com
$ ssh -p 2222 evadmin@ev01.example.com
$ ssh evadmin@ev01 'df -h /'          # run one command and return
$ scp backup.tar.gz evadmin@ev01:/tmp/   # copy a file
$ rsync -av ev/ evadmin@ev01:/srv/ev/    # copy only what changed
```

### Keys instead of passwords

Passwords can be guessed. SSH can use a **key pair**: a **private key** (secret, stays with you) and a **public key** (safe to share, placed on servers). The server challenges you and only the private key can answer it.

```run
cd ~/lab && rm -f demo_key demo_key.pub
ssh-keygen -q -t ed25519 -N "" -C "rohan@laptop" -f demo_key
ls demo_key demo_key.pub
cut -d' ' -f1,3 demo_key.pub
stat -c '%a %n' demo_key
```

The private key is `600` (SSH refuses a key others can read). The public key is added to `~/.ssh/authorized_keys` on the server (`ssh-copy-id` does it for you). To avoid typing the options every time, use `~/.ssh/config`:

```ini:~/.ssh/config
Host ev01
    HostName ev01.example.com
    User evadmin
    IdentityFile ~/.ssh/ev_key
```

Now `ssh ev01` is enough. Never share or commit a private key; if it leaks, remove the public key from servers and generate a new pair.

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- Environment variables are inherited by child processes only when exported; PATH decides where commands are found.
- cron: five time fields plus a command. Use full paths and log output.
- SSH uses keys. Private stays secret (600), public goes in `authorized_keys`.
- `~/.ssh/config` shortens connection details.
:::

:::try Your turn
Write the crontab line that runs `/opt/ev/backup.sh` at 02:30 every Sunday and appends output to a log file.
:::

:::quiz
? What does `*/10 * * * *` mean?
+ Every 10 minutes
- At 10 o'clock
- Ten times a day
- Every 10 hours
! `*/10` in the minute field means every 10th minute.
? Which SSH key must never be shared?
- The public key
+ The private key
- Both are fine to share
- Neither
! The private key proves your identity.
? A script works in your terminal but not from cron. Most likely cause?
+ Cron's minimal environment, such as PATH
- Cron is broken
- Scripts cannot run from cron
- The script needs sudo
! Use full paths and log output.
:::
