---
track: networking
title: IP addressing and subnets
short: IP and subnets
sub: Read CIDR notation like /24, and work out which machines share a network.
---

:::goals
- read an IPv4 address in binary and decimal
- explain subnet masks and CIDR (`/24`)
- work out network, broadcast and usable range
- recognise private address ranges
:::

## An IPv4 address is a 32-bit number

`192.168.1.10` is four numbers (0 to 255) called **octets**, each 8 bits: 11000000.10101000.00000001.00001010. Humans use the dotted form.

```run
python3 - <<'EOF'
import ipaddress
ip = ipaddress.ip_address("192.168.1.10")
print("as a number:", int(ip))
print("as binary  :", ".".join(f"{o:08b}" for o in ip.packed))
EOF
```

## Network part and host part

An address has two parts: which **network** it is on and which **host** within it. The **subnet mask** (or **prefix length**) marks the split. Written with a slash it is **CIDR** notation:

| CIDR | Mask | Network bits | Host bits | Addresses |
|---|---|---|---|---|
| /8 | 255.0.0.0 | 8 | 24 | 16,777,216 |
| /16 | 255.255.0.0 | 16 | 16 | 65,536 |
| /24 | 255.255.255.0 | 24 | 8 | 256 |
| /25 | 255.255.255.128 | 25 | 7 | 128 |
| /26 | 255.255.255.192 | 26 | 6 | 64 |
| /30 | 255.255.255.252 | 30 | 2 | 4 |

`192.168.1.10/24` means: the first 24 bits (`192.168.1`) are the network, the last 8 bits are the host. Two machines can talk **directly** only if they are on the same network; otherwise traffic goes through a **router** (gateway).

Of the addresses in a subnet, the first (all host bits 0) is the **network address** and the last (all host bits 1) is the **broadcast address**. Neither can be given to a host, so usable hosts = 2^(host bits) - 2.

```run
python3 - <<'EOF'
import ipaddress
for cidr in ["192.168.1.10/24", "10.0.5.77/26", "172.16.0.9/30"]:
    n = ipaddress.ip_interface(cidr).network
    hosts = list(n.hosts())
    print(f"{cidr:16} network={n.network_address}  broadcast={n.broadcast_address}  usable={len(hosts)}  range={hosts[0]} - {hosts[-1]}")
EOF
```

## Try the calculator

@widget cidr

## Same network or not?

```run
python3 - <<'EOF'
import ipaddress
def same(a, b, prefix):
    net = ipaddress.ip_network(f"{a}/{prefix}", strict=False)
    return ipaddress.ip_address(b) in net
print("10.0.0.5 and 10.0.0.200 on /24 :", same("10.0.0.5", "10.0.0.200", 24))
print("10.0.0.5 and 10.0.1.5   on /24 :", same("10.0.0.5", "10.0.1.5", 24))
print("10.0.0.5 and 10.0.1.5   on /23 :", same("10.0.0.5", "10.0.1.5", 23))
EOF
```

A very common real fault: two machines have the right addresses but **different masks** and cannot reach each other.

## Private ranges and special addresses

| Range | CIDR | Use |
|---|---|---|
| 10.0.0.0 - 10.255.255.255 | 10.0.0.0/8 | private networks |
| 172.16.0.0 - 172.31.255.255 | 172.16.0.0/12 | private (Docker uses 172.17.x) |
| 192.168.0.0 - 192.168.255.255 | 192.168.0.0/16 | home and small office |
| 127.0.0.0/8 | | loopback |
| 169.254.0.0/16 | | **link-local**: assigned when DHCP fails (a "169.254" address means DHCP did not answer) |
| 0.0.0.0 | | "any address" or "unknown" |

Private addresses are not routed on the internet. A **NAT** device (your router, a cloud gateway) rewrites them to a public address; a later lesson builds one.

```run
python3 - <<'EOF'
import ipaddress
for a in ["10.1.2.3", "172.20.0.5", "192.168.0.9", "169.254.10.1", "8.8.8.8"]:
    ip = ipaddress.ip_address(a)
    print(f"{a:14} private={ip.is_private} link_local={ip.is_link_local}")
EOF
```

## How addresses are assigned

- **Static**: you type it in. Used for servers.
- **DHCP**: a server hands out an address, mask, gateway and DNS server automatically (lease). Used for most clients.
- **IPv6**: 128-bit addresses like `2001:db8::1`, written in hex. The ideas (prefix, host part, routing) are the same; it removes the shortage of IPv4 addresses.

<!-- deeper -->
## Worked answers and common mistakes

```run
cd ~/lab
python3 - <<'EOF'
import ipaddress
n = ipaddress.ip_network("10.0.0.0/27")
print("/27 has", n.num_addresses, "addresses, usable hosts:", n.num_addresses - 2)
print("10.0.0.130 in 10.0.0.0/25 ?", ipaddress.ip_address("10.0.0.130") in ipaddress.ip_network("10.0.0.0/25"))
print("(10.0.0.0/25 covers", ipaddress.ip_network("10.0.0.0/25")[0], "to", ipaddress.ip_network("10.0.0.0/25")[-1], ")")
print()
print("How to do it by hand: /27 leaves 32-27 = 5 host bits, 2^5 = 32 addresses, minus network and broadcast = 30 usable.")
print("A /25 has 7 host bits = 128 addresses, so it covers .0 to .127; .130 is outside.")
EOF
```

**Shortcut for any prefix:** host bits = 32 minus prefix; addresses = 2^host bits; usable = that minus 2 (network and broadcast). The block size in the interesting octet tells you where subnets start (a /26 has blocks of 64: .0, .64, .128, .192).

:::warn Common mistakes
- **Forgetting the minus 2** (network and broadcast addresses are not usable hosts).
- **Mixing up `/24` and the mask** (`255.255.255.0`); learn both notations.
- **Overlapping subnets.** `10.0.0.0/24` and `10.0.0.128/25` overlap; routing becomes ambiguous.
- **Assuming a different third octet is a different network.** It depends on the prefix: with `/16`, `10.20.1.5` and `10.20.2.9` are on the **same** network.
- **Treating private ranges as private forever.** If you connect two sites that both use `192.168.1.0/24`, you have a conflict; plan addressing early.
:::
<!-- /deeper -->

:::recap
- IPv4 = 32 bits shown as four octets. The prefix (`/24`) says how many bits are the network.
- Network address and broadcast address are not usable. Usable = 2^host bits - 2.
- Same network means direct delivery; otherwise via a gateway.
- Private ranges: 10/8, 172.16/12, 192.168/16. 169.254 means DHCP failed.
:::

:::try Your turn
How many usable hosts in a /27? Is `10.0.0.130` in `10.0.0.0/25`? Check your answers with the calculator.
:::

:::quiz
? How many usable host addresses are in a /24?
- 256
+ 254
- 255
- 24
! 256 minus the network and broadcast addresses.
? A client has address 169.254.7.20. What is likely wrong?
- DNS is down
+ It did not get an address from DHCP
- The firewall blocks it
- The cable is unplugged
! 169.254.x.x is assigned automatically when DHCP fails.
? Which is a private address?
- 8.8.8.8
- 172.32.0.1
+ 172.20.0.1
- 11.0.0.1
! 172.16.0.0 to 172.31.255.255 is private.
:::
