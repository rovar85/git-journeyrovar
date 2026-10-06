=== kubernetes/01
## Worked answers and common mistakes

```run
kubectl explain deployment.spec.strategy | sed -n 1,12p
echo "--- the two strategy types:"
kubectl explain deployment.spec.strategy.type | grep -iE "recreate|rollingupdate" | head -3
```

The two types are **RollingUpdate** (default: replace gradually) and **Recreate** (stop all old Pods, then start new ones).

**If etcd were lost:** the API server could no longer read or write cluster state, so `kubectl` would fail, nothing could be created, scheduled, scaled or healed, and controllers could not work. Pods already running on nodes **keep running** (the kubelet and container runtime carry on), but the cluster is effectively frozen and a restore of the etcd backup is needed. This is why etcd backups, and several etcd members on separate machines, matter.

:::warn Common mistakes
- **Treating Kubernetes as a VM manager.** It reconciles declared state; change the manifest, not the running pod.
- **Not backing up etcd** (or backing up but never testing a restore).
- **Running a single control-plane node in production.**
- **Using `kubectl` against the wrong cluster or namespace.** Check `kubectl config current-context` before any destructive command.
- **Memorising YAML instead of using `kubectl explain` and `--dry-run=client -o yaml`.**
:::

=== kubernetes/02
## A worked solution and common mistakes

```run
cat > two.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: duo}
spec:
  containers:
  - name: web
    image: nginx:1.27-alpine
  - name: poller
    image: busybox:1.37
    command: ["sh", "-c", "sleep 3; while true; do wget -qO- http://localhost | grep -o '<title>.*</title>'; sleep 2; done"]
EOF
kubectl apply -f two.yaml
kubectl wait --for=condition=Ready pod/duo --timeout=60s
sleep 6
kubectl logs duo -c poller | sort | uniq -c
kubectl logs duo -c web | head -1 | cut -c1-60
```

The poller reached nginx on **`localhost`** because both containers share one network namespace (one IP, one port space). `-c NAME` picks which container's log to read (without it Kubernetes asks which one).

:::warn Common mistakes
- **Putting two unrelated apps in one Pod.** Use separate Deployments; share a Pod only for tightly coupled helpers.
- **Both containers listening on the same port** (they share the port space).
- **Forgetting `-c`** when reading logs and thinking logs are missing.
- **Expecting the Pod's IP to be stable.** Use a Service.
- **Running a bare Pod in production** (no self-healing).
:::

=== kubernetes/03
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

=== kubernetes/04
## A worked solution and common mistakes

```run
kubectl create namespace other4 > /dev/null
kubectl -n other4 run probe --image=busybox:1.37 --restart=Never -- sh -c '
echo "short name:"; wget -q -T 3 -O- http://web 2>&1 | head -1
echo "cross-namespace name:"; wget -qO- http://web.lab4.svc.cluster.local | grep -o "<title>.*</title>"
echo "search path:"; grep ^search /etc/resolv.conf'
kubectl -n other4 wait --for=jsonpath='{.status.phase}'=Succeeded pod/probe --timeout=60s > /dev/null
kubectl -n other4 logs probe
kubectl delete namespace other4 --wait=false > /dev/null
```

The short name `web` fails in `other4` because the resolver's search path starts with **the Pod's own namespace** (`other4.svc.cluster.local`), which has no `web`. Use `web.lab4` or the full `web.lab4.svc.cluster.local`.

:::warn Common mistakes
- **Using the short service name across namespaces.**
- **Hard-coding ClusterIPs or Pod IPs.**
- **Exposing everything as NodePort or LoadBalancer.** Most services need only ClusterIP; use Ingress for HTTP.
- **Mixing up `port` and `targetPort`.**
- **Assuming namespaces isolate the network.** By default any Pod can reach any Service; add NetworkPolicies.
:::

=== kubernetes/05
## A worked solution and common mistakes

