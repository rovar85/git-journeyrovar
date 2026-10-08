---
track: qbank
title: "GCP, Azure and DevSecOps: Scenario-based questions"
short: GCP/Azure scenario
sub: 8 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## GCP: How do you restrict and protect a web application from cyber attacks on GCP?

<!-- source: 07 Q25 -->

:::note In simple words
Put the app behind Google's big front gate (global load balancer), station the guard there (Cloud Armor), lock all the back doors (private backends, firewall), and keep the keys in a safe (Secret Manager, IAM).
:::

Step by step:
1. **Global external Application Load Balancer** as the only entry point, with **Google-managed SSL certificates** and an SSL policy enforcing TLS 1.2+; HTTP -> HTTPS redirect.
2. **Cloud Armor** policy on the backend: OWASP preconfigured rules (SQLi, XSS, LFI, RCE), **rate limiting / rate-based ban**, geo restriction, **Adaptive Protection** for L7 DDoS, reCAPTCHA Enterprise for bots. Start in preview mode.
3. **Private backends**: GKE private nodes or MIGs with no external IPs; firewall allows port 443/80 only from Google LB and health-check ranges (`35.191.0.0/16`, `130.211.0.0/22`).
4. **Admin access** through **Identity-Aware Proxy (IAP)** - no public SSH, no bastion with open ports.
5. **Cloud CDN** for static content to absorb traffic.
6. **Data protection**: Cloud SQL with private IP, CMEK via Cloud KMS, Secret Manager for credentials, **VPC Service Controls** around sensitive data.
7. **Supply chain**: Artifact Analysis scanning + Binary Authorization.
8. **Detect**: Security Command Center, Cloud Armor logs in Cloud Logging, alerts on spikes of 403/429.

**Example:**
```bash
# Allow LB and health-check traffic only; nothing else reaches the backends
gcloud compute firewall-rules create allow-glb --network prod-vpc --direction INGRESS \
  --allow tcp:80,tcp:443 --source-ranges 35.191.0.0/16,130.211.0.0/22 --target-tags web

# Rate-based ban: >100 req/min per IP -> banned for 10 minutes
gcloud compute security-policies rules create 900 --security-policy web-policy \
  --src-ip-ranges "*" --action rate-based-ban --rate-limit-threshold-count 100 \
  --rate-limit-threshold-interval-sec 60 --ban-duration-sec 600 \
  --conform-action allow --exceed-action deny-429 --enforce-on-key IP
```

:::say
I expose the app only through the global HTTPS load balancer with Cloud Armor OWASP rules, rate-based bans and Adaptive Protection, keep backends private with firewall rules allowing only Google LB ranges, and use IAP for admin access. Data is protected with private Cloud SQL, KMS and Secret Manager, and Security Command Center plus Armor logs give detection.
:::

## Azure: During an Azure deployment you get intermittent DNS resolution issues. What can be the causes?

<!-- source: 07 Q26 -->

:::note In simple words
DNS is the phone book. "Sometimes it works" means some phone books are outdated, some operators are overloaded, or some calls are routed to the wrong exchange.
:::

Likely causes and checks:
1. **Custom DNS servers on the VNet** (e.g., on-prem AD DNS) that don't forward to Azure DNS **168.63.129.16** - private endpoints and private zones won't resolve consistently. Fix: conditional forwarders or **Azure DNS Private Resolver**.
2. **Private DNS zone not linked** to every VNet (hub/spoke), or duplicate zones with different records -> some VMs get public IP, others private.
3. **Stale caching / TTL**: during deployments resources are recreated (new IPs, slot swaps), and clients or intermediate resolvers keep old answers until TTL expires.
4. **One of multiple DNS servers is unhealthy** - clients rotate between them, so failures look random.
5. **AKS-specific**: CoreDNS pods overloaded or scaled too low; `ndots:5` causing many extra lookups; the known **UDP conntrack race** (fix with NodeLocal DNSCache); SNAT port exhaustion on outbound.
6. **Throttling**: Azure DNS limits queries per VM (around 1000 qps per VM to 168.63.129.16) - chatty apps hit it.
7. **NSG/firewall** blocking UDP/TCP 53 to some DNS servers, or Azure Firewall DNS proxy misconfigured.
8. **Propagation delays** after creating/changing public DNS records.

