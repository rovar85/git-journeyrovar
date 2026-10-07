---
track: kubernetes
title: Troubleshooting clusters, nodes and control plane components
short: Cluster troubleshooting
sub: The half of troubleshooting beyond a single broken Pod: a mixed-fault triage drill, cluster health endpoints, node conditions, logs, a silent scheduler, a failing API connection, RBAC denials and the node and control plane playbooks.
---

:::goals
- triage several simultaneous faults quickly and in a sensible order
- check API server health endpoints, node conditions and resource usage sources
- recognise the symptom of a missing scheduler and of an unreachable API server
- diagnose a Forbidden error with `kubectl auth can-i` and fix it with RBAC
- follow a playbook for a NotReady node and for broken control plane components
:::

:::note Scope
Lesson 9 drilled **single-Pod faults** (image pull errors, crash loops, Pending, config errors, endpoints, probes) with real runs. This lesson covers the rest of the CKA domain "Troubleshooting" (30% of the exam in the v1.35 curriculum I read): clusters, nodes, components, resource usage, logs and networking. Real runs happen on the lab cluster. **Node and control plane failures cannot be safely staged on the lab's only node**, so those playbooks are **Example, not run here**; the commands in them are the real ones.
:::

```setup
export LABNS=labtrouble
```

@setup k8s

## 1. A mixed-fault triage drill

Real incidents arrive as several symptoms at once. Apply this manifest, which contains **five separate faults**, and **find and fix each one before reading on**:

```run
cat > mixed.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: alpha}
spec:
  replicas: 1
  selector: {matchLabels: {app: alpha}}
  template:
    metadata: {labels: {app: alpha}}
    spec:
      containers: [{name: app, image: "busybox:1.37-nope", command: ["sleep", "3600"]}]
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: bravo}
spec:
  replicas: 1
  selector: {matchLabels: {app: bravo}}
  template:
    metadata: {labels: {app: bravo}}
    spec:
      containers: [{name: app, image: "busybox:1.37", command: ["sh", "-c", "echo starting; echo 'fatal: cannot open database' >&2; exit 1"]}]
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: charlie}
spec:
  replicas: 1
  selector: {matchLabels: {app: charlie}}
  template:
    metadata: {labels: {app: charlie}}
    spec:
      containers:
      - name: app
        image: busybox:1.37
        command: ["sleep", "3600"]
        env: [{name: DB_HOST, valueFrom: {configMapKeyRef: {name: charlie-config, key: db_host}}}]
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: delta}
spec:
  replicas: 1
  selector: {matchLabels: {app: delta}}
  template:
    metadata: {labels: {app: delta}}
    spec:
      nodeSelector: {environment: production}
      containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"]}]
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: echo}
spec:
  replicas: 1
  selector: {matchLabels: {app: echo}}
  template:
    metadata: {labels: {app: echo}}
    spec:
      containers:
      - name: app
        image: busybox:1.37
        command: ["sleep", "3600"]
        readinessProbe: {httpGet: {path: /healthz, port: 8080}, periodSeconds: 3}
EOF
kubectl apply -f mixed.yaml > /dev/null
sleep 25
echo "--- first triage command: everything that is not Running and Ready"
kubectl get pods --no-headers | awk '{print $1, $2, $3}' | sed -E 's/-[a-z0-9]+-[a-z0-9]+ / /'
```

Triage method: **one command shows the status of everything, then one `describe` or `logs` per broken Pod, ordered by what each status word tells you**. Gather the evidence for each:

```run
for app in alpha bravo charlie delta echo; do
  pod=$(kubectl get pods -l app=$app -o jsonpath='{.items[0].metadata.name}')
  echo "=== $app"
  case $app in
    alpha)   kubectl get pod $pod -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}: {.status.containerStatuses[0].state.waiting.message}{"\n"}' | cut -c1-120 ;;
    bravo)   kubectl logs $pod --tail=2; kubectl get pod $pod -o jsonpath='last exit code: {.status.containerStatuses[0].lastState.terminated.exitCode}{"\n"}' ;;
    charlie) kubectl get pod $pod -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}: {.status.containerStatuses[0].state.waiting.message}{"\n"}' | cut -c1-120 ;;
    delta)   kubectl get pod $pod -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")].message}{"\n"}' | cut -c1-110 ;;
    echo)    kubectl get pod $pod -o jsonpath='phase={.status.phase} ready={.status.containerStatuses[0].ready}{"\n"}'; kubectl get events --field-selector involvedObject.name=$pod -o jsonpath='{range .items[?(@.reason=="Unhealthy")]}{.message}{"\n"}{end}' | tail -1 | cut -c1-110 ;;
  esac
done
```

