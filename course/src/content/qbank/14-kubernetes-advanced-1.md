---
track: qbank
title: "Kubernetes: Advanced questions (part 1 of 3)"
short: Kubernetes advanced 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## What are master (control-plane) and worker nodes, and how do you create and manage Kubernetes clusters (eksctl / Terraform)?

<!-- source: 03 Q32 -->

*Also asked as:* How do you create an EKS cluster using Terraform, and how do the Kubernetes core components come into play?

:::note In simple words
The master is the head office that makes decisions; worker nodes are the factories that do the actual work. On EKS, AWS runs the head office for you - you only build and manage the factories.
:::

- **Master / control-plane nodes:** run API server, etcd, scheduler, controller manager. They decide and store state; normally no app Pods run there.
- **Worker nodes:** run kubelet, kube-proxy, container runtime, CNI - and your application Pods.

On **EKS** the control plane is fully managed (multi-AZ, AWS patches it, you pay per cluster-hour). You manage worker capacity as **managed node groups**, self-managed groups, **Fargate** profiles or **Karpenter**-provisioned nodes.

Ways to create a cluster:

- **eksctl:** quickest; one YAML/command, good for labs.
- **Terraform** (production): usually the `terraform-aws-modules/eks` module - VPC + subnets, IAM roles (cluster role, node role), the EKS cluster, node groups, add-ons (vpc-cni, coredns, kube-proxy, ebs-csi), access entries. State in S3 with locking, reviewed via `plan` in CI.

What happens when Terraform creates EKS: AWS brings up the API server and etcd in its own account, exposes an API endpoint, and injects ENIs in your subnets; when node groups join, their kubelets register with the API server; add-ons deploy CoreDNS and kube-proxy as Pods.

Day-2 management: version upgrades, add-on upgrades, node AMI rotation, access (RBAC/access entries), autoscaling, monitoring.

**Example:**
```
eksctl create cluster --name demo --region ap-south-1 \
  --nodegroup-name ng1 --node-type t3.medium --nodes 2 --nodes-min 2 --nodes-max 4

module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "~> 20.0"
  cluster_name    = "prod-eks"
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  eks_managed_node_groups = {
    app = { instance_types = ["m6i.large"], min_size = 3, max_size = 10, desired_size = 3 }
  }
}

aws eks update-kubeconfig --name prod-eks --region ap-south-1
kubectl get nodes
```

:::say
The control plane runs the API server, etcd, scheduler and controllers, and worker nodes run kubelet, kube-proxy and the app pods. On EKS AWS manages the control plane; I create the cluster, VPC, IAM roles, node groups and add-ons with Terraform modules, use eksctl for quick labs, and handle upgrades and node rotation as day-2 operations.
:::

## Explain Amazon EKS architecture. What subnets are used in EKS?

<!-- source: 03 Q33 -->

*Also asked as:* What is a subnet and which types of subnets are used in Kubernetes/EKS?

:::note In simple words
A subnet is a street inside your private city (VPC). Public streets face the highway (internet); private streets are behind a gate. You put the front desk (load balancer) on the public street and the workers (nodes/pods) on private streets.
:::

A **subnet** is a range of IPs inside a VPC, tied to one AZ. **Public subnet** = route table has a route to an Internet Gateway. **Private subnet** = no direct internet route; outbound via NAT Gateway or VPC endpoints.

EKS architecture:

- **Control plane** in an AWS-managed VPC, spread over 3 AZs; exposes a public and/or private API endpoint.
- **Cross-account ENIs** placed in your subnets so the control plane can talk to kubelets.
- **Worker nodes** in **private subnets** across 2-3 AZs.
- **VPC CNI:** every Pod gets a **real VPC IP** from the subnet (so subnets must be sized big, e.g. /19; or use prefix delegation / custom networking).
- **Public subnets** hold internet-facing ALB/NLB and NAT Gateways. Tag them `kubernetes.io/role/elb=1`; private ones `kubernetes.io/role/internal-elb=1` so the Load Balancer Controller finds them.
- IAM: cluster role, node role (ECR pull, CNI), IRSA/Pod Identity for apps.
- Add-ons: vpc-cni, CoreDNS, kube-proxy, EBS CSI driver, AWS Load Balancer Controller.

