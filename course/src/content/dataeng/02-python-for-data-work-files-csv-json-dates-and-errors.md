---
track: dataeng
title: "Python for data work: files, CSV, JSON, dates and errors"
short: Python for data
sub: Read a messy file one row at a time, clean and validate each row, keep the rejects with a reason, and write clean output, using only the standard library.
---

:::goals
- read and write CSV and JSON files safely with the standard library
- use a generator to process a file of any size with little memory
- parse dates and numbers defensively, and handle the errors
- keep rejected rows with a reason instead of dropping them silently
:::

:::note Before this lesson
You need basic Python: variables, lists, dictionaries, loops and functions. If those are new, do the [Python track](#ch15) first.
:::

## The idea

Almost every data job begins the same way: **a file arrives, and it is not as clean as promised.** Amounts are missing, a date uses another format, a row appears twice, a name has a trailing space. A data engineer's first skill is to read such a file **without crashing, without losing rows silently, and without loading it all into memory.**

## The tools from the standard library

| Need | Tool | Why |
|---|---|---|
| Paths and folders | `pathlib.Path` | Works on every operating system; `Path("raw") / "orders.csv"` |
| CSV | `csv.DictReader`, `csv.DictWriter` | Handles quotes and commas inside fields; never split lines by hand |
| JSON | `json.loads`, `json.dumps` | One call each way |
| Dates and times | `datetime.strptime`, `timezone.utc` | Turn text into a real date; always store UTC |
| Big files | a **generator** (`yield`) | Gives one row at a time, so memory stays small |
| Things that go wrong | `try` / `except` | Catch the specific error, record it, continue |

**CSV** (comma-separated values) is a text file with one record per line. **JSON Lines** (`.jsonl`) is a text file with one JSON object per line; it is popular for logs and for loading because each line can be read on its own.

## Run it

The script creates a small messy file, then cleans it. Read the comments first, then run it.

```run
mkdir -p ~/lab/de/files && cd ~/lab/de/files
cat > files.py <<'EOF'
# Python for data work: read messy files safely, one row at a time, and write clean ones.
import csv, json, io
from datetime import datetime, timezone
from pathlib import Path

raw = Path("raw"); raw.mkdir(exist_ok=True)
(raw / "orders.csv").write_text(
    "order_id,customer,amount,ordered_at\n"
    "1001,asha,19.99,2026-03-01 09:15:00\n"
    "1002,Ben ,5.00,2026-03-01 10:02:11\n"
    "1003,asha,,2026-03-02 08:00:00\n"          # missing amount
    "1004,chen,abc,2026-03-02 11:30:00\n"       # not a number
    "1002,Ben ,5.00,2026-03-01 10:02:11\n"      # duplicate row
    "1005,dee,42.50,02/03/2026\n")              # different date format

def parse_time(text):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
        try: return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError: pass
    raise ValueError(f"unknown date format: {text!r}")

def read_orders(path):                 # a generator: yields one row at a time, so a 50 GB file needs little memory
    with open(path, newline="", encoding="utf-8") as f:
        for line_no, row in enumerate(csv.DictReader(f), start=2):
            yield line_no, row

good, bad, seen = [], [], set()
for line_no, row in read_orders(raw / "orders.csv"):
    try:
        rec = {"order_id": int(row["order_id"]), "customer": row["customer"].strip().lower(),
               "amount": float(row["amount"]), "ordered_at": parse_time(row["ordered_at"]).isoformat()}
        if rec["order_id"] in seen: raise ValueError("duplicate order_id")
        seen.add(rec["order_id"]); good.append(rec)
    except (ValueError, KeyError) as e:
        bad.append({"line": line_no, "error": str(e), "row": row})

out = Path("clean"); out.mkdir(exist_ok=True)
with open(out / "orders.jsonl", "w", encoding="utf-8") as f:      # JSON Lines: one JSON object per line
    for rec in good: f.write(json.dumps(rec) + "\n")
(out / "rejects.json").write_text(json.dumps(bad, indent=1))

print(f"read {len(good) + len(bad)} rows: {len(good)} good, {len(bad)} rejected\n")
print("good rows:")
for rec in good: print("  ", rec)
print("\nrejected rows (kept, with a reason, never silently dropped):")
for b in bad: print(f"   line {b['line']}: {b['error']}")
total = sum(r["amount"] for r in good)
print(f"\ntotal amount of good rows: {total:.2f}")
EOF
python3 files.py
```

What happened:

- **6 rows read, 3 good, 3 rejected.** The total of the good rows is 67.49.
- Line 4 had an empty amount and line 5 had `abc`: `float()` raised `ValueError`, which the `except` caught and recorded.
- Line 6 was the same order again: the `seen` set detected the duplicate key.
- `Ben ` became `ben`: `.strip().lower()` normalises text so `Ben`, `ben ` and `BEN` are one customer.
- The last row used a different date format; `parse_time` tries each known format and gives a clear error for an unknown one. All times are stored as **UTC in ISO 8601** (`2026-03-02T00:00:00+00:00`), the format every system understands.
- Rejects were written to `rejects.json` **with the line number and the reason.** Someone can now fix the source.

## Why a generator?

`read_orders` uses `yield`, so it hands back one row and pauses. A normal function that returns a list would load the whole file into memory first. With a generator, a 50 GB file needs about as much memory as one row. This "one piece at a time" idea is called **streaming** and returns in almost every later lesson.

## Rules worth keeping

1. **Never trust input.** Validate types, required fields and ranges at the door.
2. **Never drop bad rows silently.** Count them, keep them, give the reason. A pipeline that "succeeds" while losing 10% of rows is worse than one that fails.
3. **Catch specific errors** (`ValueError`, `KeyError`), not a bare `except:`, which also hides your own bugs.
4. **Always give an encoding** (`encoding="utf-8"`) and `newline=""` when opening CSV files.
5. **Store times in UTC**; convert to local time only for display.
6. **Money is not a float** in real systems. Use integer cents or `decimal.Decimal`; `0.1 + 0.2` is not exactly `0.3` in floating point.

```run
python3 -c "print(0.1 + 0.2); from decimal import Decimal; print(Decimal('0.1') + Decimal('0.2'))"
```

:::try
Add a row with a negative amount to the file and make the script reject it with the reason "amount must be positive". Then add a third date format (`2026-03-04T10:00:00`) to `parse_time`.
:::

## What is the difference between a list and a generator, and when do you use each?

:::say
A list holds every item in memory at once; a generator produces one item at a time and remembers where it stopped. For data files I use generators so memory use does not grow with file size, and I only build a list when I need to go over the data more than once or need its length.
:::

## How do you handle bad records in a file?

:::say
I validate each row, and rows that fail go to a reject file or table with the line number and the reason, never dropped silently. I count good and bad rows, log both, and fail the job if the reject rate is above an agreed threshold, because a pipeline that silently loses data is worse than one that stops.
:::

:::recap
- Use `csv`, `json`, `pathlib` and `datetime` from the standard library; do not parse by hand.
- **Generators** process files of any size.
- **Validate, catch specific errors, keep rejects with a reason, count everything.**
- Store times in **UTC ISO 8601**; do not use floats for money in real systems.
:::

```quiz
? Why does the script use a generator to read the file?
+ It yields one row at a time, so memory use stays small for any file size
- Generators are required by the csv module
- It makes the file smaller
- It sorts the rows
! A list would hold the whole file in memory.

? What should happen to a row that fails validation?
+ It is kept in a reject output with a reason and counted
- It is deleted silently
- The program should always crash at once
- It is loaded anyway
! Silent data loss is the worst outcome.

? Why store timestamps in UTC?
+ One unambiguous time for every system; convert to local time only for display
- UTC files are smaller
- Python cannot parse other zones
- Databases reject local times
! Mixed time zones and daylight-saving changes cause duplicate and missing hours.
```
