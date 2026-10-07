---
track: cloudsenior
title: Q1: Design a multi-region, highly available architecture with strict RTO and RPO
short: Q1 Multi-region HA
sub: Turn "strict RTO/RPO" into numbers, pick a disaster recovery pattern from the cost ladder, and prove the design with an availability calculation and a failover simulation.
---

:::goals
- translate RTO and RPO into design decisions instead of buzzwords
- compare the four disaster recovery patterns by recovery time, data loss and cost
- calculate the availability of single-region and multi-region designs
- simulate replication lag at a regional failure and read the data loss from it
- structure a senior-level spoken answer to this question
:::

:::note How this track works
This track is built around the **fifteen senior cloud engineer interview questions** you shared. Each lesson takes **one question**: what the interviewer is really testing, the concepts and trade-offs, a **hands-on demonstration** (calculators, simulators, and real Terraform, Kubernetes and Linux where the lab can run them), a **model answer outline**, the **follow-up questions** to expect, and practice. Cloud provider service names are **from my own knowledge** and labelled as such; the lab has no cloud account, so demonstrations are provider-neutral and run offline. Where a question asks for **your own experience**, the lesson gives a structure and a clearly labelled example, never a story to claim as yours.
:::

## 1. What the interviewer is testing

"Design a multi-region, highly available architecture for a global enterprise with strict RTO/RPO" is **not** a request to draw regions and arrows. It tests whether you:

1. **ask for the numbers first** (what exactly are the RTO and RPO, for which systems, and what does an hour of downtime cost?),
2. know that **every extra nine and every minute of RTO costs money**, and can choose the **cheapest design that meets the requirement**,
3. understand **data**, the hard part (replication, consistency, failover of stateful tiers),
4. think about **failure modes** beyond "a region disappears" (a bad deployment, a corrupted database that replication faithfully copies, a control plane outage),
5. plan to **test** the design.

A strong answer starts with questions, not with a diagram.

## 2. RTO and RPO as design inputs

| Term | Meaning | Drives |
|---|---|---|
| **RTO** (recovery time objective) | the longest acceptable time from failure to service restored | how much capacity is **already running** in the second region, how automated failover is |
| **RPO** (recovery point objective) | the most data you can afford to lose, measured in time | **how data is replicated**: synchronous, asynchronous, or only backups |

Different systems get **different objectives**. An enterprise has tiers (for example, tier 0 payments and identity: RTO minutes, RPO near zero; tier 2 reporting: RTO a day, RPO a day). Designing the whole estate to the strictest tier is the classic expensive mistake. Ask the business to **classify applications**, then design per tier.

## 3. The disaster recovery ladder

Four patterns, in increasing cost and decreasing recovery time:

| Pattern | What runs in the second region | Typical RTO | Typical RPO | Relative cost |
|---|---|---|---|---|
| **Backup and restore** | nothing; backups are copied to the other region | hours to days | hours (last backup) | lowest |
| **Pilot light** | the **data layer** replicates continuously; compute is off or minimal, started on failover | tens of minutes to hours | minutes | low |
| **Warm standby** | a **scaled-down but running** copy of the whole stack, scaled up on failover | minutes to tens of minutes | seconds to minutes | medium |
| **Active-active** (multi-site) | **full capacity in both regions serving traffic** | near zero | near zero (with the right data design) | highest (about 2x, plus complexity) |

These are the patterns the major clouds' Well-Architected material describes (names from my knowledge); the table values are **typical ranges, not guarantees**.

## 4. Availability arithmetic

Compute what each design gives you, using the series and parallel rules from the Cloud fundamentals lesson. Components in a **chain** multiply; **independent redundant copies** reduce the chance that all fail:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > avail.py <<'EOF'
def pct(x): return f"{x * 100:.4f}%"
def downtime_min(a): return (1 - a) * 365 * 24 * 60

region = 0.9995           # one region's application stack, as designed with several zones
db_one = 0.9995           # database service in one region
dns_gtm = 0.9999          # global traffic manager / DNS, itself a shared dependency

single_region = region * db_one
two_regions_parallel = 1 - (1 - single_region) ** 2        # IF failures are independent and failover is instant and perfect
u = 1 - single_region                                      # chance one region is down
failover_ok = 0.99                                         # failover works cleanly in 99% of regional outages
both_or_failed = u * ((1 - failover_ok) + failover_ok * u) # outage where failover fails, or the second region is down too
realistic = dns_gtm * (1 - both_or_failed)                 # and the shared global layer must be up as well

