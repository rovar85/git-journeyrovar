---
track: kubernetes
title: Resources, probes and scheduling
short: Probes, scheduling
sub: Requests and limits, health probes that drive restarts and traffic, and how Pods are placed on nodes.
---

:::goals
- set CPU and memory requests and limits and explain what each does
- use readiness, liveness and startup probes
- steer Pods with `nodeSelector`, taints and tolerations
- explain what makes a Pod `Pending`
:::

## Requests and limits

For each container you can state:

| Setting | Meaning | Used by |
|---|---|---|
| **requests** | the amount the container is **guaranteed**; used for **scheduling** (a Pod only fits on a node with that much unreserved) | scheduler |
| **limits** | the **maximum** it may use | kubelet and kernel (cgroups) |

CPU is measured in cores (`500m` = half a core) and is **throttled** when over the limit. Memory is measured in bytes (`256Mi`) and a container that exceeds its limit is **OOM-killed** (exit 137, reason `OOMKilled`). Without requests, the scheduler cannot make good decisions; without limits one Pod can starve the rest.

```setup
export LABNS=lab7
```

@setup k8s

```run
cat > res.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: sized
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sleep", "3600"]
    resources:
      requests: {cpu: 100m, memory: 64Mi}
      limits:   {cpu: 500m, memory: 128Mi}
EOF
kubectl apply -f res.yaml > /dev/null
kubectl wait --for=condition=Ready pod/sized --timeout=60s > /dev/null
kubectl get pod sized -o jsonpath='QoS class: {.status.qosClass}{"\n"}'
kubectl get pod sized -o jsonpath='requests={.spec.containers[0].resources.requests} limits={.spec.containers[0].resources.limits}{"\n"}'
```

The **QoS class** follows from the numbers: `Guaranteed` (requests equal limits for everything), `Burstable` (some requests), `BestEffort` (none). Under node pressure, BestEffort Pods are evicted first.

## Pending: nothing fits

If no node has enough unreserved resources, the scheduler leaves the Pod **Pending** and says why:

```run
kubectl run hungry --image=busybox:1.37 --overrides='{"spec":{"containers":[{"name":"hungry","image":"busybox:1.37","command":["sleep","3600"],"resources":{"requests":{"cpu":"1000","memory":"900Gi"}}}]}}'
sleep 6
kubectl get pod hungry -o jsonpath='phase={.status.phase}{"\n"}'
kubectl get events --field-selector involvedObject.name=hungry -o jsonpath='{.items[0].reason}: {.items[0].message}{"\n"}' | cut -c1-120
kubectl delete pod hungry --wait=false > /dev/null
```

`FailedScheduling: ... Insufficient cpu` (and memory) is the classic message. Fixes: reduce requests, add nodes (cluster autoscaler), or free capacity. `kubectl describe node` shows each node's allocatable resources and what is already requested.

## Probes: how Kubernetes knows an app is healthy

| Probe | Question | If it fails |
|---|---|---|
| **readiness** | "can you take traffic right now?" | the Pod is removed from Service endpoints (no restart) |
| **liveness** | "are you alive or stuck?" | the container is **restarted** |
| **startup** | "have you finished starting?" | disables the other probes until it succeeds; for slow starters |

Probes can run a command (`exec`), make an HTTP request (`httpGet`) or open a TCP connection (`tcpSocket`).

### Readiness controls traffic

```run
cat > ready.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels: {app: api}
  template:
    metadata:
      labels: {app: api}
    spec:
      containers:
      - name: app
        image: busybox:1.37
        command: ["sh", "-c", "touch /tmp/ready; sleep 3600"]
        readinessProbe:
          exec: {command: ["test", "-f", "/tmp/ready"]}
          periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata: {name: api}
spec:
  selector: {app: api}
  ports: [{port: 80}]
EOF
kubectl apply -f ready.yaml > /dev/null
kubectl rollout status deployment/api --timeout=90s | tail -1
count() { kubectl get endpointslices -l kubernetes.io/service-name=api -o jsonpath='{.items[0].endpoints[?(@.conditions.ready==true)].addresses[0]}' | wc -w; }
echo "ready endpoints: $(count)"
victim=$(kubectl get pods -l app=api -o name | head -1)
kubectl exec ${victim#pod/} -- rm /tmp/ready
sleep 6
echo "after one Pod's readiness file is removed: $(count) ready endpoint"
kubectl get pods -l app=api -o custom-columns=READY:.status.containerStatuses[0].ready --no-headers | sort | uniq -c
```

The broken Pod is still `Running` but `READY false`, so the Service stopped sending it traffic. Nothing restarted it: readiness says "do not use me yet", not "I am dead".

### Liveness restarts stuck containers

