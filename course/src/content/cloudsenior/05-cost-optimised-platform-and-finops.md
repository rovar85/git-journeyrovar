---
track: cloudsenior
title: Q5: Design a cost-optimised cloud platform for large-scale workloads (FinOps, rightsizing, reserved vs spot, tagging)
short: Q5 FinOps
sub: The FinOps operating model, then four working calculators: rightsizing from utilisation data, choosing a commitment level, deciding when spot instances pay off, and finding untagged spend and cost anomalies.
---

:::goals
- explain FinOps as an operating model (inform, optimise, operate), not a one-off saving exercise
- rightsize from utilisation percentiles instead of guesses
- choose a commitment level (reserved instances or savings plans) with a model that includes the risk of over-committing
- decide when spot or preemptible capacity pays off
- build the tagging, allocation and anomaly detection that keep costs accountable
:::

:::note Provenance
All prices, discounts and usage figures here are **illustrative inputs I chose**; the calculators are real code. Use them with **your** data. Pricing products (reserved instances and savings plans, spot, committed use discounts, reservations) are named from my knowledge of the major clouds; **discount sizes and terms change, so check the provider's current pricing**.
:::

## 1. What the interviewer is testing

Not "turn things off". They want to hear that cost is a **design dimension** with **owners, data and a feedback loop**, and that you can trade cost against reliability and speed consciously. Words to use: **FinOps, unit economics, rightsizing, commitments, spot, tagging, showback, anomaly detection, architecture-level savings**.

## 2. The FinOps operating model

The FinOps Foundation describes a cycle (from my knowledge of its framework): **Inform** (visibility and allocation), **Optimise** (reduce waste and improve rates), **Operate** (governance and continuous improvement). Practically:

| Phase | What you build |
|---|---|
| **Inform** | a **tagging and account structure** that attributes **every dollar to an owner** (Q3); **dashboards** per team; **showback** (teams see their cost) or **chargeback** (teams pay it); **unit costs** such as cost per tenant, per transaction or per gigabyte archived |
| **Optimise: usage** | **rightsize**, **schedule** non-production off at night, **delete** unattached disks and old snapshots, tier storage, cut data transfer |
| **Optimise: rate** | **commitments** (reserved capacity, savings plans) for the steady baseline, **spot** for interruptible work |
| **Operate** | budgets and **alerts**, **anomaly detection**, policy (no oversized instances in dev without approval), quarterly reviews, **cost as a design review item** |

And the order that matters: **cut usage first, then buy discounts for what remains**. Committing to capacity you later realise is oversized locks in the waste.

## 3. Rightsizing from data

Instances are usually chosen once, generously. Rightsize on **observed utilisation percentiles**, not averages and not the peak of one day. Simulate two weeks of hourly CPU data for a fleet and generate recommendations:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > rightsize.py <<'EOF'
import random
random.seed(31)
SIZES = {"large": (2, 0.10), "xlarge": (4, 0.20), "2xlarge": (8, 0.40), "4xlarge": (16, 0.80)}   # vCPUs, illustrative $/hour
def series(base, spike):                                        # two weeks of hourly CPU utilisation (% of the current size)
    return [min(100, max(1, random.gauss(base, base * 0.25) + (spike if random.random() < 0.02 else 0))) for _ in range(24 * 14)]

FLEET = {"ev-index-01": ("4xlarge", series(18, 40)), "ev-index-02": ("4xlarge", series(16, 35)),
         "ev-web-01": ("2xlarge", series(9, 30)), "sql-main": ("4xlarge", series(62, 25)), "build-agent": ("xlarge", series(55, 40))}

def p(v, q): s = sorted(v); return s[min(len(s) - 1, int(q * len(s)))]
total_now = total_new = 0
print(f"{'instance':13} {'now':8} {'p50':>5} {'p95':>5} {'p99':>5}  {'recommendation':16} {'saving/month':>12}")
for name, (size, cpu) in FLEET.items():
    vcpu, price = SIZES[size]
    need = p(cpu, 0.99) / 100 * vcpu                             # vCPUs needed to cover the 99th percentile
    target = next((s for s, (v, _) in SIZES.items() if v * 0.70 >= need), "4xlarge")   # keep 30% headroom above the p99; the largest size is the ceiling
    saving = (price - SIZES[target][1]) * 730
    total_now += price * 730; total_new += SIZES[target][1] * 730
    rec = "keep" if target == size else f"-> {target}"
    print(f"{name:13} {size:8} {p(cpu, .5):5.0f} {p(cpu, .95):5.0f} {p(cpu, .99):5.0f}  {rec:16} {saving:11,.0f}$")