print(f"one region (app x db):                 {pct(single_region)}  -> {downtime_min(single_region):7.0f} min/year down")
print(f"two regions, ideal parallel:           {pct(two_regions_parallel)}  -> {downtime_min(two_regions_parallel):7.1f} min/year down")
print(f"two regions, with a 99.99% global layer and 99% clean failovers: {pct(realistic)}  -> {downtime_min(realistic):7.0f} min/year down")
print("\nThe ideal number is a fantasy: the shared global layer and imperfect failover dominate the real figure.")
EOF
python3 avail.py
```

Lesson from the numbers: **adding a region helps less than the formula says**, because (1) there are **shared dependencies** (global DNS or traffic manager, identity, your deployment pipeline), (2) failover itself fails sometimes, and (3) failures are **not always independent** (a bad release goes to both regions). A senior answer **names the shared dependencies** and says how each is made independent or accepted.

## 5. RPO in practice: replication lag at the moment of failure

Replication between regions is usually **asynchronous**: a transaction is acknowledged to the user **before** it reaches the second region, because waiting for a far-away region slows every write. So at a regional failure, the transactions inside the **replication lag window** are lost. **Synchronous** replication loses nothing but makes every write wait for the distant copy. Quantify both:

```run
cd ~/lab/cs
cat > rpo.py <<'EOF'
import random, math
random.seed(21)

# --- the physics: light in fibre travels about 200 km per millisecond (about two thirds of c)
def rtt_ms(km): return 2 * km / 200 * 1.4          # x1.4: cables are not straight lines, plus equipment delay
for pair, km in (("same metro, two zones", 60), ("London - Dublin", 460), ("London - Virginia", 5600), ("London - Sydney", 17000)):
    print(f"{pair:24} {km:6} km  round trip >= {rtt_ms(km):6.1f} ms  (a synchronous write waits at least this long)")

