---
track: secops
title: "Detection and incident response"
short: Incident response
sub: Prevention fails sometimes. Read an authentication log, detect a brute-force attack and the login that succeeded, build a timeline, and follow the incident response steps; then interview questions.
---

:::goals
- explain why detection and response matter as much as prevention
- detect brute force, a success after failures and an unusual location from log lines
- build a timeline for an incident
- follow the incident response lifecycle and answer common interview questions
:::

## 1. Assume something gets through

No set of controls is perfect. What decides the damage is how fast you **notice** and how well you **respond**. That needs logs collected centrally (a **SIEM** such as Splunk, Microsoft Sentinel or the Elastic stack), detection rules that turn log lines into alerts, and a practised plan.

## 2. Detect an attack in a log

The script generates a day of SSH login lines in the usual Linux format (with a country added, as a log pipeline would enrich it), including an attack, then reads the text back and applies three rules.

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > incident.py <<'EOF'
# Detection from logs: brute force, a success after many failures, and a login from a new country.
# The log is generated (a fixed seed, so the run repeats); its lines look like a Linux auth log.
import collections, datetime, random
random.seed(7)
t0 = datetime.datetime(2026, 11, 12, 1, 0, 0)
HOME = {"asha": "IN", "ben": "IN", "chen": "SG", "root": "IN"}
events = []
for i in range(40):                                   # normal staff logins
    u = random.choice(["asha", "ben", "chen"])
    events.append((t0 + datetime.timedelta(minutes=random.randint(0, 600)), "Accepted", u, f"10.0.0.{random.randint(2, 40)}", HOME[u]))
for i in range(5):                                    # a few typos
    events.append((t0 + datetime.timedelta(minutes=random.randint(0, 600)), "Failed", "ben", "10.0.0.7", "IN"))
start = t0 + datetime.timedelta(hours=3, minutes=12)  # the attack: guessing, then a hit
for i in range(60):
    events.append((start + datetime.timedelta(seconds=4 * i), "Failed", random.choice(["root", "admin", "asha"]), "203.0.113.50", "NL"))
events.append((start + datetime.timedelta(seconds=245), "Accepted", "asha", "203.0.113.50", "NL"))
events.sort()
log = [f"{t:%b %d %H:%M:%S} web1 sshd[{900 + n}]: {r} password for {u} from {ip} port {40000 + n} ssh2 country={c}"
       for n, (t, r, u, ip, c) in enumerate(events)]
print(len(log), "log lines, for example:"); print(" ", log[0]); print(" ", log[-1])

# parse back from text, as a real detector would
rows = []
for line in log:
    p = line.split()
    rows.append((datetime.datetime.strptime("2026 " + " ".join(p[:3]), "%Y %b %d %H:%M:%S"), p[5], p[8], p[10], p[-1].split("=")[1]))

alerts, window, fails = [], datetime.timedelta(minutes=5), collections.defaultdict(list)
for t, result, user, ip, country in rows:
    if result == "Failed":
        fails[ip] = [x for x in fails[ip] if t - x <= window] + [t]
        if len(fails[ip]) == 10: alerts.append((t, "HIGH", f"brute force: 10 failures from {ip} within 5 minutes"))
    else:
        recent = [x for x in fails[ip] if t - x <= window]
        if len(recent) >= 10: alerts.append((t, "CRIT", f"success for {user} from {ip} after {len(recent)} failures: likely compromised"))
        if country != HOME[user]: alerts.append((t, "HIGH", f"{user} logged in from {country}, usually {HOME[user]}"))
