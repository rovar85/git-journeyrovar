---
track: jenkins
title: Agents, security and scaling
short: Agents, security
sub: Run builds on the right machines, lock Jenkins down, and keep it healthy as teams grow.
---

:::goals
- explain agents, labels and the different ways to connect them
- describe Jenkins security layers and the most important hardening steps
- manage plugins and credentials safely
- know how teams scale Jenkins
:::

@setup jenkins

## Agents

The controller should only **orchestrate**. Builds run on **agents**:

| Agent type | How | Good for |
|---|---|---|
| **Permanent agent** (VM or server) | connects over SSH or an inbound **JNLP/WebSocket** agent process | Windows or special hardware, large caches |
| **Docker agent** | each build runs in a fresh container | clean, reproducible environments |
| **Kubernetes agents** (Kubernetes plugin) | a Pod is created per build and removed afterwards | elastic scale, no idle machines |
| **Cloud agents** (EC2/Azure VM plugins) | VMs are started on demand | bursts, specialised OS images |

Agents have **labels** (`linux`, `windows`, `gpu`, `docker`). A pipeline asks for what it needs with `agent { label 'windows && sql' }`, and Jenkins picks a matching free executor. A Windows build (for example packaging Enterprise Vault components) lands on a Windows agent, a container build on a Linux one.

Look at what this lab's Jenkins has (the built-in node only, and no plugins):

```run
curl -sg "$JENKINS/computer/api/json?tree=computer[displayName,numExecutors,offline]" | python3 -c 'import sys,json; [print(c["displayName"], "executors:", c["numExecutors"], "offline:", c["offline"]) for c in json.load(sys.stdin)["computer"]]'
curl -sg "$JENKINS/pluginManager/api/json?depth=1&tree=plugins[shortName]" | python3 -c 'import sys,json; print("installed plugins:", len(json.load(sys.stdin)["plugins"]))'
```

Starting a real inbound agent would use a connection secret like this (**Example, not run here**):

```term
$ java -jar agent.jar -url https://jenkins.example.com/ -secret <secret> -name build-linux-1 -webSocket -workDir /home/jenkins
```

Agent hygiene: keep tools versioned and identical (bake them into images), give agents **least privilege** (they run code from many repositories), and prefer **ephemeral** agents (a fresh one per build) so one build cannot poison the next.

## The Script Console and why it is dangerous

Jenkins has a Groovy **Script Console** (`/script`) that runs arbitrary code **inside the controller** with full access. It is a great admin tool and a total takeover if exposed. Real, here:

```run
cat > hello.groovy <<'EOF'
println "Jenkins version: " + jenkins.model.Jenkins.VERSION
println "Jobs: " + jenkins.model.Jenkins.instance.allItems.collect { it.name }.sort().join(", ")
println "Controller JVM: " + System.getProperty("java.version")
EOF
jcurl -g --data-urlencode "script@hello.groovy" "$JENKINS/scriptText" | sed -E 's/Jenkins version: .*/Jenkins version: <version>/'
```

Anyone who can reach `/script` can read all secrets and run anything. This is why **authentication and authorisation must be on** in a real Jenkins, as the next section covers. (In this lab security is off, but the server listens on loopback only.)

## Securing Jenkins

| Layer | Do |
|---|---|
| **Authentication** | enable a security realm: your company's LDAP/Active Directory, SAML/OIDC single sign-on (Okta, Entra ID), or Jenkins' own user database; never "anyone can do anything" |
| **Authorisation** | role-based or **matrix** permissions (Role Strategy, Matrix Authorization plugins): developers can build, only admins configure; read access limited per folder |
| **Controller isolation** | **0 executors on the controller** so no build code runs where the secrets are; the controller never runs untrusted jobs |
| **Credentials** | stored in the Credentials store (encrypted with a key on the controller), scoped to folders, referenced by ID; rotate them; prefer short-lived tokens; never commit them |
| **CSRF protection** | keep it on (you used crumbs above) |
| **API tokens** | give scripts per-user API tokens (revocable) instead of passwords |
| **TLS** | serve Jenkins behind HTTPS (reverse proxy or load balancer) |
| **Agent-to-controller security** | keep it enabled so agents cannot read or write controller files |
| **Plugins** | install few, from the official update site, and **update promptly**: plugins are the main source of Jenkins vulnerabilities (watch Jenkins security advisories) |
| **Script approvals** | sandboxed Groovy; admins approve risky methods deliberately |
| **Audit** | audit-trail plugin, shipped logs, who changed what |

A rule worth remembering: **anyone who can edit a Jenkinsfile or job configuration can run code on your agents and read the credentials those jobs can use.** Treat "can configure pipelines" as a powerful permission. For public pull requests, never expose secrets to builds of untrusted forks.

```run
curl -sg "$JENKINS/api/json?tree=useSecurity,useCrumbs,slaveAgentPort" | python3 -m json.tool
```

`useSecurity: false` on this lab server is exactly what you must never see on a real one.

## Credentials in practice

```term
Manage Jenkins > Credentials > (global) > Add Credentials
  Kind: Username with password | Secret text | SSH Username with private key | Secret file
  ID:   registry-login          <- the name pipelines use
  Scope: Global | System
  # Better: create folder-scoped credentials so a team sees only its own
```

External secret managers (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) have Jenkins plugins that fetch secrets at run time, so they are never stored in Jenkins at all.

## Scaling and reliability

| Challenge | Typical answer |
|---|---|
| Builds queue up | add agents; use Kubernetes/cloud agents that autoscale; more executors on beefy agents |
| One huge Jenkins | split into several controllers per team or product; use **folders** to organise and scope permissions |
| Slow builds | cache dependencies, run stages in parallel, use incremental builds, faster agents |
| Controller is a single point of failure | back up `JENKINS_HOME`, run in a container or VM that can be rebuilt quickly (Configuration as Code, next lesson), monitor it |
| Disk filling up | discard old builds (`buildDiscarder`), clean workspaces, rotate logs |
| Flaky tests | quarantine and fix; do not just auto-retry builds |

<!-- deeper -->
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
<!-- /deeper -->

:::recap
- Agents run builds; controllers orchestrate. Label agents; prefer ephemeral Docker/Kubernetes agents.
- The Script Console equals total control: lock Jenkins down with real authentication and authorisation.
- Zero executors on the controller; scoped, rotated credentials; few, updated plugins; HTTPS.
- Scale with more or elastic agents, folders and multiple controllers; keep `JENKINS_HOME` backed up.
:::

:::try Your turn
Write a short Jenkins security checklist for your organisation (ten bullets). Mark which items you could verify automatically with the REST API or a script.
:::

:::quiz
? Why should the controller have zero executors in production?
+ Build code should not run where the credentials and configuration live
- Executors are expensive
- Agents need them
- It speeds up the UI
! Isolation limits the damage from a malicious or buggy build.
? What is the biggest risk of an exposed Script Console?
+ Anyone could run arbitrary code with full access to secrets
- It slows builds
- It deletes logs
- It changes the theme
! Authentication and authorisation must be on.
? What gives a pipeline the right kind of machine?
+ Agent labels such as `agent { label 'windows' }`
- The Jenkins version
- The job name
- The credentials ID
! Labels route work to suitable agents.
:::
