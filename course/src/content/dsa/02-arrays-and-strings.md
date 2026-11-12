---
track: dsa
title: "Arrays and strings: two pointers, running values and prefix sums"
short: Arrays and strings
sub: Six problems on lists and text: a hash-map lookup, two pointers from both ends, carrying the best value so far, a write pointer, prefix sums and left-right products.
---

@setup dsapractice

:::goals
- use a dictionary to find a partner value in one pass
- walk a list with two pointers
- carry a running minimum or maximum
- answer range-sum questions with prefix sums
:::

## The ideas in this lesson

A Python list is an **array**: items in order, reached by position in O(1). Most array problems are solved by one of a few patterns:

| Pattern | When | Problems |
|---|---|---|
| **Hash map of what you have seen** | "find a pair", "have I seen this?" | 2.1 |
| **Two pointers** from both ends | sorted data, palindromes, pairs | 2.2 |
| **Carry the best so far** | "best profit", "maximum ending here" | 2.3 |
| **Write pointer** | remove or move items in place | 2.4 |
| **Prefix sums** | sums of ranges, many queries | 2.5, 2.6 |

Strings behave like lists of characters, except that they cannot be changed: building a string with `+=` in a loop copies it every time, so collect pieces in a list and `"".join(pieces)` at the end.

## The problems

6 problems: 4 easy, 2 medium.

### 2.1 · Easy · Two numbers that add up

Given a list of whole numbers `nums` and a `target`, return the positions `[i, j]` (with `i < j`) of the two numbers that add up to `target`. There is exactly one answer.

**Example:** `solve([2, 7, 11, 15], 9)  ->  [0, 1]`

**Write:** `def solve(nums, target):` · 5 tests. The checker also runs a large input to test speed.

:::answer Hint
For each number, the partner you need is `target - x`. Remember the numbers you have already seen in a dictionary: number -> position.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s2_1.py <<'EOF'
def solve(nums, target):
    seen = {}                          # number -> its position
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
EOF
python3 check.py 2.1 s2_1.py
```

Checking every pair is O(n²): fine for 10 numbers, far too slow for 100,000. The dictionary turns 'have I seen the partner?' into an O(1) lookup, so one pass is enough: **O(n) time, O(n) extra memory**. Trading memory for time with a hash map is the most common interview move.
:::

### 2.2 · Easy · Palindrome, ignoring punctuation

Return `True` if the text `s` reads the same forwards and backwards when you keep only letters and digits and ignore case, otherwise `False`.

**Example:** `solve("Never odd or even.")  ->  True`

**Write:** `def solve(s):` · 6 tests.

:::answer Hint
Two pointers: one from the left, one from the right, skipping characters that are not letters or digits (`ch.isalnum()`).
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s2_2.py <<'EOF'
def solve(s):
    i, j = 0, len(s) - 1
    while i < j:
        if not s[i].isalnum():
            i += 1
        elif not s[j].isalnum():
            j -= 1
        elif s[i].lower() != s[j].lower():
            return False
        else:
            i += 1
            j -= 1
    return True
EOF
python3 check.py 2.2 s2_2.py
```

The **two-pointer** pattern walks inward from both ends: O(n) time and O(1) extra memory. The one-liner `t = [c.lower() for c in s if c.isalnum()]; return t == t[::-1]` is also O(n) but builds a copy; either is accepted, and saying the trade-off is what earns the marks.
:::

### 2.3 · Easy · Best day to buy and sell

`prices[i]` is a share price on day `i`. Buy on one day and sell on a later day. Return the largest profit possible, or 0 if no profit is possible.

**Example:** `solve([7, 1, 5, 3, 6, 4])  ->  5   (buy at 1, sell at 6)`

**Write:** `def solve(prices):` · 5 tests. The checker also runs a large input to test speed.

:::answer Hint
Walk through the days once, remembering the lowest price so far. At each day, the best sale today is `price - lowest`.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s2_3.py <<'EOF'
def solve(prices):
    lowest = float("inf")
    best = 0
    for p in prices:
        lowest = min(lowest, p)
        best = max(best, p - lowest)
    return best
