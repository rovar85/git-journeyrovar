---
track: cloudsenior
title: Q12: What is your approach to observability in the cloud (logging, metrics, tracing, alerting, SLOs)?
short: Q12 Observability and SLOs
sub: From user journeys to SLOs and error budgets, burn-rate alerts that page on real risk, telemetry cost control (cardinality and sampling), and a strategy that spans accounts and regions, with calculators you can run.
---

:::goals
- distinguish monitoring from observability and design telemetry around questions you need to answer
- define SLIs, SLOs and error budgets from user journeys
- implement multi-window burn-rate alerting and see why it beats threshold alerts
- control telemetry cost with cardinality limits and sampling
- design a cross-account, multi-region observability architecture and a senior answer
:::

:::note Provenance
The calculators are **real code**. The Monitoring track has hands-on Prometheus, alerting and SLO basics, and the AI infrastructure track has traces and AI-specific signals; this lesson is the **strategy-level** answer. Burn-rate thresholds follow the widely used approach from the Google SRE workbook (from my knowledge): **check the book for the exact recommended windows and factors** before adopting them. Cloud product names are from my knowledge.
:::

## 1. What the interviewer is testing

Not "which tool do you use". They look for: **start from user-visible reliability** (SLOs), a **layered telemetry strategy** (metrics, logs, traces, events), **alerting that is actionable and low-noise**, **cost awareness** (telemetry bills grow quickly), **standards** (naming, labels, OpenTelemetry), **ownership**, and **operating the platform across many accounts and regions**.

## 2. Monitoring versus observability

- **Monitoring**: watching **known** failure modes with **predefined** dashboards and alerts ("disk above 90%").
- **Observability**: being able to ask **new questions** about **unknown** failures from the data the system emits ("why are requests from this tenant slow only in this region?"). It needs **rich, high-context telemetry** (structured events, traces, labelled metrics), not just more dashboards.

You need both: monitoring for the known, observability for the surprises.

## 3. The signals and what each is for

| Signal | Best for | Watch out for |
|---|---|---|
| **Metrics** (numbers over time) | health, trends, alerting, SLOs, capacity; cheap to store | **cardinality** (too many label combinations), averages hiding tails |
| **Logs** (events as text or structured records) | detail of what happened, audit, debugging | **volume and cost**, unstructured text, sensitive data in logs |
| **Traces** (one request across services) | **where time and errors occur** in distributed systems | **sampling**, instrumentation gaps, broken context propagation |
| **Events and changes** (deploys, config changes, scaling) | **correlating "what changed"** with the symptom | not recorded unless you decide to |
| **Profiles** (continuous profiling, optional) | CPU and memory hot spots in code | specialised tooling |
| **Real-user and synthetic monitoring** | what users **actually** experience; probes from outside | probes test only the paths you scripted |

Frameworks for choosing metrics: the **four golden signals** (latency, traffic, errors, saturation), **RED** for services (rate, errors, duration) and **USE** for resources (utilisation, saturation, errors) (from the SRE literature; the Monitoring track used them).

## 4. SLOs: reliability as an agreement

1. Identify the **critical user journeys** (log in, search the archive, retrieve an item, export for legal hold).
2. Choose **SLIs**: a **ratio of good events to valid events** measured as close to the user as practical (for example "proportion of search requests that return successfully in under 1 second").
3. Set **SLOs** with the business: an **objective over a window** (99.9% over 30 days). **Not 100%**: it costs infinitely more and blocks all change.
4. The **error budget** is `1 - SLO`: the **allowed** unreliability (99.9% over 30 days is 43.2 minutes of "bad"). While budget remains, ship features; when it is **spent**, shift effort to reliability: a **written error-budget policy** agreed with product owners makes this a rule rather than an argument.
5. **Publish and review** SLOs regularly; change them when the user need or the system changes.

## 5. Alerting that earns its pager

Principles: **alert on symptoms users feel (SLO impact), not causes**; every page must be **urgent, actionable, and need a human**; everything else is a ticket or a dashboard; each alert links a **runbook**; **review noisy alerts** and delete or fix them (alert fatigue is a reliability risk).

