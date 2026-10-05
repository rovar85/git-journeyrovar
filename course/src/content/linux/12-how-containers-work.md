---
track: linux
title: How containers work (namespaces and cgroups)
short: Container internals
sub: Build a tiny container from Linux features, so Docker and Kubernetes stop being magic.
---

:::goals
- explain namespaces and cgroups in plain words
- create an isolated process by hand with `unshare`
- see why a container is "just a process"
:::

## The big idea

A **container** is not a small virtual machine. It is an ordinary Linux process that the kernel has been told to **isolate** (it sees only its own view of the system) and **limit** (it may use only so much CPU and memory). Two kernel features do that:

| Feature | What it does | Example |
|---|---|---|
| **Namespaces** | give a process its own view of something | its own process list (PID), hostname (UTS), network, mounts, users |
| **cgroups** (control groups) | limit and account for resources | at most 256 MB memory, half a CPU |

Docker adds a friendly tool, image packaging and a registry on top. Everything else is these two features.

## Namespaces by hand

`unshare` runs a command in new namespaces. Give the process its own hostname:

```run
hostname
sudo unshare --uts bash -c 'hostname container-demo; hostname'
hostname
```

The host's name did not change. Now its own **process list**:

```run
sudo unshare --pid --fork --mount-proc bash -c 'echo "PID inside: $$"; ps -e -o pid,comm | head -3'
```

Inside, the shell believes it is **PID 1** and sees almost nothing else. From the host the same process has an ordinary large PID. That is the "container" illusion.

Its own **network**:

```run
sudo unshare --net bash -c 'ip -brief link'
echo "--- host:"
ip -brief link | awk '{print $1}' | grep -c '^lo$'
```

Inside there is only a loopback device, no connection to anything. Docker later plugs a virtual cable (`veth`) between this namespace and a bridge.

## cgroups: limits

cgroups are exposed as files. Resource limits are written into them. (Which cgroup version a host uses varies; this lab shows what is there.)

```run
cat /proc/self/cgroup | head -2
ls /sys/fs/cgroup | head -5
```

Docker uses this when you run `docker run --memory 256m --cpus 0.5 ...`. Try a real one in the Docker track. In a cgroup, if a process uses more memory than allowed, the kernel kills it (an "OOM kill"), which is the origin of the Kubernetes status `OOMKilled`.

## Files: images and layers

A container needs a root filesystem: the files of a small Linux userland. An **image** is that filesystem stored as stacked read-only **layers**, and a container adds a thin writable layer on top. Combining layers uses a **union filesystem** (`overlayfs`).

```run
cd ~/lab && rm -rf ov && mkdir -p ov/lower ov/upper ov/work ov/merged
echo "from the image" > ov/lower/base.txt
sudo mount -t overlay overlay -o lowerdir=ov/lower,upperdir=ov/upper,workdir=ov/work ov/merged
echo "added by the container" > ov/merged/new.txt
rm ov/merged/base.txt
echo "merged view:"; ls ov/merged
echo "lower (image) untouched:"; ls ov/lower
echo "upper (container changes):"; sudo ls -a ov/upper | grep -v '^\.\.\?$'
sudo umount ov/merged
sudo rm -rf ov
```

The image layer (`lower`) is never modified. Deleting `base.txt` created a "whiteout" marker in `upper`. When the container is removed, the `upper` layer is thrown away, which is why data in a container disappears unless you use a volume.

:::note What this means for you
- "It is just a process" explains why `ps` on the host shows container processes.
- A container shares the host kernel (unlike a VM), so it starts in a moment and a Linux container cannot run a different kernel.
- Isolation is good but not a security boundary as strong as a VM. Run containers as non-root users where possible.
:::

:::recap
- Container = process + namespaces (isolation) + cgroups (limits) + a layered root filesystem.
- `unshare` creates namespaces; `/sys/fs/cgroup` holds the limits; `overlayfs` stacks image layers.
- These ideas return in the Docker and Kubernetes tracks.
:::

:::quiz
? What do namespaces provide?
- Resource limits
+ Isolated views of processes, network, hostname, mounts
- Faster disks
- Encryption
! Namespaces isolate; cgroups limit.
? Why does data written inside a container vanish when it is removed?
- Containers have no disk
+ It lives in a writable layer that is deleted with the container
- Docker encrypts it
- It is copied to the image
! Use volumes for data that must survive.
? What does a container share with its host?
+ The kernel
- Nothing at all, it is fully isolated
- The whole filesystem
- The bootloader
! This is the key difference from a virtual machine.
:::
