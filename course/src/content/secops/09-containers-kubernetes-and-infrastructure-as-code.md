---
track: secops
title: "Containers, Kubernetes and infrastructure as code: policy as code"
short: Infra policies
sub: The common misconfigurations that cause real breaches, found by policy rules over a Dockerfile, a Pod and an infrastructure plan, then fixed until the check passes.
---

@setup secops

:::goals
- name the most common container, Kubernetes and cloud misconfigurations
- write policy-as-code rules over a Dockerfile, a Pod manifest and a JSON plan
- fix each finding and make the policy pass
- know the real tools: hadolint, Trivy, Checkov, Kyverno, OPA, kube-bench
:::

## 1. Misconfiguration is the breach

Many cloud incidents are not clever exploits but settings: a storage bucket open to the internet, SSH open to the world, a container running as root with full access to its node, a password baked into an image. Because infrastructure is now code ([Docker](#docker-1), [Kubernetes](#kubernetes-1), [Terraform](#terraform-1)), these settings can be **checked automatically before they are deployed**. That is **policy as code**.

The lab has three deliberately bad files:

```run
cd ~/lab/sec
cd iac && cat Dockerfile pod.json plan.json
```

## 2. Check them

```run
cd ~/lab/sec
cd iac && python3 ../policy.py
```

Each rule is a small, readable check, and the run fails because there are critical and high findings, exactly as a pipeline gate would. The worst ones:

- **Privileged container:** if the app is broken into, the attacker effectively has root on the node and every other pod on it.
- **Public bucket:** the classic data leak.
- **Port 22 open to 0.0.0.0/0:** every SSH-guessing bot on the internet can try.
- **Secret in an `ENV` line:** anyone who can pull the image can read it with `docker history` or `inspect`.

## 3. Fix and re-check

```run
cd ~/lab/sec
cd ~/lab/sec/iac
cat > Dockerfile <<'DF'
FROM python:3.12.7-slim
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt && useradd --uid 10001 app
COPY . /app
USER 10001
EXPOSE 8080
CMD ["python", "/app/main.py"]
DF
cat > pod.json <<'JS'
{"kind": "Pod", "metadata": {"name": "shop"},
 "spec": {"containers": [{"name": "web", "image": "shop:1.4.2",
   "resources": {"limits": {"cpu": "500m", "memory": "256Mi"}},
   "securityContext": {"runAsNonRoot": true, "allowPrivilegeEscalation": false, "readOnlyRootFilesystem": true}}]}}
JS
python3 - <<'PY'
import json
p = json.load(open("plan.json"))
p["resource_changes"][0]["change"]["after"] = {"block_public_acls": True, "restrict_public_buckets": True}
p["resource_changes"][1]["change"]["after"]["cidr_blocks"] = ["10.0.0.0/16"]
json.dump(p, open("plan.json", "w"))
PY
python3 ../policy.py
```

The fixes: a pinned slim base image, a non-root `USER`, no secrets in the image (inject them at run time, [lesson 6](#secops-6)), no host network, `runAsNonRoot`, no privilege escalation, a read-only root file system, resource limits, a pinned image tag, public access blocked, and SSH limited to the internal network (better: no SSH at all, use a cloud session manager). One medium finding remains (database encryption) and the gate passes because it only blocks critical and high. Fix it anyway in the next change.

## 4. The real tools

| Target | Tools |
| --- | --- |
| Dockerfiles | hadolint, Trivy config, Checkov |
| Images (vulnerable packages) | Trivy, Grype, Docker Scout |
| Terraform, CloudFormation, Kubernetes YAML | Checkov, Trivy config (formerly tfsec), KICS |
| Admission into a cluster | Kyverno, OPA Gatekeeper, Pod Security Admission (restricted profile) |
| Running cluster against benchmarks | kube-bench (CIS benchmark), cloud security posture tools |
| General policy language | Open Policy Agent (Rego), Conftest |

Run them in CI on every change and at the cluster's front door (admission control), so a bad manifest is refused even if someone skips the pipeline.

## Common misconceptions

- "Containers are isolated, so root inside is fine." Container escapes exist; root plus privileged turns a bug in your app into a node takeover.
- "It is in a private subnet, so open security groups do not matter." Networks change and attackers move sideways; keep rules tight everywhere.
- "We scan images once at build." New CVEs appear daily; rescan running images regularly.

## Practice (answers below)

1. Add a rule to `policy.py` that flags a container without `readOnlyRootFilesystem: true`.
2. Why is `FROM python:latest` a security problem and not only a reliability one?
3. Where would you enforce "no privileged pods" so it cannot be skipped?

:::recap
- Most cloud breaches are **misconfigurations**; infrastructure as code lets you check them before deploy.
- Key rules: **no root, no privileged, no secrets in images, pinned images, no public buckets, no world-open admin ports**.
- **Policy as code** runs in CI and at **admission**; tools: hadolint, Trivy, Checkov, Kyverno, OPA, kube-bench.
:::

:::note Answers
1. In the container loop: `if not sc.get("readOnlyRootFilesystem"): flag("LOW", f"pod.json:{c['name']}", "root file system is writable")`. 2. You do not know what you ship or what you scanned; the image can change under you, including to a compromised or vulnerable build. Pin a version or a digest. 3. In the cluster's admission control (Pod Security Admission restricted profile, Kyverno or Gatekeeper), as well as in CI.
:::

```quiz
? Why is `privileged: true` dangerous?
+ A compromised container gets near-root access to the node
- It makes the pod slower
- It disables logging
- It costs more
! Privileged removes most isolation.

? How can someone read a password set with ENV in a Dockerfile?
+ By pulling the image and inspecting its history or config
- They cannot, ENV is encrypted
- Only with the root password
- Only while the container runs
! Image layers and config are readable by anyone with the image.

? Where can a cluster refuse a bad manifest even if CI was skipped?
+ At admission control
- In the Dockerfile
- In the load balancer
- In DNS
! Admission controllers check every object before it is stored.
```
