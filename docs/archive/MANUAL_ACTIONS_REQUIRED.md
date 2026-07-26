# Manual Actions Required

External owner/developer work is recorded here. Never place passwords, tokens, client exports,
payment details, Access cookies or recovery codes in this repository or chat.

## CF-ACCESS-001 Protect `/admin/*`

- **Status:** REPORTED COMPLETE; REVERIFY AFTER DEPLOYMENT
- **Owner:** Developer
- **Action:** Keep the Cloudflare Access application limited to the two approved full email
  addresses. Test `/admin/` and `/admin/index.html` in a private browser with one allowed and one
  denied account.
- **Return:** pass/deny result, non-secret application ID and audience value.

## CF-GIT-001 Verify automatic Workers builds

- **Status:** REPORTED CONNECTED; VERIFY NEXT APPROVED PUSH
- **Owner:** Developer
- **Action:** Confirm repository `DimaVasiliu/LumiDerm`, production branch `main`, root `/`, no
  build command and deploy command `npx wrangler deploy`. After an approved push, verify that the
  deployed commit SHA matches GitHub.

## TREATWELL-WIDGET-001 Verify official widget

- **Status:** OFFICIAL CODE SUPPLIED; INTEGRATED LOCALLY; PRODUCTION VERIFICATION REQUIRED
- **Owner:** Iulia/developer
- **Service:** Treatwell Connect
- **Steps:**
  1. In Treatwell Connect, use **Online booking -> Booking Widget -> Show me how it looks** and
     confirm the preview shows Lumi Derm venue `523733` and the intended menu.
  2. After an approved deployment, open the website booking page with external content disabled and
     confirm no Treatwell widget request occurs before consent.
  3. Select **Load booking** and verify menu, availability, mobile layout and checkout hand-off.
  4. Confirm the external venue-page fallback still works when the widget is blocked.
  5. Ask Treatwell Partner Support whether service-specific links and an official review feed/widget
     are enabled for this account.
- **Return:** non-secret pass/fail results and any official service/review integration instructions.
  Do not send login credentials or client data.

## TREATWELL-CATALOG-001 Reconcile the live treatment menu

- **Status:** REQUIRED BEFORE FINAL ACCEPTANCE
- **Owner:** Iulia
- **Steps:** Compare every website treatment with the live Treatwell menu. Confirm public name,
  category, price, duration, practitioner, online availability, package terms and any venue-only
  instalment wording. Record mismatches in a non-secret table and identify the approved value.
- **Verification:** Codex compares the approved table with public website content. No scraping or
  undocumented API access is permitted.

## TREATWELL-FLOW-001 Verify booking and payment behaviour

- **Status:** REQUIRED BEFORE FINAL ACCEPTANCE
- **Owner:** Iulia
- **Steps:**
  1. Record the current cancellation/no-show, deposit/prepayment and rescheduling rules in
     Treatwell Connect.
  2. Complete one owner-authorised low-value mobile booking and one desktop booking.
  3. Verify treatment, practitioner, location, duration, amount/payment option, confirmation,
     reminder, reschedule and cancellation behaviour.
  4. Confirm how package instalments are recorded when payment occurs at the venue.
- **Return:** non-secret pass/fail results and approved public wording. Do not provide card or client
  information.

## TREATWELL-MARKETING-001 Confirm communication features

- **Status:** REQUIRED BEFORE CAMPAIGN SENDING
- **Owner:** Iulia
- **Action:** Ask Treatwell Partner Support which bulk email, SMS, rebooking and review-request
  features are enabled, how consent/unsubscribe is managed, and whether client segments can be used
  without exporting data. Until confirmed, the custom admin creates copy drafts only.

## GOOGLE-GBP-001 Complete Google review access

- **Status:** THREE SUPPORT CASES OPEN; WAITING FOR REVIEW
- **Owner:** Iulia/developer
- **Action:** Keep one primary Google case, request closure of duplicate cases, monitor the owner
  email and do not submit more applications. Approval is confirmed by Google's response and the
  applicable Business Profile API quota. OAuth credentials are configured only after approval.

## CF-HEADERS-001 Verify production headers

- **Status:** REQUIRED AFTER APPROVED DEPLOYMENT
- **Owner:** Developer
- **Action:** Verify CSP, HSTS, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, cache
  rules, branded 404 behaviour and private/no-store admin responses. Confirm Google Maps loads only
  after the external-media choice and that the Treatwell widget loads only after consent or the
  one-time load action.

## LEGAL-REVIEW-001 Review public policies

- **Status:** REQUIRED BEFORE FINAL ACCEPTANCE
- **Owner:** Iulia/legal adviser
- **Action:** Review privacy, cookies, booking/cancellation, treatment consent, marketing consent,
  record retention and provider roles against the actual Treatwell and clinic configuration.
