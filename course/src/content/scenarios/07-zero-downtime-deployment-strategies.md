---
track: scenarios
title: "S7: You must deploy a new version of a critical microservice to production with no downtime. Which deployment strategies would you implement?"
short: S7 Zero-downtime deploys
sub: Rolling, recreate, blue/green, canary, shadow and feature flags compared, then the part most answers miss: a measured experiment on a live cluster showing a rolling update that drops requests and the readiness, graceful-shutdown and surge settings that make it lose none.
---

:::goals
- compare **recreate, rolling, blue/green, canary, shadow and feature-flag** releases and choose among them
- explain why a naive rolling update **drops requests** and what makes it lossless: **readiness probes, surge without unavailability, graceful shutdown (preStop, SIGTERM, grace period)**
- **measure** dropped requests on a live cluster, before and after the fix
- cover the hard parts: **database changes, backward compatibility, sessions, rollback, disruption budgets**
- give an answer that picks a strategy by **risk**, not by habit
:::

:::note Provenance
The rolling-update experiment is **real**: a small web service on the lab Kubernetes cluster, a load generator counting successful and failed requests, three manifests compared. The numbers printed are from the lab and **will vary slightly** per run. Blue/green and canary on a live cluster, plus automated promote or rollback, are in **Q10 of the senior cloud track**; here they are summarised and compared. Service-mesh traffic splitting is an **Example, not run here**.
:::

```setup
export LABNS=labzd
```

@setup k8s

## 1. The strategies

| Strategy | How it works | Downtime | Extra cost | Rollback | Best when |
|---|---|---|---|---|---|
| **Recreate** | stop all old, start all new | **yes** (a gap) | none | redeploy | non-critical, or versions cannot run together |
| **Rolling update** | replace pods **gradually**; old and new serve together | none **if configured well** | a little (surge) | `rollout undo` (also gradual) | default for stateless services with **backward-compatible** versions |
| **Blue/green** | run a **full new environment** beside the old; **switch traffic at once** (service selector, load balancer, DNS) | none | **2× capacity** while both exist | **instant** switch back | big or risky changes, need instant rollback |
| **Canary** | send a **small percentage** to the new version, **measure**, then increase | none | small | route back to 0% | the risk is in **real traffic behaviour**; you have good metrics |
| **Shadow (mirror)** | copy real requests to the new version; **responses are discarded** | none (no user impact) | duplicate load | n/a | validate a rewrite or new dependency under real load |
| **Feature flags** | ship code **dark**, enable per user or percentage at runtime | none | small | flip the flag (seconds) | decouple **deploy** from **release**; the safest rollback |
| **A/B test** | like canary but to compare **business outcomes** | none | small | stop the test | product experiments |

"No downtime" is a combination, not a single choice. A strong answer for a **critical microservice**: **rolling update with proper health checks as the baseline, canary (with automated analysis) for risky releases, feature flags for risky behaviour, blue/green when you need instant rollback, and backward-compatible changes underneath all of them.**

## 2. Why a rolling update can still drop requests (measured)

A rolling update replaces pods one by one. Requests are lost when the **load balancer sends traffic to a pod that cannot serve it**, in two places:

1. **At startup:** a new pod is marked **Ready** (and added to the Service) **before the application is listening**, because there is **no readiness probe** (a container counts as ready as soon as it starts).
2. **At shutdown:** a terminating pod receives **SIGTERM** at about the same moment it is **removed from the Service's endpoints**; the removal takes time to reach every node's proxy, so for a moment **traffic still arrives at a pod that is already shutting down**.

Here is the experiment. The service **takes 8 seconds to start listening** (like an application loading caches). A load generator pod calls it about ten times a second and counts successes and failures. We roll out a new version and read the difference in the counters.

