---
track: qbank
title: "Kubernetes: Advanced questions (part 2 of 3)"
short: Kubernetes advanced 2
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How would you secure a Kubernetes cluster at the network, pod and identity/access levels?

<!-- source: 03 Q44 -->

*Also asked as:* How would you secure a Kubernetes / GKE cluster?

:::note In simple words
Secure a building in layers: fence and gates (network), rules for how each tenant behaves (pod security), and ID cards with only the rooms you need (identity and access).
:::

**Network level**

- Private cluster / private API endpoint (or restrict public endpoint CIDRs); nodes in private subnets.
- NetworkPolicies default-deny; Security Groups (SG for pods on EKS).
- TLS at Ingress + WAF (AWS WAF / Cloud Armor); mTLS between services with a service mesh.
- Restrict egress (egress policies, NAT/firewall allow-lists).

**Pod / workload level**

- **Pod Security Standards** (`restricted` via Pod Security Admission labels on namespaces).
- `runAsNonRoot`, `readOnlyRootFilesystem`, drop all capabilities, no `privileged`, no hostPath/hostNetwork.
- Signed, scanned images (Trivy in CI, ECR scanning), allow only trusted registries, pin by digest.
- Policy engines **OPA Gatekeeper / Kyverno** to enforce rules (no latest tag, must have limits).
- Resource limits to prevent noisy-neighbor DoS; runtime detection (Falco, GuardDuty EKS Runtime).

**Identity & access level**

- RBAC least privilege; namespace-scoped Roles; no one uses cluster-admin daily.
- EKS access entries / GKE IAM; short-lived tokens; SSO.
- Pods use **IRSA / Pod Identity / GKE Workload Identity**, not node credentials; `automountServiceAccountToken: false` where not needed.
- Secrets encrypted with KMS, external secret stores.
- **Audit logging** enabled to CloudWatch / Cloud Logging; regular version upgrades and CIS benchmark (kube-bench).

**Example:**
```bash
kubectl label ns prod pod-security.kubernetes.io/enforce=restricted

securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities: {drop: ["ALL"]}
  seccompProfile: {type: RuntimeDefault}

kubectl auth can-i --list --as=system:serviceaccount:prod:api -n prod
```

:::say
At the network level I use private endpoints, private subnets, default-deny NetworkPolicies, WAF and TLS or mTLS. At the pod level I enforce the restricted Pod Security Standard, non-root read-only containers, scanned images and Gatekeeper or Kyverno policies. For identity I apply least-privilege RBAC, IRSA or Workload Identity for pods, KMS-encrypted secrets and audit logging.
:::

## How do you manage secrets across multi-region Kubernetes clusters?

<!-- source: 03 Q46 -->

:::note In simple words
Keep one master copy of each key in a central safe that automatically makes copies in each city's branch vault, and let each city's workers fetch from their local vault.
:::

Design:

- **Single source of truth:** AWS Secrets Manager with **multi-region replica secrets** (primary in region A, read replicas in B/C; same name, replicated automatically, each encrypted with a regional KMS key). Alternatively Vault with performance replication.
- **Per-cluster sync:** each cluster runs **External Secrets Operator** with a `ClusterSecretStore` pointing to its **local region** endpoint, authenticated by **IRSA / Pod Identity** (per-cluster IAM role scoped to specific secret ARNs/paths like `prod/orders/*`).
- **Consistent naming:** `env/app/secret` so the same ExternalSecret manifest (via Helm/Argo CD ApplicationSet) works in every region.
- **Rotation:** rotate once at the primary (Lambda rotation); replicas update; ESO `refreshInterval` pulls new values; apps reload (Reloader or checksum annotation roll).
- **Failover:** if the primary region is down, replicas can be **promoted** to standalone.
- Audit with CloudTrail in each region; alert on access-denied spikes.

