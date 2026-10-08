---
track: qbank
title: "Docker and containers: Basic questions"
short: Docker basic
sub: 10 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## How do containerisation technologies like Docker and Kubernetes simplify application deployment and management?

<!-- source: 02 Q2 -->

*Also asked as:* What is the difference between Docker and Kubernetes, and how do they complement each other in production?

:::note In simple words
Shipping containers made global trade easy because every crane and ship handles the same box shape. Docker puts every app in the same "box", and Kubernetes is the port that stacks, moves and replaces those boxes automatically.
:::

**Docker solves "it works on my machine":**

- App + dependencies are packed into one image, so dev, test and prod run exactly the same thing.
- Starts in seconds (no full OS boot like a VM), uses fewer resources.
- Versioned images (`app:1.4.2`) make rollback as simple as running the old tag.

**Kubernetes solves "running many containers on many servers":**

- Scheduling: decides which node each container runs on.
- Self-healing: restarts crashed containers, replaces pods on failed nodes.
- Scaling: HPA adds or removes pods based on load.
- Rolling updates and rollbacks with zero downtime.
- Service discovery and load balancing via Services and Ingress.

**Docker vs Kubernetes - not competitors, they complement each other:**

| Point | Docker | Kubernetes |
| --- | --- | --- |
| Job | Build images and run containers | Orchestrate containers across many nodes |
| Scope | One host | A cluster of many nodes |
| Failure handling | Restart policy on that host only | Reschedules pods to healthy nodes |
| Scaling | Manual (`docker run` more copies) | HPA / Cluster Autoscaler, declarative replicas |
| Networking | Bridge networks, `-p` port mapping | Services, DNS, Ingress, NetworkPolicy |
| Updates | Stop old, start new yourself | Rolling updates and rollback built in |

**Runtime detail interviewers like:** Kubernetes no longer talks to the Docker daemon - the dockershim was removed in Kubernetes 1.24, so nodes use a CRI runtime such as **containerd** or **CRI-O**. Docker-built images are standard **OCI images**, so they still run unchanged. In practice: Docker (or buildx) builds and pushes the image in CI, Kubernetes runs it in production.

**Example:**

```bash
# Docker: package once
docker build -t myorg/orders:1.4.2 .
docker push myorg/orders:1.4.2

# Kubernetes: run 3 copies, update, roll back
kubectl create deployment orders --image=myorg/orders:1.4.2 --replicas=3
kubectl set image deployment/orders orders=myorg/orders:1.4.3
kubectl rollout undo deployment/orders
```

:::say
Docker gives a consistent, portable, versioned package so the same artifact runs everywhere. Kubernetes then orchestrates those containers at scale - scheduling, self-healing, autoscaling, rolling updates and service discovery - so we manage desired state instead of individual servers. Since Kubernetes 1.24 nodes run containers through containerd or CRI-O rather than the Docker daemon, but Docker-built OCI images run unchanged, so Docker builds in CI and Kubernetes runs in production.
:::

## In a Dockerfile, what is the practical difference between COPY and ADD? When would you prefer one over the other?

<!-- source: 02 Q6 -->

:::note In simple words
COPY is a plain photocopy. ADD is a photocopy machine with extra tricks - it can unzip boxes and fetch things from the internet. Extra tricks mean surprises, so use the plain one unless you need the trick.
:::

| Point | COPY | ADD |
| --- | --- | --- |
| Copy local files/folders | Yes | Yes |
| Auto-extract local tar (.tar, .tar.gz) | No | Yes |
| Download from URL | No | Yes (not auto-extracted) |
| Predictability | High | Lower (magic behaviour) |
| Best practice | Default choice | Only for local tar extraction |

- Prefer **COPY** - clear and predictable, recommended by Docker.
- Use **ADD** only when you want a local tarball unpacked into the image.
- Instead of `ADD <url>`, use `RUN curl ... && verify checksum && extract && cleanup` in one layer, so the downloaded archive does not bloat the image and you can verify it.

**Example:**

```dockerfile
COPY package.json ./                 # simple copy
COPY --chown=node:node src/ ./src/   # copy with ownership
ADD rootfs.tar.gz /                  # auto-extracts into /
RUN curl -fsSL -o /tmp/tool.tgz https://example.com/tool.tgz \
 && tar -xzf /tmp/tool.tgz -C /usr/local/bin \
 && rm /tmp/tool.tgz
```

:::say
COPY just copies local files; ADD also extracts local tar archives and can fetch URLs. I use COPY by default and ADD only for local tar extraction; for remote files I use curl in a RUN step so I can verify and clean up in the same layer.
:::

## How does Docker networking work?

<!-- source: 02 Q7 -->

:::note In simple words
Docker builds a small private office network on your server. Containers on the same office network can call each other by name; to let outsiders in, you open a door (publish a port) on the building.
:::

