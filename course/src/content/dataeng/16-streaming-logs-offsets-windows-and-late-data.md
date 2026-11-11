---
track: dataeng
title: "Streaming: logs, offsets, windows and late data"
short: Streaming
sub: Batch versus streaming, how a Kafka-style log keeps order with partitions and offsets, why messages arrive twice and how to make that harmless, and how windows deal with late events.
---

:::goals
- decide between batch and streaming for a use case
- explain topics, partitions, offsets and consumer groups
- explain at-least-once delivery and why consumers must be idempotent
- explain event time, tumbling windows, watermarks and late events
:::

@widget viz_kafka

:::note Before this lesson
Idempotency is explained in [Systems 7](#systems-7) and upserts in [lesson 6](#dataeng-6).
:::

## The idea

**Batch** processing handles data in chunks on a schedule: "every night, process yesterday". **Streaming** handles each event shortly after it happens, continuously. Streaming is harder to build and operate, so choose it only when the business needs the answer within seconds or minutes: fraud detection, live inventory, alerts, real-time personalisation. If "an hour later" is fine, a frequent batch is simpler.

The centre of most streaming systems is a **log**: an append-only, ordered sequence of events that many readers can read at their own pace. **Apache Kafka** is the best-known one (others: Redpanda, Amazon Kinesis, Google Pub/Sub, Azure Event Hubs).

- A **topic** is a named stream of events, split into **partitions**.
- An event's **key** chooses its partition (`hash(key) % partitions`). **Order is guaranteed only inside one partition**, so events of one customer stay in order if the customer id is the key.
- Each event in a partition has an **offset**: 0, 1, 2 ...
- A **consumer** reads from an offset and periodically **commits** how far it has got. A **consumer group** shares the partitions among its members so work is done in parallel; adding consumers up to the number of partitions scales reading.
- Events are **kept** for a retention period, so a consumer can **replay** from an earlier offset.

## Run it

A model with no Kafka needed: a 3-partition topic, a consumer that crashes, and windows with a late event.

```run
mkdir -p ~/lab/de/stream && cd ~/lab/de/stream
cat > stream.py <<'EOF'
# Streaming ideas with no Kafka needed: a partitioned log, offsets, at-least-once delivery, idempotent processing, windows and late events.
import zlib
from collections import defaultdict
class Topic:                                   # an append-only log split into partitions; order is kept inside one partition
    def __init__(s, n): s.parts = [[] for _ in range(n)]
    def send(s, key, value): p = zlib.crc32(key.encode()) % len(s.parts); s.parts[p].append((key, value)); return p
topic = Topic(3)
events = [("asha", {"id": 1, "amount": 20, "t": 0}), ("ben", {"id": 2, "amount": 5, "t": 12}), ("asha", {"id": 3, "amount": 35, "t": 31}),
          ("chen", {"id": 4, "amount": 12, "t": 44}), ("ben", {"id": 5, "amount": 80, "t": 62}), ("asha", {"id": 6, "amount": 10, "t": 75}),
          ("chen", {"id": 7, "amount": 9, "t": 58})]            # id 7 happened at t=58 but ARRIVES after t=75: a late event
for k, v in events: topic.send(k, v)
print("1) the log: the same key always goes to the same partition, so one customer's events stay in order")
for i, p in enumerate(topic.parts): print(f"   partition {i}: {[(k, v['id']) for k, v in p]}")
# 2) A consumer reads from an offset and commits it AFTER processing. Crash before the commit -> the batch is delivered again (at-least-once).
def consume(part, start, crash_after=None):
    seen = []
    for off in range(start, len(part)):
        seen.append(part[off][1])
        if crash_after is not None and len(seen) == crash_after: return seen, start          # crashed: offset NOT committed
    return seen, len(part)
flat = [e for p in topic.parts for e in p]
total_naive, total_idem, done_ids, committed = 0, 0, set(), 0
for attempt, crash in enumerate([4, None], 1):
    batch, new_commit = consume(flat, committed, crash_after=crash)
    for ev in batch:
        total_naive += ev["amount"]                                   # naive: counts replays twice
        if ev["id"] not in done_ids: done_ids.add(ev["id"]); total_idem += ev["amount"]   # idempotent: remembers what it has done
    print(f"2) attempt {attempt}: processed {len(batch)} events, committed offset {committed} -> {new_commit}" + ("   (crashed before commit)" if new_commit == committed else ""))
    committed = new_commit
true_total = sum(v["amount"] for _, v in events)
print(f"   true total {true_total} | naive consumer {total_naive} (double counted) | idempotent consumer {total_idem}")
# 3) Windows use EVENT time (when it happened), not arrival time. A watermark decides how long to wait for late events.
def windows(events, size, allowed_lateness):
    out, closed, watermark, dropped = defaultdict(int), set(), 0, []
    for _, ev in events:                                              # in arrival order
        w = ev["t"] // size * size
        watermark = max(watermark, ev["t"] - allowed_lateness)
        if w + size <= watermark and w in closed: dropped.append(ev["id"]); continue
        out[w] += ev["amount"]
        closed |= {x for x in out if x + size <= watermark}
    return dict(sorted(out.items())), dropped
print("3) 30-second tumbling windows of revenue by event time")
for late in (0, 30):
    res, dropped = windows(events, 30, late)
    print(f"   allowed lateness {late:2d} s -> {res}  dropped late events: {dropped}")
print("   Waiting longer gives complete numbers but later results: that is the trade-off every streaming job makes.")
EOF
python3 stream.py
```

What happened:

1. **The log.** All of asha's events are in partition 1, in order; ben's are in partition 2. (Partition 0 is empty: with only three keys the hash happened to use two partitions.)
2. **A crash.** The consumer processed 4 events and crashed **before committing its offset**. On restart it began again from offset 0 and processed all 7. Those first 4 events were delivered **twice**. This is **at-least-once** delivery, the normal guarantee. The naive consumer's total is 248 instead of the true 171. The **idempotent** consumer remembers which event ids it has handled and gets 171.
3. **Windows.** Revenue per 30-second window by **event time**. Event 7 happened at t=58 (window 30 to 60) but arrived after an event from t=75. With no allowed lateness the window had already closed and the event was **dropped** (the window shows 47, which is wrong). Waiting 30 seconds longer includes it (56, correct), at the price of later results.

## Delivery guarantees

| Guarantee | Meaning | How |
|---|---|---|
| At-most-once | may lose events, never duplicates | commit before processing |
| **At-least-once** | never loses, may duplicate | commit after processing (the usual choice) |
| Exactly-once (effectively) | each event affects the result once | at-least-once **plus** idempotent or transactional writes |

"Exactly-once" in practice means **at-least-once delivery with an idempotent sink**: upsert by event id, or write the results and the offset in one transaction. Design every consumer so that seeing an event twice is harmless.

## Time and windows

- **Event time** is when it happened; **processing time** is when you saw it. Mobile apps, retries and network delays mean events arrive late and out of order. Use event time for correct business numbers.
- **Tumbling window:** fixed, non-overlapping (every 30 seconds). **Sliding / hopping window:** overlapping (last 5 minutes, updated every minute). **Session window:** activity separated by gaps of silence.
- A **watermark** is the engine's estimate that "no events older than T will arrive". Windows that end before the watermark are closed and emitted. A larger allowed lateness gives more complete but later results.
- Very late events go to a **dead-letter** or side output and are corrected by a batch job.

## The tools

```term
# Example (not run here): Spark Structured Streaming reading Kafka, 30-second windows with a 30-second watermark
events = (spark.readStream.format("kafka").option("subscribe", "orders").load()
          .select(F.from_json(F.col("value").cast("string"), schema).alias("e")).select("e.*"))
revenue = (events.withWatermark("event_time", "30 seconds")
           .groupBy(F.window("event_time", "30 seconds")).agg(F.sum("amount").alias("revenue")))
revenue.writeStream.outputMode("update").option("checkpointLocation", "s3://lake/chk/revenue").toTable("revenue_30s")
```

- **Processing engines:** Apache Flink (true streaming, strong state handling), Spark Structured Streaming (micro-batches, same API as batch), Kafka Streams and ksqlDB (inside the Kafka ecosystem).
- **Change data capture (CDC):** Debezium reads a database's change log into Kafka, giving a stream of every insert, update and delete ([lesson 10](#dataeng-10)).
- **Schema registry:** producers and consumers agree on the event schema (Avro or Protobuf) and its allowed changes, so a producer cannot break consumers.
- **Checkpoint:** the engine saves offsets and state, so it restarts where it stopped.

## What to monitor

- **Consumer lag:** how far the consumer is behind the newest offset. Rising lag means the consumer is too slow or stuck. It is the most important streaming metric.
- Throughput, processing time per event, error and dead-letter counts, and end-to-end delay (event time to result).

:::try
1. Make the consumer commit **before** processing and crash after 4 events: which events are lost (at-most-once)? 2. Use the order id as the message key instead of the customer and see how the partitions change; what ordering guarantee do you lose? 3. Change the window size to 60 seconds.
:::

## When would you choose streaming over batch?

:::say
When the value of the data falls within seconds or minutes: fraud checks, alerting, live stock levels. Streaming costs more to build and run: ordering, duplicates, late data, state and constant operation. If results an hour or a day later are acceptable I choose batch or micro-batch, and I often start with batch and move the parts that need it to streaming.
:::

## How do you get exactly-once processing?

:::say
True exactly-once delivery is not practical, so I combine at-least-once delivery with an idempotent or transactional sink. The consumer commits its offset only after processing, so nothing is lost, and the write is an upsert by event id, or the results and the offset are stored in one transaction, so a redelivered event changes nothing.
:::

:::recap
- **Batch** = chunks on a schedule; **streaming** = continuous, for low-latency needs.
- A log has **topics, partitions, offsets**; order holds **within a partition**; the **key** picks the partition.
- Delivery is **at-least-once**: make consumers **idempotent**.
- Use **event time**; **windows** and **watermarks** trade completeness for delay.
- Watch **consumer lag**.
:::

```quiz
? A consumer crashes after processing a batch but before committing its offset. What happens on restart?
+ It reads the same events again, so the processing must be idempotent
- The events are lost
- Kafka deletes the topic
- Nothing; offsets commit themselves before processing
! That is at-least-once delivery.

? How do you keep all events of one customer in order?
+ Use the customer id as the message key so they go to one partition
- Use a random key
- Use more partitions
- Sort them in the dashboard
! Order is guaranteed only inside a partition.

? What does a larger allowed lateness (watermark delay) give you?
+ More complete results, delivered later
- Faster results with fewer events
- Fewer partitions
- Smaller messages
! It is the completeness versus latency trade-off.
```
