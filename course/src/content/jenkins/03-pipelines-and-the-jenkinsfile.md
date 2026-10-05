---
track: jenkins
title: Pipelines and the Jenkinsfile
short: Jenkinsfile
sub: Declarative pipeline syntax: stages, steps, agents, environment, conditions, parallelism and post actions.
---

:::goals
- read and write a declarative `Jenkinsfile`
- use `agent`, `environment`, `stages`, `steps`, `when`, `parallel`, `post` and `input`
- explain how credentials are used safely
- explain scripted versus declarative pipelines and multibranch pipelines
:::

:::note Not run here
Running a Jenkinsfile needs the **Pipeline plugin**, which cannot be installed in this lab (the plugin site is unreachable). Everything in this lesson is **Example (not run here)**: syntax you will write in real life. Lesson 4 runs the same stage commands as ordinary shell so you can see them work.
:::

## What a Jenkinsfile is

A **Jenkinsfile** is a text file in the root of your repository that defines the pipeline in code (Groovy-based DSL). Jenkins reads it on every run, so the pipeline **changes with the code**, is reviewed in the same pull request, and each branch can differ. There are two syntaxes:

| Syntax | Notes |
|---|---|
| **Declarative** (`pipeline { ... }`) | structured, validated, recommended for almost everything |
| **Scripted** (`node { ... }`) | free-form Groovy, more power, more ways to go wrong |

## A complete declarative pipeline

```groovy:Jenkinsfile (Example, not run here)
pipeline {
    agent { label 'linux' }                  // run on an agent that has the label "linux"

    options {
        timeout(time: 20, unit: 'MINUTES')   // never hang forever
        buildDiscarder(logRotator(numToKeepStr: '30'))
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        IMAGE   = "registry.example.com/ops/ev-tools"
        VERSION = "${env.BUILD_NUMBER}"
    }

    parameters {
        choice(name: 'DEPLOY_TO', choices: ['none', 'test', 'prod'], description: 'Where to deploy')
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }           // the repo that contains this Jenkinsfile
        }

        stage('Lint and test') {
            parallel {                       // two things at the same time
                stage('Lint') {
                    steps { sh 'bash -n scripts/*.sh' }
                }
                stage('Unit tests') {
                    steps { sh './run-tests.sh' }
                    post { always { junit 'reports/*.xml' } }   // publish test results
                }
            }
        }

        stage('Build image') {
            steps { sh 'docker build -t $IMAGE:$VERSION .' }
        }

        stage('Push image') {
            when { branch 'main' }           // only on the main branch
            steps {
                withCredentials([usernamePassword(credentialsId: 'registry-login',
                                                  usernameVariable: 'REG_USER',
                                                  passwordVariable: 'REG_PASS')]) {
                    sh 'echo "$REG_PASS" | docker login registry.example.com -u "$REG_USER" --password-stdin'
                    sh 'docker push $IMAGE:$VERSION'
                }
            }
        }

        stage('Deploy') {
            when { expression { params.DEPLOY_TO != 'none' } }
            steps {
                input message: "Deploy ${VERSION} to ${params.DEPLOY_TO}?", ok: 'Deploy'   // manual approval
                sh 'kubectl --context ${DEPLOY_TO} set image deployment/ev-tools app=$IMAGE:$VERSION'
                sh 'kubectl --context ${DEPLOY_TO} rollout status deployment/ev-tools --timeout=120s'
            }
        }
    }

    post {
        success { echo 'Pipeline succeeded' }
        failure { mail to: 'ops@example.com', subject: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}", body: "See ${env.BUILD_URL}" }
        always  { cleanWs() }                // clean the workspace
    }
}
```

## Reading it

- **`pipeline`** is the root. **`agent`** says where to run (`any`, a `label`, a `docker { image '...' }` container, or a Kubernetes pod template).
- **`options`**: pipeline-wide behaviour: timeouts, retention, no overlapping builds.
- **`environment`**: variables available to all steps; also where **credentials** are bound.
- **`stages`**: a list of **`stage`** blocks, each with **`steps`**. A stage is a named phase shown as a column in the UI. A failing step fails its stage and (by default) skips the rest.
- **`sh`** runs a shell command (`bat` or `powershell` on Windows). Everything in this track's shell lessons applies.
- **`when`**: run a stage only if a condition holds (branch, environment variable, expression, changed files).
- **`parallel`**: run stages side by side to save time.
- **`input`**: pause for a human to approve (typical before production).
- **`post`**: actions after the stage or pipeline: `always`, `success`, `failure`, `unstable`, `cleanup`. Notifications and cleanup live here.

