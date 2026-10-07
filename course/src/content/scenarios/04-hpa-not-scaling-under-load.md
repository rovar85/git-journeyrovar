---
track: scenarios
title: "S4: The application is under heavy traffic and CPU is above the HPA threshold, but the Horizontal Pod Autoscaler does not scale. How do you debug it?"
short: S4 HPA not scaling
sub: How the HPA decides, the prerequisites (metrics API, resource requests), a real reproduction of the most common failure on the lab cluster, a simulator of the scaling algorithm that reproduces six "CPU is high but nothing happens" cases, and the answer an interviewer expects.
---

:::goals
- state the **HPA formula** and every **prerequisite** it needs (metrics source, **resource requests**, a valid target)
- read an HPA's **conditions and events** to find which prerequisite is missing
- explain why high CPU may not scale: **tolerance, requests-relative utilisation, max replicas, stabilisation, missing metrics, not-ready pods**
- separate **HPA problems** from **"pods created but Pending"** (cluster capacity) and from **conflicting controllers**
- answer with a **repeatable debugging order**
:::

:::note Provenance
Part 1 is **real**: the lab cluster has **no metrics server**, which is exactly the commonest cause of this symptom, so the failure output is genuine. The lab cannot supply live metrics, so the **scaling behaviour is explained with a Python simulator of the documented algorithm** (labelled). Output for commands that need a metrics API is an **Example, not run here**.
:::

```setup
export LABNS=labhpa
```

@setup k8s

## 1. How the HPA decides

Every **15 seconds** (by default) the HPA controller:

1. reads the **target's current replicas** (the `scaleTargetRef` Deployment, StatefulSet...);
2. asks the **metrics API** for the pods' metric (for CPU: the average **usage across pods**);
3. computes **utilisation as a percentage of the pods' resource *requests***;
4. applies

   `desiredReplicas = ceil( currentReplicas × currentMetricValue / targetMetricValue )`

   but **does nothing if the ratio is within a tolerance (default 10%)** of 1;
5. **clamps** to `minReplicas`/`maxReplicas`, applies the **behaviour rules** (how fast to scale up, and a **stabilisation window**: scale-down waits 5 minutes by default, so a brief dip does not remove pods), and updates the target's replica count.

So for "CPU is high but nothing scales", every step is a suspect. The prerequisites:

| Needs | Why | Typical failure |
|---|---|---|
| a **metrics API** (`metrics.k8s.io`, normally **metrics-server**) | the controller reads CPU/memory there | not installed, unhealthy, TLS/kubelet-address trouble; HPA shows `<unknown>` |
| **CPU requests** on **every container** of the pods | utilisation is **usage ÷ request** | no request means "missing request for cpu", metric invalid |
| a **correct target** | it must find the pods through the target's selector | wrong `scaleTargetRef` name/kind |
| **room to grow** | `maxReplicas`, node capacity, quotas | already at max; new pods stay Pending |
| **metrics that are real** | what you look at (a dashboard) must match what the HPA uses (a different pod set, a sidecar, a different window) | you saw 80% on a dashboard but HPA sees 8% |

## 2. Reproduce the commonest cause (real)

Create a Deployment and an HPA, and look at what the HPA reports:

```run
kubectl create deployment web --image=busybox:1.36 -- sleep 3600 > /dev/null
kubectl autoscale deployment web --cpu=50% --min=1 --max=5 2>&1 | tail -1
sleep 30
echo "--- the first thing to look at:"
kubectl get hpa
echo
echo "--- why (conditions):"
kubectl describe hpa web | sed -n '/Conditions:/,/Events:/p' | cut -c1-210
```

**What you see:** the **TARGETS** column shows **`<unknown>/50%`** and the **`ScalingActive`** condition is **False** with `FailedGetResourceMetric`. **An `<unknown>` target means the HPA cannot read a metric**, so it **will never scale**, no matter how busy the pods are. Now confirm the missing piece:

```run
echo "--- is a metrics API registered?"
kubectl get apiservices | grep -i metrics || echo "no metrics.k8s.io APIService is registered"
echo
echo "--- does kubectl top work? (it uses the same API)"
kubectl top pods 2>&1 | head -2
```

On a real cluster you would find the metrics-server and check its health:

```term
$ kubectl get apiservice v1beta1.metrics.k8s.io
NAME                     SERVICE                      AVAILABLE   AGE
v1beta1.metrics.k8s.io   kube-system/metrics-server   False (FailedDiscoveryCheck)   3d

$ kubectl -n kube-system logs deploy/metrics-server | tail -3
E ... scraper.go: "Failed to scrape node" err="Get \"https://10.0.1.12:10250/metrics/resource\": x509: cannot validate certificate ..."
# Example, not run here: typical causes are kubelet certificate trust (--kubelet-insecure-tls only for labs),
# the node address type, a blocked port 10250, or the deployment simply not being installed.
```

**Fix the cause, not the symptom:** install or repair metrics-server (a managed cluster usually offers it as an add-on), make sure it can reach **port 10250 on the nodes** (security groups/firewalls), and check the **APIService shows `AVAILABLE: True`** and that **`kubectl top pods`** returns numbers. Only then does the HPA have anything to read.

## 3. The second commonest cause: no CPU request

With a working metrics API, an HPA on **CPU utilisation** still needs a **request**, because utilisation is **a percentage of the request**:

```term
$ kubectl describe hpa web
Conditions:
  ScalingActive  False  FailedGetResourceMetric  the HPA was unable to compute the replica count:
      failed to get cpu utilization: missing request for cpu in container "app" of Pod "web-6c9d..."
# Example, not run here.
```

