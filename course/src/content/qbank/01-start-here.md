---
track: qbank
title: Start here: how to use the question bank, and what the course already covers
short: Start here
sub: 529 real interview questions checked against this course. 453 are added here; 76 were skipped because a lesson already answers them.
---

:::goals
- know how to practise an interview question so it sticks
- find the questions this course already answers, and the lesson that answers each
- pick the right lesson for the interview you have coming
:::

## What this track is

An interview question bank of **529 real DevOps, SRE and cloud questions** gathered from interview experiences, by Priyanka Gupta ([source repository](https://github.com/priyankagupta7679/devops-interview-question-bank), licence CC BY 4.0). I read every question against the 217 lessons in this course. If a lesson already teaches the same thing, the question is **not repeated**; it is listed at the bottom of this page with a link. Everything else is added, so this track fills the gaps instead of copying.

Every question has the same four parts:

1. **In simple words**: an everyday picture, so the idea makes sense first.
2. **The details**: the real technical answer, with a triage order for scenario questions.
3. **An example**: commands, YAML or scripts. They are shown as written in the source and were not run here. Shell examples have a **Run in lab** button when the lab can run them.
4. **What to say to the interviewer**: two or three sentences to practise out loud. Flashcards are made from these.

| Topic | Questions added | Already in the course |
| --- | --: | --: |
| Linux, shell and networking | 75 | 11 |
| Docker and containers | 32 | 7 |
| Kubernetes | 73 | 16 |
| CI/CD, Jenkins, Git, GitOps and Ansible | 61 | 18 |
| Terraform and Infrastructure as Code | 36 | 12 |
| AWS | 74 | 7 |
| GCP, Azure and DevSecOps | 30 | 2 |
| Monitoring, observability, SRE and scale design | 29 | 3 |
| Behavioral and project experience | 19 | 0 |
| Shell scripting: 24 real interview scripts | 24 | 0 |
| **Total** | **453** | **76** |

:::note The method that works
Cover the answer, say yours out loud, then compare. Do the **Basic** lessons for your stack first, then **Scenario-based** (most interviews are troubleshooting), then **Advanced**. Use the Study view to drill the flashcards, and run the examples in the Lab or on a free real machine (see the Linux practice-lab lesson).
:::

:::warn Check before you repeat an answer
These are good answers written by someone else. I did not verify every command in a real environment, and cloud products change names and limits. If something looks off, check the official documentation before you say it in an interview.
:::

## Questions the course already answers

These questions were in the bank. A lesson here already answers them, so they were left out of the track.

### Linux, shell and networking

| Question | Covered in the course |
| --- | --- |
| How do you create a new user in Linux, and where is the default home directory created? | [linux lesson 5](#linux-5) |
| How do Linux file permissions work (chmod, chown)? | [linux lesson 5](#linux-5) |
| How do you manage services and read their logs (systemd, systemctl, journalctl)? | [linux lesson 7](#linux-7) |
| What is cron and how do you schedule a job? | [linux lesson 10](#linux-10) |
| How do you check running processes in Linux? | [linux lesson 6](#linux-6) |
| Which commands do you use for basic network troubleshooting, and how do you check connectivity between two servers? | [networking lesson 8](#networking-8) |
| How does DNS work? | [networking lesson 6](#networking-6) |
| Explain TCP/IP basics: TCP vs UDP, ports and the three-way handshake. | [networking lesson 5](#networking-5) |
| How does TLS/HTTPS work? | [networking lesson 8](#networking-8) |
| You deleted large files but disk space was not freed. Why? What happens when a file is deleted while still in use? | [linux lesson 8](#linux-8) |
| The disk shows free space but you get "No space left on device". Why? (inode exhaustion) | [linux lesson 8](#linux-8) |

### Docker and containers

| Question | Covered in the course |
| --- | --- |
| What is a Docker image and what is a Docker container? | [docker lesson 1](#docker-1) |
| What is a Dockerfile? Explain its purpose and structure, and how you write one. | [docker lesson 4](#docker-4) |
| What is WORKDIR in a Dockerfile? What does it do? | [docker lesson 4](#docker-4) |
| How do you define a startup command in Docker? What is the difference between CMD and ENTRYPOINT? | [docker lesson 9](#docker-9) |
| What is the docker command to build an image, and which flags are commonly used? | [docker lesson 4](#docker-4) |
| What are Docker restart policies (no, on-failure, always, unless-stopped)? | [docker lesson 3](#docker-3) |
| How do volumes work in Docker? When do you use bind mounts vs named volumes (and tmpfs)? | [docker lesson 5](#docker-5) |

### Kubernetes

| Question | Covered in the course |
| --- | --- |
| What is a Deployment, and how is it different from a ReplicaSet? | [kubernetes lesson 3](#kubernetes-3) |
| What is the difference between a Deployment and a StatefulSet? | [kubernetes lesson 6](#kubernetes-6) |
| What is the difference between ClusterIP, NodePort and LoadBalancer? How do you expose services in Kubernetes? | [kubernetes lesson 4](#kubernetes-4) |
| What is the difference between an Ingress and a LoadBalancer Service? | [kubernetes lesson 4](#kubernetes-4) |
| What are ConfigMaps and Secrets? | [kubernetes lesson 5](#kubernetes-5) |
| What is the rolling update strategy? | [kubernetes lesson 3](#kubernetes-3) |
| How do you auto-scale pods? Explain Horizontal Pod Autoscaling (HPA) and the other types of scaling. | [kubernetes lesson 13](#kubernetes-13) |
| What are liveness, readiness and startup probes? How are they different and how do you use them? | [kubernetes lesson 7](#kubernetes-7) |
| What are PV and PVC? Which comes first, and why? | [kubernetes lesson 6](#kubernetes-6) |
| What is the NodePort port range? | [kubernetes lesson 4](#kubernetes-4) |
| What is an Ingress, and how do you expose applications on an on-premises Kubernetes cluster? Do LoadBalancer Services work on-prem? | [kubernetes lesson 4](#kubernetes-4) |
| What is Helm and why is it important? Explain the Helm chart folder structure and the commands you use to deploy. | [kubernetes lesson 10](#kubernetes-10) |
| How do you secure secrets in Kubernetes? | [cloudsenior lesson 11](#cloudsenior-11) |
| Have you upgraded Kubernetes clusters? How do you upgrade a cluster (EKS) safely? | [kubernetes lesson 11](#kubernetes-11) |
| A deployment rollout is stuck and new pods are not becoming ready. What steps do you follow? | [scenarios lesson 3](#scenarios-3) |
| You are on call: pods are not pulling images (ImagePullBackOff), some are getting evicted, and users are seeing errors or 503s. How do you troubleshoot, and how do you prevent it next time? | [kubernetes lesson 9](#kubernetes-9) |

### CI/CD, Jenkins, Git, GitOps and Ansible

| Question | Covered in the course |
| --- | --- |
| What is the file structure of a Jenkinsfile, and how do you use it in your project? | [jenkins lesson 3](#jenkins-3) |
| What is a multibranch pipeline? | [jenkins lesson 3](#jenkins-3) |
| What is Blue-Green deployment vs Canary deployment? Explain with examples. | [cloudsenior lesson 10](#cloudsenior-10) |
| What branching strategy do you follow, and how do you handle a production bug? | [git lesson 5](#git-5) |
| What is the difference between git merge and git rebase? When do you use each? | [git lesson 3](#git-3) |
| What is git stash used for? | [git lesson 4](#git-4) |
| Ansible: What is an Ansible playbook? | [ansible lesson 2](#ansible-2) |
| Ansible: How do you work with modules and roles? | [ansible lesson 4](#ansible-4) |
| Ansible: How do you use handlers in a playbook? | [ansible lesson 3](#ansible-3) |
| Ansible: How do you store secrets securely in Ansible? | [ansible lesson 5](#ansible-5) |
| Ansible: How do you run your Ansible projects? | [ansible lesson 4](#ansible-4) |
| What is the difference between Scripted and Declarative Jenkins pipelines, and when would you use each? | [jenkins lesson 3](#jenkins-3) |
| Git: what are the essential Git commands, and what does each do? | [git lesson 1](#git-1) |
| Git: what is the difference between git push, git fetch and git pull? | [git lesson 3](#git-3) |
| Git: how do you recover deleted changes (lost commits, a deleted branch, discarded files)? | [git lesson 4](#git-4) |
| What are Jenkins Shared Libraries, and how do you use them to reduce or modularize a large Jenkinsfile? | [jenkins lesson 3](#jenkins-3) |
| How would you implement blue/green deployment with rollback on Azure using Terraform and pipelines? | [cloudsenior lesson 10](#cloudsenior-10) |
| Compare deployment strategies: in-place, rolling, immutable, traffic splitting (canary) and blue/green. | [cloudsenior lesson 10](#cloudsenior-10) |

### Terraform and Infrastructure as Code

| Question | Covered in the course |
| --- | --- |
| What is Infrastructure as Code, and how do you manage it using Terraform or CloudFormation? | [terraform lesson 1](#terraform-1) |
| What is the Terraform state file and why is it important? | [terraform lesson 4](#terraform-4) |
| What are the two main types of variables in Terraform? How are locals and outputs different? | [terraform lesson 2](#terraform-2) |
| What is the difference between count and for_each, and what is a for expression? When do you use each? | [terraform lesson 3](#terraform-3) |
| What is drift in Terraform? | [terraform lesson 4](#terraform-4) |
| What is immutable infrastructure, and how do Packer and Terraform help? | [terraform lesson 7](#terraform-7) |
| How do you set up remote state and state locking, especially when multiple engineers modify infrastructure at the same time? | [terraform lesson 4](#terraform-4) |
| How do you manage existing (unmanaged) AWS resources in Terraform? What is the difference between terraform import and an import block? | [scenarios lesson 1](#scenarios-1) |
| Besides depends_on, how do you control the order in which resources are deployed? Can you add a time delay? | [terraform lesson 3](#terraform-3) |
| How do you manage separate environments (Dev, Test, Prod) in Terraform? Workspaces or separate directories? | [terraform lesson 6](#terraform-6) |
| How do you refactor Terraform code (rename resources, move them into modules) without downtime or recreation? | [terraform lesson 4](#terraform-4) |
| Why might terraform plan show NO changes even though someone modified the infrastructure outside Terraform? | [terraform lesson 4](#terraform-4) |

### AWS

| Question | Covered in the course |
| --- | --- |
| Explain the main networking concepts in AWS. | [cloud lesson 2](#cloud-2) |
| What is an AWS VPC and a subnet? | [cloud lesson 2](#cloud-2) |
| What is an IAM role? | [cloud lesson 2](#cloud-2) |
| What is AWS KMS used for, and what should be stored in it? | [cloudsenior lesson 11](#cloudsenior-11) |
| What is your strategy for Disaster Recovery and Backup in AWS? | [cloudsenior lesson 7](#cloudsenior-7) |
| How do you handle secret rotation using Secrets Manager or Parameter Store? | [cloudsenior lesson 11](#cloudsenior-11) |
| How do you connect AWS to an on-premises data center? | [cloudsenior lesson 6](#cloudsenior-6) |

### GCP, Azure and DevSecOps

| Question | Covered in the course |
| --- | --- |
| Security: How do you manage secrets securely? Are Kubernetes Secrets encrypted? | [cloudsenior lesson 11](#cloudsenior-11) |
| Security: What is the Shared Responsibility Model (in Azure, and how does it apply to AWS/GCP)? | [cloud lesson 1](#cloud-1) |

### Monitoring, observability, SRE and scale design

| Question | Covered in the course |
| --- | --- |
| What is observability, and how is it different from monitoring? | [cloudsenior lesson 12](#cloudsenior-12) |
| What are SLI, SLO, SLA and error budget? | [monitoring lesson 4](#monitoring-4) |
| After an outage, how would you conduct a proper post-incident analysis (RCA / blameless postmortem)? | [cloudsenior lesson 9](#cloudsenior-9) |

