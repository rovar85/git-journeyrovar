---
track: scenarios
title: "S6: New worker nodes join the EKS cluster successfully, but pods stay in Pending. What could be the reasons?"
short: S6 Pods Pending
sub: What Pending actually means, the scheduler's filter-and-score model, seven real Pending causes reproduced on a live cluster with the scheduler's own messages, a triage tool, the EKS-specific causes (pod limits per node, zones and volumes, taints, architecture, IP exhaustion), and the answer an interviewer expects.
---

:::goals
- explain what **Pending** means and which component is responsible (the **scheduler**, then the **kubelet**)
- read the **FailedScheduling** event and decode it: insufficient resources, taints, selectors and affinity, volumes, cordoned nodes, topology rules
- reproduce those causes for real, fix each one, and **triage** many pods at once with a script
- add the **EKS-specific** causes: **max pods per node (ENI limits)**, **IP exhaustion**, **zone-bound volumes**, **architecture**, **node group taints**, **Fargate/Karpenter/cluster autoscaler** rules
- give a clear **debugging order**
:::

:::note Provenance
Everything in sections 2 to 4 runs on the **real lab cluster** (single node, so the scheduler messages are real). The lab is **not EKS**, so the **EKS-specific** section (instance pod limits, VPC CNI, EBS zones, node groups) is from general knowledge and is an **Example, not run here**; verify numbers in the provider's current documentation.
:::

```setup
export LABNS=labpend
```

@setup k8s

## 1. What does Pending mean?

A pod's **phase** is `Pending` from creation until **all its containers have started**. Two different stages hide in that one word:

| Stage | Who | Symptom |
|---|---|---|
| **Not scheduled yet** (no node assigned) | **kube-scheduler** | `kubectl describe pod` shows **`FailedScheduling`** events, `Node: <none>` |
| **Scheduled, but containers not running** | **kubelet** on the node | status shows `ContainerCreating` (image pull, volume mount, CNI/IP, secrets) |

"Nodes joined but pods are Pending" is almost always the **first stage**: the scheduler examined every node and **rejected all of them**, and the event says **why, per node**.

**How the scheduler thinks:** for each unscheduled pod it **filters** nodes (can this pod run here?) and **scores** the survivors. The filters are the causes: enough **CPU and memory** (requests against **allocatable**, not capacity), a free **pod slot**, no **untolerated taint**, matching **nodeSelector/affinity**, **volumes** reachable and bound, node **schedulable** (not cordoned) and **Ready**, **topology spread** and **anti-affinity** rules, **ports**, **quota** and priority. Every cause below is one filter.

> "A node joined" only means the kubelet registered. It says nothing about whether the node is **Ready**, **untainted**, in the **right zone**, the **right architecture**, or has **spare resources and pod slots**.

## 2. Seven causes, reproduced for real

Create one pod per cause (each with a deliberate problem):

```run
kubectl apply -f - > /dev/null <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: toobig}
spec:
  containers: [{name: c, image: busybox:1.36, command: [sleep, "3600"], resources: {requests: {cpu: "64", memory: 1Ti}}}]
---
apiVersion: v1
kind: Pod
metadata: {name: selector}
spec:
  nodeSelector: {disktype: ssd}
  containers: [{name: c, image: busybox:1.36, command: [sleep, "3600"]}]
---
apiVersion: v1
kind: Pod
metadata: {name: zone}
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions: [{key: topology.kubernetes.io/zone, operator: In, values: [eu-west-1c]}]
  containers: [{name: c, image: busybox:1.36, command: [sleep, "3600"]}]
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: data}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: fast
  resources: {requests: {storage: 1Gi}}
---
apiVersion: v1
kind: Pod
metadata: {name: volume}
spec:
  containers: [{name: c, image: busybox:1.36, command: [sleep, "3600"], volumeMounts: [{name: d, mountPath: /d}]}]
  volumes: [{name: d, persistentVolumeClaim: {claimName: data}}]
EOF
# a taint on the node, then a pod without a toleration
kubectl taint nodes lab-node dedicated=gpu:NoSchedule > /dev/null
kubectl run tainted --image=busybox:1.36 -- sleep 3600 > /dev/null
sleep 8
kubectl get pods
```

