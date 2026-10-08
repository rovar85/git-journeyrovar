---
track: qbank
title: "Kubernetes: Scenario-based questions (part 2 of 2)"
short: Kubernetes scenario 2
sub: 14 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Cluster-wide DNS stops resolving randomly across nodes. What is your step-by-step debug path?

<!-- source: 03 Q75 -->

:::note In simple words
The phone directory office answers most calls, but randomly drops some. Either too few operators (under-scaled), too many pointless calls (ndots), the phone lines get crossed (conntrack race), or the head office (upstream resolver) limits how many calls it takes.
:::

1. **Confirm and measure:** run a loop test from dnsutils pods on several nodes; note failure rate, timeouts vs NXDOMAIN/SERVFAIL, and whether failures are ~5 seconds long.
2. **CoreDNS health:** pods Running, restarts, OOMKilled, CPU throttling; logs (`SERVFAIL`, `i/o timeout` to upstream); metrics `coredns_dns_request_duration_seconds`, `coredns_dns_responses_total{rcode="SERVFAIL"}`, `coredns_forward_*`.
3. **Under-scaled:** only 2 CoreDNS replicas for a big cluster -> use **cluster-proportional-autoscaler** / more replicas, spread across nodes/AZs, raise limits.
4. **ndots:5 amplification:** every external name like `api.stripe.com` is tried with each search domain first (4-5 extra queries, A and AAAA). Fix: use FQDN with a trailing dot, or set `dnsConfig.options ndots: 2` for heavy callers; enable CoreDNS `autopath`/cache.
5. **Conntrack race (the famous 5-second timeouts):** glibc sends A and AAAA queries in parallel over UDP from the same socket; a Linux conntrack race drops one, and the client retries after 5 seconds. Fixes: **NodeLocal DNSCache** (node-local cache, upstream over TCP), `options single-request-reopen` (glibc), or avoiding musl/alpine quirks.
6. **Upstream limits:** on AWS the **VPC resolver allows 1024 packets per second per ENI**; CoreDNS pods concentrated on few nodes exceed it and packets drop. Check `linklocal_allowance_exceeded` in ENA stats (`ethtool -S`). Fix: NodeLocal DNSCache, more CoreDNS replicas spread across nodes, caching.
7. **NetworkPolicy** blocking UDP/TCP 53 to kube-system for some namespaces (big responses fall back to TCP).
8. **kube-proxy health:** stale iptables rules pointing to deleted CoreDNS pod IPs after restarts; kube-proxy errors.
9. **Node-level:** conntrack table full (`dmesg | grep conntrack`), CNI issues on specific nodes.
10. Fix, then keep **alerts** on CoreDNS latency/SERVFAIL and a synthetic DNS probe.

**Example:**
```bash
kubectl run dnsutils --rm -it --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:1.3 -- bash
  for i in $(seq 1 200); do
    start=$(date +%s%N); getent hosts api.prod.svc.cluster.local >/dev/null || echo FAIL
    echo $(( ($(date +%s%N)-start)/1000000 ))ms
  done | sort | uniq -c | sort -rn | head
  dig +search +stats payments.billing
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=100 | grep -iE "servfail|timeout"
kubectl top pods -n kube-system -l k8s-app=kube-dns
# on a node:
ethtool -S eth0 | grep linklocal_allowance_exceeded
dmesg | grep -i conntrack
```

:::say
I measure with a DNS loop test from several nodes, then check CoreDNS pods, logs and latency and SERVFAIL metrics, scaling CoreDNS if it is under-provisioned. Classic causes are ndots:5 query amplification, the UDP conntrack race that causes 5-second timeouts, and on AWS the VPC resolver limit of 1024 packets per second per ENI; NodeLocal DNSCache fixes most of these, along with checking NetworkPolicies on port 53 and kube-proxy health.
:::

## One worker node becomes NotReady. What actions do you take?

<!-- source: 03 Q76 -->

:::note In simple words
A branch office stopped answering the head office's calls. Is the office closed (machine dead), is the manager sick (kubelet), or is the phone line cut (network)? Meanwhile, move urgent work to other offices.
:::

1. **Confirm and scope:** one node or many? same AZ/node group? `kubectl get nodes`, `kubectl describe node` -> Conditions (Ready, MemoryPressure, DiskPressure, PIDPressure, NetworkUnavailable) and events.
2. **Protect workloads:** `kubectl cordon` to stop new pods; after ~5 minutes pods are evicted automatically (taint + toleration 300s); for faster recovery `kubectl drain --ignore-daemonsets --delete-emptydir-data`.
3. **Check the machine:** EC2 status checks, instance still running? Spot interruption? (cloud console / `aws ec2 describe-instance-status`).
4. **On the node (SSM Session Manager/SSH):**
- `systemctl status kubelet`, `journalctl -u kubelet` - crashed? certificate expired? cannot reach API endpoint?
- `systemctl status containerd` - runtime down.
- Disk full (`df -h`, images/logs), memory exhaustion (`free -m`, `dmesg | grep -i oom`), PID exhaustion.
- CNI: aws-node pod on that node failing, out of IPs.
- Network: SG/NACL change, route, DNS to API endpoint.
5. **Fix or replace:** restart kubelet/containerd, clean disk; in the cloud it is usually faster and safer to **terminate the node** and let the node group/Karpenter replace it (cattle, not pets).
6. **Root cause + prevention:** kubelet `system-reserved`/`kube-reserved`, eviction thresholds, log rotation, image GC, node problem detector, alerts on NotReady.

