---
track: kubernetes
title: ConfigMaps and Secrets
short: Config, Secrets
sub: Keep configuration out of images, inject it safely, and understand what Secrets do and do not protect.
---

:::goals
- create ConfigMaps and Secrets
- inject them as environment variables and as files
- understand update behaviour
- understand why a Secret is not encryption
:::

## Separate configuration from the image

The same image should run in test and production with different settings (database host, log level, feature flags). Kubernetes gives two objects:

| Object | For |
|---|---|
| **ConfigMap** | non-sensitive configuration (strings or whole files) |
| **Secret** | sensitive values (passwords, tokens, TLS keys) |

```setup
export LABNS=lab5
```

@setup k8s

## ConfigMap

```run
kubectl create configmap ev-config --from-literal=LOG_LEVEL=info --from-literal=SQL_SERVER=SQL01
printf 'retries=3\ntimeout=30\n' > evault.conf
kubectl create configmap ev-file --from-file=evault.conf
kubectl get configmap ev-config -o jsonpath='{.data}{"\n"}'
kubectl get configmap ev-file -o jsonpath='{.data.evault\.conf}'
```

## Using it: environment variables and files

```run
cat > pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "echo LOG_LEVEL=$LOG_LEVEL; echo SQL=$SQL_SERVER; echo '--- file:'; cat /etc/ev/evault.conf; sleep 3600"]
    env:
    - name: LOG_LEVEL
      valueFrom:
        configMapKeyRef: {name: ev-config, key: LOG_LEVEL}
    envFrom:
    - configMapRef: {name: ev-config}
    volumeMounts:
    - name: cfg
      mountPath: /etc/ev
  volumes:
  - name: cfg
    configMap:
      name: ev-file
EOF
kubectl apply -f pod.yaml
kubectl wait --for=condition=Ready pod/app --timeout=60s
kubectl logs app
```

Two ways to consume a ConfigMap:

- **Environment variables** (`env`/`envFrom`): simple, but fixed when the container starts.
- **Mounted files** (`volumes`): each key becomes a file. Kubernetes **refreshes the files** on a running Pod after a short delay when the ConfigMap changes (not for `subPath` mounts), but the application must re-read them.

Env var values do **not** change in a running Pod; you restart the Pods. A common pattern: put a **hash of the config** in the Deployment's Pod template annotation so any config change triggers a rolling restart (Helm does this with a checksum annotation), or run `kubectl rollout restart deployment/NAME`.

## Secrets

```run
kubectl create secret generic ev-db --from-literal=username=evsvc --from-literal=password='S3cr3t-lab-only'
kubectl get secret ev-db -o jsonpath='{.data}{"\n"}'
kubectl get secret ev-db -o jsonpath='{.data.password}' | base64 -d; echo
```

Look at that: the secret's value is only **base64-encoded**, which is a way of writing bytes as text, **not encryption**. Anyone who can `kubectl get secret` can read it. So:

:::warn Secrets are not secret by default
- Base64 is not protection. Anyone with read access to the Secret (or to etcd) can decode it.
- Control who can read Secrets with **RBAC** (lesson 8). Do not give broad `get secrets` rights.
- Enable **encryption at rest** for etcd (an API server setting), or use an external secret store (**HashiCorp Vault**, **AWS Secrets Manager**, **Azure Key Vault**) with the **External Secrets Operator** or the **Secrets Store CSI driver**.
- Never commit Secret YAML to Git. Use sealed secrets (**Sealed Secrets**, **SOPS**) if you must keep them in Git.
- Prefer mounting Secrets as **files** over environment variables: env vars leak into logs, crash dumps and child processes.
:::

Use a Secret in a Pod as files:

```run
cat > pod2.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app2
spec:
  containers:
  - name: app
    image: busybox:1.37
    command: ["sh", "-c", "echo user=$(cat /etc/db/username); stat -L -c '%a %n' /etc/db/username /etc/db/password; sleep 3600"]
    volumeMounts:
    - name: db
      mountPath: /etc/db
      readOnly: true
  volumes:
  - name: db
    secret:
      secretName: ev-db
      defaultMode: 0400
EOF
kubectl apply -f pod2.yaml
kubectl wait --for=condition=Ready pod/app2 --timeout=60s
kubectl logs app2
```

The Secret files are mode `400` (owner read only), as you set (mounted files are symlinks into a hidden `..data` folder that Kubernetes swaps atomically on updates). The kubelet stores Secret volumes in memory (`tmpfs`), not on the node's disk.

## Other Secret types

| Type | Use |
|---|---|
| `Opaque` (generic) | arbitrary key/values |
| `kubernetes.io/tls` | a certificate and key (`kubectl create secret tls`) |
| `kubernetes.io/dockerconfigjson` | credentials to pull images from a private registry (`imagePullSecrets`) |
| `kubernetes.io/service-account-token` | API tokens for ServiceAccounts |

```run
openssl req -x509 -newkey rsa:2048 -nodes -keyout tls.key -out tls.crt -days 30 -subj "/CN=ev.example.com" 2>/dev/null
kubectl create secret tls ev-tls --cert=tls.crt --key=tls.key
kubectl get secret ev-tls -o jsonpath='{.type}{"\n"}'
rm -f tls.key tls.crt
```

## Changing configuration safely

```run
kubectl patch configmap ev-config -p '{"data":{"LOG_LEVEL":"debug"}}' > /dev/null
echo "Pod environment (still the old value):"
kubectl exec app -- sh -c 'echo LOG_LEVEL=$LOG_LEVEL'
kubectl delete pod app --wait=true > /dev/null
kubectl apply -f pod.yaml > /dev/null
kubectl wait --for=condition=Ready pod/app --timeout=60s > /dev/null
echo "New Pod environment:"
kubectl exec app -- sh -c 'echo LOG_LEVEL=$LOG_LEVEL'
```

The running Pod kept `info`; the recreated Pod got `debug`. For Deployments, `kubectl rollout restart deployment/NAME` does the replacement gracefully.

:::recap
- ConfigMap for config, Secret for sensitive data. Inject as env vars or mounted files.
- Env vars are fixed at start; mounted files refresh, but apps must re-read them. Restart Deployments to apply env changes.
- A Secret is base64, not encryption: restrict access with RBAC, encrypt etcd, use external secret stores, never commit them.
:::

:::try Your turn
Create a Secret from a file, mount it read-only in a Pod, and verify the file permissions with `ls -l`. Then decode the Secret from the command line.
:::

:::quiz
? Is a Kubernetes Secret encrypted by default?
+ No, it is base64-encoded, which anyone with access can decode
- Yes, with AES
- Only in production
- Only when mounted
! Use RBAC, etcd encryption and external secret stores.
? You change a ConfigMap used via environment variables. What must happen for running Pods to see it?
+ The Pods must be restarted or recreated
- Nothing, it updates live
- Delete the node
- Recreate the namespace
! Mounted files update, but env vars do not.
? Why prefer mounting Secrets as files?
+ Environment variables leak more easily into logs and dumps
- Files are faster
- Env vars are not allowed
- Files are larger
! Also lets you set file permissions.
:::