print(f"\nfleet cost now ${total_now:,.0f}/month, after rightsizing ${total_new:,.0f}/month, saving {1 - total_new / total_now:.0%}")
print("Check memory, disk I/O and network too before changing: CPU alone can mislead. Roll changes out gradually and watch the SLOs.")
EOF
python3 rightsize.py
```

Read the output closely: `ev-index-01` can shrink, `ev-index-02` and `ev-web-01` have rare spikes that justify keeping their size (or autoscaling), and **`build-agent` is undersized** (its p99 is 88%), so its "saving" is negative. **Rightsizing goes both ways**: the goal is the right size, not the smallest one.

Rules that make rightsizing safe: use **percentiles over at least two weeks** (include month-end and batch cycles), consider **memory, I/O and network** (CPU alone misleads), keep **headroom**, change **in production only with SLO monitoring and a rollback**, and prefer **autoscaling** over a large fixed size for variable load. The provider's own advisor tools (from my knowledge: AWS Compute Optimizer, Azure Advisor, Google recommender) automate the data gathering; you still own the decision.

## 4. Commitments: how much to buy

**Reserved instances and savings plans** (and Azure reservations and Google committed use discounts) give a **large discount** (often 30% to 70% depending on term and flexibility) in exchange for **committing to a spend or capacity for one or three years**. Over-commit and you **pay for unused commitment**; under-commit and you leave savings on the table. Model it against a **usage curve**:

```run
cd ~/lab/cs
cat > commit.py <<'EOF'
import random
random.seed(8)
# hourly demand over a year, in "instances": steady base ~40, daily and weekly swings, growth, a few big peaks
demand = []
for h in range(24 * 365):
    day = h // 24
    base = 40 + 0.02 * day                                          # slow growth
    swing = 12 * (1 if 8 <= h % 24 <= 18 else 0) * (0.4 if (day % 7) >= 5 else 1)   # business hours, quieter weekends
    demand.append(max(5, random.gauss(base + swing, 3) + (25 if random.random() < 0.003 else 0)))

ON_DEMAND, DISCOUNT = 0.20, 0.40                                     # $/instance-hour, 40% off when committed

def yearly_cost(commit):
    c = commit * ON_DEMAND * (1 - DISCOUNT) * len(demand)              # you pay for the commitment every hour, used or not
    for d in demand:
        c += max(0, d - commit) * ON_DEMAND                            # demand above the commitment is on demand
    return c

all_od = sum(d * ON_DEMAND for d in demand)
print(f"all on demand: ${all_od:,.0f}/year   (average demand {sum(demand)/len(demand):.1f} instances)\n")
print(f"{'commit':>7} {'cost':>12} {'saving':>8} {'commitment unused':>19}")
best = None
for commit in range(0, 81, 10):
    cost = yearly_cost(commit)
    unused = sum(max(0, commit - d) for d in demand) / (commit * len(demand)) if commit else 0
    print(f"{commit:7d} ${cost:11,.0f} {1 - cost / all_od:8.1%} {unused:18.0%}")
    if best is None or cost < best[1]: best = (commit, cost)
