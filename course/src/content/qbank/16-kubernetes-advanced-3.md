---
track: qbank
title: "Kubernetes: Advanced questions (part 3 of 3)"
short: Kubernetes advanced 3
sub: 4 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## What happens if a node with local storage gets scaled down by the autoscaler?

<!-- source: 03 Q58 -->

:::note In simple words
If you keep your files in a hotel room's drawer (local disk) and the hotel removes that room to save money, the files are gone. Keep important things in a bank locker (network storage) that you can take to any room.
:::

- Data in **emptyDir**, **hostPath** or **local PersistentVolumes** lives on that node's disk. When the node is removed, **that data is lost**. A pod using a local PV also cannot move to another node (the PV is tied to that node).
- **Cluster Autoscaler** by default **skips scaling down** nodes that run pods with local storage (emptyDir/hostPath), unless the pod is annotated `cluster-autoscaler.kubernetes.io/safe-to-evict: "true"` (or the flag `--skip-nodes-with-local-storage=false` is set). Pods without a controller also block scale-down.
- **Karpenter** consolidation **does** drain and replace nodes; it respects PDBs and the pod annotation **`karpenter.sh/do-not-disrupt: "true"`**, which blocks voluntary disruption.
- Spot interruptions and node failures ignore all of this - the node just disappears.

How to design for it:

- Keep durable data on **network volumes** (EBS via PVC for single-writer, EFS for shared) with **StatefulSets**; the volume reattaches to the pod on another node (same AZ for EBS).
- Use emptyDir only for **scratch/cache** data that can be rebuilt.
- **PDBs** to limit simultaneous evictions; graceful shutdown to flush data.
- **Backups** (Velero, app-level) for anything important.
- If you must use local NVMe (high-performance DBs), rely on app-level replication (Kafka, Cassandra) and use the do-not-disrupt / safe-to-evict annotations deliberately.

**Example:**
```
metadata:
  annotations:
    karpenter.sh/do-not-disrupt: "true"                       # Karpenter
    cluster-autoscaler.kubernetes.io/safe-to-evict: "false"   # Cluster Autoscaler
spec:
  volumes:
  - name: scratch
    emptyDir: {sizeLimit: 2Gi}        # lost when pod/node goes away
```

:::say
Local data in emptyDir, hostPath or local PVs is lost when the node is removed; Cluster Autoscaler skips such nodes by default unless pods are marked safe-to-evict, while Karpenter consolidation drains them unless pods carry the do-not-disrupt annotation. I keep durable data on EBS or EFS through StatefulSets and PVCs, use local disk only for rebuildable scratch data, and add PDBs and backups.
:::

## How do you enforce runtime security in Kubernetes?

<!-- source: 03 Q59 -->

:::note In simple words
Security at the gate (admission) stops dangerous tenants from moving in; security guards inside (runtime detection) watch for someone doing something suspicious after they have moved in.
:::

**1. Before the pod runs (admission):**

- **PodSecurityPolicy was removed in Kubernetes 1.25.** The built-in replacement is **Pod Security Admission** enforcing the **Pod Security Standards** (privileged / baseline / restricted) per namespace via labels.
- **OPA Gatekeeper or Kyverno** for custom policies: only images from our ECR, no `latest` tag, must have limits, no hostPath, required labels.
- **Image signing verification** (cosign/Sigstore with Kyverno or Gatekeeper, AWS Signer + Ratify) so only images built by our pipeline run; vulnerability scanning in CI and in the registry.

**2. How the container runs (hardening via securityContext):**

- `runAsNonRoot`, fixed non-zero UID, `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: true` (writable emptyDir only where needed)
- `capabilities: drop: ["ALL"]`, no `privileged`, no hostNetwork/hostPID
- `seccompProfile: RuntimeDefault`; **AppArmor/SELinux** profiles
- Minimal/distroless images; no service account token unless needed.

**3. While it runs (detection and response):**

- **Falco** (eBPF-based rules: shell spawned in container, write to /etc, unexpected network connection) or **GuardDuty EKS Runtime Monitoring**, Sysdig, Aqua.
- Alerts to on-call; automated response (kill pod, isolate with NetworkPolicy).
- Audit logs + NetworkPolicies to limit lateral movement.

**Example:**
```bash
kubectl label ns prod pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted

apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata: {name: disallow-latest-tag}
spec:
  validationFailureAction: Enforce
  rules:
  - name: require-pinned-tag
    match: {any: [{resources: {kinds: [Pod]}}]}
    validate:
      message: "Image tag latest is not allowed"
      pattern: {spec: {containers: [{image: "!*:latest"}]}}

# Falco rule idea: alert on "Terminal shell in container"
```

:::say
PodSecurityPolicy was removed in 1.25, so I enforce the restricted Pod Security Standard with Pod Security Admission, plus Gatekeeper or Kyverno for custom rules and signed image verification. Containers run non-root with read-only filesystems, all capabilities dropped and seccomp RuntimeDefault, and at runtime Falco or GuardDuty EKS Runtime Monitoring detects suspicious behaviour like shells in containers.
:::

## HPA vs VPA vs Karpenter: when would you NOT use each, and how would you simulate HPA behaviour in staging?

<!-- source: 03 Q60 -->

:::note In simple words
HPA hires more workers, VPA gives each worker a bigger desk, Karpenter builds more office floors. Each is wrong for some jobs - you do not hire ten managers for a one-manager role, and you do not rebuild the office every hour.
:::

