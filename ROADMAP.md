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

- [x] **Make Pages text publishable (like Offers).** ✅ Done & verified.
  Homepage hero copy (eyebrow, headline, supporting line) is rendered from `content.json` between `<!-- HERO:START/END -->` markers in `index.html`. Contact details (phone, email, address, Instagram, Facebook) live in `content.json` too; **Publish page text** rewrites the hero markers and does an exact-string replace of the contact values across every site page, committing only the files that changed (409-retry). Publishing is a no-op when nothing changed.
  Verified in a Node harness: hero render is byte-identical to the live block; a simulated edit (phone, email, IG handle, hero title) updated `index.html`, `policies.html` and `privacy.html` correctly, left the "Lumi Derm Aesthetics" brand text and unedited fields untouched, and removed every trace of the old values — no collisions.

---

## 🟡 Then — smarter email campaigns

- [x] **Auto-set the email button link from the ticked offer/treatment.** ✅ Done & verified.
  In Send email, ticking exactly one offer auto-sets the main button link to that treatment's booking deep-link (e.g. Endospheres → `booking.html?service=endospheres`); zero or several ticked → the general booking page. A hint under the link field shows where the button points. Iulia can still type her own link to override, and a "Use the selected offer's link" reset switches back to auto. Auto-links pass the sender's approved-URL health check. Verified against the live offers.json (each `service` maps to the right deep-link).

---

## 🟢 Nice-to-have (from the admin audit)

- [x] **Image alt-text field on offers** ✅ Done. An "Image description" field in the offer editor is saved to `offers.json` (`alt`) and used on the homepage offer cards, the offer modal, and the email offer card — falling back to the offer title when left blank, so no image is ever alt-less. Helps SEO, accessibility and email deliverability.
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
- **Pages** publish to GitHub from admin — homepage hero copy (markers) + contact details (site-wide exact-string replace) editable from `content.json`, SEO-safe.
- Website signup pop-up + double opt-in + D1 subscribers + admin Subscribers tab (with search).
- Email campaigns: one-click subscriber audience, interest + birthday-month segments with live count, named saved drafts, per-recipient name personalisation (subject + body).
- Cloudflare Email Routing so replies to `info@` are received.
- Under-18 / patch-test / 24h cancellation policy across FAQ, chatbot, policies.
- In-admin **Guide & help** tab with jump links.
- Removed Sveltia CMS + the Marketing scratchpad tab; scrubbed stale copy; fixed the offers-live counter; CSS cleanup.

---

*Deploy rule (unchanged):* `git pull --rebase` first, then `git add -A && git commit && git push`. Never `npx wrangler deploy` — the admin commits to GitHub and Cloudflare rebuilds from there.
