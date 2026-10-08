---
track: qbank
title: "Linux, shell and networking: Scenario-based questions (part 3 of 4)"
short: Linux scenario 3
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Apache is running, but the website is not accessible. How do you troubleshoot it?

<!-- source: 01 Q70 -->

:::note In simple words
The shop is open and the lights are on, but customers cannot get in. Maybe the front door is on the wrong street (port/interface), a guard blocks the entrance (firewall/SELinux), the signboard points elsewhere (DNS/vhost), or the shelves are locked (file permissions).
:::

Work from the inside out:

1. Is it really healthy? `systemctl status httpd` (RHEL) / `apache2` (Ubuntu), and `apachectl configtest` for syntax.
2. Is it listening where you think? `ss -tlnp | grep -E ':80|:443'` -> `127.0.0.1:80` means local only; check `Listen` directives.
3. Test locally: `curl -I http://localhost` -> works locally but not remotely = network/firewall. Fails locally = Apache/app config.
4. Test by external IP from outside, then by domain name -> works by IP but not name = **DNS**.
5. Firewalls: `firewall-cmd --list-all` / `ufw status`, then cloud Security Group/NACL/load balancer target health.
6. **SELinux** (RHEL): `getenforce`; wrong file context on a custom DocumentRoot (`restorecon -Rv`), or `httpd_can_network_connect` off when proxying to a backend.
7. vhost/DocumentRoot: correct `ServerName`, `<Directory>` has `Require all granted`, files readable and parent directories have `x` for the apache user.
8. Logs tell the story: `error_log` (403 permission denied, AH00035) and `access_log` (are requests even arriving?).
9. HTTPS only failing: certificate path, expired cert, port 443 not open.

**Example:**
```bash
sudo apachectl configtest              # Syntax OK
sudo ss -tlnp | grep httpd
curl -I http://localhost
sudo firewall-cmd --add-service={http,https} --permanent && sudo firewall-cmd --reload
sudo tail -f /var/log/httpd/error_log
getenforce; sudo restorecon -Rv /var/www/mysite
sudo setsebool -P httpd_can_network_connect on
```

:::say
I verify the config with `apachectl configtest`, confirm with `ss` that it listens on the right interface and port, then compare curl on localhost with curl from outside to split an Apache problem from a network one. After that I check firewalld or ufw, security groups, SELinux contexts and booleans, vhost and DocumentRoot permissions, DNS, and the error and access logs.
:::

## Automate an application deployment with a shell script, with backup, health check and automatic rollback.

<!-- source: 01 Q71 -->

:::note In simple words
Like changing a shop's display overnight: keep the old display packed next to you, set up the new one, switch the lights on and check it looks right - if not, put the old one back before customers arrive.
:::

Design used by real tools (Capistrano-style):

- Each release goes into its own timestamped folder: `/opt/app/releases/20260924_101500`.
- A symlink `/opt/app/current` points to the live release -> switching is **atomic** (`ln -sfn`), and rollback is just pointing back.
- Keep the last N releases for quick rollback; delete older ones.
- Health check in a retry loop after restart; on failure, switch the symlink back and restart.
- `set -euo pipefail` + `trap` so a failed step never leaves things half-done silently.

**Example:**
```bash
#!/usr/bin/env bash
# Usage: ./deploy.sh /tmp/app-build.tar.gz
set -euo pipefail
ARTIFACT="${1:?Usage: $0 <artifact.tar.gz>}"
APP=/opt/app; SERVICE=myapp; HEALTH=http://localhost:8080/health; KEEP=5
NEW="$APP/releases/$(date +%Y%m%d_%H%M%S)"
PREV="$(readlink -f "$APP/current" || true)"

log() { echo "$(date '+%F %T') $*"; }
rollback() {
  log "Deployment FAILED - rolling back to $PREV"
  [ -n "$PREV" ] && ln -sfn "$PREV" "$APP/current" && systemctl restart "$SERVICE"
  exit 1
}
trap rollback ERR

[ -f "$ARTIFACT" ] || { log "Artifact not found"; exit 2; }
mkdir -p "$NEW" && tar -xzf "$ARTIFACT" -C "$NEW"
log "Switching current -> $NEW"
ln -sfn "$NEW" "$APP/current"
systemctl restart "$SERVICE"

for i in $(seq 1 10); do
  if curl -fsS --max-time 3 "$HEALTH" >/dev/null; then
    log "Healthy after ${i} checks"; trap - ERR
    ls -1dt "$APP"/releases/* | tail -n +$((KEEP+1)) | xargs -r rm -rf
    exit 0
  fi
  sleep 3
done
false     # health never passed -> triggers ERR trap -> rollback
```

