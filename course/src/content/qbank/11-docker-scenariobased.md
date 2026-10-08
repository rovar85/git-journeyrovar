---
track: qbank
title: "Docker and containers: Scenario-based questions"
short: Docker scenario
sub: 9 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## A Docker container keeps restarting (or suddenly stops / crashes) in production. How do you find the root cause?

<!-- source: 02 Q31 -->

*Also asked as:* If a running container suddenly stops, how do you troubleshoot? A container has crashed or exited - how do you figure out what went wrong?

:::note In simple words
Like a car that keeps stalling: check the dashboard warning (exit code), read the trip log (container logs), and check whether it ran out of fuel (memory) or was told to stop by someone else.
:::

1. **Status and restart count**: `docker ps -a` - look at STATUS and how often it restarts.
2. **Exit code and reason**: `docker inspect` -> `State.ExitCode`, `State.OOMKilled`, `State.Error`.
   - `0` = process finished (wrong CMD, app not long-running).
   - `1` = app error (config, missing env, crash).
   - `125/126/127` = docker run error / not executable / command not found.
   - `137` = SIGKILL, usually **OOM killed** or forced kill.
   - `139` = segfault. `143` = SIGTERM (normal stop).
3. **Logs**: `docker logs --tail 200 <c>` and `--previous` style checks around the crash time.
4. **Events**: `docker events` or `journalctl -u docker` - who stopped it, OOM, health check failures.
5. **Resources**: `docker stats`, host `dmesg | grep -i oom`, disk full (`df -h`).
6. **Dependencies**: DB/API reachable? DNS? Wrong env or missing secret?
7. **Health check** failing -> restart policy or orchestrator kills it.
8. **Reproduce**: run the same image with `--entrypoint sh` to inspect files, config and permissions.
9. **Fix and prevent**: raise memory limit or fix leak, fix config, add proper health check, alert on restart count.

**Example:**

```bash
docker ps -a --filter name=api
docker inspect api --format 'Exit={{.State.ExitCode}} OOM={{.State.OOMKilled}} Err={{.State.Error}}'
# Exit=137 OOM=true Err=
docker logs --since 30m api | tail -50
docker events --since 1h --filter container=api
dmesg -T | grep -i -E "killed process|out of memory"
docker run --rm -it --entrypoint sh myorg/api:1.4.2
```

:::say
I start with docker ps -a and docker inspect to get the exit code and OOMKilled flag, then read docker logs and docker events around the crash. Exit 137 with OOMKilled points to memory, exit 1 to an app or config error, 127 to a bad command; I confirm by running the image with a shell, fix the cause and add alerts on restart count.
:::

## Your Docker image size has grown from 300MB to 3GB. How would you investigate and optimize it?

<!-- source: 02 Q32 -->

:::note In simple words
Your suitcase suddenly weighs ten times more. Open it layer by layer to find what got packed by mistake, then repack properly.
:::

**Investigate first (find what changed):**

1. `docker history <image>` - see size per layer; the fat layer shows which instruction caused it.
2. `dive <image>` - browse files added per layer and wasted space.
3. `git diff` the Dockerfile and `.dockerignore` between the 300MB and 3GB versions.

Common culprits:

- `.dockerignore` missing or broken -> `.git`, `node_modules`, datasets, logs copied in.
- Base image changed (alpine -> full ubuntu, or a `-dev` / CUDA image).
- Build tools and caches left in (apt lists, pip/npm cache, compilers).
- Files deleted in a later layer (still stored in the earlier one).
- Large artifacts, dumps or test files copied with `COPY . .`.

**Fix:**

- Restore/strengthen `.dockerignore`; copy only needed paths.
- Multi-stage build, slim/distroless runtime.
- Clean up in the same RUN; `--no-install-recommends`, `--no-cache-dir`.
- Move big static data to S3 or a volume.
- Add a CI guard that fails the build if the image exceeds a size budget.

**Example:**

```bash
docker images myapp
docker history --format "{{.Size}}\t{{.CreatedBy}}" myapp:bad | sort -h | tail -5
# 2.6GB   COPY . .     <- culprit: whole repo incl. data/ and .git
cat .dockerignore
dive myapp:bad

# CI size guard
SIZE=$(docker image inspect myapp:$TAG --format '{{.Size}}')
[ "$SIZE" -gt 524288000 ] && echo "Image > 500MB" && exit 1
```

