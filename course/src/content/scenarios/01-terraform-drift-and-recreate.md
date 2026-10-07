---
track: scenarios
title: "S1: A manual change caused Terraform drift and apply wants to recreate the resource. How do you reconcile without downtime?"
short: S1 Terraform drift and recreate
sub: How state, code and reality relate, why a plan says "must be replaced", the safe options (revert, adopt, ignore, create-before-destroy), all shown with real Terraform output, then the answer an interviewer expects.
---

:::goals
- explain the **three-way model**: code, state, reality, and what **refresh** does
- read a plan and find **why** something is replaced (forces replacement, in-place update, no-op)
- choose the right **reconciliation direction** instead of blindly running apply
- use `-refresh-only`, `import`, `lifecycle` rules, `-replace` and **create-before-destroy** correctly
- structure a calm, safe answer for production, and answer the follow-ups
:::

:::note Provenance
The lab has **no AWS account**, so a real provider cannot be refreshed here. Terraform's built-in `terraform_data` resource behaves like any resource in the plan engine, so the **plan, replacement, lifecycle and import mechanics are real output**. Where an AWS provider would **detect** drift by calling the API during refresh, we **simulate that discovery by editing the state file** and say so. AWS attribute names are **Example, not run here**.
:::

## 1. The concept you need first: three things, not two

| Thing | Where it lives | Who changes it |
|---|---|---|
| **Code** (desired) | `.tf` files in Git | engineers, via pull request |
| **State** (what Terraform believes exists) | the state file or remote backend | Terraform itself |
| **Reality** (what actually exists) | the AWS account | anyone with console or CLI access, **including a person at 02:00** |

`terraform plan` does this: **(1) refresh**: read reality through the provider and update the in-memory state; **(2) compare** refreshed state with the **code**; **(3) show the actions** needed to make reality match code.

So **drift** is when reality changed outside Terraform. Terraform's default answer is **"put reality back to what the code says"**, which is not always what you want, and for some attributes the only way to do it is **replacement**.

## 2. Why a plan says "must be replaced"

Every resource attribute is one of two kinds:

- **updatable in place**: for example tags, instance type (with a stop), allocated storage.
- **immutable ("forces replacement")**: for example the **availability zone** of an instance or volume, the **name** of many resources, the **engine** or **subnet group** of a database, the **KMS key** on some resources. The plan marks these with `# forces replacement`.

If someone changed an immutable attribute by hand (or the provider shows a **different value** from the code for one), the only way Terraform can reconcile to the code is **destroy and create**. For a **production database or load balancer, that is downtime or data loss**. The skill being tested is: **do not run apply; understand the direction of the fix first.**

## 3. Reproduce it

We use `terraform_data`, which has a `triggers_replace` argument: change it and Terraform **must replace** the resource, exactly like an immutable AWS attribute. A `local-exec` writes a log so you can see the **order** of events.

```run
mkdir -p ~/s1 && cd ~/s1
cat > main.tf <<'EOF'
variable "zone" { default = "eu-west-1a" }

resource "terraform_data" "db" {
  triggers_replace = [var.zone]            # stands in for an immutable attribute such as the availability zone
  provisioner "local-exec" {
    command = "echo \"$(date +%T) CREATE db in ${var.zone}\" >> events.log"
  }
}
EOF
terraform init -input=false > /dev/null
terraform apply -auto-approve -input=false -no-color | grep -E "Apply complete|Creation complete"
cat events.log
```

Now the **manual change**. With a real provider, `terraform plan` would call the AWS API, see that the resource is now in zone `b`, and record that in the refreshed state. Here we **simulate exactly that discovery** by editing the state value:

```run
cd ~/s1
cp terraform.tfstate before.tfstate
sed -i 's/"eu-west-1a"/"eu-west-1b"/' terraform.tfstate       # reality now differs from the code
terraform plan -input=false -no-color | sed -n '/Terraform will perform/,$p' | head -24
```

**What you see:** `must be replaced`, with the changed attribute marked. If you ran `terraform apply` now, it would **destroy the database and create a new one**. Stop here, **read** the plan, and decide.

## 4. The decision: which direction do you reconcile?

| Situation | Direction | Action |
|---|---|---|
| The manual change was **wrong or temporary** (an experiment, a mistake) | **reality to code** | revert the change in AWS, or if it is mutable let Terraform fix it in place |
| The manual change was **right** (an emergency fix that should stay) | **code to reality** | **edit the code** to match, so the plan becomes **no changes**, then review it as a normal change |
| The attribute is **managed elsewhere** (autoscaling changes desired capacity, an operator edits tags) | **ignore it** | `lifecycle { ignore_changes = [...] }` |
| The resource **must** change and replacement is unavoidable | **replace safely** | create the new one first, move traffic, then remove the old one |
| The resource **exists but is not in state** | **adopt it** | `import` block (or `terraform import`), then write matching code |

### Option A: code follows reality (the change was right)

```run
cd ~/s1
terraform plan -input=false -no-color -var zone=eu-west-1b | tail -4
```

**What you see:** **`No changes`**. Setting the code to match what exists makes the plan empty, so **nothing is touched** and there is **no downtime**. The pull request that changes `zone` is the **record** of why.

