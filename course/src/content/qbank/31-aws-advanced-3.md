---
track: qbank
title: "AWS: Advanced questions (part 3 of 3)"
short: Aws advanced 3
sub: 9 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you optimize AWS cost for EC2, NAT, and S3?

<!-- source: 06 Q45 -->

*Also asked as:* What approaches do you use to reduce AWS costs?

:::note In simple words
Stop paying for lights in empty rooms, buy in bulk what you always use, use discount seats for flexible trips, and move old boxes to cheaper storage.
:::

**EC2:**
- **Rightsize** with Compute Optimizer; move to **Graviton** (about 20 percent cheaper).
- **Savings Plans / Reserved Instances** for steady baseline; **Spot** for stateless, batch, CI, and EKS worker pools.
- **Schedule** dev/test off nights and weekends; delete idle instances, unattached EBS, old snapshots, unused EIPs; gp2 -> **gp3**.

**NAT Gateway (charged per hour + per GB processed):**
- Add **S3 and DynamoDB gateway endpoints** (free) so that traffic skips NAT.
- Interface endpoints for ECR, CloudWatch Logs when volume is high.
- Keep traffic in the same AZ (avoid cross-AZ data charges); find top talkers with VPC Flow Logs.

**S3:**
- Lifecycle to IA/Glacier, **Intelligent-Tiering** for unknown patterns, expire noncurrent versions, abort incomplete multipart uploads; use **Storage Lens**.

**Governance:** tagging, Cost Explorer, Budgets, **Cost Anomaly Detection**.

**Example:**
```bash
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query "Volumes[].{ID:VolumeId,GB:Size}" --output table   # orphaned EBS

aws ce get-cost-and-usage --time-period Start=2026-09-01,End=2026-09-24 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE
```

:::say
For EC2 I rightsize, move to Graviton, cover the baseline with Savings Plans and use Spot for flexible workloads, while shutting down non-prod off-hours. For NAT I add free S3 and DynamoDB gateway endpoints, and for S3 I use lifecycle rules and Intelligent-Tiering, all tracked with tags, Budgets and Cost Anomaly Detection.
:::

## What are best practices to protect an AWS-hosted web application from attacks?

<!-- source: 06 Q46 -->

:::note In simple words
Layers like a castle: a moat (Shield), guards at the gate checking IDs (WAF), locked inner doors (private subnets and security groups), and cameras everywhere (GuardDuty, logs).
:::

1. **Edge:** CloudFront + **AWS WAF** (managed rules for OWASP Top 10, SQL injection, XSS, bad bots, rate-based rules, geo blocking) + **Shield** Standard (free) or Advanced (DDoS response team and cost protection).
2. **Network:** ALB in public subnets, app and DB in private subnets; SGs allow only what is needed; no SSH from internet (use SSM).
3. **TLS everywhere** with ACM; HSTS; redirect HTTP -> HTTPS.
4. **Identity:** least-privilege IAM roles, MFA, no root usage, no long-lived keys.
5. **Data:** KMS encryption at rest, Secrets Manager for credentials, private S3 with OAC.
6. **Patching and images:** hardened AMIs, Inspector scanning, ECR image scanning.
7. **Detection:** GuardDuty, Security Hub, CloudTrail, Config, VPC Flow Logs, WAF logs.
8. **App level:** input validation, authentication (Cognito), security headers, dependency scanning.
9. **Resilience:** autoscaling to absorb load, backups, incident runbooks.

**Example:**
```
User -> Route53 -> CloudFront (Shield) -> WAF (OWASP, rate 2000/5min/IP)
     -> ALB (443 only, ACM) -> App in private subnets (SG from ALB only)
     -> RDS in isolated subnets (SG from app only, KMS encrypted)
GuardDuty + Security Hub + CloudTrail watching all accounts
```

:::say
I use defense in depth: CloudFront with WAF managed and rate-based rules and Shield at the edge, private subnets with tight security groups, TLS everywhere, least-privilege IAM and encrypted data. Then I detect with GuardDuty, Security Hub and CloudTrail and keep images patched and scanned.
:::

## Can you write a custom IAM policy? Explain its structure and how AWS evaluates policies.

<!-- source: 06 Q47 -->

:::note In simple words
An IAM policy is a permission slip: who may do which actions, on which things, under which conditions. If any slip anywhere says "NO", the answer is no.
:::

**Structure of a statement:**
- **Effect:** `Allow` or `Deny`.
- **Action:** API calls, for example `s3:GetObject`.
- **Resource:** ARNs the actions apply to (scope as narrowly as possible).
- **Condition:** extra rules, for example source VPC endpoint, MFA present, tag match, TLS only.
- **Principal:** only in resource-based policies (bucket policy, trust policy).