**Example:**
```bash
kubectl get nodes
kubectl describe node ip-10-0-2-40.ap-south-1.compute.internal | sed -n '/Conditions/,/Addresses/p'
kubectl cordon ip-10-0-2-40...
kubectl drain ip-10-0-2-40... --ignore-daemonsets --delete-emptydir-data --timeout=5m
aws ssm start-session --target i-0abc123
  sudo systemctl status kubelet containerd
  sudo journalctl -u kubelet --since "30 min ago" | tail -50
  df -h ; free -m ; dmesg | grep -iE "oom|conntrack" | tail
aws ec2 terminate-instances --instance-ids i-0abc123      # let ASG/Karpenter replace
```

:::say
I check node conditions and events, cordon and drain the node to protect workloads, then look at the instance status and, on the node, kubelet and containerd logs, disk, memory and CNI. If it is not a quick fix I terminate it and let the node group or Karpenter replace it, then add prevention like reserved resources, eviction thresholds and NotReady alerts.
:::

## A node went down suddenly. What happens to the pods running on it?

<!-- source: 03 Q77 -->

:::note In simple words
When a shop suddenly closes, the head office waits a few minutes in case it reopens, then reassigns its staff to other shops. Staff with their own locked cabinets (StatefulSets with disks) have to wait until it is certain the old shop is truly closed.
:::

Timeline (default settings):

1. Kubelet stops sending heartbeats (Lease objects).
2. After the **node monitor grace period (~40s, 50s in newer versions)** the node controller marks it **NotReady/Unknown** and adds taints `node.kubernetes.io/unreachable:NoExecute` (or `not-ready`).
3. Pods have a default toleration of **300 seconds** for these taints. After ~5 minutes they are **evicted** (marked Terminating; the kubelet is unreachable so they cannot actually be killed).
4. **Deployment/ReplicaSet pods:** controller creates replacements on healthy nodes right away after eviction. Traffic stops going to the dead pods much earlier, because endpoints are updated when the node is NotReady (pods marked not ready).
5. **StatefulSet pods:** NOT recreated automatically while the old pod still exists (Terminating), to avoid two pods with the same identity writing to the same disk (split brain). You must confirm the node is dead, then `kubectl delete pod --force --grace-period=0` or delete the Node object; in the cloud, the node object is removed when the instance is terminated.
6. **Volumes:** EBS (RWO) must detach from the dead node before attaching elsewhere - can take several minutes (force detach after ~6 min).
7. **DaemonSet pods:** not rescheduled (they belong to that node).
8. Bare pods (no controller) are simply lost.

To recover faster: lower `tolerationSeconds` for critical pods, multiple replicas spread across nodes/AZs, PDBs, fast node replacement.

**Example:**
```
tolerations:
- {key: node.kubernetes.io/unreachable, operator: Exists, effect: NoExecute, tolerationSeconds: 60}
- {key: node.kubernetes.io/not-ready,   operator: Exists, effect: NoExecute, tolerationSeconds: 60}

kubectl get pods -o wide | grep <dead-node>          # Terminating / Unknown
kubectl delete pod mongo-1 --force --grace-period=0  # only after confirming node is dead
```

:::say
The node is marked NotReady after about 40 to 50 seconds and tainted, pods are removed from endpoints, and after the default 300-second toleration they are evicted and Deployments recreate them on healthy nodes. StatefulSet pods are not replaced until the node is confirmed gone, to avoid split brain, and EBS volumes need to detach first, so I tune tolerationSeconds for critical apps and always spread replicas.
:::

## A node has reached (exhausted) its Pod capacity. What would you check first, and what would you do?

<!-- source: 03 Q78 -->

:::note In simple words
A parking lot has a fixed number of spots. Even if there is space on the ground (free CPU/memory), when all numbered spots are used, no more cars can park.
:::

What "pod capacity" means: each node has a **max pods** limit (`kubectl describe node` -> Capacity: pods). Default kubelet limit is 110; on **EKS with the VPC CNI** it is based on ENIs x IPs per ENI (e.g. t3.medium = 17 pods, m5.large = 29), because every pod needs a VPC IP.

Check first:

1. `kubectl describe node` -> Capacity/Allocatable pods vs running pods; pending pod events say `Too many pods`.
2. Is it the **pod limit** or **IP exhaustion** (subnet has no free IPs - aws-node logs `failed to assign an IP address`)?
3. What is using the slots: completed/failed pods not cleaned up, many small DaemonSets, a runaway Job/CronJob creating pods, too many tiny replicas?

