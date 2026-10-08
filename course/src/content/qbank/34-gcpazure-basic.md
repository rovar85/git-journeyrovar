---
track: qbank
title: "GCP, Azure and DevSecOps: Basic questions"
short: GCP/Azure basic
sub: 10 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## GCP: What is Cloud Armor, and how does it protect applications?

<!-- source: 07 Q1 -->

:::note In simple words
Cloud Armor is the security guard standing at the front gate of your Google load balancer. It checks every visitor against a list of rules and turns away the troublemakers before they reach your house.
:::

Cloud Armor is Google Cloud's **WAF (Web Application Firewall) and DDoS protection** service. It is attached to a **backend service** behind the external Application Load Balancer (or Cloud CDN, and some other load balancer types), so traffic is filtered at Google's edge before it reaches your VMs or GKE pods.

What it gives you:
- **DDoS protection** at network level (always on) and application level (Layer 7 floods).
- **Preconfigured WAF rules** based on OWASP Top 10, for example SQL injection (`sqli-v33-stable`) and cross-site scripting (`xss-v33-stable`).
- **IP allow/deny lists** and **geo-blocking** (block or allow by country).
- **Rate limiting** - throttle or ban clients that send too many requests.
- **Adaptive Protection** - machine learning that detects unusual traffic and suggests rules.
- **Bot management** with reCAPTCHA integration.
- Rules can run in **preview mode** first, so you see what would be blocked without breaking users.

**Example:**
```bash
gcloud compute security-policies create web-policy --description "Prod WAF"

# Block SQL injection using Google's preconfigured OWASP rule
gcloud compute security-policies rules create 1000 --security-policy web-policy \
  --expression "evaluatePreconfiguredExpr('sqli-v33-stable')" --action deny-403

# Attach the policy to the backend service behind the load balancer
gcloud compute backend-services update web-backend --global --security-policy web-policy
```

:::say
Cloud Armor is GCP's WAF and DDoS service that sits on the external HTTP(S) load balancer. I use it for OWASP rules like SQLi and XSS, IP and geo filtering, and rate limiting, and I always roll new rules out in preview mode first and watch the logs before enforcing.
:::

## GCP: What network services are available in GCP?

<!-- source: 07 Q2 -->

:::note In simple words
Think of GCP networking as the roads, gates, toll booths and signboards of a city - private roads (VPC), gates to the outside (NAT, load balancers), signboards (DNS) and express highways to your office (Interconnect/VPN).
:::

Main GCP networking services:
- **VPC** - a global private network; subnets are regional. Includes firewall rules and routes.
- **Shared VPC** and **VPC Network Peering** - share or connect networks between projects.
- **Cloud Load Balancing** - global external Application LB, regional/internal LBs, Network (TCP/UDP) LB.
- **Cloud NAT** - lets private VMs reach the internet without public IPs.
- **Cloud DNS** - managed public and private DNS zones.
- **Cloud CDN** - caches content at Google's edge.
- **Cloud VPN** and **Cloud Interconnect** - connect on-prem to GCP (encrypted tunnel vs dedicated fibre).
- **Cloud Router** - dynamic BGP routing for VPN/Interconnect.
- **Private Service Connect / Private Google Access** - reach Google APIs and services privately.
- **Cloud Armor** - WAF/DDoS; **Network Connectivity Center** - hub-and-spoke connectivity.

| Need | GCP | AWS | Azure |
| --- | --- | --- | --- |
| Private network | VPC (global) | VPC (regional) | VNet |
| Outbound for private hosts | Cloud NAT | NAT Gateway | NAT Gateway |
| DNS | Cloud DNS | Route 53 | Azure DNS |
| CDN | Cloud CDN | CloudFront | Azure Front Door / CDN |
| Hybrid link | Interconnect / VPN | Direct Connect / VPN | ExpressRoute / VPN Gateway |

**Example:**
```bash
gcloud compute networks create prod-vpc --subnet-mode custom
gcloud compute networks subnets create app-subnet --network prod-vpc \
  --region asia-south1 --range 10.10.0.0/20
gcloud compute routers create nat-router --network prod-vpc --region asia-south1
gcloud compute routers nats create nat-cfg --router nat-router --region asia-south1 \
  --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges
```

