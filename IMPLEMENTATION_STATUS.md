# Lumi Derm Implementation Status

**Plan source:** `PROJECT_COMPLETION_AUDIT.md` and `CODEX_IMPLEMENTATION_PLAN.md`

**Baseline commit before implementation:** `9a18550`

**Last updated:** 28 June 2026

## Phase summary

| Phase                                        | Status                                   | Commit                                                | Notes                                                                                              |
| -------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0 — Baseline, documentation and safety rails | COMPLETE WITH RECORDED BASELINE FAILURES | `chore: establish production implementation baseline` | Tooling is installed and locked; existing integrity, lint, and formatting findings remain visible. |
| 1 — Production stabilisation                 | NOT STARTED                              | —                                                     | Recommended next phase after reviewing Phase 0 evidence.                                           |
| 2 — Worker foundation                        | NOT STARTED                              | —                                                     | —                                                                                                  |
| 3 — D1 content/server rendering              | NOT STARTED                              | —                                                     | —                                                                                                  |
| 4 — Access-protected admin API               | NOT STARTED                              | —                                                     | —                                                                                                  |
| 5 — Owner admin UX                           | NOT STARTED                              | —                                                     | —                                                                                                  |
| 6 — R2 media                                 | NOT STARTED                              | —                                                     | —                                                                                                  |
| 7 — Public site completion                   | NOT STARTED                              | —                                                     | —                                                                                                  |
| 8 — Square integration                       | NOT STARTED                              | —                                                     | —                                                                                                  |
| 9 — Google reviews                           | NOT STARTED                              | —                                                     | —                                                                                                  |
| 10 — Marketing/consent                       | NOT STARTED                              | —                                                     | —                                                                                                  |
| 11 — Legal framework                         | NOT STARTED                              | —                                                     | —                                                                                                  |
| 12 — SEO/analytics                           | NOT STARTED                              | —                                                     | —                                                                                                  |
| 13 — Accessibility/performance/security      | NOT STARTED                              | —                                                     | —                                                                                                  |
| 14 — CI/CD/operations                        | NOT STARTED                              | —                                                     | —                                                                                                  |
| 15 — Production acceptance                   | NOT STARTED                              | —                                                     | —                                                                                                  |

## Phase 0 — Baseline, documentation and safety rails

**Execution date:** 28 June 2026

**Status:** Complete with known baseline failures and external verification actions

### Delivered

- [x] Recorded the current static Cloudflare Worker, production domain, direct Square booking embed,
      direct Google map embed, publicly routable browser-only admin, disconnected Git build
      integration, and absence of a backend/database.
- [x] Added `IMPLEMENTATION_STATUS.md` and `MANUAL_ACTIONS_REQUIRED.md`.
- [x] Added architecture, operations, content model, security, and testing documentation.
- [x] Added reproducible Node 22 scripts for local serving, JavaScript syntax checking, static-site
      integrity checking, unit tests, linting, and formatting.
- [x] Added EditorConfig, Prettier, ESLint/TypeScript ESLint, and Stylelint configuration with
      first-party-only scope, plus a reviewed npm lockfile using the public registry.
- [x] Added a static checker for local `href`/`src` targets and fragments, duplicate IDs, missing
      image alt attributes, exactly one H1 per page, and invalid/non-canonical sitemap entries.
- [x] Added unit tests covering a valid site and every checker failure class.
- [x] Added exact Cloudflare Git and Access manual actions based on current official documentation.
- [x] Preserved all public HTML/CSS/content and the approved visual design.
- [x] Did not deploy or push.

### Test evidence

| Command/check          | Result                 | Evidence                                                                                                                                                                       |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check:js`     | PASS                   | 6 first-party JavaScript/module files parsed successfully.                                                                                                                     |
| `npm test`             | PASS                   | 2 tests passed; 0 failed.                                                                                                                                                      |
| `npm run check:site`   | EXPECTED BASELINE FAIL | 5 findings across 12 HTML files; details below.                                                                                                                                |
| `npm run lint:js`      | EXPECTED BASELINE FAIL | 10 findings in legacy `main.js`: 7 errors and 3 warnings. Six errors are removed with GSAP in Phase 1; the remaining exception-handling findings are also assigned to Phase 1. |
| `npm run lint:css`     | EXPECTED BASELINE FAIL | 826 legacy CSS style findings; no rules or files were hidden to create a false pass. Broad mechanical restyling is deferred to the planned design-system phase.                |
| `npm run format:check` | EXPECTED BASELINE FAIL | 22 existing planning/site files are not Prettier-formatted. All new Phase 0 source/configuration/report files pass after targeted formatting.                                  |
| `npm ls --depth=0`     | PASS                   | All seven pinned development dependencies installed at their declared versions.                                                                                                |
| Lockfile review        | PASS                   | `package-lock.json` uses the public npm registry and contains no authentication/password fields.                                                                               |
| `git diff --check`     | PASS                   | No whitespace errors before final staging.                                                                                                                                     |
| `npm run serve`        | PASS                   | With the required local-network permission, the Node server bound successfully at `http://127.0.0.1:8080`; it was then stopped without deploying.                              |

### Visible baseline findings

1. `admin/index.html` has two H1 elements (the gate and application shell).
2. `pages/treatment.html` is a redirect document with no H1.
3. `sitemap.xml` includes the treatment meta-refresh redirect.
4. The same sitemap entry targets a `noindex` page.
5. The same sitemap entry disagrees with that page's canonical URL (`pages/services.html`).

These failures are intentionally not ignored or altered in Phase 0. The sitemap/redirect work is
explicitly assigned to Phase 1. The admin heading will be handled without weakening Access or
changing the approved design.

### Files in the Phase 0 commit

- `.editorconfig`, `.prettierignore`, `.prettierrc.json`, `.stylelintrc.json`
- `eslint.config.js`, `package.json`, `package-lock.json`
- `scripts/check-js-syntax.mjs`, `scripts/check-site.mjs`, `scripts/serve.mjs`
- `test/check-site.test.mjs`
- `IMPLEMENTATION_STATUS.md`, `MANUAL_ACTIONS_REQUIRED.md`
- `docs/ARCHITECTURE.md`, `docs/CONTENT_MODEL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`,
  `docs/TESTING.md`

The two source planning documents were already present as untracked user files and are not included
in the Phase 0 commit unless the owner separately requests that scope.

### Remaining manual actions/blockers

- `CF-ACCESS-001` — **BLOCKING:** protect `/admin/*` with an exact-email Cloudflare Access policy.
- `CF-GIT-001` — **REQUIRED BEFORE LAUNCH:** reconnect and verify Workers Builds.
- `DEV-NPM-001` — **COMPLETE:** pinned tools installed, lockfile reviewed, and baseline lint/format
  findings recorded.

### Recommended next phase

Phase 1 — Production stabilisation. Begin with repository-side sitemap, redirect, cookie/embed,
review-count, accessibility, security-header, and caching work. Cloudflare Access remains an
external launch blocker until `CF-ACCESS-001` is verified.
