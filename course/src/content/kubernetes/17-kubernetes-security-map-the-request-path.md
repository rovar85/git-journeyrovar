---
track: kubernetes
title: "Kubernetes security as one map: follow a request from kubectl to detection"
short: Security map
sub: Security is layers. Follow one request through authentication, RBAC, admission, etcd, kubelet, runtime, container, network and detection, with real checks on the cluster and the long procedures worth drilling.
---

:::goals
- hold Kubernetes security on **one map**: every control sits on one hop of a request's path
- run real checks for **authentication, RBAC, admission (Pod Security and ValidatingAdmissionPolicy)**, **secrets in etcd**, **kubelet exposure** and **container hardening**
- know the **long procedures** to drill: etcd encryption at rest, audit logging, image-policy admission, kubelet hardening, and how to recover when the API server will not start
- know **which one to three documentation pages** to learn for each extra tool (Falco, Cilium, Istio, gVisor, AppArmor)
:::

:::note Provenance
Checks in sections 2 to 7 run on the **real lab cluster**. The lab is deliberately **insecure in places** (anonymous kubelet, plain-HTTP etcd, no audit log, no NetworkPolicy enforcement), which makes it good for **seeing the problems**; hardened configurations are shown as **Example, not run here**. Falco, Cilium, Istio, gVisor, AppArmor and audit logging cannot run in this lab. This lesson is a **map of topics** for security work and for security exams; it does not claim to cover every detail of any particular certification.
:::

```setup
export LABNS=labsec2
```

@setup k8s

## 1. The map

Security is built in **layers**: assume any one layer can fail, and put another behind it. Trace one request, from your keyboard to a running container and out to the network:

```
kubectl
  -> API server:  authentication (who?) -> authorization/RBAC (may they?) -> admission (is it acceptable?)
  -> etcd:        encryption at rest (and backups)
  -> kubelet:     authentication/authorization of the node agent
  -> container runtime
  -> container:   securityContext, seccomp, AppArmor, (gVisor/Kata sandbox)
  -> network:     NetworkPolicy, mTLS, TLS ingress
  -> detection:   audit logs, runtime detection (Falco), events
```

| Hop | Question it answers | Main controls |
|---|---|---|
| **kubectl and credentials** | Who is making the request? | client certificates, tokens, OIDC; protect kubeconfig files |
| **API server: authn → authz → admission** | Is the caller known, allowed, and is the object acceptable? | RBAC, service accounts, Pod Security admission, ValidatingAdmissionPolicy, Kyverno/OPA, image-policy webhook |
| **etcd** | Where is the state stored, and who can read it? | TLS and client auth, **encryption at rest**, backups, restricted network access |
| **kubelet** | Can anyone drive the node agent? | disable anonymous access, Webhook authn/authz, NodeRestriction, read-only port off |
| **Runtime and container** | What can the process do if it is compromised? | non-root, read-only filesystem, drop capabilities, **seccomp**, AppArmor, sandboxed runtimes (gVisor, Kata) |
| **Network** | Who can talk to whom, and is it encrypted? | NetworkPolicy default-deny, service-mesh mTLS, TLS on ingress |
| **Supply chain** | Is what we run what we built? | image scanning, signing, admission checks (see S8 in the scenarios track) |
| **Detection and response** | How do we notice and investigate? | audit logs, Falco rules, events, alerts |

Every topic you meet in Kubernetes security slots into one of those hops. If you cannot place something, ask "which hop is this protecting?".

## 2. Hop: authentication (who are you?)

The API server accepts **client certificates, bearer tokens (including service-account tokens), and OIDC identities**. There are **no "user objects"** in Kubernetes: a user is whatever the credential says.

```run
echo "--- who does the API server think I am?"
kubectl auth whoami
echo
echo "--- the cluster/user/context my kubectl is using (credentials hidden):"
kubectl config view --minify | sed 's/\(token: \).*/\1<hidden>/'
```

