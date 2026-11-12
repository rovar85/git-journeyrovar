---
track: sysdesign
title: "Data at scale: replicas, partitions and choosing a store"
short: Data at scale
sub: Read replicas and the replication lag they bring, read-your-writes, partitioning by key or range, and how to choose between relational, key-value, document, wide-column, search and object stores.
---

:::goals
- add read capacity with replicas and handle replication lag
- partition data by a key and avoid hot partitions
- choose a data store from the access pattern
- explain the consistency trade-off in one sentence
:::

## Read replicas

A **replica** is a copy of the database that follows the **primary** by replaying its changes. Reads can go to replicas; writes still go to the primary. That multiplies read capacity, and a replica can be promoted if the primary fails ([Systems 4](#systems-4)). The catch is **replication lag**: a replica is a little behind.

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > replica.py <<'EOF'
# Read replicas: more read capacity, but replication lag means a user may not see their own change.
LAG_MS = 300                                   # how far the replica is behind the primary
primary, replica, pending = {}, {}, []         # pending = changes still travelling to the replica
def write(t, k, v): primary[k] = v; pending.append((t + LAG_MS, k, v))
def tick(t):
    for item in [p for p in pending if p[0] <= t]: replica[item[1]] = item[2]; pending.remove(item)
def read(t, k, policy, last_write=None):
    tick(t)
    if policy == "replica": return replica.get(k)
    if policy == "read-your-writes" and last_write is not None and t - last_write < 1000: return primary.get(k)   # recent writer: read the primary
    return replica.get(k) if policy != "primary" else primary.get(k)
write(0, "bio", "old bio"); tick(1000)
write(1000, "bio", "NEW bio")                  # the user saves their profile at t = 1000 ms ...
for policy in ("replica", "read-your-writes", "primary"):
    seen = read(1050, "bio", policy, last_write=1000)  # ... and the page reloads 50 ms later
    print(f"{policy:17} -> the user sees {seen!r}")
tick(1400); print(f"after {LAG_MS} ms the replica catches up: {replica['bio']!r}")
print("\nCapacity: one primary handles 5,000 reads/s; each replica adds 5,000. Writes still all go to the primary.")
for r in (0, 2, 4): print(f"   primary + {r} replicas: {5000 * (1 + r):,} reads/s, writes unchanged")
EOF
python3 replica.py
```

The user saved a new bio and reloaded 50 ms later. Reading from the replica showed the **old** bio, because the change was still 250 ms away from arriving. That is the classic replica bug. Two common fixes: **read-your-writes** (send a user's reads to the primary for a short time after they write, as here) or include the write's position and wait until the replica has reached it. Replicas also do nothing for **write** capacity: every write still lands on one primary.

## Partitioning

When writes or data size outgrow one machine, split the data into **partitions** (shards), each owned by one node:

| Method | How | Good at | Watch out for |
|---|---|---|---|
| **Hash of a key** | `hash(user_id) % shards`, or consistent hashing | even spread | range queries hit every shard |
| **Range** | users A to F on shard 1, and so on, or by date | range scans | hot ranges (today's dates) |
| **Directory** | a lookup table says where each key lives | flexibility | the directory itself must scale |

Choose the partition key from the most common query, so that most queries touch one shard. A **hot key** (a celebrity, a viral product) can overload its shard whatever the method; split that key further or cache it. Resharding live data is hard, so leave room to grow ([Systems 9](#systems-9)).

## Choosing a store

| Store | Data shape | Strength | Examples |
|---|---|---|---|
| **Relational** | tables, joins, constraints | transactions, flexible queries; the default | PostgreSQL, MySQL |
| **Key-value** | one value per key | very fast lookups, simple scaling | Redis, DynamoDB |
| **Document** | JSON documents | flexible fields, one record per read | MongoDB, Firestore |
| **Wide-column** | rows with many columns, partitioned | huge write volumes, time series | Cassandra, Bigtable |
| **Search** | inverted index | full-text search, filters, ranking | Elasticsearch, OpenSearch |
| **Object** | files (blobs) | cheap, huge, durable | S3, GCS, Azure Blob |
| **Warehouse** | columnar tables | analytics over billions of rows | BigQuery, Snowflake ([data track](#dataeng-17)) |

Start relational unless a requirement rules it out, and say which requirement. Large systems usually combine several: relational for orders, object storage for images, a search index for the catalogue, a cache in front.

## Consistency in one sentence

When the network splits, a replicated system must choose between answering (possibly with stale data) and staying correct (refusing some requests); even without failures, stronger consistency costs latency. Name what each part of your design needs: a bank balance needs strong consistency, a like counter does not ([Systems 10](#systems-10)).

## How do you scale a database?

:::say
First the cheap steps: indexes, query fixes, caching and a bigger machine. For reads I add replicas and handle replication lag, for example with read-your-writes. When writes or data size outgrow one machine I partition by a key chosen from the main access pattern, watching for hot keys, and I may move some data to stores that fit it better, like object storage or a search index.
:::

:::recap
- **Replicas** add read capacity and failover, not write capacity; mind **replication lag**.
- **Read-your-writes** stops users seeing their own change disappear.
- **Partition** by the key of the main query; watch for **hot keys**.
- Start **relational**; add specialised stores for specific needs.
:::

```quiz
? A user updates their profile and the page shows the old one. The likely cause?
+ The read went to a replica that had not yet received the change
- The cache is too big
- The primary lost the write
- DNS
! Replication lag; route that user's reads to the primary briefly.

? Which method spreads keys evenly but makes range queries touch every shard?
+ Hash partitioning
- Range partitioning
- A single database
- Read replicas
! Neighbouring keys end up on different shards.

? Where should 100 million user-uploaded videos be stored?
+ Object storage, with metadata in a database
- A relational table of BLOBs
- Redis
- The search index
! Object storage is built for large, durable files.
```
