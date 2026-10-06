---
track: kubernetes
title: Deployments, ReplicaSets and rolling updates
short: Deployments
sub: Keep N copies running, heal automatically, update without downtime and roll back.
---

:::goals
- explain Deployment, ReplicaSet and Pod and how they relate
- scale and watch self-healing
- do a rolling update and a rollback
- read what happens when an update goes wrong
:::

## Three layers

| Object | Role |
|---|---|
| **Pod** | the running containers |
| **ReplicaSet** | keeps exactly N identical Pods running (replaces any that die) |
| **Deployment** | manages ReplicaSets to give you rolling updates and rollbacks |

You create a **Deployment**; it creates a ReplicaSet; that creates Pods. Each Pod name shows the chain: `web-<replicaset-hash>-<random>`.

```setup
export LABNS=lab3
```

@setup k8s

## Your first Deployment

```run
cat > deploy.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.27-alpine
        ports:
        - containerPort: 80
EOF
kubectl apply -f deploy.yaml
kubectl rollout status deployment/web --timeout=90s | tail -1
kubectl get deployment web -o custom-columns=NAME:.metadata.name,DESIRED:.spec.replicas,READY:.status.readyReplicas,UP-TO-DATE:.status.updatedReplicas
kubectl get rs -o custom-columns=KIND:.kind,DESIRED:.spec.replicas,READY:.status.readyReplicas
kubectl get pods -l app=web --no-headers | wc -l
```

Important: the `selector.matchLabels` must match the `template.metadata.labels`: that is how the ReplicaSet knows which Pods are its own.

## Self-healing

Delete one Pod and watch Kubernetes notice the difference between desired (3) and actual (2):

```run
victim=$(kubectl get pods -l app=web -o name | head -1)
kubectl delete $victim --wait=true > /dev/null
kubectl rollout status deployment/web --timeout=60s | tail -1
kubectl get pods -l app=web --no-headers | wc -l
```

Three Pods again, with a new one replacing the deleted one. Node failure works the same: Pods on a lost node are recreated elsewhere. This is the reconciliation loop from the architecture lesson.

## Scaling

```run
kubectl scale deployment web --replicas=5
kubectl rollout status deployment/web --timeout=90s | tail -1
kubectl get deployment web -o jsonpath='ready={.status.readyReplicas}{"\n"}'
kubectl scale deployment web --replicas=3
kubectl wait --for=jsonpath='{.status.replicas}'=3 deployment/web --timeout=60s
```

For automatic scaling, a **HorizontalPodAutoscaler** adjusts `replicas` based on CPU or custom metrics (it needs the metrics-server add-on, which this lab does not run, so here it is only an example):

```yaml:hpa.yaml (Example, not run here)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: {name: web}
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: web}
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource: {name: cpu, target: {type: Utilization, averageUtilization: 70}}
```

## Rolling update

Change the image version. Kubernetes starts a new ReplicaSet and gradually moves Pods from the old one to the new one, keeping the service available throughout:

@widget rollout

```run
kubectl set image deployment/web nginx=nginx:1.28-alpine
kubectl rollout status deployment/web --timeout=120s | tail -1
sleep 5
kubectl get rs -o custom-columns=IMAGE:.spec.template.spec.containers[0].image,DESIRED:.spec.replicas,READY:.status.readyReplicas --sort-by=.metadata.creationTimestamp
kubectl get pods -l app=web -o custom-columns=IMAGE:.spec.containers[0].image --no-headers | sort | uniq -c
```

Two ReplicaSets exist: the **old** one scaled to 0 (kept for rollback) and the **new** one with 3 Pods. The pace is set by the update strategy:

```run
kubectl get deployment web -o jsonpath='{.spec.strategy}{"\n"}'
```

`maxSurge: 25%` (how many extra Pods may exist during the update) and `maxUnavailable: 25%` (how many may be missing). With 3 replicas that rounds to one extra and zero unavailable, so capacity never drops. Combined with **readiness probes** (lesson 7), a new Pod receives traffic only when ready: a zero-downtime release.

## History and rollback

```run
kubectl annotate deployment web kubernetes.io/change-cause="upgrade nginx to 1.28" --overwrite > /dev/null
kubectl rollout history deployment/web
kubectl rollout undo deployment/web 2>&1 | grep -v Warning
kubectl rollout status deployment/web --timeout=120s | tail -1
kubectl get deployment web -o jsonpath='image now: {.spec.template.spec.containers[0].image}{"\n"}'
```

`rollout undo` goes back to the previous ReplicaSet; `--to-revision=N` picks a specific one. In GitOps practice you roll back by reverting the commit instead; the effect is the same.

