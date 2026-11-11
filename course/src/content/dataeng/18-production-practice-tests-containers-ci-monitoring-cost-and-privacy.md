---
track: dataeng
title: "Production practice: tests, containers, CI, monitoring, cost and privacy"
short: Production practice
sub: What separates a working script from a pipeline a company can rely on, with unit tests for a transformation and pseudonymisation of personal data that you can run, and links to the DevOps lessons you already have.
---

:::goals
- write unit tests for a transformation and say what else to test
- package and deploy a pipeline with Git, containers, CI/CD and infrastructure as code
- monitor a pipeline: freshness, volume, failures, lag, cost
- protect personal data: classify, minimise, mask, pseudonymise, control access, delete
:::

## The idea

Juniors are judged on whether the pipeline works. **Professionals are judged on whether it keeps working** when the input changes, when they are on holiday, when the data doubles, and when an auditor asks who can see customer emails. This lesson is the checklist, and it connects to the DevOps tracks of this course.

## 1. Test the logic

Keep transformations as **pure functions** (no files, no network), and test them with small fixed inputs, especially the edges.

```run
mkdir -p ~/lab/de/prod && cd ~/lab/de/prod
cat > prod.py <<'EOF'
# Two production habits in one file: unit tests for a transformation, and protecting personal data (PII).
import hashlib, hmac, unittest

def transform(row):
    """Pure function: same input -> same output, no files, no network. That is what makes it testable."""
    amount = round(float(row["amount"]), 2)
    if amount < 0: raise ValueError("amount must not be negative")
    return {"order_id": int(row["order_id"]), "customer": row["customer"].strip().lower(), "amount": amount,
            "amount_band": "large" if amount >= 100 else "small"}

class TransformTest(unittest.TestCase):
    def test_cleans_text_and_types(self):
        self.assertEqual(transform({"order_id": "7", "customer": " Asha ", "amount": "19.999"}),
                         {"order_id": 7, "customer": "asha", "amount": 20.0, "amount_band": "small"})
    def test_band_boundary(self):                         # test the edges: 99.99 and 100
        self.assertEqual(transform({"order_id": "1", "customer": "a", "amount": "99.99"})["amount_band"], "small")
        self.assertEqual(transform({"order_id": "1", "customer": "a", "amount": "100"})["amount_band"], "large")
    def test_rejects_negative(self):
        with self.assertRaises(ValueError): transform({"order_id": "1", "customer": "a", "amount": "-5"})
    def test_rejects_text_amount(self):
        with self.assertRaises(ValueError): transform({"order_id": "1", "customer": "a", "amount": "abc"})

SECRET = b"read-this-from-a-secret-store-not-from-code"
def pseudonymise(value):          # keyed hash: the same email always gives the same token, so joins and counts still work
    return hmac.new(SECRET, value.strip().lower().encode(), hashlib.sha256).hexdigest()[:16]
def mask_email(e): name, _, domain = e.partition("@"); return name[0] + "***@" + domain

if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=2).result
    print(f"\ntests run: {result.testsRun}, failures: {len(result.failures)}, errors: {len(result.errors)}\n")
    people = [("asha@example.com", 61.0), ("Asha@Example.com ", 19.99), ("ben@example.org", 5.0)]
    print(f"{'raw email (restricted zone only)':34} {'masked for display':20} {'pseudonym for analytics':24} amount")
    for email, amount in people: print(f"{email:34} {mask_email(email.strip()):20} {pseudonymise(email):24} {amount}")
    print("\nThe two spellings of Asha's email give the SAME pseudonym, so 'orders per customer' still works without exposing the email.")
    print("A plain unsalted hash would be guessable (hash a list of known emails and compare); the secret key prevents that.")
EOF
python3 prod.py
```

What the output shows:

- **Four tests pass**: cleaning and types, the boundary between "small" and "large" (99.99 and 100), and two kinds of bad input. Edge and error cases are where bugs live.
- **Personal data.** The raw email stays in a restricted zone. For display it is **masked** (`a***@example.com`). For analytics it is **pseudonymised** with a keyed hash: both spellings of Asha's email give the same token, so counting and joining still work, but the email is not exposed.

The kinds of test a data project needs:

| Test | Checks | When |
|---|---|---|
| Unit | one transformation, fixed input | every commit |
| Integration | the pipeline end to end on a small sample database | every pull request |
| Data quality | today's data ([lesson 13](#dataeng-13)) | every run |
| Contract | the source still matches the agreed schema | producer's and consumer's CI |
| Regression / diff | new version of a model gives the same result as the old, except where intended | before deploying a change |

In real projects most people use **pytest** (`pip install pytest`); `unittest` is used here because it is built in.

## 2. Version, package, deploy

