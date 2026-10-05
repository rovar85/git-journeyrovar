---
track: linux
title: Troubleshooting and performance
short: Troubleshooting
sub: A repeatable method for finding why a server is slow, full or broken.
---

:::goals
- follow a simple troubleshooting method
- check CPU, memory, disk and load
- read logs quickly and find which process holds a file or port
- trace a failing command with `strace`
:::

@setup evlab

## A method, not a guess

When something is wrong, work in layers and change one thing at a time:

1. **What exactly is the symptom?** Error text, since when, who is affected.
2. **What changed?** Deploy, update, config edit, new disk usage.
3. **Look at the four resources:** CPU, memory, disk, network.
4. **Read the logs** around the time it started.
5. **Form a hypothesis, test it, write down what you did.**

## CPU, load and memory

```run
nproc
awk '{print "/proc/loadavg has", NF, "fields; the first three are the 1, 5 and 15 minute load"}' /proc/loadavg
free -m | head -1
```

- **Load average** counts processes running or waiting. Compare with the number of CPU cores (`nproc`): load 4 on a 4-core machine is "full", load 20 means things are waiting.
- `free -m` shows memory in MB. The **available** column (not "free") is what matters: Linux uses spare memory as a disk cache.
- `top` / `htop`: press `P` to sort by CPU, `M` by memory.
- `vmstat 1 5` and `iostat -x 1` (package `sysstat`) show whether the bottleneck is CPU, memory swapping or disk.

Find the biggest consumers:

```run
ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -1
ps -eo comm --sort=-%mem | head -3 | wc -l
```

## Disk space and speed

You met `df -h`, `du` and `df -i` in the storage lesson. High **iowait** in `top` (the `wa` value) says processes are waiting on the disk.

## Who is using this file or port?

```run
sleep 300 > ~/lab/held.txt &
pid=$!
sleep 0.3
lsof ~/lab/held.txt 2>/dev/null | awk 'NR>1{print $1, "has it open"}'
kill $pid
python3 -m http.server 8765 --bind 127.0.0.1 > /dev/null 2>&1 &
spid=$!
sleep 1
ss -ltnp 2>/dev/null | awk 'NR>1 && /8765/{print "port 8765 listening"}'
kill $spid
```

`ss -ltnp` lists listening TCP ports and the process using each. `lsof -i :80` shows who uses port 80. This answers "address already in use" errors.

## Logs, fast

```run
cd ~/lab
grep -c ERROR ev/logs/indexing.log
grep -B1 -A1 "aborted" ev/logs/indexing.log | head -6
awk '/ERROR/{print $2}' ev/logs/indexing.log | cut -c1-2 | sort | uniq -c
```

The last line is a quick histogram: errors per hour. Patterns like "always at 12:15" often point to a scheduled job.

## strace: what is this program actually doing?

When a program fails with a vague error, `strace` shows every request it makes to the kernel. Searching for `ENOENT` (no such file) or `EACCES` (permission denied) often reveals the cause.

```run
strace -f -e trace=openat cat /etc/does-not-exist 2>&1 | grep -E 'does-not-exist'
```

The line says `openat(...) = -1 ENOENT (No such file or directory)`: the program tried to open a file that is not there.

## DNS and reachability (a preview)

Many "server down" reports are a name problem. This lab's EV logs show `Name resolution failed for SQL01`. The networking track covers it in detail; the quick triage is:

```term
$ ping -c1 SQL01             # does the name resolve and reply?
$ getent hosts SQL01         # what does this machine think the name is?
$ nc -zv SQL01 1433          # is the SQL port reachable?
```

:::recap
- Method: symptom, what changed, resources, logs, hypothesis. One change at a time.
- Load vs cores, available memory, iowait, disk space and inodes.
- `lsof` and `ss -ltnp` find who holds a file or port.
- `strace` reveals missing files and permission errors.
:::

:::try Your turn
"The server is slow." Write the first five commands you would run, in order, and what each would tell you.
:::

:::quiz
? Load average 12 on a 4-core server suggests:
- Everything is fine
+ More work is waiting than the CPUs can handle
- Memory is full
- The disk is full
! Compare load to core count.
? Which command finds the process listening on a port?
- `df -h`
+ `ss -ltnp`
- `chmod`
- `tar -tzf`
! `ss` lists sockets; `-p` shows the owning process.
? What does `ENOENT` in `strace` output mean?
- Permission denied
+ No such file or directory
- Out of memory
- Network down
! It tells you which file the program looked for.
:::
