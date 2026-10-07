---
track: kubernetes
title: Scheduling, autoscaling and node maintenance: hands-on drills
short: Scheduling drills
sub: Make a Pod Pending on purpose and read why, then fix it: selectors, taints and tolerations, cordon and drain, resource requests, manual placement, and what an autoscaler needs.
---

:::goals
- read the scheduler's reason from a Pending Pod and fix it
- use node labels with selectors, taints with tolerations, and cordon and drain for maintenance
- explain what a Horizontal Pod Autoscaler needs in order to work, and see it fail without it
- recall the scheduling and autoscaling items of the CKA curriculum
:::

:::note The method of this lesson
Lesson 7 explained these ideas. Here you **break things on purpose and read the evidence**, which is also how the CKA exam tests them. The lab has **one node**, so some scenarios that need several nodes (spreading, anti-affinity) are described rather than shown. The lab cluster has **no metrics server**, which makes the autoscaler section a real demonstration of a classic failure.
:::

```setup
export LABNS=labsched
```

@setup k8s

```setup
kubectl taint nodes lab-node dedicated- > /dev/null 2>&1 || true
kubectl uncordon lab-node > /dev/null 2>&1 || true
kubectl label node lab-node disk- > /dev/null 2>&1 || true
```

## 1. Why is my Pod Pending?

A Pod stays `Pending` while the **scheduler** cannot find a node that satisfies it. The scheduler writes the reason onto the Pod, so **always read it first**. A shortcut to print it:

```run
cat > pending.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: wants-ssd}
spec:
  nodeSelector: {disk: ssd}              # the node has no such label
  containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"]}]
EOF
kubectl apply -f pending.yaml > /dev/null
sleep 3
kubectl get pod wants-ssd --no-headers
kubectl get pod wants-ssd -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")].message}{"\n"}'
```

The message names the cause: **no node matches the Pod's node selector**. Fix it from the node's side by adding the label the Pod asks for:

```run
kubectl label node lab-node disk=ssd
kubectl wait --for=condition=Ready pod/wants-ssd --timeout=60s
kubectl get pod wants-ssd -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName
kubectl delete pod wants-ssd --wait=false > /dev/null
kubectl label node lab-node disk-                   # a trailing minus removes a label: tidy up
```

`nodeSelector` is the simple form. **Node affinity** is the expressive form: **required** rules (`requiredDuringSchedulingIgnoredDuringExecution`) behave like the selector, **preferred** rules (`preferredDuringSchedulingIgnoredDuringExecution` with a weight) are hints, and operators such as `In`, `NotIn` and `Exists` let you write "any of these zones". **Pod affinity and anti-affinity** place Pods **relative to other Pods** (together for low latency, apart for resilience), and **topology spread constraints** distribute replicas evenly across zones or nodes (Lesson 7).

## 2. Taints and tolerations

Labels attract Pods to nodes; **taints repel** them. A taint on a node says "do not schedule here unless you **tolerate** it". Use them to **reserve nodes** (GPU nodes, a dedicated database node) and to mark problem nodes. A taint has a key, an optional value and an **effect**:

| Effect | Meaning |
|---|---|
| `NoSchedule` | new Pods without a matching toleration are **not scheduled** here; existing Pods stay |
| `PreferNoSchedule` | the scheduler **avoids** the node if it can (soft) |
| `NoExecute` | new Pods are refused **and running Pods without a toleration are evicted** |

Taint the node, watch an ordinary Pod fail to schedule, then watch a Pod with a toleration succeed:

```run
kubectl taint nodes lab-node dedicated=gpu:NoSchedule
cat > plain.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: plain}
spec:
  containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"]}]
EOF
cat > tolerant.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: tolerant}
spec:
  tolerations: [{key: dedicated, operator: Equal, value: gpu, effect: NoSchedule}]
  containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"]}]
EOF
kubectl apply -f plain.yaml -f tolerant.yaml > /dev/null
kubectl wait --for=condition=Ready pod/tolerant --timeout=60s > /dev/null
kubectl get pods --no-headers | awk '{print $1, $3}'
kubectl get pod plain -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")].message}{"\n"}'
```

A toleration **permits** scheduling on the tainted node; it does not **force** it (a tolerating Pod can still go elsewhere). To **dedicate** a node you combine a **taint** (keep others off) with a **node selector or affinity** (bring yours on). Remove the taint (note the trailing minus), and the pending Pod schedules by itself:

