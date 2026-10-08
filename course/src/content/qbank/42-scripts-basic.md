---
track: qbank
title: "Shell scripting: 24 real interview scripts: Basic questions"
short: Scripts basic
sub: 7 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Write a script to clean files in /tmp that are older than 7 days.

<!-- source: 10 Q1 -->

:::note In simple words
/tmp is like a desk that everyone dumps papers on. This script throws away papers nobody has touched for a week, so the desk (disk) never overflows.
:::

- `find` walks the directory and selects only regular files whose modification time is older than 7 days (`-mtime +7`).
- A **dry run** mode prints what would be deleted before anything is removed - interviewers love this.
- `-xdev` stops find from crossing into other mounted filesystems; `-mindepth 1` protects the /tmp directory itself.
- Empty directories left behind are removed in a second pass.

**Example:**
```bash
#!/usr/bin/env bash
# clean_tmp.sh - delete files older than N days (default 7) from a directory
# Usage: clean_tmp.sh [-n] [dir] [days]     -n = dry run
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "-n" ]]; then DRY_RUN=1; shift; fi
DIR="${1:-/tmp}"
DAYS="${2:-7}"

[[ -d "$DIR" ]] || { echo "ERROR: $DIR is not a directory" >&2; exit 1; }
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "ERROR: days must be an integer" >&2; exit 1; }
[[ "$DIR" == "/" ]] && { echo "ERROR: refusing to clean /" >&2; exit 1; }

if (( DRY_RUN )); then
  echo "Dry run - files that would be deleted:"
  find "$DIR" -xdev -mindepth 1 -type f -mtime +"$DAYS" -print
else
  count=$(find "$DIR" -xdev -mindepth 1 -type f -mtime +"$DAYS" -print -delete | wc -l)
  # remove empty directories left behind (but never DIR itself)
  find "$DIR" -xdev -mindepth 1 -type d -empty -mtime +"$DAYS" -delete
  logger -t clean_tmp "Deleted $count files older than $DAYS days from $DIR"
  echo "Deleted $count files"
fi
```

```bash
# cron: every day at 03:00
0 3 * * * /usr/local/bin/clean_tmp.sh /tmp 7 >/dev/null 2>&1
```

**Watch out:** Files still held open by a running process will vanish from the directory but not free space until the process closes them. On systemd machines, `systemd-tmpfiles` (`/etc/tmpfiles.d/`) already does this job - mention that as the built-in alternative.

:::say
I use `find` with `-type f -mtime +7 -delete`, add `-xdev` so it never crosses into other mounts, and always support a dry-run flag so I can see what will be removed first. I validate the inputs, refuse dangerous paths like `/`, log the count, and schedule it with cron - or just use systemd-tmpfiles, which is built for this.
:::

## Write a script to validate the IP addresses in a text file.

<!-- source: 10 Q2 -->

:::note In simple words
Like checking that every phone number in a list has the right number of digits. An IPv4 address must be four numbers from 0 to 255 separated by dots - anything else is flagged.
:::

- A regex alone (`[0-9]{1,3}`) is not enough: it accepts `999.1.1.1`. So we check the **shape** with a regex, then check each **octet** is 0-255.
- Read the file line by line with `while IFS= read -r`, skipping blank lines and comments.
- Leading zeros like `010` are rejected, because some tools read them as octal.
- Exit code is non-zero if any invalid line was found, so the script can gate a CI job.

**Example:**
```text
#!/usr/bin/env bash
# validate_ips.sh - report valid/invalid IPv4 addresses, one per line
set -uo pipefail

FILE="${1:?Usage: $0 <file>}"
[[ -r "$FILE" ]] || { echo "ERROR: cannot read $FILE" >&2; exit 2; }

is_valid_ip() {
  local ip="$1" octet
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  for octet in "${BASH_REMATCH[@]:1}"; do
    [[ "$octet" =~ ^(0|[1-9][0-9]*)$ ]] || return 1    # no leading zeros
    (( octet <= 255 )) || return 1
  done
  return 0
}

invalid=0; lineno=0
while IFS= read -r line || [[ -n "$line" ]]; do
  lineno=$((lineno + 1))
  line="${line//[[:space:]]/}"                         # trim spaces / CR
  [[ -z "$line" || "$line" == \#* ]] && continue
  if is_valid_ip "$line"; then
    echo "VALID    $line"
  else
    echo "INVALID  $line (line $lineno)"
    invalid=$((invalid + 1))
  fi
done < "$FILE"

echo "Invalid entries: $invalid"
(( invalid == 0 ))
```

