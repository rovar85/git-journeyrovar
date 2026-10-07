---
track: cloudsenior
title: Q8: How do you automate infrastructure at scale (IaC standards, modules, state management, drift detection)?
short: Q8 IaC at scale
sub: Standards that pass review automatically, a tested module, state locking shown for real, and a drift detector that exits non-zero when reality or inputs change, all runnable with offline Terraform.
---

:::goals
- describe repository layout, standards and quality gates for infrastructure code at organisation scale
- design and test a reusable module with validation and `terraform test`
- explain remote state, locking, blast radius and state splitting, and see locking work
- implement drift detection with `terraform plan -detailed-exitcode` over many stacks
- structure a senior answer, including how teams adopt it
:::

:::note Provenance
Everything below runs with the **offline Terraform** of the lab, using only the built-in `terraform_data` resource (no cloud, no providers to download). The same commands and patterns apply to real providers. Remote-state backends (S3 with locking, Azure Storage, Google Cloud Storage, Terraform Cloud and others) are named from my own knowledge. This lesson builds on the Terraform track; revisit its state, module and workflow lessons for the basics.
:::

## 1. What the interviewer is testing

Not "do you know Terraform syntax" but **how you make infrastructure changes safe, reviewable and repeatable for many teams**: layout, standards, testing, state, pipelines, drift, secrets, and **adoption** (how teams actually use it).

## 2. Standards that scale

| Area | Standard |
|---|---|
| **Layout** | **modules** (reusable, versioned, in their own repository or folder) separate from **live configurations** (per environment and per component, each with **its own state**) |
| **Versions** | pin `required_version` and provider versions, **commit `.terraform.lock.hcl`**, **tag modules** (semantic versions) and reference **tags**, never branches |
| **Quality gates (every pull request)** | `terraform fmt -check`, `terraform validate`, a linter (tflint), a **policy and security scan** (Checkov, tfsec or Trivy, OPA; Q4), `terraform test` for modules, and a **plan posted to the pull request** for reviewers (Q10) |
| **Naming and tagging** | one convention, enforced in modules (Q3, Q5) |
| **Secrets** | never in code or state in plain text where avoidable: reference a secret manager (Q11); mark outputs `sensitive` |
| **Documentation** | auto-generated module docs (terraform-docs), an ADR for significant choices (Q15) |
| **Ownership** | CODEOWNERS per folder; a **platform team owns the shared modules**, product teams own their stacks |
| **Change process** | pull request, review, plan, apply from the **pipeline only** (no laptop applies to production), with approvals for sensitive environments |

## 3. A module that enforces the standard

A module is **a contract**: typed inputs with validation, sensible defaults, outputs, and **tests**. Build one that vends a storage "bucket" description (an abstract resource here) and **forces the organisation's rules** (encryption, naming, tags):

```run
mkdir -p ~/lab/cs/iac/modules/bucket && cd ~/lab/cs/iac
cat > modules/bucket/main.tf <<'EOF'
variable "name" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9-]{3,40}$", var.name))
    error_message = "Name must be 3-40 characters: lowercase letters, digits and hyphens."
  }
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "Environment must be dev, test or prod."
  }
}

variable "owner" {
  type = string
}

variable "public" {
  type    = bool
  default = false
}

locals {
  full_name = "${var.environment}-${var.name}"
  tags      = { owner = var.owner, environment = var.environment, managed_by = "terraform" }
}

resource "terraform_data" "bucket" {
  input = {
    name       = local.full_name
    encrypted  = true # not an input: the module always encrypts
    versioning = var.environment == "prod"
    public     = var.public
    tags       = local.tags
  }

  lifecycle {
    precondition {
      condition     = !(var.public && var.environment == "prod")
      error_message = "Public buckets are not allowed in production."
    }
  }
}

output "name" { value = local.full_name }
output "config" { value = terraform_data.bucket.input }
EOF
cat > modules/bucket/bucket.tftest.hcl <<'EOF'
run "prod_gets_versioning_and_encryption" {
  command = plan
  variables {
    name        = "archive"
    environment = "prod"
    owner       = "ev-team"
  }
  assert {
    condition     = terraform_data.bucket.input.versioning && terraform_data.bucket.input.encrypted
    error_message = "prod buckets must be versioned and encrypted"
  }
}

run "bad_name_is_rejected" {
  command = plan
  variables {
    name        = "Bad Name!"
    environment = "dev"
    owner       = "x"
  }
  expect_failures = [var.name]
}

run "public_prod_is_rejected" {
  command = plan
  variables {
    name        = "site"
    environment = "prod"
    owner       = "web"
    public      = true
  }
  expect_failures = [terraform_data.bucket]
}
EOF
cd modules/bucket && terraform init > /dev/null 2>&1
terraform test 2>&1 | grep -E "pass|fail|Success" | sed -E 's/ \([0-9.]+s\)//'
```