**Example:**
```bash
aws secretsmanager replicate-secret-to-regions --secret-id prod/orders/db \
  --add-replica-regions Region=ap-southeast-1 Region=eu-west-1

apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata: {name: aws-sm}
spec:
  provider:
    aws:
      service: SecretsManager
      region: ap-southeast-1          # local region per cluster
      auth:
        jwt: {serviceAccountRef: {name: external-secrets, namespace: external-secrets}}
```

:::say
I keep secrets in AWS Secrets Manager with multi-region replicas and run External Secrets Operator in every cluster, each reading from its local region using a scoped IRSA role. Rotation happens once at the primary, replicas propagate, ESO refreshes the Kubernetes Secret and Reloader restarts the pods; replicas can be promoted if the primary region fails.
:::

## How do you handle database credential rotation in Kubernetes without downtime?

<!-- source: 03 Q47 -->

:::note In simple words
Change the lock on a door while people are still using it: first make the new key work too, hand out new keys, then retire the old key.
:::

Steps:

1. Store credentials in **AWS Secrets Manager** (or Vault) - not hard-coded.
2. Enable **automatic rotation** (Secrets Manager rotation Lambda for RDS). Use the **alternating users** strategy (two DB users, rotate one while the other is active) or keep AWSPREVIOUS valid briefly, so existing connections do not break.
3. **Sync to K8s:** External Secrets Operator with a short `refreshInterval`, or Secrets Store CSI driver with rotation enabled.
4. **App picks up new value:**
- If mounted as a file, the app can re-read it on auth failure.
- If env var, pods must restart: use **Stakater Reloader** (restarts Deployment when Secret changes) or a checksum annotation in Helm -> rolling restart, zero downtime.
5. Connection pools must reconnect gracefully on auth errors.
6. Even better: **Vault dynamic secrets** (short-lived credentials generated per pod) or **RDS IAM authentication** (token instead of password).
7. Monitor: alert on DB auth failures after rotation.

**Example:**
```text
aws secretsmanager rotate-secret --secret-id prod/orders/db --rotation-lambda-arn <arn> \
  --rotation-rules AutomaticallyAfterDays=30

metadata:
  annotations:
    secret.reloader.stakater.com/reload: "db-cred"    # Reloader rolls pods on change
```

:::say
Credentials live in Secrets Manager with automatic rotation using an alternating-users strategy, External Secrets Operator syncs the new value into Kubernetes and Reloader performs a rolling restart so pods pick it up with no downtime. Where possible I prefer RDS IAM auth or Vault dynamic secrets so there is no long-lived password at all.
:::

## What is your strategy for backup and restore in a Kubernetes cluster? How do you handle disaster recovery for stateful apps on containers?

<!-- source: 03 Q48 -->

*Also asked as:* What is your approach to disaster recovery for stateful apps running on containers?

:::note In simple words
Back up two things: the building's blueprint (Kubernetes objects) and the contents of the vaults (persistent data). A backup only counts if you have practised rebuilding from it.
:::

What to back up:

- **Cluster objects:** ideally already in **Git** (GitOps) + Helm charts, so a cluster can be rebuilt with Terraform + Argo CD.
- **etcd snapshots** (self-managed clusters only; EKS/GKE manage etcd).
- **Persistent volumes / data:** EBS snapshots, application-level dumps.
- **Velero:** backs up namespaces/resources to S3 and volumes via snapshots or file-level (Kopia), on a schedule, with restore to the same or another cluster (also used for migrations).

Stateful DR strategy:

- Prefer **managed data services** (RDS Multi-AZ, cross-region read replica, automated backups/PITR) over DBs in pods.
- For DBs in K8s: app-consistent backups (`pg_dump`, `mongodump`, operator backups like CloudNativePG/Percona to S3), plus volume snapshots.
- Copy backups **cross-region/cross-account**, S3 versioning + Object Lock.
- Define **RPO/RTO**; choose backup & restore, pilot light, warm standby, or active-active accordingly.
- **Test restores regularly** (monthly restore drill into a scratch namespace, verify checksums / row counts).

