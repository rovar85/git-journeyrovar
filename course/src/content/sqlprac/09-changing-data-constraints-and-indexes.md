---
track: sqlprac
title: "Changing data: insert, update, delete, upsert and indexes"
short: Changing data
sub: Six problems on INSERT, UPDATE and DELETE done safely, an idempotent upsert, building a summary table, and reading a query plan before and after an index.
---

@setup sqlpractice

:::goals
- insert, update and delete rows safely
- delete in the right order when tables reference each other
- write an idempotent upsert
- create a summary table and read a query plan
:::

## Before you change data

Each solution in this lesson starts by running `python3 make_db.py`, so it always begins from clean data, and runs `check.py` before `q.py`: the checker works on a copy and never changes your data, while `q.py` really applies the change. Do the same while practising: a second `INSERT` of the same id fails, and an `UPDATE` run twice raises prices twice.

Two habits prevent most accidents in real databases:

- **Run the `WHERE` as a `SELECT` first** and look at what it matches.
- **Use a transaction:** `BEGIN;` ... check ... `COMMIT;` or `ROLLBACK;`. Until you commit, nobody else sees the change, and a rollback undoes it.

## The problems

6 problems: 1 easy, 4 medium, 1 hard.

### 9.1 · Easy · Insert a row

Add a product: id 11, name 'Bamboo tray', category 'Kitchen', price 14.5, launched on 2026-06-01. Then return the number of Kitchen products.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
`INSERT INTO table (columns) VALUES (...)`; then a SELECT COUNT.
:::

:::answer Solution
```run
cd ~/lab/sql
python3 make_db.py > /dev/null
cat > s9_1.sql <<'EOF'
INSERT INTO products(product_id, name, category, price, launched_on)
VALUES (11, 'Bamboo tray', 'Kitchen', 14.5, '2026-06-01');
SELECT COUNT(*) AS kitchen_products
FROM products
WHERE category = 'Kitchen';
EOF
python3 check.py 9.1 s9_1.sql
python3 q.py s9_1.sql
```

Always list the columns in an INSERT: it keeps working when someone adds a column to the table.
:::

### 9.2 · Medium · Update with a condition

Raise the price of every Fitness product by 10%, rounded to 2 decimals. Then return `name` and `price` of Fitness products by name.

**Answer shape:** 2 rows · 2 columns · order matters

:::answer Hint
`UPDATE products SET price = ROUND(price * 1.1, 2) WHERE ...`.
:::

:::answer Solution
```run
cd ~/lab/sql
python3 make_db.py > /dev/null
cat > s9_2.sql <<'EOF'
UPDATE products
SET price = ROUND(price * 1.1, 2)
WHERE category = 'Fitness';
SELECT name, price
FROM products
WHERE category = 'Fitness'
ORDER BY name;
EOF
python3 check.py 9.2 s9_2.sql
python3 q.py s9_2.sql
```

Run the WHERE as a SELECT first to see which rows will change. An UPDATE without WHERE changes every row.
:::

### 9.3 · Medium · Delete safely

Delete the cancelled orders and their order lines (lines first, so no line points to a missing order). Then return the number of orders left.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
Two DELETEs: order_items for orders that are cancelled, then the orders.
:::

:::answer Solution
```run
cd ~/lab/sql
python3 make_db.py > /dev/null
cat > s9_3.sql <<'EOF'
DELETE
FROM order_items
WHERE order_id IN (
  SELECT order_id
  FROM orders
  WHERE status = 'cancelled'
);
DELETE
FROM orders
WHERE status = 'cancelled';
SELECT COUNT(*) AS orders_left
FROM orders;
EOF
python3 check.py 9.3 s9_3.sql
python3 q.py s9_3.sql
```

Delete children before parents. With `ON DELETE CASCADE` on the foreign key, the database does it for you; with foreign keys enforced, the wrong order is refused.
:::

### 9.4 · Medium · Upsert

Load these two product rows so that an existing id is updated and a new id is inserted: (2, 'Clay mug', 'Kitchen', 7.0, '2025-06-01') and (12, 'Steel tiffin', 'Kitchen', 19.0, '2026-06-15'). Then return id, name and price of products 2 and 12.

**Answer shape:** 2 rows · 3 columns · order matters

