# Lumi Derm Admin — Website Control Room

The private workspace at `/admin/` manages website drafts only. Treatwell Connect is the system of
record for appointments, availability, payments, reminders, client history and booking-related
communications. The admin must be protected by Cloudflare Access before it is used with production
data.

## Current behaviour

- Offers, website prices, campaign copy, selected reviews and page settings save to this browser's
  `localStorage` as drafts.
- Media is a read-only view of checked-in website assets.
- The Treatwell panel links to Treatwell Connect, the public venue page and partner help.
- Campaign copy can be drafted and copied, but this admin does not send messages or store Treatwell
  client lists.
- The built-in passcode is only a shared-screen convenience; Cloudflare Access provides real access
  control.

## Panels

| Panel | Purpose | Production destination |
| --- | --- | --- |
| Overview | Website draft counts, pending reviews and quick actions | Protected admin API metrics |
| Offers | Create, reorder and preview homepage offers | D1 published content |
| Prices | Maintain the approved website price display | D1, manually reconciled with Treatwell |
| Marketing | Draft copy and preview messages | Send only through an owner-approved Treatwell/email workflow |
| Reviews | Moderate selected website reviews and prepare Google sync | Google review Worker plus approved legacy imports |
| Media | Browse website images | Validated R2 uploads |
| Pages | Edit key public copy and settings | D1 published content |
| Treatwell | Open operational booking and partner tools | Treatwell Connect |
| Settings | Backups and integration status | Cloudflare Access and protected Worker APIs |

## Next implementation steps

1. Keep `/admin/*` protected with an exact-email Cloudflare Access policy.
2. Add a protected Worker admin API and D1 content tables.
3. Replace browser-only saves with validated, versioned D1 publishing.
4. Add approved R2 media uploads.
5. Add Google Business Profile review sync after Google grants access.
6. Keep the supplied official Treatwell widget consent-gated and verify it after every integration
   change. Do not use undocumented endpoints or scraped booking/review data.

No Treatwell credentials, client exports, card information or clinical records belong in Git,
browser storage, D1 content tables or logs.
