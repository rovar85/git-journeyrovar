---
track: dsa
title: "Hashing: dictionaries, sets and counting"
short: Hashing
sub: Six problems where a dictionary or set turns a slow search into a fast lookup: anagrams, first unique character, grouping, top k, consecutive runs and subarray sums.
---

@setup dsapractice

:::goals
- count with Counter and group with defaultdict
- use a canonical key to group items
- find runs with a set in O(n)
- combine prefix sums with a dictionary
:::

## The ideas in this lesson

A **hash table** stores items by a key and finds them again in O(1) on average, whatever its size. In Python that is `dict` (key to value) and `set` (keys only). Three helpers from `collections` save code:

| Tool | Does | Example |
|---|---|---|
| `Counter(items)` | counts each item | `Counter("banana")["a"]` is 3 |
| `defaultdict(list)` | a dict that starts each new key with an empty list | grouping |
| `defaultdict(int)` | starts each new key at 0 | counting with `+= 1` |

Keys must be **immutable** (numbers, strings, tuples), because their hash must not change. A list cannot be a key; convert it to a tuple or a string first.

Most "can this be done faster?" questions are answered by "yes, with a dictionary". This is also exactly what a database does for `GROUP BY` and for joins.

## The problems

6 problems: 2 easy, 3 medium, 1 hard.

### 3.1 · Easy · Are they anagrams?

Return `True` if `a` and `b` contain exactly the same letters the same number of times.

**Example:** `solve("listen", "silent")  ->  True`

**Write:** `def solve(a, b):` · 5 tests.

:::answer Hint
Count the characters of each word. `collections.Counter` does it in one line.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s3_1.py <<'EOF'
from collections import Counter

def solve(a, b):
    return Counter(a) == Counter(b)
EOF
python3 check.py 3.1 s3_1.py
```

Counting is O(n). Sorting both words (`sorted(a) == sorted(b)`) also works but is O(n log n). `Counter` is a dictionary that counts; it is in the standard library and allowed in nearly every interview.
:::

### 3.2 · Easy · First character that appears once

Return the position of the first character in `s` that appears exactly once, or -1 if there is none.

**Example:** `solve("swiss")  ->  1   ("w")`

**Write:** `def solve(s):` · 5 tests. The checker also runs a large input to test speed.

:::answer Hint
Two passes: count every character, then find the first one whose count is 1.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s3_2.py <<'EOF'
from collections import Counter

def solve(s):
    counts = Counter(s)
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            return i
    return -1
EOF
python3 check.py 3.2 s3_2.py
```

Count first, then scan: O(n) time. Calling `s.count(ch)` inside the loop would rescan the text for every character: O(n²).
:::

### 3.3 · Medium · Group the anagrams

Group the words of `words` that are anagrams of each other. Return a list of groups; each group is a list of words. The order of groups and of words inside a group does not matter.

**Example:** `solve(["eat", "tea", "tan", "ate", "nat", "bat"])  ->  [["eat", "tea", "ate"], ["tan", "nat"], ["bat"]]`

**Write:** `def solve(words):` · 4 tests.

:::answer Hint
Anagrams have the same letters when sorted. Use the sorted letters as a dictionary key: `.join(sorted(word))`.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s3_3.py <<'EOF'
from collections import defaultdict

def solve(words):
    groups = defaultdict(list)          # a dict that starts every new key with an empty list
    for w in words:
        groups["".join(sorted(w))].append(w)
    return list(groups.values())
EOF
python3 check.py 3.3 s3_3.py
```

A **canonical key** turns 'which belong together?' into a dictionary lookup. O(n · k log k) for n words of length k. This is GROUP BY, written in Python.
:::

### 3.4 · Medium · The k most frequent

Return the `k` most frequent numbers in `nums`, most frequent first. Ties are broken by the smaller number first.

**Example:** `solve([1, 1, 1, 2, 2, 3], 2)  ->  [1, 2]`

**Write:** `def solve(nums, k):` · 4 tests.

:::answer Hint
Count with Counter, then sort the distinct numbers by (minus count, number) and take the first k.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s3_4.py <<'EOF'
from collections import Counter

def solve(nums, k):
    counts = Counter(nums)
    ranked = sorted(counts, key=lambda x: (-counts[x], x))
    return ranked[:k]
EOF
python3 check.py 3.4 s3_4.py
```

Counting is O(n); sorting the distinct values is O(m log m). For very large data with a small k, `heapq.nsmallest(k, counts, key=...)` is O(m log k). Stating the tie-break rule is part of a correct answer.
:::

### 3.5 · Medium · Longest run of consecutive numbers

Return the length of the longest sequence of consecutive whole numbers that can be made from the values in `nums` (in any order).

**Example:** `solve([100, 4, 200, 1, 3, 2])  ->  4   (1, 2, 3, 4)`

**Write:** `def solve(nums):` · 5 tests. The checker also runs a large input to test speed.

:::answer Hint
Put the numbers in a set. A run starts at x only if x - 1 is not in the set; from each start, count upwards.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s3_5.py <<'EOF'
def solve(nums):
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 not in values:        # x starts a run
            length = 1
            while x + length in values:
                length += 1
            best = max(best, length)
    return best
EOF
python3 check.py 3.5 s3_5.py
```

Sorting first gives O(n log n). The set version is **O(n)**: each number is visited by at most one inner loop, because inner loops only start at the beginning of a run. The 'gaps and islands' problem from SQL practice is the same idea.
:::

### 3.6 · Hard · How many ranges add up to k?

Return how many contiguous ranges (sublists) of `nums` add up to exactly `k`. Numbers may be negative.

**Example:** `solve([1, 1, 1], 2)  ->  2`

**Write:** `def solve(nums, k):` · 5 tests. The checker also runs a large input to test speed.

:::answer Hint
With running sums, the range from i+1 to j adds to k exactly when `prefix[j] - prefix[i] == k`. Count how many earlier prefixes equal `prefix_now - k` with a dictionary.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s3_6.py <<'EOF'
from collections import defaultdict

def solve(nums, k):
    seen = defaultdict(int)            # running sum -> how many times it has appeared
    seen[0] = 1                        # the empty prefix
    total = count = 0
    for x in nums:
        total += x
        count += seen[total - k]
        seen[total] += 1
    return count
EOF
python3 check.py 3.6 s3_6.py
```

Prefix sums plus a hash map: **O(n)**. Checking every range is O(n²) or O(n³). Negative numbers are why a sliding window does not work here: the sum does not grow steadily as the window widens.
:::


## When would you use a set instead of a list?

:::say
When I need fast membership tests or unique values. Checking whether a value is in a set is O(1) on average, but in a list it is O(n), so a loop with membership checks becomes O(n) instead of O(n squared). The cost is extra memory and no order.
:::

:::recap
- Count with Counter and group with defaultdict.
- Use a canonical key to group items.
- Find runs with a set in O(n).
- Combine prefix sums with a dictionary.
:::

```quiz
? Why can a list not be a dictionary key?
+ It can change, so its hash would change
- It is too long
- Lists are slower
- Keys must be numbers
! Use a tuple, which cannot change.

? What key groups anagrams together?
+ The word's letters in sorted order
- The word's length
- The first letter
- The word itself
! All anagrams share the same sorted letters.

? In the longest-consecutive-run solution, why start counting only when x - 1 is missing?
+ So each run is counted once, keeping the whole thing O(n)
- To save memory
- Because the set is sorted
- It is not necessary
! Otherwise every number would recount its run.
```
