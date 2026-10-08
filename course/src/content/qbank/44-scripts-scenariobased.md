---
track: qbank
title: "Shell scripting: 24 real interview scripts: Scenario-based questions"
short: Scripts scenario
sub: 9 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Production needs an alert when any disk goes above 80%. Write the script.

<!-- source: 10 Q16 -->

:::note In simple words
A fuel gauge warning light for every disk. The script checks each filesystem and shouts on Teams or Slack before the tank is empty.
:::

- `df -P` gives POSIX output with one line per filesystem, so it never wraps and is safe to parse with awk.
- Skip pseudo filesystems (tmpfs, devtmpfs, overlay, squashfs) so you don't get false alarms.
- Strip the `%` sign and compare as an integer.
- Send one message listing every disk that crossed the threshold, and exit non-zero so cron or monitoring can see the failure.

**Example:**
```bash
#!/usr/bin/env bash
# disk_alert.sh - alert when any filesystem crosses a usage threshold
set -euo pipefail

THRESHOLD="${1:-80}"
WEBHOOK_URL="${WEBHOOK_URL:?set WEBHOOK_URL (Teams/Slack incoming webhook)}"
HOST="$(hostname -f)"

[[ "$THRESHOLD" =~ ^[0-9]+$ ]] || { echo "usage: $0 [threshold%]" >&2; exit 2; }

alerts="$(df -P -x tmpfs -x devtmpfs -x overlay -x squashfs \
  | awk -v t="$THRESHOLD" 'NR>1 { gsub("%","",$5); if ($5+0 >= t) \
      printf "%s is %s%% full (mount %s)\\n", $1, $5, $6 }')"

if [[ -n "$alerts" ]]; then
  msg="Disk alert on ${HOST} (threshold ${THRESHOLD}%):\n${alerts}"
  curl -fsS -m 10 -H 'Content-Type: application/json' \
       -d "{\"text\": \"${msg}\"}" "$WEBHOOK_URL" >/dev/null
  echo -e "$msg" | logger -t disk_alert
  exit 1
fi
echo "All filesystems below ${THRESHOLD}%"
```

```bash
# cron: every 10 minutes
*/10 * * * * WEBHOOK_URL=https://example.webhook/abc /opt/scripts/disk_alert.sh 80
```

**Watch out:** Also check inodes (`df -Pi`), because a disk can be "full" with free space left. Without some state, the script re-alerts every run, so keep a small marker file for cooldown. In real production this belongs in Prometheus/Zabbix (node_exporter `node_filesystem_avail_bytes`), and the script is only a fallback.

:::say
I parse `df -P`, skip tmpfs and overlay, strip the percent sign, and compare each filesystem against a threshold. If any cross it, I post one message to a Teams or Slack webhook and exit non-zero. I run it from cron every 10 minutes and I'd also check inode usage. In a mature setup this is a Prometheus or Zabbix alert rule, and the script is only a backup.
:::

## Write a script to monitor a web service and alert on failure.

<!-- source: 10 Q17 -->

:::note In simple words
A robot that knocks on the website's door every minute. If nobody answers a few times in a row, it calls the on-call person.
:::

- Use `curl` with a hard timeout, and capture the HTTP status code and the response time.
- Retry a few times before alerting, so one network blip doesn't page anyone.
- Keep a state file so you alert once when it goes down and once when it recovers, not every minute.
- Related: restarting a service automatically when it is down is covered in the Linux chapter.

**Example:**
```text
#!/usr/bin/env bash
# web_check.sh - check a URL, alert on failure and on recovery
set -uo pipefail

URL="${1:?usage: $0 <url> [expected_code]}"
EXPECTED="${2:-200}"
WEBHOOK_URL="${WEBHOOK_URL:?set WEBHOOK_URL}"
STATE="/var/tmp/web_check_$(echo "$URL" | md5sum | cut -c1-8).state"
RETRIES=3

notify() {
  curl -fsS -m 10 -H 'Content-Type: application/json' \
       -d "{\"text\": \"$1\"}" "$WEBHOOK_URL" >/dev/null || true
}

ok=false
for i in $(seq 1 "$RETRIES"); do
  read -r code ttime < <(curl -s -o /dev/null -m 10 \
      -w '%{http_code} %{time_total}' "$URL" || echo "000 0")
  if [[ "$code" == "$EXPECTED" ]]; then ok=true; break; fi
  sleep 5
done

if $ok; then
  [[ -f "$STATE" ]] && { notify "RECOVERED: $URL is back (HTTP $code, ${ttime}s)"; rm -f "$STATE"; }
  exit 0
fi

if [[ ! -f "$STATE" ]]; then
  notify "DOWN: $URL returned HTTP $code after $RETRIES attempts"
  date > "$STATE"
fi
exit 1
```

