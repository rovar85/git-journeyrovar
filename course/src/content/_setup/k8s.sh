# Per-lesson namespace on the lab cluster. The lesson sets LABNS first (default: lab).
LABNS=${LABNS:-lab}
mkdir -p ~/.kube && cp /opt/k8s/pki/admin.kubeconfig ~/.kube/config && chmod 600 ~/.kube/config
kubectl delete namespace "$LABNS" --ignore-not-found --wait=true > /dev/null 2>&1
kubectl create namespace "$LABNS" > /dev/null
kubectl config set-context --current --namespace="$LABNS" > /dev/null
cd ~/lab
