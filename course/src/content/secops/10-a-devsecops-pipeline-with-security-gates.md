---
track: secops
title: "A DevSecOps pipeline: security gates in CI"
short: DevSecOps pipeline
sub: Put every check from this track into one gate: secrets, code, dependencies and infrastructure, with reviewed, expiring exceptions. Watch it fail, fix the findings, watch it pass; then the same in a CI workflow.
---

@setup secops

:::goals
- combine several security checks into one pipeline gate
- use exceptions that have a reason, an owner and an expiry date
- fix findings until the gate passes
- lay out where each check belongs in a real CI/CD pipeline
:::

## 1. The gate

`pipeline.py` runs four stages using the tools from earlier lessons: the **secret scanner** ([6](#secops-6)), the **code analyser** ([8](#secops-8)), the **dependency check** ([7](#secops-7)) and the **infrastructure policy** ([9](#secops-9)). Each stage decides which findings block. A file of **exceptions** lets a team accept a specific finding, with a reason and an **expiry date**, after review.

```run
cd ~/lab/sec
cat exceptions.json
python3 pipeline.py
```

- The MD5 finding was **accepted**: it is used only for cache keys, and the exception lasts until March.
- The PyYAML exception **expired** last month, so it blocks again. Expiry stops "temporary" exceptions living forever.
- Everything else fails the build. The developer sees exactly what to fix.

## 2. Fix, then run again

```run
cd ~/lab/sec
cat > app.py <<'EOF'
import ast, hashlib, json, os, subprocess, yaml

API_KEY = os.environ["API_KEY"]

def ping(host):
    return subprocess.run(["ping", "-c", "1", host], capture_output=True)

def find_user(db, name):
    return db.execute("SELECT * FROM users WHERE name = ?", (name,)).fetchall()

def load_profile(data):
    return json.loads(data)

def load_config(text):
    return yaml.safe_load(text)

def calc(expr):
    return ast.literal_eval(expr)

def token_hash(t):
    return hashlib.md5(t.encode()).hexdigest()
EOF
printf 'requests==2.32.3\nflask==3.0.3\npyyaml==6.0.2\nnumpy==2.1.3\n' > requirements.txt
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
cd ~/lab/sec
python3 pipeline.py
```

The fixes: the key comes from the environment, `subprocess` gets a list, SQL uses `?`, JSON replaces pickle, `yaml.safe_load` and `ast.literal_eval` replace the unsafe calls, the look-alike package is gone, versions are pinned and patched, and the infrastructure files are the fixed ones from lesson 9.

## 3. Where each check goes in a real pipeline

| Stage | Check | Example tools |
| --- | --- | --- |
| Developer laptop | pre-commit secret scan, linters | gitleaks, pre-commit |
| Pull request | SAST, secret scan, dependency scan, IaC policy | Semgrep, Bandit, CodeQL, pip-audit, Checkov, Trivy |
| Build | build the image, scan it, create an SBOM, sign it | Trivy, Syft, cosign |
| Deploy | verify signature, admission policy | cosign verify, Kyverno, Gatekeeper |
| Running | DAST, image rescans, cloud posture, runtime alerts | OWASP ZAP, Trivy, Falco |

A workflow sketch with real tools (not run here; check each tool's current documentation for exact options):

```term
# .github/workflows/security.yml
on: [pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {fetch-depth: 0}                        # full history for the secret scan
      - run: pipx run pip-audit -r requirements.txt   # known CVEs
      - run: pipx run bandit -r src -ll               # medium and above
      - run: pipx run checkov -d infra --quiet        # IaC policies
      - run: docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo
```

## 4. Making it work for people

- **Start in report-only mode**, fix the backlog, then turn on blocking for critical and high.
- **Fast:** keep the PR checks to a few minutes; run heavy scans nightly.
- **Clear:** every failure says what, where and how to fix; findings show up as PR comments, not in a separate portal.
- **Owned:** exceptions need a reason, an owner and an expiry, and are reviewed.
- **Measured:** track time to fix critical findings and how many exceptions are open, not how many tools you run.

## Common misconceptions

- "Block on every finding from day one." On an existing codebase that stops all work and teams find ways around the gate; phase it in.
- "Exceptions are a loophole." Without a reviewed, expiring way to accept a risk, people disable the check instead.
- "DevSecOps is a tool you buy." It is a way of working: shared ownership, early checks, fast feedback.

## Practice (answers below)

1. Add an exception that accepts the `reqeusts` look-alike finding. Should that exception ever be approved?
2. Change `TODAY` in `pipeline.py` to `2027-04-01` with the fixed code. What happens and why?
3. Your PR security checks take 25 minutes. Name two ways to speed them up.

:::recap
- A **security gate** runs secrets, code, dependency and infrastructure checks on every change.
- **Exceptions** carry a reason, an owner and an **expiry** so accepted risks are revisited.
- Place checks across the pipeline: laptop, pull request, build, deploy, running.
- Phase in blocking, keep checks fast and clear, and measure time to fix.
:::

:::note Answers
1. `{"stage": "dependencies", "contains": "reqeusts", ...}`. No: a typosquatted package may be malware; remove it. 2. The MD5 exception has expired, so the SAST stage fails again: time to re-review it or replace MD5 with a non-security hash such as SHA-256 or `usedforsecurity=False`. 3. Scan only changed files or packages in the PR and run full scans nightly; cache tool databases; run the stages in parallel.
:::

```quiz
? Why do exceptions have an expiry date?
+ So an accepted risk is reviewed again instead of being forgotten
- To make the build faster
- Because JSON requires dates
- So scanners can delete them
! "Temporary" exceptions otherwise become permanent.

? A team adds a security gate to a large old codebase. What is the safest rollout?
+ Report only first, fix the backlog, then block on critical and high
- Block on every finding immediately
- Never block, only report
- Run scans once a year
! Phasing in keeps the gate respected.

? Where is an image signature verified?
+ At deploy time, before the image is allowed to run
- In the developer's editor
- In the SQL database
- In the DNS server
! Sign at build, verify at deploy.
```
