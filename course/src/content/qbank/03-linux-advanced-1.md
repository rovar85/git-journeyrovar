---
track: qbank
title: "Linux, shell and networking: Advanced questions (part 1 of 2)"
short: Linux advanced 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Write a shell script to verify whether SSH connectivity to a server (or list of servers) is working.

<!-- source: 01 Q23 -->

:::note In simple words
Like a security guard walking down a corridor and trying each door with the key - noting which open, which are locked, and which are not answering at all.
:::

Good script qualities: non-interactive (`BatchMode=yes` so it never waits for a password), a short `ConnectTimeout`, a separate TCP port check to tell "network down" from "auth failed", clear exit codes, and a summary for cron/CI.

**Example:**
```text
#!/usr/bin/env bash
# Usage: ./check_ssh.sh servers.txt [user]
set -uo pipefail
FILE="${1:?Usage: $0 <servers_file> [user]}"
USER_NAME="${2:-ubuntu}"
FAILED=0

while read -r HOST; do
  [ -z "$HOST" ] && continue
  if ! nc -z -w 3 "$HOST" 22 2>/dev/null; then
    echo "[DOWN]  $HOST - port 22 not reachable (network/SG/firewall)"
    FAILED=$((FAILED+1)); continue
  fi
  if ssh -n -o BatchMode=yes -o ConnectTimeout=5 \
         -o StrictHostKeyChecking=accept-new \
         "$USER_NAME@$HOST" 'hostname' >/dev/null 2>&1; then
    echo "[OK]    $HOST"
  else
    echo "[AUTH]  $HOST - port open but SSH login failed (key/user/permissions)"
    FAILED=$((FAILED+1))
  fi
done < "$FILE"

echo "Failed: $FAILED"
exit $(( FAILED > 0 ? 1 : 0 ))
```

Note `ssh -n` stops ssh from eating the rest of the input file inside the while loop - a classic bug.

:::say
My script loops over hosts, first checks port 22 with `nc -z` to separate network issues from authentication issues, then runs `ssh -o BatchMode=yes -o ConnectTimeout=5 user@host hostname`. It reports OK/DOWN/AUTH per host and exits non-zero if any fail, so it works in cron or a pipeline.
:::

## How can you access a Windows C: drive from an Ubuntu system (dual boot or mounted disk)?

<!-- source: 01 Q24 -->

:::note In simple words
The Windows disk is like a filing cabinet in a different language. Ubuntu needs the translator (NTFS driver) and then you just open the drawer at a folder you choose.
:::

1. Find the partition: `lsblk -f` or `sudo fdisk -l` -> look for the `ntfs` partition (e.g. `/dev/sda3` or `/dev/nvme0n1p3`).
2. Create a mount point: `sudo mkdir -p /mnt/windows`.
3. Mount it: `sudo mount -t ntfs3 /dev/sda3 /mnt/windows` (kernel 5.15+ `ntfs3` driver) or `-t ntfs-3g` (install `ntfs-3g`). Use `-o ro` for read-only to be safe.
4. Make it permanent via `/etc/fstab` using the UUID from `blkid`.

Common gotcha: if Windows was shut down with **Fast Startup / hibernation**, the disk is marked "in use" and mounts read-only or fails. Fix by disabling Fast Startup in Windows or doing a full shutdown; `ntfsfix` can clear the dirty flag only as a last resort. BitLocker-encrypted drives need `dislocker` and the recovery key.

**Example:**
```bash
lsblk -f
# nvme0n1p3 ntfs  Windows  1A2B3C4D5E6F7788
sudo mkdir -p /mnt/windows
sudo mount -t ntfs3 -o ro /dev/nvme0n1p3 /mnt/windows
ls /mnt/windows/Users

# /etc/fstab (permanent)
UUID=1A2B3C4D5E6F7788  /mnt/windows  ntfs3  defaults,uid=1000,gid=1000,nofail  0  0
```

:::say
I identify the NTFS partition with `lsblk -f`, create a mount point and mount it with the `ntfs3` or `ntfs-3g` driver, and add it to /etc/fstab by UUID for persistence. If it mounts read-only, it is usually Windows Fast Startup or hibernation, which must be disabled first.
:::

