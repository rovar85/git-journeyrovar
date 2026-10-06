---
track: ansible
title: Real-world Ansible
short: Real-world use
sub: Packages, users, services, rolling updates, Windows, testing and where Ansible fits.
---

:::goals
- write common admin tasks: packages, users, services, cron, firewall
- run changes safely in batches (`serial`) with checks and error handling
- describe how Ansible manages Windows and network devices
- test automation and know where Ansible fits among the other tools
:::

## The everyday modules

| Job | Module | Example |
|---|---|---|
| install software | `ansible.builtin.package` (generic), `apt`, `dnf` | `name: nginx, state: present` |
| manage services | `ansible.builtin.service`, `systemd` | `name: nginx, state: started, enabled: true` |
| users and groups | `user`, `group` | `name: evsvc, groups: evteam` |
| files and templates | `copy`, `template`, `lineinfile`, `blockinfile`, `file` | |
| scheduled jobs | `cron` | `name: backup, minute: "30", hour: "2"` |
| run commands | `command`, `shell`, `script` | use only when no module fits, and make them idempotent |
| firewall | `ansible.posix.firewalld`, `community.general.ufw` | |
| download/fetch | `get_url`, `uri`, `unarchive` | |

Prefer a **module** over `shell`: a module knows the desired state and reports `changed` correctly; a raw command always "changes".

This lab host has no systemd and cannot reach package mirrors on all runs, so we apply the modules that work anywhere, and show `service`/`package` as illustrations.

@setup sshlab

```run
mkdir -p ~/lab/ans5 && cd ~/lab/ans5
cat > inventory.ini <<'EOF'
[evservers]
ev01 ansible_host=127.0.0.1 ansible_port=2222
ev02 ansible_host=127.0.0.1 ansible_port=2222
[all:vars]
ansible_user=student
ansible_ssh_private_key_file=~/sshlab/client_key
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR
EOF
printf '[defaults]\ninventory = inventory.ini\ninterpreter_python = auto_silent\nretry_files_enabled = False\n[ssh_connection]\nusetty = False\npipelining = True\n' > ansible.cfg
cat > admin.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  become: true
  tasks:
    - name: Group for the EV team
      ansible.builtin.group:
        name: evteam
        state: present

    - name: Service account
      ansible.builtin.user:
        name: evsvc
        groups: evteam
        shell: /usr/sbin/nologin
        create_home: false
        state: present

    - name: Shared folder owned by the group
      ansible.builtin.file:
        path: /srv/evshare
        state: directory
        group: evteam
        mode: "2770"

    - name: Nightly backup entry
      ansible.builtin.cron:
        name: "EV nightly backup"
        minute: "30"
        hour: "2"
        job: "/opt/ev/backup.sh >> /var/log/ev-backup.log 2>&1"
        user: evsvc
        cron_file: ev-backup

    - name: Banner paragraph managed in a shared file
      ansible.builtin.blockinfile:
        path: /etc/motd
        create: true
        marker: "# {mark} ANSIBLE MANAGED EV BLOCK"
        block: |
          Authorised EV administrators only.
          Changes are made through Ansible.
EOF
ansible-playbook admin.yml | grep -E "^(changed|ok)|ok=" | sed 's/ \*\*\*.*//'
echo "--- second run:"
ansible-playbook admin.yml | grep -E "ok="
```

This is how you describe a machine: group, service account, shared folder, scheduled job, banner. Check the result with ordinary Linux commands and then clean up:

```run
cd ~/lab/ans5
ssh ev01 'id evsvc | cut -d" " -f1,3; stat -c "%a %G %n" /srv/evshare; sudo cat /etc/cron.d/ev-backup | tail -1; grep -c ANSIBLE /etc/motd'
ansible ev01 -b -m user -a "name=evsvc state=absent" | grep -o '"changed": [a-z]*'
ansible ev01 -b -m group -a "name=evteam state=absent" | grep -o '"changed": [a-z]*'
ansible ev01 -b -m file -a "path=/srv/evshare state=absent" | grep -o '"changed": [a-z]*'
ansible ev01 -b -m file -a "path=/etc/cron.d/ev-backup state=absent" | grep -o '"changed": [a-z]*'
ansible ev01 -b -m copy -a "content='' dest=/etc/motd" | grep -o '"changed": [a-z]*'
```

## Installing and starting software (the standard pattern)

```yaml:web.yml
- hosts: webservers
  become: true
  tasks:
    - name: Install nginx
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Deploy site config
      ansible.builtin.template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
        validate: nginx -t -c %s      # refuse to install a broken config
      notify: Reload nginx

    - name: Ensure nginx is running and starts at boot
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Reload nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

This is **Example (not run here)**. Note `validate:` (check config before replacing the live file) and the handler for reload: the same pattern covers almost any service.

## Rolling updates and safety

Never change every server at once. `serial` limits the batch size; `max_fail_percentage` aborts if too many fail; `any_errors_fatal` stops everything on first failure.

```run
cd ~/lab/ans5
cat > rolling.yml <<'EOF'
- hosts: evservers
  gather_facts: false
  serial: 1                  # one host at a time
  tasks:
    - name: Take host out of rotation (pretend)
      ansible.builtin.debug:
        msg: "draining {{ inventory_hostname }}"
    - name: Upgrade (pretend)
      ansible.builtin.debug:
        msg: "upgrading {{ inventory_hostname }}"
    - name: Health check before moving on
      ansible.builtin.command: "true"
      changed_when: false
