---
track: networking
title: Firewalls and NAT
short: Firewalls, NAT
sub: Allow and block traffic with nftables, and hide private networks behind one address.
---

:::goals
- explain what a firewall rule is (match, action) and why order matters
- write `nftables` rules to allow and block ports
- explain NAT and port forwarding and build them
:::

## A firewall is a list of rules

A **firewall** inspects packets and decides: **accept**, **drop** (silently discard, the client times out) or **reject** (refuse loudly, the client sees "refused"). Rules are checked in order and the first match wins. The usual design is: **default deny**, then allow only what is needed (SSH, HTTPS...).

Linux's firewall is **netfilter**, configured with `nftables` (command `nft`) or the older `iptables`. Tools like `ufw` (Ubuntu) and `firewalld` (Red Hat) are friendlier front ends. In cloud platforms the same idea is called a **security group** or **network security group**. On Windows it is Windows Defender Firewall.

```setup
sudo ip netns del srv 2>/dev/null; sudo ip netns del cli 2>/dev/null
true
```

## Block a port, see the difference

Rebuild the server and client from the ports lesson. The server runs two web services, on ports 8080 and 9090.

```run
for n in srv cli; do sudo ip netns add $n; sudo ip -n $n link set lo up; done
sudo ip link add s0 type veth peer name c0
sudo ip link set s0 netns srv; sudo ip link set c0 netns cli
sudo ip -n srv addr add 10.9.0.1/24 dev s0; sudo ip -n cli addr add 10.9.0.2/24 dev c0
sudo ip -n srv link set s0 up; sudo ip -n cli link set c0 up
sudo ip netns exec srv python3 -m http.server 8080 --bind 10.9.0.1 > /dev/null 2>&1 &
sudo ip netns exec srv python3 -m http.server 9090 --bind 10.9.0.1 > /dev/null 2>&1 &
sleep 1
for p in 8080 9090; do sudo ip netns exec cli nc -zv -w 2 10.9.0.1 $p 2>&1 | tail -1; done
```

Now give the server a firewall with default deny, allowing only 8080:

```run
sudo ip netns exec srv nft -f - <<'EOF'
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    icmp type echo-request accept
    tcp dport 8080 accept
  }
}
EOF
sudo ip netns exec srv nft list chain inet filter input
```

Read the rules in order: allow loopback, allow replies to connections we started (`established,related`), allow ping, allow TCP port 8080, and everything else is dropped by the `policy drop`.

```run
for p in 8080 9090; do sudo ip netns exec cli nc -zv -w 2 10.9.0.1 $p 2>&1 | tail -1; done
```

8080 works; 9090 **times out** (silent drop), as predicted in the last lesson. Switch to an active **reject** and the symptom changes to "refused":

```run
sudo ip netns exec srv nft add rule inet filter input tcp dport 9090 reject with tcp reset
sudo ip netns exec cli nc -zv -w 2 10.9.0.1 9090 2>&1 | tail -1
sudo ip netns exec srv nft flush ruleset
sudo ip netns exec cli nc -zv -w 2 10.9.0.1 9090 2>&1 | tail -1
```

:::warn Two classic mistakes
1. Setting default deny on a remote server **before** allowing SSH, and locking yourself out. Always add the allow rule first (and have a console or a timed rollback).
2. Rules that are correct but in the wrong order: an early `accept` or `drop` hides later rules.
:::

## NAT: many private addresses behind one public one

Private addresses (`10.x`, `192.168.x`) cannot travel on the internet. **NAT** (network address translation) fixes that: a gateway rewrites the source address of outgoing packets to its own public address, remembers the mapping, and translates replies back. This is why your home router lets all your devices share one connection.

| Type | Rewrites | Used for |
|---|---|---|
| **SNAT / masquerade** | source address of outgoing packets | private network to the internet |
| **DNAT / port forward** | destination of incoming packets | publish an internal service: "public:80 -> 10.0.0.10:8080" |

Build it: `inside` (10.1.0.2) -> `gw` (10.1.0.1 inside, 192.0.2.1 outside) -> `outside` (192.0.2.2), where the outside server records who connected to it.

