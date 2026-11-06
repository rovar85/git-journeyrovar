---
track: kubernetes
title: GitOps at scale, push versus pull, policy as code and Crossplane
short: GitOps at scale
sub: Why pull-based GitOps changes who holds the cluster credentials, how one template manages many clusters, how Kyverno policies fit, and what Crossplane adds. Runnable models plus real-world YAML shown as examples.
---

:::goals
- compare **push** and **pull** deployment, including credentials, drift and reachability
- explain how one template can manage many clusters (Argo CD ApplicationSet)
- explain policy as code with Kyverno, **audit** versus **enforce**, and where it sits in a GitOps flow
- explain what Crossplane adds: cloud resources managed through the Kubernetes API
:::

:::note Already covered elsewhere, so only linked here
What GitOps is, the reconcile loop and an Argo CD `Application` (sync, prune, self-heal, health) are in [GitOps with Argo CD, and KEDA](#aiinfra-7). Admission control and Pod Security are in [Namespaces, RBAC and security](#kubernetes-8) and [the security map](#kubernetes-17). The models below are written for this lesson; the Argo CD, Kyverno and Crossplane YAML is shown as examples and **was not run here** (the images are not available in the lab).
:::

## 1. Push versus pull

Both start with a commit. They differ in **who applies it** and **when**.

- **Push:** a CI/CD pipeline (Jenkins, GitHub Actions) runs `kubectl apply` or `helm upgrade` against the cluster when a commit lands. Simple to start. But the pipeline needs **cluster credentials stored outside the cluster**, it changes the cluster only when it runs, and a cluster behind a firewall needs inbound access or a self-hosted runner.
- **Pull:** an **agent inside the cluster** (Argo CD, Flux) watches the Git repository and continuously makes the cluster match it. The cluster needs only **outbound** access to Git and the agent needs only **read** access to the repository; it also **corrects drift**.

```run
mkdir -p ~/lab/k8 && cd ~/lab/k8
cat > pushpull.py <<'EOF'
import copy
# "Git" holds the desired state. The "cluster" is a dict. Two ways to get from one to the other.
git = {"web": {"image": "web:1.0", "replicas": 3}, "api": {"image": "api:1.0", "replicas": 2}}
def show(title, cluster): print(f"  {title:34}", {k: f"{v['image']} x{v['replicas']}" for k, v in sorted(cluster.items())})

print("PUSH: the CI pipeline runs `kubectl apply` once, when a commit lands. It needs credentials for the cluster.")
cluster = {}
cluster.update(copy.deepcopy(git)); show("after the pipeline ran", cluster)
cluster["web"]["replicas"] = 10;    show("someone scaled by hand (drift)", cluster)
print("  ...nothing happens until the next commit and pipeline run, so the drift stays")
git["api"]["image"] = "api:1.1"
cluster.update(copy.deepcopy(git)); show("next pipeline run", cluster)

print("\nPULL: an agent INSIDE the cluster compares Git with reality every interval and fixes the difference (self-heal).")
git = {"web": {"image": "web:1.0", "replicas": 3}, "api": {"image": "api:1.0", "replicas": 2}}
cluster = copy.deepcopy(git)
def reconcile(cluster, git, prune=True):
    actions = []
    for k, v in git.items():
        if cluster.get(k) != v: cluster[k] = copy.deepcopy(v); actions.append(f"fixed {k}")
    if prune:
        for k in list(cluster):
            if k not in git: del cluster[k]; actions.append(f"pruned {k}")
    return actions
cluster["web"]["replicas"] = 10; cluster["debug-pod"] = {"image": "busybox", "replicas": 1}
show("drift: manual scale + stray object", cluster)
print("  reconcile ->", reconcile(cluster, git)); show("after one reconcile", cluster)
git["api"]["image"] = "api:1.1"
print("  new commit, reconcile ->", reconcile(cluster, git)); show("after the commit", cluster)

print("\nWhere the credentials live:")
print("  push: the CI system holds a credential that can change the cluster, from OUTSIDE the cluster (a high-value target)")
print("  pull: the agent holds a credential inside the cluster and only needs READ access to Git; the cluster needs outbound access, not inbound")
EOF
python3 pushpull.py
```


In the push model the manual scale-up to 10 replicas **stays** until the next pipeline run. In the pull model the next reconcile fixes it, and also **prunes** an object that is not in Git (the stray `debug-pod`). That last step is a policy choice: pruning and self-heal are options you turn on deliberately, because automatic reversal of a manual change during an incident can surprise people.

| | Push | Pull |
| --- | --- | --- |
| Who holds cluster credentials | CI system, outside the cluster | the agent, inside the cluster |
| Cluster needs | inbound reachability for the pipeline | outbound access to Git |
| Drift | persists until the next run | corrected on each reconcile (if enabled) |
| Audit trail | pipeline logs | Git history plus agent events |
| Good for | simple setups, one-off or imperative steps | many clusters, strict security, auditability |

A typical mature setup uses **both**: CI builds, tests and scans the image and **commits the new image tag** to the config repository; the pull-based agent deploys it. The separation of CI (build) from CD (deploy) is also easier to secure. See [Jenkins](#jenkins-1) for the build side.

## 2. Many clusters from one template

With dozens of clusters (several clouds, regions, environments), writing one Argo CD `Application` per cluster does not scale. An **ApplicationSet** generates the Applications from a template plus a list (or a Git directory layout, or a cluster registry). This model shows the idea:

```run
mkdir -p ~/lab/k8 && cd ~/lab/k8
cat > appset.py <<'EOF'
# What an Argo CD ApplicationSet does: one template + a list of clusters = one Application per cluster, all generated.
clusters = [
  {"name": "prod-aws-eu",  "server": "https://eks-eu.example.internal",  "env": "prod",    "replicas": 6},
  {"name": "prod-gcp-us",  "server": "https://gke-us.example.internal",  "env": "prod",    "replicas": 6},
  {"name": "staging-azure", "server": "https://aks-stg.example.internal", "env": "staging", "replicas": 2},
]
template = {"name": "shop-{name}", "repo": "git@git.example.com:platform/shop.git", "path": "overlays/{env}", "server": "{server}", "namespace": "shop", "replicas": "{replicas}"}
apps = [{k: v.format(**c) for k, v in template.items()} for c in clusters]
for a in apps: print(a["name"].ljust(18), "path:", a["path"].ljust(18), "->", a["server"], "replicas", a["replicas"])
print(f"\n{len(apps)} Applications from one template. Adding a cluster is one new line in the list; removing a line removes its Application.")
print("Same repo, same path per environment: every cluster of one environment runs identical manifests, which is the point of GitOps at scale.")
EOF
python3 appset.py
```


The real resource looks like this (Example, not run here):

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: shop
spec:
  generators:
  - list:
      elements:
      - {name: prod-aws-eu, env: prod, server: "https://eks-eu.example.internal"}
      - {name: prod-gcp-us, env: prod, server: "https://gke-us.example.internal"}
  template:
    metadata:
      name: "shop-{{name}}"
    spec:
      project: default
      source:
        repoURL: git@git.example.com:platform/shop.git
        path: "overlays/{{env}}"
        targetRevision: main
      destination:
        server: "{{server}}"
        namespace: shop
      syncPolicy:
        automated: {prune: true, selfHeal: true}
```

Design points for multi-cluster and **multi-cloud** GitOps:

- **Overlays per environment** (Kustomize or Helm values), not copies of the repository. One base, small differences.
- **Hub and spoke:** one management cluster runs Argo CD and registers the others, or each cluster runs its own agent. A hub is easier to see; per-cluster agents have no single point of failure and no central credential store for all clusters.
- **Promote by pull request** between environment folders or branches; dev to staging to prod is a reviewed change in Git.
- **Same Kubernetes API, different clouds:** the manifests are portable, but load balancers, storage classes, identity (IAM roles for service accounts, workload identity) and ingress differ by cloud. Keep those in overlays.
- **Secrets are not committed in plain text.** Use sealed or external secrets ([Config and secrets](#kubernetes-5), [Senior cloud 11](#cloudsenior-11)).

## 3. Policy as code with Kyverno

**Kyverno** is a policy engine that runs as a Kubernetes admission controller and lets you write policies **as Kubernetes YAML**, without a new language. A policy can **validate** (allow or deny), **mutate** (add defaults), **generate** (create companion resources) and verify image signatures. Each rule can run in **enforce** mode (deny the request) or **audit** mode (allow, but report a violation). The model below mimics one validation and one mutation flow:

```run
mkdir -p ~/lab/k8 && cd ~/lab/k8
cat > policy.py <<'EOF'
# A tiny admission controller in the style of Kyverno: validate rules and one mutate rule over Pod-like dicts.
POLICIES = [
 {"name": "disallow-latest-tag", "mode": "enforce", "msg": "use a pinned image tag, not :latest",
  "check": lambda pod: all(not c["image"].endswith(":latest") and ":" in c["image"] for c in pod["spec"]["containers"])},
 {"name": "require-team-label", "mode": "enforce", "msg": "label `team` is required",
  "check": lambda pod: "team" in pod["metadata"].get("labels", {})},
 {"name": "require-limits", "mode": "audit", "msg": "set resources.limits on every container",
  "check": lambda pod: all("limits" in c.get("resources", {}) for c in pod["spec"]["containers"])},
]
def mutate(pod):                                              # a mutate rule: add a default label (like a Kyverno mutate policy)
    pod["metadata"].setdefault("labels", {}).setdefault("managed-by", "gitops")
    return pod
def admit(pod):
    pod = mutate(pod)
    denied, warned = [], []
    for p in POLICIES:
        if not p["check"](pod): (denied if p["mode"] == "enforce" else warned).append(f"{p['name']}: {p['msg']}")
    return ("DENIED" if denied else "ALLOWED"), denied, warned
def pod(name, image, labels=None, limits=True):
    c = {"name": "app", "image": image}
    if limits: c["resources"] = {"limits": {"memory": "128Mi"}}
    return {"metadata": {"name": name, "labels": labels or {}}, "spec": {"containers": [c]}}
for p in (pod("good", "web:1.4.2", {"team": "shop"}), pod("latest", "web:latest", {"team": "shop"}), pod("no-label", "web:1.4.2"), pod("no-limits", "web:1.4.2", {"team": "shop"}, limits=False), pod("bare-image", "nginx", {"team": "shop"})):
    verdict, denied, warned = admit(p)
    print(f"{p['metadata']['name']:10} {verdict:8} denied={denied or '-'}  audit-warnings={warned or '-'}  labels={p['metadata']['labels']}")
EOF
python3 policy.py
```


Read the output: the `:latest` image and the missing `team` label are **denied** (enforce); the Pod with no limits is **allowed with an audit warning**; the mutation added `managed-by` to everything. Starting rules in **audit** mode and moving them to **enforce** once the reports are clean is the usual rollout.

A real Kyverno policy for the first rule looks like this (Example, not run here; field names have changed between Kyverno versions, so check the documentation for yours):

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  background: true
  rules:
  - name: require-image-tag
    match:
      any:
      - resources:
          kinds: ["Pod"]
    validate:
      message: "Use a pinned image tag, not :latest."
      pattern:
        spec:
          containers:
          - image: "!*:latest"
```

**Kyverno with Argo CD** works well because policies are just more YAML in Git:

- Keep policies in the same repository (or a platform repository) and let Argo CD apply them, so **policy changes are reviewed and audited like code**.
- **Order matters:** install Kyverno and its CRDs first, then the policies, then the workloads. Argo CD **sync waves** (the annotation `argocd.argoproj.io/sync-wave`, lower numbers first) and separate Applications express this.
- A **denied** workload shows up as a failed sync with Kyverno's message; read the Application's sync result and `kubectl get policyreport -A` for audit results.
- Exclude the namespaces that run the policy engine and the GitOps agent, or a bad policy can block its own repair.

Policy engines compare as follows: Kyverno writes policies in YAML; **OPA Gatekeeper** uses the Rego language and constraint templates; the built-in **ValidatingAdmissionPolicy** (CEL expressions, no webhook) now covers simple validation inside Kubernetes itself. Pick the least powerful tool that expresses your rule.

## 4. Crossplane: cloud resources through the Kubernetes API

Terraform changes the cloud when you run it ([Terraform](#terraform-1)). **Crossplane** takes another approach: install it in a cluster, and cloud resources become **Kubernetes objects** that controllers keep reconciled continuously, the same reconcile loop as everything else in the cluster. Its pieces:

- **Providers** add resource types for a cloud (database, bucket, subnet) as CRDs ([CRDs and operators](#kubernetes-12)).
- **Managed resources** are the real cloud objects as Kubernetes objects.
- **Compositions** and **composite resource definitions (XRDs)** let a platform team define a **higher-level API** such as `Database` with a few fields, which expands into several managed resources.
- **Claims** are what developers create in their namespace.

```run
mkdir -p ~/lab/k8 && cd ~/lab/k8
cat > composition.py <<'EOF'
# What Crossplane does: you create ONE high-level object (a claim); a Composition expands it into the real cloud resources.
def composition(claim):
    n, env, region = claim["name"], claim["env"], claim["region"]
    size = {"small": "db.t3.small", "large": "db.r6g.large"}[claim["size"]]
    return [
      {"kind": "Subnet",     "name": f"{n}-subnet",   "spec": {"region": region, "cidr": "10.20.0.0/24"}},
      {"kind": "SecurityGroup", "name": f"{n}-sg",    "spec": {"region": region, "ingress": "5432 from the app subnet only"}},
      {"kind": "DBInstance", "name": f"{n}-db",       "spec": {"region": region, "class": size, "engine": "postgres", "multiAZ": env == "prod", "storageEncrypted": True}},
    ]
claim = {"name": "orders", "env": "prod", "region": "eu-west-1", "size": "large"}
print("claim the developer writes:", claim)
print("\nmanaged resources Crossplane would create and keep reconciled:")
for r in composition(claim): print(f"  {r['kind']:14} {r['name']:15} {r['spec']}")
claim2 = {"name": "scratch", "env": "dev", "region": "eu-west-1", "size": "small"}
print("\nsame template, dev claim ->", [(r['kind'], r['spec'].get('multiAZ', '-')) for r in composition(claim2)])
print("The platform team owns the template (encryption always on, private ingress); developers only choose size and env.")
EOF
python3 composition.py
```


The model's resource kinds are simplified (real Crossplane resource names depend on the provider). The idea to remember: **the platform team encodes the rules once** (encryption always on, private ingress, multi-AZ in production) and developers choose a few fields. Because Crossplane objects are Kubernetes YAML, they fit the same Git and Argo CD flow as applications: **GitOps for infrastructure and applications from one repository and one agent**.

When to prefer it over Terraform: you already run Kubernetes, you want a self-service platform with continuous drift correction, and you accept a control cluster as critical infrastructure. When not to: a small team, a few resources, or heavy use of Terraform modules and state tooling that already works ([Terraform 7](#terraform-7), [Senior cloud 13](#cloudsenior-13)).

## Further reading you suggested

The TechOps Examples newsletter has posts on these topics. I could not open them from my environment, so they are linked by title only, not summarised:

- [Kubernetes architecture crash course](https://www.techopsexamples.com/p/kubernetes-architecture-crash-course) (pairs with [lesson 1](#kubernetes-1))
- [GitOps push vs pull architecture, which one to choose](https://www.techopsexamples.com/p/gitops-push-vs-pull-architecture-which-one-to-choose)
- [Using Kyverno policies with Argo CD](https://www.techopsexamples.com/p/using-kyverno-policies-with-argocd)
- [Multi-cloud GitOps workflow for Kubernetes management](https://www.techopsexamples.com/p/multi-cloud-gitops-workflow-for-kubernetes-management)
- [Why Crossplane with Argo CD is the best GitOps](https://www.techopsexamples.com/p/why-crossplane-with-argocd-is-the-best-gitops)

## Common misconceptions

- "GitOps means using Argo CD." It is the model (Git as the source of truth, an agent reconciles); Argo CD and Flux are tools.
- "Pull is always better." Push is simpler and fine for small setups; pull wins on credentials, drift and scale.
- "Admission policy replaces RBAC." RBAC decides **who** may act; policy decides **what** objects are acceptable.
- "Crossplane replaces Terraform." They overlap; the choice depends on your platform.

## Practice (answers below)

1. A cluster is behind a firewall with no inbound access. Which model fits, and why?
2. Your new Kyverno policy blocks the Argo CD agent's own Pods. How do you prevent that class of mistake?
3. Write the audit-first rollout steps for a new "no privileged containers" policy.

:::recap
- **Push**: the pipeline applies and holds cluster credentials; **pull**: an in-cluster agent reconciles from Git, with read-only Git access and drift correction.
- **ApplicationSet** generates one Application per cluster from a template; use overlays, not copies.
- **Kyverno**: policies as YAML, **validate / mutate / generate**, **audit** first then **enforce**; order policies before workloads with sync waves.
- **Crossplane**: cloud resources as Kubernetes objects, with **compositions** giving developers a simple, safe API.
:::

:::note Answers
1. Pull: the in-cluster agent only needs outbound access to Git, so no inbound rule or stored remote credential is needed. 2. Exclude the agent's and the policy engine's namespaces from policies (or scope policies by label), and test new policies in audit mode first. 3. Write the policy in audit mode, apply it via Git, read the policy reports and fix or exempt the violators, then switch it to enforce in one reviewed commit, and watch sync failures afterwards.
:::

```quiz
? In which model does the cluster need only outbound access and hold the Git credentials?
+ Pull-based GitOps with an in-cluster agent
- Push from a CI pipeline
- Manual kubectl
- Terraform from a laptop
! The agent reads from Git; nothing outside needs credentials to change the cluster.

? What is the safest way to roll out a new admission policy?
+ Start in audit mode, read the reports, then switch to enforce
- Enforce immediately in production
- Apply it only to one pod
- Disable the old policies
! Audit mode shows what would be blocked without breaking workloads.

? What does a Crossplane Composition do?
+ Expands one high-level claim into several managed cloud resources
- Builds container images
- Schedules pods
- Replaces the API server
! It encodes the platform team's rules so developers choose only a few fields.
```
