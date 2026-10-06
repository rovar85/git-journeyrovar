---
track: jenkins
title: CI/CD concepts and Jenkins basics
short: CI/CD, first job
sub: What continuous integration and delivery mean, how Jenkins is built, and your first real build.
---

:::goals
- explain continuous integration, delivery and deployment
- describe Jenkins' parts: controller, agents, executors, jobs, builds, workspaces
- create and run a job on a real Jenkins server and read its console output
- use the Jenkins REST API
:::

## What CI/CD is

Before CI, teams combined code rarely, and "integration day" was a painful surprise. **Continuous Integration (CI)** means every change is merged to a shared branch often and **automatically built and tested**, so problems are found within minutes. **Continuous Delivery** extends it: every good build is automatically prepared and could go to production at the push of a button. **Continuous Deployment** pushes every passing change to production with no button.

| Stage | Question it answers |
|---|---|
| Commit | Did someone change something? (trigger) |
| Build | Does it compile / package / build an image? |
| Test | Do the tests, linters and security scans pass? |
| Package/publish | Store the artefact (image in a registry, package in a repository) |
| Deploy | Put it in an environment (test, then production) |
| Verify | Smoke tests, monitoring |

An automation server runs those steps for you the same way every time, on a clean machine, and shows the result. **Jenkins** is the most widely used open-source one. Alternatives you will meet: **GitHub Actions**, **GitLab CI**, **Azure DevOps Pipelines**, **CircleCI**, **TeamCity**. The ideas are identical; the syntax differs.

## Jenkins architecture

