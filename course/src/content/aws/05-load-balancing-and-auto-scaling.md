---
track: aws
title: "Load balancing and auto scaling"
short: Scaling
sub: An Application Load Balancer with health checks, an Auto Scaling group across two zones, and a target-tracking policy; then a day of traffic simulated to see how scaling follows load and what it costs.
---

:::goals
- create an application load balancer, target group, listener and health check
- create an auto scaling group from a launch template
- explain target-tracking scaling and its delay
- estimate the cost difference between fixed and automatic capacity
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them. The scaling simulation is plain Python and runs in the lab.
:::

## 1. The pieces

- An **Application Load Balancer** (ALB) lives in the public subnets and spreads HTTP(S) requests over healthy targets. It can route by path or host name and end TLS. A **Network Load Balancer** works at the TCP level for very high throughput.
- A **target group** is the list of servers (or containers, or IPs) behind it, with a **health check**.
- An **Auto Scaling group** (ASG) keeps a number of instances running from a **launch template**, replaces unhealthy ones, and spreads them across zones.

The ideas behind load balancing and stateless services are in [System design](#sysdesign-2).

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a5_scale.py <<'EOF'
# A load balancer in front of an auto scaling group spread over two zones (moto plays AWS).
import boto3
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    ec2, elb, asg = (boto3.client(s, region_name=R) for s in ("ec2", "elbv2", "autoscaling"))
    vpc = ec2.create_vpc(CidrBlock="10.0.0.0/16")["Vpc"]["VpcId"]
    subnets = [ec2.create_subnet(VpcId=vpc, CidrBlock=f"10.0.{i}.0/24", AvailabilityZone=R + z)["Subnet"]["SubnetId"] for i, z in enumerate("ab")]

    lb = elb.create_load_balancer(Name="shop-alb", Subnets=subnets, Scheme="internet-facing", Type="application")["LoadBalancers"][0]
    tg = elb.create_target_group(Name="shop-web", Protocol="HTTP", Port=8080, VpcId=vpc, TargetType="instance",
                                 HealthCheckPath="/health", HealthCheckIntervalSeconds=15, HealthyThresholdCount=2, UnhealthyThresholdCount=3)["TargetGroups"][0]
    elb.create_listener(LoadBalancerArn=lb["LoadBalancerArn"], Protocol="HTTP", Port=80,
                        DefaultActions=[{"Type": "forward", "TargetGroupArn": tg["TargetGroupArn"]}])
    print("load balancer:", lb["DNSName"])
    print("health check:", tg["HealthCheckPath"], "every", tg["HealthCheckIntervalSeconds"], "s; unhealthy after", tg["UnhealthyThresholdCount"], "failures")

    ec2.create_launch_template(LaunchTemplateName="shop-web", LaunchTemplateData={"ImageId": "ami-12c6146b", "InstanceType": "t3.small"})
    asg.create_auto_scaling_group(AutoScalingGroupName="shop-web", LaunchTemplate={"LaunchTemplateName": "shop-web", "Version": "$Latest"},
        MinSize=2, MaxSize=8, DesiredCapacity=2, VPCZoneIdentifier=",".join(subnets), TargetGroupARNs=[tg["TargetGroupArn"]],
        HealthCheckType="ELB", HealthCheckGracePeriod=120)
    asg.put_scaling_policy(AutoScalingGroupName="shop-web", PolicyName="cpu-50", PolicyType="TargetTrackingScaling",
        TargetTrackingConfiguration={"PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"}, "TargetValue": 50.0})
    g = asg.describe_auto_scaling_groups(AutoScalingGroupNames=["shop-web"])["AutoScalingGroups"][0]
    print(f"group: min {g['MinSize']} desired {g['DesiredCapacity']} max {g['MaxSize']}, across {len(g['VPCZoneIdentifier'].split(','))} subnets in two zones")
    targets = elb.describe_target_health(TargetGroupArn=tg["TargetGroupArn"])["TargetHealthDescriptions"]
    print("registered with the load balancer:", len(targets), "instances")
    p = asg.describe_policies(AutoScalingGroupName="shop-web")["ScalingPolicies"][0]
    print("scaling policy:", p["PolicyType"], "keep average CPU at", p["TargetTrackingConfiguration"]["TargetValue"], "%")
    asg.set_desired_capacity(AutoScalingGroupName="shop-web", DesiredCapacity=4)     # what the policy does when CPU is high
    g = asg.describe_auto_scaling_groups(AutoScalingGroupNames=["shop-web"])["AutoScalingGroups"][0]
    print("after scaling out:", len(g["Instances"]), "instances")
