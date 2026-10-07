# Python environment with MLflow, scikit-learn, Kubeflow Pipelines (kfp), prometheus_client and OpenTelemetry pre-installed.
# On your own machine:  python3 -m venv .venv && . .venv/bin/activate && pip install mlflow scikit-learn kfp prometheus-client opentelemetry-sdk
export PATH=/opt/mlops-venv/bin:$PATH
export MLFLOW_DISABLE_AGENT_HINT=1
cd ~/lab
