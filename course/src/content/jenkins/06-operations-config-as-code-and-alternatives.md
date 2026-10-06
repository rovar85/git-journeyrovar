---
track: jenkins
title: Operating Jenkins, Configuration as Code and alternatives
short: Operations, alternatives
sub: Back up and upgrade Jenkins, define it in code, and compare it with GitHub Actions and GitLab CI.
---

:::goals
- back up and restore `JENKINS_HOME`
- explain Jenkins Configuration as Code (JCasC) and plugin management in code
- upgrade Jenkins safely
- compare Jenkins with GitHub Actions, GitLab CI and Azure Pipelines
:::

@setup jenkins

## JENKINS_HOME: everything lives in files

Jenkins keeps its state in `JENKINS_HOME` (`/var/jenkins_home` in the container). It is plain files:

```run
docker exec jenkins sh -c 'cd /var/jenkins_home && ls && echo "--- jobs:" && ls jobs 2>/dev/null | head -5'
docker exec jenkins sh -c 'cat /var/jenkins_home/jobs/hello/config.xml 2>/dev/null | head -3'
```

| Path | Content |
|---|---|
| `config.xml` | global configuration |
| `jobs/NAME/config.xml` | each job's definition |
| `jobs/NAME/builds/N/` | build logs and results |
| `plugins/` | installed plugins |
| `secrets/` | the keys that decrypt stored credentials (**guard these**) |
| `nodes/` | agent definitions |
| `users/` | user data and API tokens |

### Back up and restore

A backup is a copy of that folder (exclude workspaces and caches). The secrets directory must be kept **with** the credentials or they cannot be decrypted, and the whole backup must be protected like a password vault.

```run
cd ~/lab
docker exec jenkins tar -czf /tmp/jenkins-backup.tar.gz -C /var/jenkins_home --exclude=workspace --exclude=caches --exclude=war . 
docker cp jenkins:/tmp/jenkins-backup.tar.gz ./jenkins-backup.tar.gz
tar -tzf jenkins-backup.tar.gz | grep -c "config.xml" | awk '{print "config.xml files in the backup:", ($1>0 ? "yes" : "no")}'
tar -tzf jenkins-backup.tar.gz | grep -E "^\./secrets/master.key$"
ls -l jenkins-backup.tar.gz | awk '{print "backup is a single archive:", ($5>0 ? "yes" : "no")}'
rm -f jenkins-backup.tar.gz
```

Restore means: stop Jenkins, extract into an empty home, start. Test it regularly; an untested backup is a hope. Also keep the **pipelines in Git** (they already are) so only configuration and history need backing up.

## Configuration as Code (JCasC)

Clicking through the UI to configure Jenkins is slow and not repeatable. The **Configuration as Code** plugin lets you describe the controller in a YAML file: security realm, authorisation, agents, credentials (referencing secrets from the environment), tools, global libraries. The same file recreates an identical Jenkins anywhere. **Example (not run here)**:

```yaml:jenkins.yaml (Example, not run here)
jenkins:
  systemMessage: "Managed by code. Do not change settings in the UI."
  numExecutors: 0                       # the controller runs no builds
  securityRealm:
    local:
      allowsSignup: false
      users:
        - id: "admin"
          password: "${ADMIN_PASSWORD}"  # injected from the environment, not stored in the file
  authorizationStrategy:
    roleBased:
      roles:
        global:
          - name: "developer"
            permissions: ["Overall/Read", "Job/Build", "Job/Read"]
            entries: [{ group: "developers" }]
  nodes:
    - permanent:
        name: "windows-build-1"
        remoteFS: "C:\\jenkins"
        labelString: "windows sql"
        launcher: { inbound: { workDirSettings: { disabled: false } } }
credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              id: "registry-login"
              username: "ci-bot"
              password: "${REGISTRY_PASSWORD}"
```

Plugins are managed in code too: a `plugins.txt` (`workflow-aggregator:latest`, `git`, `configuration-as-code`, `credentials-binding`, `kubernetes`) used by `jenkins-plugin-cli` when building your own controller **image**:

```dockerfile:Dockerfile (Example, not run here)
FROM jenkins/jenkins:lts-jdk17
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
COPY jenkins.yaml /var/jenkins_home/casc/jenkins.yaml
ENV CASC_JENKINS_CONFIG=/var/jenkins_home/casc/jenkins.yaml
```

