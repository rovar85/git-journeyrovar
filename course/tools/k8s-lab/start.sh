#!/bin/bash
# Lab-only single-node Kubernetes (v1.37.1): etcd + apiserver + controller-manager + scheduler + containerd + kubelet + kube-proxy + CoreDNS.
# Everything listens on loopback / a loopback alias (10.255.255.1, reachable from pods, not from outside) only. Auth is a fixed lab token. NOT for any real use.
# Prerequisites (already installed in the build sandbox): binaries in /opt/k8s/bin (from dl.k8s.io), etcd, containerd, runc, containernetworking-plugins.
# Notes: the sandbox forbids lowering oom_score_adj, so containerd runs with restrict_oom_score_adj=true; kubelet needs failCgroupV1=false (cgroup v1 host).
B=/opt/k8s/bin; P=/opt/k8s/pki; L=/opt/k8s/log; S=/opt/k8s/containerd/containerd.sock
export NO_PROXY=10.255.255.1,127.0.0.1,localhost,lab-node,192.0.2.2,10.0.0.0/8 no_proxy=10.255.255.1,127.0.0.1,localhost,lab-node,192.0.2.2,10.0.0.0/8
export KUBECONFIG=$P/admin.kubeconfig
mkdir -p $P $L /opt/k8s/etcd
up() { pgrep -f "$1" > /dev/null; }   # patterns are anchored with ^ so shells whose text mentions them never match
ip -br addr show lo | grep -q 10.255.255.1 || ip addr add 10.255.255.1/32 dev lo
sed -i 's#https://127.0.0.1:6443#https://10.255.255.1:6443#' $P/admin.kubeconfig
up "^etcd --data" || setsid nohup etcd --data-dir /opt/k8s/etcd --listen-client-urls http://127.0.0.1:2379 --advertise-client-urls http://127.0.0.1:2379 > $L/etcd.log 2>&1 < /dev/null &
sleep 2
up "^/opt/k8s/bin/kube-apiserver" || setsid nohup $B/kube-apiserver --etcd-servers=http://127.0.0.1:2379 --cert-dir=$P --secure-port=6443 --bind-address=10.255.255.1 --advertise-address=10.255.255.1 \
  --service-cluster-ip-range=10.96.0.0/12 --token-auth-file=$P/tokens.csv --authorization-mode=RBAC,Node \
  --service-account-issuer=https://kubernetes.default.svc --service-account-key-file=$P/sa.pub --service-account-signing-key-file=$P/sa.key \
  --kubelet-preferred-address-types=Hostname,InternalIP --allow-privileged=true --enable-admission-plugins=NodeRestriction > $L/apiserver.log 2>&1 < /dev/null &
for i in $(seq 1 90); do curl -sk https://10.255.255.1:6443/healthz 2>/dev/null | grep -q ok && break; sleep 1; done
up "^/opt/k8s/bin/kube-controller-manager" || setsid nohup $B/kube-controller-manager --bind-address=127.0.0.1 --kubeconfig=$P/admin.kubeconfig --service-account-private-key-file=$P/sa.key --root-ca-file=$P/apiserver.crt --controllers='*' --cluster-cidr=10.244.0.0/16 --allocate-node-cidrs=true --node-monitor-grace-period=60s > $L/cm.log 2>&1 < /dev/null &
up "^/opt/k8s/bin/kube-scheduler" || setsid nohup $B/kube-scheduler --bind-address=127.0.0.1 --kubeconfig=$P/admin.kubeconfig > $L/sched.log 2>&1 < /dev/null &
up "^containerd --config" || setsid nohup containerd --config /opt/k8s/containerd/config.toml > $L/containerd.log 2>&1 < /dev/null &
sleep 3
up "^/opt/k8s/bin/kubelet --config" || setsid nohup $B/kubelet --config /opt/k8s/kubelet-config.yaml --kubeconfig $P/admin.kubeconfig --hostname-override lab-node --node-ip 192.0.2.2 --root-dir /opt/k8s/kubelet > $L/kubelet.log 2>&1 < /dev/null &
up "^/opt/k8s/bin/kube-proxy --config" || setsid nohup $B/kube-proxy --config /opt/k8s/kube-proxy-config.yaml --hostname-override lab-node > $L/kube-proxy.log 2>&1 < /dev/null &
for i in $(seq 1 60); do kubectl get nodes 2>/dev/null | grep -q " Ready" && break; sleep 2; done
kubectl get nodes
