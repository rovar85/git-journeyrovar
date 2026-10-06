---
track: kubernetes
title: Pods
short: Pods
sub: The smallest unit in Kubernetes: create, inspect, debug and understand the lifecycle of a Pod.
---

:::goals
- explain what a Pod is and why it is not the same as a container
- create Pods with `kubectl run` and with YAML
- read status, logs, events; run commands inside a Pod
- understand multi-container Pods, init containers and restart behaviour
:::

## What a Pod is

A **Pod** is one or more containers that are scheduled **together** on one node and share the **same network (one IP address) and storage volumes**. Most Pods have one container; extra containers are **sidecars** (a log shipper, a proxy) that help the main one. Kubernetes never schedules a bare container, always a Pod.

Pods are **ephemeral**: they are created, they run, they are replaced, never repaired. Their IP changes each time. That is why you almost never create Pods directly (lesson 3 uses Deployments) but you must understand them.

```setup
export LABNS=lab2
```

@setup k8s

## Create a Pod

```run
kubectl run hello --image=busybox:1.37 -- sh -c 'echo "hello from a pod"; sleep 3600'
kubectl wait --for=condition=Ready pod/hello --timeout=60s
kubectl get pod hello -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,READY:.status.containerStatuses[0].ready,NODE:.spec.nodeName
```

`kubectl run` is the quick, imperative way. `Pending` while scheduling and pulling, then `Running`. See what happened:

```run
kubectl get events --field-selector involvedObject.name=hello --sort-by=.lastTimestamp -o custom-columns=REASON:.reason,FROM:.source.component --no-headers
kubectl logs hello
kubectl exec hello -- sh -c 'echo "inside: host=$(hostname) user=$(id -un)"; ls / | head -3'
```

The events show the whole story: **Scheduled** (by the scheduler), **Pulled** the image, **Created**, **Started** (kubelet and runtime). `logs` shows stdout/stderr; `exec` runs a command in the container; `kubectl exec -it POD -- sh` opens a shell.

## The same Pod as YAML

Real work uses YAML files in Git (declarative):

```run
cat > pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
    tier: frontend
spec:
  containers:
  - name: nginx
    image: nginx:1.27-alpine
    ports:
    - containerPort: 80
EOF
kubectl apply -f pod.yaml
kubectl wait --for=condition=Ready pod/web --timeout=60s
kubectl get pods -l app=web --no-headers -o custom-columns=NAME:.metadata.name,STATUS:.status.phase
```

`kubectl apply -f` creates the object, or updates it if it exists (run it again: `pod/web unchanged`). **Labels** are key/value tags on any object; Services and Deployments find their Pods using **label selectors**.

```run
kubectl get pods -o custom-columns=NAME:.metadata.name,LABELS:.metadata.labels
kubectl get pods -l tier=frontend -o name
kubectl apply -f pod.yaml
kubectl get pod web -o yaml | grep -E "^(apiVersion|kind)|phase:|podIP:" | sed 's/podIP: .*/podIP: <ip>/'
```

The object in the cluster has the `spec` you wrote plus a `status` Kubernetes fills in (phase, IPs, container states).

## Reaching a Pod

The Pod has its own IP inside the cluster network. From another Pod you can fetch it directly; from your machine use `kubectl port-forward`, a tunnel for debugging:

```run
ip=$(kubectl get pod web -o jsonpath='{.status.podIP}')
kubectl run client --image=busybox:1.37 --restart=Never -- sh -c "wget -qO- http://$ip | grep -o '<title>.*</title>'"
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/client --timeout=60s
kubectl logs client
kubectl port-forward pod/web 18080:80 > /dev/null 2>&1 &
sleep 3
curl -s http://127.0.0.1:18080/ | grep -o "<title>.*</title>"
kill %1
```

## describe: the most useful debugging command

```run
kubectl describe pod web | grep -E "^(Name|Namespace|Node|Status|Image|State|Ready|Restart Count|QoS Class|Labels)" | sed 's/  */ /g' | sed 's#Node: .*#Node: <node>#'
```

