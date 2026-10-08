---
track: qbank
title: "Monitoring, observability, SRE and scale design: Advanced questions"
short: SRE advanced
sub: 15 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you implement centralized logging for microservices?

<!-- source: 08 Q10 -->

:::note In simple words
Every microservice writes in the same format and drops its letters into one shared post box, so anyone can search all letters by sender, date or tracking number.
:::

Design points:
1. **Standard log format** - JSON logs to stdout with fields: `timestamp`, `level`, `service`, `trace_id`, `request_id`, `message`. Do not write to files inside containers.
2. **Collector per node** - Fluent Bit / Promtail / Grafana Alloy as a DaemonSet reads `/var/log/containers/*.log` and adds Kubernetes labels.
3. **Central store** - Loki (cheap, label-indexed, object storage like S3) or Elasticsearch/OpenSearch (full-text search, heavier). CloudWatch Logs if you want fully managed on AWS.
4. **Keep labels low-cardinality** - namespace, app, env, level. Never put user IDs or request IDs as Loki labels; keep them inside the log line.
5. **Correlation** - include `trace_id` so Grafana can jump log -> trace.
6. **Retention & cost** - e.g. 7-30 days hot, then archive to S3; drop noisy debug logs at the agent.
7. **Security** - mask PII/secrets before shipping; RBAC on who can query which namespace.
8. **Alerting on logs** - Loki ruler or ElastAlert for patterns like sudden "OutOfMemory" or 5xx bursts.

**Example:**
```
Pods (stdout JSON) -> Fluent Bit DaemonSet -> Loki (S3 backend) -> Grafana
                                          \-> Loki ruler -> Alertmanager -> Teams
```

:::say
I standardize JSON logs to stdout with a trace ID, run a collector like Fluent Bit or Promtail as a DaemonSet, and ship into Loki backed by S3 or into OpenSearch. I keep labels low-cardinality, set retention and PII masking, and link logs to traces in Grafana.
:::

## Design a highly available logging system for 100+ microservices across 3 regions.

<!-- source: 08 Q11 -->

:::note In simple words
Each region has its own local post office so mail never waits on a long-distance line, and there is one central search counter that can look into all three post offices.
:::

Architecture:
```
Region A/B/C:
  Pods -> Fluent Bit (DaemonSet, disk buffer)
       -> Kafka / Kinesis (regional buffer, optional)
       -> Loki (distributed mode, 3 AZs, replication_factor=3)
       -> S3 bucket in same region (chunks + index)
Global:
  Grafana (HA, 2+ replicas) with 3 Loki data sources
  or query federation -> single "all regions" view
```

Key decisions:
- **Regional ingestion** - logs stay in-region (lower latency, lower transfer cost, data residency rules).
- **Buffering** - agents with disk buffers; optionally Kafka in front so a Loki outage does not drop logs.
- **HA inside region** - Loki ingesters spread across 3 AZs with replication factor 3; stateless queriers/distributors behind a load balancer; object storage (S3) is durable by design.
- **Cross-region DR** - S3 cross-region replication of critical buckets.
- **Scale** - horizontal scaling of distributors/ingesters/queriers; rate limits per tenant so one noisy service cannot flood the cluster.
- **Multi-tenancy** - tenant per team or environment (`X-Scope-OrgID`).
- **Retention tiers** - short hot retention, long cold in S3 (with compliance needs).
- **Monitor the monitor** - alert on dropped logs, ingestion rate, agent errors.

Alternatives: OpenSearch with cross-cluster search, or a managed option (CloudWatch Logs, Datadog) if the team is small.

:::say
I would run a regional logging stack per region - Fluent Bit with disk buffers, optionally Kafka, then Loki in distributed mode across three AZs with S3 storage - and put a global HA Grafana on top that queries all three regions. That keeps ingestion local and resilient, uses tenant limits to stop noisy services, and adds cross-region replication only for logs we must keep for DR or compliance.
:::

## How do you implement and monitor distributed tracing in microservices?

<!-- source: 08 Q12 -->

:::note In simple words
Tracing is like putting a tracking number on a parcel. Every warehouse it passes through scans it, so later you can see exactly which warehouse held it for three hours.
:::

