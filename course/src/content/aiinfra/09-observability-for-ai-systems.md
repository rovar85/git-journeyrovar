---
track: aiinfra
title: Observability for AI systems: Prometheus, Grafana and OpenTelemetry
short: AI observability
sub: What to measure on GPUs and inference servers, a real Prometheus catching a simulated inference slowdown with SLO alerts, OpenTelemetry traces of one request, and dashboards.
---

:::goals
- list the metrics that matter for latency, throughput, GPU use and errors, and where each comes from
- instrument a service with the Prometheus client and write recording and alerting rules for inference SLOs
- watch a real Prometheus detect a queue build-up and a nearly full KV cache
- record a trace with OpenTelemetry and read its spans and attributes
- describe how Grafana and the OpenTelemetry Collector fit in
:::

@setup prom

@setup pyml

:::note What ran and what did not
**Prometheus runs for real** (in Docker, as in the Monitoring track) and scrapes a **real exporter written with the Prometheus Python client**, but the exporter is a **simulation** of an inference server: it invents latencies and a "pressure" mode. There is no GPU or vLLM here. Metric names follow the common style; **vLLM and the NVIDIA DCGM exporter use their own names, which change between versions**, so check the `/metrics` page of the version you deploy. I **read the READMEs** of Prometheus, Grafana and the OpenTelemetry Collector. Grafana and the Collector are described but **not run**.
:::

## 1. The AI observability stack

The Monitoring track introduced the pillars. For AI systems each gets specific signals:

| Pillar | Tool | What you capture for AI |
|---|---|---|
| **Metrics** | **Prometheus** (and Grafana to see them) | TTFT and inter-token latency histograms, queue depth, running requests, KV cache usage, tokens per second, errors, **GPU** utilisation, memory, power, temperature |
| **Traces** | **OpenTelemetry** (collector, backend such as Tempo or Jaeger, or MLflow) | the path of one request: gateway, retrieval, model call, tool calls; tokens and model name as attributes |
| **Logs** | any log store (Loki, Elasticsearch) | errors, slow-request details; careful with prompts and personal data |
| **Quality** | evaluation, user feedback | answer quality, groundedness (lesson 5 of the AI field guide), drift |

The four things the roadmap in your screenshot asks you to observe are **latency, throughput, GPU utilisation and errors**. Where each comes from:

| Signal | Source |
|---|---|
| Latency (TTFT, ITL, end to end) | the **inference engine's** `/metrics` (vLLM and Triton both expose Prometheus metrics), plus **gateway** metrics for what users see |
| Throughput | engine token counters (`rate()` of tokens generated) |
| GPU utilisation, memory, power, temperature | the **DCGM exporter** (NVIDIA Data Center GPU Manager) scraped by Prometheus, or `nvidia-smi` for ad-hoc checks |
| Errors | engine and gateway request counters by status, plus Kubernetes events (OOMKilled, evictions) |

## 2. An instrumented inference server (simulated)

The exporter below uses the **real Prometheus client library**. Its numbers are simulated, with a "pressure" switch (a flag file) that mimics a KV cache filling up: queue grows, time to first token rises, errors appear.

```run
mkdir -p ~/lab/aiobs && cd ~/lab/aiobs
cat > exporter.py <<'EOF'
import os, random, threading, time
from prometheus_client import Counter, Gauge, Histogram, start_http_server

REQS    = Counter("llm_requests_total", "Requests by outcome", ["status"])
PROMPT  = Counter("llm_prompt_tokens_total", "Prompt tokens processed")
GEN     = Counter("llm_generation_tokens_total", "Output tokens generated")
TTFT    = Histogram("llm_time_to_first_token_seconds", "Time to first token", buckets=[0.1, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 2.5, 5])
ITL     = Histogram("llm_inter_token_latency_seconds", "Gap between output tokens", buckets=[0.01, 0.02, 0.05, 0.1, 0.25, 0.5])
RUNNING = Gauge("llm_requests_running", "Requests being decoded")
WAITING = Gauge("llm_requests_waiting", "Requests queued")
KV      = Gauge("llm_kv_cache_usage_ratio", "Fraction of KV cache blocks in use")
GPU     = Gauge("gpu_utilization_percent", "GPU utilisation (a DCGM exporter would give DCGM_FI_DEV_GPU_UTIL)")

def step():
    pressure = os.path.exists("pressure.flag")
    ttft = random.uniform(1.0, 3.0) if pressure else random.uniform(0.15, 0.4)
    itl = random.uniform(0.08, 0.2) if pressure else random.uniform(0.018, 0.03)
    TTFT.observe(ttft); ITL.observe(itl)
    REQS.labels("504" if (pressure and random.random() < 0.08) else "200").inc()
    PROMPT.inc(random.randint(200, 2000)); GEN.inc(random.randint(50, 300))
    RUNNING.set(random.randint(60, 64) if pressure else random.randint(20, 40))
    WAITING.set(random.randint(25, 60) if pressure else random.randint(0, 3))
    KV.set(random.uniform(0.93, 0.99) if pressure else random.uniform(0.4, 0.6))
    GPU.set(random.uniform(97, 100) if pressure else random.uniform(60, 80))

def loop():
    while True:
        for _ in range(5): step()
        time.sleep(0.2)

threading.Thread(target=loop, daemon=True).start()
start_http_server(9103, addr="127.0.0.1")
time.sleep(10**6)
EOF
rm -f pressure.flag
python3 exporter.py > /dev/null 2>&1 &
echo $! > exporter.pid
sleep 3
curl -s http://127.0.0.1:9103/metrics | grep -E '^(llm_requests_total|llm_requests_waiting|llm_kv_cache_usage_ratio|gpu_utilization_percent)'
```

