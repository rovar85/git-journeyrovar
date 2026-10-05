---
track: docker
title: Docker networking
short: Networking
sub: Bridges, container-to-container DNS, and how published ports really work.
---

:::goals
- describe Docker's default bridge network
- create user-defined networks and reach containers by name
- explain what `-p` does using iptables/nftables
- isolate services on separate networks
:::

## Networks Docker creates for you

On install Docker creates a **bridge** network (`docker0`, a Linux bridge like the one you built by hand) and gives each container a virtual cable (veth) plus an IP in a private range such as `172.17.0.0/16`. A container reaches the outside world through **NAT/masquerade** on the host; the outside reaches it only through published ports.

| Driver | Meaning |
|---|---|
| `bridge` | default, containers on one host talk through a virtual switch |
| `host` | container shares the host's network stack (no isolation, no port mapping) |
| `none` | no networking at all |
| `overlay` | multi-host networks (Swarm, Kubernetes uses its own CNI plugins) |

```setup
docker rm -f $(docker ps -aq) 2>/dev/null
docker network rm evnet backnet 2>/dev/null
true
```

```run
docker network ls --format '{{.Name}} ({{.Driver}})' | sort
docker network inspect bridge --format 'subnet {{(index .IPAM.Config 0).Subnet}}'
ip -brief addr show docker0 | awk '{print $1, $2}'
```

## Default bridge versus user-defined bridge

On the **default** bridge, containers can reach each other only by IP. On a **user-defined** bridge, Docker runs an embedded **DNS server**: containers find each other by **name**. Always use your own network for multi-container apps.

```run
docker network create evnet > /dev/null
docker run -d --name db --network evnet busybox sh -c 'mkdir -p /www; echo "pretend SQL answer" > /www/index.html; httpd -f -p 80 -h /www' > /dev/null
docker run -d --name web --network evnet busybox sleep 300 > /dev/null
sleep 1
docker exec web wget -q -O - http://db/
docker exec web nslookup db 2>/dev/null | grep -E "^Name|^Address" | head -2 | sed 's/[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*/<ip>/'
```

`web` reached `db` by the name `db`. The embedded DNS resolves container names to their current IPs, which change each time a container is recreated. Never hard-code container IPs.

Compare with the default bridge:

```run
docker run -d --name old --network bridge busybox sleep 300 > /dev/null
docker exec old wget -q -T 2 -O - http://db/ 2>&1 | head -1
docker rm -f old > /dev/null
```

## What does `-p` really do?

Publishing creates a **DNAT** rule on the host: traffic arriving at the host port is rewritten to the container's IP and port. You can see it:

```run
docker run -d --name pub -p 8085:80 busybox sh -c 'mkdir -p /www; echo ok > /www/index.html; httpd -f -p 80 -h /www' > /dev/null
sleep 1
sudo iptables -t nat -S DOCKER | grep "dport 8085" | sed 's/172\.[0-9]*\.[0-9]*\.[0-9]*/<container-ip>/'
curl -s http://localhost:8085/
docker rm -f pub > /dev/null
```

The `DNAT --to-destination <container-ip>:80` line is what you wrote with nftables in the networking track. Docker simply automates it. This also explains a **security gotcha**: Docker edits firewall rules itself, so a port you publish may be reachable from outside even if your host firewall tool (`ufw`) seems to deny it. Publish only to `127.0.0.1` unless the service must be public.

## Isolating tiers with separate networks

A typical app: `web` talks to `app`, `app` talks to `db`, but `web` must **not** reach `db`. Put the database on a private network and connect only `app` to both:

```run
docker network create backnet > /dev/null
docker rm -f db web > /dev/null
docker run -d --name db --network backnet busybox sleep 300 > /dev/null
docker run -d --name app --network evnet busybox sleep 300 > /dev/null
docker network connect backnet app
docker run -d --name web --network evnet busybox sleep 300 > /dev/null
sleep 1
echo -n "app -> db:  "; docker exec app ping -c1 -W1 db > /dev/null 2>&1 && echo reachable || echo blocked
echo -n "web -> app: "; docker exec web ping -c1 -W1 app > /dev/null 2>&1 && echo reachable || echo blocked
echo -n "web -> db:  "; docker exec web ping -c1 -W1 db > /dev/null 2>&1 && echo reachable || echo blocked
```

Network membership is your firewall between tiers. The same idea returns as **security groups** in cloud and **NetworkPolicies** in Kubernetes.

## Troubleshooting container networking

```term
$ docker exec -it web sh                     # get inside
$ docker exec web nslookup db                # DNS working?
$ docker exec web wget -qO- http://db:80/    # port reachable?
$ docker network inspect evnet               # who is attached, which IPs
$ docker logs db                             # is the server even running
```

All the tools from the Networking track (ping, nc, curl, dig) work the same way inside a container if they are in the image. Minimal images often lack them, so debug from a helper container attached to the same network (for example `docker run --rm -it --network evnet busybox sh`).

```run
docker rm -f web app db > /dev/null
docker network rm evnet backnet
docker network ls -q | wc -l
```

:::recap
- Default bridge = NAT'd virtual switch. User-defined bridge adds DNS by container name.
- `-p` creates DNAT rules in the host firewall; bind to `127.0.0.1` when not public.
- Separate networks isolate tiers; `network connect` links a container to more than one.
:::

:::try Your turn
Create a network, start two containers on it, and show that one can resolve the other's name. Then start a third on the default bridge and show it cannot.
:::

:::quiz
? Why use a user-defined bridge instead of the default one?
+ It gives DNS resolution of container names and better isolation
- It is faster only
- The default bridge does not exist
- It disables NAT
! Names beat IPs, which change.
? What does `-p 8080:80` create on the host?
+ A DNAT rule forwarding host port 8080 to the container's port 80
- A new network card
- A DNS record
- A volume
! Docker manages the firewall rules for you.
? How do you stop `web` from reaching `db`?
- Rename them
+ Put them on different networks, connecting only `app` to both
- Use a larger image
- Disable logs
! Networks are Docker's isolation boundary between services.
:::
