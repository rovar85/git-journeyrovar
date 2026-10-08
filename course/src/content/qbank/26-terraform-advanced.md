---
track: qbank
title: "Terraform and Infrastructure as Code: Advanced questions"
short: Terraform advanced
sub: 15 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do you dynamically retrieve VPC details from AWS to create an EC2 instance using IaC? Write the code.

<!-- source: 05 Q18 -->

:::note In simple words
Instead of hard-coding "subnet-123" in your recipe, you ask AWS "give me the VPC tagged prod and its private subnets" at run time. That question is a data source.
:::

- **Data sources** (`data` blocks) read existing information without managing it.
- Look up the VPC by tag, then its subnets, then the latest AMI, and feed those into the EC2 resource.
- This makes the same code work in every account/environment and avoids breaking when IDs change.

**Example:**
```hcl
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["prod-vpc"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  tags = { Tier = "private" }
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_security_group" "app" {
  name   = "app-sg"
  vpc_id = data.aws_vpc.main.id
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t3.micro"
  subnet_id              = data.aws_subnets.private.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  tags                   = { Name = "app-server" }
}
```
If the VPC is managed by another Terraform stack, you can instead read its outputs with `data "terraform_remote_state"`, or better, SSM parameters.

:::say
I use data sources - aws_vpc filtered by tag, aws_subnets filtered by VPC ID and tier, and aws_ami for the latest image - and pass their IDs into the aws_instance resource. That way nothing is hard-coded and the same code works across environments.
:::

## If you want to replace (recreate) a single resource in existing infrastructure, how would you do it?

<!-- source: 05 Q19 -->

:::note In simple words
One brick in the wall is bad. You tell Terraform "replace just this brick", not rebuild the whole wall.
:::

- Modern way: `terraform apply -replace="ADDRESS"` - forces destroy-and-recreate of only that resource in one reviewed plan.
- Old way: `terraform taint ADDRESS` then apply. `taint` is deprecated because it changes state before you see a plan.
- Only touch one resource and its dependents: `-target=ADDRESS` (for emergencies only, not daily use).
- To avoid downtime while replacing, use `lifecycle { create_before_destroy = true }`.
- To make Terraform always replace when something changes: `lifecycle { replace_triggered_by = [...] }`.

**Example:**
```bash
terraform plan  -replace="aws_instance.web[1]"
terraform apply -replace="aws_instance.web[1]"
# Plan: 1 to add, 0 to change, 1 to destroy.
```
```hcl
resource "aws_instance" "web" {
  # ...
  lifecycle {
    create_before_destroy = true
  }
}
```

:::say
I use terraform apply -replace with the resource address, which forces recreation of only that resource while showing me the plan first; taint is the older, deprecated way. If downtime matters I add create_before_destroy so the new one comes up before the old one is removed.
:::

## How do you control precisely which resources are destroyed and which are kept?

<!-- source: 05 Q20 -->

*Also asked as:* Scenario: a resource was removed from the config but is still live. What happens and how do you handle it?

:::note In simple words
You want to demolish the garage but keep the house. Terraform gives you tools to point at exactly one thing, to put a "do not demolish" sign on others, or to simply stop looking after something without knocking it down.
:::

| Goal | Tool |
|---|---|
| Destroy only one resource | `terraform destroy -target=ADDRESS` (or remove it from code and apply) - use carefully |
| Never allow a resource to be destroyed by Terraform | `lifecycle { prevent_destroy = true }` - plan errors out |
| Stop managing a resource but keep it in the cloud | `terraform state rm ADDRESS`, or the `removed` block (TF 1.7+) with `destroy = false` |
| Protect at the cloud level too | `deletion_protection = true` (RDS, ALB), S3 object lock, termination protection |
| Limit blast radius | split state: databases and networking in their own root modules |
| Review before destroy | `terraform plan -destroy -out=destroy.plan` then apply that plan |

The `removed` block is the reviewable, code-based way to "forget" a resource: the plan shows it will be removed from state, not destroyed.

