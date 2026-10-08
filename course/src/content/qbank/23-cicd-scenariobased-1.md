---
track: qbank
title: "CI/CD, Jenkins, Git, GitOps and Ansible: Scenario-based questions (part 1 of 2)"
short: CI/CD scenario 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## The Jenkins controller goes down while builds are running on agents. What happens and what do you do?

<!-- source: 04 Q62 -->

:::note In simple words
If the manager faints, the workers keep their tools in hand for a little while, but nobody is recording their work or giving next instructions. When the manager wakes up, Pipeline jobs can often pick up where they left off; Freestyle jobs are simply lost.
:::

What happens:
- Agents lose their connection (remoting channel) to the controller.
- **Freestyle jobs** running on agents fail/abort - their state lived on the controller.
- **Declarative/Scripted Pipelines are durable**: state is checkpointed to disk on the controller. After restart, pipelines **resume**; an `sh` step already running on an agent can continue if the agent and workspace survive (durable task). Some steps may still fail and need a rerun.
- No new builds are scheduled; webhooks received during downtime are missed (need re-scan / redeliver).

What I do:
1. Restore the controller: check the service/pod (`systemctl status jenkins` or `kubectl get pod`), logs, disk, memory (OOM is common), then restart.
2. Check which builds resumed vs failed; rerun failed ones; redeliver missed GitHub webhooks or trigger a branch re-scan.
3. Make sure a half-finished deploy did not leave prod inconsistent (check Helm/rollout status).

Prevent:
- Run the controller on Kubernetes/EC2 with persistent `JENKINS_HOME` (EBS/EFS) so it auto-restarts; back up `JENKINS_HOME` (thinBackup / volume snapshots).
- Configuration as Code (JCasC) + jobs in Git so a new controller can be rebuilt fast.
- Monitor the controller (Prometheus plugin, heap, disk) and set pipeline `durabilityHint` appropriately.
- Deploy steps should be idempotent (`helm upgrade --install --atomic`) so a rerun is safe.

**Example:**
```text
kubectl -n jenkins get pods
kubectl -n jenkins logs jenkins-0 --previous | tail -50   # why did it die? OOMKilled?
kubectl -n jenkins describe pod jenkins-0 | grep -i -A3 "last state"

options { durabilityHint('MAX_SURVIVABILITY') }   // strongest resume guarantees
```

:::say
Agents lose their connection; Freestyle jobs are lost, but Pipelines are durable and usually resume after the controller restarts, though some steps may need a rerun. I restore the controller, check resumed versus failed builds, rerun and redeliver missed webhooks, and verify no deployment was left half-done. To prevent it we run Jenkins with persistent storage and auto-restart, JCasC for fast rebuild, backups and monitoring.
:::

## The Jenkins master (controller) is running out of disk space. What actions would you take?

<!-- source: 04 Q63 -->

*Also asked as:* If Jenkins storage is full, how would you troubleshoot it?

:::note In simple words
Jenkins keeps every old receipt, log and leftover box forever unless told not to. First throw away the obvious junk to get breathing room, then set rules so the junk does not pile up again.
:::

Immediate (get space back safely):
1. Find what is big: `du` on `JENKINS_HOME` - usually `jobs/*/builds` (old build logs + artifacts), `workspace/`, `caches`, `logs`, or Docker images if builds run on the controller.
2. Delete old builds via Script Console or job config (not by randomly deleting folders while Jenkins runs).
3. Wipe old workspaces (`workspace/`), clean `/tmp`, rotate `jenkins.log`, `docker system prune` if Docker is on the controller.
4. If still critical, expand the EBS volume (online resize) to avoid an outage.

Long term:
- `buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))` on every job (enforce via shared library).
- **Don't build on the controller**: set controller executors to 0; builds on ephemeral agents.
- Store artifacts in S3/Nexus/Artifactory, not in Jenkins (`archiveArtifacts` only for small reports).
- `cleanWs()` in `post { always }`.
- Disk usage alert at 80% (Prometheus node exporter / CloudWatch agent).

