"""Authoring file for the per-track study material (map, tips, docs, round-2 drills).
Run:  python3 src/study/build_maps.py   -> writes src/study/maps.json
Lesson numbers refer to the lesson number inside the track (the lesson list on each track page)."""
import json, os
H = lambda label, text, *lessons: {"label": label, "text": text, "lessons": list(lessons)}
D = lambda label, url: {"label": label, "url": url}

M = {}

M["linux"] = dict(
 title="One command, from keyboard to running service",
 intro="Trace what happens when you type a command and when a service misbehaves. Every Linux topic sits on one of these hops.",
 hops=[
  H("Shell", "You type; the shell parses quotes, expands variables and globs, finds the program through PATH, runs it, returns an exit code.", 1),
  H("Files and paths", "One tree from /. Absolute vs relative paths, links, inodes, what lives in /etc /var /home /proc.", 2),
  H("Streams and pipes", "stdin, stdout, stderr, redirection and pipes connect small tools; grep sed awk sort cut shape the text.", 3, 4),
  H("Permissions", "User, group, other; rwx as 4-2-1; umask; sudo; setuid. Who may touch this file or run this program?", 5),
  H("Processes", "Every program is a PID with a parent; signals, jobs, priorities, /proc show and control them.", 6),
  H("Packages and services", "Install with apt/dnf; run with systemd units; read logs with journalctl.", 7),
  H("Disks", "Block devices, filesystems, mounts, df/du, archives and compression.", 8),
  H("Automation", "Scripts, cron, ssh keys, environment variables: make it repeatable.", 9, 10),
  H("Troubleshooting and containers", "Triage CPU, memory, disk, network in a fixed order; containers are namespaces plus cgroups.", 11, 12),
 ],
 tips=[
  "Look up before you google: man -k keyword (or apropos), then COMMAND --help | less. Searching inside man pages with /pattern is a skill worth ten minutes.",
  "Ctrl-R searches your shell history; sudo !! re-runs the last command with sudo; Alt-. pastes the last argument.",
  "Start every script with set -euo pipefail and run it through shellcheck. Most script bugs are unquoted variables.",
  "When a service fails: systemctl status NAME shows the last log lines, journalctl -u NAME -e jumps to the end, and -f follows.",
  "Turn the mouse on in Vim with :set mouse=a (and :set number). Know how to leave: :q! quits without saving, ZZ saves and quits.",
  "Read permissions as three numbers: 7=rwx, 6=rw-, 5=r-x, 4=r--. Check with stat -c '%a %U:%G' file.",
 ],
 docs=[D("man pages online (man7.org)", "https://man7.org/linux/man-pages/"), D("GNU Bash manual", "https://www.gnu.org/software/bash/manual/bash.html"), D("systemd.service manual", "https://man7.org/linux/man-pages/man5/systemd.service.5.html")],
 round2=["Break a service on purpose (wrong path in the unit file, wrong permissions on a config) and fix it using only systemctl and journalctl.",
         "Explain out loud what happens for: cat access.log | grep ' 500 ' | sort | uniq -c > out.txt (which process writes where).",
         "Write a script that checks disk, memory and a service, exits non-zero on trouble, and runs from cron.",
         "Re-do the Troubleshooting lesson from a blank page, in the same order, without notes."],
)

M["networking"] = dict(
 title="One packet, from your app to another machine",
 intro="Follow a single request down the stack and across the wire. Each networking topic is a hop on the path.",
 hops=[
  H("Application name", "You use a name (service.example.com). DNS turns it into an IP address.", 6),
  H("Socket and port", "The app opens a TCP or UDP socket to IP:port; ports select the service.", 5),
  H("Transport (TCP)", "Three-way handshake, ordering, retransmission, timeouts; states you read with ss.", 5),
  H("IP and subnet decision", "Is the destination on my subnet? Masks and CIDR decide local delivery or gateway.", 1, 2),
  H("Routing", "The routing table picks the next hop (ip route); default gateway when nothing matches.", 4),
  H("Link layer", "ARP maps the next hop's IP to a MAC; switches forward frames on a LAN.", 1, 3),
  H("Firewall and NAT", "nftables/iptables filter and rewrite addresses on the way (chains, tables, SNAT/DNAT).", 7),
  H("TLS and verification", "Certificates, chains, SNI; ping, traceroute, curl -v, dig, tcpdump to prove each hop.", 8),
 ],
 tips=[
  "Test in layers, bottom up: ip a (address), ip route (path), ping gateway, ping IP, dig name, curl -v URL. The first failing step names the layer.",
  "ss -tulpn shows what is listening and which process owns it; a service bound to 127.0.0.1 is not reachable from outside.",
  "A ping that works does not prove TCP works: use nc -vz host port or curl to test the real port.",
  "dig +short name, dig @server name (ask a specific resolver) and dig +trace separate a DNS problem from a network problem.",
  "tcpdump -ni any host X and port Y answers 'is the packet even arriving?' faster than guessing.",
 ],
 docs=[D("ip(8) manual", "https://man7.org/linux/man-pages/man8/ip.8.html"), D("ss(8) manual", "https://man7.org/linux/man-pages/man8/ss.8.html"), D("Netfilter documentation", "https://www.netfilter.org/documentation/")],
 round2=["Given only an IP and a mask, say the network, broadcast, host range and whether two addresses can talk directly (do five by hand).",
         "Build a two-subnet lab with a router namespace, then break routing, DNS and firewall one at a time and diagnose each with the layered test.",
         "Explain what NAT does to a packet in both directions, using a table of source and destination before and after.",
         "Capture a TLS handshake with tcpdump and name each step."],
)