EOF
ansible-playbook rolling.yml | grep -E "^PLAY|msg" | sed 's/ \*\*\*.*//'
```

The output shows `ev01` fully processed (drain, upgrade, health check) before `ev02` begins. For a database or EV cluster, that is the difference between a maintenance window with no outage and an outage.

**Error handling:** `block` / `rescue` / `always` works like try / catch / finally:

```yaml:example
- block:
    - name: Upgrade the service
      ansible.builtin.command: /opt/ev/upgrade.sh
  rescue:
    - name: Roll back
      ansible.builtin.command: /opt/ev/rollback.sh
  always:
    - name: Record the result
      ansible.builtin.debug: msg="upgrade attempt finished"
```

## Windows, network gear and the cloud

- **Windows** servers (EV runs on Windows): Ansible connects with **WinRM** (or SSH) and uses `ansible.windows.*` modules, for example `win_service`, `win_feature`, `win_package`, `win_copy`, `win_shell`. The playbook structure is identical. Set `ansible_connection=winrm` in the inventory.
- **Network devices** (Cisco, Juniper, Arista): modules like `cisco.ios.ios_config`.
- **Cloud**: modules and **dynamic inventories** that discover hosts by tag from AWS, Azure or GCP, so the inventory never goes stale.

## Testing and quality

| Tool | Use |
|---|---|
| `ansible-playbook --syntax-check` | catches YAML and structure errors |
| `ansible-lint` | style and best-practice checks (run in CI) |
| `--check --diff` | preview on real hosts |
| **Molecule** | test roles in throw-away containers or VMs, and verify idempotency |
| a staging inventory | prove changes on non-production first |

```run
cd ~/lab/ans5
ansible-playbook admin.yml --syntax-check
printf -- '- hosts: ev01\n  tasks:\n    - debug: msg=x\n   bad_indent: true\n' > broken.yml
ansible-playbook broken.yml --syntax-check 2>&1 | grep -iE "ERROR|syntax" | head -2
```

## Where Ansible fits

| Tool | Strongest at | Style |
|---|---|---|
| **Ansible** | configuring servers and apps, orchestrating tasks | push, procedural-declarative YAML |
| **Terraform** | creating infrastructure (networks, VMs, cloud services) | declarative, tracks state |
| **Docker/Kubernetes** | packaging and running applications | images and manifests |
| **Jenkins** | running pipelines on events | pipeline as code |

A common flow: **Terraform** creates the servers, **Ansible** configures them, **Jenkins** runs both when you merge to Git. The Capstone track joins them.

<!-- deeper -->
## A worked solution and common mistakes

```run
cd ~/lab/ans5
cat > marker.yml <<'EOF'
- hosts: evservers
  gather_facts: false
  serial: 1
  tasks:
    - name: Create a marker file named after the host
      ansible.builtin.file:
        path: "/tmp/marker-{{ inventory_hostname }}"
        state: touch
        modification_time: preserve
        access_time: preserve
    - ansible.builtin.debug:
        msg: "finished {{ inventory_hostname }}"
EOF
echo "--- check mode first (nothing is created):"
ansible-playbook marker.yml --check | grep -E "^PLAY \[|finished|ok=" | sed 's/ \*\*\*.*//'
ssh ev01 'ls /tmp/marker-* 2>&1 | head -2'
echo "--- real run:"
ansible-playbook marker.yml | grep -E "^PLAY \[|finished|ok=" | sed 's/ \*\*\*.*//'
ssh ev01 'ls /tmp/marker-*; rm -f /tmp/marker-*'
```

With `serial: 1` the play ran for `ev01` completely before `ev02` started.

:::warn Common mistakes
- **Updating every server at once.** Use `serial`, and a health check that fails the batch on error.
- **`--check` blindness:** modules that cannot predict (such as `command`) are skipped or guess; read what `--check` actually covered.
- **Installing packages without `state: present` and a pinned version** where reproducibility matters.
- **No rollback plan.** Know how to return to the previous version.
- **Forgetting Windows differences** (`win_*` modules, WinRM, paths with backslashes).
:::
<!-- /deeper -->

:::recap
- Use modules (`package`, `service`, `user`, `file`, `cron`, `template`) rather than raw commands.
- `serial` for rolling changes, `block/rescue` for rollback, `validate` before replacing configs.
- Windows uses WinRM and `win_*` modules; dynamic inventories track cloud hosts.
- Test with `--syntax-check`, `ansible-lint`, `--check --diff`, Molecule and a staging inventory.
:::

:::try Your turn
Write a playbook with `serial: 1` that, for each of `ev01` and `ev02`, creates a marker file with the host name and prints a message. Run it with `--check` first.
:::

:::quiz
? Why prefer the `service` module over `command: systemctl restart x`?
+ The module is idempotent and reports changed accurately
- It is faster
- It works without SSH
- It needs no privileges
! Modules describe state, commands describe actions.
? What does `serial: 1` do?
+ Runs the play on one host at a time
- Runs tasks in series within a host
- Runs once only
- Disables parallelism for facts
! Essential for rolling updates.
? How does Ansible usually manage Windows servers?
+ WinRM (or SSH) with `win_*` modules
- An installed agent
- RDP
- SMB only
! Same playbook structure, different connection and modules.
:::
