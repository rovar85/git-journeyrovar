---
track: terraform
title: Modules
short: Modules
sub: Package and reuse infrastructure patterns with inputs and outputs.
---

:::goals
- explain what a module is and when to write one
- call a local module and pass inputs
- return outputs from a module
- describe registry modules, versioning and good module design
:::

## Why modules

Every Terraform folder is already a module (the **root module**). A **child module** is a folder of `.tf` files that you call from another configuration, like a function: **inputs** (variables) in, **outputs** out. Use modules to avoid copy-pasting the same pattern ("a server with a disk, a security group and a DNS record") in every environment, and to enforce company standards in one place.

## A local module

```run
mkdir -p ~/lab/tf5/modules/ev_server && cd ~/lab/tf5
cat > modules/ev_server/variables.tf <<'EOF'
variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "size" {
  type    = string
  default = "small"
}
EOF
cat > modules/ev_server/main.tf <<'EOF'
locals {
  fqdn = "${var.name}.${var.environment}.corp.local"
}

resource "terraform_data" "server" {
  input = {
    fqdn = local.fqdn
    size = var.size
  }
}

resource "terraform_data" "dns" {
  input = "A record for ${local.fqdn}"
}
EOF
cat > modules/ev_server/outputs.tf <<'EOF'
output "fqdn" {
  description = "The server's full name"
  value       = local.fqdn
}

output "size" {
  value = var.size
}
EOF
cat > main.tf <<'EOF'
module "ev01" {
  source      = "./modules/ev_server"
  name        = "ev01"
  environment = "test"
}

module "sql01" {
  source      = "./modules/ev_server"
  name        = "sql01"
  environment = "test"
  size        = "large"
}

output "servers" {
  value = {
    ev01  = module.ev01.fqdn
    sql01 = "${module.sql01.fqdn} (${module.sql01.size})"
  }
}
EOF
terraform init 2>&1 | grep -E "Initializing modules|successfully"
terraform apply -auto-approve | grep -E "Plan:|Apply complete"
terraform output servers
terraform state list
```

The module is called twice with different inputs, producing two independent sets of resources (`module.ev01...` and `module.sql01...`). To reach inside, only **outputs** are visible: `module.sql01.fqdn`. Everything else is private. That boundary lets you change a module's internals without breaking callers.

## Module with for_each

Modules support `for_each` and `count`, so one block can build a whole fleet:

```run
cd ~/lab/tf5
cat > fleet.tf <<'EOF'
variable "fleet" {
  type = map(object({ size = string }))
  default = {
    ev02 = { size = "small" }
    ev03 = { size = "medium" }
  }
}

module "fleet" {
  for_each    = var.fleet
  source      = "./modules/ev_server"
  name        = each.key
  environment = "test"
  size        = each.value.size
}

output "fleet_names" {
  value = [for k, m in module.fleet : m.fqdn]
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "Plan:|Apply complete"
terraform output fleet_names
```

## Registry and versions

In real projects you often use modules published on the Terraform Registry or in your company's private registry:

```hcl:vpc.tf (Example, not run here)
module "network" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"            # pin the version!

  name = "ev-prod"
  cidr = "10.0.0.0/16"
  azs  = ["eu-west-2a", "eu-west-2b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
}
```

A module can also come from Git: `source = "git::https://github.com/acme/tf-modules.git//ev_server?ref=v1.2.0"` (always pin a tag). **Pin versions** so that a module update never changes your infrastructure unexpectedly.

## Good module design

| Do | Why |
|---|---|
| Keep modules small and focused ("a server", "a network") | easier to understand and reuse |
| Give every variable a `type` and `description`; validate inputs | self-documenting, fails early |
| Expose only the outputs callers need | smaller interface to maintain |
| Use sensible defaults; keep secrets as inputs, never hard-coded | safe and flexible |
| Version modules with tags; keep a changelog | consumers upgrade deliberately |
| Avoid provider configuration inside modules | the caller decides credentials and region |
| Do not over-abstract: copy-paste twice before building a module | premature modules are rigid |

## Environments

A typical layout puts reusable modules in one place and thin environment folders on top, each with its own state:

```text
infra/
├── modules/
│   ├── network/
│   └── ev_server/
├── envs/
│   ├── test/    main.tf  test.tfvars  backend.tf
│   └── prod/    main.tf  prod.tfvars  backend.tf
```

Test and prod call the **same modules** with different inputs, which is the core benefit.

```run
cd ~/lab/tf5
terraform destroy -auto-approve | grep -E "Destroy complete"
```

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- A module is a folder of `.tf` files used like a function: variables in, outputs out.
- `module "x" { source = "./path" ... }`; only outputs are visible from outside. `for_each` works on modules.
- Pin versions of registry/Git modules. Keep modules small, typed and documented.
- Environments reuse modules with different inputs and separate state.
:::

:::try Your turn
Extend the module with a `tags` map variable and output, call it from two environments, and print the merged tags.
:::

:::quiz
? How does a caller read a value from inside a module?
+ Through the module's declared outputs (`module.name.output`)
- By referencing its resources directly
- By reading its state file
- It cannot
! Modules hide internals behind outputs.
? Why pin a module's version?
+ So upgrades are deliberate and never change infrastructure unexpectedly
- To make plans faster
- Modules require it for syntax
- To hide the source
! Unpinned modules can change under you.
? Which is a good module design habit?
- Hard-code region and credentials inside it
+ Typed, documented variables and a small set of outputs
- Expose every attribute as an output
- Avoid defaults
! Small clear interfaces age well.
:::
