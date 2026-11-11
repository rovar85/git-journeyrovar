---
track: start
title: "How software is built and run, and who does what"
short: The jobs
sub: The journey of an app from an idea to millions of users, the tools used at each step, and the jobs behind them, so you can see where each track of this course fits.
---

:::goals
- describe the journey of a change from a developer's laptop to the users
- explain in one sentence each: version control, testing, a container, a pipeline, monitoring
- tell apart the jobs of a developer, DevOps engineer, cloud engineer, SRE, data engineer and AI engineer
- see which track of this course teaches each step
:::

## An app is never finished

A shopping app changes every day: a new button, a fixed mistake, a faster search. Each change has to travel from the person who wrote it to the servers that millions of people use, **without breaking anything on the way**. Most technology jobs exist to make that journey fast and safe.

## The journey of one change

Press **Play** to watch a change travel from a developer to the servers.

@widget viz_cicd

The same journey in plain words, with the tool and the track that teaches it:

| Step | What happens | Why | Track |
|---|---|---|---|
| 1. Write | A developer changes the code | to add or fix something | [Python](#ch15) |
| 2. Save the history | The change is recorded in **version control** (Git): who changed what, when and why | to work together and to undo mistakes | [Git](#git-1) |
| 3. Check | Automatic **tests** run the code and compare results with what is expected | to catch mistakes before users do | [Jenkins and CI/CD](#jenkins-1) |
| 4. Package | The app and everything it needs are packed into a **container**, a sealed box that runs the same everywhere | to end "it works on my computer" | [Docker](#docker-1) |
| 5. Deliver | A **pipeline** (steps 3 to 5 run automatically, in order) sends the new version to the servers | so releases are routine, not risky | [Jenkins and CI/CD](#jenkins-1) |
| 6. Run | Many copies run on many servers; a system called **Kubernetes** starts, replaces and scales them | so one broken server does not matter | [Kubernetes](#kubernetes-1) |
| 7. Provide the servers | Servers and networks are rented from a cloud provider and described in files (**infrastructure as code**) | so they can be rebuilt exactly | [Cloud](#cloud-1), [Terraform](#terraform-1), [Ansible](#ansible-1) |
| 8. Watch | **Monitoring** measures speed and errors and alerts a person when something is wrong | to fix problems before users notice | [Monitoring](#monitoring-1) |

Underneath all of it are the two foundations: the **Linux** operating system the servers run, and the **network** that connects them. That is why the course starts there.

## The jobs

Job titles overlap and differ between companies, but the centre of each is clear.

| Job | Main question | Daily work | Tracks to start with |
|---|---|---|---|
| **Software developer** | "Does the app do what users need?" | writes and tests the app's code | Python, Git |
| **DevOps engineer** | "Can we release changes quickly and safely?" | pipelines, containers, automation | Linux, Git, Docker, Jenkins, Kubernetes |
| **Cloud / platform engineer** | "Are the servers and networks there, secure and affordable?" | cloud accounts, networks, infrastructure as code | Linux, Networking, Cloud, Terraform |
| **Site reliability engineer (SRE)** | "Is it fast and working, and what do we do when it is not?" | monitoring, incidents, capacity | Linux, Kubernetes, Monitoring |
| **Data engineer** | "Is the right data in the right place, correct and on time?" | pipelines that collect, clean and store data | Python, Data engineering |
| **AI engineer** | "How do we build useful features with AI models?" | connecting models to data and tools, testing their answers | Python, AI and agents |

None of these jobs needs a particular degree. They need the skills in the table, proof that you can use them (projects), and the ability to explain what you did.

## What "technical" people actually do all day

It is less mysterious than it looks from outside:

- **They read a lot**: error messages, documentation, other people's code.
- **They try small things** and look at the result. Nobody remembers every command.
- **They search** for the exact error message.
- **They automate** anything they have done three times by hand.
- **They write things down**, so the next person (often themselves, six months later) understands.

If you could follow the last lesson, you can learn to do all of this.

:::try
Pick one job from the table that sounds interesting. Say out loud, in two sentences, what that person does and why a company pays for it. If you cannot, read that row again.
:::

:::recap
- Software changes travel: **write, record in Git, test, package in a container, deliver by a pipeline, run on many servers, watch with monitoring**.
- **Linux and networking** sit underneath everything.
- Each job owns part of the journey: developer, DevOps, cloud, SRE, data, AI.
- The daily work is reading, trying, searching, automating and writing down.
:::

```quiz
? What is version control (Git) for?
+ Recording every change so people can work together and undo mistakes
- Making the app faster
- Renting servers
- Drawing the screens
! It is the history of the code.

? What problem does a container solve?
+ The app runs the same everywhere because it carries everything it needs
- It makes the internet faster
- It replaces the developer
- It stores passwords
! It ends "it works on my computer".

? Which job is mainly about releasing changes quickly and safely?
+ DevOps engineer
- Data engineer
- Graphic designer
- AI engineer
! Pipelines, containers and automation are the DevOps engineer's tools.

? Why does monitoring exist?
+ To notice and fix problems before users do
- To write the code
- To store the history of changes
- To package the app
! It measures speed and errors and alerts a person.
```
