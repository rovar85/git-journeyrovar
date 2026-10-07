---
track: cloudsenior
title: Q9: Describe a major cloud incident you owned: detection, RCA, fix and long-term prevention
short: Q9 Incident story
sub: How to tell an incident story that shows senior judgement, with the structure, the measurements (MTTD, MTTR), a blameless post-incident review, and a working timeline analyser. The worked example is labelled fiction; the story you tell must be your own.
---

:::goals
- explain what a behavioural incident question tests and how to answer it honestly
- structure the story: context, detection, response, root cause, fix, prevention, and what you learned
- compute incident metrics (time to detect, to acknowledge, to mitigate, to resolve) from a timeline
- write a blameless post-incident review with a causal chain and tracked actions
- recognise mistakes that make incident answers weak
:::

:::note Read this first
This question asks for **your** experience, and **I cannot supply it**. Inventing an incident and presenting it as yours would be dishonest, and interviewers probe stories with follow-ups that expose invented detail. So this lesson gives you **the structure, the vocabulary, the measurements and a template**, and a **worked example that is clearly an illustration built from this course's labs** (a made-up "archive indexing outage"). **Replace the example with a real event from your career**: an outage you handled, a near miss, a lab failure, or a significant incident you took part in (take part in, not necessarily lead: say precisely what **your** role was). If your experience is limited, say so, then show how you **would** run one using this structure, and describe real drills you have done (the labs in this course are legitimate practice, described as practice).
:::

## 1. What the interviewer is testing

- **Ownership and calm under pressure**: did you take responsibility and stay methodical?
- **Technical depth**: do you understand the system well enough to find the real cause?
- **Systems thinking**: did you look beyond the trigger to the **conditions** that allowed it?
- **Learning culture**: **blameless** analysis, **actions that prevent recurrence**, follow-through.
- **Communication**: customers, leadership, and the team during the incident and after.
- **Honesty about mistakes**: strong candidates say what went **wrong in the response** too.

## 2. The structure of a strong answer (about three minutes)

A variation of **STAR** (situation, task, action, result) suited to incidents:

| Part | Content | Time |
|---|---|---|
| **1. Context** | the system, its importance and scale, **your role** | 20 s |
| **2. Impact** | what users or the business experienced, how many, how long | 20 s |
| **3. Detection** | **how it was found** (alert, customer, luck?), and how long it took | 20 s |
| **4. Response** | actions in order, **how you chose them**, what you communicated, **mitigation before diagnosis** | 60 s |
| **5. Root cause** | the **causal chain** (trigger, contributing factors, why it was not caught), not just the trigger | 30 s |
| **6. Resolution and prevention** | the fix, then **systemic** improvements: detection, process, design, with owners and **evidence they worked** | 40 s |
| **7. Reflection** | what **you** would do differently; what you learned | 20 s |

Principles: **numbers** (minutes, percentages, users), **"I" for your actions and "we" for team results**, **no blame**, and **end on what changed permanently**.

## 3. Incident response in one page

1. **Detect** (monitoring and alerting, Q12; or a report).
2. **Triage**: severity from **impact** (users, revenue, data, security), not from effort.
3. **Assign roles**: an **incident commander** who coordinates (and does not debug), **communications**, **operations/technical leads**, a **scribe** who keeps the timeline.
4. **Mitigate first, diagnose second**: **restore service** by the fastest safe means (roll back, fail over, scale up, disable a feature) before you understand why.
5. **Communicate** on a rhythm (status page, stakeholders, support), even when there is no news.
6. **Resolve and verify** with the same signals that detected it.
7. **Review** within days: blameless post-incident review (PIR) with **actions that have owners and dates**.

A severity scale most organisations use (names vary): **SEV1** critical (major outage or data/security breach, all hands), **SEV2** major degradation, **SEV3** minor, **SEV4** low. Agree the definitions **before** the incident.

## 4. Measure it

Four numbers describe an incident's timeline (definitions vary slightly by organisation; **state the ones you use**):

| Metric | Meaning |
|---|---|
| **MTTD** (time to detect) | start of impact to the **alert or report** |
| **MTTA** (time to acknowledge) | alert to a **human responding** |
| **time to mitigate** | start of impact to **user impact stopped** (even if the root cause is unknown) |
| **MTTR** (time to resolve/restore) | start of impact to **full restoration** |

A **timeline analyser** turns the scribe's log into these numbers, and flags where the time went:

```run
mkdir -p ~/lab/cs && cd ~/lab/cs
cat > timeline.py <<'EOF'
import datetime as dt
T = lambda s: dt.datetime.strptime("2026-03-14 " + s, "%Y-%m-%d %H:%M")
# An ILLUSTRATIVE (fictional) timeline: an archive indexing outage caused by a full SQL disk.
EVENTS = [
    ("02:00", "impact_start", "nightly backup starts; log files grow; the SQL data disk fills up"),
    ("02:10", "alert_gap",    "no alert fires: disk alert threshold was 95% and checked every 15 min (gap found later)"),
    ("04:50", "detected",     "support ticket: users cannot search the archive"),
    ("04:56", "acknowledged", "on-call engineer acknowledges the page"),
    ("05:05", "diagnosis",    "indexing errors point to SQL timeouts; disk found 100% full"),
    ("05:12", "mitigated",    "emergency: transaction log truncated after backup verified; service accepting writes again"),
    ("05:40", "resolved",     "indexing backlog drained; search latency back under SLO"),
]
start = T("02:00")
def at(kind): return T(next(t for t, k, _ in EVENTS if k == kind))
first_detect = at("detected")
m = lambda a, b: int((b - a).total_seconds() // 60)
print("timeline")
for t, k, d in EVENTS: print(f"  {t}  {k:13} {d}")
print("\nmetrics")
print(f"  time to detect (impact -> first human report): {m(start, first_detect):4d} min   <- the biggest problem")
print(f"  time to acknowledge (page -> response):        {m(first_detect, at('acknowledged')):4d} min")
print(f"  time to mitigate (impact -> service back):     {m(start, at('mitigated')):4d} min")
print(f"  time to resolve (impact -> fully restored):    {m(start, at('resolved')):4d} min")
share = m(start, first_detect) / m(start, at('resolved'))
print(f"\nDetection took {share:.0%} of the total outage: the long-term fix is monitoring, not faster typing.")
EOF
python3 timeline.py
```

The analysis already tells the story **an interviewer wants to hear**: the response was quick (a few minutes to acknowledge and mitigate), but **the outage lasted hours because nothing detected it**. Good post-incident work then **targets the biggest slice of time**.

## 5. The post-incident review

A **blameless** review assumes people acted reasonably **given what they knew**, and asks **what about the system made the failure possible**. Its core is a **causal chain**, written with "why" repeated until you reach **conditions you can change** (not "a person made a mistake"):

```run
cd ~/lab/cs
cat > pir.py <<'EOF'
CHAIN = [
    ("Why were users unable to search?",           "Indexing stopped: SQL requests timed out."),
    ("Why did SQL requests time out?",             "The SQL data disk was 100% full."),
    ("Why was the disk full?",                     "The nightly backup grew the transaction log faster than the backup job freed it, and growth was never reviewed."),
    ("Why did nobody know before users did?",      "The disk alert fired only at 95% and was evaluated every 15 minutes; no alert on growth rate or on backup duration."),
    ("Why was the alert design like that?",        "Alert thresholds were copied from a template for a small system and never revisited when data volume tripled."),
]
ACTIONS = [
    ("Alert on predicted time-to-full (growth rate) and at 80%, evaluated every minute", "platform team", "2 weeks", "alert fires in a game day test"),
    ("Backup duration and log growth as SLIs with dashboards", "dba", "3 weeks", "dashboard reviewed weekly"),
    ("Capacity review step added to the quarterly service review", "service owner", "1 month", "review recorded"),
    ("Runbook for 'disk full' with safe emergency steps, tested in a drill", "on-call lead", "2 weeks", "drill completed by all on-call engineers"),
]
print("CAUSAL CHAIN (blameless: no person appears in it)")
for i, (q, a) in enumerate(CHAIN, 1): print(f"  {i}. {q}\n     -> {a}")
print("\nACTIONS (each needs an owner, a date and a way to prove it worked)")
for what, owner, due, proof in ACTIONS: print(f"  - {what}\n      owner: {owner}; due: {due}; evidence: {proof}")
print("\nWhat went well: quick acknowledgement, safe mitigation, clear communication.   What did not: detection, capacity visibility.")
EOF
python3 pir.py
```

The shape to copy for your own story:

- **Trigger** (the backup), **contributing conditions** (alert design, capacity reviews), **detection gap** (the real lesson), and **preventive actions across categories**: detection, process, design, and practice.
- Actions are **specific, owned, dated and verifiable**, and you **followed through** (say whether the follow-up happened; "we wrote actions and they were done by X" is stronger than "we wrote actions").
- **What went well** is part of a good review: reinforce those practices.

## 6. A worked example (fiction): how the three minutes sound

