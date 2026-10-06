---
track: aideep
title: Deep dive 14: design and defend your agent
short: Design and defend
sub: Companion to chapter 14. Turn everything into a design document: requirements, architecture decisions, evaluation plan, risks, cost and rollout, and defend it like a review board.
---

:::goals
- write a one-page requirements statement with measurable success criteria
- make and record architecture decisions with trade-offs
- produce an evaluation plan, risk register, cost estimate and staged rollout
- answer the questions a design review will ask
:::

## 1. Start with the problem, not the technology

Most failed agent projects fail at step zero: nobody wrote down **what success is**. Fill this in first, in plain words, before choosing a framework or a model.

| Question | Example answer (Enterprise Vault diagnostic assistant) |
|---|---|
| **Who is the user?** | first-line support engineers handling EV incidents |
| **What job do they hire it for?** | find the likely cause of an indexing or archiving problem faster |
| **What does the agent do today by hand?** | read logs, check SQL and DNS, search the runbook, write an incident note |
| **Success measure** | median time to a correct root-cause hypothesis falls from 25 to 10 minutes; at least 85% of hypotheses judged correct by a senior engineer |
| **What must never happen?** | change production, expose customer mail, or claim certainty without evidence |
| **Constraints** | data stays in our tenant; response under 20 seconds; cost under $0.30 per incident |

Notice that "never happen" items become **hard requirements enforced in code** (read-only tools, no external egress), and the success measure becomes your **evaluation target**.

## 2. Choose the simplest architecture that could work

Walk the ladder from the earlier lessons and stop at the first rung that meets the requirements:

1. **Prompt + RAG** over the runbooks and past incidents?
2. **Workflow** (route to log analysis, DNS check or SQL check, then summarise)?
3. **Agent loop** with read-only tools and budgets?
4. **Multiple agents**?

For the example, a **router + tool-using agent with read-only tools and RAG over runbooks** is the likely answer: the path varies per incident (so a fixed workflow is too rigid), but the actions are all reads (so risk is low). Writing the reasoning down is the point.

## 3. Record decisions (a lightweight ADR)

An **architecture decision record** captures *what you chose, why, and what you gave up*. Short records beat long documents because people write them.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > adr.py <<'EOF'
decisions = [
  {"id": "ADR-1", "decision": "Read-only tools only in v1 (logs, config, SQL health, DNS, runbook search)",
   "why": "removes the largest risk class; most value is in diagnosis, not remediation",
   "alternatives": "tools that restart services (rejected: needs approvals, audit, and a trust track record first)",
   "consequence": "engineers still perform fixes; revisit after 3 months of metrics"},
  {"id": "ADR-2", "decision": "Hybrid retrieval (BM25 + embeddings) over runbooks and closed incidents",
   "why": "error codes need exact match; descriptions need semantic match",
   "alternatives": "embeddings only (misses exact codes); fine-tuning (stale quickly, hard to cite)",
   "consequence": "two indexes to maintain; nightly re-index job"},
  {"id": "ADR-3", "decision": "Agent loop with budgets: 8 steps, 25k tokens, 60 s",
   "why": "bounds cost and latency; stops loops",
   "alternatives": "unbounded loop (rejected: cost and risk)",
   "consequence": "rare complex cases will stop early and hand over a partial analysis"},
  {"id": "ADR-4", "decision": "All model output validated by schema; low temperature",
   "why": "downstream UI and evaluation need structured fields",
   "alternatives": "free text (rejected: cannot be measured)",
   "consequence": "retry logic and a fallback message are required"},
]
for d in decisions:
    print(f"{d['id']}: {d['decision']}")
    print(f"   why         : {d['why']}")
    print(f"   alternatives: {d['alternatives']}")
    print(f"   consequence : {d['consequence']}")
EOF
python3 adr.py
```

Every decision lists a rejected alternative and a **consequence**: if you cannot name the downside, you have not understood the trade-off.

## 4. The evaluation plan

Decide **before building** how you will know it works:

| Layer | Method | Pass criteria |
|---|---|---|
| **Retrieval** | 60 real questions with known source chunks; recall@5, MRR | recall@5 at least 0.9 |
| **Tool use** | scripted scenarios with expected tool sequences and forbidden tools | zero forbidden calls in 200 runs |
| **End-to-end quality** | 100 historical incidents replayed; senior engineers (or a calibrated judge) score root-cause correctness | at least 85% correct, pass^3 at least 70% |
| **Safety** | adversarial set: injected logs and tickets, secret-extraction attempts | zero successful exfiltration |
| **Cost and latency** | measured per incident | median under $0.20 and 15 s; 95th percentile under $0.30 and 20 s |
| **Human outcome** | a pilot comparing time-to-hypothesis with and without the assistant | median reduces from 25 to 10 minutes |

```run
cd ~/lab/ai
cat > plan_check.py <<'EOF'
# Turn the evaluation plan into an automatic release gate (the numbers come from your harness; these are example results)
criteria = {
    "retrieval recall@5":       (0.93, ">=", 0.90),
    "end-to-end correct":       (0.88, ">=", 0.85),
    "pass^3":                   (0.74, ">=", 0.70),
    "forbidden tool calls":     (0,    "==", 0),
    "successful exfiltration":  (0,    "==", 0),
    "median cost ($)":          (0.17, "<=", 0.20),
    "p95 latency (s)":          (23.0, "<=", 20.0),
}
ops = {">=": lambda a, b: a >= b, "<=": lambda a, b: a <= b, "==": lambda a, b: a == b}
failed = []
for name, (value, op, target) in criteria.items():
    ok = ops[op](value, target)
    print(f"{'PASS' if ok else 'FAIL'}  {name:26} {value!s:>6} {op} {target}")
    if not ok: failed.append(name)
