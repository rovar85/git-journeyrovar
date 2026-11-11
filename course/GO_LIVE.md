# Going live: plan for the course website and app

This is the plan to turn the course into a public website and installable app that can earn money. It says what already exists, what was built for launch, what only you can do (accounts, money, legal), and the order to do it in.

## 1. Short answers to your questions

| Question | Answer |
|---|---|
| Can it be a live environment where students try steps? | It already is. The **Lab** button opens a Linux-like terminal in the browser, and green **Run in lab** buttons run a lesson's commands. Python runs in the browser too. It is a simulation, so Docker, Kubernetes and Terraform still need a real machine (see section 8 for ways to add that). |
| Website or app? | **Website first**, built as an installable app (a PWA): students can "Add to Home screen" on Android and iPhone and it works offline after the first visit. A Play Store listing can come later (section 9). |
| Ads or one-time ₹49? | Both are built and switchable with one setting. **Recommendation: one-time ₹49 with free previews**, no ads at launch (section 4). |
| 3D motion graphics? | Built as animated, 3D-style (isometric) interactive explainers: six so far. They are step-through diagrams with moving packets, not film-quality 3D animation (section 3). |
| What else is in demand? | See section 7: SQL practice, coding-interview practice, system design, security, AWS hands-on, and others, ranked. |

## 2. What exists today

- **358 lessons in 26 tracks**: Linux, networking, Git, Python, Docker, Jenkins, Ansible, Terraform, Kubernetes, monitoring, Windows, cloud, senior cloud, incident scenarios, DevOps question bank, databases and distributed systems, senior DevOps questions, data engineering, AI agents and several AI deep-dive tracks.
- **In-browser practice lab** with about 110 commands, practice files, challenges with automatic checking, and Python.
- **Quizzes, flashcards with spaced repetition, notes, study maps and round-up lessons.**
- Commands shown with "Real output" were actually run and recorded.

## 3. What was built for launch (in this repository now)

| Piece | Where | Status |
|---|---|---|
| Progress panel: XP, levels, day streak, daily goal, 13 badges, "continue where you left off" | `src/js/w_game.js` | Tested in a browser |
| Printable certificate of completion per track (student types their name; saved as PDF by the browser) | `src/js/w_game.js` | Built; states clearly it is not an accredited qualification |
| Six animated explainers: web request, `kubectl apply`, CI/CD to production, data pipeline, streaming with a consumer crash, RAG | `src/js/w_viz.js` | Tested on desktop and phone widths, light and dark |
| Quiz fix: 56 lessons had quizzes that showed as plain text; they are now interactive (207 quizzes, was 151) | `tools/mdconv.py` | Fixed |
| Website builder | `build_site.py`, `site.config.json` | Tested: app loads, works offline on reload, no script errors |
| 348 search-friendly lesson pages + index + sitemap + robots.txt | `site/learn/...` | Tested: pages render, links resolve, no sideways scroll on a phone |
| Installable app: manifest, icons, service worker for offline use | generated into `site/` | Service worker registers and serves the app offline |
| About, privacy, terms, refund and contact pages | generated from `site.config.json` | **Templates. Fill in your details and have them reviewed** |
| One-time payment unlock (free previews, locked lessons, pay, restore purchase, licence key) | `src/js/w_site.js` | Locking and licence checks tested in a browser, including a forged licence being rejected |
| Payment server (Razorpay orders, signature check, signed licences) | `server/worker.js` | 16 automated tests pass **against a simulated Razorpay**. Not yet run against the real Razorpay |
| Ad slots (Google AdSense) and "pay to remove ads" | `src/js/w_site.js` | Slots and removal tested; real ads need an approved AdSense account |
| Automatic publishing with GitHub Pages | `.github/workflows/deploy-site.yml` | Written, not run (it starts when merged to `main` and Pages is enabled) |

Build the site yourself at any time:

```
cd course
python3 build_site.py        # writes course/site/, prints warnings for anything not configured
node server/test.mjs         # payment server tests
```

## 4. How to charge: recommendation and the numbers

The setting `"mode"` in `site.config.json` chooses the model:

| Mode | What students get | When to use it |
|---|---|---|
| `free` | Everything open, no ads | Soft launch, collecting feedback |
| `paid` | First 3 lessons of every track free; one payment of ₹49 unlocks all | **Recommended** |
| `ads` | Everything open, ad slots at the end of each lesson | Only with large traffic |
| `hybrid` | Everything open with ads; ₹49 removes the ads | A middle path to test later |

Why paid with free previews:

- **You keep about ₹47.80 of each ₹49.** Razorpay's standard fee is about 2% plus GST on the fee, roughly ₹1.16 per sale. Check Razorpay's current pricing page before launch; fees change.
- **Ads pay little per visitor.** As an illustration only, with an assumed ₹50 earned per 1,000 page views, one ₹49 sale equals about 1,000 page views. Real rates for Indian technical audiences vary and I cannot verify a figure; treat this as a way to compare, not a forecast.
- **Ads need approval and traffic first.** AdSense reviews the site before showing anything, and ads interrupt study. They make sense once you have steady search traffic.
- **₹49 is an impulse price.** The free lessons and the 348 public lesson pages do the selling.

