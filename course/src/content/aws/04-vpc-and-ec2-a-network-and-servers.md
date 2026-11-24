---
track: aws
title: "VPC and EC2: a private network and the servers in it"
short: VPC and EC2
sub: Build the standard two-zone network: public subnets with an internet gateway, private subnets that go out through NAT, security groups that chain tier to tier, and servers with no public address.
---

:::goals
- design a VPC with public and private subnets in two availability zones
- explain route tables, the internet gateway and the NAT gateway
- chain security groups so each tier only accepts the tier in front of it
- launch EC2 instances with user data and reach them without SSH keys
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

## 1. The shape almost every app uses

A **VPC** is your private network in a region (here `10.0.0.0/16`, 65,536 addresses). Inside it, **subnets** live in one zone each. The pattern:

- **Public subnets** (one per zone): their route table sends `0.0.0.0/0` to an **internet gateway**. Only load balancers and NAT gateways live here.
- **Private subnets** (one per zone): no route from the internet. Servers and databases live here. For updates they go **out** through a **NAT gateway** in a public subnet.

Networking basics (CIDR, routes) are in [Networking](#networking-1) and the design view in [Cloud networking](#cloud-2).

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a4_vpc.py <<'EOF'
# A two-zone network: public subnets for the load balancer, private subnets for servers,
# security groups that only let each tier talk to the next one (moto plays AWS).
import boto3
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    ec2 = boto3.client("ec2", region_name=R)
    vpc = ec2.create_vpc(CidrBlock="10.0.0.0/16")["Vpc"]["VpcId"]
    sub = {}
    for name, cidr, az in [("public-a", "10.0.0.0/24", "a"), ("public-b", "10.0.1.0/24", "b"),
                           ("private-a", "10.0.10.0/24", "a"), ("private-b", "10.0.11.0/24", "b")]:
        sub[name] = ec2.create_subnet(VpcId=vpc, CidrBlock=cidr, AvailabilityZone=R + az,
                                      TagSpecifications=[{"ResourceType": "subnet", "Tags": [{"Key": "Name", "Value": name}]}])["Subnet"]["SubnetId"]
    igw = ec2.create_internet_gateway()["InternetGateway"]["InternetGatewayId"]
    ec2.attach_internet_gateway(InternetGatewayId=igw, VpcId=vpc)
    public_rt = ec2.create_route_table(VpcId=vpc)["RouteTable"]["RouteTableId"]
    ec2.create_route(RouteTableId=public_rt, DestinationCidrBlock="0.0.0.0/0", GatewayId=igw)
    for s in ("public-a", "public-b"): ec2.associate_route_table(RouteTableId=public_rt, SubnetId=sub[s])
    eip = ec2.allocate_address(Domain="vpc")["AllocationId"]
    nat = ec2.create_nat_gateway(SubnetId=sub["public-a"], AllocationId=eip)["NatGateway"]["NatGatewayId"]
    private_rt = ec2.create_route_table(VpcId=vpc)["RouteTable"]["RouteTableId"]
    ec2.create_route(RouteTableId=private_rt, DestinationCidrBlock="0.0.0.0/0", NatGatewayId=nat)
    for s in ("private-a", "private-b"): ec2.associate_route_table(RouteTableId=private_rt, SubnetId=sub[s])

    def sg(name, desc): return ec2.create_security_group(GroupName=name, Description=desc, VpcId=vpc)["GroupId"]
    lb_sg, app_sg, db_sg = sg("lb", "HTTPS from the internet"), sg("app", "only from the load balancer"), sg("db", "only from the app")
    ec2.authorize_security_group_ingress(GroupId=lb_sg, IpPermissions=[{"IpProtocol": "tcp", "FromPort": 443, "ToPort": 443, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}])
    ec2.authorize_security_group_ingress(GroupId=app_sg, IpPermissions=[{"IpProtocol": "tcp", "FromPort": 8080, "ToPort": 8080, "UserIdGroupPairs": [{"GroupId": lb_sg}]}])
    ec2.authorize_security_group_ingress(GroupId=db_sg, IpPermissions=[{"IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432, "UserIdGroupPairs": [{"GroupId": app_sg}]}])

    user_data = "#!/bin/bash\ndnf install -y nginx\nsystemctl enable --now nginx\n"
    inst = ec2.run_instances(ImageId="ami-12c6146b", InstanceType="t3.micro", MinCount=2, MaxCount=2,
                             SubnetId=sub["private-a"], SecurityGroupIds=[app_sg], UserData=user_data,
                             TagSpecifications=[{"ResourceType": "instance", "Tags": [{"Key": "app", "Value": "shop"}]}])["Instances"]

    names = {v: k for k, v in sub.items()}
    for s in ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc]}])["Subnets"]:
        print(f"subnet {names[s['SubnetId']]:9} {s['CidrBlock']:13} {s['AvailabilityZone']}")
    for rt, label in [(public_rt, "public"), (private_rt, "private")]:
        routes = ec2.describe_route_tables(RouteTableIds=[rt])["RouteTables"][0]["Routes"]
        print(f"{label:7} routes:", [(r["DestinationCidrBlock"], r.get("GatewayId") or r.get("NatGatewayId")) for r in routes])
    for g in ec2.describe_security_groups(GroupIds=[lb_sg, app_sg, db_sg])["SecurityGroups"]:
        rules = [(p["FromPort"], [x["CidrIp"] for x in p["IpRanges"]] or ["sg:" + {lb_sg: "lb", app_sg: "app"}[x["GroupId"]] for x in p["UserIdGroupPairs"]]) for p in g["IpPermissions"]]
        print(f"security group {g['GroupName']:3} allows in:", rules)
    for i in inst: print("instance", i["InstanceId"][:10] + "...", i["InstanceType"], "private ip", i["PrivateIpAddress"], "public ip", i.get("PublicIpAddress"))
