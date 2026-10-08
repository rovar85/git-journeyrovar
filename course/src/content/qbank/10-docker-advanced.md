---
track: qbank
title: "Docker and containers: Advanced questions"
short: Docker advanced
sub: 13 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Write a sample multi-stage Dockerfile you would actually use in a real project (Node.js app).

<!-- source: 02 Q18 -->

:::note In simple words
Stage 1 installs everything and builds the app, stage 2 keeps only production packages, and the last stage is a clean, small box with just what is needed to run.
:::

Real-project points shown below:

- Pin base image versions, never `latest`.
- Copy `package*.json` first so `npm ci` is cached unless dependencies change.
- Separate build stage (dev dependencies, TypeScript compile) from runtime.
- Runtime runs as non-root `node` user, with `NODE_ENV=production`.
- Exec form CMD so SIGTERM reaches Node for graceful shutdown.
- A `.dockerignore` keeps `node_modules`, `.git` and `.env` out of the build context.

**Example:**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

```
# .dockerignore
node_modules
.git
.env
*.log
coverage
```

:::say
I use a deps stage to cache npm ci, a build stage that compiles and prunes dev dependencies, and a slim alpine runtime stage that copies only dist and production node_modules, runs as the non-root node user and uses exec-form CMD. Combined with a .dockerignore, this typically cuts the image by 60-80 percent.
:::

## Create a Dockerfile for running a database container (MySQL or PostgreSQL).

<!-- source: 02 Q19 -->

:::note In simple words
The official database image is a ready-made kitchen. You just add your own recipe book (init scripts) and settings, and keep the food (data) in a separate fridge (volume) so it survives if the kitchen is rebuilt.
:::

Key points:

- Build on the official image (`postgres:16`, `mysql:8.4`) - do not install a DB from scratch.
- Scripts placed in `/docker-entrypoint-initdb.d/` run **only on first start** when the data directory is empty.
- Never bake passwords into the image; pass them at runtime (env var, or better `*_FILE` pointing to a secret file).
- Always mount a **volume** for the data directory, otherwise data is lost when the container is removed.
- Add a healthcheck so dependent services wait until the DB is ready.

**Example:**

```dockerfile
FROM postgres:16-alpine
ENV POSTGRES_DB=appdb \
    POSTGRES_USER=appuser
COPY init/01-schema.sql /docker-entrypoint-initdb.d/
COPY config/postgresql.conf /etc/postgresql/postgresql.conf
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD pg_isready -U appuser -d appdb || exit 1
EXPOSE 5432
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
```

```bash
docker build -t mydb:1.0 .
docker run -d --name db \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/db_pass \
  -v /secure/db_pass:/run/secrets/db_pass:ro \
  -v pgdata:/var/lib/postgresql/data \
  -p 5432:5432 mydb:1.0
```

:::say
I extend the official Postgres or MySQL image, add init SQL into docker-entrypoint-initdb.d, a custom config and a pg_isready healthcheck, and pass the password at runtime via a secret file rather than baking it in. Data always goes to a named volume; in production I would still prefer a managed DB like RDS.
:::

## Write a Dockerfile for a monitoring tool like Nagios.

<!-- source: 02 Q20 -->

:::note In simple words
Take a clean Ubuntu box, install the Nagios package and its web server from the official package store, add your own list of servers to watch, open the web page door (port 80), and add a self-check so Docker knows it is alive.
:::

Design points:

- Build on a pinned OS base (`ubuntu:24.04`) and install `nagios4` from the distro repository - no compiling from source. (For a quick start, the widely used community image `jasonrivers/nagios` is an alternative.)
- Nagios Core has two parts: the **nagios4 daemon** (runs the checks) and the **web UI** (Apache + CGI). The container starts both: Nagios in the background, Apache in the foreground as the main process.
- Host and service definitions go into `/etc/nagios4/conf.d/` - copy them in, or better, mount them so config changes do not need a rebuild.
- Volumes for state and logs (`/var/lib/nagios4`, `/var/log/nagios4`).
- The web login password comes from a runtime secret, never baked into the image.
- Validate the config at startup (`nagios4 -v`) so a bad config fails fast.

**Example:**

