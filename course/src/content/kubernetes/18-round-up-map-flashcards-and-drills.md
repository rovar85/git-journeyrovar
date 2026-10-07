---
track: kubernetes
title: "Round-up: the map, flashcards and drills for Kubernetes"
short: Round-up
sub: One end-to-end map, flashcards made from every lesson, the tips nobody tells you, the few pages worth reading, and what to drill in round 2.
roundup: true
---

:::goals
- hold the whole track on **one map** and place every topic on it
- run the **gather, refine, drill, round 2** loop on this track
- drill the track's **flashcards** and the long procedures until they are boring
- know **which one to three documentation pages** to open, instead of reading everything
:::

## 1. The loop, for this track

1. **Gather (fast pass).** Go through lessons 1 to 17 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One kubectl command, through the whole cluster

Trace a request from kubectl to a running container, then to the network. Every Kubernetes topic, including security and troubleshooting, sits on one of these hops.

1. **kubectl**: Reads kubeconfig (cluster, user, context) and sends an HTTPS request to the API server. Lessons: [1](#kubernetes-1), [8](#kubernetes-8), [17](#kubernetes-17).
2. **API server**: Authenticates, authorizes (RBAC), runs admission, validates and persists. The only component that talks to etcd. Lessons: [1](#kubernetes-1), [8](#kubernetes-8), [11](#kubernetes-11), [17](#kubernetes-17).
3. **etcd**: The store of all cluster state: backup, restore, quorum, encryption at rest. Lessons: [1](#kubernetes-1), [11](#kubernetes-11), [17](#kubernetes-17).
4. **Controllers and scheduler**: Controllers reconcile desired vs actual (Deployments, ReplicaSets); the scheduler places pods using requests, taints, affinity. Lessons: [3](#kubernetes-3), [7](#kubernetes-7), [13](#kubernetes-13).
5. **Kubelet and runtime**: The node agent pulls images, starts containers through the runtime, runs probes, reports status; its own API must not be open. Lessons: [2](#kubernetes-2), [7](#kubernetes-7), [9](#kubernetes-9), [17](#kubernetes-17).
6. **Pod and container**: Pod spec: containers, resources, probes, securityContext, volumes, config and secrets. Lessons: [2](#kubernetes-2), [5](#kubernetes-5), [6](#kubernetes-6), [17](#kubernetes-17).
7. **Service networking**: Services, kube-proxy, DNS, Ingress, NetworkPolicy give stable names and paths to pods. Lessons: [4](#kubernetes-4), [14](#kubernetes-14), [17](#kubernetes-17).
8. **Detection and audit**: Audit logs, events, Falco-style runtime rules and alerts tell you what happened and who did it. Lessons: [17](#kubernetes-17).
9. **Operations and troubleshooting**: Rollouts, upgrades, node failure, logs, events, describe, a repeatable triage order. Lessons: [9](#kubernetes-9), [10](#kubernetes-10), [11](#kubernetes-11), [15](#kubernetes-15), [16](#kubernetes-16).
10. **Extending Kubernetes**: CRDs and operators add new object types and controllers. Lessons: [12](#kubernetes-12).

**Do this now:** [open the sketch pad for this track](#study/maps/kubernetes), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_kubernetes

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Set the exam aliases first: alias k=kubectl; export do='--dry-run=client -o yaml'. Generate YAML with k run/create ... $do and edit it instead of typing from scratch.
- kubectl explain pod.spec.containers.securityContext --recursive finds field names and types offline, which is faster than searching the docs.
- When something is not working: k get events --sort-by=.lastTimestamp, k describe, then k logs (add --previous for crashed containers).
- If the API server will not come back after you edited its static pod manifest, read the kubelet's view: journalctl -u kubelet | grep -i manifest, and crictl ps -a for the container.
- kubectl auth can-i VERB RESOURCE --as USER -n NS tests RBAC from the outside; use it before and after every role change.
- In Vim, :set mouse=a and :set expandtab tabstop=2 shiftwidth=2 save you from YAML indentation mistakes.
- For every scenario, know which documentation page answers it (or practise until you do not need it): kubernetes.io/docs/tasks is organised by job.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)
- [Kubernetes tasks (how-to by job)](https://kubernetes.io/docs/tasks/)
- [Kubernetes security concepts](https://kubernetes.io/docs/concepts/security/)

## 6. Round 2: make these boring

- Redo the CKA practice set against a clock, then redo only the ones you needed the docs for until they are boring.
- Practise the long procedures: etcd backup and restore, kubeadm-style upgrade order, RBAC for a user, NetworkPolicy, PV/PVC with a StorageClass.
- Break the cluster on purpose (stop the kubelet, corrupt a manifest, taint a node) and recover using only node-level tools.
- Trace one request through the map above out loud, naming the component and the log or command that proves each hop.

:::try Your turn
1. Without opening the lessons, write the map for this track on one page. Then compare it with section 2 and mark the hops you forgot.
2. Drill this track's flashcards until nothing is "Again", then switch the mode to **Round 2: missed cards**.
3. Pick the longest procedure in the track and do it from a blank terminal against the clock. Repeat until it is dull.
:::

:::recap
- One **map** holds the whole track; every topic is a hop on it.
- The loop is **gather, refine, drill, round 2**: fast pass, compact map and cards, repetition, then only the hard parts again.
- **Flashcards** come from the lessons; the schedule brings back what you miss.
- Learn **one to three pages** of a new tool's documentation, and drill the **long procedures** until they are boring.
:::
