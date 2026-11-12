---
track: sysdesign
title: "CQRS, event sourcing and sagas"
short: CQRS and sagas
sub: Separating the write model from read models, storing events instead of current state, and keeping a multi-service transaction consistent with a saga and compensating steps.
---

:::goals
- explain CQRS and when separate read models pay off
- rebuild state from an event log and query the past
- run a saga with compensating steps
- choose between choreography and orchestration
:::

## CQRS

**Command query responsibility segregation** means the model that accepts changes (commands) is separate from the models that answer questions (queries). The write side validates and records changes in a shape that is safe to update; read sides are copies shaped for the questions people ask: a search index, a denormalised table for the dashboard, a cache for the product page. They are updated from the write side's events, so they are **eventually consistent**: briefly behind.

Use it when reads and writes have very different shapes or volumes. For a simple CRUD service it only adds moving parts.

## Event sourcing

Instead of storing the current state ("balance: 50"), store the **events** that led to it, and compute the state by replaying them.

```run
mkdir -p ~/lab/sd && cd ~/lab/sd
cat > events.py <<'EOF'
# Event sourcing and a saga: store what happened, rebuild state from it, and undo a multi-step order when one step fails.
events = []
def emit(kind, **data): events.append({"seq": len(events) + 1, "kind": kind, **data})
emit("AccountOpened", acct="A1", owner="asha"); emit("Deposited", acct="A1", amount=100)
emit("Withdrew", acct="A1", amount=30); emit("Deposited", acct="A1", amount=50); emit("Withdrew", acct="A1", amount=70)
def balance(upto=None):
    b = 0
    for e in events:
        if upto and e["seq"] > upto: break
        b += e.get("amount", 0) * (1 if e["kind"] == "Deposited" else -1 if e["kind"] == "Withdrew" else 0)
    return b
print("1) event sourcing: the log is the truth; state is a fold over it")
for e in events: print(f"   {e['seq']} {e['kind']:14} {e.get('amount', '')}")
print(f"   balance now: {balance()} | balance after event 3 (time travel): {balance(3)}")
print("   a read model (CQRS) is a separate table kept up to date from the same events, shaped for queries\n")
def saga(fail_at=None):
    steps = [("reserve stock", "release stock"), ("charge card", "refund card"), ("book courier", "cancel courier")]
    done, log = [], []
    for i, (do, undo) in enumerate(steps):
        if i == fail_at: log.append(f"FAIL  {do}"); break
        log.append(f"ok    {do}"); done.append(undo)
    else:
        return log + ["order confirmed"]
    for undo in reversed(done): log.append(f"undo  {undo}")
    return log + ["order cancelled, every completed step compensated"]
print("2) saga: each service commits its own step; a failure runs compensating steps in reverse order")
for line in saga(): print("   " + line)
print("   -- the courier booking fails:")
for line in saga(fail_at=2): print("   " + line)
EOF
python3 events.py
```

- The balance is **50** after replaying five events; replaying only the first three gives **70**, the balance at that moment. Audit trails and "what did we know on 3 March?" questions come for free.
- Read models are built by replaying the same events into tables shaped for queries: that is CQRS on top of event sourcing.
- Costs: events can never be changed, only corrected by new events, so their format needs versioning; rebuilding state from millions of events needs **snapshots**; and the whole team must think in events. Use it where history is the product (ledgers, orders, workflows), not everywhere.

## Sagas: a transaction across services

When an order needs the stock service, the payment service and the courier service, one database transaction cannot span them (two-phase commit across services is fragile and slow). A **saga** runs each step as its own local transaction and defines a **compensating step** for each: release the stock, refund the card. In the run, the courier booking failed, so the saga refunded the card and released the stock, **in reverse order**, leaving the system consistent.

| Style | How | Good | Risk |
|---|---|---|---|
| **Choreography** | each service reacts to the previous service's event | no central component | the flow is hard to see and change |
| **Orchestration** | one orchestrator tells each service what to do next | the flow is explicit, easy to monitor | the orchestrator is another service to run |

Every step and every compensation must be **idempotent**, because messages are retried. Compensations are not always perfect undo (an email cannot be unsent), so design steps so the irreversible ones come last.

## What is a saga, and why use one?

:::say
A saga keeps a business transaction consistent across several services without a distributed transaction. Each step is a local transaction in one service, and each has a compensating step. If a later step fails, the completed steps are compensated in reverse order, for example refund the card and release the stock. It can be choreographed by events or run by an orchestrator, and every step must be idempotent.
:::

:::recap
- **CQRS:** separate write and read models; read models are **eventually consistent**.
- **Event sourcing:** store events, replay for state; history and time travel come free.
- **Sagas** replace distributed transactions with local steps and **compensations**.
- Choreography is decentralised; orchestration is explicit; both need **idempotent** steps.
:::

```quiz
? In event sourcing, how do you fix a wrong event?
+ Append a new correcting event
- Edit the old event
- Delete the log
- Restart the database
! The log is append-only; history is kept.

? A saga's third step fails. What happens to steps one and two?
+ Their compensating steps run, in reverse order
- Nothing
- They are retried forever
- The database rolls them back automatically
! Each service undoes its own completed step.

? When is CQRS not worth it?
+ For a simple service whose reads and writes have the same shape
- For a search page
- For a busy dashboard
- Never
! It adds components and eventual consistency.
```
