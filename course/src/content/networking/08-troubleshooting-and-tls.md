---
track: networking
title: Troubleshooting, HTTP and TLS
short: Troubleshooting, TLS
sub: A layer-by-layer method, plus what HTTPS certificates really are.
---

:::goals
- follow a bottom-up network troubleshooting checklist
- read an HTTP request and response with `curl -v`
- create a certificate and understand what TLS verifies
:::

## The checklist

When "it is not working", walk up the layers, stop at the first failure:

| Step | Question | Command |
|---|---|---|
| 1 | Is my link up and do I have an address? | `ip -br addr`, `ip -br link` |
| 2 | Can I reach my gateway? | `ip route`, `ping GATEWAY` |
| 3 | Can I reach the target by IP? | `ping IP`, `traceroute IP` |
| 4 | Does the name resolve? | `getent hosts NAME`, `dig NAME` |
| 5 | Is the port open? | `nc -zv IP PORT`, `ss -ltn` on the server |
| 6 | Does the application answer correctly? | `curl -v URL`, logs |
| 7 | Is a firewall in the way? | `nft list ruleset`, cloud security groups, `traceroute` stopping |

Also remember that **ping can be blocked** while the service is fine (ICMP filtered), so a failed ping is a hint, not proof.

## HTTP, line by line

HTTP is plain text on top of TCP. A client sends a **request line** and **headers**; the server answers with a **status code**, headers and a body.

```setup
sudo ip netns del web 2>/dev/null
true
```

```run
python3 -m http.server 8077 --bind 127.0.0.1 > /dev/null 2>&1 &
sleep 1
curl -s -v -o /dev/null http://127.0.0.1:8077/ 2>&1 | grep -E '^(> |< )' | grep -vE '(Date|Server|Last-Modified|Content-Length):' | tr -d '\r'
curl -s -o /dev/null -w "missing page -> HTTP %{http_code}\n" http://127.0.0.1:8077/nope
pkill -f "[h]ttp.server 8077"
```

`>` lines are what the client sent, `<` lines what came back. Status codes you must know:

| Code | Meaning | Think |
|---|---|---|
| 200 | OK | works |
| 301 / 302 | redirect | follow the `Location:` header |
| 401 / 403 | not authenticated / not allowed | credentials or permissions |
| 404 | not found | wrong URL |
| 500 / 502 / 503 / 504 | server error / bad gateway / unavailable / gateway timeout | the problem is behind the web server |

## TLS: what the padlock means

**HTTPS** is HTTP inside **TLS**, which gives **encryption** (nobody on the path can read it) and **authentication** (you are really talking to that server). Authentication uses a **certificate**: a signed statement "this public key belongs to `ev01.corp.local`". The signer is a **certificate authority (CA)** that your machine already trusts. A client checks that the name matches, the dates are valid and the signature chains up to a trusted CA.

Create a certificate yourself (self-signed: signed by itself, so nobody trusts it, but the structure is identical):

```run
cd ~/lab && rm -f ev.key ev.crt
openssl req -x509 -newkey rsa:2048 -nodes -keyout ev.key -out ev.crt -days 365 \
  -subj "/CN=ev01.corp.local" -addext "subjectAltName=DNS:ev01.corp.local" 2>/dev/null
openssl x509 -in ev.crt -noout -subject -issuer -ext subjectAltName | sed 's/^ *//'
openssl x509 -in ev.crt -noout -dates | sed 's/=.*20/=...20/' | cut -c1-12
stat -c '%a %n' ev.key ev.crt
```

`subject` is who the certificate is for, `issuer` who signed it (the same here, hence self-signed), `subjectAltName` the names it is valid for, and the **expiry date** is the thing that causes many outages. Serve it and see the client's reaction:

```run
cd ~/lab
openssl s_server -quiet -accept 8443 -cert ev.crt -key ev.key -www > /dev/null 2>&1 &
sleep 1
echo "-- strict client (does not trust the signer):"
curl -s -m 3 https://127.0.0.1:8443/ -o /dev/null -w "%{http_code}\n" 2>&1 | head -1
curl -sS -m 3 https://127.0.0.1:8443/ -o /dev/null 2>&1 | grep -o "certificate[^,]*\|SSL certificate problem[^(]*" | head -1
echo "-- client told to trust this certificate, but name mismatch (IP, not ev01.corp.local):"
curl -sS -m 3 --cacert ev.crt https://127.0.0.1:8443/ -o /dev/null 2>&1 | head -1
echo "-- client trusting it and using the right name:"
curl -s -m 3 --cacert ev.crt --resolve ev01.corp.local:8443:127.0.0.1 https://ev01.corp.local:8443/ -o /dev/null -w "HTTP %{http_code}\n"
pkill -f "[o]penssl s_server"
```

Three different results from one server: untrusted issuer, name mismatch, success. Real-world TLS errors are almost always one of: **expired**, **wrong name**, **untrusted/incomplete chain**, or a **clock that is wrong**. Check with `openssl x509 -in cert.crt -noout -dates` or, against a live server, `openssl s_client -connect host:443 -servername host`.

:::tip Keep your private key private
`ev.key` is `600` for a reason. Anyone with it can impersonate the server. Never commit keys to Git; use a secrets manager (the Terraform and Jenkins tracks return to this).
:::

:::recap
- Troubleshoot bottom-up: link, address, route, IP reachability, DNS, port, application, firewall.
- HTTP status classes: 2xx ok, 3xx redirect, 4xx client problem, 5xx server problem.
- TLS = encryption + identity via certificates signed by a trusted CA.
- Certificate failures: expired, wrong name, untrusted chain, wrong clock.
:::

:::try Your turn
Users see "certificate expired" for the EV web app but the server has been fine for months. Which command checks the expiry date, and what two other TLS problems would you rule out?
:::

:::quiz
? You can ping an IP but not use its name. Which layer is likely at fault?
- Link
- Routing
+ DNS
- TCP
! Reaching the IP proves routing works; the name step failed.
? A 502 status means:
- The page was not found
+ A gateway or proxy got a bad response from the server behind it
- The password is wrong
- The page moved
! 5xx errors are server-side.
? What does a TLS certificate prove?
- The server has no bugs
+ This public key belongs to this name, as vouched for by a trusted authority
- The traffic is compressed
- The server is fast
! The client checks name, dates and the signature chain.
:::