Fix: set `resources.requests.cpu` on **every container, including sidecars** (a service-mesh proxy without a request makes the whole pod's utilisation invalid). Setting the request also **defines the meaning of the percentage**: a 50% target on a 100m request scales at 50m of use; on a 1000m request, at 500m.

```yaml:hpa-ok
# Example, not run here: a healthy HPA and the Deployment it needs
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: {name: web}
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: web}
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource: {name: cpu, target: {type: Utilization, averageUtilization: 60}}
  behavior:
    scaleUp:   {stabilizationWindowSeconds: 0,   policies: [{type: Percent, value: 100, periodSeconds: 15}]}
    scaleDown: {stabilizationWindowSeconds: 300, policies: [{type: Percent, value: 50,  periodSeconds: 60}]}
---
# in the Deployment's container:
#   resources: {requests: {cpu: 250m, memory: 256Mi}, limits: {memory: 256Mi}}
```

## 4. Simulating the algorithm: six reasons "CPU is high but nothing scales"

The lab cannot feed the HPA metrics, so here is a **simulator of the documented algorithm** (formula, 10% tolerance, clamping, a scale-down stabilisation window). Each scenario is a case an engineer meets.

```run
mkdir -p ~/s4 && cd ~/s4
cat > hpa_sim.py <<'PY'
import math

TOLERANCE = 0.10

def desired(current, usage_per_pod_m, request_m, target_pct, min_r, max_r, not_ready=0, missing=0):
    """One HPA evaluation. usage in millicores per pod, request in millicores per pod."""
    ready = current - not_ready - missing
    if ready <= 0:
        return current, "no usable metrics"
    util = 100.0 * usage_per_pod_m / request_m                   # utilisation is relative to the REQUEST
    # pods missing metrics are assumed 0% when scaling up (conservative): dilute the average
    avg = util * ready / (ready + missing) if missing else util
    ratio = avg / target_pct
    if abs(ratio - 1.0) <= TOLERANCE:
        return current, f"within tolerance (utilisation {avg:.0f}% vs target {target_pct}%)"
    want = math.ceil(ready * ratio) if not missing else math.ceil((ready + missing) * ratio)
    clamped = max(min_r, min(max_r, want))
    note = f"utilisation {avg:.0f}% vs target {target_pct}% -> wants {want}"
    if clamped != want: note += f", clamped to {clamped} by min/max"
    return clamped, note

cases = [
    ("1. works as designed",                          dict(current=4, usage_per_pod_m=900, request_m=1000, target_pct=50, min_r=2, max_r=20)),
    ("2. within the 10% tolerance",                   dict(current=4, usage_per_pod_m=530, request_m=1000, target_pct=50, min_r=2, max_r=20)),
    ("3. big request: 'busy' is only 8% of request",  dict(current=4, usage_per_pod_m=80,  request_m=1000, target_pct=50, min_r=4, max_r=20)),
    ("4. already at maxReplicas",                     dict(current=10, usage_per_pod_m=900, request_m=1000, target_pct=50, min_r=2, max_r=10)),
    ("5. some pods missing metrics (dilutes)",        dict(current=4, usage_per_pod_m=900, request_m=1000, target_pct=50, min_r=2, max_r=20, missing=2)),
    ("6. every pod not ready / no metrics",           dict(current=4, usage_per_pod_m=900, request_m=1000, target_pct=50, min_r=2, max_r=20, not_ready=4)),
]
print(f"{'case':48} {'replicas now':>12} -> {'next':>4}   reason")
for name, kw in cases:
    nxt, why = desired(**kw)
    print(f"{name:48} {kw['current']:12} -> {nxt:4}   {why}")
PY
python3 hpa_sim.py
```

**What you see:** case 1 scales (4 to 8); case 2 does not (**tolerance**); case 3 does not scale up because the **request is large**, so the pod uses only 8% of it even though a dashboard showing absolute CPU might look "busy" (the HPA would even like fewer pods, but `minReplicas` holds it at 4); case 4 is stuck at **maxReplicas**; case 5 shows how **pods missing metrics** (new pods, a failing sidecar metric) **dilute** the average; case 6 has **no usable metrics**.

### Timing: scale-up is quick, scale-down is deliberately slow

```run
cd ~/s4
cat > timeline.py <<'PY'
import math

TARGET, REQUEST, MIN_R, MAX_R = 50, 1000, 2, 12
WINDOW_DOWN = 300                  # seconds: scale-down stabilisation (default 5 minutes)
TICK = 15                          # HPA sync period
load_total_m = lambda t: 1600 if t < 60 else (5200 if t < 360 else 900)      # total CPU demand in millicores over time

replicas, history, last_note = 3, [], None
print(f"{'t(s)':>5} {'demand(m)':>10} {'replicas':>9} {'utilisation':>12} {'recommended':>12}  note")
for t in range(0, 720, TICK):
    util = 100 * load_total_m(t) / (replicas * REQUEST)
    rec = max(MIN_R, min(MAX_R, math.ceil(replicas * util / TARGET)))
    if abs(util / TARGET - 1) <= 0.10: rec = replicas
    history.append((t, rec))
    window = [r for (tt, r) in history if tt > t - WINDOW_DOWN]            # recommendations in the last 5 minutes
    if rec > replicas:  new, note = min(rec, max(replicas * 2, replicas + 4)), "scale up (limited to +100% or +4 per period)"
    elif rec < replicas:
        new = max(rec, max(window)) if max(window) < replicas else replicas  # hold at the highest recent recommendation
        note = "scale down only if EVERY recommendation in the window agrees" if new < replicas else "scale-down blocked by stabilisation window"
    else: new, note = replicas, ""
    if replicas != new or t in (0, 360) or (note and note != last_note):
        print(f"{t:5} {load_total_m(t):10} {replicas:9} {util:11.0f}% {rec:12}  {note}")
    last_note = note
    replicas = new
PY
python3 timeline.py
```

**What you see:** at t=60 demand jumps; replicas **climb in bursts** (here +4 per 15-second period, from 3 to 7 to 11), not instantly. When the load falls at t=360, the HPA **keeps the replicas for about five minutes** (every recommendation in the last 300 s must agree), which is why people say "the HPA never scales down". It is the **stabilisation window**, and it is tunable under `behavior`.

## 5. The debugging order

1. **`kubectl get hpa`**: is TARGETS `<unknown>`? If yes, it is a **metrics problem** (go to 2). If it shows numbers, continue.
2. **`kubectl describe hpa`**: read **Conditions** (`AbleToScale`, `ScalingActive`, `ScalingLimited`) and **Events**. `FailedGetResourceMetric` points at the metrics API or a **missing request**; `ScalingLimited: True (TooManyReplicas)` means **maxReplicas**; `TooFewReplicas` means min.
3. **Metrics API:** `kubectl get apiservice v1beta1.metrics.k8s.io`; `kubectl top pods`; metrics-server logs (kubelet cert, port 10250).
4. **Requests:** `kubectl get deploy web -o yaml | grep -A4 requests` for **every container** including sidecars.
5. **Math:** compute utilisation yourself: `kubectl top pod` ÷ request. Compare to target and the **10% tolerance**.
6. **Target:** is `scaleTargetRef` right? Does the selector find the pods? Is another controller **managing replicas** (a `replicas:` field reapplied by GitOps or Helm on every sync, a **VPA** in auto mode, **KEDA**)? That "fights" the HPA.
7. **Behaviour:** `behavior.scaleUp` policies and `stabilizationWindowSeconds`.
8. **After scaling works but traffic still suffers:** are the new pods **Pending** (no node capacity, so the **cluster autoscaler** must add nodes), failing **readiness**, or slow to start (image pulls, init containers)? The HPA only changes a number; it does not create capacity.
9. **Wrong metric:** CPU may not track load (I/O-bound services, queue consumers). Use **custom or external metrics** (requests per second, queue length) via an adapter or **KEDA**.

## 6. The answer an interviewer expects

1. **State how it works first** (formula, metrics API, requests, tolerance, stabilisation); it shows you can reason, not just run commands.
2. **First command:** `kubectl get hpa` and `kubectl describe hpa`; read TARGETS, conditions and events. "`<unknown>` means it cannot read metrics, so I'd check metrics-server and whether the pods have CPU requests."
3. **Then check the arithmetic**: utilisation is relative to **requests**; compare to the target and the tolerance; check min/max.
4. **Then the environment:** pods Ready? New pods Pending (node capacity, quotas, the cluster autoscaler)? Another controller overriding replicas?
5. **Fix and prevent:** metrics-server health alerting; **a policy that every container has requests**; load tests that confirm the HPA scales; tuned `behavior`; the right metric for the workload.

A spoken version: *"I'd start with `kubectl get hpa` and `describe`. If TARGETS is unknown it's a metrics problem: metrics-server health or missing CPU requests. If it shows numbers, I'd check the maths: utilisation is relative to the request, there is a 10% tolerance, and maybe it's already at max. Then I'd look at the stabilisation settings, whether another controller fights over replicas, and whether new pods are Pending because the cluster has no capacity. Finally I'd ask whether CPU is even the right signal for this service."*

:::warn Common mistakes
- **Assuming the HPA reads your dashboard**: it reads the **metrics API**, as a **percentage of requests**.
- **No requests** (or requests only on the main container).
- **A giant request** (utilisation always looks low) or a **tiny** one (always high, thrashes).
- **Leaving `replicas:` in a manifest** that GitOps keeps re-applying.
- **Expecting instant scale-down.**
- **Blaming the HPA when pods are Pending**: that is cluster capacity.
- **Using CPU for an I/O or queue-bound service.**
:::

## 7. Follow-up questions to expect

- **"HPA vs VPA vs cluster autoscaler?"** HPA changes **replica count**; VPA changes **pod resource requests**; the cluster autoscaler (or Karpenter) changes **node count** so pending pods fit. Do not run HPA and VPA on the same CPU metric.
- **"How would you scale on queue depth?"** An external-metrics adapter or KEDA, with a target of messages per replica.
- **"Why does it flap?"** Too-sensitive target, short windows, a metric that jumps; widen the windows, use a tolerance, raise the target.
- **"Memory-based scaling?"** Possible, but memory rarely falls after load drops (garbage collectors hold it), so it is a poor scaling signal.

:::try
1. In `hpa_sim.py` add a case with **two containers** where the sidecar has a request but uses little. How would the pod's utilisation change?
2. In `timeline.py` set `WINDOW_DOWN = 60` and compare the scale-down time.
3. Add a case where `max_r` is 100 and the demand needs 150 pods. What do you watch for next?
4. Write the `kubectl` commands you would run for each of the nine debugging steps.
:::

:::recap
- The HPA computes `ceil(replicas × utilisation ÷ target)`, ignoring changes within a **10% tolerance**, with **min/max** and **behaviour** rules.
- It needs a **metrics API** and **CPU requests on every container**; `<unknown>` in `kubectl get hpa` means it cannot read metrics.
- Utilisation is **relative to requests**: dashboards in absolute CPU can mislead.
- Scale-up is quick; **scale-down waits** (stabilisation window).
- The HPA changes a number: **Pending pods** are a capacity problem (cluster autoscaler); other controllers can **fight** it.
:::

:::quiz
? `kubectl get hpa` shows `<unknown>/50%`. What does it mean?
- Everything is fine
+ The HPA cannot read the metric (metrics API problem or missing request), so it will not scale
- The target is too low
! Check metrics-server and CPU requests.

? A pod has a 1000m CPU request and uses 80m. With a 50% target, what does the HPA see?
- 80% utilisation
+ About 8% utilisation, so it does not scale up
- 50%
! Utilisation is usage divided by the request.

? Why does scale-down seem slow?
- A bug
+ The default five-minute stabilisation window requires all recent recommendations to agree
- The cluster autoscaler
! It prevents flapping; tune it under behavior.

? Pods created by the HPA stay Pending. Whose job is it to add capacity?
- The HPA
+ The cluster autoscaler (or node provisioner); the HPA only changes the replica count
- The kubelet
! Look at scheduling events.

? What is a common reason an HPA's replica count keeps resetting?
- A low target
+ Another controller or a GitOps sync re-applies a fixed replicas value
- Too many nodes
! Remove replicas from the managed manifest.
:::
