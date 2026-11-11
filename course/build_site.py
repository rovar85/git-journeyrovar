#!/usr/bin/env python3
"""Build the public website into course/site/ from the same sources as the single-file course.

  python3 build_site.py [config.json] [--out=folder]      # default: site.config.json -> site/
Output:
  site/index.html            the interactive app (lab, quizzes, progress), installable and usable offline
  site/learn/...             one light static page per lesson for search engines and sharing, linking into the app
  site/{about,privacy,terms,refund,contact}.html, manifest.webmanifest, sw.js, icons, sitemap.xml, robots.txt, 404.html, _headers
Host the folder on any static host (Cloudflare Pages, GitHub Pages, Netlify). Nothing here needs a server; payments use server/worker.js.
"""
import hashlib, html, json, os, re, shutil, struct, subprocess, sys, zlib
here = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--out=")]
cfg = json.load(open(args[0] if args else os.path.join(here, "site.config.json"), encoding="utf-8"))      # optional: another config file
out = next((a[6:] for a in sys.argv[1:] if a.startswith("--out=")), os.path.join(here, "site"))          # optional: --out=folder
shutil.rmtree(out, ignore_errors=True); os.makedirs(os.path.join(out, "assets"))
warn = []
MODE = cfg.get("mode", "free"); assert MODE in ("free", "ads", "paid", "hybrid"), "mode must be free, ads, paid or hybrid"
DOMAIN = cfg.get("domain", "").rstrip("/")
if "YOUR-DOMAIN" in DOMAIN or not DOMAIN: warn.append("domain is not set: canonical links and sitemap.xml use a placeholder")
if MODE in ("paid", "hybrid") and not (cfg.get("api_base") and cfg.get("license_public_jwk")): warn.append(f"mode is {MODE} but api_base / license_public_jwk are not set: nobody can pay or unlock")
if MODE in ("ads", "hybrid") and not cfg.get("adsense_client"): warn.append(f"mode is {MODE} but adsense_client is not set: no ads will show")
for k, v in cfg["owner"].items():
    if "YOUR" in v: warn.append(f"owner.{k} is still a placeholder: the legal pages are incomplete")
E = lambda s: html.escape(str(s), quote=True)

# ---- 1. the app --------------------------------------------------------------------------------------------------------------
site = {"name": cfg["name"], "mode": MODE, "price": cfg.get("price_inr", 49), "freeLessons": cfg.get("free_lessons_per_track", 3), "freeTracks": cfg.get("free_tracks", []),
        "api": cfg.get("api_base", "").rstrip("/"), "licenseKey": cfg.get("license_public_jwk"), "product": "course", "sw": True, "base": "",
        "ads": {"client": cfg.get("adsense_client", ""), "slot": cfg.get("adsense_slot", "")}}
