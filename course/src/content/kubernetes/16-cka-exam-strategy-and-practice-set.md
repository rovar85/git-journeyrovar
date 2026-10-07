---
track: kubernetes
title: CKA exam strategy, speed techniques and a practice set with solutions
short: CKA practice set
sub: How the Certified Kubernetes Administrator exam works, how this course maps to its curriculum, the speed habits that matter, and fifteen original timed tasks with verified solutions.
---

:::goals
- know the exam format, the five domains and where each is covered in this course
- apply the speed habits: aliases, `--dry-run=client -o yaml`, contexts, `kubectl explain`
- complete a set of exam-style tasks quickly and verify each result
- identify what this course cannot give you and how to fill the gap before booking the exam
:::

:::note What this lesson is, and is not
**The curriculum domains and weights below come from the official CNCF CKA curriculum document (v1.35), which I read.** The **format details** (duration, pass mark, allowed resources, retake policy) are **from my own knowledge** and change from time to time: **check the current Linux Foundation CKA page and the candidate handbook before you book.** The 15 tasks are **original** (I wrote them for this course; they are not taken from any exam or question bank). Passing a performance-based exam needs **many hours on a real cluster under time pressure**: the course gives you the knowledge and the habits, not a guarantee.
:::

```setup
export LABNS=labexam
```

@setup k8s

## 1. The exam in one page (verify the current details)

| | |
|---|---|
| Format | **performance-based**: you work in a live terminal on real clusters, solving tasks, not choosing answers |
| Duration | about **2 hours** |
| Tasks | roughly 15 to 20, each with a **weight** shown (a 4% task and an 8% task are not equal) |
| Pass mark | about **66%** |
| Resources | the official Kubernetes documentation (and a few related sites) in a browser tab; no personal notes |
| Environment | several clusters; **each task tells you which context to switch to** |
| Includes | a retake and access to the official simulator (**killer.sh**) with the exam purchase, at the time I last knew; check |

The five domains and their weights (official v1.35 curriculum):

| Domain | Weight | Where it is in this course |
|---|---|---|
| **Troubleshooting** | **30%** | Lessons 9 and 15, plus the Monitoring track |
| **Cluster architecture, installation and configuration** | **25%** | Lessons 1, 8 (RBAC), 10 (Helm, Kustomize), 11 (kubeadm, etcd, HA), 12 (CRDs, CNI, CSI, CRI) |
| **Services and networking** | **20%** | Lessons 4 and 14 |
| **Workloads and scheduling** | **15%** | Lessons 2, 3, 5, 7, 13 |
| **Storage** | **10%** | Lesson 6 |

## 2. Honest gaps: what the lab cannot teach

| Exam topic | In the course | What is missing, and the fix |
|---|---|---|
| `kubeadm init`, `join`, **upgrade** | explained, commands shown (Lesson 11) | not run: practise on **real VMs or a kubeadm-based practice cluster** until the upgrade sequence is automatic |
| **HA control plane** | explained | practise building or reading one |
| Installing a **CNI plugin**, enforced **NetworkPolicy** | concepts, and a real demonstration that policy is **not** enforced without support | use a practice cluster whose plugin enforces policy |
| **Ingress controller, Gateway API** | resources written, not run | install a controller once on a practice cluster |
| **metrics-server**, HPA scaling for real | the failure mode shown | install metrics-server on a practice cluster |
| **StorageClass dynamic provisioning** | concepts and a pending-claim demonstration | practise on a cloud or CSI-equipped cluster |
| **Multi-cluster contexts**, `ssh` to nodes, `systemctl`, `journalctl` | explained | the exam uses them: rehearse switching contexts and working on a node |
| **Speed and the exam editor** | this lesson | only **timed repetition** builds it |

