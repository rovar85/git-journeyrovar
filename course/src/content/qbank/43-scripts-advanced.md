---
track: qbank
title: "Shell scripting: 24 real interview scripts: Advanced questions"
short: Scripts advanced
sub: 8 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Write a script to back up a MySQL database daily with a timestamp.

<!-- source: 10 Q8 -->

:::note In simple words
A daily photograph of the database, labelled with the date, kept for a set number of days - if something breaks, you restore yesterday's photo.
:::

- `mysqldump --single-transaction` takes a consistent snapshot of InnoDB tables **without locking** them - important for production.
- Credentials come from a protected `~/.my.cnf` (mode 600), **never** `-pPassword` on the command line, which shows up in `ps` and shell history.
- Output is piped to `gzip` with a timestamped filename; `set -o pipefail` makes the script fail if mysqldump fails mid-pipe.
- Verify the backup (gzip integrity + dump completion marker), apply retention, and ideally copy it off-server (S3).

**Example:**
```text
#!/usr/bin/env bash
# mysql_backup.sh - daily compressed MySQL backup with retention
set -euo pipefail

DB="${1:?Usage: $0 <database> [retention_days]}"
RETENTION="${2:-7}"
BACKUP_DIR="/var/backups/mysql"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/${DB}_${TS}.sql.gz"
DEFAULTS="/root/.my.cnf"            # [client] user=... password=... (chmod 600)

mkdir -p "$BACKUP_DIR"
umask 077                           # backups readable by owner only

log() { logger -t mysql_backup "$*"; echo "$(date '+%F %T') $*"; }

log "Starting backup of $DB -> $OUT"
mysqldump --defaults-extra-file="$DEFAULTS" \
  --single-transaction --quick --routines --triggers --events \
  "$DB" | gzip > "$OUT"

# verify: archive not corrupt and dump finished
gzip -t "$OUT"
zcat "$OUT" | tail -1 | grep -q 'Dump completed' \
  || { log "ERROR: dump incomplete"; rm -f "$OUT"; exit 1; }

log "Backup OK: $(du -h "$OUT" | cut -f1)"

# optional off-site copy (EC2 IAM role provides credentials)
# aws s3 cp "$OUT" "s3://my-db-backups/$DB/" --sse aws:kms

find "$BACKUP_DIR" -name "${DB}_*.sql.gz" -type f -mtime +"$RETENTION" -delete
log "Removed backups older than $RETENTION days"
```

```bash
# cron: every day at 01:30
30 1 * * * /usr/local/bin/mysql_backup.sh appdb 7 >> /var/log/mysql_backup.log 2>&1

# restore
zcat /var/backups/mysql/appdb_20260924_013000.sql.gz | mysql appdb
```

**Watch out:** A backup you have never restored is not a backup - test restores regularly. `--single-transaction` only gives consistency for InnoDB; MyISAM tables still need locks. On RDS, prefer automated snapshots and PITR, and use a dump only for logical exports.

:::say
I use `mysqldump --single-transaction` so InnoDB is dumped consistently without locking, read credentials from a chmod-600 .my.cnf instead of the command line, and pipe to gzip with a timestamped filename under pipefail. Then I verify the archive, apply retention with find, copy it to S3 with encryption, and schedule it in cron - and I test restores regularly.
:::

## Write a script to SSH into multiple servers and run a command on each.

<!-- source: 10 Q9 -->

:::note In simple words
Instead of logging into 50 servers one by one to type the same command, the script knocks on every door for you and collects the answers in one place.
:::

- `-o BatchMode=yes` makes SSH fail immediately instead of prompting for a password - essential for automation.
- `-o ConnectTimeout=5` stops dead hosts from hanging the run; `StrictHostKeyChecking=accept-new` accepts new hosts but still rejects changed keys.
- Run in parallel with background jobs or `xargs -P`, prefix every output line with the hostname, and collect a per-host exit status.
- Mention that for real fleets **Ansible ad-hoc** (`ansible all -m shell -a "uptime"`) is the better tool.