```text
$ ./validate_ips.sh ips.txt
VALID    10.0.1.15
INVALID  256.1.1.1 (line 2)
INVALID  192.168.1 (line 3)
VALID    8.8.8.8
Invalid entries: 2
```

**Watch out:** `|| [[ -n "$line" ]]` handles a last line with no trailing newline. Windows files carry `\r` - the whitespace strip removes it. For IPv6 or CIDR, mention `ipcalc` or a proper library rather than a monster regex.

:::say
I read the file line by line, match the four-octet shape with a Bash regex, then check every octet is between 0 and 255 with no leading zeros, because a regex alone would accept 999. The script prints valid and invalid lines with line numbers and exits non-zero if anything is invalid, so it can fail a pipeline.
:::

## Write a script that reads server IPs from a file and pings each one.

<!-- source: 10 Q3 -->

:::note In simple words
A roll call for servers - read the list of names and shout each one; whoever answers is present (UP), whoever stays silent is marked absent (DOWN).
:::

- `ping -c 2 -W 2` sends 2 packets and waits at most 2 seconds, so a dead host does not hang the script.
- The sequential loop is simple; the **parallel** version uses `xargs -P 20` to ping 20 hosts at once - huge time saver with 500 servers.
- Results go to stdout and a summary; exit code = number of down hosts (capped), useful for monitoring.

**Example:**
```text
#!/usr/bin/env bash
# ping_hosts.sh - ping every host listed in a file (sequential or parallel)
# Usage: ping_hosts.sh hosts.txt [parallelism]
set -uo pipefail

FILE="${1:?Usage: $0 <hosts_file> [parallel]}"
PARALLEL="${2:-1}"
[[ -r "$FILE" ]] || { echo "ERROR: cannot read $FILE" >&2; exit 2; }

check_host() {
  local host="$1"
  if ping -c 2 -W 2 "$host" >/dev/null 2>&1; then
    echo "UP    $host"
  else
    echo "DOWN  $host"
  fi
}
export -f check_host

grep -Ev '^[[:space:]]*(#|$)' "$FILE" \
  | xargs -r -n1 -P "$PARALLEL" bash -c 'check_host "$1"' _ \
  | tee /tmp/ping_results.txt

down=$(grep -c '^DOWN' /tmp/ping_results.txt || true)
echo "Summary: $down host(s) down"
exit $(( down > 125 ? 125 : down ))
```

```text
$ ./ping_hosts.sh servers.txt 20
UP    10.0.1.10
DOWN  10.0.1.11
UP    10.0.2.20
Summary: 1 host(s) down
```

**Watch out:** Many cloud hosts block ICMP in the security group, so "no ping" does not always mean "down" - for real health use a TCP check like `nc -z -w2 host 22`. Also `-W` is Linux ping syntax; macOS uses different flags.

:::say
I read the file skipping comments and blanks, ping each host with a count and a timeout so nothing hangs, and print UP or DOWN. For big lists I run it in parallel with `xargs -P`, and I point out that ICMP can be blocked, so for real health checks I would use a TCP port check with `nc`.
:::

## Write a script to parse a log file and count failed login attempts.

<!-- source: 10 Q4 -->

:::note In simple words
Like a security guard reading the visitor book and counting how many times each stranger tried the wrong key - the top names are probably attackers.
:::

- SSH failures appear in `/var/log/auth.log` (Debian/Ubuntu) or `/var/log/secure` (RHEL) as `Failed password for ... from <IP>`.
- `grep` finds the lines, `awk`/`grep -oE` extracts the IP, then `sort | uniq -c | sort -nr` counts and ranks them.
- Also report the targeted usernames, and flag IPs above a threshold (these are candidates for fail2ban or a WAF/SG block).