```dockerfile
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends nagios4 monitoring-plugins \
      apache2 apache2-utils curl procps \
 && a2enmod cgi rewrite \
 && rm -rf /var/lib/apt/lists/*
COPY conf.d/ /etc/nagios4/conf.d/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
VOLUME ["/var/lib/nagios4", "/var/log/nagios4"]
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD pgrep -x nagios4 >/dev/null && curl -s -o /dev/null http://localhost/nagios4/ || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
```

```bash
#!/bin/sh
# docker-entrypoint.sh
set -e
if [ -f /run/secrets/nagios_pass ]; then
  htpasswd -bc /etc/nagios4/htpasswd.users nagiosadmin "$(cat /run/secrets/nagios_pass)"
fi
/usr/sbin/nagios4 -v /etc/nagios4/nagios.cfg      # fail fast on bad config
/usr/sbin/nagios4 -d /etc/nagios4/nagios.cfg      # daemon in background
exec apachectl -D FOREGROUND                      # web UI as the main process
```

```text
docker build -t mynagios:1.0 .
docker run -d --name nagios -p 8080:80 \
  -v $PWD/conf.d:/etc/nagios4/conf.d:ro \
  -v nagios-data:/var/lib/nagios4 \
  -v /secure/nagios_pass:/run/secrets/nagios_pass:ro mynagios:1.0
# UI: http://<host>:8080/nagios4/
```

:::say
I base it on a pinned Ubuntu image, install nagios4 with Apache from the distro repo, copy or mount the host and service definitions into conf.d, expose port 80 and add a healthcheck that confirms both the daemon and the web UI. An entrypoint script validates the config, starts Nagios in the background and runs Apache in the foreground, with the admin password injected at runtime.
:::

## Besides multi-stage builds and slim base images, how else can you reduce Docker image size?

<!-- source: 02 Q21 -->

*Also asked as:* How do you optimize a Docker image for production?

:::note In simple words
Packing a suitcase: don't pack what you won't use, throw away the packaging, and don't leave the rubbish inside the bag.
:::

1. **`.dockerignore`** - exclude `.git`, `node_modules`, test data, logs, local builds.
2. **Clean up in the same RUN layer** - files deleted in a later layer still exist in the earlier layer.
3. **Skip extras** - `apt-get install --no-install-recommends`, `pip install --no-cache-dir`, `apk add --no-cache`, `npm ci --omit=dev`.
4. **Combine RUN steps** to reduce layers and leftover caches.
5. **Distroless or scratch** final images for compiled apps.
6. **Remove build secrets and caches** - use BuildKit `--mount=type=cache` so caches never land in the image.
7. **Copy only the needed artifact**, not the whole repo.
8. **Analyse layers** with `docker history` and the `dive` tool to find big layers.
9. **Strip binaries / static linking** (Go `-ldflags="-s -w"`).
10. **Squash / fewer COPY of large assets**; serve big static files from S3/CDN instead of the image.

**Example:**

```dockerfile
# BAD - cache stays in an earlier layer
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# GOOD - one layer, cleaned up
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
```

```bash
docker history --no-trunc myapp:1.0 | head
dive myapp:1.0
```

:::say
Beyond multi-stage and slim bases, I use a strict .dockerignore, install with no-recommends and no-cache flags, clean up in the same RUN layer, use distroless or scratch where possible and copy only the final artifact. Then I verify with docker history or dive to find any fat layer.
:::

## How do you manage and push Docker images when you have multiple services?

<!-- source: 02 Q22 -->

*Also asked as:* How do you connect Jenkins and push Docker images to AWS ECR (Docker side)?

:::note In simple words
Like a warehouse where every product has its own shelf (repository) and every batch gets a unique label (tag), so you always know exactly which version is shipped where.
:::

- **One repository per service** in the registry (ECR): `orders`, `payments`, `users`.
- **Immutable, traceable tags**: git commit SHA and/or semantic version (`1.4.2`, `sha-3f9c1ab`). Avoid relying on `latest` in prod. Turn on ECR tag immutability.
- **Build once, promote everywhere** - the same image digest moves dev -> staging -> prod; only config changes.
- **CI loops** over changed services only (monorepo path filters) and builds them in parallel.
- **Authenticate with short-lived tokens** (`aws ecr get-login-password` using an IAM role) - no static keys.
- **Scan on push** (ECR scanning or Trivy in CI) and add lifecycle policies to clean old images.
- Use `docker buildx` for multi-arch (amd64/arm64) when needed.

**Example:**

