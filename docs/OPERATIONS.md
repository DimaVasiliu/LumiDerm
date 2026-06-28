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

At Phase 0, public source/assets are versioned in Git; localStorage admin drafts are not an approved
backup and must contain no real data. D1 and R2 do not yet exist. Phase 3 must add versioned D1
export/import and restore tests; Phase 6 adds R2 inventory/media recovery; Phase 14 adds scheduled,
encrypted backups and evidence of restoration.

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

Cloudflare, GitHub, Square, Google, and Brevo accounts must use owner-controlled recovery methods
and MFA. Recovery codes and credentials are never stored in this repository. Provider secrets are
entered through Cloudflare/Wrangler secret interfaces and rotated according to `docs/SECURITY.md`.

## Operational checks not yet implemented

- automatic build/deploy verification;
- uptime and Worker exception alerts;
- D1/R2 backup and restore;
- integration failure alerts;
- deployment health endpoint and structured release metadata.

These remain scheduled for later phases and must not be reported as live.
