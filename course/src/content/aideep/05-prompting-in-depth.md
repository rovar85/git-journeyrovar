---
track: aideep
title: Deep dive 5: prompting and structured output
short: Prompting
sub: Companion to chapter 5. The anatomy of a prompt, techniques with when to use each, validating model output, and testing prompts like code.
---

:::goals
- build prompts from parts (role, task, context, format, examples) with a reusable template
- choose between zero-shot, few-shot, chain-of-thought and structured output
- validate and repair model output with code (schemas, retries)
- test prompt changes with a regression set instead of by feel
:::

:::note About the model in these examples
The lab has no model API and no API key, and keys must never be put in code. So the programs below use a small **stand-in function** where the model call would be. It lets us run and test everything around the model for real (templates, parsing, validation, retries, test harness), which is where most prompt engineering bugs live. The shape of a real API call is shown as **Example (not run here)**.
:::

## 1. A prompt has parts

A reliable prompt is assembled from named parts, each with a job:

| Part | Purpose | Example |
|---|---|---|
| **Role / system instruction** | stable behaviour and rules | "You are a support assistant for Enterprise Vault. If unsure, say so." |
| **Task** | exactly what to do now | "Classify the severity of this incident." |
| **Context / data** | the facts to use (retrieved text, the log) | the last 20 log lines |
| **Constraints** | what not to do, limits | "Use only the log. Do not guess causes." |
| **Output format** | the shape you can parse | "Reply as JSON with keys severity and reason." |
| **Examples** | show the pattern (few-shot) | two sample inputs with ideal outputs |

Put **data inside clear delimiters** (for example `<log> ... </log>`), because then the model, and your later security rules, can tell **instructions** from **data** (chapter 12 depends on this).

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > template.py <<'EOF'
SYSTEM = "You are a careful Enterprise Vault support assistant. Use only the information provided. If it is not enough, say so."

EXAMPLES = [
    ("SQL connection timeout (SQL01) repeated 5 times", {"severity": "high", "reason": "database unreachable"}),
    ("Indexing service started", {"severity": "info", "reason": "normal start"}),
]

def build_prompt(log_text, with_examples=True):
    parts = [f"<instructions>\nClassify the incident below. Reply with JSON only, keys: severity (info|low|high), reason (max 8 words).\n</instructions>"]
    if with_examples:
        for inp, out in EXAMPLES:
            parts.append(f"<example>\n<input>{inp}</input>\n<output>{out}</output>\n</example>".replace("'", '"'))
    parts.append(f"<log>\n{log_text}\n</log>")
    return SYSTEM, "\n\n".join(parts)

system, user = build_prompt("Name resolution failed for SQL01 (12 times in 5 minutes)")
print("SYSTEM:", system)
print()
print(user)
print()
print("approximate size:", len(system.split()) + len(user.split()), "words")
EOF
python3 template.py
```

## 2. Techniques, and when each helps

| Technique | What you do | Use when | Watch out |
|---|---|---|---|
| **Clear instruction** | state task, audience, length, format | always; the cheapest improvement | vague asks get vague answers |
| **Few-shot examples** | include 2 to 5 input/output pairs | format or judgement is hard to describe | examples must cover the cases; the model copies their style, even mistakes |
| **Chain of thought** | ask it to reason step by step, or use a reasoning model | multi-step logic, maths, planning | slower and costlier; the explanation is not proof of the real process |
| **Decomposition** | split a big task into steps (chain of prompts) | long or fragile tasks | more calls; pass data between steps explicitly |
| **Role / persona** | "You are an experienced DBA" | tone and focus | does not add knowledge the model lacks |
| **Grounding** | supply source text and say "use only this" | factual answers | still verify; the model may add outside facts |
| **Structured output** | request JSON matching a schema, or use the API's JSON/schema mode | anything a program consumes | always validate: even strict modes can fail |
| **Self-check / critique** | a second pass checks the first | catching obvious errors | the same blind spots may remain |
| **Say "I don't know" is OK** | explicitly allow refusal when unsure | reduces fabricated answers | test that it does not now refuse everything |

The real API call (a **messages** API) looks like this. **Example (not run here)**; the key comes from an environment variable or secret store, never from your code:

```python:call.py (Example, not run here)
import os, anthropic
client = anthropic.Anthropic()                 # reads ANTHROPIC_API_KEY from the environment
reply = client.messages.create(
    model="<model id from your provider's list>",
    max_tokens=300,
    temperature=0,
    system=system,
    messages=[{"role": "user", "content": user}],
)
text = reply.content[0].text
```

## 3. Never trust the output: validate it

Model output is **text**, even when you ask for JSON. It may have extra words, a missing key, a wrong type, or a value outside the allowed set. Code that consumes it must **validate** and **retry or fall back**.

```run
cd ~/lab/ai
cat > validate.py <<'EOF'
import json, re