**Example:**
```bash
#!/usr/bin/env bash
# failed_logins.sh - count failed SSH logins per IP and per user
set -euo pipefail

LOG="${1:-}"
if [[ -z "$LOG" ]]; then
  [[ -f /var/log/auth.log ]] && LOG=/var/log/auth.log || LOG=/var/log/secure
fi
THRESHOLD="${2:-10}"
[[ -r "$LOG" ]] || { echo "ERROR: cannot read $LOG (need sudo?)" >&2; exit 1; }

total=$(grep -c 'Failed password' "$LOG" || true)
echo "Total failed password attempts: $total"

echo; echo "Top source IPs:"
grep 'Failed password' "$LOG" \
  | grep -oE 'from [0-9]{1,3}(\.[0-9]{1,3}){3}' | awk '{print $2}' \
  | sort | uniq -c | sort -nr | head -10

echo; echo "Top targeted users:"
grep 'Failed password' "$LOG" \
  | sed -E 's/.*Failed password for (invalid user )?([^ ]+) from.*/\2/' \
  | sort | uniq -c | sort -nr | head -10

echo; echo "IPs over threshold ($THRESHOLD):"
grep 'Failed password' "$LOG" \
  | grep -oE 'from [0-9]{1,3}(\.[0-9]{1,3}){3}' | awk '{print $2}' \
  | sort | uniq -c | awk -v t="$THRESHOLD" '$1 > t {print $2, "(" $1 " attempts)"}'
```

```bash
# systemd-only systems keep logs in the journal instead of a file:
journalctl -u ssh --since "24 hours ago" | grep 'Failed password' | wc -l
```

**Watch out:** Rotated logs (`auth.log.1`, `auth.log.2.gz`) hold older attempts - use `zgrep` to include them. The sed handles the "invalid user" variant, which otherwise breaks naive `awk '{print $9}'` column counting.

:::say
I grep for "Failed password" in auth.log or secure, extract the source IP with `grep -o`, and use `sort | uniq -c | sort -nr` to rank attackers, plus a second pass for targeted usernames. Anything over a threshold gets flagged for fail2ban or a firewall block, and I use zgrep or journalctl when logs are rotated or in the journal.
:::

## Write a script to report all users with UID greater than 1000.

<!-- source: 10 Q5 -->

:::note In simple words
Linux keeps a guest list in `/etc/passwd`. System accounts get low numbers; real people usually start at 1000. This script prints the real people.
:::

- `/etc/passwd` is colon-separated: `name:x:UID:GID:comment:home:shell`, so `awk -F:` reads field 3 as the UID.
- The question says "> 1000", but normal users start **at** 1000 on most distros (`UID_MIN` in `/etc/login.defs`), so use `>= 1000` and say why.
- Exclude `nobody` (UID 65534), which is a system account despite the big number.
- `getent passwd` is better than reading the file because it also includes LDAP/SSSD users.

**Example:**
```bash
#!/usr/bin/env bash
# human_users.sh - list regular (human) user accounts
set -euo pipefail

MIN_UID=$(awk '/^UID_MIN/ {print $2}' /etc/login.defs 2>/dev/null || true)
MIN_UID="${MIN_UID:-1000}"

printf "%-15s %-7s %-25s %s\n" "USER" "UID" "HOME" "SHELL"
getent passwd | awk -F: -v min="$MIN_UID" \
  '$3 >= min && $3 != 65534 { printf "%-15s %-7s %-25s %s\n", $1, $3, $6, $7 }' \
  | sort -k2 -n
```

```text
$ ./human_users.sh
USER            UID     HOME                      SHELL
priyanka        1000    /home/priyanka            /bin/bash
deploy          1001    /home/deploy              /bin/bash

# The literal one-liner an interviewer expects:
awk -F: '$3 > 1000 {print $1, $3}' /etc/passwd
```

**Watch out:** Mention the `>` vs `>=` detail - it shows you know UID_MIN. Accounts with `/usr/sbin/nologin` shells are service users even with high UIDs; you can filter on the shell field too.

:::say
The quick answer is `awk -F: '$3 > 1000' /etc/passwd`, but I use `getent passwd` so directory users are included, read UID_MIN from login.defs because human users start at 1000, and exclude nobody at 65534. I print user, UID, home and shell in a table sorted by UID.
:::

## Write a script to compare two directories and show the differences.

<!-- source: 10 Q6 -->

:::note In simple words
Like comparing two photo albums side by side - which photos are only in the left album, which only in the right, and which have the same name but a different picture.
:::

- `diff -rq dir1 dir2` is the one-liner: recursive, quiet (names only).
- `rsync -rcn --delete --itemize-changes src/ dst/` is a dry run that shows exactly what would change if you synced them - `-c` compares checksums, not just size and time.
- For large trees, a checksum manifest (`sha256sum`) is reliable and can be compared across servers.