So the honest answer to "can I pass after these chapters?": **the chapters cover the knowledge for all five domains and give you real hands-on practice for most of them**; to be ready you must additionally (1) rehearse the kubeadm, etcd and upgrade tasks on a real cluster, (2) repeat timed tasks until the imperative commands are automatic, and (3) take at least one full-length mock exam (the official simulator or a similar one) and fix the weak spots. Plan **several weeks of daily practice**, even with a solid foundation.

## 3. Speed habits

Set these up in the **first minute** of the exam (the terminal is Bash; the docs allow copying):

```bash
alias k=kubectl
source <(kubectl completion bash); complete -F __start_kubectl k       # tab completion, also for the alias
export do="--dry-run=client -o yaml"                                    # k create deploy x --image=y $do > x.yaml
export now="--force --grace-period=0"                                   # fast delete: k delete pod x $now
echo "set tabstop=2 shiftwidth=2 expandtab" >> ~/.vimrc                 # YAML needs spaces, and indentation must be consistent
```

The habits that save the most time:

1. **Switch context first**, every task. Each task gives a `kubectl config use-context ...` line; copy and run it. Doing the right work in the wrong cluster scores zero.
2. **Generate, do not type, YAML**: `kubectl run`, `create deployment/job/cronjob/configmap/secret/role/rolebinding/serviceaccount/service/ingress`, `expose`, each with `--dry-run=client -o yaml`, then edit only what the command cannot express.
3. **`kubectl explain pod.spec.containers.livenessProbe --recursive | less`** gives field names without leaving the terminal; the docs are for examples you cannot remember (search `kubernetes.io` for the object name, copy, adapt).
4. **Always set the namespace**: `-n NAME` on every command, or `kubectl config set-context --current --namespace=NAME`.
5. **Verify every task** with a `get` or `describe` before moving on; a typo in a label costs the whole task.
6. **Time-box**: about 6 minutes per task on average; if a task stalls, **flag it, move on, and return**. Do the easy high-weight tasks first.
7. **Do not break things**: a wrong `kubectl delete` of a system object can fail several later tasks. Read the namespace and the name twice.

## 4. The practice set

Do each task **yourself first, with a stopwatch**, then compare with the solution below. They are grouped so the solutions can run one after another. Tasks 1 to 10 first:

| # | Task (weight in a real exam would be 3% to 8%) |
|---|---|
| 1 | Create a namespace `exam-a`. In it create a Deployment `web` with 3 replicas of `busybox:1.37` running an HTTP server on port 8080 (`httpd -f -p 8080`), and a ClusterIP Service `web` on port 80 targeting 8080. |
| 2 | Trigger a rolling update of `web` by setting the environment variable `VERSION=2`, wait for it, then **roll back** and confirm the revision. |
| 3 | Create a ConfigMap `app-config` with `color=blue` and mount it as a file into a Pod `cm-pod` at `/etc/app`. Print the file from the Pod. |
| 4 | Create a Secret `db-secret` with `password=s3cret` and expose it to Pod `secret-pod` as the environment variable `DB_PASSWORD`. |
| 5 | Create a Job `batch` that runs 3 completions, 2 at a time, printing "done". |
| 6 | Create a CronJob `tick` that runs every 5 minutes and prints the date. |
| 7 | Create a ServiceAccount `auditor`, a Role allowing `get` and `list` on Pods, bind them, and prove it with `can-i`. |
| 8 | Create a Pod `limits-pod` with CPU request 100m, limit 200m, memory request 64Mi, limit 128Mi, and an HTTP readiness probe on `/`, port 8080. |
| 9 | Write to `/tmp/images.txt` the unique container images used by all Pods in all namespaces, sorted. |
| 10 | Label the node `tier=backend`, and create a Pod `on-backend` that runs only on nodes with that label. |

