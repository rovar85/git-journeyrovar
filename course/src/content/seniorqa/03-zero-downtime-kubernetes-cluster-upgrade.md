---
track: seniorqa
title: "Q3: Upgrade a production Kubernetes cluster with zero downtime"
short: Q3 Zero-downtime upgrade
sub: Version skew, the order of upgrade, PodDisruptionBudgets, draining one node at a time, capacity checks and the classic hang, with a model you can run.
---

:::goals
- state the upgrade order and the version-skew rules
- explain surge upgrades versus blue/green node pools
- show how a PodDisruptionBudget protects the app and how a bad one stalls the upgrade
- list the pre-checks and the rollback options
:::

:::note How this connects
The earlier upgrade summary is in [Kubernetes 11](#kubernetes-11); this lesson is the full interview answer. Probes and scheduling are in [Kubernetes 7](#kubernetes-7), troubleshooting in [Kubernetes 9](#kubernetes-9), and node maintenance drills in [Kubernetes 13](#kubernetes-13).
:::

## Upgrade a production cluster with zero downtime

**What the interviewer tests:** do you know the order (control plane first), do you know a node drain only is safe with spare capacity and a disruption budget, and do you have a plan for when it goes wrong?

### Clarifying questions

- Managed (EKS, GKE, AKS) or self-managed (kubeadm)? Managed services upgrade the control plane for you; self-managed needs etcd backups and a manual order.
- How many minor versions behind? Kubernetes supports **upgrading one minor version at a time** (1.28 to 1.29), never skipping.
- Which workloads are stateful or have strict availability needs? Do they have PodDisruptionBudgets and more than one replica?
- Is there a staging cluster that mirrors production?

### The plan, in order

1. **Read the release notes and deprecations.** Removed APIs (for example a Beta API gone in the next version) break manifests and Helm charts. Scan for them (tools such as `kubent`, `pluto`, or the API server's deprecated-API metrics) *before* the upgrade.
2. **Check add-ons and controllers** for compatibility: CNI, CSI drivers, ingress controller, service mesh, cert-manager, autoscaler, operators.
3. **Back up.** etcd snapshot (self-managed), or a Velero backup of cluster resources and volumes. Know how to restore.
4. **Rehearse in staging**, the same way, and time it.
5. **Control plane first.** The API servers upgrade before the nodes. Version skew rules: the kubelet may be up to a few minor versions *older* than the API server (check the current policy), but **never newer**. Managed control planes upgrade without downtime for workloads; HA self-managed control planes upgrade one node at a time.
6. **Node pools, one at a time**, using one of two strategies:
   - **Rolling / surge:** add a surge node, cordon an old node, **drain** it (evict pods respecting PDBs), delete it, repeat. Uses little extra capacity.
   - **Blue/green node pool:** create a new pool at the new version, cordon and drain the old pool gradually, then delete it. Costs double for a while but rolls back easily by uncordoning the old pool.
7. **Verify after each step:** node status, system pods, error rate, latency, and a synthetic check. Stop on any regression.
8. **Upgrade add-ons** to the versions that match the new Kubernetes version.
9. **Communicate:** announce the window, keep an owner on call, and avoid a Friday evening.

### What makes a drain safe, shown by a model

A **PodDisruptionBudget (PDB)** limits voluntary disruptions such as drains. The eviction API refuses an eviction that would leave fewer than the minimum ready pods. The model below reproduces that rule.

```run
mkdir -p ~/lab/seniorqa/q3 && cd ~/lab/seniorqa/q3
cat > upgrade.py <<'EOF'
# Rolling node upgrade with a PodDisruptionBudget (PDB). Each node hosts pods; upgrading a node means cordon + drain (evict) + upgrade + uncordon.
import itertools
nodes = {f"node{i}": {"web": 2, "api": 1} for i in range(1, 7)}          # 6 nodes, per node: 2 web pods and 1 api pod
REPLICAS = {"web": 12, "api": 6}
PDB_MIN_AVAILABLE = {"web": 9, "api": 5}                                 # the budget: how many must stay Ready
def ready(app, down_nodes):
    return sum(n[app] for name, n in nodes.items() if name not in down_nodes)
def can_drain(node, down):
    after = set(down) | {node}
    return all(ready(a, after) >= PDB_MIN_AVAILABLE[a] for a in REPLICAS), {a: ready(a, after) for a in REPLICAS}
print("Rule used by the eviction API: an eviction is refused if it would leave fewer than the PDB minimum Ready pods.\n")
print("A) naive: drain two nodes at the same time")
ok, r = can_drain("node2", {"node1"}); print("   node1 already draining, now node2 ->", "allowed" if ok else "REFUSED by the PDB", r)
print("\nB) one node at a time (replacement pods are scheduled on the other nodes first)")
for n in nodes:
    ok, r = can_drain(n, set())
    print(f"   drain {n}: ready after eviction {r} -> {'ok' if ok else 'blocked'}")
print("\nC) what makes a drain hang forever (a classic upgrade failure)")
hang = {"web": 12}                                                       # a PDB that demands ALL pods (minAvailable = replicas)
print("   PDB minAvailable=12 of 12 web pods: any eviction would leave 11 -> every drain is refused, the upgrade stalls")
print("   fix: allow at least one pod to be disrupted (minAvailable = replicas - 1, or maxUnavailable: 1)")
print("\nD) capacity check before you start: can the other 5 nodes hold everything?")
need_cpu = 6 * 3 * 0.5; per_node_cpu = 4.0                               # 18 pods x 0.5 CPU on nodes with 4 CPU
print(f"   pods need {need_cpu} CPU in total; 5 nodes x {per_node_cpu} = {5 * per_node_cpu} CPU -> {'fits' if need_cpu <= 5 * per_node_cpu else 'does NOT fit: add a surge node first'}")
EOF
python3 upgrade.py
```

What the output shows:

- **A)** Draining two nodes at once is **refused**: the budget needs at least 9 web pods ready and the second drain would leave 8. The PDB did its job.
- **B)** One node at a time keeps 10 of 10 web pods and 5 of 5 api pods ready after each eviction, because replacement pods are scheduled on the other nodes first.
- **C)** The classic hang: a PDB with `minAvailable: 12` on 12 replicas means *no* eviction is ever allowed, so the upgrade stalls forever. Fix it: allow one disruption (`maxUnavailable: 1`).
- **D)** The capacity check: the remaining 5 nodes must be able to hold everything (9.0 CPU needed, 20.0 available), otherwise pods go Pending and users see errors.