A simple target to judge by: 1,000 sales is about ₹47,800 before tax. At a 2% conversion of visitors who reach a locked lesson, that needs about 50,000 such visitors. The 2% is an assumption to plan with; measure your real rate in the first month.

**Honest limit of the payment lock:** lesson text is delivered to the browser and hidden until a valid licence is present. A technical person could read it without paying. At ₹49 that is an acceptable trade for a site with no server and no running cost. If the price rises later, move the locked lessons behind the payment server (section 10).

## 5. Rights and legal checks before any money is taken

I am not a lawyer; these are the issues I found in the material, for you to decide or get advice on.

1. **`lectures` track (Stanford CME 295 transcripts).** Built closely from lecture transcripts. It is **left out of the public site by default** (`exclude_tracks`). Publish it commercially only with permission.
2. **AI and Python tracks** draw on public talks (listed in the page footer). They teach the ideas in new words with new code, which is normal for teaching, but read them once with a commercial eye and keep the credits.
3. **DevOps question bank:** CC BY 4.0. Commercial use is allowed with attribution; the attribution and licence notice are in its first lesson. Keep them.
4. **AI question bank:** MIT licence; the notice is in its first lesson. Keep it.
5. **roadmap.sh:** its licence forbids reusing its content. Nothing was copied. I used only the names of topics to see what the course lacks. Linking to roadmap.sh is allowed.
6. **"Enterprise Vault"** appears in about 95 places as the running example. It is a real product name. Using a product as an example is common, but consider a neutral example for a public course, and avoid anything from your employer's internal systems.
7. **Privacy:** progress stays in the student's browser. Payments share an email and payment ID with you through Razorpay. The privacy page describes this; adjust it if you add analytics.
8. **Business and tax:** Razorpay needs KYC (PAN, bank account, and a website showing contact, terms, privacy and refund pages; these pages are generated). Income is taxable. Whether you need GST registration depends on your turnover; confirm with an accountant.
9. **Certificates** say they are not accredited. Keep that wording.

## 6. Go-live steps

**Phase A. Publish free (1 to 2 days).**

1. Choose a name and buy a domain. "Agent School" is the working name; check that the name and domain are free to use.
2. Edit `course/site.config.json`: `name`, `tagline`, `domain`, and the `owner` block (name, support email, postal address).
3. Run `python3 build_site.py` and fix every warning it prints.
4. Host the `course/site` folder. Two free options:
   - **Cloudflare Pages (recommended, because the payment server also runs on Cloudflare):** connect the GitHub repository, build command `python3 course/build_site.py`, output folder `course/site`, then add your domain.
   - **GitHub Pages:** merge this branch to `main`, then Settings → Pages → Source: GitHub Actions. The included workflow builds and publishes on every push.
5. Open the site on a phone. Check a lesson, the lab, a quiz, the progress panel, an animated explainer, and "Add to Home screen". Turn on aeroplane mode and reopen it.
6. Add the site to Google Search Console and submit `sitemap.xml`.
7. Add privacy-friendly analytics (for example Plausible, Umami or Cloudflare Web Analytics) so you know which lessons bring visitors.

**Phase B. Turn on payments (2 to 4 days, mostly waiting for KYC).**

8. Create a Razorpay account and complete KYC. Stay in **test mode** for now.
9. Create the licence keys: `cd course/server && node keygen.mjs`. Put the PUBLIC key in `site.config.json` as `license_public_jwk`. Keep the PRIVATE key secret; never commit it.
10. Deploy the payment server: install Cloudflare's `wrangler`, set `ALLOWED_ORIGIN` in `server/wrangler.toml` to your site address, run `wrangler deploy`, then `wrangler secret put` for `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys first) and `LICENSE_PRIVATE_JWK`.
11. In `site.config.json` set `"mode": "paid"` and `"api_base"` to the worker's address. Rebuild and publish.
12. **Test with Razorpay's test cards and test UPI:** pay, confirm the lessons unlock, clear the browser data, restore with the payment ID and email, try a wrong email (must be refused), and refund a payment in the dashboard then try to restore it (must be refused).
13. Switch the two Razorpay secrets to live keys. Make one real ₹49 payment yourself and refund it.

**Phase C. Grow (ongoing).**

14. Share individual lesson pages (they are complete, readable pages) on LinkedIn, Reddit, Telegram and WhatsApp groups for DevOps and data learners.
15. Watch three numbers weekly: visitors to lesson pages, share who open a locked lesson, share who pay.
16. Consider AdSense only when traffic is steady; then try `hybrid`.

**Costs:** a domain (roughly ₹800 to ₹1,500 a year depending on the name; check your registrar). Cloudflare Pages and Workers have free tiers that cover a new site. Razorpay charges per transaction. Nothing else is required.

## 7. What to add next, by demand