Resource removed from config but still live:
- Common misconception: deleting a resource block does not make Terraform "forget" it. The resource is still in state, so the next `plan` shows it as **to destroy**, and apply deletes it.
- To keep it running but stop managing it: add a `removed` block with `destroy = false` (TF 1.7+) or run `terraform state rm`.
- `terraform apply -refresh-only` never destroys anything; it only updates state to match reality.
- Truly **orphaned** resources (live in the cloud but in no state file) come from `state rm`, failed applies that did not record state, or manual creation. Find them with tag-based inventories (e.g. every managed resource tagged `ManagedBy=terraform` + stack name), AWS Config / Resource Explorer, or driftctl-style tooling, then either import them or delete them.

**Example:**
```hcl
removed {
  from = aws_instance.legacy_batch
  lifecycle {
    destroy = false   # remove from state, keep the real EC2
  }
}

resource "aws_db_instance" "main" {
  # ...
  deletion_protection = true
  lifecycle {
    prevent_destroy = true
  }
}
```
```bash
terraform plan -destroy -target=aws_instance.test_box -out=destroy.plan
terraform apply destroy.plan
terraform state rm aws_s3_bucket.shared_logs   # CLI way to stop managing it
```

:::say
To destroy a single resource I remove it from code or use destroy with -target and review the saved plan. To keep resources, I use prevent_destroy and cloud-level deletion_protection, and when I want Terraform to stop managing something without deleting it I use a removed block with destroy = false or terraform state rm. Splitting state so databases live separately limits the blast radius even further.
:::

## How do you design Terraform modules and keep code DRY?

<!-- source: 05 Q22 -->

*Also asked as:* How do you create and use Terraform modules?

:::note In simple words
A module is a reusable Lego kit. Build a "VPC kit" once, then snap it into dev, stage and prod with different sizes instead of rewriting it three times.
:::

(For the list of files in a module folder, see the Basic question on Terraform folder files.)

Good module design:
- **Small and focused**: `vpc`, `eks`, `rds`, `alb` - not one giant "everything" module.
- **Clear interface**: `variables.tf` (inputs with types, descriptions, validation), `outputs.tf`, `main.tf`, `versions.tf`, `README.md`.
- **Sensible defaults**, but no hard-coded env names, account IDs, or regions.
- **Version the modules**: publish via Git tags or a private registry and pin `?ref=v1.4.0` so prod does not change when someone edits the module.
- **Compose** modules in thin "root" configs per environment.
- Use `for_each` / `count` and `locals` to avoid copy-paste.
- Test modules: `terraform validate`, `tflint`, `terraform test`, Checkov.
- Tools like **Terragrunt** remove repeated backend/provider blocks across many envs.

**Example:**
```text
modules/
  vpc/ (main.tf variables.tf outputs.tf versions.tf)
  rds/
envs/
  dev/main.tf
  prod/main.tf
```
```hcl
# envs/prod/main.tf
module "vpc" {
  source     = "git::https://github.com/acme/tf-modules.git//vpc?ref=v1.4.0"
  name       = "prod"
  cidr_block = "10.10.0.0/16"
  az_count   = 3
}
```

:::say
I build small, single-purpose modules with typed inputs and clear outputs, version them with Git tags, and compose them in thin root configurations per environment. Loops, locals and tools like Terragrunt keep it DRY, and every module is validated with tflint, Checkov and terraform test in CI.
:::

## How would you create resources across two different AWS accounts using Terraform?

<!-- source: 05 Q24 -->

:::note In simple words
You give Terraform two keycards - one for account A and one for account B - and label each resource with which keycard to use.
:::

- Define the `aws` provider twice using an **alias**.
- Each provider **assumes an IAM role** in its target account (no long-lived keys). The CI runner has base credentials only allowed to `sts:AssumeRole` into those roles.
- Point each resource or module to the right provider with `provider = aws.xxx` (or `providers = {}` for modules).
- Typical use cases: VPC peering between accounts, Route 53 records in a shared DNS account, cross-account S3 replication.