```run
sudo pkill -f "[h]ttp.server" ; for n in srv cli; do sudo ip netns del $n; done
for n in inside gw outside; do sudo ip netns add $n; sudo ip -n $n link set lo up; done
sudo ip link add i0 type veth peer name g0; sudo ip link set i0 netns inside; sudo ip link set g0 netns gw
sudo ip link add g1 type veth peer name o0; sudo ip link set g1 netns gw; sudo ip link set o0 netns outside
sudo ip -n inside addr add 10.1.0.2/24 dev i0;  sudo ip -n gw addr add 10.1.0.1/24 dev g0
sudo ip -n gw addr add 192.0.2.1/24 dev g1;     sudo ip -n outside addr add 192.0.2.2/24 dev o0
for p in "inside i0" "gw g0" "gw g1" "outside o0"; do set -- $p; sudo ip -n $1 link set $2 up; done
sudo ip -n inside route add default via 10.1.0.1
sudo ip netns exec gw sysctl -qw net.ipv4.ip_forward=1
sudo ip netns exec outside python3 -c "
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(('you connected from ' + self.client_address[0] + '\n').encode())
    def log_message(self, *a): pass
http.server.HTTPServer(('192.0.2.2', 8000), H).serve_forever()" &
sleep 1
echo "-- without NAT:"
sudo ip netns exec inside curl -s -m 2 http://192.0.2.2:8000/ || echo "no reply (the outside host has no route back to 10.1.0.0/24)"
```

The request leaves, but the reply cannot find its way back to a private address. Turn on masquerade on the gateway:

```run
sudo ip netns exec gw nft -f - <<'EOF'
table ip nat {
  chain postrouting {
    type nat hook postrouting priority 100;
    oif "g1" masquerade
  }
}
EOF
echo "-- with NAT:"
sudo ip netns exec inside curl -s -m 2 http://192.0.2.2:8000/
```

The outside server sees `192.0.2.1` (the gateway), not `10.1.0.2`. That is NAT. **DNAT** is the mirror image for inbound traffic: `nft add rule ip nat prerouting tcp dport 80 dnat to 10.1.0.2:8080` publishes an internal server. Docker's `-p 8080:80` does exactly this behind the scenes.

```run
sudo pkill -f "[H]TTPServer" ; sudo ip netns pids outside | xargs -r sudo kill
for n in inside gw outside; do sudo ip netns del $n; done
sudo ip netns list | wc -l
```

<!-- deeper -->
## A worked solution

```run
cd ~/lab
sudo ip netns del fw 2>/dev/null; sudo ip netns add fw
sudo ip netns exec fw nft -f - <<'EOF'
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    ip saddr 10.0.0.0/24 tcp dport 22 accept
    tcp dport 443 accept
  }
}
EOF
sudo ip netns exec fw nft list chain inet filter input
sudo ip netns del fw
```

Reading it: the **policy drop** is the default; the accepts above it are the exceptions. The rule that must exist **before the default drop starts blocking you** is the **`ct state established,related accept`** rule (so replies to connections you started, and your current SSH session, keep working). Add your SSH allow rule first, always, on a remote machine.

:::warn Common mistakes
- **Locking yourself out:** setting default drop before allowing SSH from your address.
- **Forgetting `established,related`,** which breaks return traffic.
- **Rule order.** The first matching rule wins; a broad accept above a specific drop makes the drop useless.
- **Allowing too wide a source** (`0.0.0.0/0` for SSH or RDP).
- **Rules not persisted.** `nft` rules live in memory; save them (`/etc/nftables.conf`) and enable the service.
- **Forgetting IPv6.** An `inet` table covers both; an IPv4-only table leaves IPv6 open.
:::
<!-- /deeper -->

:::recap
- Firewall rules: match, then accept/drop/reject; first match wins; default deny.
- drop causes timeouts; reject causes "refused".
- nftables: tables, chains, rules. `nft list ruleset` to inspect.
- SNAT/masquerade shares one public address; DNAT/port forwarding publishes an internal service.
- Cloud security groups and Docker port mapping are the same ideas.
:::

:::try Your turn
Write nft rules for a web server that allows SSH only from `10.0.0.0/24` and HTTPS from anywhere, dropping the rest. Which rule must come before the default drop takes effect?
:::

:::quiz
? A firewall silently drops packets to a port. What does the client see?
- Connection refused
+ A timeout
- An instant error
- Nothing unusual
! Reject gives "refused"; drop gives silence.
? What does masquerade (SNAT) do?
+ Rewrites the source address of outgoing packets
- Encrypts traffic
- Blocks ports
- Assigns DHCP leases
! The gateway keeps a table to translate replies back.
? Which rule order is correct for a remote server?
- Default deny, then allow SSH
+ Allow SSH, then default deny
- Reboot first
- It does not matter
! Otherwise you lock yourself out.
:::
