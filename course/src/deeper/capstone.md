=== capstone/01
## Answer and common mistakes

Adding `ev02` shows the division of labour:

1. **Terraform** sees a new key in the server map and plans **one addition**; the existing servers show no change.
2. **Ansible** runs against the new host and reports `changed` there only. On hosts already in the desired state it reports `ok`: that is idempotency.
3. When the unit test is broken on purpose, the pipeline stops at the test stage with a non-zero exit, so **nothing downstream (build, deploy) runs**. That is the whole point of a pipeline: a failed gate prevents a bad release.

:::warn Common mistakes
- **Fixing the server by hand** and not the code. The next pipeline run silently reverts or conflicts with your edit.
- **Skipping the plan review** because "it's only one server".
- **Bypassing the test gate** to meet a deadline.
- **Not keeping the pipeline files in Git,** so nobody can see why something changed.
:::

=== capstone/02
## Answer and common mistakes

A runbook entry has the same shape at every layer: *command → good result → bad result → next step*.

| Layer | Command | Bad result looks like |
|---|---|---|
| User / DNS | `nslookup ev-search.corp.local` | no answer or wrong IP |
| Network | `ping`, `nc -zv host 443` | timeout, `refused` |
| Firewall | `sudo ss -tlnp`, `sudo iptables -L -n` | port not listening, or dropped |
| Server | `df -h`, `free -m`, `systemctl status` | disk 100%, service failed |
| Container | `docker ps`, `docker logs` | restarting, exited |
| Kubernetes | `kubectl get pods`, `kubectl describe pod` | CrashLoopBackOff, Pending |
| Application | logs, metrics, `curl /health` | errors, 5xx, no metrics |
| Database | connectivity, free space, blocking | login failure, log full |

Work **from the user inward**: confirm the symptom, then walk down the layers, changing one thing at a time and writing down what you saw.

:::warn Common mistakes
- **Guessing and restarting things** before gathering evidence, which destroys the evidence.
- **Changing several things at once,** so you never learn what fixed it.
- **No post-incident review,** so the same fault returns.
:::
