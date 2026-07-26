# Lumi Derm Production Implementation Plan

## Fixed decisions

1. Treatwell is the system of record for booking, availability, payments, booking clients,
   reminders, consultation forms and booking reviews.
2. The custom platform manages public website content only.
3. Cloudflare Access protects admin; the Worker validates identity before writes.
4. D1 stores content, versions, moderation and audit data, not duplicated booking/clinical data.
5. R2 stores approved website media.
6. No undocumented Treatwell API, scraping or invented widget code is allowed.

## Phase 1A — Treatwell-only migration

- Remove obsolete provider links, iframe, copy, CSP origins, tests and admin controls.
- Integrate the official venue link and consent-gated Treatwell widget supplied by the owner.
- Update legal, FAQ, chatbot and payment wording.
- Update reports and owner-action instructions.
- Run static, unit, lint and browser checks.
- Stop for review; do not commit, push or deploy without approval.

## Phase 2 — Worker foundation

- Add a typed Worker entry point while retaining static asset fallback.
- Route `/api/public/*`, `/api/admin/*` and health checks explicitly.
- Add request IDs, safe errors, structured logs and security headers.
- Add local Worker tests and failure-path tests.

## Phase 3 — D1 content

- Add migrations for treatments, prices, offers, settings, reviews, versions and audit logs.
- Seed from approved checked-in content.
- Render crawlable published content with a static fallback.
- Add versioned, validated public reads.

## Phase 4 — Protected admin API

- Validate Cloudflare Access identity server-side.
- Add CSRF protection, schema validation, optimistic concurrency and append-only audit logs.
- Deny writes if Access configuration is missing.

## Phase 5 — Owner admin UX

- Replace browser-only saves with the protected API.
- Provide simple publish/draft/archive flows, previews and recovery messages.
- Keep Treatwell operations as clear outbound actions, never simulated controls.

## Phase 6 — R2 media

- Validate type, dimensions and size before upload.
- Store alt text, source and consent reference in D1.
- Publish only approved media through controlled URLs.

## Phase 7 — Public completion

- Verify the official Treatwell widget on mobile and desktop after deployment.
- Reconcile public names, prices, durations and policy wording with Treatwell.
- Add service-specific booking links only when officially supported.
- Complete real photography, gallery consent and local SEO.

## Phase 8 — Google reviews

- Wait for API approval.
- Configure OAuth with least privilege using Cloudflare secrets.
- Sync source reviews into a pending moderation queue.
- Preserve source text and provenance; moderation controls visibility only.

## Phase 9 — Marketing and consent

- Confirm Treatwell communication features with Partner Support.
- Keep campaign copy drafts separate from sending.
- If an independent newsletter is approved, add explicit opt-in, consent evidence, unsubscribe and
  deletion workflows with an approved sender. Never infer marketing consent from bookings.

## Phase 10 — Production acceptance

- Complete legal review and owner sign-off.
- Verify mobile/tablet/desktop accessibility and Core Web Vitals.
- Test Treatwell booking flow on mobile and desktop.
- Verify Access allow/deny behaviour, backups, headers, 404s and automatic deployment.
- Record rollback and incident procedures.

For every external blocker, update `MANUAL_ACTIONS_REQUIRED.md` with exact non-secret values and
verification evidence. Never request credentials, tokens, card data or client exports in chat.
