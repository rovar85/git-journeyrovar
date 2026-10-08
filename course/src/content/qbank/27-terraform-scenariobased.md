---
track: qbank
title: "Terraform and Infrastructure as Code: Scenario-based questions"
short: Terraform scenario
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## A resource was manually changed in AWS (for example someone added an S3 bucket policy to a Terraform-managed bucket), and Terraform shows drift. How do you handle it using IaC?

<!-- source: 05 Q36 -->

*Also asked as:* If someone manually changed an S3 bucket policy that was originally created with Terraform, how would you deal with that drift?

:::note In simple words
Either put the cake back the way the recipe says, or, if the change was good, update the recipe. Never leave them different.
:::

Steps:
1. **See the drift**: `terraform plan -refresh-only` shows the policy change.
2. **Find the reason**: CloudTrail `PutBucketPolicy` event - who, when, why (maybe an urgent access fix).
3. **Decide**:
   - Unwanted / insecure (e.g. made bucket public) -> run `terraform apply` to overwrite it with the code version. If the policy resource was never in code, add an `aws_s3_bucket_policy` resource with the correct policy so Terraform owns it.
   - Intended change -> copy the policy into code (`aws_s3_bucket_policy` + `aws_iam_policy_document`), raise a PR, and plan until "No changes".
   - If the policy object exists but is not in state -> `import` it.
4. **Prevent**: prod console is read-only, SCP or IAM deny on `s3:PutBucketPolicy` except for the Terraform role, scheduled drift detection, AWS Config rule for public buckets.

Note: in AWS provider v4+, bucket policy is a separate resource `aws_s3_bucket_policy`; do not also define it inline elsewhere or two resources will fight.

**Example:**
```hcl
data "aws_iam_policy_document" "assets" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::222222222222:role/app"]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json
}
```
```bash
terraform import aws_s3_bucket_policy.assets acme-prod-assets   # if not yet managed
terraform plan   # goal: No changes
```

:::say
I first run plan -refresh-only and check CloudTrail to see who changed the policy and why. If the change was wrong I re-apply the code to revert it; if it was needed I codify it in an aws_s3_bucket_policy resource, import it if needed, and get the plan to show no changes. Then I lock down console write access and schedule drift detection so it does not happen again.
:::

## There is an existing VPC created manually. How would you import it into Terraform without breaking anything? What are the prerequisites and how do you pass the VPC ID?

<!-- source: 05 Q37 -->

*Also asked as:* What are the prerequisites before importing a VPC? How do you pass arguments to a VPC with terraform import?

:::note In simple words
You are adopting a house that is already built. You measure it, draw the blueprint exactly as it is, and register it - you do not knock anything down.
:::

Prerequisites:
- Terraform and AWS provider configured with credentials that can read the VPC (and backend set up for state).
- The real IDs: VPC ID (`vpc-0abc...`), plus IDs of subnets, route tables, IGW, NAT, SGs you also want to manage.
- Know the current settings (CIDR, DNS support, tags) - get them from `aws ec2 describe-vpcs`.
- Take a snapshot of current config and decide scope (import only the VPC, or all its children).

How the ID is passed: `terraform import` takes two arguments - the resource address in code and the real ID. You do not pass CIDR etc. on the command line; those come from your code, which must match reality.

Safe steps:
1. Write an `import` block (or empty resource for the CLI method).
2. `terraform plan -generate-config-out=vpc.tf` to generate matching code.
3. Tidy the code; keep values identical to the real VPC.
4. `terraform plan` must show `1 to import, 0 to add, 0 to change, 0 to destroy`. Any "must be replaced" (for example a CIDR mismatch) means your code is wrong - fix it, never apply.
5. Apply, then import subnets, route tables, IGW the same way.
6. Add `lifecycle { prevent_destroy = true }` for safety.

**Example:**
```hcl
import {
  to = aws_vpc.main
  id = "vpc-0abc123def4567890"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "legacy-prod-vpc" }

  lifecycle {
    prevent_destroy = true
  }
}
```
```bash
# CLI alternative: address + real ID are the two arguments
terraform import aws_vpc.main vpc-0abc123def4567890
terraform plan    # must be: 0 to add, 0 to change, 0 to destroy
```

