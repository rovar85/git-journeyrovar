---
track: scenarios
title: "S12: Monitoring and logging scenarios: noisy alerts, a silent slow leak and exploding metrics"
short: S12 Monitoring and logging
sub: Compare alert rules on a quiet day, a short incident and a slow leak; see how one label can create billions of series; reduce log cost without going blind.
---

:::goals
- explain alert fatigue and design alerts that page on user impact
- compare a static threshold, a sustained threshold and multi-window burn-rate alerts on the same data
- explain metric cardinality and why identifiers belong in logs and traces
- plan a logging pipeline: structure, levels, sampling, retention and cost
:::

:::note How to use this lesson
The models run for real in the lab. They use invented data, so read them for the **shape** of the trade-offs. Metrics, Prometheus, logs, traces and SLOs are taught in [Monitoring](#monitoring-1) (especially [lesson 4](#monitoring-4)); percentiles and tails are in [Systems 5](#systems-5); on-call practice is in [Senior cloud 9](#cloudsenior-9).
:::

## Scenario A: "On-call is drowning in alerts and people ignore them. Fix it."

**What the interviewer tests:** do you page on **symptoms users feel** rather than causes, and do you understand the trade-off between **speed of detection** and **false alarms**?

Principles:

- **Page on symptoms, ticket on causes.** "Error rate or latency is hurting users" pages a human. "Disk 80% full" opens a ticket unless it will fill within hours.
- **Every page must be urgent, actionable and new.** If the response is "wait and see" or "nothing to do", delete or downgrade the alert.
- **Link a runbook** and the dashboard from the alert.
- **Review alerts monthly:** which fired, which led to action, which were noise.

### Four rules on the same data

The model has a service with a 99.9% availability target (an **error budget** of 0.1%). It runs three days: a quiet day, a short real incident (2% errors for 90 minutes) and a slow leak (0.8% errors for 6 hours).

```run
mkdir -p ~/lab/mon && cd ~/lab/mon
cat > alerts.py <<'EOF'
import random
random.seed(3)
# A service with a 99.9% availability target (error budget 0.1%). One minute of data per point.
def day(fault_start=None, fault_len=0, fault_rate=0.0):
    errs = []
    for m in range(1440):
        base = max(0.0, random.gauss(0.0006, 0.0008))                        # normal noise around 0.06% errors
        if fault_start is not None and fault_start <= m < fault_start + fault_len: base = fault_rate
        errs.append(base)
    return errs
def static(errs, thr=0.002):                                                  # fire whenever one minute is above 0.2%
    return [i for i, e in enumerate(errs) if e > thr]
def sustained(errs, thr=0.002, n=5):                                          # 'for: 5m'
    return [i for i in range(n, len(errs)) if all(e > thr for e in errs[i - n:i])]
def burn(errs, short=5, long=60, rate=14.4, budget=0.001):                    # multi-window burn rate: both windows burning fast
    out = []
    for i in range(long, len(errs)):
        s = sum(errs[i - short:i]) / short; l = sum(errs[i - long:i]) / long
        if s > rate * budget and l > rate * budget: out.append(i)
    return out
quiet = day()
print("A quiet day with NO real problem: how many times would each rule page someone?")
print(f"   static threshold (any minute > 0.2%):        {len(static(quiet)):4d} alert-minutes")
print(f"   same, but only if it lasts 5 minutes:        {len(sustained(quiet)):4d} alert-minutes")
print(f"   burn-rate (5 min and 60 min both fast):      {len(burn(quiet)):4d} alert-minutes")
print(f"   burn-rate slow tier (30 min and 6 h):        {len(burn(quiet, short=30, long=360, rate=6)):4d} alert-minutes")
print("\nA real incident: 2% errors starting at minute 600 and lasting 90 minutes")
inc = day(600, 90, 0.02)
for name, f in (("static threshold", static), ("5-minute sustained", sustained), ("burn-rate fast tier", burn)):
    hits = [i for i in f(inc) if 600 <= i < 690]
    print(f"   {name:20} first alert {('after ' + str(hits[0] - 600) + ' min') if hits else 'NEVER':14} alert-minutes during the incident: {len(hits)}")
print("\nA slow leak: 0.8% errors for 6 hours (never looks scary, but it eats the budget)")
leak = day(300, 360, 0.008)
slow = lambda e: burn(e, short=30, long=360, rate=6)
for name, f in (("static threshold", static), ("5-minute sustained", sustained), ("burn-rate fast tier", burn), ("burn-rate slow tier", slow)):
    hits = [i for i in f(leak) if 300 <= i < 660]
    print(f"   {name:20} first alert {('after ' + str(hits[0] - 300) + ' min') if hits else 'NEVER':14}")
print("\nBudget used by the leak:", f"{sum(leak) / 1440 / 0.001:.0%} of the daily 99.9% error budget")
EOF
python3 alerts.py
```


What the output teaches:

- **Static threshold (any minute over 0.2%):** detects instantly, but on the **quiet day it still produced 62 alert-minutes**: pure noise from normal variation. This is how alert fatigue starts.
- **Sustained for 5 minutes:** removes the quiet-day noise and loses only 5 minutes of detection time. A good default for simple alerts (Prometheus `for: 5m`).
- **Burn-rate, fast tier (both a 5-minute and a 60-minute window above 14.4 times the budget rate):** silent on the quiet day, fires on the real incident after about 43 minutes in this model, and **never fires for the slow leak**. It pages only when the budget is burning fast.
- **Burn-rate, slow tier (30-minute and 6-hour windows above 6 times the rate):** catches the **slow leak** after about 4 hours, by which time the leak had consumed more than the day's budget.

There is **no free lunch**: the quieter and more budget-based the rule, the slower it can be on short, severe incidents. That is why the recommended pattern is **multiple windows and tiers**: a fast tier that pages for severe burn, a slow tier that pages (or tickets) for the slow bleed. The window sizes and rates in the model follow the widely used SRE-workbook pattern, but your numbers should come from your own SLO and traffic ([Monitoring 4](#monitoring-4)).

**Other fixes for noise:** group related alerts, inhibit child alerts when a parent fires (do not page for 50 services when the database is down), use maintenance silences, and alert on **absence of data** carefully (a "no data" alert means monitoring itself may be broken).

## Scenario B: "Our monitoring system keeps running out of memory."

Time-series databases keep **one series per unique combination of label values**. The count is the **product** of the distinct values:

```run
mkdir -p ~/lab/mon && cd ~/lab/mon
cat > cardinality.py <<'EOF'
# Time-series databases store one series per unique combination of label values. Count what a label choice costs.
labels = {"service": 40, "method": 6, "status": 8, "instance": 120}
series = 1
for k, v in labels.items(): series *= v
print("labels and their distinct values:", labels)
print(f"series for ONE metric: 40 x 6 x 8 x 120 = {series:,}")
BYTES_PER_SERIES = 3000                                                           # rough memory per active series, illustrative
print(f"memory at ~{BYTES_PER_SERIES} bytes per series: about {series * BYTES_PER_SERIES / 1e6:,.0f} MB for this one metric\n")
print("Now someone adds user_id (50,000 users) as a label 'to debug one customer':")
bad = series * 50_000
print(f"   {bad:,} series, about {bad * BYTES_PER_SERIES / 1e9:,.0f} GB of memory. The monitoring system falls over, usually during the incident you wanted it for.")
print("\nSafer: keep identifiers (user, request, trace id) in LOGS and TRACES, and keep metric labels to small, bounded sets.")
print("A quick audit rule: any label whose number of distinct values can grow with traffic or with users does not belong on a metric.")
EOF
python3 cardinality.py
```


Forty services, six methods, eight status codes and 120 instances already give **230,400 series for one metric**. Adding a `user_id` label with 50,000 values multiplies that to **11.5 billion**, far beyond any server. The rule: **a label whose values can grow with users, requests or time (user id, request id, full URL, container id churn) does not belong on a metric.** Put identifiers in logs and traces, which are built for them, and link the two with a trace id ([Monitoring 4](#monitoring-4)).

How you notice: memory growth in the monitoring server, slow queries, a rising "series created" rate. How you fix it: drop or aggregate the label at ingestion (relabelling), restart with the label gone, and add a **series limit per target** so one bad deploy cannot take the system down.

## Scenario C: "Logging costs are huge, and we still cannot find the error."

Both halves are the same problem: **too much unstructured data**.

1. **Structure the logs.** JSON lines with fields (timestamp, level, service, trace id, user id, message). Searching a field is cheap; searching free text is not.
2. **Use levels honestly.** `debug` off by default in production, switchable per service for an hour. A debug-level flag left on is a classic cost spike ([Cloud cost scenarios](#scenarios-11)).
3. **Sample the boring, keep the interesting:** keep all errors and slow requests, sample a small share of successful ones.
4. **Retention in tiers:** days of fast, searchable storage; months in cheap object storage; delete after the legal or useful period.
5. **Do not log secrets or personal data.** Mask at the source; logs are widely readable and long-lived ([Network security scenarios](#scenarios-10)).
6. **Centralise and correlate:** ship logs from every node to one place with the **trace id**, so "find the error" is one query instead of ssh-ing to ten servers ([Interview scenarios 9](#scenarios-9)).
7. **Prefer metrics for counting, logs for explaining:** do not compute error rates by grepping logs.

## Scenario D: "There was an outage and we had no data."

A checklist of what to have **before** the incident: dashboards for the **four golden signals** (latency, traffic, errors, saturation) per service; alerts that include a link to the runbook; **health and synthetic checks** from outside the system; **dependency dashboards** (database, queue, third party); log and trace retention long enough for a post-incident review; and an **on-call rota** with an escalation path ([Senior cloud 9](#cloudsenior-9)). After the incident, the review asks "how did we find out?" and "what would have told us sooner?" and the answer becomes a new alert or dashboard, not a new person to blame.

## The answer an interviewer expects (alert noise)

"I would audit the alerts: which fired last month, which needed action, which were ignored. I would move cause-based alerts to tickets, keep pages for user-visible symptoms, base them on the SLO with burn-rate alerts in two tiers (fast and slow), add a short sustained period to simple threshold alerts, group and inhibit related alerts, and give every page a runbook link. Then I would track pages per shift and the share that needed action, and review monthly."

## Follow-up questions to expect

- What are the four golden signals? (Latency, traffic, errors, saturation.)
- Monitoring versus observability? (Known questions with dashboards versus asking new questions with rich telemetry.)
- What is an error budget and what happens when it is spent? (Freeze risky changes, spend time on reliability.)
- How do you alert on a batch job that did not run? (Heartbeat or "last success older than X".)
- How do you keep dashboards useful? (One question per dashboard, owners, delete the unused.)

## Practice (answers below)

1. In the alert model, change the incident error rate to 0.5%. Which rules still fire and why?
2. A metric has labels service (30), endpoint (200) and status (6). How many series? What would you drop?
3. Why should "disk 80% full" usually not page someone at night?

:::recap
- **Page on user symptoms**, ticket on causes; every page must be urgent, actionable and new.
- **Sustained thresholds** cut noise; **multi-window burn-rate** alerts tie paging to the error budget; use a **fast and a slow tier**.
- **Series = product of label values**: never put unbounded identifiers on metrics.
- **Structure, level, sample, tier and correlate** your logs; do not log secrets.
:::

:::note Answers
1. A 0.5% error rate is above the 0.2% static and sustained thresholds, so they fire; it is far below the fast burn-rate threshold (1.44%) and about 5 times the budget rate, which is under the slow tier's 6 times, so neither burn-rate tier fires: it is a slow burn that the model's tiers do not page on, and a lower-rate tier (such as 3 times over 24 hours) or a ticket would catch it. 2. 30 x 200 x 6 = 36,000 series; if endpoints include IDs or parameters, replace them with route templates or drop the label. 3. Disks fill slowly and predictably; a ticket or a "will be full in 4 hours" prediction alert gives time to act without waking anyone.
:::

```quiz
? What does a multi-window burn-rate alert reduce compared with a plain static threshold?
+ Noise on quiet periods, because it pages only when the error budget is burning fast
- Detection of every incident
- The need for an SLO
- The number of metrics
! It trades some detection speed for far fewer false pages.

? Which label should NOT be added to a metric?
+ user_id with tens of thousands of values
- status code
- service name
- HTTP method
! Unbounded values multiply the number of series and can crash the monitoring system.

? What is the best way to find an error across ten servers quickly?
+ Centralised structured logs correlated by a trace id
- ssh to each server and grep
- Reboot the servers
- Increase the log level everywhere
! One searchable place with correlation turns minutes of hunting into one query.
```