## How do you troubleshoot network latency step by step?

<!-- source: 01 Q25 -->

:::note In simple words
A slow pizza delivery could be slow ordering (DNS), traffic on the road (network), a slow door check (TLS), or a slow kitchen (application). You time each stage to find the real culprit.
:::

1. **Measure precisely where time goes** with `curl -w`: DNS lookup, TCP connect, TLS handshake, time to first byte (TTFB), total.
2. **DNS slow** -> resolver issue, low TTL, too many search domains (`ndots` in Kubernetes).
3. **Connect slow** -> network distance, packet loss, congested NAT/firewall; check with `mtr` for loss per hop.
4. **TLS slow** -> no session reuse, huge certificate chains, CPU-starved terminator.
5. **TTFB slow but connect fast** -> the server/app/database is slow, not the network.
6. Check the host: `ss -s` (connection counts, TIME_WAIT), retransmits via `netstat -s | grep -i retrans`, NIC errors with `ip -s link`.
7. Compare from different locations (same subnet vs internet) to isolate the segment.
8. Look at p95/p99 not just averages - tail latency hides behind a good average.

**Example:**
```bash
curl -o /dev/null -s -w \
 "dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} \
ttfb:%{time_starttransfer} total:%{time_total}\n" https://api.example.com/health
# dns:0.004 connect:0.021 tls:0.058 ttfb:1.842 total:1.845   <- app is slow, not network

mtr -rwc 50 api.example.com
netstat -s | grep -i retrans
```

:::say
I break the request into DNS, TCP connect, TLS and time-to-first-byte using `curl -w`, which immediately tells me whether it is a network or an application problem. Then I use `mtr` for packet loss, retransmit counters and connection stats on the host, and always look at p95/p99 rather than averages.
:::

## How do you approach troubleshooting and debugging automation (shell) scripts?

<!-- source: 01 Q26 -->

:::note In simple words
Debugging a script is like replaying a recipe step by step with a narrator saying out loud what is being done, so you catch the exact step where it went wrong.
:::

- Run with trace: `bash -x script.sh` or put `set -x` around a suspect block - prints every command with variables expanded.
- Use strict mode `set -euo pipefail` so errors are not silently ignored.
- Add a `trap` on `ERR` to print the failing line number.
- Lint with **shellcheck** - catches unquoted variables, wrong tests, etc. (add it to CI).
- Log with timestamps to a file; separate stdout and stderr.
- Reproduce in the same environment: cron and CI have a different `PATH`, user and working directory than your shell.
- Check exit codes (`echo $?`) of each external command.
- Make scripts idempotent (safe to re-run) and test with a `--dry-run` flag first.

**Example:**
```bash
#!/usr/bin/env bash
set -euo pipefail
trap 'echo "ERROR at line $LINENO: $BASH_COMMAND (exit $?)" >&2' ERR
log() { echo "$(date '+%F %T') $*" | tee -a /var/log/deploy.log; }

log "Starting backup"
set -x
tar -czf "/backup/app-$(date +%F).tar.gz" /opt/app
set +x
log "Done"
```
```bash
shellcheck deploy.sh
# SC2086: Double quote to prevent globbing and word splitting.
```

:::say
I run the script with `bash -x`, use `set -euo pipefail` and an ERR trap to print the failing line, and lint it with shellcheck in CI. I also reproduce in the same context it runs in, like cron or the CI agent, because PATH and user differences cause most "works on my machine" script failures.
:::

## Can you share an example of a complex automation script you have written?

<!-- source: 01 Q27 -->

:::note In simple words
Interviewers want a short story: what boring or risky manual task existed, what your script did automatically, and what it saved.
:::

Use the structure **Problem -> What the script does -> Safety features -> Result**. A good Bash example: an automated disk cleanup and alert script for monitoring servers.