**Example:**
```text
#!/usr/bin/env bash
# dircompare.sh - compare two directory trees by content
set -euo pipefail

A="${1:?Usage: $0 <dir1> <dir2>}"
B="${2:?Usage: $0 <dir1> <dir2>}"
for d in "$A" "$B"; do [[ -d "$d" ]] || { echo "ERROR: $d not a dir" >&2; exit 2; }; done

manifest() {   # relative path + sha256 for every file, NUL-safe
  (cd "$1" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum)
}

tmpA=$(mktemp); tmpB=$(mktemp)
trap 'rm -f "$tmpA" "$tmpB"' EXIT
manifest "$A" > "$tmpA"
manifest "$B" > "$tmpB"

echo "== Only in $A =="
comm -23 <(awk '{print $2}' "$tmpA") <(awk '{print $2}' "$tmpB")
echo "== Only in $B =="
comm -13 <(awk '{print $2}' "$tmpA") <(awk '{print $2}' "$tmpB")
echo "== Same name, different content =="
join -j 2 <(sort -k2 "$tmpA") <(sort -k2 "$tmpB") | awk '$2 != $3 {print $1}'

if cmp -s "$tmpA" "$tmpB"; then echo "RESULT: identical"; exit 0; fi
echo "RESULT: different"; exit 1
```

```bash
# Quick alternatives
diff -rq /srv/app/releases/v1 /srv/app/releases/v2
rsync -rcn --delete --itemize-changes /data/src/ backup-host:/data/dst/
```

**Watch out:** The manifest uses `awk '{print $2}'`, which breaks on filenames containing spaces - for those, rely on `diff -rq` or `rsync -n`. Always put the trailing slash on rsync source dirs (`src/`) or you compare the wrong level.

:::say
For a quick check I use `diff -rq` or an `rsync -rcn --delete` dry run, which compares by checksum. For a full report I build a sha256 manifest of each tree and use `comm` and `join` to list files only on one side and files whose content differs, and the exit code tells a pipeline whether they match.
:::

## Write a script to validate YAML and JSON files (for example in a CI pipeline).

<!-- source: 10 Q7 -->

:::note In simple words
A spell-checker for config files. One missing bracket or a bad indent in YAML can take down a deployment, so we check every file before it ships.
:::

- JSON: `jq empty file.json` parses the file and prints nothing if it is valid; non-zero exit if broken.
- YAML: `yq eval '.' file.yaml >/dev/null` checks syntax; `yamllint` also checks style (indentation, duplicate keys, trailing spaces).
- Loop over all matching files with `find -print0`, collect failures, exit non-zero if any failed - this makes it a CI gate.

**Example:**
```bash
#!/usr/bin/env bash
# validate_configs.sh - syntax-check all JSON and YAML files under a directory
set -uo pipefail

ROOT="${1:-.}"
fail=0; checked=0

for tool in jq yq; do
  command -v "$tool" >/dev/null || { echo "ERROR: $tool not installed" >&2; exit 2; }
done

while IFS= read -r -d '' f; do
  checked=$((checked + 1))
  case "$f" in
    *.json)       jq empty "$f" 2>/tmp/val_err ;;
    *.yaml|*.yml) yq eval '.' "$f" >/dev/null 2>/tmp/val_err ;;
  esac
  if [[ $? -ne 0 ]]; then
    echo "FAIL  $f: $(head -1 /tmp/val_err)"
    fail=$((fail + 1))
  else
    echo "OK    $f"
  fi
done < <(find "$ROOT" -type f \( -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) \
          -not -path '*/node_modules/*' -not -path '*/.git/*' -print0)

if command -v yamllint >/dev/null; then
  yamllint -d relaxed "$ROOT" || fail=$((fail + 1))
fi

echo "Checked $checked files, $fail failure(s)"
(( fail == 0 ))
```

```yaml
# GitHub Actions step
- name: Validate configs
  run: ./scripts/validate_configs.sh k8s/
```

**Watch out:** Valid YAML is not the same as a valid Kubernetes manifest - add `kubeconform` or `kubectl apply --dry-run=server` for schema checks. Helm templates (`{{ }}`) are not valid YAML until rendered, so run `helm template` first or exclude chart templates.

:::say
I loop over every JSON and YAML file with a NUL-safe find, validate JSON with `jq empty` and YAML with `yq`, optionally run yamllint for style, and exit non-zero if anything fails so the CI job blocks the merge. For Kubernetes I go one step further with kubeconform, because syntactically valid YAML can still be an invalid manifest.
:::
