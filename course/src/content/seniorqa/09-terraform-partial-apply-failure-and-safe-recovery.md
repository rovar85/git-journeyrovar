---
track: seniorqa
title: "Q10: Terraform creates some resources and then fails: recover safely"
short: Q10 Partial apply
sub: What state holds after a half-failed apply, why Terraform has no rollback, and the recovery steps for import, taint, locks, drift and lost state.
---

:::goals
- explain what is in the state after a partial apply and why there is no automatic rollback
- recover by fixing the cause and re-applying, and know when not to touch the state
- handle the hard cases: resource created but not recorded, tainted, stuck lock, lost or damaged state
- name the preventions: remote backend with locking and versioning, small stacks, saved plans
:::

:::note How this connects
Terraform basics are in [Terraform 1](#terraform-1), the state commands in [Terraform 4](#terraform-4) and teams in [Terraform 6](#terraform-6); large-state performance is in [the question bank](#qbank-27); drift and locks are in the scenarios track.
:::

## Terraform creates some resources and then fails: how do you recover safely?

**What the interviewer tests:** do you stay calm and do the right small steps in order (read, fix cause, re-plan), do you know that state is the source of truth, and do you know what **not** to do (delete state, edit it by hand, destroy everything).

### Clarifying questions

- What was the error (quota, permission, name collision, timeout, API throttling, a dependency)?
- Is the state remote with locking and versioning? Who else could be applying?
- Is this a new stack or a change to something live that users depend on?
- Was it applied from a saved plan, in CI?

### What actually happens

Terraform builds a dependency graph and applies resources in order, **writing the state after each successful change**. If resource 4 fails, resources 1 to 3 already exist in the cloud *and* in the state. Resources 5 and 6 were never attempted. **There is no automatic rollback**, because Terraform cannot know that undoing is safe. The plan was a prediction; the cloud answered "no" (quota, permission, an existing name, an eventual-consistency delay, a timeout).

### The recovery, step by step

1. **Do nothing destructive.** No `rm terraform.tfstate`, no hand-editing state, no `destroy`. Keep the output and the error.
2. **Read the error** and classify it: permission, quota, conflict, validation, timeout, provider bug.
3. **Fix the cause** (raise the quota, fix the IAM policy, pick another name, correct the argument).
4. **Run `terraform plan` again.** Because the state is correct, the plan shows only the missing resources as creates. **Apply is idempotent**: re-apply and the rest is built.
5. **Verify** the result and that the next plan says "no changes".

The model walks through this and the hard cases.

```run
mkdir -p ~/lab/seniorqa/q10 && cd ~/lab/seniorqa/q10
cat > tfpartial.py <<'EOF'
# Terraform apply that fails half-way: what state holds, and how to recover safely.
resources = ["vpc", "subnet", "sg", "db", "instance", "dns"]
created = {"vpc", "subnet", "sg"}            # applied OK and recorded in state
failed = "db"                                # quota error; instance and dns never attempted
print("apply order follows the dependency graph:", " -> ".join(resources))
print("result: created", sorted(created), "| FAILED:", failed, "| not attempted:", [r for r in resources if r not in created and r != failed])
print("\nKey facts: Terraform writes state after each successful resource, so created resources ARE in state. There is no automatic rollback.")
print("           the plan was a promise; the cloud said no (quota, permissions, name clash, eventual consistency, timeout).\n")
def plan(state):
    return [("create" if r not in state else "keep", r) for r in resources]
print("Recovery step 1: do NOT delete state, do NOT hand-edit it. Read the error, fix the cause (quota, permission, name).")
print("Recovery step 2: re-run plan against the same state ->", plan(created))
print("                 only the missing resources are created; apply is idempotent.\n")
print("Hard cases:")
cases = [
 ("timeout: resource exists in the cloud but NOT in state", "terraform import <addr> <id>, then plan shows no change (or `import` block in 1.5+)"),
 ("resource tainted by a failed create", "plan shows destroy-and-recreate; `terraform untaint` if the object is actually fine"),
 ("state lock left behind by a crashed run", "check nobody is running; then `terraform force-unlock <ID>` (last resort)"),
 ("someone changed things by hand meanwhile", "`plan -refresh-only` to see drift first; decide per item: adopt into code or revert"),
 ("state file damaged or lost", "restore the previous state VERSION from the versioned remote backend (S3 versioning / GCS / Terraform Cloud)"),
 ("you want to abandon the half-built stack", "`terraform destroy` removes only what is in state; check for orphans created before a state write failed")]
for a, b in cases: print(f"  - {a}\n      {b}")
print("\nPrevention: remote backend with locking and versioning; small stacks (small blast radius); `plan -out` then apply that exact plan file; quotas/permissions checked in plan stage; CI-only applies; policy checks (OPA/Sentinel).")
EOF
python3 tfpartial.py
```

What the output shows: the first three resources (vpc, subnet, sg) were created and recorded; `db` failed; `instance` and `dns` were not attempted. Re-planning against the same state gives *keep, keep, keep, create, create, create*: only the missing work is done.

### The hard cases

- **Created in the cloud but not in state.** A timeout means Terraform lost the response although the resource exists. The plan then wants to create it again and fails with "already exists". Fix: `terraform import <address> <id>` (or an `import {}` block in recent versions), then plan again.
- **Tainted resource.** A failed create may leave the resource marked tainted, so the next plan destroys and recreates it. If the object is actually fine, `terraform untaint <address>`; if it is broken, let it be replaced.
- **State lock left behind.** A crashed run can leave a lock in the backend. First confirm nobody is applying (check CI), then `terraform force-unlock <LOCK_ID>` as a last resort.
- **Drift during the failure.** Someone changed something by hand. `terraform plan -refresh-only` shows drift; for each item decide whether to adopt it into the code or revert it.
- **Damaged or lost state.** Restore a previous **state version** from the versioned remote backend (S3 versioning, GCS object versioning, Terraform Cloud history), then re-plan. If there is no backup, `import` each resource, which is slow; this is why backends are versioned.
- **Abandoning the stack.** `terraform destroy` removes only what is in state. Check for orphans created before a state write failed, using tags.
- **A failing resource inside a module with a dependency.** Use `-target` only as an emergency tool for a surgical re-apply; it skips the dependency graph and should be followed by a full plan.

```term
# Example (not run here)
terraform plan -out=tfplan             # review, and later apply exactly this plan
terraform apply tfplan
terraform state list                   # what Terraform believes exists
terraform import aws_db_instance.main mydb-prod     # adopt an existing object
terraform untaint aws_instance.web
terraform plan -refresh-only           # show drift without proposing changes
terraform force-unlock 3a1f...         # last resort, after checking nobody is applying
```

### Prevention

- **Remote backend with locking and versioning** (S3 + DynamoDB lock or S3 native locking, GCS, Terraform Cloud/Spacelift).
- **Small stacks** (network, data, compute separated) so a failure has a small blast radius.
- **`plan -out`, then apply that exact plan file**, from CI only, with approval. What was reviewed is what runs.
- **Pre-flight checks:** `terraform validate`, linters, policy checks (OPA, Sentinel, Checkov), quota checks.
- **`prevent_destroy` and `create_before_destroy`** for critical resources; deletion protection on databases.
- **Retries and timeouts** configured for slow APIs; avoid parallelism that trips rate limits (`-parallelism`).
- **Run applies from one place** so two people never apply at once.

:::say
Terraform writes state after every resource it creates, so after a half-failed apply the first three resources exist and are recorded, and there is no automatic rollback. I do not touch the state. I read the error, classify it as permission, quota, a name conflict or a timeout, fix the cause, and run plan again; because the state is accurate, the plan shows only the missing resources and re-applying finishes the job. For the hard cases: a resource that exists but is missing from state I import; a tainted one I untaint if it is healthy; a stale lock I force-unlock only after confirming nothing is running; and if the state is damaged I restore the previous version from the versioned backend. To prevent it, I use a locked, versioned remote backend, small stacks, a saved plan applied from CI, and policy and quota checks before apply.
:::

## Follow-up questions

:::answer Why not just run destroy and start again?
If the stack is new and empty of data, that may be fine, but in general destroy can delete things you did not intend (including databases) and may fail halfway too. Fixing the cause and re-applying is smaller and safer. For production, never destroy as the first move.
:::

:::answer How do you apply a change to production with confidence?
Review a saved plan, apply that exact plan from CI with approval, use deletion protection on stateful resources, apply in a low-risk window, and have the previous state version and a rollback (revert the code and re-apply) ready.
:::

:::answer What if two people applied at once?
A correct backend lock prevents it. Without one, state can be overwritten and resources orphaned. Restore the earlier state version, reconcile with `refresh-only` and imports, and then add locking.
:::

:::answer How is rolling back Terraform different from rolling back an app?
There is no rollback command. You revert the code to the previous version and apply, which tries to make the cloud match. Resources that were destroyed (a database) do not come back with data; protect stateful resources and keep backups.
:::

## Practice (answers below)

1. After a failed apply, are the already-created resources in the state?
2. What exit sequence would you use for a resource that exists in the cloud but not in state?
3. Why apply a saved plan file?

:::note Answers
1. Yes, Terraform records each successful resource as it goes. 2. `terraform import` it into the state at the right address, then `terraform plan` until it shows no changes. 3. It guarantees that what was reviewed and approved is exactly what is applied, even if the code or the cloud changed in between.
:::

:::recap
- A partial apply leaves **created resources in state**; there is **no automatic rollback**.
- Fix the cause, **re-plan, re-apply**; apply is idempotent.
- Hard cases: **import**, **untaint**, **force-unlock (last resort)**, **restore state version**.
- Never delete or hand-edit state, and never `destroy` as a first reaction.
- Prevent with a **versioned, locked backend**, small stacks and saved plans from CI.
:::

```quiz
? After an apply fails on the fourth resource, what does the state contain?
+ The first three resources that succeeded
- Nothing, it is rolled back
- All six resources
- Only the failed one
! Terraform writes state after each success and does not roll back.

? A create timed out but the resource exists in the cloud. What is the fix?
+ Import it into the state, then plan again
- Delete the state file
- Destroy the whole stack
- Ignore it
! Import so Terraform knows about the existing object.

? When is force-unlock appropriate?
+ As a last resort after confirming no one else is applying
- Before every apply
- Whenever plan is slow
- Never
! A forced unlock during a real apply can corrupt state.
```
