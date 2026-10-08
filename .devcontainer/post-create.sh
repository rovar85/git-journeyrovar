#!/usr/bin/env bash
# Prepares a real Linux practice machine for the Agent School course.
# Not tested inside GitHub Codespaces by the author of this file: if a step fails, run it by hand.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"

# 1. The same ~/lab practice files the Linux lessons use (same script the lessons run).
mkdir -p "$HOME/lab" && cd "$HOME/lab"
bash "$here/course/src/content/_setup/evlab.sh"

# 2. Extra tools used by later tracks.
python3 -m pip install --quiet --user ansible-core 2>/dev/null || echo "ansible: install skipped"
ARCH="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
if ! command -v kind >/dev/null; then
  sudo curl -fsSL -o /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-${ARCH}" && sudo chmod +x /usr/local/bin/kind || echo "kind: download skipped"
fi

echo
echo "Ready. Practice files are in ~/lab. For Kubernetes lessons run:  kind create cluster"
