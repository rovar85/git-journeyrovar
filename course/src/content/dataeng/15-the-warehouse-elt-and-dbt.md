---
track: dataeng
title: "The warehouse, ELT and dbt: the modern data stack"
short: Warehouse and dbt
sub: How a cloud warehouse stores and bills, why transformations moved into SQL, and what dbt does, shown with a 50-line version that builds models in dependency order and tests them.
---

:::goals
- explain how a cloud data warehouse separates storage and compute, and what you pay for
- describe the modern data stack: ingest, store, transform, orchestrate, serve
- explain what dbt does: models, `ref`, lineage, tests, incremental models
- reduce warehouse cost with partitioning, clustering and incremental builds
:::

:::note Before this lesson
You need [advanced SQL](#dataeng-4), [data modelling](#dataeng-10) and [data quality](#dataeng-11).
:::

## The idea

A **cloud data warehouse** (Snowflake, BigQuery, Amazon Redshift, Azure Synapse, Databricks SQL) is a database built for analytics: **columnar storage** ([lesson 7](#dataeng-7)), **massively parallel** query execution ([lesson 13](#dataeng-13)), and **storage separated from compute**, so you can store everything cheaply and pay for processing only when queries run.

Because the warehouse is so capable, the pattern changed from ETL to **ELT**: load the raw data first, then transform it **inside the warehouse with SQL**. The pieces around it are often called the **modern data stack**:

| Step | Job | Example tools |
|---|---|---|
| Ingest | copy data from sources into raw tables | Fivetran, Airbyte, dlt, custom Python, Kafka + CDC |
| Store | warehouse or lakehouse | Snowflake, BigQuery, Redshift, Databricks |
| Transform | SQL models from raw to marts | **dbt**, SQLMesh, Dataform |
| Orchestrate | schedule and connect the steps | Airflow, Dagster, Prefect |
| Serve | dashboards, notebooks, ML, reverse ETL | Looker, Power BI, Tableau, Metabase |
| Govern | catalogue, lineage, quality, access | DataHub, OpenMetadata, Unity Catalog, Great Expectations |

## What dbt does

**dbt** (data build tool) lets you write each transformation as a `SELECT` statement in its own file, called a **model**. Models refer to each other with `{{ ref('other_model') }}`. From those references dbt works out the **dependency graph**, builds the models in the right order as tables or views, runs **tests**, and generates **documentation and lineage**. It brings software practice (version control, review, tests, environments) to SQL.

## Run it

Real dbt needs a warehouse connection, so here is the core of it in about 50 lines on SQLite: four models, their references, a build in dependency order, and four tests.

```run
mkdir -p ~/lab/de/dbtmini && cd ~/lab/de/dbtmini
cat > dbtmini.py <<'EOF'
# What dbt does, in 50 lines: SQL models that refer to each other, built in dependency order, with tests. (ELT: transform inside the warehouse.)
import re, sqlite3
db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE raw_orders (id INTEGER, customer_id INTEGER, amount TEXT, status TEXT, ordered_on TEXT);
INSERT INTO raw_orders VALUES (1,1,'20.0','PAID','2026-03-01'),(2,1,'35.5','paid','2026-03-03'),(3,2,'5.0','refunded','2026-03-03'),(4,2,'80.0','paid','2026-03-04'),(4,2,'80.0','paid','2026-03-04'),(5,3,'12.0','paid','2026-03-04');
CREATE TABLE raw_customers (id INTEGER, name TEXT, country TEXT);
INSERT INTO raw_customers VALUES (1,'Asha','IN'),(2,'Ben','UK'),(3,'Chen','SG');""")
MODELS = {   # name: SQL. {{ ref('x') }} means "this model depends on model x"
 "stg_orders": "SELECT DISTINCT id AS order_id, customer_id, CAST(amount AS REAL) AS amount, LOWER(status) AS status, ordered_on FROM raw_orders",
 "stg_customers": "SELECT id AS customer_id, name, country FROM raw_customers",
 "fct_paid_orders": "SELECT o.order_id, o.customer_id, c.country, o.amount, o.ordered_on FROM {{ ref('stg_orders') }} o JOIN {{ ref('stg_customers') }} c USING (customer_id) WHERE o.status = 'paid'",
 "mart_revenue_by_country": "SELECT country, COUNT(*) AS orders, SUM(amount) AS revenue FROM {{ ref('fct_paid_orders') }} GROUP BY country",
}
TESTS = [("unique", "stg_orders", "order_id"), ("not_null", "fct_paid_orders", "country"), ("unique", "mart_revenue_by_country", "country"),
         ("accepted_values", "stg_orders", "status", ("paid", "refunded", "pending"))]
REF = re.compile(r"\{\{\s*ref\('(\w+)'\)\s*\}\}")
deps = {m: REF.findall(sql) for m, sql in MODELS.items()}
order, seen = [], set()
def visit(m):
    if m in seen: return
    seen.add(m)
    for d in deps[m]: visit(d)
    order.append(m)
for m in MODELS: visit(m)
print("lineage (who depends on whom):")
for m in order: print(f"   {m:26} <- {', '.join(deps[m]) or 'raw tables'}")
print("\nrun:")
for m in order:
    db.execute(f"DROP TABLE IF EXISTS {m}"); db.execute(f"CREATE TABLE {m} AS " + REF.sub(r"\1", MODELS[m]))
    print(f"   built {m:26} {db.execute(f'SELECT COUNT(*) FROM {m}').fetchone()[0]} rows")
print("\ntest:")
for kind, model, col, *arg in TESTS:
    if kind == "unique": bad = db.execute(f"SELECT COUNT(*) FROM (SELECT {col} FROM {model} GROUP BY {col} HAVING COUNT(*) > 1)").fetchone()[0]
    elif kind == "not_null": bad = db.execute(f"SELECT COUNT(*) FROM {model} WHERE {col} IS NULL").fetchone()[0]
    else: bad = db.execute(f"SELECT COUNT(*) FROM {model} WHERE {col} NOT IN ({','.join('?' * len(arg[0]))})", arg[0]).fetchone()[0]
    print(f"   {'PASS' if bad == 0 else 'FAIL'} {kind}({model}.{col})" + (f": {bad} bad" if bad else ""))
print("\nthe mart the dashboard reads:")
for r in db.execute("SELECT * FROM mart_revenue_by_country ORDER BY revenue DESC"): print("  ", r)
EOF
python3 dbtmini.py
```

What happened:

- **Lineage** was derived from the `ref` calls: the mart depends on the fact, which depends on two staging models, which read the raw tables. Nobody wrote the order by hand.
- **Run:** the raw orders table has 6 rows including a duplicate; `stg_orders` has 5 (cleaned: `DISTINCT`, text cast to a number, status in lower case). `fct_paid_orders` has 4 rows; the mart has 3, one per country.
- **Tests** all pass: unique keys, no NULL country, only accepted status values. Note that the raw data had `PAID` in capitals; the staging model normalised it, which is why the accepted-values test passes.
- The **mart** is what a dashboard reads: UK 80.0, IN 55.5, SG 12.0.

## The same project in real dbt

```term
# Example (not run here)
models/staging/stg_orders.sql
    select distinct id as order_id, customer_id, cast(amount as numeric) as amount, lower(status) as status, ordered_on
    from {{ source('shop', 'raw_orders') }}

models/marts/fct_paid_orders.sql
    {{ config(materialized='incremental', unique_key='order_id') }}
    select o.order_id, o.customer_id, c.country, o.amount, o.ordered_on
    from {{ ref('stg_orders') }} o join {{ ref('stg_customers') }} c using (customer_id)
    where o.status = 'paid'
    {% if is_incremental() %} and o.ordered_on > (select max(ordered_on) from {{ this }}) {% endif %}

$ dbt build --select +mart_revenue_by_country     # build this model and everything upstream, then test
$ dbt test
$ dbt docs generate                               # documentation and a lineage graph
```

Key ideas:

- **Layers:** `staging` (one model per source table: rename, cast, clean), `intermediate` (joins and logic), `marts` (facts, dimensions and aggregates for a business area).
- **Materialisations:** `view` (no storage, computed on read), `table` (rebuilt each run), `incremental` (only new rows are processed), `ephemeral` (inlined).
- **Incremental models** process only new data; they need a reliable filter column and a `unique_key` for merging. A periodic `--full-refresh` repairs drift.
- **Tests** ([lesson 11](#dataeng-11)) and **snapshots** (type 2 history, [lesson 10](#dataeng-10)) are built in.
- **Environments:** each developer builds into their own schema; CI builds changed models and runs tests on every pull request; production runs on a schedule.

## What you pay for, and how to pay less

- **Snowflake:** compute time of virtual warehouses (per second, by size) plus storage. **BigQuery (on-demand):** the number of bytes each query scans. **Redshift / Databricks:** cluster or serverless compute time.

Habits that cut the bill:

1. **Select only needed columns;** never `SELECT *` on wide tables.
2. **Partition** big tables by date and **always filter on the partition column**; **cluster / sort** by common filter columns.
3. **Incremental models** instead of rebuilding years of history every night.
4. **Aggregate tables** (or materialised views) for dashboards that ask the same question all day.
5. **Right-size and auto-suspend** compute; separate warehouses for loading, transforming and dashboards so they do not block each other.
6. **Watch the query history:** the top ten most expensive queries usually explain most of the cost. Set budgets and alerts.
7. **Drop what nobody reads:** lineage and usage statistics show unused tables.

Cost investigation as a method is in [Scenarios 11](#scenarios-11).

## Serving and governance

- **Access control:** roles, not people; least privilege; column masking and row-level security for sensitive data ([lesson 16](#dataeng-16)).
- **A semantic layer / metrics definitions:** "revenue" defined once, so two dashboards cannot disagree.
- **A catalogue:** who owns a table, what the columns mean, how fresh it is, where it comes from.

:::try
1. Add a model `mart_revenue_by_day` that depends on `fct_paid_orders`, and a `unique` test on `ordered_on`. 2. Insert a raw order with status `'chargeback'` and run again: which test fails? 3. Make the runner build only one model and its upstream models (the meaning of `--select +model` in dbt).
:::

## What is dbt, and why do teams use it?

:::say
dbt is the transformation layer of an ELT stack. Each model is a SELECT statement; models reference each other with ref, so dbt derives the dependency graph, builds tables and views in order, runs tests such as unique, not null and relationships, and generates documentation and lineage. It brings version control, code review, testing and separate environments to SQL transformations, and incremental models keep cost down.
:::

## How would you reduce the cost of a cloud data warehouse?

:::say
I start with the query history to find the few queries and tables that cause most of the cost. Then I reduce data scanned: select fewer columns, partition and cluster large tables and make sure queries filter on the partition, and build incremental models and aggregate tables instead of recomputing history. On the compute side I right-size and auto-suspend warehouses and separate workloads. I set budgets and alerts, and remove tables and dashboards nobody uses.
:::

:::recap
- A cloud warehouse = **columnar, parallel, storage separate from compute**.
- **ELT:** load raw, transform in SQL. Stack: **ingest, store, transform, orchestrate, serve, govern**.
- **dbt:** models as SELECTs, `ref` for lineage, tests, docs, incremental builds, environments.
- Cost follows **data scanned and compute time**: prune, partition, build incrementally, auto-suspend.
:::

```quiz
? How does dbt know the order in which to build models?
+ From the ref() calls between models, which form a dependency graph
- Alphabetical order
- The order of files on disk
- You list the order by hand
! ref is both a link and a dependency declaration.

? What is an incremental model?
+ A model that processes only new or changed rows instead of rebuilding the whole table
- A model that runs every minute
- A view
- A model with no tests
! It saves time and cost on large tables.

? In a warehouse billed by bytes scanned, which habit saves the most?
+ Filtering on the partition column and selecting only needed columns
- Using longer table names
- Running queries at night
- Adding ORDER BY
! Less data scanned is less cost.
```
