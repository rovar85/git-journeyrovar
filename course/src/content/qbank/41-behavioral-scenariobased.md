---
track: qbank
title: "Behavioral and project experience: Scenario-based questions"
short: Behavioral scenario
sub: 10 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Tell me about a recent outage or production incident you handled. What did you learn from it?

<!-- source: 09 Q10 -->

*Also asked as:* Share a real outage incident - what did you learn? Describe an incident and how you responded. Troubleshooting real incidents during on-call. How did you handle outages, communication and postmortems?

:::note In simple words
They are testing how you behave under pressure: do you stay calm, find the real cause with evidence, fix it, and make sure it never happens again?
:::

Sample answer - adapt to your own words (STAR):
- **Situation** - We had built new category-based alert channels (media types) for Teams across all four environments as part of an alert segregation project. Alerts looked configured, but the team was not receiving some expected alerts.
- **Task** - Find out why alerts were not arriving and restore delivery everywhere, fast, because no alerts means we are blind in production.
- **Action** - Instead of assuming the network or Teams was at fault, I tested each media type with the built-in test button and checked the action logs. I found that the new media types had empty message templates, which silently blocked delivery from the day they were created. In one environment some media types were also disabled. I added the templates, enabled them, and verified delivery with live tests in every environment.
- **Result** - Alert delivery was restored on all four environments and verified end to end.
- **Learning** - "Configured" is not the same as "working". Now every new alert path is tested with a real message before it is marked done, and I think about a heartbeat check for the alerting path itself.

**Communication strategy during an outage** (they often ask this separately):
- **One incident commander** runs the call and decides; others investigate. This avoids five people changing things at once.
- **Status updates at a fixed cadence** (for example every 15-30 minutes) in one channel and on the status page, even when the update is "no change, still investigating".
- **Stakeholder-friendly language** - impact, what we are doing and the next update time, not internal jargon. Technical detail stays in the engineering channel.
- **Postmortem within 48 hours** - blameless, with a timeline, root cause and owned action items, shared with everyone affected.

:::say
Tell one incident in STAR form with a clear evidence-based root cause, your specific actions, a verified result and a lasting process change. The learning is what separates a senior answer from a junior one.
:::

## Tell me about a mistake you made in a DevOps project and what you learned from it.

<!-- source: 09 Q11 -->

:::note In simple words
Everyone makes mistakes. They want to see that you own it, fix it quickly and change your process - not that you are perfect.
:::

Sample answer - adapt to your own words (STAR):
- **Situation** - We moved alerting away from an older on-call tool setup, and I reported that the old setup was no longer active.
- **Task** - Make sure there was exactly one reliable alert path to Microsoft Teams.
- **Action** - Later I noticed duplicate alerts in Teams. When I investigated, I found the old setup was still live, with webhooks still posting alongside the new Lambda relay. My mistake was assuming it was decommissioned without checking every remaining integration. I disabled the old webhooks, fixed a forwarding bug, confirmed only one path remained, and corrected my earlier report to the team.
- **Result** - Duplicate alerts stopped, and the team had an accurate picture again.
- **Learning** - I now verify decommissioning with evidence (list every integration or webhook and confirm zero traffic) before calling anything "removed", and I correct the record openly as soon as I find an error.

:::say
Pick a real but recoverable mistake, own it plainly, show how you fixed it and corrected the record, and end with a concrete process change. Avoid fake mistakes like "I work too hard".
:::

## What is the hardest technical issue you have faced, and how did you solve it?

<!-- source: 09 Q12 -->

:::note In simple words
They want to see your problem-solving method: how you narrow down an unclear problem step by step until you prove the cause.
:::

Sample answer - adapt to your own words (STAR):
- **Situation** - In one of our staging environments we had deployed Grafana Beyla (eBPF auto-instrumentation) for distributed tracing, but the tracing backend was receiving no spans. Nothing crashed, it just silently produced no data.
- **Task** - Find why tracing was not working so we could use it as a model for production.
- **Action** - I checked each hop in order: were the Beyla pods running, were they discovering services, could they reach the collector endpoint. The logs pointed to the exporter endpoint. The cluster is IPv6, and the collector address was not written in the bracketed IPv6 format that URLs require, so the export silently failed. I fixed the endpoint format and redeployed.
- **Result** - Spans started flowing, and I confirmed thousands of spans (about 8,000) arriving in the backend.
- **Learning** - For silent failures, walk the data path hop by hop and check each boundary; and IPv6 clusters have their own gotchas, like brackets in URLs.