**Example:**
```text
#!/usr/bin/env bash
# multi_ssh.sh - run a command on many hosts in parallel
# Usage: multi_ssh.sh hosts.txt "uptime" [parallel]
set -uo pipefail

HOSTS="${1:?Usage: $0 <hosts_file> <command> [parallel]}"
CMD="${2:?Usage: $0 <hosts_file> <command> [parallel]}"
PARALLEL="${3:-10}"
SSH_USER="${SSH_USER:-ec2-user}"
LOGDIR=$(mktemp -d)

run_on_host() {
  local host="$1"
  if ssh -n -o BatchMode=yes -o ConnectTimeout=5 \
         -o StrictHostKeyChecking=accept-new \
         "$SSH_USER@$host" "$CMD" > "$LOGDIR/$host.out" 2>&1; then
    echo "OK $host" >> "$LOGDIR/status"
  else
    echo "FAIL $host (exit $?)" >> "$LOGDIR/status"
  fi
  sed "s/^/[$host] /" "$LOGDIR/$host.out"
}
export -f run_on_host
export CMD SSH_USER LOGDIR

grep -Ev '^[[:space:]]*(#|$)' "$HOSTS" | xargs -r -n1 -P "$PARALLEL" bash -c 'run_on_host "$1"' _

echo "---- Summary ----"
sort "$LOGDIR/status"
failed=$(grep -c '^FAIL' "$LOGDIR/status" || true)
rm -rf "$LOGDIR"
exit $(( failed > 0 ? 1 : 0 ))
```

```text
$ SSH_USER=ubuntu ./multi_ssh.sh web_servers.txt "df -h / | tail -1" 20
[10.0.1.10] /dev/nvme0n1p1   30G   21G  9.0G  70% /
[10.0.1.11] /dev/nvme0n1p1   30G   28G  2.0G  94% /
---- Summary ----
OK 10.0.1.10
OK 10.0.1.11

# The better tool for fleets:
ansible webservers -i inventory.ini -m shell -a "df -h /" -f 20
```

**Watch out:** `ssh -n` stops SSH from eating the rest of the host list from stdin - a classic bug in `while read` loops. Never run destructive commands across all hosts without a dry run or a canary host first. On AWS, SSM Run Command does this without opening port 22 at all.

:::say
I read the host list, run SSH with BatchMode and ConnectTimeout so it never prompts or hangs, execute in parallel with `xargs -P`, prefix each output line with the hostname and print a per-host OK/FAIL summary. For a real fleet I would use Ansible ad-hoc commands or AWS SSM Run Command, which handle inventory, parallelism and auditing for me.
:::

## Write a script to archive application logs to S3.

<!-- source: 10 Q10 -->

:::note In simple words
Old logs are like old files in an office drawer - you pack them into a labelled box, send the box to cheap long-term storage (S3), and only then clear the drawer.
:::

- Find log files older than N days, bundle them into a timestamped `tar.gz`.
- Upload with `aws s3 cp --sse aws:kms` under a date/host prefix, e.g. `s3://bucket/app/2026/09/24/host/`.
- **Delete local files only after the upload succeeds** (check the exit code, optionally compare sizes).
- Credentials come from the **EC2 IAM instance role**, not access keys in the script. An S3 lifecycle rule moves old archives to Glacier.

**Example:**
```text
#!/usr/bin/env bash
# archive_logs_s3.sh - compress logs older than N days and ship them to S3
set -euo pipefail

LOG_DIR="${1:-/var/log/myapp}"
BUCKET="${2:?Usage: $0 <log_dir> <s3_bucket> [days]}"
DAYS="${3:-3}"
HOST=$(hostname -s)
TS=$(date +%Y%m%d_%H%M%S)
PREFIX="myapp/$(date +%Y/%m/%d)/$HOST"
ARCHIVE="/tmp/${HOST}_logs_${TS}.tar.gz"
LIST=$(mktemp)
trap 'rm -f "$LIST" "$ARCHIVE"' EXIT

find "$LOG_DIR" -type f -name '*.log*' -mtime +"$DAYS" -print0 > "$LIST"
if [[ ! -s "$LIST" ]]; then echo "Nothing to archive"; exit 0; fi

tar -czf "$ARCHIVE" --null -T "$LIST"
echo "Created $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

if aws s3 cp "$ARCHIVE" "s3://$BUCKET/$PREFIX/" --sse aws:kms --only-show-errors; then
  # confirm the object exists before deleting anything locally
  aws s3api head-object --bucket "$BUCKET" --key "$PREFIX/$(basename "$ARCHIVE")" >/dev/null
  xargs -0 -r rm -f < "$LIST"
  logger -t archive_logs "Archived and removed $(tr -cd '\0' < "$LIST" | wc -c) files"
else
  echo "ERROR: upload failed - local logs kept" >&2
  exit 1
fi
```