print(f"\nbest of these levels: commit {best[0]} instances. Committing to the PEAK would pay for idle capacity most of the year.")
EOF
python3 commit.py
```

The shape of the curve is the lesson: savings rise as you commit to the **always-on baseline**, flatten, then **fall** when you commit beyond the level that is used most hours, because you pay for the unused part at a discounted but still positive price. Practical rules: commit to the **steady floor** (often 60% to 80% of the baseline), **ramp** commitments as confidence grows, **stagger terms**, prefer **flexible** commitments (spend-based, instance-family-flexible) when your architecture is changing, review **coverage and utilisation** monthly, and **never commit before rightsizing**.

## 5. Spot and preemptible capacity

Spot instances (also preemptible or low-priority) sell **spare capacity at deep discounts (commonly 60% to 90% off)**, but the provider can **reclaim them with short notice**. They suit **fault-tolerant, interruptible, checkpointable** work: batch jobs, CI runners, stateless web tiers behind a mix, big-data workers, rendering, ML training with checkpoints. Not for databases or anything that cannot lose a node. Quantify the benefit including **the cost of interruptions**:

```run
cd ~/lab/cs
cat > spot.py <<'EOF'
import random
random.seed(5)
JOB_HOURS, ON_DEMAND, SPOT = 20.0, 0.40, 0.12              # a 20-hour job, $/hour
GIVE_UP = 20 * JOB_HOURS                                   # stop a hopeless run after paying for 20x the job
def spot_run(interrupt_per_hour, checkpoint_every_h):
    done, hours_paid = 0.0, 0.0
    while done < JOB_HOURS:
        if hours_paid > GIVE_UP: return None, hours_paid                  # never finishes in practice
        step = 0.1
        hours_paid += step
        if random.random() < interrupt_per_hour * step:
            done = (done // checkpoint_every_h) * checkpoint_every_h        # lose progress since the last checkpoint
            hours_paid += 0.1                                               # restart delay while a replacement starts
        else:
            done += step
    return hours_paid * SPOT, hours_paid

print(f"on demand: ${JOB_HOURS * ON_DEMAND:,.2f}")
print(f"{'interrupts/hour':>16} {'checkpoint':>11} {'spot cost':>10} {'hours billed':>13} {'saving':>7}")
for rate in (0.05, 0.2, 0.5):
    for cp in (0.25, 5.0, 100.0):
        cost, hours = spot_run(rate, cp)
        label = ('every ' + str(cp) + ' h') if cp < 100 else 'never'
        if cost is None: print(f"{rate:16.2f} {label:>11} {'gave up':>10} {hours:13.1f}  (restarts from scratch forever)")
        else:            print(f"{rate:16.2f} {label:>11} ${cost:9,.2f} {hours:13.1f} {1 - cost / (JOB_HOURS * ON_DEMAND):7.0%}")
print("\nWithout checkpoints, a high interruption rate makes the job restart from scratch repeatedly: the discount is eaten by lost work.")
EOF
python3 spot.py
```

Design rules for spot: **checkpoint** or make tasks small and **idempotent**; **diversify** instance types and zones so one pool's reclaim does not stop everything; keep a **base of on-demand or committed** capacity under the spot layer; handle the **interruption notice** (drain, checkpoint); use **mixed-instance autoscaling groups** or managed spot node pools for Kubernetes.

## 6. Tagging, allocation and anomalies

You cannot optimise what you cannot attribute. A **tagging standard** (Q3 enforced it at account creation) carries at least: **owner, cost centre, environment, application, and a data classification or criticality**. **Enforce it with policy** (deny creation without tags) and **report the untagged percentage** as a KPI. Then detect surprises:

```run
cd ~/lab/cs
cat > anomaly.py <<'EOF'
import random, statistics
random.seed(12)
# 30 days of cost lines: (day, resource, cost, owner tag or None)
lines = []
for day in range(30):
    for res, base, owner in (("ev-prod-vms", 900, "ev-team"), ("archive-storage", 500, "ev-team"), ("sql", 700, "dba"), ("shared-net", 300, "platform"), ("mystery-1", 150, None)):
        lines.append((day, res, base * random.uniform(0.95, 1.05), owner))
    lines.append((day, "gpu-experiment", 1800 if day >= 24 else 80, "ml-team"))       # something starts burning money on day 24

total = sum(l[2] for l in lines)
untagged = sum(l[2] for l in lines if l[3] is None)
print(f"total ${total:,.0f}; untagged (cannot be charged to anyone): ${untagged:,.0f} = {untagged / total:.1%}  (target: under 5%)")

daily = {}
for day, _, cost, _ in lines: daily[day] = daily.get(day, 0) + cost
mean, sd = statistics.mean(list(daily.values())[:20]), statistics.pstdev(list(daily.values())[:20])      # baseline from the first 20 days
print("\nAnomaly detection (daily total vs the baseline of the first 20 days):")
for day in range(20, 30):
    z = (daily[day] - mean) / sd
    flag = "  <-- ALERT" if z > 3 else ""
    if flag or day in (20, 29): print(f"  day {day}: ${daily[day]:,.0f}  z-score {z:5.1f}{flag}")
print("\nAlerts should go to the owner of the resource that moved (find it by comparing resource costs, then check the tag).")
EOF
python3 anomaly.py
```

Real services do this better (**per-service and per-tag anomaly detection**, budgets with forecast alerts), but the principle is the same: a **baseline**, a **threshold**, and an **owner to notify**.

## 7. Architecture-level savings

The big numbers are often **design choices**, not discounts:

- **Storage lifecycle**: move cold data to cheaper tiers automatically (for an archive like Enterprise Vault the bulk of the bytes are cold: tiering and compression matter more than VM size).
- **Data transfer**: cross-region and internet egress costs add up; keep chatty services in the same zone, use private connectivity and CDNs deliberately.
- **Right architecture for the load**: serverless for spiky, scheduled start and stop for non-production, autoscaling for variable tiers (Q2).
- **Managed services versus self-run**: include **people cost**.
- **Do not store what you do not need**: retention policies, deleting snapshots, compression.
- **Efficiency in code**: a service that uses half the CPU for the same work halves its compute bill.

And **unit economics** tells you whether cost is healthy: not "the bill rose 20%" but "cost per 1,000 archived items fell 8% while volume grew 40%".

## 8. How to answer

1. **Frame**: cost is a continuous practice (FinOps: inform, optimise, operate) with **accountable owners**, not a one-off purge.
2. **Foundations first**: account structure and **mandatory tags** enforced by policy; dashboards, budgets, showback.
3. **Usage before rates**: rightsize, schedule, delete waste, tier storage; **then** commitments for the baseline and **spot** for interruptible work.
4. **Give a number-based example**: "rightsizing from p99 utilisation cut a fleet by about a third; then we committed to the 70% steady floor."
5. **Keep reliability explicit**: "I never trade an SLO for savings silently; spot sits on top of a committed base."
6. **Close with governance**: anomaly alerts, monthly reviews, cost in design reviews, unit-cost KPIs.

## 9. Follow-up questions to expect

- "How do you get **engineers to care** about cost?" (give them visibility, unit costs and ownership; make the cost of a design visible in the pull request; celebrate savings)
- "**Reserved or savings plan**?" (flexible spend-based commitments when architecture changes often; capacity reservations when you need guaranteed capacity)
- "How do you handle **shared costs** (network, platform, logging)?" (allocate by usage metrics or proportional drivers; be transparent about the method)
- "What if the **commitment is wrong** after a migration?" (sell or exchange where the provider allows; ramp commitments in stages)
- "How do you cost-optimise **Kubernetes**?" (requests and limits rightsizing, bin packing, autoscaling nodes, spot node pools, namespace cost allocation)

:::warn Common mistakes
- **Buying commitments before rightsizing.**
- **Committing to peak usage**, then paying for idle capacity.
- **Optimising on averages** or on a single week.
- **Using spot for state or without checkpoints.**
- **No tag enforcement**, so a fifth of spend belongs to nobody.
- **Savings that damage reliability** (undersizing until the SLO breaks) or that cost more people time than they save.
:::

:::recap
- FinOps = **inform, optimise, operate**, with owners; **usage first, rates second**.
- **Rightsize on p95 and p99 over weeks**, with headroom and more than CPU.
- **Commit to the steady floor**; the savings curve falls when you over-commit.
- **Spot** saves most with **checkpointed, interruptible work** and a committed base underneath.
- **Tags, budgets, anomaly detection and unit costs** keep the platform accountable.
:::

:::try Your turn
In `commit.py` change `DISCOUNT` to 0.25 (a more flexible, smaller discount) and find the new best commitment level: why does it change? In `rightsize.py` change the headroom factor from 0.70 to 0.50 and see how the recommendations and the saving react.
:::

:::quiz
? Why rightsize before buying commitments?
+ Committing to oversized capacity locks in the waste for one to three years
- Commitments are cheaper after rightsizing
- Providers require it
- Rightsizing is optional
! Reduce usage first, then discount what remains.
? For which workload is spot capacity most suitable?
+ A checkpointed, fault-tolerant batch job
- A primary database
- A single stateful licence server
- A system with no retries
! Spot can be reclaimed with short notice.
? What does a high percentage of untagged spend mean?
+ Cost cannot be attributed to an owner, so nobody is accountable for reducing it
- The provider overcharged you
- Tags are optional metadata with no value
- The accounts are well organised
! Enforce tags by policy and report the percentage as a KPI.
:::
