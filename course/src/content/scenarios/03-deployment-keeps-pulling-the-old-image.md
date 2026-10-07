---
track: scenarios
title: "S3: The pipeline builds and deploys a new image, but the Kubernetes deployment keeps running the old version. What could be causing this?"
short: S3 Old image keeps running
sub: Mutable tags, imagePullPolicy, node caches, rollouts that never trigger, failed rollouts and GitOps overrides, each reproduced against a real registry and cluster, plus the answer an interviewer expects.
---

:::goals
- explain how Kubernetes decides **whether to roll out** and **whether to pull**
- reproduce **mutable tag + cached image + unchanged manifest**, the most common cause, on a real registry and cluster
- separate "old image still **running**" from "new image **failing** and the old ReplicaSet still serving"
- fix it properly with **immutable tags or digests** and verify with the right commands
- list the other causes (wrong cluster, GitOps, Helm values, pull secrets) and answer the question like a senior engineer
:::

:::note Provenance
A **real local registry** (`registry:2` in Docker) and the **real lab cluster** are used, so every output below is real. GitOps and Helm causes are described and shown as **Example, not run here**.
:::

```setup
export LABNS=labimg
docker rm -f reg > /dev/null 2>&1
docker run -d --name reg -p 127.0.0.1:5000:5000 registry:2 > /dev/null
sleep 2
# start from a node with no cached copy of the demo images
for i in $(ctr -a /opt/k8s/containerd/containerd.sock -n k8s.io images ls -q 2>/dev/null | grep '^localhost:5000/demo/app'); do ctr -a /opt/k8s/containerd/containerd.sock -n k8s.io images rm $i > /dev/null 2>&1; done
```

@setup k8s

## 1. Two separate questions Kubernetes asks

Many people blur these. They are **different decisions** made by **different components**:

| Question | Decided by | Rule |
|---|---|---|
| **Should the pods be replaced?** (a rollout) | the **Deployment controller** | **only if the pod template changes** (image string, env, labels, annotations...). **If the spec is byte-for-byte the same, nothing happens**, even if the registry now holds new content under that tag. |
| **Should the node pull the image?** | the **kubelet**, from `imagePullPolicy` | `Always`: ask the registry every time. `IfNotPresent`: use a **local copy if the node already has that name:tag**. `Never`: never pull. **Default:** `Always` if the tag is `latest` (or missing), otherwise **`IfNotPresent`**. |

So with a **mutable tag** (`app:stable`, `app:dev`, `app:latest`) you can fail twice: the Deployment sees **no change** so there is **no rollout**, and a new pod on a node that **already cached** the old content never pulls.

## 2. Build version 1 and deploy it

```run
mkdir -p ~/s3 && cd ~/s3
cat > build.sh <<'SH'
#!/bin/bash
# usage: build.sh <version-text> <tag>
set -e
v=$1; tag=$2
mkdir -p ctx && cd ctx
echo "$v" > index.html
printf 'FROM busybox:latest\nCOPY index.html /www/index.html\nCMD ["httpd","-f","-p","8080","-h","/www"]\n' > Dockerfile
docker build -q -t localhost:5000/demo/app:$tag . > /dev/null || { echo BUILD FAILED; exit 1; }
docker push localhost:5000/demo/app:$tag 2>&1 | tail -1 | awk '{print "pushed", $1, $2, $3}'
SH
chmod +x build.sh
./build.sh "this is version 1" stable

cat > app.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: app}
spec:
  replicas: 1
  selector: {matchLabels: {app: app}}
  template:
    metadata: {labels: {app: app}}
    spec:
      containers:
      - name: app
        image: localhost:5000/demo/app:stable
        ports: [{containerPort: 8080}]
EOF
kubectl apply -f app.yaml
kubectl rollout status deployment/app --timeout=90s
cat > ask.sh <<'SH'
#!/bin/bash
# ask every running pod of the app which version it serves
sleep 2
for p in $(kubectl get pods -l app=app --no-headers | awk '$3=="Running"{print $1}'); do
  ip=$(kubectl get pod $p -o jsonpath='{.status.podIP}')
  printf '%-22s %s\n' "$p" "$(wget -qO- -T 3 http://$ip:8080/)"
done
SH
chmod +x ask.sh
./ask.sh
```