**Managed vs inline:**
- **AWS managed:** written by AWS, broad, convenient (for example `ReadOnlyAccess`).
- **Customer managed:** your reusable, versioned policies (preferred).
- **Inline:** embedded in one user/role, deleted with it; use for strict one-to-one cases.

**Evaluation logic:**
1. Everything starts as **implicit deny**.
2. An **explicit Deny** anywhere (SCP, permission boundary, identity, resource, session policy) **always wins**.
3. Otherwise an **Allow** is needed, and it must be allowed by every applicable layer (SCP and permission boundary must also allow).
4. Cross-account: both the identity policy and the resource policy must allow.

**Example (least privilege: read/write only one prefix, only through our VPC endpoint):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOwnPrefix",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::app-data",
      "Condition": { "StringLike": { "s3:prefix": ["orders/*"] } }
    },
    {
      "Sid": "ReadWriteOwnPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::app-data/orders/*",
      "Condition": { "StringEquals": { "aws:SourceVpce": "vpce-0abc123" } }
    }
  ]
}
```
```bash
aws iam create-policy --policy-name orders-s3-rw --policy-document file://policy.json
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111111111111:role/orders \
  --action-names s3:DeleteObject --resource-arns arn:aws:s3:::app-data/orders/x
```

:::say
Yes, a policy has statements with Effect, Action, Resource and optional Condition, and I write customer-managed policies scoped to exact ARNs and prefixes with conditions like source VPC endpoint. AWS starts from implicit deny, an explicit deny anywhere always wins, and an action is allowed only if every layer such as SCPs and boundaries also allows it; I test with the IAM policy simulator.
:::

## Two employees work different shifts (10 AM-5 PM and 6 PM-2 AM). How do you give them AWS access based on time?

<!-- source: 06 Q48 -->

:::note In simple words
IAM can say "this pass is valid until 5 PM on 3rd October", but it cannot say "valid every day from 10 to 5". For a daily schedule you need a small robot that hands out and takes back the pass on time.
:::

**Important limitation:** the condition keys `aws:CurrentTime` and `aws:EpochTime` compare against an **absolute date-time**. IAM has **no native recurring daily time-window** condition, so a single static policy cannot express "10:00-17:00 every day".

**Practical options:**
1. **Scheduled automation:** EventBridge Scheduler triggers a Lambda at shift start to attach a policy (or create an IAM Identity Center **permission-set assignment**) and at shift end to detach/remove it. Handle time zones carefully (IST 10:00 = 04:30 UTC).
2. **Time-bounded policy renewed daily:** the Lambda rewrites the policy each day with that day's `DateGreaterThan`/`DateLessThan` window.
3. **Temporary elevated access** (for example AWS TEAM with IAM Identity Center): users request access for their shift, it is approved and auto-expires.
4. **Short session duration** on the permission set / role (for example 7-8 hours) so sessions do not outlive the shift. Note that revoking a policy does not kill an already-issued session, so short sessions matter.
5. Audit with CloudTrail; alert on off-shift activity.

**Example (one day's window for the 10 AM-5 PM IST user, written in UTC):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ec2:Describe*", "cloudwatch:Get*", "logs:*"],
    "Resource": "*",
    "Condition": {
      "DateGreaterThan": { "aws:CurrentTime": "2026-10-01T04:30:00Z" },
      "DateLessThan":    { "aws:CurrentTime": "2026-10-01T11:30:00Z" }
    }
  }]
}
```
```bash
# EventBridge Scheduler (IST) calling a Lambda that grants/revokes access
aws scheduler create-schedule --name grant-shift-a \
  --schedule-expression "cron(0 10 * * ? *)" \
  --schedule-expression-timezone Asia/Kolkata \
  --flexible-time-window Mode=OFF \
  --target file://grant-shift-a-target.json
```

:::say
IAM's aws:CurrentTime condition only compares against fixed dates, so there is no built-in daily recurring time window. I would use EventBridge Scheduler with a Lambda to grant and revoke the permission-set assignment at each shift boundary, or a just-in-time access tool like TEAM, with short session durations and CloudTrail alerts for off-shift activity.
:::

## How do you manage and connect to services like EC2, RDS, EKS and ECS?

<!-- source: 06 Q50 -->

:::note In simple words
Every service has its own secure front door, and all of them open with your AWS identity instead of shared passwords or open ports.
:::

- **EC2:** SSM Session Manager (no SSH port, no keys, logged).
- **EKS:** `aws eks update-kubeconfig` writes a kubeconfig that authenticates with your IAM identity (mapped via EKS access entries); then use `kubectl`.
- **ECS:** **ECS Exec** opens a shell in a running container. Needs `enableExecuteCommand` on the service/task, the SSM agent (ECS injects it automatically), and the **task role** allowing the `ssmmessages` channel actions.
- **RDS:** SSM port forwarding through an instance in the VPC, then a normal DB client to `localhost`.
- Everything else managed through **IaC** (Terraform) and the CLI, with IAM Identity Center for human access.