1. **Instrument** services with **OpenTelemetry** SDKs or auto-instrumentation (Java agent, Python/Node auto-instrumentation) or eBPF tools like Grafana Beyla. Each request gets a `trace_id`; each hop is a **span**.
2. **Propagate context** through HTTP headers (W3C `traceparent`) and message headers (Kafka), so the trace does not break between services.
3. **Collect** with an **OpenTelemetry Collector** (agent per node + gateway) that batches, samples and exports.
4. **Store & view** in Tempo, Jaeger, or AWS X-Ray; view in Grafana.
5. **Sampling** - head sampling (keep 5-10%) or tail sampling (keep all errors and slow traces, sample the rest) to control cost.
6. **Correlate** - put `trace_id` in logs; enable exemplars so a latency metric links to a real trace.
7. **Monitor tracing health** - spans received vs dropped in the collector; alert if span rate falls to zero (a silently broken pipeline is common).

**Example:**
```yaml
# OTel Collector tail sampling: keep errors + slow requests
processors:
  tail_sampling:
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 1000 }
```

:::say
I instrument services with OpenTelemetry, propagate the trace context through HTTP and Kafka headers, and send spans through an OTel Collector to Tempo or Jaeger viewed in Grafana. I use tail sampling to keep all errors and slow traces, put the trace ID in logs, and alert if span ingestion drops, because a silently broken trace pipeline is a common failure.
:::

## How would you design an observability stack using CloudWatch, Prometheus and Grafana?

<!-- source: 08 Q13 -->

:::note In simple words
CloudWatch already watches the building AWS owns (RDS, ALB, Lambda), Prometheus watches what you run inside your own rooms (pods, apps), and Grafana is the single security desk showing both camera feeds.
:::

Split responsibilities:
- **CloudWatch** - AWS managed services: ALB (TargetResponseTime, HTTPCode_ELB_5XX), RDS (CPU, connections, FreeStorageSpace, replica lag), Lambda (errors, throttles, duration), MSK, ElastiCache, billing. Also CloudWatch Logs for Lambda/VPC flow logs.
- **Prometheus** - Kubernetes and apps: kube-state-metrics, node-exporter, app `/metrics`, exporters. Use Amazon Managed Prometheus or self-managed with remote_write to long-term storage (Thanos/Mimir) if retention is needed.
- **Grafana** - one place: CloudWatch data source (via IAM role, not access keys), Prometheus data source, Loki for logs, Tempo/X-Ray for traces.
- **Alerting** - Alertmanager for cluster/app alerts, CloudWatch Alarms -> SNS -> Lambda/chat for AWS services; or unify with Grafana Alerting. Route by severity and team.
- **Dashboards** - per-service RED dashboard, per-cluster USE dashboard (Utilization, Saturation, Errors), business/SLO dashboard.

**Example:**
```
EKS pods --scrape--> Prometheus --remote_write--> long-term store
AWS services --------> CloudWatch metrics/alarms --SNS--> Lambda -> Teams
Grafana <---- Prometheus + CloudWatch + Loki + Tempo data sources
```

:::say
I use CloudWatch for AWS-managed services and Prometheus for Kubernetes and application metrics, and bring both into Grafana using an IAM role for the CloudWatch data source. Alerts come from Alertmanager and CloudWatch Alarms, routed by severity, with RED dashboards per service and an SLO dashboard on top.
:::

## How would you monitor HPA scaling decisions in real time and detect if the metrics server is lagging?

<!-- source: 08 Q14 -->

:::note In simple words
The HPA is a thermostat. If the thermometer on the wall is stuck showing an old temperature, the thermostat will make wrong decisions, so you watch both the thermostat's actions and the thermometer's freshness.
:::

What to watch:
- **HPA state** from kube-state-metrics: `kube_horizontalpodautoscaler_status_current_replicas`, `..._status_desired_replicas`, `..._spec_max_replicas`, and the `ScalingLimited` / `AbleToScale` conditions.
- **Events**: `kubectl describe hpa <name>` shows "FailedGetResourceMetric" or "unable to fetch metrics".
- **Metrics pipeline health**: `kubectl get apiservice v1beta1.metrics.k8s.io` must be Available; metrics-server pod restarts and its scrape latency; for custom metrics, prometheus-adapter or KEDA errors.
- **Freshness**: compare metric timestamps; metrics-server scrapes kubelets every ~15s by default. A lag appears as desired replicas not changing while real CPU climbs.

