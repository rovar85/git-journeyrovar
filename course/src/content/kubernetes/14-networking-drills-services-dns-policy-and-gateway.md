---
track: kubernetes
title: Networking drills: Services, DNS, NetworkPolicy, Ingress and the Gateway API
short: Networking drills
sub: Diagnose a Service with no endpoints, read cluster DNS, prove that a NetworkPolicy does nothing without an enforcing network plugin, and write Ingress and Gateway API resources.
---

:::goals
- diagnose a Service that has no endpoints and fix the selector
- use the cluster DNS names for Services, headless Services and Pods
- explain why a NetworkPolicy can be accepted and still have no effect, and write the standard set of policies
- write an Ingress and a Gateway API Gateway with an HTTPRoute
- follow a connectivity debugging ladder
:::

:::note What ran
The Service, DNS and NetworkPolicy parts run on the real lab cluster. The lab has **no Ingress controller, no Gateway API controller and a network plugin that does not enforce NetworkPolicy**, so those parts are **Example, not run here** (and the NetworkPolicy part includes a real experiment that shows the lack of enforcement). This lesson drills the CKA curriculum domain "Services and Networking" (20% in the v1.35 curriculum): Pod connectivity, network policies, Service types and endpoints, Gateway API, Ingress controllers and resources, and CoreDNS.
:::

```setup
export LABNS=labnet
```

@setup k8s

## 1. A Service with no endpoints

A Service finds its Pods by **label selector**. The most common networking fault is a selector that matches **nothing**: the Service exists, has a ClusterIP, and every request fails, because its list of **endpoints** (the Pod IPs behind it) is empty. Build the fault and read the evidence:

```run
kubectl create deployment web --image=busybox:1.37 --replicas=2 -- sh -c 'mkdir -p /w; echo hello > /w/index.html; httpd -f -p 8080 -h /w' > /dev/null
kubectl wait --for=condition=Available deployment/web --timeout=90s > /dev/null
cat > svc.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata: {name: web}
spec:
  selector: {app: webserver}          # the Pods are labelled app=web, not app=webserver
  ports: [{port: 80, targetPort: 8080}]
EOF
kubectl apply -f svc.yaml > /dev/null
kubectl run client --image=busybox:1.37 --restart=Never -- sleep 3600 > /dev/null
kubectl wait --for=condition=Ready pod/client --timeout=60s > /dev/null
echo "--- service has endpoints?"
kubectl get endpointslices -l kubernetes.io/service-name=web -o jsonpath='{range .items[*]}endpoints: {.endpoints}{"\n"}{end}'
echo "--- a request:"
kubectl exec client -- wget -T 3 -qO- http://web.labnet.svc.cluster.local 2>&1 | head -1
echo "--- what labels do the Pods have, and what does the Service select?"
kubectl get pods -l app=web --show-labels --no-headers | awk '{print $1, $NF}' | head -1
kubectl get svc web -o jsonpath='selector: {.spec.selector}{"\n"}'
```

The diagnosis sequence you should always follow: **`kubectl get endpoints` (or endpointslices) for the Service**: empty means the selector matches no **Ready** Pod. Then compare **selector** with **Pod labels**. Fix it and check again:

```run
kubectl patch svc web -p '{"spec":{"selector":{"app":"web"}}}' > /dev/null
sleep 2
kubectl get endpointslices -l kubernetes.io/service-name=web -o jsonpath='{range .items[*].endpoints[*]}endpoint: {.addresses[0]}{"\n"}{end}' | sed -E 's/10\.244\.0\.[0-9]+/10.244.0.x/'
kubectl exec client -- wget -T 3 -qO- http://web.labnet.svc.cluster.local
```

An endpoint list can also be empty because the Pods are **not Ready** (a failing readiness probe removes a Pod from the endpoints on purpose), or because the Service's **`targetPort`** points at the wrong container port (endpoints exist, but connections are refused). Three numbers confuse everyone, so name them:

| Field | Meaning |
|---|---|
| `port` | the port the **Service** listens on (its ClusterIP) |
| `targetPort` | the port on the **Pod** (default: the same as `port`) |
| `nodePort` | for type `NodePort`: the port opened on **every node** (30000 to 32767 by default) |

