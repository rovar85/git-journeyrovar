---
track: scenarios
title: "S2: Pods in one Kubernetes namespace talk fine, but pods in another namespace cannot reach them even though services exist. How do you troubleshoot?"
short: S2 Cross-namespace networking
sub: The layered path of a request (DNS, Service, Endpoints, Pod, policy), a real ladder of checks on a live cluster that reproduces four different causes, and the answer an interviewer expects.
---

:::goals
- describe how a request travels from a pod to another pod through **DNS, Service, Endpoints and kube-proxy**
- know that **namespaces are not network boundaries** unless a policy makes them one
- reproduce and diagnose four classic causes on a real cluster: **wrong DNS name**, **selector mismatch (no endpoints)**, **wrong targetPort**, **NetworkPolicy**
- use a **repeatable troubleshooting ladder** instead of guessing
- answer the question the way an interviewer expects
:::

:::note Provenance
Everything except NetworkPolicy runs on the **real lab cluster**. The lab's network plugin **does not enforce NetworkPolicy**, so for that cause we apply the policy, show that **here it blocks nothing**, and explain what a **policy-enforcing CNI** (Calico, Cilium, the cloud provider's policy engine) would do. That part is an **Example, not run here**.
:::

```setup
export LABNS=labnet
```

@setup k8s

## 1. The mental model: the path of one request

A pod in namespace `web` calls `http://api:8080/`. Five things must all work, **in order**:

| Step | Component | What can break |
|---|---|---|
| 1 | **DNS** (CoreDNS) turns the name into the Service's **ClusterIP** | wrong name for another namespace, CoreDNS down, `ndots` and search path surprises |
| 2 | **Service** accepts traffic on its **port** | wrong Service port, Service in a different namespace than you think |
| 3 | **Endpoints** list the **ready pod IPs** behind the Service | **selector does not match** pod labels, pods **not Ready** (readiness probe failing) |
| 4 | **kube-proxy / dataplane** rewrites the ClusterIP to a pod IP | rules missing (rare), dataplane bug, node issue |
| 5 | The **pod** receives it on the **targetPort** | app listens on another port or only on `127.0.0.1`; **NetworkPolicy** or a mesh policy drops it |

Two facts that remove most of the confusion:

- **Namespaces are an organisation and permission boundary, not a network boundary.** By default **any pod can reach any pod IP** and any Service in any namespace. If cross-namespace traffic fails, **something specific** is breaking one of the five steps.
- A **short name** like `api` is resolved using the **pod's own namespace** as the search domain. From another namespace it points at the **wrong place** (or nowhere).

## 2. Build the situation

```run
kubectl delete namespace tools shop --ignore-not-found --wait=true > /dev/null 2>&1      # clean slate
kubectl create namespace tools > /dev/null
kubectl create namespace shop > /dev/null

# a small web server in namespace "shop", exposed by a Service
kubectl create deployment api -n shop --image=busybox:1.36 --port=8080 -- sh -c 'mkdir -p /www && echo "hello from shop/api" > /www/index.html && httpd -f -p 8080 -h /www' > /dev/null
kubectl expose deployment api -n shop --port=80 --target-port=8080 > /dev/null
kubectl wait --for=condition=available deployment/api -n shop --timeout=90s

# a client pod in a DIFFERENT namespace
kubectl run client -n tools --image=busybox:1.36 --restart=Never -- sleep 3600 > /dev/null
kubectl wait --for=condition=Ready pod/client -n tools --timeout=60s
kubectl get svc,endpoints -n shop
```

**What you see:** a Service `api` in `shop` with **one endpoint** (the pod IP and the container port). The client is in `tools`.

## 3. Cause 1: using the wrong name

```run
echo "--- short name (resolved in the client's own namespace 'tools'):"
kubectl exec -n tools client -- wget -qO- -T 3 http://api/ 2>&1 | head -2
echo
echo "--- service.namespace:"
kubectl exec -n tools client -- wget -qO- -T 3 http://api.shop/
echo "--- fully qualified:"
kubectl exec -n tools client -- wget -qO- -T 3 http://api.shop.svc.cluster.local/
echo
echo "--- why: the search path in the client's resolv.conf"
kubectl exec -n tools client -- cat /etc/resolv.conf | head -3
```

