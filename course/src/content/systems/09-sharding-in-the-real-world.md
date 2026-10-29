---
track: systems
title: "Systems 9: sharding, choosing a shard key and surviving growth"
short: Sharding
sub: When to shard, how to choose a key, why hot shards and resharding hurt, and how many small logical shards make growth cheap. Runnable models.
---


:::goals
- say when sharding is the right answer and what to try first
- compare range and hash sharding, and explain hot shards
- explain why resharding with `hash mod N` is costly and how logical shards fix it
- list the costs of sharding: cross-shard queries, transactions, joins, operations
:::

:::note Companion to the Figma article
[How Figma's databases team lived to tell the scale](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/) is an account from a real team about scaling their databases ([resource list](#systems-1)). I could not open it from here, so this lesson does not summarise it: read it as a real example of the decisions below, and compare their choices with the trade-offs here.
:::

## 1. Do not shard first

Sharding means splitting one logical database across several machines so that each holds part of the data. It buys capacity for writes and storage, and it costs complexity forever. Before you shard, in this order:

1. **Fix the queries and indexes** ([Lesson 3](#systems-3)). Most "we need to scale" problems are missing indexes.
2. **Cache** hot reads.
3. **Scale up** (a bigger machine is cheap compared with engineering time, up to a point).
4. **Add read replicas** for read-heavy load ([Lesson 4](#systems-4)); this does not help writes.
5. **Partition tables** inside one server (per month, per tenant) to keep indexes small and to drop old data cheaply.
6. **Move rarely-joined data** (for example, logs or events) to another database (vertical split).
7. Only then **shard** the data that truly outgrows one machine.

## 2. The shard key decides everything

Every row must say which shard it lives on, computed from a **shard key** (tenant id, user id, order id). The key should be:

- **Present in almost every query**, so one query goes to one shard.
- **High cardinality and evenly used**, so shards fill evenly.
- **Stable**: moving a row between shards is expensive.

**Range sharding** (ids 1 to 1,000 on shard 1, and so on) keeps neighbours together, which helps range queries but concentrates new and popular keys on one shard. **Hash sharding** spreads keys evenly but scatters ranges. **Directory sharding** looks up each key in a mapping table; flexible, but the table becomes critical infrastructure.

## 3. Hot shards: even keys, uneven load

The next script gives 1,000 tenants a skewed (Zipf-like) amount of traffic, like a SaaS product where a few customers are huge, and places them on 8 shards:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > shard.py <<'EOF'
import random, hashlib, math
random.seed(8)
def h(x): return int(hashlib.md5(str(x).encode()).hexdigest()[:8], 16)
SHARDS = 8
# 1,000 tenants. A few big tenants produce most of the traffic (a Zipf-like distribution).
tenants = list(range(1000))
weight = {t: 1 / (t + 1) ** 1.1 for t in tenants}
total = sum(weight.values())
def load_by_shard(placement):
    load = [0.0] * SHARDS
    for t in tenants: load[placement(t)] += weight[t] / total
    return load
def report(name, load):
    ideal = 1 / SHARDS
    print(f"  {name:34} hottest shard {max(load) / ideal:4.2f}x the fair share, coldest {min(load) / ideal:4.2f}x")

print("1) Where a skewed workload lands (fair share = 1.00x)")
report("range: tenant id // 125", load_by_shard(lambda t: t // 125))
report("hash(tenant) mod 8", load_by_shard(lambda t: h(t) % SHARDS))
print("   -> hashing spreads the KEYS evenly, but one huge tenant is still one key: it can only live on one shard")
print(f"   the single biggest tenant carries {weight[0] / total:.0%} of all traffic; no shard key can split it (you need to split the tenant)")

print("\n2) Resharding cost: going from 4 to 5 machines")
keys = range(100_000)
mv = sum(h(k) % 4 != h(k) % 5 for k in keys) / len(keys)
print(f"  hash mod machines                : {mv:5.1%} of rows move")
LOGICAL = 256                                    # many small logical shards, mapped to few machines
assign4 = {s: s % 4 for s in range(LOGICAL)}
assign5 = dict(assign4)
counts = {m: [s for s in range(LOGICAL) if assign4[s] == m] for m in range(4)}
need = LOGICAL // 5
for m in range(4):                               # each machine hands a share of its logical shards to the new machine 4
    for s in counts[m][: len(counts[m]) - need]: assign5[s] = 4
moved = sum(assign4[s] != assign5[s] for s in range(LOGICAL)) / LOGICAL
print(f"  256 logical shards, move whole ones: {moved:5.1%} of rows move  (the minimum possible is {1 / 5:.0%})")
print(f"  a row's logical shard never changes: shard = hash(key) % {LOGICAL}; only the shard -> machine table changes")

print("\n3) The price of a query that does not include the shard key")
def lat(): return random.lognormvariate(math.log(8), 0.3) + (random.uniform(80, 250) if random.random() < 0.01 else 0)
def p(xs, q): xs = sorted(xs); return xs[int(q * len(xs))]
one = [lat() for _ in range(20000)]
fan = [max(lat() for _ in range(SHARDS)) for _ in range(20000)]
print(f"  query to one shard (key known)   : p50 {p(one, .5):5.1f} ms  p99 {p(one, .99):6.1f} ms")
print(f"  query to all {SHARDS} shards (scatter)  : p50 {p(fan, .5):5.1f} ms  p99 {p(fan, .99):6.1f} ms   (and {SHARDS}x the work)")
EOF
python3 shard.py
```


- **Part 1:** range sharding puts 6.3x the fair share on one shard (and 0.10x on another); hashing improves it to 2.1x, but not to 1.0x, because **the biggest tenant alone carries 18% of the traffic and a key cannot be split**. The remedy is to split that tenant's data across more than one shard (a compound key such as tenant plus bucket) or to give very large tenants their own shard.
- **Part 2: resharding.** Moving from 4 to 5 machines with `hash mod machines` relocates **about 80%** of the rows. The standard fix is **many small logical shards** (here 256) mapped to few machines: a row's logical shard never changes, and growth moves **whole logical shards** to the new machine. The model moves 20.3% of the rows, close to the minimum possible 20%. This is the idea behind "pre-split into many partitions" in several distributed databases and in application-level sharding schemes.
- **Part 3: the price of a query without the shard key.** It must go to every shard (**scatter-gather**) and wait for the slowest one: the p99 grows from about 93 ms to about 235 ms in the model, with 8x the work, which is the fan-out arithmetic of [Lesson 5](#systems-5).

## 4. What sharding makes harder

- **Cross-shard joins and queries:** denormalise, keep related data on the same shard (shard by tenant so a tenant's tables stay together), or build a separate search or analytics store.
- **Cross-shard transactions:** use a single shard for anything that must be atomic, or accept sagas (a sequence of local transactions with compensating steps) instead of two-phase commit.
- **Unique ids:** auto-increment counters do not work across shards; use random UUIDs, time-ordered ids or a per-shard prefix.
- **Schema changes and backups** now run on every shard; automate them.
- **Rebalancing live:** the standard plan is dual-write or change-data-capture to copy a logical shard, verify it, switch routing atomically, then delete the old copy. Plan it before you need it.
- **Monitoring:** watch per-shard size, load and p99; a single hot shard is invisible in a fleet average.

## 5. A decision checklist for the interview

1. What is the access pattern and what is the shard key?
2. How big will the largest tenant be?
3. How do I add capacity without moving most of the data?
4. Which queries do not carry the key, and what do they cost?
5. What are my transactions, and do they fit inside one shard?

## Common misconceptions

- "Hash sharding removes hot spots." It balances keys, not load.
- "Sharding scales reads and writes for free." It scales what the key allows; everything else gets harder.
- "I can choose the shard key later." Changing it means rewriting all the data.

## Practice (answers below)

1. A chat product shards by `user_id`. A "show the conversation between A and B" query needs both users. What is the problem and a fix?
2. You have 4 machines with 256 logical shards and add a fifth. How many logical shards should the new machine receive?
3. Name two signs that you have a hot shard.

:::recap
- Try **indexes, caching, replicas, partitioning and a bigger machine** before sharding.
- The **shard key** must be in almost every query, high cardinality and stable.
- **Hot shards** come from skewed load; hashing balances keys but not one huge tenant.
- **Many logical shards** make resharding cheap (move whole shards), unlike `hash mod N`.
- Costs: **scatter-gather queries, cross-shard transactions, unique ids, operations**.
:::

:::note Answers
1. The conversation lives on two shards, so the query must contact both or duplicate data; fix by storing each message under both participants' shards or under a conversation id used as the shard key. 2. About 256 / 5 = 51 logical shards, taken in roughly equal numbers from the four existing machines. 3. One shard has much higher CPU, queue depth or p99 than the others, or one shard fills its disk first.
:::

```quiz
? Why is hash(key) mod N expensive when the number of machines changes?
+ Almost every key maps to a different machine, so most data must move
- It cannot be computed on the new machine
- It breaks indexes
- It is not deterministic
! Using many logical shards mapped to machines avoids moving most of the data.

? Hashing balances keys across shards. Why can a shard still be hot?
+ One key (such as a huge tenant) can carry much of the load and cannot be split by the hash
- Hash functions are biased
- Shards have different sizes
- Replicas are out of sync
! Load per key is uneven; a key lives on one shard.

? What is the cost of a query that does not include the shard key?
+ It must go to every shard and wait for the slowest, adding load and tail latency
- It is rejected
- It runs on a random shard
- It is cached automatically
! Scatter-gather multiplies work and exposes the tail.
```
