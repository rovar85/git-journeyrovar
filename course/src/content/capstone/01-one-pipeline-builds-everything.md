---
track: capstone
title: Capstone: one pipeline builds the whole EV lab
short: The whole lab
sub: Terraform defines the servers, Ansible configures them, Docker packages the app, Kubernetes runs it, a script verifies it. All real, all from files in Git.
---

:::goals
- connect Terraform, Ansible, Docker, Kubernetes and Git into one repeatable workflow
- see infrastructure as code produce an inventory that configuration management consumes
- run the pipeline twice and verify idempotency
- tear everything down and rebuild it
:::

## The plan

You now know each tool separately. Real value comes from joining them so that **a Git commit rebuilds the whole environment**:

| Step | Tool | Does |
|---|---|---|
| 1. Declare the servers | **Terraform** | defines the server list and writes the **inventory** for the next step |
| 2. Configure them | **Ansible** | applies the server configuration over SSH (idempotent) |
| 3. Package the app | **Docker** | builds the image and pushes it to a **registry** |
| 4. Run the app | **Kubernetes** | deploys the image; waits until it is healthy |
| 5. Verify | shell | smoke tests prove the result |
| (All of it) | **Git** + **Jenkins** | the repository is the source of truth; a pipeline runs these steps |

The "servers" are the two real SSH servers of the lab (`ev01`, `sql01`) and the cluster is the real lab cluster, so every step below genuinely runs. In a real project Terraform would create cloud VMs instead of just describing the lab's hosts, and Jenkins would call the script. The connections between the steps are exactly the same.

```setup
export LABNS=capstone
```

@setup sshlab
@setup k8s

```run
docker rm -f registry > /dev/null 2>&1
docker run -d --name registry -p 127.0.0.1:5000:5000 registry:2 > /dev/null
rm -rf ~/lab/ev-platform && mkdir -p ~/lab/ev-platform/{terraform,ansible,app/site,k8s} && cd ~/lab/ev-platform
git init -q && git config user.name Ops && git config user.email ops@example.com
echo "repository layout:"; ls
```

## Step 1: Terraform declares the servers and produces the inventory

The server list lives in one variable. Terraform renders an Ansible **inventory** from it: the output of infrastructure as code becomes the input of configuration management. (We use the built-in `terraform_data` resource with a `local-exec` provisioner, as in the Terraform track, because cloud providers are not reachable here.)

```run
cd ~/lab/ev-platform/terraform
cat > main.tf <<'EOF'
variable "servers" {
  type = map(object({ port = number, role = string }))
  default = {
    ev01  = { port = 2222, role = "evservers" }
    sql01 = { port = 2223, role = "sqlservers" }
  }
}

locals {
  inventory = templatefile("${path.module}/inventory.tftpl", { servers = var.servers })
}

resource "terraform_data" "inventory" {
  input = local.inventory
  provisioner "local-exec" {
    command = "printf '%s' \"$CONTENT\" > ../ansible/inventory.ini"
    environment = { CONTENT = self.input }
  }
}

output "hosts" {
  value = keys(var.servers)
}
EOF
cat > inventory.tftpl <<'EOF'
%{ for role in distinct([for s in servers : s.role]) ~}
[${role}]
%{ for name, s in servers ~}
%{ if s.role == role ~}
${name} ansible_host=127.0.0.1 ansible_port=${s.port}
%{ endif ~}
%{ endfor ~}

%{ endfor ~}
[all:vars]
ansible_user=student
ansible_ssh_private_key_file=~/sshlab/client_key
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR
EOF
terraform fmt > /dev/null && terraform fmt -check && echo "fmt: ok"
terraform init > /dev/null 2>&1 && terraform validate
terraform apply -auto-approve | grep -E "Plan:|Apply complete|hosts"
echo "--- inventory written by Terraform:"
cat ../ansible/inventory.ini
```

Change a server in the Terraform variable and the inventory regenerates: one source of truth.

## Step 2: Ansible configures the servers

