---
track: qbank
title: "Monitoring, observability, SRE and scale design: Basic questions"
short: SRE basic
sub: 7 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Which monitoring and logging tools have you worked with (Prometheus, Grafana, ELK, Loki, Datadog)?

<!-- source: 08 Q1 -->

*Also asked as:* What monitoring tools have you used? Have you worked with Prometheus, Grafana or ELK Stack?

:::note In simple words
Monitoring tools are the dashboard and warning lights of a car. Prometheus measures the numbers (speed, fuel), Loki/ELK keeps the diary of what happened, and Grafana is the screen where you look at all of it.
:::

Group the tools by the job they do, so the answer sounds organized instead of a list of names:

| Job | Common tools | What it gives you |
| --- | --- | --- |
| Metrics | Prometheus, CloudWatch, Zabbix, Datadog | Numbers over time: CPU, latency, error rate |
| Logs | Loki, ELK/EFK (Elasticsearch + Fluentd/Fluent Bit + Kibana), CloudWatch Logs | Text events from apps and systems |
| Traces | Tempo, Jaeger, OpenTelemetry, X-Ray | The path of one request across services |
| Visualization | Grafana, Kibana | Dashboards and exploration |
| Alerting | Alertmanager, Grafana Alerting, Zabbix triggers, CloudWatch Alarms | Notifications to Teams/Slack/email/pager |

- **Prometheus** pulls (scrapes) metrics from `/metrics` endpoints every 15-30 seconds and stores them as time series.
- **Loki** stores logs cheaply by indexing only labels (namespace, pod, app), not the full text. ELK indexes everything, so it searches faster but costs more.
- **Grafana** can read all of them in one place.
- **Docker containers** (outside Kubernetes) are monitored with **cAdvisor**, which exposes per-container CPU, memory, network and filesystem metrics on `/metrics` for Prometheus to scrape. `docker stats` gives a quick live view. Inside Kubernetes, cAdvisor is already built into the kubelet.

:::say
I have worked with Prometheus and Alertmanager for Kubernetes metrics and alerts, Zabbix for host, service and SLA monitoring, Loki for centralized logs, and Grafana as the single dashboard layer over all of them. I think of it as metrics for "is something wrong", logs for "what exactly happened" and traces for "where in the request path it happened".
:::

## What is the difference between logs, metrics and traces?

<!-- source: 08 Q3 -->

:::note In simple words
Metrics are your heart rate on a fitness watch, logs are a diary of everything you did today, and a trace is a GPS route of one single trip from home to office showing where you got stuck.
:::

| | Metrics | Logs | Traces |
| --- | --- | --- | --- |
| What | Numbers over time | Timestamped text events | Path of one request across services |
| Example | `http_requests_total`, CPU 72% | `ERROR payment failed: timeout` | API -> auth -> orders -> DB, 1.8s total |
| Cost | Cheap, small | Expensive at volume | Medium, usually sampled |
| Best for | Alerting, trends, dashboards | Root-cause details | Finding which hop is slow |
| Tools | Prometheus, CloudWatch | Loki, ELK | Tempo, Jaeger, X-Ray |

A common line: "Metrics show trends, logs tell stories, traces reveal the truth of a single request."

**Example:**
```
Metric: rate(http_requests_total{status=~"5.."}[5m])  -> 5xx rate jumped
Log:    {app="orders"} |= "ERROR"                        -> "DB connection refused"
Trace:  trace_id=ab12 -> orders span 4.9s -> db.query span 4.8s
```

:::say
Metrics are aggregated numbers I alert on, logs are detailed events I read to understand what happened, and traces follow one request across microservices to show which hop is slow. I usually start from a metric alert, use traces to find the slow service, and logs to find the exact error.
:::

## What is log aggregation, and why do we need it?

<!-- source: 08 Q4 -->

:::note In simple words
Instead of visiting 200 shops to read each one's complaint book, you photocopy every complaint book into one central library where you can search them all at once.
:::

