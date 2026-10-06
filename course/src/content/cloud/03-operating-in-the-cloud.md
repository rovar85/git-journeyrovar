---
track: cloud
title: Operating in the cloud: reliability, backups and migrating Enterprise Vault
short: Operating in cloud
sub: Design for failure, plan backups and disaster recovery, control costs, and think through moving an archiving platform to the cloud.
---

:::goals
- explain RPO, RTO and the disaster-recovery patterns
- apply the Well-Architected pillars
- design backup and retention thinking for an archive
- outline a migration of an EV-style workload and its risks
:::

## Design for failure

In the cloud, **everything fails eventually**: instances, disks, zones, APIs. Good designs assume it and recover automatically:

| Practice | Meaning |
|---|---|
| **Redundancy** | at least two of everything critical, in different zones |
| **Health checks and auto-healing** | load balancers and autoscaling groups replace bad instances (Kubernetes does this for Pods) |
| **Statelessness** | keep state in databases/object storage, so any server can be replaced |
| **Infrastructure as code** | rebuild the whole environment from Git (Terraform, Ansible) |
| **Graceful degradation** | if a dependency fails, serve something reduced rather than nothing |
| **Chaos testing** | break things on purpose in test to prove recovery |
| **Retries with backoff and timeouts** | tolerate short outages without making them worse |

## Backups and disaster recovery

Two numbers define recovery targets:

- **RPO** (recovery point objective): how much data you can afford to **lose** (measured in time: "at most 15 minutes").
- **RTO** (recovery time objective): how long you can afford to be **down** ("back in 4 hours").

Lower numbers cost more. Match them to the business need for each system:

| DR pattern | RPO / RTO | Cost | Idea |
|---|---|---|---|
| **Backup and restore** | hours to days | lowest | copy data elsewhere; rebuild when needed |
| **Pilot light** | minutes to hours | low | minimal core (database replica) always on; scale up on disaster |
| **Warm standby** | minutes | medium | smaller full copy running in another region |
| **Active-active** | near zero | highest | multiple regions serve traffic at once |

```run
python3 - <<'EOF'
# How much data could be lost for a given backup schedule, and how long to restore?
systems = [
    # name, backup interval (min), data size GB, restore throughput GB/h
    ("SQL database (log shipping)", 15, 800, 300),
    ("EV archive store (daily snapshot)", 24*60, 20000, 400),
    ("File shares (nightly)", 24*60, 3000, 300),
]
print(f"{'system':36} {'worst-case data loss':>22} {'restore time':>14}")
for name, interval, size, rate in systems:
    loss = f"{interval} min" if interval < 120 else f"{interval/60:.0f} hours"
    restore_h = size / rate
    print(f"{name:36} {loss:>22} {restore_h:>11.1f} h")
EOF
```

Worst-case data loss is the **backup interval** (the failure can happen right before the next backup), and restore time is size over throughput. If the business requires 1 hour RPO for the archive, a daily snapshot **fails** that requirement, and a 50 hour restore of 20 TB may violate the RTO: the numbers expose the gap before a disaster does.

**The golden rules:** follow **3-2-1** (3 copies, 2 different media/services, 1 offsite or in another region/account); keep at least one copy **immutable** (object lock / WORM) against ransomware and mistakes; **test restores** regularly; back up configuration (and Terraform state) as well as data; protect backups with separate credentials.

## The Well-Architected pillars

Cloud providers publish frameworks with the same six themes:

| Pillar | Question |
|---|---|
| **Operational excellence** | can we deploy, observe and improve safely (CI/CD, runbooks, monitoring)? |
| **Security** | identity, least privilege, encryption, detection, data protection? |
| **Reliability** | do we recover from failures and meet RPO/RTO? |
| **Performance efficiency** | right resource types, scaling, caching? |
| **Cost optimisation** | do we pay only for value, and know where money goes? |
| **Sustainability** | do we use resources efficiently? |

Use them as a review checklist for any design.

## Encryption and data protection

- **In transit**: TLS everywhere (see the Networking track).
- **At rest**: provider-managed keys by default; customer-managed keys in a **KMS/Key Vault** for control and rotation.
- **Classification**: know what data is sensitive; archives often hold regulated content (retention, legal hold, privacy law).
- **Residency**: keep data in the allowed region.

## Cost operations (FinOps)

Costs are an operational metric like latency. Practices: **tag** every resource and report by owner; set **budgets and anomaly alerts**; **schedule** non-production off; **right-size** after measuring; use **storage tiers** (hot, cool, archive: archive tiers are far cheaper but retrieval is slow and costs money); delete unattached disks and old snapshots; review **data egress**.

