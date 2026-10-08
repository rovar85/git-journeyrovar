---
track: qbank
title: "CI/CD, Jenkins, Git, GitOps and Ansible: Advanced questions (part 2 of 2)"
short: CI/CD advanced 2
sub: 8 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you ensure secure and dynamic secret rotation in Azure DevOps pipelines?

<!-- source: 04 Q52 -->

:::note In simple words
Instead of copying the password into the pipeline (and forgetting to update it), point the pipeline at the safe (Key Vault). When the password in the safe changes, the pipeline automatically uses the new one.
:::

- Store secrets in **Azure Key Vault**, not as plain pipeline variables.
- Link a **Variable Group to Key Vault** or use the `AzureKeyVault@2` task - secrets are fetched at each run, so rotation in Key Vault needs no pipeline change.
- Connect with a **Workload Identity Federation service connection** (OIDC) - no client secret to rotate for the pipeline itself.
- Enable **Key Vault rotation policies** (for keys) or Event Grid `SecretNearExpiry` -> Azure Function to rotate app secrets (e.g. regenerate storage keys, update SQL password).
- Apps read secrets at runtime (Managed Identity, Key Vault references, CSI Secret Store driver on AKS) so they pick up new versions.
- Protect with RBAC, environment approvals and checks, and audit via Key Vault diagnostic logs.

**Example:**
```
variables:
- group: prod-kv-secrets          # variable group linked to Key Vault

steps:
- task: AzureKeyVault@2
  inputs:
    azureSubscription: 'sc-prod-oidc'   # workload identity federation
    KeyVaultName: 'kv-payments-prod'
    SecretsFilter: 'DbPassword,ApiKey'
    RunAsPreJob: true
- script: ./deploy.sh
  env:
    DB_PASSWORD: $(DbPassword)          # masked in logs
```

:::say
I keep secrets in Azure Key Vault and fetch them at runtime via a Key Vault-linked variable group or the AzureKeyVault task, using a workload identity federation service connection so the pipeline itself has no secret. Rotation happens in Key Vault through rotation policies or an Event Grid-triggered function, and because pipelines and apps read the latest version at runtime, no pipeline changes are needed.
:::

## Azure DevOps: How do you secure access to artifacts and feeds (Azure Artifacts)?

<!-- source: 04 Q53 -->

:::note In simple words
A feed is a company warehouse of packages. You decide who can only take things out (Reader), who can put things in (Contributor), and who manages the warehouse (Owner). Outside goods only come in through one checked gate (upstream sources).
:::

- **Feed permissions (least privilege):** Reader (download), Collaborator (download + save packages from upstream), Contributor (publish), Owner (manage feed and permissions). Developers usually get Reader; only CI publishes.
- **Project-scoped vs organization-scoped feeds:** project-scoped feeds inherit the project's visibility and permissions and are the recommended default; org-scoped feeds are visible across the organization, so use them only for truly shared packages.
- **Pipeline identity:** pipelines authenticate as the **Project Build Service** (or Project Collection Build Service) identity - grant it Contributor only on the feeds it publishes to, and Reader elsewhere. Use `NuGetAuthenticate`/`npmAuthenticate` tasks instead of stored tokens. Limit job authorization scope to the current project.
- **Upstream sources:** proxy npmjs, PyPI, NuGet or Maven Central through the feed so every external package is cached and auditable, and not pulled directly by developers; this also reduces dependency-confusion risk because internal package names resolve from your feed first.
- **Views:** `@local`, `@prerelease`, `@release` - promote a package to `@release` only after it passes testing; consumers and prod builds only read the `@release` view.
- **PATs:** if a PAT is needed (e.g. a developer laptop), scope it to Packaging (Read) only with a short expiry; admins can restrict full-scope PATs by policy.
- **Service connections to external systems:** use **workload identity federation** (OIDC) instead of secrets, with pipeline permissions and approvals on the connection.
- **Retention policies:** keep the last N versions per package and delete old ones (packages promoted to views are kept) - controls cost and removes stale vulnerable versions.
- **Audit:** Azure DevOps auditing streamed to Log Analytics.

**Example:**
```
steps:
- task: npmAuthenticate@0              # uses the build service identity, no PAT
  inputs: { workingFile: .npmrc }
- script: npm ci && npm publish

# .npmrc
registry=https://pkgs.dev.azure.com/org/project/_packaging/internal-feed/npm/registry/
always-auth=true

# Consumers of tested packages read only the release view
registry=https://pkgs.dev.azure.com/org/project/_packaging/internal-feed@release/npm/registry/
```