**Example:**
```
# Alert: HPA pinned at max for 15m (cannot scale further)
kube_horizontalpodautoscaler_status_current_replicas
  >= kube_horizontalpodautoscaler_spec_max_replicas

# Alert: desired != current for too long (scaling stuck)
kube_horizontalpodautoscaler_status_desired_replicas
  != kube_horizontalpodautoscaler_status_current_replicas

kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/live/pods | head
```

:::say
I graph HPA current versus desired versus max replicas from kube-state-metrics and alert when it is pinned at max or when desired and current differ too long. For metrics-server lag I watch the metrics APIService availability, FailedGetResourceMetric events and metrics-server health, and for critical workloads I scale on faster signals like request rate or queue lag through KEDA.
:::

## Your monitoring shows constant false alerts. How do you tune alerts and reduce alert fatigue?

<!-- source: 08 Q15 -->

*Also asked as:* How do you reduce alert noise? Reducing alert fatigue. How do you implement SLO-based alerting without alert fatigue (error budget, burn-rate alerts, multi-window)?

:::note In simple words
If a car alarm goes off every time a leaf falls, people stop looking. You adjust it to ring only when someone actually tries to break in.
:::

Steps:
1. **Measure the noise** - list the top 10 alerts by count last month and how many led to action. Anything never actioned is a candidate to delete or downgrade.
2. **Alert on symptoms, not causes** - page on user impact (error rate, latency SLO burn, site down), not "CPU 80%" which might be normal.
3. **Add duration** - `for: 5m` or 10m so brief spikes do not fire.
4. **Better thresholds** - base them on historical percentiles, not guesses; use SLO burn-rate alerts (fast burn pages, slow burn tickets).
5. **Deduplicate and group** - Alertmanager `group_by`, inhibition rules (if the node is down, suppress all pod alerts on it).
6. **Severity routing** - critical -> page/phone; warning -> chat channel; info -> dashboard only.
7. **Silence during maintenance** windows.
8. **Every page must have a runbook and an owner**; review alerts in a weekly or monthly ops review.
9. **Check the alerting path too** - false negatives (alerts silently not delivered) are as dangerous as false positives.

**SLO-based alerting with multi-window, multi-burn-rate rules** - burn rate is how fast you are using the error budget (1x = the budget lasts exactly the 30-day window). Each rule needs both a long window (proves it is significant) and a short window (proves it is still happening, so the alert clears quickly after recovery). Recommended values for a 99.9% SLO:

| Burn rate | Long window | Short window | Budget used | Action |
| --- | --- | --- | --- | --- |
| 14.4x | 1h | 5m | 2% | Page |
| 6x | 6h | 30m | 5% | Page |
| 1x | 3d | 6h | 10% | Ticket |

This alerts on a symptom (users getting errors), not on causes like CPU, and it sends fast burns to the pager and slow burns to a ticket queue. For the PromQL of the 14.4x rule and how it fits SLA reporting, see Q17.

**Example:**
```yaml
route:
  group_by: [alertname, cluster, namespace]
  group_wait: 30s
  repeat_interval: 4h
inhibit_rules:
  - source_matchers: [alertname="KubeNodeNotReady"]
    target_matchers: [severity="warning"]
    equal: [node]
```

:::say
I first measure which alerts fire most and which ones actually led to action, then delete or downgrade the noise. I alert on user-facing symptoms with a for-duration, use SLO burn-rate alerts, group and inhibit related alerts in Alertmanager, route by severity, and make sure every paging alert has a runbook and an owner.
:::

## You are asked to design an alerting system for high availability. What is your approach?

<!-- source: 08 Q16 -->

:::note In simple words
A fire alarm system that itself can fail silently is useless, so you install two alarm panels, two phone lines, and a test button you press regularly.
:::

