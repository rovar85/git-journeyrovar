---
track: qbank
title: "CI/CD, Jenkins, Git, GitOps and Ansible: Advanced questions (part 1 of 2)"
short: CI/CD advanced 1
sub: 12 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Explain your CI/CD pipeline architecture, including approvals.

<!-- source: 04 Q39 -->

*Also asked as:* Describe the CI/CD workflow in your project. Explain your pipeline with CodePipeline/Jenkins and approvals.

:::note In simple words
Code travels on a conveyor belt through checkpoints: build, test, security scan, package, deploy to test rooms, and finally a manager signs off before it reaches customers.
:::

End-to-end flow (Jenkins + EKS example):
1. Developer opens a PR -> webhook triggers Jenkins multibranch job.
2. **CI stage:** checkout, build, unit tests, lint, SonarQube quality gate, dependency/secret scan.
3. On merge to main: Docker build, Trivy image scan, push to ECR with tag `version-gitsha`.
4. Deploy to **dev** automatically via Helm (or update the GitOps repo for ArgoCD).
5. Automated smoke/integration tests; promote the same image to **staging**.
6. **Manual approval** (Jenkins `input` with `submitter` restricted to release managers, or CodePipeline Manual Approval action with SNS email).
7. Deploy to **prod** with rolling/canary strategy; post-deploy health checks; auto-rollback on failure.
8. Notifications to Teams/Slack at each stage; metrics and logs watched in Grafana.

AWS-native equivalent: CodeCommit/GitHub -> CodePipeline -> CodeBuild (build/test/push ECR) -> Manual approval action -> CodeDeploy / EKS deploy.

**Example:**
```
Git PR --webhook--> Jenkins CI (build, test, Sonar, Trivy)
  --merge--> Docker build -> ECR (orders-api:1.4.0-a1b2c3d)
  --> Helm deploy DEV -> smoke tests
  --> Helm deploy STAGING -> integration tests
  --> [Manual Approval: release-managers] 
  --> Helm deploy PROD (rolling / canary) -> health check -> auto rollback if failed
```

:::say
PRs trigger CI in Jenkins - build, unit tests, SonarQube and security scans. Merges build an immutable Docker image pushed to ECR, auto-deploy to dev via Helm, run smoke tests, promote to staging, and then a restricted manual approval gates production, where we deploy with a rolling or canary strategy and automatic rollback on failed health checks.
:::

## Explain how a typical AWS-native CI/CD pipeline works end to end.

<!-- source: 04 Q40 -->

:::note In simple words
Think of an airport: check-in (source), security scan (build and test), boarding with a gate agent (approval), take-off in small groups (canary deploy), air traffic control watching the radar (monitoring), and the plane can turn back (rollback).
:::

1. **Source:** GitHub (via CodeStar/CodeConnections) or CodeCommit; a push or PR merge triggers CodePipeline through a webhook or EventBridge rule. S3 or ECR image push can also be a source.
2. **Build (CodeBuild or Jenkins):** `buildspec.yml` compiles, runs lint and unit tests, publishes test reports, builds the Docker image and pushes it to **ECR** (tag = commit SHA), or packages a zip to **S3**. Artifacts are versioned.
3. **Test and scan:** SonarQube quality gate, SCA/SAST, Trivy image scan, **Amazon Inspector** ECR scanning; integration tests in a test environment. Fail the pipeline on critical issues.
4. **Approval:** CodePipeline **Manual Approval** action (SNS email/Teams) before prod.
5. **Deploy:** **CodeDeploy** for EC2/ECS/Lambda (blue/green, canary `Canary10Percent5Minutes`, linear), **CloudFormation/CDK/Terraform** for infra, Helm/kubectl/ArgoCD for **EKS**, **SAM** for Lambda.
6. **Rollback:** versioned immutable artifacts; CodeDeploy auto-rollback on failed deployment or **CloudWatch alarm**; ECS deployment circuit breaker; Lambda alias shifting back.
7. **Monitoring:** CloudWatch metrics/logs/alarms, SNS notifications, X-Ray traces, pipeline state change events via EventBridge to Teams/Slack.
8. **Security:** each stage has its own least-privilege IAM role; secrets from **Secrets Manager / Parameter Store**; cross-account deploys via assume-role into prod account; artifacts encrypted with KMS.

