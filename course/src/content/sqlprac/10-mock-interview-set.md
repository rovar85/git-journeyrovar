---
track: sqlprac
title: "Mock interview: six mixed problems against the clock"
short: Mock interview
sub: Six problems that combine everything, written like real interview questions. Give yourself 15 to 20 minutes each and say your approach out loud.
---

@setup sqlpractice

:::goals
- combine joins, aggregation and window functions under time pressure
- state the grain and the denominator before writing
- pre-aggregate to avoid fan-out
- build calendars and reconciliation checks
:::

## How to use this set

Treat it like the real thing. For each problem: set a timer for 15 to 20 minutes, restate the question and the grain out loud, write the query in CTE steps, and check the answer. Only then compare with the model solution. Note which pattern each one needed; most interview questions are two or three of the patterns from lessons 3 to 8 combined.

## The problems

6 problems: 2 medium, 4 hard.

### 10.1 · Medium · Best-selling product per category

Return each `category`, its best-selling product `name` by units sold, and the `units`. Ties: return both. By category.

**Answer shape:** 5 rows · 3 columns · order matters

:::answer Hint
Units per product in a CTE, then RANK partitioned by category.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s10_1.sql <<'EOF'
WITH u AS (
  SELECT p.category, p.name, SUM(i.quantity) AS units
  FROM order_items i
  JOIN products p ON p.product_id = i.product_id
  GROUP BY p.product_id
)
SELECT category, name, units
FROM (
  SELECT * , RANK() OVER (PARTITION BY category ORDER BY units DESC) AS r
  FROM u
)
WHERE r = 1
ORDER BY category, name;
EOF
python3 q.py s10_1.sql
python3 check.py 10.1 s10_1.sql
```

Aggregate, rank, filter: the three-step shape of most interview questions.
:::

### 10.2 · Medium · Repeat customers

Return the number of customers with more than one delivered order, and the share of all customers who have any delivered order (percentage, 1 decimal), as `repeat_customers` and `repeat_pct`.

**Answer shape:** 1 row · 2 columns · any order

:::answer Hint
Delivered orders per customer in a CTE; count those with more than one, and divide by the count of rows.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s10_2.sql <<'EOF'
WITH d AS (
  SELECT customer_id, COUNT(*) AS n
  FROM orders
  WHERE status = 'delivered'
  GROUP BY customer_id
)
SELECT SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) AS repeat_customers, ROUND(100.0 * SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS repeat_pct
FROM d;
EOF
python3 q.py s10_2.sql
python3 check.py 10.2 s10_2.sql
```

Say the denominator out loud in an interview: here it is customers with at least one delivered order, not all customers.
:::

### 10.3 · Hard · Referral tree

For each customer who referred someone, return the referrer's `name`, how many customers they referred directly, and the total revenue of delivered orders of the people they referred (0 if none), rounded to 2. Most referrals first, then by name.

**Answer shape:** 5 rows · 3 columns · order matters

:::answer Hint
Self-join customers for the referrals; a separate CTE for revenue per customer; LEFT JOIN it and COALESCE to 0.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s10_3.sql <<'EOF'
WITH rev AS (
  SELECT o.customer_id, SUM(i.quantity * i.unit_price) AS revenue
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'delivered'
  GROUP BY o.customer_id
)
SELECT r.name, COUNT(c.customer_id) AS referred, ROUND(COALESCE(SUM(rev.revenue), 0), 2) AS referred_revenue
FROM customers c
JOIN customers r ON r.customer_id = c.referred_by
LEFT JOIN rev ON rev.customer_id = c.customer_id
GROUP BY r.customer_id, r.name
ORDER BY referred DESC, r.name;
EOF
python3 q.py s10_3.sql
python3 check.py 10.3 s10_3.sql
```

Pre-aggregating revenue to one row per customer avoids the fan-out from problem 4.8.
:::

### 10.4 · Hard · Payment gaps

Return `order_id`, `status`, the order total and the amount paid (NULL if unpaid), both rounded to 2, for orders that are delivered but have no payment, or whose payment differs from the order total by more than 0.01. By order_id.

**Answer shape:** 2 rows · 4 columns · order matters

:::answer Hint
Totals per order in a CTE, LEFT JOIN payments, test for NULL or a difference.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s10_4.sql <<'EOF'
WITH t AS (
  SELECT order_id, SUM(quantity * unit_price) AS total
  FROM order_items
  GROUP BY order_id
)
SELECT o.order_id, o.status, ROUND(t.total, 2) AS total, ROUND(p.amount, 2) AS paid
FROM orders o
JOIN t ON t.order_id = o.order_id
LEFT JOIN payments p ON p.order_id = o.order_id
WHERE o.status = 'delivered' AND (p.payment_id IS NULL OR ABS(p.amount - t.total) > 0.01)
ORDER BY o.order_id;
EOF
python3 q.py s10_4.sql
python3 check.py 10.4 s10_4.sql
```

