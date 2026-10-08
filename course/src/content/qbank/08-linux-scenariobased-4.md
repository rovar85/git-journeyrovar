---
track: qbank
title: "Linux, shell and networking: Scenario-based questions (part 4 of 4)"
short: Linux scenario 4
sub: 5 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Networking: traffic is not being forwarded between two subnets. How do you troubleshoot the routing?

<!-- source: 01 Q82 -->

:::note In simple words
Two neighbourhoods and one junction between them. Each house must know "for the other neighbourhood, go via the junction", the junction must be willing to pass traffic, and the reply must be able to come back the same way.
:::

1. **Hosts:** is the default gateway correct on both sides (`ip route`)? Is the subnet mask right? A wrong mask makes a host think the other subnet is local.
2. **Router or Linux box:** does the routing table have both subnets (connected or static)? On Linux, is IP forwarding on (`sysctl net.ipv4.ip_forward=1`)?
3. **Return path:** traffic may go out fine but the reply has no route back. Asymmetric routing through a firewall also drops it.
4. **Filters:** ACLs on router interfaces, the host firewall, and in AWS the NACLs (stateless, so both directions and the ephemeral ports 1024-65535 must be allowed) and Security Groups.
5. **AWS specifics:** subnets in the same VPC route via the `local` route automatically, so if they can't talk it's the SG or NACL. Between VPCs, check the peering/TGW routes in BOTH route tables, TGW route table associations, and that the CIDRs don't overlap. For an EC2 acting as a router or NAT, disable source/destination check.
6. **Verify:** `traceroute` shows where packets stop; `tcpdump` on the router shows whether packets arrive and leave.

**Example:**
```bash
ip route get 10.0.2.25                 # which route/interface would be used
sysctl net.ipv4.ip_forward             # must be 1 on a Linux router
sudo tcpdump -ni eth1 host 10.0.2.25   # does traffic leave the router?
aws ec2 describe-route-tables --filters Name=association.subnet-id,Values=subnet-0abc
```

:::say
I check the hosts' gateway and subnet mask, then the router's routing table and IP forwarding, then the return path, because routing failures are often one-way. Then I check ACLs and firewalls. In AWS, subnets in one VPC always have a local route, so it's usually NACLs or Security Groups, while between VPCs I check both route tables and CIDR overlap. traceroute and tcpdump show exactly where packets stop.
:::

## Networking: you need to add a new subnet to an existing network. What are the steps?

<!-- source: 01 Q83 -->

:::note In simple words
Adding a new street to a town: pick house numbers that nobody else is using, connect the street to the road map, and put up the right gates.
:::

1. **Plan the CIDR:** pick a free range inside the VPC or network that doesn't overlap existing subnets, on-prem ranges, peered VPCs or VPN clients. Size it for growth: a /24 gives 256 addresses, and AWS reserves 5 per subnet, so 251 are usable. EKS pods using VPC CNI need large subnets.
2. **Subnetting math:** 10.0.0.0/16 split into /20s gives 16 subnets of 4096 addresses: 10.0.0.0/20, 10.0.16.0/20, 10.0.32.0/20, and so on.
3. **Create it** in the right AZ (AWS) or VLAN/interface (on-prem). A VLAN is layer 2 separation; a subnet is the layer 3 range you put on it.
4. **Routing:** associate the right route table: public (0.0.0.0/0 -> IGW) or private (0.0.0.0/0 -> NAT). Add routes on peering, TGW, VPN or on-prem routers so other networks can reach it.
5. **Security:** NACLs and SGs, and update firewall rules and allow-lists that reference CIDRs.
6. **Services:** DHCP scope or auto-assign public IP setting, DNS, VPC endpoints, tags. Then do it all in Terraform, and test connectivity from both directions.

**Example:**
```bash
# Quick subnet math
ipcalc 10.0.48.0/20        # Network, Broadcast, HostMin/HostMax, Hosts/Net: 4094

aws ec2 create-subnet --vpc-id vpc-0abc --cidr-block 10.0.48.0/20 \
  --availability-zone ap-south-1c \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=private-1c}]'
aws ec2 associate-route-table --route-table-id rtb-0priv --subnet-id subnet-0new
```

:::say
I pick a non-overlapping CIDR sized for growth, remembering AWS reserves five addresses per subnet. I create the subnet in the right AZ, associate the public or private route table, and add routes on peering, TGW or VPN so other networks can reach it. Then I update NACLs, Security Groups and allow-lists, do it all in Terraform, and test from both directions.
:::

## Networking: you notice abnormal traffic patterns on an interface. How do you investigate and what do you recommend?

<!-- source: 01 Q84 -->

:::note In simple words
The water meter suddenly spins much faster than usual. You find out which tap is running, whether it's a guest having a long shower (legitimate spike) or a burst pipe (attack or leak).
:::

1. **Quantify:** the baseline vs now, inbound vs outbound, bytes vs packets (a high PPS with small packets suggests a DDoS or scan).
2. **Top talkers:** which source/destination IPs and ports? Use NetFlow/sFlow, **VPC Flow Logs** (query with Athena or CloudWatch Logs Insights), `iftop` or `nethogs` on the host.
3. **Classify:** legitimate (a deploy, backup, new customer, crawler), misconfiguration (a retry storm, a logging loop, traffic crossing AZs or going through NAT), or malicious (DDoS, port scans, crypto-mining, data exfiltration to unknown IPs).
4. **Deep dive:** `tcpdump` a sample, check GuardDuty findings, and check the process on the host that opened those connections.
5. **Respond:** block at the right layer (NACL/WAF rate rule/Shield for DDoS, SG for a host), isolate a compromised host, rotate its credentials, and fix the misconfiguration.
6. **Recommend:** baselines and anomaly alerts on flow metrics, egress filtering, WAF rate limiting, and GuardDuty/IDS.

