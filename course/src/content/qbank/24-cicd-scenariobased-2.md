---
track: qbank
title: "CI/CD, Jenkins, Git, GitOps and Ansible: Scenario-based questions (part 2 of 2)"
short: CI/CD scenario 2
sub: 6 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## A new deployment causes a CPU spike. How will you roll back and debug?

<!-- source: 04 Q74 -->

:::note In simple words
The new engine runs hot. Swap the old engine back in so the car keeps going, then put the new engine on a test bench to find which part overheats.
:::

Roll back / contain:
1. Confirm correlation: CPU spike starts at the deploy time; only new-version pods are hot (`kubectl top pods`, Grafana by version label).
2. If users are impacted (latency, errors, HPA maxed out, node pressure) -> **roll back immediately** (`helm rollback` / `rollout undo` / canary abort). Short-term alternative: scale out while deciding.
3. Verify CPU and latency return to baseline.

Debug the bad version (in staging or a single canary pod):
- **Diff the change:** code (new loop, regex, serialization, logging level set to DEBUG), dependency upgrade, config (thread pool, cache disabled, connection pool too small causing retries), resource limits changed (CPU throttling looks like high CPU).
- **Profile:** language profilers (async-profiler/JFR for Java, pprof for Go, py-spy), thread dumps to see hot threads; `top -H` inside the container.
- **Check traffic pattern:** retry storms, a new endpoint being called heavily, health checks too frequent.
- **Check GC:** memory leak -> constant garbage collection -> high CPU.
- **Load test** the fix before redeploying with canary.

Prevent: performance test stage in pipeline, canary analysis on CPU/latency, resource requests/limits set correctly, alerts on CPU vs baseline per version.

**Example:**
```text
kubectl -n prod top pods -l app=orders-api --sort-by=cpu
helm rollback orders-api -n prod        # or: kubectl argo rollouts abort orders-api
kubectl -n staging exec -it <new-pod> -- top -H -b -n 1 | head -20
kubectl -n staging exec <new-pod> -- jcmd 1 Thread.print > threads.txt   # Java thread dump
# Prometheus: CPU by version
sum by (version) (rate(container_cpu_usage_seconds_total{container="orders-api"}[5m]))
```

:::say
I confirm the CPU spike lines up with the deploy and only affects new-version pods, and if users are impacted I roll back or abort the canary immediately, then confirm CPU returns to baseline. I debug the new version in staging by diffing code, dependencies and config, profiling with thread dumps or a profiler, and checking for retry storms or GC pressure. Before redeploying I load-test the fix and add canary analysis on CPU and latency to the pipeline.
:::

## A deployment to staging failed during the DB-migration step and blocked all environments. What is your rollback plan?

<!-- source: 04 Q75 -->

:::note In simple words
A renovation stopped halfway through knocking down a wall. First stop all work so nobody makes it worse, look at exactly which bricks are already gone, then either put the wall back (restore) or finish the job carefully (fix forward). Next time, renovate one house at a time instead of making all houses wait on one.
:::

Immediate:
1. **Stop and lock:** abort the pipeline and lock promotion so nothing retries the migration or pushes this version to other environments.
2. **Check the actual DB state:** the migration tool's history table (Flyway `flyway_schema_history`, Liquibase `DATABASECHANGELOG`, Alembic `alembic_version`) - which migration failed, is it marked failed/dirty, was it partially applied? Check for leftover locks (`DATABASECHANGELOGLOCK`).
3. **Choose the recovery path:**
   - Migration ran inside a transaction and rolled back cleanly -> repair the history entry, fix the script, rerun.
   - Partially applied and the script is idempotent (`IF NOT EXISTS`) -> **fix forward**: correct the script and rerun.
   - Partially applied and not safe -> run the **down-migration**, or **restore the snapshot** taken before the migration.
4. **Roll the app back** to the previous version only if the schema is still compatible with it.
5. **Unblock other environments:** release the lock; dev and prod should not be waiting on staging.

Prevention:
- **Expand-contract (backward-compatible) migrations:** add new columns/tables first, switch the code, remove old ones in a later release - so old and new app versions both work.
- **Automatic pre-migration snapshot/backup** step.
- **Dry-run** migrations against a prod-like copy (restored snapshot) in CI.
- **Decouple migrations into their own job/stage** per environment, run before the app deploy, with clear failure handling.
- **Per-environment pipelines and locks**, not one shared lock that blocks everything.
- Keep migrations small and transactional where the database supports it.

