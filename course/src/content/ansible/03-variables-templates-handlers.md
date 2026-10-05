---
track: ansible
title: Variables, templates, loops and handlers
short: Variables, templates
sub: Make playbooks flexible: variables, Jinja2 templates, conditionals, loops, handlers.
---

:::goals
- define and use variables (play, host, group, command line)
- render a config file from a Jinja2 template
- use `when`, `loop` and facts
- use handlers so services restart only when needed
:::

## Variables

Variables avoid copy-pasting. Use them in `{{ double braces }}` (quote the whole value if it starts with them).

```yaml:example
vars:
  app_name: evault
  max_retries: 5
tasks:
  - debug:
      msg: "{{ app_name }} will retry {{ max_retries }} times"
```

Where variables come from, from weakest to strongest: role defaults, inventory and `group_vars/`, `host_vars/`, play `vars:`, command line `-e name=value` (always wins). Putting variables per group and host in files is the standard way to keep **one playbook** for **many environments**.

@setup sshlab

```run
mkdir -p ~/lab/ans2/group_vars ~/lab/ans2/host_vars && cd ~/lab/ans2
cat > inventory.ini <<'EOF'
[evservers]
ev01 ansible_host=127.0.0.1 ansible_port=2222
[sqlservers]
sql01 ansible_host=127.0.0.1 ansible_port=2223
[all:vars]
ansible_user=student
ansible_ssh_private_key_file=~/sshlab/client_key
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR
EOF
printf '[defaults]\ninventory = inventory.ini\ninterpreter_python = auto_silent\nretry_files_enabled = False\n[ssh_connection]\nusetty = False\npipelining = True\n' > ansible.cfg
printf 'app_name: evault\nmax_retries: 3\nbase_dir: /tmp/lab-hosts/{{ inventory_hostname }}\n' > group_vars/all.yml
printf 'max_retries: 7\nrole_note: indexing server\n' > host_vars/ev01.yml
printf 'role_note: database server\n' > host_vars/sql01.yml
cat > vars.yml <<'EOF'
- hosts: all
  gather_facts: false
  tasks:
    - name: Show variables for each host
      ansible.builtin.debug:
        msg: "{{ inventory_hostname }}: {{ role_note }}, max_retries={{ max_retries }}, dir={{ base_dir }}"
EOF
ansible-playbook vars.yml | grep msg
ansible-playbook vars.yml -e max_retries=1 | grep msg | cut -d, -f2
```

`ev01` got `max_retries=7` from its `host_vars` file (more specific than group), `sql01` the group value 3. The `-e max_retries=1` on the command line overrode both. `inventory_hostname` is a built-in "magic" variable.

## Facts and conditionals

**Facts** are gathered by default at the start of a play (unless `gather_facts: false`). They describe the node: `ansible_distribution`, `ansible_memtotal_mb`, `ansible_default_ipv4`, and so on. `when:` runs a task only if a condition is true.

```run
cd ~/lab/ans2
cat > facts.yml <<'EOF'
- hosts: ev01
  tasks:
    - name: Show some facts
      ansible.builtin.debug:
        msg: "{{ ansible_distribution }} {{ ansible_distribution_major_version }}, family={{ ansible_os_family }}"
    - name: Only on Debian-family systems
      ansible.builtin.debug:
        msg: "this is a Debian-family host: use apt"
      when: ansible_os_family == "Debian"
    - name: Only on Red Hat family systems
      ansible.builtin.debug:
        msg: "this is a Red Hat family host: use dnf"
      when: ansible_os_family == "RedHat"
EOF
ansible-playbook facts.yml | grep -E "msg|skipping"
```

The second task ran; the third was **skipped**. Playbooks that must support both Ubuntu and RHEL use exactly this pattern.

## Loops

```run
cd ~/lab/ans2
cat > loop.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  vars:
    folders: [logs, config, archive]
  tasks:
    - name: Create several folders
      ansible.builtin.file:
        path: "{{ base_dir }}/{{ item }}"
        state: directory
      loop: "{{ folders }}"
EOF
rm -rf /tmp/lab-hosts
ansible-playbook loop.yml | grep -E "ok|changed" | head -5
ls /tmp/lab-hosts/ev01
```

`loop:` repeats a task for each item, referenced as `{{ item }}`. Loops over lists of dictionaries are common for users and packages.

## Templates: config files with holes

A **template** is a file with placeholders, written in **Jinja2** (`{{ variable }}`, `{% if %}`, `{% for %}`). The `template` module fills it in per host. One template, many servers, each with the right values.

```run
cd ~/lab/ans2
mkdir -p templates
cat > templates/evault.conf.j2 <<'EOF'
# Managed by Ansible. Do not edit by hand.
server={{ inventory_hostname }}
role={{ role_note }}
retries={{ max_retries }}
{% if max_retries > 5 %}
# high retry count: network is unreliable
{% endif %}
EOF
cat > tmpl.yml <<'EOF'
- hosts: all
  gather_facts: false
  tasks:
    - name: Ensure the folder exists
      ansible.builtin.file:
        path: "{{ base_dir }}"
        state: directory
    - name: Render config
      ansible.builtin.template:
        src: evault.conf.j2
        dest: "{{ base_dir }}/evault.conf"
        mode: "0640"
      notify: Report change
  handlers:
    - name: Report change
      ansible.builtin.debug:
        msg: "config changed on {{ inventory_hostname }}"
EOF
ansible-playbook tmpl.yml | grep -E "RUNNING HANDLER|msg|PLAY RECAP|ok="
echo "--- rendered for ev01:"; cat /tmp/lab-hosts/ev01/evault.conf
echo "--- rendered for sql01:"; cat /tmp/lab-hosts/sql01/evault.conf
```

Same template, different output. The "managed by Ansible" comment warns humans not to edit files that will be overwritten.

## Handlers: act only on change

A **handler** is a task that runs only when another task **notifies** it, and only once at the end of the play, even if notified many times. This is exactly right for "restart the service **if** its config changed":

```run
cd ~/lab/ans2
echo "--- second run: no change, so the handler does not run"
ansible-playbook tmpl.yml | grep -E "RUNNING HANDLER|PLAY RECAP|ok="
sed -i 's/max_retries: 7/max_retries: 8/' host_vars/ev01.yml
echo "--- after changing a variable: the handler runs for ev01 only"
ansible-playbook tmpl.yml | grep -E "RUNNING HANDLER|msg"
```

In a real playbook the handler would be `ansible.builtin.service: name=evault state=restarted`. You have just seen how Ansible restarts services **only when needed**, with no downtime on repeat runs.

:::recap
- Variables from `group_vars`, `host_vars`, `vars:` and `-e` (strongest). `inventory_hostname` and facts are built in.
- `when:` conditions, `loop:` repetition.
- `template` renders Jinja2 files per host.
- Handlers run once, only if notified by a task that changed something.
:::

:::try Your turn
Add `max_connections` as a group variable and a different value for `sql01`. Add it to a new template and render it. Then change a value and confirm only the right host reports a change.
:::

:::quiz
? Which variable source wins?
- group_vars
- host_vars
+ `-e` on the command line
- role defaults
! `-e` extra vars have the highest precedence.
? When does a handler run?
+ Only when notified by a task that reported `changed`
- Every run
- Before the first task
- Only on failure
! Typical use: restart a service after a config change.
? What does `when: ansible_os_family == "Debian"` do?
+ Runs the task only on Debian-family hosts
- Installs Debian
- Skips all tasks
- Changes the OS
! Facts power conditions.
:::
