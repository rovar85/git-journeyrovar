---
track: sysdesign
title: "Start here: how to answer a system design question"
short: Start here
sub: The seven steps of a design interview, how to estimate load and storage on the back of an envelope, the numbers worth remembering, and where each pattern in this track fits.
---

:::goals
- follow a seven-step structure for any design question
- turn users into requests per second, storage and bandwidth
- remember the latency numbers that drive design choices
- know which lesson covers which pattern
:::

:::note Who this is for
You know what a server, a database and an API are ([Start here](#start-1), [Networking](#networking-1), [SQL basics](#dataeng-5)). This track teaches the building blocks of large systems and how to combine them in an interview. The theory underneath (replication, consensus, tail latency, retries, idempotency) is in [Databases and distributed systems](#systems-1); the operations side (multi-region, failover, cascading failures) is in [Senior DevOps and SRE questions](#seniorqa-1).
:::

## The seven steps

A design interview is a conversation of 35 to 45 minutes. There is no single right answer; the interviewer watches how you reason. Use the same structure every time and say each step out loud.

1. **Requirements.** Functional: what must it do (create a short link, open it)? Non-functional: how many users, how fast, how available, how consistent? Ask; do not assume. Write the answers down.
2. **Estimates.** Requests per second for reads and writes, storage over five years, bandwidth. Rough is fine: the goal is to know whether this needs one server or a thousand.
3. **API.** The few endpoints or functions the system offers, with inputs and outputs.
4. **Data model.** The main entities, their keys, and which store suits them.
5. **High-level design.** A box diagram: clients, load balancer, services, caches, queues, databases. Walk one request through it.
6. **Deep dives.** The interviewer picks one or two parts, or you choose the riskiest: the hot path, the biggest table, the hardest consistency rule.
7. **Bottlenecks and trade-offs.** What breaks first at ten times the load, what you would monitor, and what you chose not to do and why.

## Back-of-the-envelope estimates

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > estimate.py <<'EOF'
# Back-of-the-envelope estimation for a design interview: from users to requests per second, storage and bandwidth.
def human(n, unit=""):
    for s, f in (("P", 1e15), ("T", 1e12), ("G", 1e9), ("M", 1e6), ("k", 1e3)):
        if n >= f: return f"{n / f:.1f} {s}{unit}"
    return f"{n:.0f} {unit}"
DAY = 86400
def estimate(name, daily_users, actions_per_user, read_write_ratio, bytes_per_write, years=5, peak_factor=3):
    writes_day = daily_users * actions_per_user
    reads_day = writes_day * read_write_ratio
    wps, rps = writes_day / DAY, reads_day / DAY
    storage = writes_day * bytes_per_write * 365 * years
    print(f"{name}")
    print(f"   writes: {human(writes_day)} a day = {wps:,.0f} per second on average, about {wps * peak_factor:,.0f} at peak (x{peak_factor})")
    print(f"   reads : {human(reads_day)} a day = {rps:,.0f} per second on average, about {rps * peak_factor:,.0f} at peak")
    print(f"   storage over {years} years: {human(storage, 'B')}   (before replication; x3 copies = {human(storage * 3, 'B')})")
    print(f"   read bandwidth at peak: {human(rps * peak_factor * bytes_per_write, 'B')}/s\n")
estimate("URL shortener: 10 M daily users, 1 new link each per 10 days, 100 reads per write, 500 bytes per link", 10e6, 0.1, 100, 500)
estimate("Chat app: 50 M daily users, 40 messages each, 1 read per write (each message delivered once), 200 bytes", 50e6, 40, 1, 200)
estimate("Photo sharing: 20 M daily users, 2 uploads each, 50 views per upload, 2 MB per photo", 20e6, 2, 50, 2e6)
print("Numbers worth remembering:")
for k, v in [("seconds in a day", "86,400 (round to 100,000)"), ("1 million requests a day", "about 12 per second"), ("1 billion requests a day", "about 12,000 per second"),
             ("memory read", "about 100 ns"), ("SSD random read", "about 100 us"), ("same-region network round trip", "about 0.5 ms"), ("cross-continent round trip", "about 150 ms")]:
    print(f"   {k:32} {v}")
EOF
python3 estimate.py
```

How to read it:

- **Writes are small, reads are large.** 1 million new short links a day is only about 12 writes per second; with 100 reads per write, reads are over 1,100 per second, about 3,500 at peak. The read path deserves the caching.
- **Storage is driven by the item size.** 500-byte links fill under a terabyte in five years. 2 MB photos fill 146 petabytes, which changes the design completely: object storage and a content delivery network, not a database.
- **Peak is not average.** Traffic follows the clock; a factor of 2 to 5 between average and peak is a common planning assumption. Say which factor you use.

The latency list explains most design choices: memory is about a thousand times faster than an SSD, and a round trip to another continent costs 150 ms whatever your code does. Caches exist because of the first; content delivery networks and regional deployments because of the second.

## The patterns in this track

| Lesson | Pattern | Solves |
|---|---|---|
| [2](#sysdesign-2) | stateless services, load balancing | more traffic than one server can take |
| [3](#sysdesign-3) | caching | slow or overloaded reads |
| [4](#sysdesign-4) | replicas, partitioning, choosing a store | data that outgrows one database |
| [5](#sysdesign-5) | queues and publish/subscribe | bursts, slow work, decoupling services |
| [6](#sysdesign-6) | rate limiting, API gateways | abuse, fairness, one front door |
| [7](#sysdesign-7) | CQRS, event sourcing, sagas | different read and write shapes, transactions across services |
| [8](#sysdesign-8) | reliability patterns and anti-patterns | failures that spread |
| [9](#sysdesign-9), [10](#sysdesign-10) | two complete designs | putting it together |

## How do you approach a system design interview?

:::say
I start with requirements, functional and non-functional, and agree the scale. I estimate requests per second, storage and bandwidth to see what size of system this is. Then I define the API and the data model, draw a high-level design and walk one request through it. I go deep on the riskiest part, and finish with bottlenecks, what I would monitor, and the trade-offs I made.
:::

:::recap
- Seven steps: **requirements, estimates, API, data model, high-level design, deep dives, trade-offs**.
- 1 million a day is about **12 per second**; peak is a few times average.
- Item size drives storage; the read-to-write ratio drives caching.
- Memory is about 1,000 times faster than SSD; distance costs time no code can remove.
:::

```quiz
? 1 billion requests a day is about how many per second on average?
+ About 12,000
- About 1,200
- About 120,000
- About 1 million
! 86,400 seconds in a day; round it to 100,000.

? What should you do first in a design interview?
+ Ask about requirements and scale
- Draw the database schema
- Pick Kafka
- Write code
! The requirements decide everything else.

? A photo service stores 2 MB per photo, 40 million a day. Where do the photos go?
+ Object storage behind a content delivery network
- One relational table
- The cache
- The load balancer
! Petabytes of blobs belong in object storage; the database keeps metadata.
```