**Example:**
```
flyway -url=$STAGING_DB info            # state: Success / Failed / Pending
flyway -url=$STAGING_DB repair          # clean failed entry after fixing the script
liquibase --url=$STAGING_DB release-locks
alembic current ; alembic downgrade -1

# Pre-migration snapshot (RDS)
aws rds create-db-snapshot --db-instance-identifier staging-db \
  --db-snapshot-identifier pre-mig-$(date +%Y%m%d%H%M)

-- Idempotent, expand-style migration
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_ref VARCHAR(64);
```

:::say
I stop the pipeline and lock promotion, then check the migration history table to see exactly what was applied and whether it is marked failed or locked. If it rolled back cleanly I repair and rerun; if it is partially applied I either fix forward with an idempotent script or run the down-migration or restore the pre-migration snapshot, then release locks so other environments are unblocked. To prevent it I use expand-contract migrations, automatic snapshots, dry-runs against a prod-like copy, and a separate migration job per environment instead of one shared lock.
:::

## During a blue-green deployment, shifting traffic to green caused a spike in errors. What do you check and fix?

<!-- source: 04 Q76 -->

:::note In simple words
You moved the audience to the new stage and people started complaining. Move them back to the old stage right away (it is still ready), then check what the new stage was missing - lights not warmed up, wrong script, not enough seats.
:::

Immediately: **shift traffic back to blue** (listener / target group / Service selector / slot swap). Blue is still running, so this is fast. Confirm errors drop. Then investigate green without users on it:

1. **Readiness vs real warm-up:** health check passed but the app was cold - empty caches, JIT not warmed, connection pools not filled, lazy loading on first request.
2. **Health check path vs real path:** `/health` returns 200 but does not test the DB, cache or downstream APIs that real requests need.
3. **Config/secret/env diff:** compare blue vs green env vars, ConfigMaps, secrets, feature flags and endpoints (e.g. green pointing to a wrong DB or missing a secret).
4. **DB schema compatibility:** green expects a migration that was not applied, or a migration broke blue/green coexistence.
5. **Sessions:** in-memory sessions or sticky cookies bound to blue are lost -> users logged out or 401/500 errors. Use a shared session store (Redis).
6. **Capacity:** green scaled smaller than blue (fewer replicas, smaller instances, HPA min too low) -> overload at 100% traffic.
7. **Downstream limits:** third-party rate limits, IP allowlists that only include blue's egress IPs, security groups, connection storms to the DB (max connections).
8. **Logs, metrics and traces by version:** which endpoints and error codes (5xx vs 4xx) appear only on green.

Prevention:
- Do a **canary step first** (1-10% to green) before 100%.
- **Automated analysis and rollback:** Argo Rollouts blue-green with pre/post-promotion analysis, CodeDeploy with CloudWatch alarms.
- **Pre-warm** green (synthetic traffic, cache warm-up) and match its capacity to blue.
- Deep health checks, config parity checks, externalized sessions.

**Example:**
```bash
# ALB: send traffic back to blue
aws elbv2 modify-listener --listener-arn $LISTENER \
  --default-actions Type=forward,TargetGroupArn=$TG_BLUE

# K8s: flip the Service back
kubectl patch svc orders -p '{"spec":{"selector":{"app":"orders","version":"blue"}}}'

# Compare config and capacity
diff <(kubectl get deploy orders-blue -o jsonpath='{.spec.template.spec.containers[0].env}') \
     <(kubectl get deploy orders-green -o jsonpath='{.spec.template.spec.containers[0].env}')
kubectl get hpa orders-blue orders-green
```

:::say
First I shift traffic back to blue, which is still running, and confirm errors drop. Then I check green offline: whether it was really warmed up or only passed a shallow health check, config and secret differences from blue, database schema compatibility, lost sessions or sticky cookies, whether green had the same capacity, and downstream rate limits or IP allowlists. To prevent it I add a canary step before full cutover, automated analysis with Argo Rollouts or CodeDeploy alarms, pre-warming and deep health checks.
:::

## How do you know your last deploy was actually successful? Monitoring? Business metrics? Or silence?

