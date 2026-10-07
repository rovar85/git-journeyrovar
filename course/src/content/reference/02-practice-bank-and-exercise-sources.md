---
track: reference
title: Practice bank: self-test questions, scenarios and where to find more exercises
short: Practice bank
sub: Forty-four original self-test questions across every track, ten scenario exercises with model approaches, and a guide to the devops-exercises repository for more practice.
---

:::note How to use this page
Reading is not learning; **retrieval** is. Try each question **before** looking at the options in your head, then check. Questions you miss show you which lesson to reread; the feedback line names the idea. The questions and scenarios on this page are **original, written for this course**. For hundreds more, see the last section.
:::

## 1. Linux and shell

:::quiz
? A file has permissions `rw-r-----` (640). Who can write to it?
+ Only the owner
- The owner and the group
- Everyone
- Nobody, including the owner
! 6 = rw for the owner, 4 = read for the group, 0 = nothing for others.
? What is the difference between `>` and `>>` in a shell command?
+ `>` replaces the file's contents; `>>` appends to it
- `>` appends; `>>` replaces
- They are identical
- `>>` redirects errors only
! A single `>` overwrites, which is how logs get lost by accident.
? You deleted a large log file but `df` still shows the disk full. Why?
+ A running process still holds the deleted file open, so its space is not freed until the process closes it or exits
- The file system is corrupt
- `df` only updates at midnight
- The recycle bin is full
! `lsof +L1` finds deleted-but-open files.
? Which signal cannot be caught or ignored by a process?
+ SIGKILL (9)
- SIGTERM (15)
- SIGHUP (1)
- SIGINT (2)
! SIGTERM asks politely; SIGKILL cannot be handled, so cleanup code never runs.
? What does `set -euo pipefail` do at the top of a Bash script?
+ Stops on errors, on unset variables, and when any command in a pipeline fails
- Makes the script run faster
- Hides all error messages
- Runs the script as root
! It turns silent failures into immediate stops.
:::

## 2. Networking

:::quiz
? How many usable host addresses does a /26 network have?
+ 62
- 64
- 126
- 30
! 2^6 = 64 addresses, minus the network and broadcast addresses.
? What does a "connection refused" error tell you, compared with a timeout?
+ The machine answered but nothing listens on that port; a timeout means the packets got no answer at all (often a firewall or a routing problem)
- The same thing
- The server is overloaded
- DNS failed
! Refused is a fast, definite no from the host; a timeout is silence.
? Which DNS record type maps a name to an IPv4 address?
+ A
- MX
- CNAME
- TXT
! A is IPv4, AAAA is IPv6, CNAME is an alias, MX is mail.
? Why does a host need a default gateway?
+ To send traffic for addresses outside its own subnet to a router
- To resolve names
- To assign its IP address
- To encrypt traffic
! Anything not on the local network goes to the gateway.
? What does NAT do in a typical home or cloud setup?
+ Rewrites private source addresses to a public one so many hosts share one public IP
- Encrypts packets
- Assigns private addresses
- Blocks all inbound traffic
! Outbound connections work; unsolicited inbound ones do not.
:::

## 3. Git

:::quiz
? What is the difference between `git fetch` and `git pull`?
+ Fetch downloads remote changes without merging; pull fetches and then merges (or rebases) into your branch
- They are the same
- Pull only works on new repositories
- Fetch deletes local branches
! Fetch is the safe look-before-you-merge step.
? Which command undoes a commit that is already shared, without rewriting history?
+ `git revert`
- `git reset --hard`
- `git commit --amend`
- `git rebase --root`
! Revert adds a new commit that cancels the old one.
? When is `git rebase` risky?
+ On commits that others have already pulled, because it rewrites history
- On local, unpushed commits
- On empty branches
- Never
! Rebase only commits that exist only on your machine.
? You edit `.gitignore` to include a file that is already tracked. What happens?
+ Nothing: ignoring only affects untracked files; the file must be removed from the index with `git rm --cached`
- The file is deleted
- The file is hidden from `git status` immediately
- Git refuses the edit
! Tracked files stay tracked until you untrack them.
? What is a "detached HEAD"?
+ HEAD points directly at a commit instead of a branch, so new commits belong to no branch unless you create one
- A corrupted repository
- A remote with no branches
- A merge conflict
! Create a branch before you commit from there.
:::

## 4. Docker

