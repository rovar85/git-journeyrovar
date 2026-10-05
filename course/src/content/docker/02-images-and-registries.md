---
track: docker
title: Images, layers and registries
short: Images, layers
sub: What an image is made of, how tags work, and where images come from.
---

:::goals
- explain image layers and why they save space and time
- read image names, tags and digests
- inspect an image with `history` and `inspect`
- explain registries and `pull`/`push`
:::

## An image is a stack of layers

An image is not one big file. It is a stack of read-only **layers**, each recording the file changes from one build step. A container adds a thin **writable layer** on top. Layers are **shared**: ten images that start from the same base store that base once, and pulling a new version downloads only the layers you do not have.

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
true
```

```run
docker image ls busybox --format '{{.Repository}}:{{.Tag}}  {{.Size}}'
docker history busybox --format '{{.CreatedBy}}' | cut -c1-70
docker image inspect busybox --format 'layers: {{len .RootFS.Layers}}  os/arch: {{.Os}}/{{.Architecture}}'
```

`docker history` lists the steps that built the image, newest first. The `SIZE` of each step matters when you optimise.

## Names, tags and digests

A full image name: `registry/namespace/name:tag`. For example `docker.io/library/nginx:1.27-alpine`. Parts you leave out get defaults: registry `docker.io`, namespace `library` (official images), tag `latest`.

| Written | Means |
|---|---|
| `nginx` | `docker.io/library/nginx:latest` |
| `nginx:1.27-alpine` | a specific version, small Alpine-based variant |
| `ghcr.io/acme/app:2.3.1` | GitHub's registry |
| `nginx@sha256:...` | an exact, immutable **digest** |

:::warn Avoid `latest` in real systems
A **tag** is a movable label. `latest` is whatever was pushed last, so a rebuild next month may pull something different. Pin versions (`:1.27.2`) in production, or even the digest, so deployments are repeatable.
:::

Tagging gives an image another name; it does not copy data:

```run
docker tag busybox ev-tools:1.0
docker tag busybox ev-tools:latest
docker image ls ev-tools --format '{{.Repository}}:{{.Tag}}' | sort
docker image inspect ev-tools:1.0 busybox --format '{{.Id}}' | uniq | wc -l
docker rmi ev-tools:1.0 ev-tools:latest | sed 's/sha256:.*/.../'
```

The two `ev-tools` tags and `busybox` all point to one image ID (the `uniq` count is 1).

## Registries

A **registry** stores and serves images. **Docker Hub** is the public default. Companies run private ones: **Amazon ECR**, **Azure ACR**, **Google Artifact Registry**, **GitHub Container Registry**, **Harbor**, or a simple self-hosted `registry` container. Typical flow:

```term
$ docker login registry.example.com
$ docker tag ev-tools:1.0 registry.example.com/ops/ev-tools:1.0
$ docker push registry.example.com/ops/ev-tools:1.0
$ docker pull registry.example.com/ops/ev-tools:1.0
```

A registry is just an HTTP server speaking a standard API (the OCI distribution spec). You can run your own with `docker run -d -p 5000:5000 registry:2` and push to `localhost:5000/name:tag`.

## Saving images as files

When there is no registry (air-gapped networks), images can move as tar files:

```run
cd ~/lab
docker save busybox -o busybox.tar
tar -tf busybox.tar | head -4 | sed 's/[0-9a-f]\{64\}/<id>/'
ls -lh busybox.tar | awk '{print "tar size:", $5}'
rm busybox.tar
```

Inside the tar you see the layers and a manifest. `docker load -i file.tar` brings it back.

## Housekeeping

Images and stopped containers pile up and fill disks (a classic incident, see the Linux storage lesson).

```run
docker system df --format 'table {{.Type}}\t{{.Active}}\t{{.Reclaimable}}' | sed 's/([0-9]*%)//'
```

| Command | Effect |
|---|---|
| `docker image prune` | remove unused (dangling) images |
| `docker container prune` | remove stopped containers |
| `docker system prune -a` | remove everything unused (careful) |
| `docker system df` | what is using space |

## Choosing a base image

| Base | Size | Notes |
|---|---|---|
| `ubuntu`, `debian` | 30-80 MB | familiar, full package manager |
| `alpine` | ~5-10 MB | tiny, uses `musl` libc and `apk` |
| `-slim` variants | ~30-50 MB | trimmed Debian |
| `distroless` | ~2-20 MB | no shell or package manager, hard to attack |
| `scratch` | 0 | empty; for static binaries |

Smaller images pull faster and have fewer things to patch (a smaller **attack surface**).

:::recap
- An image = stacked read-only layers shared between images; a container adds a writable layer.
- Name = `registry/namespace/name:tag`. Pin versions; avoid `latest` in production.
- Registries store images: `login`, `tag`, `push`, `pull`.
- Clean up with `prune`; prefer small bases.
:::

:::try Your turn
Run `docker history` on another image you have and find its biggest layer. Tag an image with a registry-style name and list it.
:::

:::quiz
? Why are image layers useful?
+ They are shared, so storage and downloads are reused
- They encrypt data
- They make containers run faster than the CPU allows
- They are needed for networking
! Only changed layers are pulled or rebuilt.
? What is the risk of using the `latest` tag in production?
- It is slower
+ It can change under you, making deployments unrepeatable
- It is not allowed
- It disables caching
! Pin an explicit version or digest.
? Which part of `ghcr.io/acme/app:2.3.1` is the registry?
+ `ghcr.io`
- `acme`
- `app`
- `2.3.1`
! Namespace is `acme`, name `app`, tag `2.3.1`.
:::