**Watch out:** A 200 status can still hide a broken page, so optionally grep the body for a keyword or check a `/health` endpoint that tests dependencies. Run the check from outside the server's own network too, or you'll miss DNS, TLS and load balancer problems. `curl` code `000` means connection or DNS failure, not an HTTP error.

:::say
I use curl with a 10-second timeout to capture the status code and latency, retry three times to avoid false alarms, and keep a state file so the team gets one DOWN message and one RECOVERED message. I also run the same check from outside our network, because that is what users experience. Blackbox exporter or synthetic monitoring is the production-grade version.
:::

## Write a script to rotate logs and keep only the last 5 files.

<!-- source: 10 Q18 -->

:::note In simple words
Like a stack of 5 notebooks. When the current one is full you put it on top of the stack, the oldest one at the bottom gets thrown away, and you start a fresh notebook.
:::

- Shift `app.log.4 -> app.log.5` ... `app.log.1 -> app.log.2`, then `app.log -> app.log.1`, and delete anything beyond 5.
- Use copy-then-truncate if the app keeps the file open. Otherwise it keeps writing to the renamed file.
- Compress old copies to save space.
- In real life, `logrotate` does exactly this, so show both.

**Example:**
```text
#!/usr/bin/env bash
# rotate_log.sh - keep the last N rotations of a log file
set -euo pipefail

LOG="${1:?usage: $0 <logfile> [keep]}"
KEEP="${2:-5}"
[[ -f "$LOG" ]] || { echo "no such file: $LOG" >&2; exit 1; }

rm -f "${LOG}.${KEEP}.gz"                      # drop the oldest
for ((i=KEEP-1; i>=1; i--)); do
  [[ -f "${LOG}.${i}.gz" ]] && mv "${LOG}.${i}.gz" "${LOG}.$((i+1)).gz"
done
cp -p "$LOG" "${LOG}.1" && : > "$LOG"          # copytruncate: app keeps its fd
gzip -f "${LOG}.1"
echo "rotated $LOG, keeping $KEEP files"
```

```text
# The logrotate equivalent: /etc/logrotate.d/myapp
/var/log/myapp/app.log {
    daily
    rotate 5
    compress
    missingok
    notifempty
    copytruncate
}
```

**Watch out:** With `copytruncate`, lines written between the copy and the truncate can be lost, so a signal-based reopen (`postrotate` + `kill -HUP` or `systemctl reload`) is cleaner if the app supports it. Test with `logrotate -d` for a dry run. In containers, don't rotate inside the container; log to stdout and let the runtime rotate.

:::say
I shift the numbered files up by one, delete the one beyond the keep count, copy the live log to `.1`, truncate the original so the app keeps writing, and gzip the copy. In production I'd use a logrotate config with `rotate 5`, `compress` and `copytruncate`, or better, a postrotate reload so no lines are lost.
:::

## Write a script to fetch the top CPU-consuming processes and email them.

<!-- source: 10 Q19 -->

:::note In simple words
A snapshot of the "who is eating the CPU" leaderboard, sent to your inbox, so when someone asks "why was the server slow at 3 AM?" you have evidence.
:::

- `ps -eo pid,ppid,user,%cpu,%mem,etime,cmd --sort=-%cpu | head -n 11` gives the header plus the top 10.
- Add a load average and uptime line for context.
- Send it with `mail` (mailx) or `sendmail`, or post it to Teams/Slack as an alternative.
- Trigger it from cron, or better, only when load goes above a threshold.

