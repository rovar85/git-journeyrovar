---
track: qbank
title: "Linux, shell and networking: Advanced questions (part 2 of 2)"
short: Linux advanced 2
sub: 9 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you roll back a bad patch or package update?

<!-- source: 01 Q35 -->

:::note In simple words
Before repainting a wall you take a photo and keep the old paint tin. If the new colour is wrong you repaint with the old tin (downgrade) or, if it is a disaster, restore the whole room from the photo (snapshot).
:::

Options, from lightest to strongest:

1. **RHEL/Amazon Linux:** `dnf history` (or `yum history`) lists every transaction -> `dnf history undo <ID>` reverts that transaction, or `dnf downgrade pkg`.
2. **Ubuntu/Debian:** no built-in undo. Find the old version in `/var/log/apt/history.log`, then `apt install pkg=<old-version>` (if still in the repo or apt cache), and `apt-mark hold pkg` so it is not re-upgraded.
3. **Kernel:** boot the previous kernel from GRUB (kept installed by default) and set it as default.
4. **Whole server:** restore the **EBS snapshot / AMI** taken before patching - the most reliable rollback.
5. **Immutable infra:** redeploy the previous AMI/image version.

That is why the rule is: snapshot or AMI before patching production, and patch staging first.

**Example:**
```bash
sudo dnf history
# ID | Command line  | Date and time    | Action(s) | Altered
#  42 | upgrade -y    | 2026-09-20 02:00 | Upgrade   |   37
sudo dnf history undo 42

grep -A3 "Upgrade:" /var/log/apt/history.log | grep nginx
sudo apt install nginx=1.18.0-6ubuntu14.4
sudo apt-mark hold nginx
```

:::say
On RHEL-based systems I use `dnf history undo` for the transaction, on Ubuntu I reinstall the exact previous version with `apt install pkg=version` and hold it, and for kernels I boot the older kernel from GRUB. The safest rollback is the EBS snapshot or AMI I take before every production patch.
:::

## How do you apply a kernel patch, reboot safely, and keep the old kernel available?

<!-- source: 01 Q36 -->

:::note In simple words
Changing the engine of a car. You keep the old engine in the garage, so if the new one will not start, you drop the old one back in and drive away.
:::

1. Snapshot/AMI first; drain the node or take it out of the load balancer.
2. Install the new kernel: `apt install linux-image-<ver>` / `apt full-upgrade`, or `dnf update kernel`. Package managers install kernels **side by side** - the old one stays.
3. Check the new kernel is registered in GRUB: `grubby --default-kernel` (RHEL) or `/boot/grub/grub.cfg` (Ubuntu); keep at least 2 kernels (`installonly_limit=3` in dnf.conf; do not `autoremove` the previous one right away).
4. Reboot in the maintenance window; verify with `uname -r` and service health checks.
5. If it fails: pick the old kernel from the GRUB menu (EC2 serial console helps here), then set it as the default (`grubby --set-default` or `GRUB_DEFAULT` + `update-grub`).
6. Check whether a reboot is needed at all: `/var/run/reboot-required` (Ubuntu), `needs-restarting -r` (RHEL).

**Example:**
```bash
uname -r
sudo dnf update kernel -y
sudo grubby --info=ALL | grep -E "^kernel"
sudo needs-restarting -r
sudo reboot
uname -r                                        # verify new kernel
sudo grubby --set-default /boot/vmlinuz-6.1.100-1.amzn2023.x86_64   # roll back if needed
```

:::say
I snapshot and drain the node, install the new kernel, which sits alongside the old one, confirm GRUB has both, reboot in a maintenance window and verify with `uname -r` and health checks. If it misbehaves I boot the previous kernel from GRUB and set it as default, and I keep at least two kernels installed.
:::

## What is live kernel patching?

<!-- source: 01 Q37 -->

:::note In simple words
Fixing a tyre while the car is still driving. You fix the dangerous hole now without stopping, and change the whole tyre at the next pit stop.
:::