**What you see:** this lab user is `admin` in group `system:masters` (cluster-admin on everything). Treat such a credential like a root password: **never share it, never embed it in images or repositories, prefer short-lived tokens**. Anonymous requests are denied by default in a well-configured API server.

## 3. Hop: authorization with RBAC (may you?)

RBAC is **additive** (there are only allow rules): a **Role** (namespaced) or **ClusterRole** lists verbs on resources; a **RoleBinding** or **ClusterRoleBinding** attaches it to users, groups or service accounts. Check the result from the outside with `kubectl auth can-i`.

```run
kubectl create serviceaccount reader > /dev/null
kubectl create role pod-reader --verb=get,list,watch --resource=pods > /dev/null
kubectl create rolebinding reader-binding --role=pod-reader --serviceaccount=$LABNS:reader > /dev/null
SA=system:serviceaccount:$LABNS:reader
for check in "list pods" "delete pods" "get secrets" "list pods -n kube-system"; do
  printf '%-28s ' "$check"; kubectl auth can-i $check --as=$SA
done
echo
echo "--- everything this service account can do in this namespace:"
kubectl auth can-i --list --as=$SA | head -8
```

**What you see:** the service account can **list pods in its namespace** and nothing else: no deletes, no secrets, nothing in other namespaces. Habits that matter: **least privilege**, avoid wildcards (`*`) in verbs or resources, avoid binding to `cluster-admin`, check **who can read secrets** and **who can create pods** (creating pods is a path to everything), and audit bindings regularly. Service accounts that need no API access should have **`automountServiceAccountToken: false`**.

## 4. Hop: admission (is this object acceptable?)

After a request is authenticated and authorised, **admission controllers** can **reject or modify** it. Two built-in, no-extra-software mechanisms to know:

### Pod Security admission (namespace labels)

Three profiles: **privileged** (anything), **baseline** (blocks known privilege escalations), **restricted** (hardened best practice). A label on the namespace sets **enforce** (reject), **audit** (log) and **warn** (message):

```run
kubectl create namespace $LABNS-psa > /dev/null
kubectl label namespace $LABNS-psa pod-security.kubernetes.io/enforce=restricted > /dev/null
echo "--- a privileged pod in a 'restricted' namespace:"
kubectl -n $LABNS-psa run bad --image=busybox:1.36 --privileged -- sleep 60 2>&1 | sed 's/: privileged/:\n  privileged/; s/), /),\n  /g' | head -8
echo
echo "--- a compliant pod:"
kubectl -n $LABNS-psa apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: good}
spec:
  securityContext: {runAsNonRoot: true, runAsUser: 10001, seccompProfile: {type: RuntimeDefault}}
  containers:
  - name: c
    image: busybox:1.36
    command: [sh, -c, "sleep 3600"]
    securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: [ALL]}}
EOF
```

**What you see:** the API server **rejects** the pod and lists **every violated rule** (privileged, privilege escalation, capabilities, runAsNonRoot, seccomp). The compliant pod is accepted. This is a **preventive control at the door**.

### ValidatingAdmissionPolicy (your own rules, no webhook)

Write a rule in **CEL** and bind it to namespaces. This one rejects images with no tag or the `:latest` tag:

```run
kubectl apply -f - > /dev/null <<'EOF'
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata: {name: no-latest-tag}
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
    - apiGroups: [""]
      apiVersions: ["v1"]
      operations: ["CREATE", "UPDATE"]
      resources: ["pods"]
  validations:
  - expression: "object.spec.containers.all(c, c.image.contains(':') && !c.image.endsWith(':latest'))"
    message: "every image must have an explicit tag that is not :latest"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata: {name: no-latest-tag-binding}
spec:
  policyName: no-latest-tag
  validationActions: [Deny]
  matchResources:
    namespaceSelector: {matchLabels: {policy: enforced}}
EOF
kubectl label namespace $LABNS policy=enforced --overwrite > /dev/null
sleep 4
echo "--- untagged image:"
kubectl run a --image=busybox -- sleep 5 2>&1 | sed 's/.*denied request: /denied: /'
echo "--- :latest:"
kubectl run b --image=busybox:latest -- sleep 5 2>&1 | sed 's/.*denied request: /denied: /'
echo "--- pinned tag:"
kubectl run c --image=busybox:1.36 -- sleep 5 2>&1 | tail -1
kubectl delete validatingadmissionpolicybinding no-latest-tag-binding > /dev/null
kubectl delete validatingadmissionpolicy no-latest-tag > /dev/null
```

