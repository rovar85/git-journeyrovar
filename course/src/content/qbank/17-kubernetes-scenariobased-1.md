---
track: qbank
title: "Kubernetes: Scenario-based questions (part 1 of 2)"
short: Kubernetes scenario 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## What common Kubernetes errors have you faced, and how did you fix them?

<!-- source: 03 Q62 -->

:::note In simple words
Every pod error name is a clue that tells you which stage of the pod's life went wrong: could not be placed, could not get its image, could not start, or started and then died.
:::

| Error / status | What it means | First checks | Typical fixes |
| --- | --- | --- | --- |
| Pending | Scheduler cannot place the pod | `kubectl describe pod` events: Insufficient cpu/memory, taints, node affinity, unbound PVC, pod limit per node | Lower requests, add nodes (autoscaler), fix selectors/tolerations, fix StorageClass/AZ |
| ImagePullBackOff / ErrImagePull | Node cannot pull the image | Events: not found, unauthorized, timeout | Fix tag/repo name, ECR permissions on node role, imagePullSecrets, NAT/VPC endpoints for ECR, rate limits (Docker Hub) |
| CreateContainerConfigError | Pod spec references something missing | Events: `secret "db-cred" not found`, `configmap ... not found`, missing key | Create the Secret/ConfigMap/key, fix names, check namespace |
| CrashLoopBackOff | Container starts then keeps exiting | `kubectl logs --previous`, exit code, describe | Fix app config/env, dependencies, command/args, probes |
| OOMKilled (exit 137) | Container exceeded memory limit | describe -> Last State: OOMKilled; memory graph | Raise memory limit, fix leak, tune JVM/heap (`-XX:MaxRAMPercentage`) |
| Error / exit 1 | App crashed with an error | logs --previous | Fix code/config |
| RunContainerError / exec format error | Wrong command or wrong CPU architecture | logs, image arch | Fix entrypoint, build multi-arch (amd64/arm64) |
| Evicted | Node under memory/disk pressure | node conditions, `kubectl get pods --field-selector=status.phase=Failed` | Set requests, clean disk, bigger nodes, log rotation |
| Terminating forever | Finalizers or unreachable node | describe, finalizers | Fix node, remove stuck finalizer carefully, `--force --grace-period=0` last resort |

**Example:**
```text
kubectl get pods -A | grep -vE "Running|Completed"
kubectl describe pod <pod> -n <ns> | sed -n '/Events/,$p'
kubectl logs <pod> -n <ns> --previous
kubectl get events -n <ns> --sort-by=.lastTimestamp | tail -20
```

:::say
The status tells me which stage failed: Pending is scheduling, ImagePullBackOff is registry access or tag, CreateContainerConfigError is a missing Secret or ConfigMap, CrashLoopBackOff is the app exiting, and OOMKilled is memory limit. I always start with describe pod events and logs --previous, then fix the specific cause such as requests, IAM pull permissions, missing config or memory limits.
:::

## Rapid-fire: What happens if...?

<!-- source: 03 Q63 -->

:::note In simple words
Knowing how Kubernetes behaves when each piece breaks lets you guess the cause from the symptom in seconds.
:::

