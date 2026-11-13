---
track: secops
title: "Passwords: hashing, salts and slow hashes"
short: Passwords
sub: Why passwords are never stored as text, how a leaked table of fast hashes is cracked in seconds, and how a salt plus a slow hash changes the attacker's maths. Plus MFA and breached-password checks.
---

:::goals
- explain why systems store a hash of a password instead of the password
- crack an unsalted hash table with a word list and see why identical passwords leak together
- measure how much a slow, salted hash costs an attacker
- choose a password-hashing method and the controls around it
:::

## 1. Never store the password

If a database of passwords leaks (it happens to large companies every year), every account is open, and so is every other site where people reused that password. So systems store a **hash** instead: a one-way fingerprint. At login, hash what the user typed and compare. The hash cannot be turned back into the password.

But the attacker can **guess**: hash "123456", "password", "sunshine"... and compare. Real word lists hold billions of leaked passwords. Two design choices decide how well that works.

## 2. See it happen

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > crack.py <<'EOF'
# Why passwords are stored with a salt and a slow hash. A "leaked" table is cracked with a word list.
import hashlib, os, time

users = {"asha": "sunshine", "ben": "Sunshine1", "chen": "correct-horse-battery-staple", "dev": "sunshine"}
wordlist = ["123456", "password", "qwerty", "sunshine", "letmein", "dragon", "Sunshine1", "iloveyou"]

# 1) plain fast hash, no salt: what too many old systems did
fast = {u: hashlib.sha256(p.encode()).hexdigest() for u, p in users.items()}
print("1) unsalted sha256")
for u, h in fast.items(): print(f"   {u:5} {h[:16]}...")
print("   asha and dev have the SAME hash, so cracking one cracks both")
table = {hashlib.sha256(w.encode()).hexdigest(): w for w in wordlist}   # computed once, used on every leak
print("   cracked:", {u: table[h] for u, h in fast.items() if h in table})

# 2) salted slow hash (PBKDF2; bcrypt, scrypt and Argon2 are the usual choices)
ROUNDS = 100_000
if hasattr(hashlib, "pbkdf2_hmac"):
    def slow(pw, salt): return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, ROUNDS).hex()
else:                                        # the in-browser Python has no pbkdf2_hmac: same maths, fewer rounds
    import hmac; ROUNDS = 5_000
    def slow(pw, salt):
        mac = hmac.new(pw.encode(), digestmod="sha256")
        def prf(m): h = mac.copy(); h.update(m); return h.digest()
        u = prf(salt + b"\x00\x00\x00\x01"); out = int.from_bytes(u, "big")
        for _ in range(ROUNDS - 1): u = prf(u); out ^= int.from_bytes(u, "big")
        return out.to_bytes(32, "big").hex()
stored = {}
for u, p in users.items():
    salt = os.urandom(16); stored[u] = (salt, slow(p, salt))
print(f"\n2) salted pbkdf2, {ROUNDS:,} rounds: asha and dev now differ:", stored["asha"][1][:12], "vs", stored["dev"][1][:12])
t0 = time.perf_counter(); slow("x", b"s" * 16); per = time.perf_counter() - t0
t0 = time.perf_counter(); [hashlib.sha256(b"x").digest() for _ in range(100_000)]; fast_per = (time.perf_counter() - t0) / 100_000
print(f"   one guess: sha256 {fast_per * 1e6:.2f} microseconds, pbkdf2 {per * 1000:.0f} milliseconds")
print(f"   so the slow hash costs an attacker about {per / fast_per:,.0f} times more per guess, per user")
cracked = {}
for u, (salt, h) in stored.items():          # the attacker must redo the whole list for every salt
    for w in wordlist:
        if slow(w, salt) == h: cracked[u] = w; break
print("   cracked anyway:", cracked, "<- weak passwords still fall; the long passphrase did not")
EOF
python3 crack.py
```

- With a **fast hash and no salt**, two people with the same password have the same hash, and the attacker hashes the word list **once** for the whole leak. Every weak password fell at once.
- A **salt** is a random value stored next to each hash and mixed in. Same password, different hash, and the attacker must redo the word list for **each user**.
- A **slow hash** (PBKDF2, bcrypt, scrypt, Argon2) is deliberately expensive. A login takes a few milliseconds more, which no user notices; an attacker's billions of guesses each cost tens of thousands of times more (the run prints the factor measured on that machine; the in-browser lab uses fewer rounds so it finishes quickly).
- Weak passwords still fell. A salted slow hash buys time; it does not make "sunshine" a good password. The long passphrase survived.

## 3. What to use

- **Argon2id** for new systems (bcrypt or scrypt are fine too), through your framework's built-in password functions. Never invent your own scheme, and never use plain MD5 or SHA-256 for passwords.
- Store the algorithm and its settings with each hash, so you can raise the cost later and re-hash at the next login.
- **Encryption is not hashing.** Encrypted passwords can be decrypted by anyone who gets the key. Hashes cannot be decrypted at all.

## 4. The controls around the hash

- **Multi-factor authentication (MFA):** a code from an app or a hardware key. A stolen password alone is no longer enough. This is the single biggest improvement for most organisations.
- **Breached-password checks:** reject passwords that appear in known leaks (services such as Have I Been Pwned offer a private lookup by hash prefix).
- **Length over complexity:** current guidance (NIST SP 800-63B) favours long passphrases, no forced periodic changes, and no rules like "one symbol".
- **Rate limiting and lockouts** stop online guessing against the login page ([lesson 5](#secops-5)).

## Common misconceptions

- "Hashing with SHA-256 is secure." It is a fine hash for files, but far too fast for passwords; use a slow password hash.
- "A salt must be secret." It is stored in plain sight next to the hash; its job is to make every hash unique, not to be hidden.
- "Complex rules make strong passwords." They make "Sunshine1!"; length and blocking known-leaked passwords work better.

## Practice (answers below)

1. Add "Password123" to the users in `crack.py` and to the word list. Which method cracks it?
2. Why does a site that emails you your old password have a serious problem?
3. A system uses bcrypt but no MFA. Name the most likely way an account still gets taken over.

:::recap
- Store a **salted, slow hash** (Argon2id, bcrypt, scrypt), never the password and never a fast hash.
- Without a salt, identical passwords share a hash and one word-list pass cracks the whole leak.
- Slow hashes multiply the attacker's cost per guess; weak passwords still fall, so add **MFA** and **breached-password checks**.
:::

:::note Answers
1. Both: it is in the word list, so the salted slow hash only makes it slower, not safe. 2. It must store passwords in a form it can reverse (plain text or encryption), so a leak exposes them all. 3. Credential stuffing: the user reused a password that leaked from another site, so the attacker logs in on the first try. MFA and breached-password checks are the fix.
:::

```quiz
? Why add a salt to each password hash?
+ So identical passwords get different hashes and the attacker must attack each user separately
- To make the hash shorter
- So the password can be recovered
- Because the salt is the encryption key
! A per-user random salt defeats precomputed tables and shared hashes.

? Which is suitable for storing passwords?
+ Argon2id
- MD5
- SHA-256 with no salt
- Base64 encoding
! Password hashes must be slow and salted; base64 is not even a hash.

? Which single control most reduces account takeover from stolen passwords?
+ Multi-factor authentication
- Longer session timeouts
- Changing passwords every month
- Hiding the login page
! A password alone is no longer enough to log in.
```
