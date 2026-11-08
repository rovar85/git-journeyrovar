---
track: cloud
title: "DevOps foundations: culture, the delivery pipeline, DORA metrics, shift-left and DevSecOps"
short: DevOps foundations
sub: What DevOps actually is, the four delivery metrics computed from data, why small changes are safer, and what security looks like inside the pipeline. The concept questions every DevOps interview opens with.
---

:::goals
- explain DevOps as culture, practices and tooling, not a job title or a tool
- distinguish CI, continuous delivery and continuous deployment
- compute and interpret the four DORA metrics, and say how they get gamed
- explain shift-left testing and DevSecOps with the stages of a secure pipeline
- compare DevOps, SRE and platform engineering
:::

:::note Where the detail lives
This lesson is the map. Version control is in [Git](#git-1); pipelines in [Jenkins](#jenkins-1); infrastructure as code in [Terraform](#terraform-1); containers in [Docker](#docker-1) and [Kubernetes](#kubernetes-1); reliability in [Monitoring](#monitoring-1); incidents in [Interview scenarios](#scenarios-1); architecture-level thinking in [Senior cloud](#cloudsenior-1).
:::

## 1. What DevOps is

Before DevOps, **developers** were rewarded for shipping change and **operations** for keeping things stable, so they pulled in opposite directions: releases were rare, big, risky and blamed on "the other team". DevOps removes the wall:

- **Culture:** shared ownership of the whole life of a service, from code to production ("you build it, you run it"), blameless learning from failure, and fast feedback.
- **Practices:** version control for everything, automated build and test, small frequent releases, infrastructure as code, monitoring and on-call by the team that owns the service.
- **Tools:** the pipelines, containers and platforms that make those practices cheap.

A common summary is **CALMS**: **C**ulture, **A**utomation, **L**ean (small batches, flow), **M**easurement, **S**haring. Notice that only one letter is about tools. Buying tools without changing how people work does not give you DevOps.

## 2. CI, continuous delivery, continuous deployment

- **Continuous integration (CI):** every change is merged to the shared main branch **often** and verified automatically (build, unit tests, static checks). Goal: find integration problems within minutes.
- **Continuous delivery:** every change that passes the pipeline is **ready to release at any time**; a human decides when (a button).
- **Continuous deployment:** every change that passes the pipeline is released to production **automatically**.

Prerequisites that people forget: a fast, trusted test suite; **trunk-based** development or very short-lived branches ([Git 5](#git-5)); feature flags to separate deploying code from releasing a feature ([Interview scenarios 7](#scenarios-7)); and an automated, rehearsed **rollback**.

## 3. A delivery pipeline, stage by stage

1. **Commit** to a branch, with a pull request and review.
2. **Build** once, producing an immutable, versioned **artifact** (a container image, a package). Build **once**, promote the same artifact through environments.
3. **Test:** unit, integration, then slower end-to-end and performance tests.
4. **Static and security checks** (see section 6).
5. **Publish** the artifact to a registry.
6. **Deploy** to staging, run smoke tests, then to production with a safe strategy (rolling, blue/green, canary; see [Kubernetes 3](#kubernetes-3) and [Scenarios 7](#scenarios-7)).
7. **Observe:** dashboards and alerts; automated rollback on bad signals.
8. **Learn:** incident reviews and metrics feed back into the next sprint.

Infrastructure follows the same loop: plan, review, apply, drift detection ([Senior cloud 10](#cloudsenior-10)).

## 4. Measuring delivery: the four DORA metrics

The DevOps Research and Assessment (DORA) research programme found four measures that predict both delivery performance and business outcomes:

| Metric | Question | Kind |
| --- | --- | --- |
| **Deployment frequency** | How often do you release to production? | throughput |
| **Lead time for changes** | How long from commit to production? | throughput |
| **Change failure rate** | What share of deployments cause a failure needing a fix or rollback? | stability |
| **Time to restore service** | How long to recover from a failure? | stability |

Compute them from invented deployment records:

```run
mkdir -p ~/lab/devops && cd ~/lab/devops
cat > dora.py <<'EOF'
from datetime import datetime as D, timedelta as T
# Four months of invented deployment records: (deployed at, commit time of the oldest change in it, caused a failure?, minutes to restore)
deploys = [
 ("2026-03-02 10:00", "2026-03-01 15:00", False, 0), ("2026-03-04 11:30", "2026-03-03 09:00", False, 0), ("2026-03-05 16:00", "2026-03-04 10:00", True, 95),
 ("2026-03-09 10:15", "2026-03-06 14:00", False, 0), ("2026-03-11 09:40", "2026-03-10 16:30", False, 0), ("2026-03-12 14:10", "2026-03-11 11:00", False, 0),
 ("2026-03-16 10:00", "2026-03-13 15:00", False, 0), ("2026-03-18 15:45", "2026-03-17 09:30", True, 40), ("2026-03-19 11:00", "2026-03-18 10:00", False, 0),
 ("2026-03-23 10:30", "2026-03-20 17:00", False, 0), ("2026-03-25 13:00", "2026-03-24 09:00", False, 0), ("2026-03-26 10:20", "2026-03-25 14:00", False, 0),
]
f = lambda s: D.strptime(s, "%Y-%m-%d %H:%M")
days = (f(deploys[-1][0]) - f(deploys[0][0])).days + 1
leads = sorted((f(d) - f(c)).total_seconds() / 3600 for d, c, bad, m in deploys)
fails = [x for x in deploys if x[2]]
print(f"period: {days} days, {len(deploys)} deployments\n")
print(f"1) Deployment frequency   {len(deploys) / days * 7:4.1f} per week")
print(f"2) Lead time for changes  median {leads[len(leads) // 2]:.0f} h from commit to production")
print(f"3) Change failure rate    {len(fails) / len(deploys):.0%} of deployments caused a failure that needed a fix or rollback")
print(f"4) Time to restore        {sum(m for *_, m in fails) / len(fails):.0f} min on average ({', '.join(str(m) for *_, m in fails)} min)")
print("\nHow to read these (the bands move with the industry, so use them as a compass, not a score):")
print("  - Frequency and lead time measure THROUGHPUT: how fast value flows.")
print("  - Failure rate and time to restore measure STABILITY: how safely and how quickly you recover.")
print("  - The surprising finding behind the metrics: speed and stability usually improve TOGETHER, because small, frequent changes are safer.")
print("\nWays these numbers get gamed (and why you should not set them as targets): splitting one change into ten deploys,")
print("not recording rollbacks as failures, counting config changes as deploys. A metric used as a target stops being a good metric.")
EOF
python3 dora.py
```


Reading the output: about **3.4 deployments a week**, a median lead time of about **28 hours**, **17%** of deployments causing a failure, and about **68 minutes** to restore. Two findings are worth remembering for an interview:

- **Speed and stability go together in the research.** Teams that deploy small changes often have *lower* failure rates and faster recovery, because each change is small, easy to understand and easy to roll back. "Slow down to be safe" tends to make releases bigger and riskier.
- **Do not turn the metrics into targets.** Teams can inflate frequency by splitting changes, hide failures by not recording rollbacks, or count config tweaks as deploys. Use the metrics to **find bottlenecks** (long lead time means slow review or testing; high failure rate means weak tests) and compare a team with **its own past**, not with other teams.

(Newer versions of the research add a fifth measure related to reliability and rework; the exact definitions and performance bands change, so check the current DORA publications before quoting numbers.)

## 5. Shift-left

**Shift-left** means moving checks **earlier** in the delivery flow (toward the developer, to the left on the timeline) because a defect is cheaper to fix the sooner it is found. A typo caught by a linter in the editor costs seconds; the same defect found in production costs an incident. Examples: linting and unit tests on every commit, contract tests between services, security scanning in the pull request, policy checks on infrastructure code before it is applied ([Terraform](#terraform-1), [Kubernetes 8](#kubernetes-8)), and testing in production-like environments early.

The balance: shift-left does not remove testing on the right (canaries, monitoring, chaos experiments). **Shift left to find problems early; shift right to find the ones you could not predict.**

## 6. DevSecOps: security inside the pipeline

**DevSecOps** means security is a shared responsibility built into the pipeline, not a gate at the end run by a separate team. Typical stages and tools by category:

| Stage | Check | What it finds |
| --- | --- | --- |
| Commit | **Secret scanning**, pre-commit hooks | keys and passwords in code |
| Build | **SAST** (static analysis of your code) | injection flaws, unsafe functions |
| Build | **SCA** (software composition analysis) and an **SBOM** (list of components) | known-vulnerable libraries |
| Package | **Image scanning**, minimal base images, image signing | OS and library vulnerabilities, tampering |
| Infrastructure code | **IaC scanning** and policy as code | open security groups, unencrypted storage |
| Deploy | **Admission policy** (for example Pod security, Kyverno) | unsafe workloads ([Kubernetes 19](#kubernetes-19)) |
| Test | **DAST** (testing the running app) | runtime and configuration flaws |
| Run | Runtime detection, patching, least-privilege identities, audit logs | attacks and drift |

Principles to state: **least privilege**, **no long-lived secrets** (use a secret store and short-lived credentials), **sign and verify artifacts**, **fail the build** on high-severity findings but give developers fast, clear fixes (a scanner nobody can act on is ignored). See [Interview scenarios 8](#scenarios-8) for a vulnerable-dependency scenario and [Network security scenarios](#scenarios-10) for the network side.

## 7. DevOps, SRE and platform engineering

- **DevOps** is the culture and practice of shared ownership and flow.
- **SRE (site reliability engineering)** applies software engineering to operations: **SLOs and error budgets** decide how much risk to take, toil is automated away, and on-call and post-incident learning are structured. SRE is one concrete way to *implement* DevOps ideas ([Monitoring 4](#monitoring-4)).
- **Platform engineering** builds an **internal developer platform**: golden paths, self-service environments and pipelines, so product teams get the DevOps practices without each reinventing the tooling ([Senior cloud 13](#cloudsenior-13)).

A fair interview answer: "DevOps is the goal and culture, SRE is a discipline with specific mechanisms such as error budgets, and platform engineering is how a large organisation delivers the tooling."

## 8. Common anti-patterns

- **A "DevOps team"** that becomes a new silo between development and operations.
- **Tools first, culture later.**
- **Manual approvals everywhere** that add delay without reducing risk (use automated checks and small changes instead).
- **Long-lived feature branches** and big-bang releases.
- **Snowflake servers** configured by hand, instead of code.
- **Blame after incidents**, which teaches people to hide problems.
- **Alert noise and no ownership of production** by the team that built it.

## Questions to expect

- What is DevOps, in your own words, and what problem does it solve?
- Difference between continuous delivery and continuous deployment?
- What is infrastructure as code and why use it?
- What is shift-left? Give an example.
- Which metrics would you use to know if a team's delivery is improving?
- What is a blameless post-mortem and what does it contain? (Timeline, impact, causes, what went well, actions with owners; no individual blame.)
- DevOps versus SRE?

## Practice (answers below)

1. Your lead time is 3 weeks and your failure rate is low. What does that suggest, and what would you look at first?
2. Add to the script a check for the "weekend deploys" count and argue whether it is a good metric.
3. A security team wants a manual review before every release. Propose an alternative that keeps their control.

:::recap
- DevOps = **culture + practices + tools**; **CALMS**; shared ownership and fast feedback.
- **CI** merges often with automated checks; **delivery** is always releasable; **deployment** releases automatically.
- **DORA:** deployment frequency, lead time, change failure rate, time to restore; use them to find bottlenecks, not as targets.
- **Shift-left** finds defects early; **DevSecOps** puts secret, code, dependency, image, IaC and policy checks into the pipeline.
- **SRE** and **platform engineering** are ways to implement DevOps at scale.
:::

:::note Answers
1. Changes wait a long time (batching, slow review, manual approvals, slow tests, or infrequent releases) while quality is fine; look first at where changes spend time in the pipeline (review queue, test duration, approval steps) and make them smaller. 2. Count deployments whose weekday is Saturday or Sunday; it is a weak metric because it can punish valid on-call fixes and encourage avoiding honest reporting, so use it as a conversation starter, not a target. 3. Replace the manual gate with automated, auditable controls: required checks, policy as code, signed artifacts, and a review of the exceptions and the policy itself, with the security team owning the rules in code.
:::

```quiz
? What is the difference between continuous delivery and continuous deployment?
+ Delivery keeps every change releasable with a human release decision; deployment releases every passing change automatically
- They are the same
- Delivery has no tests
- Deployment needs no pipeline
! The difference is whether a person presses the release button.

? Which are the four DORA metrics?
+ Deployment frequency, lead time for changes, change failure rate, time to restore service
- CPU, memory, disk, network
- Latency, traffic, errors, saturation
- Cost, speed, quality, scope
! The four measure throughput and stability of software delivery.

? What does shift-left mean?
+ Finding defects earlier in the process, where they are cheaper to fix
- Moving servers to the left datacenter
- Deleting tests
- Releasing less often
! Earlier checks mean smaller, cheaper fixes.
```
