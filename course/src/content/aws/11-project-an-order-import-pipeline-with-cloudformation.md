---
track: aws
title: "Project: an order import pipeline, deployed as code"
short: Project
sub: Put the track together: a CloudFormation template creates a bucket, queue with dead-letter queue, table and least-privilege role; a file upload flows through to the table; repeats do not duplicate; one call tears it all down.
---

:::goals
- write a CloudFormation template with parameters, references and outputs
- connect S3 events to SQS and process them idempotently into DynamoDB
- give the worker a least-privilege role in the template
- deploy, verify and tear down a whole stack, and explain how you would run it for real
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

## 1. The design

Partners drop CSV files of orders into a bucket. Each new file creates an event on a queue; a worker (a Lambda function in production) reads the file and writes each order to a table. Bad files end up in a dead-letter queue after three tries. Everything is defined in one template, so dev and prod are identical and the whole thing can be deleted in one step.

```term
partner -> S3 (incoming/) -> event -> SQS (DLQ after 3) -> worker -> DynamoDB orders
```

## 2. The template

**CloudFormation** is AWS's own infrastructure as code (the ideas match [Terraform](#terraform-1)). A template lists **resources**; `!Ref` and `!GetAtt` connect them, `!Sub` builds names from **parameters**, and **outputs** expose what other tools need.

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > stack.yaml <<'EOF'
AWSTemplateFormatVersion: "2010-09-09"
Description: Order import pipeline - files land in S3, a queue feeds a worker, results go to DynamoDB
Parameters:
  Env: {Type: String, Default: dev, AllowedValues: [dev, prod]}
Resources:
  DeadLetters:
    Type: AWS::SQS::Queue
    Properties: {QueueName: !Sub "orders-import-dlq-${Env}"}
  ImportQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "orders-import-${Env}"
      VisibilityTimeout: 120
      RedrivePolicy: {deadLetterTargetArn: !GetAtt DeadLetters.Arn, maxReceiveCount: 3}
  Orders:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "orders-${Env}"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions: [{AttributeName: order_id, AttributeType: S}]
      KeySchema: [{AttributeName: order_id, KeyType: HASH}]
  Uploads:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "orders-uploads-demo-${Env}"
      PublicAccessBlockConfiguration: {BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true}
  WorkerRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement: [{Effect: Allow, Principal: {Service: lambda.amazonaws.com}, Action: sts:AssumeRole}]
      Policies:
        - PolicyName: least-privilege
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - {Effect: Allow, Action: [sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes], Resource: !GetAtt ImportQueue.Arn}
              - {Effect: Allow, Action: s3:GetObject, Resource: !Sub "${Uploads.Arn}/incoming/*"}
              - {Effect: Allow, Action: dynamodb:PutItem, Resource: !GetAtt Orders.Arn}
Outputs:
  QueueUrl: {Value: !Ref ImportQueue}
  Bucket: {Value: !Ref Uploads}
  Table: {Value: !Ref Orders}
EOF
echo template ready
```

The worker role allows exactly three things: read and delete from this queue, read objects under `incoming/` in this bucket, and put items in this table.

## 3. Deploy, run, check, tear down

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a11_project.py <<'EOF'
# The project: deploy a stack from a template, run the pipeline end to end, check it, tear it down (moto plays AWS).
import boto3, csv, io, json, urllib.parse
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    cfn, s3, sqs = (boto3.client(s, region_name=R) for s in ("cloudformation", "s3", "sqs"))
    cfn.create_stack(StackName="orders-import-dev", TemplateBody=open("stack.yaml").read(),
                     Parameters=[{"ParameterKey": "Env", "ParameterValue": "dev"}], Capabilities=["CAPABILITY_IAM"])
    st = cfn.describe_stacks(StackName="orders-import-dev")["Stacks"][0]
    out = {o["OutputKey"]: o["OutputValue"] for o in st["Outputs"]}
    print("stack:", st["StackStatus"], "| resources:", sorted(r["ResourceType"] for r in cfn.list_stack_resources(StackName="orders-import-dev")["StackResourceSummaries"]))
    print("outputs:", {k: v.split("/")[-1] for k, v in out.items()})
    qarn = sqs.get_queue_attributes(QueueUrl=out["QueueUrl"], AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    s3.put_bucket_notification_configuration(Bucket=out["Bucket"], NotificationConfiguration={"QueueConfigurations": [
        {"QueueArn": qarn, "Events": ["s3:ObjectCreated:*"], "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "incoming/"}]}}}]})
    table = boto3.resource("dynamodb", region_name=R).Table(out["Table"])

    def worker(batch):                     # what the Lambda function would run for each batch of queue messages
        stored = 0
        for m in batch:
            for rec in json.loads(m["Body"]).get("Records", []):
                key = urllib.parse.unquote_plus(rec["s3"]["object"]["key"])     # keys arrive URL-encoded in S3 events
                body = s3.get_object(Bucket=rec["s3"]["bucket"]["name"], Key=key)["Body"].read().decode()
                for row in csv.DictReader(io.StringIO(body)):
                    table.put_item(Item={"order_id": row["order_id"], "customer": row["customer"], "amount": int(row["amount"]), "source": key})
                    stored += 1
            sqs.delete_message(QueueUrl=out["QueueUrl"], ReceiptHandle=m["ReceiptHandle"])
        return stored

    s3.put_object(Bucket=out["Bucket"], Key="incoming/2026-11-24.csv", Body=b"order_id,customer,amount\nA-1,asha,499\nA-2,ben,1299\nA-3,chen,250\n")
    s3.put_object(Bucket=out["Bucket"], Key="incoming/2026-11-24.csv", Body=b"order_id,customer,amount\nA-1,asha,499\nA-2,ben,1299\nA-3,chen,250\n")  # the same file again
    total = 0
    while (batch := sqs.receive_message(QueueUrl=out["QueueUrl"], MaxNumberOfMessages=10).get("Messages", [])): total += worker(batch)
    items = table.scan()["Items"]
    print(f"worker wrote {total} rows; the table holds {len(items)} orders (order_id is the key, so a repeated file does not duplicate)")
    print("orders:", sorted((i["order_id"], i["customer"], int(i["amount"])) for i in items))

    s3.delete_object(Bucket=out["Bucket"], Key="incoming/2026-11-24.csv")      # a stack cannot delete a bucket that still has files
    cfn.delete_stack(StackName="orders-import-dev")
    print("after teardown, stacks:", [s["StackName"] for s in cfn.list_stacks(StackStatusFilter=["CREATE_COMPLETE"])["StackSummaries"]],
          "| tables:", boto3.client("dynamodb", region_name=R).list_tables()["TableNames"])
EOF
python3 a11_project.py
```

