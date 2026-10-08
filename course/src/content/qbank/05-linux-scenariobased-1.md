---
track: qbank
title: "Linux, shell and networking: Scenario-based questions (part 1 of 4)"
short: Linux scenario 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## An Ubuntu OS upgrade failed midway. How do you troubleshoot and recover?

<!-- source: 01 Q44 -->

:::note In simple words
It is like a house renovation stopped halfway - first make sure the house still stands, then finish or undo the half-done work carefully, and next time take photos (backups) before starting.
:::

1. **Before anything, snapshot** (EBS/VM snapshot) if the machine is still up - so recovery attempts are reversible.
2. If it still boots: finish the interrupted package work:
- `sudo dpkg --configure -a` -> configure half-installed packages.
- `sudo apt --fix-broken install` (`apt -f install`).
- `sudo apt update && sudo apt full-upgrade`.
- Check `/var/log/dist-upgrade/` and `/var/log/apt/term.log` for the actual error.
3. Common causes: disk full on `/` or `/boot` (old kernels), held packages, third-party PPAs, network interruption, dpkg lock left behind.
4. If it does **not** boot: at GRUB choose **Advanced options** -> an older kernel or recovery mode -> root shell -> remount rw (`mount -o remount,rw /`) and run the dpkg/apt fixes.
5. If GRUB itself is broken: boot a live USB (or on AWS, detach the root volume and attach it to a rescue instance), `chroot` into the disk, fix packages, `update-grub`/`grub-install`.
6. Last resort: restore from snapshot/backup, or rebuild (immutable infra makes this easy).
7. Prevention: test the upgrade on staging first, take a snapshot, run in `tmux`/`screen` so an SSH drop does not kill it, ensure free space.

**Example:**
```bash
sudo dpkg --configure -a
sudo apt --fix-broken install
sudo apt update && sudo apt full-upgrade
df -h / /boot
tail -50 /var/log/dist-upgrade/main.log

# Rescue via chroot (live USB or rescue EC2 with the volume attached)
sudo mount /dev/xvdf1 /mnt
for d in dev proc sys run; do sudo mount --bind /$d /mnt/$d; done
sudo chroot /mnt
dpkg --configure -a && apt -f install && update-grub
```

:::say
If the system still boots I run `dpkg --configure -a` and `apt --fix-broken install`, then read the dist-upgrade logs for the real cause, often a full disk or a third-party repo. If it will not boot I use an older kernel or recovery mode, or a live/rescue instance with chroot to repair, and restore from snapshot as a last resort; going forward I always snapshot and test upgrades on staging, running them in tmux.
:::

## A Linux node shows high CPU usage even though all the pods on it appear healthy. What could be the reasons?

<!-- source: 01 Q45 -->

:::note In simple words
The shop assistants (pods) look fine, but the building is still overheating. Something else is using the power - the building's own machinery, a hidden process, or even the neighbour sharing your electricity line (noisy neighbour on a VM).
:::

(also asked as: A service is consuming 100% CPU - how do you troubleshoot it? / High CPU usage is degrading performance - what do you do?)

Step-by-step:

1. `top`/`htop` on the node -> sort by CPU; is it a pod process or a **system process** (kubelet, containerd, dockerd, journald, antivirus/security agents, log shippers)?
2. Read the CPU breakdown in `top`:
- `us` high -> user processes (app or agent).
- `sy` high -> kernel work: too many syscalls, context switching, network interrupts, iptables with thousands of rules (kube-proxy).
- `wa` high -> waiting on disk IO, not real compute.
- `st` high -> **steal time**, the hypervisor gives your CPU to other VMs, or a burstable T-instance ran out of CPU credits.
- `si` high -> softirq, heavy network packet processing.
3. Pods with **no CPU limits** or `BestEffort` pods may burst and consume the node, while still passing health checks.
4. Zombie/runaway processes, cron jobs, or leftover containers not managed by Kubernetes (`crictl ps -a`).
5. Kubelet itself busy: image garbage collection, too many pods, frequent probes, log rotation.
6. Security incident: crypto-miner - check unknown processes and outbound connections.
7. Compare `kubectl top pods` vs node `top` - the gap is the non-pod usage.

