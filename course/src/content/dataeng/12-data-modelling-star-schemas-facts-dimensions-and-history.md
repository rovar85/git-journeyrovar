---
track: dataeng
title: "Data modelling: star schemas, facts, dimensions and history"
short: Data modelling
sub: Why analytics tables are shaped differently from application tables, how to build a star schema from a flat export, and how a type 2 dimension keeps history correct.
---

:::goals
- explain OLTP versus OLAP and normalised versus dimensional models
- identify facts, dimensions and the grain of a fact table
- build a small star schema and query it
- keep history with a slowly changing dimension (type 2)
:::

:::note Before this lesson
You need joins from [lesson 5](#dataeng-5). How a database stores and indexes data is in [Systems 2](#systems-2).
:::

## The idea

An application database (**OLTP**, online transaction processing) is designed for many small, fast writes: "create this order". Its tables are **normalised**: each fact is stored once, in many small tables, so updates are safe.

An analytics database (**OLAP**, online analytical processing) is designed for big reads: "revenue by category by month for three years". Queries scan millions of rows and few columns. Here a **dimensional model** works better: fewer, wider tables arranged as a **star**.

- A **fact table** records events or measurements: one row per sale, click, payment. It holds **numbers** you add up (quantity, revenue) and **keys** that point to dimensions. Facts are long and narrow and grow forever.
- A **dimension table** describes the who, what, where and when: customer, product, store, date. Dimensions are short and wide, and are what you filter and group by.
- The **grain** is what one fact row means, said in one sentence: "one row per order line". Decide the grain first; almost every modelling mistake is a confused grain.

## Run it

The script takes a flat export of six sales, builds a star schema (one fact, three dimensions), answers a business question, and then handles a customer who moves city.

```run
mkdir -p ~/lab/de/model && cd ~/lab/de/model
cat > model.py <<'EOF'
# Dimensional modelling: turn a flat sales export into a star schema, then keep history with a type 2 dimension.
import sqlite3
db = sqlite3.connect(":memory:")
flat = [  # (order_id, day, customer, city, product, category, qty, unit_price)
 (1, "2026-03-01", "asha", "Pune",   "kettle", "kitchen", 1, 30.0), (2, "2026-03-01", "ben",  "Leeds", "mug", "kitchen", 4, 6.0),
 (3, "2026-03-02", "asha", "Pune",   "mug",    "kitchen", 2, 6.0),  (4, "2026-03-02", "chen", "Singapore", "lamp", "home", 1, 45.0),
 (5, "2026-03-03", "ben",  "Leeds",  "lamp",   "home",    1, 45.0), (6, "2026-03-03", "asha", "Pune", "lamp", "home", 2, 45.0)]
db.executescript("""
CREATE TABLE dim_customer (customer_key INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, city TEXT, valid_from TEXT, valid_to TEXT, is_current INTEGER);
CREATE TABLE dim_product  (product_key INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, category TEXT);
CREATE TABLE dim_date     (date_key TEXT PRIMARY KEY, weekday TEXT, month TEXT);
CREATE TABLE fact_sales   (order_id INTEGER PRIMARY KEY, date_key TEXT, customer_key INTEGER, product_key INTEGER, qty INTEGER, revenue REAL);""")
for oid, day, cust, city, prod, cat, qty, price in flat:
    if not db.execute("SELECT 1 FROM dim_customer WHERE name=? AND is_current=1", (cust,)).fetchone():
        db.execute("INSERT INTO dim_customer (name, city, valid_from, valid_to, is_current) VALUES (?,?,?,'9999-12-31',1)", (cust, city, "2026-01-01"))
    db.execute("INSERT OR IGNORE INTO dim_product (name, category) VALUES (?,?)", (prod, cat))
    db.execute("INSERT OR IGNORE INTO dim_date VALUES (?, strftime('%w', ?), substr(?, 1, 7))", (day, day, day))
    ck = db.execute("SELECT customer_key FROM dim_customer WHERE name=? AND is_current=1", (cust,)).fetchone()[0]
    pk = db.execute("SELECT product_key FROM dim_product WHERE name=?", (prod,)).fetchone()[0]
    db.execute("INSERT INTO fact_sales VALUES (?,?,?,?,?,?)", (oid, day, ck, pk, qty, qty * price))
def show(title, sql):
    cur = db.execute(sql); print(f"-- {title}"); print("   " + " | ".join(c[0] for c in cur.description))
    for r in cur: print("   " + " | ".join(str(v) for v in r))
    print()
show("fact table: one row per sale, only keys and numbers", "SELECT * FROM fact_sales")
show("a business question is now a simple join: revenue by category and city",
     "SELECT p.category, c.city, SUM(f.revenue) AS revenue FROM fact_sales f JOIN dim_product p USING (product_key) JOIN dim_customer c USING (customer_key) GROUP BY 1, 2 ORDER BY revenue DESC")
# Asha moves from Pune to Mumbai on 2026-03-04. Type 1 would overwrite the city (history lost). Type 2 closes the old row and adds a new one.
db.execute("UPDATE dim_customer SET valid_to='2026-03-04', is_current=0 WHERE name='asha' AND is_current=1")
db.execute("INSERT INTO dim_customer (name, city, valid_from, valid_to, is_current) VALUES ('asha','Mumbai','2026-03-04','9999-12-31',1)")
ck = db.execute("SELECT customer_key FROM dim_customer WHERE name='asha' AND is_current=1").fetchone()[0]
db.execute("INSERT INTO fact_sales VALUES (7,'2026-03-05',?,1,1,30.0)", (ck,))
db.execute("INSERT OR IGNORE INTO dim_date VALUES ('2026-03-05', '4', '2026-03')")
show("type 2 dimension after Asha moves: two rows, one current", "SELECT customer_key, name, city, valid_from, valid_to, is_current FROM dim_customer WHERE name='asha'")
show("history is correct: old sales stay in Pune, the new sale is in Mumbai", "SELECT c.city, COUNT(*) AS sales, SUM(f.revenue) AS revenue FROM fact_sales f JOIN dim_customer c USING (customer_key) WHERE c.name='asha' GROUP BY c.city")
EOF
python3 model.py
```

What to notice:

- The **fact table** has only keys and numbers. `revenue` is calculated once at load time (`qty x unit_price`).
- **Surrogate keys** (`customer_key`, `product_key`) are simple integers created by the warehouse, separate from the source system's ids. They make history possible and protect you when a source reuses or changes its ids.
- "Revenue by category and city" is one fact joined to two dimensions and a `GROUP BY`: home in Pune is 90.0, kitchen in Pune 42.0.
- **History.** Asha moves from Pune to Mumbai. Overwriting her city (called **type 1**) would move all her past sales to Mumbai in every report. **Type 2** closes the old row (`valid_to`, `is_current = 0`) and inserts a new row with a new surrogate key. Old facts still point to key 1 (Pune); the new sale points to key 4 (Mumbai). The last query proves it: 3 sales and 132.0 in Pune, 1 sale and 30.0 in Mumbai.

## Slowly changing dimensions

| Type | What happens when an attribute changes | History |
|---|---|---|
| 0 | never change it | original only |
| 1 | overwrite | none |
| 2 | close the old row, add a new row with dates and a current flag | full |
| 3 | keep a "previous value" column | one step |

Type 1 for corrections (a typo in a name); type 2 where the business asks "as it was at the time" (a customer's region, a product's price band, a salesperson's team).

## The date dimension

A table with one row per day and columns such as weekday, month, quarter, fiscal year, is-holiday. It looks trivial and is very useful: it makes "sales by weekday" a simple join, and joining facts to it **fills missing days**, which fixes the moving-average problem from [lesson 6](#dataeng-6).

## Layers: raw, clean, modelled

Most teams organise tables in layers. The names vary; the idea is the same.

| Layer | Also called | Contents |
|---|---|---|
| Raw | bronze, landing, staging | data exactly as received, append-only |
| Clean | silver, intermediate | typed, de-duplicated, standardised, joined |
| Modelled | gold, marts | facts and dimensions, aggregates for a business area |

Keeping the raw layer means you can rebuild everything after fixing a bug in a transformation.

## Other modelling styles

- **Third normal form (Inmon):** a normalised enterprise warehouse first, marts built from it.
- **Kimball dimensional model:** the star schemas of this lesson, built per business process and connected by shared (**conformed**) dimensions.
- **Data Vault:** hubs, links and satellites; good for auditability and many changing sources, more tables to manage.
- **One big table:** a wide, denormalised table per use case; fast and simple to query in column stores, harder to keep consistent.

A practical default: **star schemas for the core business entities, and wide tables built from them for specific dashboards.**

:::try
1. Add a `dim_store` dimension and a `store_key` to the fact. 2. Change the price of the lamp from 45 to 50 on 2026-03-04 using a type 2 product dimension (add `unit_price`, `valid_from`, `valid_to`, `is_current`). 3. Write the query for revenue per weekday using `dim_date`.
:::

## What is a star schema?

:::say
A star schema has a central fact table of events with numeric measures and foreign keys, surrounded by dimension tables that describe who, what, where and when. I first fix the grain, what one fact row means, then choose the dimensions and the measures. It makes analytical queries simple, a fact joined to a few dimensions, and performs well in column stores.
:::

## How do you keep history when a dimension changes?

:::say
With a slowly changing dimension type 2: I close the current row by setting its end date and current flag, and insert a new row with a new surrogate key. Facts keep pointing to the key that was valid when they happened, so historical reports stay correct. I use type 1, a simple overwrite, only for corrections where history does not matter.
:::

:::recap
- **OLTP** = many small writes, normalised; **OLAP** = big reads, dimensional.
- **Fact** = events with numbers and keys; **dimension** = descriptive context; fix the **grain** first.
- **Surrogate keys** decouple the warehouse from source ids.
- **SCD type 2** keeps history: close the old row, add a new one.
- Layers: **raw, clean, modelled**.
:::

```quiz
? What should you decide first when designing a fact table?
+ The grain: what exactly one row represents
- The colour of the dashboard
- The compression codec
- The number of indexes
! Everything else follows from the grain.

? A customer changes region and reports must show past sales in the old region. Which approach?
+ Slowly changing dimension type 2
- Overwrite the region (type 1)
- Delete the customer
- Store the region in the fact as free text only
! Type 2 keeps both versions with validity dates.

? Why use surrogate keys?
+ They let one business entity have several historical versions and protect against source id changes
- They are required by SQL
- They make tables smaller in every case
- They encrypt the data
! The warehouse controls its own keys.
```
