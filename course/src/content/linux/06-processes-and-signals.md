---
track: linux
title: Processes, jobs and signals
short: Processes
sub: What is running, how to start things in the background, and how to stop them cleanly.
---

:::goals
- explain what a process is and read `ps` and `top`
- run commands in the background and manage jobs
- stop programs with signals: `kill`, `SIGTERM`, `SIGKILL`
- write a script that cleans up when it is stopped
:::

## What is a process?

A **program** is a file on disk. A **process** is a program that is running: it has a **process ID (PID)**, an owner, memory and open files. A process is always started by another process (its **parent**, PPID), so processes form a family tree that begins at PID 1.

```run
ps -o pid,ppid,user,comm -p $$,$PPID
echo "(PIDs differ on every machine)"
```

Process listings: `ps` shows a snapshot, `top` is a live view.

| Command | Shows |
|---|---|
| `ps aux` | every process, all users, with CPU and memory |
| `ps -ef` | every process in full format, with parent PID |
| `ps -o pid,stat,comm -p PID` | chosen columns for one process |
| `pgrep name` | PIDs of processes whose name matches |
| `top` / `htop` | live view. In top: `q` quit, `M` sort by memory, `P` by CPU, `k` kill |

## Foreground, background and jobs

By default a command runs in the **foreground**: the shell waits, and you cannot type until it finishes. Add `&` to start it in the **background** and get the prompt back:

```run
sleep 120 &
sleep 130 &
jobs
```

`jobs` lists the shell's background jobs by job number. Useful controls: `Ctrl+Z` pauses the foreground job, `bg` resumes it in the background, `fg` brings it back, and `kill %1` stops job 1.

```run
pid=$!
ps -o stat,comm -p $pid
kill %1
sleep 0.2
jobs
```

The `STAT` letter says what the process is doing: `S` sleeping (waiting for something), `R` running, `T` stopped (paused), `Z` zombie (finished, waiting for its parent to notice), `D` waiting on disk or network (cannot be interrupted).

## Signals: how to talk to a process

`kill` does not only kill: it sends a **signal**, a small message. The programs decide how to react.

| Signal | Number | Meaning |
|---|---|---|
| `SIGTERM` | 15 | "Please shut down." The polite default. The program can clean up first |
| `SIGKILL` | 9 | "Die now." Cannot be caught or ignored. No cleanup, so a last resort |
| `SIGINT` | 2 | what Ctrl+C sends |
| `SIGHUP` | 1 | "hang up". Many services reload their configuration on it |
| `SIGSTOP`/`SIGCONT` | 19 / 18 | pause and resume |

```run
kill -l TERM; kill -l KILL; kill -l HUP
```

:::note Rule of thumb
Always try `kill PID` (SIGTERM) first and wait a few seconds. Use `kill -9 PID` only if the process ignores it. A process killed with -9 cannot flush its buffers or remove its lock files, which can leave a database or a service in a bad state.
:::

## Programs that handle signals

A well-behaved program cleans up when told to stop. Here is a script that traps SIGTERM, and what happens when it is stopped:


```run
cat > worker.sh <<'EOF'
#!/bin/bash
cleanup() { echo "worker: received stop signal, cleaning up"; exit 0; }
trap cleanup TERM
echo "worker: started"
while true; do sleep 0.2; done
EOF
chmod +x worker.sh
./worker.sh > worker.out &
wpid=$!
sleep 0.5
kill $wpid
wait $wpid
echo "exit code: $?"
cat worker.out
```

The script printed its goodbye message because `kill` sent SIGTERM and the `trap` caught it. Now the opposite: a script that **ignores** SIGTERM, so only `kill -9` works.

```run
cat > stubborn.sh <<'EOF'
#!/bin/bash
trap '' TERM
while true; do sleep 0.2; done
EOF
chmod +x stubborn.sh
./stubborn.sh &
spid=$!
sleep 0.5
kill $spid
sleep 0.5
echo "after SIGTERM, still running?"; kill -0 $spid 2>/dev/null && echo yes || echo no
kill -9 $spid
wait $spid 2>/dev/null
echo "after SIGKILL, still running?"; kill -0 $spid 2>/dev/null && echo yes || echo no
```

`kill -0 PID` sends no signal at all. It only checks whether the process exists, which is a handy test in scripts.

## Staying alive after you log out

A background job started from a terminal gets a SIGHUP when the terminal closes. To keep it running, start it with `nohup` (ignores SIGHUP) or, for real services, use a service manager such as systemd (the next lesson).

```run
nohup sleep 300 > /dev/null 2>&1 &
pid=$!
pgrep -f "sleep 300" > /dev/null && echo "nohup job is running"
kill $pid
```

## Looking inside a process: /proc

Linux shows every process as a folder in `/proc`. This is where `ps` and `top` get their data.

```run
sleep 100 &
pid=$!
ls /proc/$pid | head -8
echo "---"
head -3 /proc/$pid/status | sed 's/\t/ /'
echo "---"
readlink /proc/$pid/cwd | sed "s#$HOME#~#"
kill $pid
```

## Process priority

`nice` starts a process with lower priority (a higher "niceness" up to 19 means "be nice, let others go first"). `renice` changes it for a running process.

```run
nice -n 10 sleep 60 &
pid=$!
ps -o ni,comm -p $pid
kill $pid
```

:::recap
- A process is a running program with a PID and a parent. `ps` snapshots, `top` is live.
- `&` starts a job in the background; `jobs`, `fg`, `bg` manage it.
- `kill` sends signals. `SIGTERM` (15) asks nicely, `SIGKILL` (9) cannot be refused. Try 15 first.
- `trap` lets a script clean up when it is stopped.
- `nohup` or a service manager keeps programs alive after logout.
:::

:::ask Your turn
The EV indexing service hangs and `kill PID` does nothing. Walk through what you would try, in order, and say why `kill -9` is the last resort.
:::

:::quiz
? What does plain `kill 1234` send?
- SIGKILL (9)
+ SIGTERM (15)
- SIGHUP (1)
- Nothing, it only checks
! SIGTERM is the default. It lets the program clean up before exiting.
? Why is `kill -9` a last resort?
- It is slower
- It needs root
+ The program cannot clean up, so locks and buffers may be left in a bad state
- It only works on background jobs
! SIGKILL cannot be caught, so no cleanup code runs.
? What does `kill -0 PID` do?
- Stops the process
+ Checks whether the process exists without sending a signal
- Restarts it
- Sets its priority to 0
! Signal 0 is only an existence and permission check.
:::
