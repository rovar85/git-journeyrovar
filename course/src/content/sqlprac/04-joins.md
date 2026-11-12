---
track: sqlprac
title: "Joins: combining tables without losing or doubling rows"
short: Joins
sub: Eight problems on inner, left, anti and self joins, joins across three tables, and the fan-out bug that doubles totals.
---

@setup sqlpractice

:::goals
- join tables on their keys
- keep unmatched rows with LEFT JOIN and find them with the anti-join
- join a table to itself
- spot and fix fan-out
:::

## The tools for this lesson

| Join | Keeps |
|---|---|
| `JOIN` (inner) | rows with a match on both sides |
| `LEFT JOIN` | every row of the left table; NULLs where the right has no match |
| left join + `WHERE right.key IS NULL` | rows with **no** match (the anti-join) |
| self-join | the same table twice, under two aliases |

Before any join, say which side is "one" and which is "many". Joining one parent to **two** different child tables at once multiplies rows: problem 4.8 is that bug, and it is behind many wrong dashboards.

## The problems

8 problems: 2 easy, 4 medium, 2 hard.

### 4.1 · Easy · Orders with names

Return `order_id`, the customer's `name` and `order_date` for every order, by order_id.

**Answer shape:** 42 rows · 3 columns · order matters

:::answer Hint
JOIN orders to customers ON the customer_id they share.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_1.sql <<'EOF'
SELECT o.order_id, c.name, o.order_date
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
ORDER BY o.order_id;
EOF
python3 q.py s4_1.sql
python3 check.py 4.1 s4_1.sql
```

Short table aliases (`o`, `c`) keep joins readable. Qualify every column with its alias once there is more than one table.
:::

### 4.2 · Easy · Order lines with product names

Return `order_id`, product `name`, `quantity` and the line total (`quantity * unit_price`) for order 1.

**Answer shape:** 1 row · 4 columns · any order

:::answer Hint
Join order_items to products.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_2.sql <<'EOF'
SELECT i.order_id, p.name, i.quantity, i.quantity * i.unit_price AS line_total
FROM order_items i
JOIN products p ON p.product_id = i.product_id
WHERE i.order_id = 1;
EOF
python3 q.py s4_2.sql
python3 check.py 4.2 s4_2.sql
```

Use the price stored on the order line, not the product's current price: prices change, and the order must keep what was charged.
:::

### 4.3 · Medium · Customers with no orders

Return the `name` of customers who have never placed an order.

**Answer shape:** 2 rows · 1 column · any order

:::answer Hint
LEFT JOIN, then keep the rows where the order side is NULL.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_3.sql <<'EOF'
SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;
EOF
python3 q.py s4_3.sql
python3 check.py 4.3 s4_3.sql
```

This **anti-join** pattern answers every 'which X has no Y' question. `WHERE NOT EXISTS (...)` gives the same result.
:::

### 4.4 · Medium · Products never sold

Return the `name` of products that appear in no order.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
Same pattern, with products and order_items.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_4.sql <<'EOF'
SELECT p.name
FROM products p
LEFT JOIN order_items i ON i.product_id = p.product_id
WHERE i.product_id IS NULL;
EOF
python3 q.py s4_4.sql
python3 check.py 4.4 s4_4.sql
```

Checking the right-hand key for NULL is the reliable test: it is never NULL in a real match.
:::

### 4.5 · Medium · Orders per customer, including zero

Return every customer `name` and their number of orders, including customers with none. Most orders first, then by name.

**Answer shape:** 12 rows · 2 columns · order matters

:::answer Hint
LEFT JOIN and COUNT a column from the right-hand table, not `*`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_5.sql <<'EOF'
SELECT c.name, COUNT(o.order_id) AS orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY orders DESC, c.name;
EOF
python3 q.py s4_5.sql
python3 check.py 4.5 s4_5.sql
```

`COUNT(*)` would count the NULL row and report 1 for a customer with no orders. `COUNT(o.order_id)` skips NULLs.
:::

### 4.6 · Medium · Employees and their managers

Return each employee's `name` and their manager's name as `manager`. Include the employee with no manager. By employee name.

**Answer shape:** 12 rows · 2 columns · order matters

:::answer Hint
Join employees to itself: one copy as the employee, one as the manager.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_6.sql <<'EOF'
SELECT e.name, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.emp_id = e.manager_id
ORDER BY e.name;
EOF
python3 q.py s4_6.sql
python3 check.py 4.6 s4_6.sql
```

