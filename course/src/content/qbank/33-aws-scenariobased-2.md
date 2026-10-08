---
track: qbank
title: "AWS: Scenario-based questions (part 2 of 2)"
short: Aws scenario 2
sub: 15 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## NAT Gateway costs doubled in 24 hours during a live event, with no infrastructure changes. What could be causing it?

<!-- source: 06 Q67 -->

:::note In simple words
The toll bridge bill doubled although you built no new roads. Something started driving over the bridge a lot more: find which car is making all the trips.
:::

NAT charges per GB processed, so something is sending much more data **through** it.

**Likely silent causes:**
- **Image pulls:** pods CrashLooping or nodes churning (Spot, autoscaling for the event) pulling large images from ECR/Docker Hub via NAT again and again.
- **S3/DynamoDB traffic via NAT** because there is no gateway endpoint (event traffic = more S3 reads/writes).
- **Logs and metrics shipping** to CloudWatch or a SaaS (debug logging enabled, traffic spike = more log volume).
- **Retry storms** to an external API or a dependency that is timing out.
- **Cross-AZ:** instances using a NAT in another AZ (extra inter-AZ charges).
- **Scaling itself:** more pods/nodes = more outbound calls (third-party CDN/DRM/analytics calls per viewer).
- Security: compromised instance exfiltrating data or mining crypto.

**How to find it:**
1. Cost Explorer: usage type `NatGateway-Bytes` by day/hour.
2. CloudWatch NAT metrics `BytesOutToDestination`, `BytesInFromDestination` per NAT.
3. **VPC Flow Logs** on the NAT ENI + Athena: top source IPs and destinations.

**Fix:** S3/DynamoDB gateway endpoints, ECR/CloudWatch interface endpoints, pull-through cache, fix crashloops, reduce log verbosity, NAT per AZ.

**Example:**
```
SELECT srcaddr, dstaddr, sum(bytes)/1024/1024/1024 AS gb
FROM vpc_flow_logs
WHERE interface_id = 'eni-0natgw' AND start > to_unixtime(now() - interval '24' hour)
GROUP BY srcaddr, dstaddr ORDER BY gb DESC LIMIT 20;
```

:::say
NAT bills per GB, so I look for what started pushing more data through it, such as repeated image pulls from crashlooping pods or node churn, S3 traffic without a gateway endpoint, log shipping or retry storms. I confirm with NAT CloudWatch metrics and VPC Flow Logs in Athena, then fix with VPC endpoints, fixing the crashloops and reducing log volume.
:::

## Your team sees a spike in cloud costs. How do you find out why and cut costs without hurting performance?

<!-- source: 06 Q68 -->

*Also asked as:* You suddenly see a 5x spike in cloud billing and the infra looks fine. Where do you look first, and how do you trace the bleed? Your monthly AWS bill increased unexpectedly - what tools and reports do you use? / Reduce cloud cost by 40% without impacting performance. Where do you start?

:::note In simple words
Your electricity bill jumped 5x. Check the meter room by room (service), then appliance by appliance (usage type, resource), and ask who plugged in something new. Then switch off the waste, not the fridge.
:::

**Tools and reports at a glance:** Billing console Bills page (charges per service and region), Cost Explorer (filters, grouping, rightsizing recommendations), Cost Anomaly Detection, AWS Budgets, Cost and Usage Report (CUR) queried with Athena, Trusted Advisor cost checks, Compute Optimizer, and CloudTrail for who created what.

**Trace the bleed (top-down):**
1. **Cost Explorer** with **hourly/daily granularity**: group by **service -> usage type -> resource**, and by linked account, region and tag. Find when it started.
2. **Cost Anomaly Detection** alerts usually point straight at the service and account.
3. **CUR (Cost and Usage Report) + Athena** for resource-level lines when Cost Explorer is not detailed enough.
4. **CloudTrail:** who created what (`RunInstances`, `CreateNatGateway`), especially in **regions you never use**. Compromised access keys launching **GPU crypto-mining instances** is a classic 5x cause: check all regions, disable the keys, terminate, open an AWS support case.

**Usual silent culprits:**
- **Data transfer:** NAT processing, cross-AZ traffic, internet egress.
- **Log ingestion:** CloudWatch `PutLogEvents` from someone leaving **debug logging** on.
- **S3 request costs:** a job doing millions of LIST/GET calls, or lifecycle transitions of tiny objects.
- **Lambda recursion loops** (Lambda writes to S3 which triggers the same Lambda); AWS now detects some loops, but check invocations.
- Forgotten large instances, unattached EBS, snapshots, idle load balancers, provisioned IOPS.