**Example:**
```
VPC 10.0.0.0/16
  public-a 10.0.0.0/24   -> ALB, NAT GW
  public-b 10.0.1.0/24   -> ALB, NAT GW
  private-a 10.0.32.0/19 -> nodes + pod IPs
  private-b 10.0.64.0/19 -> nodes + pod IPs
  private-c 10.0.96.0/19 -> nodes + pod IPs

aws eks describe-cluster --name prod-eks \
  --query 'cluster.resourcesVpcConfig.{subnets:subnetIds,public:endpointPublicAccess}'
```

:::say
EKS runs a managed multi-AZ control plane and connects to our VPC with ENIs; worker nodes live in private subnets across at least two AZs, while public subnets host internet-facing load balancers and NAT gateways. Because the VPC CNI gives every pod a VPC IP, I size private subnets generously and tag subnets so the load balancer controller can discover them.
:::

## How does authentication work in EKS, and how do pods get AWS permissions and secrets securely?

<!-- source: 03 Q34 -->

*Also asked as:* How do you store secrets securely in EKS?

:::note In simple words
To enter the building (cluster), you show your AWS ID card; a guest list (access entries / aws-auth) says which room you can enter (RBAC). Pods get their own temporary badges (IRSA / Pod Identity) instead of sharing a master key.
:::

**Humans and CI -> cluster:**

1. `kubectl` calls `aws eks get-token` (built into kubeconfig; older setups used `aws-iam-authenticator`) which creates a signed, short-lived token from your IAM identity.
2. EKS verifies the IAM identity (authentication).
3. It maps the IAM user/role to a Kubernetes user/group via:
- the legacy **aws-auth ConfigMap** in kube-system (easy to break, one typo can lock everyone out), or
- the newer **EKS access entries** (API-managed, with access policies like AmazonEKSClusterAdminPolicy) - preferred.
4. Kubernetes **RBAC** decides what that user/group can do (authorization).

**Pods -> AWS services:**

- **IRSA** (IAM Roles for Service Accounts): OIDC provider + annotate ServiceAccount with a role ARN; pod gets temporary credentials.
- **EKS Pod Identity:** newer, simpler (agent add-on + association, no OIDC setup per cluster).
- Never put AWS access keys in Secrets or images; avoid relying on the node role for apps.

**Secrets:** enable **KMS envelope encryption** for Secrets, restrict `get secrets` via RBAC, and keep the source of truth in **AWS Secrets Manager / SSM Parameter Store**, synced by **External Secrets Operator** or the Secrets Store CSI driver using IRSA.

**Example:**
```bash
aws eks create-access-entry --cluster-name prod-eks \
  --principal-arn arn:aws:iam::111122223333:role/DevOpsRole
aws eks associate-access-policy --cluster-name prod-eks \
  --principal-arn arn:aws:iam::111122223333:role/DevOpsRole \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster

apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::111122223333:role/orders-s3-read
```

:::say
kubectl authenticates with a short-lived token from aws eks get-token, EKS maps the IAM principal to Kubernetes identities through access entries or the older aws-auth ConfigMap, and RBAC authorizes actions. Pods get AWS permissions through IRSA or EKS Pod Identity rather than static keys, and secrets stay in Secrets Manager synced by External Secrets with KMS encryption enabled on the cluster.
:::

## How do Jenkins and a Kubernetes cluster communicate with each other?

<!-- source: 03 Q35 -->

*Also asked as:* How does Jenkins deploy to Kubernetes, and how do you run Jenkins agents on Kubernetes?

:::note In simple words
Jenkins needs a visitor pass to the cluster. You give it a limited pass (a service account or an IAM role) that only opens the doors it needs, instead of the admin master key.
:::

Two directions:

1. **Jenkins deploys to Kubernetes:**
- Jenkins agent has `kubectl`/`helm` and a **kubeconfig**.
- On EKS: Jenkins runs with an **IAM role** (EC2 instance profile or IRSA if Jenkins is in-cluster); `aws eks update-kubeconfig` generates the kubeconfig, and the role is mapped via access entry to a namespaced RBAC role.
- Non-EKS: a Kubernetes **ServiceAccount** with a Role/RoleBinding limited to the target namespace; its token/kubeconfig stored in **Jenkins Credentials** (never in the Jenkinsfile).
2. **Kubernetes runs Jenkins agents:** the **Kubernetes plugin** creates an ephemeral agent Pod per build and deletes it after, so agents scale on demand.

Alternative (GitOps): Jenkins does not touch the cluster at all - it only pushes a new image tag to Git and **Argo CD** (inside the cluster) pulls the change. This removes cluster credentials from CI.

**Example:**
```groovy
stage('Deploy') {
  steps {
    withCredentials([file(credentialsId: 'kubeconfig-prod', variable: 'KUBECONFIG')]) {
      sh 'helm upgrade --install api charts/api -n prod --set image.tag=${GIT_COMMIT}'
    }
  }
}

# RBAC for the deployer SA (namespace-scoped)
kubectl create role deployer -n prod --verb=get,list,watch,create,update,patch \
  --resource=deployments,services,configmaps
kubectl create rolebinding jenkins-deployer -n prod --role=deployer \
  --serviceaccount=cicd:jenkins
```

:::say
Jenkins talks to the cluster API with a kubeconfig backed by either an IAM role mapped through EKS access entries or a namespace-scoped ServiceAccount stored in Jenkins credentials, never an admin kubeconfig. The Kubernetes plugin lets Jenkins run ephemeral agent pods, and in GitOps setups Jenkins just updates Git and Argo CD applies the change from inside the cluster.
:::

## You have Docker images for a frontend, a backend and a database. How do you deploy them on Kubernetes with YAML?

<!-- source: 03 Q36 -->

:::note In simple words
Three tenants move into the building: the frontend gets the ground-floor shop with a public door (Ingress), the backend gets an internal office (ClusterIP), and the database gets a vault with its own locked storage (StatefulSet + PVC).
:::

Plan:

- **Namespace** `shop`.
- **Secret** for DB password, **ConfigMap** for non-secret settings (DB host, API URL).
- **Database:** StatefulSet + headless Service + `volumeClaimTemplates` (PVC). In production on AWS, a managed DB (RDS) is often better.
- **Backend:** Deployment (replicas 2+, probes, resources) + ClusterIP Service; reads DB host from ConfigMap, password from Secret.
- **Frontend:** Deployment + ClusterIP Service.
- **Ingress:** `/` -> frontend, `/api` -> backend, TLS.

**Example:**
```yaml
apiVersion: v1
kind: Secret
metadata: {name: db-secret, namespace: shop}
type: Opaque
stringData: {POSTGRES_PASSWORD: "change-me"}
---
apiVersion: v1
kind: ConfigMap
metadata: {name: app-config, namespace: shop}
data: {DB_HOST: "postgres.shop.svc.cluster.local", DB_NAME: "shop"}
---
apiVersion: v1
kind: Service
metadata: {name: postgres, namespace: shop}
spec: {clusterIP: None, selector: {app: postgres}, ports: [{port: 5432}]}
---
apiVersion: apps/v1
kind: StatefulSet
metadata: {name: postgres, namespace: shop}
spec:
  serviceName: postgres
  replicas: 1
  selector: {matchLabels: {app: postgres}}
  template:
    metadata: {labels: {app: postgres}}
    spec:
      containers:
      - name: postgres
        image: postgres:16
        envFrom: [{secretRef: {name: db-secret}}]
        ports: [{containerPort: 5432}]
        volumeMounts: [{name: data, mountPath: /var/lib/postgresql/data}]
  volumeClaimTemplates:
  - metadata: {name: data}
    spec: {accessModes: [ReadWriteOnce], resources: {requests: {storage: 10Gi}}}
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: backend, namespace: shop}
spec:
  replicas: 2
  selector: {matchLabels: {app: backend}}
  template:
    metadata: {labels: {app: backend}}
    spec:
      containers:
      - name: backend
        image: 1234.dkr.ecr.ap-south-1.amazonaws.com/backend:1.0.0
        ports: [{containerPort: 8080}]
        envFrom: [{configMapRef: {name: app-config}}]
        env:
        - name: DB_PASSWORD
          valueFrom: {secretKeyRef: {name: db-secret, key: POSTGRES_PASSWORD}}
        readinessProbe: {httpGet: {path: /health, port: 8080}}
        resources: {requests: {cpu: 200m, memory: 256Mi}, limits: {memory: 512Mi}}
---
apiVersion: v1
kind: Service
metadata: {name: backend, namespace: shop}
spec: {selector: {app: backend}, ports: [{port: 80, targetPort: 8080}]}
---
# frontend Deployment + Service: same pattern, image frontend:1.0.0, port 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: {name: shop, namespace: shop}
spec:
  ingressClassName: nginx
  rules:
  - host: shop.example.com
    http:
      paths:
      - {path: /api, pathType: Prefix, backend: {service: {name: backend, port: {number: 80}}}}
      - {path: /, pathType: Prefix, backend: {service: {name: frontend, port: {number: 80}}}}
```

