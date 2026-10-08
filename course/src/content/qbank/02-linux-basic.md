---
track: qbank
title: "Linux, shell and networking: Basic questions"
short: Linux basic
sub: 13 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you search for files containing a specific string, and print only the file names?

<!-- source: 01 Q2 -->

:::note In simple words
It is like asking a librarian "which books mention the word X?" and wanting just the list of book titles, not every page where it appears.
:::

(also asked as: find all files containing a specific sentence and print only the file names)

`grep` is the tool. Key flags:

- `-r` / `-R` -> search recursively through folders.
- `-l` -> print only the **file names** that match (not the matching lines).
- `-i` -> ignore case; `-n` -> show line numbers; `-w` -> whole word only.
- `-F` -> treat the pattern as a fixed string (safe for sentences with dots or brackets).
- `--include="*.log"` -> limit to certain file types.
- For a full sentence, wrap it in quotes so the shell passes it as one argument.

You can also combine `find` + `grep` when you need filters like age or size.

**Example:**
```bash
# File names only, recursive, exact sentence
grep -rlF "Connection refused by upstream" /var/log/

# Case-insensitive, only .conf files
grep -rli --include="*.conf" "max_connections" /etc/

# With find: only files modified in last 2 days
find /var/log -type f -mtime -2 -exec grep -lF "OutOfMemory" {} +

# Count of matching files
grep -rlF "ERROR" /app/logs | wc -l
```

:::say
I use `grep -rl "text" /path` - `-r` for recursive and `-l` to print only file names; for a full sentence I add `-F` so it is matched literally. If I need extra filters like file age or type, I combine it with `find ... -exec grep -l`.
:::

## How would you validate command-line arguments in a shell script?

<!-- source: 01 Q3 -->

:::note In simple words
Before a chef starts cooking, they check the ingredients are actually on the counter. A script should also check it was given the right inputs before doing anything risky.
:::

Useful building blocks:

- `$#` -> number of arguments; `$1`, `$2` -> individual arguments; `$@` -> all arguments.
- Check count: `if [ $# -ne 2 ]; then usage; fi`.
- Check empty: `[ -z "$1" ]`; check file exists: `[ -f "$file" ]`; directory: `[ -d "$dir" ]`.
- Check a number with a regex: `[[ "$port" =~ ^[0-9]+$ ]]`.
- Use `getopts` for flags like `-e prod -v`.
- Print a `usage` message and `exit 1` (non-zero = failure) so CI pipelines notice the error.
- Add `set -euo pipefail` at the top so the script stops on errors and unset variables.

**Example:**
```text
#!/usr/bin/env bash
set -euo pipefail

usage() { echo "Usage: $0 <env: dev|stage|prod> <port>"; exit 1; }

[ $# -eq 2 ] || usage
ENV="$1"; PORT="$2"

case "$ENV" in
  dev|stage|prod) ;;
  *) echo "Invalid env: $ENV"; usage ;;
esac

[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -le 65535 ] || { echo "Invalid port"; exit 2; }

echo "Deploying to $ENV on port $PORT"
```

:::say
I check `$#` for the argument count, validate each value with tests like `-z`, `-f` or a regex, and use `getopts` for flags. On bad input I print a usage message and exit with a non-zero code, and I start scripts with `set -euo pipefail` so they fail fast.
:::

## Which commands do you use to check CPU, memory and disk on a Linux server?

<!-- source: 01 Q7 -->

:::note In simple words
These are the dashboard gauges of a car: speed (CPU), fuel (memory), and boot space (disk).
:::

| Need | Command | What to look at |
|---|---|---|
| CPU/processes | `top`, `htop` | %CPU, load average, `wa` (IO wait), `st` (steal) |
| Load | `uptime` | load average vs number of cores (`nproc`) |
| Memory | `free -h` | the **available** column, not "free" |
| Disk space | `df -h` | Use% per filesystem |
| Inodes | `df -i` | many tiny files can fill inodes |
| Folder sizes | `du -sh /var/*` then sort -h | largest directories |
| Disk IO | `iostat -x 1`, `iotop` | %util, await |
| Per-process history | `vmstat 1`, `sar` | trends over time |

