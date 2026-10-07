#!/bin/bash
# Bring the whole lab back after the sandbox restarts: hosts entry, Kubernetes control plane, kubelet, Docker.
# Order matters:
#  1. the Kubernetes containerd must start BEFORE dockerd (start.sh's "already running?" check pgreps "^containerd --config"
#     and would otherwise match Docker's own containerd and skip starting it);
#  2. the kubelet needs containerd's socket, so it starts after containerd;
#  3. "Ready" is only trusted when the kubelet process is alive (the node object keeps a stale Ready status for a while).
grep -q lab-node /etc/hosts || echo "127.0.0.1 lab-node" >> /etc/hosts
export KUBECONFIG=/opt/k8s/pki/admin.kubeconfig
mkdir -p /opt/k8s/log
if ! pgrep -f "^containerd --config /opt/k8s/containerd/config.toml" > /dev/null; then
  rm -f /opt/k8s/containerd/containerd.sock          # a stale socket file from before the restart would fool the wait loop
  (cd /tmp && setsid nohup containerd --config /opt/k8s/containerd/config.toml > /opt/k8s/log/containerd.log 2>&1 < /dev/null &)
fi
for i in $(seq 1 30); do [ -S /opt/k8s/containerd/containerd.sock ] && break; sleep 1; done
bash "$(dirname "$0")/k8s-lab/start.sh" > /tmp/k8sstart.out 2>&1   # etcd, apiserver, controller-manager, scheduler, kubelet, kube-proxy
pgrep -f "^/opt/k8s/bin/kubelet --config" > /dev/null || (cd /tmp && setsid nohup /opt/k8s/bin/kubelet --config /opt/k8s/kubelet-config.yaml --kubeconfig /opt/k8s/pki/admin.kubeconfig --hostname-override lab-node --node-ip 192.0.2.2 --root-dir /opt/k8s/kubelet > /opt/k8s/log/kubelet.log 2>&1 < /dev/null &)
pgrep -x dockerd > /dev/null || (setsid nohup dockerd > /tmp/dockerd.log 2>&1 < /dev/null &)
# Docker sets the FORWARD policy to DROP; allow pod traffic across the CNI bridge (pod-to-pod, DNS) explicitly.
sleep 5
iptables -C FORWARD -i cni0 -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -i cni0 -j ACCEPT
iptables -C FORWARD -o cni0 -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -o cni0 -j ACCEPT
for i in $(seq 1 90); do
  if pgrep -f "^/opt/k8s/bin/kubelet --config" > /dev/null && kubectl get nodes 2>/dev/null | grep -q " Ready" && docker ps > /dev/null 2>&1; then
    echo "lab is up"; exit 0
  fi
  sleep 3
done
echo "lab did not come up in time; see /tmp/k8sstart.out /opt/k8s/log/*.log"; exit 1