**Threshold alerts** ("error rate above 5% for 5 minutes") have two weaknesses: they **miss slow burns** (a 0.5% error rate for days spends the budget unnoticed) and they **page on blips** that would never threaten the SLO. **Burn-rate alerting** asks instead: **how fast are we consuming the error budget?** A burn rate of 1 means the budget would be exactly used up at the end of the window; a burn rate of 14.4 sustained for an hour consumes 2% of a 30-day budget. Combine a **long window** (is it real?) with a **short window** (is it still happening?) to reduce false pages:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > burn.py <<'EOF'
SLO = 0.999                       # 99.9% over 30 days
BUDGET = 1 - SLO
WINDOW_H = 30 * 24

def burn_rate(error_ratio): return error_ratio / BUDGET
def hours_to_exhaust(rate):  return WINDOW_H / rate if rate > 0 else float("inf")

print(f"error budget: {BUDGET:.3%} of requests = {BUDGET * WINDOW_H * 60:.1f} minutes of full outage per 30 days\n")
print(f"{'error ratio now':>16} {'burn rate':>10} {'budget gone in':>18}")
for er in (0.0005, 0.001, 0.005, 0.0144, 0.05, 0.5):
    r = burn_rate(er)
    h = hours_to_exhaust(r)
    gone = f"{h / 24:.1f} days" if h >= 48 else f"{h:.1f} hours"
    print(f"{er:16.2%} {r:10.1f} {gone:>18}")

# Multi-window, multi-burn-rate policy (factors follow the common SRE-workbook table; verify before adopting):
POLICY = [("PAGE", 14.4, "1h", "5m"), ("PAGE", 6.0, "6h", "30m"), ("TICKET", 1.0, "3d", "6h")]
print("\npolicy: alert when BOTH the long and the short window exceed the burn rate")
for sev, rate, long_w, short_w in POLICY:
    print(f"  {sev:6} burn rate >= {rate:4.1f} over {long_w:>3} and {short_w:>3}  -> budget would be gone in {hours_to_exhaust(rate) / 24:.1f} days if it continued")

# Simulation: which approach pages for which kind of incident?
def minutes(spec): return spec
incidents = {
    "total outage, 10 min":           [(0, 10, 1.00)],
    "brownout 5% errors for 3 hours": [(0, 180, 0.05)],
    "slow leak 0.3% errors for 5 days": [(0, 5 * 24 * 60, 0.003)],
    "30-second blip":                 [(0, 0.5, 1.00)],
}
print(f"\n{'incident':34} {'budget used':>12} {'threshold (5% for 5 min)':>26} {'burn-rate policy':>18}")
for name, parts in incidents.items():
    used = sum((dur / (WINDOW_H * 60)) * er / BUDGET for _, dur, er in parts)
    er, dur = parts[0][2], parts[0][1]
    threshold_pages = er >= 0.05 and dur >= 5
    br_pages = (burn_rate(er) >= 14.4 and dur >= 5) or (burn_rate(er) >= 6 and dur >= 30) or (burn_rate(er) >= 1.0 and dur >= 6 * 60)
    kind = "page" if br_pages and burn_rate(er) >= 6 else ("ticket" if br_pages else "no alert")
    print(f"{name:34} {used:12.1%} {'PAGE' if threshold_pages else 'no alert':>26} {kind:>18}")