# --- the simulation: 200 transactions/second, asynchronous replication with variable lag
def lost_transactions(tps=200, mean_lag_s=2.0, trials=2000):
    losses = []
    for _ in range(trials):
        lag = random.lognormvariate(math.log(mean_lag_s), 0.8)       # lag varies: usually small, sometimes large
        losses.append(int(lag * tps))                                  # transactions committed but not yet replicated
    losses.sort()
    return losses[len(losses) // 2], losses[int(0.99 * len(losses))], max(losses)

print("\nRegion fails at a random moment (asynchronous replication, 200 tx/s):")
for mean in (0.5, 2.0, 10.0):
    p50, p99, worst = lost_transactions(mean_lag_s=mean)
    print(f"  typical lag {mean:4.1f} s -> lost transactions: median {p50:5d}, p99 {p99:6d}, worst {worst:6d}")
print("\nAn RPO of 'zero' with asynchronous replication is not achievable; it needs synchronous replication or a different data model.")
EOF
python3 rpo.py
```

What this shows, and what a senior engineer says out loud:

- **Distance is physics.** A London to Virginia round trip is at least about **80 ms**, so synchronous replication across oceans makes every write that slow. Synchronous cross-region replication is realistic only for **nearby regions** (tens to a few hundred km) or for **purpose-built globally consistent databases** (the managed ones of the major clouds trade latency and cost for it).
- With **asynchronous** replication the RPO is **a distribution, not a number**: the tail (p99) of the lag is what you promise, and you must **monitor replication lag as an SLI** and alert when it exceeds the RPO.
- **Zero RPO** means synchronous commit, or an **application design** that tolerates replays (idempotent operations, an event log replicated before the user is acknowledged).

## 6. The RTO budget

RTO is not "how fast can we start servers". It is the **sum of the stages**, and the human ones usually dominate:

```run
cd ~/lab/cs
python3 - <<'EOF'
stages = [("detect the failure (monitoring and alert)", 3), ("page and assemble the on-call engineers", 7),
          ("decide to fail over (a human decision for a big step)", 10), ("promote the database replica", 4),
          ("scale up compute in the target region", 6), ("shift traffic (DNS TTL and caches)", 5), ("verify and announce", 5)]
total = 0
print(f"{'stage':56} {'minutes':>8}")
for name, m in stages:
    total += m; print(f"{name:56} {m:8d}")
print(f"{'RTO if everything is manual':56} {total:8d}")
auto = [("detect", 1), ("automatic decision with health checks", 1), ("promote database", 2), ("traffic shifts at the load balancer, not DNS", 1)]
print(f"{'RTO with tested automation (warm standby)':56} {sum(m for _, m in auto):8d}")
EOF
```

To cut RTO you remove **stages**, not make each one a bit faster: pre-scale (warm standby), **automate the decision** for the cases you trust, route traffic at a **global load balancer or anycast layer** instead of waiting for DNS caches, and **practise** so that nobody is deciding for the first time during an outage.

## 7. A reference design, and the traps

A sound multi-region design for a stateful enterprise application (provider-neutral; service names below are from my knowledge):

1. **Global entry**: a global load balancer or traffic manager with **health checks** (AWS: Route 53, Global Accelerator; Azure: Front Door, Traffic Manager; Google Cloud: global external load balancing).
2. **Stateless tiers** in **each region**, in **at least two or three availability zones**, deployed from **the same pipeline and the same Git commit** (infrastructure as code, GitOps).
3. **State**: choose per data store: a **managed globally replicated database** (AWS Aurora Global Database or DynamoDB global tables; Azure SQL failover groups or Cosmos DB multi-region; Google Spanner or Cloud SQL cross-region replicas), **object storage replication** for files (S3 cross-region replication; geo-redundant storage; multi-region buckets), and **queues or event logs replicated** or designed to replay.
4. **Secrets, keys and identity** available in both regions (multi-region keys, replicated secret stores), because a failover that cannot decrypt is no failover.
5. **Observability outside the failure domain**: your monitoring must not live only in the region that fails.
6. **Backups in a separate account and region**, **immutable**, because replication copies corruption and deletion too. **Replication is not backup.**
7. **Runbooks and game days**: scheduled failover tests, including **failing back**.

Traps interviewers like to probe: **split brain** (both regions think they are primary: use fencing and a single writer), **replicated bad data**, **capacity** (does the surviving region have quota and capacity to take 100% of the load? cloud capacity is not infinite), **DNS TTL and client caches**, **data residency** (some data must not leave a country; Q4), **cost** (a second full region doubles the bill), and **dependencies on a single region's control plane** for the failover action itself.

## 8. How to answer in an interview

A structure that works for any "design X" question:

1. **Clarify** (30 seconds): "What are the RTO and RPO per application tier, which systems are in scope, what are the compliance constraints, and what is the budget or cost of an hour of downtime?"
2. **State the approach by tier**: "Tier 0 gets active-active or warm standby; tier 2 gets backup and restore. I would not design everything to the strictest tier."
3. **Walk the data layer first**, then compute, then traffic management, then operations.
4. **Name the trade-offs and the numbers**: "Asynchronous replication across oceans gives an RPO of seconds, not zero; zero needs synchronous commit with a latency cost of at least X ms."
5. **Close with how you would prove it**: game days, replication-lag SLOs, failover automation tests, and a cost review.

Model answer outline (for a payments-grade tier, as an example): *"Active-active across two regions in the same legal jurisdiction, a global load balancer with health checks, stateless services in three zones per region, a globally replicated database with synchronous commit between the two nearby regions to give RPO zero at an acceptable write latency, replicated keys and secrets, observability in a third location, immutable cross-account backups for corruption, automated failover for the cases we have tested and a human decision for the rest, and a quarterly game day including failback."*

## 9. Follow-up questions to expect

- "What happens when the **replication itself** breaks and nobody notices?" (lag SLI and alert)
- "How do you **fail back**, and when?" (a planned, tested operation, not a reflex)
- "How do you test this **without** causing an outage?" (game days in stages, chaos engineering, failover of a non-critical copy first)
- "What if the **control plane** of the cloud is the thing that is down?" (pre-provisioned capacity, no dependence on the control plane for the failover path)
- "How much does it **cost**, and who pays for the second region?"

:::warn Common mistakes
- **Designing before asking for RTO, RPO and tiers.**
- **Treating replication as backup.** Corruption and deletion replicate instantly.
- **Counting regions as independent** while sharing DNS, identity, a pipeline and a bad release.
- **Never testing failover** (and never failing back).
- **Forgetting capacity** in the surviving region, and the keys and secrets needed to start there.
- **Promising zero RPO with asynchronous replication.**
:::

:::recap
- Ask for **RTO and RPO per tier**; design to the tier, not the strictest one.
- The ladder: **backup and restore, pilot light, warm standby, active-active**: more cost, less recovery time.
- **Availability gains from a second region are smaller than the formula** because of shared dependencies and imperfect failover.
- **RPO with asynchronous replication is a lag distribution**; zero needs synchronous commit, and distance sets the latency cost.
- **RTO is a sum of stages**; remove stages by pre-scaling, automating and routing traffic at the load balancer; **practise**.
:::

:::try Your turn
In `rpo.py` add your own region pair (for example "Frankfurt - Singapore", about 10,300 km) and compute its minimum round trip. Then in `avail.py` change `failover_ok` from 0.99 to 0.9 and then to 0.999 and compare the yearly downtime. Which input matters most to the final number?
:::

:::quiz
? Why is zero RPO difficult across distant regions?
+ It needs synchronous replication, and the speed of light makes every write wait for the far region
- Cloud providers forbid it
- Backups are slow
- DNS cannot be replicated
! Asynchronous replication always has a lag window where committed data is not yet replicated.
? Which disaster recovery pattern keeps only the data layer running in the second region?
+ Pilot light
- Backup and restore
- Active-active
- Warm standby
! Compute is started on failover, so the RTO is longer than warm standby.
? Why is replication not a backup?
+ Corruption and accidental deletion are replicated to the copy too
- Replication is slower than backup
- Backups are encrypted and replicas are not
- Replication works only within a region
! Backups need separate, immutable, versioned copies.
:::