**What you see:** the short name **fails** ("bad address"), while `api.shop` and the fully qualified name work. The search path starts with `tools.svc.cluster.local`, so `api` becomes `api.tools...`, which does not exist. The single most common answer to this question is simply **"use `<service>.<namespace>`"**.

## 4. Cause 2: the Service has no endpoints (selector mismatch)

A Service sends traffic only to pods whose **labels match its selector** and that are **Ready**. Break it:

```run
kubectl patch svc api -n shop -p '{"spec":{"selector":{"app":"apii"}}}' > /dev/null    # a typo in the selector
sleep 2
echo "--- the Service still exists, but:"
kubectl get endpoints api -n shop
echo
echo "--- the client now:"
kubectl exec -n tools client -- wget -qO- -T 3 http://api.shop/ 2>&1 | head -2
echo
echo "--- compare selector with pod labels:"
kubectl get svc api -n shop -o jsonpath='selector: {.spec.selector}{"\n"}'
kubectl get pods -n shop --show-labels
```

(Newer Kubernetes versions mark the `Endpoints` API as deprecated in favour of **EndpointSlices**, so you may see a warning; `kubectl get endpointslices -n shop` shows the same information.)

**What you see:** the endpoints are **`<none>`** and the request fails (connection refused or timing out depending on the dataplane). **Empty endpoints is the signature of a selector mismatch or of pods that are not Ready.** Fix it and confirm:

```run
kubectl patch svc api -n shop -p '{"spec":{"selector":{"app":"api"}}}' > /dev/null
sleep 2
kubectl get endpoints api -n shop
kubectl exec -n tools client -- wget -qO- -T 3 http://api.shop/
```