- The stack reached `CREATE_COMPLETE` with five resources, and the outputs gave the names the code needs. No name was typed twice.
- Object keys arrive **URL-encoded** in S3 events (a space becomes `+`), so the worker decodes them: a classic bug in real pipelines.
- The same file was uploaded twice and the worker wrote 6 rows, but the table holds **3 orders**: `order_id` is the key, so repeats overwrite instead of duplicating. That is **idempotency** in practice, and it matters because S3 events and SQS are at-least-once ([lesson 8](#aws-8)).
- **Teardown**: empty the bucket, delete the stack, and every resource is gone. That is how you keep a learning account at zero cost.

## 4. Running it for real

```term
aws cloudformation validate-template --template-body file://stack.yaml
aws cloudformation deploy --template-file stack.yaml --stack-name orders-import-dev \
  --parameter-overrides Env=dev --capabilities CAPABILITY_IAM
aws cloudformation describe-stacks --stack-name orders-import-dev --query "Stacks[0].Outputs"
aws cloudformation create-change-set ...      # preview changes to prod before applying them
aws s3 rm s3://orders-uploads-demo-dev --recursive && aws cloudformation delete-stack --stack-name orders-import-dev
```

To finish the production version: add the Lambda function and its event source mapping on the queue to the template, a queue policy that lets S3 send to the queue, the bucket notification, alarms on queue age and DLQ depth ([lesson 10](#aws-10)), and deploy through a pipeline with a change set review for prod ([CI/CD for infrastructure](#cloudsenior-10)). Put it on your portfolio with the architecture drawing, the template and a short write-up of the idempotency and failure handling.

## Common misconceptions

- "Click it together in the console first, write code later." Later rarely comes; templates make environments repeatable from day one.
- "Deleting the stack deletes everything." Non-empty buckets block deletion, and resources with `DeletionPolicy: Retain` stay on purpose.
- "The worker runs once per file." Events can arrive twice; design for repeats.

## Practice (answers below)

1. Add a `Retain` deletion policy to the table. What does teardown leave behind, and why might prod want that?
2. A partner uploads `orders 24 nov.csv`. What does the event key look like, and what happens without `unquote_plus`?
3. How would you make the worker reject a file whose `amount` column is not a number, without blocking other files?

:::recap
- A **CloudFormation** template defines resources, parameters, references and outputs; one stack per environment.
- S3 events -> SQS -> worker -> DynamoDB, with a **DLQ** and a **least-privilege** role.
- Decode event keys; make writes **idempotent** with natural keys.
- Deploy, verify outputs, and **tear down** to keep costs at zero; use change sets for prod.
:::

:::note Answers
1. The table survives `delete-stack` (data kept on purpose); in prod you never want a template mistake to delete customer data. 2. `incoming/orders+24+nov.csv`; without decoding, `get_object` asks for a key that does not exist and fails, and after three tries the message goes to the dead-letter queue. 3. Validate each row; on a bad file, write it to an `errors/` prefix (or a report) and delete the message so it is not retried; or let it fail to the DLQ and alarm on DLQ depth. Either way other files continue.
:::

```quiz
? What does !GetAtt ImportQueue.Arn give you?
+ The queue's ARN, created by the stack
- The queue's messages
- A new queue
- The template's name
! References connect resources without typing names.

? Why did a repeated upload not create duplicate orders?
+ order_id is the table key, so the second write overwrote the same items
- S3 ignored the second upload
- SQS dropped the event
- DynamoDB refuses all repeats
! Idempotency through natural keys.

? What blocks deleting a stack that contains a bucket?
+ Objects still in the bucket
- The bucket's name
- Versioning being off
- Public access block
! Empty it first, or keep it with a deletion policy.
```