Linux uses spare RAM as file cache, so low "free" memory is normal; watch "available" and swap usage.

**Example:**
```bash
nproc; uptime
free -h
df -h
du -xh / --max-depth=1 2>/dev/null | sort -h | tail
ps aux --sort=-%cpu | head -5
ps aux --sort=-%mem | head -5
```

:::say
I start with `top`/`htop` and `uptime` for CPU and load, `free -h` for memory looking at the available column, and `df -h` plus `du -sh` for disk. For deeper issues I use `iostat`, `vmstat` and `ps --sort` to find the heaviest processes.
:::

## What command finds files larger than 100MB?

<!-- source: 01 Q9 -->

:::note In simple words
Like walking through a warehouse with a scale and putting a sticker on every box heavier than 100 kg, so you know exactly what is taking up the space.
:::

(also asked as: How do you find large unused files across partitions? / Which directory is too big?)

- `find / -xdev -type f -size +100M` -> all files over 100MB; `-xdev` stays on one filesystem (skips /proc and mounted volumes).
- Add `-exec ls -lh {} +` or `-printf` to show sizes, and `sort` to rank them.
- `du -ah /var | sort -rh | head -20` -> largest files AND folders under a path.
- `ncdu /` -> interactive, easy browsing of disk usage.
- Combine with age: `-mtime +30` for big files not modified in 30 days (safe cleanup candidates).
- "Unused" = not read recently: `-atime +90` (last access). Many servers mount with `relatime`, so atime is only roughly accurate - treat it as a hint, not proof.
- To scan every partition, run `find` once per mount point from `df -h` output, each with `-xdev`, so network mounts (NFS) are not crawled by accident.
- Redirect errors with `2>/dev/null` to hide "Permission denied" noise.

**Example:**
```bash
sudo find / -xdev -type f -size +100M -printf '%s\t%p\n' 2>/dev/null \
  | sort -rn | head -10 | awk '{printf "%.1f MB\t%s\n", $1/1048576, $2}'
# 2310.4 MB  /var/log/myapp/app.log
# 845.2 MB   /opt/exports/dump-2026-08.sql

sudo du -ah /var 2>/dev/null | sort -rh | head -20
find /opt/exports -type f -size +100M -mtime +30 -ls
```

:::say
I use `find / -xdev -type f -size +100M`, usually with `-printf` and `sort` to rank by size, and `du -ah | sort -rh | head` to see the biggest folders too. Adding `-mtime +30` gives me old, large files that are the safest candidates for cleanup.
:::

## How much Linux do you use in DevOps work, and which distributions have you worked with?

<!-- source: 01 Q11 -->

:::note In simple words
Linux is the ground almost every DevOps building stands on - servers, containers and Kubernetes nodes all run on it, so a DevOps engineer lives in the Linux terminal daily.
:::

Speak from real usage:

- **Distros:** Ubuntu (22.04/24.04 LTS) for servers like monitoring boxes, Amazon Linux 2023 on AWS EC2/EKS nodes, sometimes RHEL/CentOS/Rocky, and Alpine or Debian-slim as container base images.
- **Daily tasks:** SSH/SSM into servers, reading logs (`journalctl`, `tail -f`, `grep`), checking resources (`top`, `df`, `free`), managing services with `systemctl`, package management (`apt`, `dnf/yum`), cron jobs, file permissions, writing Bash automation, networking checks (`curl`, `dig`, `ss`).
- **Examples you can mention:** cleaning a nearly full disk on a monitoring server with `journalctl --vacuum`, tuning a service to fix memory pressure, writing health-check scripts.

