---
track: qbank
title: "Behavioral and project experience: Basic questions"
short: Behavioral basic
sub: 9 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Tell me about yourself.

<!-- source: 09 Q1 -->

*Also asked as:* Introduce yourself.

:::note In simple words
The interviewer wants a 60-90 second story: who you are, what you work on now, one or two results you are proud of, and why you want this role. It is not your life history.
:::

Use the formula **Present -> Proof -> Future**:
- **Present** - your role and the platform you support.
- **Proof** - two concrete achievements with results.
- **Future** - what you want next and why this role fits.

**Example:** Sample answer - adapt to your own words:
```
I have around 5 years in IT, and currently I work on the operations and monitoring
side of a smart-metering platform at a smart-energy technology company. The platform runs on Amazon EKS
across four production environments, with services like HES, MDMS and WFM, backed
by RDS, ElastiCache and Kafka (MSK).

My focus is observability and reliability: Zabbix, Prometheus/Alertmanager, Grafana
and Loki, SLA dashboards and reports, and alert routing to Microsoft Teams. For
example, I built a zero-cost Teams alerting path with Lambda relays when our planned
on-call tool became unavailable, and I found and fixed a bug where new alert media types
had empty message templates, which had silently blocked alert delivery.

Now I want to grow into a full DevOps role - CI/CD, Terraform and Kubernetes
operations - and this role is a good fit because it combines that with production
ownership.
```

:::say
Keep it to about 90 seconds: current role and platform, two proof points with results, and why you want this specific role. End on something that invites a follow-up question you are ready for.
:::

## What are your daily responsibilities as a DevOps engineer?

<!-- source: 09 Q2 -->

*Also asked as:* Hiring-manager round - describe your day-to-day responsibilities. What are your daily tasks?

:::note In simple words
They want to see that your day is about keeping production healthy and improving it, not just doing tickets. Show a rhythm: check health, fix issues, improve something, communicate.
:::

Structure it as a routine:
- **Morning health check** - review overnight alerts, SLA dashboards, daily health reports for all environments.
- **Incident and alert handling** - triage alerts, find root cause, fix or escalate, and verify that alerts actually reach the Teams channels.
- **Monitoring improvements** - new dashboards, alert rules, thresholds, reducing noise, segregating alerts by category.
- **Automation** - scheduled Lambda reports, health probes, scripts that remove manual checks.
- **Reporting** - daily and monthly SLA reports with downtime and root causes.
- **Tickets and collaboration** - Jira stories and subtasks, working with developers and the platform team.
- **Cost and hygiene** - finding orphaned volumes, unused buckets, over-sized resources.

**Example:** Sample answer - adapt to your own words:
```
My day starts with checking overnight alerts and the daily health reports for our
four environments. Then I handle any open incidents - for example a disk or memory
alert on a monitoring server. The rest of the day is improvement work from Jira:
building or fixing alert rules, Grafana dashboards, automation for reports, and
preparing SLA reports that explain every minute of downtime with a root cause.
```

:::say
Describe a routine - health checks, incident handling, improvement work, automation and reporting - with one real example for each. Interviewers remember the example, not the list.
:::

## Walk me through your current project architecture and your role in it.

<!-- source: 09 Q3 -->

:::note In simple words
They want to see if you understand the whole system, not only your piece. Draw it from the user's request inward, then say which boxes you own.
:::

Explain in layers, high level, no internal IDs:
- **Business** - smart-metering platform for power utilities: meters send readings, the platform collects, stores, bills and manages field work.
- **Applications** - HES (Head End System: talks to meters, collects data), MDMS (Meter Data Management: validates, stores, processes readings), WFM (Workforce Management: field jobs), running as microservices on **Amazon EKS**.
- **Data layer** - Amazon RDS (PostgreSQL) for databases, ElastiCache (Redis) for caching/sessions, Amazon MSK (Kafka) for streaming meter events. One environment runs self-managed PostgreSQL/Redis/Kafka on EC2.
- **Environments** - four production environments for different utility projects, each in its own AWS account or setup.
- **Monitoring layers** - Zabbix for host, service and SLA monitoring; Prometheus + Alertmanager inside the clusters; Loki for logs; Grafana dashboards; CloudWatch alarms for AWS services; alerts delivered to Microsoft Teams channels.

**Example:**
```
Meters -> HES (EKS) -> Kafka (MSK) -> MDMS (EKS) -> RDS PostgreSQL
                           |                |
                        Redis cache      WFM / billing / APIs -> ALB -> users
Monitoring: Zabbix + Prometheus/Alertmanager + Loki + CloudWatch -> Grafana -> Teams
```
My role: I own the observability and alerting layer across all four environments - dashboards, alert rules, SLA reporting, report automation, health checks - and I am the first responder for monitoring and infrastructure alerts.

:::say
Walk from the meter to the user through HES, Kafka, MDMS and the databases, then describe the monitoring layer, and finish with a clear statement of what you own. Be ready to go one level deeper on any box you mention.
:::

