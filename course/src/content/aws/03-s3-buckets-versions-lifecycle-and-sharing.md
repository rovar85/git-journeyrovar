---
track: aws
title: "S3: buckets, versions, lifecycle and safe sharing"
short: S3
sub: Object storage the safe way: block public access, encrypt by default, versioning that saves you from overwrites and deletes, lifecycle rules that cut cost, and presigned links instead of public files.
---

:::goals
- create a bucket with public access blocked and default encryption
- recover an overwritten and a deleted object with versioning
- write a lifecycle rule that moves and expires data
- share a private object safely with a presigned URL
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

## 1. What S3 is

**Amazon S3** stores **objects** (any file, up to 5 TB) under **keys** in **buckets**. A key like `2026/11/inv-1001.txt` looks like a folder path, but S3 is flat: "folders" are just shared prefixes. It is built for very high durability and is used for backups, data lakes, static websites, logs and uploads.

## 2. A bucket set up properly

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a3_s3.py <<'EOF'
# S3: buckets, objects, versions, lifecycle, encryption, public-access block and a presigned link (moto plays AWS).
import boto3, json
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    s3 = boto3.client("s3", region_name=R)
    s3.create_bucket(Bucket="shop-invoices-demo", CreateBucketConfiguration={"LocationConstraint": R})
    s3.put_public_access_block(Bucket="shop-invoices-demo", PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    s3.put_bucket_encryption(Bucket="shop-invoices-demo", ServerSideEncryptionConfiguration={
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]})
    s3.put_bucket_versioning(Bucket="shop-invoices-demo", VersioningConfiguration={"Status": "Enabled"})

    s3.put_object(Bucket="shop-invoices-demo", Key="2026/11/inv-1001.txt", Body=b"total 499")
    s3.put_object(Bucket="shop-invoices-demo", Key="2026/11/inv-1001.txt", Body=b"total 4990")   # an accidental overwrite
    s3.put_object(Bucket="shop-invoices-demo", Key="2026/11/inv-1002.txt", Body=b"total 120")
    for o in s3.list_objects_v2(Bucket="shop-invoices-demo", Prefix="2026/11/")["Contents"]:
        print("object:", o["Key"], o["Size"], "bytes")
    versions = s3.list_object_versions(Bucket="shop-invoices-demo", Prefix="2026/11/inv-1001")["Versions"]
    oldest = next(v for v in versions if not v["IsLatest"])          # the version before the latest
    old = s3.get_object(Bucket="shop-invoices-demo", Key="2026/11/inv-1001.txt", VersionId=oldest["VersionId"])["Body"].read()
    print(f"inv-1001 has {len(versions)} versions; the original said: {old.decode()!r}  <- versioning saved it")

    s3.delete_object(Bucket="shop-invoices-demo", Key="2026/11/inv-1002.txt")
    left = [o["Key"] for o in s3.list_objects_v2(Bucket="shop-invoices-demo").get("Contents", [])]
    markers = s3.list_object_versions(Bucket="shop-invoices-demo")["DeleteMarkers"]
    print("after delete, listed:", left, "| delete markers:", [m["Key"] for m in markers], "(the data is still recoverable)")

    s3.put_bucket_lifecycle_configuration(Bucket="shop-invoices-demo", LifecycleConfiguration={"Rules": [{
        "ID": "archive-then-expire", "Status": "Enabled", "Filter": {"Prefix": ""},
        "Transitions": [{"Days": 30, "StorageClass": "STANDARD_IA"}, {"Days": 180, "StorageClass": "GLACIER"}],
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90}}]})
    rule = s3.get_bucket_lifecycle_configuration(Bucket="shop-invoices-demo")["Rules"][0]
    print("lifecycle:", [(t["Days"], t["StorageClass"]) for t in rule["Transitions"]], "old versions deleted after", rule["NoncurrentVersionExpiration"]["NoncurrentDays"], "days")
    print("encryption:", s3.get_bucket_encryption(Bucket="shop-invoices-demo")["ServerSideEncryptionConfiguration"]["Rules"][0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"],
          "| public access blocked:", all(s3.get_public_access_block(Bucket="shop-invoices-demo")["PublicAccessBlockConfiguration"].values()))
    url = s3.generate_presigned_url("get_object", Params={"Bucket": "shop-invoices-demo", "Key": "2026/11/inv-1001.txt"}, ExpiresIn=300)
    print("share for 5 minutes:", url.split("?")[0] + "?...X-Amz-Expires=" + url.split("X-Amz-Expires=")[1].split("&")[0] + "&X-Amz-Signature=...")
EOF
python3 a3_s3.py
```

- **Block Public Access** on (it is the default for new buckets; keep it, and turn it on for the whole account). Public buckets are a classic breach.
- **Default encryption** with KMS: every object is encrypted at rest without the app doing anything.
- **Versioning**: the accidental overwrite of invoice 1001 kept the old version, and the delete only added a **delete marker**; removing the marker brings the file back. Pair it with MFA delete or **Object Lock** for backups that ransomware cannot erase.
- **Lifecycle**: after 30 days move to Standard-IA (cheaper storage, small fee to read), after 180 days to Glacier (archive), and delete old versions after 90 days so versioning does not grow forever.
- **Presigned URL**: a link signed with your credentials that works for 5 minutes for one object. The bucket stays private.

The CLI equivalents:

```term
aws s3 mb s3://shop-invoices-demo --region ap-south-1
aws s3api put-bucket-versioning --bucket shop-invoices-demo --versioning-configuration Status=Enabled
aws s3 cp inv-1001.txt s3://shop-invoices-demo/2026/11/
aws s3 ls s3://shop-invoices-demo/2026/11/
aws s3 sync ./site s3://shop-static-site --delete        # mirror a folder
aws s3 presign s3://shop-invoices-demo/2026/11/inv-1001.txt --expires-in 300
```

## 3. Storage classes in one table

| Class | For | Note |
| --- | --- | --- |
| Standard | data read often | the default |
| Intelligent-Tiering | unknown or changing patterns | moves objects between tiers for you |
| Standard-IA / One Zone-IA | read rarely, needed fast | cheaper storage, pay per read; One Zone keeps one zone only |
| Glacier Instant / Flexible / Deep Archive | archives | cheapest storage; retrieval from minutes to hours |

## 4. Who can read a bucket

Access is the union of **IAM policies** (on the caller) and the **bucket policy** (on the bucket), with deny winning, as in [lesson 2](#aws-2). Use the bucket policy for rules such as "only over TLS" or "only from this VPC endpoint". To serve a public website, put **CloudFront** in front of a private bucket instead of making the bucket public.

## Common misconceptions

- "S3 has folders." It has keys with prefixes; the console draws folders for convenience.
- "Versioning is a backup." It protects against overwrites and deletes in that bucket; a real backup also lives in another account or region.
- "To share a file I must make it public." Use a presigned URL or CloudFront with signed access.

## Practice (answers below)

1. In `a3_s3.py`, restore `inv-1002.txt` by deleting its delete marker (`delete_object` with the marker's `VersionId`). List the bucket again.
2. Write a lifecycle rule that deletes everything under `tmp/` after 7 days.
3. A team wants a public download page for brochures. What do you build?

:::recap
- Buckets hold objects under keys; keep **Block Public Access** on and **encrypt by default**.
- **Versioning** recovers overwrites and deletes; lifecycle rules control cost and old versions.
- Share with **presigned URLs** or CloudFront, never by making a bucket public.
:::

:::note Answers
1. Add `s3.delete_object(Bucket=..., Key="2026/11/inv-1002.txt", VersionId=markers[0]["VersionId"])`; the listing shows both invoices again. 2. `{"ID": "tmp", "Status": "Enabled", "Filter": {"Prefix": "tmp/"}, "Expiration": {"Days": 7}}`. 3. A private bucket with CloudFront in front (origin access control), so files are public through the CDN but the bucket itself is not.
:::

```quiz
? With versioning on, what does a normal delete do?
+ Adds a delete marker; earlier versions remain
- Erases all versions
- Moves the file to Glacier
- Fails
! Remove the marker to restore.

? What is a presigned URL?
+ A time-limited link signed with your credentials for one object
- A public bucket
- A DNS name
- An encryption key
! The bucket stays private.

? Which storage class suits logs read once a year?
+ A Glacier class
- Standard
- Intelligent-Tiering only
- EBS
! Archive classes are cheapest for rarely read data.
```
