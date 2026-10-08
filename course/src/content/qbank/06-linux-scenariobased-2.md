---
track: qbank
title: "Linux, shell and networking: Scenario-based questions (part 2 of 4)"
short: Linux scenario 2
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## A user is in the sudoers file but sudo still fails. Why?

<!-- source: 01 Q56 -->

:::note In simple words
Your name is on the VIP list, but the list has a typo, a later line overrides you, or the bouncer is checking a different list.
:::

- Syntax error in `/etc/sudoers` or a file in `/etc/sudoers.d/` -> sudo may refuse to work at all. Always edit with `visudo` and check with `visudo -c`.
- Rule order: sudoers uses the **last matching rule** - a later `%group` line may restrict the user.
- Group membership added but the user did not log out/in -> `id` in their session will not show the new group.
- Rule limited to certain commands or hosts, or `!` negations.
- Files in `/etc/sudoers.d/` ignored if their name contains a `.` or `~`, or have wrong permissions (should be `0440`, owned by root).
- Password expired, account locked, or `requiretty` settings.
- Messages: check `/var/log/auth.log` or `/var/log/secure` - "user NOT in sudoers" vs "command not allowed".

**Example:**
```bash
sudo visudo -c
sudo -l -U priya              # what is this user actually allowed?
id priya
ls -l /etc/sudoers.d/         # -r--r----- root root  90-priya
echo 'priya ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx' | sudo tee /etc/sudoers.d/90-priya
sudo chmod 440 /etc/sudoers.d/90-priya
```

:::say
I check syntax with `visudo -c`, see the user's effective rules with `sudo -l -U user`, and confirm with `id` that a newly added group is active in their session. Common causes are a later rule overriding theirs, a sudoers.d file with a dot in its name or wrong permissions, and command-restricted rules; the auth log shows which one.
:::

## A server hit a kernel panic. How do you troubleshoot and recover?

<!-- source: 01 Q57 -->

:::note In simple words
The building's power system tripped completely. First get power back (reboot / older kernel), then read the black box recorder (crash dump, logs) to see what caused the trip.
:::

Recover:

1. Reboot. If it panics again, pick an **older kernel** in GRUB or recovery mode (on AWS use the EC2 Serial Console, or attach the root volume to a rescue instance).
2. Common triggers: new kernel or driver/module after patching, bad fstab or missing root device, corrupted initramfs, hardware/memory faults, out-of-memory with `panic_on_oom`.
3. Fixes: boot the old kernel and remove/hold the bad one, rebuild initramfs (`dracut -f` / `update-initramfs -u`), fix fstab, fsck the root disk.

Find the root cause:

- Screenshot/serial console output (EC2 "Get system log" / "Get instance screenshot").
- `journalctl -k -b -1` (previous boot kernel log) if persistent journald is enabled.
- **kdump** captures a crash dump in `/var/crash`, analysed with the `crash` tool.
- Recent changes: new kernel, modules, hardware events.

**Example:**
```bash
aws ec2 get-console-output --instance-id i-0abc123 --latest --output text | tail -40
journalctl -k -b -1 | tail -50
ls /var/crash/
sudo dracut -f            # RHEL: rebuild initramfs
sudo update-initramfs -u  # Ubuntu
sudo systemctl enable --now kdump
```

:::say
I bring it back first, booting the previous kernel or using recovery mode or a rescue instance, then find the cause from the console output, the previous boot's kernel log and a kdump crash dump. The usual culprits are a new kernel or driver, a broken initramfs or fstab, or hardware, and I enable kdump so the next panic leaves evidence.
:::

## How do you find and handle zombie processes?

<!-- source: 01 Q58 -->

:::note In simple words
A zombie is a worker who has finished and gone home, but their name is still on the attendance sheet because the manager (parent process) never signed them out.
:::

- A zombie (`Z` state, `<defunct>`) has already exited; it uses no CPU or memory, only a PID table entry. It exists because the **parent** did not call `wait()` to collect its exit status.
- You **cannot kill a zombie** - it is already dead. `kill -9` on it does nothing.
- Fix the parent: send it `SIGCHLD` (`kill -s SIGCHLD <PPID>`) to prompt it to reap; if that fails, restart/kill the parent -> the zombies are adopted by init/systemd (PID 1), which reaps them.
- A few zombies are harmless; thousands can exhaust the PID limit (`pid_max`) and stop new processes starting.
- In containers, if your app is PID 1 and does not reap children, use `tini` or `docker run --init` (or `shareProcessNamespace` patterns) - a common cause.
- Long-term: fix the parent's code to reap children.

