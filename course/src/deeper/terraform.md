=== terraform/01
## A worked solution and common mistakes

```run
mkdir -p ~/lab/tf1b && cd ~/lab/tf1b
cat > main.tf <<'EOF'
resource "terraform_data" "first" {
  input = "alpha"
}
resource "terraform_data" "second" {
  input = "derived from ${terraform_data.first.output}"
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "Apply complete"
sed -i 's/"alpha"/"beta"/' main.tf
echo "--- plan after changing the first input:"
terraform plan | grep -E "^  # |Plan:"
terraform apply -auto-approve | grep -E "Apply complete"
terraform destroy -auto-approve | grep -E "Destroy complete"
```

The plan shows **both** resources changing: the first directly, the second because its input depends on the first's output (`known after apply`). That ripple effect is the dependency graph at work. Read plans for the unexpected second-order changes.

:::warn Common mistakes
- **Applying without reading the plan,** especially lines with `-/+` (replace) or `-` (destroy).
- **Editing resources in the cloud console,** causing drift Terraform later "fixes" by reverting.
- **Committing `terraform.tfstate` or `.terraform/`** to Git.
- **Running `terraform apply` from several laptops** with local state.
- **Hard-coding values** (AMI IDs, passwords) that should be variables or data sources.
- **Forgetting `terraform init`** after adding a provider or module.
:::

=== terraform/02
## A worked solution and common mistakes

```run
cd ~/lab/tf2
terraform destroy -auto-approve > /dev/null 2>&1
printf 'environment = "prod"\nserver_names = ["ev01", "ev02"]\n' > prod.tfvars
rm -f terraform.tfvars
terraform apply -auto-approve -var-file=prod.tfvars | grep -E "summary"
echo "--- first three /24 subnets of 192.168.0.0/16:"
terraform console <<'EOF'
[for i in range(3) : cidrsubnet("192.168.0.0/16", 8, i)]
EOF
terraform destroy -auto-approve -var-file=prod.tfvars | grep "Destroy complete"
```

`cidrsubnet(prefix, newbits, netnum)` adds `newbits` to the prefix length (16 + 8 = /24) and picks the `netnum`-th subnet. It is how real VPC subnet plans are generated.

:::warn Common mistakes
- **Committing `.tfvars` files that contain secrets.** Keep secrets in a vault or environment variables (`TF_VAR_name`).
- **Forgetting the type** on variables, so a typo becomes a silent string.
- **Over-using `count` and conditionals** until the code is unreadable; use `for_each` and locals.
- **Not validating inputs** (`validation {}` blocks catch mistakes at plan time).
- **Expecting sensitive values to be encrypted.** They are hidden from output only; state holds them.
:::

=== terraform/03
## A worked solution and common mistakes

```run
mkdir -p ~/lab/tf3b && cd ~/lab/tf3b
cat > main.tf <<'EOF'
variable "servers" {
  type = map(object({ size = string }))
  default = {
    ev01  = { size = "large" }
    ev02  = { size = "small" }
    sql01 = { size = "xlarge" }
  }
}

resource "terraform_data" "server" {
  for_each = var.servers
  input    = { name = each.key, size = each.value.size }
}

output "sizes" {
  value = { for name, s in terraform_data.server : name => s.output.size }
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "Apply complete"
terraform output sizes
echo "--- change one size: only that server is touched"
sed -i 's/ev02  = { size = "small" }/ev02  = { size = "medium" }/' main.tf
terraform plan | grep -E "^  # |Plan:"
terraform destroy -auto-approve | grep "Destroy complete"
```

With `for_each` over a map, only the changed key shows in the plan.

:::warn Common mistakes
- **`count` over a list of named things,** then removing one in the middle and recreating the rest.
- **`for_each` with values that are only known after apply** (`Invalid for_each argument`). Use keys known at plan time.
- **Using `depends_on` as a habit.** It hides the real dependency and slows plans; reference attributes instead.
- **Forgetting `prevent_destroy` on stateful resources.**
- **Using `-target` as routine,** leaving the rest of the configuration unapplied.
:::

=== terraform/04
## A worked solution and common mistakes

```run
cd ~/lab/tf4
echo "--- rename WITHOUT a moved block would plan a destroy and create (shown earlier in this lesson)."
echo "--- with a moved block the plan is a pure state move. A suitable .gitignore:"
cat > .gitignore <<'EOF'
# Terraform
.terraform/
*.tfstate
*.tfstate.*
crash.log
*.tfplan
# variable files that may contain secrets
*.tfvars
*.tfvars.json
# keep the dependency lock file (do NOT ignore .terraform.lock.hcl)
EOF
cat .gitignore | grep -v '^#' | grep .
git check-ignore -v terraform.tfstate .terraform.lock.hcl 2>/dev/null | head -2 || true
```

Keep **`.terraform.lock.hcl`** in Git (it pins provider versions and checksums for everyone); ignore state, plans and secret variable files.