| Situation | What you see | What to do |
| --- | --- | --- |
| A pod keeps crashing repeatedly | CrashLoopBackOff; kubelet restarts it with exponential back-off 10s, 20s, 40s... capped at 5 minutes (reset after 10 min of healthy running) | `logs --previous`, exit code, describe events; fix config/dependency/probe |
| CoreDNS fails | Pods and Services look healthy but apps get "could not resolve host"; calls by IP still work | Check kube-system CoreDNS pods/logs, scale it, check NetworkPolicy on port 53, NodeLocal DNSCache |
| A node runs out of memory | Node condition MemoryPressure, new pods not scheduled there, kubelet evicts pods (BestEffort first, then Burstable over their requests); containers over their own limit get OOMKilled | Set proper requests/limits, fix leaks, bigger/more nodes, keep system reserved memory |
| Service selector matches no pods | Service exists but `kubectl get endpoints` is empty; clients get connection refused or timeout | Fix label/selector mismatch or make pods Ready; check targetPort |
| An unready app gets traffic | No readiness probe, so pod is added to endpoints as soon as the container starts; users get errors during startup/deploys | Add readiness (and startup) probes |
| etcd fails / loses quorum | API server errors, kubectl fails, nothing can be created, scaled or healed; **already running pods keep running** and serve traffic | Restore quorum (fix/replace member) or restore from snapshot; on EKS/GKE the provider handles etcd |
| Rolling deploy with bad config | With `maxUnavailable: 0`, new pods fail readiness, old pods keep serving; rollout stalls and after `progressDeadlineSeconds` (default 600s) is marked failed; no probe = bad pods take traffic | `kubectl rollout undo`, fix config; always use readiness probes |
| Kubelet loses contact with API server | Node goes NotReady/Unknown after the grace period (~40-50s); node is tainted; after the default toleration of 300s (5 min) pods are evicted and Deployments recreate them elsewhere; containers may still run on the isolated node | Fix kubelet/network; StatefulSet pods need node confirmed dead before replacement |
| HPA scales too aggressively | Replica count spikes, costs jump, node autoscaler adds many nodes, possibly hits ResourceQuota (pods fail to create) | Tune `behavior.scaleUp` policies, `stabilizationWindowSeconds`, sane `maxReplicas`, better metric |
| Container exits 0 but app is broken | Deployment (restartPolicy Always) restarts it anyway -> may still loop as CrashLoopBackOff "Completed"; if process stays up but app is broken, nothing happens without probes | Liveness probe for hung app, readiness for broken dependency; check why main process exits |

**Example:**
```text
kubectl get endpoints <svc>                   # selector problem?
kubectl describe node <node> | grep -A8 Conditions
kubectl get deploy <app> -o jsonpath='{.status.conditions[?(@.type=="Progressing")]}'
kubectl describe hpa <app>
```

:::say
I match symptoms to components: empty endpoints means a selector or readiness problem, name resolution failures with healthy pods point to CoreDNS, an etcd failure freezes the API but does not kill running pods, and a node losing its API connection has its pods evicted after about five minutes. Readiness probes plus maxUnavailable 0 are what save a bad rolling deploy.
:::

## A pod is stuck in CrashLoopBackOff even though the image is valid. How do you debug and fix it?

<!-- source: 03 Q64 -->

*Also asked as:* Your pod is stuck in CrashLoopBackOff, what is your next step? Half your pods are in CrashLoopBackOff and the team says it works on my machine - you are on call, what do you do live?

:::note In simple words
The car (image) is fine, but it keeps stalling as soon as it starts - maybe no fuel (missing secret), road blocked (database unreachable), or the inspector (liveness probe) keeps switching it off too early.
:::

CrashLoopBackOff = the container starts, exits, and kubelet keeps restarting it with increasing delay (up to 5 min). The image pulls fine, so the problem is **runtime**.

Live triage order:

1. **Scope first:** which pods/nodes, since when, all replicas or some? Only new ReplicaSet pods -> recent deploy. Only one node -> node issue. Half the pods -> maybe the new version during a rollout, or pods on a specific node group/arch.
2. **What changed?** `kubectl rollout history`, recent Helm/Argo CD sync, ConfigMap/Secret edits.
3. **Logs of the crashed attempt:** `kubectl logs <pod> --previous` (current logs are often empty).
4. **Exit code and reason:** `kubectl describe pod` -> Last State. 1 = app error, 137 = OOMKilled/SIGKILL, 139 = segfault, 143 = SIGTERM, 127 = command not found.
5. **Config/env:** missing `DB_PASSWORD` env from Secret, wrong key name, wrong DB host (localhost vs Service name) - compare with the working environment (`kubectl exec env`, diff values files).
6. **Dependencies:** DB/Kafka reachable? Test from a debug pod (`nc -zv postgres 5432`); NetworkPolicy, SG.
7. **Probes:** liveness too aggressive (short timeout, no startup probe) kills a slow-starting app - events show "Liveness probe failed".
8. **Resources:** OOMKilled -> raise memory limit or fix heap.
9. **Platform differences:** image built for arm64 but nodes amd64 (`exec format error`), `readOnlyRootFilesystem`/non-root breaking writes, missing volume mounts.
10. **Mitigate first if prod is hurting:** `kubectl rollout undo`, then fix calmly.