The five diagnoses and their fixes:

| App | Symptom | Cause | Fix |
|---|---|---|---|
| alpha | `ImagePullBackOff` | the tag `1.37-nope` does not exist | `kubectl set image deployment/alpha app=busybox:1.37` |
| bravo | `Error`, then `CrashLoopBackOff`, exit code 1 | the program fails at start (see `kubectl logs`, and `--previous` once it has restarted) | fix the cause of the error; the status is only the symptom |
| charlie | `CreateContainerConfigError` | the ConfigMap `charlie-config` does not exist | `kubectl create configmap charlie-config --from-literal=db_host=db` |
| delta | `Pending` | no node has the label `environment=production` | relabel the node or correct the selector |
| echo | `Running` but `0/1` ready | the readiness probe hits a port nothing serves | fix the probe or the application; the Pod is kept out of Services |

Apply the three quick fixes and watch the recovery:

```run
kubectl set image deployment/alpha app=busybox:1.37 > /dev/null
kubectl create configmap charlie-config --from-literal=db_host=db > /dev/null
kubectl patch deployment delta -p '{"spec":{"template":{"spec":{"nodeSelector":null}}}}' > /dev/null
kubectl rollout status deployment/alpha --timeout=90s | tail -1
kubectl rollout status deployment/delta --timeout=90s | tail -1
kubectl wait --for=condition=Ready pod -l app=charlie --timeout=90s > /dev/null && echo "charlie recovered after the ConfigMap appeared"
```

(bravo needs a code fix and echo needs a probe fix, which is the lesson: a status tells you **where to look**, not what to change.)

## 2. Cluster health: the API server's own endpoints

The API server reports its own health on built-in endpoints; they work with plain `kubectl` and are the first check when something "feels wrong cluster-wide":

```run
echo "livez:  $(kubectl get --raw='/livez')"
echo "readyz: $(kubectl get --raw='/readyz')"
echo "--- the detailed readiness checks:"
kubectl get --raw='/readyz?verbose' | grep -E "etcd|ping|informer-sync" | head -4
echo "--- server version:"
kubectl version -o json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print("client", d["clientVersion"]["gitVersion"], "| server", d["serverVersion"]["gitVersion"])'
```

`/livez` says the process is alive, `/readyz` says it can serve (including **etcd** reachability), and `?verbose` lists each check with `ok` or `failed`: a failing `etcd` line tells you the API server is up but its database is not. On a kubeadm cluster, the **control plane components are Pods** you can inspect (`kubectl -n kube-system get pods`), and when the API server itself is down you inspect them at the **container runtime** level with `crictl`.

## 3. Nodes: conditions, capacity and usage

A node reports **conditions**. The ones to know: `Ready`, `MemoryPressure`, `DiskPressure`, `PIDPressure`, `NetworkUnavailable`. `kubectl describe node` gathers them with capacity, allocated requests and events:

```run
kubectl get node lab-node -o jsonpath='{range .status.conditions[*]}{.type}={.status}  {end}{"\n"}'
kubectl describe node lab-node | grep -E "^  (cpu|memory) " | head -2
kubectl describe node lab-node | grep -A4 "Allocated resources" | head -5
```

**Allocated** is the sum of Pod **requests** (what the scheduler uses), not actual usage. Actual usage comes from the **metrics server**, through `kubectl top`:

```run
kubectl top nodes 2>&1 | head -1
kubectl top pods 2>&1 | head -1
```

The lab has no metrics server, so both fail with "Metrics API not available". In a cluster with one, `kubectl top nodes` and `kubectl top pods --containers` show real CPU and memory, `--sort-by=memory` finds the heavy Pod, and the HPA of Lesson 13 reads the same API. The CKA expects you to **monitor resource usage** with these two commands and to know that without the metrics server they do not work; fuller monitoring is Prometheus (Monitoring track).

## 4. Logs: where they live

```run
pod=$(kubectl get pods -l app=bravo -o jsonpath='{.items[0].metadata.name}')
echo "--- the Pod's logs:";                kubectl logs $pod --tail=2
echo "--- by Deployment name:";            kubectl logs deployment/bravo --tail=1
echo "--- by label, all containers:";      kubectl logs -l app=bravo --tail=1 --all-containers
echo "--- the crashed run (needs a restart to exist):"; kubectl logs $pod --previous --tail=1 2>&1 | cut -c1-90
echo "--- where the node keeps them:";     ls /var/log/pods | sed -E 's/_[0-9a-f-]{36}$//' | head -3
```

