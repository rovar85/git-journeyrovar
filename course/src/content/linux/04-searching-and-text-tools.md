---
track: linux
title: Searching and processing text
short: Text tools
sub: grep, sort, uniq, cut, awk, sed and find: turn raw logs into answers.
---

:::goals
- find lines with `grep`, including patterns, context and counts
- summarise data with `sort`, `uniq`, `cut` and `awk`
- change text with `sed` and `tr`
- build a real log-analysis pipeline for Enterprise Vault logs
:::

## Why text tools matter

Almost everything on Linux is plain text: logs, configuration, command output. So a toolbox of small text programs, chained with pipes (last lesson), solves a surprising range of problems. Our sample log has this shape (date, time, level, message):

@setup evlab

```run
head -n 4 ev/logs/indexing.log
```

## grep: find lines

`grep pattern file` prints lines that contain the pattern.

```run
grep ERROR ev/logs/indexing.log
grep -c ERROR ev/logs/indexing.log
grep -n "SQL01" ev/logs/indexing.log
grep -i "warn" ev/logs/indexing.log
grep -v INFO ev/logs/indexing.log
```

| Option | Meaning |
|---|---|
| `-i` | ignore case |
| `-n` | show line numbers |
| `-c` | count matching lines |
| `-v` | invert: show lines that do **not** match |
| `-r` | search folders recursively |
| `-w` | match whole words only |
| `-E` | extended patterns (`a\|b`, `+`, `?`) |
| `-A n` / `-B n` | also show n lines After / Before each match |

```run
grep -A1 "connection timeout" ev/logs/indexing.log
grep -E "WARN|ERROR" ev/logs/storage.log
grep -r "SQL01" ev/
grep -l "disk full" ev/logs/*
```

`-A`/`-B` (context) are gold when diagnosing: the line *after* an error often says what the system did next. `-l` lists only the names of files that contain a match.

## sort, uniq and counting

`sort` orders lines, and `uniq -c` counts **adjacent** repeated lines, which is why you sort first. The classic pattern `sort | uniq -c | sort -rn` means "count how often each distinct line occurs, most frequent first".

```run
cut -d' ' -f3 ev/logs/indexing.log | sort | uniq -c | sort -rn
```

Here `cut -d' ' -f3` takes the third space-separated column (the level). Counting what happens most often is the first step in understanding any log.

`sort` options: `-n` numeric, `-r` reverse, `-k2` sort by the 2nd column, `-u` unique.

## cut and awk: pick columns

`cut` is simple. `awk` is a tiny programming language for columns. It splits each line into fields `$1`, `$2`, ... (`$0` is the whole line):

```run
awk '{print $3, $4}' ev/logs/storage.log
awk '$3 == "ERROR" {print $2, $5}' ev/logs/indexing.log
awk '{count[$3]++} END {for (l in count) print l, count[l]}' ev/logs/indexing.log | sort
awk '/Indexed/ {sum += $5} END {print "items indexed:", sum}' ev/logs/indexing.log
```

Read the third example: for every line add one to a counter keyed by the level, and at the end print the counters. The fourth adds up the numbers on lines mentioning "Indexed". `awk` is worth learning slowly, because it replaces many small scripts.

## sed and tr: change text

`sed` edits text as it flows past. The most useful form is substitution, `s/old/new/`:

```run
sed 's/SQL01/SQL-PRIMARY/' ev/config/evault.conf
sed -n '2,4p' ev/config/evault.conf
sed '/^#/d' ev/config/evault.conf
echo "ev01 is up" | tr 'a-z' 'A-Z'
```

- `sed 's/old/new/'` replaces the first match on each line (`s/old/new/g` replaces all).
- `sed -n '2,4p'` prints only lines 2 to 4.
- `sed '/^#/d'` **d**eletes lines that start with `#` (comments).
- `tr` translates characters.

By default `sed` prints the result and leaves the file alone. `sed -i` edits the file in place. Take a backup first (`sed -i.bak ...`).

## find: search by properties

`grep` searches *inside* files. `find` searches for the *files themselves*, by name, type, size or age, and can act on them:

```run
find ev -name "*.log"
find ev -type f -size -300c
find ev -name "*.log" -exec wc -l {} \;
find ev -type f -newermt "2026-01-01" | sort
```

`-exec command {} \;` runs the command on each match (`{}` stands for the file). A tidier alternative for many files is `xargs`, which turns lines into arguments:

```run
find ev -name "*.log" | sort | xargs grep -c ERROR
```

## A real analysis: what went wrong, and when?

Put the tools together to answer questions about the Enterprise Vault logs.

**Q1. What are the distinct error messages, and how often does each occur?**

```run
grep ERROR ev/logs/indexing.log | cut -d' ' -f4- | sort | uniq -c | sort -rn
```

**Q2. At which hours did errors occur?** (`cut -c12-13` takes characters 12 to 13 of each line, the hour.)

```run
grep ERROR ev/logs/*.log | cut -d: -f2,3 | cut -c12-13 | sort | uniq -c
```

**Q3. Which problems repeat across services?**

```run
grep -h ERROR ev/logs/*.log | awk '{print $5, $6}' | sort | uniq -c | sort -rn
```

Within a minute you can tell the story: SQL connection timeouts first, then a name-resolution failure, and a full storage volume at another time. These are the same three causes the AI agent in the earlier chapters investigated.

:::note Enterprise Vault connection
The diagnostic agent you designed gathers evidence with read-only tools such as `get_event_logs`. On a Linux-hosted component, that tool *is* this pipeline: `grep`, `cut`, `sort`, `uniq`. Knowing the commands means you can check the agent's evidence yourself.
:::

:::try Your turn
1. Count how many lines in `indexing.log` do **not** contain `INFO`.
2. Print only the times (second column) of the `Indexing service started` events.
3. Replace `max_index_threads = 4` with `max_index_threads = 8` in a *copy* of the config using `sed`, and show the result.
4. Find the five longest lines in a file: `awk '{print length, $0}' file | sort -rn | head -5`.
:::

:::recap
- `grep` finds lines (`-i -n -c -v -r -E -A -B -l`). `find` finds files.
- `sort | uniq -c | sort -rn` counts and ranks. `cut` and `awk` select columns. `sed` and `tr` change text.
- Chain small tools with pipes to answer questions about logs.
:::

:::quiz
? Which command counts how many lines contain ERROR?
- grep ERROR file | sort
+ grep -c ERROR file
- find ERROR file
! -c prints the number of matching lines.
? Why do you usually run `sort` before `uniq -c`?
+ uniq only collapses adjacent duplicates, so the lines must be grouped first
- sort makes uniq faster
- uniq cannot read files
! Without sorting, identical lines that are not next to each other are counted separately.
? What does `sed 's/foo/bar/g'` do?
- Deletes foo
+ Replaces every foo with bar on each line, printing the result
- Edits the file in place
! Without -i, sed only prints the changed text.
? You want files modified recently, not lines of text. Which tool?
- grep
+ find
- awk
! find searches by file properties such as name, size and time.
:::