Now the whole controller is an **image built from Git**: reviewed, versioned, disposable. Combined with Terraform (create the VM or cluster) and Kubernetes (run the controller and agents), Jenkins itself becomes infrastructure as code.

## Upgrading

- Use the **LTS** (long-term support) line for production; upgrade a few times a year, and apply security fixes quickly (advisories are published regularly).
- Take a **backup** first. Upgrade a **test copy** of the controller with the same plugins.
- Upgrade plugins in small batches; read the compatibility notes. Pin versions in `plugins.txt`.
- In a container setup, upgrading is "build a new image and redeploy" with the home on a persistent volume.

## Monitoring

| What | How |
|---|---|
| Queue length and wait time | the **Prometheus** metrics plugin and Grafana dashboards |
| Executor usage, build durations, failure rate | same; alert on trends |
| Disk space of `JENKINS_HOME` | node monitoring (see the Monitoring track) |
| Controller health | `/health`-style checks, JVM metrics (heap, GC) |
| Who changed what | audit trail plugin, config in Git |

```run
curl -sg "$JENKINS/queue/api/json?tree=items[id]" | python3 -c 'import sys,json; print("items waiting in the build queue:", len(json.load(sys.stdin)["items"]))'
curl -sg "$JENKINS/api/json?tree=assignedLabels[name],quietingDown" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("quiet-down mode:", d["quietingDown"])'
```

"Quiet down" mode (`/quietDown`) stops new builds starting so you can safely restart or upgrade.

## Jenkins versus the alternatives

The same pipeline in **GitHub Actions** (a YAML file in `.github/workflows/`), for comparison. **Example (not run here)**:

```yaml:.github/workflows/ci.yml (Example, not run here)
name: ci
on:
  push: {branches: [main]}
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint and test
        run: |
          bash -n ci/test.sh
          ./ci/test.sh
      - name: Build image
        run: docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
      - name: Push image
        if: github.ref == 'refs/heads/main'
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
```

| | **Jenkins** | **GitHub Actions** | **GitLab CI** | **Azure Pipelines** |
|---|---|---|---|---|
| Hosting | you run it (or a vendor) | hosted by GitHub (or self-hosted runners) | built into GitLab (hosted or self-managed) | hosted by Azure DevOps (or self-hosted agents) |
| Config | `Jenkinsfile` (Groovy) | YAML workflows | `.gitlab-ci.yml` | YAML |
| Extensibility | huge plugin ecosystem | marketplace of actions | templates, includes | extensions |
| Strengths | total flexibility, on-prem, legacy and Windows estates | tight GitHub integration, easy start | all-in-one platform | Microsoft stack integration |
| Cost of ownership | you maintain controller, plugins, agents | low | low to medium | low |

Choose by where your code lives and who maintains the platform. Jenkins is still very common in enterprises with large existing estates; many new projects start on a hosted service. The skills transfer completely: triggers, agents/runners, stages/jobs, caching, secrets, artifacts, environments and approvals.

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- `JENKINS_HOME` is plain files: back it up (with the `secrets` keys) and test the restore.
- Configuration as Code (`jenkins.yaml`) plus `plugins.txt` makes the controller reproducible from Git.
- Upgrade LTS with a backup and a test copy; monitor queue, executors and disk.
- GitHub Actions, GitLab CI and Azure Pipelines solve the same problem with different syntax.
:::

:::try Your turn
Translate the Jenkinsfile from lesson 3 into a GitHub Actions workflow. List which Jenkins concepts map to which Actions concepts.
:::

:::quiz
? What must you protect together with a Jenkins backup?
+ The `secrets` directory (keys that decrypt stored credentials), as the backup itself is sensitive
- Only the war file
- Nothing
- The workspace
! Without the keys, credentials cannot be decrypted; with them, the backup is a secret store.
? What does JCasC give you?
+ A YAML description of the controller's configuration, reproducible from Git
- Faster builds
- Free agents
- A new UI
! Configure Jenkins as code.
? Which Jenkins release line suits production?
+ LTS
- Weekly latest only
- Any beta
- Snapshot builds
! Stable with security fixes backported.
:::