:::say
I gather the real VPC ID and its settings, write an import block or run terraform import with the resource address and the VPC ID, and generate or write matching code. I only apply once the plan shows zero changes and zero destroys, then repeat for subnets and route tables, and protect it with prevent_destroy.
:::

## Your Terraform state file was accidentally deleted, lost, or got corrupted / out of sync. How do you recover it safely? What are the risks and how do you protect it?

<!-- source: 05 Q38 -->

*Also asked as:* A team member accidentally deleted the state file. What immediate steps prevent drift or resource loss?

:::note In simple words
If the notebook is lost, Terraform thinks nothing exists and will try to build everything again. You either restore the notebook from a backup copy or rewrite it by re-adopting each resource.
:::

Immediate: **freeze all applies first** - lock or pause the pipeline (and keep/obtain the state lock) so nobody runs an apply against an empty state and creates duplicates or orphans. Then restore the **previous S3 object version** of the state before doing anything else.

Recovery options:
1. **Restore from backend versioning** (best): S3 versioning -> restore the previous object version; GCS object versioning; HCP Terraform keeps state history.
2. **Local backup**: `terraform.tfstate.backup` or a copy from `terraform state pull` done earlier.
3. **Corrupted but present**: `terraform state pull > broken.json`, fix JSON carefully (or restore an older version), bump the serial, `terraform state push`.
4. **No backup at all**: rebuild state by importing every resource (import blocks, or tools like terraformer) until `plan` shows no changes.
5. **Out of sync**: `terraform plan -refresh-only`, then `state rm` for things that no longer exist and `import` for things missing from state.

Risks: duplicate resources, apply trying to recreate or delete prod, orphaned resources nobody tracks, secrets exposed if state leaks.

Protection:
- Remote backend with **versioning**, KMS encryption, MFA delete / object lock, bucket deletion protection.
- Locking to prevent corruption from parallel runs.
- Least-privilege IAM on the state bucket; only CI can write.
- Separate state per env/component (smaller blast radius).
- Never edit state by hand; use `state mv/rm/import`.

**Example:**
```bash
aws s3api list-object-versions --bucket acme-tf-state --prefix prod/network/terraform.tfstate
aws s3api get-object --bucket acme-tf-state --key prod/network/terraform.tfstate \
  --version-id 3HL4kqtJlcpXroDTDmJ.rmSpXd3dIbrHY restored.tfstate
terraform state push restored.tfstate
terraform plan    # verify: No changes
```

:::say
First I freeze all pipelines, then restore the last good version from S3 versioning and push it, and verify with a plan that shows no changes. If there is no backup I rebuild the state by importing each resource. To protect it, the backend has versioning, encryption, locking, restricted access, and state is split per environment so any damage stays small.
:::

## A terraform apply fails midway in production after creating some resources. What would be your next steps?

<!-- source: 05 Q39 -->

*Also asked as:* Scenario: terraform apply failed halfway. How do you recover?

:::note In simple words
The builder stopped halfway. Do not panic and restart from scratch; check what got built, fix the problem, and let Terraform finish the rest.
:::

Terraform is not transactional - there is no automatic rollback. Whatever was created before the error is already recorded in state.

Steps:
1. **Do not re-run blindly.** Read the error (quota limit, IAM permission, name conflict, timeout, API throttling, dependency).
2. **Check the lock**: if the process crashed, a stale lock may remain -> confirm no run is active, then `force-unlock`.
3. **Check state vs reality**: `terraform plan` shows what is done and what is still pending. Look for resources marked tainted (created but failed during setup) - Terraform will replace them.
4. **Check for orphans**: if a resource was created in the cloud but the crash stopped state from being saved, it is not in state -> import it (otherwise the next apply fails with "already exists" or creates a duplicate).
5. **Fix the root cause**: raise quota, fix IAM, fix the config.
6. **Re-run plan, review, apply** - Terraform continues from where it stopped.
7. If the partial change is hurting production, roll back by reverting the code commit and applying the previous version (or restoring state + infra).
8. Afterwards: add smaller changes, pre-checks (quotas, permissions), and test in stage first.

**Example:**
```text
Error: creating EC2 Instance: VcpuLimitExceeded: You have requested more vCPU capacity...
```
```bash
terraform plan          # 2 already created, 3 still to add
# fix quota / config, then
terraform apply
```

