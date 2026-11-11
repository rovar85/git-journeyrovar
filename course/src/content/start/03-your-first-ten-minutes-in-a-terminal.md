---
track: start
title: "Your first ten minutes in a terminal"
short: First commands
sub: What a terminal is and why engineers use it, then ten commands you run yourself in the practice lab, including making a mistake on purpose and reading the error.
---

:::goals
- say what a terminal and a command are
- run commands to see where you are, look around, and create, read, copy and delete a file
- read an error message calmly and fix the cause
- use the practice lab in this course
:::

## Why type when you could click?

On your phone you tap pictures. That works for a person, but a server has no screen, and an engineer may look after hundreds of servers at once. Typed **commands** have three advantages:

- they work on a machine with no screen, over the network;
- they are exact, so you can write them down and repeat them;
- several commands saved in a file become a **script** that runs by itself. That is the beginning of automation.

The window where you type is the **terminal**. The program inside it that reads what you type and runs it is the **shell**. A command is one line you type, followed by the Enter key.

## How to run the commands in this lesson

Every dark box below is a real recording: the lines starting with `$` were typed, and the lines under them are what the computer answered.

Press the green **Run in lab** button on a box to run the same commands yourself in the practice terminal built into this page. Nothing you do there can damage your phone or computer. Type your own commands there too: breaking things is how you learn.

## 1. Who and where am I?

```run
whoami
pwd
```

- `whoami` prints your user name. Every person (and program) on a computer has one.
- `pwd` means "print working directory". It shows the **folder you are standing in**. A terminal always has a current folder, like a file manager that is open on one folder.

## 2. Make a folder and step into it

```run
mkdir -p ~/lab/first
cd ~/lab/first
pwd
```

- `mkdir` makes a directory (folder). `~` is a short name for your home folder.
- `cd` means "change directory": you walk into the folder. Notice that `pwd` now prints a different path.
- When a command succeeds it often prints **nothing**. In a terminal, silence means "done".

## 3. Create a file and read it

```run
echo "My first file" > note.txt
ls
cat note.txt
```

- `echo` repeats the text you give it. The `>` sends that text **into a file** instead of onto the screen.
- `ls` lists what is in the current folder. There is your file.
- `cat` prints a file's contents.

## 4. Copy, look closer, delete

```run
cp note.txt copy.txt
ls -l
rm copy.txt
ls
```

- `cp` copies a file: first the original, then the new name.
- `ls -l` is the same `ls` with an **option**. Options start with a dash and change how a command behaves; `-l` means "long", one line per file with its size and date.
- `rm` removes a file. **There is no recycle bin in a terminal.** Read an `rm` command twice before pressing Enter.

## 5. Make a mistake on purpose

```run
cat nots.txt; echo "exit code: $?"
```

The file name is misspelt, so the computer says so: `No such file or directory`. An error message is not the computer shouting at you. It is the most useful line on the screen, because it says **what** failed and usually **why**.

How to read any error:

1. Read it slowly, all of it.
2. Find the name of the thing it mentions (`nots.txt`).
3. Check that thing first: the spelling, whether it exists (`ls`), whether you are in the right folder (`pwd`).

The part after the semicolon prints the **exit code** (a semicolon lets you put two commands on one line): every command reports a number when it finishes. `0` means success; anything else means it failed. Scripts use that number to decide what to do next.

## The shape of every command

```term
command   -options   what-to-act-on
ls        -l         /home
```

A command name, then optional options, then what to work on. Almost everything you will type in this course has this shape.

| Command | Say it as | Does |
|---|---|---|
| `whoami` | who am I | prints your user name |
| `pwd` | print working directory | shows the current folder |
| `ls` | list | shows what is in a folder |
| `cd` | change directory | moves to another folder |
| `mkdir` | make directory | creates a folder |
| `echo` | echo | prints text (or, with `>`, writes it to a file) |
| `cat` | cat | prints a file |
| `cp` | copy | copies a file |
| `rm` | remove | deletes a file, permanently |

:::try
In the lab: make a folder called `practice` inside `~/lab`, go into it, create a file `me.txt` containing your name, print it, copy it to `me2.txt`, list the folder, then delete the copy. If something goes wrong, read the error and use `pwd` and `ls` to find out where you are and what exists.
:::

:::note What comes next
You have just done the first lesson of every engineer's career. The [Linux track](#linux-1) continues from exactly here: files, text, permissions, programs and scripts.
:::

:::recap
- A **terminal** is where you type **commands**; the **shell** runs them.
- `pwd`, `ls`, `cd` answer "where am I, what is here, go there".
- `mkdir`, `echo >`, `cat`, `cp`, `rm` create, read, copy and delete.
- **No output usually means success.** An **error message** tells you what to check.
- `rm` is permanent.
:::

```quiz
? Which command shows the folder you are currently in?
+ pwd
- ls
- cd
- cat
! pwd prints the working directory.

? You run a command and it prints nothing. What does that usually mean?
+ It worked
- It failed
- The terminal is broken
- You must run it again
! Most commands are silent on success.

? The terminal says "No such file or directory". What should you check first?
+ The spelling of the name, and whether you are in the right folder
- Whether the computer needs restarting
- Whether the internet is working
- Nothing; try the same command again
! Use ls to see what exists and pwd to see where you are.

? What is different about deleting a file with rm compared with deleting on a phone?
+ There is no recycle bin: the file is gone at once
- It is slower
- It only works on photos
- It asks three times
! Read rm commands twice before pressing Enter.
```