**Example:**
```bash
kubectl get pods -o wide -l app=api            # which nodes, which ReplicaSet hash
kubectl logs api-6f9c-abcde --previous
kubectl describe pod api-6f9c-abcde | grep -A6 "Last State"
#   Last State: Terminated  Reason: Error  Exit Code: 1
kubectl exec -it api-6f9c-xyz -- env | grep DB_  # compare with healthy pod
kubectl get secret db-cred -o jsonpath='{.data}' | head -c 200
kubectl debug -it api-6f9c-abcde --image=nicolaka/netshoot --target=api
kubectl rollout undo deploy/api
```

:::say
I scope the problem first, check what changed, and read kubectl logs --previous and the exit code from describe pod. With a valid image the usual culprits are missing env or secrets like DB_PASSWORD, an unreachable database, an over-aggressive liveness probe, OOMKilled or an architecture mismatch; if users are affected I roll back first with kubectl rollout undo and then fix the root cause.
:::

## A containerized app works on a developer machine (or locally) but fails or crashes in Kubernetes / production. What is your debug checklist?

<!-- source: 03 Q65 -->

:::note In simple words
The dish tastes fine in your home kitchen but not in the restaurant. Same recipe, different kitchen: different ingredients (config), different stove (CPU architecture), smaller pots (memory limits), stricter health inspector (probes, security rules).
:::

Checklist - compare local vs cluster:

1. **Same image?** Local may use a locally-built or `latest` tag; cluster pulls a different digest. Pin tags/digests.
2. **Env and config:** missing env vars, Secrets, ConfigMaps; `.env` file exists only on the laptop.
3. **Networking/DNS:** app connects to `localhost:5432` locally; in K8s it must be `postgres.db.svc.cluster.local`. NetworkPolicies, SGs, egress to external APIs.
4. **Resources:** laptop has 16 GB, pod limit 256Mi -> OOMKilled; CPU limit -> slow startup -> liveness kills it.
5. **Probes:** wrong path/port, too short timeouts.
6. **Security context:** runs as non-root / read-only root filesystem in K8s; app tries to write to `/app/tmp` -> permission denied. Mount an `emptyDir`.
7. **Architecture:** built on Apple Silicon (arm64), nodes are amd64 -> `exec format error`. Build multi-arch with buildx.
8. **Filesystem/volumes:** files expected in a path that is not mounted; case-sensitive paths.
9. **Time/locale, certificates:** missing CA certs in slim image for HTTPS calls.
10. **Signals:** app ignores SIGTERM or runs as a shell script child, so it gets killed on each rollout.

**Example:**
```text
kubectl logs <pod> --previous
kubectl describe pod <pod>                     # OOMKilled? probe failures? mount errors?
kubectl get pod <pod> -o jsonpath='{.spec.containers[0].image}'
docker manifest inspect myrepo/app:1.2 | grep architecture
kubectl exec -it <pod> -- sh -c 'id; env | sort; ls -ld /app'
docker buildx build --platform linux/amd64,linux/arm64 -t myrepo/app:1.2 --push .
```

:::say
I diff the two environments: exact image digest, env vars and secrets, service DNS names instead of localhost, memory and CPU limits, probes, security context like non-root and read-only filesystems, and CPU architecture. logs --previous and describe pod usually point to one of these within minutes.
:::

## A kubectl rollout restart did not trigger new pods as expected. What could be wrong?

<!-- source: 03 Q67 -->

:::note In simple words
You pressed the restart button, but either you pressed it on the wrong machine, the machine was paused, or the new parts could not be installed, so the old ones stayed.
:::

`kubectl rollout restart` works by adding/updating the annotation `kubectl.kubernetes.io/restartedAt` in the Pod template, which triggers a normal rolling update. Possible causes:

1. **Wrong target:** wrong namespace/context/cluster, or wrong resource name (restarted a different Deployment).
2. **Deployment is paused** (`spec.paused: true`) - template changes are recorded but not rolled out.
3. **New pods cannot become Ready/scheduled** - they are Pending (no capacity, quota) or failing readiness; with `maxUnavailable: 0` the old pods remain, so it looks like nothing happened.
4. **GitOps/Helm overwrote it:** Argo CD with self-heal reverts the annotation immediately (drift), or an operator manages the Deployment and resets the template.
5. **Resource is not a Deployment/StatefulSet/DaemonSet** (plain pods or a Job cannot be rolled out-restarted).
6. **StatefulSet with `OnDelete` update strategy** or a `partition` set - pods are not replaced automatically.
7. **Old kubectl version** (restart was added in 1.15) or RBAC denies `patch`.
8. Pods were restarted but you are looking at pod age of other pods, or the rollout is just slow (large `minReadySeconds`).

**Example:**
```bash
kubectl config current-context; kubectl get deploy api -n prod
kubectl rollout restart deploy/api -n prod
kubectl get deploy api -n prod -o jsonpath='{.spec.paused}{"\n"}'
kubectl get deploy api -n prod -o jsonpath='{.spec.template.metadata.annotations}'
kubectl rollout status deploy/api -n prod
kubectl get rs -n prod -l app=api
kubectl get sts db -o jsonpath='{.spec.updateStrategy}'
```

:::say
rollout restart just patches a restartedAt annotation into the pod template, so I check whether I hit the right context and namespace, whether the Deployment is paused, whether new pods are stuck Pending or not Ready, and whether Argo CD self-heal or an operator reverted the change. For StatefulSets I also check for an OnDelete strategy or partition.
:::

## A pod is failing because of a ConfigMap change. How would you roll back and prevent this next time?

<!-- source: 03 Q68 -->

:::note In simple words
Someone changed the recipe card on the kitchen wall and now every new dish is wrong. Put the old card back quickly, then make a rule that recipe changes are tested and versioned like everything else.
:::

**Roll back now:**

1. Identify the change: `kubectl describe cm`, Git history / Argo CD diff, audit logs.
2. **Restore the previous ConfigMap** (from Git: revert the commit and let Argo CD sync, or `kubectl apply -f` the old version, or `helm rollback` the release that contains it).
3. **Restart pods** so they pick it up (env vars are read only at start): `kubectl rollout restart deploy/<app>`. Note: `kubectl rollout undo` alone does **not** restore ConfigMap content, because ConfigMaps are not part of Deployment revisions.
4. Verify pods Ready and errors gone.

**Prevent:**

- Manage ConfigMaps in **Git + Helm/Argo CD**, reviewed PRs, no `kubectl edit` in prod.
- **Immutable, versioned ConfigMaps:** name includes a hash (`app-config-7f9c2`, Kustomize `configMapGenerator`), so a change creates a new ConfigMap and a new Deployment revision -> `rollout undo` then really rolls back config too.
- Helm **checksum annotation** so config changes trigger a proper rolling update gated by readiness probes (bad config stops at the first pod instead of silently breaking all pods on next restart).
- Validate config in CI (schema, `helm template`, app `--validate-config`), test in staging, canary.
- `immutable: true` on ConfigMaps to prevent in-place edits.

**Example:**
```
# templates/deployment.yaml
spec:
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}

# kustomization.yaml
configMapGenerator:
- name: app-config
  files: [app.properties]        # generates app-config-<hash>

git revert <commit> && git push        # Argo CD syncs old config
kubectl rollout restart deploy/api -n prod
```

:::say
I restore the previous ConfigMap from Git or helm rollback and restart the Deployment, remembering rollout undo alone does not revert ConfigMap data. To prevent it, config lives in Git with review, and I use hashed or immutable ConfigMaps or a Helm checksum annotation so every config change becomes a normal rolling update gated by readiness probes and easy to roll back.
:::