:::say
My script extracts each build into a timestamped release directory, atomically switches a `current` symlink, restarts the service with systemctl and polls the health endpoint in a loop. An ERR trap under `set -euo pipefail` points the symlink back to the previous release and restarts it if any step or the health check fails, and old releases are pruned to keep the last five.
:::

## An application fails intermittently. How do you use Linux command-line tools to analyse its logs?

<!-- source: 01 Q72 -->

:::note In simple words
Intermittent failures are like a car that stalls "sometimes". You go through the trip log, count how often and at what times it happened, and look at what else happened at the same minute.
:::

1. Narrow the time window: `journalctl -u myapp --since "2026-09-24 10:00" --until "10:30"`.
2. Find errors with context: `grep -E "ERROR|Exception|timeout" -C 5 app.log` (lines before/after show the cause).
3. Count and group to find patterns:
- `grep -c` for totals; `sort | uniq -c | sort -rn` for the most common messages.
- `awk` to count HTTP status codes per minute from access logs -> shows spikes.
4. Include rotated logs: `zgrep` on `.gz` files.
5. Watch live while reproducing: `tail -F` (follows through rotation) or `less +F`.
6. **Correlate timestamps** with other sources: `dmesg -T` (OOM kills, disk errors), system journal, cron times, deploy times, database logs.
7. Check if failures cluster on one host, one endpoint or one upstream.

**Example:**
```bash
journalctl -u myapp --since "1 hour ago" -p err
grep -E "ERROR|Timeout" -C 3 /var/log/myapp/app.log | less
# Top error messages
grep ERROR app.log | sed 's/^[^]]*] //' | sort | uniq -c | sort -rn | head
# 5xx per minute from nginx access log ($9 = status, $4 = [time)
awk '$9 ~ /^5/ {print substr($4,2,17)}' /var/log/nginx/access.log | uniq -c | sort -rn | head
zgrep -h "Timeout" /var/log/myapp/app.log*.gz | wc -l
dmesg -T | grep -i "killed process"
tail -F /var/log/myapp/app.log | grep --line-buffered ERROR
```

:::say
I narrow the time window with `journalctl --since`, grep errors with context lines, and use `sort | uniq -c` and awk to count error types and 5xx per minute, which reveals patterns. I include rotated logs with zgrep, follow live with `tail -F` while reproducing, and correlate the timestamps with dmesg OOM events, cron and deployments.
:::

## A critical service fails to start after a reboot. How do you troubleshoot it?

<!-- source: 01 Q73 -->

:::note In simple words
After a power cut, one machine will not start. Maybe it was never set to start automatically, it tried to start before the electricity or water it needs was ready, or someone left something blocking it.
:::

1. Was it enabled? `systemctl is-enabled myapp` -> if `disabled`, it never tried: `systemctl enable myapp`.
2. What failed? `systemctl --failed`, `systemctl status myapp`, and `journalctl -b -u myapp` (this boot only).
3. **Ordering/dependencies**: it started before what it needs. Network apps should use `After=network-online.target` + `Wants=network-online.target`; add `After=`/`Requires=` for databases or mounts (`RequiresMountsFor=/data`).
4. **Mounts not ready**: a data disk or NFS missing from fstab, or it failed -> app cannot find its files. Use `nofail`/`_netdev` so a bad mount does not break boot.
5. **Port already in use**: another service grabbed it (`ss -tlnp`).
6. Permissions / env files: `EnvironmentFile=` missing, `/run` or `/tmp` directories not recreated (use `RuntimeDirectory=`).
7. SELinux denials: `ausearch -m avc -ts boot`.
8. Unit edited but not reloaded -> `systemctl daemon-reload`.
9. Add `Restart=on-failure` so a transient issue heals itself.