**Example:**
```text
#!/usr/bin/env bash
# top_cpu_report.sh - email the top CPU consumers, optionally only above a load threshold
set -euo pipefail

TO="${1:?usage: $0 <email> [load_threshold]}"
LOAD_LIMIT="${2:-0}"
HOST="$(hostname -f)"
load1="$(cut -d' ' -f1 /proc/loadavg)"

# only report when 1-min load is above the limit (0 = always)
if awk -v l="$load1" -v t="$LOAD_LIMIT" 'BEGIN{exit !(l < t)}'; then
  exit 0
fi

report="$(
  echo "Host: $HOST   Time: $(date '+%F %T')   Load: $(cut -d' ' -f1-3 /proc/loadavg)"
  echo "CPUs: $(nproc)"
  echo
  ps -eo pid,ppid,user,%cpu,%mem,etime,cmd --sort=-%cpu | head -n 11 | cut -c1-150
)"

echo "$report" | mail -s "[${HOST}] Top CPU processes (load ${load1})" "$TO"
echo "report sent to $TO"
```

**Watch out:** `%cpu` in `ps` is the average over the process lifetime, not the current usage. For a "right now" view, use `top -b -n 2 -d 1` and take the second iteration. `mail` needs a working MTA or relay (postfix/SES SMTP). Compare the load against `nproc`: a load of 8 is fine on 16 cores and bad on 2.

:::say
I use `ps` sorted by CPU and take the top 10 with pid, user and command, add the load average and core count for context, and email it with mailx. I trigger it only when the load crosses a threshold, and I mention that `ps %cpu` is a lifetime average, so for a live picture I use `top -b` in batch mode.
:::

## Write a script to tail multiple log files in parallel.

<!-- source: 10 Q20 -->

:::note In simple words
Watching several CCTV screens on one monitor, with each line labelled by which camera it came from.
:::

- `tail -F file1 file2` already follows several files and prints `==> file <==` headers. `-F` also survives log rotation.
- For a cleaner view, run one `tail` per file in the background and prefix each line with the file name.
- `trap` kills all the background tails when you press Ctrl+C.
- `multitail` or `lnav` are nicer interactive tools, and `journalctl -f -u a -u b` does the same for systemd services.

**Example:**
```text
#!/usr/bin/env bash
# multitail.sh - follow several logs at once with a per-file prefix
set -euo pipefail
(( $# >= 1 )) || { echo "usage: $0 <log1> [log2 ...]" >&2; exit 2; }

pids=()
trap 'kill "${pids[@]}" 2>/dev/null; exit 0' INT TERM

for f in "$@"; do
  name="$(basename "$f")"
  tail -n 0 -F "$f" 2>/dev/null | sed -u "s/^/[${name}] /" &
  pids+=("$!")
done
wait
```

```bash
./multitail.sh /var/log/nginx/access.log /var/log/nginx/error.log /var/log/app/app.log | grep -i error
```

**Watch out:** Use `sed -u` (unbuffered) or `stdbuf -oL`, otherwise output comes out in delayed chunks. `-F` vs `-f`: `-f` stops following after rotation. A file name containing `/` or `&` would break the sed expression, so I use the basename. For many servers, use a central log system (Loki/ELK) instead of tailing by hand.

:::say
For a quick look, `tail -F` with several files is enough. For a readable stream, I start one `tail -F` per file in the background, prefix each line with the file name using unbuffered sed, and trap Ctrl+C to kill all of them. Across many servers I'd use Loki or journalctl rather than tailing each one.
:::

## Write a script to find zombie processes and clean them up.

<!-- source: 10 Q21 -->

:::note In simple words
A zombie is a finished worker whose manager never signed the exit paperwork. You can't fire someone who has already left; you have to nudge the manager (the parent) to do the paperwork, or replace the manager.
:::

- Zombies have state `Z` in `ps`. They use no CPU or memory, only a PID slot.
- **You cannot kill a zombie**; it is already dead. `kill -9` on it does nothing.
- Fix: send `SIGCHLD` to the parent so it calls `wait()`. If the parent is buggy, restart or kill the parent; the zombies are then re-parented to init/systemd, which reaps them.
- See the Linux chapter's zombie and parent-child process questions for the theory.

**Example:**
```bash
#!/usr/bin/env bash
# zombies.sh - list zombies and their parents; optionally nudge or kill the parents
set -euo pipefail
ACTION="${1:-report}"          # report | sigchld | kill-parent

mapfile -t rows < <(ps -eo pid=,ppid=,stat=,comm= | awk '$3 ~ /^Z/')
if (( ${#rows[@]} == 0 )); then echo "no zombie processes"; exit 0; fi

printf '%-8s %-8s %-6s %s\n' PID PPID STAT CMD
printf '%s\n' "${rows[@]}"

mapfile -t parents < <(printf '%s\n' "${rows[@]}" | awk '{print $2}' | sort -u)
for p in "${parents[@]}"; do
  echo "parent $p: $(ps -o comm= -p "$p") has $(printf '%s\n' "${rows[@]}" \
       | awk -v p="$p" '$2==p' | wc -l) zombie(s)"
  case "$ACTION" in
    sigchld)     kill -s SIGCHLD "$p" && echo "  sent SIGCHLD to $p" ;;
    kill-parent) [[ "$p" -ne 1 ]] && kill -TERM "$p" && echo "  terminated parent $p" ;;
  esac
done
```

