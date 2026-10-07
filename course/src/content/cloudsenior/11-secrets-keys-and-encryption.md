---
track: cloudsenior
title: Q11: How do you manage secrets, keys and encryption across cloud services and regions?
short: Q11 Secrets and keys
sub: The key hierarchy and envelope encryption demonstrated with OpenSSL, key rotation and crypto-shredding, a secret scanner for repositories, and a striking real look at an unencrypted Kubernetes Secret inside etcd.
---

:::goals
- explain the difference between secrets, keys and certificates, and the principles for managing each
- describe the key hierarchy and implement envelope encryption, rotation and crypto-shredding with OpenSSL
- prevent secrets from entering Git and logs, with a working scanner
- show why a Kubernetes Secret is not encrypted by default and how to fix it
- design secrets and key management across regions, accounts and failure scenarios
:::

:::note Provenance
The OpenSSL envelope encryption, the secret scanner, and the Kubernetes and etcd demonstration all **run for real**. The OpenSSL commands are for **teaching the mechanism**: in production you use a **managed key service or an HSM**, never keys in files. Service names (AWS KMS and Secrets Manager, Azure Key Vault, Google Cloud KMS and Secret Manager, HashiCorp Vault) are from my own knowledge.
:::

```setup
export LABNS=labsec
```

@setup k8s

## 1. Vocabulary and principles

| Thing | What it is | Typical home |
|---|---|---|
| **Secret** | a credential: password, API token, database connection string, private key | a **secrets manager** (Vault, cloud secret services) |
| **Encryption key** | key material used to encrypt or sign data | a **key management service (KMS)** or **HSM** (hardware security module), where key material **never leaves** |
| **Certificate** | a public key bound to an identity, signed by a CA (TLS, mTLS) | a **certificate manager** or ACME automation, with private keys protected |

Principles that interviewers expect, in order of importance:

