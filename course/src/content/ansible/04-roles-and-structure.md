---
track: ansible
title: Roles and project structure
short: Roles
sub: Organise automation into reusable roles, with tags, includes and a standard layout.
---

:::goals
- explain why roles exist and what is inside one
- create a role skeleton and use it from a playbook
- use `defaults` versus `vars`, `tags`, and `import`/`include`
- lay out a real Ansible project
:::

## Why roles

A single playbook grows into hundreds of lines. A **role** packages related work (everything needed to set up "the EV indexing service") into a folder with a fixed layout, so it can be reused in many playbooks and shared. Playbooks then read like a summary:

```yaml:site.yml
- hosts: evservers
  roles:
    - common
    - ev_indexing
- hosts: sqlservers
  roles:
    - common
    - sql_client
```

## The role layout

```text
roles/ev_indexing/
├── tasks/main.yml        what to do (the entry point)
├── handlers/main.yml     restart/reload actions
├── defaults/main.yml     default variables (lowest precedence: easy to override)
├── vars/main.yml         fixed variables (high precedence)
├── templates/            Jinja2 files (*.j2)
├── files/                static files to copy
└── meta/main.yml         dependencies, metadata
```

`ansible-galaxy init NAME` creates the skeleton. Build a small role:

@setup sshlab

```run
mkdir -p ~/lab/ans3/roles && cd ~/lab/ans3
cat > inventory.ini <<'EOF'
[evservers]
ev01 ansible_host=127.0.0.1 ansible_port=2222
[all:vars]
ansible_user=student
ansible_ssh_private_key_file=~/sshlab/client_key
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR
EOF
printf '[defaults]\ninventory = inventory.ini\ninterpreter_python = auto_silent\nroles_path = roles\nretry_files_enabled = False\n[ssh_connection]\nusetty = False\npipelining = True\n' > ansible.cfg
cd roles && ansible-galaxy role init ev_indexing 2>&1 | sed 's/ was created.*/ created/'
find ev_indexing -type f | sort
```

The role's folders are created with placeholder files. Fill in the useful ones:

```run
cd ~/lab/ans3/roles/ev_indexing
cat > defaults/main.yml <<'EOF'
ev_base_dir: /tmp/ev-role-demo
ev_index_threads: 4
ev_log_level: info
EOF
cat > templates/indexing.conf.j2 <<'EOF'
# Managed by Ansible role ev_indexing
threads={{ ev_index_threads }}
log_level={{ ev_log_level }}
host={{ inventory_hostname }}
EOF
cat > tasks/main.yml <<'EOF'
- name: Create service folders
  ansible.builtin.file:
    path: "{{ ev_base_dir }}/{{ item }}"
    state: directory
    mode: "0750"
  loop: [conf, logs]
  tags: [folders]

- name: Render indexing config
  ansible.builtin.template:
    src: indexing.conf.j2
    dest: "{{ ev_base_dir }}/conf/indexing.conf"
    mode: "0640"
  notify: Restart indexing
  tags: [config]
EOF
cat > handlers/main.yml <<'EOF'
- name: Restart indexing
  ansible.builtin.debug:
    msg: "pretend: systemctl restart ev-indexing"
EOF
rm -rf tests
cd ~/lab/ans3
cat > site.yml <<'EOF'
- hosts: evservers
  gather_facts: false
  roles:
    - ev_indexing
EOF
rm -rf /tmp/ev-role-demo
ansible-playbook site.yml | grep -E "TASK|changed:|RUNNING|msg|ok="  | sed 's/ \*\*\*.*//'
```

Notice the task names are prefixed with the role name in real output (`ev_indexing : Create...`). Run it again to confirm idempotency, then override a default **without editing the role**:

```run
cd ~/lab/ans3
ansible-playbook site.yml | grep -E "ok="
ansible-playbook site.yml -e ev_index_threads=8 | grep -E "RUNNING|ok="
ssh ev01 'cat /tmp/ev-role-demo/conf/indexing.conf'
```

## defaults versus vars

Put anything a user might want to change in `defaults/main.yml` (weakest, so any inventory or play variable overrides it). Put internal constants in `vars/main.yml` (strong). Prefix variable names with the role name (`ev_...`) so roles do not collide.

## Tags

**Tags** label tasks so you can run or skip subsets:

```run
cd ~/lab/ans3
ansible-playbook site.yml --list-tags | grep -E "TASK TAGS"
ansible-playbook site.yml --tags config -e ev_log_level=debug | grep -E "TASK|changed:|ok=" | sed 's/ \*\*\*.*//'
ansible-playbook site.yml --skip-tags folders | grep -E "TASK" | sed 's/ \*\*\*.*//'
```

`--tags config` ran only the config task (and its handler). Tags are a precise tool for "just push the config".

## Including other files

- `import_tasks` / `import_role`: resolved when the playbook is **parsed** (static).
- `include_tasks` / `include_role`: resolved while running (dynamic), so they can sit inside loops and conditions.

```yaml:example
- name: Platform specific steps
  ansible.builtin.include_tasks: "{{ ansible_os_family | lower }}.yml"
```

## A real project layout

```text
ansible-project/
├── ansible.cfg
├── inventories/
│   ├── prod/hosts.ini          # and group_vars/, host_vars/ inside
│   └── test/hosts.ini
├── playbooks/
│   ├── site.yml
│   └── patch.yml
├── roles/
│   ├── common/
│   └── ev_indexing/
├── collections/requirements.yml
└── README.md
```

Separate inventories for test and production mean the **same roles** are run against both (`-i inventories/test`), which is how you test changes safely first. **Collections** (`ansible-galaxy collection install community.general`) are bundles of modules and roles from the community or vendors (for example `ansible.windows`, `amazon.aws`).

:::recap
- A role = tasks, handlers, defaults, templates, files in a standard folder layout.
- `ansible-galaxy role init`. Use `roles:` in a play.
- `defaults` are easily overridden; prefix variables with the role name.
- Tags run subsets. Separate inventories for test and prod, same roles.
:::

:::try Your turn
Add a task to the role that writes a `README.txt` into `logs`, tag it `docs`, and run only that tag. Then run the playbook with `--check` to see it report no further changes.
:::

:::quiz
? What is the benefit of putting settings in `defaults/main.yml`?
+ They have the lowest precedence, so users can override them easily
- They run first
- They are encrypted
- They apply only to Windows
! `vars/` is for values users should not override.
? What does `--tags config` do?
+ Runs only tasks labelled `config`
- Installs config packages
- Skips config tasks
- Creates a tag
! Handy for quick targeted changes.
? Why have separate inventories for test and prod?
+ So the same roles can be proven on test before touching production
- Ansible requires two
- To save disk space
- To speed up SSH
! Environment separation is basic good practice.
:::