**Example:**
```
velero install --provider aws --bucket k8s-backups --backup-location-config region=ap-south-1 \
  --snapshot-location-config region=ap-south-1 --plugins velero/velero-plugin-for-aws:v1.10.0
velero schedule create daily-prod --schedule="0 1 * * *" --include-namespaces prod --ttl 720h
velero backup get
velero restore create --from-backup daily-prod-20260920010000 --namespace-mappings prod:prod-restore-test

# self-managed etcd
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-$(date +%F).db ...
```

:::say
Manifests live in Git so the cluster can be rebuilt with Terraform and Argo CD, Velero takes scheduled backups of namespaces and volume snapshots to S3, and databases get application-consistent backups copied cross-region. I prefer managed databases for state, define RPO and RTO per service, and run regular restore drills because an untested backup is not a backup.
:::

## How do you migrate data from one MongoDB pod to another? How do you manage stateful workloads in Kubernetes?

<!-- source: 03 Q49 -->

:::note In simple words
Moving house for a database: either copy the boxes while the house is closed (dump/restore), or build the new house as an extension that keeps itself in sync and then just move in (replica set).
:::

Stateful workloads need StatefulSets (stable identity), PVCs (persistent storage), headless Services (stable DNS), anti-affinity, PDBs, and ideally an **operator** (MongoDB Community/Percona Operator) that handles replication, failover, backups.

Migration options:

1. **Replica set method (near zero downtime - preferred):**
- Add the new pod (new StatefulSet / new cluster) as a **secondary** member: `rs.add("mongo-new-0.mongo-new:27017")`.
- Wait for initial sync (`rs.status()` shows SECONDARY, low lag).
- `rs.stepDown()` to make the new member primary, update app connection string (or keep it through the Service), then `rs.remove()` old members.
2. **mongodump / mongorestore (simple, needs write freeze):**
- Stop writes or accept a maintenance window, dump from old pod, restore into new pod, switch connection string.
3. **Volume-level:** snapshot the PVC (VolumeSnapshot / EBS snapshot) and create a new PVC from it for the new pod (same data, same engine version).

Always: take a backup first, verify counts/checksums after, keep the old copy until verified.

**Example:**
```bash
kubectl exec -it mongo-0 -n db -- mongosh --eval 'rs.add("mongo-new-0.mongo-new.db.svc:27017")'
kubectl exec -it mongo-0 -n db -- mongosh --eval 'rs.status().members.map(m=>[m.name,m.stateStr])'

# dump and restore
kubectl exec mongo-0 -n db -- mongodump --archive --gzip > dump.gz
kubectl exec -i mongo-new-0 -n db -- mongorestore --archive --gzip < dump.gz
```

:::say
Stateful apps run as StatefulSets with PVCs, headless Services, anti-affinity and ideally an operator. To migrate MongoDB with near-zero downtime I add the new pod as a replica set secondary, wait for sync, step down the old primary and remove old members; for simpler cases I use mongodump and mongorestore in a maintenance window or restore from a PVC snapshot, always verifying data before deleting the old copy.
:::

## How do you perform zero-downtime deployments in Kubernetes?

<!-- source: 03 Q51 -->

*Also asked as:* You need to implement zero-downtime deployment for a service in Kubernetes. Walk me through your plan. / How do you design zero-downtime deployments for STATEFUL apps on Kubernetes?

:::note In simple words
Open new checkout counters and only close the old ones after the new ones are actually serving customers - and let the old cashier finish the customer already at the counter.
:::

Checklist:

1. **Rolling update** with `maxUnavailable: 0`, `maxSurge: 1` (or 25%).
2. **Readiness probe** that truly reflects "can serve traffic"; `minReadySeconds` to catch instant crashes.
3. **Graceful shutdown:**
- App handles **SIGTERM** (stop accepting, finish in-flight requests).
- `preStop` hook `sleep 5-15` so load balancers/kube-proxy remove the pod from endpoints before it stops.
- `terminationGracePeriodSeconds` longer than the longest request.
4. **Enough replicas** (>=2) spread across nodes/AZs + **PDB** so drains do not take all replicas.
5. **Backward-compatible changes:** DB migrations in expand/contract style so old and new versions both work during rollout.
6. For AWS ALB ingress: use IP target mode, set deregistration delay, pod readiness gates.
7. **Progressive delivery** for risky releases: canary/blue-green with Argo Rollouts, automatic rollback on metrics.
8. Verify with `rollout status` + error-rate dashboards; `rollout undo` or `helm rollback` if needed.