How to debug:
- Test from the failing host repeatedly: `nslookup` / `dig` against each DNS server; compare results.
- Check which DNS server the VNet/VM uses; check private zone links.
- In AKS, check CoreDNS logs and metrics.

**Example:**
```bash
for i in $(seq 1 20); do dig +short myapp.privatelink.database.windows.net; done
az network vnet show -g net-rg -n spoke-vnet --query dhcpOptions.dnsServers
az network private-dns link vnet list -g dns-rg -z privatelink.database.windows.net -o table
kubectl -n kube-system logs -l k8s-app=kube-dns --tail 50
```

:::say
I would check whether custom DNS servers forward to 168.63.129.16, whether the private DNS zones are linked to every VNet, TTL caching after resources were recreated, an unhealthy DNS server in the rotation, and in AKS CoreDNS load, ndots and the conntrack race. I prove it by querying each DNS server repeatedly from the failing host and comparing answers.
:::

## Azure: An Azure Function is being throttled. How will you detect and fix it?

<!-- source: 07 Q27 -->

*Also asked as:* An Azure Function has frequent timeouts. How do you troubleshoot it?

:::note In simple words
The function is a toll booth. Throttling means too many cars are arriving - either the booth itself limits cars, or the road after it (a database or API) is jammed and sends cars back.
:::

**Detect**
- **Application Insights**: HTTP **429** responses, failed invocations, increased duration, dependency failures.
- **Azure Monitor metrics**: function execution count, instance count, queue length growing (for queue/Event Hub triggers).
- Host logs showing the host is at max concurrency, or downstream **429 from Cosmos DB/Storage/external API**.
- Check **plan limits**: Consumption plan has cold starts and a maximum instance count; one instance handles limited concurrency.

**Fix (depending on the cause)**
1. **Plan limits**: move to **Premium (Elastic Premium)** or **Flex Consumption** for pre-warmed instances, higher scale-out and VNet support; or raise `functionAppScaleLimit` if it was set low.
2. **Concurrency tuning** in `host.json`: `maxConcurrentRequests` for HTTP, `batchSize`/`maxConcurrentCalls` for queue/Service Bus - to either use capacity better or protect downstream.
3. **Downstream throttling**: add retries with exponential backoff, increase Cosmos DB RU/s or enable autoscale, cache results, batch writes.
4. **Buffer bursts**: put a queue (Service Bus/Storage Queue) in front so spikes are absorbed and processed at a steady rate.
5. **Front door rate limits**: if API Management is in front, check its rate-limit policy.
6. Reduce execution time (reuse HTTP/DB clients, avoid static-per-call connections).

**If the symptom is timeouts rather than 429s:**
- **functionTimeout per plan**: Consumption defaults to 5 minutes (max 10), while Premium and Dedicated default to 30 minutes and can be unbounded. Set it in `host.json`.
- **HTTP triggers have a hard limit of about 230 seconds** (the front-end load balancer idle timeout), whatever functionTimeout says. For long work, return 202 quickly and use the **Durable Functions async HTTP pattern** or hand off to a queue.
- **Cold starts** on Consumption: use Premium/Flex always-ready instances, or keep the package small.
- **Outbound connection / SNAT port exhaustion**: creating a new `HttpClient` or DB connection per call exhausts ports, so reuse static clients and use connection pooling.
- **Slow downstream**: find it with **Application Insights dependency tracking** (duration per dependency, failed calls), then add timeouts, retries and caching.

**Example:**
```json
{
  "version": "2.0",
  "functionTimeout": "00:10:00",
  "extensions": {
    "http": { "maxConcurrentRequests": 100, "maxOutstandingRequests": 200 },
    "serviceBus": { "maxConcurrentCalls": 32 }
  },
  "retry": { "strategy": "exponentialBackoff", "maxRetryCount": 5,
             "minimumInterval": "00:00:02", "maximumInterval": "00:00:30" }
}
```