:::quiz
? An image has `ENTRYPOINT ["echo", "Hi"]` and `CMD ["there"]`. What does `docker run image bob` print?
+ Hi bob
- there
- Hi there bob
- bob
! Arguments after the image name replace CMD and are passed to the entrypoint.
? Why is a named volume usually better than writing into a container's filesystem?
+ Data in a volume survives container removal and does not slow down the writable layer
- Volumes are faster to type
- Containers cannot write files
- Volumes are encrypted
! The container's writable layer is deleted with the container.
? Does `EXPOSE 8080` in a Dockerfile make the port reachable from the host?
+ No, it only documents the port; `-p` publishes it
- Yes, always
- Only on Linux
- Only for UDP
! Publishing is a runtime decision.
? A container exits with code 137. What is the most likely cause?
+ It was killed with SIGKILL, often by the out-of-memory killer (128 + 9)
- Normal success
- A syntax error
- A missing image
! Exit codes above 128 mean death by signal.
? Why copy `package.json` and install dependencies before copying the rest of the source in a Dockerfile?
+ So the dependency layer is cached and not rebuilt whenever source code changes
- It makes the image smaller automatically
- Docker requires that order
- It avoids needing a registry
! Order layers from least to most frequently changing.
:::

## 5. Kubernetes

:::quiz
? Why do you normally create a Deployment instead of a bare Pod?
+ A Deployment keeps the desired number of Pods running and handles rolling updates and rollbacks
- Pods cannot run containers
- Deployments are faster
- Bare Pods cannot use Services
! A bare Pod is not replaced if its node dies.
? What happens to a Pod that fails its readiness probe?
+ It is removed from Service endpoints but not restarted
- It is restarted
- It is deleted
- Nothing
! Liveness restarts; readiness controls traffic.
? A Service has a ClusterIP but no endpoints. What do you check first?
+ Whether its selector matches the labels of Ready Pods
- The node's disk
- The CNI version
- The cluster's age
! Empty endpoints almost always mean selector, readiness or targetPort.
? What is the difference between resource requests and limits?
+ Requests are what the scheduler reserves for placement; limits are the ceiling the container may not exceed
- They are the same
- Limits are used for scheduling
- Requests apply only to memory
! Over the memory limit means OOM-kill; over the CPU limit means throttling.
? In a three-member etcd cluster, how many members can fail while the cluster keeps working?
+ One
- Two
- Zero
- Three
! A majority (2 of 3) must stay up.
? You update a ConfigMap used as an environment variable by a running Pod. What happens to the Pod's environment?
+ Nothing until the Pod is restarted; mounted ConfigMap files are updated eventually, environment variables are not
- It updates immediately
- The Pod is deleted
- The ConfigMap is rejected
! Environment variables are read at container start.
? What does `kubectl drain` do beyond `kubectl cordon`?
+ It also evicts the Pods (except DaemonSet Pods) so they reschedule elsewhere
- It deletes the node
- It upgrades the kubelet
- It restarts the API server
! Cordon only stops new scheduling.
? Which object grants permissions inside a single namespace?
+ A Role (bound with a RoleBinding)
- A ClusterRole bound cluster-wide only
- A ConfigMap
- A ServiceAccount alone
! ClusterRoles can also be bound within a namespace, but a Role is namespaced by definition.
:::

## 6. Infrastructure as code, configuration management and CI

:::quiz
? What does Terraform's state file record?
+ The mapping between your configuration and the real resources it created, with their attributes
- Your passwords
- The Terraform version only
- A backup of the cloud account
! Without state Terraform cannot know what it manages.
? Why read `terraform plan` output before `apply`?
+ It shows exactly what will be created, changed or destroyed, including replacements
- It is required by the license
- It makes apply faster
- It validates the cloud credentials only
! Lines with `-/+` mean destroy and recreate.
? What does it mean that an Ansible module is idempotent?
+ Running it again changes nothing if the system is already in the desired state
- It runs faster the second time
- It never fails
- It only runs once per host
! `changed=0` on the second run is the proof.
? What is an Ansible handler for?
+ A task that runs only when notified by a task that changed something, typically restarting a service once
- Handling errors
- Defining variables
- Running tasks in parallel
! Restart nginx only if its config actually changed.
? In a Jenkins declarative pipeline, what is the relationship between stages and steps?
+ A stage groups steps; steps are the individual actions such as `sh` commands
- They are the same
- Steps contain stages
- Stages run only on the controller
! Stages give the pipeline its visible structure.
:::

## 7. Monitoring and cloud

