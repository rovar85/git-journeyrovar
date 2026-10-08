---
track: qbank
title: "AWS: Scenario-based questions (part 1 of 2)"
short: Aws scenario 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## An application behind an ALB is returning 503 errors. How would you troubleshoot it?

<!-- source: 06 Q55 -->

:::note In simple words
503 means the receptionist (ALB) is at the desk but has nobody to pass your request to. So first check whether any healthy staff (targets) are sitting behind the desk.
:::

**First, who produced the error?** Compare `HTTPCode_ELB_5XX_Count` (ALB generated it) with `HTTPCode_Target_5XX_Count` (your app returned it).

**If the ALB returned 503:**
1. **Target group has no registered targets** (ASG scaled to 0, ECS tasks all stopped, wrong target group on the listener rule).
2. **Targets unhealthy:** check `describe-target-health` reasons (`Target.Timeout`, `Target.ResponseCodeMismatch`, `Target.FailedHealthChecks`). Note: if all targets are unhealthy, ALB "fails open" and still sends traffic, so errors then look like 502/504 too.
3. **Health check misconfig:** wrong path/port, app returns 301/401 on `/health`, too short timeout.
4. **Security groups:** target SG does not allow the ALB SG on the app port.
5. **Listener rule** with a fixed-response 503 or forwarding to an empty group; Lambda target throttled.
6. **Deployments:** all old targets draining at once.

**If the app returned 503:** app overloaded, dependency (DB/Redis) down, thread pool exhausted - check app logs and ALB access logs (`target_status_code`).

**Example:**
```bash
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:...:tg/web/abc
# {"State":"unhealthy","Reason":"Target.ResponseCodeMismatch","Description":"...[404]"}

aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_ELB_5XX_Count --dimensions Name=LoadBalancer,Value=app/web/123 \
  --start-time 2026-09-24T09:00:00Z --end-time 2026-09-24T10:00:00Z \
  --period 60 --statistics Sum
```

:::say
I first check whether the 503 comes from the ALB or the targets using the ELB vs Target 5XX metrics. For ALB 503s I check that the target group has registered, healthy targets, the health check path and security groups are correct and the listener rules point to the right group; for app 503s I go to application logs and dependencies.
:::

## An EC2 instance behind an ALB becomes unreachable. How do you troubleshoot it in an existing infrastructure, and which metrics, tools and CLI commands do you use?

<!-- source: 06 Q56 -->

*Also asked as:* What metrics would you monitor for this setup? Which CLI commands would you run? An EC2 instance is unreachable and it is NOT a security group issue - what else do you check?

:::note In simple words
Walk the path the request takes: reception (ALB) -> corridor doors (security groups, NACLs) -> the office (instance) -> the person at the desk (the app). Find the first place where it stops.
:::

**Step-by-step:**
1. **Target group health:** `describe-target-health` gives the reason code:
   - `Target.Timeout`: no answer - usually security group, NACL, or the app not listening.
   - `Target.FailedHealthChecks`: connects but the check fails.
   - `Target.ResponseCodeMismatch`: app returns, for example, 301/404/500 on the health path.
   - `Target.NotInUse` / `Target.NotRegistered`: wrong AZ or not registered.
2. **EC2 status checks:** `describe-instance-status` - system check failed = AWS hardware (stop/start); instance check failed = OS (kernel, disk, memory).
3. **Security group chain:** the ALB SG must allow outbound to the instance, and the **instance SG must allow the app port from the ALB SG**.
4. **NACLs** on both subnets: app port inbound and **ephemeral ports 1024-65535** for return traffic.
5. **Health check config:** path, port, success codes (matcher), timeout and thresholds match the app.
6. **Inside the instance** (via SSM, no SSH needed): is the service running (`systemctl`), listening on the right port and interface (`ss -tlnp`, not bound only to 127.0.0.1 when using a different port), does `curl localhost:8080/health` work, is the **disk full** (`df -h`) or was there an **OOM kill** (`dmesg`)?
7. **What changed?** Recent deploy, new AMI, config or SG change (CloudTrail), certificate expiry.
8. **ASG behaviour:** the ASG may be replacing it (health check type ELB) - check scaling activities.
9. **ALB access logs:** `target_status_code`, `-` means no response; `elb_status_code` 502/504.

