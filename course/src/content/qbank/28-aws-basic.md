---
track: qbank
title: "AWS: Basic questions"
short: Aws basic
sub: 14 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Which AWS services have you worked on, and which are you most proficient in?

<!-- source: 06 Q1 -->

*Also asked as:* What AWS services are you proficient in? How many AWS services have you used? Which AWS services have you used in production?

:::note In simple words
The interviewer is not asking for a shopping list. They want to hear which services you have actually run in production and what you did with each one.
:::

Group your answer by category and attach a real task to each service. Five services you truly understand beat twenty you only read about.

- **Compute:** EC2, EKS, Lambda, Auto Scaling Groups
- **Networking:** VPC, subnets, Security Groups, ALB/NLB, Route 53, VPC endpoints
- **Data:** RDS (PostgreSQL/MySQL), ElastiCache (Redis), MSK (Kafka), S3
- **Operations:** CloudWatch (metrics, alarms, logs), EventBridge, SNS, SES, Systems Manager
- **Security:** IAM roles and policies, Secrets Manager, KMS

**Example:**
```
"I work across about 15 services daily. EKS runs our apps, RDS/ElastiCache/MSK are the
data layer, CloudWatch + EventBridge + Lambda power our alerting and daily health
reports to Teams, and IAM roles give every workload least-privilege access."
```

:::say
I have hands-on experience with roughly 15 AWS services, mainly EC2, EKS, VPC, RDS, ElastiCache, MSK, S3, IAM, CloudWatch, Lambda and EventBridge. For example, I built Lambda functions triggered by EventBridge that collect EKS, RDS, Redis and Kafka health and post a daily report to Teams, using an IAM execution role rather than stored keys.
:::

## What is the purpose of a NAT Gateway?

<!-- source: 06 Q4 -->

:::note In simple words
A NAT Gateway is a one-way door for a private room: people inside can go out to the market and come back with shopping, but strangers from the street cannot walk in.
:::

- Gives instances in **private subnets outbound-only** internet access (OS updates, calling external APIs, pulling public images).
- Inbound connections started from the internet are **not allowed** through it.
- It lives in a **public subnet**, has an **Elastic IP**, and private route tables point `0.0.0.0/0 -> nat-xxxx`.
- It is **zonal**: create **one per AZ** so an AZ failure does not cut off the other AZs (and to avoid cross-AZ data charges).
- **Cost:** hourly charge plus a per-GB data processing charge (about $0.045/GB in many regions). Use free S3/DynamoDB gateway endpoints to keep that traffic off the NAT.
- Managed and scales automatically, unlike a self-managed NAT instance.
- For IPv6, the equivalent is an **Egress-Only Internet Gateway**.

**Example:**
```
private-a route table:  10.0.0.0/16 -> local
                        0.0.0.0/0   -> nat-0aaa (in public-a)
private-b route table:  0.0.0.0/0   -> nat-0bbb (in public-b)

aws ec2 create-nat-gateway --subnet-id subnet-public-a --allocation-id eipalloc-0abc
```

:::say
A NAT Gateway lets resources in private subnets reach the internet outbound while blocking inbound connections from the internet. I place one in a public subnet per AZ with an Elastic IP, point private route tables to it, and keep S3 and DynamoDB traffic on gateway endpoints because NAT charges per GB processed.
:::

## What is the difference between a Security Group and a NACL?

<!-- source: 06 Q5 -->

*Also asked as:* NACL vs Security Group.

:::note In simple words
A Security Group is a bouncer at each person's door who remembers who they let in. A NACL is the security guard at the gate of the whole building who checks everyone, both coming in and going out, and remembers nothing.
:::

| Feature | Security Group | NACL |
| --- | --- | --- |
| Level | Instance / ENI | Subnet |
| State | Stateful (return traffic auto-allowed) | Stateless (must allow return traffic) |
| Rules | Allow only | Allow and Deny |
| Evaluation | All rules together | In number order, first match wins |
| Default | Deny all inbound, allow all outbound | Default NACL allows all |