**Example:**
```text
df -h /var/lib/jenkins
du -sh /var/lib/jenkins/* | sort -rh | head
du -sh /var/lib/jenkins/jobs/*/builds | sort -rh | head

// Script Console: keep only last 20 builds for every job
Jenkins.instance.getAllItems(Job).each { job ->
  job.builds.drop(20).each { it.delete() }
}

options { buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5')) }
```

:::say
I first find what is consuming space in JENKINS_HOME - usually old builds, artifacts and workspaces - and safely delete old builds through the Script Console, clean workspaces and logs, and expand the volume if it is critical. Long term I enforce build discarders on all jobs, run zero executors on the controller, store artifacts in S3 or Nexus, clean workspaces after each build, and alert on disk at 80 percent.
:::

## Build artifacts are not getting uploaded to the artifact repository, or Jenkins jobs fail randomly at the artifact upload step. How do you investigate?

<!-- source: 04 Q64 -->

*Also asked as:* Jenkins jobs are randomly failing at the artifact upload step. What layers would you check?

:::note In simple words
Uploading a parcel can fail because of the sender (the build), the road (network), the gatekeeper (credentials/permissions), or the warehouse (the repository is full or broken). Check each layer in order.
:::

Layers to check:
1. **Build layer:** did the artifact actually get produced? Wrong path/pattern, artifact built in another stage's workspace or another agent (use `stash/unstash`).
2. **Credentials/auth:** expired token or password, ECR token expired (12h), IAM role missing `ecr:PutImage`/`s3:PutObject`, KMS permission for encrypted bucket. Intermittent -> token expiring mid-build or different agents with different roles.
3. **Network:** DNS resolution, proxy, firewall/SG, NAT gateway limits, timeouts on large files, TLS certificate errors. Random failures often = specific agents in a subnet without the right route.
4. **Repository side:** Nexus/Artifactory disk full, repo read-only, version already exists (release repo disallows redeploy, ECR tag immutability), rate limiting (429), 5xx during repo maintenance.
5. **Agent resources:** agent disk full (cannot stage upload), OOM killing the upload process.
6. **Size/timeouts:** very large artifacts hit proxy or client timeouts - use multipart upload, increase timeouts.

Fix pattern: read the exact error code (401/403 auth, 404 path, 409 conflict/exists, 413 too large, 429 rate limit, 5xx server), correlate failures with agent name and time, add `retry` with backoff only for transient 5xx/network errors, and add monitoring on the repository.

**Example:**
```
sh 'ls -lh target/*.jar'                                  # artifact exists?
sh 'aws sts get-caller-identity'                          # which identity is used?
sh 'curl -sv https://nexus.example.com/service/rest/v1/status 2>&1 | tail -20'

retry(3) {
  sh 'mvn -B deploy -DskipTests'                          # transient errors only
}
// Correlate: failed builds -> which agent? env.NODE_NAME
echo "Running on ${env.NODE_NAME}"
```

:::say
I check layer by layer: whether the artifact was really produced at that path, then credentials and IAM permissions including expiring tokens, then network - DNS, proxy, security groups and timeouts, then the repository itself for disk, immutability conflicts, rate limits or 5xx errors, and finally agent disk and memory. For random failures I correlate them with the agent name and time, read the HTTP status code, and only add retries with backoff for genuine transient errors.
:::

## A Jenkins pipeline fails randomly after long runs. How do you find the root cause?

<!-- source: 04 Q65 -->

:::note In simple words
If a marathon runner collapses only after 2 hours, the problem is usually stamina (memory), running out of water (disk), or the race timer (timeouts and expiring passes) - not their shoes.
:::