**If the security groups are fine, check these next:**
- **Status checks:** system check failed = AWS host or network problem (stop/start moves it to healthy hardware); instance check failed = OS problem.
- **Look without logging in:** `get-console-output` (system log) and `get-console-screenshot` show a kernel panic, an OOM kill, fsck waiting at boot, or a bad `/etc/fstab` entry.
- **Network path:** NACL rules (inbound port and outbound ephemeral ports), the subnet **route table** (a deleted or changed route to the IGW/NAT/TGW), and a changed **Elastic IP or ENI** (EIP moved to another instance, secondary ENI detached, private IP changed so the target registration is stale).
- **Resource exhaustion:** a full root disk stops services and logins; memory exhaustion causes OOM kills or a hang.
- **SSM:** if the SSM agent still responds, use Session Manager or Run Command to inspect it without any SSH; if SSM is also offline, the OS is probably hung, so reboot, or detach the root volume and fix it on a rescue instance.

**Metrics to monitor for this setup:**

| Where | Metrics |
| --- | --- |
| ALB / target group | HealthyHostCount, UnHealthyHostCount, HTTPCode_ELB_5XX_Count vs HTTPCode_Target_5XX_Count, TargetResponseTime (p99), RequestCount, RejectedConnectionCount |
| EC2 | CPUUtilization, StatusCheckFailed_System / _Instance, NetworkIn/Out, CPUCreditBalance |
| CloudWatch Agent | mem_used_percent, disk_used_percent, process counts |
| Logs | App logs and ALB access logs in CloudWatch Logs / S3 (Athena) |

**Example:**
```text
aws elbv2 describe-target-health --target-group-arn <tg-arn> \
  --query "TargetHealthDescriptions[].{id:Target.Id,state:TargetHealth.State,
  reason:TargetHealth.Reason}"
aws ec2 describe-instance-status --instance-ids i-0abc --include-all-instances
aws ec2 describe-security-groups --group-ids sg-app \
  --query "SecurityGroups[0].IpPermissions"
aws elbv2 describe-target-groups --target-group-arns <tg-arn> \
  --query "TargetGroups[0].{path:HealthCheckPath,port:HealthCheckPort,codes:Matcher}"
aws ssm start-session --target i-0abc
# on the instance:
sudo systemctl status myapp
sudo ss -tlnp | grep 8080
curl -i http://localhost:8080/health
df -h ; free -m ; sudo dmesg | grep -i -E "killed process|out of memory"
```

:::say
I start with describe-target-health to get the reason code, then check the EC2 status checks, the security group chain from the ALB SG to the instance port, NACLs and the health check settings. Then I get in with SSM to confirm the service is running and listening, curl the health path locally and check disk and OOM, while correlating with recent deploys; I monitor HealthyHostCount, ELB versus target 5XX, TargetResponseTime, status checks and agent memory and disk metrics.
:::

## What is the typical latency of a load balancer, and how do you troubleshoot high latency on an ALB?

<!-- source: 06 Q57 -->

*Also asked as:* Explain how you would troubleshoot high latency in an ALB.

:::note In simple words
The receptionist itself is quick (a few milliseconds). If the queue is slow, it is almost always the staff behind the desk (your targets) or the road to them.
:::

- ALB itself normally adds only **single-digit milliseconds**. High latency almost always comes from targets or dependencies.
- **`TargetResponseTime`** = time from ALB sending the request to the target starting to respond. Look at **p95/p99**, not only average.

