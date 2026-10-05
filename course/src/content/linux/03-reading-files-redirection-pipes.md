---
track: linux
title: Reading files, redirection and pipes
short: Read and pipe
sub: See file contents, send output to files, and chain commands together.
---

:::goals
- read files of any size with `cat`, `less`, `head` and `tail`
- watch a log grow with `tail -f`
- send output to files with `>` and `>>`, and separate errors from output
- connect commands with pipes
:::

## Seeing what is inside a file

@setup evlab

```run
cat docs/readme.txt
cat ev/config/evault.conf
```

`cat` prints a whole file. For a big file that scrolls past too fast, use something smarter:

| Command | Use |
|---|---|
| `head -n 5 file` | the first 5 lines (default 10) |
| `tail -n 5 file` | the last 5 lines |
| `less file` | page through a file. Space = next page, `b` = back, `/word` = search, `q` = quit |
| `wc -l file` | count lines (`-w` words, `-c` bytes) |
| `nl file` | print with line numbers |

```run
head -n 3 ev/logs/indexing.log
tail -n 3 ev/logs/indexing.log
wc -l ev/logs/indexing.log ev/logs/storage.log
nl -ba ev/config/evault.conf | head -4
```

Logs are written at the *end* of a file, so `tail` is the engineer's most-used reading command.

### Watching a log live

`tail -f file` shows the last lines and then **keeps waiting**, printing new lines as they arrive. Stop it with `Ctrl+C`. Here is a controlled demonstration: a background job appends two lines to a log while `tail -f` watches (the `timeout` stops it after three seconds):

```run
touch live.log
(sleep 1; echo "09:30 INFO service ready" >> live.log; sleep 1; echo "09:31 ERROR disk full" >> live.log) &
timeout 3 tail -f live.log
wait
```

In real work: `tail -f /var/log/something.log` while you reproduce a problem is the fastest way to see what the system says at the moment it fails. `tail -F` also copes with logs that are rotated (replaced by a new file).

## Redirection: sending output somewhere else

Every command has three standard streams:

| Stream | Number | Default destination | Meaning |
|---|---|---|---|
| stdin | 0 | keyboard | input |
| stdout | 1 | screen | normal output |
| stderr | 2 | screen | error messages |

Redirection changes where they go:

| Syntax | Meaning |
|---|---|
| `cmd > file` | send stdout to a file, **overwriting** it |
| `cmd >> file` | **append** stdout to a file |
| `cmd 2> file` | send stderr to a file |
| `cmd > file 2>&1` | send both to the same file |
| `cmd < file` | read stdin from a file |
| `cmd > /dev/null` | throw output away |

```run
echo "first line" > notes.txt
echo "second line" >> notes.txt
cat notes.txt
echo "this overwrites" > notes.txt
cat notes.txt
```

Stdout and stderr are different streams, which is why errors still appear on screen when you redirect normal output:

```run
ls docs nosuchfolder > out.txt
echo "---- out.txt contains:"
cat out.txt
ls docs nosuchfolder > out.txt 2> err.txt
echo "---- err.txt contains:"
cat err.txt
ls nosuchfolder 2>/dev/null; echo "exit code: $?"
```

Notice `$?`: the **exit code** of the last command. `0` means success, anything else means failure. Scripts and pipelines rely on it.

:::warn Careful
`>` silently destroys the old contents of the target file. `sort data.txt > data.txt` empties your file before sort reads it. When unsure, write to a new file, or use `>>`.
:::

## Pipes: the idea that makes Linux powerful

A **pipe** `|` connects the output of one command to the input of the next. Each command does one small job, and you build bigger jobs by chaining them:

```run
cat ev/logs/indexing.log | grep ERROR
cat ev/logs/indexing.log | grep ERROR | wc -l
tail -n 4 ev/logs/indexing.log | head -n 2
ls ev/logs | wc -l
```

Read the second line left to right: *take the log, keep only the lines containing ERROR, count them.* You will use this pattern all the time (`grep` gets its own lesson next).

You can send the result of a pipeline to a file at the end, and `tee` lets you see the output and save it at the same time:

```run
grep ERROR ev/logs/indexing.log | tee errors.txt | wc -l
cat errors.txt
```

## A small editor, so you are never stuck

You will eventually need to edit a config file in the terminal. Two editors are everywhere:

- **nano**: easy. It lists its commands at the bottom (`^O` = write out/save with Ctrl+O, `^X` = exit).
- **vi / vim**: powerful and *always* installed, but confusing at first. The survival kit: press `i` to start typing, press `Esc` when finished, then type `:wq` and Enter to save and quit, or `:q!` and Enter to quit without saving.

```term
$ nano ev/config/evault.conf
(an editor opens; edit, then Ctrl+O, Enter, Ctrl+X)
$ vi ev/config/evault.conf
(press i to insert, Esc, then :wq to save and quit)
```

:::note Enterprise Vault connection
"Send me the last 200 lines of the log, with just the errors" becomes `tail -n 200 indexing.log | grep ERROR > errors.txt`. Three small tools, one pipe, one redirect.
:::

:::try Your turn
1. Show lines 5 to 8 of `ev/logs/indexing.log` using only `head` and `tail` and a pipe. (Hint: the first 8 lines, then the last 4 of those.)
2. Count how many lines in `storage.log` contain the word `WARN`.
3. Run a command that produces an error and write only the error to a file called `problems.txt`.
:::

:::recap
- `cat` (all), `head` (start), `tail` (end), `less` (page), `wc` (count). `tail -f` follows a live log.
- Redirection: `>` overwrite, `>>` append, `2>` errors, `/dev/null` bin. Exit code 0 means success.
- A pipe `|` feeds one command's output into the next. Small tools plus pipes beat big programs.
- Know one editor: `nano` for ease, `vi` for survival.
:::

:::quiz
? What does `echo hi >> log.txt` do?
- Overwrites log.txt with hi
+ Appends hi to the end of log.txt
- Sends hi to the screen only
! >> appends. > overwrites.
? Which command shows the last 20 lines of a file?
- head -n 20 file
+ tail -n 20 file
- cat file
! tail reads from the end of a file.
? What does the pipe in `cat app.log | grep ERROR | wc -l` do?
+ Passes each command's output to the next, so it counts the ERROR lines
- Saves output to a file called ERROR
- Runs the three commands at the same time on different files
! Each command feeds the next one.
? A command returns exit code 1. What does that usually mean?
- It succeeded
+ It failed
- It is still running
! Exit code 0 is success. Non-zero means a problem.
:::
