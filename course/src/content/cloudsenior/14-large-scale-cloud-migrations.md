---
track: cloudsenior
title: "Q14: How do you plan and execute a large-scale migration to the cloud?"
short: Q14 Large-scale migrations
sub: Assessment, the six strategies, dependency-aware wave planning (a real planner you run), cutover, validation and rollback, and how to talk about it honestly.
---

:::goals
- run a migration as **assess, mobilise, migrate, optimise**, not as a single "lift everything" project
- choose a **strategy per workload** (the six Rs) with evidence
- compute **migration waves from dependencies** with a real planner, and detect circular dependencies
- plan **cutover, validation and rollback** for each wave, including data
- explain risks, communication and success measures
:::

:::note Provenance
The planner and checks are Python that **runs here on invented data** (a made-up estate called "Northwind"). The lab has **no cloud account**, so no workload is actually moved. Tools such as provider migration services and replication agents are mentioned from general knowledge and are an **Example, not run here**. Use your own real migration for the interview story; this lesson gives the **structure** and the **mechanics**.
:::

## 1. The shape of a large migration

| Phase | Question it answers | Output |
|---|---|---|
| **1. Assess and discover** | What do we have, what talks to what, what does it cost, who owns it? | inventory, dependency map, owners, utilisation, licences, compliance needs |
| **2. Decide the strategy** | What happens to each workload? | a **disposition** per application (the six Rs) with reasons |
| **3. Mobilise** | Is the destination ready? | landing zone (Q3), network (Q6), security baseline (Q4), pipelines (Q10), skills, runbooks |
| **4. Plan the waves** | In what order, with what dependencies? | wave plan: pilot, then increasing risk and size |
| **5. Migrate** | Execute each wave | replication, test, cutover, validate, hand over |
| **6. Optimise and decommission** | Did we get the benefit, and did we **turn off the old thing**? | rightsizing (Q5), modernisation, **datacentre exit** |

The senior point: **the landing zone comes before the first workload**, and **the order of waves is driven by dependencies and risk**, not by who shouts loudest.

## 2. The six strategies (the "Rs")

| Strategy | Meaning | Use when | Watch for |
|---|---|---|---|
| **Retire** | switch it off | nobody uses it (often 10 to 20% of an estate) | confirm with usage evidence, keep a backup |
| **Retain** | leave it where it is, for now | regulation, latency to a device, very recent investment | revisit later; hybrid connectivity |
| **Rehost** (lift and shift) | move VMs as they are | speed, datacentre deadline, low change appetite | you carry the old inefficiency; optimise after |
| **Replatform** | small changes for managed services (managed database, managed containers) | easy wins, less operations | testing effort; compatibility |
| **Repurchase** | replace with SaaS | commodity function (email, CRM) | data migration, integration, change for users |
| **Refactor** (re-architect) | redesign as cloud-native | the app is strategic and the benefit justifies it | expensive and slow; do it **where value is** |

A common honest pattern: **rehost most, replatform where cheap, refactor few, retire many**.

## 3. A worked estate and the planner

Northwind has 14 applications with owners, a **disposition**, a size in servers, a **risk score** (1 to 5), and the applications each one **depends on**. The planner:

1. drops **retired** and **retained** items from the move list
2. builds the **dependency graph** among the moved applications
3. detects **cycles** (which must be **broken or moved together**)
4. assigns **waves** so every application moves **no earlier than its dependencies**, **lower risk first**, within a **capacity** per wave, and keeps the **pilot wave to risk 3 or lower**