**Triage order:**
1. **CloudWatch:** TargetResponseTime (p99), RequestCount, HTTPCode_Target_5XX, ActiveConnectionCount, RejectedConnectionCount, UnHealthyHostCount. Is it all targets or one AZ/target?
2. **ALB access logs:** split `request_processing_time`, `target_processing_time`, `response_processing_time`. High target time -> app; high request/response time -> ALB/client network.
3. **Targets:** CPU, memory, CPU credits (T instances), GC pauses, thread/connection pools, too few targets (scaling lag).
4. **Dependencies:** RDS latency/connections, Redis, external APIs; use **X-Ray/OpenTelemetry** traces to find the slow hop.
5. **Config:** cross-zone disabled with uneven targets, sticky sessions overloading one target, slow start, keep-alive mismatch (idle timeout).
6. **Client side:** far-away users -> add CloudFront.

**Example:**
```
# Athena query on ALB access logs: slowest targets in the last hour
SELECT target_ip, avg(target_processing_time) AS avg_s,
       approx_percentile(target_processing_time, 0.99) AS p99_s, count(*) AS reqs
FROM alb_logs
WHERE time > date_add('hour', -1, now())
GROUP BY target_ip ORDER BY p99_s DESC LIMIT 10;
```

:::say
The ALB itself adds only a few milliseconds, so I look at TargetResponseTime p99 and the access log fields to separate ALB, target and network time. Then I check target CPU, memory and pools, dependencies like RDS through traces, and configuration issues like sticky sessions or disabled cross-zone balancing.
:::

## Users are reporting slow application performance. Which AWS services and metrics would you check first?

<!-- source: 06 Q58 -->

*Also asked as:* A service is slow - how do you debug performance issues in AWS?

:::note In simple words
Follow the request's journey from the user's door to the database and back, and time every stop. The slow stop is your culprit.
:::

**Step-by-step, outside-in:**
1. **Scope:** all users or some? All endpoints or one? When did it start? Any deployment or config change?
2. **Edge/CDN:** CloudFront cache hit ratio, origin latency.
3. **Load balancer:** ALB `TargetResponseTime` p99, 5XX, request count (traffic spike?).
4. **Compute:** EC2/ECS/EKS CPU, memory, **CPUCreditBalance** (T-series throttling is a classic), network, pod restarts, throttling from CPU limits.
5. **Storage:** EBS `VolumeQueueLength`, `BurstBalance` (gp2 burst exhaustion), IOPS limits.
6. **Database:** RDS CPU, `DatabaseConnections`, Read/WriteLatency, `DiskQueueDepth`, locks; **Performance Insights** shows top SQL and wait events.
7. **Cache/queues:** ElastiCache CPU, evictions, latency; SQS age of oldest message; MSK consumer lag.
8. **Traces:** X-Ray / OpenTelemetry to see which service or call is slow.
9. **Logs:** CloudWatch Logs Insights for slow requests and errors.
10. **External:** third-party API latency, AWS Health Dashboard.

**Example:**
```
Deploy at 14:05 -> p99 latency 180 ms -> 2.4 s
Performance Insights: top wait = IO:DataFileRead, query "SELECT ... FROM orders WHERE email=?"
Root cause: new release dropped an index in migration. Fix: recreate index, p99 back to 190 ms.
```

:::say
I scope the problem first, then go outside-in: CloudFront, ALB TargetResponseTime, compute CPU, memory and credit balance, EBS burst balance, then RDS with Performance Insights and caches, using X-Ray traces to pinpoint the slow hop. I always correlate the start time with recent deployments or config changes.
:::

## Two users access the same application: one sees low latency and the other sees high latency. How do you troubleshoot?

<!-- source: 06 Q59 -->

:::note In simple words
Same shop, two customers, different waiting times. Maybe one lives far away, came by a jammed road, got sent to a slow counter, or ordered something much bigger.
:::

Compare the two users on each layer:
1. **Geography and edge:** where are they? Which **CloudFront edge** served them (`x-amz-cf-pop` header)? Cache hit (`x-cache: Hit from cloudfront`) for one and miss for the other?
2. **DNS routing:** Route 53 latency/geolocation rules may send them to different regions; check what `dig` returns for each.
3. **Network path / ISP:** `traceroute`/`mtr` from the slow user; packet loss, VPN or corporate proxy, Wi-Fi.
4. **Which target/AZ:** ALB access logs by client IP show `target_ip` and `target_processing_time`. **Sticky sessions** may pin the slow user to an overloaded or unhealthy target.
5. **User-specific data:** bigger account, more records, heavier queries, different feature flags or permissions (for example an admin dashboard loading everything).
6. **Client device/browser:** old device, extensions, browser dev tools timing (DNS, TLS, TTFB, download).
7. **Traces:** filter X-Ray/OTel by user ID to see the slow span.