**Watch out:** Never kill PID 1. Killing the parent kills the real service, so do it in a maintenance window or restart via systemd. A few short-lived zombies are normal. Thousands of them mean a parent is leaking and can exhaust the PID limit (`kernel.pid_max`), so fix the code or run with an init like `tini` in containers.

:::say
I list processes in state Z with their parent PIDs. Since a zombie is already dead, I first send SIGCHLD to the parent so it reaps its children. If that doesn't work, I restart or kill the parent and let init reap them. The real fix is in the parent's code, or using tini as PID 1 in containers.
:::

## Write a script to monitor network bandwidth in real time.

<!-- source: 10 Q22 -->

:::note In simple words
Reading the electricity meter twice, one second apart. The difference tells you how fast the power is being used right now.
:::

- The kernel keeps byte counters per interface in `/sys/class/net/<if>/statistics/rx_bytes` and `tx_bytes`.
- Read them, sleep 1 second, read them again; the difference is bytes per second. Multiply by 8 for bits.
- No packages are needed, so it works on minimal servers and inside containers.
- Tools like `iftop` (per connection), `nload`, `bmon`, `sar -n DEV 1` and `vnstat` (history) do this with more detail.

**Example:**
```bash
#!/usr/bin/env bash
# bw.sh - live RX/TX rate for an interface, refreshed every second
set -euo pipefail

IFACE="${1:-$(ip route show default | awk '{print $5; exit}')}"
INTERVAL="${2:-1}"
S="/sys/class/net/${IFACE}/statistics"
[[ -d "$S" ]] || { echo "interface not found: $IFACE" >&2; exit 1; }

human() { numfmt --to=iec --suffix=B/s "$1"; }

rx1=$(<"$S/rx_bytes"); tx1=$(<"$S/tx_bytes")
echo "Monitoring $IFACE every ${INTERVAL}s (Ctrl+C to stop)"
while sleep "$INTERVAL"; do
  rx2=$(<"$S/rx_bytes"); tx2=$(<"$S/tx_bytes")
  rx=$(( (rx2 - rx1) / INTERVAL )); tx=$(( (tx2 - tx1) / INTERVAL ))
  printf '%s  RX %-12s TX %-12s (%d / %d Mbit/s)\n' "$(date +%T)" \
    "$(human "$rx")" "$(human "$tx")" $(( rx*8/1000000 )) $(( tx*8/1000000 ))
  rx1=$rx2; tx1=$tx2
done
```

```text
Monitoring eth0 every 1s (Ctrl+C to stop)
10:42:01  RX 1.2MB/s      TX 350KB/s      (10 / 2 Mbit/s)
```

**Watch out:** Know the instance's bandwidth limit (on AWS it depends on instance size; watch `bw_in_allowance_exceeded` via `ethtool -S`). Bytes vs bits: network links are sold in bits. Counters are per interface, so bonded or VLAN interfaces and the docker0 bridge each have their own.

:::say
I read the rx and tx byte counters from sysfs, sleep a second, read them again, and print the difference as bytes and megabits per second. It needs no extra packages. For per-connection detail I use iftop, and for history sar or vnstat. In production, node_exporter exposes the same counters to Prometheus.
:::

## Write a script that alerts if a Docker container is not running.

<!-- source: 10 Q23 -->

:::note In simple words
A headcount at the start of every shift. If a named container is missing or unhealthy, the supervisor gets a message.
:::

- `docker inspect -f '{{.State.Status}}'` returns `running`, `exited`, `restarting` and so on. It errors if the container doesn't exist.
- Also read the health status (`{{.State.Health.Status}}`) when the image has a HEALTHCHECK, because "running" is not the same as "healthy".
- Alert with the exit code, restart count and last log lines to speed up triage.
- Optionally try `docker start` once, but still alert so a human looks at the root cause.