Design:
- **Redundant alert evaluation** - two Prometheus replicas scraping the same targets (HA pair), or a managed service.
- **Alertmanager cluster** - 3 replicas in gossip mode; they deduplicate so you get one notification, not three.
- **Multiple notification channels** - primary (pager/phone via on-call tool) plus secondary (Teams/Slack, email). Critical alerts should not depend on a single webhook.
- **Watchdog / dead man's switch** - an always-firing alert (`vector(1)`) sent to an external service; if it stops arriving, the external service alerts you that your monitoring is dead.
- **External synthetic checks** - uptime checks from outside your cloud (another region/account/provider), so a total outage of your cluster still alerts.
- **Escalation policy** - primary -> secondary -> manager, with acknowledge timeouts.
- **Test end-to-end regularly** - send test alerts and confirm they arrive in the real channel; verify templates render (a broken message template can silently block delivery).
- **Alert as code** - rules in Git, reviewed and deployed through CI.

**Example:**
```yaml
- alert: Watchdog
  expr: vector(1)
  labels: { severity: none }
  annotations:
    summary: "Heartbeat - if this stops, the alerting pipeline is broken"
```

:::say
I make every layer redundant - HA Prometheus, a three-node Alertmanager cluster and more than one notification channel - and add a dead man's switch plus external synthetic checks so we find out if monitoring itself dies. Alert rules live in Git, escalation is defined, and I test delivery end to end regularly because a silently broken notification path is worse than a noisy one.
:::

## How would you monitor the end-to-end SLA for services involved in a payments pipeline?

<!-- source: 08 Q17 -->

*Also asked as:* How would you monitor SLA compliance for a business-critical service?

:::note In simple words
A customer does not care that each counter in the bank was fast; they care how long it took from walking in to getting the receipt. So you time the whole journey, not just each counter.
:::

1. **Define the user journey** - e.g. "payment initiated -> authorized -> captured -> confirmation shown". The SLI is end-to-end success and latency of that journey.
2. **SLIs per step and overall**: success rate, p95/p99 latency, and for async steps the **freshness/lag** (time from event produced to processed).
3. **Distributed tracing** across gateway, payment service, fraud check, bank adapter, queue consumers - with the same trace ID through Kafka headers.
4. **Business metrics** - payments per minute, success ratio by bank/method; a sudden drop in successful payments is often the best alert.
5. **Synthetic transactions** - a test card payment every minute from outside.
6. **Third-party dependency monitoring** - track bank/PSP response time and error codes separately so you know if it is "us or them".
7. **SLO + error budget + burn-rate alerts** on the journey SLI; dashboards showing budget remaining.
8. **Reconciliation checks** - count of initiated vs completed; stuck payments older than X minutes.

For SLA compliance of any business-critical service, add:
- **Multi-window, multi-burn-rate SLO alerts** - page when the error budget burns fast over both a long and a short window (for example 14.4x over 1h and 5m), and open a ticket for a slow burn (for example 6x over 6h and 30m). This catches real incidents quickly without paging for tiny blips.
- **Synthetic probes from outside** your cloud and region (for example the Blackbox exporter or an external uptime checker), so you measure what customers see even if your whole cluster is down.
- **Monthly SLA reports** - availability percentage, downtime minutes per service, and the root cause of each breach, compared with the contract target.
- **Error budget policy** - agreed in writing: when the budget is spent, risky releases freeze and reliability work comes first.

```
# Fast-burn page for a 99.9% SLO (budget = 0.001)
( sum(rate(http_requests_total{job="payments",status=~"5.."}[1h]))
  / sum(rate(http_requests_total{job="payments"}[1h])) > 14.4 * 0.001 )
and
( sum(rate(http_requests_total{job="payments",status=~"5.."}[5m]))
  / sum(rate(http_requests_total{job="payments"}[5m])) > 14.4 * 0.001 )
```

**Example:**
```
# End-to-end success ratio (5m)
sum(rate(payment_completed_total{status="success"}[5m]))
/ sum(rate(payment_initiated_total[5m]))
# Alert if stuck payments > 0 for 10m
payments_pending_older_than_5m > 0
```

