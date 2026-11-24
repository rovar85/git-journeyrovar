---
track: aws
title: "Databases: RDS and DynamoDB"
short: Databases
sub: A managed PostgreSQL done right (private, encrypted, multi-AZ, backups, a read replica, the password in Secrets Manager) and a DynamoDB table designed from its queries, with an index and a conditional write.
---

:::goals
- create an RDS instance with the settings production needs
- explain multi-AZ, read replicas, backups and snapshots
- design a DynamoDB table from its access patterns, with a partition key, sort key and an index
- use a conditional write to prevent double processing
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

## 1. Relational: RDS

**Amazon RDS** runs PostgreSQL, MySQL, MariaDB, SQL Server or Oracle for you: patching, backups, failover. **Aurora** is AWS's own engine compatible with PostgreSQL and MySQL, with storage shared across three zones. The [SQL track](#sqlprac-1) covers the queries; this lesson covers running the database.

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a6_data.py <<'EOF'
# Managed databases: an RDS PostgreSQL instance, and a DynamoDB table designed around its queries (moto plays AWS).
import boto3
from boto3.dynamodb.conditions import Key
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    rds = boto3.client("rds", region_name=R)
    db = rds.create_db_instance(DBInstanceIdentifier="shop-db", Engine="postgres", EngineVersion="16.4", DBInstanceClass="db.t4g.micro",
        AllocatedStorage=20, MasterUsername="shop_admin", ManageMasterUserPassword=True,   # RDS keeps the password in Secrets Manager
        MultiAZ=True, StorageEncrypted=True, BackupRetentionPeriod=7, PubliclyAccessible=False, DeletionProtection=True)["DBInstance"]
    print("RDS:", db["DBInstanceIdentifier"], db["Engine"], db["EngineVersion"], "| multi-AZ", db["MultiAZ"], "| encrypted", db["StorageEncrypted"],
          "| backups kept", db["BackupRetentionPeriod"], "days | public", db["PubliclyAccessible"])
    rds.create_db_snapshot(DBInstanceIdentifier="shop-db", DBSnapshotIdentifier="before-migration")
    print("snapshot:", rds.describe_db_snapshots(DBInstanceIdentifier="shop-db", SnapshotType="manual")["DBSnapshots"][0]["DBSnapshotIdentifier"])
    rep = rds.create_db_instance_read_replica(DBInstanceIdentifier="shop-db-read", SourceDBInstanceIdentifier="shop-db")["DBInstance"]
    print("read replica of:", rep["ReadReplicaSourceDBInstanceIdentifier"])

    # DynamoDB: one table, keys chosen for the questions the app asks
    ddb = boto3.resource("dynamodb", region_name=R)
    t = ddb.create_table(TableName="orders", BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "customer", "KeyType": "HASH"}, {"AttributeName": "order_at", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in ("customer", "order_at", "status")],
        GlobalSecondaryIndexes=[{"IndexName": "by-status", "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "order_at", "KeyType": "RANGE"}],
                                 "Projection": {"ProjectionType": "ALL"}}])
    rows = [("asha", "2026-11-01T10:00", "delivered", 499), ("asha", "2026-11-20T09:30", "shipped", 1299),
            ("asha", "2026-11-23T18:05", "pending", 250), ("ben", "2026-11-22T12:00", "pending", 999)]
    with t.batch_writer() as w:
        for c, at, st, amt in rows: w.put_item(Item={"customer": c, "order_at": at, "status": st, "amount": amt})
    q = t.query(KeyConditionExpression=Key("customer").eq("asha") & Key("order_at").begins_with("2026-11-2"))["Items"]
    print("asha's orders since the 20th:", [(i["order_at"], i["status"]) for i in q])
    q = t.query(IndexName="by-status", KeyConditionExpression=Key("status").eq("pending"))["Items"]
    print("all pending orders (from the index):", [(i["customer"], int(i["amount"])) for i in q])
    try:   # a conditional write: only move pending -> shipped, never ship twice
        for _ in range(2):
            t.update_item(Key={"customer": "ben", "order_at": "2026-11-22T12:00"}, UpdateExpression="SET #s = :new",
                          ConditionExpression="#s = :old", ExpressionAttributeNames={"#s": "status"},
                          ExpressionAttributeValues={":new": "shipped", ":old": "pending"})
            print("ben's order shipped")
    except ddb.meta.client.exceptions.ConditionalCheckFailedException:
        print("second update refused: the order was no longer pending")
