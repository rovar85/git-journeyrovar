---
track: aiinfra
title: MLOps platforms: MLflow and Kubeflow
short: MLflow, Kubeflow
sub: Track experiments, register and promote models, and trace LLM apps with real MLflow; compile a real Kubeflow pipeline; and see where each fits in the platform.
---

:::goals
- explain the ML lifecycle and what an MLOps platform adds to DevOps
- log parameters, metrics and models with MLflow, pick the best run and register it with an alias
- record traces of an application with MLflow tracing
- compile a Kubeflow Pipelines pipeline and read what it produced
- place MLflow and Kubeflow (and Argo CD, KEDA, vLLM) in one platform picture
:::

@setup pyml

:::note What ran and what did not
**MLflow runs for real** here (a local SQLite store, scikit-learn, no network). **Kubeflow Pipelines is only compiled**: the compile step is real and needs no cluster, but running a pipeline needs a Kubernetes cluster with Kubeflow installed, which this lab does not have. I **read the READMEs** of MLflow and Kubeflow; the rest of the Kubeflow subproject list is from my own knowledge. The Python packages are pre-installed in the lab; on your machine run `pip install mlflow scikit-learn kfp` in a virtual environment.
:::

## 1. What "MLOps" adds

DevOps ships **code**. Machine learning ships **code plus data plus a trained model**, and any of the three can change the result. New problems appear:

| Problem | Question it asks | Platform answer |
|---|---|---|
| **Experiments** | which run, with which parameters and data, produced this 0.93? | **experiment tracking** |
| **Reproducibility** | can I get the same model again? | pinned data, code, parameters and environment recorded per run |
| **Model versions** | which model is in production, who approved it, and how do I roll back? | **model registry** with versions and aliases |
| **Pipelines** | data prep, training, evaluation, deployment as repeatable steps | **pipeline orchestration** |
| **Serving** | how does the model get behind an API with scaling? | serving (lessons 4 to 6, KServe in Kubeflow) |
| **Monitoring** | has the data drifted or quality fallen? | metrics, evaluation, traces (lesson 9) |

The Made With ML and Designing Machine Learning Systems resources on your list are about this lifecycle; this lesson shows the two tools from your list that are most widely used for it.

## 2. MLflow: tracking, registry and tracing

From the MLflow README: MLflow is an open source **AI engineering platform for agents, LLMs and ML models**, with experiment tracking and model management from the classic ML days, and for LLM applications **tracing/observability (built on OpenTelemetry), evaluation (built-in metrics and LLM judges), prompt management and optimisation, and an AI gateway**.

Run the classic flow: train three models with different settings, **log** each run, **search** for the best, **register** it, give it the alias `champion`, and **load it by that alias** as a serving system would:

```run
mkdir -p ~/lab/mlops && cd ~/lab/mlops
cat > track.py <<'EOF'
import logging, warnings
warnings.filterwarnings("ignore"); logging.getLogger("mlflow").setLevel(logging.ERROR)
import mlflow
from mlflow import MlflowClient
import numpy as np
from sklearn.linear_model import LogisticRegression

mlflow.set_tracking_uri("sqlite:///mlflow.db")            # a local database; in production a shared server
mlflow.set_experiment("ev-ticket-routing")

rng = np.random.default_rng(7)
X = rng.normal(size=(300, 4))
y = (X[:, 0] + 0.5 * X[:, 1] + rng.normal(scale=1.2, size=300) > 0).astype(int)
Xtr, ytr, Xte, yte = X[:60], y[:60], X[60:], y[60:]

uris = {}
for C in (0.001, 0.1, 10.0):                                # try three regularisation strengths
    with mlflow.start_run(run_name=f"logreg C={C}") as run:
        model = LogisticRegression(C=C).fit(Xtr, ytr)
        mlflow.log_param("C", C)
        mlflow.log_param("train_rows", len(Xtr))
        mlflow.log_metric("accuracy", round(model.score(Xte, yte), 3))
        uris[run.info.run_id] = mlflow.sklearn.log_model(model, name="model").model_uri

runs = mlflow.search_runs(order_by=["metrics.accuracy DESC"])
print(runs[["tags.mlflow.runName", "params.train_rows", "metrics.accuracy"]].to_string(index=False))

best = runs.iloc[0]
version = mlflow.register_model(uris[best["run_id"]], "ev-ticket-router")      # the registry gives it a version number
MlflowClient().set_registered_model_alias("ev-ticket-router", "champion", version.version)
print("\nregistered ev-ticket-router version", version.version, "from", best["tags.mlflow.runName"], "and set alias 'champion'")

served = mlflow.pyfunc.load_model("models:/ev-ticket-router@champion")      # consumers load by alias, never by file path
print("champion predictions for 5 tickets:", [int(p) for p in served.predict(Xte[:5])])
EOF
python3 track.py 2>/dev/null
```