M["git"] = dict(
 title="One change, from edit to shared history",
 intro="A change moves through four places. Every Git command moves it between two of them.",
 hops=[
  H("Working tree", "Files you edit. git status and git diff show what changed.", 1),
  H("Staging area", "git add chooses exactly what goes into the next commit (git add -p for hunks).", 1),
  H("Local history", "Commits are snapshots linked in a graph; branches are movable labels.", 1, 2),
  H("Merge or rebase", "Combine histories: merge keeps the shape, rebase rewrites it. Conflicts are resolved by hand.", 2),
  H("Remote", "fetch downloads, pull = fetch + merge, push uploads; upstream tracking links branches.", 3),
  H("Review and teamwork", "Pull requests, small commits, good messages, protected branches.", 3, 5),
  H("Undo and rescue", "restore, reset, revert, reflog: pick the one that does not destroy shared history.", 4),
 ],
 tips=[
  "reflog is the safety net: git reflog lists where HEAD has been, so almost any lost commit can be found and restored.",
  "Never rewrite history others have pulled. On shared branches use git revert, not reset or force-push.",
  "git log --oneline --graph --all --decorate is the map; alias it.",
  "git add -p and git commit -v make small, reviewable commits (review your own diff first).",
  "git stash is for interruptions; git switch -c for experiments; both beat 'copy the folder'.",
 ],
 docs=[D("Git reference manual", "https://git-scm.com/docs"), D("Pro Git book", "https://git-scm.com/book/en/v2"), D("git-reflog", "https://git-scm.com/docs/git-reflog")],
 round2=["Create a conflict deliberately, resolve it, then do it again with rebase. Explain the difference in the resulting graph.",
         "Recover a deleted branch and a commit lost by git reset --hard, using only reflog.",
         "Split one big messy change into three clean commits with add -p.",
         "Explain fetch vs pull vs push by drawing the four places and the arrows."],
)

M["python"] = dict(
 title="One program, from idea to tested tool",
 intro="The coding track builds a tool in layers. Each layer adds one habit that real automation needs.",
 hops=[
  H("Run and read", "Variables, types, print, the REPL; read error messages from the last line up.", 2),
  H("Data", "Lists and dictionaries hold the state of a problem; loops and conditions process it.", 3, 4),
  H("Functions", "Name a step, pass inputs, return outputs; small functions are testable.", 5),
  H("Errors and data formats", "try/except, validation, JSON in and out; never trust input.", 6),
  H("Classes", "Group state and behaviour (an investigation, a lab) into objects.", 7),
  H("Simulation and diagnosis", "A fake lab plus a loop that observes and decides.", 8),
  H("Tests and measurement", "pytest-style checks, metrics, traces: prove it works and keep proving it.", 9, 10),
  H("Real models and tools", "Secrets, APIs, an MCP server, AI-assisted coding: the same habits, bigger scale.", 11, 12),
 ],
 tips=[
  "Read the traceback from the bottom: the last line is the error, the lines above show the path.",
  "Use python3 -m venv .venv and pip install -r requirements.txt; never install project packages globally.",
  "print() is fine; better is a failing test that reproduces the bug, then fix until it passes.",
  "json.dumps(obj, indent=2) and pprint make unknown data readable; type() and dir() tell you what you hold.",
  "f-strings with = (f'{x=}') print the name and value together while debugging.",
 ],
 docs=[D("Python tutorial", "https://docs.python.org/3/tutorial/"), D("Standard library reference", "https://docs.python.org/3/library/"), D("pytest documentation", "https://docs.pytest.org/")],
 round2=["Rewrite one lesson's program from memory with a function per step, then add three tests.",
         "Feed your tool bad input (empty file, wrong types, huge numbers) and make it fail clearly, not mysteriously.",
         "Add logging and a --dry-run flag to a script that changes things.",
         "Explain a class you wrote in two sentences: what state, what behaviour."],
)

M["docker"] = dict(
 title="One container, from Dockerfile to production",
 intro="Follow an image from instructions to a running, networked, persistent, observable container.",
 hops=[
  H("Dockerfile", "Instructions build layers: FROM, COPY, RUN, USER, CMD; order controls cache and size.", 4),
  H("Image and registry", "Layers are content-addressed and shared; tags name them, digests pin them.", 2),
  H("Container runtime", "A running image: its own process tree, filesystem, network (namespaces) and limits (cgroups).", 1, 3),
  H("Ports and config", "Publish ports, pass environment variables, set CPU and memory limits.", 3),
  H("Volumes", "Data that must outlive the container lives in volumes or bind mounts.", 5),
  H("Networking", "User-defined networks give DNS between containers; bridge, host, none.", 6),
  H("Compose", "Several containers as one app described in a file.", 7),
  H("Production and debugging", "Healthchecks, logs, exec, inspect, restart policies, image scanning and slimming.", 8, 9),
 ],
 tips=[
  "docker logs -f NAME, docker exec -it NAME sh and docker inspect NAME answer 90% of 'why is it not working'.",
  "Order Dockerfile steps from least to most frequently changing (dependencies before source) to keep the build cache.",
  "Run as a non-root USER, and pin base images by tag (better: digest).",
  "docker system df shows what is eating disk; docker system prune cleans up (read the prompt).",
  "A container exits when its main process exits: a container 'Exited (0)' immediately usually has the wrong CMD.",
 ],
 docs=[D("Dockerfile reference", "https://docs.docker.com/reference/dockerfile/"), D("docker CLI reference", "https://docs.docker.com/reference/cli/docker/"), D("Docker Compose", "https://docs.docker.com/compose/")],
 round2=["Shrink an image by half (multi-stage build, slim base) and explain each saving.",
         "Break a Compose stack (wrong network, missing volume, bad env) and diagnose with logs, exec and inspect.",
         "Explain why data vanished when a container was removed, and how to prevent it.",
         "Describe namespaces and cgroups in one sentence each, and show one of each from the host."],
)

