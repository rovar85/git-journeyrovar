---
track: cloudsenior
title: Q7: Explain your strategy for disaster recovery and business continuity in cloud environments
short: Q7 DR and BC
sub: From business impact analysis to tested recovery: tiering, the 3-2-1 backup rule, ransomware-resistant backups, retention, and a working backup-verify-restore drill that measures a real recovery time.
---

:::goals
- distinguish business continuity from disaster recovery and start from business impact analysis
- turn applications into recovery tiers with RTO and RPO
- apply the 3-2-1 rule and make backups immutable and verifiable
- implement a retention schedule and a backup, corrupt, detect, restore drill and measure the recovery time
- explain testing, runbooks, and communication, which decide whether recovery works in practice
:::

:::note Provenance
The backup and restore drill runs for real in the lab (files, `tar`, `sha256sum`, `date`), and the retention planner is plain Python. Named cloud features (immutable object storage, backup vaults, cross-account replication) are described generically; product names are from my own knowledge and change.
:::

## 1. DR versus BC

| | Business continuity (BC) | Disaster recovery (DR) |
|---|---|---|
| Question | how does the **business keep operating** during and after a disruption? | how do we **restore the IT systems** and data? |
| Scope | people, processes, premises, suppliers, communications, **plus** IT | **technology**: infrastructure, applications, data |
| Owner | business leadership with risk and operations | technology teams, driven by business requirements |
| Output | a continuity plan, manual workarounds, crisis communications, roles | recovery plans, runbooks, tested backups and failover |

A senior answer **starts with the business**: DR exists to **serve BC requirements**. Disasters include far more than "a region is down": **ransomware, human error (a deleted production account), a bad deployment, provider outage, corruption, a lost key, a compromised identity, a vendor failure.**

## 2. The method

1. **Business impact analysis (BIA)**: for each business process, **what is the cost per hour of downtime** and the **maximum tolerable downtime**, and what data loss is acceptable? Interview owners; do not guess.
2. **Map processes to applications and dependencies** (identity, DNS, network, databases, third-party services). **Recovery order follows dependencies**: you cannot restore an application before the identity service it signs in with.
3. **Assign tiers** with an RTO and RPO each (Q1):

| Tier | Example | RTO | RPO | Strategy (Q1 ladder) |
|---|---|---|---|---|
| 0 | identity, payments, core network | minutes | near zero | active-active or warm standby, synchronous or near-synchronous data |
| 1 | the archiving platform's ingestion and search | 1 to 4 hours | minutes | warm standby or pilot light |
| 2 | reporting, internal tools | next business day | hours | backup and restore with automation |
| 3 | dev and test, archives of archives | days | a day or more | backups only |

4. **Choose the strategy per tier**, price it, and have the **business accept the cost and the residual risk** in writing.
5. **Write runbooks, test them, and keep them current.** Plans that are never exercised fail on first use.

## 3. Backups done right: 3-2-1 and beyond

The classic rule: **3 copies** of the data, on **2 different kinds of storage**, with **1 copy offsite**. Modern cloud practice extends it:

- **Separate failure and permission domains**: copies in **another account** (or tenant) and **another region**, with **different credentials**, so a compromised production account **cannot delete the backups**.
- **Immutability**: write-once storage (object lock, vault lock, immutable blob policies) with a **retention period nobody can shorten**, even administrators. This is the defence against **ransomware and malicious deletion**.
- **Versioning and point-in-time recovery**, so a corruption noticed late can be rolled back to **before** it.
- **Encryption** with keys that **also survive** the disaster (Q11): a backup you cannot decrypt is not a backup.
- **Application-consistent** backups for databases and anything with transactions (native database backups and log shipping, snapshots coordinated with the application), not just crash-consistent disk snapshots.
- **Monitoring**: alert when a **backup job fails, is late, or shrinks suddenly** (a sudden size drop can mean it is silently skipping data).

**Replication is not backup** (Q1): it copies corruption and deletion in seconds.

## 4. Retention: what to keep

Keeping every backup forever is expensive; keeping too few loses the ability to go back far enough. A **grandfather-father-son** style schedule keeps recent backups densely and old ones sparsely. A planner shows what a policy keeps:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > retention.py <<'EOF'
import datetime
today = datetime.date(2026, 10, 1)
backups = [today - datetime.timedelta(days=d) for d in range(0, 400)]           # one backup per day for 400 days