**Example:**
```bash
curl -s -o /dev/null \
  -w "dns=%{time_namelookup} tls=%{time_appconnect} ttfb=%{time_starttransfer}\n" \
  https://app.example.com/api/dashboard
curl -sI https://app.example.com/ | grep -i -E "x-cache|x-amz-cf-pop"
mtr -rwc 50 app.example.com
```

:::say
I compare the two users layer by layer: their location and CloudFront edge or cache status, where Route 53 sends them, and their network path with traceroute or mtr. Then I use ALB access logs and traces filtered by their client IP or user ID to see whether sticky sessions pinned them to a slow target or whether their data makes queries heavier.
:::

## An Auto Scaling Group is not launching new instances during traffic spikes. How would you investigate?

<!-- source: 06 Q60 -->

*Also asked as:* Explain a real scenario where Auto Scaling did not scale properly. What was the root cause?

:::note In simple words
The manager wants to hire but nobody shows up. Either the manager never got the message (alarm), the hiring budget is maxed out (max size/quotas), or the job ad is broken (launch template).
:::

**Check in this order:**
1. **Scaling activity history:** `describe-scaling-activities` shows the exact failure message.
2. **Capacity limits:** desired already equals **MaxSize**.
3. **Alarm/policy:** did the CloudWatch alarm fire? Wrong metric, too long period, or scaling on CPU when the bottleneck is memory or requests. Cooldown/instance warmup delaying action.
4. **Suspended processes:** `Launch` or `AlarmNotification` suspended (someone forgot to resume after maintenance).
5. **Launch template errors:** deleted AMI, missing instance profile/KMS permission, invalid SG/subnet, wrong key pair.
6. **Capacity and quotas:** `InsufficientInstanceCapacity` in the AZ, **EC2 vCPU service quota** reached, Spot capacity gone, subnet out of IP addresses.
7. **Health checks:** new instances launch but fail ELB health check and get terminated (launch-terminate loop).

**Real example:** during a sale, the ASG hit its vCPU quota for the instance family; activities showed `VcpuLimitExceeded`. Fix: raised the quota, added multiple instance types across 3 AZs in a mixed instances policy, and moved to target tracking on `ALBRequestCountPerTarget` with scheduled/predictive scaling before known peaks.

**Example:**
```bash
aws autoscaling describe-scaling-activities --auto-scaling-group-name web-asg --max-items 5
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names web-asg \
  --query "AutoScalingGroups[0].{Min:MinSize,Max:MaxSize,Desired:DesiredCapacity,
  Suspended:SuspendedProcesses}"
aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A
```

:::say
I start with the ASG scaling activity history, which usually states the reason, then check max size, whether the alarm and policy actually fired, suspended processes, launch template errors, AZ capacity, vCPU quotas and subnet IPs. In one case we hit the vCPU quota, so we raised it, diversified instance types and added predictive scaling on requests per target.
:::

## Your EC2 instances scale up but never scale down. How would you debug and fix it?

<!-- source: 06 Q61 -->

*Also asked as:* An Auto Scaling Group scales out but not in.

:::note In simple words
Extra staff were hired for the rush but nobody was sent home afterwards. Either the "it is quiet now" signal never comes, or someone blocked the exit door.
:::