```run
mkdir -p ~/mig && cd ~/mig
cat > estate.py <<'PY'
# name: (owner, disposition, servers, risk 1-5, depends_on)
ESTATE = {
  "intranet-wiki":    ("hr-it",    "rehost",     2, 1, []),
  "print-service":    ("it-ops",   "retire",     2, 1, []),
  "time-sheets":      ("hr-it",    "repurchase", 3, 2, ["hr-db"]),
  "hr-db":            ("hr-it",    "replatform", 2, 3, []),
  "auth-gateway":     ("security", "rehost",     4, 4, ["directory"]),
  "directory":        ("security", "retain",     2, 5, []),
  "reporting":        ("finance",  "replatform", 3, 2, ["data-warehouse"]),
  "data-warehouse":   ("finance",  "replatform", 6, 4, ["erp-db"]),
  "erp-db":           ("finance",  "rehost",     4, 5, []),
  "erp-app":          ("finance",  "rehost",     8, 4, ["erp-db", "auth-gateway"]),
  "web-shop":         ("digital",  "refactor",   10, 4, ["catalog", "payments", "auth-gateway"]),
  "catalog":          ("digital",  "replatform", 3, 3, ["catalog-db"]),
  "catalog-db":       ("digital",  "replatform", 2, 3, []),
  "payments":         ("digital",  "rehost",     5, 5, ["fraud", "catalog-db"]),
  "fraud":            ("digital",  "rehost",     3, 4, ["payments"]),
}
PY
cat > plan.py <<'PY'
from estate import ESTATE
import sys

CAPACITY = int(sys.argv[1]) if len(sys.argv) > 1 else 12     # servers movable per wave

move = {n: v for n, v in ESTATE.items() if v[1] not in ("retire", "retain")}
skipped = {n: v[1] for n, v in ESTATE.items() if v[1] in ("retire", "retain")}
print("not moved:", ", ".join(f"{n} ({d})" for n, d in skipped.items()))

# dependencies on retained systems need connectivity, not movement
hybrid = sorted({(n, d) for n, v in move.items() for d in v[4] if d in skipped and skipped[d] == "retain"})
for n, d in hybrid:
    print(f"  note: {n} depends on {d}, which stays on premises -> needs hybrid connectivity and latency testing")

deps = {n: {d for d in v[4] if d in move} for n, v in move.items()}

# cycle detection: strongly connected groups (simple fixed-point on reachability)
def reach(n, seen=None):
    seen = seen or set()
    for d in deps[n]:
        if d not in seen:
            seen.add(d); reach(d, seen)
    return seen
groups, done = [], set()
for n in sorted(deps):
    if n in done: continue
    g = {n} | {m for m in deps if m in reach(n) and n in reach(m)}
    groups.append(sorted(g)); done |= g
cyc = [g for g in groups if len(g) > 1]
for g in cyc:
    print(f"  CYCLE: {', '.join(g)} -> migrate together as one unit")

# collapse groups into units
unit_of = {n: i for i, g in enumerate(groups) for n in g}
units = {i: {"members": g,
             "servers": sum(move[m][2] for m in g),
             "risk": max(move[m][3] for m in g),
             "deps": {unit_of[d] for m in g for d in deps[m]} - {i}} for i, g in enumerate(groups)}

waves, placed = [], set()
while len(placed) < len(units):
    ready = [i for i, u in units.items() if i not in placed and u["deps"] <= placed]
    if not ready:
        sys.exit("no progress: unresolved dependencies")
    ready.sort(key=lambda i: (units[i]["risk"], units[i]["servers"]))     # low risk first
    if not waves and not any(units[i]["risk"] <= 3 for i in ready):
        sys.exit("no low-risk pilot candidate")
    wave, used = [], 0
    for i in ready:
        s = units[i]["servers"]
        if not waves and units[i]["risk"] > 3:      # the pilot wave takes only low-risk units
            continue
        if used + s <= CAPACITY or not wave:        # a single oversize unit gets its own wave
            wave.append(i); used += s
    waves.append((wave, used)); placed |= set(wave)

print()
for k, (wave, used) in enumerate(waves, 1):
    names = " + ".join("/".join(units[i]["members"]) for i in wave)
    risk = max(units[i]["risk"] for i in wave)
    label = "pilot" if k == 1 else ""
    print(f"wave {k}: {used:2} servers, max risk {risk}  {label:5} {names}")
print(f"\n{len(units)} units in {len(waves)} waves, {sum(u['servers'] for u in units.values())} servers to move")
PY
python3 plan.py
```

**What you see:** a **pilot wave** of low-risk, low-dependency applications (the wiki and two small databases), then waves that respect dependencies (`erp-db` before `erp-app`, `catalog-db` before `catalog`). The **circular dependency** between `payments` and `fraud` is **detected** and they are **moved together as one unit**, and the note about **`directory`** (retained on premises) reminds you that **hybrid connectivity** is a **hard dependency** for `auth-gateway`.

Change the capacity and see the plan reshape (smaller waves means more of them):

