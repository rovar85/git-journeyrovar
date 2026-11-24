---
track: aws
title: "Round-up: the map, flashcards and drills for AWS hands-on"
short: Round-up
sub: One end-to-end map, flashcards made from every lesson, the tips nobody tells you, the few pages worth reading, and what to drill in round 2.
roundup: true
---

:::goals
- hold the whole track on **one map** and place every topic on it
- run the **gather, refine, drill, round 2** loop on this track
- drill the track's **flashcards** and the long procedures until they are boring
- know **which one to three documentation pages** to open, instead of reading everything
:::

## 1. The loop, for this track

1. **Gather (fast pass).** Go through lessons 1 to 11 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One web shop on AWS, from an empty account to a deployed stack

Each lesson adds one layer to the same shop: identity, storage, network, servers, scaling, data, functions, events, containers, monitoring, and finally everything as code.

1. **Account**: Regions and zones, CLI and SDK, credentials, a budget first. Lessons: [1](#aws-1).
2. **Identity**: Policies, evaluation, groups, roles, temporary credentials. Lessons: [2](#aws-2).
3. **Storage**: Private, encrypted, versioned buckets; lifecycle; presigned links. Lessons: [3](#aws-3).
4. **Network and servers**: Public and private subnets in two zones, NAT, chained security groups, EC2, Session Manager. Lessons: [4](#aws-4).
5. **Scale**: Load balancer, health checks, auto scaling, target tracking. Lessons: [5](#aws-5).
6. **Data**: RDS done right; DynamoDB designed from its queries. Lessons: [6](#aws-6).
7. **Serverless and events**: Lambda handlers, versions and canaries; SQS, SNS, EventBridge. Lessons: [7](#aws-7), [8](#aws-8).
8. **Containers**: ECR, Fargate task definitions, ECS services, which compute to pick. Lessons: [9](#aws-9).
9. **Operate**: Logs, metrics, alarms, CloudTrail, cost. Lessons: [10](#aws-10).
10. **As code**: A CloudFormation pipeline deployed, verified and torn down. Lessons: [11](#aws-11).

**Do this now:** [open the sketch pad for this track](#study/maps/aws), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_aws

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Create a budget alert before anything else in a real account.
- Run each script, then delete the moto lines only when you have a sandbox account and a budget.
- Tear down after every session; check the NAT gateway twice.
- Say the CLI equivalent of each boto3 call out loud.
- Draw the shop's architecture from memory after the last lesson.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
- [IAM policy evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [boto3 documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)
- [AWS CLI command reference](https://awscli.amazonaws.com/v2/documentation/api/latest/index.html)
- [moto](https://docs.getmoto.org/)

## 6. Round 2: make these boring

- Rebuild the VPC from lesson 4 as a CloudFormation template.
- Add the Lambda function and alarms to the project stack.
- Write a least-privilege policy for the ECS task role from scratch.
- Explain multi-AZ vs read replica vs backup in one minute.
- Estimate the monthly cost of the project with the AWS pricing calculator.

:::try Your turn
1. Without opening the lessons, write the map for this track on one page. Then compare it with section 2 and mark the hops you forgot.
2. Drill this track's flashcards until nothing is "Again", then switch the mode to **Round 2: missed cards**.
3. Pick the longest procedure in the track and do it from a blank terminal against the clock. Repeat until it is dull.
:::

:::recap
- One **map** holds the whole track; every topic is a hop on it.
- The loop is **gather, refine, drill, round 2**: fast pass, compact map and cards, repetition, then only the hard parts again.
- **Flashcards** come from the lessons; the schedule brings back what you miss.
- Learn **one to three pages** of a new tool's documentation, and drill the **long procedures** until they are boring.
:::