## A bad release

What if the new image does not exist? The rolling update **stalls safely** and the old Pods keep serving:

```run
kubectl set image deployment/web nginx=nginx:does-not-exist
sleep 10
kubectl rollout status deployment/web --timeout=10s 2>&1 | tail -1
kubectl get pods -l app=web -o custom-columns=IMAGE:.spec.containers[0].image,STATUS:.status.containerStatuses[0].state.waiting.reason --no-headers | sort | uniq -c
```

Some Pods show `ErrImagePull` or `ImagePullBackOff` (the new ones), but because `maxUnavailable` protects capacity the **old working Pods are still running**. The fix is to roll back:

```run
kubectl rollout undo deployment/web 2>&1 | grep -v Warning
kubectl rollout status deployment/web --timeout=120s | tail -1
sleep 8
kubectl get pods -l app=web --no-headers -o custom-columns=STATUS:.status.phase | sort | uniq -c
```

This is why rolling updates are safe: a bad version never takes over fully. Set `progressDeadlineSeconds` (default 600) so a stuck rollout is reported as failed, and make your pipeline run `kubectl rollout status` so a failing deploy fails the build.

## Other update strategies

| Strategy | How |
|---|---|
| **RollingUpdate** (default) | gradual replacement |
| **Recreate** | kill all old Pods, then start new ones (downtime; used when two versions cannot coexist) |
| **Blue/green** | run both versions as separate Deployments, switch the Service selector |
| **Canary** | send a small share of traffic to the new version first (labels, ingress weights, or Argo Rollouts / Flagger) |

<!-- deeper -->
## A worked solution and common mistakes

```run
kubectl patch deployment web --type merge -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":0,"maxUnavailable":1}}}}' > /dev/null
kubectl get deployment web -o jsonpath='strategy: {.spec.strategy.rollingUpdate}{"\n"}'
kubectl set image deployment/web nginx=nginx:1.28-alpine > /dev/null
min=99; max=0
for i in $(seq 1 24); do
  total=$(kubectl get pods -l app=web --no-headers 2>/dev/null | grep -vc Terminating)
  ready=$(kubectl get deployment web -o jsonpath='{.status.readyReplicas}' 2>/dev/null); ready=${ready:-0}
  [ "$total" -gt "$max" ] && max=$total
  [ "$ready" -lt "$min" ] && min=$ready
  sleep 0.5
done
kubectl rollout status deployment/web --timeout=120s | tail -1
echo "during the update: never more than $max Pods existed (replicas = 3, maxSurge = 0), and at least $min were ready (maxUnavailable = 1 allows 2)"
```

With `maxSurge: 0` no **extra** Pod is created, so capacity dips by up to one Pod while each old Pod is replaced (the opposite of the default, which starts a surplus Pod first). Use `maxUnavailable: 0, maxSurge: 1` when you cannot afford lower capacity; use `maxSurge: 0` when you have no spare capacity or each Pod needs a scarce resource.

:::warn Common mistakes
- **Setting both `maxSurge` and `maxUnavailable` to 0:** the rollout can never progress.
- **Changing the Pod labels** so the selector no longer matches (the Deployment becomes invalid).
- **Using `latest` as the image tag:** a rollout is triggered only when the Pod spec changes; the same tag with new content does nothing.
- **No readiness probe,** so "ready" means "started", and traffic reaches half-started Pods.
- **Forgetting `kubectl rollout status` in pipelines,** so a failed rollout looks like success.
:::
<!-- /deeper -->

:::recap
- Deployment -> ReplicaSet -> Pods. The selector must match the Pod template labels.
- Controllers heal: delete a Pod and it returns. `kubectl scale` changes replicas; HPA automates it.
- Rolling updates replace Pods gradually (maxSurge, maxUnavailable). `rollout status/history/undo`.
- A bad image stalls the rollout without taking the service down.
:::

:::try Your turn
Set `maxSurge: 0` and `maxUnavailable: 1` in the Deployment, update the image, and describe how the Pod counts differ compared to the default.
:::

:::quiz
? Which object gives you rolling updates and rollbacks?
- Pod
- ReplicaSet
+ Deployment
- Service
! A Deployment manages ReplicaSets, one per version.
? A new image cannot be pulled during an update. What happens to the old Pods?
+ They keep running; the rollout stalls without dropping capacity
- All are killed
- Nothing is created
- The cluster restarts
! maxUnavailable limits how many old Pods may be removed.
? How do you return to the previous version?
+ `kubectl rollout undo deployment/NAME`
- `kubectl delete deployment`
- `kubectl scale --replicas=0`
- Restart the node
! The old ReplicaSet is kept for this reason.
:::
