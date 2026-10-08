---
track: qbank
title: "CI/CD, Jenkins, Git, GitOps and Ansible: Basic questions (part 1 of 2)"
short: CI/CD basic 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## What is the difference between CI, CD and GitOps?

<!-- source: 04 Q1 -->

*Also asked as:* What is the difference between CI and CD? CI vs CD vs GitOps: explain all 3 with real-world examples.

:::note In simple words
CI is like a kitchen that tastes every new ingredient the moment it arrives. CD is the waiter who is always ready to carry the finished dish to the table - either after the manager says "go" (Delivery) or automatically (Deployment). GitOps is a written menu on the wall: a robot keeps checking that what is on every table matches the menu, and to change a dish you change the menu.
:::

- **Continuous Integration (CI):** every code push is automatically built and tested. Goal: catch bugs within minutes, keep the main branch always working.
- **Continuous Delivery:** every change that passes CI is packaged and deployable to production at any time, but the final push to prod needs a human approval.
- **Continuous Deployment:** same as Delivery, but with no human gate - if all tests pass, it goes to production automatically.
- **GitOps:** a way of doing CD where **Git is the single source of truth** for what should run. It is **pull-based**: an agent inside the cluster (Argo CD / Flux) continuously compares the cluster with Git and **reconciles** differences. Deploy = merge a commit; rollback = revert a commit; manual drift is undone automatically.

| Approach | What happens | Who decides prod release |
| --- | --- | --- |
| CI | build, unit test, lint, scan on every push | - |
| Continuous Delivery | package, deploy to staging, prod-ready | Human approval |
| Continuous Deployment | auto deploy to prod | Pipeline (tests) |
| GitOps | agent pulls desired state from Git and syncs | Whoever merges the Git PR |

Real-world examples (smart-metering style project):
- **CI:** a developer changes the meter-data ingestion service; the PR triggers build, unit tests for the parser of meter readings, SonarQube and Trivy - the PR cannot merge until it is green.
- **Continuous Delivery:** the merged billing (MDMS) service image is deployed to staging automatically; the production release waits for the release manager's approval because it affects customer bills.
- **Continuous Deployment:** an internal Grafana dashboard or alert-rule change goes straight to production once validation passes - low risk, no approval.
- **GitOps:** the head-end (HES) services' Helm values live in a config repo; bumping the image tag in `envs/prod/values.yaml` through a PR makes Argo CD roll it out, and a `git revert` rolls it back.

**Example:**
```text
git push -> Jenkins: build + unit tests (CI)
         -> Docker image pushed to ECR, deployed to staging (CD)
         -> "Approve prod?" button (Continuous Delivery)
         -> or: PR bumps tag in gitops repo -> Argo CD syncs prod (GitOps)
```

:::say
CI means every commit is automatically built and tested so integration problems are caught early. Continuous Delivery keeps a deployable artifact ready with a manual approval before prod, while Continuous Deployment pushes to prod automatically when all checks pass. GitOps is a pull-based way to do CD where Git holds the desired state and an agent like Argo CD reconciles the cluster to it, so deploys and rollbacks are just Git commits.
:::

## What triggers your pipeline, and how do you trigger a Jenkins job automatically?

<!-- source: 04 Q2 -->

*Also asked as:* How do you trigger a job automatically in Jenkins?

:::note In simple words
A pipeline is like a doorbell-activated machine. Something has to press the bell - a code push, a pull request, a timer, another machine, or a person clicking a button.
:::

Common triggers:
- **Webhook on push / merge** to a branch (most common) - GitHub/GitLab/Bitbucket calls Jenkins.
- **Pull request opened/updated** - runs CI checks before merge.
- **Tag creation** (e.g. `v1.4.0`) - triggers a release build.
- **Build periodically (cron)** - nightly builds, security scans, cleanup jobs. `H/5 * * * *` = every 5 minutes; `H` spreads jobs so they do not all start at the same second.
- **Poll SCM** - Jenkins checks the repo on a schedule and builds only if there are new commits (fallback when GitHub cannot reach Jenkins).
- **Upstream/downstream** - job B runs after job A succeeds (`upstream` trigger, or `build job:` step from A).
- **Remote trigger** - "Trigger builds remotely" with an authentication token, or the REST API with a user API token, e.g. called from another system.
- **Manual** - "Build with Parameters" for hotfixes or prod deploys.