M["jenkins"] = dict(
 title="One commit, from push to deployed",
 intro="A pipeline is a conveyor belt. Each Jenkins topic is a station on it.",
 hops=[
  H("Trigger", "A push, a schedule or a manual run starts a build.", 1),
  H("Agent", "Where the work runs: controller, node, container; labels choose the machine.", 5),
  H("Job and parameters", "Freestyle jobs, parameters and chained jobs: the basics of automation.", 1, 2),
  H("Pipeline as code", "Jenkinsfile: stages, steps, post actions, declarative syntax, kept in Git.", 3),
  H("Build, test, package", "Compile, unit tests, build an image, archive artefacts, publish reports.", 4),
  H("Deploy", "Promote the same artefact through environments with approvals and checks.", 4),
  H("Credentials and security", "Credentials store, least privilege, folders and roles, script approval.", 5),
  H("Operations", "Backups, plugins, upgrades, monitoring the CI itself, and when alternatives fit better.", 6),
 ],
 tips=[
  "Keep the pipeline in Git (Jenkinsfile) and treat it like code: review it, test it, version it.",
  "Build once, deploy many: the artefact tested in staging must be the one promoted to production.",
  "Never echo secrets: use the credentials binding, and know that masking is not a security boundary.",
  "Use the 'Replay' feature and the Pipeline Syntax snippet generator instead of guessing step syntax.",
  "A flaky test is a bug in the test or the code: fix or quarantine with a ticket, do not just re-run.",
 ],
 docs=[D("Pipeline syntax reference", "https://www.jenkins.io/doc/book/pipeline/syntax/"), D("Using a Jenkinsfile", "https://www.jenkins.io/doc/book/pipeline/jenkinsfile/"), D("Securing Jenkins", "https://www.jenkins.io/doc/book/security/")],
 round2=["Write a Jenkinsfile from memory: checkout, build, test, publish report, deploy with an approval, post-failure notify.",
         "Make a build fail in each stage on purpose and read the log to find the cause quickly.",
         "Explain where each secret lives and who can read it.",
         "List what you would back up and monitor on the Jenkins server."],
)

M["ansible"] = dict(
 title="One playbook run, from inventory to changed hosts",
 intro="Ansible describes the desired state; each topic is a part of how it reaches it.",
 hops=[
  H("Inventory", "Which hosts, in which groups, with which variables.", 1),
  H("Connection", "SSH, users, become (sudo); ansible -m ping proves the path.", 1),
  H("Modules and tasks", "Idempotent modules (package, service, copy, template) describe state, not commands.", 1, 2),
  H("Playbooks", "Plays map groups to tasks; handlers react to changes; check mode previews.", 2),
  H("Variables and templates", "Precedence, facts, Jinja2 templates, conditionals and loops.", 3),
  H("Roles", "Reusable, structured bundles of tasks, defaults, templates.", 4),
  H("Vault and secrets", "Encrypt sensitive vars; keep keys out of Git.", 5),
  H("Real-world use", "Tags, limits, serial rollouts, testing, running from CI.", 6),
 ],
 tips=[
  "Use --check --diff before changing anything real; idempotent playbooks report changed=0 on the second run.",
  "ansible-doc MODULE shows module options and examples offline; you rarely need a browser.",
  "Prefer modules over shell/command; if you must, add creates/changed_when so it stays idempotent.",
  "-vvv shows the SSH command and the module arguments: the answer to 'why did it do that'.",
  "Limit blast radius with --limit host and serial: 1 for rolling changes.",
 ],
 docs=[D("Playbook guide", "https://docs.ansible.com/ansible/latest/playbook_guide/index.html"), D("Builtin modules", "https://docs.ansible.com/ansible/latest/collections/ansible/builtin/index.html"), D("Vault guide", "https://docs.ansible.com/ansible/latest/vault_guide/index.html")],
 round2=["Take a manual server setup you know and turn it into a role with defaults, a template and a handler.",
         "Run it twice and prove idempotency; then change one variable and read the diff.",
         "Encrypt a secret with vault and use it in a template without printing it.",
         "Break the connection (wrong user, key, become) and diagnose from the error."],
)