Improvement over a basic answer: mention **multi-account** (tools account deploys to dev/prod accounts), **build once promote everywhere**, and **alarm-based automatic rollback**.

**Example:**
```
# buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login -u AWS --password-stdin $ECR
      - TAG=${CODEBUILD_RESOLVED_SOURCE_VERSION:0:7}
  build:
    commands:
      - npm ci && npm run lint && npm test
      - docker build -t $ECR/orders:$TAG .
  post_build:
    commands:
      - docker push $ECR/orders:$TAG
      - printf '[{"name":"orders","imageUri":"%s"}]' $ECR/orders:$TAG > imagedefinitions.json
reports:
  unit: { files: ['reports/junit.xml'], file-format: JUNITXML }
artifacts:
  files: [imagedefinitions.json, appspec.yaml, taskdef.json]
```

:::say
A push to GitHub triggers CodePipeline through a webhook or EventBridge; CodeBuild runs lint and unit tests, builds the image and pushes it to ECR with the commit SHA. Scans like SonarQube, Trivy and Inspector gate it, a manual approval guards prod, and CodeDeploy does blue-green or canary on ECS, EC2 or Lambda with automatic rollback on CloudWatch alarms. Each stage has least-privilege IAM roles, secrets come from Secrets Manager, and we monitor with CloudWatch, SNS and X-Ray.
:::

## What stages do you define in Jenkins, and how do you ensure full quality checks?

<!-- source: 04 Q41 -->

:::note In simple words
Quality checks are a series of filters - each one catches a different kind of dirt. Cheap and fast filters first, expensive ones later, and nothing reaches customers unless it passes all of them.
:::

Typical stages, fast to slow:

| Stage | Tool examples | Gate |
| --- | --- | --- |
| Checkout | git (shallow) | - |
| Lint / format | eslint, checkstyle, hadolint, tflint | fail on error |
| Unit tests | JUnit, pytest, jest | all pass |
| Coverage | JaCoCo, Istanbul | e.g. >= 80% on new code |
| SAST + quality | SonarQube / Semgrep | quality gate must pass |
| SCA (dependencies) | OWASP Dependency-Check, Snyk, Trivy fs | no CRITICAL |
| Secret scan | gitleaks | no findings |
| Build image | docker buildx | - |
| Image scan | Trivy, Inspector | no CRITICAL/HIGH fixable |
| Deploy dev + integration tests | Helm, Postman/newman, k6 | pass |
| Approval | input step / environment | authorized approver |
| Deploy prod + smoke test | Helm --atomic | healthy, else rollback |

How we enforce it:
- Gates **fail the build** (`abortPipeline: true`, `--exit-code 1`), not just report.
- Branch protection requires the checks before merge.
- The stages live in a **shared library**, so no team can quietly drop a check.
- Reports published (`junit`, coverage) so trends are visible.

**Example:**
```groovy
stage('Quality') {
  parallel {
    stage('Lint')    { steps { sh 'npm run lint' } }
    stage('Unit')    { steps { sh 'npm test -- --coverage' } }
    stage('Secrets') { steps { sh 'gitleaks detect --exit-code 1' } }
    stage('SCA')     { steps { sh 'trivy fs --severity CRITICAL --exit-code 1 .' } }
  }
}
stage('Sonar Gate') {
  steps {
    withSonarQubeEnv('sonar') { sh 'sonar-scanner' }
    timeout(time: 5, unit: 'MINUTES') { waitForQualityGate abortPipeline: true }
  }
}
```

:::say
Our stages go from fast to slow: lint, unit tests with a coverage gate, SonarQube quality gate, dependency and secret scanning, image build and Trivy scan, deploy to dev with integration tests, approval, and prod deploy with smoke tests. Every gate fails the build rather than just reporting, branch protection requires them before merge, and they live in a shared library so they cannot be skipped.
:::

## Write a CI/CD Jenkins pipeline that you have implemented in your project.

<!-- source: 04 Q42 -->

*Also asked as:* Walk me through a Jenkins pipeline you have written.

:::note In simple words
This is the full recipe card - every step the code goes through from GitHub to production on EKS.
:::