<!-- source: 04 Q77 -->

:::note In simple words
A green pipeline only means the parcel left the warehouse. Success means the customer received it and is happy. And "nobody complained" is not proof - maybe the phone line is broken.
:::

Pipeline green is not success. Layers of evidence, from technical to business:
1. **Rollout completed:** `kubectl rollout status`, all new pods Ready, no restarts; Helm/Argo CD status Healthy and Synced.
2. **Smoke tests and synthetic checks** right after deploy: hit key endpoints and user journeys (login, checkout) - part of the pipeline, fail = rollback.
3. **Golden signals before vs after** (and canary vs baseline): error rate, p95/p99 latency, traffic, saturation (CPU, memory, DB connections). Automate with **Argo Rollouts AnalysisTemplate**, **CodeDeploy alarms** or **Kayenta**-style canary analysis.
4. **Business KPIs:** checkouts per minute, successful logins, payments processed, orders created, meter reads processed - a deploy can be technically healthy but break a business flow.
5. **Log error-rate diff:** new error messages or exception types appearing after the deploy (Loki/ELK query by version).
6. **Deploy annotations on Grafana dashboards** so every graph shows exactly when the deploy happened.
7. **SLO / error-budget burn alerts:** a fast burn right after a deploy = likely bad deploy.
8. **Track DORA metrics:** change failure rate and time to restore tell you how often "successful" deploys really were not.

