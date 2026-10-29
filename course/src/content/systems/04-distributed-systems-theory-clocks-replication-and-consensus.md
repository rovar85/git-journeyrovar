---
track: systems
title: "Systems 4: distributed systems theory, clocks, replication and consensus"
short: Distributed systems theory
sub: Why there is no global clock, how logical clocks order events, what replication lag looks like, and why consensus needs a majority.
---


:::goals
- explain why a distributed system cannot trust wall-clock time to order events
- use a logical clock to order cause and effect
- describe leader-follower replication and what a stale read is
- explain why consensus needs a majority, and why a cluster has an odd number of nodes
:::

:::note Companion to Martin Kleppmann's lectures
The lecture series by [Martin Kleppmann](https://martin.kleppmann.com/2020/11/18/distributed-systems-and-elliptic-curves.html) covers clocks, replication and consensus in a short sequence ([resource list](#systems-1)). This lesson gives the ideas and tiny runnable models; watch the lectures for the full treatment.
:::

## 1. What is different about a distributed system

On one machine, function calls either work or crash, and everyone shares one clock and one memory. Across machines three things become true at once:

1. **Messages can be lost, delayed, duplicated or reordered.** A request that gets no answer might have failed, or might have succeeded and lost its reply. You cannot tell which.
2. **Parts fail independently.** One server is down while the others are fine ("partial failure").
3. **There is no shared clock.** Each machine's clock drifts and can be corrected backwards. "Which happened first?" cannot be answered by comparing timestamps from different machines.

Every technique in this track (retries, idempotency, quorums, consensus) exists because of these three facts.

## 2. Logical clocks: order by cause, not by time

Leslie Lamport's idea: you do not need the real time, only an order that respects **cause and effect**. Each process keeps a counter. When it does something, it adds 1. When it sends a message, it attaches its counter. When it receives one, it sets its counter to `max(own, received) + 1`. Now if event A could have caused event B, A has a smaller timestamp than B.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > lamport.py <<'EOF'
# Three processes with no shared clock. Each keeps a counter. Rule: on send, add 1 and attach it; on receive, take max(mine, received) + 1.
class P:
    def __init__(s, name): s.name, s.t, s.log = name, 0, []
    def event(s, what): s.t += 1; s.log.append((s.t, s.name, what)); return s.t
    def send(s, what): s.t += 1; s.log.append((s.t, s.name, what)); return s.t
    def recv(s, what, stamp): s.t = max(s.t, stamp) + 1; s.log.append((s.t, s.name, what))
a, b, c = P("A"), P("B"), P("C")
a.event("A writes x=1")
m1 = a.send("A sends 'x=1' to B")
b.event("B does local work"); b.event("B does more local work")
b.recv("B receives from A", m1)
m2 = b.send("B sends 'seen' to C")
c.event("C unrelated event")
c.recv("C receives from B", m2)
for t, who, what in sorted(a.log + b.log + c.log): print(f"  logical time {t}  {who}: {what}")
print("\nEvery cause has a smaller timestamp than its effect. But two events with no message path between them (such as 'C unrelated event')\ncan get any order: a Lamport clock cannot tell you they were concurrent. Vector clocks can (see the Dynamo lesson).")
EOF
python3 lamport.py
```


Read the log: "B receives from A" (time 3) is later than "A sends" (time 2), as it must be. But "C unrelated event" also got time 1, tying with other unrelated events. A Lamport clock never lies about cause and effect, but it **cannot tell you two events were concurrent**. For that you need **vector clocks**, which keep one counter per process and are shown in [Lesson 8](#systems-8). Production systems often use **hybrid logical clocks** (real time plus a counter) or carefully synchronised atomic clocks with an explicit error bound.

## 3. Replication: copies for availability and reads

Keeping copies of data on several machines gives **availability** (a copy survives a failure) and **read capacity**. The simplest design is **leader-follower**: all writes go to the leader, which appends them to a log; followers replay the log.

- **Synchronous replication:** the leader waits for a follower to confirm before saying "committed". No data loss on a leader failure, but a slow or dead follower stalls writes.
- **Asynchronous replication:** the leader confirms immediately. Fast, but a leader crash can lose the last writes, and followers lag.

Lag is why you sometimes see **stale reads**: you write, then read from a follower that has not caught up. The usual repairs are **read-your-writes** (route a user's reads to the leader for a short time after they write, or carry a version number and wait for a follower that has it) and **monotonic reads** (keep one user on one replica so time does not go backwards). [Lesson 8](#systems-8) quantifies stale reads with quorums, and [Lesson 10](#systems-10) shows how to test for them.

## 4. Consensus: agreeing on one value

Some decisions need **one answer everyone accepts**: who is the leader, what is the next log entry, does this lock belong to me. Doing this safely when machines crash and messages are delayed is the **consensus** problem, solved by protocols such as **Paxos** and **Raft**, which are used inside systems such as etcd and ZooKeeper (the brain of every Kubernetes cluster, see [Kubernetes 11](#kubernetes-11)).

The core idea is a **majority (quorum)**. A value counts as decided only when more than half of the nodes have stored it.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > commit.py <<'EOF'
# Majority commit, the core idea inside Raft/Paxos-style replication: a log entry is COMMITTED once a majority of nodes stored it.
def try_commit(n_nodes, alive):
    acks = 1 + (alive - 1)                       # the leader + the followers that are reachable
    need = n_nodes // 2 + 1
    return acks >= need, acks, need
print(f"{'nodes':>5} {'reachable':>10} {'majority needed':>16} {'commit?':>8}   tolerates")
for n in (3, 5, 7):
    for alive in range(n, 0, -1):
        ok, acks, need = try_commit(n, alive)
        if alive in (n, n - (n - 1) // 2, n - (n - 1) // 2 - 1):
            print(f"{n:5d} {alive:10d} {need:16d} {'yes' if ok else 'NO':>8}   {(n - 1) // 2} failures" if alive == n else f"{n:5d} {alive:10d} {need:16d} {'yes' if ok else 'NO':>8}")
print("\nWhy an even number is a bad deal: 4 nodes need 3 for a majority and tolerate 1 failure, exactly like 3 nodes.")
print("Why two halves cannot both commit during a partition: two majorities must share at least one node, so only one side can reach quorum.")
EOF
python3 commit.py
```


Two facts to remember from the table and the notes under it:

- A cluster of **3 tolerates 1 failure, 5 tolerates 2, 7 tolerates 3**. More nodes buy more fault tolerance but more messages per decision, so clusters are small.
- **Why odd numbers:** 4 nodes need a majority of 3, so they also survive only 1 failure: the fourth node adds cost without adding tolerance.
- **Why a partition cannot create two leaders:** any two majorities overlap in at least one node. That node will not vote for two different leaders in the same **term**, so only one side can commit.

## 5. CAP and PACELC in plain words

The **CAP theorem** says that when the network **partitions** (some nodes cannot reach others), a system must choose between **consistency** (every read sees the latest write; the minority side refuses to answer) and **availability** (every node keeps answering, possibly with stale data). It is not "pick two of three" at all times: partitions are not optional, so the real choice is what to do **during** one. **PACELC** adds the everyday trade-off: **else**, with no partition, you still trade **latency** against consistency (waiting for more replicas is slower but fresher).

## 6. What to say in an interview

- "I assume messages can be lost or duplicated, so operations must be safe to retry (idempotent)."
- "Ordering by wall-clock time across machines is unsafe; I use a log order, a logical clock or an explicit version."
- "For decisions that need one answer I rely on a consensus store (etcd, ZooKeeper) rather than inventing my own."

## Common misconceptions

- "Timestamps from NTP are accurate enough to order events." They drift and jump.
- "CAP means you always give up one of three." It is a choice made during a partition.
- "Consensus is slow so avoid it." Use it for the small amount of data that needs one answer (leader, locks, config), not for all data.

## Practice (answers below)

1. A 5-node cluster loses 3 nodes. Can it commit writes? Can it still serve stale reads?
2. Why is "last write wins by timestamp" dangerous across servers?
3. A user posts a comment, reloads, and the comment is missing. Name the cause and one repair.

:::recap
- No shared clock, partial failure and unreliable messages are the root of the difficulty.
- **Lamport clocks** order cause and effect; **vector clocks** also detect concurrency.
- **Leader-follower** replication trades latency against durability; lag causes **stale reads**.
- **Consensus** needs a **majority**; odd cluster sizes; two majorities always overlap.
- **CAP** is about the choice during a partition; **PACELC** adds the latency trade-off otherwise.
:::

:::note Answers
1. No, it cannot commit (only 2 of 5 are alive, below the majority of 3); a survivor may still answer reads from its local copy, which can be stale, if the system allows that. 2. Clocks differ and can jump backwards, so the "latest" timestamp may belong to the older write and a good write is silently discarded. 3. Replication lag: the reload was served by a follower that had not applied the write. Repair: read-your-writes, route that user to the leader or a replica that has reached the write's version.
:::

```quiz
? Why can't two servers order events by comparing their wall-clock timestamps?
+ Their clocks drift and can be adjusted, so timestamps do not reflect real cause and effect
- Servers have no clocks
- Timestamps are too small
- Clocks are always identical
! Without a shared clock, only a logical order or an agreed log is trustworthy.

? How many failures can a 7-node consensus cluster tolerate?
+ 3
- 2
- 4
- 6
! A majority is 4 of 7, so up to 3 nodes can fail.

? During a network partition, a system that keeps answering on both sides is choosing:
+ Availability over consistency
- Consistency over availability
- Neither
- Both fully
! Answering on both sides means some answers may be stale or conflicting.
```