:::say
I use project-scoped feeds with least-privilege roles - developers read, only the pipeline's build service identity can publish - and pipelines authenticate with the npm or NuGet authenticate tasks rather than PATs. External packages come only through upstream sources, tested versions are promoted to the release view that prod builds consume, any PATs are packaging-read-only and short-lived, service connections use workload identity federation, and retention policies and audit logs keep it clean.
:::

## How do you manage deployments and rollbacks for 100+ microservices on EKS/ECS?

<!-- source: 04 Q54 -->

:::note In simple words
With 100 services you cannot hand-deploy each one. You write the desired state of every service in one Git notebook, and a robot (ArgoCD) keeps the cluster matching that notebook - rolling back is just undoing a page in the notebook.
:::

- **Standardize:** one shared pipeline template / Jenkins shared library and one base Helm chart for all services; each service only provides values.
- **GitOps with ArgoCD:** a config repo holds manifests per service per environment. ArgoCD `ApplicationSet` generates Applications for all services automatically. CI only builds images and bumps tags.
- **Independent deploys:** each service deploys on its own; no big-bang releases.
- **Progressive delivery:** Argo Rollouts canary with automated analysis on Prometheus metrics, auto-abort on errors. On ECS: CodeDeploy blue/green with CloudWatch alarm rollback, or ECS deployment circuit breaker.
- **Rollback:** `git revert` the tag bump -> ArgoCD syncs the old version; or `argo rollouts abort/undo`.
- **Visibility:** dashboard of versions per environment, deploy events annotated on Grafana, alerting per service.
- **Guardrails:** sync windows, PodDisruptionBudgets, per-service SLOs.