## The dev team pushed a bad Helm chart and the rollback hook fails. What is your live rollback strategy?

<!-- source: 03 Q69 -->

:::note In simple words
The emergency exit door (rollback hook) is jammed. You do not stand there pushing it - you use the side door (skip hooks or roll the Deployment back directly), get everyone out, and fix the door later.
:::

Step by step:

1. **See release state:** `helm history <rel>` and `helm status` - find the last good revision and whether the release is `failed` or stuck in `pending-upgrade` / `pending-rollback`.
2. **Rollback without hooks:** `helm rollback <rel> <good-rev> --no-hooks --wait --timeout 5m`. This skips the broken pre/post-rollback hook Job.
3. **Stuck in pending state** ("another operation is in progress"):
- First try `helm rollback` to the last good revision.
- Last resort: the release state is stored as Secrets `sh.helm.release.v1.<rel>.v<N>` in the release namespace; delete (after backing up) the Secret of the stuck pending revision, so Helm sees the last deployed revision again, then roll back/upgrade.
4. **Fastest app-level escape:** if Helm itself is broken, `kubectl rollout undo deploy/<app>` restores the previous ReplicaSet in seconds and stops user impact; reconcile Helm afterwards (next `helm upgrade` or rollback aligns it).
5. **Clean up failed hook Jobs** (`kubectl delete job <hook-job>`) that block reruns.
6. **GitOps:** if Argo CD manages it, **revert the Git commit** (or roll back the Application to the previous synced revision; pause auto-sync first) - otherwise Argo CD will re-apply the bad chart.
7. Verify: pods Ready, error rate, then communicate.

**Prevent:** `helm lint`, `helm template` + kubeconform, `helm diff` in CI; `--atomic --wait --timeout`; `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`; hooks idempotent; deploy to staging first; canary.

**Example:**
```bash
helm history api -n prod
# REV  STATUS           CHART       DESCRIPTION
# 11   superseded       api-1.8.0   Upgrade complete
# 12   pending-upgrade  api-1.9.0   Preparing upgrade
helm rollback api 11 -n prod --no-hooks --wait --timeout 5m

kubectl get secret -n prod -l owner=helm,name=api
kubectl get secret sh.helm.release.v1.api.v12 -n prod -o yaml > backup-v12.yaml
kubectl delete secret sh.helm.release.v1.api.v12 -n prod     # last resort

kubectl rollout undo deploy/api -n prod                     # fastest app-level escape
```

:::say
I check helm history, then run helm rollback to the last good revision with --no-hooks so the broken hook is skipped; if the release is stuck in pending-upgrade I roll back or, as a last resort, remove that revision's sh.helm.release secret after backing it up. If Helm is unusable, kubectl rollout undo restores service in seconds, and under Argo CD I revert the Git commit; prevention is lint, template and diff in CI plus --atomic and proper hook delete policies.
:::

## Users cannot access an application exposed via Ingress (or the Ingress stopped working). How do you debug it?

<!-- source: 03 Q70 -->

*Also asked as:* Your service is not accessible externally - where do you start troubleshooting? If an Ingress stops working, how would you fix it?

:::note In simple words
Follow the path of a letter: street address (DNS) -> building gate (load balancer) -> receptionist (Ingress controller) -> office (Service) -> person (Pod). Find the first place where the letter stops.
:::

Work outside-in (or inside-out - both fine, just be systematic):

1. **DNS:** `dig app.example.com` - does it resolve to the current LB address? (LB recreated -> new DNS name; Route 53 record stale.)
2. **Load balancer:** exists? listeners 80/443? **target group health** - unhealthy targets mean health-check path/port or SG problem. Security Group allows client traffic; subnets tagged correctly.
3. **TLS:** certificate valid and matches host (`curl -vk`); ACM/cert-manager renewal failed?
4. **Ingress controller:** pods running? `kubectl logs` of ingress-nginx / aws-load-balancer-controller - errors reconciling the Ingress (bad annotation, missing subnets, IAM permissions)? `ingressClassName` correct?
5. **Ingress rules:** `kubectl describe ingress` - host/path correct, backend service and port exist, pathType, rewrite rules.
6. **Service:** `kubectl get endpoints` - empty = selector mismatch or pods not Ready; `targetPort` matches container port.
7. **Pods:** Ready? app listening on that port? `kubectl port-forward` to pod and Service to test, bypassing ingress.
8. **Network policy** blocking traffic from ingress controller namespace; WAF rules blocking (403).
9. Check what changed recently (deploy, cert, annotation, controller upgrade).