**Example:**
```text
ps -eo pid,ppid,stat,cmd | awk '$3 ~ /Z/'
#  4521  4400  Z   [worker] <defunct>
ps -o pid,cmd -p 4400                  # the parent
sudo kill -s SIGCHLD 4400
sudo systemctl restart myapp           # if the parent will not reap
```

:::say
I list them with `ps` filtering for Z state and find the parent PID, because a zombie is already dead and cannot be killed; the parent has not reaped it. I signal the parent with SIGCHLD or restart it so PID 1 adopts and reaps them, and in containers I use tini or `--init` as PID 1.
:::

## An application fails with "Too many open files". How do you fix it?

<!-- source: 01 Q59 -->

:::note In simple words
Every process has a limited number of drawer handles it can hold at once. The app is holding too many - either it needs a bigger allowance or it is forgetting to let go (leak).
:::

1. Confirm the limit and usage: `cat /proc/<PID>/limits | grep "open files"` and `ls /proc/<PID>/fd | wc -l` (or `lsof -p PID | wc -l`).
2. Leak or real need? If the count keeps rising with steady traffic, it is a **file/socket leak** (connections not closed). Look at `lsof -p PID` - many sockets in `CLOSE_WAIT` point to the app not closing connections.
3. Raise the limit correctly:
- systemd services: `LimitNOFILE=65536` in the unit (or a drop-in), then `daemon-reload` and restart. (`/etc/security/limits.conf` does NOT apply to systemd services.)
- Login sessions: `/etc/security/limits.conf` (`nofile`), then re-login; check with `ulimit -n`.
- System-wide max: `fs.file-max` / `fs.nr_open` via sysctl (rarely the actual problem).
- Containers: `--ulimit nofile=65536:65536`.
4. Monitor fd usage so it alerts before the limit.

**Example:**
```bash
PID=$(pgrep -f myapp | head -1)
grep "open files" /proc/$PID/limits      # Max open files 1024 1024
ls /proc/$PID/fd | wc -l                 # 1021
lsof -p $PID | awk '{print $NF}' | sort | uniq -c | sort -rn | head
sudo systemctl edit myapp                # add: [Service] LimitNOFILE=65536
sudo systemctl daemon-reload && sudo systemctl restart myapp
```

:::say
I compare the process's current descriptor count in /proc/PID/fd with its limit in /proc/PID/limits and check with lsof whether it is a leak, such as sockets piling up in CLOSE_WAIT. If the app genuinely needs more, I raise LimitNOFILE in the systemd unit, since limits.conf does not apply to services, and add monitoring on descriptor usage.
:::

## A user's home directory is missing. How do you restore it?

<!-- source: 01 Q60 -->

:::note In simple words
An employee's locker was removed. You give them a new empty locker with the standard starter kit, and if their old belongings matter you fetch them from the storage backup.
:::

1. Confirm: `getent passwd user` shows the expected home path; check whether it was moved or is on a mount that did not come up (NFS/EFS home, `/home` on a separate disk -> `df -h`, `mount -a`).
2. Recreate a fresh one: `mkhomedir_helper user` (or `mkdir` + copy `/etc/skel`), set owner `user:user` and mode `700`/`750`.
3. Restore data from backup/snapshot (EBS snapshot -> new volume -> mount and copy with `rsync -a` to keep permissions).
4. Restore `~/.ssh/authorized_keys` so SSH key login works again (700 on `.ssh`, 600 on the file).
5. If it happens for many users, enable `pam_mkhomedir` so homes are auto-created on first login (common with LDAP/AD users).
6. Investigate why: `userdel -r`, cleanup script, failed mount - check auth logs and bash history.

**Example:**
```bash
getent passwd priya            # priya:x:1001:1001::/home/priya:/bin/bash
sudo mkhomedir_helper priya    # or:
sudo cp -r /etc/skel /home/priya && sudo chown -R priya:priya /home/priya && sudo chmod 750 /home/priya
sudo rsync -a /mnt/snapshot/home/priya/ /home/priya/
```

:::say
I first check whether it is truly deleted or just on a mount that failed, then recreate it with mkhomedir_helper or /etc/skel with the right ownership and permissions, and restore data and SSH keys from a backup or snapshot using rsync -a. For directory-based users I enable pam_mkhomedir, and I find out what removed it.
:::

