# Lumi Derm Architecture

**Baseline date:** 28 June 2026

**Production domain:** <https://lumidermaesthetics.com>

**Worker:** `lumiderm`

## Current production architecture

```text
Browser
  |
  +-- lumidermaesthetics.com
  |     Cloudflare Worker Static Assets
  |       `wrangler.jsonc` -> `lumi-derm-website/`
  |
  +-- Square Appointments iframe and new-tab link
  |     appointments and payments remain in Square
  |
  +-- Google Maps iframe
  |
  +-- /admin/
        static HTML/CSS/JS
        client-side passcode + localStorage drafts only
```

The current Worker has no application entry point. It serves files directly from
`lumi-derm-website/`; there is no API, database, server-side session, server-side Access token
verification, content publishing path, webhook receiver, or media store. Public content is
duplicated across HTML and browser JavaScript. The Square booking URL is embedded directly in
`pages/booking.html`. The home page loads Google Maps directly. These facts describe the baseline
and are not an approval of the current privacy or security posture.

The Git repository is `DimaVasiliu/LumiDerm`, branch `main`. The audit reports that the Cloudflare
Git integration is disconnected, so a push must not be assumed to deploy. Manual Wrangler deployment
is the only documented working deployment path at this baseline.

## Target architecture

```text
Browser
  |
  +-- Public HTML/CSS/JS
  |     Cloudflare Worker -> static asset fallback
  |                       -> server-rendered published D1 content
  |                       -> /api/public/*
  |
  +-- /admin/*
  |     Cloudflare Access -> admin UI -> /api/admin/*
  |                                      JWT + CSRF + validation
  |
  +-- consent-aware provider loading
        Square booking | Google Maps

Cloudflare Worker
  +-- D1: published/draft content, versions, audit, consent, sync state
  +-- R2: approved media only
  +-- Square: booking/payment system of record; read-only reconciliation
  +-- Google Business Profile: owned review synchronisation
  +-- Brevo: consented marketing, if approved by the owner
```

## Boundaries and ownership

| Capability                                  | System of record                            | Website responsibility                                                 |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Appointments, payments, booked customers    | Square                                      | Consent-aware entry point and later read-only reconciliation           |
| Public treatments, prices, offers, settings | D1 after Phase 3                            | Render crawlable HTML with a static fallback                           |
| Admin identity                              | Cloudflare Access                           | Verify Access JWT server-side; apply roles and CSRF controls           |
| Approved website media                      | R2 after Phase 6                            | Validate, record consent/alt text, and control publication             |
| Google reviews                              | Google Business Profile                     | Preserve source text; store moderation separately                      |
| Marketing contacts/campaigns                | Brevo by default, or Square Marketing UI    | Store explicit consent evidence only; never infer consent from booking |
| Clinical and consultation records           | Approved clinical system, not this platform | Do not collect or store in D1, R2, Git, logs, or localStorage          |

## Public rendering and failure behaviour

Published SEO content must be present in the initial HTML. The target Worker will read D1 and use
`HTMLRewriter` to populate marked regions. A checked-in static fallback remains available if D1
fails. Provider failures must leave telephone, email, directions, and Square new-tab links usable.
Production admin authentication fails closed if Access configuration or verification is unavailable.

## Data flows

### Public content

```text
Owner -> Access -> Admin API -> validate/version/audit -> D1
Visitor -> Worker -> published D1 rows -> HTML response
                         failure -> static checked-in fallback
```

### Booking

```text
Visitor -> consent or explicit load action -> Square-hosted booking
Square -> appointment/payment records stay in Square
Website -> never receives or stores card data
```

### Media

```text
Owner -> Access -> validated upload -> private R2 object
                              +-----> D1 metadata/consent/status
Visitor -> controlled public route -> approved object only
```

## Deliberately excluded

- a custom booking or payment engine;
- payment card or complete clinical/medical record storage;
- multi-tenant SaaS features;
- invented business, clinical, legal, review, or qualification data;
- public reliance on client-side-only content for indexable material.
