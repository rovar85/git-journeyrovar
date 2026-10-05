---
track: cloud
title: Cloud networking and identity (IAM)
short: Networking, IAM
sub: Design a virtual network with subnets and security rules, and control who may do what with identity and access management.
---

:::goals
- plan a VPC/VNet with public and private subnets across zones
- explain security groups, route tables, NAT and load balancers
- read an IAM policy and apply least privilege
- describe roles, SSO and temporary credentials
:::

## The virtual network

A **VPC** (AWS, Google) or **VNet** (Azure) is your private network in the cloud, defined by a CIDR block you choose (see the Networking track). You divide it into **subnets**, usually one per availability zone and per tier:

| Subnet type | Contains | Route to the internet |
|---|---|---|
| **Public** | load balancers, bastion hosts | route to an **internet gateway** |
| **Private (app)** | application servers | outbound only, through a **NAT gateway** in a public subnet |
| **Private (data)** | databases | no internet route at all |

Plan the address space with the same maths you did by hand. A planner using Python (real):

```run
python3 - <<'EOF'
import ipaddress
vpc = ipaddress.ip_network("10.20.0.0/16")
subnets = list(vpc.subnets(new_prefix=24))
plan = []
zones = ["a", "b"]
tiers = ["public", "app", "data"]
i = 0
for tier in tiers:
    for z in zones:
        plan.append((f"{tier}-{z}", subnets[i]))
        i += 1
print("VPC", vpc, "has", len(subnets), "possible /24 subnets; using", len(plan))
for name, net in plan:
    print(f"  {name:10} {str(net):16} usable hosts: {net.num_addresses - 2:4}")
print()
print("Reserved by many clouds per subnet: first 4 and last 1 address (AWS keeps 5)")
print("Free space left for growth:", len(subnets) - len(plan), "more /24 subnets")
EOF
```

Leave room: you cannot easily resize a VPC, and it must not **overlap** with your on-premises networks (or other VPCs) if you will ever connect them (VPN, Direct Connect/ExpressRoute, peering).

## Controlling traffic

| Tool | Level | Behaviour |
|---|---|---|
| **Security group** (AWS) / **network security group** (Azure) | per instance or NIC | **stateful** allow rules; everything not allowed is denied; replies are allowed automatically |
| **Network ACL** | per subnet | stateless allow/deny rules, evaluated in order (a second layer) |
| **Route table** | per subnet | where traffic for each destination goes (the routing lesson in the Networking track) |
| **Load balancer** | in front of a tier | spreads traffic, health checks, TLS termination |
| **WAF** | HTTP layer | blocks common web attacks |
| **Private endpoints / service endpoints** | to PaaS services | reach storage or databases without going over the internet |

Typical rules: the load balancer's security group allows 443 from the internet; the app tier allows 8080 **only from the load balancer's group**; the database allows 1433 or 5432 **only from the app group**. Referencing groups instead of IPs means rules survive scaling.

A security-group rule set as Terraform, plus a quick Python check that no rule opens a sensitive port to the world (the kind of audit script people run in CI). First part is **Example (not run here)**:

```hcl:sg.tf (Example, not run here)
resource "aws_security_group" "db" {
  name   = "ev-db"
  vpc_id = aws_vpc.main.id
  ingress {
    description     = "SQL from app tier only"
    from_port       = 1433
    to_port         = 1433
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}
```

```run
python3 - <<'EOF'
rules = [
    {"name": "web-https",   "port": 443,  "source": "0.0.0.0/0"},
    {"name": "app-from-lb", "port": 8080, "source": "sg-lb"},
    {"name": "ssh-admin",   "port": 22,   "source": "0.0.0.0/0"},
    {"name": "db-sql",      "port": 1433, "source": "sg-app"},
    {"name": "rdp-office",  "port": 3389, "source": "203.0.113.0/24"},
    {"name": "db-oops",     "port": 5432, "source": "0.0.0.0/0"},
]
sensitive = {22: "SSH", 3389: "RDP", 1433: "SQL Server", 5432: "PostgreSQL", 3306: "MySQL"}
print("Findings (sensitive ports open to the whole internet):")
found = False
for r in rules:
    if r["source"] == "0.0.0.0/0" and r["port"] in sensitive:
        print(f"  RISK  {r['name']}: {sensitive[r['port']]} (port {r['port']}) open to 0.0.0.0/0")
        found = True
if not found:
    print("  none")
EOF
```