**Common causes:**
1. **Metric never drops:** the scale-in alarm threshold is too low, or background jobs keep CPU up. Memory-based scaling rarely drops because apps keep memory allocated.
2. **Target tracking scale-in is conservative** (needs a sustained low period) or `DisableScaleIn` is true.
3. **Only a scale-out policy exists** (step scaling without a scale-in policy).
4. **MinSize or desired manually raised** (MinSize = current count).
5. **Scale-in protection** on instances, or the `Terminate` process suspended.
6. **Lifecycle hooks** stuck in `Terminating:Wait` (hook never completes).
7. **Conflicting policies** (a scheduled action resets desired capacity; multiple policies where scale-out keeps winning).
8. On ECS/EKS: the node cannot be drained (PodDisruptionBudgets, pods with local storage, `do-not-disrupt` annotations).

**Fix:** correct metric and thresholds (requests per target is better than CPU for web), ensure a scale-in path exists, remove unneeded protection, complete lifecycle hooks with timeouts, and alarm on "desired > baseline for 6 hours".

**Example:**
```bash
aws autoscaling describe-policies --auto-scaling-group-name web-asg
aws autoscaling describe-auto-scaling-instances \
  --query "AutoScalingInstances[].{ID:InstanceId,Protected:ProtectedFromScaleIn,
  State:LifecycleState}"
aws autoscaling set-instance-protection --auto-scaling-group-name web-asg \
  --instance-ids i-0abc --no-protected-from-scale-in
```

:::say
I check whether the scale-in metric ever crosses its threshold, whether a scale-in policy even exists or target tracking has scale-in disabled, and whether MinSize, scale-in protection, suspended Terminate processes or stuck lifecycle hooks are blocking it. Then I fix the metric choice and thresholds and add an alarm if capacity stays above baseline for hours.
:::

## An RDS database becomes unavailable during business hours. What is your recovery approach?

<!-- source: 06 Q62 -->

:::note In simple words
The shop's cash counter stops. First, open a backup counter fast (restore service), keep customers informed, and only after the rush find out why it broke.
:::

**1. Triage (first 5 minutes):**
- `describe-db-instances` status: `storage-full`, `rebooting`, `failing-over`, `maintenance`, `incompatible-parameters`, `inaccessible-encryption-credentials`?
- **RDS Events** and the **AWS Health Dashboard** (AZ issue?).
- CloudWatch: FreeStorageSpace, CPU, DatabaseConnections (max connections reached looks like "down" to apps), FreeableMemory.
- Is it the DB or the network (SG change, DNS, secret rotated)?

**2. Restore service:**
- **Multi-AZ:** failover is automatic; if hung, `reboot --force-failover`.
- **storage-full:** increase allocated storage (enable storage autoscaling).
- **Connections exhausted:** kill idle sessions, scale app pools down, add RDS Proxy.
- **Single-AZ and broken:** promote a read replica or **point-in-time restore** to a new instance, then repoint the app (DNS CNAME / secret).

**3. Communicate** status every 15-30 minutes; put the app in maintenance mode if needed.

**4. After:** RCA, then prevent: Multi-AZ, storage autoscaling, alarms on storage/connections, maintenance windows outside business hours, tested restore runbook.

**Example:**
```bash
aws rds describe-events --source-identifier orders-prod --source-type db-instance \
  --duration 120
aws rds modify-db-instance --db-instance-identifier orders-prod \
  --allocated-storage 500 --max-allocated-storage 1000 --apply-immediately
aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier orders-prod \
  --target-db-instance-identifier orders-restored --restore-time 2026-09-24T09:40:00Z
```

:::say
I check the instance status, RDS events and key metrics like free storage and connections to find why it is down, then restore service fastest: failover for Multi-AZ, add storage if full, or promote a replica or do a point-in-time restore and repoint the app. I keep stakeholders updated and follow with an RCA and preventive alarms, Multi-AZ and storage autoscaling.
:::

## An RDS instance is hitting max connections during peak traffic. How would you handle it?

<!-- source: 06 Q63 -->

*Also asked as:* RDS connections suddenly spike - how do you monitor and protect the database without downtime?

:::note In simple words
The restaurant has 100 chairs and every waiter is holding chairs for guests who left. Share chairs better (pooling) before building a bigger restaurant.
:::

