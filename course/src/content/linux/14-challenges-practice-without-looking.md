---
track: linux
title: Challenges, practice without looking
short: Challenges
sub: Eighteen small tasks with an automatic checker in the lab, from counting log lines to a short detective case. No spoilers unless you ask.
---

:::goals
- practise Linux commands on tasks you have not seen, in the lab, with instant feedback
- build speed with `grep`, `awk`, `sort`, `find`, `chmod`, loops and redirection
- use a checker to know when you are right, and a solution when you are stuck
:::

## How the challenges work

Each challenge below has three buttons:

- **Start in lab** opens the lab, creates a fresh folder `~/lab/ch` with the files for that challenge, and moves you into it.
- **Check my answer** tests your work. Some challenges ask for an **answer printed on screen**: the checker re-runs the **last command you typed** and compares its output. Others ask you to **change files or permissions**: the checker looks at the result.
- **Show a solution** reveals one possible answer. Try first for at least five minutes. There is usually more than one correct way.

The lab is a simulation of Linux in your browser (see [the lab guide](#linux-13)), so the challenges use commands it supports. Your progress is saved in this browser.

:::note The method
Read the task. Look at the files with `ls` and `head`. Build the command **one pipe at a time**, checking the output at each step. If a task says "print just the number", the checker wants exactly that and nothing else.
:::

## Warm-up: read and count

```challenge
title: Count the errors
task: The file `app.log` contains log lines. Print **only the number** of lines that contain the word `ERROR`.
setup: |
  cat > app.log <<'EOT'
  2026-03-01 10:00:01 INFO  service started
  2026-03-01 10:00:07 ERROR database timeout
  2026-03-01 10:01:12 WARN  slow response
  2026-03-01 10:02:30 ERROR disk almost full
  2026-03-01 10:03:44 INFO  request ok
  2026-03-01 10:04:02 ERROR database timeout
  2026-03-01 10:05:19 ERROR cache miss storm
  2026-03-01 10:06:51 INFO  request ok
  2026-03-01 10:07:00 ERROR database timeout
  EOT
expect: 5
solution: grep -c ERROR app.log
```

```challenge
title: The three biggest files
task: Print the names of the **three largest** files in this folder, largest first, one per line.
setup: |
  seq 1 10 > small.txt
  seq 1 500 > big.txt
  seq 1 100 > medium.txt
  seq 1 2000 > huge.txt
  seq 1 3 > tiny.txt
expect: |
  huge.txt
  big.txt
  medium.txt
solution: ls -S | head -3
```

```challenge
title: Find the config files
task: Somewhere under `etc/` there are files ending in `.conf`. Print their paths, sorted alphabetically, one per line.
setup: |
  mkdir -p etc/nginx etc/app/conf.d etc/cron
  echo a > etc/nginx/nginx.conf
  echo b > etc/app/app.conf
  echo c > etc/app/conf.d/db.conf
  echo d > etc/cron/jobs.txt
  echo e > etc/readme.md
expect: |
  etc/app/app.conf
  etc/app/conf.d/db.conf
  etc/nginx/nginx.conf
solution: find etc -name '*.conf' | sort
```

## Text tools: grep, awk, sort, uniq

```challenge
title: Distinct visitors
task: `access.log` has one request per line and starts with the visitor's IP address. Print **how many different IP addresses** appear.
setup: |
  cat > access.log <<'EOT'
  10.0.0.7 - - [01/Mar] "GET /index.html" 200
  10.0.0.9 - - [01/Mar] "GET /about.html" 200
  10.0.0.7 - - [01/Mar] "GET /login" 302
  10.0.0.3 - - [01/Mar] "GET /index.html" 200
  10.0.0.7 - - [01/Mar] "POST /login" 200
  10.0.0.9 - - [01/Mar] "GET /index.html" 304
  10.0.0.7 - - [01/Mar] "GET /cart" 200
  10.0.0.5 - - [01/Mar] "GET /index.html" 200
  EOT
expect: 4
solution: awk '{print $1}' access.log | sort -u | wc -l
```

```challenge
title: The busiest visitor
task: Using the same `access.log`, print **only the IP address** that made the most requests.
setup: |
  cat > access.log <<'EOT'
  10.0.0.7 - - [01/Mar] "GET /index.html" 200
  10.0.0.9 - - [01/Mar] "GET /about.html" 200
  10.0.0.7 - - [01/Mar] "GET /login" 302
  10.0.0.3 - - [01/Mar] "GET /index.html" 200
  10.0.0.7 - - [01/Mar] "POST /login" 200
  10.0.0.9 - - [01/Mar] "GET /index.html" 304
  10.0.0.7 - - [01/Mar] "GET /cart" 200
  10.0.0.5 - - [01/Mar] "GET /index.html" 200
  EOT
expect: 10.0.0.7
solution: awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -1 | awk '{print $2}'
```

```challenge
title: Big orders only
task: `orders.csv` has the columns `id,customer,amount`. Print the **customer names** (one per line) of orders with an `amount` **greater than 100**, skipping the header line.
setup: |
  cat > orders.csv <<'EOT'
  id,customer,amount
  1,asha,45
  2,ravi,250
  3,meera,100
  4,john,180
  5,priya,99
  6,sam,101
  EOT
expect: |
  ravi
  john
  sam
solution: awk -F, 'NR>1 && $3>100 {print $2}' orders.csv
```

```challenge
title: Total of a column
task: Print the **sum** of the `amount` column of `orders.csv`, as a single number.
setup: |
  cat > orders.csv <<'EOT'
  id,customer,amount
  1,asha,45
  2,ravi,250
  3,meera,100
  4,john,180
  5,priya,99
  6,sam,101
  EOT
expect: 775
solution: awk -F, 'NR>1 {s+=$3} END {print s}' orders.csv
```

```challenge
title: Words in the notes
task: Print the **total number of words** in all the `.md` files of this folder together.
setup: |
  echo "one two three" > a.md
  echo "four five" > b.md
  printf 'six\nseven eight nine\n' > c.md
  echo "ignored words here" > d.txt
expect: 9
solution: cat *.md | wc -w
```

## Change files: sed, permissions, directories

```challenge
title: Point the config at the new server
task: In `config.ini`, replace every `localhost` with `db01`, **changing the file itself** (not just printing). Leave the other lines as they are.
setup: |
  cat > config.ini <<'EOT'
  [database]
  host = localhost
  port = 5432
  backup_host = localhost
  EOT
check: |
  ! grep -q localhost config.ini && [ "$(grep -c db01 config.ini)" = "2" ] && [ "$(wc -l < config.ini)" = "4" ] && grep -q "port = 5432" config.ini
solution: sed -i 's/localhost/db01/g' config.ini
```

```challenge
title: Make the script runnable
task: `deploy.sh` is a script nobody can run. Make it **executable for everyone**, but writable only by its owner (permissions `755`).
setup: |
  printf '#!/bin/bash\necho deploying\n' > deploy.sh
  chmod 644 deploy.sh
check: |
  [ "$(stat -c %a deploy.sh)" = "755" ]
solution: chmod 755 deploy.sh
```

```challenge
title: Lock down the key
task: `secret.key` must be readable and writable **only by its owner** and by nobody else (permissions `600`).
setup: |
  echo "s3cr3t" > secret.key
  chmod 644 secret.key
check: |
  [ "$(stat -c %a secret.key)" = "600" ]
solution: chmod 600 secret.key
```

```challenge
title: Build a project skeleton
task: Create the folders `project/src`, `project/tests` and `project/docs`, and put an **empty file named `README.md`** in each of the three.
check: |
  [ -f project/src/README.md ] && [ -f project/tests/README.md ] && [ -f project/docs/README.md ]
solution: |
  mkdir -p project/src project/tests project/docs
  touch project/src/README.md project/tests/README.md project/docs/README.md
```

```challenge
title: Back up the text files
task: Create a folder `backup` and copy **only the `.txt` files** into it. Do not copy the `.log` file.
setup: |
  echo 1 > notes.txt
  echo 2 > todo.txt
  echo 3 > server.log
check: |
  [ -f backup/notes.txt ] && [ -f backup/todo.txt ] && [ ! -e backup/server.log ]
solution: |
  mkdir backup
  cp *.txt backup/
```

## Scripting: loops, arguments

```challenge
title: Squares with a loop
task: Write a file `squares.txt` containing five lines, `1 squared is 1`, `2 squared is 4`, up to `5 squared is 25`, using a **loop** (not by typing the lines by hand).
check: |
  [ "$(cat squares.txt)" = "$(printf '1 squared is 1\n2 squared is 4\n3 squared is 9\n4 squared is 16\n5 squared is 25')" ]
solution: |
  for n in 1 2 3 4 5; do echo "$n squared is $((n*n))" >> squares.txt; done
```

```challenge
title: A script that counts its arguments
task: Create an executable script `count.sh` that prints `N arguments`, where N is the number of arguments it was given. For example `./count.sh a b c` prints `3 arguments`.
check: |
  [ -x count.sh ] && [ "$(./count.sh a b c)" = "3 arguments" ] && [ "$(./count.sh)" = "0 arguments" ]
solution: |
  printf '#!/bin/bash\necho "$# arguments"\n' > count.sh
  chmod +x count.sh
```

## The case of the missing payroll file

Three connected questions. The file `auth.log` records who did what on a server. Someone deleted `payroll.xlsx` last night. Work through the clues in order, the same way you would on a real incident ([troubleshooting lesson](#linux-11)).

```challenge
title: Who deleted it?
task: Find the line in `auth.log` where `payroll.xlsx` was removed with `rm`, and print **only the username** of the person who ran it (the fifth word on that line).
setup: |
  cat > auth.log <<'EOT'
  Mar 02 01:58:12 srv1 sshd[411]: Accepted publickey for dana from 203.0.113.9 port 51022
  Mar 02 02:03:40 srv1 sudo: dana : TTY=pts/0 ; COMMAND=/usr/bin/ls /srv/hr
  Mar 02 02:14:09 srv1 sudo: dana : TTY=pts/0 ; COMMAND=/usr/bin/rm /srv/hr/payroll.xlsx
  Mar 02 02:15:30 srv1 sshd[411]: Received disconnect from 203.0.113.9
  Mar 02 09:01:11 srv1 sshd[502]: Accepted publickey for lee from 198.51.100.4 port 40110
  Mar 02 09:05:02 srv1 sudo: lee : TTY=pts/1 ; COMMAND=/usr/bin/cat /srv/hr/handbook.txt
  EOT
expect: dana
solution: grep 'rm .*payroll' auth.log | awk '{print $6}'
```

```challenge
title: At what time?
task: Print **only the time** (like `HH:MM:SS`) at which the deletion happened.
setup: |
  cat > auth.log <<'EOT'
  Mar 02 01:58:12 srv1 sshd[411]: Accepted publickey for dana from 203.0.113.9 port 51022
  Mar 02 02:03:40 srv1 sudo: dana : TTY=pts/0 ; COMMAND=/usr/bin/ls /srv/hr
  Mar 02 02:14:09 srv1 sudo: dana : TTY=pts/0 ; COMMAND=/usr/bin/rm /srv/hr/payroll.xlsx
  Mar 02 02:15:30 srv1 sshd[411]: Received disconnect from 203.0.113.9
  Mar 02 09:01:11 srv1 sshd[502]: Accepted publickey for lee from 198.51.100.4 port 40110
  Mar 02 09:05:02 srv1 sudo: lee : TTY=pts/1 ; COMMAND=/usr/bin/cat /srv/hr/handbook.txt
  EOT
expect: 02:14:09
solution: grep payroll auth.log | awk '{print $3}'
```

```challenge
title: From where did they log in?
task: Print **only the IP address** from which that user logged in (the line says `Accepted publickey for <user> from <ip>`).
setup: |
  cat > auth.log <<'EOT'
  Mar 02 01:58:12 srv1 sshd[411]: Accepted publickey for dana from 203.0.113.9 port 51022
  Mar 02 02:03:40 srv1 sudo: dana : TTY=pts/0 ; COMMAND=/usr/bin/ls /srv/hr
  Mar 02 02:14:09 srv1 sudo: dana : TTY=pts/0 ; COMMAND=/usr/bin/rm /srv/hr/payroll.xlsx
  Mar 02 02:15:30 srv1 sshd[411]: Received disconnect from 203.0.113.9
  Mar 02 09:01:11 srv1 sshd[502]: Accepted publickey for lee from 198.51.100.4 port 40110
  Mar 02 09:05:02 srv1 sudo: lee : TTY=pts/1 ; COMMAND=/usr/bin/cat /srv/hr/handbook.txt
  EOT
expect: 203.0.113.9
solution: grep 'Accepted publickey for dana' auth.log | awk '{print $11}'
```

:::note What would you do next in a real incident?
You found who, when and from where. In real life you would not accuse anyone from one log line: you would preserve the logs, check whether the account was shared or compromised, check backups for the file, and report the facts. Logs show **what the account did**, not always **who was at the keyboard**.
:::

:::recap
- A good command is built **one pipe at a time**, checking output at each step.
- `grep -c` counts, `awk` picks columns and does arithmetic, `sort | uniq -c | sort -rn` ranks, `sed -i` edits in place, `chmod` sets permissions, `find` walks folders.
- For incidents, narrow the logs **by user, then time, then source**.
:::

```quiz
? You need the number of different values in a column of a log. Which pipeline shape is right?
+ awk '{print $1}' file | sort -u | wc -l
- awk '{print $1}' file | wc -l
- sort file | head -1
- cat file | uniq
! Extract the column, remove duplicates with sort -u, then count the lines.

? Which command changes a file in place by replacing text?
+ sed -i 's/old/new/g' file
- sed 's/old/new/g' file
- grep old file
- awk '{print}' file
! Without -i, sed only prints the result and leaves the file unchanged.

? What do permissions 600 mean?
+ Owner can read and write; nobody else can do anything
- Everyone can read and write
- Owner can run it
- Only root can read it
! 6 = read plus write for the owner, and 0 for group and others.
```
