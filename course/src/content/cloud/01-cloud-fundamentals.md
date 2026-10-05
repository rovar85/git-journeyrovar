---
track: cloud
title: Cloud fundamentals
short: Fundamentals
sub: What "the cloud" is, the service models, regions, shared responsibility and the services you will meet on AWS, Azure and Google Cloud.
---

:::goals
- explain IaaS, PaaS and SaaS and the shared responsibility model
- describe regions, availability zones and why they matter
- map core services between AWS, Azure and Google Cloud
- reason about pricing models and availability numbers
:::

:::note About this track
The lab has no cloud account, so cloud services cannot be run here. This track teaches the concepts with the calculations that can be run (addressing, availability, cost) and shows real CLI and Terraform syntax as **Example (not run here)**. Everything builds on the Linux, Networking, Terraform and Kubernetes tracks.
:::

## What the cloud is

"The cloud" means renting computing from a provider's data centres over the internet, **on demand**, paying for what you use, instead of buying and running your own hardware. Key properties: **self-service** (an API call creates a server in a minute), **elasticity** (grow and shrink), **pay as you go**, and **scale** you could not afford yourself. Everything you can click in a cloud console you can also do through an **API**, so it can be automated with Terraform and Ansible.

## Service models: who manages what

| Model | You manage | Provider manages | Examples |
|---|---|---|---|
| **IaaS** (infrastructure) | OS, runtime, apps, data | hardware, network, virtualisation | virtual machines (EC2, Azure VMs), disks, virtual networks |
| **PaaS** (platform) | your app and data | OS, runtime, scaling, patching | App Service, Elastic Beanstalk, managed databases (RDS, Azure SQL), managed Kubernetes |
| **SaaS** (software) | your configuration and data | everything else | Microsoft 365, Salesforce, GitHub |
| **Serverless / FaaS** | just code, triggered by events | servers disappear from view | AWS Lambda, Azure Functions |

The more the provider manages, the less you operate, but the less control you have and the more you depend on them.

## Shared responsibility

Security and operations are split. The provider secures **"of the cloud"** (data centres, hardware, the hypervisor). You secure **"in the cloud"**: your accounts and identities, network rules, OS patches on VMs, application code and, above all, **your data and who may access it**. Most real breaches are **customer misconfiguration**: a public storage bucket, an overly broad access key, an open database port, not provider failures.

## Regions and availability zones

- A **region** is a geographic area with several data centres (for example `eu-west-2` London, `West Europe`).
- An **availability zone (AZ)** is one or more separate data centres inside a region, with independent power and networking, connected by fast links.
- A **region pair / multi-region** design survives the loss of a whole region.

Place resources close to users (latency), where data laws require (residency), and spread critical systems over **at least two AZs** so one failure does not take you down. You will meet this in subnet design (one subnet per AZ) and in Kubernetes (spread replicas across zones).

## Availability: the arithmetic

An **SLA** quotes availability as a percentage. What it allows per year:

```run
python3 - <<'EOF'
for pct in [99.0, 99.9, 99.95, 99.99, 99.999]:
    down_min = (1 - pct/100) * 365 * 24 * 60
    print(f"{pct:7}%  ->  {down_min:8.1f} minutes of downtime per year  ({down_min/60:6.2f} hours)")
print()
# Components in a chain multiply: web (99.95) -> app (99.95) -> db (99.9)
chain = 0.9995 * 0.9995 * 0.999
print(f"Chain of 99.95% x 99.95% x 99.9%  = {chain*100:.3f}%")
# Redundant components: probability BOTH fail is small
single = 0.99
pair = 1 - (1 - single) ** 2
print(f"One server at 99%      = {single*100:.2f}%")
print(f"Two independent at 99% = {pair*100:.2f}%  (redundancy across zones)")
EOF
```

Two lessons: **dependencies in series reduce availability** (the whole is worse than the weakest part), and **redundancy in parallel** (two zones) raises it sharply. This is why cloud designs remove single points of failure.

## Core services map