```bash
# cron: daily at 02:00
0 2 * * * /usr/local/bin/archive_logs_s3.sh /var/log/myapp my-log-archive 3
```

```json
{ "Effect": "Allow", "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::my-log-archive/myapp/*" }
```

**Watch out:** Do not archive the file the app is currently writing to - coordinate with logrotate (rotate first, archive rotated files). The IAM role needs only `s3:PutObject` on that prefix, plus `kms:GenerateDataKey` for SSE-KMS. For continuous shipping, a log agent (Fluent Bit / CloudWatch agent) is better than a cron script.

:::say
I find logs older than N days with a NUL-safe find, tar and gzip them with a host and timestamp name, upload with `aws s3 cp --sse aws:kms` under a date/host prefix using the instance role, and delete the local files only after I confirm the object exists in S3. A lifecycle rule then tiers the archives to Glacier to keep cost low.
:::

## Write a script to monitor SSL certificate expiry and alert before it expires.

<!-- source: 10 Q11 -->

:::note In simple words
Like a reminder for your passport's expiry date - the script checks each website's certificate and warns you 30 days before it runs out, so customers never see a "Not Secure" page.
:::

- `openssl s_client -connect host:443 -servername host` fetches the live certificate (`-servername` sends SNI, required for most modern hosts).
- `openssl x509 -noout -enddate` prints `notAfter=...`; convert it to epoch seconds with `date -d` and compute days left.
- Loop over a list of domains; warn under 30 days, critical under 7, and post to a Teams/Slack webhook.

**Example:**
```text
#!/usr/bin/env bash
# ssl_expiry.sh - check certificate expiry for a list of domains
# Usage: ssl_expiry.sh domains.txt   (lines: domain[:port])
set -uo pipefail

FILE="${1:?Usage: $0 <domains_file>}"
WARN_DAYS="${WARN_DAYS:-30}"
CRIT_DAYS="${CRIT_DAYS:-7}"
WEBHOOK="${WEBHOOK_URL:-}"          # Teams/Slack incoming webhook (optional)
status=0

alert() {
  echo "$1"
  [[ -n "$WEBHOOK" ]] && curl -s -m 10 -H 'Content-Type: application/json' \
    -d "{\"text\": \"$1\"}" "$WEBHOOK" >/dev/null
}

while IFS= read -r entry; do
  [[ -z "$entry" || "$entry" == \#* ]] && continue
  host="${entry%%:*}"; port="${entry##*:}"; [[ "$port" == "$host" ]] && port=443

  end=$(echo | timeout 10 openssl s_client -connect "$host:$port" -servername "$host" \
        2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ -z "$end" ]]; then
    alert "UNKNOWN: could not read certificate for $host:$port"; status=2; continue
  fi

  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  if (( days < CRIT_DAYS )); then
    alert "CRITICAL: $host cert expires in $days days ($end)"; status=2
  elif (( days < WARN_DAYS )); then
    alert "WARNING: $host cert expires in $days days ($end)"; (( status < 1 )) && status=1
  else
    echo "OK: $host - $days days left"
  fi
done < "$FILE"
exit "$status"
```

```text
$ ./ssl_expiry.sh domains.txt
OK: api.example.com - 74 days left
WARNING: portal.example.com cert expires in 18 days (Oct 12 23:59:59 2026 GMT)

# daily at 09:00
0 9 * * * WEBHOOK_URL=https://... /usr/local/bin/ssl_expiry.sh /etc/ssl_domains.txt
```

**Watch out:** Without `-servername` you may get the default certificate of the load balancer, not the site's. `date -d` is GNU; on macOS use `date -j -f`. ACM certificates auto-renew, but imported certificates do not - this script catches exactly those. Blackbox exporter (`probe_ssl_earliest_cert_expiry`) is the Prometheus way.