:::say
The core ones are VPC with firewall rules, Cloud Load Balancing, Cloud NAT, Cloud DNS, Cloud CDN, Cloud VPN and Interconnect with Cloud Router, plus Private Service Connect and Cloud Armor. A key difference from AWS is that a GCP VPC is global while subnets are regional.
:::

## GCP: What are the GCP security services other than Cloud Armor and VPC?

<!-- source: 07 Q3 -->

:::note In simple words
If Cloud Armor is the gate guard, these are the ID card office, the locker room, the CCTV and the safety inspector of the building.
:::

- **Cloud IAM** - who can do what; roles, service accounts, conditions.
- **Security Command Center (SCC)** - central dashboard of misconfigurations, vulnerabilities and threats.
- **Cloud KMS / Cloud HSM** - manage encryption keys, including customer-managed keys (CMEK).
- **Secret Manager** - store and version passwords, API keys, certificates.
- **Identity-Aware Proxy (IAP)** - log in to apps and VMs (SSH) without a VPN or public IP.
- **VPC Service Controls** - a perimeter that stops data being copied out of services like BigQuery/GCS.
- **Binary Authorization** - only allow signed/approved container images to deploy on GKE.
- **Artifact Analysis** - vulnerability scanning of container images in Artifact Registry.
- **Cloud Audit Logs** - who did what, where and when.
- **Organization Policy Service** - guardrails such as "no public IPs" or "only these regions".
- **Sensitive Data Protection (Cloud DLP)**, **reCAPTCHA Enterprise**, **Certificate Manager**, **Chronicle/Google SecOps** (SIEM).

**Example:**
```bash
# Create a secret and read it
echo -n "S3cr3tP@ss" | gcloud secrets create db-password --data-file=-
gcloud secrets versions access latest --secret db-password

# Org policy: forbid external IPs on VMs across the organization
gcloud resource-manager org-policies enable-enforce \
  compute.vmExternalIpAccess --organization 123456789012
```

:::say
Beyond Cloud Armor and VPC firewalls, I would use IAM with least privilege, Secret Manager and Cloud KMS for secrets and keys, Security Command Center for posture, IAP for access without bastions, VPC Service Controls against data exfiltration, Binary Authorization for GKE, and Audit Logs plus Organization Policies for governance.
:::

## GCP: What is the GCP equivalent of CloudFormation?

<!-- source: 07 Q4 -->

:::note In simple words
CloudFormation is AWS's own "blueprint" tool. Google had its own blueprint tool too, but now it basically hands you Terraform and runs it for you.
:::

- **Cloud Deployment Manager** was GCP's native IaC tool (YAML/Jinja/Python templates), the direct equivalent of CloudFormation. It has been **deprecated** and Google has moved customers off it.
- **Infrastructure Manager (Infra Manager)** is the current Google-managed option. It runs **Terraform** for you, stores state and keeps a history of deployments - similar to a managed Terraform service.
- **Config Connector** lets you manage GCP resources as Kubernetes objects (YAML applied to a GKE cluster).
- In practice most teams simply use **Terraform** with the `google` provider and a GCS bucket for remote state.

| Cloud | Native IaC |
| --- | --- |
| AWS | CloudFormation (and CDK) |
| Azure | ARM templates / Bicep |
| GCP | Deployment Manager (deprecated) -> Infrastructure Manager (Terraform) |

**Example:**
```bash
gcloud infra-manager deployments apply projects/my-proj/locations/us-central1/deployments/web \
  --service-account projects/my-proj/serviceAccounts/infra@my-proj.iam.gserviceaccount.com \
  --git-source-repo https://github.com/org/infra --git-source-directory envs/prod
```

:::say
The historical equivalent was Cloud Deployment Manager, which is now deprecated; Google's current managed option is Infrastructure Manager, which runs Terraform for you. In real projects I use Terraform with the google provider and a GCS backend for state.
:::

## GCP: What is the CloudWatch equivalent in GCP?

<!-- source: 07 Q5 -->

:::note In simple words
CloudWatch is AWS's health monitor. In GCP the same job is done by a family called "Google Cloud Observability" - one part watches numbers, another keeps the diary (logs).
:::