```run
mkdir -p ~/s7 && cd ~/s7
cat > naive.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: shop}
spec:
  replicas: 3
  selector: {matchLabels: {app: shop}}
  strategy: {type: RollingUpdate, rollingUpdate: {maxUnavailable: 1, maxSurge: 1}}
  template:
    metadata: {labels: {app: shop}}
    spec:
      containers:
      - name: app
        image: busybox:1.36
        env: [{name: VERSION, value: v1}]
        command: ["sh","-c","sleep 8; mkdir -p /www; echo $VERSION > /www/index.html; exec httpd -f -p 8080 -h /www"]
        ports: [{containerPort: 8080}]
---
apiVersion: v1
kind: Service
metadata: {name: shop}
spec: {selector: {app: shop}, ports: [{port: 80, targetPort: 8080}]}
EOF

cat > experiment.sh <<'SH'
#!/bin/bash
# usage: experiment.sh <manifest>   (rolls shop from v1 to v2 while a client hammers the Service)
kubectl delete pod load --ignore-not-found --wait=true > /dev/null 2>&1
kubectl delete deploy shop --ignore-not-found --wait=true > /dev/null 2>&1
kubectl apply -f "$1" > /dev/null
kubectl rollout status deploy/shop --timeout=180s > /dev/null
kubectl run load --image=busybox:1.36 -- sh -c 'ok=0; fail=0; while true; do if wget -q -T1 -O /tmp/o http://shop/ 2>/dev/null; then ok=$((ok+1)); else fail=$((fail+1)); fi; echo "$ok $fail" > /tmp/count; sleep 0.1; done' > /dev/null
kubectl wait --for=condition=Ready pod/load --timeout=60s > /dev/null
sleep 30                                                # let everything warm up before measuring
read ok0 fail0 < <(kubectl exec load -- cat /tmp/count)
kubectl set env deploy/shop VERSION=v2 > /dev/null    # change the pod template -> rolling update
kubectl rollout status deploy/shop --timeout=240s | tail -1
sleep 4
read ok1 fail1 < <(kubectl exec load -- cat /tmp/count)
ok=$((ok1 - ok0)); fail=$((fail1 - fail0)); total=$((ok + fail))
echo "during the rollout: $total requests, $fail failed ($((100 * fail / total))%)"
SH
chmod +x experiment.sh
echo "=== A: default rolling update, no readiness probe, no graceful shutdown"
./experiment.sh naive.yaml
```

**What you see:** a large share of requests **failed during the rollout** (the exact percentage varies; it is often more than half). With no readiness probe, each new pod received traffic **8 seconds before it could answer**, and old pods were killed while still in rotation. This is a **production incident** for a "zero-downtime" claim.

## 3. The fix: three settings that make a rolling update lossless

```yaml:lossless
# the three changes (the experiment below applies them)
strategy:
  type: RollingUpdate
  rollingUpdate: {maxUnavailable: 0, maxSurge: 1}     # 1) never remove capacity before a replacement is READY
spec:
  terminationGracePeriodSeconds: 30                   # 3) time to finish in-flight requests after SIGTERM
  containers:
  - name: app
    readinessProbe:                                   # 2) only receive traffic once the app answers
      httpGet: {path: /, port: 8080}
      periodSeconds: 2
      failureThreshold: 2
    lifecycle:
      preStop: {exec: {command: ["sleep","5"]}}       # 3) keep serving while endpoint removal propagates
```

1. **`maxUnavailable: 0`, `maxSurge: 1`**: start a new pod first and wait for it to be **Ready**; only then remove an old one. Capacity never drops below the replica count.
2. **Readiness probe**: the pod joins the Service **only when it can answer**. (A **startup probe** helps slow starters; a **liveness probe** restarts a stuck app, but do not point it at dependencies.)
3. **Graceful shutdown**: on termination Kubernetes (a) removes the pod from endpoints and (b) runs the **`preStop` hook**, then (c) sends **SIGTERM**, then (d) waits up to **`terminationGracePeriodSeconds`** before SIGKILL. The `preStop sleep` bridges the **propagation gap**; your app should **handle SIGTERM** by **finishing in-flight requests, closing keep-alive connections, and exiting** (a common bug is an app that ignores SIGTERM and is killed after the full grace period, or one that exits instantly and drops active requests).

```run
cd ~/s7
sed -e 's/maxUnavailable: 1/maxUnavailable: 0/' naive.yaml > lossless.yaml
python3 - <<'PY'
s = open("lossless.yaml").read()
s = s.replace("    spec:\n      containers:", "    spec:\n      terminationGracePeriodSeconds: 30\n      containers:")
s = s.replace("        ports: [{containerPort: 8080}]\n",
              "        ports: [{containerPort: 8080}]\n"
              "        readinessProbe: {httpGet: {path: /, port: 8080}, periodSeconds: 2, failureThreshold: 2}\n"
              "        lifecycle: {preStop: {exec: {command: [\"sleep\",\"5\"]}}}\n")
open("lossless.yaml", "w").write(s)
PY
echo "=== B: maxUnavailable 0 + readiness probe + preStop + grace period"
./experiment.sh lossless.yaml
```

**What you see:** **zero failed requests** during the same rollout, with the same application and the same load. The rollout takes **longer** (each new pod must become Ready before the next step), which is the price of safety.

For comparison, **Recreate** with the same probes is not lossless by design: all pods go away first, so there is a **gap**:

```run
cd ~/s7
python3 - <<'PY'
s = open("lossless.yaml").read()
s = s.replace("strategy: {type: RollingUpdate, rollingUpdate: {maxUnavailable: 0, maxSurge: 1}}", "strategy: {type: Recreate}")
open("recreate.yaml", "w").write(s)
PY
echo "=== C: Recreate strategy (same probes)"
./experiment.sh recreate.yaml
```

