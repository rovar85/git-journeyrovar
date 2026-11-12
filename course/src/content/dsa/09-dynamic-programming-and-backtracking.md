---
track: dsa
title: "Dynamic programming and backtracking"
short: DP and backtracking
sub: Five problems: counting ways to climb stairs, choosing houses without neighbours, the fewest coins, all subsets, and the longest common subsequence.
---

@setup dsapractice

:::goals
- recognise problems built from overlapping smaller problems
- write the recurrence in words before coding
- fill a table bottom-up and reduce its memory
- explore all choices with backtracking
:::

## The ideas in this lesson

**Dynamic programming (DP)** solves a problem by combining answers to smaller versions of it, computing each smaller answer once. The recipe:

1. **Define the state** in words: "best(i) is the most money from the first i houses".
2. **Write the recurrence:** how best(i) follows from smaller states.
3. **Set the base cases:** best(0) = 0.
4. **Fill in order** from the smallest state up (bottom-up), or recurse with a cache (`functools.lru_cache`).
5. **Shrink memory** if only the last row or two values are needed.

**Backtracking** explores every sequence of choices: make a choice, recurse, undo the choice. It is for problems that ask for *all* answers (subsets, permutations, puzzle solutions), and it is exponential by nature, so the input sizes are small.

Greedy shortcuts ("always take the biggest coin") are tempting and often wrong; test them against a small counter-example before trusting them.

## The problems

5 problems: 1 easy, 3 medium, 1 hard.

### 9.1 · Easy · Ways to climb the stairs

You climb `n` steps, 1 or 2 at a time. Return how many different ways there are to reach the top.

**Example:** `solve(4)  ->  5`

**Write:** `def solve(n):` · 5 tests.

:::answer Hint
The last move was 1 step or 2 steps, so ways(n) = ways(n - 1) + ways(n - 2). Build up from the bottom instead of recursing.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s9_1.py <<'EOF'
def solve(n):
    a, b = 1, 1                        # ways to reach step 0 and step 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b if n > 0 else 1
EOF
python3 check.py 9.1 s9_1.py
```

**Dynamic programming**: reuse answers to smaller versions of the problem. Plain recursion recomputes the same values exponentially often; building up from the bottom is O(n) time and O(1) memory.
:::

### 9.2 · Medium · Rob the houses, not two in a row

`money[i]` is the cash in house `i` along a street. You cannot take from two neighbouring houses. Return the most you can take.

**Example:** `solve([2, 7, 9, 3, 1])  ->  12   (2 + 9 + 1)`

**Write:** `def solve(money):` · 5 tests.

:::answer Hint
At each house you either skip it (keep the best so far) or take it (its money plus the best up to two houses back).
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s9_2.py <<'EOF'
def solve(money):
    take_prev, best = 0, 0             # best up to two houses back, best up to the previous house
    for m in money:
        take_prev, best = best, max(best, take_prev + m)
    return best
EOF
python3 check.py 9.2 s9_2.py
```

Each step chooses between two earlier answers: O(n), O(1) memory. Writing the **recurrence** in words first (best(i) = max(best(i-1), best(i-2) + money[i])) is what makes DP questions manageable.
:::

### 9.3 · Medium · Fewest coins

Return the fewest coins from the denominations in `coins` (unlimited supply of each) that make `amount`, or -1 if it cannot be made.

**Example:** `solve([1, 2, 5], 11)  ->  3   (5 + 5 + 1)`

**Write:** `def solve(coins, amount):` · 5 tests.

:::answer Hint
Build a table `best[a]` for every amount from 0 up: `best[a] = 1 + min(best[a - c])` over the coins c that fit.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s9_3.py <<'EOF'
def solve(coins, amount):
    INF = amount + 1
    best = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    return best[amount] if best[amount] != INF else -1
EOF
python3 check.py 9.3 s9_3.py
```

A **table** of answers to every smaller amount: O(amount × coins). The greedy approach (always the biggest coin) fails for coins like [1, 3, 4] and amount 6, and one test checks exactly that.
:::

### 9.4 · Medium · All subsets

Return every subset of the distinct numbers in `nums`, including the empty one. Any order of subsets; each subset in any order.

**Example:** `solve([1, 2, 3])  ->  [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]]`

**Write:** `def solve(nums):` · 4 tests.

:::answer Hint
Backtracking: for each number, either include it or not, and recurse on the rest.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s9_4.py <<'EOF'
def solve(nums):
    out = []
    def build(i, chosen):
        if i == len(nums):
            out.append(list(chosen))
            return
        build(i + 1, chosen)           # without nums[i]
        chosen.append(nums[i])
        build(i + 1, chosen)           # with nums[i]
        chosen.pop()                   # undo the choice: that is the "back" in backtracking
    build(0, [])
    return out
EOF
python3 check.py 9.4 s9_4.py
```

**Backtracking** explores choices and undoes them. There are 2ⁿ subsets, so O(n · 2ⁿ) is the best possible. The same skeleton generates permutations, combinations and puzzle solutions.
:::

### 9.5 · Hard · Longest common subsequence

Return the length of the longest sequence of characters that appears in both `a` and `b` in the same order (not necessarily next to each other).

**Example:** `solve("abcde", "ace")  ->  3   ("ace")`

**Write:** `def solve(a, b):` · 5 tests.

:::answer Hint
A table `L[i][j]` = answer for the first i characters of a and the first j of b. If the characters match, 1 + the diagonal; otherwise the better of left and up.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s9_5.py <<'EOF'
def solve(a, b):
    prev = [0] * (len(b) + 1)
    for ch in a:
        cur = [0]
        for j, other in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if ch == other else max(prev[j], cur[j - 1]))
        prev = cur
    return prev[-1]
EOF
python3 check.py 9.5 s9_5.py
```

A **2-D table** filled row by row: O(len(a) × len(b)) time; keeping only the previous row makes memory O(len(b)). The same table underlies `diff`, spell checkers and DNA alignment.
:::


## How do you approach a dynamic programming problem?

:::say
I define the state in words, for example the fewest coins for each amount, write the recurrence that builds it from smaller states, set the base cases, and fill a table from the smallest state up. Then I check whether I only need the last row so I can cut the memory. I test it on a small case where a greedy approach would fail.
:::

:::recap
- Recognise problems built from overlapping smaller problems.
- Write the recurrence in words before coding.
- Fill a table bottom-up and reduce its memory.
- Explore all choices with backtracking.
:::

```quiz
? What makes a problem suitable for dynamic programming?
+ Its answer combines answers to smaller overlapping versions of itself
- It needs sorting
- It has a stack
- Its input is a graph
! Overlapping subproblems computed once.

? Why does 'always take the biggest coin' fail for coins [1, 3, 4] and amount 6?
+ Greedy gives 4 + 1 + 1 (3 coins) but 3 + 3 (2 coins) is better
- 4 is too big
- It cannot make 6
- It is correct
! A counter-example disproves a greedy rule.

? How many subsets does a set of n items have?
+ 2 to the power n
- n
- n squared
- n factorial
! Each item is either in or out.
```
