---
track: start
title: "Choose your path, and how to study"
short: Your path
sub: Four routes through the course by job, the order to take the tracks in, what to do when you are stuck, and a study routine that works with a job or college.
---

:::goals
- pick a route through the course that matches the job you want
- know the order of tracks and why that order
- use a study routine built on doing, not reading
- know what to do when you are stuck
:::

## Everyone starts with the same three tracks

Whatever job you want, begin here, in this order:

1. **[Linux](#linux-1)**: the operating system of servers. Continues from the commands you just learned.
2. **[Git](#git-1)**: saving and sharing your work. You will use it in every other track.
3. **[Python](#ch15)**: your first programming language. It starts from zero.

[Networking](#networking-1) can follow straight after Linux, or wait until a later track sends you back to it.

## Then choose a route

| I want to be a... | Take these tracks next, in this order |
|---|---|
| **DevOps engineer** | [Networking](#networking-1) → [Docker](#docker-1) → [Jenkins and CI/CD](#jenkins-1) → [Ansible](#ansible-1) → [Terraform](#terraform-1) → [Kubernetes](#kubernetes-1) → [Monitoring](#monitoring-1) → [Cloud](#cloud-1) → [Capstone](#capstone-1) |
| **Cloud or platform engineer** | [Networking](#networking-1) → [Cloud](#cloud-1) → [Terraform](#terraform-1) → [Docker](#docker-1) → [Kubernetes](#kubernetes-1) → [Monitoring](#monitoring-1) → [Senior cloud questions](#cloudsenior-1) |
| **Data engineer** | [Data engineering](#dataeng-1) (all of it) → [Docker](#docker-1) → [Databases and distributed systems](#systems-1) → [Cloud](#cloud-1) |
| **AI engineer** | [AI and agents](#ch1) → [AI deep dive](#aideep-1) → [Docker](#docker-1) → [AI infrastructure](#aiinfra-1) → [AI field guide](#aifield-1) |

When you start applying for jobs, use the interview tracks: the [question bank](#qbank-1), the [incident scenarios](#scenarios-1), and for experienced roles the [senior DevOps questions](#seniorqa-1) and the [AI interview bank](#aibank-1).

Not sure? Take the DevOps route. It is the broadest, and its skills are used in all the others.

## How the tracks are arranged on the home page

| Stage | Tracks | You need before it |
|---|---|---|
| 1. Start here | this track | nothing |
| 2. Foundations | Linux, Networking, Git, Python | stage 1 |
| 3. Build and ship | Docker, Jenkins, Ansible, Terraform | Linux and Git |
| 4. Run in production | Kubernetes, Monitoring, Cloud, Windows and PowerShell | Docker; Networking helps |
| 5. Data | Data engineering, Databases and distributed systems | Python |
| 6. AI | AI and agents, deep dive, field guide, infrastructure | Python for the later ones |
| 7. Projects | Capstone | stages 2 to 4 |
| 8. Interview preparation | question banks, scenarios, senior questions | the tracks they ask about |

Inside every track the lessons go from first steps to professional practice, so always take a track's lessons in order.

## A routine that works

Reading feels like learning, but skill comes from doing. For each lesson:

1. **Read one section.**
2. **Run it.** Press Run in lab, or type the commands yourself. Typing is better than copying.
3. **Change something** and guess the result before you press Enter. A wrong guess is the most valuable moment of the lesson.
4. **Close the page and explain it** out loud in two sentences.
5. **Do the quiz.** It marks the lesson as done and feeds your streak.

Small and regular beats long and rare. Thirty minutes on most days is better than one long Sunday. The progress panel on the home page counts your day streak for exactly that reason.

As a rough guide only, because people differ: at five hours a week, the three starting tracks take about two months, and a full route takes six to nine months. What gets people hired is not the number of lessons finished but **one or two projects they built themselves and can explain**.

## When you are stuck

Being stuck is normal and happens to senior engineers every day. Do these in order:

1. **Read the error message again**, slowly. It usually names the problem.
2. **Check the basics:** are you in the right folder (`pwd`)? Does the file exist (`ls`)? Is there a spelling mistake?
3. **Go back one step** to the last thing that worked, and change one thing at a time.
4. **Search for the exact error text**, in quotes.
5. **Take a break.** Many problems solve themselves after a walk.
6. **Ask someone**, and say what you tried. Writing the question clearly often reveals the answer.

## Words you will hear a lot

| Word | Meaning |
|---|---|
| Bug | a mistake in a program |
| Debug | find and fix the mistake |
| Deploy | put a new version onto the servers |
| Production | the real system that real users use |
| Repository (repo) | a project folder tracked by Git |
| Script | commands saved in a file so they can run by themselves |
| Automation | making the computer do a repeated job without a person |
| Open source | software whose code anyone may read, use and improve |
| Documentation (docs) | the official instructions for a tool |
| Incident | something is broken in production and needs fixing now |

:::recap
- Start with **Linux, Git and Python**, then follow a route for the job you want.
- Take lessons **in order** inside each track.
- **Read, run, change, explain, quiz.** Short and regular sessions.
- Stuck? Read the error, check the basics, go back a step, search, rest, ask.
- Build one or two projects you can explain.
:::

```quiz
? Which three tracks should everyone take first?
+ Linux, Git and Python
- Kubernetes, Terraform and Cloud
- The interview question banks
- AI infrastructure, Docker and Monitoring
! They are the foundations every route builds on.

? What is the most effective way to study a lesson?
+ Run the commands, change something, and explain it in your own words
- Read it three times
- Copy it into a notebook
- Watch someone else do it
! Skill comes from doing and explaining.

? You get an error you do not understand. What is the first thing to do?
+ Read the error message again, slowly
- Restart the computer
- Skip the lesson
- Delete everything and start again
! It usually names the problem.

? What does "production" mean?
+ The real system that real users use
- A practice environment
- The developer's laptop
- A kind of test
! Changes are tested elsewhere first, then deployed to production.
```
