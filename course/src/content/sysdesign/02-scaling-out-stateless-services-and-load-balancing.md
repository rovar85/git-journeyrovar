---
track: sysdesign
title: "Scaling out: stateless services and load balancing"
short: Load balancing
sub: Vertical versus horizontal scaling, why services should keep no state, where sessions go instead, and how load-balancing algorithms differ, measured in a simulation.
---

:::goals
- choose between scaling up and scaling out
- make a service stateless and move its state out
- compare round robin, least outstanding requests and two random choices
- tell layer 4 from layer 7 load balancing
:::

## Up or out

- **Scale up (vertical):** a bigger machine. Simple, no code changes, but there is a largest machine, it is expensive, and it is still one machine that can fail.
- **Scale out (horizontal):** more machines behind a load balancer. Nearly unlimited and survives the loss of one, but only works if any machine can serve any request.

That last condition is the key: **stateless services**. A request must not depend on something stored in one server's memory. Sessions, carts and uploads go to a shared store (a cache such as Redis, a database, object storage), or into a signed token the client sends with each request. Then servers can be added, removed or replaced at any time, which is also what autoscaling and rolling deployments rely on ([Kubernetes](#kubernetes-3)).

## Which server gets the request?

The simulation sends 32 requests per second to 8 servers that can together handle 40: 80% busy. Nine requests in ten take 0.1 s; one in ten takes 1.1 s.

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > lb.py <<'EOF'
# Load balancing at 80% load: 8 servers, each handles one request at a time; most requests are quick, a few are slow.
import random
SERVERS, N = 8, 40000
def simulate(pick, seed=5):
    rnd = random.Random(seed)
    free_at = [0.0] * SERVERS                  # when each server finishes its queued work
    queued = [[] for _ in range(SERVERS)]      # finish times of requests still waiting or running, per server
    waits = []
    t = 0.0
    for i in range(N):
        t += rnd.expovariate(32)               # 32 requests per second arrive at random
        for q in queued: q[:] = [e for e in q if e > t]
        outstanding = [len(q) for q in queued]
        k = pick(i, outstanding, rnd)
        dur = 0.1 if rnd.random() < 0.9 else 1.1   # average 0.2 s: 8 servers can do 40 per second, so 32 is 80% load
        start = max(t, free_at[k]); free_at[k] = start + dur; queued[k].append(free_at[k])
        waits.append(start - t)
    waits.sort()
    return sum(waits) / N * 1000, waits[int(N * 0.99)] * 1000
algos = [("random", lambda i, o, r: r.randrange(SERVERS)),
         ("round robin", lambda i, o, r: i % SERVERS),
         ("two random choices", lambda i, o, r: min(r.randrange(SERVERS), r.randrange(SERVERS), key=lambda s: o[s])),
         ("least outstanding requests", lambda i, o, r: o.index(min(o)))]
print(f"{'algorithm':28} {'average wait':>13} {'p99 wait':>10}")
for name, f in algos:
    avg, p99 = simulate(f); print(f"{name:28} {avg:10.0f} ms {p99:7.0f} ms")
EOF
python3 lb.py
```

- **Random** and **round robin** ignore how busy each server is. A server that drew two slow requests keeps getting its share, and a queue builds behind it: the 99th-percentile wait is several seconds.
- **Two random choices:** pick two servers at random and send the request to the less busy one. It cuts the worst waits by about two-thirds compared with random, while needing almost no coordination, which is why large systems use it.
- **Least outstanding requests** looks at every server and picks the least loaded: the lowest waits here. With many load balancers working in parallel, each sees a slightly old picture, so in practice the two-choices method holds up better than this model suggests.
- **Consistent hashing** (not simulated) sends the same key to the same server, which keeps a server's cache warm; it is covered in [Systems 8](#systems-8).

## Layer 4 and layer 7

| | Layer 4 (transport) | Layer 7 (application) |
|---|---|---|
| Looks at | IP addresses and ports | HTTP: path, headers, cookies |
| Can | forward connections very fast | route `/api` and `/images` to different services, terminate TLS, retry, rewrite |
| Examples | AWS NLB, Linux IPVS | Nginx, Envoy, HAProxy, AWS ALB, Kubernetes ingress |

Health checks decide which servers are in rotation; make them check that the service can really serve (its database connection, for instance), not only that the process is alive.

## Why should web services be stateless?

:::say
So that any instance can handle any request. Then I can add or remove instances behind a load balancer, autoscale, deploy one instance at a time and lose a server without losing user data. State such as sessions moves to a shared store like Redis or a database, or into a signed token the client sends.
:::

:::recap
- Scale **out** behind a load balancer; it needs **stateless** services.
- Move sessions and uploads to a **shared store** or a signed token.
- Load-aware choices (**two random choices**, least outstanding) beat round robin when request times vary.
- Layer 4 forwards connections; layer 7 understands HTTP and can route by path.
:::

```quiz
? A server keeps logged-in users' sessions in its own memory. What breaks when you add a second server?
+ Users are logged out whenever the balancer sends them to the other server
- Nothing
- The database
- DNS
! Move sessions to a shared store or a token.

? Why does round robin give long waits when some requests are slow?
+ It ignores how busy each server is, so queues build behind unlucky servers
- It is random
- It uses too much CPU
- It cannot use HTTPS
! Load-aware algorithms avoid busy servers.

? What does a layer 7 load balancer see that layer 4 does not?
+ The HTTP request: path, headers and cookies
- The IP address
- The port
- Nothing more
! So it can route /api and /images differently.
```
