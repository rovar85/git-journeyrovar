---
track: aws
title: "Monitoring and cost: logs, metrics, alarms, dashboards"
short: Monitoring
sub: CloudWatch end to end: structured logs with retention, searching them, custom metrics, an alarm that needs 3 of 5 bad minutes, a dashboard, and how an alarm decides, simulated minute by minute; plus CloudTrail and cost controls.
---

:::goals
- send structured logs, set retention and search them
- publish custom metrics and read their statistics
- create an alarm with M-of-N evaluation and notifications, and predict when it fires
- use CloudTrail and cost tools to answer who did what and what costs money
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them. The alarm simulation is plain Python and runs in the lab.
:::

## 1. Logs

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a10_monitor.py <<'EOF'
# Logs, metrics and alarms in CloudWatch (moto plays AWS).
import boto3, json, time
from datetime import datetime, timedelta, timezone
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    logs, cw, sns = (boto3.client(s, region_name=R) for s in ("logs", "cloudwatch", "sns"))
    logs.create_log_group(logGroupName="/aws/lambda/quote"); logs.put_retention_policy(logGroupName="/aws/lambda/quote", retentionInDays=30)
    logs.create_log_stream(logGroupName="/aws/lambda/quote", logStreamName="2026/11/24")
    now = int(time.time() * 1000)
    lines = [{"level": "info", "msg": "quote", "ms": 41}, {"level": "error", "msg": "price service timeout", "ms": 3000},
             {"level": "info", "msg": "quote", "ms": 38}, {"level": "error", "msg": "price service timeout", "ms": 3000}, {"level": "info", "msg": "quote", "ms": 55}]
    logs.put_log_events(logGroupName="/aws/lambda/quote", logStreamName="2026/11/24",
                        logEvents=[{"timestamp": now + i, "message": json.dumps(l)} for i, l in enumerate(lines)])
    errs = logs.filter_log_events(logGroupName="/aws/lambda/quote", filterPattern="error")["events"]
    print("log search for the word error:", [json.loads(e["message"])["msg"] for e in errs])
    print("retention:", logs.describe_log_groups()["logGroups"][0]["retentionInDays"], "days (the default keeps logs forever, and you pay for it)")

    # custom metrics: the app reports orders and errors; CloudWatch keeps the numbers
    t0 = datetime.now(timezone.utc) - timedelta(minutes=10)
    for m in range(10):
        cw.put_metric_data(Namespace="Shop", MetricData=[
            {"MetricName": "Orders", "Value": [12, 15, 11, 14, 13, 2, 0, 1, 0, 0][m], "Unit": "Count", "Timestamp": t0 + timedelta(minutes=m)},
            {"MetricName": "Errors", "Value": [0, 1, 0, 0, 0, 9, 14, 12, 15, 11][m], "Unit": "Count", "Timestamp": t0 + timedelta(minutes=m)}])
    stats = cw.get_metric_statistics(Namespace="Shop", MetricName="Errors", StartTime=t0, EndTime=t0 + timedelta(minutes=10),
                                     Period=60, Statistics=["Sum"])["Datapoints"]
    print("errors per minute:", [int(d["Sum"]) for d in sorted(stats, key=lambda d: d["Timestamp"])])

    topic = sns.create_topic(Name="oncall")["TopicArn"]
    sns.subscribe(TopicArn=topic, Protocol="email", Endpoint="oncall@example.com")
    cw.put_metric_alarm(AlarmName="shop-errors-high", Namespace="Shop", MetricName="Errors", Statistic="Sum", Period=60,
                        EvaluationPeriods=5, DatapointsToAlarm=3, Threshold=5, ComparisonOperator="GreaterThanThreshold",
                        TreatMissingData="notBreaching", AlarmActions=[topic], OKActions=[topic])
    a = cw.describe_alarms(AlarmNames=["shop-errors-high"])["MetricAlarms"][0]
    print(f"alarm: {a['MetricName']} {a['Statistic']} > {a['Threshold']:.0f} in {a['DatapointsToAlarm']} of {a['EvaluationPeriods']} minutes -> notify {a['AlarmActions'][0].split(':')[-1]}")
    cw.put_dashboard(DashboardName="shop", DashboardBody=json.dumps({"widgets": [{"type": "metric", "properties": {
        "metrics": [["Shop", "Orders"], ["Shop", "Errors"]], "period": 60, "stat": "Sum", "region": R, "title": "Orders and errors"}}]}))
    print("dashboards:", [d["DashboardName"] for d in cw.list_dashboards()["DashboardEntries"]])
