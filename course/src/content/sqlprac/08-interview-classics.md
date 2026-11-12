---
track: sqlprac
title: "Interview classics: duplicates, streaks, retention and medians"
short: Interview classics
sub: Eight of the most asked interview problems: second highest value, finding and removing duplicates, consecutive days (gaps and islands), longest streak, retention, median, year-to-date and best month.
---

@setup sqlpractice

:::goals
- return a value or NULL correctly for 'second highest'
- find and remove duplicates with ROW_NUMBER
- solve gaps-and-islands problems
- compute retention, a median and running year-to-date figures
:::

## The patterns in this lesson

| Pattern | Core trick |
|---|---|
| Nth highest | `MAX` below the maximum, or `DENSE_RANK() = n` |
| Find duplicates | `GROUP BY normalised_key HAVING COUNT(*) > 1` |
| Keep one per duplicate | `ROW_NUMBER() OVER (PARTITION BY key ORDER BY which_to_keep) = 1` |
| Gaps and islands | `date - ROW_NUMBER()` is constant within a run of consecutive dates |
| Retention | distinct users in period A, left join distinct users in period B, divide |
| Median | number the rows, average the middle one or two |

These six cover a large share of SQL interview questions for analyst and data-engineering roles. Practise them until you can write them without looking.

## The problems

8 problems: 3 medium, 5 hard.

### 8.1 · Medium · Second highest salary

Return the second highest distinct salary as `second_highest`. It must return NULL, not an empty result, if there is no second salary.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
An aggregate over a filtered set returns NULL when the set is empty: `SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) ...)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_1.sql <<'EOF'
SELECT MAX(salary) AS second_highest
FROM employees
WHERE salary < (
  SELECT MAX(salary)
  FROM employees
);
EOF
python3 q.py s8_1.sql
python3 check.py 8.1 s8_1.sql
```

The window version (`DENSE_RANK() = 2`) is also fine, but returns no row at all when there is no second salary; read the question for which is wanted.
:::

### 8.2 · Medium · Find duplicates

Return each email that belongs to more than one customer, ignoring case, with the number of customers that share it.

**Answer shape:** 1 row · 2 columns · any order

:::answer Hint
Group by `LOWER(email)` and keep groups with COUNT above 1.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_2.sql <<'EOF'
SELECT LOWER(email) AS email, COUNT(*) AS customers
FROM customers
WHERE email IS NOT NULL
GROUP BY LOWER(email)
HAVING COUNT(*) > 1;
EOF
python3 q.py s8_2.sql
python3 check.py 8.2 s8_2.sql
```

Normalise before comparing: case and spaces hide most duplicates in real data.
:::

### 8.3 · Medium · Keep one row per duplicate

Return the customers with duplicate emails removed: one row per lower-cased email, keeping the customer with the lowest customer_id. Return `customer_id` and `name` for every customer that has an email, by customer_id.

**Answer shape:** 10 rows · 2 columns · order matters

:::answer Hint
ROW_NUMBER partitioned by the lower-cased email, ordered by customer_id; keep row 1.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_3.sql <<'EOF'
SELECT customer_id, name
FROM (
  SELECT customer_id, name, ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY customer_id) AS rn
  FROM customers
  WHERE email IS NOT NULL
)
WHERE rn = 1
ORDER BY customer_id;
EOF
python3 q.py s8_3.sql
python3 check.py 8.3 s8_3.sql
```

**Deduplication** with ROW_NUMBER is the most asked data-engineering SQL question. The ORDER BY inside OVER decides which copy survives: oldest id, latest update, most complete row.
:::

### 8.4 · Hard · Three days in a row

Return the `customer_id` of customers who logged in on at least three consecutive days in March 2026. Count each day once, even if they logged in twice.

**Answer shape:** 5 rows · 1 column · any order

:::answer Hint
De-duplicate the days. Then `julianday(day) - ROW_NUMBER() OVER (PARTITION BY customer ORDER BY day)` is the same for every day in an unbroken run. Group by customer and that value.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_4.sql <<'EOF'
WITH d AS (
  SELECT DISTINCT customer_id, login_date
  FROM logins
  WHERE login_date BETWEEN '2026-03-01' AND '2026-03-31'
),
g AS (
  SELECT customer_id, login_date, julianday(login_date) - ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY login_date) AS grp
  FROM d
)
SELECT DISTINCT customer_id
FROM g
GROUP BY customer_id, grp
HAVING COUNT(*) >= 3;
EOF
python3 q.py s8_4.sql
python3 check.py 8.4 s8_4.sql
```

This is **gaps and islands**: subtracting a running number from consecutive dates gives a constant, so each streak becomes a group. The DISTINCT first matters: a repeated day would break the arithmetic.
:::

### 8.5 · Hard · Longest streak

Return each `customer_id` who logged in during March 2026 with their longest run of consecutive login days, longest first, then by customer_id.

**Answer shape:** 8 rows · 2 columns · order matters

:::answer Hint
The same islands as 8.4, then the maximum island size per customer.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_5.sql <<'EOF'
WITH d AS (
  SELECT DISTINCT customer_id, login_date
  FROM logins
  WHERE login_date BETWEEN '2026-03-01' AND '2026-03-31'
),
g AS (
  SELECT customer_id, julianday(login_date) - ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY login_date) AS grp
  FROM d
),
runs AS (
  SELECT customer_id, COUNT(*) AS len
  FROM g
  GROUP BY customer_id, grp
)
SELECT customer_id, MAX(len) AS longest_streak
FROM runs
GROUP BY customer_id
ORDER BY longest_streak DESC, customer_id;
EOF
python3 q.py s8_5.sql
python3 check.py 8.5 s8_5.sql
```

