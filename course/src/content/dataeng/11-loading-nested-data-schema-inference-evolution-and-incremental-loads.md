---
track: dataeng
title: "Loading nested data: flattening, schema inference, schema evolution and incremental loads"
short: Loading nested data
sub: Turn nested JSON from an API into parent and child tables, create and evolve the schema automatically, load only changes, and see what loading tools automate, including data for AI and LLM applications.
---

:::goals
- flatten nested JSON into a parent table and child tables
- choose a write disposition (replace, append, merge), replace a table safely, set a schema contract and backfill in chunks
- infer a table schema from the data and evolve it when a new field appears
- load incrementally with a cursor and merge changed records
- say what loading tools (dlt, Airbyte, Fivetran) automate, and what loading data for LLM applications adds
:::

## The idea

APIs return **nested JSON**: an order contains a user object, which contains an address, and a list of items. Databases want **flat tables**. Loading means solving four problems every time:

1. **Flatten** nested objects into columns (`user.address.city` becomes `user__address__city`), and lists into a **child table** linked to the parent by its key.
2. **Infer the schema:** work out column names and types from the data, and create the table.
3. **Evolve the schema:** one day the API adds a field. The load must add a column, not crash and not silently drop the field.
4. **Load incrementally:** fetch and merge only what changed since the last run.

## Run it

Two "pages" from an API. The second contains a brand-new field (`coupon`) and a changed version of order 2.

```run
mkdir -p ~/lab/de/nested && cd ~/lab/de/nested
cat > nested.py <<'EOF'
# Loading nested JSON from an API into tables: flatten, infer the schema, evolve it when a new field appears, and load incrementally.
# Loading tools (for example dlt, Airbyte, Fivetran) automate these four jobs; here they are in plain Python so you can see them.
import json, sqlite3
PAGE_1 = [{"id": 1, "user": {"name": "asha", "address": {"city": "Pune"}}, "items": [{"sku": "kettle", "qty": 1}, {"sku": "mug", "qty": 2}], "updated_at": "2026-03-01T10:00"},
          {"id": 2, "user": {"name": "ben", "address": {"city": "Leeds"}}, "items": [{"sku": "lamp", "qty": 1}], "updated_at": "2026-03-02T09:00"}]
PAGE_2 = [{"id": 3, "user": {"name": "chen", "address": {"city": "Singapore"}}, "items": [], "updated_at": "2026-03-03T12:00", "coupon": "SPRING"},   # a NEW field appears
          {"id": 2, "user": {"name": "ben", "address": {"city": "York"}}, "items": [{"sku": "lamp", "qty": 3}], "updated_at": "2026-03-04T08:00"}]          # id 2 changed
def flatten(obj, prefix=""):
    """{'user': {'address': {'city': 'Pune'}}} -> {'user__address__city': 'Pune'}; lists become child-table rows."""
    row, children = {}, {}
    for k, v in obj.items():
        name = prefix + k
        if isinstance(v, dict): r, c = flatten(v, name + "__"); row.update(r); children.update(c)
        elif isinstance(v, list): children[name] = v
        else: row[name] = v
    return row, children
TYPES = {int: "INTEGER", float: "REAL", str: "TEXT", bool: "INTEGER"}
db = sqlite3.connect(":memory:")
def columns(table): return [r[1] for r in db.execute(f"PRAGMA table_info({table})")]
def load(table, rows, key):
    for row in rows:
        if not columns(table):
            db.execute(f"CREATE TABLE {table} ({', '.join(f'{c} {TYPES[type(v)]}' for c, v in row.items())}, PRIMARY KEY ({key}))"); print(f"   created {table} with columns {list(row)}")
        for c, v in row.items():
            if c not in columns(table): db.execute(f"ALTER TABLE {table} ADD COLUMN {c} {TYPES[type(v)]}"); print(f"   schema evolved: added column {table}.{c}")
        cols = list(row)
        db.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))}) ON CONFLICT({key}) DO UPDATE SET " + ", ".join(f"{c} = excluded.{c}" for c in cols), list(row.values()))
state = {"last_updated_at": ""}                       # the cursor: the newest change we have already loaded
def run(page):
    new = [o for o in page if o["updated_at"] > state["last_updated_at"]]
    print(f"   {len(new)} of {len(page)} records are newer than the cursor {state['last_updated_at'] or '(none)'}")
    for order in new:
        row, children = flatten(order)
        load("orders", [row], "id")
        db.execute("DELETE FROM orders__items WHERE _order_id = ?", (order["id"],)) if columns("orders__items") else None
        load("orders__items", [{"_order_id": order["id"], "_idx": i, **it} for i, it in enumerate(children.get("items", []))], "_order_id, _idx")
    if new: state["last_updated_at"] = max(o["updated_at"] for o in new)
print("load 1:"); run(PAGE_1)
print("load 2 (a new field, and a changed record):"); run(PAGE_2)
print("load 3 (the same page again: nothing to do):"); run(PAGE_2)
for t in ("orders", "orders__items"):
    print(f"\n{t}: {columns(t)}")
    for r in db.execute(f"SELECT * FROM {t} ORDER BY 1, 2"): print("  ", r)
EOF
python3 nested.py
```

