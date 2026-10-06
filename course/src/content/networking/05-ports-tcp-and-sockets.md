---
track: networking
title: Ports, TCP and sockets
short: Ports and TCP
sub: See a service listen, a client connect, and the TCP handshake in real packets.
---

:::goals
- explain listening ports and connections
- use `ss`, `nc` and `curl` to test a service
- read a TCP three-way handshake in `tcpdump`
- tell "connection refused" from "timed out"
:::

## Servers listen, clients connect

A **server program** asks the operating system to **listen** on a port. A **client** then connects to `IP:port`. Each connection is identified by four values: client IP, client port, server IP, server port. The client's port is a random "ephemeral" high port.

```setup
sudo ip netns del srv 2>/dev/null; sudo ip netns del cli 2>/dev/null
true
```

Build the same two-computer lab as before, with a web server on `srv`:

```run
for n in srv cli; do sudo ip netns add $n; sudo ip -n $n link set lo up; done
sudo ip link add s0 type veth peer name c0
sudo ip link set s0 netns srv; sudo ip link set c0 netns cli
sudo ip -n srv addr add 10.9.0.1/24 dev s0; sudo ip -n cli addr add 10.9.0.2/24 dev c0
sudo ip -n srv link set s0 up; sudo ip -n cli link set c0 up
sudo ip netns exec srv python3 -m http.server 8080 --bind 10.9.0.1 > /dev/null 2>&1 &
sleep 1
sudo ip netns exec srv ss -ltn | awk 'NR==1 || /8080/ {print $1, $4}'
```

State `LISTEN` means the program is waiting for connections.

## Testing a port, three ways

```run
sudo ip netns exec cli curl -s -o /dev/null -w "curl: HTTP %{http_code}\n" http://10.9.0.1:8080/
sudo ip netns exec cli nc -zv 10.9.0.1 8080 2>&1 | tail -1
sudo ip netns exec cli bash -c 'timeout 2 bash -c "</dev/tcp/10.9.0.1/8080" && echo "bash /dev/tcp: open"'
```

`nc -zv host port` is the quick "is this port open?" tool. The bash `/dev/tcp` trick works even when `nc` is not installed.

## Refused versus timed out

The two failure messages mean different things. This is the most useful diagnosis rule in networking.

```run
echo "-- nothing listening on port 9999:"
sudo ip netns exec cli nc -zv -w 2 10.9.0.1 9999 2>&1 | tail -1
echo "-- host that does not exist on the network:"
sudo ip netns exec cli nc -zv -w 2 10.9.0.77 8080 2>&1 | tail -1
```

| Symptom | Meaning |
|---|---|
| **Connection refused** | the machine is reachable, but nothing listens on that port (or it actively rejects). The service is down or the port is wrong |
| **Timed out** (no answer) | packets are being dropped or never arrive: firewall, wrong route, host down |
| **No route to host / unreachable** | your machine has no path to it |

## The three-way handshake

TCP starts every connection with three packets: **SYN** (client: "let us talk"), **SYN-ACK** (server: "okay"), **ACK** (client: "okay"). `tcpdump` lets us see them. `[S]` is SYN, `[S.]` is SYN-ACK, `[.]` is ACK, `[F.]` is FIN (close).

```run
sudo ip netns exec srv timeout 5 tcpdump -n -l -i s0 'tcp port 8080' 2>/dev/null | awk '{print $3, ">", $5, $7}' | sed 's/:$//' | head -4 &
sleep 1
sudo ip netns exec cli curl -s -o /dev/null http://10.9.0.1:8080/
wait %2 2>/dev/null
```

(The first four lines show: client SYN `[S]`, server SYN-ACK `[S.]`, client ACK `[.]`, then the HTTP request `[P.]`. Port numbers on the client side are random.)

## UDP is different

UDP has no handshake: a datagram is sent and may simply vanish. DNS queries use it. A UDP "port open" test cannot get a refusal in the same way, so it is harder to test.

```run
sudo ip netns exec srv bash -c 'timeout 3 nc -u -l 10.9.0.1 5353 > /tmp/udp.out &'
sleep 0.5
echo "hello over UDP" | sudo ip netns exec cli nc -u -w 1 10.9.0.1 5353
sleep 0.5
cat /tmp/udp.out; sudo rm -f /tmp/udp.out
```

## Cleaning up

```run
sudo ip netns pids srv | xargs -r sudo kill
sudo ip netns del srv; sudo ip netns del cli
sudo ip netns list | wc -l
```

:::tip A reusable triage
Cannot reach a service? Run in this order: `ping IP` (route and link), `nc -zv IP PORT` (port), `curl -v URL` (application). The first one that fails tells you the layer.
:::

<!-- deeper -->
## Worked answer and common mistakes

"Ping works but the port times out" points to a **firewall (or the wrong address or route for TCP) rather than a stopped SQL service**. If the SQL service were stopped, the host would still be reachable and its network stack would answer the connection attempt with a TCP **reset**, which you see immediately as **"connection refused"**. A **timeout** means the SYN was silently dropped or the reply never came back, which is what firewalls (and wrong routes) do. Verify:

```run
cd ~/lab
echo "refused = the machine answered 'nothing listens here':"
nc -zv -w 2 127.0.0.1 1433 2>&1 | tail -1
echo "From the real SQL server's side you would then check:  ss -ltn | grep 1433   (is it listening?)"
echo "and on the path:  nft list ruleset / Windows Firewall rules / cloud security group for TCP 1433"
```

:::warn Common mistakes
- **Equating timeout with "service down".** Refused = reachable but nothing listening; timeout = something is dropping or blocking.
- **Testing with ping only,** which may be allowed while the application port is blocked (or the reverse).
- **Testing from the wrong place.** A rule might allow your laptop but block the EV server's subnet.
- **Forgetting that UDP has no refusal,** so a UDP "open" test cannot be trusted the same way.
- **Looking only at the host firewall.** Network firewalls, load balancers and cloud security groups are in the path as well.
:::
<!-- /deeper -->

:::recap
- Servers listen on ports; clients connect from random high ports.
- `ss -ltn` lists listeners, `nc -zv` and `curl` test them.
- Refused = reachable but nothing listening. Timeout = dropped or unreachable.
- TCP handshake: SYN, SYN-ACK, ACK. `tcpdump` shows it.
:::

:::try Your turn
A health check script reports "connection timed out" to SQL01 on port 1433, but ping works. Which is more likely: SQL Server service stopped, or a firewall? Explain why using what you just learned.
:::

:::quiz
? "Connection refused" most likely means:
- A firewall dropped the packet
+ The host is reachable but nothing listens on that port
- DNS failed
- The cable is unplugged
! A refusal is an answer; a timeout is silence.
? What are the three TCP handshake packets?
+ SYN, SYN-ACK, ACK
- GET, POST, OK
- ARP, ICMP, DNS
- FIN, RST, PSH
! The client and server agree on starting numbers.
? Which command lists listening TCP ports?
- `ip route`
- `ping`
+ `ss -ltn`
- `dig`
! `-l` listening, `-t` TCP, `-n` numbers.
:::
