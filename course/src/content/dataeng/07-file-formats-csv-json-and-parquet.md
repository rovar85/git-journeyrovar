---
track: dataeng
title: "File formats: CSV, JSON and Parquet"
short: File formats
sub: Row versus column storage, measured on the same 200,000 rows for size, read time, reading one column and filtering, plus what Avro, ORC, Delta and Iceberg add.
---

:::goals
- explain row-based and column-based storage and what each is good at
- measure CSV, JSON Lines and Parquet on the same data
- explain column pruning, compression, row groups and predicate pushdown
- choose a format for a given job
:::

:::note Before this lesson
This lesson needs `pyarrow` (`pip install pyarrow`). The browser lab does not have it, so run this one on your own computer.
:::

## The idea

A **row-based** file (CSV, JSON Lines, Avro) stores one whole record after another. That is good for **writing** records as they arrive and for reading whole records.

A **column-based** file (Parquet, ORC) stores all values of column 1 together, then all of column 2, and so on. Analytics questions usually touch a few columns of many rows ("total amount per day"), so a column file lets the reader **skip the columns it does not need** (column pruning). Values in one column are similar, so they **compress** well. And the file keeps **statistics** (min and max per block), so a reader can skip blocks that cannot match a filter (**predicate pushdown**).

## Run it

The script writes the same 200,000 orders as CSV, JSON Lines and Parquet, then answers the same question from each.

```run
mkdir -p ~/lab/de/formats && cd ~/lab/de/formats
cat > formats.py <<'EOF'
# File formats compared on the same 200,000 rows: CSV, JSON Lines and Parquet (size, read time, reading one column, filtering).
import csv, json, os, random, time
import pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc
random.seed(4)
N = 200_000
COUNTRIES = ["IN", "UK", "SG", "US", "DE"]
rows = [{"order_id": i, "customer_id": random.randrange(5000), "country": random.choice(COUNTRIES),
         "amount": round(random.uniform(1, 500), 2), "day": f"2026-03-{1 + i * 30 // N:02d}", "note": "standard delivery"} for i in range(N)]
with open("orders.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
with open("orders.jsonl", "w") as f:
    for r in rows: f.write(json.dumps(r) + "\n")
table = pa.Table.from_pylist(rows)
pq.write_table(table, "orders.parquet", compression="snappy", row_group_size=20_000)
pq.write_table(table, "orders_zstd.parquet", compression="zstd", row_group_size=20_000)
mb = lambda p: os.path.getsize(p) / 1e6
print(f"{'file':22} {'size':>9}")
for p in ("orders.csv", "orders.jsonl", "orders.parquet", "orders_zstd.parquet"): print(f"{p:22} {mb(p):7.2f} MB")
def timed(fn):
    t = time.perf_counter(); out = fn(); return out, (time.perf_counter() - t) * 1000
def csv_sum():
    with open("orders.csv", newline="") as f: return sum(float(r["amount"]) for r in csv.DictReader(f))
def json_sum():
    with open("orders.jsonl") as f: return sum(json.loads(l)["amount"] for l in f)
def parquet_sum(): return pc.sum(pq.read_table("orders.parquet", columns=["amount"])["amount"]).as_py()
print("\nquestion: what is the total amount? (needs ONE column out of six)")
for name, fn in (("CSV: must parse every column of every row", csv_sum), ("JSON Lines: same, plus repeated field names", json_sum), ("Parquet: reads only the 'amount' column", parquet_sum)):
    val, ms = timed(fn); print(f"   {name:46} {ms:8.1f} ms   total = {val:,.2f}")
meta = pq.ParquetFile("orders.parquet").metadata
print(f"\ninside the Parquet file: {meta.num_rows:,} rows, {meta.num_row_groups} row groups, {meta.num_columns} columns; the schema travels with the data:")
print("   " + ", ".join(f"{f.name}: {f.type}" for f in table.schema))
col = meta.row_group(0).column(4)
print(f"   row group 0, column 'day': min={col.statistics.min}, max={col.statistics.max}  <- statistics let a reader skip whole row groups")
flt, ms = timed(lambda: pq.read_table("orders.parquet", columns=["amount"], filters=[("day", "=", "2026-03-15")]))
print(f"\nfilter day = 2026-03-15 with predicate pushdown: {flt.num_rows:,} rows returned in {ms:.1f} ms (row groups for other days are skipped)")
print("\ncolumn sizes inside the file (compressed):")
sizes = {}
for g in range(meta.num_row_groups):
    for c in range(meta.num_columns):
        cc = meta.row_group(g).column(c); sizes[cc.path_in_schema] = sizes.get(cc.path_in_schema, 0) + cc.total_compressed_size
for k, v in sizes.items(): print(f"   {k:12} {v / 1e3:8.1f} kB")
EOF
python3 formats.py
```

