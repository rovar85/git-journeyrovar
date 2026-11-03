---
track: reference
title: Free hands-on practice, games, labs and challenges
short: Practice sites
sub: A map of well-known free practice sites and games, matched to the lessons of this course, with what this course already gives you for each topic.
---

:::goals
- know which free practice site pairs with which lesson
- know what is already built into this course, so you do not need an outside site for it
- pick a practice plan that fits what you have (no machine, a browser only, or a free cloud machine)
:::

:::note About these links
This list comes from a popular practice-resources roundup you shared. **I could not open any of these sites from my environment**, so the descriptions are from their names and general knowledge, not from visiting them today. Sites change, move behind sign-ups, or become paid; check each one. Most are free for the basic content; a few (marked) normally need an account or a purchase.
:::

## Start with what is already in this course

You do not need an outside site for the first steps:

- **The Lab button** opens a Linux-like terminal in this page with practice files ([lab guide](#linux-13)).
- **[Linux challenges](#linux-14)**: eighteen auto-checked tasks, including a short detective case. They cover the same ground as one-liner and log-detective games, and give instant feedback in the lab.
- **Real recorded output** in every Linux, Docker, Git, Kubernetes and Terraform lesson, plus the **Practice** sections with answers.
- **[Scenarios](#scenarios-1)** and the **[question bank](#qbank-1)** for interview-style troubleshooting.

Use the sites below for what a browser simulation cannot give: a real kernel, real containers, a real cluster, a real cloud account, or just variety.

## 1. Linux and shell

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [Bandit (OverTheWire)](https://overthewire.org/wargames/bandit) | A wargame: you log in over SSH to a game server and use commands to find the password to the next level | [Linux 1 to 6](#linux-1) |
| [Linux Survival](https://linuxsurvival.com) | A browser tutorial for the terminal basics | [Linux 1 and 2](#linux-1) |
| [Terminus](https://web.mit.edu/mprat/Public/web/Terminus/Web/main.html) | A text adventure played with terminal commands | [Linux 1 and 2](#linux-1) |
| [Bashcrawl](https://gitlab.com/slackermedia/bashcrawl) | A dungeon crawl in a folder tree, played with `cd`, `ls` and `cat` | [Linux 2 and 3](#linux-2) |
| [CMD Challenge](https://cmdchallenge.com) | Shell one-liner puzzles with instant checking | [Linux 3 and 4](#linux-3) |
| [CLI Murder Mystery](https://github.com/veltman/clmystery) | A detective case solved with `grep` and friends | [Linux 4](#linux-4) |
| [Linux Upskill Challenge](https://linuxupskillchallenge.org) | A 20-day server-administration course by daily lessons | [Linux 5 to 11](#linux-5) |
| [Vim Adventures](https://vim-adventures.com) and [VimGolf](https://vimgolf.com) | A game for learning Vim keys, and editing puzzles scored by keystrokes | [Linux 3](#linux-3) |
| [RegexCrossword](https://regexcrossword.com) | Crosswords solved with regular expressions | [Linux 4](#linux-4) |

## 2. Networking

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [Network debugging mysteries (Wizard Zines)](https://mysteries.wizardzines.com) | Short troubleshooting puzzles | [Networking 8](#networking-8) |
| [Mess With DNS](https://messwithdns.net) | A DNS playground where you can change records safely | [Networking 6](#networking-6) |
| [Subnetting questions](https://www.subnettingquestions.com) | Generated subnetting exercises | [Networking 2](#networking-2) |
| [Cisco Packet Tracer](https://www.netacad.com/cisco-packet-tracer) | A network simulator you download (normally needs a free Networking Academy account) | [Networking 3 and 4](#networking-3) |

## 3. Version control

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [Learn Git Branching](https://learngitbranching.js.org) | An interactive visual sandbox for branches, merges and rebases | [Git 2 and 3](#git-2) |
| [Oh My Git!](https://ohmygit.org) | A card-style game that visualises a repository | [Git 1 to 4](#git-1) |
| [Githug](https://github.com/Gazler/githug) | Command-line levels that check your Git work (runs on your machine) | [Git 1 to 4](#git-1) |
| [Git Exercises](https://gitexercises.fracz.com) | A set of tasks with an automatic verifier | [Git 1 to 5](#git-1) |

## 4. Containers and orchestration

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [iximiuz Labs](https://labs.iximiuz.com) | Hands-on Linux, Docker and Kubernetes labs in the browser | [Docker](#docker-1), [Kubernetes](#kubernetes-1) |
| [K8s Games](https://k8sgames.com) | Kubernetes puzzles and games | [Kubernetes 1 to 9](#kubernetes-1) |
| [Learn Docker and K8s (repository)](https://github.com/ericboy0224/learn-docker-and-k8s) | A self-guided repository of Docker and Kubernetes exercises | [Docker](#docker-1) |
| [Killercoda](https://killercoda.com) | Free interactive scenarios in a real browser terminal, including Kubernetes and Terraform | [Kubernetes 11 to 16](#kubernetes-11) |
| [Kubernetes The Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way) | Build a cluster by hand, step by step | [Kubernetes 1 and 11](#kubernetes-1) |
| [KubeInvaders](https://github.com/lucky-sideburn/kubeinvaders) and [kubedoom](https://github.com/storax/kubedoom) | Chaos-engineering games where you kill pods by playing | [Kubernetes 7 and 13](#kubernetes-7) |
| [KodeKloud Engineer](https://engineer.kodekloud.com) | Real-world style DevOps tasks in a lab (some free, some paid) | [Capstone](#capstone-1) |

## 5. CI/CD and infrastructure as code

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [GitHub Skills](https://skills.github.com) | Short courses that run inside your own GitHub repository, including GitHub Actions | [Jenkins](#jenkins-1) (same ideas, different tool) |
| [HashiCorp Terraform tutorials](https://developer.hashicorp.com/terraform/tutorials) | Official tutorials | [Terraform](#terraform-1) |
| [Red Hat interactive labs](https://www.redhat.com/en/interactive-labs) | Browser labs, including Ansible | [Ansible](#ansible-1) |
| [DevOps Exercises (bregman-arie)](https://github.com/bregman-arie/devops-exercises) | A large question and exercise bank; already linked, not copied, in [this lesson](#reference-2) | [Interview questions](#qbank-1) |

## 6. Observability and SRE

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [SadServers](https://sadservers.com) | Broken servers to fix, like real incidents | [Linux 11](#linux-11), [Scenarios](#scenarios-1) |
| [Grafana Play](https://play.grafana.org) | A public Grafana with sample dashboards to explore | [Monitoring 3 and 4](#monitoring-3) |
| [Keep Talking and Nobody Explodes](https://keeptalkinggame.com) | A paid party game of communicating under pressure; a fun way to practise incident teamwork | [Senior cloud 9](#cloudsenior-9) |
| [DevOps Games](https://devops.games) | DevOps-themed games | [Capstone](#capstone-1) |
| [Factorio](https://store.steampowered.com/app/427520) | A paid factory-building game often recommended for systems thinking | [Systems 5 and 6](#systems-5) |

## 7. Cloud

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [AWS Cloud Quest](https://aws.amazon.com/training/digital/aws-cloud-quest) | A game-style AWS learning path | [Cloud 1 to 4](#cloud-1) |
| [Google Skills](https://www.skills.google) | Google Cloud labs and courses | [Cloud](#cloud-1) |
| [Microsoft Learn training](https://learn.microsoft.com/training) | Azure learning paths | [Cloud](#cloud-1), [AI deep dive 19](#aideep-19) |
| [Cloud Resume Challenge](https://cloudresumechallenge.dev) | Build and deploy a real resume website in the cloud, as a portfolio project | [Cloud](#cloud-1), [Terraform](#terraform-1) |

## 8. Challenges and projects

| Resource | What it is | Pairs with |
| --- | --- | --- |
| [90 Days of DevOps](https://github.com/MichaelCade/90DaysOfDevOps) | A free long-form learning path in a repository | The whole course |
| [Hands-on DevOps projects (roadmap.sh)](https://roadmap.sh/devops/projects) | Project ideas with briefs | [Capstone](#capstone-1), [AI deep dive 21](#aideep-21) |

## A practice plan for someone with no machine

1. **Week 1: Linux.** Use the Lab and the [Linux challenges](#linux-14), then play Terminus or Bashcrawl for fun.
2. **Week 2: Git.** Learn Git Branching in the browser, then Git Exercises.
3. **Week 3: containers.** Killercoda or iximiuz labs for Docker, then Kubernetes scenarios.
4. **Week 4: IaC and cloud.** HashiCorp tutorials (a free cloud account may be needed) and one cloud's free learning path.
5. **Ongoing:** one SadServers puzzle a week, and the [scenario](#scenarios-1) and [interview](#qbank-1) lessons.

:::warn Cloud accounts and cost
Some labs create real cloud resources. Use free tiers carefully, set a budget alert first, and always delete what you created. The [cloud track](#cloud-1) explains why.
:::

:::recap
- This course already gives you the **Lab**, **18 auto-checked Linux challenges**, real recorded output and scenario practice.
- Outside sites add **real kernels, clusters and clouds**, and variety.
- Match each site to a lesson, practise a little every week, and always check current pricing and sign-up rules.
:::

```quiz
? Which practice option runs inside this course page with automatic checking?
+ The Linux challenges in the lab
- Bandit over SSH
- Killercoda
- Cisco Packet Tracer
! The challenges run in the in-browser lab and check your work; the others are outside sites.

? Why use an outside lab for Kubernetes instead of only the in-browser lab?
+ The in-browser lab cannot run containers or a real cluster
- Kubernetes is not on the internet
- The lab has no terminal
- Outside labs are always free
! A browser simulation cannot provide a real kernel or cluster; Killercoda and similar sites do.
```
