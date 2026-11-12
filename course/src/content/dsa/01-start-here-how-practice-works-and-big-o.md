---
track: dsa
title: "Start here: how the practice works, and Big-O in plain words"
short: Start here
sub: How to solve and check problems in the lab, how to measure whether code is fast enough, the cost of Python's built-in operations, and a method for any coding question.
---

@setup dsapractice

:::goals
- write a solution in the lab and check it
- explain Big-O and why O(n²) fails on large input
- know the cost of common Python operations
- use a six-step method on any coding problem
:::

:::note Who this is for
You can write Python functions with loops, lists and dictionaries ([Python essentials 1](#dataeng-2) and [2](#dataeng-3), or the [Python track](#ch15)). This track teaches the data structures and techniques that coding interviews test, through about 50 problems, each with a hint, a model solution and a checker.
:::

## How the practice works

Every lesson has the folder `~/lab/dsa` ready in the **Lab**, with `check.py` (the checker), `ds.py` (the node types used in lessons 7) and the test data. For each problem, write a file that defines a function called `solve`, then check it:

```term
cat > my.py <<'EOF'
def solve(nums):
    ...
EOF
python3 check.py 1.2 my.py
```

The checker runs several test cases, including awkward ones (empty input, one item, duplicates, negatives). Many problems also have a **large input** of 60,000 to 200,000 items: a correct but slow solution is reported as too slow, with an estimate of how long it would take. The checker grows the input step by step and stops early, so a slow solution never freezes the page.

## Big-O: how the work grows

Big-O describes how the running time grows as the input grows, ignoring constant factors. The program below checks a list for duplicates in two ways and times both on growing inputs.

```run
mkdir -p ~/lab/dsa/bigo && cd ~/lab/dsa/bigo
cat > bigo.py <<'EOF'
import time
def pairs(nums):                       # compare every pair: O(n^2)
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]: return True
    return False
def with_set(nums):                    # remember what we have seen: O(n)
    seen = set()
    for x in nums:
        if x in seen: return True
        seen.add(x)
    return False
print(f"{'n':>7} {'pairs O(n^2)':>14} {'set O(n)':>10}")
for n in (500, 1000, 2000, 4000):
    nums = list(range(n))              # no duplicates: the worst case, every comparison is made
    t = time.perf_counter(); pairs(nums); a = time.perf_counter() - t
    t = time.perf_counter(); with_set(nums); b = time.perf_counter() - t
    print(f"{n:>7} {a * 1000:>11.1f} ms {b * 1000:>7.2f} ms")
EOF
python3 bigo.py
```

Read the columns, not the exact numbers (they depend on the machine): each time n doubles, the pairs version takes about **four times** as long. The set version stays under a millisecond: it grows in proportion to n, but at these sizes it is too fast to time precisely. At 200,000 items the pairs version would need minutes; the set version needs milliseconds.

| Big-O | Name | Doubling n makes it | Typical example |
|---|---|---|---|
| O(1) | constant | no slower | dictionary lookup, `append` |
| O(log n) | logarithmic | one step more | binary search |
| O(n) | linear | 2 times slower | one loop over the data |
| O(n log n) | linearithmic | a little over 2 times | sorting |
| O(n²) | quadratic | 4 times slower | a loop inside a loop over the same data |
| O(2ⁿ) | exponential | squares the time | trying every subset |

**Space** complexity is the same idea for extra memory: the set version uses O(n) memory to save time.

## What Python's built-ins cost

| Operation | Cost | Note |
|---|---|---|
| `lst[i]`, `lst.append(x)`, `lst.pop()` | O(1) | |
| `x in lst`, `lst.index(x)`, `lst.count(x)` | **O(n)** | scans the list |
| `lst.insert(0, x)`, `lst.pop(0)` | **O(n)** | shifts every item; use `collections.deque` |
| `x in s`, `s.add(x)` for a set | O(1) average | |
| `d[k]`, `d[k] = v`, `k in d` for a dict | O(1) average | |
| `sorted(lst)`, `lst.sort()` | O(n log n) | |
| `heapq.heappush`, `heapq.heappop` | O(log n) | smallest item first |
| `deque.append`, `deque.popleft` | O(1) | a queue |
| `s + t` for strings, in a loop | O(n) each | build a list and `"".join` it |

## A method for any problem

1. **Understand:** restate the problem; ask about input size, empty input, duplicates, negatives.
2. **Examples:** work one small example by hand, plus an edge case.
3. **Brute force:** say the simplest correct approach and its Big-O, even if slow.
4. **Improve:** look for repeated work. A hash map, sorting, two pointers, a window, a stack, a heap or a table of earlier answers usually removes it.
5. **Code** it cleanly, with names that explain themselves.
6. **Test and analyse:** run the examples, then state time and memory complexity.

Interviewers grade the conversation as much as the code. Say each step out loud.

## The problems

2 problems: 2 easy.

### 1.1 · Easy · Add up a list by hand

Return the sum of the numbers in `nums` without using the built-in `sum`. An empty list sums to 0.

**Example:** `solve([3, 1, 4])  ->  8`

**Write:** `def solve(nums):` · 4 tests.

:::answer Hint
Start a total at 0 and add each number in a loop.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s1_1.py <<'EOF'
def solve(nums):
    total = 0
    for x in nums:
        total += x
    return total
EOF
python3 check.py 1.1 s1_1.py
```

One pass over the list: **O(n)** time, O(1) extra memory. In real code you would write `sum(nums)`; interviews sometimes forbid built-ins to see the loop.
:::

### 1.2 · Easy · Any duplicates?

Return `True` if any value appears more than once in `nums`, otherwise `False`.

**Example:** `solve([1, 2, 3, 1])  ->  True`

**Write:** `def solve(nums):` · 4 tests. The checker also runs a large input to test speed.

:::answer Hint
Comparing every pair works but is slow on large input. Keep a set of the values seen so far.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s1_2.py <<'EOF'
def solve(nums):
    seen = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False
EOF
python3 check.py 1.2 s1_2.py
```

`x in seen` on a **set** is O(1) on average, so the whole check is **O(n)**. The same test on a list is O(n), which makes the loop O(n²). The checker's large input is there to show the difference: try the pairs version and watch it fail the speed test.
:::


## What is Big-O notation?

:::say
Big-O describes how an algorithm's running time or memory grows as the input grows, ignoring constant factors. A single loop is O(n), a loop inside a loop over the same data is O(n squared), binary search is O(log n) and sorting is O(n log n). It tells me whether a solution will still work when the input is a hundred or a million times larger.
:::

:::recap
- Write a solution in the lab and check it.
- Explain Big-O and why O(n²) fails on large input.
- Know the cost of common Python operations.
- Use a six-step method on any coding problem.
:::

```quiz
? Doubling the input makes a program four times slower. What is its complexity, most likely?
+ O(n²)
- O(n)
- O(log n)
- O(1)
! Quadratic: (2n)² = 4n².

? Which operation is O(n) on a Python list?
+ x in lst
- lst.append(x)
- lst[5]
- lst.pop()
! Membership on a list scans it; use a set for O(1).

? Why use collections.deque for a queue instead of a list?
+ popleft() is O(1); list.pop(0) shifts every item
- deque sorts automatically
- Lists cannot hold numbers
- deque uses less memory in every case
! Removing from the front of a list moves all the other items.
```