:::say
I detect it in Application Insights and Azure Monitor - 429s, rising duration, growing queue length - and then identify whether the limit is the plan, host concurrency or a throttled downstream like Cosmos DB. Fixes are moving to Premium or Flex Consumption, tuning host.json concurrency, backoff retries, more downstream capacity, and a queue to buffer bursts. For timeouts I check functionTimeout for the plan, the 230-second HTTP limit (moving long work to Durable Functions), cold starts, SNAT exhaustion from not reusing HttpClient, and slow dependencies in Application Insights.
:::

## Azure: Design a cost-optimized cloud architecture for an internal reporting app that runs every night and stores logs for 3 years.

<!-- source: 07 Q28 -->

:::note In simple words
Don't rent a full-time taxi for a trip you take once a night. Book a cab only for the ride (serverless/spot), and put old files in a cheap basement storeroom (archive tier) instead of the expensive front shelf.
:::

Design principles: **pay only while running**, **tier storage by age**, **no always-on servers**.

| Piece | Azure | AWS equivalent |
| --- | --- | --- |
| Nightly trigger | Logic Apps / Function timer / Container Apps Job (cron) | EventBridge Scheduler |
| Compute for the job | Container Apps Job or Azure Batch on **Spot VMs** | Fargate Spot / AWS Batch on Spot / Lambda |
| Source data | Read replica or export, so prod DB is not loaded | RDS read replica / snapshot export |
| Report output | Blob Storage (Hot for 30 days) | S3 Standard |
| Log retention 3 yrs | Log Analytics short retention (30-90 days) + export to Blob; lifecycle Cool -> Cold -> Archive | CloudWatch 30-90 days -> S3; lifecycle to Glacier Deep Archive |
| Access for users | Power BI / static page with Entra ID auth | QuickSight / S3 + CloudFront |

Cost levers:
1. Compute scales to **zero** between runs; Spot for batch (retry if evicted).
2. **Lifecycle management**: Hot 30 days -> Cool 90 days -> Archive until 3 years -> delete. Archive tier is a tiny fraction of hot storage cost (remember retrieval takes hours - fine for audit logs).
3. Keep **Log Analytics** interactive retention short; long-term logs as compressed files in storage, not in the expensive analytics store.
4. Run in one region with **LRS/ZRS** (not GRS) unless compliance requires otherwise; use **immutability policy** if logs are for audit.
5. Budgets and cost alerts; tag everything.

**Example:**
```json
{
  "rules": [{
    "name": "logs-3yr",
    "enabled": true,
    "type": "Lifecycle",
    "definition": {
      "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["logs/"] },
      "actions": { "baseBlob": {
        "tierToCool":    { "daysAfterModificationGreaterThan": 30 },
        "tierToArchive": { "daysAfterModificationGreaterThan": 120 },
        "delete":        { "daysAfterModificationGreaterThan": 1095 } } }
    }
  }]
}
```

:::say
I would run the nightly job as a scheduled Container Apps Job or Batch on Spot that scales to zero, read from a replica, write reports to Blob, and keep logs short-term in Log Analytics while exporting to Blob with a lifecycle policy moving to Cool, then Archive, and deleting after 3 years. On AWS that is EventBridge plus Fargate Spot and S3 lifecycle to Glacier Deep Archive.
:::

## Azure: The production app works fine for internal users but external users get 403 errors. How will you isolate the issue?

<!-- source: 07 Q29 -->

:::note In simple words
Staff enter through the back door and walk straight in; visitors come through the front door where the guard is turning them away. So look at the front-door guard, not the building.
:::

403 means the request **reached something that refused it** (not a network timeout). The difference between internal and external users is the **path**, so compare paths:

1. **Map both paths**: internal users may hit the private IP / internal DNS directly; external users go through **Front Door / App Gateway WAF / API Management / public DNS**.
2. **Check the WAF logs first** - the most common cause. A managed rule (e.g., SQLi false positive), **geo-filter**, bot rule, or IP rule blocking. Query `AzureDiagnostics` for `ApplicationGatewayFirewallLog` / Front Door WAF logs with `action == Block`.
3. **App Service Access Restrictions** / Azure Functions IP restrictions allowing only internal ranges, or requiring the Front Door header `X-Azure-FDID` - requests bypassing Front Door get 403.
4. **Storage/Key Vault firewall** or **private endpoint only** settings - external calls to a public endpoint get 403.
5. **Authentication**: Entra ID **Conditional Access** (trusted locations/compliant device), Easy Auth, or the app rejecting tokens from external tenants.
6. **Host header / CORS / hostname** issues: external domain not in allowed hosts, or origin checks in the app.
7. Reproduce: `curl -v` from outside (mobile hotspot or cloud shell) vs inside, compare response headers (Front Door, App Gateway and App Service return different 403 pages/headers) to pinpoint the layer.

