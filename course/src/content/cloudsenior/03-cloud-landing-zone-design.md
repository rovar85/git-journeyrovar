---
track: cloudsenior
title: Q3: Describe your approach to cloud landing zone design
short: Q3 Landing zone
sub: The foundations every workload lands on: account structure, identity, networking, guardrails and logging, with a rule checker for a landing zone plan and Terraform that refuses a non-compliant account.
---

:::goals
- explain what a landing zone is and its six building blocks
- design an organisation structure (accounts or subscriptions and management groups) for separation and blast-radius control
- describe account vending: how a new team gets a compliant account in minutes
- check a landing zone plan against rules with a script, and enforce the same rules in Terraform
- structure a senior answer, including what you would build first
:::

:::note Provenance
The checker and Terraform run for real (offline). Provider product names (AWS Organizations, Control Tower, Azure management groups, Google Cloud resource hierarchy) are **from my own knowledge**; the lab has no cloud account.
:::

## 1. What a landing zone is

A **landing zone** is the **pre-built, governed foundation** in which workloads are deployed: a structure of accounts (AWS) or subscriptions (Azure) or projects (Google Cloud), with **identity, networking, security controls, logging and cost management** already in place. Teams do **not** start from an empty account and invent their own rules; they **land** in a place that is already safe and wired in.

Interviewers use this question to see whether you think in **platform and governance** terms: **separation, guardrails, repeatability, auditability and self-service**.

## 2. The six building blocks

| Block | What it contains | Why |
|---|---|---|
| **1. Organisation structure** | a root, then **groups of accounts** by purpose (security, shared infrastructure, production workloads, non-production, sandbox) | separate **blast radius, permissions, billing and policy** |
| **2. Identity and access** | central identity provider with **single sign-on**, role-based access, **short-lived credentials**, a **break-glass** account, no long-lived keys | one place to join, move and leave people; least privilege |
| **3. Network** | a **hub-and-spoke** (or similar) topology: shared services and egress inspection in a hub, workloads in spokes; non-overlapping address plan (Q6); central DNS | consistent connectivity, no accidental internet exposure |
| **4. Guardrails** | organisation-level policies that **cannot be overridden by account admins**: allowed regions, block public storage, require encryption, deny disabling logging | prevent the worst mistakes everywhere |
| **5. Logging and security** | an **immutable, central log archive** account; security tooling account with detective services; audit trails from every account | evidence, detection, forensics (Q4) |
| **6. Cost and operations** | tagging standard, budgets and alerts per account, cost allocation, backup baseline | accountability (Q5) |

Provider names for the structure (from my knowledge): AWS **Organizations** with organisational units and **service control policies**, often assembled with **Control Tower** or the landing zone accelerator; Azure **management groups, subscriptions and Azure Policy**, following the Cloud Adoption Framework's "Azure landing zones"; Google Cloud **organisation, folders and projects** with **organisation policies**.

## 3. A reference structure

```
Root / Organisation
├── Security                  (log archive account, security tooling account: locked down, few people)
├── Infrastructure            (network hub, shared services, identity, CI/CD runners)
├── Workloads
│   ├── Production            (one account per application or per tier: strong guardrails, change control)
│   └── Non-production        (dev, test: relaxed but still guarded, with budgets and auto-shutdown)
├── Sandbox                   (experiments: tight budget caps, no connectivity to production, auto-cleanup)
└── Suspended / Decommissioned (accounts being closed, all permissions denied)
```

Design choices to defend:

- **Many accounts, not one big one.** An account is the strongest isolation boundary the cloud offers: separate permissions, quotas, billing and blast radius. A compromised dev account must not reach production.
- **Policies attach to groups of accounts**, so "Production" can forbid things "Sandbox" allows.
- **Centralise what must be trustworthy** (logs, security tooling) in accounts **that workload teams cannot modify**.

## 4. Account vending: the self-service heart

A landing zone is only as good as the **speed and safety of creating a new account**. **Account vending** is an automated pipeline: a team requests an account (name, owner, cost centre, environment), and automation:

1. creates the account in the **right group** of the hierarchy,
2. applies the **baseline**: guardrails inherited from the group, **tags**, budget alert, encryption defaults, logging to the central archive, security tooling enrolment,
3. connects it to the **network** (a spoke with an address range from the plan, Q6),
4. sets up **identity**: SSO groups mapped to roles,
5. records it in the **inventory** (the code repository is the source of truth).

All of this is **infrastructure as code** (Terraform, Q8) in Git, reviewed and applied through a pipeline (Q10). That is also how you **keep 200 accounts consistent**.