Now **read the scheduler's reason** for each (this is the single most useful command in this scenario):

```run
for p in toobig selector zone volume tainted; do
  printf '%-9s ' "$p"
  kubectl get events --field-selector involvedObject.name=$p,reason=FailedScheduling -o jsonpath='{.items[-1].message}' | sed 's/ preemption:.*//'
  echo
done
```

**What you see, and how to read each message:**

| Message | Cause | Fix |
|---|---|---|
| `Insufficient cpu`, `Insufficient memory` | the pod's **requests** exceed what any node has **free** (allocatable minus what other pods requested) | lower the request, add or enlarge nodes, evict or right-size others |
| `didn't match Pod's node affinity/selector` (the `selector` and `zone` pods) | `nodeSelector` or required node affinity names a **label no node has** (a typo, a missing label, a zone with no nodes) | fix the selector, **label the node**, or add nodes where the label is true |
| `had untolerated taint(s)` | the node carries a **taint** the pod does not **tolerate** | add a **toleration**, or remove the taint (dedicated pools) |
| `pod has unbound immediate PersistentVolumeClaims` | the PVC is **not bound**: no StorageClass named `fast`, no provisioner, no matching volume | create the class or fix the name; check the provisioner/CSI driver |

Check the claim and the node details that explain these:

```run
echo "--- the PVC:"
kubectl get pvc data
kubectl get storageclass 2>&1 | head -3
echo
echo "--- node labels the selectors had to match (a few):"
kubectl get node lab-node --show-labels | tr ',' '\n' | grep -E "zone|arch|os=|hostname" | head -5
echo
echo "--- node taints:"
kubectl get node lab-node -o jsonpath='{.spec.taints}{"\n"}'
echo
echo "--- allocatable (what the scheduler can hand out):"
kubectl get node lab-node -o jsonpath='cpu={.status.allocatable.cpu} memory={.status.allocatable.memory} pods={.status.allocatable.pods}{"\n"}'
```

### Fixing them

```run
# 1. tolerate the taint (a new pod with a toleration), 2. remove the bad selector by relabelling the node
kubectl run tolerant --image=busybox:1.36 --overrides='{"spec":{"tolerations":[{"key":"dedicated","operator":"Equal","value":"gpu","effect":"NoSchedule"}],"containers":[{"name":"tolerant","image":"busybox:1.36","command":["sleep","3600"]}]}}' > /dev/null
kubectl label node lab-node disktype=ssd > /dev/null
sleep 8
kubectl get pods
echo
echo "the 'selector' pod became schedulable as soon as a node carried disktype=ssd; the taint is still on, so 'tainted' stays Pending while 'tolerant' runs."
kubectl taint nodes lab-node dedicated=gpu:NoSchedule- > /dev/null
```

Scheduling is **continuous**: the scheduler **re-tries** pending pods whenever the cluster changes (a label, a taint, a new node), so you rarely need to restart anything after fixing the cause.

### Cause 7: a cordoned (unschedulable) node

`kubectl cordon` (and cluster tooling during upgrades and drains) marks a node **unschedulable**. A node that "joined" may have been cordoned, or be `NotReady`:

```run
kubectl cordon lab-node > /dev/null
kubectl run after-cordon --image=busybox:1.36 -- sleep 3600 > /dev/null
sleep 12
kubectl get pod after-cordon
kubectl get events --field-selector involvedObject.name=after-cordon,reason=FailedScheduling -o jsonpath='{.items[-1].message}' | sed 's/ preemption:.*//'; echo
kubectl get nodes
kubectl uncordon lab-node > /dev/null
sleep 5
kubectl get pod after-cordon
```

**What you see:** the node shows **`Ready,SchedulingDisabled`**, the event says it was **unschedulable**, and after **uncordon** the pod is scheduled at once.

## 3. A triage tool for many pods

