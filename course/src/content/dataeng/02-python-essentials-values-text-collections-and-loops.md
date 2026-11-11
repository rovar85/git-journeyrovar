---
track: dataeng
title: "Python essentials 1: values, text, collections, decisions and loops"
short: Python essentials 1
sub: The Python a data engineer uses every hour, from variables and types to cleaning text, the four collections, if statements, loops and comprehensions, all on small order records you run yourself.
---

:::goals
- store values in variables and tell the basic types apart: int, float, str, bool, None
- convert between types, and clean, split, slice and format text
- choose between a list, a tuple, a set and a dictionary
- make decisions with if / elif / else and repeat work with for and while, including break, continue and enumerate
- build lists and dictionaries in one line with comprehensions
:::

:::note Before this lesson
No programming experience is needed. If computers and the terminal are new to you, do [Start here](#start-1) first. For a slower walk through the same ideas with a step-by-step code player, see the [Python track](#ch15).
:::

## Why Python, and how to run it

Python is the most used language in data work because it reads almost like English, and because nearly every data tool (pandas, Spark, Airflow, dbt) is driven from it. A Python program is a text file ending in `.py`; you run it with `python3 file.py`, and it executes from the top line down.

Each numbered part of the program below is explained underneath it. Run it first, then read the explanation with the output in front of you.

```run
mkdir -p ~/lab/de/basics1 && cd ~/lab/de/basics1
cat > basics1.py <<'EOF'
# Python essentials, part 1: values, text, collections, decisions and loops, on a small set of messy order records.

# --- 1. variables and types ---
order_id = 1001                 # int: a whole number
amount = 19.99                  # float: a number with a decimal point
customer = "  Asha Rao "        # str: text (note the stray spaces)
paid = True                     # bool: True or False
coupon = None                   # None: "no value here"
print("1) types:", type(order_id).__name__, type(amount).__name__, type(customer).__name__, type(paid).__name__, type(coupon).__name__)

# --- 2. type casting: data from files and APIs arrives as text ---
raw_amount = "42.50"
print("2) text + text:", raw_amount + raw_amount, "| as numbers:", float(raw_amount) + float(raw_amount), "| int('7') + 1 =", int("7") + 1)

# --- 3. cleaning text ---
clean = customer.strip().lower()
print("3) cleaned:", repr(clean), "| title case:", clean.title(), "| replace:", clean.replace(" ", "_"), "| starts with 'a':", clean.startswith("a"))
email = "Asha.Rao@Example.COM"
user, domain = email.lower().split("@")
print("   split an email:", user, "|", domain, "| contains 'example':", "example" in domain, "| length:", len(email))

# --- 4. slicing: text[start:stop:step], counting from 0, stop is not included ---
code = "ORD-2026-03-IN"
print("4) first 3:", code[:3], "| year:", code[4:8], "| last 2:", code[-2:], "| reversed:", code[::-1])

# --- 5. f-strings and rounding ---
print(f"5) Order {order_id} for {clean.title()} costs {amount:.2f} (with 18% tax: {amount * 1.18:.2f}); 7 // 2 = {7 // 2}, 7 % 2 = {7 % 2}, 2 ** 10 = {2 ** 10}")

# --- 6. the four collections ---
amounts = [19.99, 5.0, 120.0, 5.0]                       # list: ordered, can change, allows duplicates
amounts.append(42.5); amounts.sort()
point = (18.52, 73.86)                                    # tuple: ordered, cannot change (a fixed record)
countries = {"IN", "UK", "IN", "SG"}                      # set: no duplicates, no order
order = {"id": 1001, "customer": "asha", "amount": 19.99} # dict: key -> value (this is what JSON becomes)
order["status"] = "paid"
print("6) list:", amounts, "| biggest:", max(amounts), "| sum:", sum(amounts), "| count of 5.0:", amounts.count(5.0))
print("   tuple:", point, "| set:", sorted(countries), "| dict keys:", list(order), "| safe lookup of a missing key:", order.get("coupon", "none"))
print("   set maths: {IN, UK} & {UK, SG} =", {"IN", "UK"} & {"UK", "SG"}, "| union =", sorted({"IN", "UK"} | {"UK", "SG"}))

# --- 7. decisions ---
def size(a):
    if a >= 100: return "large"
    elif a >= 20: return "medium"
    else: return "small"
print("7) sizes:", [size(a) for a in amounts], "| and/or/not:", amount > 10 and paid, amount > 100 or paid, not paid)

# --- 8. loops: for, enumerate, continue, break, while ---
rows = ["1001,asha,19.99", "1002,ben,", "1003,chen,abc", "STOP", "1004,dee,7.00"]
total = 0
for line_no, row in enumerate(rows, start=1):
    if row == "STOP": print(f"   line {line_no}: stop marker, leaving the loop (break)"); break
    parts = row.split(",")
    if parts[2] == "": print(f"   line {line_no}: no amount, skipped (continue)"); continue
    if not parts[2].replace(".", "").isdigit(): print(f"   line {line_no}: {parts[2]!r} is not a number, skipped"); continue
    total += float(parts[2])
print("8) total of the valid rows:", total)
attempts = 0
while attempts < 3: attempts += 1
print("   while loop ran", attempts, "times")

# --- 9. comprehensions: build a list, set or dict in one line ---
orders = [{"id": 1, "country": "IN", "amount": 20.0}, {"id": 2, "country": "UK", "amount": 5.0}, {"id": 3, "country": "IN", "amount": 35.5}]
big = [o["id"] for o in orders if o["amount"] > 10]
by_id = {o["id"]: o["amount"] for o in orders}
per_country = {}
for o in orders: per_country[o["country"]] = per_country.get(o["country"], 0) + o["amount"]
print("9) ids over 10:", big, "| lookup table:", by_id, "| total per country:", per_country)
EOF
python3 basics1.py
```

## 1. Variables and types

A **variable** is a name for a value: `amount = 19.99` means "from now on, `amount` stands for 19.99". The single `=` **assigns**; it does not ask a question. Every value has a **type**, and the type decides what you can do with it.

| Type | Example | Meaning |
|---|---|---|
| `int` | `1001` | whole number |
| `float` | `19.99` | number with a decimal point |
| `str` | `"Asha"` | text (a "string" of characters), in quotes |
| `bool` | `True`, `False` | yes or no |
| `NoneType` | `None` | deliberately empty: "no value here" |

Names are written in lower case with underscores (`order_id`). A `#` starts a **comment**: a note for humans that Python ignores.

## 2. Type casting

Everything read from a file, a web form or an API arrives as **text**. `"42.50" + "42.50"` glues the two texts together into `42.5042.50`; only after converting with `float(...)` do you get 85.0. Converting a value to another type is called **casting**: `int("7")`, `float("42.50")`, `str(1001)`. Forgetting to cast is the most common beginner bug in data code, and `int("abc")` raises an error, which [part 2](#dataeng-3) teaches you to catch.

## 3. Cleaning text

Real data is full of stray spaces and mixed capitals. String **methods** are tools attached to every piece of text, written after a dot:

| Method | Does | Example result |
|---|---|---|
| `.strip()` | removes spaces at both ends | `"  Asha Rao "` becomes `"Asha Rao"` |
| `.lower()`, `.upper()`, `.title()` | changes capitals | `"asha rao"`, `"ASHA RAO"`, `"Asha Rao"` |
| `.replace(a, b)` | swaps text | `"asha_rao"` |
| `.split(sep)` | cuts into a list | `"a@b.com".split("@")` gives `["a", "b.com"]` |
| `sep.join(list)` | glues a list back together | `"-".join(["a", "b"])` gives `"a-b"` |
| `.startswith()`, `in` | tests | `True` or `False` |
| `len(text)` | counts characters | `20` |

Methods return a **new** string; the original is not changed, so you chain them: `customer.strip().lower()`.

## 4. Slicing

`text[start:stop]` cuts out a piece. Counting starts at **0**, and `stop` is not included, so `code[4:8]` takes positions 4, 5, 6 and 7: the year. Leaving a side empty means "from the beginning" or "to the end"; negative numbers count from the end (`code[-2:]` is the last two characters). A third number is the step: `[::-1]` walks backwards. The same slicing works on lists.

## 5. f-strings and arithmetic

An **f-string** (`f"..."`) puts values straight into text inside curly brackets, with optional formatting: `{amount:.2f}` means two decimal places. The arithmetic operators are `+ - * /`, plus three worth remembering: `//` whole-number division, `%` remainder (useful for "every 100th row"), and `**` power.

## 6. The four collections

| Collection | Written | Ordered? | Can change? | Duplicates? | Use it for |
|---|---|---|---|---|---|
| **list** | `[5.0, 19.99]` | yes | yes | yes | rows, values in sequence |
| **tuple** | `(18.52, 73.86)` | yes | no | yes | a fixed record, such as coordinates |
| **set** | `{"IN", "UK"}` | no | yes | no | distinct values, fast "is it in here?" |
| **dictionary** | `{"id": 1001}` | by insertion | yes | keys are unique | one record with named fields; lookups |

- The list gained a value with `.append()` and was put in order with `.sort()`. `max`, `sum`, `len` and `.count()` work on it.
- The set was written with `"IN"` twice and holds it once. Sets do maths: `&` is "in both", `|` is "in either".
- A **dictionary** maps **keys** to **values**. It is the most important type for a data engineer, because a JSON record from an API becomes exactly this. `order["status"] = "paid"` adds a field. `order["coupon"]` on a missing key raises an error; `order.get("coupon", "none")` returns a default instead.

## 7. Decisions

`if` runs a block only when a condition is true; `elif` ("else if") tries the next condition; `else` catches everything left. The block is marked by **indentation** (four spaces), which is part of Python's grammar, not decoration. Comparisons are `== != > >= < <=`. Note the double `==` for "is equal to"; a single `=` assigns. Conditions combine with `and`, `or`, `not`.

## 8. Loops

- `for row in rows:` runs the block once for each item.
- `enumerate(rows, start=1)` also hands you a counter, here the line number.
- `continue` skips to the next item (a row with no amount); `break` leaves the loop completely (the stop marker).
- `while condition:` repeats as long as the condition holds, used when you do not know the number of rounds in advance, such as retrying a request.

The loop validated five rows: one was added to the total (19.99), two were skipped with a reason, and the loop stopped at the marker, so the last row was never read.

## 9. Comprehensions

A **comprehension** builds a collection in one line: `[o["id"] for o in orders if o["amount"] > 10]` reads "the id of every order whose amount is over 10". The same shape with curly brackets and a colon builds a dictionary. The last three lines of the program show the pattern behind every "total per group": a dictionary that accumulates with `.get(key, 0) + value`. SQL's `GROUP BY` and pandas' `groupby` do the same job for you later.

## Common mistakes

| Mistake | What you see | Fix |
|---|---|---|
| `=` where `==` was meant | `SyntaxError` | `==` compares |
| Wrong indentation | `IndentationError` | four spaces, consistently |
| Adding text and a number | `TypeError: can only concatenate str` | cast: `str(n)` or use an f-string |
| Position that does not exist | `IndexError: list index out of range` | positions run from 0 to `len - 1` |
| Missing dictionary key | `KeyError` | `.get(key, default)` |
| Changing a list while looping over it | skipped items | build a new list with a comprehension |

:::try
1. Change `raw_amount` to `"abc"` and run: read the error message carefully. 2. From `code`, slice out the month (`03`). 3. Add an order for `"UK"` worth 80 to `orders` and predict the three results of part 9 before running. 4. Write a comprehension that produces every customer name in upper case from `["asha", "ben", "chen"]`.
:::

## What is the difference between a list, a tuple, a set and a dictionary?

:::say
A list is an ordered collection I can change; a tuple is ordered but fixed, good for a record that must not change; a set holds unique values with no order and is fast for membership tests and removing duplicates; a dictionary maps keys to values, which is how I represent one record and how I build lookup tables. JSON objects become dictionaries and JSON arrays become lists.
:::

## What is a list comprehension, and when would you avoid it?

:::say
It builds a list in one expression, a value, a loop and an optional filter, for example the ids of all orders over ten pounds. It is shorter and usually faster than a loop with append. I avoid it when the logic needs several steps or error handling, because a plain loop is then easier to read.
:::

:::recap
- A **variable** names a value; every value has a **type**; data arrives as text and must be **cast**.
- Clean text with **methods** (`strip`, `lower`, `split`, `replace`), cut it with **slices**, format it with **f-strings**.
- **list** (ordered, changeable), **tuple** (fixed), **set** (unique), **dict** (key to value; JSON's shape).
- **if / elif / else** decide; **for** and **while** repeat; **break** leaves, **continue** skips, **enumerate** counts.
- **Comprehensions** build collections in one line.
:::

```quiz
? What does "42.50" + "42.50" give in Python?
+ The text "42.5042.50", because both are strings
- 85.0
- An error
- 42.5
! Cast with float() first to add them as numbers.

? Which collection would you use to hold one order with named fields such as id, customer and amount?
+ A dictionary
- A set
- A tuple of tuples
- A string
! Keys name the fields, and it is the shape JSON takes.

? In a loop over rows, what does continue do?
+ Skips the rest of this round and moves to the next row
- Stops the whole loop
- Restarts the loop from the first row
- Ends the program
! break is the one that leaves the loop.

? What does "ORD-2026-03-IN"[4:8] return?
+ 2026
- -202
- 2026-
- ORD-
! Counting starts at 0 and the stop position is not included.

? Which expression gets the value of a key that might be missing, without an error?
+ order.get("coupon", "none")
- order["coupon"]
- order.coupon
- order("coupon")
! .get returns the default when the key is absent.
```