**Monitor:** CloudWatch `DatabaseConnections` (alarm at 80 percent of `max_connections`), **Performance Insights** (sessions by wait event, top SQL, top hosts/users), and the app's pool metrics. A sudden jump right after a deploy usually means a connection leak or a bigger pool setting.

**Immediate (no downtime):**
1. Find who holds connections: `pg_stat_activity` / `SHOW PROCESSLIST` grouped by user, application and client address to find the **leaking client**; kill long-idle sessions.
2. Reduce per-pod/instance **pool sizes**; many small pods each with a pool of 50 add up fast (20 pods x 50 = 1,000).

**Short term:**
- **RDS Proxy** pools and multiplexes connections, and helps greatly with Lambda.
- **pgbouncer** in transaction mode for PostgreSQL.
- Route reads to **read replicas** (reader endpoint).
- Add caching (ElastiCache) for hot reads.

**Longer term:**
- `max_connections` is derived from instance memory; raising it or moving to a bigger class helps but costs memory per connection.
- Fix connection leaks, set idle timeouts, cap autoscaling so pods x pool <= DB limit.
- Alarm at 80 percent of `DatabaseConnections`.

**Example:**
```
SELECT usename, application_name, client_addr, state, count(*)
FROM pg_stat_activity GROUP BY 1,2,3,4 ORDER BY 5 DESC;

SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'idle' AND state_change < now() - interval '10 minutes';
```

:::say
I watch DatabaseConnections and Performance Insights, and when it spikes I use pg_stat_activity grouped by application and client to find the leaking client, then trim idle sessions and oversized pools, then put RDS Proxy or pgbouncer in front to multiplex connections and move reads to replicas and cache. Long term I size pools so pods times pool size stays under the limit, fix leaks, and alarm at 80 percent of max connections.
:::

## Your ECS service is stuck in PROVISIONING. What steps would you take?

<!-- source: 06 Q64 -->

:::note In simple words
The dish is ordered but there is no free stove to cook it on. ECS is waiting for capacity or a network slot before the task can start.
:::

`PROVISIONING` means ECS is waiting for resources before the task can run: capacity to be added, or the network interface to be attached.

**Checks:**
1. **Service events:** `describe-services` -> `events` often says "unable to place a task" and why.
2. **EC2 capacity provider:** managed scaling must scale the ASG; check ASG **max size**, scaling activities, and `CapacityProviderReservation` metric. The ASG may be at max or failing to launch.
3. **Resources:** no instance has enough free CPU/memory/ports for the task size; placement constraints too strict.
4. **awsvpc networking:** subnets out of **free IP addresses**; ENI limit per instance reached (enable ENI trunking).
5. **Fargate:** capacity shortage in the AZ (spread across subnets in several AZs), Fargate Spot unavailable, Fargate vCPU quota.
6. **Task launch errors** after provisioning: image pull (ECR permissions, no NAT/endpoints), secrets fetch failure -> check stopped task `stoppedReason`.

**Example:**
```text
aws ecs describe-services --cluster prod --services orders \
  --query "services[0].events[:5].message"
aws ecs describe-tasks --cluster prod --tasks <task-id> \
  --query "tasks[0].{status:lastStatus,reason:stoppedReason}"
aws ec2 describe-subnets --subnet-ids subnet-a subnet-b \
  --query "Subnets[].{id:SubnetId,free:AvailableIpAddressCount}"
```

:::say
PROVISIONING means ECS is waiting for capacity or networking, so I read the service events first, then check the capacity provider's ASG max size and scaling activity, free CPU and memory, subnet IPs and ENI limits for awsvpc. For Fargate I check AZ capacity and quotas, and if tasks then stop I look at stoppedReason for image pull or secrets issues.
:::

## Describe an incident where an EC2 instance crashed or became unresponsive. What did you do?

<!-- source: 06 Q65 -->

:::note In simple words
When a machine stops answering, first find out whether it is the building (AWS host) or the machine itself (your OS). Get it working again fast, then do the post-mortem.
:::

