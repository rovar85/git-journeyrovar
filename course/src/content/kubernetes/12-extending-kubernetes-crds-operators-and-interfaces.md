---
track: kubernetes
title: Extending Kubernetes: CRDs, operators and the CNI, CSI and CRI interfaces
short: CRDs and operators
sub: How Kubernetes is extended without changing its code: define your own resource types, add a controller (an operator) that reconciles them, and understand the pluggable networking, storage and runtime interfaces.
---

:::goals
- explain custom resources, CRDs, controllers and operators
- create a CRD with validation and use custom resources like built-in ones
- build and run a miniature operator that reconciles custom resources into real objects
- explain CNI, CSI and CRI and what each plugs in
:::

:::note What ran
Everything with `kubectl` below runs on the real lab cluster, including the CRD validation, the status subresource and the automatic clean-up of owned objects. The operator is a **small Python script** I wrote to show the idea; real operators are written with frameworks (Kubebuilder, Operator SDK, Kopf and others, from my knowledge) and run as Deployments inside the cluster. Named operators are described from my own knowledge. This lesson covers CKA curriculum items "understand CRDs, install and configure operators" and "understand extension interfaces (CNI, CSI, CRI)".
:::

```setup
export LABNS=labcrd
```

@setup k8s

## 1. The idea: Kubernetes as a platform for APIs

Kubernetes has a uniform pattern: **resources** (Pod, Deployment, Service) stored in the API server, and **controllers** that watch them and make reality match (the reconcile loop from the GitOps lesson). You can **add your own resource types** to the same API:

| Term | Meaning |
|---|---|
| **CRD** (CustomResourceDefinition) | a resource that **defines a new resource type**: its name, scope, fields and validation |
| **Custom resource (CR)** | an **instance** of that type, handled by the API server exactly like a built-in object: `kubectl get`, `apply`, RBAC, `-o yaml`, watches |
| **Controller** | a program that watches resources and acts to make the real world match their `spec`, reporting in `status` |
| **Operator** | a controller **that encodes operational knowledge** for a specific application (install, upgrade, back up, fail over a database), driven by a CRD |

A CRD alone **stores data**; it does **nothing** until a controller acts on it. That is the single most important thing to remember about CRDs.

## 2. A CRD with validation

Define an `EvArchive` resource for the Enterprise Vault world (a retention archive with a tier and a retention period). The OpenAPI schema makes the API server **reject invalid objects** before any controller sees them:

```run
mkdir -p ~/lab/crd && cd ~/lab/crd
cat > crd.yaml <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: evarchives.ev.example.com          # must be <plural>.<group>
spec:
  group: ev.example.com
  scope: Namespaced
  names: {kind: EvArchive, plural: evarchives, singular: evarchive, shortNames: [eva]}
  versions:
  - name: v1
    served: true
    storage: true
    subresources: {status: {}}              # lets controllers update .status separately from .spec
    additionalPrinterColumns:
    - {name: Tier, type: string, jsonPath: .spec.tier}
    - {name: Retention, type: integer, jsonPath: .spec.retentionDays}
    - {name: Phase, type: string, jsonPath: .status.phase}
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            required: [tier, retentionDays]
            properties:
              tier: {type: string, enum: [hot, cold]}
              retentionDays: {type: integer, minimum: 1, maximum: 3650}
          status:
            type: object
            properties:
              phase: {type: string}
              message: {type: string}
EOF
kubectl apply -f crd.yaml
kubectl wait --for=condition=Established crd/evarchives.ev.example.com --timeout=30s
kubectl api-resources --api-group=ev.example.com
```

The cluster now knows a new kind. Create valid and invalid instances:

```run
cd ~/lab/crd
cat > good.yaml <<'EOF'
apiVersion: ev.example.com/v1
kind: EvArchive
metadata: {name: finance-2026}
spec: {tier: hot, retentionDays: 365}
EOF
cat > bad.yaml <<'EOF'
apiVersion: ev.example.com/v1
kind: EvArchive
metadata: {name: broken}
spec: {tier: lukewarm, retentionDays: 0}
EOF
kubectl apply -f good.yaml
echo "--- an invalid object is refused by the API server itself:"
kubectl apply -f bad.yaml 2>&1 | sed -E 's/^The EvArchive "broken" is invalid: //' | head -3
kubectl get eva
kubectl explain evarchive.spec.tier | head -6
```

All the built-in tools work on the new type: `get` (with the printer columns the CRD defined), `describe`, `explain`, `-o yaml`, RBAC (a Role can grant `evarchives` access), namespaces, labels, `watch`. Removing the CRD **deletes all its custom resources**, so treat CRD deletion as dangerous.

## 3. A miniature operator

The CR currently does nothing. An operator closes the loop: for each `EvArchive` it makes sure a ConfigMap with the archive's policy exists (standing in for "provision the real thing"), sets the CR's **status**, and links the ConfigMap to the CR with an **owner reference** so Kubernetes **garbage-collects** it automatically when the CR is deleted.

```run
cd ~/lab/crd
cat > evoperator.py <<'EOF'
import json, subprocess

def kubectl(*args, input=None):
    return subprocess.run(["kubectl", *args], capture_output=True, text=True, input=input)

def reconcile_once():
    items = json.loads(kubectl("get", "evarchives", "-o", "json").stdout)["items"]
    for cr in items:
        name, uid = cr["metadata"]["name"], cr["metadata"]["uid"]
        spec = cr["spec"]
        desired = {                                   # the object the operator is responsible for
            "apiVersion": "v1", "kind": "ConfigMap",
            "metadata": {"name": f"policy-{name}",
                         "ownerReferences": [{"apiVersion": "ev.example.com/v1", "kind": "EvArchive", "name": name, "uid": uid,
                                              "controller": True, "blockOwnerDeletion": True}]},
            "data": {"tier": spec["tier"], "retention": f"{spec['retentionDays']}d"},
        }
        kubectl("apply", "-f", "-", input=json.dumps(desired))
        status = {"status": {"phase": "Ready", "message": f"policy {spec['tier']}/{spec['retentionDays']}d provisioned"}}
        kubectl("patch", "evarchive", name, "--subresource=status", "--type=merge", "-p", json.dumps(status))
        print(f"reconciled {name}: ConfigMap policy-{name} ensured, status set to Ready")

reconcile_once()
EOF
python3 evoperator.py
kubectl get eva
kubectl get cm policy-finance-2026 -o jsonpath='{.data}{"\n"}'
```

Now the loop in action. **Change the CR's spec**, reconcile again, then **delete the CR** and watch Kubernetes remove the ConfigMap without any operator code:

```run
cd ~/lab/crd
kubectl patch evarchive finance-2026 --type=merge -p '{"spec":{"tier":"cold","retentionDays":2555}}' > /dev/null
python3 evoperator.py
kubectl get cm policy-finance-2026 -o jsonpath='after the spec change the ConfigMap says: {.data}{"\n"}'
kubectl delete evarchive finance-2026 > /dev/null
sleep 5
kubectl get cm policy-finance-2026 2>&1 | head -1
```

That is the pattern behind every operator: **watch custom resources, make the world match, write status, own what you create**. Real operators differ in three ways: they **watch events** (instead of running once), run **in the cluster** as a Deployment with RBAC, and manage **finalizers** (so a CR is not deleted until the operator has cleaned up external resources such as a cloud disk).

Real operators you will meet (from my knowledge): the **Prometheus Operator** (`ServiceMonitor`, `PrometheusRule`), **cert-manager** (`Certificate`, `Issuer`), database operators (PostgreSQL, MySQL, Kafka clusters from Strimzi), and the **KEDA** `ScaledObject` and Argo CD `Application` objects from the AI infrastructure track, which are CRDs too. Installing an operator is usually a **Helm chart or a Kustomize overlay** (Lesson 10) that creates the CRDs, the operator Deployment and its RBAC. For the CKA, be able to `kubectl get crd`, read a CR with `kubectl explain`, and create CRs from a given CRD.

