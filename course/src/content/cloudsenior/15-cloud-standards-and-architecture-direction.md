---
track: cloudsenior
title: "Q15: How do you set cloud standards and architecture direction across many teams?"
short: Q15 Standards and direction
sub: Architecture decision records, reference architectures, well-architected reviews with a scorecard you run, a maturity model, and how to lead by influence. Frameworks and mechanics, not invented experience.
---

:::goals
- explain how a senior engineer or leader sets direction **without becoming a bottleneck**
- write and **validate architecture decision records (ADRs)** with a real checker
- run a **well-architected style review** with a scorecard that ranks the gaps
- use a **maturity model** to prioritise improvements and show progress
- keep standards alive: exceptions, deprecation, measurement, and communication
- tell the story honestly, with **your** experience and not a template
:::

:::note Provenance
The ADR checker and the scorecard are Python that **runs here on invented data** ("Northwind" again). The pillar names follow the **widely used well-architected framework structure** (operational excellence, security, reliability, performance efficiency, cost optimisation, sustainability) from general knowledge; each provider words them slightly differently. This lesson is a **framework**: it gives you the structure and tools, but your interview answer must use **your own real examples**.
:::

## 1. What "setting direction" really means

A senior person does not write every design. They make the **right thing easy** and the **wrong thing visible**:

| Mechanism | Purpose | Where it appears in this track |
|---|---|---|
| **Principles** (3 to 7 sentences) | the shared compass when rules run out | below |
| **Reference architectures** | a proven design for common cases (a web service, a data pipeline) | Q1, Q3, Q6 |
| **Paved path / golden path** | the supported way, with templates and defaults | Q13 |
| **Policy as code and modules** | standards **enforced by the platform** | Q4, Q8 |
| **ADRs** | **decisions recorded** with context, so they are not re-litigated | section 3 |
| **Reviews** (well-architected, design review) | **find the gaps early**, teach, rank | section 4 |
| **Maturity model and metrics** | **where we are, where next**, progress visible | section 5 |
| **Exceptions process** | the **safety valve**, time-limited and recorded | section 6 |

The senior sentence: **"I scale decisions by writing them down, building them into the platform, and reviewing by exception, so teams stay fast and the organisation stays consistent."**

## 2. Principles beat long rulebooks

Examples of principles a platform group might publish (these are **illustrative wording**, adapt them):

1. **Secure by default**: the easy path is the safe path.
2. **Automate everything repeatable**; manual steps are bugs waiting to happen.
3. **Design for failure**: assume any component, zone or region can fail.
4. **Own what you run**: teams run their services and see their costs.
5. **Prefer managed services** unless a clear reason exists, because operations is the expensive part.
6. **Everything has an owner, a label and a cost.**
7. **Decisions are recorded and reversible where possible.**

Principles do not replace rules; they **explain** them, so people can decide well when a rule does not fit.

## 3. ADRs: decisions that survive staff changes

An **architecture decision record** is a short document: **context** (the forces), **decision**, **alternatives considered**, **consequences** (good and bad), **status** and **date**. Stored **in the repository** next to the code, reviewed by **pull request**. The point is not paperwork; it is that **in two years nobody has to guess why**.

A tiny checker enforces the minimum shape so ADRs stay useful:

```run
mkdir -p ~/adr && cd ~/adr
cat > 0007-use-managed-postgres.md <<'MD'
# ADR 0007: Use a managed relational database for new services

Status: accepted
Date: 2026-03-02
Deciders: platform-architecture, payments-lead

## Context
Teams run self-managed databases on VMs. Patching and backups consume about a quarter of on-call time. We need point-in-time recovery for regulated data.

## Decision
New services use the managed relational database offering. Self-managed databases need an approved exception.

## Alternatives considered
- Self-managed on VMs: full control, high operational cost.
- Fully serverless database: cheaper at low volume, limits on extensions we use.

## Consequences
- Good: automated backups, patching, point-in-time recovery.
- Bad: less control over versions and extensions; provider lock-in is higher.
- Review date: 2027-03-02
MD
cat > 0008-pick-a-queue.md <<'MD'
# ADR 0008: Pick a queue

Status: proposed

## Decision
We will use Kafka.
MD
cat > check_adr.py <<'PY'
import glob, re, sys

REQUIRED = ["Status", "Date", "Context", "Decision", "Alternatives considered", "Consequences"]
VALID_STATUS = {"proposed", "accepted", "superseded", "deprecated", "rejected"}
failed = 0
for path in sorted(glob.glob("0*.md")):
    text = open(path).read()
    problems = []
    for key in REQUIRED:
        if not re.search(rf"^(#+\s*)?{re.escape(key)}\b", text, re.M | re.I):
            problems.append(f"missing '{key}'")
    m = re.search(r"^Status:\s*(\w+)", text, re.M)
    if m and m.group(1).lower() not in VALID_STATUS:
        problems.append(f"unknown status '{m.group(1)}'")
    if "Consequences" in text and not re.search(r"^- Bad:", text, re.M):
        problems.append("consequences list no downside (every decision has one)")
    if problems:
        failed += 1
    print(f"{'FAIL' if problems else 'ok  '} {path}" + ("" if not problems else "  -> " + "; ".join(problems)))
sys.exit(1 if failed else 0)
PY
python3 check_adr.py; echo "exit code: $?"
```

**What you see:** the complete ADR passes; the thin one fails with **specific reasons** (no context, no alternatives, no consequences). The rule "**every decision lists a downside**" is deliberate: an ADR with only benefits is a sales pitch. In a real repository this runs in the **pipeline**, so a record that is too thin cannot be merged.

## 4. Well-architected review: find gaps, rank them

A **review** walks a workload through the **pillars** with **questions**, and records **evidence**, not opinion. Each answer gets a **score** (0 not done, 1 partly, 2 done) and each question has a **risk weight**. Output: a **ranked list of gaps**, with **owners** and a **date**. Here a team's answers are in a file; the tool ranks the risk.

```run
mkdir -p ~/review && cd ~/review
cat > answers.csv <<'CSV'
pillar,question,weight,score,evidence
security,"Is data encrypted at rest and in transit?",5,2,"policy scan green, KMS keys per account"
security,"Are secrets kept out of code and rotated?",5,1,"vault in use, two legacy services still read env files"
security,"Is access least-privilege and group-based?",4,2,"access review last month"
reliability,"Is there a tested restore from backup?",5,0,"backups exist, no restore drill recorded"
reliability,"Does the service survive loss of one zone?",4,1,"2 zones, but database is single-zone"
reliability,"Are SLOs defined and alerts burn-rate based?",3,1,"SLO defined, alerts are threshold based"
operations,"Is infrastructure defined as code and reviewed?",4,2,"all in Terraform, modules versioned"
operations,"Is there a runbook and on-call rotation?",3,2,"runbook reviewed in Q2"
cost,"Are resources tagged and costs visible per team?",3,1,"70% tagged"
cost,"Are idle and oversized resources reviewed?",2,0,"no review process"
performance,"Is load tested before major releases?",3,1,"last test 9 months ago"
sustainability,"Are workloads right-sized and scheduled off when idle?",1,0,"not considered"
CSV
cat > score.py <<'PY'
import csv, collections

rows = list(csv.DictReader(open("answers.csv")))
by_pillar = collections.defaultdict(lambda: [0, 0])
gaps = []
for r in rows:
    w, s = int(r["weight"]), int(r["score"])
    by_pillar[r["pillar"]][0] += w * s
    by_pillar[r["pillar"]][1] += w * 2
    risk = w * (2 - s)                       # how much is missing, weighted
    if risk:
        gaps.append((risk, r["pillar"], r["question"], r["evidence"]))

print(f"{'pillar':16} {'score':>6}  bar")
for p, (got, best) in sorted(by_pillar.items(), key=lambda kv: kv[1][0] / kv[1][1]):
    pct = 100 * got / best
    print(f"{p:16} {pct:5.0f}%  {'#' * int(pct / 5)}")

total = 100 * sum(g for g, _ in by_pillar.values()) / sum(b for _, b in by_pillar.values())
print(f"\noverall: {total:.0f}%\n")
print("top gaps (risk = weight x missing score):")
for risk, pillar, q, ev in sorted(gaps, reverse=True)[:5]:
    print(f"  risk {risk:2}  [{pillar}] {q}\n           evidence: {ev}")
PY
python3 score.py
```