## 5. Check a plan against rules

Before any account is created, the **plan** can be checked. A simple checker over a landing zone plan shows the idea (policy as code, Q4, in miniature):

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > lz_check.py <<'EOF'
ALLOWED_REGIONS = {"eu-west", "eu-north"}              # data residency guardrail (Q4)
REQUIRED_TAGS = {"owner", "cost_center", "env"}
PLAN = {
    "log-archive":  {"group": "Security",       "tags": {"owner": "secops", "cost_center": "CC10", "env": "prod"}, "region": "eu-west", "budget": 500,  "admins": []},
    "net-hub":      {"group": "Infrastructure", "tags": {"owner": "platform", "cost_center": "CC11", "env": "prod"}, "region": "eu-west", "budget": 3000, "admins": []},
    "ev-prod":      {"group": "Workloads/Production", "tags": {"owner": "ev-team", "cost_center": "CC20", "env": "prod"}, "region": "eu-west", "budget": 9000, "admins": []},
    "ev-test":      {"group": "Workloads/Production", "tags": {"owner": "ev-team", "env": "test"}, "region": "us-east", "budget": None, "admins": ["alice"]},
    "play-bob":     {"group": "Sandbox",        "tags": {"owner": "bob", "cost_center": "CC99", "env": "sandbox"}, "region": "eu-north", "budget": 100, "admins": ["bob"]},
}

def check(plan):
    problems = []
    if "log-archive" not in plan:
        problems.append("plan: there is no central log archive account")
    for name, a in plan.items():
        missing = REQUIRED_TAGS - set(a["tags"])
        if missing:                                    problems.append(f"{name}: missing tags {sorted(missing)}")
        if a["region"] not in ALLOWED_REGIONS:         problems.append(f"{name}: region {a['region']} is not allowed (data residency)")
        if a["budget"] is None:                        problems.append(f"{name}: no budget alert configured")
        if a["tags"].get("env") != "prod" and a["group"].endswith("Production"):
                                                       problems.append(f"{name}: a {a['tags'].get('env')} account is in the Production group")
        if a["admins"] and not a["group"].startswith("Sandbox"):
                                                       problems.append(f"{name}: standing admin users {a['admins']} outside Sandbox (use SSO roles with approval)")
    return problems

issues = check(PLAN)
print(f"{len(PLAN)} accounts checked, {len(issues)} problem(s):")
for p in issues: print("  -", p)
EOF
python3 lz_check.py
```

A reviewer sees every violation **before** the account exists. The same rules, once agreed, belong **in the pipeline** (a failed check blocks the merge) **and** in the cloud's own policy engine (so a console click cannot bypass them): **detective and preventive controls**, Q4.

## 6. The same rules in Terraform

Terraform can **refuse** a non-compliant input at plan time with variable validation. This runs offline with the built-in `terraform_data` resource standing in for an account:

```run
mkdir -p ~/lab/cs/lz && cd ~/lab/cs/lz
cat > main.tf <<'EOF'
variable "accounts" {
  type = map(object({
    group       = string
    env         = string
    owner       = string
    cost_center = string
    region      = string
  }))

  validation {
    condition     = alltrue([for k, a in var.accounts : contains(["eu-west", "eu-north"], a.region)])
    error_message = "Each account must use an allowed region: eu-west or eu-north."
  }
  validation {
    condition     = alltrue([for k, a in var.accounts : a.owner != "" && a.cost_center != ""])
    error_message = "Every account needs an owner and a cost centre."
  }
  validation {
    condition     = alltrue([for k, a in var.accounts : a.env == "prod" || !endswith(a.group, "Production")])
    error_message = "Only prod accounts may be placed in the Production group."
  }
}

resource "terraform_data" "account" {
  for_each = var.accounts
  input    = merge(each.value, { name = each.key })
}

