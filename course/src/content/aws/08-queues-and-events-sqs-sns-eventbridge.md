---
track: aws
title: "Queues and events: SQS, SNS and EventBridge"
short: Queues and events
sub: Decouple services: a work queue whose bad message ends up in a dead-letter queue, one event fanned out to many subscribers with a filter, and a content-based EventBridge rule.
---

:::goals
- use an SQS queue with a visibility timeout and a dead-letter queue
- delete messages only after success, and explain at-least-once delivery
- fan out one event to several consumers with SNS and a filter policy
- route events by content with EventBridge
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

## 1. Why queues

If the checkout calls the email service, the warehouse and fraud checks directly, one slow service slows every order and an outage loses orders. Put a **message** in a queue or publish an **event**, and each consumer works at its own pace, retries on its own, and can be down for a while without losing anything. The patterns are explained in [System design](#sysdesign-5).

## 2. All three, running

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a8_events.py <<'EOF'
# Decoupling with queues and events: SQS with a dead-letter queue, SNS fan-out with a filter, an EventBridge rule (moto plays AWS).
import boto3, json
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    sqs, sns, ev = (boto3.client(s, region_name=R) for s in ("sqs", "sns", "events"))
    def arn(url): return sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]

    print("1) a work queue with a dead-letter queue")
    dlq = sqs.create_queue(QueueName="orders-dlq")["QueueUrl"]
    q = sqs.create_queue(QueueName="orders", Attributes={"VisibilityTimeout": "30",
        "RedrivePolicy": json.dumps({"deadLetterTargetArn": arn(dlq), "maxReceiveCount": "3"})})["QueueUrl"]
    for body in ['{"order": 1}', '{"order": 2}', 'not json at all', '{"order": 3}']: sqs.send_message(QueueUrl=q, MessageBody=body)
    done = []
    for attempt in range(1, 6):
        msgs = sqs.receive_message(QueueUrl=q, MaxNumberOfMessages=10, VisibilityTimeout=0).get("Messages", [])
        for m in msgs:
            try:
                done.append(json.loads(m["Body"])["order"])
                sqs.delete_message(QueueUrl=q, ReceiptHandle=m["ReceiptHandle"])     # delete only after success
            except ValueError:
                pass                                                                  # not deleted: it comes back
        if not msgs: break
    print("   processed:", sorted(done))
    print("   dead-letter queue holds:", [m["Body"] for m in sqs.receive_message(QueueUrl=dlq).get("Messages", [])])

    print("2) one event, many subscribers (SNS fan-out with a filter)")
    topic = sns.create_topic(Name="order-events")["TopicArn"]
    queues = {n: sqs.create_queue(QueueName=n)["QueueUrl"] for n in ("email-receipts", "warehouse", "fraud-check")}
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn(queues["email-receipts"]), Attributes={"RawMessageDelivery": "true"})
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn(queues["warehouse"]), Attributes={"RawMessageDelivery": "true"})
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn(queues["fraud-check"]), Attributes={"RawMessageDelivery": "true",
                  "FilterPolicy": json.dumps({"amount": [{"numeric": [">=", 10000]}]})})
    for amt in (499, 25000):
        sns.publish(TopicArn=topic, Message=json.dumps({"order": amt, "amount": amt}),
                    MessageAttributes={"amount": {"DataType": "Number", "StringValue": str(amt)}})
    for n, u in queues.items():
        got = [json.loads(m["Body"])["amount"] for m in sqs.receive_message(QueueUrl=u, MaxNumberOfMessages=10).get("Messages", [])]
        print(f"   {n:15} received amounts {sorted(got)}")

    print("3) an EventBridge rule that matches on content")
    audit = sqs.create_queue(QueueName="refund-audit")["QueueUrl"]
    ev.put_rule(Name="big-refunds", EventPattern=json.dumps({"source": ["shop.payments"], "detail-type": ["Refund"], "detail": {"amount": [{"numeric": [">", 5000]}]}}))
    ev.put_targets(Rule="big-refunds", Targets=[{"Id": "audit", "Arn": arn(audit)}])
    ev.put_events(Entries=[{"Source": "shop.payments", "DetailType": "Refund", "Detail": json.dumps({"amount": a, "order": i})} for i, a in enumerate((300, 7000, 12000))])
    got = [json.loads(m["Body"])["detail"]["amount"] for m in sqs.receive_message(QueueUrl=audit, MaxNumberOfMessages=10).get("Messages", [])]
    print("   refund-audit received:", sorted(got))