:::say
I pull the live certificate with `openssl s_client` using SNI, read notAfter with `openssl x509 -enddate`, convert it to epoch to get days left, and alert to Teams under 30 days and critically under 7, with Nagios-style exit codes. In a Prometheus setup I would use the blackbox exporter's cert expiry metric instead of a cron script.
:::

## Write a script to create Linux users from a CSV file.

<!-- source: 10 Q12 -->

:::note In simple words
HR hands you a spreadsheet of new joiners. Instead of creating 40 accounts by hand, the script reads each row and creates the user, their group and a temporary password - and skips anyone who already exists.
:::

- CSV format: `username,full_name,group,shell`. Skip the header, validate each field.
- **Idempotent**: if the user already exists, skip it (running the script twice must not break anything).
- `useradd -m -c -s -G` creates home, comment, shell and supplementary group; `chpasswd` sets a random temporary password; `chage -d 0` forces a change at first login.
- Must run as root; log every action; write the temporary passwords to a root-only file (better: SSH keys only, no passwords).

**Example:**
```bash
#!/usr/bin/env bash
# create_users.sh - bulk create users from CSV: username,full_name,group,shell
set -euo pipefail

CSV="${1:?Usage: $0 <users.csv>}"
[[ $EUID -eq 0 ]] || { echo "ERROR: run as root" >&2; exit 1; }
[[ -r "$CSV" ]] || { echo "ERROR: cannot read $CSV" >&2; exit 1; }

CREDS="/root/new_user_passwords_$(date +%F).txt"
umask 077
created=0; skipped=0

while IFS=, read -r user name group shell || [[ -n "$user" ]]; do
  user=$(echo "$user" | tr -d '[:space:]')
  [[ -z "$user" || "$user" == "username" || "$user" == \#* ]] && continue
  shell="${shell//$'\r'/}"; shell="${shell:-/bin/bash}"

  if [[ ! "$user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
    echo "SKIP invalid username: $user"; skipped=$((skipped + 1)); continue
  fi
  if id "$user" &>/dev/null; then
    echo "SKIP exists: $user"; skipped=$((skipped + 1)); continue
  fi
  if [[ -n "$group" ]] && ! getent group "$group" >/dev/null; then
    groupadd "$group" && echo "Created group $group"
  fi

  useradd -m -c "$name" -s "$shell" ${group:+-G "$group"} "$user"
  pass=$(openssl rand -base64 12)
  echo "$user:$pass" | chpasswd
  chage -d 0 "$user"                 # force password change at first login
  echo "$user,$pass" >> "$CREDS"
  echo "CREATED $user (group: ${group:-none})"
  created=$((created + 1))
done < "$CSV"

echo "Done: $created created, $skipped skipped. Temp passwords in $CREDS"
```

```text
$ cat users.csv
username,full_name,group,shell
asha,Asha Rao,devops,/bin/bash
ravi,Ravi Kumar,developers,/bin/bash
$ sudo ./create_users.sh users.csv
Created group devops
CREATED asha (group: devops)
SKIP exists: ravi
```

**Watch out:** Never echo passwords to the terminal or logs, and delete the credentials file after handing them over. Commas inside names break a naive CSV split - keep the format simple or quote-aware. At scale, users should come from LDAP/SSO or Ansible's `user` module, not a local script.

:::say
I read the CSV with `IFS=,`, skip the header, validate the username, and make it idempotent by skipping users that already exist. I create missing groups, run `useradd -m` with the shell and group, set a random temporary password with chpasswd and force a change at first login with `chage -d 0`, and log everything. In a real company I would push this into Ansible or SSO rather than local accounts.
:::

## Write a script to automate git pull and restart a service.

<!-- source: 10 Q13 -->

:::note In simple words
A simple self-updating server: it checks whether new code has arrived on the main branch, and only if it has, it pulls it and restarts the app - and puts the old version back if the new one fails its health check.
:::

- `git fetch` then compare local `HEAD` with `origin/main`; restart **only when there is a change**.
- `git reset --hard origin/main` (instead of `git pull`) avoids merge conflicts from local edits on the server.
- `flock` prevents two cron runs from overlapping.
- After the restart, run a health check; on failure, reset to the previous commit and restart again (rollback).