Key design points: runs on Kubernetes pod agents, AWS access via IAM role (no static keys), immutable image tags, quality gate and image scan before push, auto-deploy to dev, approval gate for prod, rollback on failure.

**Example:**
```groovy
pipeline {
  agent { label 'k8s-docker' }
  options {
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    timestamps()
  }
  environment {
    AWS_REGION = 'ap-south-1'
    ECR        = '123456789012.dkr.ecr.ap-south-1.amazonaws.com'
    APP        = 'orders-api'
    TAG        = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
  }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Build & Unit Test') {
      steps { sh 'mvn -B clean verify' }
      post { always { junit 'target/surefire-reports/*.xml' } }
    }
    stage('Code Quality') {
      steps {
        withSonarQubeEnv('sonar') { sh 'mvn -B sonar:sonar' }
        timeout(time: 5, unit: 'MINUTES') { waitForQualityGate abortPipeline: true }
      }
    }
    stage('Docker Build') { steps { sh 'docker build -t $ECR/$APP:$TAG .' } }
    stage('Image Scan') {
      steps { sh 'trivy image --exit-code 1 --severity CRITICAL,HIGH $ECR/$APP:$TAG' }
    }
    stage('Push to ECR') {
      when { branch 'main' }
      steps {
        sh '''
          aws ecr get-login-password --region $AWS_REGION |
            docker login --username AWS --password-stdin $ECR
          docker push $ECR/$APP:$TAG
        '''
      }
    }
    stage('Deploy DEV') {
      when { branch 'main' }
      steps {
        sh '''
          aws eks update-kubeconfig --name dev-eks --region $AWS_REGION
          helm upgrade --install $APP charts/$APP -n dev \
            --set image.tag=$TAG --wait --timeout 5m --atomic
        '''
      }
    }
    stage('Approve PROD') {
      when { branch 'main' }
      steps {
        timeout(time: 2, unit: 'HOURS') {
          input message: "Deploy $TAG to PROD?", submitter: 'release-managers'
        }
      }
    }
    stage('Deploy PROD') {
      when { branch 'main' }
      steps {
        sh '''
          aws eks update-kubeconfig --name prod-eks --region $AWS_REGION
          helm upgrade --install $APP charts/$APP -n prod \
            --set image.tag=$TAG --wait --timeout 10m --atomic
        '''
      }
    }
  }
  post {
    success { echo "Deployed ${env.TAG}" }
    failure { echo 'Send Teams/Slack failure alert with build URL' }
    always  { sh 'docker rmi $ECR/$APP:$TAG || true'; cleanWs() }
  }
}
```

:::say
Our Jenkinsfile runs on Kubernetes agents with an IAM role for AWS. It builds and unit-tests, enforces a SonarQube quality gate, builds a Docker image tagged with build number and commit SHA, scans it with Trivy, pushes to ECR, and deploys to dev with helm upgrade --atomic. Production needs an approval from release managers and uses the same image tag, with atomic Helm rollback if health checks fail.
:::

## What kinds of applications do you deploy through Jenkins, and with which deployment tools?

<!-- source: 04 Q43 -->

:::note In simple words
Different parcels need different delivery vans - a container goes by Helm truck to Kubernetes, a serverless function goes by SAM courier to Lambda, a server config goes by Ansible.
:::

| App type | Artifact | Deploy tool |
| --- | --- | --- |
| Containerized microservices (Java/Node/Go APIs) | Docker image in ECR | Helm / kubectl to EKS, or ArgoCD (GitOps) |
| ECS services | Docker image + task definition | CodeDeploy blue/green, `aws ecs update-service` |
| Serverless functions | zip in S3 | SAM / Serverless / Terraform to Lambda |
| Static frontends (React/Angular) | build folder | `aws s3 sync` + CloudFront invalidation |
| VM-based apps | jar/package | Ansible, CodeDeploy agent |
| Infrastructure | Terraform code / plan | `terraform plan` + approval + `apply` |
| Config / monitoring | dashboards, alert rules | Grafana API, Helm (kube-prometheus-stack) |

Why this matters: same pipeline template, different final deploy stage. Kubernetes apps prefer Helm with `--atomic` or ArgoCD because they give rollback history and drift correction.