```run
echo "### Task 1"
kubectl create namespace exam-a > /dev/null
kubectl -n exam-a create deployment web --image=busybox:1.37 --replicas=3 -- sh -c 'mkdir -p /w; echo hello > /w/index.html; httpd -f -p 8080 -h /w' > /dev/null
kubectl -n exam-a expose deployment web --port=80 --target-port=8080 > /dev/null
kubectl -n exam-a rollout status deployment/web --timeout=90s | tail -1
kubectl -n exam-a get svc web --no-headers | awk '{print "service", $1, $2, $5}'

echo "### Task 2"
kubectl -n exam-a set env deployment/web VERSION=2 > /dev/null
kubectl -n exam-a rollout status deployment/web --timeout=90s | tail -1
kubectl -n exam-a rollout history deployment/web | tail -3 | awk 'NF {print "history:", $1}'
kubectl -n exam-a rollout undo deployment/web > /dev/null
kubectl -n exam-a rollout status deployment/web --timeout=90s | tail -1
kubectl -n exam-a get deployment web -o jsonpath='VERSION env after rollback: {.spec.template.spec.containers[0].env}{"\n"}' | sed 's/^\(.*\): $/\1: (none, the old revision)/'

echo "### Task 3"
kubectl create configmap app-config --from-literal=color=blue > /dev/null
cat > cm-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: cm-pod}
spec:
  containers: [{name: app, image: busybox:1.37, command: ["sleep", "3600"], volumeMounts: [{name: cfg, mountPath: /etc/app}]}]
  volumes: [{name: cfg, configMap: {name: app-config}}]
EOF
kubectl apply -f cm-pod.yaml > /dev/null
kubectl wait --for=condition=Ready pod/cm-pod --timeout=60s > /dev/null
kubectl exec cm-pod -- cat /etc/app/color; echo

echo "### Task 4"
kubectl create secret generic db-secret --from-literal=password=s3cret > /dev/null
cat > secret-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: secret-pod}
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sleep", "3600"]
    env: [{name: DB_PASSWORD, valueFrom: {secretKeyRef: {name: db-secret, key: password}}}]
EOF
kubectl apply -f secret-pod.yaml > /dev/null
kubectl wait --for=condition=Ready pod/secret-pod --timeout=60s > /dev/null
kubectl exec secret-pod -- sh -c 'echo "DB_PASSWORD=$DB_PASSWORD"'
```

(In the exam you would generate the Pod with `kubectl run secret-pod --image=busybox:1.37 --dry-run=client -o yaml -- sleep 3600 > secret-pod.yaml` and add the `env` block in `vim`; the Kubernetes documentation page for Secrets has the `secretKeyRef` snippet to copy.)

```run
echo "### Task 5"
cat > job.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata: {name: batch}
spec:
  completions: 3
  parallelism: 2
  template:
    spec:
      restartPolicy: Never
      containers: [{name: c, image: busybox:1.37, command: ["sh", "-c", "echo done"]}]
EOF
kubectl apply -f job.yaml > /dev/null
kubectl wait --for=condition=Complete job/batch --timeout=90s > /dev/null
kubectl get job batch --no-headers | awk '{print "job", $1, $2, "completions", $3}'

echo "### Task 6"
kubectl create cronjob tick --image=busybox:1.37 --schedule="*/5 * * * *" -- sh -c 'date' > /dev/null
kubectl get cronjob tick -o jsonpath='schedule: {.spec.schedule}{"\n"}'

echo "### Task 7"
kubectl create serviceaccount auditor > /dev/null
kubectl create role pod-viewer --verb=get,list --resource=pods > /dev/null
kubectl create rolebinding auditor-binding --role=pod-viewer --serviceaccount=labexam:auditor > /dev/null
echo "list pods: $(kubectl auth can-i list pods --as=system:serviceaccount:labexam:auditor)"
echo "delete pods: $(kubectl auth can-i delete pods --as=system:serviceaccount:labexam:auditor)"

echo "### Task 8"
cat > limits.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: limits-pod}
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "mkdir -p /w; echo ok > /w/index.html; httpd -f -p 8080 -h /w"]
    resources:
      requests: {cpu: 100m, memory: 64Mi}
      limits: {cpu: 200m, memory: 128Mi}
    readinessProbe: {httpGet: {path: /, port: 8080}, periodSeconds: 3}
EOF
kubectl apply -f limits.yaml > /dev/null
kubectl wait --for=condition=Ready pod/limits-pod --timeout=60s > /dev/null
kubectl get pod limits-pod -o jsonpath='{.status.qosClass} QoS, requests {.spec.containers[0].resources.requests}{"\n"}'

echo "### Task 9"
kubectl get pods -A -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{end}' | sort -u > /tmp/images.txt
wc -l < /tmp/images.txt | awk '{print "unique images written:", $1}'
head -2 /tmp/images.txt

echo "### Task 10"
kubectl label node lab-node tier=backend > /dev/null
kubectl run on-backend --image=busybox:1.37 --overrides='{"spec":{"nodeSelector":{"tier":"backend"}}}' -- sleep 3600 > /dev/null
kubectl wait --for=condition=Ready pod/on-backend --timeout=60s > /dev/null
kubectl get pod on-backend -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName --no-headers
kubectl label node lab-node tier- > /dev/null
```

