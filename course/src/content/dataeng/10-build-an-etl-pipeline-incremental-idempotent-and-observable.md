---
track: dataeng
title: "Build an ETL pipeline: incremental, idempotent and observable"
short: ETL pipeline
sub: Extract daily files, transform and validate them, and load them into a database so that a re-run changes nothing, a crash leaves no half-loaded file, and every row is accounted for.
---

:::goals
- explain extract, transform, load, and ETL versus ELT
- build a pipeline that loads only new files and can be re-run safely
- use a transaction so a file loads completely or not at all
- record what was loaded, count rows, and keep rejects
- copy tables from one database to another with pandas, using staging tables and a full load
:::

@widget viz_etl

:::note Before this lesson
You need [Python for data work](#dataeng-4) and upserts from [lesson 6](#dataeng-6). This lesson uses files and SQLite so that it runs anywhere; the structure is the same with any database.
:::

## The idea

**ETL** is three steps:

1. **Extract:** read data from a source (files, a database, an API).
2. **Transform:** clean, validate, convert types, join, calculate.
3. **Load:** write it to the destination (a database or warehouse).

**ELT** swaps the last two: load the raw data first, then transform **inside** the warehouse with SQL. Modern cloud warehouses are powerful and cheap enough that ELT is now the usual choice for analytics ([lesson 17](#dataeng-17)); ETL remains common when data must be cleaned or masked before it lands.

A script that works once on your laptop is not a pipeline. A **pipeline** runs every day, unattended, and things go wrong: a file is late, the job crashes halfway, someone runs it twice. Three properties make it trustworthy:

- **Incremental:** process only what is new, not everything every time.
- **Idempotent:** running it again gives the same result (no duplicates).
- **Observable:** it says what it did: files, rows in, rows out, rows rejected.

## Run it

A source system drops one CSV per day into a `landing` folder. One file contains a bad row; a later file corrects an earlier order.

```run
mkdir -p ~/lab/de/etl && cd ~/lab/de/etl
cat > etl.py <<'EOF'
# A small but real ETL pipeline: extract CSV files -> transform -> load into SQLite.
# Properties of a production pipeline: incremental (only new files), idempotent (safe to re-run), observable (logs, counts), rejects kept.
import csv, sqlite3, logging, sys, hashlib
from pathlib import Path
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout)
log = logging.getLogger("etl")
LANDING, DB = Path("landing"), "warehouse.db"

def make_source_files():                       # pretend another system drops a file per day
    LANDING.mkdir(exist_ok=True)
    (LANDING / "orders_2026-03-01.csv").write_text("order_id,customer,amount\n1,asha,20.00\n2,ben,5.00\n3,chen,abc\n")
    (LANDING / "orders_2026-03-02.csv").write_text("order_id,customer,amount\n4,ben,80.00\n2,ben,6.00\n")   # order 2 corrected

def setup(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS orders (order_id INTEGER PRIMARY KEY, customer TEXT NOT NULL, amount REAL NOT NULL, source_file TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rejects (source_file TEXT, line INTEGER, reason TEXT, raw TEXT);
    CREATE TABLE IF NOT EXISTS loaded_files (name TEXT PRIMARY KEY, checksum TEXT, rows_ok INTEGER, rows_bad INTEGER);""")

def extract(path):
    with open(path, newline="") as f:
        for n, row in enumerate(csv.DictReader(f), start=2): yield n, row

def transform(row):
    return {"order_id": int(row["order_id"]), "customer": row["customer"].strip().lower(), "amount": round(float(row["amount"]), 2)}

def run():
    db = sqlite3.connect(DB); setup(db)
    done = {r[0] for r in db.execute("SELECT name FROM loaded_files")}
    new = [p for p in sorted(LANDING.glob("orders_*.csv")) if p.name not in done]
    if not new: log.info("nothing new to load")
    for path in new:
        ok = bad = 0
        with db:                                # one transaction per file: all of it loads, or none of it
            for line, row in extract(path):
                try:
                    r = transform(row)
                    db.execute("""INSERT INTO orders VALUES (:order_id, :customer, :amount, :f)
                                  ON CONFLICT(order_id) DO UPDATE SET customer = excluded.customer, amount = excluded.amount, source_file = excluded.source_file""", {**r, "f": path.name})
                    ok += 1
                except (ValueError, KeyError) as e:
                    db.execute("INSERT INTO rejects VALUES (?,?,?,?)", (path.name, line, str(e), str(dict(row)))); bad += 1
            db.execute("INSERT INTO loaded_files VALUES (?,?,?,?)", (path.name, hashlib.md5(path.read_bytes()).hexdigest(), ok, bad))
        log.info("loaded %s: %d ok, %d rejected", path.name, ok, bad)
    n, total = db.execute("SELECT COUNT(*), ROUND(SUM(amount), 2) FROM orders").fetchone()
    log.info("orders table: %d rows, total %.2f; rejects: %d", n, total, db.execute("SELECT COUNT(*) FROM rejects").fetchone()[0])
    return db

Path(DB).unlink(missing_ok=True)
make_source_files()
print("== first run =="); db = run()
print("== second run (nothing changed: must do nothing and change nothing) =="); db = run()
print("== a new file arrives =="); (LANDING / "orders_2026-03-03.csv").write_text("order_id,customer,amount\n5,dee,42.50\n"); db = run()
print("\nfinal table:")
for row in db.execute("SELECT * FROM orders ORDER BY order_id"): print("  ", row)
print("rejects:", db.execute("SELECT source_file, line, reason FROM rejects").fetchall())
EOF
python3 etl.py
```

Follow the three runs:

- **First run:** both files load. File 1 has 2 good rows and 1 reject (`abc` is not a number). File 2 has order 4 and a **correction** to order 2 (5.00 becomes 6.00). The table holds 3 orders, total 106.00.
- **Second run:** nothing changed, so it logs "nothing new to load" and the table is identical: 3 rows, 106.00. That is idempotency you can see.
- **A new file arrives:** only that file is processed. 4 rows, total 148.50.
- The reject is stored with its file, line and reason.

## How the script achieves each property

| Property | Mechanism in the code |
|---|---|
| Incremental | the `loaded_files` table records every file already processed; new files are the difference |
| Idempotent | `INSERT ... ON CONFLICT(order_id) DO UPDATE` (upsert): the same order twice is one row |
| Atomic | `with db:` wraps each file in one **transaction**: if anything fails, the whole file is rolled back and is not marked as loaded |
| Observable | logging of files and counts; `rows_ok` and `rows_bad` stored per file; a checksum of each file |
| Nothing lost | bad rows go to the `rejects` table with a reason |
| Traceable | `source_file` on every row says where it came from (**lineage**) |

The transaction is the subtle part. The data rows and the "this file is loaded" marker are written **together**. Without that, a crash between the two leaves either a file that is loaded but not recorded (it loads again: duplicates, unless you upsert) or recorded but not loaded (data silently missing).

## The other common shape: database to database

The pipeline above reads files. The other everyday job is copying tables from an **application database** into the **warehouse**. With pandas this takes a few lines per table: `read_sql_query` extracts a table into a DataFrame, and `to_sql` loads a DataFrame into a table.

```run
mkdir -p ~/lab/de/dbcopy && cd ~/lab/de/dbcopy
cat > dbcopy.py <<'EOF'
# Extract and load between two databases with pandas: the fastest route to a first working pipeline.
# Source: an application database. Target: a warehouse. Both are SQLite files here; with SQL Server or PostgreSQL only the connection changes.
import os, sqlite3
import pandas as pd
for f in ("app.db", "warehouse.db"):
    if os.path.exists(f): os.remove(f)
src = sqlite3.connect("app.db")
src.executescript("""
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, country TEXT);
CREATE TABLE products  (id INTEGER PRIMARY KEY, name TEXT, price REAL);
CREATE TABLE orders    (id INTEGER PRIMARY KEY, customer_id INTEGER, product_id INTEGER, qty INTEGER, ordered_on TEXT);
INSERT INTO customers VALUES (1,'Asha','IN'),(2,'Ben','UK'),(3,'Chen','SG');
INSERT INTO products  VALUES (1,'kettle',30.0),(2,'mug',6.0);
INSERT INTO orders    VALUES (1,1,1,1,'2026-03-01'),(2,2,2,4,'2026-03-01'),(3,1,2,2,'2026-03-02'),(4,3,1,1,'2026-03-03');
""")
src.commit()
password = os.environ.get("WAREHOUSE_PASSWORD", "(not set: fine for a local file)")       # credentials come from the environment, never from the code
dst = sqlite3.connect("warehouse.db")

def extract_and_load():
    tables = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]   # ask the database which tables exist
    for t in tables:
        try:
            df = pd.read_sql_query(f"SELECT * FROM {t}", src)                    # extract: one table -> one DataFrame
            df["_loaded_at"] = "2026-03-05T02:00:00Z"                            # a small transform: stamp each row with the load time
            df.to_sql(f"stg_{t}", dst, if_exists="replace", index=False)         # load into a STAGING table; "replace" = truncate and load
            print(f"   {t:10} -> stg_{t:10} {len(df)} rows")
        except Exception as e:
            print(f"   {t}: FAILED: {e}")                                        # one bad table must not stop the others, but must be visible
print("run 1:"); extract_and_load()
src.execute("INSERT INTO orders VALUES (5,2,1,2,'2026-03-04')"); src.execute("UPDATE products SET price = 32.0 WHERE id = 1"); src.commit()
print("run 2, after the source changed (a new order and a price change):"); extract_and_load()

print("\ncheck: row counts must match between source and target")
for t in ("customers", "orders", "products"):
    a = src.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]; b = dst.execute(f"SELECT COUNT(*) FROM stg_{t}").fetchone()[0]
    print(f"   {t:10} source {a}  target {b}  {'OK' if a == b else 'MISMATCH'}")
print("\nthe staging tables are raw copies; a transform step then builds what people query:")
print(pd.read_sql_query("""SELECT c.country, SUM(o.qty * p.price) AS revenue FROM stg_orders o
                           JOIN stg_customers c ON c.id = o.customer_id JOIN stg_products p ON p.id = o.product_id
                           GROUP BY c.country ORDER BY revenue DESC""", dst).to_string(index=False))
print("\nlarge table? read it in chunks so memory stays flat:")
n = 0
for chunk in pd.read_sql_query("SELECT * FROM orders", src, chunksize=2): n += 1; print(f"   chunk {n}: {len(chunk)} rows")
EOF
python3 dbcopy.py
```

What to notice:

- **The pipeline asks the source which tables exist** and loops over them, so a new table needs no new code.
- Each table lands in a **staging table** with the prefix `stg_`. Staging tables are raw copies; nobody reports from them directly. A later transform step builds the tables people query, as the revenue query does.
- `if_exists="replace"` is a **full load**, also called **truncate and load**: every run throws the target table away and copies the source again. Run 2 picked up the new order (5 rows) and the price change without any logic, which is why revenue for the UK is 88.0. Full loads are simple and self-correcting, and the right choice for small tables. They stop working when a table is too big to copy every night; then you need the incremental methods below.
- **Each table is in its own `try` / `except`**, so one failing table is reported and the others still load.
- **Row counts are compared** between source and target at the end. It is the cheapest test there is, and it catches most broken loads.
- **Credentials come from an environment variable**, not from the script. A password in code ends up in Git, and from there everywhere.
- For a big table, `chunksize` makes pandas hand over the rows a piece at a time so memory use stays flat.

With real servers only the connection lines change:

```term
# Example (not run here)
import os, pyodbc, sqlalchemy
src = pyodbc.connect(f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER=app-db;DATABASE=shop;UID=etl;PWD={os.environ['SRC_PWD']}")
dst = sqlalchemy.create_engine(f"postgresql://etl:{os.environ['DST_PWD']}@warehouse:5432/analytics")
```

Give the pipeline its own database user (here `etl`) with **read-only** rights on the source and write rights only on the staging area. To run it every night, schedule it with `cron` ([Linux 10](#linux-10)) at first, and with an orchestrator when there is more than one job ([lesson 14](#dataeng-14)).

## Three ways to load incrementally

1. **By file or partition** (as here): track which files or dates are done. Simple and robust. To redo a day, delete that day's data and its marker, then run again (**delete and reload a partition**).
2. **By high-water mark:** remember the largest `updated_at` loaded and ask the source for newer rows ([lesson 8](#dataeng-8)). Needs a reliable `updated_at` column; it misses hard deletes.
3. **Change data capture (CDC):** read the source database's change log (tools such as Debezium) to get every insert, update and delete in order. The most complete, and the most to operate.

A **full reload** (replace everything every time) is still the right choice for small tables: it is simple, always correct, and self-healing.

## Structure of a real project

```term
pipeline/
  extract.py      # one function per source, returns or yields raw records
  transform.py    # pure functions: input rows -> output rows (easy to unit test)
  load.py         # writes to the destination, upserts, transactions
  run.py          # wires the steps, takes the run date as a parameter
  config.yaml     # paths, table names; no secrets
  tests/          # unit tests for transform, a small end-to-end test
```

Keep **transform** functions pure (no file or network access inside them): the same input always gives the same output, so they are easy to test ([lesson 18](#dataeng-18)). Pass the **run date** in as a parameter instead of calling "today" inside the code, so the pipeline can be re-run for any past day ([lesson 14](#dataeng-14)).

:::try
1. Run `python3 etl.py` again without changes and confirm the totals are the same. 2. Edit `orders_2026-03-01.csv` in the `landing` folder after it was loaded: the pipeline does not notice. Use the stored checksum to detect a changed file and reload it. 3. Make the pipeline fail the run if more than 20% of a file's rows are rejected.
:::

## What makes a data pipeline production-ready?

:::say
It is incremental, idempotent and observable. Incremental means it processes only new data, using a file log, a high-water mark or change data capture. Idempotent means a re-run gives the same result, which I get from upserts or from deleting and reloading a partition, inside a transaction so a batch loads completely or not at all. Observable means it logs and stores row counts in, out and rejected, keeps bad rows with a reason, and alerts when counts or freshness look wrong.
:::

## What is the difference between ETL and ELT?

:::say
In ETL the data is transformed before it is loaded into the destination, usually by a separate engine. In ELT the raw data is loaded first and transformed inside the warehouse with SQL. ELT keeps the raw data, so transformations can be changed and re-run, and it uses the warehouse's power; ETL is still right when data must be cleaned, masked or reduced before it lands.
:::

:::recap
- **Extract, transform, load**; ELT loads first and transforms in the warehouse.
- A pipeline must be **incremental, idempotent, atomic and observable**.
- Track what was loaded; **upsert**; one **transaction** per batch including the "done" marker.
- Keep rejects, counts and lineage.
- Parameterise by **run date** so any day can be re-run.
:::

```quiz
? Why are the data rows and the loaded-file marker written in one transaction?
+ So a crash cannot leave a file half-loaded or loaded but unrecorded
- To make the file smaller
- Because SQLite requires it
- To sort the rows
! Both happen, or neither.

? The pipeline is run twice on the same files. What must happen?
+ The second run changes nothing
- Rows are duplicated
- The table is emptied
- The job must crash
! That is idempotency.

? Which incremental method captures deletes in the source?
+ Change data capture from the database log
- A high-water mark on updated_at
- Reading only the newest file
- None
! A deleted row has no updated_at to find.
```