EOF
python3 check.py 2.3 s2_3.py
```

Keep a running minimum and a running best: **O(n) time, O(1) memory**. This 'carry the best so far' idea is a small form of dynamic programming.
:::

### 2.4 · Easy · Move the zeros to the end

Return a new list with all zeros of `nums` moved to the end, keeping the order of the other numbers.

**Example:** `solve([0, 1, 0, 3, 12])  ->  [1, 3, 12, 0, 0]`

**Write:** `def solve(nums):` · 5 tests.

:::answer Hint
Collect the non-zero numbers in order, then add as many zeros as were removed. Or do it in place with a 'write position' pointer.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s2_4.py <<'EOF'
def solve(nums):
    nums = list(nums)                  # work on a copy
    write = 0
    for x in nums:
        if x != 0:
            nums[write] = x
            write += 1
    for k in range(write, len(nums)):
        nums[k] = 0
    return nums
EOF
python3 check.py 2.4 s2_4.py
```

A **write pointer** copies each kept value forward, then fills the rest. O(n) time, O(1) extra memory when done in place. Interviewers often ask for 'in place' to see this pattern.
:::

### 2.5 · Medium · Running sums answer range questions

Given `nums` and a list of `queries`, each `[left, right]`, return a list with the sum of `nums[left..right]` (both ends included) for each query.

**Example:** `solve([3, 1, 4, 1, 5], [[0, 2], [1, 4], [3, 3]])  ->  [8, 11, 1]`

**Write:** `def solve(nums, queries):` · 3 tests.

:::answer Hint
Build `prefix` where `prefix[k]` is the sum of the first k numbers. Then any range sum is a subtraction: `prefix[right + 1] - prefix[left]`.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s2_5.py <<'EOF'
def solve(nums, queries):
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    return [prefix[r + 1] - prefix[l] for l, r in queries]
EOF
python3 check.py 2.5 s2_5.py
```

**Prefix sums**: O(n) to build once, then O(1) per query, instead of O(n) per query. The same idea powers running totals in SQL and cumulative sums in pandas.
:::

### 2.6 · Medium · Product of all the others

Return a list where position `i` holds the product of every number in `nums` except `nums[i]`. Do it without division.

**Example:** `solve([1, 2, 3, 4])  ->  [24, 12, 8, 6]`

**Write:** `def solve(nums):` · 4 tests.

:::answer Hint
The answer at i is (product of everything to the left) times (product of everything to the right). Compute the left products in one pass and the right products in a second pass.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s2_6.py <<'EOF'
def solve(nums):
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):                 # out[i] = product of nums[0..i-1]
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):     # multiply in the product of nums[i+1..]
        out[i] *= right
        right *= nums[i]
    return out
EOF
python3 check.py 2.6 s2_6.py
```

Two passes, **O(n) time**, O(1) extra memory besides the output. Division would fail on zeros, which is why the question forbids it; the test cases include zeros.
:::


## How do you solve two-sum, and what is its complexity?

:::say
I walk the list once and keep a dictionary from each value I have seen to its position. For each number I check whether target minus that number is already in the dictionary; if so I have the pair. That is O(n) time and O(n) memory, against O(n squared) for checking every pair.
:::

:::recap
- Use a dictionary to find a partner value in one pass.
- Walk a list with two pointers.
- Carry a running minimum or maximum.
- Answer range-sum questions with prefix sums.
:::

```quiz
? You need the positions of two numbers that add to a target in an unsorted list of 100,000 numbers. Which approach?
+ One pass with a dictionary of value to position
- Two nested loops
- Sort and binary search each number
- Try every subset
! O(n) instead of O(n²).

? What does prefix[k] hold in a prefix-sum array?
+ The sum of the first k numbers
- The k-th number
- The largest of the first k numbers
- The sum of the last k numbers
! Then any range sum is one subtraction.

? Why is building a long string with += in a loop slow?
+ Strings cannot change, so each += copies the whole string
- Python forbids it
- It uses a set
- It sorts the string
! Collect pieces in a list and join once.
```