```
ACCOUNT=123456789012; REGION=ap-south-1
REG=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com
TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REG

for svc in orders payments users; do
  docker build -t $REG/$svc:$TAG -t $REG/$svc:1.4.2 ./services/$svc
  docker push $REG/$svc:$TAG
  docker push $REG/$svc:1.4.2
done
```

:::say
Each service gets its own ECR repository and every build is tagged with the git SHA plus a version, with tag immutability on. CI builds only changed services, logs in with short-lived tokens from an IAM role, scans on push and promotes the same image digest across environments.
:::

## Do you have an archival or cleanup process for Docker images in AWS ECR?

<!-- source: 02 Q23 -->

:::note In simple words
A cupboard that throws out old clothes automatically - keep the last few outfits and the special ones, bin the rest - so it never overflows or costs more rent.
:::

Yes - with **ECR lifecycle policies**. Rules are evaluated by priority and expire images automatically.

Typical policy:

- Keep the last N (for example 20) release-tagged images (`v*` or `prod-*`).
- Delete untagged images (left behind when a tag moves) after 1-7 days.
- Delete dev/feature-branch images older than 14-30 days.

Also:

- Use **tag immutability** so a tag cannot be silently overwritten.
- For long-term audit needs, keep release images in a separate "archive" repository (or replicate to another region/account) with a longer retention rule.
- Test with the lifecycle policy **preview** before applying.
- Clean up locally on build agents too: `docker image prune -a --filter "until=168h"`.

**Example:**

```json
{
  "rules": [
    { "rulePriority": 1, "description": "Keep last 20 releases",
      "selection": { "tagStatus": "tagged", "tagPrefixList": ["v"],
                     "countType": "imageCountMoreThan", "countNumber": 20 },
      "action": { "type": "expire" } },
    { "rulePriority": 2, "description": "Expire untagged after 7 days",
      "selection": { "tagStatus": "untagged", "countType": "sinceImagePushed",
                     "countUnit": "days", "countNumber": 7 },
      "action": { "type": "expire" } }
  ]
}
```

```bash
aws ecr put-lifecycle-policy --repository-name orders \
  --lifecycle-policy-text file://policy.json
```

:::say
Yes, we use ECR lifecycle policies - keep the last 20 release tags, expire untagged images after a week and feature-branch images after a few weeks - with tag immutability enabled. Anything that must be kept long-term goes to a separate archive repository with its own retention.
:::

## How do you secure Docker containers and images?

<!-- source: 02 Q24 -->

*Also asked as:* Container security - non-root, distroless, read-only filesystems. How do you optimize (harden) a Docker image for production? / What type of Docker images should be used in production?

:::note In simple words
Lock the house (non-root, read-only), keep few doors and windows (minimal image), and have an inspector check it for known weak locks before anyone moves in (image scanning).
:::

Build time:

- Minimal, pinned base images (distroless, alpine, slim), ideally pinned by digest.
- **Scan images** in CI and at the registry (details in the image-scanning question below).
- No secrets in images or layers (use BuildKit `--mount=type=secret`).
- Lint Dockerfiles with `hadolint`; sign images (cosign) and generate an SBOM.

Run time:

- Run as **non-root** (`USER 1000`).
- **Read-only root filesystem**, with tmpfs for scratch folders.
- Drop Linux capabilities (`--cap-drop ALL`), `--security-opt no-new-privileges`.
- Never use `--privileged` or mount `/var/run/docker.sock` into app containers.
- Set CPU/memory limits; keep Docker engine and host patched.

**Example:**

```
trivy image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed myapp:1.0
grype myapp:1.0 --fail-on high

docker run -d --name api \
  --user 1000:1000 --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 1 myapp:1.0
```

**Which images to use in production:**

- Start from **official, verified-publisher, or an internal golden base image**, never random images from Docker Hub.
- Keep it **minimal:** distroless, `-slim`, alpine (watch musl compatibility) or Ubuntu chiseled. Fewer packages means fewer CVEs and a smaller attack surface.
- **Pin versions:** `node:20.11-slim@sha256:...`, never `latest`, so builds are reproducible.
- Use **multi-stage builds** so compilers and build tools stay out of the final image.
- Run as **non-root**, with no secrets baked in, scanned (Trivy) and signed (cosign), with an SBOM and provenance labels.
- **Rebuild regularly** (for example weekly) so base-image security patches get in, even when the code didn't change.

