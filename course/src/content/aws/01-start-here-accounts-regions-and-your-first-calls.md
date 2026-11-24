---
track: aws
title: "Start here: accounts, regions and your first AWS calls"
short: Start here
sub: How an AWS account is organised, regions and availability zones, the console, CLI and SDK, where credentials come from, and the budget alarm to set before anything else.
---

:::goals
- explain accounts, regions and availability zones
- make your first SDK calls and read who you are calling as
- know the order in which the CLI and SDK look for credentials, and why long-lived keys are a risk
- protect yourself from surprise bills with a budget and alerts
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

:::note Before this track
Read [Cloud fundamentals](#cloud-1) for what the cloud is and the shared responsibility model. This track is the hands-on AWS companion: each lesson builds one part of a small web shop.
:::

## 1. How AWS is organised

- An **account** is the container for everything you create and the unit of billing. Companies use many accounts (dev, test, prod, security) grouped in **AWS Organizations** ([landing zones](#cloudsenior-3)).
- A **region** is a geographic area such as `ap-south-1` (Mumbai) or `us-east-1` (N. Virginia). Data stays in the region you choose; prices and available services differ by region.
- Each region has several **availability zones** (AZs): separate data centres with their own power and network, a few milliseconds apart. Spreading across two or three zones is how you survive a data centre failure.
- A few services are **global** (IAM, Route 53, CloudFront); most are regional.

## 2. Three ways to talk to AWS

The **console** (web UI) for exploring, the **CLI** for scripts, and **SDKs** (boto3 for Python) for programs. All three call the same APIs, so anything you click can be automated.

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a1_start.py <<'EOF'
# Your first AWS calls with the Python SDK (boto3). moto plays AWS here, inside this process:
# no account, no cost. Remove the two moto lines and the same code talks to a real account.
import boto3
from moto import mock_aws
with mock_aws():
    session = boto3.Session(region_name="ap-south-1")          # Mumbai; pick the region closest to your users
    who = session.client("sts").get_caller_identity()
    print("account:", who["Account"], "| identity:", who["Arn"])
    regions = sorted(r["RegionName"] for r in session.client("ec2").describe_regions()["Regions"])
    print(len(regions), "regions, for example:", [r for r in regions if r.startswith("ap-")][:6])
    zones = session.client("ec2").describe_availability_zones()["AvailabilityZones"]
    print("zones in ap-south-1:", [z["ZoneName"] for z in zones])

    # a monthly budget with an e-mail alert at 80%: the first thing to create in a new account
    budgets = session.client("budgets", region_name="us-east-1")
    budgets.create_budget(AccountId=who["Account"],
        Budget={"BudgetName": "monthly-10-usd", "BudgetLimit": {"Amount": "10", "Unit": "USD"},
                "TimeUnit": "MONTHLY", "BudgetType": "COST"},
        NotificationsWithSubscribers=[{"Notification": {"NotificationType": "ACTUAL", "ComparisonOperator": "GREATER_THAN",
                                                         "Threshold": 80, "ThresholdType": "PERCENTAGE"},
                                       "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "you@example.com"}]}])
    b = budgets.describe_budgets(AccountId=who["Account"])["Budgets"][0]
    print("budget:", b["BudgetName"], b["BudgetLimit"]["Amount"], b["BudgetLimit"]["Unit"], b["TimeUnit"])
EOF
python3 a1_start.py
```

`get_caller_identity` is the first command to run when something says "access denied": it tells you **which identity** you are actually using. The same in the CLI:

```term
aws configure sso                       # log in through your organisation's single sign-on (recommended)
aws sts get-caller-identity             # who am I?
aws ec2 describe-availability-zones --region ap-south-1 --query "AvailabilityZones[].ZoneName"
```

## 3. Where credentials come from

The CLI and SDKs look in a fixed order: values passed in code, then **environment variables** (`AWS_ACCESS_KEY_ID`...), then the shared **config and credentials files** in `~/.aws` (including SSO profiles), then the **role of the machine** they run on (an EC2 instance profile, an ECS task role, a Lambda execution role).

The safe habits:

- People log in with **SSO** (IAM Identity Center) and get short-lived credentials; they do not get access keys.
- Programs on AWS use **roles**; nothing stores a key.
- CI systems use **OIDC federation** to assume a role, again without stored keys.
- **Never** use the root user for daily work: enable MFA on it, lock it away.

## 4. Protect your wallet first

New learners' most common AWS disaster is a bill: a forgotten instance, a NAT gateway left running, a key leaked to GitHub and used for crypto mining. Before building anything, create a **budget with an email alert** (the script above did exactly that), turn on **free tier usage alerts**, and delete what you build at the end of each session ([lesson 11](#aws-11) tears a whole stack down in one call).

## Common misconceptions

- "A region and an availability zone are the same." A region contains several zones; resilience comes from using more than one zone.
- "Access keys in ~/.aws are fine for everything." Long-lived keys leak; use SSO for people and roles for machines.
- "The free tier means I cannot be charged." Many services and sizes are not free, and free amounts run out; set a budget.

## Practice (answers below)

1. Change the region in `a1_start.py` to `eu-west-1`. What changes in the output?
2. A colleague gets "AccessDenied" running a script that works for you. What is the first command you ask them to run?
3. Why should a production web server not have access keys in a file?

:::recap
- An **account** holds resources; **regions** hold several **availability zones**.
- Console, CLI and SDK call the same APIs; `sts get-caller-identity` shows who you are.
- Credentials: SSO for people, **roles** for machines, OIDC for CI, no root, no long-lived keys.
- Set a **budget alert** before you build anything, and clean up after each session.
:::

:::note Answers
1. The zone names change to `eu-west-1a`, `-1b`, `-1c`; the account and identity stay the same. 2. `aws sts get-caller-identity`, to see which identity (and account) their script is really using. 3. Anyone who gets into the server, or a backup of it, gets permanent keys; an instance role gives short-lived credentials that rotate automatically.
:::

```quiz
? What is an availability zone?
+ One or more separate data centres inside a region
- A country
- A billing account
- A type of server
! Regions have several zones for resilience.

? How should a program running on EC2 get AWS credentials?
+ From the instance's IAM role
- From keys in the code
- From the root user
- From an e-mail
! Roles give short-lived credentials automatically.

? What should you set up first in a new learning account?
+ A budget with an alert
- A large database
- Public S3 buckets
- Ten EC2 instances
! It stops a surprise bill from going unnoticed.
```