### Option B: reality follows code (the change was wrong)

With a real provider you would revert the console change (for a mutable attribute, apply fixes it in place). Here we put the state back as it was, which is what reverting reality would do:

```run
cd ~/s1
cp before.tfstate terraform.tfstate
terraform plan -input=false -no-color | tail -3
```

**What you see:** back to **`No changes`**.

### Option C: ignore attributes managed outside Terraform

```run
cd ~/s1
sed -i 's/"eu-west-1a"/"eu-west-1b"/' terraform.tfstate       # drift again
cat > main.tf <<'EOF'
variable "zone" { default = "eu-west-1a" }

resource "terraform_data" "db" {
  triggers_replace = [var.zone]
  lifecycle { ignore_changes = [triggers_replace] }       # accept that this attribute is owned elsewhere
  provisioner "local-exec" {
    command = "echo \"$(date +%T) CREATE db in ${var.zone}\" >> events.log"
  }
}
EOF
terraform plan -input=false -no-color | tail -3
```

**What you see:** no replacement. `ignore_changes` is the correct tool for **fields another system owns** (autoscaling capacity, tags added by a cost tool). It is the **wrong** tool to hide a change you simply have not decided about, because Terraform will **never correct it again**.

## 5. When replacement is unavoidable: do it safely

Sometimes the code is right, reality has to change, and the attribute is immutable. The aim is **traffic keeps flowing while the new copy is created**.

```run
cd ~/s1
cp before.tfstate terraform.tfstate
cat > main.tf <<'EOF'
variable "zone" { default = "eu-west-1a" }

resource "terraform_data" "db" {
  triggers_replace = [var.zone]
  lifecycle { create_before_destroy = true }
  provisioner "local-exec" {
    command = "echo \"$(date +%T) CREATE db in ${var.zone}\" >> events.log"
  }
}
EOF
terraform plan -input=false -no-color -var zone=eu-west-1c | grep -E "create replacement|Plan:"
terraform apply -auto-approve -input=false -no-color -var zone=eu-west-1c | grep -E "Apply complete"
cat events.log
```

**What you see:** `+/- create replacement and then destroy`, which is Terraform's wording for **create_before_destroy**: the **new** resource exists **before** the old one is removed. That helps for resources that can **coexist** (instances behind a load balancer, a new listener, a new parameter group). For resources with **unique names or one-to-one attachments** (a database with the same identifier) it can fail, so the right approach is a **blue/green at the application level**:

1. create the **new database** (new name) from the latest **snapshot**, or as a **read replica** and **promote** it
2. **sync** data, test, then **switch the application** (connection string, DNS, parameter) in a **reviewed change**
3. keep the old one for a **rollback window**
4. remove it later with a **separate, reviewed apply** (and `prevent_destroy` on production databases in the meantime)

Managed services offer this natively (for example **blue/green deployments for RDS**, from general knowledge). The Terraform side is: add the new resource, use **`moved` blocks** if you only rename, and **never** let a single apply do replacement on a stateful primary.

:::warn Safety rails for production state
- `lifecycle { prevent_destroy = true }` on databases, volumes and state buckets makes a plan that would destroy them **fail loudly**.
- **Save the plan** (`terraform plan -out=tfplan`), review it, and apply **that file**. The pipeline then applies exactly what was approved.
- **Back up state** before surgery (`terraform state pull > backup.tfstate`), and keep **state versioning** on the backend bucket.
- Avoid `-target` as a habit: it applies part of the graph and **hides** the rest of the drift. Use it only for a deliberate, recorded recovery.
:::

## 6. Adopting what exists: import

A resource created by hand that you now want under management should be **imported**, not recreated.

```run
cd ~/s1
cat > adopt.tf <<'EOF'
import {
  to = terraform_data.adopted
  id = "legacy-thing"
}
resource "terraform_data" "adopted" {
  input = "managed now"
}
EOF
terraform plan -input=false -no-color -var zone=eu-west-1c | grep -E "will be imported|Plan:|import"
```

**What you see:** `1 to import` (the `1 to change` is the code setting `input` on the adopted object; with a real resource you would edit the code until the plan shows only the import). The `import` block is **code-reviewed and repeatable**, unlike the older one-off `terraform import` command. For a real AWS resource you would write the `id` the provider documents (an instance ID, a bucket name), run `terraform plan -generate-config-out=generated.tf` to **draft** the matching code (from general knowledge of newer Terraform), then **edit** it until the plan shows **no changes**. Only then does the resource count as adopted.

## 7. Also reduce drift at the source

- **Remove console write access** for most people. Production changes go through the **pipeline identity** only, with **break-glass** access that is **audited** and followed by a ticket.
- **Scheduled drift detection** (`terraform plan -detailed-exitcode`, from Q8 in the senior track) so drift is found in hours, not at the next unrelated release.
- **Alert on out-of-band changes**: cloud audit logs and configuration-rules services raise an event when a tracked setting changes.
- **After a legitimate emergency fix**, **codify it the same day**.

## 8. The answer an interviewer expects