:::say
I put the database in a StatefulSet with a headless Service and a PVC, the backend and frontend in Deployments with ClusterIP Services, and inject config from a ConfigMap and the password from a Secret. An Ingress routes slash to the frontend and slash-api to the backend with TLS, and in real AWS production I would usually move the database to RDS.
:::

## You have 6 Pods and 3 Nodes. How do you ensure exactly 2 Pods run on each Node?

<!-- source: 03 Q37 -->

:::note In simple words
You want 6 guests at 3 tables with exactly 2 per table. You set a rule: "no table may have more than 1 guest more than any other table".
:::

Best option: **topologySpreadConstraints** with `maxSkew: 1` across `kubernetes.io/hostname` and `whenUnsatisfiable: DoNotSchedule`. With 6 replicas and 3 nodes, skew 1 forces a 2-2-2 layout.

Other tools:

- **Pod anti-affinity** only gives "at most 1 per node" (required) or "prefer spreading" (preferred) - it cannot say "exactly 2".
- **DaemonSet** gives exactly 1 per node, not 2.
- Resource sizing hack (requests so only 2 fit per node) works but is fragile.

Caveats: the scheduler only enforces this at **scheduling time**; later imbalance (after a node failure and recovery) is not fixed automatically - use the **descheduler** to rebalance. Also add `nodeSelector`/taints if only those 3 nodes should be used.

**Example:**
```
spec:
  replicas: 6
  template:
    metadata: {labels: {app: web}}
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: DoNotSchedule
        labelSelector: {matchLabels: {app: web}}

kubectl get pods -l app=web -o wide --no-headers | awk '{print $7}' | sort | uniq -c
#   2 node-a
#   2 node-b
#   2 node-c
```

:::say
I use topologySpreadConstraints with maxSkew 1 on the hostname topology key and DoNotSchedule, which forces a 2-2-2 split for 6 replicas on 3 nodes. Anti-affinity cannot express exactly two per node, and because spreading is only enforced at scheduling time I would add the descheduler to rebalance after node failures.
:::

## How would you ensure even Pod distribution across Nodes and Availability Zones?

<!-- source: 03 Q38 -->

*Also asked as:* How do you use multi-zone pod affinity/anti-affinity so a node or zone failure does not impact regional SLAs?

:::note In simple words
Do not keep all your eggs in one basket, and do not keep all your baskets in one room. Spread pods across nodes, and nodes across zones.
:::

Layered approach:

1. **Nodes in 3 AZs** (node groups spanning subnets in each AZ).
2. **Zone spread:** `topologySpreadConstraints` on `topology.kubernetes.io/zone` with `maxSkew: 1`, `DoNotSchedule` for critical services.
3. **Node spread:** a second constraint on `kubernetes.io/hostname` with `ScheduleAnyway` (soft) so it does not block scaling.
4. **Pod anti-affinity** (required) for replicas that must never share a node (e.g. 3 Kafka brokers, DB replicas).
5. **Pod affinity** to co-locate chatty pairs (app + its cache) in the same zone to cut latency and cross-AZ data cost.
6. **PodDisruptionBudget** so drains/upgrades never take down more than 1 replica.
7. Capacity: enough headroom in each zone to absorb one zone's pods (N+1 zones).

