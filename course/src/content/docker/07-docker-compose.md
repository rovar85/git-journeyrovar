---
track: docker
title: Docker Compose
short: Compose
sub: Describe a whole multi-container application in one YAML file.
---

:::goals
- write a `compose.yaml` with services, networks, volumes and environment
- start, inspect and stop an application with one command
- use `depends_on`, healthchecks and profiles
- read the Compose file as documentation
:::

## Why Compose

Real applications are several containers: web, API, database, cache. Typing a long `docker run` for each (with networks, volumes, env vars) is slow and error-prone. **Docker Compose** describes everything in one **YAML** file, which you commit to Git and start with one command. It is the best way to define a development environment, a lab, or a small single-host deployment.

YAML basics: indentation (spaces, never tabs) shows nesting, `key: value` pairs, `- item` for lists. You will see YAML again in Ansible and Kubernetes, so this is a good place to get comfortable.

```setup
docker compose -p evapp down -v 2>/dev/null
docker rm -f $(docker ps -aq) 2>/dev/null
rm -rf ~/lab/evapp
mkdir -p ~/lab/evapp/site
true
```

## A two-service application

```run
cd ~/lab/evapp
echo "<h1>EV status via Compose</h1>" > site/index.html
cat > compose.yaml <<'EOF'
name: evapp
services:
  web:
    image: busybox
    command: ["httpd", "-f", "-p", "80", "-h", "/www"]
    ports:
      - "8095:80"
    volumes:
      - ./site:/www:ro
    environment:
      - EV_ENV=lab
    depends_on:
      checker:
        condition: service_started
    networks: [front]
  checker:
    image: busybox
    command: ["sh", "-c", "while true; do wget -q -O /dev/null http://web/ && echo web-ok || echo web-down; sleep 2; done"]
    networks: [front]
    restart: unless-stopped
networks:
  front: {}
EOF
docker compose config --quiet && echo "compose file is valid"
```

`docker compose config` validates the file. Read it as a story: two services on one network called `front`; `web` publishes port 8095, mounts the `site` folder read-only, depends on `checker`; the checker polls `http://web/` using the service **name** as the hostname (Compose creates the network and DNS for you).

## Up, ps, logs, down

```run
cd ~/lab/evapp
docker compose up -d 2>&1 | grep -E "Started|Running|Created" | sed 's/ [0-9.]*s$//' | sort
sleep 4
docker compose ps --format '{{.Service}}: {{.State}}' | sort
curl -s http://localhost:8095/
docker compose logs checker 2>&1 | grep -q web-ok && echo "checker log contains: web-ok"
```

| Command | Purpose |
|---|---|
| `docker compose up -d` | create and start everything (builds/pulls as needed) |
| `docker compose ps` | status of the app's containers |
| `docker compose logs -f [svc]` | follow logs |
| `docker compose exec svc sh` | shell in a service |
| `docker compose down` | stop and remove containers and networks (`-v` also volumes) |
| `docker compose up -d --build` | rebuild images that have a `build:` section |
| `docker compose pull` | refresh images |

Compose names things after the project (`evapp-web-1`). Edit the file and run `up -d` again: Compose changes only what differs (a mini version of the declarative idea that Terraform and Kubernetes also use).

## Building your own image in Compose

Instead of `image:`, a service can have `build:` pointing at a Dockerfile:

```yaml:compose.yaml (excerpt)
services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    image: ev-api:dev
    environment:
      DB_HOST: db
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

This excerpt also shows **secrets**: mounted as files, not environment variables (variables leak into logs, `docker inspect` and crash dumps).

## Healthchecks and start order

`depends_on` alone only waits for the container to **start**, not to be **ready**. A database can take 30 seconds to accept connections. Combine a healthcheck with the `service_healthy` condition:

```yaml:compose.yaml (excerpt)
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
  api:
    build: ./api
    depends_on:
      db:
        condition: service_healthy
```

(This excerpt is illustrative; we avoid pulling large images in this lab.) A robust application should also **retry** its database connection rather than rely on start order.

## Variables and profiles

- `.env` file next to `compose.yaml` supplies `${VARIABLES}` used inside it.
- `docker compose -f compose.yaml -f compose.prod.yaml up` merges override files (dev vs prod).
- `profiles: [debug]` makes a service start only when asked (`--profile debug`).

```run
cd ~/lab/evapp
docker compose down 2>&1 | grep -E "Removed|Stopped" | sed 's/ [0-9.]*s$//' | sort | uniq | wc -l
docker ps -a | wc -l
```

:::recap
- Compose = whole application in `compose.yaml`: services, networks, volumes, env, ports.
- Services reach each other by service name. `up -d`, `ps`, `logs`, `exec`, `down`.
- `depends_on` + healthcheck for readiness; secrets as files; override files for environments.
:::

:::try Your turn
Extend the file with a third service that also polls `web`, and start it. Use `docker compose logs` to confirm both checkers get responses.
:::

:::quiz
? How does the `checker` service reach `web`?
+ By the service name `web`, using Compose's built-in DNS
- By a hard-coded IP
- It cannot
- Through the host's public IP
! Compose creates a network and name resolution for services.
? What does plain `depends_on` guarantee?
- The dependency is healthy
+ The dependency container has started
- The dependency has data
- Nothing
! Use `condition: service_healthy` for readiness.
? Which command removes the app's containers and network?
- `docker compose stop`
+ `docker compose down`
- `docker compose ps`
- `docker compose build`
! `down -v` also removes volumes.
:::