:::say
Choose a problem where the cause was not obvious, then show the hop-by-hop method you used to isolate it and the proof that your fix worked. The method matters more than the tool.
:::

## Tell me about a time you had to deliver something quickly without all the time or resources you needed.

<!-- source: 09 Q13 -->

*Also asked as:* How do you handle tight deadlines?

:::note In simple words
They want to see prioritization: you found the smallest solution that solved the real risk, delivered it, and did not cut corners on safety.
:::

Sample answer - adapt to your own words (STAR):
- **Situation** - Our planned migration to a new on-call service was delayed, which meant our phone/paging path was not dependable. We still needed production alerts reaching the team immediately.
- **Task** - Keep critical alerts flowing without new paid tools or waiting for the migration.
- **Action** - I first checked what we already had, and found we could send alerts straight to Microsoft Teams. I built small Lambda relay functions for CloudWatch alarms and pointed Alertmanager's Teams configuration directly at the channels. I kept the Lambdas on minimal permissions, took a backup of the old routes so we could restore later, and tested every path.
- **Result** - Built and tested quickly, at no extra cost, with no dependency on the delayed tool.
- **Learning** - Under time pressure, reuse what already exists, deliver the simplest thing that covers the risk, and keep a rollback path.

:::say
Show that you prioritized the real risk, reused existing tools, delivered a simple tested solution with a rollback plan, and communicated trade-offs. Speed without testing is not the story they want.
:::

## What would you do if you had to work on a tool or technology you have never used? Share a time you picked up a new tool quickly.

<!-- source: 09 Q14 -->

*Also asked as:* How do you learn a new tool quickly?

:::note In simple words
Technology changes every year. They want to see a learning method: official docs, a small lab, then a real but low-risk task, and asking for help early.
:::

My approach:
1. Understand the problem the tool solves and the basic concepts (official docs, quickstart).
2. Build a tiny working lab in a non-production place.
3. Apply it to a real small task, and compare my work with best practices.
4. Ask experienced teammates early; document what I learned for the team.

Sample answer - adapt to your own words (STAR):
- **Situation** - We needed monthly SLA dashboards in Grafana with data from the Zabbix SLA API, which our Grafana did not show natively.
- **Task** - Learn a way to pull that API data into Grafana.
- **Action** - I learned the Grafana Infinity data source (querying JSON APIs), tested queries on one small panel, understood its parser options and field mapping gotchas, then built the dashboards through the Grafana API and saved the build scripts so they can be regenerated.
- **Result** - Live SLA dashboards for the environments, repeatable instead of hand-made.

:::say
Describe your learning loop - concepts, small lab, real low-risk task, ask and document - and back it with one real example where you became productive quickly. That shows you can handle any tool they use.
:::

## How would you convince your team or manager to adopt a new tool or process?

<!-- source: 09 Q15 -->

*Also asked as:* How do you convince stakeholders?

:::note In simple words
People adopt change when they see their own problem solved with low risk. Bring data, a small proof, and a way back if it fails.
:::

Steps:
1. **Start with the problem, not the tool** - with numbers: time wasted, incidents missed, money spent.
2. **Show options** - including "do nothing", with cost and effort for each.
3. **Small proof of concept** - on one environment or one team, with success criteria agreed in advance.
4. **Address risks** - cost, learning curve, lock-in, rollback plan.
5. **Share results and roll out gradually**, with documentation.

Sample answer - adapt to your own words (STAR):
- **Situation** - Alert delivery depended on a paid external on-call tool that had become unreliable for us.
- **Action** - I compared options and proposed a Teams-direct design at no extra cost using Lambda relays and Alertmanager's native Teams integration, built it, and showed test alerts arriving in the real channels, with a backup of the old configuration for rollback.
- **Result** - The team accepted it because it solved the immediate problem, cost nothing and was reversible. Similarly, my observability audit presented monthly cost waste with exact items, which made the cleanup decision easy for the owners.

:::say
I lead with the problem and data, offer options with costs, prove the idea on a small scale with agreed success criteria, and include a rollback plan. People say yes to low-risk, proven improvements.
:::

## How do you handle conflict or disagreement within your team?

<!-- source: 09 Q16 -->

*Also asked as:* Googliness / culture fit questions.

:::note In simple words
They want to know you disagree respectfully, focus on facts and the shared goal, and can commit to a decision even if it was not your idea.
:::

