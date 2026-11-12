---
track: sqlprac
title: "Start here: the practice database and how your answers are checked"
short: Start here
sub: How this practice track works, the seven tables of the shop database, how to run a query and check your answer in the lab, and a method for any SQL problem.
---

@setup sqlpractice

:::goals
- open the practice database in the lab and look at its tables
- run a query from a file or from the command line
- check an answer and read the checker's feedback
- use a five-step method on any SQL problem
:::

:::note Who this is for
You have done the SQL lessons of the data engineering track ([lesson 5](#dataeng-5) and [lesson 6](#dataeng-6)), or know `SELECT`, `WHERE`, `GROUP BY` and `JOIN` from somewhere else. This track is the practice: about 70 problems, from easy to interview-hard, each with a hint, a model solution and an automatic checker.
:::

## How the practice works

Every lesson has the same practice folder ready: `~/lab/sql`. Open the **Lab** (button in the top bar), then:

| File | What it is |
|---|---|
| `shop.db` | the practice database: an online shop with customers, products, orders, payments, staff and logins |
| `q.py` | runs your SQL and prints the result as a table |
| `check.py` | checks your answer to a numbered problem |
| `make_db.py` | rebuilds `shop.db` from scratch: run it whenever you want clean data |

Each problem says what to return and the **answer shape**: how many rows and columns, and whether the order matters. Try it yourself first. Open **Hint** if you are stuck for more than ten minutes, and **Solution** only after you have an answer or have truly given up. Reading solutions without trying teaches very little.

The checker compares your rows with the expected rows. Column names do not matter, so name them as you like; numbers are compared to two decimal places. When the problem says order matters, your `ORDER BY` must produce the same order.

## Look around the database

Run these to see the tables and a few rows of each. `q.py` takes either a file or SQL typed in quotes.

```run
cd ~/lab/sql
ls
python3 q.py "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
python3 q.py "SELECT * FROM customers LIMIT 4"
python3 q.py "SELECT * FROM orders LIMIT 4"
python3 q.py "SELECT * FROM order_items LIMIT 4"
```

| Table | One row is | Key columns |
|---|---|---|
| `customers` | a customer | `customer_id`; `referred_by` points to another customer |
| `products` | a product with its current price | `product_id`, `category` |
| `orders` | an order, with a `status`: delivered, pending, cancelled or returned | `order_id`, `customer_id` |
| `order_items` | one product line of an order, with the price charged | `order_id` + `product_id` |
| `payments` | a payment for an order | `payment_id`, `order_id` |
| `employees` | a member of staff | `emp_id`; `manager_id` points to another employee |
| `logins` | a day a customer logged in | `customer_id`, `login_date` |

The data has the problems real data has, on purpose: a customer with no city, a customer with no email, the same person registered twice with different capitals in the email, a customer who never ordered, a product that never sold, a login recorded twice on the same day, an order that was never paid, and a payment that is short. Several problems ask you to find them. Dates are stored as `YYYY-MM-DD` text, which sorts and compares correctly.

## Write and check an answer

Write your SQL into a file, run it, then check it. Here is a deliberately wrong first try at problem 1.3, then the right one:

```run
cd ~/lab/sql
cat > my.sql <<'EOF'
SELECT COUNT(*) FROM orders;
EOF
python3 q.py my.sql
python3 check.py 1.3 my.sql
python3 check.py 1.3 "SELECT COUNT(*) FROM customers"
```

The first check says what is wrong: it counted the wrong table, so the value differs. The second passes. Short queries can be checked straight from the command line in quotes; longer ones are easier to write in a file.


## The problems

3 problems: 3 easy.

### 1.1 · Easy · See every product

Return every column of every row in `products`.

**Answer shape:** 10 rows · 5 columns · any order

:::answer Hint
`SELECT *` means all columns.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s1_1.sql <<'EOF'
SELECT * FROM products;
EOF
python3 q.py s1_1.sql
python3 check.py 1.1 s1_1.sql
```

`*` is handy for a first look. In real queries name the columns you need: it is clearer and, in a warehouse, cheaper.
:::

### 1.2 · Easy · Three columns

Return the `name`, `category` and `price` of every product.

**Answer shape:** 10 rows · 3 columns · any order

:::answer Hint
List the columns after SELECT, separated by commas.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s1_2.sql <<'EOF'
SELECT name, category, price
FROM products;
EOF
python3 q.py s1_2.sql
python3 check.py 1.2 s1_2.sql
```

The order of the columns in the result is the order you write them.
:::

### 1.3 · Easy · Count the customers

How many customers are there? Return one number.

**Answer shape:** 1 row · 1 column · any order

:::answer Hint
`COUNT(*)` counts rows.
:::

:::answer Solution
```run
cd ~/lab/sql
cat > s1_3.sql <<'EOF'
SELECT COUNT(*) AS customers
FROM customers;
EOF
python3 q.py s1_3.sql
python3 check.py 1.3 s1_3.sql
```

An aggregate with no GROUP BY turns the whole table into one row.
:::


## A method for any SQL problem

1. **Restate the question** in one sentence, and name the **grain** of the answer: one row per what?
2. **Look at the data** first: `SELECT * FROM table LIMIT 5`. Check for NULLs, duplicates and odd values.
3. **Build it in steps.** Start with the join or the filter, check the row count, then add the grouping. Name each step with a CTE ([lesson 5](#sqlprac-5)).
4. **Check the edges:** ties, NULLs, rows that should appear with zero, duplicates.
5. **Check the result** against something you can count by hand.

In an interview, say these steps out loud. Interviewers grade the method as much as the final query.

## About this database's dialect

The practice database is **SQLite**. Almost everything here is standard SQL and runs unchanged in PostgreSQL, MySQL, SQL Server, Snowflake and BigQuery. Where SQLite differs (mostly dates and some text functions), the solution says what the others write instead.

## How do you approach a SQL problem in an interview?

:::say
I restate the question and say what one row of the result represents. Then I look at the data for NULLs and duplicates, build the query in steps with CTEs, checking row counts as I go, and finally test the edge cases: ties, NULLs, and groups that should appear with zero.
:::

:::recap
- Open the practice database in the lab and look at its tables.
- Run a query from a file or from the command line.
- Check an answer and read the checker's feedback.
- Use a five-step method on any SQL problem.
:::

```quiz
? A problem's answer shape says '7 rows · 2 columns · any order'. Your query returns the right 7 rows in a different order. What does the checker say?
+ PASS, because the order does not matter for this problem
- NOT YET, because the order differs
- An error
- It cannot check unordered answers
! Only problems marked 'order matters' compare the order.

? You changed the data while practising and want it back as it was. What do you run?
+ python3 make_db.py
- python3 check.py reset
- DELETE FROM shop.db
- Nothing: changes are undone automatically
! make_db.py rebuilds shop.db from scratch.

? What should you do first when you meet a new SQL problem?
+ Restate it and decide what one row of the answer represents
- Write the final query straight away
- Open the solution
- Add ORDER BY
! The grain of the answer decides the GROUP BY.
```