What happened:

- **Load 1** created `orders` with flattened columns (`user__name`, `user__address__city`) and a child table `orders__items` with one row per item, linked by `_order_id`.
- **Load 2** met the new `coupon` field and ran `ALTER TABLE ... ADD COLUMN`: the **schema evolved**. Older rows have `None` there. Order 2 was **merged**: its city is now York and its item quantity 3; the child rows were replaced, not duplicated.
- **Load 3** received the same page again. The cursor (`last_updated_at`) showed that nothing was newer: 0 records processed.

## Four decisions every load makes

Flattening and schema inference get data into a table once. Running a load every day needs four more decisions. The script shows each one with a few rows.

```run
mkdir -p ~/lab/de/dispo && cd ~/lab/de/dispo
cat > dispo.py <<'EOF'
# The decisions every loader makes, in plain Python and SQLite: write disposition, how to replace safely,
# what to do when the schema changes (a schema contract), and how to backfill a big table in chunks.
import sqlite3
db = sqlite3.connect(":memory:")
day1 = [(1, "asha", 20.0), (2, "ben", 5.0)]
day2 = [(2, "ben", 6.0), (3, "chen", 12.0)]              # order 2 was corrected, order 3 is new
def rows(t): return db.execute(f"SELECT * FROM {t} ORDER BY 1, 2").fetchall()

print("1) write disposition: what happens to the data already in the table?")
for mode in ("replace", "append", "merge"):
    db.execute(f"DROP TABLE IF EXISTS t_{mode}"); db.execute(f"CREATE TABLE t_{mode} (id INTEGER {'PRIMARY KEY' if mode == 'merge' else ''}, customer TEXT, amount REAL)")
    for batch in (day1, day2):
        if mode == "replace": db.execute(f"DELETE FROM t_{mode}")
        sql = f"INSERT INTO t_{mode} VALUES (?,?,?)" + (" ON CONFLICT(id) DO UPDATE SET customer = excluded.customer, amount = excluded.amount" if mode == "merge" else "")
        db.executemany(sql, batch)
    note = {"replace": "only the last batch survives: right for small tables reloaded in full", "append": "everything kept, order 2 appears twice: right for events that never change", "merge": "one row per key, latest values: right for records that get updated"}[mode]
    print(f"   {mode:8} {rows('t_' + mode)}\n            -> {note}")

print("\n2) replacing safely: load into a staging table, check it, then swap")
db.executescript("CREATE TABLE report (id INTEGER, amount REAL); INSERT INTO report VALUES (1, 20.0), (2, 5.0);")
def swap_in(new_rows):
    db.execute("DROP TABLE IF EXISTS report_staging"); db.execute("CREATE TABLE report_staging (id INTEGER, amount REAL)")
    db.executemany("INSERT INTO report_staging VALUES (?,?)", new_rows)
    n = db.execute("SELECT COUNT(*) FROM report_staging").fetchone()[0]
    if n == 0: return "staging is empty: REFUSED, the old data stays"
    with db: db.execute("DELETE FROM report"); db.execute("INSERT INTO report SELECT * FROM report_staging")     # one transaction: readers never see an empty table
    return f"swapped in {n} rows"
print("   a broken extract returned nothing ->", swap_in([]), "| report still has", len(rows("report")), "rows")
print("   a good extract                    ->", swap_in([(1, 20.0), (2, 6.0), (3, 12.0)]), "| report now has", len(rows("report")), "rows")
print("   (truncate-then-insert is faster, but the table is empty in between and stays empty if the insert fails)")

print("\n3) schema contract: the source sends a new column and a changed type. Four policies:")
KNOWN = {"id": int, "amount": float}
incoming = [{"id": 1, "amount": 20.0}, {"id": 2, "amount": 5.0, "coupon": "SPRING"}, {"id": 3, "amount": "12 EUR"}]
def apply(mode):
    schema, loaded, log = dict(KNOWN), [], []
    for r in incoming:
        new_cols = [k for k in r if k not in schema]; bad_types = [k for k in r if k in schema and not isinstance(r[k], schema[k])]
        if not new_cols and not bad_types: loaded.append(r); continue
        if mode == "evolve":
            for k in new_cols: schema[k] = type(r[k]); log.append(f"added column {k}")
            out = dict(r)
            for k in bad_types: out[k + "__v_text"] = out.pop(k); schema[k + "__v_text"] = str; log.append(f"type change in {k}: kept in a new column {k}__v_text")
            loaded.append(out)
        elif mode == "freeze": return f"STOPPED at id {r['id']}: {'new column ' + new_cols[0] if new_cols else 'type change in ' + bad_types[0]}; nothing from this batch is loaded"
        elif mode == "discard_row": log.append(f"dropped row id {r['id']}")
        elif mode == "discard_value": loaded.append({k: v for k, v in r.items() if k not in new_cols and k not in bad_types}); log.append(f"dropped values {new_cols + bad_types} of id {r['id']}")
    return f"loaded {len(loaded)} rows; " + "; ".join(log)
for mode in ("evolve", "freeze", "discard_row", "discard_value"): print(f"   {mode:14} {apply(mode)}")
print("   evolve suits a raw layer (keep everything, alert a person); freeze suits a table other teams depend on")

print("\n4) backfill: load a large history in chunks, each chunk remembered, so a failure resumes instead of restarting")
history = [(i, f"2026-01-{1 + i // 4:02d}") for i in range(1, 22)]                        # 21 events over six days, sorted by time
db.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, day TEXT)")
cursor, CHUNK, run = "", 8, 0
while True:
    chunk = [e for e in history if e[1] >= cursor][:CHUNK]                                 # >= : re-read the boundary so nothing with the same timestamp is missed
    before = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    db.executemany("INSERT OR IGNORE INTO events VALUES (?,?)", chunk)                     # the overlap is harmless because the load is idempotent
    added = db.execute("SELECT COUNT(*) FROM events").fetchone()[0] - before
    run += 1; print(f"   run {run}: read {len(chunk)} rows from {cursor or 'the start'}, {added} new")
    if added == 0: break
    cursor = chunk[-1][1]
print("   loaded", db.execute("SELECT COUNT(*) FROM events").fetchone()[0], "of", len(history), "events")
EOF
python3 dispo.py
```