This is a **reconciliation** query. In data engineering it is a scheduled data-quality check: a non-empty result raises an alert.
:::

### 10.5 · Hard · Rolling 7-day active users

For each day from 2026-03-01 to 2026-03-10, return `day` and the number of distinct customers who logged in during that day or the 6 days before it. Days with no logins still appear.

**Answer shape:** 10 rows · 2 columns · order matters

:::answer Hint
Generate the 10 days with a recursive CTE, then join logins in the window `login_date BETWEEN date(day, '-6 days') AND day` and COUNT DISTINCT.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s10_5.sql <<'EOF'
WITH RECURSIVE days(day) AS (
  SELECT '2026-03-01'
  UNION ALL
  SELECT date(day, '+1 day')
  FROM days
  WHERE day < '2026-03-10'
)
SELECT d.day, COUNT(DISTINCT l.customer_id) AS active_7d
FROM days d
LEFT JOIN logins l ON l.login_date BETWEEN date(d.day, '-6 days') AND d.day
GROUP BY d.day
ORDER BY d.day;
EOF
python3 q.py s10_5.sql
python3 check.py 10.5 s10_5.sql
```

A **calendar** (here generated) guarantees one row per day even when nothing happened, and a range join counts distinct users across a moving window; a window function cannot count distinct values.
:::

### 10.6 · Hard · Salary above the department average

Return `name`, `dept`, `salary` and the department's average salary (rounded to 0) for employees paid more than their department average, by dept then salary descending.

**Answer shape:** 4 rows · 4 columns · order matters

:::answer Hint
AVG(salary) OVER (PARTITION BY dept) in a subquery, then filter.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s10_6.sql <<'EOF'
SELECT name, dept, salary, ROUND(dept_avg) AS dept_avg
FROM (
  SELECT name, dept, salary, AVG(salary) OVER (PARTITION BY dept) AS dept_avg
  FROM employees
)
WHERE salary > dept_avg
ORDER BY dept, salary DESC;
EOF
python3 q.py s10_6.sql
python3 check.py 10.6 s10_6.sql
```

Compare a row to its group without collapsing the group: the most common use of a window aggregate.
:::


## Walk me through how you would answer a SQL question you have not seen before.

:::say
I restate it, agree the grain and any denominator, and ask about ties and NULLs. I look at a few rows of each table, then write the query as CTE steps: filter and join, aggregate, rank or window, final filter. I check row counts at each step and test the edge cases before saying it is done.
:::

:::recap
- Combine joins, aggregation and window functions under time pressure.
- State the grain and the denominator before writing.
- Pre-aggregate to avoid fan-out.
- Build calendars and reconciliation checks.
:::

```quiz
? A question asks for the 'repeat customer rate'. What must you agree on first?
+ The denominator: all customers, or only customers who bought at least once
- The column names
- Whether to use a CTE
- The sort order
! The same data gives very different rates with different denominators.

? Why generate a calendar of days for a daily active-users report?
+ So days with no activity still appear with 0
- It is faster
- Dates cannot be grouped otherwise
- To remove duplicates
! Grouping existing rows can only return days that have rows.

? A reconciliation query returns two rows. What does that mean in a pipeline?
+ Two orders do not match their payments: raise an alert for someone to investigate
- The query is wrong
- Nothing: two is within tolerance
- The pipeline must delete them
! A non-empty reconciliation result is a data-quality signal.
```