Note: cron builds even if nothing changed; Poll SCM builds only on new commits.

**Example:**
```groovy
pipeline {
  agent any
  triggers {
    githubPush()                              // webhook from GitHub
    cron('H 2 * * *')                         // nightly at ~2 AM
    pollSCM('H/5 * * * *')                    // check for commits every ~5 min
    upstream(upstreamProjects: 'build-lib', threshold: hudson.model.Result.SUCCESS)
  }
  stages { stage('Build') { steps { sh 'make build' } } }
}

# Remote trigger (job config: "Trigger builds remotely", token = deploy123)
curl -X POST -u priyanka:$API_TOKEN \
  "https://jenkins.example.com/job/orders/build?token=deploy123"
```

:::say
Our pipelines are mainly triggered by GitHub webhooks on push and pull requests - PRs run CI checks and merges to main trigger build and deploy to dev. Release tags trigger production builds, and we also have cron-triggered nightly scans. Prod deploys additionally need a manual approval.
:::

## What are webhooks?

<!-- source: 04 Q3 -->

:::note In simple words
Polling is you calling the pizza shop every 5 minutes asking "is it ready?". A webhook is the shop calling you when it is ready.
:::

A webhook is an HTTP POST request that one system sends to another when an event happens. In CI/CD, GitHub sends a webhook to Jenkins when someone pushes code or opens a PR. The payload (JSON) contains the repo, branch, commit ID, and author.

How to set it up:
1. In Jenkins install the GitHub plugin; in the job enable "GitHub hook trigger for GITScm polling".
2. In GitHub repo -> Settings -> Webhooks -> add `https://jenkins.company.com/github-webhook/`, content type JSON, choose events (push, pull request).
3. Add a secret token so Jenkins can verify the request really came from GitHub.

Benefits vs polling: instant builds, less load on Git server and Jenkins.

**Example:**
```
Payload URL : https://jenkins.example.com/github-webhook/
Content type: application/json
Secret      : <shared secret>
Events      : Push, Pull requests

# Test from GitHub: Settings -> Webhooks -> Recent Deliveries -> Redeliver
```

:::say
A webhook is an event-driven HTTP callback - when code is pushed, GitHub immediately POSTs the event to Jenkins, which starts the build. It is faster and lighter than polling. We secure it with a shared secret and make sure the Jenkins URL is reachable from GitHub.
:::

## What is a Jenkins agent (worker node)? Where does a pipeline run and where do you define agents?

<!-- source: 04 Q4 -->

*Also asked as:* Where does the Jenkins pipeline run? What is a worker node? Where do you define Jenkins worker nodes?

:::note In simple words
The Jenkins controller is the manager who hands out work. Agents are the workers who actually do the building. The manager should not be doing the heavy lifting.
:::

- **Controller (master):** stores job config, schedules builds, serves the UI. Ideally runs zero builds itself.
- **Agent (worker node):** a machine, VM, container or Kubernetes pod that connects to the controller and executes the pipeline steps. Each agent has **executors** (parallel build slots) and **labels** (e.g. `linux`, `docker`, `maven`).
- **Where defined:** Manage Jenkins -> Nodes (static agents via SSH or inbound JNLP agent), or Manage Jenkins -> Clouds (dynamic agents from Kubernetes plugin, EC2 plugin, Docker plugin).
- **In the Jenkinsfile** you choose which agent with the `agent` directive.

**Example:**
```groovy
pipeline {
  agent { label 'docker-linux' }          // run on any agent with this label
  stages {
    stage('Build') { steps { sh 'mvn -B package' } }
  }
}

// Dynamic pod agent on Kubernetes (Kubernetes plugin)
pipeline {
  agent {
    kubernetes {
      yaml '''
        apiVersion: v1
        kind: Pod
        spec:
          containers:
          - name: maven
            image: maven:3.9-eclipse-temurin-17
            command: ["sleep"]
            args: ["infinity"]
      '''
    }
  }
  stages { stage('Build') { steps { container('maven') { sh 'mvn -B package' } } } }
}
```

