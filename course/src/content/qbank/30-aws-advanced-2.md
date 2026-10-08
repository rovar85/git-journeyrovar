---
track: qbank
title: "AWS: Advanced questions (part 2 of 3)"
short: Aws advanced 2
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you configure priority-based Auto Scaling?

<!-- source: 06 Q31 -->

:::note In simple words
When hiring extra staff, you first call your favorite agency; only if they have nobody free do you call the second agency, then the third.
:::

"Priority" in AWS Auto Scaling usually means one of these:
- **Mixed Instances Policy, On-Demand allocation strategy `prioritized`:** ASG launches instance types in the order you list them in overrides.
- **Spot allocation `capacity-optimized-prioritized`:** prefers your order but still picks pools with spare capacity.
- **Base + percentage:** for example first 2 instances On-Demand, then 30 percent On-Demand, 70 percent Spot.
- **Multiple scaling policies:** if several fire at once, the ASG applies the one that gives the **largest capacity** (safest).
- **ECS capacity providers:** `base` and `weight` decide which provider (Fargate vs Fargate Spot) gets tasks first.

**Example:**
```json
"MixedInstancesPolicy": {
  "LaunchTemplate": {
    "LaunchTemplateSpecification": { "LaunchTemplateName": "app-lt", "Version": "$Latest" },
    "Overrides": [
      { "InstanceType": "m7g.large" },
      { "InstanceType": "m6g.large" },
      { "InstanceType": "m5.large" }
    ]
  },
  "InstancesDistribution": {
    "OnDemandAllocationStrategy": "prioritized",
    "OnDemandBaseCapacity": 2,
    "OnDemandPercentageAboveBaseCapacity": 30,
    "SpotAllocationStrategy": "capacity-optimized-prioritized"
  }
}
```

:::say
I use a mixed instances policy where the On-Demand allocation strategy is prioritized, so the ASG tries instance types in my listed order, with Spot using capacity-optimized-prioritized. I also set an On-Demand base for critical capacity and remember that when multiple scaling policies fire, AWS picks the one giving the largest capacity.
:::

## How do you automate ECS and EKS node scaling?

<!-- source: 06 Q32 -->

:::note In simple words
Two layers of hiring: first decide how many workers (pods/tasks) you need, then automatically rent enough desks (nodes) for them.
:::

**ECS:**
- **Service Auto Scaling** scales task count (target tracking on CPU, memory, or ALB requests per target).
- **Capacity providers with managed scaling** scale the EC2 ASG using the `CapacityProviderReservation` metric; managed termination protection avoids killing busy instances.
- Or use **Fargate** and skip nodes entirely.

**EKS:**
- **HPA/KEDA** scale pods.
- **Cluster Autoscaler** adds nodes to managed node groups when pods are Pending, removes underused nodes.
- **Karpenter** (recommended) launches right-sized instances directly in seconds, supports Spot and consolidation.
- **EKS Auto Mode** lets AWS manage node scaling for you.

**Example:**
```yaml
# Karpenter NodePool
apiVersion: karpenter.sh/v1
kind: NodePool
metadata: { name: default }
spec:
  template:
    spec:
      requirements:
        - { key: karpenter.sh/capacity-type, operator: In, values: ["spot","on-demand"] }
        - { key: kubernetes.io/arch, operator: In, values: ["arm64","amd64"] }
      nodeClassRef: { group: karpenter.k8s.aws, kind: EC2NodeClass, name: default }
  limits: { cpu: "200" }
  disruption: { consolidationPolicy: WhenEmptyOrUnderutilized }
```

:::say
For ECS I combine Service Auto Scaling for tasks with capacity providers using managed scaling for the EC2 fleet, or use Fargate. For EKS, HPA or KEDA scale pods and Karpenter or Cluster Autoscaler add and remove nodes based on pending pods, with Karpenter also consolidating to save cost.
:::

## How would you perform a zero-downtime deployment in AWS?

<!-- source: 06 Q33 -->

:::note In simple words
Change the tires of a moving bus one at a time, or bring a second bus alongside and move passengers over only when it runs fine.
:::

**Building blocks:**
- An **ALB** in front, with **health checks** and a **deregistration delay** (connection draining) so in-flight requests finish.
- At least **2 instances/tasks across AZs**.

