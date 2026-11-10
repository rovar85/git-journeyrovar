---
track: dataeng
title: "Orchestration: DAGs, schedules, retries and backfills"
short: Orchestration
sub: Why cron is not enough, how an orchestrator runs tasks in dependency order with retries, how to re-run only what failed, and how to backfill past days, with a tiny orchestrator you can run and an Airflow example.
---

:::goals
- explain what an orchestrator does that a cron job does not
- describe a DAG, task states, retries and upstream failure
- re-run a failed pipeline from the point of failure
- backfill past dates safely, and explain why tasks take the run date as a parameter
:::

:::note Before this lesson
Scheduling with cron is in [Linux 10](#linux-10); idempotent loads are in [lesson 8](#dataeng-8).
:::

## The idea

One script on a schedule (`cron`) works until you have ten scripts that depend on each other. Then you need answers to: in what order do they run? What if the first is late? What if step 4 of 7 fails at 3 a.m.; can I re-run from step 4? How do I load last month again after fixing a bug? Who is told?

An **orchestrator** answers these. You describe the work as a **DAG** (directed acyclic graph): **tasks** connected by **dependencies**, with no loops. The orchestrator then:

- runs tasks **in order**, and independent tasks in parallel
- **schedules** runs (every day at 02:00) and triggers on events
- **retries** failed tasks, with a delay
- marks downstream tasks **upstream_failed** instead of running them on bad input
- lets you **re-run** from the failed task, and **backfill** past dates
- shows **history, logs and durations**, and **alerts** on failure or lateness

## Run it

The script is an orchestrator in about 30 lines, running a six-task DAG. One task calls an API that times out twice; one has a bug.

```run
mkdir -p ~/lab/de/dag && cd ~/lab/de/dag
cat > dag.py <<'EOF'
# A tiny orchestrator: run tasks in dependency order, retry failures, skip what is downstream of a failure, and re-run only what is needed.
import time
calls = {"n": 0}
def extract_orders(day):  return f"orders for {day}"
def extract_customers(day): return f"customers for {day}"
def flaky_api(day):
    calls["n"] += 1
    if calls["n"] < 3: raise ConnectionError("API timeout")       # fails twice, then works
    return f"rates for {day}"
def clean(day): return "cleaned"
def bad_transform(day): raise ValueError("unexpected column 'amt'")
def publish(day): return "report published"
def run_dag(dag, day, done=None, max_retries=2, quiet=False):
    done = dict(done or {}); state = {}
    say = (lambda *a: None) if quiet else print
    order, seen = [], set()
    def visit(t):                                # topological order: a task runs after everything it depends on
        if t in seen: return
        seen.add(t)
        for d in dag[t][1]: visit(d)
        order.append(t)
    for t in dag: visit(t)
    for t in order:
        fn, deps = dag[t]
        if done.get(t) == "success": state[t] = "success"; say(f"   {t:18} already done for {day}: skipped"); continue
        if any(state[d] != "success" for d in deps): state[t] = "upstream_failed"; say(f"   {t:18} upstream_failed (not run)"); continue
        for attempt in range(1, max_retries + 2):
            try:
                fn(day); state[t] = "success"; say(f"   {t:18} success" + (f" on attempt {attempt}" if attempt > 1 else "")); break
            except Exception as e:
                say(f"   {t:18} attempt {attempt} failed: {e}"); state[t] = "failed"
    return state
dag = {"extract_orders": (extract_orders, []), "extract_customers": (extract_customers, []), "extract_rates": (flaky_api, []),
       "clean": (clean, ["extract_orders", "extract_customers"]), "transform": (bad_transform, ["clean", "extract_rates"]), "publish": (publish, ["transform"])}
print("run 1 for 2026-03-05:"); s1 = run_dag(dag, "2026-03-05")
print("\nfix the bug in transform, then re-run the same day: only failed and downstream tasks run")
dag["transform"] = (lambda day: "joined", ["clean", "extract_rates"])
s2 = run_dag(dag, "2026-03-05", done=s1)
print("\nbackfill: the same DAG for three past days (each run gets its date as a parameter, never 'today')")
for day in ["2026-03-02", "2026-03-03", "2026-03-04"]:
    st = run_dag(dag, day, quiet=True)
    print(f"   {day}: {sum(v == 'success' for v in st.values())}/{len(st)} tasks succeeded")
EOF
python3 dag.py
```

What happened:

- **Run 1.** The two extracts succeed. `extract_rates` fails twice with a timeout and succeeds on attempt 3: a **retry** fixed a temporary problem without a human. `transform` fails three times with the same error: retries do not fix bugs. `publish` is **upstream_failed**: it was never run, so no wrong report went out.
- **Re-run after the fix.** The four tasks that already succeeded are **skipped**; only `transform` and `publish` run. On a pipeline whose extract takes two hours, that is the difference between a ten-minute fix and losing the morning.
- **Backfill.** The same DAG is run for three past days. This only works because each task receives the **run date as a parameter**. A task that calls "today" internally cannot be re-run for last Tuesday.

## Rules for tasks

1. **Idempotent:** a retry or re-run must not duplicate data ([lesson 8](#dataeng-8)).
2. **Parameterised by the data interval** (the run date), never by the clock.
3. **Atomic:** a task either completes or leaves no partial output.
4. **Small enough to retry**, large enough to mean something: "extract orders", not "do everything".
5. **No heavy work in the orchestrator itself:** it should start work in the warehouse, Spark or a container and wait.
6. **Pass references, not data,** between tasks: a table name or file path, not a million rows.

## Apache Airflow

**Airflow** is the most widely used orchestrator. DAGs are Python files.

```term
# Example (not run here): an Airflow DAG with the TaskFlow API
from datetime import datetime, timedelta
from airflow.decorators import dag, task

@dag(schedule="0 2 * * *", start_date=datetime(2026, 3, 1), catchup=False,
     default_args={"retries": 2, "retry_delay": timedelta(minutes=5)})
def daily_orders():
    @task
    def extract(ds=None):            # ds = the run's logical date, e.g. "2026-03-05"
        return f"s3://lake/raw/orders/day={ds}/"
    @task
    def transform(path, ds=None):
        return f"analytics.orders_clean${ds}"
    @task
    def publish(table): ...
    publish(transform(extract()))

daily_orders()

# backfill past days from the command line (Airflow 2 syntax):
#   airflow dags backfill -s 2026-03-02 -e 2026-03-04 daily_orders
```

Words you will hear: **operator** (a template for a task), **sensor** (waits for something, such as a file), **XCom** (small values passed between tasks), **executor** (where tasks run: local, Celery, Kubernetes), **catchup** (whether missed schedule intervals are run automatically), **SLA / deadline alerts** (a run is late).

Other orchestrators: **Dagster** (built around data assets and their lineage), **Prefect** (Python-first, dynamic flows), cloud services (AWS Step Functions, Managed Airflow, Google Cloud Composer, Azure Data Factory), and **Argo Workflows** on Kubernetes (Kubeflow Pipelines, in [AI infrastructure 8](#aiinfra-8), runs on it).

## Scheduling details that cause incidents

- **Time zones and daylight saving:** schedule in UTC.
- **Late data:** a daily run at 00:05 misses events that arrive at 00:20 for yesterday. Wait for a completeness signal, or re-process a sliding window of recent days.
- **Overlapping runs:** yesterday's run is still going when today's starts. Limit concurrency to one.
- **Dependencies across DAGs:** prefer one DAG, or trigger on the upstream dataset being updated, over "it usually finishes by 3".
- **Backfills at full speed** can overload the source or the warehouse. Limit parallelism.

:::try
1. Add a task `quality_check` between `transform` and `publish` that fails when a flag is set, and confirm that `publish` becomes `upstream_failed`. 2. Change `max_retries` to 0 and see that the API timeout now fails the run. 3. Make `run_dag` execute tasks with no dependency between them "in parallel" by printing which tasks could start together at each step.
:::

## Why use an orchestrator instead of cron?

:::say
Cron only starts a command at a time. An orchestrator understands dependencies between tasks, retries failures, stops downstream tasks when an upstream one fails, lets me re-run from the failed task and backfill past dates, and gives history, logs and alerts. For that to work I write tasks that are idempotent and take the run date as a parameter.
:::

## How do you backfill a year of data?

:::say
I make sure the tasks are idempotent and parameterised by date, then run the DAG for the past intervals in batches with limited parallelism so I do not overload the source or the warehouse. I backfill into a partitioned table by replacing whole partitions, verify counts per day against the source, and only then switch consumers. For a logic change I often build the new version beside the old one and compare before swapping.
:::

:::recap
- An orchestrator runs a **DAG** of tasks: order, schedule, **retries**, **upstream_failed**, history and alerts.
- Retries fix temporary faults, not bugs.
- **Re-run from the failure**; **backfill** past dates.
- Tasks must be **idempotent, atomic and parameterised by run date**.
- Airflow is the common tool; Dagster, Prefect and cloud services follow the same ideas.
:::

```quiz
? A task in the middle of a DAG fails after all retries. What happens to tasks that depend on it?
+ They are marked upstream_failed and do not run
- They run with empty data
- The whole history is deleted
- They run twice
! Downstream tasks must not run on missing or bad input.

? Why must a task use the run date parameter instead of the current date?
+ So it can be re-run or backfilled for any past day and give the right result
- It is faster
- Clocks are unreliable in Python
- Airflow forbids datetime
! "Today" changes; the run's logical date does not.

? What do retries fix?
+ Temporary problems such as a network timeout
- Bugs in the transformation code
- Wrong business logic
- Missing permissions
! A deterministic error fails the same way every time.
```