**Example:**
```text
#!/usr/bin/env bash
# container_check.sh - alert when containers are missing, stopped or unhealthy
set -uo pipefail

WEBHOOK_URL="${WEBHOOK_URL:?set WEBHOOK_URL}"
(( $# >= 1 )) || { echo "usage: $0 <container> [container ...]" >&2; exit 2; }
problems=()

for c in "$@"; do
  if ! status=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null); then
    problems+=("$c: NOT FOUND"); continue
  fi
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c")
  if [[ "$status" != "running" || "$health" == "unhealthy" ]]; then
    code=$(docker inspect -f '{{.State.ExitCode}}' "$c")
    restarts=$(docker inspect -f '{{.RestartCount}}' "$c")
    last=$(docker logs --tail 3 "$c" 2>&1 | tr '\n"' ' _' | cut -c1-200)
    problems+=("$c: status=$status health=${health:-n/a} exit=$code restarts=$restarts | $last")
  fi
done

if (( ${#problems[@]} )); then
  msg="Container alert on $(hostname): $(printf '%s; ' "${problems[@]}")"
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"text\": \"$msg\"}" \
       "$WEBHOOK_URL" >/dev/null
  echo "$msg"; exit 1
fi
echo "all containers running"
```

**Watch out:** The user running it needs Docker socket access, and membership of the `docker` group is effectively root, so run it as a dedicated service user. A container in a restart loop shows `restarting` or keeps a rising RestartCount, so alert on that too. For many hosts use cAdvisor + Prometheus (`time() - container_last_seen`) instead of scripts.

:::say
For each expected container I use docker inspect to read the status and health, and if it's missing, stopped or unhealthy I send one webhook message with the exit code, restart count and last log lines. A restart policy handles recovery, and the script makes sure a human knows. At scale I'd rely on cAdvisor metrics and Prometheus alerts.
:::

## Write a script to auto-deploy a static website using rsync.

<!-- source: 10 Q24 -->

:::note In simple words
Instead of repainting the shop while customers are inside, you set up the new display in a back room and then swap the sign on the door in one second.
:::

- Build locally (or in CI), then rsync to a new timestamped release folder on the server.
- Switch a `current` symlink atomically to the new release, so users never see half-uploaded files.
- Keep the last few releases for instant rollback.
- Use `--dry-run` first, and use `--delete` so removed files disappear from the release.

**Example:**
```text
#!/usr/bin/env bash
# deploy_static.sh - atomic static site deploy with rsync + symlink switch
set -euo pipefail

SRC="${1:?usage: $0 <build_dir> <user@host> [base_dir]}"
TARGET="${2:?missing user@host}"
BASE="${3:-/var/www/site}"
KEEP=5
REL="$(date +%Y%m%d%H%M%S)"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=10"

[[ -f "$SRC/index.html" ]] || { echo "build dir looks wrong: $SRC" >&2; exit 1; }

echo "Dry run:"; rsync -azn --delete -e "$SSH" "$SRC"/ "$TARGET:$BASE/releases/$REL/" | tail -5

$SSH "$TARGET" "mkdir -p '$BASE/releases/$REL'"
# --link-dest reuses unchanged files from the current release (fast, saves space)
rsync -az --delete --link-dest="$BASE/current/" -e "$SSH" \
      "$SRC"/ "$TARGET:$BASE/releases/$REL/"

$SSH "$TARGET" "ln -sfn '$BASE/releases/$REL' '$BASE/current.tmp' \
  && mv -T '$BASE/current.tmp' '$BASE/current' \
  && ls -1dt '$BASE'/releases/* | tail -n +$((KEEP+1)) | xargs -r rm -rf"

echo "Deployed release $REL"
# Rollback: ln -sfn $BASE/releases/<previous> $BASE/current.tmp && mv -T ... current
```

**Watch out:** `mv -T` of a symlink is atomic; `ln -sfn` alone on the live link has a tiny window. Point the nginx root at `$BASE/current`. Use a deploy-only SSH key restricted in `authorized_keys`. A trailing slash on the rsync source means "copy the contents", not the folder itself. With a CDN in front, invalidate the cache after the switch.

:::say
I rsync the build output into a new timestamped release directory over SSH, using --link-dest so unchanged files are hard-linked, then switch a current symlink atomically with mv -T, so users never see a half-deployed site. I keep the last five releases, so rollback is just pointing the symlink back, and I run a dry run first.
:::