**Example:**
```groovy
stage('Deploy Frontend') {
  steps {
    sh 'aws s3 sync build/ s3://web-prod-bucket --delete'
    sh 'aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"'
  }
}
stage('Deploy Lambda') { steps { sh 'sam deploy --stack-name reports --no-confirm-changeset' } }
stage('Deploy EKS')    { steps { sh 'helm upgrade --install api charts/api --set image.tag=$TAG --atomic' } }
```

:::say
Mostly containerized microservices deployed to EKS with Helm or through ArgoCD, plus Lambda functions via SAM or Terraform, static frontends to S3 with CloudFront invalidation, and Terraform infrastructure with plan and approval. The pipeline template is shared, and only the deploy stage changes per application type.
:::

## How do you handle the CD aspect and promote builds across environments (Dev -> Staging -> Prod)?

<!-- source: 04 Q44 -->

*Also asked as:* How do you handle continuous delivery in your projects? Explain multi-environment promotion flows. How do you manage dev, staging and prod environments in CI/CD?

:::note In simple words
You bake one cake, taste it in the test kitchen, then in the dress-rehearsal kitchen, and only then serve the SAME cake to guests - you never bake a new one for the guests.
:::

Principles:
- **Build once, promote the same artifact:** the image tag tested in dev/staging is exactly what goes to prod. Never rebuild for prod.
- **Environment config is separate** from the artifact: Helm values per env (`values-dev.yaml`, `values-prod.yaml`), ConfigMaps, secrets from Secrets Manager.
- **Gates between environments:** automated tests (smoke, integration, performance), quality gates, and a manual approval for prod.
- **Progressive rollout in prod:** rolling/canary with health checks and automatic rollback.
- **GitOps option:** promotion = a PR that updates the image tag in the env folder of a config repo; ArgoCD syncs it. Git history becomes the audit log.
- **Isolate the environments themselves:** separate namespaces or clusters, ideally separate cloud accounts/subscriptions for prod; per-env deploy identities and secrets, so a dev pipeline physically cannot touch prod.
- **Environment objects in the CI tool:** GitHub/GitLab environments or Azure DevOps Environments carry protection rules (approvals, wait timers, allowed branches) and env-scoped secrets; Jenkins uses folder-scoped credentials plus an `input` gate.
- **Keep environments alike:** the same Terraform modules and Helm chart for every env, only sizes and endpoints differ, so "works in staging" means something in prod.

**Example:**
```bash
gitops-repo/
  apps/orders-api/
    base/
    envs/dev/values.yaml       image.tag: 1.4.0-a1b2c3d
    envs/staging/values.yaml   image.tag: 1.4.0-a1b2c3d
    envs/prod/values.yaml      image.tag: 1.3.2-9f8e7d6   <- promote via PR

# Promote to prod = PR that changes one line, approved by release manager
yq -i '.image.tag = "1.4.0-a1b2c3d"' apps/orders-api/envs/prod/values.yaml
```

:::say
We build the artifact once and promote the same immutable image tag through dev, staging and prod, with only environment config differing through per-env Helm values. Each promotion is gated by automated tests, and prod needs an approval. With GitOps, promotion is simply a reviewed pull request that bumps the image tag in the prod folder, and ArgoCD applies it.
:::

## How do you connect Jenkins to AWS securely and push Docker images for multiple services to ECR?

<!-- source: 04 Q45 -->

*Also asked as:* How do you connect multiple services in a Jenkins pipeline and push images to AWS ECR securely using secrets?

:::note In simple words
Instead of giving Jenkins a permanent key to AWS, give it a temporary visitor badge that expires by itself.
:::

Secure options, best first:
1. **Jenkins on EC2/EKS -> IAM role:** EC2 instance profile or EKS IRSA/Pod Identity for the agent pod. No keys stored anywhere; credentials rotate automatically.
2. **Cross-account:** agent role does `sts:AssumeRole` into the target account's deploy role.
3. **Jenkins outside AWS:** OIDC federation or, last resort, AWS credentials in Jenkins Credentials (AWS Credentials plugin) with least-privilege policy and regular rotation.
- The IAM policy should allow only `ecr:GetAuthorizationToken` plus push actions on specific repositories.

For many services: loop or `parallel` over a list of services (monorepo) or a shared library function `buildAndPush(service)`; only build services whose folder changed.