## Which DevOps tools have you worked with in the last 2 years?

<!-- source: 09 Q4 -->

*Also asked as:* Which IaC tools have you used - Terraform, Ansible, Puppet? Tell me about your cloud project work.

:::note In simple words
They are checking depth, not the length of the list. Group tools by category and say honestly where you are hands-on versus learning.
:::

Group the answer:

| Category | Hands-on in work | Practising / learning |
| --- | --- | --- |
| Monitoring & logs | Zabbix, Prometheus, Alertmanager, Grafana (incl. API-built dashboards), Loki | OpenTelemetry, Tempo |
| Cloud (AWS) | EKS, EC2, Lambda, EventBridge, CloudWatch, SNS, RDS, ElastiCache, MSK, S3, IAM | Route 53, VPC design |
| Containers & K8s | kubectl for troubleshooting, reading pod logs/events | Helm, writing manifests |
| IaC & CI/CD | - | Terraform, Jenkins, GitHub Actions, Argo CD |
| Config management | - | Ansible (Puppet and Chef: concepts only) |
| Scripting & OS | Linux, Bash, cron/scheduled jobs | Ansible |
| Collaboration | Jira, Confluence, Git | - |

For the IaC question, be clear on the difference: Terraform provisions infrastructure (declarative, keeps state), while Ansible, Puppet and Chef configure servers (Ansible is agentless and push-based; Puppet uses agents and pulls). Then say honestly which ones you used in production and which in labs. For cloud project work, point to the AWS project in Q3.

Tip: never list a tool you cannot answer two follow-up questions on. If a tool is lab-only, say "I have used it in hands-on labs" - honesty builds more trust than a long list.

:::say
Answer by category, give one real example for your strongest tools, and clearly separate production experience from lab experience. That honesty makes your strong areas more believable.
:::

## Which AWS services are you proficient in, and how many have you worked with?

<!-- source: 09 Q5 -->

:::note In simple words
Nobody knows all 200+ AWS services. They want to hear the core ones you actually used, and what you did with them.
:::

Pick about 8-12 and attach a verb to each:
- **EKS / EC2** - run and troubleshoot workloads and monitoring servers.
- **Lambda + EventBridge** - scheduled daily health and SLA reports, alert relays, external health checks.
- **CloudWatch + SNS** - alarms for RDS, ElastiCache, MSK; routing alerts.
- **RDS, ElastiCache, MSK** - monitor health, disk, connections, lag.
- **IAM** - roles for Lambda and EC2 instead of access keys (for example replacing an IAM user with an instance role).
- **S3** - storage, lifecycle, cost cleanup.
- **VPC / Security Groups** - understanding connectivity when checks fail.

**Example:** Sample answer - adapt to your own words:
```
I have worked with around 12 AWS services. Day to day I use EKS, EC2, CloudWatch,
Lambda and EventBridge - for example our daily infrastructure reports are Lambda
functions on an EventBridge schedule that check nodes, RDS, Redis and MSK and post
to Teams. I also monitor RDS, ElastiCache and MSK, and I moved one monitoring server
from stored IAM user keys to an instance role for security.
```

:::say
Name a realistic number, then give real usage for the top four or five. Mentioning a security improvement like replacing access keys with IAM roles shows maturity.
:::

## What have you achieved in your career so far?

<!-- source: 09 Q6 -->

:::note In simple words
They want proof of impact, not a job description. Pick 3-4 achievements, and for each say the problem, what you did, and the result.
:::

Sample answer - adapt to your own words (short STAR for each):
1. **Zero-cost alerting that did not depend on a blocked tool** - S/T: the planned on-call tool became unavailable, so alert delivery was at risk. A: built Teams-direct alerting with small Lambda relays for CloudWatch alarms, and pointed Alertmanager's native Teams integration at the channels, with a backup of the old routes. R: alerts kept flowing across projects at no extra cost.
2. **Found and fixed a silent alert-delivery failure** - S/T: new category-based alert channels looked configured but alerts were not arriving. A: tested each channel with a real test message and found empty message templates (and some disabled channels). R: delivery restored and verified on all four environments. The same habit later caught a broken template on the API error alert contact points.
3. **Observability and cost audit** - S/T: logging, metrics and tracing were reviewed across five environments. A: documented each stack and found orphaned volumes, PVCs and frozen buckets. R: identified recurring monthly waste (on the order of tens of dollars per environment) for the owners to clean up, plus real gaps such as broken tracing.
4. **SLA dashboards and reporting across 4 projects** - A: built live Grafana SLA dashboards from the Zabbix SLA API and a daily and monthly SLA reporting routine that explains every minute of downtime with a specific root cause. R: management and clients get consistent, evidence-based availability numbers.
5. **Fixed the daily report automation** - S/T: the scheduled daily report Lambdas were posting the same report three times. A: traced it to automatic Lambda retries on long runs and fixed the retry setting, timeout and message pacing. R: one clean report per day.

