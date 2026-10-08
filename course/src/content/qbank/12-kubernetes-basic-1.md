---
track: qbank
title: "Kubernetes: Basic questions (part 1 of 2)"
short: Kubernetes basic 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Explain Kubernetes: what is it, how does it work, and what does each control-plane component do?

<!-- source: 03 Q1 -->

*Also asked as:* What are the core components of Kubernetes, and which matter most? Explain Kubernetes architecture. How does Kubernetes work? / How do worker nodes communicate with the control plane?

:::note In simple words
Kubernetes is the manager of a big restaurant kitchen. You tell the manager "I always want 3 cooks making pizza", and the manager keeps checking and hires or replaces cooks so there are always exactly 3.
:::

Kubernetes (K8s) is a container orchestrator. You describe the **desired state** in YAML (for example "3 replicas of my app, image v2"), and Kubernetes runs **control loops** that keep comparing desired state with actual state and fixing the difference.

A cluster has two parts:

- **Control plane (the brain)**
- **Worker nodes (the muscle)** that actually run your Pods

| Component | Where | Job in plain words |
| --- | --- | --- |
| kube-apiserver | Control plane | The front door. Every kubectl command, controller and kubelet talks only to it. Validates and stores objects. |
| etcd | Control plane | The cluster's database (key-value). Stores all desired and current state. |
| kube-scheduler | Control plane | Picks which node a new Pod should run on (based on CPU/memory requests, affinity, taints). |
| kube-controller-manager | Control plane | Runs controllers (Deployment, ReplicaSet, Node, Job...) that fix drift between desired and actual state. |
| cloud-controller-manager | Control plane | Talks to AWS/GCP/Azure to create load balancers, attach volumes, etc. |
| kubelet | Every node | Agent that starts/stops containers for Pods assigned to its node and reports health. |
| kube-proxy | Every node | Programs iptables/IPVS rules so Service IPs route to Pod IPs. |
| Container runtime | Every node | containerd/CRI-O actually runs the containers. |