Fix: tune/exclude the WAF rule (never just disable the WAF), correct access restriction rules, or update Conditional Access - then add a synthetic external check so it is caught earlier.

**Example:**
```
AzureDiagnostics
| where Category == "ApplicationGatewayFirewallLog" and action_s == "Blocked"
| summarize count() by ruleId_s, Message, clientIp_s, requestUri_s
| order by count_ desc

az webapp config access-restriction show -g prod-rg -n bank-web
```

:::say
Since internal users succeed, I compare the request paths and look at the layers only external traffic passes through - first the WAF logs on Front Door or App Gateway, then App Service access restrictions, storage or Key Vault firewalls and Conditional Access. I reproduce with curl from outside, read which layer returned the 403 from the headers, and fix that rule rather than disabling protection.
:::

## Security: A service account key/credential leaked in a public container image. How fast can you isolate and rotate it, and how do you prevent it from happening again?

<!-- source: 07 Q30 -->

:::note In simple words
Your house key was left in a box posted on the internet. Taking the box down doesn't help - someone may already have copied the key. Change the lock immediately, check the CCTV for who came in, then stop putting keys in boxes.
:::

Golden rule: **assume the credential is compromised forever**. Deleting the image from the registry does not un-leak it - anyone could have pulled or cached it.

1. **Contain (first 5-15 minutes)**: disable or delete the leaked key right away - GCP service account key, AWS access key, or K8s service account token. Don't wait until a replacement is ready; a short outage is better than an attacker with access.
2. **Remove the exposure**: make the repository or image tag private, delete the affected tags and layers, and ask any mirror or cache to purge them.
3. **Rotate and restore**: create a new credential (ideally switch to keyless, see step 6), store it in a secret manager, and redeploy the consumers so they read it from there.
4. **Investigate**: search **Cloud Audit Logs / CloudTrail** for any use of the leaked key ID - which source IPs, which API calls, and any new resources (VMs, keys, IAM bindings, crypto miners). Check the **blast radius** of that identity's permissions and revoke anything an attacker created, such as new keys or users.
5. **Hunt for more leaks**: scan other images and the git history - `trivy image --scanners secret`, `gitleaks`, `trufflehog`. Rewrite git history if needed, but still rotate.
6. **Prevent**:
   - Go keyless: **GKE Workload Identity**, **IRSA/EKS Pod Identity**, and **OIDC federation for CI** (GitHub Actions to AWS/GCP), so there is no key file to leak.
   - Keep secrets out of the build: BuildKit `--mount=type=secret`, a proper `.dockerignore`, multi-stage builds.
   - Add secret scanning in pre-commit and CI that blocks the push or build.
   - Set the org policy `iam.disableServiceAccountKeyCreation` (and an SCP or alerts on `CreateAccessKey` in AWS).
   - Least privilege, so the next leak has a small blast radius.
7. Write a blameless postmortem with owners and dates for each action.

| Time | Action |
| --- | --- |
| 0-15 min | Disable/delete key, make image private, alert security |
| 15-60 min | New credential in secret manager, redeploy consumers |
| 1-4 hrs | Audit log review, revoke attacker-created resources |
| Same day | Scan all images and repos, purge history |
| 1-2 weeks | Keyless identity, CI secret scanning, org policy, postmortem |