Three **tests** (run on every pull request to the module) prove the contract: the **good case** works, and **both guard rails** (name validation, no public production bucket) really reject bad input. Consumers **cannot** create an unencrypted bucket because the module offers no way to. **That is how standards scale: you build them into the paved path (Q13), not into a wiki page.**

Also run the cheap gates the pipeline would run:

```run
cd ~/lab/cs/iac/modules/bucket
terraform fmt -check -diff > /dev/null && echo "fmt: formatted correctly" || echo "fmt: needs formatting"
terraform validate | grep -E "Success|Error"
printf 'variable "x" {\ntype=string\n}\n' > /tmp/unformatted.tf
terraform fmt -check /tmp/unformatted.tf > /dev/null; echo "an unformatted file makes fmt -check exit with code $? (the pipeline fails)"
```

## 4. State: the part that breaks at scale

**State** maps your code to real resources. It must be **shared, durable, locked and access-controlled**:

- **Remote backend** with **versioning** (recover an earlier state), **encryption** and tight **IAM** (state can contain secrets). Examples: an object-store bucket with a lock table or native locking, Azure Storage with blob leases, Google Cloud Storage, or a managed service.
- **Locking** so two applies cannot run at once and corrupt state.
- **Blast radius**: **one state per component and per environment** (network, platform, each application), not one state for everything (Q1 layering). Small states plan fast, limit damage, and let teams own their own.
- **Cross-stack data** through outputs read with `terraform_remote_state` or a data source, or a parameter store.
- **Never edit state by hand**; use `terraform state mv`, `rm`, `import`, and the declarative `moved`, `import` and `removed` blocks.

See **locking** work. One apply holds the lock while it runs a slow step; a second apply is refused:

```run
mkdir -p ~/lab/cs/lock && cd ~/lab/cs/lock
cat > main.tf <<'EOF'
resource "terraform_data" "slow" {
  provisioner "local-exec" {
    command = "sleep 8"
  }
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve > /tmp/first-apply.log 2>&1 &
sleep 3
echo "--- a second apply while the first still holds the lock:"
terraform apply -auto-approve 2>&1 | sed 's/[│╷╵]//g' | grep -E "Error: Error acquiring the state lock|Lock Info|Operation:" | sed 's/^ *//' | head -3
wait
grep "Apply complete" /tmp/first-apply.log
```

The second run was **refused with the lock holder's details**, which is exactly what protects shared state when two pipeline runs or two engineers collide. With a **remote backend** the lock is shared across machines; the **local** backend used here only protects one machine, which is one reason local state is for experiments only.

## 5. Drift detection

**Drift** is the difference between what the code says and what exists, usually from **manual changes** ("just this once" in the console) or from changes made by other tools. Left alone it makes the next apply a surprise (it may revert a hotfix, or fail). Detect it **regularly and automatically**:

- run **`terraform plan -detailed-exitcode`** on a schedule for every stack: exit code **0** means no changes, **1** means error, **2** means **changes pending** (drift, or code that was merged but not applied);
- send a **report per owning team** (a ticket or a message with the plan summary);
- decide **per finding** whether to **revert the manual change** (apply) or **adopt it** (update the code), never ignore it;
- reduce drift at the source: **remove console write access** for most people, alert on out-of-band changes (audit logs, Q4), and make the pipeline the **only** way to change production.

Here the "manual change" is modelled by editing a file that the configuration depends on, which Terraform notices at plan time. The detector loops over several stacks and reports:

```run
mkdir -p ~/lab/cs/drift && cd ~/lab/cs/drift
for s in network platform archive; do
  mkdir -p $s && echo "setting=original" > $s/settings.conf
  cat > $s/main.tf <<'EOF'
resource "terraform_data" "config" {
  triggers_replace = filemd5("${path.module}/settings.conf")   # the real object this stack manages
  input            = file("${path.module}/settings.conf")
}
EOF
  (cd $s && terraform init > /dev/null 2>&1 && terraform apply -auto-approve > /dev/null 2>&1)
done
echo "setting=changed-by-hand-in-the-console" > archive/settings.conf          # somebody changes one of them outside the process

cat > detect.sh <<'EOF'
#!/bin/bash
status=0
for s in "$@"; do
  (cd "$s" && terraform plan -detailed-exitcode -input=false > /tmp/plan-$s.log 2>&1)
  case $? in
    0) echo "[ ok    ] $s: no drift" ;;
    2) echo "[ DRIFT ] $s: $(grep -E 'Plan:' /tmp/plan-$s.log)"; status=2 ;;
    *) echo "[ ERROR ] $s: plan failed"; status=1 ;;
  esac
done
exit $status
EOF
chmod +x detect.sh
./detect.sh network platform archive; echo "detector exit code: $?   (non-zero would fail the scheduled job and notify the owner)"
echo "--- what changed in 'archive':"
grep -E "must be replaced|settings.conf|input" /tmp/plan-archive.log | sed -E 's/^ *//' | head -3
for s in network platform archive; do (cd $s && terraform destroy -auto-approve > /dev/null 2>&1); done
```

