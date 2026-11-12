---
track: dsa
title: "Stacks and queues"
short: Stacks and queues
sub: Four problems: balanced brackets, days until a warmer day with a monotonic stack, a postfix calculator, and processing a queue in order.
---

@setup dsapractice

:::goals
- use a list as a stack
- use deque as a queue
- solve 'next greater' problems with a monotonic stack
- evaluate expressions with a stack
:::

## The ideas in this lesson

| Structure | Rule | Python | Used for |
|---|---|---|---|
| **Stack** | last in, first out | `list`: `append`, `pop` | matching brackets, undo, depth-first search, expression evaluation |
| **Queue** | first in, first out | `collections.deque`: `append`, `popleft` | processing in arrival order, breadth-first search, buffers |

A **monotonic stack** keeps its items in increasing or decreasing order. When a new item breaks the order, everything it "beats" is popped and answered. It solves every "next greater / next smaller" question in O(n).

## The problems

4 problems: 1 easy, 3 medium.

### 5.1 · Easy · Balanced brackets

Return `True` if every bracket in `s` (only `()[]{}`) is closed by the right kind in the right order.

**Example:** `solve("{[()]}")  ->  True;   solve("(]")  ->  False`

**Write:** `def solve(s):` · 6 tests.

:::answer Hint
Push each opening bracket on a stack. A closing bracket must match the top of the stack.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s5_1.py <<'EOF'
def solve(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack                   # anything left open is unbalanced
EOF
python3 check.py 5.1 s5_1.py
```

A **stack** (last in, first out) matches the most recent opening bracket first: O(n). A Python list is a stack: `append` pushes, `pop` removes the last item. The last line catches `"(("`.
:::

### 5.2 · Medium · Days until a warmer day

`temps[i]` is the temperature on day `i`. Return a list where position `i` is how many days you wait after day `i` for a warmer day, or 0 if none comes.

**Example:** `solve([73, 74, 75, 71, 69, 72, 76, 73])  ->  [1, 1, 4, 2, 1, 1, 0, 0]`

**Write:** `def solve(temps):` · 4 tests. The checker also runs a large input to test speed.

:::answer Hint
Keep a stack of days still waiting for a warmer day. Each new day answers every waiting day that is colder than it.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s5_2.py <<'EOF'
def solve(temps):
    answer = [0] * len(temps)
    waiting = []                       # positions, temperatures decreasing from bottom to top
    for i, t in enumerate(temps):
        while waiting and temps[waiting[-1]] < t:
            j = waiting.pop()
            answer[j] = i - j
        waiting.append(i)
    return answer
EOF
python3 check.py 5.2 s5_2.py
```

A **monotonic stack**: every day is pushed once and popped at most once, so **O(n)** although there is a loop inside a loop. Checking forward from each day is O(n²) and times out on the large test.
:::

### 5.3 · Medium · A calculator for postfix notation

Evaluate an expression in postfix notation, given as a list of tokens: numbers and `+ - * /`. Division truncates toward zero. Example: `["2", "1", "+", "3", "*"]` means (2 + 1) * 3.

**Example:** `solve(["2", "1", "+", "3", "*"])  ->  9`

**Write:** `def solve(tokens):` · 4 tests.

:::answer Hint
Numbers go on a stack. An operator pops two numbers (the second popped is the left operand), computes, and pushes the result.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s5_3.py <<'EOF'
def solve(tokens):
    stack = []
    for tok in tokens:
        if tok in "+-*/" and len(tok) == 1:
            b = stack.pop()
            a = stack.pop()
            if tok == "+":
                stack.append(a + b)
            elif tok == "-":
                stack.append(a - b)
            elif tok == "*":
                stack.append(a * b)
            else:
                stack.append(int(a / b))   # truncate toward zero, unlike // for negatives
        else:
            stack.append(int(tok))
    return stack[0]
EOF
python3 check.py 5.3 s5_3.py
```

Stacks evaluate expressions and undo histories. O(n). Note `int(a / b)` versus `a // b`: `-7 // 2` is -4 in Python, `int(-7 / 2)` is -3. Tests include that case.
:::

### 5.4 · Medium · Process a queue in order

A printer receives `jobs`, a list of `[name, pages]`, and prints at most `rate` pages per minute, finishing one job before starting the next. Return the list of `[name, minute]` when each job finishes (minutes counted from 1).

**Example:** `solve([["a", 3], ["b", 1]], 2)  ->  [["a", 2], ["b", 2]]`

**Write:** `def solve(jobs, rate):` · 4 tests.

:::answer Hint
Use `collections.deque` as a queue (first in, first out). Each minute you have `rate` pages of capacity; spend it on the job at the front, possibly finishing several small jobs in one minute.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s5_4.py <<'EOF'
from collections import deque

def solve(jobs, rate):
    queue = deque([name, pages] for name, pages in jobs)
    done, minute = [], 0
    while queue:
        minute += 1
        capacity = rate
        while queue and capacity > 0:
            job = queue[0]
            used = min(capacity, job[1])
            job[1] -= used
            capacity -= used
            if job[1] == 0:
                done.append([job[0], minute])
                queue.popleft()
    return done
EOF
python3 check.py 5.4 s5_4.py
```

A **queue** serves items in arrival order. `deque.popleft()` is O(1); `list.pop(0)` is O(n) because every item shifts. Queues are also how breadth-first search works (lesson 8).
:::


## What is the difference between a stack and a queue?

:::say
A stack is last in, first out: you add and remove at the same end, like a pile of plates. A queue is first in, first out: you add at the back and remove from the front. In Python I use a list as a stack and collections.deque as a queue, because removing from the front of a list is O(n).
:::

:::recap
- Use a list as a stack.
- Use deque as a queue.
- Solve 'next greater' problems with a monotonic stack.
- Evaluate expressions with a stack.
:::

```quiz
? Which structure matches brackets?
+ A stack
- A queue
- A heap
- A set
! The most recently opened bracket must close first.

? Why is the warmer-day solution O(n)?
+ Each day is pushed once and popped at most once
- The inner loop runs once
- Temperatures are small numbers
- It uses binary search
! Amortised analysis: count pushes and pops.

? What does int(-7 / 2) give in Python, compared with -7 // 2?
+ -3 and -4
- -4 and -3
- -3 and -3
- -3.5 and -4
! // rounds down; int() truncates toward zero.
```