What the numbers show (sizes are exact; times vary by machine):

- **Size:** CSV 10.18 MB, JSON Lines 25.18 MB (it repeats every field name on every line), Parquet with snappy 2.95 MB, Parquet with zstd 1.98 MB. The Parquet file is **about 3.5 to 5 times smaller than CSV**.
- **One column:** summing `amount` from CSV or JSON means parsing every field of every row. Parquet read only the `amount` column and was many times faster in this run.
- **Schema inside the file:** `order_id: int64, amount: double, ...`. A CSV has no types; every reader must guess, and guesses differ.
- **Row groups and statistics:** the file has 10 row groups of 20,000 rows. Row group 0 holds days 2026-03-01 to 2026-03-03, so a query for 2026-03-15 skips it without reading it. The filtered read returned 6,666 rows.
- **Compression by column:** `day` and `note` take about 1 kB each for 200,000 values, because repeated values are stored once (dictionary and run-length encoding). The random `order_id` and `amount` columns take most of the file.

## Choosing a format

| Format | Layout | Schema | Good for | Weak at |
|---|---|---|---|---|
| **CSV** | rows, text | none | exchange with people and spreadsheets, small exports | types, nested data, size, speed |
| **JSON / JSON Lines** | rows, text | none (self-describing) | APIs, logs, nested data, raw landing zone | size, speed |
| **Avro** | rows, binary | yes, with evolution rules | streaming and Kafka messages, write-heavy | analytics on few columns |
| **Parquet** | columns, binary | yes | analytics, data lakes, warehouses | row-by-row updates, tiny files |
| **ORC** | columns, binary | yes | similar to Parquet, common with Hive | less tool support outside that world |

A common layout: **land raw data as it arrives** (JSON or CSV), then **convert to Parquet** for everything downstream.

## Table formats: Delta Lake, Iceberg, Hudi

A folder of Parquet files is not yet a table: two writers can clash, a reader can see a half-written set of files, and you cannot update or delete a row. **Table formats** add a transaction log on top of Parquet files and give you **ACID transactions, updates and deletes (MERGE), schema evolution and time travel** (query the table as it was yesterday). That combination, cheap files in object storage that behave like warehouse tables, is called a **lakehouse** ([lesson 13](#dataeng-13)).

## Practical rules

- **Partition** large datasets by a column you filter on (usually the date): `orders/day=2026-03-15/part-0.parquet`. Readers skip whole folders.
- **Avoid many tiny files.** Thousands of 10 kB files are slow to list and open; aim for files of roughly 100 MB to 1 GB and compact small ones.
- **Sort** by a commonly filtered column before writing, so the min/max statistics are selective.
- **snappy** is fast with moderate compression; **zstd** is smaller with a little more CPU.
- Do not edit Parquet by hand; rewrite the file or use a table format.

:::try
In the script, change `row_group_size` to 200,000 (one group) and run the filtered read again: all rows are in one group, so nothing can be skipped. Then shuffle the rows before writing (`random.shuffle(rows)`) and look at the `day` statistics: every group now spans the whole month.
:::

## Why is Parquet preferred for analytics?

:::say
Parquet is columnar, so a query reads only the columns it needs; values of one column compress well; and each row group stores min and max statistics, so the reader can skip blocks that cannot match the filter. It also stores the schema. In my test the same data was 10 megabytes as CSV and about 3 as Parquet, and reading one column was many times faster.
:::

## When would you still use a row format?

:::say
For writing records one at a time and reading whole records: Kafka messages in Avro with a schema registry, application logs as JSON lines, and exchanging small files with people as CSV. I land raw data in the format it arrives in and convert to Parquet for analytics.
:::

:::recap
- **Row formats** (CSV, JSON, Avro) suit writing and whole-record reads; **column formats** (Parquet, ORC) suit analytics.
- Parquet wins by **column pruning, compression and predicate pushdown**, and it carries its schema.
- **Partition by date, avoid tiny files, sort before writing.**
- **Delta / Iceberg / Hudi** add transactions, updates and time travel on top of Parquet.
:::

```quiz
? Why is reading one column from Parquet fast?
+ Columns are stored separately, so the other columns are never read
- Parquet is plain text
- It has no compression
- It stores one row per file
! That is column pruning.

? What lets a Parquet reader skip a row group for a filter?
+ Min and max statistics stored for each column in each row group
- The file name
- The CSV header
- Luck
! Predicate pushdown uses the statistics.

? What does a table format such as Delta Lake or Iceberg add to Parquet files?
+ Transactions, updates and deletes, schema evolution and time travel
- A spreadsheet view
- Faster CPUs
- Nothing
! A transaction log turns a folder of files into a reliable table.
```
