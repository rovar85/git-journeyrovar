---
track: systems
title: "Systems 8: Dynamo, consistent hashing, quorums and vector clocks"
short: Dynamo
sub: The design that shaped a generation of NoSQL stores: spread keys with a hash ring, replicate to N nodes, tune R and W, detect conflicting versions, and repair replicas with Merkle trees.
---


:::goals
- explain consistent hashing and why virtual nodes are used
- choose N, R and W and say what each combination guarantees
- tell whether two versions are ordered or concurrent using a vector clock
- explain anti-entropy with Merkle trees, hinted handoff and "always writable"
:::

:::note Companion to the Dynamo paper
[Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) (2007) is the paper behind much of NoSQL: Cassandra, Riak and others borrowed its ideas ([resource list](#systems-1)). The demos below model the ideas; they are not the Dynamo code.
:::

## 1. The goal: always writable, even when parts are down

Dynamo was built for things like a shopping cart, where refusing a write is worse than briefly showing a stale cart. Its stance, in CAP terms ([Lesson 4](#systems-4)): **stay available during failures, and repair disagreement later.** Five ideas deliver that.

## 2. Idea 1, consistent hashing: spread keys without a reshuffle

To spread keys over servers you could use `hash(key) mod N`. The trouble appears when N changes: almost every key moves. **Consistent hashing** places both servers and keys on a circular space of hash values, and each key belongs to the first server clockwise from it. Adding a server only takes keys from its neighbour.

**Virtual nodes** give each server many positions on the ring, so load evens out and a new server takes a little from everyone. Run it:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > ring.py <<'EOF'
import hashlib, bisect, statistics
def h(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)           # a position on a ring of 2^32 points

class Ring:
    def __init__(self, nodes, vnodes=1):
        self.vnodes, self.points = vnodes, []
        for n in nodes: self.add(n)
    def add(self, node):
        for v in range(self.vnodes): bisect.insort(self.points, (h(f"{node}#{v}"), node))
    def owner(self, key):
        i = bisect.bisect(self.points, (h(key), "")) % len(self.points)       # first node clockwise from the key
        return self.points[i][1]

keys = [f"user:{i}" for i in range(20000)]
nodes = [f"node{i}" for i in range(5)]

print("Adding a 6th node: how many keys change owner?")
before_mod = {k: h(k) % 5 for k in keys}; after_mod = {k: h(k) % 6 for k in keys}
moved_mod = sum(before_mod[k] != after_mod[k] for k in keys)
print(f"  hash(key) mod N        : {moved_mod / len(keys):6.1%} of keys move   (ideal: {1 / 6:.1%})")
for vn in (1, 16, 128):
    r = Ring(nodes, vn); b = {k: r.owner(k) for k in keys}; r.add("node5"); a = {k: r.owner(k) for k in keys}
    print(f"  ring, {vn:3d} virtual nodes : {sum(b[k] != a[k] for k in keys) / len(keys):6.1%} of keys move")

print("\nHow even is the load across 5 nodes? (keys per node, ideal = 4000)")
for vn in (1, 16, 128):
    r = Ring(nodes, vn); counts = {n: 0 for n in nodes}
    for k in keys: counts[r.owner(k)] += 1
    v = list(counts.values())
    print(f"  {vn:3d} virtual nodes: min {min(v):5d}  max {max(v):5d}  max/ideal {max(v) / 4000:4.2f}")
EOF
python3 ring.py
```


The mod-N scheme moves **83%** of the keys when a 6th node joins (the ideal is 17%). The ring moves about 10 to 16%, close to the ideal. And the second table shows why virtual nodes matter: with one position per server the busiest node holds almost **2x** its fair share and the quietest only 16%; with 128 virtual nodes the busiest holds 1.2x. Virtual nodes also let a bigger machine own more positions.

## 3. Idea 2, replication to N nodes

Each key is stored on the **first N distinct servers** clockwise (its **preference list**), commonly N = 3, so a node failure does not lose it.

## 4. Idea 3, tunable quorums: N, R and W

A write is acknowledged after **W** replicas confirm; a read asks **R** replicas and returns the newest. If **R + W > N**, the read set and the last write set **must overlap** in at least one replica, so a read sees the latest acknowledged write (absent concurrent writes and failures). The script writes to W random replicas and reads from R random ones and counts stale reads:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > quorum.py <<'EOF'
import random
random.seed(4)
N = 3
def trial(R, W, writes=2000):
    """Replicas hold (version, value). A write reaches W random replicas (the rest are slow or down). A read asks R random replicas and takes the newest."""
    replicas = [(0, "v0")] * N
    stale = 0
    for v in range(1, writes + 1):
        for i in random.sample(range(N), W): replicas[i] = (v, f"v{v}")
        got = max(replicas[i] for i in random.sample(range(N), R))
        stale += got[0] != v
    return stale / writes
print(f"N = {N} replicas. A read right after a write is stale if the read set misses every replica that took the write.")
print(f"{'R':>2} {'W':>2} {'R+W>N?':>7} {'stale reads':>12}   meaning")
for R, W, note in ((1, 1, "fast, but can read old data"), (2, 2, "quorum: every read overlaps the last write"), (1, 3, "writes slow, reads fast"), (3, 1, "reads slow, writes fast"), (2, 1, "R+W = N: not enough")):
    print(f"{R:2d} {W:2d} {'yes' if R + W > N else 'no':>7} {trial(R, W):12.1%}   {note}")

print("\nVector clocks: which version is newer, or are they concurrent (a conflict to merge)?")
def compare(a, b):
    keys = set(a) | set(b)
    ge = all(a.get(k, 0) >= b.get(k, 0) for k in keys); le = all(a.get(k, 0) <= b.get(k, 0) for k in keys)
    return "equal" if ge and le else "a is newer" if ge else "b is newer" if le else "CONCURRENT (conflict)"
cart1 = {"A": 1}                          # written through server A
cart2 = {"A": 2}                          # A updates again: descends from cart1
cart3 = {"A": 1, "B": 1}                  # B updated cart1 without seeing cart2
print("  cart1 vs cart2:", compare(cart1, cart2))
print("  cart2 vs cart3:", compare(cart2, cart3))
print("  merge result clock:", {k: max(cart2.get(k, 0), cart3.get(k, 0)) for k in ("A", "B")})
EOF
python3 quorum.py
```


- `R=1, W=1`: fastest, but **68%** of reads right after a write are stale.
- `R=2, W=2` (with N = 3): **0** stale reads; the common balanced choice and tolerates one slow or dead node on each path.
- `R=1, W=3`: reads are fast, writes need every replica.
- `R=3, W=1`: reads are slow, writes are fast.
- `R=2, W=1`: R + W = N is **not** enough: 32% stale.

These percentages come from this random model, which assumes the write reached a random subset; the guarantee "R + W > N means overlap" is exact. It is also **not linearizability**: concurrent operations and failures can still show odd results, which is [Lesson 10](#systems-10).

**Sloppy quorums and hinted handoff:** when a replica in the preference list is down, a write can go to the next healthy node with a **hint** ("hold this for node C"), and that node hands the data over when C returns. It keeps writes available at the price of weaker guarantees.

## 5. Idea 4, vector clocks: detect conflicting versions

Because Dynamo accepts writes during failures, two clients can update the same key on different replicas without seeing each other. A **vector clock** keeps one counter per server that touched the value. Comparing two clocks tells you whether one version **descends** from the other (the newer wins) or they are **concurrent** (a real conflict).

In the second half of the output above: `cart2` (A updated again) descends from `cart1`, so it is newer. But `cart2` and `cart3` (B updated cart1 without seeing A's second update) are **concurrent**. Dynamo returns both to the application, which **merges** them (for a cart: take the union of items) and writes the merge with a clock that dominates both. The alternative, "last write wins by timestamp", is simpler but silently discards one side ([Lesson 4](#systems-4)). Modern designs also use **CRDTs**, data types such as counters and sets that merge by definition.

## 6. Idea 5, anti-entropy with Merkle trees

Replicas drift apart (a missed write, a dead node). Comparing every key between two replicas would be far too expensive. A **Merkle tree** hashes each key range, then hashes of hashes up to a single root. If the roots match, the replicas agree. If not, walk down only the branches whose hashes differ.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > merkle.py <<'EOF'
import hashlib
def H(x): return hashlib.sha256(x.encode()).hexdigest()[:8]
def tree(items):                                            # leaves = hash of each (key,value); parents = hash of children
    level = [H(f"{k}={v}") for k, v in items]; levels = [level]
    while len(level) > 1:
        level = [H("".join(level[i:i + 2])) for i in range(0, len(level), 2)]; levels.append(level)
    return levels
N = 1024
a = [(f"k{i:04d}", f"v{i}") for i in range(N)]
b = list(a); b[700] = ("k0700", "DIFFERENT")                  # replica B missed one update
ta, tb = tree(a), tree(b)
print("root A", ta[-1][0], "| root B", tb[-1][0], "->", "in sync" if ta[-1] == tb[-1] else "different, walk down")
idx, compared = 0, 1
for lvl in range(len(ta) - 2, -1, -1):
    left = idx * 2
    compared += 2
    idx = left if ta[lvl][left] != tb[lvl][left] else left + 1
print(f"found the differing key {a[idx][0]} after comparing {compared} hashes, instead of {N} key-by-key comparisons")
EOF
python3 merkle.py
```


Finding the one differing key among 1,024 took 21 hash comparisons instead of 1,024 key comparisons, and the work grows with the **logarithm** of the data. Replicas exchange these trees in the background to repair themselves.

## 7. Membership by gossip

Nodes periodically tell a few random peers what they know about who is alive. Information spreads exponentially fast without a central coordinator, so there is no single point of failure for membership.

## What to say in an interview

"Dynamo-style systems favour availability: consistent hashing with virtual nodes spreads and rebalances data, each key is replicated on N nodes, R and W are tunable with R + W > N giving overlapping quorums, conflicts are detected with vector clocks and merged by the application, and replicas are repaired with hinted handoff and Merkle-tree anti-entropy."

## Common misconceptions

- "NoSQL means no consistency." It means you choose your consistency per operation.
- "R + W > N gives linearizability." It gives overlap; strict guarantees need more.
- "Last write wins is safe." It silently loses data when clocks or concurrency disagree.

## Practice (answers below)

1. N = 5. Pick R and W for a read-heavy workload that must still read the latest write.
2. A ring has 4 nodes, 1 position each. A fifth joins. About what fraction of keys move, on average?
3. Two vector clocks: {A: 3, B: 1} and {A: 2, B: 2}. Newer, or concurrent?

:::recap
- **Consistent hashing + virtual nodes** moves about 1/N of keys when nodes change, instead of nearly all.
- **N, R, W**: R + W > N makes read and write sets overlap; lower values trade freshness for speed.
- **Vector clocks** distinguish "newer" from "concurrent"; concurrent versions must be merged.
- **Merkle trees, hinted handoff and gossip** keep replicas repaired and membership current.
:::

:::note Answers
1. For example W = 5, R = 1 (reads are cheapest, writes need all) or W = 4, R = 2; both satisfy R + W > 5. W = 5 makes writes fail when any node is down, so a balanced choice such as R = 3, W = 3 is common. 2. About 1/5 = 20%, if positions are balanced (with one position each the real number varies a lot, as the demo shows). 3. Concurrent: the first has a higher A counter, the second has a higher B counter, so neither descends from the other.
:::

```quiz
? Why is hash(key) mod N a poor way to place keys when servers are added?
+ Changing N changes the home of almost every key, causing a huge data move
- It is too slow to compute
- It cannot be used with strings
- It loses data
! Consistent hashing moves only about 1/N of the keys.

? In a 3-replica system, which settings guarantee a read sees the latest acknowledged write?
+ R = 2 and W = 2
- R = 1 and W = 1
- R = 2 and W = 1
- R = 1 and W = 2
! R + W must be greater than N, so the read and write sets overlap.

? Two versions have vector clocks that neither dominates. What does that mean?
+ They were written concurrently and need to be merged
- One is corrupt
- The newer one wins automatically
- They are identical
! Concurrent versions are a real conflict that the application or a CRDT must resolve.
```