Histograms are the right type for latency: they store **counts per bucket**, so Prometheus can compute percentiles **across many servers** later. Choose bucket edges **around your SLO targets** (here 0.5 s for TTFT, 0.05 s for ITL), or the percentile estimates will be coarse where it matters. (With only one bucket between 0.25 s and 0.5 s, Prometheus interpolates linearly inside it and reported a healthy p95 near 0.48 s, almost on the SLO line, when the true value was about 0.39 s. Adding edges at 0.3 and 0.4 fixed that.)

## 3. Prometheus: rules for inference SLOs

Recording rules compute the percentiles; alerting rules turn the SLO and the leading indicators into pages:

```run
cd ~/lab/aiobs
cat > rules.yml <<'EOF'
groups:
  - name: inference
    interval: 2s
    rules:
      - record: llm:ttft_p95:10s
        expr: histogram_quantile(0.95, sum by (le) (rate(llm_time_to_first_token_seconds_bucket[10s])))
      - record: llm:itl_p95:10s
        expr: histogram_quantile(0.95, sum by (le) (rate(llm_inter_token_latency_seconds_bucket[10s])))
      - record: llm:tokens_per_second:10s
        expr: rate(llm_generation_tokens_total[10s])
      - record: llm:error_ratio:10s
        expr: sum(rate(llm_requests_total{status!="200"}[10s])) / sum(rate(llm_requests_total[10s]))
      # the SLO symptom: users wait too long for the first token
      - alert: TTFTSloBreach
        expr: llm:ttft_p95:10s > 0.5
        for: 6s
        labels: {severity: page}
        annotations: {summary: "p95 time to first token above the 0.5 s SLO"}
      # leading indicators: they fire before the SLO is badly broken
      - alert: RequestQueueBuilding
        expr: llm_requests_waiting > 20
        for: 6s
        labels: {severity: ticket}
        annotations: {summary: "More than 20 requests waiting: add replicas or shed load"}
      - alert: KVCacheNearlyFull
        expr: llm_kv_cache_usage_ratio > 0.9
        for: 6s
        labels: {severity: ticket}
        annotations: {summary: "KV cache above 90%: expect preemptions and rising latency"}
EOF
cat > prometheus.yml <<'EOF'
global:
  scrape_interval: 2s
rule_files: ["/cfg/rules.yml"]
scrape_configs:
  - job_name: llm
    static_configs:
      - targets: ["127.0.0.1:9103"]
EOF
docker rm -f prometheus > /dev/null 2>&1
docker run -d --name prometheus --network host -v ~/lab/aiobs:/cfg prom/prometheus --config.file=/cfg/prometheus.yml --web.listen-address=127.0.0.1:9090 --storage.tsdb.path=/prometheus > /dev/null
sleep 20
echo "--- healthy traffic"
promq 'llm:ttft_p95:10s'
promq 'llm:itl_p95:10s'
promq 'llm:tokens_per_second:10s'
promq 'llm_requests_waiting'
promq 'llm_kv_cache_usage_ratio'
cat > alerts.py <<'EOF'
import json, sys, urllib.request
alerts = json.load(urllib.request.urlopen("http://127.0.0.1:9090/api/v1/alerts"))["data"]["alerts"]
if not alerts:
    print("alerts firing or pending: none")
for a in sorted(alerts, key=lambda a: a["labels"]["alertname"]):
    name, sev, summary = a["labels"]["alertname"], a["labels"]["severity"], a["annotations"]["summary"]
    print(f"  {a['state']:8} {name:20} severity={sev}  {summary}")
EOF
python3 alerts.py
```