**What you see:** the pillars ranked by weakness, an overall score, and the **five highest-risk gaps**. The top gap is **"no tested restore"** (weight 5, score 0), and the **evidence column** shows **why** each score was given. Notice what the score does **not** do: it does not decide for the team. It focuses the **conversation** on the **highest risk first**, and each gap becomes an **action with an owner** (the same shape as the PIR actions in Q9).

:::warn A score is a conversation starter, not a grade
If teams are **punished** for low scores they will **inflate answers**. Make reviews **safe**: the goal is a **shared backlog**, and the best reviewers **ask for evidence** (a restore log, a dashboard), not for reassurance.
:::

## 5. A maturity model for direction and progress

A maturity model lets you say **where we are** and **what is next** without demanding perfection everywhere at once.

| Level | Description | Typical signs |
|---|---|---|
| **1 Ad hoc** | individuals do their best | manual, console-driven, unknown owners |
| **2 Repeatable** | scripts and templates exist | some IaC, inconsistent tagging |
| **3 Defined** | standard paths exist and are used | modules, pipelines, policy in CI, ADRs |
| **4 Measured** | outcomes are tracked | SLOs, cost per team, drift and violation trends |
| **5 Optimising** | continuous improvement is routine | automated remediation, regular game days, deprecation of old standards |

Score **each capability** separately (delivery, security, reliability, cost, observability), because maturity is **uneven**. Then pick **two or three** improvements per quarter with the **biggest risk reduction**, and **show the trend**.

```run
cd ~/review
cat > maturity.py <<'PY'
capabilities = {            # capability: (current level, target level, business importance 1-5)
    "infrastructure as code":     (3, 4, 4),
    "security guardrails":        (3, 4, 5),
    "backup and recovery":        (2, 4, 5),
    "observability and slos":     (2, 3, 4),
    "cost visibility":            (2, 3, 3),
    "incident response":          (3, 4, 4),
    "self-service platform":      (2, 3, 3),
}
print(f"{'capability':26} {'now':>3} {'target':>6} {'gap x importance':>17}")
ranked = sorted(capabilities.items(), key=lambda kv: -(kv[1][1] - kv[1][0]) * kv[1][2])
for name, (now, target, imp) in ranked:
    print(f"{name:26} {now:3} {target:6} {(target - now) * imp:17}")
print("\nnext quarter:", ", ".join(n for n, _ in ranked[:3]))
PY
python3 maturity.py
```

**What you see:** a ranked, explainable priority list. **Backup and recovery** tops it because the gap is large **and** the business importance is high. It matches the weakest item in the review above, which is the kind of **consistency across your evidence** that makes a roadmap believable.

## 6. Keeping standards alive

Standards decay unless you **maintain** them:

- **Exceptions are normal**: record **who, why, risk, compensating control and expiry** (Q4 had expiry-checked exceptions). **No expiry means it is a new standard**.
- **Deprecate** deliberately: announce, provide a **migration path** (Q14 techniques), set a **date**, measure **adoption**.
- **Measure adoption**: percentage of services on the paved path, **policy violation trend**, **modules at latest version**, **ADR coverage** of major decisions.
- **Review the standards themselves** yearly: remove what no one needs, update what moved on.
- **Communicate**: short **write-ups**, **office hours**, a **community of practice**, **champions** in teams. Direction that lives only in a document nobody reads is not direction.

## 7. Leading by influence

Most senior engineers have **no authority** over other teams. What works:

1. **Listen first**: understand the team's constraints before proposing a standard.
2. **Make the standard the easiest thing**: a module or template that saves them work beats a mandate.
3. **Show evidence**: incidents, cost data, the review score. Avoid "best practice says".
4. **Pilot with a willing team**, publish the result honestly, then widen.
5. **Disagree and commit**: record the decision (ADR), keep the **review date**, move on.
6. **Mentor**: pair on the first uses, **teach the reasoning**, not just the rule.

## 8. How to answer