Common causes of "fails only on long runs":
- **Expired credentials:** AWS STS session (1h default), ECR token, Kubernetes token, OAuth token expiring mid-build.
- **Timeouts:** pipeline `timeout`, agent connection timeouts, load balancer/proxy idle timeouts cutting a long quiet `sh` step, SSH keepalive.
- **Agent problems:** Kubernetes pod agent evicted/OOMKilled, spot instance reclaimed, agent disk filling with logs/temp files, agent disconnected (ping thread timeout).
- **Controller pressure:** heap exhaustion or GC pauses under long heavy logs.
- **Resource leaks:** test processes, Docker containers, file descriptors piling up.
- **External dependencies:** rate limits, DB connections timing out.

How to find it:
1. Collect several failed runs: same stage? same agent? same duration (e.g. always ~60 min = token expiry)?
2. Read the error at the exact failure point and the agent log (`Manage Jenkins -> Nodes -> agent -> Log`).
3. Check agent pod events (`kubectl describe pod` - OOMKilled/Evicted) or EC2 spot interruption notices.
4. Check controller logs and JVM heap/GC metrics.
5. Reproduce with a debug run; add `timestamps()` to see where time goes.

Fixes: refresh credentials per stage (assume role with longer duration or re-login), right-size agent resources, use on-demand agents for long jobs, add keepalive output for quiet steps, split long jobs into stages or parallel shards, cleanup in `post`.

**Example:**
```text
kubectl -n jenkins get events --sort-by=.lastTimestamp | grep -i -E "oom|evict|kill"
aws sts assume-role --role-arn $ROLE --role-session-name ci --duration-seconds 14400
stage('Push') {
  steps { sh 'aws ecr get-login-password | docker login -u AWS --password-stdin $ECR' } // re-login
}
```

:::say
I look for a pattern across failures - same stage, same agent, or same elapsed time, since a failure around 60 minutes usually means an expired STS or registry token. Then I check agent logs and pod events for OOMKilled, eviction or spot interruption, controller heap, and network idle timeouts. Fixes include refreshing credentials per stage, right-sizing agents, on-demand agents for long jobs, keepalive output, and splitting the job into smaller parallel stages.
:::

## The Jenkins pipeline runs, but the build does not actually happen. What could be wrong?

<!-- source: 04 Q66 -->

:::note In simple words
The oven turned on but no cake came out. Maybe the recipe said "only bake on Sundays" (a when condition), there was no cook available (no agent), or someone rang the wrong kitchen's bell (the webhook hit a different job).
:::

Possible causes and checks:
- **`when` conditions / branch filters skip stages:** `when { branch 'main' }` but the build is on `feature/x` or a PR (`BRANCH_NAME` is `PR-12`); stages show grey "skipped" in Stage View.
- **No agent / executors:** wrong `agent { label 'docker' }` label, agents offline, all executors busy - build sits in queue "Waiting for next available executor".
- **Webhook or polling hits the wrong job:** repo URL in job does not exactly match the webhook payload (https vs ssh, `.git`), branch spec `*/master` vs `main`, so Jenkins "sees" no changes.
- **Empty changeset:** Poll SCM found no new commits, or a path/`changeset` condition excludes the changed files; monorepo change detection skipping every service.
- **Cached/stale workspace:** old checkout, `git diff` against wrong base, build tool says "up-to-date" and skips.
- **Script approval / sandbox:** Groovy method not approved (`Scripts not permitted to use method...`) - pipeline stops early.
- **Parameters:** default parameter values like `SKIP_BUILD=true` or empty `TAG`; first run of a parameterized pipeline uses defaults.
- **Script bug:** `sh` returns 0 even though it did nothing (`set -e` missing, `|| true`), wrong working directory (`dir()`).

Debug order: open Stage View (which stages skipped) -> console log -> `echo` key variables (`BRANCH_NAME`, `CHANGE_ID`, params) -> check queue/agents -> check webhook deliveries and job SCM config -> Script Approval page.