A common trap: with NACLs you must allow **ephemeral ports 1024-65535** outbound, or response traffic is dropped.

**Example:**
```
SG app-sg     : inbound 8080 from alb-sg (reference SG, not IP)
NACL private  : rule 100 ALLOW tcp 8080 from 10.0.1.0/24
                rule 110 ALLOW tcp 1024-65535 outbound (return traffic)
                rule 90  DENY  all from 203.0.113.50/32 (block a bad IP)
```

:::say
Security Groups are stateful, allow-only firewalls attached to instances, while NACLs are stateless subnet-level rules that support explicit deny and are evaluated in order. I use Security Groups for normal access control and NACLs only for broad subnet rules like blocking a malicious IP range.
:::

## What are the different S3 storage classes and their use cases?

<!-- source: 06 Q7 -->

:::note In simple words
Like storing things at home: the kitchen shelf (fast, expensive), the attic (cheaper, a bit slower), and a storage unit in another city (very cheap, takes hours to get things back).
:::

| Class | Use case | Notes |
| --- | --- | --- |
| Standard | Frequently accessed data | Default, millisecond access |
| Intelligent-Tiering | Unknown/changing access patterns | Auto-moves objects, small monitoring fee |
| Standard-IA | Infrequent access, needs fast retrieval | 30-day min, retrieval fee |
| One Zone-IA | Re-creatable infrequent data | Single AZ, cheaper |
| Glacier Instant Retrieval | Archives read about once a quarter | ms access, 90-day min |
| Glacier Flexible Retrieval | Backups, minutes-to-hours restore | 90-day min |
| Glacier Deep Archive | Compliance data kept 7-10 years | Cheapest, 12-48h restore, 180-day min |
| Express One Zone | Very low-latency, high request rate | Single AZ, directory buckets |

**Example:**
```
App uploads (hot)        -> Standard
Logs older than 30 days  -> Standard-IA
Logs older than 90 days  -> Glacier Flexible Retrieval
Audit data (7 years)     -> Glacier Deep Archive
```

:::say
S3 has classes from Standard for hot data, through Infrequent Access and Intelligent-Tiering, down to Glacier tiers for archives. I pick based on how often the data is read and how fast it must come back, and I use lifecycle rules to move data down the tiers automatically.
:::

## What is an S3 lifecycle policy?

<!-- source: 06 Q8 -->

*Also asked as:* Configure a lifecycle rule to move an object to Glacier after 60 days and delete it after 90 days.

:::note In simple words
An automatic cleaning schedule for a warehouse: after 30 days move boxes to the back room, after a year send them to off-site storage, after 3 years throw them out.
:::

Lifecycle rules act on objects (optionally filtered by prefix or tag):
- **Transition actions:** move objects to a cheaper class after N days.
- **Expiration actions:** delete objects after N days.
- **Noncurrent version rules:** clean old versions in versioned buckets.
- **Abort incomplete multipart uploads:** removes hidden half-uploaded parts that you still pay for.

**Example:**
```json
{
  "Rules": [{
    "ID": "logs-tiering",
    "Filter": { "Prefix": "logs/" },
    "Status": "Enabled",
    "Transitions": [
      { "Days": 30, "StorageClass": "STANDARD_IA" },
      { "Days": 90, "StorageClass": "GLACIER" }
    ],
    "Expiration": { "Days": 1095 },
    "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
  }]
}
```
```bash
aws s3api put-bucket-lifecycle-configuration --bucket my-logs \
  --lifecycle-configuration file://lifecycle.json
```