Fixes:

- Short term: clean up Completed/Evicted pods; let autoscaler add nodes (Cluster Autoscaler/Karpenter respect the pod limit); cordon and spread.
- **EKS prefix delegation** (`ENABLE_PREFIX_DELEGATION=true`) - assigns /28 prefixes, raising pods per node (e.g. up to 110 on many Nitro instances); update node max-pods accordingly.
- Larger instance types (more ENIs/IPs), larger subnets or custom networking (secondary CIDR for pods).
- Set `ttlSecondsAfterFinished` for Jobs, `successfulJobsHistoryLimit` for CronJobs; review replica counts.
- Topology spread so pods do not pile onto one node.

**Example:**
```bash
kubectl describe node ip-10-0-1-12... | grep -A6 -E "Capacity|Allocatable"
#  pods: 17
kubectl get pods -A --field-selector spec.nodeName=ip-10-0-1-12... | wc -l
kubectl get pods -A --field-selector=status.phase==Succeeded -o name | xargs kubectl delete
kubectl logs -n kube-system -l k8s-app=aws-node --tail=50 | grep -i "ip address"
kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true
```

:::say
I first check describe node for the pods capacity versus running count and whether pending pods say Too many pods or the CNI is out of subnet IPs. Short term I clean up completed pods and let the autoscaler add nodes; long term on EKS I enable prefix delegation or use bigger instances and larger subnets, and set TTLs on Jobs so finished pods do not waste slots.
:::

## Pods are getting evicted frequently due to resource pressure (for example in EKS). How do you fix and prevent it?

<!-- source: 03 Q79 -->

:::note In simple words
When the lifeboat is overloaded, the captain throws off the passengers without tickets first. Give every important passenger a proper ticket (requests), do not overload the boat, and keep it clean.
:::

Eviction happens when a **node** is under pressure (memory, disk/ephemeral storage, PIDs). The kubelet evicts pods in order: **BestEffort** (no requests) first, then **Burstable** pods using more than their request, **Guaranteed** last. (Different from OOMKilled, which is a single container exceeding its own limit.)

Investigate:

1. `kubectl get pods -A | grep Evicted` and `kubectl describe pod` -> reason: `The node was low on resource: memory` / `ephemeral-storage`.
2. Which nodes? `kubectl describe node` conditions and allocated resources; overcommitted limits?
3. Metrics: node memory, disk usage (container logs, images, emptyDir), which pods consume most.

Fix / prevent:

- **Set requests for every pod** (requests close to actual usage), so the scheduler does not overpack nodes. Use LimitRange defaults so nothing runs as BestEffort.
- Memory limits close to requests for heavy apps; critical pods as **Guaranteed** QoS + **PriorityClass**.
- **Ephemeral storage:** set `ephemeral-storage` requests/limits, log rotation, avoid writing big files to container filesystem, bigger root volumes, image garbage collection.
- **Kubelet reservations:** `kube-reserved`, `system-reserved`, eviction thresholds (EKS AMIs set defaults; tune via bootstrap/launch template).
- Right-size node types; autoscaler to add capacity; fix memory leaks.
- Spread with topology constraints; PDBs.
- Alerts on node MemoryPressure/DiskPressure and on eviction counts.
- Clean up evicted pods (they stay as Failed objects).

**Example:**
```text
kubectl get pods -A --field-selector=status.phase=Failed | grep Evicted
kubectl describe pod <evicted-pod> | grep -i -A2 "Reason"
kubectl describe nodes | grep -A10 "Allocated resources"
kubectl top pods -A --sort-by=memory | head

resources:
  requests: {cpu: 250m, memory: 512Mi, ephemeral-storage: 1Gi}
  limits:   {memory: 512Mi, ephemeral-storage: 2Gi}
```

:::say
Evictions mean the node itself is under memory or disk pressure, and BestEffort and over-request Burstable pods go first. I fix it by giving every pod realistic requests, making critical pods Guaranteed with a PriorityClass, setting ephemeral-storage limits and log rotation, reserving resources for kubelet and system, right-sizing nodes, and alerting on node pressure.
:::

## You see high CPU usage in one pod (or one node group), but its logs look clean. What next?

<!-- source: 03 Q80 -->

*Also asked as:* CPU usage on one EKS node group is consistently high - Grafana shows the spike but logs are normal. A critical microservice in production has high CPU usage - diagnose and resolve it in real time.

:::note In simple words
A worker is sweating heavily but his diary says everything is normal. You need to watch what he is actually doing (profiling), not just read his diary.
:::

**Real-time mitigation first** if users are affected: scale out (`kubectl scale` or raise HPA min/max), temporarily raise the CPU limit if it is throttled, or **roll back** if a recent deploy caused it. Then diagnose:

1. **Confirm it is real and scope:** `kubectl top pod --containers`, Grafana per-container CPU; only one replica or all? If only one -> something specific to that pod (hot key, stuck request, bad node). All replicas -> load or code. For a **node group**: `kubectl top nodes`, then which pods on those nodes use the CPU (often one workload, a DaemonSet, or pods packed onto that group by nodeSelector).
2. **What changed?** Recent deploy (`kubectl rollout history`), config change, traffic increase or new client, a batch job/CronJob landing on that node group.
3. **Is it load?** Compare request rate to that pod - uneven load balancing (long-lived keep-alive/gRPC connections pinned to one pod), a hot partition or hot key.
4. **Is it throttling?** Check `container_cpu_cfs_throttled_periods_total` and compare usage vs **requests vs limits**: usage at the limit = throttled (slow responses, probe timeouts); requests far below usage = node overcommitted.
5. **HPA status:** `kubectl get hpa` - at maxReplicas? not scaling because of missing requests or metrics? (see the HPA scenario).
6. **Look inside the process:** `kubectl exec` -> `top -H` for threads; profilers: Java `jstack`/`jcmd Thread.print` or async-profiler, Go `pprof`, Node `--inspect`, py-spy style samplers; continuous profiling (Pyroscope). GC thrash from memory near heap limit causes high CPU with clean logs.
7. **Traces/APM:** Tempo/Jaeger/Datadog showing slow endpoints.
8. **Background work:** cron-like tasks inside the app, retry storms, infinite loop after a specific input, sidecar (Envoy, log shipper) using CPU rather than the app container - check per-container CPU.
9. **Noisy neighbours / node:** another pod on the same node without CPU requests, kernel issues, instance type too small (burstable t3 out of CPU credits); move the pod (`kubectl delete pod`) to compare.
10. Fix root cause (code, config, balancing, right-sized requests/instance type) and add alerts on throttling and per-pod CPU.

**Example:**
```text
kubectl top pod -n prod --containers | sort -k3 -rn | head
kubectl exec -it api-7d9f-abcde -n prod -- top -H -b -n1 | head -20
kubectl exec -it api-7d9f-abcde -n prod -- jcmd 1 Thread.print > threads.txt
# PromQL: per-pod CPU and throttling
sum by (pod,container) (rate(container_cpu_usage_seconds_total{namespace="prod"}[5m]))
sum by (pod) (rate(container_cpu_cfs_throttled_periods_total{namespace="prod"}[5m]))
```

:::say
If users are affected I first mitigate by scaling out, raising a throttled limit or rolling back a recent deploy. Then I check whether it is one pod, all pods or one node group, what changed, and whether request distribution explains it, such as sticky connections or a hot key. Then I profile inside the container with top -H and language tools like jstack or pprof, check GC pressure, per-container CPU in case a sidecar is the culprit, and throttling metrics; I mitigate by restarting or scaling and then fix the code or balancing issue.
:::

## etcd becomes unavailable in a production cluster. What is your recovery strategy?

<!-- source: 03 Q81 -->

:::note In simple words
The cluster's memory notebook is missing pages. Running work continues, but no new instructions can be written. Fix the notebook if possible; if not, restore it from last night's photocopy.
:::

First, understand impact: API server errors (`etcdserver: request timed out`, `leader changed`), kubectl fails, no scheduling/healing - but **running pods keep serving**. Do not panic-restart workloads.

**Managed (EKS/GKE/AKS):** etcd is the provider's responsibility - check the provider health dashboard, open a high-priority support case, avoid mass changes; ensure your own recovery path (GitOps + Velero) is ready.

**Self-managed:**

1. **Check members:** `etcdctl endpoint health --cluster`, `endpoint status` (leader, DB size, raft index), `member list`.
2. **Common causes:** disk full or DB size exceeded quota (`mvcc: database space exceeded` -> compact + defrag + disarm alarm), slow disk (fsync latency - etcd needs fast SSD), expired certificates, network partition, clock issues.
3. **One member down, quorum intact:** fix or `member remove` the bad one and `member add` a fresh one.
4. **Quorum lost / data corrupt:** restore from the latest **snapshot**:
- stop kube-apiserver (and etcd) on all control-plane nodes,
- `etcdutl snapshot restore` (older: `etcdctl snapshot restore`) on each member with the right `--name`, `--initial-cluster`, new data dir,
- start etcd, verify health, then start API servers,
- reconcile: objects created after the snapshot are lost; GitOps re-applies them.
5. **Prevention:** scheduled snapshots (every few hours, copied off-cluster), 3/5 members across zones, monitoring (`etcd_server_has_leader`, `etcd_disk_wal_fsync_duration_seconds`, DB size), cert rotation, restore drills.

**Example:**
```
ETCDCTL_API=3 etcdctl --endpoints=$EPS --cacert=ca.crt --cert=etcd.crt --key=etcd.key \
  endpoint status --cluster -w table
etcdctl alarm list
etcdctl compact $(etcdctl endpoint status -w json | jq '.[0].Status.header.revision')
etcdctl defrag --cluster && etcdctl alarm disarm

etcdutl snapshot restore /backup/etcd-2026-09-24.db --name cp1 \
  --initial-cluster cp1=https://10.0.1.10:2380,cp2=https://10.0.2.10:2380,cp3=https://10.0.3.10:2380 \
  --initial-advertise-peer-urls https://10.0.1.10:2380 --data-dir /var/lib/etcd-restored
```