**Example:**
```hcl
provider "aws" {
  alias  = "network"
  region = "ap-south-1"
  assume_role {
    role_arn = "arn:aws:iam::111111111111:role/TerraformDeploy"
  }
}

provider "aws" {
  alias  = "app"
  region = "ap-south-1"
  assume_role {
    role_arn = "arn:aws:iam::222222222222:role/TerraformDeploy"
  }
}

resource "aws_route53_record" "api" {
  provider = aws.network
  zone_id  = var.zone_id
  name     = "api.example.com"
  type     = "CNAME"
  ttl      = 300
  records  = [module.alb.dns_name]
}

module "alb" {
  source    = "./modules/alb"
  providers = { aws = aws.app }
}
```

:::say
I define two aws providers with aliases, each using assume_role into a deploy role in its account, and then set provider on each resource or pass providers into modules. The pipeline only holds credentials that can assume those roles, so there are no long-lived keys and every action is audited per account.
:::

## How do you manage sensitive values like secrets or API keys in Terraform without hardcoding them?

<!-- source: 05 Q25 -->

*Also asked as:* How do you pass secrets into Terraform safely?

:::note In simple words
Never write the password in the recipe. Keep it in a safe (Secrets Manager / Vault) and let Terraform or the app open the safe at run time.
:::

Options, from good to best:
- Mark variables `sensitive = true` so they are hidden in plan output (they are still stored in state).
- Inject via CI secrets as `TF_VAR_db_password`, never in `.tfvars` committed to Git.
- Read from a secret store with a data source: AWS Secrets Manager / SSM Parameter Store, Vault, GCP Secret Manager.
- Let the cloud generate and hold the secret: e.g. RDS `manage_master_user_password = true` stores the password in Secrets Manager and it never appears in your code.
- Use `random_password` to generate, and store it straight into Secrets Manager.
- Newer Terraform (1.10+) adds ephemeral values and write-only arguments so some secrets never land in state at all.
- Always: encrypted, access-restricted remote state; `.gitignore` for `*.tfstate` and `*.tfvars`; secret scanning (gitleaks) in CI.

**Example:**
```hcl
resource "aws_db_instance" "app" {
  identifier                  = "app-db"
  engine                      = "postgres"
  instance_class              = "db.t3.medium"
  allocated_storage           = 50
  username                    = "appadmin"
  manage_master_user_password = true   # password lives in Secrets Manager
}

data "aws_secretsmanager_secret_version" "api_key" {
  secret_id = "prod/payment/api-key"
}
```

:::say
I never hardcode secrets; I either inject them from CI as TF_VAR_ variables marked sensitive, read them from Secrets Manager or Vault with data sources, or better, let AWS generate and manage them like RDS managed master passwords. Because state can still contain secrets, the state bucket is encrypted with KMS and tightly access-controlled.
:::

## How do you upgrade a GKE node pool version using Terraform (and manually)?

<!-- source: 05 Q26 -->

:::note In simple words
First upgrade the brain (control plane), then swap the workers (nodes) a few at a time, so the shop never closes.
:::

Order: control plane first, then node pools (nodes can be up to a couple of minor versions behind the master, never ahead).

Terraform way:
1. Bump `min_master_version` on `google_container_cluster` (or let a release channel handle it) and apply.
2. Bump `version` on `google_container_node_pool`, set `upgrade_settings` for surge upgrades, and apply. GKE drains and replaces nodes gradually.
3. For big jumps, use blue/green: create a new node pool with the new version, cordon/drain the old one, then remove it from code.
4. Many teams instead set `release_channel` + `auto_upgrade = true` with a maintenance window, and add `lifecycle { ignore_changes = [version] }` so Terraform does not fight auto-upgrades.

Manual way:
```bash
gcloud container clusters upgrade my-cluster --master --cluster-version=1.30 --region=asia-south1
gcloud container clusters upgrade my-cluster --node-pool=default-pool \
  --cluster-version=1.30 --region=asia-south1
```