Key differences worth knowing: Debian family uses `apt` and `.deb`; RHEL family uses `dnf`/`yum` and `.rpm`.

**Example:**
```bash
cat /etc/os-release
# PRETTY_NAME="Ubuntu 22.04.4 LTS"
uname -r          # kernel version
apt update && apt list --upgradable   # Ubuntu
dnf check-update                      # Amazon Linux 2023 / RHEL
```

:::say
I use Linux every day - mainly Ubuntu LTS and Amazon Linux on AWS, plus Alpine and Debian-slim in containers. My daily work includes log analysis, service management with systemd, resource troubleshooting, package management, cron and Bash automation.
:::

## What is the difference between a load balancer and a reverse proxy?

<!-- source: 01 Q15 -->

:::note In simple words
A reverse proxy is a receptionist at the front desk. Visitors never walk straight into the offices; the receptionist checks IDs, answers common questions and passes messages on, even when there is only one office. A load balancer is a traffic warden who spreads visitors across several identical counters so no one counter gets overloaded.
:::

(also asked as: How would you load balance 3-4 servers, which type is preferred and why?)

- **Reverse proxy**: sits in front of one or more servers and talks to clients on their behalf. Jobs: **TLS termination**, caching, compression, header rewrites, path-based routing (`/api` to one app, `/` to another), authentication, rate limiting and WAF. It is useful even with a **single** backend.
- **Load balancer**: spreads traffic across **multiple** backends, with **health checks** (unhealthy servers are removed) and algorithms such as round robin, least connections and IP/hash-based stickiness. It works at **L4** (TCP/UDP: sees IPs and ports) or **L7** (HTTP: sees URLs, headers, cookies).
- They overlap a lot: nginx, HAProxy and Envoy do both. An **AWS ALB** is an L7 load balancer that also acts as a reverse proxy (TLS, path/host rules). An **AWS NLB** is an L4 load balancer that forwards connections and is not an HTTP proxy.

| Aspect | Reverse proxy | Load balancer |
|---|---|---|
| Main goal | shield and enhance backends | distribute load, high availability |
| Needs many backends? | no, one is fine | yes, that is the point |
| OSI layer | usually L7 (HTTP) | L4 or L7 |
| Typical features | TLS, cache, compression, rewrites, auth, WAF | health checks, algorithms, stickiness, failover |
| Examples | nginx, Apache mod_proxy, Envoy, Traefik | AWS ALB/NLB, HAProxy, nginx upstream, F5 |

**Load balancing 3-4 servers - which type and why?**

- Algorithms: **round robin** (default, each server in turn), **weighted** round robin (`weight=3` for a bigger server), **least connections** (`least_conn`, send to the least busy), **ip_hash** / **hash** (same client or key -> same server, for stickiness or cache locality), and **random two choices** (`random two least_conn`: pick 2 at random, use the less loaded one - good with many LB instances).
- **L4 vs L7**: L4 (TCP, e.g. NLB, HAProxy `mode tcp`) is faster and protocol-agnostic - use it for databases, MQTT, gRPC passthrough or huge throughput. L7 (HTTP, e.g. ALB, nginx) can route by path/host, terminate TLS, retry and see HTTP errors.
- **Health checks** are what make it a load balancer and not just a splitter: remove failed servers automatically (passive `max_fails` in open-source nginx, active checks in HAProxy/ALB).
- Preferred for HTTP APIs: **L7 with least connections**, because request durations vary - round robin can pile slow requests onto one server, while least_conn follows the real load, and L7 gives health checks on real HTTP status plus TLS and routing in one place. Keep the app stateless so no stickiness is needed.