:::say
Running pods keep serving, so I focus on restoring the control plane: on EKS that is AWS's responsibility and I raise a support case, while self-managed I check member health, fix disk space or quota alarms with compact and defrag, and replace a failed member if quorum still exists. If quorum is lost I restore all members from the latest snapshot and let GitOps re-apply newer changes, and I prevent it with frequent off-cluster snapshots, fast disks and etcd monitoring.
:::

## HPA refuses to scale a critical workload even though Prometheus shows CPU above 90%. What is the root cause and fix?

<!-- source: 03 Q82 -->

:::note In simple words
The fire alarm in the control room (Prometheus) is ringing, but the sprinkler system (HPA) reads a different sensor that says everything is fine - or the sprinkler is already at full blast, or the water pipes (nodes, quota) are blocked.
:::

Check `kubectl describe hpa` first - conditions and events tell you why. Common root causes:

1. **Different measurement:** HPA CPU utilization = usage / **request**. Prometheus may show % of node CPU or % of **limit**. Example: request 1 core, limit 2 cores, usage 1.8 cores = 90% of limit but HPA sees 180% (would scale) - or the reverse if the dashboard is node-based. Compare apples to apples.
2. **Missing requests:** if any container in the pod (including a sidecar) has no CPU request, HPA cannot compute utilization -> `FailedGetResourceMetric` / `missing request for cpu`.
3. **metrics-server broken/lagging:** targets show `<unknown>`, APIService unavailable.
4. **Already at maxReplicas** -> `ScalingLimited: TooManyReplicas`.
5. **Scaled, but new pods Pending:** no node capacity (autoscaler not working, max nodes reached), **ResourceQuota** exceeded (events on ReplicaSet), IP exhaustion.
6. **Wrong target:** `scaleTargetRef` points to a different Deployment name, or the Deployment is managed by another tool that resets replicas (Helm/Argo CD setting `replicas`, fighting HPA).
7. **Behavior/stabilization policies** too conservative; unready pods and CPU during startup (`cpu-initialization-period`) are ignored in the calculation.
8. **HPA based on the wrong metric** (memory or custom metric) while CPU is high.
9. Target averaged across pods: one hot pod at 90% but average 50%.

Fix accordingly: set requests on all containers, repair metrics-server, raise maxReplicas and node group max, remove `replicas` from Helm when HPA manages it, adjust quota, tune behavior.

**Example:**
```bash
kubectl describe hpa api -n prod
#  AbleToScale     True    ReadyForNewScale
#  ScalingActive   False   FailedGetResourceMetric  missing request for cpu in container "envoy"
#  ScalingLimited  True    TooManyReplicas
kubectl get hpa api -n prod -o yaml | grep -A3 scaleTargetRef
kubectl get pods -n prod -l app=api | grep Pending
kubectl describe quota -n prod
```

:::say
I read describe hpa conditions first. Typical causes are a container or sidecar without a CPU request, metrics-server not serving metrics, HPA already at maxReplicas, scaled pods stuck Pending due to node capacity or ResourceQuota, a wrong scaleTargetRef, or Helm resetting replicas; I also make sure I compare HPA's usage-over-request with what Prometheus is actually graphing.
:::

## An app on AKS (or any managed Kubernetes) fails health checks randomly. How do you debug this end-to-end?

<!-- source: 03 Q84 -->

*Also asked as:* How do you configure and troubleshoot health probes in AKS?

:::note In simple words
The doctor checks the patient's pulse every 10 seconds, but gives up if the pulse takes more than 1 second to find. If the patient is sometimes busy, the doctor wrongly declares him sick. Find out whether the patient is really sick or the check is too strict.
:::

1. **Which health check fails?** Kubernetes probes (events `Liveness/Readiness probe failed`) or the **Azure Load Balancer / Application Gateway** health probe (backend health in portal)? They are different.
2. **Pattern:** random pods or specific nodes? Correlates with traffic peaks, GC, deployments, node upgrades, time of day?
3. **Probe config:** default `timeoutSeconds: 1` is too tight for many apps; probe hitting an expensive endpoint (checks DB); liveness checking dependencies -> restarts during DB blips. Relax timeout/threshold, make probes lightweight, add startup probe.
4. **App/resource side:** CPU throttling (CPU limit too low -> probe response slow), GC pauses, thread pool exhaustion (probe waits in the same queue as user requests), memory pressure.
5. **Node side:** node pressure, kubelet busy, noisy neighbours, SNAT port exhaustion on outbound, conntrack.
6. **Load balancer probe side:** `externalTrafficPolicy: Local` makes nodes without pods fail LB probes (expected); App Gateway probe path/host header/port mismatch, TLS/SNI, probe interval vs app warm-up.
7. **Network:** NSG rules, CNI (Azure CNI IP exhaustion), DNS delays in dependency checks.
8. **Correlate** with metrics/logs (Container Insights / Prometheus): probe failures vs CPU throttling vs latency vs GC.
9. Fix, then load test to confirm.