:::say
Terraform does not roll back, so I first read the error, clear a stale lock if needed, and run plan to see exactly what was created and what is pending, importing any orphaned resources that were created but not recorded. After fixing the root cause I re-plan and apply to finish, or revert the commit and apply if the partial state is hurting production.
:::

## terraform plan shows that critical resources will be deleted unexpectedly. What would you do?

<!-- source: 05 Q40 -->

*Also asked as:* During apply, production resources are about to be recreated. How do you detect and stop it before impact?

:::note In simple words
The builder says "I will tear down your main pillar". Stop, do not approve, and find out why he thinks that.
:::

1. **Do not apply.** Stop the pipeline.
2. Read the plan: is it `destroy` or `must be replaced` (`-/+`)? The plan tells which attribute "forces replacement".
3. Common causes and fixes:

| Cause | Fix |
|---|---|
| Resource renamed / moved into a module | `moved` block or `terraform state mv` |
| count index shifted (item removed from a list) | switch to `for_each` with stable keys + `moved` |
| Immutable field changed (DB identifier, AZ, CIDR, name) | revert the change or plan a proper migration |
| Wrong workspace / wrong backend / wrong tfvars | check `terraform workspace show` and backend key |
| Provider major upgrade changed behavior | pin version, read upgrade guide |
| Resource removed from code but still needed | restore the code; to just stop managing, use a `removed` block or `state rm` |
| Drift - someone changed it manually | codify or revert |

4. Re-plan until destroy count is 0 for critical resources.
5. Prevent: `lifecycle { prevent_destroy = true }`, `deletion_protection = true` on RDS/ALB, policy checks in CI that fail on destroys, mandatory reviewer for prod.

Detecting and stopping it before impact:
- Read the plan symbols: `-/+` means destroy then create, `+/-` means create before destroy, and the attribute line says `# forces replacement`. The summary line shows `N to destroy`.
- Always `terraform plan -out=tfplan`, review it, and apply only that saved plan - nothing new can sneak in between review and apply.
- CI policy gate: `terraform show -json tfplan` + conftest/OPA fails the pipeline if any action contains `delete` for protected types (RDS, S3, EKS).
- lifecycle options: `prevent_destroy` makes the plan error out; `create_before_destroy` avoids downtime when replacement is truly needed; `ignore_changes` stops replacement for attributes changed by other systems.
- If you notice it mid-apply, press **Ctrl+C once**: Terraform stops starting new operations, lets in-flight ones finish, saves state and releases the lock. Pressing it a second time forces exit and can leave state inconsistent and the lock stuck, so avoid that.

**Example:**
```hcl
moved {
  from = aws_db_instance.db
  to   = module.database.aws_db_instance.this
}

resource "aws_db_instance" "this" {
  # ...
  deletion_protection = true
  lifecycle {
    prevent_destroy = true
  }
}
```

:::say
I never apply; I read the plan to find which attribute forces replacement or why the resource is being destroyed, which is usually a rename, a count index shift, an immutable field change or the wrong workspace. I fix it with moved blocks or state mv until the plan shows no destroy, and I protect critical resources with prevent_destroy, deletion_protection and a CI policy that blocks destroys.
:::

## A Terraform script bypassed validation and deleted a production database (or other prod resources) during peak business hours. What is your action plan, and how do you contain the blast radius?

<!-- source: 05 Q41 -->

*Also asked as:* How would you troubleshoot and contain the blast radius if Terraform accidentally deleted production resources?

:::note In simple words
First stop the fire from spreading, then bring the patient back from the latest backup, keep everyone informed, and afterwards fix the process so nobody can do it again.
:::

Phase 1 - Contain (first minutes):
1. Declare an incident, open a war room, assign an incident commander and a communicator (status page / stakeholders).
2. **Stop further damage**: cancel running pipelines, disable the Terraform CI job, revoke/limit the Terraform role, keep the state lock.
3. Find scope: what else was in the plan? Check apply logs and CloudTrail (`DeleteDBInstance`, who/when).

Phase 2 - Recover:
4. Restore the database:
   - RDS: restore from the **final snapshot** (if `skip_final_snapshot = false`), latest automated snapshot, or **point-in-time restore** to just before deletion. Retained automated backups can exist after deletion if configured.
   - Aurora: restore cluster from snapshot / backtrack if enabled.
   - Or promote a cross-region read replica / AWS Backup copy.