**Example:**
```nginx
upstream app_backend {
    least_conn;                                   # load balancing algorithm
    server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;
}
server {
    listen 443 ssl;                               # reverse proxy: TLS termination
    server_name app.example.com;
    ssl_certificate     /etc/nginx/tls/app.crt;
    ssl_certificate_key /etc/nginx/tls/app.key;
    gzip on;
    location /api/ {
        proxy_pass http://app_backend;            # load balanced across 2 servers
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

:::say
A reverse proxy sits in front of servers and handles TLS termination, caching, compression, routing and security, even with a single backend. A load balancer spreads traffic across many backends with health checks and algorithms at L4 or L7. In practice nginx, HAProxy and an AWS ALB do both, while an NLB is a pure L4 load balancer.
:::

## How do you find files modified in the last 10 minutes?

<!-- source: 01 Q16 -->

:::note In simple words
Like asking "who touched anything in this room in the last 10 minutes?" - useful right after an incident or a deployment to see exactly what changed.
:::

- `find /path -type f -mmin -10` -> modified in the last 10 minutes (`-mmin` = minutes, `-mtime` = days).
- `-mmin +10` means MORE than 10 minutes ago; `-10` means LESS than 10 minutes ago.
- `-cmin -10` -> metadata changed (permissions/owner) in the last 10 minutes.
- `-amin -10` -> accessed recently (depends on `relatime` mount option).
- `-newer reference.file` -> changed after another file, handy with a marker made by `touch` before a deploy.
- Add `-xdev` and `2>/dev/null` when scanning `/`, and exclude `/proc` and `/sys`.

**Example:**
```bash
sudo find /etc /opt/app -type f -mmin -10 -ls
sudo find / -xdev -type f -mmin -10 2>/dev/null | grep -v -E "^/(proc|sys)"
touch /tmp/before_deploy; ./deploy.sh
find /opt/app -newer /tmp/before_deploy -type f
```

:::say
I use `find /path -type f -mmin -10`, where the minus sign means "less than 10 minutes ago", and `-cmin` if I also care about permission or ownership changes. For deployments I touch a marker file first and use `find -newer` to list exactly what changed.
:::

## What is Linux patching, why does it matter, and what types of patches are there?

<!-- source: 01 Q17 -->

:::note In simple words
Patching is like the regular service of a car - fixing known faults (bugs) and fitting new locks (security fixes) before a thief finds the weak one.
:::

(also asked as: What are the ways to apply patches? / Security patch vs kernel patch?)

Patching = updating OS packages to newer, fixed versions. It matters because most breaches exploit **known, already-fixed** vulnerabilities (CVEs); it is also needed for compliance (PCI, ISO 27001, SOC 2) and stability.

| Type | What it fixes | Reboot? |
|---|---|---|
| Security patch | a CVE in a package (openssl, openssh, sudo) | usually no - restart the service |
| Bug-fix / feature update | normal package updates | usually no |
| Kernel patch | the Linux kernel itself | **yes** (or live patch) |

Ways to apply: package manager by hand (`apt`, `dnf/yum`), unattended/automatic updates (`unattended-upgrades`, `dnf-automatic`) for security-only, config management at scale (Ansible), cloud tools (**AWS SSM Patch Manager**), live patching for kernels, or immutable infra - bake a new patched AMI/image and replace servers.

**Example:**
```bash
sudo apt list --upgradable 2>/dev/null | grep -i security    # Ubuntu
sudo dnf updateinfo list security                            # RHEL / Amazon Linux
sudo dnf upgrade --security -y
```

:::say
Patching means updating packages to close known vulnerabilities and bugs, which matters because most attacks use CVEs that already have fixes. Security and normal package patches usually only need a service restart, while kernel patches need a reboot or live patching, and at scale I apply them with Ansible or SSM Patch Manager, or by rebaking images.
:::

## How do you check a package version, check available updates, and update all packages?

<!-- source: 01 Q18 -->

:::note In simple words
Before servicing the car you read the current part numbers, check which new parts are available, then fit them - and write down the old numbers in case you need to go back.
:::

| Task | Debian/Ubuntu (apt) | RHEL/Amazon Linux (dnf/yum) |
|---|---|---|
| Installed version | `dpkg -l openssl` or `apt policy openssl` | `rpm -q openssl` or `dnf info openssl` |
| Refresh repo metadata | `apt update` | `dnf makecache` |
| List available updates | `apt list --upgradable` | `dnf check-update` (or `yum check-update`) |
| Update one package | `apt install --only-upgrade openssl` | `dnf update openssl` |
| Update everything | `apt upgrade` (or `full-upgrade`) | `dnf upgrade` (or `yum update`) |
| History | `/var/log/apt/history.log` | `dnf history` |

Note: it is `dpkg -l` (lowercase L for "list"), not `dpkg -1`. `apt upgrade` never removes packages; `full-upgrade` may add or remove packages to resolve dependencies. Always note current versions before patching so a rollback is possible.

**Example:**
```bash
dpkg -l | grep -E "openssl|openssh-server"
# ii  openssl  3.0.2-0ubuntu1.15  amd64  Secure Sockets Layer toolkit
sudo apt update && apt list --upgradable
sudo apt upgrade -y