**Example:**
```
spec:
  strategy: {type: RollingUpdate, rollingUpdate: {maxSurge: 1, maxUnavailable: 0}}
  minReadySeconds: 10
  template:
    spec:
      terminationGracePeriodSeconds: 45
      containers:
      - name: api
        readinessProbe: {httpGet: {path: /ready, port: 8080}, periodSeconds: 5}
        lifecycle:
          preStop: {exec: {command: ["sh", "-c", "sleep 10"]}}
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: {name: api-pdb}
spec: {minAvailable: 2, selector: {matchLabels: {app: api}}}
```

**Stateful apps (databases, Kafka, Redis, apps with sessions):**

- **StatefulSet rolling updates** go one pod at a time in reverse order. Use `updateStrategy.rollingUpdate.partition` for a canary: only pods with an ordinal >= partition get the new version.
- **Readiness probes that mean "caught up":** for a replica, ready only when replication lag is low, not just when the port is open.
- **PodDisruptionBudget** (`maxUnavailable: 1`), so drains and upgrades never take down the quorum.
- **preStop hook + terminationGracePeriodSeconds** to hand over leadership or drain connections before SIGTERM kills the process.
- **Migration sequencing:** apply expand-only, backward-compatible schema changes first, roll the app, then contract in a later release.
- Prefer **operators** (CloudNativePG, Strimzi for Kafka, Redis operators) that handle switchover and failover properly.

```yaml
apiVersion: apps/v1
kind: StatefulSet
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate: { partition: 2 }     # only pod-2 (and above) gets the new version first
  template:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: db
          lifecycle:
            preStop: { exec: { command: ["/scripts/step-down-and-drain.sh"] } }
          readinessProbe:
            exec: { command: ["/scripts/replica-lag-ok.sh"] }
```

:::say
I use a rolling update with maxUnavailable 0, accurate readiness probes, a preStop sleep plus SIGTERM handling and enough grace period so in-flight requests finish, and PDBs with multiple replicas across zones. Database changes are backward compatible, risky releases go through canary with automatic rollback, and I watch rollout status and error rates to revert quickly.
:::

## How would you do blue-green (and canary) deployments in a Kubernetes / EKS cluster?

<!-- source: 03 Q52 -->

*Also asked as:* How do you handle blue/green deployment for EKS? What would that look like in practice?

:::note In simple words
Blue-green is building a complete second stage behind the curtain, testing it, then turning the spotlight to it in one move - and turning it back instantly if something is wrong. Canary is letting a few audience members try the new show first.
:::

**Blue-green with plain Kubernetes:**

1. `app-blue` Deployment (v1, label `version: blue`) is live; Service selector points to `version: blue`.
2. Deploy `app-green` (v2, `version: green`) at full capacity alongside it.
3. Test green via a separate test Service/host (`green.internal`).
4. **Switch:** patch the Service selector to `version: green` - all traffic moves at once.
5. **Rollback:** patch selector back to `blue` (seconds). Keep blue running until confident, then scale it down.

**Gradual traffic shifting (canary style):**

- **Istio VirtualService weights:** 90/10 -> 50/50 -> 100/0 between subsets; rollback = set weights back to 100% old, no pod restarts.
- **NGINX Ingress** canary annotations (`canary-weight: "10"`) or **ALB weighted target groups**.
- **Argo Rollouts / Flagger** automate steps and run **analysis** (Prometheus error rate, latency) and auto-rollback.

Watch-outs: double capacity during blue-green (cost), DB schema must work for both versions, sticky sessions/long connections, and consumers (Kafka workers) should not both process in parallel unexpectedly.

