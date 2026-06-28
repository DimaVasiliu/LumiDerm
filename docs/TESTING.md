# Testing Guide

## Prerequisites

- Node.js 22.x and npm 10.x (the supported range is enforced in `package.json`).
- Install the locked development tools with `npm ci` after `package-lock.json` exists.
- Python is not required for the standard local server.

## Commands

| Command                   | Purpose                                                                                                          | Expected use               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `npm run serve`           | Serve `lumi-derm-website/` at `http://127.0.0.1:8080`                                                            | Local visual/manual checks |
| `npm run dev`             | Serve through Wrangler at `http://127.0.0.1:8787` with `_headers` and custom 404 behaviour                       | Worker-equivalent checks   |
| `npm run sitemap`         | Regenerate canonical sitemap entries and `lastmod` values                                                        | After public route changes |
| `PORT=8090 npm run serve` | Serve on another port                                                                                            | Parallel/local automation  |
| `npm run check:js`        | Parse all first-party JavaScript with the current Node runtime                                                   | Fast syntax gate           |
| `npm run check:site`      | Check local `href`/`src`, fragments, duplicate IDs, image alt attributes, one H1 per HTML page, and sitemap URLs | Static integrity gate      |
| `npm test`                | Run Node unit tests for repository tooling                                                                       | Every change               |
| `npm run test:browser`    | Run the Phase 1 browser matrix in installed Chrome against `npm run dev`                                         | Public UX regression gate  |
| `npm run lint`            | Run ESLint and Stylelint                                                                                         | Code quality gate          |
| `npm run format:check`    | Check supported source/docs with Prettier                                                                        | Formatting gate            |
| `npm run check`           | Run syntax, site integrity, and unit tests                                                                       | Core local gate            |

`npm run check:site` is green after Phase 1. CSS lint and repository-wide formatting still expose
the recorded legacy baselines; do not suppress those findings or mechanically restyle the approved
design outside its assigned phase.

The browser runner covers home, services, booking and policies at 320, 390, 768, 1024, 1440 and 1920
px. It also checks custom 404 status, initial embed blocking, consent persistence/withdrawal,
one-time booking load, skip-link focus, mobile navigation, carousel keyboard/pause behaviour, modal
focus/Escape handling and reduced motion. Screenshots are written to
`/private/tmp/lumiderm-phase1-screenshots` and must be visually reviewed.

## Static checker scope

The checker treats `lumi-derm-website/` as the deployed root. It scans every HTML file, validates
local `href` and `src` targets (including HTML fragments), requires every `img` to carry an `alt`
attribute, detects duplicate IDs, and requires exactly one H1 per page. Sitemap URLs must be HTTPS,
use the canonical apex origin, have no query/fragment, be unique, and map to a local page.

Empty `alt=""` remains valid for genuinely decorative images; accessibility review must confirm that
use. Remote links are not fetched by this deterministic local check.

## Manual baseline smoke test

1. Run `npm run serve`.
2. Open `/`, `/pages/services.html`, `/pages/booking.html`, `/pages/policies.html`, and `/admin/`.
3. Confirm CSS, JavaScript, icons, and images load locally.
4. Do not submit a live booking or enter real data in admin.
5. Confirm the Square new-tab link is present; do not claim booking/payment success without an
   owner-authorised transaction.
6. Stop the server with Ctrl+C.

## Future quality gates

Phase 1 adds responsive, keyboard, reduced-motion, consent, and embed-request verification. Later
phases add HTML validation, axe, Playwright owner journeys, Worker/D1 integration tests, visual
regression, provider fixtures, and production smoke tests. Required viewports are documented in
`CODEX_IMPLEMENTATION_PLAN.md` and must not be reduced to make tests pass.

## Recording evidence

Every phase entry in `IMPLEMENTATION_STATUS.md` records the command, date, result, and unresolved
failure count. External tests belong in `MANUAL_ACTIONS_REQUIRED.md` until verified. Screenshots and
fixtures must contain no secrets, card information, client health information, or unapproved
personal data.
