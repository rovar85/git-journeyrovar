=== ansible/01
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

=== ansible/02
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

=== ansible/03
## A worked solution and common mistakes

```run
cd ~/lab/ans2
printf 'max_connections: 100\n' >> group_vars/all.yml
printf 'max_connections: 500\n' >> host_vars/sql01.yml
cat > templates/limits.conf.j2 <<'EOF'
# for {{ inventory_hostname }}
max_connections={{ max_connections }}
EOF
cat > limits.yml <<'EOF'
- hosts: all
  gather_facts: false
  tasks:
    - ansible.builtin.file: {path: "{{ base_dir }}", state: directory}
    - ansible.builtin.template: {src: limits.conf.j2, dest: "{{ base_dir }}/limits.conf"}
EOF
ansible-playbook limits.yml | grep -E "ok="
echo "--- rendered:"; cat /tmp/lab-hosts/ev01/limits.conf /tmp/lab-hosts/sql01/limits.conf | grep -v '^#'
echo "--- change only sql01's value; who reports a change?"
sed -i 's/max_connections: 500/max_connections: 600/' host_vars/sql01.yml
ansible-playbook limits.yml | grep -E "ok="
```

Only `sql01` reports `changed=1`; `ev01` did not change because its rendered file is identical.

:::warn Common mistakes
- **Variable precedence surprises.** The same name in `group_vars`, `host_vars` and `-e` follows a fixed order; use `ansible-inventory --host NAME` to see the final values.
- **Naming variables like Ansible keywords** (`retries`, `name`) which triggers warnings or odd behaviour. Prefix them (`ev_retries`).
- **YAML booleans and numbers as strings** (`yes`, `no`, `08`). Quote when in doubt.
- **Jinja2 `{{ }}` at the start of a YAML value without quotes** (YAML thinks it is a dictionary). Always quote: `"{{ var }}"`.
- **Handlers that never run** because the notifying task did not change anything (that is by design).
:::

=== ansible/04
## A worked solution and common mistakes

```run
cd ~/lab/ans3
cat >> roles/ev_indexing/tasks/main.yml <<'EOF'

- name: Write a README into logs
  ansible.builtin.copy:
    dest: "{{ ev_base_dir }}/logs/README.txt"
    content: "Logs for {{ inventory_hostname }}\n"
  tags: [docs]
EOF
echo "--- only the docs tag:"; ansible-playbook site.yml --tags docs | grep -E "TASK|ok="  | sed 's/ \*\*\*.*//'
echo "--- check mode afterwards: nothing left to change"; ansible-playbook site.yml --check | grep -E "ok="
```

:::warn Common mistakes
- **Putting everything in `vars/`** so nobody can override it; user-facing settings belong in `defaults/`.
- **Role variables without a prefix,** colliding with other roles.
- **Huge roles that do unrelated things.** Split by responsibility.
- **Relying on tag names nobody documented.**
- **Forgetting `roles_path`** (or a relative path problem) and getting "role not found".
:::

=== ansible/05
## A worked solution and common mistakes

```run
cd ~/lab/ans4
ansible-vault encrypt_string 'S3cr3t-single-value' --name 'api_token' | head -3 | cut -c1-70
ansible-vault encrypt_string 'S3cr3t-single-value' --name 'api_token' > group_vars/token.yml
cat > use2.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  tasks:
    - name: Write the token to a private file
      ansible.builtin.copy:
        dest: /tmp/ev-token.txt
        content: "{{ api_token }}\n"
        mode: "0600"
      no_log: true
EOF
ansible-playbook use2.yml | grep -E "ok="
ssh ev01 'stat -c "%a %n" /tmp/ev-token.txt; rm -f /tmp/ev-token.txt'
```

The encrypted string (`!vault |` followed by ciphertext) is safe to commit; only the vault password decrypts it. The result file is `0600`.

:::warn Common mistakes
- **Committing the vault password file** or `ansible.cfg` that points to it in the repository. Ignore it in Git.
- **Printing secrets** with `debug` or running with `-vvv` on secret tasks.
- **Leaving `no_log` off,** so a failure message includes the secret.
- **One shared vault password for every environment.** Use vault IDs per environment.
- **Passing secrets on the command line** (`-e password=...`): visible in `ps` and shell history.
:::

=== ansible/06
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
