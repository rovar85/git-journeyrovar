---
track: scenarios
title: "S5: Several Terraform modules in different repositories depend on each other and a deployment fails on dependency conflicts. How do you design a reliable deployment strategy?"
short: S5 Terraform dependency strategy
sub: Where Terraform dependencies really live (graph, state, versions), reproducing ordering and contract and version failures for real, a stack-graph tool that computes apply order, cycles and blast radius, and the layered, versioned strategy an interviewer wants to hear.
---

:::goals
- separate the **four kinds of dependency**: within a configuration, between **stacks (states)**, between **module versions**, and between **provider/Terraform versions**
- reproduce an **ordering failure**, a **broken output contract** and a **version-constraint conflict** with real Terraform
- compute **apply order, parallel waves, cycles and blast radius** for a set of stacks with a real tool
- design a strategy: **layered stacks, small blast radius, versioned immutable modules, explicit interfaces, automated pipelines and tests**
- answer the question with trade-offs and follow-ups
:::

:::note Provenance
The ordering, contract and version-conflict failures use **real Terraform output** (built-in provider, local state; no cloud account). The stack-graph tool is Python on an **invented repository layout**. Tool names (Terragrunt, Atlantis, Renovate and others) are from general knowledge and are an **Example, not run here**.
:::

## 1. Four places a dependency can live

| Kind | Example | How it fails |
|---|---|---|
| **1. Inside one configuration** | a subnet needs a VPC (the resource graph) | Terraform handles it: it builds a graph from references; add `depends_on` only for **hidden** dependencies |
| **2. Between stacks (separate state files)** | the app stack needs the network stack's VPC ID | **apply order** (the output does not exist yet), **contract breaks** (an output was renamed), **drift** between them, **circular** stacks |
| **3. Between module versions** | stack uses module A at v1 and module B, which itself needs a different version of module C | **diamond conflicts**, an unpinned `main` branch changing under you, a breaking change in a minor release |
| **4. Between tool versions** | a module says `required_version >= 1.8`, another `< 1.0`; two modules pin incompatible **provider** ranges | `terraform init` refuses; the **lock file** differs between teams or CI and laptops |

Most "deployment fails on dependency conflicts" incidents are **types 2 and 4**, made worse by type 3 when versions are not pinned.

## 2. Type 2: ordering and contracts between stacks (real)

Two stacks, **network** (produces a VPC ID output) and **app** (reads it through the built-in `terraform_remote_state` data source). Each keeps its own state file, just like separate repositories with remote backends.

```run
mkdir -p ~/s5/network ~/s5/app ~/s5/state && cd ~/s5
cat > network/main.tf <<'EOF'
terraform {
  backend "local" {
    path = "../state/network.tfstate"
  }
}
resource "terraform_data" "vpc" {
  input = "vpc-0123"
}
output "vpc_id" {
  value = terraform_data.vpc.output
}
EOF
cat > app/main.tf <<'EOF'
data "terraform_remote_state" "network" {
  backend = "local"
  config = {
    path = "../state/network.tfstate"
  }
}
resource "terraform_data" "svc" {
  input = data.terraform_remote_state.network.outputs.vpc_id
}
output "deployed_in" {
  value = terraform_data.svc.output
}
EOF
echo "=== 1. apply the APP stack first (the network does not exist yet)"
(cd app && terraform init -input=false -no-color > /dev/null && terraform apply -auto-approve -input=false -no-color 2>&1 | grep -E "^Error|No stored" | head -2)
echo
echo "=== 2. apply NETWORK, then APP (correct order)"
(cd network && terraform init -input=false -no-color > /dev/null && terraform apply -auto-approve -input=false -no-color 2>&1 | grep -E "vpc_id|Apply complete")
(cd app && terraform apply -auto-approve -input=false -no-color 2>&1 | grep -E "deployed_in|Apply complete")
```

**What you see:** applying out of order fails with **"Unable to find remote state"**; in the right order it works and the app got its value from the network stack. The order is a **dependency between stacks that Terraform cannot see** (they are separate states), so **you** must encode it in the pipeline.

