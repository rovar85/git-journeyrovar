---
track: ansible
title: What Ansible is, and your first commands
short: First commands
sub: Agentless automation over SSH: inventory, ad-hoc commands and modules.
---

:::goals
- explain configuration management and why scripts are not enough
- describe how Ansible works (control node, managed nodes, SSH, modules)
- write an inventory
- run ad-hoc commands against several hosts
:::

## The problem

You have ten EV servers. Each must have the same packages, config files, users and services. Doing it by hand means mistakes and **configuration drift** (servers slowly becoming different). A Bash script is better, but a script says **how** ("run this, then that") and often breaks when run twice or on a machine in a different state. **Configuration management** says **what you want** ("this file exists with this content, this service is running") and the tool works out the steps. Ansible is the most popular such tool.

| Concept | Meaning |
|---|---|
| **Control node** | the machine where you run `ansible` (your laptop or a build server) |
| **Managed nodes** | the servers being configured; need only SSH and Python (no agent!) |
| **Inventory** | the list of managed nodes, grouped |
| **Module** | a small unit of work (`copy`, `user`, `service`...) shipped to the node and run |
| **Task** | one module call with arguments |
| **Playbook** | a YAML file listing tasks for a group of hosts |
| **Idempotent** | running it again changes nothing if the state is already correct |

How it works: Ansible connects over SSH, copies a small module to the node, runs it, gets a JSON result, and removes the module. No daemon to install or secure on the servers (so it is called **agentless**). On Windows servers it uses WinRM or SSH; the same ideas apply.

## The lab

This course environment runs two real SSH servers on your lab machine, pretending to be `ev01` and `sql01`. They are real SSH logins; they simply share one disk, so we give each its own folder where needed.

@setup sshlab

```run
ssh ev01 'echo "logged in to $(hostname) as $(whoami) on port 2222"'
ssh sql01 'echo "logged in as $(whoami) on port 2223"'
ansible --version | head -1
```

## The inventory

```run
mkdir -p ~/lab/ans && cd ~/lab/ans
cat > inventory.ini <<'EOF'
[evservers]
ev01 ansible_host=127.0.0.1 ansible_port=2222

[sqlservers]
sql01 ansible_host=127.0.0.1 ansible_port=2223

[prod:children]
evservers
sqlservers

[all:vars]
ansible_user=student
ansible_ssh_private_key_file=~/sshlab/client_key
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR
EOF
cat > ansible.cfg <<'EOF'
[defaults]
inventory = inventory.ini
interpreter_python = auto_silent
host_key_checking = False
retry_files_enabled = False

[ssh_connection]
usetty = False
pipelining = True
EOF
ansible-inventory --graph
```

An inventory has **groups** in `[brackets]`, hosts under them, and `[group:children]` to nest groups. `[all:vars]` sets variables for everyone. Real inventories use real DNS names (`ev01.corp.local`) so `ansible_host` and the port are not needed; here they point at our local SSH servers. Every inventory also has the implicit groups `all` and `ungrouped`.

## Ad-hoc commands

`ansible PATTERN -m MODULE -a "ARGUMENTS"` runs one module on matching hosts without writing a playbook.

```run
cd ~/lab/ans
ansible all -m ping
```

`ping` is **not** ICMP: it checks that Ansible can log in and run Python on each node. `SUCCESS` with `"ping": "pong"` means the whole chain (SSH, keys, Python) works. This is the first thing to test on a new host.

```run
cd ~/lab/ans
ansible evservers -m command -a "uname -s"
ansible all -m shell -a "echo \$((6*7))"
ansible sqlservers -m setup -a "filter=ansible_distribution*" | head -8
```

- `command` runs a program (no pipes or shell features), `shell` goes through a shell.
- `setup` gathers **facts** about a node: OS, IP addresses, memory, and so on. Playbooks can use them in decisions.

Host **patterns**: `all`, `evservers`, `ev01:sql01` (either), `prod:!sqlservers` (prod but not SQL), `ev*` (wildcards), `--limit ev01` (restrict a run).

```run
cd ~/lab/ans
ansible 'prod:!sqlservers' --list-hosts
ansible all --limit sql01 -m command -a "echo only-sql01" | grep -o "only-sql01"
```

## Idempotency: ad-hoc

```run
cd ~/lab/ans
ansible ev01 -m file -a "path=/tmp/ev-demo-dir state=directory mode=0750" | grep -E '"changed"'
ansible ev01 -m file -a "path=/tmp/ev-demo-dir state=directory mode=0750" | grep -E '"changed"'
ansible ev01 -m file -a "path=/tmp/ev-demo-dir state=absent" | grep -E '"changed"'
```

The first call says `changed: true` (the directory was created); the second says `changed: false` (it already matches). That is idempotency: **state**, not action. Most modules take `state=` (`present`, `absent`, `started`, `latest`...).

<!-- deeper -->
## A worked solution and common mistakes

```run
cd ~/lab/ans
cat >> inventory.ini <<'EOF'

[extra]
ev02 ansible_host=127.0.0.1 ansible_port=2222
EOF
ansible-inventory --graph | grep -E "ev0|extra"
ansible ev02 -m ping | grep -E "ev02|pong"
ansible 'ev02' --list-hosts | tail -1
```

(We added `ev02` in a new group for the demonstration; to put it in `evservers` you would add the line under that group's heading. The same machine can have several names; Ansible treats `ev01` and `ev02` as separate hosts.)

:::warn Common mistakes
- **Skipping the `ping` test** and debugging a playbook when the real problem is SSH, keys or Python.
- **SSH host-key prompts hanging the run** (set `host_key_checking` deliberately; do not just disable it everywhere in production).
- **Wrong user or key.** Check `ansible_user` and `ansible_ssh_private_key_file`.
- **Using `command`/`shell` for everything** instead of modules (`file`, `copy`, `service`), losing idempotency.
- **Running ad-hoc commands against `all` in production** without `--limit` or `--check` first.
:::
<!-- /deeper -->

:::recap
- Ansible is agentless: SSH + Python on managed nodes. YAML describes the desired state.
- Inventory = hosts and groups. `ansible-inventory --graph` shows it.
- `ansible PATTERN -m module -a args` for one-off tasks; `ping`, `command`, `shell`, `setup`, `file`.
- Modules are idempotent: `changed: false` on the second run.
:::

:::try Your turn
Add a third host `ev02` to the `evservers` group (reuse port 2222), list the group, and run `ping` against only that host.
:::

:::quiz
? What does "agentless" mean for Ansible?
+ Nothing needs installing on managed nodes beyond SSH and Python
- It has no inventory
- It runs without a network
- Nodes run a permanent daemon
! That keeps servers simple to manage.
? What does `ansible all -m ping` test?
- ICMP reachability
+ That Ansible can log in and run Python on each host
- Disk space
- DNS only
! It is the connectivity test.
? What does idempotent mean?
+ Running it again changes nothing if the state already matches
- It runs only once ever
- It runs in parallel
- It needs root
! Describe desired state, not actions.
:::