**Example:**
```bash
# GCP: disable then delete the leaked key
gcloud iam service-accounts keys disable KEY_ID --iam-account app@my-proj.iam.gserviceaccount.com
gcloud iam service-accounts keys delete KEY_ID --iam-account app@my-proj.iam.gserviceaccount.com
gcloud logging read 'protoPayload.authenticationInfo.serviceAccountKeyName:"KEY_ID"' --freshness 30d

# AWS: deactivate the key and see where it was used
aws iam update-access-key --user-name ci-bot --access-key-id AKIA... --status Inactive
aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA...

# Hunt for other leaks
trivy image --scanners secret myorg/app:latest
gitleaks detect --source . --log-opts="--all"

# Build without baking secrets into layers
docker build --secret id=npmrc,src=$HOME/.npmrc .   # Dockerfile: RUN --mount=type=secret,id=npmrc ...
```

:::say
Within minutes I disable the leaked key without waiting for a replacement, make the image private and treat the key as permanently compromised. Then I rotate to a new credential held in a secret manager, check CloudTrail or Cloud Audit Logs for any misuse and revoke what the attacker created, and scan other images and repos. To prevent a repeat I move to keyless workload identity and OIDC in CI, use BuildKit secret mounts, block pushes with secret scanning, and disable service account key creation by org policy.
:::

## Azure: How would you reduce cost in an over-provisioned Azure environment?

<!-- source: 07 Q31 -->

:::note In simple words
You're paying for a 10-room house but live in 3 rooms with all the lights on. Find the empty rooms, switch off lights when you leave, and sign a yearly lease for the rooms you do use to get a discount.
:::

Step by step:
1. **See the spend**:
   - **Cost Management + Billing**: cost by resource group, service and tag.
   - **Azure Advisor** cost recommendations.
   - Enforce **tags** (owner, env, app) with Azure Policy so every cost has an owner.
2. **Delete waste (quick wins)**:
   - Unattached **managed disks**, old snapshots, idle **public IPs**, orphaned **NICs**.
   - Empty App Service plans, idle load balancers/gateways, forgotten test resources.
3. **Rightsize**:
   - Downsize VMs and App Service plans with low CPU/memory (Advisor flags under ~5% CPU).
   - Move to newer, cheaper VM series.
   - Scale SQL/Cosmos RU/s to the real load.
4. **Scale with demand**:
   - Autoscale App Service/VMSS; set the minimum to what HA needs, not peak.
   - **AKS**: cluster autoscaler per node pool, a **Spot node pool** for batch/stateless workloads, and rightsized pod requests.
5. **Switch off when unused**: **auto-shutdown** or start/stop schedules for dev/test VMs, and scale non-prod AKS to zero at night.
6. **Commit for steady usage**: **Reservations** (1 or 3 years) or **Savings Plans** for the baseline, **Azure Hybrid Benefit** for existing Windows/SQL licenses, and **Spot VMs** for interruptible work.
7. **Storage and logs**:
   - Lifecycle policies Hot -> Cool -> Cold -> Archive.
   - Right redundancy: LRS for non-critical data instead of GRS.
   - **Log Analytics**: daily ingestion caps, the Basic logs tier for noisy tables, shorter interactive retention, and only the needed diagnostic categories.
8. **Govern**: **budgets with alerts** per subscription/team, a monthly FinOps review, and cost shown in dashboards so teams see their own numbers.

Always check performance after each change (latency, errors). Saving money must not break SLOs.

**Example:**
```bash
az advisor recommendation list --category Cost -o table
az disk list --query "[?diskState=='Unattached'].{name:name,rg:resourceGroup,gb:diskSizeGb}" -o table
az network public-ip list --query "[?ipConfiguration==null].{name:name,rg:resourceGroup}" -o table
az vm auto-shutdown -g dev-rg -n dev-vm01 --time 1930
az consumption budget create --budget-name team-a --amount 2000 --time-grain Monthly \
  --category Cost --start-date 2026-10-01 --end-date 2027-09-30
```

:::say
I start with Cost Management and Advisor, with tags enforced so every cost has an owner, then delete orphaned disks, IPs and NICs, rightsize VMs and App Service plans, and add autoscale and AKS spot node pools. Dev/test gets auto-shutdown, the steady baseline gets reservations or savings plans, storage is tiered with lifecycle rules, and Log Analytics ingestion is capped. Budgets and monthly reviews keep it from creeping back, and I verify SLOs after each change.
:::

## Security: An image passed all vulnerability scans but still got exploited in production. What did you miss?

