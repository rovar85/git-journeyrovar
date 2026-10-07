---
track: cloudsenior
title: "Q13: How do you give teams self-service cloud access while keeping governance and control?"
short: Q13 Self-service with governance
sub: Golden paths, guardrails instead of gates, and a real namespace-vending demo on Kubernetes with quotas, limits, RBAC and a denied request.
---

:::goals
- explain why "ticket and wait" fails and "everyone does anything" fails, and what sits between them
- design a **platform as a product** with golden paths, paved roads and guardrails
- build a **tenant vending** flow for real: namespace, quota, default limits, role binding, labels
- show governance **working**: a request over quota is denied by the platform, not by a person
- add **showback** so teams see what they use
:::

:::note Provenance
The namespace vending, quotas, limits and RBAC run on the **real lab Kubernetes cluster**. The lab has **no cloud account**, so account-level vending and billing are shown conceptually, and the showback numbers use made-up prices (labelled). Tool names for portals are from general knowledge and are an **Example, not run here**.
:::

```setup
export LABNS=labplat
```

@setup k8s

## 1. The tension, and the answer

| Extreme | What happens |
|---|---|
| **Central gatekeeping** (open a ticket, wait days) | teams route around you, **shadow IT**, slow delivery, the platform team becomes a bottleneck |
| **Free-for-all** (everyone owns an admin account) | unpatched, untagged, expensive, insecure sprawl; the audit finds it |
| **The answer: self-service inside guardrails** | teams move fast **within** boundaries that are **automatic**, **visible** and **the same for everyone** |

The senior sentence: **"Governance is a property of the platform, not a meeting."** If a rule matters, encode it so that the **easy path is the compliant path**.

## 2. The building blocks

1. **Golden paths** (also called paved roads): a **supported, opinionated route** for common needs, such as "a new web service with a database, pipeline, dashboards and alerts in one request". Teams can leave the path, but then **they own the extra support burden**.
2. **Platform as a product**: it has **users** (developers), a **roadmap**, **documentation**, **support**, and **measured satisfaction and adoption**. A platform nobody chooses to use is a failed product.
3. **Guardrails, not gates**: **preventive controls** that block only what is actually dangerous (public storage, wrong region, no encryption), while everything else flows without approval. Gates (manual approvals) are kept for **rare, high-risk** changes (Q10).
4. **Policy as code** (Q4): the same rules run in the **pipeline**, at **admission** (the cluster refuses non-compliant objects) and as **continuous detection**.
5. **Quotas and limits**: a team can self-serve **up to a budget** of compute, storage, and count of objects. Above it, they ask, with a **reason**.
6. **Identity and access**: **groups** map to **roles** (never individuals), access is **time-bound** where possible, and **break-glass** is audited.
7. **Tagging and ownership**: every resource has an **owner, cost centre and environment**, applied automatically (Q5).
8. **Showback or chargeback**: teams **see** (showback) or **pay** (chargeback) for what they use, which is the cheapest governance of all.
9. **Observable platform**: adoption, lead time to first deploy, **time to vend a new tenant**, policy violation counts, cost per team.

## 3. Vending a tenant, for real

A "tenant" in Kubernetes terms is a **namespace** plus the controls around it. Think of it as the cluster-level cousin of the **account vending** in Q3. One script produces everything a team needs, **identically each time**.

