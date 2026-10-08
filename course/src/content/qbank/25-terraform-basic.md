---
track: qbank
title: "Terraform and Infrastructure as Code: Basic questions"
short: Terraform basic
sub: 9 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## What is the difference between variables.tf and .tfvars files? What is the variable precedence order?

<!-- source: 05 Q5 -->

:::note In simple words
variables.tf is the form with empty boxes and labels ("instance type: ____"). A .tfvars file is a filled-in copy of that form, one per environment.
:::

- **variables.tf** = **declaration**: name, type, description, default, validation, sensitive. It says what inputs exist.
- **.tfvars** = **values**: `terraform.tfvars` and `*.auto.tfvars` are loaded automatically; others like `prod.tfvars` are passed with `-var-file`.
- Same code, different tfvars per environment (dev.tfvars, prod.tfvars). Do not commit tfvars that contain secrets.

Precedence (highest wins):

| Rank | Source |
|---|---|
| 1 (highest) | `-var` on the command line |
| 2 | `-var-file=...` |
| 3 | `*.auto.tfvars` (alphabetical order) |
| 4 | `terraform.tfvars` |
| 5 | `TF_VAR_name` environment variable |
| 6 (lowest) | `default` in the variable block |

If a variable has no default and no value is given, Terraform asks for it interactively (or fails in CI with `-input=false`).

**Example:**
```hcl
# variables.tf
variable "instance_type" {
  type        = string
  description = "EC2 size"
  default     = "t3.micro"
  validation {
    condition     = can(regex("^t3\\.", var.instance_type))
    error_message = "Only t3 family allowed."
  }
}
```
```hcl
# prod.tfvars
instance_type = "t3.large"
```
```bash
terraform plan -var-file=prod.tfvars                      # t3.large
terraform plan -var-file=prod.tfvars -var="instance_type=t3.xlarge"   # -var wins
```

:::say
variables.tf declares the inputs with their types, defaults and validation, while tfvars files supply the actual values, usually one file per environment. The precedence from highest to lowest is -var, then -var-file, then auto.tfvars, then terraform.tfvars, then TF_VAR_ environment variables, and finally the default.
:::

## In which Terraform file or block can you identify the provider version (for example the GCP google provider)?

<!-- source: 05 Q6 -->

*Also asked as:* How do you handle provider API changes between provider versions?

:::note In simple words
The terraform block is your shopping list saying "I need the google plugin, version 6 or newer". The lock file is the receipt saying exactly which version was actually bought.
:::

- **required_providers** inside the `terraform {}` block declares the provider source and the allowed version range. By convention it lives in `versions.tf` or `providers.tf`, but it can be in any `.tf` file.
- **.terraform.lock.hcl** records the exact version that `terraform init` selected, plus checksums. Commit this file so everyone and CI use the same version.
- The `provider "google" {}` block itself configures project/region; it should not normally contain the version.
- Commands: `terraform version` shows installed providers; `terraform providers` lists requirements; `terraform init -upgrade` moves to a newer allowed version.

Handling provider API changes between versions:
- Pin a range like `version = "~> 5.0"` so a new major version (with breaking changes) is never picked up by surprise.
- Commit `.terraform.lock.hcl` so every laptop and CI run uses the exact same build.
- Upgrade deliberately: `terraform init -upgrade` in a branch, read the provider upgrade guide and changelog, fix deprecated arguments, and run `plan` in staging before prod.
- For mixed Windows/Mac/Linux teams, record checksums for all platforms: `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=windows_amd64`.

**Example:**
```hcl
# versions.tf
terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"   # any 6.x, not 7.0
    }
  }
}
```
```hcl
# .terraform.lock.hcl (generated)
provider "registry.terraform.io/hashicorp/google" {
  version     = "6.8.0"
  constraints = "~> 6.0"
  hashes      = [ "h1:..." ]
}
```

:::say
The version constraint is declared in the required_providers section of the terraform block, usually in versions.tf, and the exact version actually installed is pinned in .terraform.lock.hcl, which I commit to Git. I can also check it with terraform version or terraform providers.
:::

## What files are in a typical Terraform folder or module, and what is each file for?

<!-- source: 05 Q7 -->

:::note In simple words
Terraform reads every .tf file in a folder as one big file. Splitting it into main, variables, outputs and so on is just tidy labelling, like drawers in a cupboard.
:::

