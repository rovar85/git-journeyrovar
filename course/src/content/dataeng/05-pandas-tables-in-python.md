---
track: dataeng
title: "pandas: tables in Python"
short: pandas
sub: Load, inspect, clean, filter, add columns, group, join and pivot a table with pandas, see why column operations beat loops, and know when pandas is the wrong tool.
---

:::goals
- load a CSV into a DataFrame and inspect it
- clean text, remove duplicates and handle missing values
- filter, add columns, group, join and pivot
- explain vectorised operations and the memory limit of pandas
:::

:::note Before this lesson
`pandas` is a separate package: `pip install pandas` on your computer. The browser lab loads it automatically the first time (it needs internet and takes a few seconds). Videos: [Learn Pandas in 30 Minutes (Tech With Tim)](https://www.youtube.com/watch?v=EXIgjIBu4EU) and [Complete Python Pandas Data Science Tutorial (Keith Galli)](https://www.youtube.com/watch?v=2uvysYbKdjM).
:::

## The idea

**pandas** gives Python a table type, the **DataFrame**: rows and named columns, like a spreadsheet or a SQL table that lives in memory. One column is a **Series**. You describe operations on whole columns ("multiply the amount column by 1.2") instead of writing loops, and pandas runs them in fast compiled code. If you know SQL, you already know the ideas:

| SQL | pandas |
|---|---|
| `SELECT a, b` | `df[["a", "b"]]` |
| `WHERE amount > 10 AND status = 'paid'` | `df[(df["amount"] > 10) & (df["status"] == "paid")]` |
| `GROUP BY c` + `SUM(x)` | `df.groupby("c").agg(total=("x", "sum"))` |
| `JOIN ... ON key` | `df.merge(other, on="key", how="left")` |
| `ORDER BY x DESC` | `df.sort_values("x", ascending=False)` |
| `DISTINCT` | `df.drop_duplicates()` |

## Run it

```run
mkdir -p ~/lab/de/pd1 && cd ~/lab/de/pd1
cat > pd1.py <<'EOF'
# pandas in one sitting: load, inspect, clean, filter, add columns, group, join, reshape, save.
import io
import pandas as pd
orders_csv = """order_id,customer,amount,status,ordered_at
1001,asha,19.99,paid,2026-03-01 09:15
1002,Ben ,5.00,paid,2026-03-01 10:02
1003,asha,,paid,2026-03-02 08:00
1004,chen,120.00,refunded,2026-03-02 11:30
1002,Ben ,5.00,paid,2026-03-01 10:02
1005,dee,42.50,paid,2026-03-03 14:45
1006,asha,61.00,paid,2026-03-03 16:20
"""
customers = pd.DataFrame({"customer": ["asha", "ben", "chen"], "country": ["IN", "UK", "SG"]})
df = pd.read_csv(io.StringIO(orders_csv), parse_dates=["ordered_at"])
print("1) inspect: shape", df.shape, "| missing values per column:", df.isna().sum().to_dict())
print(df.head(3).to_string(index=False))

df["customer"] = df["customer"].str.strip().str.lower()            # clean text
df = df.drop_duplicates(subset="order_id")                         # remove the repeated order
df = df.dropna(subset=["amount"])                                  # or fill: df["amount"].fillna(0)
print("\n2) after cleaning:", df.shape[0], "rows")

paid = df[(df["status"] == "paid") & (df["amount"] > 10)]         # filter rows: note & and the brackets
print("\n3) paid orders over 10:")
print(paid[["order_id", "customer", "amount"]].to_string(index=False))

df = df.assign(day=df["ordered_at"].dt.date, amount_with_tax=(df["amount"] * 1.2).round(2))   # new columns, no loop
summary = (df[df["status"] == "paid"].groupby("customer")
             .agg(orders=("order_id", "count"), revenue=("amount", "sum"), biggest=("amount", "max"))
             .sort_values("revenue", ascending=False).reset_index())
print("\n4) group by customer:")
print(summary.to_string(index=False))

joined = df.merge(customers, on="customer", how="left", indicator=True)     # like a SQL LEFT JOIN
print("\n5) left join with customers (dee has no match, so country is missing):")
print(joined[["order_id", "customer", "country", "_merge"]].to_string(index=False))

pivot = df.pivot_table(index="day", columns="status", values="amount", aggfunc="sum", fill_value=0)
print("\n6) pivot: revenue by day and status")
print(pivot.to_string())

big = pd.DataFrame({"n": range(200_000)})
import time
t = time.perf_counter(); slow = [x * 2 for x in big["n"]]; t1 = time.perf_counter() - t
t = time.perf_counter(); fast = big["n"] * 2; t2 = time.perf_counter() - t
print(f"\n7) vectorised operations beat Python loops: loop {t1 * 1000:.1f} ms, column operation {t2 * 1000:.1f} ms")
df.to_csv("orders_clean.csv", index=False); print("saved orders_clean.csv with", len(df), "rows")
EOF
python3 pd1.py
```

Step by step:

1. **Inspect first.** `shape` is (7, 5): 7 rows, 5 columns. `isna().sum()` shows one missing amount. Other first looks: `df.info()`, `df.describe()`, `df.dtypes`.
2. **Clean.** `.str.strip().str.lower()` fixes `Ben `; `drop_duplicates(subset="order_id")` removes the repeated order; `dropna(subset=["amount"])` removes the row without an amount. 5 rows remain. Dropping is a decision: sometimes you fill (`fillna`) or reject to a separate file instead.
3. **Filter** with a boolean condition. Each condition needs its own brackets, and you use `&` (and), `|` (or), `~` (not), not the words `and`/`or`.
4. **Group.** Named aggregation gives readable column names: asha has 2 paid orders worth 80.99.
5. **Join.** `merge(..., how="left", indicator=True)` adds a `_merge` column showing which rows found a match. Dee is `left_only`: a cheap, valuable check after every join.
6. **Pivot** turns values of one column (status) into columns.
7. **Vectorised.** Doubling 200,000 numbers with a column operation is several times faster than a Python loop (the exact times vary by machine). Avoid `for` loops and `df.apply(..., axis=1)` over rows when a column operation exists.

:::note Versions
The output above was recorded with pandas 3. The browser lab has pandas 2.2, where a missing text value prints the same (`NaN`) but text columns report the type `object` instead of `str`. The code in this lesson works on both.
:::

## Things that bite

- **Types.** A column of numbers with one bad value becomes text. Check `df.dtypes`; convert with `pd.to_numeric(col, errors="coerce")` (bad values become missing) and `pd.to_datetime`.
- **Missing values** are `NaN`/`NA` and, as in SQL, are not equal to anything. Use `isna()`.
- **Joins multiply rows** if the key repeats on the right side. Compare `len(df)` before and after, or pass `validate="many_to_one"` to `merge` to make pandas check for you.
- **Chained assignment.** Write `df.loc[mask, "col"] = value`, not `df[mask]["col"] = value`.
- **Memory.** pandas holds the whole table in RAM, often several times the file size. A 10 GB CSV does not fit on a laptop.

## When pandas is the wrong tool

- **Bigger than memory:** read in chunks (`pd.read_csv(path, chunksize=100_000)`), or use an engine that streams or works on disk: **DuckDB**, **Polars**, or Spark ([lesson 13](#dataeng-13)).
- **The data is already in a database or warehouse:** do the work there in SQL and bring back only the result.
- **Production pipelines on large tables:** SQL in the warehouse ([lesson 15](#dataeng-15)) or Spark; pandas is best for small and medium data, exploration, and glue code.

:::try
Using the script: (a) instead of dropping the row with the missing amount, fill it with the average amount of that customer; (b) add a column `size` that is "large" when the amount is above 50, otherwise "small" (hint: `df["amount"].gt(50).map({True: "large", False: "small"})`); (c) count orders per `size`.
:::

## When would you use pandas, and when not?

:::say
pandas is right for data that fits in memory: exploration, small and medium transformations, and glue between systems. It keeps everything in RAM and uses one CPU core, so for larger data I push the work into the warehouse with SQL, or use DuckDB, Polars or Spark, and in pandas I prefer column operations over row loops.
:::

:::recap
- A **DataFrame** is an in-memory table; operate on whole columns, not row loops.
- Inspect (`shape`, `dtypes`, `isna`), clean (`str`, `drop_duplicates`, `dropna`/`fillna`), then filter, group, merge, pivot.
- After a merge, check row counts and `_merge`.
- pandas is limited by **memory**; use chunks, SQL, DuckDB, Polars or Spark for bigger data.
:::

```quiz
? Which expression filters paid orders over 10?
+ df[(df["status"] == "paid") & (df["amount"] > 10)]
- df[df["status"] == "paid" and df["amount"] > 10]
- df.filter("paid", 10)
- df.where(status="paid")
! Use & with brackets around each condition.

? What does indicator=True add to a merge?
+ A _merge column showing whether each row matched both sides or only one
- An index
- A progress bar
- A checksum
! It is a quick check for unmatched rows.

? What is the main limit of pandas?
+ The whole table must fit in memory
- It cannot read CSV
- It has no joins
- It only works on Windows
! For larger data use chunks, SQL engines or Spark.
```