- Problem: small monitoring servers repeatedly hit 90%+ disk from journal logs and old exports.
- Script: checks usage with `df`, if above threshold vacuums journald, deletes rotated logs older than N days, removes old temp exports, re-checks usage and posts a message to a Teams/Slack webhook with before/after numbers.
- Safety: dry-run mode, only touches whitelisted paths, `flock` to prevent overlaps, logs every action.
- Result: no more manual 2 AM cleanups; alert only when cleanup is not enough.

**Example:**
```bash
#!/usr/bin/env bash
set -euo pipefail
THRESHOLD=85; WEBHOOK="${WEBHOOK_URL:?}"; DRY="${DRY_RUN:-false}"
usage() { df --output=pcent / | tail -1 | tr -dc '0-9'; }
run() { [ "$DRY" = true ] && echo "DRY: $*" || eval "$@"; }

BEFORE=$(usage)
[ "$BEFORE" -lt "$THRESHOLD" ] && exit 0

run "journalctl --vacuum-size=300M"
run "find /var/log -name '*.gz' -mtime +7 -delete"
run "find /opt/exports -type f -mtime +14 -delete"
AFTER=$(usage)

MSG="$(hostname): disk ${BEFORE}% -> ${AFTER}%"
[ "$AFTER" -ge "$THRESHOLD" ] && MSG="$MSG - STILL HIGH, manual action needed"
curl -s -H 'Content-Type: application/json' -d "{\"text\":\"$MSG\"}" "$WEBHOOK"
```

:::say
One example is a disk-cleanup automation for our monitoring servers: it checks disk usage, vacuums journald and deletes old rotated logs and exports from whitelisted paths, re-measures, and posts before/after numbers to a Teams webhook. It has a dry-run mode and flock protection, and it removed a recurring manual task while only alerting us when cleanup was not enough.
:::

## Write a shell script to find prime numbers (e.g. all primes up to N).

<!-- source: 01 Q28 -->

:::note In simple words
A prime number can only be divided evenly by 1 and itself. The script is like testing each number with a set of keys (divisors) - if any key fits, it is not prime. You only need to try keys up to the square root, because any bigger key would have a smaller partner key you already tried.
:::

Why interviewers ask it: it is not really about maths. It checks whether you can write working Bash with **argument validation**, **loops** (`for`/`while`), **conditionals** (`if`, `[[ ]]`), **arithmetic** (`$(( ))`, `(( ))`, modulo `%`), functions and return codes - the same building blocks used in real automation scripts.

Key points to say while writing it:

- Validate input: exactly one argument, and it must be a positive integer (regex `^[0-9]+$`).
- Numbers below 2 are not prime; 2 is the only even prime.
- Only test odd divisors from 3 up to sqrt(n) -> check `i * i <= n` instead of calling a sqrt tool (Bash has integer maths only).
- Use a function that returns 0 (prime) or 1 (not prime) so it reads cleanly in an `if`.
- Bash is fine for small N; for very large ranges a Sieve of Eratosthenes or another language is faster - mentioning this shows judgement.

**Example:**
```text
#!/usr/bin/env bash
# Usage: ./primes.sh <N>   -> prints all primes from 2 to N
set -euo pipefail

usage() { echo "Usage: $0 <positive integer N>" >&2; exit 1; }

[ $# -eq 1 ] || usage
N="$1"
[[ "$N" =~ ^[0-9]+$ ]] || { echo "Error: '$N' is not a positive integer" >&2; exit 2; }

is_prime() {
  local n=$1 i
  (( n < 2 )) && return 1
  (( n == 2 )) && return 0
  (( n % 2 == 0 )) && return 1
  for (( i = 3; i * i <= n; i += 2 )); do
    (( n % i == 0 )) && return 1
  done
  return 0
}

primes=()
for (( num = 2; num <= N; num++ )); do
  if is_prime "$num"; then primes+=("$num"); fi
done

echo "Primes up to $N: ${primes[*]:-none}"
echo "Count: ${#primes[@]}"
```
```text
$ ./primes.sh 30
Primes up to 30: 2 3 5 7 11 13 17 19 23 29
Count: 10

$ ./primes.sh abc
Error: 'abc' is not a positive integer

$ ./primes.sh
Usage: ./primes.sh <positive integer N>
```