5. Point the app to the restored endpoint (same identifier, or update DNS/secret), put the app in maintenance mode meanwhile.
6. Re-align Terraform: import the restored DB into state so the next plan is clean.
7. Validate data (row counts, last transactions), then reopen traffic and monitor.

Phase 3 - Prevent (post-mortem, blameless):
- `deletion_protection = true` and `prevent_destroy` on all stateful resources; `skip_final_snapshot = false`.
- Split state: databases in their own state, rarely touched.
- Policy as code (OPA/Sentinel) that fails any plan with destroy on data stores.
- Mandatory plan review + approval; apply only saved plans; no applies from laptops; freeze during peak hours.
- IAM guardrails: SCP or deny `rds:DeleteDBInstance` for the pipeline role except via break-glass.
- Tested backups: AWS Backup, cross-region/cross-account copies, regular restore drills.

**Example:**
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time 2026-09-20T10:14:00Z
terraform import aws_db_instance.prod prod-db-restored
```
```json
{
  "Effect": "Deny",
  "Action": ["rds:DeleteDBInstance", "rds:DeleteDBCluster"],
  "Resource": "*",
  "Condition": { "StringNotLike": { "aws:PrincipalArn": "arn:aws:iam::*:role/BreakGlass" } }
}
```

:::say
I would first contain it by declaring an incident, stopping all pipelines and restricting the Terraform role, then restore the database from the final snapshot or point-in-time recovery, reconnect the app, and import the restored DB back into state. In the post-mortem I would add deletion_protection and prevent_destroy, move databases to their own state, block destroys with OPA policies and an IAM deny, and require approved saved plans.
:::

## Terraform creates an IAM role and immediately uses it, but the apply fails even though the trust policy and permissions are correct. Why, and how do you fix it?

<!-- source: 05 Q42 -->

:::note In simple words
IAM is a global notice board. When you pin a new notice, it takes a few seconds before every office in the world can read it. If the next step runs too fast, it cannot see the notice yet.
:::

Cause: **IAM eventual consistency**. IAM changes are replicated globally; a new role, trust policy or policy attachment can take a few seconds to become visible to other services (Lambda, EKS, EC2 instance profiles, ECS).

Typical error:
```text
Error: creating Lambda Function (app): InvalidParameterValueException:
The role defined for the function cannot be assumed by Lambda.
```
Other variants: `InvalidInstanceProfile` / "Invalid IAM Instance Profile name" on EC2, access denied right after attaching a policy.

Fixes:
1. **Re-run first**: the second apply usually succeeds - confirms it is propagation, not a config bug.
2. The AWS provider already has **built-in retries** for many of these cases; keep the provider up to date.
3. Add a **time_sleep** after the role/policy attachment and make the consumer depend on it.
4. Use **depends_on** so the consumer waits for the policy attachment, not just the role (a common real bug: the Lambda referenced the role, but not the attachment).
5. In scripts/pipelines, **retry with backoff** instead of failing immediately.
6. Longer term: create shared IAM roles in an earlier stack so they already exist when apps are deployed.

**Example:**
```hcl
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "time_sleep" "iam_propagation" {
  depends_on      = [aws_iam_role_policy_attachment.lambda_basic]
  create_duration = "15s"
}

