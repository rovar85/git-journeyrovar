mkdir -p ~/lab/sql && cd ~/lab/sql
cat > make_db.py <<'PYEOF'
# Builds shop.db, the practice database for the SQL practice track. Run it again at any time to reset the data.
import os, sqlite3
if os.path.exists("shop.db"): os.remove("shop.db")
db = sqlite3.connect("shop.db")
db.executescript("""
CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, city TEXT, country TEXT NOT NULL, signup_date TEXT NOT NULL, referred_by INTEGER REFERENCES customers(customer_id));
CREATE TABLE products  (product_id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL, launched_on TEXT NOT NULL);
CREATE TABLE orders    (order_id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(customer_id), order_date TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE order_items (order_id INTEGER NOT NULL REFERENCES orders(order_id), product_id INTEGER NOT NULL REFERENCES products(product_id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL, PRIMARY KEY (order_id, product_id));
CREATE TABLE payments  (payment_id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(order_id), paid_on TEXT NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL);
CREATE TABLE employees (emp_id INTEGER PRIMARY KEY, name TEXT NOT NULL, dept TEXT NOT NULL, manager_id INTEGER REFERENCES employees(emp_id), salary INTEGER NOT NULL, hire_date TEXT NOT NULL);
CREATE TABLE logins    (customer_id INTEGER NOT NULL REFERENCES customers(customer_id), login_date TEXT NOT NULL);
""")
db.executemany("INSERT INTO customers VALUES (?,?,?,?,?,?,?)", [
 (1, "Asha Rao", "asha@example.com", "Pune", "India", "2025-11-03", None),
 (2, "Ben Carter", "ben@example.co.uk", "Leeds", "UK", "2025-11-20", None),
 (3, "Chen Wei", "chen@example.sg", "Singapore", "Singapore", "2025-12-02", 1),
 (4, "Divya Nair", "divya@example.com", "Kochi", "India", "2025-12-15", 1),
 (5, "Emma Fischer", "emma@example.de", "Berlin", "Germany", "2026-01-05", 2),
 (6, "Farhan Ali", "farhan@example.com", "Mumbai", "India", "2026-01-11", None),
 (7, "Grace Lee", "grace@example.sg", None, "Singapore", "2026-01-30", 3),
 (8, "Hari Menon", "hari@example.com", "Bengaluru", "India", "2026-02-08", 4),
 (9, "Isla Brown", "isla@example.co.uk", "London", "UK", "2026-02-21", 2),
 (10, "Jay Patel", "JAY@EXAMPLE.COM", "Ahmedabad", "India", "2026-03-04", None),
 (11, "Jay Patel", "jay@example.com", "Ahmedabad", "India", "2026-03-04", None),
 (12, "Kiran Das", None, "Kolkata", "India", "2026-03-19", 6)])
db.executemany("INSERT INTO products VALUES (?,?,?,?,?)", [
 (1, "Steel kettle", "Kitchen", 30.0, "2025-06-01"), (2, "Clay mug", "Kitchen", 6.5, "2025-06-01"),
 (3, "Desk lamp", "Home", 45.0, "2025-08-15"), (4, "Cotton throw", "Home", 28.0, "2025-09-10"),
 (5, "Notebook A5", "Stationery", 4.0, "2025-06-01"), (6, "Fountain pen", "Stationery", 18.0, "2025-10-01"),
 (7, "Yoga mat", "Fitness", 25.0, "2025-11-01"), (8, "Water bottle", "Fitness", 12.0, "2026-01-15"),
 (9, "Tea sampler", "Grocery", 15.0, "2026-02-01"), (10, "Spice set", "Grocery", 22.0, "2026-04-01")])
seed = 7
def rnd(n):                      # a tiny fixed random generator: the same data on every machine and every Python version
    global seed
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
STATUSES = ["delivered"] * 7 + ["cancelled", "returned", "pending"]
orders, items, pays = [], [], []
oid = 0
for month in range(1, 7):
    for _ in range(7):
        oid += 1
        cust = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 3, 5, 8][rnd(15)]
        day = 1 + rnd(28)
        status = STATUSES[rnd(10)] if month < 6 else ["delivered", "pending"][rnd(2)]
        orders.append((oid, cust, f"2026-{month:02d}-{day:02d}", status))
        chosen = []
        for _ in range(1 + rnd(3)):
            p = 1 + rnd(9)                                     # product 10 is never sold
            if p not in chosen: chosen.append(p)
        total = 0
        for p in chosen:
            q = 1 + rnd(4); price = db.execute("SELECT price FROM products WHERE product_id = ?", (p,)).fetchone()[0]
            items.append((oid, p, q, price)); total += q * price
        if status in ("delivered", "returned"):
            pays.append((len(pays) + 1, oid, f"2026-{month:02d}-{min(28, day + rnd(3)):02d}", round(total, 2), ["UPI", "card", "card", "wallet"][rnd(4)]))