**Cut without hurting performance:** rightsizing from real p95 usage (Compute Optimizer), Savings Plans for baseline, Spot for stateless, Graviton, VPC endpoints, log levels and retention, S3 lifecycle/Intelligent-Tiering, schedule non-prod. Change one thing at a time and watch latency/error SLOs.

**Prevent:** AWS Budgets with alerts at 80/100 percent, anomaly detection subscriptions, tagging policy, SCPs denying unused regions.

**Example:**
```bash
aws ce get-cost-and-usage --time-period Start=2026-09-20,End=2026-09-24 \
  --granularity DAILY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE

for r in $(aws ec2 describe-regions --query "Regions[].RegionName" --output text); do
  echo "$r: $(aws ec2 describe-instances --region $r \
    --query 'length(Reservations[].Instances[])')"
done
```

**A 40% reduction target, in order of impact:**

1. **Visibility first:** cost allocation tags, Cost Explorer by service, account and tag, and the top 10 line items. Usually 3-4 items are most of the bill.
2. **Remove waste:** idle or unattached EBS volumes, old snapshots, unused Elastic IPs, idle load balancers, forgotten dev environments. Schedule non-prod to stop at night and on weekends (about 65% off those hours).
3. **Rightsize:** Compute Optimizer and CloudWatch data, over-provisioned instances and RDS, K8s requests vs actual usage, and move to Graviton where possible.
4. **Pricing models:** Savings Plans or RIs for the steady baseline, Spot for stateless, batch and CI workloads, and Karpenter consolidation.
5. **Data transfer and NAT:** VPC endpoints for S3 and ECR, keep traffic in the same AZ, and use CloudFront.
6. **Storage tiering:** S3 lifecycle to IA or Glacier, gp2 to gp3, and log retention limits.
7. **Guard performance:** agree SLOs (p95 latency, error rate) first, change in small steps, compare before and after, and keep budgets and anomaly alerts so costs don't creep back.

:::say
I break the bill down in Cost Explorer by service, usage type and resource at hourly granularity, check Cost Anomaly Detection and CUR in Athena, and use CloudTrail to see who created what, including in unused regions where compromised keys may be mining crypto. Common silent culprits are NAT and data transfer, debug log ingestion, S3 requests and Lambda loops; I cut waste with rightsizing, Savings Plans, Spot and endpoints while watching SLOs, and prevent repeats with budgets and anomaly alerts.
:::

## How would you handle a sudden traffic spike from 10K to 200K users?

<!-- source: 06 Q69 -->

:::note In simple words
Twenty times more guests are coming. Serve snacks at the door (cache), open more counters (autoscale), queue orders instead of dropping them, and turn away only the extras politely if you must.
:::

**If you know in advance (event, sale):**
1. **Load test** at 1.5-2x the expected peak.
2. **Pre-scale:** scheduled scaling / raise min capacity, warm pools; pre-provision Lambda concurrency, DynamoDB capacity; check **service quotas** early (vCPU, Lambda concurrency, API Gateway).
3. For very sudden huge jumps, ALB scales automatically but you can use **LCU capacity reservation**; NLB and CloudFront handle bursts well.

**Architecture for the spike:**
- **CloudFront** caching for static and cacheable API responses (biggest win).
- **Stateless app tier** autoscaling on requests per target; EKS with Karpenter for fast nodes.
- **Database protection:** read replicas, ElastiCache, RDS Proxy; Aurora auto-scaling replicas.
- **Queues (SQS/Kafka)** to absorb writes asynchronously.
- **Rate limiting** (WAF, API Gateway) and **graceful degradation**: turn off non-critical features with feature flags.
- Dashboards and alarms on latency/errors; a war room during the event.

**Example:**
```text
aws autoscaling put-scheduled-update-group-action --auto-scaling-group-name web-asg \
  --scheduled-action-name sale-prewarm --start-time 2026-10-02T12:30:00Z \
  --min-size 40 --max-size 200 --desired-capacity 60

User -> CloudFront (80% cache hit) -> WAF rate limit -> ALB -> ASG/EKS (autoscale)
                                                      -> ElastiCache -> RDS + replicas
                                                      -> SQS -> workers (async writes)
```

:::say
For a planned spike I load test, check quotas and pre-scale with scheduled actions, then rely on CloudFront caching, a stateless autoscaling tier, caches and read replicas to protect the database, and queues for writes. I add rate limiting and feature flags for graceful degradation and watch latency and error dashboards throughout.
:::

## How do you design a fault-tolerant system that keeps running when one Availability Zone is down?

<!-- source: 06 Q70 -->

:::note In simple words
Keep three kitchens in three buildings, each able to handle the load if one burns down, and do not keep the only recipe book in one of them.
:::

