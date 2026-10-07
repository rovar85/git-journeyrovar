---
track: cloudsenior
title: Q6: How do you handle network design at scale (VPC/VNet, subnets, routing, private connectivity, zero trust)?
short: Q6 Network at scale
sub: An address plan that never overlaps, hub-and-spoke routing, private connectivity to services and on-premises, and zero-trust principles, with a CIDR allocator and an overlap and reachability checker.
---

:::goals
- plan IP address space for hundreds of networks without overlaps, using a registry
- describe hub-and-spoke and transit designs and their routing consequences
- choose private connectivity patterns for managed services, other networks and on-premises
- explain zero trust in network terms and what it replaces
- structure a senior answer with the failure modes interviewers probe
:::

:::note Provenance
The allocator and reachability checker are **real code** (Python's `ipaddress` module). Product names (AWS Transit Gateway, PrivateLink, Direct Connect; Azure Virtual WAN, Private Link, ExpressRoute; Google Cloud NCC, Private Service Connect, Interconnect) are **from my own knowledge**, and limits and features change, so check current documentation. This lesson builds on the Networking track (subnets, routing, NAT, DNS) and the Cloud networking lesson.
:::

## 1. What the interviewer is testing

Whether you treat the network as a **platform with a plan** rather than a collection of subnets: **IP address management**, **segmentation**, **routing topology**, **connectivity to on-premises and to cloud services**, **DNS**, **egress control**, **observability**, **cost** (data transfer is not free) and **security that does not rely on "inside the network is trusted"**.

## 2. Start with the address plan

Overlapping address ranges are the **most expensive mistake** in cloud networking: two networks that use `10.0.0.0/16` **cannot be peered or routed together** without translation. You discover this when a company merger, a VPN to a partner, or a migration (Q14) needs them connected. So:

1. **Reserve a large block** for the whole organisation's cloud (for example `10.64.0.0/10`), separate from on-premises ranges and from partner ranges you know about.
2. Keep an **authoritative registry** (an IPAM tool or a Git file) of **who owns which range**, written to by **automation** (account vending, Q3), never by hand.
3. **Size each VPC or VNet for growth** (`/16` or `/20` per environment is common; the cloud's private address space is large and **resizing later is painful**), and **subnets by tier and zone**.
4. Plan for **IPv6** and for **Kubernetes**, which consumes address space heavily (pods get IPs in some designs).

An allocator that hands out non-overlapping blocks and **proves** it:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > ipam.py <<'EOF'
import ipaddress, itertools

ORG_BLOCK = ipaddress.ip_network("10.64.0.0/12")           # the whole organisation's cloud space
ONPREM = [ipaddress.ip_network(n) for n in ("10.1.0.0/16", "10.2.0.0/16", "192.168.0.0/16")]   # existing ranges to avoid
REQUESTS = [("hub-prod", 20), ("hub-nonprod", 20), ("ev-prod", 18), ("ev-test", 20), ("sql-prod", 20), ("data-lake", 16), ("sandbox-1", 22), ("sandbox-2", 22)]

allocated = {}
free = [ORG_BLOCK]
def allocate(prefix):
    for i, block in enumerate(free):
        if block.prefixlen <= prefix:
            net = next(block.subnets(new_prefix=prefix))                  # take the first block of the right size
            free.pop(i)
            free[i:i] = list(block.address_exclude(net))                  # return the remainder to the free list
            free.sort(key=lambda n: (-n.prefixlen, n))          # smallest adequate block first (best fit) limits fragmentation
            return net
    raise RuntimeError("address space exhausted")

for name, prefix in sorted(REQUESTS, key=lambda r: r[1]):                 # big blocks first avoids fragmentation
    allocated[name] = allocate(prefix)

print(f"{'network':12} {'range':18} {'addresses':>10}")
for name, net in sorted(allocated.items(), key=lambda kv: kv[1]):
    print(f"{name:12} {str(net):18} {net.num_addresses:10,}")

nets = list(allocated.items())
overlaps = [(a, b) for (a, na), (b, nb) in itertools.combinations(nets, 2) if na.overlaps(nb)]
clash = [(n, o) for n, na in nets for o in ONPREM if na.overlaps(o)]
used = sum(n.num_addresses for n in allocated.values())
print(f"\noverlaps between cloud networks: {overlaps or 'none'}")
print(f"overlaps with on-premises ranges: {clash or 'none'}")
print(f"used {used:,} of {ORG_BLOCK.num_addresses:,} addresses ({used / ORG_BLOCK.num_addresses:.1%}); largest free block: {max(free, key=lambda n: n.num_addresses)}")
EOF
python3 ipam.py
```

Note how the plan **verifies** no overlap (with each other and with on-premises), and reports how much of the block is left. Real IPAM adds approvals, ownership and an API. Also keep **per-VPC subnet plans** as code: for example one `/20` split into **public, application, data and management subnets in three zones** (the CIDR calculator widget in the Networking track helps with the arithmetic).

## 3. Topologies at scale

| Topology | How it works | Use when | Limits |
|---|---|---|---|
| **Peering mesh** | every network peered with every other | a handful of networks | peering is **not transitive** and the number of connections grows as n(n-1)/2 |
| **Hub-and-spoke** | spokes connect to a central **hub** (which holds shared services, egress and inspection) | one provider, tens to hundreds of networks | the hub must scale; route design must prevent spoke-to-spoke access you do not want |
| **Transit gateway / virtual WAN / network connectivity hub** (managed hub) | a managed router connects many networks, VPNs and on-premises links with route tables | the standard answer at scale | per-attachment and data-processing **costs**, route-table design |
| **Multi-cloud or multi-region mesh** | hubs per region, linked together | global estates | latency, cost, operational complexity (Q1) |

The number of links is worth showing, because it justifies hubs:

```run
cd ~/lab/cs
python3 - <<'EOF'
print(f"{'networks':>9} {'peering mesh links':>20} {'hub-and-spoke links':>21}")
for n in (5, 20, 100, 300):
    print(f"{n:9d} {n * (n - 1) // 2:20,} {n:21,}")
EOF
```

Routing design rules: **segment with route tables** (production spokes must not reach sandbox spokes), a **central egress** path through inspection for outbound internet, **no default route straight to the internet** from sensitive subnets, and **symmetric** paths through any stateful inspection device (asymmetric routing breaks firewalls).

### Check reachability before you build it

Which spokes can talk, given the route tables? A small model catches **unintended paths** (a classic audit finding):

```run
cd ~/lab/cs
cat > reach.py <<'EOF'
# Each spoke attaches to the hub with a route table that lists the destinations it may reach.
ROUTES = {
    "ev-prod":   {"hub-shared", "sql-prod", "onprem"},
    "sql-prod":  {"hub-shared", "ev-prod"},
    "ev-test":   {"hub-shared", "sandbox-1"},       # allowed: test and sandbox may talk
    "sandbox-1": {"hub-shared", "ev-test", "sql-prod"},    # a mistake: the sandbox can reach production SQL!
    "hub-shared": {"ev-prod", "sql-prod", "ev-test", "sandbox-1", "onprem"},
}
FORBIDDEN = [("sandbox-1", "sql-prod"), ("sandbox-1", "ev-prod"), ("ev-test", "sql-prod"), ("ev-test", "ev-prod")]   # policy: non-prod must never reach prod

def can_reach(src, dst):
    """Direct routes only; a fuller model also follows transit paths through the hub and the firewall rules."""
    return dst in ROUTES.get(src, set())

violations = [(s, d) for s, d in FORBIDDEN if can_reach(s, d)]
print(f"checked {len(FORBIDDEN)} forbidden paths")
for s, d in violations: print(f"  VIOLATION: {s} can reach {d}")
if not violations: print("  none")
EOF
python3 reach.py
```

A real check also follows **transitive** paths and **security-group or firewall rules**, but the point is the same: **express the intended segmentation as a list and test it automatically** in the pipeline.

## 4. Private connectivity

| Need | Pattern (names from my knowledge) |
|---|---|
| Reach a **managed service** (storage, database, a SaaS) without the public internet | **private endpoints** (AWS PrivateLink and VPC endpoints, Azure Private Link, Google Private Service Connect): a private IP in your subnet maps to the service; combine with a policy that **denies public access** |
| Connect **two of your networks** | peering (simple, non-transitive) or a transit hub |
| Connect to **on-premises** | **IPsec VPN** (fast to set up, over the internet, limited bandwidth) or a **dedicated private circuit** (AWS Direct Connect, Azure ExpressRoute, Google Interconnect: predictable latency, high bandwidth, a lead time of weeks), usually **both, for redundancy**, in two locations |
| Expose **your service to other organisations or teams** without merging networks | service endpoint patterns: you publish the service, consumers get a private endpoint in their own network |
| **Internet egress** control | central NAT and **egress firewall or proxy** with allow-lists, DNS filtering |

And **DNS is part of the network design**: private zones associated with the networks, **conditional forwarding** between cloud and on-premises resolvers so each side resolves the other's names, and split-horizon DNS for private endpoints.

## 5. Zero trust, in network terms

The old model: a **trusted inside** and an untrusted outside; once on the corporate network, everything is reachable. **Zero trust** assumes the network is **hostile everywhere** and makes every request **prove itself**:

1. **Identity-based access**: strong authentication (SSO, MFA), **device posture**, and **per-request authorisation**, for people and for workloads (service identities, mutual TLS).
2. **Least-privilege connectivity**: **micro-segmentation**: tight security groups and network policies (the Kubernetes lesson showed NetworkPolicy), **deny by default**, allow named flows only.
3. **No standing network trust** from being "on the VPN": replace broad VPN access with **identity-aware proxies** or **just-in-time** access to specific applications.
4. **Encrypt everywhere** (TLS inside the network, mutual TLS between services), because the internal network is not a trust boundary.
5. **Continuous verification and logging**: flow logs, DNS logs, anomaly detection, and **assume breach** (limit lateral movement and keep detailed audit trails).

Zero trust is a **direction and a set of principles**, not a product you buy; the work is **inventorying flows, replacing implicit trust with explicit policy, and rolling it out per application**.

## 6. Observability and cost of the network

- **Flow logs** and **DNS query logs** to the central log account (Q3, Q4); alert on **denied** flows and on unusual destinations.
- **Latency and packet loss probes** between regions and to on-premises; **VPN and circuit health** alerts.
- **Cost**: data transfer between zones, regions and out to the internet is billed and often surprises teams (Q5): keep chatty services together, **use private endpoints rather than a NAT gateway for traffic to managed services** (NAT processing charges add up), and tag network costs to owners.
- **Limits and quotas**: routes per table, attachments per hub, security group rules: know them before you design at 300 networks.

## 7. How to answer

1. **Start with the address plan and its registry** (the problem that is hardest to fix later).
2. **Pick the topology** by scale and explain why (hub-and-spoke with a managed transit hub), with **route tables for segmentation** and **central egress inspection**.
3. **Private connectivity**: private endpoints for services, **redundant** VPN or circuits to on-premises, **DNS integrated**.
4. **Zero trust**: identity-based access, micro-segmentation, encryption, **default deny**.
5. **Automation**: all of it as **code**, with **automated tests** (overlap, reachability) in the pipeline.
6. **Operations**: flow logs, health probes, cost visibility, quotas.

## 8. Follow-up questions to expect

- "Two companies merged and **both use 10.0.0.0/16**. What now?" (renumber the smaller side if possible; otherwise NAT between them, with all its operational pain; plan the renumbering as a migration)
- "How do you handle **overlapping ranges with a partner or customer**?" (NAT at the boundary, or expose services via private endpoint patterns instead of routing)
- "What is **asymmetric routing** and why does it break firewalls?"
- "How do you provide **outbound internet** for 200 networks safely and cheaply?" (central egress with inspection, versus per-network NAT: trade-off cost and control)
- "How do you **prove** a prod network is isolated from non-prod?" (automated reachability tests plus flow logs)

:::warn Common mistakes
- **Overlapping CIDR ranges** with each other, on-premises or partners.
- **Too-small networks** that cannot grow, and **no IPAM registry**.
- **A full peering mesh** at scale.
- **Treating private IPs as a security boundary** ("it is internal").
- **Single VPN or single circuit** to on-premises, without a tested backup.
- **Forgetting DNS** in the hybrid design.
- **Ignoring data transfer and NAT costs.**
:::

:::recap
- **Address plan first**: a big reserved block, a registry, automation, growth room, no overlaps.
- **Hub-and-spoke through a managed transit hub** scales; peering meshes do not; **route tables express segmentation**.
- **Private endpoints** for services, **redundant** VPN and circuits for on-premises, **DNS** designed in.
- **Zero trust** = identity, least-privilege micro-segmentation, encryption, default deny, continuous verification.
- Test the intent (**overlap and reachability checks**) in the pipeline.
:::

:::try Your turn
Add three requests of your own to `ipam.py` (for example a `/19` for a data platform and two `/22` development networks), then add a rule that raises an error if an allocated network falls inside `10.1.0.0/16`. In `reach.py`, remove the mistaken route and add a check that **production reaches nothing in the sandbox**.
:::

:::quiz
? Why are overlapping CIDR ranges so costly?
+ Overlapping networks cannot be peered or routed together without translation
- They use more electricity
- They slow DNS
- Providers charge double
! You find out at merger, partner or migration time.
? Why is a peering mesh a poor design at scale?
+ Links grow as n(n-1)/2 and peering is not transitive
- Peering is unencrypted
- It uses too many IPv6 addresses
- It is not supported
! Use a hub or transit service.
? What is the core idea of zero trust networking?
+ Treat the network as untrusted and authorise every request by identity, with least privilege and encryption
- Block all traffic
- Trust anything inside the VPN
- Use only private IP addresses
! Location on the network is no longer a credential.
:::