tmp = os.path.join(out, "_app.html")
env = dict(os.environ, COURSE_EXCLUDE=",".join(cfg.get("exclude_tracks", [])), COURSE_OUT=tmp, COURSE_SITE=json.dumps(site))
subprocess.run([sys.executable, os.path.join(here, "build.py")], check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
frag = open(tmp, encoding="utf-8").read(); os.remove(tmp)
for a, b in cfg.get("replace", []):
    if a not in frag: warn.append("replace text not found: " + a[:50])
    frag = frag.replace(a, b)
ids = set(re.findall(r'<section class="chapter" id="([^"]+)"', frag)) | set(re.findall(r'"id": "([a-z]+)"', frag))
def drop_dead_links(m):                                   # links into tracks that were left out of this build become plain text
    return m.group(0) if m.group(1) in ids or m.group(1) in ("hub", "study", "top") or m.group(1).startswith("study/") else m.group(2)
frag, dead = re.subn(r'<a href="#([^"]+)"[^>]*>(.*?)</a>', drop_dead_links, frag, flags=re.S), None
frag = frag[0]
head_end = frag.index("</style>") + len("</style>")
css = re.search(r"<style>(.*?)</style>", frag, re.S).group(1)
fonts = re.search(r'(<link rel="preconnect".*?rel="stylesheet">)', frag, re.S).group(1)
body = frag[head_end:]
body = body.replace("<title>Agent School</title>", "")
build_id = hashlib.sha256(frag.encode()).hexdigest()[:12]
def head(title, desc, path, depth=0, extra=""):
    b = "../" * depth
    return (f'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>{E(title)}</title>\n'
            f'<meta name="description" content="{E(desc)}">\n<link rel="canonical" href="{E(DOMAIN + "/" + path)}">\n'
            f'<meta property="og:title" content="{E(title)}">\n<meta property="og:description" content="{E(desc)}">\n<meta property="og:type" content="website">\n<meta property="og:url" content="{E(DOMAIN + "/" + path)}">\n<meta property="og:image" content="{E(DOMAIN)}/icon-512.png">\n'
            f'<link rel="manifest" href="{b}manifest.webmanifest">\n<meta name="theme-color" content="#1B5BD1">\n<link rel="icon" href="{b}icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="{b}icon-192.png">\n{fonts}\n{extra}</head>\n')
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(
    head(f'{cfg["name"]}: {cfg["tagline"]}', cfg["description"], "") .replace("</head>", f"<style>{css}</style>\n</head>") + "<body>\n" + body + "\n</body>\n</html>\n")
open(os.path.join(out, "assets", "site.css"), "w", encoding="utf-8").write(css + """
/* static lesson pages */
.chapter[hidden]{display:block}
.static .quiz,.static .lab[data-widget],.static .lab-run,.static .study-loop,.static .notes-box{display:none}
.cta{position:sticky;top:0;z-index:20;background:var(--accent);color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-weight:700}
.cta a{background:#fff;color:#1B5BD1;border-radius:8px;padding:6px 14px;text-decoration:none}
.crumbs{font-size:.9rem;margin:18px 0 0}
.lessonlist{columns:2 320px;padding-left:1.2rem}
.lessonlist li{margin:.25rem 0;break-inside:avoid}
""")

# ---- 2. one static page per lesson ---------------------------------------------------------------------------------------------
tracks = json.loads(re.search(r"window\.TRACKS=(\[.*?\]);</script>", frag, re.S).group(1))
tname = {t["id"]: t["name"] for t in tracks}
slug = lambda s: re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", html.unescape(s).lower())).strip("-")[:70]
lessons = []
for m in re.finditer(r'<section class="chapter" id="([^"]+)" data-track="([^"]+)" data-n="(\d+)"(.*?)>(.*?)</section>', body, re.S):
    cid, track, n, attrs, inner = m.groups()
    road = re.search(r'data-road="([^"]*)"', attrs); sub = re.search(r'data-sub="([^"]*)"', attrs)
    title = html.unescape(road.group(1)) if road else cid
    lessons.append(dict(id=cid, track=track, n=int(n), title=title, sub=html.unescape(sub.group(1)) if sub else "", inner=inner, url=f"learn/{track}/{int(n)}-{slug(title)}/"))
url_of = {l["id"]: l["url"] for l in lessons}
free = lambda l: MODE != "paid" or l["track"] in cfg.get("free_tracks", []) or l["n"] <= cfg.get("free_lessons_per_track", 3)
adsnip = (f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={E(cfg.get("adsense_client", ""))}" crossorigin="anonymous"></script>' if MODE in ("ads", "hybrid") and cfg.get("adsense_client") else "")
adslot = (f'<div class="adbox"><small class="muted">Advertisement</small><ins class="adsbygoogle" style="display:block" data-ad-client="{E(cfg.get("adsense_client", ""))}" data-ad-slot="{E(cfg.get("adsense_slot", ""))}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({{}});</script></div>' if adsnip else "")
by_track = {}
for l in lessons: by_track.setdefault(l["track"], []).append(l)
footer = lambda b: (f'<footer><p><a href="{b}index.html">{E(cfg["name"])}</a> · <a href="{b}learn/">All lessons</a> · <a href="{b}about.html">About</a> · <a href="{b}privacy.html">Privacy</a> · <a href="{b}terms.html">Terms</a> · <a href="{b}refund.html">Refunds</a> · <a href="{b}contact.html">Contact</a></p></footer>')
for l in lessons:
    b = "../../../"
    inner = l["inner"]
    if not free(l):                                        # paid mode: publish only the title and goals of locked lessons
        cut = inner.find("</div>", inner.find('class="goals"')) if 'class="goals"' in inner else inner.find("</header>")
        inner = inner[:cut + 6] + f'<div class="board note"><span class="tag">Full course</span><p>This lesson is part of the full course. The first {cfg.get("free_lessons_per_track", 3)} lessons of every track are free; one payment of ₹{cfg.get("price_inr", 49)} unlocks the rest.</p></div>'
    inner = re.sub(r'<a href="#([^"]+)"', lambda m: f'<a href="{b}{url_of[m.group(1)]}"' if m.group(1) in url_of else f'<a href="{b}index.html#{m.group(1)}"', inner)
    inner = re.sub(r'<script type="application/json" class="quizdata".*?</script>', "", inner, flags=re.S)
    sibs = by_track[l["track"]]; k = sibs.index(l)
    nav = '<nav class="pn">' + (f'<a href="{b}{sibs[k-1]["url"]}">← {E(sibs[k-1]["title"])}</a>' if k else f'<a href="{b}learn/">← All lessons</a>') + (f'<a class="nx" href="{b}{sibs[k+1]["url"]}">{E(sibs[k+1]["title"])} →</a>' if k + 1 < len(sibs) else "") + "</nav>"
    ld = json.dumps({"@context": "https://schema.org", "@type": "LearningResource", "name": l["title"], "description": l["sub"], "isPartOf": {"@type": "Course", "name": tname[l["track"]], "provider": {"@type": "Organization", "name": cfg["name"]}}, "inLanguage": "en", "isAccessibleForFree": free(l), "url": DOMAIN + "/" + l["url"]}).replace("</", "<\\/")
    page = (head(f'{l["title"]} | {cfg["name"]}', l["sub"] or l["title"], l["url"], 3, f'<link rel="stylesheet" href="{b}assets/site.css">\n<script type="application/ld+json">{ld}</script>\n{adsnip}\n')
            + f'<body class="static">\n<div class="cta"><span>Run the code, take the quiz and track your progress</span><a href="{b}index.html#{l["id"]}">Open this lesson in the interactive app</a></div>\n<div class="wrap">\n'
            + f'<p class="crumbs"><a href="{b}index.html">{E(cfg["name"])}</a> › <a href="{b}learn/#{l["track"]}">{E(tname[l["track"]])}</a></p>\n<section class="chapter" id="{l["id"]}">{inner}{adslot}{nav}</section>\n{footer(b)}\n</div>\n</body>\n</html>\n')
    d = os.path.join(out, l["url"]); os.makedirs(d, exist_ok=True); open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)
idx = "".join(f'<h2 id="{t["id"]}">{E(t["name"])}</h2><p>{E(t["blurb"])}</p><ol class="lessonlist">' + "".join(f'<li><a href="../{l["url"]}">{E(l["title"])}</a></li>' for l in by_track.get(t["id"], [])) + "</ol>" for t in tracks if by_track.get(t["id"]))
os.makedirs(os.path.join(out, "learn"), exist_ok=True)
open(os.path.join(out, "learn", "index.html"), "w", encoding="utf-8").write(head(f'All lessons | {cfg["name"]}', f'Every lesson of {cfg["name"]}, by track.', "learn/", 1, '<link rel="stylesheet" href="../assets/site.css">\n') + f'<body class="static"><div class="cta"><span>{E(cfg["tagline"])}</span><a href="../index.html">Open the interactive app</a></div><div class="wrap"><h1 style="margin-top:28px">All lessons</h1>{idx}{footer("../")}</div></body></html>')

# ---- 3. information and legal pages (templates: have them reviewed before taking payments) -------------------------------------
O = cfg["owner"]; price = cfg.get("price_inr", 49)
PAGES = {
 "about": ("About", f"""<p>{E(cfg["name"])} is a self-paced, hands-on course: {E(cfg["description"])}</p><p>It contains {len(lessons)} lessons in {len(by_track)} tracks. Commands marked <b>Real output</b> were run on a Linux machine and the output recorded. The practice lab runs inside your browser; nothing you type there leaves your device.</p><p>Run by {E(O["name"])}, {E(O["country"])}. Questions: <a href="contact.html">contact</a>.</p><h2>Sources and credits</h2><p>Lessons that draw on public talks, papers or open-source material name and link the source inside the lesson. Question-bank lessons include the original licence notice (CC BY 4.0 or MIT) in their first lesson.</p>"""),
 "privacy": ("Privacy policy", f"""<p>Last updated: set this date when you publish.</p><h2>What is stored on your device</h2><p>Your progress, quiz results, notes, flashcard schedule, practice-lab files and, if you buy the course, your licence key are stored in your browser's local storage. They are not sent to us. Clearing your browser data removes them.</p><h2>What we receive</h2><ul><li><b>Payments</b> (only if you buy): your email address and payment are processed by Razorpay. We receive the payment ID, amount, status and your email, and use them only to issue and restore your licence and to meet tax and accounting duties. We never see your card or UPI details.</li><li><b>Hosting logs:</b> our hosting provider records standard request logs (IP address, time, page) for security and reliability.</li>{"<li><b>Advertising:</b> this site shows ads from Google AdSense. Google and its partners may use cookies to show ads based on your visits to this and other sites. You can turn off personalised ads at <a href='https://adssettings.google.com'>adssettings.google.com</a>.</li>" if MODE in ("ads", "hybrid") else ""}</ul><h2>Third-party services</h2><p>Fonts are loaded from Google Fonts. Python in the practice lab is loaded from the jsDelivr content network. These providers receive your IP address when your browser fetches those files.</p><h2>Children</h2><p>The course is intended for learners aged 16 and over.</p><h2>Your choices</h2><p>You can ask what payment data we hold about you, or ask us to delete it where the law allows, by writing to <a href="mailto:{E(O["email"])}">{E(O["email"])}</a>.</p><h2>Contact</h2><p>{E(O["name"])}, {E(O["address"])}. Email: {E(O["email"])}.</p>"""),
 "terms": ("Terms of use", f"""<p>Last updated: set this date when you publish.</p><h2>The service</h2><p>{E(cfg["name"])} provides educational material and a browser-based practice environment. It is provided as is, for learning. It does not grant an accredited qualification; certificates record course completion only.</p><h2>Your licence</h2><p>{"A one-time payment of ₹" + str(price) + " gives you a personal, non-transferable licence to use the full course. " if MODE in ("paid", "hybrid") else ""}You may use the material for your own learning. You may not resell or republish the course or share a licence key publicly.</p><h2>Acceptable use</h2><p>Do not attempt to disrupt the service or bypass its payment checks. Commands taught here are for systems you own or are authorised to use.</p><h2>Accuracy</h2><p>Tools change quickly. We work to keep lessons correct, but you are responsible for checking official documentation before using anything in production. To the extent the law allows, our liability is limited to the amount you paid.</p><h2>Governing law</h2><p>These terms are governed by the laws of {E(O["country"])}.</p><h2>Contact</h2><p>{E(O["name"])}, {E(O["address"])}. Email: {E(O["email"])}.</p>"""),
 "refund": ("Refund and cancellation policy", f"""<p>Last updated: set this date when you publish.</p><p>{"The full course is a one-time purchase of ₹" + str(price) + ". There is no subscription, so there is nothing to cancel." if MODE in ("paid", "hybrid") else "The course is currently free; no payment is taken."}</p><p>The first {cfg.get("free_lessons_per_track", 3)} lessons of every track are free so that you can decide before paying. If you paid and the course did not unlock, or you were charged twice, write to <a href="mailto:{E(O["email"])}">{E(O["email"])}</a> with your payment ID within 7 days and we will fix it or refund you in full. Approved refunds are returned to the original payment method, normally within 5 to 7 working days.</p>"""),
 "contact": ("Contact", f"""<p>Support and questions: <a href="mailto:{E(O["email"])}">{E(O["email"])}</a></p><p>{E(O["name"])}<br>{E(O["address"])}</p><p>We aim to reply within two working days.</p>"""),
}
for name, (title, content) in PAGES.items():
    open(os.path.join(out, name + ".html"), "w", encoding="utf-8").write(head(f'{title} | {cfg["name"]}', f'{title} for {cfg["name"]}.', name + ".html", 0, '<link rel="stylesheet" href="assets/site.css">\n') + f'<body class="static"><div class="wrap"><p class="crumbs"><a href="index.html">← {E(cfg["name"])}</a></p><h1>{E(title)}</h1>{content}{footer("")}</div></body></html>')
open(os.path.join(out, "404.html"), "w", encoding="utf-8").write(head(f'Page not found | {cfg["name"]}', "Page not found.", "404.html", 0, '<link rel="stylesheet" href="/assets/site.css">\n<meta name="robots" content="noindex">\n') + f'<body class="static"><div class="wrap"><h1 style="margin-top:40px">Page not found</h1><p><a class="btn" href="/">Go to the course</a></p></div></body></html>')

# ---- 4. icons, manifest, service worker, sitemap -------------------------------------------------------------------------------
def png(size):                                             # a plain icon drawn without any image library: blue rounded tile with a white ">_" prompt
    px = bytearray()
    def inside_round(x, y, r):
        cx = min(max(x, r), size - 1 - r); cy = min(max(y, r), size - 1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    u = size / 16.0
    def glyph(x, y):
        gx, gy = x / u, y / u
        if 9.0 <= gx <= 12.5 and 10.6 <= gy <= 11.9: return True                       # underscore
        for (x0, y0, x1, y1) in ((3.6, 4.6, 7.4, 8.0), (7.4, 8.0, 3.6, 11.4)):          # the two strokes of ">"
            dx, dy = x1 - x0, y1 - y0; t = max(0, min(1, ((gx - x0) * dx + (gy - y0) * dy) / (dx * dx + dy * dy)))
            if (gx - (x0 + t * dx)) ** 2 + (gy - (y0 + t * dy)) ** 2 <= 0.72 ** 2: return True
        return False
    for y in range(size):
        px.append(0)
        for x in range(size):
            if glyph(x, y): px += b"\xff\xff\xff\xff"
            elif inside_round(x, y, int(size * 0.18)): px += bytes((27, 91, 209, 255))
            else: px += b"\x00\x00\x00\x00"
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(px), 9)) + chunk(b"IEND", b"")
for s in (192, 512): open(os.path.join(out, f"icon-{s}.png"), "wb").write(png(s))
open(os.path.join(out, "icon.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2.9" fill="#1B5BD1"/><path d="M3.6 4.6 7.4 8 3.6 11.4" fill="none" stroke="#fff" stroke-width="1.44" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="10.6" width="3.5" height="1.3" fill="#fff"/></svg>')
json.dump({"name": cfg["name"], "short_name": cfg["name"][:12], "description": cfg["description"], "start_url": "./index.html", "scope": "./", "display": "standalone", "background_color": "#F2F5F4", "theme_color": "#1B5BD1",
           "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]},
          open(os.path.join(out, "manifest.webmanifest"), "w"), indent=1)
open(os.path.join(out, "sw.js"), "w").write("""// Offline support. The app shell is cached on first visit; later visits load from the cache and refresh it in the background.
const VERSION = "%s", SHELL = "shell-" + VERSION, RUNTIME = "runtime-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const sameOrigin = url.origin === location.origin;
  const cdn = /(^|\\.)jsdelivr\\.net$|fonts\\.googleapis\\.com$|fonts\\.gstatic\\.com$/.test(url.hostname);      // Python runtime and fonts: keep for offline use
  if (!sameOrigin && !cdn) return;                                                                          // payments, ads and everything else go straight to the network
  e.respondWith(caches.match(req, { ignoreSearch: sameOrigin && req.mode === "navigate" }).then((hit) => {
    const fresh = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(sameOrigin && CORE.some((c) => url.pathname.endsWith(c.slice(1))) ? SHELL : RUNTIME).then((c) => c.put(req, copy)); } return res; });
    if (hit) { fresh.catch(() => {}); return hit; }
    return fresh.catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error());
  }));
});
""" % build_id)
urls = [""] + ["learn/"] + [l["url"] for l in lessons] + [p + ".html" for p in ("about", "privacy", "terms", "refund", "contact")]
open(os.path.join(out, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"<url><loc>{E(DOMAIN)}/{E(u)}</loc></url>\n" for u in urls) + "</urlset>\n")
open(os.path.join(out, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {DOMAIN}/sitemap.xml\n")
open(os.path.join(out, "_headers"), "w").write("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=86400\n")
if MODE in ("ads", "hybrid") and cfg.get("adsense_client"): open(os.path.join(out, "ads.txt"), "w").write(f'google.com, {cfg["adsense_client"].replace("ca-", "")}, DIRECT, f08c47fec0942fa0\n')

size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(out) for f in fs)
print(f"site built: mode={MODE}, {len(lessons)} lessons in {len(by_track)} tracks, {len(urls)} pages, app {os.path.getsize(os.path.join(out, 'index.html')) / 1e6:.1f} MB, total {size / 1e6:.1f} MB, build {build_id}")
for w in warn: print("  WARNING:", w)
