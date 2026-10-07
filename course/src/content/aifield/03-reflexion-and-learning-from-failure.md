---
track: aifield
title: Reflexion: learning from failure without retraining
short: Reflexion
sub: How an agent turns test failures into written lessons it reads on the next attempt, and how that relates to the evaluator-optimizer pattern.
---

:::goals
- explain the actor, evaluator and self-reflection roles in Reflexion
- run a real generate, test, reflect, retry loop with an executable check
- explain why memory of past failures improves later attempts and where it can mislead
- decide when a retry loop is worth its cost
:::

:::note Where this lesson comes from
arxiv.org is blocked in this lab, so this lesson **summarises [Reflexion](https://arxiv.org/abs/2303.11366) (Shinn et al., 2023) from my own knowledge**. The paper's exact numbers are not quoted here; check the original. The loop below is real and runs, with a scripted stand-in for the model that produces buggy then fixed code.
:::

## 1. The idea

Normally, to make a model better at a task you **train** it (change its weights). Reflexion improves behaviour **without changing weights**: the agent keeps a short **written memory of what went wrong** and reads it on the next try.

Three roles, as I remember the paper:

| Role | Job | In our demo |
|---|---|---|
| **Actor** | attempts the task (writes code, takes actions), conditioned on memory | the stand-in model writing a function |
| **Evaluator** | scores the attempt (tests pass? reward? a judge?) | **real unit tests** we run |
| **Self-reflection** | turns the failure signal into a short verbal lesson stored in memory | a stand-in that writes a sentence from the test failure |

The lesson text is stored in an **episodic memory** that is included in the next prompt. The paper reported gains on coding, question answering and decision-making tasks, strongest where the evaluator gives a **clear signal** (tests, a game reward). This is the same shape as Anthropic's **evaluator-optimizer** workflow: one call produces, another critiques, in a loop.

## 2. A real loop with a real evaluator

The task: write `is_leap(year)`. The stand-in actor first writes the common naive version. The evaluator **really executes** the tests. The reflection is built from the failing test. On the second attempt the actor reads the reflection and writes a correct version.

```run
mkdir -p ~/lab/aifield && cd ~/lab/aifield
cat > reflexion.py <<'EOF'
import traceback

TESTS = [(2024, True), (2023, False), (1900, False), (2000, True), (2100, False)]

def evaluator(source):
    """Run the candidate for real and return (passed, feedback)."""
    ns = {}
    try:
        exec(source, ns)
        for year, expected in TESTS:
            got = ns["is_leap"](year)
            if got != expected:
                return False, f"is_leap({year}) returned {got}, expected {expected}"
    except Exception:
        return False, "crashed: " + traceback.format_exc().splitlines()[-1]
    return True, "all tests passed"

def actor(task, memory):
    """Stand-in for the model. It improves only if the memory contains a relevant lesson."""
    if any("century" in m for m in memory):
        return "def is_leap(y):\n    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)\n"
    return "def is_leap(y):\n    return y % 4 == 0\n"

def reflect(feedback):
    """Stand-in for the self-reflection step: turn a failure into a short lesson."""
    return f"Last attempt failed ({feedback}). Years divisible by 100 are not leap years unless divisible by 400: handle the century rule."

memory = []
for trial in range(1, 4):
    code = actor("write is_leap(year)", memory)
    ok, feedback = evaluator(code)
    print(f"trial {trial}: {'PASS' if ok else 'FAIL'} - {feedback}")
    if ok:
        break
    lesson = reflect(feedback)
    memory.append(lesson)
    print(f"   reflection stored: {lesson}")
print("memory used on the last attempt:", len(memory), "lesson(s)")
EOF
python3 reflexion.py
```

Where each part earns its keep:

- The **evaluator is real code**. Because the failure is exact ("`is_leap(1900)` returned True, expected False"), the lesson is specific. A vague signal ("this seems wrong") produces vague lessons.
- The memory is **short and bounded**. The paper keeps only a few recent reflections; an ever-growing memory fills the context and distracts the model (the context-management problem from the agentic coding lesson).
- The loop has a **trial limit**. Without one, a task that cannot be solved burns money forever.

## 3. Where Reflexion helps and where it does not

| Situation | Verdict |
|---|---|
| Tests or a checker give a clear pass or fail | very good fit |
| Many similar tasks, so lessons transfer | good; consider storing lessons long term |
| The evaluator is another model judging its own work | useful but weaker; models tend to approve their own output |
| No reliable signal at all | the "reflections" are guesses and can **reinforce a wrong belief** |
| One-shot tasks that cannot be retried (sending an email) | not applicable; check **before** acting instead |

:::warn Common mistakes
- **Retrying with the same prompt.** Without new information (the failure, the lesson), a retry repeats the same mistake.
- **Letting the model grade itself on a task with an exact checker.** Use the checker.
- **Unbounded retries and unbounded memory.** Cap trials, keep a few reflections.
- **Storing wrong lessons.** A reflection built on a misread failure can make later attempts worse; log the lessons so you can audit them.
- **Retrying actions with side effects.** Reflexion suits **safe-to-repeat** work (code in a sandbox, queries), not payments or deletions.
:::

:::recap
- Reflexion improves an agent through **written lessons from failures**, without retraining.
- Roles: actor, evaluator, self-reflection, plus a small episodic memory.
- It works best with a **clear, executable evaluator**, a **trial cap** and **short memory**.
- It is the evaluator-optimizer pattern with memory across attempts.
:::

:::try Your turn
Add a second task to `reflexion.py`, a function `fizzbuzz_word(n)`, with its own tests and a stand-in actor whose first attempt forgets multiples of 15. Make the loop report how many trials each task needed, and stop after 3 trials with a clear failure message if a task is never solved.
:::

:::quiz
? What makes Reflexion different from simply retrying?
+ The retry includes a written lesson derived from the previous failure
- It uses a larger model
- It changes the model's weights
- It removes the evaluator
! The lesson is new information that can change the next attempt.
? What kind of evaluator suits Reflexion best?
+ One that gives a clear, executable pass or fail signal such as unit tests
- A vague "looks fine" judgement
- No evaluator at all
- A human reading every attempt
! Specific failures produce specific, useful lessons.
? Why cap the number of trials and the memory size?
+ To control cost and keep the context focused
- Because models forget instantly
- Because tests cannot be re-run
- To hide failures
! Unbounded loops and memories waste money and distract the model.
:::
