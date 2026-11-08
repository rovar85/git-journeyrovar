---
track: seniorqa
title: "Q1: Design a highly available multi-region Kubernetes platform"
short: Q1 Multi-region HA
sub: Clarify the target, choose active-active or active-passive, route traffic, replicate data, and work out the real availability and failover time with numbers.
---

:::goals
- ask the clarifying questions that decide the design (target, data, traffic, cost)
- compare single region, active-passive and active-active with the availability maths
- explain the failover time budget and what sets RTO and RPO
- describe the control plane, data plane, traffic, data and deployment layers of a multi-region platform
:::

:::note How this connects
Disaster-recovery tiers (backup, pilot light, warm standby, active-active) are in [Senior cloud 1](#cloudsenior-1) and [Senior cloud 7](#cloudsenior-7). Cluster basics are in [Kubernetes 1](#kubernetes-1). This lesson is the Kubernetes-platform answer, with a model you can run.
:::

## Design a highly available multi-region Kubernetes platform

**What the interviewer tests:** do you ask what "highly available" must mean in numbers, do you know that the **data layer** is the hard part, and do you admit that multi-region costs money and complexity?

### Clarifying questions to ask first

- What is the **availability target** (99.9%, 99.95%, 99.99%) and what does an hour of downtime cost? That decides whether multi-region is worth it.
- What are **RTO** (how long can we be down) and **RPO** (how much data can we lose)? A zero RPO needs synchronous replication across distance, which is slow.
- Is the application **stateless** with a managed database, or does it hold state itself?
- Where are the **users**? Spread across continents (latency matters, active-active helps) or in one (active-passive is enough)?
- Are there **data residency** rules (for example EU data must stay in the EU)?
- What is the **budget**? Active-active roughly doubles the infrastructure bill.

State your assumptions: "I will assume 99.99%, RPO under 1 minute, RTO under 5 minutes, users in two continents, a managed database."

### The numbers first

A single region that is 99.95% available is down about 22 minutes a month. Two **independent** regions in active-active, behind a router, can reach 99.999%, but only if failures are truly independent and the router itself is reliable. A shared bad deployment or a shared control plane makes them **one failure domain**, which is the point many candidates miss.

```run
mkdir -p ~/lab/seniorqa/q1 && cd ~/lab/seniorqa/q1
cat > avail.py <<'EOF'
# Availability arithmetic for a multi-region design. Numbers are illustrative inputs, not provider promises.
def nines(a): return f"{a * 100:.4f}%"
def downtime_min_per_month(a): return (1 - a) * 30 * 24 * 60
region = 0.9995                     # what one region (all its dependencies) delivers
print("single region                          ", nines(region), f"-> {downtime_min_per_month(region):6.1f} min/month down")
# active-active across 2 regions: down only when BOTH are down (assumes independent failures) AND the routing layer works
router = 0.99999
aa = (1 - (1 - region) ** 2) * router
print("2 regions active-active (independent)  ", nines(aa), f"-> {downtime_min_per_month(aa):6.1f} min/month  <- limited by the router")
print("   with correlated failures (shared bad deploy, shared control plane): treat the regions as ONE for that failure class")
# active-passive: the passive region only helps after detection + failover time
detect_and_switch_min = 8; region_failures_per_year = 2
ap_down = region_failures_per_year * detect_and_switch_min
ap = 1 - (ap_down / (365 * 24 * 60)) ; ap = min(ap, 1)
print(f"active-passive, {detect_and_switch_min} min failover x {region_failures_per_year}/yr  ", nines(ap), f"-> {downtime_min_per_month(ap):6.1f} min/month (only the failover windows count)")
print("\nWhat the failover window is made of (DNS-based failover):")
steps = [("health check detects failure (3 checks x 10 s)", 30), ("DNS record changes (TTL 60 s, clients cache)", 60), ("resolvers and clients that ignore TTL", 120), ("warm-up of cold caches/pods in the survivor", 90)]
t = 0
for name, sec in steps: t += sec; print(f"   +{sec:4d} s  {name:52} cumulative {t:4d} s")
print(f"   => plan for about {t / 60:.0f} minutes of degraded service unless you use anycast/global load balancing and pre-warmed capacity")
print("\nRPO (data loss) is set by the replication mode, RTO (time) by detection + routing + capacity:")
for mode, rpo, note in (("synchronous replication across regions", "0 s", "every write waits for the far region: higher write latency"), ("asynchronous replication", "seconds (replication lag)", "lowest latency, may lose the last writes"), ("periodic backups copied to another region", "minutes to hours", "cheapest")):
    print(f"   {mode:42} RPO ~ {rpo:26} {note}")
EOF
python3 avail.py
```

What the output shows:

- Single region at 99.95%: **21.6 minutes of downtime a month**.
- Two independent active-active regions: **99.999%**, but "limited by the router". And if both regions take the same bad release, the independence assumption is false.
- Active-passive with an 8-minute failover twice a year: **99.997%**. Only the failover windows count as downtime.
- DNS-based failover takes about **5 minutes** (30 s detection + 60 s TTL + 120 s of clients that ignore TTL + 90 s warm-up). To do better you need global load balancing or anycast, and pre-warmed capacity.
- **RPO** is set by the replication mode: synchronous gives about zero loss but slows every write; asynchronous loses the last seconds; backups copied across regions lose minutes to hours.

### The architecture, layer by layer

1. **Clusters.** One Kubernetes cluster per region, each spread over **three zones** with node pools per zone, so a zone failure never needs a region failover. Treat clusters as **cattle**: built from code (Terraform plus a GitOps bootstrap), never hand-edited.
2. **Traffic.** A global entry point: Route 53 latency or failover routing with health checks, or a global load balancer / anycast (Cloudflare, Google Global LB, AWS Global Accelerator). Health checks must test a **real dependency path**, not just "port open".
3. **Application.** Stateless services with readiness probes, PodDisruptionBudgets, topology spread across zones, and autoscaling. Each region has enough capacity to take the other's load (or you accept degraded service and plan to scale fast).
4. **Data.** The hard part. Options:
   - **Single-writer, read replicas** in the second region (async). Simple, RPO is the lag. Failover means promoting a replica and **fencing** the old primary so it cannot also accept writes (split brain).
   - **Multi-writer** (Spanner, CockroachDB, DynamoDB global tables, Cassandra): active-active writes, but you must accept either higher write latency (consensus) or conflict resolution (last-writer-wins can lose data). Needs the quorum thinking of [Systems 8](#systems-8).
   - Caches and queues: decide per component whether to replicate or rebuild after failover.
5. **Deployment.** The same Git repository drives every region ([GitOps](#kubernetes-19)). Roll out **region by region** with a bake time, never to all regions at once, so a bad release hits one region only. This is how you get real failure independence.
6. **Secrets and config.** Replicated secret store per region; config rendered from the same source with small per-region overlays.
7. **Observability.** Per-region and global SLO dashboards, synthetic checks **from outside** the cloud, and an alert on "region health diverges".
8. **Operations.** A written failover runbook and a **game day**: fail a region on purpose in a non-peak window. An untested failover does not exist.

### Active-passive or active-active?

| | Active-passive (warm standby) | Active-active |
|---|---|---|
| Cost | Lower (standby scaled down) | Higher (full capacity everywhere) |
| Failover | Minutes, needs promotion and scaling | Seconds, traffic simply shifts |
| Data | Single writer, simple | Needs multi-writer or partitioned ownership |
| Risk | Standby rots if never exercised | Capacity: one region must absorb the other |
| Good when | RTO of minutes is acceptable | Global users, very low RTO |

A good answer: "I would start with **active-passive warm standby** and graduate to active-active only for the services that need it, usually the read path first, because multi-writer data is where the cost and the bugs are."

### Failure modes to walk through

- **A zone fails:** handled inside the region; no regional failover.
- **The regional control plane or the managed database fails:** fail over; promote the replica; fence the old one; verify replication lag first to know the data loss.
- **A bad release:** progressive rollout and automatic rollback; do not fail over a bug to the other region.
- **Split brain:** both regions think they are primary. Prevent it with a single source of truth for leadership (consensus or a fencing token) and with routing that cannot send writes to two places.
- **Failback:** coming back is as risky as going out. Re-seed the old region, replicate, then switch at a quiet time.
- **DNS and clients:** low TTL helps only clients that respect it; budget for the stragglers.

### Cost and trade-offs to name

Roughly 2x infrastructure for active-active, plus cross-region data transfer charges, plus engineering time for the data layer. Say the sentence an interviewer wants to hear: "Multi-region buys protection against a regional outage, which is rare; most outages are bad deploys and bad config, which multi-region does not fix, so I invest in safe delivery first."

:::say
First I would agree the numbers: availability target, RTO and RPO, and whether the data is single-writer. I would run one Kubernetes cluster per region, spread across three zones, built from code and driven from one Git repository, rolling out region by region so a bad release hits one region. Traffic goes through a global load balancer with real health checks. The hard part is data: I would start with an asynchronous replica and fencing, which gives an RPO of seconds and a failover of a few minutes, and only use multi-writer databases where the business needs active-active. I would test it with a game day, because an untested failover does not exist. The model I ran showed a single region at 99.95 percent is about 22 minutes a month, and two independent regions can reach five nines only if they do not share a failure, such as a common bad deploy.
:::

## Follow-up questions

:::answer How do you prevent split brain after a failover?
Make leadership explicit and single-sourced: a consensus-based store (or the database's own failover manager) decides the primary; the old primary is **fenced** (network isolated, instance stopped, or its fencing token rejected by storage) before the new one accepts writes; and the router only sends writes to the current leader. Never rely on "the old one will notice it is demoted".
:::

:::answer Why not just stretch one Kubernetes cluster across regions?
The control plane (etcd) needs low latency between members; across regions its quorum slows and a partition can stall the control plane. The cluster also becomes one failure domain. Separate clusters per region, with the same code deployed to each, give independence.
:::

:::answer How do you handle a stateful service that cannot be multi-writer?
Make one region the owner of each piece of data (for example by customer or by shard) and route that customer there, so you are active-active across customers but single-writer per customer. Or keep it active-passive and accept the failover time.
:::

:::answer What do you test, and how often?
Quarterly game days that fail a region (traffic shift, then a database promotion), measured against the stated RTO and RPO; restore tests of backups; and continuous synthetic checks from outside. Record the measured numbers and fix the gaps.
:::

## Practice (answers below)

1. Two regions each 99.9% available, independent, behind a perfect router: what is the combined availability? What changes if they share a deploy pipeline?
2. Name three parts of the DNS failover window.
3. Why can synchronous replication across continents hurt a write-heavy service?

:::note Answers
1. 1 - (0.001 x 0.001) = 99.9999% on paper. If both receive the same bad release at once, the failures are correlated and the real number is closer to a single region's. 2. Health-check detection, DNS TTL, clients that ignore TTL, and cache/pod warm-up in the survivor. 3. Every write waits for a round trip to the far region (tens to hundreds of milliseconds), so write latency and throughput suffer.
:::

:::recap
- Agree **availability, RTO and RPO** before drawing anything.
- One cluster per region, three zones each, built from code, deployed **region by region**.
- **Data** decides everything: single-writer plus fenced failover is simplest; multi-writer costs latency or conflicts.
- DNS failover is about **5 minutes** unless you use global load balancing and pre-warmed capacity.
- Test it: game days and restore drills.
:::

```quiz
? What is the main reason a single bad release can defeat multi-region availability?
+ Both regions receive the same change, so their failures are correlated, not independent
- Regions cannot run the same code
- DNS cannot route to two regions
- Kubernetes refuses to deploy twice
! Roll out region by region with a bake time so one bad release hits only one region.

? What sets RPO?
+ The data replication mode (synchronous, asynchronous, or periodic backup copy)
- The DNS TTL
- The number of pods
- The load balancer type
! RPO is how much data can be lost; replication lag or backup interval decides it.

? Why fence the old primary during a database failover?
+ To prevent split brain, where two nodes both accept writes
- To save money
- To speed up DNS
- To reduce logging
! Fencing makes sure the demoted primary cannot accept writes.
```
