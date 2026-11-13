---
track: secops
title: "Cryptography in practice: hashes, keys, signatures and certificates"
short: Cryptography
sub: The four tools that protect data, used for real with openssl: a hash for integrity, symmetric encryption, a public-key signature, and a certificate that binds a key to a name.
---

:::goals
- tell hashing, symmetric encryption, asymmetric encryption and signatures apart and say what each is for
- encrypt and decrypt a file, and sign and verify one, with openssl
- read a certificate's subject, issuer and dates
- explain how TLS uses these pieces, and the rules for handling keys
:::

:::note Runs on a real machine
These commands use `openssl`, which the in-page lab does not have; the output below is from a real run. Run them in Codespaces or any Linux or macOS terminal. The key in step 2 is a class demo value; real keys come from a secret store ([lesson 6](#secops-6)).
:::

## 1. Four tools

| Tool | One-line idea | Protects | Examples |
| --- | --- | --- | --- |
| **Hash** | a fingerprint; any change gives a different value | integrity | SHA-256 |
| **Symmetric encryption** | one secret key locks and unlocks | confidentiality | AES |
| **Asymmetric (public-key)** | a key pair: what one key does, only the other can undo | sharing keys with strangers | RSA, elliptic curves |
| **Signature** | made with a private key, checked with the public key | integrity *and* who sent it | Ed25519, ECDSA |

## 2. All four, for real

```run
cd ~
mkdir -p ~/lab/sec/crypto && cd ~/lab/sec/crypto
echo "Pay Ravi 500 rupees" > note.txt
# 1) a hash: a fingerprint. One changed letter gives a completely different value
sha256sum note.txt
echo "Pay Ravi 900 rupees" | sha256sum
# 2) symmetric encryption: the same secret key locks and unlocks
openssl enc -aes-256-cbc -pbkdf2 -salt -in note.txt -out note.enc -pass pass:class-demo-key
head -c 32 note.enc | od -An -c | head -2
openssl enc -d -aes-256-cbc -pbkdf2 -in note.enc -pass pass:class-demo-key
openssl enc -d -aes-256-cbc -pbkdf2 -in note.enc -pass pass:wrong-key 2>&1 | head -1
# 3) asymmetric: a private key signs, anyone with the public key verifies
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
openssl pkeyutl -sign -inkey private.pem -rawin -in note.txt -out note.sig
openssl pkeyutl -verify -pubin -inkey public.pem -rawin -in note.txt -sigfile note.sig
echo "Pay Ravi 900 rupees" > forged.txt
openssl pkeyutl -verify -pubin -inkey public.pem -rawin -in forged.txt -sigfile note.sig
# 4) a certificate binds a public key to a name; here we sign our own (browsers would not trust it)
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout site.key -out site.crt -days 30 -subj "/CN=shop.example" 2>/dev/null
openssl x509 -in site.crt -noout -subject -issuer -dates | sed 's/=.*GMT/=<date>/'
```

- Changing 500 to 900 changed the **whole** hash. That is how downloads, backups and container images are checked.
- The encrypted file starts with `Salted__` and then unreadable bytes. The right key decrypts it; the wrong one fails ("bad decrypt").
- The signature verified the real note and **failed** on the forged one, even though the forger had the public key. Only the private key can sign.
- The certificate says who it is for (subject) and who vouches for it (issuer). Here both are the same: **self-signed**. A browser trusts a certificate only if the issuer chain ends at a certificate authority it already trusts.

## 3. How TLS (the padlock) uses them

When your browser connects to a shop over HTTPS:

1. The server sends its **certificate**; the browser checks the **signature chain**, the name and the dates.
2. Both sides use **key exchange** (public-key maths) to agree on a fresh **symmetric key** that nobody watching can work out.
3. Everything after that is encrypted with the fast **symmetric** key and protected against changes.

You can look at a real handshake with `openssl s_client` in [Networking](#networking-1).

## 4. Rules for keys

- **Do not invent cryptography.** Use well-known libraries and their default modes.
- **The key is the secret,** not the algorithm. Keep keys in a key manager (cloud KMS, HashiCorp Vault), rotate them, and limit who can use them.
- **Encrypt in transit** (TLS everywhere, including between internal services) and **at rest** (disks, databases, backups).
- **Certificates expire.** Automate renewal (for example with ACME and Let's Encrypt) and alert well before the end date; expired certificates cause real outages.

## Common misconceptions

- "Encoding (base64) is encryption." Anyone can decode it; it hides nothing.
- "HTTPS means the site is safe." It means the connection is private and goes to the named domain; the site itself can still be a scam.
- "Hashing a file proves who made it." Anyone can compute a hash; only a signature proves the sender.

## Practice (answers below)

1. Change one letter in `note.txt` after signing it. What does verify say?
2. Two services need to share a secret over the internet without having met. Which tool solves that?
3. Why is a fresh symmetric key used for the data, instead of encrypting everything with the public key?

:::recap
- **Hash** for integrity, **symmetric** keys for bulk encryption, **public-key** pairs to share keys and **sign**.
- A **certificate** binds a public key to a name and is trusted through a chain of signatures.
- TLS = certificate check + key exchange + symmetric encryption. Protect, rotate and never invent keys; automate certificate renewal.
:::

:::note Answers
1. Signature Verification Failure: the signature covers the exact bytes. 2. Public-key cryptography (key exchange): each side keeps its private key and they agree on a shared key in public. 3. Symmetric encryption is far faster; public-key maths is used only to agree on that key.
:::

```quiz
? A forger has your public key. Can they create a valid signature?
+ No, signing needs the private key
- Yes, the public key signs
- Only for short messages
- Yes, if they know the hash
! Public keys only verify.

? What does a self-signed certificate lack?
+ A trusted authority vouching for it, so browsers warn
- Encryption
- A public key
- An expiry date
! It still encrypts, but nobody trusted has confirmed the name.

? After the TLS handshake, the data is encrypted with:
+ A symmetric session key agreed during the handshake
- The server's private key
- The certificate itself
- A hash
! Symmetric encryption is fast; the handshake creates the key.
```
