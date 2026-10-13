# Operations Runbook

## Current service

- Production: <https://lumidermaesthetics.com>
- Cloudflare Worker name: `lumiderm`
- Static asset root: `lumi-derm-website/`
- Wrangler configuration: `wrangler.jsonc`
- Production branch: `main`
- Phase 0 implementation baseline: commit `5159f48`

The audit reports that Cloudflare's Git integration is disconnected. Until the action in
`MANUAL_ACTIONS_REQUIRED.md` is completed and verified, pushes do not have a trusted automatic
deployment path. Do not deploy or push without explicit owner approval.

## Local verification

```bash
npm ci
npm run sitemap
npm run check:js
npm run check:site
npm test
npm run lint
npm run format:check
npm run dev
npm run test:browser
```

The Phase 1 integrity and JavaScript gates pass. CSS lint and formatting baselines are recorded in
`IMPLEMENTATION_STATUS.md`; they must not be suppressed. Use Wrangler for header/custom-404 checks;
`npm run serve` remains available for simple static inspection.

## Deployment (approval required)

1. Confirm `git status --short` contains only reviewed phase files.
2. Run all quality gates and document any approved exception.
3. Review `git diff --check` and the exact commit being released.
4. Obtain explicit approval to deploy.
5. For a manual deployment, authenticate Wrangler outside Git and run `npx wrangler deploy` from the
   repository root.
6. Record the Worker version/deployment ID and commit SHA.
7. Smoke-test the home page, booking fallback, legal pages, and Access-protected admin.

After Git integration is restored, a push to `main` is expected to run the configured Workers Build.
Verify the build in Worker **Deployments / Build history** and confirm the version is active; do not
infer success from Git alone.

## Rollback

Cloudflare rollback immediately changes production traffic and therefore requires owner or
incident-authority approval.

Dashboard procedure:

1. Open Cloudflare dashboard -> **Workers & Pages** -> **lumiderm** -> **Deployments**.
2. Identify the last verified healthy version by recorded version ID and commit SHA.
3. Use the version's three-dot menu -> **Rollback** and confirm.
4. Re-run production smoke checks and record the newly active deployment ID.

CLI procedure, when a reviewed target version ID is known:

```bash
npx wrangler rollback VERSION_ID --name lumiderm
```

Worker rollback does not revert D1 data or recreate deleted/changed bindings. Once application data
exists, follow the phase-specific database restore/migration plan before rolling code across schema
changes.

## Backups

Public source/assets are versioned in Git; localStorage admin drafts are not an approved backup and
must contain no real data. Production client/subscriber data now lives in Cloudflare D1
(`lumidermdb`) plus the suppression KV namespace.

Before any migration, destructive data operation, or schema cleanup, export the remote D1 database:

```bash
npx wrangler d1 export lumidermdb --remote --output .wrangler/d1-backups/lumidermdb-YYYY-MM-DDTHHMMZ.sql
```

Keep D1 exports out of Git. `.wrangler/` is ignored and is the preferred local holding area because
exports may contain personal data. Verify the export file exists, record its size and SHA-256 in the
work report, and do not paste exported rows into tickets, chats, or commit messages.

## Live Price Content

Treatment prices are authoritative in D1. The checked-in `services.html` price marker is only a
shell for Worker injection, and `assets/data/prices.json` is not a runtime fallback. If
`site_content.prices` or `site_content` key `frag:PRICES` is missing, the public treatments page
must show a temporary unavailable response instead of stale prices.

Recovery options:

1. Republish the Prices section from the admin after confirming the current prices.
2. Restore `site_content.prices` and `frag:PRICES` from a verified D1 export.
3. If neither exists, keep the treatments page unavailable until the clinic owner confirms the
   current price list.

## D1 Migration Safety

The current migration sequence is a historical record of what has already been applied to the live
D1 database. Leave existing filenames and numbering alone.

Known hazards:

- `migrations/0006_preferences_campaign_tracking.sql` and
  `migrations/0006_review_submissions.sql` intentionally share the `0006` prefix. Both are already
  recorded in D1's migration table; renaming either file would make Wrangler see a different
  migration name and may attempt to run it again.
- `migrations/0011_reset_reviews.sql` contains an unguarded `DELETE FROM reviews;`. It was used to
  clear the seeded reviews table after reviews moved to the static feed. Do not replay it against a
  database that may contain new D1-managed reviews.
- The sequence contains 11 non-idempotent `ALTER TABLE ... ADD COLUMN` statements. Replaying one
  after its column already exists will abort the migration batch part way through.

Operational rules:

1. Never rename, reorder, squash, or edit already-applied migration files.
2. New migrations must use the next unused number and must be written to tolerate partial/manual
   recovery where possible.
3. Always run a remote D1 export before `npx wrangler d1 migrations apply lumidermdb --remote`.
4. If a migration apply fails, stop. Do not retry blindly. Inspect the live schema and D1 migration
   table, then write a forward-only repair migration or restore from the verified export.
5. For a fresh database, do not assume the legacy sequence is safely replayable. Prefer restoring a
   known-good export or creating a new consolidated baseline migration for new environments.

## Incident handling

1. Confirm impact using the home page, booking fallback, `/api/health` when implemented, and
   Cloudflare logs without capturing customer payloads.
2. If admin exposure is suspected, disable or Access-protect `/admin/*`; do not rely on the browser
   passcode.
3. If a provider credential may be exposed, revoke/rotate it at the provider and update the
   Cloudflare secret directly.
4. Roll back only after checking binding/schema compatibility.
5. Record timeline, affected version, evidence, mitigation, owner notification, and follow-up.

## Account recovery and secrets

Cloudflare, GitHub, Treatwell, Google, and any approved email-provider accounts must use owner-controlled recovery methods
and MFA. Recovery codes and credentials are never stored in this repository. Provider secrets are
entered through Cloudflare/Wrangler secret interfaces and rotated according to `docs/SECURITY.md`.

## Operational checks not yet implemented

- automatic build/deploy verification;
- uptime and Worker exception alerts;
- D1/R2 backup and restore;
- integration failure alerts;
- deployment health endpoint and structured release metadata.

These remain scheduled for later phases and must not be reported as live.