:::say
I define the SLI on the whole payment journey, not individual services, and measure it with business metrics, distributed traces through every hop including Kafka, and synthetic test payments. I alert on SLO burn rate and on stuck or unreconciled payments, and track third-party banks separately so we know quickly whether the problem is ours or theirs.
:::

## How would you design auto-scaling for 50M+ concurrent viewers across multiple Kubernetes clusters without over-provisioning?

<!-- source: 08 Q18 -->

:::note In simple words
For a huge cricket match, a stadium does not keep 50 lakh seats open all year. It knows the match schedule, opens extra gates just before the crowd arrives, and closes them after, while always keeping a small safety margin.
:::

Layers of scaling:
1. **Push most traffic to the CDN** - video segments are served from CDN edges; Kubernetes serves manifests, auth, session, entitlement, ads APIs. Offloading is the biggest cost saver.
2. **Scale on the right signals** - not only CPU. Use requests per second, concurrent sessions, or Kafka/queue lag via **KEDA** or custom metrics HPA.
3. **Predictive/scheduled scaling** - events are known in advance; use KEDA cron scaler or scheduled scaling to raise `minReplicas` before the toss, based on last event's peak + growth forecast.
4. **Fast node provisioning** - Karpenter (or Cluster Autoscaler) with multiple instance types and Spot for stateless tiers, On-Demand for critical tiers.
5. **Headroom without waste** - low-priority "placeholder" (overprovisioning) pods that reserve capacity and get evicted instantly when real pods need room.
6. **Multi-cluster distribution** - several regional clusters behind global load balancing; each cluster scales independently, and a cell-based design limits blast radius.
7. **Protect the system** - rate limits, load shedding, graceful degradation (drop to lower bitrate, disable non-critical features).
8. **Scale down carefully** - stabilization windows so it does not flap during innings breaks.

**Example:**
```yaml
# KEDA: pre-scale before match + scale on concurrent sessions
triggers:
  - type: cron
    metadata: { timezone: Asia/Kolkata, start: "0 18 * * *", end: "0 1 * * *",
                desiredReplicas: "400" }
  - type: prometheus
    metadata:
      serverAddress: http://prometheus.monitoring:9090
      query: sum(active_sessions{svc="playback-api"})
      threshold: "5000"
```

:::say
I push video delivery to the CDN, then scale the Kubernetes APIs on business signals like concurrent sessions using KEDA, combined with scheduled pre-scaling before known events. Karpenter with mixed Spot and On-Demand adds nodes quickly, low-priority placeholder pods give instant headroom, and multiple regional clusters, rate limits and graceful degradation protect us without paying for peak capacity all year.
:::

## During an IPL final a new region needs to spin up instantly. How would you pre-warm nodes and scale workloads with zero cold-start impact?

<!-- source: 08 Q19 -->

:::note In simple words
Before a big wedding, the caterer starts the stoves and cooks some food in advance, so when guests arrive they do not wait for the gas to be lit.
:::

Cold starts come from: new nodes booting, image pulls, app warm-up (JVM, caches), empty caches, and load balancers/CDN not warmed. Remove each one:
1. **Infrastructure ready in advance** - the region is already built by Terraform (same modules), cluster running at a small baseline. Standing up from nothing on the day is too risky.
2. **Pre-warm nodes** - raise the node group minimum or use Karpenter with placeholder (pause) pods at low priority 1-2 hours before; request capacity reservations for critical instance types.
3. **Pre-pull images** - a DaemonSet that pulls the big images, or bake images into the AMI; keep images small; use a registry replica in that region.
4. **Pre-scale pods** - raise `minReplicas` on HPA/KEDA ahead of time.
5. **App warm-up** - startup probes and readiness probes so pods only receive traffic after warm-up; warm caches (Redis) with popular content/metadata.
6. **Warm the edge** - CDN pre-fetch of manifests/assets; ask AWS to pre-warm load balancers for massive expected jumps if needed.
7. **Shift traffic gradually** - weighted routing (5% -> 25% -> 100%) while watching SLOs.
8. **Rehearse** - load test with k6/Locust at expected peak in the days before.