| Need | AWS | Azure | Google Cloud |
|---|---|---|---|
| Virtual machine | EC2 | Virtual Machines | Compute Engine |
| Object storage | S3 | Blob Storage | Cloud Storage |
| Block disk | EBS | Managed Disks | Persistent Disk |
| Virtual network | VPC | Virtual Network (VNet) | VPC |
| Load balancer | ELB / ALB | Load Balancer / App Gateway | Cloud Load Balancing |
| Managed relational DB | RDS | Azure SQL / Database for PostgreSQL | Cloud SQL |
| Kubernetes | EKS | AKS | GKE |
| Containers (serverless) | Fargate / ECS | Container Apps / ACI | Cloud Run |
| Functions | Lambda | Functions | Cloud Functions |
| DNS | Route 53 | Azure DNS | Cloud DNS |
| Identity and access | IAM | Entra ID + RBAC | IAM |
| Secrets | Secrets Manager | Key Vault | Secret Manager |
| Monitoring | CloudWatch | Azure Monitor | Cloud Monitoring |
| Infrastructure as code | CloudFormation (and Terraform) | ARM/Bicep (and Terraform) | Deployment Manager (and Terraform) |
| CLI | `aws` | `az` | `gcloud` |

The names differ; the concepts do not. Learn the concepts with one provider and the others come quickly.

## Pricing and cost

| Model | Meaning | Use for |
|---|---|---|
| **On-demand** | pay per second/hour, no commitment | unpredictable or short-lived |
| **Reserved / savings plans** | commit 1 or 3 years for a big discount | steady baseline load |
| **Spot / preemptible** | spare capacity, up to ~70-90% cheaper, can be taken away | batch, CI agents, fault-tolerant work |
| **Free tier** | limited free usage | learning |

```run
python3 - <<'EOF'
hours_month = 730
vm_on_demand = 0.17          # illustrative price per hour, not a real quote
servers = 6
print("Illustrative monthly cost for", servers, "servers at $%.2f/hour" % vm_on_demand)
for label, factor in [("on-demand", 1.0), ("1-year commitment (~35% off)", 0.65), ("spot (~70% off)", 0.30)]:
    print(f"  {label:32} ${servers*vm_on_demand*hours_month*factor:9.2f} per month")
print()
print("Running a test environment only office hours (50 of 168 hours/week):")
print(f"  always on : ${vm_on_demand*hours_month:8.2f} per server per month")
print(f"  scheduled : ${vm_on_demand*hours_month*50/168:8.2f} per server per month")
EOF
```

(Prices are made-up round numbers for illustration.) Big levers: turn things off when unused, right-size, use commitments for steady load and spot for flexible load, and watch **data transfer** charges (leaving the cloud or crossing regions costs money). Always set **budgets and alerts**.

## Getting started safely

1. Create an account with a **root user** you almost never use: enable **MFA**, store its credentials in a vault.
2. Do daily work through **SSO / named identities with roles**, never the root user.
3. Turn on **billing alerts** before you create anything.
4. Use **tags** from day one (`Owner`, `Env`, `CostCentre`).
5. Define everything in **Terraform** and keep it in Git.

```term
$ aws sts get-caller-identity
{ "UserId": "...", "Account": "123456789012", "Arn": "arn:aws:iam::123456789012:role/ops-admin" }
$ aws ec2 describe-instances --query 'Reservations[].Instances[].[InstanceId,State.Name,Tags[?Key==`Name`]|[0].Value]' --output table
$ az account show --query "{subscription:name, tenant:tenantId}"
$ az vm list -d -o table
```

(Example output formats for the CLIs; not run here.)

:::recap
- IaaS, PaaS, SaaS and serverless differ in who manages what. Security is a shared responsibility; most breaches are misconfiguration.
- Regions contain availability zones; design across at least two AZs.
- Availability numbers: series dependencies lower it; redundancy raises it.
- Pricing: on-demand, commitments, spot. Control costs with scheduling, right-sizing, budgets and tags.
:::

:::try Your turn
Your service must reach 99.95% yearly availability. It has a load balancer (99.99%), two app servers in different zones (each 99.5%), and a database (99.95%). Compute the combined availability with the Python approach above.
:::

:::quiz
? In IaaS, who patches the guest operating system?
+ You (the customer)
- The provider
- Nobody
- The registry
! Provider manages hardware and hypervisor; you manage everything above.
? Why use more than one availability zone?
+ A failure of one data centre should not take the service down
- It is cheaper
- It is required by Linux
- It avoids IAM
! Redundancy across independent failure domains.
? Which is a major cause of cloud breaches?
+ Customer misconfiguration (open storage, broad access keys)
- The provider's hardware
- Region names
- Slow networks
! Hence least privilege, review and automation.
:::
