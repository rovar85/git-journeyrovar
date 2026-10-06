---
track: monitoring
title: Logs, traces, dashboards and SLOs
short: Logs, SLOs
sub: Centralised logging, distributed tracing, Grafana dashboards, and reliability targets with error budgets.
---

:::goals
- describe a centralised logging pipeline and structured logs
- explain tracing and OpenTelemetry
- design a useful dashboard
- calculate SLOs, error budgets and burn rates
:::

## Logs

Metrics say **that** error rates went up; **logs** say **which request and why**. Two good practices:

1. **Structured logs**: emit JSON (or key=value) instead of free text, so fields are searchable.
2. **Centralise** logs: ship them off the machine (servers die, containers disappear) to a searchable store.

```run
cat > ~/lab/app.log <<'EOF'
{"ts":"2026-09-30T09:12:18Z","level":"error","service":"indexer","msg":"SQL connection timeout","server":"SQL01","attempt":1,"trace_id":"a1b2"}
{"ts":"2026-09-30T09:12:19Z","level":"warn","service":"indexer","msg":"retrying","server":"SQL01","attempt":2,"trace_id":"a1b2"}
{"ts":"2026-09-30T09:12:35Z","level":"error","service":"indexer","msg":"task aborted","server":"SQL01","attempt":3,"trace_id":"a1b2"}
{"ts":"2026-09-30T09:20:01Z","level":"info","service":"search","msg":"query ok","ms":84,"trace_id":"c3d4"}
{"ts":"2026-09-30T12:15:41Z","level":"error","service":"indexer","msg":"name resolution failed","server":"SQL01","attempt":1,"trace_id":"e5f6"}
EOF
cd ~/lab
echo "errors by service:"
python3 -c '
import json, collections
c = collections.Counter(json.loads(l)["service"] for l in open("app.log") if json.loads(l)["level"] == "error")
print(dict(c))'
echo "all log lines belonging to one request (trace_id a1b2):"
grep a1b2 app.log | python3 -c '
import sys, json
for l in sys.stdin:
    d = json.loads(l); print(" ", d["ts"][11:19], d["level"], d["msg"])'
```

The `trace_id` field ties together every log line of one request, across services. This is the bridge between logs and traces.

### A logging stack

| Part | Examples |
|---|---|
| **Collector/agent** on each node or sidecar | Fluent Bit, Vector, Promtail, Filebeat, the OpenTelemetry Collector |
| **Store and index** | **Loki** (indexes labels only, cheap, pairs with Grafana), **Elasticsearch/OpenSearch** (full-text), Splunk, cloud services (CloudWatch Logs, Azure Log Analytics) |
| **Query/UI** | Grafana (LogQL), Kibana, Splunk |

```logql
{service="indexer", level="error"} |= "SQL connection" | json | server="SQL01"
sum by (service) (rate({level="error"}[5m]))
```

(**Example, not run here**: LogQL, Loki's query language, which resembles PromQL.) On Windows servers use the Windows event log shippers (`winlogbeat`, the OpenTelemetry Collector's Windows receivers). Set **retention** per log type, **protect** logs (they contain sensitive data), and **never log secrets**.

## Traces

In a system of many services, one user request touches many components. A **trace** records the whole journey as **spans** (one per operation), with timing and parent/child links, so you see exactly where time went:

```
GET /search                                    [==================== 420 ms]
  auth-service  validate token                 [== 18 ms]
  search-service  query index                  [==============  290 ms]
    sql  SELECT ...                            [============ 240 ms]   <-- the slow part
  render results                               [== 25 ms]
```

**OpenTelemetry (OTel)** is the vendor-neutral standard for generating and exporting traces, metrics and logs (SDKs for each language and the OTel Collector). Backends: Jaeger, Grafana Tempo, Zipkin, Datadog, Honeycomb, Azure Application Insights, AWS X-Ray. Typical flow: you find a slow endpoint in a metric, jump to an **exemplar** trace for a slow request, and read the logs by `trace_id`.

## Dashboards (Grafana)

A dashboard is a set of panels (graphs, stats, tables) over data sources. Principles:

- One dashboard per **question or service**, not one giant wall.
- Top row: the **golden signals** or RED, with the **SLO line** drawn on it.
- Then saturation of resources (CPU, memory, disk, queues), then dependencies.
- Use **templating variables** (a dropdown for environment or server) so one dashboard serves all.
- Put units, titles and descriptions on panels; avoid decoration.
- Dashboards are **code too**: store JSON in Git, provision with Terraform or Grafana's provisioning files.

```json:panel.json (Example, not run here)
{
  "title": "Error ratio",
  "type": "timeseries",
  "targets": [{ "expr": "sum(rate(app_requests_total{status=~\"5..\"}[5m])) / sum(rate(app_requests_total[5m]))" }],
  "fieldConfig": { "defaults": { "unit": "percentunit", "thresholds": { "steps": [{ "value": null, "color": "green" }, { "value": 0.01, "color": "red" }] } } }
}
```

Grafana is not available in this lab, so dashboards are examples; the queries are the ones you ran against real Prometheus.

