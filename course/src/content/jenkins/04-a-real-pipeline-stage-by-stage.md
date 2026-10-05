---
track: jenkins
title: A real CI/CD pipeline, stage by stage
short: Real pipeline
sub: Run every pipeline stage for real: checkout, lint, test, build an image, push to a registry, deploy to Kubernetes, verify and roll back.
---

:::goals
- see that a pipeline is just ordered commands with fail-fast behaviour
- build, tag, push and deploy an image with real tools
- implement a smoke test and automatic rollback
- put the stage commands in a script a Jenkinsfile would call
:::

## Pipelines are just commands

Strip away the syntax and a pipeline is: *run these commands in this order, on a clean machine, stop at the first failure, and remember the result.* Jenkins adds scheduling, agents, history, UI, credentials and notifications around that.

Because we cannot run the Pipeline plugin in this lab, we run the **stage commands themselves** as a script. This is exactly what you would put in `ci/pipeline.sh` and call from `sh './ci/pipeline.sh'` inside a Jenkinsfile stage. The lab provides a real Docker registry on `localhost:5000` and the real Kubernetes cluster from the previous track.

```setup
export LABNS=ci
```

@setup k8s

```run
docker rm -f registry > /dev/null 2>&1
docker run -d --name registry -p 127.0.0.1:5000:5000 registry:2 > /dev/null
sleep 2
curl -s http://127.0.0.1:5000/v2/_catalog
```

An empty registry. Now the project: a tiny web app, a test, a Dockerfile and a Kubernetes manifest, all in a Git repository:

```run
rm -rf ~/lab/ev-app ~/lab/ev-app-ci
git config --global user.name "Dev" ; git config --global user.email "dev@example.com" ; git config --global init.defaultBranch main
mkdir -p ~/lab/ev-app/site ~/lab/ev-app/ci && cd ~/lab/ev-app && git init -q
cat > site/index.html <<'EOF'
<h1>EV status page</h1>
version: 1
EOF
cat > Dockerfile <<'EOF'
FROM busybox:1.37
COPY site/ /www/
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
EOF
cat > ci/test.sh <<'EOF'
#!/bin/bash
# a tiny "unit test": the page must contain a version line
grep -q '^version: [0-9]' site/index.html && echo "test: version line present" || { echo "test: version line MISSING"; exit 1; }
EOF
chmod +x ci/test.sh
cat > k8s.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: ev-app}
spec:
  replicas: 2
  selector:
    matchLabels: {app: ev-app}
  template:
    metadata:
      labels: {app: ev-app}
    spec:
      containers:
      - name: web
        image: IMAGE_PLACEHOLDER
        ports: [{containerPort: 8080}]
        readinessProbe:
          httpGet: {path: /, port: 8080}
          periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata: {name: ev-app}
spec:
  selector: {app: ev-app}
  ports: [{port: 80, targetPort: 8080}]
EOF
git add -A && git commit -q -m "Initial EV status page" && git log --format='%s'
```

## The pipeline script

Each function is one stage. `set -euo pipefail` gives **fail-fast**: the first failing command stops the run, exactly like a failed stage skips the rest.

```run
cat > ~/lab/ev-app/ci/pipeline.sh <<'EOF'
#!/bin/bash
set -euo pipefail
BUILD_NUMBER=${BUILD_NUMBER:?set BUILD_NUMBER}
REGISTRY=localhost:5000
IMAGE=$REGISTRY/ev/status-page
SHA=$(git rev-parse --short HEAD)
TAG="$BUILD_NUMBER-$SHA"

stage() { echo; echo "=== STAGE: $1"; }

stage "Lint"
bash -n ci/test.sh && echo "lint: shell syntax ok"

stage "Test"
./ci/test.sh

stage "Build image"
docker build -q -t "$IMAGE:$TAG" . > /dev/null && echo "built $IMAGE:<build>-<sha>"

stage "Push image"
docker push -q "$IMAGE:$TAG" > /dev/null && echo "pushed"

stage "Deploy to Kubernetes"
sed "s#IMAGE_PLACEHOLDER#$IMAGE:$TAG#" k8s.yaml | kubectl apply -f - > /dev/null
if ! kubectl rollout status deployment/ev-app --timeout=90s | tail -1; then
  echo "DEPLOY FAILED: rolling back"
  kubectl rollout undo deployment/ev-app > /dev/null 2>&1
  kubectl rollout status deployment/ev-app --timeout=90s | tail -1
  exit 1
fi

stage "Smoke test"
kubectl run smoke-$BUILD_NUMBER --image=busybox:1.37 --restart=Never -- sh -c 'wget -qO- http://ev-app | tail -1' > /dev/null
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/smoke-$BUILD_NUMBER --timeout=60s > /dev/null
echo "smoke test says: $(kubectl logs smoke-$BUILD_NUMBER)"
echo; echo "PIPELINE SUCCESS: $TAG deployed"
EOF
chmod +x ~/lab/ev-app/ci/pipeline.sh
cd ~/lab/ev-app && git add -A && git commit -q -m "Add pipeline script" && echo committed
```

## Run 1: everything passes

