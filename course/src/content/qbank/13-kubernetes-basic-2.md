---
track: qbank
title: "Kubernetes: Basic questions (part 2 of 2)"
short: Kubernetes basic 2
sub: 7 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Can we define multiple ports in a Kubernetes Deployment? How do you verify they are correctly defined and working?

<!-- source: 03 Q24 -->

:::note In simple words
One shop can have a front door for customers and a back door for deliveries. You just have to label each door clearly.
:::

Yes. A container can list multiple `containerPort`s, and a Service can expose multiple ports. When a Service has more than one port, **each port must have a name**.

Note: `containerPort` is mostly informational; the app must actually listen on that port. Verification means checking the app, not just the YAML.

**Example:**
```
containers:
- name: app
  image: myapp:1.0
  ports:
  - {name: http, containerPort: 8080}
  - {name: metrics, containerPort: 9090}
---
kind: Service
spec:
  selector: {app: myapp}
  ports:
  - {name: http, port: 80, targetPort: http}
  - {name: metrics, port: 9090, targetPort: metrics}
```
Verify:
```text
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].ports}'
kubectl describe svc myapp              # both ports + Endpoints for each
kubectl get endpoints myapp             # 10.0.1.5:8080,10.0.1.5:9090
kubectl exec <pod> -- ss -lntp          # is the app really listening on both?
kubectl port-forward pod/<pod> 8080 9090
curl localhost:8080/health ; curl localhost:9090/metrics
```

:::say
Yes, a container can declare multiple named ports and the Service must name each port when there is more than one. I verify with describe svc and get endpoints, then exec ss -lnt inside the pod and port-forward plus curl to prove the app actually listens on each port.
:::

## The team asks you to pass an extra startup parameter to an app deployed from a Docker image. Where do you define the startup command in Kubernetes?

<!-- source: 03 Q25 -->

:::note In simple words
The Docker image comes with a default "how to start" instruction. In Kubernetes you can overwrite it in the Pod spec without rebuilding the image.
:::

In the container spec:

- `command` overrides the image's **ENTRYPOINT**
- `args` overrides the image's **CMD**

To add a parameter while keeping the image's entrypoint, usually set only `args`. Changing `command`/`args` in a Deployment changes the Pod template, so a rolling update happens automatically.

| Dockerfile | Kubernetes field |
| --- | --- |
| ENTRYPOINT | command |
| CMD | args |

**Example:**
```
containers:
- name: api
  image: myapi:1.4
  command: ["java"]                              # optional: replaces ENTRYPOINT
  args: ["-Xmx512m", "-jar", "/app/api.jar", "--log-level=debug"]
  env:
  - name: EXTRA_OPTS
    value: "--feature-x=true"
```
```text
kubectl edit deploy api        # or change YAML/Helm values and apply
kubectl get pod <pod> -o jsonpath='{.spec.containers[0].args}'
```

:::say
I define it in the container spec: command overrides the Docker ENTRYPOINT and args overrides CMD. For an extra flag I usually add it to args, apply through Git or Helm, and the Deployment rolls out new pods automatically.
:::

## What is CoreDNS, and what role does it play in Kubernetes? How does DNS resolution work inside a pod?

<!-- source: 03 Q26 -->

*Also asked as:* How does DNS resolution work inside a pod, and what do you check when a service is not reachable by name?

:::note In simple words
CoreDNS is the cluster's phone directory. Apps ask "what is the number for payment-service?" and CoreDNS answers with the Service IP.
:::

CoreDNS is the cluster DNS server (runs as a Deployment in `kube-system`, exposed by the `kube-dns` Service with a fixed ClusterIP, e.g. `10.100.0.10` on EKS). Every Pod's `/etc/resolv.conf` points to it.

**Resolution inside a pod, step by step:**