Service types: **ClusterIP** (internal only, the default), **NodePort** (also a port on each node), **LoadBalancer** (also asks the cloud for an external load balancer), **ExternalName** (a DNS alias to an external name, no proxying), and a **headless** Service (`clusterIP: None`: no virtual IP, DNS returns the Pod IPs, used by StatefulSets).

## 2. Cluster DNS: names you should know by heart

CoreDNS answers inside the cluster. The names:

| What | Name |
|---|---|
| a Service | `SERVICE.NAMESPACE.svc.cluster.local` (from the same namespace, plain `SERVICE` works through the search path) |
| a headless Service | the same name, but it returns **every Pod IP** |
| a Pod | `10-244-0-12.NAMESPACE.pod.cluster.local` (IP with dashes) |
| a StatefulSet Pod | `POD-0.SERVICE.NAMESPACE.svc.cluster.local` (stable) |

```run
cat > headless.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata: {name: web-headless}
spec:
  clusterIP: None
  selector: {app: web}
  ports: [{port: 80, targetPort: 8080}]
EOF
kubectl apply -f headless.yaml > /dev/null
echo "--- normal service: one virtual IP"
kubectl exec client -- nslookup web.labnet.svc.cluster.local 2>&1 | grep -E "^Address" | tail -1 | sed -E 's/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/<cluster IP>/'
echo "--- headless service: one address per Pod (2 replicas)"
kubectl exec client -- nslookup web-headless.labnet.svc.cluster.local 2>&1 | grep -c "^Address.*10\.244\." | sed 's/^/Pod addresses returned: /'
echo "--- the search path that makes short names work:"
kubectl exec client -- cat /etc/resolv.conf | sed -E 's/nameserver .*/nameserver <cluster DNS>/'
```

`ndots:5` means any name with fewer than five dots is tried **with each search domain first**, which is why `web` works inside the namespace and why external names cost extra lookups (a known performance gotcha; add a trailing dot or lower `ndots` for heavy external traffic). BusyBox's `nslookup` does not honour the search path well, so the exercises use full names; `wget`, `curl` and real applications do use it.

CoreDNS itself is a Deployment in `kube-system`, configured by a **Corefile** in a ConfigMap. Read the lab's:

```run
kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}'
echo
```

Each line is a **plugin**: `kubernetes` answers cluster names, `forward` sends everything else to an upstream resolver, `cache` caches answers, `errors` and `health` and `ready` support operations, `loop` detects forwarding loops. To add a **stub domain** (send `corp.example` lookups to your corporate DNS) you add another server block to this ConfigMap and let CoreDNS reload it. When DNS fails, check in this order: **are the CoreDNS Pods Running, is the `kube-dns` Service's endpoint list non-empty, what does `cat /etc/resolv.conf` say inside the failing Pod, and does the Corefile `forward` target work from the node**.

## 3. NetworkPolicy: accepted is not the same as enforced

By default every Pod can reach every other Pod. A **NetworkPolicy** selects Pods and lists **allowed** traffic; once a Pod is selected by a policy for a direction, **everything not allowed is denied** in that direction. Policies are **additive** (no deny rules, only allows) and are **enforced by the network plugin**, not by Kubernetes itself. Now the experiment: create the strictest policy, a **default deny for ingress**, and test again.

```run
cat > deny.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny-ingress}
spec:
  podSelector: {}                 # every Pod in the namespace
  policyTypes: [Ingress]          # no ingress rules listed: nothing is allowed in
EOF
echo "--- before the policy:"
kubectl exec client -- wget -T 3 -qO- http://web.labnet.svc.cluster.local
kubectl apply -f deny.yaml
sleep 3
echo "--- after a default-deny-ingress policy (should be blocked if enforced):"
kubectl exec client -- wget -T 3 -qO- http://web.labnet.svc.cluster.local 2>&1 | tail -1
kubectl get networkpolicy --no-headers | awk '{print "policy objects in the namespace:", $1}'
```

