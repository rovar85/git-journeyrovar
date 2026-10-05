---
track: monitoring
title: Prometheus and PromQL
short: Prometheus, PromQL
sub: Run a real Prometheus, scrape targets, and ask questions with the PromQL query language.
---

:::goals
- explain Prometheus' architecture
- configure scrape targets and check them
- write PromQL: selectors, `rate`, aggregation, arithmetic
- query through the HTTP API
:::

## Architecture

| Part | Job |
|---|---|
| **Prometheus server** | scrapes targets on a schedule, stores samples in a time-series database, evaluates rules, answers queries |
| **Exporters / instrumented apps** | expose `/metrics` |
| **Service discovery** | finds targets automatically (Kubernetes, cloud tags, DNS) |
| **Alertmanager** | receives alerts from Prometheus; groups, de-duplicates, silences and routes them (email, Slack, PagerDuty) |
| **Grafana** | dashboards over Prometheus (and logs, traces) |

Everything is configured in YAML. (Exporters must send a valid `Content-Type` header, which is why the example code sets one: Prometheus refuses to ingest a response without it.) We run a real Prometheus (loopback only) scraping itself and our exporter, with a fast 2 second interval so the lab is quick (production uses 15 to 60 seconds).

@setup prom

```run
mkdir -p ~/lab/mon && cd ~/lab/mon
cat > node_exporter.py <<'EOF'
import http.server
def meminfo():
    out = {}
    for line in open("/proc/meminfo"):
        k, v = line.split(":"); out[k] = int(v.split()[0]) * 1024
    return out
def metrics():
    m = meminfo()
    load1 = open("/proc/loadavg").read().split()[0]
    return (f"# TYPE lab_load1 gauge\nlab_load1 {load1}\n"
            f"# TYPE lab_memory_total_bytes gauge\nlab_memory_total_bytes {m['MemTotal']}\n"
            f"# TYPE lab_memory_available_bytes gauge\nlab_memory_available_bytes {m['MemAvailable']}\n")
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = metrics().encode() if self.path == "/metrics" else b""
        self.send_response(200 if body else 404)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")   # Prometheus insists on a valid type
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", 9101), H).serve_forever()
EOF
python3 node_exporter.py > /dev/null 2>&1 &
cat > prometheus.yml <<'EOF'
global:
  scrape_interval: 2s
scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["127.0.0.1:9090"]
  - job_name: lab-node
    static_configs:
      - targets: ["127.0.0.1:9101"]
        labels: {site: london}
EOF
docker rm -f prometheus > /dev/null 2>&1
docker run -d --name prometheus --network host -v ~/lab/mon:/cfg prom/prometheus --config.file=/cfg/prometheus.yml --web.listen-address=127.0.0.1:9090 --storage.tsdb.path=/prometheus > /dev/null
sleep 12
curl -s $PROM/-/ready
```

`static_configs` lists targets by hand; in real life use service discovery (`kubernetes_sd_configs`, `ec2_sd_configs`, `file_sd_configs`). The optional `labels` add dimensions to everything scraped from that target.

## Check the targets

```run
curl -s $PROM/api/v1/targets | python3 -c '
import sys, json
for t in json.load(sys.stdin)["data"]["activeTargets"]:
    print(t["labels"]["job"], t["health"], t["scrapeUrl"])' | sort
```

The most important metric Prometheus makes is **`up`**: 1 if the last scrape worked, 0 if not.

```run
promq 'up'
```

## PromQL basics

A query returns an **instant vector** (one value per series now) or a **range vector** (a window of values, written `[5s]`). Instant queries run through the API `/api/v1/query`; our helper `promq` prints them.