Watch-outs: PVCs on EBS are zone-bound - a StatefulSet pod can only restart in its volume's AZ; use `WaitForFirstConsumer` StorageClass. Cluster Autoscaler node groups should be one per AZ (or use Karpenter) so scale-up happens in the right zone.

**Example:**
```bash
topologySpreadConstraints:
- maxSkew: 1
  topologyKey: topology.kubernetes.io/zone
  whenUnsatisfiable: DoNotSchedule
  labelSelector: {matchLabels: {app: stream-edge}}
- maxSkew: 1
  topologyKey: kubernetes.io/hostname
  whenUnsatisfiable: ScheduleAnyway
  labelSelector: {matchLabels: {app: stream-edge}}
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector: {matchLabels: {app: kafka}}
      topologyKey: kubernetes.io/hostname
```

:::say
I spread replicas across zones with a hard topology spread constraint and across nodes with a soft one, use required anti-affinity for replicas that must never share a node, and add PodDisruptionBudgets. I also keep enough per-zone headroom, remember EBS volumes are zone-bound, and configure autoscaling per zone so a zone loss is absorbed without breaking SLAs.
:::

## How do you optimize resource requests and limits in a production cluster?

<!-- source: 03 Q39 -->

:::note In simple words
Requests are the seats you reserve on a train; limits are the maximum luggage allowed. Reserve too many seats and the train runs half empty (waste); reserve too few and people get kicked off (evictions, throttling).
:::

- **Request** = guaranteed amount; used by the **scheduler** to place Pods and by HPA for utilization %.
- **Limit** = hard cap. CPU over limit -> **throttled** (slow). Memory over limit -> **OOMKilled**.

Approach:

1. **Measure** real usage for 1-2 weeks (Prometheus/Grafana: `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, p95/p99).
2. **Set requests near p90-p95** of normal usage; memory **limit = request or a bit above** (memory cannot be throttled, only killed).
3. **CPU limits:** often omit or set generous, because CPU limits cause throttling latency even when the node is idle; keep requests accurate instead.
4. Use **VPA in recommendation mode** or Goldilocks/Kubecost for suggestions.
5. **QoS classes:** Guaranteed (request = limit) for critical pods -> last to be evicted; BestEffort (no requests) -> first to be evicted. Never run prod pods as BestEffort.
6. Enforce defaults with **LimitRange** and caps with **ResourceQuota** per namespace.
7. Check node packing (`kubectl describe node` allocated %) and rightsize node types; cluster autoscaler removes underused nodes.

**Example:**
```
resources:
  requests: {cpu: 300m, memory: 512Mi}
  limits:   {memory: 768Mi}        # no CPU limit to avoid throttling

# PromQL: CPU throttling ratio
sum(rate(container_cpu_cfs_throttled_periods_total{pod=~"api.*"}[5m]))
 / sum(rate(container_cpu_cfs_periods_total{pod=~"api.*"}[5m]))

kubectl top pods -n prod --sort-by=memory
kubectl describe node <node> | grep -A5 "Allocated resources"
```

:::say
I base requests on observed p90 to p95 usage from Prometheus, set memory limits close to requests, and avoid tight CPU limits because they cause throttling. I use VPA recommendations, QoS Guaranteed for critical pods, LimitRange defaults and ResourceQuotas, and review node allocation so autoscaling can remove wasted capacity.
:::

## How do you implement auto-scaling when traffic fluctuates heavily? How do you automate node scaling in EKS?

<!-- source: 03 Q40 -->

*Also asked as:* How do you design auto-scaling for very large concurrent traffic without over-provisioning? How do you automate ECS/EKS node scaling?

:::note In simple words
Two levels of hiring: HPA hires more workers (pods) quickly; Cluster Autoscaler/Karpenter builds more rooms (nodes) when workers have no place to sit. For a known big event, you hire in advance.
:::

1. **Pod level - HPA / KEDA:**
- Scale on the metric that leads load: requests per second or concurrent sessions (via Prometheus Adapter/KEDA), not just CPU.
- Tune `behavior`: fast scale-up (e.g. +100% every 15s), slow scale-down (stabilization 5-10 min) to avoid flapping.
2. **Node level:**
- **Cluster Autoscaler:** adds nodes to ASGs when Pods are Pending; removes underused nodes.
- **Karpenter** (preferred on EKS): watches Pending pods and launches right-sized instances directly in seconds, supports mixed instance types and Spot, consolidates empty nodes.
3. **Kill cold start:**
- **Overprovisioning pods:** low-priority "pause" pods reserve spare capacity; real pods preempt them instantly while new nodes come up.
- Pre-scale before known events (scheduled scaling / raise `minReplicas` via CronJob or KEDA cron trigger).
- Small, pre-pulled images; fast startup probes.
4. **Protect:** PDBs, requests set correctly, max limits to avoid runaway cost, Spot for stateless + On-Demand base.

**Example:**
```
behavior:
  scaleUp:
    stabilizationWindowSeconds: 0
    policies: [{type: Percent, value: 100, periodSeconds: 15}]
  scaleDown:
    stabilizationWindowSeconds: 600
    policies: [{type: Percent, value: 10, periodSeconds: 60}]

apiVersion: karpenter.sh/v1
kind: NodePool
metadata: {name: default}
spec:
  template:
    spec:
      requirements:
      - {key: karpenter.sh/capacity-type, operator: In, values: [spot, on-demand]}
      nodeClassRef: {group: karpenter.k8s.aws, kind: EC2NodeClass, name: default}
  limits: {cpu: "1000"}
  disruption: {consolidationPolicy: WhenEmptyOrUnderutilized}
```

:::say
I scale pods with HPA or KEDA on leading metrics like requests per second, with fast scale-up and slow scale-down, and scale nodes with Karpenter or Cluster Autoscaler. To avoid cold starts I keep low-priority overprovisioning pods as buffer and pre-scale before known events, with PDBs and max limits to protect availability and cost.
:::

## How would you monitor HPA scaling decisions in real time and detect if metrics-server is lagging?

<!-- source: 03 Q41 -->

:::note In simple words
HPA is a driver looking at the speedometer (metrics). If the speedometer is stuck, the driver makes wrong decisions. You watch both the driver's actions and whether the speedometer is fresh.
:::

Watch HPA decisions:

- `kubectl get hpa -w` and `kubectl describe hpa` (Conditions: `AbleToScale`, `ScalingActive`, `ScalingLimited`, plus events "New size: 8; reason: cpu above target").
- **kube-state-metrics** exposes `kube_horizontalpodautoscaler_status_current_replicas`, `..._desired_replicas`, `..._spec_max_replicas`. Graph current vs desired vs max in Grafana; alert when desired == max for 10 min (capped) or desired != current for too long.

Detect metrics-server lag / failure:

- `kubectl top pods` failing or old; `kubectl get apiservice v1beta1.metrics.k8s.io` shows `False (FailedDiscoveryCheck)`.
- HPA shows `<unknown>/70%` targets and `FailedGetResourceMetric` events.
- metrics-server logs (kubelet scrape errors, TLS issues), its own CPU/memory throttling; scrape interval (`--metric-resolution`, default 15s).
- Compare HPA-seen value with Prometheus-seen value; alert on staleness, e.g. `time() - timestamp(...)`.
- For custom metrics: check Prometheus Adapter / KEDA operator logs and `kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1`.

**Example:**
```bash
kubectl describe hpa api -n prod | sed -n '/Conditions/,$p'
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl get --raw "/apis/metrics.k8s.io/v1beta1/namespaces/prod/pods" | head -c 400
kubectl logs -n kube-system deploy/metrics-server

# Alert: HPA stuck at max
kube_horizontalpodautoscaler_status_current_replicas
  >= kube_horizontalpodautoscaler_spec_max_replicas
```

:::say
I track HPA current, desired and max replicas from kube-state-metrics in Grafana with alerts when it is pinned at max, and read describe hpa conditions and events for the reason behind each decision. For metrics-server health I check the metrics APIService status, unknown targets on the HPA, metrics-server logs and compare values against Prometheus to spot stale data.
:::

## What are the differences between GKE Ingress and the NGINX Ingress Controller?

<!-- source: 03 Q42 -->

:::note In simple words
GKE Ingress hires Google's own reception at the city gate (Google Cloud Load Balancer). NGINX Ingress puts your own receptionist inside your building (pods), behind a simple door.
:::

| | GKE Ingress (gce class) | NGINX Ingress Controller |
| --- | --- | --- |
| Who routes | Google Cloud HTTP(S) Load Balancer (global, outside cluster) | NGINX pods inside the cluster |
| LB created | External/internal Application LB per Ingress | One L4 LoadBalancer Service in front of NGINX pods |
| Features | Cloud Armor (WAF), Cloud CDN, IAP, Google-managed certs, global anycast IP | Rewrites, regex paths, rate limiting, auth, canary annotations, custom snippets |
| Backend | Container-native via NEGs (straight to pods) | kube-proxy/Service to pods |
| Portability | GCP only | Any cloud/on-prem |
| Config change speed | Slower (LB provisioning minutes) | Near instant |
| Cost | Per forwarding rule/LB | Nodes running NGINX + one L4 LB |

Choose GKE Ingress for global reach, Cloud Armor/CDN integration and fully managed operation; NGINX for advanced HTTP features, portability and many Ingresses sharing one LB. The same comparison applies on AWS: AWS Load Balancer Controller (ALB) vs ingress-nginx.

**Example:**
```
metadata:
  annotations:
    kubernetes.io/ingress.class: "gce"            # GKE external LB
    # or with spec.ingressClassName: nginx and:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/limit-rps: "20"
```

:::say
GKE Ingress provisions a Google Cloud load balancer outside the cluster with native Cloud Armor, CDN and managed certificates, while NGINX Ingress runs as pods inside the cluster behind a single L4 load balancer and offers richer HTTP features and portability. I pick GKE Ingress for global, managed edge security and NGINX when I need rewrites, rate limits or cloud-neutral config.
:::

## How do you enforce rules in Kubernetes to control which pods can talk to each other?

<!-- source: 03 Q43 -->

:::note In simple words
By default every room in the building has open doors. NetworkPolicies are door locks: "only the backend may enter the database room".
:::

Use **NetworkPolicy**. By default all pods can talk to all pods. A NetworkPolicy selects pods (by label) and allows only listed ingress/egress traffic; once a pod is selected by any policy, anything not allowed is denied.

Steps:

1. Make sure the **CNI enforces** NetworkPolicy (Calico, Cilium, EKS VPC CNI with network policy enabled, GKE Dataplane V2). With a CNI that does not enforce it, policies silently do nothing.
2. Apply **default deny** per namespace.
3. Allow specific flows (frontend -> backend:8080, backend -> db:5432).
4. Allow **DNS egress** to kube-dns (UDP/TCP 53) or everything breaks.
5. Test with a temporary pod (`curl`, `nc`).

For L7 rules (HTTP methods/paths) or mTLS identity, use Cilium policies or a service mesh (Istio AuthorizationPolicy).

**Example:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny, namespace: shop}
spec: {podSelector: {}, policyTypes: [Ingress, Egress]}
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: db-allow-backend, namespace: shop}
spec:
  podSelector: {matchLabels: {app: postgres}}
  policyTypes: [Ingress]
  ingress:
  - from: [{podSelector: {matchLabels: {app: backend}}}]
    ports: [{protocol: TCP, port: 5432}]
---
# allow DNS for all pods
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to: [{namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}}]
    ports: [{protocol: UDP, port: 53}, {protocol: TCP, port: 53}]
```

:::say
I use NetworkPolicies on a CNI that enforces them, start with a default-deny per namespace, then explicitly allow required flows such as backend to database on 5432 and DNS egress to kube-dns. For layer 7 rules or identity-based control I add Cilium policies or an Istio AuthorizationPolicy with mTLS.
:::