Admin access should go through a **bastion**, **VPN**, or better a managed session service (AWS Systems Manager Session Manager, Azure Bastion), not SSH/RDP open to the world.

## Identity and access management (IAM)

IAM answers "**who** can do **what** on **which** resources". Key concepts (AWS words; Azure and Google are equivalent):

| Concept | Meaning |
|---|---|
| **Principal** | a user, a group, a **role**, a service or an application |
| **Policy** | a JSON document of permissions: `Effect` (Allow/Deny), `Action`, `Resource`, optional `Condition` |
| **Role** | an identity with permissions that someone (or something) **assumes** and receives **temporary credentials** for |
| **MFA** | second factor for people |
| **SSO / federation** | log in with the company identity (Entra ID, Okta); no separate cloud passwords |
| **Service account / managed identity** | an identity for a workload (a VM, a Pod, a pipeline) so it needs no stored password |

A policy and a quick analyser (real Python):

```run
python3 - <<'EOF'
import json
policy = json.loads("""
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": ["s3:GetObject", "s3:ListBucket"],
     "Resource": ["arn:aws:s3:::ev-archive", "arn:aws:s3:::ev-archive/*"]},
    {"Effect": "Allow", "Action": "s3:*", "Resource": "*"},
    {"Effect": "Allow", "Action": "iam:*", "Resource": "*"}
  ]
}""")
print("Review of the policy:")
for i, st in enumerate(policy["Statement"], 1):
    actions = st["Action"] if isinstance(st["Action"], list) else [st["Action"]]
    res = st["Resource"] if isinstance(st["Resource"], list) else [st["Resource"]]
    flags = []
    if any(a == "*" or a.endswith(":*") for a in actions):
        flags.append("wildcard action")
    if "*" in res:
        flags.append("all resources")
    if any(a.startswith("iam:") for a in actions):
        flags.append("can change permissions (privilege escalation risk)")
    print(f"  statement {i}: {', '.join(actions)} on {len(res)} resource(s) -> {'; '.join(flags) if flags else 'looks scoped'}")
EOF
```

Statement 1 is **least privilege**: read one bucket. Statements 2 and 3 are the kind that cause incidents: everything in S3 and the right to grant more rights. **Least privilege** means start with nothing and add only what is needed; prefer **roles with temporary credentials** over long-lived access keys; require MFA; review with the cloud's access analysers; and **never put keys in code or Git**.

## Credentials for pipelines and workloads

| Where | Use |
|---|---|
| A VM | an **instance role / managed identity**: the SDK fetches temporary credentials automatically |
| A Kubernetes Pod | **IRSA** (EKS), **Workload Identity** (AKS, GKE): a Pod's ServiceAccount maps to a cloud role |
| CI pipeline | **OIDC federation**: the pipeline proves its identity to the cloud and receives a short-lived role; no stored keys |
| A person | SSO login, MFA, role per task |

## DNS and load balancing in the cloud

Services get private DNS names inside the VPC; public names live in a DNS service (Route 53, Azure DNS) with **health-checked records**. A load balancer (Layer 4 TCP/UDP or Layer 7 HTTP) sits in front of the app tier across zones, so a failed instance or zone is removed automatically, which ties back to Kubernetes Services and Ingress.

:::recap
- A VPC/VNet is a private network you plan with CIDR: public, app and data subnets across at least two zones, no overlap with other networks.
- Security groups (stateful, per resource), route tables and load balancers control traffic; reference groups instead of IPs; no admin ports open to the world.
- IAM: principals, policies, roles with temporary credentials, MFA, SSO. Least privilege; no keys in code; prefer OIDC and managed identities.
:::

:::try Your turn
Plan a /16 VPC for EV production with web, app, SQL and backup tiers over three zones. How many /24 subnets do you need, and how many /24 remain for growth?
:::

:::quiz
? Which subnet should hold the database?
+ A private subnet with no route to the internet
- A public subnet
- Any subnet with a public IP
- The load balancer's subnet
! Only the app tier should reach it.
? What is the safest credential for a CI pipeline to a cloud?
+ OIDC federation to a short-lived role
- A long-lived key stored in the repo
- The root password
- An admin user's key in a variable
! Nothing stored means nothing to leak.
? What does least privilege mean?
+ Grant only the permissions needed, and nothing more
- Give everyone admin
- Share one account
- Disable MFA
! Start from zero and add.
:::