```run
echo "--- a selector with a label match"
promq 'up{job="lab-node"}'
echo "--- a gauge (value varies per machine, so we test it)"
promq 'lab_memory_available_bytes > 0'
echo "--- arithmetic between series: memory used percentage is between 0 and 100"
promq '(lab_memory_total_bytes - lab_memory_available_bytes) / lab_memory_total_bytes * 100 < 100'
echo "--- how many series does this Prometheus hold? (a count)"
promq 'count({job="lab-node"})'
```

Label matchers: `=` equal, `!=`, `=~` regex match, `!~` regex not-match. `{job=~"lab.*"}`. Comparison operators **filter** (a query ending with `> 0` returns only series where the condition is true), which is how alert rules work: an alert fires when its expression returns something.

### rate: the counter function

Prometheus exposes counters about itself, such as `prometheus_http_requests_total`. `rate(counter[window])` gives the per-second average increase over the window:

```run
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null $PROM/api/v1/query?query=up; done
sleep 6
promq 'sum(rate(prometheus_http_requests_total{handler="/api/v1/query"}[10s])) > 0'
```

We generated some requests, and `rate` shows requests per second to the query endpoint (greater than zero is all we assert, because the exact value depends on timing). Rules of thumb: use `rate()` on counters (never graph a raw counter), choose a window of at least four times the scrape interval, and `increase()` gives the total increase over the window.

### Aggregation

```run
echo "--- sum by a label"
promq 'sum by (handler) (rate(prometheus_http_requests_total[10s])) > 0' | sed -E 's/  [0-9.]+$//' | sort | head -3
echo "--- min / max / avg over time of a gauge (value is positive)"
promq 'avg_over_time(lab_memory_available_bytes[10s]) > 0'
echo "--- the number of targets that are up"
promq 'sum(up)'
```

Common aggregators: `sum`, `avg`, `min`, `max`, `count`, `topk(3, ...)`, with `by (label)` or `without (label)`. Typical dashboards combine them: `topk(5, sum by (instance) (rate(...)))`.

## The HTTP API and range queries

Dashboards use **range queries**: values over a time span, in steps:

```run
end=$(date +%s); start=$((end-10))
curl -s --data-urlencode 'query=up{job="lab-node"}' -d "start=$start" -d "end=$end" -d step=2 $PROM/api/v1/query_range | python3 -c '
import sys, json
d = json.load(sys.stdin)
vals = d["data"]["result"][0]["values"]
print("range query returned", len(vals), "points, all equal to 1:", all(v[1] == "1" for v in vals))'
```

The API is how Grafana, scripts and CI checks talk to Prometheus. The web UI at `/graph` offers an expression browser for experiments.

## Storage and retention

Prometheus stores data locally (default 15 days, `--storage.tsdb.retention.time`). It is a **single-node** system designed for reliability of monitoring itself; for long-term storage or multiple servers use remote write to Thanos, Mimir or Cortex, or a managed service (Amazon Managed Prometheus, Azure Monitor managed Prometheus, Grafana Cloud).

```run
kill %1
```

:::recap
- Prometheus scrapes `/metrics` endpoints defined in `prometheus.yml`; `up` shows target health.
- PromQL: selectors with label matchers, `rate()` for counters, aggregations (`sum by`), arithmetic, and comparison filters.
- The HTTP API serves instant and range queries to dashboards and scripts.
- Local storage with retention; use remote storage for long-term needs.
:::

:::try Your turn
Write a query for the percentage of memory used on the lab node and check that it is between 0 and 100 using a comparison filter.
:::

:::quiz
? What does `up == 0` mean?
+ The last scrape of that target failed
- The target is fast
- Zero requests
- Prometheus is stopped
! A built-in health signal.
? Why use `rate()` on a counter?
+ A counter only increases; rate shows the per-second change
- It makes counters smaller
- It converts to a gauge name
- It is required for gauges
! Raw counters are not useful to graph.
? What does `sum by (handler) (...)` do?
+ Adds the values grouped by the `handler` label
- Sorts by handler
- Deletes handler
- Renames handler
! Aggregation keeps only the listed labels.
:::
