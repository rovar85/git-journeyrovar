---
track: kubernetes
title: Jobs, DaemonSets, StatefulSets, Kustomize, Helm and running clusters
short: Beyond Deployments
sub: The rest of the toolbox, packaging, GitOps, and what operating a real cluster involves.
---

:::goals
- choose between Deployment, StatefulSet, DaemonSet, Job and CronJob
- run Jobs and CronJobs
- customise manifests with Kustomize; know what Helm does
- describe GitOps and day-2 operations: upgrades, backups, monitoring, autoscaling
:::

## Which controller for which workload

| Controller | Use for | Key properties |
|---|---|---|
| **Deployment** | stateless apps (web, APIs) | interchangeable replicas, rolling updates |
| **StatefulSet** | databases, clustered systems | stable names (`db-0`), ordered start, own volume per Pod |
| **DaemonSet** | one Pod **per node** (log agents, monitoring agents, CNI, storage drivers) | automatically follows nodes |
| **Job** | run to completion (migration, batch) | retries until success, then stops |
| **CronJob** | scheduled Jobs | cron syntax (see the Linux track) |

```setup
export LABNS=lab10
```

@setup k8s

## Jobs

A **Job** runs Pods until a set number **complete successfully**, retrying failures:

```run
cat > job.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata: {name: reindex}
spec:
  completions: 3
  parallelism: 2
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: worker
        image: busybox:1.37
        command: ["sh", "-c", "echo indexing batch on $(hostname | cut -c1-8); sleep 2; echo done"]
EOF
kubectl apply -f job.yaml
kubectl wait --for=condition=complete job/reindex --timeout=120s
kubectl get job reindex -o custom-columns=NAME:.metadata.name,SUCCEEDED:.status.succeeded,COMPLETIONS:.spec.completions
kubectl get pods -l job-name=reindex --no-headers -o custom-columns=PHASE:.status.phase | sort | uniq -c
```

Three Pods ran (two at a time) and finished with `Completed`. Compare with a Deployment, which would restart them forever. `restartPolicy` for Jobs must be `Never` or `OnFailure`.

## CronJob

A **CronJob** creates Jobs on a schedule. We do not wait for the clock; instead we trigger one manually, which is also a handy operations trick:

```run
cat > cron.yaml <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata: {name: nightly-backup}
spec:
  schedule: "30 2 * * *"            # 02:30 every night
  concurrencyPolicy: Forbid          # do not start a run while the last is still going
  successfulJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: busybox:1.37
            command: ["sh", "-c", "echo backup run; date +%Y > /dev/null"]
EOF
kubectl apply -f cron.yaml
kubectl get cronjob nightly-backup -o custom-columns=NAME:.metadata.name,SCHEDULE:.spec.schedule,SUSPEND:.spec.suspend
kubectl create job manual-backup --from=cronjob/nightly-backup
kubectl wait --for=condition=complete job/manual-backup --timeout=90s
kubectl logs job/manual-backup
```

## DaemonSet

```run
cat > ds.yaml <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata: {name: node-agent}
spec:
  selector:
    matchLabels: {app: node-agent}
  template:
    metadata:
      labels: {app: node-agent}
    spec:
      containers:
      - name: agent
        image: busybox:1.37
        command: ["sh", "-c", "echo agent on $NODE; sleep 3600"]
        env:
        - name: NODE
          valueFrom: {fieldRef: {fieldPath: spec.nodeName}}
EOF
kubectl apply -f ds.yaml > /dev/null
kubectl rollout status daemonset/node-agent --timeout=90s | tail -1
kubectl get daemonset node-agent -o custom-columns=NAME:.metadata.name,DESIRED:.status.desiredNumberScheduled,READY:.status.numberReady
kubectl logs -l app=node-agent
```

One Pod per node: this cluster has one node, so one Pod. Add a node and Kubernetes starts another automatically. Typical DaemonSets: log collectors (Fluent Bit), monitoring agents (node-exporter), networking plugins.

## StatefulSet

```run
cat > sts.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata: {name: db}
spec:
  clusterIP: None            # headless: gives each Pod its own DNS name
  selector: {app: db}
  ports: [{port: 5432}]
---
apiVersion: apps/v1
kind: StatefulSet
metadata: {name: db}
spec:
  serviceName: db
  replicas: 2
  selector:
    matchLabels: {app: db}
  template:
    metadata:
      labels: {app: db}
    spec:
      containers:
      - name: db
        image: busybox:1.37
        command: ["sh", "-c", "echo I am $(hostname); sleep 3600"]
EOF
kubectl apply -f sts.yaml > /dev/null
kubectl rollout status statefulset/db --timeout=120s | tail -1
kubectl get pods -l app=db -o custom-columns=NAME:.metadata.name --no-headers
kubectl delete pod db-0 --wait=true > /dev/null
kubectl rollout status statefulset/db --timeout=120s | tail -1
kubectl get pods -l app=db -o custom-columns=NAME:.metadata.name --no-headers
```

Pods are named `db-0` and `db-1` (not random), and `db-0` came back **with the same name** after deletion. With `volumeClaimTemplates` each also keeps its own persistent volume, and the headless Service gives `db-0.db` a stable DNS name. Ordered start-up and rolling updates (highest ordinal first) suit clusters where members have roles.

## Kustomize: customise without templates

**Kustomize** (built into `kubectl`) overlays patches on base YAML, so one base serves many environments:

```run
mkdir -p app/base app/overlays/prod
cat > app/base/deploy.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: web}
spec:
  replicas: 1
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
      - name: nginx
        image: nginx:1.27-alpine
EOF
printf 'resources:\n- deploy.yaml\n' > app/base/kustomization.yaml
cat > app/overlays/prod/kustomization.yaml <<'EOF'
resources:
- ../../base
namePrefix: prod-
replicas:
- name: web
  count: 3
images:
- name: nginx
  newTag: 1.28-alpine
labels:
- pairs:
    env: prod
  includeSelectors: true
EOF
kubectl kustomize app/overlays/prod | grep -E "name:|replicas:|image:|env:"
```

The overlay renamed the Deployment, set 3 replicas, changed the image tag and added a label, without touching the base. Apply it with `kubectl apply -k app/overlays/prod`.

```run
kubectl apply -k app/overlays/prod
kubectl rollout status deployment/prod-web --timeout=120s | tail -1
kubectl get deployment prod-web -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,IMAGE:.spec.template.spec.containers[0].image --no-headers
```

## Helm: package manager for Kubernetes

**Helm** packages related manifests as a **chart** with templates and a `values.yaml`, and installs them as a versioned **release**:

```term
$ helm repo add bitnami https://charts.bitnami.com/bitnami
$ helm install my-db bitnami/postgresql --set auth.postgresPassword=changeme
$ helm upgrade my-db bitnami/postgresql -f prod-values.yaml
$ helm list
$ helm rollback my-db 1
$ helm uninstall my-db
```

(**Example, not run here**: the Helm binary is not installed in this lab.) A chart's templates use Go templating (`{{ .Values.replicas }}`) similar to Terraform and Ansible templates. Helm gives releases, rollback, dependencies and a huge public chart ecosystem; Kustomize gives plain-YAML overlays; many teams use one or both.

## GitOps

**GitOps** makes Git the single source of truth for the cluster. A controller in the cluster (**Argo CD** or **Flux**) watches a repository and continuously applies it, fixing drift automatically:

1. Developers change YAML (or Helm values) in a pull request.
2. After review and merge, the controller notices and applies it.
3. A manual `kubectl edit` in the cluster is reverted by the controller.

You get review, audit history and trivial rollback (revert the commit). This is the Git, Terraform, Ansible and Kubernetes story coming together.

## Operating a real cluster (day 2)

| Topic | What to know |
|---|---|
| **Upgrades** | managed services upgrade the control plane for you; nodes upgrade by **cordon** (stop new Pods), **drain** (evict gracefully, respecting PodDisruptionBudgets), upgrade, uncordon. One minor version at a time |
| **Backups** | snapshot **etcd** and back up volumes; Velero for objects and PVs |
| **Monitoring** | Prometheus + Grafana, metrics-server for `kubectl top` and HPA, kube-state-metrics (see the Monitoring track) |
| **Logging** | node agents ship container logs to a central store (Loki, Elasticsearch) |
| **Autoscaling** | HPA (Pods), Vertical Pod Autoscaler, Cluster Autoscaler / Karpenter (nodes) |
| **Cost** | right-size requests, spot/preemptible nodes, namespace quotas |
| **Access** | OIDC login, RBAC per team, audit logs |

```run
kubectl drain --help | head -2
kubectl cordon lab-node
kubectl get node lab-node -o custom-columns=NAME:.metadata.name,SCHEDULABLE:.spec.unschedulable --no-headers
kubectl uncordon lab-node
```

Cordon marks the node unschedulable (existing Pods stay); `drain` also evicts them so they restart elsewhere, which is how maintenance is done without outages.

## Where to go next

- **CKAD** (developer) and **CKA** (administrator) certifications are hands-on exams; everything in this track is in them. Practise `kubectl` speed: `kubectl run`, `create ... --dry-run=client -o yaml`, `explain`.
- Learn a managed service (**EKS**, **AKS**, **GKE**), a service mesh (**Istio**, **Linkerd**), and **Prometheus**.
- Build the Capstone: Terraform creates infrastructure, Ansible configures it, Jenkins builds and deploys, Kubernetes runs it.

```run
kubectl delete namespace lab10 --wait=false > /dev/null
```

:::recap
- Pick the controller by workload: Deployment, StatefulSet, DaemonSet, Job, CronJob.
- Kustomize overlays plain YAML; Helm packages charts with templates and releases.
- GitOps (Argo CD, Flux) keeps the cluster matching Git.
- Day 2: upgrades by cordon/drain, etcd backups, monitoring, autoscaling, access control.
:::

:::try Your turn
Generate a Deployment YAML without creating it: `kubectl create deployment x --image=nginx:1.27-alpine --dry-run=client -o yaml`. Save it, add a Kustomize overlay that changes the replica count, and render it.
:::

:::quiz
? Which controller runs exactly one Pod on every node?
- Deployment
- StatefulSet
+ DaemonSet
- Job
! Think of log and monitoring agents.
? What does `kubectl drain` do?
+ Evicts Pods from a node so it can be maintained
- Deletes the node
- Clears etcd
- Scales to zero
! Pods reappear on other nodes if they are managed by controllers.
? What is the point of GitOps?
+ Git is the source of truth and a controller keeps the cluster in sync with it
- Faster images
- Free clusters
- No YAML
! It adds review, history and automatic drift correction.
:::
