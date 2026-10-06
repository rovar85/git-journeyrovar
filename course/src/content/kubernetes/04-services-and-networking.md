---
track: kubernetes
title: Services, DNS and networking
short: Services
sub: Give a changing set of Pods one stable address, and find them by name.
---

:::goals
- explain why Services exist and how selectors build endpoints
- create ClusterIP and NodePort Services and reach them
- use cluster DNS names
- understand Ingress and LoadBalancer at a conceptual level
:::

## Pods come and go, so we need Services

Pod IPs change every time a Pod is recreated. A **Service** gives a set of Pods one **stable virtual IP and DNS name**, and load-balances across the healthy ones. Which Pods? Those whose **labels match the Service's selector**. The matching Pods are tracked as **EndpointSlices**.

```setup
export LABNS=lab4
```

@setup k8s

```run
cat > app.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
      - name: nginx
        image: nginx:1.27-alpine
        ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
  - port: 80          # the Service port
    targetPort: 80    # the container port
EOF
kubectl apply -f app.yaml
kubectl rollout status deployment/web --timeout=90s | tail -1
kubectl get service web -o custom-columns=NAME:.metadata.name,TYPE:.spec.type,PORT:.spec.ports[0].port
kubectl get endpointslices -l kubernetes.io/service-name=web -o jsonpath='endpoints: {.items[0].endpoints[*].addresses[0]}{"\n"}' | sed 's/[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*/<podip>/g'
```

The Service has three endpoints (one per Pod). The default type, **ClusterIP**, is reachable only inside the cluster.

## DNS names

CoreDNS gives every Service a name: `SERVICE.NAMESPACE.svc.cluster.local`. Inside the same namespace the short name `web` works.

```run
kubectl run client --image=busybox:1.37 --restart=Never -- sh -c '
echo "--- short name:";  wget -qO- http://web | grep -o "<title>.*</title>"
echo "--- full name:";   wget -qO- http://web.lab4.svc.cluster.local | grep -o "<title>.*</title>"
echo "--- resolver:";    nslookup web | grep -E "^Name"
echo "--- search path:"; grep ^search /etc/resolv.conf'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/client --timeout=60s
kubectl logs client
```

The `search` line is why the short name works: the resolver tries `web.lab4.svc.cluster.local` automatically. From **another namespace** you must use `web.lab4` (or the full name). Applications should be configured with the Service name, never a Pod IP.

## Load balancing

```run
kubectl run hits --image=busybox:1.37 --restart=Never -- sh -c 'for i in 1 2 3 4 5 6 7 8 9 10 11 12; do wget -qO- http://web > /dev/null && echo ok; done | sort | uniq -c'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/hits --timeout=60s
kubectl logs hits
```

Traffic goes to one of the ready Pods, chosen by kube-proxy's rules. See them (iptables mode: each Service gets chains with one rule per endpoint):

```run
sudo iptables -t nat -S | grep -c "default_web\|lab4/web" | awk '{print "iptables rules mentioning this service:", ($1>0 ? "yes" : "no")}'
```

## Selectors must match

The most common Service problem: the selector matches **nothing**, so there are no endpoints and every request fails.

```run
kubectl patch service web -p '{"spec":{"selector":{"app":"wbe"}}}' > /dev/null
kubectl get endpointslices -l kubernetes.io/service-name=web -o jsonpath='endpoints: [{.items[0].endpoints[*].addresses[0]}]{"\n"}'
kubectl run broken --image=busybox:1.37 --restart=Never -- sh -c 'wget -q -T 3 -O- http://web || echo "request failed: no endpoints"'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/broken --timeout=60s
kubectl logs broken | tail -1
kubectl patch service web -p '{"spec":{"selector":{"app":"web"}}}' > /dev/null
```

The typo `wbe` gave empty endpoints. Debug recipe: `kubectl get endpoints SERVICE` (or EndpointSlices). Empty means selector/labels mismatch or Pods not Ready. Also check that `targetPort` matches the port the container really listens on.

## Service types

| Type | Reachable from | How |
|---|---|---|
| **ClusterIP** (default) | inside the cluster | virtual IP and DNS name |
| **NodePort** | outside, via any node's IP on a port 30000-32767 | opens that port on every node |
| **LoadBalancer** | the internet or a network | asks the cloud for a load balancer (AWS ELB, Azure LB) that forwards to NodePorts |
| **ExternalName** | inside | DNS alias to an external name |
| **Headless** (`clusterIP: None`) | inside | DNS returns the Pod IPs directly; used by StatefulSets |