**What you see:** the two bad pods are denied with **your message**, the pinned one is created. For checks that need **external data** (is this image signed? is it in an approved registry? does it have critical vulnerabilities?) use an **admission webhook**: the **ImagePolicyWebhook** admission plugin, or tools such as **Kyverno** or **OPA Gatekeeper**.

### ImagePolicyWebhook: the long procedure to know

**ImagePolicyWebhook** asks an **external service** to allow or deny each image. Setting it up is a typical long drill:

1. Write an **admission configuration** file that points the plugin at a **kubeconfig-style file** describing the webhook (server URL, CA, client certificate) and sets `defaultAllow` (fail closed with `false`).
2. Mount the files into the **kube-apiserver static pod** (hostPath volumes).
3. Add `--admission-control-config-file=...` and add `ImagePolicyWebhook` to `--enable-admission-plugins`.
4. Wait for the API server to restart; **test with an allowed and a denied image**.
5. If the API server does not come back: **section 9**.

## 5. Hop: etcd (the keys to everything)

etcd holds **all cluster state, including Secret objects**. By default a Secret in etcd is only **base64-encoded, not encrypted**. See it:

```run
kubectl create secret generic db --from-literal=password=S3cr3t-Value > /dev/null
echo "--- what etcd stores for that Secret (this lab's etcd is plain HTTP, no encryption):"
etcdctl --endpoints=http://127.0.0.1:2379 get /registry/secrets/$LABNS/db 2>/dev/null | strings | grep -E "S3cr3t|password" | head -3
```

**What you see:** the value is **readable** in the stored bytes. Anyone with access to etcd, its data directory or a backup can read every Secret. Defences, in order:

1. **Restrict access to etcd**: client certificate authentication, TLS, firewall it to the API server only (this lab breaks all three on purpose).
2. **Encrypt at rest** (below), ideally with a **KMS provider** so keys live outside the cluster.
3. **Encrypt and protect backups**, and **limit who can run `etcdctl`**.
4. Limit RBAC access to Secrets (section 3), and consider **external secret managers** (Q11 in the senior track).

### Encryption at rest: the long procedure to drill

```yaml:encryption
# /etc/kubernetes/enc/enc.yaml  (Example, not run here)
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources: ["secrets"]
  providers:
  - aescbc:                       # first provider encrypts new writes
      keys:
      - name: key1
        secret: <base64 of 32 random bytes>   # head -c 32 /dev/urandom | base64
  - identity: {}                  # last: lets the server still read old, unencrypted data
```

1. Generate a 32-byte key; write the file; **protect it** (mode 600, root only).
2. Mount it into the API server static pod and add **`--encryption-provider-config=/etc/kubernetes/enc/enc.yaml`** (plus the volume and volumeMount).
3. Wait for the API server to restart (**section 9** if not).
4. **Existing Secrets are still plaintext until rewritten:** `kubectl get secrets -A -o json | kubectl replace -f -`.
5. **Verify** in etcd: the stored value should start with **`k8s:enc:aescbc:v1:key1`** instead of readable text: `ETCDCTL_API=3 etcdctl get /registry/secrets/default/NAME ... | hexdump -C | head`.
6. **Key rotation:** add a new key **first** in the list, restart, rewrite all Secrets, then remove the old key.

## 6. Hop: the kubelet (the node agent has an API too)

