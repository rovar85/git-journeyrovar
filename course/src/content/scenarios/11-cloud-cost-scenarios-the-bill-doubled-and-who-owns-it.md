---
track: scenarios
title: "S11: Cloud cost scenarios: the bill jumped, nobody owns it, and commitments"
short: S11 Cloud cost
sub: Find where the money goes, the day a spike started, untagged cost, rightsizing and commitment break-even, with a bill-analysis script on invented data.
---

:::goals
- break a bill down by service, team and day to find a cost spike
- explain hidden cost drivers: NAT data processing, cross-zone and egress traffic, logs, idle resources
- decide between on-demand, committed use and spot using utilisation
- explain tagging, budgets, anomaly alerts and the people side of FinOps
:::

:::note How to use this lesson
The prices in the script are **invented for illustration**, not any provider's price list. The method is what matters. The architecture-level answer (landing zones, FinOps practice, savings plans) is in [Senior cloud 5](#cloudsenior-5); data movement costs and the network side of this are in [Cloud networking](#cloud-2) and [Network security scenarios](#scenarios-10).
:::

## The question

> "Our cloud bill went up 40% this month and nobody knows why. How do you investigate, and how do you stop it happening again?"

**What the interviewer tests:** a method (not guesses), knowledge of where hidden costs hide, and whether you treat cost as an engineering and ownership problem, not only a finance report.

## A method

1. **Group the bill** by service, account, region, tag (team, environment, application) and day. Look at the **change**, not the total.
2. **Find the day** the trend bent, then ask "what changed that day?" (a deploy, a new feature, a migration, a test left running).
3. **Drill into the line item** (usage type, such as data processing or requests), not just the service.
4. **Check ownership**: if cost has no tag, no one can act on it.
5. **Fix the cause**, then add **budgets, anomaly alerts and guardrails** so you hear about the next spike in days, not at month end.

## The analysis, on invented data

```text
Month of 30 days. A deploy on day 18 started routing image downloads through a NAT gateway.
Logs were raised from "warn" to "debug" on day 11. A third of the cost has no tag.
```

```run
mkdir -p ~/lab/cost && cd ~/lab/cost
cat > bill.py <<'EOF'
import random
random.seed(9)
# Illustrative daily bill lines (invented prices, not a real price list): (day, service, team tag, dollars)
lines = []
for day in range(1, 31):
    lines += [(day, "compute", "shop", 310 + random.uniform(-10, 10)), (day, "compute", "search", 180 + random.uniform(-8, 8)),
              (day, "storage", "shop", 60 + day * 0.2), (day, "database", "shop", 140), (day, "database", "search", 90),
              (day, "nat-data-processing", "untagged", 20 + random.uniform(-2, 2) if day < 18 else 95 + random.uniform(-5, 5)),   # a deploy on day 18 started pulling images through NAT
              (day, "logs", "untagged", 35 + (day > 10) * 25), (day, "support", "untagged", 12)]
total = sum(l[3] for l in lines)
print(f"month total ${total:,.0f}\n")
print("1) Where does the money go?")
by = {}
for d, s, t, c in lines: by[s] = by.get(s, 0) + c
for s, c in sorted(by.items(), key=lambda x: -x[1]): print(f"   {s:22} ${c:8,.0f}  {c / total:5.1%}")
print("\n2) Which service changed the most between the first and the last week?")
def week(a, b, s): return sum(c for d, sv, t, c in lines if a <= d <= b and sv == s)
for s in by:
    w1, w4 = week(1, 7, s), week(24, 30, s)
    if w1 and abs(w4 - w1) / w1 > 0.25: print(f"   {s:22} week 1 ${w1:7,.0f} -> last week ${w4:7,.0f}  ({(w4 - w1) / w1:+.0%})")
print("\n3) Find the day the spike started (largest day-over-day jump of NAT data processing)")
daily = {d: c for d, s, t, c in lines if s == "nat-data-processing"}
d_max = max(range(2, 31), key=lambda d: daily[d] - daily[d - 1])
print(f"   day {d_max}: ${daily[d_max - 1]:.0f} -> ${daily[d_max]:.0f}  (look at what was deployed or changed that day)")
print("\n4) Allocation: how much cost has no owner?")
un = sum(c for d, s, t, c in lines if t == "untagged")
print(f"   untagged ${un:,.0f} = {un / total:.0%} of the bill. Nobody can be asked to fix what nobody owns: enforce tags at creation.")
print("\n5) What a fix is worth: a gateway endpoint for object storage and image registry traffic instead of NAT")
extra = sum(c for d, s, t, c in lines if s == "nat-data-processing" and d >= 18) - 13 * 20
print(f"   the post-deploy increase cost about ${extra:,.0f} this month; at that rate about ${extra / 13 * 30:,.0f} per month")
print("\n6) Rightsizing candidates (instances whose 14-day peak CPU stays low)")
fleet = [("web-1", 4, 38), ("web-2", 4, 41), ("batch-1", 16, 9), ("batch-2", 16, 11), ("report-1", 8, 4), ("cache-1", 8, 62)]
for name, vcpu, peak in fleet:
    if peak < 20: print(f"   {name:9} {vcpu:2d} vCPU, peak CPU {peak:2d}% -> try {max(2, vcpu // 2)} vCPU (about half the compute cost for that instance)")
print("\n7) Commitment: when does a 1-year commitment beat on-demand?")
on_demand, committed_rate = 1.00, 0.65                                           # $/hour, committed price per hour for the whole year
for util in (0.5, 0.65, 0.8, 1.0):
    print(f"   instance used {util:4.0%} of hours: on-demand ${on_demand * util:.2f}/h-equivalent vs committed ${committed_rate:.2f} -> {'commit wins' if committed_rate < on_demand * util else 'stay on-demand'}")
EOF
python3 bill.py
```


