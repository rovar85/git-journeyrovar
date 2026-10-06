=== networking/01
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

=== networking/02
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

=== networking/03
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

=== networking/04
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

=== networking/05
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

=== networking/06
## Worked answer and common mistakes

`ping 10.0.0.20` works, so the network path is fine; the failure is **name resolution**. Check in this order:

1. **What does this machine think the name is?** `getent hosts sql01` (checks `/etc/hosts`, then DNS, exactly as applications do).
2. **Which DNS server is it using, and does that server know the name?** `cat /etc/resolv.conf` then `dig @DNSSERVER sql01 +short` (and `dig @DNSSERVER sql01.corp.local` with the full domain: a **missing search suffix** is a classic cause).
3. **Is the DNS server reachable?** `dig @DNSSERVER . +time=2 +tries=1`, or `nc -zvu DNSSERVER 53`. Timeout here is a different problem from NXDOMAIN.

```run
cd ~/lab
echo "--- how this machine resolves names (order and servers):"
grep '^hosts:' /etc/nsswitch.conf
echo "--- an unknown name through the system resolver:"
getent hosts sql01-does-not-exist || echo "no answer (NXDOMAIN or no DNS)"
```

Fixes depend on the finding: add the record (or correct it) on the DNS server; fix the client's DNS server or search domain (DHCP option or `resolv.conf`); flush stale caches (`resolvectl flush-caches`, `ipconfig /flushdns` on Windows).

:::warn Common mistakes
- **Assuming "the network is down"** when only DNS is.
- **Using a short name where the full name is needed** (search suffix not configured).
- **Stale caches.** The record is fixed on the server but the client (or an intermediate cache) still holds the old answer until the TTL expires.
- **A hosts-file entry forgotten for years** overriding DNS on one machine only: "works on that server, not this one".
- **Querying only one DNS server** when the machine uses several.
:::

=== networking/07
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

=== networking/08
## Worked answer and common mistakes

Check the expiry date of the certificate the server actually presents:

```term
$ echo | openssl s_client -connect ev.corp.local:443 -servername ev.corp.local 2>/dev/null | openssl x509 -noout -dates -subject -issuer
notBefore=Jan  5 00:00:00 2025 GMT
notAfter=Jan  5 00:00:00 2026 GMT
```

(Example output; there is no real server here.) The two other TLS problems to rule out: a **wrong name** (the certificate's subject alternative names do not include the host name users type) and an **untrusted or incomplete chain** (the CA or an intermediate is not trusted or not sent). Also check the **clock** on the client and the server: a wrong date makes valid certificates look expired. Try the checks on a certificate you can make yourself:

```run
cd ~/lab
openssl req -x509 -newkey rsa:2048 -nodes -keyout t.key -out t.crt -days 1 -subj "/CN=ev01.corp.local" -addext "subjectAltName=DNS:ev01.corp.local" 2>/dev/null
echo "valid for the next 24h?  $(openssl x509 -in t.crt -noout -checkend 86400 >/dev/null && echo yes || echo 'no: expires within 24h')"
echo "valid for the next 2 days? $(openssl x509 -in t.crt -noout -checkend 172800 >/dev/null && echo yes || echo 'no: expires within 2 days')"
openssl x509 -in t.crt -noout -ext subjectAltName | tail -1 | sed 's/^ *//'
rm -f t.key t.crt
```

`-checkend SECONDS` is a monitoring-friendly check: exit status 0 if the certificate is still valid that many seconds from now.

:::warn Common mistakes
- **Looking at the certificate file on disk** instead of the one the server **presents** (the service may not have been restarted after renewal).
- **Renewing the leaf certificate but not the intermediates** (broken chain).
- **Using a name not in the SAN list** (the old Common Name is ignored by modern clients).
- **No expiry monitoring.** Alert at 30 and 7 days; many outages are simply a forgotten renewal.
- **Disabling certificate checks (`curl -k`)** as a "fix" and leaving it in scripts.
:::