M["terraform"] = dict(
 title="One plan, from code to real infrastructure",
 intro="Terraform compares code, state and reality. Everything you learn hangs from that triangle.",
 hops=[
  H("Configuration", "HCL blocks: providers, resources, variables, outputs, locals.", 1, 2),
  H("Init", "Downloads providers and modules and sets the backend; lock file pins versions.", 1),
  H("Graph", "References create dependencies; count/for_each create many; depends_on for hidden ones.", 3),
  H("Plan", "Refresh, compare code with state, show create/update/replace/destroy.", 1, 6),
  H("Apply", "Executes the plan, records results; locking prevents two writers.", 1, 4),
  H("State", "The map from code to real objects: remote backend, locking, import, moved, drift.", 4),
  H("Modules", "Reusable units with inputs and outputs; version and test them.", 5),
  H("Workflow and cloud patterns", "fmt/validate/test, CI plan on PR, apply the saved plan, multi-environment layouts.", 6, 7),
 ],
 tips=[
  "terraform plan -out=tfplan then terraform apply tfplan: apply exactly what was reviewed.",
  "terraform console evaluates expressions; terraform state list/show tells you what Terraform believes exists.",
  "Read replacement warnings ('must be replaced', 'forces replacement') before typing yes, every time.",
  "Never edit state by hand; use terraform state mv/rm, moved blocks and import blocks.",
  "Commit .terraform.lock.hcl; pin module and provider versions; keep secrets out of variables files in Git.",
 ],
 docs=[D("Terraform language", "https://developer.hashicorp.com/terraform/language"), D("CLI commands", "https://developer.hashicorp.com/terraform/cli/commands"), D("State", "https://developer.hashicorp.com/terraform/language/state")],
 round2=["Draw code, state and reality on paper and mark what each command reads and writes.",
         "Cause drift, a replacement, a dependency error and a state lock, and fix each (see the scenarios track).",
         "Turn a copy-pasted configuration into a module with validated inputs and a test.",
         "Explain what happens if two people run apply at once, and how to prevent it."],
)

M["kubernetes"] = dict(
 title="One kubectl command, through the whole cluster",
 intro="Trace a request from kubectl to a running container, then to the network. Every Kubernetes topic, including security and troubleshooting, sits on one of these hops.",
 hops=[
  H("kubectl", "Reads kubeconfig (cluster, user, context) and sends an HTTPS request to the API server.", 1, 8, 17),
  H("API server", "Authenticates, authorizes (RBAC), runs admission, validates and persists. The only component that talks to etcd.", 1, 8, 11, 17),
  H("etcd", "The store of all cluster state: backup, restore, quorum, encryption at rest.", 1, 11, 17),
  H("Controllers and scheduler", "Controllers reconcile desired vs actual (Deployments, ReplicaSets); the scheduler places pods using requests, taints, affinity.", 3, 7, 13),
  H("Kubelet and runtime", "The node agent pulls images, starts containers through the runtime, runs probes, reports status; its own API must not be open.", 2, 7, 9, 17),
  H("Pod and container", "Pod spec: containers, resources, probes, securityContext, volumes, config and secrets.", 2, 5, 6, 17),
  H("Service networking", "Services, kube-proxy, DNS, Ingress, NetworkPolicy give stable names and paths to pods.", 4, 14, 17),
  H("Detection and audit", "Audit logs, events, Falco-style runtime rules and alerts tell you what happened and who did it.", 17),
  H("Operations and troubleshooting", "Rollouts, upgrades, node failure, logs, events, describe, a repeatable triage order.", 9, 10, 11, 15, 16),
  H("Extending Kubernetes", "CRDs and operators add new object types and controllers.", 12),
 ],
 tips=[
  "Set the exam aliases first: alias k=kubectl; export do='--dry-run=client -o yaml'. Generate YAML with k run/create ... $do and edit it instead of typing from scratch.",
  "kubectl explain pod.spec.containers.securityContext --recursive finds field names and types offline, which is faster than searching the docs.",
  "When something is not working: k get events --sort-by=.lastTimestamp, k describe, then k logs (add --previous for crashed containers).",
  "If the API server will not come back after you edited its static pod manifest, read the kubelet's view: journalctl -u kubelet | grep -i manifest, and crictl ps -a for the container.",
  "kubectl auth can-i VERB RESOURCE --as USER -n NS tests RBAC from the outside; use it before and after every role change.",
  "In Vim, :set mouse=a and :set expandtab tabstop=2 shiftwidth=2 save you from YAML indentation mistakes.",
  "For every scenario, know which documentation page answers it (or practise until you do not need it): kubernetes.io/docs/tasks is organised by job.",
 ],
 docs=[D("kubectl quick reference", "https://kubernetes.io/docs/reference/kubectl/quick-reference/"), D("Kubernetes tasks (how-to by job)", "https://kubernetes.io/docs/tasks/"), D("Kubernetes security concepts", "https://kubernetes.io/docs/concepts/security/")],
 round2=["Redo the CKA practice set against a clock, then redo only the ones you needed the docs for until they are boring.",
         "Practise the long procedures: etcd backup and restore, kubeadm-style upgrade order, RBAC for a user, NetworkPolicy, PV/PVC with a StorageClass.",
         "Break the cluster on purpose (stop the kubelet, corrupt a manifest, taint a node) and recover using only node-level tools.",
         "Trace one request through the map above out loud, naming the component and the log or command that proves each hop."],
)

