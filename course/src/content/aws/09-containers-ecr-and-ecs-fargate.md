---
track: aws
title: "Containers on AWS: ECR and ECS on Fargate"
short: Containers
sub: Run the shop's container without managing servers: an ECR repository with immutable tags and scanning, a Fargate task definition with secrets and logs, an ECS service with safe rolling deploys; and where EKS fits.
---

:::goals
- push images to ECR with immutable tags and scanning
- write a Fargate task definition with CPU, memory, ports, secrets, health check and logs
- run an ECS service with rolling deployments and automatic rollback
- choose between Lambda, ECS on Fargate, ECS on EC2 and EKS
:::

:::note How the code here runs
The scripts use **boto3**, the real AWS SDK for Python, against **moto**, a library that imitates AWS inside the script. No account, no bill, no keys, and the output is real. Delete the `from moto import mock_aws` line and the `with mock_aws():` wrapper and the same code works on a real account. These need `pip install boto3 moto` (Codespaces or your own machine); the in-page lab cannot run them.
:::

## 1. The pieces

- **ECR**: a private container registry. **Immutable tags** mean `1.4.2` can never be overwritten, so what you tested is what runs; **scan on push** checks images for known vulnerabilities ([supply chain](#secops-7)).
- **ECS**: AWS's container orchestrator. A **task definition** describes containers (like a Pod in [Kubernetes](#kubernetes-1)); a **service** keeps N copies running behind a load balancer.
- **Fargate**: run tasks without managing EC2 instances; you pay for the CPU and memory of each task.

Images themselves are covered in [Docker](#docker-1).

```run
mkdir -p ~/lab/aws && cd ~/lab/aws
cat > a9_ecs.py <<'EOF'
# Containers on AWS: an ECR repository, a Fargate task definition, and an ECS service (moto plays AWS).
import boto3, json
from moto import mock_aws
R = "ap-south-1"
with mock_aws():
    ecr, ecs, ec2, sm = (boto3.client(s, region_name=R) for s in ("ecr", "ecs", "ec2", "secretsmanager"))
    repo = ecr.create_repository(repositoryName="shop/web", imageTagMutability="IMMUTABLE",
                                 imageScanningConfiguration={"scanOnPush": True})["repository"]
    print("registry:", repo["repositoryUri"], "| tags immutable:", repo["imageTagMutability"] == "IMMUTABLE",
          "| scan on push:", repo["imageScanningConfiguration"]["scanOnPush"])
    secret = sm.create_secret(Name="shop/db-password", SecretString="demo-only-value")["ARN"]

    td = ecs.register_task_definition(family="shop-web", requiresCompatibilities=["FARGATE"], networkMode="awsvpc",
        cpu="256", memory="512", executionRoleArn="arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
        taskRoleArn="arn:aws:iam::123456789012:role/shop-web-task",
        containerDefinitions=[{"name": "web", "image": repo["repositoryUri"] + ":1.4.2", "essential": True,
            "portMappings": [{"containerPort": 8080}], "environment": [{"name": "APP_ENV", "value": "prod"}],
            "secrets": [{"name": "DB_PASSWORD", "valueFrom": secret}],
            "healthCheck": {"command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"], "interval": 15, "retries": 3},
            "logConfiguration": {"logDriver": "awslogs", "options": {"awslogs-group": "/ecs/shop-web", "awslogs-region": R, "awslogs-stream-prefix": "web"}}}])["taskDefinition"]
    c = td["containerDefinitions"][0]
    print(f"task definition {td['family']}:{td['revision']}  {td['cpu']} CPU units, {td['memory']} MB, image tag {c['image'].split(':')[-1]}")
    print("   env:", [e["name"] for e in c["environment"]], "| secrets injected at start:", [s["name"] for s in c["secrets"]], "| logs ->", c["logConfiguration"]["options"]["awslogs-group"])

    vpc = ec2.create_vpc(CidrBlock="10.0.0.0/16")["Vpc"]["VpcId"]
    subnets = [ec2.create_subnet(VpcId=vpc, CidrBlock=f"10.0.{i}.0/24", AvailabilityZone=R + z)["Subnet"]["SubnetId"] for i, z in enumerate("ab")]
    sg = ec2.create_security_group(GroupName="web-task", Description="from the load balancer only", VpcId=vpc)["GroupId"]
    ecs.create_cluster(clusterName="shop")
    rolling = {"minimumHealthyPercent": 100, "maximumPercent": 200, "deploymentCircuitBreaker": {"enable": True, "rollback": True}}
    svc = ecs.create_service(cluster="shop", serviceName="web", taskDefinition="shop-web:1", desiredCount=2, launchType="FARGATE",
        networkConfiguration={"awsvpcConfiguration": {"subnets": subnets, "securityGroups": [sg], "assignPublicIp": "DISABLED"}},
        deploymentConfiguration=rolling)["service"]
    print("service:", svc["serviceName"], "desired", svc["desiredCount"], svc["launchType"], "| status", svc["status"])
    print("   rolling updates requested: never below", rolling["minimumHealthyPercent"], "% healthy, up to", rolling["maximumPercent"],
          "% during a deploy, automatic rollback:", rolling["deploymentCircuitBreaker"]["rollback"])
    td2 = ecs.register_task_definition(family="shop-web", requiresCompatibilities=["FARGATE"], networkMode="awsvpc", cpu="256", memory="512",
        containerDefinitions=[dict(c, image=repo["repositoryUri"] + ":1.5.0")])["taskDefinition"]
    svc = ecs.update_service(cluster="shop", service="web", taskDefinition=f"shop-web:{td2['revision']}")["service"]
    print("deploy a new version: service now uses", svc["taskDefinition"].split("/")[-1])
EOF
python3 a9_ecs.py
```

Things to notice in the task definition:

- **Two roles.** The *execution role* lets ECS pull the image and read the secret at start; the *task role* is what your code may do (read a bucket, write to a table).
- **Secrets** are injected as environment variables from Secrets Manager when the task starts; the task definition only holds the secret's ARN.
- **Logs** go to CloudWatch with the `awslogs` driver; a **health check** lets ECS replace a stuck container.
- `assignPublicIp: DISABLED` and private subnets: the task is reached only through the load balancer.

Deploying a new version is registering a new revision and updating the service. With `minimumHealthyPercent=100` and `maximumPercent=200`, ECS starts new tasks before stopping old ones; the **circuit breaker** rolls back if the new tasks keep failing.

```term
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-south-1.amazonaws.com
docker build -t 123456789012.dkr.ecr.ap-south-1.amazonaws.com/shop/web:1.5.0 .
docker push 123456789012.dkr.ecr.ap-south-1.amazonaws.com/shop/web:1.5.0
aws ecs update-service --cluster shop --service web --task-definition shop-web:2
aws ecs wait services-stable --cluster shop --services web
```

## 2. Which compute?

| Option | You manage | Good for |
| --- | --- | --- |
| Lambda | code | events, spiky APIs, glue, short jobs |
| ECS on Fargate | containers | web services and workers without cluster upkeep |
| ECS on EC2 | containers and instances | steady large fleets, GPUs, lowest cost at scale |
| EKS | Kubernetes and (unless Fargate or Auto Mode) nodes | teams standardised on Kubernetes, portability, its ecosystem |
| EC2 + ASG | everything | software that is not containerised |

Start with the simplest one that fits. Many teams run happily on Fargate for years.

## Common misconceptions

- "The latest tag is fine on ECS." It hides what is running and breaks rollbacks; use immutable version tags or digests.
- "The task role pulls the image." Pulling and reading start-up secrets is the execution role; the task role is for your code.
- "Fargate is always more expensive." Per CPU-hour it costs more than EC2, but you pay nothing for idle nodes or cluster upkeep.

## Practice (answers below)

1. Add a second container, `worker`, to the task definition that reads from the queue in [lesson 8](#aws-8). What does it need that `web` does not?
2. A deployment keeps rolling back. Where do you look?
3. Why are immutable tags important for rollbacks?

:::recap
- **ECR** with **immutable tags** and **scan on push**; **ECS** task definitions and services; **Fargate** without servers.
- Two roles: **execution** (pull, secrets, logs) and **task** (your code's permissions).
- Rolling deploys with a **circuit breaker** roll back automatically.
- Choose the simplest compute that fits: Lambda, Fargate, ECS on EC2, EKS or plain EC2.
:::

:::note Answers
1. No port mapping or load balancer; a task role that allows `sqs:ReceiveMessage` and `sqs:DeleteMessage` on that queue; usually its own service so it scales on queue depth. 2. The stopped tasks' reason in `describe-tasks`, the container logs in CloudWatch, and the health check and target group health; often a failing health check or a missing secret permission on the execution role. 3. Rolling back means running the exact previous image; if tags can be overwritten, `1.4.2` might now be different code.
:::

```quiz
? Which role lets ECS read a secret from Secrets Manager when the task starts?
+ The task execution role
- The task role
- The root user
- The load balancer
! Start-up work uses the execution role.

? What does an immutable tag setting in ECR prevent?
+ Overwriting an existing tag with a different image
- Deleting the repository
- Scanning images
- Pulling images
! A version tag always means the same image.

? What does the deployment circuit breaker do?
+ Rolls back a deployment whose new tasks keep failing
- Stops the cluster at night
- Encrypts traffic
- Limits CPU
! Safe deploys without a human watching.
```