**Strategies:**
1. **Rolling:** ASG **instance refresh** or ECS rolling update with `minimumHealthyPercent=100`, `maximumPercent=200`.
2. **Blue/Green:** CodeDeploy for ECS/EC2 creates a green fleet, shifts ALB traffic (all at once, linear, or canary), and rolls back on CloudWatch alarms.
3. **Canary for Lambda:** aliases with weighted traffic shifting.
4. **Deployment circuit breaker** in ECS for automatic rollback.
5. Database changes must be **backward-compatible** (expand-contract).

**Example:**
```bash
aws autoscaling start-instance-refresh --auto-scaling-group-name web-asg \
  --preferences '{"MinHealthyPercentage":90,"InstanceWarmup":120,
                  "AutoRollback":true}'

aws ecs update-service --cluster prod --service orders \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},
  maximumPercent=200,minimumHealthyPercent=100"
```

:::say
I keep at least two targets behind an ALB with health checks and connection draining, then use rolling updates or CodeDeploy blue/green that shifts traffic gradually and rolls back on CloudWatch alarms. Database changes are made backward-compatible so old and new versions can run together.
:::

## How do you implement API Gateway with Lambda for microservices?

<!-- source: 06 Q34 -->

:::note In simple words
API Gateway is the reception desk that checks visitors and sends each one to the right department (Lambda function). Departments only open when someone arrives.
:::

Design:
- **One Lambda per bounded context** (orders, users, payments), or one per route for small functions.
- **HTTP API** (cheaper, faster) or **REST API** (usage plans, API keys, request validation, WAF).
- **Auth:** Cognito / JWT authorizer or Lambda authorizer; IAM auth for service-to-service.
- Each function has its **own IAM role** (least privilege) and env config from SSM/Secrets Manager.
- **Data:** DynamoDB per service; async work through SQS/EventBridge.
- **Stages** (dev/prod) and **Lambda aliases** for safe deploys.
- **Observability:** X-Ray tracing, structured logs, CloudWatch alarms on 5XX and latency.
- Deploy with SAM, CDK, or Terraform.

**Example:**
```
Client -> API Gateway (JWT authorizer, throttling, WAF)
            |-- GET  /orders/{id}  -> Lambda orders-read  -> DynamoDB orders
            |-- POST /orders       -> Lambda orders-write -> DynamoDB + EventBridge
            +-- POST /payments     -> Lambda payments     -> SQS -> Lambda worker
```

:::say
I front microservices with API Gateway routes mapped to separate Lambda functions, each with its own least-privilege role and data store, using JWT or Lambda authorizers for auth. Async flows go through SQS or EventBridge, and I use stages, aliases and X-Ray for safe deploys and tracing.
:::

## How do you handle rate limiting and throttling in API Gateway?

<!-- source: 06 Q35 -->

:::note In simple words
A tap with a flow limiter. It lets a steady stream through (rate) and allows a small splash at once (burst). Extra water is politely refused with "try again later" (HTTP 429).
:::

- API Gateway uses a **token bucket**: **rate** (requests/second) and **burst** (max at once).
- **Account-level** default per region: 10,000 rps steady, 5,000 burst (soft limit).
- **Stage and method throttling:** protect expensive endpoints, for example `POST /reports` at 20 rps.
- **Usage plans + API keys** (REST API): per-customer quotas like 1,000 requests/day.
- **AWS WAF rate-based rules** block abusive IPs.
- Protect the backend too: **Lambda reserved concurrency**, SQS buffering, DynamoDB on-demand.
- Clients should retry with **exponential backoff and jitter** on 429.
- Monitor the `Count`, `4XXError`, and Lambda `Throttles` metrics.

**Example:**
```bash
aws apigateway update-stage --rest-api-id a1b2c3 --stage-name prod \
  --patch-operations \
  op=replace,path=/*/*/throttling/rateLimit,value=500 \
  op=replace,path=/*/*/throttling/burstLimit,value=1000

aws lambda put-function-concurrency --function-name reports \
  --reserved-concurrent-executions 50
```

:::say
API Gateway throttles with a token bucket at account, stage and method levels, and REST APIs add usage plans with per-key quotas that return 429 when exceeded. I also add WAF rate-based rules, reserved concurrency on Lambda, and make clients retry with exponential backoff.
:::

## What are best practices for AWS serverless services (Lambda, API Gateway, DynamoDB)?

<!-- source: 06 Q36 -->

:::note In simple words
Serverless is like taking taxis instead of owning cars. Cheap and easy, but plan for traffic jams (throttles), short trips (timeouts), and not leaving the meter running.
:::