| Tool | What it does | When NOT to use it |
| --- | --- | --- |
| HPA | Changes number of pods | Singletons or leader-based/stateful apps that cannot safely run multiple copies; when the bottleneck is elsewhere (DB), so more pods just add load; when CPU is a poor signal (use KEDA or custom metrics) |
| VPA | Changes CPU/memory requests (recreates pods to apply) | Spiky stateless services needing instant reaction (VPA is slow and restarts pods); together with HPA on the same CPU/memory metric (they fight); restart-sensitive apps. Use `updateMode: "Off"` (recommend only) instead |
| Karpenter | Adds/removes nodes for pending pods, consolidates | It does not scale pods at all; very steady workloads where consolidation churn (draining nodes) adds disruption without savings; strict stateful/local-storage pods (use do-not-disrupt) |

A good combination: **HPA** on replicas, **VPA in recommendation mode** to right-size requests, **Karpenter** for nodes.

**Simulate HPA in staging:**

1. Same HPA spec and same requests/limits as prod (HPA math depends on requests).
2. Generate load with **k6, hey or Locust** (ramp-up, spike and soak patterns).
3. Watch `kubectl get hpa -w`, `kubectl describe hpa` events, pod counts, latency and node scale-up time.
4. Tune the `behavior` block (scale-up speed, stabilization windows) and repeat; record time-to-scale.

**Example:**
```
hey -z 5m -c 200 http://api.staging.svc.cluster.local/orders
k6 run --vus 500 --duration 10m spike-test.js
kubectl get hpa api -n staging -w
# NAME  REFERENCE      TARGETS   MINPODS MAXPODS REPLICAS
# api   Deployment/api 180%/70%  3       20      3 -> 8 -> 14

apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata: {name: api-vpa}
spec:
  targetRef: {apiVersion: apps/v1, kind: Deployment, name: api}
  updatePolicy: {updateMode: "Off"}      # recommendations only
```

:::say
I avoid HPA for singletons or stateful leaders, avoid VPA for spiky services and never combine HPA and VPA on the same CPU or memory metric, and I remember Karpenter only scales nodes and can add churn for steady workloads. My usual combination is HPA for replicas, VPA in recommendation-only mode for right-sizing and Karpenter for nodes, and I validate HPA in staging with k6 or hey while watching kubectl get hpa -w and tuning the behavior block.
:::

## How would you implement autoscaling for a multi-tenant workload, including a strategy for tenant isolation?

<!-- source: 03 Q61 -->

*Also asked as:* How do you isolate traffic between environments (dev/test/prod) in a shared AKS cluster?

:::note In simple words
Many families share one apartment building. Each family gets its own flat (namespace) with a fixed electricity quota, VIP families can get their own floor, and the building adds floors when needed - but no family may use up everyone else's electricity.
:::

**Isolation (so one tenant cannot hurt others):**

- **Namespace per tenant** (or per environment) with RBAC.
- **ResourceQuota** caps total CPU/memory/pods per tenant - this also implicitly caps how far that tenant's HPAs can scale. **LimitRange** sets default requests/limits so nothing runs BestEffort.
- **PriorityClasses**: premium tenants and system components preempt lower tiers under pressure.
- **Dedicated node pools** for noisy or premium tenants: taints + tolerations and nodeSelector/affinity; **Karpenter NodePools per tenant tier** (for example `premium` On-Demand, `standard` Spot) with their own limits.
- **NetworkPolicy** default-deny between tenant namespaces.
- **Hard isolation** when required (compliance, untrusted code): **vCluster** (virtual control plane per tenant) or **cluster per tenant**.

**Environments in a shared AKS cluster:** default-deny NetworkPolicy per environment namespace (Azure Network Policy, Calico or Cilium), separate ingress classes/controllers per environment, separate node pools with taints per environment, and Azure RBAC for Kubernetes scoped per namespace. Real advice: **prod should be its own cluster** (blast radius, upgrades, compliance); share only dev/test.

**Scaling:**

- **HPA per tenant Deployment** on CPU or per-tenant custom metrics (requests per second with a `tenant` label via prometheus-adapter).
- **KEDA** for queue-based tenants (per-tenant queue depth / Kafka lag).
- **VPA in recommend-only mode** to right-size requests; do not mix HPA and VPA on the same metric.
- Cluster level: **Karpenter / Cluster Autoscaler** adds nodes in the right pool.
- **Fairness:** quotas + max replicas per tenant + priority so a single tenant's spike cannot starve others; per-tenant rate limiting at the ingress/API gateway.
- Observe per-tenant usage and cost (Kubecost labels) for chargeback.

**Example:**
```yaml
apiVersion: v1
kind: ResourceQuota
metadata: {name: tenant-a-quota, namespace: tenant-a}
spec:
  hard: {requests.cpu: "20", requests.memory: 40Gi, limits.memory: 60Gi, pods: "100"}
---
apiVersion: karpenter.sh/v1
kind: NodePool
metadata: {name: premium}
spec:
  template:
    spec:
      taints: [{key: tier, value: premium, effect: NoSchedule}]
      requirements:
      - {key: karpenter.sh/capacity-type, operator: In, values: [on-demand]}
      nodeClassRef: {group: karpenter.k8s.aws, kind: EC2NodeClass, name: default}
  limits: {cpu: "200"}
---
# tenant-a pods (premium)
tolerations: [{key: tier, operator: Equal, value: premium, effect: NoSchedule}]
nodeSelector: {karpenter.sh/nodepool: premium}
priorityClassName: tenant-premium
```

:::say
I isolate tenants with a namespace each, ResourceQuota and LimitRange, PriorityClasses, default-deny NetworkPolicies and dedicated tainted node pools or Karpenter NodePools per tier, moving to vCluster or a cluster per tenant when hard isolation is required, and for environments I keep prod in its own cluster. Each tenant scales with its own HPA or KEDA trigger on per-tenant metrics, VPA runs in recommendation mode, Karpenter adds nodes, and quotas plus max replicas keep one tenant from starving the others.
:::