```run
printf 'db-user\n' > user.txt
kubectl create secret generic from-file --from-file=username=user.txt
cat > secpod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: secpod}
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "stat -L -c '%a %n' /etc/creds/username; cat /etc/creds/username; touch /etc/creds/x 2>&1 | head -1; sleep 3600"]
    volumeMounts: [{name: c, mountPath: /etc/creds, readOnly: true}]
  volumes:
  - name: c
    secret: {secretName: from-file, defaultMode: 0400}
EOF
kubectl apply -f secpod.yaml > /dev/null
kubectl wait --for=condition=Ready pod/secpod --timeout=60s > /dev/null
kubectl logs secpod
echo "--- decode it from the command line:"
kubectl get secret from-file -o jsonpath='{.data.username}' | base64 -d
```

:::warn Common mistakes
- **Believing base64 is encryption.** Anyone who can `get secret` can read it.
- **Committing Secret YAML to Git.**
- **Using environment variables for secrets** (they leak into logs and crash dumps); prefer mounted files.
- **Giving broad RBAC rights to `get secrets`.**
- **`subPath` mounts** do not update when the Secret changes.
:::

=== kubernetes/06
## A worked solution and common mistakes

```run
sudo mkdir -p /tmp/lab-pv/small && sudo chmod 777 /tmp/lab-pv/small
cat > bigclaim.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata: {name: small-pv}
spec:
  capacity: {storage: 1Gi}
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  hostPath: {path: /tmp/lab-pv/small}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: too-big}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  resources:
    requests: {storage: 2Gi}
EOF
kubectl apply -f bigclaim.yaml > /dev/null
sleep 5
kubectl get pvc too-big -o jsonpath='claim status: {.status.phase}{"\n"}'
kubectl get events --field-selector involvedObject.name=too-big -o jsonpath='{.items[0].reason}: {.items[0].message}{"\n"}' | cut -c1-110
kubectl delete -f bigclaim.yaml > /dev/null; sudo rm -rf /tmp/lab-pv
```

The claim stays **Pending** forever: no PV of class `manual` has at least 2 Gi, and (with no provisioner) nothing creates one. Fix by reducing the request, adding a bigger PV, or using a StorageClass with dynamic provisioning. A Pod using a Pending claim also stays Pending.

:::warn Common mistakes
- **Mismatched `storageClassName`** (including leaving it blank vs `manual`).
- **Using `hostPath` in a multi-node cluster:** the data lives on one node and the Pod may run elsewhere.
- **Assuming `ReadWriteOnce` allows many Pods.** It limits to one **node**.
- **Deleting a PVC and expecting the data to stay.** The reclaim policy decides (Delete removes the disk).
- **No backups.** Volumes are not backups.
:::

=== kubernetes/07
## A worked solution and common mistakes

```run
cat > probe.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: shop}
spec:
  replicas: 2
  selector:
    matchLabels: {app: shop}
  template:
    metadata:
      labels: {app: shop}
    spec:
      containers:
      - name: nginx
        image: nginx:1.27-alpine
        readinessProbe:
          httpGet: {path: /, port: 80}
          periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata: {name: shop}
spec:
  selector: {app: shop}
  ports: [{port: 80}]
EOF
kubectl apply -f probe.yaml > /dev/null
kubectl rollout status deployment/shop --timeout=90s | tail -1
ready() { kubectl get endpointslices -l kubernetes.io/service-name=shop -o jsonpath='{.items[0].endpoints[?(@.conditions.ready==true)].addresses[0]}' | wc -w; }
echo "good probe: $(ready) ready endpoints"
kubectl patch deployment shop --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/missing"}]' > /dev/null
sleep 12
kubectl get pods -l app=shop -o custom-columns=PHASE:.status.phase,READY:.status.containerStatuses[0].ready --no-headers | sort | uniq -c
echo "after pointing the probe at /missing: $(ready) ready endpoints (the old Pods keep serving while the new ones never become ready)"
```

The new Pods run but fail the probe (404), so the rolling update **stalls** with the old healthy Pods still serving. Had all Pods been replaced, the Service would have had **no endpoints**.

:::warn Common mistakes
- **No readiness probe,** so traffic hits Pods that are still starting.
- **A liveness probe that checks a dependency** (database), so a database blip restarts every app Pod in a loop.
- **Too-aggressive timings** (`timeoutSeconds: 1` on a slow endpoint).
- **Probes on the wrong port or path,** which is a common cause of "Running but 0/1 Ready".
- **Forgetting startup probes** for slow-starting apps, so liveness kills them before they finish starting.
:::