**Example:**
```hcl
resource "google_container_node_pool" "apps" {
  name     = "apps"
  cluster  = google_container_cluster.main.name
  location = "asia-south1"
  version  = "1.30.5-gke.1014001"

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }

  management {
    auto_repair  = true
    auto_upgrade = false
  }
}
```

:::say
I upgrade the control plane first, then change the version field on the google_container_node_pool resource with surge settings of max_surge 1 and max_unavailable 0, so nodes are replaced gradually and PodDisruptionBudgets keep apps up. For risky jumps I create a new node pool and drain the old one, and if we use release channels I ignore the version field so Terraform does not fight auto-upgrades.
:::

## How do you create an EKS cluster using Terraform, and where do Kubernetes core components come into play?

<!-- source: 05 Q27 -->

*Also asked as:* When an EKS cluster is deployed via Terraform, what gets created? What is Karpenter used for?

:::note In simple words
Terraform orders the building (network, cluster, worker nodes, permissions). AWS runs the brain of Kubernetes for you; your nodes are the workers.
:::

What Terraform creates (usually with the community `terraform-aws-modules/eks` module):
- VPC with private subnets for nodes and public subnets for load balancers (tagged for EKS).
- EKS cluster -> AWS runs and patches the **control plane** (API server, etcd, scheduler, controller manager) across 3 AZs.
- Managed node groups (EC2 in an Auto Scaling Group) -> these run **kubelet, kube-proxy, container runtime**.
- Add-ons: VPC CNI, CoreDNS, kube-proxy, EBS CSI driver.
- IAM: cluster role, node role, IRSA / Pod Identity for app permissions, access entries for who can use kubectl.

Also created: the **cluster security group** (control plane <-> nodes), the **OIDC issuer** URL (plus the IAM OIDC provider used by IRSA), **launch templates** for node groups, and access entries. Locally you get `terraform.tfstate` in the remote backend with its lock, and `.terraform.lock.hcl`.

The **kubeconfig** is not created by Terraform: you generate it with `aws eks update-kubeconfig`. Then deploy apps with Helm or Argo CD (keep app deployments separate from cluster Terraform).

**Karpenter** (short version): a node autoscaler that watches pending pods and launches right-sized EC2 instances directly in seconds, picks from many instance types including Spot, and consolidates under-used nodes to save cost. Cluster Autoscaler only resizes pre-defined node groups, so it is slower and less flexible. The Kubernetes chapter covers it in depth.

**Example:**
```hcl
module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "~> 20.0"
  cluster_name    = "prod-eks"
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    general = {
      instance_types = ["m6i.large"]
      min_size       = 2
      max_size       = 6
      desired_size   = 3
    }
  }
}
```
```bash
aws eks update-kubeconfig --name prod-eks --region ap-south-1
kubectl get nodes
```

:::say
I use the terraform-aws-modules EKS module on top of a VPC module; it creates the managed control plane, which AWS runs with the API server, etcd, scheduler and controllers, plus managed node groups that run kubelet and kube-proxy, and the core add-ons like VPC CNI and CoreDNS. Application deployment is kept separate, via Helm or Argo CD.
:::

## You wrote Terraform for an EKS cluster plus a Kubernetes service account. The IAM role must exist before the cluster, and IRSA needs the OIDC provider, which only exists after the cluster. How do you solve the ordering?

<!-- source: 05 Q28 -->

:::note In simple words
It is a chain of dominoes. Terraform knows the order automatically if each piece points at the one before it, so you do not have to force anything.
:::

The correct chain:
1. **Cluster IAM role** (trusts `eks.amazonaws.com`) + policy attachment.
2. **EKS cluster** with `role_arn = aws_iam_role.cluster.arn` -> implicit dependency, the role is created first.
3. **IAM OIDC provider** using the cluster's issuer URL `aws_eks_cluster.this.identity[0].oidc[0].issuer` -> automatically created after the cluster.
4. **IRSA role** whose trust policy allows `sts:AssumeRoleWithWebIdentity` from that OIDC provider, with a condition on `<issuer>:sub = system:serviceaccount:<ns>:<sa>` (and `:aud = sts.amazonaws.com`).
5. **kubernetes_service_account** annotated with `eks.amazonaws.com/role-arn = <IRSA role ARN>`.

