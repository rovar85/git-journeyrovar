---
track: docker
title: Running containers properly
short: Ports, env, limits
sub: Publish ports, pass configuration, set limits, restart policies and health.
---

:::goals
- publish ports with `-p`
- pass configuration with environment variables
- set memory and CPU limits and see what happens when exceeded
- use restart policies and healthchecks
:::

## Publishing ports

A container has its own network namespace. A server listening on port 80 inside is not reachable from outside until you **publish** the port: `-p HOST_PORT:CONTAINER_PORT`. Docker adds a NAT rule (you built exactly this with nftables in the networking track).

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
true
```

```run
docker run -d --name web -p 8081:80 busybox sh -c 'mkdir -p /www; echo "hello from EV web" > /www/index.html; httpd -f -p 80 -h /www'
sleep 1
curl -s http://localhost:8081/
docker port web
```

`8081:80` means "traffic to port 8081 on this host goes to port 80 in the container". The container could not see the host's port number; it still listens on 80. Two containers can both use 80 inside if their host ports differ.

```run
curl -s -o /dev/null -w "wrong port 8082: curl exit %{exitcode}\n" http://localhost:8082/ ; true
docker rm -f web > /dev/null
```

To bind only to the local machine use `-p 127.0.0.1:8081:80`. `-P` publishes all `EXPOSE`d ports to random host ports.

## Configuration through environment variables

Never bake settings or secrets into an image; pass them at run time.

```run
docker run --rm -e EV_SERVER=EV01 -e RETRIES=5 busybox sh -c 'echo "server=$EV_SERVER retries=$RETRIES"'
printf 'EV_SERVER=EV02\nRETRIES=9\n' > ~/lab/app.env
docker run --rm --env-file ~/lab/app.env busybox sh -c 'echo "server=$EV_SERVER retries=$RETRIES"'
```

`--env-file` loads many at once. Keep secrets files out of Git (`.gitignore`) and prefer your platform's secret store (Kubernetes Secrets, Docker secrets, a vault) for real passwords.

## Resource limits (cgroups at work)

Without limits, one container can eat the whole host. Limits use cgroups (Linux track, lesson 12).

```run
docker run --rm --memory 64m --cpus 0.5 busybox sh -c 'cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || cat /sys/fs/cgroup/memory.max'
docker run --name hog --memory 16m --memory-swap 16m busybox sh -c 'x=$(head -c 40000000 /dev/zero | tr "\0" "a"); echo "should not get here"' ; echo "exit code: $?"
docker inspect -f 'OOMKilled={{.State.OOMKilled}}' hog
docker rm hog > /dev/null
```

The container tried to use more memory than its 16 MB limit and the kernel killed it: **exit code 137, OOMKilled=true**. You will see the same status in Kubernetes. The fix is either raising the limit or fixing the memory use.

## Restart policies

Containers can come back automatically. This is how simple single-host setups stay up.

| Policy | Behaviour |
|---|---|
| `no` (default) | never restart |
| `on-failure[:N]` | restart if exit code is non-zero (up to N times) |
| `always` | always restart, including after Docker restarts |
| `unless-stopped` | like `always`, but not if you stopped it manually |

```run
docker run -d --name flaky --restart on-failure:3 busybox sh -c 'echo "crashing"; exit 1' > /dev/null
sleep 6
docker inspect -f 'restarts so far: {{.RestartCount}}  status: {{.State.Status}}' flaky
docker rm -f flaky > /dev/null
```

## Healthchecks

"Running" does not mean "working". A **healthcheck** runs a command periodically; Docker reports `healthy` or `unhealthy`. Orchestrators use this to replace broken containers.

```run
docker run -d --name hc --health-cmd 'test -f /ready' --health-interval 1s --health-retries 2 busybox sh -c 'sleep 3; touch /ready; sleep 60' > /dev/null
sleep 2
docker inspect -f 'after 2s: {{.State.Health.Status}}' hc
sleep 4
docker inspect -f 'after 6s: {{.State.Health.Status}}' hc
docker rm -f hc > /dev/null
```

It starts as `starting` or `unhealthy` until `/ready` appears, then becomes `healthy`.

## Running as a non-root user

By default processes in a container are root (of the container). Run as an unprivileged user wherever possible, so a break-in has less power:

```run
docker run --rm busybox id
docker run --rm --user 1000:1000 busybox id
docker run --rm --read-only --user 1000:1000 busybox sh -c 'touch /x 2>&1 | head -1'
```

<!-- deeper -->
## A worked solution and common mistakes

```run
docker rm -f p1 p2 > /dev/null 2>&1
docker run -d --name p1 -p 9000:80 busybox sh -c 'mkdir -p /www; echo hello > /www/index.html; httpd -f -p 80 -h /www' > /dev/null
sleep 1
echo "published on all interfaces:"; docker port p1
echo "fetch from this machine:"; curl -s http://localhost:9000/
docker rm -f p1 > /dev/null
docker run -d --name p2 -p 127.0.0.1:9000:80 busybox sh -c 'mkdir -p /www; echo hello > /www/index.html; httpd -f -p 80 -h /www' > /dev/null
sleep 1
echo "published on loopback only:"; docker port p2
docker rm -f p2 > /dev/null
```

The first form, `0.0.0.0:9000`, is reachable from **other machines** on the network; the second, `127.0.0.1:9000`, is reachable **only from this host**. Use the loopback form for databases and admin tools; publish to all interfaces only for services meant to be public. (Docker edits the firewall itself, so `ufw` rules may not protect a published port.)

:::warn Common mistakes
- **Publishing databases to the world** (`-p 5432:5432`) when only another container needs them. Use a Docker network instead.
- **Swapping the port order:** it is `HOST:CONTAINER`.
- **Putting secrets in `-e` on the command line** (visible in `docker inspect` and shell history); use files or secret stores.
- **No memory limit,** so one container takes down the host.
- **Using `--restart always` to hide a crash loop;** look at the logs and fix the cause.
:::
<!-- /deeper -->

:::recap
- `-p host:container` publishes ports. `-e` / `--env-file` pass configuration.
- `--memory` and `--cpus` set limits; exceeding memory means OOM kill, exit 137.
- Restart policies self-heal; healthchecks tell "running" from "working".
- Prefer non-root and read-only containers.
:::

:::try Your turn
Start a container that listens on port 80 inside, publish it on host port 9000, fetch it with `curl`, then restart it with `-p 127.0.0.1:9000:80` instead. What is the difference?
:::

:::quiz
? What does `-p 8081:80` mean?
+ Host port 8081 forwards to container port 80
- Container port 8081 forwards to host port 80
- Both ports are 8081
- It opens a firewall port only
! Format is HOST:CONTAINER.
? A container exits with code 137 and `OOMKilled=true`. What happened?
+ It exceeded its memory limit and was killed
- It exited normally
- A syntax error
- Docker crashed
! Raise the limit or fix the leak.
? Why add a healthcheck?
- To make it faster
+ To detect a container that is running but not working
- To limit memory
- To publish ports
! Orchestrators restart unhealthy containers.
:::