resource "aws_lambda_function" "app" {
  depends_on    = [time_sleep.iam_propagation]
  function_name = "app"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  handler       = "app.handler"
  filename      = "app.zip"
}
```

:::say
That is IAM eventual consistency: the role exists but has not propagated to the service yet, which gives errors like "The role defined for the function cannot be assumed by Lambda". I confirm it by re-running, then fix it by making the consumer depend on the policy attachment and adding a short time_sleep, relying on the provider's built-in retries, and in the long run creating shared IAM roles in an earlier stack.
:::

## Scenario: you need to create dynamic IAM roles across multiple environments. What is your module strategy?

<!-- source: 05 Q43 -->

:::note In simple words
Build one "role factory" module. Each environment hands it a shopping list of roles, and the factory stamps out correctly named, safely limited roles for that environment.
:::

Strategy:
1. **One reusable `iam-role` module** that takes a **map of roles** as input (name -> trusted principals, managed policies, inline policy statements).
2. Inside, `for_each` over the map, so adding or removing a role never shifts others.
3. **Env-prefixed names** (`dev-app-reader`, `prod-app-reader`) built from a `var.env` in locals, plus common tags.
4. A **permissions boundary** on every role, so even a bad policy cannot exceed the allowed maximum.
5. Policies built with **aws_iam_policy_document** (validated HCL, no hand-written JSON strings).
6. **Per-environment tfvars** (`dev.tfvars`, `prod.tfvars`) holding the role map for that env.
7. **One module call per account** using a provider alias with assume_role (dev account, prod account).
8. Guardrails: CI policy check (no `*:*`, no wildcard principals), pinned module version, review on changes.

**Example:**
```hcl
# modules/iam-role/main.tf
variable "env" { type = string }
variable "permissions_boundary_arn" { type = string }
variable "roles" {
  type = map(object({
    trusted_services = list(string)
    policy_arns      = list(string)
  }))
}

data "aws_iam_policy_document" "trust" {
  for_each = var.roles
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = each.value.trusted_services
    }
  }
}

resource "aws_iam_role" "this" {
  for_each             = var.roles
  name                 = "${var.env}-${each.key}"
  assume_role_policy   = data.aws_iam_policy_document.trust[each.key].json
  permissions_boundary = var.permissions_boundary_arn
  tags                 = { Env = var.env, ManagedBy = "terraform" }
}

locals {
  attachments = merge([
    for role, cfg in var.roles : {
      for arn in cfg.policy_arns : "${role}|${arn}" => { role = role, arn = arn }
    }
  ]...)
}

resource "aws_iam_role_policy_attachment" "this" {
  for_each   = local.attachments
  role       = aws_iam_role.this[each.value.role].name
  policy_arn = each.value.arn
}

