---
track: qbank
title: "AWS: Advanced questions (part 1 of 3)"
short: Aws advanced 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you allow one AWS account to safely access resources in another account (cross-account access)?

<!-- source: 06 Q19 -->

*Also asked as:* How do you secure cross-account access using IAM roles?

:::note In simple words
Account B (the house owner) makes a special key that only Account A is allowed to borrow. Account A borrows it, uses it for one hour to do only the allowed job, and the key disappears.
:::

Steps using **cross-account IAM roles**:
1. **Account B (target)** creates a role, for example `ProdS3ReadRole`.
2. Its **trust policy** names Account A (ideally a specific role, not the whole account) and can require an `ExternalId` or MFA.
3. Its **permission policy** gives least privilege, for example only `s3:GetObject` on one bucket.
4. **Account A** gives its user/role permission to call `sts:AssumeRole` on that role ARN.
5. Account A calls STS and receives temporary credentials (15 min to 12 h).

Why it is secure: no stored keys, credentials expire, least privilege, revocable instantly by editing the trust policy, and every call is logged in **CloudTrail** in both accounts.

**Example:**
```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111111111111:role/jenkins-ci" },
  "Action": "sts:AssumeRole",
  "Condition": { "StringEquals": { "sts:ExternalId": "ci-prod-2026" } }
}
```
```bash
aws sts assume-role \
  --role-arn arn:aws:iam::222222222222:role/ProdS3ReadRole \
  --role-session-name ci-cd --external-id ci-prod-2026
```

:::say
I create a role in the target account whose trust policy allows only a specific role in the source account, with least-privilege permissions. The source assumes it through STS to get temporary credentials, so nothing is stored, access expires automatically, and CloudTrail audits every call.
:::

## How would you access data in an S3 bucket in Account A from an application running on EC2 in Account B? What permissions are needed on the bucket side?

<!-- source: 06 Q20 -->

*Also asked as:* An app in one AWS account needs to access an S3 bucket in another account - how do you set it up securely? How do you provide access to an S3 bucket?

:::note In simple words
For cross-account access, both sides must say yes: the visitor's company must allow the trip (IAM policy in B), and the building owner must allow the visitor in (bucket policy in A).
:::

**Option 1 - Bucket policy + instance role (simple, direct):**
1. EC2 in Account B has an **instance profile role** `app-role`.
2. `app-role` identity policy allows `s3:GetObject`/`s3:ListBucket` on the bucket ARN.
3. **Bucket policy in Account A** allows principal `arn:aws:iam::B:role/app-role`.
4. If the bucket uses **SSE-KMS**, the KMS key policy in A must also allow the role to `kms:Decrypt`.
5. For uploads, set Object Ownership to **BucketOwnerEnforced** so Account A owns objects.

**Option 2 - Assume a role in Account A:** Account A creates a role with S3 access trusting B's role; the app calls `sts:AssumeRole`. Better when access covers many resources in A.

**Option 3 - Pre-signed URLs:** someone with access in Account A generates a time-limited URL for one object. Good for one-off downloads/uploads by users or systems that have no AWS identity.

| Option | Use when |
| --- | --- |
| Bucket policy + cross-account principal | One bucket, steady app access, simplest to audit |
| IAM role + AssumeRole | Many resources in Account A, or Account A wants full control of permissions |
| Pre-signed URL | Temporary access to a single object, no AWS identity on the client |

Never copy access keys onto the instance.