Now someone on the network team **renames an output**, a breaking change to the interface (the "contract"):

```run
cd ~/s5
sed -i 's/output "vpc_id"/output "network_id"/' network/main.tf
(cd network && terraform apply -auto-approve -input=false -no-color 2>&1 | grep -E "network_id|Apply complete")
echo
echo "=== the app stack, unchanged, now fails to plan:"
(cd app && terraform plan -input=false -no-color 2>&1 | grep -E "^Error|Unsupported attribute|vpc_id" | head -3)
```

**What you see:** the network apply **succeeded**, and the app fails later, in a **different repository and pipeline**. Nothing warned the network team. That is the central design problem: **interfaces between stacks are implicit and unversioned**.

### Defences for stack interfaces

- Treat **outputs as a public API**: document them, **never rename or remove without a deprecation period** (add the new output first, keep the old, migrate consumers, then remove).
- Add a **contract test** in the producer's pipeline: a check that the **required outputs exist and have the right type**.
- Prefer **loose coupling** where it fits: consumers **look up** what they need by **tag, name or a published parameter** (a data source for the VPC by tag, or a value stored in a parameter store) instead of reading another team's raw state file (which also grants access to **everything in that state**, including secrets).
- Keep the **producer's schema versioned** (an output named `vpc_id_v2`, or a published JSON document with a version field).

```run
cd ~/s5
cat > contract.py <<'PY'
import json, subprocess, sys

# the interface the network stack promises to consumers (kept in the producer's repo, reviewed like an API)
CONTRACT = {"vpc_id": "string"}

out = json.loads(subprocess.check_output(["terraform", "output", "-json"], cwd="network"))
problems = []
for name, typ in CONTRACT.items():
    if name not in out:
        problems.append(f"required output '{name}' is missing (a consumer depends on it)")
    elif typ == "string" and not isinstance(out[name]["value"], str):
        problems.append(f"output '{name}' should be a string")
print("contract check:", "OK" if not problems else "FAILED")
for p in problems: print("  -", p)
sys.exit(1 if problems else 0)
PY
python3 contract.py; echo "exit code: $?"
```

**What you see:** the same breaking rename is caught **in the network team's pipeline**, before it reaches anyone else. Restore the output now: `sed -i 's/network_id/vpc_id/' network/main.tf`.

```run
cd ~/s5
sed -i 's/output "network_id"/output "vpc_id"/' network/main.tf
(cd network && terraform apply -auto-approve -input=false -no-color 2>&1 | grep -E "Apply complete")
python3 contract.py
```

## 3. Types 3 and 4: versions

### 3a. Tool and provider constraints (real)

Every module can declare `required_version` (Terraform core) and `required_providers` (provider version ranges). When two modules need **non-overlapping** ranges, `terraform init` cannot satisfy both. Reproduce with Terraform's core-version constraint (the lab has no provider registry access, but the mechanism is the same):

```run
mkdir -p ~/s5/versions/legacy_module && cd ~/s5/versions
cat > legacy_module/main.tf <<'EOF'
terraform {
  required_version = "< 1.0"
}
EOF
cat > main.tf <<'EOF'
module "legacy" {
  source = "./legacy_module"
}
EOF
terraform init -input=false -no-color 2>&1 | grep -v "^$" | sed -n '2,9p'
echo
terraform version | head -1
```

**What you see:** init **refuses**, naming the **module** and the **constraint** that blocks it. With providers the message is similar ("no available releases match the given constraints"). Resolution options, in order of preference: **upgrade the old module** to support current versions (and tag a release), **widen the constraint** after testing, run that stack with the **older Terraform** in a separate pipeline step until migrated, or **pin one version per stack** and stop sharing a runtime across incompatible stacks (use `tfenv`, `asdf` or container images per stack).

### 3b. Module versions: the diamond problem

If a stack uses module **A@1.2** and module **B@2.0**, and A depends on **network@1** while B depends on **network@2**, you have a **diamond** with incompatible requirements. Prevention:

- **Pin every module source to an immutable version**: a **git tag** (`?ref=v1.4.2`) or a registry version with an **exact or tightly bounded constraint** (`~> 1.4`). **Never** point at a branch like `main`: your plan changes without you changing code.
- Use **semantic versioning**: patch = bugfix, minor = backwards-compatible, **major = breaking**. Keep a **CHANGELOG** and release notes saying what a consumer must change.
- **Automate upgrades** (Renovate or Dependabot opening pull requests that bump the version and run the plan), so you upgrade **often and in small steps** instead of in a painful big bang.
- **Commit `.terraform.lock.hcl`** so CI and laptops use the **same provider builds**.
- **Test modules** (`terraform test`, or unit-style checks with mock providers, plus an integration environment) so a release is known-good before consumers see it.

Here is a tiny resolver that checks a set of pinned requirements for conflicts, the check you want in CI before applying anything:

```run
cd ~/s5
cat > resolve.py <<'PY'
# each module pins the versions of the shared modules it was built against
REQUIRES = {
    "stack/app":        {"module-a": "1.2.0", "module-b": "2.0.0"},
    "module-a@1.2.0":   {"module-network": "1.x"},
    "module-b@2.0.0":   {"module-network": "2.x"},
    "module-b@1.9.0":   {"module-network": "1.x"},
}
def major(v): return v.split(".")[0]

# gather every requirement on every shared module, then look for incompatible majors
wants = {}
def walk(node):
    for dep, ver in REQUIRES.get(node, {}).items():
        wants.setdefault(dep, set()).add((major(ver), node))
        walk(f"{dep}@{ver}")
walk("stack/app")
conflict = False
for dep, reqs in wants.items():
    majors = {m for m, _ in reqs}
    if len(majors) > 1:
        conflict = True
        print(f"CONFLICT on {dep}: needs majors {sorted(majors)}")
        for m, who in sorted(reqs): print(f"    {who} wants {dep} v{m}")
print("\nresolution: upgrade module-a to a release built against network v2, or pin module-b@1.9.0 (network v1) until a is ready" if conflict else "no conflicts")
PY
python3 resolve.py
```

## 4. Designing the strategy: layers, graph, pipeline

**Layered ("stack per lifecycle") architecture.** Split by **how often things change and who owns them**:

| Layer | Contains | Changes | Depends on |
|---|---|---|---|
| **0 Foundation** | accounts, org policies, state buckets, identity | rarely | nothing |
| **1 Network** | VPCs, subnets, routing, DNS zones | rarely | 0 |
| **2 Platform / shared** | Kubernetes cluster, databases, queues, observability | monthly | 1 |
| **3 Applications** | services, their IAM, config | daily | 2 |

Rules: **dependencies point downward only** (no cycles), each stack has **its own state and its own pipeline**, a **small blast radius** (an app deploy can never touch the network), and **explicit interfaces** between layers (outputs as an API, section 2).

**Orchestration.** The pipeline needs to know **order**, **what changed**, and **what is affected**. Either encode it in a **stack manifest** (below), or use a tool: **Terragrunt** (declares `dependency` blocks and runs `run-all`), or a **pipeline/CI platform** with stack dependencies (Atlantis, Spacelift, env0, Terraform Cloud run triggers; GitHub Actions or GitLab CI with a computed matrix).

Build the core of such an orchestrator: the **graph, topological order, parallel waves, cycle detection and blast radius**:

```run
cd ~/s5
cat > stacks.py <<'PY'
import sys
from collections import defaultdict

# stack -> stacks it consumes outputs from
DEPENDS = {
    "foundation": [],
    "network": ["foundation"],
    "dns": ["network"],
    "shared-db": ["network"],
    "k8s-cluster": ["network"],
    "observability": ["k8s-cluster"],
    "app-payments": ["k8s-cluster", "shared-db", "dns"],
    "app-search": ["k8s-cluster", "observability"],
}
if len(sys.argv) > 2 and sys.argv[1] == "--add-cycle":
    DEPENDS["network"].append("app-payments")                      # a bad change: network now needs an app

def waves(depends):
    remaining = {s: set(d) for s, d in depends.items()}
    done, out = set(), []
    while remaining:
        ready = sorted(s for s, d in remaining.items() if d <= done)
        if not ready:
            cyc = sorted(remaining)
            raise SystemExit(f"CYCLE detected among: {', '.join(cyc)}  (a layer must never depend on a layer above it)")
        out.append(ready)
        done |= set(ready)
        for s in ready: del remaining[s]
    return out

def downstream(changed, depends):
    users = defaultdict(set)
    for s, ds in depends.items():
        for d in ds: users[d].add(s)
    seen, stack = set(), [changed]
    while stack:
        for u in users[stack.pop()]:
            if u not in seen: seen.add(u); stack.append(u)
    return seen

print("apply order (stacks in the same wave can run in parallel):")
for i, w in enumerate(waves(DEPENDS), 1): print(f"  wave {i}: {', '.join(w)}")
for changed in ("network", "app-search"):
    aff = downstream(changed, DEPENDS)
    print(f"\nchange in '{changed}' -> plan/test these downstream stacks too: {', '.join(sorted(aff)) or '(none)'}")
print("\ndestroy order is the reverse of apply order:", " -> ".join(s for w in reversed(waves(DEPENDS)) for s in w))
PY
python3 stacks.py
echo "---- now a bad change introduces a cycle:"
python3 stacks.py --add-cycle x; echo "exit code: $?"
```

**What you see:** a **wave plan** (independent stacks apply in parallel), the **blast radius** (a network change means re-planning everything downstream; an app change affects nothing else), the **destroy order** (the reverse), and a **cycle** caught before any apply.

**Pipeline behaviour that makes it reliable:**

1. **On a pull request:** `fmt`, `validate`, **policy checks**, `plan` for **changed stacks and their downstream dependents**, posted to the PR. Apply **only the reviewed plan file**.
2. **On merge:** apply in **wave order**, **stop on the first failure** (do not continue to downstream stacks), **lock state** per stack.
3. **Cross-repo triggers:** a new **module release** opens version-bump PRs in consumer repositories (automated), each running its own plan, so a breaking release is discovered **in a PR, not in production**.
4. **Scheduled drift detection** per stack (Q8 in the senior track).
5. **Environment promotion:** dev, then staging, then prod, **same module versions** moving through; prod pinned to what staging proved.
6. **Rollback:** revert the version bump (modules are immutable, so the old version still exists); state is **backed up and versioned**; irreversible changes (database deletion) are guarded by `prevent_destroy` and approvals.

## 5. Refactoring without breaking dependents

- Use **`moved` blocks** when you rename or re-home a resource so Terraform updates state without recreating it.
- Keep **old outputs** for a deprecation period; Terraform has no built-in output deprecation marker, so signal it with **documentation, a contract test and release notes**.
- Release a **major version** for breaking interface changes and **migrate consumers one by one**.

## 6. The answer an interviewer expects

1. **Diagnose the type** of conflict: ordering, interface/contract, module version, or Terraform/provider version. "I'd read the error first: unable to find remote state means order; unsupported attribute means a contract break; init failing means a version constraint."
2. **Immediate fix:** restore a known-good state: pin to the last working versions, apply in the right order, revert the breaking change.
3. **Structural fix:** **layered stacks** with downward-only dependencies, **small blast radius**, **separate state per stack**.
4. **Versioning:** immutable, semver-tagged modules; exact pins; committed lock file; automated upgrade PRs; module tests and a changelog.
5. **Interfaces:** outputs as a versioned API, contract tests, loose coupling by lookup; avoid giving consumers raw access to another stack's state.
6. **Orchestration:** a dependency graph in the pipeline (Terragrunt or a CI orchestrator): plan affected stacks, apply in waves, stop on failure, parallelise independent stacks.
7. **Operations:** drift detection, state backups, approvals, clear ownership, and runbooks for partial failures.