EOF
python3 a4_vpc.py
```

Read the output from the top: four subnets in two zones; the public route table points at `igw-...`, the private one at `nat-...`; and the security groups form a chain: the internet may reach the load balancer on 443, the load balancer may reach the app on 8080, the app may reach the database on 5432. Nothing else. The servers have **no public IP**.

## 2. Security groups and network ACLs

- **Security groups** are stateful firewalls on each network interface: allow rules only, and replies are allowed automatically. Referencing another **group** instead of an IP range (as above) keeps working when servers come and go.
- **Network ACLs** are stateless rules on a subnet, with allow and deny. Most teams leave them open and use security groups.

## 3. EC2 instances

An instance is a virtual machine: an **AMI** (the disk image), an **instance type** (t3.micro: 2 vCPU, 1 GB), storage (EBS volumes), a subnet, security groups, and an **instance profile** (the role, [lesson 2](#aws-2)). **User data** is a script that runs at first boot; the script above installs nginx. For many servers, build the setup into the image or use a launch template ([lesson 5](#aws-5)).

Reaching a private server: use **Systems Manager Session Manager**. No SSH port, no keys to manage, every session logged:

```term
aws ec2 describe-instances --filters Name=tag:app,Values=shop \
  --query "Reservations[].Instances[].[InstanceId,PrivateIpAddress,State.Name]" --output table
aws ssm start-session --target i-0abc123def4567890
```

## 4. Cost traps

A **NAT gateway** is charged per hour and per GB, even when idle; it is often the biggest surprise in a learning account. Delete it when you finish, or use **VPC endpoints** for S3 and DynamoDB so that traffic skips NAT. Stopped instances do not pay for compute, but their EBS volumes and Elastic IPs still cost money.

## Common misconceptions

- "A private subnet cannot reach the internet." It can go out through NAT; it cannot be reached from the internet.
- "Open SSH to 0.0.0.0/0 for a minute is fine." Bots scan constantly; use Session Manager.
- "One subnet is enough." A subnet is in one zone; you need at least two zones for high availability.

## Practice (answers below)

1. Add a third tier: a cache security group on port 6379 that only accepts the app group.
2. Your private instance cannot download packages. Name three things to check.
3. Why reference the load balancer's security group in the app rule instead of the public subnets' CIDR ranges?

:::recap
- A **VPC** has **public** subnets (route to an internet gateway) and **private** subnets (out through **NAT**), in at least two zones.
- **Security groups** are stateful; chain them by group reference, tier to tier.
- EC2 = AMI + type + storage + subnet + groups + role; reach private servers with **Session Manager**.
- Watch NAT gateway, idle volume and Elastic IP costs.
:::

:::note Answers
1. `cache_sg = sg("cache", "only from the app")` and `authorize_security_group_ingress(GroupId=cache_sg, IpPermissions=[{"IpProtocol": "tcp", "FromPort": 6379, "ToPort": 6379, "UserIdGroupPairs": [{"GroupId": app_sg}]}])`. 2. The private route table has `0.0.0.0/0` to a NAT gateway; the NAT is in a public subnet whose route goes to the internet gateway; the security group and network ACL allow outbound traffic. 3. Only traffic from the load balancer itself is allowed, not anything else that might be placed in those subnets, and it keeps working if the subnets change.
:::

```quiz
? What makes a subnet public?
+ Its route table sends 0.0.0.0/0 to an internet gateway
- Its name contains public
- It has a NAT gateway inside
- It uses a /24 range
! Routing, not the name, decides.

? How do servers in a private subnet download updates?
+ Through a NAT gateway in a public subnet
- Directly through the internet gateway
- They cannot
- Through the load balancer
! NAT allows outbound connections only.

? The safest way to get a shell on a private instance is:
+ Systems Manager Session Manager
- Open port 22 to the world
- Give it a public IP
- Email the key to the team
! No open ports, no keys, sessions logged.
```
