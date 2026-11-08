---
track: seniorqa
title: "Q5: Design a GitOps workflow for 20+ teams with independent release cycles"
short: Q5 GitOps at scale
sub: Repository layout, one ApplicationSet for every team and environment, AppProjects as the blast-radius limit, promotion by pull request, and a CI validator you can run.
---

:::goals
- choose a repository layout that lets teams release independently without stepping on each other
- explain ApplicationSet, AppProject and the platform-team versus product-team split
- design environment promotion and production gating
- describe the guard rails: policy, RBAC, validation in CI and drift correction
:::

:::note How this connects
GitOps push versus pull, ApplicationSet, Kyverno and Crossplane are introduced in [Kubernetes 19](#kubernetes-19). Config drift is [Q8](#seniorqa-8).
:::

## Design a GitOps workflow for 20+ teams with independent release cycles

**What the interviewer tests:** can you give every team autonomy **and** keep the platform safe? The two failures are a central bottleneck (one team approves everything) and a free-for-all (any team can break any other).

### Clarifying questions

- How many clusters and environments? One cluster per environment, or shared clusters with namespaces?
- Is each team a service or many services? Do teams own their own namespaces?
- Which tools are fixed: Argo CD or Flux, Helm or Kustomize, a policy engine?
- What approvals are required for production (compliance, change windows)?
- How are images built today, and who owns the CI?

### The principles

1. **Git is the source of truth for desired state.** A controller **inside** the cluster pulls and applies it. Nobody runs `kubectl apply` against production by hand.
2. **CI builds and tests; GitOps deploys.** CI produces an immutable image and updates the deploy repository (a commit). The controller does the rollout. CI never needs cluster credentials.
3. **The platform team owns the platform; product teams own their apps.** The boundary is enforced by tooling, not by trust.

### Repository layout

- **Platform repository** (platform team): cluster add-ons, the ApplicationSet, AppProjects, policies, shared base charts.
- **One deploy repository per team** (or a folder per team in a mono-repo of manifests): the team's apps with `base/` plus `envs/dev`, `envs/staging`, `envs/prod` overlays (Kustomize) or values files (Helm).
- **Source repositories** stay separate from deploy repositories so an application commit does not force a deploy and a config change does not rebuild the image.

Teams release on their own schedule because their deploy repository is theirs: a merge there is a release. No other team's pipeline is involved.

### One template, 60 applications

Do not hand-write 60 Argo CD `Application` objects. An **ApplicationSet** generates them from a list of teams and environments.

```term
# Example (not run here): one ApplicationSet creates team x environment applications
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata: {name: team-apps, namespace: argocd}
spec:
  generators:
  - matrix:
      generators:
      - git: {repoURL: https://git.example.com/platform/teams.git, revision: main, files: [{path: "teams/*.yaml"}]}
      - list: {elements: [{env: dev}, {env: staging}, {env: prod}]}
  template:
    metadata: {name: "{{team}}-{{env}}"}
    spec:
      project: "team-{{team}}"            # the AppProject limits what this team can touch
      source: {repoURL: "{{repo}}", targetRevision: main, path: "envs/{{env}}"}
      destination: {server: "{{cluster}}", namespace: "{{team}}-{{env}}"}
      syncPolicy:
        automated: {prune: true, selfHeal: true}   # dev/staging; production overrides this
```

Adding a 21st team is a pull request that adds one small file under `teams/`: onboarding becomes self-service.

### Limiting the blast radius

An **AppProject** restricts, per team: which Git repositories it may deploy from, which clusters and **namespaces** it may deploy to, and which cluster-scoped kinds are allowed. A team cannot create a ClusterRole or deploy into `kube-system`. Add:

- **Namespace-per-team-per-environment** with ResourceQuotas and LimitRanges, NetworkPolicies by default-deny, and Pod Security standards.
- **Policy as code** (Kyverno or OPA Gatekeeper): required labels, no `latest` tags, no privileged pods, resource limits present.
- **RBAC:** teams can view and sync their apps in the Argo CD UI, not others'. Use SSO groups mapped to projects.

### A validator you can run

The model below checks 60 generated applications against the rules a platform repository would enforce in CI, so mistakes are caught in the pull request, not in the cluster.

```run
mkdir -p ~/lab/seniorqa/q5 && cd ~/lab/seniorqa/q5
cat > gitops20.py <<'EOF'
# A repository layout and ownership model for 20 teams, plus a validator for the rules that keep teams from hurting each other.
TEAMS = [f"team-{c}" for c in "abcdefghijklmnopqrst"]
ENVS = ["dev", "staging", "prod"]
CLUSTERS = {"dev": "cluster-dev", "staging": "cluster-stg", "prod": "cluster-prod-eu"}
apps = []
for t in TEAMS:
    for e in ENVS:
        apps.append({"name": f"{t}-{e}", "project": t, "repo": f"git@git.example.com:{t}/deploy.git", "path": f"envs/{e}", "cluster": CLUSTERS[e], "namespace": f"{t}-{e}", "auto_sync": e != "prod"})
# two mistakes a real review would catch
apps[14]["namespace"] = "kube-system"                       # a team deploying into a platform namespace
apps[40]["project"] = "default"                             # an app outside any team project (no limits on what it may do)
print(f"{len(TEAMS)} teams x {len(ENVS)} environments = {len(apps)} Applications, generated from one template (ApplicationSet)\n")
print("Ownership model:")
print("  platform team owns : cluster add-ons, the ApplicationSet, AppProjects, policies, shared base charts")
print("  each product team  : its own deploy repository and its own namespaces (team-x-dev / -staging / -prod); releases on its own schedule")
print("  production         : auto-sync OFF; a pull request merged into envs/prod is the release, and a human or pipeline presses sync\n")
problems = []
for a in apps:
    if a["project"] == "default": problems.append((a["name"], "not in a team AppProject: no limits on repos, clusters or namespaces"))
    if not a["namespace"].startswith(a["project"]) : problems.append((a["name"], f"namespace {a['namespace']} is not owned by project {a['project']}"))
    if a["namespace"] in ("kube-system", "argocd", "kyverno"): problems.append((a["name"], f"deploys into the protected namespace {a['namespace']}"))
print("Validator findings (run in CI on every change to the platform repository):")
for n, why in problems: print(f"  FAIL {n}: {why}")
print(f"\n{len(apps) - len(set(n for n, _ in problems))} of {len(apps)} applications pass")
print("\nBlast-radius check: what can one team's project touch?")
print("  AppProject team-a: destinations only team-a-* namespaces, sources only team-a repositories, no cluster-scoped kinds except an allow-list")
EOF
python3 gitops20.py
```

What the output shows: 58 of 60 applications pass; the two failing teams were caught before merging. One tried to deploy into `kube-system`; one was not in a team project and so had no limits at all. The blast-radius line states the rule: a team's project can touch only its own namespaces and repositories.

### Promotion across environments

- **Same artifact, different config.** The image digest that passed staging is the one promoted; do not rebuild.
- **dev and staging:** auto-sync from the main branch.
- **prod:** auto-sync **off**, or a promotion pull request (an image-updater or a small CI job opens a PR from staging to prod). The merge **is** the release, with the approval trail required by auditors. A human or a pipeline presses sync, optionally inside a change window.
- **Progressive delivery** (Argo Rollouts or Flagger): canary with automatic analysis and abort on SLO burn, so a team's bad release is contained.
- **Release independence:** teams that must ship together use a shared tag or an umbrella app, but that is the exception.

### Operating it

- **Drift:** `selfHeal` reverts manual changes; alerts fire for apps that are out of sync or degraded.
- **Secrets:** never in Git as plain text. Use External Secrets Operator or Sealed Secrets or SOPS.
- **Multi-cluster:** one Argo CD per environment tier, or one control plane managing many clusters (watch its blast radius), with the same ApplicationSet targeting cluster labels.
- **Observability:** a dashboard of sync status by team, time from merge to healthy, and the share of failed syncs.
- **Onboarding and docs:** a template repository ("golden path") that new teams copy.

:::say
I would split ownership: a platform repository owned by the platform team with the add-ons, policies and one ApplicationSet, and one deploy repository per team that the team fully controls, so a merge in their repository is a release on their schedule. CI builds an immutable image and commits the new tag; Argo CD, running inside the cluster, pulls and applies it, so CI never holds cluster credentials. The ApplicationSet generates a team-by-environment application from a small file, so onboarding the next team is a pull request. An AppProject limits each team to its own repositories and namespaces, and policy engines enforce the rest. Dev and staging auto-sync; production is a promotion pull request with approvals, optionally a canary that aborts on SLO burn. I validate the platform repository in CI, like the validator I ran, which caught two of sixty applications deploying outside their project.
:::

## Follow-up questions

:::answer Push or pull?
Pull for production: the cluster initiates, so no cluster credentials live in CI, drift is corrected continuously, and the cluster can sit behind a firewall. Push is simpler to start, and fine for a small team, but it scales poorly to many clusters and gives CI broad credentials.
:::

:::answer Two teams need to release together. What do you do?
Keep independence as the default. For a coordinated release, use an umbrella application or sync waves, or version compatibility with feature flags so each team can ship independently and enable the feature later. Ask whether the coupling is itself a design problem.
:::

:::answer How do you stop a team from bypassing the process?
They have no cluster write access except via the controller. Kubernetes RBAC denies direct changes in production; break-glass access is time-limited, audited and followed by a pull request to put the change in Git.
:::

:::answer How do you handle shared configuration, such as an ingress domain?
Put it in a shared base (a chart or a Kustomize base) owned by the platform team, versioned; teams pin a version and upgrade deliberately. A change in the base reaches teams through a normal pull request, not a surprise.
:::

## Practice (answers below)

1. Why keep source repositories and deploy repositories separate?
2. What does an AppProject limit?
3. Why is production auto-sync often off?

:::note Answers
1. An application commit should not force a deploy, and a config or rollback change should not rebuild the image; permissions and review rules also differ. 2. The repositories a team may deploy from, the clusters and namespaces it may deploy to, and the cluster-scoped kinds it may create. 3. The merge of a promotion pull request is the controlled, audited release; automatic sync would deploy as soon as anything changed.
:::

:::recap
- **Git = desired state; the cluster pulls.** CI builds, GitOps deploys.
- **Platform repo + one deploy repo per team**; an **ApplicationSet** generates team x environment apps.
- **AppProjects, quotas, policy and RBAC** limit the blast radius; validate in CI.
- Promote the **same artifact**; production is a pull request, not an auto-sync.
- `selfHeal`, alerts on out-of-sync, and break-glass with a follow-up pull request.
:::

```quiz
? What stops one team from deploying into another team's namespace in this design?
+ The AppProject destination rules plus RBAC and policy
- The team promises not to
- The image tag
- Nothing, it is allowed
! Autonomy comes from the team's own repository; safety comes from enforced limits.

? Why generate applications with an ApplicationSet?
+ One template creates team x environment applications, so onboarding is a small pull request
- It makes images smaller
- It replaces Git
- It encrypts secrets
! It avoids hand-writing and drifting 60 separate objects.

? Which belongs in the production promotion step?
+ A reviewed pull request that the controller then syncs
- A developer running kubectl apply
- A rebuild of the image
- Deleting the staging environment
! The merge is the release and leaves an audit trail.
```