If one known service is at 100% CPU: find the PID (`top`, `pidstat`), then the hot thread (`top -H -p <PID>`); for Java run `jstack <PID>` and match the thread id in hex; use `strace -c -p <PID>` to see if it is spinning on syscalls, and `perf top -p <PID>` for hot functions. Check its logs and recent deploys/config changes (infinite retry loop, bad regex, GC thrash). Short-term: restart it or cap it (`systemctl set-property svc CPUQuota=50%`); long-term: fix the code and add CPU alerts.

**Example:**
```bash
kubectl top node ip-10-0-1-23
kubectl top pods -A --sort-by=cpu | head
# On the node:
top -o %CPU          # check us / sy / wa / st values
pidstat -u 2 5       # per-process CPU over time
crictl stats         # per-container CPU
mpstat -P ALL 1 3    # per-core; one core at 100% = single-threaded hog
```

:::say
I compare `kubectl top` with `top` on the node to see whether the load is from pods or from system components like kubelet, containerd or agents. Then I read the CPU breakdown - high system time, IO wait or steal time each point to different causes like iptables, disk bottlenecks or a noisy neighbour or exhausted T-instance credits - and I also check for pods without limits and unknown processes.
:::

## Disk utilization on production servers reached 95%. What immediate and long-term actions would you take?

<!-- source: 01 Q46 -->

:::note In simple words
Your cupboard is almost full. Right now you throw out the obvious junk so the door closes; later you buy a bigger cupboard, set a rule for old stuff, and put a sensor that warns you at 80%.
:::

(also asked as: The / partition is full - how do you find and delete large files safely? / What is using up /var? / You got a low disk space alert - how do you clean up safely?)

**Immediate (stop the bleeding, safely):**

1. Find what is big: `df -h`, then `du -xh --max-depth=1 / | sort -h`, and `ncdu` if installed. Also `df -i` for inodes.
2. Check **deleted-but-open files**: `lsof +L1` - a deleted log still held by a process keeps using space until the process restarts or you truncate it.
3. Safe quick wins: `journalctl --vacuum-size=500M`, remove old rotated logs (`*.gz`), `apt clean`, old kernels (`apt autoremove`), `docker system prune` (careful on prod), old core dumps and temp exports.
4. Truncate a live huge log instead of deleting it: `truncate -s 0 app.log`.
5. Never delete database files or anything you do not understand - move/compress first.
6. If still critical: grow the volume online (EBS modify -> `growpart` -> `resize2fs`/`xfs_growfs`).

**Long-term:**

- Log rotation (`logrotate`, journald `SystemMaxUse`), ship logs to central storage (Loki/ELK/CloudWatch).
- Alert at 80% and 90% with trend-based "disk full in X hours" alerts.
- Separate volumes for `/var/log` or data; lifecycle cleanup cron; capacity planning.
- Write an RCA: what grew and why.

**Example:**
```bash
df -h; df -i
sudo du -xh --max-depth=1 /var | sort -h | tail
sudo lsof +L1 | awk '$7 > 100000000'        # deleted files still open, >100MB
sudo journalctl --vacuum-size=500M
sudo truncate -s 0 /var/log/myapp/app.log
# Grow EBS after modifying volume size in AWS:
sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1
```

:::say
Immediately I find the biggest consumers with `du`, check for deleted-but-open files with `lsof +L1`, and free space safely by vacuuming journald, removing old rotated logs, and truncating huge live logs, or grow the EBS volume online if needed. Long term I fix log rotation, ship logs centrally, add 80/90 percent and trend alerts, and document the root cause.
:::

## One of your EC2/Linux nodes keeps going out of memory. How would you diagnose and prevent it?

<!-- source: 01 Q47 -->

:::note In simple words
A room keeps overflowing with guests and the bouncer (OOM killer) keeps throwing someone out. You check the guest list to see who is bringing too many friends, then set a limit per guest or get a bigger room.
:::

(also asked as: How do you locate and stop a process consuming high memory? / A server shows consistently high memory usage - what do you check?)

**Diagnose:**