output "role_arns" {
  value = { for k, r in aws_iam_role.this : k => r.arn }
}
```
```hcl
# envs/prod/main.tf
module "iam_roles" {
  source                   = "git::https://github.com/acme/tf-modules.git//iam-role?ref=v2.1.0"
  providers                = { aws = aws.prod }
  env                      = "prod"
  permissions_boundary_arn = "arn:aws:iam::333333333333:policy/DevOpsBoundary"
  roles                    = var.roles   # from prod.tfvars
}
```
```hcl
# prod.tfvars
roles = {
  app-lambda = {
    trusted_services = ["lambda.amazonaws.com"]
    policy_arns      = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
  }
  batch-ec2 = {
    trusted_services = ["ec2.amazonaws.com"]
    policy_arns      = ["arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"]
  }
}
```

:::say
I build one reusable iam-role module that takes a map of roles and uses for_each, with env-prefixed names, a mandatory permissions boundary and policies written with aws_iam_policy_document. Each environment has its own tfvars with the role map, and I call the module once per account through a provider alias, with the module version pinned and CI policy checks blocking wildcard permissions.
:::

## Scenario: AWS API rate limits (throttling) are hit during terraform apply. How do you handle it?

<!-- source: 05 Q44 -->

:::note In simple words
Terraform is sending AWS too many requests at the same time, like 50 people shouting at one cashier. You slow the queue down, let the cashier retry calmly, and split the big order into smaller ones.
:::

How you recognize it: errors like `ThrottlingException: Rate exceeded` or `RequestLimitExceeded`, very slow applies, or the same apply succeeding on a retry. Run with `TF_LOG=DEBUG` to see the retries and which API is being throttled.

Fixes, in the order I would try:
1. **Lower parallelism**: `terraform apply -parallelism=N` (default is 10) so fewer API calls run at once.
2. **Tune provider retries**: in the `aws` provider block set `max_retries` and `retry_mode = "adaptive"`, which backs off automatically on throttling.
3. **Split into smaller root modules/stacks**: fewer resources per plan means fewer describe/refresh calls (big states also refresh hundreds of resources on every plan).
4. **Avoid huge fan-out at once**: a `for_each` creating 500 records or roles in one run hammers the same API; roll it out in batches.
5. **Request a quota increase** (Service Quotas) if a real limit is hit, and check whether other tools in the same account (CI jobs, scripts, autoscalers) share the same API budget.
6. `depends_on` / `time_sleep` to serialize calls are a crude last resort, not the main fix.

**Example:**
```hcl
provider "aws" {
  region      = "ap-south-1"
  max_retries = 25
  retry_mode  = "adaptive"   # client-side rate limiting with backoff
}
```
```bash
TF_LOG=DEBUG terraform apply -parallelism=3 2> tf-debug.log
grep -i "throttl\|rate exceeded" tf-debug.log | head
```

:::say
I confirm it is throttling from errors like ThrottlingException or Rate exceeded in TF_LOG=DEBUG output, then reduce -parallelism below the default of 10 and set max_retries with retry_mode adaptive in the AWS provider. Longer term I split large states into smaller stacks, avoid creating hundreds of resources in one run, and request quota increases where needed; time_sleep or depends_on is only a crude last resort.
:::

## Scenario: you added a new EC2 instance to an Auto Scaling Group using Terraform, but the ASG does not register the instance. How do you troubleshoot?

<!-- source: 05 Q45 -->

:::note In simple words
An Auto Scaling Group is a factory that builds its own cars from its own blueprint (the launch template). A car you built separately in your garage does not become part of the factory fleet just because it looks the same.
:::

Key point: an `aws_instance` resource **never joins an ASG automatically**. ASGs launch and own their instances from the launch template. So the right fix depends on what you wanted:
- **Want more instances** -> change `desired_capacity` / `min_size` on the ASG (or let a scaling policy do it).
- **Want new settings / new AMI** -> change the launch template and bump its version, then roll out with an **instance refresh**.
- **Really want to attach an existing instance** -> `aws autoscaling attach-instances` (CLI/API). Terraform has no first-class resource for attaching EC2 instances; `aws_autoscaling_attachment` is for attaching the ASG to ELBs / target groups, not instances.

If the ASG itself is not launching or keeping instances, check:
1. **Scaling activity history**: `aws autoscaling describe-scaling-activities` - it states exactly why a launch failed.
2. **max_size reached** - desired cannot go above max.
3. **Subnets / AZs**: `vpc_zone_identifier` subnets must be valid, in the right VPC, and have free IPs; an attached instance must be in one of the ASG's AZs.
4. **Launch template valid**: AMI exists in this region, instance profile exists, security groups belong to the same VPC, key pair exists.
5. **Health checks**: with `health_check_type = "ELB"` and a short grace period, new instances are marked unhealthy and terminated before the app starts.
6. **Lifecycle hooks** stuck in `Pending:Wait` until timeout.
7. **Terraform masking changes**: `lifecycle { ignore_changes = [desired_capacity] }` means your capacity change in code is silently ignored.
8. **Instance refresh** in progress or failed, or suspended processes (`Launch` suspended).
9. **Quotas / capacity**: vCPU service quota reached or `InsufficientInstanceCapacity` for that instance type in the AZ -> use multiple instance types or AZs.

**Example:**
```hcl
resource "aws_autoscaling_group" "web" {
  name                = "web-asg"
  min_size            = 2
  max_size            = 6
  desired_capacity    = 3              # change this to add instances
  vpc_zone_identifier = var.private_subnets
  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.web.id
    version = aws_launch_template.web.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
    preferences { min_healthy_percentage = 90 }
  }
}
```
```bash
aws autoscaling describe-scaling-activities --auto-scaling-group-name web-asg --max-items 5
aws autoscaling attach-instances --instance-ids i-0abc123 --auto-scaling-group-name web-asg
```

:::say
An aws_instance created by Terraform never joins an ASG on its own, because the ASG launches its own instances from the launch template, so I would raise desired_capacity or update the launch template version, or use attach-instances if I really need to adopt an existing instance. If the ASG is not launching, I check the scaling activity history, max_size, subnets and AZs, launch template validity, health check grace period, lifecycle hooks, ignore_changes on desired_capacity, and capacity or quota errors.
:::

## What is the fastest way to roll back an infrastructure change made with Terraform?

<!-- source: 05 Q46 -->

:::note In simple words
Terraform has no undo button. Your Git history is the undo button - go back to the last good recipe and cook again.
:::

Key facts:
- There is **no `terraform rollback` command**. Terraform only knows "make reality match the code". So rolling back = putting the old code back and applying it.
- **Fastest safe path**: `git revert` the bad commit -> pipeline runs `plan` -> review that the plan only undoes the bad change -> `apply`.
- Because modules are versioned, rolling back a module change is often just pinning `?ref=` back to the previous tag.
- **`-target`** lets you apply only one resource. Use it only in an emergency to fix the broken piece quickly, then run a full plan/apply afterwards so nothing is left out of sync. It is not for routine use.
- Some changes cannot be "rolled back" by code alone: a deleted database or a replaced resource with new IDs needs a restore from snapshot/backup.
- **Restoring an older state version from S3** is the last resort, only when state itself is broken - it does not change real infrastructure and can make state lie about reality.

Real example: a security group update removed the ingress rule the ALB needed, and the service started failing health checks. I reverted the Git commit, the pipeline showed a plan adding back just that one rule, I applied it, and the service recovered within minutes. The post-mortem added a policy check for removing ingress on prod SGs.

**Example:**
```bash
git revert a1b2c3d            # the faulty SG change
git push                      # pipeline runs plan
terraform plan -out=tfplan    # expect: 0 to add, 1 to change, 0 to destroy
terraform apply tfplan