Silence is not evidence: verify the alerting path itself works - alert rules loaded, Alertmanager/contact points healthy, notification templates valid, a test alert or heartbeat (dead man's switch) arriving in Teams/Slack. A broken notification channel looks exactly like "everything is fine".

**Example:**
```text
kubectl -n prod rollout status deploy/orders-api --timeout=5m
curl -fsS https://api.example.com/health/deep && ./smoke-tests.sh prod

# Error rate new version vs before (PromQL)
sum(rate(http_requests_total{app="orders",code=~"5.."}[5m]))
  / sum(rate(http_requests_total{app="orders"}[5m]))

# Argo Rollouts analysis (fragment)
kind: AnalysisTemplate
spec:
  metrics:
  - name: error-rate
    successCondition: result[0] < 0.01
    provider:
      prometheus:
        query: sum(rate(http_requests_total{app="orders",code=~"5.."}[5m])) /
               sum(rate(http_requests_total{app="orders"}[5m]))

# Heartbeat alert: always firing, proves the alert pipeline is alive
- alert: Watchdog
  expr: vector(1)
```

:::say
A green pipeline only proves the deploy ran, so I verify in layers: rollout status and readiness, post-deploy smoke and synthetic tests, golden signals compared before and after or canary versus baseline with automated analysis, business KPIs like logins or orders, log error diffs, deploy annotations on dashboards and error-budget burn alerts, and we track change failure rate. I never treat silence as success - I make sure the alerting path itself works with heartbeat alerts and tested notification channels.
:::

## You notice a sudden spike in failed deployments. How would you investigate?

<!-- source: 04 Q78 -->

:::note In simple words
If suddenly many parcels are failing delivery, you do not check each parcel one by one. You sort them into piles - by city, by truck, by day - and find the one thing they have in common: a closed road, a broken truck, or a new wrong address label.
:::

1. **Quantify and categorize** the failures by **stage** (build, push, deploy, health check), **service**, **environment**, **agent/runner** and **time**. A spike across many services at the same stage means a shared cause; one service means that service's own change.
2. **Find the common change** around when it started:
   - a **pipeline template / shared library** version bump;
   - a new **base image** or dependency version (broken upstream release);
   - an **agent/runner image update** (tool versions changed, e.g. new Helm or kubectl);
   - an **expired credential**, certificate or service connection (OIDC trust, token, registry password);
   - an outage of a **dependency registry** (npm, Maven Central, Docker Hub rate limits, ECR);
   - cloud **quota** or API rate limits;
   - **cluster capacity** (pods Pending, no nodes, IP exhaustion) or a new admission policy (OPA/Kyverno rule rejecting manifests).
3. **Read the actual errors** from a few failures in each category - often they are the same message.
4. **Check trends:** DORA **change failure rate** and deployment frequency over recent weeks - a sudden jump points to a platform change; a slow rise points to quality or test gaps.
5. **Fix the common cause** (pin or roll back the template or agent image, rotate the credential, add a registry mirror, add capacity), then rerun the failed deploys.
6. **Add guardrails:** version-pinned templates and agent images rolled out gradually (canary pipelines), alerts on credential expiry, a pull-through cache for registries, capacity alerts, and a dashboard of deploy failures by stage so the next spike is spotted in minutes.

**Example:**
```
# GitHub Actions: failed runs since yesterday, grouped by workflow
gh run list --status failure --created ">=2026-09-23" --limit 200 \
  --json workflowName,createdAt | jq 'group_by(.workflowName)
  | map({wf: .[0].workflowName, fails: length})'

# Kubernetes side: are deploys failing on capacity or policy?
kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp | tail -30
kubectl get pods -A --field-selector status.phase=Pending

# Change failure rate = failed deployments / total deployments (per week)
```

:::say
I categorize the failures by stage, service, environment, agent and time to see whether it is one service or a shared cause, then look for the common change - a pipeline template or agent image update, a new base image, an expired credential or service connection, a registry outage, quota, or cluster capacity and admission policies. I confirm with the actual error messages and the change failure rate trend, fix the shared cause and rerun, then add guardrails like pinned templates and agent images, credential-expiry alerts, registry caching and a deploy-failure dashboard.
:::

## Jenkins is failing to push a Docker image to the registry. How do you troubleshoot?

<!-- source: 04 Q79 -->

:::note In simple words
A delivery van can't drop a parcel at the warehouse. Is the van's permit expired (auth), is it at the wrong address (tag/repo name), is the road blocked (network), or is the warehouse refusing that parcel (permissions, immutable tags, size)?
:::

1. **Read the exact error in the console log.** It usually points straight at the layer:
   - `unauthorized` / `denied` / `no basic auth credentials` -> authentication. ECR login tokens expire after **12 hours**, so run `aws ecr get-login-password` in the pipeline every time; the Jenkins credential or IAM role may be wrong or expired.
   - `denied: ... not authorized to perform ecr:InitiateLayerUpload` -> the IAM policy is missing push actions (`ecr:PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `BatchCheckLayerAvailability`).
   - `name unknown` / `repository does not exist` -> ECR needs the repo created first (Terraform it), or the tag doesn't include the full registry prefix.
   - `tag invalid: ... already exists` -> **immutable tags** are enabled, so use unique tags (the Git SHA or build number).
   - `i/o timeout` / `TLS handshake timeout` -> network: proxy, DNS, security group egress, or missing VPC endpoints (`ecr.api`, `ecr.dkr`, S3) for private agents.
2. **Agent side:** is the Docker daemon running, and does the `jenkins` user have socket permissions (`permission denied ... docker.sock`)? Is there disk space for layers (`docker system df`)?
3. **Image size and timeouts:** huge layers on slow links, so optimise the image and retry.
4. **Reproduce manually** on the same agent as the same user, to separate a pipeline problem from an environment problem.

**Example:**
```groovy
stage('Push') {
  steps {
    withAWS(role: 'jenkins-ecr-push', region: 'ap-south-1') {
      sh '''
        REG=123456789012.dkr.ecr.ap-south-1.amazonaws.com
        aws ecr get-login-password | docker login --username AWS --password-stdin $REG
        docker tag meter-api:${GIT_COMMIT} $REG/meter-api:${GIT_COMMIT}
        docker push $REG/meter-api:${GIT_COMMIT}
      '''
    }
  }
}
```

```bash
# manual checks on the agent, as the jenkins user
sudo -u jenkins docker info >/dev/null && echo "daemon ok"
aws sts get-caller-identity
aws ecr describe-repositories --repository-names meter-api
nc -zv 123456789012.dkr.ecr.ap-south-1.amazonaws.com 443
```

:::say
I read the exact push error first because it tells me the layer. Unauthorized means an expired ECR token or wrong credentials, so I log in freshly each run with the IAM role. AccessDenied on upload actions means the IAM policy. "Repository does not exist" or a tag conflict means the repo isn't created or tags are immutable. Timeouts mean proxy, DNS or missing VPC endpoints. I also check that the Docker daemon, socket permissions and disk on the agent are fine, and reproduce the push manually as the jenkins user.
:::