1. Confirm OOM kills: `dmesg -T | grep -i -E "killed process|out of memory"` or `journalctl -k | grep -i oom`. The log names the killed process and its memory.
2. Current usage: `free -h` (watch **available**), `ps aux --sort=-%mem | head`, `smem` for real per-process usage.
3. Trend over time: CloudWatch (needs the **CloudWatch agent** - memory is not a default EC2 metric) or Prometheus node-exporter. A steady climb = **memory leak**; sudden spikes = a batch job/traffic burst.
4. Check what changed: new deployment, config change (e.g. JVM `-Xmx`, PHP-FPM/Gunicorn worker counts too high), cache growth.
5. On Kubernetes nodes: pods without memory limits, too many pods, and missing `kube-reserved`/`system-reserved` so system daemons get starved.

**Consistently high memory (no OOM kills):** first check it is real. Linux fills spare RAM with page cache (`buff/cache` in `free -h`), which is released on demand, so only "available" dropping and swap in use (`vmstat` `si/so`) mean real pressure. Then trend it: flat = normal working set (maybe right-size); a steady climb = leak.

**Locate and stop a memory hog (right now):** `ps aux --sort=-%mem | head` or `top` then `M` -> note the PID and owner. If it is a managed service, restart it properly (`systemctl restart svc`) rather than killing it. Otherwise `kill <PID>` (SIGTERM, lets it clean up), wait, and use `kill -9` only if it ignores that. Capture evidence first if possible (heap dump, `pmap -x <PID>`), because a restart hides the leak.

**Prevent:**

- Right-size the instance or tune the app (worker counts, heap size).
- Set memory limits (systemd `MemoryMax=`, container/pod limits) so one process cannot eat the node.
- Add swap only as a buffer on non-latency-critical servers (not usually on K8s nodes).
- Alert on memory above 85% and on OOM events; fix leaks with the dev team using heap dumps.

**Example:**
```bash
dmesg -T | grep -i "killed process"
# [Tue Sep 22 03:14:07 2026] Out of memory: Killed process 2143 (java) total-vm:6.1GB, anon-rss:3.8GB
free -h
ps aux --sort=-%mem | head -5
# Cap a service with systemd
sudo systemctl set-property myapp.service MemoryMax=1500M
```

:::say
I confirm the OOM kill in `dmesg` or the kernel journal to see which process was killed, then check per-process memory and the trend over time with the CloudWatch agent or node-exporter to tell a leak from a spike. To prevent it, I right-size or tune the app's workers and heap, set memory limits via systemd or pod limits, reserve memory for system daemons on K8s nodes, and alert on high memory and OOM events.
:::

## Latency spikes suddenly in production during off-peak hours. Where do you start debugging?

<!-- source: 01 Q48 -->

:::note In simple words
If the roads are jammed at 3 AM when nobody is driving, it is not rush hour - it is probably road maintenance. Off-peak slowness usually comes from scheduled background work, not users.
:::

Low traffic + high latency points to **scheduled or internal** causes. Order of checks:

1. **Correlate the time**: does it happen at the same minute every day/hour? That strongly suggests cron jobs, backups, batch/ETL jobs, log rotation, DB maintenance (vacuum, index rebuild), snapshots, antivirus scans, or cache expiry.
2. **Scope it**: all endpoints or one? All hosts or one AZ/node? Use p95/p99 per endpoint and per instance.
3. **Scale-in side effects**: autoscaling removed capacity at night, so the few remaining instances or cold caches struggle; scaled-to-zero services have **cold starts**; JIT/connection pools re-warm.
4. **Host level** at that minute: `sar`/`iostat` for IO wait (backups hammering disk), CPU steal or exhausted burst credits on T-instances, GC pauses in logs.
5. **Network/DNS**: DNS TTL expiry, connection pools idle-timed out by NAT/LB (350s NAT idle timeout on AWS) -> new handshakes; certificate or token refresh.
6. **Dependencies**: DB slow query log, third-party API maintenance windows.
7. Use traces to see which span grows.

**Example:**
```bash
crontab -l; ls /etc/cron.d/; systemctl list-timers        # scheduled jobs
sar -u -d -f /var/log/sysstat/sa22 -s 02:50:00 -e 03:20:00  # CPU/disk at spike time
grep -i "pause" /var/log/myapp/gc.log | tail
curl -o /dev/null -s -w "connect:%{time_connect} ttfb:%{time_starttransfer}\n" https://api/x
```