Live patching applies **security fixes to the running kernel in memory** without a reboot, by redirecting vulnerable functions to patched versions.

- Tools: **kpatch** (Red Hat), **kGraft** (SUSE, merged into upstream livepatch), **Canonical Livepatch** (Ubuntu Pro), **Ksplice** (Oracle).
- Good for: critical CVEs on servers where reboots are expensive (databases, stateful nodes), buying time until the next maintenance window.
- Limits: only for selected security fixes, not full kernel upgrades; the fix is lost on reboot unless the new kernel package is also installed; you still need a real reboot eventually.
- In cloud/Kubernetes environments, rolling node replacement (new AMI) often makes live patching unnecessary.

**Example:**
```bash
# Ubuntu Pro
sudo pro enable livepatch
canonical-livepatch status --verbose
# RHEL
sudo dnf install kpatch-patch-$(uname -r | sed 's/\.x86_64//;s/\./_/g')
kpatch list
```

:::say
Live patching - with kpatch, Canonical Livepatch, kGraft or Ksplice - patches critical kernel vulnerabilities in memory without a reboot. I use it to protect hard-to-reboot servers until a planned maintenance window, but it does not replace installing the new kernel and rebooting eventually.
:::

## How do you patch a fleet of servers in production?

<!-- source: 01 Q38 -->

:::note In simple words
Vaccinating a whole city: you test the vaccine on a small group first, do it neighbourhood by neighbourhood at quiet times, keep a record of who got it, and stop immediately if the first group has problems.
:::

1. **Inventory and compliance**: know which servers need which patches (SSM Patch Manager compliance, Inspector findings, CVE feeds).
2. **Tooling**: **AWS SSM Patch Manager** (patch baselines, patch groups by tag, maintenance windows, compliance reports) or **Ansible** playbooks (`serial:` batches) for non-AWS/hybrid.
3. **Order**: dev -> staging -> a **canary batch** in prod (e.g. 10%) -> the rest in batches, never all at once or both nodes of an HA pair together.
4. **Safety**: pre-patch snapshots/AMIs, drain from load balancer first, health checks after each batch, automatic stop if failures exceed a threshold (`max_fail_percentage` in Ansible, error threshold in SSM).
5. **Maintenance windows** and change approval; communicate with teams.
6. **Immutable alternative**: rebake a patched AMI (Packer / EC2 Image Builder), roll it out through the Auto Scaling Group instance refresh, or replace EKS node groups - no in-place patching at all.
7. Report compliance afterwards.

**Example:**
```yaml
# Ansible: rolling patch, 20% at a time, stop if >10% fail
- hosts: web
  serial: "20%"
  max_fail_percentage: 10
  become: true
  tasks:
    - name: Upgrade all packages
      ansible.builtin.dnf: { name: "*", state: latest }
    - name: Reboot if needed
      ansible.builtin.reboot: { reboot_timeout: 600 }
    - name: Health check
      ansible.builtin.uri: { url: "http://localhost/health", status_code: 200 }
```

:::say
I patch in stages - dev, staging, then a prod canary batch and the rest in rolling batches during maintenance windows - using SSM Patch Manager or Ansible with serial batches, pre-patch snapshots, load balancer draining and a failure threshold that stops the rollout. For immutable workloads I instead rebake a patched AMI and roll it out with an ASG instance refresh or node group replacement.
:::

## In Nginx, how do you make a client stick to a specific server (sticky sessions)?

<!-- source: 01 Q39 -->

:::note In simple words
A regular customer always goes to the same bank teller because that teller has their file on the desk. Stickiness keeps sending them to that teller - but it is better to keep the file in a shared cabinet (Redis) so any teller can help.
:::

Options in open-source nginx:

- **`ip_hash`**: hashes the client IP (first 3 octets for IPv4) -> same server. Simple, but many users behind one corporate NAT or mobile carrier all land on one server, and it breaks when client IPs change.
- **`hash $cookie_sessionid consistent;`** (or any key like `$request_uri`): hash a session cookie or header. `consistent` uses ketama consistent hashing, so adding or removing a server only moves about 1/N of the clients.
- **`sticky cookie`** directive: nginx itself inserts a cookie naming the server - available only in **NGINX Plus** (commercial). HAProxy (`cookie SERVERID insert`) and AWS ALB (target group stickiness) provide it for free.

Why stickiness is a last resort: load becomes uneven, scaling in/out and deployments break sessions, and a failed server logs its users out. The better design is **stateless app servers with the session externalised** in Redis/Memcached/a DB or a signed token (JWT), so any server can serve any request. Use stickiness only for legacy apps or cache locality.

**Example:**
```nginx
upstream app_sticky {
    hash $cookie_JSESSIONID consistent;   # or: ip_hash;
    server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.13:8080 max_fails=3 fail_timeout=30s;
}
# NGINX Plus only:
# upstream app { server 10.0.1.11:8080; server 10.0.1.12:8080;
#                sticky cookie srv_id expires=1h path=/; }
```

:::say
In open-source nginx I use `ip_hash` or, better, `hash $cookie_<session> consistent` so the same session always maps to the same server; the `sticky cookie` directive exists only in NGINX Plus. I prefer to avoid stickiness altogether by storing sessions in Redis or using tokens, because sticky sessions cause uneven load and lost sessions when a server fails.
:::

## In Nginx, with sticky sessions or ip_hash, what happens if a server goes down?

<!-- source: 01 Q40 -->

:::note In simple words
If your usual bank teller goes home sick, the manager sends you to another teller - but that teller does not have your file, so you must start again, unless the files are kept in a shared cabinet.
:::

- Open-source nginx uses **passive health checks**: when requests to a server fail (connection errors, timeouts, and optionally 5xx via `proxy_next_upstream`) `max_fails` times within `fail_timeout`, nginx marks it **unavailable for `fail_timeout`** seconds, then tries it again.
- With `ip_hash`/`hash`, clients mapped to the dead server are **remapped to other servers**. Their in-memory session is on the dead server, so they **lose their session** (logged out, cart empty) - unless sessions are shared (Redis) or replicated.
- The first request that hits the failure can still error or be slow (it has to time out), then `proxy_next_upstream` retries on another server for idempotent requests.
- **`consistent`** hashing limits the damage: only the failed server's clients move; with plain modulo hashing, removing a server reshuffles almost everyone.
- **`down`** is a manual flag for planned maintenance. With `ip_hash` it keeps the hash mapping for the other servers (clients of the down server are spread elsewhere), so use `down` instead of deleting the line.
- **Active health checks** (`health_check` in NGINX Plus, HAProxy, ALB) probe a URL in the background and remove a server BEFORE user requests fail, and put it back when it recovers.

**Example:**
```nginx
upstream app {
    ip_hash;
    server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.13:8080 down;          # planned maintenance
}
location / {
    proxy_pass http://app;
    proxy_next_upstream error timeout http_502 http_503;
    proxy_next_upstream_tries 2;
    proxy_connect_timeout 2s;
}
```

:::say
After `max_fails` failures within `fail_timeout`, nginx marks the server unavailable and remaps its clients to the remaining servers, so those users lose their session unless it is stored centrally in something like Redis. Consistent hashing means only that server's clients move, `down` is for planned maintenance, and active health checks in NGINX Plus, HAProxy or an ALB remove the server before users see errors.
:::

## How does header management work in Nginx?

<!-- source: 01 Q41 -->

:::note In simple words
Headers are the notes written on the outside of an envelope. As a reverse proxy, nginx rewrites the notes going to the backend (who really sent it, which address it was for) and adds security stickers on the replies going back to the browser.
:::

Request headers to the backend (`proxy_set_header`):