Docker creates virtual networks using Linux network namespaces, virtual ethernet pairs (veth) and iptables rules.

Network drivers:

- **bridge** (default) - private network on the host (`docker0`, 172.17.0.0/16). Containers get private IPs; outbound traffic is NATed through the host.
- **user-defined bridge** - same as bridge but with built-in DNS, so containers reach each other by container name. Recommended for multi-container apps.
- **host** - container shares the host network stack directly; no isolation, no port mapping, fastest.
- **none** - no networking.
- **overlay** - spans multiple hosts (Docker Swarm).
- **macvlan** - container gets its own MAC/IP on the physical LAN.

Port publishing `-p 8080:80` adds a NAT rule: host port 8080 -> container port 80.

**Example:**

```bash
docker network create appnet
docker run -d --name db  --network appnet -e POSTGRES_PASSWORD=secret postgres:16
docker run -d --name api --network appnet -p 8080:3000 myorg/api:1.0
# inside api, the DB is reachable as host "db" on port 5432
docker exec api getent hosts db
docker network inspect appnet
```

:::say
By default containers join a bridge network with private IPs and NAT to the outside; publishing a port with -p maps a host port to the container. For multi-container apps I use a user-defined bridge so containers find each other by name through Docker's embedded DNS, and there are host, none, overlay and macvlan drivers for other cases.
:::

## What is a multi-stage Docker build, why is it used, and what is its advantage over a single-stage build?

<!-- source: 02 Q8 -->

:::note In simple words
You build furniture in a workshop full of saws and glue, but you only deliver the finished table to the customer - not the whole workshop. Multi-stage builds ship only the finished product.
:::

A multi-stage Dockerfile has more than one `FROM`. Early stages have compilers, build tools and dev dependencies; the final stage copies only the built output with `COPY --from=<stage>`.

Advantages over single-stage:

- **Much smaller images** (for example 1.1 GB -> 150 MB), so faster pulls, faster scaling, less registry cost.
- **Better security** - no compilers, package managers, source code or build secrets in the final image, so fewer CVEs and smaller attack surface.
- **One Dockerfile** replaces separate "build" and "runtime" Dockerfiles or shell scripts.
- **Better caching** - stages build in parallel with BuildKit and unused stages are skipped.
- Can target a stage for testing: `docker build --target test .`

**Example:**

```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app

FROM gcr.io/distroless/static-debian12
COPY --from=build /app /app
ENTRYPOINT ["/app"]
# final image ~10 MB instead of ~900 MB
```

:::say
A multi-stage build uses several FROM stages - a heavy build stage and a minimal runtime stage - and copies only the compiled artifact forward. That gives much smaller, more secure images with no build tools or source inside, all from a single Dockerfile.
:::

## What are the stages or steps of a Docker image build? Explain build context, layers and cache.

<!-- source: 02 Q9 -->

:::note In simple words
You hand the chef a box of ingredients (build context), the chef follows the recipe line by line (instructions), puts each finished step on its own tray (layer), and remembers trays already made so it does not redo them next time (cache).
:::

What happens when you run `docker build -t app:1.0 .`:

1. **Build context is sent** - the `.` folder (minus `.dockerignore` entries) is packed and sent to the Docker daemon / BuildKit. A huge context = slow builds.
2. **Dockerfile is parsed** - `FROM` pulls the base image if not present.
3. **Each instruction runs in order** - `RUN`, `COPY`, `ADD` each produce a new read-only **layer** (a filesystem diff). `ENV`, `CMD`, `EXPOSE`, `LABEL` only change metadata.
4. **Cache check per step** - if the instruction text (and for COPY/ADD, the file checksums) is identical to a previous build, Docker reuses the cached layer. The first step that changes invalidates the cache for **every step after it**.
5. **Image is assembled** - layers stacked + config (entrypoint, env, labels) -> image ID, then tagged.
6. **Push (optional)** - only layers the registry does not already have are uploaded.

That is why you copy dependency files and install them before copying source code.

**Example:**

```bash
docker build --progress=plain -t app:1.0 .
#  => [internal] load build context         transferring context: 2.1MB
#  => [2/5] WORKDIR /app                     CACHED
#  => [3/5] COPY package*.json ./            CACHED
#  => [4/5] RUN npm ci                       CACHED
#  => [5/5] COPY . .                         0.3s   <- only this step reran
docker history app:1.0
```

:::say
The build sends the context to the daemon, pulls the base image, then executes each instruction in order, with RUN, COPY and ADD each creating a cached layer. Once a step changes, all later steps rebuild, so I order the Dockerfile from least to most frequently changing and keep the context small with .dockerignore.
:::

## How do you pass environment variables during docker build? What is the difference between ARG and ENV, and how do you handle secrets at build time?

<!-- source: 02 Q11 -->