**Example:**
```bash
kubectl patch svc app -p '{"spec":{"selector":{"app":"app","version":"green"}}}'
kubectl patch svc app -p '{"spec":{"selector":{"app":"app","version":"blue"}}}'   # rollback

apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: {name: app}
spec:
  hosts: [app]
  http:
  - route:
    - {destination: {host: app, subset: blue},  weight: 90}
    - {destination: {host: app, subset: green}, weight: 10}   # then 50, then 100
```

:::say
For blue-green I run blue and green Deployments side by side, test green on an internal route, then switch the Service selector or ingress target to green and roll back by switching it back. For gradual shifts I use Istio VirtualService weights such as 10, 50 then 100 percent, or Argo Rollouts with Prometheus analysis for automatic rollback, keeping database changes compatible with both versions.
:::

## How would you set up an automated rollback strategy in Kubernetes for failed deployments?

<!-- source: 03 Q53 -->

*Also asked as:* Explain how you would handle a failed rollout during a deployment.

:::note In simple words
Give the deployment a safety net and a referee: if the new version does not become healthy in time, or the error rate goes up, the referee automatically puts the old version back.
:::

Layers of automation:

1. **Kubernetes-native detection:** `progressDeadlineSeconds` marks rollout `Failed` (ProgressDeadlineExceeded) if new pods do not become ready; readiness probes stop bad pods getting traffic; old ReplicaSet stays serving because `maxUnavailable: 0`.
2. **CI/CD gate:** `kubectl rollout status --timeout` or `helm upgrade --atomic --timeout 5m` -> on failure Helm **automatically rolls back** to the previous release and the pipeline fails.
3. **Metric-based rollback (progressive delivery):** **Argo Rollouts** or Flagger run canary steps with an `AnalysisTemplate` querying Prometheus (5xx rate, p99 latency); if the analysis fails, it aborts and returns traffic to stable automatically.
4. **GitOps:** Argo CD - revert the Git commit to roll back; the cluster follows.
5. Post-rollback: alert the team, keep the failed ReplicaSet/pods logs for RCA, block re-deploy until fixed.

**Example:**
```text
helm upgrade --install api charts/api -n prod --set image.tag=$TAG --atomic --timeout 5m

apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata: {name: error-rate}
spec:
  metrics:
  - name: error-rate
    interval: 1m
    failureLimit: 1
    successCondition: result[0] < 0.02
    provider:
      prometheus:
        address: http://prometheus.monitoring:9090
        query: |
          sum(rate(http_requests_total{app="api",status=~"5.."}[2m]))
          / sum(rate(http_requests_total{app="api"}[2m]))
```

:::say
I rely on progressDeadlineSeconds and readiness probes so a bad version never takes traffic, and deploy with helm upgrade --atomic so a failed rollout is reverted automatically by the pipeline. For metric-driven safety I use Argo Rollouts canaries with Prometheus analysis on error rate and latency, which abort and restore the stable version on their own.
:::

## What are PodDisruptionBudgets and why do you need them?

<!-- source: 03 Q54 -->

:::note In simple words
A PDB is a rule for maintenance crews: "you may take workers off the line for repairs, but at least 2 must always stay working".
:::

A **PodDisruptionBudget** limits how many pods of an app can be down at the same time due to **voluntary disruptions**: node drains, cluster upgrades, Cluster Autoscaler/Karpenter consolidation, `kubectl drain`.

- `minAvailable: 2` or `maxUnavailable: 1` (number or %).
- The eviction API refuses evictions that would break the budget; the drain waits.
- It does **not** protect against involuntary disruptions (node crash, OOM kill).

Gotchas:

- A PDB with `maxUnavailable: 0` or `minAvailable` = replicas blocks drains forever -> node upgrades hang.
- Single-replica apps with a strict PDB block maintenance; either run 2+ replicas or allow 1 unavailable.

**Example:**
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: {name: api-pdb, namespace: prod}
spec:
  maxUnavailable: 1
  selector: {matchLabels: {app: api}}