:::say
I use minimal pinned images, scan every build with Trivy and fail the pipeline on fixable high or critical CVEs, and keep secrets out of layers. At runtime containers run as non-root with a read-only filesystem, dropped capabilities, no-new-privileges and resource limits - never privileged.
:::

## How do you pass database credentials (or other secrets) to a containerised application securely?

<!-- source: 02 Q25 -->

:::note In simple words
Don't write the house key on the front door (the image). Hand it to the person only when they arrive, from a locked key box (secrets manager).
:::

What NOT to do:

- Hardcode in code, `ENV` in the Dockerfile, or `ARG` (visible in `docker history`).
- Commit `.env` files to git.

Better options, from okay to best:

1. **Runtime env vars** from a protected source (`--env-file` not in git). Simple, but visible in `docker inspect`.
2. **Secret files mounted read-only** (Docker secrets, Compose secrets, Kubernetes Secrets as volumes) and use `*_FILE` variables.
3. **External secret manager** - AWS Secrets Manager / SSM Parameter Store / Vault. The app (or an init step) fetches the secret at startup using its IAM role, so no long-lived credentials exist anywhere. Supports rotation.
4. In Kubernetes: External Secrets Operator or Secrets Store CSI driver syncing from Secrets Manager.
5. For build-time secrets (private package tokens) use BuildKit `--mount=type=secret` so they never land in a layer.

**Example:**

```
# Docker Compose secret mounted as a file
services:
  app:
    image: myorg/app:1.0
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
secrets:
  db_password:
    file: ./secrets/db_password.txt   # not committed to git
```

```bash
# Fetch from AWS Secrets Manager at startup using the instance/task IAM role
export DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id prod/app/db --query SecretString --output text | jq -r .password)
```

:::say
I never bake credentials into the image or git. In production the secret lives in AWS Secrets Manager or Vault and is injected at runtime - fetched via the workload's IAM role or mounted as a read-only file - which also enables rotation without rebuilding the image.
:::

## How do you scan Docker images for vulnerabilities, both during the build and at the registry level?

<!-- source: 02 Q26 -->

*Also asked as:* What methods do you use to check container vulnerabilities? Scanning with Trivy or Grype.

:::note In simple words
Two checkpoints - a security check at the factory gate before the box leaves (CI scan), and a warehouse inspector who keeps re-checking stored boxes as new weaknesses are discovered (registry scan).
:::

**1. During the build (CI gate - shift left):**

- Run **Trivy**, **Grype** or **Docker Scout** right after `docker build`, before `docker push`.
- Fail the pipeline on **CRITICAL/HIGH fixable** CVEs (`--ignore-unfixed` avoids blocking on issues with no patch).
- Also scan the Dockerfile/IaC for misconfig (`trivy config`, `hadolint`) and generate an SBOM.
- Keep a reviewed `.trivyignore` with expiry dates for accepted risks.

**2. At the registry (continuous):**

- **ECR basic scanning** - scan on push (Clair-based CVE database).
- **ECR enhanced scanning** via **Amazon Inspector** - continuous re-scanning when new CVEs are published, OS + language packages, findings to Security Hub/EventBridge -> alerts.
- Docker Hub / Harbor / GHCR offer similar scanning.

**3. At deploy/runtime:** admission policy (Kyverno/OPA) to block unscanned or unsigned images; rebuild base images regularly to pick up patches.

**Example:**

```bash
docker build -t $REG/orders:$TAG .
trivy image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 $REG/orders:$TAG
grype $REG/orders:$TAG --fail-on critical
docker scout cves $REG/orders:$TAG --only-severity critical,high
docker push $REG/orders:$TAG

aws ecr put-registry-scanning-configuration --scan-type ENHANCED \
  --rules '[{"scanFrequency":"CONTINUOUS_SCAN","repositoryFilters":[{"filter":"*","filterType":"WILDCARD"}]}]'
aws ecr describe-image-scan-findings --repository-name orders --image-id imageTag=$TAG
```

:::say
I scan twice - in CI with Trivy or Grype right after the build, failing the pipeline on fixable critical and high CVEs before the image is pushed, and in the registry with ECR enhanced scanning through Inspector, which keeps re-scanning stored images as new CVEs appear and raises alerts. Base images are rebuilt regularly so fixes actually land.
:::

## How do you monitor Docker containers in production?