| Part | Meaning |
|---|---|
| **Controller** (formerly "master") | the central server: web UI, configuration, schedules jobs, stores history. Should not run builds itself in production |
| **Agent** (node) | a machine (VM, container, cloud instance) that runs the builds, connected to the controller |
| **Executor** | one build slot on a node (a node with 4 executors runs 4 builds at once) |
| **Job / Project** | the definition of what to do (freestyle job or Pipeline) |
| **Build** | one run of a job, with a number (#1, #2), result, console log and artefacts |
| **Workspace** | the working folder on the agent where the build runs |
| **Plugin** | extends Jenkins. There are 1,800+ (Git, Pipeline, Docker, Kubernetes, credentials...) |
| `JENKINS_HOME` | the folder holding all configuration, jobs and history: back this up |

## A real Jenkins in the lab

This lab runs the official Jenkins LTS container on loopback only. It has **no plugins** (the plugin site is not reachable from the lab), so we can use the core features: freestyle jobs, shell build steps, the REST API and the script console. Pipelines (Jenkinsfile) need the Pipeline plugin, so the pipeline lessons use **Example (not run here)** blocks, and lesson 4 runs the same steps as plain commands.

@setup jenkins

```run
curl -sI $JENKINS/login | grep -i "^x-jenkins:"
curl -sg "$JENKINS/api/json?tree=mode,numExecutors,nodeDescription,useSecurity" | python3 -m json.tool
```

`/api/json` is available on almost every page: add it to a URL to get machine-readable data. `mode: NORMAL` and `numExecutors` shows the built-in node can run builds (not recommended in production; use agents).

## Create a job

A **freestyle job** is configured with a form in the UI (and stored as `config.xml`). With the API you can create one from XML. This job has one build step: a shell script.

```run
cat > hello-job.xml <<'EOF'
<project>
  <description>First job: prints some information</description>
  <builders>
    <hudson.tasks.Shell>
      <command>echo "Hello from Jenkins build #$BUILD_NUMBER"
echo "Job name:   $JOB_NAME"
echo "Workspace:  $WORKSPACE"
echo "Running as: $(whoami)"
date +%Y > /dev/null
echo "Build finished"</command>
    </hudson.tasks.Shell>
  </builders>
</project>
EOF
jpost -H "Content-Type: application/xml" --data-binary @hello-job.xml "$JENKINS/createItem?name=hello"
curl -sg "$JENKINS/api/json?tree=jobs[name]" | python3 -c 'import sys,json; print([j["name"] for j in json.load(sys.stdin)["jobs"]])'
```

HTTP `200` means created. Every `POST` needs a **crumb** (a CSRF token fetched from `/crumbIssuer`), which our `jpost` helper adds (together with the session cookie it belongs to). Now run it:

```run
jpost "$JENKINS/job/hello/build"
jwait hello
curl -sg "$JENKINS/job/hello/lastBuild/consoleText"
```

That is a real build: Jenkins queued it, an executor picked it up, created a workspace, ran the shell step with Jenkins' **environment variables** (`BUILD_NUMBER`, `JOB_NAME`, `WORKSPACE`), and recorded the result. Read the console log from top to bottom: it is the first thing to check when a build fails.

## Build results and history

```run
jpost "$JENKINS/job/hello/build"
jwait hello
curl -sg "$JENKINS/job/hello/api/json?tree=builds[number,result]" | python3 -c 'import sys,json; [print("#%d %s" % (b["number"], b["result"])) for b in json.load(sys.stdin)["builds"]]'
```

| Result | Meaning |
|---|---|
| **SUCCESS** | every step exited 0 |
| **FAILURE** | a step failed (non-zero exit status) |
| **UNSTABLE** | built but tests failed or quality gate not met |
| **ABORTED** | cancelled by a person or a timeout |

The **exit code** rule from the shell scripting lesson is the foundation: Jenkins marks a shell step failed if its last command returns non-zero.

## A failing build

```run
cat > fail-job.xml <<'EOF'
<project>
  <builders>
    <hudson.tasks.Shell>
      <command>echo "step 1 ok"
ls /this/folder/does/not/exist
echo "step 3 (never reached)"</command>
    </hudson.tasks.Shell>
  </builders>
</project>
EOF
jpost -H "Content-Type: application/xml" --data-binary @fail-job.xml "$JENKINS/createItem?name=failing"
jpost "$JENKINS/job/failing/build"
jwait failing
curl -sg "$JENKINS/job/failing/lastBuild/consoleText" | grep -v "^$" | tail -5
```

Jenkins runs shell steps with `-xe`: it echoes each command and **stops at the first error**, so "step 3" never ran and the build is `FAILURE`. The last lines of the console explain why: always read them.

## The pattern behind every CI system

1. A **trigger** (a Git push, a schedule, a pull request, a person) starts a run.
2. The server finds an **agent** and creates a **clean workspace**.
3. It **checks out the code**, then runs **steps** (shell commands, scripts).
4. It records the **result**, **logs** and **artefacts**, and **notifies** people.

```run
curl -sg "$JENKINS/computer/api/json?tree=computer[displayName,numExecutors]" | python3 -c 'import sys,json; [print(c["displayName"], "executors:", c["numExecutors"]) for c in json.load(sys.stdin)["computer"]]'
```

<!-- deeper -->
## A worked solution and common mistakes

Create the job from XML (the same thing the web form saves), run it, and read the result:

```run
cat > exit3.xml <<'EOF2'
<project>
  <builders>
    <hudson.tasks.Shell><command>date
exit 3</command></hudson.tasks.Shell>
  </builders>
</project>
EOF2
jcurl -o /dev/null -w "create: %{http_code}\n" -H "Content-Type: application/xml" --data-binary @exit3.xml "$JENKINS/createItem?name=exit3"
jpost "$JENKINS/job/exit3/build"
jwait exit3
curl -s "$JENKINS/job/exit3/lastBuild/consoleText" | grep -E "exit 3|Finished|Build step"
```

The result is **FAILURE** because Jenkins treats any non-zero exit status of a shell step as failure, and the console shows `Build step 'Execute shell' marked build as failure`. Exit status `0` is success; that single convention is how Jenkins, shell scripts and every CI tool decide pass or fail.

:::warn Common mistakes
- **Ignoring the console output.** The console log is the first place to look; the build page only tells you pass or fail.
- **Putting secrets in the job's shell text.** Use credentials (lesson 5) so they are masked in logs.
- **A last command that hides failure** (`./test.sh || true`, or a pipe whose last command succeeds). The step then reports success.
- **Doing everything by clicking in the UI.** Jobs only in the UI cannot be reviewed or restored from Git; move to a Jenkinsfile (lesson 3).
:::
<!-- /deeper -->

:::recap
- CI = merge often with automatic build and test; delivery = always releasable; deployment = automatic release.
- Jenkins: controller schedules, agents run builds on executors; jobs have builds with logs and results; `JENKINS_HOME` holds everything.
- Freestyle jobs run shell steps. Non-zero exit = failure. Read the console log first.
- The REST API (`/api/json`, `createItem`, `build`) lets you automate Jenkins itself. POSTs need a crumb.
:::

:::try Your turn
Create a job whose shell step prints the current date and exits with status 3. Run it and find the result and the line in the console that shows the exit status.
:::

:::quiz
? What does CI stand for and what is its main benefit?
+ Continuous Integration: frequent merging with automatic build/test finds problems early
- Central Installation: one server for all
- Code Inspection: manual review
- Container Images: smaller builds
! Short feedback loops are the point.
? Where does a Jenkins build actually run?
+ On an agent (or the built-in node) executor, in a workspace
- In your browser
- In the Git server
- Inside the registry
! Production setups use agents, not the controller.
? A shell step returns exit code 1. The build result is:
+ FAILURE
- SUCCESS
- UNSTABLE
- ABORTED
! Non-zero exit marks failure.
:::