**Example:**
```bash
#!/usr/bin/env bash
# git_deploy.sh - pull latest main and restart service only when code changed
set -euo pipefail

APP_DIR="/opt/myapp"
BRANCH="main"
SERVICE="myapp"
HEALTH_URL="http://localhost:8080/health"

exec 9>/var/lock/git_deploy.lock
flock -n 9 || { echo "Another deploy is running"; exit 0; }

log() { logger -t git_deploy "$*"; echo "$(date '+%F %T') $*"; }
cd "$APP_DIR"

git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")
if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "No changes ($LOCAL)"; exit 0
fi

log "Updating $LOCAL -> $REMOTE"
git reset --hard "origin/$BRANCH"
systemctl restart "$SERVICE"

for i in {1..10}; do
  if curl -fsS -m 3 "$HEALTH_URL" >/dev/null; then
    log "Deploy OK at $REMOTE"; exit 0
  fi
  sleep 3
done

log "Health check failed - rolling back to $LOCAL"
git reset --hard "$LOCAL"
systemctl restart "$SERVICE"
exit 1
```

```bash
# check for new commits every 5 minutes
*/5 * * * * /usr/local/bin/git_deploy.sh >> /var/log/git_deploy.log 2>&1
```

**Watch out:** `reset --hard` destroys any local edits on the server - that is intentional (servers should be read-only copies), but say it out loud. Use a deploy key with read-only access. This is fine for a small internal app; for production the better pattern is a CI/CD pipeline that builds an immutable artifact, or GitOps with Argo CD.

:::say
I fetch from origin, compare HEAD with origin/main and exit early if nothing changed, then `reset --hard` to avoid merge conflicts, restart the service and poll a health endpoint. If the health check fails I reset to the previous commit and restart again, and I wrap the whole thing in flock so cron runs never overlap. For real production I would move this to a pipeline or GitOps.
:::

## Write a script to generate a dynamic inventory file for Ansible.

<!-- source: 10 Q14 -->

:::note In simple words
In the cloud, servers appear and disappear all day, so a hand-written list of servers goes stale. This script asks AWS "which servers are running right now with this tag?" and builds Ansible's list fresh every time.
:::

- `aws ec2 describe-instances` filtered by tag and state `running`, with a `--query` to pull private IP and Role tag.
- Ansible dynamic inventory scripts must print JSON when called with `--list` (and handle `--host`).
- Group hosts by their `Role` tag, e.g. `web`, `db`.
- Mention the **proper way**: the `amazon.aws.aws_ec2` inventory plugin does this natively with caching and keyed groups.

**Example:**
```text
#!/usr/bin/env bash
# ec2_inventory.sh - Ansible dynamic inventory from EC2 tags
# Usage: ansible-playbook -i ec2_inventory.sh site.yml
set -euo pipefail

ENV_TAG="${INV_ENV:-prod}"
REGION="${AWS_REGION:-ap-south-1}"

case "${1:-}" in
  --host) echo '{}'; exit 0 ;;           # hostvars are provided in _meta
  --list) ;;
  *) echo "Usage: $0 --list | --host <name>" >&2; exit 1 ;;
esac

aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Environment,Values=$ENV_TAG" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].{ip:PrivateIpAddress, role:Tags[?Key==`Role`]|[0].Value}' \
  --output json \
| jq '
    map(select(.ip != null) | .role = (.role // "ungrouped"))
    | reduce .[] as $i ({"_meta": {"hostvars": {}}};
        .[$i.role].hosts += [$i.ip]
        | ._meta.hostvars[$i.ip] = {"ansible_user": "ec2-user", "role": $i.role})
  '
```

```text
$ ./ec2_inventory.sh --list
{
  "_meta": { "hostvars": { "10.0.1.10": { "ansible_user": "ec2-user", "role": "web" } } },
  "web": { "hosts": ["10.0.1.10", "10.0.1.11"] },
  "db":  { "hosts": ["10.0.2.20"] }
}
```

