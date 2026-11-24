---
track: aws
title: "Serverless: Lambda functions"
short: Lambda
sub: Write a function as a handler, test it locally with a real event shape, then deploy it with a least-privilege role, configuration in environment variables, versions, an alias with a canary, and a function URL.
---

:::goals
- write a Lambda handler and test it locally with an HTTP API event
- deploy a function with a role, memory, timeout and environment variables
- use versions and an alias to release safely with a canary
- know Lambda's limits and when a container or server fits better
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them. The handler test is plain Python and runs in the lab.
:::

## 1. What Lambda is

**AWS Lambda** runs your function when an event arrives (an HTTP request, a file in S3, a queue message, a schedule) and charges per request and per millisecond. No servers to patch, scaling from zero to thousands of copies by itself. You write a **handler**; AWS calls it with an **event** (what happened) and a **context** (request ID, time left).

## 2. Write it, test it locally

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > handler.py <<'EOF'
# A Lambda function: AWS calls handler(event, context) for each request. Nothing else runs between requests.
import json, os
TAX = float(os.environ.get("TAX_RATE", "0.18"))          # configuration comes from environment variables
def handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "use POST"})}
    try:
        items = json.loads(event.get("body") or "{}")["items"]
        subtotal = sum(i["price"] * i["qty"] for i in items)
    except (KeyError, TypeError, ValueError):
        return {"statusCode": 400, "body": json.dumps({"error": "send {\"items\": [{\"price\": .., \"qty\": ..}]}"})}
    print(json.dumps({"level": "info", "msg": "quote", "items": len(items), "request": context.aws_request_id}))  # goes to CloudWatch Logs
    return {"statusCode": 200, "headers": {"content-type": "application/json"},
            "body": json.dumps({"subtotal": subtotal, "tax": round(subtotal * TAX, 2), "total": round(subtotal * (1 + TAX), 2)})}
EOF
cat > test_handler.py <<'EOF'
# Test the function on your machine with the same event shape API Gateway (HTTP API) sends.
import json, types
from handler import handler
ctx = types.SimpleNamespace(aws_request_id="test-1", get_remaining_time_in_millis=lambda: 3000)
def call(method, body): return handler({"requestContext": {"http": {"method": method}}, "body": json.dumps(body) if body is not None else None}, ctx)
r = call("POST", {"items": [{"price": 499, "qty": 2}, {"price": 120, "qty": 1}]}); print(r["statusCode"], r["body"])
r = call("POST", {"wrong": 1});                                                    print(r["statusCode"], r["body"])
r = call("GET", None);                                                             print(r["statusCode"], r["body"])
EOF
python3 test_handler.py
```

The test feeds the same JSON shape that API Gateway's HTTP API (and function URLs) send. Testing locally like this is fast and needs no AWS; most bugs are found here. The `print` of a JSON line is how you log: it goes to CloudWatch Logs ([lesson 10](#aws-10)).

## 3. Deploy it

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a7_deploy.py <<'EOF'
# Deploy the function: zip the code, give it a role, set config, publish a version and point an alias at it (moto plays AWS).
import os; os.environ["MOTO_IAM_LOAD_MANAGED_POLICIES"] = "true"   # let moto know the AWS-managed policies
import boto3, io, json, zipfile
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    iam, lam = boto3.client("iam"), boto3.client("lambda", region_name=R)
    trust = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    role = iam.create_role(RoleName="quote-fn", AssumeRolePolicyDocument=json.dumps(trust))["Role"]["Arn"]
    iam.attach_role_policy(RoleName="quote-fn", PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")  # write logs only
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z: z.write("handler.py")
    fn = lam.create_function(FunctionName="quote", Runtime="python3.12", Role=role, Handler="handler.handler",
                             Code={"ZipFile": buf.getvalue()}, MemorySize=256, Timeout=10, Environment={"Variables": {"TAX_RATE": "0.18"}})
    print("function:", fn["FunctionName"], fn["Runtime"], f"{fn['MemorySize']} MB", f"timeout {fn['Timeout']} s", "| env:", fn["Environment"]["Variables"])
    v1 = lam.publish_version(FunctionName="quote")["Version"]
    lam.create_alias(FunctionName="quote", Name="live", FunctionVersion=v1)
    lam.update_function_configuration(FunctionName="quote", Environment={"Variables": {"TAX_RATE": "0.12"}})
    v2 = lam.publish_version(FunctionName="quote")["Version"]
    lam.update_alias(FunctionName="quote", Name="live", FunctionVersion=v2, RoutingConfig={"AdditionalVersionWeights": {v1: 0.9}})
    a = lam.get_alias(FunctionName="quote", Name="live")
    print(f"alias live -> version {a['FunctionVersion']} gets 10%, version {v1} keeps 90% (a canary)")
    url = lam.create_function_url_config(FunctionName="quote", AuthType="AWS_IAM")["FunctionUrl"]
    print("function URL (callers must sign requests):", url)
EOF
python3 a7_deploy.py
```

