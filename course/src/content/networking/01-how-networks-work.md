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

<!-- deeper -->
## Worked answer and common mistakes

Work from the bottom layer up and stop at the first failure:

1. **Cable / Wi-Fi connected?** (`ip -br link` shows `UP`)
2. **Machine has an IP address?** (`ip -br addr`; a 169.254.x.x address means DHCP failed)
3. **Gateway reachable?** (`ip route`, then `ping GATEWAY`)
4. **Name resolves?** (`getent hosts ev-search.corp.local`, `dig`)
5. **Port 443 reachable?** (`nc -zv ev-search.corp.local 443`)
6. **Web page loads?** (`curl -v https://...`; read the status code and any certificate error)

Order matters because each layer depends on the one below: if there is no IP address, checking DNS is a waste of time.

```run
cd ~/lab
echo "1-2) interface up and addressed:"; ip -brief addr show lo | awk '{print $1, $2, $3}'
echo "3) default route (empty in this lab means no gateway configured):"; ip route | grep -c default | awk '{print "default routes:", $1}'
echo "4) name resolution of something that cannot exist:"; getent hosts no-such-host.example || echo "   -> does not resolve (a DNS-layer failure)"
echo "5) a closed port:"; nc -zv -w 1 127.0.0.1 9 2>&1 | tail -1
```

:::warn Common mistakes
- **Starting at the application** ("restart the web server") before proving the network path.
- **Treating "ping fails" as "host down".** Many hosts block ICMP; test the real port with `nc -zv` or `curl`.
- **Confusing the three addresses:** MAC is the card, IP is the machine, port is the program.
- **Assuming DNS is fine because IPs work,** or vice versa; test each separately.
- **Testing from the wrong machine.** A path that works from your laptop can fail from the server; run checks from where the problem is.
:::
<!-- /deeper -->

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