# Emergency only, then do a full plan/apply afterwards:
terraform apply -target=aws_security_group.web
```

:::say
Terraform has no rollback command, so the fastest safe rollback is reverting the Git commit and running plan and apply through the pipeline, which restores the previous desired state. I use -target only in emergencies, restoring an old state version from S3 is a last resort for broken state, and for destructive changes like a deleted database I restore from backups. For example, when a security group change broke service access, reverting the commit and re-applying fixed it in minutes.
:::

## Terraform state is huge (200MB) and plan takes 12 minutes. How do you fix it?

<!-- source: 05 Q48 -->

:::note In simple words
One giant notebook for the whole city means every small question requires reading every page. Split it into one notebook per neighbourhood, and each question gets answered in seconds.
:::

The root cause is almost always **one state managing too much**: every plan refreshes thousands of resources through cloud APIs.

1. **Split the state by lifecycle and blast radius:** network (VPC, TGW), data (RDS, S3), platform (EKS), then one stack per service or team. Things that change daily shouldn't live with things that change yearly.
2. **Connect stacks with outputs, not one big graph:** `terraform_remote_state`, or better, publish IDs to SSM Parameter Store and read them with data sources.
3. **Move resources without recreating them:** `removed { lifecycle { destroy = false } }` in the old stack plus `import` blocks in the new one (or `terraform state mv -state-out` for local migrations). Plan both sides to confirm there are 0 destroys.
4. **Don't manage high-churn, high-count objects in Terraform:** thousands of DNS records, S3 objects or IAM users generated by apps belong in app-level tooling.
5. **Quick wins while you refactor:** `-parallelism=20` (watch API throttling), a PR-time plan with `-refresh=false` and a scheduled full refresh plan for drift, avoid large `data` sources that list everything, and keep the backend in the same region as CI.
6. **Tooling for many stacks:** Terragrunt, Terramate, Spacelift or Terraform Cloud workspaces with run triggers.
7. Use `-target` only for emergencies, never as the normal workflow.

**Example:**
```text
infra/
  00-network/     state: network.tfstate   (VPC, subnets, TGW)   -> changes yearly
  10-data/        state: data.tfstate      (RDS, S3, KMS)        -> changes monthly
  20-eks/         state: eks.tfstate       (cluster, node pools)
  30-services/
     billing/     state: billing.tfstate   -> changes daily, plan in ~20s
     meter-api/   state: meter-api.tfstate
```

```hcl
# In 20-eks: read network IDs published by 00-network
data "aws_ssm_parameter" "private_subnets" {
  name = "/infra/network/private_subnet_ids"
}
locals {
  private_subnet_ids = split(",", data.aws_ssm_parameter.private_subnets.value)
}
```

:::say
A 200MB state means one stack is doing too much, so every plan refreshes thousands of resources. I split it into stacks by lifecycle and blast radius (network, data, cluster, per-service), connect them through SSM parameters or remote state, and move resources with removed and import blocks so nothing is recreated. Meanwhile I tune parallelism and avoid heavy data sources. After the split, most plans run in under a minute and a mistake can only affect one small stack.
:::
