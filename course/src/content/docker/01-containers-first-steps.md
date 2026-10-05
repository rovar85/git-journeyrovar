---
track: docker
title: Containers: first steps
short: First steps
sub: What Docker is for, and the run, list, log, exec, stop and remove cycle.
---

:::goals
- explain what a container is and why teams use them
- distinguish an image from a container
- run, list, inspect, stop and remove containers
- read container logs and run commands inside a container
:::

## The "works on my machine" problem

An application needs more than its own code: a language runtime, libraries, config files, the right versions. Installing all that by hand on every server leads to drift and surprises. A **container** packages the application **with everything it needs** and runs it in isolation on any Linux host with a container engine. You met the mechanics in the Linux track (namespaces, cgroups, layered filesystems). **Docker** is the most popular tool that makes this easy.

| Term | Meaning | Analogy |
|---|---|---|
| **Image** | read-only template: files plus default command | a class, a recipe, an installer |
| **Container** | a running (or stopped) instance of an image | an object, a cooked meal, an installed app |
| **Registry** | a server that stores images (Docker Hub, GHCR, ECR, ACR) | an app store |
| **Dockerfile** | the recipe text file for building an image | the recipe |
| **Docker Engine** | the background service (`dockerd`) that does the work | the kitchen |

You type `docker ...` (the **client**); it talks to the **daemon**, which pulls images and creates containers.

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
true
```

```run
docker version --format 'client {{.Client.Version}} / server {{.Server.Version}}'
docker images --format '{{.Repository}}:{{.Tag}}' | sort
```

## Run your first container

```run
docker run --rm busybox echo "hello from inside a container"
```

What happened: Docker found the image `busybox` (using it from the local cache; otherwise it would download from Docker Hub), created a container, ran `echo ...` as its only process, printed the output, and `--rm` removed the container when it exited. A container lives exactly as long as its main process.

```run
docker run --rm busybox sh -c 'echo "I am: $(hostname)"; echo "my pid: $$"; ps | head -3; cat /etc/os-release | head -1'
```

Inside, the shell is PID 1 and sees almost nothing else; the hostname is the container ID. The host's processes are invisible. That is namespace isolation.

## Long-running containers

Servers do not exit. Run one in the **background** with `-d` (detached) and give it a name:

```run
docker run -d --name web busybox sh -c 'echo started; i=0; while true; do i=$((i+1)); echo "tick $i"; sleep 1; done'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | sed 's/Up [0-9]* [a-z]*/Up .../'
sleep 3
docker logs web | head -4
```

| Command | Purpose |
|---|---|
| `docker ps` | running containers (`-a` includes stopped) |
| `docker logs NAME` | what the container printed (`-f` follow, `--tail 20`) |
| `docker exec -it NAME sh` | open a shell **inside** a running container |
| `docker stop NAME` | ask it to stop (SIGTERM, then SIGKILL after 10 s) |
| `docker start NAME` | start a stopped container again |
| `docker rm NAME` | delete a stopped container (`-f` force) |
| `docker inspect NAME` | all details as JSON |

```run
docker exec web sh -c 'echo "running inside web: $(hostname)"; ls /'
docker inspect -f 'state={{.State.Status}} image={{.Config.Image}}' web
docker stop web
docker ps -a --format '{{.Names}}: {{.Status}}' | sed 's/Exited ([0-9]*) .*/Exited/'
docker rm web
docker ps -a | wc -l
```

`docker stop` sends SIGTERM (you saw signals in the Linux track), then SIGKILL if the process ignores it for 10 seconds. A well-written container handles SIGTERM and exits cleanly.

## Containers are disposable

The container's writable layer vanishes when the container is removed. Files written inside are not kept:

```run
docker run --name tmp busybox sh -c 'echo "important data" > /data.txt'
docker start -a tmp > /dev/null
docker cp tmp:/data.txt - | tar -xO 2>/dev/null
docker rm tmp > /dev/null
docker run --rm busybox ls /data.txt 2>&1 | tail -1
```

A fresh container from the same image does not have the file. Data that must survive belongs in **volumes** (lesson 5). Treat containers as **cattle, not pets**: easy to replace, never hand-fixed.

## Exit codes and failures

```run
docker run --name bad busybox sh -c 'echo "failing"; exit 3'
docker inspect -f 'exit code: {{.State.ExitCode}}' bad
docker rm bad > /dev/null
docker run --rm busybox no-such-command 2>&1 | tail -1
```

Exit code 0 means success; 125 means Docker itself failed; 126/127 mean the command could not be run or was not found; 137 means killed by SIGKILL (often out of memory); 143 means SIGTERM.

:::note On Windows
Docker Desktop runs a small Linux VM and gives you the same `docker` command in PowerShell. Windows containers also exist but Linux containers are by far the norm.
:::

:::recap
- Image = template, container = running instance. A container lives as long as its main process.
- `run`, `ps`, `logs`, `exec`, `stop`, `rm`, `inspect`.
- Detached containers (`-d`) run servers; give them names.
- Container filesystems are disposable. Use volumes for data.
:::

:::try Your turn
Start a named background container that prints the date every 2 seconds. Read its last 3 log lines, run `date` inside it with `docker exec`, then stop and remove it. What exit code does it report after `docker stop`?
:::

:::quiz
? What is the difference between an image and a container?
+ An image is a template; a container is a running instance of it
- They are the same
- A container is a file on a registry
- An image is always running
! Many containers can be started from one image.
? Which command opens a shell inside a running container?
- `docker run -d`
+ `docker exec -it NAME sh`
- `docker logs`
- `docker stop`
! exec runs a new process in an existing container.
? A file written inside a container is gone after `docker rm`. Why?
+ It lived in the container's writable layer, which is deleted with it
- Docker encrypts files
- Files cannot be written
- It was copied to the registry
! Use volumes for persistent data.
:::
