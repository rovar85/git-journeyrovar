// Payment and licence service for the course site. Runs as a Cloudflare Worker (free tier is enough).
// Flow: the page calls POST /order -> opens Razorpay Checkout -> calls POST /verify with the signed result -> gets a licence.
// A licence is a small signed token (ECDSA P-256). The page verifies it with the PUBLIC key only, so no database is needed.
// Secrets (set with `wrangler secret put`): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, LICENSE_PRIVATE_JWK.  Vars: PRICE_PAISE, ALLOWED_ORIGIN, PRODUCT.

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
function safeEqual(a, b) {                       // constant-time comparison
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function signLicense(env, payload) {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.LICENSE_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const data = enc.encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return b64u(data) + "." + b64u(sig);
}
async function razorpay(env, path, init = {}) {
  const r = await fetch("https://api.razorpay.com/v1" + path, { ...init, headers: { Authorization: "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET), "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, "payment provider error: " + ((body.error && body.error.description) || r.status));
  return body;
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const price = (env) => Number(env.PRICE_PAISE || 4900);
const validEmail = (e) => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;

function paymentIsGood(env, p) {                 // the checks every licence depends on
  return p && (p.status === "captured" || p.status === "authorized") && p.currency === "INR" && Number(p.amount) >= price(env) && !(Number(p.amount_refunded) > 0);
}
async function license(env, p, email) {
  return signLicense(env, { v: 1, product: env.PRODUCT || "course", pid: p.id, email: String(email || p.email || "").toLowerCase(), iat: Math.floor(Date.now() / 1000) });
}

const routes = {
  async "/order"(env, body) {
    if (!validEmail(body.email)) throw new HttpError(400, "a valid email is required");
    const o = await razorpay(env, "/orders", { method: "POST", body: JSON.stringify({ amount: price(env), currency: "INR", receipt: "c_" + Date.now().toString(36), notes: { email: body.email.toLowerCase(), product: env.PRODUCT || "course" } }) });
    return { order_id: o.id, amount: o.amount, currency: o.currency, key_id: env.RAZORPAY_KEY_ID };
  },
  async "/verify"(env, body) {
    const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = body;
    if (!oid || !pid || !sig) throw new HttpError(400, "missing payment fields");
    const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, oid + "|" + pid);          // Razorpay's documented checkout signature
    if (!safeEqual(expected, String(sig))) throw new HttpError(400, "signature mismatch");
    const p = await razorpay(env, "/payments/" + encodeURIComponent(pid));               // confirm amount and status with the provider, not the browser
    if (p.order_id !== oid || !paymentIsGood(env, p)) throw new HttpError(402, "payment is not complete");
    return { license: await license(env, p, body.email) };
  },
  async "/restore"(env, body) {
    if (!validEmail(body.email) || !/^pay_[A-Za-z0-9]+$/.test(String(body.payment_id || ""))) throw new HttpError(400, "payment id and email are required");
    const p = await razorpay(env, "/payments/" + encodeURIComponent(body.payment_id));
    if (!paymentIsGood(env, p)) throw new HttpError(402, "that payment is not complete or was refunded");
    if (String(p.email || "").toLowerCase() !== body.email.toLowerCase()) throw new HttpError(403, "the email does not match that payment");
    return { license: await license(env, p, body.email) };
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = { "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || "null"), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET" && url.pathname === "/health") return json(200, { ok: true });
    const handler = routes[url.pathname];
    if (!handler || request.method !== "POST") return json(404, { error: "not found" });
    if (allowed.length && !allowed.includes(origin)) return json(403, { error: "origin not allowed" });
    try {
      const text = await request.text();
      if (text.length > 4000) throw new HttpError(413, "request too large");
      return json(200, await handler(env, JSON.parse(text || "{}")));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      if (e instanceof SyntaxError) return json(400, { error: "invalid JSON" });
      return json(500, { error: "server error" });
    }
  },
};
