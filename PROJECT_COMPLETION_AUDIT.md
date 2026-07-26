# Lumi Derm Production Completion Audit

**Revised:** 5 July 2026

## Product decision

Treatwell is the sole operational system for appointments, availability, payment options, booking
clients, reminders, consultation forms and booking reviews. The website is the premium public,
SEO and content layer. It must not become a second booking or client-record platform.

## Current strengths

- Responsive public site with semantic content and local assets.
- Cloudflare Worker static hosting, custom headers and branded 404 handling.
- Cloudflare Access-protected admin route reported operational.
- Detailed treatment and price content.
- External-media consent controls for Google Maps.
- Local review feed with moderation-oriented admin prototype.
- Reproducible syntax, integrity, unit and browser tests.

## Current gaps

1. The official Treatwell widget is integrated locally but still requires production verification.
2. Website treatments/prices are not formally reconciled with the live Treatwell menu.
3. Treatwell booking/payment/cancellation behaviour lacks documented end-to-end acceptance tests.
4. Admin changes still save only in browser storage and do not publish.
5. There is no Worker application API, D1 database or R2 media workflow.
6. Google review API access is pending.
7. Legal wording still requires professional review against final clinic operations.
8. Production headers and automatic deployment must be reverified after the approved migration.

## Required architecture

- Treatwell: operational booking and client source of truth.
- Cloudflare Worker: public rendering, API routing and security controls.
- D1: website content, versions, moderation state and audit records only.
- R2: approved website media only.
- Google Business Profile: Google review source after OAuth approval.
- Cloudflare Access: admin authentication.

## Priority order

1. Approve and deploy the Treatwell-only migration.
2. Verify the widget and reconcile the live treatment menu.
3. Build Worker routing and health endpoints.
4. Add D1 migrations and public/admin content APIs.
5. Replace browser-only admin saves with protected, validated writes.
6. Add R2 media management.
7. Add Google review sync after approval.
8. Finish legal, analytics, accessibility, performance and production acceptance.

## Non-goals

- custom appointment calendar or payment processing;
- duplicated Treatwell clients or appointment history;
- scraping Treatwell pages or reviews;
- storing payment cards or full clinical records;
- claiming unsupported Treatwell APIs, widgets or marketing features.

Detailed owner actions are in `MANUAL_ACTIONS_REQUIRED.md`; technical boundaries are in
`docs/ARCHITECTURE.md`.