```run
cd ~/lab/ev-platform/ansible
printf '[defaults]\ninventory = inventory.ini\ninterpreter_python = auto_silent\nretry_files_enabled = False\n[ssh_connection]\nusetty = False\npipelining = True\n' > ansible.cfg
mkdir -p group_vars templates
printf 'base_dir: /tmp/capstone/{{ inventory_hostname }}\nev_threads: 4\n' > group_vars/all.yml
printf 'ev_threads: 8\n' > group_vars/evservers.yml
cat > templates/evault.conf.j2 <<'EOF'
# Managed by Ansible
server={{ inventory_hostname }}
threads={{ ev_threads }}
EOF
cat > site.yml <<'EOF'
- hosts: all
  gather_facts: false
  tasks:
    - name: Folders exist
      ansible.builtin.file:
        path: "{{ base_dir }}/{{ item }}"
        state: directory
        mode: "0750"
      loop: [conf, logs]

    - name: Config file rendered
      ansible.builtin.template:
        src: evault.conf.j2
        dest: "{{ base_dir }}/conf/evault.conf"
        mode: "0640"
      notify: Pretend restart

  handlers:
    - name: Pretend restart
      ansible.builtin.debug:
        msg: "restart service on {{ inventory_hostname }}"
EOF
rm -rf /tmp/capstone
ansible-playbook site.yml --syntax-check | tail -1
ansible-playbook site.yml | grep -E "^(changed|ok)|RUNNING HANDLER|ok=" | sed 's/ \*\*\*.*//'
ssh ev01 'cat /tmp/capstone/ev01/conf/evault.conf'
ssh sql01 'cat /tmp/capstone/sql01/conf/evault.conf'
```

The EV server got `threads=8` from its group variables, the SQL server the default 4: the same playbook, tailored per group.

## Step 3: Docker packages the application and publishes it

```run
cd ~/lab/ev-platform/app
cat > site/index.html <<'EOF'
<h1>EV status</h1>
version: 1
EOF
cat > Dockerfile <<'EOF'
FROM busybox:1.37
COPY site/ /www/
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
EOF
cat > test.sh <<'EOF'
#!/bin/bash
grep -q '^version: [0-9]' site/index.html
EOF
chmod +x test.sh && ./test.sh && echo "unit test: ok"
docker build -q -t localhost:5000/ev/status:1 . > /dev/null
docker push -q localhost:5000/ev/status:1 > /dev/null
curl -s http://127.0.0.1:5000/v2/ev/status/tags/list
```

## Step 4: Kubernetes runs it

```run
cd ~/lab/ev-platform/k8s
cat > deploy.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: ev-status}
spec:
  replicas: 2
  selector:
    matchLabels: {app: ev-status}
  template:
    metadata:
      labels: {app: ev-status}
    spec:
      containers:
      - name: web
        image: localhost:5000/ev/status:1
        ports: [{containerPort: 8080}]
        readinessProbe:
          httpGet: {path: /, port: 8080}
          periodSeconds: 2
        resources:
          requests: {cpu: 50m, memory: 16Mi}
          limits: {memory: 64Mi}
---
apiVersion: v1
kind: Service
metadata: {name: ev-status}
spec:
  selector: {app: ev-status}
  ports: [{port: 80, targetPort: 8080}]
EOF
kubectl apply -f deploy.yaml
kubectl rollout status deployment/ev-status --timeout=120s | tail -1
```

## Step 5: verify from the outside

```run
kubectl run verify --image=busybox:1.37 --restart=Never -- sh -c 'wget -qO- http://ev-status | tail -1'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/verify --timeout=60s > /dev/null
echo "service answered: $(kubectl logs verify)"
```

## Put it in one script and commit it

The steps become a pipeline script in the repository: what Jenkins runs on every change.

```run
cd ~/lab/ev-platform
cat > pipeline.sh <<'EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
step() { echo; echo "=== $1"; }

step "terraform"
(cd terraform && terraform fmt -check > /dev/null && terraform validate > /dev/null && terraform apply -auto-approve | grep -E "Apply complete")

step "ansible"
(cd ansible && ansible-playbook site.yml | grep -E "ok=")

step "test and build"
(cd app && ./test.sh && docker build -q -t localhost:5000/ev/status:${VERSION:-1} . > /dev/null && docker push -q localhost:5000/ev/status:${VERSION:-1} > /dev/null && echo "image ev/status:${VERSION:-1} pushed")

step "deploy"
sed "s#ev/status:[0-9]*#ev/status:${VERSION:-1}#" k8s/deploy.yaml | kubectl apply -f - | grep -v unchanged || true
kubectl rollout status deployment/ev-status --timeout=120s | tail -1

step "verify"
kubectl delete pod verify --ignore-not-found > /dev/null
kubectl run verify --image=busybox:1.37 --restart=Never -- sh -c 'wget -qO- http://ev-status | tail -1' > /dev/null
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/verify --timeout=60s > /dev/null
echo "service says: $(kubectl logs verify)"
echo; echo "PIPELINE OK"
EOF
chmod +x pipeline.sh
printf '.terraform/\n*.tfstate*\n' > .gitignore
git add -A && git commit -q -m "EV lab as code: terraform, ansible, app, k8s, pipeline" && git log --format='committed: %s'
```

