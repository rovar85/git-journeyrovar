=== jenkins/01
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

=== jenkins/02
## Answer and common mistakes

**Free-text parameter risk.** A `NOTES` string parameter is **user-controlled input** that ends up in a shell command. If the script does `echo $NOTES` unquoted, a value such as `x; rm -rf ~` runs as a command (**command injection**). Reduce the risk by:

- quoting (`echo "$NOTES"`) and never building commands from parameters,
- using **choice** parameters or a validated pattern where possible,
- passing values as environment variables instead of pasting them into script text,
- running builds with least privilege so a mistake cannot do much harm.

:::warn Common mistakes
- **Treating parameters as trusted.** They are input from people.
- **Polling the repository every minute** instead of using a webhook (load and delay).
- **Not archiving the artifacts** that a later deployment job needs, or archiving everything and filling the disk (set a retention policy).
- **Chains with no failure handling.** Decide what happens downstream when an upstream job fails.
:::

=== jenkins/03
## Answer and common mistakes

One reasonable answer to the exercise:

```groovy
pipeline {
  agent any
  stages {
    stage('Checks') {
      parallel {
        stage('Lint') { steps { sh './lint.sh' } }
        stage('Test') { steps { sh './test.sh' } }
      }
    }
    stage('Build image') {
      steps { sh 'docker build -t myapp:${BUILD_NUMBER} .' }
    }
    stage('Push') {
      when { branch 'main' }
      steps { sh 'docker push registry.example.com/myapp:${BUILD_NUMBER}' }
    }
  }
  post { always { cleanWs() } }
}
```

(Example, not run here: `when { branch }` needs a *multibranch* pipeline, and the push needs registry credentials, shown in lesson 4.)

:::warn Common mistakes
- **Scripted and declarative syntax mixed up.** Start declarative (`pipeline { }`), and use `script { }` blocks sparingly.
- **Long Groovy logic inside the Jenkinsfile.** Put real logic in scripts in the repository so developers can run them locally.
- **`agent any` everywhere** so builds land on whichever machine has the wrong tools. Label your agents.
- **No `post` cleanup,** so workspaces fill the disk.
- **Forgetting that each `sh` step is a new shell:** `cd` and exported variables do not carry over.
:::

=== jenkins/04
## Answer and common mistakes

A size gate is just a shell test, so you can check the logic outside Jenkins first:

```run
size=24000000          # pretend `docker image inspect -f '{{.Size}}'` printed this
limit=20000000
if [ "$size" -gt "$limit" ]; then echo "image too large: $size > $limit"; exit 1; fi
echo "this line is not reached"
```

Run it with `; echo "exit code: $?"` appended and you see `1`: in Jenkins that non-zero exit stops the stage and fails the build, which is exactly how a quality gate works.

:::warn Common mistakes
- **Tagging images only `latest`.** Tag with the build number or Git commit so a deployment is traceable and rollback is possible.
- **Deploying without a verification step** (smoke test) and a rollback path.
- **Rebuilding the artifact in each environment.** Build once, promote the same image.
- **Credentials baked into the image or the log.**
:::

=== jenkins/05
## Answer and common mistakes

A sample checklist (items marked **[auto]** can be verified with the REST API or a script):

1. Security realm enabled; anonymous cannot read or build **[auto: API returns 403 without login]**.
2. Authorisation matrix with least privilege; few administrators.
3. CSRF protection on **[auto: `crumbIssuer` responds]**.
4. Controller runs **no builds** (0 executors); builds run on agents.
5. Credentials stored in the credential store, never in jobs or Jenkinsfiles.
6. Jenkins and plugins updated; a list of installed plugins reviewed **[auto: plugin manager API]**.
7. Agents ephemeral (containers) where possible.
8. HTTPS in front of Jenkins, behind SSO.
9. Script approval / sandbox kept on for pipeline Groovy.
10. Backups of `JENKINS_HOME`, with a tested restore.

:::warn Common mistakes
- **Running builds on the controller,** where a job can read every secret.
- **Never updating plugins** (most Jenkins incidents are old plugins).
- **Shared admin accounts,** so nobody knows who changed what.
- **Treating pull-request builds from strangers as trusted code.**
:::

=== jenkins/06
## Answer and common mistakes

Concept mapping from Jenkins to GitHub Actions:

| Jenkins | GitHub Actions |
|---|---|
| Jenkinsfile | workflow file in `.github/workflows/` |
| `pipeline` / job | workflow |
| `stage` | job (stages become jobs, ordered with `needs:`) |
| `steps` / `sh` | `steps` / `run:` |
| agent / label | `runs-on:` |
| `parallel` | jobs without `needs:` run in parallel |
| `when { branch 'main' }` | `if: github.ref == 'refs/heads/main'` |
| credentials | secrets (and OIDC for the cloud) |
| plugins | marketplace actions |
| `post { always }` | `if: always()` on a step |

:::warn Common mistakes
- **Changing Jenkins settings by hand on a live server** instead of through Configuration as Code in Git.
- **No tested restore** of `JENKINS_HOME`.
- **Upgrading plugins and core on the same day with no rollback plan.**
- **Migrating by translating syntax line by line** instead of redesigning around the new tool's strengths.
:::