:::say
I use docker history and dive to find the exact layer that grew, then diff the Dockerfile and .dockerignore against the last good version - usually it is a broken .dockerignore, a heavier base image or leftover build caches. I fix it with multi-stage builds, targeted COPY and same-layer cleanup, and add a size budget check in CI.
:::

## Your Docker image build time has shot up to 25 minutes. How do you optimize it?

<!-- source: 02 Q33 -->

:::note In simple words
If you rewash every dish every time you cook one new dish, dinner takes forever. Reuse what is already clean (cache) and only redo what changed.
:::

1. **Measure**: build with `--progress=plain` to see which step is slow.
2. **Fix layer order**: copy dependency manifests first, install, then `COPY . .`. If source is copied before the install, every code change reinstalls all dependencies.
3. **`.dockerignore`**: a huge build context (GBs of `.git`, data) is uploaded every build.
4. **Enable BuildKit** and cache mounts (`--mount=type=cache`) for npm/pip/maven/go caches.
5. **Remote cache in CI**: ephemeral CI agents start empty, so use `--cache-from` / `--cache-to` with a registry cache (ECR) or the CI cache.
6. **Multi-stage parallelism**: independent stages build in parallel with BuildKit.
7. **Pre-built base image** with heavy OS packages, rebuilt weekly instead of every build.
8. **Pin versions** so cache is stable; avoid `apt-get update` busting cache unnecessarily.
9. **Faster runners** / local registry mirror to avoid slow pulls and rate limits.
10. Build only changed services in a monorepo.

**Example:**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build
```

```bash
docker buildx build \
  --cache-from type=registry,ref=$REG/app:buildcache \
  --cache-to   type=registry,ref=$REG/app:buildcache,mode=max \
  -t $REG/app:$TAG --push .
