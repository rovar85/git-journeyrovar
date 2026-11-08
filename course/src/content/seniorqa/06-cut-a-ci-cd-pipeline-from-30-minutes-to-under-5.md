---
track: seniorqa
title: "Q6: Cut a CI/CD pipeline from 30 minutes to under 5"
short: Q6 Faster pipeline
sub: Measure first, find the critical path, then cache, shard, parallelise, skip unchanged work and move slow checks off the pull-request path, with a critical-path model.
---

:::goals
- explain why you measure and find the critical path before changing anything
- list the levers in order of payoff: cache, parallelise, shard, skip, move off the fast path
- calculate the effect of each change with a critical-path model
- keep quality while getting faster: what you may move, and what you may not
:::

:::note How this connects
Pipeline basics are in [Jenkins](#jenkins-1) and [CI/CD in the question bank](#qbank-23). Docker images and layers are in [Docker 2](#docker-2) and Dockerfiles in [Docker 4](#docker-4).
:::

## Cut a CI/CD pipeline from 30 minutes to under 5

**What the interviewer tests:** do you optimise with data (not guesses), and do you understand that **parallel stages only help if they are on the critical path** and that speed must not cost safety?

### Clarifying questions

- What does 30 minutes consist of? Is it the pull-request pipeline or the full release? (Different goals.)
- Where does the time go: queueing for runners, dependency install, build, tests, scans, deploy?
- What is the repository like: monorepo or service repo, language, test count?
- What must be true before merge (non-negotiable checks) versus before release?

### Step 1: measure

Export stage timings from the CI tool for a week, not one run. Split **queue time** (waiting for a runner) from **run time**. Compute the **median and p90**. The goal could be "p90 of the pull-request pipeline under 5 minutes". Flaky tests also cost time: count retries.

### Step 2: find the critical path

Stages that depend on one another form a graph. The wall-clock time is the **longest path**, not the sum. Speeding up a stage that is not on the path changes nothing. The model uses a typical graph and shows how the critical path moves after each change.

```run
mkdir -p ~/lab/seniorqa/q6 && cd ~/lab/seniorqa/q6
cat > pipeline.py <<'EOF'
# Critical-path analysis of a CI/CD pipeline: where do the 30 minutes go, and what is the fastest it could be?
stages = {                       # name: (minutes, depends on)
 "checkout+deps":   (4, []),
 "lint":            (2, ["checkout+deps"]),
 "unit tests":      (9, ["checkout+deps"]),
 "build image":     (7, ["checkout+deps"]),
 "integration":     (6, ["build image"]),
 "security scan":   (3, ["build image"]),
 "deploy staging":  (2, ["integration", "security scan", "unit tests", "lint"]),
 "e2e smoke":       (4, ["deploy staging"]),
}
def schedule(stages):
    finish = {}
    def f(n):
        if n not in finish:
            d, deps = stages[n]; finish[n] = max([f(x) for x in deps], default=0) + d
        return finish[n]
    for n in stages: f(n)
    return finish
def path(stages, finish):
    n = max(finish, key=finish.get); p = [n]
    while stages[n][1]: n = max(stages[n][1], key=lambda x: finish[x]); p.append(n)
    return list(reversed(p))
seq = sum(d for d, _ in stages.values())
print(f"run one after another: {seq} min")
fin = schedule(stages)
print(f"as the stages are wired now (parallel where allowed): {max(fin.values())} min, critical path: {' -> '.join(path(stages, fin))}\n")
def variant(name, change):
    s = {k: (v[0], list(v[1])) for k, v in stages.items()}; change(s); fin = schedule(s)
    print(f"{name:62} {max(fin.values()):3d} min   path: {' -> '.join(path(s, fin))}")
variant("baseline", lambda s: None)
variant("1. dependency cache (checkout+deps 4 -> 1)", lambda s: s.update({"checkout+deps": (1, [])}))
def b2(s): s["checkout+deps"] = (1, []); s["unit tests"] = (9 // 3 + 1, ["checkout+deps"])
variant("2. + shard unit tests over 3 runners (9 -> 4)", b2)
def b3(s): b2(s); s["build image"] = (2, ["checkout+deps"])
variant("3. + layer cache / remote build cache (build 7 -> 2)", b3)
def b4(s): b3(s); s["integration"] = (3, ["build image"]); s["security scan"] = (1, ["build image"])
variant("4. + faster integration, scan only changed layers (6->3, 3->1)", b4)
def b5(s): b4(s); s["e2e smoke"] = (1, ["deploy staging"]); s["deploy staging"] = (1, ["integration", "security scan", "unit tests", "lint"])
variant("5. + smoke only on critical paths, deploy by GitOps pull (2->1, 4->1)", b5)
print("\nOther levers: skip work for unchanged code (path filters, monorepo affected-only builds), faster runners, run lint and tests while the image builds,")
print("move slow checks (full e2e, load, deep scans) off the pull-request path to a nightly or post-merge pipeline, and fail fast (cheap checks first).")
EOF
python3 pipeline.py
```

What the output shows:

- Run one after another the stages add up to **37 minutes**; as wired now (parallel where allowed) the pipeline is already **23 minutes**, and the critical path is checkout and dependencies, build image, integration tests, deploy to staging, e2e smoke tests.
- A dependency cache takes it to 20 minutes. Layer caching for the image build (7 to 2 minutes) saves 5 more. Faster integration tests and scanning only changed layers brings it to 12; smoke tests on critical paths only and a pull-based deploy bring it to **8 minutes**.
- Notice that sharding the unit tests (9 to 4 minutes) changed nothing on its own: unit tests were **not** on the critical path. Measure the path before spending effort.

The model stops at 8 minutes. Reaching **under 5** needs the last lever, which changes *what runs on the pull request*:

### Step 3: change what is on the fast path

Split the pipeline into two:

- **Pull-request pipeline (target under 5 minutes):** lint, unit tests (sharded), build the image with cache, a fast contract or smoke test. Run only what is **affected** by the change.
- **Post-merge pipeline (can take longer, runs in parallel with other merges):** full integration, e2e, deep security scans, load tests, deploy to staging and production by GitOps. A failure here blocks the *release*, not every developer's feedback.

This is not cheating if the post-merge checks still gate production, and if you can quickly tell who broke main.

### The levers, in order of payoff

1. **Remove queue time.** Autoscaled, warm runners; enough capacity in peak hours.
2. **Cache dependencies** (keyed by the lock file) and **the build** (Docker layer cache, BuildKit remote cache, Gradle/Bazel remote cache).
3. **Do less:** path filters and affected-only builds (monorepo tools such as Nx, Bazel, Turborepo), skip docs-only changes, run tests selected by changed files.
4. **Parallelise and shard:** split the test suite across runners by historical duration; run lint, tests and image build at the same time.
5. **Make tests fast:** replace sleeps with polling, use in-memory fakes or containers started once, and fix or quarantine flaky tests (quarantine with an owner and a deadline, not permanently).
6. **Smaller images and faster pulls:** multi-stage builds, slim base images, pre-pulled base images on runners.
7. **Faster runners:** more CPU is often cheaper than developer time.
8. **Fail fast:** order stages so cheap checks run first; cancel a superseded pipeline when a new commit arrives.
9. **Pull-based deploy:** CI commits the new tag; the cluster controller does the rollout, so CI does not wait for it.
10. **Keep a budget:** an alert when the p90 pipeline time drifts up.

### What you must not trade away

- Do not drop security scanning, only move the expensive parts to post-merge and keep a fast check (for example, scan new dependencies) on the pull request.
- Do not skip tests by default; skip them by *evidence* (the change cannot affect them).
- Keep the same artifact from build to production.

:::say
I would measure first: a week of stage timings, split into queue time and run time, and then find the critical path, because only stages on the longest path change the total. In a typical 30-minute pipeline, I get the biggest wins from warm autoscaled runners, caching dependencies and image layers, and running only the affected work. Then I shard the tests and run lint, tests and image build in parallel. In my model that took 23 minutes to 8. To get under five, I split the pipeline: the pull request runs lint, sharded unit tests and a cached build in under five minutes, and the slower integration, end-to-end and deep scans run after merge and still gate the release. I would keep a pipeline-time budget with an alert so it does not creep back.
:::

## Follow-up questions

:::answer How do you handle flaky tests?
Measure them (failure then pass on retry), quarantine with an owner and a deadline, fix the cause (time, ordering, shared state, network), and never rely on blind retries, which hide real failures and add minutes.
:::

:::answer How do you speed up Docker builds specifically?
Order the Dockerfile so rarely changing layers come first (dependencies before source), use multi-stage builds, enable BuildKit with a remote cache, use a slim base image, and `.dockerignore` large folders.
:::

:::answer A monorepo pipeline builds everything on every commit. What do you do?
Compute the affected targets from the changed files and the dependency graph (Bazel, Nx, Turborepo or a custom script), build and test only those, and cache everything else remotely.
:::

:::answer How do you prove you did not make things worse?
Compare escaped-defect rate and rollback rate before and after, keep the full suite running post-merge, and track main-branch breakage. Speed that raises incidents is a failure.
:::

## Practice (answers below)

1. A pipeline has stages A (5 min), B (8 min), C (3 min); B and C run in parallel after A. What is the total time?
2. Sharding B over 4 runners makes it 2 minutes. What is the new total?
3. Why is the sum of stage times the wrong number to optimise?

:::note Answers
1. A then the longer of B and C: 5 + 8 = 13 minutes. 2. 5 + max(2, 3) = 8 minutes; C is now on the critical path. 3. Parallel stages overlap; only the longest dependency chain determines the elapsed time.
:::

:::recap
- **Measure** (queue and run time, p90), then find the **critical path**.
- Biggest levers: **runners, caches, do less, shard, parallelise**.
- Move slow checks to **post-merge** but keep them as release gates.
- Do not trade away safety: skip by evidence, not by default.
- Keep a **budget and alert** so the pipeline does not slow again.
:::

```quiz
? Why can sharding unit tests change nothing about the total time?
+ If unit tests are not on the critical path, the longest chain is unchanged
- Sharding is not allowed
- Tests always run last
- Runners cannot be added
! Only stages on the longest path matter; measure the path first.

? What is the safest way to get a pull-request pipeline under five minutes?
+ Keep fast checks on the pull request and move slow ones to post-merge, still gating the release
- Delete the slow tests
- Skip security scanning forever
- Ignore failing tests
! Faster feedback without removing the release gates.

? Which comes first when optimising a slow pipeline?
+ Measure stage and queue times
- Buy bigger runners
- Rewrite the tests
- Switch CI tools
! Data decides where the time goes.
```