db.executemany("INSERT INTO orders VALUES (?,?,?,?)", orders)
db.executemany("INSERT INTO order_items VALUES (?,?,?,?)", items)
missing = pays.pop(10)                                                                  # data defects on purpose: one delivered order was never paid ...
pays = [(i + 1,) + p[1:] for i, p in enumerate(pays)]
pays[20] = pays[20][:3] + (round(pays[20][3] - 5, 2),) + pays[20][4:]                  # ... and one payment is 5.00 short
db.executemany("INSERT INTO payments VALUES (?,?,?,?,?)", pays)
db.executemany("INSERT INTO employees VALUES (?,?,?,?,?,?)", [
 (1, "Meera Iyer", "Leadership", None, 250000, "2019-04-01"),
 (2, "Tom Hughes", "Engineering", 1, 180000, "2020-01-15"), (3, "Sara Khan", "Sales", 1, 150000, "2020-06-01"),
 (4, "Ravi Kumar", "Engineering", 2, 120000, "2021-03-10"), (5, "Lena Vogel", "Engineering", 2, 135000, "2021-09-01"),
 (6, "Arjun Shah", "Engineering", 2, 120000, "2023-02-20"), (7, "Nina Roy", "Sales", 3, 90000, "2022-05-16"),
 (8, "Omar Aziz", "Sales", 3, 95000, "2023-07-03"), (9, "Priya Sen", "Sales", 3, 95000, "2024-01-08"),
 (10, "Ken Ito", "Support", 1, 70000, "2022-11-01"), (11, "Zoe Martin", "Support", 10, 62000, "2024-06-17"),
 (12, "Vikram Joshi", "Engineering", 4, 98000, "2025-01-06")])
logins = []
for c, days in {1: [1, 2, 3, 4, 8, 9, 15], 2: [1, 3, 5, 7], 3: [2, 3, 4, 5, 6, 20, 21], 4: [10, 11, 12], 5: [1, 15],
                6: [5, 6, 8, 9, 10, 11], 8: [3], 9: [7, 8, 9, 22, 23, 24, 25]}.items():
    for d in days: logins.append((c, f"2026-03-{d:02d}"))
logins += [(1, "2026-04-02"), (3, "2026-04-05"), (6, "2026-04-01"), (9, "2026-04-10"), (2, "2026-05-03"), (3, "2026-05-08"), (1, "2026-05-20")]
logins.append((1, "2026-03-02"))                                                       # a duplicate login on the same day
db.executemany("INSERT INTO logins VALUES (?,?)", logins)
db.commit()
print("shop.db ready:", ", ".join(f"{t} {db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}" for t in ("customers", "products", "orders", "order_items", "payments", "employees", "logins")))
PYEOF
cat > q.py <<'PYEOF'
# Run SQL against shop.db and print the result as a table.
#   python3 q.py my.sql              run the SQL in a file
#   python3 q.py "SELECT 1 + 1"       run SQL typed on the command line
# A file may hold several statements separated by ";". The result of the last one is shown.
import os, sqlite3, sys
if len(sys.argv) < 2: sys.exit("usage: python3 q.py FILE.sql   or   python3 q.py \"SELECT ...\"")
arg = sys.argv[1]
sql = open(arg, encoding="utf-8").read() if os.path.exists(arg) else arg
parts = [p.strip() for p in sql.split(";") if p.strip() and not all(l.strip().startswith("--") or not l.strip() for l in p.splitlines())]
db = sqlite3.connect("shop.db")
try:
    for p in parts[:-1]: db.execute(p)
    cur = db.execute(parts[-1]) if parts else None
except sqlite3.Error as e:
    sys.exit(f"SQL error: {e}")
if cur is None or cur.description is None:
    db.commit(); print("done:", db.total_changes, "row(s) changed"); sys.exit()