**Example:**
```groovy
stage('Debug') {
  steps {
    echo "BRANCH=${env.BRANCH_NAME} PR=${env.CHANGE_ID} NODE=${env.NODE_NAME}"
    echo "PARAMS=${params}"
    sh 'git log -1 --oneline && git status'
  }
}
sh '''
  set -euo pipefail          # fail loudly instead of silently doing nothing
  make build
'''
```

:::say
I open the Stage View to see which stages were skipped - often a when branch condition, or a PR build where the branch name is different. Then I check the queue for missing agent labels or executors, the webhook and job SCM config for repo or branch mismatches, empty changesets or stale workspaces, pending script approvals, and default parameter values. Echoing the branch, parameters and node, and using set -e in shell steps, makes the cause obvious quickly.
:::

## Jenkins credentials were exposed accidentally. What is your immediate action plan?

<!-- source: 04 Q67 -->

:::note In simple words
If you lose your house key, you do not first investigate how you lost it - you change the locks right now, then check if anyone entered, then figure out how it happened.
:::

Immediate (minutes):
1. **Revoke/rotate** the exposed secret at the source: deactivate the AWS access key, regenerate GitHub token, change DB password, rotate API key. Update the Jenkins credential with the new value.
2. **Contain:** if a cloud key, attach a deny-all policy or disable the IAM user; revoke active sessions (`aws iam` revoke older sessions for roles).
3. **Remove the exposure:** delete the log/build output, purge from Git history (`git filter-repo` / BFG) and force push, remove public paste/screenshot; note: Git history purging does not un-leak it - rotation is what matters.

Investigate (hours):
4. Check **CloudTrail / audit logs** for usage of the key since the exposure time (unknown IPs, new IAM users, EC2 instances in odd regions, S3 downloads).
5. Check Jenkins audit trail: who could see it, which jobs used it.
6. Clean up any attacker-created resources.

Prevent:
7. Mask secrets (`withCredentials`), never echo; enable secret scanning (gitleaks, GitHub push protection); replace static keys with IAM roles/OIDC; restrict credential permissions by folder; blameless postmortem.

**Example:**
```bash
aws iam update-access-key --user-name ci-user --access-key-id AKIA... --status Inactive
aws iam create-access-key --user-name ci-user          # only if a key is truly needed
aws cloudtrail lookup-events --lookup-attributes \
  AttributeKey=AccessKeyId,AttributeValue=AKIA... --max-results 50
git filter-repo --replace-text secrets-to-remove.txt
```

:::say
First I revoke or rotate the credential at the source immediately and update Jenkins with the new one, then remove the exposure from logs and Git history, knowing rotation is what actually protects us. Next I check CloudTrail and audit logs for any misuse since the exposure and clean up anything suspicious. Finally I prevent recurrence with masking, secret scanning with push protection, IAM roles instead of static keys, and a blameless postmortem.
:::

## CI/CD logs show flaky tests breaking the pipeline. How do you handle them?

<!-- source: 04 Q68 -->

:::note In simple words
A flaky test is a smoke alarm that goes off randomly. If you ignore it, people stop trusting all alarms. Take it off the wall, fix it, then put it back - do not just remove the batteries forever.
:::

1. **Confirm it is flaky:** same commit passes and fails on rerun. Track failure rates per test (JUnit history, Flaky Test Handler plugin, test analytics).
2. **Quarantine:** move known flaky tests into a separate non-blocking suite/tag so the main pipeline stays trustworthy - with a ticket and an owner, and a deadline.
3. **Find the root cause** - common ones:
   - timing: `sleep` instead of waiting for a condition, async code, timeouts too tight.
   - shared state: tests depend on order, shared DB rows, fixed ports, parallel tests clashing.
   - external dependencies: real network calls, third-party APIs -> use mocks/test containers.
   - environment: time zones, random seeds, low agent resources.
4. **Fix and bring back** into the blocking suite.
5. Limited `retry` for a known unstable integration step is okay short-term, but never blanket-retry the whole test stage - it hides real bugs.
6. Make metrics visible: flaky count on a dashboard, a "no new flaky tests" rule.