The request **still works**: the API server accepted and stored the policy, and **nothing enforced it**, because this lab's network plugin has no policy engine. That is a real and **dangerous** situation in production: security teams believe a namespace is isolated while it is wide open. **Always test a policy** by trying the forbidden connection. A plugin that enforces policy (Calico, Cilium, and others, from my knowledge) would have produced a `timed out` here.

The standard trio, for a database that only the application may reach (Example, not run here; it needs an enforcing plugin):

```yaml:policies.yaml (Example, not run here)
# 1. Start from "nothing may come in":
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny-ingress}
spec: {podSelector: {}, policyTypes: [Ingress]}
---
# 2. Allow only the app Pods (in the same namespace) to reach the database on its port:
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: allow-app-to-db}
spec:
  podSelector: {matchLabels: {app: db}}
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: {matchLabels: {app: web}}
      # add "namespaceSelector: {matchLabels: {team: shop}}" in the SAME list item to require both
    ports: [{protocol: TCP, port: 5432}]
---
# 3. If you also deny EGRESS you must allow DNS or nothing resolves:
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: allow-dns-egress}
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to: [{namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}}]
    ports: [{protocol: UDP, port: 53}, {protocol: TCP, port: 53}]
```

Details that decide exam questions: the difference between **two `from` entries** (either may connect: OR) and **one entry with both a `podSelector` and a `namespaceSelector`** (the Pod must match both: AND); `ipBlock` for CIDR ranges; an **empty `podSelector: {}`** selects all Pods; and a policy only affects the **directions listed in `policyTypes`**.

```run
kubectl delete networkpolicy default-deny-ingress > /dev/null
```

## 4. Ingress and the Gateway API

A Service exposes one application. To route **many applications by host name and path through one entry point**, with TLS, you use an **Ingress** (an object with routing rules) **plus an Ingress controller** (NGINX, Traefik, a cloud load balancer: the thing that actually does the work). The object alone does nothing, the same lesson as CRDs and NetworkPolicy. (Example, not run here:)

```yaml:ingress.yaml (Example, not run here)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  ingressClassName: nginx               # which controller handles this object
  tls: [{hosts: [shop.example.com], secretName: shop-tls}]
  rules:
  - host: shop.example.com
    http:
      paths:
      - {path: /api, pathType: Prefix, backend: {service: {name: api, port: {number: 80}}}}
      - {path: /,    pathType: Prefix, backend: {service: {name: web, port: {number: 80}}}}
```

The **Gateway API** is the newer, more expressive successor, and it is in the CKA curriculum. It splits responsibilities between roles:

| Resource | Owned by | Meaning |
|---|---|---|
| **GatewayClass** | the infrastructure provider | which controller implementation exists |
| **Gateway** | the cluster operator | a **listener** (port, protocol, host, TLS) on a load balancer |
| **HTTPRoute** | the application team | **routing rules** that attach to a Gateway and point at Services |

```yaml:gateway.yaml (Example, not run here)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: {name: shared-gateway, namespace: infra}
spec:
  gatewayClassName: example-class
  listeners:
  - {name: https, protocol: HTTPS, port: 443, hostname: "*.example.com",
     tls: {certificateRefs: [{name: wildcard-tls}]}, allowedRoutes: {namespaces: {from: All}}}
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: {name: shop, namespace: shop}
spec:
  parentRefs: [{name: shared-gateway, namespace: infra}]
  hostnames: ["shop.example.com"]
  rules:
  - matches: [{path: {type: PathPrefix, value: /api}}]
    backendRefs: [{name: api, port: 80}]
  - backendRefs: [{name: web, port: 80, weight: 90}, {name: web-canary, port: 80, weight: 10}]   # a 10% canary
```

Gateway API supports **traffic weighting, header matching and cross-namespace routes** natively, where Ingress needs controller-specific annotations. Both need CRDs and a controller installed (Lesson 12).

## 5. The connectivity debugging ladder

When "Pod A cannot reach Service B", climb in order and stop at the first failure:

1. **Is the target Pod Ready?** `kubectl get pods -o wide`, then `describe` and `logs`.
2. **Does the Service have endpoints?** `kubectl get endpointslices -l kubernetes.io/service-name=B`. Empty: selector, readiness or `targetPort`.
3. **Can A resolve the name?** `nslookup B.NS.svc.cluster.local` from inside A. Failure: CoreDNS, the `kube-dns` Service, A's `resolv.conf`.
4. **Can A reach the Pod IP directly?** `wget http://POD_IP:PORT`. Works by IP but not by Service: kube-proxy or the Service definition.
5. **Does a NetworkPolicy interfere?** `kubectl get networkpolicy -A`, read the selectors, and remember enforcement depends on the plugin.
6. **Is the application listening on the right port and address?** From inside the Pod: `netstat -tln` or `ss -tln` (listening only on `127.0.0.1` is a classic).
7. **Node level:** kube-proxy running and its rules present (`iptables-save | grep SERVICE_NAME`), the CNI plugin healthy, the nodes' firewall.

```run
kubectl delete pod client --wait=false > /dev/null; kubectl delete deployment web --wait=false > /dev/null
```

## 6. Speed drills

1. Create a Deployment `app` (2 replicas) and expose it as a ClusterIP Service on port 80, using only `kubectl create` and `kubectl expose`.
2. Make the Service type NodePort with node port 30080 using `kubectl patch` or a YAML edit.
3. From a temporary Pod, resolve a Service by its full DNS name and fetch it.
4. Write a NetworkPolicy that allows only Pods labelled `role=frontend` to reach Pods labelled `role=backend` on port 8080.
5. Write an Ingress with two paths routing to two Services.
6. Find which Service owns a given Pod IP (`kubectl get endpointslices -A | grep IP`).

:::warn Common mistakes
- **Believing a NetworkPolicy works because `kubectl get networkpolicy` shows it.** Test the forbidden connection.
- **Selector typos** (an extra word, a wrong label key), the number one cause of empty endpoints.
- **Mixing up `port`, `targetPort` and `nodePort`.**
- **Denying egress and forgetting DNS.**
- **OR versus AND in `from` lists**, so a policy allows far more than intended.
- **Creating an Ingress or Gateway with no controller installed.** Nothing happens, and no error appears.
- **Testing with the wrong namespace**, then resolving a short name that only exists elsewhere.
:::

:::recap
- A Service with no endpoints almost always means a selector, readiness or `targetPort` problem: check the endpoint slices first.
- Cluster DNS names: `svc.ns.svc.cluster.local`; headless Services return Pod IPs; the Corefile in the `coredns` ConfigMap configures CoreDNS.
- A **NetworkPolicy is enforced by the network plugin**: in this lab it was accepted and ignored. Always test. Use default deny, then allow, and allow DNS for egress.
- **Ingress** needs an Ingress controller; the **Gateway API** (GatewayClass, Gateway, HTTPRoute) is its role-oriented successor, with weights and header matches built in.
- Debug connectivity in a fixed order: Pod Ready, endpoints, DNS, Pod IP, policy, application, node.
:::

:::try Your turn
Create a Service whose `targetPort` is wrong (for example 9090) and compare the symptom with the empty-selector fault: are there endpoints, and what does the request say? Then write a NetworkPolicy that would allow only Pods labelled `app=client` to reach `app=web` on port 8080, and explain what the lab does with it.
:::

:::quiz
? A Service has a ClusterIP but every request fails. What is the first thing to check?
+ Whether it has endpoints, which means whether its selector matches Ready Pods
- The node's CPU
- The Docker version
- The Ingress
! Empty endpoints point to selector, readiness or port.
? Why can a NetworkPolicy exist and have no effect?
+ Enforcement is done by the network plugin; a plugin without a policy engine ignores it
- Policies expire after a minute
- Only Secrets enforce them
- kube-proxy rejects them
! Always verify with a connection test.
? What is the difference between Ingress and the Gateway API?
+ Gateway API separates roles (GatewayClass, Gateway, HTTPRoute) and has weights and header matching built in
- Ingress is newer
- Gateway API needs no controller
- They are the same object
! Both require a controller to act.
:::