## Run the pipeline: nothing should change

Everything is already built, so a correct pipeline is **idempotent**: it re-runs, changes nothing, and still passes.

```run
cd ~/lab/ev-platform
./pipeline.sh 2>&1 | sed -E 's/ok=([0-9]+) +changed=([0-9]+).*/ok=\1 changed=\2/'
```

Look for `changed=0` in the Ansible lines (nothing to fix) and `Apply complete! Resources: 0 added, 0 changed` for Terraform. This is the quality bar from the Ansible lesson, now across the whole stack.

## Make a change: version 2 flows through everything

A developer updates the page and the EV thread count. Two small file edits, one commit, one pipeline run:

```run
cd ~/lab/ev-platform
sed -i 's/version: 1/version: 2/' app/site/index.html
sed -i 's/ev_threads: 8/ev_threads: 12/' ansible/group_vars/evservers.yml
git commit -qam "Release 2: faster indexing, new page"
VERSION=2 ./pipeline.sh 2>&1 | sed -E 's/ok=([0-9]+) +changed=([0-9]+).*/ok=\1 changed=\2/'
ssh ev01 'grep threads /tmp/capstone/ev01/conf/evault.conf'
```

One commit changed a server setting (Ansible reported `changed=1` for EV01 and ran the handler) **and** shipped the new application version with a rolling update. Nobody logged in to a server. This is DevOps in miniature.

## Tear down

```run
cd ~/lab/ev-platform
(cd terraform && terraform destroy -auto-approve | grep "Destroy complete")
kubectl delete namespace capstone --wait=false > /dev/null
docker rm -f registry > /dev/null
ssh ev01 'rm -rf /tmp/capstone'
echo "environment removed; the repository can rebuild it with ./pipeline.sh"
```

## What to add next

| Improvement | Tool |
|---|---|
| Run `pipeline.sh` from a Jenkinsfile on every push (webhook), on an agent that has the tools | Jenkins |
| Real servers instead of lab hosts | Terraform + a cloud provider; Ansible over SSH/WinRM |
| Staged environments (test, then prod) with approval | Jenkins `input`, separate inventories and tfvars |
| Secrets (SSH keys, registry password, vault password) | Jenkins credentials, Ansible Vault, a cloud secret manager |
| Monitoring and alerts for the deployed app | Prometheus rules (Monitoring track) |
| Policy and security checks | `terraform validate`, `ansible-lint`, image scanning, Pod Security |
| GitOps for the cluster side | Argo CD or Flux watching the `k8s/` folder |

<!-- deeper -->
## Answer and common mistakes

Adding `ev02` shows the division of labour:

1. **Terraform** sees a new key in the server map and plans **one addition**; the existing servers show no change.
2. **Ansible** runs against the new host and reports `changed` there only. On hosts already in the desired state it reports `ok`: that is idempotency.
3. When the unit test is broken on purpose, the pipeline stops at the test stage with a non-zero exit, so **nothing downstream (build, deploy) runs**. That is the whole point of a pipeline: a failed gate prevents a bad release.

:::warn Common mistakes
- **Fixing the server by hand** and not the code. The next pipeline run silently reverts or conflicts with your edit.
- **Skipping the plan review** because "it's only one server".
- **Bypassing the test gate** to meet a deadline.
- **Not keeping the pipeline files in Git,** so nobody can see why something changed.
:::
<!-- /deeper -->

:::recap
- Terraform's output (inventory) feeds Ansible; Ansible prepares servers; Docker builds the artefact; Kubernetes runs it; a script verifies it.
- Everything lives in Git; one script (later one Jenkins pipeline) runs the whole chain.
- A good pipeline is idempotent: a second run changes nothing. One commit can change both configuration and application.
:::

:::try Your turn
Add a third server `ev02` (port 2222, role evservers) to the Terraform variable, re-run the pipeline, and watch what Terraform and Ansible do. Then break the unit test on purpose and confirm that nothing is deployed.
:::

:::quiz
? Why does Terraform write the Ansible inventory?
+ The server list stays defined in one place, and configuration follows infrastructure automatically
- Ansible cannot read hosts
- To avoid SSH
- Because inventories are secret
! One source of truth removes drift.
? What does `changed=0` on a second pipeline run prove?
+ The automation is idempotent: the desired state was already true
- Nothing ran
- The servers are down
- Tests were skipped
! The same property you want everywhere.
? How did the application upgrade reach production?
+ A commit changed files; the pipeline built, pushed and rolled out a new image
- Someone logged in and copied files
- Kubernetes pulled from Git automatically
- Docker updated itself
! Automation from a commit.
:::
