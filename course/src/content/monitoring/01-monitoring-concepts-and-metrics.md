---
track: monitoring
title: Monitoring concepts and metrics
short: Concepts, metrics
sub: What to measure and why: the golden signals, metric types, and exposing your first metrics.
---

:::goals
- explain monitoring versus observability, and metrics, logs and traces
- apply the four golden signals and the USE and RED methods
- describe counters, gauges and histograms
- write a small exporter and read the Prometheus text format
:::

## Why monitor

You cannot run what you cannot see. Monitoring tells you **that** something is wrong (and ideally before users notice), observability helps you work out **why**. Good monitoring answers: is it up, is it fast, is it correct, is it filling up, and is it getting worse?

| Pillar | What | Good for | Tools |
|---|---|---|---|
| **Metrics** | numbers over time (CPU %, requests per second, queue length) | trends, alerts, dashboards; cheap to store | Prometheus, CloudWatch, Azure Monitor, Zabbix |
| **Logs** | timestamped event text | the detail of a specific failure | Loki, ELK/OpenSearch, Splunk |
| **Traces** | the path of one request across services | finding which service is slow | Jaeger, Tempo, OpenTelemetry |

Start with metrics (cheap, fast, alertable), add logs for detail, add traces when you have many services.

## What to measure

**The four golden signals** (Google SRE) for any service:

| Signal | Question | Example |
|---|---|---|
| **Latency** | how long do requests take? (separate success from errors) | 95th percentile response time |
| **Traffic** | how much demand? | requests per second, items archived per hour |
| **Errors** | how many fail? | HTTP 5xx rate, failed indexing tasks |
| **Saturation** | how full is it? | CPU, memory, disk, queue length |

Two simple methods built on them:

- **RED** (for services): **R**ate, **E**rrors, **D**uration.
- **USE** (for resources like CPU, disks, network): **U**tilisation, **S**aturation, **E**rrors.

For an EV environment: indexing queue length and age (saturation), items archived per minute (traffic), failed archive tasks (errors), search latency, SQL connection errors, free disk on index and store volumes, certificate expiry, and service up/down.

## Metric types

| Type | Meaning | Example | Rule |
|---|---|---|---|
| **Counter** | only goes up (resets on restart) | `requests_total`, `errors_total` | query with `rate()` |
| **Gauge** | goes up and down | `memory_used_bytes`, `queue_length` | read directly |
| **Histogram** | counts observations in buckets | request durations | compute percentiles with `histogram_quantile()` |
| **Summary** | pre-computed percentiles on the client | rarely used | cannot aggregate across instances |

Metrics have **labels** (dimensions): `http_requests_total{method="GET", status="500"}`. Each distinct label combination is a separate time series. Keep label values low-cardinality (do not put user IDs or full URLs in labels).

## The exposition format

Prometheus **pulls**: it scrapes an HTTP endpoint (conventionally `/metrics`) that returns plain text. Any program can expose metrics. We write a tiny exporter that reads Linux's `/proc` (the same source tools like `node_exporter` use):

@setup prom

```run
mkdir -p ~/lab/mon && cd ~/lab/mon
cat > node_exporter.py <<'EOF'
import http.server

def meminfo():
    out = {}
    for line in open("/proc/meminfo"):
        k, v = line.split(":")
        out[k] = int(v.split()[0]) * 1024        # kB -> bytes
    return out

def metrics():
    m = meminfo()
    load1, load5, load15 = open("/proc/loadavg").read().split()[:3]
    lines = [
        "# HELP lab_load1 1 minute load average",
        "# TYPE lab_load1 gauge",
        f"lab_load1 {load1}",
        "# HELP lab_memory_total_bytes Total memory",
        "# TYPE lab_memory_total_bytes gauge",
        f"lab_memory_total_bytes {m['MemTotal']}",
        "# HELP lab_memory_available_bytes Memory available for new processes",
        "# TYPE lab_memory_available_bytes gauge",
        f"lab_memory_available_bytes {m['MemAvailable']}",
    ]
    return "\n".join(lines) + "\n"

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/metrics":
            body = metrics().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()
    def log_message(self, *a): pass

http.server.HTTPServer(("127.0.0.1", 9101), H).serve_forever()
EOF
python3 node_exporter.py > /dev/null 2>&1 &
sleep 1
curl -s http://127.0.0.1:9101/metrics | sed -E 's/^(lab_[a-z_0-9]+) [0-9.]+$/\1 <value>/'
```

The format is line based: `# HELP` (description), `# TYPE` (counter, gauge, histogram), then `name{labels} value`. That is all Prometheus needs. Real exporters exist for almost everything: `node_exporter` (Linux hosts), `windows_exporter` (Windows: perfect for EV servers), `blackbox_exporter` (probe URLs and ports), `mysqld`/`postgres`/`mssql` exporters, `kube-state-metrics`, cAdvisor (containers). Your applications can use client libraries (`prometheus_client` for Python, and for Go, Java, .NET).

```run
curl -s http://127.0.0.1:9101/metrics | awk '/^lab_memory_total_bytes /{t=$2} /^lab_memory_available_bytes /{a=$2} END{p=(t-a)/t*100; print (p>=0 && p<=100) ? "memory utilisation derived from two gauges is within 0-100%" : "unexpected value"}'
kill %1
```

Memory utilisation `= (total - available) / total`, a typical derived metric you will write in PromQL in the next lesson.

## Pull versus push

| | Pull (Prometheus) | Push (Graphite, StatsD, CloudWatch agent) |
|---|---|---|
| Who initiates | the monitoring server scrapes targets | the app sends data |
| Detect a dead target | yes: the scrape fails, `up == 0` | harder: silence is ambiguous |
| Short-lived jobs | need the **Pushgateway** | natural |

Pull has a built-in health check: if a target does not answer, you know immediately.

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- Metrics, logs and traces complement each other. Start with metrics.
- Golden signals: latency, traffic, errors, saturation. RED for services, USE for resources.
- Counters (use `rate`), gauges, histograms (percentiles). Labels add dimensions; avoid high cardinality.
- Exporters expose `/metrics` in a simple text format that Prometheus scrapes.
:::

:::try Your turn
Add a metric `lab_uptime_seconds` (read `/proc/uptime`) to the exporter and show it with `curl`.
:::

:::quiz
? Which are the four golden signals?
+ Latency, traffic, errors, saturation
- CPU, memory, disk, network
- Logs, metrics, traces, alerts
- Uptime, cost, speed, size
! They describe user-visible health of a service.
? How should you read a counter?
+ As a rate over time (`rate()`), since the raw value only grows
- As its raw value
- As a percentile
- It cannot be read
! Counters reset on restart; rate handles that.
? What does "pull" monitoring give you for free?
+ A health check: an unreachable target is visible as `up == 0`
- Faster apps
- Encryption
- Free storage
! Scrape failure is a signal.
:::