<!-- source: 02 Q27 -->

:::note In simple words
Give every container a fitness tracker (metrics), a diary that is collected centrally (logs), and a heartbeat check (health check), then set alarms when something looks wrong.
:::

- **Metrics**: **cAdvisor** exposes per-container CPU, memory, network, disk I/O; **node-exporter** for the host; **Prometheus** scrapes both; **Grafana** dashboards. `docker stats` for a quick live view.
- **Logs**: containers log to stdout/stderr; a **log driver** (json-file with rotation, awslogs, fluentd) or an agent like **Fluent Bit / Promtail** ships them to Loki, ELK or CloudWatch.
- **Health**: `HEALTHCHECK` in the Dockerfile -> status shows `healthy/unhealthy`; external uptime checks on the endpoint.
- **Events**: `docker events` for die/oom/restart.
- **Alerts** (Alertmanager -> Teams/Slack/pager): container down, restart count increasing, OOM kills, memory near limit, CPU throttling, unhealthy status, host disk above 80 percent.

**Example:**

```bash
docker run -d --name cadvisor -p 8081:8080 \
  -v /:/rootfs:ro -v /var/run:/var/run:ro -v /sys:/sys:ro \
  -v /var/lib/docker/:/var/lib/docker:ro gcr.io/cadvisor/cadvisor:v0.49.1
```

```
# Prometheus alert: container memory above 90 percent of its limit
- alert: ContainerMemoryHigh
  expr: container_memory_working_set_bytes{name!=""}
        / container_spec_memory_limit_bytes{name!=""} > 0.9
  for: 5m
  labels: { severity: warning }
```

:::say
I use cAdvisor and node-exporter scraped by Prometheus with Grafana dashboards for metrics, Fluent Bit or Promtail shipping stdout logs to Loki or CloudWatch, and Dockerfile HEALTHCHECKs. Alertmanager notifies on container down, rising restart count, OOM kills, memory near limit and host disk usage.
:::

## How do you handle logging for containers running in production?

<!-- source: 02 Q28 -->

:::note In simple words
Every container just talks out loud (stdout). Docker writes it into a notebook that is torn out and replaced when full (rotation), and a courier (Fluent Bit) carries copies to a central library (Loki/ELK/CloudWatch) where anyone can search them - but nobody should ever say passwords out loud.
:::

**1. Log to stdout/stderr, not files inside the container.** Docker captures both streams; files inside the container are lost with it and fill the writable layer.

**2. Pick a logging driver:**

| Driver | Where logs go | Note |
| --- | --- | --- |
| `json-file` | Local JSON files (default) | No rotation unless configured |
| `local` | Local, compressed, rotated by default | Good default for single hosts |
| `journald` | systemd journal | `journalctl CONTAINER_NAME=api` |
| `awslogs` | CloudWatch Logs | Needs IAM role on the host |
| `fluentd` | Fluentd / Fluent Bit endpoint | Central pipelines |
| `gelf` | Graylog / Logstash | UDP or TCP |

`docker logs` works directly with json-file, local and journald; for remote drivers Docker keeps a local dual-logging cache (Docker 20.10+).

**3. Rotate logs** - default json-file grows forever and can fill `/var/lib/docker`. Set `max-size` and `max-file` in `/etc/docker/daemon.json` (applies to new containers).

**4. Ship centrally** - an agent (Fluent Bit, Vector, Promtail) tails the container log files and sends them to Loki, ELK/OpenSearch or CloudWatch, adding labels like container, service, env.

**5. Structured JSON logs** with timestamp, level, service and a `trace_id` so one request can be followed across services and linked to traces.

**6. Never log secrets** (passwords, tokens, card numbers); mask them in the app and add redaction filters in the shipper.

**7. Blocking vs non-blocking mode** - default `mode=blocking`: if the log destination is slow, the app's writes to stdout block and the app slows down. `mode=non-blocking` with `max-buffer-size` keeps the app fast, but logs can be dropped when the buffer fills. Use non-blocking for remote drivers on latency-critical apps.

For metrics and alerting on containers, see the monitoring question above - logs explain why, metrics tell you when.

**Example:**

```json
# /etc/docker/daemon.json  (restart docker; affects newly created containers)
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5", "mode": "non-blocking",
                "max-buffer-size": "4m" }
}
```