:::say
I validate that exactly one positive integer is passed, then loop from 2 to N and test each number with an is_prime function that rejects numbers below 2 and even numbers, and checks odd divisors only while i times i is less than or equal to n. It demonstrates Bash loops, conditionals, arithmetic with double parentheses and return codes, and for very large N I would mention a sieve or a faster language.
:::

## How do you extend a partition or filesystem without unmounting it?

<!-- source: 01 Q29 -->

*Also asked as:* Add 50GB to /opt using LVM without any downtime.

:::note In simple words
Like adding extra rooms to a house while people are still living in it - first make the plot bigger (disk/volume), then move the wall (partition), then tell the house it now has more floor space (filesystem).
:::

Both ext4 and XFS can be **grown online** (while mounted). Shrinking XFS is impossible, and shrinking ext4 needs an unmount.

Plain partition (common on EC2):

1. Grow the disk: modify the EBS volume size in AWS (no downtime).
2. `lsblk` -> confirm the disk is bigger than the partition.
3. `sudo growpart /dev/nvme0n1 1` -> grow partition 1.
4. Grow the filesystem: `resize2fs` for ext4, `xfs_growfs /mountpoint` for XFS (check with `df -Th`).

LVM:

1. Add space: grow the disk + `pvresize`, or add a new disk with `pvcreate` + `vgextend`.
2. `lvextend -r -L +20G /dev/vg0/data` -> `-r` also resizes the filesystem in the same step.

Take a snapshot first - a resize is safe but not undoable.

**Example:**
```bash
lsblk; df -Th /
sudo growpart /dev/nvme0n1 1
sudo resize2fs /dev/nvme0n1p1        # ext4
sudo xfs_growfs /                    # XFS (Amazon Linux default)

# LVM
sudo pvresize /dev/nvme1n1
sudo lvextend -r -L +20G /dev/vg_data/lv_data
```

Full chain for "add 50GB to /opt with LVM, no downtime":

1. `df -hT /opt` -> find the LV (e.g. `/dev/mapper/vg_app-opt`) and the filesystem type.
2. `vgs` -> is there at least 50G in the `VFree` column of the volume group?
3. If not: attach a new disk, then `pvcreate /dev/nvme2n1` and `vgextend vg_app /dev/nvme2n1` (or grow the existing disk and run `pvresize`).
4. `lvextend -r -L +50G /dev/vg_app/opt` -> `-r` grows the filesystem too. Or do it in two steps: `lvextend -L +50G ...`, then `xfs_growfs /opt` (XFS, uses the mount point) or `resize2fs /dev/vg_app/opt` (ext4).
5. `df -h /opt` to verify. Everything stays mounted and no application restart is needed.

:::say
For a normal partition I grow the EBS volume, run `growpart`, then `resize2fs` for ext4 or `xfs_growfs` for XFS, all while mounted. With LVM I extend the physical volume or volume group and run `lvextend -r`, which grows the logical volume and filesystem together; I always snapshot first.
:::

## What are the steps to add a new disk to a Linux server?

<!-- source: 01 Q30 -->

:::note In simple words
A new hard disk is like an empty new cupboard. You divide it into shelves (partition), fit the shelving system (filesystem), place it in a room people can reach (mount point), and write it into the house plan so it is still there after a restart (fstab).
:::

1. Attach the disk (EBS attach, or physically) and find it: `lsblk` (new device e.g. `/dev/nvme1n1` with no mount point).
2. Optional partition: `parted /dev/nvme1n1 mklabel gpt mkpart primary 0% 100%` (or use the whole disk / LVM).
3. Create a filesystem: `mkfs.xfs` or `mkfs.ext4`.
4. Create a mount point and mount: `mkdir /data && mount /dev/nvme1n1p1 /data`.
5. Make it permanent in `/etc/fstab` using the **UUID** (device names like nvme1n1 can change after reboot), with `nofail` so a missing disk does not stop boot.
6. Test the fstab entry with `mount -a` BEFORE rebooting - a bad fstab line can leave the server unbootable.
7. Set ownership/permissions for the app user.

