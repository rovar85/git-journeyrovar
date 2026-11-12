---
track: dsa
title: "Mock interview: five data-flavoured problems"
short: Mock interview
sub: Five problems in the style of data-engineering and backend interviews: sessionising events, top spender per group, validating records, merging sorted files, and an LRU cache.
---

@setup dsapractice

:::goals
- solve practical problems with dictionaries, heaps and ordered dicts
- be precise about ties and edge cases
- keep rejected records instead of dropping them
- explain each solution's complexity
:::

## How to use this set

Give yourself 20 to 25 minutes per problem. Talk through the six steps from [lesson 1](#dsa-1) out loud, write the code, run the checker, and only then read the model solution. Many data and backend interviews prefer practical problems like these to puzzles: the skills are the same, applied to logs, orders and caches.

## The problems

5 problems: 3 medium, 2 hard.

### 10.1 · Medium · Group log lines into sessions

`events` is a list of `[user, minute]` sorted by minute. A user's session ends when they are inactive for more than 30 minutes. Return a dictionary: user -> number of sessions.

**Example:** `solve([["a", 0], ["a", 20], ["b", 25], ["a", 70]])  ->  {"a": 2, "b": 1}`

**Write:** `def solve(events):` · 4 tests.

:::answer Hint
Remember each user's last minute. A new session starts when there is no last minute or the gap is over 30.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s10_1.py <<'EOF'
def solve(events):
    last, sessions = {}, {}
    for user, minute in events:
        if user not in last or minute - last[user] > 30:
            sessions[user] = sessions.get(user, 0) + 1
        last[user] = minute
    return sessions
EOF
python3 check.py 10.1 s10_1.py
```

One pass with two dictionaries: O(n). **Sessionisation** is a classic data-engineering interview question, asked in both SQL and Python.
:::

### 10.2 · Medium · Top spender per country

`orders` is a list of `[customer, country, amount]`. Return a dictionary: country -> the customer with the largest total spend in that country (ties: the alphabetically first customer).

**Example:** `solve([["asha", "IN", 20], ["ravi", "IN", 15], ["ravi", "IN", 10], ["ben", "UK", 5]])  ->  {"IN": "ravi", "UK": "ben"}`

**Write:** `def solve(orders):` · 3 tests.

:::answer Hint
First total per (country, customer) in a dictionary, then pick the best per country with a sort key of (-total, name).
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s10_2.py <<'EOF'
from collections import defaultdict

def solve(orders):
    totals = defaultdict(float)
    for customer, country, amount in orders:
        totals[(country, customer)] += amount
    best = {}
    for (country, customer), total in totals.items():
        if country not in best or (-total, customer) < (-best[country][1], best[country][0]):
            best[country] = (customer, total)
    return {country: customer for country, (customer, total) in best.items()}
EOF
python3 check.py 10.2 s10_2.py
```

Aggregate, then pick the top per group: the same three steps as SQL problem 10.1, in Python. O(n). Being precise about ties is what the tests check.
:::

### 10.3 · Medium · Validate and clean records

Each record in `rows` is a dictionary that should have an integer `id`, a non-empty `email` containing `@`, and a numeric `amount` of at least 0 (numbers may arrive as text). Return `[clean, rejected_ids]`: the valid records with `amount` converted to float and `email` lower-cased and stripped, in input order, and the ids (or `None` when the id is missing) of the rejected ones.

**Example:** `solve([{"id": 1, "email": " A@X.COM", "amount": "5"}, {"id": 2, "email": "bad", "amount": 1}])  ->  [[{"id": 1, "email": "a@x.com", "amount": 5.0}], [2]]`

**Write:** `def solve(rows):` · 3 tests.

:::answer Hint
Write a small function that returns the cleaned record or raises ValueError; catch the error in the loop and collect the id.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s10_3.py <<'EOF'
def clean(r):
    if not isinstance(r.get("id"), int):
        raise ValueError("id must be an integer")
    email = str(r.get("email") or "").strip().lower()
    if "@" not in email:
        raise ValueError("bad email")
    amount = float(r.get("amount"))    # raises ValueError or TypeError for bad input
    if amount < 0:
        raise ValueError("negative amount")
    return {"id": r["id"], "email": email, "amount": amount}

def solve(rows):
    good, rejected = [], []
    for r in rows:
        try:
            good.append(clean(r))
        except (ValueError, TypeError):
            rejected.append(r.get("id"))
    return [good, rejected]
EOF
python3 check.py 10.3 s10_3.py
```

This is the shape of real pipeline code: a small pure function per record, specific exceptions, and rejects kept instead of dropped (data engineering lesson 4). Interviews for data roles often use exactly this kind of question instead of puzzles.
:::

### 10.4 · Hard · Merge sorted files

`lists` holds several lists, each already sorted. Return one sorted list containing everything, without simply concatenating and sorting.

**Example:** `solve([[1, 4, 5], [1, 3, 4], [2, 6]])  ->  [1, 1, 2, 3, 4, 4, 5, 6]`

**Write:** `def solve(lists):` · 4 tests.

:::answer Hint
A heap holding the current front item of each list. Pop the smallest, then push the next item from the same list.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s10_4.py <<'EOF'
import heapq

def solve(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        value, i, j = heapq.heappop(heap)
        out.append(value)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out
EOF
python3 check.py 10.4 s10_4.py
```

A **k-way merge** with a heap: O(N log k) for N items in k lists, and it only needs the front of each list in memory. That is how external sorting merges files too large for memory, and how databases merge sorted runs.
:::

### 10.5 · Hard · A cache that forgets the oldest

Simulate a least-recently-used (LRU) cache of size `capacity`. `ops` is a list of `["put", key, value]` and `["get", key]`. A `get` returns the value or -1 and counts as a use; a `put` adds or updates a key and, if the cache is over capacity, removes the least recently used key. Return the list of results of the `get` operations.

**Example:** `solve(2, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2]])  ->  [1, -1]`

**Write:** `def solve(capacity, ops):` · 3 tests.

:::answer Hint
`collections.OrderedDict` remembers order and has `move_to_end(key)` and `popitem(last=False)`, both O(1).
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s10_5.py <<'EOF'
from collections import OrderedDict

def solve(capacity, ops):
    cache = OrderedDict()
    results = []
    for op in ops:
        if op[0] == "get":
            key = op[1]
            if key in cache:
                cache.move_to_end(key)          # now the most recently used
                results.append(cache[key])
            else:
                results.append(-1)
        else:
            _, key, value = op
            cache[key] = value
            cache.move_to_end(key)
            if len(cache) > capacity:
                cache.popitem(last=False)       # drop the least recently used
    return results
EOF
python3 check.py 10.5 s10_5.py
```

Every operation is O(1). Without OrderedDict you build it from a dictionary plus a doubly linked list, which is the follow-up question. Caches like this sit in front of every database and API.
:::


## How would you implement an LRU cache?

:::say
I need O(1) lookups and O(1) updates of recency, so I combine a hash map with a doubly linked list ordered by use: a get moves the item to the front, a put adds at the front and removes from the back when over capacity. In Python, OrderedDict provides exactly that with move_to_end and popitem.
:::

:::recap
- Solve practical problems with dictionaries, heaps and ordered dicts.
- Be precise about ties and edge cases.
- Keep rejected records instead of dropping them.
- Explain each solution's complexity.
:::

```quiz
? Why OrderedDict for an LRU cache?
+ It keeps insertion order and moves or removes items in O(1)
- It sorts keys
- It is thread-safe
- It uses less memory than dict
! move_to_end and popitem(last=False) are exactly the two operations needed.

? Merging k sorted lists with a heap costs:
+ O(N log k) for N items in total
- O(N²)
- O(k²)
- O(N log N) always
! Only the front item of each list is in the heap.

? In the record-cleaning problem, what happens to an invalid record?
+ Its id is collected in a reject list
- It is silently dropped
- The whole run fails
- It is loaded anyway
! Rejects are kept so someone can fix the source.
```
