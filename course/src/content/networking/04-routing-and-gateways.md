---
track: networking
title: Routing and gateways
short: Routing
sub: How traffic crosses from one network to another, and what a default gateway is.
---

:::goals
- read a routing table
- explain the default gateway
- build a router between two networks and enable forwarding
- use `traceroute` to see the path
:::

## The routing table

Every machine decides where to send each packet by looking at its **routing table**. The rule is simple: find the **most specific** matching route (longest prefix) and send the packet there. Anything that matches nothing else goes to the **default route** (`default via ...`), the **default gateway**, which is the router that knows the way out.

```setup
for n in a r b; do sudo ip netns del $n 2>/dev/null; done
true
```

## A router between two networks

Topology: host `a` is in `10.1.0.0/24`, host `b` is in `10.2.0.0/24`, and `r` sits between them with a leg in each.

```
a (10.1.0.2) --- (10.1.0.1) r (10.2.0.1) --- (10.2.0.2) b
```

```run
for n in a r b; do sudo ip netns add $n; sudo ip -n $n link set lo up; done
sudo ip link add a-r type veth peer name r-a
sudo ip link add b-r type veth peer name r-b
sudo ip link set a-r netns a; sudo ip link set r-a netns r
sudo ip link set b-r netns b; sudo ip link set r-b netns r
sudo ip -n a addr add 10.1.0.2/24 dev a-r
sudo ip -n r addr add 10.1.0.1/24 dev r-a
sudo ip -n r addr add 10.2.0.1/24 dev r-b
sudo ip -n b addr add 10.2.0.2/24 dev b-r
for p in "a a-r" "r r-a" "r r-b" "b b-r"; do set -- $p; sudo ip -n $1 link set $2 up; done
sudo ip netns exec a ip route
```

`a` knows only its own network. Try to reach `b`:

```run
sudo ip netns exec a ping -c 1 -W 1 10.2.0.2 2>&1 | tail -1
```

"Network is unreachable": `a` has no route to `10.2.0.0/24`. Tell it to use `r` as its **default gateway**, and tell `b` the same:

```run
sudo ip -n a route add default via 10.1.0.1
sudo ip -n b route add default via 10.2.0.1
sudo ip netns exec a ip route
sudo ip netns exec a ping -c 1 -W 1 10.2.0.2 2>&1 | tail -2
```

Still no reply. The packet reaches `r`, but by default Linux does **not forward** packets between interfaces. A router is just a computer with forwarding switched on:

```run
sudo ip netns exec r sysctl -w net.ipv4.ip_forward=1
sudo ip netns exec a ping -c 2 -W 1 10.2.0.2 | grep -E "received"
sudo ip netns exec a traceroute -n -m 3 10.2.0.2 | awk '{print $1, $2}'
```

The traceroute shows two hops: first the router `10.1.0.1`, then the destination `10.2.0.2`. Each hop is a router decrementing the packet's **TTL** (time to live); when it reaches 0 the router reports back, which is how traceroute discovers the path.

## Reading the table, line by line

```run
sudo ip netns exec r ip route
```

Each line is `destination via gateway dev interface`. A line without `via` means "directly connected": deliver on that interface. Everything the router needs is there because both its networks are directly attached.

## Static versus dynamic routing

| Kind | How routes appear | Where |
|---|---|---|
| Directly connected | automatically from interface addresses | everywhere |
| Static | you add them (`ip route add`) | small networks, cloud route tables |
| Dynamic (OSPF, BGP) | routers exchange them | large networks, the internet |

In AWS or Azure, "route tables" are exactly this idea: a list of `destination -> target` lines, with `0.0.0.0/0` as the default route pointing to an internet gateway or NAT.

:::note On Windows
`route print` shows the table, `route add 10.2.0.0 mask 255.255.255.0 10.1.0.1` adds a static route, and `tracert` is traceroute.
:::

```run
for n in a r b; do sudo ip netns del $n; done
sudo ip netns list | wc -l
```

<!-- deeper -->
## Worked answer and common mistakes

Add a network `10.3.0.0/24` behind `b` (reached through a new router `b` or a router interface). The rule is: **every router on the path needs a route to the destination, and the destination needs a route back**.

| Machine | Needs | Because |
|---|---|---|
| `a` | default via `r` (already has it) | everything off-link goes to the router `r` |
| `r` | `10.3.0.0/24 via 10.2.0.2` (b's address) | `r` must know that `b` is the way to the new network |
| `b` | `ip_forward=1` and a connected interface in `10.3.0.0/24` | `b` is now also a router for that network |
| hosts in `10.3.0.0/24` | default via `b`'s interface in that network | replies must find their way back |

```run
cd ~/lab
echo "The one command r needs (printed, not run):"
echo "  sudo ip -n r route add 10.3.0.0/24 via 10.2.0.2"
echo "and on b:  sudo ip netns exec b sysctl -w net.ipv4.ip_forward=1"
```

:::warn Common mistakes
- **Fixing only one direction.** Packets arrive but replies cannot return; traceroute shows where it stops, ping to the far side may seem fine from one end only.
- **Forgetting `ip_forward`** on the router (it quietly drops transit traffic).
- **A default route on the wrong interface,** or two default routes.
- **Overlapping routes.** The most specific (longest prefix) wins; a stray `/24` can hijack traffic meant for a `/16`.
- **Static routes that vanish at reboot.** Put them in the network configuration (netplan, NetworkManager) or use a routing daemon.
:::
<!-- /deeper -->

:::recap
- A route is "to reach this network, send to this next hop".
- The default gateway (`default via`) catches everything not matched by a more specific route.
- Forwarding (`ip_forward`) turns a Linux machine into a router.
- `traceroute` reveals hops using TTL.
:::

:::try Your turn
Add a third network `10.3.0.0/24` behind `b`'s side. What routes must `a`, `r` and `b` each have so that `a` can reach it?
:::

:::quiz
? What is a default gateway?
+ The router used when no more specific route matches
- The DNS server
- The first host in a subnet
- The firewall
! It is the route of last resort, shown as `default via`.
? Packets reach the router but are not forwarded. What setting is missing?
+ `net.ipv4.ip_forward=1`
- A new MAC address
- DNS
- A bridge
! Linux only forwards between interfaces when forwarding is enabled.
? Which route wins for 10.2.0.5 if both 10.2.0.0/24 and default exist?
- default
+ 10.2.0.0/24 (most specific)
- Whichever is listed first
- Neither
! Longest prefix match wins.
:::
