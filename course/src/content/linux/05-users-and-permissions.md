---
track: linux
title: Users, groups and permissions
short: Permissions
sub: Who can read, write and run what: chmod, chown, groups, sudo and umask.
---

:::goals
- read the permission string in `ls -l`
- change permissions with `chmod` (symbolic and octal) and ownership with `chown`
- explain users, groups, `root` and `sudo`
- set up a shared folder for a team
:::

## Who are you?

Every process and every file belongs to a **user** and a **group**. Users have a numeric **user ID (UID)**; groups have a **GID**. The special user **root** (UID 0) can do anything, so people use it as rarely as possible.

@setup evlab

```run
id
whoami
groups
```

User accounts live in `/etc/passwd`, groups in `/etc/group`. (Despite the name, passwords are not in `/etc/passwd`; hashed passwords are in `/etc/shadow`, readable only by root.)

```run
grep '^student' /etc/passwd
stat -c '%A %U:%G %n' /etc/shadow /etc/passwd
```

## Reading permissions

The first column of `ls -l` is the permission string:

```run
ls -l --time-style=long-iso ev/config/evault.conf ev/scripts/check.sh
```

Take `-rw-r--r--` apart, ten characters:

| Position | Meaning |
|---|---|
| 1 | type: `-` file, `d` directory, `l` link |
| 2 to 4 | **owner** permissions: `rw-` |
| 5 to 7 | **group** permissions: `r--` |
| 8 to 10 | **others** (everyone else): `r--` |

And the three letters:

| Letter | On a file | On a directory |
|---|---|---|
| `r` read | view contents | list names inside |
| `w` write | change contents | create, rename and delete files inside |
| `x` execute | run as a program | enter it (`cd`) and reach what is inside |

So `-rw-r--r--` means: the owner can read and write, the group can only read, everyone else can only read.

## chmod: change permissions

Two notations. **Symbolic**: who (`u` owner, `g` group, `o` others, `a` all), an operator (`+` add, `-` remove, `=` set), and the permissions.

```run
ls -l ev/scripts/check.sh
./ev/scripts/check.sh 2>&1 | head -1
chmod u+x ev/scripts/check.sh
ls -l ev/scripts/check.sh
./ev/scripts/check.sh
chmod go-r ev/config/evault.conf
ls -l ev/config/evault.conf
```

The first attempt failed with "Permission denied" because the script had no `x`. After `chmod u+x` it ran.

**Octal** notation writes each trio as one digit, adding **r=4, w=2, x=1**:

| Digit | Meaning | Digit | Meaning |
|---|---|---|---|
| 7 | rwx (4+2+1) | 3 | -wx (2+1) |
| 6 | rw- (4+2) | 2 | -w- |
| 5 | r-x (4+1) | 1 | --x |
| 4 | r-- | 0 | --- |

So `755` is `rwxr-xr-x` (a typical program), `644` is `rw-r--r--` (a typical file), and `600` is `rw-------` (private).

```run
chmod 644 ev/config/evault.conf
stat -c '%a %A %n' ev/config/evault.conf
chmod 600 ev/config/evault.conf
stat -c '%a %A %n' ev/config/evault.conf
chmod -R 750 ev/scripts
stat -c '%a %A %n' ev/scripts ev/scripts/check.sh
```

Try the calculator to build permission strings both ways:

@widget chmod

## Ownership: chown and chgrp

`chown user:group file` changes who owns a file. Only root can give files away, so you normally use `sudo`.

```run
sudo chown root:root ev/config/evault.conf
ls -l ev/config/evault.conf
sudo chown student:student ev/config/evault.conf
ls -l ev/config/evault.conf
```

## sudo: borrowing root, briefly

`sudo command` runs one command with administrator rights, after checking that you are allowed (it is configured in `/etc/sudoers`). It is better than logging in as root, because only the commands you choose get the power, and each use is logged.

```run
whoami
sudo whoami
sudo cat /etc/shadow | head -c 0; echo "(read a root-only file: allowed with sudo)"
cat /etc/shadow
```

:::warn Careful
Run only commands you understand with `sudo`. Never paste `sudo` commands from the internet that you cannot read. A mistake with root rights can break the whole machine.
:::

## Groups and shared folders

Suppose two engineers, `alice` and `bob`, must both work in an `evteam` shared folder, while nobody else may enter. The recipe: create a group, add the users, give the folder to the group, and set permissions.

```run
sudo userdel -r alice 2>/dev/null; sudo userdel -r bob 2>/dev/null; sudo groupdel evteam 2>/dev/null || true
sudo groupadd evteam
sudo useradd -m -G evteam alice
sudo useradd -m -G evteam bob
sudo mkdir /srv/evshared
sudo chgrp evteam /srv/evshared
sudo chmod 2770 /srv/evshared
stat -c '%A %U:%G %n' /srv/evshared
sudo -u alice bash -c 'echo "from alice" > /srv/evshared/a.txt'
sudo -u bob bash -c 'cat /srv/evshared/a.txt'
sudo -u bob stat -c '%A %U:%G %n' /srv/evshared/a.txt
echo "--- and you (not in evteam):"
cat /srv/evshared/a.txt
```