```run
cd ~/mig
python3 plan.py 8 | tail -9
```

:::warn The inventory is never complete
Real estates always contain **undocumented dependencies** (a batch job calling a database at 02:00, a hard-coded IP address). Discovery **tools** (agent-based and network-flow-based) find many, but **only a few weeks of observation** shows month-end jobs. Add **time**, **flow data** and **owner interviews** to any inventory before you trust the graph.
:::

## 4. Moving one wave: cutover, validation, rollback

Each wave follows the **same runbook**, which is what makes a large programme **repeatable**:

1. **Pre-checks**: owner sign-off, backups verified (Q7), change window agreed, monitoring and alerts **ready in the destination**.
2. **Replicate**: continuous **replication** of servers and **database sync** (the source keeps running).
3. **Test cutover** in an isolated network: boot the replicas, **run the test suite**, measure performance, **fix issues without any user impact**.
4. **Freeze** the source (read-only or stop writes), do a **final sync**.
5. **Cutover**: bring up the destination, **change DNS or routing** (use a **low TTL** set days earlier).
6. **Validate**: smoke tests, **data checks** (row counts, checksums), business acceptance by the **owner**.
7. **Decide**: **go** (keep the destination, source stays **warm** for an agreed period) or **no-go** (**rollback**: point traffic back to the source, which was never destroyed).
8. **Hypercare** for days, then **decommission** the source (after a final backup).

The data check is the part people skip. A small, real example of a **checksum validation** for a copied dataset:

```run
cd ~/mig
mkdir -p src dst
for i in $(seq 1 40); do echo "row $i,$((i*37 % 101))" > src/part-$i.csv; done
cp -r src/. dst/
# simulate a silent copy problem on one file and a missing file
echo "row 7,CORRUPT" > dst/part-7.csv
rm dst/part-23.csv
cat > validate.py <<'PY'
import hashlib, os, sys
def digest(path):
    return {f: hashlib.sha256(open(os.path.join(path, f), "rb").read()).hexdigest() for f in os.listdir(path)}
a, b = digest(sys.argv[1]), digest(sys.argv[2])
missing = sorted(set(a) - set(b)); extra = sorted(set(b) - set(a))
bad = sorted(f for f in set(a) & set(b) if a[f] != b[f])
print(f"source files: {len(a)}  destination files: {len(b)}")
print("missing at destination:", missing or "none")
print("unexpected at destination:", extra or "none")
print("content mismatch:", bad or "none")
ok = not (missing or extra or bad)
print("RESULT:", "GO" if ok else "NO-GO (do not cut over)")
sys.exit(0 if ok else 1)
PY
python3 validate.py src dst; echo "exit code: $?"
```

**What you see:** the validation **catches both a missing and a corrupted file** and returns **NO-GO**. The same pattern applies to databases (row counts, checksums on key ranges) with the cloud provider's own data-migration and validation tooling. **Never decide go or no-go by feel.**

## 5. Risks and how to manage them

| Risk | Mitigation |
|---|---|
| **Undiscovered dependency** | flow data over weeks, test cutovers, owners sign off, **rollback plan** |
| **Data loss or drift** | continuous replication, **checksums**, final sync after a freeze, source kept warm |
| **Performance surprise** | baseline **before**, load test **after**, right-size after a few weeks (Q5) |
| **Security gaps** | landing zone and policies **first** (Q3, Q4), no "temporary" public access |
| **Licensing** | check **per-core and per-socket licences** and **bring-your-own-licence** terms early |
| **Cost shock** | forecast per wave, budgets and alerts, **turn off the source** to stop paying twice |
| **Skills and ownership** | training, **a cloud centre of excellence**, clear run ownership before the wave lands |
| **Big-bang pressure** | **waves**, pilot first, **stop-the-line** criteria |
| **Compliance and residency** | classify data (Q4), choose regions deliberately, evidence for auditors |

## 6. Measuring success

- **Plan versus actual** per wave (servers moved, incidents, rollbacks)
- **Cutover outcome** (downtime versus agreed, defects found after go-live)
- **Cost** (run cost versus the business case, and **double-running cost** until decommission)
- **Reliability and performance** against SLOs (Q12)
- **Decommission progress** (the benefit is only real when the old estate is **gone**)

## 7. How to answer