print("\nalerts:")
for t, sev, msg in alerts: print(f"  {t:%H:%M:%S} {sev:4} {msg}")
print("\ntimeline for 203.0.113.50:")
mine = [r for r in rows if r[3] == "203.0.113.50"]
print(f"  first seen {mine[0][0]:%H:%M:%S}, {sum(r[1] == 'Failed' for r in mine)} failures, users tried: {sorted({r[2] for r in mine})}")
print(f"  {mine[-1][0]:%H:%M:%S} login accepted as {mine[-1][2]}")
print("  next steps: lock the asha account, end its sessions, block the IP, keep the logs, check what the session did")
EOF
python3 incident.py
```

- **Brute force:** 10 failures from one address within 5 minutes. Normal typos (ben's five failures over the day) do not trigger it: the **time window** is what separates an attack from a bad morning.
- **Success after failures:** the most important alert. Guessing is noise; a guess that **worked** is an incident.
- **New location:** asha always logs in from India; this login came from another country.

Real detections work the same way, written in the SIEM's query language (for example Splunk SPL or Sentinel KQL) over millions of lines. Tune them on real data so alerts stay rare and meaningful.

## 3. The incident response lifecycle

The common model (from NIST SP 800-61) has four phases:

1. **Preparation:** logging, runbooks, contacts, access for responders, practice exercises.
2. **Detection and analysis:** confirm the alert is real, find the scope (which accounts, hosts, data), build a **timeline**.
3. **Containment, eradication and recovery:** stop the spread first (lock the account, end sessions, block the IP, isolate the host), then remove the cause (rotate credentials, patch, rebuild from a clean image), then restore service and watch closely.
4. **Post-incident activity:** a **blameless** review: what happened, why controls missed it, what changes (here: MFA would have stopped the login; the SSH port should not face the internet, [lesson 9](#secops-9)).

Keep evidence (copies of logs, disk snapshots) before you clean up, write down every action with the time, and know when the law or your contracts require you to tell customers or regulators.

## 4. Interview questions (try them before reading the answers)

:::say How would you secure a new web application end to end?
I would start with a threat model of the main data flows and rank the risks. Then: authentication with MFA and single sign-on for staff, an authorisation check on every request, parameterised queries and output escaping, secrets in a secret store with short-lived credentials, TLS everywhere and encryption at rest. In the pipeline: secret scanning, SAST, dependency and image scanning, IaC policies, a signed image verified at deploy. In production: least-privilege roles, no public admin ports, central logging with alerts on things like a success after many failures, and a practised incident plan.
:::

:::say An API key was pushed to a public repository. What do you do?
Revoke and replace the key first, because bots find public keys within minutes. Then check the provider's logs for any use since the push and investigate anything unexpected. Then remove it from the code and, if needed, from history, and add push protection and a pre-commit scan so it cannot happen again. Finally, move that service to short-lived credentials if possible.
:::

:::say What is the difference between authentication and authorisation, and what is IDOR?
Authentication proves who someone is; authorisation decides what they may do. IDOR is a broken authorisation check: the app uses an ID from the request, such as an order number, without checking that the logged-in user owns it, so changing the number shows someone else's data. The fix is an ownership check on the server for every request, denied by default, with tests that try cross-user access.
:::

:::say How do you add security to a CI/CD pipeline without slowing teams down?
Fast checks on every pull request (secrets, SAST, dependency and IaC scanning) with findings posted as PR comments; heavier scans nightly. Start in report-only mode, fix the backlog, then block only on critical and high findings. Allow reviewed exceptions with an owner and an expiry. Sign images at build and verify them at deploy. Measure time to fix rather than the number of tools.
:::

## Common misconceptions

- "If we were breached, we would know." Many breaches are found months later, often by outsiders; detection has to be built and tested.
- "Wipe the server straight away." Contain first, but keep evidence; without it you cannot learn the scope or the cause.
- "Incident reviews are for finding who to blame." Blame makes people hide mistakes; blameless reviews fix the system.

## Practice (answers below)

1. Change the brute-force rule in `incident.py` to 20 failures in 2 minutes. Does it still fire?
2. Add a rule that alerts on any successful login as `root`.
3. During an incident, why lock the account and end its sessions before rotating every other credential?

:::recap
- Prevention fails; **detection and response** limit the damage.
- Good detections use **time windows** and context: brute force, **success after failures**, unusual location.
- Incident response: **prepare; detect and analyse; contain, eradicate, recover; review blamelessly**. Keep evidence and a timeline.
:::

:::note Answers
1. The attack makes a guess every 4 seconds, 30 per 2 minutes, so 20 failures within 2 minutes still happen and it fires (at the 20th failure). 2. In the `else` branch: `if user == "root": alerts.append((t, "HIGH", f"root login from {ip}"))` (and better, disable direct root login over SSH). 3. Containment first: the attacker has a live session now; stopping it limits further damage while you work out the full scope.
:::

```quiz
? Which alert most clearly signals an incident rather than noise?
+ A successful login right after many failures from the same address
- Five typos in a day
- A login from the usual office
- A password change
! A guess that worked means the attacker is in.

? What comes first after confirming an account is compromised?
+ Containment: lock the account and end its sessions
- Write the post-incident report
- Delete all logs
- Buy a new firewall
! Stop the damage, then investigate and fix.

? What is the purpose of a blameless post-incident review?
+ To find and fix the system gaps that allowed the incident
- To decide who to fire
- To close the ticket quickly
- To avoid writing anything down
! People share what really happened when they are not blamed.
```
