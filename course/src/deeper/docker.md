=== docker/01
## A worked solution and common mistakes

```run
docker rm -f ticker > /dev/null 2>&1
docker run -d --name ticker busybox sh -c 'while true; do date; sleep 2; done' > /dev/null
sleep 5
echo "--- last 3 log lines (timestamps differ on every run, so we show the count):"; docker logs --tail 3 ticker | wc -l
echo "--- run date INSIDE the container:"; docker exec ticker sh -c 'date +%Y > /dev/null && echo "exec works: $(hostname | cut -c1-4)..."'
docker stop ticker > /dev/null
docker inspect -f 'exit code after docker stop: {{.State.ExitCode}}' ticker
docker rm ticker > /dev/null
```

The exit code is **137** (128 + 9, SIGKILL) because the shell loop is PID 1 and **ignores SIGTERM** (a shell as PID 1 does not forward or handle it), so after Docker's 10-second grace period it is killed. A program that handles SIGTERM exits 0 or 143 immediately. This is why you use `exec` form or a proper init (`docker run --init`).

:::warn Common mistakes
- **Running in the foreground and losing the terminal.** Use `-d` for services, `-it` only for interactive shells.
- **Not naming containers,** then juggling random names. Use `--name`.
- **Piling up stopped containers and images.** Use `--rm` for one-offs; prune regularly.
- **Debugging by guessing.** `docker logs`, `docker inspect` and `docker exec` answer most questions.
- **Treating a container like a VM** and installing things by hand inside it. Change the Dockerfile and rebuild.
:::

=== docker/02
## A worked solution and common mistakes

```run
echo "--- layers of busybox, largest first:"
docker history busybox --format '{{.Size}}\t{{.CreatedBy}}' | sort -hr | head -3 | cut -c1-70
echo "--- tag with a registry-style name; both names point to ONE image:"
docker tag busybox registry.example.com/team/busybox:1.37-lab
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E "^(busybox|registry.example.com)" | sort
docker rmi registry.example.com/team/busybox:1.37-lab > /dev/null
```

The biggest layer is usually the base operating system layer. In your own images, big layers are typically a package install, a dependency download or a copied build folder: that is where optimisation pays off.

:::warn Common mistakes
- **Pulling `latest` in production** and getting a different image tomorrow. Pin versions (and ideally digests).
- **Thinking tags are copies.** A tag is a label; retagging does not duplicate data.
- **Deleting an image that other tags still use** ("image is referenced in multiple repositories"); remove the tags first.
- **Forgetting the registry prefix** when pushing; `docker push myimage` goes to Docker Hub, not your registry.
- **Large base images "because it is familiar".** Prefer slim or alpine bases with only what you need.
:::

=== docker/03
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

=== docker/04
## A worked solution and common mistakes

```run
rm -rf ~/lab/envprint && mkdir ~/lab/envprint && cd ~/lab/envprint
cat > Dockerfile <<'EOF'
FROM busybox:1.37
ENV GREETING="default greeting"
CMD ["sh", "-c", "echo \"Message: $GREETING\""]
EOF
docker build -q -t envprint . > /dev/null
echo "default:"; docker run --rm envprint
echo "override 1:"; docker run --rm -e GREETING="hello from run 1" envprint
echo "override 2:"; docker run --rm -e GREETING="hello from run 2" envprint
docker rmi envprint > /dev/null
```

`ENV` sets a **default**; `-e` at run time **overrides** it. The `sh -c` wrapper is needed so the shell expands `$GREETING` (the exec-form `CMD ["echo", "$GREETING"]` would print the literal text).

:::warn Common mistakes
- **Putting the code `COPY` before the dependency install,** so every edit reinstalls everything.
- **Shell form `CMD npm start`,** making `sh` PID 1; signals do not reach your program. Use exec form.
- **Baking secrets in with `ENV` or `COPY`.** They stay in the image layers.
- **Missing `.dockerignore`,** sending `.git` and large folders to the build every time.
- **Running as root by default.** Add a `USER` instruction.
- **Many `RUN` lines that each leave junk behind.** Clean up in the same layer.
:::

=== docker/05
## A worked solution and common mistakes

```run
docker volume rm logvol > /dev/null 2>&1; docker volume create logvol > /dev/null
for i in 1 2 3; do
  docker run --rm -v logvol:/data busybox sh -c 'echo "run at $(date +%s%N)" >> /data/log.txt'
done
echo "lines in the file, read by a FOURTH container (read-only mount):"
docker run --rm -v logvol:/data:ro busybox sh -c 'wc -l < /data/log.txt'
docker volume rm logvol > /dev/null
```

Three short-lived containers each appended a line; the data stayed in the volume. Ownership and permissions matter: the container's user must be allowed to write the volume.

:::warn Common mistakes
- **Storing data in the container layer** and losing it at the next `docker rm`.
- **Running `docker compose down -v` or `docker volume prune`** and deleting data you wanted.
- **Bind-mounting with the wrong ownership,** causing "permission denied".
- **Backing up a running database by copying its files.** Use the database's own dump or backup tool.
- **Mounting a volume over a folder that has files in the image** and wondering where they went (with a bind mount the host folder hides them).
:::