Key points:
- No `depends_on` needed: attribute references create the dependencies.
- Who can use kubectl: use **EKS access entries** (`aws_eks_access_entry` + access policy) instead of editing the old `aws-auth` ConfigMap; access entries are plain AWS API resources, so there is no chicken-and-egg.
- The **kubernetes provider** must be configured from cluster outputs (endpoint, CA, token). Providers cannot fully depend on resources in the same apply, so it is recommended to apply the cluster in one stack and Kubernetes objects (service accounts, Helm) in a separate apply/stack.
- Newer alternative: **EKS Pod Identity** (`aws_eks_pod_identity_association`) avoids the OIDC provider step entirely.

**Example:**
```hcl
resource "aws_eks_cluster" "this" {
  name     = "prod-eks"
  role_arn = aws_iam_role.cluster.arn              # step 1 -> 2
  vpc_config { subnet_ids = var.private_subnets }
  access_config { authentication_mode = "API" }
}

data "tls_certificate" "oidc" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {   # step 3
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.oidc.certificates[0].sha1_fingerprint]
}

locals {
  issuer = replace(aws_iam_openid_connect_provider.eks.url, "https://", "")
}

data "aws_iam_policy_document" "irsa_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.issuer}:sub"
      values   = ["system:serviceaccount:app:app-sa"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.issuer}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app_irsa" {               # step 4
  name               = "prod-app-irsa"
  assume_role_policy = data.aws_iam_policy_document.irsa_trust.json
}

resource "kubernetes_service_account" "app" {      # step 5 (ideally separate stack)
  metadata {
    name        = "app-sa"
    namespace   = "app"
    annotations = { "eks.amazonaws.com/role-arn" = aws_iam_role.app_irsa.arn }
  }
}
```

:::say
I let Terraform order it through attribute references: the cluster references the cluster role ARN, the OIDC provider references the cluster issuer URL, the IRSA role trusts that OIDC provider with a sub condition for the service account, and the service account is annotated with the role ARN. I use EKS access entries instead of aws-auth, and I configure the kubernetes provider from cluster outputs in a separate stack, or use EKS Pod Identity to skip the OIDC step.
:::

## Write Terraform code to deploy an EKS cluster, a Helm chart and the Datadog agent, and use the agent for monitoring.

<!-- source: 05 Q29 -->

:::note In simple words
Terraform builds the cluster, then installs the Datadog "spy" on every node using Helm, then creates an alarm rule in Datadog - all from one codebase.
:::

Pieces:
- `terraform-aws-modules/eks` creates the cluster and nodes.
- The **helm provider** authenticates to the cluster using its endpoint, CA and `aws eks get-token`.
- `helm_release` installs the `datadog/datadog` chart; the API key comes from a **sensitive** variable (fed from CI secrets / Secrets Manager) via `set_sensitive`.
- Values enable **logs, APM and the process agent**.
- The **Datadog provider** creates a `datadog_monitor` so alerts are code too.
- In real setups, put the Helm and Datadog parts in a separate stack from the cluster (same provider-ordering reason as IRSA).

