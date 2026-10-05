---
track: kubernetes
title: Storage: volumes, PersistentVolumes and claims
short: Storage
sub: Keep data beyond a Pod's life: emptyDir, PersistentVolumes, PersistentVolumeClaims and StorageClasses.
---

:::goals
- explain why Pod storage is ephemeral by default
- use emptyDir for scratch space
- create a PersistentVolume and claim it with a PersistentVolumeClaim
- prove data survives a Pod restart
- explain StorageClasses and dynamic provisioning
:::

## The problem again

A container's filesystem disappears with the container, and Pods are replaced often. Databases and indexes (think EV indexes and SQL data) need storage that **outlives Pods**. Kubernetes separates two concerns:

| Object | Who manages it | Meaning |
|---|---|---|
| **PersistentVolume (PV)** | cluster admin or automatic provisioning | a piece of real storage (cloud disk, NFS share, local disk) |
| **PersistentVolumeClaim (PVC)** | the application developer | a request: "I need 1 GiB, read/write" |
| **StorageClass** | admin | a "type" of storage plus how to create it on demand (fast SSD, cheap HDD) |

The Pod mentions only the PVC, so the app does not care whether the disk is on AWS, Azure or NFS.

```setup
export LABNS=lab6
```

@setup k8s

## emptyDir: scratch space

An `emptyDir` is created empty when the Pod starts and deleted when the **Pod** is removed (it survives container restarts inside the Pod). Good for caches and sharing files between containers:

```run
cat > scratch.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: scratch
spec:
  volumes:
  - name: tmp
    emptyDir: {}
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "echo data > /tmp/work/file.txt; sleep 3600"]
    volumeMounts: [{name: tmp, mountPath: /tmp/work}]
EOF
kubectl apply -f scratch.yaml > /dev/null
kubectl wait --for=condition=Ready pod/scratch --timeout=60s > /dev/null
kubectl exec scratch -- cat /tmp/work/file.txt
kubectl delete pod scratch --wait=true > /dev/null
kubectl apply -f scratch.yaml > /dev/null
kubectl wait --for=condition=Ready pod/scratch --timeout=60s > /dev/null
kubectl exec scratch -- sh -c 'ls /tmp/work; echo "(same command wrote the file again: it is a brand new Pod)"'
```

## PersistentVolume and claim

In real clusters a StorageClass creates disks on demand. This lab has no cloud, so we play the administrator: create a PV backed by a folder on the node (`hostPath`, only suitable for single-node labs), then claim it.

```run
sudo mkdir -p /tmp/lab-pv/ev-data && sudo chmod 777 /tmp/lab-pv/ev-data
cat > storage.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: lab6-pv
spec:
  capacity: {storage: 1Gi}
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath: {path: /tmp/lab-pv/ev-data}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ev-data
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  resources:
    requests: {storage: 500Mi}
EOF
kubectl apply -f storage.yaml
for i in $(seq 1 20); do [ "$(kubectl get pvc ev-data -o jsonpath='{.status.phase}')" = "Bound" ] && break; sleep 1; done
kubectl get pvc ev-data -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,VOLUME:.spec.volumeName,CAPACITY:.status.capacity.storage
kubectl get pv lab6-pv -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,CLAIM:.spec.claimRef.name,RECLAIM:.spec.persistentVolumeReclaimPolicy
```

The claim asked for 500 MiB; Kubernetes **bound** it to the 1 GiB PV that satisfied the request (same class, compatible access mode, enough size). **Access modes**: `ReadWriteOnce` (one node can mount it read-write), `ReadOnlyMany`, `ReadWriteMany` (needs NFS or similar), `ReadWriteOncePod`.

## Use the claim; data outlives the Pod