:::say
The pipeline runs on Jenkins agents, not on the controller. Agents are defined under Manage Jenkins -> Nodes for static machines, or under Clouds for dynamic ones like Kubernetes pods or EC2 instances. In the Jenkinsfile the agent directive with a label or a pod template picks where each stage runs.
:::

## How do you define and invoke pipelines in Jenkins?

<!-- source: 04 Q7 -->

:::note In simple words
Defining a pipeline is writing the recipe (Jenkinsfile). Invoking it is deciding what rings the kitchen bell - a code push, a timer, a button, or another recipe finishing.
:::

Defining:
- **Pipeline script from SCM (recommended):** create a Pipeline job, choose "Pipeline script from SCM", point to the repo and the path `Jenkinsfile`. The pipeline is versioned with the code.
- **Inline script:** pasted into the job UI - only for quick tests, not reviewable.
- **Multibranch Pipeline / Organization Folder:** Jenkins auto-creates jobs for every branch/PR/repo that has a Jenkinsfile.
- **Job DSL / Configuration as Code (JCasC):** create the jobs themselves from code, so even job setup is not click-ops.

Invoking:
- **Triggers:** webhook (`githubPush()`), `cron`, `pollSCM`, `upstream`.
- **Manual:** "Build Now" or "Build with Parameters" (`parameters {}` block).
- **From another pipeline:** `build job: 'deploy-app', parameters: [...]`.
- **Remotely:** REST API with a user API token, or the Jenkins CLI.

**Example:**
```groovy
pipeline {
  agent any
  parameters {
    choice(name: 'ENV', choices: ['dev', 'staging', 'prod'], description: 'Target')
    string(name: 'TAG', defaultValue: '', description: 'Image tag to deploy')
  }
  triggers { githubPush() }
  stages {
    stage('Deploy') {
      steps {
        build job: 'deploy-orders', wait: true,
              parameters: [string(name: 'ENV', value: params.ENV),
                           string(name: 'TAG', value: params.TAG)]
      }
    }
  }
}

# Remote trigger via REST API
curl -X POST -u priyanka:$API_TOKEN \
  "https://jenkins.example.com/job/deploy-orders/buildWithParameters?ENV=dev&TAG=1.4.0"
```

:::say
I define pipelines as a Jenkinsfile in the repo and create a Pipeline or Multibranch job that reads it from SCM, with the jobs themselves created through Job DSL or JCasC. They are invoked by GitHub webhooks, cron triggers, manual Build with Parameters, the build job step from another pipeline, or the REST API.
:::

## What are the types of jobs in Jenkins?

<!-- source: 04 Q8 -->

:::note In simple words
Jenkins job types are like different kinds of vehicles - a scooter (Freestyle) for quick simple trips, a truck with a written route (Pipeline), and a whole fleet that auto-assigns a truck to every branch (Multibranch).
:::

| Job type | What it is | When to use |
| --- | --- | --- |
| Freestyle | UI-configured steps (shell, build, post-build actions) | Simple one-off tasks; legacy jobs |
| Pipeline | Stages defined in a Jenkinsfile (inline or from SCM) | Standard CI/CD as code |
| Multibranch Pipeline | Auto-creates a Pipeline job per branch/PR with a Jenkinsfile | Feature branch + PR builds |
| Organization Folder | Scans a whole GitHub org/Bitbucket team, creates multibranch jobs per repo | Many repos, zero manual job creation |
| Folder | Container to group jobs, with folder-scoped credentials and permissions | Separate teams/environments |
| Multi-configuration (Matrix) | Runs the same build across combinations (OS x JDK) | Compatibility testing (Pipeline `matrix` is the modern way) |

Freestyle vs Pipeline: Freestyle config lives in the Jenkins UI (not versioned, hard to review, weak at complex flows); Pipeline is code in Git, supports parallel stages, approvals, resuming and shared libraries.