EOF
python3 a6_data.py
```

The RDS settings that matter, all in the first call:

- `PubliclyAccessible=False` and a database security group that only accepts the app ([lesson 4](#aws-4)).
- `MultiAZ=True`: a standby in another zone; failover in a minute or two if the primary's zone fails. It is for **availability**, not extra reads.
- `StorageEncrypted=True`, `BackupRetentionPeriod=7` (point-in-time restore for 7 days), manual **snapshots** before risky changes, `DeletionProtection=True`.
- `ManageMasterUserPassword=True`: RDS creates the password in **Secrets Manager** and can rotate it; nobody writes it down.
- A **read replica** takes read-only traffic (reports, dashboards) off the primary. Replicas are slightly behind (asynchronous), so read-your-own-write screens should use the primary.

## 2. Key-value at any scale: DynamoDB

**DynamoDB** is a serverless key-value and document database: no servers, single-digit millisecond reads at any size, pay per request. The rule is different from SQL: **design the table from the questions you will ask**, because you can only query efficiently by key.

- **Partition key** `customer` decides where an item lives; **sort key** `order_at` orders items within a customer. So "asha's orders since the 20th" is one fast query with `begins_with`.
- A **global secondary index** `by-status` answers a second question ("all pending orders") with a different key.
- A **conditional write** (`ConditionExpression`) only updates if the order is still pending. The second attempt was refused: no double shipping, even with two workers racing.
- Avoid `scan` in application code: it reads the whole table.

## 3. Which one?

| Choose | When |
| --- | --- |
| RDS / Aurora | relational data, joins, ad-hoc queries, transactions across many tables, existing SQL skills |
| DynamoDB | known access patterns, huge scale or spiky traffic, simple lookups by key, serverless apps |
| Others | ElastiCache (Redis) for caching, OpenSearch for search, Redshift or Athena for analytics |

```term
aws rds describe-db-instances --query "DBInstances[].[DBInstanceIdentifier,MultiAZ,StorageEncrypted,PubliclyAccessible]" --output table
aws rds create-db-snapshot --db-instance-identifier shop-db --db-snapshot-identifier before-migration
aws dynamodb query --table-name orders --key-condition-expression "customer = :c" \
  --expression-attribute-values '{":c": {"S": "asha"}}'
```

## Common misconceptions

- "Multi-AZ doubles read capacity." The standby takes no traffic; use read replicas for reads.
- "DynamoDB is schemaless, so design does not matter." The keys are the design; a wrong key means scans and slow, costly queries.
- "Backups are on, so we are safe." Test a restore; and keep copies in another account for ransomware or account loss.

## Practice (answers below)

1. Add an index to the `orders` table that answers "orders over 1000 for a day". What would its keys be?
2. A report query makes the shop slow every morning. Name two fixes using this lesson.
3. Why is a conditional write better than "read the status, then update it" in two calls?

:::recap
- RDS: private, encrypted, **multi-AZ** for availability, **backups and snapshots**, **read replicas** for reads, password in Secrets Manager.
- DynamoDB: design keys from **access patterns**; **GSIs** for other questions; **conditional writes** for safe updates.
- Pick relational for flexible queries and joins, DynamoDB for known patterns at large or spiky scale.
:::

:::note Answers
1. For example partition key `order_day` (YYYY-MM-DD) and sort key `amount` (a number), then query `order_day = :d AND amount > :x`. Watch for a hot partition on busy days. 2. Point the report at a read replica; or schedule it at a quiet time / move reporting to an analytics store (Athena, Redshift). 3. Between the read and the update another worker can change the item; the condition is checked atomically in the same write.
:::

```quiz
? What is RDS Multi-AZ for?
+ Automatic failover to a standby in another zone
- Doubling read capacity
- Cheaper storage
- Running two engines
! The standby is idle until failover.

? In DynamoDB, which query is efficient?
+ One that uses the table's or an index's partition key
- Any filter on any attribute
- A full table scan
- A join between tables
! Keys decide what can be queried quickly.

? What does a ConditionExpression on an update do?
+ Applies the update only if the condition holds at write time
- Encrypts the item
- Creates an index
- Retries forever
! Atomic check-and-set.
```
