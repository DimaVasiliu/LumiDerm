# Security Baseline and Target Controls

## Baseline findings — 28 June 2026

- `/admin/` is publicly routable. Its passcode and authentication decision are implemented in
  browser JavaScript, so they are not a security boundary.
- Admin drafts, subscribers, and other prototype records use browser `localStorage`. Real client,
  subscriber, consultation, or health data must not be entered.
- There is no server-side API, Access JWT verification, role enforcement, CSRF control, audit log,
  rate limit, or database.
- Square booking and Google Maps iframes are loaded by public HTML before a meaningful optional
  consent decision.
- Provider secrets are not required by the current static deployment and none should be added.
- Production response security headers have not yet been established in repository code.

Cloudflare Access protection is a launch blocker and is tracked in `MANUAL_ACTIONS_REQUIRED.md`.

## Authentication and authorisation target

Cloudflare Access protects `/admin/*` and `/api/admin/*`. The Worker independently validates the
`Cf-Access-Jwt-Assertion` issuer, audience, signature, expiry, and identity claims. An explicit
allow-list maps authenticated identities to `owner` or `editor`; production has no shared-password
fallback. Local development authentication is visibly local-only and cannot activate in a production
environment.

State-changing requests require same-origin checks, a CSRF token, validated content type and method,
schema validation, optimistic concurrency, and an audit event. Admin and API responses use
`Cache-Control: no-store`.

## Secrets

- Store API keys, OAuth client secrets, refresh tokens, webhook secrets, and signing material in
  Cloudflare secrets or an approved secret manager.
- Never place secrets in Git, D1 content rows, R2 public objects, HTML, browser JavaScript,
  Markdown, logs, screenshots, fixtures, or chat.
- Ask owners to enter secrets directly through the Cloudflare dashboard or `wrangler secret put`;
  request only non-secret resource IDs and completion status back.
- Rotate a secret after suspected exposure and revoke the old provider credential before resuming
  synchronisation.

## Provider scope assumptions

| Provider                | Minimum intended access                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Cloudflare Access       | authenticate the two explicitly approved admin identities                                        |
| Square                  | no API in baseline; later read-only catalogue/booking/payment access plus only required webhooks |
| Google Business Profile | `business.manage` only when review sync is approved                                              |
| Brevo                   | contacts/campaign operations only if the owner approves custom marketing                         |

## Data classification

| Class      | Examples                                                       | Website handling                                 |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Public     | approved treatment copy, public prices, published reviews      | D1/public HTML after validation                  |
| Internal   | drafts, audit history, media consent references                | Access-protected D1/R2                           |
| Personal   | subscriber identity and consent evidence                       | minimum necessary, protected, retained by policy |
| Prohibited | card data, full consultation/clinical record, passwords/tokens | never store in this platform                     |

Logs use request IDs and operational metadata. They exclude health/treatment details, message
bodies, tokens, complete customer records, and unnecessary personal identifiers.

## Threat assumptions and controls

- Client code and localStorage are attacker-controlled; server-side validation is mandatory.
- Access can be misconfigured; the Worker must fail closed for admin/API routes.
- Imported provider data is untrusted; validate and output-encode it.
- Webhooks are Internet-facing; verify signatures, enforce idempotency, and rate-limit failures.
- Uploaded files can be hostile; validate type, size, dimensions and content, strip metadata where
  appropriate, and serve approved objects through controlled routes.
- Content editors can make stale changes; use version checks and immutable audit records.
- D1/R2/provider outages must not expose drafts, weaken auth, or silently publish stale offers.

## Security headers target

Phase 1 will add and test a resource-specific Content Security Policy,
`X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, `Permissions-Policy`, and
appropriate cache controls. HSTS requires production-domain confirmation before enabling. CSP must
not be weakened with broad wildcards merely to make third-party embeds work.

## Incident outline

1. Preserve timestamps, request IDs, deployment/version IDs, and provider event IDs without copying
   sensitive payloads.
2. Restrict or disable the affected route/integration; revoke leaked credentials immediately.
3. Roll back application code only after checking whether schema/binding changes make rollback
   unsafe.
4. Notify the owner and follow the approved legal/data-breach assessment process.
5. Correct the control, rotate credentials, test, document the incident, and monitor recurrence.