:::note In simple words
ARG is a sticky note you use only while cooking and then throw away. ENV is a label printed on the final box that everyone who opens it can read. Secrets should be neither - they are handed over through a private window and never stored.
:::

| Point | ARG | ENV |
| --- | --- | --- |
| Available during build | Yes | Yes |
| Available in running container | No | Yes |
| Set from CLI | `--build-arg NAME=val` | `-e NAME=val` at `docker run` |
| Stored in image | Value visible in `docker history` | Stored in image config |
| Good for | Versions, build flags | Runtime config (`NODE_ENV`, `PORT`) |

- An `ARG` declared before `FROM` is only usable in `FROM`; redeclare it after `FROM` to use it in steps.
- To make a build arg available at runtime: `ENV APP_VERSION=$APP_VERSION`.
- **Never pass secrets with ARG or ENV** - they end up in history or config. Use BuildKit secrets: the secret is mounted only for that one RUN step and never written into a layer.

**Example:**

```
# syntax=docker/dockerfile:1
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
```

```bash
docker build \
  --build-arg NODE_VERSION=20 --build-arg APP_VERSION=1.4.2 \
  --secret id=npmrc,src=$HOME/.npmrc \
  -t app:1.4.2 .
docker run -e PORT=8080 app:1.4.2
```

:::say
ARG is a build-time-only variable passed with --build-arg, ENV is baked into the image and available at runtime, and I can copy an ARG into an ENV if the app needs it. Secrets never go through either - I use BuildKit --secret mounts so they exist only during that RUN step and never land in a layer.
:::

## Which container registry do you use, and how do you choose one?

<!-- source: 02 Q12 -->

:::note In simple words
A registry is the warehouse where finished image boxes are stored and picked up from. You pick the warehouse closest to your trucks, with good locks and a clean-out policy.
:::

Common options:

| Registry | Best when | Notes |
| --- | --- | --- |
| **AWS ECR** | Workloads on AWS (EKS, ECS, EC2) | IAM auth, private, scan on push, lifecycle policies, cross-region replication |
| **Docker Hub** | Public/open-source images | Pull rate limits for anonymous/free users |
| **GHCR** (GitHub) | Code and CI on GitHub | Auth with GITHUB_TOKEN, per-repo permissions |
| **GCP Artifact Registry / Azure ACR** | GCP / Azure workloads | Same idea as ECR in their cloud |
| **Harbor / Nexus / JFrog** | Self-hosted, on-prem, multi-cloud | Built-in scanning, replication, RBAC |

Selection criteria: close to the runtime (fast, no egress cost), IAM/SSO integration, private by default, vulnerability scanning, immutable tags, retention policies, replication for DR.

Typical answer for an AWS shop: **ECR** for private app images, with a pull-through cache for Docker Hub base images to avoid rate limits.

**Example:**

```bash
aws ecr create-repository --repository-name orders \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true
aws ecr get-login-password | docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-south-1.amazonaws.com
docker push 123456789012.dkr.ecr.ap-south-1.amazonaws.com/orders:1.4.2
```

:::say
We run on AWS, so we use private ECR repositories - one per service - with IAM-based auth, immutable tags, scan on push and lifecycle policies. Docker Hub is only for public base images, ideally through an ECR pull-through cache to avoid rate limits.
:::

## What are Docker labels and why would you use them?

<!-- source: 02 Q13 -->

:::note In simple words
Labels are sticky tags on a box - "made on this date, by this team, from this code version". They don't change what is inside, but make boxes easy to find, sort and audit.
:::

- A label is a key-value metadata pair on an image, container, volume or network.
- Set in the Dockerfile with `LABEL`, or at runtime with `docker run --label`.
- **Traceability** - git commit, build number, version, source repo (standard OCI keys like `org.opencontainers.image.revision`).
- **Ownership** - team, contact, cost centre.
- **Filtering and cleanup** - `docker ps --filter label=...`, prune only certain images.
- **Tool config** - Traefik routing rules, Prometheus/log shipper discovery, Watchtower.
- Labels do not affect runtime behaviour and are not for secrets.

**Example:**

```
ARG GIT_SHA
LABEL org.opencontainers.image.source="https://github.com/myorg/orders" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="1.4.2" \
      team="payments"
```

```bash
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t orders:1.4.2 .
docker inspect orders:1.4.2 --format '{{json .Config.Labels}}'
docker ps --filter "label=team=payments"
docker image prune -a --filter "label=env=dev"
```

:::say
Labels are key-value metadata on images and containers. I use them to record the git SHA, version and owning team for traceability, to filter and clean up resources, and for tools like Traefik or monitoring agents that discover containers by label.
:::

## What is Docker Swarm and how is it different from Kubernetes?

<!-- source: 02 Q15 -->