**Follow-up: "Move an object to Glacier after 60 days and delete it after 90 days."**
```json
{
  "Rules": [{
    "ID": "glacier-60-delete-90",
    "Filter": { "Prefix": "" },
    "Status": "Enabled",
    "Transitions": [{ "Days": 60, "StorageClass": "GLACIER" }],
    "Expiration": { "Days": 90 }
  }]
}
```
```hcl
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "glacier-60-delete-90"
    status = "Enabled"
    filter {}

    transition {
      days          = 60
      storage_class = "GLACIER"
    }

    expiration {
      days = 90
    }
  }
}
```

**Cost gotcha (mention this in the interview):**
- Glacier Flexible Retrieval (`GLACIER`) has a **90-day minimum storage duration**. An object moved on day 60 and deleted on day 90 has stayed only 30 days in Glacier, so you pay an **early-deletion fee** as if it stayed the full 90 days there. Moving it may cost more than leaving it in Standard.
- Better options: just **expire at 90 days** with no transition, or use Standard-IA (30-day minimum), or Glacier Instant Retrieval (still 90-day minimum, so same issue).
- Lifecycle transitions also have per-request costs, and by default objects **smaller than 128 KB are not transitioned** (it is not cost-effective), so millions of tiny log files may stay in Standard.

:::say
A lifecycle policy automatically transitions objects to cheaper storage classes or deletes them after a set age. For example, I move logs to Standard-IA after 30 days, Glacier after 90 and delete them after 3 years, plus abort incomplete multipart uploads so we do not pay for hidden junk. For a Glacier-at-60, delete-at-90 rule I would warn that Glacier's 90-day minimum means an early-deletion charge, so simply expiring at 90 days is often cheaper.
:::

## What is CloudFront, and when would you use it?

<!-- source: 06 Q9 -->

:::note In simple words
Instead of every customer driving to your one warehouse, you put copies of popular items in small shops in every city. CloudFront is that network of shops (edge locations).
:::

- CloudFront is AWS's **CDN** with hundreds of edge locations worldwide.
- It caches content near users, cutting latency and load on the origin.
- Origins: S3, ALB, EC2, API Gateway, Lambda function URLs, or any HTTP server.
- Extra benefits: free TLS via ACM, AWS WAF and Shield integration, Origin Access Control to keep S3 private, CloudFront Functions / Lambda@Edge for logic at the edge.

Use it for static websites, images/videos, software downloads, and even dynamic APIs (it keeps optimized connections back to the origin).

**Example:**
```
User (Mumbai) -> Edge (Mumbai) --cache hit--> response in ~20 ms
                        |
                   cache miss -> Origin (S3 in us-east-1) -> cached for next user
```

:::say
CloudFront is AWS's CDN that caches content at edge locations close to users. I use it in front of S3 or an ALB to reduce latency, offload the origin, terminate TLS and attach WAF, and I keep the S3 bucket private using Origin Access Control.
:::

## What is Route 53, and how is it different from CoreDNS?

<!-- source: 06 Q10 -->

:::note In simple words
Route 53 is the public phone book of the whole city. CoreDNS is the internal extension directory inside one office building (your Kubernetes cluster).
:::

| | Route 53 | CoreDNS |
| --- | --- | --- |
| What | Managed AWS DNS service | DNS server running as pods in Kubernetes |
| Scope | Public internet and private VPC zones | Inside one cluster |
| Resolves | `app.example.com`, domains you own | `my-svc.my-ns.svc.cluster.local` |
| Extras | Domain registration, health checks, routing policies | Service discovery, plugins, forwards to upstream DNS |

Route 53 routing policies: simple, weighted, latency, failover, geolocation, geoproximity, multivalue, IP-based.

**Example:**
```
Browser -> Route 53: api.example.com -> ALB DNS name
Pod     -> CoreDNS : orders.prod.svc.cluster.local -> 172.20.14.9 (ClusterIP)
Pod     -> CoreDNS : rds.amazonaws.com -> forwards to VPC resolver (.2)
```

:::say
Route 53 is AWS's managed DNS for public and private domains, with health checks and routing policies like failover and latency. CoreDNS runs inside Kubernetes and resolves service names to ClusterIPs for pod-to-pod discovery, forwarding external names to the VPC resolver.
:::

