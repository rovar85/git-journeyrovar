---
track: dataeng
title: "Data quality: checks, tests and contracts"
short: Data quality
sub: The six dimensions of data quality, row-level and table-level checks you can run on every load, what to do when a check fails, and how contracts prevent the problem at the source.
---

:::goals
- name the dimensions of data quality: completeness, uniqueness, validity, accuracy, consistency, timeliness
- write row-level checks (not null, unique, range, accepted values) and table-level checks (volume, reconciliation, freshness)
- decide between warn, quarantine and fail
- explain data contracts and where quality tools fit
:::

## The idea

A pipeline that runs green and delivers wrong numbers is the worst kind of failure: nobody is paged, and decisions are made on bad data. **Data quality** work makes wrong data **loud**. You declare what must be true, check it on every load, and stop or flag the data when it is not.

| Dimension | Question | Typical check |
|---|---|---|
| Completeness | Is anything missing? | not null, row count vs source |
| Uniqueness | Are there duplicates? | unique key |
| Validity | Do values follow the rules? | type, range, format, accepted values |
| Accuracy | Does it match reality? | reconcile totals with the source system |
| Consistency | Do related tables agree? | every order's customer exists (referential integrity) |
| Timeliness | Is it fresh? | newest record no older than the agreed delay |

## Run it

Seven rows with typical faults, five row-level checks and three table-level checks.

```run
mkdir -p ~/lab/de/quality && cd ~/lab/de/quality
cat > quality.py <<'EOF'
# Data quality checks: declare what must be true, run the checks on every load, and fail (or quarantine) loudly.
rows = [
 {"order_id": 1, "customer": "asha", "amount": 20.0,  "country": "IN", "day": "2026-03-01"},
 {"order_id": 2, "customer": "ben",  "amount": 5.0,   "country": "UK", "day": "2026-03-01"},
 {"order_id": 2, "customer": "ben",  "amount": 5.0,   "country": "UK", "day": "2026-03-01"},     # duplicate key
 {"order_id": 3, "customer": None,   "amount": 12.0,  "country": "SG", "day": "2026-03-02"},     # missing customer
 {"order_id": 4, "customer": "dee",  "amount": -40.0, "country": "UK", "day": "2026-03-02"},     # negative amount
 {"order_id": 5, "customer": "eli",  "amount": 9.0,   "country": "XX", "day": "2026-03-02"},     # unknown country
 {"order_id": 6, "customer": "fay",  "amount": 7000.0, "country": "IN", "day": "2026-03-02"},    # suspiciously large
]
yesterday_count, source_count = 6, 8
def not_null(col):   return (f"not_null({col})",  "error", lambda rs: [r for r in rs if r[col] is None])
def unique(col):
    def f(rs):
        seen, dup = set(), []
        for r in rs:
            if r[col] in seen: dup.append(r)
            seen.add(r[col])
        return dup
    return (f"unique({col})", "error", f)
def in_range(col, lo, hi, level="error"): return (f"range({col}, {lo}..{hi})", level, lambda rs: [r for r in rs if r[col] is not None and not lo <= r[col] <= hi])
def accepted(col, values): return (f"accepted_values({col})", "error", lambda rs: [r for r in rs if r[col] not in values])
CHECKS = [not_null("customer"), unique("order_id"), in_range("amount", 0, 1_000_000), accepted("country", {"IN", "UK", "SG"}), in_range("amount", 0, 1000, level="warn")]
print(f"{'check':34} {'level':6} {'failed':>6}  example")
bad_ids, errors = set(), 0
for name, level, fn in CHECKS:
    failed = fn(rows)
    if level == "error": errors += len(failed); bad_ids |= {id(r) for r in failed}
    print(f"{name:34} {level:6} {len(failed):6d}  {failed[0] if failed else ''}")
good = [r for r in rows if id(r) not in bad_ids]
print(f"\nrow-level result: {len(good)} rows pass, {len(rows) - len(good)} quarantined for review")
print("\ntable-level checks (these catch problems no single row shows):")
change = (len(rows) - yesterday_count) / yesterday_count
print(f"   volume: {len(rows)} rows today vs {yesterday_count} yesterday ({change:+.0%}) -> {'ok' if abs(change) < 0.5 else 'ALERT'}")
print(f"   reconciliation: source system says {source_count} rows, we received {len(rows)} -> {'ok' if source_count == len(rows) else 'MISMATCH: ' + str(source_count - len(rows)) + ' rows missing'}")
print(f"   freshness: newest day in the data is {max(r['day'] for r in rows)}; alert if older than the agreed delay (the SLA)")
print(f"\npipeline decision: {'FAIL the load, do not publish' if len(good) / len(rows) < 0.9 else 'publish'} (only {len(good) / len(rows):.0%} of rows are clean; the threshold here is 90%)")
EOF
python3 quality.py
```