Everything the lesson set up as problems now has an answer:

- **Experiments and reproducibility**: each run stored its parameters, its metric and the model, so "which settings gave 0.738?" is a query, not a memory.
- **Registry and promotion**: the **alias** `champion` points at a version. To promote a better model you move the alias; to roll back you move it back. Serving code only ever asks for `models:/ev-ticket-router@champion`, so it needs no redeploy.
- **Lineage**: a registered version links back to the run, and the run to code, data version and parameters (when you log them).

This is the same principle as GitOps (lesson 7): **a named pointer to a version, changed deliberately, with history**.

### Tracing an LLM application

For LLM and agent applications the question is not "what accuracy" but "what exactly did my application do for this request?". **Tracing** records each step (retrieval, model call, tool call) as a **span** in a **trace**. MLflow's tracing is built on OpenTelemetry (from the README). A decorator is enough to capture a nested call tree:

```run
cd ~/lab/mlops
cat > trace.py <<'EOF'
import logging, warnings
warnings.filterwarnings("ignore"); logging.getLogger("mlflow").setLevel(logging.ERROR)
import mlflow
mlflow.set_tracking_uri("sqlite:///mlflow.db")
mlflow.set_experiment("ev-search-assistant")

@mlflow.trace
def retrieve(question):
    return ["runbook-search", "faq-indexing"]               # stand-in for a vector search

@mlflow.trace
def generate(question, docs):
    return f"Answer built from {len(docs)} documents"       # stand-in for a model call

@mlflow.trace
def answer(question):
    return generate(question, retrieve(question))

print(answer("why is search slow"))
mlflow.flush_trace_async_logging()
traces = mlflow.search_traces(return_type="list")
spans = traces[0].data.spans
print("trace recorded with", len(spans), "spans:")
for s in sorted(spans, key=lambda s: s.start_time_ns):
    print("   ", s.name)
EOF
python3 trace.py 2>/dev/null
```

In production the same traces go to an MLflow server (or any OpenTelemetry backend, lesson 9), where you can filter by latency or error, inspect inputs and outputs, and attach **evaluation** scores. This is what makes an LLM application debuggable.

## 3. Kubeflow: ML on Kubernetes

From its README, Kubeflow is **"the Cloud Native AI platform"**: a set of **modular, open source projects** that form a Kubernetes-native stack for data and AI workloads, with principles of being **simple, portable, scalable and composable**. The repository is a **gateway to the subprojects**, where development happens. From my knowledge, the main subprojects are:

| Subproject | Purpose |
|---|---|
| **Kubeflow Pipelines (KFP)** | define and run ML **workflows** as pipelines of containerised steps |
| **Kubeflow Trainer** | run **distributed training** jobs on Kubernetes (PyTorch and others), the successor of the older training operators |
| **Katib** | **hyperparameter tuning** and neural architecture search |
| **KServe** | **model serving** on Kubernetes with autoscaling and, for LLMs, integrations with engines like vLLM |
| **Notebooks** | managed Jupyter notebook servers |
| **Model Registry** | store model metadata and versions |

Compare with MLflow: **MLflow** is a **library and server you can use anywhere** (a laptop, a VM) for tracking and registry; **Kubeflow** is a **platform that assumes Kubernetes** and orchestrates the **running** of jobs and serving. They are often used **together**: Kubeflow Pipelines orchestrates, and each step logs to MLflow.

A **pipeline** is code that declares **components** (steps with typed inputs and outputs) and how they connect. The **compile** step turns it into a portable YAML description that a Kubeflow cluster can run. That part is real and needs no cluster:

```run
cd ~/lab/mlops
cat > pipeline.py <<'EOF'
import warnings; warnings.filterwarnings("ignore")
from kfp import dsl, compiler
import yaml

@dsl.component(base_image="python:3.11")
def prepare(rows: int) -> int:
    return rows * 2                                          # stand-in for data preparation

@dsl.component(base_image="python:3.11")
def train(rows: int) -> float:
    return 0.9                                               # stand-in for training: returns an accuracy

@dsl.component(base_image="python:3.11")
def deploy(accuracy: float) -> str:
    return "deployed" if accuracy >= 0.85 else "rejected"    # a quality gate

@dsl.pipeline(name="ev-ticket-router")
def pipeline(rows: int = 1000):
    data = prepare(rows=rows)
    model = train(rows=data.output)
    deploy(accuracy=model.output)

compiler.Compiler().compile(pipeline, "pipeline.yaml")
spec = next(yaml.safe_load_all(open("pipeline.yaml")))
print("compiled pipeline:", spec["pipelineInfo"]["name"])
for name, task in spec["root"]["dag"]["tasks"].items():
    after = task.get("dependentTasks", [])
    print(f"  step {name:8} runs after {after or 'nothing'}")
print("components compiled to container specs:", sorted(spec["deploymentSpec"]["executors"]))
EOF
python3 pipeline.py 2>/dev/null
```

Each step becomes a **container** in the cluster, so the Docker and Kubernetes skills from earlier tracks are exactly what you need: images, resource requests (including GPUs: `nvidia.com/gpu`), volumes for data, and service accounts. The **dependency order** comes from how outputs feed inputs, and a **gate** (`deploy` only if accuracy is high enough) is just a step. Your GitOps repository (lesson 7) is where the compiled pipelines and serving manifests live.

## 4. The platform picture

Putting the tools from your list together, in the order an ML or LLM change flows:

| Stage | Tool(s) | Lesson |
|---|---|---|
| Code and config in Git | Git, pull requests | Git track |
| Build and test | Jenkins or GitHub Actions, Docker | Jenkins and Docker tracks |
| Train and track | Kubeflow Trainer or any job, **MLflow** tracking | this lesson |
| Orchestrate | **Kubeflow Pipelines** or Argo Workflows | this lesson |
| Register and promote | **MLflow** registry (aliases) | this lesson |
| Deploy declaratively | **Argo CD** (GitOps) | lesson 7 |
| Serve | **vLLM**, Triton, KServe, Dynamo | lessons 4 and 5 |
| Scale | **KEDA** / HPA, cluster autoscaler, GPU nodes | lessons 6 and 7 |
| Observe | **Prometheus**, **Grafana**, **OpenTelemetry**, MLflow traces | lesson 9 |

That is the chain from the post you shared, "AI workloads, model serving, GPU scheduling, AI observability, AI autoscaling", made concrete.

:::warn Common mistakes
- **Logging only the final metric.** Also log data version, code commit, environment and the evaluation set; otherwise runs cannot be reproduced.
- **Deploying by file path.** Use a registry with versions and aliases, so promotion and rollback are metadata changes.
- **Promoting on one number.** Gate on a held-out evaluation, compare against the current champion, and check per-segment results.
- **Using Kubeflow for a single model on one machine.** The platform pays off with teams, many pipelines and Kubernetes already in place.
- **No tracing in LLM apps.** Without traces you cannot see which retrieval or tool call caused a bad answer.
:::

:::recap
- MLOps adds **experiments, reproducibility, a model registry, pipelines, serving and monitoring** to the DevOps cycle.
- **MLflow** logs runs, searches them, registers versions, uses **aliases** for promotion and rollback, and **traces** LLM applications.
- **Kubeflow** is a Kubernetes-native AI platform of modular projects (Pipelines, Trainer, Katib, KServe, Notebooks, Model Registry); pipelines **compile to YAML** and run each step as a container.
- Git, CI, GitOps, serving, autoscaling and observability connect into one chain.
:::

:::try Your turn
Add a fourth run to `track.py` with `C=1000.0`, rerun, and see which model becomes `champion`. Then register it again and move the alias back to version 1 using `set_registered_model_alias`, and confirm with `load_model` that predictions change. This is a rollback.
:::

:::quiz
? What does moving the `champion` alias do?
+ Changes which registered model version consumers get, without redeploying code
- Retrains the model
- Deletes old versions
- Changes the dataset
! Aliases are named pointers to versions.
? How does MLflow differ from Kubeflow?
+ MLflow tracks and registers models and works anywhere; Kubeflow orchestrates ML workloads on Kubernetes
- They are the same product
- Kubeflow only tracks metrics
- MLflow only runs on Kubernetes
! They are complementary and often used together.
? What does compiling a Kubeflow pipeline produce?
+ A portable YAML description whose steps run as containers on a cluster
- A trained model
- A Docker daemon
- A GPU driver
! Compilation needs no cluster; running does.
:::
