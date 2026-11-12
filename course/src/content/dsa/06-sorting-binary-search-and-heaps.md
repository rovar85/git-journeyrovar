---
track: dsa
title: "Sorting, binary search and heaps"
short: Search and heaps
sub: Four problems: binary search, searching for the first failing version, merging intervals after sorting, and the k-th largest with a heap.
---

@setup dsapractice

:::goals
- write binary search without off-by-one mistakes
- binary-search an answer that flips from no to yes
- sort to make a problem simple
- use heapq for the smallest or largest k
:::

## The ideas in this lesson

- **Sorting** costs O(n log n) and often makes the rest easy: equal items become neighbours, overlaps become adjacent, two pointers become possible. Python's `sorted(items, key=...)` sorts by anything.
- **Binary search** finds an item in sorted data in O(log n) by halving the range. More generally, it finds the point where a yes/no condition flips from no to yes. The standard library has `bisect` for sorted lists.
- **Heap** (`heapq`): a list arranged so the smallest item is always at position 0. Adding and removing are O(log n). Keep a heap of size k to track the k largest of a stream. For the largest first, push negated values.

## The problems

4 problems: 1 easy, 3 medium.

### 6.1 · Easy · Binary search

`nums` is sorted ascending. Return the position of `target`, or -1 if it is not there.

**Example:** `solve([-1, 0, 3, 5, 9, 12], 9)  ->  4`

**Write:** `def solve(nums, target):` · 6 tests.

:::answer Hint
Look at the middle. If it is too small, the answer is to the right; if too big, to the left. Repeat on half the list.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s6_1.py <<'EOF'
def solve(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
EOF
python3 check.py 6.1 s6_1.py
```

Halving the search each step: **O(log n)**: about 20 steps for a million items, against a million for a scan. The off-by-one details (`<=`, `mid + 1`, `mid - 1`) are where people slip, so test the edges: first, last, missing.
:::

### 6.2 · Medium · First version that fails

Versions `1..n` of a program were released; from some version onward every build is bad. `is_bad(v)` tells you whether version `v` is bad. Return the first bad version using as few calls as possible. (The checker passes `n` and a function `is_bad`.)

**Example:** `n = 5, first bad = 4  ->  4`

**Write:** `def solve(n, is_bad):` · 5 tests.

:::answer Hint
Binary search for the first True: if `mid` is bad, the answer is `mid` or earlier; if good, it is later.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s6_2.py <<'EOF'
def solve(n, is_bad):
    lo, hi = 1, n
    while lo < hi:
        mid = (lo + hi) // 2
        if is_bad(mid):
            hi = mid                   # mid could be the first bad one
        else:
            lo = mid + 1
    return lo
EOF
python3 check.py 6.2 s6_2.py
```

**Binary search on the answer**: whenever a yes/no question flips once from no to yes, you can find the flip in O(log n) checks. It is also how `git bisect` finds the commit that broke a build.
:::

### 6.3 · Medium · Merge overlapping intervals

Merge all overlapping intervals in `intervals` (each `[start, end]`) and return the result sorted by start. Intervals that touch (`[1, 4]` and `[4, 5]`) count as overlapping.

**Example:** `solve([[1, 3], [2, 6], [8, 10], [15, 18]])  ->  [[1, 6], [8, 10], [15, 18]]`

**Write:** `def solve(intervals):` · 5 tests.

:::answer Hint
Sort by start. Walk through them: if an interval starts before the last merged one ends, extend it; otherwise start a new one.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s6_3.py <<'EOF'
def solve(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
EOF
python3 check.py 6.3 s6_3.py
```

Sorting makes overlaps neighbours: **O(n log n)**. The same logic merges booking slots, outage windows and IP ranges.
:::

### 6.4 · Medium · The k-th largest

Return the `k`-th largest value in `nums` (1 means the largest). Duplicates count separately.

**Example:** `solve([3, 2, 1, 5, 6, 4], 2)  ->  5`

**Write:** `def solve(nums, k):` · 4 tests. The checker also runs a large input to test speed.

:::answer Hint
Keep a min-heap of the k largest seen so far with `heapq`; its smallest item is the answer.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s6_4.py <<'EOF'
import heapq

def solve(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)        # drop the smallest: the heap keeps the k largest
    return heap[0]
EOF
python3 check.py 6.4 s6_4.py
```

A **heap** gives the smallest item in O(1) and adds or removes in O(log k): **O(n log k)** total. `sorted(nums)[-k]` is O(n log n) and fine for small inputs; say which you would use and why.
:::


## When would you use a heap?

:::say
When I repeatedly need the smallest or largest item while items are being added, for example the top k of a stream, merging sorted lists, scheduling, or Dijkstra's shortest path. heapq gives the smallest in O(1) and pushes and pops in O(log n), which beats re-sorting each time.
:::

:::recap
- Write binary search without off-by-one mistakes.
- Binary-search an answer that flips from no to yes.
- Sort to make a problem simple.
- Use heapq for the smallest or largest k.
:::

```quiz
? Binary search needs the data to be:
+ Sorted (or a condition that flips once from false to true)
- Unique
- Small
- Numbers only
! It discards half the range each step based on order.

? How many steps does binary search need for a million items?
+ About 20
- About 1,000
- About 500,000
- About 1
! 2 to the 20 is about a million.

? To keep the 10 largest values of a long stream, keep:
+ A min-heap of size 10
- A max-heap of every value
- A sorted list of every value
- A set
! The smallest of the ten is at the top, ready to be replaced.
```
