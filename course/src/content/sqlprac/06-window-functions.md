---
track: sqlprac
title: "Window functions: ranking, running totals and comparing rows"
short: Window functions
sub: Eight problems on ROW_NUMBER, RANK, DENSE_RANK, top N per group, running totals, LAG, shares of a group and moving averages.
---

@setup sqlpractice

:::goals
- number and rank rows, with and without ties
- find the top N per group
- compute running totals and moving averages
- compare a row with the previous one or with its group
:::

## The tools for this lesson

`function() OVER (PARTITION BY group ORDER BY sort ROWS BETWEEN ...)` computes a value from other rows **without removing any rows**.

| Function | Gives |
|---|---|
| `ROW_NUMBER()` | 1, 2, 3, 4 (ties broken arbitrarily unless the ORDER BY is unique) |
| `RANK()` | 1, 2, 2, 4 |
| `DENSE_RANK()` | 1, 2, 2, 3 |
| `SUM(x) OVER (ORDER BY d)` | running total |
| `SUM(x) OVER (PARTITION BY g)` | the group's total on every row |
| `LAG(x)`, `LEAD(x)` | the previous or next row's value |
| `AVG(x) OVER (... ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)` | moving average |

A window function cannot be used in `WHERE` of the same query: compute it in a subquery or CTE, then filter. Window functions are the most tested advanced SQL topic in interviews.

## The problems

8 problems: 1 easy, 5 medium, 2 hard.

### 6.1 · Easy · Number the rows

Return product `name`, `price`, and a `row_num` that numbers products from the most expensive (1) down.

**Answer shape:** 10 rows · 3 columns · order matters

:::answer Hint
`ROW_NUMBER() OVER (ORDER BY price DESC)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_1.sql <<'EOF'
SELECT name, price, ROW_NUMBER() OVER (ORDER BY price DESC) AS row_num
FROM products
ORDER BY row_num;
EOF
python3 q.py s6_1.sql
python3 check.py 6.1 s6_1.sql
```

A window function adds a column computed over other rows, without collapsing them like GROUP BY does.
:::

### 6.2 · Medium · Rank with ties

Rank employees by salary, highest first, so that equal salaries get the same rank and no rank numbers are skipped. Return `name`, `salary`, `rnk`, ordered by rnk then name.

**Answer shape:** 12 rows · 3 columns · order matters

:::answer Hint
RANK leaves gaps after ties; DENSE_RANK does not.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_2.sql <<'EOF'
SELECT name, salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
FROM employees
ORDER BY rnk, name;
EOF
python3 q.py s6_2.sql
python3 check.py 6.2 s6_2.sql
```

For 90, 80, 80, 70: ROW_NUMBER gives 1,2,3,4; RANK 1,2,2,4; DENSE_RANK 1,2,2,3.
:::

### 6.3 · Medium · Top earner per department

Return each `dept` with the `name` and `salary` of its highest-paid employee. If two people tie, return both. By dept.

**Answer shape:** 4 rows · 3 columns · order matters

:::answer Hint
Rank inside each department with PARTITION BY, then keep rank 1 in an outer query.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_3.sql <<'EOF'
SELECT dept, name, salary
FROM (
  SELECT dept, name, salary, RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS r
  FROM employees
)
WHERE r = 1
ORDER BY dept, name;
EOF
python3 q.py s6_3.sql
python3 check.py 6.3 s6_3.sql
```

**Top N per group**: rank within a partition, then filter. You cannot filter on a window function in the same query's WHERE, so it needs a subquery or CTE.
:::

### 6.4 · Medium · Running total

For customer 3, return each `order_id`, `order_date`, the order total, and a running total of their spending in date order. Round both to 2.

**Answer shape:** 8 rows · 4 columns · order matters

:::answer Hint
Total per order in a CTE, then `SUM(total) OVER (ORDER BY order_date, order_id)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_4.sql <<'EOF'
WITH t AS (
  SELECT o.order_id, o.order_date, SUM(i.quantity * i.unit_price) AS total
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  WHERE o.customer_id = 3
  GROUP BY o.order_id, o.order_date
)
SELECT order_id, order_date, ROUND(total, 2) AS total, ROUND(SUM(total) OVER (ORDER BY order_date, order_id), 2) AS running
FROM t
ORDER BY order_date, order_id;
EOF
python3 q.py s6_4.sql
python3 check.py 6.4 s6_4.sql
```

Adding ORDER BY inside OVER turns SUM into a running sum. The second sort column makes ties deterministic.
:::

### 6.5 · Medium · Compare with the previous month