## What is a read replica in RDS?

<!-- source: 06 Q11 -->

:::note In simple words
The main database is the teacher writing on the board. Read replicas are students copying the board so other people can read from them without disturbing the teacher.
:::

- A read-only copy of the primary database, updated with **asynchronous replication**.
- Offloads read-heavy traffic (reports, dashboards, search).
- Can be in the same AZ, another AZ, or **another region** (cross-region DR).
- Because replication is async, replicas can lag (check `ReplicaLag` metric).
- A replica can be **promoted** to a standalone primary.
- Different from Multi-AZ standby: a classic Multi-AZ standby is synchronous and not readable.

**Example:**
```bash
aws rds create-db-instance-read-replica \
  --db-instance-identifier orders-replica-1 \
  --source-db-instance-identifier orders-prod \
  --db-instance-class db.r6g.large
```

:::say
A read replica is an asynchronously replicated, read-only copy of an RDS instance used to scale reads and for cross-region DR. It differs from Multi-AZ, which is a synchronous standby for high availability, and a replica can be promoted to a primary if needed.
:::

## Explain the architecture of Amazon ECS.

<!-- source: 06 Q12 -->

:::note In simple words
ECS is a restaurant manager. The task definition is the recipe, a task is one cooked dish, a service makes sure there are always N dishes on the counter, and the cluster is the kitchen.
:::

- **Cluster:** logical group of capacity.
- **Task definition:** JSON blueprint (image, CPU/memory, ports, env, IAM task role, log config).
- **Task:** a running instance of a task definition (one or more containers).
- **Service:** keeps the desired number of tasks running, replaces failed ones, integrates with ALB/NLB, does rolling or blue/green deploys.
- **Launch types / capacity:** Fargate (serverless, no servers) or EC2 (your ASG with the ECS agent), managed through **capacity providers**.
- **Networking:** `awsvpc` mode gives each task its own ENI and Security Group.
- Control plane is fully managed by AWS; Service Connect / Cloud Map handle service discovery.

**Example:**
```
ECS Cluster "prod"
 +-- Service "orders" (desired=4) --> ALB target group
 |     +-- Task (Fargate, ENI 10.0.11.23) -> container orders:1.4.2
 |     +-- Task (Fargate, ENI 10.0.12.41)
 +-- Capacity providers: FARGATE, FARGATE_SPOT
```

:::say
ECS has clusters, task definitions that describe containers, tasks that are running copies, and services that keep a desired count running behind a load balancer. Capacity comes from Fargate or EC2 instances via capacity providers, and AWS fully manages the control plane.
:::

## Why use Amazon EKS instead of ECS? What are the key differences?

<!-- source: 06 Q13 -->

*Also asked as:* ECS vs EKS.

:::note In simple words
ECS is an automatic car from one brand: simple, just drive. EKS is a manual sports car that works the same everywhere: more control and portability, but you must know how to drive it.
:::

| | ECS | EKS |
| --- | --- | --- |
| Orchestrator | AWS proprietary | Upstream Kubernetes |
| Learning curve | Low | High |
| Portability | AWS only | Any cloud / on-prem |
| Control plane cost | Free | About $0.10/hour per cluster |
| Ecosystem | AWS integrations | Helm, ArgoCD, operators, service mesh, KEDA |
| Ops effort | Low | Higher (upgrades, add-ons, CNI) |

Choose **ECS** for a small team, AWS-only, simple microservices. Choose **EKS** when you need Kubernetes tooling, multi-cloud portability, custom operators, or already have Kubernetes skills.

**Example:**
```
Startup, 10 services, AWS only          -> ECS on Fargate
Platform team, 100+ services, GitOps,
Helm charts, Kafka operators, hybrid     -> EKS (+ Karpenter, ArgoCD)
```