In Kubernetes, pods are temporary. When a pod dies, its local logs go with it, and with 100 pods you cannot `kubectl logs` each one. Log aggregation means:

1. **Collect** - an agent on every node (Fluent Bit, Promtail, Grafana Alloy, Fluentd, Vector) tails container logs from `/var/log/containers`.
2. **Enrich** - adds labels like namespace, pod, container, node.
3. **Ship** - sends to a central store (Loki, Elasticsearch, CloudWatch Logs).
4. **Store & retain** - with retention rules (e.g. 7 days hot, 90 days in S3).
5. **Search & alert** - query in Grafana/Kibana, alert on error patterns.

**Example:** LogQL query in Grafana for errors in one namespace:
```json
{namespace="payments", app="checkout"} |= "ERROR" | json | status >= 500
```

:::say
Log aggregation collects logs from every server and pod into one central, searchable place so logs survive pod restarts and I can search across all services at once. A typical setup is a node-level agent like Fluent Bit or Promtail shipping into Loki or Elasticsearch, viewed in Grafana or Kibana.
:::

## How does Prometheus collect data from applications in Kubernetes?

<!-- source: 08 Q6 -->

:::note In simple words
Prometheus is a meter reader who walks door to door every 30 seconds and reads each house's meter. Kubernetes gives it the updated address list, so new houses get read automatically.
:::

1. Apps expose metrics in text format on an HTTP endpoint, usually `/metrics` (via a client library, or an **exporter** for things that cannot, e.g. node-exporter for hosts, postgres-exporter, kafka-exporter).
2. Prometheus uses **Kubernetes service discovery** to find pods/services/endpoints through the API server.
3. It **pulls (scrapes)** each target on an interval and stores samples in its time-series DB.
4. With the Prometheus Operator, you declare targets using a **ServiceMonitor** or **PodMonitor** instead of editing config files.
5. Short-lived jobs that end before being scraped push to a **Pushgateway**.
6. kube-state-metrics exposes object state (deployment replicas, pod phase), and cAdvisor in the kubelet exposes container CPU/memory.

**Example:**
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: orders
  labels: { release: kps }      # must match the Prometheus selector
spec:
  selector:
    matchLabels: { app: orders }
  endpoints:
    - port: http-metrics
      path: /metrics
      interval: 30s
```

:::say
Prometheus uses a pull model - it discovers targets through the Kubernetes API and scrapes their /metrics endpoints on an interval. With the Prometheus Operator I just create a ServiceMonitor that selects the service by label, and exporters like node-exporter and kube-state-metrics cover infrastructure and cluster state.
:::

## How do you monitor Kubernetes clusters and applications, and how do you integrate Prometheus and Grafana with Kubernetes?

<!-- source: 08 Q7 -->

*Also asked as:* How do you integrate monitoring tools like Prometheus and Grafana with Kubernetes? How do you monitor applications with Prometheus + Grafana (basic setup)?

:::note In simple words
Instead of building a hospital monitoring room piece by piece, you install a ready-made kit that comes with the heart monitors, the screens and the alarm bells already wired together.
:::

The standard way is the **kube-prometheus-stack** Helm chart. One install gives you:
- Prometheus Operator + Prometheus server
- Alertmanager
- Grafana with ready dashboards
- node-exporter (node CPU/mem/disk) and kube-state-metrics (object state)
- Default alert rules (KubePodCrashLooping, KubeNodeNotReady, etc.)

What to monitor, in layers:
- **Cluster/nodes** - CPU, memory, disk, pressure conditions, NotReady nodes.
- **Kubernetes objects** - restarts, pending pods, failed deployments, HPA at max.
- **Applications** - the RED method: Rate, Errors, Duration per service.
- **Logs** - Loki + Promtail/Alloy; **traces** - Tempo/Jaeger with OpenTelemetry.

**Example:**
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kps prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
kubectl -n monitoring port-forward svc/kps-grafana 3000:80
```