**Example:**
```bash
systemctl is-enabled myapp
systemctl --failed
journalctl -b -u myapp --no-pager | tail -30
systemctl list-dependencies myapp
sudo systemctl edit myapp
# [Unit]
# After=network-online.target postgresql.service
# Wants=network-online.target
# RequiresMountsFor=/data
sudo systemctl daemon-reload && sudo systemctl restart myapp
```

:::say
I check whether the unit is enabled, then read `journalctl -b -u` and `systemctl --failed` for the actual error. The common causes after a reboot are ordering problems, fixed with `After=network-online.target` or `RequiresMountsFor`, a mount that did not come up, a port already taken, missing environment or runtime files, or SELinux, and I add `Restart=on-failure` for resilience.
:::

## How would you tune the kernel with sysctl for a high-traffic application?

<!-- source: 01 Q74 -->

:::note In simple words
The kernel ships with settings for an average house. A busy stadium needs wider gates and a longer waiting area - but you only widen the gates that are actually crowded, and you measure before and after.
:::

Common knobs for many concurrent connections:

| Setting | What it controls | Typical high-traffic value |
|---|---|---|
| `net.core.somaxconn` | max accept queue per listening socket | 4096-65535 (app backlog must match) |
| `net.ipv4.tcp_max_syn_backlog` | half-open connection (SYN) queue | 8192+ |
| `net.core.netdev_max_backlog` | packets queued from the NIC | 16384+ |
| `net.ipv4.ip_local_port_range` | ports for OUTGOING connections (proxies) | `1024 65535` |
| `net.ipv4.tcp_tw_reuse` | reuse TIME_WAIT sockets for outgoing | `1` |
| `fs.file-max` + `LimitNOFILE` | total and per-process open files/sockets | e.g. 2M and 65536 |
| `vm.swappiness` | how eagerly to swap | 1-10 for latency-sensitive apps |

Rules:

- **Measure first**: `ss -s`, `netstat -s | grep -i -E "overflow|drop"` (listen queue overflows), TIME_WAIT counts, fd usage. Tune only what the data shows is a bottleneck.
- Persist in `/etc/sysctl.d/99-app.conf`, apply with `sysctl --system`; change one thing at a time; load test and compare.
- Avoid cargo-cult tuning copied from blogs: `tcp_tw_recycle` was removed from Linux (it broke clients behind NAT), and huge buffers can increase latency.
- In Kubernetes, many of these are namespaced and set per pod (`securityContext.sysctls`), others only on the node.

**Example:**
```bash
ss -s
netstat -s | grep -i "listen"          # "times the listen queue of a socket overflowed"
cat <<'EOF' | sudo tee /etc/sysctl.d/99-webapp.conf
net.core.somaxconn = 8192
net.ipv4.tcp_max_syn_backlog = 8192
net.core.netdev_max_backlog = 16384
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
vm.swappiness = 10
EOF
sudo sysctl --system
```

:::say
I first measure with `ss -s` and `netstat -s` for listen queue overflows, TIME_WAIT and file descriptor usage, and only then tune the relevant values such as somaxconn, tcp_max_syn_backlog, ip_local_port_range, tcp_tw_reuse and file limits. I persist them in /etc/sysctl.d, change one thing at a time with load tests before and after, and avoid copying blog settings like the removed tcp_tw_recycle.
:::

## How do you deploy updates with zero downtime on a plain Linux server (no Kubernetes)?

<!-- source: 01 Q75 -->

:::note In simple words
Changing the cashier at a checkout without closing it: the new cashier sits down at the next counter, the manager starts sending new customers there, and the old cashier finishes serving the people already in line before leaving.
:::

Techniques (often combined):

