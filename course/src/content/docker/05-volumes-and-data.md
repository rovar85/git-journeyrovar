---
track: docker
title: Volumes and persistent data
short: Volumes
sub: Keep data alive beyond a container: volumes, bind mounts and backups.
---

:::goals
- explain why container data disappears and how volumes fix it
- use named volumes and bind mounts
- back up and restore a volume
- choose the right storage for logs, databases and config
:::

## The problem

A container's writable layer is deleted with the container. A database, uploaded files or an EV index stored there would be lost on every redeploy. Docker offers two main ways to keep data **outside** the container:

| Type | Syntax | Where data lives | Best for |
|---|---|---|---|
| **Named volume** | `-v mydata:/data` | managed by Docker (`/var/lib/docker/volumes`) | databases, app state |
| **Bind mount** | `-v /host/path:/data` | a folder you choose on the host | config files, source code in development |
| **tmpfs** | `--tmpfs /tmp` | memory only | scratch data, secrets that must not touch disk |

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
docker volume rm evdata evbackup 2>/dev/null
rm -rf ~/lab/conf
true
```

## Named volumes

```run
docker volume create evdata
docker run --rm -v evdata:/data busybox sh -c 'echo "index entry 1" > /data/index.db; ls /data'
docker run --rm -v evdata:/data busybox cat /data/index.db
docker volume ls --format '{{.Name}}' | grep evdata
```

The first container wrote a file and was removed; the second, a completely different container, found the file. The volume has its own lifetime. Volumes are only deleted by `docker volume rm` (or `prune`), never by removing a container.

```run
docker volume inspect evdata --format 'driver={{.Driver}} mountpoint={{.Mountpoint}}'
```

If the volume does not exist when you use `-v name:/path`, Docker creates it automatically. A new empty volume mounted over a directory that contained files in the image is first **populated with the image's files**, a handy feature for first-run defaults.

## Bind mounts

A bind mount maps a host folder into the container. Changes appear on both sides instantly, so it suits configuration and development.

```run
mkdir -p ~/lab/conf
echo "retries=3" > ~/lab/conf/evault.conf
docker run --rm -v ~/lab/conf:/etc/ev:ro busybox sh -c 'cat /etc/ev/evault.conf; echo "x" > /etc/ev/new.conf' 2>&1
echo "--- edit on host, container sees it:"
echo "retries=7" > ~/lab/conf/evault.conf
docker run --rm -v ~/lab/conf:/etc/ev:ro busybox cat /etc/ev/evault.conf
```

`:ro` makes the mount **read-only** inside the container; the write attempt failed as intended. A good habit for config.

:::warn Permissions on bind mounts
Files created by a container as root become root-owned on the host. If the container runs as a non-root user, that user must be allowed to write to the host folder. "Permission denied on a mounted folder" is nearly always a UID/GID mismatch (see the Linux permissions lesson).
:::

## Back up and restore a volume

A volume is just files. Back it up by mounting it in a throwaway container together with a host folder:

```run
cd ~/lab
docker run --rm -v evdata:/data -v ~/lab:/backup busybox tar -czf /backup/evdata-backup.tar.gz -C /data .
ls -lh evdata-backup.tar.gz | awk '{print "backup file exists:", $9}'
docker volume create evbackup > /dev/null
docker run --rm -v evbackup:/data -v ~/lab:/backup busybox sh -c 'tar -xzf /backup/evdata-backup.tar.gz -C /data && cat /data/index.db'
rm -f evdata-backup.tar.gz
```

This restore into a different volume shows the pattern for migrating data between hosts (`scp` the tarball). Databases have their own consistent-backup tools (for SQL Server, `BACKUP DATABASE`; for PostgreSQL `pg_dump`); copying a live database's files can capture a half-written state.

## tmpfs and shared volumes

```run
docker run --rm --tmpfs /scratch:size=1m busybox sh -c 'echo secret > /scratch/t; df -h /scratch | tail -1 | awk "{print \"tmpfs size:\", \$2}"'
docker run -d --name writer -v evdata:/data busybox sh -c 'while true; do date +%s > /data/heartbeat; sleep 1; done' > /dev/null
sleep 2
docker run --rm -v evdata:/data:ro busybox sh -c 'test -s /data/heartbeat && echo "reader sees the writer heartbeat"'
docker rm -f writer > /dev/null
```

Several containers can share one volume (careful with simultaneous writes). In Kubernetes the same idea appears as PersistentVolumes and PersistentVolumeClaims.

## Clean up

```run
docker volume rm evdata evbackup
docker volume ls -q | wc -l
```

:::recap
- Container storage is disposable; use volumes for data that must live on.
- Named volume = Docker-managed; bind mount = a host folder; tmpfs = memory.
- `:ro` protects config. Mind UID/GID for permissions.
- Back up a volume by tarring it from a helper container.
:::

:::try Your turn
Run a container that appends the current time to `/data/log.txt` in a named volume, run it three times, and show all three lines from a fourth container.
:::

:::quiz
? Which survives `docker rm`?
- The container's writable layer
+ A named volume's data
- Environment variables
- The container ID
! Volumes have their own lifecycle.
? When is a bind mount a good choice?
- Never
+ Sharing a config file or source folder from the host
- For database storage on a cloud cluster
- To hide files
! Named volumes suit app state; bind mounts suit host files.
? What does `:ro` do?
+ Mounts read-only inside the container
- Runs as root
- Removes the mount
- Rotates logs
! Good for configuration.
:::
