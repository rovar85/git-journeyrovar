---
track: seniorqa
title: "Q15: Design a self-healing platform"
short: Q15 Self-healing
sub: The layers of automatic recovery from the container to the release, the control-loop pattern, and the guard rails that stop automation from making an outage worse.
---

:::goals
- explain self-healing as a control loop: observe, compare with desired state, act
- list the layers: container, pod, node, traffic, release, config, capacity, data
- design guard rails: restart budgets, safe floors, escalation, and rate limits on automation
- say what should still page a human
:::

:::note How this connects
Probes are in [Kubernetes 7](#kubernetes-7), autoscaling in [Kubernetes 13](#kubernetes-13) and troubleshooting in [Kubernetes 9](#kubernetes-9); alerting is in [Monitoring](#monitoring-1) and [Scenarios 12](#scenarios-12); retries and breakers are in [Q16](#seniorqa-11).
:::

## Design a self-healing platform

**What the interviewer tests:** do you see that self-healing is **reconciliation toward a desired state**, do you cover **more than restarting pods**, and do you know that automation can **make an outage worse** unless it is bounded?

### Clarifying questions

- What failures are common here: crashes, bad deploys, node loss, dependency outages, capacity? Heal the failures that actually occur first.
- What is the cost of a wrong automatic action (restarting a database primary is not like restarting a stateless pod)?
- Who is on call, and what do they want automated versus to be paged for?
- Which tools exist: Kubernetes, a service mesh, a cloud autoscaler, an incident platform?

### The core idea: the control loop

Every self-healing mechanism is the same loop: **observe** the real state, **compare** it with the desired state, **act** to reduce the difference, repeat. Kubernetes is built on it: a Deployment says "6 replicas"; the controller notices 5 and starts one. Your platform should use the loop at every layer, and add **bounds** so the loop cannot run away.

### The layers

| Layer | Detects | Heals with |
|---|---|---|
| Container | Hung or crashed process | **Liveness probe** restart; **readiness probe** removes it from traffic; **startup probe** for slow starters |
| Pod | Pod gone or evicted | Deployment/ReplicaSet recreates; **PodDisruptionBudget** protects during maintenance; topology spread |
| Node | Node NotReady, disk or memory pressure | Node auto-repair, cluster autoscaler replaces nodes, taints and tolerations, drain |
| Traffic | Slow or failing backends | Load-balancer health checks, **outlier ejection**, **circuit breakers**, timeouts, **retries with a budget** |
| Release | Bad deploy | **Progressive delivery** (Argo Rollouts, Flagger): canary analysis, automatic abort and rollback on SLO burn |
| Config | Manual drift | GitOps `selfHeal` reverts |
| Capacity | Load above or below target | **HPA/VPA/KEDA** scale; queues absorb spikes; scale-from-zero for event work |
| Data | Primary failure | Automated failover with fencing (operators, managed databases), replica promotion, **restore-tested** backups |
| Dependencies | Third-party outage | Fallbacks, cached or degraded responses, feature flags that disable the broken feature |
| Operations | Known recurring incident | **Runbook automation**: an alert triggers a tested script (clear a disk, rotate a pod, flush a cache) with logging |

### Guard rails: healing must not make it worse

The model below runs a replacement loop with a restart budget and a safe floor.

```run
mkdir -p ~/lab/seniorqa/q15 && cd ~/lab/seniorqa/q15
cat > selfheal.py <<'EOF'
# A self-healing control loop: observe -> compare with desired -> act, with guard rails so it does not make things worse.
import random
random.seed(7)
DESIRED = 6
class Fleet:
    def __init__(s): s.healthy = DESIRED; s.t = 0; s.restarts = []
fleet = Fleet()
def step(f, failures, max_restarts_per_5min=3, safe_floor=0.5, bad_release=False):
    f.healthy -= failures
    f.t += 1
    missing = DESIRED - f.healthy
    acted = "-"
    recent = [t for t in f.restarts if f.t - t < 5]
    if missing > 0:
        if f.healthy < DESIRED * safe_floor:
            acted = "ALERT human: below safe floor, automation paused"
        elif len(recent) >= max_restarts_per_5min:
            acted = "STOP: restart budget used (crash loop), escalate"
        else:
            f.healthy += missing; f.restarts.append(f.t); acted = f"replaced {missing} pod(s)"
    return acted
print("tick failures healthy action")
for failures in [1, 0, 2, 0, 1, 1, 1, 1]:
    a = step(fleet, failures)
    print(f"{fleet.t:4d} {failures:8d} {fleet.healthy:7d} {a}")
print("\nWhy the guard rails matter: a loop with no budget restarts a crash-looping pod forever and hides the real fault;")
print("a loop with no floor can 'heal' by killing the rest of a fleet that is failing for a shared reason (bad config, dead dependency).")
print("\nLayers of self-healing in a real platform:")
for l, w in [("container", "liveness probe restarts a hung process; readiness probe removes it from traffic"), ("pod", "Deployment/ReplicaSet recreates pods; PDB protects against evictions"), ("node", "node auto-repair / cluster autoscaler replaces a bad node; taints and drain"),
             ("traffic", "load balancer health checks, outlier ejection, circuit breakers, retries with budgets"), ("release", "progressive delivery (Argo Rollouts/Flagger) aborts and rolls back on SLO burn"),
             ("config", "GitOps reverts manual drift"), ("capacity", "HPA/KEDA scale on load; queues absorb spikes"), ("data", "automated failover of replicas with fencing; backups restore-tested"), ("alerts", "remediation runbooks as code; page only when automation fails")]:
    print(f"  {l:9} {w}")
EOF
python3 selfheal.py
```

What the output shows: single failures are replaced immediately. By tick 7 the loop has already used three restarts within a five-tick window, so it **stops and escalates** instead of replacing again (a crash loop is a symptom of something the restart cannot fix). When a window passes the budget recovers. The lines after the table explain the two failure modes of unbounded automation:

- **No budget:** a crash-looping pod is restarted forever, hiding the real fault and burning resources. Kubernetes applies the same idea with **exponential back-off** (`CrashLoopBackOff`).
- **No floor:** if many replicas fail because of a shared cause (bad config, dead dependency), "healing" that kills and replaces the rest can take the whole service down. Above a threshold of unhealthy members, **stop and alert a human**.

Other bounds:

- **Rate limit** every automated action (nodes replaced per hour, failovers per day).
- **Make actions idempotent** and logged; each action has an owner.
- **Dry run and audit:** new automation runs in "propose only" mode first.
- **Human override:** a way to pause automation for a service during an investigation.
- **Escalate** when automation fails or repeats: page on "automation could not fix it" and on "automation fired N times".

### What still pages a human

Healing handles known, local, reversible faults. Humans handle: unknown failures, shared-cause failures, data corruption, security incidents, and any case where automation hit its budget. Alert on **user-facing symptoms (SLO burn)**, not on every restart; restarts are logged and trended, not paged.

### Measure it

Track **MTTR** and the share of incidents resolved without a human; the number of automatic actions per week (a rising number signals a hidden defect, not success); and false actions (automation fired but there was no problem). Run **chaos experiments** (kill a pod, a node, a zone) to prove each mechanism works before an outage does.

```term
# Example (not run here): probes and a PodDisruptionBudget
livenessProbe:  {httpGet: {path: /healthz, port: 8080}, periodSeconds: 10, failureThreshold: 3}
readinessProbe: {httpGet: {path: /ready,   port: 8080}, periodSeconds: 5}
startupProbe:   {httpGet: {path: /healthz, port: 8080}, failureThreshold: 30, periodSeconds: 5}
# readiness should check dependencies the pod needs to serve; liveness should NOT (a down database must not restart every pod)
```

:::say
Self-healing is a control loop: observe the real state, compare it with the desired state, and act, and I use it at every layer. Kubernetes already covers the container and pod: liveness and readiness probes, replica controllers and disruption budgets. I add node auto-repair and the cluster autoscaler, traffic-level protection with health checks, outlier ejection and circuit breakers, progressive delivery that aborts a bad release on SLO burn, GitOps to revert drift, and automated, fenced database failover. The important part is the guard rails: restart budgets with back-off, a safe floor so automation stops when many members fail for a shared cause, rate limits on actions, and a human override, because unbounded automation turns a small fault into an outage. I page on user-facing symptoms and on "automation could not fix it", and I prove the mechanisms with chaos tests and by tracking the number of automatic actions.
:::

## Follow-up questions

:::answer What is the danger of a liveness probe that checks the database?
If the database is down, every pod fails liveness and is restarted at once, creating a bigger outage and a thundering herd on recovery. Liveness should check only the process itself; readiness may check dependencies so traffic is held back.
:::

:::answer How do you heal a stateful service?
Use an operator that knows the application: it fails over the primary with fencing, rebuilds replicas, and takes backups. Be conservative: automatic failover for a database should require quorum and a replication-lag check to avoid data loss.
:::

:::answer How do you stop automation from fighting a human?
A clear pause switch (annotation or flag) with an expiry and an alert if left on; automation logs every action to the incident channel so humans see what it did.
:::

:::answer Is auto-scaling self-healing?
It heals capacity shortfalls. It cannot fix a bug: scaling a service that leaks memory just leaks faster, and scaling a service whose dependency is down moves the pain. Use it for load, not for correctness.
:::

## Practice (answers below)

1. Why is `CrashLoopBackOff` a good design?
2. What should a readiness probe check that a liveness probe should not?
3. Name two metrics that tell you whether self-healing is working.

:::note Answers
1. It slows restarts with back-off so a pod that cannot start does not burn resources or hide the fault, and it makes the problem visible. 2. Dependencies the pod needs to serve requests (database, cache); a liveness probe checking them would restart healthy pods during a dependency outage. 3. MTTR and the share of incidents resolved automatically; also the count of automatic actions (rising means a hidden defect) and false actions.
:::

:::recap
- Self-healing = **observe, compare with desired, act**, at every layer.
- Layers: **container, pod, node, traffic, release, config, capacity, data, runbooks.**
- **Bound the automation:** budgets, back-off, safe floors, rate limits, human override.
- Page on **symptoms and on automation failure**, not on every restart.
- Prove it with **chaos tests** and track MTTR and automatic-action counts.
:::

```quiz
? Why can unbounded automatic restarts make an incident worse?
+ They can hide a crash loop or take down healthy members when the cause is shared
- Restarts are free
- They always fix the problem
- Kubernetes forbids them
! Budgets, back-off and safe floors keep automation helpful.

? What should the liveness probe check?
+ Only whether the process itself is healthy
- Every dependency the service uses
- The database schema
- The load balancer
! A dependency outage must not restart every pod.

? What does a progressive delivery tool add to self-healing?
+ Automatic abort and rollback of a bad release when SLOs burn
- Faster builds
- More replicas
- Stronger passwords
! It heals the release layer.
```
