---
track: networking
title: How networks work
short: How networks work
sub: Layers, addresses, ports and the vocabulary you need before touching a command.
---

:::goals
- describe the layers of networking using a postal analogy
- tell apart MAC address, IP address and port
- read `ip addr`, `ip link` and `ip route` on a Linux machine
:::

## The postal analogy

Sending a message between two computers is like posting a parcel. You need to know **which building**, **which flat** and **which letterbox rule** to follow. Networking splits that into **layers**, each doing one job and trusting the layer below.

| Layer (simplified) | Job | Postal analogy | Examples |
|---|---|---|---|
| Application | the actual conversation | the letter's content | HTTP, DNS, SSH, SQL |
| Transport | which program, reliable or not | the flat number and "signed for" | **TCP**, **UDP**, ports |
| Internet / Network | which machine, across networks | the postal address | **IP** address, routing |
| Link | hop to the next device on the same network | the local delivery van | Ethernet, Wi-Fi, **MAC** address |

Each layer wraps the one above it, like envelopes inside envelopes. This is called **encapsulation**. When troubleshooting, you walk the layers from the bottom up: is the cable/link up, does the machine have an address, can it reach other networks, does the port answer, does the application behave.

## Three kinds of address

| Address | Looks like | Identifies | Scope |
|---|---|---|---|
| **MAC** | `52:54:00:12:34:56` | a network card | one local network |
| **IP** | `10.0.0.5` or `2001:db8::1` | a machine's connection | across networks |
| **Port** | `443` | a program on that machine | one machine |

A full destination is usually written `IP:port`, for example `10.0.0.5:1433` for SQL Server. Well-known ports to memorise:

| Port | Protocol | Port | Protocol |
|---|---|---|---|
| 22 | SSH | 80 | HTTP |
| 443 | HTTPS | 53 | DNS |
| 25 | SMTP (email) | 3389 | RDP |
| 1433 | SQL Server | 5432 | PostgreSQL |
| 3306 | MySQL | 389/636 | LDAP / LDAPS |

## TCP and UDP

- **TCP** sets up a connection first (a three-step "handshake"), numbers the data and retransmits what is lost. Reliable. Used for web, SSH, databases.
- **UDP** just sends. No connection, no guarantee. Fast. Used for DNS queries, video calls, games.

## Looking at your own machine

The modern tool is `ip` (it replaced `ifconfig`). Your machine always has a **loopback** interface `lo` with address `127.0.0.1`, meaning "myself".

```run
ip -brief link show lo
ip -brief addr show lo
ip route show | wc -l
```

Output columns of `ip -brief addr`: interface name, state (`UP`, `DOWN`, or `UNKNOWN` for loopback), then addresses with their prefix length (`/8`). The prefix length says which part of the address is the "network" and which is the "host"; the next lesson explains it.

| Command | Shows |
|---|---|
| `ip addr` (or `ip a`) | interfaces and their IP addresses |
| `ip link` | the link layer: up/down, MAC |
| `ip route` | where traffic is sent (the routing table) |
| `ip neigh` | the ARP table: IP to MAC for neighbours |
| `ss -tulpn` | listening TCP/UDP ports and their programs |

On the Windows side the equivalents are `ipconfig /all`, `route print`, `arp -a`, `netstat -ano` (covered in the PowerShell track).

## Your machine talking to itself

Start a tiny web server on loopback and fetch from it. The whole stack (IP, TCP, HTTP) runs inside your machine:

```run
python3 -m http.server 8099 --bind 127.0.0.1 > /dev/null 2>&1 &
pid=$!
sleep 1
curl -s -o /dev/null -w "HTTP status: %{http_code}\n" http://127.0.0.1:8099/
ss -ltn | awk '$4 ~ /:8099$/ {print "listening on", $4}'
kill $pid
```

:::recap
- Layers: application, transport (TCP/UDP + ports), internet (IP), link (MAC).
- MAC = card, IP = machine, port = program.
- TCP is reliable and connection based; UDP is fast and connectionless.
- `ip addr`, `ip link`, `ip route`, `ip neigh`, `ss` are the core inspection tools.
:::

:::try Your turn
A user says "I cannot open the EV search page". Order these checks from the lowest layer up: web page loads, name resolves, port 443 reachable, cable connected, machine has an IP address, gateway reachable.
:::

:::quiz
? Which identifies a program on a machine?
- MAC address
- IP address
+ Port
- Gateway
! The IP finds the machine; the port finds the program.
? Which protocol retransmits lost data?
+ TCP
- UDP
- ARP
- ICMP
! TCP is reliable; UDP is not.
? What is 127.0.0.1?
- The default gateway
- A DNS server
+ Loopback: the machine itself
- A broadcast address
! Traffic to 127.0.0.1 never leaves the machine.
:::