### 1. Write disposition: replace, append or merge

The **write disposition** says what happens to data already in the table.

| Disposition | Result in the run | Right for |
|---|---|---|
| **replace** | only the newest batch remains | small tables reloaded in full |
| **append** | everything kept; order 2 appears twice | events that never change: clicks, log lines, payments |
| **merge** (upsert) | one row per key with the latest values | records that are updated: customers, orders, accounts |

Choosing append for data that gets corrected creates duplicates; choosing replace for an incremental extract deletes history. Decide per table.

### 2. Replace safely

The quick way to replace is truncate, then insert. Between those two steps the table is **empty**, and if the insert fails it stays empty. The safer way loads into a **staging table**, checks it, and swaps it in inside one transaction. In the run, an extract that returned nothing was **refused** and the report kept its old rows; a good extract was swapped in. Readers never saw an empty table.

### 3. A schema contract: what to do when the shape changes

A **schema contract** is the rule for data that does not fit the table's known columns and types. Four policies cover most needs:

| Policy | New column | Changed type | Use when |
|---|---|---|---|
| **evolve** | added | kept in a separate "variant" column, so nothing is lost | loading a raw layer: capture everything, then alert a person |
| **freeze** | the load stops | the load stops | other teams depend on the table and a surprise would break them |
| **discard row** | the row is dropped | the row is dropped | a bad record must not enter, and the rest is still wanted |
| **discard value** | the value is dropped, the row loads | same | the extra field is not wanted |

