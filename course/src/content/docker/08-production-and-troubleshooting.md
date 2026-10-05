---
track: docker
title: Production practice and troubleshooting
short: Production, debugging
sub: Logging, security hardening, image scanning, and a debugging playbook.
---

:::goals
- apply a security checklist to images and containers
- manage logs and disk use
- debug a container that will not start or keeps restarting
- know where Docker stops and orchestration (Kubernetes) begins
:::

## A security checklist

| Practice | Why | How |
|---|---|---|
| Run as non-root | a breakout has fewer rights | `USER 10001` in the Dockerfile or `--user` |
| Read-only root filesystem | malware cannot persist or modify binaries | `--read-only` (+ tmpfs / volumes where needed) |
| Drop capabilities | root-in-container has fewer kernel powers | `--cap-drop ALL --cap-add NET_BIND_SERVICE` |
| No new privileges | blocks setuid escalation | `--security-opt no-new-privileges` |
| Minimal base, pinned versions | fewer vulnerabilities, repeatable | alpine / distroless, `image:1.2.3` or digest |
| Scan images | find known CVEs | `trivy image NAME`, `docker scout cves` |
| No secrets in images or env dumps | images are widely readable | run-time secrets, vaults |
| Limit resources | one container cannot starve the host | `--memory`, `--cpus`, `--pids-limit` |
| Never mount `docker.sock` | whoever has it controls the host | avoid, or use a hardened proxy |

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
true
```

Apply several at once and see the effects:

```run
docker run --rm --user 10001:10001 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 32m --pids-limit 20 busybox sh -c 'id; echo "write test:"; touch /x 2>&1 | head -1; echo "chown test:"; chown 0:0 /tmp 2>&1 | head -1'
```

The process runs as an unprivileged user, cannot write to the root filesystem, and cannot change ownership. If an attacker exploits the application inside, they land in a locked room.

:::warn The Docker socket is root
Access to `/var/run/docker.sock` (or membership in the `docker` group) is equivalent to root on the host: you can start a container that mounts the host filesystem. Treat the `docker` group like `sudo`.
:::

## Logs

By default Docker captures whatever a container writes to **stdout/stderr** (the right way for containers to log) and stores it as JSON files on the host. Without a limit these grow forever and fill the disk.

```run
docker run -d --name chatty --log-opt max-size=10k --log-opt max-file=2 busybox sh -c 'i=0; while true; do i=$((i+1)); echo "line $i padding padding padding padding padding"; done' > /dev/null
sleep 3
docker inspect chatty --format 'log driver: {{.HostConfig.LogConfig.Type}}  options: {{.HostConfig.LogConfig.Config}}'
docker logs chatty --tail 1 | grep -c '^line'
docker rm -f chatty > /dev/null
```

Set `max-size` and `max-file` per container or in `/etc/docker/daemon.json`. In production, send logs to a central system (ELK, Loki, Splunk, CloudWatch) with a logging driver or agent; the Monitoring track covers it.

## Debugging playbook

When a container misbehaves, ask in this order:

1. **Is it running?** `docker ps -a`: status, exit code
2. **What did it say?** `docker logs --tail 50 NAME`
3. **Why did it stop?** `docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}} {{.State.Error}}' NAME`
4. **What is it configured with?** `docker inspect NAME` (env, mounts, command, network)
5. **Can I get inside?** `docker exec -it NAME sh`; if it crashes immediately, start a shell instead: `docker run --rm -it --entrypoint sh IMAGE`
6. **Is it the network or the data?** DNS, ports, volume permissions

Walk through three typical failures:

```run
echo "### 1. wrong command"
docker run --name f1 busybox nosuchprogram 2>&1 | tail -1 | cut -c1-90
docker inspect -f 'exit={{.State.ExitCode}}' f1
echo "### 2. crashes on start: read the logs and exit code"
docker run --name f2 busybox sh -c 'echo "FATAL: cannot open /etc/ev/evault.conf" >&2; exit 2'
docker inspect -f 'exit={{.State.ExitCode}}' f2
echo "### 3. fix by supplying the missing config"
mkdir -p ~/lab/etc-ev && echo "ok=1" > ~/lab/etc-ev/evault.conf
docker run --rm -v ~/lab/etc-ev:/etc/ev:ro busybox sh -c 'test -r /etc/ev/evault.conf && echo "config found, service would start"'
docker rm f1 f2 > /dev/null
```

Exit codes help: 125 Docker daemon error, 126 command not executable, 127 command not found, 137 SIGKILL (often OOM), 143 SIGTERM.

## CrashLoop and "it works on my machine"

If a container restarts repeatedly (restart policy + crash), read the **first** crash's logs, not the latest. Common causes: missing environment variable or file, dependency not ready, wrong permissions on a mounted volume, out of memory, port already in use on the host. Reproduce locally with the same image tag (not `latest`) and the same environment.

## Where Docker stops

A single host with Docker (or Compose) is fine for small systems. It does not by itself give you:

- running containers across **many machines**
- automatic **replacement** when a machine dies
- **rolling updates** without downtime and automatic rollbacks
- **service discovery**, load balancing and **autoscaling** across the cluster
- central **secrets and config**, access control, quotas

That is the job of an **orchestrator**, almost always **Kubernetes**, which is the next big track. Everything you learned here (images, registries, ports, volumes, env, healthchecks, limits) carries over directly.

## Clean-up and housekeeping

```run
docker ps -aq | wc -l
docker system df --format '{{.Type}}: {{.Reclaimable}}' | sed 's/ ([0-9]*%)//'
```

`docker system prune` removes stopped containers, unused networks and dangling images; add `-a` for all unused images and `--volumes` for unused volumes (data loss!).

:::recap
- Harden: non-root, read-only, drop capabilities, scan images, no secrets in images, limits.
- Log to stdout/stderr, cap log size, ship centrally.
- Debug: status, logs, exit code, inspect, exec, network/data.
- Single-host Docker has limits; Kubernetes solves multi-host scheduling and self-healing.
:::

:::try Your turn
Take the web image from the Dockerfile lesson and run it with non-root user, read-only filesystem, dropped capabilities and a memory limit. Does it still serve on port 8080 (non-privileged port)? Why is port 80 a problem for a non-root user?
:::

:::quiz
? Why is membership of the `docker` group dangerous?
+ It is effectively root on the host
- It makes Docker slower
- It deletes images
- It only affects logs
! You can mount the host filesystem into a container.
? A container exits with 127. Most likely cause?
- Out of memory
+ The command was not found in the image
- Killed by SIGTERM
- Healthcheck failed
! 127 = command not found.
? Where should containerised apps write logs?
- To files inside the container
+ To stdout and stderr
- To the registry
- To /dev/null
! Docker captures stdout/stderr and log drivers ship it.
:::