## The server time is wrong. How do you fix it using NTP/chrony?

<!-- source: 01 Q61 -->

:::note In simple words
If a server's watch is wrong, it arrives late to every meeting - certificates look expired, logs do not line up, and logins with time-based tokens fail. NTP keeps checking the watch against an atomic clock.
:::

1. Check: `timedatectl` -> "System clock synchronized: no" / "NTP service: inactive"? Also check the **timezone** - maybe the time is right but the zone is wrong.
2. Use **chrony** (default on RHEL/Amazon Linux, common on Ubuntu) or systemd-timesyncd.
3. Configure servers in `/etc/chrony.conf`: on AWS use the **Amazon Time Sync Service** `169.254.169.123` (no internet needed); otherwise `pool.ntp.org` or company NTP.
4. Make sure UDP 123 outbound is allowed if using external servers.
5. Large offsets: chrony slews (slowly adjusts) by default; `chronyc makestep` jumps immediately (careful with running databases/apps).
6. Verify with `chronyc tracking` and `chronyc sources -v`.
7. Monitor clock offset (node-exporter `node_timex_offset_seconds`).

**Example:**
```bash
timedatectl
sudo timedatectl set-timezone Asia/Kolkata
echo "server 169.254.169.123 prefer iburst" | sudo tee -a /etc/chrony.conf
sudo systemctl enable --now chronyd
sudo chronyc makestep
chronyc tracking | grep -E "System time|Leap"
chronyc sources -v
```

:::say
I check `timedatectl` for sync status and timezone, configure chrony with a reliable source - on AWS the Amazon Time Sync Service at 169.254.169.123 - and restart it, using `chronyc makestep` for a large offset. I verify with `chronyc tracking` and monitor clock drift, because wrong time breaks TLS, tokens, clusters and log correlation.
:::

## df and du show different disk usage. Why?

<!-- source: 01 Q63 -->

:::note In simple words
df reads the building's official meter, du walks around counting boxes it can see. If some boxes are hidden or thrown out but still held by someone, the two numbers disagree.
:::

Main reasons, most common first:

1. **Deleted-but-open files** -> counted by `df`, invisible to `du`. Check `lsof +L1` (see previous question).
2. **Files hidden under a mount point** -> data written to `/data` before a disk was mounted on `/data` sits underneath, hidden. Check with a bind mount: `mount --bind / /mnt/root && du -sh /mnt/root/data`.
3. **Reserved blocks** -> ext4 reserves ~5% for root, so df "Used + Avail" is less than "Size". Can reduce with `tune2fs -m 1` on data disks.
4. Filesystem metadata/journal overhead.
5. `du` run without `-x`, or without permission to read some folders, or double-counting across mounts.
6. Sparse files and hard links count differently (`du --apparent-size`).

**Example:**
```bash
df -h /; sudo du -xsh /
sudo lsof +L1 | head
sudo mkdir -p /mnt/rootfs && sudo mount --bind / /mnt/rootfs
sudo du -sh /mnt/rootfs/data           # data hidden under the /data mount?
sudo umount /mnt/rootfs
sudo tune2fs -l /dev/nvme0n1p1 | grep "Reserved block count"
```

:::say
df reads filesystem-level usage while du sums the files it can see, so the gap is usually deleted files still held open, which I find with `lsof +L1`, or data hidden underneath a mount point, which I reveal with a bind mount. Reserved blocks on ext4 and metadata overhead explain smaller differences.
:::

## The system load is very high. How do you analyse it?

<!-- source: 01 Q64 -->

:::note In simple words
Load average is the length of the queue at the counters. A long queue can mean the cashiers are all busy (CPU) or everyone is waiting for the stockroom (disk IO) - the fix is different.
:::

1. `uptime` -> 1, 5, 15-minute load averages. Compare to CPU count (`nproc`): load 8 on 8 cores is full, on 2 cores it is overloaded. Rising 1-min vs 15-min = getting worse.
2. On Linux load = runnable processes (**R**) + processes in uninterruptible sleep (**D**, usually IO). So high load does not always mean high CPU.
3. `top` / `vmstat 1`:
- High `us`/`sy` and many in `r` column -> CPU-bound -> find the process (`ps --sort=-%cpu`, `pidstat`).
- High `wa` and many in `b` column / `D` state -> IO-bound -> `iostat -x`, `iotop` (slow disk, EBS limits, NFS hang).
4. Hung NFS mounts can put many processes in `D` state and send load through the roof with idle CPU.
5. Memory pressure -> swapping (`si/so` in vmstat) also raises load.
6. Correlate with time (cron, backups, deploys) and fix: scale, tune, move the job, or fix the storage.

