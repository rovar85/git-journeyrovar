---
track: terraform
title: Cloud patterns, providers and the bigger picture
short: Cloud patterns
sub: How real configurations look, how credentials work, and how Terraform fits with Docker, Ansible and Kubernetes.
---

:::goals
- recognise a typical cloud network and server configuration
- explain provider authentication safely
- use data sources, `import` and `terraform_remote_state`
- decide what belongs in Terraform and what in Ansible or Kubernetes
:::

This lesson is mostly **reading real-world Terraform**. The lab environment cannot reach cloud APIs or the Terraform registry, so the cloud blocks are **Example (not run here)**. The one thing we can run is the language machinery that these examples use, at the end.

## A typical AWS network and server

```hcl:network.tf (Example, not run here)
provider "aws" {
  region = var.region
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "ev-${var.environment}" }
}

resource "aws_subnet" "private" {
  for_each          = { a = "10.0.1.0/24", b = "10.0.2.0/24" }
  vpc_id            = aws_vpc.main.id          # implicit dependency
  cidr_block        = each.value
  availability_zone = "${var.region}${each.key}"
}

resource "aws_security_group" "ev" {
  name   = "ev-servers"
  vpc_id = aws_vpc.main.id

  ingress {
    description = "HTTPS from the corporate network only"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.20.0.0/16"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_ami" "ubuntu" {                       # data source: look up, do not create
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_instance" "ev" {
  for_each               = var.servers
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = each.value.size
  subnet_id              = aws_subnet.private["a"].id
  vpc_security_group_ids = [aws_security_group.ev.id]
  user_data              = templatefile("${path.module}/bootstrap.sh.tftpl", { name = each.key })
  tags                   = { Name = each.key }
}
```

Every idea in this example appeared in the previous lessons. Also notice how the **networking track** shows up: a VPC and its subnets are the CIDR blocks and routes you built by hand, the security group is a firewall rule list, and the route to the internet is a default route to a gateway. Knowing Linux networking makes cloud networking easy.

## Authentication: never put credentials in code

| Method | Notes |
|---|---|
| **Environment variables** (`AWS_ACCESS_KEY_ID`...) | simplest for local use; never commit them |
| **Shared config / SSO login** (`aws sso login`, `az login`) | short-lived, tied to a person |
| **Instance or workload identity** (IAM role, managed identity) | best for servers and CI: no stored secrets |
| **OIDC federation** (GitHub Actions, GitLab, Jenkins plugins) | CI gets a temporary role without stored keys |

Rule: the Terraform code names **what** to build; **who is allowed** is decided outside it, with the least privilege needed.

## Data sources, import and remote state

- **Data sources** read existing things (an AMI, a DNS zone, a secret's metadata) without managing them.
- **`import`** adopts something created by hand into Terraform:

```hcl:import.tf (Example, not run here)
import {
  to = aws_instance.legacy
  id = "i-0abc123def456"
}
# then: terraform plan -generate-config-out=generated.tf  (drafts the resource block for you)
```

- **`terraform_remote_state`** reads another configuration's outputs (a network stack publishing subnet IDs for an application stack). It is a built-in data source, so we can run it:

```run
mkdir -p ~/lab/tf7/network ~/lab/tf7/app && cd ~/lab/tf7/network
cat > main.tf <<'EOF'
resource "terraform_data" "net" {
  input = "10.0.0.0/16"
}
output "cidr" {
  value = terraform_data.net.output
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep "Apply complete"
cd ~/lab/tf7/app
cat > main.tf <<'EOF'
data "terraform_remote_state" "network" {
  backend = "local"
  config = {
    path = "../network/terraform.tfstate"
  }
}

output "app_sees_network" {
  value = "app subnet will live inside ${data.terraform_remote_state.network.outputs.cidr}"
}
EOF
terraform init > /dev/null 2>&1
terraform apply -auto-approve | grep -E "app_sees_network"
cd ~/lab/tf7/app && terraform destroy -auto-approve > /dev/null
cd ~/lab/tf7/network && terraform destroy -auto-approve > /dev/null
```

This **layered** approach (network first, application on top) gives small, fast states and limits the blast radius of mistakes.

## Terraform and the other tools

| Layer | Tool | Note |
|---|---|---|
| Cloud and platform resources (networks, VMs, databases, DNS, IAM, clusters) | **Terraform** | the "what exists" layer |
| Configuring the inside of servers (packages, files, users, services) | **Ansible** | the "how it is set up" layer. Terraform can output the host list for Ansible's inventory |
| Packaging apps | **Docker** | built in CI, stored in a registry |
| Running apps at scale | **Kubernetes** | Terraform can create the cluster; deployments use Kubernetes manifests, Helm or GitOps |
| Running it all | **Jenkins / GitHub Actions** | pipelines call plan, apply, build, deploy |

Terraform can also manage Kubernetes objects and Docker containers via providers (`kubernetes`, `helm`, `docker`), but most teams keep **cluster creation** in Terraform and **application deployment** in a dedicated deploy tool.

## Immutable infrastructure

A common modern approach: instead of logging in to patch a server, build a **new image** (with Packer, or a container image), have Terraform replace the old servers with new ones, and throw the old ones away. Nothing is ever hand-edited, so servers do not drift. `create_before_destroy` makes the replacement seamless.

## Costs and cleanup

Cloud resources cost money while they exist. Habits that save you:

- tag everything (`Owner`, `Env`, `ExpiresOn`), and use Infracost in PRs
- `terraform destroy` lab environments when finished
- set **budget alerts** in the cloud account
- never leave test databases or GPU machines running overnight

## Terraform or OpenTofu?

In 2023 HashiCorp changed Terraform's license. The community forked it as **OpenTofu** (Linux Foundation). The language, providers and workflow are the same, and the commands are `tofu init/plan/apply`. Everything in this track applies to both.

:::recap
- Real configurations: networks, security groups, servers, data sources, templated bootstrap scripts.
- Authenticate with short-lived identities (SSO, roles, OIDC), never keys in code.
- `import` adopts existing resources; `terraform_remote_state` shares outputs between layered stacks.
- Terraform creates the platform; Ansible configures servers; Docker/Kubernetes run applications; pipelines glue it together.
:::

:::try Your turn
Sketch (on paper) the Terraform layers for the Enterprise Vault environment: network, database server, EV servers, DNS, backup storage. Which layer should publish which outputs?
:::

:::quiz
? What is the safest way for CI to authenticate to a cloud?
+ Short-lived credentials via OIDC or a workload role
- A long-lived key stored in the repository
- The administrator's password in a variable file
- Anonymous access
! No stored secrets means nothing to leak.
? What is a data source for?
+ Reading something that already exists without managing it
- Creating a database
- Storing state
- Defining variables
! Resources create; data sources look up.
? Why split infrastructure into layered states?
+ Smaller blast radius, faster plans, clearer ownership
- Terraform requires it
- It avoids providers
- It removes the need for outputs
! Network, platform and app often change at different speeds.
:::