rpm -q openssl
sudo dnf check-update
sudo dnf upgrade -y
```

:::say
I check versions with `dpkg -l` or `apt policy` on Ubuntu and `rpm -q` on RHEL, list pending updates with `apt list --upgradable` or `dnf check-update`, and apply them with `apt upgrade` or `dnf upgrade`. I record the before-versions and patch history so I can roll back if needed.
:::

## How do you find the OS version on Linux?

<!-- source: 01 Q19 -->

:::note In simple words
Like checking the model and year written inside a car's door frame before ordering spare parts - you need to know the exact version before installing or patching anything.
:::

- `cat /etc/os-release` -> works on almost every modern distro (NAME, VERSION_ID, PRETTY_NAME). Best first choice, and easy to use in scripts (`. /etc/os-release; echo $ID $VERSION_ID`).
- `hostnamectl` -> OS, kernel and architecture in one view (systemd systems).
- `lsb_release -a` -> Debian/Ubuntu (may need the `lsb-release` package).
- `cat /etc/redhat-release` or `/etc/system-release` -> RHEL, CentOS, Rocky, Amazon Linux.
- `uname -r` -> **kernel** version only (not the distro); `uname -a` for everything including architecture.

**Example:**
```bash
cat /etc/os-release | grep -E "^(NAME|VERSION_ID)="
# NAME="Amazon Linux"
# VERSION_ID="2023"
hostnamectl | grep -E "Operating System|Kernel"
uname -r            # 6.1.100-1.amzn2023.x86_64
. /etc/os-release && [ "$ID" = "ubuntu" ] && sudo apt update || sudo dnf makecache
```

:::say
I use `cat /etc/os-release` because it works on nearly every distro and is easy to parse in scripts, or `hostnamectl` for a quick summary. `uname -r` gives the kernel version, which is different from the distribution version.
:::

## How do you search for a specific file inside subfolders?

<!-- source: 01 Q20 -->

:::note In simple words
`find` walks through every drawer of the cabinet looking for the file right now; `locate` checks a pre-printed index, which is instant but may be a day old.
:::

- `find /path -type f -name "app.conf"` -> exact name, recursive through all subfolders.
- `-iname` -> ignore case; wildcards need quotes: `-name "*.log"`.
- `-type d` for directories; `-maxdepth 3` to limit how deep it goes.
- `2>/dev/null` hides "Permission denied" noise; `-xdev` stays on one filesystem.
- `locate app.conf` -> very fast, searches a database updated daily; run `sudo updatedb` to refresh it (package `mlocate`/`plocate`).
- `fd app.conf` -> a modern, faster find alternative, if installed.
- Act on results: `-exec ls -l {} +` or `-delete` (careful).

**Example:**
```bash
find /etc -type f -name "nginx.conf" 2>/dev/null
find / -xdev -iname "*docker-compose*.yml" 2>/dev/null
find /opt -maxdepth 3 -type d -name "releases"
sudo updatedb && locate -i jenkins.war
```

:::say
I use `find /path -type f -name "file"`, with `-iname` for case-insensitive search and `2>/dev/null` to hide permission errors. For a quick system-wide lookup I use `locate`, remembering its database has to be refreshed with `updatedb`.
:::

## How do you check which ports are open or listening on a Linux server?

<!-- source: 01 Q21 -->

:::note In simple words
`ss` tells you which doors in the building are unlocked from the inside. `nmap` from another machine tells you which doors you can actually reach from the street, after the security guards (firewall, Security Group) have had their say.
:::

- `ss -tulnp` -> TCP/UDP, listening sockets, numeric ports, and the owning process (needs sudo for `-p`). This is the modern replacement for `netstat -tulnp`.
- `sudo lsof -i :8080` -> which process owns a specific port.
- `ss -tn state established '( dport = :5432 )'` -> active connections to a port.
- Bind address matters: `127.0.0.1:8080` is reachable only locally, `0.0.0.0:8080` or `[::]:8080` on all interfaces.
- **Listening is not the same as reachable:** test from outside with `nc -zv host 8080` or `nmap -p 8080 host`, then check firewalld/ufw/iptables and the cloud Security Group/NACL.

**Example:**
```bash
sudo ss -tulnp
# Netid State  Local Address:Port  Process
# tcp   LISTEN 0.0.0.0:22          users:(("sshd",pid=812,fd=3))
# tcp   LISTEN 127.0.0.1:5432      users:(("postgres",pid=990,fd=6))   <- local only
# tcp   LISTEN *:80                users:(("nginx",pid=1204,fd=6))