- **Spread everything across 3 AZs:** ALB subnets, ASG/EKS nodes, ECS tasks, MSK brokers, ElastiCache replicas.
- **Static stability:** run enough capacity so 2 AZs can carry 100 percent of load without needing to launch anything during the failure (for example 3 AZs x 50 percent). Scaling during an AZ event may be slow or impossible.
- **Data:** RDS/Aurora Multi-AZ, S3 (regional, multi-AZ by default), DynamoDB (multi-AZ by default), EFS regional.
- **NAT Gateway per AZ** with per-AZ route tables.
- **Health checks** remove bad targets; ALB cross-zone load balancing on.
- **Kubernetes:** topology spread constraints across zones, PodDisruptionBudgets, zone-aware storage (EBS is zonal: use StatefulSets with a replica per AZ).
- **Avoid single-AZ dependencies:** one EC2 cron server, a single Redis node, a self-managed DB in one AZ.
- **Test:** use **ARC zonal shift** or FIS to simulate an AZ failure.

**Example:**
```
            ALB (AZ-a, AZ-b, AZ-c)
       /            |            \
  AZ-a: 3 nodes  AZ-b: 3 nodes  AZ-c: 3 nodes   (2 AZs alone = 100% load)
  NAT-a          NAT-b          NAT-c
  Aurora writer  Aurora reader  Aurora reader   (auto failover)

aws arc-zonal-shift start-zonal-shift --resource-identifier <alb-arn> \
  --away-from aps1-az1 --expires-in 1h --comment "AZ failure drill"
```

:::say
I deploy every tier across three AZs with per-AZ NAT, Multi-AZ databases and topology spread for pods, and I keep enough capacity that two AZs can carry full load without scaling during the failure, which is static stability. I remove single-AZ dependencies and regularly test with ARC zonal shift or Fault Injection Service.
:::

## You are asked to migrate workloads from on-premises to AWS with zero downtime. How would you approach it?

<!-- source: 06 Q71 -->

:::note In simple words
Move house without ever leaving the family homeless: build the new house, keep both homes synced, move people one room at a time, and keep the old house ready in case the new one leaks.
:::

1. **Discover and plan:** inventory apps and dependencies (Migration Hub / Application Discovery Service), pick a strategy per app (rehost, replatform, refactor), define success criteria and rollback.
2. **Connectivity:** Site-to-Site VPN or Direct Connect, hybrid DNS with Route 53 Resolver.
3. **Build the landing zone** with IaC: accounts, VPCs, IAM, monitoring.
4. **Replicate continuously:**
   - Servers: **AWS Application Migration Service (MGN)** block-level continuous replication.
   - Databases: **DMS full load + CDC** (or native replication) so AWS stays in sync.
   - Files: DataSync.
5. **Test** the AWS copy with non-disruptive test launches and load tests.
6. **Cutover gradually:** lower DNS TTL days before, shift traffic with Route 53 **weighted records** (1 -> 10 -> 50 -> 100 percent), keep the database single-writer at any moment.
7. **Rollback plan:** keep on-prem running and reverse replication until stable.
8. **Decommission** after a hypercare period.

**Example:**
```
Day -7 : Route 53 TTL 3600 -> 60
Day  0 : MGN + DMS CDC in sync, test instances pass
Day  1 : weight on-prem 90 / AWS 10  (read-only traffic first)
Day  3 : DB cutover in low traffic window (stop writes 1-2 min, CDC catch-up, switch)
Day  4 : weight 0 / 100, reverse replication to on-prem kept for rollback
Day 30 : decommission on-prem
```

:::say
I set up hybrid connectivity and the AWS landing zone with IaC, then replicate continuously with Application Migration Service for servers and DMS CDC for databases. After testing, I shift traffic gradually using low-TTL weighted Route 53 records, keep the database single-writer during a short cutover, and keep on-prem running with reverse replication for rollback.
:::

## What strategies do you use for database migration with zero downtime?

<!-- source: 06 Q72 -->

*Also asked as:* How do you handle zero-downtime database migrations in a distributed application? How do you migrate an RDS database with minimal downtime?

:::note In simple words
Build a new road next to the old one, let cars use both for a while, then close the old road only when everyone is on the new one.
:::

**Moving to a new database/engine/version:**
- **DMS full load + CDC:** copy existing data, then stream ongoing changes until cutover; validate with DMS data validation.
- **RDS Blue/Green Deployments:** RDS creates a synced green copy (for upgrades or parameter changes); switchover typically takes under a minute and keeps endpoint names.
- **Native replication** (logical replication for PostgreSQL, binlog replication for MySQL).
- Cutover: stop writes briefly, confirm lag = 0, switch the endpoint (RDS Proxy / DNS / secret), keep the old DB for rollback.
- A common wrong answer is "enable Multi-AZ". Multi-AZ gives high availability (a standby for failover) inside the same database; it does not move data to a new instance, engine, version or account, so it is not a migration method.