**Example:**
```text
# Run tests in random order to expose order dependence
mvn test -Dsurefire.runOrder=random
pytest -p randomly --count=20 tests/test_orders.py   # repeat to confirm flakiness

stage('Tests') {
  steps { sh 'mvn -B test -Dgroups=!quarantine' }          // blocking suite
}
stage('Quarantined tests') {
  steps { catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
    sh 'mvn -B test -Dgroups=quarantine' } }               // non-blocking
}
```

:::say
I first confirm flakiness by rerunning the same commit and tracking failure rates, then quarantine the flaky tests into a non-blocking suite with an owner and ticket so the main pipeline stays trustworthy. The root cause is usually timing, shared state, test ordering or external dependencies, which we fix with proper waits, isolation and mocks before bringing the test back. I avoid blanket retries because they hide real bugs.
:::

## A GitHub Actions workflow is stuck in "pending" or "queued" state. How do you troubleshoot it?

<!-- source: 04 Q69 -->

:::note In simple words
The job is waiting in line for a worker. Either no worker with the right badge exists, all workers are busy, or a gate (approval, concurrency lock) is holding it back.
:::

Checks in order:
1. **GitHub status page** - Actions outage or degraded service.
2. **`runs-on` label mismatch** - job asks for `self-hosted, linux, gpu` but no runner has all those labels -> waits forever ("Waiting for a runner to pick up this job").
3. **Self-hosted runners offline/busy** - Settings -> Actions -> Runners: offline, runner service stopped, runner in a group not allowed for this repo, autoscaler (ARC on Kubernetes) not scaling - check controller logs and pod pending reasons.
4. **Concurrency groups** - `concurrency:` with an older run in progress holds new ones pending.
5. **Environment protection rules** - job targeting `environment: production` waits for required reviewers or a wait timer.
6. **Usage limits** - concurrent job limits for the plan, spending limit reached for private repos, org policy disabling actions.
7. **Workflow approval** - first-time contributors from forks need approval to run.

Fix examples: correct labels, restart runner service, scale runner pool, cancel the stale run holding the concurrency lock, approve the deployment, raise limits.

**Example:**
```text
jobs:
  deploy:
    runs-on: [self-hosted, linux, x64]      # must match a registered runner's labels
    environment: production                 # may wait for reviewers
    concurrency:
      group: deploy-prod
      cancel-in-progress: false             # new runs wait until current one finishes

# Self-hosted runner checks
sudo ./svc.sh status
kubectl -n arc-runners get pods; kubectl -n arc-systems logs deploy/arc-gha-rs-controller
gh run list --status queued ; gh run cancel <run-id>
```

:::say
A pending job is waiting for a runner or a gate. I check the GitHub status page, then whether the runs-on labels match an online runner, whether self-hosted runners or the ARC autoscaler are healthy and allowed for the repo, then concurrency groups holding the run, environment approvals, usage or spending limits, and fork approval rules. Usually it is a label mismatch or offline runners.
:::

## Your team complains of deployment delays due to manual approvals. How would you automate this safely?

<!-- source: 04 Q70 -->

:::note In simple words
Instead of a manager personally checking every package, install good scanners and rules. If the scanner says everything is normal, the package goes through; the manager only looks at unusual ones.
:::

Replace human judgement with automated evidence:
- **Strong automated gates:** tests, coverage, SonarQube quality gate, security scans, policy checks (OPA/Conftest on manifests, Terraform plan checks) - if all pass, promotion is automatic.
- **Risk-based approvals:** auto-approve low-risk changes (config, small services, non-prod, standard changes) and keep a human approval only for high-risk ones (DB migrations, infra deletes, payment services).
- **Progressive delivery with automated rollback:** canary + metric analysis (Argo Rollouts, CodeDeploy alarms). If the canary looks bad it rolls back automatically, so the approval adds little.
- **Approve earlier in the flow:** code review on the PR is the approval; merge = approved to deploy (GitOps).
- **Deployment windows and change freezes** enforced by the tool, not by a person.
- **Audit trail:** every deploy logged with who merged, what changed, test results - satisfies compliance without waiting.
- **Make remaining approvals fast:** Teams/Slack approval buttons, approver groups instead of one person, timeouts with escalation.

