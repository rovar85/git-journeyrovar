---
track: sysdesign
title: "Design walkthrough: a URL shortener"
short: URL shortener
sub: The seven steps applied to a classic question: requirements, estimates, API, short-code generation in base 62, storage, the cached redirect path, analytics and abuse.
---

:::goals
- run the seven steps on a real question
- generate short codes without collisions
- design a read-heavy path with caching
- discuss redirects, analytics and abuse
:::

## 1. Requirements

Ask, then write down: create a short link for a long URL; open the short link and be redirected; optional custom aliases and expiry; click counts. Non-functional: redirects must be fast (under about 50 ms) and highly available; links must not change once created; 10 million daily users.

## 2. Estimates

From [lesson 1](#sysdesign-1): about **12 new links per second** and **1,200 redirects per second** on average, roughly 3,500 at peak, and under a terabyte of data in five years. This is read-heavy and small: the challenge is redirect speed and availability, not storage.

## 3. API

```term
POST /links            {"url": "https://...", "alias": "optional", "expires": "optional"}  ->  201 {"code": "aZ3k9Q"}
GET  /{code}           ->  301 or 302, Location: https://...       (404 if unknown or expired)
GET  /links/{code}/stats  ->  {"clicks": 1234, ...}
```

## 4. Codes and data

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > shortener.py <<'EOF'
# A URL shortener's core: ids from a counter encoded in base 62, short-code length versus capacity, and a read path with a cache.
import string
ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase      # 62 characters
def encode(n):
    s = ""
    while True:
        n, r = divmod(n, 62); s = ALPHABET[r] + s
        if n == 0: return s
def decode(s):
    n = 0
    for ch in s: n = n * 62 + ALPHABET.index(ch)
    return n
print("1) codes from a counter (no collisions, no lookups to check for duplicates)")
for n in (1, 61, 62, 3843, 3844, 56_800_235_583, 3_521_614_606_207):
    print(f"   id {n:>17,} -> {encode(n):>8}  -> back to {decode(encode(n)):,}")
print("\n2) how many links each code length can hold")
for L in (5, 6, 7, 8):
    print(f"   {L} characters: {62 ** L:>22,} codes   at 1 M new links a day, lasts {62 ** L / 1e6 / 365:,.0f} years")
print("   a sequential counter makes codes guessable; mix the bits (or add a random offset per shard) if links must not be enumerable")
store = {}; cache = {}; hits = misses = 0
def shorten(url, _c=[100000]): _c[0] += 1; code = encode(_c[0]); store[code] = url; return code
def resolve(code):
    global hits, misses
    if code in cache: hits += 1; return cache[code]
    misses += 1; url = store.get(code); cache[code] = url; return url
codes = [shorten(f"https://example.com/article/{i}") for i in range(5)]
for c in codes * 20: resolve(c)
print(f"\n3) 100 redirects for 5 links: {misses} database reads, {hits} served from the cache (hot links stay in memory)")
print(f"   a redirect answers 301 (permanent, browsers cache it: fewer requests, no click counts) or 302 (temporary: every click reaches you)")
EOF
python3 shortener.py
```

- **A counter encoded in base 62** (digits plus lower and upper case letters) gives short codes with **no collisions** and no need to check for duplicates: 6 characters hold about 57 billion codes, which at 1 million new links a day lasts over 150 years. 7 characters last thousands.
- One counter is a single point of failure. Give each server a **range** of ids (server A takes 1 to 1,000,000, server B the next million), or use a distributed id scheme such as Snowflake-style ids (time + machine + sequence).
- Sequential codes can be **guessed**: anyone can walk through every link. If links may be private, scramble the id bits or use random codes and check for collisions.
- **Hashing the URL** (take the first characters of a hash) is the other common answer; it needs collision handling, and the same URL always gets the same code, which may or may not be wanted.
- **Data model:** one table `links(code PRIMARY KEY, long_url, created_at, expires_at, owner)`. Lookups are always by code, so a key-value store fits as well as a relational database.

## 5. High-level design

Clients reach a load balancer and stateless **link service** instances. Creating a link writes to the database. A redirect reads the **cache** first (popular links are read again and again, as the last part of the run shows: 95 of 100 redirects came from the cache), then the database, then answers with a redirect.

## 6. Deep dives

- **301 or 302?** A 301 (permanent) lets browsers cache the redirect: less load, but you stop seeing repeat clicks. A 302 (temporary) sends every click through you, which is needed for analytics. Many shorteners use 302 for that reason.
- **Analytics** must not slow the redirect: publish a click event to a queue ([lesson 5](#sysdesign-5)) and count asynchronously.
- **Abuse:** rate-limit link creation per user ([lesson 6](#sysdesign-6)), check URLs against malware lists, and allow links to be disabled.
- **Availability:** replicas of the database, the cache in several zones; a redirect only needs a read, so it can keep working while writes are briefly unavailable.

## 7. Trade-offs to state

Counter-based codes (no collisions, guessable) versus random codes (private, collision checks); 301 (cheap) versus 302 (measurable); strong consistency only needed for creating aliases, eventual consistency fine for click counts.

## How would you generate short codes for a URL shortener?

:::say
I would take a unique numeric id and encode it in base 62, so six or seven characters cover billions of links with no collisions. To avoid a single counter, each server reserves a block of ids, or I use time-based distributed ids. If links must not be guessable I scramble the id or use random codes with a collision check.
:::

:::recap
- Requirements first: this is **read-heavy** and small; speed and availability matter most.
- **Base 62** of a unique id: short, collision-free; give servers **id ranges**.
- Cache the redirect path; count clicks **asynchronously** through a queue.
- 301 is cheaper, 302 is measurable; rate-limit creation and check for abuse.
:::

```quiz
? How many codes do 6 base-62 characters give?
+ About 57 billion
- About 1 million
- About 62 thousand
- About 1 trillion
! 62 to the power 6.

? Why might a shortener answer 302 instead of 301?
+ So every click reaches the service and can be counted
- 302 is faster
- Browsers reject 301
- To save storage
! Browsers cache 301s and skip you.

? How should click counting be done?
+ Publish an event to a queue and count asynchronously
- Update a counter row inside every redirect
- Count in the browser
- Do not count
! Keep the redirect path fast.
```