**Schema changes in a live app (expand-contract):**
1. **Expand:** add new column/table (nullable, no locks); deploy code writing to both old and new.
2. **Backfill** data in small batches.
3. Switch reads to the new structure.
4. **Contract:** remove the old column in a later release.
- Never rename or drop in the same release; use online tools (`gh-ost`, `pg_repack`, `CREATE INDEX CONCURRENTLY`).
- Migrations run in CI/CD as a separate, versioned step (Flyway/Liquibase) and must be backward-compatible.

**Example:**
```text
aws rds create-blue-green-deployment --blue-green-deployment-name orders-pg16 \
  --source arn:aws:rds:ap-south-1:111111111111:db:orders-prod \
  --target-engine-version 16.4
aws rds switchover-blue-green-deployment \
  --blue-green-deployment-identifier bgd-abc123 --switchover-timeout 300

-- expand step (PostgreSQL)
ALTER TABLE users ADD COLUMN email_verified boolean;
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

:::say
For moving databases I use DMS full load plus CDC or native replication, or RDS Blue/Green Deployments for upgrades, cutting over when lag is zero and keeping the old database for rollback. For schema changes I follow expand-contract with backward-compatible, versioned migrations so old and new app versions work at the same time.
:::

## You must ship multi-region failover for live events in 2 weeks, and DNS-based routing is not allowed. What is your plan?

<!-- source: 06 Q73 -->

:::note In simple words
Give users one permanent phone number that rings in two cities. If one office stops answering, the phone system rings the other one automatically, without printing a new phone book.
:::

**Traffic layer (no DNS changes):**
- **AWS Global Accelerator:** two static anycast IPs; endpoint groups in two regions (ALB/NLB) with health checks; failover in seconds; traffic dials to shift load.
- For HTTP content, **CloudFront origin groups** give origin failover (for GET/HEAD/OPTIONS requests).

**2-week plan:**
1. **Days 1-2:** agree RTO/RPO, scope only the critical live path (playback/API), pick the secondary region.
2. **Days 3-6:** deploy the same IaC stack in region 2 (warm standby, pre-scaled for the event); replicate images (ECR replication), secrets and config.
3. **Days 5-8:** data: Aurora Global Database / DynamoDB Global Tables / S3 CRR; for live streams, ingest to both regions.
4. **Days 7-9:** Global Accelerator with health checks, traffic dials 100/0.
5. **Days 10-12:** failover drills, load tests in region 2, runbook with clear decision owner.
6. **Days 13-14:** freeze, dashboards, war room.

**Example:**
```
Clients -> Global Accelerator (static IPs 75.2.x.x, 99.83.x.x)
             |-- endpoint group ap-south-1     dial 100%  (ALB, health check /healthz)
             +-- endpoint group ap-southeast-1 dial 0%    (warm, pre-scaled)

aws globalaccelerator update-endpoint-group --endpoint-group-arn <arn-primary> \
  --traffic-dial-percentage 0      # manual failover drill
```

:::say
I would use Global Accelerator, whose static anycast IPs route to healthy regional endpoints and fail over in seconds without any DNS change, with CloudFront origin groups for cacheable content. In two weeks I would scope only the critical path, deploy a warm, pre-scaled copy via IaC in the second region, replicate data with global databases, and spend the final days on failover drills and a clear runbook.
:::

## Application latency suddenly increased. The app runs in a private subnet behind a NAT Gateway. How do you investigate?

<!-- source: 06 Q74 -->

:::note In simple words
If every trip out of the building goes through one exit gate, a jam at that gate slows everyone. First check whether the slowness is really on trips going out, then check the gate.
:::

1. **Is it outbound?** Traces (X-Ray/OTel) or app timing: is the slow span a call to an external API, AWS API or S3 through the NAT, or is it internal (DB, CPU)? If internal, NAT is not the issue.
2. **NAT Gateway CloudWatch metrics:**
   - `ErrorPortAllocation` > 0: NAT ran out of source ports. A NAT supports about **55,000 simultaneous connections to each unique destination** (IP + port + protocol); fix by adding secondary private IPs to the NAT, spreading destinations, or reusing connections.
   - `PacketsDropCount`: drops at the NAT.
   - `ActiveConnectionCount`, `ConnectionAttemptCount` vs `ConnectionEstablishedCount`, `IdleTimeoutCount`.
   - `BytesOutToDestination`: a sudden traffic jump (bandwidth scales up to 100 Gbps but bursts can queue).
3. **Cross-AZ NAT:** instances in AZ-b using a NAT in AZ-a add latency and cost; use one NAT per AZ with per-AZ route tables.
4. **Skip the NAT for AWS services:** S3/DynamoDB gateway endpoints, interface endpoints for STS, Secrets Manager, ECR, CloudWatch.
5. **Connection behaviour:** no keep-alive, a new TLS handshake per request, connection pool too small, idle connections dropped after 350 seconds of NAT idle timeout causing retries.
6. **The destination itself:** third-party API slow or rate limiting (429s), their region/latency, test from another network.
7. **DNS:** slow or failing lookups (Route 53 Resolver limits, missing caching).

**Example:**
```bash
aws cloudwatch get-metric-statistics --namespace AWS/NATGateway \
  --metric-name ErrorPortAllocation --dimensions Name=NatGatewayId,Value=nat-0abc \
  --start-time 2026-09-24T08:00:00Z --end-time 2026-09-24T10:00:00Z \
  --period 60 --statistics Sum

