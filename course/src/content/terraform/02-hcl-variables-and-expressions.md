---
track: terraform
title: The HCL language: variables, locals, outputs and functions
short: HCL language
sub: Make configurations flexible with variables, expressions, conditions and built-in functions.
---

:::goals
- declare variables with types, defaults and validation
- use locals, outputs and `terraform.tfvars`
- write expressions: conditionals, `for`, string templates
- try built-in functions in `terraform console`
:::

## Blocks, arguments and expressions

HCL is built from **blocks** (`resource "type" "name" { ... }`), **arguments** (`name = value`) and **expressions** (anything that produces a value). Comments use `#` or `//` and `/* */`. Values have types: `string`, `number`, `bool`, `list(...)`, `map(...)`, `set(...)`, `object({...})`.

## Variables, locals, outputs

| Block | Role | Referenced as |
|---|---|---|
| `variable "x"` | an **input** to the configuration | `var.x` |
| `locals { y = ... }` | named intermediate values | `local.y` |
| `output "z"` | a **result** shown after apply and readable by other configs | after apply: `terraform output z` |

```run
mkdir -p ~/lab/tf2 && cd ~/lab/tf2
cat > variables.tf <<'EOF'
variable "environment" {
  type        = string
  description = "Which environment this is"
  default     = "test"

  validation {
    condition     = contains(["test", "prod"], var.environment)
    error_message = "environment must be test or prod."
  }
}

variable "server_names" {
  type    = list(string)
  default = ["ev01", "sql01"]
}

variable "db_password" {
  type      = string
  sensitive = true          # hidden in plan and output
  default   = "demo-only-not-a-real-secret"
}
EOF
cat > main.tf <<'EOF'
locals {
  prefix = "${var.environment}-evault"
  tags   = {
    Env     = var.environment
    Owner   = "ops-team"
    Managed = "terraform"
  }
  instance_size = var.environment == "prod" ? "large" : "small"
}

resource "terraform_data" "config" {
  input = {
    name  = local.prefix
    size  = local.instance_size
    tags  = local.tags
    count = length(var.server_names)
  }
}

output "summary" {
  value = "${local.prefix}: ${length(var.server_names)} servers, size ${local.instance_size}"
}

output "db_password" {
  value     = var.db_password
  sensitive = true
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "Apply complete|summary|db_password"
```

Notice `db_password = <sensitive>`: Terraform hides sensitive values in its output. **But** they are still stored in plain text in the state file, which is why state must be protected (a later lesson).

## Giving variables values

Several ways, from lowest to highest priority: the `default`, `TF_VAR_name` environment variables, `terraform.tfvars`, `*.auto.tfvars`, then `-var-file=prod.tfvars` and `-var 'name=value'` on the command line (later ones win).

```run
cd ~/lab/tf2
terraform apply -auto-approve -var 'environment=prod' | grep -E "summary"
printf 'environment = "test"\nserver_names = ["ev01", "ev02", "sql01"]\n' > terraform.tfvars
terraform apply -auto-approve | grep -E "summary"
TF_VAR_environment=prod terraform apply -auto-approve | grep -E "summary"
```

The command line (`-var`) beat the `tfvars` file, but the `TF_VAR_` environment variable did **not** (the last line still says `test`), because the file has higher priority than the environment. A standard layout is one `*.tfvars` file per environment (`test.tfvars`, `prod.tfvars`), chosen with `-var-file`.

### Validation catches mistakes early

```run
cd ~/lab/tf2
terraform plan -var 'environment=staging' 2>&1 | grep -E "Error|environment must be"
```

## Expressions

- **Conditional:** `condition ? a : b`
- **String template:** `"web-${var.environment}-01"`
- **`for` expression:** build a new list or map from another
- **Splat:** `aws_instance.web[*].id` gets an attribute from every instance
- **References:** `resource_type.name.attribute`, `var.x`, `local.x`, `module.m.output`

## Try functions in the console

`terraform console` is an interactive calculator for expressions, great for learning functions without changing anything. We feed it one line at a time:

```run
cd ~/lab/tf2
terraform console <<'EOF'
upper("ev01")
length(var.server_names)
[for s in var.server_names : upper(s)]
{ for s in var.server_names : s => "${s}.corp.local" }
join(",", var.server_names)
cidrsubnet("10.0.0.0/16", 8, 3)
format("%s-%03d", "ev", 7)
lookup({ a = 1, b = 2 }, "c", 99)
merge({ a = 1 }, { b = 2 })
contains(var.server_names, "sql01")
EOF
```

`cidrsubnet("10.0.0.0/16", 8, 3)` is `10.0.3.0/24`: carve the third /24 out of a /16. It uses what you learned in the Networking track, and it is how real VPC subnets are generated. Useful function families: **string** (`upper`, `format`, `join`, `split`, `replace`), **collection** (`length`, `concat`, `merge`, `lookup`, `keys`, `values`), **numeric**, **encoding** (`jsonencode`, `yamlencode`, `base64encode`), **filesystem** (`file`, `templatefile`), **network** (`cidrsubnet`, `cidrhost`).

## Templates

`templatefile()` renders a text file with variables: perfect for configuration files and cloud-init scripts.

```run
cd ~/lab/tf2
cat > nginx.conf.tftpl <<'EOF'
# generated for ${env}
%{ for s in servers ~}
upstream ${s} { server ${s}.corp.local:8080; }
%{ endfor ~}
EOF
terraform console <<'EOF'
templatefile("nginx.conf.tftpl", { env = "test", servers = ["ev01", "ev02"] })
EOF
```

## Formatting and validation

```run
cd ~/lab/tf2
printf 'locals {\n    messy   =  "spacing"\n}\n' > messy.tf
terraform fmt -check -diff messy.tf | grep -E '^[+-] '
terraform fmt messy.tf
terraform validate
rm messy.tf
```

`terraform fmt` rewrites files into the standard style (run it in CI); `terraform validate` checks syntax and references without calling any API.

```run
cd ~/lab/tf2
terraform destroy -auto-approve | grep -E "Destroy complete"
```

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- `variable` (input), `locals` (internal names), `output` (result). Types and `validation` catch errors early.
- Value precedence: default < `TF_VAR_` < tfvars < `*.auto.tfvars` < `-var-file` / `-var`.
- `sensitive` hides values from output but **not** from state.
- `terraform console` explores functions; `fmt` and `validate` keep code tidy and correct.
:::

:::try Your turn
Add a `prod.tfvars` file and apply with `-var-file=prod.tfvars`. In the console, compute the first three `/24` subnets of `192.168.0.0/16`.
:::

:::quiz
? Which has the highest precedence for a variable value?
- default
- terraform.tfvars
+ `-var` on the command line
- locals
! Command-line `-var` wins.
? Does `sensitive = true` encrypt a value in the state file?
- Yes
+ No, it only hides it from CLI output; state stays plain text
- Only for strings
- Only in modules
! Protect the state itself.
? What does `terraform validate` do?
+ Checks syntax and internal consistency without calling any API
- Applies changes
- Formats code
- Deletes state
! It is fast and safe for CI.
:::
