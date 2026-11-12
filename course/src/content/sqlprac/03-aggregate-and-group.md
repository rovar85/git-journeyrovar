---
track: sqlprac
title: "Aggregate and group: counting, summing and HAVING"
short: Aggregate and group
sub: Eight problems on COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING, CASE and conditional aggregation.
---

@setup sqlpractice

:::goals
- summarise a table with aggregate functions
- group rows and filter groups with HAVING
- label rows with CASE
- count several things in one pass with conditional aggregation
:::

## The tools for this lesson

- **Aggregates** turn many rows into one value: `COUNT(*)`, `COUNT(column)` (skips NULLs), `SUM`, `AVG`, `MIN`, `MAX`.
- **`GROUP BY`** makes one result row per group. Every selected column must be grouped or aggregated.
- **`HAVING`** filters groups after aggregation; **`WHERE`** filters rows before it.
- **`CASE WHEN ... THEN ... ELSE ... END`** computes a value from conditions, checked in order.
- **Conditional aggregation:** `SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)` counts only some rows. It is how one query produces several counts, and how you pivot (lesson 7).

## The problems

8 problems: 3 easy, 4 medium, 1 hard.

### 3.1 · Easy · Orders by status

Return each order `status` and how many orders have it, most common first.

**Answer shape:** 4 rows · 2 columns · order matters

:::answer Hint
GROUP BY the column, COUNT(*) the rows.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_1.sql <<'EOF'
SELECT status, COUNT(*) AS orders
FROM orders
GROUP BY status
ORDER BY orders DESC;
EOF
python3 q.py s3_1.sql
python3 check.py 3.1 s3_1.sql
```

Every column in SELECT must either be in GROUP BY or inside an aggregate.
:::

### 3.2 · Easy · Price statistics

Return the lowest, highest and average product price (average rounded to 2 decimals).

**Answer shape:** 1 row · 3 columns · any order

:::answer Hint
MIN, MAX, AVG, ROUND.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_2.sql <<'EOF'
SELECT MIN(price) AS lowest, MAX(price) AS highest, ROUND(AVG(price), 2) AS average
FROM products;
EOF
python3 q.py s3_2.sql
python3 check.py 3.2 s3_2.sql
```

Aggregates ignore NULLs. `AVG` of an integer column is a decimal in SQLite and PostgreSQL but an integer in SQL Server, which is a classic surprise.
:::

### 3.3 · Easy · Customers per country

Return each `country` and its number of customers, most customers first, then by country name.

**Answer shape:** 4 rows · 2 columns · order matters

:::answer Hint
Sort by two columns: the count, then the name.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_3.sql <<'EOF'
SELECT country, COUNT(*) AS customers
FROM customers
GROUP BY country
ORDER BY customers DESC, country;
EOF
python3 q.py s3_3.sql
python3 check.py 3.3 s3_3.sql
```

The second ORDER BY column breaks ties, which makes the result deterministic.
:::

### 3.4 · Medium · Revenue per product

Return `product_id` and its `revenue` (quantity times unit price, summed over all order lines), highest revenue first.

**Answer shape:** 9 rows · 2 columns · order matters

:::answer Hint
Aggregate an expression: `SUM(quantity * unit_price)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_4.sql <<'EOF'
SELECT product_id, ROUND(SUM(quantity * unit_price), 2) AS revenue
FROM order_items
GROUP BY product_id
ORDER BY revenue DESC;
EOF
python3 q.py s3_4.sql
python3 check.py 3.4 s3_4.sql
```

You can aggregate any expression, not only a column.
:::

### 3.5 · Medium · Groups with HAVING

Return the `customer_id` and number of orders of customers who placed at least 5 orders, most orders first, then by customer_id.

**Answer shape:** 5 rows · 2 columns · order matters

:::answer Hint
WHERE filters rows before grouping; HAVING filters groups after.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_5.sql <<'EOF'
SELECT customer_id, COUNT(*) AS orders
FROM orders
GROUP BY customer_id
HAVING COUNT(*) >= 5
ORDER BY orders DESC, customer_id;
EOF
python3 q.py s3_5.sql
python3 check.py 3.5 s3_5.sql
```

`HAVING` can use aggregates because it runs after GROUP BY.
:::

### 3.6 · Medium · Count only some rows

For each `customer_id`, return the total number of orders and the number that were delivered. Order by customer_id.

**Answer shape:** 10 rows · 3 columns · order matters

:::answer Hint
Put a CASE inside SUM: 1 when delivered, else 0.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_6.sql <<'EOF'
SELECT customer_id, COUNT(*) AS orders, SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
FROM orders
GROUP BY customer_id
ORDER BY customer_id;
EOF
python3 q.py s3_6.sql
python3 check.py 3.6 s3_6.sql
```

This is **conditional aggregation**: one pass over the table produces several counts. PostgreSQL also offers `COUNT(*) FILTER (WHERE ...)`.
:::

### 3.7 · Medium · Label the rows

Return product `name`, `price` and a `band`: 'budget' under 15, 'mid' from 15 to under 30, 'premium' from 30. Cheapest first.

**Answer shape:** 10 rows · 3 columns · order matters

:::answer Hint
`CASE WHEN ... THEN ... WHEN ... ELSE ... END` checks the conditions in order.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_7.sql <<'EOF'
SELECT name, price, CASE WHEN price < 15 THEN 'budget' WHEN price < 30 THEN 'mid' ELSE 'premium' END AS band
FROM products
ORDER BY price;
EOF
python3 q.py s3_7.sql
python3 check.py 3.7 s3_7.sql
```

CASE stops at the first true condition, so each later WHEN only needs the upper bound.
:::

### 3.8 · Hard · Share of the total

Return each product `category` with the units sold and its share of all units sold as a percentage rounded to 1 decimal, largest share first.

**Answer shape:** 5 rows · 3 columns · order matters

:::answer Hint
Join order_items to products, SUM the quantity per category, and divide by a subquery that sums all quantities. Multiply by 100.0 so the division is not integer division.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s3_8.sql <<'EOF'
SELECT p.category, SUM(i.quantity) AS units, ROUND(100.0 * SUM(i.quantity) / (
  SELECT SUM(quantity)
  FROM order_items
), 1) AS pct
FROM order_items i
JOIN products p ON p.product_id = i.product_id
GROUP BY p.category
ORDER BY pct DESC;
EOF
python3 q.py s3_8.sql
python3 check.py 3.8 s3_8.sql
```

`SUM(quantity) / total` with two whole numbers is integer division in SQLite, PostgreSQL and SQL Server, and gives 0. Writing `100.0 *` first makes it decimal.
:::


## What is conditional aggregation?

:::say
It puts a CASE expression inside an aggregate, such as SUM of CASE WHEN status is delivered THEN 1 ELSE 0, so one pass over the table produces several counts or sums side by side. I use it for status breakdowns, pivots and ratios.
:::

:::recap
- Summarise a table with aggregate functions.
- Group rows and filter groups with HAVING.
- Label rows with CASE.
- Count several things in one pass with conditional aggregation.
:::

```quiz
? Which clause can filter on COUNT(*)?
+ HAVING
- WHERE
- ON
- LIMIT
! WHERE runs before the groups exist.

? COUNT(email) on a table where 2 of 12 emails are NULL returns:
+ 10
- 12
- 2
- NULL
! COUNT of a column skips NULLs; COUNT(*) counts rows.

? 100 * 3 / 4 and 100.0 * 3 / 4 in SQLite give:
+ 75 and 75.0, but 3 / 4 * 100 gives 0
- Both give 0
- Both give 75.0
- An error
! Integer division truncates; put the decimal first.
```