**Example:**
```hcl
terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.0" }
    helm    = { source = "hashicorp/helm", version = "~> 2.17" }
    datadog = { source = "DataDog/datadog", version = "~> 3.0" }
  }
}

variable "datadog_api_key" {
  type      = string
  sensitive = true
}
variable "datadog_app_key" {
  type      = string
  sensitive = true
}

module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "~> 20.0"
  cluster_name    = "prod-eks"
  cluster_version = "1.30"
  vpc_id          = var.vpc_id
  subnet_ids      = var.private_subnets
  enable_cluster_creator_admin_permissions = true
  eks_managed_node_groups = {
    general = { instance_types = ["m6i.large"], min_size = 2, max_size = 5, desired_size = 3 }
  }
}

provider "helm" {
  kubernetes {   # helm provider 3.x uses: kubernetes = { ... }
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

resource "helm_release" "datadog" {
  name             = "datadog"
  repository       = "https://helm.datadoghq.com"
  chart            = "datadog"
  namespace        = "datadog"
  create_namespace = true

  values = [yamlencode({
    datadog = {
      site          = "datadoghq.com"
      clusterName   = module.eks.cluster_name
      logs          = { enabled = true, containerCollectAll = true }
      apm           = { portEnabled = true }
      processAgent  = { enabled = true, processCollection = true }
    }
  })]

  set_sensitive {
    name  = "datadog.apiKey"
    value = var.datadog_api_key
  }
}

provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
}

resource "datadog_monitor" "pod_restarts" {
  name    = "[prod-eks] Pods restarting"
  type    = "query alert"
  query   = "change(max(last_5m),last_5m):sum:kubernetes_state.container.restarts{kube_cluster_name:prod-eks} by {kube_deployment} > 3"
  message = "Pods in {{kube_deployment.name}} are restarting. @teams-devops-alerts"
  monitor_thresholds {
    critical = 3
  }
}
```
```bash
export TF_VAR_datadog_api_key=... TF_VAR_datadog_app_key=...   # from CI secret store
terraform init && terraform plan -out=tfplan && terraform apply tfplan
kubectl get pods -n datadog    # agent DaemonSet + cluster agent
```

:::say
I create the cluster with the EKS module, configure the helm provider from the cluster endpoint, CA and aws eks get-token, and install the datadog chart with helm_release, passing the API key as a sensitive variable with set_sensitive and enabling logs, APM and process collection in the values. Then I use the Datadog provider to create monitors like a pod-restart alert, so the monitoring itself is code, and I keep the Helm layer in a separate stack from the cluster.
:::

## How do you detect drift in Terraform and troubleshoot it?

<!-- source: 05 Q30 -->

:::note In simple words
Every night a guard compares the recipe with the real cake and raises a flag if anything differs.
:::

Detect:
- `terraform plan -refresh-only` - shows only what changed outside Terraform.
- `terraform plan -detailed-exitcode` in a scheduled CI job: exit code `0` = no changes, `2` = drift/changes, `1` = error. Alert on `2` (Teams/Slack).
- Managed drift detection: HCP Terraform, Spacelift, env0. (driftctl was used earlier but is no longer actively developed.)
- AWS Config / CloudTrail show who changed what and when.

Troubleshoot:
1. Read the plan diff: which resource and which attribute.
2. Check CloudTrail for the API call, user, and time.
3. Decide: was it an unwanted change (revert) or an intended hotfix (codify)?
4. Revert -> `terraform apply`. Codify -> update code until plan is clean, or `apply -refresh-only` then update code.
5. If a field is legitimately changed by something else (e.g. ASG desired count by autoscaler), add `lifecycle { ignore_changes = [...] }`.
6. Prevent: restrict console write access in prod (read-only roles, SCPs), all changes through PRs.

**Example:**
```bash
terraform plan -refresh-only -detailed-exitcode -input=false
echo $?   # 2 means drift found -> send alert
```

:::say
I run terraform plan with detailed-exitcode on a schedule in CI and alert when it returns 2, and I use CloudTrail to find who made the change. Then I either revert by applying the code or codify the change, use ignore_changes for fields managed by other systems, and prevent recurrence by making prod console access read-only.
:::

## How do you integrate Terraform with CI/CD and safely deploy infrastructure changes to production?

<!-- source: 05 Q31 -->

:::note In simple words
Nobody changes production by hand. A robot shows everyone the exact plan, a human approves it, and the robot applies exactly that approved plan.
:::

