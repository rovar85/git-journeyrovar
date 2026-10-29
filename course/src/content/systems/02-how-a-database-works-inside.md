---
track: systems
title: "Systems 2: how a database stores data, caches pages and handles concurrent writes"
short: How databases work
sub: Pages and B-trees, the buffer pool, and a lost update caused by two clients, with a B+tree, an LRU cache and real SQLite transactions you can run.
---


:::goals
- explain why databases read and write fixed-size **pages**, and why that makes the **B-tree** the default index
- compute how many page reads a lookup needs and why the tree stays shallow
- explain what the **buffer pool** does and how hit rate changes with its size
- show a **lost update**, and prevent it with an atomic statement or a transaction
:::

:::note Companion to the CMU lectures
This lesson pairs with the B-tree, buffer pool and concurrency-control lectures of CMU 15-445 ([resource list](#systems-1)). The code is a toy: it shows the idea with real numbers, not how a production engine is built.
:::

## 1. The one fact that explains everything: disks are read in pages

A disk (or SSD) cannot hand you one row; it hands you a **page**, typically 4 to 16 KB. The cost of a query is therefore mostly **how many pages it touches** and how many of those come from memory instead of disk. A database is organised around that: tables and indexes are stored as pages, a cache keeps hot pages in memory, and the index structure is chosen to touch as few pages as possible.

## 2. The B-tree: a tree with a huge fan-out

A **B+tree** keeps keys in sorted order in a tree of pages. Each inner page holds **hundreds** of keys that point to child pages, so the tree is very flat. Looking up one key walks from the root to a leaf: one page read per level. The tree below is built for real (a bulk-loaded B+tree with 64 keys per page, kept deliberately small) and every lookup counts the pages it reads.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > btree.py <<'EOF'
import math, random
# A bulk-loaded B+tree held in "pages". Every page touched during a lookup costs one disk read.
FANOUT = 64                                   # keys per page (real databases: ~100-500 for 8 KB pages)
def build(keys):
    keys = sorted(keys)
    leaves = [keys[i:i + FANOUT] for i in range(0, len(keys), FANOUT)]
    levels = [leaves]
    nodes = [(page[0], page) for page in leaves]               # (smallest key, page)
    while len(nodes) > 1:
        parents = []
        for i in range(0, len(nodes), FANOUT):
            group = nodes[i:i + FANOUT]
            parents.append((group[0][0], group))
        levels.append([g for _, g in parents]); nodes = parents
    return nodes[0][1], len(levels)

def search(root, height, key):
    reads, page = 0, root
    for level in range(height - 1):                            # walk down the inner pages
        reads += 1
        child = page[0]
        for entry in page:
            if entry[0] <= key: child = entry
        page = child[1]
    reads += 1                                                 # the leaf page
    return key in page, reads

N = 1_000_000
keys = list(range(0, N * 3, 3))
root, height = build(keys)
random.seed(1)
probe = [random.choice(keys) for _ in range(1000)]
reads = [search(root, height, k)[1] for k in probe]
print(f"{N:,} keys, {FANOUT} keys per page -> tree height {height}; every lookup read {min(reads)}-{max(reads)} pages")
print(f"a full scan would read about {N // FANOUT:,} pages\n")
print(f"{'rows':>14} {'height at fanout 64':>20} {'at fanout 300':>14}")
for n in (1_000, 1_000_000, 1_000_000_000):
    print(f"{n:14,} {math.ceil(math.log(n, 64)):20d} {math.ceil(math.log(n, 300)):14d}")
EOF
python3 btree.py
```


One million keys fit in a tree of height 4, so any lookup reads **4 pages**, while a full scan reads about 15,000. With real pages holding about 300 keys, a billion rows still need only 4 levels. That is why "add an index" can turn a minute into a millisecond, and why the top levels of the tree are almost always cached in memory. Inserts keep the tree balanced by **splitting** a full page into two and pushing a key up; deletes merge pages. Range queries are fast because the leaves are linked in key order.

## 3. The buffer pool: memory in front of the disk

The **buffer pool** is the database's own page cache. When a query needs a page it looks in the pool first (a **hit**); otherwise it reads from disk (a **miss**) and evicts another page if the pool is full. A common eviction rule is **LRU**, least recently used. Real engines use cleverer variants (clock, LRU-K, scan-resistant rules) because one big table scan can flush the whole pool.

This simulation sends 200,000 page requests where 80% go to the hottest 10% of pages, and varies the pool size:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > bufpool.py <<'EOF'
import random
from collections import OrderedDict
random.seed(5)
PAGES = 10_000
# 80% of accesses go to the 10% "hot" pages, like a real workload
def access():
    return random.randrange(PAGES // 10) if random.random() < 0.8 else random.randrange(PAGES)
trace = [access() for _ in range(200_000)]
def hit_rate(size):
    pool, hits = OrderedDict(), 0
    for p in trace:
        if p in pool: hits += 1; pool.move_to_end(p)
        else:
            pool[p] = True
            if len(pool) > size: pool.popitem(last=False)          # evict the least recently used page
    return hits / len(trace)
print(f"{'buffer pool':>12} {'share of data':>14} {'hit rate':>9} {'disk reads per 1000 requests':>30}")
for size in (100, 500, 1000, 2000, 5000):
    h = hit_rate(size)
    print(f"{size:12d} {size / PAGES:14.0%} {h:9.1%} {1000 * (1 - h):30.0f}")
EOF
python3 bufpool.py
```


Look at the shape: a pool holding **10% of the data** already gives about 60% hits, **20%** gives 83%, but going from 20% to 50% adds only a few points. Memory has **diminishing returns**, and the right size is the working set (the pages used often), not the whole database. That is the reason "just add RAM" helps until the working set fits and then stops helping.

## 4. Concurrency: two clients, one balance

Many clients use one database at once. The trouble starts with **read, think, write** sequences. Run the next script (real SQLite, two connections to one file) and watch three ways to add 10 to a balance from two clients:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > lostupdate.py <<'EOF'
import sqlite3, tempfile, os
path = os.path.join(tempfile.mkdtemp(), "bank.db")
setup = sqlite3.connect(path); setup.execute("create table acct(id integer primary key, balance int)"); setup.execute("insert into acct values (1, 100)"); setup.commit(); setup.close()

def conn(): return sqlite3.connect(path, timeout=0, isolation_level=None)       # autocommit: we send BEGIN ourselves

print("1) read, then write, with no transaction around the pair (two clients add 10 each)")
a, b = conn(), conn()
ba = a.execute("select balance from acct where id=1").fetchone()[0]
bb = b.execute("select balance from acct where id=1").fetchone()[0]             # B reads the same old value
a.execute("update acct set balance=? where id=1", (ba + 10,))
b.execute("update acct set balance=? where id=1", (bb + 10,))
print("   final balance:", a.execute("select balance from acct where id=1").fetchone()[0], "(expected 120: one update was lost)")

print("\n2) the same two clients, but the read-modify-write is one atomic statement")
a.execute("update acct set balance = 100 where id=1")
a.execute("update acct set balance = balance + 10 where id=1")
b.execute("update acct set balance = balance + 10 where id=1")
print("   final balance:", a.execute("select balance from acct where id=1").fetchone()[0])

print("\n3) the same two clients, read-modify-write inside BEGIN IMMEDIATE (takes the write lock first)")
a.execute("update acct set balance = 100 where id=1")
a.execute("begin immediate")
ba = a.execute("select balance from acct where id=1").fetchone()[0]
try:
    b.execute("begin immediate")
    print("   B got the lock (unexpected)")
except sqlite3.OperationalError as e:
    print("   B must wait or retry:", e)
a.execute("update acct set balance=? where id=1", (ba + 10,)); a.execute("commit")
b.execute("begin immediate"); bb = b.execute("select balance from acct where id=1").fetchone()[0]
b.execute("update acct set balance=? where id=1", (bb + 10,)); b.execute("commit")
print("   final balance:", a.execute("select balance from acct where id=1").fetchone()[0])
EOF
python3 lostupdate.py
```


1. **Read then write with nothing around it:** both clients read 100, both write 110. The result is 110, not 120: a **lost update**.
2. **One atomic statement** (`balance = balance + 10`): the database applies the changes one after the other. This is the simplest fix when the change can be expressed in one statement.
3. **A transaction that takes the write lock first** (`BEGIN IMMEDIATE`): the second client is told "database is locked" and must wait or retry, so the two read-modify-write sequences cannot interleave.

Production databases do this with **locks** (two-phase locking) or with **MVCC** (multi-version concurrency control): each transaction reads a consistent **snapshot** of older row versions, so readers do not block writers. MVCC is why a long report does not freeze your application, and also why a snapshot can be slightly stale. The anomalies that remain at each isolation level, such as **write skew**, are in [Lesson 10](#systems-10).

## 5. Durability: the write-ahead log

A commit must survive a crash. The database first appends the change to a **write-ahead log (WAL)** on disk and only then acknowledges the commit; the modified data pages are written back to disk later. After a crash it **replays the log**. Appending to a log is a fast sequential write, which is why this design is both safe and quick. This is also the foundation of replication: followers replay the leader's log ([Lesson 4](#systems-4)).

## Common misconceptions

- "An index is a separate sorted copy of the table." It is a tree of pages; the table itself may also be a tree (a clustered index).
- "More RAM always makes the database faster." Only until the working set fits.
- "A transaction means no one else can read the data." Isolation levels decide exactly what other transactions see.

## Practice (answers below)

1. A table has 50 million rows and a B-tree with 200 keys per page. About how tall is the tree, and how many page reads does a lookup need?
2. Your database server has plenty of RAM but disk reads are still high. Give two possible reasons.
3. Rewrite the lost-update example so that both clients' changes are kept, without using `BEGIN IMMEDIATE`.

:::recap
- Databases read **pages**; cost = pages touched, minus the ones already in memory.
- A **B+tree** has a huge fan-out, so even billions of rows need about 4 to 5 page reads.
- The **buffer pool** caches hot pages; hit rate rises fast then flattens as it approaches the working set.
- **Lost updates** come from read-then-write races; fix with atomic statements, locks or transactions.
- The **WAL** makes commits durable and powers replication.
:::

:::note Answers
1. log base 200 of 50,000,000 is about 3.3, so height 4, so 4 page reads (the top levels are normally cached, so often fewer from disk). 2. The working set is larger than the pool, or one large scan keeps evicting hot pages, or the pool is configured far smaller than the RAM available. 3. Use a single atomic statement: `update acct set balance = balance + 10 where id = 1`.
:::

```quiz
? Why can a B-tree find one key among a billion with only a handful of page reads?
+ Each page holds hundreds of keys, so the tree is very shallow
- Because the data is stored in memory
- Because keys are hashed
- Because the disk is fast
! A large fan-out means the height is log base (hundreds) of the number of keys.

? What is a lost update?
+ Two transactions read the same value and both write back, so one change disappears
- A row deleted by mistake
- A crashed disk
- A slow query
! Interleaved read-modify-write sequences overwrite each other without a lock or atomic statement.

? Why does a write-ahead log make commits durable and fast?
+ A small sequential append is persisted first, and data pages can be written later and rebuilt from the log
- It compresses the data
- It avoids disks
- It removes the need for transactions
! After a crash the database replays the log to restore the committed changes.
```
