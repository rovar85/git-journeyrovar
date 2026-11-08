---
track: seniorqa
title: "Q4: Migrate a stateful application to Kubernetes with minimal downtime"
short: Q4 Stateful migration
sub: Decide whether to move the data at all, then replicate, catch up, cut over in seconds and keep a way back, with a model of the snapshot, catch-up and cutover times.
---

:::goals
- decide between running the database on Kubernetes and keeping it outside
- describe the replicate, catch up, verify, cut over, keep a rollback pattern
- calculate the catch-up time and the write-downtime window
- name the failure modes: lag that never shrinks, split brain, schema mismatch, volume problems
:::

:::note How this connects
Storage is in [Kubernetes 6](#kubernetes-6) and StatefulSets in [Kubernetes 10](#kubernetes-10); replication and consistency are in [Systems 4](#systems-4) and [Systems 8](#systems-8). The "expand and contract" schema pattern is used again in [Q7](#seniorqa-7).
:::

## Migrate a stateful application to Kubernetes with minimal downtime

**What the interviewer tests:** do you first question the premise ("should it be on Kubernetes at all?"), do you separate the **application** move from the **data** move, and do you give a plan with a measured cutover and a rollback?

### Clarifying questions

- What is the state: a database (which engine, how big), files on disk, a cache, a queue?
- What is the **write rate** and the **dataset size**? These decide the migration method and time.
- What downtime is acceptable (seconds, minutes, none)? Is read-only mode acceptable during the cutover?
- Is the database going **into** the cluster, or will it stay outside (managed or VM) while the app moves? **Often the right answer is to move the app and keep a managed database**, and say so.

### Step 0: should the data move at all?

Running a database in Kubernetes is possible (StatefulSets, persistent volumes, operators such as CloudNativePG, Percona, Strimzi), but you take on backups, failover, upgrades, storage performance and zonal volumes yourself. For many teams a managed database is the lower-risk choice. If there is a reason to run it in-cluster (portability, cost at scale, a good operator and the skills), then:

### The plan

1. **Prepare the target.** Cluster with a storage class that suits the database (fast, replicated, zone-aware), an operator or StatefulSet with anti-affinity, backups configured and **a restore tested**, monitoring and alerts, resource requests set.
2. **Move the stateless parts first**, pointing at the old database. Prove the app works on Kubernetes without touching data. Run both old and new app instances if the app tolerates it.
3. **Start replication** from the old database to the new one: a snapshot or base backup, then continuous change streaming (physical replication, logical replication, or a change-data-capture tool such as Debezium, or the cloud's migration service).
4. **Catch up.** While the snapshot copies, new writes pile up. The target must apply changes **faster than they arrive**, or lag never shrinks.
5. **Verify.** Row counts, checksums on samples, and application read tests against the new database while the old one is still the source of truth.
6. **Cut over** in a short window: stop writes on the old database, let the last changes replicate, verify, switch the connection, enable writes on the new one.
7. **Keep a way back.** Reverse the replication so the old database follows the new one for a few days; if something goes wrong you switch back without data loss.
8. **Decommission** only after a soak period and a final backup.

### The numbers, from a model

```run
mkdir -p ~/lab/seniorqa/q4 && cd ~/lab/seniorqa/q4
cat > migrate.py <<'EOF'
import random
random.seed(2)
# Live migration of a database: copy the base data, then replicate the changes until the lag is tiny, then cut over.
WRITE_RATE = 800          # writes per second on the old database
APPLY_RATE = 1500         # changes per second the new database can apply while catching up
BASE_COPY_SEC = 900       # time to copy the snapshot (writes keep arriving meanwhile)
backlog = WRITE_RATE * BASE_COPY_SEC
print(f"1) snapshot copy takes {BASE_COPY_SEC // 60} min; {backlog:,} changes pile up meanwhile")
t = 0
print("2) catch-up: the new database applies changes faster than they arrive")
while backlog > WRITE_RATE * 2 and t < 3600:
    backlog = backlog + WRITE_RATE - APPLY_RATE if backlog > 0 else 0
    t += 1
    if t % 300 == 0: print(f"   after {t // 60:2d} min of catch-up: lag = {backlog / WRITE_RATE:6.1f} s of writes")
print(f"   caught up after {t} s; lag now {backlog / WRITE_RATE:.1f} s")
print("\n3) cutover window (the only real downtime):")
steps = [("stop writes on the old database (read-only or drain the app)", 5), ("let the last changes replicate (lag)", backlog / WRITE_RATE), ("verify row counts / checksums on a sample", 20), ("switch the app's connection (config / DNS / service)", 10), ("enable writes on the new database", 3)]
total = 0
for name, sec in steps: total += sec; print(f"   {sec:5.1f} s  {name}")
print(f"   => about {total:.0f} seconds of write downtime. Reads can stay up the whole time.")
print("\nIf the apply rate were SLOWER than the write rate the backlog would never shrink:")
print("   writes 800/s, apply 700/s -> lag grows by", 800 - 700, "changes every second. Check this BEFORE you start; throttle writes or scale the target.")
print("\n4) rollback plan: keep the old database as a replica of the new one (reverse replication) for a few days, so you can switch back without data loss")
EOF
python3 migrate.py
```

What the output shows:

- A **15-minute** snapshot copy while the system keeps taking writes leaves **720,000 changes** to apply.
- The target applies changes faster than they arrive, so lag shrinks: **637 s, then 375 s, then 112 s**, caught up after about **17 minutes** (1027 s).
- The cutover is the only real downtime: 5 s stop writes + 1.4 s last changes + 20 s verify + 10 s switch + 3 s enable = **about 39 seconds** of write downtime. **Reads can stay up the whole time.**
- If the apply rate is *slower* than the write rate (800 per second written, 700 applied), the backlog grows by 100 changes every second. **Check this before you start** and throttle writes or scale the target.

### Cutover details that matter

- **Make the switch a single, reversible config change**: a service name, a DNS record with a short TTL, or a connection-string secret. Applications must reconnect cleanly (connection pools with retry).
- **Fence the old database**: set it read-only (`default_transaction_read_only`, or revoke write grants) so a straggler cannot write to the old primary.
- **Drain in-flight work**: queue consumers and background jobs pause during the window.
- **Sequences and IDs:** logical replication does not always copy sequence values; set them above the max on the target.
- **Schema changes:** freeze them during the migration, or use the expand/contract pattern so both versions work.
- **Time to first byte after cutover:** warm caches and connection pools; run a synthetic check.

### Failure modes

| Problem | Symptom | Response |
|---|---|---|
| Replication lag does not shrink | Lag grows | Throttle writes, scale target IOPS, reduce indexes during bulk load |
| Split brain | Both databases accept writes | Fence the old one before enabling the new one; never "try both" |
| Volume in the wrong zone | Pod Pending | Zone-aware storage class, `volumeBindingMode: WaitForFirstConsumer` |
| Different engine version | Replication refuses or subtle behaviour change | Match versions, or test the upgrade separately |
| Slow storage | p99 latency up | Benchmark the storage class before migrating; use local NVMe or provisioned IOPS if needed |
| Cutover fails verification | Counts differ | Abort; the old database is still the truth |

:::say
First I would question whether the data should move; often I move the stateless app and keep a managed database. If it must move, I replicate rather than copy: take a snapshot, stream changes, and check that the target applies changes faster than they arrive, because otherwise the lag never shrinks. I verify counts and checksums while the old database is still the source of truth. Then the cutover is a short window, around 40 seconds in my model: set the old database read-only, let the last changes replicate, verify, switch one connection setting, and enable writes on the new one. Reads stay up. I keep reverse replication running for a few days so I can go back with no data loss, and I only decommission after a soak period and a final backup.
:::

## Follow-up questions

:::answer How would you do it with zero write downtime?
Use dual-writes or a bidirectional-replication tool and a gradual traffic shift, accepting a lot more complexity (conflict handling, ordering). Few systems need it; most accept seconds of write pause. Say that and ask whether the business needs it.
:::

:::answer What about a very large dataset, many terabytes?
The snapshot is the slow part, so start from a physical backup or a storage-level snapshot, ship it over a fast link (or a data-transfer appliance), then replay the change log. The catch-up calculation is the same: it must apply faster than writes arrive.
:::

:::answer What if the application is the stateful part (files on disk)?
Move the files to object storage or a shared volume with a sync tool (`rclone`, `rsync`), run a final delta sync during the cutover, then switch. Better still, change the app to stop depending on local disk.
:::

:::answer How do you keep a database on Kubernetes healthy in the long run?
Use a mature operator, anti-affinity across zones, resource requests, tested backups and restores, monitoring of replication lag and disk, and a runbook for failover. Treat the upgrade path of the operator as part of the system.
:::

## Practice (answers below)

1. Writes arrive at 600 per second and the target applies 900 per second. A 10-minute snapshot is taken. How many changes pile up, and how long to catch up?
2. Why keep reverse replication after the cutover?
3. Why can reads stay up during the cutover but writes cannot?

:::note Answers
1. 600 x 600 = 360,000 changes. The backlog shrinks by 300 per second (900 minus 600), so about 1,200 seconds (20 minutes) to reach zero lag. 2. It lets you switch back to the old database without losing the writes made since the cutover. 3. Reads from either copy are consistent enough, but two databases accepting writes would diverge; writes must pause until one is the single source of truth.
:::

:::recap
- Question the premise: **move the app, keep a managed database** unless there is a reason.
- **Replicate, catch up, verify, cut over, keep a way back.**
- Catch-up works only if **apply rate is above write rate**.
- The cutover window is seconds (about 40 s in the model); reads stay up.
- Keep **reverse replication** and a soak period before decommissioning.
:::

```quiz
? What must be true for replication lag to shrink during catch-up?
+ The target applies changes faster than the source produces them
- The snapshot must be compressed
- The target must have more disks
- The app must be offline
! Otherwise the backlog grows without limit.

? Why fence the old database before enabling writes on the new one?
+ To prevent split brain, where both accept writes and diverge
- To save disk
- To speed up replication
- To rotate logs
! Set the old one read-only first.

? What is the safest rollback after the cutover?
+ Reverse replication from the new database to the old one, then switch back
- Restore last month's backup
- Re-run the snapshot
- Delete the new database
! It preserves writes made after the cutover.
```