- `Host $host` -> otherwise nginx sends the upstream name, which breaks virtual hosts.
- `X-Real-IP $remote_addr` and `X-Forwarded-For $proxy_add_x_forwarded_for` -> the real client IP; without them the app only sees nginx's IP.
- `X-Forwarded-Proto $scheme` -> tells the app the original request was HTTPS (for correct redirects and secure cookies).

Response headers to the client (`add_header`):

- Security headers: `Strict-Transport-Security` (HSTS), `X-Content-Type-Options nosniff`, `X-Frame-Options`, `Content-Security-Policy`.
- Add **`always`**, otherwise the header is only sent on 2xx/3xx responses, not on errors.
- **Inheritance gotcha**: `add_header` (and `proxy_set_header`) directives are inherited from the parent block ONLY if the child block defines none of its own. One `add_header` inside a `location` silently drops all the server-level ones -> repeat them or use an `include` snippet.
- `proxy_hide_header X-Powered-By;` -> remove backend headers that leak versions; `server_tokens off;` hides the nginx version.

Other gotchas:

- `underscores_in_headers off` is the default, so headers like `api_key` are silently DROPPED. Use dashes or turn it on.
- Large cookies or JWTs -> `400 Request Header Or Cookie Too Large` -> raise `large_client_header_buffers 4 16k;`. On the response side, big upstream headers need `proxy_buffer_size`.

**Example:**
```nginx
server {
    listen 443 ssl;
    server_name app.example.com;
    server_tokens off;
    large_client_header_buffers 4 16k;
    include /etc/nginx/snippets/security-headers.conf;   # reusable add_header block

    location /api/ {
        proxy_pass http://app_backend;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header X-Powered-By;
        include /etc/nginx/snippets/security-headers.conf;  # re-include: add_header here
        add_header Cache-Control "no-store" always;         # would drop parent headers
    }
}
# /etc/nginx/snippets/security-headers.conf
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
# add_header X-Content-Type-Options "nosniff" always;
# add_header X-Frame-Options "DENY" always;
```

:::say
I use `proxy_set_header` to pass Host, X-Real-IP, X-Forwarded-For and X-Forwarded-Proto so the backend knows the real client and scheme, and `add_header ... always` for security headers like HSTS and nosniff. The classic gotchas are that a child block with its own add_header drops all inherited ones, that headers containing underscores are dropped by default, and that large cookies need `large_client_header_buffers`.
:::

## How do you identify and manage parent-child process relationships in Linux?

<!-- source: 01 Q42 -->

:::note In simple words
Processes form a family tree. Every process has a parent that created it. When a child finishes, the parent must sign off the paperwork (wait), otherwise the child becomes a zombie; if the parent dies first, the child is adopted by the grandparent of all processes (init/systemd).
:::