1. **Two or more instances behind a reverse proxy** (nginx/HAProxy) or a load balancer: take instance A out of rotation (drain), update and health-check it, put it back, then do B - a **rolling restart**.
2. **Connection draining**: let in-flight requests finish before stopping (LB deregistration delay, HAProxy `drain` state, app handling SIGTERM gracefully).
3. **Graceful reload of the proxy**: `nginx -t && nginx -s reload` (or `systemctl reload nginx`) starts new workers with the new config while old workers finish their requests - no dropped connections.
4. **Atomic symlink switch + graceful app reload**: deploy to a new release folder, switch `current` symlink, then graceful reload (many app servers like gunicorn, php-fpm or puma support reloading workers on a signal without closing the listening socket).
5. **Blue-green on one host**: run the new version on another port, health-check it, flip the nginx upstream, reload nginx, keep the old one for instant rollback.
6. **systemd socket activation**: systemd holds the listening socket, so connections queue briefly during a restart instead of being refused.
7. Database changes must be backward compatible (expand/contract) so old and new versions can run together.

**Example:**
```nginx
upstream app {
    server 127.0.0.1:8081;       # blue (current)
    server 127.0.0.1:8082 down;  # green (new) - flip 'down' after health check
}
```
```bash
curl -fsS http://127.0.0.1:8082/health && \
  sudo sed -i 's/8081;/8081 down;/; s/8082 down;/8082;/' /etc/nginx/conf.d/app.conf && \
  sudo nginx -t && sudo nginx -s reload
```

:::say
I run at least two app instances behind nginx or HAProxy and do a rolling update: drain one, deploy and health-check it, return it to the pool, then the next, with the proxy itself changed only by graceful reloads. On a single host I use blue-green on two ports or an atomic symlink switch plus the app server's graceful reload, and I keep database changes backward compatible so both versions can run together.
:::

## Design a 3-tier architecture (web, app, DB), explain the request flow, and debug a failure layer by layer with Linux commands.

<!-- source: 01 Q76 -->

:::note In simple words
A restaurant: the waiter at the front (web tier) takes the order, the kitchen (app tier) cooks it, and the storeroom (database) holds the ingredients. When a customer complains, you walk the same path the order took and check each station in turn, instead of guessing.
:::

**Design:**

```text
 User --DNS--> app.example.com
   |
   v   HTTPS 443
 [ Load balancer / nginx (web tier) ]   public subnet, TLS termination, static files
   |            |            (health checks, least_conn)
   v HTTP 8080  v
 [ App server 1 ]  [ App server 2 ]     private subnet, stateless, sessions in Redis
   |            |
   v TCP 5432   v
 [ DB primary ] ---replication---> [ DB replica ]   private DB subnet, Multi-AZ
```

- Each tier sits in its own subnet with security groups allowing only the tier above it (LB -> app 8080, app -> DB 5432).
- Web tier scales horizontally, app tier is stateless behind the LB, DB has a primary plus a replica for failover and reads.
- Flow: DNS resolves -> TCP + TLS to the LB -> LB proxies to a healthy app server -> app queries the DB -> response travels back the same way.

**Debug, layer by layer (what to run and why):**

1. **Scope first** - all users or some, all pages or one endpoint, since when, what changed (deploy, config, certificate)?
2. **DNS** - `dig +short app.example.com` -> does the name resolve, to the right IP (stale record, wrong TTL)?
3. **Connectivity** - `nc -zv <lb-ip> 443` and `curl -v https://app.example.com/health` -> is the port reachable, and what status comes back (timeout = network/SG; 502/504 = backend problem)?
4. **TLS** - `openssl s_client -connect app.example.com:443 -servername app.example.com` -> expired certificate, broken chain, wrong hostname?
5. **Web tier** - `nginx -t` (config valid?), `ss -tlnp` (listening on 443?), `tail -f /var/log/nginx/error.log` ("upstream timed out" or "connection refused" tells you the app tier is the problem), `access.log` for status codes and `$upstream_response_time`.
6. **App tier** - `systemctl status myapp` and `journalctl -u myapp -f` (crashing, exceptions?), `curl localhost:8080/health` on the box (bypasses the LB), `top` (CPU/memory saturated?), `lsof -p <PID> | wc -l` (fd leak), `strace -p <PID>` (stuck waiting on a socket = waiting on the DB?), `ss -tnp | grep 5432` (connection pool full?).
7. **DB tier** - `nc -zv db 5432`; connections vs `max_connections` (`SELECT count(*) FROM pg_stat_activity;`), long or blocked queries (`pg_stat_activity`, slow query log), locks, replication lag; on the host `iostat -x 1` (disk saturated?), `df -h` (disk full stops writes).
8. **Network in between** - `mtr` (loss or latency per hop), `ss -s` and `netstat -s | grep -i retrans` (retransmits), `tcpdump -i eth0 port 5432` (are packets leaving and replies coming back?), MTU (`ping -M do -s 1472 <ip>` - big packets hang while small ones work), security groups/NACLs.
9. **Fix and verify** - roll back the change or scale/restart the failing tier, confirm with the same checks and dashboards, then write the RCA.

