---
track: ansible
title: Playbooks
short: Playbooks
sub: Write a repeatable YAML playbook, run it twice, and preview changes safely.
---

:::goals
- write a playbook with tasks
- read the run output and recap
- use check mode and diff mode
- explain `become`, task names and failure behaviour
:::

## Anatomy of a playbook

A **playbook** is a YAML list of **plays**. Each play says which **hosts** and then lists **tasks** in order. Every task calls one module.

```yaml:site.yml
- name: Prepare EV servers          # a play
  hosts: evservers                  # which group from the inventory
  gather_facts: false               # skip the fact-collecting step (faster)
  tasks:
    - name: Create the config folder  # a task: name + module + arguments
      ansible.builtin.file:
        path: /tmp/ev01-conf
        state: directory
```

Rules to remember: indent with **two spaces** (never tabs), list items start with `- `, and each task should have a clear `name:` because that is what you read in the output. Module names are fully qualified (`ansible.builtin.file`); the short form `file:` also works.

@setup sshlab

```run
mkdir -p ~/lab/ans && cd ~/lab/ans
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
rm -rf /tmp/ev01-conf
cat > site.yml <<'EOF'
- name: Prepare EV servers
  hosts: evservers
  gather_facts: false
  tasks:
    - name: Create the config folder
      ansible.builtin.file:
        path: /tmp/ev01-conf
        state: directory
        mode: "0750"

    - name: Write the EV config file
      ansible.builtin.copy:
        dest: /tmp/ev01-conf/evault.conf
        content: |
          server=EV01
          retries=3
        mode: "0640"

    - name: Make sure retries is set to 5
      ansible.builtin.lineinfile:
        path: /tmp/ev01-conf/evault.conf
        regexp: '^retries='
        line: retries=5
EOF
ansible-playbook site.yml
```

Read the output: each `TASK` lists hosts with a result. The colours (here not shown) mean: green `ok` = already correct, yellow `changed` = Ansible changed something, red `failed`. The **PLAY RECAP** at the end counts them per host. Notice the config file was first written with `retries=3` and then fixed to 5 by the third task, so it shows as `changed`.

## Run it again: idempotency

```run
cd ~/lab/ans
ansible-playbook site.yml | tail -3
ssh ev01 'cat /tmp/ev01-conf/evault.conf'
```

`changed=2` in the second run? The `copy` task rewrites the file to `retries=3` each time and the `lineinfile` task changes it back to 5. That is a **real bug** in the playbook (two tasks fighting), and watching `changed` on a repeat run is how you spot it. Fix: write the final content once.

```run
cd ~/lab/ans
sed -i '/Make sure retries/,$d' site.yml
sed -i 's/retries=3/retries=5/' site.yml
ansible-playbook site.yml | tail -2
ansible-playbook site.yml | tail -2
```

After one correcting run, the second run has `changed=0`. **A well-written playbook reports no changes on a second run.** That is your quality check.

## Check mode and diff: look before you leap

```run
cd ~/lab/ans
sed -i 's/retries=5/retries=9/' site.yml
ansible-playbook site.yml --check --diff | grep -E '^(TASK|changed|ok|\+|-|PLAY RECAP|ev01)' | grep -v '^[-+]{3}'
ssh ev01 'grep retries /tmp/ev01-conf/evault.conf'
```

`--check` (a dry run) reports what **would** change without doing it, and `--diff` shows the file differences. The file still says `retries=5`. Use this before every production run. Apply for real:

```run
cd ~/lab/ans
ansible-playbook site.yml | tail -2
ssh ev01 'grep retries /tmp/ev01-conf/evault.conf'
```

## Privileges: become

Tasks that need root (install packages, edit `/etc`) use **privilege escalation**: `become: true` at play or task level, usually via `sudo`. Keep tasks unprivileged unless needed. The lab account has passwordless sudo:

```run
cd ~/lab/ans
cat > who.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  tasks:
    - name: Who am I?
      ansible.builtin.command: whoami
      register: me
      changed_when: false
    - name: Who am I with become?
      ansible.builtin.command: whoami
      become: true
      register: me_root
      changed_when: false
    - name: Show both
      ansible.builtin.debug:
        msg: "normal={{ me.stdout }} escalated={{ me_root.stdout }}"
EOF
ansible-playbook who.yml | grep -E 'msg|normal'
```

`register` saves a task's result in a variable, `debug` prints it, and `changed_when: false` tells Ansible that a read-only command never counts as a change (otherwise `command` always reports `changed`).

## When a task fails

```run
cd ~/lab/ans
cat > fail.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  tasks:
    - name: This works
      ansible.builtin.debug:
        msg: "first"
    - name: This fails
      ansible.builtin.command: ls /nonexistent-folder
    - name: This is never reached
      ansible.builtin.debug:
        msg: "third"
EOF
ansible-playbook fail.yml 2>&1 | grep -E "TASK|fatal|PLAY RECAP|ev01 " | sed 's/ => .*//' | cut -c1-100
```

By default a failure **stops the play for that host**. You can change that with `ignore_errors: true` (continue) or handle it with `block:` / `rescue:`. Exit code is non-zero, so CI systems notice.

<!-- deeper -->
## A worked solution and common mistakes

```run
cd ~/lab/ans
cat > motd.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  tasks:
    - name: Ensure the folder exists
      ansible.builtin.file:
        path: /tmp/ev01-conf
        state: directory
    - name: Ensure the notice file has the right text
      ansible.builtin.copy:
        dest: /tmp/ev01-conf/motd.txt
        content: "Authorised use only\n"
EOF
echo "--- first run:";  ansible-playbook motd.yml | grep -E "ok="
echo "--- second run (idempotent):"; ansible-playbook motd.yml | grep -E "ok="
sed -i 's/Authorised use only/Authorised use only. Activity is logged./' motd.yml
echo "--- preview of the edit:"; ansible-playbook motd.yml --check --diff | grep -E '^[+-][^+-]|ok='
echo "--- apply it:"; ansible-playbook motd.yml | grep -E "ok="
```

The second run shows `changed=0`: idempotency. `--check --diff` showed the change **before** anything happened.

:::warn Common mistakes
- **Tasks that always report `changed`** (`command`/`shell` without `creates`, `changed_when`): you cannot tell real changes from noise.
- **Tabs or wrong indentation in YAML.** Run `ansible-playbook --syntax-check`.
- **No task names.** The output becomes unreadable.
- **Using `become: true` everywhere,** then files end up owned by root.
- **Ignoring errors** with `ignore_errors: true` as a habit; handle expected failures deliberately.
- **Running production before `--check`.**
:::
<!-- /deeper -->

:::recap
- A playbook = plays (hosts + tasks). Each task = name + module + arguments.
- Run twice: the second run should say `changed=0`. Anything else is a hint of a flawed task.
- `--check --diff` previews changes. `become: true` escalates privileges.
- `register`, `debug`, `changed_when` handle results; failures stop the host by default.
:::

:::try Your turn
Write a playbook that ensures `/tmp/ev01-conf/motd.txt` contains "Authorised use only", run it, confirm a second run reports `changed=0`, then edit the text and use `--check --diff` before applying.
:::

:::quiz
? You run a playbook twice and the second run shows `changed=3`. What does it suggest?
+ Some tasks are not idempotent or are fighting each other
- Everything is fine
- SSH is slow
- The inventory is wrong
! A converged system should report no changes.
? What does `--check` do?
- Lints YAML only
+ Shows what would change without changing anything
- Skips failed tasks
- Runs faster
! Pair with `--diff` for file changes.
? What does `become: true` do?
- Creates a user
+ Runs the task with elevated privileges (usually sudo)
- Becomes idempotent
- Enables facts
! Use it only for tasks that need it.
:::