The kubelet listens on **port 10250** and can list pods, read logs and **exec into containers**. If it accepts anonymous requests, **anyone who can reach the node can control its pods**. Look at this lab's configuration, and at what an unauthenticated request gets:

```run
echo "--- the lab kubelet's authentication and authorization settings:"
grep -A3 -E "^authentication|^authorization" /opt/k8s/kubelet-config.yaml
echo
echo "--- an anonymous request to the kubelet API:"
curl -sk https://127.0.0.1:10250/pods | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['kind'], 'returned with', len(d['items']), 'pods listed; no credentials were supplied')"
```

**What you see:** **`anonymous: enabled: true`** and **`authorization: AlwaysAllow`** mean the request **returned the node's pod list with no credentials** (the same API can read logs and exec into containers). That is a textbook misconfiguration, left in the lab to make the point. The hardened version:

```yaml:kubelet
# Example, not run here: KubeletConfiguration hardening
authentication:
  anonymous: {enabled: false}
  webhook: {enabled: true}                 # ask the API server who the caller is
  x509: {clientCAFile: /etc/kubernetes/pki/ca.crt}
authorization:
  mode: Webhook                            # ask the API server whether they may
readOnlyPort: 0                            # no unauthenticated read-only port
protectKernelDefaults: true
rotateCertificates: true
```

Also enable the **NodeRestriction** admission plugin (a kubelet may modify only its own node and the pods bound to it), and audit with **kube-bench** (the CIS Kubernetes Benchmark).

## 7. Hop: runtime and container (limit the blast radius)

Assume an attacker gets code running in a container. What can they do? A **securityContext** decides. Compare a default pod with a hardened one, looking at the process itself:

```run
kubectl apply -f - > /dev/null <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: default-pod}
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: [sh, -c, "sleep 3600"]
---
apiVersion: v1
kind: Pod
metadata: {name: hardened-pod}
spec:
  securityContext: {runAsNonRoot: true, runAsUser: 10001, seccompProfile: {type: RuntimeDefault}}
  containers:
  - name: c
    image: busybox:1.36
    command: [sh, -c, "sleep 3600"]
    securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: [ALL]}}
EOF
kubectl wait --for=condition=Ready pod/default-pod pod/hardened-pod --timeout=90s > /dev/null
for p in default-pod hardened-pod; do
  echo "=== $p"
  kubectl exec $p -- sh -c 'echo "user: $(id -u)"; grep -E "^(Seccomp|CapEff):" /proc/1/status; touch /etc/x 2>&1 | head -1'
done
```

**What you see:** the default pod runs as **root (uid 0)**, with **no seccomp filter (`Seccomp: 0`)**, a **large capability set (`CapEff`)** and **a writable filesystem**. The hardened pod runs as **uid 10001**, with **seccomp mode 2 (filter active)**, **no capabilities** (`CapEff` all zeros) and a **read-only filesystem**. Controls to know:

| Control | What it limits |
|---|---|
| `runAsNonRoot`, `runAsUser` | no root in the container |
| `readOnlyRootFilesystem` | no writing malware or config to the image filesystem |
| `capabilities.drop: [ALL]` | no raw sockets, no mount, no chown of arbitrary files... |
| `allowPrivilegeEscalation: false` | no setuid tricks |
| `privileged: false`, no `hostPID/hostNetwork/hostPath` | no host access |
| **seccomp** `RuntimeDefault` (or a custom profile) | blocks dangerous **system calls** |
| **AppArmor** profile | mandatory access control for file, network and capability use (Linux nodes with AppArmor) |
| **RuntimeClass** with **gVisor** or **Kata** | the container talks to a **user-space kernel or a lightweight VM**, not the host kernel |

```yaml:runtimeclass
# Example, not run here: run a pod in a sandboxed runtime (needs gVisor installed and a runtime handler configured)
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata: {name: gvisor}
handler: runsc
---
apiVersion: v1
kind: Pod
metadata: {name: sandboxed}
spec:
  runtimeClassName: gvisor
  containers: [{name: c, image: busybox:1.36, command: [sleep, "3600"]}]
```