1. **Frame**: "Assess, mobilise, migrate in waves, optimise. The destination is ready first."
2. **Strategy**: "I choose a disposition per workload, usually retire some, rehost most, replatform where cheap, refactor only where value is high."
3. **Order**: "Waves are driven by dependencies and risk, with a pilot first. I detect circular dependencies and move them together."
4. **Execution**: "Every wave uses the same runbook: replicate, test cutover, freeze, cutover, validate with checks, go or rollback, hypercare, decommission."
5. **Control**: risks, communication to owners, cost tracking, and success measures.
6. **Your story**: pick a real migration. Give **scale, constraints, one thing that went wrong and what you changed**. Do not invent numbers.

:::warn Common mistakes
- **Lift and shift everything and call it done**: you now run the same inefficiency, at cloud prices, plus the old estate. Plan the **optimise** phase and the **exit**.
- **Skipping discovery** or trusting a stale CMDB.
- **Migrating a database separately from the application that needs low latency** to it (the "split brain of latency").
- **No tested rollback**: "we will restore from backup" is not a plan at 03:00.
- **Cutting over with a long DNS TTL**: lower it **days** before.
- **Forgetting the data** (the hardest part) and **the people** (owners, support, users).
- **Declaring victory before decommissioning**: you are paying twice until the source is gone.
:::

## 8. Follow-up questions to expect

- **"How do you migrate a database with minimal downtime?"** Continuous **replication** (change data capture), keep it in sync, **freeze writes briefly**, **verify** with checksums and counts, switch the application's connection, keep the source for rollback. For heterogeneous engines add **schema conversion** and extended testing.
- **"What if the business cannot accept any downtime?"** **Blue/green** at the application layer with **bidirectional or one-way replication**, a gradual **traffic shift** (Q10), and a **rollback** that keeps the old side current for a while.
- **"How do you decide rehost versus refactor?"** Business value and **change velocity** needed; a stable low-change app is a rehost, a strategic app with scaling pain is a refactor. **Do not refactor during the move** unless it is the point.
- **"How do you handle a deadline you cannot meet?"** Re-cut scope: move **lift-and-shift first** to meet the exit, defer modernisation, say **plainly** what risk that creates.
- **"How do you keep costs under control?"** Per-wave forecast, tagging from day one (Q5), **budgets**, rightsizing after steady state, and **decommissioning** the source.

:::try
1. Add a **new application** to `estate.py` with a dependency on `payments`. Check where the planner places it.
2. Create a **second cycle** (`catalog` and `catalog-db` depending on each other) and read the output.
3. Change a **retired** application to **rehost** and compare the plan.
4. Extend the planner to print the **double-running cost** per wave, assuming a made-up cost per server per month and a hypercare of one month.
5. Make `validate.py` compare **file sizes** only and test it against the corrupted file. What does it miss, and why is a **checksum** better evidence?
:::

:::recap
- A migration is **assess, mobilise, migrate in waves, optimise and decommission**; the landing zone comes first.
- Choose a **strategy per workload**: retire, retain, rehost, replatform, repurchase, refactor.
- **Waves follow dependencies and risk**; circular dependencies move together; retained systems need hybrid connectivity.
- Each wave uses one **runbook**: replicate, test cutover, freeze, cutover, **validate with evidence**, go or **rollback**.
- Manage **data, dependencies, cost and people**, and measure the **decommission**, not just the move.
:::

:::quiz
? What should drive the order of migration waves?
- The loudest stakeholder
+ Dependencies and risk, starting with a low-risk pilot
- Alphabetical order
! Move dependencies before dependents, and learn on something safe.

? Two applications depend on each other. What do you do?
- Move one and hope
+ Migrate them together as one unit (or break the cycle first)
- Retire both
! A cycle cannot be ordered, so treat it as a single move.

? What makes rollback possible after cutover?
- A fresh backup only
+ Keeping the source intact and warm, with a tested way to point traffic back
- A longer DNS TTL
! Rollback is a traffic switch, not a restore.

? Which strategy fits an unused application?
- Rehost
+ Retire
- Refactor
! Confirm with usage evidence, keep a backup, switch off.

? Why validate with checksums and counts?
- It is faster than testing
+ It gives evidence of complete, uncorrupted data rather than a feeling
- It replaces user acceptance
! Go or no-go is a decision made on data.
:::