**Example:**
```text
kubectl get events -A --field-selector reason=Unhealthy --sort-by=.lastTimestamp | tail -20
kubectl describe pod <pod> | grep -A3 -E "Liveness|Readiness"
kubectl top pod <pod> --containers
kubectl exec <pod> -- sh -c 'time wget -qO- localhost:8080/healthz'

livenessProbe:
  httpGet: {path: /healthz, port: 8080}
  timeoutSeconds: 3
  periodSeconds: 10
  failureThreshold: 3
```

:::say
I first separate Kubernetes probe failures from cloud load balancer probe failures, then look for a pattern by node, time and load. Most often the cause is a probe timeout that is too tight combined with CPU throttling, GC pauses or a heavy probe endpoint, so I make probes lightweight, relax timeouts, add a startup probe and fix resources, and verify LB probe settings like path, port and externalTrafficPolicy.
:::

## In a canary deployment to production, half the traffic returns 502 while the rest succeeds. How do you troubleshoot?

<!-- source: 03 Q85 -->

:::note In simple words
Half the customers go to the new counter and get turned away, the other half go to the old counter and are served. The first suspicion is the new counter - but also check the signpost that splits the queue.
:::

1. **Stop the bleeding:** 50% errors is too much - set canary weight back to 0 / abort the rollout (Argo Rollouts abort, Istio weights 100/0). Then debug calmly.
2. **Confirm the split:** break errors down by **version/subset label**, pod and node. If all 502s come from canary pods -> the canary is broken. If spread across both -> infra/route issue.
3. **502 meaning:** the proxy (ingress/Envoy/ALB) got an **invalid or no response from upstream**: connection refused/reset, upstream closed connection, protocol mismatch.
4. **Canary pods:** Ready? Listening on the right port (targetPort changed in new version)? Crashing under load? Logs of the canary pods and of the ingress/Envoy (`upstream connect error or disconnect/reset before headers`, response flags `UF`, `UC`, `URX`).
5. **Routing config:** canary Service selector correct; Istio **DestinationRule subsets** match pod labels (`version: v2`); mTLS mode mismatch (canary pods missing sidecar injection -> resets); NGINX canary annotations pointing to right Service; ALB weighted target group health.
6. **Protocol/timeouts:** new version switched to HTTP/2, gRPC or HTTPS; app keep-alive timeout lower than proxy idle timeout (connection reuse -> 502); new version slower than proxy timeout.
7. **Dependencies:** canary uses a new config/secret/DB migration that is failing.
8. Fix, re-run canary at 1-5% with **automated analysis** (error rate, latency) to catch this before 50%.

**Example:**
```
# errors by version
sum by (version) (rate(istio_requests_total{destination_app="api",response_code="502"}[1m]))
kubectl get pods -l app=api -L version -o wide
kubectl logs -l app=api,version=v2 --tail=50
kubectl logs -n istio-system deploy/istio-ingressgateway | grep " 502 " | tail
kubectl get destinationrule api -o yaml | grep -A3 subsets
kubectl argo rollouts abort api -n prod
```

:::say
I abort or roll the canary weight back to zero first, then split the 502s by version; if they all come from canary pods I check their readiness, ports, logs and new config. I also verify the routing layer, such as DestinationRule subset labels, sidecar and mTLS consistency, protocol changes and keep-alive timeouts, and then retry the canary at a small weight with automated metric analysis.
:::

## Users report 10-second delays every 15 minutes in an app running on AKS (or any Kubernetes). No code changes happened. How do you begin RCA?

<!-- source: 03 Q86 -->

:::note In simple words
Something happens like clockwork every 15 minutes. Periodic problems come from periodic things - find everything that runs on a 15-minute timer.
:::

1. **Confirm the pattern precisely:** exact timestamps, duration, which endpoints/users/regions; is it all pods or some? Plot p99 latency at 1-minute resolution.
2. **List everything periodic** and correlate with the timestamps:
- CronJobs in the cluster (backups, reports, cleanup), DB maintenance/vacuum, cache expiry (TTL 15 min -> cache stampede).
- Token/credential refresh (managed identity, OAuth tokens, Key Vault/secret rotation, CSI driver sync interval).
- DNS TTLs / cache expiry, connection pool recycle (`maxLifetime`), idle connection timeouts (Azure Load Balancer idle timeout default 4 min, NAT idle timeout) -> first request after reconnect is slow.
- JVM full GC cycles, log rotation, metrics scrapes of heavy endpoints, HPA/autoscaler scale events, Karpenter/cluster autoscaler consolidation.
- Node-level: image GC, kernel tasks, antivirus/security agents, **SNAT port exhaustion** on outbound connections.
3. **Trace a slow request** (Application Insights / OpenTelemetry): which span takes 10 seconds - DNS lookup, TCP connect, TLS, DB query, external API?
4. **10 seconds exactly** is suspicious: typical of a timeout + retry (e.g. 5s DNS timeout x2, connect timeout), so check DNS (conntrack race), and connect timeouts.
5. Check platform events: AKS node image auto-upgrade, Azure maintenance, LB health.
6. Test hypothesis: change one variable (disable CronJob, adjust pool settings, enable NodeLocal DNSCache) and watch the next cycle.

