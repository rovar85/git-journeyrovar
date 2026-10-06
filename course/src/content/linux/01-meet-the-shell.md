---
track: linux
title: Meet the shell
short: The shell
sub: What Linux is, how to get a Linux prompt, and your first commands.
---

:::goals
- explain what Linux, a distribution, a terminal and a shell are
- get a Linux prompt on your own computer
- run your first commands and read their output
- find help when you are stuck
:::

## What is Linux, really?

Almost every server in a data centre, every cloud virtual machine and every container runs {{Linux|An operating system kernel first released in 1991, now the foundation of most servers, Android phones and cloud platforms.}}. Even if your Enterprise Vault servers run Windows, the tools around them (containers, pipelines, automation, monitoring) mostly run on Linux. Learning it is the best single investment you can make as an infrastructure engineer.

Four words get mixed up, so let us separate them:

| Word | What it is | Everyday comparison |
|---|---|---|
| Kernel | the core of the operating system: it talks to the hardware and decides which program gets the processor, memory and disk | the engine |
| Distribution ("distro") | a kernel plus a collection of programs, packaged and supported by someone (Ubuntu, Debian, Red Hat, Alpine) | a complete car model built around an engine |
| Terminal | the window where you type commands | the dashboard |
| Shell | the program inside the terminal that reads your commands and runs them (usually **bash**) | the driver who understands your instructions |

In this course the examples run on **Ubuntu**, a very common distribution. The commands work almost identically on Debian, Red Hat and others.

## Getting a Linux prompt

You are on Windows, so the easiest route is **WSL** (Windows Subsystem for Linux), which runs real Ubuntu inside Windows. In PowerShell, run as administrator:

```term
$ wsl --install
```

Restart when asked, then open "Ubuntu" from the Start menu and create a username and password. You now have a Linux terminal. Alternatives: a virtual machine (VirtualBox or Hyper-V) running Ubuntu, a free cloud virtual machine, or a spare computer. A phone is fine for *reading* these lessons, but typing commands is best on a laptop.

:::note Tip
Everything in the terminal boxes below is a command you can type yourself. Boxes marked **Real output** show exactly what happened when I ran the commands on a Linux machine while building this page. Your output will be the same or very close.
:::

## Reading a prompt

When the terminal is ready for a command it shows a **prompt**, something like `student@lab:~$`. It tells you who you are (`student`), which machine (`lab`), where you are (`~` means your home directory) and that you are an ordinary user (`$`, while `#` means the all-powerful administrator, `root`). In the examples below, a line starting with `$` is what you type. Do not type the `$` itself.

## Your first commands

The commands below run in a small pretend Enterprise Vault server folder, so there is something to look at.

@setup evlab

```run
whoami
pwd
echo "Hello from Linux"
uname -s
```

What each one did:

- `whoami` prints your username.
- `pwd` ("print working directory") prints **where you are** in the file system. Everything in Linux is a file in one big tree that starts at `/`. Here you are in `/home/student/lab`.
- `echo` prints whatever you give it.
- `uname -s` prints the name of the kernel. It says Linux.

Which distribution is this?

```run
cat /etc/os-release | head -3
```

## The shape of every command

Nearly every Linux command follows one pattern:

```
command  -options  arguments
   ls      -l       docs
```

- The **command** is the program to run.
- **Options** (also called flags) change how it behaves. A single dash and a letter (`-l`), or two dashes and a word (`--help`).
- **Arguments** say what to act on: a file, a folder, some text.

Try the same command with and without an option:

```run
ls
ls -l --time-style=long-iso
```

Short options can be combined: `ls -la` means `ls -l -a`. Options are case-sensitive: `-r` and `-R` are different. And Linux file names are case-sensitive too, so `Notes.txt` and `notes.txt` are different files.

## Getting help

Nobody memorises every option. Skilled engineers look things up constantly. Three ways:

```run
ls --help | head -8
help cd | head -3
type cd
```

- `command --help` prints a short summary (pipe it into `head` as above to see only the top).
- `man command` opens the full **manual page**. Press `q` to leave, `/word` to search, and the space bar to page down. (Very minimal systems, such as small container images, leave the manuals out, which is why this page uses `--help` and `help` in its examples.)
- `help cd` explains a shell builtin (a command built into bash itself). `type cd` tells you what kind of thing a command is: `cd` is a builtin, not a separate program.

## Four tricks that save hours

1. **Tab completion.** Type the first letters of a command or file name and press `Tab`. The shell finishes it or shows the choices. It is faster and avoids typos.
2. **Up arrow.** Recall the previous command. `history` lists earlier ones, and `Ctrl+R` searches them.
3. **Ctrl+C** stops a running command. **Ctrl+L** (or `clear`) clears the screen.
4. **Copy and paste.** In most terminals, paste is `Ctrl+Shift+V` (or right-click).

:::warn Careful
The shell does exactly what you say, immediately, with no "are you sure". Commands such as `rm` (delete) have no recycle bin. Develop the habit now: read a command through before pressing Enter, and practise in a throwaway folder.
:::

:::note Enterprise Vault connection
When an Enterprise Vault server misbehaves, people often ask you to "send me the log file" or "check the service". If those servers or their monitoring run on Linux, every one of those requests is a few of the commands you are about to learn.
:::

:::try Your turn
1. Open a terminal and run `whoami` and `pwd`. What is your home directory?
2. Run `ls -la ~` (the `~` means your home). Which files start with a dot? (Files that start with a dot are hidden.)
3. Run `man ls` and find the option that sorts by size. Press `q` to leave.
:::

<!-- deeper -->
## Worked answers

Check yourself against real output. Task 1 and 2 (we make a hidden file ourselves so the result is predictable):

```run
cd ~/lab
echo "my home directory is: $HOME"
touch .hidden-example
echo "--- ls (hidden files not shown):"; ls
echo "--- ls -a (the dot files appear):"; ls -a | grep '^\.' | grep -v '^\.\.\?$'
```

Task 3: `man` is not installed in this lab, but the same information is in `--help`. Find the "sort by size" option:

```run
ls --help | grep -i "sort by" | head -3
```

`-S` sorts by file size, largest first. Try `ls -lS` and add `-r` to reverse it.

:::warn Common mistakes
- **Typing the `$` from the examples.** It is part of the prompt, not the command.
- **Forgetting that Linux is case-sensitive.** `Notes.txt` and `notes.txt` are different files, and `LS` is not a command.
- **Copy-pasting commands you do not understand** into a server. Read each one first; use the command guide boxes and `--help`.
- **Looking for an "Undo".** The shell has no recycle bin. Practise in a throwaway folder.
:::
<!-- /deeper -->

:::recap
- Linux is a kernel. A distribution packages it. The shell reads your commands in a terminal.
- On Windows, WSL gives you a real Linux prompt.
- Commands look like `command -options arguments`. `pwd`, `ls`, `whoami` and `echo` are your first four.
- Use `--help`, `man`, Tab and the up arrow constantly.
:::

:::quiz
? What is the shell?
- The Linux kernel
+ The program in the terminal that reads and runs your commands
- A type of file
! The shell (usually bash) interprets what you type. The kernel is a separate, deeper layer.
? In the prompt `student@lab:~$`, what does the `$` tell you?
- You are in the root directory
+ You are an ordinary user (a # would mean the administrator)
- The command succeeded
! $ is for normal users and # is for root.
? Which command shows where you are in the file system?
- whoami
- echo
+ pwd
! pwd prints the working directory. whoami prints your username.
? You type `ls -la`. What are -l and -a?
+ Options that change how ls behaves (long listing, show hidden files)
- Two file names
- Typos
! Options modify a command. Arguments are what it acts on.
:::