**Example:**
```groovy
stage('Policy check') { steps { sh 'conftest test k8s/ -p policy/' } }
stage('Approval') {
  when { expression { env.RISK == 'high' } }       // only risky changes wait
  steps { timeout(time: 4, unit: 'HOURS') {
    input message: 'Approve high-risk deploy?', submitter: 'release-managers,sre-leads' } }
}
stage('Canary') { steps { sh 'kubectl argo rollouts set image orders app=$IMAGE' } }
```

:::say
I replace manual checks with automated evidence - tests, quality and security gates, and policy-as-code - and use canary deployments with automatic metric-based rollback. Then approvals become risk-based: low-risk changes promote automatically, and only high-risk changes like DB migrations need a human, via group approvers with Teams or Slack buttons. Everything is audited, so we meet compliance without the delay.
:::

## Your production pipeline is blocked due to missing approvals and stakeholders are unreachable. What will you do?

<!-- source: 04 Q71 -->

:::note In simple words
If the bank manager who signs cheques is on leave, you do not forge the signature. You follow the bank's backup rule - ask the deputy, or for a true emergency use the break-glass procedure that gets reviewed afterwards.
:::

1. **Assess urgency:** is it a normal release (can wait) or a production-fixing hotfix/security patch (cannot wait)?
2. **Normal release:** wait; communicate the delay; do not bypass the gate. Reschedule.
3. **Urgent:** follow the documented **escalation path** - backup approvers, on-call manager, delegate group. Approval should be to a group, not one person.
4. **Break-glass procedure** if defined: an emergency change path with a limited set of people, logged, and reviewed after (retro-approval / emergency CAB). Never share someone's login or edit the pipeline to remove the gate.
5. **Reduce risk of the change:** deploy the smallest possible fix, with canary and ready rollback, and monitoring watched live.
6. **Document everything:** who approved, why, timeline; inform stakeholders as soon as reachable.
7. **Fix the process:** add backup approvers, approval groups, SLA/timeout escalation, and define "standard changes" that can auto-approve.

**Example:**
```
input message: 'Approve PROD deploy?',
      submitter: 'release-managers,oncall-managers'   // group + backup, not one person

// Break-glass: separate job, restricted permission, forces an incident ticket
parameters { string(name: 'INCIDENT_ID', description: 'Required for emergency deploy') }
stage('Validate') { steps { script {
  if (!params.INCIDENT_ID?.trim()) { error 'Emergency deploy needs an incident ID' } } } }
```

:::say
I first judge urgency - a normal release simply waits and I communicate the delay, because bypassing controls is not an option. For an urgent fix I follow the escalation path to backup approvers or use the documented break-glass process, deploy the smallest change with canary and rollback ready, and log everything for retrospective approval. Afterwards I fix the process with approval groups, backups and escalation timeouts.
:::

## A pipeline deployment failed in production. How would you troubleshoot it step by step?

<!-- source: 04 Q72 -->

:::note In simple words
First make sure customers are safe (is the old version still serving?), then read the error message, then walk backwards: was it the package, the delivery truck, or the destination?
:::