## 3. The "deployment": push version 2 under the same tag

This is the pipeline's job: build, push, `kubectl apply`.

```run
cd ~/s3
./build.sh "this is version 2" stable            # the registry now serves different content for :stable
kubectl apply -f app.yaml                         # the pipeline's deploy step
echo "--- is anything rolling out?"
kubectl rollout status deployment/app --timeout=20s
./ask.sh
```

**What you see:** `kubectl apply` says **`unchanged`**, no rollout starts, and the pod **still serves version 1**. The pipeline reported **success** (the registry push worked; the apply worked) and nothing was wrong from its point of view. This is the number one cause.

Now the second trap: even if a pod is **recreated**, a node that **cached** the old image reuses it, because the default pull policy for a non-`latest` tag is `IfNotPresent`.

```run
cd ~/s3
kubectl delete pod -l app=app > /dev/null          # simulate a crash, eviction or scale-out
kubectl rollout status deployment/app --timeout=60s
./ask.sh
echo "--- what the kubelet did:"
kubectl get pod -l app=app -o jsonpath='{.items[0].spec.containers[0].imagePullPolicy}{"\n"}'
kubectl describe pod -l app=app | grep -E "Pulled|already present" | cut -c1-140
```

**What you see:** a brand-new pod, **still version 1**, and the event says the image was **already present on the machine**. The registry has version 2, but the node never asked.

## 4. Fixes, from weakest to best

### Fix A: force a pull and a rollout (a patch, not a design)

```run
cd ~/s3
kubectl patch deployment app -p '{"spec":{"template":{"spec":{"containers":[{"name":"app","imagePullPolicy":"Always"}]}}}}' > /dev/null    # changes the template, so it also rolls out
kubectl rollout status deployment/app --timeout=60s
./ask.sh
```