**Example:**
```
def services = ['orders', 'payments', 'users']
pipeline {
  agent { label 'docker' }          // agent has IAM role via instance profile / IRSA
  environment { ECR = '123456789012.dkr.ecr.ap-south-1.amazonaws.com'; TAG = "${GIT_COMMIT.take(7)}" }
  stages {
    stage('ECR Login') {
      steps { sh 'aws ecr get-login-password | docker login -u AWS --password-stdin $ECR' }
    }
    stage('Build & Push') {
      steps {
        script {
          def jobs = [:]
          services.each { s ->
            jobs[s] = {
              if (sh(script: "git diff --quiet HEAD~1 -- services/${s}", returnStatus: true) != 0) {
                sh "docker build -t $ECR/${s}:$TAG services/${s} && docker push $ECR/${s}:$TAG"
              }
            }
          }
          parallel jobs
        }
      }
    }
  }
}
```

:::say
Jenkins agents run on AWS with an IAM role - instance profile or IRSA - so there are no static keys, and cross-account deploys use sts assume-role. The role only has ECR push rights on specific repos. For multiple services we build and push in parallel, only for services whose folder changed, each tagged with the commit SHA.
:::

## How do Jenkins and a Kubernetes cluster communicate?

<!-- source: 04 Q46 -->

:::note In simple words
Jenkins needs a pass (kubeconfig or cloud identity) to talk to the Kubernetes front desk (API server). With GitOps, Jenkins does not even enter - it just leaves a note in Git and ArgoCD inside the cluster picks it up.
:::

Two directions:
- **Jenkins uses Kubernetes for agents:** Kubernetes plugin creates build pods on demand. Configured under Manage Jenkins -> Clouds with the API server URL and a service account / credential.
- **Jenkins deploys to Kubernetes:**
  - Agent has `kubectl`/`helm` and a kubeconfig. On EKS: `aws eks update-kubeconfig` using the agent's IAM role, which is mapped to Kubernetes RBAC via EKS access entries (or aws-auth ConfigMap).
  - The deploy identity should have a namespace-scoped Role, not cluster-admin.
  - Store kubeconfig (if used) as a Secret file credential.
- **GitOps (pull) model:** Jenkins only updates the manifest repo; ArgoCD in the cluster pulls and applies. Cluster credentials never leave the cluster - most secure.

**Example:**
```text
# EKS: map Jenkins IAM role to a k8s group (access entries)
aws eks create-access-entry --cluster-name prod-eks \
  --principal-arn arn:aws:iam::123456789012:role/jenkins-deployer
aws eks associate-access-policy --cluster-name prod-eks \
  --principal-arn arn:aws:iam::123456789012:role/jenkins-deployer \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy \
  --access-scope type=namespace,namespaces=orders

# In pipeline
withCredentials([file(credentialsId: 'kubeconfig-dev', variable: 'KUBECONFIG')]) {
  sh 'kubectl -n orders rollout status deploy/orders-api'
}
```

:::say
Jenkins talks to the Kubernetes API server either through a kubeconfig credential or, on EKS, through its IAM role mapped to namespace-scoped RBAC using access entries. We also use the Kubernetes plugin so builds run in ephemeral pods. For production we prefer GitOps, where Jenkins only updates the manifest repo and ArgoCD inside the cluster pulls the change.
:::

## How can Jenkins be integrated with other DevOps tools?

<!-- source: 04 Q47 -->

:::note In simple words
Jenkins is the conductor of an orchestra - it does not play every instrument, it tells Git, Maven, SonarQube, Docker, Trivy, Helm and Slack when to play.
:::

Integrations through plugins, CLIs and webhooks:

| Area | Tools | How |
| --- | --- | --- |
| Source control | GitHub, GitLab, Bitbucket | Webhooks, Git/Branch Source plugins |
| Build | Maven, Gradle, npm | Tools config, container agents |
| Code quality | SonarQube | `withSonarQubeEnv`, `waitForQualityGate` |
| Security | Trivy, Snyk, OWASP Dependency-Check, gitleaks | CLI steps, fail on severity |
| Artifacts | Nexus, Artifactory, ECR, S3 | Plugins or CLI push |
| Containers | Docker, Kubernetes | Docker Pipeline plugin, Kubernetes plugin |
| Deploy | Helm, kubectl, ArgoCD, Terraform, Ansible | CLI in stages |
| Secrets | Vault, AWS Secrets Manager | Vault plugin, IAM roles |
| Notify | Teams, Slack, email, Jira | Notification plugins, Jira plugin |
| Monitoring | Prometheus | Prometheus metrics plugin -> Grafana |

