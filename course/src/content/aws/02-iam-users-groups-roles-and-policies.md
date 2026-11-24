---
track: aws
title: "IAM: users, groups, roles and policies"
short: IAM
sub: Who may do what: policies as JSON, how AWS evaluates them (explicit deny beats allow beats the default deny), groups for people, roles for machines, and temporary credentials.
---

:::goals
- read and write an IAM policy
- explain how AWS evaluates a request across several policies
- use groups for people and roles for machines and services
- apply least privilege and find risky access keys
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them. The plain-Python models in this lesson do run in the lab.
:::

## 1. A policy is a list of statements

```term
{"Version": "2012-10-17",
 "Statement": [{"Effect": "Allow",
                "Action": ["s3:GetObject", "s3:ListBucket"],
                "Resource": ["arn:aws:s3:::reports", "arn:aws:s3:::reports/*"],
                "Condition": {"Bool": {"aws:SecureTransport": "true"}}}]}
```

**Effect** (Allow or Deny), **Action** (service:operation, wildcards allowed), **Resource** (an ARN, the unique name of a resource) and an optional **Condition** (IP range, MFA present, tags, time). Note the two resources: listing is an action on the bucket, reading is on the objects inside it.

## 2. How AWS decides

Every request starts **denied**. If any matching statement says **Deny**, the answer is no, whatever else allows it. Otherwise, if some statement **Allows** it, the answer is yes. This little model shows the rules (real AWS also checks organisation guardrails, permission boundaries and resource policies, with the same deny-wins logic):

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > iam_eval.py <<'EOF'
# How AWS decides "allowed or not" for one request, in plain Python.
# Rules: everything starts denied; an Allow that matches lets it through; any matching Deny wins over every Allow.
import fnmatch, ipaddress
def matches(pattern, value):
    return any(fnmatch.fnmatchcase(value, p) for p in ([pattern] if isinstance(pattern, str) else pattern))
def decide(policies, action, resource, context):
    allowed = False
    for pol in policies:
        for st in pol["Statement"]:
            if not (matches(st["Action"], action) and matches(st["Resource"], resource)): continue
            cond = st.get("Condition", {}).get("IpAddress", {}).get("aws:SourceIp")
            if cond and ipaddress.ip_address(context["ip"]) not in ipaddress.ip_network(cond): continue   # condition not met
            if st["Effect"] == "Deny": return "DENY (explicit deny)"
            allowed = True
    return "ALLOW" if allowed else "DENY (nothing allowed it)"

reader = {"Statement": [{"Effect": "Allow", "Action": ["s3:GetObject", "s3:ListBucket"], "Resource": ["arn:aws:s3:::reports", "arn:aws:s3:::reports/*"]}]}
uploader = {"Statement": [{"Effect": "Allow", "Action": "s3:PutObject", "Resource": "arn:aws:s3:::reports/incoming/*"}]}
guard = {"Statement": [{"Effect": "Deny", "Action": "s3:*", "Resource": "*", "Condition": {"IpAddress": {"aws:SourceIp": "203.0.113.0/24"}}},
                       {"Effect": "Deny", "Action": "s3:DeleteObject", "Resource": "arn:aws:s3:::reports/*"}]}
office, cafe = {"ip": "10.20.0.15"}, {"ip": "203.0.113.9"}
tests = [("read a report", [reader], "s3:GetObject", "arn:aws:s3:::reports/2026/nov.pdf", office),
         ("upload to incoming/", [reader, uploader], "s3:PutObject", "arn:aws:s3:::reports/incoming/a.csv", office),
         ("upload elsewhere", [reader, uploader], "s3:PutObject", "arn:aws:s3:::reports/final/a.csv", office),
         ("delete, even with s3:* allowed", [{"Statement": [{"Effect": "Allow", "Action": "s3:*", "Resource": "*"}]}, guard], "s3:DeleteObject", "arn:aws:s3:::reports/x", office),
         ("read from a blocked network", [reader, guard], "s3:GetObject", "arn:aws:s3:::reports/x", cafe),
         ("read another bucket", [reader], "s3:GetObject", "arn:aws:s3:::payroll/x", office)]