**Lambda:**
- Small, single-purpose functions; initialize SDK clients **outside the handler** to reuse connections.
- Right-size memory (also gives more CPU); use **Graviton (arm64)**.
- Set sensible timeouts, **reserved concurrency** to protect downstreams, **provisioned concurrency** or SnapStart for cold-start-sensitive APIs.
- Make handlers **idempotent**; use **DLQs / on-failure destinations**.
- Least-privilege role per function; secrets from Secrets Manager, not plain env vars.

**API Gateway:** throttling, request validation, authorizers, caching, WAF.

**DynamoDB:** design around access patterns and a good partition key (avoid hot keys), on-demand for spiky traffic, TTL for expiring data, PITR backups, GSIs carefully.

**Ops:** IaC (SAM/CDK/Terraform), X-Ray, structured logs, alarms on Errors, Throttles, Duration.

**Example:**
```
import boto3
ddb = boto3.resource("dynamodb").Table("orders")   # created once, reused

def handler(event, context):
    ddb.put_item(Item={"pk": event["id"], "status": "NEW"},
                 ConditionExpression="attribute_not_exists(pk)")   # idempotent
```

:::say
I keep Lambdas small and idempotent, reuse connections outside the handler, right-size memory, and use reserved or provisioned concurrency and DLQs. API Gateway gets throttling and authorizers, and DynamoDB tables are designed around access patterns with good partition keys, TTL and PITR.
:::

## How would you design separate environments (Dev, Test, Prod) in AWS?

<!-- source: 06 Q37 -->

:::note In simple words
Give each environment its own house rather than separate rooms in one house, so a fire in the test kitchen cannot reach production.
:::

- **Separate AWS accounts per environment** under **AWS Organizations** (strongest isolation of blast radius, billing and limits).
- **OU structure:** Security (log-archive, audit), Infrastructure (network, shared services), Workloads (dev, test, prod).
- **AWS Control Tower** or Account Factory for guardrails and account vending.
- **SCPs:** for example deny leaving approved regions, deny disabling CloudTrail, block public S3.
- **IAM Identity Center** for SSO; developers get broad access in dev, read-only in prod.
- **Non-overlapping CIDRs**, connected via Transit Gateway if needed.
- **Same IaC code**, different variables per env; promote the same artifact dev -> test -> prod.
- Tag everything (`env`, `owner`, `cost-center`); budgets per account.

**Example:**
```
Root (Organizations, SCPs)
 +-- Security OU      : log-archive, audit
 +-- Infrastructure OU: network (TGW), shared-services (ECR, CI)
 +-- Workloads OU
      +-- dev   (10.10.0.0/16)  developers: PowerUser
      +-- test  (10.20.0.0/16)
      +-- prod  (10.30.0.0/16)  developers: ReadOnly, deploy only via CI role
```

:::say
I use a separate AWS account per environment under Organizations with OUs, SCP guardrails and SSO through IAM Identity Center. The same Terraform code with per-environment variables builds each one, CIDRs do not overlap, and only the CI/CD role can deploy to prod.
:::

## What are best practices for VPC design at enterprise scale?

<!-- source: 06 Q38 -->

:::note In simple words
Plan a city before building it: reserve non-overlapping street numbers, build roads in every district, and put one central highway interchange instead of private bridges between every pair of towns.
:::

- **IP planning:** non-overlapping CIDRs across all accounts and on-prem; use **VPC IPAM**; leave room for growth (EKS pods consume many IPs).
- **3 AZs**, tiered subnets: public (LB, NAT), private app, isolated data.
- **One NAT Gateway per AZ** for resilience (or a centralized egress VPC to save cost).
- **Hub-and-spoke with Transit Gateway**; separate TGW route tables for prod and non-prod.
- **Shared VPCs via AWS RAM** so a network team owns networking and app teams deploy into it.
- **VPC endpoints** (S3/DynamoDB gateway, others via interface) to cut NAT cost and keep traffic private.
- **Security:** SG-to-SG references, NACLs for coarse rules, Network Firewall in an inspection VPC.
- **Visibility:** VPC Flow Logs, Route 53 Resolver query logs.
- **Hybrid:** Direct Connect with VPN backup; Route 53 Resolver endpoints for hybrid DNS.
- Everything in **IaC**.

**Example:**
```
          On-prem ==DX/VPN==+
                            |
  Inspection VPC <---> Transit Gateway <---> Egress VPC (NAT x3)
                       /     |      \
                 prod VPC  test VPC  shared-services VPC
                 3 AZ x (public | app | data) subnets
```

