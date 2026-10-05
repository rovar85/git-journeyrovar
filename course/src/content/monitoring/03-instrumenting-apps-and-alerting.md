---
track: monitoring
title: Instrumenting an app, RED metrics and alert rules
short: Instrument, alert
sub: Add metrics to your own service, compute rate, errors and latency percentiles, and watch a real alert go from pending to firing.
---

:::goals
- instrument a service with a counter and a histogram
- compute request rate, error ratio and latency percentiles in PromQL
- write recording and alerting rules
- understand alert states and good alert design
:::

@setup prom

## An instrumented service

We write a small web service that counts requests by status and measures request durations in a **histogram**. Real code would use `prometheus_client` (`Counter`, `Histogram`), but the output format is exactly what we hand-write here.

```run
mkdir -p ~/lab/mon3 && cd ~/lab/mon3
cat > app.py <<'EOF'
import http.server, os, random, threading, time

BUCKETS = [0.05, 0.1, 0.25, 0.5, 1.0]
lock = threading.Lock()
requests = {}                       # status -> count
buckets = [0] * len(BUCKETS)        # cumulative bucket counts
dur_count, dur_sum = 0, 0.0

def observe(seconds):
    global dur_count, dur_sum
    dur_count += 1; dur_sum += seconds
    for i, b in enumerate(BUCKETS):
        if seconds <= b: buckets[i] += 1

def render():
    out = ["# TYPE app_requests_total counter"]
    for st, n in sorted(requests.items()):
        out.append(f'app_requests_total{{status="{st}"}} {n}')
    out.append("# TYPE app_request_duration_seconds histogram")
    for b, c in zip(BUCKETS, buckets):
        out.append(f'app_request_duration_seconds_bucket{{le="{b}"}} {c}')
    out.append(f'app_request_duration_seconds_bucket{{le="+Inf"}} {dur_count}')
    out.append(f"app_request_duration_seconds_sum {dur_sum:.4f}")
    out.append(f"app_request_duration_seconds_count {dur_count}")
    return "\n".join(out) + "\n"

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/metrics":
            body = render().encode(); self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
            self.end_headers(); self.wfile.write(body); return
        start = time.time()
        broken = os.path.exists("broken.flag")
        time.sleep(random.uniform(0.01, 0.4 if broken else 0.08))   # slower when broken
        status = 500 if (broken and random.random() < 0.6) else 200
        with lock:
            requests[status] = requests.get(status, 0) + 1
            observe(time.time() - start)
        self.send_response(status); self.end_headers(); self.wfile.write(b"ok\n")
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", 9102), H).serve_forever()
EOF
rm -f broken.flag
python3 app.py > /dev/null 2>&1 &
sleep 1
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:9102/; done
curl -s http://127.0.0.1:9102/metrics | grep -E '^app_requests_total|_count '
```

The **histogram** is cumulative: `le="0.1"` is "number of requests that took 0.1 seconds or less". Prometheus can estimate percentiles from the bucket counts. Choose buckets around your latency targets.

## Rules: recording and alerting

```run
cd ~/lab/mon3
cat > rules.yml <<'EOF'
groups:
  - name: app
    interval: 2s
    rules:
      # Recording rules: precompute expensive/common expressions under a clear name
      - record: app:request_rate:rate10s
        expr: sum(rate(app_requests_total[10s]))
      - record: app:error_ratio:rate10s
        expr: sum(rate(app_requests_total{status=~"5.."}[10s])) / sum(rate(app_requests_total[10s]))
      - record: app:latency_p95:10s
        expr: histogram_quantile(0.95, sum by (le) (rate(app_request_duration_seconds_bucket[10s])))
      # Alerting rules
      - alert: HighErrorRatio
        expr: app:error_ratio:rate10s > 0.2
        for: 6s                         # must stay true this long before firing
        labels: {severity: page}
        annotations:
          summary: "More than 20% of requests are failing"
          runbook: "https://wiki.example.com/runbooks/app-errors"
      - alert: SlowRequests
        expr: app:latency_p95:10s > 0.25
        for: 6s
        labels: {severity: ticket}
        annotations: {summary: "95th percentile latency above 250 ms"}
      - alert: AppDown
        expr: up{job="app"} == 0
        for: 6s
        labels: {severity: page}
EOF
cat > prometheus.yml <<'EOF'
global:
  scrape_interval: 2s
rule_files: ["/cfg/rules.yml"]
scrape_configs:
  - job_name: app
    static_configs:
      - targets: ["127.0.0.1:9102"]
EOF
docker rm -f prometheus > /dev/null 2>&1
docker run -d --name prometheus --network host -v ~/lab/mon3:/cfg prom/prometheus --config.file=/cfg/prometheus.yml --web.listen-address=127.0.0.1:9090 --storage.tsdb.path=/prometheus > /dev/null
sleep 10
curl -s $PROM/api/v1/rules | python3 -c '
import sys, json
for g in json.load(sys.stdin)["data"]["groups"]:
    for r in g["rules"]:
        print(r["type"], r["name"], r["health"])'
```

- **Recording rules** (`record:`) store the result of an expression as a new metric. Naming convention `level:metric:operations`. They speed up dashboards and keep complex expressions in one place.
- **Alerting rules** (`alert:`) fire when `expr` returns results for at least `for:` duration (avoids alerts on blips). `labels` route the alert; `annotations` explain it, with a link to a **runbook**.

