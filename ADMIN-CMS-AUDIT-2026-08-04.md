# Admin and CMS Audit — 2026-08-04

## Verdict

The admin is already a useful lightweight CMS, but before this pass it only let the clinic owner safely edit homepage hero text, homepage SEO, contact details, offers, prices, reviews, media and email campaigns. The About page and most inner-page intro text were still static HTML, so she could not change them herself.

This pass expands the editable page-text model so she can now manage the copy she specifically asked about: About page copy plus key Treatments and Booking intro/support text.

## What the Admin Can Manage Now

- Homepage hero: eyebrow, headline and lead copy.
- Homepage SEO: title and meta description.
- Contact details: phone, email, address, Instagram and Facebook text/links, applied site-wide when published.
- Offers: create, edit, reorder, draft/live status, images and publish.
- Prices: edit treatment prices, price notes and headline prices, then publish to `prices.json` and the rendered Treatments page.
- Reviews: import, moderate, feature and publish homepage reviews.
- Media: upload/delete reusable images through the Worker/R2 media library.
- Email marketing: compose, test, send and schedule campaigns from published offers.
- Page text added in this pass:
  - About hero.
  - About biography section, including paragraphs and signature.
  - About clinic intro.
  - About concerns and treatments section intro copy.
  - About benefits and journey headings.
  - About CTA text.
  - Treatments page hero intro.
  - Booking page hero, chooser, calendar intro and help strip.

## Implementation Summary

- Expanded `assets/data/content.json` with a `pages` object for About, Treatments and Booking text.
- Added matching fallback defaults in the admin so older/live `content.json` shapes still load safely.
- Added generic `data-content-page` and `data-content-list` binding in the Pages tab.
- Added render helpers in `admin/content-template.js` for simple page heroes, About sections, Booking sections and CTA blocks.
- Added marker comments to the public pages so publishing rewrites only controlled CMS blocks:
  - `ABOUT_*` markers in `pages/about.html`
  - `SERVICES_HERO` marker in `pages/services.html`
  - `BOOKING_*` markers in `pages/booking.html`
- Extended `publishContent()` so it detects page-text changes, commits `content.json`, and renders those marked sections through the existing GitHub Worker publishing proxy.
- Bumped the admin script cache keys for `content-template.js` and `admin.js` so the deployed admin loads the new page-text renderer.
- Fixed a narrow-mobile Settings overflow caused by long system-status values.

## Intentional Limits

I did not make legal, privacy, cookies, policy wording or clinical treatment descriptions generally editable. Those are higher-risk areas where casual wording changes can create compliance, safety or advertising-claims problems.

The current practical split is:

- the clinic owner can edit marketing/page intro copy that changes often.
- Prices and offers remain fully admin-editable.
- Legal and clinical detail copy should remain developer/owner-managed unless a stricter review workflow is added.

## Verification

- `npm run check:js` — PASS.
- `npm run check:site` — PASS.
- `npm test` — PASS, 28 tests.
- `npm run lint:js` — no errors; existing warnings remain.
- `npm run lint:css` — PASS.
- `BASE_URL=http://127.0.0.1:8080 npm run test:admin-browser` — PASS across 390, 768, 1280 and 1600px.
- `content.json` parses as valid JSON.

## Remaining CMS Opportunities

- Add editable inner-page SEO for About, Treatments and Booking if she needs control over Google/share snippets.
- Add a controlled Gallery manager once real approved images/results are ready.
- Add editable FAQ blocks if those will change often, with a claims-review step.
- Add a page-preview mode for draft page text before publishing.