- **Git for everything:** code, SQL, DAGs, configuration, infrastructure. Changes go through pull requests with review ([Git](#git-1)).
- **Pin dependencies** (a lock file) so the same code builds the same way next month.
- **Containers:** build one image and run that same image in test and production ([Docker](#docker-1)). Orchestrators commonly run each task as a container or a Kubernetes pod ([Kubernetes](#kubernetes-1)).
- **CI/CD:** on every pull request run linters (`ruff`, `sqlfluff`), unit tests, and build the changed models against a test schema; on merge, deploy ([Jenkins and CI/CD](#jenkins-1)).
- **Environments:** dev, staging, production with separate data and credentials. Never develop against production tables.
- **Infrastructure as code:** buckets, warehouses, roles and clusters defined in Terraform ([Terraform](#terraform-1)).
- **Configuration and secrets** outside the code: environment variables and a secret manager ([Senior cloud 11](#cloudsenior-11)).

```term
# Example (not run here): a minimal image for a pipeline
FROM python:3.12-slim
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY pipeline/ pipeline/
USER 1000
ENTRYPOINT ["python", "-m", "pipeline.run"]      # run date passed as an argument:  --date 2026-03-05
```

## 3. Monitor and operate

A pipeline needs the same care as a service ([Monitoring](#monitoring-1)). The signals that matter for data:

- **Freshness:** when was each important table last updated, against its promised time? This is the data SLO.
- **Volume:** rows loaded per run compared with the usual range.
- **Failures and retries**, run **duration** (a job that gets 5% slower every week will miss its deadline one day), and **lag** for streams.
- **Quality check results** over time.
- **Cost** per pipeline and per team.

Operate it like an on-call engineer: **alerts go to an owner** and say what is affected; a **runbook** explains how to re-run and backfill; incidents get a short **review** with a fix that prevents the repeat. **Lineage** (which tables and dashboards depend on this one) tells you who to warn.

## 4. Reliability by design

- **Idempotent, incremental, atomic** tasks ([lesson 10](#dataeng-10)), parameterised by date ([lesson 14](#dataeng-14)).
- **Keep raw data**, so anything can be rebuilt.
- **Backward-compatible schema changes:** add columns; do not rename or remove without a migration period ([lesson 11](#dataeng-11)).
- **Capacity:** know which step breaks first when data doubles.
- **Backups and recovery:** time travel or snapshots for tables; a tested restore.

## 5. Privacy, security and governance

**Personal data** (PII: names, emails, phone numbers, addresses, ids, and anything that identifies a person) is regulated in most countries (GDPR in the EU, and similar laws elsewhere). The engineering duties are similar everywhere:

1. **Classify:** know which columns are personal or sensitive; tag them in the catalogue.
2. **Minimise:** do not collect or copy what you do not need. The safest data is the data you do not have.
3. **Protect:** encryption in transit and at rest; **least-privilege access** by role; **column masking** and **row-level security**; separate zones for raw and analytics data.
4. **Mask or pseudonymise** for analytics, as in the script. Pseudonymised data is still personal data, because whoever holds the key can link it back; truly anonymous data cannot be linked to a person at all.
5. **Delete on request and on schedule:** you must be able to find and remove one person's data in every table and backup (lineage helps), and apply retention periods.
6. **Audit:** log who read what.

Never put real personal data in test environments, screenshots, tickets or prompts to external AI services without approval.

:::try
1. Add a `currency` field to `transform` that must be one of GBP, EUR, INR, with tests for a valid and an invalid value; write the tests first and watch them fail. 2. Change `SECRET` and observe that all pseudonyms change: what does that mean for rotating the key? 3. Write a function that masks a phone number except its last two digits.
:::

## How do you test a data pipeline?

:::say
At several levels. Unit tests for transformation functions with small fixed inputs and edge cases, run on every commit. An integration test that runs the pipeline end to end on a sample. Data quality checks on every run for keys, nulls, ranges, volume and freshness. And for a change to an existing model, a diff between the old and new output so only intended differences ship. All of it runs in CI before deployment.
:::

## How do you handle personal data in a pipeline?

:::say
I classify the sensitive columns and avoid loading what we do not need. Raw personal data stays in a restricted zone with least-privilege access and encryption. For analytics I mask values or replace them with a keyed hash so joins still work without exposing the value, and I use column masking and row-level security in the warehouse. I make deletion and retention possible, using lineage to find every copy, and keep an audit log of access.
:::

:::recap
- **Test** logic (unit), flow (integration), data (quality), interfaces (contract) and changes (diff).
- **Git, pinned dependencies, containers, CI/CD, environments, IaC, secrets outside code.**
- Monitor **freshness, volume, failures, duration, lag, cost**; alerts have owners and runbooks.
- **Privacy:** classify, minimise, protect, pseudonymise, delete, audit.
:::

```quiz
? Why keep transformation functions pure?
+ The same input always gives the same output, so they are easy to unit test
- They run faster on GPUs
- They need no version control
- They cannot fail
! No files or network inside means no setup needed to test them.

? Why use a keyed hash instead of a plain hash to pseudonymise emails?
+ A plain hash can be reversed by hashing a list of known emails; the secret key prevents that
- A keyed hash is shorter
- Plain hashes are illegal
- It makes joins impossible
! The same input still gives the same token, so analytics still work.

? Which signal tells you a table missed its promised delivery time?
+ Freshness
- Row width
- Compression ratio
- Number of columns
! Freshness against an agreed time is the core data SLO.
```