Tasks 11 to 15, which touch storage, scheduling control, networking, and the parts that need a real cluster:

| # | Task |
|---|---|
| 11 | Create a 1Gi PersistentVolume `exam-pv` (hostPath, class `exam`, ReadWriteOnce) and a 500Mi PersistentVolumeClaim `exam-pvc` that binds to it. |
| 12 | A Deployment `broken` uses the image `busybox:1.37-typo`. Find the cause and fix it without deleting the Deployment. |
| 13 | Use `kubectl explain` to find out which field sets how long a container's liveness probe waits before the first check, and its default. |
| 14 | Create a Pod `multi` with two containers: `app` (sleep) and `sidecar` (prints "log line" every 2 seconds). Show only the sidecar's logs. |
| 15 | **(Needs a real kubeadm cluster, Example only)** Back up etcd to `/backup/etcd.db`, then upgrade a control plane node from one minor version to the next. |

```run
echo "### Task 11"
sudo mkdir -p /tmp/lab-pv/exam && sudo chmod 777 /tmp/lab-pv/exam
cat > storage.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata: {name: exam-pv}
spec:
  capacity: {storage: 1Gi}
  accessModes: [ReadWriteOnce]
  storageClassName: exam
  hostPath: {path: /tmp/lab-pv/exam}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: exam-pvc}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: exam
  resources: {requests: {storage: 500Mi}}
EOF
kubectl apply -f storage.yaml > /dev/null
for i in $(seq 1 20); do [ "$(kubectl get pvc exam-pvc -o jsonpath='{.status.phase}')" = "Bound" ] && break; sleep 1; done
kubectl get pvc exam-pvc --no-headers | awk '{print "claim", $1, $2, "->", $3, $5}'

echo "### Task 12"
kubectl create deployment broken --image=busybox:1.37-typo -- sleep 3600 > /dev/null
sleep 8
kubectl get pods -l app=broken --no-headers | awk '{print "before:", $3}'
kubectl set image deployment/broken busybox=busybox:1.37 > /dev/null
kubectl rollout status deployment/broken --timeout=90s | tail -1

echo "### Task 13"
kubectl explain pod.spec.containers.livenessProbe.initialDelaySeconds 2>&1 | sed -n '1,9p' | grep -E "FIELD|DESCRIPTION|Number of seconds" | cut -c1-100

echo "### Task 14"
cat > multi.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: multi}
spec:
  containers:
  - {name: app, image: busybox:1.37, command: ["sleep", "3600"]}
  - {name: sidecar, image: busybox:1.37, command: ["sh", "-c", "while true; do echo log line; sleep 2; done"]}
EOF
kubectl apply -f multi.yaml > /dev/null
kubectl wait --for=condition=Ready pod/multi --timeout=60s > /dev/null
sleep 3
kubectl logs multi -c sidecar | head -2
kubectl get pod multi -o jsonpath='containers: {.spec.containers[*].name}{"\n"}'
sudo rm -rf /tmp/lab-pv; kubectl delete pvc exam-pvc > /dev/null; kubectl delete pv exam-pv > /dev/null
```