M["monitoring"] = dict(
 title="One signal, from the code to a page at 3 a.m.",
 intro="Follow a measurement from instrumentation to an alert someone acts on.",
 hops=[
  H("Instrument", "The code exposes counters, gauges and histograms with a few well-chosen labels.", 3),
  H("Scrape and store", "Prometheus pulls /metrics on an interval and stores time series.", 1, 2),
  H("Query", "PromQL: selectors, rate(), sum by, histogram_quantile for percentiles.", 2),
  H("Visualise", "Dashboards answer 'is it healthy' with the golden signals: latency, traffic, errors, saturation.", 1, 4),
  H("Alert", "Rules fire on symptoms users feel; routing, grouping and silences decide who is paged.", 3),
  H("Logs and traces", "Logs explain why; traces show where in the request path.", 4),
  H("SLOs", "Targets, error budgets and burn-rate alerts turn monitoring into decisions.", 4),
 ],
 tips=[
  "Use rate() on counters, never raw counters; histogram_quantile(0.99, sum by (le) (rate(x_bucket[5m]))) for p99.",
  "Alert on symptoms (error rate, latency) not causes (CPU high); keep causes for dashboards.",
  "Labels multiply series: never put user IDs, URLs or timestamps in labels (cardinality).",
  "up == 0 is the first query when a target seems missing; the Targets page tells you why.",
  "Every alert needs an owner, a runbook link and a clear action; delete alerts nobody acts on.",
 ],
 docs=[D("Prometheus querying basics", "https://prometheus.io/docs/prometheus/latest/querying/basics/"), D("Metric and label naming", "https://prometheus.io/docs/practices/naming/"), D("Google SRE book", "https://sre.google/sre-book/table-of-contents/")],
 round2=["Write the four golden-signal queries for a service you know, from memory.",
         "Compute an error budget and a burn-rate alert for a 99.9% SLO.",
         "Find and fix a high-cardinality label in a metric.",
         "Take an alert that fires too often and decide: tune, delete or turn into a ticket."],
)

M["windows"] = dict(
 title="One PowerShell pipeline, from object to action",
 intro="PowerShell passes objects, not text. Every topic is a way to find, shape or act on objects.",
 hops=[
  H("Cmdlets and help", "Verb-Noun commands; Get-Help, Get-Command and Get-Member discover everything.", 1),
  H("Pipeline of objects", "Where-Object, Select-Object, Sort-Object, ForEach-Object work on properties.", 1, 2),
  H("Files and data", "Providers, CSV/JSON/XML in and out, Import/Export.", 2),
  H("Scripts and functions", "Parameters, error handling (try/catch, -ErrorAction), modules.", 3),
  H("Windows administration", "Services, processes, event logs, registry, scheduled tasks, remoting.", 4),
 ],
 tips=[
  "Get-Command *noun* and Get-Help cmd -Examples are faster than searching the web; | Get-Member shows what an object can do.",
  "Use -WhatIf and -Confirm on anything that changes or deletes.",
  "Filter early (-Filter on the cmdlet) before piping to Where-Object for speed.",
  "$ErrorActionPreference='Stop' with try/catch makes scripts fail loudly.",
  "ConvertTo-Json -Depth 5 and Format-List * reveal everything inside an object.",
 ],
 docs=[D("PowerShell overview", "https://learn.microsoft.com/powershell/scripting/overview"), D("PowerShell module reference", "https://learn.microsoft.com/powershell/module/"), D("about_ topics", "https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about")],
 round2=["Rebuild a Linux text pipeline you know as a PowerShell object pipeline.",
         "Write a script with parameters, validation, -WhatIf support and a log file.",
         "Query the event log for the last hour of errors and export a summary CSV.",
         "Explain why Select-String and Where-Object are different tools."],
)

M["cloud"] = dict(
 title="One workload, from account to production",
 intro="The shared responsibility stack: you move up or down it when you choose IaaS, PaaS or serverless.",
 hops=[
  H("Account and organisation", "Accounts, subscriptions, regions, billing and guardrails.", 1),
  H("Identity", "Users, roles, policies, least privilege, short-lived credentials.", 2),
  H("Network", "Virtual networks, subnets, security groups, gateways, private connectivity.", 2),
  H("Compute", "VMs, containers, serverless: who patches what.", 1, 3),
  H("Storage and data", "Object, block, file, databases; durability vs availability.", 1, 3),
  H("Operate", "Monitoring, backup, cost control, automation, resilience across zones and regions.", 3),
 ],
 tips=[
  "Draw the shared-responsibility line for every service you use: what is the provider's job, what is yours?",
  "Never use the root account day to day; use roles, MFA and short-lived credentials.",
  "Tag every resource with owner, environment and cost centre on day one.",
  "Prefer managed services unless you have a reason; operations is the expensive part.",
  "Set budgets and alerts before you create anything.",
 ],
 docs=[D("AWS Well-Architected", "https://aws.amazon.com/architecture/well-architected/"), D("Azure Well-Architected", "https://learn.microsoft.com/azure/well-architected/"), D("Google Cloud Architecture Framework", "https://cloud.google.com/architecture/framework")],
 round2=["Compare the same three services across two providers in a table.",
         "Design a two-tier app on paper: network, identity, compute, data, monitoring, cost.",
         "List five ways an account can be compromised and the control that stops each.",
         "Then continue with the senior cloud and scenarios tracks."],
)

