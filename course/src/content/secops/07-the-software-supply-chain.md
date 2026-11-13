---
track: secops
title: "The software supply chain: dependencies you did not write"
short: Supply chain
sub: Most of your app is other people's code. Known-vulnerable versions, look-alike package names, unpinned versions and swapped files, each found by a small check; then SBOMs, signing and SLSA.
---

@setup secops

:::goals
- explain why dependencies are a large part of an application's risk
- match installed versions against advisories (CVEs)
- spot typosquatting and unpinned versions, and verify a download with a pinned hash
- describe SBOMs, signed artefacts and SLSA levels
:::

## 1. Most of your code is not yours

A typical web app has a few thousand lines of its own code and hundreds of thousands in its dependencies, and their dependencies. Attackers know this. Famous incidents: **Log4Shell** (2021, one logging library in countless Java apps), the **event-stream** npm package (a new maintainer added code to steal crypto wallets), the **SolarWinds** build system compromise, and the **xz utils** backdoor (2024, a patient attacker became a maintainer).

## 2. Four checks on one requirements file

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
python3 supply.py
```

- **Known vulnerabilities:** each published problem gets a **CVE** ID and an advisory listing affected versions. Matching your versions against advisory databases is what pip-audit, npm audit, Dependabot, Snyk, Trivy and Grype do. Two hits here.
- **Typosquatting:** `reqeusts` is one swapped letter from `requests`. Attackers publish look-alike packages that run code at install time. An edit-distance check against popular names finds them.
- **Unpinned versions:** `numpy>=1.20` installs whatever is newest on the day, including a compromised release. Pin exact versions in a lock file and update deliberately.
- **Hash pinning:** the lock file stores the hash of the exact file you tested (`pip install --require-hashes`, `package-lock.json` integrity fields). A swapped file on a hacked mirror is refused.

## 3. Knowing what you ship: SBOMs

A **software bill of materials** lists every component and version in a build, in a standard format (CycloneDX or SPDX); the last lines show the shape. When the next Log4Shell appears, you search your SBOMs instead of guessing which of 200 services is affected. Tools such as Syft and Trivy generate them from images and source.

## 4. Trusting the build: signing and SLSA

- **Sign** what you build (container images, packages) and verify the signature before deploying. **Sigstore / cosign** make this simple, including keyless signing tied to the CI identity.
- **SLSA** ("salsa") is a framework of levels for build integrity: builds from version control on a hosted build service, with signed **provenance** saying what source and steps produced the artefact.
- Keep the build system itself locked down: it holds the keys to production.

## 5. Habits

Fewer dependencies; prefer well-maintained ones; automate update pull requests (Dependabot, Renovate) with tests; scan in CI and fail on serious, fixable issues; and pull from a private mirror or proxy that you control.

## Common misconceptions

- "No CVEs means safe." Malicious packages and unknown bugs have no CVE yet; pinning, hashes and provenance cover what scanners cannot.
- "Updating breaks things, so we never update." Old versions pile up known holes; small regular updates with tests are less risky than one huge jump.
- "Only direct dependencies matter." Most vulnerabilities are in transitive dependencies you never chose.

## Practice (answers below)

1. Add `urllib3==1.26.4` and an advisory `("urllib3", "<1.26.5", "CVE-2021-33503", "1.26.5", "slow regular expression in URL parsing")` to `supply.py`. Run it.
2. A scanner reports a critical CVE in a library function your code never calls. What do you do?
3. Why does an SBOM help on the day a new critical CVE is announced?

:::recap
- Dependencies are most of your code and a favourite attack path.
- Check for **known CVEs**, **look-alike names**, **unpinned versions**, and verify downloads with **pinned hashes**.
- **SBOMs** list what you ship; **signing** and **SLSA provenance** prove how it was built.
:::

:::note Answers
1. It reports urllib3 1.26.4 with CVE-2021-33503 and the fix 1.26.5. 2. Check reachability and exposure; if it is truly unreachable, record a time-limited exception with the reason ([lesson 10](#secops-10)), and still upgrade in the normal cycle. 3. You can search every build's component list in minutes to find which services contain the affected version.
:::

```quiz
? What is typosquatting?
+ Publishing a malicious package whose name looks like a popular one
- Mistyping a variable name
- A slow regular expression
- Pinning the wrong version
! One wrong letter in an install command is enough.

? What does pinning a package hash protect against?
+ A different file being served under the same name and version
- All unknown bugs
- Slow downloads
- License problems
! The install refuses any file whose hash does not match.

? What is an SBOM?
+ A list of every component and version in a build
- A type of firewall
- A password policy
- A load balancer
! Software bill of materials.
```
