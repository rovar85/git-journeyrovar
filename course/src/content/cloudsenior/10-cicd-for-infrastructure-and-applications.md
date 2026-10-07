---
track: cloudsenior
title: Q10: How do you design CI/CD for infrastructure and applications (pipelines, approvals, rollbacks, blue/green, canary)?
short: Q10 CI/CD design
sub: Pipeline stages and gates, approvals, and safe release strategies shown for real on a Kubernetes cluster: an instant blue/green switch and rollback, a measured canary, and an automated promote-or-rollback decision.
---

:::goals
- design pipelines for applications and for infrastructure, with the same principles and different gates
- place approvals, environment promotion and policy checks sensibly
- compare rolling, blue/green and canary releases, and run the last two for real
- automate a promote-or-rollback decision from metrics
- handle the hard cases: database changes and rollback of stateful systems
:::

:::note Provenance
Blue/green and canary run on the **real lab Kubernetes cluster**. The canary **analysis** uses **simulated metrics** (the lab has no traffic metrics source), which is labelled. Pipeline syntax for Jenkins and others is an **Example, not run here**. This lesson builds on the Jenkins track, Docker, Kubernetes (Deployments, Services, rollouts) and the Terraform track.
:::

```setup
export LABNS=labcicd
```

@setup k8s

## 1. The principles

1. **Everything is in Git** (application, infrastructure, pipeline definition, policy), and **Git is the trigger**.
2. **Build once, deploy many**: build an **immutable artefact** (a container image, a versioned package) **once**, tag it with the commit, and **promote that exact artefact** through the environments. Never rebuild for production.
3. **Fast feedback first, slow checks later**: lint and unit tests in seconds, integration tests in minutes, performance and security scans in parallel.
4. **Automate the path to production**, but place **human approvals** where **risk** and **regulation** require them, not everywhere.
5. **Deployments are cheap and reversible**: small, frequent changes, each with a **tested rollback**.
6. **Observe the release**: the pipeline checks health and SLO signals after deploying, not just "the command succeeded".

## 2. Pipeline for applications

| Stage | Purpose | Gate |
|---|---|---|
| **Commit** | checkout, restore dependencies, lint, **unit tests**, static analysis | fail fast |
| **Build** | build the image once, tag with the commit SHA, **scan** it for vulnerabilities, **sign** it (supply chain), push to the registry | critical findings block |
| **Test environment** | deploy to an ephemeral or shared test environment, **integration and contract tests** | all pass |
| **Staging** | deploy the **same artefact** with production-like configuration, **end-to-end and performance smoke tests**, migration rehearsal | all pass, performance within budget |
| **Approval** (when required) | a person with authority approves the **change** (not the code): the plan, the risk, the rollback | recorded in the pipeline |
| **Production** | **progressive rollout** (canary or blue/green) with automated health checks | SLO signals healthy |
| **Verify and close** | smoke tests, dashboards, **automatic rollback on failure**, release notes | |

## 3. Pipeline for infrastructure

Infrastructure changes have a **plan** that shows the effect before it happens, which makes review more concrete than code review alone:

| Stage | Purpose |
|---|---|
| **Validate** | `terraform fmt -check`, `terraform validate`, lint, **module tests** (Q8) |
| **Policy and security scan** | scan the code **and the plan JSON** for violations (open ports, unencrypted storage, forbidden regions, Q4); **cost estimate** of the change (Q5) |
| **Plan** | `terraform plan -out=plan.bin`, **posted on the pull request**; reviewers read the **plan** (replacements, deletions) as well as the code |
| **Approval** | required for **production** and for plans that **destroy or replace** resources; the approver sees the same plan that will be applied |
| **Apply** | apply **exactly the reviewed plan file**, from the pipeline identity (OIDC, short-lived, least privilege), with state locking (Q8) |
| **Verify** | post-apply checks (health, connectivity tests), **drift detection** scheduled afterwards (Q8) |

Rules that matter for infrastructure specifically: **no apply from laptops**, **separate pipelines and credentials per environment** (a dev pipeline cannot touch prod), **ordered stacks** (network before platform before applications), and **rollback is a revert of the code plus apply** (and **some changes cannot be reverted**: deleting a database. Those are protected with `prevent_destroy`, backups and approvals).

An Example, not run here, of an infrastructure pipeline in Jenkins declarative syntax:

```groovy:Jenkinsfile (Example, not run here)
pipeline {
  agent { label 'terraform' }
  environment { TF_IN_AUTOMATION = '1' }
  stages {
    stage('Validate') { steps { sh 'terraform fmt -check -recursive && terraform init -input=false && terraform validate && terraform test' } }
    stage('Policy')   { steps { sh 'checkov -d . --quiet' } }
    stage('Plan')     { steps { sh 'terraform plan -input=false -out=plan.bin && terraform show -json plan.bin > plan.json' }
                        post { success { archiveArtifacts 'plan.json' } } }
    stage('Plan policy') { steps { sh 'conftest test plan.json' } }
    stage('Approve')  { when { branch 'main' } steps { input message: 'Apply this plan to PRODUCTION?', submitter: 'platform-leads' } }
    stage('Apply')    { when { branch 'main' } steps { sh 'terraform apply -input=false plan.bin' } }
  }
}
```

Two properties matter: the **same plan file** is reviewed and applied (no plan/apply gap), and **approval** is explicit and restricted to named approvers.

## 4. Release strategies, compared

| Strategy | How | Rollback | Cost and risk |
|---|---|---|---|
| **Recreate** | stop old, start new | redeploy old | downtime |
| **Rolling update** | replace instances gradually | roll back the rollout (`kubectl rollout undo`) | cheap; old and new versions **coexist**, so changes must be **backward compatible** |
| **Blue/green** | run the **new version (green) beside the old (blue)**, test it, then **switch traffic all at once** | **switch back**, instantly | needs **double capacity** during the switch; clean cutover; the switch is all-or-nothing |
| **Canary** | send a **small share of real traffic** to the new version, **measure**, then increase | send all traffic back to the stable version | needs traffic splitting and **good metrics**; limits the blast radius |
| **Feature flags** (dark launch) | deploy code switched **off**, enable per user or percentage at runtime | turn the flag off | decouples **deployment** from **release**; adds flag hygiene work |

### Blue/green for real

Two Deployments run side by side. A Service selects **one** of them with a label. "Switching" is changing the selector, which is **instant and reversible**:

```run
cat > bluegreen.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: app-blue}
spec:
  replicas: 2
  selector: {matchLabels: {app: shop, track: blue}}
  template:
    metadata: {labels: {app: shop, track: blue}}
    spec:
      containers:
      - name: web
        image: busybox:1.37
        command: ["sh", "-c", "mkdir -p /w; echo 'shop version 1 (blue)' > /w/index.html; httpd -f -p 8080 -h /w"]
        readinessProbe: {httpGet: {path: /, port: 8080}, periodSeconds: 2}
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: app-green}
spec:
  replicas: 2
  selector: {matchLabels: {app: shop, track: green}}
  template:
    metadata: {labels: {app: shop, track: green}}
    spec:
      containers:
      - name: web
        image: busybox:1.37
        command: ["sh", "-c", "mkdir -p /w; echo 'shop version 2 (green)' > /w/index.html; httpd -f -p 8080 -h /w"]
        readinessProbe: {httpGet: {path: /, port: 8080}, periodSeconds: 2}
---
apiVersion: v1
kind: Service
metadata: {name: shop}
spec:
  selector: {app: shop, track: blue}          # production traffic goes to BLUE
  ports: [{port: 80, targetPort: 8080}]
EOF
kubectl apply -f bluegreen.yaml > /dev/null
kubectl rollout status deployment/app-blue --timeout=90s > /dev/null
kubectl rollout status deployment/app-green --timeout=90s > /dev/null
kubectl run client --image=busybox:1.37 --restart=Never -- sleep 3600 > /dev/null
kubectl wait --for=condition=Ready pod/client --timeout=60s > /dev/null
ask() { kubectl exec client -- wget -T 3 -qO- http://shop.labcicd.svc.cluster.local; }
echo "users see:            $(ask)"
echo "(green is running and testable on its own, with no user traffic yet)"
echo "--- cut over: change the selector from blue to green"
kubectl patch service shop -p '{"spec":{"selector":{"app":"shop","track":"green"}}}' > /dev/null; sleep 3
echo "users now see:        $(ask)"
echo "--- problem found: roll back by switching the selector back"
kubectl patch service shop -p '{"spec":{"selector":{"app":"shop","track":"blue"}}}' > /dev/null; sleep 3
echo "after the rollback:   $(ask)"
```