:::answer Hint
`INSERT ... ON CONFLICT(product_id) DO UPDATE SET price = excluded.price, ...`.
:::

:::answer Solution
```run
cd ~/lab/sql
python3 make_db.py > /dev/null
cat > s9_4.sql <<'EOF'
INSERT INTO products(product_id, name, category, price, launched_on)
VALUES (2, 'Clay mug', 'Kitchen', 7.0, '2025-06-01'), (12, 'Steel tiffin', 'Kitchen', 19.0, '2026-06-15')
ON CONFLICT(product_id) DO UPDATE
SET name = excluded.name, category = excluded.category, price = excluded.price;
SELECT product_id, name, price
FROM products
WHERE product_id IN (2, 12)
ORDER BY product_id;
EOF
python3 check.py 9.4 s9_4.sql
python3 q.py s9_4.sql
```

An **upsert** makes a load idempotent: running it twice gives the same table. Warehouses write it as `MERGE`.
:::

### 9.5 · Medium · Build a summary table

Create a table `monthly_revenue` (month, revenue) holding delivered revenue per month, then return it ordered by month with revenue rounded to 2.

**Answer shape:** 5 rows · 2 columns · order matters

:::answer Hint
`CREATE TABLE ... AS SELECT ...`.
:::

:::answer Solution
```run
cd ~/lab/sql
python3 make_db.py > /dev/null
cat > s9_5.sql <<'EOF'
CREATE TABLE monthly_revenue AS
SELECT strftime('%Y-%m', o.order_date) AS month, SUM(i.quantity * i.unit_price) AS revenue
FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'delivered'
GROUP BY month;
SELECT month, ROUND(revenue, 2) AS revenue
FROM monthly_revenue
ORDER BY month;
EOF
python3 check.py 9.5 s9_5.sql
python3 q.py s9_5.sql
```

`CREATE TABLE AS` (CTAS) is how a lot of warehouse transformation is done; a **view** (`CREATE VIEW`) stores the query instead of the result.
:::

### 9.6 · Hard · Does the index get used?

Ask SQLite how it would run `SELECT * FROM orders WHERE customer_id = 3`, create an index on `orders(customer_id)`, and ask again. Compare the two plans. (This one has no checker: read the plans.)

**Answer shape:** no checker for this one: read the plan it prints.

:::answer Hint
`EXPLAIN QUERY PLAN` in front of a query shows the plan instead of running it.
:::

:::answer Solution
```run
cd ~/lab/sql
python3 make_db.py > /dev/null
python3 q.py "EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 3"
cat > s9_6.sql <<'EOF'
CREATE INDEX idx_orders_customer ON orders(customer_id);
EXPLAIN QUERY PLAN
SELECT * FROM orders
WHERE customer_id = 3;
EOF
python3 q.py s9_6.sql
```

Before the index the plan says `SCAN orders`: read every row. After it, `SEARCH orders USING INDEX`: jump straight to the matching rows. On 42 rows the difference is invisible; on 40 million it is seconds against milliseconds. PostgreSQL's `EXPLAIN ANALYZE` also runs the query and shows real times. How indexes work inside is in [Systems 3](#systems-3).
:::


## What does an index do, and what does it cost?

:::say
An index is a sorted structure on one or more columns that lets the database find matching rows without scanning the whole table, which I confirm by reading the query plan. It costs disk space and makes every insert and update a little slower, so I index the columns used in frequent filters and joins, not everything.
:::

:::recap
- Insert, update and delete rows safely.
- Delete in the right order when tables reference each other.
- Write an idempotent upsert.
- Create a summary table and read a query plan.
:::

```quiz
? What happens if you run UPDATE products SET price = price * 1.1 without WHERE?
+ Every product's price rises by 10%
- Nothing
- Only the first row changes
- An error
! Always check the WHERE with a SELECT first.

? Why delete order_items before orders?
+ So no order line points to an order that no longer exists
- It is faster
- The orders table is locked
- SQL requires alphabetical order
! With foreign keys enforced, the other order is refused.

? What makes an upsert idempotent?
+ Running it twice gives the same table, because existing keys are updated not duplicated
- It runs in parallel
- It deletes the table first
- It uses an index
! That is what makes a pipeline safe to re-run.
```