Why `2770`? The leading `2` is the **setgid** bit: new files created inside inherit the folder's group (`evteam`), so teammates can always work on each other's files. The `770` gives the owner and group full access and everyone else nothing. Other special bits: **setuid** (`4`, run as the file's owner, as `passwd` does) and the **sticky** bit (`1`, in folders like `/tmp`, so users can delete only their own files).

```run
stat -c '%A %n' /tmp
sudo rm -rf /srv/evshared
sudo userdel -r alice 2>/dev/null; sudo userdel -r bob 2>/dev/null; sudo groupdel evteam
```

(The last line tidies up the demonstration accounts.) The `t` at the end of `/tmp`'s permissions is the sticky bit.

## umask: the default permissions

New files do not start at 777. A **umask** removes permissions from the defaults (666 for files, 777 for folders). A umask of `022` removes write from group and others, giving `644` files and `755` folders.

```run
umask
touch f1 && mkdir d1 && stat -c '%a %n' f1 d1
umask 077
touch f2 && mkdir d2 && stat -c '%a %n' f2 d2
```

:::note Enterprise Vault connection
Two classic causes of "it works for me but not for the service": the service account lacks read access to a config file or write access to a log folder. `ls -l` and `id service-account` tell you in seconds. On Windows the same ideas appear as NTFS permissions and service accounts, so the thinking transfers.
:::

:::try Your turn
1. Create a file `secret.txt`. Make it readable and writable only by you. Check with `stat`.
2. Make a script that prints a message, make it executable, and run it.
3. What octal mode is `rwxr-x---`? What is `rw-rw-r--`?
4. Look at `ls -l /usr/bin/passwd`. Which special character appears in the owner's execute position, and why does `passwd` need it?
:::

<!-- deeper -->
## Worked answers and common mistakes

```run
cd ~/lab
echo "--- 1: a private file"
echo "top secret" > secret.txt
chmod 600 secret.txt
stat -c '%a %A %n' secret.txt
echo "--- 2: make a script executable and run it"
printf '#!/bin/bash\necho "hello from my script"\n' > hello.sh
./hello.sh 2>&1 | sed -E 's/line [0-9]+: //' | head -1
chmod +x hello.sh
./hello.sh
echo "--- 3: octal values (r=4, w=2, x=1)"
python3 -c "
def octal(s): return ''.join(str(sum(v for c, v in zip(s[i:i+3], (4,2,1)) if c != '-')) for i in (0,3,6))
for s in ('rwxr-x---', 'rw-rw-r--'): print(s, '=', octal(s))"
echo "--- 4: the special character on passwd"
ls -l /usr/bin/passwd | cut -c1-10
```

Answers: `rwxr-x---` is **750**; `rw-rw-r--` is **664**. The first attempt to run `hello.sh` failed ("Permission denied") until `chmod +x`. In task 4 the owner's execute position shows **`s`**: the **setuid** bit. `passwd` must edit `/etc/shadow`, which only root may write, so the program runs **as its owner (root)** whoever starts it; that is a controlled, deliberate exception.

:::warn Common mistakes
- **`chmod 777` to "fix" a permission error.** It lets everyone modify the file. Find who needs what and grant exactly that (a group, or `750`/`640`).
- **Forgetting that folders need `x`.** To enter a folder you need execute permission on it.
- **Running everything with `sudo`.** Files created as root later cannot be edited by your user; use sudo only for the one command.
- **Secrets world-readable.** Private keys and password files should be `600`; SSH refuses keys that are not.
- **Confusing user, group and others** in `chmod g+w` versus `chmod o+w`.
:::
<!-- /deeper -->

:::recap
- Every file has an owner, a group and permissions for owner, group, others: read 4, write 2, execute 1.
- `chmod` changes permissions (`u+x`, `755`). `chown` changes owner. `sudo` runs one command as root.
- Shared team folders: a group, `chgrp`, and `2770` (setgid keeps the group).
- `umask` decides the default permissions of new files.
:::

:::quiz
? What does the permission string `-rwxr-x---` allow?
+ Owner: read, write, run. Group: read and run. Others: nothing
- Everyone can do everything
- Only root can read it
! rwx for owner, r-x for group, --- for others (750).
? What is the octal mode for `rw-r--r--`?
- 755
+ 644
- 600
! 4+2 = 6, 4, 4.
? Why did running a freshly created script fail with "Permission denied"?
- The script had a typo
+ It had no execute permission. chmod u+x fixes that
- Linux blocks all scripts
! The x bit is needed to run a file as a program.
? Why use sudo instead of working as root all the time?
+ Only chosen commands get root power, and each use is logged
- It is faster
- Root cannot run commands
! Least privilege: fewer chances to cause damage.
:::