M["cloudsenior"] = dict(
 title="One answer structure for senior cloud questions",
 intro="Every senior question wants the same shape: clarify, frame, design, trade off, prove, prevent.",
 hops=[
  H("Clarify", "Requirements, constraints, RTO/RPO, budget, compliance, who owns it.", 1, 2),
  H("Frame", "Name the principle (resilience, least privilege, build once deploy many, governance as platform).", 3, 4, 13),
  H("Design", "Accounts and networks, data, compute choice, pipelines, security, observability.", 3, 6, 8, 10),
  H("Trade off", "Cost vs availability, speed vs control, build vs buy; say what you give up.", 2, 5, 7),
  H("Prove", "Tests, drills, metrics, SLOs, a worked example or a real incident.", 9, 12),
  H("Prevent and improve", "Automation, guardrails, post-incident learning, standards and ADRs.", 9, 14, 15),
 ],
 tips=[
  "Open with the requirements you assume and ask one clarifying question; seniors scope first.",
  "Always give trade-offs: 'I chose X because Y; the cost is Z; I would revisit if W'.",
  "Use your own real story for Q9 and Q15; these lessons give the structure, not your experience.",
  "Quantify: RTO/RPO, error budgets, cost per month, burn rate: numbers signal seniority.",
  "End each answer with how you would detect failure and how you would improve next time.",
 ],
 docs=[D("AWS Well-Architected", "https://aws.amazon.com/architecture/well-architected/"), D("Google SRE workbook", "https://sre.google/workbook/table-of-contents/"), D("FinOps Framework", "https://www.finops.org/framework/")],
 round2=["Answer each question out loud in under two minutes, then under five, recording yourself.",
         "For each answer write the follow-up you fear most and answer it.",
         "Pair a design question with a scenario from the scenarios track and tell them as one story.",
         "Keep a one-page 'my real examples' sheet: incident, migration, cost saving, standard."],
)

M["scenarios"] = dict(
 title="One troubleshooting method for scenario questions",
 intro="Scenario questions reward a method, not a guess. The same loop solves all nine.",
 hops=[
  H("Define the symptom", "What exactly fails, for whom, since when, what changed?", 9),
  H("Draw the path", "List the components the request crosses (DNS, Service, Endpoints, pod, policy; or code, state, reality).", 2, 5),
  H("Split the path", "Test at the middle: bypass a layer to find which half is broken.", 2, 3),
  H("Read the evidence", "Events, conditions, plans, traces: let the system say why (describe, plan, logs).", 4, 6),
  H("Fix the cause", "Change the smallest thing that explains the evidence; avoid fixing symptoms.", 1, 7),
  H("Verify and prevent", "Measure the fix, add a guardrail, test, alert or runbook.", 7, 8),
 ],
 tips=[
  "State the model before the commands: how it should work, then where it deviates.",
  "Bypass one layer at a time (pod IP instead of Service, plan instead of apply, curl instead of the browser).",
  "Read 'Events' and 'Conditions' first; Kubernetes and Terraform usually tell you why.",
  "Never apply or restart to 'see what happens' in production.",
  "Close with prevention: a test, an alert or a policy so it cannot recur.",
 ],
 docs=[D("Kubernetes: debug applications", "https://kubernetes.io/docs/tasks/debug/debug-application/"), D("Kubernetes: debug clusters", "https://kubernetes.io/docs/tasks/debug/debug-cluster/"), D("Terraform: refresh-only and drift", "https://developer.hashicorp.com/terraform/cli/commands/plan")],
 round2=["Recreate each scenario from scratch on the lab without looking, then explain the fix.",
         "Mix them: break two things at once and separate them with the method.",
         "Teach one scenario to someone else in five minutes.",
         "Time yourself on the triage ladder for S2 and S6."],
)

M["capstone"] = dict(
 title="One lab as code, end to end",
 intro="The capstone ties tracks together: one description builds the whole lab.",
 hops=[
  H("Infrastructure", "Provision machines and networks as code.", 1),
  H("Configuration", "Configure them with automation.", 1),
  H("Delivery", "Build, test and deploy through a pipeline.", 1),
  H("Run and observe", "Containers or Kubernetes plus monitoring and alerts.", 1),
  H("Skills plan", "Map what you can do, what is missing, and a learning plan.", 2),
 ],
 tips=["Rebuild the lab from zero twice; the second time should be boring.", "Write down every manual step you took; each one is a missing automation.", "Keep a README that a stranger could follow.", "Break something and recover from backups.", "Show the pipeline green and the dashboards live."],
 docs=[D("Terraform language", "https://developer.hashicorp.com/terraform/language"), D("Ansible playbook guide", "https://docs.ansible.com/ansible/latest/playbook_guide/index.html"), D("Kubernetes tasks", "https://kubernetes.io/docs/tasks/")],
 round2=["Rebuild everything from a clean machine using only your repository.", "Add a failing test and see the pipeline stop the bad change.", "Add one new service end to end (code, container, pipeline, monitoring).", "Present the lab in five minutes."],
)

M["reference"] = dict(
 title="One habit: look it up the fast way",
 intro="The reference is for recall under pressure. Practise searching it before you need it.",
 hops=[
  H("Find", "Use the search box with the verb you want (list, delete, copy).", 1),
  H("Understand", "Read what it does and when to use it, not just the flags.", 1),
  H("Try", "Run it on something safe and read the output.", 2),
  H("Drill", "Use the practice bank until the common commands are automatic.", 2),
 ],
 tips=["Flashcards on commands beat re-reading them: use the Drill view and pick 'commands'.", "Group commands by job (find, change, inspect) not by tool.", "Know three flags well for each command rather than thirty badly.", "When stuck, run it with --help first.", "Keep your own cheat sheet of what you actually used this week."],
 docs=[D("man pages online", "https://man7.org/linux/man-pages/"), D("kubectl quick reference", "https://kubernetes.io/docs/reference/kubectl/quick-reference/"), D("Git reference", "https://git-scm.com/docs")],
 round2=["Do the practice bank without opening the reference.", "Explain five commands you have never typed.", "Rewrite one long pipeline in two ways.", "Teach someone the three commands you use most."],
)