:::say
I would never build the region on the day - it is pre-created from the same Terraform modules and running at a baseline. Before the match I pre-scale nodes with placeholder pods or capacity reservations, pre-pull images, raise minReplicas, warm caches and CDN, gate traffic on startup and readiness probes, and shift traffic in weighted steps after a rehearsed load test.
:::

## How would you use Envoy and Istio to route low-latency live streams differently from VOD without service restarts?

<!-- source: 08 Q20 -->

:::note In simple words
At a toll plaza, the traffic police can change which lane ambulances use just by changing the signboards, without closing the road or rebuilding the plaza.
:::

- Istio puts an **Envoy sidecar** (or ambient-mode proxy) next to each service. Envoy receives its routing config dynamically from **istiod** over the xDS API, so changing routes does not restart pods.
- Use a **VirtualService** to match live vs VOD requests (by path, header, or host) and send them to different subsets or services.
- Use a **DestinationRule** to give each subset different traffic policies: tight timeouts, fewer retries (retries add latency for live), connection pool limits, outlier detection, and locality-aware load balancing for live; more generous timeouts and caching-friendly settings for VOD.

**Example:**
```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: playback }
spec:
  hosts: [playback.svc.cluster.local]
  http:
    - match: [{ uri: { prefix: /live/ } }]
      route: [{ destination: { host: playback-live } }]
      timeout: 2s
      retries: { attempts: 1, perTryTimeout: 1s }
    - route: [{ destination: { host: playback-vod } }]
      timeout: 10s
      retries: { attempts: 3, perTryTimeout: 3s }
```
Apply with `kubectl apply`; Envoy picks it up in seconds. Roll out changes safely with weights (90/10) and watch latency.

:::say
Envoy gets its config dynamically from istiod over xDS, so I can change routing just by applying Istio resources with no restarts. A VirtualService matches live versus VOD by path or header and sends them to different backends, and DestinationRules give live traffic tight timeouts, minimal retries, locality-aware balancing and outlier detection, while VOD gets more relaxed settings.
:::

## How would you configure readiness and liveness probes to catch buffering or lag in stream-processing services before users notice?

<!-- source: 08 Q21 -->

:::note In simple words
Do not just check if the worker is breathing (liveness); check if they are keeping up with the work (readiness). A worker who is alive but far behind should stop getting new work.
:::

(Probe basics are covered in the Kubernetes chapter; this is the streaming angle.)
- **Readiness** should reflect "can I serve good quality right now": check internal lag (e.g. consumer lag or segment processing delay below a threshold), dependency reachability (Redis, origin). If lag is high, return 503 so the pod leaves the load balancer and traffic goes to healthy pods.
- **Liveness** should be simple and only detect a truly stuck process (event loop hung, no progress for N minutes). Do not put dependency checks in liveness or you will restart every pod when Redis blips.
- **Startup probe** protects slow warm-up.
- Probes are not enough - also alert on business signals: rebuffering ratio, segment generation delay, consumer lag.

**Example:**
```yaml
readinessProbe:
  httpGet: { path: /ready, port: 8080 }   # returns 503 if lag > 2s
  periodSeconds: 5
  failureThreshold: 2
livenessProbe:
  httpGet: { path: /live, port: 8080 }    # 500 only if no progress for 60s
  periodSeconds: 10
  failureThreshold: 6
```

:::say
I make readiness reflect real serving quality, like processing lag under a threshold, so a lagging pod is taken out of rotation before users buffer, while liveness only detects a truly stuck process so we do not cause restart storms. Alongside probes I alert on rebuffering ratio and consumer lag, because probes only protect one pod at a time.
:::

## How do you build a culture where latency SLOs are enforced like uptime SLAs?

<!-- source: 08 Q22 -->

:::note In simple words
A restaurant that only checks "is the door open" will miss that customers wait 40 minutes for food. You make "food served within 15 minutes" a goal everyone is measured on, not just "open for business".
:::