**Example:**
```
// Modern matrix instead of a Multi-configuration job
pipeline {
  agent none
  stages {
    stage('Test') {
      matrix {
        axes {
          axis { name 'JDK'; values '11', '17' }
          axis { name 'OS';  values 'linux', 'windows' }
        }
        agent { label "${OS}" }
        stages { stage('Run') { steps { echo "Testing JDK ${JDK} on ${OS}" } } }
      }
    }
  }
}
```

:::say
The main Jenkins job types are Freestyle, Pipeline, Multibranch Pipeline, Organization Folder, Folder, and Multi-configuration or matrix jobs. We mostly use Multibranch Pipelines and Organization Folders so every repo and branch with a Jenkinsfile gets its job automatically, and Folders to scope credentials and permissions per team; Freestyle is only for legacy or trivial tasks.
:::

## How do you configure GitHub in Jenkins for Freestyle and Pipeline jobs?

<!-- source: 04 Q9 -->

:::note In simple words
Jenkins needs two things from GitHub: a key to read the code (credentials) and a doorbell so GitHub can tell Jenkins "new code arrived" (webhook).
:::

Common setup (once):
1. Install **Git**, **GitHub** and **GitHub Branch Source** plugins.
2. Add credentials: a **GitHub App** (preferred - fine-grained, higher API limits, no personal account) or a **Personal Access Token** as Username/Password, or an SSH key for git clone.
3. Manage Jenkins -> System -> GitHub -> add GitHub Server with the credential, tick "Manage hooks" (optional, lets Jenkins create webhooks).
4. In the GitHub repo: Settings -> Webhooks -> `https://<jenkins>/github-webhook/`, JSON, push + PR events.

Freestyle job:
- Source Code Management -> Git -> repo URL + credentials + branch (`*/main`).
- Build Triggers -> tick **GitHub hook trigger for GITScm polling**.
- Build steps: Execute shell; post-build actions for reports/notifications.

Pipeline job:
- Definition -> **Pipeline script from SCM** -> Git -> repo URL + credentials -> Script Path `Jenkinsfile`.
- Tick "GitHub hook trigger for GITScm polling" (or `triggers { githubPush() }` in the Jenkinsfile).
- Multibranch: Branch Sources -> GitHub -> credential + repo; webhooks trigger re-scans automatically.

**Example:**
```
// Jenkinsfile checkout using the stored credential
checkout([$class: 'GitSCM',
  branches: [[name: '*/main']],
  userRemoteConfigs: [[url: 'https://github.com/org/orders-api.git',
                       credentialsId: 'github-app-creds']]])

# Verify: GitHub -> Settings -> Webhooks -> Recent Deliveries shows HTTP 200
```

:::say
I install the Git, GitHub and Branch Source plugins, add a GitHub App or PAT credential, and configure a webhook to jenkins-url/github-webhook. For Freestyle I set the Git repo in Source Code Management and tick GitHub hook trigger for GITScm polling; for Pipeline I choose Pipeline script from SCM with the Jenkinsfile path and the same trigger, or use a Multibranch job with a GitHub branch source.
:::

## How do you know the whole Jenkins pipeline actually executed successfully?

<!-- source: 04 Q10 -->

:::note In simple words
Like tracking a courier parcel - you look at every checkpoint scan (stages), the final "delivered" status, the photo proof (reports and artifacts), and you get an SMS at the end (notification).
:::

Evidence to check:
- **Build status/result:** SUCCESS, UNSTABLE (tests failed but build continued), FAILURE, ABORTED - a green ball is not enough if stages were skipped.
- **Stage View / Blue Ocean / Pipeline Graph View:** each stage shows passed, failed, or **skipped** (grey) - a skipped deploy stage means it did not run.
- **Console Output:** full log with timestamps (`timestamps()` option); Pipeline Steps view shows each step and its duration.
- **Test reports:** `junit` step shows test count and failures; coverage reports.
- **Artifacts / fingerprints:** `archiveArtifacts`, image tag in ECR, Helm release revision.
- **post blocks:** `always` / `success` / `failure` / `unstable` send notifications and publish results.
- **Notifications:** Teams/Slack/email with job, build number, commit and deployed version.
- **Deployment verification:** the pipeline itself runs `kubectl rollout status` or a smoke test, so "success" means the app is really healthy, not just "command ran".
- **Audit:** build history, Audit Trail plugin, who approved the input step.