**Example:**
```bash
lsblk
sudo parted -s /dev/nvme1n1 mklabel gpt mkpart primary xfs 0% 100%
sudo mkfs.xfs /dev/nvme1n1p1
sudo mkdir -p /data
sudo blkid /dev/nvme1n1p1        # UUID="3f2c..."
echo 'UUID=3f2c-...  /data  xfs  defaults,nofail  0 2' | sudo tee -a /etc/fstab
sudo mount -a && df -h /data
```

:::say
I identify the new disk with `lsblk`, partition it with parted, create an XFS or ext4 filesystem, mount it on a directory, and add it to /etc/fstab by UUID with `nofail`. I always validate with `mount -a` before any reboot, because a broken fstab entry can stop the server booting.
:::

## How do you create and mount a swap file?

<!-- source: 01 Q31 -->

:::note In simple words
Swap is an overflow parking lot on disk. When RAM (the main car park) is full, less-used data is parked there - slower to fetch, but better than the OOM killer throwing things out.
:::

1. Create the file: `fallocate -l 2G /swapfile` (or `dd` if fallocate is not supported, e.g. on some XFS setups).
2. Lock it down: `chmod 600 /swapfile` (swap can contain secrets from memory).
3. Format as swap: `mkswap /swapfile`.
4. Enable: `swapon /swapfile`; verify with `swapon --show` / `free -h`.
5. Persist: add `/swapfile none swap sw 0 0` to `/etc/fstab`.
6. Tune `vm.swappiness` (e.g. 10) so the kernel prefers RAM and only swaps under pressure.

Swap is a safety buffer, not a fix for too little RAM - heavy swapping makes everything slow. Kubernetes nodes traditionally run with swap off (kubelet requires it unless swap support is explicitly configured).

