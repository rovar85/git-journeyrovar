---
track: dataeng
title: "SQL from zero: select, filter, group and join"
short: SQL basics
sub: Tables, rows and keys, then the six clauses of a query, aggregation, inner and left joins, the anti-join and how NULL behaves, all run on SQLite.
---

:::goals
- read and write a `SELECT` with `WHERE`, `GROUP BY`, `HAVING` and `ORDER BY`
- join two tables and choose between an inner and a left join
- find rows with no match (anti-join)
- explain why `NULL = NULL` is not true
:::

## The idea

**SQL** (Structured Query Language) is how you ask questions of data stored in tables. It is over 50 years old and still the most used language in data work, because you describe **what** you want and the database works out **how**.

- A **table** has **columns** (each with a type) and **rows** (one record each).
- A **primary key** is the column that identifies a row (`orders.id`).
- A **foreign key** is a column that points to another table's primary key (`orders.customer_id` points to `customers.id`). That link is what a **join** follows.

We use **SQLite**, a complete SQL database inside one file, built into Python. What you learn here works, with small differences, in PostgreSQL, MySQL, Snowflake, BigQuery and Spark SQL.

## The order of a query

You **write** a query in this order:

```term
SELECT   columns or calculations
FROM     table
JOIN     other table ON the matching rule
WHERE    filter on rows
GROUP BY columns to group by
HAVING   filter on groups
ORDER BY sort
LIMIT    how many rows
```

The database **runs** it in a different order: `FROM` and `JOIN`, then `WHERE`, then `GROUP BY`, then `HAVING`, then `SELECT`, then `ORDER BY`, then `LIMIT`. That explains two rules beginners trip over: you cannot use an aggregate such as `COUNT(*)` in `WHERE` (groups do not exist yet; use `HAVING`), and you cannot use a column alias from `SELECT` inside `WHERE` (it has not been computed yet).

## Run it

Two tables: four customers and six orders. Seven queries, each printed with its result.

```run
mkdir -p ~/lab/de/sql1 && cd ~/lab/de/sql1
cat > sql1.py <<'EOF'
# SQL from zero, using SQLite (built into Python). Each query is printed with its result.
import sqlite3
db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), amount REAL NOT NULL, status TEXT NOT NULL, ordered_on TEXT NOT NULL);
INSERT INTO customers VALUES (1,'Asha','IN'),(2,'Ben','UK'),(3,'Chen','SG'),(4,'Dee','UK');
INSERT INTO orders VALUES
 (1,1,20.0,'paid','2026-03-01'),(2,1,35.5,'paid','2026-03-03'),(3,2,5.0,'refunded','2026-03-03'),
 (4,2,80.0,'paid','2026-03-04'),(5,3,12.0,'paid','2026-03-04'),(6,1,9.5,'pending','2026-03-05');
""")
def show(title, sql):
    cur = db.execute(sql); cols = [c[0] for c in cur.description]
    print(f"-- {title}\n{sql.strip()}")
    print("   " + " | ".join(cols))
    for row in cur: print("   " + " | ".join(str(v) for v in row))
    print()
show("1. choose columns and filter rows", "SELECT id, amount, status FROM orders WHERE amount > 10 AND status = 'paid' ORDER BY amount DESC;")
show("2. aggregate: one row per group", "SELECT status, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total FROM orders GROUP BY status ORDER BY total DESC;")
show("3. filter groups with HAVING (WHERE filters rows, HAVING filters groups)", "SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id HAVING COUNT(*) >= 2;")
show("4. INNER JOIN: only customers that have orders", "SELECT c.name, o.id AS order_id, o.amount FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = 'paid' ORDER BY c.name, o.id;")
show("5. LEFT JOIN: keep every customer, even with no orders (Dee)", "SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.amount), 0) AS total FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY total DESC;")
show("6. find customers with NO orders (anti-join)", "SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;")
show("7. NULL is not equal to anything, even itself", "SELECT NULL = NULL AS equals, NULL IS NULL AS is_null, COUNT(*) AS all_rows, COUNT(NULLIF(status, 'pending')) AS non_pending FROM orders;")
EOF
python3 sql1.py
```

