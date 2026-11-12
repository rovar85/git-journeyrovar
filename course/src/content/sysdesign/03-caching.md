---
track: sysdesign
title: "Caching: faster reads, fewer database queries"
short: Caching
sub: Where caches sit, cache-aside versus write-through and write-back, time-to-live and eviction, the hit ratio and what it buys, and stopping a cache stampede.
---

:::goals
- place a cache in front of a slow store and choose a write strategy
- estimate what a hit ratio does to latency and database load
- choose a TTL and an eviction policy
- prevent stampedes and serve stale data safely
:::

## Where caches sit

From the user inward: the **browser cache**, a **content delivery network** (CDN) near the user for images, scripts and pages, a **reverse proxy** cache, the **application cache** (Redis, Memcached) for results of queries and computations, and the **database's own buffer** of hot pages ([Systems 2](#systems-2)).

## Writing: three strategies

| Strategy | On a read | On a write | Trade-off |
|---|---|---|---|
| **Cache-aside** (lazy loading) | read the cache; on a miss read the database and store the result | write the database, then delete the cache entry | simplest and most common; a miss costs an extra trip |
| **Write-through** | read the cache | write the cache and the database together | the cache is always fresh; every write is slower |
| **Write-back** (write-behind) | read the cache | write the cache; flush to the database later | fastest writes; data is lost if the cache dies before the flush |

With cache-aside, **delete** the entry on a write rather than updating it: two concurrent updates can otherwise leave the older value in the cache.

## What a hit ratio buys

The model sends 50,000 requests for 10,000 keys where a few keys are very popular, as in most real systems, with an LRU cache of different sizes in front of a 20 ms database.

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > cache.py <<'EOF'
# Cache-aside with a time-to-live: hit ratio, database load and latency, then what happens when a popular key expires.
import random
random.seed(3)
KEYS = 10000
weights = [1 / (k + 1) for k in range(KEYS)]                 # a few keys are very popular (a Zipf-like spread)
total_w = sum(weights); cum = []; acc = 0
for w in weights: acc += w / total_w; cum.append(acc)
import bisect
def key(): return bisect.bisect_left(cum, random.random())
def run(cache_size, n=50000):
    cache, hits = {}, 0
    order = []
    for _ in range(n):
        k = key()
        if k in cache:
            hits += 1; order.remove(k); order.append(k)       # LRU bookkeeping (fine for a model)
        else:
            cache[k] = True; order.append(k)
            if len(cache) > cache_size: del cache[order.pop(0)]
    return hits / n
DB_MS, CACHE_MS = 20, 1
print(f"{'cache holds':>12} {'hit ratio':>10} {'DB queries per 1000 requests':>30} {'average latency':>16}")
for size in (0, 100, 500, 2000):
    h = run(size) if size else 0.0
    print(f"{size:>8} keys {h:>9.0%} {1000 * (1 - h):>24.0f} {h * CACHE_MS + (1 - h) * DB_MS:>13.1f} ms")
print("\nA popular key expires while 500 requests per second ask for it, and a database read takes 200 ms:")
print("   without protection:", int(500 * 0.2), "requests miss at the same moment and all hit the database (a cache stampede)")
print("   with a lock or 'single flight': 1 request rebuilds the value, the other", int(500 * 0.2) - 1, "wait for it or get the stale value")
print("   with early refresh (renew before expiry, plus random jitter on the TTL): 0 misses")
EOF
python3 cache.py
```

- Caching only **100 keys out of 10,000** already serves 39% of requests and cuts database queries by the same share. Popularity is uneven, so a small cache catches the hot keys.
- At 2,000 keys the hit ratio is 76% and the average latency falls from 20 ms to 5.6 ms. Each step gives less than the one before: the remaining misses are the long tail of rarely read keys.
- **Database load falls with the miss ratio**, which often matters more than latency: a 76% hit ratio means the database handles a quarter of the traffic.

## Expiry and eviction

- A **time-to-live (TTL)** bounds how stale an entry can be. Choose it from the business rule ("prices may be up to a minute old"), and add a little random jitter so many keys do not expire at the same moment.
- When the cache is full it **evicts**: LRU (least recently used) is the common default; LFU (least frequently used) protects items that are popular overall.
- A **stampede** happens when a hot key expires and every request misses at once, as the last lines of the output show: 100 simultaneous database reads. Prevent it by letting one request rebuild the value while others wait or receive the old value, or by refreshing popular entries before they expire.

## What not to cache

Data that must be exactly current (an account balance during a payment), data that is read once, and anything personal in a shared cache without the user in the key.

## Explain cache-aside and its main risks.

:::say
The application reads the cache first; on a miss it reads the database and stores the result with a TTL. On a write it updates the database and deletes the cache entry. The risks are stale reads within the TTL, a stampede when a hot key expires, and races between concurrent writers, which deleting rather than updating the entry avoids. I add TTL jitter and let only one request rebuild a hot key.
:::

:::recap
- Caches sit at every layer: browser, CDN, proxy, application, database.
- **Cache-aside** is the default; **write-through** keeps the cache fresh; **write-back** risks loss.
- Skewed popularity means a small cache catches many requests; database load falls with the **miss** ratio.
- Use a **TTL with jitter**, an eviction policy, and protection against **stampedes**.
:::

```quiz
? With cache-aside, what should a write do to the cache entry?
+ Delete it, so the next read reloads the fresh value
- Nothing
- Update it before writing the database
- Set its TTL to a year
! Deleting avoids races that leave an old value cached.

? A hit ratio rises from 0% to 75%. What happens to database reads?
+ They fall to a quarter of the previous number
- They fall by 75 queries
- They double
- No change
! Only misses reach the database.

? Why add random jitter to TTLs?
+ So many keys do not expire at the same moment and stampede the database
- To save memory
- To encrypt the cache
- To make reads faster
! Spreading expiry spreads the reload work.
```
