---
track: secops
title: "Start here: how attackers think, and how defenders rank risk"
short: Start here
sub: Confidentiality, integrity and availability; threats, vulnerabilities and risk; least privilege and defence in depth; a STRIDE threat model and a ranked risk register you can run.
---

:::goals
- say what security protects, using confidentiality, integrity and availability
- tell a threat, a vulnerability and a risk apart
- find threats in a design with STRIDE and rank them by likelihood and impact
- explain least privilege, defence in depth and shift left
:::

:::note Who this track is for
You need the [Linux](#linux-1) and [Python](#ch15) basics; [Networking](#networking-1) and [Docker](#docker-1) help for the later lessons. Every lesson has small programs that attack a deliberately weak example and then fix it. Everything runs on your own lab files: **never test against systems you do not own or have written permission to test.**
:::

## 1. What security protects

Security people describe what they protect with three words, the **CIA triad**:

| | Means | Broken when |
| --- | --- | --- |
| **Confidentiality** | only the right people can read it | a customer list leaks |
| **Integrity** | nobody can change it without permission | an attacker edits a price or a bank account number |
| **Availability** | it works when people need it | a flood of traffic takes the shop offline |

Every control in this track protects at least one of the three.

## 2. Threat, vulnerability, risk

- A **threat** is something that could go wrong: "someone logs in with a stolen password".
- A **vulnerability** is the weakness that makes it possible: "we have no second factor".
- A **risk** is how much it matters: roughly **likelihood x impact**. A likely problem with a small impact can rank below a rare one that ends the business.

You cannot fix everything at once, so you rank risks and work from the top.

## 3. Finding threats with STRIDE

Looking at a design and asking "what could go wrong?" is **threat modelling**. STRIDE gives six questions so you do not forget a kind: **S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege. Draw how data moves (user, web app, database, admin panel, backups), then ask the six questions at each arrow.

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > risk.py <<'EOF'
# A small risk register for a web shop, using STRIDE to find threats and likelihood x impact to rank them.
STRIDE = {"S": "Spoofing (pretending to be someone)", "T": "Tampering (changing data)",
          "R": "Repudiation (denying an action)", "I": "Information disclosure (leaking data)",
          "D": "Denial of service (making it unavailable)", "E": "Elevation of privilege (gaining rights)"}

threats = [  # (what, STRIDE letter, likelihood 1-5, impact 1-5, control)
    ("Attacker logs in with a leaked password", "S", 4, 4, "MFA, breached-password check"),
    ("Customer changes the price field in the cart request", "T", 3, 4, "recompute price on the server"),
    ("Admin deletes orders and says they did not", "R", 2, 3, "audit log that admins cannot edit"),
    ("Database backup left in a public bucket", "I", 3, 5, "block public access, encrypt backups"),
    ("Bot floods the checkout page", "D", 3, 3, "rate limiting, CDN"),
    ("Support user opens the admin panel by editing the URL", "E", 2, 5, "check roles on every request"),
    ("Old library with a known bug in the image resizer", "T", 3, 3, "dependency scanning, patching"),
]

print("%-55s %-3s %4s %s" % ("threat", "", "risk", "control"))
for what, s, lik, imp, ctl in sorted(threats, key=lambda t: -t[2] * t[3]):
    risk = lik * imp
    level = "HIGH" if risk >= 15 else "MED " if risk >= 8 else "LOW "
    print("%-55s %-3s %2d %s %s" % (what, s, risk, level, ctl))
print("\ncoverage:", {k: sum(1 for t in threats if t[1] == k) for k in STRIDE})
EOF
python3 risk.py
```

The top two (a leaked password, a public backup) are the most common causes of real breaches. Notice that each threat has a **control**, the thing that reduces it.

## 4. Four principles you will meet in every lesson

- **Least privilege:** every user, service and key gets only the access it needs, for only as long as it needs it. A stolen key that can only read one bucket does little harm.
- **Defence in depth:** several independent layers, so one mistake is not a breach: a firewall *and* authentication *and* encryption *and* monitoring.
- **Secure by default:** the easy path is the safe one: new buckets private, new ports closed.
- **Shift left:** find problems early (in design, in code review, in the build pipeline) where they are cheap to fix, instead of in production. This is the idea behind **DevSecOps**: security checks become part of the normal delivery pipeline, owned by the whole team.

## 5. Where this track goes

Passwords and hashing, cryptography and certificates, injection, authentication and access control, secrets, the software supply chain, code scanning, container and infrastructure policies, a security gate in CI, and finally detecting and responding to an attack. Many lessons follow the **OWASP Top 10**, the best-known list of web application risks.

## Common misconceptions

- "Security is the security team's job." In DevSecOps the people who build a system own most of its security; the security team sets standards and helps.
- "We are too small to be a target." Most attacks are automated scans of the whole internet; they do not choose you, they find you.
- "More tools mean more security." Untuned tools produce noise people ignore. A short list of controls that are actually enforced beats a long list that is not.

## Practice (answers below)

1. Add two threats for a mobile banking app and give each a STRIDE letter, a likelihood, an impact and a control.
2. Which CIA property does ransomware attack first? Which does a data leak attack?
3. Give one example of defence in depth for an admin login page.

:::recap
- Security protects **confidentiality, integrity and availability**.
- A **threat** uses a **vulnerability**; **risk** is roughly likelihood x impact, and ranking it tells you what to fix first.
- **STRIDE** is a checklist for threat modelling a design.
- **Least privilege, defence in depth, secure by default and shift left** run through everything in DevSecOps.
:::

:::note Answers
1. For example: a fake app copies the bank's look to steal logins (S, 3, 5, app store monitoring and certificate pinning); a stolen phone with an open session (I, 3, 4, short sessions and biometric unlock). 2. Ransomware attacks availability (files are encrypted) and often confidentiality too (data is stolen first to blackmail). A leak attacks confidentiality. 3. It is reachable only over a VPN, needs a password and a second factor, locks after repeated failures, and every login is logged and alerted on.
:::

```quiz
? A database backup is readable by anyone on the internet. Which property is broken?
+ Confidentiality
- Availability
- Integrity
- None, it is only a backup
! Anyone can read data that should be private.

? Risk is best estimated as:
+ Likelihood multiplied by impact
- The number of servers
- The age of the code
- How many tools you run
! Both how likely it is and how much harm it does matter.

? What does "shift left" mean?
+ Find and fix security problems earlier, in design, code and the build pipeline
- Move servers to another region
- Give the security team more power
- Log everything to the left of the screen
! Earlier fixes are cheaper than fixes in production.
```