EOF
python3 a5_scale.py
```

`HealthCheckType="ELB"` means the group trusts the load balancer's health checks: an instance that stops answering `/health` is replaced automatically, not just taken out of rotation.

## 2. Target tracking, simulated

A **target-tracking** policy works like a thermostat: "keep average CPU at 50%". If CPU is above the target it adds instances; below, it removes them, within min and max. This plain-Python model follows the same rule through a day:

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > scale_sim.py <<'EOF'
# Target tracking in plain Python: keep average CPU near 50% as traffic rises and falls through a day.
import math
PER_SERVER = 100              # requests per second one server handles at 100% CPU
TARGET, MIN, MAX = 50, 2, 8
servers, cost = MIN, 0.0
print("hour  traffic  servers  cpu%")
for hour in range(0, 24, 2):
    traffic = 120 + 260 * max(0, math.sin((hour - 7) / 12 * math.pi))       # quiet night, busy evening
    cpu = traffic / (servers * PER_SERVER) * 100
    print(f"{hour:4}  {traffic:7.0f}  {servers:7}  {min(cpu, 100):4.0f}{'  overloaded' if cpu > 90 else ''}")
    wanted = math.ceil(servers * cpu / TARGET)                               # the rule target tracking follows
    servers = max(MIN, min(MAX, wanted)); cost += servers * 2 * 0.0224     # t3.small on-demand, about $0.0224 per hour
print(f"cost of the day: about ${cost:.2f}  (8 servers all day: ${8 * 24 * 0.0224:.2f})")
EOF
python3 scale_sim.py
```

- Scaling follows the traffic curve, but **one step behind**: at 10:00 CPU reached 76% before the new servers arrived. Real scaling also waits for new instances to boot and pass health checks, so keep the target comfortably below 100%, set a sensible minimum, and use **scheduled scaling** for known peaks.
- Automatic capacity cost about 40% less than running the peak size all day here. The saving grows with the gap between quiet and busy hours.

## 3. Choosing what to scale on

CPU is easy but not always right. Good signals: **requests per target** (from the ALB), **queue depth** for workers ([lesson 8](#aws-8)), or response time. Scale out fast, scale in slowly (avoid flapping), and test that your app works when instances disappear: an ASG will remove them.

```term
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shop-web \
  --query "AutoScalingGroups[0].[MinSize,DesiredCapacity,MaxSize]"
aws elbv2 describe-target-health --target-group-arn <arn> --query "TargetHealthDescriptions[].TargetHealth.State"
aws autoscaling start-instance-refresh --auto-scaling-group-name shop-web    # roll out a new launch template
```

## Common misconceptions

- "Auto scaling makes an app scalable." Only if the app is stateless; sessions on one server break when it is removed.
- "Scaling is instant." New instances need minutes to boot and become healthy; plan headroom.
- "A health check on / is enough." Check what matters (a /health that tests the database connection), but keep it fast and cheap.

## Practice (answers below)

1. In `scale_sim.py`, change `TARGET` to 70. What happens to cost and to the worst CPU?
2. Your instances are replaced every few minutes. What do you check first?
3. Which metric would you scale a queue worker on?

:::recap
- ALB + target group + health check spreads traffic over healthy servers.
- An **Auto Scaling group** keeps capacity across zones and replaces failed instances.
- **Target tracking** follows a metric like a thermostat, one step behind: keep headroom, scale in slowly.
- Automatic capacity saves money when traffic varies; the app must be stateless.
:::

:::note Answers
1. Fewer servers run, so the day costs less, but the peak hour runs hotter and more often above 90%: less headroom. 2. The target group's health check (path, port, thresholds) and the ASG's grace period: if the app boots slower than the grace period, healthy-but-slow instances are killed. 3. The number of messages waiting per worker (queue depth / instances), or the age of the oldest message.
:::

```quiz
? What does an ASG do when an instance fails its load balancer health check (HealthCheckType ELB)?
+ Terminates it and launches a replacement
- Nothing
- Emails the owner
- Doubles the group size
! Self-healing is half the value of an ASG.

? Target tracking scaling keeps:
+ A chosen metric near a target value
- A fixed number of servers
- Costs at zero
- One server per zone
! Like a thermostat.

? Why did CPU reach 76% at 10:00 in the simulation?
+ Scaling reacts after load rises, so capacity lags behind
- The load balancer failed
- The maximum was too high
- Health checks were off
! Keep headroom or scale on a schedule for known peaks.
```