**Example:**
```
post {
  success {
    office365ConnectorSend webhookUrl: env.TEAMS_HOOK,
      message: "SUCCESS ${env.JOB_NAME} #${env.BUILD_NUMBER} deployed ${env.TAG}"
  }
  unstable { echo 'Tests failed - check JUnit report' }
  failure  { echo "Failed at stage: ${env.STAGE_NAME}" }
  always   { junit 'reports/*.xml'; archiveArtifacts 'reports/**' }
}
stage('Verify') { steps { sh 'kubectl -n prod rollout status deploy/orders-api --timeout=5m' } }
```

:::say
I check the build result and the Stage View or Blue Ocean to confirm every stage ran and none was skipped, the console output and step timings, published JUnit and coverage reports, and archived artifacts or the pushed image tag. Post blocks send Teams or Slack notifications for success and failure, and the pipeline ends with a rollout status or smoke test so success really means the app is healthy.
:::

## What types of artifacts are generated in your pipeline?

<!-- source: 04 Q11 -->

:::note In simple words
An artifact is the finished product that comes off the assembly line - the thing you actually ship, not the raw code.
:::

Typical artifacts:
- **Docker images** pushed to ECR / Docker Hub / Artifactory, tagged with version + git SHA.
- **Helm charts** (packaged `.tgz`) pushed to a chart repo or OCI registry.
- **Binaries/packages:** `.jar`/`.war` (Java), `.zip` (Lambda), `.whl`, npm packages - stored in Nexus/Artifactory/S3.
- **Reports:** unit test reports (JUnit XML), code coverage, SonarQube results, Trivy scan reports, SBOM.
- **IaC outputs:** saved `terraform plan` files.

Key rule: **build once, deploy the same artifact everywhere** - dev, staging and prod all use the exact same image tag.

**Example:**
```
IMAGE=123456789012.dkr.ecr.ap-south-1.amazonaws.com/orders-api
TAG=1.4.0-${GIT_COMMIT:0:7}          # e.g. 1.4.0-a1b2c3d
docker build -t $IMAGE:$TAG .
docker push $IMAGE:$TAG
helm package charts/orders-api --version 1.4.0
archiveArtifacts artifacts: 'target/*.jar, reports/**', fingerprint: true
```

:::say
Our main artifacts are Docker images pushed to ECR, tagged with the release version and short git commit SHA, plus Helm charts, test and coverage reports, and security scan reports. We build the artifact once and promote the same immutable tag from dev to prod.
:::

## How do you handle build failures?

<!-- source: 04 Q13 -->

:::note In simple words
When the oven beeps "failed", you do not just press start again - you read the error, see which step burned, fix the cause, and make sure the cook gets told right away.
:::

1. **Fail fast and notify:** pipeline stops at the failing stage; `post { failure {...} }` sends a Teams/Slack/email message with the build link and commit author.
2. **Read the console log** of the failed stage - compilation error, failed test, dependency download, docker push, timeout.
3. **Classify:** code problem (dev fixes), test flakiness (quarantine + ticket), infra problem (agent disk full, network, credentials expired - DevOps fixes).
4. **Reproduce locally** with the same Docker build image so "works on my machine" is ruled out.
5. **Protect main:** branch protection requires a green build before merge, so failures stay on feature branches.
6. **Keep evidence:** archive test reports and logs; use `retry` only for known transient network steps, never to hide real failures.

**Example:**
```
post {
  failure {
    office365ConnectorSend webhookUrl: env.TEAMS_HOOK,
      message: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.GIT_COMMIT})"
  }
  always { junit 'target/surefire-reports/*.xml' }
}
stage('Download deps') {
  steps { retry(3) { sh 'mvn -B dependency:go-offline' } }   // transient network only
}
```

:::say
The pipeline fails fast and notifies the team with the build link. I check the failing stage log, classify it as code, test or infrastructure, and route it to the right owner. Branch protection keeps main green, and I only use retries for known transient network steps, never to hide real failures.
:::

