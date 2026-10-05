---
track: terraform
title: Infrastructure as code and your first Terraform run
short: First run
sub: Describe infrastructure in files, then plan, apply and destroy it.
---

:::goals
- explain infrastructure as code (IaC) and why click-ops does not scale
- describe the Terraform workflow: write, init, plan, apply, destroy
- read a plan
- understand providers, resources and state at a first level
:::

## Click-ops versus code

Building servers, networks and databases by clicking in a cloud console is slow, undocumented, impossible to review and hard to repeat exactly. **Infrastructure as code** means you write files that describe the infrastructure you want, keep them in Git, review changes like code, and let a tool create it. The same files rebuild an identical environment for test, staging and production, or recreate everything after a disaster.

**Terraform** (by HashiCorp; **OpenTofu** is its open-source fork with the same language) is the most widely used IaC tool. You write **HCL** (HashiCorp Configuration Language). Terraform compares what you **want** with what **exists** and works out the changes. This is **declarative**: you say *what*, not *how*.

| Term | Meaning |
|---|---|
| **Provider** | a plugin that talks to one platform's API (`aws`, `azurerm`, `google`, `kubernetes`, `docker`...) |
| **Resource** | one thing to manage (a VM, a network, a DNS record) |
| **Data source** | read-only lookup of something that already exists |
| **Variable / output** | inputs and results of a configuration |
| **State** | Terraform's record of what it created (`terraform.tfstate`) |
| **Plan** | the preview of changes Terraform would make |
| **Module** | a reusable bundle of resources |

## The lab note

Real providers (AWS, Azure...) need accounts, credentials and downloads from the Terraform registry, which this course lab does not have. Terraform ships with one built-in provider and a resource, `terraform_data`, that behaves like any other resource: it has inputs, an ID, a lifecycle, and it is tracked in state. With `local-exec` provisioners it can run commands, so we can watch a **real** Terraform plan/apply/destroy cycle with real output. Everything you learn about the workflow, state, variables, loops and modules transfers 1:1 to cloud resources; sections marked **Example (not run here)** show the cloud version.

## A first configuration

```run
mkdir -p ~/lab/tf1 && cd ~/lab/tf1
cat > main.tf <<'EOF'
resource "terraform_data" "ev_server" {
  input            = "EV01"
  triggers_replace = "v1"

  provisioner "local-exec" {
    command = "echo 'server ${self.input} created' > ev01.txt"
  }
}

output "server_name" {
  value = terraform_data.ev_server.output
}
EOF
terraform version | head -1
terraform init 2>&1 | grep -E "Terraform has been successfully initialized|Initializing"
```

`terraform init` prepares the folder: it downloads the providers the configuration needs and sets up the backend (where state is kept). Run it once per new folder and again whenever you add a provider or module. It created a hidden `.terraform` directory and a lock file:

```run
cd ~/lab/tf1
ls -A | sort
```

## Plan, apply, destroy

```run
cd ~/lab/tf1
terraform plan
```

Read it like a diff: `+` create, `~` change in place, `-` destroy, `-/+` destroy and recreate. At the bottom: `Plan: 1 to add, 0 to change, 0 to destroy`. **Nothing has been changed yet.** Planning is read-only, which is why you can run it safely at any time.

```run
cd ~/lab/tf1
terraform apply -auto-approve | grep -E "Plan:|Apply complete|server_name"
cat ev01.txt
```

Without `-auto-approve`, `apply` shows the plan and waits for you to type `yes`. **Always read the plan before approving.** Now look at the state, and run plan again:

```run
cd ~/lab/tf1
terraform state list
terraform plan | grep -E "No changes|Plan:"
```

`No changes. Your infrastructure matches the configuration.` This is Terraform's idempotency: the state, the real world and your code all agree, so there is nothing to do. Now change the code and see what Terraform decides:

```run
cd ~/lab/tf1
sed -i 's/input            = "EV01"/input            = "EV01-prod"/' main.tf
terraform plan | grep -E "^  # |Plan:"
```

Changing `input` is an **in-place update** (`~`): the resource keeps its identity. Now change an argument that **forces replacement**:

```run
cd ~/lab/tf1
sed -i 's/triggers_replace = "v1"/triggers_replace = "v2"/' main.tf
terraform plan | grep -E "^  # |Plan:"
```

`-/+` and `must be replaced` mean **destroy and create again** (in real plans the attribute that caused it is tagged `# forces replacement`). Which attributes update in place and which force replacement depends on the resource type: for a cloud VM, changing a tag updates in place, but changing the image or the subnet destroys and recreates the machine. The plan always tells you which, and reading it carefully is the most important Terraform skill: a "replace" on a database means data loss.

```run
cd ~/lab/tf1
terraform apply -auto-approve | grep -E "Plan:|Apply complete"
cat ev01.txt
terraform destroy -auto-approve | grep -E "Destroy complete|Plan:"
terraform state list | wc -l
```

The file shows the new name only because the replacement re-ran the provisioner. `destroy` removes everything the configuration manages, and the state is now empty.

## The same thing for real cloud infrastructure

**Example (not run here).** With the AWS provider, the file would look like this; the workflow (`init`, `plan`, `apply`) is identical:

```hcl:main.tf (Example, not run here)
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-west-2"        # credentials come from the environment, never from this file
}

resource "aws_instance" "ev_server" {
  ami           = "ami-0abcdef1234567890"
  instance_type = "t3.large"
  tags = {
    Name = "ev01"
    Env  = "prod"
  }
}
```

Providers are downloaded from the **Terraform Registry** (`registry.terraform.io`) the first time you run `init`. The `~> 5.0` version constraint means "any 5.x, not 6", so upgrades are deliberate.

## The loop in one picture

1. **Write** `.tf` files and commit them to Git.
2. **`terraform init`**: get providers and set up the backend.
3. **`terraform plan`**: preview. Review it (people do this in pull requests).
4. **`terraform apply`**: make the changes. Updates state.
5. **`terraform destroy`**: remove everything (use with great care).

:::recap
- IaC replaces click-ops with reviewable, repeatable files in Git.
- Terraform is declarative: it compares code, state and reality, and plans the difference.
- `init`, `plan`, `apply`, `destroy`. Plans are read-only; read every plan before applying.
- Plans show `~` in-place updates and `-/+` replacements; look for `forces replacement`, because replacing stateful things destroys data.
:::

:::try Your turn
Create a configuration with two `terraform_data` resources where the second uses the first's `output` as its `input`. Plan, apply, change the first one's input and read what the plan says about both.
:::

:::quiz
? What does `terraform plan` do?
+ Shows what would change, without changing anything
- Creates the resources
- Deletes the state
- Downloads providers only
! Plan is the safe preview.
? What does declarative mean?
+ You describe the desired end state, and the tool works out the steps
- You list every command in order
- It runs without a network
- It has no state
! Compare with a Bash script, which is procedural.
? In a plan, what does "forces replacement" warn about?
+ The resource will be destroyed and recreated
- A syntax error
- A missing provider
- A slow API
! Replacement of stateful resources can lose data.
:::
