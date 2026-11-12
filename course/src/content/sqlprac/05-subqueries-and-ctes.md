---
track: sqlprac
title: "Subqueries and CTEs: queries inside queries"
short: Subqueries and CTEs
sub: Seven problems on scalar subqueries, IN and EXISTS, correlated subqueries, common table expressions and a recursive CTE that walks an org chart.
---

@setup sqlpractice

:::goals
- use a subquery as a value, a list or a table
- choose between IN, EXISTS and a join
- structure a long query with CTEs
- walk a hierarchy with a recursive CTE
:::

## The tools for this lesson

| Form | Returns | Example use |
|---|---|---|
| scalar subquery `(SELECT AVG(price) FROM products)` | one value | compare each row with a total or average |
| `IN (SELECT ...)` | a list | "customers who did X" |
| `EXISTS (SELECT 1 ... WHERE outer.key = inner.key)` | true or false | "has at least one", safe with NULLs |
| subquery in FROM | a table | aggregate first, then join |
| `WITH name AS (...)` (a **CTE**) | a named step | readable multi-step queries |
| `WITH RECURSIVE` | rows that refer to earlier rows | trees and hierarchies |

## The problems

7 problems: 1 easy, 4 medium, 2 hard.

### 5.1 · Easy · Above average

Return the `name` and `price` of products priced above the average price, by price.

**Answer shape:** 5 rows · 2 columns · order matters

:::answer Hint
A subquery in WHERE can return one value.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_1.sql <<'EOF'
SELECT name, price
FROM products
WHERE price > (
  SELECT AVG(price)
  FROM products
)
ORDER BY price;
EOF
python3 q.py s5_1.sql
python3 check.py 5.1 s5_1.sql
```

A **scalar subquery** returns a single value and can be used anywhere a value can.
:::

### 5.2 · Medium · IN a subquery

Return the `name` of customers who placed at least one cancelled or returned order.

**Answer shape:** 3 rows · 1 column · any order

:::answer Hint
`WHERE customer_id IN (SELECT customer_id FROM orders WHERE ...)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_2.sql <<'EOF'
SELECT name
FROM customers
WHERE customer_id IN (
  SELECT customer_id
  FROM orders
  WHERE status IN ('cancelled', 'returned')
);
EOF
python3 q.py s5_2.sql
python3 check.py 5.2 s5_2.sql
```

`IN (subquery)` never creates duplicates, unlike a join to orders would for a customer with several such orders.
:::

### 5.3 · Medium · EXISTS

Return the `name` of products that have been ordered at least once in a quantity of 4.

**Answer shape:** 7 rows · 1 column · any order

:::answer Hint
`WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.product_id = p.product_id AND ...)`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_3.sql <<'EOF'
SELECT p.name
FROM products p
WHERE EXISTS (
  SELECT 1
  FROM order_items i
  WHERE i.product_id = p.product_id AND i.quantity = 4
);
EOF
python3 q.py s5_3.sql
python3 check.py 5.3 s5_3.sql
```

`EXISTS` stops at the first match and is unaffected by NULLs, which makes it the safest choice for 'has at least one'.
:::

### 5.4 · Medium · Correlated subquery

Return each product `name`, its `category`, `price`, and the average price of its own category (rounded to 2), by name.

**Answer shape:** 10 rows · 4 columns · order matters

:::answer Hint
The inner query refers to the outer row's category.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_4.sql <<'EOF'
SELECT p.name, p.category, p.price, ROUND((
  SELECT AVG(x.price)
  FROM products x
  WHERE x.category = p.category
), 2) AS category_avg
FROM products p
ORDER BY p.name;
EOF
python3 q.py s5_4.sql
python3 check.py 5.4 s5_4.sql
```

A **correlated subquery** runs once per outer row. It is easy to read; a window function ([lesson 6](#sqlprac-6)) does the same in one pass.
:::

### 5.5 · Medium · A CTE for readability

Using a CTE called `order_totals` (order_id, total), return the order_id and total of the five largest orders, largest first. Round totals to 2.

**Answer shape:** 5 rows · 2 columns · order matters

:::answer Hint
`WITH order_totals AS (SELECT ... GROUP BY order_id) SELECT ... FROM order_totals ...`.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_5.sql <<'EOF'
WITH order_totals AS (
  SELECT order_id, SUM(quantity * unit_price) AS total
  FROM order_items
  GROUP BY order_id
)
SELECT order_id, ROUND(total, 2) AS total
FROM order_totals
ORDER BY total DESC, order_id
LIMIT 5;
EOF
python3 q.py s5_5.sql
python3 check.py 5.5 s5_5.sql
```

