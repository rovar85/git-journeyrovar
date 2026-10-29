---
track: systems
title: "Systems 7: idempotency, making a retry safe"
short: Idempotency
sub: Why a timeout does not tell you whether the work was done, and how an idempotency key and one transaction turn at-least-once delivery into effectively-once effects.
---


:::goals
- define idempotency and give examples of naturally idempotent and non-idempotent operations
- explain why a timeout leaves the outcome unknown
- build an idempotency-key mechanism with the three rules: save atomically, replay the saved answer, reject a mismatch
- apply it to queues, webhooks and batch jobs
:::

:::note Companion to the Stripe article
[Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency) by Stripe is the best-known description of the pattern ([resource list](#systems-1)). The code here is a small SQLite version written for this lesson, not Stripe's implementation.
:::

## 1. The problem a timeout creates

A client sends "charge 500" and the connection times out. Did the charge happen? You cannot know: the request may have been lost before arriving, the server may have crashed halfway, or the work may be done and only the reply was lost ([Lesson 4](#systems-4)). The client has two choices: not retry (and risk a lost order) or retry (and risk charging twice). **Idempotency removes the dilemma.**

An operation is **idempotent** if doing it many times has the same effect as doing it once.

- Naturally idempotent: `PUT /users/7 {name: "Asha"}` (set to a value), `DELETE /orders/9`, `set balance = 500`, "make sure the file exists".
- Not idempotent: `POST /charges`, `balance = balance + 500`, "append a line", "send an email".

[Retries](#systems-6) and [hedged requests](#systems-5) are only safe for idempotent work. The fix for the others is to **make them idempotent with a key**.

## 2. The idempotency key pattern

The client generates a **unique key** for one logical action (such as `order-1001-pay`) and sends it with every attempt, usually in a header. The server follows three rules:

1. **Look up the key first.** If it was seen, **replay the saved response** and do nothing else.
2. **Store the key and the result atomically with the work.** The charge and the key must commit in **one transaction**; otherwise a crash between them leaves the work done but unrecorded, and the retry does it again.
3. **Check the request is the same.** Save a fingerprint (hash) of the request. If the same key arrives with a different body, reject it: it is a client bug, and silently accepting it would hide a wrong charge.

Run it, with real SQLite:

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > idem.py <<'EOF'
import sqlite3, json, hashlib
db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
create table charges(id integer primary key autoincrement, customer text, amount int);
create table idem(key text primary key, fingerprint text, status int, response text);
""")

def fingerprint(body): return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:12]

def charge_naive(body):
    db.execute("insert into charges(customer, amount) values (?, ?)", (body["customer"], body["amount"]))
    return 201, {"charge_id": db.execute("select max(id) from charges").fetchone()[0]}

def charge(key, body):
    """At-least-once delivery from the client + a unique key on the server = effectively-once processing."""
    fp = fingerprint(body)
    db.execute("begin immediate")
    row = db.execute("select fingerprint, status, response from idem where key=?", (key,)).fetchone()
    if row:
        db.execute("commit")
        if row[0] != fp: return 422, {"error": "idempotency key reused with a different request"}
        return row[1], json.loads(row[2])                       # replay the saved answer; do NOT charge again
    db.execute("insert into charges(customer, amount) values (?, ?)", (body["customer"], body["amount"]))
    resp = {"charge_id": db.execute("select max(id) from charges").fetchone()[0]}
    db.execute("insert into idem values (?,?,?,?)", (key, fp, 201, json.dumps(resp)))
    db.execute("commit")                                         # charge and key are saved in ONE transaction
    return 201, resp

def total(): return db.execute("select count(*), coalesce(sum(amount),0) from charges").fetchone()

print("1) no idempotency: the client times out and retries 3 times, the server did process every attempt")
for _ in range(3): charge_naive({"customer": "asha", "amount": 500})
print("   charges stored (count, total):", total(), " <- the customer paid 1500 for one order")

db.execute("delete from charges"); db.execute("delete from sqlite_sequence")
print("\n2) with an idempotency key: same retries")
for attempt in range(1, 4):
    print(f"   attempt {attempt}:", charge("order-1001-pay", {"customer": "asha", "amount": 500}))
print("   charges stored (count, total):", total())

print("\n3) the same key reused for a DIFFERENT request is rejected, not silently accepted")
print("  ", charge("order-1001-pay", {"customer": "asha", "amount": 900}))

print("\n4) a new order uses a new key and is processed")
print("  ", charge("order-1002-pay", {"customer": "ravi", "amount": 250}))
print("   charges stored (count, total):", total())

print("\n5) two copies of the same request racing: the primary key lets only one win")
try:
    db.execute("insert into idem values ('race','x',201,'{}')"); db.execute("insert into idem values ('race','x',201,'{}')")
except sqlite3.IntegrityError as e:
    print("   second insert rejected:", e)
EOF
python3 idem.py
```


Read the five steps. Step 1 shows the bug: three retries, three charges. Step 2 uses the key: all three attempts return the **same** response (`charge_id` 1) and only one charge exists. Step 3 shows a reused key with a different amount rejected with `422`. Step 5 shows why the key column must be **unique**: if two copies of the same request arrive **at the same moment**, the database lets only one insert win, and the other gets an error that you translate into "request already in progress" (return `409` or wait, and then replay).

## 3. Design details that matter

- **Who creates the key?** The client, once per user action, and **reuses it for every retry** of that action. A key generated fresh on each attempt protects nothing.
- **How long to keep keys:** long enough to cover any realistic retry window (hours to a day or more); delete afterwards to stop the table growing. Document it.
- **What to store:** the status code and response body for replays. If the first attempt is still running, return a "conflict, try again" answer, not a second execution.
- **Calls to outside systems:** a payment provider or an email service may not honour your key, so pass them **their** idempotency key derived from yours, and record the outcome before replying.
- **Failures:** if the first attempt fails with a retryable error, do not store it as final, or replays will return the failure forever. Store only completed results (or mark in-progress separately).

## 4. The same idea in other places

- **Message queues:** most deliver **at least once**, so a message may arrive twice. A consumer that records processed message ids (or applies changes with `insert ... on conflict do nothing`) is idempotent. "At-least-once delivery plus an idempotent consumer" is how real systems get **effectively-once** results. True exactly-once delivery across machines is not something you can assume.
- **Webhooks:** providers resend until you answer `200`. Deduplicate on the event id.
- **Batch jobs and ETL:** write results with **upserts** keyed by a natural key, or replace a whole partition, so rerunning a failed job is harmless.
- **Infrastructure as code:** Terraform and Ansible describe a desired state so that applying twice changes nothing; that is idempotency as a design principle ([Terraform 1](#terraform-1)).
- **Kubernetes controllers:** they repeat "make actual equal desired" forever, which only works because each step is idempotent.

## Common misconceptions

- "HTTP `POST` is idempotent if I add a key." It is, if the **server** implements the key protocol. The key alone does nothing.
- "Exactly-once is achievable by magic." You get effectively-once by combining retries with idempotent effects.
- "Idempotent means returns the same response." The **effect** is the same; the response may differ (for example `201` the first time and `200` after).

## Practice (answers below)

1. Is `UPDATE stock SET qty = qty - 1` idempotent? Make an idempotent version for "this order reserves 1 unit".
2. A consumer processes a message, then crashes before acknowledging it. What happens, and how do you stay correct?
3. Why must the key and the charge be in the same transaction?

:::recap
- A timeout leaves the outcome **unknown**; the safe answer is to make the operation **idempotent** and retry.
- **Idempotency key**: look up, replay, store atomically with the work, reject mismatched requests; unique constraint handles races.
- **At-least-once + idempotent consumer = effectively-once.**
- Keep keys for the retry window, then expire them.
:::

:::note Answers
1. No: running it twice reduces stock by 2. Idempotent version: record the reservation with the order id as a unique key (`insert into reservations(order_id, sku) ... on conflict do nothing`) and derive stock from the reservations, or only decrement when the insert actually added a row. 2. The broker redelivers the message, so it is processed twice; record processed ids (or use a natural-key upsert) so the second run changes nothing. 3. If they commit separately, a crash between them leaves either a charge without a key (a retry charges again) or a key without a charge (the retry replays success for nothing); one transaction makes both happen or neither.
:::

```quiz
? A client times out calling POST /charges. What is true?
+ The server may or may not have processed it, so the client cannot know without an idempotency mechanism
- The charge definitely failed
- The charge definitely succeeded
- The server rolled it back
! A lost reply and a lost request look identical to the client.

? What should a server do when an idempotency key it has already completed arrives again with the same request?
+ Return the saved response without doing the work again
- Charge again
- Delete the key
- Ignore the request
! Replaying the stored answer makes the retry harmless.

? What does at-least-once delivery plus an idempotent consumer give you?
+ Effectively-once results
- Exactly-once delivery by the network
- No need for acknowledgements
- Faster messages
! Duplicates arrive but their effects are applied only once.
```