aws ec2 assign-private-nat-gateway-address --nat-gateway-id nat-0abc \
  --private-ip-address-count 2          # more IPs = more ports per destination
```

:::say
I first confirm with traces that the slow part is outbound traffic through the NAT, then check NAT metrics like ErrorPortAllocation for port exhaustion, PacketsDropCount and connection counts, plus cross-AZ NAT usage. Fixes include VPC endpoints so AWS traffic skips the NAT, connection reuse and keep-alive, extra NAT IPs, one NAT per AZ, and checking whether the third-party endpoint itself is slow.
:::

## How would you expose a backend API securely through CloudFront and WAF, allowing only a certain IP range?

<!-- source: 06 Q75 -->

:::note In simple words
Put a guarded gate (CloudFront + WAF) in front with a guest list (IP set), and wall off the back door (origin) so the only way in is through that gate.
:::

**Edge (CloudFront + WAF):**
1. Create an **IP set** with the allowed CIDRs.
2. **Web ACL** (scope CLOUDFRONT, created in us-east-1) with **default action Block** and a rule **Allow if source IP in IP set**.
3. Add AWS **managed rule groups** (Core rule set, Known bad inputs, SQLi) and a **rate-based rule**, evaluated before the allow rule so allowed IPs still get inspected.
4. Attach the web ACL to the distribution; HTTPS only with an ACM certificate.

**Lock the origin so nobody bypasses CloudFront:**
- Best: **CloudFront VPC origins** pointing to an **internal ALB** in private subnets (no public exposure at all).
- Or public ALB with its security group allowing only the **CloudFront managed prefix list** (`com.amazonaws.global.cloudfront.origin-facing`), plus a **secret custom header** added by CloudFront and checked by an ALB listener rule (others get 403). Rotate the header value via Secrets Manager.
- For S3 origins use **OAC**.

**Also:** TLS end to end (CloudFront -> ALB on HTTPS), disable caching for the API or cache only safe GETs, forward only needed headers, and enable **WAF logs, CloudFront logs and ALB access logs**.

**Example:**
```text
aws wafv2 create-ip-set --name partner-ips --scope CLOUDFRONT --region us-east-1 \
  --ip-address-version IPV4 --addresses 203.0.113.0/24 198.51.100.10/32

# ALB listener rule: forward only if the secret header matches, else fixed 403
aws elbv2 create-rule --listener-arn <listener-arn> --priority 1 \
  --conditions '[{"Field":"http-header","HttpHeaderConfig":
     {"HttpHeaderName":"X-Origin-Verify","Values":["<secret-value>"]}}]' \
  --actions Type=forward,TargetGroupArn=<tg-arn>
```

:::say
I attach a WAF web ACL to CloudFront with an IP set allow rule, a default block action, managed rule groups and rate limiting. Then I lock the origin using CloudFront VPC origins to a private ALB, or the CloudFront managed prefix list in the ALB security group plus a secret header checked by a listener rule, with TLS end to end and WAF, CloudFront and ALB logging.
:::

## CloudWatch alerts are firing for Lambda timeout errors. How do you debug?

<!-- source: 06 Q76 -->

:::note In simple words
The worker keeps running out of time. Find out whether he is waiting for someone else (a slow call), stuck at a locked door (network), or just too slow for the job (not enough memory/CPU).
:::

1. **Compare `Duration` with the configured timeout:** are invocations hitting the limit exactly (hung) or slowly rising (growing load/data)?
2. **Logs Insights:** search `Task timed out after` and see which requests or inputs time out; look at the `REPORT` lines for init duration and memory used.
3. **X-Ray traces** show which downstream call (DB, HTTP API, S3) consumes the time.
4. **VPC Lambda without internet path:** a function in private subnets with no NAT or VPC endpoint **hangs** on AWS API calls (Secrets Manager, S3, SQS) until the timeout. Add endpoints or a NAT.
5. **Cold starts/init:** heavy init code, large packages; use provisioned concurrency or SnapStart where supported.
6. **Memory:** more memory also means more CPU; check `Max Memory Used` and try higher memory.
7. **Database connections:** exhausted connections make calls wait; use **RDS Proxy** and reuse connections outside the handler.
8. **SDK and HTTP client timeouts/retries** must be **shorter than the Lambda timeout**, or retries silently eat the whole budget.
9. **Throttles and concurrency:** `Throttles` metric, reserved concurrency, downstream rate limits.
10. **SQS triggers:** the queue **visibility timeout** should be at least 6x the function timeout, otherwise messages reappear and are processed twice.

**Example:**
```
fields @timestamp, @requestId, @message
| filter @message like /Task timed out/
| stats count(*) as timeouts by bin(5m)

