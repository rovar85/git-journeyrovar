---
track: sqlprac
title: "Dates, text, NULLs and pivots"
short: Dates, text, NULLs
sub: Seven problems on string functions, COALESCE, weekdays and date differences, month arithmetic, pivoting with conditional aggregation, and NULL traps.
---

@setup sqlpractice

:::goals
- clean and split text
- replace missing values with COALESCE
- extract parts of dates and compute differences
- pivot rows into columns
- avoid the NULL comparison trap
:::

## The tools for this lesson

Dates and text are where SQL dialects differ most. Learn the idea once, then look up the spelling for your database:

| Task | SQLite (this lab) | PostgreSQL | SQL Server |
|---|---|---|---|
| year-month text | `strftime('%Y-%m', d)` | `to_char(d, 'YYYY-MM')` | `FORMAT(d, 'yyyy-MM')` |
| weekday number | `strftime('%w', d)` | `EXTRACT(DOW FROM d)` | `DATEPART(weekday, d)` |
| days between | `julianday(b) - julianday(a)` | `b - a` | `DATEDIFF(day, a, b)` |
| add days | `date(d, '+7 days')` | `d + INTERVAL '7 days'` | `DATEADD(day, 7, d)` |
| part of text | `SUBSTR(s, start, len)` | `SUBSTRING(s FROM start FOR len)` | `SUBSTRING(s, start, len)` |
| position | `INSTR(s, '@')` | `POSITION('@' IN s)` | `CHARINDEX('@', s)` |
| first non-NULL | `COALESCE(a, b)` | same | same |

## The problems

7 problems: 2 easy, 3 medium, 2 hard.

### 7.1 · Easy · Text clean-up

Return each customer's `name` in upper case and the part of their email after the `@` as `domain`, for customers with an email. By name, then domain.

**Answer shape:** 11 rows · 2 columns · order matters

:::answer Hint
`UPPER`, `SUBSTR(text, start)`, `INSTR(text, '@')` finds the position.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_1.sql <<'EOF'
SELECT UPPER(name) AS name, LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain
FROM customers
WHERE email IS NOT NULL
ORDER BY name, domain;
EOF
python3 q.py s7_1.sql
python3 check.py 7.1 s7_1.sql
```

String functions differ between databases: PostgreSQL uses `SPLIT_PART(email, '@', 2)` and `POSITION('@' IN email)`.
:::

### 7.2 · Easy · Default for missing values

Return each customer `name` and their `city`, showing 'unknown' where the city is missing. By name, then city.

**Answer shape:** 12 rows · 2 columns · order matters

:::answer Hint
`COALESCE(a, b)` returns the first value that is not NULL.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_2.sql <<'EOF'
SELECT name, COALESCE(city, 'unknown') AS city
FROM customers
ORDER BY name, city;
EOF
python3 q.py s7_2.sql
python3 check.py 7.2 s7_2.sql
```

`COALESCE` is standard SQL. `IFNULL` (SQLite, MySQL), `NVL` (Oracle) and `ISNULL` (SQL Server) do the same with two arguments.
:::

### 7.3 · Medium · Orders per weekday

Return the weekday number (0 = Sunday) and the number of orders placed on that weekday, by weekday.

**Answer shape:** 7 rows · 2 columns · order matters

:::answer Hint
`strftime('%w', order_date)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_3.sql <<'EOF'
SELECT CAST(strftime('%w', order_date) AS INTEGER) AS weekday, COUNT(*) AS orders
FROM orders
GROUP BY weekday
ORDER BY weekday;
EOF
python3 q.py s7_3.sql
python3 check.py 7.3 s7_3.sql
```

Date functions are the least portable part of SQL: PostgreSQL uses `EXTRACT(DOW FROM order_date)`, SQL Server `DATEPART(weekday, ...)`. Learn the idea, then look up the dialect.
:::

### 7.4 · Medium · Days between two dates

For each paid order, return `order_id` and the number of days from `order_date` to `paid_on`. By order_id.

**Answer shape:** 31 rows · 2 columns · order matters

