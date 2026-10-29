---
track: systems
title: "Systems 10: consistency models, anomalies and how Jepsen tests a database"
short: Consistency and Jepsen
sub: Linearizability checked by a tiny program, write skew shown in code, the ladder of consistency models, and how to read a Jepsen report.
---


:::goals
- explain linearizability and recognise a stale read and "time going backwards"
- run a small checker that decides whether a history is linearizable
- explain write skew and why snapshot isolation allows it
- read a Jepsen analysis: claim, test, anomaly, verdict
:::

:::note Companion to the Jepsen analyses
[Jepsen analyses](https://jepsen.io/analyses) by Kyle Kingsbury test real databases under failures and report what each system promises versus what it does ([resource list](#systems-1)). I could not open the site from here, so this lesson describes the method in general terms; the reports are the best way to see it applied to real systems.
:::

## 1. "Consistent" means many different things

When a vendor says "consistent" ask: **which model?** From strongest to weakest, with the guarantee each gives:

| Model | Plain meaning |
| --- | --- |
| **Strict serializable / linearizable + serializable** | Transactions behave as if run one at a time, in an order that respects real time. The gold standard. |
| **Linearizable** (single object) | Each operation appears to take effect at one instant between its start and its end; once a write is done, every later read sees it. |
| **Serializable** (transactions) | The result equals some one-at-a-time order of the transactions, which need not respect real time. |
| **Snapshot isolation** | Each transaction reads a frozen snapshot; conflicting writes to the same row are rejected. Allows **write skew**. |
| **Read committed** | You never see uncommitted data, but two reads in one transaction can differ. |
| **Causal consistency** | If B was caused by A, everyone sees A before B; unrelated events can be seen in different orders. |
| **Eventual consistency** | If writes stop, replicas converge, at some point. Says nothing about what you read meanwhile. |

Two names are easy to mix up: **linearizability** is about **single objects and real time**; **serializability** is about **multi-object transactions** without a real-time promise.

## 2. Linearizability, checked by a program

A history is a list of operations, each with the time the client **sent** it and the time it **got the answer**. A history is **linearizable** if you can place all operations in one sequence that (1) respects real time, so if A finished before B started, A comes first, and (2) makes a register behave correctly: a read returns the latest write before it.

This is a brute-force checker (fine for tiny histories; real checkers use smarter search):

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > lin.py <<'EOF'
from itertools import permutations
# An operation: (client, kind, value, start, end). start/end = when the client sent the call and when it got the answer.
def linearizable(history):
    """Is there ONE order of all operations, consistent with real time, in which a register behaves correctly?
    Real-time rule: if A finished before B started, A must be placed before B."""
    for order in permutations(history):
        placed_ok = True
        for i, later in enumerate(order):
            for earlier in order[:i]:
                if later[4] < earlier[3]: placed_ok = False        # 'later' ended before 'earlier' even started
        if not placed_ok: continue
        value = None                                                # the register starts empty
        for c, kind, v, s, e in order:
            if kind == "write": value = v
            elif v != value: placed_ok = False; break               # a read must return the latest written value
        if placed_ok: return True, [f"{c}:{k}({v})" for c, k, v, s, e in order]
    return False, None

H = {
 "sequential, every read is fresh": [("A", "write", 1, 0, 1), ("B", "read", 1, 2, 3), ("A", "write", 2, 4, 5), ("B", "read", 2, 6, 7)],
 "a read overlaps a write: either result is allowed": [("A", "write", 1, 0, 10), ("B", "read", None, 2, 3), ("B", "read", 1, 11, 12)],
 "STALE READ: write 2 finished, a later read still returns 1": [("A", "write", 1, 0, 1), ("A", "write", 2, 2, 3), ("B", "read", 1, 4, 5)],
 "READS GO BACKWARDS: someone saw 2, then someone saw 1": [("A", "write", 1, 0, 1), ("A", "write", 2, 2, 20), ("B", "read", 2, 5, 6), ("C", "read", 1, 8, 9)],
}
for name, hist in H.items():
    ok, order = linearizable(hist)
    print(f"{'LINEARIZABLE' if ok else 'NOT linearizable':17} {name}")
    if ok: print("                  one valid order:", " -> ".join(order))
EOF
python3 lin.py
```


- The first two are fine. In the second, a read that **overlaps** the write may return either the old or the new value.
- **Stale read:** write 2 finished, and a later read still returned 1. No valid order exists, so it is **not linearizable**.
- **Reads go backwards:** someone saw 2 and afterwards someone saw 1.

Quorum reads, replica lag and clock-based tricks can all produce these. The point of a test is to find them **before your customers do**.

## 3. Write skew: when snapshots are not enough

Under **snapshot isolation** each transaction reads a consistent snapshot, and a transaction aborts only if another committed a write to the **same row** it wrote. Two transactions that **read the same data but write different rows** both succeed, and can jointly break a rule that neither broke alone. Classic example: at least one doctor must stay on call; Alice and Bob each see two doctors on call, and each goes off call.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > skew.py <<'EOF'
import copy
# Rule: at least ONE doctor must stay on call. Alice and Bob are both on call and both ask to leave at the same moment.
class DB:
    def __init__(self): self.rows = {"alice": True, "bob": True}
class Txn:
    def __init__(self, db): self.db, self.snapshot, self.writes = db, copy.deepcopy(db.rows), {}
    def commit(self, serializable):
        if serializable and self.db.rows != self.snapshot:         # what I read has changed since my snapshot: abort and retry
            return "ABORTED, retry"
        self.db.rows.update(self.writes); return "committed"

for mode, ser in (("snapshot isolation", False), ("serializable", True)):
    db = DB()
    t1, t2 = Txn(db), Txn(db)                                      # both start from the same snapshot
    for t, who in ((t1, "alice"), (t2, "bob")):
        if sum(t.snapshot.values()) >= 2: t.writes[who] = False    # "someone else is still on call, so I can leave"
    r1, r2 = t1.commit(ser), t2.commit(ser)
    print(f"{mode:20} alice: {r1:15} bob: {r2:15} doctors on call afterwards: {sum(db.rows.values())}")
EOF
python3 skew.py
```


With snapshot isolation both commit and **no one is on call**. A **serializable** database detects that what Bob read was changed by Alice's commit and aborts one transaction (here Bob, who retries and then sees only Alice's absence, so he must stay). Your options: use the serializable level and **retry on abort**, lock the rows you read (`SELECT ... FOR UPDATE`), or enforce the rule with a constraint the database checks.