What the output shows:

- Each **row-level check** reports how many rows failed and an example: a missing customer, a duplicate key, a negative amount, an unknown country.
- The last check has level **warn**: an amount of 7000 is unusual but may be real, so it is reported, not rejected. Levels matter; if everything is an error, people start ignoring errors.
- **3 rows pass, 4 are quarantined.** Quarantine means set aside for review, not deleted.
- **Table-level checks** see what no single row shows: the row count against yesterday (+17%, fine), a **reconciliation** against the source (the source says 8 rows, we received 7: one is missing), and **freshness**.
- The **decision** is a policy written in code: only 43% of rows are clean and the threshold is 90%, so the load fails and nothing is published. Yesterday's correct data stays in place.

## What to do when a check fails

1. **Fail the pipeline** and keep the previous good data, when the data would mislead (duplicates in a revenue table).
2. **Quarantine** the bad rows and load the rest, when the rest is still useful and the gap is visible.
3. **Warn** and continue, for unusual but plausible values.

A common pattern is **write, audit, publish**: write the new data to a staging table, run the checks, and only swap it into the published table if they pass. Consumers never see a half-checked load.

## Where the checks live

- **At ingestion:** schema and type checks on the raw data.
- **After each transformation:** unique keys, not null, relationships.
- **Before publishing:** reconciliation and business rules ("revenue is never negative").
- **Continuously:** freshness and volume monitors with alerts.

Tools you will meet: **dbt tests** (unique, not_null, accepted_values, relationships, written next to the models; [lesson 15](#dataeng-15)), **Great Expectations** and **Soda** (check suites in Python or YAML), **Pydantic** or **Pandera** (validate records and DataFrames in code), and **data observability** products that learn normal volume and freshness and alert on anomalies.

```term
# Example (not run here): the same checks as dbt tests
models:
  - name: orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: country
        tests:
          - accepted_values: {values: ['IN', 'UK', 'SG']}
      - name: customer_id
        tests:
          - relationships: {to: ref('customers'), field: customer_id}
```

## Data contracts

Most data problems start upstream: an application team renames a column or changes a meaning. A **data contract** is an explicit agreement between the producer and the consumers of a dataset: the schema, the meaning of each field, quality guarantees, freshness, an owner, and how changes are announced. The best contracts are checked automatically in the producer's own CI, so a breaking change fails **their** build before it reaches your pipeline.

## Testing the code as well as the data

Data checks test **today's data**. **Unit tests** test **your logic** with small, fixed inputs, before deployment ([lesson 16](#dataeng-16)). You need both: unit tests catch bugs in transformations; data checks catch surprises in the input.

:::try
1. Add a check that `day` is a valid date and is not in the future. 2. Add a referential check: every `customer` must exist in a list of known customers. 3. Change the decision so that the load continues with the clean rows when at least 50% pass, and say in the output which mode was used.
:::

## How do you ensure data quality in a pipeline?

:::say
I define checks for the quality dimensions and run them on every load: not null, unique keys, ranges and accepted values at row level, and volume, reconciliation with the source and freshness at table level. Each check has a severity: warn, quarantine the rows, or fail the load. I use a write, audit, publish pattern so consumers never see unchecked data, I alert the owner, and for important sources I agree a data contract so breaking changes are caught in the producer's CI.
:::

## The numbers in a dashboard are wrong. How do you investigate?

:::say
I first confirm what "wrong" means with an example and the expected number. Then I trace the lineage backwards: the dashboard query, the mart, the fact, the staging table and the source, comparing counts and totals at each step to find where they first differ. The usual causes are a join that multiplies rows, duplicates from a re-run, a filter or time-zone difference, late-arriving data, or a changed definition. I fix the cause, add a test that would have caught it, and backfill.
:::

:::recap
- Quality dimensions: **complete, unique, valid, accurate, consistent, timely**.
- **Row-level** checks plus **table-level** checks (volume, reconciliation, freshness).
- Severity: **warn, quarantine, fail**; **write, audit, publish**.
- **Contracts** stop problems at the source; **unit tests** check your logic.
:::

```quiz
? Which check catches rows lost between the source and the warehouse?
+ Reconciliation of counts or totals against the source
- A not-null check
- An accepted-values check
- A range check
! Missing rows fail no row-level check because they are not there.

? What is the write, audit, publish pattern?
+ Load to a staging table, run checks, and publish only if they pass
- Publish first, check later
- Write the data twice
- Email the data to an auditor
! Consumers never see unchecked data.

? Why give checks different severities?
+ So real problems stop the pipeline while unusual but plausible values only warn
- To make more dashboards
- Because tools require three levels
- To hide errors
! If everything is an error, errors get ignored.
```
