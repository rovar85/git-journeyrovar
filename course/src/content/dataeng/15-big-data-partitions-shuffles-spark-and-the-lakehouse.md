---
track: dataeng
title: "Big data: partitions, shuffles, Spark and the lakehouse"
short: Big data and Spark
sub: What changes when data no longer fits on one machine, shown with a model of partition pruning, a distributed GROUP BY, data skew and salting, then how Spark and the lakehouse use those ideas.
---

:::goals
- explain why large data is split into partitions and processed in parallel
- explain partition pruning, a shuffle and data skew, and one fix for skew
- read basic PySpark and say what is lazy, what is a transformation and what is an action
- describe a data lake, a warehouse and a lakehouse
:::

:::note Before this lesson
File formats and partitioned folders are in [lesson 9](#dataeng-9). Sharding and hashing ideas are in [Systems 8](#systems-8) and [Systems 9](#systems-9).
:::

## The idea

When data is bigger than one machine's memory or disk, or one machine is too slow, you **split the data into partitions and let many machines work on them at the same time**. That is the whole of "big data"; engines such as **Apache Spark**, Trino, BigQuery and Snowflake differ in details.

Three ideas explain most of their behaviour, and most performance problems:

1. **Partition pruning:** if data is stored by date, a query for one day reads one folder, not all of them. The cheapest work is the work you skip.
2. **Shuffle:** to group or join, all rows with the same key must be on the same worker. Moving rows between workers by `hash(key)` is a **shuffle**: it uses network and disk, and is the expensive step of most jobs.
3. **Skew:** if one key has most of the rows (one giant customer, a NULL key), one worker gets most of the work and the whole job waits for it.

## Run it

A model in plain Python: 300,000 rows, 8 "workers".

```run
mkdir -p ~/lab/de/partition && cd ~/lab/de/partition
cat > partition.py <<'EOF'
# Why big-data engines partition: a model of scanning, partition pruning, a shuffle for GROUP BY, and data skew.
import random, time, zlib
from collections import defaultdict
random.seed(1)
DAYS = [f"2026-03-{d:02d}" for d in range(1, 31)]
rows = [(random.choice(DAYS), "big-corp" if random.random() < 0.6 else f"cust-{random.randrange(200)}", round(random.uniform(1, 100), 2)) for _ in range(300_000)]
print(f"{len(rows):,} rows of (day, customer, amount)\n")
# 1) Partition pruning: store the data in one folder per day, and a query for one day reads one folder.
by_day = defaultdict(list)
for r in rows: by_day[r[0]].append(r)
t = time.perf_counter(); full = sum(a for d, c, a in rows if d == "2026-03-15"); t_full = time.perf_counter() - t
t = time.perf_counter(); pruned = sum(a for d, c, a in by_day["2026-03-15"]); t_pruned = time.perf_counter() - t
print("1) query: total for 2026-03-15")
print(f"   full scan      read {len(rows):>7,} rows  {t_full * 1000:6.1f} ms")
print(f"   one partition  read {len(by_day['2026-03-15']):>7,} rows  {t_pruned * 1000:6.1f} ms   same answer: {abs(full - pruned) < 1e-6}")
# 2) A distributed GROUP BY: rows with the same key must meet on the same worker, so they are SHUFFLED by hash(key) % workers.
W = 8
def shuffle(rows, key_fn):
    parts = [[] for _ in range(W)]
    for r in rows: parts[zlib.crc32(key_fn(r).encode()) % W].append(r)
    return parts
def report(title, parts):
    sizes = [len(p) for p in parts]; avg = sum(sizes) / W
    print(f"   {title}\n      rows per worker: {sizes}\n      largest worker has {max(sizes) / avg:.1f}x the average: the job is as slow as its slowest worker")
print(f"\n2) GROUP BY on {W} workers")
report("group by day (30 evenly sized keys)", shuffle(rows, lambda r: r[0]))
report("group by customer (one customer has 60% of the rows: SKEW)", shuffle(rows, lambda r: r[1]))
# 3) A fix for skew: salting. Split the hot key into several sub-keys, aggregate, then combine.
salted = shuffle(rows, lambda r: r[1] + "#" + str(random.randrange(W)) if r[1] == "big-corp" else r[1])
report("group by customer with the hot key salted (2-step aggregation)", salted)
partial = defaultdict(float)
for p in salted:
    for d, c, a in p: partial[c] += a
check = sum(a for d, c, a in rows if c == "big-corp")
print(f"\n   answer unchanged after salting: {abs(partial['big-corp'] - check) < 1e-6}")
EOF
python3 partition.py
```

What the output shows (row counts are exact; times vary by machine):

1. **Pruning.** The full scan read 300,000 rows; with the data stored per day the same query read 10,038 rows, about one thirtieth, and gave the same answer.
2. **Shuffle by day.** 30 evenly sized keys spread over 8 workers; the largest worker has 1.3 times the average. Healthy.
3. **Shuffle by customer with skew.** One customer has 60% of the rows, so one worker receives 195,019 rows while the others get about 15,000: **5.2 times the average.** Seven workers finish early and wait. In a real cluster that worker may also run out of memory.
4. **Salting.** Adding a random suffix to the hot key spreads its rows over all workers (1.0 times the average); a second, small aggregation combines the pieces. The answer is unchanged.

## Apache Spark

Spark is the most common engine for large batch processing. You write Python (PySpark) or SQL; Spark plans the work and runs it on a cluster. A **driver** plans and coordinates; **executors** do the work on partitions.

```term
# Example (not run here): PySpark
from pyspark.sql import SparkSession, functions as F
spark = SparkSession.builder.appName("orders").getOrCreate()

orders = spark.read.parquet("s3://lake/clean/orders/")           # nothing is read yet
daily = (orders
         .filter(F.col("day") >= "2026-03-01")                   # partition pruning if the data is partitioned by day
         .filter(F.col("status") == "paid")
         .groupBy("day", "country")                              # needs a shuffle
         .agg(F.sum("amount").alias("revenue"), F.countDistinct("customer_id").alias("customers")))
daily.explain()                                                  # show the plan before running it
daily.write.mode("overwrite").partitionBy("day").parquet("s3://lake/marts/daily_revenue/")    # the action: now it runs
```

What to know:

- **Lazy evaluation.** `filter`, `groupBy`, `join` are **transformations**: they only build a plan. An **action** (`write`, `count`, `show`, `collect`) runs it. That lets Spark optimise the whole plan (push filters down, read only needed columns).
- **Narrow and wide.** A narrow transformation (`filter`, `select`) works inside each partition. A wide one (`groupBy`, `join`, `distinct`, `orderBy`) needs a **shuffle** and starts a new **stage**.
- **Joins.** A **broadcast join** sends a small table to every executor and avoids the shuffle; a **sort-merge join** shuffles both sides. Broadcast small dimension tables.
- **Do not `collect()` big data** to the driver, and avoid Python UDFs when a built-in function exists; both are common causes of slow or failing jobs.
- **Adaptive query execution** (on by default in Spark 3) can merge small partitions and split skewed ones at run time, which handles much skew automatically.
- **The Spark UI** shows stages, shuffle sizes and the slowest tasks; one task far slower than its siblings means skew.

## Tuning checklist

1. Read less: partition pruning, column pruning, filter early.
2. Shuffle less: broadcast small tables, aggregate before joining, avoid unnecessary `distinct` and `orderBy`.
3. Fix skew: salting, adaptive execution, handle NULL keys separately.
4. Right-size partitions: roughly 100 to 200 MB each; too many tiny ones waste time, too few huge ones run out of memory.
5. Write sensible files: avoid thousands of small files; compact them.
6. Cache only what is reused several times.

## Lake, warehouse, lakehouse

| | Data lake | Data warehouse | Lakehouse |
|---|---|---|---|
| Storage | files in object storage (S3, GCS, ADLS) | managed by the warehouse | open files (Parquet) in object storage |
| Data | any: raw, semi-structured, images | structured tables | both |
| Transactions, updates | no | yes | yes, through a table format (Delta, Iceberg, Hudi) |
| Engines | many (Spark, Trino, DuckDB) | the warehouse's own | many |
| Risk | becomes a "data swamp" without governance | cost, lock-in | more parts to operate |

Examples: Snowflake, BigQuery and Redshift are warehouses; Databricks popularised the lakehouse; most platforms now offer both styles. The **medallion** layers (bronze, silver, gold) from [lesson 12](#dataeng-12) are how a lakehouse is usually organised.

## Do you need Spark?

Often not. A single machine with **DuckDB** or **Polars** processes tens of gigabytes comfortably, and a cloud warehouse handles terabytes with plain SQL. Spark earns its complexity for very large data, heavy custom transformations, streaming, and ML on big data. **Use the simplest engine that fits the data.**

:::try
In the model: (a) change the hot customer's share from 0.6 to 0.1 and see the skew factor fall; (b) change the number of workers to 16 and note that the skewed worker still has the same hot key, so adding workers does not fix skew; (c) add rows with a NULL customer and decide how you would handle them.
:::

## What is a shuffle in Spark, and why is it expensive?

:::say
A shuffle redistributes rows across the cluster so that rows with the same key end up in the same partition, which group-by, join, distinct and sort need. It is expensive because data is serialised, sent over the network and often written to disk. I reduce shuffles by filtering and selecting early, broadcasting small tables, and aggregating before joining.
:::

## How do you handle data skew?

:::say
First I confirm it in the Spark UI: one task much slower with far more rows than the others. Then I use adaptive query execution's skew join handling, broadcast the small side if possible, treat NULL or default keys separately, or salt the hot key: add a random suffix, aggregate, then aggregate again without it. Adding more executors does not help, because the hot key still lands on one partition.
:::

:::recap
- Big data = **partition the data, process in parallel**.
- **Prune** what you can; **shuffles** are the cost; **skew** makes one worker the bottleneck.
- Spark is **lazy**: transformations build a plan, actions run it; wide transformations shuffle.
- **Lake** = cheap files; **warehouse** = managed tables; **lakehouse** = open files with transactions.
- Use the simplest engine that fits.
:::

```quiz
? Which operation requires a shuffle?
+ groupBy on a key
- filter on a column
- select of two columns
- reading one partition
! Rows with the same key must be brought together.

? One task in a stage processes 60% of the rows. What is this called?
+ Data skew
- Lazy evaluation
- Partition pruning
- A broadcast
! One hot key overloads one partition.

? In Spark, when does the work actually run?
+ When an action such as write, count or show is called
- At each filter call
- When the DataFrame variable is created
- At import time
! Transformations are lazy and only build the plan.
```
