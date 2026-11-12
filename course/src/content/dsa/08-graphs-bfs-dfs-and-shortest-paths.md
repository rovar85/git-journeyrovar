---
track: dsa
title: "Graphs: islands, mazes, task order and cheapest routes"
short: Graphs
sub: Four graph problems: counting islands in a grid, the shortest path through a maze, ordering tasks with dependencies (topological sort), and the cheapest route (Dijkstra).
---

@setup dsapractice

:::goals
- represent a graph as an adjacency list or a grid
- explore connected parts with BFS
- find shortest paths with BFS and Dijkstra
- order tasks with a topological sort and detect cycles
:::

## The ideas in this lesson

A **graph** is a set of things (**nodes**) and connections between them (**edges**): cities and roads, tasks and dependencies, people and friendships, grid cells and their neighbours. Store it as an **adjacency list**: for each node, the list of its neighbours.

| Question | Algorithm | Cost |
|---|---|---|
| What is connected to this? How many groups? | BFS or DFS with a "seen" set | O(V + E) |
| Fewest steps, every step costs the same | BFS | O(V + E) |
| Cheapest path, steps cost different amounts (none negative) | Dijkstra with a heap | O((V + E) log V) |
| In what order can dependent tasks run? Is there a cycle? | Topological sort (Kahn's algorithm) | O(V + E) |

V is the number of nodes and E the number of edges. The most common bug in graph code is forgetting the **seen** set, which makes the search loop forever on a cycle.

Data engineers meet graphs constantly: an Airflow DAG, dbt's model lineage and a build system's dependencies are all directed graphs, ordered with a topological sort ([orchestration](#dataeng-14)).

## The problems

4 problems: 3 medium, 1 hard.

### 8.1 · Medium · Count the islands

`grid` is a list of strings of `1` (land) and `0` (water). Return the number of islands: groups of land cells connected up, down, left or right.

**Example:** `solve(["11000", "11000", "00100", "00011"])  ->  3`

**Write:** `def solve(grid):` · 4 tests.

:::answer Hint
Scan every cell. When you find unvisited land, count an island and visit all the land connected to it (BFS or DFS), marking it as seen.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s8_1.py <<'EOF'
from collections import deque

def solve(grid):
    rows, cols = len(grid), len(grid[0]) if grid else 0
    seen = set()
    islands = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "1" and (r, c) not in seen:
                islands += 1
                queue = deque([(r, c)])
                seen.add((r, c))
                while queue:
                    y, x = queue.popleft()
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == "1" and (ny, nx) not in seen:
                            seen.add((ny, nx))
                            queue.append((ny, nx))
    return islands
EOF
python3 check.py 8.1 s8_1.py
```

A grid is a **graph** where each cell connects to its neighbours. Each cell is visited once: O(rows × cols). Marking cells as seen when they enter the queue, not when they leave, prevents visiting them twice.
:::

### 8.2 · Medium · Shortest path through a maze

`grid` is a list of strings: `.` open, `#` wall. Return the fewest steps from the top-left cell to the bottom-right cell moving up, down, left or right, or -1 if it cannot be reached.

**Example:** `solve(["..#", "#..", "..."])  ->  4`

**Write:** `def solve(grid):` · 4 tests.

:::answer Hint
Breadth-first search from the start, storing the distance of each cell when you first reach it. BFS reaches every cell first by a shortest path.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s8_2.py <<'EOF'
from collections import deque

def solve(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == "#" or grid[-1][-1] == "#":
        return -1
    dist = {(0, 0): 0}
    queue = deque([(0, 0)])
    while queue:
        y, x = queue.popleft()
        if (y, x) == (rows - 1, cols - 1):
            return dist[(y, x)]
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == "." and (ny, nx) not in dist:
                dist[(ny, nx)] = dist[(y, x)] + 1
                queue.append((ny, nx))
    return -1
EOF
python3 check.py 8.2 s8_2.py
```

On an unweighted graph, **BFS finds shortest paths**: O(cells). With different step costs you need Dijkstra's algorithm, which is BFS with a heap instead of a queue.
:::

### 8.3 · Medium · Can the tasks be ordered?

There are `n` tasks numbered 0 to n-1. Each pair `[a, b]` in `deps` means task `b` must finish before task `a`. Return a valid order to run all tasks (any valid order is accepted), or an empty list if the dependencies contain a cycle.

**Example:** `solve(4, [[1, 0], [2, 0], [3, 1], [3, 2]])  ->  [0, 1, 2, 3]   (or [0, 2, 1, 3])`

**Write:** `def solve(n, deps):` · 4 tests.

:::answer Hint
Count how many unfinished prerequisites each task has. Start with the tasks that have none; finishing one lowers its dependants' counts (Kahn's algorithm).
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s8_3.py <<'EOF'
from collections import deque

def solve(n, deps):
    after = [[] for _ in range(n)]     # b -> tasks that wait for b
    waiting = [0] * n                  # task -> number of unfinished prerequisites
    for a, b in deps:
        after[b].append(a)
        waiting[a] += 1
    ready = deque(t for t in range(n) if waiting[t] == 0)
    order = []
    while ready:
        t = ready.popleft()
        order.append(t)
        for nxt in after[t]:
            waiting[nxt] -= 1
            if waiting[nxt] == 0:
                ready.append(nxt)
    return order if len(order) == n else []
EOF
python3 check.py 8.3 s8_3.py
```

This is a **topological sort**: O(tasks + dependencies). It is exactly how Airflow, dbt and Make decide the order of tasks, and how they detect a cycle: some tasks never become ready.
:::

### 8.4 · Hard · Cheapest route

`roads` is a list of `[a, b, cost]` (two-way roads between places numbered 0 to n-1). Return the cheapest total cost from place 0 to place `n - 1`, or -1 if unreachable.

**Example:** `solve(4, [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1]])  ->  4   (0 -> 2 -> 1 -> 3)`

**Write:** `def solve(n, roads):` · 4 tests.

:::answer Hint
Dijkstra's algorithm: a heap of (cost so far, place). Always expand the cheapest place not yet finished.
:::

:::answer Solution
```run
cd ~/lab/dsa
cat > s8_4.py <<'EOF'
import heapq

def solve(n, roads):
    graph = [[] for _ in range(n)]
    for a, b, cost in roads:
        graph[a].append((b, cost))
        graph[b].append((a, cost))
    best = {0: 0}
    heap = [(0, 0)]
    while heap:
        cost, place = heapq.heappop(heap)
        if place == n - 1:
            return cost
        if cost > best.get(place, float("inf")):
            continue                   # an outdated, more expensive entry
        for nxt, c in graph[place]:
            new = cost + c
            if new < best.get(nxt, float("inf")):
                best[nxt] = new
                heapq.heappush(heap, (new, nxt))
    return -1
EOF
python3 check.py 8.4 s8_4.py
```

**Dijkstra**: O((V + E) log V) with a heap. It requires non-negative costs. Routing, network latency and 'cheapest path through a pipeline' questions all reduce to it.
:::


## How would you decide the order to run tasks that depend on each other?

:::say
I model the tasks as a directed graph and run a topological sort: count each task's unfinished prerequisites, start with those that have none, and each time a task finishes, decrease the count of the tasks that depend on it. If some tasks never reach zero there is a cycle. This is how orchestrators like Airflow and dbt order their work.
:::

:::recap
- Represent a graph as an adjacency list or a grid.
- Explore connected parts with BFS.
- Find shortest paths with BFS and Dijkstra.
- Order tasks with a topological sort and detect cycles.
:::

```quiz
? Which algorithm finds the fewest steps through a maze where every step costs 1?
+ Breadth-first search
- Depth-first search
- Sorting
- Binary search
! BFS reaches each cell first by a shortest path.

? What does a topological sort return when the dependencies have a cycle?
+ No complete order exists: some tasks never become ready
- The tasks in reverse
- A random order
- The shortest cycle
! Kahn's algorithm detects this when fewer than n tasks are output.

? When does Dijkstra's algorithm give wrong answers?
+ When some edges have negative costs
- When the graph is large
- When there are cycles
- When costs are decimals
! It assumes a finished node can never get cheaper.
```