Approach:
- Talk directly and privately first, and listen to understand their reasons.
- Move from opinions to evidence: logs, metrics, a quick test.
- Focus on the shared goal (production stability, the customer, the deadline).
- If still stuck, agree on criteria and escalate together to the lead, not around each other.
- Once decided, "disagree and commit" and support the decision fully.

About "Googliness" and culture-fit rounds: they test humility (admitting mistakes, giving credit), collaboration (helping others succeed), doing the right thing when nobody is watching (for example refusing to use pasted credentials or skip a check), and comfort with ambiguity (making progress when requirements are unclear). Answer with real examples, not adjectives.

**Example:** Sample answer - adapt to your own words:
```
When several SLA breaches happened on the same day, the first explanation given was
a single common cause for all of them. I felt some did not fit, so instead of
arguing, I checked each breach against the activity logs and timelines. It turned
out most matched the common cause, but one was a separate new issue. Presenting
evidence per breach made it a fact discussion rather than a disagreement, and the
report ended up more accurate.
```

:::say
I keep disagreements private, respectful and evidence-based, anchored on the shared goal, and escalate together only if needed. Once a decision is made I commit to it fully.
:::

## How do you work across teams (developers, QA, platform, business)?

<!-- source: 09 Q17 -->

:::note In simple words
DevOps is a bridge. They want to hear that you communicate clearly, speak each team's language, and make shared information easy to find.
:::

- **Shared visibility** - dashboards and reports that every team can read (for example SLA dashboards per project).
- **Clear tickets** - Jira stories with context, evidence and expected outcome, assigned to the right owner.
- **Speak their language** - developers want logs, traces and exact errors; managers want impact, downtime minutes and risk; clients want availability and root causes.
- **Proactive communication** - during incidents, regular short updates; after, a shared RCA.
- **Make it easy** - small improvements for other teams, such as adding a pod filter dropdown to the shared Loki logs dashboard so developers can find their pod's logs quickly.

:::say
I make information shared and self-service through dashboards and clear tickets, tailor the message to each audience, and communicate early during incidents. Small improvements that save other teams time build trust quickly.
:::

## Give an example of taking ownership beyond your assigned task.

<!-- source: 09 Q18 -->

:::note In simple words
Ownership means you do not stop at "my part is done". If you see a risk, you raise it or fix it, and you follow through until it is closed.
:::

Sample answer - adapt to your own words (STAR):
- **Situation** - A ticket said a database health probe had been deployed to all four environments.
- **Task** - My task was only a related monitoring item, but I noticed alerts that should exist for two environments were never firing.
- **Action** - I checked the servers themselves and found the probe was deployed only on two environments; the other two had nothing, including the environment whose outage had created the ticket in the first place. I documented the evidence and raised it so the gap could be closed.
- **Result** - The team got an accurate picture of coverage instead of a false sense of safety.

Other small ownership habits: verifying that alerts really arrive, flagging cost waste found during audits, and correcting records when something turns out different than reported.

:::say
Share a time you went beyond the ticket to verify reality, found a real gap, and followed through until it was fixed or clearly handed over. Ownership is about outcomes, not task boundaries.
:::

## Can you design, secure, scale, troubleshoot and own production systems?

<!-- source: 09 Q19 -->

:::note In simple words
This is a confidence question. Answer with a short, structured "yes, here is how" across each word, backed by one real example each - and be honest about what you are still growing.
:::

Structure by the five words:
- **Design** - I think about failure first: redundancy, alert paths that do not depend on one tool, and simple, low-cost designs (for example a Teams-direct alerting architecture).
- **Secure** - least privilege IAM, roles instead of stored keys, not pasting credentials in chat or code, secrets in a manager, and flagging open security groups.
- **Scale** - automation over manual work (scheduled reports and checks across four environments), and understanding autoscaling with HPA/KEDA and Karpenter.
- **Troubleshoot** - hop-by-hop, evidence-based root cause (the empty alert template issue, the IPv6 tracing endpoint bug, a hung OS causing a 504).
- **Own** - on-call style ownership of monitoring for four production environments, SLA reports explaining every minute of downtime, and follow-up until issues are closed.

Be honest about the gap: "I am strongest in observability and incident response; I am actively building depth in Terraform and CI/CD with hands-on labs."

:::say
Yes - and I would answer each word with a real example: failure-first design, least-privilege security, automation for scale, evidence-based troubleshooting and end-to-end ownership of monitoring for four production environments. I would also say clearly which area I am still deepening, because that honesty builds trust.
:::