A NodePort in the lab (bound to loopback only here):

```run
kubectl expose deployment web --name=web-np --type=NodePort --port=80
port=$(kubectl get service web-np -o jsonpath='{.spec.ports[0].nodePort}')
echo "nodePort is in range 30000-32767: $([ $port -ge 30000 ] && [ $port -le 32767 ] && echo yes)"
sleep 3
curl -s -m 5 http://127.0.0.1:$port/ | grep -o "<title>.*</title>"
```

## Ingress: HTTP routing

Giving every web app its own LoadBalancer is expensive. An **Ingress** is a set of HTTP routing rules (by host name and path) handled by an **Ingress controller** (NGINX, Traefik, cloud load balancers, or the newer **Gateway API**). One entry point, many applications, plus TLS termination:

```yaml:ingress.yaml (Example, not run here)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ev-web
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt     # automatic TLS certificates
spec:
  ingressClassName: nginx
  tls:
  - hosts: [ev.example.com]
    secretName: ev-tls
  rules:
  - host: ev.example.com
    http:
      paths:
      - path: /search
        pathType: Prefix
        backend: {service: {name: search, port: {number: 80}}}
      - path: /
        pathType: Prefix
        backend: {service: {name: web, port: {number: 80}}}
```

Ingress is not available in this lab because no controller is installed.

## NetworkPolicy

By default every Pod can talk to every other Pod. A **NetworkPolicy** restricts that (for example "only the app Pods may reach the database Pods"). It is enforced by the CNI plugin (Calico, Cilium); the simple bridge plugin in this lab does not enforce it, so this is an **Example**:

```yaml:netpol.yaml (Example, not run here)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: db-only-from-app}
spec:
  podSelector: {matchLabels: {app: db}}
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: {matchLabels: {app: app}}
    ports: [{port: 5432}]
```

<!-- deeper -->
## A worked solution and common mistakes

```run
kubectl create namespace other4 > /dev/null
kubectl -n other4 run probe --image=busybox:1.37 --restart=Never -- sh -c '
echo "short name:"; wget -q -T 3 -O- http://web 2>&1 | head -1
echo "cross-namespace name:"; wget -qO- http://web.lab4.svc.cluster.local | grep -o "<title>.*</title>"
echo "search path:"; grep ^search /etc/resolv.conf'
kubectl -n other4 wait --for=jsonpath='{.status.phase}'=Succeeded pod/probe --timeout=60s > /dev/null
kubectl -n other4 logs probe
kubectl delete namespace other4 --wait=false > /dev/null
```

The short name `web` fails in `other4` because the resolver's search path starts with **the Pod's own namespace** (`other4.svc.cluster.local`), which has no `web`. Use `web.lab4` or the full `web.lab4.svc.cluster.local`.

:::warn Common mistakes
- **Using the short service name across namespaces.**
- **Hard-coding ClusterIPs or Pod IPs.**
- **Exposing everything as NodePort or LoadBalancer.** Most services need only ClusterIP; use Ingress for HTTP.
- **Mixing up `port` and `targetPort`.**
- **Assuming namespaces isolate the network.** By default any Pod can reach any Service; add NetworkPolicies.
:::
<!-- /deeper -->

:::recap
- A Service is a stable virtual IP + DNS name in front of Pods chosen by a label selector.
- DNS: `service.namespace.svc.cluster.local`; short name inside the same namespace.
- No endpoints? Check selector vs labels, readiness and `targetPort`.
- Types: ClusterIP, NodePort, LoadBalancer, ExternalName, headless. Ingress does HTTP routing; NetworkPolicy restricts Pod traffic.
:::

:::try Your turn
Create a second namespace with a client Pod and reach the `web` Service in `lab4` using its cross-namespace DNS name. Why does the short name fail there?
:::

:::quiz
? How does a Service know which Pods to send traffic to?
+ Its label selector matches Pod labels (only Ready Pods get traffic)
- By Pod name
- By node
- By image
! The matching Pods are listed as endpoints.
? A Service has no endpoints. What do you check first?
+ That its selector matches the Pods' labels and the Pods are Ready
- The node CPU
- The registry
- The kubeconfig
! `kubectl get endpoints NAME`.
? Which type opens the same port on every node?
- ClusterIP
+ NodePort
- ExternalName
- Headless
! LoadBalancer builds on top of NodePort.
:::