=== kubernetes/08
## A worked solution and common mistakes

```run
kubectl create namespace rbac8 > /dev/null
kubectl -n rbac8 create serviceaccount cfg-reader > /dev/null
kubectl -n rbac8 create role cm-get --verb=get --resource=configmaps > /dev/null
kubectl -n rbac8 create rolebinding cfg-reader-binding --role=cm-get --serviceaccount=rbac8:cfg-reader > /dev/null
sa=system:serviceaccount:rbac8:cfg-reader
for q in "get configmaps" "list configmaps" "get secrets" "delete configmaps"; do
  printf '%-18s -> %s\n' "$q" "$(kubectl auth can-i $q -n rbac8 --as=$sa)"
done
kubectl delete namespace rbac8 --wait=false > /dev/null
```

Only `get configmaps` is allowed. Notice `list` is a **separate verb** from `get`: a client that lists first would fail. Add verbs deliberately.

:::warn Common mistakes
- **Granting `cluster-admin` to fix a Forbidden error.** Read the error: it names the user, verb and resource.
- **Binding roles to groups like `system:authenticated`** (every user).
- **Forgetting that RBAC is additive** (there is no deny); check all bindings that apply (`kubectl auth can-i --list`).
- **Using the default ServiceAccount** for workloads that need distinct permissions.
- **Wildcards (`*`) in verbs or resources** in anything but a break-glass role.
:::

=== kubernetes/09
## A worked solution and common mistakes

```run
kubectl run nocmd --image=busybox:1.37 --restart=Never -- /no/such/program > /dev/null
sleep 8
kubectl get pod nocmd -o custom-columns=NAME:.metadata.name,STATUS:.status.containerStatuses[0].state.waiting.reason,EXIT:.status.containerStatuses[0].state.terminated.exitCode --no-headers
kubectl describe pod nocmd | grep -iE "reason|message|exit code" | head -4 | cut -c1-140
kubectl logs nocmd 2>&1 | head -2
```

The process never started: the runtime reports that the executable was not found, usually with a `RunContainerError`/`StartError` reason and exit code **127** or **128** ("command not found" or "cannot start"). `logs` is empty or an error because the application never ran. The cause is in `describe` (the event/message), not in the application log.

:::warn Common mistakes
- **Looking only at `logs`,** which cannot show failures that happen before the app starts.
- **Confusing `command` and `args`:** `command` replaces the image ENTRYPOINT, `args` replaces CMD.
- **Wrong image architecture or shell** (`sh` missing in distroless images).
- **Fixing by guesswork instead of reading `Events`.**
- **Deleting and recreating the Pod instead of fixing the Deployment,** so the fault returns.
:::

=== kubernetes/10
## A worked solution and common mistakes

```run
mkdir -p gen/base gen/overlays/big && cd gen
kubectl create deployment x --image=nginx:1.27-alpine --dry-run=client -o yaml > base/deploy.yaml
echo "generated $(wc -l < base/deploy.yaml) lines of YAML without touching the cluster; replicas in the base: $(grep replicas base/deploy.yaml)"
printf 'resources:\n- deploy.yaml\n' > base/kustomization.yaml
cat > overlays/big/kustomization.yaml <<'EOF'
resources:
- ../../base
replicas:
- name: x
  count: 5
EOF
kubectl kustomize overlays/big | grep -E "kind:|replicas:|image:"
cd ..
```

`--dry-run=client -o yaml` is the fastest way to get correct YAML to edit, and it is how people work in the CKA/CKAD exams. The overlay changed only the replica count; the base is untouched, so the same base can feed test and production overlays.

:::warn Common mistakes
- **Treating Helm values and Kustomize patches as magic.** Always render and read the result (`helm template`, `kubectl kustomize`) before applying.
- **Using `kubectl edit` in production,** leaving the cluster different from Git.
- **Drain without PodDisruptionBudgets,** taking all replicas of a service down at once.
- **Ignoring Job history and CronJob overlap,** filling the cluster with finished Pods (set history limits and `concurrencyPolicy`).
- **Not planning upgrades:** skipping minor versions is unsupported; upgrade one at a time and read release notes.
:::
