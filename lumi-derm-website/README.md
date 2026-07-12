# Lumi Derm Aesthetics Website

Premium static-first clinic website hosted as Cloudflare Worker assets.

## Current architecture

- Semantic HTML, CSS and vanilla JavaScript in `lumi-derm-website/`.
- Cloudflare Worker static assets configured by the repository-root `wrangler.jsonc`.
- Treatwell is the system of record for booking, availability, payment options, booking clients,
  reminders, consultation forms and booking reviews.
- Google Maps is optional external content controlled by the site's external-media choice.
- `/admin/` is an Access-protected website-content prototype; its current saves remain local browser
  drafts until the Worker/D1 API phases are implemented.

## Booking

The booking page links to the official venue page:

<https://www.treatwell.co.uk/place/lumi-derm-aesthetics/>

The booking page contains the official embedded widget code supplied through Treatwell Connect for
venue `523733`. It is consent-gated and retains the official venue page as a fallback. The project
does not use undocumented booking/review APIs and does not scrape Treatwell.

## Admin boundaries

The admin can draft website offers, public prices, campaign copy, selected reviews, media choices
and public page content. It links to Treatwell Connect for operational tasks. It does not manage or
duplicate appointments, payment records, client history or clinical records.

## Local development

From the repository root:

```bash
npm ci
npm run serve
```

Open <http://127.0.0.1:8080>. Use `npm run dev` for Worker-equivalent local checks.

## Quality commands

```bash
npm run check
npm run lint:js
npm run test:browser
```

See the repository-root `IMPLEMENTATION_STATUS.md`, `MANUAL_ACTIONS_REQUIRED.md` and `docs/`
directory for current architecture, external actions and testing requirements.

## Required external actions

- Verify the official Treatwell widget after deployment.
- Reconcile the website treatment menu with Treatwell.
- Test booking, payment options, reminders, cancellation and rescheduling.
- Confirm Treatwell communication/review features enabled for this account.
- Complete Google Business Profile API approval and OAuth setup.
- Obtain professional review of legal and consent wording.