cols = [d[0] for d in cur.description]; rows = cur.fetchall()
fmt = lambda v: "NULL" if v is None else (f"{v:.2f}" if isinstance(v, float) else str(v))
cells = [[fmt(v) for v in r] for r in rows]
widths = [max([len(c)] + [len(r[i]) for r in cells]) for i, c in enumerate(cols)]
print(" | ".join(c.ljust(w) for c, w in zip(cols, widths)))
print("-+-".join("-" * w for w in widths))
for r in cells[:50]: print(" | ".join(v.ljust(w) for v, w in zip(r, widths)))
if len(cells) > 50: print(f"... {len(cells) - 50} more rows")
print(f"({len(rows)} row{'s' if len(rows) != 1 else ''})")
PYEOF
cat > check.py <<'PYEOF'
# Check your answer to a practice problem.   python3 check.py 2.3 my.sql
# It compares the rows your query returns with the expected rows (column names do not matter; numbers are compared to 2 decimals).
import hashlib, json, os, sqlite3, sys
if len(sys.argv) < 3: sys.exit("usage: python3 check.py PROBLEM FILE.sql   for example: python3 check.py 2.3 my.sql")
pid, arg = sys.argv[1], sys.argv[2]
answers = json.load(open("answers.json"))
if pid not in answers: sys.exit(f"no problem called {pid}. Problems: {', '.join(answers)}")
want = answers[pid]
sql = open(arg, encoding="utf-8").read() if os.path.exists(arg) else arg
parts = [p.strip() for p in sql.split(";") if p.strip() and not all(l.strip().startswith("--") or not l.strip() for l in p.splitlines())]
db = sqlite3.connect(":memory:"); disk = sqlite3.connect("shop.db"); disk.backup(db)       # check on a copy, so the real data is never changed
try:
    for p in parts[:-1]: db.execute(p)
    cur = db.execute(parts[-1]); rows = cur.fetchall() if cur.description else []
except sqlite3.Error as e:
    sys.exit(f"NOT YET: your SQL has an error: {e}")
