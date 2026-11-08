---
track: scenarios
title: "S10: Network security scenarios: an exposed database, a traffic flood and suspected data theft"
short: S10 Network security
sub: Security groups and what "open to the world" means, a rate-limit test against a flood, flow-log detectors for a port scan and a slow upload, and the response order an interviewer expects.
---

:::goals
- explain security groups (stateful, allow-only) and network ACLs (stateless, ordered, allow and deny), and audit for dangerous open ports
- explain what rate limiting, a CDN and a WAF each can and cannot do against a flood
- find a port scan and an unusual upload in flow logs, and say what those signals do not prove
- give the incident-response order for a suspected breach: contain, preserve, investigate, remove, recover, learn
:::

:::note How to use this lesson
The three Python models run for real in the lab; they are small teaching models, not security tools. Network concepts are in [Networking](#networking-1), [firewalls and NAT](#networking-7) and [Cloud networking and IAM](#cloud-2); compliance and account structure are in [Senior cloud 4](#cloudsenior-4). Kubernetes network policy is in [Kubernetes 14](#kubernetes-14).
:::

## Scenario A: "A database is reachable from the internet. How did it happen and what do you do?"

**What the interviewer tests:** do you know the layers of cloud network control, do you contain before you analyse, and do you fix the cause instead of one rule?

### The rule layers

- **Security group (SG):** attached to an instance or interface. **Stateful**: if the request is allowed, the reply is allowed automatically. **Allow rules only**. Best practice is to reference **another group** as the source ("the app tier") rather than an address range.
- **Network ACL (NACL):** attached to a subnet. **Stateless**: you must allow return traffic (ephemeral ports) yourself. Rules are **numbered and evaluated in order**, with **allow and deny**. A coarse second layer, handy for blocking an address range quickly.
- **Route tables and public IPs:** a subnet with a route to an internet gateway and instances with public addresses is "public". Databases belong in **private subnets** with no public address at all.
- **Other layers:** host firewall, application authentication, TLS, WAF in front of web apps.

An exposure usually needs **several** mistakes at once (public address, route to the internet, a permissive rule). Fix them all, not only the one you found.

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > sg.py <<'EOF'
# A tiny model of cloud network rules: security groups (stateful, allow-only) and a world-open audit.
GROUPS = {
  "web-sg": {"ingress": [("tcp", 443, "0.0.0.0/0"), ("tcp", 80, "0.0.0.0/0")]},
  "app-sg": {"ingress": [("tcp", 8080, "sg:web-sg")]},
  "db-sg":  {"ingress": [("tcp", 5432, "sg:app-sg")]},
  "bastion-sg": {"ingress": [("tcp", 22, "0.0.0.0/0")]},                      # a classic mistake
  "legacy-sg":  {"ingress": [("tcp", 5432, "0.0.0.0/0"), ("tcp", 6379, "0.0.0.0/0"), ("tcp", 9200, "10.0.0.0/8")]},
}
def allowed(src, dst_group, proto, port):
    """src is 'internet' or a security group name"""
    for p, prt, source in GROUPS[dst_group]["ingress"]:
        if p == proto and prt == port:
            if source == "0.0.0.0/0" and src == "internet": return True
            if source == f"sg:{src}": return True
    return False
print("Reachability, as the rules say (stateful: replies are allowed automatically)")
tests = [("internet", "web-sg", 443), ("internet", "app-sg", 8080), ("web-sg", "app-sg", 8080), ("app-sg", "db-sg", 5432), ("web-sg", "db-sg", 5432), ("internet", "db-sg", 5432), ("internet", "legacy-sg", 5432)]
for src, dst, port in tests:
    print(f"  {src:9} -> {dst:10} tcp/{port:<5} {'ALLOW' if allowed(src, dst, 'tcp', port) else 'deny'}")
SENSITIVE = {22: "SSH", 3389: "RDP", 5432: "PostgreSQL", 3306: "MySQL", 6379: "Redis", 9200: "Elasticsearch", 27017: "MongoDB"}
print("\nAudit: sensitive ports open to the whole internet")
for name, g in GROUPS.items():
    for proto, port, source in g["ingress"]:
        if source == "0.0.0.0/0" and port in SENSITIVE: print(f"  FINDING {name}: {SENSITIVE[port]} (tcp/{port}) is open to 0.0.0.0/0")
print("\nGood pattern in this model: the database accepts traffic only from the app tier's group, never from an address range.")
EOF
python3 sg.py
```


Read it: the web tier is open to the internet on 443 only, the app accepts the web group, the database accepts only the app group. The `legacy-sg` shows the mistakes an audit finds: PostgreSQL and Redis open to `0.0.0.0/0`. The audit loop is five lines; run the equivalent against every account and region on a schedule, and prevent the mistake with policy (a service control policy, a config rule, or an admission policy in Kubernetes).

### The answer an interviewer expects

1. **Contain now:** remove or narrow the rule, or detach the group, and block at the NACL if needed. Do not delete evidence (logs, the instance).
2. **Was it used?** Check flow logs, database logs (logins from unknown addresses, failed attempts, large reads), and cloud audit logs for who changed the rule and when.
3. **If anyone got in:** treat credentials as compromised, rotate them, check for new users, new keys and unexpected outbound connections, and follow the incident process (below).
4. **Fix the cause:** private subnet, no public address, source = the app group, secrets from a secret store. Add a preventive control and an alert on any rule that opens a sensitive port to the world.
5. **Write it up** without blame, with the timeline and the guardrail added.

## Scenario B: "Traffic suddenly rises 50 times and the site is down. DDoS?"

First decide **what kind of traffic** it is, because the answers differ:

- **Volumetric** (floods the pipe): handled upstream by the provider's network protection or a CDN with large capacity; you cannot absorb it at your own server.
- **Protocol** (exhausts connection tables, such as a SYN flood): SYN cookies, load balancer protections.
- **Application layer** (many valid-looking requests to expensive endpoints): rate limits, caching, a WAF, bot detection, and making the expensive endpoint cheaper.
- **Not an attack at all:** a marketing email, a retry storm ([Systems 6](#systems-6)) or a bug. Check logs and deploys before assuming malice.

The next model shows why **per-client limits** protect real users from one noisy source:

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > flood.py <<'EOF'
import random
random.seed(5)
# 20 legitimate users send 1 request per second each; one attacker sends 400 per second. The server can do 100 per second.
USERS, ATTACKER_RATE, SECONDS = 20, 400, 30
def simulate(policy):
    served = {"legit": 0, "attacker": 0}; sent = {"legit": 0, "attacker": 0}
    buckets = {}
    for t in range(SECONDS):
        reqs = [("legit", f"user{u}") for u in range(USERS)] + [("attacker", "evil")] * ATTACKER_RATE
        random.shuffle(reqs)
        capacity = 100
        counts = {}
        for kind, who in reqs:
            sent[kind] += 1
            counts[who] = counts.get(who, 0) + 1
            if policy == "none":
                ok = capacity > 0
            elif policy == "per-IP limit (5/s)":
                ok = counts[who] <= 5 and capacity > 0
            if ok: capacity -= 1; served[kind] += 1
    return sent, served
print(f"server capacity 100/s; {USERS} users at 1/s; attacker at {ATTACKER_RATE}/s")
print(f"{'policy':22} {'legit served':>13} {'attacker served':>16} {'legit success rate':>19}")
for pol in ("none", "per-IP limit (5/s)"):
    sent, served = simulate(pol)
    print(f"{pol:22} {served['legit']:13d} {served['attacker']:16d} {served['legit'] / sent['legit']:19.0%}")
print("\nPer-client limits protect the real users from one noisy source. A distributed attack (thousands of IPs, each polite) needs a CDN / WAF / provider scrubbing, not a per-IP rule.")
EOF
python3 flood.py
```


Without a limit, the attacker takes almost all capacity and only **24%** of legitimate requests succeed. With a per-address limit, legitimate users are **100%** served and the attacker is capped. The honest limit of this model: it handles **one** loud source. A **distributed** attack with thousands of polite addresses defeats per-address rules; that needs a CDN or scrubbing service, a WAF with behavioural rules, and caching.

**Also say:** autoscaling is not a defence by itself, because it can turn an attack into a large bill (set maximums and budget alerts); serve static content from the edge; shed load early and cheaply; have the provider's DDoS contact and a runbook ready before the day.

## Scenario C: "We think data is leaving the network. How do you find out?"

**Flow logs** record connections (source, destination, port, bytes), not content. Two simple detectors on synthetic flow data:

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > flow.py <<'EOF'
import random, statistics
random.seed(21)
# Synthetic VPC flow-log summaries: (minute, src, dst, dst_port, bytes). Mostly normal, plus a port scan and a slow data theft.
flows = []
hosts = [f"10.0.1.{i}" for i in range(10, 30)]
for minute in range(0, 240):
    for _ in range(40):
        flows.append((minute, random.choice(hosts), random.choice(["10.0.2.5", "10.0.2.6", "10.0.3.9"]), random.choice([443, 8080, 5432]), int(random.lognormvariate(8, 1))))
for i, port in enumerate(range(20, 220)):                                      # port scan from one internal host in minutes 100-101
    flows.append((100 + i // 100, "10.0.1.23", "10.0.2.5", port, 60))
for minute in range(180, 240, 5):                                              # steady large uploads to an outside address
    flows.append((minute, "10.0.1.17", "203.0.113.50", 443, 40_000_000))
print(f"{len(flows)} flow records\n")
print("Detector 1: one source touching many different destination ports within a minute (scan)")
by = {}
for m, s, d, p, b in flows: by.setdefault((m, s, d), set()).add(p)
for (m, s, d), ports in sorted(by.items()):
    if len(ports) >= 50: print(f"  minute {m}: {s} probed {len(ports)} ports on {d}")
print("\nDetector 2: bytes sent to addresses outside the private ranges, against a baseline")
out = {}
for m, s, d, p, b in flows:
    if not d.startswith("10."): out[s] = out.get(s, 0) + b
base = [b for m, s, d, p, b in flows if d.startswith("10.")]
print(f"  typical internal flow: median {int(statistics.median(base)):,} bytes")
for s, b in sorted(out.items(), key=lambda x: -x[1]): print(f"  {s} sent {b / 1e6:,.0f} MB to external addresses in 4 hours  <- investigate")
print("\nNeither detector proves an attack: a scanner could be an approved vulnerability tool and the upload a backup. They tell you WHERE to look first.")
EOF
python3 flow.py
```


The scan detector finds one host touching 100+ ports in a minute. The egress detector finds one host sending 480 MB to an outside address while normal flows are a few kilobytes. These are **leads, not proof**: a scanner can be an approved vulnerability tool, and the upload can be a backup. Next steps: identify the host and its owner, what process made the connections, whether the destination is known (reputation, ownership), what data was reachable from that host, and whether credentials from it were used elsewhere.

**Prevention for this class:** **egress filtering** (default deny outbound, allow known destinations or a proxy), **VPC endpoints** so storage traffic stays inside the provider network ([Cloud cost scenarios](#scenarios-11) shows the cost side), DNS logging, and alerts on large or unusual outbound volume.

## Incident response, in order

1. **Detect and declare:** open an incident, name a lead, start a timeline.
2. **Contain:** stop the damage (isolate the host, block the address, revoke the key) while **preserving evidence** (snapshot disks, keep logs, do not reboot or wipe first).
3. **Investigate:** scope (what, since when, which accounts and data), root cause, attacker actions.
4. **Eradicate:** remove access and persistence, patch the hole, rotate every credential that could have been exposed.
5. **Recover:** restore from known-good, monitor closely.
6. **Learn and tell:** blameless post-incident review, guardrails, and any legal or customer notification that applies (involve security and legal early).

## Zero trust and segmentation, in one paragraph

**Zero trust** means no request is trusted because of **where it comes from**: every request is authenticated, authorised and encrypted, even inside the network. In practice: strong identity (short-lived credentials, no shared keys), **least privilege**, **segmentation** (tiers and accounts that cannot reach each other by default, Kubernetes network policies), mutual TLS between services, and device or context checks for people. A VPN into a flat network is not zero trust.

## Follow-up questions to expect

- Security group versus network ACL?
- How do you allow an engineer to reach a private database without opening it? (A bastion or session manager with logged, short-lived access, or a private connection; never a public rule.)
- How do you prove no sensitive port is open across 200 accounts? (Automated config scanning plus preventive policy.)
- What is a VPC endpoint and why use one? (Private access to a provider service without going over the internet or NAT.)
- How would you detect and stop data exfiltration?

## Practice (answers below)

1. A NACL denies inbound port 22 from one address but your SG allows 22 from everywhere. Is the address blocked? What if the NACL rule has a higher number than an allow-all rule?
2. Why does a NACL need ephemeral-port rules but an SG does not?
3. Add a third detector to the flow model: a host that connects to many different internal hosts on port 445 (possible lateral movement).

:::recap
- **SG:** stateful, allow-only, reference groups; **NACL:** stateless, ordered, allow and deny; databases belong in private subnets.
- First identify the traffic type in a flood; **per-client limits** help against one loud source, a **CDN or WAF** against distributed ones.
- **Flow logs** give leads (scans, unusual egress), not proof; add egress filtering.
- Incident order: **contain, preserve, investigate, eradicate, recover, learn**.
:::

:::note Answers
1. Yes for that address if the NACL deny rule is evaluated first; NACL rules run in number order and the first match wins, so a lower-numbered allow-all rule would let it through before the deny is reached. 2. NACLs are stateless, so return traffic is a separate flow that needs its own allow rule; an SG tracks the connection and allows the reply automatically. 3. Count distinct internal destinations per source per window for port 445 and flag a source above a threshold, then check whether it is a file server or a normal admin host.
:::

```quiz
? What does "stateful" mean for a security group?
+ Replies to allowed connections are allowed automatically
- Rules are numbered
- It can deny traffic
- It applies to a whole subnet
! Stateful rules track the connection, so return traffic needs no separate rule.

? A single source sends 400 requests per second to your API. What helps most?
+ A per-client rate limit
- Buying a bigger database
- Turning off logging
- Opening more ports
! Per-client limits cap one noisy source; distributed floods need edge protection.

? You suspect a compromised host. What should you do before wiping it?
+ Preserve evidence such as disk snapshots and logs
- Reboot it immediately
- Delete the logs
- Ignore it
! Containment must not destroy the evidence you need to find the cause.
```