- Every process has a **PID** and a **PPID** (parent's PID). New processes are made with **fork()** (copy of the parent) followed by **exec()** (replace with a new program) - that is how a shell runs every command.
- See the tree: `ps -ef --forest`, `ps -o pid,ppid,pgid,sid,stat,cmd`, `pstree -p`, or `grep PPid /proc/<PID>/status`.
- **Orphans**: if a parent dies first, the child is re-parented to PID 1 (systemd/init) or to a **subreaper** (for example a systemd user manager or a container init like tini), which later reaps it.
- **Zombies**: a child that exited but whose parent has not called `wait()`; the parent receives `SIGCHLD` and should reap it (see Q58).
- **Process groups and sessions**: a pipeline shares a process group (PGID). `kill -- -<PGID>` signals the whole group - useful to stop a script AND all its children. `pkill -P <PPID>` kills the children of a parent.
- Detaching: `nohup cmd &` ignores hangup when you log out; `setsid cmd` starts a new session with no controlling terminal; for real services use systemd, which tracks all children in a cgroup (`systemctl status` shows the tree, `systemctl stop` kills them all).

**Example:**
```bash
pstree -p $(pgrep -o nginx)
# nginx(1201)-+-nginx(1202)
#             `-nginx(1203)
ps -o pid,ppid,pgid,stat,cmd --forest -g $(ps -o sid= -p $$)
grep -E "PPid|State" /proc/1202/status
kill -TERM -- -$(ps -o pgid= -p 4400 | tr -d ' ')   # stop the whole process group
pkill -TERM -P 4400                                  # stop only the children of 4400
setsid ./long_job.sh > job.log 2>&1 < /dev/null &
```

:::say
I look at PID and PPID with `ps -ef --forest`, `ps -o pid,ppid,pgid,stat` or `pstree -p`, knowing that processes are created by fork and exec, orphans are adopted by PID 1 or a subreaper, and zombies exist until the parent reaps them after SIGCHLD. To manage them I signal a whole process group with `kill -- -PGID`, use `pkill -P` for the children, and prefer systemd, which tracks every child in a cgroup.
:::

## Write a script to convert human-readable file sizes (e.g. 1.5K, 20M, 3G) to bytes.

<!-- source: 01 Q43 -->

:::note In simple words
Like converting "1.5 kg" and "300 g" into grams so you can compare and add them. The script reads the unit letter, multiplies by the right number, and rejects nonsense like "5X".
:::

Know the two standards: **IEC** (binary) K = 1024, M = 1024^2, G = 1024^3 (what `ls -h`, `du -h` and `df -h` use), and **SI** (decimal) k = 1000, M = 1000^2 (what disk vendors and `df -H` use). Say which one you assume.

- Easiest: GNU `numfmt --from=iec 1.5K` -> 1536 (use `--from=si` for 1000-based).
- Pure Bash cannot do decimals (integer maths only), so use `awk` for the arithmetic.
- Handle: optional decimals, upper/lowercase units, optional `B`/`iB` suffix, no unit = bytes, invalid input -> error and non-zero exit.

**Example:**
```text
#!/usr/bin/env bash
# Usage: ./to_bytes.sh 1.5K 20M 3G 512
set -uo pipefail

to_bytes() {
  local input="${1^^}"                       # uppercase: 1.5k -> 1.5K
  input="${input%IB}"; input="${input%B}"    # accept 1.5KiB, 20MB, 512B
  if [[ ! "$input" =~ ^([0-9]+(\.[0-9]+)?)([KMGT]?)$ ]]; then
    echo "invalid size: $1" >&2; return 1
  fi
  local num="${BASH_REMATCH[1]}" unit="${BASH_REMATCH[3]}" power=0
  case "$unit" in K) power=1 ;; M) power=2 ;; G) power=3 ;; T) power=4 ;; esac
  awk -v n="$num" -v p="$power" 'BEGIN { printf "%.0f\n", n * (1024 ^ p) }'
}

[ $# -ge 1 ] || { echo "Usage: $0 <size>..." >&2; exit 1; }
rc=0
for s in "$@"; do
  if b=$(to_bytes "$s"); then printf "%-8s = %s bytes\n" "$s" "$b"; else rc=2; fi
done
exit $rc
```
```text
$ ./to_bytes.sh 1.5K 20M 3g 512 2T 5X
1.5K     = 1536 bytes
20M      = 20971520 bytes
3g       = 3221225472 bytes
512      = 512 bytes
2T       = 2199023255552 bytes
invalid size: 5X

$ numfmt --from=iec 1.5K 20M 3G       # one-liner alternative
1536
20971520
3221225472
$ numfmt --from=si 20M                # decimal units
20000000
```

:::say
The quick answer is `numfmt --from=iec`, or `--from=si` for 1000-based units. In a script I uppercase the input, strip an optional B or iB, validate it with a regex capturing the number and a K, M, G or T unit, and do the multiplication in awk because Bash has no floating point, returning an error for invalid input. I also state whether I assume 1024-based IEC or 1000-based SI units.
:::