norm = lambda r: [("NULL" if v is None else f"{float(v):.2f}" if isinstance(v, (int, float)) else str(v)) for v in r]
got = [norm(r) for r in rows]
if not want["ordered"]: got = sorted(got)
h = hashlib.sha256(json.dumps(got).encode()).hexdigest()[:16]
ncols = len(rows[0]) if rows else 0
if h == want["h"]: print(f"PASS  {pid}: {len(rows)} rows, all correct" + ("" if not want["ordered"] else ", in the right order")); sys.exit()
tips = []
if len(rows) != want["rows"]: tips.append(f"expected {want['rows']} rows, you returned {len(rows)}")
if rows and ncols != want["cols"]: tips.append(f"expected {want['cols']} columns, you returned {ncols}")
if not tips and want["ordered"]: tips.append("right number of rows and columns: check the values and the ORDER BY")
if not tips: tips.append("right number of rows and columns, but some values differ")
print(f"NOT YET  {pid}: " + "; ".join(tips))
PYEOF
cat > answers.json <<'PYEOF'
{"1.1":{"rows":10,"cols":5,"ordered":false,"h":"fc5500d7f0372acb"},"1.2":{"rows":10,"cols":3,"ordered":false,"h":"bb2e5b5a550cc06e"},"1.3":{"rows":1,"cols":1,"ordered":false,"h":"f4d31f46e3378020"},"2.1":{"rows":7,"cols":2,"ordered":false,"h":"b58f94233ed53a86"},"2.2":{"rows":10,"cols":2,"ordered":true,"h":"c5ee4dd1866f47d6"},"2.3":{"rows":3,"cols":2,"ordered":true,"h":"8cb40a964ffb122f"},"2.4":{"rows":7,"cols":2,"ordered":true,"h":"6df16addf9607154"},"2.5":{"rows":3,"cols":2,"ordered":false,"h":"0bdab6a7ed1ac205"},"2.6":{"rows":1,"cols":1,"ordered":false,"h":"f7426d20745cddce"},"2.7":{"rows":4,"cols":1,"ordered":false,"h":"eb56b8ba401c9f7b"},"2.8":{"rows":4,"cols":1,"ordered":true,"h":"f881ccb33c15fd84"},"2.9":{"rows":3,"cols":3,"ordered":true,"h":"fe7340aaf8e0feb6"},"3.1":{"rows":4,"cols":2,"ordered":true,"h":"39c6596da422a839"},"3.2":{"rows":1,"cols":3,"ordered":false,"h":"3997b5d2a177d85c"},"3.3":{"rows":4,"cols":2,"ordered":true,"h":"e79b5c6289cf9fd0"},"3.4":{"rows":9,"cols":2,"ordered":true,"h":"fd539419c64f9a13"},"3.5":{"rows":5,"cols":2,"ordered":true,"h":"e6e4628f227f0866"},"3.6":{"rows":10,"cols":3,"ordered":true,"h":"e04d9e91428c0da7"},"3.7":{"rows":10,"cols":3,"ordered":true,"h":"3413705f04126c5e"},"3.8":{"rows":5,"cols":3,"ordered":true,"h":"133133881bed6732"},"4.1":{"rows":42,"cols":3,"ordered":true,"h":"efabcb56c3ae73f9"},"4.2":{"rows":1,"cols":4,"ordered":false,"h":"d55a8e34eb844762"},"4.3":{"rows":2,"cols":1,"ordered":false,"h":"da6d2c0b10ebb127"},"4.4":{"rows":1,"cols":1,"ordered":false,"h":"5877f28a75b41990"},"4.5":{"rows":12,"cols":2,"ordered":true,"h":"ad0e8c4d42ef57df"},"4.6":{"rows":12,"cols":2,"ordered":true,"h":"b00a253418d70b7e"},"4.7":{"rows":4,"cols":2,"ordered":true,"h":"e12212099aaef7b7"},"4.8":{"rows":31,"cols":3,"ordered":true,"h":"785a2f500c8fce3e"},"5.1":{"rows":5,"cols":2,"ordered":true,"h":"089597b34a6de156"},"5.2":{"rows":3,"cols":1,"ordered":false,"h":"e19328fc6958bdb9"},"5.3":{"rows":7,"cols":1,"ordered":false,"h":"597cfb8143c36f64"},"5.4":{"rows":10,"cols":4,"ordered":true,"h":"56feaa23d6a2d088"},"5.5":{"rows":5,"cols":2,"ordered":true,"h":"f70526e9a00625a0"},"5.6":{"rows":3,"cols":2,"ordered":true,"h":"25297745303c21a2"},"5.7":{"rows":4,"cols":2,"ordered":true,"h":"90b29e7cb1c4a369"},"6.1":{"rows":10,"cols":3,"ordered":true,"h":"c3a142cdd1010f5c"},"6.2":{"rows":12,"cols":3,"ordered":true,"h":"7bee0a4d0f406d5c"},"6.3":{"rows":4,"cols":3,"ordered":true,"h":"32287de40075330b"},"6.4":{"rows":8,"cols":4,"ordered":true,"h":"c073dfeb9acf14a1"},"6.5":{"rows":6,"cols":3,"ordered":true,"h":"25c37f8b58a1a06e"},"6.6":{"rows":10,"cols":4,"ordered":true,"h":"7c5c4e8e6b167729"},"6.7":{"rows":5,"cols":3,"ordered":true,"h":"957d04786024991d"},"6.8":{"rows":10,"cols":4,"ordered":true,"h":"6f39f77528ea3051"},"7.1":{"rows":11,"cols":2,"ordered":true,"h":"32ee49eae17f9f69"},"7.2":{"rows":12,"cols":2,"ordered":true,"h":"a9a84c0e02def841"},"7.3":{"rows":7,"cols":2,"ordered":true,"h":"ce24c6f33cf7eee0"},"7.4":{"rows":31,"cols":2,"ordered":true,"h":"1b274b92b871c4cb"},"7.5":{"rows":12,"cols":3,"ordered":true,"h":"27cfc54716506f8c"},"7.6":{"rows":5,"cols":4,"ordered":true,"h":"ac887ddf9c99cbdc"},"7.7":{"rows":1,"cols":1,"ordered":false,"h":"f1616443276d55ed"},"8.1":{"rows":1,"cols":1,"ordered":false,"h":"f2e8b8b3bb35f787"},"8.2":{"rows":1,"cols":2,"ordered":false,"h":"90e24dbd826db8a0"},"8.3":{"rows":10,"cols":2,"ordered":true,"h":"ce314afe061d5c8c"},"8.4":{"rows":5,"cols":1,"ordered":false,"h":"91d8e64d394b67bb"},"8.5":{"rows":8,"cols":2,"ordered":true,"h":"26ab973782c8a1a5"},"8.6":{"rows":1,"cols":3,"ordered":false,"h":"5573defd3c029d3d"},"8.7":{"rows":1,"cols":1,"ordered":false,"h":"a2bd20c324b6fb7b"},"8.8":{"rows":5,"cols":4,"ordered":true,"h":"53df02b5c9ddf22f"},"9.1":{"rows":1,"cols":1,"ordered":false,"h":"36c6f49ec549a4f4"},"9.2":{"rows":2,"cols":2,"ordered":true,"h":"aa6bd2e165957709"},"9.3":{"rows":1,"cols":1,"ordered":false,"h":"24d4e6b4afba8cb5"},"9.4":{"rows":2,"cols":3,"ordered":true,"h":"0f4c0740eece3a0f"},"9.5":{"rows":5,"cols":2,"ordered":true,"h":"d257a108c403883e"},"10.1":{"rows":5,"cols":3,"ordered":true,"h":"09cbe992a5ef035e"},"10.2":{"rows":1,"cols":2,"ordered":false,"h":"a6c977a54eee5af0"},"10.3":{"rows":5,"cols":3,"ordered":true,"h":"de6f92038436ca23"},"10.4":{"rows":2,"cols":4,"ordered":true,"h":"df6fbb41d722d03a"},"10.5":{"rows":10,"cols":2,"ordered":true,"h":"3a7e341936719f3c"},"10.6":{"rows":4,"cols":4,"ordered":true,"h":"9cd57677cf5ea00f"}}
PYEOF
python3 make_db.py > /dev/null