**Example:**
```bash
# EC2
aws ssm start-session --target i-0abc123def4567890

# EKS
aws eks update-kubeconfig --name prod-eks --region ap-south-1
kubectl get nodes

# ECS Exec
aws ecs update-service --cluster prod --service orders \
  --enable-execute-command --force-new-deployment
aws ecs execute-command --cluster prod --task 0f1e2d3c4b5a \
  --container orders --interactive --command "/bin/sh"

# RDS through SSM port forwarding
aws ssm start-session --target i-0abc123def4567890 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["orders.abc123.ap-south-1.rds.amazonaws.com"],
                 "portNumber":["5432"],"localPortNumber":["15432"]}'
psql -h localhost -p 15432 -U app_ro orders
```

:::say
I use IAM-based access everywhere: SSM Session Manager for EC2, aws eks update-kubeconfig plus kubectl for EKS, ECS Exec with enableExecuteCommand and the right task role for containers, and SSM port forwarding to reach private RDS. Nothing needs public IPs, open SSH ports or shared keys, and all sessions are logged.
:::

## How do you establish database connections from your applications in deployments?

<!-- source: 06 Q51 -->

:::note In simple words
The app looks up the database address and password in a safe (Secrets Manager), travels only on private roads (private subnets, security groups), and shares a few taxis (a connection pool) instead of calling a new one for every trip.
:::

1. **Endpoint and credentials** come from config/Secrets Manager (via External Secrets on EKS or ECS task `secrets`), never hard-coded in the image or Git.
2. **Network:** DB in private/data subnets, no public access; the DB security group allows 5432/3306 **only from the app security group** (SG-to-SG reference).
3. **Connection pooling** in the app (HikariCP, pgbouncer, SQLAlchemy pool) and **RDS Proxy** for spiky or Lambda workloads.
4. **Authentication:** Secrets Manager with rotation, or **IAM database authentication** tokens via IRSA/task role.
5. **TLS** in transit (`sslmode=require` or `verify-full` with the RDS CA bundle); KMS encryption at rest.
6. **Resilience:** use the DNS endpoint (not IP), retries with backoff, a separate reader endpoint for read traffic.

**Example:**
```yaml
# EKS Deployment snippet
env:
  - name: DB_HOST
    value: orders-proxy.proxy-abc123.ap-south-1.rds.amazonaws.com
  - name: DB_PASSWORD
    valueFrom: { secretKeyRef: { name: orders-db, key: password } }
  - name: DB_SSLMODE
    value: verify-full
```
```bash
aws ec2 authorize-security-group-ingress --group-id sg-rds \
  --protocol tcp --port 5432 --source-group sg-app
```

:::say
The app gets the DB endpoint and credentials from Secrets Manager, connects over TLS from private subnets, and the database security group only accepts traffic from the app's security group. I use connection pooling or RDS Proxy, rotate credentials or use IAM auth tokens, and always connect by DNS endpoint with retries.
:::

## How do you create AWS Lambda functions and manage their deployment artifacts?

<!-- source: 06 Q52 -->

:::note In simple words
Package your code like a parcel (a zip or a container image), store it in a warehouse (S3 or ECR), label every version, and use a pointer (alias) that you can slowly move to the new parcel and move back if it breaks.
:::

**Packaging:**
- **Zip package** (50 MB direct upload, 250 MB unzipped) uploaded to **S3** with a versioned key, for example `lambda/orders/1.4.2.zip`.
- **Container image** (up to 10 GB) pushed to **ECR**, tagged with the git SHA.
- **Layers** for shared dependencies/libraries across functions.

**Tooling:** AWS SAM, Serverless Framework, CDK or Terraform; CI builds, tests and uploads the artifact, then updates the function.

**Versions and aliases:**
- Publishing creates an immutable **version**.
- An **alias** (`live`, `prod`) points to a version; clients invoke the alias.
- **Canary with CodeDeploy:** weighted alias shifts, for example 10 percent for 5 minutes then 100 percent, with automatic rollback on CloudWatch alarms (SAM `DeploymentPreference`).

**Example:**
```bash
aws s3 cp build/orders-1.4.2.zip s3://artifacts-111111111111/lambda/orders/1.4.2.zip
aws lambda update-function-code --function-name orders \
  --s3-bucket artifacts-111111111111 --s3-key lambda/orders/1.4.2.zip --publish
aws lambda update-alias --function-name orders --name live --function-version 7 \
  --routing-config '{"AdditionalVersionWeights":{"8":0.1}}'
```
```yaml
# SAM template: automatic canary + rollback
OrdersFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: src/
    Handler: app.handler
    Runtime: python3.12
    AutoPublishAlias: live
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      Alarms: [!Ref OrdersErrorsAlarm]
```