The flags worth knowing: `-c NAME` (a specific container in a multi-container Pod), `--previous` (the **crashed** container's last output), `-f` (follow), `--since=10m`, `--tail=N`, `-l selector` (many Pods at once), `--all-containers`. Kubernetes keeps **no log history for deleted Pods** (use a log collector such as Fluent Bit or Loki, Monitoring track). On a node the kubelet writes container logs under **`/var/log/pods`** and **`/var/log/containers`**; the kubelet's own logs go to the service manager (`journalctl -u kubelet` on systemd machines). Control plane components on kubeadm clusters log through their containers (`kubectl logs -n kube-system kube-apiserver-NODE`, or `crictl logs` when the API server is down).

## 5. The silent scheduler

When the **scheduler is down or missing**, new Pods stay `Pending` with **no events at all**, which differs from a scheduling failure (where an event explains). Reproduce the symptom with a Pod that names a scheduler that does not exist:

```run
cat > noscheduler.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: orphan}
spec:
  schedulerName: no-such-scheduler
  containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"]}]
EOF
kubectl apply -f noscheduler.yaml > /dev/null
sleep 8
kubectl get pod orphan --no-headers | awk '{print $1, $3}'
echo "events for the Pod: $(kubectl get events --field-selector involvedObject.name=orphan --no-headers 2>/dev/null | wc -l) lines"
kubectl get pod orphan -o jsonpath='PodScheduled condition present: {.status.conditions[?(@.type=="PodScheduled")].status}{"\n"}'
kubectl delete pod orphan --wait=false > /dev/null
```

**Pending, no events, no `PodScheduled` condition** means **no scheduler claimed the Pod**: check that `kube-scheduler` is running (`kubectl -n kube-system get pods`, or its static Pod manifest) and its leader election and logs. Workaround to get a workload running meanwhile: set `spec.nodeName` (Lesson 13).

## 6. "kubectl cannot connect" and "Forbidden"

Two very different failures look similar at first glance.

**Cannot connect** (the request never reached a working API server):

```run
echo "--- a wrong server address:"
kubectl --server=https://127.0.0.1:1 get nodes 2>&1 | grep -oE 'connection refused' | head -1 | sed 's/^/error: /'
echo "--- which context and cluster am I using?"
kubectl config current-context
kubectl config view --minify -o jsonpath='server: {.clusters[0].cluster.server}{"\n"}' | sed -E 's#//.*:#//<host>:#'
```

The checklist for "connection refused" or "timeout": **right context and server in the kubeconfig** (`kubectl config get-contexts`, `$KUBECONFIG`), **is the API server Pod or process running** (its static Pod manifest, container runtime), **etcd healthy**, **certificates valid**, **network and firewall to port 6443**.

**Forbidden** (the API server answered and said no; this is **RBAC**, Lesson 8):

```run
kubectl create serviceaccount reader > /dev/null
echo "--- can the account list pods?"
kubectl auth can-i list pods --as=system:serviceaccount:labtrouble:reader
kubectl get pods --as=system:serviceaccount:labtrouble:reader 2>&1 | sed -E 's/^Error from server \(Forbidden\): //' | cut -c1-140
kubectl create role pod-reader --verb=get,list --resource=pods > /dev/null
kubectl create rolebinding reader-binding --role=pod-reader --serviceaccount=labtrouble:reader > /dev/null
echo "--- after the Role and RoleBinding:"
kubectl auth can-i list pods --as=system:serviceaccount:labtrouble:reader
kubectl auth can-i delete pods --as=system:serviceaccount:labtrouble:reader
```

`kubectl auth can-i VERB RESOURCE --as=...` answers "would this identity be allowed?" without trying, and `kubectl auth can-i --list --as=...` lists everything allowed. The error message itself names the **user, verb, resource and namespace**, which is exactly what the missing Role must grant.

## 7. Playbook: a NotReady node (Example, not run here)

```term
$ kubectl get nodes                                    # which node, how long NotReady
$ kubectl describe node worker2 | sed -n '/Conditions/,/Addresses/p'    # the reason and message of each condition
$ ssh worker2                                          # then, on the node:
$ systemctl status kubelet                             # is the kubelet running?
$ journalctl -u kubelet --no-pager | tail -50          # why not? config errors, certificate problems, cannot reach API server
$ systemctl status containerd                          # the runtime (CRI) must be running
$ crictl ps -a | head                                  # can the runtime list containers?
$ df -h /var/lib/kubelet /var/lib/containerd           # a full disk causes DiskPressure and evictions
$ free -m; swapon --show                               # kubelet refuses to run with swap on unless configured for it
$ ls -l /etc/kubernetes/kubelet.conf /var/lib/kubelet/config.yaml    # do the files exist and parse?
$ sudo systemctl restart kubelet                       # after fixing the cause
```

The usual causes, in the order they occur: **the kubelet is stopped or crash-looping** (bad config, wrong path in the systemd drop-in), **the container runtime is down**, **the node cannot reach the API server** (network, certificate expired, wrong server address in `kubelet.conf`), **disk, memory or PID pressure**, and **a missing or broken CNI plugin** (`NetworkUnavailable`). After the grace period the control plane taints the node `unreachable` and **Pods are evicted and rescheduled** (Lesson 13), which is what you will see happen to workloads.

## 8. Playbook: control plane components (Example, not run here)

On kubeadm clusters the four components are **static Pods** from `/etc/kubernetes/manifests` (Lesson 11), so a typo there breaks the component:

| Symptom | Where to look |
|---|---|
| `kubectl` says connection refused | API server: `crictl ps -a \| grep kube-apiserver`, `crictl logs ID`, `/var/log/pods/kube-system_kube-apiserver*`, the manifest's flags and certificate paths, etcd reachability |
| API works but new Pods stay Pending with no events | scheduler: Pod `kube-scheduler-NODE`, its logs and manifest |
| Deployments create no Pods, scaling does nothing | controller manager: `kube-controller-manager-NODE` logs |
| everything slow or `etcdserver: request timed out` | etcd: its Pod logs, disk latency, member health (`etcdctl endpoint health` with the TLS flags) |
| a component restarts in a loop | `crictl logs --previous`; a manifest typo shows in the kubelet log as a parse error |

A reliable recovery habit: **copy the manifest before editing**, change one thing, and watch the container come back (`crictl ps`); if it fails, restore the copy.

:::warn Common mistakes
- **Fixing the symptom's status word instead of its cause** (restarting a crash-looping Pod, deleting a Pending one).
- **Looking in the wrong namespace** (`-n kube-system` for components, `-A` to search everywhere).
- **Reading `kubectl logs` of a restarted container** and missing the crash: add `--previous`.
- **Confusing Forbidden with a connection error.** One is RBAC, the other is networking or the control plane.
- **Editing several things at once**, so you never learn which change fixed it.
- **Forgetting the node layer** when every Pod on one node is unhealthy: check `describe node` before the Pods.
:::

:::recap
- Triage first (`get pods -A`), then one `describe`, `logs` or `--previous` per broken Pod; the status word says **where to look**.
- API server health: `kubectl get --raw=/livez`, `/readyz?verbose`; node health: conditions in `describe node`; usage: `kubectl top` (needs the metrics server).
- Pending with **no events** means no scheduler; **connection refused** is the API server or the kubeconfig; **Forbidden** is RBAC (`kubectl auth can-i`).
- NotReady node: kubelet, container runtime, API reachability, disk, memory, swap, CNI. Control plane: static Pod manifests, `crictl`, `/var/log/pods`.
:::

:::try Your turn
Break something new on purpose: a Deployment whose container requests `memory: 100Gi`, and a Service whose `targetPort` is wrong. Write down, before running any command, the first three commands you would use to find each cause, then check yourself against the real output.
:::

:::quiz
? A new Pod stays Pending and has no events at all. What does that suggest?
+ No scheduler is handling it (it is down, or the Pod names a scheduler that does not exist)
- The image is missing
- The node is out of disk
- The readiness probe is failing
! A scheduling failure would at least produce an event.
? What does `kubectl auth can-i list pods --as=system:serviceaccount:ns:sa` tell you?
+ Whether that service account is allowed to list pods, without attempting it
- Whether the Pod exists
- Whether the namespace exists
- The account's password
! It evaluates RBAC for the named identity.
? Which flag shows the output of the previous, crashed container?
+ kubectl logs POD --previous
- kubectl logs POD --old
- kubectl describe POD --logs
- kubectl get logs POD
! The restart replaced the current container's logs.
:::