```run
mkdir -p ~/plat && cd ~/plat
cat > vend.sh <<'SH'
#!/bin/bash
# usage: vend.sh <team> <cost-centre> <cpu-quota> <mem-quota> <max-pods>
set -euo pipefail
team=$1; cc=$2; cpu=$3; mem=$4; pods=$5
ns="team-$team"

kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl label namespace "$ns" owner="$team" cost-centre="$cc" env=lab managed-by=platform --overwrite >/dev/null

kubectl apply -n "$ns" -f - >/dev/null <<EOF
apiVersion: v1
kind: ResourceQuota
metadata: {name: team-quota}
spec:
  hard:
    requests.cpu: "$cpu"
    requests.memory: "$mem"
    pods: "$pods"
---
apiVersion: v1
kind: LimitRange
metadata: {name: team-defaults}
spec:
  limits:
  - type: Container
    default:        {cpu: 100m, memory: 64Mi}
    defaultRequest: {cpu: 50m,  memory: 32Mi}
    max:            {cpu: 500m, memory: 256Mi}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: {name: team-edit}
subjects:
- {kind: Group, name: "grp-$team", apiGroup: rbac.authorization.k8s.io}
roleRef: {kind: ClusterRole, name: edit, apiGroup: rbac.authorization.k8s.io}
EOF
echo "vended $ns (owner=$team cost-centre=$cc quota: cpu=$cpu mem=$mem pods=$pods)"
SH
chmod +x vend.sh
./vend.sh payments CC-1001 1 512Mi 5
./vend.sh search   CC-2002 500m 256Mi 3
echo
kubectl get ns -l managed-by=platform --show-labels | cut -c1-110
```

**What you see:** two tenants created by the **same code path**, each labelled with an **owner and cost centre** (so cost reports work later), each with a **quota**, **default limits** and a **role binding for its own group**. A third team takes **seconds**, not a ticket. In a real organisation this script is a **pipeline** triggered by a **pull request or portal form**, so the request itself is reviewed and recorded.

Inspect what one tenant got:

```run
kubectl describe quota team-quota -n team-payments | sed -n 1,12p
echo
kubectl get rolebinding team-edit -n team-payments -o jsonpath='{.subjects[0].kind}/{.subjects[0].name} -> {.roleRef.name}{"\n"}'
```

## 4. Governance that works without a person

Deploy within the budget, then try to go beyond it.

```run
cd ~/plat
kubectl create deployment web -n team-search --image=busybox:1.36 --replicas=1 -- sleep 3600 >/dev/null
kubectl wait --for=condition=available deployment/web -n team-search --timeout=60s
echo "--- what the defaults added (the team wrote no resources):"
kubectl get pod -n team-search -o jsonpath='{.items[0].spec.containers[0].resources}{"\n"}'
echo
echo "--- ask for a container above the per-container maximum:"
kubectl run big -n team-search --image=busybox:1.36 --restart=Never --overrides='{"spec":{"containers":[{"name":"big","image":"busybox:1.36","command":["sleep","60"],"resources":{"requests":{"cpu":"2"},"limits":{"cpu":"2"}}}]}}' 2>&1 | cut -c1-200
echo
echo "--- scale beyond the namespace quota (search quota: 3 pods, 500m CPU):"
kubectl scale deployment web -n team-search --replicas=8 >/dev/null
sleep 5
kubectl get deployment web -n team-search
kubectl get events -n team-search --field-selector reason=FailedCreate 2>/dev/null | tail -2 | cut -c1-220
```

**What you see:**

- A pod with **no resource settings** receives **defaults** from the LimitRange. This matters because the scheduler and the quota need **requests** to make decisions; defaults make **every** workload governable.
- A request above the per-container **maximum** is **rejected immediately** by the API server.
- Scaling to 8 replicas does not give 8 pods: the **quota** caps the namespace, and the Deployment reports fewer ready than desired with a **`FailedCreate` event** naming the exceeded quota. The team sees **why** and **who to ask**.

Nobody approved or denied anything: the platform **did**, identically, at any hour. The control is **preventive** and **explains itself**.

:::warn Quotas are a budget, not a cure
Quotas stop one team from consuming the cluster, but **they do not decide whether the spend is worthwhile**. Pair them with **showback** (section 6) and a regular review so a team can ask for more **with evidence**.
:::

## 5. Who can do what: RBAC checks

Access is only governed if you can **ask** what a subject can do.

```run
echo "payments group, in its own namespace:"
for v in create delete; do
  printf '  %-7s deployments: ' $v
  kubectl auth can-i $v deployments -n team-payments --as=alice --as-group=grp-payments
done
echo "payments group, in the other team's namespace:"
printf '  create deployments: '
kubectl auth can-i create deployments -n team-search --as=alice --as-group=grp-payments
echo "payments group, cluster-wide actions:"
printf '  create namespaces:  '
kubectl auth can-i create namespaces --as=alice --as-group=grp-payments
printf '  delete nodes:       '
kubectl auth can-i delete nodes --as=alice --as-group=grp-payments
```