1. **Frame**: "I scale decisions by writing them down, building them into the platform and reviewing by exception."
2. **Mechanics**: principles, reference architectures, paved path, policy as code, ADRs in the repository, well-architected style reviews, a maturity model with measured adoption.
3. **Human side**: influence over authority, pilots, evidence, exceptions with expiry, deprecation with a path.
4. **A real example**: **one** decision you drove: the **context**, the **options you rejected**, **how you got agreement**, the **result and its downside**, and what you would do differently. **Use your own; do not borrow this lesson's invented data.**
5. **Measures**: adoption of the paved path, violation trend, incident and cost trends, review gap closure.

:::warn Common mistakes
- **A standards document with no enforcement**: the platform and pipeline must carry the rules.
- **Standards written without the teams that must follow them.**
- **ADRs that record only the winning option** and none of the downsides.
- **Reviews used as audits or gotchas**: teams hide problems.
- **No exception path**: people route around you, or break rules silently.
- **Standards never retired**: the rulebook grows until nobody reads it.
- **Talking about "we" when asked what you did**: interviewers want **your** role; be specific and honest about what the **team** did.
:::

## 9. Follow-up questions to expect

- **"Two teams disagree on a technology choice. What do you do?"** Align on **requirements and constraints** first, write both options in an **ADR** with **trade-offs**, decide using **criteria agreed beforehand**, time-box it, record dissent, and set a **review date**.
- **"How do you introduce a new standard without slowing people down?"** Start with a **pilot**, ship the **module or template**, make it **opt-out with a reason** before **required**, measure and iterate.
- **"How do you know your standards are good?"** Fewer incidents of a class, lower cost per team, faster lead time to a new service, **adoption without coercion**, and **fewer exceptions** over time.
- **"How do you keep up with change?"** Scheduled review of the paved path, **proofs of concept** time-boxed, a **radar** of technologies (adopt, trial, assess, hold), and **deprecation** of what no longer earns its place.
- **"What did you get wrong?"** Have a **real, specific, honest** answer (a standard too rigid, a review that scared teams) and say what you changed.

:::try
1. Write an **ADR** for a decision from your own work (or the lab, for example "use Prometheus for metrics") and run `check_adr.py` on it. Add the **downside** if the checker complains.
2. Edit `answers.csv` to **score your own project** honestly and rank the gaps. Which gap surprised you?
3. Add a **`--min-score`** option to `score.py` that exits non-zero if any pillar is below a threshold, and think about **when a gate like that is wise and when it backfires**.
4. Add an **`expires`** column to a small exceptions list and write a check like Q4's that fails on expired entries.
:::

:::recap
- Direction is set by **principles, reference architectures, a paved path, policy as code and ADRs**, not by meetings.
- **ADRs** record context, options and **downsides**; a checker keeps them useful.
- **Well-architected style reviews** rank gaps by weighted risk with **evidence**; they start a conversation and produce owned actions.
- A **maturity model** prioritises improvement and shows progress; maturity is **uneven**.
- Standards need **exceptions with expiry, deprecation paths, adoption metrics and communication**.
- Senior influence comes from **making the right thing easy**, evidence, pilots and mentoring. Tell **your** story honestly.
:::

:::quiz
? Why must an ADR list a downside?
- To make the document longer
+ Every decision has trade-offs, and recording them explains the choice and exposes risk
- Auditors require exactly three
! An ADR with only benefits is a pitch, not a record.

? What is the best way to enforce a standard at scale?
- A long wiki page
+ Build it into the platform: modules, templates and policy as code
- Weekly meetings
! The easy path should be the compliant path.

? In a review scorecard, what should rank the gaps?
- Alphabetical order of questions
+ Weight multiplied by the missing score, with evidence for each answer
- The loudest team
! It focuses effort on the highest risk.

? Why do exceptions need an expiry?
- To annoy teams
+ Without one the exception silently becomes the new standard
- To avoid writing ADRs
! Time-limited exceptions force a revisit.

? How does a senior engineer without authority drive adoption?
- By issuing mandates
+ By making the standard easier than the alternative, using evidence and pilots
- By waiting for a reorganisation
! Influence comes from usefulness and trust.
:::