1. **Do not have secrets if you can avoid them**: use **workload identity** (roles, managed identities, OIDC federation, Kubernetes service account tokens exchanged for cloud access) so applications obtain **short-lived credentials** automatically (Q10).
2. **Never store secrets in code, images, environment-baked configs, tickets or logs.** Keep them in a **secrets manager**, fetched at runtime, **cached briefly**.
3. **Short lifetimes and rotation**: dynamic, per-use credentials where possible (a vault issues a database user valid for an hour); otherwise **automated rotation** on a schedule and **immediately after any suspected exposure**.
4. **Least privilege and separation of duties**: who can **read** a secret, who can **use** a key, who can **administer** keys; the people who manage keys should not be the ones who can read all data.
5. **Audit everything**: every key use and secret read is logged to the central log archive (Q3, Q4) with alerts on anomalies.
6. **Encrypt at rest and in transit by default**, with **customer-managed keys** where the requirement is **control** (revocation, residency, separation from the provider's operators).
7. **Plan for loss**: if you **lose the key you lose the data**; if an **attacker has the key they have the data**. Both need a **recovery and revocation plan** (Q7).

## 2. The key hierarchy and envelope encryption

Encrypting **large data directly with a master key in a KMS** is slow and puts every byte through the service. The standard design is **envelope encryption**:

```
Root of trust (HSM)
   └── Key encryption key (KEK, in the KMS; never exported)
          └── Data encryption key (DEK, one per object, volume or database)
                 └── Data (encrypted with the DEK)

Stored together: ciphertext  +  the DEK encrypted ("wrapped") by the KEK
```

To read data: send the **wrapped DEK** to the KMS, which returns the **plaintext DEK** (if the caller is authorised and the call is logged); decrypt locally; discard the DEK. Benefits: fast bulk encryption, **small calls to the KMS**, **rotation of the KEK without re-encrypting the data** (just re-wrap the small DEKs), per-object isolation, and **crypto-shredding**.

Do it by hand with OpenSSL (the mechanism that every cloud storage encryption feature automates):

```run
mkdir -p ~/lab/cs/kms && cd ~/lab/cs/kms
rm -f * 
# The "KMS": a key encryption key that never leaves this directory (in real life it never leaves the service or the HSM).
openssl rand -hex 32 > kek-v1.key
echo "archived mail export, tenant A" > data-A.txt
head -c 200000 /dev/urandom | base64 >> data-A.txt                          # make it a decent size

encrypt() {  # encrypt file $1 with a fresh DEK; store ciphertext and the DEK wrapped by KEK file $2
  openssl rand -hex 32 > dek.tmp
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$1" -out "$1.enc" -pass file:dek.tmp
  openssl enc -aes-256-cbc -pbkdf2 -salt -in dek.tmp -out "$1.dek.wrapped" -pass file:"$2"
  rm dek.tmp
}
decrypt() {  # unwrap the DEK with KEK file $2, then decrypt file $1.enc
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$1.dek.wrapped" -out dek.tmp -pass file:"$2" 2> /dev/null || { echo "cannot unwrap the DEK with that key"; return 1; }
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$1.enc" -pass file:dek.tmp 2> /dev/null; rm -f dek.tmp
}
encrypt data-A.txt kek-v1.key
echo "stored: $(ls | grep -E 'enc|wrapped' | tr '\n' ' ')"
echo "plaintext data deleted; decrypt with the KEK:"; mv data-A.txt original-A.txt
decrypt data-A.txt kek-v1.key | head -1
echo "--- rotate the KEK: only the small wrapped DEK is re-wrapped; the 270 KB of data is not touched"
openssl rand -hex 32 > kek-v2.key
before=$(sha256sum data-A.txt.enc | cut -c1-12)
openssl enc -d -aes-256-cbc -pbkdf2 -in data-A.txt.dek.wrapped -out dek.tmp -pass file:kek-v1.key
openssl enc -aes-256-cbc -pbkdf2 -salt -in dek.tmp -out data-A.txt.dek.wrapped -pass file:kek-v2.key; rm dek.tmp
after=$(sha256sum data-A.txt.enc | cut -c1-12)
echo "ciphertext unchanged by rotation: $([ "$before" = "$after" ] && echo yes || echo no) ($before)"
echo "old key v1 now: $(decrypt data-A.txt kek-v1.key 2>&1 | head -1)"
echo "new key v2 now: $(decrypt data-A.txt kek-v2.key | head -1)"
echo "--- crypto-shredding: destroy the wrapped DEK (or the KEK) and the data is gone for good"
rm data-A.txt.dek.wrapped
echo "after shredding: $(decrypt data-A.txt kek-v2.key 2>&1 | head -1)"
```

What each line of output proves:

- **Rotation is cheap**: the multi-hundred-kilobyte ciphertext was **identical** after rotation; only the tiny wrapped key changed. With real KMS **automatic rotation** works the same way (new key versions; old versions keep decrypting old DEKs).
- **Revocation by key**: after rotating *and retiring* the old key, a leaked old key opens nothing new. (Note the nuance: data already protected by a DEK that **was exposed** needs **re-encryption** with a new DEK; rotation of the KEK alone does not help if the DEK itself leaked.)
- **Crypto-shredding**: destroying the key makes the data **irrecoverable**, which is the practical way to **delete data across backups and replicas** (privacy "right to erasure" in immutable backups) and why **key loss equals data loss** (Q7: back up keys, with the same care and in a separate failure domain).

## 3. Keeping secrets out of Git

A leaked secret in Git history stays there: deleting the file later does **not** remove it, and **bots scan public repositories within minutes**. Defence in depth: **pre-commit hooks**, **pipeline scanning**, **platform push protection**, and a runbook that says **rotate first, clean history later**. A minimal scanner (real tools such as gitleaks, trufflehog and the Git platforms' secret scanning do this with far larger rule sets and entropy analysis, from my knowledge):

```run
cd ~/lab/cs
mkdir -p repo && cd repo
cat > config.py <<'EOF'
DB_HOST = "sql01.corp.local"
DB_PASSWORD = "Winter2026!"                      # a hard-coded password
AWS_ACCESS_KEY_ID = "AKIAABCDEFGHIJKLMNOP"       # looks like a cloud access key id
EOF
cat > deploy.sh <<'EOF'
curl -H "Authorization: Bearer ghp_0123456789abcdefghijklmnopqrstuvwxyz12" https://api.example.com
echo "deploying to $ENVIRONMENT"
EOF
cat > scanner.py <<'EOF'
import re, sys, pathlib
RULES = [
    ("cloud access key id",       re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("hard-coded password",       re.compile(r"(?i)\w*(password|passwd|pwd|secret)\w*\s*[:=]\s*[\"'][^\"']{6,}[\"']")),
    ("bearer or personal token",  re.compile(r"\b(ghp_[A-Za-z0-9]{30,}|Bearer\s+[A-Za-z0-9._-]{20,})")),
    ("private key block",         re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]
hits = 0
for path in sorted(pathlib.Path(".").glob("*")):
    if path.name == "scanner.py" or not path.is_file(): continue
    for n, line in enumerate(path.read_text().splitlines(), 1):
        for name, rx in RULES:
            if rx.search(line):
                hits += 1
                print(f"{path}:{n}: {name}")
print(f"\n{hits} potential secret(s) found")
sys.exit(1 if hits else 0)
EOF
python3 scanner.py; echo "exit code $? (a pre-commit hook or pipeline step would block the commit)"
```

What to do when the scanner **does** fire in real life: **treat the secret as compromised**: **revoke and rotate it immediately** (the old value is now public to anyone with repository access), find where it was used, check **audit logs for misuse**, and only then clean the history if needed. Prevention beats cleanup: **no static secrets** wherever workload identity can replace them.

## 4. A Kubernetes Secret is not encrypted by default

A common interview trap. A Kubernetes `Secret` stores values as **base64**, which is **encoding, not encryption**, and by default the API server writes it to **etcd in plain form**. See it in the lab's real etcd:

```run
kubectl create secret generic db-credentials --from-literal=password='Winter2026!' > /dev/null
echo "--- what 'kubectl get' shows (base64):"
kubectl get secret db-credentials -o jsonpath='{.data.password}'; echo
echo "--- anyone with read access decodes it in one step:"
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d; echo
echo "--- and the raw bytes stored in etcd (the database behind the API server):"
ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 get /registry/secrets/labsec/db-credentials --print-value-only | strings | grep -E "Winter|password"
```

The password is **readable straight out of etcd**, and therefore from **every etcd backup** (Q7) and snapshot (the Kubernetes track showed how to take one). The fixes, in order of strength:

1. **Encryption at rest for the API server** (`EncryptionConfiguration` with the `aescbc`, `aesgcm` or, best, the **`kms` provider**): the API server encrypts Secrets before writing to etcd. With a **KMS provider** the keys live in your cloud KMS (envelope encryption, exactly as above). Managed Kubernetes services offer a switch for this (from my knowledge: EKS, AKS and GKE all support KMS envelope encryption of Secrets; check the current option names).
2. **RBAC**: restrict who can `get` and `list` Secrets (listing returns values), and who can `exec` into Pods that mount them.
3. **Do not keep the secret in Kubernetes at all**: use an **external secrets manager** and sync or mount at runtime (the **External Secrets Operator**, the **Secrets Store CSI driver**, or Vault's agent injector, from my knowledge), so the cluster never holds the master copy.
4. **GitOps with encrypted secrets** (Sealed Secrets, SOPS): only ciphertext is in Git (Lesson on GitOps).
5. **Workload identity** instead of static credentials where the target supports it.

```run
kubectl delete secret db-credentials > /dev/null
```

## 5. Across services, accounts and regions

A design that holds together at the scale of Q1 and Q3:

| Concern | Design |
|---|---|
| **Keys per boundary** | separate keys per **environment, data classification and tenant** so a compromise or a deletion has limited scope; **key policies** restrict use to specific roles and services |
| **Multi-region** | use **multi-region keys or replicated key material** where the provider supports it so a failover region can **decrypt** replicated data (Q1); otherwise per-region keys with a re-encryption step in replication; **test decrypting in the DR region** (Q7) |
| **Data residency** | keys **created and held in an allowed region** (Q4); **customer-managed or externally held keys** when regulation demands that the provider cannot read the data; understand what "bring your own key" and "hold your own key" give you (from my knowledge, features differ by provider) |
| **Cross-account access** | grant **use** of a key to another account's roles explicitly and narrowly; **audit** it |
| **Secrets in multiple regions** | replicate secrets to the regions that need them; keep **one writer** and automate replication; rotate in **all** regions together |
| **Rotation** | automatic for KMS keys (yearly or as policy dictates), **scheduled and automated for secrets** with zero-downtime patterns (two valid versions during the switch); **after an incident, rotate everything the compromised identity could read** |
| **Certificates** | **short-lived**, auto-renewed (ACME, cert-manager, cloud certificate services), **inventory with expiry alerts** (an expired certificate is among the most common outages) |
| **Break glass** | a **sealed, audited** emergency path to keys and secrets, tested; split knowledge or quorum (for example Vault's unseal shares) for the root of trust |
| **Backups of keys** | keys and the secrets manager's own backup in a **separate failure domain**, protected, **restore tested** |
| **Observability** | key usage and secret access logs, alerts on **unusual decrypt volume**, access from new principals, key policy changes, and **disabled or scheduled-for-deletion** keys |

Where **HashiCorp Vault** (or an equivalent) fits: a **central secrets and encryption service** with **dynamic secrets** (database credentials created on demand and revoked after a lease), **transit encryption as a service** (applications send data to be encrypted without ever holding keys), **PKI** for short-lived certificates, and fine-grained **policies and audit**. It adds an operational component that must be **highly available and backed up**; cloud-native services remove that burden at the cost of provider coupling.

## 6. How to answer

1. **Principles first**: avoid secrets with workload identity, short-lived and rotated, least privilege, audited, encrypted by default.
2. **Key hierarchy and envelope encryption**: how keys, data keys and data relate, why rotation and crypto-shredding are cheap.
3. **Where secrets live**: a secrets manager; **never in Git, images or logs**; scanning and pre-commit prevention; Kubernetes specifics (**base64 is not encryption**, KMS provider, external secrets).
4. **Multi-region and multi-account**: key placement, replication, residency, cross-account grants, DR decryption tested.
5. **Operations**: rotation automation, certificate lifecycle, break glass, backups of keys, monitoring and incident response (**rotate on exposure**).
6. **Governance**: separation of duties, review of key policies, evidence for audits (Q4).

## 7. Follow-up questions to expect

- "A developer **committed a key** to a public repository. What do you do?" (revoke and rotate first, check logs for use, scan other places, then history cleanup and prevention controls)
- "**KMS** or **HSM** or **Vault**?" (KMS for most cloud-native encryption, dedicated or cloud HSM for compliance-driven key custody, Vault for dynamic secrets and cross-platform needs)
- "How does a **pod** get a secret **without** a static credential?" (workload identity to the cloud's secret service, or a CSI driver or operator that uses the pod's service account)
- "**Customer-managed** versus **provider-managed** keys: when does it matter?" (control, revocation, audit separation, residency; at the price of responsibility, cost and availability risk)
- "What is the **blast radius** if the secrets manager is down?" (design caching, graceful degradation, and DR for the secrets service itself; Q1, Q7)
- "How do you handle **secret rotation without downtime**?" (support two valid credentials during the transition; rotate consumers then retire the old)

:::warn Common mistakes
- **Treating base64 as encryption** (Kubernetes Secrets, config files).
- **Secrets in environment variables baked into images** or printed in logs and crash dumps.
- **One shared key for everything**, so one exposure is a total exposure.
- **No rotation plan**, or rotation that breaks production the first time it runs.
- **Losing keys** (no backup, key deletion with no waiting period): the data is gone.
- **Cleaning Git history without rotating** the secret.
- **Certificates with no inventory or expiry alert.**
:::

:::recap
- **Avoid static secrets** (workload identity); store the rest in a **secrets manager**, short-lived, rotated, audited, least-privilege.
- **Envelope encryption**: KEK in a KMS wraps per-object DEKs; **rotation re-wraps only keys** and **destroying the key shreds the data** (both shown for real).
- **Scan and block secrets before they reach Git**; if one leaks, **rotate first**.
- **Kubernetes Secrets are base64 in etcd** until you enable KMS encryption or use an external store (the plain text was visible in etcd).
- Across regions and accounts: separate keys per boundary, tested decryption in the DR region, residency, cross-account grants, certificate lifecycle, break glass, and backups of the keys themselves.
:::

:::try Your turn
Extend the envelope demo: encrypt a **second** file (`data-B.txt`) under the **same KEK** with its **own DEK**, rotate to `kek-v3.key` re-wrapping both DEKs, then shred **only** B's wrapped DEK and prove A still decrypts. Add a rule to `scanner.py` that flags a `.env` file committed to the repository.
:::

:::quiz
? Why use envelope encryption instead of encrypting data directly with the master key?
+ Bulk data is encrypted locally with a data key, the KMS handles only small key operations, and rotation re-wraps keys without re-encrypting data
- It is required by law
- Master keys cannot encrypt anything
- It makes data public
! KMS calls stay small and rotation is cheap.
? What is a Kubernetes Secret's value by default?
+ Base64-encoded (not encrypted) and stored in etcd unless encryption at rest is configured
- Strongly encrypted with AES-256
- Hashed with SHA-256
- Stored only in memory
! Enable KMS encryption or use an external secrets store.
? A secret was committed to Git. What is the first action?
+ Revoke and rotate the secret
- Delete the file and force-push
- Tell nobody
- Wait for the next release
! The old value must be assumed compromised; cleaning history comes later.
:::
