---
track: systems
title: "Systems 3: indexing, and why a query is slow"
short: Indexing
sub: Read the query plan, see an index turn 11 ms into 0.03 ms, then find the five ways an index silently stops helping. Real SQLite, real timings.
---


:::goals
- read a query plan (`EXPLAIN QUERY PLAN`) and tell a scan from an index search
- choose the column order of a composite index
- name the common ways a query stops using its index
- explain selectivity and covering indexes
:::

:::note Companion to "Use The Index, Luke"
The free web book [Use The Index, Luke](https://use-the-index-luke.com/) by Markus Winand is the best long-form version of this lesson ([resource list](#systems-1)). Here the same ideas are tried in SQLite, which is built into Python. Other databases print plans differently (`EXPLAIN` in PostgreSQL and MySQL), but the ideas are the same.
:::

## 1. The rule of thumb

> A slow query is almost always a query that reads far more rows than it returns.

Your job is to **look at the plan**, not to guess. A plan says whether the database will **scan** the whole table or **search** an index. The script below builds a table of 200,000 orders, then tries nine variations and prints the time and the plan for each.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > index.py <<'EOF'
import sqlite3, time, random
random.seed(1)
db = sqlite3.connect(":memory:")
db.execute("create table orders(id integer primary key, customer_id int, status text, created text, total real)")
rows = [(i, random.randint(1, 20000), random.choice(["new", "paid", "shipped", "cancelled"]),
         f"2026-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}", round(random.random() * 500, 2)) for i in range(1, 200_001)]
db.executemany("insert into orders values (?,?,?,?,?)", rows)

def plan(sql): return " / ".join(r[3] for r in db.execute("explain query plan " + sql))
def ms(sql, n=15):
    t = time.perf_counter()
    for _ in range(n): db.execute(sql).fetchall()
    return (time.perf_counter() - t) / n * 1000
def show(label, sql):
    print(f"{label:46} {ms(sql):8.3f} ms   {plan(sql)}")

Q1 = "select * from orders where customer_id = 777"
show("1. no index on customer_id", Q1)
db.execute("create index ix_customer on orders(customer_id)")
show("2. after create index (customer_id)", Q1)
print()
Q2 = "select count(*) from orders where status = 'paid' and created >= '2026-11-01'"
db.execute("create index ix_a on orders(created, status)")
show("3. index (created, status)", Q2)
db.execute("drop index ix_a"); db.execute("create index ix_b on orders(status, created)")
show("4. index (status, created): equality first", Q2)
print()
db.execute("create index ix_created on orders(created)")
show("5. where created = '2026-03-05'", "select * from orders where created = '2026-03-05'")
show("6. where substr(created,1,7) = '2026-03'", "select * from orders where substr(created,1,7) = '2026-03'")
show("7. where created >= '2026-03-01' and created < '2026-04-01'", "select * from orders where created >= '2026-03-01' and created < '2026-04-01'")
show("7b. range of 3 days (about 0.7% of rows)", "select * from orders where created >= '2026-03-01' and created < '2026-03-04'")
print()
show("8. covering: select customer_id (index has it)", "select customer_id from orders where customer_id between 100 and 200")
show("9. not covering: select * (back to the table)", "select * from orders where customer_id between 100 and 200")
print()
n = db.execute("select count(*) from orders where status = 'paid'").fetchone()[0]
print(f"selectivity: status='paid' matches {n:,} of 200,000 rows ({n / 200000:.0%}); customer_id=777 matches {db.execute(Q1).fetchall().__len__()} rows")
EOF
python3 index.py
```


Time numbers are measured on the machine that recorded this page, so yours will differ, but the **plans** and the **ratios** should look alike. What each line teaches:

**1 and 2: a plain index.** With no index the plan says `SCAN orders`: every row is read. After `create index ... (customer_id)` the plan becomes `SEARCH ... USING INDEX`: it jumps straight to the 16 matching rows. The gap is hundreds of times and grows with the table.

**3 and 4: column order in a composite index.** Both indexes contain the same two columns, but `(status, created)` is faster for "status equals X and created is after Y". The rule: **put the columns tested with equality first, then the column used for a range.** An index on `(created, status)` can only narrow by the range on its first column, then has to filter the second one inside that range.

**5, 6 and 7: how an index gets ignored.** A search by `created = '2026-03-05'` uses the index. Wrapping the column in a function, `substr(created, 1, 7) = '2026-03'`, hides the column from the index: the plan falls back to `SCAN`. Rewriting it as a **range** (`created >= ... and created < ...`) lets the index be used again. But notice **line 7** is still slow: that month holds about 8% of the table, so even with the index the query must fetch 16,000 rows. Line **7b** asks for three days and is fast again.

**8 and 9: covering indexes.** When the index itself contains every column the query needs, the plan says `COVERING INDEX` and the table is never touched. Selecting `*` forces a trip to the table for each row and costs several times more.

## 2. The reasons an index is not used

1. **A function or calculation on the column:** `where lower(email) = ...`, `where date(created) = ...`. Index the expression, or rewrite the condition as a range.
2. **A type mismatch**, such as comparing a text column to a number, which forces a conversion on every row.
3. **A leading wildcard:** `like '%abc'` cannot use an ordinary index; `like 'abc%'` can.
4. **The wrong column order** in a composite index, or a query that skips the first column of the index.
5. **Low selectivity:** an index on `status` (4 values, 25% each) helps little, because the query would still read a quarter of the table. The planner may rightly prefer a scan. **Selectivity** = how small a share of the table a typical lookup matches. Good indexes have high selectivity.
6. **Stale statistics:** the planner chooses from statistics about the data; after big changes run the database's analyse command.

## 3. Indexes are not free

Every index must be updated on every insert, update and delete, and it takes disk and memory. A table with ten indexes writes to eleven structures per insert. Add the indexes your **real queries** need, check them with the plan, and drop the ones nobody uses.

## 4. Pagination and ordering

`order by created limit 20` can stop early if an index returns rows already sorted. But `limit 20 offset 100000` still has to walk past 100,000 rows. For deep pages use **keyset pagination**: `where (created, id) > (:last_created, :last_id) order by created, id limit 20`, which jumps straight to the right place.

## Common misconceptions

- "Adding an index never hurts." It slows writes and uses memory.
- "The database will always use my index." The planner uses it only if it looks cheaper.
- "An index on every column is best." It is the worst of both worlds.

## Practice (answers below)

1. Which index serves `where tenant_id = ? and created >= ? order by created`?
2. A query `where lower(email) = 'a@x.com'` scans the table. Give two fixes.
3. Why can `select *` be much slower than `select customer_id` even with the same `where`?

:::recap
- Read the **plan** first: `SCAN` reads everything, `SEARCH ... USING INDEX` jumps to the rows.
- **Equality columns first, range column last** in a composite index.
- Functions on a column, leading wildcards, type mismatches and low selectivity stop indexes working.
- A **covering index** answers the query without touching the table.
- Every index costs writes and space; keep the ones your queries use.
:::

:::note Answers
1. A composite index on `(tenant_id, created)`: equality column first, then the range and sort column. 2. Create an expression index on `lower(email)` (where supported) or store a lowercase copy of the email in its own indexed column. 3. With `select *` the database must visit the table for every matching row, while `select customer_id` can be answered from the index alone if the index is covering.
:::

```quiz
? A plan says SCAN orders. What is happening?
+ The database reads every row of the table
- It uses the primary key
- It uses a covering index
- The query is cached
! A scan touches the whole table; a search uses an index to jump to the matching rows.

? For where status = ? and created >= ?, which composite index order is best?
+ (status, created): equality column first, range column second
- (created, status)
- Two separate indexes are always better
- No index helps
! Equality columns first lets the index narrow to one status, then range-scan the dates inside it.

? Why might the planner ignore an index on a column with 4 distinct values?
+ A lookup would still match about a quarter of the table, so a scan can be cheaper
- Indexes cannot store text
- The database is out of memory
- It is a bug
! Low selectivity makes the index barely better than reading the table.
```
