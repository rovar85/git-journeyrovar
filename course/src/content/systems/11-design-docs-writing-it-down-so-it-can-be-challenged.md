---
track: systems
title: "Systems 11: design docs, writing a design so it can be challenged"
short: Design docs
sub: What a design doc is for, the sections that matter, how to write the options and trade-offs honestly, and a tiny linter that checks the basics.
---


:::goals
- explain what a design doc is for, and when to write one
- write the sections: context, goals, non-goals, options, proposal, risks, rollout
- state trade-offs honestly and make goals testable
- review a design doc, and check one with a simple script
:::

:::note Companion to "Design Docs at Google"
[Design Docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/) by Malte Ubl describes the practice at a large company ([resource list](#systems-1)). I could not open it from here, so the structure below is the common one used across the industry, not a summary of that article; read it for the original reasoning.
:::

## 1. What a design doc is for

A design doc is **a short document written before you build**, so that other people can find the problems while they are cheap to fix. It is not a specification and not a promise. It serves four purposes:

1. **Think clearly:** writing exposes gaps that a diagram hides.
2. **Get early feedback** from people who know what you do not.
3. **Record decisions and the reasons**, so a new teammate in a year knows why ([the ADR habit in Deep dive 14](#aideep-14) is the same idea in a smaller form).
4. **Align** the team on scope and what is out of scope.

**Write one when** the change is hard to reverse, touches several teams, has real cost or risk, or you are unsure how to do it. **Skip it** for a small change you can undo in minutes: write a good pull request description instead.

## 2. The sections that matter

1. **Title, author, reviewers, status, date.**
2. **Context and scope:** what is the problem, for whom, with numbers. Include only what a reader needs.
3. **Goals:** what must be true when you are done. Make them **testable** ("no customer is charged twice for one order, even with 5 client retries", "adds under 5 ms at p99").
4. **Non-goals:** things that someone might expect but you are deliberately not doing. This section prevents scope creep and is the most skipped.
5. **Options considered:** at least two real alternatives (including "do nothing" or "use a managed service") with honest pros and cons. A doc with one option is a decision announcement, not a design.
6. **Proposed design:** the option you chose and how it works: data model, APIs, flows, failure handling. Use a diagram if it helps.
7. **Cross-cutting concerns:** security, privacy, cost, observability, operations, migration.
8. **Risks and open questions:** what could go wrong, what you do not know yet, who will decide.
9. **Rollout and rollback:** how you ship safely (flag, shadow mode, canary, percentage) and how you undo it.
10. **Appendix:** longer detail, benchmarks, links.

## 3. Writing it well

- **Lead with the decision you need** ("I propose idempotency keys in the payments database; please review the failure handling").
- **Quantify.** "Slow" means nothing; "p99 of 900 ms against a target of 300 ms" does.
- **Make trade-offs explicit:** every option costs something. Say what you give up.
- **Use the vocabulary of this track:** name the consistency model you need, what happens on a retry or a timeout, what the shard key is, which queries do not carry it, what the tail latency budget is.
- **Short beats long:** most good docs are 3 to 10 pages; a small change may need one page.
- **Plain language:** a reviewer from another team should follow it.

## 4. A small linter, and a worked example

The script below holds a short design doc (about making payments safe to retry, using [Lesson 7](#systems-7)) and checks the basics: required sections, at least two options, a number in the goals, a rollback plan, and no unresolved "TBD". Replace the document text with your own to practise.

```run
mkdir -p ~/lab/sys && cd ~/lab/sys
cat > doclint.py <<'EOF'
import re
DOC = """
# Design doc: make checkout payments safe to retry
## Context and scope
Checkout calls the payments service; on timeouts the mobile app retries and some customers are charged twice (14 cases last quarter).
## Goals
- No customer is charged twice for one order, even when the client retries up to 5 times.
- Added latency under 5 ms at p99.
## Non-goals
- Refunds and chargebacks. Changing the payment provider.
## Options considered
### Option A: dedupe in the mobile app
Cheap, but cannot cover web, partner or server-side retries.
### Option B: idempotency keys stored in the payments database
One transaction saves the charge and the key. Covers every client.
### Option C: exactly-once message queue
Needs a new platform and still needs a key for the provider call.
## Proposed design
Option B. Clients send an Idempotency-Key header; keys live for 24 hours.
## Risks and open questions
- Key table growth: TBD
## Rollout and rollback
Shadow mode for a week, then enforce for 5% of traffic, then all. Rollback is a feature flag.
"""
REQUIRED = ["Context", "Goals", "Non-goals", "Options considered", "Proposed design", "Risks", "Rollout"]
headings = re.findall(r"^#{2,3} (.*)$", DOC, re.M)
def has(name): return any(h.lower().startswith(name.lower()) for h in headings)
print("Sections")
for r in REQUIRED: print(f"  [{'x' if has(r) else ' '}] {r}")
options = [h for h in headings if h.lower().startswith("option ")]
goals = re.search(r"## Goals\n(.*?)\n## ", DOC, re.S).group(1)
measurable = [l for l in goals.splitlines() if re.search(r"\d", l)]
print("\nChecks")
print(f"  [{'x' if len(options) >= 2 else ' '}] at least two real options compared ({len(options)} found)")
print(f"  [{'x' if len(measurable) >= 1 else ' '}] at least one goal has a number you can test ({len(measurable)} of {len(goals.splitlines())})")
print(f"  [{'x' if 'rollback' in DOC.lower() else ' '}] says how to roll back")
tbd = len(re.findall(r"\bTBD\b", DOC))
print(f"  [{'x' if tbd == 0 else ' '}] no unresolved TBD ({tbd} left)")
print(f"\nlength: {len(DOC.split())} words (a good design doc is usually 3 to 10 pages; short is fine for a small change)")
EOF
python3 doclint.py
```


The unresolved `TBD` is the useful finding: it shows the author has not decided how fast the key table grows. A real review would also ask the questions in the next section.

:::warn A linter is not a reviewer
It checks the shape, not the thinking. A document can pass every check and still choose the wrong design.
:::

## 5. Reviewing a design doc

Ask in this order:

1. **Is the problem real and measured?** What is the evidence?
2. **Are the goals testable, and are the non-goals sensible?**
3. **Were real alternatives considered?** Why was each rejected?
4. **What happens when it fails?** Timeouts, retries, partial failure, overload ([Lesson 6](#systems-6)), data that arrives twice ([Lesson 7](#systems-7)).
5. **What are the consistency and ordering needs?** ([Lesson 10](#systems-10))
6. **How will it scale, and what is the first bottleneck?** ([Lesson 3](#systems-3), [Lesson 9](#systems-9))
7. **How do we know it works in production?** Metrics, alerts, SLOs ([Monitoring 4](#monitoring-4)).
8. **How do we roll out and roll back?**
9. **Who operates it, and what does it cost?** ([Senior cloud 5](#cloudsenior-5), [Senior cloud 15](#cloudsenior-15))

## 6. Your practice

Pick one topic from this track and write a one-page design doc for a small system, for example "a URL shortener", "a rate limiter" or "idempotent payment retries". Use the sections above. Then run the linter on it, and ask a friend to answer the review questions in section 5.

## Common misconceptions

- "A design doc must be long." Length is not quality.
- "It is written once and finished." It is a living record until the work ships, then a history.
- "Writing slows us down." It is cheaper to find a wrong design in a document than in production.

## Practice (answers below)

1. Rewrite "the system should be fast and reliable" as two testable goals.
2. Give three non-goals for a design doc about adding a cache to an API.
3. A doc has one option. What do you ask the author?

:::recap
- A design doc is a **short, early, reviewable** explanation of what you will build and why.
- Key sections: **context, testable goals, non-goals, real options with trade-offs, proposal, risks, rollout and rollback**.
- Quantify, name trade-offs, and use precise language about failure, consistency and scale.
- Review with questions about failure, consistency, scale, observability, rollout and cost.
:::

:::note Answers
1. "p99 latency under 200 ms at 500 requests per second" and "99.9% of requests succeed over a 30-day window". 2. Not caching authenticated user data; not changing the database schema; not building a cache for the admin endpoints (or: not solving cache invalidation across regions). 3. Ask what the alternatives were, including "do nothing", and why each was rejected; a single option usually means the decision was already made.
:::

```quiz
? Which section most often prevents arguments about scope later?
+ Non-goals
- The diagram
- The appendix
- The title
! Saying what you are deliberately not doing keeps reviewers from expecting it.

? Which is a testable goal?
+ p99 latency under 200 ms at 500 requests per second
- The system should be fast
- The system should scale well
- The system should be reliable
! A goal you can measure can be verified after launch.

? Why must a design doc compare at least two real options?
+ Without alternatives the doc announces a decision instead of testing it
- Because it must be long
- Because managers like tables
- To fill space
! Honest alternatives with trade-offs let reviewers challenge the choice.
```
