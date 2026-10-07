---
track: cloudsenior
title: Q4: How do you ensure security and compliance across cloud accounts?
short: Q4 Security and compliance
sub: Preventive, detective and corrective controls, CIS benchmarks and frameworks, policy as code with a working compliance scanner, audit evidence and data residency.
---

:::goals
- explain security and compliance as a continuous system, not an annual audit
- distinguish preventive, detective and corrective controls and place each
- describe what CIS benchmarks and compliance frameworks are for and how they relate
- run a policy-as-code scanner over a resource inventory, with exceptions, a score and a pipeline gate
- cover data residency end to end, and structure a senior answer
:::

:::note Provenance
The scanner is **real code I wrote** over a made-up inventory; its rules are **modelled on common benchmark recommendations** and use my own rule IDs. The CIS Benchmarks and the compliance frameworks are described from my own knowledge: **check the current benchmark documents for exact recommendation numbers and the framework texts for exact requirements**. Product names (AWS Config and Security Hub, Microsoft Defender for Cloud and Azure Policy, Google Security Command Center and organisation policies, Open Policy Agent, Checkov) are from my knowledge.
:::

## 1. What the interviewer is testing

Can you describe a **system** that keeps dozens or hundreds of accounts secure and **provably compliant**, without becoming a gatekeeper that slows every team? The words to hit: **guardrails, policy as code, continuous compliance, evidence, least privilege, shared responsibility, exceptions**.

## 2. The three kinds of control

| Kind | When it acts | Examples |
|---|---|---|
| **Preventive** | **before** the action succeeds | organisation-level **deny policies** (no public storage, only approved regions), IaC checks that **fail the pipeline**, admission control that **rejects** a bad Kubernetes object, IAM boundaries |
| **Detective** | **after**, by looking | continuous configuration scanning, audit-log analytics, threat detection, drift reports |
| **Corrective** | **repairs** | automatic remediation (close the open port, re-enable logging), quarantine of a compromised credential, ticket with an owner and a deadline |

The mature order is **prevent what you can, detect what you cannot prevent, correct what you can safely automate**. Relying only on detection means every mistake exists for a while; relying only on prevention means every unforeseen case is a blocked team and an exception request.

## 3. Benchmarks and frameworks: what each is for

- **CIS Benchmarks** (Center for Internet Security) are **consensus configuration guides** per platform: there are benchmarks for the major clouds' foundations and for operating systems, Kubernetes and more. They list concrete recommendations (for example "do not allow SSH from the whole internet", "enable audit logging in all regions", "require MFA for privileged users"), usually at two levels: **Level 1** (practical baseline, low impact) and **Level 2** (stricter, may affect function). They answer **"how should this be configured?"**
- **Compliance frameworks and regulations** (for example **ISO/IEC 27001**, **SOC 2**, **PCI DSS** for card data, **HIPAA** for US health data, **GDPR** for EU personal data, and government schemes) answer **"what must the organisation demonstrate?"** They are about **controls, evidence and process**, and they are mostly not technical checklists.
- **Cloud providers' compliance programmes** give you **their** audit reports (the provider's half of the **shared responsibility** model). You still own your configuration.

How they combine: a **control** (for example "storage must be encrypted and not public") is **implemented** with technical policies (informed by CIS), **tested continuously** by scanners, and **evidenced** to auditors from those scans and logs.

## 4. The architecture of the answer