:::quiz
? What is the difference between a Prometheus counter and a gauge?
+ A counter only increases (use `rate()` to read it); a gauge can go up and down
- A gauge only increases
- They are the same
- Counters store text
! Requests served is a counter; memory in use is a gauge.
? An SLO of 99.9% over 30 days allows roughly how much bad time?
+ About 43 minutes
- About 4 hours
- About 7 minutes
- About 10 hours
! 0.1% of 43,200 minutes is 43.2.
? Why alert on user-visible symptoms rather than only on causes such as high CPU?
+ Users care about errors and latency; high CPU may be harmless and a real outage may have normal CPU
- CPU cannot be measured
- Symptoms are easier to graph
- Causes never matter
! Page on symptoms, use causes for diagnosis and early warning.
? What does the cloud "shared responsibility model" say?
+ The provider secures the cloud itself; you secure what you put in it and how you configure it
- The provider secures everything
- You secure everything
- Responsibility is shared equally in every service
! The split moves with the service model (IaaS, PaaS, SaaS).
? What do RPO and RTO mean?
+ RPO: how much data you can afford to lose (time); RTO: how long you can be down
- Both measure cost
- RPO is downtime, RTO is data loss
- They are network terms
! Backups set the RPO; recovery design sets the RTO.
:::

## 8. AI and AI infrastructure

:::quiz
? What does the KV cache store in LLM inference?
+ The keys and values of past tokens at every layer, so each decode step only computes the new token
- The model weights
- The user's chat history text
- The tokenizer
! It trades memory for avoided recomputation.
? Which phase decides time to first token, and which decides streaming speed?
+ Prefill sets time to first token; decode sets the speed of the following tokens
- Decode sets both
- Prefill sets streaming speed
- Neither
! Prefill is compute-bound, decode is memory-bandwidth-bound.
? In RAG evaluation, what does low groundedness (faithfulness) mean?
+ The answer contains claims not supported by the retrieved context
- Retrieval returned too few documents
- The question was ambiguous
- The index is old
! It is the signal for hallucination.
? What is the main safety risk when an agent reads web pages or files?
+ Prompt injection: the content can contain instructions that try to steer the agent
- Slow loading
- Large file sizes
- Missing images
! Treat tool output as data, never as instructions.
? Why is queue depth a better autoscaling signal than CPU for an LLM service?
+ It directly shows demand exceeding GPU capacity; CPU is not the bottleneck
- It is easier to collect
- CPU is always 100%
- GPUs have no CPU
! Scale on the resource that actually limits you.
? What does a GitOps agent such as Argo CD do when someone changes the cluster by hand?
+ With self-heal on, it reverts the change to match what is in Git
- Nothing
- Deletes the Git repository
- Locks the cluster
! Git is the source of truth; the agent reconciles.
:::

## 9. Scenario exercises

Longer exercises, each with a **model approach** (not the only answer). Do them on the lab or on paper first.

| # | Scenario | Model approach |
|---|---|---|
| 1 | A web server's disk is 100% full. Find the cause and free space safely. | `df -h`, then `du -xh --max-depth=1 / \| sort -h` on the full file system to find the largest tree, check for **deleted-but-open files** (`lsof +L1`), rotate or compress logs rather than delete, and add monitoring on free space |
| 2 | Users report "the site is slow" from one office only. | Reproduce from that office; compare `ping`, `traceroute`, DNS lookups and TLS handshake times to see which stage is slow; check the office's link, DNS resolver and any proxy before touching the servers |
| 3 | Two developers changed the same lines and the merge conflicts. | `git status`, open the conflict markers, **decide** what the combined result should be (talk to the other developer if unsure), remove markers, `git add`, `git commit`; use `git merge --abort` if you started wrongly |
| 4 | A container works on your laptop and crashes in production. | Compare environment variables, mounted files, user ID, resource limits and image digest; read `docker logs` and the exit code (137 = killed, often memory); reproduce with the same limits |
| 5 | A Deployment rolls out but half the requests fail. | `kubectl get endpoints`, readiness probes, `rollout status`, compare old and new ReplicaSet images, check for a missing config or an incompatible version; `kubectl rollout undo` to restore service first, investigate second |
| 6 | Terraform shows it will **destroy and recreate** the database. | Do not apply. Find which attribute forces replacement in the plan, check for a renamed resource (use `moved`) or a changed immutable field, and add `prevent_destroy` to protect stateful resources |
| 7 | An Ansible playbook reports `changed` on every run. | A non-idempotent task (usually `command` or `shell`): replace with a module, or add `creates:` or `changed_when:`; compare with `--check --diff` |
| 8 | The Jenkins build passes locally and fails in CI. | Compare tool versions, environment variables, working directory, permissions and network access on the agent; make the pipeline's environment explicit (a container or pinned tool versions) |
| 9 | A Prometheus alert fires every night at 02:00 and clears itself. | Look at the graph around the time, find the scheduled job (backup, batch), then either fix the cause, widen the `for:` duration if the blip is harmless, or silence it in a documented maintenance window |
| 10 | Your LLM service's p99 time to first token doubles after a new customer onboards. | Check queue depth and KV cache usage; the new customer's prompts may be much longer (prefill cost) or share no prefix; scale replicas, enable prefix caching, set per-tenant rate limits at the gateway |