:::note In simple words
Both are managers for a fleet of containers. Swarm is a small, simple family-run bus company - easy to start, fewer rules. Kubernetes is a big city transport authority - more setup, but it handles huge scale, many routes and every kind of emergency.
:::

- **Docker Swarm** is Docker's built-in orchestrator. `docker swarm init` turns Docker hosts into a cluster of manager and worker nodes; you deploy **services** (with replicas) and **stacks** (Compose files) and Swarm keeps them running, load-balances them and does rolling updates.
- **Kubernetes** is a separate, much richer orchestration platform (API server, etcd, scheduler, controllers) and is the industry standard, with managed versions like EKS, GKE and AKS.

| Point | Docker Swarm | Kubernetes |
| --- | --- | --- |
| Setup | One command, built into Docker | More components; usually managed (EKS/GKE/AKS) |
| Learning curve | Low - uses Compose files | Steep - many object types |
| Unit of deployment | Service / task | Pod, Deployment, StatefulSet, etc. |
| Autoscaling | No built-in autoscaling | HPA, VPA, Cluster Autoscaler, KEDA |
| Networking | Overlay network + routing mesh | CNI plugins, Services, Ingress, NetworkPolicy |
| Storage | Basic volumes | PV/PVC, StorageClasses, CSI drivers |
| Config and secrets | Docker configs and secrets | ConfigMaps, Secrets, external secret operators |
| Ecosystem | Small, limited active development | Huge: Helm, Argo CD, Prometheus, service mesh |
| Best for | Small teams, simple apps, few hosts | Production at scale, microservices, multi-team |

**Example:**

```bash
docker swarm init --advertise-addr 10.0.1.10
docker swarm join-token worker            # command to run on worker nodes
docker service create --name web --replicas 3 -p 80:80 nginx:1.27
docker service scale web=5
docker service update --image nginx:1.27.1 --update-order start-first web
docker stack deploy -c docker-compose.yml shop
```

:::say
Docker Swarm is Docker's native orchestrator - very easy to set up and uses Compose files, but it has no built-in autoscaling and a small ecosystem. Kubernetes needs more setup but gives autoscaling, rich networking and storage, RBAC and a huge ecosystem, which is why production microservice platforms standardise on it.
:::

## What are the common Docker commands you use daily?

<!-- source: 02 Q16 -->

:::note In simple words
Like a mechanic's most-used tools on the belt - a small set of commands covers 90 percent of daily work: build, run, look inside, read logs, clean up.
:::

| Group | Command | What it does |
| --- | --- | --- |
| Images | `docker build -t app:1.0 .` | Build an image from a Dockerfile |
| Images | `docker images` | List local images |
| Images | `docker pull` / `docker push` | Download / upload an image |
| Images | `docker tag app:1.0 $REG/app:1.0` | Add a registry tag |
| Images | `docker history app:1.0` | Show layers and their sizes |
| Containers | `docker run -d --name web -p 8080:80 nginx` | Start a container |
| Containers | `docker ps` / `docker ps -a` | Running / all containers |
| Containers | `docker stop` / `start` / `restart web` | Control lifecycle |
| Containers | `docker rm -f web` | Remove a container |
| Debug | `docker logs -f --tail 100 web` | Follow logs |
| Debug | `docker exec -it web sh` | Shell inside a running container |
| Debug | `docker inspect web` | Full JSON: exit code, IP, mounts, env |
| Debug | `docker stats` / `docker top web` | Live CPU and memory / processes |
| Debug | `docker events` | Real-time daemon events (die, oom) |
| Cleanup | `docker system df` | Disk usage by Docker |
| Cleanup | `docker system prune` | Remove stopped containers, dangling images, unused networks |
| Cleanup | `docker image prune -a` / `docker builder prune` | Unused images / build cache |
| Networks | `docker network ls` / `docker network create appnet` | List / create networks |
| Networks | `docker network inspect appnet` | Which containers and IPs are on it |
| Volumes | `docker volume ls` / `docker volume create data` | List / create volumes |
| Volumes | `docker volume inspect data` | Mountpoint on the host |
| Compose | `docker compose up -d` / `docker compose down` | Start / stop a multi-container stack |
| Compose | `docker compose ps` / `docker compose logs -f api` | Status / logs for a service |
| Compose | `docker compose build` / `docker compose pull` | Rebuild / pull service images |

**Example:**

```bash
docker build -t myorg/api:1.4.2 .
docker run -d --name api --network appnet -p 8080:3000 myorg/api:1.4.2
docker logs -f --tail 50 api
docker exec -it api sh
docker inspect api --format '{{.State.Status}} {{.State.ExitCode}}'
docker system df && docker image prune -a -f --filter "until=168h"
```

:::say
Day to day I use docker build, tag and push for images; run, ps, stop and rm for containers; logs, exec, inspect, stats and events for debugging; system df and prune for cleanup; plus docker compose up, logs and down for multi-container stacks.
:::
