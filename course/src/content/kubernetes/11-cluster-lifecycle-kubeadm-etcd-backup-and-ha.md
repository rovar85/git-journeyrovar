---
track: kubernetes
title: Cluster lifecycle: kubeadm, upgrades, certificates, etcd backup and high availability
short: Lifecycle, etcd, HA
sub: The administrator side of Kubernetes (CKA domain: cluster architecture, installation and configuration): how kubeadm builds and upgrades a cluster, how to back up and restore etcd for real, certificate expiry, and how a highly available control plane works.
---

:::goals
- describe how `kubeadm` creates, joins and upgrades a cluster, and the order of an upgrade
- take an etcd snapshot, lose an object, and restore it from the snapshot (for real)
- check certificate expiry and know how renewal works
- explain stacked and external etcd, quorum, and a highly available control plane
:::

:::note Where this fits, and what ran
This is the part of the **Certified Kubernetes Administrator (CKA)** curriculum (domain "Cluster Architecture, Installation and Configuration", 25% of the exam in the v1.35 curriculum I read) that a user of Kubernetes does not meet daily. The lab cluster was **built by hand**, component by component (Lesson 1), not with kubeadm, so the **etcd snapshot and restore are real** here but the **kubeadm commands are Example, not run here**: they need real machines with the kubeadm packages. Where a kubeadm cluster differs from the lab (certificate paths, static Pod manifests) the text says so.
:::

```setup
export LABNS=labcka
```

@setup k8s

## 1. What kubeadm does

**kubeadm** is the standard tool for creating a Kubernetes cluster on machines you prepared. It does **not** install the machines' operating system, container runtime or networking: **you** prepare nodes first (a supported Linux, a container runtime such as containerd, swap off, required kernel modules and sysctls, open ports, and the kubeadm, kubelet and kubectl packages). Then:

```term
# Example, not run here. On the first control-plane node:
$ sudo kubeadm init --pod-network-cidr=10.244.0.0/16 --control-plane-endpoint "k8s-api.example.com:6443"
# kubeadm generates certificates, writes static Pod manifests for the control plane, starts the kubelet, installs
# CoreDNS and kube-proxy, and prints a join command.
$ mkdir -p $HOME/.kube && sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
$ kubectl apply -f <your CNI plugin manifest>      # Pods cannot talk across nodes until a network plugin is installed
# On each worker:
$ sudo kubeadm join k8s-api.example.com:6443 --token abcdef.0123456789abcdef --discovery-token-ca-cert-hash sha256:<hash>
# A lost join command can be regenerated on a control-plane node:
$ kubeadm token create --print-join-command
```

What kubeadm leaves on disk is worth knowing, because the exam and real incidents both involve these files:

| Path | Contents |
|---|---|
| `/etc/kubernetes/manifests/` | **static Pod** manifests for `kube-apiserver`, `kube-controller-manager`, `kube-scheduler` and `etcd`. The kubelet runs them directly; editing a file restarts that component |
| `/etc/kubernetes/pki/` | the cluster CA, API server certificates, etcd certificates (`pki/etcd/`), service account keys |
| `/etc/kubernetes/*.conf` | kubeconfig files for the admin, controller manager, scheduler and kubelet |
| `/var/lib/kubelet/` | kubelet configuration and state |
| `/var/lib/etcd/` | the etcd data directory |

The control plane components are **Pods managed by the kubelet** (hence "static"): if the API server is broken you fix it by editing its manifest on the node, not with `kubectl`.

## 2. Upgrading a cluster

Kubernetes releases a **minor version** (1.34, 1.35, ...) about three times a year, and each is supported for a limited period, so upgrades are routine work. The rules:

- Upgrade **one minor version at a time** (1.34 to 1.35, never 1.34 to 1.36).
- Upgrade the **control plane first**, then the workers. Workers may lag the control plane by a few minor versions, but never be newer than the API server.
- The order inside each node is: **upgrade the kubeadm package, run the kubeadm upgrade, drain the node, upgrade the kubelet and kubectl packages, restart the kubelet, uncordon**.

```term
# Example, not run here. First control-plane node (package commands differ by distribution):
$ sudo apt-get update && sudo apt-get install -y kubeadm=1.35.2-1.1      # 1. new kubeadm
$ sudo kubeadm upgrade plan                                              # 2. what is available and what will change
$ sudo kubeadm upgrade apply v1.35.2                                     # 3. upgrade the control plane components
$ kubectl drain cp1 --ignore-daemonsets                                  # 4. evict workloads, mark unschedulable
$ sudo apt-get install -y kubelet=1.35.2-1.1 kubectl=1.35.2-1.1          # 5. new kubelet and kubectl
$ sudo systemctl daemon-reload && sudo systemctl restart kubelet         # 6.
$ kubectl uncordon cp1                                                   # 7. schedulable again
# Other control-plane nodes use "kubeadm upgrade node" instead of "apply". Workers: upgrade kubeadm,
# "sudo kubeadm upgrade node", drain from a machine with kubectl, upgrade kubelet, restart, uncordon.
```

