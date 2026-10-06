---
track: docker
title: Writing Dockerfiles
short: Dockerfiles
sub: Build your own image, understand build cache, and make builds fast and small.
---

:::goals
- write a Dockerfile with `FROM`, `COPY`, `RUN`, `ENV`, `CMD` and `ENTRYPOINT`
- build and run your image
- explain the build cache and order instructions for speed
- use multi-stage builds and `.dockerignore`
:::

## A Dockerfile is a recipe

Each instruction adds a layer. Common ones:

| Instruction | Purpose |
|---|---|
| `FROM image` | the base to start from (always first) |
| `WORKDIR /app` | set the working directory |
| `COPY src dest` | copy files from your folder into the image |
| `RUN cmd` | run a command **at build time** (install, compile) |
| `ENV KEY=value` | set an environment variable |
| `ARG name=default` | build-time variable |
| `EXPOSE 80` | document the port (does not publish it) |
| `USER name` | run as this user |
| `CMD [...]` | default command **at run time** (easy to override) |
| `ENTRYPOINT [...]` | the fixed program; `CMD` becomes its default arguments |

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
docker rmi -f ev-web:1 ev-web:2 ev-web:3 2>/dev/null
docker builder prune -af > /dev/null 2>&1
rm -rf ~/lab/ev-web
mkdir -p ~/lab/ev-web
true
```

## Build a small web image

```run
cd ~/lab/ev-web
mkdir site
echo "<h1>EV status page</h1>" > site/index.html
cat > Dockerfile <<'EOF'
FROM busybox:latest
WORKDIR /www
COPY site/ /www/
ENV GREETING="hello"
EXPOSE 80
CMD ["httpd", "-f", "-p", "80", "-h", "/www"]
EOF
docker build -q -t ev-web:1 . | sed 's/sha256:.*/<image id>/'
docker images ev-web --format '{{.Repository}}:{{.Tag}}'
```

`docker build -t name:tag .` builds from the Dockerfile in `.` (the **build context**: all files sent to the daemon). Run it:

```run
docker run -d --name ev-web -p 8090:80 ev-web:1 > /dev/null
sleep 1
curl -s http://localhost:8090/
docker rm -f ev-web > /dev/null
```

## CMD versus ENTRYPOINT

`CMD` is a default the user can replace; `ENTRYPOINT` is the program itself and anything after the image name becomes its arguments.

```run
cd ~/lab/ev-web
cat > Dockerfile.echo <<'EOF'
FROM busybox:latest
ENTRYPOINT ["echo", "EV says:"]
CMD ["nothing"]
EOF
docker build -q -t ev-echo -f Dockerfile.echo . > /dev/null
docker run --rm ev-echo
docker run --rm ev-echo "restart indexing"
docker rmi ev-echo > /dev/null
```

Use the **exec form** (JSON array `["x","y"]`) so the program is PID 1 and receives SIGTERM properly. The **shell form** (`CMD x y`) wraps it in `sh -c`, which often swallows signals.

## The build cache: order matters

Docker reuses a layer if the instruction and everything before it are unchanged. The moment one step changes, **it and all later steps rebuild**. So put things that change rarely (installing dependencies) **before** things that change often (your source code).

```run
cd ~/lab/ev-web
cat > Dockerfile <<'EOF'
FROM busybox:latest
WORKDIR /app
COPY requirements.txt .
RUN echo "installing dependencies (slow)..." && sleep 1 && cat requirements.txt | wc -l > /deps.count
COPY app.sh .
CMD ["sh", "app.sh"]
EOF
echo "flask" > requirements.txt
echo 'echo "app v1"' > app.sh
echo "=== first build"
bstat() {
  docker build --progress=plain "$@" . 2>&1 | awk '
    /^#[0-9]+ \[[0-9]+\/[0-9]+\]/ && !/ FROM / { id=$1; $1=""; name[id]=$0; order[++n]=id }
    /^#[0-9]+ CACHED/ { cached[$1]=1 }
    END { for (i=1;i<=n;i++) { id=order[i]; printf "%-7s%s\n", (cached[id] ? "CACHED" : "RAN"), substr(name[id],1,58) } }'
}
bstat -t ev-web:2
echo "=== change only the app code"
echo 'echo "app v2"' > app.sh
bstat -t ev-web:3
```

(`bstat` is a small helper that prints one line per build step: `CACHED` or `RAN`.) On the second build the `RUN` (dependency install) layer says **CACHED**; only the `COPY app.sh` step and later ones run again. If you had written `COPY . .` before `RUN`, every code edit would reinstall all dependencies. Try it yourself in the simulator:

@widget layers

## Keep builds small and safe

- **`.dockerignore`**: lists files not to send in the build context (`.git`, `node_modules`, `*.log`, `.env`). Faster builds and no leaked secrets.
- **Combine related `RUN` steps** and clean up in the same step, because deleting a file in a later layer does not shrink the earlier one.
- **Multi-stage builds**: build in one stage, copy only the result into a tiny final image. Compilers and caches never reach production.

```run
cd ~/lab/ev-web
printf '.git\n*.log\n.env\n' > .dockerignore
cat > Dockerfile.multi <<'EOF'
# Stage 1: "build" (pretend this has compilers, test tools, large caches)
FROM busybox:latest AS build
RUN echo "compiled artefact" > /artefact.txt && head -c 3000000 /dev/zero > /big-build-cache