In the run, `amount` arrived as the text `"12 EUR"`. **Evolve** kept it in `amount__v_text` instead of failing or silently converting it; **freeze** stopped the batch at the first surprise. A common arrangement is evolve into the raw layer, **send an alert when a column is added or a type changes**, and freeze the modelled tables downstream. A schema contract checks shape; business rules ("amount is positive") are data quality checks, in [lesson 13](#dataeng-13).

### 4. Backfill in chunks

A pipeline built for one day of data will time out or run out of memory when asked for ten years. **Backfilling** means loading history in manageable chunks, saving the cursor after each chunk, so that a failure resumes from the last chunk instead of starting again. Note the `>=` in the script: each chunk **re-reads the boundary**, because several rows can share the same timestamp and a strict `>` would skip some of them. The overlap costs nothing because the load is idempotent: run 2 read 8 rows and added 7. All 21 events arrive exactly once.

### More that the same thinking covers

- **Incremental loading is three things together:** an incremental *extract* (ask only for what is new), saved *state* (the cursor), and the right *write disposition* (append or merge). If the source cannot filter by date, you still extract everything and let the loader drop what it has already seen.
- **SQL to SQL is easier than API to SQL.** A database table already has a schema and types, so nothing needs inferring; moving the data in a typed, columnar form (Arrow or pandas, [lesson 10](#dataeng-10)) is much faster than row by row.
- **Slowly changing dimensions capture only what you see.** A type 2 history ([lesson 12](#dataeng-12)) built from daily snapshots records one change per day at most. If a value changes three times between two loads, two of the changes are lost. For fast-changing data use change data capture instead.
- **Warehouses load fastest from files.** Loading tools write files to object storage first (a staging area) and tell the warehouse to bulk-load them, instead of sending `INSERT` statements.
- **Tune only when you must.** Loaders work in three steps (extract, normalise, load) with a buffer between them. The buffer size sets memory use and the size of the files written; parallel workers help most on the normalise step, because extract and load are usually limited by the source and the destination. Defaults are sensible: measure before changing them.
- **Deployment is a ladder.** A scheduled job (`cron`, or a scheduled GitHub Actions workflow) is enough for one small pipeline; write a log file, because the job runs at night with nobody watching. Move to an orchestrator such as Airflow or Dagster ([lesson 14](#dataeng-14)) when jobs depend on each other.

## What loading tools do for you

Writing this by hand for every source is repetitive, which is why loading tools exist:

- **dlt** (data load tool): an open-source Python library; you write a function that yields records, and it infers the schema, flattens nested data into child tables, evolves the schema, keeps incremental state and loads to many destinations.
- **Airbyte** (open source) and **Fivetran** (managed): hundreds of ready-made connectors that you configure instead of code.
- **Singer / Meltano:** an open standard for "taps" (sources) and "targets" (destinations).

```term
# Example (not run here): the shape of a dlt pipeline
import dlt

@dlt.resource(primary_key="id", write_disposition="merge")
def orders(updated_at=dlt.sources.incremental("updated_at")):
    yield from fetch_orders(since=updated_at.last_value)      # your API client from lesson 8

pipeline = dlt.pipeline(pipeline_name="shop", destination="duckdb", dataset_name="raw")
print(pipeline.run(orders()))
```

Choose a tool by: is there a connector for your source, how are schema changes handled, can it load incrementally, what does it cost at your volume, and can you run and debug it yourself.

## Schema changes: decide the policy

| Change in the source | Safe reaction |
|---|---|
| New column | add it (as here), and notify the owners downstream |
| Column removed | keep the column, fill NULL, alert |
| Type changed (number becomes text) | do not guess: load into a new variant column or stop and alert |
| Column renamed | looks like one removed and one added; needs a human or a contract |

A **data contract** is an agreement with the source's owners: the fields, types and meaning they promise, and how changes are announced. It turns surprises into planned changes ([lesson 13](#dataeng-13)).

## Loading data for AI and LLM applications

Applications that let a language model answer questions over your documents (retrieval-augmented generation, RAG) need a loading pipeline too, and the same four ideas apply, plus three steps:

1. **Extract** text from documents, tickets, wikis, with their metadata (source, date, permissions).
2. **Chunk** the text into pieces of a few hundred words.
3. **Embed** each chunk (turn it into a vector of numbers) and **load** it into a vector store.

Incremental loading matters even more here, because embedding costs money: only new or changed documents should be re-embedded (compare a content hash), and deleted documents must be removed from the index. The AI side is covered in [embeddings and vector search](#aideep-16) and the AI track; the data engineering side is exactly this lesson: keys, cursors, merges and schema.

:::try
Add a third page containing an order whose `user` has a new nested field `user.tier`. Confirm that a column `user__tier` is added. Then make the loader refuse to load when a value's type differs from the column's type, and print a clear message.
:::

## Using an AI assistant to draft a pipeline

Language models are good at the repetitive part of this work: reading an API's documentation and drafting the extractor. A workable routine:

1. Give the assistant the API's documentation for the endpoints you need, especially **authentication, pagination and rate limits**, and say which destination and write disposition you want.
2. Ask for a small pipeline and **read every line**. Check the pagination and the incremental cursor yourself; these are where drafts are most often wrong.
3. Run it on one page of data, then compare row counts with the source.
4. Keep secrets out of the conversation and out of the code.

The assistant saves typing. It does not know whether the numbers are right; that remains your job.

## What is a write disposition, and how do you choose one?

:::say
It defines what a load does with existing data: replace overwrites the table, append adds rows, and merge updates rows that match a key and inserts the rest. I use replace for small tables loaded in full, append for immutable events, and merge for records that change. For replace I load into a staging table and swap, so readers never see an empty or half-loaded table.
:::

## How do you handle schema changes from a source?

:::say
I decide a policy per kind of change. New columns are added automatically and announced. Removed columns are kept and filled with NULL with an alert. Type changes are not guessed: the load stops or writes to a separate column. For important sources I agree a data contract with the owners so changes are announced, and I keep the raw data so I can re-process after a change.
:::

## How do you load nested JSON into a relational table?

:::say
I flatten nested objects into columns with a path-style name, and turn arrays into child tables that carry the parent's key and a position. The parent is merged on its primary key, and the children of a changed parent are replaced. Tools like dlt do this automatically, with schema inference and incremental state.
:::

:::recap
- Loading = **flatten, infer schema, evolve schema, load incrementally**.
- Objects become columns; lists become **child tables** with the parent key.
- Merge on the primary key; keep a **cursor**; re-running does nothing.
- Loading tools (dlt, Airbyte, Fivetran) automate this; know what they do underneath.
- LLM pipelines add **chunk, embed, load to a vector store**, and need incremental loads to control cost.
:::

```quiz
? A list of items inside each order is best loaded as:
+ A child table with one row per item and the parent order's key
- One text column containing the list
- Ten columns item1 to item10
- It should be dropped
! That keeps the data queryable and normalised.

? The source adds a new field. What should a robust loader do?
+ Add a column for it and continue, notifying downstream owners
- Crash every night
- Silently ignore the field forever
- Delete the table
! Schema evolution without data loss.

? Why is incremental loading especially important for an LLM document pipeline?
+ Embedding costs money and time, so only changed documents should be re-embedded
- LLMs cannot read old documents
- Vector stores reject full loads
- It is not important
! Compare a content hash and re-embed only what changed.
```