:::say
ECS is simpler and AWS-native with no control plane fee, while EKS gives standard Kubernetes with its huge ecosystem and portability at the cost of more operational work. I choose EKS when we need Helm, GitOps, operators or multi-cloud, and ECS when simplicity matters more.
:::

## Which services can be integrated with a CDN (CloudFront)?

<!-- source: 06 Q14 -->

:::note In simple words
A CDN can sit in front of almost anything that speaks HTTP, and it can call helpers for security and small bits of logic.
:::

**Origins CloudFront can serve from:**
- Amazon S3 (with Origin Access Control)
- Application Load Balancer, EC2, NLB (VPC origins allow private ALB/EC2)
- API Gateway and Lambda function URLs
- AWS Elemental MediaPackage / MediaStore (video streaming)
- Any custom HTTP origin, even on-premises

**Services that plug into CloudFront:**
- AWS WAF (filter attacks), AWS Shield (DDoS)
- ACM (free TLS certificates, must be in us-east-1)
- CloudFront Functions and Lambda@Edge (redirects, headers, auth)
- Route 53 (alias records), CloudWatch and S3 for logs

**Example:**
```
Route53 (alias) -> CloudFront + WAF + ACM cert
                     |-- /static/*  -> S3 bucket (OAC)
                     |-- /api/*     -> ALB -> EKS
                     +-- /img/*     -> Lambda@Edge resize -> S3
```

:::say
CloudFront integrates with S3, ALB, EC2, API Gateway, Lambda function URLs, media services and any custom HTTP origin. Around it I add WAF, Shield, ACM certificates and edge functions, with Route 53 alias records pointing the domain to the distribution.
:::

## What is the default port for DynamoDB?

<!-- source: 06 Q15 -->

:::note In simple words
DynamoDB is not a database server you dial into on a special number like MySQL (3306). It is a web service: you talk to it like a website, over HTTPS.
:::

- DynamoDB is a **managed HTTPS API**. Clients (SDK/CLI) call endpoints like `dynamodb.ap-south-1.amazonaws.com` on **port 443**.
- There is **no database port** to open and no connection to keep, unlike RDS (MySQL 3306, PostgreSQL 5432).
- Every request is signed with **IAM credentials (SigV4)**; access is controlled by IAM policies, not passwords.
- **DynamoDB Local** (the downloadable version for testing) listens on **port 8000** by default.
- To reach it privately from private subnets, use a **gateway VPC endpoint** for DynamoDB (free), so no NAT is needed.

**Example:**
```bash
aws dynamodb list-tables --region ap-south-1          # HTTPS 443 to AWS endpoint

docker run -p 8000:8000 amazon/dynamodb-local
aws dynamodb list-tables --endpoint-url http://localhost:8000   # local testing
```

:::say
DynamoDB has no traditional database port; it is an HTTPS API reached on port 443 with IAM-signed requests. DynamoDB Local uses port 8000 for testing, and in a VPC I reach DynamoDB privately through a free gateway endpoint.
:::

## How do you add storage to an existing EC2 instance?

<!-- source: 06 Q16 -->

:::note In simple words
Either plug in an extra hard disk (new EBS volume) or make the existing disk bigger (resize). Both can be done while the computer keeps running.
:::

**Option A - Add a new EBS volume:**
1. Create an EBS volume in the **same AZ** as the instance (gp3 recommended).
2. **Attach** it to the instance.
3. On the instance: `lsblk` to find the device (for example `/dev/nvme1n1`).
4. Format it (`mkfs`) - only for a new, empty volume.
5. Mount it and add it to `/etc/fstab` using the **UUID** and the `nofail` option, so a missing disk does not block boot.

**Option B - Grow an existing volume (no downtime):**
1. `aws ec2 modify-volume` to increase the size.
2. `growpart` to extend the partition.
3. `resize2fs` (ext4) or `xfs_growfs` (XFS) to extend the filesystem.
Take a **snapshot first**. You can grow a volume but not shrink it, and you must wait about 6 hours between modifications of the same volume.