## 8. Hop: the network

- **NetworkPolicy:** default **deny** ingress and egress per namespace, then allow only what is needed (DNS egress included). The lab's network plugin **does not enforce** policies (S2 shows this honestly); **Calico or Cilium** do. Cilium adds identity-based policy and eBPF visibility.
- **mTLS between pods** with a **service mesh** (Istio, Linkerd): every call is encrypted and **both sides authenticated**; policy can say "only service A may call service B".
- **TLS at the edge:** certificates on **Ingress/Gateway** (cert-manager automates issuance); no plain HTTP to the world.
- **Do not expose** the API server, kubelet, etcd or dashboards to the internet.

```yaml:netpol
# Example: default-deny, then allow DNS egress and one app-to-db path (needs an enforcing network plugin)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny}
spec: {podSelector: {}, policyTypes: [Ingress, Egress]}
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: allow-dns}
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to: [{namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}}]
    ports: [{protocol: UDP, port: 53}, {protocol: TCP, port: 53}]
```

## 9. When the API server will not come back

Changing the API server's flags means editing its **static pod manifest** (usually `/etc/kubernetes/manifests/kube-apiserver.yaml`). A typo leaves the control plane down, and `kubectl` stops working. Know the **recovery moves**, because you will need them under time pressure:

1. **Before editing: back up the manifest** (`cp kube-apiserver.yaml /root/kube-apiserver.yaml.bak`) **outside** the manifests directory.
2. Edit, save, and **wait about a minute** for the kubelet to recreate the pod.
3. If `kubectl` fails, go to the node and ask the **kubelet**: `journalctl -u kubelet | grep -i manifest` shows manifest parsing errors; `crictl ps -a | grep apiserver` shows whether the container started and exited; `crictl logs <id>` or **`/var/log/pods/kube-system_kube-apiserver-*/`** shows its error (a bad flag, a missing file, a wrong mount path).
4. The **most common causes**: a path in a flag that is **not mounted into the pod** (add the `hostPath` volume and `volumeMount`), a wrong file permission, a YAML indentation error, and a flag typo.
5. **Restore the backup** if you cannot find it quickly, then re-apply your change carefully.

In this lab the control plane is not a static pod, so you cannot rehearse this here; practise it on a kubeadm-style cluster.

## 10. Hop: detection and response

- **Audit logs:** the API server can record **who did what to which object**, at a chosen level (`None`, `Metadata`, `Request`, `RequestResponse`), driven by an **audit policy**. Another long procedure:

```yaml:audit
# /etc/kubernetes/audit/policy.yaml (Example, not run here)
apiVersion: audit.k8s.io/v1
kind: Policy
omitStages: ["RequestReceived"]
rules:
- level: None
  users: ["system:kube-proxy"]
  verbs: ["watch"]
- level: Metadata
  resources: [{group: "", resources: ["secrets", "configmaps"]}]   # never log secret contents
- level: RequestResponse
  resources: [{group: "rbac.authorization.k8s.io"}]
- level: Metadata
```

  To enable: mount the policy file **and a log directory** into the API server pod, then add `--audit-policy-file`, `--audit-log-path`, `--audit-log-maxage`, `--audit-log-maxbackup`, `--audit-log-maxsize`. Verify with `tail -f` on the log while you create an object.
- **Runtime detection (Falco):** rules match **system-call activity** (a shell spawned in a container, a read of `/etc/shadow`, an unexpected outbound connection) and raise alerts.
- **Events and metrics:** `kubectl get events`, alerts on failed authentication, privileged pod creation, RBAC changes.
- **Response:** isolate (NetworkPolicy or cordon the node), preserve evidence, **rotate credentials**, rebuild from clean images (Q9 and S8).