:::say
CI builds the function as a versioned zip in S3 or a container image in ECR, with shared libraries in layers, and deploys it with SAM or Terraform. Each release publishes an immutable version, clients call an alias, and CodeDeploy shifts the alias gradually, for example 10 percent for 5 minutes, rolling back automatically on alarms.
:::

## What is the hub-and-spoke network model?

<!-- source: 06 Q53 -->

:::note In simple words
Like an airline hub: instead of direct flights between every pair of small cities, all flights go through one big airport. Fewer routes, one place for security checks.
:::

- **Hub:** an **AWS Transit Gateway** (a regional router) that every VPC and on-prem link attaches to.
- **Spokes:** workload VPCs (prod, test, per-team) that only connect to the hub, not to each other directly.
- **Shared VPCs on the hub:**
  - **Shared services VPC:** CI runners, AD/DNS, artifact repos, monitoring.
  - **Egress VPC:** **centralized NAT Gateways** (and proxy) so spokes do not each pay for NAT.
  - **Inspection VPC:** AWS Network Firewall or third-party appliances (via Gateway Load Balancer) for east-west and north-south traffic.
- **TGW route tables** create segmentation, for example prod spokes cannot reach dev spokes, but both reach shared services.
- **Versus a peering mesh:** N VPCs need N x (N-1) / 2 peerings (10 VPCs = 45), with no transitive routing and no central inspection. Hub-and-spoke scales to thousands of VPCs and one VPN/DX serves all.
- **Trade-offs:** TGW charges per attachment-hour and per GB, and adds a hop.
- It is the same idea as **Azure hub-spoke** (hub VNet with firewall/VPN gateway, peered spoke VNets) and GCP hub-and-spoke with Network Connectivity Center.

**Example:**
```
                 On-prem (VPN / Direct Connect)
                           |
   Egress VPC (NAT) -- Transit Gateway -- Inspection VPC (Network Firewall)
                     /      |       \
               prod VPC  dev VPC  shared-services VPC
   TGW RT "prod": prod -> shared, egress, on-prem     (no route to dev)
   TGW RT "dev" : dev  -> shared, egress              (no route to prod)
```

:::say
Hub-and-spoke puts a Transit Gateway at the center with workload VPCs as spokes, plus shared services, centralized egress NAT and an inspection VPC attached to the hub. TGW route tables segment prod from dev, and it scales far better than a peering mesh, which needs N times N minus 1 over 2 connections and has no transitive routing.
:::

## If you do not want to use Auto Scaling policies, how else can you scale EC2?

<!-- source: 06 Q54 -->

:::note In simple words
Instead of an automatic thermostat, you can use a timer (schedules), a helper who reacts to alarms (Lambda), a forecast (predictive scaling), or just turn the knob yourself (manual).
:::

1. **Scheduled actions** on the ASG: set min/max/desired at fixed times (for example scale to 20 before 9 AM, back to 4 at 9 PM).
2. **Predictive scaling:** ML forecasts daily/weekly patterns and scales ahead of time (can run in forecast-only mode first).
3. **CloudWatch alarm -> SNS/EventBridge -> Lambda:** your own logic calls `set-desired-capacity`, or launches/starts/stops standalone instances.
4. **EventBridge Scheduler** calling EC2 start/stop APIs directly (great for dev/test office hours).
5. **Manual:** `set-desired-capacity` from CLI/console or a CI job before an event.
6. **Vertical scaling:** stop, change instance type, start (causes downtime for that instance).

Important: **CloudWatch alarm EC2 actions** can only **stop, terminate, reboot or recover** an instance. They cannot add capacity, so scaling out always needs an ASG action, a Lambda, or you.

**Example:**
```bash
aws autoscaling put-scheduled-update-group-action --auto-scaling-group-name web-asg \
  --scheduled-action-name office-hours-up --recurrence "30 3 * * MON-FRI" \
  --min-size 6 --desired-capacity 10 --max-size 20          # 09:00 IST = 03:30 UTC

aws autoscaling set-desired-capacity --auto-scaling-group-name web-asg \
  --desired-capacity 15 --honor-cooldown

aws scheduler create-schedule --name stop-dev-nightly \
  --schedule-expression "cron(0 21 * * ? *)" --schedule-expression-timezone Asia/Kolkata \
  --flexible-time-window Mode=OFF --target file://stop-dev-target.json
```

:::say
Without dynamic policies I can use ASG scheduled actions, predictive scaling, or a CloudWatch alarm that triggers a Lambda through SNS or EventBridge to call set-desired-capacity, plus EventBridge Scheduler to start and stop instances. Alarm EC2 actions can only stop, terminate, reboot or recover, so they cannot add capacity by themselves.
:::