def keep(backups, daily=7, weekly=4, monthly=12):
    kept, reason = set(), {}
    for b in sorted(backups, reverse=True):
        age = (today - b).days
        if age < daily:                                      kept.add(b); reason[b] = "daily"
        elif b.weekday() == 6 and age < weekly * 7 + daily:  kept.add(b); reason[b] = "weekly (Sunday)"
        elif b.day == 1 and age < monthly * 31:              kept.add(b); reason[b] = "monthly (1st)"
    return kept, reason

kept, reason = keep(backups)
by = {}
for b in kept: by[reason[b]] = by.get(reason[b], 0) + 1
print(f"{len(backups)} daily backups taken over 400 days; the policy keeps {len(kept)}:")
for k, v in sorted(by.items()): print(f"   {v:3d} x {k}")
oldest = min(kept)
print(f"oldest restore point: {oldest} ({(today - oldest).days} days back)")
print(f"storage if every backup were kept: {len(backups)} units; with the policy: {len(kept)} units ({len(kept) / len(backups):.0%})")
print("Regulations may require LONGER retention for some data (legal hold, financial records): retention is a legal question too.")
EOF
python3 retention.py
```

Retention interacts with **compliance** (some data must be kept for years, some must be **deleted** by a date: privacy rules) and with **ransomware**: if an attacker is inside for 30 days, a 7-day retention means **every backup is already infected**. Keep **longer-term restore points** and scan restores.

## 5. A backup, verify and restore drill that measures RTO

An untested backup is a hope. This drill does what a recovery test does, in miniature: create data, back it up with a **manifest of checksums** to **two locations**, destroy part of the data, **corrupt one backup copy**, **detect** the corruption through the manifest, **restore from the good copy**, **verify** integrity, and **time** the restore:

```run
cd ~/lab/cs
rm -rf drill && mkdir -p drill/prod drill/backupA drill/backupB && cd drill
for i in $(seq 1 200); do head -c 20000 /dev/urandom > prod/file$i.dat; done          # 200 files of data
sha256sum prod/*.dat | sort -k2 > manifest.sha256                                   # the manifest travels with the backup
tar -czf backupA/archive.tar.gz prod manifest.sha256 && cp backupA/archive.tar.gz backupB/archive.tar.gz
echo "backup taken: $(du -sh backupA/archive.tar.gz | cut -f1) in two locations"

echo "--- disaster: production data is destroyed, and backup A is silently corrupted"
rm -rf prod
head -c 3000 /dev/urandom | dd of=backupA/archive.tar.gz bs=1 seek=50000 conv=notrunc 2> /dev/null

echo "--- recovery: try each copy, verify before trusting it"
start=$(date +%s.%N)
for copy in backupA backupB; do
  rm -rf restore && mkdir restore
  if tar -xzf $copy/archive.tar.gz -C restore 2> /dev/null && (cd restore && sha256sum --quiet -c manifest.sha256 2> /dev/null); then
    echo "$copy: restore verified, all 200 files match their checksums"
    mv restore/prod prod; break
  else
    echo "$copy: FAILED verification (corrupt), trying the next copy"
  fi
done
end=$(date +%s.%N)
awk -v s=$start -v e=$end 'BEGIN {printf "measured restore time for this dataset: %.2f seconds\n", e - s}'
ls prod | wc -l | awk '{print "files restored:", $1}'
```

What the drill proves, and what to say in an answer:

- **Verification before trust**: the manifest let us **detect** the silently corrupted copy; without it we would have restored garbage. Real backup tools do this with built-in checksums, but you must **actually restore and check**.
- **Two copies saved the day**: the second location existed because of 3-2-1.
- **Time is measured, not guessed**: this is the **recovery time for the data step**. A real **RTO test adds everything else** (provision infrastructure, restore databases, replay logs, reconfigure DNS, validate the application) and compares the sum with the tier's RTO. **Scale the data step**: restoring 40 TB at the real network and disk speed is a calculation you do **in advance** (data size divided by effective throughput), and it often reveals that the RTO is unachievable with that design.

## 6. Ransomware-specific recovery

- **Assume the attacker has admin rights** on production (and tried to delete backups): immutable, **separate-account** backups are what remain.
- **Know the clean point**: logs and integrity checks to find **when** the compromise began; restore from **before** it.
- **Restore into a clean environment** (isolated network, rebuilt from infrastructure as code, Q8), **not** over the infected one; rotate credentials and keys.
- **Practise a clean-room recovery** and keep the **runbook and contact list offline or outside** the affected systems, because your wiki may be encrypted too.

## 7. Operating the programme

- **Runbooks**: step by step, written for someone tired at 3 a.m., with owners, dependencies, commands and **expected outputs**; stored where they remain **accessible during the disaster**.
- **Testing ladder**: **backup restore tests** (automated, weekly or monthly), **tabletop exercises** (talk through a scenario with the business), **component failover tests**, **full DR tests or game days** (annually at least for tier 0 and 1), and **failback**. **Record the measured RTO and RPO** and compare with the targets. Missed targets are a **finding with an owner**, not an embarrassment.
- **Communication plan**: who declares a disaster, who speaks to customers and regulators, the channels (an out-of-band one), and templates.
- **Dependencies**: the DR plan itself needs **identity, DNS, network and secrets** to work (Q1, Q11); test a recovery **with the primary systems unavailable**.
- **Change management**: DR plans rot as systems change; make **DR a step of every significant change** and keep the infrastructure code for the recovery site in sync (Q8).
- **Metrics**: percentage of systems with a **tested** recovery in the last year, **measured vs target** RTO and RPO, backup success rate, restore test pass rate.

## 8. How to answer

1. **Start with BIA**: "I start from business impact, not from technology: what does an hour of downtime cost each process, and what data loss is tolerable?"
2. **Tier the applications**, with RTO and RPO and a strategy per tier (the ladder), agreed and **signed off by the business**.
3. **Backups**: 3-2-1, separate account and region, **immutable**, encrypted with recoverable keys, application-consistent, monitored.
4. **Failure scenarios beyond a region outage**: ransomware, deletion, corruption, bad releases, key loss, and the specific controls for each.
5. **Prove it**: restore tests, tabletops, game days, measured RTO and RPO against targets, runbooks, **failback**.
6. **Close with the people side**: roles, communications, the plan's own dependencies.

## 9. Follow-up questions to expect

- "How do you **test DR without taking down production**?" (restore into an isolated environment, fail over a non-critical tier first, staged game days, ensure rollback)
- "What if the **backup system itself** is compromised?" (separate account, immutability, separate credentials, a copy outside the cloud account or provider for the most critical data)
- "How do you **meet a 15-minute RTO for a 40 TB database**?" (you cannot restore it: you need replication and a warm standby; restore is for slower tiers)
- "How do you handle **SaaS data** (email, source code, SaaS apps)?" (providers protect their platform, not your accidental deletion: back it up and read the responsibility terms)
- "How often should you **test**?" (restore checks continuously or monthly, DR for top tiers at least annually and after major changes)

:::warn Common mistakes
- **Starting from technology, not from business impact.**
- **Backups never restored**, or restored only into the same account that can delete them.
- **Backups and credentials in the same blast radius** as production.
- **Ignoring dependencies** (identity, DNS, keys) in the recovery order.
- **No failback plan.**
- **Runbooks stored only inside the systems that are down.**
- **Promising an RTO** nobody has measured.
:::

:::recap
- **BC** is business operation, **DR** is technology recovery driven by it; start from **BIA** and **tier** applications with RTO and RPO.
- Backups: **3-2-1, separate account and region, immutable, encrypted with survivable keys, verified, monitored**; replication is not backup.
- Retention balances restore depth, cost and law; ransomware needs **long enough** history.
- **Verify before trusting and measure restore time**: the drill showed checksums catching a corrupt copy and a second copy saving the recovery.
- A programme is **runbooks, tests, game days, communication and measured results**, including failback.
:::

:::try Your turn
Change the drill so that **both** backup copies are corrupted and watch the verification fail, then add a third location (`backupC`) to the script so the drill survives it. In `retention.py`, change to keep 14 daily and 6 monthly backups and compute the new storage ratio.
:::

:::quiz
? Why is replication not a substitute for backup?
+ Corruption and deletion are replicated to the copy within seconds
- Replication is always asynchronous
- Backups are free
- Replication needs a licence
! Backups provide independent, versioned, immutable history.
? What does the 3-2-1 rule say?
+ Three copies, on two kinds of storage, with one copy offsite
- Three regions, two clouds, one account
- Three backups per week, two per month, one per year
- Three admins, two approvers, one auditor
! Modern practice adds immutability and a separate account.
? Why verify a backup with checksums before restoring it?
+ A silently corrupted backup would otherwise be restored as if it were good
- Checksums make restores faster
- Providers require it
- It reduces storage
! Detect corruption before it becomes the production copy.
:::