# Stage 2: final image: only what we need
FROM busybox:latest
COPY --from=build /artefact.txt /artefact.txt
CMD ["cat", "/artefact.txt"]
EOF
docker build -q -t ev-multi -f Dockerfile.multi . > /dev/null
docker run --rm ev-multi
docker run --rm ev-multi ls /big-build-cache 2>&1 | tail -1
docker rmi ev-multi > /dev/null
```

The 3 MB junk file stayed in the build stage and never reached the final image.

## Secrets: never in an image

Anything you `COPY` or `RUN` into an image is in its layers forever, and `docker history` shows commands. Do not put passwords, keys or tokens in a Dockerfile. Pass them at run time, or use BuildKit **secret mounts** (`RUN --mount=type=secret,...`).

```run
cd ~/lab/ev-web
printf 'FROM busybox\nENV DB_PASSWORD=hunter2\n' > Dockerfile.leaky
docker build -q -t ev-leaky -f Dockerfile.leaky . > /dev/null
docker history ev-leaky --format '{{.CreatedBy}}' | grep -o 'DB_PASSWORD=[a-z0-9]*'
docker rmi ev-leaky > /dev/null
```

Anyone who can pull the image can read that. This is a real, common vulnerability.

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- Dockerfile instructions: `FROM`, `WORKDIR`, `COPY`, `RUN`, `ENV`, `EXPOSE`, `USER`, `CMD`, `ENTRYPOINT`.
- `docker build -t name:tag .`. Build cache: rarely-changing steps first.
- `.dockerignore`, multi-stage builds, small bases keep images lean.
- Never bake secrets into images.
:::

:::try Your turn
Write a Dockerfile for a script that prints the contents of an environment variable passed at run time. Build it and run it with two different values.
:::

:::quiz
? Why copy `requirements.txt` and install before copying the rest of the code?
+ So dependency layers stay cached when only the code changes
- To make the image bigger
- It is required syntax
- To hide the code
! Order your Dockerfile from least to most frequently changing.
? What is the difference between RUN and CMD?
+ RUN executes at build time; CMD is the default command at run time
- They are identical
- CMD builds the image
- RUN is for ports
! RUN creates layers; CMD sets the container's default process.
? What is a multi-stage build for?
- Running several containers
+ Building in one stage and shipping only the result in a small final image
- Pushing to several registries
- Faster downloads only
! Build tools and caches stay out of production images.
:::