:::say
I start with an IPAM-managed, non-overlapping CIDR plan, build VPCs across three AZs with public, app and data tiers, and connect them hub-and-spoke through Transit Gateway with separate route tables. I add VPC endpoints, centralized egress and inspection, flow logs, and manage it all with Terraform.
:::

## How do you design a highly available architecture across Multi-AZ and Multi-Region?

<!-- source: 06 Q39 -->

*Also asked as:* Design a highly available backend on AWS.

:::note In simple words
Multi-AZ is having two kitchens in the same city so one fire does not stop dinner. Multi-Region is having a kitchen in another city in case the whole city loses power.
:::

**Multi-AZ (default for production):**
- ALB across 3 AZs; ASG/EKS nodes spread across AZs.
- RDS Multi-AZ, ElastiCache with replicas and auto-failover, MSK across 3 AZs.
- NAT Gateway per AZ; stateless apps; sessions in Redis/DynamoDB.

**Multi-Region (for DR or global users):**
- **Data replication:** Aurora Global Database, DynamoDB Global Tables, S3 Cross-Region Replication, cross-region RDS replicas.
- **Traffic:** Route 53 failover/latency records with health checks, or Global Accelerator.
- **Infra parity** through the same IaC in both regions; images replicated in ECR.
- Choose **active-passive** (cheaper) or **active-active** (complex, needs conflict handling).
- Regularly **test failover** (game days).

**Example:**
```
            Route 53 / Global Accelerator (health checks)
               /                                 \
   ap-south-1 (primary)                     ap-southeast-1 (DR)
   ALB -> EKS (3 AZ)                         ALB -> EKS (scaled down)
   Aurora writer ======= Global DB =======> Aurora reader (promote on DR)
   S3 bucket ============ CRR ============> S3 bucket
```

:::say
Within a region I spread every layer across three AZs: ALB, autoscaled compute, Multi-AZ databases and per-AZ NAT, keeping apps stateless. For multi-region I replicate data with Aurora Global Database, DynamoDB Global Tables and S3 CRR, deploy the same IaC in both regions, and fail over with Route 53 health checks or Global Accelerator.
:::

## What is your approach for centralized secrets management for 100+ microservices?

<!-- source: 06 Q42 -->

:::note In simple words
One secure bank vault with a separate locker per service. Each service's badge opens only its own locker, and the vault logs every opening.
:::

- **Single source of truth:** AWS Secrets Manager (or HashiCorp Vault) with a naming convention `/<env>/<service>/<name>`.
- **Identity-based access:** each service gets its own IAM role (IRSA or EKS Pod Identity, ECS task role) allowed only `secretsmanager:GetSecretValue` on its own path.
- **Delivery into apps:** External Secrets Operator syncs to Kubernetes Secrets, or Secrets Store CSI driver mounts them; ECS injects via `secrets` in the task definition.
- **Encryption** with a customer-managed KMS key per environment.
- **Rotation** automated; apps reload.
- **Cross-account** sharing via resource policies when needed.
- **Audit** with CloudTrail; alert on unusual access. Never store secrets in Git (use SOPS or sealed secrets for GitOps if needed).
- Enforce with policy (OPA/Kyverno: no plain env secrets).

**Example:**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: orders-db, namespace: orders }
spec:
  refreshInterval: 1h
  secretStoreRef: { name: aws-secrets-manager, kind: ClusterSecretStore }
  target: { name: orders-db }
  data:
    - secretKey: password
      remoteRef: { key: prod/orders/db, property: password }
```

:::say
I store all secrets centrally in Secrets Manager with a per-environment, per-service path and give each service its own IAM role scoped to its path through IRSA or task roles. External Secrets Operator delivers them into pods, KMS encrypts them, rotation is automated and CloudTrail audits access.
:::

## What strategy do you use to rotate access keys automatically?

<!-- source: 06 Q43 -->

:::note In simple words
The best key is no key at all. If you must have one, replace it on a timer and throw the old one away after everyone has the new one.
:::

1. **Eliminate long-lived keys first:** IAM roles for EC2/Lambda, IRSA/Pod Identity for EKS, **OIDC federation** for GitHub Actions/GitLab/Jenkins, IAM Identity Center for humans.
2. For unavoidable keys (legacy third-party tools):
   - An **EventBridge scheduled Lambda** creates a new key (IAM allows 2 per user), stores it in **Secrets Manager**, lets consumers pick it up, then **deactivates** the old key after a grace period and **deletes** it later.
   - Or use Secrets Manager rotation with a custom Lambda for IAM keys.
3. **Detect** with AWS Config rule `access-keys-rotated` (for example max 90 days) and IAM credential report; alert on keys unused for 90 days.
4. **SCP** can deny `iam:CreateAccessKey` except for approved roles.

**Example:**
```bash
aws iam create-access-key --user-name legacy-tool
aws secretsmanager put-secret-value --secret-id legacy-tool/keys --secret-string file://k.json
aws iam update-access-key --user-name legacy-tool --access-key-id AKIAOLD... --status Inactive
aws iam delete-access-key --user-name legacy-tool --access-key-id AKIAOLD...