Note the design: the **page** is on the user-visible symptom (TTFT against its SLO) and the **tickets** are on leading indicators (queue and cache) that tell you **why** and **early**. This is the symptoms-versus-causes principle from the Monitoring track, and the Monitoring lesson on SLOs and burn rates shows how to make the paging alert smarter.

Now create pressure and watch the alerts:

```run
cd ~/lab/aiobs
touch pressure.flag
sleep 28
echo "--- under pressure"
promq 'llm:ttft_p95:10s'
promq 'llm_requests_waiting'
promq 'llm_kv_cache_usage_ratio'
promq 'llm:error_ratio:10s'
python3 alerts.py
```

The same chain you will see in production: the KV cache fills, the queue builds, time to first token climbs past the SLO, a few requests time out. In a real incident, the **leading** alerts (cache, queue) fire first and give time to scale (lesson 6), and the **SLO** alert tells you users are already hurting.

Clean up and then recover:

```run
cd ~/lab/aiobs
rm -f pressure.flag
sleep 22
echo "--- pressure removed"
promq 'llm:ttft_p95:10s'
python3 alerts.py
docker rm -f prometheus > /dev/null; kill $(cat exporter.pid)
```

## 4. GPU metrics

The simulation's `gpu_utilization_percent` stands for what a **DCGM exporter** gives you: per-GPU series such as utilisation, framebuffer (memory) used, power, temperature, and error counters, labelled by GPU and node. On Kubernetes the NVIDIA GPU Operator typically deploys it, and Prometheus scrapes it like any other target. Useful queries (Example, not run here; metric names are from the DCGM exporter and may differ by version):

```term
$ avg by (gpu) (DCGM_FI_DEV_GPU_UTIL)                          # which GPUs are idle (wasting money)?
$ DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE)   # memory pressure per GPU
$ max by (instance) (DCGM_FI_DEV_GPU_TEMP)                     # thermal throttling risk
$ sum(rate(vllm:generation_tokens_total[5m]))                  # tokens per second across the fleet
```

Read GPU utilisation **together** with power and token throughput (lesson 3): high utilisation with low power and low tokens per second suggests a memory-bound or starved GPU, not a happy one.

## 5. Traces with OpenTelemetry

Metrics tell you **that** requests got slow. A **trace** tells you **where one request spent its time**. **OpenTelemetry** (OTel) is the vendor-neutral standard for traces, metrics and logs. A trace is a tree of **spans**; each span has a name, a duration and **attributes**. For LLM calls, OTel defines (experimental, so check the current specification) **GenAI semantic conventions**: attributes such as the model name and input and output token counts.

```run
cd ~/lab/aiobs
cat > otel.py <<'EOF'
import time
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

exporter = InMemorySpanExporter()
provider = TracerProvider()
provider.add_span_processor(SimpleSpanProcessor(exporter))
tracer = trace.get_tracer("ev-search-assistant", tracer_provider=provider)

with tracer.start_as_current_span("POST /v1/answer") as root:
    root.set_attribute("tenant", "search-team")
    with tracer.start_as_current_span("retrieve"):
        time.sleep(0.04)
        trace.get_current_span().set_attribute("documents", 5)
    with tracer.start_as_current_span("llm.generate") as llm:
        time.sleep(0.15)
        llm.set_attribute("gen_ai.request.model", "llama-3.1-8b-instruct")
        llm.set_attribute("gen_ai.usage.input_tokens", 1840)
        llm.set_attribute("gen_ai.usage.output_tokens", 212)
    with tracer.start_as_current_span("tool.search_tickets"):
        time.sleep(0.02)

spans = exporter.get_finished_spans()
by_id = {s.context.span_id: s for s in spans}
root_span = next(s for s in spans if s.parent is None)
print(f"trace {root_span.context.trace_id:032x}"[:22] + "...")
for s in sorted(spans, key=lambda s: s.start_time):
    depth = 0 if s.parent is None else 1
    ms = (s.end_time - s.start_time) / 1e6
    extra = {k: v for k, v in s.attributes.items() if k.startswith(("gen_ai", "documents"))}
    print(f"{'  ' * depth}{s.name:22} {ms:6.0f} ms  {extra if extra else ''}")
EOF
python3 otel.py
```

Reading it: the request took about 210 ms in total, and **most of it is the model call**, whose attributes record the model and token counts. In a slow request you would see at once whether the time went to retrieval, the model, or a tool. Tokens as attributes let you compute **cost per request** and find expensive prompts.

