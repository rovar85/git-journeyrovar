---
track: jenkins
title: Parameters, triggers, artifacts and job chains
short: Parameters, chains
sub: Make jobs configurable, schedule them, keep their output, and chain build, test and deploy.
---

:::goals
- add parameters to a job and run it with values
- schedule builds with cron syntax (and understand `H`)
- archive artifacts and chain jobs
- see why "click-configured" jobs lead to Pipelines as code
:::

@setup jenkins

## Parameterised builds

A **parameterised** job takes inputs (a target environment, a version, a flag). Jenkins exposes them to the build as **environment variables**.

```run
cat > deploy-job.xml <<'EOF'
<project>
  <description>Pretend deployment, takes parameters</description>
  <properties>
    <hudson.model.ParametersDefinitionProperty>
      <parameterDefinitions>
        <hudson.model.ChoiceParameterDefinition>
          <name>TARGET_ENV</name>
          <choices class="java.util.Arrays$ArrayList"><a class="string-array"><string>test</string><string>prod</string></a></choices>
        </hudson.model.ChoiceParameterDefinition>
        <hudson.model.StringParameterDefinition>
          <name>VERSION</name><defaultValue>1.0.0</defaultValue>
        </hudson.model.StringParameterDefinition>
        <hudson.model.BooleanParameterDefinition>
          <name>DRY_RUN</name><defaultValue>true</defaultValue>
        </hudson.model.BooleanParameterDefinition>
      </parameterDefinitions>
    </hudson.model.ParametersDefinitionProperty>
  </properties>
  <builders>
    <hudson.tasks.Shell>
      <command>echo "Deploying version $VERSION to $TARGET_ENV (dry run: $DRY_RUN)"
if [ "$TARGET_ENV" = "prod" ] &amp;&amp; [ "$DRY_RUN" = "false" ]; then
  echo "*** REAL production deployment ***"
fi
echo "report: deployed $VERSION to $TARGET_ENV" > deploy-report.txt</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers>
    <hudson.tasks.ArtifactArchiver>
      <artifacts>deploy-report.txt</artifacts>
    </hudson.tasks.ArtifactArchiver>
  </publishers>
</project>
EOF
jpost -H "Content-Type: application/xml" --data-binary @deploy-job.xml "$JENKINS/createItem?name=deploy"
jpost "$JENKINS/job/deploy/buildWithParameters?TARGET_ENV=prod&VERSION=2.4.1&DRY_RUN=false"
jwait deploy
curl -sg "$JENKINS/job/deploy/lastBuild/consoleText" | grep -E "Deploying|REAL"
```

Notes on the XML: `&amp;&amp;` is how `&&` is written inside XML (the UI hides this). The values passed in the URL arrived as `$VERSION`, `$TARGET_ENV`, `$DRY_RUN`. A safe design: default to the **harmless** option (`test`, dry run `true`) and require an explicit choice for production.

## Artifacts

An **artifact** is a file a build produces that you want to keep (a package, a report, an installer). Jenkins stores archived artifacts per build:

```run
curl -sg "$JENKINS/job/deploy/lastBuild/api/json?tree=artifacts[fileName,relativePath]" | python3 -c 'import sys,json; print([a["fileName"] for a in json.load(sys.stdin)["artifacts"]])'
curl -sg "$JENKINS/job/deploy/lastBuild/artifact/deploy-report.txt"
```

Do not use Jenkins as a package store for big binaries: publish them to a proper **artifact repository** (Nexus, Artifactory, a container registry, S3) and record the version. Archive logs, test reports and small outputs.

## Triggers: how builds start

| Trigger | Meaning |
|---|---|
| **Manual** | a person clicks "Build" |
| **Webhook** | the Git server calls Jenkins on every push or pull request (best: instant, no polling) |
| **Poll SCM** | Jenkins asks Git for changes on a schedule (wasteful; use webhooks) |
| **Periodic (cron)** | for nightly jobs: `H 2 * * *` |
| **Upstream job** | another job finished |
| **Remote API** | a script or another system calls the REST endpoint |

Jenkins cron has five fields like Linux cron plus the **`H` (hash)** symbol: instead of everything starting at minute 0 (and overloading the server), `H` picks a stable, spread-out minute per job. `H 2 * * *` means "once between 02:00 and 02:59".