Pipeline stages:
1. **Format and lint**: `terraform fmt -check`, `terraform validate`, `tflint`.
2. **Security / policy scan**: Checkov, tfsec/Trivy, and policy-as-code (OPA/Conftest or Sentinel) - e.g. "no public S3", "no deleting RDS".
3. **Plan** on every pull request; post the plan as a PR comment. Save it with `-out=tfplan`.
4. **Review and approval**: required reviewers plus a manual approval gate for prod (Jenkins input, GitHub environments).
5. **Apply the saved plan**: `terraform apply tfplan` - guarantees what was approved is what runs.
6. **Promote**: dev -> stage -> prod, same module version.
7. **Post-apply checks**: smoke tests, monitoring, and a scheduled drift check.

Safety guardrails:
- CI uses short-lived credentials (OIDC to an IAM role), no static keys.
- Fail the pipeline if the plan contains destroys of protected resource types unless explicitly approved.
- `prevent_destroy` and cloud-side `deletion_protection` on critical resources.
- Small, frequent changes; separate states per component to reduce blast radius.
- Schedule risky changes in a maintenance window with a rollback plan.

**Example:**
```bash
terraform fmt -check && terraform validate && tflint
checkov -d .
terraform plan -out=tfplan -input=false
terraform show -json tfplan > plan.json
conftest test plan.json          # OPA policies, e.g. deny destroy of aws_db_instance
# ... manual approval ...
terraform apply -input=false tfplan
```

:::say
My Terraform pipeline runs fmt, validate, tflint and Checkov, then generates a saved plan on every pull request, checks it against OPA policies such as no destroys on databases, and requires approval for prod. After approval it applies exactly that saved plan using OIDC short-lived credentials, and changes are promoted from dev to stage to prod.
:::

## What are RPO and RTO, and how does Terraform / IaC help you meet them in disaster recovery?

<!-- source: 05 Q32 -->

*Also asked as:* Have you worked on DR? What is RTO vs RPO?

:::note In simple words
RPO is how much data you can afford to lose (for example "at most 5 minutes of orders"). RTO is how fast you must be back up (for example "running again within 1 hour"). Backups protect the RPO; being able to rebuild quickly protects the RTO.
:::

- **RPO (Recovery Point Objective)** - maximum acceptable data loss, measured in time.
- **RTO (Recovery Time Objective)** - maximum acceptable downtime until service is restored.

RPO - Terraform does not back up your data. Data RPO comes from database backups, point-in-time recovery (PITR), and cross-region replication. Terraform's job is to **configure** those consistently:
- `backup_retention_period` on RDS (enables automated backups + PITR).
- `aws_backup_plan` with a cross-region `copy_action`.
- S3 Cross-Region Replication (`aws_s3_bucket_replication_configuration`).
- **State RPO**: the state file itself needs a versioned remote backend (S3 versioning, or Azure Blob versioning plus soft delete) so you can always restore it.
- Note: running backup scripts through provisioners is an anti-pattern. Use managed backup services instead.

RTO - this is where IaC shines:
- Modular, **region-parameterized** code so the same stack can be applied in the DR region just by changing a variable.
- A CI pipeline ready to rebuild the stack in the DR region.
- Pre-provisioned **pilot light / warm standby** resources (replica DB, minimal nodes) already defined in code, to cut rebuild time.
- Monitoring and alerts defined in code so DR comes up already observable.
- **Regular DR drills** where you actually time the rebuild and compare it with the RTO target.

**Example:**
```hcl
resource "aws_backup_plan" "db" {
  name = "prod-db-daily"
  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(0 2 * * ? *)"
    lifecycle { delete_after = 35 }
    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn   # vault in the DR region
      lifecycle { delete_after = 35 }
    }
  }
}

resource "aws_db_instance" "primary" {
  identifier              = "prod-db"
  backup_retention_period = 7          # automated backups + PITR
  # ...
}

resource "aws_db_instance" "dr_replica" {
  provider            = aws.dr          # provider alias for the DR region
  identifier          = "prod-db-dr"
  replicate_source_db = aws_db_instance.primary.arn
  instance_class      = "db.r6g.large"
}
```

