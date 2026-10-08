---
track: qbank
title: "GCP, Azure and DevSecOps: Advanced questions"
short: GCP/Azure advanced
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## GCP: How many IP ranges are required for a VPC-native GKE cluster, and what is each range used for?

<!-- source: 07 Q13 -->

:::note In simple words
Imagine a housing society. One set of numbers for the buildings (nodes), another set for the flats inside them (pods), and a third set for shared services like the club house phone numbers (Services). They must never clash.
:::

A VPC-native (alias IP) GKE cluster needs **three ranges**:

| Range | Type | Used for | Example |
| --- | --- | --- | --- |
| Primary subnet range | Subnet primary | Node IPs (VM NICs), internal LBs | 10.10.0.0/20 |
| Pod range | Secondary range | Pod IPs; each node gets a slice (default /24 = up to 110 pods) | 10.20.0.0/14 |
| Service range | Secondary range | ClusterIP addresses of Kubernetes Services | 10.30.0.0/20 |

Extra points interviewers like:
- A **private cluster** also needs a small **/28 for the control plane** (`master-ipv4-cidr`) - not from your subnet.
- Pod IPs are real VPC IPs, so pods are routable directly from the VPC and peered networks - no overlay.
- **Size the pod range carefully**: it limits max nodes. With /24 per node, a /14 pod range gives 1024 nodes. You can reduce per-node pod IPs with `--default-max-pods-per-node`.
- Ranges must not overlap with on-prem or peered VPCs.
- Extra pod ranges can be added later (discontiguous multi-Pod CIDR) if you run out.

**Example:**
```bash
gcloud compute networks subnets create gke-subnet --network prod-vpc --region asia-south1 \
  --range 10.10.0.0/20 \
  --secondary-range pods=10.20.0.0/14,services=10.30.0.0/20

gcloud container clusters create prod-gke --region asia-south1 --enable-ip-alias \
  --subnetwork gke-subnet --cluster-secondary-range-name pods \
  --services-secondary-range-name services
```

:::say
Three ranges: the subnet primary range for nodes, a secondary range for pods, and a secondary range for Services; a private cluster also needs a /28 for the control plane. I size the pod range for future node count because each node reserves a /24 by default.
:::

## Security: How do you secure a Kubernetes / GKE cluster at network, pod, and identity level?

<!-- source: 07 Q14 -->

*Also asked as:* How would you secure a Kubernetes/GKE cluster?

:::note In simple words
Securing a cluster is like securing an office building - locked outer gates (network), rules for what each employee can do inside their room (pod), and ID badges that decide which doors open (identity). Plus CCTV (audit logs) and only trusted furniture allowed in (image policy).
:::

**Infrastructure / cluster level**
- **Private cluster** (private nodes), control plane restricted with **authorized networks**.
- **Shielded GKE Nodes** (secure boot, integrity monitoring), Container-Optimized OS, auto-upgrades via release channels (surge or blue-green node pool upgrades - steps are in the Terraform chapter).
- Encrypt Secrets in etcd with **Cloud KMS (application-layer secrets encryption)**.

**Network level**
- **NetworkPolicies** with default-deny, then allow only needed flows (GKE Dataplane V2 enforces them).
- Cloud Armor + HTTPS load balancer in front; no NodePort to the internet.
- Service mesh (Istio/Cloud Service Mesh) for **mTLS** between services if needed.

**Pod / workload level**
- **Pod Security Standards** (Restricted): non-root, no privileged, drop capabilities, read-only root filesystem.
- Resource limits, and GKE Sandbox (gVisor) for untrusted workloads.
- **Binary Authorization**: only images signed by our CI and scanned in Artifact Registry can run.

**Identity level**
- **Workload Identity Federation for GKE**: pods act as a Google service account without JSON keys.
- **RBAC** with least privilege; no `cluster-admin` for humans day to day; use Google Groups for RBAC.
- Don't use the default Compute Engine service account for nodes; create a minimal node SA.

**Visibility**: Cloud Audit Logs, GKE security posture dashboard, Security Command Center.