**What you see:** the group can work in **its own** namespace, and **nowhere else**, and cannot do cluster-level things (creating namespaces is the **platform's** job, which is exactly the vending path). `kubectl auth can-i --as ...` is the audit question you can ask **any time**, and it is the quickest way to prove **least privilege** to an auditor.

## 6. Showback

Teams change behaviour when they **see** their numbers. We read what each tenant **requested** and price it with **made-up unit prices** (labelled), grouped by the **cost-centre label** we applied at vending.

```run
cd ~/plat
kubectl apply -n team-payments -f - >/dev/null <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: api}
spec:
  replicas: 3
  selector: {matchLabels: {app: api}}
  template:
    metadata: {labels: {app: api}}
    spec:
      containers:
      - name: api
        image: busybox:1.36
        command: ["sleep","3600"]
        resources: {requests: {cpu: 200m, memory: 64Mi}, limits: {cpu: 300m, memory: 128Mi}}
EOF
kubectl wait --for=condition=available deployment/api -n team-payments --timeout=60s >/dev/null
sleep 2
cat > showback.py <<'PY'
import json, subprocess

CPU_PER_CORE_MONTH = 25.0     # made-up prices, not any provider's
GB_PER_MONTH       = 3.5

def cores(v): return float(v[:-1]) / 1000 if v.endswith("m") else float(v)
def gib(v):
    units = {"Ki": 1/1048576, "Mi": 1/1024, "Gi": 1.0}
    for u, f in units.items():
        if v.endswith(u): return float(v[:-2]) * f
    return float(v) / 2**30

ns = json.loads(subprocess.check_output(["kubectl","get","ns","-l","managed-by=platform","-o","json"]))
print(f"{'team':10} {'cost centre':12} {'cpu req':>8} {'mem req':>9} {'est $/mo':>9}")
total = 0
for item in ns["items"]:
    name = item["metadata"]["name"]; labels = item["metadata"]["labels"]
    pods = json.loads(subprocess.check_output(["kubectl","get","pods","-n",name,"-o","json"]))["items"]
    cpu = mem = 0.0
    for p in pods:
        if p["status"]["phase"] not in ("Running","Pending"): continue
        for c in p["spec"]["containers"]:
            r = c.get("resources",{}).get("requests",{})
            cpu += cores(r.get("cpu","0")); mem += gib(r.get("memory","0"))
    cost = cpu * CPU_PER_CORE_MONTH + mem * GB_PER_MONTH
    total += cost
    print(f"{labels['owner']:10} {labels['cost-centre']:12} {cpu:8.2f} {mem:8.2f}G {cost:9.2f}")
print(f"{'total':32} {'':>9} {total:9.2f}   (prices are made up)")
PY
python3 showback.py
```

**What you see:** each team and cost centre with the compute **it requested** and an **estimated monthly cost**. In a cloud you would use **the provider's cost export, grouped by the same tags** (Q5). The point is the **mechanism**: labels applied at vending make the report **automatic**.

## 7. Account-level governance (conceptual)

On a public cloud the same pattern repeats a level up (Q3, Q4): a request creates an **account or subscription** in the right **organisational unit**, with **baseline guardrails** (policies, logging, networking) already attached, a **budget alert**, **SSO groups mapped to roles**, and **tags** enforced. The team gets a **working, compliant** environment in minutes.

```yaml:self-service-request
# Example, not run here. A request a team would raise as a pull request or portal form.
kind: TenantRequest
team: payments
cost_centre: CC-1001
environment: [dev, test, prod]
data_classification: confidential
region: eu-west
compute_budget_cpu: 20
needs: [postgres, queue, public-https-endpoint]
owner_group: grp-payments
```

The pipeline validates this against policy (allowed regions, classification versus controls), shows the **plan** for review, and applies it.

## 8. How to answer

1. **Frame**: "I treat the platform as a product. The goal is self-service inside guardrails, so the compliant path is also the easiest one."
2. **Mechanics**: golden paths; vending (account, namespace) from **a reviewed request**; **policy as code** at pipeline, admission and detection; **quotas and defaults**; **group-based, time-bound RBAC**; **tags** and **showback**.
3. **Where humans stay in**: high-risk changes (production network, data egress, new regions), **with the plan in front of them**.
4. **Measure**: time to vend, adoption of golden paths, violations over time, cost per team, developer satisfaction.
5. **Proof**: "I can show a request over quota being refused automatically, and show a group's access with one command."

:::warn Common mistakes
- **Building the platform without talking to developers**: a technically perfect platform that nobody adopts.
- **Gates everywhere**: approval for every change recreates the ticket queue. Gate only **rare, high-risk** changes.
- **Guardrails with no explanation**: a denied request that says "forbidden" creates tickets. Messages should **say why and what to do**.
- **Individual access instead of group access**: unmanageable and un-auditable.
- **No defaults**: workloads without requests or tags escape quotas and cost reports.
- **Quota without showback**: teams request the maximum "just in case".
- **No exit path**: a rigid platform with no escape hatch for genuine needs pushes teams to shadow IT. Offer a **supported exception** process.
:::

## 9. Follow-up questions to expect

- **"How do you stop the platform team becoming a bottleneck?"** Self-service for the common 90%, a documented exception path for the rest, and **everything as code with pull requests** so requests are reviewed by **policy first, people second**.
- **"A team wants something outside the golden path."** Understand the need, offer the **closest supported option**, otherwise allow it with **clear ownership**: they carry the support and security burden, and the guardrails still apply.
- **"How do you measure platform success?"** Lead time to first production deploy, **adoption** of golden paths, **number of tickets** to the platform, policy violations, **cost per team**, and developer satisfaction.
- **"How do you handle multi-tenancy risk?"** Namespace or account **isolation**, quotas, network policies (the lab does not enforce them), **separate node pools** or clusters for sensitive tenants, and **audited access**.

:::try
1. Vend a third team with a **tight quota** (`./vend.sh billing CC-3003 200m 128Mi 2`) and find the **smallest Deployment** that is denied. Read the `FailedCreate` message.
2. Add a **`max` memory** to the LimitRange and show a request above it being rejected.
3. Extend `showback.py` to **group by cost centre** and add a **warning** when a team is above 80% of its quota.
4. Write the `TenantRequest` **validation rules** (allowed regions, data classification versus required controls) as a small Python checker like Q3.
:::

:::recap
- **Governance is a property of the platform**: guardrails, defaults and quotas make the compliant path the easy path.
- **Self-service inside boundaries**, humans only for rare high-risk changes, with the plan in front of them.
- **Vending** (account or namespace) from a reviewed request gives every team an identical, labelled, governed start.
- **RBAC by group**, checked with `kubectl auth can-i`, proves least privilege.
- **Labels and showback** make cost visible per team.
- Treat the platform as a **product** and measure adoption, lead time and satisfaction.
:::

:::quiz
? Why do LimitRange defaults matter for governance?
- They make pods run faster
+ They give every workload resource requests so quotas, scheduling and cost reports work
- They replace RBAC
! Without requests, workloads escape quotas and cost accounting.

? A team scales a Deployment beyond its quota. What should happen?
- A platform engineer approves it by hand
+ The API refuses the extra pods with an event that names the exceeded quota
- The cluster ignores the quota
! Preventive, automatic and self-explaining.

? Why bind roles to groups rather than individuals?
- It is faster to type
+ Membership changes through the identity system, and audits stay manageable
- Individuals cannot be bound
! Group-based access scales and is auditable.

? What is a golden path?
- A mandatory process for every team
+ A supported, opinionated route for common needs, with an escape hatch that shifts support to the team
- A type of CI server
! It is chosen, not forced, because it is the easiest compliant route.

? What turns quotas from a limit into good governance?
- Raising them every quarter
+ Showback, so teams see their use and request more with evidence
- Hiding the numbers
! Visibility changes behaviour.
:::