Related causes of empty endpoints: a **readiness probe failing** (pod Running but not Ready), a pod in `CrashLoopBackOff`, or the Service created in the **wrong namespace** (selectors only match pods in the Service's own namespace).

## 5. Cause 3: the wrong targetPort

```run
kubectl patch svc api -n shop --type=json -p '[{"op":"replace","path":"/spec/ports/0/targetPort","value":9999}]' > /dev/null
sleep 2
echo "--- endpoints exist, but they point at port 9999:"
kubectl get endpoints api -n shop
echo "--- the client:"
kubectl exec -n tools client -- wget -qO- -T 3 http://api.shop/ 2>&1 | head -2
echo
echo "--- bypass the Service: call the pod IP on the real port"
POD_IP=$(kubectl get pod -n shop -l app=api -o jsonpath='{.items[0].status.podIP}')
kubectl exec -n tools client -- wget -qO- -T 3 http://$POD_IP:8080/
kubectl patch svc api -n shop --type=json -p '[{"op":"replace","path":"/spec/ports/0/targetPort","value":8080}]' > /dev/null
```

**What you see:** **Endpoints exist**, yet the request is refused, because the Service forwards to a port nothing listens on. **Calling the pod IP directly** works, which **proves the application and the pod network are fine** and narrows the fault to the **Service definition**. This "bypass one layer" move is the heart of network troubleshooting.

## 6. Cause 4: a NetworkPolicy (shown honestly)

In real clusters with an enforcing CNI, the usual reason for "same namespace works, other namespace does not" is a **NetworkPolicy** (often a default-deny) that allows traffic from the **same namespace only**:

```yaml:networkpolicy
# Example: this is what a policy-enforcing CNI would act on.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace-only
  namespace: shop
spec:
  podSelector: {}                 # all pods in "shop"
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: {}             # only pods in the same namespace
```

```run
kubectl apply -f - <<'EOF' > /dev/null
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace-only
  namespace: shop
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: {}
EOF
echo "--- the policy object exists:"
kubectl get networkpolicy -n shop
echo "--- the client in another namespace is STILL allowed here (this lab does not enforce policies):"
kubectl exec -n tools client -- wget -qO- -T 3 http://api.shop/
```

**What you see:** the policy is **stored**, but **traffic still flows**, because enforcement is the **CNI plugin's** job and this lab's plugin does not do it. Do not confuse "the NetworkPolicy object exists" with "it is enforced". On a real cluster you would see a **timeout** (dropped packets) rather than a refusal. The fix is to **add an allow rule** for the legitimate namespace:

```yaml:networkpolicy-allow
# Example, not run here.
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: tools     # the automatic namespace label
      podSelector:
        matchLabels:
          app: client
```

Remember: policies are **additive allow lists**. Selecting a pod in **any** policy makes it **default-deny** for that direction until an allow rule matches. **Egress** policies on the client side can also block it, and **DNS** must be allowed in egress (UDP and TCP 53 to CoreDNS).

## 7. The troubleshooting ladder as a script

Turn the five steps into something repeatable. It tests each layer and **stops at the first failure**, saying what that failure usually means.

```run
cat > ~/ladder.sh <<'SH'
#!/bin/bash
# usage: ladder.sh <client-ns> <client-pod> <svc> <svc-ns> <port>
cns=$1; cpod=$2; svc=$3; sns=$4; port=$5
fqdn="$svc.$sns.svc.cluster.local"
step() { printf '%-34s' "$1"; }
fail() { echo "FAIL  -> $1"; exit 1; }

step "1 service exists"
kubectl get svc "$svc" -n "$sns" >/dev/null 2>&1 && echo ok || fail "wrong name or namespace"

step "2 DNS resolves from the client"
ip=$(kubectl exec -n "$cns" "$cpod" -- nslookup "$fqdn" 2>/dev/null | awk '/^Address/ && !/#/ {print $2}' | tail -1)
[ -n "$ip" ] && echo "ok ($ip)" || fail "CoreDNS problem, or egress policy blocks DNS"

step "3 service has ready endpoints"
eps=$(kubectl get endpoints "$svc" -n "$sns" -o jsonpath='{.subsets[*].addresses[*].ip}')
[ -n "$eps" ] && echo "ok ($eps)" || fail "selector mismatch or pods not Ready"

step "4 pod answers directly (bypass)"
tp=$(kubectl get endpoints "$svc" -n "$sns" -o jsonpath='{.subsets[0].ports[0].port}')
kubectl exec -n "$cns" "$cpod" -- wget -qO- -T 3 "http://${eps%% *}:$tp/" >/dev/null 2>&1 && echo "ok (port $tp)" || fail "app not listening on targetPort, or a policy blocks pod traffic"

step "5 through the service"
kubectl exec -n "$cns" "$cpod" -- wget -qO- -T 3 "http://$fqdn:$port/" >/dev/null 2>&1 && echo ok || fail "Service port or kube-proxy problem"
echo "all layers healthy"
SH
chmod +x ~/ladder.sh
echo "=== healthy:"; ~/ladder.sh tools client api shop 80
echo
echo "=== broken selector:"
kubectl patch svc api -n shop -p '{"spec":{"selector":{"app":"nope"}}}' > /dev/null; sleep 2
~/ladder.sh tools client api shop 80
kubectl patch svc api -n shop -p '{"spec":{"selector":{"app":"api"}}}' > /dev/null
```

**What you see:** the healthy case passes all five layers; the broken case **fails at step 3** with the **likely cause**. In an interview, describing this ladder out loud is more convincing than naming a single cause.

## 8. Other causes worth naming

- **CoreDNS** unhealthy or overloaded (`kubectl get pods -n kube-system -l k8s-app=kube-dns`, check logs). `ndots:5` makes names with fewer than five dots try the **search domains first**, which multiplies DNS lookups.
- **Service mesh** (Istio, Linkerd): **mTLS or AuthorizationPolicy** denies cross-namespace calls even though the network is open.
- **ExternalName or headless** Services behaving differently from ClusterIP.
- **Ingress or gateway** in the path: wrong host or namespace for the backend Service.
- **Node-level**: security groups (on EKS with VPC CNI, pods use VPC IPs, so **security groups for pods and node groups** matter), missing routes, `kube-proxy` not running on the node.
- **Application** listens on `127.0.0.1` only, so it works from inside the pod but not from the network.

## 9. The answer an interviewer expects

1. **Reframe**: "Namespaces are not network boundaries by default, so something specific is failing. I'd go through the path: DNS, Service, Endpoints, Pod, policy."
2. **Start with the cheapest evidence** from a test pod **in the failing namespace**: resolve the **fully qualified** name; call the Service; call the **pod IP directly** to split Service-layer from pod-layer.
3. **Check Endpoints**: empty means **selector mismatch or pods not Ready**; compare `kubectl get svc -o yaml` selector with `--show-labels`.
4. **Check the ports**: Service port versus **targetPort** versus what the app listens on (and on which address).
5. **Check policy**: `kubectl get networkpolicy -A`; remember **default-deny** semantics; check **egress** policies and DNS egress on the client side; check **mesh authorization** if a mesh is present.
6. **Check infrastructure**: CoreDNS health, kube-proxy/CNI pods, and on EKS **security groups** and **IP exhaustion**.
7. **Fix, then prevent**: correct the cause, add a **connectivity test** to the deployment pipeline, document the **naming convention** (`service.namespace`), and use **policies as code**.

A spoken version: *"I'd treat it as a path: from a debug pod in the failing namespace I'd resolve the full service name, then check the Service's endpoints. Empty endpoints means a selector or readiness problem. If endpoints exist, I'd call the pod IP directly to see whether the app or the Service is at fault, and compare port and targetPort. If that works, I'd look at NetworkPolicies, especially default-deny and DNS egress, and at mesh policies. Finally the platform: CoreDNS, kube-proxy and CNI."*

:::warn Common mistakes
- Using the **short name** from another namespace.
- Debugging from **your laptop** instead of from a **pod in the failing namespace**.
- Concluding "the network is broken" without checking **Endpoints**.
- Forgetting that **NetworkPolicy is not enforced** by every CNI, and that an applied policy is **default-deny** for selected pods.
- Forgetting **DNS egress** in an egress policy.
- Checking `kubectl get svc` only: the Service object can look perfect with **zero endpoints**.
:::

## 10. Follow-up questions to expect

- **"Service works but is slow or intermittent."** Check **readiness** (pods flapping), CoreDNS latency (`ndots`), **conntrack table full**, **uneven load balancing** with long-lived connections (gRPC), and cross-zone traffic.
- **"How would you allow only the `tools` namespace to reach `shop`?"** A NetworkPolicy with `namespaceSelector` on the automatic label `kubernetes.io/metadata.name`, plus a default-deny.
- **"How does kube-proxy work?"** It programs **iptables or IPVS (or eBPF in other dataplanes)** rules on each node translating Service IPs to endpoint IPs; this lab uses **iptables mode**.
- **"Which tools would you use inside the cluster?"** A debug pod with `curl`, `nslookup`/`dig`, `tcpdump` (an ephemeral container with `kubectl debug`), plus the CNI's own flow observability (for example Hubble in Cilium).

:::try
1. Add a **readiness probe** that always fails to the `api` Deployment and watch **Endpoints** go empty while the pod stays Running.
2. Use `kubectl debug -n shop <pod> -it --image=busybox:1.36 --target=<container>` (if your client supports it) to inspect the pod's network from inside.
3. Create a second Service named `api` in namespace `tools` pointing at nothing, then from `tools` call the **short name** and the **qualified** one. Explain which one you reach.
4. Extend `ladder.sh` with a step that lists **NetworkPolicies** selecting the destination pods.
:::

:::recap
- A request needs **DNS, Service, Endpoints, a listening pod and no blocking policy**; test them in that order.
- **Namespaces do not isolate networking** by default; short names resolve in the **caller's** namespace.
- **Empty endpoints** means selector mismatch or pods not Ready; **bypassing the Service with the pod IP** splits Service problems from pod problems.
- **Port, targetPort and the app's real listening port** must agree.
- **NetworkPolicy** is additive, default-deny once selected, and only works if the **CNI enforces it**.
- Answer with a **ladder**, not a single guess.
:::

:::quiz
? From namespace `tools`, `http://api` fails but `http://api.shop` works. Why?
- The Service is down
+ The short name is resolved in the caller's own namespace, so it looked for api.tools
- DNS caches stale records
! Use service.namespace for cross-namespace calls.

? A Service shows `Endpoints: <none>`. What are the likely causes?
- Wrong DNS name
+ The selector matches no pod, or the matching pods are not Ready
- A full node disk
! Compare the selector with pod labels and check readiness.

? Calling the pod IP works but the Service fails. Where is the fault?
- In the application
+ In the Service layer: port, targetPort, selector or the dataplane
- In the container runtime
! The bypass test isolates the layer.

? After a NetworkPolicy selects a pod for ingress, what happens to traffic that no rule allows?
- It is allowed
+ It is denied, because policies are additive allow lists
- It is logged only
! Selected pods become default-deny for that direction.

? Where should you run connectivity tests from?
- Your laptop
+ A pod in the namespace that is failing
- The control plane node
! You must test from the caller's point of view.
:::