M["ai"] = dict(
 title="One question, from prompt to agent",
 intro="Follow a request through a language model, then through the loop that makes it an agent.",
 hops=[
  H("Tokens and embeddings", "Text becomes tokens, then vectors that carry meaning.", 1, 2),
  H("Model", "A Transformer predicts the next token from the whole context using attention.", 2),
  H("Training", "Pre-training learns language; fine-tuning and preference tuning shape behaviour.", 3, 4),
  H("Prompting", "Instructions, examples and context steer the model without changing weights.", 5),
  H("Knowledge and tools", "Retrieval adds facts; tools let it act; both fix a model's weaknesses.", 6),
  H("Agent loop", "Observe, decide, act, repeat, with memory, budgets and stop conditions.", 7, 8),
  H("Evaluate", "Test cases, trajectories, pass@k, cost; do not trust demos.", 9),
  H("Connect, secure, ship", "MCP, safety against injection, production architecture, design and defend.", 10, 11, 12, 13, 14),
 ],
 tips=[
  "Write the evaluation before the agent; a test set of 20 real cases beats opinions.",
  "Treat all model output as untrusted input: validate before acting.",
  "Start with the simplest thing that could work (a prompt, then a workflow, then an agent).",
  "Log every model call with inputs, outputs, tokens and cost; you cannot debug what you cannot see.",
  "Keep a budget (steps, tokens, money) and a human approval step for risky actions.",
 ],
 docs=[D("Attention Is All You Need", "https://arxiv.org/abs/1706.03762"), D("Anthropic: Building effective agents", "https://www.anthropic.com/engineering/building-effective-agents"), D("Model Context Protocol", "https://modelcontextprotocol.io/")],
 round2=["Explain next-token prediction, attention and temperature to a friend without jargon.",
         "Build a tiny agent with a step budget and three tools, and write ten tests for it.",
         "Attack your own agent with a prompt injection and fix it.",
         "Defend your design in five minutes against the review-board questions."],
)

M["aideep"] = dict(
 title="One model, with the maths and code behind each hop",
 intro="The deep-dive companions: each lesson opens one hop of the AI map with runnable code.",
 hops=[
  H("Probabilities", "Logits, softmax, sampling, cross-entropy, perplexity.", 1),
  H("Transformer", "BPE, embeddings, positions, attention by hand, context cost.", 2),
  H("Learning", "Gradient descent, scaling arithmetic, data quality.", 3),
  H("Post-training", "Chat format, reward models, DPO, honest evaluation.", 4),
  H("Prompting and RAG", "Prompt anatomy, validation, retrieval metrics, tools.", 5, 6),
  H("Agents", "Loop, state, patterns, evaluation harness, MCP.", 7, 8, 9, 10),
  H("Engineering", "Build, test, trace, secure and operate an agent; design and defend.", 11, 12, 13, 14),
 ],
 tips=["Run each script, then change one number and predict the result before you rerun.", "Do the 'Practice' answers last, after writing yours.", "Keep a glossary of every symbol (d_model, d_k, temperature).", "When a formula is confusing, compute it with tiny numbers by hand.", "Link each deep dive back to its overview chapter and write one sentence of what it added."],
 docs=[D("Attention Is All You Need", "https://arxiv.org/abs/1706.03762"), D("LoRA", "https://arxiv.org/abs/2106.09685"), D("Chinchilla scaling laws", "https://arxiv.org/abs/2203.15556")],
 round2=["Re-derive softmax with temperature and cross-entropy by hand.", "Implement attention from scratch without looking.", "Explain DPO in four sentences.", "Build and run a small evaluation harness for any prompt."],
)

M["lectures"] = dict(
 title="One LLM, from tokens to evaluation and trends",
 intro="The nine lectures follow the life of a model: input, architecture, generation, training, alignment, reasoning, tools, evaluation, what is next.",
 hops=[
  H("Tokens and attention", "BPE, embeddings, self-attention, the Transformer.", 1),
  H("Variants", "RoPE, RMSNorm, pre-norm, GQA, sliding window; BERT, T5, GPT.", 2),
  H("Generation", "Decoder-only LLMs, MoE, decoding, prompting, KV cache, speculative decoding.", 3),
  H("Training", "Pre-training, scaling laws, parallelism, FlashAttention, quantisation, SFT, LoRA.", 4),
  H("Alignment", "Reward models, PPO, DPO, reward hacking.", 5),
  H("Reasoning", "Thinking chains, verifiable rewards, pass@k, GRPO.", 6),
  H("Tools and agents", "RAG, tool calling, ReAct, MCP.", 7),
  H("Evaluation", "Kappa, LLM-as-a-judge, factuality, pass^k, benchmarks.", 8),
  H("Trends", "Vision transformers, diffusion LLMs, model collapse, small models.", 9),
 ],
 tips=["After each lecture lesson, write the one-page map in your own words, then compare with the lesson.", "Run every script and change a constant; predict the effect first.", "Make flashcards from the 'Interview-style questions' sections.", "Read the cited paper's abstract and one figure, not the whole paper.", "Re-do the lectures a second time with only the quizzes and the practice."],
 docs=[D("Attention Is All You Need", "https://arxiv.org/abs/1706.03762"), D("DPO paper", "https://arxiv.org/abs/2305.18290"), D("DeepSeek-R1", "https://arxiv.org/abs/2501.12948")],
 round2=["Explain RoPE, GQA and FlashAttention each in two sentences.", "Draw the training pipeline and mark where PPO, DPO and GRPO fit.", "Derive the pass@k estimator.", "Design an LLM-judge evaluation with its biases and mitigations."],
)