1. kubelet writes the pod's `/etc/resolv.conf` (with the default `dnsPolicy: ClusterFirst`): `nameserver <kube-dns ClusterIP>`, `search <ns>.svc.cluster.local svc.cluster.local cluster.local` (+ VPC domain), `options ndots:5`.
2. The app looks up `payments`. Because the name has fewer than 5 dots, the resolver first tries each **search domain**: `payments.<ns>.svc.cluster.local` -> found if the Service is in the same namespace.
3. The query goes to the kube-dns ClusterIP; kube-proxy DNATs it to one CoreDNS pod.
4. CoreDNS's **kubernetes plugin** answers from its watch of Services/EndpointSlices (ClusterIP for normal Services, pod IPs for headless).
5. Names outside `cluster.local` go to the **forward plugin** -> upstream (node's `/etc/resolv.conf`, i.e. the VPC resolver on AWS).

**Corefile plugins you should know:** `kubernetes` (cluster records), `forward` (upstream), `cache` (caches answers, e.g. 30s), `loop` (detects forwarding loops and stops CoreDNS - common crash cause when the node resolv.conf points back to itself), `errors`, `health`/`ready` (probes), `prometheus` (metrics on :9153), `reload`, `loadbalance`.

It resolves:

- Services: `my-svc.my-namespace.svc.cluster.local` -> ClusterIP
- Headless Services / StatefulSet pods: `mongo-0.mongo.db.svc.cluster.local` -> pod IP
- External names: forwards to upstream DNS (VPC resolver on AWS)

Within the same namespace, a Pod can just call `http://my-svc`. Because of `ndots:5`, short external names cause several extra lookups; high DNS load is a common source of latency, fixed by scaling CoreDNS or using NodeLocal DNSCache.

If CoreDNS is down, service-to-service calls fail with "could not resolve host", even though Pods and Services are healthy.

**Example:**
```text
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl run dnstest --rm -it --image=busybox:1.36 -- nslookup my-svc.my-ns
kubectl exec <pod> -- cat /etc/resolv.conf
# nameserver 10.100.0.10
# search prod.svc.cluster.local svc.cluster.local cluster.local ap-south-1.compute.internal
# options ndots:5
kubectl get svc kube-dns -n kube-system
kubectl get cm coredns -n kube-system -o yaml
#   .:53 { errors; health; ready
#          kubernetes cluster.local in-addr.arpa ip6.arpa { pods insecure; fallthrough in-addr.arpa ip6.arpa }
#          prometheus :9153; forward . /etc/resolv.conf; cache 30; loop; reload; loadbalance }
kubectl logs -n kube-system -l k8s-app=kube-dns
```

When a service is not reachable by name, check: short name vs `svc.ns` vs FQDN, the pod's resolv.conf and dnsPolicy, CoreDNS pods/logs, whether the Service exists with endpoints, and NetworkPolicy allowing port 53 (see the scenario questions on cross-namespace discovery and cluster-wide DNS failures).

:::say
CoreDNS is the cluster DNS that turns Service names into ClusterIPs and forwards external names upstream. Inside a pod, resolv.conf points to the kube-dns ClusterIP with namespace search domains and ndots:5, CoreDNS's kubernetes plugin answers cluster names and the forward plugin sends the rest upstream, with cache and loop plugins in the Corefile. When names fail I check the FQDN, resolv.conf, CoreDNS pods and logs and a busybox nslookup test.
:::

## What is KEDA, and how does it help with event-driven autoscaling?

<!-- source: 03 Q28 -->

:::note In simple words
Normal HPA looks at how tired the workers are (CPU). KEDA looks at how many parcels are waiting at the door (queue length) and hires workers before they get tired - and can send everyone home when there are zero parcels.
:::

KEDA (Kubernetes Event-Driven Autoscaling) scales workloads based on **external event sources**: Kafka consumer lag, SQS queue depth, RabbitMQ, Redis lists, Prometheus queries, cron schedules and 60+ others.

How it works:

- You create a `ScaledObject` pointing at a Deployment and a trigger.
- KEDA acts as a **metrics adapter** and creates/manages an HPA under the hood.
- It can **scale to zero** when there are no events and back to 1 when events arrive (plain HPA minimum is 1).

Great for consumers/workers where CPU is a poor signal (a consumer can be idle on CPU while lag grows).

**Example:**
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata: {name: order-consumer}
spec:
  scaleTargetRef: {name: order-consumer}
  minReplicaCount: 0
  maxReplicaCount: 30
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka:9092
      consumerGroup: orders
      topic: orders
      lagThreshold: "100"      # ~1 pod per 100 messages of lag
```

:::say
KEDA extends HPA to scale on event sources such as Kafka lag, SQS depth or Prometheus queries, and it can scale to zero. I use it for queue consumers where CPU does not reflect backlog, and cap maxReplicaCount at the topic's partition count because extra consumers would sit idle.
:::

## How many nodes are there in your Kubernetes cluster? How do you decide?

<!-- source: 03 Q29 -->

:::note In simple words
There is no magic number - it is like asking how many buses a school needs. It depends on how many students, how big the buses are, and whether you keep a spare.
:::

Answer honestly with your numbers and the reasoning. A typical answer structure:

- **Control plane:** managed by AWS in EKS (we do not see those nodes); self-managed clusters use 3 control-plane nodes for etcd quorum.
- **Worker nodes:** spread across at least **3 AZs** so one AZ failure does not take down the app; minimum 2-3 per node group for HA.
- Separate **node groups** for different workloads (general apps, memory-heavy, isolated workloads) using taints/labels.
- Count is **not fixed** - Cluster Autoscaler/Karpenter scales between min and max.

Sizing logic: sum of Pod requests + ~20-30% headroom + DaemonSet overhead + the per-node Pod limit (on EKS the VPC CNI limits Pods per node by ENIs/IPs).

**Example:**
```bash
kubectl get nodes -L topology.kubernetes.io/zone,eks.amazonaws.com/nodegroup
# NAME                STATUS  ZONE         NODEGROUP
# ip-10-0-1-12...     Ready   ap-south-1a  app-ng
# ip-10-0-2-40...     Ready   ap-south-1b  app-ng
# ip-10-0-3-77...     Ready   ap-south-1c  pull-backend-ng
kubectl top nodes
```

:::say
Our EKS control plane is managed by AWS, and worker nodes run in managed node groups spread over three AZs, autoscaling roughly between a minimum and maximum rather than a fixed number. We size from total pod requests plus headroom, and keep separate node groups for workloads that need isolation.
:::

## How do you deploy an application in a Kubernetes (EKS) cluster? Explain the end-to-end flow.

<!-- source: 03 Q30 -->

:::note In simple words
Developer writes code -> a factory (CI) packs it into a box (image) -> the box goes to a warehouse (ECR) -> the delivery order (manifest/Helm) tells Kubernetes to use the new box -> Kubernetes swaps old boxes for new ones gradually.
:::

Typical flow:

1. Developer pushes code / merges PR to Git.
2. CI (Jenkins/GitHub Actions) runs tests, builds Docker image, scans it (Trivy), tags it with version/commit SHA.
3. Pushes image to **ECR**.
4. CD updates the image tag in Helm values or manifests:
- Push-based: Jenkins runs `helm upgrade` / `kubectl apply` using a kubeconfig/IAM role.
- GitOps: commit the new tag to a config repo; **Argo CD** syncs it to the cluster.
5. API server stores the new spec; Deployment creates a new ReplicaSet; rolling update starts.
6. Scheduler places Pods; kubelet pulls image from ECR (node IAM role permits it).
7. Readiness probe passes -> Pod added to Service endpoints -> Ingress/ALB sends traffic.
8. Verify: rollout status, dashboards, error rates; rollback if bad.

**Example:**
```bash
docker build -t 1234.dkr.ecr.ap-south-1.amazonaws.com/api:1.4.2 .
docker push 1234.dkr.ecr.ap-south-1.amazonaws.com/api:1.4.2
aws eks update-kubeconfig --name prod-eks --region ap-south-1
helm upgrade --install api ./charts/api -n prod --set image.tag=1.4.2 --atomic
kubectl rollout status deploy/api -n prod
```

:::say
CI builds, tests, scans and pushes a versioned image to ECR; CD updates the image tag in Helm values and either Jenkins runs helm upgrade or Argo CD syncs from Git. Kubernetes then performs a rolling update gated by readiness probes, and I verify with rollout status and metrics, rolling back with helm rollback if error rates rise.
:::

## When deploying to Kubernetes, do you only update Docker images, or also replicas, storage and CPU allocation?

<!-- source: 03 Q31 -->

:::note In simple words
Upgrading a shop is not just new stock (image). Sometimes you add staff (replicas), a bigger storeroom (storage) or more power (CPU/memory).
:::

All of them, but through the same Git/Helm process, and each behaves differently:

| Change | How | Effect |
| --- | --- | --- |
| Image tag | values.yaml `image.tag` | Rolling update |
| Replicas | `replicas` or better HPA min/max | No restart, just add/remove pods (do not hard-set replicas if HPA manages them) |
| CPU/memory requests/limits | `resources` | Rolling update (pods recreated); resize from real usage (VPA recommendations, Grafana) |
| Storage | PVC `spec.resources.requests.storage` | Can only **grow**, and only if StorageClass has `allowVolumeExpansion: true` |
| Config | ConfigMap/Secret | Needs pod restart unless mounted as files (use checksum annotation) |

**Example:**
```
# values-prod.yaml
image: {tag: "1.4.2"}
autoscaling: {minReplicas: 3, maxReplicas: 15}
resources:
  requests: {cpu: 250m, memory: 512Mi}
  limits: {memory: 1Gi}

kubectl patch pvc data-mongo-0 -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
```

:::say
Besides images, we tune replicas or HPA bounds, CPU and memory requests based on observed usage, and expand PVCs when storage grows. All changes go through Helm values in Git so they are reviewed and versioned, and I remember resource changes restart pods while PVCs can only be expanded, not shrunk.
:::
