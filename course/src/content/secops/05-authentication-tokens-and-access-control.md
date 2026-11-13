---
track: secops
title: "Authentication, tokens and access control"
short: Auth and access
sub: Sessions and JSON Web Tokens built by hand, three real token attacks (tampering, expiry, alg none), and the most common web flaw of all: checking who you are but not what you may touch.
---

:::goals
- tell authentication from authorisation
- build and verify a signed token, and see what tampering and expiry do
- explain the alg none mistake and how libraries avoid it
- find and fix broken access control (IDOR), and protect a login from guessing
:::

## 1. Two different questions

- **Authentication:** who are you? (password, MFA, single sign-on)
- **Authorisation:** what are you allowed to do? (roles, ownership, policies)

After login the server must remember you. Two common ways:

- **Session cookie:** a random ID that points to session data on the server. Easy to revoke (delete the session).
- **Signed token (JWT):** the data itself (user, role, expiry), signed by the server. No lookup needed, which suits APIs and many services, but hard to revoke before it expires, so keep expiries short.

## 2. A token, three attacks

```run
mkdir -p ~/lab/sec && cd ~/lab/sec
cat > jwt_demo.py <<'EOF'
# A JSON Web Token built by hand with the standard library, then three attacks on it.
import base64, hashlib, hmac, json, time
KEY = b"server-only-secret"            # in real life: a long random value from a secret store
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def unb64(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def sign(payload, alg="HS256"):
    head = b64(json.dumps({"alg": alg, "typ": "JWT"}).encode()); body = b64(json.dumps(payload).encode())
    sig = b64(hmac.new(KEY, f"{head}.{body}".encode(), hashlib.sha256).digest()) if alg == "HS256" else ""
    return f"{head}.{body}.{sig}"

def verify_naive(tok):                       # trusts the header's "alg", a classic mistake
    head, body, sig = tok.split(".")
    if json.loads(unb64(head))["alg"] == "none": return json.loads(unb64(body))
    good = b64(hmac.new(KEY, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return json.loads(unb64(body)) if hmac.compare_digest(sig, good) else None

def verify(tok, now):                         # fixed algorithm, constant-time compare, expiry checked
    head, body, sig = tok.split(".")
    good = b64(hmac.new(KEY, f"{head}.{body}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, good): return "rejected: bad signature"
    claims = json.loads(unb64(body))
    if claims["exp"] < now: return "rejected: expired"
    return claims

now = 1_800_000_000
tok = sign({"sub": "asha", "role": "customer", "exp": now + 900})
print("token:", tok[:60] + "...")
print("anyone can READ it (it is only encoded):", unb64(tok.split(".")[1]).decode())
print("verify:", verify(tok, now))

h, b, s = tok.split(".")
tampered = h + "." + b64(json.dumps({"sub": "asha", "role": "admin", "exp": now + 900}).encode()) + "." + s
print("\n1) change role to admin, keep old signature ->", verify(tampered, now))
print("2) token after 15 minutes ->", verify(tok, now + 901))
none_tok = sign({"sub": "asha", "role": "admin", "exp": now + 900}, alg="none")
print("3) alg=none token: naive verifier ->", verify_naive(none_tok))
print("                   fixed verifier ->", verify(none_tok, now))

print("\nBroken access control (IDOR): the id in the URL is not proof of ownership")
orders = {101: "asha", 102: "ben"}
def get_order(user, order_id, check=True):
    if check and orders[order_id] != user: return "403 forbidden"
    return f"order {order_id} details"
print("  asha asks for /orders/102 without a check:", get_order("asha", 102, check=False))
print("  with an ownership check:                  ", get_order("asha", 102))
EOF
python3 jwt_demo.py
```

- A JWT is three base64 parts: header, payload, signature. The payload is only **encoded**: anyone can read it, so never put secrets in it.
- Changing the role to admin broke the signature: the server rejected it. **Integrity, not secrecy.**
- The expired token was rejected. Short expiry (minutes) plus a refresh token limits what a stolen token can do.
- The **alg none** attack: the naive verifier believed the token's own header saying "no signature needed". Real libraries had this bug years ago. The fix is to decide the allowed algorithm on the server (`jwt.decode(token, key, algorithms=["HS256"])` in PyJWT) and never trust the header's choice.

## 3. Broken access control

The last lines show **IDOR** (insecure direct object reference): asha is logged in, changes `/orders/101` to `/orders/102`, and sees ben's order. Authentication worked; **authorisation** was never checked. It is number one in the OWASP Top 10 (2021) for a reason: it is easy to forget one endpoint.

Fixes: check ownership or role **on the server, on every request**; deny by default; put the check in one shared place (middleware or a policy layer) instead of each handler; write tests that log in as user A and ask for user B's things.

## 4. Protecting the login itself

- **Rate limit** attempts per account and per IP, with growing delays; lock or require a captcha after repeated failures.
- The same error message for "no such user" and "wrong password", so attackers cannot list your users.
- **MFA**, and single sign-on (OIDC, SAML) for staff so one strong login covers every tool.
- Cookies with `HttpOnly`, `Secure` and `SameSite` flags, so scripts cannot read them and other sites cannot send them.

## Common misconceptions

- "JWTs are encrypted." Standard signed JWTs are readable by anyone; the signature only stops changes.
- "The menu hides the admin page, so users cannot reach it." Hiding a link is not a permission check.
- "Logged in means allowed." Authentication says who; every request still needs an authorisation check.

## Practice (answers below)

1. Add a `delete_order` function to `jwt_demo.py` that only admins or the owner may call.
2. A JWT for a sacked employee is valid for 7 more days. What could you have done differently?
3. Why must the server, not the token, choose the signing algorithm?

:::recap
- **Authentication** is who you are; **authorisation** is what you may do. Both are needed on every request.
- Signed tokens stop **tampering**, not reading; keep them short-lived and fix the algorithm on the server.
- **Broken access control (IDOR)** is the top web risk: check ownership server-side, deny by default, test cross-user access.
- Protect logins with **rate limits, MFA, uniform errors and safe cookie flags**.
:::

:::note Answers
1. `def delete_order(user, role, oid): return '403 forbidden' if role != 'admin' and orders[oid] != user else f'deleted {oid}'`. 2. Use short-lived access tokens (minutes) with refresh tokens you can revoke, or keep a deny-list of token IDs; for staff, use sessions you can end centrally. 3. Because the token is attacker-controlled; trusting its header lets an attacker pick "none" or a weaker algorithm.
:::

```quiz
? A user changes /invoices/7 to /invoices/8 and sees someone else's invoice. What is missing?
+ An authorisation (ownership) check on the server
- Encryption of the URL
- A stronger password
- HTTPS
! This is IDOR, broken access control.

? What does a JWT signature guarantee?
+ The contents were not changed since the server signed them
- Nobody can read the contents
- The user is still employed
- The token never expires
! Integrity, not confidentiality or freshness.

? How do you stop the alg none attack?
+ The server fixes the allowed algorithms when verifying
- Use longer tokens
- Base64 the header twice
- Store tokens in local storage
! Never let the token choose how it is checked.
```