**Example:**
```bash
dig +short app.example.com
curl -sv -o /dev/null -w "%{http_code} %{time_total}\n" https://app.example.com/health
openssl s_client -connect app.example.com:443 -servername app.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -dates
sudo nginx -t && sudo tail -20 /var/log/nginx/error.log
# upstream timed out (110) while reading response header from upstream: 10.0.2.11:8080
ssh app1 'curl -s localhost:8080/health; journalctl -u myapp -n 30 --no-pager'
ssh app1 'ss -tnp | grep -c ":5432"'                # 100 = pool exhausted?
psql -h db -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
mtr -rwc 30 10.0.3.10; netstat -s | grep -i retrans
```

:::say
I design it as a load balancer or nginx web tier in a public subnet, stateless app servers in a private subnet, and a primary database with a replica in a DB subnet, each tier only reachable from the one above. To debug I follow the request path: DNS with dig, reachability and status with curl and nc, TLS with openssl, then the nginx error log to see whether upstream failed, the app's journal, resources and strace, the database's connections, slow queries and disk, and finally mtr, retransmits, tcpdump and MTU for the network in between.
:::

## You are locked out of a server over SSH and have no root access. How do you recover?

<!-- source: 01 Q77 -->

:::note In simple words
You lost the key to your flat. Instead of breaking the door, you use the building manager's master access (the cloud console), or you take the lock out, fix it on a workbench, and put it back.
:::

**On AWS / cloud (in order of convenience):**
1. **SSM Session Manager** -> if the SSM agent and instance role are there, you get a shell with no SSH at all: `aws ssm start-session --target i-0abc`.
2. **EC2 Instance Connect** or the **EC2 Serial Console** (Nitro instances) -> console access even when networking or sshd is broken.
3. **Rescue-volume method:** stop the instance -> detach the root EBS volume -> attach it to a helper instance in the same AZ -> mount it -> fix `home/ec2-user/.ssh/authorized_keys`, `etc/ssh/sshd_config` or `etc/sudoers.d/` -> unmount -> reattach as the root device -> start.
4. **User data:** on some AMIs, cloud-init user data set to run on every boot can re-inject a public key.

**On-prem / VM:** use the hypervisor or iLO/iDRAC console, boot to single-user mode (`systemd.unit=rescue.target`, or `rd.break` on RHEL to reset the root password), then fix the problem.

**Afterwards:** find out why it happened (a bad sshd_config, full disk, changed key, fail2ban ban, SG change), and enable SSM so it never needs this again.

**Example:**
```bash
# Rescue method on a helper instance (root volume attached as /dev/xvdf)
sudo lsblk
sudo mkdir -p /mnt/rescue && sudo mount /dev/xvdf1 /mnt/rescue
cat ~/new_key.pub | sudo tee -a /mnt/rescue/home/ec2-user/.ssh/authorized_keys
sudo chroot /mnt/rescue sshd -t -f /etc/ssh/sshd_config   # validate config
sudo umount /mnt/rescue
```

:::say
On AWS I first try SSM Session Manager or the EC2 serial console, which don't depend on SSH. If neither is available, I stop the instance, attach its root volume to a helper instance, fix authorized_keys, sshd_config or sudoers, and reattach it. On-prem I use the out-of-band console and rescue mode. Then I fix the root cause and make sure SSM is enabled everywhere.
:::

## Write a shell script that checks whether a service is running, restarts it if not, and logs the event.

<!-- source: 01 Q78 -->