`describe` combines spec, status and the **Events** at the bottom, which usually explain what is wrong.

## Multi-container Pods

Containers in a Pod share the network (they reach each other on `localhost`) and can share volumes. An **init container** runs to completion first, then the app containers start:

```run
cat > multi.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: multi
spec:
  volumes:
  - name: shared
    emptyDir: {}
  initContainers:
  - name: prepare
    image: busybox:1.37
    command: ["sh", "-c", "echo 'prepared by init' > /data/note.txt"]
    volumeMounts: [{name: shared, mountPath: /data}]
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "cat /data/note.txt; echo app-sees-init-output; sleep 3600"]
    volumeMounts: [{name: shared, mountPath: /data}]
  - name: sidecar
    image: busybox:1.37
    command: ["sh", "-c", "while true; do echo sidecar-tick >> /data/side.log; sleep 1; done"]
    volumeMounts: [{name: shared, mountPath: /data}]
EOF
kubectl apply -f multi.yaml
kubectl wait --for=condition=Ready pod/multi --timeout=60s
kubectl get pod multi -o jsonpath='ready containers: {.status.containerStatuses[*].name}{"\n"}'
kubectl logs multi -c app
sleep 3
kubectl exec multi -c app -- sh -c 'grep -c sidecar-tick /data/side.log > /dev/null && echo "app can read the sidecar log through the shared volume"'
```

An `emptyDir` volume lives as long as the Pod and is shared by its containers. Typical sidecar jobs: ship logs, refresh certificates, proxy traffic (service meshes inject a proxy sidecar).

## Restarts and failure

`restartPolicy` (default `Always`) tells the kubelet what to do when a container exits. A container that keeps crashing goes into **CrashLoopBackOff**: restarts with growing delay.

```run
kubectl run crasher --image=busybox:1.37 -- sh -c 'echo "starting"; exit 1'
for i in $(seq 1 30); do kubectl get pod crasher -o jsonpath='{.status.containerStatuses[0].restartCount}' 2>/dev/null | grep -qE '^[1-9]' && break; sleep 2; done
kubectl get pod crasher -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount,LAST_EXIT:.status.containerStatuses[0].lastState.terminated.exitCode
kubectl logs crasher --previous
```

`logs --previous` shows the output of the container before the last restart, which is exactly what you need when a container will not stay up. Exit code `1` is the application's own failure; `137` means killed (often out of memory); `127` command not found.

## Pods are not self-healing

```run
kubectl delete pod web --wait=true
kubectl get pods -l app=web --no-headers | wc -l
```

Nobody recreated it. A bare Pod that is deleted (or whose node dies) is gone. That is the job of a **controller**, which is the next lesson.

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- A Pod is one or more containers sharing one IP and volumes, scheduled together. Pods are disposable.
- `kubectl run`/`apply -f`, `get`, `describe`, `logs` (`--previous`), `exec`, `port-forward`.
- Labels identify Pods; selectors find them.
- Init containers run first; sidecars share network and volumes. CrashLoopBackOff = repeated failure with backoff.
- Bare Pods do not heal. Use a Deployment.
:::

:::try Your turn
Write a Pod YAML with two containers that talk over `localhost` (one runs `nginx`, the other `wget`s `http://localhost` in a loop). Read the second container's logs with `-c`.
:::

:::quiz
? What do containers in the same Pod share?
+ Network (one IP, localhost) and volumes
- Nothing
- CPU quota
- The node's filesystem
! They are co-scheduled and tightly coupled.
? A container keeps crashing. Which command shows the output from before the last restart?
- `kubectl get pod`
+ `kubectl logs POD --previous`
- `kubectl delete pod`
- `kubectl port-forward`
! Use `describe` for events and exit codes as well.
? You delete a bare Pod. What happens?
- It is recreated automatically
+ It is gone; only controllers like Deployments recreate Pods
- It restarts on another node
- It is archived
! Always run Pods through a controller.
:::