Interviewers listen for **order of thinking**: you **do not apply first**.

1. **Stop and inspect.** "I do not run apply. I run `terraform plan`, save it, and read why it is replacing: which attribute, and whether it is a `forces replacement` one. I also check who changed it and why, from the cloud audit log."
2. **Explain the model.** "Terraform compares code, state and reality. The plan says the live resource differs from code in a way that cannot be fixed in place."
3. **Decide the direction.** "If the manual change was an intentional fix, **I update the code to match** so the plan is empty. If it was a mistake, **I revert it in the console** or let Terraform fix it in place. If another system owns the field, **`ignore_changes`**."
4. **If replacement is unavoidable**, "I make it **safe**: create the new resource first (`create_before_destroy`) where it can coexist; for a stateful resource a **blue/green** with a new instance from a snapshot or replica, **switch traffic**, keep the old one for rollback, delete it in a **separate change**. `prevent_destroy` protects the primary meanwhile."
5. **Guard the process.** "Backup the state, apply a **saved reviewed plan**, run it during a **window** if needed, and **verify** with a post-apply check."
6. **Prevent recurrence.** "Remove console write access, scheduled drift detection, alerts on out-of-band changes, codify emergency fixes, and a blameless note on why someone had to click."

A short spoken version: *"I wouldn't apply. I'd read the plan to find what forces replacement and who changed it. If the change should stay, I'd update the code so the plan is clean. If it shouldn't, I'd revert it. If replacement is unavoidable on a stateful resource, I'd build the new one alongside, cut traffic over, and remove the old one in a separate change. Then I'd lock down console access and add drift detection."*

:::warn Common mistakes
- **Running apply to "see what happens"** on production.
- **Using `ignore_changes` to silence a plan** you have not understood.
- **Editing state by hand** without a backup and without understanding the schema.
- **Using `-target`** to dodge the replacement and leaving the rest unreconciled.
- **Fixing the console and forgetting the code**, so the next engineer's apply reverts the emergency fix.
- **Not asking why** the change was made: it may reveal a missing feature or a monitoring gap.
:::

## 9. Follow-up questions to expect

- **"What does `terraform plan -refresh-only` do?"** It shows **only** differences between state and reality (drift) and, if applied, **updates state** to match reality **without changing infrastructure**. Useful to **accept** known drift after you have updated the code.
- **"Terraform state is lost or corrupt. What now?"** Restore from the **backend's versioned object**; if truly lost, **re-import** resources one by one (`import` blocks), starting with the **most critical**, and use plans to verify **no changes**.
- **"Two people ran apply at once."** **State locking** (DynamoDB or the backend's native lock) prevents it; if a lock is stuck, verify no run is active, then `terraform force-unlock`.
- **"How do you rename a resource without recreating it?"** A **`moved` block** (or `terraform state mv`), reviewed in a plan that shows **no replacement**.
- **"How do you stop drift being a surprise?"** Scheduled plans per stack, alerts, **least-privilege console access**, and a **ticket for every emergency change**.

:::try
1. Repeat section 3 but change a **second** argument with `ignore_changes` on only one. Predict which change causes replacement before running the plan.
2. Add `prevent_destroy = true`, drift the zone and read the **error** the plan gives. Explain why this is good for a production database.
3. Write a `moved` block that renames `terraform_data.db` to `terraform_data.primary` and confirm the plan shows **no replacement**.
4. Practise saying the **60-second spoken answer** out loud, then add the one follow-up you find hardest.
:::

:::recap
- Plans compare **code, state and reality**; drift is reality moving without Terraform.
- A replacement comes from an **immutable ("forces replacement") attribute**; read the plan, never apply blindly.
- Choose a direction: **revert reality**, **update code**, **ignore** (only for externally owned fields), **adopt with import**, or **replace safely**.
- Safe replacement: **create before destroy** or **blue/green with a new copy**, a **saved reviewed plan**, a rollback window, and `prevent_destroy` on the primary.
- Prevent repeats with **no console writes**, scheduled **drift detection** and **codified emergency fixes**.
:::

:::quiz
? What is the first thing you do when apply wants to recreate a production resource?
- Run apply and watch
+ Read the saved plan to find which attribute forces replacement and who changed it
- Delete the state file
! Understand the direction before touching anything.

? The manual change was an emergency fix that should stay. What is the cleanest reconciliation?
- Revert it in the console
+ Update the code to match so the plan shows no changes
- Use -target
! Code follows reality when reality is right.

? When is `ignore_changes` appropriate?
- To hide any plan you do not understand
+ For fields another system legitimately owns, such as autoscaled capacity
- Only for databases
! It stops Terraform ever correcting that field.

? How do you replace a stateful database without downtime?
- Destroy and create in one apply
+ Build the new one alongside (snapshot or replica), switch traffic, keep the old for rollback, remove it in a separate change
- Turn off the application
! Replacement of a primary is a traffic cutover, not a single apply.

? What does `terraform plan -refresh-only` change?
- Infrastructure to match code
+ Nothing in infrastructure; it reports state-versus-reality differences and can update the state
- The code
! It accepts reality into state without touching resources.
:::