Basic setup end to end, in 5 steps:
1. **Install the stack** - `helm install kps ...` as above (Prometheus, Alertmanager, Grafana ready).
2. **App exposes metrics** - add a Prometheus client library so the app serves `/metrics` (e.g. `http_requests_total`, `http_request_duration_seconds`), and name the port in the Service (e.g. `http-metrics`).
3. **Tell Prometheus to scrape it** - create a ServiceMonitor (see Q6) with the `release: kps` label; confirm the target is UP under Status -> Targets in the Prometheus UI.
4. **Grafana** - the Prometheus data source is pre-configured by the chart; build a RED dashboard (rate, errors, duration) or import a community dashboard by ID.
5. **Alert rule** - add a PrometheusRule; Alertmanager routes it to Teams/Slack/email.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: orders-alerts
  labels: { release: kps }
spec:
  groups:
    - name: orders
      rules:
        - alert: OrdersHigh5xx
          expr: |
            sum(rate(http_requests_total{app="orders",status=~"5.."}[5m]))
            / sum(rate(http_requests_total{app="orders"}[5m])) > 0.05
          for: 5m
          labels: { severity: critical }
          annotations: { summary: "orders 5xx above 5% for 5 minutes" }
```

:::say
I install kube-prometheus-stack with Helm, which brings Prometheus, Alertmanager, Grafana, node-exporter and kube-state-metrics with default dashboards and rules. Then I add ServiceMonitors for each app, Loki for logs, and route Alertmanager to Teams or Slack by severity.
:::

## What is a runbook, and what does on-call ownership mean?

<!-- source: 08 Q8 -->

:::note In simple words
A runbook is the "what to do if the fire alarm rings" card on the wall, so even a new person at 3 AM knows the exact steps without guessing.
:::

- A **runbook** is a step-by-step guide linked to an alert: what the alert means, how to check impact, commands to diagnose, how to fix or mitigate, and who to escalate to.
- Every page-worthy alert should have a runbook link in its annotations. If an alert has no clear action, it probably should not page anyone.
- **On-call ownership** means a rotating engineer is responsible for acknowledging alerts within an agreed time, mitigating, communicating and handing over cleanly. Good on-call has: a rotation schedule, escalation policy, primary + secondary, and a handover note.

**Example:** Alert rule with a runbook link:
```yaml
- alert: KafkaConsumerLagHigh
  expr: sum by (group) (kafka_consumergroup_lag) > 50000
  for: 10m
  labels: { severity: critical }
  annotations:
    summary: "Consumer group {{ $labels.group }} lag is high"
    runbook_url: "https://wiki.example.com/runbooks/kafka-lag"
```

:::say
A runbook is a documented, step-by-step response for a specific alert, and I link it directly in the alert annotation. On-call ownership means someone is clearly accountable to acknowledge, mitigate, communicate and hand over, backed by a rotation and escalation policy.
:::

## What is FinOps? What are the basics of cloud cost optimization?

<!-- source: 08 Q9 -->

:::note In simple words
FinOps is running cloud spending like a household budget: everyone can see the bill, each family member knows what they spend, and you stop paying for the gym you never visit.
:::

FinOps = shared responsibility for cloud cost between engineering, finance and business. The basic loop is **Inform -> Optimize -> Operate**.
- **Visibility** - tag every resource (team, env, project), use Cost Explorer / budgets / cost anomaly alerts.
- **Rightsizing** - match instance size and pod requests to real usage.
- **Pricing models** - Savings Plans/Reserved Instances for steady load, Spot for fault-tolerant load.
- **Waste removal** - unattached volumes, orphaned PVCs, idle load balancers, old snapshots, forgotten S3 buckets.
- **Storage tiering** - S3 lifecycle to Infrequent Access / Glacier; shorter log retention.
- **Data transfer** - NAT gateway and cross-AZ traffic are often the hidden cost; VPC endpoints help.

:::say
FinOps means making cloud cost visible and owned by the teams who create it, then continuously optimizing. My basics are tagging and budgets for visibility, rightsizing and Savings Plans or Spot for compute, lifecycle policies for storage, and regular audits for orphaned resources like unattached volumes and PVCs.
:::