## How do you store credentials securely in Jenkins?

<!-- source: 04 Q17 -->

*Also asked as:* How do you handle secrets in Jenkins pipelines?

:::note In simple words
Never write the house key on the door. Keep it in a locked key box (Jenkins Credentials store or a vault) and hand it to the worker only while they are working, then take it back.
:::

- Use the **Jenkins Credentials** store (Manage Jenkins -> Credentials): types like Username/Password, Secret text, SSH key, Secret file, AWS credentials. They are encrypted on disk.
- Scope them to a **folder** so only relevant jobs can use them.
- Access them in pipelines with `withCredentials` or `credentials()` - Jenkins masks the values in logs.
- Better: don't store long-lived cloud keys at all - use **IAM roles** on agents (EC2 instance profile / EKS IRSA) or fetch secrets at runtime from **HashiCorp Vault / AWS Secrets Manager** plugins.
- Restrict who can view/configure credentials with Role-Based Access (Role Strategy / Matrix Authorization).
- Never `echo` secrets, never put them in the Jenkinsfile or Git.

**Example:**
```groovy
pipeline {
  agent any
  environment { SONAR_TOKEN = credentials('sonar-token') }   // masked in logs
  stages {
    stage('Login') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'nexus-creds',
                          usernameVariable: 'U', passwordVariable: 'P')]) {
          sh 'echo "$P" | docker login nexus.example.com -u "$U" --password-stdin'
        }
      }
    }
  }
}
```

:::say
I store secrets in the Jenkins Credentials store, scoped per folder, and use them via withCredentials so they are masked in logs. For AWS I avoid static keys entirely and use IAM roles on the agents, and for application secrets we pull from Vault or Secrets Manager at runtime.
:::

## Azure DevOps: How do you enforce branch policies and PR validation in Azure Repos?

<!-- source: 04 Q18 -->

:::note In simple words
Branch policies are the rules at the door of the main branch: nobody walks in alone, someone must check your work, the robot must test it, and only a few trusted people have a key to skip the line.
:::

Set on the branch (Repos -> Branches -> main -> Branch policies), or across many repos at project level:
- **Require a minimum number of reviewers** (e.g. 2); optionally "reset votes when new changes are pushed" and "prohibit the most recent pusher from approving their own changes".
- **Check for linked work items:** every PR must link a Boards item (traceability).
- **Check for comment resolution:** all review comments must be resolved before merge.
- **Build validation:** a pipeline runs on every PR (build + tests + scans); the PR cannot complete unless it passes. Can be required or optional, with path filters, and expires after main changes.
- **Status checks:** external services (SonarQube, security scanners) post a status that must succeed.
- **Automatically included reviewers by path:** e.g. `/infra/*` requires the platform team, `/db/migrations/*` requires a DBA.
- **Limit merge types:** allow only squash merge (or rebase) to keep history clean.
- **Limit who can bypass:** the "Bypass policies when completing pull requests" and "Bypass policies when pushing" permissions should be given only to a small admin group, and their use audited. Direct pushes to main are blocked once policies are on.

**Example:**
```
# Build validation pipeline triggered by the PR policy (azure-pipelines-pr.yml)
trigger: none
pr: none                     # Azure Repos PRs are triggered by the branch policy
pool: { vmImage: ubuntu-latest }
steps:
- script: npm ci && npm run lint && npm test
- task: SonarQubePrepare@6
  inputs: { SonarQube: 'sonar-sc', scannerMode: 'CLI' }

# Add a required reviewer policy with the CLI
az repos policy required-reviewer create --repository-id $REPO_ID --branch main \
  --blocking true --enabled true --path-filter "/infra/*" \
  --required-reviewer-ids platform-team@company.com --message "Infra change"
```

:::say
I protect main with branch policies: minimum two reviewers with votes reset on new pushes, linked work items, all comments resolved, and a required build validation pipeline that runs build, tests and scans on every PR. External status checks like SonarQube, path-based required reviewers for infra or DB changes, squash-only merges, and very limited, audited bypass permissions complete it, so nothing reaches main without review and a green pipeline.
:::