1. **Make latency a first-class SLO** - e.g. "99% of play starts under 2 seconds" and "rebuffer ratio under 0.5%", agreed with product owners, because slow is the new down for streaming.
2. **Visible dashboards** - SLO and error budget shown on team dashboards and in weekly reviews.
3. **Error budget policy** - written and agreed: if the latency budget is exhausted, feature releases pause and reliability work gets priority.
4. **Alerts on burn rate** of latency SLOs, not just on up/down.
5. **Shift left** - performance tests in CI, latency budgets per service in design reviews, canary analysis that rolls back if p99 regresses.
6. **Ownership** - each service team owns its SLO; postmortems for latency incidents just like outages.
7. **Celebrate improvements** and keep it blameless.

:::say
I define latency SLOs with product teams, show them and their error budgets on shared dashboards, and alert on burn rate exactly like availability. A written error budget policy pauses feature work when the budget is exhausted, canary analysis rolls back latency regressions automatically, and latency incidents get the same blameless postmortems as outages.
:::

## How would you simulate chaos in a streaming pipeline without risking real user impact?

<!-- source: 08 Q23 -->

:::note In simple words
Fire drills are done with a plan, a small area first, and a way to stop immediately - not by setting the real building on fire during a wedding.
:::

1. **Start with a hypothesis** - "If one Kafka broker dies, consumer lag stays below 30s and no playback errors".
2. **Start in staging/pre-prod** with production-like load (replayed or synthetic traffic).
3. **In production, limit blast radius** - one pod, one AZ, a canary cell, or only synthetic/test users; never during a live event.
4. **Guardrails / abort conditions** - automatic stop if SLO metrics cross a threshold.
5. **Tools** - Chaos Mesh or LitmusChaos in Kubernetes (pod kill, network delay, packet loss), AWS Fault Injection Service for AZ/instance failures, Istio fault injection for latency on specific routes or headers only.
6. **Shadow traffic** - mirror real traffic to a copy of the pipeline and break the copy.
7. **Game days** - scheduled, announced, with the on-call team; document findings and fix gaps.

**Example:**
```yaml
# Istio fault injection only for requests with a test header
http:
  - match: [{ headers: { x-chaos-test: { exact: "true" } } }]
    fault: { delay: { percentage: { value: 100 }, fixedDelay: 3s } }
    route: [{ destination: { host: playback-live } }]
```

:::say
I run chaos as controlled experiments with a clear hypothesis, starting in staging with production-like load, then in production only on a small blast radius such as one canary cell or synthetic test traffic, never during live events. I use tools like Chaos Mesh, AWS FIS or Istio fault injection with automatic abort conditions on SLO metrics, and turn every finding into a fix.
:::

## How do you justify infrastructure costs for pre-warmed scaling capacity to executives before a major sports event?

<!-- source: 08 Q24 -->

:::note In simple words
You explain it like insurance: "We will spend 10 lakh for these three days so we do not risk losing 5 crore in ads and subscribers if the app crashes in the final over."
:::

Talk in business terms, not CPU:
1. **Cost of failure** - revenue per minute of the event (ads, subscriptions, sponsors), churn risk, brand damage, SLA penalties. Use past incidents as evidence.
2. **Data-backed forecast** - last year's peak concurrency, growth trend, and the gap between how fast autoscaling reacts (minutes) vs how fast traffic jumps (seconds at toss/final over).
3. **Exact, time-boxed ask** - pre-warm only for event windows, with a scale-down plan; show the cost per hour.
4. **Options table** - no pre-warm (cheapest, highest risk), partial pre-warm, full pre-warm - with cost and risk for each.
5. **Cost reducers** - Spot for stateless tiers, capacity reservations only for peak hours, CDN offload, Savings Plans for the baseline.
6. **Show results after** - report actual peak, cost, and SLOs met, which builds trust for the next ask.

| Option | Extra cost (event days) | Risk |
| --- | --- | --- |
| Reactive autoscaling only | Lowest | High - cold start at toss |
| Partial pre-warm (60% of peak) | Medium | Medium |
| Full pre-warm + Spot for stateless | Higher | Low |

:::say
I compare the time-boxed cost of pre-warming against the business cost of failure - lost ad revenue, churn and penalties per minute of downtime - using last event's real peak data. I present two or three options with cost and risk, reduce the bill with Spot, reservations only for the event window and CDN offload, and report actual results afterwards.
:::
