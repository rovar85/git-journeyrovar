---
track: qbank
title: "CI/CD, Jenkins, Git, GitOps and Ansible: Basic questions (part 2 of 2)"
short: CI/CD basic 2
sub: 11 interview questions with plain-words answers, details, examples and the sentence to say out loud.
---

:::note Source and licence
These questions and answers come from the [DevOps Interview Question Bank](https://github.com/priyankagupta7679/devops-interview-question-bank) by Priyanka Gupta, licensed CC BY 4.0, reformatted for this course. Examples are shown as written in the source and were **not run here**; run the shell ones in the Lab or on a real machine. Questions this course already answers in a lesson are not repeated: see the first lesson of this track for the list.
:::

For each question: read **In simple words**, try to answer out loud, read the details, then compare with **What to say to the interviewer**. The flashcards in the Study view are made from these answers.

## Azure DevOps: What is the purpose of YAML pipeline templates?

<!-- source: 04 Q19 -->

:::note In simple words
A template is a form with blanks. The platform team designs the form once; every team fills in their own details. With an `extends` template, teams can only fill in the blanks - they cannot remove the security checks printed on the form.
:::

- **Reuse and consistency:** write build/test/deploy logic once, use it in every pipeline; fix once, fixed everywhere.
- **Types of templates:** **stage**, **job**, **step** and **variable** templates, included with `- template: path.yml`.
- **Parameters:** typed inputs (`string`, `boolean`, `object`, `stepList`) with defaults and allowed values, so a template can serve many services and environments.
- **`extends` templates for security:** the pipeline must extend an approved template; the template decides the structure (mandatory scans, approved tasks only) and can wrap the user's steps. Combine with the "Required template" check on environments or service connections so only pipelines extending it can deploy.
- **Central template repo:** keep templates in a separate repo, referenced via `resources: repositories` and pinned to a tag or branch (`ref: refs/tags/v2`).
- Equivalents: Jenkins **shared libraries**, GitHub Actions **reusable workflows** and composite actions, GitLab `include`.

**Example:**
```
# templates repo: deploy-stage.yml
parameters:
- name: env
  type: string
  values: [dev, staging, prod]
- name: service
  type: string
stages:
- stage: deploy_${{ parameters.env }}
  jobs:
  - deployment: deploy
    environment: ${{ parameters.env }}          # approvals and checks live here
    strategy:
      runOnce:
        deploy:
          steps:
          - script: helm upgrade --install ${{ parameters.service }} chart/ -f values-${{ parameters.env }}.yaml

# service repo: azure-pipelines.yml
resources:
  repositories:
  - repository: templates
    type: git
    name: Platform/pipeline-templates
    ref: refs/tags/v2
extends:
  template: secure-pipeline.yml@templates      # enforced structure with mandatory scans
  parameters:
    service: orders
```

:::say
YAML templates let us define stages, jobs, steps and variables once and reuse them with typed parameters across all services and environments. We keep them in a central repo referenced through resources repositories and pinned to a tag, and use extends templates plus the required-template check so every production pipeline must include our security scans. It is the Azure DevOps equivalent of Jenkins shared libraries or GitHub reusable workflows.
:::

## Ansible: What is the difference between push and pull configuration management?

<!-- source: 04 Q21 -->

:::note In simple words
Push is the teacher walking to every desk and handing out the worksheet. Pull is every student walking to the teacher's desk every 30 minutes to pick up the latest worksheet.
:::

| | Push | Pull |
| --- | --- | --- |
| Who starts | Central control node | Each managed node |
| Agent needed | No (SSH) | Yes (agent on node) |
| Tools | Ansible (default), Salt SSH | Puppet, Chef, ansible-pull |
| Timing | On demand, immediate | Periodic (e.g. every 30 min) |
| Good for | Ad-hoc changes, deployments, small/medium fleets | Very large fleets, self-healing drift correction |

- Push gives immediate control and simple setup, but the control node must reach every server.
- Pull scales well and auto-corrects drift, but changes are not instant and you must run agents.
- Ansible can also do pull with `ansible-pull` (node clones a Git repo and applies it via cron).

**Example:**
```bash
# Push (Ansible default)
ansible-playbook -i inventory/prod site.yml

# Pull (run on each node via cron)
*/30 * * * * ansible-pull -U https://github.com/org/config-repo.git local.yml
```

:::say
In push mode a central node connects out to servers and applies config immediately - Ansible works this way over SSH with no agent. In pull mode each server runs an agent that periodically fetches and applies config, like Puppet or Chef, which scales well and auto-fixes drift. Ansible also supports pull via ansible-pull.
:::

## Ansible: How do you manage Ansible inventory?

<!-- source: 04 Q22 -->

:::note In simple words
The inventory is Ansible's phone book - the list of servers, grouped by role, with any special details about each.
:::

- **Static inventory:** INI or YAML file listing hosts and groups (`[web]`, `[db]`), plus variables.
- **Separate per environment:** `inventory/dev`, `inventory/prod` - you pick with `-i`, so you never hit prod by accident.
- **group_vars / host_vars:** folders holding variables per group or host.
- **Dynamic inventory:** for cloud where IPs change - plugins like `amazon.aws.aws_ec2` query AWS and group hosts by tags.

**Example:**
```json
# inventory/prod/hosts.ini
[web]
web1.prod.internal
web2.prod.internal
[db]
db1.prod.internal ansible_user=ubuntu

# inventory/prod/aws_ec2.yml  (dynamic)
plugin: amazon.aws.aws_ec2
regions: [ap-south-1]
filters:
  tag:Env: prod
keyed_groups:
  - key: tags.Role
    prefix: role

ansible-inventory -i inventory/prod/aws_ec2.yml --graph
```

:::say
We keep separate inventories per environment with group_vars and host_vars for variables. For AWS we use the aws_ec2 dynamic inventory plugin that discovers instances by tags, so new autoscaled servers are picked up automatically without editing files.
:::

## How do you set up Jenkins from scratch on a fresh server?

<!-- source: 04 Q28 -->

:::note In simple words
Setting up a new factory: install the power supply (Java), install the machine (Jenkins), lock the doors (admin user, TLS), and hire workers (agents) so the manager's office isn't used as the shop floor.
:::

1. **Prerequisites:** a Linux VM (2+ vCPU, 4GB+ RAM, a separate disk for `/var/lib/jenkins`) and Java 17 or 21.
2. **Install:** from the official Jenkins apt/yum repository (LTS), or run the `jenkins/jenkins:lts` container with a persistent volume.
3. **Unlock:** read the initial admin password from `/var/lib/jenkins/secrets/initialAdminPassword`, install the suggested plugins, and create an admin user.
4. **Secure it:** put Nginx in front with TLS, set the Jenkins URL, enable security (matrix or role-based authorization, SSO if possible), and set the controller's executors to 0.
5. **Agents:** add build agents (SSH agents, Docker, or the Kubernetes plugin for ephemeral pods), so builds never run on the controller.
6. **Credentials and tooling:** add Git/registry/cloud credentials in the credentials store, and configure tools (JDK, Maven, Node) or use container agents.
7. **Configuration as Code:** capture settings in JCasC YAML and the plugin list in `plugins.txt`, so the server can be rebuilt.
8. **Backups and monitoring:** back up `JENKINS_HOME` (thinBackup or EBS snapshots), and add the Prometheus metrics plugin.

**Example:**
```bash
# Ubuntu, LTS repo
sudo apt update && sudo apt install -y fontconfig openjdk-17-jre
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | sudo tee /etc/apt/sources.list.d/jenkins.list
sudo apt update && sudo apt install -y jenkins
sudo systemctl enable --now jenkins
sudo cat /var/lib/jenkins/secrets/initialAdminPassword

# or Docker
docker run -d --name jenkins -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts-jdk17
```

:::say
I install Java 17 and Jenkins LTS from the official repo or run the LTS container with a persistent volume, unlock it with the initial admin password, install the suggested plugins and create an admin user. Then I secure it with TLS behind Nginx and role-based access, set the controller to zero executors, and add agents. Finally I capture the setup with JCasC and a plugin list so the server can be rebuilt, and back up JENKINS_HOME.
:::

## How do you install Jenkins plugins, and which plugins are most common in a CI/CD setup?

<!-- source: 04 Q29 -->

:::note In simple words
Jenkins on its own is a bare phone; plugins are the apps. Install only what you need and keep them updated, because too many apps slow the phone down and break after updates.
:::

**How to install:**
- UI: **Manage Jenkins -> Plugins -> Available**, search, install, and restart if needed.
- CLI or immutable images: list plugins in `plugins.txt` and run `jenkins-plugin-cli --plugin-file plugins.txt` in the Dockerfile. This is repeatable and version-pinned.
- Offline: upload the `.hpi` file under Advanced settings.
- Update carefully: check compatibility, test in staging, and back up `JENKINS_HOME` first, because plugin updates are the most common cause of broken Jenkins servers.

**Common plugins:**

| Purpose | Plugin |
| --- | --- |
| Pipelines | Pipeline (workflow-aggregator), Pipeline: Stage View |
| Source control | Git, GitHub Branch Source, Bitbucket Branch Source |
| Credentials | Credentials Binding, SSH Agent, AWS Credentials |
| Containers and K8s | Docker Pipeline, Kubernetes |
| Quality | JUnit, SonarQube Scanner, Warnings Next Generation |
| Notifications | Slack Notification, Office 365 Connector, Email Extension |
| Security and admin | Role-based Authorization Strategy, Configuration as Code |
| Usability | Timestamper, AnsiColor, Blue Ocean (legacy UI) |

**Example:**
```dockerfile
FROM jenkins/jenkins:lts-jdk17
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
# plugins.txt:
#   workflow-aggregator:latest
#   git:latest
#   kubernetes:latest
#   configuration-as-code:latest
```

:::say
For ad-hoc installs I use Manage Jenkins -> Plugins, but for production I bake plugins into the image with `jenkins-plugin-cli` and a pinned `plugins.txt`, so the setup is repeatable. The common ones are Pipeline, Git and GitHub Branch Source, Credentials Binding, Docker Pipeline, Kubernetes, JUnit, SonarQube, Slack or Teams notifications, Role-based Authorization and JCasC. I test plugin updates in staging, because they're the most common cause of breakage.
:::

## Git: what is the "detached HEAD" state, what causes it, and how do you fix it?

<!-- source: 04 Q30 -->

:::note In simple words
Normally you stand on a branch, a moving walkway, and new commits move it forward. In detached HEAD you've stepped off onto one specific tile (a commit). You can still walk around and make changes, but nothing is carrying them forward, so they're easy to lose.
:::

- **Causes:** `git checkout <commit-sha>`, `git checkout v1.2.0` (a tag), `git checkout origin/main` (a remote-tracking branch), during an interactive rebase or bisect. CI systems also check out a specific commit, which is why build logs often show it.
- **It's not an error.** It's useful for inspecting old code or building a tag.
- **To keep work done there:** create a branch from it: `git switch -c fix/from-old-commit`.
- **To just go back:** `git switch main`.
- **Lost the commits after switching away?** `git reflog` shows where HEAD has been, so you can create a branch from the lost SHA.

**Example:**
```bash
git checkout v2.3.0
# You are in 'detached HEAD' state...
git status              # HEAD detached at v2.3.0

# made a hotfix commit here and want to keep it:
git switch -c hotfix/2.3.1

# already switched away and lost it?
git reflog              # find: a1b2c3d HEAD@{2}: commit: fix null check
git branch recovered-fix a1b2c3d
```

:::say
Detached HEAD means HEAD points directly at a commit instead of a branch, usually because I checked out a tag, a SHA or a remote branch, or CI checked out a specific commit. It's fine for looking around, but new commits there aren't on any branch, so to keep them I run `git switch -c new-branch`. If I already switched away, `git reflog` lets me find the commit and recover it.
:::

## Git/GitHub: how do you give a specific team member access to a repository, and grant them write permission?

<!-- source: 04 Q31 -->

*Also asked as:* How do you grant write permissions to a contributor in a GitHub repository?

:::note In simple words
Hand out keys by role, not by person. Put people in teams (developers, QA, admins) and give each team the right level of key. When someone joins or leaves, you change the team, not every lock.
:::

- **Personal repository:** Settings -> Collaborators -> Add people. A collaborator on a personal repo gets write (push) access.
- **Organization repository (the right way):** add the person to a **team**, then give the team a role on the repo in Settings -> Collaborators and teams.
- **Roles:** Read (clone, open issues), Triage (manage issues and PRs), **Write** (push, merge PRs), Maintain (manage the repo without admin rights), Admin (settings, secrets, delete).
- **Write access still goes through branch protection:** protected `main`, required PR reviews, status checks and CODEOWNERS, so write doesn't mean "can push straight to production".
- Enforce SSO/2FA at the org level, review access regularly, and prefer fine-grained tokens or GitHub Apps for automation.

**Example:**
```bash
# Add a user as collaborator with write (push) permission
gh api -X PUT repos/my-org/meter-api/collaborators/jdoe -f permission=push

# Better: give a team write access
gh api -X PUT orgs/my-org/teams/backend-devs/repos/my-org/meter-api -f permission=push

# Check what someone has
gh api repos/my-org/meter-api/collaborators/jdoe/permission --jq .permission
```

:::say
For an organization repo I add the person to the right team and give that team the Write role, instead of adding individuals, so onboarding and offboarding happen in one place. Write lets them push branches and merge PRs, but branch protection still requires reviews and passing checks on main. For a personal repo I'd add them as a collaborator, and in all cases I enforce 2FA or SSO and review access periodically.
:::

## Git/GitHub: what is the difference between public and private repositories, and when would you use each?

<!-- source: 04 Q32 -->

:::note In simple words
A public repo is a shop window: anyone on the street can look and copy the design. A private repo is the back office: only people you give a key to can enter.
:::

| | Public | Private |
| --- | --- | --- |
| Who can see it | Anyone on the internet | Only invited users or teams |
| Forking | Anyone | Only people with access (if allowed) |
| Typical use | Open source, samples, docs, portfolios | Company code, infrastructure, configs |
| Risk | Any leaked secret is exposed instantly and scraped by bots | Lower exposure, but secrets still don't belong in Git |
| GitHub Actions | Free minutes on hosted runners | Uses the plan's minute quota |

- **Internal** repos (GitHub Enterprise) are visible to everyone in the company but not the public, which is good for inner-source.
- Company application code, Terraform, and anything with internal hostnames or architecture should be **private**.
- Before making a repo public, scan the whole history for secrets (gitleaks/trufflehog), not just the latest commit.

**Example:**
```bash
gh repo create my-org/infra-terraform --private
gh repo edit my-org/helm-charts --visibility public --accept-visibility-change-consequences
gitleaks detect --source . --log-opts="--all"     # scan the full history before going public
```

:::say
Public repos are visible to everyone and are for open-source work, samples or portfolios. Private repos are only for invited users or teams and are the default for company code and infrastructure. Before making anything public I scan the full Git history for secrets, because bots scrape public repos within minutes, and for company-wide sharing I use internal visibility.
:::

## Git: how does squash work, when do you use it, and which commands do you run?

<!-- source: 04 Q33 -->

:::note In simple words
You wrote ten messy draft notes while working on one feature. Squashing staples them into one clean note, "Add meter-read retry logic", before handing it to the team.
:::

- **What it does:** combines several commits into one, so the main branch history shows one meaningful commit per feature or fix.
- **When to use it:** before merging a feature branch full of "wip", "fix typo" and "try again" commits, or when team policy says one commit per PR.
- **When not to:** when individual commits matter for review, bisect or reverts, and never on branches others have already pulled without coordinating (it rewrites history).

**Three ways:**
1. **Interactive rebase:** `git rebase -i HEAD~4`, then mark commits as `squash` or `fixup` and edit the message.
2. **Merge with squash:** `git merge --squash feature` stages all changes as one new commit.
3. **GitHub/GitLab "Squash and merge"** button on the PR, the most common in teams.

**Example:**
```bash
git log --oneline -4
# 9f1c2aa fix lint
# 7d3b1e0 wip tests
# 4a8e9c1 wip retry
# 1c2d3e4 add retry logic

git rebase -i HEAD~4
# pick 1c2d3e4 add retry logic
# squash 4a8e9c1 wip retry
# fixup 7d3b1e0 wip tests
# fixup 9f1c2aa fix lint

git push --force-with-lease        # only on your own feature branch

# alternative:
git checkout main && git merge --squash feature/retry && git commit -m "Add meter-read retry logic"
```

:::say
Squash combines several commits into one so the main branch has one clean commit per change. I do it with `git rebase -i` and squash or fixup, with `git merge --squash`, or most often with the Squash and merge button on the PR. Because it rewrites history, I only squash my own feature branches and push with `--force-with-lease`.
:::

## Git: what is the difference between Git and GitHub?

<!-- source: 04 Q34 -->

:::note In simple words
Git is the camera that takes snapshots of your code. GitHub is the online photo album where you store the snapshots, share them, and let others comment on them.
:::

| | Git | GitHub |
| --- | --- | --- |
| What it is | A distributed version control tool | A cloud platform that hosts Git repositories |
| Runs where | On your machine, works offline | On the web (or GitHub Enterprise Server) |
| Made by | Linus Torvalds (2005), open source | GitHub Inc. (owned by Microsoft) |
| Does | Commits, branches, merges, history | PRs, code review, Issues, Actions CI/CD, Packages, security scanning, access control |
| Alternatives | Mercurial, SVN (centralized) | GitLab, Bitbucket, Azure Repos, Gitea |

- You can use Git without GitHub, but GitHub is useless without Git.
- In DevOps, GitHub is often the **trigger point**: a push or PR fires webhooks or GitHub Actions.

**Example:**
```bash
git init && git add . && git commit -m "first commit"        # Git only, local
git remote add origin git@github.com:my-org/app.git          # now connect to GitHub
git push -u origin main
gh pr create --fill                                          # GitHub feature (PR)
```

:::say
Git is the version control tool that tracks changes, branches and history, and it works fully offline on my laptop. GitHub is a hosting platform built around Git that adds pull requests, code review, Issues, Actions for CI/CD and access control. GitLab, Bitbucket and Azure Repos are alternatives to GitHub, not to Git.
:::

## Git: which useful Git commands are often ignored?

<!-- source: 04 Q38 -->

:::note In simple words
Most people only use the steering wheel and pedals. These are the less-known dashboard buttons: rear camera, cruise control, lane assist. They save you when things go wrong.
:::

| Command | Why it's useful |
| --- | --- |
| `git reflog` | Recover "lost" commits and branches |
| `git bisect start/good/bad` | Binary-search history to find the commit that introduced a bug |
| `git cherry-pick <sha>` | Copy one fix onto another branch (e.g. a hotfix onto a release branch) |
| `git blame -w -C <file>` | Who changed each line, ignoring whitespace and moved code |
| `git worktree add ../hotfix main` | Second working directory, so you can fix prod without stashing |
| `git stash -p` / `git add -p` | Stash or stage only selected hunks |
| `git log --oneline --graph --all` | Visual branch history |
| `git commit --fixup <sha>` + `git rebase -i --autosquash` | Clean fixes into the right commit |
| `git restore --staged <file>` | Unstage without losing changes |
| `git clean -nd` | Preview which untracked files would be deleted |
| `git shortlog -sn` | Commits per author |
| `git config rerere.enabled true` | Reuse recorded conflict resolutions during repeated rebases |
| `git switch -` | Jump back to the previous branch |

**Example:**
```bash
git bisect start
git bisect bad HEAD
git bisect good v2.1.0
git bisect run ./scripts/test_meter_parse.sh      # finds the first bad commit automatically
git bisect reset

git worktree add ../app-hotfix release/2.3        # fix prod without disturbing current work
```

:::say
The ones I rely on that people often skip are reflog for recovery, bisect to find the commit that introduced a bug, cherry-pick to move a hotfix between branches, and worktree to work on a hotfix without stashing. I also use `add -p` for clean commits, fixup plus autosquash to tidy history, and `clean -n` to preview deletions.
:::
