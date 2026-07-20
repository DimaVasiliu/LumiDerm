# Lumi Derm — Roadmap & to-do

Working list of what's left, in priority order. Tick items off as they ship.

---

## 🔴 Now — launch blocker

- [x] **Enable Cloudflare Access on `/admin`.** ✅ Done & verified — `/admin` redirects to the Cloudflare Access login; homepage, booking/services pages, and the signup/confirm/unsubscribe API stay public. Scoping is correct.
  - [ ] Confirm **Iulia's email** is in the Access Allow policy (so she isn't locked out).

---

## 🟠 Next — make the rest of the admin actually publish

- [x] **Make Prices publishable (like Offers).** ✅ Done & verified.
  The treatments page now carries `<!-- PRICES:START/END -->` markers and is generated from `assets/data/prices.json`. In **Admin → Prices**, Iulia picks a treatment and edits its price cells, instalment notes, highlight lines and the "from £X" headline (descriptions + table layout stay fixed). **Publish prices** rewrites both `prices.json` and the marked section of `services.html` via GitHub (same machinery as Offers/Reviews, with 409-retry). Because the HTML is written into the static page, Google still sees every price — SEO preserved.
  Verified in a Node harness: parser → renderer is byte-identical to the original page; a simulated edit (price, note, headline, ampersands) round-trips to valid HTML with markers, 16 cards, booking deep-links, modal and footnote all intact.

- [ ] **Make Pages text publishable (like Offers).**
  Blocker: hero headline, clinic details, etc. are hard-coded across pages. Needs the editable bits to read from a small `content.json`.
  Steps: pick the fields worth exposing (hero title/lead, phone, email, address, Instagram) → thread them into the pages via JS or build-time → add a **Publish page text** button → remove the "ask Dima" label.
  Est: medium; do the highest-value fields first (contact details, hero copy).

---

## 🟡 Then — smarter email campaigns

- [ ] **Auto-set the email button link from the ticked offer/treatment.**
  Today: in Send email, ticking an offer adds its card (with its own per-offer "Book →" deep link), but the **main campaign button** link is a single field typed by hand.
  Want: when Iulia ticks a specific offer/treatment, the main button link **auto-fills to that treatment's booking link**, so a recipient who clicks lands directly on it — e.g. an Endospheres email → `booking.html?service=endospheres`; an "Autumn skin reset" email → the microneedling booking link; and so on. Each offer already carries a `service` (which maps to the right booking deep link), so the data's already there.
  Behaviour: if exactly one offer is ticked → set the button link to that offer's treatment. If several are ticked → default to the general booking page (or the featured one), but let Iulia override. Show which link the button currently points to.
  Est: small–medium (front-end only, in `sender.js`).

---

## 🟢 Nice-to-have (from the admin audit)

- [ ] **Image alt-text field on offers** — one input per offer, threaded into `offers.json` and the email card. Helps SEO, accessibility and email deliverability.
- [ ] **Scheduled sends** — "send this campaign on <date>". Needs a Cloudflare Cron Trigger + a queued-campaign table (not doable purely in the browser).
- [ ] **Automatic birthday emails** — the birthday-month segment already works manually; automating it needs the same cron infrastructure as scheduled sends.
- [ ] **Reorder offers by drag** (arrow reordering already exists) — optional polish.

---

## ⚪ Housekeeping / when convenient

- [ ] **Add the ICO registration number** once it comes through — `pages/privacy.html`, replace the `data-ico-number` placeholder text.
- [ ] **Confirm real offer content & prices** with Iulia (some are still placeholder promos).
- [ ] **Verify the Treatwell booking widget deep-links** to a specific treatment (so `?service=…` actually pre-selects it on Treatwell's side).
- [ ] Decide whether saved campaign drafts should sync across devices (currently per-browser).

---

## ✅ Done (for reference)

- Offers gallery redesign (cards, spotlight, modal, search, show-all, mobile limit).
- Offers publish to GitHub from admin (with image upload, true delete, 409 retry).
- **Reviews** publish to GitHub from admin (approved-only, featured first).
- **Prices** publish to GitHub from admin — the treatments page is data-driven from `prices.json` and regenerated between markers on publish (SEO-safe, prices/notes/headline editable).
- Website signup pop-up + double opt-in + D1 subscribers + admin Subscribers tab (with search).
- Email campaigns: one-click subscriber audience, interest + birthday-month segments with live count, named saved drafts, per-recipient name personalisation (subject + body).
- Cloudflare Email Routing so replies to `info@` are received.
- Under-18 / patch-test / 24h cancellation policy across FAQ, chatbot, policies.
- In-admin **Guide & help** tab with jump links.
- Removed Sveltia CMS + the Marketing scratchpad tab; scrubbed stale copy; fixed the offers-live counter; CSS cleanup.

---

*Deploy rule (unchanged):* `git pull --rebase` first, then `git add -A && git commit && git push`. Never `npx wrangler deploy` — the admin commits to GitHub and Cloudflare rebuilds from there.