**Example (bucket policy in Account A):**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::222222222222:role/app-role" },
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": ["arn:aws:s3:::reports-bucket", "arn:aws:s3:::reports-bucket/*"]
  }]
}
```
```bash
# Option 3: pre-signed URL valid for 1 hour
aws s3 presign s3://reports-bucket/2026/09/report.pdf --expires-in 3600
```

:::say
I give the EC2 instance an IAM role whose policy allows the needed S3 actions, and in Account A I add a bucket policy trusting that exact role ARN, because cross-account needs both sides to allow it. If the bucket is KMS-encrypted I also update the key policy, and I never place access keys on the server.
:::

## How do you secure S3 buckets in a multi-account setup?

<!-- source: 06 Q21 -->

:::note In simple words
Lock every door by default, give named keys only to people who need them, and install cameras everywhere.
:::

- **Block Public Access** at the **account level** in every account (and enforce with an SCP so no one can turn it off).
- **SCPs** in AWS Organizations: deny `s3:PutBucketPolicy` that makes buckets public, deny unencrypted uploads.
- **Bucket policies** using `aws:PrincipalOrgID` so only principals from your organization can access.
- **Encryption:** SSE-KMS with customer-managed keys; key policies per account.
- **Deny non-TLS** requests with `aws:SecureTransport`.
- **Object Ownership = BucketOwnerEnforced** (disables ACLs).
- **VPC endpoint policies** and `aws:SourceVpce` conditions for private-only buckets.
- **Visibility:** CloudTrail data events, S3 server access logs, IAM Access Analyzer, AWS Config rules, Macie for sensitive data.
- Central **log-archive account** with Object Lock for audit logs.

**Example:**
```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::shared-data", "arn:aws:s3:::shared-data/*"],
  "Condition": {
    "StringNotEquals": { "aws:PrincipalOrgID": "o-abc123xyz" }
  }
}
```

:::say
I enforce Block Public Access account-wide through SCPs, restrict bucket policies to our organization with aws:PrincipalOrgID, encrypt with KMS and deny non-TLS requests. Then I monitor with CloudTrail, Access Analyzer, Config and Macie so any drift is caught quickly.
:::

## How can you access an EC2 instance that does not have a public IP?

<!-- source: 06 Q22 -->

:::note In simple words
The house has no front door on the street, but you can still get in through a secure intercom (SSM), a guarded side gate (EC2 Instance Connect Endpoint), or a guard house (bastion).
:::

1. **SSM Session Manager (best):** needs the SSM agent, an instance role with `AmazonSSMManagedInstanceCore`, and a path to SSM (NAT or VPC interface endpoints `ssm`, `ssmmessages`, `ec2messages`). No port 22, no keys, sessions logged.
2. **EC2 Instance Connect Endpoint:** a VPC endpoint that tunnels SSH/RDP to private IPs; access controlled by IAM.
3. **Bastion host** in a public subnet (older approach; must be hardened).
4. **VPN / Direct Connect** from the office network.

**Example:**
```bash
# Session Manager
aws ssm start-session --target i-0abc123def4567890

# EC2 Instance Connect Endpoint
aws ec2-instance-connect ssh --instance-id i-0abc123def4567890 \
  --connection-type eice
```

:::say
My first choice is SSM Session Manager, which needs only the agent, an instance role and SSM endpoints, with no open SSH port and full session logging. Alternatives are EC2 Instance Connect Endpoint, a VPN, or a hardened bastion host as a last resort.
:::

## An EC2 instance in a private subnet must download packages without a NAT Gateway or bastion host. How?

<!-- source: 06 Q23 -->

*Also asked as:* You have an EC2 in a private subnet and cannot use a NAT Gateway - how else can it reach the internet for updates? Which AWS services can help?

:::note In simple words
If you cannot go out to the market, have the market deliver to your door through private delivery tunnels (VPC endpoints), or keep a pantry stocked in advance (baked AMI / internal mirror).
:::

- **S3 Gateway Endpoint (free):** Amazon Linux 2/2023 repositories are hosted on S3, so `yum`/`dnf` works through a gateway endpoint with no internet.
- **Interface endpoints (PrivateLink):** ECR (`ecr.api`, `ecr.dkr`) for images, SSM for patching via **Patch Manager**, CodeArtifact for pip/npm/Maven packages proxied from public repos.
- **Internal mirror:** sync packages into your own S3 bucket or Artifactory/Nexus and point the package manager there.
- **Bake an AMI** with EC2 Image Builder or Packer so packages are already installed.
- **Proxy instance** (Squid) in a public subnet with a domain allowlist.
- **Verification:** package managers check GPG signatures; also verify checksums of downloaded files.

**Example:**
```bash
aws ec2 create-vpc-endpoint --vpc-id vpc-0abc \
  --service-name com.amazonaws.ap-south-1.s3 \
  --vpc-endpoint-type Gateway --route-table-ids rtb-0private

# then on the instance (Amazon Linux 2023)
sudo dnf update -y
```

:::say
For Amazon Linux I add a free S3 gateway endpoint because the OS repos live in S3, and I use interface endpoints for ECR, SSM Patch Manager and CodeArtifact for language packages. For other distros I use an internal mirror or bake packages into the AMI, and GPG signatures verify integrity.
:::

## What is VPC peering and how does it work? If VPC A is peered with B, and B with C, can A talk to C?

<!-- source: 06 Q24 -->

*Also asked as:* How do you connect two VPCs?

:::note In simple words
You are friends with Bob, and Bob is friends with Carol. That does not make you friends with Carol. VPC peering is the same: a private road between exactly two VPCs, not transitive.
:::

**How peering works:**
1. VPC A sends a **peering request** to VPC B (same or different account/region); B **accepts**.
2. Add **routes on both sides**: A's route tables send B's CIDR to `pcx-xxxx`, and B's route tables send A's CIDR back.
3. Update **Security Groups** to allow the other VPC's CIDR (or referenced SGs in the same region).
4. Optionally enable **DNS resolution** across the peering so private hostnames resolve.
5. Traffic stays on the AWS backbone, no gateway or bandwidth bottleneck, and CIDRs must not overlap.

**Transitivity:**
- **No, A cannot reach C.** VPC peering is **non-transitive**. Traffic cannot hop through B.
- Also no edge-to-edge routing: A cannot use B's NAT Gateway, IGW, VPN or Direct Connect.

**Solutions for A <-> C:**
1. Create a direct **A <-> C peering** (fine for a few VPCs).
2. Use **AWS Transit Gateway** as a hub (scales to thousands of VPCs, supports route tables and segmentation).
3. **PrivateLink** if you only need to expose one service, not whole networks.

**Example:**
```text
aws ec2 create-vpc-peering-connection --vpc-id vpc-A --peer-vpc-id vpc-B
aws ec2 accept-vpc-peering-connection --vpc-peering-connection-id pcx-0abc
aws ec2 create-route --route-table-id rtb-A --destination-cidr-block 10.20.0.0/16 \
  --vpc-peering-connection-id pcx-0abc
aws ec2 create-route --route-table-id rtb-B --destination-cidr-block 10.10.0.0/16 \
  --vpc-peering-connection-id pcx-0abc

Peering (non-transitive):    A <---> B <---> C      A -X-> C

Transit Gateway (hub):             TGW
                                 /  |  \
                                A   B   C     A -> TGW -> C  works
```

:::say
VPC peering is a private one-to-one connection: one side requests, the other accepts, and both sides add routes and security group rules for each other's non-overlapping CIDR. It is not transitive, so A cannot reach C through B; I would either add a direct A-C peering or, at scale, use a Transit Gateway as a central hub with route tables, and PrivateLink if only one service needs exposing.
:::

## How can Instance 2 (with a static IP) communicate with Instance 1, which is in a private subnet behind a multi-AZ load balancer?

<!-- source: 06 Q25 -->

:::note In simple words
Instance 1 lives in a back room. Instance 2 never visits it directly; it rings the reception desk (the load balancer), and reception passes the message inside.
:::

- Instance 2 always talks to the **load balancer**, never directly to Instance 1's private IP.
- If Instance 2 is outside AWS or in another VPC over the internet: use an **internet-facing ALB/NLB** in public subnets across AZs. Allow Instance 2's **Elastic IP /32** in the LB security group.
- The target (Instance 1) security group allows traffic **only from the LB security group**.
- If the partner needs a fixed IP to allowlist on their side, use an **NLB with Elastic IPs per AZ** (or Global Accelerator).
- If Instance 2 is in the same or a peered VPC / TGW, use an **internal** load balancer and route privately.
- Instance 1 replies through the LB, so it needs no public IP or NAT for this flow.

**Example:**
```
Instance2 (EIP 3.110.10.5)
     |  HTTPS 443
     v
Internet-facing ALB (public-a, public-b)   SG: allow 443 from 3.110.10.5/32
     |  8080
     v
Instance1 (private-a 10.0.11.20)           SG: allow 8080 from alb-sg only
```

:::say
Instance 2 calls the load balancer's DNS name, and the load balancer forwards to Instance 1 in the private subnet. I allow only Instance 2's static IP on the load balancer security group and only the load balancer security group on Instance 1, using an internal load balancer instead if both are in connected VPCs.
:::

## Your application is hosted in S3 and users are in different countries. How do you reduce latency?

<!-- source: 06 Q26 -->

:::note In simple words
Do not make everyone fly to one city to pick up a parcel; open pickup points in every country.
:::

1. Put **CloudFront** in front of the S3 bucket; objects are cached at edge locations near users.
2. Keep the bucket private with **Origin Access Control (OAC)**.
3. Set good **Cache-Control** headers (long TTL for versioned assets like `app.3f2a.js`).
4. Enable **compression** (gzip/Brotli) and HTTP/2 or HTTP/3.
5. For uploads from far away, use **S3 Transfer Acceleration** or CloudFront PUT.
6. For truly regional data, use **S3 Cross-Region Replication** plus latency-based routing.
7. Invalidate the cache on deploy (`/index.html`) instead of short TTLs everywhere.

**Example:**
```text
aws cloudfront create-invalidation --distribution-id E1ABC2DEF3 --paths "/index.html"

Before: user in Sydney -> S3 us-east-1        ~250 ms
After : user in Sydney -> CloudFront Sydney   ~15 ms (cache hit)
```

:::say
I put CloudFront in front of the S3 bucket with Origin Access Control, so content is cached close to users worldwide. I tune Cache-Control headers, enable compression, invalidate on deploy, and for uploads use Transfer Acceleration or cross-region replication.
:::

## You want to serve users in different countries. How do you route traffic based on user location?

<!-- source: 06 Q27 -->

:::note In simple words
Like a call center that routes your call to the office in your own country or the one with the shortest queue.
:::

Route 53 routing policies:
- **Geolocation:** route by user country/continent (for example, EU users -> eu-west-1 for GDPR). Always add a **default** record.
- **Latency-based:** send users to the region with the lowest measured latency.
- **Geoproximity:** by distance, with a bias to shift more or less traffic to a region.
- Attach **health checks** so unhealthy regions are skipped automatically.

Other options: **CloudFront** (edge caching, geo restriction), **Global Accelerator** (anycast static IPs, routes to nearest healthy region over the AWS backbone).

**Example:**
```
api.example.com
  Geolocation: Europe        -> ALB eu-west-1     (health check)
  Geolocation: Asia          -> ALB ap-south-1    (health check)
  Geolocation: Default       -> ALB us-east-1
```

:::say
I use Route 53 geolocation routing when data must stay in a region, or latency-based routing for best performance, always with health checks and a default record. For non-DNS routing I use Global Accelerator, and CloudFront for cached content.
:::

## If the primary RDS database fails, how can you promote a read replica?

<!-- source: 06 Q28 -->

:::note In simple words
The team captain is injured, so you give the armband to the vice-captain. He becomes the new captain, but he may not know the very last play (async lag).
:::

1. Check **ReplicaLag**; replication is async, so recent writes may be lost.
2. Stop writes to the old primary if it is partially alive (avoid split brain).
3. Promote: the replica reboots and becomes a **standalone, writable** instance (no longer replicating).
4. Enable **Multi-AZ** and automated backups on the new primary.
5. **Repoint applications:** update a Route 53 CNAME (for example `db.internal`), Secrets Manager endpoint, or config.
6. Create new read replicas from the new primary.
7. For **Aurora**, failover to a replica is automatic and keeps the same cluster endpoint.

**Example:**
```bash
aws rds describe-db-instances --db-instance-identifier orders-replica-1 \
  --query "DBInstances[0].StatusInfos"
aws rds promote-read-replica --db-instance-identifier orders-replica-1 \
  --backup-retention-period 7
aws rds modify-db-instance --db-instance-identifier orders-replica-1 \
  --multi-az --apply-immediately
```

:::say
I check replica lag, fence the old primary, and run promote-read-replica, which makes the replica a standalone writable database. Then I repoint apps via a DNS CNAME or secret, enable Multi-AZ and backups, and rebuild replicas; with Aurora this failover is automatic.
:::

## How do you handle database failover in RDS Multi-AZ?

<!-- source: 06 Q29 -->

:::note In simple words
A standby goalkeeper stands next to the goal, copying every move in real time. If the main keeper falls, the standby takes over within a minute, and the scoreboard (DNS name) stays the same.
:::

- **Multi-AZ instance:** a **synchronous** standby in another AZ; no data loss on failover.
- **Automatic failover** triggers on AZ outage, primary host failure, storage failure, or reboot-with-failover. Typical time **60-120 seconds**.
- The **endpoint DNS name does not change**; RDS flips the CNAME to the standby.
- **Multi-AZ DB cluster** (2 readable standbys) fails over faster, typically under 35 seconds.

What you must do on the app side:
- Use the endpoint name, never an IP; keep **DNS TTL low** (JVM: set `networkaddress.cache.ttl`).
- **Retry logic** with backoff and connection pool validation.
- Use **RDS Proxy** to shorten failover impact and keep connections.
- Subscribe to **RDS event notifications** (SNS) and **test failover** regularly.

**Example:**
```bash
aws rds reboot-db-instance --db-instance-identifier orders-prod --force-failover

aws rds create-event-subscription --subscription-name rds-failover \
  --sns-topic-arn arn:aws:sns:ap-south-1:111111111111:db-alerts \
  --source-type db-instance --event-categories failover
```

:::say
RDS Multi-AZ keeps a synchronous standby in another AZ and fails over automatically in about one to two minutes by flipping the endpoint DNS. I make apps resilient with retries, low DNS TTL and RDS Proxy, subscribe to failover events, and test with reboot --force-failover.
:::

## How can a developer securely access a private RDS instance without a bastion host?

<!-- source: 06 Q30 -->

:::note In simple words
Instead of building a guard house, give the developer a temporary, recorded, private tunnel that only their identity can open.
:::

1. **SSM Session Manager port forwarding** through any SSM-managed instance or container in the VPC (no inbound ports, no SSH keys, IAM-controlled, logged).
2. **EC2 Instance Connect Endpoint** can open a TCP tunnel to private IPs.
3. **AWS Client VPN** for teams that need network access.
4. Combine with **IAM database authentication** (15-minute tokens) or Secrets Manager credentials, so no shared static passwords.
5. Keep RDS SG allowing only the tunnel source; log sessions to CloudWatch/S3.

**Example:**
```bash
aws ssm start-session --target i-0abc123def4567890 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["orders.abc123.ap-south-1.rds.amazonaws.com"],
                 "portNumber":["5432"],"localPortNumber":["15432"]}'

TOKEN=$(aws rds generate-db-auth-token --hostname orders.abc123... \
  --port 5432 --username dev_ro)
psql "host=localhost port=15432 user=dev_ro password=$TOKEN sslmode=require"
```

:::say
I use SSM Session Manager port forwarding to the RDS endpoint, so there are no open ports or SSH keys and every session is logged. Combined with IAM database authentication tokens, developers get short-lived, auditable access tied to their own identity.
:::