## 4. How Jepsen tests a database

Jepsen is a method and set of tools for testing distributed databases from the outside:

1. **Run a real cluster** and many concurrent clients that read and write.
2. **Record a history**: every operation with its start and end time and its result.
3. **Inject faults** (a "nemesis"): network partitions, process kills and pauses, clock skew, disk failures.
4. **Check the history** against the model the database claims, using a checker such as a linearizability checker (like the toy above) or a transaction-anomaly checker.
5. **Report** the anomaly with the smallest history that shows it.

The value is the comparison **claim versus observed**. Typical findings are stale reads, lost updates, lost acknowledged writes after a failover, and transaction anomalies such as write skew or "read skew" under levels that claim to prevent them.

### How to read a Jepsen report

1. Find what the database **documents** about its guarantees (the claim).
2. Note the **version** and the **configuration** tested (defaults often differ from recommendations).
3. Read the **faults** injected and the **workload**.
4. Look at each **anomaly** with its minimal history: which operations, in what order, why it breaks the model.
5. Read the **verdict** and whether the vendor fixed it, then decide what it means for your use.

## 5. What to do about it in your own system

- **Name the model** you need for each piece of data. Money and inventory usually need serializable transactions; a "last seen" timestamp can be eventual.
- **Prefer a database's strongest default** and relax per query only where measured need exists.
- **Test your own claims:** run concurrent writers with an invariant (total balance never changes; at least one doctor on call) and check it under fault injection in staging.
- **Retry on serialization failures**; they are normal at higher isolation levels ([Lesson 6](#systems-6) and [Lesson 7](#systems-7)).

## Common misconceptions

- "Strong consistency and ACID are the same." ACID's "C" is about invariants; linearizability and serializability are different guarantees.
- "My database is serializable by default." Many default to read committed or snapshot isolation.
- "Replicas in sync means linearizable." Only if reads and writes are coordinated to give that guarantee.

## Practice (answers below)

1. Why is a read that overlaps a write allowed to return either value?
2. Write a rule that snapshot isolation cannot enforce but that a unique constraint can.
3. A report says "lost acknowledged writes after a leader failover". Which design decision (from [Lesson 4](#systems-4)) is the likely cause?

:::recap
- Ask **which consistency model**; the names mean different, specific things.
- **Linearizable** = single objects, real-time order; a stale read breaks it.
- **Snapshot isolation** allows **write skew**; serializable (with retries) or explicit locks prevent it.
- **Jepsen** = real cluster, concurrent clients, injected faults, history checked against the claimed model.
- Compare **claim versus observed**, and test your own invariants under failure.
:::

:::note Answers
1. The write takes effect at some instant between its start and end; the read overlaps that span, so it may be placed before or after the write. 2. "Usernames must be unique" or "one active booking per room and day": two transactions that each check "does it exist?" and insert would both pass under snapshot isolation, while a unique constraint rejects the second. 3. Asynchronous replication: the old leader acknowledged writes that had not reached the replica that was promoted.
:::

```quiz
? What does it mean that a history is NOT linearizable?
+ No single order of the operations respects real time and makes every read return the latest write
- The database crashed
- The data is encrypted
- Some operations took too long
! A stale read is a typical example.

? Which anomaly does snapshot isolation allow that serializable does not?
+ Write skew
- Dirty reads
- Lost durability
- Deadlock
! Two transactions read the same data and write different rows, jointly breaking a rule.

? What is the key comparison in a Jepsen report?
+ What the database claims versus what the tests observed under faults
- Price versus performance
- Language versus framework
- Cloud versus on-premises
! The method checks recorded histories against the claimed consistency model.
```