**Example:**
```groovy
stage('Terraform Plan') { steps { sh 'terraform init && terraform plan -out=tfplan' } }
stage('Ansible')        { steps { sh 'ansible-playbook -i inventory/dev site.yml' } }
stage('Jira update')    { steps { jiraComment issueKey: 'PC-123', body: "Deployed ${TAG}" } }
```

:::say
Jenkins integrates through plugins, CLIs and webhooks - GitHub webhooks to trigger, Maven or npm to build, SonarQube and Trivy for quality and security, ECR or Nexus for artifacts, Helm, Terraform and Ansible to deploy, Vault or Secrets Manager for secrets, and Teams or Slack plus Jira for notifications. We also export Jenkins metrics to Prometheus and Grafana.
:::

## What rollback strategies do you use, and how do you version artifacts?

<!-- source: 04 Q49 -->

*Also asked as:* How would you make a deployment rollback-safe? Your actual rollout + rollback strategy, not buzzwords.

:::note In simple words
If every box leaving the factory has a unique label, going back to "yesterday's good box" is easy. If every box is just called "latest", you cannot tell which one was good.
:::

Artifact versioning:
- Semantic version + git SHA: `1.4.0-a1b2c3d`, or build number + SHA. Never deploy `latest` to prod.
- Enable **ECR tag immutability** so a tag cannot be overwritten.
- Record which version is in which environment (GitOps repo, Helm release history, deployment dashboard).

Rollback strategies:
- **Redeploy previous version:** `helm rollback`, `kubectl rollout undo`, or revert the GitOps commit.
- **Blue-Green:** switch traffic back to the old environment.
- **Canary:** set new version weight to 0.
- **Feature flags:** turn the feature off without redeploying.
- **Automatic:** `helm --atomic`, Argo Rollouts analysis, CodeDeploy auto-rollback on CloudWatch alarm.
- **Database:** use backward-compatible (expand/contract) migrations so old code still works with the new schema - otherwise app rollback is not safe.

Rollback-safe checklist (the actual rollout + rollback strategy, not buzzwords):
1. **Immutable, versioned artifacts:** deploy by image **digest** (`@sha256:...`) or an immutable tag; the same artifact is promoted through all environments.
2. **Keep previous versions ready:** `revisionHistoryLimit` keeps the last N ReplicaSets; Helm keeps release history (`--history-max`); old images are not deleted by ECR lifecycle rules too early.
3. **Backward-compatible DB migrations (expand/contract):** the previous app version must still work against the new schema.
4. **Feature flags:** risky behaviour can be switched off without a redeploy.
5. **Config versioned together with code:** Helm values, ConfigMaps and flags live in Git with the release, so a rollback restores the matching config too.
6. **Progressive rollout with automated analysis and abort:** canary steps checked against error rate and latency (Argo Rollouts, CodeDeploy alarms), aborting automatically.
7. **One-command rollback, practised regularly:** `helm rollback`, `kubectl rollout undo`, or `git revert` in GitOps - rehearsed in game days, and documented in the runbook.
8. **No manual hotfixes that skip Git:** a `kubectl edit` in prod is lost on the next sync or rollback; every fix goes through the pipeline.

**Example:**
```
spec:
  revisionHistoryLimit: 10                  # keep last 10 ReplicaSets for rollout undo
  template:
    spec:
      containers:
      - name: orders-api
        image: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/orders-api@sha256:4f1c...

helm upgrade --install orders-api charts/orders-api --history-max 10 --atomic
helm history orders-api -n prod
helm rollback orders-api 41 -n prod --wait

kubectl rollout history deploy/orders-api -n prod
kubectl rollout undo deploy/orders-api -n prod --to-revision=7

aws ecr put-image-tag-mutability --repository-name orders-api \
  --image-tag-mutability IMMUTABLE
```

