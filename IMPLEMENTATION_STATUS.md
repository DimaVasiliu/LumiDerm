# Lumi Derm Implementation Status

**Updated:** 5 July 2026

## Phase summary

| Phase | Status | Notes |
| --- | --- | --- |
| 0 — Baseline and safety rails | Complete | Tooling, checks and architecture documentation established |
| 1 — Public production stabilisation | Complete | Static integrity, consent controls, SEO, accessibility and security headers added |
| 1A — Treatwell-only migration | Implemented locally, awaiting review | No commit, push or deployment authorised |
| 2 — Worker foundation | Not started | Add Worker entry point and public/admin routing |
| 3 — D1 website content | Not started | Website content only; no booking/client duplication |
| 4 — Access-protected admin API | Not started | Verify Access identity server-side and add audited writes |
| 5 — Owner admin UX | Prototype only | Replace browser drafts with the protected API |
| 6 — R2 media | Not started | Approved website media only |
| 7 — Public site completion | In progress | Official Treatwell widget integrated locally; catalogue verification remains manual |
| 8 — Treatwell operations | External/manual | Treatwell is the booking, payment and client system of record |
| 9 — Google reviews | Awaiting Google approval | OAuth integration begins only after access is granted |
| 10–15 — Marketing, legal, SEO, QA and launch | Not started | Follow the revised implementation plan |

## Treatwell-only migration delivered locally

- Replaced the booking iframe with the official Lumi Derm Treatwell venue link.
- Integrated the official Treatwell embedded widget supplied from Treatwell Connect.
- Kept the widget consent-gated with the official venue page as a fallback link.
- Removed provider-specific payment promises; Treatwell displays applicable checkout options.
- Updated homepage FAQ, chatbot, privacy and cookie wording.
- Removed the former booking provider from CSP and Permissions Policy.
- Updated browser/static tests for external Treatwell booking and consent-controlled Google Maps.
- Redesigned the admin so operational booking/client actions open Treatwell Connect.
- Removed browser-based subscriber management to avoid duplicating Treatwell client records.
- Kept offers, public prices, campaign copy, selected reviews, media and page content as website
  draft capabilities.
- Updated architecture, content model, operations, security, testing and owner-action documents.

## Current boundaries

- Treatwell owns appointments, availability, payment options, booking clients, reminders,
  consultation forms and booking reviews.
- The website owns public presentation, SEO content, offers, public price display, selected reviews
  and approved media.
- The website does not store card details, booking records or complete clinical records.
- Treatwell data is not scraped and no undocumented integration is used.

## Remaining blockers

- `TREATWELL-WIDGET-001`: verify the supplied official widget after an approved deployment.
- `TREATWELL-CATALOG-001`: reconcile website names, prices and durations with the live menu.
- `TREATWELL-FLOW-001`: verify booking, payment, cancellation and confirmation end to end.
- `CF-HEADERS-001`: verify security headers after an approved deployment.
- `GOOGLE-GBP-001`: wait for Business Profile API approval before implementing review sync.

## Verification evidence

Run locally on 5 July 2026 without committing, pushing or deploying:

- JavaScript syntax: pass (11 files).
- Site integrity: pass (13 HTML files).
- Unit and static tests: pass (8/8).
- JavaScript lint: pass with three warnings in the pre-existing uncommitted chatbot.
- Browser matrix: pass for home, services, booking and legal pages at 320, 390, 768, 1024,
  1440 and 1920 px.
- Browser interactions: pass for consent, navigation, carousels, modals, reduced motion, the
  branded 404 and the external Treatwell booking link.
- Horizontal overflow: none detected in the browser matrix.
- `git diff --check`: pass.
- First-party Square reference scan: pass. An unrelated archived Instagram HTML snapshot remains
  unchanged.
- CSS lint: existing repository debt remains (938 findings); no bulk autofix was applied because it
  would rewrite unrelated design work.
- Prettier check: existing repository baseline remains unformatted (30 files); no bulk formatter
  was applied for the same reason.

## Recommended next phase

After this migration diff is approved, begin Phase 2: Worker foundation. D1 should store website
content and audit records only. Treatwell remains external and authoritative for operational data.