How to read the seven sections:

1. **Where the money goes:** compute and database dominate (normal), but **NAT data processing** and **logs** are surprisingly large for what they do.
2. **What changed:** NAT data processing grew **+377%** and logs **+71%** between week 1 and the last week. Everything else is flat. The big line items are not the problem; the **growing** ones are.
3. **The day:** NAT cost jumped on **day 18** ($18 to $91 per day). The deploy log for that day holds the cause (here, a change that pulled container images and storage data through the NAT gateway).
4. **Ownership:** 13% of the bill is untagged. Enforce tags at creation with policy, and report cost per team.
5. **What a fix is worth:** a **gateway or interface endpoint** for storage and registry traffic keeps it off the NAT, saving roughly the post-deploy increase (about $2,200 a month at this rate).
6. **Rightsizing:** instances with a peak CPU under 20% for two weeks are candidates for a smaller size; check memory and burst needs too before changing.
7. **Commitments:** a one-year commitment priced at 65% of on-demand only wins if the instance runs more than 65% of the hours. Commit for the **steady base**, keep on-demand for the variable part.

## The usual hidden cost drivers

- **Data transfer:** internet egress, **cross-zone** and cross-region traffic, and NAT gateway **per-GB data processing** (often larger than the hourly fee).
- **Logs and metrics:** debug logging, high-cardinality metrics ([Scenarios 12](#scenarios-12)), long retention. Sample, shorten retention, and move old data to cheap storage.
- **Idle and forgotten resources:** unattached volumes, old snapshots, idle load balancers, stopped instances with disks, dev environments running at night, test clusters.
- **Over-provisioning:** oversized instances and databases, "just in case" replicas.
- **Wrong storage class or pricing model:** hot storage for cold data, on-demand for steady workloads, no lifecycle rules.
- **Orphaned or runaway automation:** an autoscaler with no maximum, a retry loop that calls a paid API ([Systems 6](#systems-6)), a failed job restarting forever.

## The levers, in order of effort

1. **Delete** what is not used (cheapest, fastest).
2. **Schedule** non-production off outside working hours.
3. **Rightsize** and pick newer, cheaper instance families.
4. **Commit** the steady baseline (savings plans, reserved capacity, committed use discounts); use **spot or preemptible** capacity for interruptible work such as batch jobs and CI, with retries and checkpoints.
5. **Architect** for cost: endpoints instead of NAT, caching and CDN to cut egress, compression, lifecycle policies, serverless for spiky low-volume work.

## Guardrails and the people side

- **Tagging policy** (team, environment, application) enforced at creation; untagged resources reported and eventually removed.
- **Budgets and anomaly alerts** per account and team, with a named owner for each.
- **Showback or chargeback:** teams see their own bill. Cost visible to the people who can change it goes down.
- **Cost in design reviews** ([Systems 11](#systems-11)): a rough monthly estimate in every design doc.
- **Unit economics:** cost per request, per customer or per build. A bill that grows with revenue is healthy; one that grows without it is not.

## The answer an interviewer expects

"I would first look at the bill grouped by service and tag and compare it to last month to see what changed, then find the day it changed and correlate it with deployments. In a typical case a growing line item such as NAT data processing, logs or cross-zone traffic explains most of the jump. I would confirm with usage-type detail, fix the cause (a VPC endpoint, lower log level or retention, a schedule or a smaller size), and then add budgets, anomaly detection and tagging enforcement so the next spike is caught within days. Long-term I would commit to the steady base load and use spot for interruptible work, and give each team visibility of its own costs."

## Follow-up questions to expect

- How do you decide between a savings plan and reserved instances? (Flexibility versus discount; commit to what you are sure to use.)
- When is spot a bad idea? (Stateful or latency-critical work without handling interruption.)
- Why can autoscaling raise costs? (No maximum, scaling on a noisy or attacked signal.)
- How would you reduce data-transfer cost across zones? (Zone-aware routing, keep chatty services in the same zone where resilience allows, caching.)

## Practice (answers below)

1. In the model, change the commitment price to 0.80 of on-demand. At what utilisation does commitment start to win?
2. A team says "the bill is the platform team's problem". What do you do?
3. Add a check to the script that lists untagged cost by service.

:::recap
- Method: **group, compare, find the day, drill into the usage type, check ownership, fix, add guardrails**.
- Hidden drivers: **data transfer and NAT, logs and metrics, idle resources, over-provisioning, wrong pricing model**.
- Levers: **delete, schedule, rightsize, commit the base, spot for interruptible work, architect for cost**.
- Make cost visible to owners; measure **unit economics**.
:::

:::note Answers
1. At anything above 80% utilisation (commitment 0.80 is cheaper only when used more than 80% of the hours). 2. Show the cost per team and tag, agree budgets with owners, and give them the dashboards and the authority to change; cost does not fall without ownership. 3. Sum the cost of lines whose tag is `untagged` grouped by service and print the largest first.
:::

```quiz
? Your bill jumped. What is the first analysis step?
+ Group costs by service, tag and day and compare with the previous period to see what changed
- Buy a savings plan immediately
- Delete the largest resources
- Ask finance for next month's number
! Find what grew and when, then connect it to a change.

? A one-year commitment costs 65% of on-demand. When does it pay off?
+ When the instance runs more than 65% of the hours
- Always
- Never
- Only for databases
! Break-even is utilisation equal to the committed price ratio.

? Why is untagged cost a problem?
+ No one owns it, so no one can be asked to reduce it
- It is more expensive
- It cannot be billed
- It is illegal
! Cost reduction needs an owner who can change the resource.
```
