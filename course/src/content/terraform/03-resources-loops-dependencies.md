---
track: terraform
title: Resources, loops and dependencies
short: Loops, dependencies
sub: Create many similar things with count and for_each, and understand how Terraform orders its work.
---

:::goals
- create multiple resources with `count` and `for_each`
- explain implicit and explicit dependencies
- use `lifecycle` rules
- read the dependency graph
:::

## count and for_each

To create several similar resources use a **meta-argument**.

| | `count = N` | `for_each = set or map` |
|---|---|---|
| Identity | by position: `res[0]`, `res[1]` | by key: `res["ev01"]` |
| Remove from the middle | **shifts** everything after it (dangerous) | removes only that key |
| Best for | N identical copies, on/off switch (`count = var.enabled ? 1 : 0`) | named, distinct things |

```run
mkdir -p ~/lab/tf3 && cd ~/lab/tf3
cat > main.tf <<'EOF'
variable "servers" {
  type    = set(string)
  default = ["ev01", "ev02", "sql01"]
}

resource "terraform_data" "server" {
  for_each = var.servers
  input    = "${each.key}.corp.local"
}

output "hosts" {
  value = { for k, v in terraform_data.server : k => v.output }
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "Plan:|Apply complete"
terraform output hosts
terraform state list
```

Each instance is addressed by its key, for example `terraform_data.server["ev02"]`. Now remove the middle server from the list, which is the case where `count` goes wrong:

```run
cd ~/lab/tf3
terraform plan -var 'servers=["ev01","sql01"]' | grep -E "^  # |Plan:"
```

Only `ev02` is destroyed; the others stay untouched, because their identity is the key. With `count` and a list, removing the second item would rename the third to index 1, and Terraform would destroy and recreate it. **Prefer `for_each` for anything with an identity.**

### count as a switch

```run
cd ~/lab/tf3
cat > flag.tf <<'EOF'
variable "enable_monitoring" {
  type    = bool
  default = false
}

resource "terraform_data" "monitoring" {
  count = var.enable_monitoring ? 1 : 0
  input = "agent installed"
}
EOF
terraform plan | grep -E "Plan:|No changes"
terraform plan -var enable_monitoring=true | grep -E "Plan:|# terraform_data.monitoring"
```

## Dependencies

Terraform builds a **graph** of resources and creates them in the right order, in parallel where it can. Most dependencies are **implicit**: if resource B references resource A (`A.attribute`), B waits for A. That is how a VM references its subnet, and the subnet its network.

```run
cd ~/lab/tf3
cat > deps.tf <<'EOF'
resource "terraform_data" "network" {
  input = "10.0.0.0/16"
}

resource "terraform_data" "subnet" {
  input = "subnet in ${terraform_data.network.output}"      # implicit dependency
}

resource "terraform_data" "firewall" {
  input      = "rules"
  depends_on = [terraform_data.subnet]                      # explicit dependency
}
EOF
terraform graph | grep -E '"terraform_data\.(subnet|firewall|network)' | grep -- '->' | sed 's/\[root\] //g; s/ (expand)//g'
```

Edges point from a thing **to what it depends on**: `subnet -> network`, `firewall -> subnet`. Use `depends_on` only when the dependency is real but invisible in the code (for example, a policy that must exist before an application, without referencing any of its attributes).

## Lifecycle rules

The `lifecycle` block tunes how Terraform treats a resource:

| Setting | Effect |
|---|---|
| `prevent_destroy = true` | any plan that would destroy it **fails**; guard for databases |
| `create_before_destroy = true` | on replacement, build the new one first (zero downtime) |
| `ignore_changes = [attr]` | ignore drift on that attribute (for example tags set by another tool) |
| `replace_triggered_by = [...]` | replace when another resource changes |

```run
cd ~/lab/tf3
cat > protect.tf <<'EOF'
resource "terraform_data" "database" {
  input = "prod-db"
  lifecycle {
    prevent_destroy = true
  }
}
EOF
terraform apply -auto-approve | grep -E "Apply complete"
terraform destroy -auto-approve 2>&1 | grep -E "Error: Instance cannot be destroyed|prevent_destroy" | head -2
```

The guard stopped the destroy. To intentionally remove it, first delete the `prevent_destroy` line, apply, then destroy.

```run
cd ~/lab/tf3
rm protect.tf
terraform apply -auto-approve | grep -E "Apply complete"
terraform destroy -auto-approve | grep -E "Destroy complete"
```

## Targeting and replacing

- `terraform apply -replace=ADDRESS`: force a rebuild of one resource (the replacement for the old `taint`).
- `terraform apply -target=ADDRESS`: limit the run to one resource and its dependencies. An emergency tool, **not** a normal workflow (it skips parts of the graph).

```run
cd ~/lab/tf3
terraform apply -auto-approve > /dev/null
terraform plan -replace='terraform_data.server["ev01"]' | grep -E "# terraform_data.server\[\"ev01\"\] will be replaced|Plan:|replace"
terraform destroy -auto-approve > /dev/null
```

:::recap
- `count` for identical copies or a switch; `for_each` for named things (stable identity).
- References create implicit dependencies; `depends_on` for hidden ones.
- `lifecycle`: `prevent_destroy`, `create_before_destroy`, `ignore_changes`.
- `-replace` rebuilds one resource; `-target` is for emergencies only.
:::

:::try Your turn
Turn the three-server example into a map where each server has a `size`, loop over it with `for_each`, and output a map of name to size.
:::

:::quiz
? Why prefer `for_each` over `count` for named servers?
+ Removing one item does not shift or recreate the others
- It is faster
- count is deprecated
- for_each needs no state
! Keys give stable identities.
? What creates an implicit dependency?
+ One resource referring to another's attribute
- Naming them alphabetically
- Putting them in one file
- Using `terraform fmt`
! Terraform reads references to build its graph.
? What does `prevent_destroy = true` do?
+ Makes any plan that would destroy the resource fail
- Prevents applies
- Encrypts the resource
- Hides it from state
! A safety net for stateful resources.
:::
