---
track: dataeng
title: "SQL for data engineers: CTEs, window functions, de-duplication and upserts"
short: Advanced SQL
sub: The SQL patterns used in every pipeline and asked in every interview, each run on SQLite, including keep-the-latest-row, running totals, top N per group and an idempotent upsert.
---

:::goals
- structure a long query with common table expressions (CTEs)
- use window functions: `ROW_NUMBER`, `RANK`, `LAG`, running totals and moving averages
- de-duplicate a table keeping the latest version of each key
- write an upsert that can be run twice without changing the result
:::

:::note Before this lesson
You need [SQL basics](#dataeng-5). How a database executes a query and why an index helps is in [Systems 3](#systems-3).
:::

## The idea

`GROUP BY` collapses many rows into one. A **window function** computes something across a group of rows **without collapsing them**: every row stays, and gains a new column such as "running total so far" or "rank inside my customer". The syntax is:

```term
function() OVER (PARTITION BY group_columns ORDER BY sort_columns)
```

`PARTITION BY` says "restart for each group"; `ORDER BY` says "in this order inside the group". A **CTE** (`WITH name AS (...)`) names a sub-query so a long query reads top to bottom like steps of a recipe.

## Run it

The table has a realistic problem: order 4 arrived twice, the second time corrected (85 instead of 80).

```run
mkdir -p ~/lab/de/sql2 && cd ~/lab/de/sql2
cat > sql2.py <<'EOF'
# SQL a data engineer uses daily: CTEs, window functions, de-duplication and upserts.
import sqlite3
db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE events (id INTEGER, customer TEXT, amount REAL, day TEXT, loaded_at TEXT);
INSERT INTO events VALUES
 (1,'asha',20,'2026-03-01','10:00'),(2,'asha',35,'2026-03-03','10:00'),(3,'ben',5,'2026-03-03','10:00'),
 (4,'ben',80,'2026-03-04','10:00'),(5,'chen',12,'2026-03-04','10:00'),(6,'asha',10,'2026-03-05','10:00'),
 (4,'ben',85,'2026-03-04','12:00');   -- the same order arrived again, corrected, in a later load
""")
def show(title, sql):
    cur = db.execute(sql); cols = [c[0] for c in cur.description]
    print(f"-- {title}\n{sql.strip()}")
    print("   " + " | ".join(cols))
    for row in cur: print("   " + " | ".join(str(v) for v in row))
    print()
show("1. de-duplicate: keep the latest version of each id (ROW_NUMBER)", """
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY loaded_at DESC) AS rn FROM events)
SELECT id, customer, amount, day FROM ranked WHERE rn = 1 ORDER BY id;""")
db.execute("CREATE TABLE clean AS SELECT id, customer, amount, day FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY loaded_at DESC) AS rn FROM events) WHERE rn = 1")
show("2. running total per customer (a window keeps every row; GROUP BY would collapse them)", """
SELECT customer, day, amount, SUM(amount) OVER (PARTITION BY customer ORDER BY day) AS running_total FROM clean ORDER BY customer, day;""")
show("3. compare with the previous row (LAG) and rank inside a group", """
SELECT customer, day, amount, amount - LAG(amount) OVER (PARTITION BY customer ORDER BY day) AS change,
       RANK() OVER (PARTITION BY customer ORDER BY amount DESC) AS rank_in_customer FROM clean ORDER BY customer, day;""")
show("4. top order per customer (the classic 'top N per group')", """
WITH r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY customer ORDER BY amount DESC) AS rn FROM clean)
SELECT customer, id, amount FROM r WHERE rn = 1 ORDER BY customer;""")
show("5. daily revenue with a 3-day moving average", """
WITH daily AS (SELECT day, SUM(amount) AS revenue FROM clean GROUP BY day)
SELECT day, revenue, ROUND(AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg_3 FROM daily ORDER BY day;""")
db.executescript("CREATE TABLE target (id INTEGER PRIMARY KEY, customer TEXT, amount REAL); INSERT INTO target VALUES (4,'ben',80),(5,'chen',12);")
db.execute("INSERT INTO target (id, customer, amount) SELECT id, customer, amount FROM clean WHERE true ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, customer = excluded.customer")
show("6. upsert (insert new ids, update existing ones): running it twice gives the same table", "SELECT * FROM target ORDER BY id;")
EOF
python3 sql2.py
```

What each query teaches:

1. **De-duplicate, keep the latest.** `ROW_NUMBER() OVER (PARTITION BY id ORDER BY loaded_at DESC)` numbers the versions of each id, newest first; `WHERE rn = 1` keeps the newest. Order 4 comes out as 85. **This is the single most used pattern in data engineering.**
2. **Running total.** `SUM(amount) OVER (PARTITION BY customer ORDER BY day)`: asha goes 20, 55, 65. All rows are still there.
3. **`LAG`** reads the previous row: asha's change is 15 then -25. The first row has no previous row, so the result is NULL. `RANK` orders inside the group.
4. **Top N per group.** Number the rows inside each group, then keep `rn = 1` (or `rn <= 3`).
5. **Moving average.** `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` is the current row and the two before it. Careful: there is no row for 2026-03-02, so this is an average over 3 **rows**, not 3 calendar days. To average over days you first need one row per day (join to a date table, see [lesson 12](#dataeng-12)).
6. **Upsert.** `INSERT ... ON CONFLICT(id) DO UPDATE` inserts new ids and updates existing ones. Order 4 was updated to 85, and ids 1, 2, 3, 6 were inserted. Run it again and the table is identical. An operation that gives the same result when repeated is **idempotent**, and it is what makes a pipeline safe to re-run after a failure.

## ROW_NUMBER, RANK or DENSE_RANK?

For the values 90, 80, 80, 70:

| Function | Result | Use |
|---|---|---|
| `ROW_NUMBER` | 1, 2, 3, 4 | pick exactly one row per group (ties broken by the sort) |
| `RANK` | 1, 2, 2, 4 | competition ranking: a gap after ties |
| `DENSE_RANK` | 1, 2, 2, 3 | ranking with no gaps ("second highest salary") |

## The same upsert in other databases

```term
-- PostgreSQL, SQLite
INSERT INTO target (id, amount) VALUES (4, 85)
ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount;

-- Snowflake, BigQuery, SQL Server, Spark/Delta (Example, not run here)
MERGE INTO target t USING staging s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET amount = s.amount
WHEN NOT MATCHED THEN INSERT (id, amount) VALUES (s.id, s.amount);
```

## Performance habits

- Select only the columns you need; `SELECT *` reads everything (and costs money in a pay-per-scan warehouse).
- Filter early, on a partition or indexed column.
- Read the plan (`EXPLAIN`) before guessing; see [Systems 3](#systems-3).
- Aggregate before joining when you can, to join fewer rows.

:::try
Add a query that returns, for each day, the difference between that day's revenue and the previous day's (use a CTE for daily revenue, then `LAG`). Then change query 4 to return the top **two** orders per customer.
:::

## How do you remove duplicates and keep the latest record?

:::say
I number the rows per business key with ROW_NUMBER, partitioned by the key and ordered by the update timestamp descending, and keep row number one. It is deterministic if I add a tie-breaker to the ORDER BY, and it works in every warehouse.
:::

## What is a window function, and how is it different from GROUP BY?

:::say
A window function calculates over a set of related rows but keeps every row, while GROUP BY collapses them into one. I use windows for running totals, comparing with the previous row using LAG, ranking, and top-N per group.
:::

## What does idempotent mean, and why does it matter?

:::say
An idempotent operation gives the same result whether it runs once or many times. Pipelines fail and get retried, so loads must be idempotent: I use upserts or MERGE on a key, or delete-and-reload a whole partition, instead of plain inserts that would duplicate rows on a retry.
:::

:::recap
- **CTEs** make long SQL readable; **window functions** add per-group calculations without collapsing rows.
- **Keep the latest:** `ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated DESC) = 1`.
- **Top N per group** is the same pattern with `rn <= N`.
- Row-based windows count rows, not days.
- **Upsert / MERGE** makes loads idempotent.
:::

```quiz
? Which query keeps only the newest version of each id?
+ ROW_NUMBER() OVER (PARTITION BY id ORDER BY loaded_at DESC), then keep rn = 1
- SELECT DISTINCT *
- GROUP BY loaded_at
- ORDER BY id LIMIT 1
! DISTINCT only removes rows that are identical in every column.

? For values 90, 80, 80, 70, what does DENSE_RANK give?
+ 1, 2, 2, 3
- 1, 2, 3, 4
- 1, 2, 2, 4
- 1, 1, 2, 3
! No gap after the tie.

? Why use an upsert instead of a plain INSERT in a pipeline?
+ Re-running the load after a failure does not create duplicates
- It is always faster
- It removes the need for keys
- It compresses the table
! Idempotent loads are safe to retry.
```