EOF
python3 burn.py
```

Read the last table like an interviewer would:

- The **30-second blip** pages nobody under the burn-rate policy (it used about 1% of the budget: not worth waking anyone) and **would not** page under the threshold either; good.
- The **3-hour 5% brownout** burns **half the budget**: both approaches page, but the burn-rate version also **tells you how bad it is**.
- The **slow leak** (0.3% errors for five days) **consumes most of the monthly budget** and the threshold alert **never fires**; the burn-rate policy **raises a ticket** because a 0.3% error ratio is a burn rate of 3, above 1 for long enough.

That is why mature teams page on **budget burn** rather than raw thresholds, and use **tickets** for slow burns.

## 6. Controlling the cost and noise of telemetry

Telemetry is data, and it **grows with traffic, services and labels**; unmanaged, it becomes one of the largest line items (Q5). Two classic traps:

**Metric cardinality**: the number of **time series** is the **product of label values**. One label with unbounded values (a user ID, a request ID, a full URL with parameters) multiplies it explosively:

```run
cd ~/lab/cs
python3 - <<'EOF'
from math import prod
def series(labels): return prod(labels.values())
good = {"service": 40, "region": 4, "status_class": 5, "method": 6}
bad  = dict(good, user_id=100_000)
print(f"labelled sensibly:             {series(good):>14,} time series")
print(f"plus a user_id label:          {series(bad):>14,} time series ({series(bad) // series(good):,}x more)")
print(f"at ~3 KB of memory per series: {series(good) * 3 / 1e6:6.1f} GB vs {series(bad) * 3 / 1e6:10,.0f} GB")
print("Put high-cardinality identifiers in traces and logs, never in metric labels.")
EOF
```

**Trace and log volume**: you cannot keep every trace. **Sampling** keeps the useful ones. **Head sampling** decides at the start (cheap, but may drop the interesting ones); **tail sampling** decides after the trace completes: **keep every error and every slow trace, plus a small random share of the rest**:

```run
cd ~/lab/cs
cat > sampling.py <<'EOF'
import random
random.seed(17)
N = 100_000
traces = []
for _ in range(N):
    error = random.random() < 0.01                       # 1% errors
    slow = random.random() < 0.03                        # 3% slow
    traces.append((error, slow))

def head(rate):  return [t for t in traces if random.random() < rate]
def tail(rate):  return [t for t in traces if t[0] or t[1] or random.random() < rate]      # keep all errors and all slow traces

def report(name, kept):
    errs = sum(1 for e, _ in kept if e); slows = sum(1 for _, s in kept if s)
    total_err = sum(1 for e, _ in traces if e); total_slow = sum(1 for _, s in traces if s)
    print(f"{name:34} stored {len(kept) / N:6.1%} of traces | errors kept {errs / total_err:6.1%} | slow kept {slows / total_slow:6.1%}")