## SLIs, SLOs and error budgets

| Term | Meaning | Example |
|---|---|---|
| **SLI** (indicator) | a measurement of service quality | fraction of requests that succeed and take under 500 ms |
| **SLO** (objective) | the target for the SLI over a period | 99.9% over 30 days |
| **SLA** (agreement) | a contract with consequences | credits if availability falls below 99.5% |
| **Error budget** | the allowed failures = 100% minus the SLO | 0.1% of requests (about 43 minutes of full outage per 30 days) |

```run
python3 - <<'EOF'
slo = 99.9
days = 30
total_minutes = days * 24 * 60
budget_pct = 100 - slo
budget_minutes = total_minutes * budget_pct / 100
print(f"SLO {slo}% over {days} days -> error budget {budget_pct:.2f}% = {budget_minutes:.1f} minutes of full outage")
print()
# Burn rate: how fast the budget is being consumed. 1.0 = exactly on target for the period.
print("Burn rate examples (requests failing now vs the allowed rate):")
for error_rate in [0.05, 0.1, 0.5, 1.0, 5.0]:
    burn = error_rate / budget_pct
    hours_to_exhaust = (days * 24) / burn
    print(f"  {error_rate:5.2f}% errors -> burn rate {burn:5.1f}x -> budget gone in {hours_to_exhaust:7.1f} hours")
EOF
```

When the error budget is healthy, teams ship features faster; when it is nearly spent, they slow down and fix reliability. Alerting on **burn rate** (for example, "burning 14x faster than allowed over 1 hour, page; 2x over 6 hours, ticket") makes alerts proportional to user impact, replacing dozens of cause-based alerts.

```promql
# multi-window burn-rate alert (Example, not run here): 14.4x for a 99.9% SLO
(sum(rate(app_requests_total{status=~"5.."}[1h])) / sum(rate(app_requests_total[1h]))) > (14.4 * 0.001)
and
(sum(rate(app_requests_total{status=~"5.."}[5m])) / sum(rate(app_requests_total[5m]))) > (14.4 * 0.001)
```

## Monitoring Windows and EV

- **windows_exporter** exposes CPU, memory, disk, network, services and IIS metrics; scrape it with Prometheus, or use Azure Monitor / SCOM / Zabbix.
- Key EV checks: service states, indexing and archiving **queue lengths** (MSMQ), storage and index volume free space, SQL connectivity and blocking, event log errors from the EV source, certificate expiry, and synthetic **end-to-end** checks (search and retrieve a test item).
- **Blackbox probes** test from the outside: HTTP(S), TCP ports and DNS, which catches what internal metrics miss.

## The incident loop

Detect (alert) -> triage (dashboards, logs, traces) -> mitigate (roll back, restart, fail over) -> communicate -> resolve -> **blameless post-mortem** with action items. Observability exists to make that loop short.

<!-- deeper -->
## A worked solution and common mistakes

```run
python3 - <<'PY'
slo = 0.999                      # 99.9% of searches succeed within 2 seconds
days = 30
minutes = days * 24 * 60
budget = (1 - slo) * minutes
print(f"error budget over {days} days: {budget:.1f} minutes of bad service")
for burn in (14.4, 6, 1):
    hours_to_empty = days * 24 / burn
    print(f"burning at {burn:>4}x: budget gone in {hours_to_empty:6.1f} hours")
PY
```

A sensible pair of alerts: **page** when the budget burns at ~14x for 5 minutes (it would be gone in about 2 days), and open a **ticket** when it burns at ~1x over 6 hours (slow leak). The **SLI** here is "fraction of search requests that succeed in under 2 seconds".

:::warn Common mistakes
- **100% targets.** They leave no budget for change and cannot be met.
- **SLOs on things users do not notice** (server CPU).
- **No agreed action when the budget is exhausted** (slow down releases, fix reliability).
- **Logs, metrics and traces collected separately** with no shared request ID to connect them.
:::
<!-- /deeper -->

:::recap
- Logs: structured, centralised, no secrets, linked by `trace_id`. Stacks: agent plus Loki/ELK/Splunk plus Grafana/Kibana.
- Traces show where time goes across services; OpenTelemetry is the standard.
- Dashboards: golden signals first, SLO lines, templating, kept in Git.
- SLO and error budget turn reliability into numbers; alert on burn rate.
:::

:::try Your turn
For the EV search service pick an SLI, a 30-day SLO, compute its error budget in minutes, and propose one page alert and one ticket alert (with the thresholds).
:::

:::quiz
? Why emit structured (JSON) logs?
+ Fields can be filtered and aggregated reliably
- They are smaller
- They need no agent
- They are secret
! Free text needs fragile parsing.
? What is an error budget?
+ The allowed unreliability: 100% minus the SLO
- Money for fixing bugs
- The log size limit
- The number of alerts
! Spend it on change; stop when it runs out.
? What does a trace show that a metric does not?
+ Where time was spent within one request across services
- The CPU load
- The disk usage
- The number of servers
! Spans give per-request detail.
:::