kubectl get pdb -n prod
# NAME     MIN AVAILABLE  MAX UNAVAILABLE  ALLOWED DISRUPTIONS
# api-pdb  N/A            1                1
```

:::say
A PodDisruptionBudget caps how many replicas can be evicted at once during voluntary disruptions like drains, upgrades or autoscaler consolidation. I set maxUnavailable 1 for most services with at least two replicas, and avoid budgets that allow zero disruptions because they block node upgrades.
:::

## What does the pod status ContainerStatusUnknown mean, and when does it occur?

<!-- source: 03 Q55 -->

:::note In simple words
The manager lost contact with a worker's walkie-talkie. He does not know if the worker is still working, has left, or has collapsed - so the status is "unknown".
:::

`ContainerStatusUnknown` means the kubelet **could not determine the container's state**, usually because the container disappeared and its status could not be retrieved (it shows with reason "The container could not be located when the pod was terminated", exit code 137).

Common causes:

- **Node problems:** node became NotReady / lost contact with control plane, kubelet restarted or crashed.
- **Eviction under resource pressure** (disk/memory) where the container was killed and cleaned up.
- **Container runtime issues** (containerd restarted, runtime state lost).
- Node was terminated (Spot interruption, scale-down) while pods were running.

What to do:

1. `kubectl describe pod` and `kubectl get events` - look for Evicted, NodeNotReady, OOM.
2. Check node: `kubectl describe node` conditions (MemoryPressure, DiskPressure), kubelet/containerd logs.
3. Usually the controller has already created a replacement; delete the stale pod (`kubectl delete pod`).
4. Fix root cause: resource requests/limits, disk cleanup, node health, Spot handling.

**Example:**
```text
kubectl get pods -A | grep ContainerStatusUnknown
kubectl describe pod <pod> | sed -n '/State/,/Events/p'
kubectl get pods -A --field-selector=status.phase=Failed -o name | xargs kubectl delete
journalctl -u kubelet --since "1 hour ago"      # on the node
```

:::say
ContainerStatusUnknown means kubelet lost track of the container's state, typically after node pressure evictions, a kubelet or containerd restart, or a node going away. I check pod events and node conditions, clean up the stale pod since the controller usually replaced it, and fix the underlying node or resource issue.
:::

## How would you configure readiness/liveness probes to catch buffering or lag issues in stream-processing microservices before users notice?

<!-- source: 03 Q56 -->

:::note In simple words
Do not just ask the worker "are you breathing?" - ask "are you keeping up with the conveyor belt?" If he is falling behind, stop giving him new boxes before the pile hits customers.
:::

Plain "process is up" checks miss slowness. Design:

- **Readiness = "can I serve well right now?":** expose `/ready` that fails if internal lag exceeds a threshold, e.g. consumer lag > N messages, internal buffer/queue depth > X%, segment processing time > target, dependency (Kafka/Redis) unreachable. Failing readiness removes the pod from the load balancer so users go to healthy pods; it is **not restarted**.
- **Liveness = "am I stuck?":** a **watchdog** timestamp updated by the processing loop; fail only if no progress for, say, 60s (deadlock). Do **not** tie liveness to lag, or a traffic spike restarts all pods and makes it worse.
- **Startup probe** covers warm-up (loading codecs, caches) so pods are not killed at boot.
- Tuned timing: `periodSeconds: 5`, `failureThreshold: 2-3` for readiness (fast reaction), longer for liveness.
- Probes are only a safety net: also export **metrics** (lag, buffer ratio, rebuffer rate, p99 latency) to Prometheus with alerts and HPA/KEDA scaling on lag, plus synthetic playback checks.

**Example:**
```
readinessProbe:
  httpGet: {path: /ready, port: 8080}     # 503 if lag > 2s or buffer > 80%
  periodSeconds: 5
  failureThreshold: 2
  timeoutSeconds: 1
livenessProbe:
  httpGet: {path: /live, port: 8080}      # 500 only if loop idle > 60s
  periodSeconds: 10
  failureThreshold: 6
