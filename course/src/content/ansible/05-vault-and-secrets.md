---
track: ansible
title: Secrets with Ansible Vault
short: Vault, secrets
sub: Keep passwords out of plain text, and handle credentials safely in automation.
---

:::goals
- explain why secrets must not sit in plain text in Git
- encrypt and use values and files with `ansible-vault`
- keep the vault password out of the repository
- use `no_log` to keep secrets out of output
:::

## The rule

Playbooks live in Git and are read by many people. Database passwords, API tokens and private keys **must not** be stored there in plain text. Even in a private repository, plain-text secrets leak through forks, laptops, backups, logs and ex-employees. **Ansible Vault** encrypts files or single values using a password, so the encrypted result is safe to commit; Ansible decrypts at run time.

(In larger environments you might instead fetch secrets at run time from a dedicated secrets manager such as HashiCorp Vault, AWS Secrets Manager or Azure Key Vault, using lookup plugins. The principle is the same: **the repository holds no secrets**.)

@setup sshlab

## Encrypt a file

```run
mkdir -p ~/lab/ans4/group_vars && cd ~/lab/ans4
cat > inventory.ini <<'EOF'
[evservers]
ev01 ansible_host=127.0.0.1 ansible_port=2222
[all:vars]
ansible_user=student
ansible_ssh_private_key_file=~/sshlab/client_key
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR
EOF
printf '[defaults]\ninventory = inventory.ini\ninterpreter_python = auto_silent\nvault_password_file = .vault_pass\nretry_files_enabled = False\n[ssh_connection]\nusetty = False\npipelining = True\n' > ansible.cfg
echo "lab-only-vault-password" > .vault_pass && chmod 600 .vault_pass
printf 'db_password: S3cr3t-for-the-demo\napi_token: abc123\n' > group_vars/secrets.yml
echo "--- before:"; cat group_vars/secrets.yml
ansible-vault encrypt group_vars/secrets.yml
echo "--- after:"; head -3 group_vars/secrets.yml | cut -c1-60
```

The file now begins with `$ANSIBLE_VAULT;1.1;AES256` followed by encrypted text. This is safe to commit. Anyone with the vault password can view or edit it:

```run
cd ~/lab/ans4
ansible-vault view group_vars/secrets.yml
```

| Command | Purpose |
|---|---|
| `ansible-vault create file` | create a new encrypted file |
| `ansible-vault edit file` | decrypt, open in `$EDITOR`, re-encrypt on save |
| `ansible-vault view file` | read-only display |
| `ansible-vault encrypt` / `decrypt` | convert in place |
| `ansible-vault rekey file` | change the password |
| `ansible-vault encrypt_string 'value' --name var` | encrypt just one value inside a normal YAML file |

## Use it in a playbook

Vault-encrypted `group_vars` files load automatically like any other variable file. Use the secret, but **do not print it**:

```run
cd ~/lab/ans4
mv group_vars/secrets.yml group_vars/all.yml
cat > use.yml <<'EOF'
- hosts: ev01
  gather_facts: false
  tasks:
    - name: Write a connection file containing the secret
      ansible.builtin.copy:
        dest: /tmp/ev-conn.ini
        content: |
          [db]
          user=evsvc
          password={{ db_password }}
        mode: "0600"
      no_log: true

    - name: Prove the secret reached the host without printing it here
      ansible.builtin.command: grep -c "^password=" /tmp/ev-conn.ini
      register: found
      changed_when: false

    - name: Report
      ansible.builtin.debug:
        msg: "password line present: {{ found.stdout == '1' }}"
EOF
ansible-playbook use.yml | grep -E "TASK|changed:|msg|ok=" | sed 's/ \*\*\*.*//'
ssh ev01 'stat -c "%a %n" /tmp/ev-conn.ini; rm -f /tmp/ev-conn.ini'
```

`no_log: true` stops Ansible printing a task's arguments and results (on failure it would otherwise show the secret in the log). The remote file is `0600`: secrets in files need strict permissions (Linux track). Never use `debug` to print a secret.

## Handling the vault password

The password itself is a secret, so:

- **Never commit** it. Add `.vault_pass` to `.gitignore`.
- Locally use `--ask-vault-pass`, or a password file as above (`vault_password_file` in `ansible.cfg`).
- In CI (Jenkins, GitHub Actions) store it as a **credential/secret** and write it to a temporary file at run time.
- Use **vault IDs** (`--vault-id prod@prompt`) when production and test have different passwords.
- A wrong password fails clearly:

```run
cd ~/lab/ans4
echo "wrong-password" > /tmp/wrong_pass
(cd ~ && ansible-vault view ~/lab/ans4/group_vars/all.yml --vault-password-file /tmp/wrong_pass 2>&1 | head -2)
rm -f /tmp/wrong_pass
```

## Other places secrets leak

| Leak | Prevention |
|---|---|
| Playbook output and logs | `no_log: true`; avoid `-vvv` on secret tasks |
| `ps` and shell history | do not pass secrets on command lines; use files or stdin |
| Git history | `.gitignore`, pre-commit secret scanning; rotate if committed |
| Templates rendered with wide permissions | set `mode: "0600"` and the right owner |
| Facts and registered variables | don't register secret-bearing results without `no_log` |

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- Never store plain-text secrets in Git. `ansible-vault` encrypts files or single values.
- The vault password stays out of the repo; CI stores it as a secret.
- `no_log: true` hides sensitive tasks from output; give secret files strict permissions.
:::

:::try Your turn
Use `ansible-vault encrypt_string` to encrypt a single value, paste the result into a variables file, and use it in a playbook that writes it to a `0600` file on `ev01`.
:::

:::quiz
? Where should the vault password live?
- In `ansible.cfg` committed to Git
+ Outside the repository (a local ignored file, or a CI secret)
- In the playbook
- In the inventory
! The vault password protects everything else, so protect it separately.
? What does `no_log: true` do?
+ Hides the task's arguments and results from output and logs
- Disables logging for the whole play
- Skips the task
- Encrypts the file
! Essential for tasks handling secrets.
? You committed a plain-text password by mistake. What now?
- Delete the file; it is fine
+ Rotate (change) the password; assume it leaked
- Make the repository private
- Squash the commit only
! History and clones keep it.
:::