## 4. The three interfaces: CNI, CSI, CRI

Kubernetes does not implement networking, storage or container execution itself. It defines **interfaces**, and plugins implement them:

| Interface | Full name | What plugs in | Examples (from my knowledge) | Lab |
|---|---|---|---|---|
| **CRI** | Container Runtime Interface | the container runtime the **kubelet** talks to (a gRPC API) | containerd, CRI-O | the lab uses containerd |
| **CNI** | Container Network Interface | the plugin that gives each Pod an IP and connects it to the cluster network; may also **enforce NetworkPolicy** | Calico, Cilium, Flannel, Weave | the lab uses simple CNI bridge networking |
| **CSI** | Container Storage Interface | storage drivers that **provision and attach volumes** (the Storage lesson's StorageClass names a CSI provisioner) | cloud disk drivers, Ceph, NFS | none in the lab; PVs are `hostPath` |

```run
kubectl get node -o jsonpath='container runtime (CRI): {.items[0].status.nodeInfo.containerRuntimeVersion}{"\n"}'
kubectl get node -o jsonpath='kubelet: {.items[0].status.nodeInfo.kubeletVersion}   OS: {.items[0].status.nodeInfo.osImage}{"\n"}'
kubectl get csidrivers 2>&1 | head -2
```

Why this matters to an administrator: **a Pod stuck in `ContainerCreating` is often a CNI or CSI problem** (no network plugin installed, a volume that cannot attach); **a node that is `NotReady` is often CRI** (the runtime is down). That is exactly where the Troubleshooting lesson looks first. Choosing a CNI is also choosing whether **NetworkPolicy is enforced** (the next lessons test this).

:::warn Common mistakes
- **Creating a CRD and expecting something to happen.** Without a controller it only stores data.
- **Deleting a CRD casually.** All its custom resources vanish with it.
- **No schema validation**, so typos reach the controller and fail in confusing ways.
- **Controllers that are not idempotent.** A reconcile can run many times; it must produce the same result each time.
- **Forgetting owner references or finalizers**, leaving orphaned objects or leaking external resources.
- **Installing operators from unknown sources.** An operator holds cluster RBAC permissions; review what the CRDs and ClusterRoles allow.
:::

:::recap
- A **CRD** adds a resource type; a **custom resource** is an instance; a **controller** reconciles it; an **operator** is a controller with application-specific operational knowledge.
- CRD schemas validate input at the API server; `status` is a subresource written by the controller; owner references give automatic garbage collection.
- **CRI** (runtime), **CNI** (pod networking), **CSI** (storage) are the pluggable interfaces; many Pod and node problems trace back to them.
- For the CKA: list and read CRDs, create CRs, install an operator with Helm or Kustomize, and know the three interfaces.
:::

:::try Your turn
Add a `replicas` field (integer, 1 to 5) to the CRD schema, apply the updated CRD, and extend `evoperator.py` to write the value into the ConfigMap. Then try creating an `EvArchive` with `replicas: 9` and read the exact error message.
:::

:::quiz
? What does a CRD do on its own, with no controller?
+ Adds a new resource type to the API that stores objects; nothing acts on them
- Creates Pods automatically
- Installs an operator
- Changes the scheduler
! Controllers do the reconciling.
? Why set an owner reference on objects an operator creates?
+ So Kubernetes garbage-collects them when the owner custom resource is deleted
- To make them faster
- To hide them from kubectl
- Because CRDs forbid unowned objects
! Garbage collection follows ownership.
? Which interface does the kubelet use to start containers?
+ CRI, the container runtime interface
- CNI
- CSI
- CRD
! containerd or CRI-O implement it.
:::