```run
cat > db.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: db
spec:
  containers:
  - name: db
    image: busybox:1.37
    command: ["sh", "-c", "echo \"index entry written at $(date +%s)\" >> /data/index.db; cat /data/index.db | wc -l; sleep 3600"]
    volumeMounts: [{name: data, mountPath: /data}]
  volumes:
  - name: data
    persistentVolumeClaim: {claimName: ev-data}
EOF
kubectl apply -f db.yaml > /dev/null
kubectl wait --for=condition=Ready pod/db --timeout=60s > /dev/null
echo "lines in index after first Pod:"; kubectl logs db
kubectl delete pod db --wait=true > /dev/null
kubectl apply -f db.yaml > /dev/null
kubectl wait --for=condition=Ready pod/db --timeout=60s > /dev/null
echo "lines in index after a NEW Pod used the same claim:"; kubectl logs db
echo "the data really lives on the node at:"; ls /tmp/lab-pv/ev-data
```

The second Pod found the first Pod's data: the file lives on the PV, independent of any Pod. That is persistence.

## Reclaim policies

When the claim is deleted, the PV's `persistentVolumeReclaimPolicy` decides what happens: **Retain** (keep the data, admin cleans up), **Delete** (delete the underlying disk, the default for dynamic provisioning), **Recycle** (deprecated).

```run
kubectl delete pod db --wait=true > /dev/null
kubectl delete pvc ev-data --wait=true
kubectl get pv lab6-pv -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,RECLAIM:.spec.persistentVolumeReclaimPolicy
```

The PV is now `Released` (kept because of `Retain`), with the data still on disk and not reusable until an admin clears the old claim reference.

```run
kubectl delete pv lab6-pv > /dev/null
sudo rm -rf /tmp/lab-pv
```

## StorageClasses and dynamic provisioning

In real clusters you rarely create PVs. A **StorageClass** names a provisioner; when a PVC asks for that class, the cluster creates a disk automatically:

```yaml:pvc-dynamic.yaml (Example, not run here)
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: sql-data}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: gp3          # e.g. an AWS EBS class; "managed-csi" on AKS, "standard-rwo" on GKE
  resources:
    requests: {storage: 100Gi}
```

Storage drivers follow the **CSI** (Container Storage Interface) standard, so cloud and storage vendors plug in their own. Features such as **snapshots**, **expansion** and **topology** (a disk lives in one availability zone, so the Pod must run in the same zone) are CSI capabilities.

## StatefulSets: stable identity plus storage

Databases and clustered applications use a **StatefulSet** instead of a Deployment: Pods get stable names (`db-0`, `db-1`), start in order, and each gets its **own** PVC from `volumeClaimTemplates`. If `db-1` is rescheduled, it reattaches to **its** disk. Lesson 10 shows the objects.

:::warn Back up the data, not just the cluster
Kubernetes does not back up your data. Volume snapshots help, but you still need application-aware backups (SQL backups, EV backup tools) and tested restores. Tools such as **Velero** back up cluster objects and volumes.
:::

:::recap
- Container and Pod storage is ephemeral. `emptyDir` lives with the Pod.
- PV = storage, PVC = request, StorageClass = how to create it. The Pod references the PVC.
- Data on a PV survives Pods. Reclaim policy decides what happens when the claim goes away.
- StatefulSets give each Pod stable identity and its own volume. Always back up data.
:::

:::try Your turn
Change the claim to request `2Gi` (more than the PV offers) and describe what status the claim shows and why.
:::

:::quiz
? What does a PVC represent?
+ A request for storage by an application
- A physical disk
- A node
- A Service
! The cluster binds it to a suitable PV.
? Data on a bound PV after the Pod is deleted:
+ Stays, because the volume's lifetime is independent of the Pod
- Is deleted always
- Moves to etcd
- Is encrypted
! That is what persistence means.
? Why do databases use StatefulSets?
+ Stable Pod identity and per-Pod storage
- They are faster
- Deployments cannot use PVCs
- To avoid Services
! `db-0` keeps its own disk when rescheduled.
:::