for name, pols, act, res, ctx in tests: print(f"{name:32} {decide(pols, act, res, ctx)}")
EOF
python3 iam_eval.py
```

Read each line against the policies: the upload outside `incoming/` was never allowed; the delete was allowed by `s3:*` but an explicit deny won; the café network matched the deny condition.

## 3. Groups, roles and temporary credentials

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a2_iam.py <<'EOF'
# Users, groups, roles and policies with boto3 (moto plays AWS).
import boto3, json
from moto import mock_aws
with mock_aws():
    iam, sts = boto3.client("iam"), boto3.client("sts", region_name="ap-south-1")
    read_reports = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": ["s3:GetObject", "s3:ListBucket"],
                    "Resource": ["arn:aws:s3:::reports", "arn:aws:s3:::reports/*"]}]}
    arn = iam.create_policy(PolicyName="ReadReports", PolicyDocument=json.dumps(read_reports))["Policy"]["Arn"]
    # people: a group carries the permissions, users join the group
    iam.create_group(GroupName="analysts"); iam.attach_group_policy(GroupName="analysts", PolicyArn=arn)
    for u in ["asha", "ben"]:
        iam.create_user(UserName=u); iam.add_user_to_group(GroupName="analysts", UserName=u)
    print("analysts:", [u["UserName"] for u in iam.get_group(GroupName="analysts")["Users"]],
          "| policies:", [p["PolicyName"] for p in iam.list_attached_group_policies(GroupName="analysts")["AttachedPolicies"]])
    # machines: a role that a service (here EC2) may assume; no long-lived keys at all
    trust = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    role = iam.create_role(RoleName="report-builder", AssumeRolePolicyDocument=json.dumps(trust), MaxSessionDuration=3600)["Role"]
    iam.attach_role_policy(RoleName="report-builder", PolicyArn=arn)
    print("role:", role["Arn"])
    creds = sts.assume_role(RoleArn=role["Arn"], RoleSessionName="nightly-job", DurationSeconds=900)["Credentials"]
    print("temporary key:", creds["AccessKeyId"][:4] + "...", "| expires:", "yes, after 15 minutes" if creds["Expiration"] else "never")
    # an access key for a user is long-lived: list them so you can find and rotate old ones
    key = iam.create_access_key(UserName="ben")["AccessKey"]
    print("ben's key status:", key["Status"], "| keys for asha:", len(iam.list_access_keys(UserName="asha")["AccessKeyMetadata"]))
EOF
python3 a2_iam.py
```

- **Groups** hold permissions for people with the same job; you add and remove people, not policies.
- **Roles** have no password or permanent key. A **trust policy** says who may assume the role (here the EC2 service), and **STS** hands out credentials that expire (`ASIA...` keys are temporary; `AKIA...` keys are long-lived).
- **Access keys** for users are long-lived: list them, rotate them, and prefer none at all.

In the CLI:

```term
aws iam create-role --role-name report-builder --assume-role-policy-document file://trust.json
aws iam attach-role-policy --role-name report-builder --policy-arn arn:aws:iam::123456789012:policy/ReadReports
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/report-builder --role-session-name test
aws iam generate-credential-report && aws iam get-credential-report    # old keys, users without MFA
```

## 4. Least privilege in practice

Start from AWS managed policies to explore, then narrow: **IAM Access Analyzer** can generate a policy from what a role actually used in CloudTrail. Avoid `"Action": "*"` and `"Resource": "*"` together. Use **Service Control Policies** at the organisation level for guardrails no account can override (for example "never disable CloudTrail", "only these regions").

## Common misconceptions

- "Deny is the default, so I never need Deny statements." Explicit denies are how you set guardrails that no Allow elsewhere can override.
- "A role is a kind of user." A role has no long-lived credentials; something assumes it and gets temporary ones.
- "AdministratorAccess for the CI pipeline is fine, it is internal." A compromised pipeline then owns the account.

## Practice (answers below)

1. Add a test to `iam_eval.py`: the uploader tries `s3:PutObject` on `reports/incoming/x` from the café network. Predict, then run.
2. Write a statement that lets a role read only objects under `logs/2026/` in bucket `audit`.
3. Why do people prefer groups to attaching policies to each user?

:::recap
- A policy is **Effect, Action, Resource, Condition**.
- Evaluation: default **deny**, an **allow** opens it, an explicit **deny** always wins.
- **Groups** for people, **roles** with trust policies for machines; STS gives **temporary** credentials.
- Least privilege: narrow policies, Access Analyzer, organisation guardrails, no long-lived keys.
:::

:::note Answers
1. DENY (explicit deny): the IP condition on the guard's `s3:*` deny matches, and deny beats allow. 2. `{"Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::audit/logs/2026/*"}`. 3. Permissions are managed once per job; when someone changes team you move them between groups, and nothing is forgotten on individual users.
:::

```quiz
? A user has an Allow for s3:* and a Deny for s3:DeleteObject. Can they delete?
+ No, the explicit deny wins
- Yes, the allow is broader
- Only on weekends
- Only with MFA
! Deny beats allow in IAM evaluation.

? What does a role's trust policy define?
+ Who is allowed to assume the role
- What the role may do
- The role's password
- Which region it lives in
! Permissions policies say what; the trust policy says who.

? Credentials whose key ID starts with ASIA are:
+ Temporary credentials from STS
- The root user's keys
- Permanent user keys
- Encryption keys
! AKIA keys are long-lived; ASIA keys expire.
```