=== docker/06
## A worked solution and common mistakes

```run
docker rm -f c1 c2 c3 > /dev/null 2>&1; docker network rm lab6net > /dev/null 2>&1
docker network create lab6net > /dev/null
docker run -d --name c1 --network lab6net busybox sleep 120 > /dev/null
docker run -d --name c2 --network lab6net busybox sleep 120 > /dev/null
docker run -d --name c3 busybox sleep 120 > /dev/null
echo "c2 -> c1 by NAME on the user-defined network:"; docker exec c2 ping -c1 -W1 c1 > /dev/null 2>&1 && echo reachable || echo "not reachable"
echo "c3 (default bridge) -> c1 by name:"; docker exec c3 ping -c1 -W1 c1 > /dev/null 2>&1 && echo reachable || echo "not reachable: different network and no name resolution"
docker rm -f c1 c2 c3 > /dev/null; docker network rm lab6net > /dev/null
```

:::warn Common mistakes
- **Using the default bridge for multi-container apps** and hard-coding container IPs (they change).
- **Expecting `localhost` inside a container to mean the host** (it is the container itself). Use the service name or `host.docker.internal`.
- **Publishing every service's port** when containers on the same network can already reach each other.
- **Forgetting that Compose creates its own network** per project.
- **Debugging with a container that lacks tools.** Run a helper (`busybox`, `nicolaka/netshoot`) on the same network.
:::

=== docker/07
## A worked solution and common mistakes

```run
cd ~/lab/evapp 2>/dev/null || { mkdir -p ~/lab/evapp/site && cd ~/lab/evapp; }
echo "<h1>EV</h1>" > site/index.html
cat > compose.yaml <<'EOF'
name: evapp2
services:
  web:
    image: busybox
    command: ["httpd", "-f", "-p", "80", "-h", "/www"]
    volumes: ["./site:/www:ro"]
    networks: [front]
  checker1:
    image: busybox
    command: ["sh", "-c", "while true; do wget -q -O /dev/null http://web/ && echo checker1-ok; sleep 2; done"]
    networks: [front]
  checker2:
    image: busybox
    command: ["sh", "-c", "while true; do wget -q -O /dev/null http://web/ && echo checker2-ok; sleep 2; done"]
    networks: [front]
networks:
  front: {}
EOF
docker compose up -d > /dev/null 2>&1
sleep 8
for s in checker1 checker2; do docker compose logs $s 2>&1 | grep -q "$s-ok" && echo "$s sees web: yes" || echo "$s sees web: no"; done
docker compose down > /dev/null 2>&1
```

:::warn Common mistakes
- **Tabs in YAML.** Use spaces only; a single tab breaks the file. `docker compose config` validates.
- **Wrong indentation** that silently moves a key under the wrong parent.
- **Assuming `depends_on` waits for readiness.** Add healthchecks and `condition: service_healthy`.
- **Hard-coding passwords in `compose.yaml`** committed to Git; use `.env` (git-ignored) or secrets.
- **`docker compose down -v` in the wrong folder** deleting volumes.
- **Mixing the older `docker-compose` (v1) syntax and the `docker compose` plugin.**
:::

=== docker/08
## A worked solution and common mistakes

```run
cd ~/lab
docker rm -f hardened > /dev/null 2>&1
docker run -d --name hardened --user 10001:10001 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 32m -p 127.0.0.1:8099:8080 busybox sh -c 'echo hardened > /tmp/index.html 2>/dev/null; mkdir -p /tmp/www; echo hardened > /tmp/www/index.html; httpd -f -p 8080 -h /tmp/www' > /dev/null
sleep 2
echo "port 8080 as non-root:"; curl -s http://127.0.0.1:8099/ || docker logs hardened | head -2
docker rm -f hardened > /dev/null
echo "--- the same on port 80 as non-root:"
docker run --rm --user 10001:10001 --cap-drop ALL busybox sh -c 'httpd -f -p 80 -h /tmp 2>&1 | head -1' 2>&1 | head -1
```

Port 8080 works (note the container needed a writable `/tmp`; with `--read-only` you would normally add `--tmpfs /tmp`). **Port 80 fails** for a non-root user because ports below 1024 are **privileged**: binding needs root or the `NET_BIND_SERVICE` capability, which we dropped. The right design is to listen on a high port (8080) inside the container and map it: `-p 80:8080`.

:::warn Common mistakes
- **Running as root "because it works".** Fix permissions instead.
- **`--privileged`** to get past an error; it removes almost all isolation.
- **Mounting `/var/run/docker.sock`** into a container: it hands out root on the host.
- **Read-only filesystem without tmpfs** for the places that must be writable (`/tmp`, `/var/run`).
- **Skipping image scans** and base-image updates; vulnerable packages sit unnoticed.
- **Logging to files inside the container** instead of stdout/stderr.
:::