| File / folder | Purpose |
|---|---|
| `main.tf` | The main resources (and module calls) |
| `variables.tf` | Input variable declarations |
| `outputs.tf` | Values exposed to the user or to other modules |
| `providers.tf` / `versions.tf` | `terraform {}` block with required_version and required_providers, plus provider config |
| `backend.tf` | Remote state backend (S3 / GCS / azurerm) - only in root modules |
| `locals.tf` | Computed local values (name prefixes, common tags) |
| `data.tf` | Data sources (lookups of existing AMIs, VPCs, accounts) |
| `terraform.tfvars` / `prod.tfvars` | Values for variables, per environment |
| `.terraform/` | Downloaded providers and modules (created by init, never commit) |
| `.terraform.lock.hcl` | Exact provider versions and checksums (commit it) |
| `terraform.tfstate` | Exists locally only when using the local backend - avoid in teams |
| `.gitignore` | Ignores `.terraform/`, `*.tfstate*`, secret tfvars, crash logs |

Root module vs child module: a **root module** (what you run `terraform apply` in) has backend and provider config; a **child module** (reusable, under `modules/`) has only resources, variables and outputs, and never its own backend. The module design question in the Advanced section covers versioning and DRY patterns.

**Example:**
```text
infra/
  modules/
    vpc/
      main.tf  variables.tf  outputs.tf  versions.tf  README.md
    eks/
      main.tf  variables.tf  outputs.tf  versions.tf
  envs/
    dev/
      main.tf  backend.tf  providers.tf  dev.tfvars  .terraform.lock.hcl
    prod/
      main.tf  backend.tf  providers.tf  prod.tfvars  .terraform.lock.hcl
  .gitignore
```
```text
# .gitignore
.terraform/
*.tfstate
*.tfstate.*
crash.log
secrets.auto.tfvars
```

:::say
A typical folder has main.tf for resources, variables.tf for inputs, outputs.tf for outputs, versions.tf or providers.tf for provider requirements, backend.tf for remote state, plus locals.tf and data.tf, and tfvars files for per-environment values. .terraform is the downloaded plugin cache that I never commit, while .terraform.lock.hcl is committed, and child modules under modules/ contain only resources, variables and outputs.
:::

## How does Terraform prevent duplicate resource creation?

<!-- source: 05 Q8 -->

:::note In simple words
Before building anything, Terraform checks its notebook (state). If the notebook says "already built this", it does not build a second one, it only fixes differences.
:::

- Every resource has a unique **address** in code, like `aws_instance.web`. State maps that address to one real ID.
- On `plan`, Terraform refreshes state against the real cloud and compares with code. If the resource exists and matches, it does nothing (idempotent).
- **State locking** stops two people running apply at the same time, which would otherwise create two copies.
- Duplicates can still happen if state is lost, if two teams use different state files for the same thing, or if a resource was created manually. Fix: `import` it instead of creating it.
- Many cloud APIs also reject duplicates (S3 bucket names, IAM role names are unique).
- `count` / `for_each` give each copy a stable key so repeated runs do not add more.

**Example:**
```bash
terraform apply    # first run: 1 to add
terraform apply    # second run:
# No changes. Your infrastructure matches the configuration.
```

:::say
Terraform is idempotent because it tracks every resource address against a real ID in the state file, so a second apply only shows differences instead of creating duplicates. Remote state with locking prevents concurrent runs, and for resources that already exist outside Terraform I use import rather than letting it create a copy.
:::

## Write Terraform code to launch an EC2 instance.

<!-- source: 05 Q9 -->

:::note In simple words
Tell Terraform four things: which cloud and region, which operating system image, what firewall rules, and what size of machine. Then preview and build.
:::

A minimal but complete setup has: a `terraform` block (provider version), a `provider` block (region), a data source to find the latest AMI, a security group, the `aws_instance`, and an output. For a version that also looks up an existing VPC and subnets with data sources, see the "dynamically retrieve VPC details" question in the Advanced section.

**Example:**
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd*/ubuntu-*-24.04-amd64-server-*"]
  }
}

resource "aws_security_group" "web" {
  name = "web-sg"
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "web" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.web.id]
  tags                   = { Name = "web-server" }
}