ALLOWED = {"info", "low", "high"}

def parse_and_validate(text):
    """Return (data, error). Accepts JSON possibly wrapped in prose or a code fence."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None, "no JSON object found"
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        return None, f"invalid JSON: {e.msg}"
    if set(data) != {"severity", "reason"}:
        return None, f"wrong keys: {sorted(data)}"
    if data["severity"] not in ALLOWED:
        return None, f"severity {data['severity']!r} not in {sorted(ALLOWED)}"
    if not isinstance(data["reason"], str) or len(data["reason"].split()) > 8:
        return None, "reason must be a string of at most 8 words"
    return data, None

# Stand-in for the model call: returns different (realistic) kinds of imperfect answers on successive attempts.
responses = iter([
    "Sure! Here is the classification: {\"severity\": \"critical\", \"reason\": \"DNS broken\"}",   # value not allowed
    "{\"severity\": \"high\" \"reason\": \"DNS broken\"}",                                            # invalid JSON
    "```json\n{\"severity\": \"high\", \"reason\": \"name resolution failing for SQL01\"}\n```",      # fine (in a code fence)
])
def fake_model(prompt):
    return next(responses)

def classify(prompt, max_attempts=3):
    feedback = ""
    for attempt in range(1, max_attempts + 1):
        text = fake_model(prompt + feedback)
        data, err = parse_and_validate(text)
        print(f"attempt {attempt}: {'OK' if data else 'REJECTED: ' + err}")
        if data:
            return data
        feedback = f"\n\nYour previous answer was rejected: {err}. Reply again with valid JSON only."
    return {"severity": "high", "reason": "automatic fallback: needs human review"}      # safe default

print("result:", classify("...prompt..."))
EOF
python3 validate.py
```

This is the **validate, feed the error back, retry, then fall back safely** pattern, and it is how production systems turn a probabilistic text generator into a dependable component. Choose a **safe default** (here "needs human review"), never silently accept bad data. Modern APIs also offer **structured outputs / JSON-schema modes** that constrain decoding to your schema, which sharply reduces invalid output but does not make the *content* correct; keep validating.

## 4. Test prompts like code

Changing one sentence in a prompt can fix one case and break five others. So keep a **regression set** of realistic inputs with expected results, run it after **every** prompt change, and track the pass rate. Here is the harness (the "model" is a stub, so the numbers only illustrate the mechanics):

```run
cd ~/lab/ai
cat > regress.py <<'EOF'
cases = [
    ("SQL connection timeout (SQL01) repeated 12 times",       "high"),
    ("Indexing service started",                               "info"),
    ("Name resolution failed for SQL01",                       "high"),
    ("Disk space on E: is at 82 percent",                      "low"),
    ("User logged in",                                         "info"),
    ("Storage service stopped unexpectedly",                   "high"),
]

# Two prompt versions, represented by stub models with different behaviour (stand-ins for real calls).
def model_v1(text):
    return "high" if "timeout" in text.lower() or "failed" in text.lower() else "info"
def model_v2(text):
    t = text.lower()
    if any(k in t for k in ("timeout", "failed", "stopped unexpectedly")): return "high"
    if "disk space" in t: return "low"
    return "info"

def run(name, model):
    passed = [(inp, exp, model(inp)) for inp, exp in cases]
    ok = sum(exp == got for _, exp, got in passed)
    print(f"{name}: {ok}/{len(cases)} passed")
    for inp, exp, got in passed:
        if exp != got:
            print(f"   FAIL  expected {exp!r:7} got {got!r:7} for: {inp}")
    return ok

a = run("prompt v1", model_v1)
b = run("prompt v2", model_v2)
print()
print("verdict:", "v2 is better on the regression set" if b > a else "no improvement")
EOF
python3 regress.py
```

Treat the regression set as your specification: add every production failure to it as soon as you see one. Run it in CI (the Jenkins track) so a prompt change cannot ship if it breaks previously fixed cases.

## 5. Common failure patterns and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Ignores part of the instruction | long, buried instructions; contradictions | shorten, put key rules first and last, remove conflicts |
| Output format drifts | format only described in prose | give an example, use schema mode, validate |
| Makes up details | no grounding, or pressure to answer | supply sources, allow "not enough information", require citations |
| Works in the demo, fails in production | demo inputs are cleaner | test on real, messy inputs |
| Different answers every run | high temperature | lower temperature, make the task more constrained |
| Obeys text inside the data | instructions and data mixed | delimit data, say it is untrusted, enforce limits in code (chapter 12) |
| Slow and expensive | giant prompts, long outputs | trim context, cap `max_tokens`, cache stable prefixes |

## Common misconceptions

- "A cleverly worded prompt is a security control." It is not: models can be talked out of any instruction. Enforce limits in code.
- "Politeness or capital letters make it obey." Clarity helps; shouting rarely does.
- "More examples are always better." Beyond a few well-chosen ones, they cost tokens and can bias the model.
- "Chain of thought shows how the model really thinks." It improves results on some tasks, but the text is generated like any other; do not treat it as a reliable audit trail.

## Practice (answers below)

1. Why wrap retrieved documents in tags like `<doc>`?
2. Give two reasons to validate JSON even when using a schema-constrained mode.
3. You change a prompt and the demo looks better. What is missing before you ship?
4. When would you choose few-shot over a longer description?

:::note Answers
1. It separates untrusted data from instructions (helps the model and your defences) and lets you cite which document was used.
2. Values can still be wrong or out of business rules; the schema guarantees shape, not truth; and APIs can fail or truncate output.
3. A regression run over a realistic test set showing no previously passing cases broke.
4. When the format or judgement is easier to show than to describe, such as a labelling convention.
:::

:::recap
- Build prompts from labelled parts; keep data in delimiters, instructions outside.
- Pick techniques deliberately: clear instruction first, few-shot for formats, decomposition for long tasks, grounding for facts.
- Treat output as untrusted text: parse, validate, feed errors back, retry, fall back safely.
- Keep a regression set and run it on every prompt change.
:::

:::quiz
? Why must a program validate model output?
+ It is generated text that may be malformed, off-schema or wrong
- Models always return perfect JSON
- Validation makes the model faster
- It is required by the tokenizer
! Validate, retry, and have a safe fallback.
? What is the main benefit of few-shot examples?
+ They show the exact format or judgement you want
- They give the model new knowledge
- They lower the cost
- They disable hallucination
! They steer style and structure.
? A new prompt looks better on three hand-picked inputs. What is the right next step?
+ Run the regression set and compare pass rates
- Deploy to everyone
- Raise the temperature
- Add more adjectives
! Spot checks are not evidence.
? Why put retrieved text inside delimiters?
+ So instructions and untrusted data stay distinguishable
- To reduce tokens
- To enable JSON mode
- To avoid retrieval
! This supports prompt-injection defences.
:::