```run
cat > nightly-job.xml <<'EOF'
<project>
  <triggers>
    <hudson.triggers.TimerTrigger><spec>H 2 * * 1-5</spec></hudson.triggers.TimerTrigger>
  </triggers>
  <builders><hudson.tasks.Shell><command>echo "nightly work"</command></hudson.tasks.Shell></builders>
</project>
EOF
jpost -H "Content-Type: application/xml" --data-binary @nightly-job.xml "$JENKINS/createItem?name=nightly"
curl -sg "$JENKINS/job/nightly/config.xml" | grep -o "<spec>.*</spec>"
```

## Chaining jobs: build, test, deploy

A very common shape: a **build** job triggers a **test** job which, on success, triggers **deploy**. Configure "build other projects" on the upstream job:

```run
cat > build-job.xml <<'EOF'
<project>
  <description>Stage 1: build</description>
  <builders><hudson.tasks.Shell><command>echo "compiling..."; echo "artefact v1" > app.pkg</command></hudson.tasks.Shell></builders>
  <publishers>
    <hudson.tasks.BuildTrigger>
      <childProjects>test-stage</childProjects>
      <threshold><name>SUCCESS</name><ordinal>0</ordinal><color>BLUE</color><completeBuild>true</completeBuild></threshold>
    </hudson.tasks.BuildTrigger>
  </publishers>
</project>
EOF
cat > test-job.xml <<'EOF'
<project>
  <description>Stage 2: test</description>
  <builders><hudson.tasks.Shell><command>echo "running tests..."; echo "42 passed"</command></hudson.tasks.Shell></builders>
  <publishers>
    <hudson.tasks.BuildTrigger>
      <childProjects>deploy-stage</childProjects>
      <threshold><name>SUCCESS</name><ordinal>0</ordinal><color>BLUE</color><completeBuild>true</completeBuild></threshold>
    </hudson.tasks.BuildTrigger>
  </publishers>
</project>
EOF
cat > deploy2-job.xml <<'EOF'
<project>
  <description>Stage 3: deploy</description>
  <builders><hudson.tasks.Shell><command>echo "deploying to test environment"</command></hudson.tasks.Shell></builders>
</project>
EOF
for j in deploy-stage:deploy2 test-stage:test build-stage:build; do jpost -H "Content-Type: application/xml" --data-binary @${j#*:}-job.xml "$JENKINS/createItem?name=${j%%:*}"; done
jpost "$JENKINS/job/build-stage/build"
for j in build-stage test-stage deploy-stage; do echo -n "$j: "; jwait $j; done
curl -sg "$JENKINS/job/test-stage/lastBuild/consoleText" | grep -E "Started by|tests|passed"
```

The second job's console says it was **Started by upstream project "build-stage"**. Break the middle stage and the chain stops there: the deploy job never runs when tests fail. This is the idea of a **pipeline**, but built from separate click-configured jobs, which is hard to review, copy, version or reason about as it grows.

## Why Pipelines as code exist

| Click-configured jobs | Pipeline as code (`Jenkinsfile`) |
|---|---|
| Configuration lives only on the server | Lives in Git next to the code, reviewed in PRs |
| Hard to copy per branch | Every branch gets its own run of its own pipeline |
| A chain of many jobs | One file with stages |
| Changes untracked | History, blame, rollback |

The next lesson shows the `Jenkinsfile`.

:::warn Parameters are inputs, so validate them
Never paste parameter values into a shell command without care: a value like `x; rm -rf /` becomes a command. Use choices instead of free text where possible, quote variables (`"$VERSION"`), and validate formats.
:::

:::recap
- Parameters become environment variables; give safe defaults.
- Archive small outputs as artifacts; use a real repository for packages.
- Triggers: webhook (best), polling, cron with `H`, upstream job, API.
- Chaining jobs gives stages but scatters configuration; Pipelines as code fix that.
:::

:::try Your turn
Add a `NOTES` string parameter to the deploy job and print it. What risk does a free-text parameter introduce, and how would you reduce it?
:::

:::quiz
? What does `H 2 * * *` mean in Jenkins cron?
+ Once a day sometime during the 02:00 hour, spread by a per-job hash
- At exactly 02:00 for every job
- Every two hours
- Hourly at 2 minutes past
! `H` avoids all jobs starting at the same minute.
? Why is a webhook better than Poll SCM?
+ Instant and no repeated polling load
- It is cheaper to write
- It avoids Git
- It needs no network
! The Git server calls Jenkins when something happens.
? What problem do Jenkinsfiles solve compared to click-configured jobs?
+ Configuration lives in Git: reviewable, versioned, per branch
- They run faster
- They need no agents
- They replace tests
! Pipeline as code is the modern standard.
:::