```run
cat > live.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: stuck
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "touch /tmp/healthy; sleep 5; rm /tmp/healthy; sleep 3600"]
    livenessProbe:
      exec: {command: ["test", "-f", "/tmp/healthy"]}
      initialDelaySeconds: 2
      periodSeconds: 2
      failureThreshold: 2
EOF
kubectl apply -f live.yaml > /dev/null
for i in $(seq 1 40); do kubectl get pod stuck -o jsonpath='{.status.containerStatuses[0].restartCount}' 2>/dev/null | grep -qE '^[1-9]' && break; sleep 2; done
kubectl get pod stuck -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount --no-headers | awk '{print $1, "restarted at least once:", ($2>=1?"yes":"no")}'
kubectl get events --field-selector involvedObject.name=stuck -o custom-columns=REASON:.reason --no-headers | sort -u | tr '\n' ' '; echo
```

The app "hung" (its health file vanished), the liveness probe failed twice, and the kubelet **Killed** and restarted the container. Events: `Unhealthy`, `Killing`. Be careful with liveness probes: an over-strict one (short timeouts, or one that depends on a database) can restart a healthy app in a loop. **Readiness** is usually the one you need most; add **startup** probes for slow starts.

## Steering Pods onto nodes

The scheduler picks a node that fits the requests; you can influence it:

| Tool | Meaning |
|---|---|
| `nodeSelector` | only nodes with this **label** (`disktype=ssd`) |
| **node affinity / anti-affinity** | richer rules, required or preferred |
| **pod affinity / anti-affinity** | place near (cache next to app) or away from (spread replicas) other Pods |
| **taints and tolerations** | a **taint** on a node repels Pods; only Pods that **tolerate** it may land there |
| `topologySpreadConstraints` | spread replicas evenly across zones or nodes |

```run
kubectl label node lab-node disktype=ssd --overwrite > /dev/null
kubectl run wants-ssd --image=busybox:1.37 --overrides='{"spec":{"nodeSelector":{"disktype":"ssd"},"containers":[{"name":"c","image":"busybox:1.37","command":["sleep","3600"]}]}}' > /dev/null
kubectl run wants-gpu --image=busybox:1.37 --overrides='{"spec":{"nodeSelector":{"gpu":"yes"},"containers":[{"name":"c","image":"busybox:1.37","command":["sleep","3600"]}]}}' > /dev/null
sleep 8
kubectl get pods wants-ssd wants-gpu -o custom-columns=NAME:.metadata.name,PHASE:.status.phase --no-headers
kubectl get events --field-selector involvedObject.name=wants-gpu -o jsonpath='{.items[0].message}{"\n"}' | cut -c1-90
kubectl label node lab-node disktype- > /dev/null
```

`wants-gpu` stays Pending: no node has the `gpu=yes` label. Now taints:

```run
kubectl taint node lab-node dedicated=ev:NoSchedule > /dev/null
cat > tol.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: tolerant}
spec:
  tolerations:
  - {key: dedicated, operator: Equal, value: ev, effect: NoSchedule}
  containers:
  - {name: c, image: "busybox:1.37", command: ["sleep", "3600"]}
EOF
kubectl apply -f tol.yaml > /dev/null
kubectl run intolerant --image=busybox:1.37 -- sleep 3600 > /dev/null
sleep 8
kubectl get pods tolerant intolerant -o custom-columns=NAME:.metadata.name,PHASE:.status.phase --no-headers
kubectl taint node lab-node dedicated=ev:NoSchedule- > /dev/null
```

The tainted node accepts only the Pod that tolerates the taint. Taints reserve nodes (for GPU workloads or for a team) and Kubernetes itself uses them (`node.kubernetes.io/not-ready` when a node fails). Effects: `NoSchedule` (do not place new Pods), `PreferNoSchedule`, `NoExecute` (also evict running Pods).

## Quotas and priorities (brief)

- **ResourceQuota** caps total requests/limits and object counts per namespace (lesson 8).
- **LimitRange** gives containers default requests/limits.
- **PriorityClass** lets important Pods preempt less important ones when the cluster is full.
- **PodDisruptionBudget** says "keep at least N replicas up during voluntary disruptions" such as node drains for upgrades.

:::recap
- Requests drive scheduling; limits are enforced (CPU throttled, memory OOM-killed).
- `Pending` plus `FailedScheduling` means nothing fits (resources, selectors, taints).
- Readiness removes a Pod from Service traffic; liveness restarts the container; startup protects slow starters.
- `nodeSelector`, affinity, taints and tolerations control placement.
:::

:::try Your turn
Add a readiness probe `httpGet` on `/` to an nginx Deployment. Break it by pointing the probe at `/missing` and show that the Pods stay `Running` but never become Ready, and the Service has no endpoints.
:::

:::quiz
? A container exceeds its memory limit. What happens?
+ It is OOM-killed (exit 137) and restarted
- It is throttled
- It moves nodes
- Nothing
! CPU is throttled; memory is not compressible.
? A readiness probe fails. What does Kubernetes do?
+ Stops sending Service traffic to that Pod (no restart)
- Restarts the container
- Deletes the Pod
- Drains the node
! Liveness failure causes the restart.
? What is a taint?
+ A node setting that repels Pods unless they have a matching toleration
- A Pod label
- A security scan result
- A kind of volume
! Used to reserve or protect nodes.
:::
