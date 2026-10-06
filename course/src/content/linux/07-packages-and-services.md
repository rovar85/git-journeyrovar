---
track: linux
title: Packages and services
short: Packages, services
sub: Install software the Linux way, and keep it running with systemd.
---

:::goals
- explain what a package manager does and use `apt` and `dnf`/`yum`
- inspect what a package installed
- manage services with `systemctl` and read their logs with `journalctl`
- read and write a systemd unit file
:::

## Packages, not downloads

On Windows you usually download an installer. On Linux you ask a **package manager** to fetch, verify, install and later update software from a trusted **repository**. It also installs **dependencies** (other packages the software needs) for you.

| Family | Distros | Tool | Package file |
|---|---|---|---|
| Debian | Debian, Ubuntu | `apt` (and `dpkg` underneath) | `.deb` |
| Red Hat | RHEL, Rocky, Alma, Fedora, CentOS | `dnf` (older: `yum`; `rpm` underneath) | `.rpm` |

| Task | Debian/Ubuntu | Red Hat family |
|---|---|---|
| refresh the list of available packages | `sudo apt update` | (automatic) `sudo dnf check-update` |
| install | `sudo apt install nginx` | `sudo dnf install nginx` |
| upgrade everything | `sudo apt upgrade` | `sudo dnf upgrade` |
| remove | `sudo apt remove nginx` | `sudo dnf remove nginx` |
| search | `apt search word` | `dnf search word` |
| which package owns a file | `dpkg -S /path` | `rpm -qf /path` |
| list files of a package | `dpkg -L pkg` | `rpm -ql pkg` |

:::note Update vs upgrade
`apt update` only refreshes the catalogue ("what is available"). `apt upgrade` actually installs newer versions. Run both, in that order.
:::

## Looking at a package

This lab runs Ubuntu, so we use the Debian tools. Ask about the `bash` package that is already installed:

```run
dpkg -s bash | grep -E '^(Package|Status|Priority)'
dpkg -S "$(readlink -f /bin/bash)"
dpkg -L bash | grep -E '/bin/' | head -3
```

Install and use a small package for real:

```run
sudo apt-get install -y -q cowsay > /dev/null 2>&1 && echo "installed"
dpkg -s cowsay | grep -E '^(Package|Status)'
/usr/games/cowsay "packages are easy"
sudo apt-get remove -y -q cowsay > /dev/null 2>&1 && echo "removed"
dpkg -s cowsay > /dev/null 2>&1 || echo "cowsay is no longer installed"
```

(If you see a different message the first time, it is because the package catalogue needed refreshing with `sudo apt update` first.)

## Services and systemd

A **service** (a "daemon" in Linux slang) is a program that runs in the background without a terminal: a web server, a database, an SSH server. Modern Linux uses **systemd** to start services at boot, restart them if they crash, and log their output.

The tool is `systemctl`. This sandbox container has no systemd, so the transcripts below are **examples** of what you will see on a real server:

```term
$ systemctl status nginx
● nginx.service - A high performance web server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)
     Active: active (running) since Mon 2026-09-28 08:14:02 UTC; 2 days ago
   Main PID: 1042 (nginx)
$ sudo systemctl restart nginx
$ sudo systemctl enable --now nginx
Created symlink /etc/systemd/system/multi-user.target.wants/nginx.service
$ systemctl is-active nginx
active
```

| Command | Meaning |
|---|---|
| `systemctl status X` | is it running? last log lines |
| `systemctl start X` / `stop X` / `restart X` | act now |
| `systemctl reload X` | re-read the config without dropping connections (if supported) |
| `systemctl enable X` / `disable X` | start (or not) at boot |
| `systemctl enable --now X` | enable and start in one go |
| `systemctl list-units --failed` | what is broken right now |
| `systemctl daemon-reload` | after editing a unit file |

**Start vs enable** trips up every beginner. `start` = run it now. `enable` = run it at every boot. They are independent.

## Logs with journalctl

systemd collects service output in the **journal**:

```term
$ journalctl -u nginx --since "1 hour ago"
$ journalctl -u nginx -f            # follow, like tail -f
$ journalctl -p err -b              # only errors since this boot
```

Classic text logs also live under `/var/log` (for example `/var/log/syslog` or `/var/log/messages`, `/var/log/auth.log`). Your EV analogy: `systemctl` is like the Services console on a Windows EV server, and `journalctl` is like the Event Viewer.

## Writing your own service

A **unit file** describes a service. Here is a complete one for a small script. Compare with what you learned earlier: it names the user to run as, the command, and what to do on failure.

```ini:/etc/systemd/system/evcheck.service
[Unit]
Description=EV health check loop
After=network.target

[Service]
User=evadmin
ExecStart=/opt/ev/check.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then: `sudo systemctl daemon-reload && sudo systemctl enable --now evcheck`. `Restart=on-failure` is the self-healing part: if the script crashes, systemd restarts it five seconds later.

<!-- deeper -->
## Worked answers and common mistakes

The two problems are separate: the service is **stopped now**, and it is **not enabled at boot**. On a real server:

```term
$ sudo systemctl start ev-indexing        # fixes "stopped now"
$ sudo systemctl enable ev-indexing       # fixes "will not come back after a reboot"
$ sudo systemctl enable --now ev-indexing # both in one command
$ systemctl status ev-indexing            # verify: "Active: active (running)" and "enabled"
```

(Example commands: the lab has no systemd. The service name `ev-indexing` is made up.) If it fails to start, read why: `journalctl -u ev-indexing -n 50 --no-pager`.

:::warn Common mistakes
- **Starting a service but never enabling it,** so it dies at the next reboot (or enabling but never starting it).
- **Editing a unit file and forgetting `systemctl daemon-reload`.**
- **`apt install` without `apt update` first,** so the package list is stale and the install fails or installs an old version.
- **Mixing package managers** (installing the same software by `apt` and by a downloaded installer) and then not knowing which copy runs; `which -a` and `dpkg -S` tell you.
- **Not reading the log.** `systemctl status` shows only the last lines; `journalctl -u NAME` shows the story.
:::
<!-- /deeper -->

:::recap
- Package managers install, update and remove software and its dependencies from repositories.
- `apt`/`dpkg` for Debian and Ubuntu; `dnf`/`rpm` for the Red Hat family.
- systemd runs services. `systemctl start/stop/restart/status`, and `enable` for boot.
- `journalctl -u name` shows a service's logs.
- A unit file defines a service; `daemon-reload` after changing it.
:::

:::try Your turn
The EV indexing service is stopped and will not come back after a reboot. Which two `systemctl` commands fix both problems? Which one command does both?
:::

:::quiz
? What is the difference between `systemctl start` and `systemctl enable`?
- None, they are aliases
+ start runs it now; enable makes it start at every boot
- start is for users, enable is for root
- enable runs it now; start makes it start at boot
! They are independent. `enable --now` does both.
? Which command shows a service's log messages?
- `systemctl log nginx`
+ `journalctl -u nginx`
- `cat /etc/nginx`
- `dpkg -L nginx`
! journalctl reads the systemd journal; `-u` filters by unit.
? You edited a unit file. What must you run before restarting the service?
+ `systemctl daemon-reload`
- `apt update`
- `reboot`
- `chmod 777`
! systemd caches unit files; daemon-reload makes it re-read them.
:::