## A case study: Enterprise Vault in the cloud

Take the archiving platform you have been studying and think like a cloud architect. A typical on-premises EV estate has EV servers, SQL Servers, indexes on fast storage, vault stores on large storage, an SMTP/Exchange integration and a backup system.

| Component | Possible cloud approach | Things to check |
|---|---|---|
| EV servers (Windows) | VMs in at least two zones, built by Terraform and configured by Ansible (WinRM); autorecovery | supported OS and licence rules, domain join, DNS |
| SQL databases | managed SQL (RDS/Azure SQL Managed Instance) or SQL on VMs with availability groups | version and feature support, latency to EV, backup/PITR, RPO |
| Vault store (bulk archive) | object storage or file service; tiering to cool/archive classes | **supported storage types for the product**, retrieval latency, retention/immutability (WORM) |
| Indexes | fast SSD disks (low latency matters) | rebuild time after loss, snapshot schedule |
| Network | private subnets, VPN/ExpressRoute to the mail system, private endpoints | bandwidth for initial migration, no overlapping CIDR |
| Identity | Entra ID / AD (domain controllers in cloud or hybrid) | service accounts, least privilege |
| Backup/DR | cross-region copies, immutable backups, tested restores | RPO/RTO per tier from the table above |
| Monitoring | metrics, logs, alerts (see the Monitoring track), runbooks | queue lengths, indexing backlog, storage growth |
| Cost | tiering, scheduling non-prod, reserved capacity for steady servers | egress when users retrieve archived items |

Migration approaches (the "Rs"): **rehost** (lift and shift VMs), **replatform** (move to managed databases/storage), **refactor** (re-architect), **retire**, **retain**. For a packaged product like EV the safe path is usually **rehost with replatformed storage and databases where the vendor supports it**, executed as repeatable code, with a **pilot** migration and a rollback plan. A **migration runbook** states the order (network, identity, databases, EV servers, data copy, cutover, validation, rollback), who does what, and success checks. Everything in this course contributes: Linux/Windows administration for the servers, networking for connectivity, Terraform and Ansible for repeatable builds, monitoring for confidence, Git and CI/CD for change control.

## Incident thinking

When something breaks in production: **stabilise first** (restore service, roll back), **communicate** (status page, stakeholders), **investigate** after, then write a **blameless post-mortem** with timeline, causes (contributing factors, not "someone's mistake") and **actions with owners**. This culture matters as much as the tools.

<!-- deeper -->
## A worked answer and common mistakes

One reasonable answer for EV's SQL database:

| Item | Choice | Why |
|---|---|---|
| **RPO** | 15 minutes | archive metadata loss beyond that is unacceptable |
| **RTO** | 4 hours | the business can live without search for half a day |
| **DR pattern** | warm standby in a second region | cheaper than active/active, faster than rebuilding |
| **Backup method** | full nightly plus transaction-log backups every 15 minutes, copied to another region | log backups give the 15 minute RPO |
| **Restore test** | automated quarterly: restore to a scratch server, run checks, record the time | proves the RTO |

:::warn Common mistakes
- **Backups that were never restored.** An untested backup is a hope, not a backup.
- **Backups in the same account and region as the data,** lost together in one incident.
- **No cost visibility:** missing tags and budget alerts.
- **Lift and shift without checking licences, latency to users and the egress cost** of moving data out.
:::
<!-- /deeper -->

:::recap
- Design for failure: redundancy, auto-healing, statelessness, everything as code, tested recovery.
- RPO is tolerable data loss; RTO is tolerable downtime. Backup interval and restore speed decide whether you meet them.
- 3-2-1 backups, one immutable copy, test restores. Use the Well-Architected pillars as a checklist.
- Migrating a product like EV: map each component, check vendor support, plan network and identity, pilot, runbook, rollback, monitor, control costs.
:::

:::try Your turn
Pick EV's SQL database and fill in: RPO, RTO, the DR pattern you would choose, the backup method, and how you would test the restore every quarter.
:::

:::quiz
? What does RPO measure?
+ How much data loss (in time) is acceptable
- How fast you must recover
- The monthly cost
- The number of servers
! RTO is the recovery time.
? Which backup practice protects against ransomware?
+ An immutable (write-once) copy kept separately
- A second copy on the same server
- A shared network drive
- No backups
! Attackers cannot encrypt or delete what is locked.
? What does 3-2-1 mean?
+ 3 copies, on 2 different media or services, with 1 offsite
- 3 servers, 2 zones, 1 region
- 3 users, 2 admins, 1 root
- 3 days, 2 weeks, 1 month
! A basic, durable rule.
:::
