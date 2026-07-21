# Lumi Derm — Roadmap & to-do

Working list of what's left, in priority order. Tick items off as they ship.

---

## 🔴 Now — launch blocker

- [x] **Enable Cloudflare Access on `/admin`.** ✅ Done & verified — `/admin` redirects to the Cloudflare Access login; homepage, booking/services pages, and the signup/confirm/unsubscribe API stay public. Scoping is correct.
  - [x] **Confirmed Access also protects `/admin/api/*`** (not just the UI). Unauthenticated `/admin/api/health` returns nothing (Access login redirect) instead of the Worker's 401 JSON — proving Access intercepts before the Worker runs. Two layers: Access at the edge + the Worker's `authorised()` header check as backup. Public `/api/health` still returns JSON (correctly not gated).
  - [x] **Confirmed:** Lumiderm Policy → Include → Emails (Action: Allow) contains `dima.vasiliu@yahoo.com` and `info@lumidermaesthetics.co.uk` (the clinic inbox = Iulia's login). Iulia signs in via a one-time code emailed to that inbox. Session duration 30 min; MFA off (email-OTP is the factor).
  - [x] **Confirmed in the dashboard:** Access app destination is `lumidermaesthetics.com/admin/*` (Lumiderm Policy, Self-hosted). The `/admin/*` wildcard covers the UI, `/admin/api/*`, and even bare `/admin` — all verified intercepted by Access in live tests.
- [x] **Restrict the admin API to specific emails (`ADMIN_EMAILS`).** ✅ Set to `dima.vasiliu@yahoo.com,info@lumidermaesthetics.co.uk` in `wrangler.jsonc`. The Worker now serves the admin API only to those two emails (was: any Access user). Verified the allow-check logic (case-insensitive; strangers + no-header denied).
- [x] **Admin robustness & UX pass.** ✅ Done. (1) Every admin API failure now shows a **friendly message** — the raw "HTML instead of JSON" (usually an expired Access session) becomes "your sign-in may have expired, refresh to sign in again", via a shared `ldFriendlyError` used across admin.js/sender.js/subscribers.js. (2) New **System status** card in Settings showing signed-in user, D1 / Resend / suppression-KV / GitHub-publishing connection, sending address, **last deploy version** (`version_metadata` binding) and **last successful send** (from `campaign_sends`). (3) **Confirmation modals** (styled `ldConfirm`, not native `confirm`) for the five high-risk actions: publish prices, send campaign, schedule campaign, delete subscriber, reset admin drafts. Verified: error mapping, worker + all admin JS syntax, CSS balance. No new migration needed.
- [x] **Marketing consent & unsubscribe — end-to-end verification.** ✅ Verified compliant with ICO consent (active/specific/informed/separate/recorded) + PECR opt-out/suppression. Full write-up in `CONSENT-COMPLIANCE.md`. Fixed three gaps: recorded `consent_wording` now matches the visible checkbox label word-for-word; a completed double opt-in now **clears any prior unsubscribe suppression** (so genuine re-opt-ins receive email again); corrected the Instagram link in the campaign email footer. One 5-minute **live opt-in→unsubscribe→suppression test to run after deploy** (steps in the doc).
- [x] **Audit logging for admin actions.** ✅ Done. A D1 `admin_audit_log` table records who/what/when, written server-side by the Worker (can't be tampered with from the browser). Covers: publish offers/reviews/prices/pages, image upload/delete, send/test/schedule/cancel campaigns, delete subscriber, **CSV export**, change/preview birthday automation, subscriber **opt-in** confirmations, and **auth/access failures** (central admin gate logs `auth.denied`). Viewable read-only in **Admin → Settings → Activity log**. Follows the OWASP logging cheat-sheet categories. **Needs migration 0005 applied** (see deploy note). Verified insert/list + capture of sends, publishes, exports and denied access against SQLite.
- [x] **Move GitHub publishing server-side (token as a Cloudflare secret).** ✅ Done. The browser no longer stores a GitHub token/repo/branch — all publishing goes through a Worker proxy (`/admin/api/github`) that injects the `GITHUB_TOKEN` secret, owns the repo/branch, and only allows writes to an allowlist of site files (verified: denies the worker, wrangler.jsonc, workflows, path-traversal, admin/). Old browser tokens are auto-purged from `localStorage`; `api.github.com` removed from the site CSP. **Dima action: set the secret — see `GITHUB-PUBLISHING-SETUP.md`** (`npx wrangler secret put GITHUB_TOKEN`), then deploy.

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
- [x] **Scheduled sends** ✅ Done & verified. In Send email, tick "Schedule for later", pick a date + time; the campaign is queued in D1 and sent by the hourly Cloudflare cron. "Upcoming & recent scheduled sends" lists them with a Cancel button. (Needs migration 0004 applied + the worker redeployed — see deploy notes.)
- [x] **Automatic birthday emails** ✅ Done & verified. A birthday-automation card (on/off switch, editable subject + HTML body, send-hour, "send me a preview") saved to D1. The hourly cron, at the chosen hour, emails each confirmed + consented subscriber whose birthday is today — once per year (tracked by `birthday_sent_year`), honouring the suppression list. Cron SQL verified with an in-memory SQLite harness (due-selection, claim idempotency, birthday matching, year-guard, settings upsert).
- [x] **Reorder offers by drag** ✅ Done. Offer rows are draggable (with a grip handle); drop to reorder and it saves. The ↑/↓ arrow buttons remain as a keyboard-friendly fallback. Reorder logic verified in all directions.

---

## ⚪ Housekeeping / when convenient

- [ ] **Add the ICO registration number** once it comes through — `pages/privacy.html`, replace the `data-ico-number` placeholder text.
- [ ] **Confirm real offer content & prices** with Iulia (some are still placeholder promos).
- [x] **Verify the Treatwell booking widget deep-links to a specific treatment.** ✅ Verified — it does **not**, and there's no supported way to make it. Treatwell's embeddable widget only accepts the venue's full-menu URL (`/place/523733/menu/`); their docs describe no per-treatment parameter, the embed script reads only `data-widget-url`, the widget is a client-rendered app, and the public venue page's services are JS buttons with no unique deep-link URLs. So `?service=…` pre-selects the treatment on **our** page (detail panel + prep/aftercare) but can't carry into Treatwell. Mitigation shipped: the booking page now **names the chosen treatment** in the calendar instruction ("In the Treatwell calendar, choose *Endospheres therapy*…") so the manual re-select is effortless. If Treatwell ever exposes a deep-link param, wiring our `service` slugs to it would be a small change.
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

### One-time deploy for scheduling + birthday emails (this release)

1. **Apply the new database tables** (once), from `~/Desktop/LumiDerm`:
   ```
   npx wrangler d1 migrations apply lumidermdb --remote
   ```
   (Adds `scheduled_campaigns`, `app_settings`, `birthday_sent_year`, and — from migration 0005 — the `admin_audit_log` table. Running the command again applies any not-yet-applied migrations.)
2. **Push as usual** — the `git push` deploys the worker and, from `wrangler.jsonc`, registers the **hourly cron** (`"crons": ["0 * * * *"]`). No `wrangler deploy` needed; Cloudflare's Git build applies it.
3. **Check** in the Cloudflare dashboard: Workers → `lumiderm` → Triggers shows the cron. Then in the admin, open **Send email → Automatic birthday emails**, write the message, click **Send me a preview**, and only flip it **On** once you're happy.

Nothing sends automatically until (a) the migration is applied, (b) the cron is live, and (c) birthday automation is switched On / a campaign is scheduled.