:::note In simple words
A night watchman who checks that the lights are on. If they're off, he flips the switch, writes it in the logbook, and calls someone if the switch won't work.
:::

- Use `systemctl is-active --quiet` to check each service.
- Restart, then **verify** that the restart actually worked; don't assume it did.
- Log to syslog/journald with `logger`, so logs are centralized and rotated.
- Return a non-zero exit code if anything is still down, so cron or monitoring can alert.
- Note: `Restart=on-failure` in the systemd unit usually makes this script unnecessary. Use the script for extra checks or alerting.

**Example:**
```bash
#!/usr/bin/env bash
# svc_guard.sh - restart services that are down, log it, and report failures
set -uo pipefail
SERVICES=("${@:-nginx}")
failed=0

for svc in "${SERVICES[@]}"; do
  if systemctl is-active --quiet "$svc"; then
    continue
  fi
  logger -t svc_guard -p user.warning "$svc is down - restarting"
  if systemctl restart "$svc" && sleep 3 && systemctl is-active --quiet "$svc"; then
    logger -t svc_guard "$svc restarted successfully"
  else
    logger -t svc_guard -p user.err "$svc FAILED to restart: $(systemctl is-failed "$svc")"
    failed=1
  fi
done
exit "$failed"
```

```bash
# run every 2 minutes; view the history with: journalctl -t svc_guard
*/2 * * * * root /opt/scripts/svc_guard.sh nginx docker
```

```ini
# Usually the better fix - let systemd do it:
# /etc/systemd/system/nginx.service.d/restart.conf
[Service]
Restart=on-failure
RestartSec=5
```

:::say
The script loops over the services, uses `systemctl is-active` to check each one, restarts any that are down, verifies the restart worked, logs everything with logger into journald, and exits non-zero if a service is still down so monitoring alerts. I'd point out that `Restart=on-failure` in the systemd unit handles most of this natively, so the script is mainly for alerting.
:::

## Networking: a remote user cannot connect to the company VPN. How do you troubleshoot?

<!-- source: 01 Q79 -->

:::note In simple words
Check the problem from the user's side outward: is their internet working, can they reach the VPN gate, does the gate recognise their ID, and once inside, do they get a map (routes and DNS)?
:::

1. **Scope:** is it only this user or everyone? If everyone, look at the VPN gateway itself (service down, certificate expired, licence limit).
2. **User's internet:** can they browse? Hotel or corporate Wi-Fi often blocks UDP 500/4500 (IPsec) or 1194 (OpenVPN), so try a TCP/443 profile.
3. **Reachability:** `nslookup vpn.company.com`, `nc -vz vpn.company.com 443`, or check the UDP ports.
4. **Authentication:** wrong password, expired account or certificate, MFA problem, clock skew (certificate and TOTP validity). Check the VPN server and IdP logs for the user.
5. **Connected but nothing works:** no route pushed (split tunnel), overlapping subnets (the home LAN is 192.168.1.0/24, the same as the office), DNS not pushed, MTU issues (large packets drop, so lower the MTU or set MSS clamping).
6. **AWS Client VPN / Site-to-Site:** authorization rules, route table entries for the target subnet, the SG on the endpoint's association, tunnel status in CloudWatch.

**Example:**
```bash
nslookup vpn.company.com
nc -vz vpn.company.com 443
# after connecting:
ip route | grep tun0          # were routes pushed?
ping -M do -s 1372 10.10.0.10 # MTU test; lower the size if it fails
resolvectl status | grep -A2 tun0
```

:::say
I first check whether it's one user or everyone. Then I check the user's own internet and whether VPN ports are blocked on their network, then authentication (certificate expiry, MFA, clock skew) in the server logs. If they connect but can't reach anything, I look at the pushed routes, overlapping home and office subnets, DNS and MTU. On AWS Client VPN I also check the authorization rules and route table.
:::

## Networking: users report slow access between two branch offices over a WAN link (or a remote office cannot reach the main server). How do you troubleshoot?

<!-- source: 01 Q80 -->

*Also asked as:* A user in a remote office cannot access the company's main server. How would you diagnose it?