output "public_ip" {
  value = aws_instance.web.public_ip
}
```
```bash
terraform init      # download the AWS provider
terraform plan      # preview: 2 to add
terraform apply     # create SG + instance, prints public_ip
terraform destroy   # clean up when done
```

:::say
I declare the AWS provider in a terraform block, set the region, look up the latest Ubuntu AMI with a data source, create a security group, and reference both in an aws_instance resource, then output the public IP. The workflow is terraform init, plan to review, apply to create, and destroy to clean up.
:::

## What is the use of the terraform refresh command?

<!-- source: 05 Q11 -->

:::note In simple words
Refresh is Terraform re-reading the real world to update its notebook, without changing anything in the real world.
:::

- `terraform refresh` reads the current settings of every managed resource from the cloud and updates the state file to match reality. It does not change infrastructure.
- It is **deprecated** because it updates state silently with no review. The modern, safe way is `terraform plan -refresh-only` (preview) and `terraform apply -refresh-only` (accept the update after you review it).
- Normal `plan` and `apply` already do a refresh automatically first. You can skip that with `-refresh=false` for speed on huge setups.
- Use case: someone changed a resource manually and you want state to reflect it (then update code too), or you want to see drift without planning any changes.

**Example:**
```bash
terraform plan -refresh-only     # show what changed outside Terraform
terraform apply -refresh-only    # accept those changes into state only
```

:::say
terraform refresh syncs the state file with the real infrastructure without modifying resources. It is deprecated now, so I use terraform plan -refresh-only to review drift and apply -refresh-only to accept it into state, because that gives a reviewable step instead of a silent state change.
:::

## What is a null_resource in Terraform?

<!-- source: 05 Q12 -->

:::note In simple words
A null_resource is an empty box that does not create anything in the cloud. You use it as a hook to run a script at the right moment.
:::

- `null_resource` (from the `hashicorp/null` provider) creates no real infrastructure. It is used together with **provisioners** (`local-exec`, `remote-exec`) to run commands, and with `triggers` to decide when to re-run.
- Typical uses: run a DB migration script after RDS is created, call an API, run `kubectl apply` once a cluster is up.
- Since Terraform 1.4, the built-in **`terraform_data`** resource does the same job without an extra provider, using `triggers_replace`.
- Caution: provisioners are a last resort. They are not idempotent and are hard to debug; prefer native resources, user_data, Ansible, or CI steps.

**Example:**
```hcl
resource "terraform_data" "db_migrate" {
  triggers_replace = [aws_db_instance.app.id, var.schema_version]

  provisioner "local-exec" {
    command = "./migrate.sh ${aws_db_instance.app.address}"
  }
}
```

:::say
A null_resource creates nothing in the cloud; it acts as a container for provisioners so I can run a script at a specific point in the dependency graph, re-run using triggers. In newer Terraform I use terraform_data instead, and I keep provisioners as a last resort because they are not declarative.
:::

## What is the GCP (and Azure) equivalent of AWS CloudFormation?

<!-- source: 05 Q13 -->

:::note In simple words
Every cloud has its own native recipe language. AWS has CloudFormation, Azure has ARM/Bicep, and Google has Deployment Manager and now Infrastructure Manager.
:::

| Cloud | Native IaC | Notes |
|---|---|---|
| AWS | CloudFormation (plus CDK on top) | YAML/JSON templates, stacks |
| GCP | Deployment Manager (legacy) / Infrastructure Manager | Deployment Manager is deprecated; Infrastructure Manager is a managed service that runs Terraform |
| Azure | ARM templates / Bicep | Bicep is the friendlier language that compiles to ARM |

Why many teams still pick Terraform: one language across all clouds, huge provider ecosystem, and on GCP Google itself recommends Terraform (via Infrastructure Manager).

**Example:**
```bash
# GCP Infrastructure Manager deploying a Terraform config from Git
gcloud infra-manager deployments apply projects/my-proj/locations/us-central1/deployments/net \
  --service-account=projects/my-proj/serviceAccounts/im-sa@my-proj.iam.gserviceaccount.com \
  --git-source-repo=https://github.com/org/infra --git-source-directory=network
```

:::say
The classic GCP equivalent is Deployment Manager, but Google has deprecated it and now recommends Infrastructure Manager, which is a managed way to run Terraform. On Azure the equivalent is ARM templates or Bicep. In multi-cloud setups I prefer Terraform because it is one workflow everywhere.
:::

## What are some non-cloud-native alternatives to Terraform?

<!-- source: 05 Q14 -->

:::note In simple words
Terraform is one brand of recipe book. Others exist - some use real programming languages, some focus on configuring servers rather than creating them.
:::

- **OpenTofu** - open-source fork of Terraform (Linux Foundation), near drop-in compatible.
- **Pulumi** - IaC using real languages (TypeScript, Go, Python) with state like Terraform.
- **Crossplane** - manages cloud resources as Kubernetes custom resources (GitOps friendly).
- **Ansible** - mainly configuration management (install packages, configure servers), but it can create cloud resources too. Agentless, push-based.
- **Chef / Puppet / SaltStack** - configuration management, agent-based, pull model.
- **Terragrunt** - a wrapper around Terraform for DRY multi-environment setups (not a replacement).
- **AWS CDK / CDKTF** - write code that generates CloudFormation or Terraform.

Key distinction: **provisioning tools** (Terraform, Pulumi, Crossplane) create infrastructure; **configuration management tools** (Ansible, Chef, Puppet) configure what runs on it.

**Example:**
```text
Terraform  -> create VPC, EC2, RDS
Ansible    -> install nginx, push config files, restart service on those EC2s
```

:::say
Alternatives include OpenTofu, Pulumi, Crossplane for provisioning, and Ansible, Chef or Puppet for configuration management. A common pattern is Terraform to provision the infrastructure and Ansible to configure the servers, or baking images with Packer so no configuration is needed at boot.
:::