**Example:**
```text
kubectl get cronjobs -A
kubectl get events -A --sort-by=.lastTimestamp | grep -iE "scaled|killing|pull" | tail
# PromQL: p99 latency at 1m resolution
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{app="api"}[1m])))
kubectl exec <pod> -- sh -c 'time nslookup db.internal'
```

:::say
A 15-minute rhythm means a periodic cause, so I line up the exact latency spikes with everything periodic: CronJobs, cache TTLs, token or secret refresh, connection pool recycling, idle timeouts, GC and autoscaler events. I trace a slow request to see which span takes the 10 seconds, and an exact 10 seconds often points to timeouts and retries such as DNS or connection timeouts, then I test one hypothesis at a time.
:::

## A kube-proxy update rolls out in the middle of a live event (for example a big match). What is your network rollback plan to avoid packet drops?

<!-- source: 03 Q87 -->

:::note In simple words
Someone started rewiring the traffic lights city-wide during the rush hour. Stop the rewiring, put back the old lights one junction at a time, and next time only rewire at night, one junction first.
:::

**Immediately:**

1. **Pause the change:** stop the pipeline/add-on update; if it is a DaemonSet rollout in progress, check `kubectl rollout status ds/kube-proxy -n kube-system`.
2. **Assess impact:** packet drops/5xx/latency per node - are only updated nodes affected? Compare updated vs old nodes.
3. **Roll back kube-proxy:**
- Self-managed DaemonSet: `kubectl rollout undo ds/kube-proxy -n kube-system` (updates one node at a time with `maxUnavailable: 1`).
- EKS managed add-on: `aws eks update-addon --addon-name kube-proxy --addon-version <previous> --resolve-conflicts PRESERVE` (or pin the previous version in Terraform).
4. **Protect traffic during rollback:** cordon/drain affected nodes in the worst case so traffic shifts to healthy nodes; external LBs route away from unhealthy nodes (health checks). Keep existing connections: kube-proxy restarts do not flush conntrack by default, so established flows usually survive; avoid changing proxy **mode** (iptables <-> IPVS) mid-event since that rewrites all rules.
5. **Verify:** iptables/IPVS rules sync (`kubeproxy_sync_proxy_rules_duration_seconds`), Service connectivity tests, error rate back to normal.

**Prevention:**

- **Change freeze** during major events; add-on version pinned in IaC (no auto-update).
- Canary node group first, `maxUnavailable: 1`, soak time, automatic halt on error metrics.
- Test version compatibility (kube-proxy must match or be close to control plane version) in staging under load.
- Run a pre-event game day and keep a written rollback runbook.

**Example:**
```bash
kubectl -n kube-system rollout status ds/kube-proxy
kubectl -n kube-system rollout history ds/kube-proxy
kubectl -n kube-system rollout undo ds/kube-proxy
kubectl -n kube-system get ds kube-proxy -o jsonpath='{.spec.updateStrategy}'
aws eks describe-addon --cluster-name prod-eks --addon-name kube-proxy --query addon.addonVersion
aws eks update-addon --cluster-name prod-eks --addon-name kube-proxy \
  --addon-version v1.30.0-eksbuild.3 --resolve-conflicts PRESERVE
```

:::say
I halt the rollout, compare updated versus not-yet-updated nodes to confirm impact, and roll kube-proxy back with rollout undo or by pinning the previous EKS add-on version, one node at a time, draining nodes if drops are severe. Established connections generally survive because conntrack is not flushed, and prevention is a change freeze for big events, pinned add-on versions and a canary node group with automatic halt.
:::

## You need to containerize a legacy monolith and deploy it to EKS with minimal downtime. What is your approach?

<!-- source: 03 Q88 -->

:::note In simple words
Move a shop to a new mall without closing it. Open the new shop while the old one still runs, send a few customers there first, then more and more, and only close the old shop when the new one is proven.
:::

**1. Assess the monolith:**

- Where is **state** kept: local disk (uploads, generated files), in-memory **sessions**, local cron jobs, config files with hard-coded hosts/secrets?
- Dependencies (DB, message queues, external IPs whitelisted), OS packages, startup time, memory needs.

**2. Make it container-friendly (12-factor basics):**