## Healthy traffic: nothing fires

```run
cd ~/lab/mon3
cat > traffic.sh <<'EOF'
#!/bin/bash
# about 20 requests per second until killed
while true; do for i in 1 2 3 4 5; do curl -s -o /dev/null http://127.0.0.1:9102/ & done; sleep 0.25; done
EOF
chmod +x traffic.sh
./traffic.sh > /dev/null 2>&1 &
traffic=$!
sleep 14
echo "request rate above 5/s:    $(promq 'app:request_rate:rate10s > 5' | grep -c .)"
echo "5xx responses recorded so far: $(curl -s http://127.0.0.1:9102/metrics | grep -c 'status="500"')"
echo "p95 latency under 100 ms:  $(promq 'app:latency_p95:10s < 0.1' | grep -c .)"
curl -s $PROM/api/v1/alerts | python3 -c 'import sys,json; print("active alerts:", len(json.load(sys.stdin)["data"]["alerts"]))'
```

`1` means the condition returned a result (true); the 5xx line counts error series, and `0` means none exist yet (so the error-ratio expression has nothing to divide and returns no data). With healthy traffic there are no alerts.

## Break the service: pending, then firing

```run
cd ~/lab/mon3
touch broken.flag
sleep 8
curl -s $PROM/api/v1/alerts | python3 -c '
import sys, json
for a in sorted(json.load(sys.stdin)["data"]["alerts"], key=lambda a: a["labels"]["alertname"]):
    print(a["labels"]["alertname"], "->", a["state"])'
sleep 10
echo "--- after waiting longer than the 'for' duration:"
curl -s $PROM/api/v1/alerts | python3 -c '
import sys, json
for a in sorted(json.load(sys.stdin)["data"]["alerts"], key=lambda a: a["labels"]["alertname"]):
    print(a["labels"]["alertname"], "->", a["state"], "| severity", a["labels"]["severity"])'
echo "error ratio is above 20%:  $(promq 'app:error_ratio:rate10s > 0.2' | grep -c .)"
echo "p95 latency above 250 ms:  $(promq 'app:latency_p95:10s > 0.25' | grep -c .)"
```

The first listing shows alerts **pending** (the condition is true but the `for:` time has not elapsed); the second shows them **firing**. That is the lifecycle: **inactive, pending, firing**. Prometheus sends firing alerts to **Alertmanager**, which groups, de-duplicates, silences and routes them. The routing config looks like this (**Example, not run here**):

```yaml:alertmanager.yml (Example, not run here)
route:
  receiver: team-slack
  group_by: [alertname]
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - matchers: [severity="page"]
      receiver: oncall-pager
receivers:
  - name: oncall-pager
    pagerduty_configs: [{routing_key: "<secret from a vault>"}]
  - name: team-slack
    slack_configs: [{channel: "#ev-alerts", send_resolved: true}]
inhibit_rules:
  - source_matchers: [alertname="AppDown"]
    target_matchers: [severity="ticket"]
    equal: [job]
```

`inhibit_rules` suppress noisy secondary alerts when a root-cause alert is firing.

## Fix it: the alert resolves

```run
cd ~/lab/mon3
rm broken.flag
sleep 22
curl -s $PROM/api/v1/alerts | python3 -c 'import sys,json; print("active alerts after the fix:", len(json.load(sys.stdin)["data"]["alerts"]))'
echo "error ratio back to zero: $(promq 'app:error_ratio:rate10s == 0' | grep -c .)"
kill $traffic 2>/dev/null; kill %1 %2 2>/dev/null; true
docker rm -f prometheus > /dev/null
```

## What makes a good alert

| Principle | Why |
|---|---|
| Alert on **symptoms users feel** (errors, latency, saturation approaching), not every cause | fewer, more meaningful pages |
| Every page is **actionable** and links a **runbook** | no "something is wrong, good luck" |
| Use `for:` and sensible thresholds; alert on **rate over time**, not one spike | avoid flapping |
| Separate **page** (wake someone) from **ticket** (look tomorrow) | protect sleep and attention |
| Track **SLOs** and alert on **burn rate** (consuming the error budget too fast) | alerts tied to business impact |
| Review and delete noisy alerts | **alert fatigue** makes people ignore real ones |

:::recap
- Instrument apps with a counter by status and a duration histogram; keep label cardinality low.
- RED in PromQL: `rate` of requests, error ratio, `histogram_quantile` for latency percentiles.
- Recording rules precompute; alerting rules fire after `for:`; states are inactive, pending, firing.
- Alertmanager routes, groups, silences. Alert on symptoms, link runbooks, avoid fatigue.
:::

:::try Your turn
Add an alert `NoTraffic` that fires when the request rate is zero for 10 seconds. Stop the traffic generator and watch it go pending, then firing.
:::

:::quiz
? What does `for: 6s` in an alert rule mean?
+ The condition must stay true for 6 seconds before the alert fires
- The alert lasts 6 seconds
- It is checked every 6 seconds only
- It delays resolution
! It prevents flapping alerts.
? Which function estimates a percentile from a histogram?
+ `histogram_quantile`
- `avg`
- `rate`
- `topk`
! Apply it to the rate of the `_bucket` series.
? Why link a runbook in an alert?
+ So the responder knows what to check and do
- To make the alert longer
- Prometheus needs it
- To skip Alertmanager
! Actionable alerts are good alerts.
:::