The equivalent is **Google Cloud Observability** (formerly called Stackdriver):
- **Cloud Monitoring** - metrics, dashboards, uptime checks, alerting policies (like CloudWatch Metrics + Alarms).
- **Cloud Logging** - central logs, Log Explorer, log-based metrics, log sinks to BigQuery/GCS/Pub/Sub (like CloudWatch Logs).
- **Cloud Trace** - distributed tracing (like X-Ray).
- **Cloud Profiler** and **Error Reporting**.
- **Google Cloud Managed Service for Prometheus** - run PromQL against GKE metrics without running Prometheus storage yourself.

| AWS | GCP |
| --- | --- |
| CloudWatch Metrics / Alarms | Cloud Monitoring / Alerting policies |
| CloudWatch Logs | Cloud Logging |
| X-Ray | Cloud Trace |
| CloudTrail | Cloud Audit Logs |

**Example:**
```bash
# Read recent error logs from GKE containers
gcloud logging read 'resource.type="k8s_container" AND severity>=ERROR' \
  --limit 20 --freshness 1h

# Send logs older-term to a storage bucket (cheap retention)
gcloud logging sinks create archive-sink storage.googleapis.com/my-log-archive \
  --log-filter 'severity>=WARNING'
```

:::say
The CloudWatch equivalent is Google Cloud Observability - Cloud Monitoring for metrics and alerts, Cloud Logging for logs, and Cloud Trace for tracing. CloudTrail's equivalent is Cloud Audit Logs.
:::

## GCP: What is a CDN, and how does GCP Cloud CDN work?

<!-- source: 07 Q6 -->

:::note In simple words
A CDN is like keeping copies of a popular book in libraries in every city, so readers don't all travel to the one central library. Users get the nearest copy, faster.
:::

A **CDN (Content Delivery Network)** caches content (images, JS, CSS, videos, even API responses) at edge locations close to users. Benefits: lower latency, less load on the origin, lower egress cost, and some DDoS absorption.

How **Cloud CDN** works:
1. It is enabled on a **backend service or backend bucket** of the global external Application Load Balancer.
2. A user request hits the nearest Google edge (anycast IP).
3. **Cache hit** -> served straight from the edge. **Cache miss** -> fetched from the origin (GCS bucket, VMs, GKE, or an external origin), then cached.
4. Caching follows `Cache-Control` headers or a **cache mode** (`CACHE_ALL_STATIC`, `USE_ORIGIN_HEADERS`, `FORCE_CACHE_ALL`) with a TTL.
5. You can **invalidate** paths after a deploy, and use **signed URLs/cookies** for private content.
6. Cloud Armor edge policies can be combined with it.

**Example:**
```bash
gcloud compute backend-buckets create static-bucket --gcs-bucket-name my-static-site \
  --enable-cdn --cache-mode CACHE_ALL_STATIC --default-ttl 3600

# After a release, clear the old files
gcloud compute url-maps invalidate-cdn-cache web-map --path "/assets/*"
```

:::say
A CDN caches content at edge locations near users to cut latency and origin load. In GCP, Cloud CDN is switched on per backend service or backend bucket of the global HTTP(S) load balancer; it caches based on Cache-Control or cache mode, and I invalidate paths after each deployment.
:::

## GCP: What is the difference between a public cluster and a private cluster in GKE?

<!-- source: 07 Q7 -->

:::note In simple words
A public cluster is a house where every room has a door onto the street. A private cluster is a gated building: rooms have no street doors, and even the manager's office (control plane) can be reached only through the gate you choose.
:::

| | Public cluster | Private cluster |
| --- | --- | --- |
| Node IPs | Nodes get public (external) IPs | Nodes have only internal IPs |
| Control plane endpoint | Public endpoint | Private endpoint; public endpoint optional and can be restricted |
| Outbound internet from nodes | Directly | Needs Cloud NAT |
| Pulling from Google APIs/Artifact Registry | Direct | Via Private Google Access |
| Security | Larger attack surface | Recommended for production |

Key points for private clusters:
- You give the control plane its own small range (for example `--master-ipv4-cidr 172.16.0.0/28`).
- Use **authorized networks** to allow only specific CIDRs (office VPN, CI runners) to reach the API server.
- Admin access usually via a bastion with IAP, a VPN, or the private endpoint from inside the VPC.
- Newer GKE versions describe this as "control plane access" plus "private nodes" options, but the idea is the same.

