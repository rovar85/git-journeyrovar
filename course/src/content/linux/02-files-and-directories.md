---
track: linux
title: Files and directories
short: Files
sub: The file system tree, paths, and creating, copying, moving and deleting.
---

:::goals
- picture the Linux directory tree and name the important folders
- tell absolute paths from relative paths and move around with `cd`
- create, copy, move and delete files and folders
- use wildcards to act on many files at once
:::

## One tree, no drive letters

Windows has `C:` and `D:`. Linux has a **single tree** that starts at the root, written `/`. Other disks are attached ("mounted") onto folders in that tree. Everything, including devices and running programs, appears as a file or folder somewhere in it. The standard layout is the same on almost every distribution, so learn it once:

| Folder | What lives there | Enterprise Vault connection |
|---|---|---|
| `/home` | each user's personal files (`/home/student`) | your scripts and notes |
| `/etc` | system and application **configuration** files | where settings of Linux services live |
| `/var/log` | **log files** | the first place to look when something breaks |
| `/var/lib` | programs' saved data (databases and so on) | where a database keeps its files |
| `/tmp` | temporary files, cleared often | scratch space |
| `/usr` | installed programs and libraries | |
| `/bin`, `/usr/bin` | the commands you run | |
| `/opt` | optional add-on software | vendor products often install here |
| `/proc`, `/sys`, `/dev` | live views of the kernel, hardware and devices | |
| `/root` | the home of the administrator account | |

Your **home directory** is written `~`. This lesson works in a small pretend server folder:

@setup evlab

```run
pwd
ls
ls ev
```

## Paths: where is it?

A **path** is the address of a file or folder.

- An **absolute path** starts with `/` and works from anywhere: `/home/student/lab/ev/logs/indexing.log`.
- A **relative path** does not start with `/`. It is measured from where you are now: `ev/logs/indexing.log`.

Three special names help: `.` is "here", `..` is "the parent folder", and `~` is your home. `cd` ("change directory") moves you around:

```run
cd ev/logs
pwd
cd ..
pwd
cd ../docs
pwd
cd -
pwd
cd ~
pwd
cd ~/lab
```

`cd -` jumps back to where you just were. `cd` with no argument goes home.

:::note Tip
Quote or escape file names that contain spaces: `cd "My Documents"`. Better still, avoid spaces in names you create. Use `-` or `_`.
:::

## Looking around

```run
ls -l --time-style=long-iso ev
ls -a
ls -R docs ev/config
ls -lh --time-style=long-iso ev/logs
```

- `-l` long format: permissions, owner, size, date, name.
- `-a` all files, including hidden ones that start with a dot.
- `-h` human-readable sizes (K, M, G), used with `-l`.
- `-R` recursive: go into sub-folders.

`file` tells you what kind of file something is, and `stat` shows everything the system knows about it:

```run
file ev/config/evault.conf ev/scripts/check.sh
stat -c '%n  size=%s bytes  owner=%U' ev/config/evault.conf
```

## Creating things

```run
mkdir reports
mkdir -p reports/2026/september
touch reports/2026/september/summary.txt
ls -R reports
```

- `mkdir` makes a folder. `mkdir -p` also makes any missing parent folders, and does not complain if the folder already exists.
- `touch` creates an empty file (or updates the timestamp of an existing one).

## Copying, moving, renaming

```run
cp docs/notes.txt docs/notes-backup.txt
cp -r ev/config reports/config-copy
mv docs/notes-backup.txt reports/
mv reports/notes-backup.txt reports/backup-notes.txt
ls docs reports
```

- `cp source destination` copies. Use `-r` (recursive) for folders.
- `mv source destination` moves, and **renaming is just moving to a new name**.

## Deleting (carefully)

```run
rm reports/backup-notes.txt
rm -r reports/config-copy
rmdir reports/2026/september 2>&1 | head -1
ls -R reports
```

- `rm` removes files, `rm -r` removes a folder and everything in it, and `rmdir` only removes *empty* folders (it refused above because the folder still has `summary.txt`).
- There is **no undo and no recycle bin**.

:::warn The most dangerous habit
Never run `rm -rf` with a path you have not looked at, and never paste a delete command you do not understand. A stray space, as in `rm -rf / home/student`, deletes the whole system. Before deleting with a wildcard, run the same command with `ls` first to see exactly what it matches. Use `rm -i` to be asked before each deletion.
:::

## Wildcards: acting on many files

The shell expands patterns *before* running the command:

| Pattern | Matches |
|---|---|
| `*` | any run of characters (including none) |
| `?` | exactly one character |
| `[abc]` | one character from the list |
| `{a,b}` | either word (brace expansion) |

```run
ls ev/logs/*.log
ls docs/n*
ls docs/?otes.txt
ls ev/{logs,config}
echo ev/logs/*.log
```

The last line shows what really happens: `echo` receives the already-expanded list of file names. The command never sees the `*`.

## Finding a file you cannot remember

```run
find . -name "*.log"
find . -type d
find . -name "*.conf" -o -name "*.sh"
```

`find where -name pattern` searches the folder and everything below it. `-type d` finds only directories, `-type f` only files.

:::try Your turn
1. Make a folder `practice`, create three empty files in it with one command (`touch practice/{a,b,c}.txt`), then list it.
2. Copy `ev/logs` into `practice/` and rename the copy `logs-old`.
3. Use `find` to list every file whose name ends in `.log`. How many are there?
4. Before deleting `practice`, list what is inside with `ls -R practice`. Then remove it.
:::

:::recap
- One tree starting at `/`. `/etc` is configuration, `/var/log` is logs, `/home` is people's files.
- Absolute paths start with `/`. Relative paths do not. `.` is here, `..` is the parent, `~` is home.
- `mkdir -p`, `touch`, `cp -r`, `mv` (also renames), `rm -r` (permanent!).
- Wildcards `* ? [] {}` are expanded by the shell before the command runs. Use `find` to search.
:::

:::quiz
? What is the difference between `/etc/hosts` and `etc/hosts`?
+ The first is an absolute path. The second is relative to your current folder
- They are identical
- The first is hidden
! A leading / makes the path absolute.
? Which command makes `a/b/c`, creating missing parent folders?
- mkdir a/b/c
+ mkdir -p a/b/c
- touch a/b/c
! -p creates the missing parents.
? How do you rename a file in Linux?
- rename is not possible
+ mv oldname newname
- cp oldname newname
! Renaming is moving to a new name.
? Before running `rm -r logs/*.old`, what is a sensible precaution?
- None, it is safe
+ Run `ls logs/*.old` first to see exactly what the pattern matches
- Run it as root
! The shell expands the wildcard, so check what it expands to before you delete.
:::