```run
kubectl taint nodes lab-node dedicated-
kubectl wait --for=condition=Ready pod/plain --timeout=60s > /dev/null
kubectl get pods --no-headers | awk '{print $1, $3}'
kubectl delete pod plain tolerant --wait=false > /dev/null
```

## 3. Node maintenance: cordon and drain

To patch or upgrade a node you take it out of rotation:

| Command | Effect |
|---|---|
| `kubectl cordon NODE` | marks the node **unschedulable**; existing Pods keep running |
| `kubectl drain NODE --ignore-daemonsets` | cordons **and evicts** the Pods (respecting PodDisruptionBudgets); DaemonSet Pods are skipped because they would come back |
| `kubectl uncordon NODE` | makes it schedulable again |

```run
kubectl cordon lab-node
kubectl get nodes --no-headers | awk '{print $1, $2}'
kubectl run after-cordon --image=busybox:1.37 -- sleep 3600 > /dev/null
sleep 3
kubectl get pod after-cordon -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")].message}{"\n"}' | cut -c1-110
echo "--- a drain dry run (server side, nothing is touched):"
kubectl drain lab-node --ignore-daemonsets --delete-emptydir-data --dry-run=server 2>&1 | grep -E "cordoned|cannot delete" | sed -E 's/, continuing command...//; s/(\(use --force to override\):).*/\1 (list of bare Pods)/' | cut -c1-170
kubectl uncordon lab-node
kubectl wait --for=condition=Ready pod/after-cordon --timeout=60s > /dev/null
kubectl get pod after-cordon --no-headers | awk '{print $1, $3}'
kubectl delete pod after-cordon --wait=false > /dev/null
```

The dry run above **refused**, and said why: the Pods in this namespace (`plain`, `tolerant`, `after-cordon` and the others) are **bare Pods** with no controller behind them, so evicting it would destroy it for good (a Deployment would simply recreate its Pod elsewhere). That is the first of three common reasons real drains **fail**: Pods **not managed by a controller** (drain refuses unless you add `--force`), Pods using **emptyDir** data (needs `--delete-emptydir-data`), and a **PodDisruptionBudget** that forbids evicting the last healthy replica (the drain waits). Applications therefore need **at least two replicas** and a sensible PDB to survive maintenance.

## 4. Resource requests: "Insufficient cpu"

The scheduler places Pods by their **requests**, not by actual use (Lesson 7). Ask for more than any node has:

```run
cat > huge.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: huge}
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sleep", "3600"]
    resources: {requests: {cpu: "64", memory: 1Gi}}
EOF
kubectl apply -f huge.yaml > /dev/null
sleep 3
kubectl get pod huge -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")].message}{"\n"}'
kubectl delete pod huge --wait=false > /dev/null
```

Read the message: it counts the nodes and says **why each failed** (`Insufficient cpu`). The fixes are to **lower the request**, **add capacity**, or free resources; adding a node is what a **cluster autoscaler** does when Pods are Pending for lack of resources.

## 5. Manual scheduling and static Pods

Setting `spec.nodeName` **bypasses the scheduler**: the kubelet on that node simply runs the Pod. This is how you place a Pod when the scheduler is **down** (a classic troubleshooting scenario) and also why you can bypass taints and resource checks by accident:

```run
cat > manual.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: manual}
spec:
  nodeName: lab-node
  containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"]}]
EOF
kubectl apply -f manual.yaml > /dev/null
kubectl wait --for=condition=Ready pod/manual --timeout=60s > /dev/null
kubectl get pod manual -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName --no-headers
kubectl get events --field-selector involvedObject.name=manual -o custom-columns=REASON:.reason --no-headers | tr '\n' ' '
echo "<- no 'Scheduled' event: the scheduler was never involved"
kubectl delete pod manual --wait=false > /dev/null
```

**Static Pods** are different again: the **kubelet** reads manifests from a directory on its own node (`/etc/kubernetes/manifests` on kubeadm clusters, set by `staticPodPath` in the kubelet configuration) and runs them **without the API server**; the API shows a read-only **mirror Pod** named `<name>-<node>`. They exist to run the control plane itself. To add one on the exam you place a YAML file in that directory on the node; to remove it, delete the file.

## 6. Autoscaling: what the HPA needs

The **Horizontal Pod Autoscaler (HPA)** changes the **replica count** of a Deployment (or StatefulSet) to keep a metric near a target. The calculation is `desired = ceil(current replicas x current metric / target metric)`. It **needs a metrics source**: for CPU and memory that is the **metrics server** add-on; for custom metrics, an adapter (or KEDA, from the AI infrastructure track). It also needs the Pods to declare **resource requests**, because CPU utilisation is measured **relative to the request**. This lab has no metrics server, so see what a misconfigured autoscaler looks like:

```run
kubectl create deployment web --image=busybox:1.37 --replicas=2 -- sleep 3600 > /dev/null
kubectl set resources deployment web --requests=cpu=100m > /dev/null
kubectl autoscale deployment web --cpu=50% --min=2 --max=6 > /dev/null
sleep 20
kubectl get hpa web --no-headers | awk '{print "targets:", $3, " min:", $5, " max:", $6, " replicas:", $7}'
kubectl get hpa web -o jsonpath='{.status.conditions[?(@.type=="ScalingActive")].message}{"\n"}' | cut -c1-140
kubectl top nodes 2>&1 | head -1
```

`<unknown>` as the target and `ScalingActive` false mean the HPA **cannot read the metric**: nothing will ever scale. The first checks in that situation: is the **metrics server** installed (`kubectl top nodes` works only if it is), do the Pods have **requests**, and is the HPA pointing at the right target? In a cluster with a metrics server the same objects report a percentage and the replica count follows the formula. Other autoscalers to know by name: the **Vertical Pod Autoscaler** (adjusts the **requests** of Pods, a separate add-on, from my knowledge), and the **cluster autoscaler** (adds and removes **nodes**). HPA behaviour can be tuned with `behavior:` (stabilisation windows, rate limits) to avoid flapping.

```run
kubectl delete hpa web > /dev/null; kubectl delete deployment web --wait=false > /dev/null
```

## 7. Speed drills (write each from memory)

Practise until each takes under two minutes, without copying:

1. Label the node `zone=a` and run a Pod only on nodes with that label.
2. Taint the node `env=prod:NoSchedule`; run one Pod that tolerates it and one that does not; explain the difference.
3. Cordon, then drain a node with `--ignore-daemonsets`; list where the Pods went; uncordon.
4. Create a Deployment of 3 replicas with CPU request 200m and an HPA to 6 replicas at 70% CPU.
5. Make a Pod with a node affinity **preference** (weight 50) for `disk=ssd` that still runs if no node has the label.
6. Place a Pod on a named node without the scheduler.

:::warn Common mistakes
- **Not reading the scheduler's message.** The Pod's `PodScheduled` condition and `kubectl describe pod` events tell you the exact cause.
- **Thinking a toleration forces placement.** It only allows it; pair it with a selector or affinity.
- **Forgetting the trailing minus** to remove a taint or label (`key-`).
- **Draining bare Pods or single-replica workloads** and causing an outage.
- **An HPA without resource requests, or without a metrics server**; it silently shows `<unknown>`.
- **Using `nodeName` to "fix" scheduling** and hiding the real constraint.
:::

:::recap
- A Pending Pod's **PodScheduled message** names the reason; read it before anything else.
- **Selectors and affinity** attract; **taints** repel (`NoSchedule`, `PreferNoSchedule`, `NoExecute`); **tolerations** permit.
- **cordon** stops new Pods, **drain** also evicts, **uncordon** restores; PDBs and replicas decide whether a drain is safe.
- Scheduling uses **requests**; `nodeName` bypasses the scheduler; **static Pods** are run by the kubelet from a manifest directory.
- The **HPA** needs a metrics source and requests; without them it shows `<unknown>`.
:::

:::try Your turn
Create a Pod with a **preferred** node affinity for `disk=ssd` (weight 80) and another with a **required** affinity for `disk=nvme`. Predict which one runs and which stays Pending, then check with the `PodScheduled` message and fix the second one.
:::

:::quiz
? How do you remove the taint `dedicated=gpu:NoSchedule` from a node?
+ kubectl taint nodes NODE dedicated-
- kubectl untaint NODE dedicated
- kubectl taint nodes NODE dedicated=gpu
- kubectl label NODE dedicated-
! A trailing minus removes a taint or label.
? What does `kubectl drain` do beyond `cordon`?
+ It evicts the Pods (except DaemonSet Pods) so they reschedule elsewhere
- It deletes the node
- It restarts the kubelet
- It upgrades Kubernetes
! Cordon only marks the node unschedulable.
? Why does an HPA show `<unknown>` as its target?
+ It cannot read the metric: no metrics server or no resource requests on the Pods
- The Deployment has too many replicas
- The target is too high
- HPAs do not support CPU
! Fix the metric source first.
:::