`imagePullPolicy: Always` makes the kubelet **check the registry every time** (it compares digests, so it is cheap if nothing changed). Changing the policy **changed the template**, so the pods rolled. The alternative, `kubectl rollout restart deployment/app`, adds a timestamp annotation to force a rollout without changing the image string. Both work, **but both still rely on a tag that can change underneath you**, so you cannot tell **what is running** from the manifest, and **rollback is unreliable** (rolling back to `stable` gives you today's `stable`).

### Fix B (the proper fix): immutable tags or digests

Give every build a **unique tag** (the commit SHA or build number) and **deploy that tag**. Better still, deploy by **digest**.

```run
cd ~/s3
./build.sh "this is version 3" "3-$(date +%s)"
TAG=$(docker images localhost:5000/demo/app --format '{{.Tag}}' | grep '^3-' | head -1)
DIGEST=$(docker inspect --format '{{index .RepoDigests 0}}' localhost:5000/demo/app:$TAG)
echo "unique tag : $TAG"
echo "digest     : $DIGEST"
kubectl set image deployment/app app=$DIGEST
kubectl rollout status deployment/app --timeout=60s
./ask.sh
echo "--- the rollout history now records exactly what ran:"
kubectl rollout history deployment/app --revision=3 | grep -i image
kubectl get deployment app -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

**What you see:** the image string **changed**, so Kubernetes **rolls out**, the pod serves **version 3**, and the Deployment **spec states exactly which bytes run**. A digest is content-addressed, so it **cannot** silently change. Rollback is deterministic: `kubectl rollout undo` returns to the **previous digest**.

## 5. When the old version is serving but the cause is different

Always tell apart these situations:

### The new version **fails**, so the old ReplicaSet keeps serving

A rolling update **keeps old pods until new pods are Ready**. If the new image cannot start, you see old pods "still running the old version", and the rollout looks stuck:

```run
cd ~/s3
kubectl set image deployment/app app=localhost:5000/demo/app:does-not-exist
sleep 8
kubectl get pods -l app=app
echo
kubectl rollout status deployment/app --timeout=10s 2>&1 | tail -2
./ask.sh
kubectl describe pod -l app=app | grep -E "Failed|ErrImage|BackOff" | head -3 | cut -c1-150
kubectl rollout undo deployment/app > /dev/null
kubectl rollout status deployment/app --timeout=60s
```

**What you see:** one **old** pod still serving, one **new** pod in `ErrImagePull` or `ImagePullBackOff`, and `rollout status` waiting. Here the pipeline's "deploy" step **reported success** (it only ran `apply`) and **nobody checked the rollout**. The pipeline must run **`kubectl rollout status --timeout`** (or an equivalent health check) and **fail the build** if it does not complete, then roll back automatically.

### More causes to check

| Cause | How to check |
|---|---|
| **Deployed to the wrong cluster, context or namespace** | `kubectl config current-context`; the pipeline logs; `kubectl get deploy -A \| grep app` |
| **Manifest or Helm values still reference the old tag** (the pipeline built the image but did not update the tag in values or kustomize) | `helm get values`, `kubectl get deploy -o yaml \| grep image:`, `git log` of the manifest repo |
| **GitOps controller reverts the change** (Argo CD, Flux): you patched the cluster but Git says the old tag, so it **self-heals** back | the application's sync status and diff; **change Git, not the cluster** |
| **Another controller owns the field** (an image automation tool, a mutating webhook rewriting the image) | `kubectl get deploy -o yaml` with `managedFields`; webhook configurations |
| **Registry mirror or pull-through cache** serving a stale manifest | pull from the primary registry; compare **digests** |
| **Image pull secret missing or expired**: new pods fail; with `IfNotPresent`, old cached image keeps running | events on the pod |
| **Multi-architecture mismatch** (build produced the wrong platform, node falls back or fails) | `docker manifest inspect`, node architecture |
| **Rollout paused or stuck** (`kubectl rollout pause`, or a PodDisruptionBudget or quota preventing new pods) | `kubectl rollout status`, `kubectl describe deploy` |
| **HPA or another controller recreating pods from an old ReplicaSet** | `kubectl get rs` |
| **CDN or browser cache** (the app is new, the page is old) | check the **pod** directly, as in `ask.sh` |

:::warn Never trust "the pipeline went green"
A green pipeline often means only "the commands returned 0". Verify that **the intended digest is running**: compare the **image ID in the running pod** with the **digest you built**.

```
kubectl get pod -l app=app -o jsonpath='{.items[*].status.containerStatuses[*].imageID}'
```

Put that check in the pipeline's **verify** stage (see Q10 and Q8 in the senior cloud track).
:::

## 6. The answer an interviewer expects

1. **Confirm the symptom with evidence.** "I'd check what is *actually running*: the pod's `imageID`/digest, `kubectl rollout status`, and `kubectl get rs` to see which ReplicaSet owns the pods."
2. **Explain the two mechanisms.** "A rollout only happens if the pod template changes, and a pull only happens if the policy or tag requires it. With a mutable tag like `latest` or `stable`, an unchanged manifest means no rollout, and `IfNotPresent` plus a cached image means no pull."
3. **Rule out the failure modes**: wrong cluster or namespace; manifest or Helm values not updated; GitOps reverting; **new pods failing** (ImagePullBackOff, readiness) while the old ReplicaSet keeps serving; pull secret or registry issues.
4. **Fix properly**: **immutable, unique tags (commit SHA) or digests**; the pipeline updates the **manifest in Git** (GitOps) rather than patching the cluster; `imagePullPolicy` left at its default **with unique tags**, not `Always` as a crutch; a **verify stage** that waits for `rollout status` and **rolls back** on failure.
5. **Prevent**: ban `latest` in production with **policy as code** (admission policy or a CI check), sign and **scan** images (S8), record the digest in the release notes.

A spoken version: *"First I'd check what is really running, by digest, and which ReplicaSet owns the pods. The usual culprit is a mutable tag: the manifest didn't change, so Kubernetes saw no reason to roll out, and nodes with `IfNotPresent` reuse a cached image. Other causes are a failed rollout where the old ReplicaSet keeps serving, the wrong cluster or namespace, stale Helm values, or GitOps reverting my change. The fix is unique, immutable tags or digests deployed through Git, with a pipeline step that waits for the rollout and rolls back on failure."*

:::warn Common mistakes
- Using `latest` or any **reusable tag** in production.
- Fixing with `imagePullPolicy: Always` and calling it done: **rollback and traceability are still broken**.
- **Patching the cluster by hand** when a GitOps controller owns it.
- A pipeline with **no rollout verification**, so a failed rollout looks like success.
- Reading **`kubectl get pods`** only: it does not say **which image digest** a pod runs.
- Assuming a build and push **on the same tag** reaches **every node**: nodes cache by name and tag.
:::

## 7. Follow-up questions to expect

- **"What does `kubectl rollout restart` do?"** It patches the pod template with a **restart annotation**, so a **normal rolling update** happens. It does **not** change the image reference.
- **"Why is `latest` discouraged?"** It is **mutable**, the default policy becomes **Always** (which hides problems and adds registry load), and you cannot say **what version** is running or **roll back precisely**.
- **"How do you roll back safely?"** `kubectl rollout undo` (to the previous ReplicaSet) or **revert the Git commit** in GitOps. With **digests**, the previous spec points at **exactly the previous bytes**.
- **"How do you ensure the same image goes from test to production?"** **Build once**, promote the **digest** (not rebuild), and sign it (supply chain, S8).
- **"The new pods are Pending, not failing."** That is a scheduling problem (see S6).

:::try
1. Change `ask.sh` to also print each pod's `imageID`, and compare it to the digest from `docker inspect`.
2. Reproduce the failing rollout, then add `progressDeadlineSeconds: 30` to the Deployment and see how `rollout status` reports it.
3. Write a small CI check (a shell `grep`) that **fails** if any manifest in a folder uses `:latest` or no tag.
4. Use `kubectl rollout history --revision=N` to compare two revisions' images.
:::

:::recap
- A rollout happens **only when the pod template changes**; a pull happens **per `imagePullPolicy` and tag**.
- **Mutable tags** break both: no rollout, and cached images are reused.
- Fix with **unique immutable tags or digests**, delivered through Git, with a pipeline step that **verifies the rollout and rolls back**.
- Always distinguish "old version running" from "**new version failing** while the old ReplicaSet serves".
- Check the **wrong cluster, stale values, GitOps revert, pull secrets, mirrors and architecture** before blaming Kubernetes.
:::

:::quiz
? `kubectl apply` prints `unchanged` after you pushed a new image to the same tag. Why is nothing rolling out?
- Kubernetes cannot reach the registry
+ The pod template did not change, so the Deployment controller sees nothing to roll out
- The pods are Pending
! A rollout is triggered by a template change, not by registry contents.

? What is the default imagePullPolicy for `app:1.4`?
- Always
+ IfNotPresent
- Never
! Only `latest` (or no tag) defaults to Always.

? Which approach makes both rollout and rollback deterministic?
- Reusing the `stable` tag
+ Deploying an immutable unique tag or an image digest
- Setting replicas to zero first
! A digest names exactly one set of bytes.

? A rollout is stuck and old pods still serve. What did the pipeline likely miss?
- A faster node
+ A verify step that waits for rollout status and rolls back on failure
- A larger image
! A deploy command returning 0 does not mean the rollout succeeded.

? A GitOps controller keeps reverting your manual image change. What should you do?
- Disable the controller
+ Change the image tag in Git, which is the source of truth
- Use latest
! The controller reconciles toward Git.
:::