:::say
Every artifact gets an immutable version tag with the git SHA, with ECR tag immutability on, so we always know exactly what is running. Rollback is a Helm rollback or a git revert in the GitOps repo, Blue-Green switch-back or canary weight to zero, and we use feature flags and backward-compatible database migrations so rolling back the app is always safe. To make it truly rollback-safe we deploy by digest, keep the last N releases, version config with code, use canary with automatic abort, practise the one-command rollback regularly, and never hotfix production outside Git.
:::

## What are secure pipeline (DevSecOps) practices?

<!-- source: 04 Q50 -->

:::note In simple words
The pipeline has the keys to production, so it must be guarded like the vault of a bank - checks at every door, no spare keys lying around, and cameras recording everything.
:::

- **Shift-left scanning:** SAST (SonarQube/Semgrep), dependency/SCA (OWASP Dependency-Check, Snyk), secret scanning (gitleaks), IaC scanning (Checkov/tfsec), container scanning (Trivy). Fail the build on critical findings.
- **No static secrets:** IAM roles/OIDC for cloud, Vault/Secrets Manager at runtime, masked credentials.
- **Least privilege:** deploy role scoped to one account/namespace; separate roles for dev and prod.
- **Protect the pipeline itself:** branch protection, required reviews, signed commits; pipeline definition changes reviewed; restrict who can approve prod.
- **Ephemeral isolated agents:** fresh pod per build; no untrusted PR code on agents that hold prod credentials.
- **Supply chain:** pin base image digests and action versions (by SHA), generate SBOM, sign images (cosign) and verify at deploy.
- **Audit:** keep build logs, who approved what, and deploy history.

**Example:**
```groovy
stage('Security Scans') {
  parallel {
    stage('Secrets') { steps { sh 'gitleaks detect --source . --exit-code 1' } }
    stage('Deps')    { steps { sh 'trivy fs --exit-code 1 --severity CRITICAL .' } }
    stage('IaC')     { steps { sh 'checkov -d infra/ --quiet' } }
  }
}
stage('Sign image') { steps { sh 'cosign sign --key awskms:///alias/cosign $IMAGE@$DIGEST' } }
```

:::say
I build security into every stage: secret, dependency, SAST, IaC and image scanning with builds failing on critical issues. Pipelines use short-lived IAM or OIDC credentials instead of stored keys, run on ephemeral agents with least-privilege deploy roles, have protected branches and restricted prod approvals, and images are pinned, scanned and signed before deploy.
:::

## How do you secure secrets across CI/CD pipelines?

<!-- source: 04 Q51 -->

*Also asked as:* You are asked to secure secrets across CI/CD pipelines. What is your preferred approach?

:::note In simple words
The best secret is one that does not exist - use temporary badges instead of permanent keys. For the secrets you must have, keep them in one central safe and let the pipeline borrow them only for a moment.
:::

My preferred approach, in order:
1. **Eliminate long-lived cloud keys:** GitHub Actions/GitLab/Azure DevOps -> OIDC federation to AWS/Azure/GCP; Jenkins on AWS -> IAM roles/IRSA.
2. **Central secrets manager:** HashiCorp Vault or AWS Secrets Manager / Azure Key Vault; pipelines fetch at runtime with a short-lived identity.
3. **CI-native secret store** only for what remains (Jenkins Credentials, GitHub encrypted secrets, Azure DevOps variable groups linked to Key Vault), scoped per environment with approvals on prod environments.
4. **Hygiene:** mask in logs, never echo, never bake into Docker images or artifacts, `no_log` in Ansible.
5. **Detect leaks:** gitleaks pre-commit + pipeline scan, GitHub secret scanning.
6. **Rotate** regularly and immediately on any exposure.

**Example:**
```
# GitHub Actions -> AWS with OIDC (no stored AWS keys)
permissions:
  id-token: write
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production          # requires reviewers
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-deploy
          aws-region: ap-south-1
      - run: |
          DB_PASS=$(aws secretsmanager get-secret-value --secret-id prod/db \
            --query SecretString --output text)
          echo "::add-mask::$DB_PASS"
```

:::say
My first step is removing static keys by using OIDC federation or IAM roles, so pipelines get short-lived credentials. Remaining secrets live in a central manager like Vault or Secrets Manager and are fetched at runtime, scoped per environment, masked in logs, never baked into images, and leak scanning plus regular rotation cover the rest.
:::