Task 13's answer: the field is **`initialDelaySeconds`**, and the explain output states its meaning (seconds after the container starts before probes begin) and that the default is 0.

Task 15 solution (Example, not run here; on a kubeadm control plane node):

```term
$ sudo ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt \
      --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key snapshot save /backup/etcd.db
$ sudo etcdutl snapshot status /backup/etcd.db -w table                                  # verify the snapshot
$ sudo apt-get update && sudo apt-get install -y kubeadm=1.35.2-1.1                      # the next minor version
$ sudo kubeadm upgrade plan && sudo kubeadm upgrade apply v1.35.2
$ kubectl drain NODE --ignore-daemonsets
$ sudo apt-get install -y kubelet=1.35.2-1.1 kubectl=1.35.2-1.1 && sudo systemctl daemon-reload && sudo systemctl restart kubelet
$ kubectl uncordon NODE
```

## 5. Your score, and how to use it

Score each task **0** (could not do), **half** (did it, but slowly or with docs for basic syntax), **full** (correct, fast, verified). The tasks you scored below full show your study list, and **the time you spent** shows whether you would finish an exam. Repeat the whole set after two days with a stopwatch; the second pass should take about half the time. The deeper the reading of the actual exam handbook, the fewer surprises on the day: read the candidate handbook, the allowed resources list and the system requirements before you book.

:::warn Common mistakes
- **Working in the wrong context or namespace.** Switch context first and always pass `-n`.
- **Hand-typing long YAML** instead of generating it with `--dry-run=client -o yaml`.
- **Skipping verification.** A wrong label or port costs the whole task.
- **Spending twenty minutes on one task.** Flag and return.
- **Memorising commands without understanding.** Troubleshooting tasks need reasoning; practise reading evidence.
- **Studying only with this lab.** It deliberately has no kubeadm, no enforcing CNI, no metrics server; practise those on a real cluster.
:::

:::recap
- The exam is a timed, hands-on test of five domains: Troubleshooting 30%, Cluster architecture 25%, Networking 20%, Workloads 15%, Storage 10% (curriculum v1.35).
- This course covers the knowledge for all five and real practice for most; **kubeadm, upgrades, HA, an enforcing CNI, metrics-server and Gateway/Ingress controllers need a real practice cluster**.
- Speed comes from aliases, generated YAML, `kubectl explain`, context switching, verification and time-boxing.
- Practise with a stopwatch, repeat the set, then take a full mock exam before booking.
:::

:::try Your turn
Invent five new tasks of your own (one per domain), write the solution for each **without notes**, then run them on the lab cluster and time yourself. Swap the hardest two with the task list above and repeat in two days.
:::

:::quiz
? What should you do first in every exam task?
+ Switch to the cluster context the task specifies
- Delete old resources
- Read the whole documentation
- Restart the cluster
! The right work in the wrong cluster earns nothing.
? Which command generates a Deployment manifest without creating it?
+ kubectl create deployment x --image=y --dry-run=client -o yaml
- kubectl get deployment x -o yaml
- kubectl explain deployment
- kubectl apply -f -
! Dry run plus yaml output produces the file to edit.
? Which part of the exam can this lab not fully prepare you for?
+ kubeadm cluster upgrades, enforced network policy and metrics-server behaviour, which need a real practice cluster
- Creating Deployments
- Reading logs
- Using kubectl explain
! Fill these gaps on a real kubeadm-based cluster.
:::