- **Externalize config** to env vars/ConfigMaps and secrets to Secrets Manager (External Secrets).
- **Sessions** to Redis/ElastiCache (or sticky sessions temporarily); files to **S3/EFS**.
- **Logs to stdout/stderr** instead of local files.
- Add **health endpoints** (`/health`, `/ready`) and graceful SIGTERM handling.
- Local crons -> Kubernetes CronJobs.

**3. Build and deploy:**

- Dockerfile (pinned base image, multi-stage if compiled, non-root), scan, push to ECR.
- Helm chart: Deployment with probes and realistic resources (monoliths are big - start generous, tune later), Service, Ingress (ALB), HPA if it is stateless now, PDB.
- Test in staging with production-like data and a load test.

**4. Run in parallel and shift traffic gradually (strangler fig):**

- Legacy stays live; the EKS version runs alongside, pointing to the **same database** initially (no data migration on day one).
- Shift traffic with **ALB weighted target groups** or **Route 53 weighted records**: 5% -> 25% -> 50% -> 100%, watching error rate, latency and business metrics at each step. Rollback = weight back to legacy.
- Lower DNS TTLs before starting.

**5. After cut-over:** keep legacy on standby for a few days, then decommission; later peel off features into microservices (strangler fig pattern) and plan the DB migration separately.

**Example:**
```
# ALB listener rule with weighted forward (Terraform / console)
forward {
  target_group { arn = aws_lb_target_group.legacy_ec2.arn  weight = 90 }
  target_group { arn = aws_lb_target_group.eks_ingress.arn weight = 10 }
}

# Route 53 weighted alternative
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://weights.json
kubectl rollout status deploy/monolith -n app
```

:::say
I first assess where the monolith keeps state, then externalize config, sessions and files, send logs to stdout, add health endpoints and build a hardened image with a Helm chart including probes, resources and a PDB. The EKS version runs in parallel with the legacy system on the same database, and I shift traffic gradually with ALB weighted target groups or Route 53 weighted records, rolling back by weight if metrics degrade, then decommission the legacy system and peel off services over time.
:::

## Have you faced production issues in Kubernetes? Tell me about one and how you troubleshot it.

<!-- source: 03 Q89 -->

*Also asked as:* Tell me about a recent production issue you handled in Kubernetes. What was the last Kubernetes outage you debugged, and what was the RCA?

:::note In simple words
Tell a short story with a clear structure: what broke, how you noticed, how you found the cause, how you fixed it, and what you changed so it does not happen again (STAR: Situation, Task, Action, Result).
:::

Structure your answer: **symptom -> impact -> investigation steps -> root cause -> fix -> prevention**. Use a real example from your work and keep it to 2 minutes.

RCA structure interviewers like:

1. **Detection:** which alert fired (or did users report it first - then alerting is an action item).
2. **Timeline:** start, detection, mitigation, resolution times (MTTD, MTTR).
3. **Evidence:** metrics (error rate, latency, CPU/memory, restarts), logs (`kubectl logs --previous`, Loki queries), events (`kubectl get events`), traces, and the change log (deploys, node upgrades).
4. **Root cause** (5 whys - technical cause and why it was not caught) and **contributing factors**.
5. **Fix + prevention:** action items with owners (PDBs, probes, alerts, tests, runbooks).
6. **Blameless postmortem** document shared with the team, and follow-up on action items. Sample answers you can adapt (from real EKS monitoring work):

**Example 1 - logs missing for one service:** A Loki/Grafana dashboard showed no application logs for one service while others were fine. I checked that the pods were Running and producing logs with `kubectl logs`, so the app was fine. Then I compared the dashboard's container label filter with the actual container name in the pod spec (`kubectl get pod -o jsonpath='{.spec.containers[*].name}'`) and found the real container name differed from what the dashboard query expected. Fix: corrected the label/query. Prevention: dashboards use variables populated from real label values instead of hard-coded names.

**Example 2 - SLA breach after a node group update:** A service availability dip lined up with a managed node group update. Pods were rescheduled as nodes were replaced, and one service did not have enough replicas/PDB protection, so it had a short outage. Fix: PDB with `maxUnavailable: 1`, at least 2 replicas spread across nodes, readiness probes; schedule node upgrades in low-traffic windows.

**Example 3 - alerts silently not delivered:** An alert pipeline looked healthy but notifications never reached Teams because a sidecar forwarder had silently died. Fix: moved to Alertmanager's native Teams receiver and added an end-to-end test alert (a "dead man's switch") so a broken alert path is itself detected.

**Example:**
```text
kubectl get pods -n <ns> -o wide
kubectl logs <pod> -n <ns> --tail=50
kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[*].name}'
kubectl get events -n <ns> --sort-by=.lastTimestamp | tail
kubectl get pdb -n <ns>
```

:::say
Pick one real incident and tell it as symptom, impact, how it was detected, the specific commands and evidence from metrics, logs and events you used, the root cause, the fix and the prevention you added, and mention the blameless postmortem with owned action items. Interviewers care most that you debugged systematically, communicated, and made a lasting improvement like a PDB, better probes or an end-to-end alert test.
:::