**Structured approach:**
1. **Status checks:** `StatusCheckFailed_System` = AWS host problem -> stop/start moves it to new hardware. `StatusCheckFailed_Instance` = OS problem (kernel panic, OOM, disk full, bad fstab).
2. **Look without logging in:** `get-console-output` and **instance screenshot** for kernel panic/OOM messages.
3. **Metrics before the crash:** CPU, memory and disk from the CloudWatch agent, CPU credits.
4. **Recover:** reboot; if it will not boot, stop, detach the root volume, attach to a rescue instance, fix (fstab, full disk), reattach. Or restore from the latest snapshot/AMI.
5. **Prevent:** EC2 auto-recovery alarm, run behind an ASG so it self-heals, disk/memory alarms, log rotation.

**Sample real story (adapt to yours):** "Our Zabbix monitoring server's web UI started returning 504. The EC2 was hung at OS level, so SSM and SSH did not respond. I checked the console output, rebooted, verified the web server and the `mysqld` service came back, and confirmed monitoring resumed. RCA found memory and disk pressure on a small instance, so we tuned PHP-FPM workers, vacuumed the systemd journal from 91 percent to 82 percent disk, and added disk and memory alarms."

**Example:**
```bash
aws ec2 describe-instance-status --instance-ids i-0abc --include-all-instances
aws ec2 get-console-output --instance-id i-0abc --latest --output text | tail -50
aws ec2 get-console-screenshot --instance-id i-0abc --query ImageData --output text \
  | base64 -d > screen.jpg
aws cloudwatch put-metric-alarm --alarm-name ec2-autorecover-i-0abc \
  --namespace AWS/EC2 --metric-name StatusCheckFailed_System --statistic Maximum \
  --dimensions Name=InstanceId,Value=i-0abc --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions arn:aws:automate:ap-south-1:ec2:recover
```

:::say
I check system versus instance status checks to know if it is AWS hardware or our OS, read the console output and screenshot, then recover by stop/start, reboot or fixing the root volume on a rescue instance. In our case a monitoring server hung from memory and disk pressure; I rebooted it, verified the services, then tuned PHP-FPM, cleaned the journal and added alarms.
:::

## An S3 bucket used for artifact storage was accidentally made public. What is your fix?

<!-- source: 06 Q66 -->

*Also asked as:* An S3 bucket was made public by mistake - how do you secure and audit it?

:::note In simple words
The warehouse door was left open. Shut it immediately, check the CCTV for who came in, then fit a lock that cannot be left open again.
:::

**Contain (minutes):**
1. Turn on **Block Public Access** on the bucket (and account).
2. Remove the public bucket policy statement / public ACLs; set Object Ownership to BucketOwnerEnforced.

**Assess:**
3. **CloudTrail:** who changed the policy (`PutBucketPolicy`, `PutBucketAcl`, `PutPublicAccessBlock`) and when.
4. **S3 server access logs / CloudTrail data events:** which objects were downloaded by unknown IPs during the exposure window.
5. Check whether artifacts contained **secrets** (config files, keys). If yes, **rotate them all** and treat as a security incident.
6. Verify artifact integrity (checksums/signatures) in case someone **wrote** to it.
7. **Amazon Macie** scan of the bucket to find sensitive data (PII, credentials) that may have been exposed.
8. **IAM Access Analyzer for S3** to list any other buckets shared publicly or with outside accounts.

**Prevent:**
- **Account-level Block Public Access**, protected by an **SCP** that denies turning it off; AWS Config rule `s3-bucket-public-read-prohibited` with auto-remediation; IAM Access Analyzer alerts; bucket managed in Terraform so drift is visible; artifacts served via pre-signed URLs or VPC endpoint only.

**Example:**
```bash
aws s3api put-public-access-block --bucket build-artifacts \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api delete-bucket-policy --bucket build-artifacts
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PutBucketPolicy --max-results 5
```

:::say
I immediately enable Block Public Access and remove the public policy, then use CloudTrail to find who changed it and access logs to see what was downloaded, rotating any secrets that were in the artifacts. To prevent a repeat I enforce Block Public Access with an SCP, add a Config rule with auto-remediation and manage the bucket in Terraform.
:::