In a real cluster there may be hundreds of Pending pods. This script groups them by **cause**, so you fix a **category** at a time:

```run
cat > ~/pending_triage.py <<'PY'
import json, subprocess, collections

# current namespace only; add "-A" to both commands to triage the whole cluster
pods = json.loads(subprocess.check_output(["kubectl", "get", "pods", "-o", "json"]))["items"]
events = json.loads(subprocess.check_output(["kubectl", "get", "events", "-o", "json"]))["items"]

last_msg = {}
for e in events:
    if e.get("reason") == "FailedScheduling":
        last_msg[(e["involvedObject"]["namespace"], e["involvedObject"]["name"])] = e["message"]

RULES = [
    ("Insufficient",                        "resources: requests do not fit any node"),
    ("untolerated taint",                   "taints: add a toleration or fix the node pool"),
    ("node affinity/selector",              "labels/affinity: selector matches no node"),
    ("unbound immediate PersistentVolume",  "storage: PVC not bound (StorageClass/provisioner)"),
    ("volume node affinity",                "storage: volume lives in a different zone than the nodes"),
    ("unschedulable",                       "node cordoned or not ready"),
    ("Too many pods",                       "pod slots: node reached its max pods"),
    ("topology spread",                     "topology spread constraint cannot be satisfied"),
    ("anti-affinity",                       "pod anti-affinity rules cannot be satisfied"),
]
groups = collections.defaultdict(list)
for p in pods:
    if p["status"]["phase"] != "Pending" or p["spec"].get("nodeName"):
        continue
    key = (p["metadata"]["namespace"], p["metadata"]["name"])
    msg = last_msg.get(key, "")
    cause = next((c for needle, c in RULES if needle in msg), "unknown: read 'kubectl describe pod'" if msg else "no scheduling event yet")
    groups[cause].append(f"{key[0]}/{key[1]}")
print(f"{sum(len(v) for v in groups.values())} unscheduled Pending pods")
for cause, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    print(f"\n[{len(items)}] {cause}")
    for i in items: print("   ", i)
PY
python3 ~/pending_triage.py
```

**What you see:** the unscheduled pods grouped by cause. After the fixes above, the pods still Pending are `toobig` (resources), `zone` (affinity) and `volume` (unbound PVC); the others are running. In a real cluster this grouping tells you which **team or component** to talk to for each category.

## 4. Scheduling rules you wrote yourself

- **Topology spread constraints** with `whenUnsatisfiable: DoNotSchedule` leave pods Pending if spreading evenly across zones is impossible (for example only one zone has nodes).
- **Pod anti-affinity** (`required`) means "never next to another replica": with 3 replicas and 2 nodes, the third stays Pending.
- **Priority and preemption:** a high-priority pod may evict lower ones; a low-priority pod waits.
- **ResourceQuota** blocks **creation** (the pod never exists; see S2 in the senior track), whereas a quota on **requests** shows as `FailedCreate` on the ReplicaSet, not Pending.
- **Scheduling gates / readiness gates** set by operators keep a pod deliberately unscheduled.

## 5. EKS-specific causes (general knowledge, Example, not run here)