:::say
RPO is how much data we can afford to lose and RTO is how quickly we must recover. Terraform does not back up data, but I use it to configure backups, PITR, AWS Backup cross-region copies and replicas for RPO, and I keep state in a versioned backend. For RTO I keep region-parameterized modules, a pipeline that can rebuild in the DR region, pilot-light resources, and I run timed DR drills to prove we meet the target.
:::

## How do you perform zero-downtime updates with Terraform?

<!-- source: 05 Q34 -->

:::note In simple words
When you replace a bridge, you build the new one next to it, move the traffic across, and only then knock down the old one. By default Terraform knocks down first and builds second.
:::

- **Know which changes force replacement.** In the plan, `-/+` or "forces replacement" means destroy then create, which is downtime by default. Examples: changing an instance's AMI or subnet, an RDS identifier, some launch template settings.
- **`lifecycle { create_before_destroy = true }`**: Terraform creates the new resource, repoints dependencies, then deletes the old one. Names must be unique, so use `name_prefix` instead of a fixed `name`.
- **Auto Scaling Groups:** change the launch template version and use `instance_refresh` with `min_healthy_percentage`, so instances roll one batch at a time behind the load balancer health checks.
- **Blue-green with Terraform:** two target groups (or two ASGs) and a weighted ALB listener rule; shift the weights in steps through variables.
- **Databases:** prefer in-place modifications, keep `apply_immediately = false` for the maintenance window, and use RDS Blue/Green Deployments for engine upgrades.
- Protect critical resources with `prevent_destroy`, and review every plan for unexpected replacements.

**Example:**
```hcl
resource "aws_launch_template" "app" {
  name_prefix   = "app-"
  image_id      = var.ami_id
  instance_type = "t3.medium"
  lifecycle { create_before_destroy = true }
}

resource "aws_autoscaling_group" "app" {
  name_prefix         = "app-"
  min_size            = 2
  max_size            = 6
  vpc_zone_identifier = var.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
    preferences { min_healthy_percentage = 90 }
  }
}
```

:::say
First I read the plan for anything marked "forces replacement". For those I use `create_before_destroy` with `name_prefix`, so the new resource exists before the old one is removed. For compute behind a load balancer I roll through an ASG instance refresh that keeps 90% healthy, and for risky changes I do blue-green with weighted target groups. Databases get in-place changes or RDS Blue/Green.
:::

## What are circular dependencies in Terraform, and how do you fix them?

<!-- source: 05 Q35 -->

:::note In simple words
Two people each saying "I'll sign the contract after you sign it". Nobody can go first, so nothing happens. Terraform stops with "Error: Cycle".
:::

- Terraform builds a dependency graph from references (and `depends_on`). If A needs B and B needs A, there is no valid order, and plan fails with `Error: Cycle: aws_security_group.a, aws_security_group.b`.
- **Classic case:** two security groups with inline rules that reference each other (app allows DB, DB allows app).
- **Fix: split the relationship into separate resources.** Create both groups with no rules, then add the rules as standalone `aws_vpc_security_group_ingress_rule` resources. The groups no longer depend on each other; the rules depend on both.
- Other fixes: move a value into a variable or data source instead of a resource reference, remove an unnecessary `depends_on`, or split modules whose outputs feed each other.
- Use `terraform graph | dot -Tsvg > graph.svg` to see the loop.

**Example:**
```hcl
# BAD: inline rules referencing each other -> Error: Cycle
# resource "aws_security_group" "app" { ingress { security_groups = [aws_security_group.db.id] } }
# resource "aws_security_group" "db"  { ingress { security_groups = [aws_security_group.app.id] } }

# GOOD: groups first, rules as separate resources
resource "aws_security_group" "app" {
  name_prefix = "app-"
  vpc_id      = var.vpc_id
}
resource "aws_security_group" "db" {
  name_prefix = "db-"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
```

:::say
A cycle happens when two resources reference each other, so Terraform can't decide what to create first and fails with "Error: Cycle". The typical case is two security groups with inline rules pointing at each other. I fix it by creating the groups without rules and adding the rules as separate resources, which breaks the loop. `terraform graph` helps me see where the loop is.
:::