output "vended" { value = sort(keys(terraform_data.account)) }
EOF
cat > good.tfvars <<'EOF'
accounts = {
  ev-prod = { group = "Workloads/Production", env = "prod", owner = "ev-team", cost_center = "CC20", region = "eu-west" }
  play-bob = { group = "Sandbox", env = "sandbox", owner = "bob", cost_center = "CC99", region = "eu-north" }
}
EOF
cat > bad.tfvars <<'EOF'
accounts = {
  ev-test = { group = "Workloads/Production", env = "test", owner = "ev-team", cost_center = "CC20", region = "us-east" }
}
EOF
terraform init > /dev/null 2>&1
echo "--- compliant request:"
terraform apply -auto-approve -var-file=good.tfvars | grep "Apply complete"
terraform output -json vended
echo "--- non-compliant request (wrong region, test account in Production):"
terraform plan -var-file=bad.tfvars 2>&1 | sed 's/[│╷╵]//g' | grep -E "^ *(Each account|Only prod|Error: Invalid)" | sed 's/^ *//'
terraform destroy -auto-approve -var-file=good.tfvars | grep "Destroy complete"
```

Terraform stopped the bad request **at plan time, with the reason**. In a real landing zone this is the module that **vends accounts**; the same `variable` rules sit next to **organisation-level policies** in the cloud that enforce them even if someone bypasses Terraform.

## 7. Identity, network and logging, briefly

- **Identity**: federate with the corporate identity provider; people get **roles through groups** (read-only, operator, admin), **just-in-time elevation** with approval for sensitive accounts, **no IAM users with long-lived keys** for humans, workloads use **roles and workload identity** (OIDC), a documented **break-glass** path tested regularly.
- **Network** (Q6): hub-and-spoke or a transit gateway, **central egress and inspection**, **private endpoints** to managed services, **non-overlapping CIDR** from a registry, **centralised DNS**.
- **Logging and detection** (Q4): organisation-wide **audit trail** delivered to the **log archive account** (write-only for workloads, immutable storage), **security findings aggregated** in the security account.

## 8. How to answer

1. **Define** the landing zone in one sentence and name the **goals**: safe by default, fast for teams, auditable, cost-controlled.
2. Walk the **six blocks** in order, giving **one design choice and its reason** for each (many accounts for blast radius, SSO roles for no long-lived keys, preventive policies for the worst mistakes, an immutable log archive).
3. Describe **account vending** as the product: how long it takes, what it creates, how it is tested.
4. Say **what you would build first**: the organisation structure, identity, logging and the guardrails (they are hard to retrofit), then the network, then vending automation.
5. Mention **how it evolves**: versioned modules, a changelog, exception handling (a documented, time-limited, approved exception process).

## 9. Follow-up questions to expect

- "How do you handle **existing accounts** that predate the landing zone?" (enrol them: inventory, apply baseline in audit mode first, move into the structure, fix findings in waves, then enforce)
- "How do you **test** guardrails without breaking teams?" (apply in **audit or monitor mode**, measure what would be denied, then enforce)
- "How big should an account be?" (one per application per environment is a common starting point; avoid both a single shared account and thousands of tiny ones with no automation)
- "What if a team needs an **exception**?" (a recorded, approved, time-boxed exception with an owner)
- "How do you keep it from becoming a **bottleneck**?" (self-service vending, paved paths, policy as code with fast feedback)

:::warn Common mistakes
- **Starting with one big account** and splitting later: it is far harder to move resources than to start separated.
- **Guardrails written but not enforced** (documentation instead of policy).
- **Turning on strict policies without an audit phase**, breaking running workloads.
- **No central logging before workloads arrive**: you cannot add history later.
- **Standing admin access** instead of roles with approval.
- **A landing zone nobody owns.** It is a product with a team, versions and a roadmap.
:::

:::recap
- A landing zone is the governed foundation workloads land in: **structure, identity, network, guardrails, logging, cost**.
- Use **many accounts** grouped by purpose; policies attach to groups; **security and log accounts are locked down**.
- **Account vending** (infrastructure as code plus a pipeline) is what makes it fast and consistent.
- **Check plans with rules** before creation and enforce the same rules **both** in the pipeline and in the cloud's policy engine.
:::

:::try Your turn
Add a fourth validation to the Terraform that rejects any `owner` that is a personal name rather than a team (for example require it to end with "-team" or "ops"), and a rule to `lz_check.py` that every Production account must have a budget of at least 1000. Run both on a plan you change on purpose.
:::

:::quiz
? Why use many accounts instead of one large one?
+ An account is the strongest isolation boundary: permissions, billing, quotas and blast radius are separate
- Accounts are free
- One account cannot hold many resources
- Providers require it
! A compromise or mistake in one account stays contained.
? What is account vending?
+ An automated pipeline that creates a new account with the baseline guardrails, network, identity and tags already applied
- Selling accounts to other companies
- Deleting unused accounts
- A billing report
! It makes the secure path the fast path.
? What is a preventive guardrail?
+ A policy applied at the organisation level that stops a non-compliant action from happening at all
- An alert after the event
- A weekly report
- A code comment
! Detective controls only notice after the fact.
:::