startupProbe:
  httpGet: {path: /live, port: 8080}
  periodSeconds: 5
  failureThreshold: 24
```

:::say
I make readiness reflect quality of service, failing when processing lag or buffer depth crosses a threshold so the pod is taken out of rotation, while liveness only detects a stuck processing loop via a heartbeat so load spikes do not trigger restart storms. A startup probe covers warm-up, and lag metrics also drive alerts and KEDA scaling.
:::

## How does data flow in a Kubernetes cluster? Explain the Kubernetes networking model.

<!-- source: 03 Q57 -->

:::note In simple words
Every pod gets its own phone number and can call any other pod directly, with no switchboard operator changing numbers in between. Services are shared hotline numbers that forward to whichever pod is free, and the Ingress is the reception desk for calls from outside.
:::

**The networking model (rules every CNI must follow):**

- Every pod gets its **own IP**; containers in a pod share it (talk over `localhost`).
- **Pod-to-pod without NAT**, across all nodes: the IP a pod sees for itself is the IP others use.
- Nodes can reach all pods and vice versa.

**How packets move:**

1. **Same node:** pod eth0 -> **veth pair** -> node bridge / routing table -> other pod's veth. Never leaves the node.
2. **Across nodes:** handled by the **CNI plugin**:
- **Overlay** (Flannel VXLAN, Calico IPIP/VXLAN): packet is encapsulated with the node IPs, sent across, decapsulated. Pod IPs come from a separate range.
- **Native routing** (AWS VPC CNI, Azure CNI, GKE VPC-native): pods get **real VPC IPs** on node ENIs, so the VPC routes them directly - no encapsulation, but subnets must have enough IPs.
3. **Pod -> Service (east-west):** app resolves `svc.ns` via **CoreDNS** -> gets the ClusterIP (a virtual IP that exists on no interface) -> **kube-proxy** rules (iptables or IPVS) on the source node **DNAT** it to a Ready endpoint pod IP -> normal pod-to-pod path. **Cilium** can replace kube-proxy with eBPF.
4. **External -> app (north-south):** client -> DNS (Route 53) -> cloud load balancer (ALB/NLB) -> ingress controller pods (or directly to pod IPs in IP target mode) -> Service -> pod.
5. **Pod -> internet (egress):** pod -> node -> SNAT to node IP -> NAT Gateway -> internet.

**Example:**
```
                 Client
                   |  DNS: app.example.com -> ALB
                   v
          +------------------+
          |  Cloud LB (ALB)  |
          +--------+---------+
                   v
          +------------------+      Ingress rules: host/path
          | Ingress ctrl pod |
          +--------+---------+
                   |  Service "api" ClusterIP 10.100.5.20
                   |  kube-proxy DNAT -> endpoint pod IP
      +------------+-------------+
      v                          v
 Node A                      Node B
 [api pod 10.0.1.15]         [api pod 10.0.2.33]
   | veth                        | veth
 [bridge/routes]             [bridge/routes]
   +------- CNI (VPC routing or VXLAN overlay) -------+
 api pod -> "db.data" -> CoreDNS -> ClusterIP -> db pod IP

kubectl get pods -o wide              # pod IPs and nodes
kubectl get endpointslices -l kubernetes.io/service-name=api
sudo iptables -t nat -L KUBE-SERVICES | grep api      # on a node (iptables mode)
```

For troubleshooting along this path, see the scenario questions on Ingress, request-flow 503s and pod-to-pod connectivity.

:::say
Kubernetes uses a flat network where every pod has its own IP and can reach any other pod without NAT; same-node traffic goes over veth pairs and the bridge, while cross-node traffic is carried by the CNI either as an overlay like VXLAN or with native VPC IPs as in the AWS VPC CNI. Services are virtual IPs that kube-proxy DNATs to Ready pod endpoints, CoreDNS maps names to them, and external traffic flows DNS, load balancer, ingress controller, Service, pod.
:::
