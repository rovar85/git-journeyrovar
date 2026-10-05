---
track: capstone
title: Putting it together: runbook, skills map and a study plan
short: Skills and plan
sub: Troubleshoot an incident across every layer, check your skills, and plan the next 90 days.
---

:::goals
- troubleshoot an incident layer by layer using the tools from every track
- self-assess with a skills map
- choose certifications and portfolio projects
- follow a 90-day plan to go from beginner to confident practitioner
:::

## The scenario

**09:05: "Users cannot search the EV archive."** There is no single answer, so you work down the stack, using what each track taught. The method is always the same: **symptom, hypothesis, test, narrow down, fix, verify, write it up.**

## A layered runbook

| Layer | Question | Commands (track) |
|---|---|---|
| **User** | Who, since when, what exactly, what changed? | ask, change calendar, Git log (Git) |
| **Application** | Is the service up? Errors in its log? | `systemctl status`, `journalctl -u`, `grep ERROR`, `Get-Service`, `Get-WinEvent` (Linux, PowerShell) |
| **Metrics** | Did traffic, errors, latency, saturation change? | dashboards, `promq`, alerts (Monitoring) |
| **Process / resources** | CPU, memory, disk full, inodes, load? | `top`, `free -m`, `df -h`, `df -i`, `lsof +L1` (Linux) |
| **Dependencies** | Is SQL reachable, is DNS resolving? | `getent hosts`, `dig`, `nc -zv sql01 1433` (Networking) |
| **Network** | Routing, firewall, certificate? | `ip route`, `traceroute`, `nft list ruleset`, `openssl x509 -dates` (Networking) |
| **Platform** | Containers or pods unhealthy? | `docker ps`, `docker logs`, `kubectl get pods`, `describe`, `logs --previous` (Docker, Kubernetes) |
| **Delivery** | Did a recent deployment break it? | Jenkins build history, `kubectl rollout history/undo` (Jenkins, Kubernetes) |
| **Infrastructure** | Did infra change or drift? | `terraform plan`, cloud console audit logs (Terraform, Cloud) |
| **Configuration** | Did a server drift from the code? | `ansible-playbook --check --diff` (Ansible) |

Mistakes to avoid: changing many things at once; skipping the "what changed?" question; assuming instead of testing; not writing down what you did; and, in a crisis, forgetting the first rule: **restore service first (roll back), investigate second.**

### Walk through it: indexing stopped

The EV indexing log (from the Linux track) says `Name resolution failed for SQL01` and aborted tasks. Reason it through, then run the first checks on the lab's own pretend server tree:

@setup evlab

```run
cd ~/lab
echo "1) What does the log say, and when did it start?"
grep -E "ERROR" ev/logs/indexing.log | head -3
echo
echo "2) How often per hour (is it constant or since a change)?"
grep ERROR ev/logs/indexing.log | awk '{print substr($2,1,2)":00"}' | sort | uniq -c
echo
echo "3) Name or network? Resolve it the way the application would, then test the port"
getent hosts SQL01 || echo "   -> the name SQL01 does not resolve on this machine: a DNS or hosts-file problem, not SQL Server itself"
echo
echo "4) What changed? (the config file the service reads)"
cat ev/config/evault.conf | head -4
```

Reading the evidence: the failures are **name resolution** errors, the name does not resolve on this machine, so the SQL service may be perfectly healthy. The next steps would be `dig` against the configured DNS server, comparing `/etc/resolv.conf` with what changed, checking whether the DNS record or the DNS server was modified, and, once DNS is fixed, restarting the indexing task and watching the queue drain in monitoring. In the post-mortem, the action items are: **alert on resolution failures, monitor DNS, and add a synthetic SQL connection check.**

## Skills map: where are you?

Rate yourself 0 (never) to 3 (could teach it). Revisit every month.

| Area | Can you... | 0-3 |
|---|---|---|
| **Linux** | navigate and edit files, use pipes and `grep/awk/sed`, manage permissions and processes, write a safe Bash script, read logs, troubleshoot a full disk | |
| **Networking** | subnet with CIDR, explain routing and NAT, test ports, use `dig`, read a TLS certificate | |
| **Git** | branch, merge, resolve conflicts, undo safely, use pull requests | |
| **Python** | write functions, read files, call APIs, write tests | |
| **Docker** | write a Dockerfile, use volumes and networks, debug a container, use Compose | |
| **Ansible** | write idempotent playbooks, roles, use Vault, run safely with `--check` | |
| **Terraform** | write modules, understand state, read a plan, use remote state | |
| **Kubernetes** | deploy, expose, configure, debug, roll back, restrict access | |
| **Jenkins/CI-CD** | build a pipeline, use credentials safely, add tests and rollbacks | |
| **Monitoring** | write PromQL, create alerts, define SLOs | |
| **Windows/PowerShell** | pipeline, scripting, services, event logs, remoting | |
| **Cloud** | design a VPC, apply least-privilege IAM, plan backups and DR | |
| **Your product knowledge** | architecture of Enterprise Vault: indexing, storage, SQL, recovery | |