(The short pause after each patch is the time kube-proxy needs to update its rules on the node; in production the load balancer's health checks and connection draining play that role.) Everything about blue/green appears in those few lines: the new version is **fully deployed and ready before** any user sees it (so you can test it against real infrastructure), the switch is **one atomic change**, and the rollback is the **same change reversed**, taking effect in seconds because the old version is **still running**. The cost is paying for both. In real systems the "switch" is a load balancer target group, a DNS weight, a traffic-manager rule or a service mesh route; for databases it needs care (below).

### Canary for real

Here both versions sit behind **one Service**, and the **ratio of Pods** sets the traffic split (about 1 in 5 requests goes to the canary):

```run
kubectl delete deployment app-green > /dev/null
kubectl patch service shop --type=json -p '[{"op":"replace","path":"/spec/selector","value":{"app":"shop"}}]' > /dev/null   # select both tracks (a plain merge patch would keep track=blue)
kubectl scale deployment app-blue --replicas=4 > /dev/null
cat > canary.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: app-canary}
spec:
  replicas: 1
  selector: {matchLabels: {app: shop, track: canary}}
  template:
    metadata: {labels: {app: shop, track: canary}}
    spec:
      containers:
      - name: web
        image: busybox:1.37
        command: ["sh", "-c", "mkdir -p /w; echo 'shop version 2 (canary)' > /w/index.html; httpd -f -p 8080 -h /w"]
        readinessProbe: {httpGet: {path: /, port: 8080}, periodSeconds: 2}
EOF
kubectl apply -f canary.yaml > /dev/null
kubectl rollout status deployment/app-blue --timeout=90s > /dev/null
kubectl rollout status deployment/app-canary --timeout=90s > /dev/null
echo "100 requests through the Service (4 stable Pods, 1 canary Pod):"
kubectl exec client -- sh -c 'for i in $(seq 1 100); do wget -T 3 -qO- http://shop.labcicd.svc.cluster.local; done' | sort | uniq -c | sort -rn
```

The canary receives **roughly its share of the traffic** (here about one request in five; the exact count varies from run to run because kube-proxy picks a Pod at random). Pod-count ratios are the crudest way to split traffic: **finer control** (1% of traffic, or by user or header) comes from an **ingress controller, a service mesh, or a progressive delivery controller** (Argo Rollouts and Flagger are the well-known ones, from my knowledge), which also **automate the analysis**.

### The automated promote-or-rollback decision

A canary is only useful if something **measures it**. The decision logic compares the canary's key metrics with the stable version's over the same window (simulated here, because the lab has no traffic metrics), against **explicit thresholds**, and acts:

```run
cat > analysis.py <<'EOF'
import random, subprocess
random.seed(3)

def window(error_rate, latency_ms, n=500):
    """Simulated metrics for n requests."""
    errors = sum(random.random() < error_rate for _ in range(n))
    lats = sorted(random.gauss(latency_ms, latency_ms * 0.2) for _ in range(n))
    return errors / n, lats[int(0.95 * n)]

def decide(stable, canary, max_error_delta=0.01, max_latency_ratio=1.25):
    err_s, p95_s = stable; err_c, p95_c = canary
    if err_c - err_s > max_error_delta:        return "ROLLBACK", f"error rate {err_c:.1%} vs {err_s:.1%} (limit +{max_error_delta:.0%})"
    if p95_c > p95_s * max_latency_ratio:      return "ROLLBACK", f"p95 latency {p95_c:.0f} ms vs {p95_s:.0f} ms (limit x{max_latency_ratio})"
    return "PROMOTE", "within limits"

def kubectl(*a): return subprocess.run(["kubectl", *a], capture_output=True, text=True).stdout.strip()

for label, canary_metrics in (("a healthy canary", window(0.004, 120)), ("a canary with a hidden bug", window(0.06, 125))):
    stable = window(0.004, 120)
    verdict, why = decide(stable, canary_metrics)
    print(f"{label:28} -> {verdict}: {why}")
    if verdict == "ROLLBACK":
        kubectl("scale", "deployment", "app-canary", "--replicas=0")
        print("   action: canary scaled to 0, all traffic back on the stable version")
    else:
        kubectl("scale", "deployment", "app-canary", "--replicas=2")
        print("   action: canary increased to 2 Pods (next step of the progressive rollout: 20% -> 40% -> ...)")
EOF
python3 analysis.py
kubectl get deployment app-canary --no-headers | awk '{print "canary replicas now:", $2}'
```

This is the logic real tools implement: **step the share up (for example 5%, 25%, 50%, 100%), measure at each step against the stable version's baseline using SLO-style signals (errors, latency, saturation, business metrics), and roll back automatically when a limit is crossed**. The thresholds are an **agreement with the business** about acceptable risk.

```run
kubectl delete deployment app-blue app-canary > /dev/null; kubectl delete service shop > /dev/null; kubectl delete pod client --wait=false > /dev/null
```

## 5. Rollback: the hard cases

- **Stateless code**: roll back by redeploying the previous artefact (or switching traffic). Practise it.
- **Database schema changes**: the usual trap. Use the **expand and contract** pattern (also called parallel change): (1) **expand**: add the new column or table in a **backward-compatible** way; (2) deploy code that **writes both** and reads the old; (3) **migrate** data; (4) deploy code that reads the new; (5) **contract**: remove the old structure in a **later** release. Every step is reversible; a single destructive migration is **not**.
- **Irreversible actions** (sending emails, charging cards, deleting data): guard with **feature flags**, idempotency and **approvals**; test the compensation path.
- **Infrastructure**: revert the code and apply; **destruction cannot be reverted**, so protect stateful resources and keep backups (Q7).
- **Roll forward versus roll back**: if the fix is trivial and a deploy is fast and safe, rolling forward can be quicker; **decide ahead of time and write it in the runbook**.

## 6. Pipeline security and reliability

- **Credentials**: OIDC federation or workload identity for cloud access, **no long-lived keys in the pipeline** (Q11); secrets from a vault, masked in logs.
- **Least privilege** per pipeline and environment; **protected branches**, required reviews, and signed commits where regulation demands.
- **Supply chain**: pinned dependencies, scanned and **signed images**, a **software bill of materials**, and admission policies that only allow signed images (Q4).
- **Ephemeral runners** (clean containers per job), not long-lived build servers with accumulated state (the Jenkins track).
- **Pipeline as code**, reviewed like application code; **shared libraries or templates** for consistency (Q13).
- **Measure delivery performance** with the four DORA metrics (from my knowledge): **deployment frequency, lead time for changes, change failure rate, time to restore service**.

## 7. How to answer

1. **Principles** in one breath: everything in Git, **build once**, promote the same artefact, fast checks first, automate to production with approvals where risk demands, **observe the release**.
2. **Two pipelines**: application stages and infrastructure stages (**plan reviewed and applied exactly**), with the gates at each.
3. **Release strategy by risk**: rolling for low risk, **blue/green** for instant rollback, **canary** with automated analysis for high-traffic or risky changes, **feature flags** to separate deploy from release.
4. **Approvals**: risk-based and recorded, restricted to named approvers, never a rubber stamp.
5. **Rollback**: tested, fast, and the hard cases (**database expand and contract**, irreversible actions).
6. **Measure and improve**: DORA metrics, pipeline duration, failure causes.

## 8. Follow-up questions to expect

- "**Blue/green with a database**: how?" (shared database with backward-compatible schema changes using expand and contract; both versions must work with the same schema during the cutover)
- "How do you **choose canary thresholds**?" (from SLOs and historical variance; start strict on errors, allow a latency margin; review false rollbacks)
- "How do you handle **long-running** or **stateful** services (queues, websockets)?" (drain connections, version the protocol, let in-flight work finish)
- "What if the **pipeline itself is down** and production is on fire?" (a documented, audited break-glass deployment path)
- "**Monorepo or many repositories**; how do pipelines scale?" (path filters and affected-only builds, shared templates, caching)
- "How do you **prevent a bad release at 5 p.m. on Friday**?" (automation and small changes make timing less important; use change freezes only where they pay off)

:::warn Common mistakes
- **Rebuilding artefacts per environment.** What you tested is not what you ship.
- **Approvals as ritual** (everyone clicks yes) or approvals nobody can give quickly.
- **Plan and apply separated** by hours, so what is applied differs from what was reviewed.
- **Canary without metrics**: you are just deploying slowly.
- **Rollback never practised**, or blocked by an irreversible schema migration.
- **Credentials stored in the CI system** instead of short-lived federation.
- **Patching a Service selector with a merge patch** and forgetting that map keys are merged, not replaced (a leftover `track` label silently excludes your canary): replace the whole selector.
:::

:::recap
- **Build once, promote the same artefact**; fast checks first; approvals by risk; observe the release.
- **Infrastructure pipelines** validate, scan, **plan, review the plan, apply that exact plan**, then verify and watch for drift.
- **Blue/green** = instant switch and rollback at double cost (shown for real); **canary** = limited blast radius plus measurement (shown for real); **feature flags** separate deployment from release.
- **Automate the promote or rollback decision** from metrics against agreed thresholds.
- **Databases use expand and contract**; some actions cannot be rolled back, so guard them.
:::

:::try Your turn
Rerun the canary with 9 stable replicas and 1 canary replica (about 10%), count 100 requests, and compare with the 20% run. Then change `decide()` in `analysis.py` to also roll back when the canary's p95 latency exceeds 150 ms absolute, and test it with a slow canary.
:::

:::quiz
? What is the main advantage of blue/green deployment?
+ The new version is fully deployed and testable before the switch, and rollback is switching back instantly
- It uses half the resources
- It needs no load balancer
- It removes database migrations
! The cost is running both versions at once.
? Why should the pipeline apply the exact plan file that was reviewed?
+ So nothing changes between review and apply
- Plan files are faster
- It avoids state
- It skips policy checks
! Otherwise the applied change can differ from the approved one.
? How should a risky database schema change be released?
+ In backward-compatible steps (expand, migrate, switch, contract) so each step can be rolled back
- In one destructive migration at night
- Directly in production by hand
- Only after deleting the backups
! Old and new code must work with the schema during the transition.
:::
