---
track: kubernetes
title: Namespaces, RBAC and security
short: RBAC, security
sub: Divide a cluster between teams, control who may do what, and harden Pods.
---

:::goals
- use namespaces and resource quotas to share a cluster
- explain authentication versus authorisation and write RBAC roles
- test permissions with `kubectl auth can-i`
- apply Pod security settings and Pod Security Admission
:::

## Namespaces

A **namespace** is a named partition of a cluster for objects like Pods, Services and Secrets. Teams or environments (`ev-test`, `ev-prod`) get their own, with their own quotas and permissions. Names only have to be unique **inside** a namespace. Some objects (Nodes, PersistentVolumes, Namespaces) are **cluster-scoped**.

```setup
export LABNS=lab8
```

@setup k8s

```run
kubectl create namespace team-a
kubectl create namespace team-b
kubectl -n team-a run web --image=nginx:1.27-alpine > /dev/null
kubectl -n team-b run web --image=nginx:1.27-alpine > /dev/null
kubectl get pods -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name --no-headers | grep -E "team-[ab]"
```

Two Pods named `web`, no clash. Use `-n NAMESPACE` or set a default (`kubectl config set-context --current --namespace=team-a`); `-A` means all namespaces.

## ResourceQuota: fair shares

A **ResourceQuota** limits what one namespace can consume, and a **LimitRange** sets defaults per container:

```run
cat > quota.yaml <<'EOF'
apiVersion: v1
kind: ResourceQuota
metadata: {name: small, namespace: team-a}
spec:
  hard:
    pods: "2"
    requests.cpu: "500m"
EOF
kubectl apply -f quota.yaml
small() { kubectl -n team-a run "$1" --image=busybox:1.37 --overrides='{"spec":{"containers":[{"name":"'$1'","image":"busybox:1.37","command":["sleep","3600"],"resources":{"requests":{"cpu":"100m"}}}]}}' 2>&1 | tail -1; }
small second
small third | grep -o "exceeded quota.*" | cut -c1-110
kubectl -n team-a get resourcequota small -o jsonpath='used pods={.status.used.pods} of {.status.hard.pods}{"\n"}'
```

The third Pod was **rejected** at creation because the namespace is already at its limit of 2 Pods. Quotas protect a shared cluster from one team using everything.

## Authentication and authorisation

Every request to the API server passes through:

1. **Authentication**: *who are you?* (client certificate, token, OIDC login via your company identity provider, ServiceAccount token)
2. **Authorisation**: *are you allowed to do this?* (almost always **RBAC**)
3. **Admission control**: *is this request acceptable?* (policies, quotas, Pod Security)

## RBAC: roles and bindings

**Role-Based Access Control** has four objects:

| Object | Meaning |
|---|---|
| **Role** | a set of permissions (verbs on resources) within **one namespace** |
| **ClusterRole** | the same, cluster-wide (or for cluster-scoped resources) |
| **RoleBinding** | grants a Role to a user, group or ServiceAccount in a namespace |
| **ClusterRoleBinding** | grants a ClusterRole across the whole cluster |

Rules are **additive** (there is no "deny"). Give the least privilege needed. Create a ServiceAccount (an identity for Pods or tools) that may only read Pods in `team-b`:

```run
kubectl -n team-b create serviceaccount viewer
kubectl -n team-b create role pod-reader --verb=get,list,watch --resource=pods
kubectl -n team-b create rolebinding viewer-reads-pods --role=pod-reader --serviceaccount=team-b:viewer
sa=system:serviceaccount:team-b:viewer
echo "can viewer list pods in team-b?      $(kubectl auth can-i list pods -n team-b --as=$sa)"
echo "can viewer delete pods in team-b?    $(kubectl auth can-i delete pods -n team-b --as=$sa)"
echo "can viewer list pods in team-a?      $(kubectl auth can-i list pods -n team-a --as=$sa)"
echo "can viewer read secrets in team-b?   $(kubectl auth can-i get secrets -n team-b --as=$sa)"
```

`kubectl auth can-i ... --as=SUBJECT` is the best RBAC debugging tool: it answers "can this identity do that?" without trying it. Only `list` on Pods in `team-b` is allowed. Run as the ServiceAccount for real:

```run
token=$(kubectl -n team-b create token viewer)
kubectl --token=$token get pods -n team-b --no-headers -o custom-columns=NAME:.metadata.name
kubectl --token=$token delete pod web -n team-b 2>&1 | cut -c1-110
```

The delete is **Forbidden**. The error message names the user, the verb and the resource, which is how you debug RBAC: read it, then grant exactly that verb.

:::warn Dangerous permissions
- `cluster-admin` (everything everywhere) should be rare and audited.
- `get/list secrets` reveals every password in the namespace.
- `create pods` can often be turned into gaining node access; `exec` into Pods reads their secrets.
- `*` wildcards and `ClusterRoleBinding` to groups like `system:authenticated` are red flags.
:::

## Securing Pods

By default a container may run as root, write to its filesystem and hold powerful Linux capabilities. A **securityContext** tightens that:

```run
cat > secure.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: hardened, namespace: team-b}
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    seccompProfile: {type: RuntimeDefault}
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "id; touch /x 2>&1 | head -1; sleep 3600"]
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities: {drop: ["ALL"]}
    resources:
      requests: {cpu: 50m}
EOF
kubectl apply -f secure.yaml > /dev/null
kubectl -n team-b wait --for=condition=Ready pod/hardened --timeout=60s > /dev/null
kubectl -n team-b logs hardened
```

Non-root user `10001`, read-only root filesystem, no privilege escalation, all capabilities dropped. This is the same hardening as in the Docker track, expressed in Pod YAML.

## Pod Security Admission

A namespace can **enforce** a **Pod Security Standard** automatically, rejecting unsafe Pods before they run: `privileged` (no restrictions), `baseline` (blocks the worst), `restricted` (hardened best practice).

```run
kubectl label namespace team-a pod-security.kubernetes.io/enforce=restricted > /dev/null
cat > priv.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: risky, namespace: team-a}
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sleep", "3600"]
    securityContext: {privileged: true}
EOF
kubectl apply -f priv.yaml 2>&1 | cut -c1-200
sed 's/team-b/team-a/' secure.yaml | kubectl apply --dry-run=server -f - 2>&1 | tail -1 | cut -c1-120
```

The privileged Pod is refused with a list of violations, while the hardened Pod from before would be accepted (the second command is a server-side dry run). Using such admission policies (and tools like **Kyverno** or **OPA Gatekeeper**) turns your security rules into automatic guard rails.

## More cluster security to know

| Area | Practice |
|---|---|
| Images | small bases, scan (Trivy), sign, pull from trusted registries, pin digests |
| Network | NetworkPolicies, default deny between namespaces, mTLS (service mesh) |
| Secrets | RBAC, etcd encryption, external secret manager |
| Nodes | minimal OS, patching, no SSH for apps, restrict the kubelet API |
| API server | no anonymous access, short-lived credentials, audit logs enabled |
| Supply chain | pipeline scanning, admission checks, SBOMs |

```run
kubectl delete namespace team-a team-b --wait=false > /dev/null
```

:::recap
- Namespaces partition a cluster; ResourceQuota and LimitRange share it fairly.
- Requests pass authentication, authorisation (RBAC) and admission.
- Role/ClusterRole = permissions; RoleBinding/ClusterRoleBinding = who gets them. Least privilege; test with `auth can-i --as`.
- `securityContext` hardens Pods; Pod Security Admission enforces standards per namespace.
:::

:::try Your turn
Create a Role that allows only `get` on ConfigMaps in one namespace, bind it to a new ServiceAccount, and prove with `can-i` that the ServiceAccount cannot read Secrets.
:::

:::quiz
? What does a RoleBinding do?
+ Grants the permissions in a Role to a user, group or ServiceAccount in a namespace
- Creates a Role
- Encrypts Secrets
- Starts a Pod
! The Role defines what; the binding defines who.
? Which command checks whether an identity may perform an action?
+ `kubectl auth can-i VERB RESOURCE --as=SUBJECT`
- `kubectl get permissions`
- `kubectl describe cluster`
- `kubectl whoami`
! No need to try the action.
? What does `readOnlyRootFilesystem: true` do?
+ Prevents the container writing to its root filesystem
- Makes volumes read-only
- Encrypts the disk
- Disables logs
! Use volumes for the few paths that must be writable.
:::