Any 0 or 1 becomes a project.

## Certifications (optional but structured)

| Certification | Covers | Good after |
|---|---|---|
| **LPIC-1 / CompTIA Linux+ / RHCSA** | Linux administration | Linux, Networking tracks |
| **CompTIA Network+** | networking fundamentals | Networking track |
| **HashiCorp Terraform Associate** | Terraform | Terraform track |
| **CKAD / CKA** | Kubernetes (hands-on exams) | Docker, Kubernetes tracks |
| **AWS Cloud Practitioner then Solutions Architect Associate; Azure AZ-900 then AZ-104** | cloud | Cloud track |
| **AZ-400 (DevOps), AWS DevOps Engineer** | CI/CD and delivery | Jenkins, Git tracks |
| **Microsoft PowerShell / Windows Server admin** | Windows | Windows track |

Certifications give structure and vocabulary; **projects prove ability**.

## Portfolio projects

1. **The capstone, extended**: a repository that builds an environment from scratch, with a README, a diagram and a pipeline.
2. **A monitoring pack**: exporter, rules, dashboard JSON and a runbook for an application you know.
3. **A backup and restore tool** in Bash or Python with logging, exit codes, tests and a documented restore drill.
4. **A reusable Ansible role** with Molecule tests, published to Git.
5. **A Kubernetes deployment** of a small multi-tier app with secrets, probes, limits, RBAC and a network policy.
6. **A post-mortem** of a real or simulated incident, written blamelessly.

Put them in Git (public ones help with hiring; never include real secrets or company data).

## A 90-day plan

| Weeks | Focus | Deliverable |
|---|---|---|
| 1-3 | Linux, shell scripting, Git (daily practice on a VM; no GUI) | a backup script, a clean Git history |
| 4-5 | Networking and troubleshooting method | a one-page runbook for your own environment |
| 6-7 | Docker and Compose | a containerised app with a CI-built image |
| 8-9 | Ansible and Terraform | the capstone's first two steps against a real VM or free cloud tier |
| 10-11 | Kubernetes basics (CKAD syllabus) | a deployed app with probes, config and an update/rollback |
| 12 | Jenkins or GitHub Actions, then monitoring | a pipeline and a Prometheus alert |
| 13 | Review, gaps, mock incident, write-up | the portfolio repository |

Habits that make learning stick: **type every command** (do not copy-paste), **break things on purpose** in a lab and fix them, **keep notes** in your own words, **read error messages fully**, **teach someone**, and revisit the quizzes in this course. Short daily practice beats long rare sessions.

## Interview-style questions to practise

Answer each aloud in two minutes, giving a concrete example:

- A server is slow. Walk me through how you investigate.
- What happens when you type a URL and press enter? (DNS, TCP, TLS, HTTP, load balancer, app, database)
- What is the difference between a container and a VM? Between a Deployment and a StatefulSet?
- How do you keep secrets out of Git and out of logs?
- Explain idempotency and why it matters for Ansible and Terraform.
- A deployment failed halfway: what do you do first?
- What is in your backup strategy, and when did you last test a restore?
- How would you design the monitoring for a new service?

## Closing thought

You do not become an expert by finishing a course; you become one by **operating real systems, breaking them, fixing them and writing down what you learned**. This course gave you the map and a working lab for every area. Pick the weakest square on your skills map, build something small this week, and keep going.

:::recap
- Troubleshoot top-down in layers (user, application, metrics, resources, dependencies, network, platform, delivery, infrastructure, configuration); restore first, investigate second.
- Use the skills map to find gaps; projects matter more than certificates.
- A 90-day plan: Linux and Git, networking, Docker, Ansible and Terraform, Kubernetes, CI/CD and monitoring, then review.
- Practise by doing: type, break, fix, document.
:::

:::try Your turn
Write your own two-page runbook titled "EV search is down" using the layer table: for each layer, the exact commands you would run and what a bad result looks like.
:::

:::quiz
? An incident is in progress and a deployment happened 10 minutes ago. What first?
+ Roll back to the last good version to restore service, then investigate
- Search logs for an hour first
- Reboot every server
- Change several settings at once
! Mitigate first; understand second.
? Which approach proves ability best?
+ Working projects in Git that rebuild an environment
- Memorising answers
- Collecting certificates only
- Reading without typing
! Do real things.
? What is the point of a blameless post-mortem?
+ Learn the contributing factors and fix the system, not blame people
- Decide who is at fault
- Hide the incident
- Write less documentation
! People then report problems honestly.
:::