**Example:**
```sql
-- Athena on VPC Flow Logs: top talkers in the last hour
SELECT srcaddr, dstaddr, dstport, SUM(bytes)/1048576 AS mb
FROM vpc_flow_logs
WHERE start > to_unixtime(now() - interval '1' hour)
GROUP BY srcaddr, dstaddr, dstport
ORDER BY mb DESC LIMIT 20;
```

```bash
sudo iftop -i eth0 -P           # live per-connection bandwidth
sudo nethogs eth0               # which process is using it
sudo tcpdump -ni eth0 -c 200 'not port 22'
```

:::say
I compare against the baseline, then find the top talkers with flow logs or NetFlow and iftop on the host, and classify it: a legitimate spike, a misconfiguration like a retry loop, or malicious activity like a DDoS or exfiltration. I confirm with tcpdump and GuardDuty, block or isolate at the right layer, and recommend baselines with anomaly alerts, egress filtering and WAF rate limits.
:::

## Networking: how do you implement redundancy for critical network devices and links?

<!-- source: 01 Q85 -->

:::note In simple words
Never have only one bridge into town. Build two, on different routes, and have a traffic officer who instantly sends cars to the second bridge if the first one closes.
:::

**Options (on-prem):**
- **Redundant devices:** two routers/firewalls sharing a virtual gateway IP with **VRRP/HSRP** (active/standby), or firewall HA pairs.
- **Redundant links:** dual ISPs, link aggregation (LACP) for switch uplinks, and diverse physical paths.
- **Dynamic routing** (BGP/OSPF) so traffic reroutes automatically when a path fails.
- **Power and hardware:** dual PSUs, separate power feeds, spares on site.

**Options (cloud/hybrid):**
- Spread across **multiple AZs**: NAT Gateway per AZ, load balancers across AZs, subnets in each AZ.
- **Site-to-Site VPN** has two tunnels per connection, so configure both. Use two customer gateways for device redundancy.
- **Direct Connect** with a second DX at a different location, or DX + VPN as backup, with BGP deciding the path.
- Route 53 health-check failover for public endpoints.

**Recommendation:** active/standby pairs with VRRP for gateways, two diverse links with BGP failover, and in AWS multi-AZ everything plus both VPN tunnels. Test failover regularly, because untested redundancy often fails when you need it.

**Example:**
```text
            ISP-A ----\                      /---- AZ-a: NAT GW, app, DB primary
 Office  [FW1]==VRRP==[FW2] ==BGP== AWS TGW ==
            ISP-B ----/  (2 VPN tunnels + DX)  \---- AZ-b: NAT GW, app, DB standby
```

:::say
I remove single points of failure at each layer: device pairs with VRRP or HSRP, two diverse links or ISPs with BGP for automatic failover, and dual power. In AWS that means multi-AZ subnets and a NAT gateway per AZ, both VPN tunnels up, and Direct Connect backed by a VPN. Most importantly I test failover regularly.
:::

## Networking: a router is not learning routes from its neighbours (BGP/OSPF). How do you troubleshoot?

<!-- source: 01 Q86 -->

:::note In simple words
Two neighbours only share gossip (routes) once they have properly introduced themselves. First check that they're actually talking, then that they agreed on the rules, then that nobody is filtering what's being said.
:::

1. **Is the neighbour relationship up?** BGP: the state should be `Established`; if it's stuck in `Idle`/`Active`/`Connect`, it's a connectivity or config issue. OSPF: the state should be `Full`.
2. **Connectivity:** can the routers ping each other on the peering IPs? Is TCP 179 (BGP) allowed through ACLs and firewalls? Is OSPF (IP protocol 89) or multicast allowed?
3. **Parameters must match:** BGP neighbour IP and **ASN**, MD5 password, eBGP multihop/TTL. OSPF area ID, hello/dead timers, subnet mask, authentication, MTU (mismatched MTU gets stuck in ExStart), network type.
4. **Established but no routes:** inbound/outbound **filters** (prefix-lists, route-maps), prefixes not advertised (a missing `network` statement or redistribution), max-prefix limit hit, next-hop unreachable, or a better route already in the table (administrative distance).
5. **AWS angle:** for Site-to-Site VPN and Direct Connect, check the tunnel/BGP status in the console or CloudWatch (`TunnelState`), the ASN on the customer gateway vs the VGW/TGW, the advertised prefixes (limit of 100 for VPN), and route propagation enabled on the VPC route tables.

**Example:**
```text
router# show ip bgp summary          # neighbour state, prefixes received
router# show ip bgp neighbors 169.254.10.1 advertised-routes
router# show ip ospf neighbor        # FULL / EXSTART / INIT
router# show ip route bgp
```

```bash
aws ec2 describe-vpn-connections --query 'VpnConnections[].VgwTelemetry'
aws ec2 describe-route-tables --query 'RouteTables[].PropagatingVgws'
```

:::say
First I check whether the adjacency is up: BGP Established or OSPF Full. If not, I check connectivity, TCP 179 or OSPF traffic through firewalls, and matching parameters like ASN, passwords, areas, timers and MTU. If the session is up but no routes arrive, it's usually filters, prefixes not advertised, or max-prefix limits. For AWS VPN or Direct Connect, I also check the tunnel telemetry, the ASNs and route propagation on the VPC route tables.
:::
