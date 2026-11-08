---
track: seniorqa
title: "Q7: A rollback strategy that works even when the deployment stage fails"
short: Q7 Rollback
sub: Why rollbacks fail (schema, broken pipeline, missing artifact), expand/contract migrations, out-of-band rollback, feature flags and GitOps revert, with a compatibility matrix you can run.
---

:::goals
- explain why a naive rollback fails (schema changes, a pipeline that is itself broken, deleted artifacts)
- use expand and contract migrations so code and schema are compatible in both directions
- design a rollback that does not depend on the pipeline that just failed
- choose between redeploy, traffic switch, feature flag and Git revert
:::

:::note How this connects
Rolling updates and rollbacks are in [Kubernetes 3](#kubernetes-3) and [CI/CD in the question bank](#qbank-23). The database migration steps echo [Q4](#seniorqa-4).
:::

## A rollback strategy that works even if the deployment stage fails

**What the interviewer tests:** the phrase "even if the deployment stage fails" is the trap. If your rollback is "re-run the pipeline with the old version", it fails exactly when you need it. They want a rollback **path that is independent** of the failed path, and an understanding of **data** (the thing you cannot roll back).

### Clarifying questions

- Is the release code only, or code plus a database or config change?
- How is it deployed today: Helm, plain manifests, GitOps, VMs?
- What is the user-visible cost of a minute of a bad release? That sets how fast the rollback must be.
- Is there a progressive-delivery tool (canary) in place?

### Why rollbacks fail

1. **Schema changes.** The new release renamed a column; the old code cannot run against the new schema. "Roll back" now means a restore, with data loss.
2. **The deploy stage is the broken part.** The pipeline crashed after updating 3 of 10 pods; or CI is down; or the registry or a credential expired. Re-running it is unsafe or impossible.
3. **The artifact is gone.** A cleanup job deleted the previous image tag.
4. **Config and code deployed separately** and now do not match.
5. **State outside the release:** messages already published in a new format, caches holding new objects, a feature flag already on.
6. **Nobody has practised it.** The rollback command was never run before the incident.

### Make code and schema compatible in both directions

The compatibility matrix below is the heart of the answer. A one-step rename breaks the rollback; the **expand and contract** pattern spreads the same change over three releases so every neighbouring pair of versions works.

```run
mkdir -p ~/lab/seniorqa/q7 && cd ~/lab/seniorqa/q7
cat > rollback.py <<'EOF'
# Why a rollback can fail: code and database schema must be compatible in BOTH directions during a release.
print("Compatibility of code version x schema version (T = works, F = breaks)\n")
print("A) one-step migration: v2 RENAMES column name -> full_name in the same release")
combos = [("v1 code", "old schema", True), ("v1 code", "new schema", False), ("v2 code", "old schema", False), ("v2 code", "new schema", True)]
for c, s, ok in combos: print(f"   {c} on {s:10}: {'T' if ok else 'F'}")
print("   Rollback = v1 code on the NEW schema = F. The rollback you planned does not work.\n")
print("B) expand / contract (three releases, every pair of neighbours is compatible)")
steps = [("release 1 EXPAND", "add column full_name, keep name; v1 keeps writing name", "v1 and v2 both fine"),
         ("release 2 MIGRATE", "v2 writes BOTH columns, reads full_name; backfill old rows", "rollback to release 1 is safe"),
         ("release 3 CONTRACT", "after a soak period, drop column name", "rollback now needs a restore: do it only when sure")]
for n, what, note in steps: print(f"   {n:20} {what:62} -> {note}")
print("\nC) rollback decision when the DEPLOY STAGE ITSELF fails (the pipeline is broken or half-applied)")
cases = [("pipeline crashed after updating 3 of 10 pods", "re-run the same pipeline is risky; roll back OUT OF BAND: `helm rollback` / `kubectl rollout undo` / revert the Git commit and let the GitOps agent converge"),
         ("CI system is down", "the rollback must not depend on CI: a documented command or button using credentials the on-call already has; GitOps pull works without CI"),
         ("new image cannot be pulled", "keep the previous N image tags in the registry (never delete the last good); the old ReplicaSet is still there, scale it back"),
         ("feature is bad but deployment is healthy", "turn the feature flag off: no deploy needed, seconds not minutes"),
         ("bad config change", "config is versioned too: revert the config commit; restart only the pods that read it at start-up")]
for sit, act in cases: print(f"   - {sit}\n       {act}")
print("\nRules: artifacts are immutable and versioned; the previous version is always deployable; schema changes are backward compatible; rollback is rehearsed in staging.")
EOF
python3 rollback.py
```

What the output shows:

- A one-release rename leaves a hole: **v1 code on the new schema is F**, so the rollback you planned does not work.
- Expand and contract: release 1 **adds** the new column and keeps the old one; release 2 makes v2 write **both** and read the new one, with a backfill; release 3 **drops** the old column only after a soak period. A rollback is safe through release 2; after release 3 it needs a restore, so do release 3 only when sure.
- The table of failure cases shows that each has a rollback **path that does not use the failed deploy stage**.

### Design the rollback as an independent path

- **Keep the previous version deployable and runnable.** Immutable, versioned artifacts; retention policy keeps the last N good versions; the old ReplicaSet or Helm revision still exists.
- **A rollback command that does not need the pipeline:** `helm rollback`, `kubectl rollout undo`, or in GitOps, `git revert` and let the controller converge. The on-call has the permission and the instructions; credentials do not live only in CI.
- **Traffic switch instead of redeploy** (blue/green): the old environment is still running; flip the router back. Seconds.
- **Canary with automatic abort** (Argo Rollouts, Flagger): the bad version only ever saw 5% of traffic, and the tool reverts on SLO burn without a human.
- **Feature flags:** separate *deploy* from *release*. Ship the code dark, turn it on gradually; to roll back, turn it off. No deploy needed.
- **Database:** expand/contract; take a backup/snapshot before risky migrations; use online schema-change tools; never combine a destructive migration with a code release.
- **Config:** versioned in Git; revert the config commit.
- **Detection:** the rollback is only fast if you notice fast. Post-deploy health checks, an SLO-burn alert tied to the deploy marker, and a defined "rollback if error rate exceeds X for Y minutes" rule.

```term
# Example (not run here): rollback commands that do not need the pipeline
kubectl rollout undo deployment/web                 # previous ReplicaSet
kubectl rollout status deployment/web
helm history shop && helm rollback shop 41          # to a known-good revision
git revert <bad-commit> && git push                 # GitOps: the controller converges to the old state
# traffic switch (blue/green):  point the Service/Ingress selector back at "blue"
# feature flag:                 set checkout_v2=false in the flag service
```

### The decision at 3 a.m.

1. **Stop the harm first** (rollback or flag off), investigate second.
2. Choose the fastest safe path: flag off, then traffic switch, then rollout undo, then Git revert, then restore from backup as the last resort.
3. **Verify** health, error rate and latency after the rollback.
4. **Freeze** further deploys until the cause is understood. Write the post-incident review.

:::say
My rule is that the rollback must not depend on the thing that failed. So I keep immutable, versioned artifacts and retain the last known-good ones; I give the on-call a documented command such as helm rollback or a Git revert that a GitOps controller applies, so it works even when the pipeline is broken. For risk, I use canary or blue/green so the old version is still running, and feature flags so I can turn a feature off in seconds without a deploy. The usual real blocker is the database, so I use expand and contract: add the new column, write both, backfill, and drop the old column only after a soak period, so code and schema are compatible in both directions. I rehearse the rollback in staging and set an automatic rollback rule on error rate.
:::

## Follow-up questions

:::answer What if the migration already dropped data?
Then a code rollback does not help. Restore from the pre-migration backup or point-in-time recovery into a new instance, replay or reconcile the writes since, and accept a longer recovery. This is why destructive steps are separated from the release and gated by a soak period.
:::

:::answer Rollback or roll forward?
Roll back when the previous version is known good and the rollback is fast and safe. Roll forward (a quick fix) when the schema or data change makes rollback riskier than a fix. Decide using time to recover and risk; do not cling to either.
:::

:::answer How do you test a rollback?
In staging, deploy the new version, then roll back, and run the same checks; also run it in production on a low-risk service on a schedule. Include the database: apply the expand migration, run v1 against it, and so on.
:::

:::answer What about a deployment that is half-applied?
Do not re-run the pipeline blindly. Look at the actual state (`kubectl rollout status`, `helm status`), then either complete it deliberately or roll back to the last good revision; in GitOps, the controller converges to what Git says, so fix Git.
:::

## Practice (answers below)

1. Why does a rename in one release break the rollback?
2. Name three rollback paths that do not use the CI/CD pipeline.
3. When is the contract (drop column) step safe?

:::note Answers
1. The old code expects the old column name; after the schema changed it no longer exists, so the old version fails against the new schema. 2. `kubectl rollout undo` or `helm rollback`, a traffic switch back to the old environment, and a feature flag off (also a Git revert applied by a GitOps controller). 3. After the new version has run through a soak period with no rollback needed, and with a backup taken, since after it the old code cannot run.
:::

:::recap
- A rollback that needs the failed pipeline is not a rollback; make the path **independent**.
- Keep **immutable, retained artifacts**; practise the command.
- **Expand / migrate / contract** keeps code and schema compatible both ways.
- Prefer **flags, traffic switch and canary abort** for speed; Git revert for GitOps.
- Stop the harm first, then investigate; **freeze** deploys.
:::

```quiz
? Which rollback does not depend on the deployment pipeline?
+ A feature flag turned off, or a traffic switch back to the old environment
- Re-running the same pipeline with the old version
- Waiting for CI to recover
- Rebuilding the image from scratch
! The path must work when the pipeline itself is broken.

? In expand and contract, when is the old column dropped?
+ In a later release, after a soak period, once rollback is no longer needed
- In the same release as the rename
- Before the new code is deployed
- Never
! Until then both old and new code work against the schema.

? What usually makes a rollback impossible?
+ A database change that the old code cannot run against, or a deleted previous artifact
- A short release note
- A green build
- Using Kubernetes
! Data and retention are the common blockers.
```