**Example:**
```bash
aws ec2 create-volume --availability-zone ap-south-1a --size 100 --volume-type gp3
aws ec2 attach-volume --volume-id vol-0new --instance-id i-0abc --device /dev/sdf
lsblk
sudo mkfs -t xfs /dev/nvme1n1
sudo mkdir /data && sudo mount /dev/nvme1n1 /data
echo "UUID=$(sudo blkid -s UUID -o value /dev/nvme1n1) /data xfs defaults,nofail 0 2" \
  | sudo tee -a /etc/fstab

# Grow existing root volume
aws ec2 modify-volume --volume-id vol-0root --size 50
sudo growpart /dev/nvme0n1 1
sudo xfs_growfs -d /          # or: sudo resize2fs /dev/nvme0n1p1
```

:::say
I either create a new EBS volume in the same AZ, attach it, format, mount and add it to fstab by UUID with nofail, or I grow the existing volume with modify-volume and then growpart and resize2fs or xfs_growfs. Both work without downtime, and I snapshot before changing anything.
:::

## What is the difference between an ALB and an NLB, and when would you prefer an NLB, especially with databases?

<!-- source: 06 Q17 -->

:::note In simple words
An ALB is a smart receptionist who reads each letter and sends it to the right department. An NLB is a very fast mail chute that just forwards envelopes without opening them, at huge volume, from a fixed address.
:::

| | ALB | NLB |
| --- | --- | --- |
| OSI layer | Layer 7 (HTTP/HTTPS, gRPC, WebSocket) | Layer 4 (TCP, UDP, TLS) |
| Routing | Host, path, header, query, method rules | Port-based only |
| Static IP | No (DNS name only) | Yes, one static IP per AZ, can use Elastic IPs |
| Performance | Good, adds a few ms | Ultra-low latency, millions of requests/sec |
| Client IP | In `X-Forwarded-For` header | Preserved at the packet level |
| Extras | WAF, Cognito/OIDC auth, redirects, fixed responses | PrivateLink endpoint services, TLS passthrough |
| Targets | Instances, IPs, Lambda | Instances, IPs, ALB |

**Prefer an NLB when:**
- The protocol is not HTTP (databases, MQTT, gaming, UDP, SMTP).
- A partner must **allowlist fixed IPs**.
- You need **PrivateLink**: an endpoint service must sit behind an NLB (or GWLB).
- You need extreme throughput or the original client IP.

**Databases:**
- Fronting a **self-managed DB cluster** on EC2 (for example PostgreSQL/Kafka/Redis nodes) with a TCP NLB.
- Exposing **RDS privately to another VPC or account via PrivateLink**: NLB with **IP targets** pointing to the RDS IP (keep it updated on failover, since the IP changes) or use RDS Proxy.
- For normal use **RDS needs no load balancer**: the endpoint DNS name plus Multi-AZ failover handles it; reads go to the reader endpoint.

**GWLB (Gateway Load Balancer):** Layer 3, used to insert firewalls/IDS appliances transparently (GENEVE), for example in an inspection VPC.

**Example:**
```text
aws elbv2 create-load-balancer --name db-nlb --type network --scheme internal \
  --subnets subnet-a subnet-b
aws elbv2 create-target-group --name pg-tg --protocol TCP --port 5432 \
  --vpc-id vpc-0abc --target-type ip
aws ec2 create-vpc-endpoint-service-configuration \
  --network-load-balancer-arns <nlb-arn> --acceptance-required
```

:::say
The ALB is a layer 7 HTTP load balancer with path and host routing, WAF and auth, while the NLB is layer 4 for TCP, UDP and TLS with static IPs, very low latency and client IP preservation. I choose an NLB for non-HTTP protocols like databases, for fixed-IP allowlisting and for PrivateLink, for example to share a database with another account, though plain RDS does not need a load balancer because its endpoint and Multi-AZ failover handle routing.
:::