<!-- source: 07 Q32 -->

:::note In simple words
A scanner is like checking a house against a list of known faulty locks. It can't tell you the window was left open, that a new lock flaw was discovered yesterday, or that the burglar was let in by a guest. A clean scan means "no known bad parts", not "safe".
:::

**Why scans aren't enough**: image scanners (Trivy, Grype, ECR/ACR scanning) only match **known CVEs in packages**. They miss **zero-days**, **application logic flaws** (auth bypass, SSRF, injection in your own code), **misconfigurations** and often **secrets**.

Common gaps that let the attack succeed:
1. **Over-privileged pod**: running as root, `privileged: true`, `hostPath` mounts, added capabilities (`NET_ADMIN`, `SYS_ADMIN`), or `hostNetwork`. The attacker can break out to the node.
2. **Default service account token automounted** while the RBAC is too broad. The attacker calls the Kubernetes API, reads secrets or creates pods.
3. **Writable root filesystem**. The attacker downloads and runs a dropper or crypto-miner.
4. **No seccomp/AppArmor profile**, so every syscall is allowed.
5. **Secrets in env vars or image layers**, which the attacker reads straight away.
6. **Open network**: no NetworkPolicy and no egress filtering, so the malware calls back to its C2 server and data leaves freely.
7. **Dependencies pulled at runtime** (`pip install` or `curl | sh` at startup), so the scanned image isn't what actually runs.
8. **Stale scan results**: the image was clean on build day, and a CVE was published later. Rescan the registry and running images continuously.
9. **Unsigned images or mutable tags**: `:latest` was overwritten, so what's running isn't what was scanned.
10. **No runtime detection**: nothing alerted on a shell spawned in a container.

**Incident response**:
1. **Isolate**: apply a deny-all NetworkPolicy to the pod, cordon the node, and don't delete anything yet.
2. **Capture forensics**: pod logs, `kubectl describe`, a container filesystem snapshot or node disk snapshot, K8s audit logs, cloud audit logs.
3. **Rotate every credential** the pod could reach: SA tokens, DB passwords, cloud keys.
4. **Rebuild** from a clean base, patch the root cause, redeploy with hardened settings, and replace the node.
5. Hold a postmortem and add the missing controls below.

| Layer | Control | Tools |
| --- | --- | --- |
| Code | SAST, dependency pinning, DAST | SonarQube, Semgrep, OWASP ZAP |
| Build | Image scan, secret scan, minimal/distroless base | Trivy, Grype, Gitleaks |
| Supply chain | Sign images, deploy by digest, verify at admission | cosign, Kyverno, Binary Authorization |
| Admission | Restricted Pod Security Standard, policy as code | Pod Security Admission, Gatekeeper, Kyverno |
| Pod runtime | Non-root, read-only root FS, drop ALL caps, seccomp RuntimeDefault, no SA token | securityContext, automountServiceAccountToken: false |
| Network | Default-deny ingress and egress, egress allowlist | NetworkPolicy, Cilium/Calico, egress firewall |
| Detection | Runtime threat detection, continuous rescans | Falco, GuardDuty EKS Runtime, Defender for Containers |
| Identity | Least-privilege RBAC and workload identity | RBAC, IRSA, Workload Identity |

**Example:**
```
# Hardened pod settings the scan could never have checked
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: api
      image: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/api@sha256:3f1c...
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]

# Contain first: cut the pod's network, keep it for forensics
kubectl label pod api-7d9f compromised=true -n prod
kubectl apply -f deny-all-for-compromised.yaml
kubectl cordon ip-10-0-3-17.ap-south-1.compute.internal
```

:::say
A clean scan only means no known CVEs in packages; it doesn't cover zero-days, app logic flaws, misconfiguration or CVEs published after the scan. The usual gaps are a root or privileged pod with a broad default service account token, a writable filesystem, no seccomp, secrets in env vars, no egress NetworkPolicy, and no runtime detection like Falco or GuardDuty. I'd isolate the pod and node, capture forensics, rotate every reachable credential and rebuild, then close the gaps with signed digests, the restricted Pod Security Standard, default-deny networking and continuous rescans.
:::