**Example:**
```bash
uptime; nproc
# load average: 24.10, 18.40, 9.02    (4 cores -> overloaded, getting worse)
vmstat 1 5          # r, b, wa, si/so columns
ps -eo stat,pid,cmd | awk '$1 ~ /^D/'   # stuck in IO wait
iostat -xz 1 3
```

:::say
I compare the load average with the number of cores and remember Linux load counts both runnable and IO-blocked processes. Then vmstat and top tell me whether it is CPU-bound, IO-bound, a hung NFS mount with processes in D state, or swapping, and I drill down with pidstat, iostat or iotop and correlate it with scheduled jobs.
:::

## An NFS mount is not working. How do you troubleshoot it?

<!-- source: 01 Q65 -->

:::note In simple words
You are trying to use a shared cupboard in another building. The road may be closed (network/ports), the other building may not have given you permission (exports), or your door key type does not match (NFS version).
:::

1. Error message: `mount.nfs: access denied`, `timed out`, `No such file or directory`, or a hang.
2. Network: `ping`/`nc -zv server 2049` (NFSv4 only needs TCP 2049; v3 also needs 111 rpcbind and mountd ports). On AWS EFS: the mount target's Security Group must allow **2049 from the client**.
3. Server exports: `showmount -e server` (v3) and `/etc/exports` - is the client IP/subnet allowed? Run `exportfs -ra` after changes.
4. Client packages: `nfs-utils` (RHEL) / `nfs-common` (Ubuntu); `amazon-efs-utils` for EFS.
5. Version mismatch: force `-o vers=4.1`.
6. Permission issues after mounting: UID/GID mismatch between client and server, `root_squash`.
7. Hung (stale) mount: `umount -f -l /mnt/nfs`; use `_netdev,nofail` in fstab so boot does not hang.
8. Logs: `dmesg`, `journalctl` on client; `/var/log/messages` on server.

**Example:**
```bash
nc -zv 10.0.3.10 2049
showmount -e 10.0.3.10
sudo mount -t nfs4 -o vers=4.1,timeo=600,retrans=2 10.0.3.10:/exports/data /mnt/data
dmesg | tail
# /etc/fstab
10.0.3.10:/exports/data  /mnt/data  nfs4  vers=4.1,_netdev,nofail  0 0
```

:::say
I read the mount error and test port 2049 - on EFS that means the mount target security group - then check the server's exports allow my client and that the client has nfs-utils. After that I look at NFS version mismatches, UID/GID and root_squash permission issues, and use `_netdev,nofail` in fstab so a failed share does not block boot.
:::

## How do you recover a deleted file on Linux?

<!-- source: 01 Q66 -->

:::note In simple words
Linux has no recycle bin. You can grab the file back if someone is still holding it, fetch a copy from the backup cupboard, or try forensic tools that search the floor for the scraps - which get swept away quickly.
:::

(also asked as: An important config file was deleted and there is no backup - what do you do?)

In order of success rate:

1. **Still open by a process?** `lsof +L1 | grep filename` -> copy it back from the file descriptor: `cp /proc/<PID>/fd/<FD> /restore/file`. Works perfectly and instantly.
2. **Backups/snapshots**: EBS snapshot -> create volume -> mount -> copy; AWS Backup; S3 versioning; LVM snapshots; git history for config/code.
3. **Undelete tools** (last resort): `extundelete` / `ext4magic` for ext4, `xfs_undelete` for XFS, `testdisk`/`photorec` for raw carving. Immediately **stop writing** to that filesystem - remount read-only or unmount - because new writes overwrite freed blocks. Recover to a DIFFERENT disk.
4. Prevention: backups with tested restores, `alias rm='rm -i'` for humans, trash tools, and config under version control.

Deleted config file with no backup:

- If the service is still running, its config is often still loaded in memory - do NOT restart it yet. Check `/proc/<PID>/fd` in case the file is open, and dump the running config if the app supports it (`nginx -T`, `haproxy -c`, database `SHOW VARIABLES`).
- Package default: find the owning package (`dpkg -S /etc/nginx/nginx.conf`, `rpm -qf`) and reinstall it - `apt-get install --reinstall nginx` (add `-o Dpkg::Options::="--force-confmiss"` so a missing conffile is recreated) or `dnf reinstall nginx`. `rpm -V nginx` shows which files are missing or changed. Then re-apply your customisations.
- Other copies: the same file on a sibling server, `.bak`/`.rpmsave`/`.dpkg-old` files, the AMI/snapshot, **etckeeper** (git history of /etc).
- Real fix: keep configs in **config management** (Ansible/Git), so re-running the playbook IS the restore.

**Example:**
```bash
sudo lsof +L1 | grep report.csv
# python 3310 app 5r REG ... /data/report.csv (deleted)
sudo cp /proc/3310/fd/5 /tmp/report.csv
# Last resort, filesystem unmounted:
sudo umount /data
sudo extundelete /dev/nvme1n1p1 --restore-file data/report.csv --output-dir /recovery
```

:::say
If a process still has it open I copy it back from /proc/PID/fd immediately; otherwise I restore from a snapshot or backup. As a last resort I unmount or remount the filesystem read-only to avoid overwriting blocks and try extundelete or testdisk onto a different disk, and prevention is backups with regularly tested restores.
:::

## A filesystem went read-only. How do you remount it read-write without a reboot?

<!-- source: 01 Q67 -->

:::note In simple words
The notebook locked itself to "view only" because it noticed a torn page. You can unlock it, but you should first check why it locked, or you may tear more pages.
:::

- The kernel remounts a filesystem read-only when it detects **errors** (`errors=remount-ro` in fstab) - disk/EBS I/O errors or corruption. So first read `dmesg` for EXT4-fs/XFS errors.
- If the cause is resolved (e.g. temporary storage glitch, or it was mounted ro on purpose/in recovery mode):
- `mount -o remount,rw /mountpoint` -> switch back to read-write without unmounting.
- If there are real filesystem errors, remount-rw is risky -> schedule an fsck (see next question) or fail over.
- Also check the disk is not simply full, which gives "No space left" rather than read-only.
- In recovery mode/single-user the root is mounted ro by default -> `mount -o remount,rw /` is the normal first step.

**Example:**
```bash
dmesg -T | grep -i -E "ext4-fs error|xfs|remount|i/o error" | tail
mount | grep " / "            # (ro,relatime,...)
sudo mount -o remount,rw /
touch /tmp/rwtest && echo OK
```

:::say
I use `mount -o remount,rw /mountpoint`, but only after checking dmesg for why the kernel made it read-only, because usually it detected I/O errors or corruption. If there are real errors I plan an fsck or failover instead of forcing it writable.
:::

## How do you fix a corrupted filesystem with fsck?

<!-- source: 01 Q68 -->

:::note In simple words
fsck is a doctor that checks the filing system's index. You never operate on a patient who is running around - the filesystem must be unmounted (resting) first.
:::

- **Never run fsck on a mounted read-write filesystem** - it can cause more corruption.
- Snapshot the volume first (AWS: EBS snapshot) so the repair can be undone.
- Data disk: stop apps, `umount /data`, then `fsck -f /dev/xxx` (ext4 `e2fsck -fy`) or for XFS `xfs_repair /dev/xxx` (XFS does not use fsck; if the log is dirty, mount/unmount first to replay it, use `xfs_repair -L` only as a last resort because it discards the log).
- Root filesystem: boot into recovery/rescue mode, a live USB, or on AWS attach the root volume to a **rescue instance** and repair it there. Or force a check on next boot (`fsck.mode=force` kernel parameter, or `touch /forcefsck` on older systems).
- Check `lost+found` afterwards for recovered fragments.
- Find the cause: failing disk (SMART, EBS status checks), unclean shutdowns.

**Example:**
```bash
sudo umount /data
sudo e2fsck -fy /dev/nvme1n1p1     # ext4
sudo xfs_repair /dev/nvme1n1p1     # XFS
sudo mount /data && ls /data/lost+found
```

:::say
I take a snapshot, unmount the filesystem - or for root use rescue mode or attach the volume to a rescue instance - and run `e2fsck -f` for ext4 or `xfs_repair` for XFS, never on a mounted filesystem. Afterwards I check lost+found and investigate the underlying disk or shutdown issue.
:::