:::say
Because traffic is low, I suspect internal causes first, so I correlate the spike time with cron jobs, backups, batch jobs, DB maintenance and autoscaling scale-in or cold starts. Then I scope it by endpoint and host using p99 metrics and traces, and check host IO wait, CPU steal or credits, GC pauses, and idle connection timeouts at that exact window.
:::

## A user cannot log in to a Linux server. How do you troubleshoot?

<!-- source: 01 Q49 -->

:::note In simple words
Someone cannot enter the office. Is their ID card expired, blocked, the wrong card, is the door itself broken, or is their desk (home folder) missing?
:::

1. Get the exact error and method (SSH key, password, console).
2. Read the auth log: `/var/log/auth.log` (Ubuntu) or `/var/log/secure` (RHEL), or `journalctl -u sshd`.
3. Account state: `id user`, `chage -l user` (password expired?), `passwd -S user` (L = locked), `faillock --user user` or `pam_tally2` (locked after failed attempts).
4. Shell: `/etc/passwd` shell set to `/sbin/nologin` or `/bin/false`?
5. SSH rules: `AllowUsers`/`AllowGroups`/`DenyUsers` in `/etc/ssh/sshd_config`; key in `~/.ssh/authorized_keys` with correct permissions.
6. Home directory missing or wrong owner.
7. Disk full (`df -h`) or too many processes can also block logins.

**Example:**
```bash
sudo tail -f /var/log/auth.log
passwd -S priya;  chage -l priya
sudo faillock --user priya --reset
getent passwd priya          # check shell and home
sudo usermod -s /bin/bash priya
```

:::say
I read the auth log first because it usually names the reason, then check whether the account is locked or expired with `passwd -S`, `chage -l` and faillock, whether the shell is nologin, and sshd AllowUsers rules and key permissions. I also check the home directory and disk space.
:::

## A script is executable by one user but not another, or a user cannot access a directory even though they are in the correct group. Why?

<!-- source: 01 Q50 -->

:::note In simple words
Two people have the same door key, but one is not on the building's allowed list, or the corridor leading to the door is locked for them.
:::

(also asked as: A user cannot access a directory even though they are in the correct group)

Check in this order:

- File permissions: `ls -l script.sh` -> maybe `rwxr-x---`, so "others" cannot execute. The second user is not the owner or in the group.
- Parent directories: every directory in the path needs `x` for that user (`namei -l /opt/scripts/script.sh` shows each level).
- Interpreter: the shebang (`#!/usr/bin/env bash`) must be executable by them.
- Mount options: a filesystem mounted `noexec` (like `/tmp` on hardened servers) blocks execution for everyone running it from there.
- ACLs: `getfacl script.sh` may explicitly deny a user.
- SELinux/AppArmor contexts: `ls -Z`.
- Inside the script: it may read files or use sudo that only user A is allowed.
- `PATH` differences: user B runs a different copy.
- Group just added? Group membership is read at login, so the user's current session still has the OLD groups - `id` in their shell will not show it. Log out and in again, or run `newgrp devops` for that shell.
- Directory needs the right bits: `r` to list, `x` to enter, `w`+`x` to create or delete files inside.
- NFS/EFS shares: the server checks numeric UIDs/GIDs, so a GID mismatch between servers or `root_squash` blocks access.
- Immutable attribute: `lsattr` shows `i`, and then even root cannot modify it (`chattr -i` to remove).

**Example:**
```bash
ls -l /opt/scripts/deploy.sh      # -rwxr-x--- root devops
namei -l /opt/scripts/deploy.sh
getfacl /opt/scripts/deploy.sh
id userb                          # not in devops group
sudo usermod -aG devops userb     # fix (user must log in again)
```

:::say
I compare the file's owner, group and mode with the second user's groups using `ls -l` and `id`, check every parent directory with `namei -l`, and look at ACLs, noexec mounts and SELinux contexts. Usually the fix is adding the user to the right group or adjusting group permissions, not chmod 777.
:::

## You cannot SSH into a server. How do you troubleshoot?

<!-- source: 01 Q51 -->

:::note In simple words
You cannot enter a house. Either the road to it is blocked (network), nobody opens the door (sshd down), or the door opens but your key does not fit (authentication).
:::