## 10. More exercises: the devops-exercises repository

The GitHub repository **bregman-arie/devops-exercises** is a very large collection of DevOps questions and exercises, organised by topic, widely used for interview preparation. I read its README and licence for this page.

:::warn Licence: linked, not copied
The repository is published under **Creative Commons Attribution-NonCommercial-NoDerivatives 3.0 (CC BY-NC-ND 3.0)**. The **NoDerivatives** term means its questions and exercises must not be adapted or redistributed in modified form, so **this course does not copy or rewrite them**. It **links to them** instead, and the questions and scenarios on this page are my own. Always check the licence of any material you reuse.
:::

Use it **alongside** this course. Suggested pairing (the topic pages exist at the addresses below, which I checked; open them on GitHub):

| Course track | Topic page in the repository |
|---|---|
| Linux, Shell | [Linux](https://github.com/bregman-arie/devops-exercises/blob/master/topics/linux/README.md), [Shell scripting](https://github.com/bregman-arie/devops-exercises/blob/master/topics/shell/README.md) |
| Networking | [DNS](https://github.com/bregman-arie/devops-exercises/blob/master/topics/dns/README.md), and the Network section of the main README |
| Git | [Git](https://github.com/bregman-arie/devops-exercises/blob/master/topics/git/README.md) |
| Docker | [Containers](https://github.com/bregman-arie/devops-exercises/blob/master/topics/containers/README.md) |
| Kubernetes, CKA | [Kubernetes](https://github.com/bregman-arie/devops-exercises/blob/master/topics/kubernetes/README.md) and its [CKA page](https://github.com/bregman-arie/devops-exercises/blob/master/topics/kubernetes/CKA.md) (the page states its latest update was 2022, so check any version-specific answer against the current documentation) |
| Terraform, Ansible | [Terraform](https://github.com/bregman-arie/devops-exercises/blob/master/topics/terraform/README.md), [Ansible](https://github.com/bregman-arie/devops-exercises/blob/master/topics/ansible/README.md) |
| Jenkins, CI/CD | [CI/CD](https://github.com/bregman-arie/devops-exercises/blob/master/topics/cicd/README.md) |
| Monitoring | the Prometheus section of the main README, plus [Observability](https://github.com/bregman-arie/devops-exercises/blob/master/topics/observability/README.md) and [Grafana](https://github.com/bregman-arie/devops-exercises/blob/master/topics/grafana/README.md) |
| GitOps | [Argo](https://github.com/bregman-arie/devops-exercises/blob/master/topics/argo/README.md) |
| Cloud | [AWS](https://github.com/bregman-arie/devops-exercises/blob/master/topics/aws/README.md), [Azure](https://github.com/bregman-arie/devops-exercises/blob/master/topics/azure/README.md), [Google Cloud](https://github.com/bregman-arie/devops-exercises/blob/master/topics/gcp/README.md) |
| General DevOps and security | [DevOps](https://github.com/bregman-arie/devops-exercises/blob/master/topics/devops/README.md), [Security](https://github.com/bregman-arie/devops-exercises/blob/master/topics/security/README.md) |

How to use it well:

1. **Close the page, answer aloud or in writing**, then open the answer. Reading answers is not practice.
2. **Verify answers against the current documentation.** Community question banks age, and some answers are shallow or out of date.
3. **Turn questions into experiments.** When a question says "what happens if...", try it in the lab. Many answers become permanent only when you have seen the output.
4. **Keep a mistakes list.** Questions you miss twice get a lesson reread and a lab session.

:::recap
- Retrieval practice beats rereading: use the quizzes first, then the scenarios, then the external question banks.
- The scenario table shows the **method** for common incidents: reproduce, gather evidence, change one thing, verify.
- The devops-exercises repository is excellent extra practice; it is **CC BY-NC-ND**, so this course links to it rather than reproducing it.
:::

:::try Your turn
Pick the topic where you scored worst above. Open its page in the repository, answer ten questions **without looking**, and write down the three you got wrong. For each, find the lesson in this course that explains it, and run one command in the lab that demonstrates the answer.
:::