**What you see:** failed requests again (a smaller share than the naive rolling update, because the gap is short here, but **any** gap is downtime), because there is a period with **no ready pod**. Recreate is only acceptable when downtime is acceptable (batch, internal tool, or versions that cannot coexist).

## 4. The other settings that decide "no downtime"

- **PodDisruptionBudget (PDB):** during **node drains and upgrades** (voluntary disruptions) Kubernetes must not evict too many replicas at once. A PDB such as `minAvailable: 2` blocks evictions that would drop below it. It does **not** protect against crashes.
- **Enough replicas** (at least 2, usually 3, spread over **zones** with topology spread or anti-affinity).
- **Resource requests and an HPA** so a surge of traffic during the release does not overload fewer pods (S4).
- **Connection draining at the load balancer** (ALB/NLB deregistration delay) for traffic arriving from **outside** the cluster, aligned with the pod's grace period.
- **Long-lived connections** (WebSockets, gRPC): clients must **reconnect gracefully**; send a "go away" signal and let the load balancer rebalance.
- **Sticky sessions and state:** keep services **stateless** (sessions in a shared store) or rolling replacement will log users out.
- **Caches and cold starts:** warm up inside the readiness gate, not after it.

```run
cd ~/s7
kubectl delete deploy shop --ignore-not-found > /dev/null
kubectl apply -f lossless.yaml > /dev/null
kubectl rollout status deploy/shop --timeout=120s > /dev/null
kubectl create poddisruptionbudget shop-pdb --selector=app=shop --min-available=2 > /dev/null
kubectl get pdb shop-pdb
```

**What you see:** `ALLOWED DISRUPTIONS 1`: with 3 replicas and `minAvailable: 2`, a drain may evict **one pod at a time**, which is what keeps a node upgrade from taking the service down.

## 5. Beyond rolling: blue/green, canary, shadow, flags

- **Blue/green:** deploy the new version as a **second Deployment** (green) with its own label, **test it with real smoke tests**, then **switch the Service selector** (or the load balancer target group) in one step; rollback is the **reverse switch**. Costs double capacity during the change; **database compatibility** still applies because both versions may touch the same data. (Run for real in Q10.)
- **Canary:** route a small share (1%, then 5%, 25%, 100%) and **compare error rate and latency to the stable version** at each step, with an **automated promote or abort**. On plain Kubernetes the share is approximate (it follows replica counts); **ingress controllers, service meshes (Istio, Linkerd) or Argo Rollouts and Flagger** provide exact percentages and header-based routing.
- **Shadow:** mirror requests to the new version with responses discarded; compare outputs and resource use. **Be careful with side effects** (the shadow must not send emails or charge cards; stub or block writes).
- **Feature flags:** deploy the code switched **off**; enable for staff, then 1%, then everyone; **rollback is turning it off**, no redeploy. Treat flags as **temporary** (remove them) and test both paths.

```yaml:canary-example
# Example, not run here: a progressive canary with automated analysis (Argo Rollouts style)
apiVersion: argoproj.io/v1alpha1
kind: Rollout
spec:
  strategy:
    canary:
      steps:
      - setWeight: 5
      - pause: {duration: 5m}
      - analysis: {templates: [{templateName: error-rate-and-latency}]}
      - setWeight: 25
      - pause: {duration: 10m}
      - setWeight: 100
```

## 6. The hardest part: data and compatibility

All strategies run **old and new code at the same time** (rolling, canary) or **against the same database** (blue/green). So changes must be **backward compatible**:

- **Expand and contract (parallel change):** (1) **expand**: add the new column or table, **keep the old**; (2) deploy code that **writes both** and reads the old; (3) **backfill**; (4) deploy code that **reads the new**; (5) **contract**: remove the old only after no version uses it. Never rename or drop a column in the same release as the code change.
- **API compatibility:** add fields, do not remove or change meaning; version breaking changes; consumers tolerate unknown fields.
- **Message formats** on queues: both versions must read each other's messages.
- **Schema migrations run as a separate, reversible step** (a migration job before the rollout), and are tested against a copy of production data.

## 7. Rollback and verification

- **Automate verification:** after each step check **readiness, error rate, latency (SLOs, Q12)**; **abort and roll back automatically** on regression. `kubectl rollout status` returning is **not** proof that the release is healthy (S3).
- **Rollback options:** `kubectl rollout undo` (rolling back is also a rolling update, so the same settings protect it), switch blue/green back, route canary to 0%, flip the feature flag. Know which is **fastest** for your service and **rehearse** it.
- **Pin by digest** so rollback goes to exactly the previous bytes (S3).

## 8. The answer an interviewer expects

