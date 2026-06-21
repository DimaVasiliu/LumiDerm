# Lumi Derm Aesthetics — Website Status & Roadmap

Living audit of the project: what exists, the architecture, what's next, and the
legal/GDPR steps. Last updated during the Square + Cloudflare go-live build.

---

## 1. Snapshot

- **Type:** Static site — semantic HTML5, modern CSS, vanilla JS. No build step.
- **Live at:** https://lumidermaesthetics.com (apex + www).
- **Repo:** GitHub `DimaVasiliu/LumiDerm` → auto-deploys to Cloudflare on push to `main`.
- **Payments:** **Square** (NOT Stripe). **Booking:** **Square Appointments** (we run our
  own booking; **Treatwell is no longer used for booking** — only legacy reviews are shown).

## 2. Infrastructure (current)

| Layer | Service | Notes |
|------|---------|-------|
| Hosting/CDN | Cloudflare (Worker static assets) | `wrangler.jsonc` serves `./lumi-derm-website` at the domain root. Free plan. |
| Domain | lumidermaesthetics.com | Bought at registrar, nameservers on Cloudflare. Apex + `www` attached to the Worker. |
| Booking + payment | Square Appointments | Embedded iframe on `pages/booking.html`, set to **full payment online**. |
| Email (inbox) | info@lumidermaesthetics.**co.uk** | Namecheap forwarding. Note: email is `.co.uk`, website is `.com` (intentional). |
| Reviews | Treatwell (display only) | Static cards on the homepage. |

## 3. Done so far

- Premium responsive homepage: hero (full-bleed image + animated "skin cell" motif),
  **offers carousel** (image-led cards), **prices** (filterable cards → full price **modals**,
  pure-CSS), **reviews** (real Treatwell quotes, 5-up + show-more), FAQ accordion,
  **contact + embedded Google map**, footer with social icons.
- **Services page** rebuilt as a clean **treatment library accordion** (12 treatments, 4 groups,
  expand for details + price + book). Old `treatment.html` now redirects here.
- **Unified navigation** across all 11 pages (Treatments · Prices · Offers · About · Contact · Book Now).
- **Square Appointments booking** wired into `booking.html` (iframe + new-tab fallback,
  "how it works", secure-payment note). Every "Book" CTA points here.
- **Migrated to `.com`** — all canonical/OG/schema/sitemap URLs; emails kept on `.co.uk`.
- **Cloudflare deploy config** (`wrangler.jsonc`), `.gitignore`.
- Legal page shells exist: `privacy.html`, `terms.html`, `cookies.html`, `policies.html`
  (⚠ still placeholder copy — see §6).

## 4. Architecture decisions (important)

- **Customer data + email/SMS marketing → use Square, don't build it.** Square **Customer
  Directory** (free CRM) auto-collects clients who book, and **Square Marketing** sends
  one-off + automated email/text campaigns (offers, birthdays, win-back). This covers
  "email updates for each customer + offers" with **no custom database or mail server**.
- **Does the website need its own database? Not yet.** Customers live in Square; site content
  (offers/treatments) can live in **versioned JSON files** edited via a CMS (below). Add
  **Cloudflare D1** (SQLite at the edge) only if a future feature genuinely needs it
  (e.g. a members area, storing form data outside Square).
- **Admin page to manage offers/treatments → Git-based CMS (Sveltia CMS).** A friendly
  `/admin` login where Iulia edits offers/treatments in a form; it commits to GitHub and
  Cloudflare rebuilds (~1 min). Requires moving offers/treatments into `assets/data/*.json`
  and rendering them on the page (same pattern already used for `reviews.json`), plus a tiny
  Cloudflare Worker for GitHub OAuth. No server to maintain, free.

## 5. Roadmap (phased)

**Phase 1 — Go-live & legal (do first)**
- Push latest changes; confirm live.
- Test a real Square booking end-to-end; confirm **full payment** is taken.
- Real **Privacy Policy, Terms, Cookie Policy** + **cookie consent banner**.
- **Cloudflare Web Analytics** (privacy-friendly, no cookie banner needed).
- `www → root` (or root → www) redirect so there's one canonical address.

**Phase 2 — Email & marketing (Square, low build)**
- Turn on Square Marketing; import/confirm Customer Directory.
- Add a **newsletter signup** on the site (GDPR opt-in) feeding Square (or Mailchimp).
- First "offers" campaign template.

**Phase 3 — Self-serve admin / CMS**
- Move offers + treatments to `assets/data/offers.json` / `treatments.json` with HTML fallback.
- Add **Sveltia CMS** at `/admin` + GitHub OAuth Worker.
- Iulia can publish new offers/treatments herself.

**Phase 4 — Content & growth**
- **Before/after gallery** (with written client consent) — high impact for aesthetics.
- Replace AI placeholder images with **real photography** of Iulia/clinic/results.
- **Gift cards** + **Loyalty** (both built into Square).
- Google Business Profile + Google reviews; local SEO.
- Optional: intake/consultation **consent forms** (Square Appointments intake or a form).

## 6. GDPR & legal checklist (UK)

> Not legal advice — Iulia should confirm with a professional. Health/"special category"
> data (treatment records) needs extra care.

- [ ] **ICO data protection fee** — run the ICO self-assessment. Many small salons are exempt,
      but processing of health data / any CCTV usually means registering (~£52/yr).
- [ ] **Privacy Policy** — real content: what data, why, legal basis, **Square as processor**,
      retention, and client rights (access/erasure). Replace the placeholder.
- [ ] **Cookie consent** — a banner if any analytics/marketing cookies are set (the Square
      booking iframe sets some). Using **Cloudflare Web Analytics** avoids cookies and reduces this burden.
- [ ] **Marketing consent (UK GDPR + PECR)** — explicit opt-in for email/SMS, clear unsubscribe
      (Square Marketing handles unsubscribe links).
- [ ] **Terms + booking/cancellation/deposit policy** — real content (links to the Square rules).
- [ ] **Consultation & treatment consent forms** — for medical/aesthetic procedures.
- [ ] **Business basics** — treatment insurance, practitioner qualifications, **18+** age rules,
      and check whether any treatments need **local authority / CQC** registration.

## 7. What similar clinics have that we don't (yet)

From reviewing modern dermatology/aesthetic clinic sites: **before/after galleries**,
**real photography**, online **deposits/prepay** (we have this via Square), **gift cards**,
**loyalty**, **automated email/SMS** (birthday/win-back), digital **consultation/intake forms**,
and fast privacy-first analytics. Most of these are achievable through **Square + the CMS**
without new infrastructure.

## Run locally

```bash
cd lumi-derm-website
python3 -m http.server 8080   # then visit http://localhost:8080
```

## Sources

- Square Appointments — booking & deposits: https://squareup.com/us/en/appointments , https://squareup.com/help/us/en/article/8096-deposits-on-square-appointments
- Square Marketing & Customer Directory: https://squareup.com/us/en/marketing , https://squareup.com/help/us/en/article/8412-create-marketing-campaigns
- ICO data protection fee: https://ico.org.uk/for-organisations/data-protection-fee/ , https://www.gov.uk/data-protection-register-notify-ico-personal-data
- Sveltia CMS (git-based admin): https://github.com/sveltia/sveltia-cms
- Cloudflare D1 (edge database): https://blog.cloudflare.com/making-static-sites-dynamic-with-cloudflare-d1/