Return each month (`YYYY-MM`) with its units sold and the change from the previous month. The first month's change is NULL.

**Answer shape:** 6 rows · 3 columns · order matters

:::answer Hint
Units per month in a CTE, then `units - LAG(units) OVER (ORDER BY month)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_5.sql <<'EOF'
WITH m AS (
  SELECT strftime('%Y-%m', o.order_date) AS month, SUM(i.quantity) AS units
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  GROUP BY month
)
SELECT month, units, units - LAG(units) OVER (ORDER BY month) AS change
FROM m
ORDER BY month;
EOF
python3 q.py s6_5.sql
python3 check.py 6.5 s6_5.sql
```

`LAG` reads the previous row, `LEAD` the next one. They are the basis of every period-over-period report.
:::

### 6.6 · Medium · Share within a group

Return each product `name`, `category`, `price`, and its price as a percentage of its category's total price, rounded to 1. By category, then name.

**Answer shape:** 10 rows · 4 columns · order matters

:::answer Hint
`SUM(price) OVER (PARTITION BY category)` gives each row its group total.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_6.sql <<'EOF'
SELECT name, category, price, ROUND(100.0 * price / SUM(price) OVER (PARTITION BY category), 1) AS pct_of_category
FROM products
ORDER BY category, name;
EOF
python3 q.py s6_6.sql
python3 check.py 6.6 s6_6.sql
```

A window aggregate without ORDER BY covers the whole partition, so every row sees its group's total.
:::

### 6.7 · Hard · Moving average

Return each month with its revenue from delivered orders and the average revenue of that month and the two before it (a 3-month moving average). Round both to 2.

**Answer shape:** 5 rows · 3 columns · order matters

:::answer Hint
Revenue per month in a CTE, then `AVG(revenue) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_7.sql <<'EOF'
WITH m AS (
  SELECT strftime('%Y-%m', o.order_date) AS month, SUM(i.quantity * i.unit_price) AS revenue
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'delivered'
  GROUP BY month
)
SELECT month, ROUND(revenue, 2) AS revenue, ROUND(AVG(revenue) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg_3m
FROM m
ORDER BY month;
EOF
python3 q.py s6_7.sql
python3 check.py 6.7 s6_7.sql
```

The frame clause decides which rows the window covers. `ROWS` counts rows, so a missing month would make it cover the wrong period. June is missing here because none of its orders is delivered yet: join to a calendar of months first when gaps are possible.
:::

### 6.8 · Hard · First and latest order

For each customer who has ordered, return `customer_id`, the date of their first order, the date of their latest order, and their number of orders, using window functions only (no GROUP BY). One row per customer, by customer_id.

**Answer shape:** 10 rows · 4 columns · order matters

:::answer Hint
FIRST_VALUE / MAX OVER a partition, COUNT OVER, then DISTINCT.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s6_8.sql <<'EOF'
SELECT DISTINCT customer_id, MIN(order_date) OVER w AS first_order, MAX(order_date) OVER w AS latest_order, COUNT(*) OVER w AS orders
FROM orders
WINDOW w AS (PARTITION BY customer_id)
ORDER BY customer_id;
EOF
python3 q.py s6_8.sql
python3 check.py 6.8 s6_8.sql
```

`WINDOW w AS (...)` names a window once for several functions. GROUP BY would be simpler here; the point is to see that windows keep every row until you remove duplicates.
:::


## How do you get the top three products per category?

:::say
I rank products within each category with ROW_NUMBER, RANK or DENSE_RANK, partitioned by category and ordered by the measure descending, in a CTE, and then keep rank three or less. Which ranking function depends on how ties should be treated, so I ask.
:::

:::recap
- Number and rank rows, with and without ties.
- Find the top N per group.
- Compute running totals and moving averages.
- Compare a row with the previous one or with its group.
:::

```quiz
? For salaries 90, 80, 80, 70, what does RANK() give?
+ 1, 2, 2, 4
- 1, 2, 3, 4
- 1, 2, 2, 3
- 1, 1, 2, 3
! RANK leaves a gap after a tie; DENSE_RANK does not.

? How do you keep only the top earner per department?
+ Rank inside PARTITION BY dept in a subquery, then keep rank 1
- WHERE RANK() = 1
- GROUP BY dept with MAX(name)
- ORDER BY salary LIMIT 1
! Window results can only be filtered one level up.

? What does SUM(x) OVER (PARTITION BY g) put on each row?
+ The total of x for that row's group
- A running total
- The grand total
- Only the first row's value
! Without ORDER BY the window is the whole partition.
```