1. **Clarify risk:** how critical, how fast must rollback be, can old and new versions coexist, is there a database change?
2. **Baseline:** **rolling update** with `maxUnavailable: 0`, **readiness (and startup) probes**, **graceful shutdown (preStop, SIGTERM, grace period)**, **PDB**, enough replicas across zones.
3. **For risky releases:** **canary with automated metric analysis** (SLO-based promote or rollback), or **blue/green** for instant rollback; **feature flags** to decouple deploy from release; **shadow** to validate big rewrites.
4. **Compatibility:** **backward-compatible** code, **expand/contract** database migrations, API versioning.
5. **Prove it:** run a **load test during deploys** and measure errors (as in this lesson), alert on release health, and rehearse rollback.

A spoken version: *"There's no single strategy. My baseline is a rolling update with maxUnavailable zero, readiness probes, graceful shutdown, and a disruption budget, and I would measure errors under load during a deploy to prove it, because a default rolling update can drop requests. For riskier changes I'd use a canary with automated analysis or blue/green for instant rollback, and feature flags to separate deploy from release. Underneath, every change is backward compatible, with expand and contract migrations, so old and new versions can safely run side by side."*

:::warn Common mistakes
- **No readiness probe** (or one that checks the wrong thing, or that always returns OK).
- **`maxUnavailable` left at the default** for a service that cannot lose capacity.
- **An app that ignores SIGTERM** or **exits instantly**; no preStop to cover endpoint propagation.
- **Liveness probes that depend on downstream services**, causing restart storms.
- **Breaking database or API changes** shipped in the same release as the code.
- **Calling a release "successful" because `kubectl apply` returned.**
- **A canary without metrics**: you are just doing a slow rollout.
- **A single replica**: there is no zero-downtime with one pod.
:::

## 9. Follow-up questions to expect

- **"Blue/green versus canary?"** Blue/green switches everything at once with instant rollback but doubles capacity and exposes all users to a bad release; canary limits exposure and learns from real traffic but needs good metrics and traffic splitting.
- **"How do you deploy a database migration without downtime?"** Expand/contract, backward-compatible changes, online schema-change tools for big tables, migrations as a separate step.
- **"What if the new version is not backward compatible?"** Use blue/green with a coordinated cutover, or introduce a compatibility layer and migrate in phases; as a last resort accept a maintenance window with a communicated plan.
- **"How do you handle WebSocket clients during a rollout?"** Graceful close with reconnect and backoff, drain connections, spread reconnections to avoid a thundering herd.
- **"How do you know it worked?"** SLO-based checks (error rate, latency, saturation) compared to baseline before and after, not the deploy command's exit code.

:::try
1. In `lossless.yaml` remove the `preStop` hook only and re-run `experiment.sh`. Does it still reach 0 failures? (Try several runs: the race is timing-dependent.)
2. Change `maxSurge` to 2 and the replicas to 5. How does the rollout time change?
3. Add a startup that takes 20 seconds. What do you change so the readiness probe does not mark the pod unhealthy too early?
4. Write the sequence of releases for renaming a database column with zero downtime.
:::

:::recap
- **Rolling** is the baseline, **blue/green** gives instant rollback, **canary** limits risk with real metrics, **shadow** tests without exposure, **flags** separate deploy from release.
- A default rolling update **can drop requests** (traffic before readiness, and during shutdown); measured failures disappeared with **`maxUnavailable: 0`, a readiness probe, preStop and a grace period**.
- Add **PDBs, several replicas across zones, load-balancer draining** and stateless design.
- Everything depends on **backward-compatible** data and APIs (**expand and contract**).
- **Verify with metrics** and **rehearse rollback**; the answer is a combination chosen by risk.
:::

:::quiz
? Why can a default rolling update lose requests?
- Kubernetes is unreliable
+ New pods can receive traffic before the app listens, and terminating pods can still get traffic while shutting down
- The Service is slow
! Fix with readiness, maxUnavailable 0, preStop and grace period.

? What does `maxUnavailable: 0` guarantee?
- No new pods
+ Old capacity is not removed until a replacement is Ready
- Faster rollouts
! It trades speed for safety.

? What does a PodDisruptionBudget protect against?
- Application crashes
+ Too many replicas being evicted at once during voluntary disruptions such as node drains
- Image pull errors
! It does not cover crashes.

? Which strategy gives the fastest rollback?
- Recreate
+ Blue/green (switch back) or a feature flag (turn it off)
- Rolling update
! Both avoid a gradual redeploy.

? What is the key rule for database changes in a zero-downtime release?
- Run them during a maintenance window
+ Make them backward compatible (expand and contract), so old and new code work at the same time
- Rename columns first
! Remove old structures only after no version uses them.
:::