**Example:**
```bash
gcloud container clusters create prod-gke --region asia-south1 \
  --enable-ip-alias --enable-private-nodes --master-ipv4-cidr 172.16.0.0/28 \
  --enable-master-authorized-networks --master-authorized-networks 203.0.113.10/32
```

:::say
In a public GKE cluster nodes have external IPs and the API endpoint is public; in a private cluster nodes only have internal IPs, outbound goes through Cloud NAT, and the control plane is private or restricted with authorized networks. For production I always use private nodes.
:::

## Security: What methods do you use to check code vulnerabilities?

<!-- source: 07 Q9 -->

*Also asked as:* How do you do vulnerability scanning in the pipeline? How do you detect and measure security vulnerabilities for our company?

:::note In simple words
It is like checking a car at several stations - inspect the design drawings (SAST), check the spare parts you bought from others (SCA), inspect the finished car body (image scan), then take it for a test drive to see if the brakes fail (DAST).
:::

| Type | What it checks | Tools |
| --- | --- | --- |
| SAST (static) | Your source code for bugs like SQLi, hardcoded secrets | SonarQube, Semgrep, CodeQL, Checkmarx |
| SCA (dependencies) | Known CVEs in libraries you import | Snyk, OWASP Dependency-Check, Dependabot, Trivy |
| Secret scanning | Passwords/keys committed to Git | Gitleaks, TruffleHog, GitHub secret scanning |
| Container image scan | OS packages and libs inside the image | Trivy, Grype, ECR/Artifact Registry scanning |
| IaC scan | Misconfigured Terraform/K8s YAML | Checkov, tfsec/Trivy config, KICS |
| DAST (dynamic) | The running app, attacked from outside | OWASP ZAP, Burp Suite |

How I wire it in CI/CD:
1. Pre-commit hooks for secrets (Gitleaks).
2. On pull request: SAST + SCA + IaC scan; results shown on the PR.
3. After image build: Trivy scan; **fail the build on CRITICAL/HIGH** with a fix available.
4. After deploy to staging: OWASP ZAP baseline scan.
5. Continuous: registry re-scans and Dependabot PRs for new CVEs.

How I **measure** it for the company (what you can't measure, you can't improve):
- **Open vulnerabilities by severity** (Critical/High/Medium/Low), trended weekly per team or service.
- **MTTR to patch** (mean time from detection to fix) and an **SLA per severity**, for example Critical within 7 days, High within 30 and Medium within 90, reported as the % fixed within SLA.
- **Coverage**: % of repos with SAST/SCA and % of running images scanned.
- **Posture scores**: Microsoft Defender for Cloud **secure score**, AWS **Security Hub** score, GCP Security Command Center findings.
- **External validation**: periodic **pen tests**, and a **bug bounty** or responsible-disclosure program.
- Monthly dashboard to leadership, so the trend is visible and owned.

**Example:**
```
# Fail the pipeline if the image has fixable HIGH/CRITICAL CVEs
trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
  123456789012.dkr.ecr.ap-south-1.amazonaws.com/app:1.4.2

# SonarQube scan with quality gate
sonar-scanner -Dsonar.projectKey=app -Dsonar.qualitygate.wait=true
```

:::say
I layer the checks: secret scanning and SAST with SonarQube on every PR, SCA with Snyk or Trivy for dependency CVEs, Checkov for IaC, Trivy image scans that fail the build on fixable critical issues, and an OWASP ZAP DAST scan in staging. Quality gates make the pipeline block rather than just report.
:::

## Azure: What is the difference between Azure Key Vault and Managed Identity, and how do they work together?

<!-- source: 07 Q11 -->

:::note In simple words
Key Vault is a bank locker that holds your secrets. Managed Identity is the app's own ID card, issued and renewed by Azure automatically. The app shows its ID card at the locker, and the locker opens only the drawers that ID is allowed to open. No password is written down anywhere.
:::

| | Azure Key Vault | Managed Identity |
| --- | --- | --- |
| What it is | A store for **secrets, keys and certificates** | An **identity** (a service principal in Entra ID) for an Azure resource |
| Solves | "Where do I keep the DB password / TLS cert / encryption key?" | "How does my app log in to Azure without a stored credential?" |
| Credentials | Holds them, with versioning, rotation and HSM-backed keys | None to manage; Azure issues and rotates tokens |
| Types | Standard / Premium (HSM), Managed HSM | System-assigned (lives and dies with the resource) or user-assigned (reusable) |

