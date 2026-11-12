---
track: sysdesign
title: "Queues and asynchronous work"
short: Queues
sub: Why to put a queue between parts of a system, competing consumers, publish/subscribe, backlogs and how to size consumers, dead-letter queues, idempotent consumers and the outbox pattern.
---

:::goals
- decide when work should be asynchronous
- size consumers from arrival rate and processing time
- handle failures with retries and a dead-letter queue
- publish events reliably with the outbox pattern
:::

## Why a queue

Some work does not need to finish before the user gets an answer: sending an email, resizing a photo, updating a search index, charging a card after an order. Put a **queue** (also called a message broker) between the part that receives the request and the part that does the work:

- the user gets a fast "accepted" answer;
- a burst of traffic waits in the queue instead of overloading the workers;
- producers and consumers can be deployed, scaled and fail independently.

Two shapes:

- **Work queue (competing consumers):** each message is handled by one of several workers. Add workers to go faster. (RabbitMQ, Amazon SQS, Redis streams.)
- **Publish/subscribe:** each message goes to every interested subscriber (the email service *and* the analytics service *and* the search indexer). (Kafka topics, Google Pub/Sub, SNS. Kafka's partitions and offsets are in [Streaming](#dataeng-16).)

## How many consumers?

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > queue.py <<'EOF'
# A work queue between a busy front end and slower workers: backlog, waiting time, and adding consumers.
def run(arrivals_per_s, workers, seconds_per_job, minutes=10, burst=None):
    backlog, worst, served = 0.0, 0.0, 0.0
    capacity = workers / seconds_per_job
    for m in range(minutes * 60):
        rate = arrivals_per_s * (3 if burst and burst[0] <= m < burst[1] else 1)
        backlog += rate
        done = min(backlog, capacity); backlog -= done; served += done
        worst = max(worst, backlog)
    return capacity, worst, backlog, worst / capacity
print(f"{'situation':54} {'capacity/s':>10} {'max backlog':>12} {'left at end':>12} {'worst wait':>11}")
cases = [("steady 80 jobs/s, 10 workers x 0.1 s per job", (80, 10, 0.1)),
         ("burst: 3x traffic for 2 minutes, same 10 workers", (80, 10, 0.1, 10, (120, 240))),
         ("same burst, 25 workers", (80, 25, 0.1, 10, (120, 240))),
         ("steady 120 jobs/s on 10 workers: arrivals above capacity", (120, 10, 0.1))]
for name, a in cases:
    cap, worst, left, wait = run(*a)
    print(f"{name:54} {cap:>10.0f} {worst:>12,.0f} {left:>12,.0f} {wait:>9.0f} s")
print("\nThe queue absorbs a burst (users get a fast 'accepted' answer), then drains. But if arrivals stay above capacity the")
print("backlog grows without limit: watch queue depth and age of the oldest message, and scale consumers on them.")
EOF
python3 queue.py
```

- With 10 workers taking 0.1 s each, capacity is **100 jobs per second**. Steady traffic of 80 per second never queues.
- A two-minute burst at three times the traffic builds a backlog of **16,800 jobs**: the oldest waits about **168 seconds**, and 9,600 are still waiting at the end of the ten minutes. Nothing failed: the queue did its job, but users waited.
- With 25 workers the same burst never queues at all.
- If arrivals stay **above capacity** (120 per second against 100), the backlog only grows. No queue fixes that; you need more consumers or faster processing.

So scale consumers on **queue depth** and **age of the oldest message**, not on CPU, and alert when either keeps rising. KEDA does exactly this on Kubernetes ([AI infrastructure 7](#aiinfra-7)).

## When processing fails

- Brokers deliver **at least once**: a consumer that crashes before acknowledging gets the message again. Consumers must be **idempotent**: processing a message twice must not charge twice ([Systems 7](#systems-7)).
- Retry with back-off a few times, then move the message to a **dead-letter queue** (DLQ) for a person to inspect. One broken message must not block the rest.
- Ordering is only guaranteed within a partition or a FIFO queue; design so that most messages do not depend on order.

## The outbox pattern

A service that saves an order and then publishes "order created" can crash between the two, leaving an order nobody hears about, or a message about an order that was never saved. The **outbox** fixes it: write the order *and* the message into an `outbox` table in the **same database transaction**; a separate relay reads the outbox and publishes to the broker, marking rows as sent. Either both happen or neither. Change-data-capture tools can do the relay ([Data engineering 10](#dataeng-10)).

## When would you introduce a message queue?

:::say
When work does not have to finish before the user gets an answer, when traffic is bursty, or when one producer feeds several independent consumers. The queue absorbs bursts and decouples services. It brings at-least-once delivery, so consumers must be idempotent, and I add a dead-letter queue, scale consumers on queue depth and age, and use the outbox pattern so saving and publishing cannot get out of step.
:::

:::recap
- Queues give fast responses, absorb **bursts** and **decouple** services.
- Work queues spread messages over **competing consumers**; pub/sub copies them to every subscriber.
- Capacity = workers ÷ time per job; scale on **queue depth and age**.
- Delivery is **at least once**: idempotent consumers, retries, a **dead-letter queue**, the **outbox**.
:::

```quiz
? 10 workers each take 0.2 s per job. What is the capacity?
+ 50 jobs per second
- 10 jobs per second
- 200 jobs per second
- 2 jobs per second
! 10 divided by 0.2.

? Why do queue consumers need to be idempotent?
+ A message can be delivered more than once after a crash or timeout
- Queues sort messages
- To save memory
- Brokers forbid duplicates
! At-least-once delivery is the normal guarantee.

? What problem does the outbox pattern solve?
+ Saving data and publishing an event can get out of step if the service crashes between them
- Slow queries
- Too many consumers
- Message size limits
! Both are written in one transaction.
```