A **self-join** uses the same table twice under two aliases. LEFT keeps the person at the top, whose manager_id is NULL.
:::

### 4.7 · Hard · Revenue per country

Return each customer `country` and its revenue from delivered orders, highest first. Round to 2 decimals.

**Answer shape:** 4 rows · 2 columns · order matters

:::answer Hint
Three tables: customers, orders, order_items. Filter on status.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_7.sql <<'EOF'
SELECT c.country, ROUND(SUM(i.quantity * i.unit_price), 2) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
JOIN order_items i ON i.order_id = o.order_id
WHERE o.status = 'delivered'
GROUP BY c.country
ORDER BY revenue DESC;
EOF
python3 q.py s4_7.sql
python3 check.py 4.7 s4_7.sql
```

Join first, filter, then group. Each extra join must follow a key, or rows multiply.
:::

### 4.8 · Hard · The join that doubles the money

This query is meant to return each order's total and its payment amount side by side, but some totals look wrong: `SELECT o.order_id, SUM(i.quantity*i.unit_price) AS items_total, SUM(p.amount) AS paid FROM orders o JOIN order_items i ON i.order_id=o.order_id JOIN payments p ON p.order_id=o.order_id GROUP BY o.order_id`. Write a correct version that returns `order_id`, `items_total` and `paid` (both rounded to 2) for paid orders, by order_id.

**Answer shape:** 31 rows · 3 columns · order matters

:::answer Hint
Each payment row is repeated once per order line. Aggregate the order lines in a subquery first, then join one row per order to the payments.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s4_8.sql <<'EOF'
SELECT t.order_id, ROUND(t.items_total, 2) AS items_total, ROUND(p.amount, 2) AS paid
FROM (
  SELECT order_id, SUM(quantity * unit_price) AS items_total
  FROM order_items
  GROUP BY order_id
) t
JOIN payments p ON p.order_id = t.order_id
ORDER BY t.order_id;
EOF
python3 q.py s4_8.sql
python3 check.py 4.8 s4_8.sql
```

This is **fan-out**: joining two 'many' tables to one parent multiplies rows. Aggregate each child to one row per key before joining. Look down the result: one order's payment is 5.00 short of its total. Comparing the two is a real reconciliation test, which problem 10.4 builds properly.
:::


## What is fan-out in a join, and how do you avoid it?

:::say
Fan-out is when a join multiplies rows because the key is not unique on one side, for example joining an order to both its lines and its payments, so each payment repeats per line and sums double. I avoid it by knowing which side is one and which is many, aggregating each child to one row per key before joining, and comparing row counts before and after the join.
:::

:::recap
- Join tables on their keys.
- Keep unmatched rows with LEFT JOIN and find them with the anti-join.
- Join a table to itself.
- Spot and fix fan-out.
:::

```quiz
? You need every customer, including those with no orders. Which join?
+ customers LEFT JOIN orders
- customers JOIN orders
- orders LEFT JOIN customers
- A cross join
! The table you must keep in full goes on the left.

? In a LEFT JOIN, why COUNT(o.order_id) and not COUNT(*)?
+ COUNT(*) counts the NULL row, giving 1 for customers with no orders
- COUNT(*) is slower
- COUNT(*) is not allowed after a join
- They always give the same result
! COUNT of a column skips NULLs.

? A total doubles after joining orders to both order_items and payments. What fixes it?
+ Aggregate one child table per order first, then join
- Add DISTINCT to SUM
- Use a RIGHT JOIN
- Remove GROUP BY
! Each payment row was repeated once per order line.
```