**Example:**
```text
dig +short app.example.com
curl -sv https://app.example.com/health -o /dev/null
kubectl get ingress -n shop; kubectl describe ingress shop -n shop
kubectl logs -n kube-system deploy/aws-load-balancer-controller | tail -50
kubectl get svc,endpoints backend -n shop
kubectl port-forward svc/backend 8080:80 -n shop; curl localhost:8080/health
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

:::say
I trace the request path hop by hop: DNS resolution, load balancer listeners and target health, TLS, ingress controller logs and the Ingress rules, then Service endpoints and finally the pods with port-forward. Empty endpoints, wrong targetPort, unhealthy targets from a bad health-check path, and controller errors from annotations or IAM are the most common causes.
:::

## Kubernetes pods are healthy, but users are receiving errors (for example 503). How do you troubleshoot the complete request flow?

<!-- source: 03 Q71 -->

*Also asked as:* You are paged for 503 errors but all pods look healthy - where do you look next: metrics, probes, Ingress?

:::note In simple words
Every worker says "I am fine", yet customers are still turned away at the door. The problem is somewhere on the path between the door and the workers, or the workers are "fine" only because the health check is too easy.
:::

Request flow: **Client -> DNS -> CDN/WAF -> Load balancer -> Ingress controller -> Service -> Pod -> downstream (DB/cache/APIs).**

1. **Where are errors generated?** Look at who returns the 503: LB metrics (ELB 5xx vs Target 5xx), ingress controller access logs (`upstream connect error`, `no live upstreams`), or the app itself.
2. **Endpoints/readiness:** `kubectl get endpoints` - maybe only a few pods are Ready; readiness flapping; probes too shallow (pod "healthy" but app returns 503 for real requests).
3. **LB target health:** targets draining/unhealthy; target type (instance vs IP); `externalTrafficPolicy: Local` nodes without pods fail health checks.
4. **Capacity:** HPA already at `maxReplicas`? pods saturated (CPU throttling, thread/connection pool exhausted), ingress `max connections`/rate limits, app queue full -> 503.
5. **Timeouts and keep-alive:** app keep-alive timeout shorter than LB/ingress idle timeout -> intermittent 502/503 when the app closes a connection the proxy reuses. Set app keep-alive > LB idle timeout.
6. **Deploys/drains:** errors only during rollouts -> missing preStop/graceful shutdown; PDB missing during node drains/Karpenter consolidation.
7. **Downstream:** DB max connections, Redis latency, third-party API failing - app returns 503 when a dependency is down. Traces (Tempo/Jaeger) show the slow span.
8. **Network:** NetworkPolicy, DNS latency, conntrack table full, SNAT/NAT port exhaustion.
9. **Segment the errors:** by path, pod, node, AZ, version, client region - a pattern points to the cause.

**Example:**
```text
kubectl get endpoints api -n prod -o wide
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller | grep -E ' 50[234] ' | tail
kubectl get hpa -n prod; kubectl top pods -n prod
kubectl get events -n prod --sort-by=.lastTimestamp | tail
# PromQL: error rate by pod
sum by (pod) (rate(http_requests_total{status=~"5.."}[5m]))
aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_ELB_5XX_Count ...
```

:::say
I follow the request through DNS, load balancer, ingress, Service and pods, first identifying which layer generates the 503 from LB metrics and ingress logs. Then I check endpoints and readiness, LB target health, HPA at max or saturated pods, keep-alive and timeout mismatches, graceful shutdown during deploys and downstream dependencies, segmenting errors by pod, node and zone to find the pattern.
:::

## A Service is running but application requests are timing out. How do you troubleshoot the networking?

<!-- source: 03 Q72 -->

:::note In simple words
The phone number exists and the line rings, but nobody answers or the call drops. Either the call is not reaching the right person, or the person is too slow to pick up.
:::

Timeouts (not immediate refusal) usually mean packets are dropped or the app is too slow. Steps:

1. **Endpoints:** `kubectl get endpoints` - pods listed? If empty, clients may hang/refuse.
2. **Bypass layers to localize:**
- Call the **pod IP:port** directly from another pod -> works? then Service/kube-proxy layer.
- Call the **ClusterIP** -> works? then DNS or client side.
- Call the **DNS name** -> slow? DNS issue.
3. **Port mapping:** Service `port` -> `targetPort` must match the port the app listens on (`ss -lnt` in the pod). App bound to `127.0.0.1` instead of `0.0.0.0` is a classic.
4. **NetworkPolicy:** a default-deny drops packets silently -> timeout.
5. **kube-proxy/CNI:** kube-proxy pods healthy, iptables/IPVS rules present; CNI (aws-node) errors, IP exhaustion in subnet.
6. **Security Groups / NACLs** (EKS SG for pods, node SG between nodes), cross-node traffic blocked.
7. **App slowness:** CPU throttling, thread pool exhaustion, DB slow queries; check latency metrics and traces - "network timeout" is often a slow app.
8. **Conntrack table full** (`nf_conntrack: table full, dropping packet` in dmesg), MTU issues (large responses hang).
9. **Client timeouts** too short vs normal response time.

**Example:**
```text
kubectl run net --rm -it --image=nicolaka/netshoot -- bash
  curl -m 3 -v http://10.0.45.12:8080/health      # pod IP
  curl -m 3 -v http://10.100.12.34/health          # ClusterIP
  curl -m 3 -v http://api.prod.svc.cluster.local/health
  nc -zv api.prod 80 ; dig api.prod.svc.cluster.local