:::note In simple words
Traffic between offices travels on a motorway you share with everyone. It can be slow because the road is full (bandwidth), too long (latency), full of potholes (packet loss), or the trucks are too tall for the bridges (MTU).
:::

1. **Scope:** one user, one app, or the whole office? All the time or only at peak hours?
2. **Can't reach at all:** test step by step: local gateway -> WAN router -> remote side (`traceroute`/`mtr`). Check that the VPN/MPLS tunnel is up, the routes for the server subnet exist on both ends, firewall/ACL/SG rules, and DNS (does the name resolve to the internal IP?).
3. **Slow:** measure latency and loss with `mtr` over several minutes. Measure throughput with `iperf3` against link capacity, and look at interface utilization and errors (SNMP/NetFlow).
4. **Common causes:** a saturated link (backups or updates at the wrong time), no QoS for critical traffic, packet loss on the ISP, MTU/fragmentation over the tunnel, a chatty application (SMB/database) that suffers from high round-trip time, duplex mismatch or interface errors.
5. **Fixes:** QoS, schedule bulk transfers off-peak, increase bandwidth or add a second link, WAN optimisation or caching, MSS clamping on the tunnel, and move chatty apps closer to users. In the cloud, consider Direct Connect instead of internet VPN.

**Example:**
```bash
mtr -rwc 100 10.20.0.15           # latency and loss per hop over 100 probes
iperf3 -c 10.20.0.15 -t 30        # throughput (iperf3 -s running on the far side)
ping -M do -s 1400 10.20.0.15     # MTU through the tunnel
ip -s link show eth0              # errors and drops on the interface
```

:::say
I scope it first: which users, which apps, and when. If it's unreachable, I trace hop by hop and check the tunnel, routes on both sides, firewall rules and DNS. If it's slow, I use mtr for latency and loss, iperf3 for throughput against the link's capacity, and interface counters for errors. The usual culprits are a saturated link, no QoS, ISP packet loss or MTU problems over the tunnel.
:::

## Networking: the network has intermittent connectivity issues. What could cause it, and how do you troubleshoot?

<!-- source: 01 Q81 -->

:::note In simple words
A light that flickers is harder to fix than one that's off, because you have to catch it in the act. So you set up continuous recording and look for a pattern in time, place or load.
:::

**Likely sources:**
- Physical: a bad cable or SFP, a flapping interface, Wi-Fi interference, a duplex mismatch.
- Capacity: link saturation at peaks, NAT port exhaustion (e.g. NAT Gateway `ErrorPortAllocation`), conntrack table full (`nf_conntrack: table full` in dmesg).
- Addressing: duplicate IP / ARP conflicts, DHCP lease problems.
- Routing: a route flapping between two paths, BGP session resets, asymmetric routing through a stateful firewall.
- DNS: one of several resolvers failing, so only some lookups fail.
- Cloud: instance bandwidth or PPS limits, health checks toggling targets, spot interruptions.

**Approach:**
1. Get timestamps and a pattern: which hosts, when, and which destinations.
2. Run continuous tests (`mtr`, `ping -D` with timestamps, synthetic checks) and correlate with metrics: interface errors, drops, CPU on network devices, NAT/conntrack counters.
3. Capture during an event (`tcpdump` on both ends) to see retransmits, resets or ARP storms.
4. Change one thing at a time and confirm the pattern disappears.

**Example:**
```bash
ping -D -i 0.5 10.0.1.20 | tee ping.log         # timestamped, catch the drop window
ip -s link show eth0                            # rx/tx errors, dropped
dmesg -T | grep -Ei 'conntrack|link is down|duplex'
arping -D -I eth0 10.0.1.20                     # duplicate IP detection
ethtool -S eth0 | grep -i allowance             # AWS ENA bandwidth/PPS limits hit
```

:::say
Intermittent problems need data over time, so I collect timestamps and run continuous pings or mtr to find a pattern. Then I correlate with interface errors, NAT and conntrack exhaustion, ARP or duplicate-IP conflicts, route flaps, DNS resolvers and cloud bandwidth limits, and capture packets during an event. Once I have a hypothesis, I change one thing at a time and confirm the drops stop.
:::