EOF
python3 a10_monitor.py
```

- Applications write **one JSON object per line**; Lambda and ECS (with `awslogs`) send stdout to **CloudWatch Logs** automatically.
- Set **retention**: by default log groups keep data forever, and storage is billed.
- Search with filter patterns (a word, as here, or JSON fields such as `{ $.level = "error" }` on real AWS), or with **Logs Insights** queries:

```term
fields @timestamp, msg, ms
| filter level = "error"
| stats count() as errors by bin(5m)
```

## 2. Metrics, alarms and dashboards

The app published **custom metrics** (Orders, Errors) next to the built-in ones every service sends (CPU, request counts, queue depth). The alarm says: if errors per minute are above 5 in **3 of the last 5 minutes**, notify the on-call topic, and notify again when it recovers. M-of-N avoids paging someone for one bad minute. `TreatMissingData` decides what a gap means.

moto stores alarms but does not evaluate them, so here is the evaluation rule in plain Python, on the same error numbers:

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > alarm_sim.py <<'EOF'
# How a CloudWatch alarm decides, in plain Python: "M of the last N datapoints breached" changes the state.
errors = [0, 1, 0, 0, 0, 9, 14, 12, 15, 11, 3, 0, 0, 0, 0]       # errors per minute
THRESHOLD, N, M = 5, 5, 3
state = "OK"
for minute in range(len(errors)):
    window = errors[max(0, minute - N + 1): minute + 1]
    breaching = sum(v > THRESHOLD for v in window)
    new = "ALARM" if breaching >= M else "OK"
    note = f"  <- state changes to {new}: notify" if new != state else ""
    state = new
    print(f"minute {minute:2}  errors {errors[minute]:2}  breaching {breaching} of {len(window)}  {state}{note}")
EOF
python3 alarm_sim.py
```

The alarm fired at minute 7, two minutes after the problem started, and cleared at minute 12. Shorter periods or fewer datapoints alert sooner but page more often for noise. Good alarms are on **symptoms users feel** (errors, latency, queue age) rather than every internal metric; SLOs make this precise ([Monitoring](#monitoring-1), [SLOs in the cloud](#cloudsenior-12)).

## 3. Who did what: CloudTrail

**CloudTrail** records API calls in the account: who, what, when, from where. Turn on an organisation-wide trail to a locked bucket in a separate account. It answers "who deleted this bucket?" and feeds security detection (GuardDuty, [incident response](#secops-11)).

```term
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket --max-results 5
aws cloudwatch describe-alarms --state-value ALARM --query "MetricAlarms[].AlarmName"
aws ce get-cost-and-usage --time-period Start=2026-11-01,End=2026-11-24 --granularity MONTHLY \
  --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE
```

## 4. Cost visibility

- **Tags** on everything (`app`, `env`, `owner`), activated as cost allocation tags, so the bill splits by team and app.
- **Cost Explorer** by service and tag; **Budgets** with alerts ([lesson 1](#aws-1)); **Cost Anomaly Detection** for sudden jumps.
- The usual suspects: idle NAT gateways, oversized instances, unattached volumes and old snapshots, logs kept forever, data transfer between zones and out to the internet. Rightsizing and Savings Plans come next ([FinOps](#cloudsenior-5)).

## Common misconceptions

- "More alarms mean better monitoring." Noisy alarms get ignored; alert on user-facing symptoms and route the rest to dashboards.
- "Logs are free." Ingestion and storage are billed; set retention and avoid logging huge payloads.
- "CloudTrail is on, so we have everything." The default event history keeps 90 days of management events; a trail to S3 is needed for long-term and data events.

## Practice (answers below)

1. In `alarm_sim.py`, change to 2 of 3 datapoints. When does it fire and clear now?
2. Which alarm would you create for the queue in [lesson 8](#aws-8)?
3. Your bill doubled this month. What are your first three steps?

:::recap
- **Structured logs** with retention; search with filter patterns or Logs Insights.
- **Custom metrics** plus built-in ones; **alarms** with M-of-N evaluation notify through SNS.
- **CloudTrail** answers who did what; keep an organisation trail.
- Control cost with **tags, budgets, Cost Explorer and anomaly detection**.
:::

:::note Answers
1. It fires at minute 6 (9 and 14 are two breaches in the last three) and clears at minute 11 (only one breach among 11, 3, 0): faster in both directions. 2. `ApproximateAgeOfOldestMessage` above a few minutes, and `ApproximateNumberOfMessagesVisible` > 0 on the dead-letter queue. 3. Cost Explorer grouped by service and then by tag or usage type to find what grew; check anomaly detection alerts; then look for the usual suspects (NAT, idle or oversized resources, data transfer, logs).
:::

```quiz
? Why use "3 of 5 datapoints" instead of 1 of 1?
+ To avoid paging for a single noisy minute
- To make alarms cheaper
- Because CloudWatch requires it
- To keep logs longer
! It trades a little delay for fewer false alarms.

? Which service records who called which AWS API?
+ CloudTrail
- CloudWatch Logs
- S3 Inventory
- Route 53
! API activity is CloudTrail's job.

? What is the default retention of a new CloudWatch log group?
+ Never expire
- 1 day
- 7 days
- 30 days
! Set retention yourself to control cost.
```