```yaml:falco
# Example, not run here: a Falco rule (the rule language is YAML)
- rule: Shell spawned in a container
  desc: Detect an interactive shell started inside a container
  condition: evt.type = execve and container.id != host and proc.name in (bash, sh, zsh)
  output: "Shell in container (user=%user.name container=%container.name image=%container.image.repository cmd=%proc.cmdline)"
  priority: WARNING
```

## 11. Learn each extra tool in one to three pages

When you open the docs for Falco, Cilium, Istio, gVisor or Kyverno, you will find eight links on the first page. You do not need them all. For each tool, learn:

1. **The concept page** (what problem it solves, the main objects);
2. **One task page** for the thing you will configure (a Falco rule, a CiliumNetworkPolicy, an Istio PeerAuthentication);
3. **The reference for that one object** (its fields).

That is enough to read an example, write a small one and know where to look for the rest. Practise the **long procedures** (etcd encryption, ImagePolicyWebhook, audit logging) until they are boring, and for every scenario know **which documentation page** answers it.

:::warn Common mistakes
- **Treating one control as enough** (only RBAC, or only NetworkPolicy): assume each layer fails.
- **Wildcards in RBAC**, binding workloads to `cluster-admin`, or forgetting that **create pods** is a powerful permission.
- **Believing Secrets are encrypted** because they are base64.
- **Leaving the kubelet or etcd reachable** without authentication.
- **Running as root with a writable filesystem** "because it works".
- **Editing the API server manifest without a backup**, or forgetting to mount a file into the pod.
- **Writing policies in audit mode and never enforcing them.**
- **Logging full Secret contents** in audit logs.
:::

:::try
1. Add a `RoleBinding` that lets the `reader` service account also read `configmaps`, then use `kubectl auth can-i --list --as=...` to prove only that changed.
2. In the `$LABNS-psa` namespace change the label to `enforce=baseline` and try the privileged pod again. Which rules still apply?
3. Make `default-pod` pass the **restricted** profile by editing its spec, without changing the image.
4. Write the encryption-at-rest procedure from section 5 on a blank page from memory, then compare.
5. Draw the map from section 1 on paper (or the sketch pad under Study, Maps) and put one control from each section on its hop.
:::

:::recap
- Security is **layers on one request path**: kubectl, API server (authn, RBAC, admission), etcd, kubelet, runtime and container, network, detection.
- **RBAC** is additive and checked with `kubectl auth can-i`; **admission** (Pod Security, ValidatingAdmissionPolicy, webhooks) rejects bad objects at the door.
- Secrets in **etcd are only base64** until **encryption at rest** is configured and Secrets are rewritten; protect etcd and its backups.
- The **kubelet API** must reject anonymous access and use Webhook authn and authz.
- **securityContext, seccomp, AppArmor and sandboxed runtimes** limit what a compromised container can do.
- Drill the **long procedures** (etcd encryption, audit logging, image-policy admission), know the **recovery moves** for a broken API server manifest, and learn each new tool from **one to three pages**.
:::

:::quiz
? Where are Kubernetes Secrets stored by default, and in what form?
- In the kubelet, encrypted
+ In etcd, base64-encoded but not encrypted
- On the node's disk, hashed
! Encryption at rest must be configured on the API server.

? What does a namespace labelled pod-security.kubernetes.io/enforce=restricted do?
- Logs privileged pods
+ Rejects pods that violate the restricted profile
- Encrypts the pods
! Audit and warn modes only report.

? You edited the API server manifest and kubectl no longer works. Where do you look first?
- The scheduler logs
+ The kubelet journal for manifest errors, then crictl and the pod logs on the node
- The Deployment
! The control plane pods are static pods managed by the kubelet.

? Which setting makes the kubelet reject unauthenticated requests?
- readOnlyPort: 10255
+ authentication.anonymous.enabled: false with webhook authentication and authorization
- address: 0.0.0.0
! Anonymous access and AlwaysAllow are the dangerous defaults of this lab.

? Which control limits the system calls a container may make?
- NetworkPolicy
+ seccomp
- ResourceQuota
! RuntimeDefault is a good baseline.
:::
