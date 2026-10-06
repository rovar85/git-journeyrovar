---
track: networking
title: DNS: names to addresses
short: DNS
sub: How a name becomes an IP address, and how to debug "name resolution failed".
---

:::goals
- explain what DNS does and the main record types
- trace how a machine resolves a name (`/etc/hosts`, resolver, DNS server)
- run a small DNS server and query it with `dig`
- diagnose resolution failures like the EV "Name resolution failed for SQL01"
:::

## Why DNS exists

People remember names (`sql01.corp.local`); networks use addresses (`10.0.5.20`). **DNS** (Domain Name System) is the global phone book that translates one into the other. It is also a **hierarchy**: read a name right to left. `sql01.corp.local` is host `sql01` in domain `corp` in the top-level `local`. Each level of the hierarchy is run by different **name servers**.

### Main record types

| Record | Meaning | Example |
|---|---|---|
| **A** | name to IPv4 address | `sql01.lab -> 10.0.0.20` |
| **AAAA** | name to IPv6 address | |
| **CNAME** | alias to another name | `www -> web01` |
| **MX** | mail server for a domain | |
| **TXT** | free text (SPF, verification) | |
| **PTR** | reverse: address to name | |
| **NS** | which servers are authoritative for the zone | |
| **SRV** | service location (used by Active Directory) | |

## How your machine resolves a name

1. Check local overrides: the **hosts file** (`/etc/hosts`; on Windows `C:\Windows\System32\drivers\etc\hosts`).
2. Check the local cache.
3. Ask the **DNS server** listed in `/etc/resolv.conf` (given by DHCP or typed in). That server may ask others on your behalf (**recursion**) and caches the answer for the record's **TTL** (time to live).

The order is controlled by `/etc/nsswitch.conf`:

```run
grep '^hosts:' /etc/nsswitch.conf
cat /etc/hosts | head -3
```

Tools: `getent hosts NAME` resolves the way programs do (hosts file, then DNS). `dig` and `nslookup` query DNS directly, skipping the hosts file.

```run
echo "10.0.0.20 sql01.lab" | sudo tee -a /etc/hosts > /dev/null
getent hosts sql01.lab
sudo sed -i '/sql01.lab/d' /etc/hosts
getent hosts sql01.lab || echo "no answer: name does not resolve"
```

## A DNS server of our own

`dnsmasq` is a tiny DNS (and DHCP) server. We run one in a network namespace, with two records, and ask it with `dig`.

```setup
sudo ip netns del dns 2>/dev/null; sudo ip netns del cli 2>/dev/null
true
```

```run
for n in dns cli; do sudo ip netns add $n; sudo ip -n $n link set lo up; done
sudo ip link add d0 type veth peer name c0
sudo ip link set d0 netns dns; sudo ip link set c0 netns cli
sudo ip -n dns addr add 10.7.0.1/24 dev d0; sudo ip -n cli addr add 10.7.0.2/24 dev c0
sudo ip -n dns link set d0 up; sudo ip -n cli link set c0 up
sudo ip netns exec dns dnsmasq --no-daemon --no-resolv --no-hosts --listen-address=10.7.0.1 --bind-interfaces \
  --local=/lab/ --address=/sql01.lab/10.0.0.20 --address=/ev01.lab/10.0.0.10 --cname=www.lab,ev01.lab \
  --pid-file=/tmp/dnsmasq-lab.pid > /tmp/dnsmasq-lab.log 2>&1 &
sleep 1
sudo ip netns exec cli dig @10.7.0.1 sql01.lab A +short
sudo ip netns exec cli dig @10.7.0.1 ev01.lab A +short
sudo ip netns exec cli dig @10.7.0.1 www.lab +short
```

`+short` prints just the answer. Without it, `dig` shows the full response. The useful parts:

```run
sudo ip netns exec cli dig @10.7.0.1 sql01.lab A +noall +answer +comments | grep -v "^;; OPT\|^;; flags\|^$" | sed 's/id: [0-9]*/id: NNNN/'
```

The answer line reads: name, TTL, class `IN`, type `A`, value. `status: NOERROR` means the server answered. Now see failures, because that is what you will actually meet:

```run
echo "-- a name the server does not know:"
sudo ip netns exec cli dig @10.7.0.1 nosuch.lab A +noall +comments | grep -o "status: [A-Z]*"
echo "-- a DNS server that is not there:"
sudo ip netns exec cli dig @10.7.0.99 sql01.lab +time=1 +tries=1 2>&1 | grep -E "timed out|no servers" | head -1
```

| Result | Meaning |
|---|---|
| `NOERROR` with an answer | all good |
| `NXDOMAIN` | the name does not exist (typo, missing record) |
| `SERVFAIL` | the server tried and failed (upstream problem) |
| timeout / "no servers could be reached" | cannot reach the DNS server at all (network, firewall, wrong server) |

This maps directly to the EV log line `Name resolution failed for SQL01`: it is either NXDOMAIN (record missing, wrong domain suffix), or a timeout (DNS server unreachable), and the quickest way to know which is `dig`/`nslookup` against the server your machine actually uses.

```run
sudo pkill -f "[d]nsmasq.*sql01.lab" ; sleep 0.3
sudo ip netns del dns; sudo ip netns del cli
sudo rm -f /tmp/dnsmasq-lab.log /tmp/dnsmasq-lab.pid
sudo ip netns list | wc -l
```

## Windows side

`nslookup sql01`, `Resolve-DnsName sql01`, `ipconfig /flushdns` (clear cache), `ipconfig /displaydns`. In an EV/Active Directory world, DNS also stores where the **domain controllers** are (SRV records), so broken DNS breaks logins, not just names.

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- DNS translates names to addresses; records: A, AAAA, CNAME, MX, TXT, PTR, NS, SRV.
- Resolution order: hosts file, cache, the configured DNS server (which recurses and caches by TTL).
- `dig NAME` / `dig @server NAME`, `getent hosts`, `nslookup`.
- NXDOMAIN = name missing; timeout = server unreachable; SERVFAIL = upstream error.
:::

:::try Your turn
`ping sql01` says "unknown host" but `ping 10.0.0.20` works. Name three things you would check, in order, and which commands you would use.
:::

:::quiz
? Which record type maps a name to an IPv4 address?
+ A
- MX
- PTR
- NS
! AAAA is the IPv6 equivalent.
? `dig` returns NXDOMAIN. What does that mean?
- The DNS server is unreachable
+ The name does not exist
- The server is overloaded
- The record expired
! Unreachable servers produce a timeout instead.
? What does TTL on a DNS record control?
+ How long resolvers may cache the answer
- How many hops it travels
- The record's priority
- The port number
! A low TTL makes changes spread faster but increases DNS traffic.
:::
