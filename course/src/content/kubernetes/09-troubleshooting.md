---
track: kubernetes
title: Troubleshooting Kubernetes
short: Troubleshooting
sub: A method and the six failures you will see most, each reproduced for real.
---

:::goals
- follow a repeatable troubleshooting method
- recognise `ImagePullBackOff`, `CrashLoopBackOff`, `Pending`, `CreateContainerConfigError`, no endpoints and failing probes
- find the cause with `get`, `describe`, `logs`, `events` and `exec`
:::

## The method

Work from the symptom inward and always **read the message Kubernetes gives you**:

1. `kubectl get pods` (and `-o wide`): which state?
2. `kubectl describe pod NAME`: read **Events** at the bottom, plus `State`, `Last State`, `Reason`, `Exit Code`
3. `kubectl logs NAME` (`--previous` for the crashed run, `-c` for a container)
4. `kubectl get events --sort-by=.lastTimestamp`
5. `kubectl exec -it NAME -- sh` or `kubectl debug` to look inside
6. Check the pieces around it: Service selector and endpoints, ConfigMaps, Secrets, PVCs, node status, quotas

| Status you see | Usually means |
|---|---|
| `Pending` | not scheduled (resources, taints, selectors) or waiting for a volume |
| `ContainerCreating` (long) | image pull or volume/CNI problem |
| `ErrImagePull` / `ImagePullBackOff` | wrong image name/tag, or no permission to pull |
| `CrashLoopBackOff` | the container starts then exits, repeatedly |
| `CreateContainerConfigError` | a referenced ConfigMap/Secret/key is missing |
| `OOMKilled` | memory limit exceeded |
| `Running` but `0/1 READY` | readiness probe failing |
| `Terminating` (stuck) | finalizers, or the node is unreachable |
| `Evicted` | node ran out of resources |

```setup
export LABNS=lab9
```

@setup k8s

## 1. ImagePullBackOff

```run
kubectl run badimage --image=busybox:no-such-tag > /dev/null
for i in $(seq 1 20); do kubectl get pod badimage -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null | grep -q "Err\|BackOff" && break; sleep 2; done
kubectl get pod badimage -o custom-columns=NAME:.metadata.name,REASON:.status.containerStatuses[0].state.waiting.reason --no-headers
kubectl get events --field-selector involvedObject.name=badimage,reason=Failed -o jsonpath='{.items[0].message}{"\n"}' | cut -c1-140
```

The event says exactly what failed to pull. Fix the tag or add `imagePullSecrets` for a private registry. Check spelling, registry reachability and credentials.

## 2. CrashLoopBackOff

```run
kubectl run crashy --image=busybox:1.37 -- sh -c 'echo "FATAL: cannot read /etc/ev/evault.conf"; exit 2' > /dev/null
for i in $(seq 1 30); do kubectl get pod crashy -o jsonpath='{.status.containerStatuses[0].restartCount}' 2>/dev/null | grep -qE '^[1-9]' && break; sleep 2; done
kubectl get pod crashy -o custom-columns=NAME:.metadata.name,EXIT:.status.containerStatuses[0].lastState.terminated.exitCode --no-headers
kubectl logs crashy --previous
```

The container's own message (`FATAL: ...`) and exit code explain it. The Kubernetes side only reports "it keeps exiting". Look at the application log first. Typical causes: missing config or environment variable, bad command, dependency unreachable, permission denied on a mounted volume.

## 3. Pending (does not fit)

```run
kubectl run toobig --image=busybox:1.37 --overrides='{"spec":{"containers":[{"name":"toobig","image":"busybox:1.37","command":["sleep","3600"],"resources":{"requests":{"cpu":"64","memory":"512Gi"}}}]}}' > /dev/null
sleep 6
kubectl get pod toobig -o jsonpath='phase={.status.phase}{"\n"}'
kubectl get events --field-selector involvedObject.name=toobig -o jsonpath='{.items[0].reason}: {.items[0].message}{"\n"}' | cut -c1-120
```

`FailedScheduling` with `Insufficient cpu/memory`, `didn't match node selector`, or `untolerated taint`: the message lists every reason per node.

## 4. CreateContainerConfigError

```run
cat > cfg.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: needs-config}
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sleep", "3600"]
    envFrom:
    - configMapRef: {name: does-not-exist}
EOF
kubectl apply -f cfg.yaml > /dev/null
sleep 8
kubectl get pod needs-config -o custom-columns=NAME:.metadata.name,REASON:.status.containerStatuses[0].state.waiting.reason --no-headers
kubectl get events --field-selector involvedObject.name=needs-config -o jsonpath='{.items[-1].message}{"\n"}' | cut -c1-120
kubectl create configmap does-not-exist --from-literal=A=1 > /dev/null
sleep 12
kubectl get pod needs-config -o jsonpath='phase={.status.phase}{"\n"}'
```

The Pod waited for the missing ConfigMap and started once it appeared. A missing Secret or a missing key looks the same.

## 5. Service with no endpoints

```run
kubectl create deployment shop --image=nginx:1.27-alpine > /dev/null
kubectl rollout status deployment/shop --timeout=90s | tail -1
kubectl create service clusterip shop --tcp=80:80 > /dev/null
echo "selector the Service uses: $(kubectl get svc shop -o jsonpath='{.spec.selector}')"
echo "labels the Pods have:       $(kubectl get pods -l app=shop -o jsonpath='{.items[0].metadata.labels.app}' | sed 's/^/app=/')"
kubectl get endpointslices -l kubernetes.io/service-name=shop -o jsonpath='endpoints: [{.items[0].endpoints[*].addresses[0]}]{"\n"}'
```

