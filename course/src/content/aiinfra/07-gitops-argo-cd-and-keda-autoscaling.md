---
track: aiinfra
title: GitOps with Argo CD, and event-driven autoscaling with KEDA
short: GitOps, Argo CD, KEDA
sub: Git as the source of truth for a cluster: build and run a miniature GitOps reconciler against a real cluster, then read real Argo CD and KEDA configuration and simulate queue-driven scaling.
---

:::goals
- explain GitOps and the reconcile loop: desired state in Git, actual state in the cluster
- run a miniature reconciler on a real Kubernetes cluster and watch it detect drift, self-heal, deploy a change and prune
- read an Argo CD Application and understand sync, prune, self-heal and health
- explain what KEDA adds to the Horizontal Pod Autoscaler and simulate queue-length scaling, including scale to zero
:::

:::note What ran and what did not
I **read the READMEs** of Argo CD and KEDA for this lesson. Their images are not available inside this lab, so **Argo CD and KEDA themselves are not run here**: their YAML is labelled **Example, not run here**. What **does run** is a small reconciler I wrote that implements the **same idea** (Git is the truth, the cluster is continuously made to match, drift is healed, removed files are pruned) against the **real Kubernetes cluster** of this lab. It is a teaching model, not a replacement for Argo CD: it has none of its safety, scale or UI.
:::

```setup
export LABNS=labgitops
```

@setup k8s

## 1. What GitOps is

**GitOps** is an operating model with three rules:

1. The **desired state** of the system is described **declaratively** and stored in **Git**.
2. An automated agent in or near the cluster **pulls** that state and makes the cluster **match** it.
3. The agent **keeps checking** and corrects **drift** (someone changing the cluster by hand).

The Argo CD README states the principles briefly: application definitions, configurations and environments should be **declarative and version controlled**, and deployment and lifecycle management should be **automated, auditable and easy to understand**. What you gain:

| Benefit | Because |
|---|---|
| **Audit trail** | every change is a commit with an author, a review and a time |
| **Rollback** | `git revert` and the cluster follows |
| **Consistency** | no snowflake clusters; the repo shows what should run |
| **Security** | engineers need Git access, not production credentials; the cluster **pulls**, so no CI system holds cluster-admin keys |
| **Disaster recovery** | rebuild a cluster by pointing a new agent at the same repo |

It connects to everything before it: Git (the Git track), Kubernetes manifests, and Terraform's "declare it, plan it, apply it" idea. Where **CI** (Jenkins) **builds and tests** and **pushes an image**, GitOps **delivers**: CI's last step is to **commit a new image tag** to the config repository, and the agent does the rest.

## 2. A miniature GitOps reconciler, on a real cluster

The "Git repository" is a real local Git repository holding manifests. The reconciler **reads the manifests from the Git commit** (`HEAD`), compares them with the cluster, **applies** differences, **prunes** objects that no longer exist in Git, and reports drift:

```run
mkdir -p ~/lab/gitops && cd ~/lab/gitops
rm -rf repo && mkdir -p repo/apps/web && cd repo
git init -q -b main && git config user.email "ops@example.com" && git config user.name "Ops"
cat > apps/web/deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: {app: web, managed-by: mini-gitops}
spec:
  replicas: 2
  selector: {matchLabels: {app: web}}
  template:
    metadata: {labels: {app: web}}
    spec:
      containers:
      - name: web
        image: busybox:1.37
        command: ["sh", "-c", "mkdir -p /www && echo 'hello v1' > /www/index.html && httpd -f -p 8080 -h /www"]
        ports: [{containerPort: 8080}]
EOF
cat > apps/web/config.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-settings
  labels: {managed-by: mini-gitops}
data:
  feature_x: "off"
EOF
git add -A && git commit -q -m "web: initial deployment and settings" && git log --oneline
```

Now the reconciler itself. Read it: it is only about forty lines, and each step maps to something Argo CD does:

```run
cd ~/lab/gitops
cat > reconcile.py <<'EOF'
import subprocess, sys, tempfile, os, json

REPO, NS = os.path.expanduser("~/lab/gitops/repo"), os.environ.get("LABNS", "labgitops")
LABEL = "managed-by=mini-gitops"

def sh(*args, input=None):
    return subprocess.run(args, capture_output=True, text=True, input=input)

def git_manifests():
    """Read every manifest from the committed state (HEAD), not from the working directory."""
    files = sh("git", "-C", REPO, "ls-tree", "-r", "--name-only", "HEAD").stdout.split()
    docs = []
    for f in files:
        if f.endswith(".yaml"):
            docs.append(sh("git", "-C", REPO, "show", f"HEAD:{f}").stdout)
    return "\n---\n".join(docs)

def reconcile():
    desired = git_manifests()
    commit = sh("git", "-C", REPO, "rev-parse", "--short", "HEAD").stdout.strip()
    print(f"[reconcile] desired state = Git commit {commit}")
    # 1. DIFF: kubectl diff exits 1 when the cluster differs from the manifests
    diff = sh("kubectl", "-n", NS, "diff", "-f", "-", input=desired)
    changed = sorted({l.split()[0].lstrip("+-") for l in diff.stdout.splitlines() if l.startswith(("+++", "---"))} - {"+++", "---"})
    if diff.returncode == 1:
        print("[reconcile] OUT OF SYNC: the cluster differs from Git ->", "apply")
        out = sh("kubectl", "-n", NS, "apply", "-f", "-", input=desired).stdout
        for line in out.strip().splitlines(): print("   ", line)
    else:
        print("[reconcile] in sync, nothing to do")
    # 2. PRUNE: delete labelled objects that Git no longer contains
    wanted = set(sh("kubectl", "-n", NS, "apply", "--dry-run=client", "-o", "name", "-f", "-", input=desired).stdout.split())
    live = set(sh("kubectl", "-n", NS, "get", "deploy,cm,svc", "-l", LABEL, "-o", "name").stdout.split())
    for obj in sorted(live - wanted):
        print(f"[reconcile] PRUNE {obj}: no longer in Git")
        sh("kubectl", "-n", NS, "delete", obj)
    # 3. HEALTH: wait for the rollout like Argo CD's health assessment
    r = sh("kubectl", "-n", NS, "rollout", "status", "deploy/web", "--timeout=90s")
    print("[reconcile] health:", "Healthy" if r.returncode == 0 else "Degraded - " + r.stdout.strip()[-60:])

if __name__ == "__main__":
    reconcile()
EOF
echo "--- first reconcile: the cluster is empty, so everything is created"
python3 reconcile.py
kubectl get deploy,cm -l managed-by=mini-gitops --no-headers | awk '{print "   cluster has:", $1}'
```

Now four scenes. First, **someone changes the cluster by hand** (the thing GitOps exists to stop). The next reconcile notices and heals it:

```run
cd ~/lab/gitops
echo "--- an engineer scales the deployment by hand, outside Git"
kubectl scale deploy/web --replicas=5 > /dev/null
kubectl get deploy web -o jsonpath='replicas in the cluster now: {.spec.replicas}{"\n"}'
echo "--- the reconciler runs"
python3 reconcile.py
kubectl get deploy web -o jsonpath='replicas in the cluster after self-heal: {.spec.replicas} (Git says 2){"\n"}'
```

That is Argo CD's **self-heal**. Second, a **deliberate change through Git**: edit the manifest, commit (in a real team: pull request, review, merge), reconcile:

```run
cd ~/lab/gitops/repo
sed -i 's/replicas: 2/replicas: 3/; s/hello v1/hello v2/' apps/web/deployment.yaml
sed -i 's/feature_x: "off"/feature_x: "on"/' apps/web/config.yaml
git commit -qam "web: scale to 3, release v2, enable feature_x" && git log --oneline | head -3
cd ~/lab/gitops && python3 reconcile.py
kubectl get cm web-settings -o jsonpath='feature_x in the cluster: {.data.feature_x}{"\n"}'
```

Third, **prune**: delete a file from Git, and the object disappears from the cluster:

```run
cd ~/lab/gitops/repo
git rm -q apps/web/config.yaml && git commit -qm "web: remove settings (no longer needed)"
cd ~/lab/gitops && python3 reconcile.py
kubectl get cm -l managed-by=mini-gitops --no-headers | wc -l | awk '{print "managed ConfigMaps left in the cluster:", $1}'
```

Fourth, **rollback** is a Git operation. Revert the last commit; the settings return:

```run
cd ~/lab/gitops/repo
git revert --no-edit HEAD > /dev/null && git log --oneline | head -5
cd ~/lab/gitops && python3 reconcile.py
kubectl get cm web-settings -o jsonpath='feature_x after the rollback: {.data.feature_x}{"\n"}'
```

The commit log is the **audit trail** of everything that happened to this cluster. What the toy leaves out and Argo CD provides: a **controller running continuously** (ours runs when called), **webhooks** for instant syncs, **multi-cluster** support, a **UI** with live resource trees and diffs, **RBAC and projects**, **sync waves and hooks** (run a database migration before the app), **health checks for many resource types**, **Helm and Kustomize** rendering, **secret handling** integrations, and notifications.

## 3. Argo CD in practice

An **Application** is the Argo CD object that connects a Git path to a cluster namespace (Example, not run here):

```yaml:application.yaml (Example, not run here)
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ev-search
  namespace: argocd
spec:
  project: ev-platform
  source:
    repoURL: https://git.example.com/platform/ev-config.git
    targetRevision: main               # a branch, tag or commit
    path: apps/ev-search/overlays/prod # plain YAML, Kustomize or Helm
  destination:
    server: https://kubernetes.default.svc
    namespace: ev-prod
  syncPolicy:
    automated:
      prune: true                      # delete what was removed from Git (our "prune" scene)
      selfHeal: true                   # revert manual drift (our "drift" scene)
    syncOptions: [CreateNamespace=true]
```

| Concept | Meaning |
|---|---|
| **Sync status** | does the cluster match Git: `Synced` or `OutOfSync` |
| **Health status** | do the resources work: `Healthy`, `Progressing`, `Degraded`, `Missing` |
| **Automated sync, prune, self-heal** | the three switches you saw in the toy; leave them **off** at first for production and sync by hand until you trust the repo |
| **Projects** | which repos and clusters a team may deploy from and to |
| **App of apps / ApplicationSet** | one Application (or a generator) that creates many, for example one per cluster or per environment |
| **Sync waves and hooks** | ordering: CRDs first, a migration job before the Deployment |
| **Image Updater** (separate project) | updates image tags in Git when a new image appears (the Argo CD README links "GitOps without pipelines with the Image Updater") |

The README also links material on using Argo CD for **ML platforms**: Kubeflow documents GitOps for Kubeflow with Argo CD, and one talk is titled "Machine Learning as Code". For the AI stack this means the **inference deployments** (engine image, model name, parallelism flags, resource requests, autoscaling rules) live in Git like any other service, so a change to `--tensor-parallel-size` is a reviewed commit, not a late-night `kubectl edit`.

:::warn Secrets and GitOps
Git must **not** contain plain secrets. Use **sealed or encrypted secrets** (Sealed Secrets, SOPS) or an **external secret store** (the cluster fetches from a vault using the External Secrets Operator or a CSI driver), so the repo holds only references or ciphertext.
:::

## 4. KEDA: autoscaling from events and queues

The built-in **Horizontal Pod Autoscaler (HPA)** scales on CPU, memory or metrics it can read through the Kubernetes metrics APIs, and it **cannot scale to zero**. From its README, **KEDA** (Kubernetes Event-driven Autoscaling) is a CNCF graduated project that allows **fine-grained autoscaling, including to and from zero**, for **event-driven** workloads. It acts as a **Kubernetes metrics server** and lets you define scaling rules with a dedicated custom resource, integrating with the HPA rather than replacing it.

You describe **what to watch** (a queue, a Prometheus query, a Kafka lag, a cron schedule) and KEDA creates and feeds the HPA (Example, not run here):

```yaml:scaledobject.yaml (Example, not run here)
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: llm-worker
spec:
  scaleTargetRef:
    name: llm-worker                   # the Deployment to scale
  minReplicaCount: 0                   # scale to zero when idle
  maxReplicaCount: 20
  cooldownPeriod: 300                  # seconds of no activity before scaling back to zero
  triggers:
  - type: prometheus                   # scale on an inference metric, e.g. waiting requests
    metadata:
      serverAddress: http://prometheus.monitoring:9090
      query: sum(vllm:num_requests_waiting)
      threshold: "8"                   # target about 8 waiting requests per replica
```

For inference this connects directly to lesson 6: scale on **queue depth or waiting requests** (a leading signal), not on CPU. Here is the decision logic, with a cooldown and scale to zero, simulated over a burst of traffic:

```run
cd ~/lab/gitops
cat > keda_sim.py <<'EOF'
import math
THRESHOLD, MIN, MAX, COOLDOWN = 8, 0, 6, 3       # target waiting requests per replica; cooldown measured in ticks

# waiting-request count at each tick: idle, a burst, then quiet again
queue = [0, 0, 5, 30, 55, 60, 40, 20, 6, 0, 0, 0, 0, 0, 0]

replicas, idle_ticks = 0, 0
print(f"{'tick':>4} {'queue':>6} {'replicas':>9}  decision")
for t, q in enumerate(queue):
    desired = min(MAX, max(MIN, math.ceil(q / THRESHOLD)))       # HPA-style: ceil(metric / target)
    note = ""
    if q > 0:
        idle_ticks = 0
        if desired > replicas:                                    # scale up immediately
            note = "activate from zero (cold start begins)" if replicas == 0 else "scale up"
            replicas = desired
        elif desired < replicas:                                  # real autoscalers add a stabilisation window here
            replicas, note = desired, "scale down"
    elif replicas > 0:
        idle_ticks += 1
        note = f"idle {idle_ticks}/{COOLDOWN}"
        if idle_ticks >= COOLDOWN:
            replicas, note = 0, "cooldown elapsed: scale to zero"
    print(f"{t:4d} {q:6d} {replicas:9d}  {note}")
EOF
python3 keda_sim.py
```

Notice the **activation from zero** at tick 2: with a GPU model, the first request then waits for a whole **cold start** (lesson 6), so scale-to-zero is for batch and internal tools, and interactive services keep `minReplicaCount: 1` or more. KEDA also scales **Jobs** (one job per queue message), a good fit for batch inference and embedding pipelines.

:::warn Common mistakes
- **Changing the cluster by hand "just this once"** when self-heal is on: the change is reverted, and when it is off, the repo silently stops being the truth.
- **Turning on automated prune on day one.** A mistaken deletion in Git deletes production objects. Start with manual sync and review the diff.
- **Putting application source code and deployment config in one repo with no separation.** Commits from CI would trigger CI again; keep a separate **config repository** (or path).
- **Plain secrets in Git.**
- **Scaling on CPU for GPU workloads**, or scaling to zero a service whose cold start takes minutes.
- **Fighting two controllers**: an HPA and KEDA both managing the same Deployment, or Argo CD reverting the replica count that an autoscaler set (tell Argo CD to ignore `spec.replicas`).
:::

:::recap
- GitOps: desired state in Git, an agent pulls and reconciles, drift is corrected; you gain audit, rollback, consistency and a smaller attack surface.
- The loop you ran: **diff, apply, prune, check health**. Argo CD is this loop with a controller, UI, RBAC, multi-cluster and a lot of safety.
- An Argo CD **Application** binds a Git path to a destination and sets `automated`, `prune` and `selfHeal`; **Sync** and **Health** are different statuses.
- **KEDA** adds event-driven scaling and scale to zero on top of the HPA; for inference scale on queue depth and respect cold starts.
:::

:::try Your turn
Add a `Service` for `web` to the repo (commit it, reconcile), then remove it again and confirm the reconciler prunes it (hint: the label `managed-by: mini-gitops` is what marks an object as owned). Then change `keda_sim.py` to use `COOLDOWN = 1` and describe what happens at tick 9 when the queue first reaches zero. Why would a service with a slow cold start avoid such a short cooldown?
:::

:::quiz
? Why does a GitOps agent pull from Git instead of CI pushing to the cluster?
+ The cluster needs no external admin credentials and the repo stays the single source of truth
- Pulling is faster
- CI cannot run kubectl
- Git cannot store YAML
! Pull-based delivery removes cluster-admin keys from CI and enables drift correction.
? What does `selfHeal: true` do in an Argo CD Application?
+ Reverts manual changes in the cluster back to the state in Git
- Restarts failed pods only
- Heals the Git repository
- Disables syncing
! It corrects drift.
? What does KEDA add beyond the standard HPA?
+ Event-driven scaling from sources like queues and Prometheus queries, including scale to and from zero
- A bigger CPU limit
- GPU scheduling
- Image building
! KEDA feeds scaling decisions from external events.
:::
