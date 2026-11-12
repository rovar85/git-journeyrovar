---
track: sysdesign
title: "Design walkthrough: a social feed"
short: Social feed
sub: Designing a home feed: fan-out on write versus fan-out on read, the celebrity problem and the hybrid answer, feed storage and caching, ranking, pagination and what to monitor.
---

:::goals
- estimate the work of push and pull feeds
- choose a hybrid fan-out for accounts with huge audiences
- store and page through feeds efficiently
- list the trade-offs and metrics for a feed
:::

## Requirements

Users follow other users and see a **home feed** of recent posts from the people they follow, newest or ranked first. Posting should feel instant; opening the feed should take under about 200 ms; a post may take a few seconds to appear for followers.

## Push, pull, or both

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > feed.py <<'EOF'
# A social feed: fan-out on write (push) versus fan-out on read (pull), and the hybrid used for very popular accounts.
users = {"normal": 1_000_000, "celebrity": 10}
followers = {"normal": 200, "celebrity": 5_000_000}
posts_per_day = {"normal": 1, "celebrity": 5}
feed_reads_per_user_day = 20
writes_push = sum(users[k] * posts_per_day[k] * followers[k] for k in users)
reads_pull_queries = (users["normal"]) * feed_reads_per_user_day * 200
print("Work per day for 1 M normal users (200 followers, 1 post a day) and 10 celebrities (5 M followers, 5 posts a day):\n")
print(f"push (write each post into every follower's feed): {writes_push:,.0f} feed inserts a day; reading a feed is 1 lookup")
print(f"   of which celebrities: {users['celebrity'] * posts_per_day['celebrity'] * followers['celebrity']:,} inserts, each post waiting for 5 M writes")
print(f"pull (build the feed when it is read):              {reads_pull_queries:,.0f} post lookups a day (200 accounts merged per read)")
hybrid_writes = users["normal"] * posts_per_day["normal"] * followers["normal"]
print(f"hybrid (push for normal accounts, pull celebrities at read time): {hybrid_writes:,} inserts, plus merging up to a few celebrity timelines per read")
print("\nRule: push when reads vastly outnumber writes and follower counts are small; pull for accounts with huge audiences.")
EOF
python3 feed.py
```

- **Fan-out on write (push):** when someone posts, write the post's id into each follower's feed list. Reading a feed is then one fast lookup. For normal users (200 followers) this is cheap, but the 10 celebrities with 5 million followers each cause **250 million** of the **450 million** daily inserts, and each of their posts takes a long time to reach everyone.
- **Fan-out on read (pull):** store posts per author; when a feed is opened, fetch recent posts from everyone followed and merge them. No write amplification, but **4 billion** post lookups a day and slow feed loads for users who follow many accounts.
- **Hybrid:** push for normal accounts, and **pull celebrities' posts at read time**, merging a handful of celebrity timelines into the precomputed feed. Write work falls to **200 million** inserts, and reads stay fast. This is the answer interviewers expect, with the threshold (say, accounts with over 100,000 followers) as a tunable setting.

## Storage and caching

- **Posts** in a partitioned store keyed by post id (or author and time); **media** in object storage behind a CDN ([lesson 4](#sysdesign-4)).
- **Feeds** as capped lists of post ids per user (for example the latest 800) in a fast store such as Redis or a wide-column database. Store ids, not whole posts, and fetch post details in one batched call (avoid N+1, [lesson 8](#sysdesign-8)).
- **Fan-out work** goes through a **queue** with many workers ([lesson 5](#sysdesign-5)), so posting returns immediately.
- Skip fan-out for **inactive users**; build their feed on demand when they return.

## Pagination and ranking

Page with a **cursor** ("posts older than id X"), not with page numbers: new posts arriving at the top would shift pages and show duplicates. Ranking (rather than newest first) adds a scoring step at read time over a few hundred candidate posts, using features such as recency, engagement and closeness; the candidates still come from the push/pull machinery above.

## What to monitor

Fan-out queue depth and lag (how long until a post reaches all followers), feed read latency (p50 and p99), cache hit ratio, and the share of feed reads that needed a celebrity merge.

## How would you design a news feed for hundreds of millions of users?

:::say
I would precompute feeds with fan-out on write: when a user posts, workers fed by a queue push the post id into each follower's capped feed list in a fast store, so reading a feed is one lookup plus a batched fetch of post details. For accounts with huge followings I skip the push and merge their recent posts at read time, the hybrid approach. Feeds are paged with cursors, media sits behind a CDN, and I monitor fan-out lag and feed latency.
:::

:::recap
- **Push** makes reads cheap but amplifies writes; **pull** does the reverse.
- **Hybrid:** push for normal accounts, pull for celebrities at read time.
- Feeds are capped lists of **post ids**; fan-out runs through a **queue**.
- Page with **cursors**; monitor fan-out lag and feed latency.
:::

```quiz
? Why is pure fan-out on write a problem for a celebrity with 5 million followers?
+ Each post needs 5 million feed writes
- Celebrities post less
- Their posts are bigger
- It is not a problem
! That is the write amplification the hybrid avoids.

? Why page a feed with a cursor rather than page numbers?
+ New posts at the top would shift page boundaries and show duplicates
- Cursors are encrypted
- Page numbers are slower to type
- Databases forbid page numbers
! A cursor says where you stopped, whatever arrives later.

? What does a feed list store per user?
+ Post ids, with post details fetched in one batch
- Full copies of every post
- Images
- Nothing
! Ids keep the lists small and posts editable.
```