M["aifield"] = dict(
 title="One research idea, from paper to practice",
 intro="Each paper adds one capability to the agent loop. Map them onto it.",
 hops=[
  H("Reason", "Chain of thought, self-consistency, tree of thoughts: think before answering.", 1),
  H("Act", "ReAct and Toolformer: interleave thinking with tool calls.", 2),
  H("Reflect", "Reflexion: learn from failed attempts.", 3),
  H("Remember", "Generative agents and memory: store, retrieve, reflect.", 4, 9),
  H("Retrieve", "RAG surveys: chunking, retrieval, ranking.", 5),
  H("Code", "Agentic coding practices and tool design (ACI).", 6, 7),
  H("Compare and plan", "Vendor guides compared; crews, browsers; a study map.", 8, 9, 10),
 ],
 tips=["Read abstract, figure 1 and the results table first; decide if the rest is worth it.", "For every paper write: problem, idea, evidence, limits.", "Reproduce one idea in 30 lines of code.", "Compare papers by what they cost (tokens, time) not just accuracy.", "Keep a running list of terms in your glossary."],
 docs=[D("ReAct", "https://arxiv.org/abs/2210.03629"), D("Anthropic: Building effective agents", "https://www.anthropic.com/engineering/building-effective-agents"), D("Model Context Protocol", "https://modelcontextprotocol.io/")],
 round2=["Summarise five papers in one table: problem, idea, cost, limit.", "Implement ReAct in 50 lines.", "Design the memory for an agent that works for a week.", "Write your own reading plan for the next month."],
)

M["aiinfra"] = dict(
 title="One inference request, from GPU to platform",
 intro="Follow a request through the hardware and the serving stack, then through the platform that ships it.",
 hops=[
  H("GPU and memory", "Compute vs memory bandwidth, HBM, what fits where.", 1),
  H("Prefill and decode", "Two phases with different bottlenecks; the KV cache stores the past.", 2),
  H("Measure", "TTFT, tokens per second, throughput vs latency, percentiles.", 3),
  H("Serve", "vLLM-style engines, continuous batching, paged attention.", 4),
  H("Scale out", "Tensor, pipeline and data parallelism, sharding, routing.", 5, 6),
  H("Platform", "GitOps, Argo CD, KEDA autoscaling, MLflow and Kubeflow.", 7, 8),
  H("Observe and plan", "Metrics for GPUs and models, benchmarks, a reference architecture.", 9, 10),
 ],
 tips=["Decide the SLO (TTFT and tokens/s) before choosing hardware.", "Measure p95/p99, not averages; load-test with realistic prompt lengths.", "Memory, not compute, usually limits concurrency: do the KV-cache arithmetic.", "Autoscale on queue depth or tokens/s, not CPU.", "Keep model, config and prompts in Git and deploy through GitOps."],
 docs=[D("vLLM documentation", "https://docs.vllm.ai/"), D("Argo CD", "https://argo-cd.readthedocs.io/"), D("KEDA", "https://keda.sh/docs/")],
 round2=["Compute KV-cache size for a model and context length and the concurrency that fits on a GPU.", "Explain prefill vs decode and why batching helps decode.", "Sketch the reference architecture and mark each failure mode.", "Design an autoscaling policy and its alerts."],
)


_ql = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "qbank_lessons.json")))["lessons"]
def _q(topic): return [l["n"] for l in _ql if l["topic"] == topic]
M["qbank"] = dict(
 title="One answer shape for every interview question",
 intro="Whatever the topic, a strong answer has the same four beats. Use the topic lessons as the raw material.",
 hops=[
  H("Say it simply", "One everyday picture so the interviewer hears you understand the idea, not just the words.", 1),
  H("Name the parts", "List the components or steps in order. For scenario questions, list the request path or the triage order.", *_q("01")[:2], *_q("02")[:1]),
  H("Show the evidence", "Name the exact command or metric you would check first, and what a bad result looks like.", *_q("03")[:2], *_q("08")[:1]),
  H("Give the fix and the trade-off", "A fix without a trade-off sounds junior. Say what it costs and when you would not use it.", *_q("04")[:2], *_q("05")[:1], *_q("06")[:1]),
  H("Close with the sentence", "Finish with the two or three sentences from 'What to say to the interviewer', in your own words.", *_q("07")[:1], *_q("09")[:1], *_q("10")[:1]),
 ],
 tips=[
  "Cover the answer, say yours out loud, then compare. Reading is not remembering.",
  "Do Basic first for your stack, then Scenario-based: most interviews are troubleshooting.",
  "Prepare two real stories (an incident, a migration) from your own work; the behavioural lessons show the shape.",
  "If you do not know, say how you would find out: the command, the doc page, who you would ask.",
  "Run the examples in the Lab or a free real machine; hands-on answers sound different.",
 ],
 docs=[D("Source repository (CC BY 4.0)", "https://github.com/priyankagupta7679/devops-interview-question-bank"), D("Kubernetes documentation: Tasks", "https://kubernetes.io/docs/tasks/"), D("Terraform documentation", "https://developer.hashicorp.com/terraform/docs")],
 round2=[
  "Redo only the cards you missed, then answer the Scenario lessons for your stack without looking.",
  "Pick five questions at random and answer each in 60 seconds, out loud, then compare.",
  "Pair a scenario question with a real incident from your own history and tell them as one story.",
 ],
)
json.dump(M, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "maps.json"), "w"), indent=1, ensure_ascii=False)
print("wrote", len(M), "tracks")
