---
track: docker
title: Docker notes: the full picture, verified
short: Docker notes, verified
sub: Every idea from a classic Docker cheat-sheet (VMs versus containers, the lifecycle states, CMD versus ENTRYPOINT, ADD versus COPY, networks, sizes, prune), each checked on a real Docker engine, plus the places where such notes are easy to misread.
---

:::goals
- explain why a container is lighter than a virtual machine, and prove that it shares the host kernel
- walk a container through the lifecycle states: created, running, paused, stopped, removed
- predict what `CMD` and `ENTRYPOINT` do together and how each is overridden
- know the real difference between `COPY` and `ADD`
- pick the right network mode and understand image versus container size
- use `docker system prune` without deleting what you meant to keep
:::

:::note Why this lesson exists
You shared an eight-page set of handwritten Docker notes: what Docker is, why it was created, VM versus Docker, architecture, image versus container versus Dockerfile, the Dockerfile instructions, `CMD` versus `ENTRYPOINT`, networking, storage, Compose, the container lifecycle, image layers and a command cheat-sheet. The earlier lessons of this track already cover most of it in depth. This lesson **checks the whole sheet against a real engine** and fills the gaps (pause and unpause, the `none` network, `ADD`, sizes). It also points out five statements in notes like these that are **easy to misread**.
:::

## 1. VM versus container

| | Virtual machine | Container |
|---|---|---|
| What is virtualised | the **hardware**: each VM boots its own **guest operating system** on a hypervisor | the **operating system's view**: processes are isolated with namespaces and limited with cgroups |
| Kernel | every VM has its **own** kernel | all containers **share the host's kernel** |
| Size and start time | gigabytes, tens of seconds to minutes | megabytes, a fraction of a second |
| Isolation | strong (separate kernels) | good, but a **kernel bug or misconfiguration** affects everything on the host |
| Runs a different OS? | yes (Windows VM on a Linux host) | no: a Linux container needs a Linux kernel |

The notes say "containers share the host OS kernel, that's why they are lightweight". Prove it: ask a container and the host for the kernel version.

```run
mkdir -p ~/lab/dn && cd ~/lab/dn
echo "host kernel:      $(uname -r)"
echo "container kernel: $(docker run --rm busybox uname -r)"
```

The two are the **same string**: the container has no kernel of its own. (On Docker Desktop for Windows or macOS a small hidden Linux VM provides the kernel, which is why Linux containers run there at all.)

## 2. The container lifecycle, state by state

The notes draw five states: **Created, Running, Paused, Stopped, Removed**. Walk one container through all of them and read the state from the engine each time:

```run
cd ~/lab/dn
docker rm -f life > /dev/null 2>&1
state() { s=$(docker inspect -f '{{.State.Status}}  (running={{.State.Running}} paused={{.State.Paused}})' life 2>/dev/null) && echo "$s" || echo "gone: the container no longer exists"; }
docker create --name life busybox sleep 300 > /dev/null;  echo "docker create   -> $(state)"
docker start life > /dev/null;                            echo "docker start    -> $(state)"
docker pause life > /dev/null;                            echo "docker pause    -> $(state)"
docker unpause life > /dev/null;                          echo "docker unpause  -> $(state)"
docker stop -t 1 life > /dev/null;                        echo "docker stop     -> $(state)"
docker start life > /dev/null;                            echo "docker start    -> $(state)   (a stopped container can start again)"
docker rm -f life > /dev/null;                            echo "docker rm -f    -> $(state)"
```

Details worth knowing:

- `docker run` is **create + start** in one step (and `-d` just detaches).
- **Paused** freezes every process with the cgroup freezer: memory stays allocated, nothing runs, and the container **does not know** it was paused. It is not the same as stopped.
- **Stopped** (the notes say "stopped container"; Docker calls it `exited`) keeps the container's **filesystem layer, name and logs** until you `docker rm`. `docker ps -a` shows it.
- **Removed** is final for the container's writable layer. Named volumes survive; **anonymous volumes** survive too unless you add `-v` to `docker rm`.
- `docker stop` sends `SIGTERM`, waits (10 seconds by default; `-t` changes it), then `SIGKILL`.

## 3. `CMD` versus `ENTRYPOINT`

Both say what runs when the container starts. The notes' table says `CMD` "can be overridden" and `ENTRYPOINT` "cannot be overridden easily". The precise rules, which the next experiment demonstrates:

- **`ENTRYPOINT`** is the fixed program; **`CMD`** is the **default arguments** to it (or the default command when there is no `ENTRYPOINT`).
- Arguments you put **after the image name** in `docker run` **replace `CMD`**, and are passed to the `ENTRYPOINT`.
- The entrypoint itself **can** be replaced with `docker run --entrypoint`. It is hard to override by accident, not impossible.