kubectl exec <api-pod> -- ss -lntp                 # 0.0.0.0:8080 or 127.0.0.1:8080?
kubectl get networkpolicy -n prod
kubectl logs -n kube-system -l k8s-app=kube-proxy | tail
```

:::say
I localize the timeout by testing pod IP, then ClusterIP, then DNS name from a netshoot pod, which tells me if it is the app, kube-proxy and Service layer, or DNS. Then I check targetPort versus the actual listening port and bind address, NetworkPolicies and security groups that silently drop packets, kube-proxy and CNI health, conntrack, and finally whether the app itself is just slow.
:::

## Pod A cannot reach Pod B. How do you debug it?

<!-- source: 03 Q73 -->

:::note In simple words
Two neighbours cannot visit each other. Check the address (DNS), whether the door is open (port), whether a guard blocks the gate (NetworkPolicy/SG), and whether the road exists (CNI/routing).
:::

1. **Are both pods Running and Ready,** and what are their IPs/nodes? (`-o wide`)
2. **How is A calling B?** Pod IP, Service name, or FQDN? Across namespaces it must be `svc-b.ns-b` or `svc-b.ns-b.svc.cluster.local`.
3. **DNS:** from pod A: `nslookup svc-b.ns-b.svc.cluster.local`.
4. **Service:** selector matches B's labels, endpoints populated, port/targetPort correct.
5. **Direct pod IP test:** `curl <podB-IP>:<port>` from A.
- Fails only across nodes but works on same node -> CNI/overlay/SG between nodes.
- Fails everywhere -> app not listening or NetworkPolicy.
6. **NetworkPolicy** on B's namespace (ingress) or A's (egress, including DNS egress).
7. **CNI health:** aws-node/calico/cilium pods, IP allocation errors; `cilium connectivity test` / Hubble for flow drops.
8. **Security Groups for pods / node SGs** on EKS; host firewall.
9. **Service mesh:** mTLS STRICT mode and pod A without sidecar -> connection reset.

**Example:**
```text
kubectl get pod -o wide -n ns-a; kubectl get pod -o wide -n ns-b
kubectl exec -n ns-a podA -- nslookup svc-b.ns-b.svc.cluster.local
kubectl exec -n ns-a podA -- curl -m 3 -sv http://svc-b.ns-b:8080/health
kubectl exec -n ns-a podA -- curl -m 3 -sv http://<podB-ip>:8080/health
kubectl get endpoints svc-b -n ns-b
kubectl get networkpolicy -n ns-b -o yaml
kubectl get pods -n kube-system -l k8s-app=aws-node
```

:::say
I confirm both pods are ready, then test from pod A by FQDN, by Service ClusterIP and by pod B's IP to isolate DNS, Service and network layers. After that I check selectors and endpoints, NetworkPolicies in both namespaces including DNS egress, CNI health and security groups between nodes, and mesh mTLS settings.
:::

## Service discovery fails across namespaces, but DNS looks green. What is your next step, and how do you confirm the root cause?

<!-- source: 03 Q74 -->

*Also asked as:* A pod cannot resolve service names, yet DNS looks fine - what is your next move?

:::note In simple words
The phone directory works for people on your own floor, but when you look up someone on another floor using only their first name, you get nothing - you need their full name and floor, and the corridor door must be open.
:::

"DNS looks green" (CoreDNS pods Running, no errors) does not mean the **name the app uses** resolves or the service behind it works. Next steps:

1. **Short name vs FQDN:** a short name `payments` only resolves inside the same namespace because of `search` domains in `/etc/resolv.conf` (`<ns>.svc.cluster.local svc.cluster.local cluster.local`). Cross-namespace needs `payments.billing` or `payments.billing.svc.cluster.local`. Check the app config.
2. **Test from the failing pod itself** (not from your laptop or a random pod):
- `nslookup payments.billing.svc.cluster.local` -> returns ClusterIP? Then DNS is really fine and the issue is further along.
- NXDOMAIN on short name but FQDN works -> config issue (wrong name/namespace).
3. **Pod's resolv.conf / dnsPolicy:** `hostNetwork` pods or `dnsPolicy: Default` use node DNS, not CoreDNS; custom `dnsConfig` may override search domains.
4. **Service has endpoints?** `kubectl get endpointslices -n billing -l kubernetes.io/service-name=payments` - empty = selector mismatch or pods not Ready. DNS still resolves the ClusterIP, but connections fail.
5. **Ports:** Service port vs `targetPort` vs container port; named port mismatch.
6. **NetworkPolicy** in the target namespace allowing only same-namespace traffic (namespaceSelector missing), or egress policy in the source namespace blocking.
7. **Curl the pod IP directly** from the source pod - works? then Service/kube-proxy (iptables rules) problem; check kube-proxy logs.
8. **Mesh / headless:** headless Service returns pod IPs; ExternalName misconfigured.

Confirm root cause by reproducing: FQDN nslookup -> ClusterIP, EndpointSlice contents, curl pod IP vs ClusterIP, and a temporary NetworkPolicy allow test in a non-prod namespace.

**Example:**
```text
kubectl exec -n orders deploy/api -- cat /etc/resolv.conf
# search orders.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5
kubectl exec -n orders deploy/api -- nslookup payments                   # NXDOMAIN
kubectl exec -n orders deploy/api -- nslookup payments.billing.svc.cluster.local
kubectl get endpointslices -n billing -l kubernetes.io/service-name=payments
kubectl exec -n orders deploy/api -- curl -m 3 -sv http://payments.billing:8080/health
kubectl exec -n orders deploy/api -- curl -m 3 -sv http://<payments-pod-ip>:8080/health
kubectl get networkpolicy -n billing -o yaml | grep -A5 namespaceSelector
```

:::say
I test from the failing pod itself: the short name only resolves within its own namespace through the search domains, so cross-namespace calls need name.namespace or the full svc.cluster.local FQDN. If the FQDN resolves, I check EndpointSlices for a selector mismatch, targetPort, NetworkPolicies that block cross-namespace traffic and kube-proxy, confirming by comparing curl to the ClusterIP versus the pod IP.
:::