`drain` evicts the Pods (respecting **PodDisruptionBudgets**, Lesson 7) so they reschedule elsewhere, which is why applications need **more than one replica** to survive node maintenance. Always **back up etcd before an upgrade** (next section).

## 3. etcd: the cluster's memory, and how to back it up

Everything the cluster knows (every Pod, Secret, ConfigMap, RBAC rule) lives in **etcd**, a consistent key-value store. Lose etcd and you lose the cluster's state (running containers keep running, but nothing can be managed). The backup tool is `etcdctl snapshot save`; the restore creates a **new data directory** from the snapshot.

The lab's etcd listens on plain HTTP on loopback. First a ConfigMap that we cannot afford to lose, then a snapshot:

```run
mkdir -p ~/lab/cka && cd ~/lab/cka
kubectl create configmap precious --from-literal=answer=42 > /dev/null
export ETCDCTL_API=3
etcdctl --endpoints=http://127.0.0.1:2379 snapshot save snap.db 2>&1 | grep -E "Snapshot saved"
etcdctl snapshot status snap.db -w table 2>/dev/null
```

The status table shows the snapshot's **revision** (etcd's logical clock) and **total keys**. Now cause the disaster, then prove the object is gone from the live cluster:

```run
cd ~/lab/cka
kubectl delete configmap precious
kubectl get configmap precious 2>&1 | head -1
```

Restore the snapshot into a **fresh data directory** and start a **second, temporary etcd** on different ports, so the live cluster is untouched. Then read the key straight from etcd (Kubernetes stores objects under `/registry/...`; the value is binary, so `strings` extracts the text):

```run
cd ~/lab/cka
export ETCDCTL_API=3
rm -rf restored
etcdctl snapshot restore snap.db --data-dir restored > /dev/null 2>&1
etcd --data-dir restored --listen-client-urls http://127.0.0.1:22379 --advertise-client-urls http://127.0.0.1:22379 \
     --listen-peer-urls http://127.0.0.1:22380 --initial-advertise-peer-urls http://127.0.0.1:22380 \
     --initial-cluster default=http://127.0.0.1:22380 > etcd-restored.log 2>&1 &
echo $! > etcd-restored.pid
sleep 4
echo "--- in the RESTORED etcd:"
etcdctl --endpoints=http://127.0.0.1:22379 get /registry/configmaps/$LABNS/precious --print-value-only | strings | grep -E "answer|42" | head -3
echo "--- in the LIVE etcd (the object was deleted):"
etcdctl --endpoints=http://127.0.0.1:2379 get /registry/configmaps/$LABNS/precious --print-value-only | strings | grep -cE "answer|42" | sed 's/^/matching lines: /'
kill $(cat etcd-restored.pid)
```

The deleted ConfigMap is **back in the restored copy** and absent in the live store. That is the whole mechanism of a backup.

On a **real kubeadm cluster** the same commands need **TLS flags**, because etcd only accepts clients with certificates, and the **restore is followed by pointing etcd at the new directory** (Example, not run here; this is a classic exam task):

```term
$ sudo ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
      --cacert=/etc/kubernetes/pki/etcd/ca.crt \
      --cert=/etc/kubernetes/pki/etcd/server.crt \
      --key=/etc/kubernetes/pki/etcd/server.key \
      snapshot save /backup/etcd-$(date +%F).db
# Restore (on a control-plane node):
$ sudo etcdutl snapshot restore /backup/etcd-2026-10-07.db --data-dir /var/lib/etcd-restored
# (older etcd versions: etcdctl snapshot restore ...)
# Then edit /etc/kubernetes/manifests/etcd.yaml and change the hostPath of the data volume
# from /var/lib/etcd to /var/lib/etcd-restored. The kubelet restarts etcd on its own.
```

Practical rules: take snapshots **on a schedule** and **before every upgrade**, copy them **off the node**, **encrypt** them (they contain every Secret, base64-encoded but not encrypted unless encryption at rest is enabled), and **rehearse a restore** regularly. An untested backup is a hope.

## 4. Certificates expire

