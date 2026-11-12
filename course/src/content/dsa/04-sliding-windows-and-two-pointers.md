---
track: dsa
title: "Sliding windows and two pointers"
short: Sliding windows
sub: Five problems where a window or two pointers move across the data once: best fixed-size window, longest stretch without repeats, two walls holding water, three numbers summing to zero, and the smallest window containing a set of letters.
---

@setup dsapractice

:::goals
- slide a fixed-size window in O(n)
- grow and shrink a variable window
- move two pointers toward each other on sorted data
- avoid duplicate answers after sorting
:::

## The ideas in this lesson

A **window** is a stretch of consecutive items. Instead of recomputing each window from scratch, update it as it moves: add what enters, remove what leaves.

- **Fixed window** (size k): add the new item, subtract the item k places back.
- **Variable window:** move the right edge forward to include more; move the left edge forward when the window breaks a rule. Each edge only moves forward, so the total work is O(n).
- **Two pointers from both ends:** on sorted data or a symmetric problem, start at both ends and move the pointer that cannot lead to a better answer.

Windows work when adding an item can only make the window "more" of something (longer, bigger sum with positive numbers). With negative numbers, use prefix sums instead (problem 3.6).

## The problems

5 problems: 1 easy, 3 medium, 1 hard.

### 4.1 · Easy · Best total of k days in a row

Return the largest sum of any `k` consecutive numbers in `nums` (`1 <= k <= len(nums)`).

**Example:** `solve([2, 1, 5, 1, 3, 2], 3)  ->  9   (5 + 1 + 3)`

**Write:** `def solve(nums, k):` · 4 tests. The checker also runs a large input to test speed.

:::answer Hint
Sum the first k numbers. Then slide the window one step at a time: add the number entering, subtract the one leaving.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s4_1.py <<'EOF'
def solve(nums, k):
    window = sum(nums[:k])
    best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i - k]
        best = max(best, window)
    return best
EOF
python3 check.py 4.1 s4_1.py
```

A **fixed sliding window** updates the sum in O(1) per step: O(n) total instead of O(n·k).
:::

### 4.2 · Medium · Longest stretch without a repeat

Return the length of the longest piece of the text `s` (contiguous characters) in which no character repeats.

**Example:** `solve("abcabcbb")  ->  3   ("abc")`

**Write:** `def solve(s):` · 6 tests. The checker also runs a large input to test speed.

:::answer Hint
A window that grows to the right. Remember where each character was last seen; when it repeats inside the window, move the left edge just past that earlier position.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s4_2.py <<'EOF'
def solve(s):
    last = {}                          # character -> last position seen
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1        # jump past the earlier copy
        last[ch] = right
        best = max(best, right - left + 1)
    return best
EOF
python3 check.py 4.2 s4_2.py
```

A **variable sliding window**: each character enters once and the left edge only moves forward, so **O(n)**. Restarting the window at every position would be O(n²).
:::

### 4.3 · Medium · Two walls that hold the most water

`heights[i]` is the height of a wall at position `i`. Choose two walls; the water between them is `min(height_a, height_b) * distance`. Return the most water possible.

**Example:** `solve([1, 8, 6, 2, 5, 4, 8, 3, 7])  ->  49`

**Write:** `def solve(heights):` · 4 tests. The checker also runs a large input to test speed.

:::answer Hint
Start with the widest pair (both ends). Moving the taller wall inward can never help, so always move the shorter one.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s4_3.py <<'EOF'
def solve(heights):
    i, j = 0, len(heights) - 1
    best = 0
    while i < j:
        best = max(best, min(heights[i], heights[j]) * (j - i))
        if heights[i] < heights[j]:
            i += 1
        else:
            j -= 1
    return best
EOF
python3 check.py 4.3 s4_3.py
```

Two pointers from the ends, **O(n)**. The argument for why it is safe to discard the shorter wall is what interviewers want to hear: any pair using that wall with a closer partner is narrower and no taller.
:::

### 4.4 · Medium · Three numbers that sum to zero

Return every distinct triple `[a, b, c]` of values from `nums` (using different positions) with `a + b + c == 0`. Each triple sorted ascending; the list of triples in any order; no duplicate triples.

**Example:** `solve([-1, 0, 1, 2, -1, -4])  ->  [[-1, -1, 2], [-1, 0, 1]]`

**Write:** `def solve(nums):` · 4 tests.

:::answer Hint
Sort. Fix the first number, then find pairs in the rest with two pointers. Skip values equal to the previous one to avoid duplicate triples.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s4_4.py <<'EOF'
def solve(nums):
    nums = sorted(nums)
    out = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue                   # same first number as before: skip
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                out.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                while lo < hi and nums[lo] == nums[lo - 1]:
                    lo += 1
    return out
EOF
python3 check.py 4.4 s4_4.py
```

Sort, then a two-pointer search per first number: **O(n²)**, the best known for this problem, versus O(n³) for three nested loops. Handling duplicates is the hard part, and the tests check it.
:::

### 4.5 · Hard · Smallest window containing all letters

Return the shortest piece of `s` that contains every character of `t` (with repeats: if `t` has two `a`, the piece needs two). Return `""` if none exists. If several are equally short, return the leftmost.

**Example:** `solve("ADOBECODEBANC", "ABC")  ->  "BANC"`

**Write:** `def solve(s, t):` · 6 tests.

:::answer Hint
Grow the window to the right until it contains everything, then shrink it from the left while it still does, recording the best. Keep counts of what is still missing.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s4_5.py <<'EOF'
from collections import Counter

def solve(s, t):
    if not t:
        return ""
    need = Counter(t)
    missing = len(t)                   # characters still missing from the window
    left = 0
    best = (float("inf"), 0, 0)
    for right, ch in enumerate(s):
        if need[ch] > 0:
            missing -= 1
        need[ch] -= 1
        while missing == 0:            # window holds everything: try to shrink it
            if right - left + 1 < best[0]:
                best = (right - left + 1, left, right + 1)
            need[s[left]] += 1
            if need[s[left]] > 0:
                missing += 1
            left += 1
    return s[best[1]:best[2]] if best[0] != float("inf") else ""
EOF
python3 check.py 4.5 s4_5.py
```

**Expand, then contract** the window. Each character enters and leaves at most once: **O(len(s) + len(t))**. This is the hardest sliding-window question commonly asked.
:::


## When do you use a sliding window?

:::say
When the answer is about a contiguous stretch of a list or string, such as the longest substring without repeats or the best sum of k items. I keep a window between two indices and update it incrementally as the edges move forward, which makes it O(n) instead of checking every stretch.
:::

:::recap
- Slide a fixed-size window in O(n).
- Grow and shrink a variable window.
- Move two pointers toward each other on sorted data.
- Avoid duplicate answers after sorting.
:::

```quiz
? A fixed window of size k moves one step right. How is its sum updated?
+ Add the item entering and subtract the item leaving
- Recompute the whole sum
- Multiply by k
- Sort the window
! O(1) per step instead of O(k).

? Why is a variable sliding window O(n) despite a loop inside a loop?
+ Each edge only moves forward, so each item enters and leaves once
- Python optimises it
- The inner loop never runs
- It is actually O(n²)
! Count total moves, not loops.

? For three numbers summing to zero, what comes first?
+ Sorting the list
- A dictionary of pairs
- A recursive search
- Removing negatives
! Sorting enables two pointers and easy duplicate skipping.
```