(also asked as: SSH is not working)

1. Read the error: `Connection timed out` -> network/firewall; `Connection refused` -> host reachable, sshd not listening; `Permission denied (publickey)` -> auth problem; `Host key verification failed` -> host key changed (rebuilt server).
2. Verbose client: `ssh -vvv user@host` shows the exact stage that fails.
3. Network: `nc -zv host 22`, Security Group/NACL inbound 22 from your IP, route tables, public IP or bastion path.
4. Auth: right user (`ec2-user` vs `ubuntu`), right key, key file mode `600`, server `~/.ssh` 700 and `authorized_keys` 600, correct owner.
5. Server side, via another path (EC2 **Serial Console**, **SSM Session Manager**, console): `systemctl status sshd`, `sshd -t` (config syntax), `/var/log/auth.log`, disk full, `fail2ban` ban.
6. Last resort on AWS: stop instance, attach the root volume to a rescue instance, fix config/keys.

**Example:**
```bash
ssh -vvv -i key.pem ec2-user@10.0.1.5
nc -zv 10.0.1.5 22
chmod 600 key.pem
aws ssm start-session --target i-0abc123     # no SSH needed
sudo sshd -t && sudo systemctl restart sshd
```

:::say
I read the exact error with `ssh -vvv` to classify it as network, sshd or authentication. Then I check port 22 and security groups for timeouts, sshd status and config for refusals, and user, key and permissions for auth failures, using SSM Session Manager or the serial console to get in if SSH is fully broken.
:::

## Ping to a server works, but SSH using its hostname fails. Why?

<!-- source: 01 Q52 -->

:::note In simple words
You can reach the house by its exact GPS coordinates, but using its name sends you to a different house, or the house is open for waving (ping) but its door (port 22) is locked.
:::

- Did ping use the **IP** and SSH the **name**? Then it is DNS: `dig host`, `getent hosts host` - the name may resolve to a different/old IP, IPv6 (AAAA) first, or a wrong `/etc/hosts` entry.
- If ping by name also works: ping is ICMP, SSH is TCP 22 - the firewall/Security Group may allow ICMP but not port 22. Test `nc -zv host 22`.
- `~/.ssh/config` may override the hostname, user, port or ProxyJump for that name.
- `known_hosts` mismatch for that name ("REMOTE HOST IDENTIFICATION HAS CHANGED") if the name now points to a rebuilt server.
- sshd running on a non-default port.
- Slow login rather than failure: `UseDNS yes` on the server doing reverse lookups.

**Example:**
```bash
getent hosts app01.internal; dig +short app01.internal
ssh -G app01.internal | grep -E "^(hostname|port|user) "
nc -zv app01.internal 22
ssh-keygen -R app01.internal         # remove stale host key
```

:::say
Ping only proves ICMP to some IP works, so I check whether the hostname resolves to the same IP with `getent hosts` or dig, whether port 22 is actually open with `nc -zv`, and whether ~/.ssh/config or a stale known_hosts entry is interfering.
:::

## A log file shows junk characters when you open it. What could be wrong?

<!-- source: 01 Q53 -->

:::note In simple words
It is like opening a zipped parcel and trying to read the packing foam - the content is fine, you are just looking at it in the wrong form.
:::

- It is **compressed**: rotated logs like `app.log.1.gz` -> use `zcat`, `zless`, `zgrep`. Check with `file app.log`.
- It is **binary**: systemd journal files, `wtmp`/`btmp` (use `last`, `lastb`), or database files.
- **Encoding** mismatch: UTF-16 from a Windows app, or a different charset -> `file -i`, `iconv -f UTF-16 -t UTF-8`.
- **ANSI color codes** from apps (`^[[32m`) -> `less -R` or strip with sed.
- **NUL bytes** at the start after log rotation with `copytruncate` while the app keeps writing at its old offset -> the file becomes "sparse" with zeros. Fix: make the app open with append mode or reopen logs on rotation (signal/postrotate) instead of copytruncate.
- Disk/filesystem corruption (rare) -> check `dmesg`.

