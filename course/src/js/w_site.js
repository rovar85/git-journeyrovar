/* Public-site features. Active only when the page is built by build_site.py (window.SITE exists); the private single-file build is unaffected.
   Modes: "free" (everything open), "ads" (everything open, ad slots), "paid" (first lessons of each track free, one payment unlocks the rest),
   "hybrid" (everything open with ads; the payment removes the ads). */
var S = window.SITE;
if(S){
var LKEY = "agentschool-license", paid = false, chapters = $$(".chapter");
function b64u(s){ s = s.replace(/-/g, "+").replace(/_/g, "/"); while(s.length % 4) s += "="; var bin = atob(s), a = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function verify(token){                       /* licence = base64url(JSON payload) + "." + base64url(ECDSA P-256 signature); checked with the public key only */
  try{
    var parts = String(token || "").trim().split("."); if(parts.length !== 2 || !S.licenseKey || !window.crypto || !crypto.subtle) return Promise.resolve(null);
    var data = b64u(parts[0]), sig = b64u(parts[1]);
    return crypto.subtle.importKey("jwk", S.licenseKey, {name: "ECDSA", namedCurve: "P-256"}, false, ["verify"])
      .then(function(k){ return crypto.subtle.verify({name: "ECDSA", hash: "SHA-256"}, k, sig, data); })
      .then(function(ok){ if(!ok) return null; var p = JSON.parse(new TextDecoder().decode(data)); return p && p.product === (S.product || "course") ? p : null; })
      .catch(function(){ return null; });
  }catch(e){ return Promise.resolve(null); }
}
H.siteVerify = verify;
function isFree(c){ return S.mode !== "paid" || paid || (S.freeTracks || []).indexOf(c.dataset.track) >= 0 || Number(c.dataset.n) <= (S.freeLessons || 3); }
function price(){ return "₹" + (S.price || 49); }
function card(){
  var d = document.createElement("div"); d.className = "board paywall";
  d.innerHTML = (S.mode === "hybrid" ? '<span class="tag">Remove the ads</span><p><b>Every lesson is free.</b> One payment of <b>' + price() + '</b> removes all advertising on this site for good and supports the course. No subscription.</p>'
      : '<span class="tag">Unlock the full course</span><p><b>This lesson is part of the full course.</b> The first ' + (S.freeLessons || 3) + ' lessons of every track are free. One payment of <b>' + price() + '</b> unlocks all ' + chapters.length + ' lessons, the labs, quizzes and certificates. No subscription.</p>') +
    '<p><label>Email for your receipt and to restore your purchase<br><input type="email" class="pw-email" autocomplete="email" placeholder="you@example.com"></label></p>' +
    '<p><button type="button" class="btn" data-pay>Pay ' + price() + (S.mode === "hybrid" ? '' : ' and unlock') + '</button> <button type="button" class="btn ghost" data-have>I already paid</button></p>' +
    '<div class="pw-restore" hidden><p><label>Payment ID from your receipt (starts with pay_)<br><input type="text" class="pw-pid" placeholder="pay_..."></label></p><p><button type="button" class="btn ghost" data-restore>Restore my purchase</button></p><p><label>Or paste your licence key<br><textarea class="pw-key" rows="2"></textarea></label></p><p><button type="button" class="btn ghost" data-usekey>Use this key</button></p></div>' +
    '<p class="pw-msg" role="status"></p><p class="muted" style="font-size:.82rem">Payments are handled by Razorpay. See the <a href="' + (S.base || "") + 'refund.html">refund policy</a>.</p>';
  var msg = $(".pw-msg", d), email = $(".pw-email", d);
  try{ email.value = localStorage.getItem("agentschool-email") || ""; }catch(e){}
  function say(t, bad){ msg.textContent = t; msg.style.color = bad ? "var(--bad)" : ""; }
  function api(path, body){ return fetch(S.api + path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j; }); }); }
  function accept(token){ return verify(token).then(function(p){ if(!p){ say("That licence could not be verified.", true); return; } try{ localStorage.setItem(LKEY, token); }catch(e){} unlock(); }); }
  function mail(){ var v = email.value.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){ say("Enter a valid email address first.", true); email.focus(); return null; } try{ localStorage.setItem("agentschool-email", v); }catch(e){} return v; }
  $("[data-have]", d).addEventListener("click", function(){ $(".pw-restore", d).hidden = false; });
  $("[data-usekey]", d).addEventListener("click", function(){ accept($(".pw-key", d).value); });
  $("[data-restore]", d).addEventListener("click", function(){ var v = mail(); if(!v) return; say("Checking your payment...");
    api("/restore", {payment_id: $(".pw-pid", d).value.trim(), email: v}).then(function(j){ return accept(j.license); }).catch(function(e){ say("Could not restore: " + e.message, true); }); });
  $("[data-pay]", d).addEventListener("click", function(){
    var v = mail(); if(!v) return; if(!S.api){ say("Payments are not configured on this site yet.", true); return; }
    say("Opening the payment window...");
    Promise.all([api("/order", {email: v}), new Promise(function(res, rej){ if(window.Razorpay) return res(); var sc = document.createElement("script"); sc.src = "https://checkout.razorpay.com/v1/checkout.js"; sc.onload = res; sc.onerror = function(){ rej(new Error("could not load the payment window")); }; document.head.appendChild(sc); })])
      .then(function(r){ var o = r[0];
        new window.Razorpay({key: o.key_id, order_id: o.order_id, amount: o.amount, currency: "INR", name: S.name, description: "Full course, one-time payment", prefill: {email: v},
          handler: function(resp){ say("Payment received. Unlocking...");
            api("/verify", {razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature, email: v})
              .then(function(j){ return accept(j.license); }).catch(function(e){ say("Paid, but unlocking failed: " + e.message + ". Use 'I already paid' with payment ID " + resp.razorpay_payment_id + ".", true); }); },
          modal: {ondismiss: function(){ say("Payment window closed. Nothing was charged."); }}}).open(); })
      .catch(function(e){ say("Could not start the payment: " + e.message, true); });
  });
  return d;
}
function lock(){
  chapters.forEach(function(c){
    if(isFree(c) || c.classList.contains("locked")) return;
    c.classList.add("locked");
    var kids = Array.prototype.slice.call(c.children), keep = 0, i;
    for(i = 0; i < kids.length; i++){ if(kids[i].classList.contains("goals") || i >= 3){ keep = i + 1; break; } }     /* keep the title and the goals box as a preview */
    kids.forEach(function(k, j){ if(j >= keep && !k.classList.contains("pn")) k.classList.add("lk-hide"); });
    var pw = card(); if(kids[keep]) c.insertBefore(pw, kids[keep]); else c.appendChild(pw);
  });
  $$("#chips a").forEach(mark);
}
function mark(a){ var c = document.getElementById(a.dataset.t); if(c) a.classList.toggle("lk", c.classList.contains("locked")); }
function unlock(){
  paid = true; document.documentElement.dataset.paid = "1";
  chapters.forEach(function(c){ c.classList.remove("locked"); $$(".lk-hide", c).forEach(function(k){ k.classList.remove("lk-hide"); }); $$(".paywall", c).forEach(function(p){ p.parentNode.removeChild(p); }); });
  $$("#chips a").forEach(mark); $$("ins.adsbygoogle, .adbox").forEach(function(a){ a.style.display = "none"; });
  banner();
}
function banner(){
  var el = $("#sitebanner"); if(!el){ el = document.createElement("div"); el.id = "sitebanner"; var gp = $("#gamepanel"); if(gp) gp.parentNode.insertBefore(el, gp); }
  if(S.mode === "paid") el.innerHTML = paid ? '<p class="muted" style="margin:14px 0 0">Full course unlocked on this device. Thank you for supporting it.</p>' : '<div class="board note" style="margin-top:22px"><span class="tag">Free preview</span><p>The first ' + (S.freeLessons || 3) + ' lessons of every track are free' + ((S.freeTracks || []).length ? ', and some tracks are free in full' : '') + '. One payment of <b>' + price() + '</b> unlocks all ' + chapters.length + ' lessons. Open any locked lesson to pay or to restore a purchase.</p></div>';
  else if(S.mode === "hybrid") el.innerHTML = paid ? '' : '<p class="muted" style="margin:14px 0 0">This course is free and supported by ads. A one-time ' + price() + ' removes them: use the button under any advertisement.</p>';
}
/* ---- ads: one slot at the end of each visible lesson, filled only when the lesson is on screen ---- */
var adsLoaded = false;
function ads(){
  if(paid || !(S.mode === "ads" || S.mode === "hybrid") || !S.ads || !S.ads.client) return;
  if(!adsLoaded){ adsLoaded = true; var sc = document.createElement("script"); sc.async = true; sc.crossOrigin = "anonymous"; sc.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(S.ads.client); document.head.appendChild(sc); }
  chapters.forEach(function(c){
    if(c.hidden || c.dataset.ad) return; c.dataset.ad = "1";
    var box = document.createElement("div"); box.className = "adbox"; box.innerHTML = '<small class="muted">Advertisement</small><ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(S.ads.client) + '" data-ad-slot="' + esc(S.ads.slot || "") + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
    if(S.mode === "hybrid" && S.api){ var rm = document.createElement("button"); rm.type = "button"; rm.className = "btn ghost"; rm.style.marginTop = "8px"; rm.textContent = "Remove ads for " + price(); rm.addEventListener("click", function(){ box.parentNode.insertBefore(card(), box.nextSibling); rm.hidden = true; }); box.appendChild(rm); }
    var q = $(".quiz", c) || $(".pn", c); if(q) c.insertBefore(box, q); else c.appendChild(box);
    if(window.IntersectionObserver){ var io = new IntersectionObserver(function(es){ if(es[0].isIntersecting){ io.disconnect(); try{ (window.adsbygoogle = window.adsbygoogle || []).push({}); }catch(e){} } }, {rootMargin: "300px"}); io.observe(box); }
  });
}
/* ---- shell: name, footer links, install button, service worker ---- */
function shell(){
  if(S.name){ var br = $(".brand"); if(br) br.textContent = S.name; }
  var f = $("footer"); if(f){ var p = document.createElement("p"); var b = S.base || "";
    p.innerHTML = '<a href="' + b + 'about.html">About</a> · <a href="' + b + 'privacy.html">Privacy</a> · <a href="' + b + 'terms.html">Terms</a> · <a href="' + b + 'refund.html">Refunds</a> · <a href="' + b + 'contact.html">Contact</a> · <a href="' + b + 'learn/">All lessons</a> <button type="button" class="btn ghost" id="pwa-install" hidden style="margin-left:8px">Install the app</button>'; f.appendChild(p); }
  var deferred = null;
  addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); deferred = e; var ib = $("#pwa-install"); if(ib){ ib.hidden = false; ib.onclick = function(){ deferred.prompt(); ib.hidden = true; }; } });
  if(S.sw && "serviceWorker" in navigator && location.protocol !== "file:") addEventListener("load", function(){ navigator.serviceWorker.register((S.base || "") + "sw.js").catch(function(){}); });
}
function start(){
  shell(); banner();
  var tok = null; try{ tok = localStorage.getItem(LKEY); }catch(e){}
  verify(tok).then(function(p){ if(p) unlock(); else if(S.mode === "paid") lock(); ads(); });
  addEventListener("hashchange", function(){ setTimeout(function(){ $$("#chips a").forEach(mark); ads(); }, 0); });
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
}