```

:::say
I first profile the build with plain progress to find the slow step, then fix layer ordering so dependency installs are cached, trim the build context with .dockerignore, and enable BuildKit cache mounts. In CI I add a registry-backed cache with cache-from and cache-to, which usually brings builds from 25 minutes down to a few minutes.
:::

## You are building a Docker image but requirements.txt (or package.json) keeps installing an old dependency version. How do you fix it?

<!-- source: 02 Q34 -->

:::note In simple words
Docker remembered an old shopping trip and gave you the same old bag instead of going to the shop again. You need to tell it the list changed or force a fresh trip.
:::

Likely causes:

1. **Layer cache** - the install step was cached. If the file really changed, the `COPY requirements.txt` layer should bust the cache; if it did not, the file used is not the one you edited.
2. **Unpinned versions** (`requests>=2.0`) - with a cached layer you keep the old resolved version; without cache you may get a random new one.
3. **Wrong file copied** - build context path, `.dockerignore`, or a stale file in the repo; `COPY` happens after the install step.
4. **Old base image** already has the package installed (pull a fresh base).
5. **Private mirror / proxy** serving a stale index.
6. CI uses a stale remote cache or an old image tag instead of the new build.

Fix:

- Pin exact versions (`requests==2.32.3`) or use a lock file.
- Copy the dependency file just before the install step.
- Rebuild without cache: `docker build --no-cache` or `--pull` for a fresh base.
- Verify inside the image what version got installed.

**Example:**

```dockerfile
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```

```bash
docker build --no-cache --pull -t app:fix .
docker run --rm app:fix pip show requests | grep Version
docker run --rm app:fix cat requirements.txt     # confirm the right file got in
```

:::say
It is almost always a cached layer or unpinned versions, so I pin exact versions with a lock file, make sure the dependency file is copied right before the install step, and rebuild with --no-cache --pull. Then I verify the installed version inside the image before pushing.
:::

## Docker containers are consuming high CPU on the host. How do you identify the root cause?

<!-- source: 02 Q35 -->

:::note In simple words
The electricity bill is huge - go room to room with a meter to find which appliance is burning power, then check why it is running non-stop.
:::

1. **Which container?** `docker stats --no-stream` - CPU %, memory, per container.
2. **Which process inside?** `docker top <c>` or `docker exec <c> top`; on host, `top`/`htop` and map PID to container with `docker inspect`.
3. **Is it real work or a problem?**
   - Traffic spike -> legit, scale out.
   - Infinite loop, busy retry loop, crash-restart loop (restarts cost CPU).
   - Memory near limit -> heavy GC (Java/Node) shows as CPU.
   - Crypto-miner in a compromised image (unknown processes!).
4. **Logs** for errors or retry storms: `docker logs --since 10m`.
5. **Host-level**: `iowait`, steal time on a VM, noisy neighbour.
6. **Profile the app** (thread dump, `perf`, language profiler).
7. **Contain**: set `--cpus` limits so one container cannot starve others; restart or scale; fix code.

**Example:**

```bash
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
docker top api
docker exec -it api top -b -n 1 | head -15
docker inspect api --format '{{.RestartCount}}'
docker update --cpus 1.5 api          # cap CPU live
```

:::say
I use docker stats to find the container, then docker top or top inside it to find the process, and check logs, restart count and memory pressure to decide if it is real load, a loop, GC thrashing or something malicious. I contain it with CPU limits or scaling, then profile and fix the root cause.
:::

## Docker shows "no space left on device". How do you resolve it?

<!-- source: 02 Q36 -->

*Also asked as:* If Docker shows "no space available", how do you fix it?

:::note In simple words
The storeroom is full of old boxes nobody uses - old images, stopped containers, leftover build scraps and giant log files. Clear them out and set a rule so it doesn't fill again.
:::

1. **Confirm what is full**: `df -h` (disk) and `df -i` (inodes). Docker data lives in `/var/lib/docker`.
2. **See Docker usage**: `docker system df -v`.
3. **Clean safely**:
   - Stopped containers: `docker container prune`
   - Dangling/unused images: `docker image prune -a` (removes images not used by any container)
   - Build cache: `docker builder prune`
   - Unused volumes: `docker volume prune` - careful, this can delete data.
4. **Huge container logs**: `/var/lib/docker/containers/*/*-json.log` can be GBs; truncate, then set log rotation.
5. **Long-term**:
   - Log rotation in `/etc/docker/daemon.json`.
   - Scheduled prune job on build agents.
   - Move Docker data-root to a bigger disk, or grow the EBS volume.
   - Disk usage alerts at 80 percent.

**Example:**

```text
df -h /var/lib/docker
docker system df -v
docker container prune -f
docker image prune -a -f --filter "until=168h"
docker builder prune -f
du -sh /var/lib/docker/containers/*/*-json.log | sort -h | tail -3
truncate -s 0 /var/lib/docker/containers/<id>/<id>-json.log
```

```json
# /etc/docker/daemon.json
{ "log-driver": "json-file", "log-opts": { "max-size": "50m", "max-file": "3" } }
```

:::say
I confirm with df and docker system df, then prune stopped containers, unused images and build cache, and truncate oversized container logs - being careful with volume prune since it can delete data. Long term I set log rotation in daemon.json, schedule pruning on build agents and alert on disk usage before it reaches 100 percent.
:::

## The Docker daemon becomes unavailable on a production server. How would you recover?

<!-- source: 02 Q37 -->

:::note In simple words
The engine of the machine stopped. First check whether it is out of fuel (disk), overheated (memory), or has a broken setting, then restart it carefully so the running work isn't lost.
:::

1. **Confirm**: `docker ps` -> "Cannot connect to the Docker daemon". Check `systemctl status docker` and `containerd`.
2. **Read why**: `journalctl -u docker -n 200 --no-pager`.
3. **Common causes and fixes**:
   - Disk full on `/var/lib/docker` -> free space (logs, old images), then start.
   - Bad `/etc/docker/daemon.json` (JSON typo after a change) -> validate/fix.
   - containerd crashed -> `systemctl restart containerd`.
   - Socket permission / stale `docker.pid`.
   - Host OOM or kernel/storage-driver error.
4. **Restart**: `systemctl restart docker`. With `"live-restore": true`, running containers keep running while the daemon restarts.
5. **Verify**: containers with `--restart unless-stopped` come back; check app health.
6. **If the host is broken**: drain it from the load balancer and replace it (immutable infra) instead of fixing live.
7. **Prevent**: enable live-restore, monitor the docker service and disk, log rotation, test daemon.json changes.

**Example:**

```bash
sudo systemctl status docker containerd
sudo journalctl -u docker --since "30 min ago" --no-pager | tail -40
df -h /var/lib/docker
jq . /etc/docker/daemon.json                   # validate JSON
sudo systemctl restart containerd docker
docker ps
```

```json
# /etc/docker/daemon.json
{ "live-restore": true, "log-opts": { "max-size": "50m", "max-file": "3" } }
```

:::say
I check systemctl status and journalctl for docker and containerd to find the cause - usually disk full, a bad daemon.json or containerd failure - fix it and restart the service, then verify containers came back via restart policies. For prevention I enable live-restore so containers survive daemon restarts, monitor the service and disk, and replace unhealthy hosts behind the load balancer.
:::

## A containerised app runs perfectly on a developer machine but crashes in production. What is your debug checklist?

<!-- source: 02 Q38 -->

:::note In simple words
The dish tastes great at home but fails in the restaurant. Same recipe? Same ingredients? Same oven settings? Check every difference between the two kitchens.
:::

1. **Same image?** Compare image digest, not just tag. `latest` or a locally built image may differ from what CI pushed.
2. **CPU architecture**: built on an ARM Mac (arm64) but prod is amd64 -> `exec format error`. Build with `--platform` / buildx multi-arch.
3. **Config and secrets**: missing env vars, wrong `.env`, secrets not injected in prod.
4. **Network and dependencies**: prod DB/API endpoints, security groups, DNS, TLS certificates, proxy.
5. **Resource limits**: prod memory/CPU limit lower -> OOMKilled (exit 137).
6. **Permissions**: prod runs as non-root or read-only filesystem; app writes to a folder it cannot.
7. **Volumes and files**: dev bind-mounts local files that are not in the image.
8. **Versions**: base image, runtime and dependency versions not pinned.
9. **Logs and exit code**: `docker logs`, `docker inspect` in prod.
10. **Reproduce**: run the exact prod image locally with prod-like env and limits.

**Example:**

```bash
docker inspect --format '{{index .RepoDigests 0}}' myapp:1.4.2      # compare dev vs prod
docker image inspect myapp:1.4.2 --format '{{.Architecture}}'      # arm64 vs amd64?
docker logs --tail 100 myapp
docker buildx build --platform linux/amd64,linux/arm64 -t $REG/myapp:1.4.2 --push .
docker run --rm --memory 256m --read-only --user 1000 --env-file prod.env myapp:1.4.2
```

:::say
I first confirm it is the same image digest and architecture, then compare everything environmental - env vars and secrets, network access, resource limits, user permissions and mounted files - using the prod logs and exit code. Then I reproduce by running the exact prod image locally with prod-like limits and config.
:::

## A container is running but not reachable on its port. How do you debug it?

<!-- source: 02 Q39 -->

:::note In simple words
The shop is open inside, but customers can't get in. Check: is there a door to the street (port mapping)? Is the shopkeeper listening at the front counter or only in the back room (0.0.0.0 vs 127.0.0.1)? Is a guard blocking the street (firewall / security group)?
:::

Work from inside out:

1. **Is the app listening inside the container?** `docker exec <c> netstat -tlnp` (or `ss -tlnp`) and `curl localhost:<port>` from inside.
2. **Bound to the right address?** If the app listens on `127.0.0.1`, it is only reachable from inside the container. It must bind to **`0.0.0.0`**. This is the most common cause.
3. **Is the port published?** `docker ps` / `docker port <c>` - `EXPOSE` alone does NOT publish. Needs `-p hostPort:containerPort`, and the container port must match the app's real port.
4. **From the host**: `curl localhost:<hostPort>`, `nc -zv localhost <hostPort>`. Port already used by another process? `ss -tlnp | grep <port>`.
5. **Network mode**: with `--network host` there is no `-p` mapping; with `--network none` nothing works. Container-to-container calls should use the container name on a user-defined network, not `localhost`.
6. **Host firewall / iptables**: `ufw`, `firewalld`, or iptables DOCKER chain rules.
7. **Cloud layer**: Security Group / NACL inbound rule for the host port, load balancer target health.
8. **Logs**: `docker logs` - maybe the app failed to start its listener.

**Example:**

```text
docker ps --format "table {{.Names}}\t{{.Ports}}"
# api   3000/tcp            <- NOT published (no 0.0.0.0:8080->3000/tcp)
docker port api
docker exec api ss -tlnp
# LISTEN 0 511 127.0.0.1:3000   <- bound to loopback only, must be 0.0.0.0
curl -v http://localhost:8080/health
nc -zv <server-ip> 8080
sudo iptables -t nat -L DOCKER -n | grep 8080

docker run -d --name api -p 8080:3000 -e HOST=0.0.0.0 myorg/api:1.4.2
```

:::say
I go inside out - check the app is listening inside the container and bound to 0.0.0.0 rather than 127.0.0.1, confirm the port is actually published with docker port and maps to the right container port, test with curl and nc from the host, and then check the host firewall and cloud security group. The two most common causes are a loopback bind and a missing or mismatched -p mapping.
:::