report("keep everything", traces)
report("head sampling at 1%", head(0.01))
report("tail sampling (errors+slow+1% rest)", tail(0.01))
EOF
python3 sampling.py
```

Tail sampling stores **about a twentieth of the data** yet keeps **every error and slow trace**: the traces you will actually open during an incident. (It needs a **collector tier** that buffers whole traces; the OpenTelemetry Collector provides tail-sampling processors, from my knowledge.) Other cost levers: **log levels and structured logging** (no debug in production), **retention tiers** (hot for days, cold for months, archived for compliance), **downsampling** metrics for old data, **dropping unused metrics**, and **sampling in the agent**, not after paying to ingest.

## 7. Platform design across accounts and regions

- **Instrument once with a standard**: **OpenTelemetry** SDKs and the **Collector** (the AI infrastructure track showed both) so you are not locked to a vendor's agent; a **semantic convention** for service names, environments, regions and versions.
- **Per-account and per-region collection** (agents and collectors close to the workload), **forwarding to a central observability account** (Q3) for cross-service views, **plus** local retention so a network partition does not blind the region.
- **The observability stack must survive the failures it watches** (Q1, Q7): do not host monitoring only in the region or account that fails; alert on **missing data** (a silent exporter is a signal), and keep **an external synthetic probe** from outside your infrastructure.
- **Managed or self-run**: cloud-native services (CloudWatch, Azure Monitor, Google Cloud Operations), **managed Prometheus and Grafana**, SaaS vendors, or self-hosted open source (Prometheus, Grafana, Loki, Tempo, Jaeger, Elasticsearch/OpenSearch). Decide on **cost, skills, retention, data residency (Q4), and lock-in**; often a mix.
- **Multi-tenant access control**: teams see their own data; security sees audit data; **sensitive data is redacted** at collection (Q11, Q4).
- **Ownership**: every service has an **owner, dashboards, SLOs and a runbook** as part of the **paved path** (Q13): a new service created from the template **gets default observability**.
- **Dashboards in layers**: executive SLO overview, service health (golden signals), then deep dives; and **dashboards as code** (Grafana JSON or generated, in Git).
- **Change events** shown on dashboards (deploys, scaling, config), because **most incidents follow a change**.

## 8. How to answer

1. **Start from users**: critical journeys, SLIs, SLOs and error budgets with an **error budget policy**.
2. **Telemetry plan**: metrics for health and SLOs, structured logs, **traces with OpenTelemetry**, change events, synthetic probes, with **naming and label standards**.
3. **Alerting**: symptom-based, **burn-rate** paging, tickets for slow burns, **runbooks**, regular **alert reviews**, noise as a metric.
4. **Operations**: dashboards by layer, on-call rotations, incident integration (Q9), **blameless reviews** feeding back into SLOs and alerts.
5. **Platform and cost**: central plus local collection, **cardinality and sampling controls**, retention tiers, data residency and redaction, **observability that survives a regional failure**.
6. **Measure the programme**: percentage of services with SLOs, alert actionability (pages that needed action), MTTD (Q9), telemetry cost per service.

## 9. Follow-up questions to expect

- "**How do you choose an SLO target**?" (from user expectations and measured history; start achievable, tighten with evidence; consider dependencies' SLOs: you cannot be more reliable than your hard dependencies)
- "How do you **alert on a dependency** you do not control?" (SLIs on your calls to it, with timeouts and fallbacks; their status page is a signal, not a substitute)
- "**Too many alerts**: what do you do?" (classify by actionability, delete or merge, move to tickets, switch to SLO burn alerts, hold a regular alert review)
- "How do you debug **a slow request across 20 microservices**?" (a trace by trace ID, correlated with logs and the change timeline)
- "What if **monitoring itself fails**?" (dead-man's-switch alerts, external probes, a small independent backup channel)
- "**Logs versus metrics versus traces**: when each?" (the table above, in your own words)

:::warn Common mistakes
- **Alerting on causes** (CPU above 80%) instead of user impact.
- **100% SLO targets** or no error budget policy, so SLOs change nothing.
- **Averages** instead of percentiles, and **dashboards nobody owns**.
- **High-cardinality labels** on metrics.
- **Logging everything at debug level** and paying to store it.
- **Observability hosted only in the region or account it watches.**
- **Sensitive data in logs and traces.**
:::

:::recap
- **Observability** lets you ask new questions; plan **metrics, logs, traces and change events** around SLOs, with **OpenTelemetry** as the standard.
- **SLIs measure user experience; SLOs set targets; the error budget** governs the pace of change, under a written policy.
- **Burn-rate alerts** page on real risk to the budget and ticket slow leaks; threshold alerts miss slow burns and page on blips.
- **Control cost**: avoid high-cardinality labels, use **tail sampling**, retention tiers and level discipline.
- Design the platform **across accounts and regions**, resilient to the failures it observes, with ownership, redaction and layered dashboards.
:::

:::try Your turn
Change the SLO in `burn.py` to 99.95% and see how the error budget and "budget gone in" columns change. Then add a fifth incident (a **12% error rate for 20 minutes**) and decide, before running, whether it should page, ticket or be ignored; then compare with the program's answer.
:::

:::quiz
? What is an error budget?
+ The amount of unreliability the SLO allows (1 minus the SLO), spendable on change and risk
- The money allocated to monitoring
- The number of alerts allowed per week
- The size of the logs
! When it is spent, reliability work takes priority.
? Why can burn-rate alerting beat a fixed error-rate threshold?
+ It catches slow burns that exhaust the budget and ignores short blips that do not threaten the SLO
- It needs fewer metrics
- It is simpler to configure
- It never fires
! It relates alerts to risk to the SLO, using long and short windows.
? Why should user IDs not be metric labels?
+ Each distinct value creates a new time series, causing a cardinality explosion
- IDs are secret
- Labels must be numbers
- Metrics cannot be stored
! Put such identifiers in traces and logs.
:::