**Example:**
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
free -h
```

:::say
I create a file with fallocate, set it to 600, run mkswap and swapon, add it to /etc/fstab, and lower swappiness so it is only used under pressure. It is a buffer against OOM kills on small servers, not a replacement for right-sizing, and I keep swap off on Kubernetes nodes.
:::

## How do you find which processes are writing to a file in real time?

<!-- source: 01 Q32 -->

:::note In simple words
A shared notebook keeps filling up and you want to know who is writing in it. You can look at who is holding it right now (lsof/fuser), watch it live (inotifywait), or install a CCTV camera that records every writer (auditd).
:::

- `lsof /var/log/app.log` -> processes that currently have the file open (the `FD` column ends in `w` or `u` for write).
- `fuser -v /var/log/app.log` -> PIDs using the file (also works on mount points: `fuser -vm /data`).
- `inotifywait -m /var/log/app.log` (package `inotify-tools`) -> live stream of modify/open/close events. It shows WHAT happens, not WHO.
- `auditctl -w /etc/nginx/nginx.conf -p wa -k nginx_conf` -> audit rule recording writes and attribute changes WITH the PID, user and command; read with `ausearch -k nginx_conf`. Best for "who keeps changing this config?"
- For a known process, `strace -f -e trace=write -p <PID>` shows its writes live.

**Example:**
```bash
sudo lsof /var/log/app.log
# COMMAND  PID  USER  FD  TYPE ... NAME
# java    2143  app   12w  REG ... /var/log/app.log
sudo fuser -v /var/log/app.log
inotifywait -m -e modify,close_write /etc/nginx/nginx.conf
sudo auditctl -w /etc/nginx/nginx.conf -p wa -k nginx_conf
sudo ausearch -k nginx_conf -i | tail
```

:::say
For who has it open right now I use `lsof` or `fuser`; to watch changes live I use `inotifywait`; and to record exactly which user and process modify it over time I add an auditd watch rule and query it with `ausearch`. For one known process, `strace -e trace=write` shows its writes in real time.
:::

## What is the fastest way to copy a huge file (or many files) across servers?

<!-- source: 01 Q33 -->

:::note In simple words
Moving house - you can carry boxes one by one (scp), use a van that only moves boxes that changed and resumes if it stops (rsync), pack everything tightly first (compression), or hire several vans at once (parallel).
:::

(also asked as: How do you transfer a large file securely between servers?)

| Method | When to use |
|---|---|
| `rsync -avP` | default choice: resumable (`--partial`), progress, only sends changes |
| `scp` / `sftp` | simple one-off copy, not resumable |
| tar piped over ssh | millions of small files - one stream instead of per-file overhead |
| compression (`rsync -z`, `zstd`) | slow network + compressible data; skip it for already-compressed files or fast LANs (CPU becomes the bottleneck) |
| parallel streams (`parallel` + rsync, `bbcp`) | high-latency, high-bandwidth links where one TCP stream cannot fill the pipe |
| On AWS: via **S3** | `aws s3 cp` uses multipart parallel uploads, then download on the other side; also works across regions/accounts |

Tips: use a light SSH cipher only if allowed, run inside `tmux`, verify with `sha256sum` on both sides.

Making it secure: always go over SSH (`scp`, `rsync -e ssh`, `sftp`) with key-based auth - never plain FTP/rsync daemon on untrusted networks. Use a dedicated low-privilege transfer user, and a jump host (`-J bastion`) instead of opening port 22 widely. On S3, use a private bucket with SSE-KMS encryption, a VPC endpoint and short-lived pre-signed URLs or IAM roles. Sensitive files can be encrypted before sending (`gpg -c` or `age`). Finally, prove integrity: compare `sha256sum` on both ends.

**Example:**
```bash
rsync -avP --partial /data/dump.sql.gz user@10.0.2.20:/backup/
tar -cf - /data/images | zstd -T0 | ssh user@10.0.2.20 "zstd -d | tar -xf - -C /restore"
aws s3 cp /data/dump.sql.gz s3://my-transfer-bucket/     # multipart, parallel
sha256sum /data/dump.sql.gz      # compare with the destination
```

:::say
My default is `rsync -avP` because it is resumable and only sends differences; for millions of small files I stream `tar` over ssh, and I only compress when the network is slower than the CPU. On AWS I often copy through S3 because multipart uploads are parallel, and I always verify with checksums.
:::

## How do you analyse disk I/O performance on Linux?

<!-- source: 01 Q34 -->

:::note In simple words
The disk is a single checkout counter. You check how busy the cashier is (%util), how long each customer waits (await), how long the queue is, and who is buying the most (iotop).
:::

- `iostat -xz 1` -> per device: `r/s`, `w/s`, `rkB/s`, `wkB/s`, **`await`** (ms per request, including queue), `aqu-sz` (queue length), **`%util`**. High await + high queue = the disk is the bottleneck. (%util near 100% is less meaningful on SSD/NVMe, which serve requests in parallel.)
- `vmstat 1` -> `wa` column (CPU waiting on IO) and `b` (processes blocked on IO).
- `iotop -o` / `pidstat -d 1` -> which process is doing the IO.
- `top` -> processes in `D` state are stuck waiting on IO.
- Benchmark capability with `fio` (on a test file, never over live data).
- On AWS also check EBS limits: volume IOPS/throughput (gp3 baseline 3000 IOPS / 125 MB/s), burst balance on gp2, and the instance's EBS bandwidth limit in CloudWatch.

**Example:**
```bash
iostat -xz 1 3
# Device  r/s   w/s   wkB/s   await  aqu-sz  %util
# nvme1n1 12.0  950.0 60800.0  38.2   36.1   99.8   <- saturated
sudo iotop -o
pidstat -d 1 5
fio --name=randwrite --filename=/data/fio.test --rw=randwrite --bs=4k --size=1G \
    --iodepth=32 --ioengine=libaio --direct=1 --runtime=30 --time_based
```

:::say
I use `iostat -x` to read await, queue size and utilisation per device, `vmstat` for IO wait and blocked processes, and `iotop` or `pidstat -d` to find the process causing it. On AWS I compare against the EBS volume's IOPS and throughput limits in CloudWatch and use `fio` on a test file to benchmark.
:::
