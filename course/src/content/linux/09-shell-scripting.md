---
track: linux
title: Shell scripting
short: Scripting
sub: Turn commands into reusable scripts with variables, conditions, loops and functions.
---

:::goals
- write and run a bash script
- use variables, arguments and exit codes
- use `if`, `for`, `while` and `case`
- write functions and make a script fail safely
:::

## Your first script

@setup evlab

A **script** is a text file of commands. The first line, the **shebang** `#!/bin/bash`, says which program should run it.

```run
cat > hello.sh <<'EOF'
#!/bin/bash
echo "Hello from a script"
echo "Today the lab folder has $(ls | wc -l) entries"
EOF
chmod +x hello.sh
./hello.sh | head -1
```

Two steps every time: make the file executable (`chmod +x`), then run it with a path (`./hello.sh`).

## Variables and arguments

No spaces around `=`. Use `$name` or `${name}` to read. Always **quote** variables: `"$name"`.

```run
cat > greet.sh <<'EOF'
#!/bin/bash
name="${1:-world}"
echo "Hello, $name"
echo "I was given $# argument(s)"
EOF
chmod +x greet.sh
./greet.sh
./greet.sh Rohan
./greet.sh "two words"
```

| Special | Meaning |
|---|---|
| `$1 $2 ...` | arguments |
| `$#` | number of arguments |
| `$@` | all arguments |
| `$?` | exit code of the last command (0 = success) |
| `$$` | this script's PID |

`${1:-world}` means "use the first argument, or `world` if it is empty".

## Conditions

```run
cat > check_file.sh <<'EOF'
#!/bin/bash
f="$1"
if [ -z "$f" ]; then
  echo "usage: $0 file"; exit 2
elif [ -d "$f" ]; then
  echo "$f is a directory"
elif [ -f "$f" ]; then
  echo "$f is a file with $(wc -l < "$f") lines"
else
  echo "$f does not exist"; exit 1
fi
EOF
chmod +x check_file.sh
./check_file.sh ev/logs/indexing.log
./check_file.sh ev
./check_file.sh nothing; echo "exit code: $?"
```

Common tests: `-f` file exists, `-d` folder, `-z` string empty, `-n` not empty, `-eq -ne -lt -gt` numbers, `==` `!=` strings, `-r -w -x` permissions.

## Loops

```run
for f in ev/logs/*.log; do
  errors=$(grep -c ERROR "$f")
  echo "$f: $errors errors"
done

n=3
while [ $n -gt 0 ]; do echo "countdown $n"; n=$((n-1)); done

for host in EV01 SQL01 FS01; do echo "would ping $host"; done
```

## Functions and case

```run
cat > svc.sh <<'EOF'
#!/bin/bash
say() { echo "[$(basename "$0")] $*"; }
case "$1" in
  start) say "starting EV services" ;;
  stop)  say "stopping EV services" ;;
  *)     say "usage: start|stop"; exit 1 ;;
esac
EOF
chmod +x svc.sh
./svc.sh start
./svc.sh stop
./svc.sh oops; echo "exit code: $?"
```

## Writing safe scripts

Scripts keep going after an error unless told otherwise, which can do damage (for example, `cd` fails and then `rm -rf *` runs in the wrong folder). A strong starting line:

```bash:safe-header.sh
#!/bin/bash
set -euo pipefail
```

- `-e` stop on the first failing command
- `-u` error on an unset variable
- `-o pipefail` a pipeline fails if any stage fails

```run
cat > unsafe.sh <<'EOF'
#!/bin/bash
set -euo pipefail
echo "step 1"
false
echo "step 2 (never printed)"
EOF
bash unsafe.sh; echo "exit code: $?"
```

A practical script: a mini health report for the pretend EV server.

```run
cat > report.sh <<'EOF'
#!/bin/bash
set -euo pipefail
log="${1:?usage: report.sh logfile}"
errors=$(grep -c ERROR "$log" || true)
warns=$(grep -c WARN "$log" || true)
echo "file: $(basename "$log")"
echo "errors: $errors  warnings: $warns"
if [ "$errors" -gt 0 ]; then
  echo "last error:"; grep ERROR "$log" | tail -1
  exit 1
fi
EOF
chmod +x report.sh
./report.sh ev/logs/indexing.log; echo "exit code: $?"
```

Exit code 1 is how a script tells another program (a scheduler, Jenkins, Ansible) that something failed. This simple idea underlies all automation.

<!-- deeper -->
## A worked solution

```run
cd ~/lab
cat > disk_check.sh <<'EOF'
#!/bin/bash
set -euo pipefail
dir="${1:?usage: disk_check.sh FOLDER LIMIT_KB}"
limit="${2:?usage: disk_check.sh FOLDER LIMIT_KB}"
used=$(du -sk "$dir" | cut -f1)
if [ "$used" -gt "$limit" ]; then
  echo "WARNING: $dir uses ${used} KB, above the limit of ${limit} KB" >&2
  exit 1
fi
echo "ok: $dir uses ${used} KB (limit ${limit} KB)"
EOF
chmod +x disk_check.sh
./disk_check.sh ev 100000; echo "exit code: $?"
./disk_check.sh ev 1; echo "exit code: $?"
./disk_check.sh 2>&1 | head -1; echo "exit code: ${PIPESTATUS[0]}"
```

The three runs show the three outcomes: under the limit (exit 0), over the limit (exit 1, message on **stderr**), and missing arguments (`${1:?...}` stops the script with a usage message).

:::warn Common mistakes
- **Unquoted variables** (`rm $dir/*` when `dir` has a space or is empty). Always `"$dir"`.
- **No `set -euo pipefail`,** so a failed step is ignored and later steps do damage.
- **Spaces around `=`** in assignments (`x = 5` is an error; write `x=5`).
- **`[ $a = $b ]` with an empty variable.** Quote: `[ "$a" = "$b" ]`.
- **Using `==` in plain `sh`;** `=` is portable, `==` is a bash extension.
- **Printing errors to standard output.** Send diagnostics to stderr (`>&2`) and use meaningful exit codes.
- **Parsing `ls` output.** Use globs (`for f in *.log`) or `find`.
:::
<!-- /deeper -->

:::recap
- A script is a file with a shebang and executable permission.
- `$1`, `$#`, `$?`, quoting, `${var:-default}`.
- `if`, `for`, `while`, `case`, functions.
- `set -euo pipefail` and meaningful exit codes make scripts safe and automatable.
:::

:::try Your turn
Write `disk_check.sh` that takes a folder, and exits 1 with a message if `du -s` of that folder exceeds a limit you pass as the second argument. Test it with `ev` and a tiny limit.
:::

:::quiz
? What does `$?` hold?
- The script's PID
+ The exit code of the last command
- The number of arguments
- The current user
! 0 means success, anything else means failure.
? What does `set -e` do?
- Prints each command
+ Stops the script at the first failing command
- Makes variables read-only
- Enables colours
! It prevents a script from carrying on after an error.
? Why quote `"$name"`?
+ So values with spaces or wildcards are treated as one value
- To make it faster
- Quotes are required for every word
- To make it uppercase
! Unquoted values are split on spaces, a common source of bugs.
:::