1. **Check user impact first:** is production still serving the old version (failed rollout usually leaves old pods running) or is it broken? If broken -> roll back immediately, debug later.
2. **Find the failing stage and exact error** in the pipeline log: build, push, auth, Helm/kubectl, health check timeout.
3. **Pipeline/infra layer:** credentials/role expired, kubeconfig/context wrong, registry unreachable, Helm release stuck in `pending-upgrade`, Terraform lock.
4. **Deployment layer (Kubernetes):** `kubectl rollout status`, `get pods`, `describe pod` events - ImagePullBackOff (wrong tag/permissions), CrashLoopBackOff (app/config), Pending (resources/quota), readiness probe failing.
5. **Application layer:** pod logs - missing env var/secret/ConfigMap, DB migration failure, dependency unreachable.
6. **Compare with the last successful deploy:** diff image tag, Helm values, config, secrets, infra changes.
7. **Fix forward or roll back**, then rerun the pipeline; verify with smoke tests and metrics.
8. **RCA + prevention:** add the missing check to the pipeline (e.g. config validation, staging parity, `helm --atomic`).

**Example:**
```text
helm status orders-api -n prod ; helm history orders-api -n prod
kubectl -n prod rollout status deploy/orders-api
kubectl -n prod get pods -l app=orders-api
kubectl -n prod describe pod <pod> | tail -30
kubectl -n prod logs <pod> --previous
helm get values orders-api -n prod --revision 42 > old.yaml
helm get values orders-api -n prod --revision 43 > new.yaml ; diff old.yaml new.yaml
# Stuck release
helm rollback orders-api 42 -n prod
```

:::say
My first step is checking user impact - if production is broken I roll back immediately. Then I find the failing stage and exact error, and check layer by layer: pipeline credentials and tooling, Kubernetes rollout and pod events for image pull, crash or pending issues, then application logs, and I diff the failed release against the last good one. After fixing or rolling back, I verify with smoke tests and add a pipeline check so it cannot recur.
:::

## A production deployment caused downtime or an incident. How do you roll back and identify the root cause?

<!-- source: 04 Q73 -->

*Also asked as:* How would you handle a production incident caused by a faulty deployment?

:::note In simple words
When a new tyre makes the car wobble on the highway, you put the old tyre back first and get the car moving. Only after that do you study why the new tyre was bad.
:::

During the incident:
1. **Declare and communicate:** incident channel, incident commander, status update to stakeholders.
2. **Correlate:** deploy time vs when errors started (deploy markers on Grafana, alert timeline). If they match, suspect the deploy.
3. **Mitigate first - roll back:** `helm rollback` / `kubectl rollout undo` / git revert in the GitOps repo / swap Blue-Green back / canary weight to 0 / turn off the feature flag. Check DB migrations are backward compatible before rolling back code.
4. **Verify recovery:** error rate, latency, and business metrics back to normal; keep watching.
5. **Freeze further deploys** for that service until understood.

After the incident (RCA):
6. **Collect evidence:** diff between versions (code, config, Helm values, dependencies), logs, traces, metrics, pipeline logs.
7. **Reproduce in staging** with the bad version.
8. **5 Whys:** why did the bug exist, and why did the pipeline not catch it (missing test, staging different from prod, no canary)?
9. **Blameless postmortem** with timeline, impact, root cause, action items with owners (add tests, canary analysis, config validation, alerts).

**Example:**
```bash
kubectl -n prod rollout undo deploy/orders-api
kubectl -n prod rollout status deploy/orders-api
git log --oneline v1.4.0..v1.4.1            # what changed between releases
git diff v1.4.0 v1.4.1 -- charts/ config/
# Grafana annotation for deploy markers
curl -X POST -H "Authorization: Bearer $GRAFANA_TOKEN" -H "Content-Type: application/json" \
  https://grafana.example.com/api/annotations -d '{"tags":["deploy","orders"],"text":"v1.4.1"}'
```

:::say
I mitigate first: open an incident channel, correlate the deploy time with the error spike, and roll back through Helm, a GitOps revert, a Blue-Green switch or a feature flag, then confirm metrics recover and freeze further deploys. After that I diff the two versions, reproduce in staging, use 5 Whys to find both the bug and why the pipeline missed it, and write a blameless postmortem with owned action items like better tests or canary analysis.
:::
