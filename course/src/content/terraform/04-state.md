---
track: terraform
title: State: what Terraform remembers
short: State
sub: How the state file works, drift, import, remote backends and why state needs protecting.
---

:::goals
- explain what the state file stores and why it exists
- inspect state with `terraform state` and `terraform show`
- recognise drift and what a plan does about it
- explain remote state, locking and state security
:::

## Why state exists

Terraform cannot guess which cloud resources belong to your configuration: it keeps a **state file** (`terraform.tfstate`) mapping each resource in your code to the real object (its ID, attributes). On each plan it **refreshes** (reads the real attributes), compares to your code, and shows the difference.

```run
mkdir -p ~/lab/tf4 && cd ~/lab/tf4
cat > main.tf <<'EOF'
resource "terraform_data" "ev" {
  input = "EV01"
  provisioner "local-exec" {
    command = "echo hello > ev.txt"
  }
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep "Apply complete"
ls -A | grep -v '^\.terraform'
python3 - <<'PY'
import json
s = json.load(open("terraform.tfstate"))
print("state format version:", s["version"])
print("resources recorded  :", [(r["type"], r["name"]) for r in s["resources"]])
print("keys at top level   :", sorted(s.keys()))
PY
```

It is a plain JSON file. Read it, but **never edit it by hand**. Use `terraform state` commands instead:

| Command | Purpose |
|---|---|
| `terraform state list` | list tracked resources |
| `terraform state show ADDR` | attributes of one |
| `terraform state mv A B` | rename or move a resource without destroying it (after refactoring code) |
| `terraform state rm ADDR` | stop tracking (does **not** destroy the real thing) |
| `terraform show` | the whole state in readable form |
| `terraform import` / `import` block | adopt an existing real resource into state |

```run
cd ~/lab/tf4
terraform state list
terraform state show terraform_data.ev | grep -E "input|output" | sed 's/  */ /g'
```

## Refactoring without rebuilding: moved blocks

If you rename a resource in code, Terraform thinks "old one deleted, new one added" and would destroy and recreate it. A `moved` block (or `state mv`) tells it they are the same thing:

```run
cd ~/lab/tf4
sed -i 's/"ev"/"ev_server"/' main.tf
echo "--- after renaming without telling Terraform:"
terraform plan | grep -E "Plan:|will be (destroyed|created)"
cat >> main.tf <<'EOF'

moved {
  from = terraform_data.ev
  to   = terraform_data.ev_server
}
EOF
echo "--- with a moved block:"
terraform plan | grep -E "Plan:|has moved|No changes"
terraform apply -auto-approve | grep -E "Apply complete"
```

## Drift

**Drift** is when someone changes the real infrastructure outside Terraform (a manual console edit or a script). Terraform detects it at the next plan, because it compares real attributes to the config.

```run
cd ~/lab/tf4
cat > drift.tf <<'EOF'
variable "msg" {
  default = "expected"
}
resource "terraform_data" "note" {
  input = var.msg
  provisioner "local-exec" {
    command = "echo ${var.msg} > note.txt"
  }
}
EOF
terraform apply -auto-approve | grep "Apply complete"
echo "someone edited the real thing by hand" > note.txt
terraform plan | grep -E "No changes|Plan:"
```

Here the plan says **no changes**: Terraform can only see what the provider reports from the API, and a file changed behind a `local-exec` is invisible to it. For real cloud resources (a security group rule added in the console), the provider reads the live settings and a plan would show the drift and propose reverting it. Lesson: scheduled `terraform plan` runs in CI are a drift detector, and the ultimate fix is to make Terraform the only way changes are made.

```run
cd ~/lab/tf4
rm drift.tf note.txt
terraform apply -auto-approve | grep -E "Apply complete"
```

## Remote state and locking

The default **local backend** keeps `terraform.tfstate` on your disk. That breaks down in a team: two people with two state files will conflict and duplicate or destroy each other's work. Teams use a **remote backend**: shared storage with **locking**, so only one apply runs at a time.

```hcl:backend.tf (Example, not run here)
terraform {
  backend "s3" {
    bucket         = "acme-terraform-state"
    key            = "ev/prod/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "terraform-locks"   # lock table
    encrypt        = true
  }
}
```

Other backends: Azure Storage, Google Cloud Storage, Terraform Cloud/HCP, GitLab, Consul. Run `terraform init` again after adding or changing a backend (`-migrate-state` copies existing state).

## State security

State contains **everything**, including secrets such as generated passwords and keys, in plain text. Therefore:

- keep state in an **encrypted** remote backend with strict access control and versioning
- **never commit** `terraform.tfstate` to Git (put `*.tfstate*` and `.terraform/` in `.gitignore`)
- avoid putting secrets in Terraform at all where possible: reference a secrets manager
- split large estates into **several smaller states** (per environment and per component) to limit blast radius and speed up plans

```run
cd ~/lab/tf4
printf '.terraform/\n*.tfstate\n*.tfstate.*\n*.tfvars\ncrash.log\n' > .gitignore
cat .gitignore
terraform destroy -auto-approve | grep "Destroy complete"
```

:::recap
- State maps code to real objects. It is JSON; do not hand-edit it.
- `terraform state list/show/mv/rm`; `moved` blocks refactor safely; `import` adopts existing resources.
- Drift is detected by plan (for what providers can observe). Remote backends with locking are required for teams.
- State holds secrets: encrypt it, restrict it, never commit it.
:::

:::try Your turn
Rename a resource in your code with and without a `moved` block and compare the plans. Then create a `.gitignore` suitable for a Terraform repository.
:::

:::quiz
? Why do teams use remote state with locking?
+ To share one source of truth and avoid two applies colliding
- To make plans faster
- Because local state is deprecated
- To hide variables
! Locking prevents concurrent modifications.
? What does `terraform state rm` do?
+ Stops tracking a resource without destroying the real object
- Destroys it
- Deletes the file
- Renames it
! Use carefully; the resource becomes unmanaged.
? Why must you not commit `terraform.tfstate`?
+ It can contain secrets in plain text
- It is too large always
- Git cannot store JSON
- It is regenerated
! Treat state as sensitive data.
:::
