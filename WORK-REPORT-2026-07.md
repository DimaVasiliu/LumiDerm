# Production Hardening — Work Report

_Follow-up to `AUDIT-2026-07.md`. Everything code-related that could be done from the repo has been done and verified. Below: what was done, what you must do manually, and what's deliberately deferred._

---

## ✅ Done (code changes, in the repo, ready to deploy)

1. **Admin re-login CSP fix.** Added `https://*.cloudflareaccess.com` to the `connect-src` policy in `lumi-derm-website/_headers`. When an admin's Cloudflare Access session expires, the re-login redirect is now allowed instead of throwing the confusing CSP console error you saw.

2. **Deploy pipeline hardened** (`.github/workflows/deploy-worker.yml`). Previously it deployed after only a JavaScript syntax check. Now, before every deploy it:
   - runs the full check suite (`npm run check` = syntax + site checks + tests),
   - runs the JavaScript linter (`npm run lint:js`),
   - regenerates the sitemap with fresh `<lastmod>` dates (full git history via `fetch-depth: 0`).
   A failing test can no longer ship to production, and the sitemap stays current automatically.

3. **Signup abuse protection.** `/api/subscribe` is now IP rate-limited (max 10 signups per IP per hour) on top of the existing honeypot and double opt-in. Matches the protection already on review submissions.

4. **Google rich-result stars (SEO).** Added `AggregateRating` (5.0 / 47) and three real `Review` entries to the homepage JSON-LD so your star rating is eligible to appear in Google search results. Updated the CSP script hash to match.

5. **Regression tests.** Exported the pure, security-critical Worker helpers and added `test/worker-helpers.test.mjs` (8 tests) covering campaign-link safety / anti-open-redirect, non-http scheme rejection, topic mapping, and input validation. The suite is now **28 tests, all passing**.

6. **Lint cleanup.** Fixed 8 pre-existing JavaScript lint errors (empty catch blocks, unused vars, browser globals in a test script) so the new JS-lint CI gate passes cleanly.

7. **Docs housekeeping.** Archived 5 stale planning/status docs to `docs/archive/` (`IMPLEMENTATION_STATUS`, `PROJECT_COMPLETION_AUDIT`, `CODEX_IMPLEMENTATION_PLAN`, `MANUAL_ACTIONS_REQUIRED`, `PLATFORM_AUDIT_REPORT`).

### Verified locally
- `npm run check` → **PASS** (syntax + site checks + 28 tests)
- `npm run lint:js` → **PASS**
- `node --check src/worker.js` → **OK**
- Homepage JSON-LD parses as valid JSON; CSP hash matches it.

### To deploy (you run, from `~/Desktop/LumiDerm`)
```
git add -A && git commit -m "Production hardening: CSP, CI test gate, subscribe rate limit, review schema, tests" && git push
```
No migration needed. CI will run the checks and deploy. (If you ever see a red CI run, it now means a real test/lint failure caught *before* it reached the live site — that's the point.)

---

## 🔧 Must do manually (account / DNS / Cloudflare — I cannot do these from code)

1. **Email authentication: SPF, DKIM, DMARC** for your sending domain in Resend. **Highest priority** — without these, campaigns land in spam and hurt your domain reputation. Resend's dashboard shows the exact DNS records to add at your registrar.
2. **Confirm all Cloudflare secrets/bindings are set:** `RESEND_API_KEY`, `UNSUB_SECRET`, `GITHUB_TOKEN`, `ADMIN_EMAILS`, `ADMIN_OWNER_EMAILS`/`ADMIN_EDITOR_EMAILS`, D1 + KV + R2 (`MEDIA`) bindings, `FROM_EMAIL`/`REPLY_TO`/`SITE_ORIGIN`. Also the CI secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
3. **Scheduled subscriber-data backup.** D1 has ~30-day point-in-time restore (Time Travel) built in, but set a routine offsite copy too — e.g. monthly "Export confirmed (CSV)" from the Subscribers tab, kept securely. (GDPR resilience.)
4. **Set a real admin passcode** in Settings → passcode (don't leave the shipped default). Cloudflare Access is the real gate, so this is low-risk, but do it.
5. **Google Reviews (when the API key arrives):** `npx wrangler secret put GOOGLE_PLACES_API_KEY`, and add `GOOGLE_PLACE_ID` as a Var in the Cloudflare dashboard. The "Import from Google" button activates automatically.
6. **After deploy, test the rich results:** paste your homepage into <https://search.google.com/test/rich-results> to confirm the review stars are detected.

---

## 🕒 Deferred code work (larger / optional — P2, not blocking launch)

- **Migrations:** keep strictly sequential from `0012` onward. The two `0006_*` files already applied fine — just never reuse a number.
- **Full Google review history:** current Places API returns ~5 recent reviews; the OAuth Business Profile API returns all. Bigger integration; do it if you want the complete archive.
- **SEO controls expansion:** per-page titles/meta (homepage only today), plus editable opening hours and legal snippets via the same marker pattern.
- **Formal accessibility + Lighthouse pass** (axe/Lighthouse) for a documented score.
- **Monitoring:** error tracking (Cloudflare logs/Sentry), uptime check, and Resend bounce/complaint alerts.
- **Stylelint:** ~2,557 pre-existing cosmetic CSS nits (`--fix` handles most). Purely stylistic; not gated in CI on purpose.
- **Expand automated tests** further (route-level, preference enforcement, analytics) — the existing mock harness in `test/worker-routes.test.mjs` supports it.

---

_Bottom line: every code-side P1 item from the audit is done and verified. What remains is DNS/secrets/account configuration (yours to do) plus optional P2 enhancements._