The job found **one drifted stack out of three** and returned a **non-zero exit code**, which a scheduler (a pipeline cron, a Kubernetes CronJob) turns into a notification. With real providers the same plan reads the **live API state** of every resource, so a console-edited firewall rule or deleted resource appears as a change.

`terraform plan -refresh-only` is the variant that **only** reconciles state with reality (useful to **accept** drift into state without changing anything), and managed alternatives exist (Terraform Cloud drift detection, driftctl-style tools, the providers' configuration-recording services, from my knowledge).

## 6. Pipelines and adoption

- **Pipeline per stack**: pull request runs the gates and posts the **plan**; after review and merge, a **protected job applies**, with approvals for production. Use **OIDC or workload identity** for cloud credentials (Q11), never stored keys.
- **Policy before apply**: scan the **plan JSON** (`terraform show -json`) with OPA or Checkov so a plan that opens a database to the internet **cannot be applied** (Q4).
- **Self-service**: teams call the **catalogue of approved modules** with a few inputs (Q13).
- **Migration of existing infrastructure**: `terraform import` or `import` blocks (with generated configuration), **stack by stack**, with a plan that shows **no changes** as the success criterion.
- **Adoption is a people problem**: training, paved paths that are **easier than clicking**, fast pipelines, and an **exception path** for urgent fixes (emergency console change **plus** a follow-up code change within a day).

## 7. How to answer

1. **Layout and ownership**: modules versus live configurations, one state per component and environment, platform team owns modules.
2. **Standards as automation**: formatting, validation, policy scans, tests and plan review in every pull request, enforced by **required checks**.
3. **Modules as contracts**: typed inputs, validation, secure defaults, tests, semantic versions, upgrade notes.
4. **State**: remote, encrypted, versioned, **locked**, access-controlled, small blast radius.
5. **Drift**: scheduled detailed-exit-code plans, reports to owners, a policy to revert or adopt, console access reduced, audit alerts.
6. **Adoption**: paved path easier than manual, exceptions handled, migration of legacy by import.

## 8. Follow-up questions to expect

- "How do you **upgrade a module** used by 80 stacks?" (semantic versions, a changelog, automated pull requests (Renovate or Dependabot style) with plans, a deprecation window, canary stacks first)
- "**State got corrupted or lost**. Now what?" (restore a version of the state from the backend's versioning; if gone, re-import resources; this is why state needs backups)
- "How do you handle **secrets** in Terraform?" (data sources from a secret manager, write-only or ephemeral values where supported, sensitive outputs, encrypted state)
- "**Terraform or OpenTofu, Pulumi, CloudFormation, Bicep?**" (the principles are the same; choose by ecosystem, skills, multi-cloud needs, and licensing)
- "How do you prevent **two teams** from clashing on the same resources?" (state ownership, one writer per resource, CODEOWNERS)

:::warn Common mistakes
- **One giant state** for everything: slow plans, wide blast radius, constant lock contention.
- **Local state or an unlocked backend** for shared infrastructure.
- **Referencing a module by branch** (`ref=main`): unreviewed changes flow into production.
- **Applying from laptops.**
- **Drift detection nobody reads**: reports without owners.
- **Modules that are thin wrappers** of one provider resource, adding indirection and no standard.
:::

:::recap
- Standards scale only when **built into modules and checked by the pipeline**: fmt, validate, scan, test, plan on every pull request.
- **Modules are contracts**: typed, validated, secure by default, tested, versioned by tag.
- **State**: remote, locked, encrypted, versioned, **small and per component**; you saw the lock refuse a second apply.
- **Drift**: scheduled `plan -detailed-exitcode` (0, 1, 2), reports to owners, revert or adopt, and remove the causes.
:::

:::try Your turn
Add a fourth test to `bucket.tftest.hcl` that checks `dev` buckets are **not** versioned, and a fourth stack to the drift detector that you leave unchanged. Then change the lock demo so the second command uses `-lock-timeout=10s` and report what happens.
:::

:::quiz
? What does `terraform plan -detailed-exitcode` return when there are pending changes?
+ Exit code 2
- Exit code 0
- Exit code 1
- Exit code 3
! 0 means no changes, 1 means an error, 2 means changes are present.
? Why split infrastructure into many small state files?
+ Smaller blast radius, faster plans, less lock contention and clearer ownership
- Terraform forbids large states
- It removes the need for modules
- It hides secrets
! One state per component and environment.
? Why reference modules by a version tag instead of a branch?
+ A branch changes under you, so unreviewed changes could reach production
- Tags are faster to download
- Branches are not supported
- Tags are encrypted
! Pin and upgrade deliberately.
:::