## Credentials: never in the file

Passwords and tokens are stored in Jenkins' **credential store** (Manage Jenkins, Credentials) and referenced by **ID**. `withCredentials` makes them available as environment variables **for that block only**, and Jenkins **masks** their value in the console log (it prints `****`).

```groovy:snippet (Example, not run here)
withCredentials([string(credentialsId: 'sonar-token', variable: 'TOKEN')]) {
    sh 'scan --token "$TOKEN"'        // single quotes: the shell reads $TOKEN, Groovy never sees the secret
}
```

Two rules that avoid leaks: use **single quotes** for `sh '...$SECRET...'` so Groovy does not interpolate the secret into the command line (which can leak into logs), and never `echo` a secret or enable `set -x` around it. Credential types: username/password, secret text, SSH private key, secret file, certificate. For cloud, prefer **short-lived** credentials (OIDC, instance roles) over stored keys.

## Docker agents

A pipeline can run its steps **inside a container**, so the build environment is itself defined in code and identical for everyone:

```groovy:snippet (Example, not run here)
pipeline {
    agent { docker { image 'python:3.12-slim' } }
    stages {
        stage('Test') {
            steps { sh 'pip install -r requirements.txt && pytest' }
        }
    }
}
```

This ties directly to the Docker track: no need to install Python, Node or Terraform on every agent.

## Multibranch pipelines and pull requests

A **Multibranch Pipeline** scans a repository: for **every branch and pull request** that contains a `Jenkinsfile`, Jenkins creates a job automatically and runs it, and reports the result back to the PR as a status check. Combined with branch rules (see the Git track) that require green checks to merge, this is the heart of CI. A webhook from GitHub/GitLab triggers the scan immediately.

## Shared libraries

When ten repositories copy the same 80 lines, move them to a **shared library** (a Git repository of Groovy functions) and call `buildAndPush(image: 'x')`. It is how large organisations standardise pipelines.

## Good habits

| Habit | Why |
|---|---|
| Keep the Jenkinsfile short; put logic in scripts (`./ci/build.sh`) | scripts can be run and tested locally without Jenkins |
| Fail fast: lint and unit tests first | quick feedback |
| Set timeouts and discard old builds | no hung executors, no full disks |
| Same artefact through all environments (build once, promote) | what you tested is what you ship |
| Pin tool and image versions | repeatable builds |
| Make steps idempotent and re-runnable | retries are safe |

:::recap
- A `Jenkinsfile` in Git defines the pipeline: `agent`, `options`, `environment`, `stages`/`steps`, `when`, `parallel`, `input`, `post`.
- Credentials are referenced by ID with `withCredentials`, masked in logs; use single quotes for `sh`.
- Docker agents define the build environment in code. Multibranch pipelines run per branch and PR.
- Keep the file small: logic in scripts, shared code in libraries.
:::

:::try Your turn
Write (on paper or in a file) a Jenkinsfile for a repository that has `lint.sh`, `test.sh` and a `Dockerfile`. It should lint and test in parallel, build an image on every branch, and only push it on `main`.
:::

:::quiz
? Why store the pipeline as a Jenkinsfile in the repository?
+ It is reviewed, versioned and can differ per branch
- It runs faster
- It needs no agent
- It avoids credentials
! Pipeline as code is the standard.
? How should a pipeline obtain a registry password?
+ From Jenkins credentials via `withCredentials`, never written in the file
- Hard-coded in `environment`
- Typed in each build
- Read from the Git history
! Credentials are masked in logs and scoped to the block.
? What does `post { always { ... } }` do?
+ Runs after the stage/pipeline whatever the result
- Runs only on success
- Runs before the first stage
- Skips failed stages
! Use it for cleanup and notifications.
:::