sudo lsof -i :80
nc -zv 10.0.2.15 80            # from another host: is it reachable?
sudo firewall-cmd --list-ports || sudo ufw status
```

:::say
I use `ss -tulnp` to see listening ports, the bind address and the owning process, and `lsof -i :port` for one specific port. I remember that listening on 127.0.0.1 means local only, and that a listening port may still be blocked, so I test from another host with `nc -zv` or nmap and then check the host firewall and the Security Group.
:::

## What is the difference between curl and wget?

<!-- source: 01 Q22 -->

:::note In simple words
curl is a Swiss-army knife for talking to any web API and seeing exactly what comes back. wget is a download manager: point it at a file or a whole site and it fetches everything, even resuming if the line drops.
:::

| Feature | curl | wget |
| --- | --- | --- |
| Main purpose | Transfer data, test and call APIs | Download files and mirror sites |
| Default output | Prints to stdout | Saves to a file |
| HTTP methods and headers | Any method (`-X`), headers `-H`, data `-d` | Mainly GET/POST |
| Recursive download | No | Yes (`-r`, `--mirror`) |
| Resume download | `-C -` | `-c` |
| Protocols | Many (HTTP, FTP, SFTP, SMTP, LDAP ...) | HTTP, HTTPS, FTP |
| Library | libcurl, used by many apps | Standalone tool |

- Use **curl** for health checks, REST APIs, debugging TLS or headers (`-v`, `-I`) and timing (`-w`).
- Use **wget** to download installers or artifacts, resume big downloads, or run background downloads (`-b`).

**Example:**
```bash
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://api.example.com/health
curl -X POST -H 'Content-Type: application/json' -d '{"name":"test"}' https://api.example.com/items
curl -vI https://example.com            # headers + TLS handshake details

wget -c https://releases.example.com/app-1.4.2.tar.gz     # resume if interrupted
wget -q -O - https://example.com/install.sh | head        # print to stdout like curl
```

:::say
curl is my tool for APIs and troubleshooting: any HTTP method, custom headers, verbose TLS output and timing, with output to stdout. wget is better for downloading files, resuming large downloads and mirroring sites recursively. In scripts I use curl with `-fsS` and a timeout for health checks.
:::