print()
print("RELEASE BLOCKED because of:" if failed else "all criteria met", ", ".join(failed))
EOF
python3 plan_check.py
```

A gate that fails on the latency target tells you exactly what to work on next (smaller context, caching, parallel tool calls, a faster model for easy steps).

## 5. The risk register

List the ways it can go wrong, how likely and how bad, and what you do about each. Review it monthly.

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Wrong root cause stated confidently | medium | medium | require evidence citations; show "confidence: low" when evidence is thin; senior review in pilot | product |
| Prompt injection via log or ticket text | medium | high | read-only tools, no egress, untrusted-text delimiters, adversarial tests in CI | security |
| Sensitive customer data in traces | medium | high | redaction before logging, access control, retention limit | privacy |
| Model or provider change alters behaviour | high | medium | pin versions, run the suite on every change, keep a fallback model | engineering |
| Cost creep | medium | medium | per-run budgets, dashboards, alerts | engineering |
| Engineers over-trust the output | high | medium | training, visible evidence links, tracking of corrected answers | support lead |

## 6. Cost estimate

```run
cd ~/lab/ai
cat > cost.py <<'EOF'
incidents_per_day = 120
steps = 6
base_context = 2500           # system + tool definitions + retrieved runbook chunks
added_per_step = 600
out_per_step = 150
price_in, price_out = 3.0, 15.0   # illustrative dollars per million tokens

tin = sum(base_context + added_per_step * s for s in range(steps))
tout = out_per_step * steps
per_incident = (tin * price_in + tout * price_out) / 1e6
print(f"tokens per incident: {tin:,} in, {tout:,} out  ->  ${per_incident:.3f} per incident")
print(f"per month at {incidents_per_day}/day: ${per_incident * incidents_per_day * 30:,.0f}")
cached = per_incident - (2500 * steps * price_in * 0.9) / 1e6          # assume cached prefix reads cost ~10%
print(f"if the stable 2,500-token prefix is cached: ${cached:.3f} per incident (saves {100*(per_incident-cached)/per_incident:.0f}%)")
engineer_cost_per_min = 1.2
saved_minutes = 15
print(f"value check: 15 minutes saved at ${engineer_cost_per_min}/min = ${saved_minutes*engineer_cost_per_min:.2f} per incident versus ${per_incident:.2f} of model cost")
EOF
python3 cost.py
```

A cost model also shows where to optimise (here, the repeated prefix) and whether the project is worth doing at all.

## 7. Staged rollout

1. **Offline**: evaluation suite passes; internal demo.
2. **Shadow mode**: runs on real incidents but its output is **not shown**; compare with what engineers concluded.
3. **Pilot**: a few engineers see the output, clearly labelled as AI-generated with evidence links; collect corrections.
4. **Gradual expansion** behind a feature flag with monitoring and a **kill switch**.
5. **Review** after a fixed period against the success measures; decide whether to add capabilities (for example, approved remediation) using the same process.

## 8. Defend it: the questions a review board asks

Prepare short, evidence-backed answers.

| Question | A strong answer includes |
|---|---|
| Why an agent and not a workflow? | the variability of incidents, plus the measured comparison |
| What can it do wrong, at worst? | read-only tools, no egress, tested injection cases |
| How do you know it is good? | the evaluation numbers, pass^k, safety results, pilot outcome |
| What happens when it is wrong? | evidence shown, easy correction, feedback into the test set |
| What does it cost and who pays? | the cost model and the value comparison |
| How will you keep it good? | monitoring, regression suite, prompt registry, owners, review cadence |
| How can we stop it? | feature flag and kill switch, rollback of prompt and model versions |

## 9. Your capstone deliverables

Using the [Enterprise Vault agent from chapter 14](#ch14) as your base, produce:

1. a one-page **requirements** statement (section 1),
2. an **architecture diagram** and 4 to 6 **ADRs** (sections 2 and 3),
3. a **tool list** marked read/write and risk level, with schemas,
4. a **test set** of at least 30 realistic cases, and your **evaluation plan** with numeric gates,
5. a **risk register** and a **security checklist** (lesson 12),
6. a **cost model** and a **rollout plan**,
7. a **working prototype** of the loop with a fake model and unit tests (lesson 11), and a reflection: what would you change after reading the failures?

If you can produce and defend these, you are working at the level of a practising agent engineer, not only a user of agent products.

:::recap
- Write the problem, success measure and "must never happen" list before choosing technology.
- Choose the simplest architecture; record decisions with alternatives and consequences.
- Plan evaluation first and make it an automatic release gate; keep a risk register; model cost against value.
- Roll out in stages (offline, shadow, pilot, gradual) with a kill switch, and be ready to defend every choice with evidence.
:::

:::quiz
? Why record rejected alternatives in a decision record?
+ It shows the trade-off was understood and helps future readers revisit it
- To make documents longer
- To satisfy the model
- Alternatives are never useful
! Every decision has a downside.
? What is shadow mode?
+ The system runs on real inputs but its output is not shown to users, so you can compare safely
- Running at night
- Hiding the logs
- A cheaper model
! A safe way to test on real data.
? Which result should block a release no matter what else passes?
+ A successful exfiltration or a forbidden tool call in the safety suite
- A slightly higher token count
- A new prompt version
- A faster response
! Safety criteria have zero tolerance.
? What is the first step of designing an agent project?
+ Define the user, the job and measurable success and failure conditions
- Pick a framework
- Choose a model
- Write the prompt
! Technology follows the requirement.
:::