The **OpenTelemetry Collector** (README: a vendor-agnostic way to **receive, process and export** telemetry, removing the need to run several agents) sits between your applications and your backends. Applications send OTLP to it; it batches, filters, adds attributes and forwards to Prometheus, Tempo, Jaeger, a vendor or MLflow (Example, not run here):

```yaml:otel-collector.yaml (Example, not run here)
receivers:
  otlp:
    protocols: {grpc: {}, http: {}}
processors:
  batch: {}
  attributes/redact:                 # drop sensitive attributes before they leave the cluster
    actions: [{key: gen_ai.prompt, action: delete}]
exporters:
  otlp/tempo: {endpoint: tempo.monitoring:4317, tls: {insecure: true}}
  prometheus: {endpoint: 0.0.0.0:8889}
service:
  pipelines:
    traces:  {receivers: [otlp], processors: [attributes/redact, batch], exporters: [otlp/tempo]}
    metrics: {receivers: [otlp], processors: [batch], exporters: [prometheus]}
```

:::warn Prompts are data
Traces and logs that capture **prompts and answers** can contain customer data and secrets. Decide what to record, **redact or sample**, set retention, and restrict access. The collector is a good place to enforce it.
:::

## 6. Grafana: dashboards

From its README, **Grafana** lets you **query, visualise, alert on and understand** metrics wherever they are stored, with template variables, mixed data sources, Explore for metrics and logs, and alerting to Slack, PagerDuty and similar. It reads Prometheus, a trace store and a log store in one place, so one dashboard can show a latency spike, the matching traces and the logs of the pod that caused it.

An inference dashboard usually has four rows, each answering one question (Example panels, not run here):

| Row | Question | Panel queries (from the rules above) |
|---|---|---|
| **Users** | is the SLO met? | `llm:ttft_p95:10s`, `llm:itl_p95:10s`, `llm:error_ratio:10s` |
| **Load** | how busy is it? | `llm:tokens_per_second:10s`, `sum(rate(llm_requests_total[1m]))`, `llm_requests_running` |
| **Capacity** | how close to the edge? | `llm_requests_waiting`, `llm_kv_cache_usage_ratio`, replicas |
| **Hardware** | is the GPU healthy and used? | GPU utilisation, memory, power, temperature per GPU |

Keep dashboards in Git (as JSON or generated code) and deploy them with GitOps (lesson 7), so they are reviewed and reproducible like everything else.

:::warn Common mistakes
- **Only GPU utilisation on the dashboard.** It does not say whether users are served well; put SLO latency first.
- **Histogram buckets that miss your SLO.** If no bucket edge sits near 0.5 s, your p95 estimate around the SLO is useless.
- **High-cardinality labels** (user ID, prompt text, request ID on a metric). Prometheus memory explodes; put those details in traces and logs.
- **Alerting on causes only, or on symptoms only.** Page on the SLO; ticket on leading indicators.
- **Logging full prompts by default.** Privacy and cost; redact and sample.
- **No correlation.** Put a request or trace ID in logs and attach exemplars so you can jump from a slow bucket to a trace.
:::

:::recap
- Observe **latency (TTFT, ITL), throughput (tokens per second), GPU use and errors**, from the engine's `/metrics`, a DCGM exporter and the gateway.
- Use **histograms** with buckets around your SLOs; compute percentiles in **recording rules**; **page** on the SLO, **ticket** on queue and KV-cache indicators.
- **OpenTelemetry** traces show where one request spent its time and carry model and token attributes; the **Collector** receives, processes (redacts) and exports.
- **Grafana** brings metrics, traces and logs together; keep dashboards in Git.
:::

:::try Your turn
Add an alert `HighGPUUtilisationWithLowThroughput` to `rules.yml` that fires when `gpu_utilization_percent > 90` and `llm:tokens_per_second:10s` is below 20000, then check the rule loads (`curl $PROM/api/v1/rules`). In `otel.py`, add a span `rerank` as a child of `retrieve` and print it with the right indentation.
:::

:::quiz
? Why page on TTFT p95 against its SLO but only ticket on KV cache usage?
+ TTFT is the user-visible symptom; cache usage is an early indicator that gives time to act
- The cache is unimportant
- Tickets are louder
- Prometheus cannot alert on gauges
! Page on symptoms, ticket on leading causes.
? What does a trace give you that a latency histogram does not?
+ The breakdown of where one request spent its time across components
- A percentile
- A GPU temperature
- A cost estimate for a month
! Traces show the path of a single request.
? Why avoid putting a request ID in a Prometheus label?
+ Every distinct value creates a new time series, exploding memory
- IDs are secret
- Labels must be numbers
- Prometheus forbids strings
! Keep high-cardinality data in traces and logs.
:::