A **CTE** names a step so a long query reads top to bottom. It is the single best habit for interview SQL.
:::

### 5.6 · Hard · Two CTEs

Find customers whose total delivered spending is above the average spending of customers who have any delivered order. Return `name` and `spent` (rounded to 2), highest first.

**Answer shape:** 3 rows · 2 columns · order matters

:::answer Hint
CTE 1: spending per customer. CTE 2 or a subquery: the average of CTE 1. Then join to customers.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_6.sql <<'EOF'
WITH spend AS (
  SELECT o.customer_id, SUM(i.quantity * i.unit_price) AS spent
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  WHERE o.status = 'delivered'
  GROUP BY o.customer_id
)
SELECT c.name, ROUND(s.spent, 2) AS spent
FROM spend s
JOIN customers c ON c.customer_id = s.customer_id
WHERE s.spent > (
  SELECT AVG(spent)
  FROM spend
)
ORDER BY spent DESC;
EOF
python3 q.py s5_6.sql
python3 check.py 5.6 s5_6.sql
```

A CTE can be used more than once in the same query: here for the rows and for their average.
:::

### 5.7 · Hard · Walk a hierarchy

List everyone who reports to Tom Hughes (emp_id 2), directly or through others, with their `name` and `level` (1 = direct report). Order by level, then name.

**Answer shape:** 4 rows · 2 columns · order matters

:::answer Hint
A recursive CTE: start with Tom's direct reports, then repeatedly join employees whose manager is already in the result.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s5_7.sql <<'EOF'
WITH RECURSIVE team(emp_id, name, level) AS (
  SELECT emp_id, name, 1
  FROM employees
  WHERE manager_id = 2
  UNION ALL
  SELECT e.emp_id, e.name, t.level + 1
  FROM employees e
  JOIN team t ON e.manager_id = t.emp_id
)
SELECT name, level
FROM team
ORDER BY level, name;
EOF
python3 q.py s5_7.sql
python3 check.py 5.7 s5_7.sql
```

A **recursive CTE** has a starting query, `UNION ALL`, and a query that refers to the CTE itself. It is how SQL walks trees: org charts, category hierarchies, bills of materials.
:::


## When do you use a CTE instead of a subquery?

:::say
When a query has several steps, I name each step with a CTE so it reads top to bottom and each step can be tested on its own. It also lets me use the same intermediate result twice, for example a per-customer total and its average. For walking hierarchies I use a recursive CTE.
:::

:::recap
- Use a subquery as a value, a list or a table.
- Choose between IN, EXISTS and a join.
- Structure a long query with CTEs.
- Walk a hierarchy with a recursive CTE.
:::

```quiz
? Why prefer NOT EXISTS over NOT IN for 'customers with no X'?
+ NOT IN returns nothing if the subquery contains a NULL
- NOT EXISTS is shorter
- NOT IN is not standard SQL
- They never differ
! x NOT IN (1, NULL) is unknown for every x.

? What does a CTE change about how a query runs?
+ Usually nothing: it names a step to make the query readable
- It always stores the result on disk
- It makes the query run twice
- It locks the table
! Most databases treat it like an inline subquery; some may materialise it.

? What are the parts of a recursive CTE?
+ A starting query, UNION ALL, and a query that refers to the CTE
- Two SELECTs joined by JOIN
- A loop statement
- A stored procedure
! It repeats until the recursive part returns no new rows.
```