1. **A control catalogue** mapped to the frameworks you must meet: each control has an ID, an owner, a severity, an automated check where possible, and the evidence it produces.
2. **Preventive guardrails at the organisation level** (Q3): region allow-lists, deny public exposure of storage and databases, deny disabling audit logs or encryption defaults, restrict who can create IAM users or long-lived keys.
3. **Policy as code in the pipeline**: IaC scanned **before merge** (Checkov, tfsec or Trivy, OPA with Conftest; Q8, Q10), Kubernetes admission policies (Pod Security, Kyverno, Gatekeeper).
4. **Continuous detective scanning** across all accounts, **aggregated** into one place (the provider's posture services above), with findings **routed to the owning team** with a due date by severity.
5. **Identity as the new perimeter**: SSO, MFA, least privilege, short-lived credentials, access reviews, privileged access with approval and recording.
6. **Central, immutable logging** (Q3) and **threat detection**, with alert routing and an incident process.
7. **Data protection**: classification, **encryption at rest and in transit with managed keys** (Q11), backup protection, data loss prevention where needed.
8. **Evidence and audit**: automated evidence collection, a dashboard of compliance **score over time**, exceptions with owner and **expiry date**, regular internal reviews so external audits are uneventful.
9. **Culture and enablement**: **secure by default modules**, paved paths (Q13), training, and a **security champion** in each team.

## 5. Policy as code: a working scanner

A resource inventory (what a scan would collect across accounts) is checked against rules. Each finding has a **rule ID, severity and owner**, an approved **exception** can waive it until a date, and the **exit code** can gate a pipeline:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > scan.py <<'EOF'
import sys, datetime
TODAY = datetime.date(2026, 10, 1)
ALLOWED_REGIONS = {"eu-west", "eu-north"}

INVENTORY = [   # what a configuration scan returns, simplified
    {"account": "ev-prod", "id": "sg-web",     "type": "firewall",  "ingress": [("0.0.0.0/0", 443), ("10.0.0.0/8", 22)], "region": "eu-west", "owner": "ev-team"},
    {"account": "ev-prod", "id": "sg-admin",   "type": "firewall",  "ingress": [("0.0.0.0/0", 22)], "region": "eu-west", "owner": "ev-team"},
    {"account": "ev-prod", "id": "archive-01", "type": "storage",   "public": False, "encrypted": True,  "versioning": True,  "region": "eu-west", "owner": "ev-team"},
    {"account": "ev-test", "id": "scratch-77", "type": "storage",   "public": True,  "encrypted": False, "versioning": False, "region": "us-east", "owner": "ev-team"},
    {"account": "ev-prod", "id": "sql-main",   "type": "database",  "public": False, "encrypted": True,  "backup_days": 7,  "region": "eu-west", "owner": "dba"},
    {"account": "ev-test", "id": "sql-test",   "type": "database",  "public": False, "encrypted": False, "backup_days": 0,  "region": "eu-west", "owner": "dba"},
    {"account": "hub",     "id": "trail",      "type": "audit-log", "enabled": False, "region": "eu-west", "owner": "secops"},
]
EXCEPTIONS = {("SEC-04", "ev-test/sql-test"): datetime.date(2026, 12, 31)}   # (rule, resource) waived until a date; recorded and approved

def rules(r):
    out = []
    if r["region"] not in ALLOWED_REGIONS:
        out.append(("SEC-01", "high", "resource is outside the allowed regions (data residency)"))
    if r["type"] == "firewall":
        for cidr, port in r["ingress"]:
            if cidr == "0.0.0.0/0" and port in (22, 3389):
                out.append(("SEC-02", "critical", f"management port {port} open to the whole internet"))
    if r["type"] == "storage":
        if r["public"]:      out.append(("SEC-03", "critical", "storage is publicly accessible"))
        if not r["encrypted"]: out.append(("SEC-04", "high", "storage is not encrypted at rest"))
        if not r["versioning"]: out.append(("SEC-05", "medium", "versioning is off (cannot recover from deletion or ransomware)"))
    if r["type"] == "database":
        if not r["encrypted"]: out.append(("SEC-04", "high", "database is not encrypted at rest"))
        if r["backup_days"] < 7: out.append(("SEC-06", "high", f"backup retention is {r['backup_days']} days (policy: at least 7)"))
    if r["type"] == "audit-log" and not r["enabled"]:
        out.append(("SEC-07", "critical", "audit logging is disabled"))
    return out

findings, waived = [], []
for r in INVENTORY:
    for rule, sev, msg in rules(r):
        key = (rule, f"{r['account']}/{r['id']}")
        if key in EXCEPTIONS and EXCEPTIONS[key] >= TODAY:
            waived.append((key, EXCEPTIONS[key])); continue
        findings.append((sev, rule, key[1], msg, r["owner"]))

order = {"critical": 0, "high": 1, "medium": 2}
for sev, rule, res, msg, owner in sorted(findings, key=lambda f: order[f[0]]):
    print(f"{sev:8} {rule}  {res:18} -> {owner:8} {msg}")
print()
for key, until in waived:
    print(f"waived   {key[0]}  {key[1]:18} (approved exception until {until})")
print(f"\n{len(INVENTORY)} resources, {len(findings)} open findings, {len(waived)} waived")
crit = sum(1 for f in findings if f[0] == "critical")
print("PIPELINE GATE:", "FAIL (critical findings present)" if crit else "PASS")
sys.exit(1 if crit else 0)
EOF
python3 scan.py; echo "exit code: $?"
```

What this demonstrates, in the words of an answer:

- **One rule set, many accounts**: the same checks run everywhere, findings carry an **owner**, so they route to the right team.
- **Severity drives action**: critical findings **block** a pipeline or page; medium ones become tickets with a deadline.
- **Exceptions are data**: an approved waiver has a **rule, a resource and an expiry**; it is **not** a silent omission, and it **expires** and reappears.
- The exit code makes it a **gate**. The same rules should also exist in the provider's policy engine, so a console click cannot bypass them.

## 6. Data residency and sovereignty

Data residency means **where data is stored and processed** must satisfy legal or contractual requirements (for example, EU personal data kept in the EU, or national rules for government data). A complete answer covers **every place data can be**, not only the primary database:

| Place | Control |
|---|---|
| **Primary storage and databases** | allowed-region policy at the organisation level (preventive), checked by the scanner above |
| **Backups and replicas** | the DR region (Q1) must also be allowed; check replication targets |
| **Logs, metrics, traces** | often contain personal data and are exported to central tools: keep the **log archive in an allowed region** |
| **Encryption keys** | keys in an allowed region, **customer-managed** if the requirement says the provider must not be able to read the data (Q11) |
| **Support and administrative access** | who can access the data from where; provider "sovereign" or restricted-support options (from my knowledge, vary by provider) |
| **Third-party services and SaaS** | data processing agreements, where the vendor processes data |
| **Data in transit** | encryption, private connectivity (Q6) |

Add **data classification** (public, internal, confidential, restricted) so rules apply to the right data, and remember the difference: **residency** is where the data is, **sovereignty** is whose laws can compel access to it.

## 7. Audits without panic

- **Automate evidence**: scanner results over time, policy definitions in Git with their change history, access review records, audit logs. An auditor's request becomes a **query**, not a project.
- **Map controls to frameworks once** and reuse the evidence for several audits.
- **Track the compliance score and findings trend** and the **mean time to remediate** by severity; report to leadership.
- **Rehearse**: periodic internal audits and tabletop exercises for incidents.

## 8. How to answer

1. **Frame it as a system** with the three control types, and say you **prevent first**.
2. Walk **identity, network, data, logging, workloads**, giving the preventive control and the detective check for each.
3. Mention **benchmarks** (CIS) for configuration, **frameworks** for obligations, and how they are **mapped to automated checks and evidence**.
4. Cover **data residency across backups, logs and keys**.
5. Address the **people side**: exceptions with expiry, secure-by-default modules, champions, not blocking teams.
6. Give a **measure**: findings by severity, time to remediate, percentage of resources in policy.

## 9. Follow-up questions to expect

- "A team needs something your policy forbids. What happens?" (exception process: owner, reason, compensating control, expiry)
- "How do you secure **hundreds of accounts without slowing teams**?" (guardrails and paved paths, fast self-service, automation)
- "How do you handle **findings backlog**?" (risk-based prioritisation, ownership, deadlines, trend reporting)
- "What would you do after discovering a **public storage bucket** with sensitive data?" (contain, assess exposure through logs, notify per policy and law, fix root cause, add the preventive control)
- "How do you secure the **pipelines** that deploy everything?" (least privilege roles, OIDC instead of stored keys, protected branches, signed artefacts, approvals)

:::warn Common mistakes
- **Compliance as an annual project** instead of continuous checks with automated evidence.
- **Only detective controls**, so every misconfiguration is live for days.
- **Exceptions that never expire.**
- **Forgetting backups, logs and keys** when talking about data residency.
- **Treating a certification of the provider as your own compliance.** The configuration is yours.
- **Findings without owners**, so nobody fixes them.
:::

:::recap
- **Prevent** with organisation-level guardrails and pipeline checks; **detect** continuously; **correct** automatically where safe.
- **CIS benchmarks** say how to configure; **frameworks** say what you must demonstrate; map controls to **automated checks and evidence**.
- **Policy as code** scales: one rule set, owners on findings, severity-driven action, **exceptions with expiry**, a **gate** in the pipeline.
- **Data residency** covers backups, logs, keys, support access and third parties, not just the database.
:::

:::try Your turn
Add rule SEC-08 to `scan.py` that flags any database without encryption **or** whose owner is empty, and add an inventory entry for an object storage bucket in `eu-central` (not allowed). Add an exception for it with an **expired** date and confirm it reappears as a finding.
:::

:::quiz
? What is the difference between a preventive and a detective control?
+ Preventive controls stop the action from succeeding; detective controls find problems after they exist
- Preventive controls are cheaper
- Detective controls stop actions
- They are the same
! Prefer prevention for known bad patterns and detection for the rest.
? What should every policy exception have?
+ An owner, a reason, an approval and an expiry date
- Nothing; it is a verbal agreement
- A permanent waiver
- A random review
! Expired exceptions must reappear as findings.
? Which statement about data residency is most complete?
+ It must cover backups, logs, encryption keys and administrative access as well as the primary storage
- It applies only to the main database
- It is solved by choosing one region once
- It is the provider's job alone
! Data lives in many places beyond the primary store.
:::