aws configservice put-config-rule --config-rule '{"ConfigRuleName":"keys-rotated",
  "Source":{"Owner":"AWS","SourceIdentifier":"ACCESS_KEYS_ROTATED"},
  "InputParameters":"{\"maxAccessKeyAge\":\"90\"}"}'
```

:::say
My main strategy is to remove access keys entirely using roles, IRSA and OIDC for CI/CD. For the few that must exist, a scheduled Lambda creates a new key, stores it in Secrets Manager, deactivates and later deletes the old one, and an AWS Config rule flags any key older than 90 days.
:::

## What metrics do you monitor for EC2, ECS, and RDS using CloudWatch?

<!-- source: 06 Q44 -->

*Also asked as:* How do you monitor AWS resources with CloudWatch?

:::note In simple words
Like a car dashboard: speed (CPU), fuel (memory/disk), engine warnings (status checks), and for the database, how many passengers (connections) and how slow the doors open (latency).
:::

| Service | Key metrics |
| --- | --- |
| EC2 | CPUUtilization, CPUCreditBalance (T types), StatusCheckFailed_System/Instance, NetworkIn/Out, EBS VolumeQueueLength, BurstBalance; memory and disk via CloudWatch Agent |
| ECS | Service CPUUtilization, MemoryUtilization, RunningTaskCount vs desired, Container Insights (restarts, task-level), ALB TargetResponseTime, HTTPCode_Target_5XX, UnHealthyHostCount |
| RDS | CPUUtilization, DatabaseConnections, FreeableMemory, FreeStorageSpace, Read/WriteLatency, Read/WriteIOPS, DiskQueueDepth, ReplicaLag, SwapUsage, BurstBalance; Performance Insights for top SQL |

**CloudWatch building blocks:**
- **Metrics:** free default metrics per service (EC2 every 5 min, 1 min with detailed monitoring); custom metrics via `put-metric-data`.
- **CloudWatch Agent:** needed for **memory and disk** usage on EC2 (not sent by default) and to ship log files.
- **Alarms:** threshold or anomaly detection, composite alarms to reduce noise, actions to SNS, Auto Scaling, or EC2 recover.
- **Logs:** log groups with retention settings; **metric filters** turn log lines (for example "ERROR") into metrics.
- **Logs Insights:** query language to search and aggregate logs quickly.
- **Dashboards:** one view per service or environment; **Container Insights** for ECS/EKS, **Synthetics** canaries for URLs.

Good alarm practice: alarm on **symptoms** (latency, errors) first, use **percentiles (p95/p99)**, require several datapoints to avoid noise, and send to SNS -> Teams/Slack/pager.

**Example:**
```
# Logs Insights: top 5XX paths in the last hour
fields @timestamp, path, status
| filter status >= 500
| stats count(*) as errors by path
| sort errors desc
| limit 10
```
```bash
aws cloudwatch put-metric-alarm --alarm-name rds-orders-low-storage \
  --namespace AWS/RDS --metric-name FreeStorageSpace \
  --dimensions Name=DBInstanceIdentifier,Value=orders-prod \
  --statistic Average --period 300 --evaluation-periods 3 \
  --threshold 10737418240 --comparison-operator LessThanThreshold \
  --alarm-actions arn:aws:sns:ap-south-1:111111111111:db-alerts
```

:::say
For EC2 I watch CPU, credit balance, status checks and memory/disk through the CloudWatch agent; for ECS, service CPU and memory, running vs desired tasks and ALB errors and latency; for RDS, CPU, connections, free storage and memory, latency, IOPS and replica lag. I combine metrics, log groups with metric filters, Logs Insights queries and dashboards, and alarms use multiple datapoints and route through SNS to our Teams channels.
:::