:::warn Common mistakes
- **Editing `terraform.tfstate` by hand.** Use `terraform state` commands.
- **Forgetting that renaming a resource is a destroy and create** unless you add `moved`.
- **`terraform state rm`** and then being surprised the real resource still exists (and may be created twice).
- **No remote state locking,** so two applies run at once.
- **Importing existing resources and forgetting to write matching code.**
:::

=== terraform/05
## A worked solution and common mistakes

```run
cd ~/lab/tf5
cat > modules/ev_server/tags.tf <<'EOF'
variable "tags" {
  type    = map(string)
  default = {}
}
locals {
  all_tags = merge({ Managed = "terraform", Name = var.name }, var.tags)
}
output "tags" {
  value = local.all_tags
}
EOF
cat > envs.tf <<'EOF'
module "test_env" {
  source      = "./modules/ev_server"
  name        = "ev-test"
  environment = "test"
  tags        = { Env = "test", Owner = "qa" }
}
module "prod_env" {
  source      = "./modules/ev_server"
  name        = "ev-prod"
  environment = "prod"
  tags        = { Env = "prod", Owner = "ops", Name = "overridden" }
}
output "merged_tags" {
  value = { test = module.test_env.tags, prod = module.prod_env.tags }
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "Apply complete"
terraform output -json merged_tags | python3 -m json.tool | head -14
terraform destroy -auto-approve | grep "Destroy complete"
```

`merge()` lets later maps override earlier ones: in `prod_env` the caller's `Name = "overridden"` replaced the module default.

:::warn Common mistakes
- **Modules that do too much** (a "platform" module with 80 variables). Prefer small composable ones.
- **Hidden provider settings inside modules,** so callers cannot control region or credentials.
- **Unpinned module versions** (`ref=main`).
- **Output explosion:** exposing every attribute instead of a deliberate interface.
- **Copy-pasting instead of using a module** (or the reverse: a module for something used once).
:::

=== terraform/06
## A worked solution and common mistakes

```run
cd ~/lab/tf6
terraform destroy -auto-approve > /dev/null 2>&1
cat > main.tf <<'EOF'
variable "replicas" {
  type    = number
  default = 2

  validation {
    condition     = var.replicas <= 10
    error_message = "replicas must be 10 or fewer."
  }
}

resource "terraform_data" "worker" {
  count = var.replicas
  input = "worker-${count.index}"
}
EOF
cat > tests.tftest.hcl <<'EOF'
run "accepts_ten" {
  command = plan
  variables { replicas = 10 }
  assert {
    condition     = length(terraform_data.worker) == 10
    error_message = "ten replicas should be allowed"
  }
}

run "rejects_eleven" {
  command = plan
  variables { replicas = 11 }
  expect_failures = [var.replicas]
}
EOF
terraform test | grep -E "pass|fail|Success"
```

`expect_failures` turns the validation error into the **expected** outcome, so the test passes only when the guard really rejects bad input. Test the guard rails, not only the happy path.

:::warn Common mistakes
- **Tests that need real cloud accounts** and run slowly or cost money; test logic with `command = plan` and mocks where possible.
- **No CI step for `fmt -check`, `validate` and `test`.**
- **Applying a plan other than the reviewed one.** Save the plan with `-out` and apply that file.
- **Using workspaces to separate production from test,** then applying to the wrong one. Prefer separate directories/state and credentials.
- **Skipping policy and security scanning** (tflint, checkov, trivy) in the pipeline.
:::

=== terraform/07
## A worked answer and common mistakes

One reasonable layering for an Enterprise Vault environment, with the **outputs each layer publishes** for the next:

| Layer (own state) | Contains | Publishes (outputs) |
|---|---|---|
| 1. **network** | VPC/VNet, subnets, route tables, security groups, DNS zone | `vpc_id`, `subnet_ids`, `sg_ids`, `dns_zone_id` |
| 2. **identity and secrets** | roles, managed identities, key vault / secrets manager | `role_arns`, `secret_ids` |
| 3. **data** | SQL servers/managed databases, backup storage account/bucket | `sql_endpoint`, `backup_bucket`, `db_sg_id` |
| 4. **compute** | EV servers (VMs) and load balancer | `ev_private_ips`, `lb_dns_name` |
| 5. **dns and edge** | records pointing at the load balancer, certificates | `public_hostnames` |

Each layer reads the previous layers' outputs with `terraform_remote_state` (or data sources), exactly as the lesson demonstrated. Layers change at different speeds (the network rarely, compute often) and have different owners, so separate states reduce blast radius and speed up plans.

:::warn Common mistakes
- **One state for everything,** so every change plans (and risks) the whole estate.
- **Circular layering** (network depends on compute). Keep dependencies flowing one way.
- **Putting secrets in outputs.** Output identifiers, not passwords.
- **Allowing wide permissions to the state** (it contains sensitive attributes).
- **No tagging standard,** so cost and ownership are unknowable.
:::