:::say
Pick three or four achievements and give each one a problem, an action and a result. Reliability, cost savings and automation results are what interviewers remember.
:::

## How much experience do you have handling databases?

<!-- source: 09 Q7 -->

:::note In simple words
They want to know if you can keep a database healthy in production - monitoring, backups, failover, connections - not whether you are a DBA who tunes every query. Be honest about which one you are.
:::

Honest framing (adapt to your real experience): "I have operational and monitoring experience with databases, not DBA-level experience."
- **Engines I work around** - Amazon RDS PostgreSQL; self-managed PostgreSQL on EC2 in one environment; ElastiCache Redis; Kafka on Amazon MSK (and a self-managed Kafka).
- **Monitoring** - CPU, memory, free storage, connections, replica lag, disk alarms in CloudWatch and Zabbix; DB health probes that check the database is actually reachable and answering queries, not just that the host is up.
- **Incidents** - disk-usage alerts and threshold tuning (for example the MSK disk incident), and investigating DB-related downtime for SLA reports.
- **Backup and recovery concepts** - automated RDS backups and snapshots, point-in-time restore, Multi-AZ failover, read replicas for read scaling and how a replica can be promoted.
- **Basics I can do** - connect with `psql`, check active connections and long-running queries, check sizes.

**Example:**
```bash
psql -h $DB_HOST -U app -d appdb -c "select count(*) from pg_stat_activity;"
psql -h $DB_HOST -U app -d appdb -c "select pid, now()-query_start as age, state, query
  from pg_stat_activity where state <> 'idle' order by age desc limit 5;"
```

:::say
I have operational experience with databases from the DevOps side - RDS and self-managed PostgreSQL, Redis and Kafka - covering monitoring, alarms, health probes, backups and failover concepts, but I am not a DBA. I can check connections and slow queries and keep the database healthy and recoverable, and I work with the developers on schema and query tuning.
:::

## How do you use Linux in your DevOps work, and which distributions have you used?

<!-- source: 09 Q8 -->

*Also asked as:* How much Linux do you know? Which version of Linux do you use?

:::note In simple words
Linux is the ground every DevOps tool stands on. They want to hear that you are comfortable fixing a real server from the command line.
:::

- **Distributions** - mainly Ubuntu and Amazon Linux (RHEL family) on EC2; container base images like Alpine and Debian slim.
- **Daily use** - SSH into servers, check services with `systemctl`, read logs with `journalctl` and `tail`, check disk/memory/CPU (`df -h`, `du`, `free -m`, `top`), manage cron jobs, and edit configs.
- **Real troubleshooting** - disk filling up on a monitoring server, memory pressure from PHP-FPM worker counts, a hung OS causing a 504 on the web UI.

**Example:**
```bash
df -h                                   # which filesystem is full?
sudo du -xh / --max-depth=2 | sort -h | tail
sudo journalctl --disk-usage
sudo journalctl --vacuum-size=500M      # safely shrink old system journals
systemctl status mysqld zabbix-server
```
Sample answer: "When our Zabbix server disk hit about 91%, I found old systemd journals taking large space and reduced usage to about 82% with `journalctl --vacuum-size`, then flagged a large stale data folder for a decision instead of deleting it blindly."

:::say
Name the distributions you use, the everyday commands, and one real Linux incident you solved. Emphasize that you check before deleting anything on a production server.
:::

## Can you describe the CI/CD workflow in your project?

<!-- source: 09 Q9 -->

*Also asked as:* How do you handle the continuous delivery (CD) aspect in your projects?

:::note In simple words
They want the journey of a code change from a developer's laptop to production, and your part in it. If your role is not the pipeline owner, say so honestly and describe how you support and monitor it.
:::

Describe the flow clearly (a typical EKS flow - confirm it matches your project before saying it):
1. Developer pushes to Git -> pull request with review.
2. CI (e.g. Jenkins / GitHub Actions) builds, runs tests and code scans, builds the Docker image, tags it with the commit SHA, pushes to Amazon ECR.
3. CD updates the Helm values or manifest with the new tag; deploys to staging first, then to production after approval (via Helm or GitOps with Argo CD).
4. Kubernetes does a rolling update; readiness probes gate traffic.
5. Monitoring after deploy - error rate, latency, pod restarts; rollback with `helm rollback` or `kubectl rollout undo` if needed.

**Example:** Honest framing - adapt to your own words:
```
In my project the platform team owns the build pipeline, and my part is the
production side: after a deployment, our monitoring shows whether services and SLAs
are healthy, and alerts reach Teams if something breaks. I have also built pipelines
myself in hands-on labs - Jenkins building a Docker image, pushing to ECR and
deploying to Kubernetes with Helm - so I understand each stage end to end.
```

:::say
Walk through code -> build -> test -> image -> registry -> staging -> approval -> production -> monitoring -> rollback, and be precise about which parts you personally own. Honest scoping plus lab experience is far safer than claiming a pipeline you cannot explain in depth.
:::
