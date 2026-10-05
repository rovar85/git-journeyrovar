---
track: terraform
title: Workflow, testing and teams
short: Workflow, testing
sub: Plan files, workspaces, tests, CI/CD pipelines and safe collaboration.
---

:::goals
- save and apply a reviewed plan file
- use workspaces and understand when not to
- write `terraform test` tests
- design a safe team workflow with CI and approvals
:::

## Plan files: apply exactly what was reviewed

`terraform plan` followed by `terraform apply` re-plans internally, and the world may have changed in between. A **saved plan** removes that gap: you review a plan, then apply that very plan.

```run
mkdir -p ~/lab/tf6 && cd ~/lab/tf6
cat > main.tf <<'EOF'
variable "replicas" {
  type    = number
  default = 2
}

resource "terraform_data" "worker" {
  count = var.replicas
  input = "worker-${count.index}"
}
EOF
terraform init > /dev/null 2>&1
terraform plan -out=tfplan | grep -E "Plan:"
ls -l tfplan | awk '{print "plan file saved:", $9}'
terraform show tfplan | grep -E "^  # "
terraform apply tfplan | grep -E "Apply complete"
```

In CI the usual shape is: pipeline job 1 runs `plan -out`, stores the plan as an **artifact** and posts the summary to the pull request; after approval, job 2 runs `apply` on that same plan file. Plan files can contain secrets, so store them like state.

## Workspaces

A **workspace** is a separate state within the same configuration and backend. The default is called `default`.

```run
cd ~/lab/tf6
terraform workspace new test | grep -E "Created"
terraform workspace list
terraform apply -auto-approve -var replicas=1 | grep -E "Apply complete"
terraform workspace select default | grep Switched
terraform state list
terraform workspace select test > /dev/null
terraform state list
terraform destroy -auto-approve | grep "Destroy complete"
terraform workspace select default > /dev/null
```

Each workspace has its own resources: `default` has two workers, `test` has one. Workspaces suit quick, short-lived copies of the same thing (for example, a feature branch environment). For long-lived, differently configured environments such as **test and prod**, most teams prefer **separate directories or separate state files** with different variable files, because workspaces make it easy to apply to the wrong environment by accident and share one backend and credentials.

## Testing with `terraform test`

Terraform has a built-in test framework. A `*.tftest.hcl` file runs real or mocked plans/applies and checks **assertions**.

```run
cd ~/lab/tf6
cat > tests.tftest.hcl <<'EOF'
run "default_has_two_workers" {
  command = plan

  assert {
    condition     = length(terraform_data.worker) == 2
    error_message = "expected 2 workers by default"
  }
}

run "scales_up" {
  command = plan
  variables {
    replicas = 5
  }

  assert {
    condition     = length(terraform_data.worker) == 5
    error_message = "expected 5 workers"
  }
}

run "rejects_nonsense_in_a_deliberately_failing_test" {
  command = plan
  variables {
    replicas = 3
  }

  assert {
    condition     = length(terraform_data.worker) == 2
    error_message = "this assertion is meant to fail, to show the output"
  }
}
EOF
terraform test | sed -E 's/\.\.\. //; s/ \([0-9.]+s\)//' | grep -E "pass|fail|Success|Error|expected|meant"
```

Two tests pass and the third deliberately fails, so you see what failure output looks like (a non-zero exit code, which fails a CI job). Remove that run block in real life.

```run
cd ~/lab/tf6
python3 - <<'PY'
import re
s = open("tests.tftest.hcl").read()
s = s[:s.index('run "rejects_nonsense')]
open("tests.tftest.hcl", "w").write(s)
PY
terraform test | grep -E "Success"
```

Other quality tools: `terraform validate`, `terraform fmt -check`, **tflint** (provider-aware linting), **checkov** / **tfsec** / **trivy** (security scanning: open ports, unencrypted disks, public buckets), **terratest** (Go-based integration tests), and **Infracost** (cost estimate in the PR).

## A team workflow

1. A change starts as a **branch** and **pull request** (see the Git track).
2. CI runs: `fmt -check`, `validate`, `tflint`, security scan, `terraform test`, then `plan`.
3. The plan output is posted on the PR. Reviewers read **the plan, not only the code**.
4. After approval and merge to `main`, a pipeline runs `apply` (often with a manual approval for production).
5. State is remote and locked; the pipeline uses short-lived credentials (OIDC role) rather than stored keys.

Rules that prevent disasters:

- Nobody runs `apply` from their laptop against production.
- Separate state per environment and per component; least-privilege credentials per environment.
- `prevent_destroy` on stateful resources; protect production applies with approvals.
- Pin provider and Terraform versions (`required_version`, `.terraform.lock.hcl` committed).
- Never commit `*.tfstate`, `*.tfvars` with secrets, or credentials.

```run
cd ~/lab/tf6
cat > versions.tf <<'EOF'
terraform {
  required_version = ">= 1.6.0, < 2.0.0"
}
EOF
terraform validate
terraform destroy -auto-approve | grep "Destroy complete"
```

:::recap
- Save a plan (`-out`) and apply that exact file after review.
- Workspaces give separate state per name; use separate directories for test and prod.
- `terraform test` with assertions; add lint and security scanning in CI.
- Safe teams: PR, CI plan, review the plan, remote locked state, no laptop applies to production.
:::

:::try Your turn
Add a variable validation that rejects `replicas` above 10, then write a `terraform test` using `expect_failures` to prove it.
:::

:::quiz
? Why apply a saved plan file?
+ It guarantees you apply exactly the changes that were reviewed
- It is faster only
- It skips state
- It avoids providers
! Prevents plan/apply drift in between.
? What do workspaces share?
+ The same configuration and backend, with separate state per workspace
- Everything including state
- Nothing
- Only variables
! Be careful using them as production isolation.
? What should reviewers read on a Terraform pull request?
+ The plan output as well as the code
- Only the code
- Only the state
- Nothing
! The plan shows real consequences, such as replacements.
:::