fields @timestamp, @duration, @maxMemoryUsed, @initDuration
| filter @type = "REPORT"
| sort @duration desc | limit 20
```

:::say
I compare Duration against the timeout, search Logs Insights for Task timed out and use X-Ray to find the slow downstream call. Common causes are a VPC Lambda with no NAT or endpoint hanging on AWS APIs, cold starts, too little memory, exhausted DB connections, SDK timeouts longer than the Lambda timeout, throttling, and an SQS visibility timeout that is too short.
:::

## You want to auto-remediate high CPU on EC2 by rebooting it through Lambda. What is the logic?

<!-- source: 06 Q77 -->

:::note In simple words
Rebooting is like turning a laptop off and on: it often works, but you learn nothing about why it was slow. Take a quick photo of the problem first, and never let the robot reboot the same machine in an endless loop.
:::

**First, you may not need Lambda:** a CloudWatch alarm can reboot natively using the EC2 **reboot alarm action** (`arn:aws:automate:<region>:ec2:reboot`).

**If you need logic (allowlists, diagnostics, notifications), the Lambda flow is:**
1. CloudWatch alarm (CPU > 95 percent for 10 minutes) -> **EventBridge** "Alarm State Change" rule (or SNS) -> Lambda.
2. **Parse the instance ID** from the alarm dimensions.
3. **Guardrails:** only act on instances tagged `auto-remediate=true`; skip databases and stateful nodes; enforce a **cooldown** (for example no second reboot within 30 minutes, tracked in a tag or DynamoDB) to avoid reboot loops.
4. **Capture diagnostics** first with **SSM Run Command** (`top`, `ps`, logs) saved to S3.
5. Call **RebootInstances**.
6. **Notify** Teams/Slack with instance, time and diagnostics link; escalate if it happens again.
7. **IAM least privilege:** `ec2:RebootInstances` only on tagged instances, `ssm:SendCommand`, `ec2:CreateTags`.

Warning: rebooting **hides the root cause**. Use it as a temporary safety net and still do RCA (memory leak, runaway cron, traffic).

**Example (the decision steps as CLI):**
```
ID=i-0abc123def4567890
TAG=$(aws ec2 describe-tags --filters Name=resource-id,Values=$ID \
  Name=key,Values=auto-remediate --query "Tags[0].Value" --output text)
[ "$TAG" != "true" ] && echo "not allowlisted, notify only" && exit 0

LAST=$(aws ec2 describe-tags --filters Name=resource-id,Values=$ID \
  Name=key,Values=last-auto-reboot --query "Tags[0].Value" --output text)
# if LAST is within 30 minutes -> skip reboot and escalate to on-call

aws ssm send-command --instance-ids $ID --document-name AWS-RunShellScript \
  --parameters 'commands=["top -b -n1 | head -30","ps aux --sort=-%cpu | head"]' \
  --output-s3-bucket-name ops-diagnostics