**Example:**
```bash
file /var/log/app.log.2.gz          # gzip compressed data
zgrep "ERROR" /var/log/app.log.2.gz
file -i app.log                     # charset=utf-16le
iconv -f UTF-16LE -t UTF-8 app.log > app-utf8.log
less -R colored.log
tr -d '\000' < app.log | less       # strip NUL bytes
```

:::say
I run `file` on it first: it is often a gzip-rotated log to read with zcat or zgrep, a binary file like journal or wtmp, a UTF-16 encoding to convert with iconv, or ANSI colour codes. NUL bytes at the start usually mean logrotate copytruncate while the app keeps its old offset.
:::

## A cron job is not running. How do you debug it?

<!-- source: 01 Q54 -->

:::note In simple words
The alarm clock did not ring. Is the clock plugged in (cron service), was the time set right, and when it rang did the person actually know how to do the task without their usual tools (environment)?
:::

(also asked as: A cron job did not run last night - what do you check?)

1. Is cron running? `systemctl status cron` (Ubuntu) / `crond` (RHEL).
2. Did it trigger? `grep CRON /var/log/syslog` or `journalctl -u cron` -> if the line is there, cron ran it and the **script** failed.
3. Syntax: check the 5 time fields (crontab.guru logic), and in `/etc/crontab` or `/etc/cron.d/` there is an extra **user** field. Files in `/etc/cron.d` must not have dots in the name and need a trailing newline.
4. Environment: cron has minimal `PATH` and no profile -> use absolute paths, set `PATH=` at the top, `cd` to the right directory.
5. `%` is special in crontab (means newline) -> escape as `\%` (common with `date +%F`).
6. Permissions: script executable? `/etc/cron.allow` / `cron.deny`? Correct user's crontab?
7. Capture output: `>> /tmp/job.log 2>&1` and test with `env -i /bin/sh -c '/path/script.sh'` to mimic cron.
8. Timezone of the server vs what you expected (cron uses system time).

**Example:**
```bash
systemctl status cron
grep CRON /var/log/syslog | tail
crontab -l
# wrong:  0 2 * * * backup.sh
# right:
0 2 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1
0 3 * * * /usr/bin/tar czf /backup/app-$(date +\%F).tgz /opt/app
```

:::say
I confirm the cron service runs and check syslog or journalctl to see whether the job was triggered; if it was, the script is failing, usually because of cron's minimal PATH, relative paths, or an unescaped % sign. I redirect output to a log file and reproduce with `env -i` to mimic cron's environment.
:::

## yum/dnf or apt is failing. How do you troubleshoot it?

<!-- source: 01 Q55 -->

:::note In simple words
The shop you order parts from is not delivering. Maybe you cannot reach the shop (network/proxy), the catalogue is outdated (metadata), the shop's ID is not trusted (GPG key), or another order is still being processed (lock).
:::

1. Read the full error - it usually names the repo or package.
2. Network: can you reach the repo? `curl -I <repo-url>`, DNS, proxy settings, NAT gateway / VPC endpoint for private instances.
3. Lock: another apt/dnf or `unattended-upgrades` is running -> wait; `ps aux | grep -E "apt|dpkg"`. Only remove stale lock files if no process holds them.
4. Stale metadata: `apt clean && apt update` / `dnf clean all && dnf makecache`.
5. GPG/key errors: import the repo key (expired keys are common with third-party repos).
6. Broken or interrupted installs: `dpkg --configure -a`, `apt --fix-broken install`; `dnf check`, `package-cleanup --problems`.
7. Bad or dead third-party repo: disable it (`/etc/apt/sources.list.d/`, `dnf config-manager --set-disabled`).
8. Disk full on `/var` or `/boot`; clock wrong (TLS/GPG validity errors).

**Example:**
```bash
sudo apt update 2>&1 | tail
sudo lsof /var/lib/dpkg/lock-frontend
sudo dpkg --configure -a && sudo apt --fix-broken install
sudo dnf clean all && sudo dnf makecache
curl -I https://archive.ubuntu.com/ubuntu/
df -h /var /boot; timedatectl
```

:::say
I read the exact error, then check repo reachability, DNS and proxy, whether another package process holds the lock, and refresh metadata with clean and update. Other common causes are expired GPG keys, dead third-party repos, interrupted installs needing `dpkg --configure -a`, a full /var or /boot, and a wrong system clock.
:::