### The commands (example, not run here)

```term
# 1. what is running, and which APIs are deprecated?
kubectl get nodes -o wide
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis

# 2. one node at a time
kubectl cordon node-1                       # no new pods
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data --timeout=300s
#   ... upgrade the node (replace it, or kubeadm upgrade node + restart kubelet) ...
kubectl uncordon node-1
kubectl rollout status deploy/web           # confirm pods healthy before the next node

# 3. a PodDisruptionBudget that allows one disruption
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: {name: web}
spec:
  maxUnavailable: 1
  selector: {matchLabels: {app: web}}
```

### Things that quietly break zero downtime

- **Single-replica deployments:** one replica means a drain is an outage. Run at least two, spread across nodes and zones.
- **Pods without readiness probes:** traffic goes to a pod that is not ready. Readiness gates traffic; also set `preStop` and `terminationGracePeriodSeconds` so in-flight requests finish.
- **Local storage:** pods with `emptyDir` data lose it; stateful sets with zonal volumes must reschedule in the same zone.
- **Long-running jobs and WebSockets:** give them time (a long grace period) or schedule the window around them.
- **Surge capacity limits and cloud quota:** check the quota before you add nodes.
- **Cluster autoscaler** fighting the drain: pause it, or let it work and watch it.
- **Webhooks:** an admission webhook running on the node being drained can block new pods.

### Rollback

You cannot downgrade a control plane safely. Your rollback plan is: **blue/green node pools** (uncordon the old pool), **the etcd or Velero backup**, and for the control plane, restoring or creating a new cluster and redirecting traffic. That is the strongest reason to rehearse in staging and to keep the upgrade steps small.

:::say
I upgrade one minor version at a time, after checking deprecated APIs and add-on compatibility and taking an etcd or Velero backup, and I rehearse in staging. The control plane goes first, then the node pools, either with a surge-and-drain rolling approach or a blue/green node pool, which also gives me an easy rollback. Zero downtime depends on the apps: at least two replicas spread across zones, readiness probes, graceful shutdown, and PodDisruptionBudgets that allow exactly one disruption; a budget equal to the replica count blocks the drain forever. I drain one node at a time, wait for the rollout to be healthy, and watch error rate and latency before the next node.
:::

## Follow-up questions

:::answer What if a drain hangs?
Find out what is blocking it: `kubectl get pdb`, pods stuck terminating, a pod with no controller, or local storage. Fix the budget or the pod; do not force-delete pods that hold data. As a last resort for a stateless pod you can delete it, but know why it was stuck first.
:::

:::answer How do you upgrade nodes without any extra capacity?
You do not: draining removes capacity before the replacement arrives. Add surge capacity (extra nodes) or use blue/green pools. If cost is the objection, show the incident cost versus a few extra node-hours.
:::

:::answer Can you skip minor versions?
Not in place: upgrade one minor at a time. For a large jump, build a new cluster at the target version and migrate workloads (blue/green at the cluster level), which is often safer than five sequential upgrades.
:::

:::answer How do you know the upgrade did not break anything?
Define success first: node versions, system pods Ready, error rate and p99 within the SLO, synthetic checks passing, and no new alerts. Compare to the baseline before you start.
:::

## Practice (answers below)

1. Why must the control plane be upgraded before the nodes?
2. A PDB says `minAvailable: 3` and the deployment has 3 replicas. What happens on a drain?
3. Why is a blue/green node pool easier to roll back than a rolling upgrade?

:::note Answers
1. A kubelet must not be newer than the API server it talks to; older kubelets are supported within the skew policy. 2. Every eviction is refused, so the drain never finishes. 3. The old nodes still exist (cordoned), so you uncordon them and drain the new pool; nothing was destroyed.
:::

:::recap
- **One minor at a time; control plane first; nodes second.**
- Check **deprecated APIs and add-ons**; back up; rehearse in staging.
- A **PDB** protects the app; a PDB that allows no disruption stalls the upgrade.
- Drain **one node at a time**, with spare capacity, and verify between steps.
- Rollback = blue/green node pools plus backups.
:::

```quiz
? Why does a PodDisruptionBudget with minAvailable equal to the replica count stall an upgrade?
+ Every eviction would drop below the minimum, so every drain is refused
- It deletes the pods
- It stops the API server
- It only affects stateful sets
! Allow at least one voluntary disruption, for example maxUnavailable: 1.

? Which order is correct?
+ Control plane, then nodes, then add-ons matched to the new version
- Nodes, then control plane
- All at once
- Add-ons only
! The kubelet must not be newer than the API server.

? What is the main advantage of a blue/green node pool upgrade?
+ Easy rollback: the old pool still exists and can be uncordoned
- It is cheaper
- It skips drains
- It needs no capacity
! It costs extra capacity for a while but is reversible.
```
