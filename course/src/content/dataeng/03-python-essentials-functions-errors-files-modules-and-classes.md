---
track: dataeng
title: "Python essentials 2: functions, errors, files, modules and classes"
short: Python essentials 2
sub: Package work into functions, handle the errors real data causes, read and write files, use modules and virtual environments, and organise larger code with classes and inheritance.
---

:::goals
- write functions with parameters, default values and return values, and explain scope
- use lambda with map, filter, reduce and sorted, and know when a comprehension is clearer
- handle errors with try / except / else / finally and raise your own
- read and write text and JSON files safely with `with`
- import modules, install packages into a virtual environment, and read a class with inheritance
:::

:::note Before this lesson
You need [Python essentials 1](#dataeng-2).
:::

```run
mkdir -p ~/lab/de/basics2 && cd ~/lab/de/basics2
cat > basics2.py <<'EOF'
# Python essentials, part 2: functions, lambda, map/filter/reduce, errors, files, modules and classes.
import json, math, os, time
from datetime import datetime, timedelta
from functools import reduce

# --- 1. functions: name a piece of work once, use it many times ---
def with_tax(amount, rate=0.18):                 # rate has a default value
    """Return the amount including tax, rounded to 2 places."""
    return round(amount * (1 + rate), 2)
print("1)", with_tax(100), with_tax(100, 0.05), with_tax(rate=0.2, amount=50))
def stats(values): return min(values), max(values), sum(values) / len(values)      # returns three values as a tuple
low, high, mean = stats([20, 5, 35])
print("   min, max, mean:", low, high, mean)

# --- 2. scope: a variable made inside a function stays inside ---
rate = 0.18
def change(): rate = 0.5; return rate                    # this is a NEW local variable; the outer one is untouched
print("2) inside:", change(), "| outside is still:", rate)

# --- 3. lambda, map, filter, reduce, sorted with a key ---
amounts = [20.0, 5.0, 35.5, 80.0]
print("3) map:", list(map(lambda a: a * 2, amounts)), "| filter:", list(filter(lambda a: a > 10, amounts)), "| reduce:", reduce(lambda x, y: x + y, amounts))
people = [("chen", 12.0), ("asha", 55.5), ("ben", 80.0)]
print("   sorted by amount, biggest first:", sorted(people, key=lambda p: p[1], reverse=True))
print("   the same map and filter as a comprehension:", [a * 2 for a in amounts if a > 10])

# --- 4. errors: try / except / else / finally ---
def to_number(text):
    try:
        value = float(text)
    except ValueError as e:
        print(f"   could not convert {text!r}: {e}"); return None
    else:
        return value                                     # runs only if there was no error
    finally:
        pass                                             # always runs: the place to close files and connections
print("4)", to_number("42.5"), to_number("abc"))
try: {"id": 1}["amount"]
except KeyError as e: print("   KeyError for a missing dictionary key:", e)
try: 10 / 0
except ZeroDivisionError as e: print("   ZeroDivisionError:", e)
def check(amount):
    if amount < 0: raise ValueError("amount must not be negative")      # raise your own error
    return amount
try: check(-5)
except ValueError as e: print("   raised on purpose:", e)

# --- 5. files: 'with' closes the file even if an error happens ---
with open("orders.txt", "w", encoding="utf-8") as f: f.write("1001,asha,19.99\n1002,ben,5.00\n")
with open("orders.txt", "a", encoding="utf-8") as f: f.write("1003,chen,12.00\n")          # "a" appends, "w" overwrites
with open("orders.txt", encoding="utf-8") as f: lines = [line.strip() for line in f]
print("5) read", len(lines), "lines; last:", lines[-1])
with open("order.json", "w") as f: json.dump({"id": 1001, "items": ["kettle", "mug"]}, f)
with open("order.json") as f: print("   JSON file back as a dict:", json.load(f))

# --- 6. modules: code other people wrote, brought in with import ---
start = time.perf_counter(); time.sleep(0.05); took = time.perf_counter() - start
now = datetime(2026, 3, 5, 14, 30)
print("6) math:", math.sqrt(144), math.ceil(4.1), math.floor(4.9), "| slept about", round(took, 2), "s")
print("   dates:", now.strftime("%Y-%m-%d"), "| a week earlier:", (now - timedelta(days=7)).date(), "| weekday:", now.strftime("%A"))
print("   os:", os.path.basename("/data/raw/orders.csv"), "| exists:", os.path.exists("orders.txt"), "| env var with a default:", os.environ.get("DB_PASSWORD", "not set"))

# --- 7. classes: data and the functions that work on it, kept together ---
class Source:
    company = "Shop Ltd"                                  # class attribute: shared by every object
    def __init__(self, name, path):                       # constructor: runs when an object is created
        self.name = name; self.path = path; self.rows_read = 0     # instance attributes: belong to this object
    def read(self): self.rows_read += 3; return f"{self.name}: read 3 rows from {self.path}"
    def describe(self): return f"{type(self).__name__}({self.name}), {self.rows_read} rows so far"
class ApiSource(Source):                                  # inheritance: an ApiSource IS a Source, with something extra
    def __init__(self, name, url, token):
        super().__init__(name, url); self._token = token
    def read(self): self.rows_read += 5; return f"{self.name}: fetched 5 rows from {self.path} with a token ending ...{self._token[-3:]}"
    @property
    def has_token(self): return bool(self._token)         # a read-only "getter"
    @staticmethod
    def page_url(base, page): return f"{base}?page={page}"       # a helper that needs no object
sources = [Source("orders_file", "landing/orders.csv"), ApiSource("payments_api", "https://api.example.com/payments", "tok_abc123")]
print("7)")
for s in sources: print("  ", s.read()); print("  ", s.describe())
print("   class attribute:", sources[0].company, "| property:", sources[1].has_token, "| static method:", ApiSource.page_url("https://api.example.com/payments", 2))
print("   isinstance(api, Source):", isinstance(sources[1], Source))
EOF
python3 basics2.py
```

## 1. Functions

A **function** is a named piece of work. `def with_tax(amount, rate=0.18):` defines one with two **parameters**; `rate` has a **default**, so `with_tax(100)` uses 18%. `return` hands the result back. Without a `return`, a function gives back `None`, which is a frequent surprise. A function can return several values at once as a tuple (`min, max, mean`), unpacked into three variables.

Write a function when you have done something twice. Give it one job and a name that says what it does. The text in triple quotes directly under the `def` line is a **docstring**: the function's own documentation.

## 2. Scope

A variable created inside a function exists only inside it. `change()` made its own local `rate`; the outer one stayed 0.18. This protects you: functions cannot quietly damage each other's values. Pass values in as parameters and get results back with `return`, instead of reaching for global variables.

## 3. lambda, map, filter, reduce

A **lambda** is a small function without a name, written inline: `lambda a: a * 2`.

| Tool | Does | Result in the run |
|---|---|---|
| `map(f, items)` | applies `f` to every item | each amount doubled |
| `filter(f, items)` | keeps items where `f` is true | amounts over 10 |
| `reduce(f, items)` | folds all items into one value | the total, 140.5 |
| `sorted(items, key=f)` | sorts by whatever `f` returns | people by amount, biggest first |

In everyday Python a comprehension usually reads better than `map` and `filter`, and `sum()` beats `reduce`. You still need to know these three, because **Spark and other big-data engines are built on exactly these ideas** ([lesson 15](#dataeng-15)), and `key=lambda ...` is used constantly for sorting.

## 4. Errors

When Python cannot do something it **raises an exception** and, if nobody handles it, the program stops with a traceback. In a pipeline that processes a million rows, one bad row must not kill the run.

```term
try:        the code that might fail
except X:   what to do if error X happens
else:       runs only if there was no error
finally:    always runs, error or not: close files and connections here
```

- Catch the **specific** error (`ValueError`, `KeyError`, `ZeroDivisionError`, `FileNotFoundError`). A bare `except:` also hides your own typing mistakes.
- `except ValueError as e` gives you the message, so you can log it with the offending value.
- `raise ValueError("amount must not be negative")` creates your own error when data breaks a rule. Failing loudly at the door is better than loading nonsense.

Read a traceback **from the bottom**: the last line names the error, the lines above show where it happened.

## 5. Files

`open(path, mode)` opens a file: `"r"` read (the default), `"w"` write and **erase what was there**, `"a"` append to the end. The `with` block closes the file automatically, even when an error occurs inside it. Always give `encoding="utf-8"`. For JSON, `json.dump` writes a dictionary to a file and `json.load` reads it back; [the next lesson](#dataeng-4) uses these together with the `csv` module on messy data.

## 6. Modules and packages

A **module** is a file of ready-made code that you bring in with `import`. Python ships with a large **standard library**; the run used five of its modules:

| Module | For |
|---|---|
| `math` | square roots, rounding up and down |
| `time` | pausing (`sleep`) and timing how long code takes |
| `datetime` | dates, times and differences between them |
| `os` | paths, files, and **environment variables** (where passwords belong) |
| `json` | reading and writing JSON |

Code written by others outside the standard library is installed as a **package** with `pip`. Install packages into a **virtual environment**, a private folder of packages for one project, so that two projects needing different versions do not clash:

```term
python3 -m venv .venv              # create the environment (once per project)
source .venv/bin/activate          # switch it on  (Windows: .venv\Scripts\activate)
pip install pandas requests        # install into it
pip freeze > requirements.txt      # record exact versions so others get the same ones
```

## 7. Classes

A **class** bundles data with the functions that work on it. From the class you create **objects** (also called instances).

- `__init__` is the **constructor**: it runs when an object is created and stores its data on `self`, the object itself.
- **Instance attributes** (`self.name`) belong to one object. A **class attribute** (`company`) is shared by all of them.
- A **method** is a function inside a class; its first parameter is always `self`.
- **Inheritance:** `class ApiSource(Source)` says an API source *is a* source. It reuses everything from `Source` and overrides `read` with its own version. `super().__init__(...)` runs the parent's constructor.
- `@property` makes a method read like an attribute (a "getter"); `@staticmethod` is a helper that needs no object.
- A leading underscore (`_token`) is the convention for "internal, do not touch from outside".

In the run, the loop called `read()` on two different kinds of source without caring which was which. That is the point of classes in data engineering: a pipeline can treat a file, an API and a database as "sources" with the same methods. You will read far more classes than you write (Airflow operators, pandas DataFrames and database connections are all objects), so being able to **read** this code matters most.

## Putting it together

A typical small data script has this shape, and you can now read every line of it:

```term
import ...                       # modules at the top
def extract(path): ...           # functions, each with one job
def transform(row): ...
def load(rows): ...
if __name__ == "__main__":       # "only when this file is run directly"
    load(transform(r) for r in extract("orders.csv"))
```

:::try
1. Add a parameter `currency="GBP"` to `with_tax` and return a text such as `"118.0 GBP"`. 2. Make `to_number` also accept text with a comma, such as `"1,200.50"`. 3. Open a file that does not exist and catch the `FileNotFoundError` with a friendly message. 4. Add a class `DbSource(Source)` whose `read` reports 10 rows, add one to the `sources` list, and run.
:::

## How does exception handling work in Python?

:::say
Code that might fail goes in a try block. An except block names the specific exception to catch, and I log the error with the value that caused it. Else runs only when nothing failed, and finally always runs, so that is where I close files and connections. I raise my own exceptions when data breaks a business rule, and I avoid bare except because it hides real bugs.
:::

## What is the difference between a class attribute and an instance attribute?

:::say
An instance attribute is set on self, usually in the constructor, and belongs to one object. A class attribute is defined on the class and shared by every instance unless an instance overrides it. I use instance attributes for an object's own data and class attributes for constants or defaults shared by all.
:::

## What are map, filter and reduce?

:::say
Map applies a function to every item, filter keeps the items for which a function returns true, and reduce combines all items into a single value. In plain Python I usually prefer comprehensions and built-ins like sum, but the same three ideas are how distributed engines such as Spark process data in parallel.
:::

:::recap
- **Functions** name a piece of work: parameters in, `return` out; variables inside stay inside (**scope**).
- **lambda**, **map**, **filter**, **reduce**, `sorted(key=...)`: small functions applied to collections.
- **try / except / else / finally**; catch specific errors; **raise** when data breaks a rule.
- `with open(...)` reads and writes files safely; `"w"` erases, `"a"` appends.
- **import** modules; install packages with **pip** inside a **virtual environment**.
- A **class** bundles data and methods; **inheritance** reuses and specialises.
:::

```quiz
? A function has no return statement. What does calling it give back?
+ None
- 0
- An error
- The last variable it created
! Forgetting return is a common cause of unexpected None values.

? Which block always runs, whether or not an error happened?
+ finally
- else
- except
- try
! Use it to close files and connections.

? What does opening a file with mode "w" do if the file already exists?
+ Erases its contents and starts again
- Adds to the end
- Raises an error
- Opens it read-only
! Use "a" to append.

? Why install packages into a virtual environment?
+ Each project gets its own package versions, so projects do not clash
- It makes Python faster
- It is required to import the standard library
- It encrypts the code
! Record the versions with pip freeze so others can reproduce them.

? class ApiSource(Source) means:
+ ApiSource inherits from Source and can reuse or override its methods
- Source inherits from ApiSource
- ApiSource is a function that takes a Source
- The two classes are unrelated
! super() reaches the parent's version of a method.
```