*(Illustration only: the incident is invented from this course's material. Do **not** present it as your experience.)*

> "Context: I was the on-call engineer for the archiving platform, which stores and indexes mail for about 20,000 users. At 04:50 a support ticket said search was down. [**Impact**] Search and archiving were unavailable for about 3 hours, 40 minutes; no data was lost. [**Detection**] No alert fired. The outage had started at 02:00 when the SQL data disk filled during the nightly backup; the disk alert only fired at 95% with a 15-minute check, and the disk went from 90 to full in minutes. [**Response**] I acknowledged within six minutes, saw SQL timeouts in the indexing log, found the disk at 100%, and took the safest mitigation: after confirming the latest backup was valid, truncated the transaction log to free space. Service was back at 05:12; I coordinated updates to support and the business every 30 minutes. [**Root cause**] The trigger was backup growth; the root causes were alert thresholds copied from a small system, no growth-rate alerting, and no capacity review. [**Prevention**] We added predicted time-to-full alerts, backup duration and log growth dashboards, a quarterly capacity review, and a tested runbook. We proved the alert in a game day; the next growth event paged us at 80% with 4 hours of margin. [**Reflection**] I would also have pre-agreed what is safe to delete in an emergency, because I spent 10 minutes verifying that under pressure."

Why it works: **numbers, a role, a clear causal chain, mitigation before diagnosis, systemic fixes with evidence, and honest reflection**.

## 7. Your own story: a checklist to build it

1. **Pick the right incident**: significant impact, **you had a real role**, there is a clear technical lesson, and you can speak to **before and after**.
2. **Gather facts**: timeline, numbers, tools, people, the review document if one exists (without confidential details: anonymise customers, internal system names if required).
3. **Write the seven parts above** and time yourself to three minutes.
4. **Prepare for probes**: "What exactly did you run?" "Why that option and not rollback?" "What if it had been the database?" "What did you get wrong?" "Who disagreed with you?"
5. **Have two or three stories** ready (an outage, a security event, a near miss or a failed change), because interviewers often ask for a second.
6. **If you lack a large incident**, tell the best real one you have, and say what scale it was; then show maturity by describing **how you would handle a larger one**, citing the practices above and any drills you ran.

## 8. Follow-up questions to expect

- "**What would you do differently?**" (always have a real answer)
- "How did you **decide to roll back vs fix forward**?" (restore service first; fix forward only if it is faster and safe)
- "How did you **communicate** with non-technical stakeholders?" (impact in business terms, next update time, no speculation)
- "How do you prevent **blame** from creeping into a review?" (focus on conditions; ask "how did this make sense at the time?"; leadership models it)
- "How do you ensure **actions actually get done**?" (owners, dates, tracking in the normal backlog, review at the next meeting, visible to leadership)
- "What is the difference between a **root cause** and a **contributing factor**?" (complex failures have several; "root cause" singular is often a simplification)

:::warn Common mistakes
- **Inventing or exaggerating an incident.** It collapses under follow-up questions and it is dishonest.
- **Telling only the heroic part**: ending at "I fixed it" with no prevention.
- **Blaming a person or a team.**
- **Diagnosing before mitigating** while users suffer.
- **Vague numbers**: "it was down a while".
- **Actions without owners, dates or evidence.**
- **A root cause that is only the trigger** ("the disk filled up"): ask why until you reach a changeable condition.
:::

:::recap
- The question tests ownership, depth, systems thinking, communication and learning; **honesty matters**: use **your** real story.
- Structure: **context, impact, detection, response, root cause, fix and prevention, reflection**, with numbers.
- **Mitigate before diagnosing**; measure **MTTD, MTTA, time to mitigate, MTTR** and attack the biggest slice.
- A **blameless review** builds a causal chain to changeable conditions and **owned, dated, verifiable actions**.
:::

:::try Your turn
Write your own timeline file in the same format as `timeline.py` for a **real incident or a lab failure from this course** (for example the lab cluster restarts or the build hang), compute the four metrics, and write a five-line causal chain in the style of `pir.py`. Then say the three-minute answer out loud and time it.
:::

:::quiz
? What should you do first in a major incident?
+ Restore service by the fastest safe means, then investigate the cause
- Find the root cause before touching anything
- Write the post-incident review
- Wait for a manager's approval
! Mitigation first; diagnosis can continue afterwards.
? What makes a post-incident review "blameless"?
+ It examines how the system and conditions allowed the failure, assuming people acted reasonably with the information they had
- It names nobody and discusses nothing
- It avoids actions
- It blames the process owner
! The goal is fixing conditions, not punishing people.
? What is the best response if you have no large incident to describe?
+ Tell your best real, smaller incident honestly and describe how you would handle a larger one
- Invent a dramatic incident
- Describe someone else's incident as yours
- Refuse to answer
! Honesty and clear thinking beat a fabricated story.
:::