```bash
docker run -d --name api \
  --log-driver awslogs \
  --log-opt awslogs-region=ap-south-1 \
  --log-opt awslogs-group=/prod/api \
  --log-opt mode=non-blocking --log-opt max-buffer-size=4m \
  myorg/api:1.4.2

docker inspect api --format '{{.HostConfig.LogConfig.Type}}'
```

```json
{"ts":"2026-09-24T10:15:02Z","level":"error","service":"orders",
 "trace_id":"4bf92f3577b34da6","msg":"payment timeout","duration_ms":3012}
```

:::say
Apps log structured JSON with a trace_id to stdout, Docker's json-file or local driver has max-size and max-file rotation in daemon.json so disks never fill, and Fluent Bit or Promtail ships the logs to Loki, ELK or CloudWatch. I keep secrets out of logs, and for remote drivers on latency-sensitive services I use non-blocking mode with a buffer, accepting that some logs may drop under pressure.
:::

## How do you do a zero-downtime update of a service using plain Docker (without Kubernetes)?

<!-- source: 02 Q29 -->

:::note In simple words
Open the new shop counter next door, check it works, then move the "Open" sign to it and only then close the old counter. Customers never find a closed door.
:::

Plain `docker stop` + `docker run` always causes a gap, so use **blue-green behind a reverse proxy** (Nginx, Traefik, HAProxy):

1. Current version (**blue**) runs behind Nginx on port 8081.
2. Start the new version (**green**) on port 8082 with the new image.
3. Wait until green passes its health check.
4. Switch the Nginx upstream to green and `nginx -s reload` (graceful - existing connections finish).
5. Watch errors/latency for a few minutes.
6. Stop blue (keep the image for instant rollback). Rollback = switch upstream back.

Alternatives: Docker Swarm `docker service update --update-order start-first`, or Traefik with labels which discovers containers automatically. The app must handle SIGTERM gracefully and be stateless (sessions in Redis, not memory).

**Example:**

```bash
docker run -d --name app-green --network web -p 8082:3000 myorg/app:1.5.0
until curl -fs http://localhost:8082/health; do sleep 2; done

sed -i 's/127.0.0.1:8081/127.0.0.1:8082/' /etc/nginx/conf.d/app.conf
nginx -t && nginx -s reload

sleep 300 && docker stop app-blue     # after verification
```

:::say
With plain Docker I use blue-green behind Nginx or Traefik - start the new container alongside the old one, wait for its health check, switch the proxy upstream with a graceful reload, then retire the old one while keeping it for fast rollback. Docker Swarm's start-first update order gives the same result natively.
:::

## How do you move containers from one server to another?

<!-- source: 02 Q30 -->

:::note In simple words
You don't move a running kitchen - you send the recipe (image) to the new place, carry the food store (volume data) separately, and start cooking there.
:::

Containers are disposable - you move the **image**, the **config** and the **data**, then start a fresh container.

1. **Image** - best: push to a registry and pull on the new host. No registry / air-gapped: `docker save` -> copy the tar -> `docker load`.
2. **Config** - `docker run` flags, env files, Compose file (keep them in git). `docker inspect` on the old host shows ports, env, mounts.
3. **Data** - volumes are NOT part of the image or `docker commit`. Back up the volume (tar through a helper container, or DB dump) and restore on the new host.
4. Start on the new host, verify, switch DNS/load balancer, then remove the old one.

Avoid `docker export/import` (flattens the filesystem and loses image metadata like CMD, ENV) and avoid `docker commit` as a migration method (unreproducible images).

**Example:**

```bash
# Image via registry
docker push $REG/app:1.4.2          # old host
docker pull $REG/app:1.4.2          # new host

# Image without registry
docker save myorg/app:1.4.2 | gzip > app.tar.gz
scp app.tar.gz user@newhost:/tmp/ && ssh user@newhost "gunzip -c /tmp/app.tar.gz | docker load"

# Volume data
docker run --rm -v appdata:/data -v $PWD:/backup alpine tar czf /backup/appdata.tgz -C /data .
docker run --rm -v appdata:/data -v $PWD:/backup alpine tar xzf /backup/appdata.tgz -C /data
```

:::say
I treat containers as disposable - the image goes through a registry (or docker save and load if there is no registry), the run configuration comes from a Compose file in git, and volume data is backed up and restored separately since it is not part of the image. Then I start it on the new host, verify, and switch traffic.
:::
