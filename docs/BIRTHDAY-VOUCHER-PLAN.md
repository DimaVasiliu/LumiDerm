# Birthday 15% Voucher — Plan & Pre-flight Audit

_Planning document. Nothing is built yet — this is for approval first._

## The approach (your ideas + mine, combined)

A **dedicated birthday redemption flow** — we do **not** try to block Treatwell across the
site (brittle and confusing). Instead the birthday email leads to its own page that never
offers Treatwell at all. The offer is a **venue-only voucher + appointment request**, not an
online booking.

## How it works, step by step

1. **Send.** When the birthday cron runs (or Iulia sends manually), for each recipient the
   Worker **mints one voucher** — a unique code (e.g. `BDAY-8K4P`) and an unguessable link
   token — saves it to the database (30-day expiry), and injects both into that person's email.
2. **Email.** The birthday email shows the greeting + the offer, very explicitly worded:
   _"Enjoy 15% off one treatment as your birthday treat. Valid 30 days. Redeemed and paid for
   at Lumi Derm only — it cannot be applied to Treatwell bookings."_ The only button is
   **"Request birthday appointment"**, linking to the birthday page — **no Treatwell link
   anywhere in the email**, including the footer.
3. **Landing page** `/birthday-treat?token=…` (on your own site). It reads the token, validates
   the voucher, and shows: **"15% birthday treat"**, the **code**, the **valid-until date**,
   **"Pay at the venue only"**, **"Not valid for Treatwell bookings"**, and a simple
   **appointment request form** (preferred treatment, preferred dates/times, phone, message).
   The page has **no Treatwell widget and no Treatwell button** — nothing to "swap out."
4. **Request.** The client submits the form. It emails Iulia (like the FAQ "ask" form we just
   built) with their code, preferred treatment and times, and contact details.
5. **Confirm.** Iulia replies to arrange the time manually. No booking system needed — a
   birthday redemption is a "contact us + pay at venue" flow by nature.
6. **Redeem.** At the appointment the client shows the code and pays in-studio (15% off).
7. **Mark used.** In the admin, a **Birthday vouchers** list shows issued / requested /
   redeemed / expired, with a **"Redeem"** button so a code can't be used twice.

## Voucher data model (new table `birthday_vouchers`)

`id`, `code` (unique, human-friendly), `token` (unguessable, for the link), `email`,
`subscriber_id`, `issued_at`, `expires_at` (issued + 30 days), `status`
(`active` / `requested` / `redeemed` / `expired` / `cancelled`), `redeemed_at`, `redeemed_by`,
plus the request details (`req_treatment`, `req_times`, `req_phone`, `req_message`, `requested_at`).

Status is computed on read too: past `expires_at` and not redeemed ⇒ shown as expired.

## Pre-flight audit — what I checked

- **Database is fully migrated.** All 12 migrations are applied on the live D1
  (`lumidermdb`). Safe to add one more. ✅
- **Birthday plumbing works.** `birth_day`, `birth_month`, `pref_birthday`, `birthday_sent_year`
  all exist; the signup form collects birthday (optional). ✅
- **Reach is small right now:** 20 subscribers, 19 confirmed, all opted in to birthday emails —
  but only **4 have a birthday on file**. So today the offer would reach ~4 people. Worth a
  small push to capture more birthdays (see recommendations).
- **Cosmetic:** two migrations share the number `0006` (both applied fine). The new one will be
  `0012` to avoid another clash.

## What needs updating/fixing as part of this build

1. **New migration `0012_birthday_vouchers.sql`** — you apply it once with
   `npx wrangler d1 migrations apply lumidermdb --remote`. (I can also create the table directly
   via my Cloudflare access, but the migration-file route keeps the repo and DB in sync — recommended.)
2. **Birthday email template** — change the CTA from `booking.html` (→ Treatwell) to the birthday
   link, and update the wording. If Iulia has a **custom** birthday template saved in settings,
   it also needs the new CTA, so the editor will get a "Birthday link" button/token.
3. **Voucher minting hook** in all three send paths: the cron, the manual "send" button, and the
   test/preview send (test should mint a throwaway/sample code, not a real one).
4. **New public page + endpoints:** `/birthday-treat`, `GET /api/birthday/voucher` (validate),
   `POST /api/birthday/request` (appointment request, honeypot + rate-limited like the ask form).
   These must stay **public** — see Cloudflare note below.
5. **Housekeeping for the new page:** add it to the site checks + sitemap, and mark it
   **noindex** (it's a personal voucher page, shouldn't appear in Google).
6. **Admin:** a "Birthday vouchers" list + owner-only **Redeem** / cancel actions.

## What I need from you

- **Cloudflare Access:** confirm the Access application path is **`/admin` only** (Zero Trust →
  Access → Applications). If it covers the whole domain, `/birthday-treat` and `/api/birthday/*`
  would be locked behind login and clients couldn't open them. I can read D1 from here but can't
  safely edit Access policies — you'd change/confirm that in the dashboard. Tell me if you want
  step-by-step.
- **Run the migration** after I add it (one command above).
- **A few policy decisions** (below).

## Decisions to confirm (copy + policy)

- **15% applies to:** any single treatment, or exclusions (e.g. not on packages/laser courses)?
- **If they book Treatwell at full price anyway:** still honour the code in-studio if shown, or not?
- **Window:** 30 days from send (recommended, simplest) or "birthday month"?
- **Reserve channel on the page:** appointment-request form only, or also a WhatsApp button
  pre-filled with the code + a call link? (I'd suggest all three.)
- **Redeem marking:** staff tick it off in the admin, or trust-on-sight?

## Recommendations (optional, to make it worthwhile)

- Because only 4 subscribers have a birthday on file, consider a one-off **"add your birthday,
  get a treat"** email to existing subscribers, and making the birthday field a bit more inviting
  in the signup popup. Small change, much bigger reach for this feature.