| Cause | What is happening on EKS | How to confirm | Fix |
|---|---|---|---|
| **Max pods per node** | With the default **VPC CNI**, every pod gets a **VPC IP** from the node's **ENIs**; the **instance type limits ENIs and IPs per ENI**, which sets **maxPods** (about `ENIs × (IPs per ENI − 1) + 2`; for example 17 on t3.medium, 29 on m5.large, 58 on m5.xlarge: check the AWS tables) | event `Too many pods`; `kubectl get node -o jsonpath='{.status.allocatable.pods}'` | larger instances, **prefix delegation** (raises the limit a lot), or custom networking; add nodes |
| **Subnet IP exhaustion** | the node's subnet has **no free IPs**, so the CNI cannot give pods addresses (pods stick in `ContainerCreating` with a CNI error, or the **scheduler** is fine but pods never start) | `ipamd` logs, the `aws-node` DaemonSet, subnet free-IP count | bigger/secondary CIDR for pods, prefix delegation, fewer pods per node |
| **DaemonSets eat the allocatable** | logging, monitoring, security agents each request CPU and memory on **every node**, so a small node has little left | `kubectl describe node` → "Allocated resources" | larger nodes, leaner agent requests |
| **Zone-bound volumes** | an **EBS volume lives in one Availability Zone**; the pod must run in **that zone**. If the new nodes are in **other** zones, the event says **`volume node affinity conflict`** | PV `nodeAffinity` vs node zone labels | add nodes in that zone (per-AZ node groups), use `WaitForFirstConsumer` storage classes, or EFS for cross-zone |
| **Wrong architecture** | pods built for **amd64** with `kubernetes.io/arch=amd64` selectors, but the new node group is **arm64 (Graviton)**, or images are single-arch | node label `kubernetes.io/arch`; image manifest | multi-arch images, matching selectors/tolerations |
| **Node group taints and labels** | managed node groups can carry **taints** (dedicated pools, GPUs, Windows) and **labels** that your workloads do not tolerate or select | `kubectl describe node` | tolerations, or put the right workloads on the pool |
| **Node `NotReady` or still initialising** | node registered but the CNI (`aws-node`), kube-proxy or the kubelet is unhealthy: it carries a **`not-ready`/`unreachable` taint** | `kubectl get nodes`; `kubectl -n kube-system get pods -o wide` | fix the CNI add-on, node IAM role/instance profile, security groups, bootstrap |
| **Fargate profiles** | pods only run on Fargate if a **profile's namespace/labels match**; otherwise they stay Pending when there are no EC2 nodes | `aws eks describe-fargate-profile` | add a profile or use nodes |
| **Cluster Autoscaler / Karpenter** | new nodes are **requested** only when pods are Pending and **fit a defined node group or NodePool**; limits (max size, instance requirements, **service quotas**, no capacity for the instance type) block it | autoscaler logs/events (`NotTriggerScaleUp`) | widen NodePool requirements, raise max size/quotas, diversify instance types |
| **Pod security groups / IAM** | pods needing branch ENIs (security groups for pods) can be limited by instance support | events | supported instance types |

The sentence that wins the interview: **"Nodes joining is not the same as nodes being usable: I read the FailedScheduling event, which names the filter that rejected every node."**

## 6. The debugging order

1. **`kubectl get pods -o wide`** and **`kubectl describe pod <pod>`**: is there a node assigned? Read **Events**, especially **`FailedScheduling`** with the per-node reasons ("0/N nodes are available: ...").
2. **Nodes:** `kubectl get nodes` (Ready? SchedulingDisabled?), `kubectl describe node` (Taints, Allocatable, **Allocated resources**, Conditions, labels including zone and arch).
3. **Resources:** compare the pod's **requests** with node **free allocatable** (`kubectl describe node`), including DaemonSet overhead; look at LimitRange defaults and quotas.
4. **Placement rules:** nodeSelector, affinity, tolerations, topology spread, anti-affinity against **actual node labels**.
5. **Storage:** `kubectl get pvc,pv`, StorageClass, zone of the volume versus the nodes.
6. **Per-node pod limit and IPs (EKS):** allocatable pods, CNI health, subnet IPs.
7. **Scale-up path:** is the **cluster autoscaler or Karpenter** reacting? Its events and limits.
8. **Control plane:** is the **scheduler** healthy (rare)? `kubectl -n kube-system get pods`.

## 7. The answer an interviewer expects

1. **Define Pending** and split it: *not scheduled* (scheduler) versus *scheduled but not started* (kubelet).
2. **Say what you would run first:** `kubectl describe pod` and read the **FailedScheduling** event; it states the reason per node.
3. **List the causes by filter**, with a real example of each: resources (requests vs allocatable, DaemonSets), taints/tolerations, selectors/affinity/zone/architecture, volumes (unbound PVC, zone-bound EBS), cordoned or NotReady nodes, topology and anti-affinity, **EKS pod-per-node limits and IP exhaustion**, quotas and priorities.
4. **Show the fix for each** and that scheduling retries automatically.
5. **Prevent:** right-sized requests, node pools with clear taints/labels documented, multi-AZ node groups for stateful workloads, `WaitForFirstConsumer`, alerts on Pending pods over N minutes, autoscaler/Karpenter configured with the instance flexibility your pods need.