aws ec2 reboot-instances --instance-ids $ID
aws ec2 create-tags --resources $ID --tags Key=last-auto-reboot,Value=$(date -u +%s)
```

:::say
If a plain reboot is enough, a CloudWatch alarm can reboot the instance natively without Lambda. With Lambda, the alarm goes through EventBridge, the function checks an allowlist tag and a cooldown to avoid reboot loops, captures diagnostics with SSM Run Command, reboots, and notifies the team, while I still do the RCA because a reboot only hides the cause.
:::

## An automation job that starts and stops EMR clusters suddenly fails with IAM errors. How do you debug and fix it?

<!-- source: 06 Q78 -->

:::note In simple words
The robot's key stopped opening the door. Read exactly which door refused it, check which key the robot is actually carrying, and see who changed the lock.
:::

1. **Read the exact error:** which **action** and **resource** were denied, and whether the message says **explicit deny**, **service control policy** or **permissions boundary** (newer AccessDenied messages include this).
2. **Who am I?** `aws sts get-caller-identity` from the job's environment. The job may now run as a different role (profile changed, instance role replaced, expired or rotated keys, assume-role failing).
3. **CloudTrail:** filter by `errorCode = AccessDenied` / `UnauthorizedOperation` for the exact event and principal.
4. **Encoded messages:** decode with `aws sts decode-authorization-message`.
5. **IAM Policy Simulator** for the role against `elasticmapreduce:RunJobFlow`, `TerminateJobFlows`, and so on.
6. **Classic EMR gap: `iam:PassRole`.** Starting a cluster passes the EMR service role and the EC2 instance profile role; the caller needs `iam:PassRole` on those role ARNs.
7. **What changed?** CloudTrail for `PutRolePolicy`, `DetachRolePolicy`, SCP updates, new permission boundaries, tag-based conditions (cluster tags missing), KMS key policy changes for encrypted clusters.
8. **Fix** with the smallest least-privilege change, test with the simulator, commit it to IaC so it does not drift again, and add an alarm on repeated failures.

**Example:**
```bash
aws sts get-caller-identity
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111111111111:role/emr-scheduler \
  --action-names elasticmapreduce:RunJobFlow iam:PassRole \
  --resource-arns "*"
```
```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": [
    "arn:aws:iam::111111111111:role/EMR_DefaultRole",
    "arn:aws:iam::111111111111:role/EMR_EC2_DefaultRole"
  ]
}
```

:::say
I read the exact denied action, resource and whether an explicit deny, SCP or boundary is involved, confirm the job's identity with sts get-caller-identity, and find the event in CloudTrail and test in the Policy Simulator. For EMR the usual gap is iam:PassRole on the service and instance-profile roles; I then check what changed, apply a least-privilege fix and commit it to IaC.
:::

## An EMR cluster runs 24x7 but is used only 4 hours a day. What automation do you implement?

<!-- source: 06 Q79 -->

:::note In simple words
Do not keep a bus running all day for a 4-hour route. Call a bus when passengers arrive and send it home when the trip ends.
:::

1. **Transient clusters:** launch a cluster per job run, submit steps, and **auto-terminate after the last step**. Orchestrate with **Step Functions**, Airflow (MWAA), or **EventBridge Scheduler**.
2. **Auto-termination policy:** for interactive clusters, terminate after an **idle timeout** (for example 1 hour).
3. **Keep data in S3** (EMRFS), not HDFS, so clusters are disposable; keep the Hive/Glue Data Catalog external.
4. **EMR managed scaling:** set min/max units so the cluster shrinks when idle.
5. **Spot for task nodes** (and instance fleets with several instance types); On-Demand only for the primary/core nodes.
6. **EMR Serverless:** pay only while the job runs; no cluster to manage at all.
7. **Graviton instances** and right-sizing; tag and track cost per job.

Savings: roughly 20 hours a day of idle cost (about 80 percent) disappear, before Spot savings.

**Example:**
```bash
aws emr create-cluster --name nightly-etl --release-label emr-7.2.0 \
  --applications Name=Spark --use-default-roles \
  --instance-groups InstanceGroupType=MASTER,InstanceCount=1,InstanceType=m7g.xlarge \
    InstanceGroupType=CORE,InstanceCount=2,InstanceType=r7g.2xlarge \
    InstanceGroupType=TASK,InstanceCount=4,InstanceType=r7g.2xlarge,BidPrice=OnDemandPrice \
  --steps Type=Spark,Name=etl,ActionOnFailure=TERMINATE_CLUSTER,Args=[s3://jobs/etl.jar] \
  --auto-terminate

aws emr put-auto-termination-policy --cluster-id j-ABC123 \
  --auto-termination-policy IdleTimeout=3600
```

:::say
I would switch to transient clusters started per job by Step Functions or EventBridge Scheduler that auto-terminate after their steps, keep data in S3 so clusters are disposable, and add an idle auto-termination policy for any interactive cluster. Managed scaling, Spot task nodes and possibly EMR Serverless cut cost further, removing about 80 percent of the idle spend.
:::

## How do you identify underutilized EC2 instances across multiple AWS accounts?

<!-- source: 06 Q80 -->

:::note In simple words
Walk through every office in the company with one checklist and find the computers that are switched on but nobody really uses.
:::

**Find them (organization-wide):**
1. **AWS Compute Optimizer** enabled at the **organization level** (management or delegated admin account): rightsizing recommendations for EC2, ASGs, EBS, Lambda across all accounts. Install the **CloudWatch agent** so it also uses memory metrics.
2. **Cost Explorer rightsizing recommendations** (from the management account) show savings in money.
3. **Trusted Advisor** "Low Utilization Amazon EC2 Instances" check (needs Business support or higher), viewable across the org.
4. **CloudWatch cross-account observability:** one monitoring account with dashboards of CPU, network and memory for all accounts (for example p95 CPU < 10 percent for 14 days).
5. **Tag hygiene:** owner, env and cost-center tags so each finding goes to the right team; untagged resources are reported.

**Act:**
- **Rightsize** (smaller type or Graviton), **stop or schedule** idle dev/test instances, terminate orphans after owner confirmation.
- Move steady baseline to **Savings Plans** after rightsizing (not before).
- Repeat monthly; track savings.

**Example:**
```bash
aws compute-optimizer update-enrollment-status --status Active --include-member-accounts

aws compute-optimizer get-ec2-instance-recommendations \
  --filters name=Finding,values=Overprovisioned \
  --query "instanceRecommendations[].{acct:accountId,id:instanceArn,now:currentInstanceType,
  rec:recommendationOptions[0].instanceType}" --output table
