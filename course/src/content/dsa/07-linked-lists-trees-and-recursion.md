---
track: dsa
title: "Linked lists, trees and recursion"
short: Lists and trees
sub: Five problems on node-based structures: reversing a linked list, detecting a loop, the depth of a tree, visiting a tree level by level, and validating a search tree.
---

@setup dsapractice

:::goals
- follow and rewire node references safely
- detect a cycle with fast and slow pointers
- write recursive functions on trees with a clear base case
- traverse a tree depth-first and breadth-first
:::

## The ideas in this lesson

A **linked list** is a chain of nodes, each holding a value and a reference to the next node. A **binary tree** is made of nodes with a value and up to two children, `left` and `right`. The checker builds them for you from Python lists, using the classes in `ds.py`:

```term
class Node:  val, next            # 1 -> 2 -> 3
class Tree:  val, left, right     # built from a level-order list: [3, 9, 20, None, None, 15, 7]
```

`[3, 9, 20, None, None, 15, 7]` lists the tree row by row: root 3; its children 9 and 20; 9 has no children (`None, None`); 20 has children 15 and 7.

**Recursion** means a function calls itself on a smaller part of the problem. Every recursive function needs a **base case** that stops it (an empty tree, the end of a list). Trees are recursive by nature: a tree is a node plus two smaller trees, so most tree answers are "combine the answers of the two subtrees". Python stops recursion at about 1,000 levels; very deep structures need a loop with an explicit stack instead.

A **binary search tree** keeps every value in the left subtree smaller than the node and every value in the right subtree larger, which makes searching O(height).

## The problems

5 problems: 3 easy, 2 medium.

### 7.1 · Easy · Reverse a linked list

Reverse a singly linked list and return its new head. The checker builds the list for you from a Python list and turns your result back into one. Nodes are `Node(val, next)` from `ds.py`.

**Example:** `1 -> 2 -> 3  ->  3 -> 2 -> 1`

**Write:** `def solve(head):` · 4 tests.

:::answer Hint
Walk the list, turning each node's `next` to point backwards. Keep three names: `prev`, `cur`, and the next node before you overwrite it.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s7_1.py <<'EOF'
def solve(head):
    prev, cur = None, head
    while cur:
        nxt = cur.next                 # remember where to go next
        cur.next = prev                # turn the arrow around
        prev, cur = cur, nxt
    return prev
EOF
python3 check.py 7.1 s7_1.py
```

O(n) time, O(1) memory. Linked lists come up less in real data work than in interviews, but this problem tests whether you can keep track of references without losing part of the structure.
:::

### 7.2 · Easy · Does the list loop?

Return `True` if the linked list has a cycle (some node's `next` points back to an earlier node). The checker builds a list from `values` and links the last node to position `pos` (-1 for no cycle).

**Example:** `3 -> 2 -> 0 -> -4 -> (back to 2)  ->  True`

**Write:** `def solve(head):` · 5 tests.

:::answer Hint
Two pointers: a slow one moving one step, a fast one moving two. If there is a loop, the fast one catches the slow one.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s7_2.py <<'EOF'
def solve(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False
EOF
python3 check.py 7.2 s7_2.py
```

**Fast and slow pointers** (Floyd's method): O(n) time, O(1) memory. A set of visited nodes also works in O(n) memory. `is` compares identity, which is what you want for nodes.
:::

### 7.3 · Easy · Depth of a tree

Return the depth of a binary tree: the number of nodes on the longest path from the root down to a leaf. The checker builds the tree from a level-order list where `None` marks a missing child; nodes are `Tree(val, left, right)` from `ds.py`.

**Example:** `[3, 9, 20, None, None, 15, 7]  ->  3`

**Write:** `def solve(root):` · 4 tests.

:::answer Hint
Recursion: the depth of a tree is 1 + the larger depth of its two subtrees. An empty tree has depth 0.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s7_3.py <<'EOF'
def solve(root):
    if root is None:
        return 0
    return 1 + max(solve(root.left), solve(root.right))
EOF
python3 check.py 7.3 s7_3.py
```

**Recursion** fits trees: a tree is a node plus two smaller trees. O(n) time; memory O(height) for the call stack. Always state the base case (empty tree) first.
:::

### 7.4 · Medium · Tree level by level

Return the values of a binary tree level by level: a list of lists, top level first, left to right.

**Example:** `[3, 9, 20, None, None, 15, 7]  ->  [[3], [9, 20], [15, 7]]`

**Write:** `def solve(root):` · 4 tests.

:::answer Hint
Breadth-first search with a queue: process all nodes of the current level, collecting their children for the next level.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s7_4.py <<'EOF'
from collections import deque

def solve(root):
    if root is None:
        return []
    levels, queue = [], deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):    # exactly the nodes of this level
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        levels.append(level)
    return levels
EOF
python3 check.py 7.4 s7_4.py
```

**Breadth-first search (BFS)** visits nearest nodes first using a queue: O(n). Depth-first search (DFS) goes deep first using recursion or a stack. Choosing between them is a frequent follow-up question.
:::

### 7.5 · Medium · Is it a valid search tree?

Return `True` if the binary tree is a valid binary search tree: every value in a node's left subtree is smaller than the node, every value in its right subtree is larger.

**Example:** `[5, 1, 4, None, None, 3, 6]  ->  False   (3 is in 5's right subtree)`

**Write:** `def solve(root):` · 5 tests.

:::answer Hint
Checking each node only against its children is not enough. Pass down the allowed range (low, high) and narrow it as you go.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s7_5.py <<'EOF'
def solve(root, low=float("-inf"), high=float("inf")):
    if root is None:
        return True
    if not (low < root.val < high):
        return False
    return solve(root.left, low, root.val) and solve(root.right, root.val, high)
EOF
python3 check.py 7.5 s7_5.py
```

Carry **bounds** down the recursion: O(n). The common wrong answer compares only parent and child, and the second test is built to catch it.
:::


## What is the difference between depth-first and breadth-first traversal?

:::say
Depth-first goes as deep as possible down one branch before backtracking; it is natural with recursion or a stack. Breadth-first visits all nodes at one level before the next, using a queue. I use breadth-first for shortest paths and level-by-level output, and depth-first for exhaustive searches and when the answer is built from subtrees.
:::

:::recap
- Follow and rewire node references safely.
- Detect a cycle with fast and slow pointers.
- Write recursive functions on trees with a clear base case.
- Traverse a tree depth-first and breadth-first.
:::

```quiz
? What must every recursive function have?
+ A base case that returns without recursing
- A loop
- A global variable
- Two parameters
! Without it the recursion never stops.

? What does [1, None, 2] describe as a level-order tree?
+ Root 1 with no left child and right child 2
- Three nodes in a line to the left
- A list 1 -> 2
- Root 2 with left child 1
! Positions go root, then left and right children, row by row.

? Why compare a tree node with bounds passed down, not just with its children?
+ A value deep in the right subtree must still be larger than the root
- It is faster
- Children may be None
- It uses less memory
! Parent-child checks miss violations further down.
```