```run
cd ~/lab/ev-app
BUILD_NUMBER=1 ./ci/pipeline.sh 2>&1 | sed -E 's/[0-9]+-[0-9a-f]{7} deployed/<build>-<sha> deployed/'
```

Read the output as a Jenkins console: each stage in order, the rollout waits for readiness, then a **smoke test** inside the cluster confirms the real application answers. The registry now holds the image and the cluster is running it:

```run
curl -s http://127.0.0.1:5000/v2/_catalog
kubectl get deployment ev-app -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas --no-headers
```

## Run 2: a bad change is stopped by the test stage

A developer removes the version line. Watch the pipeline **stop before building or deploying** anything:

```run
cd ~/lab/ev-app
sed -i '/^version/d' site/index.html
git commit -qam "Oops: remove version line"
BUILD_NUMBER=2 ./ci/pipeline.sh 2>&1 | sed -E 's/\.sh: line [0-9]+//'; echo "pipeline exit code: ${PIPESTATUS[0]}"
kubectl get deployment ev-app -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}' | sed -E 's/[0-9]+-[0-9a-f]{7}/<build>-<sha>/'
```

The `Test` stage exited 1, so nothing after it ran and **production still runs the previous good image**. This is the entire value of CI: a bad change is caught within a minute, by a machine, before it reaches users. In Jenkins this would be a red build and a notification.

## Run 3: build passes but the deployment is broken: automatic rollback

A change that passes tests but produces a container that never becomes ready (for example, a wrong port). The deploy stage notices that the rollout fails, **rolls back** and fails the build:

```run
cd ~/lab/ev-app
git revert --no-edit HEAD > /dev/null
sed -i 's/"-p", "8080"/"-p", "9999"/' Dockerfile
git commit -qam "Change port (breaks readiness)"
BUILD_NUMBER=3 ./ci/pipeline.sh 2>&1 | grep -vE "^$" | sed -E 's/Waiting for deployment.*/(rollout is waiting for the new Pods to become ready...)/' | uniq; echo "pipeline exit code: ${PIPESTATUS[0]}"
kubectl get pods -l app=ev-app --no-headers -o custom-columns=READY:.status.containerStatuses[0].ready | sort | uniq -c
```

The new Pods never passed the readiness probe, `rollout status` timed out, the script ran `kubectl rollout undo`, and the two healthy old Pods kept serving traffic the whole time. The pipeline exits non-zero, so Jenkins would mark the build **FAILURE** and notify the team. (After the rollback you may briefly see a leftover not-ready Pod while Kubernetes cleans up.)

## Turning it into a Jenkinsfile

```groovy:Jenkinsfile (Example, not run here)
pipeline {
    agent { label 'docker-kubectl' }
    options { timeout(time: 15, unit: 'MINUTES') }
    stages {
        stage('Checkout') { steps { checkout scm } }
        stage('Pipeline') {
            steps { sh 'BUILD_NUMBER=$BUILD_NUMBER ./ci/pipeline.sh' }
        }
    }
    post {
        failure { echo 'Notify the team' }
        always  { cleanWs() }
    }
}
```

Putting the real logic in `ci/pipeline.sh` is a good habit: developers can run it locally, and the Jenkinsfile stays tiny. When you want the UI to show separate stage boxes, split the script into separate `stage { steps { sh './ci/lint.sh' } }` blocks.

## Promotion, versions and traceability

- The image tag `BUILD-SHA` links every running Pod to a **Jenkins build and a Git commit**. When something breaks you know exactly what code is running.
- **Build once, promote the same image**: deploy the identical tag to test, then to production; never rebuild between environments.
- Use **immutable tags** (never reuse `latest` for deployments).
- For production, add a manual **approval** (`input`) or promote via a Git change (GitOps).

```run
kubectl delete namespace ci --wait=false > /dev/null
kubectl delete deployment,service ev-app -n ci --ignore-not-found > /dev/null 2>&1
docker rm -f registry > /dev/null
```

:::recap
- A pipeline is ordered commands, fail-fast, with results kept. The Jenkins file wraps a script that you can run anywhere.
- Real stages: lint, test, build, push, deploy, smoke test; rollback on a failed rollout.
- Tests stop bad changes before deploy; readiness plus `rollout status` catches broken deploys.
- Tag images with build and commit; build once and promote.
:::

:::try Your turn
Add a stage that fails the pipeline if the built image is larger than 20 MB (`docker image inspect -f '{{.Size}}'`). Make it fail on purpose and read the exit code.
:::

:::quiz
? Why run the test stage before building and pushing the image?
+ A failing test stops the pipeline early, so nothing bad is published
- It is required by Docker
- It makes images smaller
- Tests need a registry
! Fail fast and save time.
? What does the pipeline do when the new Pods never become ready?
+ `rollout status` times out, so it rolls back and fails the build
- Deploys anyway
- Deletes the registry
- Restarts Jenkins
! Old healthy Pods kept serving.
? Why tag images with build number and commit SHA?
+ To trace a running version back to its build and code
- To save space
- Kubernetes demands it
- To hide versions
! Traceability makes incidents shorter.
:::
