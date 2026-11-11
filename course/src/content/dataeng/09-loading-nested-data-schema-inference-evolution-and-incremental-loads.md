---
track: dataeng
title: "Loading nested data: flattening, schema inference, schema evolution and incremental loads"
short: Loading nested data
sub: Turn nested JSON from an API into parent and child tables, create and evolve the schema automatically, load only changes, and see what loading tools automate, including data for AI and LLM applications.
---

:::goals
- flatten nested JSON into a parent table and child tables
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
    yield from fetch_orders(since=updated_at.last_value)      # your API client from lesson 6

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

A **data contract** is an agreement with the source's owners: the fields, types and meaning they promise, and how changes are announced. It turns surprises into planned changes ([lesson 11](#dataeng-11)).

## Loading data for AI and LLM applications

Applications that let a language model answer questions over your documents (retrieval-augmented generation, RAG) need a loading pipeline too, and the same four ideas apply, plus three steps:

1. **Extract** text from documents, tickets, wikis, with their metadata (source, date, permissions).
2. **Chunk** the text into pieces of a few hundred words.
3. **Embed** each chunk (turn it into a vector of numbers) and **load** it into a vector store.

Incremental loading matters even more here, because embedding costs money: only new or changed documents should be re-embedded (compare a content hash), and deleted documents must be removed from the index. The AI side is covered in [embeddings and vector search](#aideep-16) and the AI track; the data engineering side is exactly this lesson: keys, cursors, merges and schema.

:::try
Add a third page containing an order whose `user` has a new nested field `user.tier`. Confirm that a column `user__tier` is added. Then make the loader refuse to load when a value's type differs from the column's type, and print a clear message.
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
