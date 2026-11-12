---
track: sqlprac
title: "Select and filter: choosing rows and columns"
short: Select and filter
sub: Nine problems on SELECT, WHERE, ORDER BY, LIMIT, BETWEEN, IN, LIKE, IS NULL and DISTINCT.
---

@setup sqlpractice

:::goals
- choose columns and rows
- sort and limit a result
- filter with BETWEEN, IN, LIKE and IS NULL
- filter dates with a half-open range
:::

## The tools for this lesson

| Clause | Does |
|---|---|
| `SELECT a, b` | chooses the columns |
| `WHERE condition` | keeps the rows where the condition is true |
| `ORDER BY a DESC, b` | sorts; ascending unless `DESC` |
| `LIMIT n` | keeps the first n rows after sorting |
| `BETWEEN x AND y` | a range including both ends |
| `IN ('a', 'b')` | matches any value in a list |
| `LIKE '%te%'` | pattern: `%` any characters, `_` one character |
| `IS NULL` | tests for a missing value (never `= NULL`) |
| `DISTINCT` | removes repeated result rows |

## The problems

9 problems: 6 easy, 3 medium.

### 2.1 · Easy · Indian customers

Return the `name` and `city` of customers whose `country` is India.

**Answer shape:** 7 rows · 2 columns · any order

:::answer Hint
Text values go in single quotes.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_1.sql <<'EOF'
SELECT name, city
FROM customers
WHERE country = 'India';
EOF
python3 q.py s2_1.sql
python3 check.py 2.1 s2_1.sql
```

`WHERE` keeps only the rows for which the condition is true. Text comparisons are case-sensitive in most databases.
:::

### 2.2 · Easy · Cheapest first

Return product `name` and `price`, cheapest first.

**Answer shape:** 10 rows · 2 columns · order matters

:::answer Hint
`ORDER BY price` sorts ascending by default.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_2.sql <<'EOF'
SELECT name, price
FROM products
ORDER BY price;
EOF
python3 q.py s2_2.sql
python3 check.py 2.2 s2_2.sql
```

Without ORDER BY the database may return rows in any order, so an ordered answer always needs one.
:::

### 2.3 · Easy · Top three by price

Return the `name` and `price` of the three most expensive products, most expensive first.

**Answer shape:** 3 rows · 2 columns · order matters

:::answer Hint
Sort descending, then limit.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_3.sql <<'EOF'
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 3;
EOF
python3 q.py s2_3.sql
python3 check.py 2.3 s2_3.sql
```

`LIMIT` keeps the first rows after sorting. SQL Server writes `TOP 3`; standard SQL writes `FETCH FIRST 3 ROWS ONLY`.
:::

### 2.4 · Easy · Price range

Return the `name` and `price` of products priced from 10 to 30 inclusive, cheapest first.

**Answer shape:** 7 rows · 2 columns · order matters

:::answer Hint
`BETWEEN a AND b` includes both ends.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_4.sql <<'EOF'
SELECT name, price
FROM products
WHERE price BETWEEN 10 AND 30
ORDER BY price;
EOF
python3 q.py s2_4.sql
python3 check.py 2.4 s2_4.sql
```

`BETWEEN 10 AND 30` is the same as `price >= 10 AND price <= 30`.
:::

### 2.5 · Easy · One of a list

Return the `name` and `country` of customers from the UK or Germany.

**Answer shape:** 3 rows · 2 columns · any order

:::answer Hint
`IN (...)` is shorter than several ORs.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_5.sql <<'EOF'
SELECT name, country
FROM customers
WHERE country IN ('UK', 'Germany');
EOF
python3 q.py s2_5.sql
python3 check.py 2.5 s2_5.sql
```

`IN` matches any value in the list; `NOT IN` excludes them (careful when the list can contain NULL).
:::

### 2.6 · Easy · Missing city

Return the `name` of customers with no city recorded.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
`= NULL` never matches anything.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_6.sql <<'EOF'
SELECT name
FROM customers
WHERE city IS NULL;
EOF
python3 q.py s2_6.sql
python3 check.py 2.6 s2_6.sql
```

NULL means unknown, so `city = NULL` is unknown, not true. Always test with `IS NULL` or `IS NOT NULL`.
:::

### 2.7 · Medium · Names that match a pattern

Return the `name` of products whose name contains the letter combination `te` anywhere, in any case.

**Answer shape:** 4 rows · 1 column · any order

:::answer Hint
`LIKE` with `%` matches any characters. Lower-case the name first to ignore case.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_7.sql <<'EOF'
SELECT name
FROM products
WHERE LOWER(name) LIKE '%te%';
EOF
python3 q.py s2_7.sql
python3 check.py 2.7 s2_7.sql
```

`%` matches any run of characters, `_` exactly one. SQLite's LIKE ignores case for ASCII letters already, but PostgreSQL's does not (it has `ILIKE`), so `LOWER` keeps the query portable.
:::

### 2.8 · Medium · Distinct values

Return each country that has customers, once, in alphabetical order.

**Answer shape:** 4 rows · 1 column · order matters

:::answer Hint
`DISTINCT` removes repeated rows.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_8.sql <<'EOF'
SELECT DISTINCT country
FROM customers
ORDER BY country;
EOF
python3 q.py s2_8.sql
python3 check.py 2.8 s2_8.sql
```

`DISTINCT` applies to the whole row of selected columns, not to one column.
:::

### 2.9 · Medium · Combined conditions

Return `order_id`, `order_date` and `status` of orders that are not delivered and were placed in the first quarter (January to March 2026), oldest first.

**Answer shape:** 3 rows · 3 columns · order matters

:::answer Hint
Dates stored as YYYY-MM-DD text sort and compare correctly. Combine with AND; use brackets when mixing AND and OR.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s2_9.sql <<'EOF'
SELECT order_id, order_date, status
FROM orders
WHERE status <> 'delivered' AND order_date >= '2026-01-01' AND order_date < '2026-04-01'
ORDER BY order_date;
EOF
python3 q.py s2_9.sql
python3 check.py 2.9 s2_9.sql
```

A half-open range (`>=` start, `<` next start) is the safest way to filter dates: it works for timestamps too, where `<= '2026-03-31'` would miss the last day's times.
:::


## Why should every query that needs an order have an ORDER BY?

:::say
A table has no guaranteed order. Without ORDER BY the database returns rows in whatever order is cheapest, which can change between runs, versions or after an index is added. So any answer where order matters, including every LIMIT, needs an explicit ORDER BY with a tie-breaker.
:::

:::recap
- Choose columns and rows.
- Sort and limit a result.
- Filter with BETWEEN, IN, LIKE and IS NULL.
- Filter dates with a half-open range.
:::

```quiz
? Which condition finds customers with no city?
+ city IS NULL
- city = NULL
- city = ''
- city == NULL
! Nothing equals NULL, not even NULL.

? Which date filter is safest for 'all of March 2026' when the column might hold times?
+ order_date >= '2026-03-01' AND order_date < '2026-04-01'
- order_date BETWEEN '2026-03-01' AND '2026-03-31'
- order_date LIKE '2026-03'
- MONTH(order_date) = 3
! A half-open range never misses the times on the last day.

? What does LIMIT 3 return without an ORDER BY?
+ Any three rows: the order is not guaranteed
- The first three rows inserted
- The three smallest ids
- An error
! Always sort before limiting.
```
