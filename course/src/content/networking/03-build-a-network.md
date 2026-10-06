---
track: networking
title: Build a network on one machine
short: Build a network
sub: Create two virtual computers, connect them with a virtual cable, and make them talk.
---

:::goals
- create network namespaces and virtual cables (`veth`)
- assign addresses and bring links up
- see ARP resolve an IP address into a MAC address
- use a bridge as a virtual switch for more than two machines
:::

## A lab with no hardware

Linux can create **network namespaces**: each has its own interfaces, addresses and routing table, so it behaves like a separate computer. A **veth pair** is a virtual network cable with a plug at each end. With these two features we can build real networks and use real tools on them. (This is also exactly how containers get their networking.)

```setup
for n in red blue green; do sudo ip netns del $n 2>/dev/null; done
sudo ip link del br0 2>/dev/null
true
```

Create two "computers", `red` and `blue`:

```run
sudo ip netns add red
sudo ip netns add blue
ip netns list | sort
```

Inside a namespace the machine is empty: not even loopback is up. Run commands in it with `ip netns exec NAME command`.

```run
sudo ip netns exec red ip -brief link
```

## Cable, addresses, power on

```run
sudo ip link add vr type veth peer name vb
sudo ip link set vr netns red
sudo ip link set vb netns blue
sudo ip -n red  addr add 10.0.0.1/24 dev vr
sudo ip -n blue addr add 10.0.0.2/24 dev vb
sudo ip -n red  link set vr up
sudo ip -n blue link set vb up
sudo ip -n red  -brief addr show vr
sudo ip -n blue -brief addr show vb
```

The same recipe on any machine: 1. interface exists, 2. it has an address and mask, 3. it is up.

```run
sudo ip netns exec red ping -c 2 -W 1 10.0.0.2
```

Success. Before the first packet could be sent, red had to ask "who has 10.0.0.2?" That question is **ARP** (Address Resolution Protocol), broadcast to everyone on the link; blue answers with its MAC address. Red remembers the answer in its **neighbour table**:

```run
sudo ip netns exec red ip neigh show | awk '{print $1, $4=="lladdr" ? "has a MAC" : $4, $NF}'
```

## What if we forget a step?

Break things on purpose. This is how you learn to diagnose.

```run
sudo ip -n blue link set vb down
sudo ip netns exec red ping -c 1 -W 1 10.0.0.2 2>&1 | tail -2
sudo ip -n blue link set vb up
sudo ip -n blue addr flush dev vb
sudo ip -n blue addr add 10.0.1.2/24 dev vb
sudo ip netns exec red ping -c 1 -W 1 10.0.0.2 2>&1 | tail -2
sudo ip netns exec red ping -c 1 -W 1 10.0.1.2 2>&1 | tail -2
```

Two different failures. With the link down, nothing arrives. After the address change, nobody owns `10.0.0.2` any more, so the ARP question goes unanswered and the ping gets no reply either. With blue on a different subnet (`10.0.1.0/24`), red does not even try to reach it directly: it has no route to `10.0.1.2`, so it reports **Network is unreachable**. That message always means "I have no route for that address", not "the other machine is off".

## More than two machines: a bridge

A **bridge** is a virtual switch. Plug several cables into it and all machines on it share one network. Add `green` and put all three on a bridge:

```run
sudo ip -n blue addr flush dev vb
sudo ip -n blue link set vb down
sudo ip netns del red
sudo ip netns del blue
sudo ip link add br0 type bridge
sudo ip link set br0 up
for h in red blue green; do
  sudo ip netns add $h
  sudo ip link add v-$h type veth peer name p-$h
  sudo ip link set v-$h netns $h
  sudo ip link set p-$h master br0
  sudo ip link set p-$h up
  sudo ip -n $h link set v-$h up
done
sudo ip -n red   addr add 10.0.0.1/24 dev v-red
sudo ip -n blue  addr add 10.0.0.2/24 dev v-blue
sudo ip -n green addr add 10.0.0.3/24 dev v-green
sudo ip netns exec red ping -c 1 -W 1 10.0.0.2 | grep -c "1 received"
sudo ip netns exec red ping -c 1 -W 1 10.0.0.3 | grep -c "1 received"
sudo ip netns exec green ping -c 1 -W 1 10.0.0.2 | grep -c "1 received"
bridge link | awk '{print $2}' | sed 's/@.*//' | sort
```

