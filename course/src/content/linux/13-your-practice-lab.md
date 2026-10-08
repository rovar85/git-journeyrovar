---
track: linux
title: Your practice lab, in the browser
short: Practice lab
sub: A Linux-like shell inside this page, with every lesson's practice files, so you can run the commands where you read them. What it can and cannot do.
---

:::goals
- open the lab and run any lesson's commands without leaving the page
- know exactly which lessons the lab covers and which need a real machine
- know the free options for a real Linux, Docker or Kubernetes machine when you need one
:::

## Using it

Click **Lab** in the top bar (or press `Ctrl` + `` ` ``). A terminal slides up from the bottom. Above every terminal block in the lessons there is a green **Run in lab** button: it prepares that lesson's practice files, types the commands for you and shows what they print, so you never lose your place.

You can also type your own commands. Up and Down arrows recall history, `Tab` completes names, `Ctrl+C` stops a running command, `Ctrl+L` clears the screen. Type `labhelp` for a short reminder. Your files are saved in this browser between visits. `reset` (or the Reset button) puts everything back to the start.

:::note Run the blocks in order
Lessons build on each other inside one lesson: a block may use a file an earlier block created. If you get stuck, press Reset, then run the blocks from the top.
:::

## What the lab really is

It is **not** a real computer. It is a small Linux-like world written in JavaScript that runs in your browser tab: a file system with owners and permission bits, a bash-style shell (pipes, redirects, loops, functions, here-documents, variables), and about 110 commands (`ls`, `cat`, `grep`, `sed`, `awk`, `find`, `chmod`, `tar`, `sort`, `ps`, `kill` and so on). Nothing is installed on your machine and nothing leaves your browser.

Because it is a re-creation, small differences exist. I checked it against the real recorded output of this course: of the 414 recorded Linux outputs, 354 match character for character. The rest are things the lab cannot do (below) and cosmetic differences: `find` lists files in alphabetical order (a real disk lists them in its own order), your user number is 1000 instead of the one on the machine that recorded the lessons, and process numbers differ.

:::warn A simulation can mislead you in small ways
If something you know about real Linux behaves differently here, trust real Linux. Use the lab to build muscle memory for the commands and the thinking, then repeat the important ones on a real machine (see the end of this lesson).
:::

## Python in the lab

`python3` works too, using a real Python interpreter compiled to WebAssembly (Pyodide). It downloads about 10 MB the first time you press **Load Python** (or the first time a command needs it), then it stays in your browser cache. Scripts you write with `cat > file.py` are run from the lab's file system, and files Python writes appear in the lab.

It handles the standard library, including `json`, `random`, `math`, `re`, `unittest` and `collections`. It cannot run threads, network code, `subprocess`, or heavy packages such as PyTorch. Blocks that need those are marked **Needs a real machine**.

## What each track gets

The button on each block is green only when every command in the block is something the lab supports. This is the share of terminal blocks that run in the lab, counted when this page was built:

| Track | Blocks that run in the lab | Why the others do not |
| --- | --- | --- |
| Linux | 78% | systemd, apt, mounting disks, namespaces, SSH, network tools |
| AI deep dive, lectures, AI field guide | 96% to 100% | none that matter: they are Python scripts |
| Cloud, Cloud senior engineer | 89% and 62% | a few use threads, SSH or Docker |
| AI infrastructure | 55% | servers, Docker, Kubernetes, MLflow |
| Monitoring | 42% | Prometheus is a server, not a script |
| Interview scenarios | 27% | many use real services and network tools |
| Networking | 14% | needs a real network stack (`ip`, `ss`, `nc`, `ping`) |
| Git, Jenkins, Terraform, Capstone | 5% to 9% | need the real tools |
| Docker, Kubernetes, Ansible, Windows | 0% to 2% | need Docker, a cluster, SSH targets or PowerShell |

Be honest with yourself about this: for Docker, Kubernetes, Terraform, Ansible, Jenkins and Windows, the commands only mean something against the real tool, and a browser tab cannot run a container runtime, a Kubernetes cluster or a Windows machine. The lab does not pretend. Those blocks say **Needs a real machine**, and the lessons still show the output recorded from real runs.

## Why some things cannot work in a browser

- **No kernel.** Namespaces, cgroups, mounting a disk, `iptables`, and `systemctl` are features of the Linux kernel and of systemd. JavaScript cannot create them.
- **No network.** A page cannot open raw sockets, so there is no `ping`, `ss` or `curl` to a machine of your choice, and no servers to start.
- **Time is faster.** `sleep 10` takes about a second so you are not left waiting. Background jobs (`&`) are simulated: the lab keeps a process table, and `kill`, `jobs`, `wait` and `trap` behave as the signals lesson describes.
- **No interactive programs.** Editors such as `nano` and `vi`, and commands that wait for you to type input, do not run. Use `cat > file <<'EOF'` to create files instead.
- **Saved in one browser only.** Your lab files live in this browser on this device. Clearing site data or using another browser starts fresh.

## When you need a real machine, for free

You said you have no machine. These cost nothing to start, and each one is a real Linux you can break safely:

- **GitHub Codespaces.** This course's repository includes a ready-made environment (a `.devcontainer` folder) with Docker, `kubectl`, `kind`, Terraform and Ansible, and it creates the same `~/lab` practice files the lessons use. Personal GitHub accounts get a free monthly allowance of hours; check GitHub's current limits. I wrote this configuration but I could not test it inside Codespaces from here, so tell me if anything fails.
- **Google Cloud Shell.** A free Debian terminal in your browser with Docker, `kubectl` and Terraform installed, opened with a Google account. Sessions are temporary but your home folder persists.
- **Killercoda.** Free browser-based labs, including Linux, Docker and Kubernetes scenarios (some cluster labs are the best way to practise the CKA topics).
- **Play with Docker.** A free browser Docker host, for the Docker lessons.

Offers and limits on these services change, so treat this list as where to look first, not as a promise.

:::recap
- The **Lab** button opens a shell in this page; **Run in lab** runs a block for you.
- It is a faithful but simulated Linux: great for commands, text tools, permissions, scripts and Python.
- Blocks marked **Needs a real machine** use the kernel, the network or tools like Docker and Kubernetes: use Codespaces, Cloud Shell or Killercoda for those.
- If the lab and a real machine ever disagree, the real machine is right.
:::

:::try Your turn
Open the lab and run `labinfo`. It shows what your browser supports. Then run `labinfo --net` and see whether Python can be downloaded in your browser.
:::

```quiz
? A "Run in lab" button is green on a block. What does that tell you?
+ Every command in that block is one the in-browser lab supports.
- The block ran on a real Linux machine in the cloud.
- The block will install software on your computer.
- The block is guaranteed to give the identical output as real Linux.
! Green means the lab supports every command. The lab is a simulation, so small differences from real Linux can exist.

? Which of these can the in-browser lab NOT do?
+ Start a Docker container.
- Run a for loop in bash.
- Use grep, sed and awk on a file.
- Show file permissions with ls -l and change them with chmod.
! Containers, clusters and the kernel's namespaces need a real machine; text tools, scripts and permissions run fine in the lab.
```
