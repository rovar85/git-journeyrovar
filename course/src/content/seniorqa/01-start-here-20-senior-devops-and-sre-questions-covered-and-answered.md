---
track: seniorqa
title: "Start here: 20 senior DevOps and SRE questions, what is already covered and what is new"
short: Start here
sub: A map of 20 senior system-design and incident questions. Nine are answered elsewhere in the course (linked); eleven have their own full answer lesson in this track.
---

:::goals
- see all 20 questions and where each one is answered
- know the answer shape that works for every senior question: clarify, constraints, design, failure modes, trade-offs, how you would measure
- practise the 60-second spoken version of each answer
:::

:::note How to use this track
Each lesson here is one question, written the way a strong candidate answers it: **what the interviewer tests**, **clarifying questions to ask first**, **the answer in steps**, **trade-offs**, **follow-up questions with answers**, and a **60-second spoken version**. Most lessons run a small Python model in the lab so the numbers in the answer are real, not remembered. Commands for `kubectl`, `helm` and `terraform` are shown as examples and labelled "Example (not run here)" because the lab has no cluster or cloud account.
:::

## The shape of a senior answer

Senior questions are open. There is no single right design; the interviewer is listening for how you think. Use the same six moves every time:

1. **Clarify.** Ask two or three questions that change the design: scale, users, what "down" costs, existing tools, team size, compliance. Say your assumptions out loud.
2. **State the goals as numbers.** Availability target, RTO and RPO, latency, cost ceiling. A design without a target cannot be judged.
3. **Give the simplest design that meets them**, then name the parts: data path, control path, failure path.
4. **Walk the failures.** "If this region/node/dependency dies, then ..." This is where seniors separate from mid-level.
5. **Name the trade-offs** you chose and the alternative you rejected, with the reason.
6. **Say how you will know it works:** the metric, the alert, the game day or drill.

## The 20 questions and where they are answered

| # | Question | Answered in |
|---|----------|-------------|
| 1 | Design a highly available multi-region Kubernetes platform | [Lesson 2](#seniorqa-2) (plus [Senior cloud 1](#cloudsenior-1)) |
| 2 | Cluster healthy but users get intermittent 503 errors | [Question bank](#qbank-17), [Kubernetes 9](#kubernetes-9) |
| 3 | Upgrade a production cluster with zero downtime | [Lesson 3](#seniorqa-3) |
| 4 | Migrate a stateful application to Kubernetes with minimal downtime | [Lesson 4](#seniorqa-4) |
| 5 | GitOps for 20+ teams with independent release cycles | [Lesson 5](#seniorqa-5) (plus [Kubernetes 19](#kubernetes-19)) |
| 6 | Cut a CI/CD pipeline from 30 minutes to under 5 | [Lesson 6](#seniorqa-6) |
| 7 | A rollback that works even if the deployment stage fails | [Lesson 7](#seniorqa-7) |
| 8 | Multi-environment CI/CD that prevents config drift | [Lesson 8](#seniorqa-8) |
| 9 | Terraform state is 300 MB and plan takes 15 minutes | [Question bank](#qbank-27) |
| 10 | Terraform partly created resources, then failed: recover safely | [Lesson 9](#seniorqa-9) |
| 11 | Runtime security beyond image scanning | [Question bank](#qbank-16), [Kubernetes 17](#kubernetes-17) |
| 12 | Secrets management for 100+ microservices | [Question bank](#qbank-30), [Senior cloud 11](#cloudsenior-11) |
| 13 | SLO-based alerting that minimises alert fatigue | [Scenarios 12](#scenarios-12), [Monitoring 4](#monitoring-4) |
| 14 | Correlate logs, metrics and traces during an incident | [Monitoring 4](#monitoring-4), [Scenarios 9](#scenarios-9) |
| 15 | Design a self-healing platform | [Lesson 10](#seniorqa-10) |
| 16 | Cascading failures across microservices | [Lesson 11](#seniorqa-11) (plus [Systems 5](#systems-5), [Systems 6](#systems-6)) |
| 17 | The cloud bill rose 40% overnight | [Scenarios 11](#scenarios-11) |
| 18 | Disaster-recovery strategy with RTO and RPO | [Senior cloud 1](#cloudsenior-1), [Senior cloud 7](#cloudsenior-7) |
| 19 | Deployment succeeds but latency goes from 80 ms to 2 s | [Lesson 12](#seniorqa-12) |
| 20 | Your most challenging production incident, and the architecture changes after it | [Senior cloud 9](#cloudsenior-9) |

Questions 2, 9, 11, 12, 13, 14, 17, 18 and 20 were already answered in depth, so they are linked rather than copied. Questions 1, 3, 4, 5, 6, 7, 8, 10, 15, 16 and 19 are new here, with a lesson each. (Questions 1 and 18 overlap: lesson 2 is about the Kubernetes platform; the disaster-recovery numbers for the data layer are in Senior cloud 1 and 7.)

:::note A word on honesty
The Python models are teaching models: they use assumed numbers (for example a 15-minute snapshot, a 3-check health probe) so you can see the shape of the effect. In an interview, say "in my experience it is about X" only when it is, and otherwise say "I would measure it". The tool commands shown without output were not run here.
:::

## Question 20 is yours to prepare

"Describe the most challenging production incident" cannot be answered from a course; it needs **your** story. Use this skeleton and rehearse it out loud for two minutes:

1. **Situation:** the system, its scale, and what broke, in two sentences.
2. **Impact:** who was affected, for how long, and the money or trust cost.
3. **Your role:** what you personally did first (stabilise before you diagnose).
4. **Root cause:** the real cause, not the symptom, and how you proved it.
5. **Fix and prevention:** the immediate fix, then the architecture or process change (a guard rail, a test, an alert, a runbook, a design change).
6. **What you learned**, including something you would do differently.

Then borrow the vocabulary of the scenarios you practised: [Scenarios 9](#scenarios-9) shows a full incident, and [Senior cloud 9](#cloudsenior-9) shows a post-incident review.

:::recap
- Use the six moves: **clarify, numbers, design, failures, trade-offs, measure**.
- Nine of the twenty questions were already covered and are linked above; eleven have a full lesson here.
- Practise the 60-second version out loud; the written answer is the backup.
:::

```quiz
? Which step separates a senior answer from a mid-level one in a design question?
+ Walking through what happens when each part fails, and naming the trade-offs
- Listing as many tools as possible
- Giving the final design in the first sentence without asking anything
- Avoiding numbers so you cannot be wrong
! Seniors clarify first, state targets as numbers, and show they have thought about failure and trade-offs.

? Why does the track say some questions are "linked, not repeated"?
+ They were already answered in depth in other tracks, so repeating them would add length without value
- They are not important
- They cannot be asked in interviews
- They need a real cluster
! The map points to the existing lesson for each one.
```
