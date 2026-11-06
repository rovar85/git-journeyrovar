---
track: kubernetes
title: The Pod lifecycle, from Pending to Terminated
short: Pod lifecycle
sub: Phases, conditions and container states; init containers and probes in order; restart back-off; and the shutdown sequence that decides whether a rolling update drops requests.
---

:::goals
- tell apart a Pod's **phase**, its **conditions** and its containers' **states**
- list what happens between `kubectl apply` and a Ready Pod, in order
- explain `CrashLoopBackOff`, its back-off timing, and the common exit codes
- explain the shutdown sequence (endpoint removal, `preStop`, SIGTERM, grace period, SIGKILL) and tune it so deploys drop no requests
:::

:::note Already covered elsewhere, so only linked here
The Pod object, its YAML and multi-container Pods are in [Pods](#kubernetes-2). Probes are in [Resources, probes and scheduling](#kubernetes-7). A hands-on zero-downtime deployment is in [Interview scenarios 7](#scenarios-7). This lesson ties them into one timeline. The `kubectl` examples below are **Example, not run here** (no cluster was available when this lesson was written); the two Python models are real and run in the lab.
:::

## 1. Three different things called "status"

When someone says "the pod is Running" they may mean one of three layers:

| Layer | Values | Where to see it |
| --- | --- | --- |
| **Phase** (a coarse summary) | `Pending`, `Running`, `Succeeded`, `Failed`, `Unknown` | `kubectl get pod -o jsonpath='{.status.phase}'` |
| **Conditions** (yes/no facts) | `PodScheduled`, `Initialized`, `ContainersReady`, `Ready` | `kubectl describe pod`, section Conditions |
| **Container states** (per container) | `Waiting` (with a reason), `Running`, `Terminated` (with exit code and reason) | `kubectl describe pod`, section Containers |

The `STATUS` column of `kubectl get pods` is **not** a field in the API: kubectl builds it from the layers above, which is why you see values such as `Init:0/1`, `CrashLoopBackOff`, `ImagePullBackOff` or `Terminating` that are not phases.

- **Pending**: accepted by the API, but not all containers are running yet: waiting to be scheduled, pulling images, running init containers.
- **Running**: bound to a node and at least one container is running or (re)starting.
- **Succeeded / Failed**: all containers terminated, with success or failure (for Jobs and one-shot Pods).
- **Unknown**: the node stopped reporting.

The condition that matters for traffic is **Ready**: a Service sends requests only to Pods whose Ready condition is true. A Pod can be `Running` and not Ready (readiness probe failing).

## 2. From `kubectl apply` to Ready

1. **API server** validates and stores the Pod (admission controllers may change or reject it).
2. **Scheduler** picks a node: the Pod gets `PodScheduled=True`. No node fits means it stays Pending with an event saying why (resources, taints, affinity).
3. **Kubelet on that node** prepares: mounts volumes, asks the runtime to create the Pod sandbox and the CNI plugin to give it an IP, pulls images (`ContainerCreating`, `ImagePullBackOff` if it fails).
4. **Init containers** run **one at a time, in order**, each to completion. Any failure restarts it (per the restart policy) before the next one starts. Status shows `Init:0/2`, `Init:1/2`...; when all pass, `Initialized=True`.
5. **App containers start** (in recent versions, native **sidecars**, init containers marked to keep running, start before the app containers). The `postStart` hook runs right after a container starts.
6. **Startup probe** (if set) runs first; liveness and readiness probes wait until it passes.
7. **Readiness probe passes** for all containers: `ContainersReady` then `Ready` become true, and the Pod's IP is added to the Service's endpoints.
8. **Liveness probe** keeps checking; failures make the kubelet restart that container.

## 3. Restarts and CrashLoopBackOff

The Pod's `restartPolicy` (`Always` is the default; `OnFailure` and `Never` are for Jobs) decides whether the kubelet restarts a container that exits. Restarts use an **exponential back-off**: the kubelet waits 10 s, 20 s, 40 s and so on, up to **5 minutes**, and resets the delay once the container has run for 10 minutes without failing. While it waits, the state shows `CrashLoopBackOff`. This model prints the schedule:

```run
mkdir -p ~/lab/k8 && cd ~/lab/k8
cat > crashloop.py <<'EOF'
# kubelet restarts a crashing container with an exponential back-off: 10 s, 20 s, 40 s, ... capped at 300 s (5 minutes).
# The back-off resets after the container has run for 10 minutes without crashing.
def delays(n):
    d, out = 10, []
    for _ in range(n): out.append(d); d = min(d * 2, 300)
    return out
print("restart  wait before it  time since the first crash")
t = 0
for i, d in enumerate(delays(9), 1):
    t += d
    print(f"{i:7d}  {d:12d} s  {t // 60:4d} min {t % 60:2d} s")
print("\nA container that crashes immediately is restarted about 12 times per hour once the cap is reached:", 3600 // 300)
print("exit codes you will meet:", {0: "finished normally", 1: "application error", 137: "SIGKILL (128+9): OOMKilled or killed after the grace period", 139: "SIGSEGV (128+11)", 143: "SIGTERM (128+15): asked to stop"})
EOF
python3 crashloop.py
```


`CrashLoopBackOff` is a symptom, not a cause. The cause is in `kubectl logs POD --previous` (the last crashed container's output) and in the **exit code** under `Last State` in `kubectl describe pod`:

- **0**: it finished. For a long-running service that means the program exited by itself.
- **1 or other small numbers**: the application failed (bad config, missing dependency).
- **137**: killed with SIGKILL (128 + 9). Either **OOMKilled** (it exceeded its memory limit: the reason says so) or killed after the grace period when it ignored SIGTERM.
- **143**: stopped by SIGTERM (128 + 15).
- **139**: segmentation fault (128 + 11).

A related state is `ImagePullBackOff` (wrong image name or tag, no pull credentials, registry unreachable); see [Troubleshooting](#kubernetes-9).

```term
$ kubectl describe pod web-7d9c8b5f4-x2k9p | sed -n '/Last State/,/Ready/p'
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
      Started:      Mon, 02 Mar 2026 10:14:02 +0000
      Finished:     Mon, 02 Mar 2026 10:14:09 +0000
    Ready:          False
    Restart Count:  5
```

## 4. Shutdown: the part that causes dropped requests

When a Pod is deleted (a rolling update, a scale-down, a node drain) two things start **at the same time**, and nothing guarantees which finishes first:

1. The Pod is marked `Terminating` and **removed from the Service endpoints**. Proxies and load balancers learn about it after a delay, so for a few seconds new requests may still arrive.
2. The kubelet runs the **`preStop` hook** (if any), then sends **SIGTERM** to the main process (PID 1) of each container.

If a container is still running when **`terminationGracePeriodSeconds`** is over (default 30 s, counted from the moment of deletion, so `preStop` time is included), the kubelet sends **SIGKILL**, with exit code 137.

The model below runs five variations of this race with real arithmetic:

```run
mkdir -p ~/lab/k8 && cd ~/lab/k8
cat > shutdown.py <<'EOF'
# Timeline of deleting a Pod that is behind a Service. Times are in seconds from the moment of "kubectl delete pod".
# What happens in a real cluster, in parallel, at t = 0:
#   (a) the Pod is marked Terminating and removed from the Service's endpoints; load balancers and proxies learn about it
#       only after a short delay ("propagation", here 4 s)
#   (b) the kubelet runs the preStop hook (if any), then sends SIGTERM to the main process of each container
#   (c) if the container is still running when terminationGracePeriodSeconds is over (it includes the preStop time), SIGKILL
GRACE = 30
PROPAGATION = 4            # seconds until nothing sends new traffic to the pod any more
RATE = 10                  # requests per second still arriving at the pod until propagation ends
def scenario(name, prestop, exit_after_sigterm):
    """exit_after_sigterm: seconds the app needs after SIGTERM to finish, or None if it ignores SIGTERM"""
    sigterm_at = prestop
    if exit_after_sigterm is None:
        exit_at, how = GRACE, "SIGKILL after the grace period, exit code 137"
    else:
        exit_at = sigterm_at + exit_after_sigterm
        if exit_at > GRACE: exit_at, how = GRACE, "SIGKILL after the grace period, exit code 137"
        else: how = "exited by itself, exit code 0"
    dropped = sum(1 for tick in range(0, PROPAGATION * RATE) if tick / RATE >= exit_at)       # requests that arrive after the pod is gone
    print(f"{name:52} SIGTERM at {sigterm_at:4.1f}s   gone at {exit_at:5.1f}s   dropped requests: {dropped:3d}   ({how})")
print(f"grace period {GRACE}s, endpoint propagation {PROPAGATION}s, {RATE} requests/s still arriving until then\n")
scenario("A. app exits at once on SIGTERM, no preStop", 0, 0.1)
scenario("B. app drains for 2 s after SIGTERM, no preStop", 0, 2)
scenario("C. preStop 'sleep 5', then app drains for 2 s", 5, 2)
scenario("D. app ignores SIGTERM (a shell script without trap)", 0, None)
scenario("E. app needs 40 s to drain, grace period only 30 s", 0, 40)
print("\nReading it: in A the pod is gone before the load balancers stop sending traffic, so requests fail.")
print("B drops fewer, but still drops: the pod is gone at 2 s while traffic keeps arriving until 4 s.")
print("C keeps serving until the endpoint removal has spread (5 s > 4 s), then drains. That is the standard fix: a short preStop sleep plus graceful shutdown.")
print("D and E are killed with exit code 137 (128 + 9 = SIGKILL): look for 137 in `kubectl describe pod` after a slow shutdown.")
EOF
python3 shutdown.py
```


What to take from it:

- **A (exits immediately on SIGTERM):** the Pod disappears while traffic is still being routed to it: **39 requests dropped**.
- **B (short drain):** better, but still drops requests that arrive after it is gone.
- **C (`preStop` sleep + graceful drain):** keeps serving until the endpoint removal has spread, then drains: **0 dropped**. This is the standard recipe.
- **D (ignores SIGTERM):** a shell script as PID 1 without a `trap`, or a program that does not handle the signal: it runs until SIGKILL at 30 s. Slow deploys and exit code 137.
- **E (needs 40 s, has 30 s):** killed mid-work. Raise `terminationGracePeriodSeconds` or make the work resumable.

The matching manifest settings (Example, not run here):

```yaml
spec:
  terminationGracePeriodSeconds: 45
  containers:
  - name: web
    image: web:1.4.2
    lifecycle:
      preStop:
        exec:
          command: ["sh", "-c", "sleep 5"]   # give endpoint removal time to spread
```

Also make sure your application **handles SIGTERM** (finish in-flight requests, stop accepting new ones, then exit) and that your container's PID 1 passes signals on (use `exec` in start scripts, or an init process such as `tini`).

## 5. What to look at when a Pod is stuck, by lifecycle stage

| Stuck at | Look at |
| --- | --- |
| `Pending`, no node | `kubectl describe pod` events: resources, taints, node selectors, PVC not bound |
| `ContainerCreating` | events: image pull, volume mount, CNI |
| `Init:N/M` or `Init:CrashLoopBackOff` | `kubectl logs POD -c INIT_NAME` |
| `Running` but not Ready | readiness probe in `describe`; Service endpoints |
| `CrashLoopBackOff` | `logs --previous`, exit code, memory limit, liveness probe too strict |
| `Terminating` for minutes | finalizers, a volume that will not detach, an unreachable node |

## Further reading you suggested

The newsletter TechOps Examples has two posts on this topic: [Kubernetes pod lifecycle, behind the scenes](https://www.techopsexamples.com/p/kubernetes-pod-lifecycle-behind-the-scenes) and [Pod YAML file structure breakdown](https://www.techopsexamples.com/p/pod-yaml-file-structure-breakdown). I could not open them from my environment, so I am linking them by their titles only and did not copy or summarise them. The official reference is the [Pod lifecycle page](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) in the Kubernetes documentation.

## Common misconceptions

- "`Running` means ready for traffic." Only the **Ready** condition does.
- "`CrashLoopBackOff` is an error you fix by deleting the Pod." The cause is in the previous container's logs and exit code.
- "SIGTERM and then the Pod is gone." Without `preStop` and graceful shutdown, deploys can drop requests.
- "The grace period starts after `preStop`." It includes `preStop`.

## Practice (answers below)

1. A Pod shows `Init:1/2`. What does it mean and where do you look?
2. A container is restarted every 5 minutes with exit code 137 and reason OOMKilled. What do you change?
3. Rolling updates drop about 20 requests per Pod. Name two settings that fix it.

:::recap
- **Phase**, **conditions** and **container states** are different layers; `STATUS` in `kubectl get` is built from them.
- Order: schedule, prepare, **init containers in order**, app containers, startup probe, readiness, liveness.
- **CrashLoopBackOff** = restarts with back-off up to 5 minutes; read `logs --previous` and the **exit code** (137 = SIGKILL or OOM, 143 = SIGTERM).
- **Shutdown** runs endpoint removal and `preStop` and SIGTERM in parallel; fix drops with a short `preStop` sleep, graceful SIGTERM handling and enough grace period.
:::

:::note Answers
1. The first of two init containers has finished and the second is running or failing; use `kubectl logs POD -c INIT_NAME` and `describe` events. 2. Raise the container's memory limit (or reduce its memory use); OOMKilled means the limit was exceeded. 3. A `preStop` sleep of a few seconds (so endpoint removal spreads first) and an application that handles SIGTERM and drains; also check readiness probes and `maxUnavailable`.
:::

```quiz
? A Pod is Running but receives no traffic from its Service. What should you check first?
+ Whether its Ready condition is true (the readiness probe)
- The scheduler logs
- The node's disk
- The Dockerfile
! Services send traffic only to Ready Pods; Running is not enough.

? Which exit code usually means a container was killed with SIGKILL?
+ 137
- 0
- 1
- 143
! 137 is 128 + 9: SIGKILL, from an out-of-memory kill or from exceeding the grace period.

? What does a short preStop sleep fix during a rolling update?
+ It keeps the Pod serving while endpoint removal spreads, so in-flight and late requests are not dropped
- It speeds up image pulls
- It restarts the Pod
- It makes probes pass
! Without it the app may exit before load balancers stop sending it requests.
```