`kubectl create service` used the selector `app=shop`, and the Deployment's Pods carry `app=shop`, so look at the endpoints; here they are the right ones? Make a deliberate mismatch to see the failure:

```run
kubectl patch svc shop -p '{"spec":{"selector":{"app":"shop-v2"}}}' > /dev/null
sleep 2
kubectl get endpointslices -l kubernetes.io/service-name=shop -o jsonpath='endpoints: [{.items[0].endpoints[*].addresses[0]}]{"\n"}'
```

An empty list is the signature: compare `kubectl get svc -o yaml` selector with `kubectl get pods --show-labels`. Also check the Pods are Ready and `targetPort` is right.

## 6. Failing readiness probe

```run
kubectl create deployment ready-bad --image=nginx:1.27-alpine > /dev/null
kubectl patch deployment ready-bad --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/missing","port":80},"periodSeconds":2}}]' > /dev/null
sleep 12
kubectl get pods -l app=ready-bad -o custom-columns=STATUS:.status.phase,READY:.status.containerStatuses[0].ready --no-headers
kubectl get events --field-selector reason=Unhealthy -o jsonpath='{.items[0].message}{"\n"}' | cut -c1-100
```

The Pod is `Running` but not Ready, and the event shows the probe's HTTP status (404). Fix the probe path, or fix the app.

## Looking inside: exec and debug

```run
kubectl exec deploy/shop -- sh -c 'cat /etc/os-release | head -1; wget -qO- http://localhost | head -c 15; echo'
kubectl debug --help | head -3
```

If the image has no shell (distroless), `kubectl debug -it POD --image=busybox --target=CONTAINER` attaches an **ephemeral debug container** that shares the Pod's namespaces. For node-level problems: `kubectl describe node`, `kubectl get nodes`, `kubectl top node` (needs metrics-server), and the kubelet and container runtime logs on the node (`journalctl -u kubelet`).

## A cheat sheet to keep

```term
$ kubectl get pods -A | grep -v Running            # everything unhealthy, all namespaces
$ kubectl get events -A --sort-by=.lastTimestamp | tail -20
$ kubectl describe pod NAME                         # read the Events
$ kubectl logs NAME --previous                      # why did it crash
$ kubectl get endpoints SERVICE                     # does the Service have backends
$ kubectl auth can-i VERB RESOURCE --as=SUBJECT     # RBAC
$ kubectl rollout undo deployment/NAME              # bad release
```

```run
kubectl delete namespace lab9 --wait=false > /dev/null
```

<!-- deeper -->
## A worked solution and common mistakes

```run
# the lesson cleaned up its namespace above, so make a fresh one for this exercise
for i in $(seq 1 30); do kubectl get ns lab9 > /dev/null 2>&1 || break; sleep 2; done
kubectl create namespace lab9 > /dev/null; kubectl config set-context --current --namespace=lab9 > /dev/null
kubectl run nocmd --image=busybox:1.37 --restart=Never -- /no/such/program > /dev/null
sleep 8
kubectl get pod nocmd -o custom-columns=NAME:.metadata.name,STATUS:.status.containerStatuses[0].state.waiting.reason,EXIT:.status.containerStatuses[0].state.terminated.exitCode --no-headers
kubectl describe pod nocmd | grep -iE "reason|message|exit code" | head -4 | cut -c1-140
kubectl logs nocmd 2>&1 | head -2
kubectl delete namespace lab9 --wait=false > /dev/null
```

The process never started: the runtime reports that the executable was not found, usually with a `RunContainerError`/`StartError` reason and exit code **127** or **128** ("command not found" or "cannot start"). `logs` is empty or an error because the application never ran. The cause is in `describe` (the event/message), not in the application log.

:::warn Common mistakes
- **Looking only at `logs`,** which cannot show failures that happen before the app starts.
- **Confusing `command` and `args`:** `command` replaces the image ENTRYPOINT, `args` replaces CMD.
- **Wrong image architecture or shell** (`sh` missing in distroless images).
- **Fixing by guesswork instead of reading `Events`.**
- **Deleting and recreating the Pod instead of fixing the Deployment,** so the fault returns.
:::
<!-- /deeper -->

:::recap
- Method: `get`, `describe` (Events), `logs --previous`, events, `exec`, then the surrounding objects.
- Image errors, crash loops, Pending, config errors, empty endpoints and failing probes cover most incidents.
- The cluster's own messages are specific: read them before guessing.
:::

:::try Your turn
Deploy an app whose container starts with a command that does not exist, and use only `describe` and `logs` to explain the failure. What exit code do you see?
:::

:::quiz
? A Pod is `CrashLoopBackOff`. First step?
+ Read `kubectl logs POD --previous` and the exit code
- Delete the node
- Scale the Deployment to 100
- Reinstall Kubernetes
! The application's own output usually explains it.
? A Service returns errors and `kubectl get endpoints` is empty. Likely cause?
+ The selector matches no Ready Pods
- A DNS problem
- A full disk
- The node is down
! Compare selector and labels, and check readiness.
? Where do you read why a Pod cannot be scheduled?
+ `kubectl describe pod` Events (FailedScheduling)
- The Service
- etcd directly
- The Docker daemon
! The message lists per-node reasons.
:::
