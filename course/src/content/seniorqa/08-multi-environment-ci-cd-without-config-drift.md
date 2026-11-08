---
track: seniorqa
title: "Q8: Multi-environment CI/CD that prevents configuration drift"
short: Q8 Config drift
sub: One artifact promoted through environments, config rendered from Git with small declared overlays, drift detection and self-heal, with a drift checker you can run.
---

:::goals
- define configuration drift and explain why it makes staging tests meaningless
- design the pipeline so the same artifact is promoted, and config comes from Git overlays
- detect drift (GitOps diff, `terraform plan`, `helm diff`) and correct it
- allow break-glass changes without losing control
:::

:::note How this connects
Terraform state and drift are in [Terraform 4](#terraform-4) and the scenarios track; GitOps is in [Q5](#seniorqa-5).
:::

## Multi-environment CI/CD that prevents configuration drift

**What the interviewer tests:** do you understand that drift comes from **manual changes** and **environments built separately**, and that the cure is **one source of truth, one artifact, automation that reconciles, and visibility**.

### Clarifying questions

- How many environments (dev, test, staging, prod, per-region)? Are they in one cluster or several?
- What is managed as code today: infrastructure (Terraform), cluster config (Helm, Kustomize), application config, secrets?
- Who has write access to production, and why do people edit it by hand?
- What does an outage from drift look like here? ("It worked in staging.")

### What drift is, and why it hurts

**Drift** is any difference between what the code says and what is running, or between environments that should be alike. It comes from: a hand edit during an incident, a console click, a script run once, an environment created from a copy of an old template, or a dependency that updated itself. It hurts because a test passing in staging stops predicting production.

### The design

1. **Build once, promote the same artifact.** The image (by digest) built from a commit is deployed to dev, then staging, then prod. Never rebuild per environment; never bake environment config into the image.
2. **Environment config lives in Git as a small overlay on a common base.** Base values are shared; each environment states only its **declared differences** (replica count, log level, pool size, hostnames). Review in pull requests.
3. **Infrastructure by code, with modules.** The same Terraform module for every environment with different variable files; remote state per environment; no console changes.
4. **A reconciling controller** (Argo CD, Flux) continuously compares live state with Git, **alerts** on differences and, where allowed, **reverts** them (`selfHeal`).
5. **Scheduled drift detection** for what the controller does not watch: nightly `terraform plan -detailed-exitcode` (exit code 2 means changes), cloud config scanners, `helm diff`.
6. **Policy as code** to prevent forbidden config (no `latest` tag, required limits).
7. **Secrets** from a secret manager, referenced by name in every environment, never copied.
8. **Break-glass:** a time-limited, audited way to change production in an emergency, followed by a pull request that records the change in Git, otherwise the self-heal or the next deploy will silently undo it (or worse, it stays as drift).
9. **Ephemeral environments** created from the same code for each pull request, destroyed after: if you can rebuild an environment on demand, drift cannot accumulate.

### A drift checker you can run

The model renders each environment from the base plus its overlay, compares with the "live" state, and also lists which differences between environments are **declared** (intended) and which are not.

```run
mkdir -p ~/lab/seniorqa/q8 && cd ~/lab/seniorqa/q8
cat > drift.py <<'EOF'
# Config drift: render every environment from ONE base plus small overlays, then detect any difference that is not declared.
BASE = {"image": "shop:1.8.2", "replicas": 2, "log_level": "info", "feature_new_checkout": False, "db_pool": 10, "timeout_ms": 2000}
OVERLAYS = {                       # what each environment is ALLOWED to change (reviewed in Git)
  "dev":     {"replicas": 1, "log_level": "debug"},
  "staging": {"replicas": 2},
  "prod":    {"replicas": 6, "db_pool": 40},
}
def render(env): d = dict(BASE); d.update(OVERLAYS[env]); return d

LIVE = {env: render(env) for env in OVERLAYS}          # what is actually running
LIVE["prod"]["timeout_ms"] = 5000                      # someone edited prod by hand during an incident
LIVE["staging"]["image"] = "shop:1.8.3"                # staging got a newer image outside the pipeline

print("Desired state is rendered from Git; live state is read from the cluster. Diff them:\n")
for env in OVERLAYS:
    want, have = render(env), LIVE[env]
    diff = {k: (want[k], have[k]) for k in want if want[k] != have[k]}
    print(f"{env:8} {'IN SYNC' if not diff else 'DRIFT'}", *(f"\n   {k}: git={a!r} live={b!r}" for k, (a, b) in diff.items()))

print("\nWhich differences between environments are INTENDED (declared overlays)?")
for k in BASE:
    vals = {env: render(env)[k] for env in OVERLAYS}
    if len(set(map(str, vals.values()))) > 1: print(f"   {k:10} differs by design: {vals}")
print("\nEverything else must be identical across environments. 'Works in staging' only means something if staging is the same as prod.")
print("Controls: (1) one artifact promoted dev->staging->prod, never rebuilt  (2) config in Git, rendered per environment  (3) GitOps controller reverts manual edits (selfHeal)")
print("          (4) break-glass edits are allowed but alert and must be back-ported to Git  (5) scheduled `terraform plan` / `helm diff` reports drift")
EOF
python3 drift.py
```

What the output shows:

- `dev` is in sync. `staging` has an image `1.8.3` while Git says `1.8.2` (someone deployed outside the pipeline). `prod` has a timeout of 5000 where Git says 2000 (a hand edit during an incident).
- The "differs by design" list is short and explicit: replicas, log level and database pool size. Everything else must be identical across environments. A difference that is not on that list is a defect.

### Detection commands (example, not run here)

```term
# Terraform: exit code 2 = changes exist (drift or pending change); run on a schedule in CI
terraform plan -detailed-exitcode -refresh-only

# Helm: what would change relative to what is running?
helm diff upgrade shop ./chart -f values-prod.yaml

# Argo CD: applications that are not in sync
argocd app list --output wide | grep -v Synced

# Argo CD auto-correction
syncPolicy:
  automated: {prune: true, selfHeal: true}
```

### Trade-offs

- **Strict self-heal** can fight a person fixing an incident. Mitigate with a break-glass flow (pause sync for one app, time-boxed, with an alert if left paused).
- **Too many overlays** recreate drift in disguise. Keep the declared differences minimal and review them.
- **Per-environment pipelines** diverge. Use one pipeline definition with parameters.
- **Cost of production-like staging:** make it smaller but the same *shape*; same versions, same configuration keys.

:::say
Drift comes from manual changes and from environments built separately, so I remove both causes. I build the artifact once and promote the same image digest from dev to staging to prod. Configuration lives in Git as a shared base with a small overlay per environment, so the only differences between environments are ones someone reviewed; infrastructure is the same Terraform module with different variables, and nobody clicks in a console. A GitOps controller compares live state with Git, alerts on differences and reverts them, and a nightly terraform plan with detailed exit code catches what the controller does not see. For emergencies there is an audited break-glass path that must end in a pull request. The drift checker I ran flagged an image changed outside the pipeline and a timeout edited by hand, and showed the three differences between environments that were declared on purpose.
:::

## Follow-up questions

:::answer Someone changed production during an incident. What now?
Treat it as a real fix to be recorded: open a pull request that puts the change in Git, review it, merge it. If it was a bad hack, revert it deliberately. Never leave it as an unrecorded difference.
:::

:::answer Should self-heal be on in production?
Often yes for configuration, with care. It guarantees Git is the truth. For risky or stateful resources use alert-only plus a deliberate sync. Decide per application, and document the exceptions.
:::

:::answer How do you handle environment-specific secrets and endpoints?
Reference them by the same key in every environment (for example `db/password`) resolved by the secret manager per environment, so the manifests are identical and only the secret values differ.
:::

:::answer How do you keep staging representative of production?
Same versions, same configuration keys and topology, production-shaped (maybe sampled or anonymised) data, similar limits; accept smaller scale and cover scale separately with load tests.
:::

## Practice (answers below)

1. What is the difference between a declared difference and drift?
2. Why must the artifact be promoted instead of rebuilt per environment?
3. Which command detects Terraform drift in CI?

:::note Answers
1. A declared difference is in the reviewed overlay in Git (for example more replicas in prod); drift is any other difference between Git and live, or between environments. 2. A rebuild may produce a different binary (new dependency versions), so what you tested is not what you ship. 3. `terraform plan -detailed-exitcode` (optionally `-refresh-only`); exit code 2 means differences.
:::

:::recap
- Drift = live state differs from Git, or environments differ without a reason.
- **Build once, promote the digest; config in Git as base + small overlays.**
- A **reconciler** (GitOps, scheduled plan) detects and corrects drift.
- **Break-glass** is allowed but must be audited and end in a pull request.
- Ephemeral environments make drift hard to accumulate.
:::

```quiz
? What is the best protection against "it worked in staging"?
+ Promote the same artifact and keep environments identical except for reviewed overlays
- Test only in production
- Rebuild the image per environment
- Give everyone console access
! Staging is only a predictor if it matches production.

? What does selfHeal do in Argo CD?
+ Reverts live changes that differ from Git
- Deletes Git history
- Rotates secrets
- Scales nodes
! It reconciles toward the desired state in Git.

? An exit code of 2 from terraform plan -detailed-exitcode means:
+ The plan contains changes (drift or a pending change)
- The command failed with an error
- No changes
- The state is locked
! 0 is no changes, 1 is an error, 2 is changes present.
```