```

:::say
I enable Compute Optimizer at the organization level with the CloudWatch agent for memory data, and combine it with Cost Explorer rightsizing, Trusted Advisor low-utilization checks and cross-account CloudWatch dashboards. Using owner tags, teams then rightsize, schedule or terminate the instances, and only after rightsizing do we buy Savings Plans for the baseline.
:::

## Some APIs behind API Gateway are unsecured. How would you secure them?

<!-- source: 06 Q81 -->

:::note In simple words
Some doors of the building have no lock. First walk around and list every unlocked door, then fit the right lock on each (ID check, badge, guest list), put a guard at the entrance, and install cameras.
:::

1. **Inventory:** list every route/method and find the ones with `authorizationType = NONE`. Also check for backend URLs (ALB, Lambda function URLs) reachable directly, bypassing API Gateway.
2. **Authentication per caller type:**
   - End users: **Cognito user pool authorizer** (REST) or **JWT authorizer** (HTTP API) with any OIDC provider.
   - Custom logic (tokens, headers): **Lambda authorizer**, with result caching.
   - Service-to-service: **IAM auth** (`AWS_IAM`), callers sign with **SigV4** using their role.
3. **API keys + usage plans:** for throttling, quotas and metering per client. They are **not security** (keys are easy to leak); always pair them with a real authorizer.
4. **Resource policies:** allow only certain IP ranges, accounts or VPC endpoints (`aws:SourceIp`, `aws:SourceVpce`); use **private APIs** for internal-only traffic.
5. **AWS WAF** on the stage: managed rule groups (common, SQLi, known bad inputs) and **rate-based rules**.
6. **mTLS on a custom domain** for partners/B2B: clients must present a certificate from your truststore; disable the default `execute-api` endpoint so the custom domain is the only way in.
7. **Throttling** per stage and per method to protect backends.
8. **Request validation** (models/schemas for body, required params and headers) to reject bad input early.
9. **TLS 1.2+** security policy on custom domains.
10. **Logging and alerting:** CloudWatch access logs (caller, IP, status, latency), execution logs while debugging, alarms on 4XX/5XX spikes, CloudTrail for config changes.
11. **Do not expose backends directly:** internal ALB via VPC link, Lambda permission only for API Gateway, and IaC so the fix does not drift back.

**Example:**
```bash
# Find unauthenticated methods (REST API)
aws apigateway get-resources --rest-api-id a1b2c3 --embed methods \
  --query "items[].{path:path,methods:resourceMethods}" --output json \
  | grep -B3 '"authorizationType": "NONE"'

# Attach a Cognito authorizer to a method
aws apigateway update-method --rest-api-id a1b2c3 --resource-id r1s2t3 \
  --http-method GET --patch-operations \
  op=replace,path=/authorizationType,value=COGNITO_USER_POOLS \
  op=replace,path=/authorizerId,value=auth123
aws apigateway create-deployment --rest-api-id a1b2c3 --stage-name prod
```
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": "*", "Action": "execute-api:Invoke",
      "Resource": "execute-api:/*" },
    { "Effect": "Deny", "Principal": "*", "Action": "execute-api:Invoke",
      "Resource": "execute-api:/*",
      "Condition": { "NotIpAddress": { "aws:SourceIp": ["203.0.113.0/24"] } } }
  ]
}
```

:::say
I first inventory every route with authorizationType NONE and any backend reachable directly, then add the right authentication: Cognito or JWT authorizers for users, Lambda authorizers for custom tokens and IAM SigV4 for service-to-service calls. I layer resource policies or private APIs, WAF managed and rate-based rules, mTLS for partners, throttling, request validation and TLS 1.2, and log and alarm on access; API keys and usage plans are only for metering, not security.
:::
