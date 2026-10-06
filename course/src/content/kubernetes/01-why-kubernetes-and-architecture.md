---
track: kubernetes
title: Why Kubernetes, and how a cluster is built
short: Architecture
sub: What problem Kubernetes solves, and the parts of a cluster you will meet every day.
---

:::goals
- explain what an orchestrator does that Docker alone does not
- name the control plane and node components and what each does
- explain the declarative model and the reconciliation loop
- use `kubectl` to look around a real cluster
:::

## The problem

With Docker on one machine you can run a few containers. At real scale new questions appear:

- Which of my 50 machines should run this container?
- A machine died at 3 am. Who restarts its containers elsewhere?
- How do I ship version 2 without downtime, and roll back if it is bad?
- How do containers on different machines find each other?
- How do I add more copies when traffic grows?
- Where do configuration and secrets live, and who may change what?

**Kubernetes** (K8s; "K" + 8 letters + "s") is an **orchestrator** that answers these. You tell it the **desired state** ("run 3 copies of this image, reachable on port 80"), and it continuously works to make reality match, restarting, rescheduling and scaling as needed.

## Declarative and reconciling

You do not tell Kubernetes "start a container". You **declare** objects (in YAML) describing what you want, and store them in the cluster. **Controllers** are loops that compare *desired state* with *actual state* and act on the difference:

1. You say: `replicas: 3`.
2. The controller sees only 2 running. It creates one more.
3. A node dies, so one drops. The controller notices and creates another elsewhere.

This **reconciliation loop** is the heart of Kubernetes. It is the same idea as Terraform's plan/apply and Ansible's desired state, but running continuously.

## The parts of a cluster

A cluster has a **control plane** (the brain) and **worker nodes** (the muscle).

| Component | Where | Job |
|---|---|---|
| **kube-apiserver** | control plane | the front door: every tool (and every other component) talks to the cluster through this REST API. Authenticates, authorises, validates, stores |
| **etcd** | control plane | the cluster's database: a consistent key-value store holding all objects. Back it up! |
| **kube-scheduler** | control plane | picks a node for each new Pod (considering resources, rules, taints) |
| **kube-controller-manager** | control plane | runs the controllers (Deployment, ReplicaSet, Node, Job, ...) |
| **cloud-controller-manager** | control plane (cloud only) | talks to the cloud API (load balancers, disks, nodes) |
| **kubelet** | every node | the node agent: makes sure the Pods assigned to its node are running and healthy, reports status |
| **container runtime** | every node | actually runs containers (containerd or CRI-O). Docker Engine is not needed |
| **kube-proxy** | every node | implements Services: network rules that send traffic for a Service address to its Pods |
| **CNI plugin** | every node | gives Pods IP addresses and connects them (Calico, Cilium, Flannel...) |
| **CoreDNS** | in the cluster | DNS names for Services |

Managed services (**EKS** on AWS, **AKS** on Azure, **GKE** on Google) run the control plane for you; you manage worker nodes (or even none, in serverless modes).

## Look at a real cluster

The course lab runs a small real single-node cluster (control plane and node on one machine) so every command in this track is real. A single-node cluster is unusual for production but identical in behaviour.

```setup
mkdir -p ~/.kube && cp /opt/k8s/pki/admin.kubeconfig ~/.kube/config && chmod 600 ~/.kube/config
true
```

```run
kubectl version | grep -E "Client|Server"
kubectl get nodes -o custom-columns=NAME:.metadata.name,STATUS:.status.conditions[-1].type,VERSION:.status.nodeInfo.kubeletVersion
kubectl get --raw=/readyz
```

`kubectl` is the command line client: it reads a **kubeconfig** (`~/.kube/config`) that says which cluster, which user, and which namespace. It then calls the API server.

```run
kubectl config view --minify -o jsonpath='cluster={.clusters[0].name} user={.users[0].name}{"\n"}'
kubectl describe node lab-node | grep -E "^Name:|Roles|Capacity|Allocatable|Container Runtime|Kubelet Version|Operating System" | sed 's/  */ /g'
```

The system components also run, some as Pods in the `kube-system` namespace:

```run
kubectl get pods -n kube-system -o custom-columns=APP:.metadata.labels.k8s-app,STATUS:.status.phase
kubectl get namespaces -o custom-columns=NAME:.metadata.name,STATUS:.status.phase
```

In this lab, the control plane processes run directly on the machine (like a `kubeadm`-less install) so they do not show as Pods. On a kubeadm cluster you would see `etcd`, `kube-apiserver`, `kube-scheduler` and `kube-controller-manager` as "static Pods" here as well.

## Everything is an API object

`kubectl api-resources` lists every kind of object the cluster understands:

```run
kubectl api-resources --no-headers | awk '{print $1}' | grep -E "^(pods|services|deployments|replicasets|configmaps|secrets|namespaces|nodes|persistentvolumeclaims|ingresses|jobs|cronjobs|statefulsets|daemonsets)$" | sort | tr '\n' ' '; echo
kubectl explain pod.spec.containers.image | head -6
```

`kubectl explain` is built-in documentation for any field. You will use it a lot. Every object has the same top-level shape:

```yaml:shape.yaml
apiVersion: apps/v1        # which API group and version
kind: Deployment           # what type of object
metadata:                  # identity
  name: web
  namespace: default
  labels: {app: web}
spec:                      # the DESIRED state (you write this)
  replicas: 3
status: {}                 # the ACTUAL state (Kubernetes writes this)
```

**spec** is what you want; **status** is what is true. Controllers close the gap between them.

## Objects you will learn

| Object | Purpose | Lesson |
|---|---|---|
| **Pod** | one or more containers that run together | 2 |
| **Deployment** / ReplicaSet | keep N Pods running; rolling updates | 3 |
| **Service** | a stable address for a set of Pods | 4 |
| **ConfigMap** / **Secret** | configuration and sensitive data | 5 |
| **Volume**, PV, PVC | storage | 6 |
| Requests/limits, probes, scheduling | resource control and health | 7 |
| **Namespace**, RBAC, security | multi-tenancy and access control | 8 |
| Troubleshooting | finding what is wrong | 9 |
| Jobs, DaemonSets, StatefulSets, Helm | the rest of the toolbox | 10 |

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- Kubernetes keeps declared desired state true, through controllers running reconciliation loops.
- Control plane: apiserver, etcd, scheduler, controller-manager. Node: kubelet, runtime, kube-proxy, CNI.
- Everything is an API object with `apiVersion`, `kind`, `metadata`, `spec` (desired) and `status` (actual).
- `kubectl` talks to the API server using a kubeconfig; `explain` and `api-resources` document the API.
:::

:::try Your turn
Use `kubectl explain deployment.spec.strategy` and write down the two strategy types. Which components would stop working if etcd were lost?
:::

:::quiz
? Which component stores all cluster state?
- kubelet
+ etcd
- kube-proxy
- CoreDNS
! Back up etcd; losing it loses the cluster's objects.
? What does the kubelet do?
+ Runs and monitors the Pods assigned to its node
- Schedules Pods onto nodes
- Stores objects
- Provides DNS
! The scheduler picks the node; the kubelet makes it happen there.
? What is the difference between spec and status?
+ spec is desired state you write; status is actual state Kubernetes reports
- They are identical
- status is for secrets
- spec is read-only
! Controllers reconcile status toward spec.
:::
