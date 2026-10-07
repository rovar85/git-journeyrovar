---
track: cloudsenior
title: Q2: How do you choose between IaaS, PaaS and serverless? Give a real example
short: Q2 IaaS, PaaS, serverless
sub: A repeatable decision method with a weighted scoring tool, a cost break-even calculation, and a worked example that assigns each part of an archiving platform to the right model.
---

:::goals
- state what each model gives you and what it makes you responsible for
- apply a decision method with explicit criteria and weights, not preference
- calculate the cost break-even between always-on compute and pay-per-use compute
- give a concrete example that splits one system across all three models
:::

:::note Provenance
The decision tool and the cost model are **real code with illustrative prices** (mine, not any provider's current price list). The Enterprise Vault example is a **design discussion**, not a statement of what the vendor supports: always check the product's own support matrix before moving a component to a managed service.
:::

## 1. What is being asked

The interviewer wants to hear a **method** and a **trade-off vocabulary**, plus one **concrete case** in which you chose differently for different parts of the same system. "I use serverless for everything" and "I always use VMs" are both weak answers.

## 2. The three models

| | IaaS (virtual machines) | PaaS (managed platform) | Serverless (functions and managed pay-per-use services) |
|---|---|---|---|
| You manage | OS, patching, runtime, scaling, application | application and configuration | **only the code** (and its configuration and permissions) |
| Provider manages | hardware, virtualisation | OS, runtime, often scaling and patching | everything below the function, including scaling to zero |
| Control | highest | medium | lowest |
| Scaling | you design it (scale sets, autoscaling groups) | platform scales within limits | automatic, per request, to zero |
| Cost shape | pay for **capacity** whether used or not | pay for plan size or usage | pay **per request and duration**, nothing when idle |
| Startup latency | minutes (new VM) | seconds to minutes | **cold starts**: milliseconds to seconds |
| Typical limits | few | plan limits | **execution time, memory, payload size, concurrency** |
| Lock-in | low (a VM is a VM) | medium | highest (event formats, runtimes, service integrations) |
| Examples (from my knowledge) | EC2, Azure VMs, Compute Engine | App Service, Elastic Beanstalk, Cloud Run, managed databases | Lambda, Azure Functions, Cloud Functions, plus queues, event buses, managed workflow engines |

Containers sit across the middle (Kubernetes is IaaS-ish control with PaaS-like conveniences; managed container services are PaaS). Name that nuance when it is relevant.

## 3. A decision method

Work through these questions **in order**; the first strong "no" often decides it:

1. **Can the software run there at all?** Licensing, vendor support, required OS access, kernel modules, installers, Windows services, long-running processes, specialised hardware (GPUs). **A hard constraint beats every preference.**
2. **What is the load shape?** Steady 24/7 favours reserved IaaS or PaaS; **spiky, event-driven, or mostly idle** favours serverless; **unpredictable but continuous** favours autoscaled PaaS or containers.
3. **How long does a unit of work run?** Seconds: serverless fits. Hours: not functions (limits).
4. **Is it stateful?** Keep state in **managed data services**; stateless compute can be anything. A stateful, tightly coupled legacy application usually wants IaaS.
5. **How much operational burden can the team carry?** Every layer you manage is patching, hardening and on-call. A small team should push responsibility down to the provider where it can.
6. **Latency sensitivity and cold starts.**
7. **Cost at expected volume**, including the **people cost** of operating it.
8. **Portability and exit strategy.**
9. **Compliance** (data residency, certifications, isolation requirements).

### Make it explicit: a weighted scoring tool

Teams argue about preferences; scoring forces the criteria into the open. Weights are yours to set per workload:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > decide.py <<'EOF'
CRITERIA = {          # criterion: weight (how much this workload cares, 0-5)
    "needs OS-level control or custom install": 5,
    "spiky or mostly idle load":                1,
    "short tasks (seconds)":                    0,
    "small team, low ops capacity":             3,
    "strict latency, no cold starts":           4,
    "low lock-in":                              2,
}
# score of each model per criterion, 0 (poor) to 5 (excellent)  -- a judgement you defend, not a fact
SCORES = {
    "IaaS":       [5, 2, 3, 1, 5, 5],
    "PaaS":       [2, 3, 3, 4, 4, 3],
    "Serverless": [0, 5, 5, 5, 2, 1],
}
def rank(criteria, scores):
    w = list(criteria.values())
    total = sum(w)
    out = {m: sum(a * b for a, b in zip(w, s)) / (5 * total) for m, s in scores.items()}
    return sorted(out.items(), key=lambda kv: -kv[1])

print("Workload: a legacy Windows application with a long-running service, steady load, small team")
for model, score in rank(CRITERIA, SCORES):
    print(f"  {model:11} {score:5.0%}")
CRITERIA2 = {"needs OS-level control or custom install": 0, "spiky or mostly idle load": 5, "short tasks (seconds)": 5,
             "small team, low ops capacity": 4, "strict latency, no cold starts": 1, "low lock-in": 1}
print("\nWorkload: an event handler that runs for 2 seconds a few thousand times a day, nobody wants to patch anything")
for model, score in rank(CRITERIA2, SCORES):
    print(f"  {model:11} {score:5.0%}")
EOF
python3 decide.py
```

The same scoring table gives **different winners** for different workloads, which is the point: the answer lives in the **weights**, and writing them down lets reviewers challenge your reasoning instead of your taste. A scoring table never replaces the **hard constraint check** in step 1.

## 4. The cost break-even

Always-on compute costs the same busy or idle; pay-per-use costs nothing idle but more per unit of work. There is a **break-even volume** above which the always-on option is cheaper:

```run
cd ~/lab/cs
cat > breakeven.py <<'EOF'
# Illustrative prices (NOT any provider's current list):
VM_MONTH = 0.10 * 730                 # a small always-on VM at $0.10 per hour
PER_MILLION_REQ = 0.20                # serverless request charge per million invocations
GB_SECOND = 0.0000166667              # serverless compute charge per GB-second
MEM_GB, DURATION_S = 0.5, 0.2         # each invocation: 512 MB for 200 ms

def serverless_month(requests):
    return requests / 1e6 * PER_MILLION_REQ + requests * MEM_GB * DURATION_S * GB_SECOND

print(f"always-on VM: ${VM_MONTH:,.0f} per month, whatever the load\n")
print(f"{'requests/month':>16} {'serverless':>12} {'cheaper':>10}")
for r in (100_000, 1_000_000, 10_000_000, 50_000_000, 100_000_000):
    s = serverless_month(r)
    print(f"{r:16,} {'$' + format(s, ',.2f'):>12} {'serverless' if s < VM_MONTH else 'VM':>10}")

lo, hi = 1, 10**10
while hi - lo > 1:
    mid = (lo + hi) // 2
    lo, hi = (mid, hi) if serverless_month(mid) < VM_MONTH else (lo, mid)
print(f"\nbreak-even at about {lo:,} requests per month (about {lo / (730 * 3600):.1f} per second, continuously)")
print("Below it, serverless wins on cost. Above it, always-on wins, unless you also count the people cost of running the VM.")
EOF
python3 breakeven.py
```

The calculation is deliberately simple, and an honest answer lists what it **leaves out**: the VM needs patching and monitoring (people cost), the VM handles **bursts only up to its size** (so a spiky load needs more than one), serverless **adds** costs around it (an API gateway, logging, data transfer), and **reservations or savings plans** cut the VM price by large percentages (Q5). Do the arithmetic **for your real numbers** before you decide.

## 5. A real example: one system, three models

Using the **Enterprise Vault** archiving platform as the running example (an enterprise archive with indexing, search, and storage services on Windows servers with a SQL Server back end). **I am describing a design approach; check the vendor's support matrix before moving any component.**

| Component | Choice | Reasoning |
|---|---|---|
| **EV application servers** (long-running Windows services, installer-based, tightly coupled to OS and SQL) | **IaaS** (VMs) | step 1: needs OS control and a supported configuration; steady load, so reserved capacity is cost-effective |
| **SQL Server databases** | **IaaS VMs or a managed SQL service, depending on what the vendor supports** | managed databases remove patching, backup and failover work (a large saving) **if supported**; if not, VMs with disciplined backups |
| **Archive storage** (the bulk of the data) | **object or file storage (a managed storage service)** | cheap, durable, tiered, replicated (Q1, Q5) |
| **Search or reporting web front end** (new, built by you, stateless) | **PaaS** (managed containers or web app service) | no OS constraint, autoscaling, patching handled |
| **Event handlers** ("a new legal hold was created: notify and update a ticket", scheduled clean-ups, file-arrival processing) | **serverless** | short tasks, spiky, mostly idle, scale to zero |
| **Monitoring and alert fan-out** | **managed monitoring services plus serverless glue** | no servers to maintain |

The point of the example is the **split**: legacy and constrained parts stay close to the metal; new, stateless and event-driven parts go up the stack. Each choice has a stated reason tied to the decision method.

## 6. How to answer

1. **Frame**: "I decide per workload, not per company: I start with hard constraints, then load shape, task duration, state, team capacity and cost."
2. **Give the three-line summary of each model** (control, scaling, cost shape).
3. **Show the example** with the split table above, or your own real one.
4. **Name a case you would push back on**: "serverless for a three-hour batch job" or "VMs for a stateless web tier nobody wants to patch".
5. **Close with how you review the decision**: costs and operational load change; revisit at the next major release or when the bill or the on-call load says so.

## 7. Follow-up questions to expect

- "What are **cold starts** and how do you mitigate them?" (provisioned concurrency or minimum instances, smaller runtimes, keeping functions warm, avoiding serverless for latency-critical paths)
- "How do you avoid **lock-in**?" (open standards: containers, Kubernetes, open-source databases; keep business logic portable and isolate provider-specific glue; accept some lock-in where the value is high, and write down the exit cost)
- "What about **containers and Kubernetes**: which model is that?" (it spans IaaS and PaaS; operate it yourself for control, or use a managed control plane)
- "When does serverless become **more expensive**?" (steady high volume, as the break-even shows)
- "How do you handle **state** in serverless?" (externalise it to managed stores, make functions idempotent)

:::warn Common mistakes
- **Choosing by fashion** ("everything serverless" or "lift and shift everything").
- **Ignoring hard constraints** (licensing, vendor support) until late.
- **Comparing only compute prices**, forgetting people cost, gateways, logging and data transfer.
- **Using functions for long-running or stateful work.**
- **Treating the decision as permanent.** Workloads move up the stack as they mature.
:::

:::recap
- **IaaS** = control and responsibility; **PaaS** = you run the application; **serverless** = you run only code, pay per use, scale to zero, with limits and cold starts.
- Decide with a method: **hard constraints, load shape, task duration, state, team capacity, cost, portability, compliance**.
- Scoring tables make the **weights** explicit; the break-even calculation shows where always-on beats pay-per-use.
- A strong example **splits one system** across models, each choice with a reason.
:::

:::try Your turn
Change the weights in `decide.py` for a batch reporting job that runs 3 hours every night, needs 16 cores and no cold starts. Which model wins? Then change `DURATION_S` in `breakeven.py` to 3 seconds and note how the break-even volume moves.
:::

:::quiz
? Which question should you ask first when choosing a compute model?
+ Can the software run there at all (OS control, licensing, vendor support)?
- Which model is cheapest per hour?
- Which model is newest?
- Which model has the best logo?
! A hard constraint overrides every preference.
? When does always-on compute beat serverless on cost?
+ At steady high volume, above the break-even number of requests
- Never
- Only for small workloads
- Only when idle
! Serverless is cheapest when the load is low or spiky.
? Why is serverless a poor fit for a three-hour batch job?
+ Function execution time limits and per-duration pricing make long jobs unsuitable
- Functions cannot read files
- Batch jobs need a GUI
- Serverless has no logging
! Use a container job or a VM for long tasks.
:::