A spoken version: *"Nodes joining just means they registered. I'd describe a Pending pod and read the FailedScheduling event, which says which filter rejected the nodes. Then it's one of a handful: requests that don't fit allocatable after DaemonSets, a taint the pod doesn't tolerate, a selector or affinity or zone or architecture that matches no node, a PVC that's unbound or pinned to another AZ, a cordoned or NotReady node, topology or anti-affinity I wrote myself, or on EKS the max-pods-per-instance and IP limits of the VPC CNI. I'd fix the specific rule, and add alerts so Pending pods are noticed in minutes."*

:::warn Common mistakes
- **Checking node count only**: capacity is **allocatable minus requests**, per node.
- **Ignoring DaemonSet overhead** on small nodes.
- **Using required anti-affinity or strict spread** with fewer nodes or zones than replicas.
- **Single-AZ node groups with EBS-backed pods**.
- **Treating `ContainerCreating` like `Pending`**: it is a kubelet/CNI/volume problem on a chosen node.
- **Over-large requests "to be safe"**: they cause Pending pods and wasted nodes (FinOps, Q5).
- **Restarting things** instead of reading the event.
:::

## 8. Follow-up questions to expect

- **"The pod is Pending but the cluster has plenty of free CPU."** Free CPU is **spread across nodes**; no single node fits the request, or a taint/selector/volume/topology rule excludes the free nodes.
- **"How do you stop one team's Pending pods from blocking others?"** Priority classes, quotas per namespace, node pools per team.
- **"What is the difference between requests and limits for scheduling?"** The **scheduler uses requests**; limits matter at runtime (throttling, OOM kill).
- **"The autoscaler did not add a node. Why?"** The pod would **not fit any configured node type** (too big), a selector no node group satisfies, limits reached, or capacity/quotas unavailable.

:::try
1. Create a pod with a **required pod anti-affinity** to itself plus 2 replicas on the single-node lab. What does the second say?
2. Add a **toleration** and a **nodeSelector** together to the `tainted` pod's spec and watch it schedule.
3. Extend `pending_triage.py` to print the **fix hint** for each cause as well.
4. Compute the maxPods for an instance with 4 ENIs and 15 IPs per ENI using the formula in section 5.
:::

:::recap
- **Pending** before scheduling means every node was **filtered out**; **`FailedScheduling`** names the reasons.
- The filters: **resources (requests vs allocatable)**, **taints**, **selectors/affinity/zone/arch**, **volumes**, **cordon/Ready**, **topology/anti-affinity**, **pod slots**.
- **Nodes joining ≠ nodes usable.** On EKS add **ENI/IP pod limits**, **zone-bound EBS**, **architecture**, **node group taints**, **autoscaler/Karpenter** limits.
- **Triage by category**, fix the rule, and rely on the scheduler's retries.
:::

:::quiz
? Where do you find why a pod is not being scheduled?
- The container logs
+ The FailedScheduling event in kubectl describe pod
- The node's disk
! It lists per-node rejection reasons.

? A pod with a nodeSelector for a label no node has will:
- Run anywhere
+ Stay Pending until a node carries that label
- Crash
! Required selectors are filters.

? Why can an EBS-backed pod stay Pending on new nodes?
- EBS is slow
+ The volume lives in one Availability Zone and the new nodes are in other zones
- Nodes cannot mount volumes
! Look for "volume node affinity conflict".

? What does the scheduler compare a pod's requests against?
- Node capacity only
+ Node allocatable minus what other pods have already requested
- Limits
! DaemonSets and system reservations count.

? Which statement about EKS pods per node is right?
- It is unlimited
+ It is limited by the instance type's ENIs and IPs per ENI unless prefix delegation or similar is used
- It is always 110
! Check allocatable pods and the CNI configuration.
:::