EOF
python3 a8_events.py
```

**SQS (queues).** A consumer receives a message, which becomes **invisible** for the visibility timeout. If the consumer **deletes** it, it is done; if not (crash, error), it reappears and is tried again. After `maxReceiveCount` (3) failures the **redrive policy** moves it to the **dead-letter queue**, so one bad message ("not json at all") cannot block the rest forever. Delivery is **at least once**: consumers must be **idempotent** (processing the same message twice must be harmless). FIFO queues add strict order and de-duplication at lower throughput.

**SNS (fan-out).** A topic pushes each message to every subscriber: queues, Lambda functions, HTTPS endpoints, email. A **filter policy** lets the fraud queue receive only orders of 10,000 or more. The usual pattern is SNS to several SQS queues, so each consumer still gets its own buffer and retries.

**EventBridge (event bus).** Services publish events with a `source`, a `detail-type` and a JSON `detail`; **rules** match on any of it (here refunds over 5,000) and send to targets. It also receives events from AWS services (an instance stopped, a file arrived) and SaaS tools, and runs **schedules** (`rate(5 minutes)`, cron).

```term
aws sqs get-queue-attributes --queue-url <url> --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
aws sqs start-message-move-task --source-arn arn:aws:sqs:ap-south-1:123456789012:orders-dlq   # send DLQ messages back after a fix
aws events put-rule --name nightly-report --schedule-expression "cron(30 1 * * ? *)"
```

## 3. Alarms that matter for queues

Alert on the **age of the oldest message** (work is falling behind) and on **any message in a dead-letter queue** (something is failing). Queue depth per worker is also the best signal to scale workers on ([lesson 5](#aws-5)).

## Common misconceptions

- "A message is delivered exactly once." Standard SQS is at least once; design consumers to be idempotent.
- "Receiving a message removes it." Only deleting does; otherwise it comes back after the visibility timeout.
- "SNS stores messages for slow consumers." SNS pushes and retries but is not a buffer; put SQS behind it.

## Practice (answers below)

1. Change `maxReceiveCount` to 1 and run again. What happens to the bad message, and what is the risk of such a low value?
2. Add a fourth SNS subscriber, `analytics`, that receives every event. What do you need?
3. Your worker takes 60 seconds per message but the visibility timeout is 30. What goes wrong?

:::recap
- **SQS**: receive, process, **delete on success**; failed messages retry, then go to a **dead-letter queue**.
- Delivery is **at least once**: make consumers **idempotent**.
- **SNS** fans one message out to many subscribers, with **filter policies**; put SQS behind it for buffering.
- **EventBridge** routes events by content and runs schedules; alarm on message age and DLQ depth.
:::

:::note Answers
1. It moves to the dead-letter queue after one failed receive; a single brief glitch (a timeout) would also send good messages there. 2. A queue `analytics` and a subscription with `RawMessageDelivery` and no filter policy; in real AWS also a queue policy allowing the topic to send. 3. The message becomes visible again while still being processed, so a second worker takes it too: duplicate work. Raise the timeout above the processing time (or extend it while working).
:::

```quiz
? When is a message removed from an SQS queue?
+ When the consumer deletes it after processing
- As soon as it is received
- After one hour always
- When SNS confirms
! Undeleted messages reappear.

? What is a dead-letter queue for?
+ Holding messages that failed processing too many times
- Encrypting messages
- Deleting old queues
- Speeding up delivery
! It stops poison messages blocking the queue.

? Which service sends one message to many subscribers?
+ SNS
- SQS
- RDS
- EBS
! Fan-out is SNS's job.
```
