// Create the licence key pair. Run once:  node keygen.mjs
// PRIVATE key -> Cloudflare secret LICENSE_PRIVATE_JWK (never commit it).  PUBLIC key -> "license_public_jwk" in site.config.json.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = await crypto.subtle.exportKey("jwk", publicKey), priv = await crypto.subtle.exportKey("jwk", privateKey);
console.log("PUBLIC  (site.config.json -> license_public_jwk):\n" + JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }) + "\n");
console.log("PRIVATE (wrangler secret put LICENSE_PRIVATE_JWK) - keep secret:\n" + JSON.stringify(priv));