Which matter most? The **API server** (nothing works without it) and **etcd** (lose it without a backup and you lose the cluster's state) are the most critical; on the node side, **kubelet** (no kubelet = node NotReady) and **CoreDNS** (no DNS = services cannot find each other).

Flow of `kubectl apply -f deploy.yaml`: kubectl -> API server -> saved in etcd -> Deployment controller creates a ReplicaSet -> ReplicaSet controller creates Pods -> scheduler assigns each Pod to a node -> kubelet on that node pulls the image and starts the container -> kube-proxy makes it reachable via the Service.

**Example:**
```bash
kubectl get componentstatuses        # older clusters
kubectl get pods -n kube-system      # coredns, kube-proxy, aws-node (CNI) ...
kubectl get nodes -o wide
```

**How worker nodes talk to the control plane:**

- Everything goes through the **API server**. Nodes never talk to etcd, the scheduler or the controller manager directly.
- **Node -> control plane:** the kubelet and kube-proxy open outbound TLS connections to the API server (port 443 or 6443) using the node's credentials (client certificate or, on EKS, an IAM-based token). The kubelet **watches** for pods assigned to its node and reports node and pod status back. kube-proxy watches Services and EndpointSlices.
- **Control plane -> node:** the API server calls the kubelet on **port 10250** for `kubectl logs`, `exec`, `port-forward` and metrics. In EKS this path uses cross-account ENIs placed in your subnets; some setups use the Konnectivity proxy instead.
- The node's **lease** object in `kube-node-lease` is its heartbeat. If renewals stop for about 40 seconds, the node controller marks the node NotReady.

```bash
kubectl get --raw /api/v1/nodes/ip-10-0-1-23/proxy/healthz   # API server -> kubelet 10250
kubectl get lease -n kube-node-lease                          # node heartbeats
```

:::say
Kubernetes is a declarative container orchestrator: I declare desired state and control loops keep reality matching it. The control plane has the API server as the single entry point, etcd as the state store, the scheduler for placement and the controller manager for reconciliation; each worker node runs kubelet, kube-proxy and a container runtime. On EKS, AWS manages the control plane and we manage the node groups.
:::

## Which component watches your deployment.yaml and keeps the Pods running exactly as defined?

<!-- source: 03 Q2 -->

*Also asked as:* Walk me through what the controller manager does during a Deployment - the reconciliation logic, not rollout status.

:::note In simple words
You hand the order to the front desk (API server), it is written in the notebook (etcd), and a supervisor (controller manager) keeps walking around making sure reality matches the notebook, all day, forever.
:::

No single component "watches the file". The YAML file is only sent once (`kubectl apply`). After that:

1. **kube-apiserver** validates it and stores the Deployment object in **etcd**.
2. **kube-controller-manager** runs the **Deployment controller**, which watches Deployment objects (via the API server) and creates/updates a **ReplicaSet**.
3. The **ReplicaSet controller** watches ReplicaSets and Pods; if there are fewer Pods than `replicas` (a Pod crashed, a node died), it creates new Pod objects. If there are too many, it deletes some.
4. **kube-scheduler** assigns each new Pod to a node.
5. **kubelet** on that node starts the containers and restarts them if they die (per `restartPolicy` and liveness probes).

This "observe -> compare -> act" cycle is called the **reconciliation loop**. It is why deleting a Pod manually just makes a new one appear.

How the reconciliation actually works inside the controller manager:

- Controllers do not poll; they use **informers** that **watch** the API server and keep a local cache of objects. Every add/update/delete event puts the object's key (`namespace/name`) onto a **work queue**.
- A worker takes a key, reads the **desired state** (Deployment spec) and the **actual state** (ReplicaSets and Pods from the cache) and computes the difference. The logic is **level-based**: it looks at the current state, not at the history of events, so a missed event is fixed on the next sync.
- **Deployment controller:** hashes the Pod template into a **`pod-template-hash`** label. If a ReplicaSet with that hash exists, it just scales it; if the template changed, it creates a new ReplicaSet with the new hash, then scales new up and old down within `maxSurge`/`maxUnavailable`. It writes progress into Deployment `status` (replicas, updatedReplicas, availableReplicas, conditions `Progressing`/`Available`).
- **ReplicaSet controller:** counts Pods matching its selector (including the hash label), creates or deletes Pods to match `replicas`, and sets **ownerReferences** so the Pods belong to it (garbage collector deletes them when the owner is deleted).
- **Scheduler** binds Pending Pods to nodes; **kubelet** watches Pods bound to its node, runs containers and reports status back. Those status updates generate new events, and the loop continues.
- If something fails (API error, conflict), the key is **re-queued with back-off**, so the system keeps converging.

**Example:**
```bash
kubectl delete pod web-7c9b-abcde
kubectl get pods -w          # a new web-7c9b-xxxxx appears within seconds
kubectl get events --sort-by=.lastTimestamp | tail
# ... ReplicaSet web-7c9b  SuccessfulCreate  Created pod: web-7c9b-xxxxx
```

:::say
The API server stores the Deployment in etcd, and the controllers inside kube-controller-manager, specifically the Deployment and ReplicaSet controllers, keep reconciling actual pods against that desired state using informers, work queues and a level-based diff, with the pod-template-hash deciding whether to scale an existing ReplicaSet or create a new one. The scheduler places new pods and kubelet keeps containers running on the node, so a deleted or crashed pod is replaced automatically.
:::

## What is etcd? Can Kubernetes function without etcd?

<!-- source: 03 Q3 -->

:::note In simple words
etcd is the kitchen manager's notebook. If the notebook is lost, the cooks already cooking keep cooking, but nobody can take new orders or remember what the kitchen is supposed to look like.
:::

etcd is a distributed, consistent key-value store (uses the Raft consensus algorithm). It holds every object: Deployments, Pods, Secrets, ConfigMaps, node status.

**No, Kubernetes cannot function properly without etcd.** The API server is stateless and reads/writes everything from etcd. If etcd is down:

- Already running Pods usually **keep running** (kubelet and containers do not need etcd moment to moment).
- But you **cannot** create/update/delete anything, scheduling stops, controllers cannot heal failed Pods, and `kubectl` returns errors.

Production etcd runs as an **odd number of members (3 or 5)** so it keeps quorum when one member fails (3 members tolerate 1 failure, 5 tolerate 2). On EKS/GKE/AKS the provider runs etcd for you.

**Example:**
```
# self-managed cluster: check etcd health
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key endpoint health
```

:::say
etcd is the single source of truth for cluster state, so Kubernetes cannot really work without it. Running workloads keep running for a while, but the API becomes unusable and nothing can be scheduled or healed. That is why etcd runs as 3 or 5 members for quorum and is backed up with regular snapshots.
:::

## What are Kubernetes objects? What are the common manifest files/objects and what does each do?

<!-- source: 03 Q4 -->

*Also asked as:* How do you create a Kubernetes "class" (object/manifest) in your project? Which objects have you used in your project?

:::note In simple words
Objects are the "order forms" you give Kubernetes. Each form type asks for something different: a running app, a network address, a config file, a disk.
:::

A Kubernetes object is a persistent record of intent stored in etcd. Every object has `apiVersion`, `kind`, `metadata` (name, namespace, labels) and usually `spec` (what you want) and `status` (what exists).

| Object | What it does (one line) |
| --- | --- |
| Pod | Smallest unit: one or more containers sharing network (IP) and volumes |
| Deployment | Runs stateless pods via ReplicaSets; rolling updates and rollback |
| StatefulSet | Pods with stable names, stable DNS and their own PVCs (databases, Kafka) |
| DaemonSet | One pod on every (or selected) node: log agents, node-exporter, CNI |
| Job | Runs pods until a task completes successfully (migration, batch) |
| CronJob | Creates Jobs on a schedule (backups, reports) |
| Service | Stable IP/DNS name + load balancing to pods selected by labels |
| Ingress | HTTP/HTTPS host and path routing from outside to Services (needs a controller) |
| ConfigMap | Non-sensitive configuration as key-values or files |
| Secret | Sensitive data; **base64-encoded, NOT encrypted by default** - enable KMS encryption at rest and RBAC |
| PersistentVolumeClaim | A pod's request for storage; bound to a PersistentVolume |
| HorizontalPodAutoscaler | Scales replica count on CPU/memory/custom metrics |
| ServiceAccount | Identity for pods (used with RBAC and IRSA) |
| Role | Namespaced set of permissions (verbs on resources) |
| ClusterRole | Cluster-wide set of permissions |
| RoleBinding | Grants a Role/ClusterRole to users, groups or ServiceAccounts in a namespace |
| NetworkPolicy | Firewall rules for which pods may talk to which |
| Namespace | Logical partition for teams/apps (RBAC, quotas) |
| PodDisruptionBudget | Limits how many pods can be voluntarily evicted at once |

Project example: each microservice had a Deployment + Service + ConfigMap + Secret + HPA; Kafka/Redis-like stateful pieces used StatefulSets with PVCs; the log/metrics agents (Promtail, node-exporter) ran as DaemonSets so one copy runs on every node; nightly jobs used CronJobs.

**Example:**
```bash
kubectl api-resources | head
kubectl get deploy,svc,cm,secret,hpa -n my-app
```

:::say
Objects are the declarative records Kubernetes stores in etcd, each with a spec for desired state and a status for actual state; the everyday set is Pod, Deployment, StatefulSet, DaemonSet, Job, Service, Ingress, ConfigMap, Secret, PVC, HPA and the RBAC objects. In my projects every service had a Deployment, Service, ConfigMap, Secret and HPA, monitoring agents ran as DaemonSets, and stateful components used StatefulSets with PVCs.
:::

## How do you create a Kubernetes object, and what command do you use to get inside a Pod?

<!-- source: 03 Q5 -->

*Also asked as:* How do you write YAML manifests? What is the command to enter a pod?

:::note In simple words
You can either give Kubernetes spoken instructions one at a time (imperative) or hand it a written plan it keeps following (declarative). Getting into a Pod is like opening a remote terminal into that little computer.
:::

**Creating objects - two styles:**

| Style | Commands | When |
| --- | --- | --- |
| Imperative | `kubectl create deployment`, `kubectl run`, `kubectl expose`, `kubectl scale` | Quick tests, learning, generating YAML |
| Declarative | `kubectl apply -f file.yaml` (or Helm / Argo CD) | Production: files live in Git, repeatable, reviewable |

Every manifest needs four top-level fields: `apiVersion`, `kind`, `metadata` (name, namespace, labels) and `spec`. Use `kubectl explain deployment.spec.template.spec.containers` to look up fields instead of memorizing them, and validate with `kubectl apply --dry-run=server -f`.

`kubectl create -f` fails if the object already exists; `kubectl apply -f` creates or updates it. A handy trick is to generate YAML imperatively and then manage it declaratively.

**Getting into a Pod:** `kubectl exec -it <pod> -- /bin/sh` (or `bash` if the image has it). Use `-c <container>` for multi-container Pods. Distroless images have no shell, so use `kubectl debug` to attach a temporary debug container.

**Example:**
```bash
kubectl create deployment web --image=nginx --dry-run=client -o yaml > web.yaml
kubectl apply -f web.yaml
kubectl apply -f k8s/                 # whole folder
kubectl diff -f web.yaml              # preview changes

kubectl exec -it web-7c9b-abcde -- /bin/sh
kubectl exec -it web-7c9b-abcde -c sidecar -- sh
kubectl exec web-7c9b-abcde -- env | grep DB_
kubectl debug -it web-7c9b-abcde --image=busybox:1.36 --target=web
```

:::say
For production I create objects declaratively with kubectl apply -f from Git, usually through Helm or Argo CD, and use imperative commands only for quick tests or to generate YAML with dry-run. To get inside a pod I use kubectl exec -it pod -- sh, adding -c for a specific container, or kubectl debug when the image has no shell.
:::

## How do you create an Nginx Deployment and expose it through a Service?

<!-- source: 03 Q8 -->

:::note In simple words
The Deployment starts the nginx "shops"; the Service puts up one permanent signboard and phone number that forwards customers to whichever shop is open.
:::

**Example:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
        resources:
          requests: {cpu: 100m, memory: 128Mi}
          limits:   {memory: 256Mi}
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-svc
spec:
  type: ClusterIP          # NodePort or LoadBalancer to expose outside
  selector:
    app: nginx             # must match pod labels
  ports:
  - port: 80
    targetPort: 80
```
```bash
kubectl apply -f nginx.yaml
kubectl get pods -l app=nginx
kubectl get endpoints nginx-svc      # should list 3 pod IPs
kubectl port-forward svc/nginx-svc 8080:80   # test: curl localhost:8080

# imperative quick way
kubectl create deployment nginx --image=nginx --replicas=3
kubectl expose deployment nginx --port=80 --type=LoadBalancer
```

:::say
I write a Deployment with replicas, a label like app=nginx and containerPort 80, then a Service whose selector matches that label. I verify with kubectl get endpoints to confirm pod IPs are attached, and choose ClusterIP for internal, LoadBalancer or Ingress for external traffic.
:::

## Why are Services necessary, and how does a Service know which Pods to route traffic to?

<!-- source: 03 Q9 -->

:::note In simple words
Pods are like food trucks that keep moving and changing their phone numbers. A Service is the fixed call-center number that always knows where the trucks currently are.
:::

**Why Services:** Pods are temporary. When a Pod restarts or scales, it gets a **new IP**. Clients cannot hard-code Pod IPs. A Service gives:

- A **stable virtual IP (ClusterIP)** and **DNS name** (`my-svc.my-ns.svc.cluster.local`)
- **Load balancing** across all healthy Pods
- Service discovery for other apps

**How it finds Pods:** through **labels and selectors**.

1. The Service has `selector: app: web`.
2. The EndpointSlice controller continuously finds Pods with label `app=web` that are **Ready** (readiness probe passing).
3. It writes their IPs into an **EndpointSlice**.
4. kube-proxy on every node programs iptables/IPVS rules: traffic to the ClusterIP -> one of those Pod IPs.

If a Pod fails its readiness probe, it is removed from endpoints automatically, so no traffic reaches it.

**Example:**
```bash
kubectl get svc web -o jsonpath='{.spec.selector}'   # {"app":"web"}
kubectl get pods -l app=web -o wide
kubectl get endpointslices -l kubernetes.io/service-name=web
# empty endpoints = selector/label mismatch or pods not Ready
```

:::say
Pods are ephemeral and their IPs change, so a Service provides a stable IP, DNS name and load balancing. It selects pods by label selector; the endpoint controller keeps only Ready matching pods in the EndpointSlice and kube-proxy routes the ClusterIP to them. An empty endpoints list is my first check when a Service does not work.
:::

## Why do we use namespaces in Kubernetes?

<!-- source: 03 Q12 -->

:::note In simple words
Namespaces are separate floors in the same office building. Each team gets its own floor with its own access cards and its own electricity budget, but they share the building.
:::

A namespace is a **virtual partition** inside one cluster. Uses:

- **Organization / isolation:** separate teams, apps or environments (`hes`, `mdms`, `monitoring`, `dev`, `staging`). Same object names can exist in different namespaces.
- **Access control:** RBAC Roles/RoleBindings are namespaced, so team A can deploy only in its namespace.
- **Resource limits:** `ResourceQuota` caps total CPU/memory/pod count per namespace; `LimitRange` sets default requests/limits for pods that forget them.
- **Network policy:** NetworkPolicies are applied per namespace, e.g. deny traffic from other namespaces.
- **Cleanup:** `kubectl delete ns feature-x` removes everything in it.

Namespaces are **not** a hard security boundary (same nodes, same kernel); for strong isolation use separate node groups or clusters. Some objects are cluster-wide: Nodes, PersistentVolumes, StorageClasses, ClusterRoles, Namespaces themselves.

Cross-namespace calls use the full name: `svc-name.other-ns.svc.cluster.local`.

**Example:**
```bash
kubectl create ns team-a
kubectl apply -n team-a -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata: {name: quota}
spec:
  hard: {requests.cpu: "4", requests.memory: 8Gi, pods: "30"}
EOF
kubectl get pods -n team-a
kubectl config set-context --current --namespace=team-a
```

:::say
Namespaces logically divide one cluster by team, app or environment, and they are the unit for RBAC, ResourceQuota, LimitRange and NetworkPolicy. They are not a hard security boundary, so for strict isolation I combine them with separate node groups or separate clusters.
:::

## Explain the Kubernetes Pod lifecycle.

<!-- source: 03 Q17 -->

:::note In simple words
A pod's life is like a flight: waiting at the gate (Pending), boarding checks (init containers), flying (Running), landing normally (Succeeded) or crashing (Failed). When it is time to land, the crew gets a warning (SIGTERM) and some time to finish before the doors are forced open (SIGKILL).
:::

**Pod phases** (`status.phase`):

| Phase | Meaning |
| --- | --- |
| Pending | Accepted, but not all containers are running yet: waiting for scheduling, image pull, volume attach |
| Running | Bound to a node, at least one container running (or starting/restarting) |
| Succeeded | All containers exited with 0 and will not restart (Jobs) |
| Failed | All containers stopped and at least one exited non-zero / was killed |
| Unknown | Node not reporting, state cannot be obtained |

Note: `CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled` are **container state reasons**, not phases. Container states are **Waiting**, **Running**, **Terminated**.

**Startup order:**

1. Scheduled to a node -> volumes mounted, images pulled.
2. **Init containers** run one by one, each must succeed (e.g. wait for DB, run migrations, fetch config).
3. App containers start; **postStart** hook runs; **startup probe**, then readiness/liveness probes.
4. Ready -> added to Service endpoints.

**Graceful termination:**

1. Pod marked Terminating and removed from endpoints (in parallel).
2. **preStop** hook runs (e.g. `sleep 10`).
3. **SIGTERM** sent to the container's main process (PID 1).
4. Kubernetes waits up to `terminationGracePeriodSeconds` (default **30s**, counting the preStop time).
5. Still running -> **SIGKILL** (exit code 137).

`restartPolicy`: Always (Deployments), OnFailure / Never (Jobs).

**Example:**
```
spec:
  terminationGracePeriodSeconds: 40
  initContainers:
  - name: wait-db
    image: busybox:1.36
    command: ["sh", "-c", "until nc -z postgres 5432; do sleep 2; done"]
  containers:
  - name: app
    image: myapp:1.0
    lifecycle:
      preStop: {exec: {command: ["sh", "-c", "sleep 10"]}}

kubectl get pod app-xyz -o jsonpath='{.status.phase}'
kubectl get pod app-xyz -o jsonpath='{.status.containerStatuses[0].state}'
```

:::say
A pod moves through Pending, Running, then Succeeded or Failed, with Unknown when the node stops reporting; init containers run to completion first, then app containers with hooks and probes. On deletion it is removed from endpoints, preStop runs, SIGTERM is sent, and after terminationGracePeriodSeconds, 30 by default, it gets SIGKILL, so apps must handle SIGTERM gracefully.
:::

## What is RBAC in Kubernetes, what is it used for, and how do you configure it?

<!-- source: 03 Q19 -->

:::note In simple words
RBAC is the building's access-card system. A Role says which doors exist on a card ("can open deployment and pod doors on floor prod"); a RoleBinding hands that card to a person or robot.
:::

RBAC (Role-Based Access Control) decides **who can do what on which resources**. Used for least privilege for developers, CI/CD, and applications.

Building blocks:

| Object | Scope | Purpose |
| --- | --- | --- |
| Role | Namespace | List of allowed verbs on resources in one namespace |
| ClusterRole | Cluster | Same, cluster-wide or for cluster-scoped resources (nodes, PVs); can be reused in namespaces |
| RoleBinding | Namespace | Gives a Role/ClusterRole to subjects inside one namespace |
| ClusterRoleBinding | Cluster | Gives a ClusterRole everywhere |
| Subjects | - | User, Group (from IAM/OIDC), ServiceAccount (for pods and CI) |

Verbs: get, list, watch, create, update, patch, delete. RBAC is **additive only** (no deny rules); anything not granted is denied.

Best practices: namespace-scoped Roles, groups instead of individual users, no wildcard `*`, avoid giving `secrets` list/get and `pods/exec` broadly, separate ServiceAccount per app, audit with `kubectl auth can-i`.

**Example:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: {name: dev-read-deploy, namespace: team-a}
rules:
- apiGroups: ["", "apps"]
  resources: ["pods", "pods/log", "deployments"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: {name: devs-read, namespace: team-a}
subjects:
- {kind: Group, name: team-a-devs, apiGroup: rbac.authorization.k8s.io}
roleRef: {kind: Role, name: dev-read-deploy, apiGroup: rbac.authorization.k8s.io}

kubectl auth can-i delete pods -n team-a --as-group=team-a-devs --as=test   # no
kubectl auth can-i --list --as=system:serviceaccount:team-a:api -n team-a
```

:::say
RBAC controls who can perform which verbs on which resources: Roles and ClusterRoles define permissions, and RoleBindings or ClusterRoleBindings grant them to users, groups or ServiceAccounts. I keep it least-privilege and namespace-scoped, map IAM or SSO groups to Kubernetes groups, and verify with kubectl auth can-i.
:::

## What does Kubernetes administration mean to you?

<!-- source: 03 Q20 -->

:::note In simple words
A Kubernetes admin is the building manager, not a tenant. Tenants (developers) run their shops; the manager keeps the lifts, power, security, water and fire exits working, plans for growth, and handles emergencies.
:::

It is owning the **platform** so application teams can deploy safely:

| Area | What it covers |
| --- | --- |
| Cluster lifecycle | Provisioning with IaC (Terraform/eksctl), version upgrades one minor at a time, version skew between control plane, kubelet and kubectl, deprecated APIs |
| Node management | Node groups / Karpenter, AMI updates, cordon/drain, taints and labels, capacity planning |
| Access & RBAC | SSO/IAM mapping (access entries), namespaced Roles, ServiceAccounts, IRSA/Pod Identity, least privilege |
| Networking | CNI (IPs, subnets), Ingress controllers, load balancers, CoreDNS, NetworkPolicies, TLS (cert-manager) |
| Storage | StorageClasses, CSI drivers (EBS/EFS), PVC expansion, reclaim policies, snapshots |
| Add-ons | CNI, CoreDNS, kube-proxy, metrics-server, CSI, autoscaler, External Secrets - kept on compatible versions |
| Security | Pod Security Admission, Gatekeeper/Kyverno policies, image scanning, secret encryption (KMS), audit logs |
| Observability | Prometheus/Grafana metrics, Loki/ELK logs, tracing, alerting with runbooks |
| Backup & DR | etcd snapshots (self-managed), Velero, GitOps rebuild, restore drills |
| Capacity & cost | Requests/limits, ResourceQuota/LimitRange, rightsizing, Spot, autoscaling |
| Incident response | On-call, troubleshooting nodes/pods/network, postmortems |

**Example:**
```bash
kubectl get nodes -o wide ; kubectl top nodes
kubectl get pods -A | grep -vE "Running|Completed"
kubectl version ; aws eks list-addons --cluster-name prod-eks
kubectl auth can-i --list --as=system:serviceaccount:prod:api -n prod
kubectl get resourcequota -A ; kubectl get pdb -A
velero backup get
```

:::say
To me Kubernetes administration means owning the platform end to end: cluster provisioning and upgrades, node management, RBAC and identity, networking, ingress and DNS, storage classes, add-ons, security policies, observability, backup and DR, capacity and cost, and incident response. The goal is that application teams can deploy self-service and safely without worrying about the cluster underneath.
:::

## Rapid-fire: Kubernetes concept checks (common trick questions)

<!-- source: 03 Q21 -->

:::note In simple words
These are short "gotcha" questions where the popular answer is slightly wrong. Knowing the precise answer shows real understanding.
:::

| Question | Correct answer | Why |
| --- | --- | --- |
| Two nodes, one has pods, one is empty. Where does a new pod go? | Usually the emptier node - it is not random | Scheduler first **filters** (enough requested CPU/memory, taints, affinity, ports), then **scores**; default scoring (LeastAllocated, BalancedAllocation, topology spread) favours less-allocated nodes. It uses **requests**, not actual usage |
| A container is OOMKilled. Is the container or the whole pod restarted? | Only that **container** is restarted (per `restartPolicy`, default Always) | The pod object, its IP and volumes stay; pod is only replaced if it is evicted (node memory pressure) or deleted |
| Can env vars / ConfigMap values update without recreating the pod? | Env vars: **no**, need a restart. ConfigMap mounted as a volume: **eventually** (kubelet sync, up to about a minute plus cache TTL), never for `subPath` mounts, and the app must re-read the file | Immutable ConfigMaps never change; common pattern is a checksum annotation or Reloader to trigger a rollout |
| Once a pod is created, is it stable? | **No**, pods are ephemeral | Node failure, eviction, preemption, drains and rollouts replace them - that is why controllers and Services exist |
| Does a ClusterIP Service load-balance TCP? | **Yes, per connection (L4)**, not per request | kube-proxy iptables picks a random endpoint, IPVS supports algorithms; long-lived connections (gRPC/HTTP2 keep-alive) stick to one pod - use L7 balancing or a service mesh |
| How do you collect app logs, and can they be lost? | App writes to **stdout/stderr**; a **DaemonSet agent** (Fluent Bit, Fluentd, Promtail/Alloy) ships them to Loki/ELK/CloudWatch. Prometheus is for **metrics, not logs** | Node-local logs are lost when the pod is deleted or the node dies; `kubectl logs` only keeps current and previous container, within rotation limits |
| Liveness probe passes - is the app fine? | **No**, it only proves what the probe checks (often just "process responds") | Dependencies and correctness can be broken; use readiness probes, SLO metrics and synthetic checks |
| How does the app scale with traffic? | **HPA** for pods + **Cluster Autoscaler/Karpenter** for nodes; **KEDA** for event-driven | HPA alone cannot help if no node has room |
| Is `kubectl exec -it pod -- bash` "logging into the pod"? | Not exactly: it starts a **new process inside one container's namespaces** via API server -> kubelet -> container runtime | Needs a shell in the image (distroless has none -> use `kubectl debug` ephemeral container); use `-c` to pick the container |
| A container keeps exiting and restarting. What do you do? | `kubectl logs --previous`, `kubectl describe` (Last State, exit code), events, probes, resources | Exit 137 = killed (OOM/SIGKILL), 1 = app error, 0 = main process finished (wrong command for a long-running pod) |

**Example:**
```bash
kubectl describe pod api-x | grep -A5 "Last State"
kubectl get pod api-x -o jsonpath='{.status.containerStatuses[0].restartCount}'
kubectl debug -it api-x --image=busybox:1.36 --target=api
```

:::say
These checks are about precision: the scheduler scores nodes by requests and usually picks the less-allocated one, an OOM kill restarts only the container, env vars need a restart while mounted ConfigMaps update eventually, ClusterIP balances per connection not per request, logs go through a DaemonSet shipper and not Prometheus, and a passing liveness probe does not prove the app is healthy.
:::