Kubernetes components authenticate to each other with **TLS certificates** signed by the cluster CA. kubeadm-issued certificates are valid for **one year** (the CA itself for ten); they are **renewed automatically during a kubeadm upgrade**, but a cluster that is never upgraded will **suddenly stop working** when they lapse. Check them:

```term
# Example, not run here (kubeadm cluster):
$ sudo kubeadm certs check-expiration
$ sudo kubeadm certs renew all           # then restart the control plane static Pods
```

The same check works on any certificate with `openssl`, which you can run on the lab's API server certificate:

```run
openssl x509 -in /opt/k8s/pki/apiserver.crt -noout -subject -enddate 2>/dev/null | sed 's/^/   /'
echo "(subtract today's date from notAfter to get the days remaining; the lab certificate lasts a year, like kubeadm's)"
```

Monitor expiry (Prometheus has certificate exporters, and the `apiserver_client_certificate_expiration_seconds` metric), alert at 30 and 7 days, and renew on a calendar, not in an outage.

## 5. High availability

One control-plane node is a **single point of failure**. A highly available (HA) cluster runs **several control-plane nodes** behind a **load balancer** that gives clients a single stable API address (the `--control-plane-endpoint` above). Two layouts:

| Layout | etcd | Trade-off |
|---|---|---|
| **Stacked etcd** | each control-plane node runs an etcd member next to its API server | simpler, fewer machines; losing a node loses both an API server and an etcd member |
| **External etcd** | etcd runs on its **own** machines | more machines to manage, independent failure domains |

etcd uses **consensus (Raft)**: a change is committed when a **majority (quorum)** of members agree. That makes the member count matter:

```run
python3 - <<'EOF'
print(f"{'members':>8} {'quorum':>7} {'failures tolerated':>19}")
for n in range(1, 8):
    quorum = n // 2 + 1
    print(f"{n:8d} {quorum:7d} {n - quorum:19d}")
EOF
```

Use an **odd** number (3 or 5): 4 members tolerate no more failures than 3 and add more things to break. If quorum is lost, the cluster becomes **read-only or unavailable** until members return or a restore from snapshot is done. Spread control-plane nodes across **failure domains** (racks or availability zones). Worker nodes need no special HA setup: replicas of your Deployments across nodes are the HA for applications.

:::warn Common mistakes
- **Never testing the etcd restore.** The first time you try should not be during an outage.
- **Taking a snapshot of a restored-over cluster and trusting it** without checking `snapshot status`.
- **Upgrading across two minor versions at once**, or workers before the control plane.
- **Letting certificates expire** because nothing monitors them and the cluster was never upgraded.
- **Even numbers of etcd members** and all of them in one rack or zone.
- **Forgetting the CNI plugin** after `kubeadm init` (nodes stay NotReady, CoreDNS Pending).
- **Editing a static Pod manifest and breaking its YAML**, which takes the component down; keep a copy and watch `crictl ps` and the kubelet log.
:::

:::recap
- kubeadm builds clusters on prepared nodes: `init`, install a CNI plugin, `join`; the control plane runs as **static Pods** from `/etc/kubernetes/manifests`.
- Upgrade **one minor version at a time**, control plane first: kubeadm, `upgrade plan/apply` (or `upgrade node`), drain, kubelet, restart, uncordon.
- **Back up etcd** with `etcdctl snapshot save` (with TLS flags on kubeadm clusters), restore into a new data directory, and point etcd at it. You did it for real above.
- Certificates last a year; check with `kubeadm certs check-expiration`.
- HA = several control-plane nodes behind a load balancer and an **odd** number of etcd members for quorum.
:::

:::try Your turn
Create a second ConfigMap `precious2`, take a new snapshot `snap2.db`, and run `etcdctl snapshot status snap2.db`: how did the revision and total keys change compared with `snap.db`? Then write the exact upgrade checklist for a three-node cluster (one control plane, two workers) from 1.34 to 1.35 in the order you would run it.
:::

:::quiz
? What does `etcdctl snapshot restore` create?
+ A new etcd data directory built from the snapshot
- A new Kubernetes cluster
- A backup of the API server
- A running etcd member
! You then point etcd at that directory.
? Why use an odd number of etcd members?
+ A majority is needed; an even number tolerates no more failures than the odd number below it
- Even numbers are unsupported by etcd
- Odd numbers are faster
- Kubernetes requires three exactly
! Quorum is floor(n/2)+1.
? What is the safe order for a kubeadm upgrade?
+ Control plane first, one minor version at a time, each node: kubeadm, upgrade, drain, kubelet, restart, uncordon
- Workers first
- Skip two versions to save time
- Restart the API server only
! Version skew rules forbid newer workers than the API server.
:::