```yaml
# The proper way - aws_ec2.yml inventory plugin
plugin: amazon.aws.aws_ec2
regions: [ap-south-1]
filters:
  tag:Environment: prod
  instance-state-name: running
keyed_groups:
  - key: tags.Role
    prefix: role
compose:
  ansible_host: private_ip_address
```

**Watch out:** The script must be executable and output only JSON (no echo debugging on stdout). Use the instance role or an SSO profile for AWS credentials. Private IPs need network reachability from the Ansible control node (VPN/bastion/SSM).

:::say
My script calls `aws ec2 describe-instances` filtered on the Environment tag and running state, then uses jq to group private IPs by their Role tag into the JSON format Ansible expects for `--list`, with hostvars in `_meta`. In practice I prefer the `amazon.aws.aws_ec2` inventory plugin, which does the same with keyed groups and caching and no custom code.
:::

## Write a script that checks Jenkins job status through the API and alerts if the build failed.

<!-- source: 10 Q15 -->

:::note In simple words
Instead of refreshing the Jenkins page, the script asks Jenkins directly "how did the last build go?" and sends a message to the team channel if the answer is FAILURE or UNSTABLE.
:::

- Every Jenkins page has a JSON API: `$JENKINS_URL/job/<name>/lastBuild/api/json`.
- Authenticate with **username + API token** (not the password). A CSRF crumb is **not** needed for GET requests, only for POSTs.
- `jq -r .result` gives `SUCCESS`, `FAILURE`, `UNSTABLE`, `ABORTED`, or `null` while still building.
- Loop over several jobs; alert to a Teams/Slack webhook with the build URL; exit non-zero on failure.

**Example:**
```text
#!/usr/bin/env bash
# jenkins_status.sh - alert when the last build of any listed job failed
# Usage: JENKINS_USER=.. JENKINS_TOKEN=.. jenkins_status.sh job1 folder/job/job2
set -uo pipefail

JENKINS_URL="${JENKINS_URL:-https://jenkins.example.com}"
: "${JENKINS_USER:?set JENKINS_USER}" "${JENKINS_TOKEN:?set JENKINS_TOKEN}"
WEBHOOK="${WEBHOOK_URL:-}"
[[ $# -gt 0 ]] || { echo "Usage: $0 <job> [job...]" >&2; exit 2; }
failed=0

notify() {
  echo "$1"
  [[ -n "$WEBHOOK" ]] && curl -s -m 10 -H 'Content-Type: application/json' \
    -d "$(jq -n --arg t "$1" '{text: $t}')" "$WEBHOOK" >/dev/null
}

for job in "$@"; do
  json=$(curl -fsS -m 15 -u "$JENKINS_USER:$JENKINS_TOKEN" \
         "$JENKINS_URL/job/$job/lastBuild/api/json?tree=result,number,url,building") \
    || { notify "ERROR: cannot query Jenkins job $job"; failed=1; continue; }

  result=$(jq -r '.result' <<< "$json")
  number=$(jq -r '.number' <<< "$json")
  url=$(jq -r '.url' <<< "$json")

  case "$result" in
    SUCCESS) echo "OK      $job #$number" ;;
    null)    echo "RUNNING $job #$number" ;;
    FAILURE|UNSTABLE)
      notify "Jenkins $job #$number is $result - $url"; failed=1 ;;
    *)       echo "INFO    $job #$number result=$result" ;;
  esac
done
exit "$failed"
```

```text
$ ./jenkins_status.sh api-service ui-service
OK      api-service #412
Jenkins ui-service #97 is FAILURE - https://jenkins.example.com/job/ui-service/97/
```

**Watch out:** Jobs inside folders use the path `job/folder/job/name`. Keep the API token in a secret store or credentials file, not in the crontab. Using `?tree=` limits the JSON size, which matters on big Jenkins instances. Native alternatives: the `post { failure { ... } }` block in the Jenkinsfile, or the Office 365/Slack notification plugins.

:::say
I call the Jenkins JSON API at `job/<name>/lastBuild/api/json` with a user and API token, use jq to read the result, number and URL, and send a Teams or Slack message when the result is FAILURE or UNSTABLE. GET calls do not need a CSRF crumb, I use the tree parameter to keep responses small, and I note that a `post { failure }` block in the Jenkinsfile is the native way to do the same.
:::