Three computers, one switch, all reaching each other. Docker's default `docker0` is exactly this: a bridge with a virtual cable per container.

```run
for h in red blue green; do sudo ip netns del $h; done
sudo ip link del br0
sudo ip netns list | wc -l
```

<!-- deeper -->
## Worked answers and common mistakes

```run
cd ~/lab
for n in h1 h2; do sudo ip netns del $n 2>/dev/null; done
sudo ip netns add h1; sudo ip netns add h2
sudo ip link add x1 type veth peer name x2
sudo ip link set x1 netns h1; sudo ip link set x2 netns h2
sudo ip -n h1 addr add 10.20.1.5/16 dev x1
sudo ip -n h2 addr add 10.20.2.9/16 dev x2
sudo ip -n h1 link set x1 up; sudo ip -n h2 link set x2 up
echo "both /16, different third octet (same network):"
sudo ip netns exec h1 ping -c 1 -W 1 10.20.2.9 | grep -c "1 received" | awk '{print "reply received:", ($1==1?"yes":"no")}'
echo "now make h2 a /24 (it thinks 10.20.1.5 is on another network):"
sudo ip -n h2 addr flush dev x2; sudo ip -n h2 addr add 10.20.2.9/24 dev x2
sudo ip netns exec h1 ping -c 1 -W 1 10.20.2.9 | grep -c "1 received" | awk '{print "h1 -> h2 reply:", ($1==1?"yes":"no")}'
sudo ip netns exec h2 ping -c 1 -W 1 10.20.1.5 2>&1 | tail -1
for n in h1 h2; do sudo ip netns del $n; done
```

With mismatched masks the failure is **asymmetric**: `h1` believes `h2` is local and sends the packet. `h2` receives it but its reply goes to `10.20.1.5`, which it believes is on a *different* network, so it looks for a gateway it does not have ("Network is unreachable"). Symptom: one direction works, the other does not. Always compare masks on both ends.

:::warn Common mistakes
- **Forgetting `ip link set ... up`** (an address on a down interface does nothing).
- **Deleting a namespace but not its leftovers.** Delete the bridge and veth ends too; list with `ip -br link`.
- **Reading "request timed out" as "host down".** It might be the reply path (routing or firewall in the other direction).
- **Duplicate IP addresses.** Two machines with one address cause intermittent failures; look for conflicting ARP entries (`ip neigh`).
:::
<!-- /deeper -->

:::recap
- A namespace is a virtual computer; a veth pair is a cable; a bridge is a switch.
- Connectivity checklist: interface exists, has address and mask, is up.
- ARP maps an IP to a MAC on the local network.
- "Network is unreachable" means no route; no reply means something else.
:::

:::try Your turn
Rebuild the two-host network using `10.20.0.0/16` addresses, and prove they can ping. What breaks if one host is `/16` and the other `/24` with addresses in different third octets?
:::

:::quiz
? What does ARP do?
- Encrypts traffic
+ Finds the MAC address for an IP on the local network
- Finds the IP for a name
- Assigns IP addresses
! DNS is names to IPs; ARP is IP to MAC.
? "Network is unreachable" means:
+ The machine has no route for that destination
- The remote machine is switched off
- DNS failed
- The port is closed
! Check addresses, masks and the default gateway.
? A bridge in Linux acts like:
- A router
- A firewall
+ A switch
- A DNS server
! It joins interfaces into one network.
:::