**Example:**
```bash
gcloud container clusters create prod-gke --region asia-south1 \
  --enable-private-nodes --master-ipv4-cidr 172.16.0.0/28 \
  --enable-master-authorized-networks --master-authorized-networks 10.0.0.0/8 \
  --enable-shielded-nodes --workload-pool my-proj.svc.id.goog \
  --binauthz-evaluation-mode PROJECT_SINGLETON_POLICY_ENFORCE \
  --database-encryption-key projects/my-proj/locations/asia-south1/keyRings/gke/cryptoKeys/etcd \
  --service-account gke-nodes@my-proj.iam.gserviceaccount.com --enable-dataplane-v2
```

:::say
I secure it in layers: private nodes with authorized networks and shielded nodes; default-deny NetworkPolicies and Cloud Armor at the edge; Pod Security Standards and Binary Authorization for workloads; and Workload Identity plus least-privilege RBAC for identity, with KMS encryption of secrets and audit logs for visibility.
:::

## Security: How do you design IAM with least privilege and handle permissions across AWS accounts and GCP projects?

<!-- source: 07 Q15 -->

*Also asked as:* How do you handle permissioning across AWS/GCP projects? (Don't say "give admin to service accounts".)

:::note In simple words
Give people keys only to the rooms they actually work in, only for as long as they need, and keep a register of every key. In a big company you also build walls between departments (accounts/projects), so a lost key opens one department, not the whole building.
:::

**Principles (both clouds)**
- **Least privilege**: start from zero and grant only the actions and resources needed. No `*:*`, and no admin roles on service accounts.
- Humans log in with **SSO** and get temporary access. **No long-lived keys.**
- **Grant to groups, not individuals**, so joiners and leavers are handled in one place.
- **Just-in-time (JIT)** elevated access with approval and expiry, for example for prod admin.
- **Periodic access reviews**, plus unused-permission cleanup.
- **Everything in Terraform**: IAM changes go through PRs, review and audit, never console clicks.

**AWS**
- **AWS Organizations** with **OUs** (Security, Prod, NonProd, Sandbox) and **SCPs** as the maximum-allowed guardrail, for example deny leaving the org, deny disabling CloudTrail, or allow only approved regions.
- **IAM Identity Center permission sets** assigned per account (ReadOnly everywhere, Developer in dev, a narrow Deployer in prod).
- **Cross-account roles** with trust policies (and an ExternalId for third parties); CI assumes a deploy role in each account.
- **Permission boundaries** so teams can create roles without escalating privilege.
- **IAM Access Analyzer**: find external access, generate policies from CloudTrail activity, flag unused permissions.
- Workloads use instance profiles and IRSA/EKS Pod Identity.

**GCP**
- The **org -> folders -> projects** hierarchy. Grant at the **lowest level** that works, because permissions inherit downward.
- **Google Groups** as principals. **Predefined roles** first, **custom roles** when predefined ones are too broad; avoid basic roles (Owner/Editor).
- **IAM Conditions**: limit a role by resource name prefix, tag or time.
- **Service account impersonation** (`roles/iam.serviceAccountTokenCreator`) instead of downloading keys; block keys with the org policy `iam.disableServiceAccountKeyCreation`.
- **Workload Identity Federation** for CI (GitHub/GitLab OIDC) and cross-cloud (an AWS role -> GCP), plus GKE Workload Identity for pods.
- Use the **IAM Recommender** to trim excess grants.

**Example:**
```json
# AWS SCP: deny actions outside ap-south-1 (global services exempt); CloudTrail can't be stopped
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Deny", "NotAction": ["iam:*", "sts:*", "support:*"], "Resource": "*",
     "Condition": {"StringNotEquals": {"aws:RequestedRegion": "ap-south-1"}}},
    {"Effect": "Deny", "Action": ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail"],
     "Resource": "*"}
  ]
}

# GCP: group gets a narrow role on one project with a condition; CI impersonates an SA
gcloud projects add-iam-policy-binding prod-app --member group:devs@corp.com \
  --role roles/storage.objectViewer \
  --condition=expression='resource.name.startsWith("projects/_/buckets/app-logs")',title=logs-only
gcloud storage ls gs://app-logs \
  --impersonate-service-account deployer@prod-app.iam.gserviceaccount.com
```

:::say
In AWS I use Organizations with OUs and SCPs as guardrails, Identity Center permission sets per account, cross-account deploy roles, permission boundaries and Access Analyzer. In GCP I use the org-folder-project hierarchy with Google Groups, predefined or custom roles at the lowest level with IAM Conditions, service account impersonation instead of keys, and Workload Identity Federation for CI and cross-cloud. In both, access is just-in-time, reviewed periodically and managed entirely in Terraform.
:::

## Security: What policies and tools are used for policy compliance checks, and how do you enforce policy as code across environments?

<!-- source: 07 Q16 -->

*Also asked as:* How do you enforce policy as code across environments? OPA? Sentinel? Pulumi? What are OPA/Gatekeeper, IAM policies, Organization policies and Pod Security Standards?

:::note In simple words
Company rules like "no one enters without a badge" only work if a guard checks every time. Policy as code turns the rule book into code, and robot guards check it at three doors: when a change is planned (CI), when it enters the cluster (admission), and all the time in the cloud (guardrails).
:::

**1. Pre-deploy, in CI (cheapest place to catch problems)**
- **Conftest / OPA** on the Terraform plan: `terraform show -json plan.out | conftest test -`.
- **Checkov / tfsec (Trivy config)** static scans of Terraform, Helm and K8s YAML.
- **Sentinel** in Terraform Cloud/Enterprise, with levels advisory, soft-mandatory and hard-mandatory.
- **Pulumi CrossGuard** policy packs if the team uses Pulumi.

**2. Admission, in the cluster**
- **OPA Gatekeeper** (ConstraintTemplates written in Rego, plus Constraints) or **Kyverno** (ClusterPolicies in YAML).
- Typical rules: no privileged pods, images only from our registry, limits required, labels required.
- **Pod Security Standards** (Baseline/Restricted) through the built-in Pod Security Admission.
- Start in **audit/warn** mode (Gatekeeper `dryrun`/`warn`, Kyverno `Audit`), then switch to **enforce/deny**.

**3. Runtime and cloud guardrails (catch anything that bypassed CI)**
- **AWS**: SCPs in Organizations (deny wrong regions, deny disabling CloudTrail) plus **AWS Config rules** and Security Hub.
- **GCP**: **Organization Policies**, for example `iam.disableServiceAccountKeyCreation` or no external IPs.
- **Azure**: **Azure Policy** with deny/audit effects and initiatives (CIS, PCI).

**How I run it across environments**
- One **policy repo**, versioned (git tags) and tested with `opa test` / `kyverno test` in its own CI.
- Promote **dev -> stage -> prod**: new rules run in **warn** mode first, we fix the violations, then **enforce**.
- **Exceptions** are explicit: a label or annotation such as `policy-exempt=reason` with an **expiry date** and an owner, reviewed regularly. Never a silent bypass.
- Policy results go to dashboards, so compliance is measurable.

**Example:**
```
# policy/s3.rego - run with: conftest test plan.json
package main

deny[msg] {
  r := input.resource_changes[_]
  r.type == "aws_s3_bucket_public_access_block"
  r.change.after.block_public_acls == false
  msg := sprintf("%s: public ACLs must be blocked", [r.address])
}

deny[msg] {
  r := input.resource_changes[_]
  r.change.actions[_] == "create"
  not r.change.after.tags.owner
  msg := sprintf("%s: missing required tag 'owner'", [r.address])
}

# CI steps
terraform plan -out plan.out && terraform show -json plan.out > plan.json
conftest test plan.json --policy policy/
opa test policy/ -v
```

:::say
I enforce policy at three points: in CI with Conftest/OPA on the Terraform plan JSON, Checkov, or Sentinel in Terraform Cloud; at cluster admission with Gatekeeper or Kyverno plus Pod Security Standards; and at runtime with SCPs and AWS Config, GCP Organization Policies or Azure Policy. The policies live in one versioned, tested repo, get promoted dev to prod in warn-then-enforce mode, and exceptions are labelled with an owner and an expiry date.
:::

## Security: What audit logging and encryption strategies do you follow?

<!-- source: 07 Q17 -->

:::note In simple words
Encryption is putting valuables in a locked box - when stored and when moving in the van. Audit logs are the CCTV recording who opened which box and when, stored somewhere the thief can't delete.
:::

**Encryption**
- **At rest**: enable encryption for disks, databases, buckets, backups and etcd. Default provider keys are fine for most data; use **customer-managed keys (KMS / Cloud KMS / Key Vault)** for sensitive data so you control rotation and can revoke access.
- **In transit**: TLS 1.2+ everywhere - on the load balancer, and ideally end-to-end to the backend; mTLS between services with a mesh.
- **Key management**: automatic key rotation, separate keys per environment/data class, least-privilege on who can use (`kms:Decrypt`) vs manage keys.
- **Secrets**: in a secret manager, never in code or images.

**Audit logs**
- Turn on **AWS CloudTrail (all regions, org trail)**, **GCP Cloud Audit Logs (incl. Data Access for sensitive services)**, **Azure Activity Log**, and **Kubernetes API audit logs**.
- Ship to a **separate, locked-down log account/project**; enable immutability (S3 Object Lock, bucket retention lock).
- Set retention per compliance (e.g., 1 year hot, 7 years archive for banking).
- Alert on high-risk events: root login, IAM policy changes, security group opened to 0.0.0.0/0, KMS key deletion; feed into a SIEM (Security Hub, Sentinel, Chronicle).

**Example:**
```bash
aws cloudtrail create-trail --name org-trail --s3-bucket-name org-audit-logs \
  --is-multi-region-trail --is-organization-trail --enable-log-file-validation
aws kms enable-key-rotation --key-id alias/prod-data
```

:::say
I encrypt everything at rest and in transit, using customer-managed KMS keys with rotation for sensitive data, and TLS 1.2 plus mTLS inside the mesh. All control-plane activity goes to organization-wide CloudTrail or Cloud Audit Logs stored immutably in a separate security account, with alerts on risky actions and a SIEM on top.
:::

## Azure: How would you use Azure Application Gateway with WAF for a sensitive banking application?

<!-- source: 07 Q18 -->

:::note In simple words
Application Gateway is the bank's front desk that decides which counter you go to; WAF is the security scanner at the door. For a bank you add metal detectors, ID checks, CCTV and a locked vault behind them.
:::

Design:
1. **Application Gateway WAF_v2 SKU**, **zone-redundant**, with autoscaling (min instances set for peak).
2. **WAF policy in Prevention mode** with the Microsoft **Default Rule Set (DRS 2.x)** / OWASP CRS, plus **Bot Manager** rules. Tune false positives with exclusions after running in Detection mode on staging.
3. **Custom rules**: geo-filter (e.g., allow only India), rate limiting, block known bad IPs, allow admin paths only from office IPs.
4. **TLS**: HTTPS only, TLS 1.2+ with a strong predefined SSL policy; certificates stored in **Azure Key Vault**, pulled by App Gateway via **managed identity**; **end-to-end TLS** to the backends.
5. **Backends are private**: App Service/AKS behind **private endpoints** or internal IPs; backend access restricted so traffic can only come through App Gateway.
6. **Network**: App Gateway in its own subnet with NSG, **Azure DDoS Network Protection** on the VNet. For global users, put **Azure Front Door Premium** (with WAF) in front.
7. **Monitoring**: WAF and access logs to **Log Analytics** and **Microsoft Sentinel**; alerts on blocked-request spikes.
8. **Compliance**: Azure Policy to enforce WAF enabled and TLS versions (PCI-DSS, RBI guidelines).

**Example:**
```bash
az network application-gateway waf-policy create -g bank-rg -n bank-waf \
  --type Microsoft_DefaultRuleSet --version 2.1
az network application-gateway waf-policy policy-setting update -g bank-rg \
  --policy-name bank-waf --mode Prevention --state Enabled
az network application-gateway waf-policy custom-rule create -g bank-rg \
  --policy-name bank-waf -n geoBlock --priority 10 --rule-type MatchRule --action Block
```

:::say
I would deploy a zone-redundant App Gateway WAF_v2 with the Microsoft Default Rule Set in Prevention mode, custom geo and rate-limit rules, TLS 1.2 end-to-end with certificates from Key Vault, and private backends reachable only through the gateway. DDoS Protection, WAF logs into Sentinel and Azure Policy for compliance complete the design.
:::

## Azure: Explain the difference in scaling strategies for compute-intensive vs I/O-intensive workloads.

<!-- source: 07 Q19 -->

:::note In simple words
A compute-heavy job is like a kitchen short on chefs - hire more chefs or faster chefs. An I/O-heavy job is a kitchen where chefs wait for ingredients from the store - hiring chefs won't help; you need a faster supply line or a fridge nearby (cache).
:::

| | Compute-intensive (video encoding, ML, reports) | I/O-intensive (DB-heavy APIs, file processing, queues) |
| --- | --- | --- |
| Bottleneck | CPU/GPU | Disk, network, DB, downstream APIs |
| Scale signal | CPU utilization | Queue length, request latency, IOPS, connections |
| VM choice (Azure) | Compute-optimized (F/Fsv2), HPC, GPU (NC/ND) | Memory/storage optimized (E, L-series), Premium SSD v2 / Ultra Disk |
| Scale method | Scale out on CPU (VMSS autoscale, HPA), batch parallelism, Spot VMs for batch | Scale on backlog (KEDA, Functions queue triggers), cache (Azure Cache for Redis), async processing |
| Watch out | Noisy neighbours, CPU throttling limits in K8s | Adding instances can overload the DB; connection limits, disk throughput caps |

Key points:
- For I/O workloads, **scaling out can make things worse** if the database is the bottleneck - fix with caching, read replicas, connection pooling, batching, or bigger disk throughput.
- Azure specifics: **VM Scale Sets** autoscale on CPU for compute; **Azure Batch** for big parallel compute; **Functions/Container Apps with KEDA** scaling on Service Bus/Event Hub backlog for I/O; disk performance scales with disk size/tier.

**Example:**
```yaml
# KEDA scaler: scale I/O workers on Service Bus queue depth, not CPU
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-worker
spec:
  scaleTargetRef:
    name: order-worker
  minReplicaCount: 1
  maxReplicaCount: 30
  triggers:
    - type: azure-servicebus
      metadata:
        queueName: orders
        messageCount: "50"
      authenticationRef:
        name: sb-auth
```

:::say
Compute-bound workloads scale on CPU using compute-optimized or GPU VMs, scale sets or HPA, and Spot for batch. I/O-bound workloads scale on backlog or latency with KEDA and need faster storage, caching and connection pooling, because simply adding instances can overload the database.
:::

## Security: What security measures would you implement while hosting a production web application?

<!-- source: 07 Q20 -->

*Also asked as:* What are best practices to protect a hosted web application? (AWS-specific version is in the AWS chapter.)

:::note In simple words
Defense in depth - like a bank with a guard, locked doors, a vault, cameras and an alarm. If one layer fails, the next one still stops the thief.
:::

Layer by layer:
- **Edge**: CDN + **WAF** (OWASP rules, rate limiting, bot protection) + **DDoS protection**; HTTPS only with HSTS.
- **Network**: app servers in **private subnets**, only the load balancer is public; tight security groups/firewall rules; no SSH from the internet (use SSM Session Manager / IAP / Bastion).
- **Application**: input validation, parameterized queries, secure headers (CSP, X-Frame-Options), authentication with MFA/OAuth, session security, CORS limited.
- **Secrets & identity**: secrets manager, no keys in code; least-privilege IAM roles for the app.
- **Data**: encryption at rest (KMS) and in transit (TLS 1.2+); private DB endpoints; backups encrypted and tested.
- **Supply chain**: SAST/SCA/image scanning in CI, signed images, minimal non-root containers, patching.
- **Monitoring & response**: audit logs, WAF logs, SIEM alerts, runbooks, regular pentests and DR drills.

**Example:**
```
# Nginx security headers on the web tier
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "default-src 'self'" always;
ssl_protocols TLSv1.2 TLSv1.3;
```

:::say
I use defense in depth: CDN with WAF and DDoS protection at the edge, private subnets with only the load balancer exposed, least-privilege IAM and a secrets manager, encryption at rest and in transit, scanned and signed images in CI, and centralized logging with alerting and regular pentests.
:::

## Security: What is email/commit signing and Helm chart signing? Which tools do you use to sign Helm charts?

<!-- source: 07 Q21 -->

:::note In simple words
Signing is a tamper-proof seal on a medicine bottle. If the seal is intact and carries the company's stamp, you know who packed it and that nobody opened it on the way. A signature proves who made something and that it was not changed.
:::

How signing works in one line: the author signs with a **private key**; anyone can check it with the matching **public key**. If even one byte changes, verification fails.

- **Email signing**: **S/MIME** (certificate-based, common in Outlook) or **PGP/GPG** signs emails so the receiver knows the sender is real and the text was not altered.
- **Git commit signing**: sign commits and tags with **GPG**, **SSH keys** or **Sigstore gitsign** (`git commit -S`). GitHub/GitLab show a **Verified** badge, and branch protection can **require signed commits**, so nobody can push code pretending to be someone else.
- **Helm chart signing (classic)**: `helm package --sign` uses a **GPG key** and creates a `.prov` **provenance file** next to the `.tgz` (it holds the chart's hash plus signature). Users run `helm verify` or `helm install --verify` with the public keyring.
- **Helm charts in OCI registries (modern)**: charts pushed to ECR/Artifact Registry/Harbor are signed with **Sigstore cosign** (or **Notation**/Notary v2), the same way as container images; keyless signing uses the CI identity via OIDC.
- **Container image signing**: **cosign** or **Notation** in CI after the image scan passes; then **enforce** at deploy time with **Kyverno verifyImages**, **Gatekeeper + Ratify**, or **GKE Binary Authorization** - unsigned images are rejected.

Why it matters: stops **supply-chain attacks** (a tampered chart or image from a compromised registry) and proves who approved what for audits.

**Example:**
```bash
# Git: sign commits with GPG
git config --global user.signingkey 3AA5C34371567BD2
git commit -S -m "Add ingress config"

# Classic Helm provenance with GPG
helm package ./webapp --sign --key "DevOps Team" --keyring ~/.gnupg/secring.gpg
helm verify webapp-1.2.0.tgz --keyring ~/.gnupg/pubring.gpg

# OCI chart + image signed with cosign
helm push webapp-1.2.0.tgz oci://123456789012.dkr.ecr.ap-south-1.amazonaws.com/charts
cosign sign --key awskms:///alias/cosign 123456789012.dkr.ecr.ap-south-1.amazonaws.com/charts/webapp:1.2.0
cosign verify --key cosign.pub 123456789012.dkr.ecr.ap-south-1.amazonaws.com/app:1.4.2
```

:::say
Signing is a tamper-proof seal - a private-key signature that proves who produced an email, commit, chart or image and that it wasn't modified. I sign commits with GPG and enforce verified commits, sign classic Helm charts with helm package --sign and verify the .prov file, and for OCI charts and images I use cosign with a KMS key, enforcing only signed images at admission with Kyverno or Binary Authorization.
:::

## Azure: How do you implement high availability for a multi-region application?

<!-- source: 07 Q22 -->

:::note In simple words
Don't keep all your shops in one mall. First spread tills across several floors (zones) so one broken escalator doesn't close the shop. Then open a second mall in another city (region) with a signboard on the highway (Front Door) that sends customers to whichever mall is open.
:::

**Layer 1 - inside a region: Availability Zones**
- Zone-redundant services: **App Service** (zone redundancy, 3+ instances), **AKS** node pools across zones 1/2/3, zone-redundant Application Gateway, and **ZRS** storage.
- Zones protect against one datacenter failing, with no data loss.

**Layer 2 - across regions (usually Azure paired regions, e.g. Central India + South India)**
- **Global entry point**:
  - **Azure Front Door**: Layer 7, global anycast, WAF, TLS, caching, **health probes**, failover in seconds, path-based routing.
  - **Traffic Manager**: **DNS-based**, works for any protocol, but failover depends on the DNS TTL.
- **Data tier** (the hard part):
  - **Azure SQL auto-failover groups**: geo-replication with a single listener endpoint that follows the primary.
  - **Cosmos DB** multi-region writes, or a single write region with automatic failover.
  - **Storage**: GRS/GZRS, or **RA-GZRS** if you need to read the secondary.
  - **Redis**: geo-replication (Premium/Enterprise).
- **Patterns**:
  - **Active-active**: both regions serve traffic. Best RTO, but needs data consistency handling.
  - **Active-passive (warm standby)**: the secondary is scaled down and scaled up on failover. Cheaper.

**Make it real**
- Everything is in IaC, so the second region is identical.
- Deep health endpoints are used as probes.
- Define **RTO/RPO**, write failover runbooks, and run **regular DR drills**.

**Example:**
```bash
az sql failover-group create -g prod-rg --server sql-cin --partner-server sql-sin \
  -n pay-fog --add-db paydb --failover-policy Automatic --grace-period 1
az afd origin create -g prod-rg --profile-name pay-fd --origin-group-name web \
  --origin-name cin --host-name pay-cin.azurewebsites.net --priority 1 --weight 1000 \
  --enabled-state Enabled --origin-host-header pay-cin.azurewebsites.net
az afd origin create -g prod-rg --profile-name pay-fd --origin-group-name web \
  --origin-name sin --host-name pay-sin.azurewebsites.net --priority 2 --weight 1000 \
  --enabled-state Enabled --origin-host-header pay-sin.azurewebsites.net
```

:::say
I use Availability Zones inside each region, with zone-redundant App Service or AKS and ZRS storage, and then a paired secondary region behind Azure Front Door with health probes. Front Door is my default because it gives layer 7 failover in seconds plus WAF; Traffic Manager is the option for DNS-based or non-HTTP traffic. Data uses SQL auto-failover groups, Cosmos DB multi-region or RA-GZRS storage, and I choose active-active or active-passive by the RTO/RPO and budget, then prove it with DR drills.
:::

## Azure: How do you set up automated scaling for Azure App Service?

<!-- source: 07 Q23 -->

:::note In simple words
Scaling up is buying a bigger oven. Scaling out is adding more ovens. Autoscale is a manager who adds ovens when the orders queue grows and removes them when it's quiet, with a short wait in between so it doesn't keep switching them on and off.
:::

- **Scale up** = a bigger App Service plan tier/size (more CPU/RAM per instance). This is manual and causes a restart.
- **Scale out** = more instances of the plan. This is what autoscale does.

Autoscale (Azure Monitor autoscale settings):
- Needs **Standard tier or higher** (Premium v3 recommended); Basic/Free can't autoscale.
- **Rules** on metrics such as **CPU %**, **memory %**, **HTTP queue length**, or a Service Bus queue for workers.
- Always create a **scale-out rule and a matching scale-in rule**, with **cooldowns** (e.g. 5-10 minutes) to avoid flapping.
- Set **min/max/default instances**. Keep min >= 2 or 3 for HA (and for zone redundancy).
- **Scheduled profiles**: for example, more instances during business hours or before a known sale event.
- Autoscale settings are per **plan**, so all apps on the plan scale together.

**Automatic scaling** (the newer Premium v2/v3 feature): App Service scales on **HTTP traffic** with pre-warmed instances. You set a maximum burst and optional always-ready instances, with no rules to write.

Watch out: scaling the web tier doesn't help if the database is the bottleneck, and slow app startup delays scale-out, so use warm-up and health check settings.

**Example:**
```bash
az monitor autoscale create -g prod-rg --resource pay-plan \
  --resource-type Microsoft.Web/serverfarms --name pay-autoscale \
  --min-count 2 --max-count 10 --count 2

az monitor autoscale rule create -g prod-rg --autoscale-name pay-autoscale \
  --condition "CpuPercentage > 70 avg 10m" --scale out 2 --cooldown 5
az monitor autoscale rule create -g prod-rg --autoscale-name pay-autoscale \
  --condition "CpuPercentage < 30 avg 15m" --scale in 1 --cooldown 10
az monitor autoscale rule create -g prod-rg --autoscale-name pay-autoscale \
  --condition "HttpQueueLength > 100 avg 5m" --scale out 2 --cooldown 5
```

:::say
I keep the plan on Premium v3 and create autoscale settings with scale-out and scale-in rule pairs on CPU, memory or HTTP queue length, with cooldowns, a minimum of 2-3 instances for HA and a sensible maximum. I add scheduled profiles for known peaks, or use the newer automatic scaling for HTTP-driven apps. Scaling up to a bigger SKU is separate, and I check that the database won't become the next bottleneck.
:::

## Azure: How do you use Microsoft Defender for Cloud for workload protection?

<!-- source: 07 Q24 -->

*Also asked as:* What is Azure Defender / Azure Security Center?

:::note In simple words
Defender for Cloud is both a building inspector and a security guard. The inspector gives you a checklist and a score for what's unlocked or misconfigured (posture). The guard watches your servers, containers and databases live and raises the alarm when someone breaks in (threat protection).
:::

Two halves:
- **CSPM (Cloud Security Posture Management)**
  - **Secure score** plus prioritized **recommendations**, such as "enable MFA", "storage allows public access" or "VMs missing updates".
  - **Regulatory compliance dashboards**: Microsoft Cloud Security Benchmark, CIS, PCI-DSS, ISO 27001.
  - Works multi-cloud by connecting AWS and GCP accounts.
  - Defender CSPM (the paid plan) adds attack path analysis and agentless scanning.
- **CWP (Cloud Workload Protection) - Defender plans per resource type**
  - **Servers**: vulnerability assessment, EDR (Defender for Endpoint), file integrity monitoring, **just-in-time VM access**, which opens RDP/SSH ports only on request, for a limited time and from your IP.
  - **Containers**: **image vulnerability scanning** in ACR, **runtime threat detection** on AKS (e.g. crypto-miners, privileged container launch) and Kubernetes posture checks.
  - **SQL, Storage** (malware scanning, anomalous access), **Key Vault** (unusual secret access), **App Service**, **Resource Manager** and **DNS**.

How I roll it out:
1. Enable it at subscription or management-group level, via Azure Policy or Terraform so it's consistent.
2. Turn on the Defender plans for the resource types we actually run.
3. Work down the recommendations by secure-score impact; exempt with a justification where needed.
4. Stream alerts to **Microsoft Sentinel** (SIEM) or Teams through workflow automation; use continuous export to Log Analytics.
5. Track secure score and compliance percentages monthly as KPIs.

**Example:**
```bash
az security pricing create -n VirtualMachines --tier Standard
az security pricing create -n Containers --tier Standard
az security pricing create -n KeyVaults --tier Standard
az security secure-score-controls list -o table
az security assessment list --query "[?status.code=='Unhealthy'].displayName" -o tsv
```

:::say
Defender for Cloud does two jobs: CSPM, with a secure score, recommendations and regulatory compliance dashboards, and workload protection plans for servers, containers, SQL, storage and Key Vault. Those plans cover image scanning in ACR, AKS runtime threat detection and just-in-time VM access. I enable it org-wide through policy, fix recommendations by score impact, and route alerts into Sentinel.
:::
