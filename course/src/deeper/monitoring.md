=== monitoring/01
## A worked solution and common mistakes

```run
python3 - <<'PY'
uptime = float(open("/proc/uptime").read().split()[0])
print("# HELP lab_uptime_seconds Seconds since the machine booted.")
print("# TYPE lab_uptime_seconds gauge")
print(f"lab_uptime_seconds {uptime}")
PY
```

This is the Prometheus **text format**: a `HELP` line, a `TYPE` line, then `name value`. Uptime goes up and down across reboots, so it is a **gauge**. (A value that only ever increases, like requests served, would be a **counter**.)

:::warn Common mistakes
- **Using a gauge for something that only increases,** or a counter for something that can fall.
- **Naming without units** (`latency` instead of `request_duration_seconds`).
- **Labels with unlimited values** (user IDs, email addresses, URLs with IDs). Each value creates a new time series and can overload Prometheus.
- **Measuring only machine health** (CPU, memory) and not what users experience (errors, latency).
:::

=== monitoring/02
## Answer and common mistakes

Percentage of memory used on a node with the standard `node_exporter` metrics:

```promql
100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
```

Adding `> 0 < 100` (or `and ... > 0`) as comparison filters returns the value only when it is in range; an empty result means the filter excluded it. Use `MemAvailable`, not `MemFree`: Linux uses free memory for cache, so `MemFree` is always small and misleading.

:::warn Common mistakes
- **Taking `rate()` of a gauge,** or forgetting `rate()` on a counter (a raw counter only goes up).
- **Too short a range window** (`[10s]` with a 15 s scrape interval returns nothing). Use at least four times the interval.
- **Averaging percentages.** Average the underlying sums and counts instead.
- **Aggregating away the label you need.** `sum by (job)` keeps only `job`.
:::

=== monitoring/03
## Answer and common mistakes

An alert rule that fires when traffic stops:

```yaml
groups:
- name: traffic
  rules:
  - alert: NoTraffic
    expr: sum(rate(lab_requests_total[10s])) == 0
    for: 10s
    labels: {severity: page}
    annotations: {summary: "No requests for 10 seconds"}
```

An alert moves through **inactive, pending** (condition true, waiting out `for:`) and **firing**. The `for:` delay prevents a single blip from paging someone.

:::warn Common mistakes
- **Alerting on causes** (CPU 80%) instead of **symptoms users feel** (errors, latency).
- **No `for:` duration,** so every spike pages.
- **Alerts with no action:** if nobody knows what to do, it should be a dashboard, not a page.
- **Not testing the alert** by making the condition true on purpose, as you just did.
:::

=== monitoring/04
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