Read each result against its query:

1. **Filter and sort.** `WHERE amount > 10 AND status = 'paid'` keeps 4 rows; `ORDER BY amount DESC` puts 80.0 first.
2. **Aggregate.** `GROUP BY status` makes one row per status: paid has 4 orders worth 147.5.
3. **HAVING** filters groups: only customers 1 and 2 have two or more orders.
4. **INNER JOIN** returns only rows with a match on both sides.
5. **LEFT JOIN** keeps every row of the left table. Dee has no orders, so her order columns are `NULL`; `COUNT(o.id)` counts 0 because `COUNT(column)` ignores NULLs, and `COALESCE(x, 0)` replaces NULL with 0.
6. **Anti-join.** A left join followed by `WHERE o.id IS NULL` finds the rows with **no** match: Dee. Use this to answer "which customers never ordered?" or "which records failed to load?".
7. **NULL** means "unknown". `NULL = NULL` gives `NULL` (shown as `None`), not true. Always test with `IS NULL` / `IS NOT NULL`.

## The four joins, in one picture

| Join | Keeps |
|---|---|
| `INNER JOIN` | only matching rows |
| `LEFT JOIN` | all rows from the left table, matches from the right, NULL where none |
| `RIGHT JOIN` | the mirror image of left (rarely needed: swap the tables) |
| `FULL OUTER JOIN` | all rows from both sides |

:::warn The join that multiplies rows
If the join key is not unique on one side, rows multiply. Joining orders to a customer table that contains the same customer twice doubles that customer's revenue. **Before joining, know which side is "one" and which is "many", and check the row count before and after.** This is the most common cause of wrong numbers in reports.
:::

## Writing data

```term
INSERT INTO customers (id, name, country) VALUES (5, 'Eli', 'IN');
UPDATE orders SET status = 'paid' WHERE id = 6;       -- without WHERE, EVERY row changes
DELETE FROM orders WHERE status = 'refunded';         -- without WHERE, EVERY row is deleted
CREATE TABLE paid_orders AS SELECT * FROM orders WHERE status = 'paid';
```

Run a `SELECT` with the same `WHERE` first to see which rows an `UPDATE` or `DELETE` will touch.

:::try
Change the script to answer: (a) total paid revenue per country, highest first; (b) the number of orders per day; (c) customers whose paid total is above 50. Expected for (a): UK 80.0, IN 55.5, SG 12.0.
:::

## What is the difference between WHERE and HAVING?

:::say
WHERE filters individual rows before grouping; HAVING filters groups after aggregation. So "orders over 10 pounds" is WHERE, and "customers with more than two orders" is HAVING with COUNT.
:::

## What is the difference between an inner join and a left join?

:::say
An inner join returns only rows that match in both tables. A left join returns every row from the left table and fills the right side with NULL when there is no match. I use a left join when I must not lose rows, for example all customers including those with no orders, and a left join with IS NULL to find the rows that have no match.
:::

:::recap
- A query is written `SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY`, but runs starting from `FROM`.
- `WHERE` filters rows; `HAVING` filters groups.
- `INNER JOIN` keeps matches; `LEFT JOIN` keeps everything on the left; left join + `IS NULL` finds the missing.
- `NULL` is unknown: use `IS NULL`, `COALESCE`, and remember `COUNT(col)` skips NULLs.
- Check row counts before and after a join.
:::

```quiz
? Which clause filters on an aggregate such as COUNT(*)?
+ HAVING
- WHERE
- ORDER BY
- FROM
! WHERE runs before grouping, so aggregates are not available there.

? How do you find customers that have no orders?
+ LEFT JOIN orders and keep rows WHERE the order id IS NULL
- INNER JOIN orders
- WHERE orders = 0
- ORDER BY orders
! The anti-join pattern.

? What does NULL = NULL return?
+ NULL (unknown), so use IS NULL
- true
- false
- an error
! Comparisons with NULL are unknown.
```
