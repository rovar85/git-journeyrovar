// Tests for the payment worker with Razorpay mocked. Run:  node test.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "./worker.js";

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const env = { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s3cret", LICENSE_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)), PRICE_PAISE: "4900", ALLOWED_ORIGIN: "https://site.example", PRODUCT: "course" };
const payments = {
  pay_good: { id: "pay_good", order_id: "order_1", status: "captured", currency: "INR", amount: 4900, amount_refunded: 0, email: "asha@example.com" },
  pay_cheap: { id: "pay_cheap", order_id: "order_2", status: "captured", currency: "INR", amount: 100, amount_refunded: 0, email: "asha@example.com" },
  pay_failed: { id: "pay_failed", order_id: "order_3", status: "failed", currency: "INR", amount: 4900, amount_refunded: 0, email: "asha@example.com" },
  pay_refund: { id: "pay_refund", order_id: "order_4", status: "captured", currency: "INR", amount: 4900, amount_refunded: 4900, email: "asha@example.com" },
};
let calls = [];
globalThis.fetch = async (url, init = {}) => {                    // the mocked payment provider
  calls.push([init.method || "GET", url]);
  assert.equal(init.headers.Authorization, "Basic " + btoa("rzp_test_x:s3cret"));
  if (url.endsWith("/orders")) { const b = JSON.parse(init.body); assert.equal(b.amount, 4900); assert.equal(b.currency, "INR"); return new Response(JSON.stringify({ id: "order_1", amount: b.amount, currency: "INR" })); }
  const m = url.match(/\/payments\/(.+)$/);
  if (m && payments[m[1]]) return new Response(JSON.stringify(payments[m[1]]));
  return new Response(JSON.stringify({ error: { description: "not found" } }), { status: 400 });
};
const call = async (path, body, origin = "https://site.example", method = "POST") => {
  const r = await worker.fetch(new Request("https://api.example" + path, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined }), env);
  return [r.status, r.status === 204 ? null : await r.json(), r.headers];
};
const sign = (oid, pid, secret = "s3cret") => createHmac("sha256", secret).update(oid + "|" + pid).digest("hex");
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function verifyLicense(token, key = publicKey) {            // the same check the page performs
  const [d, s] = token.split("."); const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64u(s), b64u(d));
  return ok ? JSON.parse(new TextDecoder().decode(b64u(d))) : null;
}
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("ok  " + name); };

await t("health", async () => { const [s, b] = await call("/health", null, "", "GET"); assert.equal(s, 200); assert.equal(b.ok, true); });
await t("CORS preflight", async () => { const [s, , h] = await call("/order", null, "https://site.example", "OPTIONS"); assert.equal(s, 204); assert.equal(h.get("Access-Control-Allow-Origin"), "https://site.example"); });
await t("order: creates an order for the configured price", async () => { const [s, b] = await call("/order", { email: "asha@example.com" }); assert.equal(s, 200); assert.deepEqual(b, { order_id: "order_1", amount: 4900, currency: "INR", key_id: "rzp_test_x" }); });
await t("order: rejects a bad email", async () => { const [s] = await call("/order", { email: "nope" }); assert.equal(s, 400); });
await t("other origins are refused", async () => { const [s] = await call("/order", { email: "a@b.co" }, "https://evil.example"); assert.equal(s, 403); });
await t("verify: good payment returns a licence that verifies", async () => {
  const [s, b] = await call("/verify", { razorpay_order_id: "order_1", razorpay_payment_id: "pay_good", razorpay_signature: sign("order_1", "pay_good"), email: "Asha@Example.com" });
  assert.equal(s, 200); const p = await verifyLicense(b.license); assert.equal(p.pid, "pay_good"); assert.equal(p.email, "asha@example.com"); assert.equal(p.product, "course"); });
await t("verify: forged signature is refused", async () => { const [s, b] = await call("/verify", { razorpay_order_id: "order_1", razorpay_payment_id: "pay_good", razorpay_signature: sign("order_1", "pay_good", "wrong") }); assert.equal(s, 400); assert.equal(b.license, undefined); });
await t("verify: signature valid but amount too small is refused", async () => { const [s] = await call("/verify", { razorpay_order_id: "order_2", razorpay_payment_id: "pay_cheap", razorpay_signature: sign("order_2", "pay_cheap") }); assert.equal(s, 402); });
await t("verify: failed payment is refused", async () => { const [s] = await call("/verify", { razorpay_order_id: "order_3", razorpay_payment_id: "pay_failed", razorpay_signature: sign("order_3", "pay_failed") }); assert.equal(s, 402); });
await t("verify: payment from a different order is refused", async () => { const [s] = await call("/verify", { razorpay_order_id: "order_9", razorpay_payment_id: "pay_good", razorpay_signature: sign("order_9", "pay_good") }); assert.equal(s, 402); });
await t("restore: right email works", async () => { const [s, b] = await call("/restore", { payment_id: "pay_good", email: "asha@example.com" }); assert.equal(s, 200); assert.ok(await verifyLicense(b.license)); });
await t("restore: wrong email is refused", async () => { const [s] = await call("/restore", { payment_id: "pay_good", email: "ben@example.com" }); assert.equal(s, 403); });
await t("restore: refunded payment is refused", async () => { const [s] = await call("/restore", { payment_id: "pay_refund", email: "asha@example.com" }); assert.equal(s, 402); });
await t("restore: malformed payment id is refused before calling the provider", async () => { calls = []; const [s] = await call("/restore", { payment_id: "../orders", email: "asha@example.com" }); assert.equal(s, 400); assert.equal(calls.length, 0); });
await t("a tampered licence does not verify", async () => {
  const [, b] = await call("/restore", { payment_id: "pay_good", email: "asha@example.com" }); const [d, s] = b.license.split(".");
  const forged = btoa(JSON.stringify({ v: 1, product: "course", pid: "pay_free", email: "x@y.z" })).replace(/=+$/, "") + "." + s;
  assert.equal(await verifyLicense(forged), null);
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); assert.equal(await verifyLicense(d + "." + s, other.publicKey), null); });
await t("invalid JSON and unknown paths", async () => { assert.equal((await call("/verify", "{oops"))[0], 400); assert.equal((await call("/nope", {}))[0], 404); });
console.log(`\n${n} tests passed`);
