/* Animated isometric explainers. A scene is a set of blocks on a floor; each step lights blocks up and sends packets between them.
   No libraries. Animation runs only while the scene is on screen and playing, and is replaced by static arrows when the reader prefers reduced motion. */
var PAL = {blue: [76, 141, 246], green: [63, 179, 127], red: [229, 100, 90], amber: [232, 177, 58], purple: [154, 123, 232], grey: [143, 163, 173], teal: [52, 176, 190]};
function rgb(c, k, a){ k = k === undefined ? 1 : k; return "rgba(" + Math.round(c[0] * k) + "," + Math.round(c[1] * k) + "," + Math.round(c[2] * k) + "," + (a === undefined ? 1 : a) + ")"; }
function cssv(n, fb){ var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; }
var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function scene(el, S){
  el.classList.add("viz");
  el.innerHTML = '<div class="lab-head"><b>' + esc(S.title) + '</b> ' + esc(S.sub || "") + '</div><div class="viz-stage"><canvas role="img" aria-label="' + esc(S.title) + '"></canvas></div>' +
    '<p class="viz-cap" aria-live="polite"></p><div class="step-controls"><button class="btn ghost" type="button" data-b>Back</button><button class="btn" type="button" data-p>Play</button><button class="btn ghost" type="button" data-n>Next</button><span class="cnt"></span></div>' +
    '<p class="viz-info muted">Tap a block to see what it does. On a small screen, swipe the picture sideways.</p><ol class="viz-steps"></ol>';
  var cv = $("canvas", el), ctx = cv.getContext("2d"), cap = $(".viz-cap", el), cnt = $(".cnt", el), info = $(".viz-info", el), list = $(".viz-steps", el);
  var step = 0, playing = false, visible = false, t0 = performance.now(), stepStart = t0, raf = 0, W = 0, Hh = 0, TW = 80, TH = 40, ox = 0, oy = 0, hit = [], col = {};
  /* Scenes are authored as (column, row) on the screen; convert to floor coordinates so columns run left to right. */
  var KC = 0.7, KR = 1.3, byId = {};
  S.nodes.forEach(function(n){ byId[n.id] = n; n.w = n.w || 1; n.d = n.d || 1; n.h = n.h || 34; if(n.col === undefined){ n.col = n.x; n.row = n.y; n.x = n.col * KC + n.row * KR; n.y = n.row * KR - n.col * KC; } });
  list.innerHTML = S.steps.map(function(s, i){ return '<li><button type="button" data-s="' + i + '"><span>' + (i + 1) + '.</span> ' + esc(s.cap) + '</button></li>'; }).join("");
  function iso(x, y, z){ return [ox + (x - y) * TW / 2, oy + (x + y) * TH / 2 - (z || 0)]; }
  function layout(){
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(540, Math.floor(el.querySelector(".viz-stage").clientWidth));   /* narrow screens scroll the stage sideways instead of shrinking it */
    var minU = 1e9, maxU = -1e9, minV = 1e9, maxV = -1e9;
    S.nodes.forEach(function(n){ [[n.x, n.y], [n.x + n.w, n.y], [n.x, n.y + n.d], [n.x + n.w, n.y + n.d]].forEach(function(p){ minU = Math.min(minU, p[0] - p[1]); maxU = Math.max(maxU, p[0] - p[1]); minV = Math.min(minV, p[0] + p[1]); maxV = Math.max(maxV, p[0] + p[1]); }); });
    TW = Math.min(104, (W - 56) / ((maxU - minU) / 2)); TH = TW / 2;
    var top = 64, bottom = 52;
    Hh = Math.ceil((maxV - minV) * TH / 2 + top + bottom);
    ox = 28 - minU * TW / 2 + (W - 56 - (maxU - minU) * TW / 2) / 2; oy = top - minV * TH / 2;
    cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + "px"; cv.style.height = Hh + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    col = {ink: cssv("--ink", "#16212A"), muted: cssv("--muted", "#566570"), line: cssv("--line", "#CFD8D6"), surf: cssv("--surface", "#fff"), bg: cssv("--surface2", "#E9EEEC")};
  }
  function centre(n, z){ return iso(n.x + n.w / 2, n.y + n.d / 2, z === undefined ? n.h * scaleH() : z); }
  function scaleH(){ return Math.max(0.55, TW / 104); }
  function box(n, lift, lit, dim){
    var c = PAL[n.c || "blue"], h = n.h * scaleH(), a = dim ? 0.32 : 1, z = lift;
    var A = iso(n.x, n.y, z + h), B = iso(n.x + n.w, n.y, z + h), C = iso(n.x + n.w, n.y + n.d, z + h), D = iso(n.x, n.y + n.d, z + h);
    var Bb = iso(n.x + n.w, n.y, z), Cb = iso(n.x + n.w, n.y + n.d, z), Db = iso(n.x, n.y + n.d, z);
    var sh = iso(n.x + n.w / 2, n.y + n.d / 2, 0);                                   /* soft shadow on the floor */
    ctx.fillStyle = "rgba(0,0,0," + (0.13 * a) + ")"; ctx.beginPath(); ctx.ellipse(sh[0], sh[1] + 3, TW * 0.42 * Math.max(n.w, n.d), TH * 0.42 * Math.max(n.w, n.d), 0, 0, 6.3); ctx.fill();
    function poly(ps, fill){ ctx.beginPath(); ctx.moveTo(ps[0][0], ps[0][1]); for(var i = 1; i < ps.length; i++) ctx.lineTo(ps[i][0], ps[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    poly([D, C, Cb, Db], rgb(c, 0.78, a)); poly([B, C, Cb, Bb], rgb(c, 0.6, a));
    var g = ctx.createLinearGradient(A[0], A[1], C[0], C[1]); g.addColorStop(0, rgb([Math.min(255, c[0] + 46), Math.min(255, c[1] + 46), Math.min(255, c[2] + 46)], 1, a)); g.addColorStop(1, rgb(c, 1, a));
    poly([A, B, C, D], g);
    if(lit){ ctx.lineWidth = 2.5; ctx.strokeStyle = rgb([255, 255, 255], 1, 0.9); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.stroke();
      ctx.shadowColor = rgb(c, 1, 0.9); ctx.shadowBlur = 18; ctx.strokeStyle = rgb(c, 1, 0.9); ctx.stroke(); ctx.shadowBlur = 0; }
    var xs = [A, B, C, D, Bb, Cb, Db].map(function(p){ return p[0]; }), ys = [A, B, C, D, Bb, Cb, Db].map(function(p){ return p[1]; });
    hit.push({n: n, x0: Math.min.apply(0, xs), x1: Math.max.apply(0, xs), y0: Math.min.apply(0, ys), y1: Math.max.apply(0, ys)});
    return {top: iso(n.x + n.w / 2, n.y + n.d / 2, z + h), base: Cb, a: a};
  }
  function label(n, p, a, badge){
    var fs = Math.max(10.5, Math.min(13, TW / 7.2));
    ctx.font = "700 " + fs + "px " + cssv("--f-body", "system-ui") ; ctx.textAlign = "center"; ctx.textBaseline = "top";
    var lines = String(n.label).split("\n"), y = p.base[1] + 5, cx = iso(n.x + n.w / 2, n.y + n.d / 2, 0)[0];
    lines.forEach(function(L, i){
      var w = ctx.measureText(L).width + 8; ctx.globalAlpha = a < 1 ? 0.55 : 0.86; ctx.fillStyle = col.surf; ctx.fillRect(cx - w / 2, y + i * (fs + 2) - 1, w, fs + 3);
      ctx.globalAlpha = a < 1 ? 0.55 : 1; ctx.fillStyle = col.ink; ctx.fillText(L, cx, y + i * (fs + 2));
    });
    ctx.globalAlpha = 1;
    if(badge){ ctx.font = "700 " + (fs - 0.5) + "px " + cssv("--f-body", "system-ui"); var bw = ctx.measureText(badge).width + 14, bx = p.top[0] - bw / 2, by = p.top[1] - TH * 0.5 * Math.max(n.w, n.d) - fs - 12;
      ctx.fillStyle = col.ink; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx, by, bw, fs + 8, 9); else ctx.rect(bx, by, bw, fs + 8); ctx.fill(); ctx.fillStyle = col.surf; ctx.fillText(badge, p.top[0], by + 4); }
  }
  function floor(){
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    S.nodes.forEach(function(n){ minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.d); });
    minX = Math.floor(minX - 0.5); minY = Math.floor(minY - 0.5); maxX = Math.ceil(maxX + 0.5); maxY = Math.ceil(maxY + 0.5);
    ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    for(var x = minX; x <= maxX; x++){ var a = iso(x, minY, 0), b = iso(x, maxY, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for(var y = minY; y <= maxY; y++){ var c = iso(minX, y, 0), d = iso(maxX, y, 0); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function arc(a, b, u){ var lift = Math.min(46, 14 + Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.16); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * lift]; }
  function flows(now){
    var st = S.steps[step], fl = st.flow || [], period = 1700, dur = fl.length ? Math.max(1, fl.length) * 520 + period : period;
    fl.forEach(function(f, i){
      var A = centre(byId[f[0]]), B = centre(byId[f[1]]), c = PAL[f[2] || "amber"];
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = rgb(c, 0.9, 0.75); ctx.beginPath();
      for(var k = 0; k <= 20; k++){ var p = arc(A, B, k / 20); if(k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); ctx.setLineDash([]);
      var e2 = arc(A, B, 1), e1 = arc(A, B, 0.9), ang = Math.atan2(e2[1] - e1[1], e2[0] - e1[0]);                  /* arrow head */
      ctx.fillStyle = rgb(c, 0.9, 0.9); ctx.beginPath(); ctx.moveTo(e2[0], e2[1]); ctx.lineTo(e2[0] - 9 * Math.cos(ang - 0.45), e2[1] - 9 * Math.sin(ang - 0.45)); ctx.lineTo(e2[0] - 9 * Math.cos(ang + 0.45), e2[1] - 9 * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
      if(f[3]){ var m = arc(A, B, 0.5); ctx.font = "600 " + Math.max(10, Math.min(12, TW / 8)) + "px " + cssv("--f-body", "system-ui"); ctx.textAlign = "center"; ctx.textBaseline = "bottom"; var tw = ctx.measureText(f[3]).width + 8; ctx.globalAlpha = 0.9; ctx.fillStyle = col.surf; ctx.fillRect(m[0] - tw / 2, m[1] - 19, tw, 15); ctx.globalAlpha = 1; ctx.fillStyle = col.ink; ctx.fillText(f[3], m[0], m[1] - 6); }
      if(REDUCED) return;
      var local = ((now - stepStart) % dur) - i * 520;
      for(var tr = 0; tr < 4; tr++){
        var u = (local - tr * 55) / 900; if(u < 0 || u > 1) continue;
        var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, q = arc(A, B, e), r = (6.5 - tr * 1.2) * Math.max(0.8, TW / 90);
        var g = ctx.createRadialGradient(q[0] - r * 0.3, q[1] - r * 0.3, 0.5, q[0], q[1], r); g.addColorStop(0, "rgba(255,255,255," + (0.95 - tr * 0.2) + ")"); g.addColorStop(0.45, rgb(c, 1, 0.95 - tr * 0.22)); g.addColorStop(1, rgb(c, 0.7, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r * 1.5, 0, 6.3); ctx.fill();
      }
    });
  }
  function frame(now){
    raf = 0; hit = [];
    ctx.clearRect(0, 0, W, Hh); floor();
    var st = S.steps[step], lit = st.lit || [], dim = st.dim || [], badge = st.badge || {};
    var order = S.nodes.slice().sort(function(a, b){ return (a.x + a.y + (a.w + a.d) / 2) - (b.x + b.y + (b.w + b.d) / 2); }), drawn = [];
    order.forEach(function(n, i){
      var isLit = lit.indexOf(n.id) >= 0, bob = REDUCED ? 0 : Math.sin(now / 520 + i * 1.3) * (isLit ? 3.2 : 1.1);
      drawn.push([n, box(n, (isLit ? 7 : 2) * scaleH() + bob, isLit, dim.indexOf(n.id) >= 0)]);
    });
    drawn.forEach(function(d){ label(d[0], d[1], d[1].a, badge[d[0].id]); });
    flows(now);
    if(playing && now - stepStart > Math.max(4200, (st.flow || []).length * 900 + 2600)){ if(step < S.steps.length - 1) go(step + 1); else { playing = false; ui(); } }
    if(visible && !document.hidden && (!REDUCED || playing)) raf = requestAnimationFrame(frame);
  }
  function kick(){ if(!raf) raf = requestAnimationFrame(frame); }
  function ui(){
    var st = S.steps[step]; cap.textContent = st.cap; cnt.textContent = "Step " + (step + 1) + " of " + S.steps.length;
    $("[data-b]", el).disabled = step === 0; $("[data-n]", el).disabled = step === S.steps.length - 1; $("[data-p]", el).textContent = playing ? "Pause" : (step === S.steps.length - 1 ? "Replay" : "Play");
    $$("button", list).forEach(function(b, i){ b.classList.toggle("on", i === step); });
  }
  function go(k){ step = Math.max(0, Math.min(S.steps.length - 1, k)); stepStart = performance.now(); ui(); kick(); }
  $("[data-b]", el).addEventListener("click", function(){ playing = false; go(step - 1); });
  $("[data-n]", el).addEventListener("click", function(){ playing = false; go(step + 1); });
  $("[data-p]", el).addEventListener("click", function(){ if(!playing && step === S.steps.length - 1) step = 0; playing = !playing; go(step); });
  list.addEventListener("click", function(e){ var b = e.target.closest("button"); if(b){ playing = false; go(Number(b.dataset.s)); } });
  cv.addEventListener("click", function(e){
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null;
    hit.forEach(function(h){ if(x >= h.x0 - 4 && x <= h.x1 + 4 && y >= h.y0 - 4 && y <= h.y1 + 22) best = h.n; });
    if(best){ info.innerHTML = "<b>" + esc(String(best.label).replace(/\n/g, " ")) + ":</b> " + esc(best.info || ""); info.classList.remove("muted"); }
  });
  cv.addEventListener("mousemove", function(e){ var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; cv.style.cursor = hit.some(function(h){ return x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1; }) ? "pointer" : "default"; });
  function relayout(){ if(!el.offsetParent) return; layout(); kick(); }
  if(window.IntersectionObserver){ new IntersectionObserver(function(es){ visible = es[0].isIntersecting; if(visible){ relayout(); } }, {threshold: 0.05}).observe(el); } else { visible = true; }
  if(window.ResizeObserver) new ResizeObserver(function(){ if(visible) relayout(); }).observe(el.querySelector(".viz-stage")); else addEventListener("resize", relayout);
  document.addEventListener("visibilitychange", function(){ if(!document.hidden && visible) kick(); });
  if(window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", relayout);
  ui(); if(el.offsetParent){ layout(); kick(); }
}

var SCENES = {
 viz_request: {title: "What happens when you open a web page", sub: "follow one request from the browser to the database and back", nodes: [
   {id: "you", label: "Browser", x: 0, y: 2, c: "purple", info: "Your browser. It needs an IP address before it can connect to anything."},
   {id: "dns", label: "DNS", x: 2.2, y: 0, c: "amber", info: "The internet's phone book: turns the name shop.example.com into an IP address. Answers are cached for the record's TTL."},
   {id: "lb", label: "Load\nbalancer", x: 2.5, y: 3, c: "teal", info: "One public address in front of many servers. It sends each request to a healthy server and removes servers that fail health checks."},
   {id: "w1", label: "Web 1", x: 5, y: 0, c: "blue", info: "An application server. Stateless, so any copy can answer any request."},
   {id: "w2", label: "Web 2", x: 5, y: 2, c: "blue", info: "An application server. Stateless, so any copy can answer any request."},
   {id: "w3", label: "Web 3", x: 5, y: 4, c: "blue", info: "An application server. Stateless, so any copy can answer any request."},
   {id: "cache", label: "Cache", x: 7.5, y: 0.8, c: "green", info: "Keeps recent answers in memory (for example Redis). A hit is about a thousand times faster than a database query."},
   {id: "db", label: "Database", x: 7.5, y: 3.2, c: "red", h: 44, info: "The source of truth on disk. Slower than the cache, and the part that is hardest to scale."}],
  steps: [
   {cap: "You type shop.example.com. The browser first asks DNS: what is the IP address for this name?", flow: [["you", "dns", "amber", "name?"], ["dns", "you", "amber", "203.0.113.7"]], lit: ["you", "dns"]},
   {cap: "With the address, the browser opens a TCP connection and a TLS handshake with the load balancer, then sends the HTTP request.", flow: [["you", "lb", "purple", "GET /cart"]], lit: ["you", "lb"]},
   {cap: "The load balancer picks one healthy server. Health checks decide which servers are in rotation.", flow: [["lb", "w2", "teal"]], lit: ["lb", "w2"], badge: {w1: "healthy", w2: "chosen", w3: "healthy"}},
   {cap: "The server asks the cache first. A cache hit returns in about a millisecond and the database is never touched.", flow: [["w2", "cache", "green", "get cart:42"], ["cache", "w2", "green", "hit"]], lit: ["w2", "cache"]},
   {cap: "On a cache miss the server queries the database, then stores the answer in the cache for next time.", flow: [["w2", "db", "red", "SELECT"], ["db", "w2", "red", "rows"], ["w2", "cache", "green", "set"]], lit: ["w2", "db", "cache"]},
   {cap: "The response travels back through the load balancer to your browser, which renders the page.", flow: [["w2", "lb", "blue"], ["lb", "you", "blue", "200 OK"]], lit: ["w2", "lb", "you"]},
   {cap: "A server fails its health check. The load balancer stops sending it traffic, and users notice nothing.", flow: [["lb", "w1", "teal"], ["lb", "w2", "teal"]], lit: ["lb", "w1", "w2"], dim: ["w3"], badge: {w3: "failed"}}]},
 viz_k8s: {title: "kubectl apply, step by step", sub: "how a Deployment becomes running Pods", nodes: [
   {id: "you", label: "kubectl", x: 0, y: 2.6, c: "purple", info: "The command-line client. It only ever talks to the API server."},
   {id: "api", label: "API\nserver", x: 2.4, y: 2.6, c: "teal", h: 44, info: "The front door of the cluster. Every component reads and writes state through it; nothing talks to etcd directly."},
   {id: "etcd", label: "etcd", x: 2.4, y: 0, c: "red", info: "The cluster's database: a consistent key-value store holding the desired and current state."},
   {id: "cm", label: "Controller\nmanager", x: 4.7, y: 0, c: "amber", info: "Runs the control loops. The Deployment controller creates a ReplicaSet; the ReplicaSet controller creates Pods until the count matches."},
   {id: "sch", label: "Scheduler", x: 7, y: 0, c: "amber", info: "Watches for Pods with no node and picks a node for each, using resource requests, taints and affinity."},
   {id: "n1", label: "Node 1\nkubelet", x: 4.9, y: 3.2, c: "blue", w: 1.2, info: "A worker machine. Its kubelet starts the containers of the Pods assigned to it and reports their status."},
   {id: "n2", label: "Node 2\nkubelet", x: 7.3, y: 3.2, c: "blue", w: 1.2, info: "A worker machine. Its kubelet starts the containers of the Pods assigned to it and reports their status."},
   {id: "reg", label: "Image\nregistry", x: 6.1, y: 5.6, c: "grey", info: "Stores container images. The container runtime on each node pulls the image the Pod asks for."}],
  steps: [
   {cap: "You run kubectl apply -f deployment.yaml. kubectl sends the Deployment to the API server.", flow: [["you", "api", "purple", "Deployment: 3 replicas"]], lit: ["you", "api"]},
   {cap: "The API server authenticates you, checks permissions (RBAC), validates the object and stores it in etcd. That is now the desired state.", flow: [["api", "etcd", "red", "store"]], lit: ["api", "etcd"]},
   {cap: "The controller manager is watching. It sees a Deployment with no Pods and creates a ReplicaSet and three Pod objects.", flow: [["api", "cm", "amber", "watch"], ["cm", "api", "amber", "create 3 Pods"]], lit: ["cm", "api"]},
   {cap: "The scheduler sees Pods with no node. It picks a node for each, based on free CPU and memory and any rules.", flow: [["api", "sch", "amber", "Pending Pods"], ["sch", "api", "amber", "bind to nodes"]], lit: ["sch", "api"], badge: {n1: "2 Pods", n2: "1 Pod"}},
   {cap: "Each kubelet sees Pods assigned to its node, asks the container runtime to pull the image and starts the containers.", flow: [["api", "n1", "blue"], ["api", "n2", "blue"], ["reg", "n1", "grey", "pull"], ["reg", "n2", "grey", "pull"]], lit: ["n1", "n2", "reg"], badge: {n1: "starting", n2: "starting"}},
   {cap: "The kubelets report status back. When readiness probes pass, the Pods are Ready and Services send them traffic.", flow: [["n1", "api", "green", "Ready"], ["n2", "api", "green", "Ready"]], lit: ["n1", "n2", "api"], badge: {n1: "2 Ready", n2: "1 Ready"}},
   {cap: "Node 2 dies. The controller notices only 2 of 3 Pods exist and creates a replacement, which the scheduler places on Node 1. That loop is self-healing.", flow: [["cm", "api", "amber", "create 1 Pod"], ["api", "n1", "blue"]], lit: ["cm", "n1"], dim: ["n2"], badge: {n2: "NotReady", n1: "3 Ready"}}]},
 viz_cicd: {title: "From a commit to production", sub: "a CI/CD pipeline with a GitOps deploy", nodes: [
   {id: "dev", label: "Developer", x: 0, y: 2, c: "purple", info: "Writes code on a branch and opens a pull request."},
   {id: "git", label: "Git\nrepository", x: 2, y: 2, c: "grey", info: "The source of truth for code. A merge to main starts the pipeline."},
   {id: "build", label: "Build", x: 4.1, y: 0.6, c: "blue", info: "Compiles the code and builds a container image. Caching dependencies and layers keeps it fast."},
   {id: "test", label: "Tests\nand scans", x: 4.1, y: 3.4, c: "amber", info: "Unit tests, linters and security scans. A failure here stops the pipeline: nothing is deployed."},
   {id: "reg", label: "Image\nregistry", x: 6.3, y: 0.6, c: "teal", info: "Stores the versioned, immutable image. The same image is promoted through every environment."},
   {id: "ops", label: "Deploy\nrepository", x: 6.3, y: 3.4, c: "grey", info: "Git repository holding what should run where. Changing the image tag here is the release."},
   {id: "cd", label: "GitOps\ncontroller", x: 8.5, y: 3.4, c: "green", info: "Runs inside the cluster (Argo CD or Flux). It pulls the desired state from Git and makes the cluster match."},
   {id: "prod", label: "Cluster", x: 8.5, y: 0.8, c: "red", h: 46, info: "Where the application runs. A rolling update replaces old Pods with new ones a few at a time."}],
  steps: [
   {cap: "A developer pushes a commit and opens a pull request. Review happens here, before anything is built for release.", flow: [["dev", "git", "purple", "git push"]], lit: ["dev", "git"]},
   {cap: "The merge triggers the pipeline. Build and tests run in parallel to keep feedback fast.", flow: [["git", "build", "blue"], ["git", "test", "amber"]], lit: ["build", "test"]},
   {cap: "A test fails. The pipeline stops, the developer is told, and production is untouched. Failing fast is the point.", flow: [["test", "dev", "red", "failed"]], lit: ["test", "dev"], dim: ["reg", "ops", "cd", "prod"], badge: {test: "red"}},
   {cap: "After the fix everything passes. The image is pushed to the registry with a unique tag.", flow: [["build", "reg", "teal", "shop:1.8.3"]], lit: ["build", "reg"], badge: {test: "green"}},
   {cap: "The pipeline commits the new image tag to the deploy repository. CI never needs cluster credentials.", flow: [["build", "ops", "blue", "tag: 1.8.3"]], lit: ["ops"]},
   {cap: "The GitOps controller notices the change, pulls it, and applies it to the cluster.", flow: [["ops", "cd", "green", "pull"], ["cd", "prod", "green", "apply"]], lit: ["cd", "prod"]},
   {cap: "The cluster pulls the image and rolls it out. To roll back, revert the commit in the deploy repository.", flow: [["reg", "prod", "teal", "pull image"]], lit: ["prod", "reg"], badge: {prod: "v1.8.3"}}]},
 viz_etl: {title: "A data pipeline, end to end", sub: "from source systems to a dashboard", nodes: [
   {id: "api", label: "API", x: 0, y: 0, c: "purple", info: "A source system reached over HTTP: pages, tokens, rate limits."},
   {id: "app", label: "App\ndatabase", x: 0, y: 2, c: "purple", info: "The application's own database. Read it with a high-water mark or change data capture, not with heavy queries."},
   {id: "files", label: "Files", x: 0, y: 4, c: "purple", info: "Daily exports dropped as CSV or JSON files."},
   {id: "raw", label: "Raw\nzone", x: 2.2, y: 2, c: "grey", h: 26, info: "Data exactly as received, append-only. Keeping it means you can rebuild everything after fixing a bug."},
   {id: "tf", label: "Transform\nand check", x: 4.4, y: 2, c: "amber", info: "Clean, de-duplicate, convert types, join, and run quality checks."},
   {id: "rej", label: "Quarantine", x: 4.4, y: 4.4, c: "red", h: 22, info: "Rows that failed validation, stored with the reason. Never silently dropped."},
   {id: "wh", label: "Warehouse", x: 6.6, y: 2, c: "teal", h: 48, info: "Modelled tables (facts and dimensions) that analysts query."},
   {id: "bi", label: "Dashboard", x: 8.8, y: 2, c: "green", info: "What the business sees. It is only as good as every step before it."}],
  steps: [
   {cap: "Extract: an orchestrator starts the run for one date. Each source is read with the method that suits it.", flow: [["api", "raw", "purple"], ["app", "raw", "purple"], ["files", "raw", "purple"]], lit: ["api", "app", "files", "raw"]},
   {cap: "Land the data unchanged in the raw zone. If a transformation is wrong later, you can replay from here.", flow: [], lit: ["raw"], badge: {raw: "append-only"}},
   {cap: "Transform: fix types, trim text, remove duplicates, join. Then run the checks: not null, unique, ranges, row counts.", flow: [["raw", "tf", "amber"]], lit: ["tf"]},
   {cap: "Bad rows go to quarantine with a reason. If too many fail, the run stops and yesterday's good data stays published.", flow: [["tf", "rej", "red", "3 rejected"]], lit: ["rej", "tf"]},
   {cap: "Load: upsert into the warehouse inside a transaction, so a re-run never duplicates rows and a crash leaves nothing half-loaded.", flow: [["tf", "wh", "teal", "upsert"]], lit: ["wh"]},
   {cap: "The dashboard reads the modelled tables. Freshness and volume monitors alert the owner if the data is late or looks wrong.", flow: [["wh", "bi", "green"]], lit: ["wh", "bi"], badge: {bi: "fresh"}},
   {cap: "The run is repeated by mistake. Nothing changes: files already loaded are skipped and upserts are idempotent.", flow: [["raw", "tf", "grey"], ["tf", "wh", "grey", "0 changes"]], lit: ["wh"], badge: {wh: "same rows"}}]},
 viz_kafka: {title: "A stream: partitions, offsets and a consumer crash", sub: "why events arrive twice and how to make that harmless", nodes: [
   {id: "prod", label: "Producer", x: 0, y: 2, c: "purple", info: "The application that publishes events. The key of each event decides its partition."},
   {id: "p0", label: "Partition 0", x: 2.6, y: 0, c: "teal", w: 1.3, h: 22, info: "An append-only log. Order is guaranteed inside one partition only."},
   {id: "p1", label: "Partition 1", x: 2.6, y: 2, c: "teal", w: 1.3, h: 22, info: "An append-only log. All events with the same key land here, in order."},
   {id: "p2", label: "Partition 2", x: 2.6, y: 4, c: "teal", w: 1.3, h: 22, info: "An append-only log. Events are kept for the retention period, so they can be replayed."},
   {id: "ca", label: "Consumer A", x: 5.6, y: 0.9, c: "blue", info: "A member of the consumer group. It reads its partitions and commits its offset after processing."},
   {id: "cb", label: "Consumer B", x: 5.6, y: 3.2, c: "blue", info: "Another member of the same group. The group shares the partitions among its members."},
   {id: "sink", label: "Database", x: 8, y: 2, c: "red", h: 44, info: "Where results are written. Writes are upserts by event id, so a repeated event changes nothing."}],
  steps: [
   {cap: "The producer sends events. hash(key) picks the partition, so every event of one customer goes to the same partition, in order.", flow: [["prod", "p0", "purple", "key=ben"], ["prod", "p1", "purple", "key=asha"], ["prod", "p2", "purple", "key=chen"]], lit: ["prod", "p0", "p1", "p2"]},
   {cap: "Two consumers in one group share the partitions: A reads partitions 0 and 1, B reads partition 2.", flow: [["p0", "ca", "teal"], ["p1", "ca", "teal"], ["p2", "cb", "teal"]], lit: ["ca", "cb"], badge: {ca: "P0, P1", cb: "P2"}},
   {cap: "Each consumer processes a batch, writes the result, then commits its offset: the position it has safely reached.", flow: [["ca", "sink", "blue", "upsert"], ["cb", "sink", "blue", "upsert"]], lit: ["sink"], badge: {ca: "offset 41", cb: "offset 17"}},
   {cap: "Consumer A crashes after writing results but before committing its offset.", flow: [], lit: ["ca"], dim: ["ca"], badge: {ca: "crashed"}},
   {cap: "The group rebalances: consumer B takes over A's partitions and starts from the last committed offset, so it reads some events again.", flow: [["p0", "cb", "amber", "replay"], ["p1", "cb", "amber", "replay"], ["p2", "cb", "teal"]], lit: ["cb"], dim: ["ca"], badge: {cb: "P0, P1, P2"}},
   {cap: "Those events are delivered twice (at-least-once). Because the write is an upsert by event id, the totals stay correct.", flow: [["cb", "sink", "green", "upsert: no change"]], lit: ["sink", "cb"], dim: ["ca"], badge: {sink: "correct"}}]},
 viz_rag: {title: "Retrieval-augmented generation (RAG)", sub: "how a model answers from your documents", nodes: [
   {id: "docs", label: "Documents", x: 0, y: 0, c: "grey", h: 26, info: "Your knowledge: manuals, tickets, wiki pages. The model was never trained on them."},
   {id: "chunk", label: "Chunker", x: 2.2, y: 0, c: "amber", info: "Splits documents into passages of a few hundred words, small enough to retrieve precisely."},
   {id: "emb", label: "Embedding\nmodel", x: 4.4, y: 1.7, c: "purple", info: "Turns text into a vector of numbers so that texts with similar meaning are close together."},
   {id: "vec", label: "Vector\nstore", x: 6.6, y: 0, c: "teal", h: 46, info: "Stores the chunk vectors and finds the nearest ones to a question vector quickly."},
   {id: "user", label: "User", x: 0, y: 3.6, c: "blue", info: "Asks a question in plain language."},
   {id: "prompt", label: "Prompt\nbuilder", x: 6.6, y: 3.6, c: "amber", info: "Puts the instructions, the retrieved passages and the question into one prompt."},
   {id: "llm", label: "LLM", x: 8.8, y: 3.6, c: "red", h: 50, info: "The language model. It answers from the passages in its context window, and can cite them."}],
  steps: [
   {cap: "Indexing, done ahead of time: documents are split into chunks.", flow: [["docs", "chunk", "grey"]], lit: ["docs", "chunk"]},
   {cap: "Each chunk is embedded and stored in the vector store together with its text and source.", flow: [["chunk", "emb", "purple"], ["emb", "vec", "teal", "vectors"]], lit: ["emb", "vec"]},
   {cap: "Query time: the user asks a question. The same embedding model turns the question into a vector.", flow: [["user", "emb", "blue", "question"]], lit: ["user", "emb"]},
   {cap: "The vector store returns the few chunks whose vectors are nearest to the question: the most relevant passages.", flow: [["emb", "vec", "purple", "query vector"], ["vec", "prompt", "teal", "top 4 chunks"]], lit: ["vec", "prompt"]},
   {cap: "The prompt builder combines instructions, the retrieved passages and the question, and sends them to the model.", flow: [["user", "prompt", "blue"], ["prompt", "llm", "amber", "prompt + context"]], lit: ["prompt", "llm"]},
   {cap: "The model answers from the passages and cites them. If retrieval found the wrong passages, the answer will be wrong: measure retrieval first.", flow: [["llm", "user", "green", "answer + sources"]], lit: ["llm", "user"]}]}
};
Object.keys(SCENES).forEach(function(k){ window.W[k] = function(el){ scene(el, SCENES[k]); }; });