**Example:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata: { name: prod-services }
spec:
  generators:
  - git:
      repoURL: https://github.com/org/gitops.git
      revision: main
      directories: [ { path: "apps/*/envs/prod" } ]
  template:
    metadata: { name: '{{path[1]}}-prod' }
    spec:
      project: prod
      source: { repoURL: https://github.com/org/gitops.git, targetRevision: main,
                path: '{{path}}' }
      destination: { server: https://kubernetes.default.svc, namespace: '{{path[1]}}' }
      syncPolicy: { automated: { prune: true, selfHeal: true } }

# Rollback one service
git revert <commit-that-bumped-orders-tag> && git push
```

:::say
At that scale I standardize on one pipeline template and one base Helm chart, and use GitOps with ArgoCD ApplicationSets so every service's desired version lives in Git. CI builds and bumps the tag, Argo Rollouts does canary with Prometheus-based automatic abort, and rollback is a git revert that ArgoCD syncs - on ECS the equivalent is CodeDeploy blue/green or the deployment circuit breaker.
:::

## How do you ensure zero-downtime deployments? Share a real example.

<!-- source: 04 Q55 -->

:::note In simple words
Like changing the tyres of a bus while it keeps driving - you only remove an old tyre after the new one is firmly on and holding weight.
:::

Strategy-level ingredients:
- **Deployment strategy:** rolling (with maxUnavailable 0), Blue-Green, or Canary.
- **Health checks:** readiness probes / target group health checks so traffic only goes to ready instances.
- **Graceful shutdown:** connection draining (deregistration delay, `preStop` sleep, handle SIGTERM).
- **Enough capacity:** min replicas >= 2, PodDisruptionBudget, surge capacity.
- **Backward-compatible changes:** API versioning and expand/contract DB migrations, so old and new versions can run side by side.
- **Automated verification and rollback:** smoke tests, metrics-based canary analysis, `helm --atomic`.

Real example (sample - adapt to your project): an API on EKS behind an ALB. We set `maxUnavailable: 0, maxSurge: 25%`, readiness probe on `/health`, `preStop` sleep 15s, and ALB deregistration delay 30s. A DB column rename was done in 3 releases (add new column, dual-write, drop old). The pipeline ran `helm upgrade --atomic`; one release failed readiness and Helm rolled back automatically with zero user errors.

**Example:**
```
strategy:
  type: RollingUpdate
  rollingUpdate: { maxUnavailable: 0, maxSurge: 25% }
...
lifecycle:
  preStop:
    exec: { command: ["sh", "-c", "sleep 15"] }
readinessProbe:
  httpGet: { path: /health, port: 8080 }

helm upgrade --install api charts/api --set image.tag=$TAG --atomic --wait --timeout 10m
```

:::say
Zero downtime needs a rolling, blue-green or canary strategy, readiness checks so only healthy instances get traffic, graceful connection draining, enough replicas, and backward-compatible database changes. In practice we deploy with maxUnavailable zero, readiness probes, a preStop delay and helm atomic, so a bad release fails its checks and rolls back automatically without users noticing.
:::

## How would you optimize a slow CI/CD pipeline (e.g. 40 minutes for a small change)?

<!-- source: 04 Q56 -->

*Also asked as:* How would you optimize a CI/CD pipeline? Pipeline optimization for 70%+ faster deployments. How does caching work in pipelines? / CI builds 40 Docker images and takes 18 minutes. How do you optimize it?

:::note In simple words
If a car wash takes 40 minutes, time each station first. Then stop re-washing clean parts (caching), run stations side by side (parallel), and skip stations that do not apply to this car (change detection).
:::

Step-by-step:
1. **Measure first:** stage timing view / Blue Ocean / GitHub Actions timing - find the top 2-3 slow stages.
2. **Cache:** dependency caches (`~/.m2`, `node_modules`, pip), Docker layer cache (BuildKit `--cache-from`, registry cache), Terraform plugin cache.
3. **Parallelize:** unit tests, lint, scans in `parallel`; split test suites across agents (test sharding).
4. **Build only what changed:** in monorepos run only affected services (path filters, `git diff`).
5. **Optimize Dockerfile:** copy dependency files first, multi-stage, slim base images, `.dockerignore`.
6. **Right test at right stage:** fast unit tests on PR; heavy e2e/perf tests nightly or only before prod.
7. **Faster agents:** warm pools of agents, bigger instances for build stage, avoid queue waiting; ephemeral pods with pre-pulled images.
8. **Remove waste:** redundant checkouts (shallow clone `depth 1`), duplicate builds, unnecessary sleeps; fail fast.

How pipeline caching works:
- A cache is saved under a **key**, usually built from the OS plus a hash of the lock file (`package-lock.json`, `pom.xml`, `requirements.txt`). Same lock file -> same key.
- **Cache hit:** the key matches exactly, the folder is restored and the download/install step is skipped or near-instant.
- **Cache miss:** no match, so the step runs fully and the cache is saved at the end for next time.
- **Restore keys** are fallback prefixes (e.g. `npm | Linux`): on a miss, the most recent partially matching cache is restored, so only the changed dependencies download.
- Tools: GitHub `actions/cache` (or `setup-node` with `cache: npm`), Azure DevOps **`Cache@2`** task, Jenkins with a persistent volume or a cache plugin, GitLab `cache:key:files`.
- **Docker layer cache:** each Dockerfile instruction is a layer; if the instruction and its inputs did not change, the layer is reused. On ephemeral agents, store it in a registry (`--cache-from/--cache-to type=registry`) or `type=gha`.
- Never cache build outputs that should be fresh, and never cache secrets.
9. **Deploy faster:** only changed services, proper readiness probe tuning instead of fixed waits.

Typical result: 40 min -> ~10-12 min (70%+ faster).

**Example:**
```
# GitHub Actions dependency cache
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: npm-${{ runner.os }}-

# Azure DevOps Cache@2
- task: Cache@2
  inputs:
    key: 'npm | "$(Agent.OS)" | package-lock.json'
    restoreKeys: 'npm | "$(Agent.OS)"'
    path: $(npm_config_cache)

# Docker layer cache via registry
docker buildx build --cache-from type=registry,ref=$ECR/app:cache \
  --cache-to type=registry,ref=$ECR/app:cache,mode=max -t $ECR/app:$TAG --push .

stage('Checks') {
  parallel {
    stage('Unit')  { steps { sh 'mvn -B -o test' } }
    stage('Lint')  { steps { sh 'npm run lint' } }
    stage('Scan')  { steps { sh 'trivy fs --exit-code 1 .' } }
  }
}
checkout([$class: 'GitSCM', extensions: [[$class: 'CloneOption', shallow: true, depth: 1]]])
```

**When one pipeline builds many images (for example 40 images in 18 minutes):**

1. **Build only what changed:** path filters per service (`dorny/paths-filter`, Jenkins `changeset`, or a script diffing `git diff --name-only origin/main...HEAD`). Usually only 2-3 of the 40 images need rebuilding.
2. **Parallelize:** a matrix job (GitHub Actions `strategy.matrix`, Jenkins `parallel`), one image per runner, instead of 40 sequential builds.
3. **Remote layer cache:** BuildKit with `--cache-from/--cache-to type=registry` (or `type=gha`), so a fresh runner reuses layers from the last build.
4. **Cache mounts** for package managers: `RUN --mount=type=cache,target=/root/.npm npm ci`.
5. **Shared base image** with the heavy OS and dependencies, built once a week, so service images only add their own code.
6. **Order Dockerfile layers** so dependency files are copied before source code, and use a good `.dockerignore`.
7. Bigger or ARM runners, and avoid `--no-cache` in CI.

```bash
docker buildx build   --cache-from type=registry,ref=$REG/meter-api:buildcache   --cache-to   type=registry,ref=$REG/meter-api:buildcache,mode=max   -t $REG/meter-api:$GIT_SHA --push services/meter-api
```

:::say
I start by measuring stage durations to find the bottleneck, then add dependency and Docker layer caching, run tests and scans in parallel, build only changed services, optimize the Dockerfile, and move heavy e2e tests to later stages or nightly runs. Using warm agents and shallow clones as well, this typically cuts a 40-minute pipeline to around 10 minutes, 70 percent or more faster.
:::

## How do you implement environment-specific CI/CD pipelines for 10+ microservices, and how do you scale and manage them?

<!-- source: 04 Q59 -->

:::note In simple words
Do not write 10 services x 3 environments = 30 separate recipes. Write one master recipe with blanks to fill in ("which service?", "which environment?"), and keep each environment's settings on its own small card.
:::

This question is about pipeline design; the deploy/rollback mechanics at 100+ service scale are covered in Q54.

1. **One pipeline definition, many services (templating):** Jenkins **shared library** step like `microservicePipeline(app: 'orders')` so each repo Jenkinsfile is 2-3 lines; GitHub Actions **reusable workflows** (`workflow_call`) in a central repo; GitLab `include:` of central templates. Change the template once -> all services get the fix. Version the template (tags) so teams upgrade safely.
2. **Environments are parameters, not copies:** the same pipeline takes `ENV=dev|staging|prod`; differences live in config (Helm values per env, Kustomize overlays, per-env secrets from Secrets Manager/Key Vault), never in separate pipeline code.
3. **Build once, promote:** CI builds and scans the image once; CD promotes the same tag through environments.
4. **GitOps for deployment:** an ArgoCD **ApplicationSet** generates one Application per service per environment from the config repo layout; per-env overlays hold replica counts, resources and URLs.
5. **Promotion = PR or tag bump:** automatic to dev on merge, PR to staging/prod folders with required reviewers, or an automated image-tag bump (Argo CD Image Updater, a pipeline step).
6. **Guardrails per environment:** GitHub **environment protection rules** (required reviewers, wait timers, branch restrictions), environment-scoped secrets, separate AWS accounts/roles per env, prod sync windows.
7. **Scale the runners:** ephemeral agents (Kubernetes pod agents, ARC runners), path filters so only changed services build.

**Example:**
```
# Central repo: .github/workflows/service-pipeline.yml (reusable)
on:
  workflow_call:
    inputs:
      service:     { type: string, required: true }
      environment: { type: string, required: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}      # protection rules apply per env
    steps:
      - uses: actions/checkout@v4
      - run: |
          helm upgrade --install ${{ inputs.service }} charts/service \
            -f envs/${{ inputs.environment }}/values.yaml --atomic

# Each service repo: a few lines
jobs:
  prod:
    uses: org/ci-templates/.github/workflows/service-pipeline.yml@v3
    with: { service: orders, environment: prod }
    secrets: inherit

# GitOps layout
apps/orders/base/   apps/orders/overlays/dev/   apps/orders/overlays/prod/
```

:::say
I keep one templated pipeline - a Jenkins shared library or a GitHub reusable workflow - that every service calls with its name and target environment, so environments are parameters and their differences live in per-env Helm values or Kustomize overlays and secrets. CI builds the image once, and deployment is GitOps with ArgoCD ApplicationSets, where promotion is a PR or image-tag bump. Environment protection rules, per-env accounts and ephemeral runners keep it safe and scalable.
:::

## How would you design a GitOps pipeline for a microservices application? Which tools, what flow, and how do you roll back?

<!-- source: 04 Q60 -->

*Also asked as:* How does Argo CD work in CI/CD, and why use it? / How do you design GitOps for multiple teams with independent releases?

:::note In simple words
Git becomes the single "master plan" of what should run in the cluster. Nobody touches the cluster directly - you change the plan through a reviewed PR, and a robot inside the cluster (Argo CD) keeps making reality match the plan. To undo, you undo the plan.
:::

For deploying and rolling back 100+ services at scale see Q54; this answer focuses on the GitOps design itself.

How Argo CD works and why use it: Argo CD is a Kubernetes controller that watches Git repos. For each Application it renders the manifests (Helm, Kustomize or plain YAML), compares them with the live cluster, and marks the app Synced/OutOfSync and Healthy/Degraded. With auto-sync it applies changes itself. In CI/CD it takes over the CD half: CI only builds and pushes the image and updates Git; Argo CD deploys. Why: no cluster credentials in CI (pull model), Git is the audit trail, drift is visible and self-healed, rollback is a revert, and one UI shows every app across clusters.

Flow:
1. **App repo CI:** build, test, scan, then push the image with an **immutable tag or digest** (`1.4.0-a1b2c3d`, `@sha256:...`).
2. **Config repo update:** a CI bot opens a PR (or Argo CD Image Updater commits) that bumps the tag in the Helm values or Kustomize overlay for that environment. Dev can auto-merge; staging and prod need reviewers.
3. **Sync:** Argo CD (or Flux) running in the cluster detects the commit and applies it. **ApplicationSets** generate Applications for many services/envs; **sync waves** order things (CRDs and config first, then apps); **health checks** decide if the sync is Healthy.
4. **Progressive delivery:** Argo Rollouts canary/blue-green with analysis on Prometheus metrics, auto-abort on bad metrics.
5. **Rollback:** `git revert` the config commit - Git is the source of truth. Argo CD's "rollback to previous sync" works only if auto-sync is disabled; with auto-sync on, Argo re-applies whatever Git says, so revert in Git.

Also design in:
- **Drift self-heal:** `selfHeal: true` undoes manual `kubectl edit` changes; `prune: true` removes deleted resources.
- **Security:** Argo CD **SSO + RBAC** (AppProjects restrict which repos/namespaces/clusters a team can deploy to); CI never needs cluster credentials (pull model).
- **Secrets:** never plain secrets in Git - use **External Secrets Operator** (pulls from AWS Secrets Manager/Vault) or **SOPS**/Sealed Secrets (encrypted in Git).
- **Notifications:** Argo CD Notifications to Teams/Slack on sync failure or degraded health.

```
 Dev push -> [App repo CI: build/test/scan] -> push image (immutable tag) -> ECR
                                  |
                                  v
                 PR: bump tag in [Config repo: envs/dev|staging|prod]
                                  |  (review + merge)
                                  v
             [Argo CD in cluster] --pull + sync--> Kubernetes
                                  |                    |
                    self-heal drift            Argo Rollouts canary
                                  |                    |
                 rollback = git revert <---- analysis fails -> auto abort
```

**Example:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: orders-prod
  namespace: argocd
spec:
  project: payments-team
  source:
    repoURL: https://github.com/org/gitops-config.git
    targetRevision: main
    path: apps/orders/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: orders
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions: [CreateNamespace=true]
    retry: { limit: 3, backoff: { duration: 10s, factor: 2 } }

# Rollback
git revert 3f2a1bc && git push     # Argo CD syncs the previous version
```

**GitOps for many teams with independent releases:**

- **App-of-Apps:** one root Argo CD Application points to a folder of child Application manifests, so adding a service means adding one file.
- **ApplicationSets:** generate Applications automatically. A git directory generator creates one app per folder `teams/*/services/*`; a cluster generator deploys the same app to every cluster.
- **AppProject per team:** restricts which repos a team can deploy from, which namespaces or clusters it can deploy to, and which resource kinds are allowed, with RBAC mapped to SSO groups. One team cannot touch another team's namespace.
- **Repo layout:** a platform or infra repo owned by the platform team (ingress, cert-manager, monitoring), plus per-team config repos or folders. Each team merges and releases on its own schedule.
- **Guardrails:** sync windows (no prod syncs during business-critical hours), required PR reviews on prod folders, and progressive delivery with Argo Rollouts.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata: { name: team-services, namespace: argocd }
spec:
  generators:
    - git:
        repoURL: https://github.com/my-org/deploy-config.git
        revision: main
        directories: [{ path: "teams/*/services/*" }]
  template:
    metadata: { name: "{{path[1]}}-{{path.basename}}" }
    spec:
      project: "{{path[1]}}"              # AppProject per team
      source:
        repoURL: https://github.com/my-org/deploy-config.git
        targetRevision: main
        path: "{{path}}"
      destination: { server: https://kubernetes.default.svc, namespace: "{{path[1]}}" }
      syncPolicy: { automated: { prune: true, selfHeal: true } }
```

:::say
The app repo CI builds, tests and scans, then pushes an image with an immutable tag, and a bot or Argo CD Image Updater bumps that tag in the config repo per environment through a PR. Argo CD in the cluster pulls and syncs using ApplicationSets, sync waves and health checks, with Argo Rollouts for canary analysis. Rollback is a git revert because Git is the source of truth, and the design includes self-heal for drift, SSO and RBAC through AppProjects, and secrets through External Secrets or SOPS rather than plain secrets in Git.
:::

## How do you handle databases in blue-green deployments? With critical data, how do you keep the database consistent and avoid issues during switchover?

<!-- source: 04 Q61 -->

:::note In simple words
Blue and green are two kitchens, but they usually share ONE fridge (the database). So any change to the fridge must work for both kitchens at the same time - you add a new shelf before anyone uses it, and only remove the old shelf when nobody needs it anymore.
:::

What to do when a migration step fails mid-deploy is covered in Q75; this answer is about designing the database side of blue-green.

Core idea: **blue and green normally share one database.** Only the application layer is duplicated, so the schema must support both versions during the switch and during a rollback.

1. **Backward-compatible schema changes with expand -> migrate -> contract**, spread across releases:
   - Release 1 (expand): add the new column/table, nullable or with a default; old code ignores it.
   - Release 2 (migrate): new code writes both old and new, backfill existing rows in batches, then read from new.
   - Release 3 (contract): once no running version uses the old column, drop it.
2. **Never make destructive changes (drop/rename column, change type) in the same release** as the code that needs them - blue would break the moment the migration runs, and rollback would be impossible.
3. **Feature flags:** ship the code dark, turn the new behaviour on after the switch, and turn it off instead of rolling back.
4. **Avoid conflicting dual writers:** blue and green must not write the same data in incompatible formats (e.g. green writes JSON v2 that blue cannot parse). Keep formats versioned and readable by both.
5. **Switchover hygiene:** drain connections, let long-running transactions and background jobs finish, and make sure only one colour runs schedulers/queue consumers that must not run twice.
6. **Rollback implication:** data written by green must still be readable by blue. If it is not, switching back is not a real rollback.
7. **If you must use separate databases:** keep them in sync with replication/CDC (AWS DMS, PostgreSQL logical replication), plan a short **write freeze**, verify replication lag = 0 and row counts/checksums, then cut over; decide in advance how to handle writes if you roll back (reverse replication).
8. **RDS Blue/Green Deployments** for engine upgrades or parameter changes: AWS creates a green copy kept in sync by replication and performs a managed switchover (typically about a minute), renaming endpoints so apps do not change connection strings.

**Example:**
```
-- Release 1: expand (safe for blue and green)
ALTER TABLE customers ADD COLUMN email_normalized VARCHAR(255);

-- Release 2: backfill in batches while code dual-writes
UPDATE customers SET email_normalized = lower(email)
WHERE email_normalized IS NULL AND id BETWEEN 1 AND 10000;

-- Release 3: contract (only after blue with old code is gone)
ALTER TABLE customers DROP COLUMN email_old;

# RDS managed blue/green for an engine upgrade
aws rds create-blue-green-deployment --blue-green-deployment-name pg16-upgrade \
  --source arn:aws:rds:ap-south-1:123456789012:db:orders-db --target-engine-version 16.4
aws rds switchover-blue-green-deployment \
  --blue-green-deployment-identifier bgd-abc123 --switchover-timeout 300
```

:::say
In blue-green both colours usually share one database, so every schema change must be backward compatible - I use expand, migrate, contract across separate releases and never drop or rename columns in the same release as the code that needs it. I use feature flags, avoid incompatible dual writes, drain connections and long transactions on switchover, and make sure data written by green is readable by blue so rollback stays safe. If separate databases are unavoidable I use replication or CDC like DMS with a write freeze and lag check at cutover, and for engine upgrades I use RDS Blue/Green Deployments with managed switchover.
:::