roadmap.sh publishes learning paths for about 90 roles and skills. Comparing its topic names with this course (names only, nothing copied), the course is strongest in DevOps, Kubernetes, Terraform, data engineering and AI engineering. The gaps that matter for paying learners in India, in the order I would build them:

| # | Track to add | Why | Interactive part |
|---|---|---|---|
| 1 | **SQL practice** (50 to 100 graded problems) | Asked in almost every data, backend and analyst interview; the data track teaches it but has few drills | A query box that runs SQL in the browser and checks the result |
| 2 | **Coding interview: data structures and algorithms in Python** | The largest demand among students and freshers | Run code against hidden test cases in the browser |
| 3 | **System design patterns** (caching, queues, API gateways, CQRS, event sourcing, rate limiting) | Senior interviews; extends the distributed-systems track | More animated explainers; capacity calculators |
| 4 | **DevSecOps and security basics** (OWASP risks, secrets, supply chain, cloud security) | Security is in every DevOps job description | Find-the-flaw exercises |
| 5 | **AWS hands-on** (IAM, VPC, EC2, S3, RDS, Lambda), aimed at the Solutions Architect exam | Certification is a strong buying reason | Architecture puzzles; a simulated `aws` command |
| 6 | **Backend APIs with FastAPI** (auth, REST design, testing, caching) | Completes the developer side | Run a small API in the lab |
| 7 | **Prompt engineering and building agents, practical** | Fast-growing interest | Needs a model API, so it costs money per use |
| 8 | **Data analyst path** (Excel, SQL, Power BI concepts, statistics) | Large beginner audience | Chart and query exercises |

Paths by role (for example "DevOps engineer in 12 weeks", "Data engineer in 16 weeks") would sell better than a list of tracks. They need no new lessons, only an ordered route through the existing ones with a progress bar and a certificate.

## 8. More interactivity and engagement

Already live: XP, streaks, daily goal, badges, certificates, flashcards, challenges, animated explainers.

Next, roughly in order of value for effort:

1. **More animated explainers** (each is a short job now that the engine exists): DNS resolution, TCP handshake, Git branching and merging, Docker image layers, Terraform plan and apply, a transformer's attention step, a rolling update with a failed health check.
2. **Role paths** with a visible map (see section 7).
3. **Daily challenge:** one lab task or SQL problem a day, feeding the streak.
4. **Real machines for Docker and Kubernetes:** link each such lesson to a free hosted scenario (Killercoda, iximiuz Labs, Play with Docker), or pay for an embedded sandbox provider. Running your own sandboxes costs money per student and needs abuse controls; not sensible at ₹49.
5. **Accounts and sync across devices:** needs a small backend and a login. Until then, progress lives in one browser; the licence can be restored on any device with the payment ID and email.
6. **Leaderboards and study groups:** need accounts first.
7. **An AI tutor** ("explain this error", "quiz me"): very engaging, but every question costs money, so it belongs in a higher-priced tier.
8. **Hindi and other Indian-language versions** of the beginner tracks.

## 9. Android and iPhone apps

- **Now:** the site installs from the browser ("Add to Home screen" / "Install the app") and works offline. No store needed.
- **Play Store later:** the site can be wrapped as a Trusted Web Activity (tools: Bubblewrap or PWABuilder). Google charges a one-time developer registration fee.
- **Important:** Google Play and Apple generally require their own in-app billing, with a service fee, for digital content sold inside an app. Read the current store policies before listing a paid version. The simplest path is to keep selling on the website and decide about store listings once there is traction.

## 10. Known limits and risks

| Risk | Effect | Mitigation |
|---|---|---|
| The app is one large page: about 11 MB, about 3 MB when compressed by the host | Slow first load on a weak phone connection; fast afterwards (cached) | Lesson pages under `/learn/` are small and load fast. Later: load each track on demand |
| The payment lock can be bypassed by a technical user | Some unpaid use | Acceptable at ₹49. Later: serve locked lessons from the payment server after checking the licence |
| Payment flow not yet run against real Razorpay | Possible surprises on first test | Phase B step 12 is a full test in Razorpay test mode before going live |
| Progress is stored per browser | A student who clears data loses progress (not the purchase) | Accounts and sync, later |
| Python in the browser lab could not be tested from the build machine | A lesson may behave differently in the browser | Try the data-engineering lessons in the lab on the live site; report any that fail |
| Legal pages are templates | May not fit your situation | Have them reviewed; fill every placeholder |
| Tools change quickly | Lessons go stale | Each lesson already tells students to check official docs; plan a review every 6 months |

## 11. Launch checklist

- [ ] Name and domain chosen; `site.config.json` filled in; build prints no warnings
- [ ] Rights review done (section 5); `lectures` stays excluded unless permission is obtained
- [ ] Site published; tested on an Android phone and an iPhone; installs; works offline
- [ ] Search Console set up; sitemap submitted
- [ ] Legal pages reviewed
- [ ] Razorpay KYC complete; test-mode purchase, restore and refund all behave correctly
- [ ] Live keys set; one real payment made and refunded
- [ ] Analytics in place; weekly numbers written down from day one