A spoken version: *"I'd split the estate into layers (foundation, network, platform, apps) with one state per stack and dependencies pointing downward only. Modules are versioned and immutable with exact pins and a committed lock file, and Renovate opens upgrade PRs so we move in small steps. Stack outputs are treated as an API with contract tests. The pipeline knows the dependency graph: it plans changed stacks and their downstream dependents, applies in waves, and stops on the first failure. For a failure today I'd identify whether it's ordering, a contract break or a version constraint, restore the last known-good pins, and then fix the cause."*

:::warn Common mistakes
- **Sourcing modules from a branch** (`ref=main`) or a floating version range.
- **One giant state** for everything (huge blast radius, slow plans) or **hundreds of tiny states with no orchestration**.
- **Reading another team's state file** directly (couples you to its internals and exposes secrets).
- **Renaming outputs** without a deprecation period.
- **`depends_on` on whole modules** as a workaround: it forces needless re-evaluation and hides the real interface.
- **Not committing the lock file**, so CI and laptops resolve different providers.
- **Applying downstream stacks after an upstream failure.**
:::

## 7. Follow-up questions to expect

- **"Terragrunt or plain Terraform?"** Terragrunt adds dependency declarations, DRY configuration and `run-all`; plain Terraform with a CI orchestrator works too. Choose by team size and how many stacks; the principles are the same.
- **"How do you share values between stacks without remote state?"** Publish to a parameter store or registry, use tag-based data sources, or pass through the pipeline as variables from the producer's outputs.
- **"How do you handle a breaking module change used by 40 stacks?"** New major version, automated PRs to all consumers, deprecation window, dashboards of who is on which version.
- **"What if applying wave 3 fails halfway?"** Stop; the failed stack has locked state and partial changes; fix forward or revert the PR; downstream stacks are untouched because they have not run.
- **"How do you test infrastructure modules?"** `terraform test` (plan or apply assertions), static checks and policy, integration environments, and contract checks on outputs.

:::try
1. Add a `cache` stack that depends on `network` and is used by `app-search` in `stacks.py`. Where does it appear in the waves?
2. Break the contract another way (change the type of `vpc_id` to a list) and extend `contract.py` to catch it.
3. In `resolve.py` add a third module requiring `module-network` 3.x. How should the output help you decide?
4. Write the PR-pipeline steps for a change to the `network` stack as a numbered list.
:::

:::recap
- Dependencies live in **four places**: inside a configuration, **between stacks**, **between module versions**, and **between tool/provider versions**.
- Separate states mean **you** must encode **order** and **interfaces**; outputs are an **API** and need contract tests and deprecation.
- **Pin and tag** modules, commit the **lock file**, **automate upgrades**, and **test** modules.
- Use **layers with downward-only dependencies** and a **small blast radius**; orchestrate with a **dependency graph** (waves, blast radius, cycle detection, stop on failure).
- Diagnose by **error type**, restore **known-good pins**, then fix the structure.
:::

:::quiz
? Applying the app stack before the network stack fails with "Unable to find remote state". What kind of dependency is this?
- A provider constraint
+ A dependency between stacks (separate states) that the pipeline must order
- A syntax error
! Terraform cannot see it, so you encode the order.

? Why should module sources be pinned to tags and not branches?
- Tags are faster
+ A branch can change under you; a tag is immutable, so plans change only when you change code
- Branches are not supported
! Reproducibility and safe rollback.

? What does a contract test on outputs catch?
- Slow plans
+ A producer renaming or retyping an output that consumers rely on, before it ships
- Provider bugs
! It guards the stack interface.

? In the stack graph, what does a cycle mean?
- Faster applies
+ A layer depends on something above it, so no valid apply order exists
- A deprecated module
! Dependencies must point downward.

? Why commit .terraform.lock.hcl?
- To store secrets
+ So CI and laptops use identical provider builds
- To speed up init only
! It pins the exact provider versions.
:::