:::answer Hint
Subtract `julianday` values in SQLite.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_4.sql <<'EOF'
SELECT o.order_id, CAST(julianday(p.paid_on) - julianday(o.order_date) AS INTEGER) AS days_to_pay
FROM orders o
JOIN payments p ON p.order_id = o.order_id
ORDER BY o.order_id;
EOF
python3 q.py s7_4.sql
python3 check.py 7.4 s7_4.sql
```

In PostgreSQL you subtract dates directly (`paid_on - order_date`); in SQL Server you use `DATEDIFF(day, a, b)`.
:::

### 7.5 · Medium · Customer tenure

Return each customer `name`, `signup_date` and how many whole months they had been a customer on 2026-06-30. By signup_date, then name.

**Answer shape:** 12 rows · 3 columns · order matters

:::answer Hint
Months = (year difference) times 12 plus (month difference). Use strftime to pull year and month.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_5.sql <<'EOF'
SELECT name, signup_date, (CAST(strftime('%Y', '2026-06-30') AS INTEGER) - CAST(strftime('%Y', signup_date) AS INTEGER)) * 12 + CAST(strftime('%m', '2026-06-30') AS INTEGER) - CAST(strftime('%m', signup_date) AS INTEGER) AS months
FROM customers
ORDER BY signup_date, name;
EOF
python3 q.py s7_5.sql
python3 check.py 7.5 s7_5.sql
```

Calendar-month differences count month boundaries, not 30-day periods; say which one you mean in an interview.
:::

### 7.6 · Hard · Pivot: months as columns

Return one row per product `category` with the number of units sold in January, February and March 2026 as three columns `jan`, `feb`, `mar`. Include every category that sold anything in those months. By category.

**Answer shape:** 5 rows · 4 columns · order matters

:::answer Hint
Conditional aggregation: `SUM(CASE WHEN month = '01' THEN quantity ELSE 0 END)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_6.sql <<'EOF'
SELECT p.category, SUM(CASE WHEN strftime('%m', o.order_date) = '01' THEN i.quantity ELSE 0 END) AS jan, SUM(CASE WHEN strftime('%m', o.order_date) = '02' THEN i.quantity ELSE 0 END) AS feb, SUM(CASE WHEN strftime('%m', o.order_date) = '03' THEN i.quantity ELSE 0 END) AS mar
FROM order_items i
JOIN orders o ON o.order_id = i.order_id
JOIN products p ON p.product_id = i.product_id
WHERE o.order_date < '2026-04-01'
GROUP BY p.category
ORDER BY p.category;
EOF
python3 q.py s7_6.sql
python3 check.py 7.6 s7_6.sql
```

This works in every database. Some have a `PIVOT` keyword, but conditional aggregation is what interviewers expect you to write.
:::

### 7.7 · Hard · NULL traps

Return the number of customers who were **not** referred by customer 1. Customers with no referrer count as not referred by customer 1.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
`referred_by <> 1` is unknown when referred_by is NULL, so those rows disappear. Handle NULL explicitly.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s7_7.sql <<'EOF'
SELECT COUNT(*) AS not_referred_by_1
FROM customers
WHERE referred_by IS NULL OR referred_by <> 1;
EOF
python3 q.py s7_7.sql
python3 check.py 7.7 s7_7.sql
```

Any comparison with NULL is unknown and is filtered out. The same trap makes `NOT IN (subquery)` return nothing when the subquery contains a NULL.
:::


## How do you pivot rows into columns in SQL?

:::say
I use conditional aggregation: group by the row key and, for each output column, SUM or COUNT a CASE expression that picks only the rows for that column. It works in every database; some have a PIVOT keyword, but the conditional version is portable and easy to extend.
:::

:::recap
- Clean and split text.
- Replace missing values with COALESCE.
- Extract parts of dates and compute differences.
- Pivot rows into columns.
- Avoid the NULL comparison trap.
:::

```quiz
? referred_by is NULL for 6 customers. How many rows does WHERE referred_by <> 1 return for them?
+ None: the comparison is unknown for NULL
- All 6
- 3
- An error
! Add OR referred_by IS NULL.

? What does COALESCE(city, 'unknown') return when city is 'Pune'?
+ Pune
- unknown
- NULL
- Pune, unknown
! It returns the first value that is not NULL.

? How do you turn months into columns in portable SQL?
+ SUM(CASE WHEN month = '01' THEN quantity ELSE 0 END) per month
- GROUP BY month
- A self-join per month
- ORDER BY month
! Conditional aggregation works in every database.
```