Once you can build the islands, streak length, gap length and session counts are one more GROUP BY.
:::

### 8.6 · Hard · Month-1 retention

Of the customers who logged in during March 2026, what percentage logged in again during April 2026? Return `march_users`, `returned_in_april` and `retention_pct` (1 decimal).

**Answer shape:** 1 row · 3 columns · any order

:::answer Hint
Distinct March users; LEFT JOIN distinct April users; count both sides.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_6.sql <<'EOF'
WITH mar AS (
  SELECT DISTINCT customer_id
  FROM logins
  WHERE login_date LIKE '2026-03-%'
),
apr AS (
  SELECT DISTINCT customer_id
  FROM logins
  WHERE login_date LIKE '2026-04-%'
)
SELECT COUNT(*) AS march_users, COUNT(a.customer_id) AS returned_in_april, ROUND(100.0 * COUNT(a.customer_id) / COUNT(*), 1) AS retention_pct
FROM mar m
LEFT JOIN apr a ON a.customer_id = m.customer_id;
EOF
python3 q.py s8_6.sql
python3 check.py 8.6 s8_6.sql
```

Retention is a ratio of two distinct sets. Cohort tables repeat this per signup month and per later month.
:::

### 8.7 · Hard · Median

Return the median product price.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
Number the prices in order and count them; the median is the average of the middle one or two.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_7.sql <<'EOF'
WITH r AS (
  SELECT price, ROW_NUMBER() OVER (ORDER BY price) AS rn, COUNT(*) OVER () AS n
  FROM products
)
SELECT AVG(price) AS median_price
FROM r
WHERE rn IN ((n + 1) / 2, (n + 2) / 2);
EOF
python3 q.py s8_7.sql
python3 check.py 8.7 s8_7.sql
```

With 10 prices the middle rows are 5 and 6, and `(n+1)/2` and `(n+2)/2` give exactly those in integer division; with an odd count both give the same row. PostgreSQL has `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)`.
:::

### 8.8 · Hard · Year-to-date and best month

For each month, return `month`, delivered revenue, revenue so far this year (`ytd`), and `best` = 'yes' on the month with the highest revenue, else 'no'. Round money to 2.

**Answer shape:** 5 rows · 4 columns · order matters

:::answer Hint
One CTE for monthly revenue; then a running SUM and a comparison with MAX() OVER ().
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s8_8.sql <<'EOF'
WITH m AS (
  SELECT strftime('%Y-%m', o.order_date) AS month, SUM(i.quantity * i.unit_price) AS revenue
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'delivered'
  GROUP BY month
)
SELECT month, ROUND(revenue, 2) AS revenue, ROUND(SUM(revenue) OVER (ORDER BY month), 2) AS ytd, CASE WHEN revenue = MAX(revenue) OVER () THEN 'yes' ELSE 'no' END AS best
FROM m
ORDER BY month;
EOF
python3 q.py s8_8.sql
python3 check.py 8.8 s8_8.sql
```

Two windows in one SELECT: one running (ORDER BY), one over everything (empty OVER ()).
:::


## How do you find users who logged in on three consecutive days?

:::say
I first reduce the data to one row per user per day. Then I number each user's days in date order and subtract that number from the date; consecutive days give the same value, so each streak becomes a group. Grouping by user and that value and keeping groups of three or more gives the answer. This is the gaps-and-islands pattern.
:::

## How do you remove duplicate rows but keep the latest one?

:::say
I use ROW_NUMBER partitioned by the business key and ordered by the update timestamp descending, with a tie-breaker, and keep row number one. In a pipeline I write that result to a clean table rather than deleting from the raw data.
:::

:::recap
- Return a value or NULL correctly for 'second highest'.
- Find and remove duplicates with ROW_NUMBER.
- Solve gaps-and-islands problems.
- Compute retention, a median and running year-to-date figures.
:::

```quiz
? Why does the streak solution use DISTINCT login days first?
+ A repeated day would break the date minus row-number arithmetic
- DISTINCT is faster
- To sort the dates
- It is not needed
! Two rows for one day give two different row numbers for the same date.

? Which keeps exactly one row per duplicate email, choosing the lowest id?
+ ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY id) = 1
- SELECT DISTINCT email
- GROUP BY email
- RANK() OVER (ORDER BY email) = 1
! The ORDER BY inside OVER decides which copy survives.

? 8 users were active in March and 4 of them in April. What is month-1 retention?
+ 50%
- 4
- 200%
- 12.5%
! Returning users divided by the starting cohort.
```