- The **execution role** only gets `AWSLambdaBasicExecutionRole` (write logs). Add exactly what the function needs, nothing more.
- **Memory** also sets CPU: more memory often makes a function faster and not more expensive. **Timeout** stops runaway invocations (the maximum is 15 minutes).
- **Configuration** lives in environment variables; secrets come from Secrets Manager or Parameter Store at start-up, not from the code.
- `publish_version` freezes code and configuration as version 1, 2... An **alias** (`live`) points at a version, and can split traffic: here 10% to the new version, 90% to the old, a **canary**. If errors rise, point the alias back.
- A **function URL** gives the function an HTTPS endpoint; `AWS_IAM` means callers must sign requests. For a public API with throttling, keys and custom domains use **API Gateway**.

moto cannot execute the function (that needs Docker), which is why section 2 runs it locally. On real AWS:

```term
aws lambda invoke --function-name quote:live --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext": {"http": {"method": "POST"}}, "body": "{\"items\": [{\"price\": 499, \"qty\": 2}]}"}' out.json
cat out.json
aws logs tail /aws/lambda/quote --follow
```

## 4. Limits and fit

- **Cold starts:** the first request on a new copy takes longer (tens to hundreds of milliseconds for Python). Keep packages small; use provisioned concurrency for strict latency.
- **15-minute maximum**, limited memory and temporary disk, no long-lived connections between invocations (use RDS Proxy for databases).
- Great for event-driven glue, APIs with variable traffic, scheduled jobs and file processing. For steady heavy traffic or long-running processes, containers ([lesson 9](#aws-9)) are often cheaper and simpler.

## Common misconceptions

- "Serverless means no servers to think about at all." You still design for limits, cold starts, timeouts, retries and permissions.
- "More memory costs more." Price is memory x time; more memory gives more CPU and can finish sooner, sometimes cheaper.
- "Global variables are shared between all requests." Each copy has its own; values may survive between requests on that copy, which is useful for caching but must not hold per-user state.

## Practice (answers below)

1. Add a test to `test_handler.py` for an item with a negative quantity, and change the handler to return 400 for it.
2. The canary's error rate is higher than the old version's. What do you change?
3. A nightly job takes 40 minutes. Is Lambda a good fit?

:::recap
- A Lambda **handler** takes an **event** and a **context**; test it locally with the real event shape.
- Deploy with a **least-privilege role**, sensible **memory and timeout**, configuration in env vars.
- **Versions** freeze releases; an **alias** can run a **canary** and roll back instantly.
- Mind cold starts and the 15-minute limit; use containers for long or steady heavy work.
:::

:::note Answers
1. Test: `call("POST", {"items": [{"price": 10, "qty": -1}]})`; in the handler, `if any(i["qty"] <= 0 for i in items): return {"statusCode": 400, ...}`. 2. Point the alias fully back to the previous version (`update_alias` with `FunctionVersion=v1` and no routing config), then investigate the logs. 3. No: it exceeds the 15-minute limit. Use a container task (ECS Fargate or AWS Batch), or split the work into smaller pieces through a queue.
:::

```quiz
? What is a Lambda alias?
+ A named pointer to a version, which can split traffic
- A copy of the code
- A DNS record
- An IAM user
! Aliases enable canaries and instant rollback.

? Where should a function get a database password?
+ From Secrets Manager or Parameter Store at run time
- Hard-coded in the handler
- From the event body
- From a public S3 file
! Keep secrets out of code and packages.

? What is the maximum run time of one Lambda invocation?
+ 15 minutes
- 1 minute
- 1 hour
- Unlimited
! Longer work belongs in containers or batches.
```