How they work together:
1. Enable a managed identity on the App Service, VM, Function or AKS workload (AKS uses Workload Identity).
2. Grant that identity access on the vault: the **Key Vault Secrets User** RBAC role (recommended) or a legacy access policy.
3. The app asks the local endpoint (IMDS) for a token, and Azure SDKs do this through `DefaultAzureCredential`.
4. It calls Key Vault with the token and gets the secret. No password or connection string sits in config.
5. App Service can even use **Key Vault references** in app settings: `@Microsoft.KeyVault(SecretUri=...)`.

The **AWS analogy** is an IAM role attached to EC2/Lambda (identity) plus Secrets Manager (store). In GCP it is a service account with Workload Identity plus Secret Manager.

**Example:**
```bash
az webapp identity assign -g prod-rg -n pay-api
PRINCIPAL=$(az webapp identity show -g prod-rg -n pay-api --query principalId -o tsv)
az role assignment create --assignee $PRINCIPAL --role "Key Vault Secrets User" \
  --scope $(az keyvault show -n pay-kv --query id -o tsv)
az webapp config appsettings set -g prod-rg -n pay-api --settings \
  DB_PASSWORD="@Microsoft.KeyVault(SecretUri=https://pay-kv.vault.azure.net/secrets/db-pass/)"
```

:::say
Key Vault stores secrets, keys and certificates, while Managed Identity gives the app an Entra ID identity with no credentials to manage. I enable a managed identity on the app, grant it the Key Vault Secrets User role, and the app gets a token and reads the secret at runtime, so nothing sensitive is in config. It's the same pattern as an IAM role plus Secrets Manager in AWS.
:::

## Azure: What is Azure Monitor Logs, and how does it differ from Azure Monitor Metrics?

<!-- source: 07 Q12 -->

:::note In simple words
Metrics are the car's speedometer and fuel gauge: small numbers, updated every minute, instant to read. Logs are the detailed trip diary: rich and searchable, but bigger, slower and more expensive to keep.
:::

| | Azure Monitor Metrics | Azure Monitor Logs |
| --- | --- | --- |
| Data | Numeric **time series** (CPU %, requests/sec) | Rich **records**: app logs, activity logs, resource logs, traces |
| Storage | Time-series metrics database | **Log Analytics workspace** |
| Query | Metrics Explorer, simple aggregations | **KQL (Kusto Query Language)**, joins, parsing |
| Latency | Near real time (about 1 minute) | Usually a few minutes of ingestion delay |
| Retention | Platform metrics kept 93 days | Configurable: interactive 30 days to 2 years, long-term archive up to 12 years |
| Cost | Platform metrics are free | Paid **per GB ingested** plus retention; the main cost driver |
| Alerts | Metric alerts (fast, cheap) | Log search alerts (flexible, slower) |

When to use which:
- **Metrics** for fast health alerts, such as CPU > 85% for 5 minutes or HTTP 5xx rate.
- **Logs** for investigation and complex conditions, such as the top failing URLs by client IP or joining app errors with deployments.
- Send resource logs to a workspace with **Diagnostic settings**. Control cost with the Basic logs tier, daily caps, sampling and archive.
- Application Insights (workspace-based) stores its telemetry in the same workspace.

**Example:**
```
// KQL: 5xx errors per 5 minutes from App Service HTTP logs, last 24 hours
AppServiceHTTPLogs
| where TimeGenerated > ago(24h) and ScStatus >= 500
| summarize errors = count() by bin(TimeGenerated, 5m), CsUriStem
| order by errors desc

// Slowest dependencies seen by Application Insights
AppDependencies
| summarize p95 = percentile(DurationMs, 95) by Target
| top 5 by p95
```

:::say
Azure Monitor Metrics is a near-real-time time-series store for numeric data like CPU, good for fast and cheap alerts, with 93 days of retention. Azure Monitor Logs stores rich records in a Log Analytics workspace that you query with KQL, with configurable retention and pay-per-GB ingestion. I use metric alerts for health and log queries for investigation and complex alerts.
:::