```run
cd ~/lab/dn
cat > Dockerfile <<'EOF'
FROM busybox
ENTRYPOINT ["echo", "Hello,"]
CMD ["world"]
EOF
docker build -q -t greeter . > /dev/null
echo "default (CMD supplies the argument):  $(docker run --rm greeter)"
echo "with arguments after the image name:  $(docker run --rm greeter Priya)"
echo "with --entrypoint replaced:           $(docker run --rm --entrypoint echo greeter 'now a different program')"
```

The pattern to remember: **`ENTRYPOINT` = "this container is this program"**, **`CMD` = "and these are its default arguments"**. Use the **exec form** (the JSON list, as above) so the program is PID 1 and receives signals such as `SIGTERM`; the shell form wraps your command in `/bin/sh -c`, which often swallows them (lesson 8 on graceful shutdown).

## 4. `COPY` versus `ADD`

The notes: `ADD` "is similar to `COPY`, also supports URLs and auto-extracts `.tar` files". True, and that extra magic is exactly why **`COPY` is preferred**. See both treat the same archive:

```run
cd ~/lab/dn
mkdir -p app && echo "version=1" > app/settings.conf
tar -C app -czf app.tar.gz settings.conf
cat > Dockerfile.add <<'EOF'
FROM busybox
COPY app.tar.gz /via-copy/
ADD  app.tar.gz /via-add/
EOF
docker build -q -t copyadd -f Dockerfile.add . > /dev/null
echo "COPY keeps the archive as a file:"; docker run --rm copyadd ls /via-copy
echo "ADD unpacks the archive for you:";  docker run --rm copyadd ls /via-add
```

**Rule of thumb:** use **`COPY`** for everything, and use **`ADD`** only when you specifically want automatic extraction of a local tarball. Avoid `ADD <url>`: it downloads at build time with no checksum and breaks caching; use `curl` or `wget` in a `RUN` step (and verify a checksum), or better, a multi-stage build. Also: `EXPOSE 8080` in a Dockerfile is **documentation only**; it does **not** publish the port. Only `-p` (or `-P`) on `docker run`, or `ports:` in Compose, makes a port reachable from outside.

## 5. Networks: bridge, host, none (and overlay)

| Mode | What it gives the container |
|---|---|
| **bridge** (default) | its own IP on a private network (`docker0`, typically `172.17.0.0/16`), outbound NAT, reachable from the host via published ports; user-defined bridges also add **name-based DNS** between containers |
| **host** | **no network isolation**: it uses the host's network stack directly (fast, but ports clash with host services) |
| **none** | **only a loopback interface**: no network at all |
| **overlay** | spans **multiple Docker hosts** (needs Swarm mode or a key-value store). On Kubernetes this job is done by the **CNI plugin** instead |

```run
cd ~/lab/dn
echo "--- bridge (default):"
docker run --rm busybox ip addr | grep -E 'inet ' | sed -E 's/172\.17\.[0-9]+\.[0-9]+/172.17.x.x/'
echo "--- none:"
docker run --rm --network none busybox ip addr | grep -E 'inet '
echo "--- none: a request to the outside fails:"
docker run --rm --network none busybox wget -T 3 -q -O- http://example.com 2>&1 | head -1
```

`none` is the strongest isolation Docker offers on the network side: good for batch jobs that process local data and must not phone home.

## 6. Image size versus container size

The notes' comparison table says an image is "larger" and a container "smaller". Be careful: a container is **not a copy** of the image. It is the image's **read-only layers (shared by all containers from that image)** plus one thin **writable layer** of its own. Look at both numbers with `docker ps -s`:

```run
cd ~/lab/dn
docker rm -f sz > /dev/null 2>&1
docker run -d --name sz busybox sh -c 'head -c 10000000 /dev/zero > /big.bin; sleep 300' > /dev/null
sleep 2
docker ps -s --filter name=sz --format 'writable layer (SIZE): {{.Size}}'
docker rm -f sz > /dev/null
```

The reported **size** is the container's own writable layer (here about 10 MB, from the file it wrote) and the **virtual size** in parentheses is that plus the shared image layers. Run a hundred containers from one image and the image layers are stored **once**. This is also why writing lots of data into a container's filesystem is a bad idea: it goes to the writable layer, slower than a volume and **lost on `docker rm`** (lesson 5).

## 7. `docker cp`, `docker system prune` and a safety net

`docker cp` copies files between a container and the host, **in either direction**, even for a stopped container:

```run
cd ~/lab/dn
docker rm -f cpdemo > /dev/null 2>&1
docker create --name cpdemo busybox > /dev/null
echo "from the host" > hello.txt
docker cp hello.txt cpdemo:/tmp/hello.txt                 # host -> container
docker cp cpdemo:/etc/passwd ./container-passwd.txt        # container -> host
docker start cpdemo > /dev/null 2>&1; docker rm -f cpdemo > /dev/null
echo "copied out of the container: $(head -1 container-passwd.txt)"
docker system df
```

`docker system df` shows what Docker is using: images, containers, volumes and build cache. The cheat-sheet's last row, `docker system prune -a`, says "remove unused data (containers, images, networks, volumes)". Read the **documentation carefully** before you run it, because the real behaviour is narrower and more dangerous in a different way:

| Command | Removes |
|---|---|
| `docker system prune` | stopped containers, unused networks, **dangling** images, and unused build cache |
| `docker system prune -a` | the same, **plus every image not used by at least one container** (not just dangling ones), so the next `docker run` re-downloads |
| `docker system prune --volumes` | additionally prunes **unused anonymous volumes** (volumes are **not** pruned by default) |

I did not run `prune -a` here: it would delete the lab's cached images and the next pull could hit Docker Hub's rate limit. That is exactly the kind of surprise to avoid on a shared build server, so on a real machine use `docker system df` first, and prefer targeted commands: `docker container prune`, `docker image prune`, `docker volume prune` (each asks for confirmation) and filters such as `--filter "until=24h"`.

## 8. The compose and layer notes, with their fine print

Three statements from the Compose and layers pages that deserve a footnote:

1. **`version: '3.8'`** at the top of a Compose file is **obsolete**. Current Compose (the `docker compose` plugin) ignores it and warns; leave it out.
2. **`depends_on`** only controls **start order**, not **readiness**. `depends_on: [mysql]` starts the MySQL container first, but the application can still start before MySQL accepts connections. For real ordering give the dependency a `healthcheck` and use `depends_on: {mysql: {condition: service_healthy}}` (lesson 7), or make the application retry its connection.
3. **Layer caching**: Docker reuses a cached layer only if the **instruction and everything before it** are unchanged. The notes' example (`COPY . /app` after `RUN npm install`) hints at the key habit: **put what changes least first**. Copy `package.json` (or `requirements.txt`) and install dependencies **before** copying your source, so editing code does not reinstall every dependency (lesson 4).

:::warn Common mistakes
- **Treating a container like a small VM**: logging in, installing things, expecting it to keep state. Containers are disposable; configuration and data live outside.
- **Thinking `EXPOSE` opens a port.** It documents; `-p` publishes.
- **Using `ADD` for ordinary files**, or `ADD <url>` at all.
- **Shell-form `CMD` and `ENTRYPOINT`**, so signals never reach the app and `docker stop` waits ten seconds then kills it.
- **`docker system prune -a` as a routine cleanup** on a machine where rebuilding or re-downloading is slow or rate-limited.
- **Assuming `depends_on` waits for the database to be ready.**
- **`--network host` as a fix for connection problems.** It removes isolation and hides the real issue (usually the wrong hostname or port).
:::

:::recap
- Containers share the host kernel (same `uname -r`); VMs bring their own. That is the whole reason for the size and speed difference.
- Lifecycle: `create` → `start` → (`pause`/`unpause`) → `stop` → `start` again or `rm`. `run` = create + start.
- `ENTRYPOINT` is the program, `CMD` its default arguments; arguments after the image replace `CMD`, `--entrypoint` replaces the entrypoint.
- Prefer `COPY` to `ADD`; `EXPOSE` documents, `-p` publishes.
- Networks: bridge (default), host (no isolation), none (loopback only), overlay (multi-host; Kubernetes uses CNI).
- A container is the image's shared read-only layers plus a thin writable layer; `docker system df` before any `prune`.
:::

:::try Your turn
Write a Dockerfile with `ENTRYPOINT ["ls"]` and `CMD ["-l", "/"]`, build it, then run it three ways: with no arguments, with `-a /etc`, and with `--entrypoint cat` plus `/etc/hostname`. Predict each output before you run it.
:::

:::quiz
? Why do two containers on one host show the same `uname -r` as the host?
+ Containers share the host's kernel; only a VM has its own
- Docker copies the host kernel into each image
- uname always prints the same value
- Containers run on a hypervisor
! Namespaces and cgroups isolate processes, not kernels.
? In an image with `ENTRYPOINT ["echo", "Hello,"]` and `CMD ["world"]`, what does `docker run image Priya` print?
+ Hello, Priya
- world
- Hello, world Priya
- An error
! Arguments after the image name replace CMD and are passed to the entrypoint.
? What does `docker system prune` remove by default?
+ Stopped containers, unused networks, dangling images and build cache, but not volumes
- Everything including volumes
- Only running containers
- Only images
! Add -a for all unused images and --volumes for unused volumes.
:::
